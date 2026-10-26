import { afterEach, describe, expect, test, vi } from "vitest";
import { CommentsSession } from "./CommentsSession";
import type { Comment, Author } from "../formats/types";
import type { HandoffSelection } from "../comments/handoff";
import type { BeginResult, CommentList, CommentRequest, CommentReply, SavedStatus } from "../main/comments/service";

const identity = { root: "/repo", canvas: "a", path: "design/a.html" };
const comment = (id: string, at: string, over: Partial<Comment> = {}): Comment => ({
  comment: id, body: `Body ${id}`, status: "open", target: {}, canvasHash: "h", createdBy: { kind: "human", name: "A" }, createdAt: at, updatedAt: at, ...over,
});
const c1 = comment("c1", "2026-10-25T01:00:00.000Z"), c2 = comment("c2", "2026-10-25T02:00:00.000Z", { target: { frame: "pay" } }), c3 = comment("c3", "2026-10-25T03:00:00.000Z");
const done = (c: Comment): Comment => ({ ...c, status: "resolved", resolvedBy: { kind: "agent", name: "codex" }, resolvedAt: "2026-10-26T00:00:00.000Z" });
const NOON = new Date("2026-10-26T05:02:10.000Z");
function reply<T>(r: CommentRequest, value: T): CommentReply<T> { return { ok: true, identity: r, value }; }
function held<T>() { let release!: (value: T) => void; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; }

function fixture(initial: Comment[] = [c1, c2, c3, done(comment("r1", "2026-10-24T00:00:00.000Z"))]) {
  const state = { comments: initial };
  const api = {
    commentsList: vi.fn(async (r: CommentRequest) => reply<CommentList>(r, { project: 7, canvasHash: "h", comments: state.comments, warnings: [] })),
    commentsAuthor: vi.fn(async (r: CommentRequest) => reply<Author>(r, { kind: "human", name: "A" })),
    commentsBegin: vi.fn(async (r: CommentRequest) => reply<BeginResult>(r, { origin: "opaque", project: 7, generation: "loader1", hash: "h", target: {} })),
    commentsMutate: vi.fn(async (r: CommentRequest) => reply<SavedStatus>(r, { state: "saved" })),
    commentsStatus: vi.fn(async (r: CommentRequest) => reply<SavedStatus>(r, { state: "absent" })),
    commentsCopy: vi.fn(async (r: CommentRequest): Promise<CommentReply<{ copied: true }>> => reply(r, { copied: true as const })),
    setCommentDraftGuard: vi.fn(async () => {}),
  };
  const session = new CommentsSession(api, () => {});
  return { session, api, state };
}
const lookup = { root: "/repo", canvas: "a", generation: 1, nodes: new Map([["c2", "n-pay"]]) };
const selection = (node: string | null): HandoffSelection => ({ node, label: "Frame · pay", context: lookup, lookup });
const ids = (s: CommentsSession) => s.handoff?.rows.map(row => row.comment.comment);
afterEach(() => { vi.useRealTimers(); });

describe("the Hand off dialog's rows and checks", () => {
  test("rows are the open comments in list order, fixed when the dialog opens", async () => {
    const { session: s, state } = fixture(); await s.open(identity);
    expect(s.openHandoff("all", [], null)).toBe(true);
    expect(ids(s)).toEqual(["c1", "c2", "c3"]);
    expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
    state.comments = [done(c1), c2, c3, comment("c4", "2026-10-25T04:00:00.000Z")]; await s.read();
    expect(ids(s)).toEqual(["c1", "c2", "c3"]);
    expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
  });
  test("a card or the Review summary checks only its ids, in row order, dropping ones no longer open", async () => {
    const { session: s } = fixture(); await s.open(identity);
    s.openHandoff(["c3"], [], null); expect(s.handoff?.checked).toEqual(["c3"]); s.closeHandoff();
    s.openHandoff(["c3", "r1", "c1", "gone"], [], null); expect(s.handoff?.checked).toEqual(["c1", "c3"]);
  });
  test("cannot open without a readable list", async () => {
    const { session: s, api } = fixture();
    expect(s.openHandoff("all", [], null)).toBe(false);
    api.commentsList.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Cannot read" }));
    await s.open(identity);
    expect(s.openHandoff("all", [], null)).toBe(false); expect(s.handoff).toBeNull();
  });
  test("toggles and quick selects keep row order; a disabled Selection changes nothing", async () => {
    const { session: s } = fixture(); await s.open(identity);
    s.openHandoff("all", [], selection("n-pay"));
    s.toggleHandoff("c2"); expect(s.handoff?.checked).toEqual(["c1", "c3"]);
    s.toggleHandoff("c2"); expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
    s.quickHandoff("none"); expect(s.handoff?.checked).toEqual([]);
    s.quickHandoff("selection"); expect(s.handoff?.checked).toEqual(["c2"]);
    s.quickHandoff("all"); expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
    s.closeHandoff(); s.openHandoff(["c1"], [], null);
    s.quickHandoff("selection"); expect(s.handoff?.checked).toEqual(["c1"]);
  });
});

describe("copying from the Hand off dialog", () => {
  test("copies the checked ids and records Handed off with the time of the copy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOON);
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); s.toggleHandoff("c1");
    await s.copyHandoff();
    expect(api.commentsCopy).toHaveBeenCalledWith(expect.objectContaining({ ...identity, scope: { comments: ["c2", "c3"] } }));
    expect(s.handoff?.copy).toEqual({ status: "copied", count: 2 });
    expect(s.handedOff()).toEqual({ ids: ["c2", "c3"], at: NOON });
  });
  test("shows Copying… while main works, then reports a failure without touching checks or Handed off", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff(["c1"], [], null); await s.copyHandoff();
    const before = s.handedOff();
    s.closeHandoff(); s.openHandoff("all", [], null);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copyHandoff();
    expect(s.handoff?.copy).toEqual({ status: "copying" });
    s.toggleHandoff("c1"); s.quickHandoff("none"); expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
    await s.copyHandoff(); expect(api.commentsCopy).toHaveBeenCalledTimes(2);
    late.release({ ok: false, identity: api.commentsCopy.mock.calls[1]![0], error: "Clipboard unavailable" }); await copying;
    expect(s.handoff?.copy).toEqual({ status: "failed" });
    expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
    expect(s.handedOff()).toBe(before);
    api.commentsCopy.mockRejectedValueOnce(new Error("IPC gone")); await s.copyHandoff();
    expect(s.handoff?.copy).toEqual({ status: "failed" });
    await s.copyHandoff(); expect(s.handoff?.copy).toEqual({ status: "copied", count: 3 });
  });
  test("after success the checks and quick select stay as the record of what was copied", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); await s.copyHandoff();
    s.toggleHandoff("c1"); s.quickHandoff("none"); await s.copyHandoff();
    expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]); expect(api.commentsCopy).toHaveBeenCalledOnce();
  });
  test("nothing is sent with nothing checked", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); s.quickHandoff("none"); await s.copyHandoff();
    expect(api.commentsCopy).not.toHaveBeenCalled(); expect(s.handoff?.copy).toEqual({ status: "idle" });
  });
  test("a not_open refusal rereads: stale rows leave, remaining checks stay, new open comments arrive unchecked", async () => {
    const { session: s, api, state } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); s.toggleHandoff("c3");
    state.comments = [done(c1), done(c2), c3, comment("c4", "2026-10-25T04:00:00.000Z")];
    api.commentsCopy.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Some chosen comments are no longer open.", code: "not_open" }));
    await s.copyHandoff();
    expect(ids(s)).toEqual(["c3", "c4"]);
    expect(s.handoff?.checked).toEqual([]);
    expect(s.handoff?.copy).toEqual({ status: "stale", count: 2 });
    s.toggleHandoff("c4"); await s.copyHandoff();
    expect(api.commentsCopy.mock.calls[1]?.[0]).toMatchObject({ scope: { comments: ["c4"] } });
    expect(s.handoff?.copy).toEqual({ status: "copied", count: 1 });
  });
  test("a refusal whose reread finds every checked comment open again is a plain failure", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null);
    api.commentsCopy.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Some chosen comments are no longer open.", code: "not_open" }));
    await s.copyHandoff();
    expect(s.handoff?.copy).toEqual({ status: "failed" }); expect(s.handoff?.checked).toEqual(["c1", "c2", "c3"]);
  });
  test("closing during the copy still records Handed off when it succeeds", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copyHandoff(); s.closeHandoff();
    late.release(reply(api.commentsCopy.mock.calls[0]![0], { copied: true })); await copying;
    expect(s.handoff).toBeNull(); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
  });
  test("judged by the request, not the session revision: a rename during the copy keeps its result", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copyHandoff();
    await s.rename("design/moved/a.html");
    expect(s.handoff).not.toBeNull();
    late.release(reply(api.commentsCopy.mock.calls[0]![0], { copied: true })); await copying;
    expect(s.handoff?.copy).toEqual({ status: "copied", count: 3 }); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
  });
  test("a reply for another request is not this copy's success", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null);
    api.commentsCopy.mockImplementationOnce(async r => reply({ ...r, requestID: "other" }, { copied: true }));
    await s.copyHandoff();
    expect(s.handoff?.copy).toEqual({ status: "failed" }); expect(s.handedOff()).toBeNull();
  });
  test("a copy finishing after the person moved to another canvas is kept for its own canvas", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copyHandoff();
    await s.open({ root: "/repo", canvas: "b", path: "design/b.html" });
    expect(s.handoff).toBeNull();
    late.release(reply(api.commentsCopy.mock.calls[0]![0], { copied: true })); await copying;
    expect(s.handedOff()).toBeNull();
    await s.open(identity); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
  });
});

describe("Handed off for the app session", () => {
  async function handedOff() {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOON);
    const f = fixture(); await f.session.open(identity);
    f.session.openHandoff("all", [], null); await f.session.copyHandoff(); f.session.closeHandoff();
    return f;
  }
  test("stays for new comments and partial resolves, clears once none of its ids is open", async () => {
    const { session: s, state } = await handedOff();
    state.comments = [done(c1), done(c2), c3, comment("c4", "2026-10-25T04:00:00.000Z")]; await s.read();
    expect(s.handedOff()).toEqual({ ids: ["c1", "c2", "c3"], at: NOON });
    state.comments = [done(c1), done(c2), done(c3), comment("c4", "2026-10-25T04:00:00.000Z")]; await s.read();
    expect(s.handedOff()).toBeNull();
    state.comments = [c1, c2, c3]; await s.read();
    expect(s.handedOff()).toBeNull();
  });
  test("a later copy replaces it", async () => {
    const { session: s } = await handedOff();
    const later = new Date("2026-10-26T05:10:00.000Z"); vi.setSystemTime(later);
    s.openHandoff(["c2"], [], null); await s.copyHandoff();
    expect(s.handedOff()).toEqual({ ids: ["c2"], at: later });
  });
  test("survives other canvases and a rename, keyed by (root, canvas id)", async () => {
    const { session: s } = await handedOff();
    await s.open({ root: "/repo", canvas: "b", path: "design/b.html" }); expect(s.handedOff()).toBeNull();
    await s.open({ root: "/other", canvas: "a", path: "design/a.html" }); expect(s.handedOff()).toBeNull();
    await s.open(identity); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
    await s.rename("design/moved/a.html"); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
    await s.open({ root: "/repo", canvas: "a", path: "design/elsewhere.html" }); expect(s.handedOff()?.ids).toEqual(["c1", "c2", "c3"]);
  });
  test("evaluates once against the list it has when the copy succeeds", async () => {
    const { session: s, api, state } = fixture(); await s.open(identity);
    s.openHandoff(["c1"], [], null);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copyHandoff();
    state.comments = [done(c1), c2, c3]; await s.read();
    late.release(reply(api.commentsCopy.mock.calls[0]![0], { copied: true })); await copying;
    expect(s.handoff?.copy).toEqual({ status: "copied", count: 1 });
    expect(s.handedOff()).toBeNull();
  });
});

describe("dialogs above Hand off", () => {
  test("another canvas closes it; a rename keeps it", async () => {
    const { session: s } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); await s.rename("design/moved/a.html"); expect(s.handoff).not.toBeNull();
    await s.open({ root: "/repo", canvas: "b", path: "design/b.html" }); expect(s.handoff).toBeNull();
  });
  test("Delete and Unsaved close it", async () => {
    const { session: s } = fixture(); await s.open(identity);
    s.openHandoff("all", [], null); await s.mutate("delete", "c1");
    expect(s.deleteConfirmation).not.toBeNull(); expect(s.handoff).toBeNull();
    s.cancelDelete();
    await s.create("canvas"); s.body("draft");
    expect(s.openHandoff("all", [], null)).toBe(true);
    void s.guard(); expect(s.draft.transition).not.toBeNull(); expect(s.handoff).toBeNull();
  });
  test("Uncertain closes it", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    await s.create("canvas"); s.body("draft");
    api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown" }));
    await s.save();
    expect(s.openHandoff("all", [], null)).toBe(true);
    void s.guard("quit"); expect(s.uncertainTransition).not.toBeNull(); expect(s.handoff).toBeNull();
  });
});
