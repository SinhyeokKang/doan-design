import { describe, expect, it } from "vitest";
import claude from "./fixtures/claude.json";
import claudeInterrupted from "./fixtures/claude-interrupted.json";
import codex from "./fixtures/codex.json";
import codexInterrupted from "./fixtures/codex-interrupted.json";
import codexHome from "./fixtures/codex-home.json";
import codexModelNotFound from "./fixtures/codex-model-not-found.json";
import askFixture from "./fixtures/claude-ask-user-question.json";
import runMode from "./fixtures/claude-run-mode.json";
import claudeEdits from "./fixtures/claude-edit-results.json";
import codexEdits from "./fixtures/codex-file-changes.json";
import { normalizeClaude, normalizeCodex, initialTransport, endTransport, claudePermission, claudePermissionSummary, codexPermission, permissionAnswer, transportError, claudeModeReport, steerTransport, endSteerWait, claudeQuestion, claudeQuestionResult, claudeUnansweredSupport, storedAnswers, claudeFastOutcome } from "./transport";
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
    // Codex 0.144.2's own words for a reached usage limit (a session rollout on this Mac).
    expect(transportError("You've hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at Jul 25th, 2026 1:02 PM.")).toBe("rate_limited");
    expect(transportError("unfamiliar error")).toBe("unknown");
    expect(collect("claude", [{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["Not logged in"] }]).events).toContainEqual({ type: "turn.failed", code: "not_logged_in", detail: "Not logged in" });
  });
});
// Claude Code answers a limited account with a made-up assistant message (model "<synthetic>", an `error` field, the
// limit text) and then an error result carrying the same text. Shape: Claude Code transcripts under ~/.claude/projects
// and SDKAssistantMessage.error in SDK 0.3.312; the result frame's exact fields are as for any is_error result.
describe("a Claude turn that Claude Code ends with its own error message", () => {
  const LIMIT = "You've hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)";
  const synthetic = (error: string, body: string) => ({ type: "assistant", parent_tool_use_id: null, error, message: { id: "synthetic-1", model: "<synthetic>", role: "assistant", content: [{ type: "text", text: body }] } });
  const ended = (body: string) => ({ type: "result", subtype: "success", is_error: true, result: body });
  it("fails as rate_limited, keeping the text, on the assistant frame's rate_limit error", () => {
    expect(collect("claude", [synthetic("rate_limit", LIMIT), ended(LIMIT)]).events).toEqual([
      { type: "message.done", messageId: "synthetic-1", text: LIMIT },
      { type: "turn.failed", code: "rate_limited", detail: LIMIT },
    ]);
  });
  it("reads the structured error even when the wording is not one it knows", () => {
    expect(collect("claude", [synthetic("rate_limit", "Slow down"), ended("Slow down")]).events).toContainEqual({ type: "turn.failed", code: "rate_limited", detail: "Slow down" });
  });
  it("fails as not_logged_in on an authentication_failed error, and leaves other error values to the text", () => {
    expect(collect("claude", [synthetic("authentication_failed", "Login expired · Please run /login"), ended("Login expired · Please run /login")]).events)
      .toContainEqual({ type: "turn.failed", code: "not_logged_in", detail: "Login expired · Please run /login" });
    expect(collect("claude", [synthetic("server_error", "API Error: boom"), ended("API Error: boom")]).events).toContainEqual({ type: "turn.failed", code: "unknown", detail: "API Error: boom" });
  });
  it("does not carry the error over once a later call of the turn went through", () => {
    const events = collect("claude", [synthetic("rate_limit", LIMIT), { type: "assistant", parent_tool_use_id: null, message: { id: "a2", model: "claude-x", content: [{ type: "text", text: "back" }] } }, ended("boom")]).events;
    expect(events).toContainEqual({ type: "turn.failed", code: "unknown", detail: "boom" });
  });
  it("reads the weekly-limit wording of a result that no assistant frame announced", () => {
    expect(transportError(LIMIT)).toBe("rate_limited");
    expect(collect("claude", [ended(LIMIT)]).events).toEqual([{ type: "turn.failed", code: "rate_limited", detail: LIMIT }]);
  });
});
// A model the account does not have ends the turn before it starts any work. The model ID is the one
// the error names: Doan never sent it (ipc.ts takes only models on this run's model/list).
describe("a model the account does not have", () => {
  const detail = "The 'gpt-6-astra' model is not supported when using Codex with a ChatGPT account.";
  it("reads Codex's modelNotFound turn error as model_unavailable with the model it names, once", () => {
    expect(collect("codex", codexModelNotFound).events).toEqual([{ type: "turn.failed", code: "model_unavailable", model: "gpt-6-astra", detail }]);
    // turn/completed alone carries the same error.
    expect(collect("codex", codexModelNotFound.filter(m => m.method !== "error")).events).toEqual([{ type: "turn.failed", code: "model_unavailable", model: "gpt-6-astra", detail }]);
  });
  it("keeps any other turn error, or a modelNotFound naming no model, as before", () => {
    const failing = (error: object) => [{ method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "failed", error } } }];
    expect(collect("codex", failing({ message: "boom", codexErrorInfo: "internalServerError" })).events).toEqual([{ type: "turn.failed", code: "unknown", detail: "boom" }]);
    expect(collect("codex", failing({ message: "Model not found", codexErrorInfo: "modelNotFound" })).events).toEqual([{ type: "turn.failed", code: "unknown", detail: "Model not found" }]);
    expect(collect("codex", failing({ message: detail })).events).toEqual([{ type: "turn.failed", code: "unknown", detail }]);
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

// The approval card leads with what will run; the agent's own words (Claude's description, Codex's reason) are a second
// line, and a choice that saves a rule says which.
describe("approval card content", () => {
  it("shows a Claude command, not its description, and keeps the description as the reason", () => {
    const event = claudePermission("r", "Bash", { command: "npm test", description: "Run the tests" }, [], "/repo").event;
    expect(event).toMatchObject({ summary: "npm test", reason: "Run the tests" });
    expect(claudePermission("r", "Write", { file_path: "/repo/a.html", description: "Save" }, [], "/repo").event).toMatchObject({ summary: "a.html", reason: "Save" });
    expect(claudePermission("r", "NotebookEdit", { notebook_path: "/elsewhere/n.ipynb" }, [], "/repo").event.summary).toBe("/elsewhere/n.ipynb");
    expect(claudePermission("r", "WebFetch", { url: "https://example.invalid/a", prompt: "Read it" }, [], "/repo").event.summary).toBe("https://example.invalid/a");
    expect("reason" in claudePermission("r", "Bash", { command: "ls" }, [], "/repo").event).toBe(false);
  });
  it("marks a cut reason", () => {
    expect(claudePermission("r", "Bash", { command: "ls", description: "d".repeat(600) }, [], "/repo").event.reason).toBe(`${"d".repeat(511)}…`);
  });
  it("keeps the activity of a non-command tool as it was", () => {
    const tool = { type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t", name: "mcp__claude_ai_Figma__get_screenshot", input: { description: "Take a screenshot" } }] } };
    expect(collect("claude", [tool]).events).toEqual([{ type: "activity", kind: "other", summary: "Take a screenshot" }]);
  });
  it("shows a Codex command, not its reason, and keeps the reason", () => {
    const request = codexPermission({ id: 4, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i", command: "npm run build", reason: "Build the app" } });
    expect(request?.event).toMatchObject({ summary: "npm run build", reason: "Build the app" });
  });
  it("names the rule a Codex command rule choice saves", () => {
    const request = codexPermission({ id: 9, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i", command: "npm test", proposedExecpolicyAmendment: ["npm", "test"] } });
    const options = request?.event.type === "permission.request" ? request.event.options : [];
    expect(options.find(o => o.id === "execpolicy")).toEqual({
      id: "execpolicy", label: "Allow with proposed command rule", kind: "allowAlways", detail: "Adds a rule that runs commands starting with “npm test” without asking.",
    });
    // The one-time choices save nothing, so they carry no detail.
    expect(options.filter(o => o.id !== "execpolicy").every(o => !("detail" in o))).toBe(true);
    const spaced = codexPermission({ id: 9, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i", command: "x", proposedExecpolicyAmendment: ["sh", "-c", "a b"] } });
    expect(spaced?.event.type === "permission.request" && spaced.event.options.find(o => o.id === "execpolicy")?.detail).toBe("Adds a rule that runs commands starting with “sh -c \"a b\"” without asking.");
  });
  it("names what Claude's suggested permissions save and where", () => {
    const detail = (suggestions: unknown[]) => claudePermission("r", "Bash", { command: "npm test" }, suggestions, "/repo").event.options.find(o => o.id === "always")?.detail;
    expect(detail([{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm test:*" }], behavior: "allow", destination: "localSettings" }]))
      .toBe("Adds the allow rule Bash(npm test:*) in .claude/settings.local.json.");
    expect(detail([{ type: "addRules", rules: [{ toolName: "Read" }, { toolName: "Bash", ruleContent: "ls:*" }], behavior: "allow", destination: "session" }]))
      .toBe("Adds the allow rules Read, Bash(ls:*) in this session.");
    expect(detail([{ type: "addDirectories", directories: ["/elsewhere"], destination: "projectSettings" }, { type: "setMode", mode: "acceptEdits", destination: "userSettings" }]))
      .toBe("Allows access to /elsewhere in .claude/settings.json. Switches to the acceptEdits mode in your Claude Code user settings.");
    expect(detail([{ type: "future", value: 1 }])).toBe('{"type":"future","value":1}');
    expect(claudePermission("r", "Bash", { command: "npm test" }, [], "/repo").event.options.every(o => !("detail" in o))).toBe(true);
  });
  const codexCommand = (params: Record<string, unknown>) => codexPermission({ id: 5, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "i", ...params } })?.event;
  // Codex's display parse can name only part of the line; Allow answers for the whole line.
  it("shows the whole Codex command even when Codex parsed it into one action", () => {
    expect(codexCommand({ command: "/bin/zsh -lc 'cat notes.txt | tee copy.txt'", commandActions: [{ type: "read", command: "cat notes.txt", name: "notes.txt", path: "/repo/notes.txt" }] })?.summary)
      .toBe("cat notes.txt | tee copy.txt");
    expect(codexCommand({ command: "/bin/zsh -lc 'cd sub && ls'", commandActions: [{ type: "listFiles", command: "ls", path: "sub" }] })?.summary).toBe("cd sub && ls");
  });
  it("takes off only Codex's own login-shell wrapper, decoding its quoting, and shows any other command as sent", () => {
    // Codex quotes the script as one word, switching to single quotes around $, ` and ! (as recorded from 0.169.0).
    expect(codexCommand({ command: `/bin/zsh -lc "echo \\"it's\\" "'$HOME \`id\` "a'"\\\\b\\" "'! > a.txt'` })?.summary).toBe("echo \"it's\" $HOME `id` \"a\\b\" ! > a.txt");
    expect(codexCommand({ command: "/bin/bash -c 'ls\nwc -l a.txt'" })?.summary).toBe("ls\nwc -l a.txt");
    expect(codexCommand({ command: "/bin/zsh -lc ls" })?.summary).toBe("ls");
    // Another shell, a second word or quoting that does not close is not Codex's wrapper.
    expect(codexCommand({ command: "./zsh -lc 'ls'" })?.summary).toBe("./zsh -lc 'ls'");
    expect(codexCommand({ command: "/bin/zsh -lc 'ls' 'pwd'" })?.summary).toBe("/bin/zsh -lc 'ls' 'pwd'");
    expect(codexCommand({ command: "/bin/zsh -lc 'ls" })?.summary).toBe("/bin/zsh -lc 'ls");
    expect(codexCommand({ command: "/bin/zsh -lc \"echo $HOME\"" })?.summary).toBe("/bin/zsh -lc \"echo $HOME\"");
  });
  it("leads an MCP tool's card with the tool and its server, then its arguments", () => {
    expect(claudePermission("r", "mcp__files__open_item", { path: "/repo/a.txt", url: "https://example.invalid/a" }, [], "/repo").event.summary)
      .toBe("Run open_item on files\n{\"path\":\"/repo/a.txt\",\"url\":\"https://example.invalid/a\"}");
    expect(claudePermissionSummary("mcp__files__run", { command: "ls" }, "/repo")).toBe("Run run on files\n{\"command\":\"ls\"}");
    expect(claudePermissionSummary("mcp__files__list", {}, "/repo")).toBe("Run list on files");
    expect(claudePermissionSummary("mcp__files__list", { q: "x".repeat(9000) }, "/repo")).toHaveLength(8192);
  });
  it("shows bidi controls and invisible characters as visible escapes", () => {
    const event = claudePermission("r", "Bash", { command: "echo ‮a​b⁦c\u{E0041}\rㅤd\n\te", description: "Look‮" }, [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "echo⁧:*" }], behavior: "allow", destination: "session" }], "/repo").event;
    expect(event.summary).toBe("echo <U+202E>a<U+200B>b<U+2066>c<U+E0041><U+000D><U+3164>d\n\te");
    expect(event.reason).toBe("Look<U+202E>");
    expect(event.options.find(o => o.id === "always")?.detail).toBe("Adds the allow rule Bash(echo<U+2067>:*) in this session.");
    expect(codexCommand({ command: "/bin/zsh -lc 'ls ‮x'", reason: "‏why" })).toMatchObject({ summary: "ls <U+202E>x", reason: "<U+200F>why" });
    // Default-ignorable code points outside the format category draw as nothing too, variation selectors included.
    expect(claudePermissionSummary("Bash", { command: "echo x\u{E0101}\u{E0102}\uFE0F\u034F\u2065y" }, "/repo")).toBe("echo x<U+E0101><U+E0102><U+FE0F><U+034F><U+2065>y");
    // An escaped text still keeps within the bound and marks the cut.
    expect(claudePermissionSummary("Bash", { command: "‮".repeat(3000) }, "/repo")).toHaveLength(8192);
    expect(claudePermissionSummary("Bash", { command: "‮".repeat(3000) }, "/repo").endsWith("…")).toBe(true);
  });
  it("names what a Codex network rule choice saves", () => {
    const options = codexCommand({ command: "curl https://example.invalid", proposedNetworkPolicyAmendments: [{ host: "example.invalid", action: "allow" }, { host: "ads.invalid", action: "deny" }] })?.options ?? [];
    expect(options.find(o => o.id === "network-0")).toEqual({ id: "network-0", label: "Allow example.invalid", kind: "allowAlways", detail: "Adds a rule that allows network access to “example.invalid” without asking." });
    expect(options.find(o => o.id === "network-1")).toEqual({ id: "network-1", label: "Deny ads.invalid", kind: "deny", detail: "Adds a rule that blocks network access to “ads.invalid”." });
  });
  it("keeps an agent's value inside Doan's quotes in a saving choice's sentence", () => {
    const options = codexCommand({ command: "x", proposedExecpolicyAmendment: ["a”b"], proposedNetworkPolicyAmendments: [{ host: "h”.“x", action: "allow" }] })?.options ?? [];
    expect(options.find(o => o.id === "execpolicy")?.detail).toBe("Adds a rule that runs commands starting with “a<U+201D>b” without asking.");
    expect(options.find(o => o.id === "network-0")?.detail).toBe("Adds a rule that allows network access to “h<U+201D>.<U+201C>x” without asking.");
    const file = codexPermission({ id: 6, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t", itemId: "f", grantRoot: "/a”b" } })?.event.options ?? [];
    expect(file.find(o => o.id === "acceptForSession")?.detail).toBe("Codex also asks to allow writes anywhere under “/a<U+201D>b” for the rest of this session.");
  });
  it("names the folder a Codex file approval's session choice also asks for", () => {
    const ask = (params: Record<string, unknown>) => codexPermission({ id: 6, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t", itemId: "f", ...params } })?.event.options ?? [];
    expect(ask({ grantRoot: "/elsewhere" }).find(o => o.id === "acceptForSession")?.detail).toBe("Codex also asks to allow writes anywhere under “/elsewhere” for the rest of this session.");
    expect(ask({ grantRoot: null }).every(o => !("detail" in o))).toBe(true);
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
      .toEqual(["a.html", "b.html", "/elsewhere/c.html", "a.html, b.html, /elsewhere/c.html"]);
    // The agent's reason never stands in for the files the approval covers.
    const withReason = collect("codex", [started({ type: "fileChange", id: "f", changes }), approval("item/fileChange/requestApproval", { reason: "Allow writes outside the repo" })]).events.at(-1);
    expect(withReason).toMatchObject({ type: "permission.request", summary: "a.html, b.html, /elsewhere/c.html", reason: "Allow writes outside the repo" });
  });
  it("falls back to a short phrase when a Codex item carries nothing readable", () => {
    expect(summaries([approval("item/fileChange/requestApproval", { reason: null })])).toEqual(["Editing files"]);
    expect(summaries([approval("item/commandExecution/requestApproval", { reason: null, command: null })])).toEqual(["Running a command"]);
    expect(summaries([started({ type: "commandExecution", id: "c", command: "", commandActions: [] }), started({ type: "fileChange", id: "f", changes: [{ kind: { type: "add" } }] })]))
      .toEqual(["Running a command", "Editing files"]);
    expect(summaries([started({ type: "mcpToolCall", id: "m", server: "doan", tool: "check", arguments: {} }), started({ type: "mcpToolCall", id: "n", server: "", tool: "", arguments: {} })]))
      .toEqual(["check (doan)", "Using a tool"]);
    // A cut command says so: its last character is the ellipsis.
    const long = "x".repeat(9000);
    expect(summaries([approval("item/commandExecution/requestApproval", { command: long })])).toEqual([`${"x".repeat(8191)}…`]);
    expect(claudePermissionSummary("Bash", { command: long }, "/repo")).toBe(`${"x".repeat(8191)}…`);
    expect(claudePermissionSummary("Bash", { command: "x".repeat(8192) }, "/repo")).toBe("x".repeat(8192));
    expect(normalizeCodex(initialTransport(), approval("item/commandExecution/requestApproval", { command: "/bin/zsh -c 'rm x'", commandActions: [{ type: "unknown", command: "rm x" }] }), context).events)
      .toMatchObject([{ type: "permission.request", tool: "commandExecution", summary: "rm x" }]);
  });
  it("caps cached file summaries, bounds their count and drops them once used or at the end of the turn", () => {
    const long = `/repo/${"d".repeat(3000)}.html`;
    const fileItem = (id: string, path = `/repo/${id}.html`) => started({ type: "fileChange", id, changes: [{ path, kind: { type: "add" }, diff: "" }] });
    const ask = (itemId: string) => ({ id: 1, method: "item/fileChange/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId, reason: null } });
    let state = collect("codex", [fileItem("long", long)]).state;
    expect(state.fileSummaries.long).toBe(long.slice("/repo/".length));
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
  // A Doan connector's tool is named with the connector, and its input (page ids,
  // queries, bodies) never reaches the summary or the stored activity.
  it("names a Doan MCP connector's tool and its connector, never its input or internal doan- name", () => {
    const input = { description: "Read the spec page", path: "/repo/secret.md", pattern: "token", id: "page-123" };
    expect(claudePermissionSummary("mcp__doan-notion__notion-fetch", input, "/repo")).toBe("Run notion-fetch on Notion");
    expect(claudePermissionSummary("mcp__doan-example-com__search", input, "/repo", { "doan-example-com": "example.com" })).toBe("Run search on example.com");
    expect(claudePermissionSummary("mcp__doan-notion__notion-fetch", input, "/repo", { "doan-notion": "Notion" })).toBe("Run notion-fetch on Notion");
    // A tool name may itself hold double underscores.
    expect(claudePermissionSummary("mcp__doan-figma__get__node", {}, "/repo")).toBe("Run get__node on Figma");
    // A connector missing from the labels (removed meanwhile) shows its slug.
    expect(claudePermissionSummary("mcp__doan-example-com__search", input, "/repo")).toBe("Run search on example-com");
    expect(claudePermissionSummary(`mcp__doan-notion__${"t".repeat(2000)}`, {}, "/repo")).toHaveLength(512);
    expect(claudePermissionSummary(`mcp__doan-notion__${"t".repeat(2000)}`, {}, "/repo").endsWith("…")).toBe(true);
    expect(claudePermission("r1", "mcp__doan-notion__notion-fetch", input, [], "/repo").event.summary).toBe("Run notion-fetch on Notion");
    const tool = { type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t1", name: "mcp__doan-notion__notion-fetch", input }] } };
    // The activity is stored for every call, so the input's path stays out of it as well.
    expect(collect("claude", [tool]).events).toEqual([{ type: "activity", kind: "other", summary: "Run notion-fetch on Notion" }]);
    const added = { type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t2", name: "mcp__doan-example-com__search", input: { file_path: "/repo/.doan/canvases/a.html" } }] } };
    expect(normalizeClaude(initialTransport(), added, "/repo", { "doan-example-com": "example.com" }).events).toEqual([{ type: "activity", kind: "other", summary: "Run search on example.com" }]);
    expect(claudePermission("r2", "mcp__doan-example-com__search", input, [], "/repo", { "doan-example-com": "example.com" }).event.summary).toBe("Run search on example.com");
    // Another server's tool keeps the path an input names, as any tool does.
    const other = { type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t3", name: "mcp__claude_ai_Figma__get_screenshot", input: { path: "/repo/a.html" } }] } };
    expect(collect("claude", [other]).events).toMatchObject([{ type: "activity", path: "/repo/a.html" }]);
  });
  it("names other MCP servers' tools and lookalike names by server and tool, never by the agent's description", () => {
    // The tool and server lead; the arguments, a description among them, follow as they were sent.
    expect(claudePermissionSummary("mcp__claude_ai_Figma__get_screenshot", { description: "Take a screenshot" }, "/repo")).toBe("Run get_screenshot on claude_ai_Figma\n{\"description\":\"Take a screenshot\"}");
    expect(claudePermissionSummary("mcp__notion__notion-fetch", { description: "Fetch" }, "/repo")).toBe("Run notion-fetch on notion\n{\"description\":\"Fetch\"}");
    expect(claudePermission("r", "mcp__notion__notion-fetch", { description: "Fetch" }, [], "/repo").event).toMatchObject({ summary: "Run notion-fetch on notion\n{\"description\":\"Fetch\"}", reason: "Fetch" });
    expect(claudePermissionSummary("mcp__doan-__x", {}, "/repo")).toBe("Run x on doan-");
    expect(claudePermissionSummary("mcp__doan-notion__", { description: "Fetch" }, "/repo")).toBe("Using a tool");
    expect(claudePermissionSummary("mcp__doan-Notion__x", {}, "/repo")).toBe("Run x on doan-Notion");
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
// Without a reason, the summary names each permission kind in a readable line (Codex app-server 0.169.0's
// RequestPermissionProfile), capped like the other permission summaries.
describe("Codex permission profile summary", () => {
  const summaryOf = (permissions: unknown, reason: string | null = null) => {
    const request = codexPermission({ id: 7, method: "item/permissions/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId: "p", cwd: "/repo", reason, permissions } });
    if (!request || request.event.type !== "permission.request") throw new Error("missing profile approval");
    return request.event.summary;
  };
  it("names the permissions even when Codex gives a reason, which goes on its own line", () => {
    expect(summaryOf({ network: { enabled: true }, fileSystem: null }, "Needs to download fonts")).toBe("Use the network");
    const request = codexPermission({ id: 7, method: "item/permissions/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId: "p", cwd: "/repo", reason: "Needs to download fonts", permissions: { network: { enabled: true } } } });
    expect(request?.event).toMatchObject({ summary: "Use the network", reason: "Needs to download fonts" });
  });
  it("names network access, paths to read and paths to write, relative to the working folder", () => {
    expect(summaryOf({ network: { enabled: true }, fileSystem: { read: ["/repo/data"], write: ["/repo/out", "/repo/tmp", "/elsewhere"] } }))
      .toBe("Use the network; Read data; Write out, tmp, /elsewhere");
    expect(summaryOf({ network: { enabled: false }, fileSystem: { read: null, write: ["/repo/out"] } })).toBe("Write out");
  });
  it("reads file system entries by access, with glob patterns and special paths", () => {
    expect(summaryOf({ network: null, fileSystem: { read: null, write: null, entries: [
      { path: { type: "path", path: "/repo/src" }, access: "write" },
      { path: { type: "glob_pattern", pattern: "**/*.png" }, access: "read" },
      { path: { type: "special", value: { kind: "tmpdir" } }, access: "write" },
      { path: { type: "path", path: "/repo/.env" }, access: "deny" },
    ] } })).toBe("Read **/*.png; Write src, the temporary folder; No access to .env");
  });
  it("leaves an unknown shape as short JSON and caps the whole summary", () => {
    const unknown = summaryOf({ network: null, fileSystem: null, browser: { origins: ["https://example.com/".repeat(40)] } });
    expect(unknown.startsWith('{"browser":')).toBe(true);
    expect(unknown.length).toBeLessThanOrEqual(121);
    const cut = summaryOf({ network: { enabled: true }, fileSystem: { read: [`/elsewhere/${"x".repeat(9000)}`], write: null } });
    expect(cut).toHaveLength(8192);
    expect(cut.endsWith("…")).toBe(true);
  });
});
// One reader for the mode Claude reports, in Claude's own ids (frames: claude-run-mode.json, PoC, Claude Code 2.1.312).
describe("Claude mode reader", () => {
  it("reads the mode an Ask first turn's top-level system/init reports, as Claude's own id", () => {
    const read = Object.fromEntries(Object.entries(runMode.init).map(([name, frame]) => [name, claudeModeReport(frame)]));
    expect(read).toEqual({
      none: { source: "init", mode: "default" },
      "project-auto": { source: "init", mode: "default" }, "project-local-auto": { source: "init", mode: "default" }, "profile-auto": { source: "init", mode: "auto" },
      "project-dontAsk": { source: "init", mode: "dontAsk" }, "profile-dontAsk": { source: "init", mode: "dontAsk" },
      "project-acceptEdits": { source: "init", mode: "acceptEdits" }, "profile-acceptEdits": { source: "init", mode: "acceptEdits" },
      "project-plan": { source: "init", mode: "plan" }, "profile-plan": { source: "init", mode: "plan" },
      "project-bypassPermissions": { source: "init", mode: "default" }, "project-local-bypassPermissions": { source: "init", mode: "default" }, "profile-bypassPermissions": { source: "init", mode: "bypassPermissions" },
    });
  });
  it("reads a status message's mode, a plan approval's and a suggestion's setMode alike", () => {
    for (const frame of Object.values(runMode.approval)) expect(claudeModeReport(frame)).toEqual({ source: "status", mode: "default" });
    expect(claudeModeReport(runMode.setMode)).toEqual({ source: "status", mode: "acceptEdits" });
  });
  // A steer after the reply began runs as the next turn, whose init reports the process's mode then.
  it("reads each mode frame of a steered run in order and skips status frames without a mode", () => {
    expect(runMode.steered.map(claudeModeReport)).toEqual([
      { source: "init", mode: "default" }, undefined, { source: "status", mode: "acceptEdits" }, undefined, { source: "init", mode: "acceptEdits" }, undefined, undefined,
    ]);
  });
  // The PoC saw no subagent init or status; the two system frames are synthetic, shaped like the top-level ones.
  it("ignores a subagent's frames and every other message", () => {
    for (const frame of runMode.subagent) expect(claudeModeReport(frame)).toBeUndefined();
    const parent = runMode.subagent[0]!.parent_tool_use_id;
    expect(claudeModeReport({ ...runMode.init["profile-auto"], parent_tool_use_id: parent })).toBeUndefined();
    expect(claudeModeReport({ ...runMode.setMode, parent_tool_use_id: parent })).toBeUndefined();
    for (const raw of [{ type: "system", subtype: "status", status: "compacting" }, { type: "system", subtype: "init" }, { type: "system", subtype: "init", permissionMode: 3 },
      { type: "system", subtype: "status", permissionMode: null }, { type: "system", subtype: "compact_boundary", permissionMode: "plan" }, { type: "result", permissionMode: "plan" }, null, "status", []])
      expect(claudeModeReport(raw)).toBeUndefined();
  });
});

// A message steered into the running turn. Frame shapes and ids are a PoC run's (Claude Code 2.1.317/2.1.312,
// Codex 0.166.0/0.164.0).
describe("steered message consumption", () => {
  const FIRST = "6b793a86-9a1c-40e9-8855-84984dff4f8a", STEERED = "008d3a33-94cc-41f0-ad00-4b370be622d2";
  type Step = unknown | { steer: string };
  // Records consumption and events in one sequence, as the runner delivers them.
  function run(runtime: "claude" | "codex", steps: Step[], stop: "user" | "appQuit" | null = null) {
    let state: TransportState = { ...initialTransport(), stop };
    const seen: (EventPayload | { consumed: string })[] = [];
    for (const step of steps) {
      if (step && typeof step === "object" && "steer" in step) { state = steerTransport(state, String(step.steer)); continue; }
      const next = runtime === "claude" ? normalizeClaude(state, step, "/repo") : normalizeCodex(state, step, { root: "/repo", sessionId: "session-1", turnId: "turn-1" });
      state = next.state; seen.push(...(next.consumed ?? []).map(consumed => ({ consumed })), ...next.events);
    }
    return { state, seen };
  }
  const system = (subtype: string, uuids: string[]) => ({ type: "system", subtype, user_message_uuids: uuids, session_id: "s" });
  const say = (id: string, body: string) => ({ type: "assistant", parent_tool_use_id: null, message: { id, content: [{ type: "text", text: body }] } });
  const result = (uuids: string[], extra: Record<string, unknown> = {}) => ({ type: "result", subtype: "success", is_error: false, result: "ok", user_message_uuid: uuids[0], user_message_uuids: uuids, queued_turn_count: 0, ...extra });
  it("folds a Claude message steered during a tool into the same turn, consumed at the status frame that first lists it", () => {
    const { seen } = run("claude", [
      system("init", [FIRST]), system("status", [FIRST]),
      { type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "sleep 12" } }] } },
      { steer: STEERED },
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ tool_use_id: "toolu_1", type: "tool_result", content: "(Bash completed with no output)", is_error: false }] } },
      system("status", [FIRST, STEERED]),
      say("a2", "BANANA"),
      result([FIRST, STEERED]),
    ]);
    expect(seen).toEqual([
      { type: "activity", kind: "command", summary: "Running a command" },
      { consumed: STEERED },
      { type: "message.done", messageId: "a2", text: "BANANA" },
      { type: "turn.done" },
    ]);
  });
  it("waits past a Claude result that reports no queued turn while a steered message is unread, and ends on the continued turn's result", () => {
    const { seen, state } = run("claude", [
      system("init", [FIRST]), system("status", [FIRST]),
      { steer: STEERED },
      say("a1", "40 facts"),
      result([FIRST], { queued_turn_count: 0 }),
      system("init", [STEERED]), system("status", [STEERED]),
      say("a2", "BANANA"),
      result([STEERED]),
    ]);
    expect(seen).toEqual([
      { type: "message.done", messageId: "a1", text: "40 facts" },
      { consumed: STEERED },
      { type: "message.done", messageId: "a2", text: "BANANA" },
      { type: "turn.done" },
    ]);
    expect(state.terminal).toBe(true);
  });
  it("ends a Claude result that also first lists the steered message, consumption first", () => {
    expect(run("claude", [{ steer: STEERED }, say("a1", "done"), result([FIRST, STEERED])]).seen)
      .toEqual([{ type: "message.done", messageId: "a1", text: "done" }, { consumed: STEERED }, { type: "turn.done" }]);
  });
  it("keeps a Claude result without a steered message terminal, as before", () => {
    const { seen, state } = run("claude", [system("init", [FIRST]), say("a1", "OK"), result([FIRST])]);
    expect(seen).toEqual([{ type: "message.done", messageId: "a1", text: "OK" }, { type: "turn.done" }]);
    expect(state.terminal).toBe(true);
  });
  it.each(["user", "appQuit"] as const)("ends a Claude turn stopped by %s as interrupted even while a steered message is unread", stop => {
    expect(run("claude", [{ steer: STEERED }, result([FIRST])], stop).seen).toEqual([{ type: "interrupted", reason: stop }]);
    expect(run("claude", [{ steer: STEERED }, result([FIRST], { terminal_reason: "interrupted" })], stop).seen).toEqual([{ type: "interrupted", reason: stop }]);
  });
  it("ends a Claude turn on a failed or aborted result even while a steered message is unread", () => {
    expect(run("claude", [{ steer: STEERED }, { type: "result", subtype: "error_during_execution", is_error: true, errors: ["Rate limit exceeded"] }]).seen)
      .toEqual([{ type: "turn.failed", code: "rate_limited", detail: "Rate limit exceeded" }]);
    expect(run("claude", [{ steer: STEERED }, result([FIRST], { terminal_reason: "aborted_tools" })]).seen).toEqual([{ type: "turn.failed", code: "process_exited" }]);
  });
  it("reports a Claude steered message consumed once and never one it did not steer", () => {
    const { seen } = run("claude", [{ steer: STEERED }, system("status", ["other", STEERED]), system("init", [STEERED]), result([STEERED])]);
    expect(seen).toEqual([{ consumed: STEERED }, { type: "turn.done" }]);
    expect(run("claude", [system("status", [FIRST, STEERED]), result([FIRST, STEERED])]).seen).toEqual([{ type: "turn.done" }]);
    expect(run("claude", [{ steer: STEERED }, { ...system("status", [STEERED]), parent_tool_use_id: "toolu_1" }, result([FIRST])]).seen).toEqual([]);
  });
  it("marks only a Claude success result that leaves a steered message unread as awaiting its read, and ends that wait as done", () => {
    let state = steerTransport(initialTransport(), STEERED);
    const waiting = normalizeClaude(state, result([FIRST]), "/repo"); state = waiting.state;
    expect(waiting).toMatchObject({ events: [], awaitingRead: true });
    expect(normalizeClaude(initialTransport(), result([FIRST]), "/repo")).not.toHaveProperty("awaitingRead");
    expect(normalizeClaude(state, system("init", [STEERED]), "/repo")).not.toHaveProperty("awaitingRead");
    const ended = endSteerWait(state);
    expect(ended.events).toEqual([{ type: "turn.done" }]);
    expect(ended.state.terminal).toBe(true);
    expect(endSteerWait(ended.state).events).toEqual([]);
    expect(endSteerWait({ ...state, stop: "user" }).events).toEqual([{ type: "interrupted", reason: "user" }]);
  });
  it("takes no steered message after a terminal result", () => {
    const ended = run("claude", [result([FIRST])]).state;
    expect(steerTransport(ended, STEERED)).toBe(ended);
    expect(normalizeClaude(ended, system("init", [STEERED]), "/repo")).toEqual({ state: ended, events: [] });
  });
  const echo = (method: string, item: Record<string, unknown>, turnId = "turn-1") => ({ method, params: { threadId: "session-1", turnId, item } });
  const userMessage = (clientId: string | null) => ({ type: "userMessage", id: `u-${clientId}`, clientId, content: [{ type: "text", text: "Extra note", text_elements: [] }] });
  it("reads a Codex userMessage item of the same turn echoing a steered clientUserMessageId as its consumption, once", () => {
    const { seen } = run("codex", [
      { steer: STEERED },
      echo("item/started", userMessage(STEERED)), echo("item/completed", userMessage(STEERED)),
      { method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "completed" } } },
    ]);
    expect(seen).toEqual([{ consumed: STEERED }, { type: "turn.done" }]);
  });
  it("ignores Codex userMessage items of another turn, of another client id, or of no client id", () => {
    expect(run("codex", [{ steer: STEERED }, echo("item/started", userMessage(STEERED), "turn-2"), echo("item/started", userMessage("other")), echo("item/started", userMessage(null))]).seen).toEqual([]);
    expect(run("codex", [echo("item/started", userMessage(STEERED))]).seen).toEqual([]);
  });
  it("ends a Codex turn on completion even while a steered message is unread", () => {
    expect(run("codex", [{ steer: STEERED }, { method: "turn/completed", params: { threadId: "session-1", turn: { id: "turn-1", status: "completed" } } }]).seen).toEqual([{ type: "turn.done" }]);
  });
});
// Claude's AskUserQuestion, as a probe recorded it (fixtures/claude-ask-user-question.json).
describe("Claude AskUserQuestion", () => {
  const single = askFixture.canUseTool.single.input, multi = askFixture.canUseTool.multi.input;
  const color = "Which color do you prefer?";
  it("reads the recorded input as one question with an ordinal id, Other always offered", () => {
    expect(claudeQuestion(single)).toEqual({
      questions: [{ id: "0", header: "Color", question: color, multiSelect: false, other: true, options: [{ label: "Red", description: "A warm, energetic color." }, { label: "Blue", description: "A calm, cool color." }] }],
      textById: { "0": color },
    });
    expect(claudeQuestion(multi)?.questions[0]).toMatchObject({ id: "0", multiSelect: true, other: true });
  });
  it("numbers several questions in order and maps each id back to its own text", () => {
    const input = { questions: [0, 1, 2, 3].map(n => ({ question: `Q${n}?`, header: `H${n}`, multiSelect: false, options: [{ label: "A", description: "" }] })) };
    const read = claudeQuestion(input)!;
    expect(read.questions.map(q => q.id)).toEqual(["0", "1", "2", "3"]);
    expect(read.textById).toEqual({ "0": "Q0?", "1": "Q1?", "2": "Q2?", "3": "Q3?" });
    // An empty description reads as none.
    expect(read.questions[0]!.options).toEqual([{ label: "A" }]);
  });
  const question = (patch: Record<string, unknown>) => ({ question: color, header: "Color", multiSelect: false, options: [{ label: "Red", description: "Warm" }], ...patch });
  it.each([
    ["no questions", { questions: [] }],
    ["five questions", { questions: [0, 1, 2, 3, 4].map(n => question({ question: `Q${n}?` })) }],
    ["a questions field that is not a list", { questions: "Which?" }],
    ["a question without its text", { questions: [question({ question: "" })] }],
    ["a question text past 4,096", { questions: [question({ question: "x".repeat(4_097) })] }],
    ["a header past 512", { questions: [question({ header: "h".repeat(513) })] }],
    ["a header that is not text", { questions: [question({ header: 3 })] }],
    ["nine options", { questions: [question({ options: Array.from({ length: 9 }, (_, n) => ({ label: `L${n}`, description: "" })) })] }],
    ["an option without a label", { questions: [question({ options: [{ label: "", description: "d" }] })] }],
    ["a label past 512", { questions: [question({ options: [{ label: "l".repeat(513), description: "d" }] })] }],
    ["a description past 512", { questions: [question({ options: [{ label: "Red", description: "d".repeat(513) }] })] }],
    ["a multiSelect that is not a boolean", { questions: [question({ multiSelect: "yes" })] }],
    ["the same question text twice", { questions: [question({}), question({ header: "Again" })] }],
    ["no input", undefined],
  ])("refuses %s", (_label, input) => {
    expect(claudeQuestion(input)).toBeNull();
  });
  it("accepts every limit exactly", () => {
    const input = { questions: [0, 1, 2, 3].map(n => question({ question: `${n}`.padEnd(4_096, "q"), header: "h".repeat(512), options: Array.from({ length: 8 }, (_, i) => ({ label: `${i}`.padEnd(512, "l"), description: "d".repeat(512) })) })) };
    expect(claudeQuestion(input)?.questions).toHaveLength(4);
  });
  const read = claudeQuestion(single)!, readMulti = claudeQuestion(multi)!;
  it("answers a choice with its label, keyed by the question's own text", () => {
    expect(claudeQuestionResult(single, read, { outcome: "answered", answers: { "0": { selected: [1] } } }, true))
      .toEqual({ behavior: "allow", updatedInput: { ...single, answers: askFixture.results.answered.updatedAnswers } });
  });
  it("answers Other with the typed text", () => {
    expect(claudeQuestionResult(single, read, { outcome: "answered", answers: { "0": { selected: [], other: "Green, but only for the header" } } }, true))
      .toEqual({ behavior: "allow", updatedInput: { ...single, answers: askFixture.results.other.updatedAnswers } });
  });
  it("joins several choices and the typed text with commas", () => {
    expect(claudeQuestionResult(multi, readMulti, { outcome: "answered", answers: { "0": { selected: [0, 1], other: "Keyboard shortcuts" } } }, true))
      .toEqual({ behavior: "allow", updatedInput: { ...multi, answers: askFixture.results.multi.updatedAnswers } });
  });
  it("skips with no answer text and the unanswered mark when the session advertises it (P1 Skip a)", () => {
    expect(claudeQuestionResult(single, read, { outcome: "skipped" }, true))
      .toEqual({ behavior: "allow", updatedInput: { ...single, answers: {}, annotations: askFixture.results.skipped.annotations } });
  });
  it("skips by denying when the session does not advertise the unanswered mark (P1 Skip b)", () => {
    expect(claudeQuestionResult(single, read, { outcome: "skipped" }, false)).toEqual({ behavior: "deny", message: askFixture.results.denied.message });
  });
  it("tells whether a system/init frame advertises the unanswered mark", () => {
    expect(claudeUnansweredSupport(askFixture.init)).toBe(true);
    expect(claudeUnansweredSupport({ ...askFixture.init, capabilities: ["interrupt_receipt_v1"] })).toBe(false);
    expect(claudeUnansweredSupport({ ...askFixture.init, capabilities: undefined })).toBe(false);
    expect(claudeUnansweredSupport(askFixture.toolUse)).toBeUndefined();
  });
  it("shows no activity for the AskUserQuestion call, which the question card stands for", () => {
    expect(collect("claude", [askFixture.init, askFixture.toolUse]).events).toEqual([]);
    // Other tools in the same message still show.
    const both = { ...askFixture.toolUse, message: { ...askFixture.toolUse.message, content: [...askFixture.toolUse.message.content, { type: "tool_use", id: "id-3", name: "Read", input: { file_path: "/repo/a.html" } }] } };
    expect(collect("claude", [both]).events).toEqual([{ type: "activity", kind: "read", path: "/repo/a.html", insideDesign: false, summary: "a.html" }]);
  });
  it("keeps the chosen labels and the typed text apart for the history, and never a secret question's answer", () => {
    expect(storedAnswers(readMulti.questions, { outcome: "answered", answers: { "0": { selected: [0, 2], other: "Keyboard shortcuts" } } }))
      .toEqual({ "0": { selected: ["Agents", "Appearance"], other: "Keyboard shortcuts" } });
    const secret = [{ id: "pin", header: "PIN", question: "Your PIN?", options: [], multiSelect: false, other: true, secret: true as const }, { id: "name", header: "Name", question: "Your name?", options: [], multiSelect: false, other: true }];
    const stored = storedAnswers(secret, { outcome: "answered", answers: { pin: { selected: [], other: "SYNTH_SECRET_PIN" }, name: { selected: [], other: "Ada" } } });
    expect(stored).toEqual({ name: { selected: [], other: "Ada" } });
    expect(JSON.stringify(stored)).not.toContain("SYNTH_SECRET_PIN");
  });
});

// A Claude turn that asked for Fast and did not get it, judged from its result (Agent SDK 0.3.312
// fast_mode_state, fast_mode_disabled_reason). Reasons that go on (plan, extra usage, model, policy) turn Fast off.
describe("Fast outcome", () => {
  const result = (fast: Record<string, unknown> = {}, subtype = "success") => ({ type: "result", subtype, is_error: subtype !== "success", result: "", ...fast });
  it("is nothing for a turn that did not ask, that got Fast, or whose result carries no state", () => {
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" }), false)).toBeNull();
    expect(claudeFastOutcome(result({ fast_mode_state: "on" }), true)).toBeNull();
    expect(claudeFastOutcome(result(), true)).toBeNull();
    expect(claudeFastOutcome(result({ fast_mode_disabled_reason: "free" }), true)).toBeNull();
    expect(claudeFastOutcome(result({ fast_mode_state: "warp" }), true)).toBeNull();
  });
  it("turns Fast off for the four reasons that go on, and keeps it for a cooldown", () => {
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" }), true)).toEqual({ type: "fast.unused", reason: "plan", turnedOff: true });
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "extra_usage_disabled" }), true)).toEqual({ type: "fast.unused", reason: "extra_usage", turnedOff: true });
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "model_not_allowed" }), true)).toEqual({ type: "fast.unused", reason: "model", turnedOff: true });
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "preference" }), true)).toEqual({ type: "fast.unused", reason: "policy", turnedOff: true });
    expect(claudeFastOutcome(result({ fast_mode_state: "cooldown" }), true)).toEqual({ type: "fast.unused", reason: "cooldown" });
    expect(claudeFastOutcome(result({ fast_mode_state: "cooldown", fast_mode_disabled_reason: "free" }), true)).toEqual({ type: "fast.unused", reason: "cooldown" });
  });
  it("records any other reason, or none, without a reason and keeps Fast on", () => {
    for (const reason of ["network_error", "unknown", "not_first_party", "disabled_by_env", "sdk_opt_in_required", "pending", "brand_new", undefined])
      expect(claudeFastOutcome(result({ fast_mode_state: "off", ...(reason ? { fast_mode_disabled_reason: reason } : {}) }), true)).toEqual({ type: "fast.unused" });
  });
  it("judges a failed turn too", () => {
    expect(claudeFastOutcome(result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" }, "error_during_execution"), true)).toEqual({ type: "fast.unused", reason: "plan", turnedOff: true });
  });
  const asked = (state: TransportState = initialTransport()): TransportState => ({ ...state, fastRequested: true });
  const run = (state: TransportState, frames: unknown[]) => {
    const events: EventPayload[] = [];
    for (const frame of frames) {
      if (frame && typeof frame === "object" && "steer" in frame) { state = steerTransport(state, String(frame.steer)); continue; }
      const next = normalizeClaude(state, frame, "/repo"); state = next.state; events.push(...next.events);
    }
    return { state, events };
  };
  const call = { type: "assistant", parent_tool_use_id: null, message: { id: "m1", model: "claude-opus-5", content: [{ type: "text", text: "OK" }], usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } };
  const window = { modelUsage: { "claude-opus-5": { contextWindow: 200_000 } } };
  it("goes out before the context value and the terminal of a done or failed turn", () => {
    const done = run(asked(), [call, { ...result({ fast_mode_state: "off", fast_mode_disabled_reason: "extra_usage_disabled" }), ...window }]).events;
    expect(done.slice(-3)).toEqual([{ type: "fast.unused", reason: "extra_usage", turnedOff: true }, { type: "context.usage", used: 10, size: 200_000 }, { type: "turn.done" }]);
    const failed = run(asked(), [call, { ...result({ fast_mode_state: "cooldown" }, "error_during_execution"), errors: ["boom"], ...window }]).events;
    expect(failed.map(e => e.type).slice(-3)).toEqual(["fast.unused", "context.usage", "turn.failed"]);
  });
  it("is nothing on a turn that did not ask, and nothing on a stop, a quit or a crash", () => {
    expect(run(initialTransport(), [result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" })]).events).toEqual([{ type: "turn.done" }]);
    const off = result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" });
    for (const stop of ["user", "appQuit"] as const) expect(run({ ...asked(), stop }, [off]).events).toEqual([{ type: "interrupted", reason: stop }]);
    expect(run(asked(), [{ ...off, terminal_reason: "interrupted" }]).events.some(e => e.type === "fast.unused")).toBe(false);
    // A crash after a result that waited for a steered message: the process ended, so the turn is not judged.
    const waiting = run(asked(), [{ steer: "u1" }, off]);
    expect(waiting.events).toEqual([]);
    expect(endTransport(waiting.state).events).toEqual([{ type: "turn.failed", code: "process_exited" }]);
  });
  it("judges a steered turn by its last result", () => {
    const off = result({ fast_mode_state: "off", fast_mode_disabled_reason: "free" });
    const init = { type: "system", subtype: "init", user_message_uuids: ["u1"] };
    expect(run(asked(), [{ steer: "u1" }, off, init, result({ fast_mode_state: "on" })]).events.filter(e => e.type === "fast.unused")).toEqual([]);
    expect(run(asked(), [{ steer: "u1" }, result({ fast_mode_state: "on" }), init, result({ fast_mode_state: "cooldown" })]).events.filter(e => e.type === "fast.unused")).toEqual([{ type: "fast.unused", reason: "cooldown" }]);
    // The read wait ran out: the turn ends done with the last result it saw.
    const waited = run(asked(), [{ steer: "u1" }, off]);
    expect(endSteerWait(waited.state).events).toEqual([{ type: "fast.unused", reason: "plan", turnedOff: true }, { type: "turn.done" }]);
  });
});

// Edit line counts (activity.callId and activity.result), pinned by the frames recorded per provider version
// (fixtures/claude-edit-results.json, fixtures/codex-file-changes.json; README 'thread-edit-lines'). A trail line is
// "activity <kind> <callId|-> <path|->" or "result <callId> <path|-> +<added> -<removed>".
function trail(events: readonly EventPayload[]): string[] {
  return events.flatMap(e => e.type === "activity" ? [`activity ${e.kind} ${e.callId ?? "-"} ${e.path ?? "-"}`]
    : e.type === "activity.result" ? [`result ${e.callId} ${e.path ?? "-"} +${e.lines.added} -${e.lines.removed}`] : []);
}
type Recorded = Record<string, { frames: unknown[] }>;
const CODEX_THREAD = "00000000-0000-4000-8000-000000000001", CODEX_TURN = "00000000-0000-4000-8000-000000000002";
function replayCodex(frames: readonly unknown[]) {
  let state: TransportState = initialTransport();
  const events: EventPayload[] = [];
  for (const frame of frames) {
    // The client's own approval reply is recorded beside the server's frames; the runner never normalizes it.
    if (typeof frame === "object" && frame !== null && "reply" in frame) continue;
    const next = normalizeCodex(state, frame, { root: "/repo", sessionId: CODEX_THREAD, turnId: CODEX_TURN });
    state = next.state; events.push(...next.events);
  }
  return { state, events };
}
const read = (_id: string, path: string) => `activity read - ${path}`;
const edit = (id: string, path: string) => `activity edit ${id} ${path}`;
const lines = (id: string, path: string | null, added: number, removed: number) => `result ${id} ${path ?? "-"} +${added} -${removed}`;

describe("Claude edit line counts from recorded frames", () => {
  const recorded = claudeEdits as unknown as Record<"2.1.284" | "2.1.332", Recorded>;
  const t = (n: number) => `toolu_synthetic0${n}`;
  const notes = "/repo/notes.txt", colors = "/repo/colors.txt", config = "/repo/config.txt", hello = "/repo/hello.txt";
  const expected: Record<"2.1.284" | "2.1.332", Record<string, string[]>> = {
    "2.1.284": {
      edit: [read(t(1), notes), edit(t(2), notes), lines(t(2), notes, 1, 1)],
      replaceall: [read(t(1), colors), edit(t(2), colors), lines(t(2), colors, 3, 3)],
      // A new file's structuredPatch is empty; its content's lines are the added ones (no newline after the last here).
      write: [edit(t(1), hello), lines(t(1), hello, 3, 0)],
      overwrite: [read(t(1), config), edit(t(2), config), lines(t(2), config, 2, 4)],
      // The first two edits failed (is_error) before the files were read, then both went through.
      parallel: [edit(t(1), notes), edit(t(2), colors), read(t(3), notes), read(t(4), colors), edit(t(5), notes), lines(t(5), notes, 1, 1), edit(t(6), colors), lines(t(6), colors, 1, 1)],
      deny: [read(t(1), notes), edit(t(2), notes)],
      fail: [edit(t(1), notes)],
      delete: ["activity command - -"],
    },
    "2.1.332": {
      edit: [edit(t(1), notes), lines(t(1), notes, 1, 1)],
      replaceall: [edit(t(1), colors), lines(t(1), colors, 3, 3)],
      write: [edit(t(1), hello), lines(t(1), hello, 3, 0)],
      overwrite: [read(t(1), config), edit(t(2), config), lines(t(2), config, 2, 4)],
      parallel: [edit(t(1), notes), lines(t(1), notes, 1, 1), edit(t(2), colors), lines(t(2), colors, 1, 1)],
      deny: [edit(t(1), notes)],
      fail: [edit(t(1), "notes.txt")],
      delete: ["activity command - -"],
    },
  };
  for (const version of ["2.1.284", "2.1.332"] as const) {
    it.each(Object.keys(expected[version]))(`Claude Code ${version} %s`, name => {
      const { events } = collect("claude", recorded[version][name]!.frames);
      expect(trail(events)).toEqual(expected[version][name]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }
  it("puts each result right after its call's last frame, before the next call starts", () => {
    const { events } = collect("claude", recorded["2.1.332"].edit!.frames);
    expect(events.map(e => e.type)).toEqual(["activity", "activity.result", "message.done", "turn.done"]);
  });
});

describe("Claude edit line counts: synthetic frames", () => {
  const use = (id: string, name = "Edit", path = "/repo/a.txt") => ({ type: "assistant", message: { id: `m-${id.length}`, content: [{ type: "tool_use", id, name, input: { file_path: path, old_string: "a", new_string: "b" } }] } });
  const patch = { structuredPatch: [{ lines: ["-a", "+b"] }] };
  const result = (id: string, over: Record<string, unknown> = {}, block: Record<string, unknown> = {}) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok", ...block }] }, tool_use_result: { ...patch, ...over } });
  const done = { type: "result", subtype: "success", is_error: false };
  it("counts nothing from a user frame with two tool_results, since its tool_use_result could be either one's (synthetic)", () => {
    const two = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }, { type: "tool_result", tool_use_id: "e2", content: "ok" }] }, tool_use_result: patch };
    const { events, state } = collect("claude", [use("e1"), use("e2", "Edit", "/repo/b.txt"), two, done]);
    expect(trail(events)).toEqual([edit("e1", "/repo/a.txt"), edit("e2", "/repo/b.txt")]);
    expect(state.running).toBeUndefined();
  });
  it("counts only an edit call's result, never another tool's (synthetic)", () => {
    const readUse = { type: "assistant", message: { id: "r", content: [{ type: "tool_use", id: "r1", name: "Read", input: { file_path: "/repo/a.txt" } }] } };
    expect(trail(collect("claude", [readUse, result("r1"), done]).events)).toEqual(["activity read - /repo/a.txt"]);
  });
  it("counts nothing for an error result or a result with no structuredPatch array (synthetic)", () => {
    expect(trail(collect("claude", [use("e1"), result("e1", {}, { is_error: true }), done]).events)).toEqual([edit("e1", "/repo/a.txt")]);
    expect(trail(collect("claude", [use("e1"), result("e1", { structuredPatch: "x" }), done]).events)).toEqual([edit("e1", "/repo/a.txt")]);
    expect(trail(collect("claude", [use("e1"), { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }] }, tool_use_result: "Error: no" }, done]).events)).toEqual([edit("e1", "/repo/a.txt")]);
  });
  it("counts an edit once, however often its result frame repeats (synthetic)", () => {
    expect(trail(collect("claude", [use("e1"), result("e1"), result("e1"), done]).events)).toEqual([edit("e1", "/repo/a.txt"), lines("e1", "/repo/a.txt", 1, 1)]);
  });
  it.each([
    ["empty", ""],
    ["past the label limit", "x".repeat(513)],
    ["holding a NUL", "toolu\0x"],
  ])("gives an id %s no callId and no result, and the turn goes on (synthetic)", (_name, id) => {
    const { events } = collect("claude", [use(id), result(id), done]);
    expect(events.filter(e => e.type === "activity")).toEqual([{ type: "activity", kind: "edit", path: "/repo/a.txt", insideDesign: false, summary: "a.txt" }]);
    expect(events.some(e => e.type === "activity.result")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "turn.done" });
  });
  it("keeps an id at the label limit and one holding a newline (synthetic)", () => {
    for (const id of ["x".repeat(512), "call\nfc_1"]) expect(trail(collect("claude", [use(id), result(id), done]).events)).toEqual([edit(id, "/repo/a.txt"), lines(id, "/repo/a.txt", 1, 1)]);
  });
  it("records nothing once the turn ended (synthetic)", () => {
    const ended = collect("claude", [use("e1"), done]);
    expect(normalizeClaude(ended.state, result("e1"), "/repo").events).toEqual([]);
    const stopped = collect("claude", [use("e1"), { ...done, terminal_reason: "aborted_tools" }], "user");
    expect(normalizeClaude(stopped.state, result("e1"), "/repo").events).toEqual([]);
  });
});

describe("Codex edit line counts from recorded frames", () => {
  const recorded = codexEdits as unknown as Record<"0.158.0" | "0.171.0", Recorded>;
  const item = (n: number) => `exec-00000000-0000-4000-8000-00000000000${n}`;
  const notes = "/repo/notes.txt", config = "/repo/config.txt";
  const cases: Record<string, string[]> = {
    edit: [edit(item(4), notes), lines(item(4), notes, 1, 1)],
    // add and delete carry the file's whole content, not a hunk.
    write: [edit(item(4), "/repo/hello.txt"), lines(item(4), "/repo/hello.txt", 3, 0)],
    delete: [edit(item(4), "/repo/old.txt"), lines(item(4), "/repo/old.txt", 0, 3)],
    overwrite: ["activity command - -", edit(item(5), config), lines(item(5), config, 2, 4)],
    // One item, two paths: one activity and one result per path, keyed by the item id and the path.
    multipath: [edit(item(4), config), edit(item(4), notes), lines(item(4), config, 1, 1), lines(item(4), notes, 1, 1)],
    // declined still carries the diff.
    deny: [edit(item(4), notes)],
    // No fileChange item came for the failed patch.
    fail: [],
  };
  for (const version of ["0.158.0", "0.171.0"] as const) {
    it.each(Object.keys(cases))(`Codex ${version} %s`, name => {
      const { events } = replayCodex(recorded[version][name]!.frames);
      expect(trail(events)).toEqual(cases[name]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }
});

describe("Codex edit line counts: synthetic frames", () => {
  const ctx = { root: "/repo", sessionId: CODEX_THREAD, turnId: CODEX_TURN };
  const change = (path: string, type: string, diff: string) => ({ path, kind: { type }, diff });
  const frame = (method: string, id: string, status: string, changes: unknown[]) => ({ method, params: { threadId: CODEX_THREAD, turnId: CODEX_TURN, item: { type: "fileChange", id, status, changes } } });
  const done = { method: "turn/completed", params: { threadId: CODEX_THREAD, turn: { id: CODEX_TURN, status: "completed" } } };
  const hunk = "@@ -1 +1 @@\n-a\n+b\n";
  it("gives the same path twice in one item two results (synthetic)", () => {
    const changes = [change("/repo/a.txt", "update", hunk), change("/repo/a.txt", "update", "@@ -1,2 +1 @@\n-a\n-b\n+c\n")];
    const { events } = replayCodex([frame("item/started", "f1", "inProgress", changes), frame("item/completed", "f1", "completed", changes), done]);
    expect(trail(events)).toEqual([edit("f1", "/repo/a.txt"), edit("f1", "/repo/a.txt"), lines("f1", "/repo/a.txt", 1, 1), lines("f1", "/repo/a.txt", 1, 2)]);
  });
  it("records nothing for a failed item (synthetic)", () => {
    const changes = [change("/repo/a.txt", "update", hunk)];
    expect(trail(replayCodex([frame("item/started", "f1", "inProgress", changes), frame("item/completed", "f1", "failed", changes), done]).events)).toEqual([edit("f1", "/repo/a.txt")]);
  });
  it("emits the activity and then its results when the item's completion is the first frame it comes in (synthetic)", () => {
    const changes = [change("/repo/a.txt", "update", hunk)];
    expect(normalizeCodex(initialTransport(), frame("item/completed", "f1", "completed", changes), ctx).events.map(e => e.type)).toEqual(["activity", "activity.result"]);
  });
  it("leaves out only a change it cannot count (synthetic)", () => {
    const changes = [change("/repo/a.png", "update", "Binary files a/a.png and b/a.png differ\n"), change("/repo/b.txt", "move", "x"), change("/repo/c.txt", "add", "")];
    expect(trail(replayCodex([frame("item/completed", "f1", "completed", changes), done]).events))
      .toEqual([edit("f1", "/repo/a.png"), edit("f1", "/repo/b.txt"), edit("f1", "/repo/c.txt"), lines("f1", "/repo/c.txt", 0, 0)]);
  });
  it("counts the lines of an added file's content whether or not it ends in a newline (synthetic)", () => {
    for (const diff of ["one\ntwo", "one\ntwo\n", "one\r\ntwo\r\n"]) {
      expect(trail(replayCodex([frame("item/completed", "f1", "completed", [change("/repo/a.txt", "add", diff)]), done]).events).at(-1)).toBe(lines("f1", "/repo/a.txt", 2, 0));
    }
  });
  it.each([["empty", ""], ["past the label limit", "x".repeat(513)], ["holding a NUL", "exec\0x"]])("gives an item id %s no callId and no result, and the turn goes on (synthetic)", (_name, id) => {
    const changes = [change("/repo/a.txt", "update", hunk)];
    const { events } = replayCodex([frame("item/started", id, "inProgress", changes), frame("item/completed", id, "completed", changes), done]);
    expect(events.some(e => e.type === "activity.result" || (e.type === "activity" && "callId" in e))).toBe(false);
    expect(events.at(-1)).toEqual({ type: "turn.done" });
  });
  it("counts no change the item's activities did not name: it started with none and completed with a path (synthetic)", () => {
    const { events } = replayCodex([frame("item/started", "f1", "inProgress", []), frame("item/completed", "f1", "completed", [change("/repo/a.txt", "update", hunk)]), done]);
    expect(trail(events)).toEqual([edit("f1", "-")]);
  });
  it("drops a completed change whose path holds a NUL, and the turn goes on (synthetic)", () => {
    const { events } = replayCodex([frame("item/started", "f1", "inProgress", [change("/repo/a.txt", "update", hunk)]), frame("item/completed", "f1", "completed", [change("/repo/a\0.txt", "update", hunk)]), done]);
    expect(trail(events)).toEqual([edit("f1", "/repo/a.txt")]);
    expect(events.at(-1)).toEqual({ type: "turn.done" });
  });
  it("counts an item once though its completion repeats (synthetic)", () => {
    const changes = [change("/repo/a.txt", "update", hunk)];
    const { events, state } = replayCodex([frame("item/started", "f1", "inProgress", changes), frame("item/completed", "f1", "completed", changes), frame("item/completed", "f1", "completed", changes), done]);
    expect(trail(events)).toEqual([edit("f1", "/repo/a.txt"), lines("f1", "/repo/a.txt", 1, 1)]);
    expect(state.codexEdits).toBeUndefined();
  });
  it("records nothing once the turn ended (synthetic)", () => {
    const changes = [change("/repo/a.txt", "update", hunk)];
    const ended = replayCodex([frame("item/started", "f1", "inProgress", changes), done]);
    expect(normalizeCodex(ended.state, frame("item/completed", "f1", "completed", changes), ctx).events).toEqual([]);
    expect(ended.state.codexEdits).toBeUndefined();
  });
});
