import { describe, expect, it } from "vitest";
import claude from "./fixtures/claude.json";
import claudeInterrupted from "./fixtures/claude-interrupted.json";
import codex from "./fixtures/codex.json";
import codexInterrupted from "./fixtures/codex-interrupted.json";
import { normalizeClaude, normalizeCodex, initialTransport, endTransport, claudePermission, codexPermission, permissionAnswer, transportError } from "./transport";
import type { EventPayload, TransportState } from "./types";
function collect(runtime: "claude" | "codex", messages: unknown[], stop: "user" | null = null) {
  let state: TransportState = { ...initialTransport(), stop };
  const events: EventPayload[] = [];
  for (const message of messages) {
    const next = runtime === "claude" ? normalizeClaude(state, message, "/repo") : normalizeCodex(state, message, { root: "/repo", sessionId: "session-1", turnId: "turn-1" });
    state = next.state; events.push(...next.events);
  }
  return { state, events };
}
describe("transport normalization", () => {
  it("normalizes actual sanitized Claude stream, text, tool and completion shapes", () => {
    const result = collect("claude", claude);
    expect(result.events.some(e => e.type === "message.delta")).toBe(true);
    expect(result.events.some(e => e.type === "message.done")).toBe(true);
    expect(result.events.some(e => e.type === "activity")).toBe(true);
    expect(result.events.filter(e => e.type === "turn.done")).toHaveLength(1);
    expect(endTransport(result.state).events).toEqual([]);
  });
  it("normalizes Codex decline-compatible completion without inventing interruption", () => {
    const result = collect("codex", codex);
    expect(result.events.some(e => e.type === "message.delta")).toBe(true);
    expect(result.events.some(e => e.type === "message.done")).toBe(true);
    expect(result.events.filter(e => e.type === "turn.done")).toHaveLength(1);
  });
  it.each(["claude", "codex"] as const)("never treats %s aborted transport as success", runtime => {
    const fixture = runtime === "claude" ? claudeInterrupted : codexInterrupted;
    expect(collect(runtime, fixture, "user").events).toContainEqual({ type: "interrupted", reason: "user" });
    expect(collect(runtime, fixture).events).toContainEqual({ type: "turn.failed", code: "process_exited" });
    expect(collect(runtime, fixture).events.some(e => e.type === "turn.done")).toBe(false);
  });
  it("deduplicates terminal output and reports premature process exit", () => {
    const done = { type: "result", subtype: "success", is_error: false };
    expect(collect("claude", [done, done]).events).toEqual([{ type: "turn.done" }]);
    expect(endTransport(initialTransport()).events).toEqual([{ type: "turn.failed", code: "process_exited" }]);
  });
  it("isolates Codex thread/turn and ignores Claude subagent output", () => {
    expect(normalizeCodex(initialTransport(), { method: "turn/completed", params: { threadId: "other", turn: { id: "turn-1", status: "completed" } } }, { root: "/repo", sessionId: "session-1", turnId: "turn-1" }).events).toEqual([]);
    expect(normalizeClaude(initialTransport(), { type: "assistant", parent_tool_use_id: "tool", message: { id: "m", content: [{ type: "text", text: "nested" }] } }, "/repo").events).toEqual([]);
  });
  it("maps known failures without treating unknown output as success", () => {
    expect(transportError("Thread already has an active writer")).toBe("session_in_use");
    expect(transportError("Not logged in")).toBe("not_logged_in");
    expect(transportError("rate limit exceeded")).toBe("rate_limited");
    expect(transportError("unfamiliar error")).toBe("unknown");
    expect(collect("claude", [{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["Not logged in"] }]).events).toContainEqual({ type: "turn.failed", code: "not_logged_in", detail: "Not logged in" });
  });
});
describe("permission choices", () => {
  it("maps Claude callback allow/deny and only exposes suggested persistent updates", () => {
    const request = claudePermission("r", "Write", { file_path: "/repo/design/a.html" }, []);
    expect(request.event.options.map(o => o.kind)).toEqual(["allow", "deny"]);
    expect(permissionAnswer(request, "deny")).toMatchObject({ response: { behavior: "deny", message: "Denied by the user." }, event: { type: "permission.resolved", optionId: "deny" } });
    expect(permissionAnswer(request, "allow")?.response).toEqual({ behavior: "allow", updatedInput: { file_path: "/repo/design/a.html" } });
    expect(permissionAnswer(request, "always")).toBeNull();
    const suggestion = { type: "addRules", rules: [{ toolName: "Write" }], behavior: "allow", destination: "session" };
    expect(permissionAnswer(claudePermission("r", "Write", {}, [suggestion]), "always")?.response).toEqual({ behavior: "allow", updatedInput: {}, updatedPermissions: [suggestion] });
  });
  it("maps Codex file decline separately from cancel and preserves RPC request id zero", () => {
    const raw = codex.find(m => m.method === "item/fileChange/requestApproval");
    const request = codexPermission(raw);
    expect(request).not.toBeNull();
    if (!request) throw new Error("missing approval fixture");
    expect(permissionAnswer(request, "decline")?.response).toEqual({ id: 0, result: { decision: "decline" } });
    expect(permissionAnswer(request, "cancel")).toBeNull();
    expect(permissionAnswer(request, "acceptForSession")?.response).toEqual({ id: 0, result: { decision: "acceptForSession" } });
  });
  it("preserves a supported command policy amendment", () => {
    const request = codexPermission({ id: 9, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i", command: "ls", proposedExecpolicyAmendment: ["ls"] } });
    expect(request).not.toBeNull();
    if (!request) throw new Error("missing command approval");
    expect(permissionAnswer(request, "execpolicy")?.response).toEqual({ id: 9, result: { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["ls"] } } } });
  });
});
