import { describe, expect, it } from "vitest";
import request from "./fixtures/codex-mcp-elicitation.json";
import { initialTransport, normalizeCodex, normalizeCodexReply, codexPermission, permissionAnswer } from "./transport";

const context = { root: "/repo", sessionId: "s", turnId: "t" };
const elicitation = { threadId: "s", serverName: "synthetic", mode: "form", message: "Synthetic question", requestedSchema: { type: "object", properties: {} } };

describe("Codex ingress ownership", () => {
  // A form elicitation has no screen, so it is declined (mcp-connectors spec 완료 조건 6) rather than refused as unsupported.
  it.each([null, undefined])("disposes of schema-valid elicitation with turnId %s without attributing it", turnId => {
    const raw = { id: 0, method: "mcpServer/elicitation/request", params: { ...elicitation, ...(turnId === undefined ? {} : { turnId }) } };
    const result = normalizeCodex(initialTransport(), raw, context);
    expect(result).toMatchObject({ request: { id: 0, method: raw.method, disposition: "decline", response: { id: 0, result: { action: "decline" } } }, state: { terminal: false }, events: [] });
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

// mcp-connectors C2: Codex asks before an MCP tool without a read-only hint with mcpServer/elicitation/request. Every such
// request gets one explicit answer, and none of them ends the turn.
describe("Codex MCP elicitation", () => {
  const mcp = { root: "/repo", sessionId: request.params.threadId, turnId: request.params.turnId, labels: { "doan-echo-poc": "Echo" } };
  const withParams = (patch: Record<string, unknown>) => ({ ...request, params: { ...request.params, ...patch } });
  it("asks for a tool approval as a permission request named with the connector", () => {
    const result = normalizeCodex(initialTransport(), request, mcp);
    expect(result.request).toEqual({ id: 7, method: request.method, disposition: "permission" });
    expect(result.state.terminal).toBe(false);
    expect(result.events).toEqual([{ type: "permission.request", requestId: "number:7", tool: "mcpToolCall", summary: "Run ping on Echo", options: [{ id: "accept", label: "Allow", kind: "allow" }, { id: "decline", label: "Deny", kind: "deny" }, { id: "acceptForSession", label: "Allow for this session", kind: "allowAlways" }] }]);
    const permission = codexPermission(request, {}, mcp.labels);
    expect(permission?.event).toEqual(result.events[0]);
    expect(permission && permissionAnswer(permission, "decline")?.response).toEqual({ id: 7, result: { action: "decline" } });
  });
  it("names a doan- server with the presets when the context carries no labels, and never its doan- name", () => {
    const { labels: _, ...bare } = mcp;
    expect(normalizeCodex(initialTransport(), withParams({ serverName: "doan-notion", message: 'Allow the doan-notion MCP server to run tool "notion-fetch"?' }), bare).events).toMatchObject([{ summary: "Run notion-fetch on Notion" }]);
    expect(normalizeCodex(initialTransport(), request, bare).events).toMatchObject([{ summary: "Run ping on echo-poc" }]);
  });
  it("declines any other elicitation without asking and without ending the turn", () => {
    const form = withParams({ _meta: { codex_approval_kind: "form" } });
    const result = normalizeCodex(initialTransport(), form, mcp);
    expect(result).toMatchObject({ request: { id: 7, method: request.method, disposition: "decline", response: { id: 7, result: { action: "decline" } } }, state: { terminal: false }, events: [] });
  });
  it("declines a tool approval that comes after the turn ended", () => {
    const result = normalizeCodex({ ...initialTransport(), terminal: true }, request, mcp);
    expect(result).toMatchObject({ request: { disposition: "decline", response: { id: 7, result: { action: "decline" } } }, events: [] });
  });
  it.each([null, undefined])("declines an elicitation of this thread whose turnId is %s", turnId => {
    const raw = { ...request, params: { ...request.params, ...(turnId === undefined ? { turnId: undefined } : { turnId }) } };
    expect(normalizeCodex(initialTransport(), raw, mcp)).toMatchObject({ request: { disposition: "decline" }, state: { terminal: false }, events: [] });
  });
  it.each([{ threadId: "other" }, { turnId: "other" }])("routes another owner's elicitation without answering it here: %j", identity => {
    const result = normalizeCodex(initialTransport(), withParams(identity), mcp);
    expect(result).toMatchObject({ request: { disposition: "route" }, state: { terminal: false }, events: [] });
    expect(result.request).not.toHaveProperty("response");
  });
  it("names a Doan connector's MCP tool activity with the connector, not its doan- name", () => {
    const item = (server: string) => ({ method: "item/started", params: { threadId: mcp.sessionId, turnId: mcp.turnId, item: { type: "mcpToolCall", id: `i-${server}`, tool: "ping", server, arguments: { page: "secret" } } } });
    expect(normalizeCodex(initialTransport(), item("doan-echo-poc"), mcp).events).toEqual([{ type: "activity", kind: "other", summary: "ping (Echo)" }]);
    expect(normalizeCodex(initialTransport(), item("codex_apps"), mcp).events).toEqual([{ type: "activity", kind: "other", summary: "ping (codex_apps)" }]);
  });
});
