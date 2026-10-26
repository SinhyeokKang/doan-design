import { describe, expect, it } from "vitest";
import { initialTransport, normalizeCodex, normalizeCodexReply, codexPermission, permissionAnswer } from "./transport";

const context = { root: "/repo", sessionId: "s", turnId: "t" };
const elicitation = { threadId: "s", serverName: "synthetic", mode: "form", message: "Synthetic question", requestedSchema: { type: "object", properties: {} } };

describe("Codex ingress ownership", () => {
  it.each([null, undefined])("disposes of schema-valid elicitation with turnId %s without attributing it", turnId => {
    const raw = { id: 0, method: "mcpServer/elicitation/request", params: { ...elicitation, ...(turnId === undefined ? {} : { turnId }) } };
    const result = normalizeCodex(initialTransport(), raw, context);
    expect(result).toMatchObject({ request: { id: 0, method: raw.method, disposition: "unsupported" }, state: { terminal: false }, events: [] });
  });
  it("disposes of a schema-valid global attestation request", () => {
    expect(normalizeCodex(initialTransport(), { id: 8, method: "attestation/generate", params: {} }, context)).toMatchObject({ request: { id: 8, disposition: "unsupported" }, state: { terminal: false }, events: [] });
  });
  it.each([{ threadId: "other", turnId: "t" }, { threadId: "s", turnId: "other" }])("routes other-owner requests without failing this turn: %j", identity => {
    expect(normalizeCodex(initialTransport(), { id: 4, method: "item/fileChange/requestApproval", params: identity }, context)).toMatchObject({ request: { disposition: "route" }, state: { terminal: false }, events: [] });
  });
  it("returns an explicit rejection even after the current turn ended", () => {
    expect(normalizeCodex({ ...initialTransport(), terminal: true }, { id: 1, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } }, context)).toMatchObject({ request: { disposition: "unsupported" }, events: [] });
  });
  it("keeps request envelopes out of notification handling", () => {
    expect(normalizeCodex(initialTransport(), { id: 1, method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } }, context)).toMatchObject({ request: { disposition: "unsupported" }, events: [{ type: "turn.failed", code: "session_unavailable" }] });
  });
  it.each([{ threadId: "other", id: "t" }, { threadId: "s", id: "other" }])("ignores extra top-level error on an unrelated notification: %j", identity => {
    const state = initialTransport();
    const result = normalizeCodex(state, { method: "turn/completed", params: { threadId: identity.threadId, turn: { id: identity.id, status: "completed" } }, error: { message: "synthetic unrelated error" } }, context);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(normalizeCodex(result.state, { method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } }, context).events).toEqual([{ type: "turn.done" }]);
  });
  it("does not attribute an unowned RPC error to this turn", () => {
    expect(normalizeCodex(initialTransport(), { id: 999, error: { code: -1, message: "synthetic unrelated error" } }, context)).toMatchObject({ state: { terminal: false }, events: [] });
  });
});


describe("Codex reply and permission boundaries", () => {
  const owner = { requestId: 0, sessionId: "s", turnId: "t" };
  const reply = { id: 0, error: { code: -1, message: "Thread already has an active writer" } };
  it("maps a reply error only with explicit matching pending-RPC ownership", () => {
    expect(normalizeCodexReply(initialTransport(), reply, context, owner).events).toEqual([{ type: "turn.failed", code: "session_in_use", detail: reply.error.message }]);
  });
  it.each([{ ...owner, requestId: "0" }, { ...owner, sessionId: "other" }, { ...owner, turnId: "other" }])("ignores mismatched ownership %j", mismatch => {
    expect(normalizeCodexReply(initialTransport(), reply, context, mismatch).events).toEqual([]);
  });
  it.each([
    { ...reply, method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } },
    { ...reply, result: {} },
    { id: 0, result: {} },
  ])("does not reinterpret a non-error-reply envelope %j", raw => {
    expect(normalizeCodexReply(initialTransport(), raw, context, owner).events).toEqual([]);
  });
  it("preserves real approval responses despite an extra top-level error", () => {
    const raw = { id: 0, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i" }, error: reply.error };
    expect(normalizeCodex(initialTransport(), raw, context)).toMatchObject({ request: { disposition: "permission" }, state: { terminal: false }, events: [{ type: "permission.request" }] });
    const permission = codexPermission(raw);
    if (!permission) throw new Error("missing permission");
    expect(permissionAnswer(permission, "decline")?.response).toEqual({ id: 0, result: { decision: "decline" } });
  });
  it("does not fabricate permissions from a notification missing a request ID", () => {
    expect(normalizeCodex(initialTransport(), { method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } }, context).events).toEqual([]);
  });
  it("keeps current-turn notification semantics despite an extra top-level error", () => {
    expect(normalizeCodex(initialTransport(), { method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } }, error: reply.error }, context).events).toEqual([{ type: "turn.done" }]);
  });
});
