import { describe, expect, it } from "vitest";
import claude from "./fixtures/claude.json";
import claudeInterrupted from "./fixtures/claude-interrupted.json";
import codex from "./fixtures/codex.json";
import codexInterrupted from "./fixtures/codex-interrupted.json";
import codexHome from "./fixtures/codex-home.json";
import { normalizeClaude, normalizeCodex, initialTransport, endTransport, claudePermission, claudePermissionSummary, codexPermission, permissionAnswer, transportError } from "./transport";
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
    const request = claudePermission("r", "Write", { file_path: "/repo/.doan/canvases/a.html" }, [], "/repo");
    expect(request.event.options.map(o => o.kind)).toEqual(["allow", "deny"]);
    expect(permissionAnswer(request, "deny")).toMatchObject({ response: { behavior: "deny", message: "Denied by the user." }, event: { type: "permission.resolved", optionId: "deny" } });
    expect(permissionAnswer(request, "allow")?.response).toEqual({ behavior: "allow", updatedInput: { file_path: "/repo/.doan/canvases/a.html" } });
    expect(permissionAnswer(request, "always")).toBeNull();
    const suggestion = { type: "addRules", rules: [{ toolName: "Write" }], behavior: "allow", destination: "session" };
    expect(permissionAnswer(claudePermission("r", "Write", {}, [suggestion], "/repo"), "always")?.response).toEqual({ behavior: "allow", updatedInput: {}, updatedPermissions: [suggestion] });
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

it("keeps multiple Claude text blocks distinct while connecting each delta to its done", () => {
  const messages = [
    { type: "stream_event", event: { type: "message_start", message: { id: "m" } } },
    { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "First" } } },
    { type: "assistant", message: { id: "m", content: [{ type: "text", text: "First" }] } },
    { type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
    { type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Second" } } },
    { type: "assistant", message: { id: "m", content: [{ type: "text", text: "Second" }] } },
  ];
  const events = collect("claude", messages).events;
  const deltas = events.filter(e => e.type === "message.delta");
  const done = events.filter(e => e.type === "message.done");
  expect(done).toHaveLength(2);
  expect(deltas.map(e => e.messageId)).toEqual(done.map(e => e.messageId));
  expect(new Set(done.map(e => e.messageId)).size).toBe(2);
});
it("shows Codex tool activity when it starts, before completion", () => {
  const message = { method: "item/started", params: { threadId: "session-1", turnId: "turn-1", item: { type: "commandExecution", id: "cmd", command: "ls" } } };
  expect(collect("codex", [message]).events).toContainEqual({ type: "activity", kind: "command", summary: "Running a command" });
});
// Synthetic sentinels only. Command activity is stored and published for every tool call, so it never carries the
// command; permission summaries still show the command being approved and make no secret-free claim.
const SECRETS = ["SYNTH_ENV_SECRET", "SYNTH_BEARER_SECRET", "SYNTH_URL_PASSWORD", "SYNTH_HEREDOC_SECRET"];
const SECRET_COMMAND = "API_TOKEN=SYNTH_ENV_SECRET curl -H 'Authorization: Bearer SYNTH_BEARER_SECRET' https://user:SYNTH_URL_PASSWORD@example.invalid <<'EOF'\nSYNTH_HEREDOC_SECRET\nEOF";
describe("command activity never carries the command", () => {
  it("keeps synthetic secrets out of Codex and Claude command activity", () => {
    const codexEvents = collect("codex", [{ method: "item/started", params: { threadId: "session-1", turnId: "turn-1", item: { type: "commandExecution", id: "c", command: `/bin/zsh -c '${SECRET_COMMAND}'`, commandActions: [{ type: "unknown", command: SECRET_COMMAND }] } } }]).events;
    const claudeEvents = collect("claude", [{ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "b", name: "Bash", input: { command: SECRET_COMMAND, description: "Call https://user:SYNTH_URL_PASSWORD@example.invalid" } }] } }]).events;
    expect([...codexEvents, ...claudeEvents]).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }, { type: "activity", kind: "command", summary: "Running a command" }]);
    for (const secret of SECRETS) expect(JSON.stringify([...codexEvents, ...claudeEvents])).not.toContain(secret);
  });
});
describe("readable activity and permission summaries", () => {
  it("describes the recorded Codex Home run from each item's own data, never its raw type", () => {
    const events = collect("codex", codexHome).events;
    expect(events.filter(e => e.type === "activity" || e.type === "permission.request").map(e => [e.type, e.type === "activity" || e.type === "permission.request" ? e.summary : ""])).toEqual([
      ["activity", "Running a command"],
      ["activity", ".doan/canvases/hello.html"],
      ["permission.request", ".doan/canvases/hello.html"],
    ]);
    expect(events.filter(e => e.type === "turn.done")).toHaveLength(1);
  });
  const context = { root: "/repo", sessionId: "session-1", turnId: "turn-1" };
  const started = (item: Record<string, unknown>) => ({ method: "item/started", params: { threadId: "session-1", turnId: "turn-1", item } });
  const approval = (method: string, params: Record<string, unknown>) => ({ id: 3, method, params: { threadId: "session-1", turnId: "turn-1", itemId: "f", ...params } });
  const summaries = (messages: unknown[]) => collect("codex", messages).events.flatMap(e => e.type === "activity" || e.type === "permission.request" ? [e.summary] : []);
  it("names the first changed file and how many more a Codex file approval covers", () => {
    const changes = ["/repo/a.html", "/repo/b.html", "/elsewhere/c.html"].map(path => ({ path, kind: { type: "update" }, diff: "" }));
    expect(summaries([started({ type: "fileChange", id: "f", changes }), approval("item/fileChange/requestApproval", { reason: null })]))
      .toEqual(["a.html", "b.html", "/elsewhere/c.html", "a.html and 2 more"]);
    expect(summaries([started({ type: "fileChange", id: "f", changes }), approval("item/fileChange/requestApproval", { reason: "Allow writes outside the repo" })]).at(-1)).toBe("Allow writes outside the repo");
  });
  it("falls back to a short phrase when a Codex item carries nothing readable", () => {
    expect(summaries([approval("item/fileChange/requestApproval", { reason: null })])).toEqual(["Editing files"]);
    expect(summaries([approval("item/commandExecution/requestApproval", { reason: null, command: null })])).toEqual(["Running a command"]);
    expect(summaries([started({ type: "commandExecution", id: "c", command: "", commandActions: [] }), started({ type: "fileChange", id: "f", changes: [{ kind: { type: "add" } }] })]))
      .toEqual(["Running a command", "Editing files"]);
    expect(summaries([started({ type: "mcpToolCall", id: "m", server: "doan", tool: "check", arguments: {} }), started({ type: "mcpToolCall", id: "n", server: "", tool: "", arguments: {} })]))
      .toEqual(["check (doan)", "Using a tool"]);
    const long = "x".repeat(5000);
    expect(summaries([approval("item/commandExecution/requestApproval", { command: long })]).map(s => s.length)).toEqual([512]);
    expect(claudePermissionSummary("Bash", { command: long }, "/repo")).toHaveLength(512);
    expect(normalizeCodex(initialTransport(), approval("item/commandExecution/requestApproval", { command: "/bin/zsh -c 'rm x'", commandActions: [{ type: "unknown", command: "rm x" }] }), context).events)
      .toMatchObject([{ type: "permission.request", tool: "commandExecution", summary: "rm x" }]);
  });
  it("caps cached file summaries, bounds their count and drops them once used or at the end of the turn", () => {
    const long = `/repo/${"d".repeat(3000)}.html`;
    const fileItem = (id: string, path = `/repo/${id}.html`) => started({ type: "fileChange", id, changes: [{ path, kind: { type: "add" }, diff: "" }] });
    const ask = (itemId: string) => ({ id: 1, method: "item/fileChange/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId, reason: null } });
    let state = collect("codex", [fileItem("long", long)]).state;
    expect(state.fileSummaries.long).toHaveLength(512);
    const run = (messages: unknown[]) => { const events: EventPayload[] = []; for (const m of messages) { const r = normalizeCodex(state, m, context); state = r.state; events.push(...r.events); } return events; };
    run(Array.from({ length: 100 }, (_, i) => fileItem(`f${i}`)));
    expect(Object.keys(state.fileSummaries).length).toBeLessThanOrEqual(32);
    expect(run([ask("f0")]).at(-1)).toMatchObject({ summary: "Editing files" });
    expect(run([ask("f99")]).at(-1)).toMatchObject({ summary: "f99.html" });
    expect(state.fileSummaries.f99).toBeUndefined();
    run([{ method: "item/completed", params: { threadId: "session-1", turnId: "turn-1", item: { type: "fileChange", id: "f98", changes: [], status: "completed" } } }]);
    expect(state.fileSummaries.f98).toBeUndefined();
    expect(Object.keys(state.fileSummaries).length).toBeGreaterThan(0);
    run([{ method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "completed" } } }]);
    expect(state.fileSummaries).toEqual({});
  });
  it.each([
    ["failed", { method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "failed", error: { message: "x" } } } }],
    ["interrupted", { method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "interrupted" } } }],
  ])("drops cached file summaries when the turn is %s", (_, end) => {
    const item = started({ type: "fileChange", id: "f", changes: [{ path: "/repo/a.html", kind: { type: "add" }, diff: "" }] });
    expect(collect("codex", [item]).state.fileSummaries).toEqual({ f: "a.html" });
    expect(collect("codex", [item, end]).state.fileSummaries).toEqual({});
    expect(endTransport(collect("codex", [item]).state).state.fileSummaries).toEqual({});
  });
  it("marks edits in either canvas directory as inside the design", () => {
    const tool = (path: string) => ({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: path, name: "Write", input: { file_path: path } }] } });
    const inside = collect("claude", [tool("/repo/.doan/ds/button.html"), tool("/repo/.doan/canvases/a.html"), tool("/repo/.doan/dsx/a.html"), tool("/repo/src/a.ts")]).events
      .flatMap(e => e.type === "activity" ? [e.insideDesign] : []);
    expect(inside).toEqual([true, true, false, false]);
  });
  it("describes Claude tools by their input, never by the bare tool name", () => {
    const tool = (name: string, input: Record<string, unknown>) => ({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: name, name, input }] } });
    expect(collect("claude", [tool("Bash", { command: "ls -la", description: "List files" }), tool("Write", { file_path: "/repo/.doan/canvases/a.html" }), tool("Grep", { pattern: "frame" }), tool("WebFetch", {})]).events.map(e => e.type === "activity" ? e.summary : ""))
      .toEqual(["Running a command", ".doan/canvases/a.html", "frame", "Using a tool"]);
    expect(claudePermissionSummary("Edit", { file_path: "/repo/x.css" }, "/repo")).toBe("x.css");
    expect(claudePermissionSummary("Bash", { command: "npm test" }, "/repo")).toBe("npm test");
    expect(claudePermissionSummary("WebFetch", {}, "/repo")).toBe("Using a tool");
  });
});
it("fails closed for an unsupported request rather than silently waiting forever", () => {
  expect(collect("codex", [{ id: 9, method: "item/future/requestApproval", params: { threadId: "session-1", turnId: "turn-1" } }]).events).toContainEqual({ type: "turn.failed", code: "session_unavailable" });
});
it("forwards Codex additional-permission profiles without adding auto-review policy", () => {
  const permissions = { network: { enabled: true }, fileSystem: { read: ["/repo/data"] } };
  const request = codexPermission({ id: 7, method: "item/permissions/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId: "p", cwd: "/repo", permissions } });
  expect(request).not.toBeNull();
  if (!request) throw new Error("missing profile approval");
  expect(permissionAnswer(request, "allow")?.response).toEqual({ id: 7, result: { permissions, scope: "turn" } });
  expect(permissionAnswer(request, "deny")?.response).toEqual({ id: 7, result: { permissions: {}, scope: "turn" } });
  expect(permissionAnswer(request, "always")?.response).toEqual({ id: 7, result: { permissions, scope: "session" } });
});
