import { describe, expect, test, vi } from "vitest";
import { CommentsSession } from "./CommentsSession";
import type { Comment, Author } from "../formats/types";
import type { ReviewMarker } from "../comments/review";
import type { BeginResult, CommentList, CommentRequest, CommentReply, SavedStatus } from "../main/comments/service";

const identity = { root: "/repo", canvas: "a", path: ".doan/canvases/a.html" };
const codex: Author = { kind: "agent", name: "codex" };
const since = "2026-10-25T00:00:00.000Z";
const resolved = (id: string, at: string, by: Author = codex): Comment => ({
  comment: id, body: `Body ${id}`, status: "resolved", target: { frame: "hero" }, canvasHash: "h", createdBy: { kind: "human", name: "Kim Doe" },
  createdAt: "2026-10-24T00:00:00.000Z", updatedAt: at, resolvedBy: by, resolvedAt: at,
});
const reopened = (comment: Comment, by: Author = { kind: "human", name: "A" }): Comment => {
  const { resolvedBy: _by, resolvedAt: _at, ...rest } = comment;
  return { ...rest, status: "open", lastResolution: { by: comment.resolvedBy!, at: comment.resolvedAt!, reopenedBy: by, reopenedAt: "2026-10-25T09:00:00.000Z" } };
};
const one = resolved("c1", "2026-10-25T01:00:00.000Z"), two = resolved("c2", "2026-10-25T02:00:00.000Z"), three = resolved("c3", "2026-10-25T03:00:00.000Z");
function reply<T>(r: CommentRequest, value: T): CommentReply<T> { return { ok: true, identity: r, value }; }

function fixture(initial: Comment[] = [one, two, three], marker: ReviewMarker = { since }) {
  let comments = initial;
  // main's store: it only raises.
  const store = new Map<string, string>();
  const markerOf = (root: string, canvas: string): ReviewMarker => {
    const at = store.get(`${root}\u0000${canvas}`);
    return at === undefined ? { since: marker.since, ...(marker.lastReviewedAt ? { lastReviewedAt: marker.lastReviewedAt } : {}) } : { since: marker.since, lastReviewedAt: at };
  };
  const api = {
    commentsList: vi.fn(async (r: CommentRequest) => reply<CommentList>(r, { project: 7, canvasHash: "h", comments, warnings: [] })),
    commentsAuthor: vi.fn(async (r: CommentRequest) => reply<Author>(r, { kind: "human", name: "A" })),
    commentsBegin: vi.fn(async (r: CommentRequest) => reply<BeginResult>(r, { origin: "opaque", project: 7, generation: "loader1", hash: "h", target: { frame: "hero" } })),
    commentsMutate: vi.fn(async (r: CommentRequest) => reply<SavedStatus>(r, { state: "saved" })),
    commentsStatus: vi.fn(async (r: CommentRequest) => reply<SavedStatus>(r, { state: "absent" })),
    commentsCopy: vi.fn(async (r: CommentRequest) => reply<{ copied: true }>(r, { copied: true })),
    setCommentDraftGuard: vi.fn(async () => {}),
    reviewMarker: vi.fn(async (root: string, canvas: string) => markerOf(root, canvas)),
    raiseReviewMarker: vi.fn(async (root: string, canvas: string, at: string) => {
      const key = `${root}\u0000${canvas}`;
      if (at > (store.get(key) ?? marker.lastReviewedAt ?? marker.since)) store.set(key, at);
      return markerOf(root, canvas);
    }),
  };
  const session = new CommentsSession(api, () => {});
  return { session, api, set: (next: Comment[]) => { comments = next; } };
}
const step = (s: CommentsSession) => {
  const run = s.review!;
  return { at: run.state.cursor + 1, of: run.state.steps.length, comment: run.state.steps[run.state.cursor]!.comment, mark: run.state.steps[run.state.cursor]!.mark };
};
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

describe("the review notice's count", () => {
  test("counts resolves since this device started keeping review times, and tells a first-seen canvas apart", async () => {
    const { session: s } = fixture();
    await s.open(identity);
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c1", "c2", "c3"]);
    expect(s.marker).toEqual({ since });
  });

  test("leaves out the person's own resolves and waits for the Git name before counting", async () => {
    const { session: s, api } = fixture([one, resolved("mine", "2026-10-25T04:00:00.000Z", { kind: "human", name: "A" })]);
    let answer: (() => void) | undefined;
    api.commentsAuthor.mockImplementationOnce(r => new Promise(resolve => { answer = () => resolve(reply(r, { kind: "human", name: "A" })); }));
    const opening = s.open(identity);
    await vi.waitFor(() => expect(s.list).not.toBeNull());
    expect(s.pendingReview()).toEqual([]);
    answer?.(); await opening;
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c1"]);
  });

  test("holds the count while the Git name read failed, so the person's own resolves never show (R-B ⚪1)", async () => {
    const { session: s, api } = fixture([one, resolved("mine", "2026-10-25T04:00:00.000Z", { kind: "human", name: "A" })]);
    api.commentsAuthor.mockImplementationOnce(async () => { throw new Error("spawn git ENOENT"); });
    await s.open(identity);
    expect(s.author.status).toBe("failed");
    expect(s.pendingReview()).toEqual([]);
    expect(s.startReview()).toBe(false);
    await s.retryAuthor();
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c1"]);
  });

  test("reads the marker again on demand (a hidden window shown, or a restart reading the store)", async () => {
    const { session: s, api } = fixture();
    await s.open(identity);
    api.reviewMarker.mockImplementationOnce(async () => ({ since, lastReviewedAt: two.resolvedAt! }));
    await s.readMarker();
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c3"]);
    const restarted = fixture([one, two, three], { since, lastReviewedAt: one.resolvedAt! }).session;
    await restarted.open(identity);
    expect(restarted.pendingReview().map(c => c.comment)).toEqual(["c2", "c3"]);
  });

  test("an older marker read cannot replace a newer one", async () => {
    const { session: s, api } = fixture();
    await s.open(identity);
    let late: (() => void) | undefined;
    api.reviewMarker.mockImplementationOnce(() => new Promise(resolve => { late = () => resolve({ since }); }));
    const old = s.readMarker();
    api.reviewMarker.mockImplementationOnce(async () => ({ since, lastReviewedAt: three.resolvedAt! }));
    await s.readMarker();
    late?.(); await old;
    expect(s.pendingReview()).toEqual([]);
  });
});

describe("a Review", () => {
  test("does not start while a draft is open", async () => {
    const { session: s } = fixture();
    await s.open(identity);
    await s.create("canvas");
    expect(s.startReview()).toBe(false);
    expect(s.review).toBeNull();
  });

  test("Next raises the last review time to the step passed, Previous does not lower it, Esc keeps that progress", async () => {
    const { session: s, api } = fixture();
    await s.open(identity);
    expect(s.startReview()).toBe(true);
    expect(step(s)).toEqual({ at: 1, of: 3, comment: "c1", mark: "resolved" });
    s.moveReview("next");
    expect(api.raiseReviewMarker).toHaveBeenLastCalledWith("/repo", "a", one.resolvedAt);
    // The notice reads the raise at once, before main answers.
    expect(s.marker?.lastReviewedAt).toBe(one.resolvedAt);
    s.moveReview("previous");
    expect(step(s).at).toBe(1);
    expect(api.raiseReviewMarker).toHaveBeenCalledTimes(1);
    s.moveReview("next"); s.moveReview("next");
    expect(api.raiseReviewMarker).toHaveBeenLastCalledWith("/repo", "a", two.resolvedAt);
    s.moveReview("close");
    expect(s.review).toBeNull();
    await settled();
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c3"]);
    expect(s.reviewDone).toBeNull();
  });

  test("Done raises to the end of the fixed set; arrivals during Review join as 2 of 4 but stay outside Done", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview(); s.moveReview("next");
    const four = resolved("c4", "2026-10-25T05:00:00.000Z");
    f.set([one, two, three, four]); await s.read();
    expect(step(s)).toMatchObject({ at: 2, of: 4 });
    s.moveReview("next");
    s.moveReview("done");
    expect(step(s).at).toBe(3);
    s.moveReview("next");
    s.moveReview("done");
    expect(api.raiseReviewMarker).toHaveBeenLastCalledWith("/repo", "a", three.resolvedAt);
    expect(s.review).toBeNull();
    expect(s.reviewDone).toMatchObject({ text: "Reviewed 3", reopened: [] });
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c4"]);
  });

  test("Done's summary stays for an arrival this Review saw, and clears for a resolve it did not see, on another canvas, or on close", async () => {
    const f = fixture([one]);
    const { session: s } = f;
    await s.open(identity);
    s.startReview();
    const four = resolved("c4", "2026-10-25T05:00:00.000Z");
    f.set([one, four]); await s.read();
    s.moveReview("next"); s.moveReview("done");
    expect(s.reviewDone?.text).toBe("Reviewed 1");
    await s.read();
    expect(s.reviewDone).not.toBeNull();
    f.set([one, four, resolved("c5", "2026-10-25T06:00:00.000Z")]); await s.read();
    expect(s.reviewDone).toBeNull();
    s.startReview(); s.moveReview("next"); s.moveReview("done");
    expect(s.reviewDone).not.toBeNull();
    s.closeDone();
    expect(s.reviewDone).toBeNull();
    f.set([one, four, resolved("c5", "2026-10-25T06:00:00.000Z"), resolved("c6", "2026-10-25T07:00:00.000Z")]); await s.read();
    expect(s.startReview()).toBe(true); s.moveReview("done");
    expect(s.reviewDone).not.toBeNull();
    await s.open({ ...identity, canvas: "b", path: ".doan/canvases/b.html" });
    expect(s.reviewDone).toBeNull();
  });

  test("Done's summary clears when a comment it saw is resolved again after Done (R-B B-1)", async () => {
    const f = fixture([one, two]);
    const { session: s } = f;
    await s.open(identity);
    s.startReview();
    await s.reopenStep();
    f.set([reopened(one), two]); await s.read();
    s.moveReview("next"); await settled();
    s.moveReview("done"); await settled();
    expect(s.reviewDone?.text).toBe("Reviewed 2 · Reopened 1");
    f.set([resolved("c1", "2026-10-25T05:00:00.000Z"), two]); await s.read();
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c1"]);
    expect(s.reviewDone).toBeNull();
  });

  test("a reload or a move keeps the step by comment id; another canvas ends Review and keeps the progress", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview(); s.moveReview("next");
    f.set([three, one, two]); await s.read();
    expect(step(s)).toMatchObject({ at: 2, comment: "c2" });
    await s.rename(".doan/canvases/moved/a.html");
    expect(step(s)).toMatchObject({ at: 2, comment: "c2" });
    await s.open({ ...identity, canvas: "b", path: ".doan/canvases/b.html" });
    expect(s.review).toBeNull();
    await s.open(identity);
    expect(api.raiseReviewMarker).toHaveBeenCalledTimes(1);
    expect(s.pendingReview().map(c => c.comment)).toEqual(["c2", "c3"]);
  });

  test("closeReview ends it without a raise (going Home)", async () => {
    const { session: s, api } = fixture();
    await s.open(identity);
    s.startReview();
    s.closeReview();
    expect(s.review).toBeNull();
    expect(api.raiseReviewMarker).not.toHaveBeenCalled();
  });

  test("marks a step reopened or deleted elsewhere and keeps the last copy of a deleted comment", async () => {
    const f = fixture();
    const { session: s } = f;
    await s.open(identity);
    s.startReview();
    f.set([reopened(one, codex), three]); await s.read();
    expect(s.review?.state.steps.map(item => item.mark)).toEqual(["reopenedElsewhere", "deleted", "resolved"]);
    expect(s.reviewComment("c2")?.body).toBe("Body c2");
  });

  test("Reopen reopens the step's comment and marks it Reopened", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview();
    api.commentsMutate.mockImplementationOnce(async r => { f.set([reopened(one), two, three]); return reply(r, { state: "saved" }); });
    await s.reopenStep();
    expect(api.commentsMutate.mock.lastCall?.[0]).toMatchObject({ intent: { type: "reopen", comment: "c1" } });
    expect(step(s)).toMatchObject({ at: 1, mark: "reopened" });
    s.moveReview("next"); s.moveReview("next"); s.moveReview("done");
    expect(s.reviewDone).toMatchObject({ text: "Reviewed 3 · Reopened 1", reopened: ["c1"] });
  });

  test("Save and reopen from Edit and reopen… marks the step Reopened too", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview();
    s.edit("c1"); s.body("Changed");
    api.commentsMutate.mockImplementationOnce(async r => { f.set([{ ...reopened(one), body: "Changed" }, two, three]); return reply(r, { state: "saved" }); });
    await s.save(true);
    expect(api.commentsMutate.mock.lastCall?.[0]).toMatchObject({ intent: { type: "edit-reopen", comment: "c1" } });
    expect(step(s).mark).toBe("reopened");
  });

  test("a read issued before the person's second Reopen cannot turn the step back to resolved (R-F F-2)", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview();
    api.commentsMutate.mockImplementationOnce(async r => { f.set([reopened(one), two, three]); return reply(r, { state: "saved" }); });
    await s.reopenStep();
    const again = resolved("c1", "2026-10-25T07:00:00.000Z");
    f.set([again, two, three]); await s.read();
    expect(step(s).mark).toBe("resolved");
    // A read in flight that will still show the agent's second resolve.
    let stale: (() => void) | undefined;
    api.commentsList.mockImplementationOnce(r => new Promise(resolve => { stale = () => resolve(reply(r, { project: 7, canvasHash: "h", comments: [again, two, three], warnings: [] })); }));
    const old = s.read();
    api.commentsMutate.mockImplementationOnce(async r => { f.set([reopened(again), two, three]); return reply(r, { state: "saved" }); });
    await s.reopenStep();
    stale?.(); await old;
    expect(step(s).mark).toBe("reopened");
  });

  // Code review 🟡1: main sends the invalidation right after the append, so its read can answer before the write does.
  test("the person's Reopen stays Reopened when the invalidation's read answers before the write's reply", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview();
    let answer: (() => void) | undefined;
    api.commentsMutate.mockImplementationOnce(r => new Promise(resolve => { answer = () => resolve(reply(r, { state: "saved" })); }));
    const reopening = s.reopenStep();
    await settled();
    f.set([reopened(one), two, three]); await s.read();
    answer?.(); await reopening;
    expect(step(s).mark).toBe("reopened");
    s.moveReview("next"); s.moveReview("next"); s.moveReview("done");
    expect(s.reviewDone?.text).toBe("Reviewed 3 · Reopened 1");
  });

  test("the person's Reopen stays Reopened after Review moved on before the reply, and a card's Reopen of another step counts too", async () => {
    const f = fixture();
    const { session: s, api } = f;
    await s.open(identity);
    s.startReview();
    let answer: (() => void) | undefined;
    api.commentsMutate.mockImplementationOnce(r => new Promise(resolve => { answer = () => resolve(reply(r, { state: "saved" })); }));
    const reopening = s.reopenStep();
    await settled();
    s.moveReview("next");
    f.set([reopened(one), two, three]); answer?.(); await reopening;
    api.commentsMutate.mockImplementationOnce(async r => { f.set([reopened(one), two, reopened(three)]); return reply(r, { state: "saved" }); });
    await s.mutate("reopen", "c3");
    expect(s.review?.state.steps.map(item => item.mark)).toEqual(["reopened", "resolved", "reopened"]);
  });

  test("a reopen by someone else stays Reopened by them", async () => {
    const f = fixture();
    const { session: s } = f;
    await s.open(identity);
    s.startReview();
    f.set([reopened(one, { kind: "human", name: "Kim Doe" }), two, three]); await s.read();
    expect(step(s)).toMatchObject({ mark: "reopenedElsewhere" });
    expect(s.review?.state.steps[0]?.reopenedBy).toEqual({ kind: "human", name: "Kim Doe" });
  });

  test("a failed Reopen leaves the step resolved", async () => {
    const { session: s, api } = fixture();
    await s.open(identity);
    s.startReview();
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Comment status changed" }));
    await s.reopenStep();
    expect(step(s).mark).toBe("resolved");
  });
});
