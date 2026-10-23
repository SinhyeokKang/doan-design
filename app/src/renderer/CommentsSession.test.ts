import { describe, expect, test, vi } from "vitest";
import { CommentsSession } from "./CommentsSession";
import type { DoanApi } from "../preload";
import type { Comment, Author } from "../formats/types";
import type { BeginResult, CommentList, CommentRequest, CommentReply, SavedStatus } from "../main/comments/service";
const identity = { root: "/repo", canvas: "a", path: "design/a.html" };
const c: Comment = { comment: "c1", body: "Before", status: "open", target: {}, canvasHash: "h", createdBy: { kind: "human", name: "A" }, createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z" };
function reply<T>(r: CommentRequest, value: T): CommentReply<T> { return { ok: true, identity: r, value }; }
function fixture() {
  const api = {
    commentsList: vi.fn(async r => reply<CommentList>(r, { project: 7, canvasHash: "h", comments: [c], warnings: [] })),
    commentsAuthor: vi.fn(async r => reply<Author>(r, { kind: "human", name: "A" })),
    commentsBegin: vi.fn(async r => reply<BeginResult>(r, { origin: "opaque", project: 7, generation: "loader1", hash: "h", target: { frame: "hero" } })),
    commentsMutate: vi.fn(async r => reply<SavedStatus>(r, { state: "saved" })),
    commentsStatus: vi.fn(async r => reply<SavedStatus>(r, { state: "absent" })),
    commentsCopy: vi.fn(async r => reply<{copied: true}>(r, { copied: true })),
    setCommentDraftGuard: vi.fn(async () => {}),
  } satisfies Pick<DoanApi, "commentsList" | "commentsAuthor" | "commentsBegin" | "commentsMutate" | "commentsStatus" | "commentsCopy" | "setCommentDraftGuard">;
  const session = new CommentsSession(api, () => {});
  return { session, api };
}
describe("application comment session", () => {
  test("saves the original opaque create origin and body before approving a destination", async () => {
    const { session: s, api } = fixture(); await s.open(identity); await s.create("selection"); s.body("original");
    const moved = s.guard(); expect(s.draft.draft?.origin).toMatchObject({ canvas: "a", target: { frame: "hero" } });
    await s.save(); expect(await moved).toBe(true);
    expect(api.commentsMutate.mock.calls[0]?.[0]).toMatchObject({ ...identity, project: 7, origin: "opaque", intent: { type: "create", body: "original" } });
    expect(s.draft.draft).toBeNull();
  });
  test("continue retains the original draft and discard releases only the pending destination", async () => {
    const { session: s } = fixture(); await s.open(identity); await s.create("canvas"); s.body("keep");
    const first = s.guard(); s.answer("continue"); expect(await first).toBe(false); expect(s.draft.draft?.body).toBe("keep");
    const second = s.guard(); s.answer("discard"); expect(await second).toBe(true); expect(s.draft.draft).toBeNull();
  });
  test("uncertain results freeze body and retry the exact request only after absence", async () => {
    const { session: s, api } = fixture(); await s.open(identity); await s.create("canvas"); s.body("frozen");
    api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown" }));
    await s.save(); s.body("changed"); expect(s.draft.draft?.body).toBe("frozen");
    await s.check(); expect(s.saveView.status).toBe("retry-original"); await s.retry();
    expect(api.commentsMutate.mock.calls[1]?.[0]).toEqual(api.commentsMutate.mock.calls[0]?.[0]);
  });
  test("child exit quarantine never becomes saved or permits status-based retry", async () => {
    const { session: s, api } = fixture(); await s.open(identity); await s.create("canvas"); s.body("keep");
    api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown", recovery: "child-exit-required" }));
    await s.save(); await s.check(); await s.retry();
    expect(s.saveView.status).toBe("recovery-blocked"); expect(s.draft.draft?.body).toBe("keep"); expect(api.commentsMutate).toHaveBeenCalledTimes(1); expect(api.commentsStatus).not.toHaveBeenCalled();
  });
  test("stale list replies cannot replace the current canvas", async () => {
    const { session: s, api } = fixture(); let release: (() => void) | undefined;
    api.commentsList.mockImplementationOnce(r => new Promise(resolve => { release = () => resolve(reply(r, { project: 7, canvasHash: "h", comments: [c], warnings: [] })); }));
    api.commentsList.mockImplementationOnce(async r => reply(r, { project: 7, canvasHash: "b", comments: [], warnings: [] }));
    const old = s.open(identity); await s.open({ ...identity, canvas: "b", path: "design/b.html" }); release?.(); await old;
    expect(s.identity?.canvas).toBe("b"); expect(s.list?.comments).toEqual([]);
  });
  test("failure preserves editable body and existing edit does not need a document origin", async () => {
    const { session: s, api } = fixture(); await s.open(identity); s.edit("c1"); s.body("after");
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Permission denied" }));
    await s.save(); s.body("retry body"); expect(s.draft.draft?.body).toBe("retry body");
    expect(api.commentsBegin).not.toHaveBeenCalled(); expect(api.commentsMutate.mock.calls[0]?.[0]).not.toHaveProperty("origin");
  });
  test("reopened project edit requires explicit fresh review before adopting the new epoch", async () => {
    const { session: s, api } = fixture(); await s.open(identity); s.edit("c1"); s.body("kept");
    await s.open(null); expect(s.draft.draft?.blocked).not.toBeNull();
    api.commentsList.mockImplementation(async r => reply(r, { project: 8, canvasHash: "h", comments: [c], warnings: [] }));
    await s.open(identity); expect(s.draft.draft?.blocked).not.toBeNull();
    await s.read(true); expect(s.draft.draft?.blocked).toBeNull(); await s.save();
    expect(api.commentsMutate.mock.calls[0]?.[0]).toMatchObject({ project: 8, intent: { type: "edit", comment: "c1", body: "kept" } });
  });

  test("composition cannot open a transition dialog or leave the draft", async () => {
    const { session: s } = fixture(); await s.open(identity); await s.create("canvas"); s.body("composing");
    s.composing = true;
    expect(s.guard()).toBe(false); expect(s.draft.transition).toBeNull();
    s.composing = false;
    const pending = s.guard(); s.answer("continue"); expect(await pending).toBe(false);
  });

  test("card conflict reviews latest state and confirms a new logical request", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Comment changed; read the latest state before saving." }));
    await s.mutate("resolve", "c1"); expect(s.mutations.get("c1")?.status).toBe("conflict");
    const latest = { ...c, body: "External body", updatedAt: "2026-10-23T00:00:01.000Z" };
    api.commentsList.mockImplementation(async r => reply(r, { project: 7, canvasHash: "h", comments: [latest], warnings: [] }));
    await s.read(true); expect(s.mutations.get("c1")).toEqual({ status: "reviewed", latest });
    expect(api.commentsMutate).toHaveBeenCalledTimes(1);
    await s.confirmCard("c1");
    expect(api.commentsMutate.mock.calls[1]?.[0]).toMatchObject({ intent: { type: "resolve", expected: { body: "External body" } } });
    expect(api.commentsMutate.mock.calls[1]?.[0].requestID).not.toBe(api.commentsMutate.mock.calls[0]?.[0].requestID);
  });
  test("delete confirmation freezes expected state and Cancel never writes", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    await s.mutate("delete", "c1"); expect(api.commentsMutate).not.toHaveBeenCalled();
    expect(s.deleteConfirmation?.comment.body).toBe("Before"); s.cancelDelete(); expect(api.commentsMutate).not.toHaveBeenCalled();
    await s.mutate("delete", "c1"); await s.confirmDelete();
    expect(api.commentsMutate).toHaveBeenCalledTimes(1);
    expect(api.commentsMutate.mock.calls[0]?.[0]).toMatchObject({ intent: { type: "delete", expected: { body: "Before" } } });
  });

});
