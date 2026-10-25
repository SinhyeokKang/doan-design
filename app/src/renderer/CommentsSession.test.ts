import { describe, expect, test, vi } from "vitest";
import { CommentsSession } from "./CommentsSession";
import type { DoanApi } from "../preload";
import type { Comment, Author, Target } from "../formats/types";
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
  test.each([
    { root: "/other-repo" }, { canvas: "b" }, { path: "design/other.html" }, { requestID: "old-request" },
  ])("rejects a reply with mismatched identity %j", async mismatch => {
    const { session: s, api } = fixture();
    api.commentsList.mockImplementationOnce(async request => ({ ...reply(request, { project: 7, canvasHash: "h", comments: [c], warnings: [] }), identity: { ...request, ...mismatch } }));
    await s.open(identity);
    expect(s.list).toBeNull(); expect(s.readError).toBe("Stale comments response.");
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


describe("uncertain draft transitions", () => {
  async function uncertain(recovery = false) {
    const f = fixture(); await f.session.open(identity); await f.session.create("canvas"); f.session.body("memory only");
    f.api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown", ...(recovery ? { recovery: "child-exit-required" as const } : {}) }));
    await f.session.save(); return f;
  }
  test.each([false, true])("internal movement explains the block and cannot approve quit (recovery %s)", async recovery => {
    const { session: s, api } = await uncertain(recovery);
    const before = structuredClone(s.draft);
    expect(s.guard()).toBe(false);
    expect(s.uncertainTransition?.kind).toBe("blocked");
    s.answerUncertain(s.uncertainTransition!.id, true);
    expect(s.draft).toEqual(before);
    expect(api.setCommentDraftGuard).not.toHaveBeenCalledWith(false);
  });
  test.each([false, true])("quit cancellation preserves request; only the current explicit approval succeeds (recovery %s)", async recovery => {
    const { session: s, api } = await uncertain(recovery);
    const before = structuredClone(s.draft);
    const first = s.guard("quit"), firstID = s.uncertainTransition!.id;
    s.answerUncertain(firstID, false); expect(await first).toBe(false);
    expect(s.draft).toEqual(before);
    const second = s.guard("quit"), secondID = s.uncertainTransition!.id;
    s.answerUncertain(firstID, true);
    expect(s.uncertainTransition?.id).toBe(secondID);
    s.answerUncertain(secondID, true); expect(await second).toBe(true);
    expect(s.draft).toEqual(before);
    expect(api.commentsMutate).toHaveBeenCalledTimes(1); expect(api.commentsStatus).not.toHaveBeenCalled();
    expect(api.setCommentDraftGuard).not.toHaveBeenCalledWith(false);
  });
  test("a superseding internal movement cancels quit and cannot reuse its approval", async () => {
    const { session: s } = await uncertain();
    const quit = s.guard("quit"), id = s.uncertainTransition!.id;
    expect(s.guard()).toBe(false); expect(await quit).toBe(false);
    s.answerUncertain(id, true); expect(s.uncertainTransition?.kind).toBe("blocked");
  });
  test("repeated quit replaces its renderer intent, and busy or composition never permits approval", async () => {
    const { session: s } = await uncertain();
    const old = s.guard("quit"), oldID = s.uncertainTransition!.id;
    const current = s.guard("quit"), id = s.uncertainTransition!.id;
    expect(await old).toBe(false); s.answerUncertain(oldID, true);
    s.composing = true; s.answerUncertain(id, true); expect(s.uncertainTransition?.id).toBe(id);
    s.composing = false; s.busy = true; s.answerUncertain(id, true); expect(s.uncertainTransition?.id).toBe(id);
    s.busy = false; s.answerUncertain(id, false); expect(await current).toBe(false);
    s.composing = true; expect(s.guard("quit")).toBe(false); expect(s.uncertainTransition).toBeNull();
  });
  test("checking cannot open or later approve an exceptional quit; failed checks can warn again", async () => {
    const { session: s, api } = await uncertain();
    const quit = s.guard("quit"), id = s.uncertainTransition!.id;
    let rejectCheck: ((error: Error) => void) | undefined;
    api.commentsStatus.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCheck = reject; }));
    const check = s.check(); expect(await quit).toBe(false);
    expect(s.guard("quit")).toBe(false); s.answerUncertain(id, true);
    rejectCheck?.(new Error("Read failed")); await check;
    expect(s.saveView.status).toBe("check-failed");
    const next = s.guard("quit"); expect(s.uncertainTransition?.kind).toBe("quit");
    s.answerUncertain(s.uncertainTransition!.id, false); expect(await next).toBe(false);
  });
  test("a late saved status cannot turn a cancelled quit into permission", async () => {
    const { session: s, api } = await uncertain();
    const quit = s.guard("quit"), id = s.uncertainTransition!.id;
    s.answerUncertain(id, false);
    api.commentsStatus.mockImplementationOnce(async r => reply(r, { state: "saved" }));
    await s.check(); s.answerUncertain(id, true);
    expect(await quit).toBe(false); expect(s.draft.draft).toBeNull(); expect(s.guard()).toBe(true);
  });
  test("confirmed absence keeps its existing retry contract without an unknown-save warning", async () => {
    const { session: s } = await uncertain();
    await s.check(); expect(s.saveView.status).toBe("retry-original");
    expect(s.guard("quit")).toBe(false); expect(s.uncertainTransition).toBeNull();
    await s.retry(); expect(s.draft.draft).toBeNull(); expect(s.guard("quit")).toBe(true);
  });
  test("an in-flight save does not offer a loss confirmation", async () => {
    const { session: s, api } = fixture(); await s.open(identity); await s.create("canvas"); s.body("saving");
    let finish: (() => void) | undefined;
    api.commentsMutate.mockImplementationOnce(r => new Promise(resolve => { finish = () => resolve(reply(r, { state: "saved" })); }));
    const save = s.save(); expect(s.guard("quit")).toBe(false); expect(s.uncertainTransition).toBeNull();
    finish?.(); await save;
  });
});


test("a rejected shortcut during ordinary Save and continue does not cancel its destination", async () => {
  const { session: s, api } = fixture(); await s.open(identity); await s.create("canvas"); s.body("ordinary");
  const movement = s.guard();
  let finish: (() => void) | undefined;
  api.commentsMutate.mockImplementationOnce(r => new Promise(resolve => { finish = () => resolve(reply(r, { state: "saved" })); }));
  const save = s.save();
  expect(s.guard("quit")).toBe(false);
  finish?.(); await save; expect(await movement).toBe(true);
});

test("begin failure preserves reads and copy, clears on retry and document loss", async () => {
  const { session: s, api } = fixture(); await s.open(identity);
  api.commentsBegin.mockRejectedValueOnce(new Error("Cannot start comment"));
  await s.create("canvas");
  expect(s.readError).toBeNull(); expect(s.list?.comments).toEqual([c]);
  expect(s.createError).toBe("Cannot start comment");
  await s.copy({ kind: "all" }); expect(api.commentsCopy).toHaveBeenCalledOnce();
  const retry = s.create("canvas"); expect(s.createError).toBeNull(); await retry;
  expect(s.draft.draft?.origin.kind).toBe("create"); s.answer("discard");
  api.commentsBegin.mockRejectedValueOnce(new Error("Old document")); await s.create("canvas");
  s.documentLost(); expect(s.createError).toBeNull();
  api.commentsBegin.mockRejectedValueOnce(new Error("Old canvas")); await s.create("canvas");
  await s.open({ ...identity, canvas: "b" }); expect(s.createError).toBeNull();
});

describe("begin authority after document loss", () => {
  test("late rejection stays cleared and a new document can report its own failure", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    let reject!: (error: Error) => void;
    api.commentsBegin.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const old = s.create("canvas"); s.documentLost(); await s.open(identity);
    reject(new Error("Obsolete document")); await old;
    expect(s.createError).toBeNull(); expect(s.list?.comments).toEqual([c]);
    api.commentsBegin.mockRejectedValueOnce(new Error("Current document")); await s.create("canvas");
    expect(s.createError).toBe("Current document");
    await s.create("canvas"); expect(s.createError).toBeNull(); expect(s.draft.draft).not.toBeNull();
  });
  test.each([false, true])("late success cannot create an obsolete draft or release a newer begin (retry %s)", async retry => {
    const { session: s, api } = fixture(); await s.open(identity);
    const original = api.commentsBegin.getMockImplementation()!;
    let release!: () => void, releaseNew!: () => void;
    api.commentsBegin.mockImplementationOnce(r => new Promise(resolve => { release = () => { void original(r).then(resolve); }; }));
    const old = s.create("canvas"); s.documentLost(); await s.open(identity);
    api.setCommentDraftGuard.mockClear();
    let next: Promise<void> | undefined;
    if (retry) {
      api.commentsBegin.mockImplementationOnce(r => new Promise(resolve => { releaseNew = () => { void original(r).then(resolve); }; }));
      next = s.create("canvas");
      expect(api.commentsBegin).toHaveBeenCalledTimes(2);
    }
    release(); await old;
    expect(s.draft.draft).toBeNull(); expect(s.beginning).toBe(retry);
    expect(api.setCommentDraftGuard).not.toHaveBeenCalled();
    if (retry) { releaseNew(); await next; expect(s.draft.draft).not.toBeNull(); }
  });
  test.each(["pending", "ready", "none"])("old guard completion preserves newer %s owner", async newer => {
    const { session: s, api } = fixture(); await s.open(identity);
    let release!: () => void;
    api.setCommentDraftGuard.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const old = s.create("canvas"); await vi.waitFor(() => expect(api.setCommentDraftGuard).toHaveBeenCalledOnce());
    s.documentLost(); await s.open(identity);
    expect(api.setCommentDraftGuard).toHaveBeenLastCalledWith(false);
    api.setCommentDraftGuard.mockClear();
    let next: Promise<void> | undefined, releaseNew!: () => void;
    if (newer !== "none") {
      if (newer === "pending") {
        const original = api.commentsBegin.getMockImplementation()!;
        api.commentsBegin.mockImplementationOnce(r => new Promise(resolve => { releaseNew = () => { void original(r).then(resolve); }; }));
      }
      next = s.create("canvas");
      expect(api.commentsBegin).toHaveBeenCalledTimes(2);
      if (newer === "ready") await next;
    }
    release(); await old;
    expect(s.beginning).toBe(newer === "pending");
    if (newer === "none") { expect(s.draft.draft).toBeNull(); expect(api.setCommentDraftGuard).not.toHaveBeenCalled(); }
    else {
      expect(api.setCommentDraftGuard).not.toHaveBeenCalledWith(false);
      if (newer === "pending") { releaseNew(); await next; }
      expect(s.draft.draft).not.toBeNull();
    }
  });
});

test("a newer failed begin cannot strand the obsolete begin's main guard", async () => {
  const { session: s, api } = fixture(); await s.open(identity);
  let releaseGuard!: () => void, rejectNew!: (error: Error) => void;
  api.setCommentDraftGuard.mockImplementationOnce(() => new Promise(resolve => { releaseGuard = resolve; }));
  const old = s.create("canvas"); await vi.waitFor(() => expect(api.setCommentDraftGuard).toHaveBeenCalledOnce());
  s.documentLost();
  api.commentsBegin.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectNew = reject; }));
  const next = s.create("canvas"); releaseGuard(); await old;
  rejectNew(new Error("Current failure")); await next;
  expect(s.createError).toBe("Current failure"); expect(s.beginning).toBe(false);
  expect(api.setCommentDraftGuard).toHaveBeenLastCalledWith(false);
});

describe("continue a blocked new comment on the current version", () => {
  type Begin = Awaited<ReturnType<DoanApi["commentsBegin"]>>;
  async function blocked(scope: "canvas" | "selection" = "selection", body = "first line\nsecond line") {
    const f = fixture(); await f.session.open(identity); await f.session.create(scope); f.session.body(body);
    f.session.documentLost();
    f.api.setCommentDraftGuard.mockClear();
    return f;
  }
  function hold(api: ReturnType<typeof fixture>["api"], target: Target = { element: { doanId: "pay", selector: "button", html: "<button/>" } }) {
    let release!: () => void, fail!: (error: Error) => void;
    api.commentsBegin.mockImplementationOnce(r => new Promise<Begin>((resolve, reject) => {
      release = () => resolve(reply<BeginResult>(r, { origin: "fresh", project: 7, generation: "loader2", hash: "h2", target }));
      fail = reject;
    }));
    return { release: () => release(), fail: (error: Error) => fail(error) };
  }
  const neverReleased = (api: ReturnType<typeof fixture>["api"]) => expect(api.setCommentDraftGuard).not.toHaveBeenCalledWith(false);

  test("a document loss on the same canvas blocks the create draft as reloaded", async () => {
    const { session: s } = await blocked();
    expect(s.draft.draft?.lost).toBe("reloaded");
    expect(s.draft.draft?.blocked).toBe("The canvas reloaded while you were writing. Your text is kept — continue on the current version to save it.");
  });
  test("a document loss while another canvas is open stays unavailable", async () => {
    const { session: s } = fixture(); await s.open(identity); await s.create("canvas");
    await s.open({ ...identity, canvas: "b", path: "design/b.html" }); s.documentLost(true);
    expect(s.draft.draft?.lost).toBe("unavailable");
    expect(s.draft.draft?.blocked).toBe("Original document or target is unavailable.");
  });
  test("success replaces the draft with the new origin and the body as of success", async () => {
    const { session: s, api } = await blocked();
    const old = s.draft.draft!.id, begin = hold(api);
    const started = s.continueDraft("selection");
    expect(s.beginning).toBe(true); expect(s.continuing).toBe("selection");
    s.body("first line\nsecond line\nthird line");
    begin.release(); await started;
    expect(api.commentsBegin).toHaveBeenLastCalledWith(expect.objectContaining({ ...identity, scope: "selection" }));
    expect(api.setCommentDraftGuard).toHaveBeenCalledExactlyOnceWith(true);
    expect(s.draft.draft).toMatchObject({ body: "first line\nsecond line\nthird line", blocked: null, lost: null, origin: { kind: "create", canvasHash: "h2", target: { element: { doanId: "pay" } } } });
    expect(s.draft.draft?.id).not.toBe(old); expect(s.continued).toBe(s.draft.draft?.id);
    expect(s.target).toEqual({ element: { doanId: "pay", selector: "button", html: "<button/>" } });
    expect(s.beginning).toBe(false); expect(s.continuing).toBeNull();
    await s.save();
    expect(api.commentsMutate.mock.calls[0]?.[0]).toMatchObject({ origin: "fresh", intent: { type: "create", body: "first line\nsecond line\nthird line" } });
  });
  test("Continue on canvas begins a canvas draft from a selection draft", async () => {
    const { session: s, api } = await blocked();
    api.commentsBegin.mockImplementationOnce(async r => reply<BeginResult>(r, { origin: "fresh", project: 7, generation: "loader2", hash: "h2", target: {} }));
    await s.continueDraft("canvas");
    expect(api.commentsBegin).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "canvas" }));
    expect(s.draft.draft?.origin).toMatchObject({ target: {} }); expect(s.target).toEqual({});
  });
  test("failure keeps the blocked draft and its body, and a retry can succeed", async () => {
    const { session: s, api } = await blocked();
    const old = structuredClone(s.draft);
    api.commentsBegin.mockRejectedValueOnce(new Error("A readable width is required to add comments."));
    await s.continueDraft("selection");
    expect(s.continueError).toBe("A readable width is required to add comments.");
    expect(s.createError).toBeNull();
    expect(s.draft).toEqual(old); expect(s.beginning).toBe(false); expect(s.continuing).toBeNull();
    const retry = s.continueDraft("selection"); expect(s.continueError).toBeNull(); await retry;
    expect(s.draft.draft?.blocked).toBeNull(); neverReleased(api);
  });
  test.each(["documentLost", "moved", "renamed"])("late success after %s cannot replace the draft or touch the guard", async kind => {
    const { session: s, api } = await blocked();
    const begin = hold(api), started = s.continueDraft("selection");
    if (kind === "documentLost") s.documentLost(); else if (kind === "moved") await s.open({ ...identity, path: "design/moved/a.html" }); else await s.rename("design/moved/a.html");
    expect(s.beginning).toBe(false);
    const before = structuredClone(s.draft);
    begin.release(); await started;
    expect(s.draft).toEqual(before); expect(s.draft.draft?.body).toBe("first line\nsecond line");
    expect(api.setCommentDraftGuard).not.toHaveBeenCalled();
  });
  test("late failure after a document loss leaves no error", async () => {
    const { session: s, api } = await blocked();
    const begin = hold(api), started = s.continueDraft("selection");
    s.documentLost(); begin.fail(new Error("Obsolete document")); await started;
    expect(s.continueError).toBeNull(); expect(s.draft.draft?.lost).toBe("reloaded"); neverReleased(api);
  });
  test("a held guard confirmation replaces the draft only while its begin is current", async () => {
    const { session: s, api } = await blocked();
    let confirm!: () => void;
    api.setCommentDraftGuard.mockImplementationOnce(() => new Promise<void>(resolve => { confirm = resolve; }));
    const first = s.continueDraft("selection");
    await vi.waitFor(() => expect(api.setCommentDraftGuard).toHaveBeenCalledOnce());
    expect(s.draft.draft?.lost).toBe("reloaded");
    s.documentLost(); confirm(); await first;
    expect(s.draft.draft?.lost).toBe("reloaded"); expect(s.beginning).toBe(false);
    api.setCommentDraftGuard.mockImplementationOnce(() => new Promise<void>(resolve => { confirm = resolve; }));
    const second = s.continueDraft("selection");
    await vi.waitFor(() => expect(api.setCommentDraftGuard).toHaveBeenCalledTimes(2));
    expect(s.draft.draft?.lost).toBe("reloaded");
    confirm(); await second;
    expect(s.draft.draft?.lost).toBeNull(); neverReleased(api);
  });
  test("a double click begins once", async () => {
    const { session: s, api } = await blocked();
    const begin = hold(api), first = s.continueDraft("selection"), second = s.continueDraft("selection"), third = s.continueDraft("canvas");
    begin.release(); await Promise.all([first, second, third]);
    expect(api.commentsBegin).toHaveBeenCalledTimes(2);
    expect(api.setCommentDraftGuard).toHaveBeenCalledExactlyOnceWith(true);
  });
  test.each(["missing", "failed"] as const)("does nothing while the author is %s", async status => {
    const { session: s, api } = await blocked();
    s.author = status === "failed" ? { status, message: "git failed" } : { status };
    await s.continueDraft("selection");
    expect(api.commentsBegin).toHaveBeenCalledTimes(1); expect(s.draft.draft?.lost).toBe("reloaded");
  });
  test("a click during IME composition continues and carries the committed text", async () => {
    const { session: s, api } = await blocked("canvas", "한");
    s.composing = true;
    const begin = hold(api, {}), started = s.continueDraft("canvas");
    s.body("한글"); s.composing = false;
    begin.release(); await started;
    expect(s.draft.draft).toMatchObject({ body: "한글", lost: null });
  });
  test("does not continue an unavailable draft or one with an uncertain save", async () => {
    const { session: s, api } = fixture(); await s.open(identity); await s.create("canvas"); s.body("keep");
    api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown" }));
    await s.save(); s.documentLost();
    expect(s.draft.request).not.toBeNull();
    await s.continueDraft("canvas");
    expect(api.commentsBegin).toHaveBeenCalledTimes(1);
    const other = fixture(); await other.session.open(identity); await other.session.create("canvas");
    await other.session.open({ ...identity, canvas: "b", path: "design/b.html" }); other.session.documentLost();
    await other.session.continueDraft("canvas");
    expect(other.api.commentsBegin).toHaveBeenCalledTimes(1);
  });
  test("discarding during a begin keeps the guard released", async () => {
    const { session: s, api } = await blocked();
    const begin = hold(api), started = s.continueDraft("selection");
    s.answer("discard"); begin.release(); await started;
    expect(s.draft.draft).toBeNull(); expect(s.beginning).toBe(false);
    expect(api.setCommentDraftGuard).toHaveBeenCalledExactlyOnceWith(false);
  });
  test("same-canvas selection changes skip the guard only while the draft is continuable", async () => {
    const { session: s } = await blocked();
    expect(s.guardSelection()).toBe(true); expect(s.draft.transition).toBeNull();
    const navigation = s.guard(); expect(navigation).toBeInstanceOf(Promise); s.answer("continue"); expect(await navigation).toBe(false);
    s.composing = true; expect(s.guardSelection()).toBe(false); s.composing = false;
    const ordinary = fixture(); await ordinary.session.open(identity); await ordinary.session.create("canvas");
    const asked = ordinary.session.guardSelection(); expect(asked).toBeInstanceOf(Promise);
    ordinary.session.answer("continue"); expect(await asked).toBe(false);
    const empty = fixture(); await empty.session.open(identity); expect(empty.session.guardSelection()).toBe(true);
  });
  test("a selection change while starting waits for the begin", async () => {
    const { session: s, api } = await blocked();
    const begin = hold(api), started = s.continueDraft("selection");
    expect(s.guardSelection()).toBe(false);
    begin.release(); await started;
  });
});

describe("a canvas moved with the same id", () => {
  const moved = "design/flows/a.html";
  function held<T>() {
    let release!: (value: T) => void;
    return { promise: new Promise<T>(resolve => { release = resolve; }), release: (value: T) => release(value) };
  }

  test("renames the identity, keeps the list and reads it again for the new path", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    const list = s.list;
    await s.rename(moved);
    expect(s.identity).toEqual({ ...identity, path: moved });
    expect(api.commentsList).toHaveBeenLastCalledWith(expect.objectContaining({ ...identity, path: moved }));
    expect(s.list).toEqual(list); expect(s.readError).toBeNull();
    expect(api.commentsAuthor).toHaveBeenCalledTimes(1);
  });
  test("an in-flight read for the old path cannot replace the result or set a read error", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    const late = held<CommentReply<CommentList>>();
    let oldRequest: CommentRequest | undefined;
    api.commentsList.mockImplementationOnce(r => { oldRequest = r; return late.promise; });
    const reading = s.read();
    api.commentsList.mockImplementationOnce(async r => reply(r, { project: 7, canvasHash: "new", comments: [], warnings: [] }));
    await s.rename(moved);
    late.release(reply(oldRequest!, { project: 7, canvasHash: "old", comments: [c], warnings: [] })); await reading;
    expect(s.list?.canvasHash).toBe("new"); expect(s.readError).toBeNull();
    const failing = held<CommentReply<CommentList>>();
    api.commentsList.mockImplementationOnce(() => failing.promise);
    const second = s.read();
    await s.rename("design/again/a.html");
    failing.release({ ok: false, identity: { ...identity, path: moved, requestID: "x" }, error: "Path changed" } as CommentReply<CommentList>); await second;
    expect(s.readError).toBeNull();
  });
  test("an in-flight copy for the old path cannot report afterwards", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    const late = held<CommentReply<{ copied: true }>>();
    api.commentsCopy.mockImplementationOnce(() => late.promise);
    const copying = s.copy({ kind: "all" });
    await s.rename(moved);
    late.release({ ok: false, identity: { ...identity, requestID: "x" }, error: "Canvas not found" } as CommentReply<{ copied: true }>); await copying;
    expect(s.copies.get("all")).toBeUndefined(); expect(s.readError).toBeNull();
  });
  test("an author read still pending is asked again for the renamed canvas", async () => {
    const { session: s, api } = fixture();
    const late = held<CommentReply<Author>>();
    api.commentsAuthor.mockImplementationOnce(() => late.promise);
    const opening = s.open(identity);
    await s.rename(moved);
    expect(s.author.status).toBe("ready");
    late.release(reply({ ...identity, requestID: "x" }, { kind: "human", name: "A" })); await opening;
    expect(s.author.status).toBe("ready");
  });
  test("an edit draft without a request saves to the new path after the move", async () => {
    const { session: s, api } = fixture(); await s.open(identity); s.edit("c1"); s.body("after the move");
    expect(s.canFollow()).toBe(true);
    await s.rename(moved);
    expect(s.draft.draft?.blocked).toBeNull();
    await s.save();
    expect(api.commentsMutate.mock.calls[0]?.[0]).toMatchObject({ root: "/repo", canvas: "a", path: moved, intent: { type: "edit", comment: "c1", body: "after the move" } });
  });
  test("a create draft is blocked as reloaded once the moved document loads", async () => {
    const { session: s } = fixture(); await s.open(identity); await s.create("canvas"); s.body("keep");
    expect(s.canFollow()).toBe(true);
    await s.rename(moved); s.documentLost(true);
    expect(s.draft.draft).toMatchObject({ body: "keep", lost: "reloaded" });
  });
  test("a create begin still in flight is cancelled and releases main's guard", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    const late = held<CommentReply<BeginResult>>();
    let request: CommentRequest | undefined;
    api.commentsBegin.mockImplementationOnce(r => { request = r; return late.promise; });
    const creating = s.create("canvas");
    await s.rename(moved);
    late.release(reply(request!, { origin: "old", project: 7, generation: "g", hash: "h", target: {} })); await creating;
    expect(s.draft.draft).toBeNull(); expect(s.beginning).toBe(false);
  });
  test("does not follow while a save is in flight or uncertain", async () => {
    const { session: s, api } = fixture(); await s.open(identity); s.edit("c1"); s.body("x");
    const late = held<CommentReply<SavedStatus>>();
    api.commentsMutate.mockImplementationOnce(() => late.promise);
    const saving = s.save();
    expect(s.canFollow()).toBe(false);
    late.release({ ok: false, identity: { ...identity, requestID: "x" }, error: "Stale" } as CommentReply<SavedStatus>);
    await saving;
    expect(s.saveView.status).toBe("unknown"); expect(s.canFollow()).toBe(false);
  });
  test("does not follow while a card change is in flight or unsettled, or a delete confirmation is open", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    const late = held<CommentReply<SavedStatus>>();
    let request: CommentRequest | undefined;
    api.commentsMutate.mockImplementationOnce(r => { request = r; return late.promise; });
    const resolving = s.mutate("resolve", "c1");
    expect(s.canFollow()).toBe(false);
    late.release(reply(request!, { state: "unknown" })); await resolving;
    expect(s.mutations.get("c1")?.status).toBe("unknown"); expect(s.canFollow()).toBe(false);
    const other = fixture(); await other.session.open(identity);
    await other.session.mutate("delete", "c1"); expect(other.session.canFollow()).toBe(false);
    other.session.cancelDelete(); expect(other.session.canFollow()).toBe(true);
  });
  // A card change the person still has to finish names the old path, so the
  // move is not followed and the existing removal handling applies (R2, R-B7 1).
  test("does not follow while a card change still needs the person: conflict, reviewed", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Comment changed; read the latest state before saving." }));
    await s.mutate("resolve", "c1");
    expect(s.mutations.get("c1")?.status).toBe("conflict"); expect(s.canFollow()).toBe(false);
    await s.read(true);
    expect(s.mutations.get("c1")?.status).toBe("reviewed"); expect(s.canFollow()).toBe(false);
    await s.confirmCard("c1");
    expect(api.commentsMutate).toHaveBeenCalledTimes(2);
    expect(s.mutations.get("c1")?.status).toBe("saved"); expect(s.canFollow()).toBe(true);
  });
  test("does not follow while a card change failed or waits for its original retry", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Disk full" }));
    await s.mutate("resolve", "c1");
    expect(s.mutations.get("c1")?.status).toBe("failed"); expect(s.canFollow()).toBe(false);
    api.commentsMutate.mockImplementationOnce(async r => reply(r, { state: "unknown" }));
    await s.cardRetry("c1", false); await s.cardRetry("c1", true);
    expect(s.mutations.get("c1")?.status).toBe("retry-original"); expect(s.canFollow()).toBe(false);
  });
  test("a finished card change does not block a later move", async () => {
    const { session: s, api } = fixture(); await s.open(identity);
    api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Comment no longer exists." }));
    await s.mutate("resolve", "c1");
    expect(s.mutations.get("c1")?.status).toBe("deleted"); expect(s.canFollow()).toBe(true);
    const reopened = fixture(); await reopened.session.open(identity);
    reopened.api.commentsMutate.mockImplementationOnce(async r => ({ ok: false, identity: r, error: "Disk full" }));
    await reopened.session.mutate("resolve", "c1");
    await reopened.session.open({ ...identity, canvas: "b", path: "design/b.html" }); await reopened.session.open(identity);
    expect(reopened.session.canFollow()).toBe(true);
  });
});
