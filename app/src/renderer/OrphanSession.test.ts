import { describe, expect, test, vi } from "vitest";
import { OrphanSession, STATUS_LINE_MS, expectedComment, orphanKey } from "./CommentsSession";
import type { DoanApi } from "../preload";
import type { Comment } from "../formats/types";
import type { CommentReply, OrphanMutationRequest, OrphanRequest, SavedStatus } from "../main/comments/service";

// project-feedback design §4 and draft `orphan-cards`: Resolve, Reopen and
// Delete of a comment without a canvas, with the Comments card's save states.
const c: Comment = { comment: "c1", body: "Right-align the amounts.", status: "open", target: {}, canvasHash: "h", createdBy: { kind: "human", name: "Kim" }, createdAt: "2026-10-24T09:12:00.000Z", updatedAt: "2026-10-24T09:12:00.000Z" };
const at = { root: "/repo", canvas: "invoice", project: 7 };
const key = orphanKey("/repo", "invoice", "c1");
const identity = (r: OrphanRequest): OrphanRequest => ({ root: r.root, canvas: r.canvas, requestID: r.requestID });
const ok = (r: OrphanRequest, value: SavedStatus): CommentReply<SavedStatus, OrphanRequest> => ({ ok: true, identity: identity(r), value });
const refused = (r: OrphanRequest, error: string): CommentReply<SavedStatus, OrphanRequest> => ({ ok: false, identity: identity(r), error });
function fixture() {
  const api = {
    orphanCommentsMutate: vi.fn(async (r: OrphanMutationRequest) => ok(r, { state: "saved" })),
    orphanCommentsStatus: vi.fn(async (r: OrphanRequest) => ok(r, { state: "absent" })),
  } satisfies Pick<DoanApi, "orphanCommentsMutate" | "orphanCommentsStatus">;
  const changed = vi.fn();
  return { session: new OrphanSession(api, changed), api, changed };
}

describe("OrphanSession", () => {
  test("resolves with the read's project epoch and no canvas path, then leaves a status line", async () => {
    vi.useFakeTimers();
    const { session: s, api } = fixture();
    await s.mutate("resolve", at, c);
    const request = api.orphanCommentsMutate.mock.calls[0]![0];
    expect(request).toEqual({ root: "/repo", canvas: "invoice", requestID: request.requestID, project: 7, intent: { type: "resolve", comment: "c1", expected: expectedComment(c) } });
    expect(Object.hasOwn(request, "path")).toBe(false);
    expect(s.mutations.get(key)).toEqual({ status: "idle" });
    expect(s.statusLine).toEqual({ root: "/repo", canvas: "invoice", comment: "c1", text: "Resolved — moved to Resolved." });
    vi.advanceTimersByTime(STATUS_LINE_MS);
    expect(s.statusLine).toBeNull();
    vi.useRealTimers();
  });

  test("Reopen of a resolved comment", async () => {
    const { session: s, api } = fixture();
    const done = { ...c, status: "resolved" as const, resolvedAt: "2026-10-25T07:02:00.000Z", resolvedBy: { kind: "agent" as const, name: "codex" } };
    await s.mutate("reopen", at, done);
    expect(api.orphanCommentsMutate.mock.calls[0]![0].intent).toEqual({ type: "reopen", comment: "c1", expected: expectedComment(done) });
    expect(s.statusLine?.text).toBe("Reopened — moved to Open.");
  });

  test("Delete goes through the existing confirmation; Cancel writes nothing", async () => {
    const { session: s, api } = fixture();
    await s.mutate("delete", at, c);
    expect(api.orphanCommentsMutate).not.toHaveBeenCalled();
    expect(s.deleteConfirmation?.comment).toEqual(c);
    s.cancelDelete();
    expect(s.deleteConfirmation).toBeNull();
    await s.mutate("delete", at, c);
    await s.confirmDelete();
    expect(api.orphanCommentsMutate.mock.calls[0]![0].intent).toEqual({ type: "delete", comment: "c1", expected: expectedComment(c) });
    expect(s.mutations.has(key)).toBe(false);
  });

  test("a missing Git name blocks the root's writes until Retry resubmits the same request", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => refused(r, "Configure a Git user name before saving comments."));
    await s.mutate("resolve", at, c);
    expect(s.gitMissing("/repo")).toBe(true);
    expect(s.gitMissing("/other")).toBe(false);
    expect(s.mutations.get(key)).toEqual({ status: "idle" });
    api.orphanCommentsMutate.mockImplementationOnce(async r => refused(r, "Configure a Git user name before saving comments."));
    await s.retryGit("/repo");
    expect(s.gitMissing("/repo")).toBe(true);
    await s.retryGit("/repo");
    expect(api.orphanCommentsMutate.mock.calls.map(call => call[0])).toEqual([api.orphanCommentsMutate.mock.calls[0]![0], api.orphanCommentsMutate.mock.calls[0]![0], api.orphanCommentsMutate.mock.calls[0]![0]]);
    expect(s.gitMissing("/repo")).toBe(false);
    expect(s.statusLine?.comment).toBe("c1");
  });

  test("an unknown result is checked by status, and an absent one retried with the same request", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => ok(r, { state: "unknown" }));
    await s.mutate("resolve", at, c);
    expect(s.mutations.get(key)).toEqual({ status: "unknown" });
    await s.check(key);
    const first = api.orphanCommentsMutate.mock.calls[0]![0];
    expect(api.orphanCommentsStatus).toHaveBeenCalledWith({ root: "/repo", canvas: "invoice", requestID: first.requestID });
    expect(s.mutations.get(key)).toEqual({ status: "retry-original" });
    await s.retry(key);
    expect(api.orphanCommentsMutate.mock.calls[1]![0]).toEqual(first);
    expect(s.mutations.get(key)).toEqual({ status: "idle" });
  });

  test("a lost reply is unknown; a reply for another request too", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async () => { throw new Error("ipc"); });
    await s.mutate("resolve", at, c);
    expect(s.mutations.get(key)).toEqual({ status: "unknown" });
    const other = fixture();
    other.api.orphanCommentsMutate.mockImplementationOnce(async r => ({ ok: true, identity: { ...identity(r), requestID: "old" }, value: { state: "saved" } }));
    await other.session.mutate("resolve", at, c);
    expect(other.session.mutations.get(key)).toEqual({ status: "unknown" });
  });

  test.each([
    ["The comment file no longer exists.", { status: "failed", message: "The comment file no longer exists." }],
    ["These comments are no longer without a canvas, or the project could not be read fully.", { status: "failed", message: "These comments are no longer without a canvas, or the project could not be read fully." }],
    ["Comment no longer exists.", { status: "deleted" }],
    ["Comment status changed.", { status: "conflict" }],
  ] as const)("a refusal %s shows as the card's message", async (error, view) => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => refused(r, error));
    await s.mutate("resolve", at, c);
    expect(s.mutations.get(key)).toEqual(view);
    expect(s.gitMissing("/repo")).toBe(false);
  });

  // N2: a refused epoch means read again; Retry after a refusal is a new
  // request built from the latest read, since nothing was written.
  test("Retry after a refusal writes a new request with the latest project and comment", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => refused(r, "Project was closed or reopened; read the current list."));
    await s.mutate("resolve", at, c);
    const later = { ...c, updatedAt: "2026-10-25T00:00:00.000Z" };
    await s.retry(key, { ...at, project: 9 }, later);
    const [first, second] = api.orphanCommentsMutate.mock.calls.map(call => call[0]);
    expect(second!.requestID).not.toBe(first!.requestID);
    expect(second).toMatchObject({ project: 9, intent: { type: "resolve", comment: "c1", expected: expectedComment(later) } });
    expect(s.mutations.get(key)).toEqual({ status: "idle" });
  });

  test("Read latest state after a conflict clears the card's message", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => refused(r, "Comment status changed."));
    await s.mutate("resolve", at, c);
    s.readLatest(key);
    expect(s.mutations.has(key)).toBe(false);
  });

  test("one write at a time", async () => {
    const { session: s, api } = fixture();
    let release = () => {};
    api.orphanCommentsMutate.mockImplementationOnce(r => new Promise(resolve => { release = () => resolve(ok(r, { state: "saved" })); }));
    const first = s.mutate("resolve", at, c);
    expect(s.busy).toBe(true);
    expect(s.mutations.get(key)).toEqual({ status: "saving" });
    await s.mutate("resolve", at, { ...c, comment: "c2" });
    expect(api.orphanCommentsMutate).toHaveBeenCalledTimes(1);
    release(); await first;
    expect(s.busy).toBe(false);
  });

  test("a recovery-blocked root never retries", async () => {
    const { session: s, api } = fixture();
    api.orphanCommentsMutate.mockImplementationOnce(async r => ok(r, { state: "unknown", recovery: "child-exit-required", error: "Directory worker exit is unconfirmed." }));
    await s.mutate("resolve", at, c);
    expect(s.mutations.get(key)).toEqual({ status: "recovery-blocked", message: "Directory worker exit is unconfirmed." });
    await s.retry(key); await s.check(key);
    expect(api.orphanCommentsMutate).toHaveBeenCalledTimes(1);
    expect(api.orphanCommentsStatus).not.toHaveBeenCalled();
  });
});
