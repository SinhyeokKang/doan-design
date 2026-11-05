import { expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acpPermission, acpPromptDone, initialAcp, normalizeAcp, AcpConnection } from "./acp";
import { openAcp } from "./acpRunner";
import { listModels } from "./runners";
import { ConversationService } from "./service";
import { ConversationStore } from "./store";
import { MAX_IMAGE_BYTES } from "../attachments";
import type { Prepared } from "./service";
import type { EventPayload } from "./types";
import cursor from "./fixtures/acp-cursor.json";
import copilot from "./fixtures/acp-copilot.json";

const SERVER = join(__dirname, "fixtures", "fake-acp-server.cjs");
const SESSION = cursor.turn[0]!.params!.sessionId;
const SESSION_OF = { copilot: copilot.turn[0]!.params!.sessionId };
const CWD = realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-")));
function input(provider: "cursor" | "copilot", over: Partial<Prepared> = {}, mode = ""): Prepared {
  return { runtime: provider, command: process.execPath, args: [SERVER, join(__dirname, "fixtures", `acp-${provider}.json`)], cwd: CWD, configDir: "/profile",
    env: { PATH: process.env.PATH ?? "", FAKE_ACP: mode }, ...(provider === "cursor" ? { authenticate: "cursor_login" } : {}), ...over };
}
async function open(provider: "cursor" | "copilot", answer: "allow" | "deny" | null, over: Partial<Prepared> = {}, mode = "") {
  const events: EventPayload[] = []; const exited = vi.fn(); let stop: (() => Promise<void>) | undefined;
  let runner: Awaited<ReturnType<typeof openAcp>> | undefined;
  const emit = (event: EventPayload) => {
    events.push(event);
    if (event.type === "permission.request" && answer) setTimeout(() => runner?.answer(event.requestId, answer), 5);
  };
  runner = await openAcp(input(provider, over, mode), emit, exited, s => { stop = s; });
  return { runner, events, exited, stop: () => stop?.() };
}

it("runs a recorded Cursor turn: streamed text, completed tool calls as activities, and an allowed shell command", async () => {
  const { runner, events, exited } = await open("cursor", "allow");
  expect(runner.sessionId).toBe(SESSION);
  await runner.send("hi", "turn-1");
  const request = events.find(e => e.type === "permission.request");
  expect(request).toMatchObject({ tool: "execute", options: [{ id: "allow", kind: "allow" }, { id: "always", kind: "allowAlways" }, { id: "deny", kind: "deny" }] });
  expect(events.filter(e => e.type === "activity")).toEqual([
    { type: "activity", kind: "edit", path: "/repo/hello.txt", insideDesign: false, summary: "Edit `/repo/hello.txt`" },
    { type: "activity", kind: "command", summary: "Running a command" }]);
  expect(events).toContainEqual({ type: "permission.resolved", requestId: (request as { requestId: string }).requestId, optionId: "allow" });
  expect(events.at(-1)).toEqual({ type: "turn.done" });
  const done = events.filter(e => e.type === "message.done").map(e => (e as { text: string }).text).join("");
  expect(done).toContain("DONE");
  await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
});

it("reports a denied Copilot edit as no activity and still completes the turn", async () => {
  let answered = 0;
  const events: EventPayload[] = []; const exited = vi.fn();
  let runner: Awaited<ReturnType<typeof openAcp>> | undefined;
  runner = await openAcp(input("copilot"), event => {
    events.push(event);
    if (event.type === "permission.request") { const option = answered++ === 0 ? "allow" : "deny"; setTimeout(() => runner?.answer(event.requestId, option), 5); }
  }, exited, () => {});
  await runner.send("hi", "turn-1");
  expect(events.filter(e => e.type === "permission.resolved").map(e => (e as { optionId: string }).optionId)).toEqual(["allow", "deny"]);
  expect(events.filter(e => e.type === "activity")).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }]);
  expect(events.at(-1)).toEqual({ type: "turn.done" });
});

it("resumes with session/load without replaying stored history as new events, and confirms the account after a completed prompt", async () => {
  const confirm = vi.fn();
  const events: EventPayload[] = [];
  const runner = await openAcp(input("cursor", { sessionId: SESSION, confirm }), e => events.push(e), () => {}, () => {});
  expect(events).toEqual([]);
  expect(runner.sessionId).toBe(SESSION);
  await openAcp(input("cursor", { sessionId: "missing-session" }), () => {}, () => {}, () => {}).then(() => { throw new Error("opened"); }, error => expect(error.message).toBe("session_unavailable"));
  setTimeout(() => { const request = events.find(e => e.type === "permission.request"); if (request) runner.answer(request.requestId, "allow"); }, 50);
  await runner.send("again", "turn-2");
  expect(confirm).toHaveBeenCalledOnce();
});

// Only a prompt the provider actually ran proves the login; a cancel can answer before any model request.
it.each([["end_turn", true], ["max_tokens", true], ["max_turn_requests", true], ["refusal", true], ["cancelled", false], ["", false]])(
  "confirms the account only after a prompt that stopped with %j", async (reason, confirmed) => {
    const confirm = vi.fn();
    const { runner } = await open("copilot", null, { confirm }, `stop:${reason}`);
    await runner.send("hi", "turn-1");
    expect(confirm).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });
it("does not confirm the account after an interrupted prompt", async () => {
  const confirm = vi.fn();
  const { runner } = await open("copilot", null, { confirm }, "hang");
  const sent = runner.send("hi", "turn-1");
  await new Promise(resolve => setTimeout(resolve, 50));
  await runner.stop(); await sent;
  expect(confirm).not.toHaveBeenCalled();
});

it("interrupts with session/cancel and expires a pending permission so a late answer is refused", async () => {
  const { runner, events } = await open("cursor", null);
  const sent = runner.send("hi", "turn-1");
  await vi.waitFor(() => expect(events.some(e => e.type === "permission.request")).toBe(true));
  const request = events.find(e => e.type === "permission.request") as { requestId: string };
  await runner.stop();
  await sent;
  expect(events).toContainEqual({ type: "permission.resolved", requestId: request.requestId, optionId: "expired" });
  expect(events.at(-1)).toEqual({ type: "interrupted", reason: "user" });
  expect(runner.answer(request.requestId, "allow")).toBe(false);
});

it("ends a prompt the server never answers once it acknowledges session/cancel", async () => {
  const { runner, events } = await open("copilot", null, {}, "hang");
  const sent = runner.send("hi", "turn-1");
  await new Promise(resolve => setTimeout(resolve, 50));
  await runner.stop(); await sent;
  expect(events.at(-1)).toEqual({ type: "interrupted", reason: "user" });
});

it("refuses to open when the server asks for a new browser sign-in, and when the agent does not offer the needed authenticate method", async () => {
  await expect(openAcp(input("copilot", {}, "auth-link"), () => {}, () => {}, () => {})).rejects.toThrow("not_logged_in");
  await expect(openAcp(input("copilot", { authenticate: "cursor_login" }), () => {}, () => {}, () => {})).rejects.toThrow("runtime_unsupported");
});

it("offers only the options the agent sent and prefers a one-time deny", () => {
  const params = (options: { optionId: string; kind: string }[]) => ({ sessionId: "s", toolCall: { title: "Edit a.html", kind: "edit" }, options });
  expect(acpPermission(params([{ optionId: "a", kind: "allow_once" }, { optionId: "r", kind: "reject_always" }, { optionId: "o", kind: "reject_once" }]), "id")?.choices)
    .toEqual([{ optionId: "a", option: { id: "allow", label: "Allow", kind: "allow" } }, { optionId: "o", option: { id: "deny", label: "Deny", kind: "deny" } }]);
  expect(acpPermission(params([{ optionId: "r", kind: "reject_once" }]), "id")).toBeNull();
  expect(acpPermission({ options: "x" }, "id")).toBeNull();
});

it("marks canvas edits as inside the design and splits messages around tool calls", () => {
  let state = initialAcp("t");
  const events: EventPayload[] = [];
  for (const update of [
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Drafting" } },
    { sessionUpdate: "tool_call", toolCallId: "c1", kind: "edit", title: "Write", status: "pending" },
    { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed", locations: [{ path: ".doan/canvases/hero.html" }] },
    { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed" },
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hidden" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done" } },
  ]) { const result = normalizeAcp(state, update, "/repo"); state = result.state; events.push(...result.events); }
  const result = acpPromptDone(state, { stopReason: "end_turn" }); events.push(...result.events);
  expect(events).toEqual([
    { type: "message.delta", messageId: "t:0", text: "Drafting" }, { type: "message.done", messageId: "t:0", text: "Drafting" },
    { type: "activity", kind: "edit", path: ".doan/canvases/hero.html", insideDesign: true, summary: "Write" },
    { type: "message.delta", messageId: "t:1", text: "Done" }, { type: "message.done", messageId: "t:1", text: "Done" }, { type: "turn.done" }]);
  expect(acpPromptDone(initialAcp("t"), { stopReason: "cancelled" }).events).toEqual([{ type: "interrupted", reason: "user" }]);
});

it("takes a tool call's path from a later update, such as the permission request's rawInput.fileName", () => {
  let state = initialAcp("t");
  for (const update of [{ sessionUpdate: "tool_call", toolCallId: "p", kind: "edit", title: "apply_patch", status: "pending", rawInput: "*** Begin Patch" },
    { sessionUpdate: "tool_call_update", toolCallId: "p", status: "pending", title: "Create file", rawInput: { fileName: "/repo/.doan/canvases/a.html" } }]) state = normalizeAcp(state, update, "/repo").state;
  expect(normalizeAcp(state, { sessionUpdate: "tool_call_update", toolCallId: "p", status: "completed" }, "/repo").events)
    .toEqual([{ type: "activity", kind: "edit", path: "/repo/.doan/canvases/a.html", insideDesign: true, summary: "Create file" }]);
});

it.each([
  [".doan/ds/button.html", true],
  ["/repo/.doan/ds/forms/input.html", true],
  [".doan/dsx/a.html", false],
  [".doan/assets/a.css", false],
])("marks %s as inside the design: %s", (path, inside) => {
  let state = initialAcp("t");
  state = normalizeAcp(state, { sessionUpdate: "tool_call", toolCallId: "c", kind: "edit", title: "Write", status: "pending", locations: [{ path }] }, "/repo").state;
  expect(normalizeAcp(state, { sessionUpdate: "tool_call_update", toolCallId: "c", status: "completed" }, "/repo").events)
    .toEqual([{ type: "activity", kind: "edit", path, insideDesign: inside, summary: "Write" }]);
});

it("falls back to the path or a short phrase, not the raw ACP kind, when a tool call has no title", () => {
  let state = initialAcp("t");
  const events: EventPayload[] = [];
  for (const update of [
    { sessionUpdate: "tool_call", toolCallId: "e", kind: "edit", status: "completed", locations: [{ path: "/repo/.doan/canvases/a.html" }] },
    { sessionUpdate: "tool_call", toolCallId: "x", kind: "execute", status: "completed" },
    { sessionUpdate: "tool_call", toolCallId: "o", kind: "fetch", status: "completed" },
  ]) { const result = normalizeAcp(state, update, "/repo"); state = result.state; events.push(...result.events); }
  expect(events.map(e => e.type === "activity" ? e.summary : "")).toEqual([".doan/canvases/a.html", "Running a command", "Using a tool"]);
  const secret = normalizeAcp(initialAcp("s"), { sessionUpdate: "tool_call", toolCallId: "s", kind: "execute", title: "`API_TOKEN=SYNTH_ENV_SECRET curl https://u:SYNTH_URL_PASSWORD@example.invalid`", rawInput: { command: "SYNTH_HEREDOC_SECRET" }, status: "completed" }, "/repo").events;
  expect(secret).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }]);
  expect(JSON.stringify(secret)).not.toMatch(/SYNTH_/);
  const terminal = normalizeAcp(initialAcp("s"), { sessionUpdate: "tool_call", toolCallId: "term", kind: "terminal", title: "API_TOKEN=SYNTH_ENV_SECRET curl https://example.invalid", description: "SYNTH_BEARER_SECRET", rawInput: { command: "SYNTH_HEREDOC_SECRET" }, status: "completed" }, "/repo").events;
  expect(terminal).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }]);
  expect(JSON.stringify(terminal)).not.toMatch(/SYNTH_/);
  const ask = (toolCall: Record<string, unknown>) => acpPermission({ options: [{ optionId: "a", kind: "allow_once" }], toolCall }, "id")?.event.summary;
  expect(ask({ kind: "edit" })).toBe("Editing files");
  expect(ask({ kind: "execute", title: "Run `ls`" })).toBe("Run `ls`");
  expect(ask({})).toBe("Using a tool");
});

it("fails the connection on output that is not JSON-RPC and rejects every pending request", async () => {
  const failures: string[] = [];
  const connection = new AcpConnection(() => {}, () => {}, () => {}, detail => failures.push(detail));
  const pending = connection.request("initialize", {});
  connection.receive("not json\n");
  await expect(pending).rejects.toThrow("process_exited");
  expect(failures).toEqual(["ACP output is not JSON"]);
});

async function handshake(provider: "cursor" | "copilot", over: Partial<Prepared>, mode: string) {
  const order: string[] = [];
  const incompatible = vi.fn(() => { order.push("recorded"); }), compatible = vi.fn(() => { order.push("cleared"); });
  const opened = await openAcp(input(provider, { incompatible, compatible, ...over }, mode), () => {}, () => {}, () => {})
    .then(runner => runner, (error: unknown) => { order.push("refused"); return error as Error; });
  if (!(opened instanceof Error)) await opened.close();
  return { opened, order };
}
it.each([
  ["a Cursor initialize with another protocol version", "cursor", {}, "protocol:2", "runtime_unsupported"],
  ["a Copilot initialize without the needed auth method", "copilot", { authenticate: "cursor_login" }, "", "runtime_unsupported"],
  ["a Cursor session/new reply without a session ID", "cursor", {}, "no-session", "session_unavailable"],
] as const)("records a new ACP session's installed version as incompatible on %s before refusing with the unchanged code", async (_label, provider, over, mode, code) => {
  const h = await handshake(provider, over, mode);
  expect((h.opened as Error).message).toBe(code); expect(h.order).toEqual(["recorded", "refused"]);
});
it("clears an ACP record once a new session's session/new passes, or a resume's initialize offers loadSession", async () => {
  expect((await handshake("copilot", {}, "")).order).toEqual(["cleared"]);
  expect((await handshake("cursor", { sessionId: SESSION }, "")).order).toEqual(["cleared"]);
});
it("never records an ACP resume, a server exit at initialize, or an Antigravity server", async () => {
  expect((await handshake("cursor", { sessionId: SESSION }, "protocol:2")).order).toEqual(["refused"]);
  const exited = await handshake("cursor", {}, "exit-init");
  expect((exited.opened as Error).message).toBe("process_exited"); expect(exited.order).toEqual(["refused"]);
  const antigravity = await handshake("cursor", { runtime: "antigravity" }, "protocol:2");
  expect((antigravity.opened as Error).message).toBe("runtime_unsupported"); expect(antigravity.order).toEqual(["refused"]);
});

// buzz-home: ACP model lists from session/new, the chosen model after every open, and Antigravity's image blocks.
const MODELS = { currentModelId: "gemini-3.8-flash-high", availableModels: [{ modelId: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" }, { modelId: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" }] };
function logged(log: string): { method?: string; params?: Record<string, unknown> }[] {
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> });
}
function logFile(): string { return join(realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-log-"))), "log.jsonl"); }
it("lists an ACP provider's models from session/new without a prompt and reports the process gone", async () => {
  const log = logFile(), release = vi.fn();
  const models = await listModels(input("cursor", { env: { PATH: process.env.PATH ?? "", FAKE_ACP_MODELS: JSON.stringify(MODELS), FAKE_ACP_LOG: log } }), release, () => {});
  expect(models).toEqual({ models: [{ id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", default: true }, { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", default: false }] });
  expect(logged(log).map(r => r.method)).toEqual(["initialize", "authenticate", "session/new"]);
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
});
it("sets the chosen model after session/new and again after session/load, before the prompt", async () => {
  const log = logFile();
  const env = { PATH: process.env.PATH ?? "", FAKE_ACP: "stop:end_turn", FAKE_ACP_LOG: log };
  for (const over of [{}, { sessionId: SESSION }]) {
    const runner = await openAcp(input("cursor", { env, model: "gemini-3.8-flash-low", ...over }), () => {}, () => {}, () => {});
    await runner.send("hi", "turn");
  }
  const requests = logged(log).filter(r => r.method && ["session/new", "session/load", "session/set_config_option", "session/prompt"].includes(r.method));
  expect(requests.map(r => r.method)).toEqual(["session/new", "session/set_config_option", "session/prompt", "session/load", "session/set_config_option", "session/prompt"]);
  for (const set of requests.filter(r => r.method === "session/set_config_option")) expect(set.params).toEqual({ sessionId: SESSION, configId: "model", value: "gemini-3.8-flash-low" });
  // Without a choice the provider's default stands.
  const plain = logFile();
  await (await openAcp(input("cursor", { env: { ...env, FAKE_ACP_LOG: plain } }), () => {}, () => {}, () => {})).send("hi", "turn");
  expect(logged(plain).some(r => r.method === "session/set_config_option")).toBe(false);
});
it("adds verified images up to 50 MB as ACP image blocks for Antigravity only", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-images-")));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const small = join(dir, "small.png"), big = join(dir, "big.png"), changed = join(dir, "changed.png"), text = join(dir, "notes.txt");
  writeFileSync(small, png); writeFileSync(big, png); truncateSync(big, MAX_IMAGE_BYTES + 1); writeFileSync(changed, "no longer an image"); writeFileSync(text, "hello");
  const attachments = [
    { name: "small.png", size: png.length, kind: "image" as const, path: small }, { name: "big.png", size: MAX_IMAGE_BYTES + 1, kind: "image" as const, path: big },
    { name: "changed.png", size: 3, kind: "image" as const, path: changed }, { name: "notes.txt", size: 5, kind: "file" as const, path: text }];
  const prompts: Record<string, unknown[]> = {};
  for (const runtime of ["antigravity", "cursor"] as const) {
    const log = logFile();
    const runner = await openAcp({ ...input("cursor", { env: { PATH: process.env.PATH ?? "", FAKE_ACP: "stop:end_turn", FAKE_ACP_LOG: log } }), runtime }, () => {}, () => {}, () => {});
    await runner.send("hi", "turn", attachments);
    prompts[runtime] = logged(log).find(r => r.method === "session/prompt")!.params!.prompt as unknown[];
  }
  expect(prompts.antigravity).toEqual([{ type: "text", text: "hi" }, { type: "image", mimeType: "image/png", data: png.toString("base64") }]);
  expect(prompts.cursor).toEqual([{ type: "text", text: "hi" }]);
});
it("sends no image block to an Antigravity server that does not take images", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-images-"))), small = join(dir, "a.png");
  writeFileSync(small, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const log = logFile();
  // Copilot's recorded initialize has promptCapabilities.image true too, so only a server without it is synthetic here.
  const runner = await openAcp({ ...input("copilot", { env: { PATH: process.env.PATH ?? "", FAKE_ACP: "stop:end_turn", FAKE_ACP_LOG: log, FAKE_ACP_NO_IMAGE: "1" } }), runtime: "antigravity" }, () => {}, () => {}, () => {});
  await runner.send("hi", "turn", [{ name: "a.png", size: 8, kind: "image", path: small }]);
  expect(logged(log).find(r => r.method === "session/prompt")!.params!.prompt).toEqual([{ type: "text", text: "hi" }]);
});
it("does not set a model the opened session already runs", async () => {
  const log = logFile();
  const runner = await openAcp(input("cursor", { env: { PATH: process.env.PATH ?? "", FAKE_ACP: "stop:end_turn", FAKE_ACP_LOG: log, FAKE_ACP_MODELS: JSON.stringify(MODELS) }, model: MODELS.currentModelId }), () => {}, () => {}, () => {});
  await runner.send("hi", "turn");
  expect(logged(log).some(r => r.method === "session/set_config_option")).toBe(false);
});
it.each(["quit", "stopRuns"] as const)("stops a real ACP model-list read hanging in its handshake on %s and frees the lease after the server is gone", async how => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-listing-"))), log = logFile();
  const release = vi.fn(async () => {});
  const service = new ConversationService(new ConversationStore(dir), async () => ({ ...input("cursor", { env: { PATH: process.env.PATH ?? "", FAKE_ACP: "hang-init", FAKE_ACP_LOG: log } }), release }), vi.fn(), () => {});
  // Settled as soon as the stop ends the handshake, while quit still waits for the group.
  const reading = service.listModels(await service.prepareListing(CWD, "cursor"), listModels).then(() => null, (error: Error) => error);
  await vi.waitFor(() => expect(logged(log).map(r => r.method)).toContain("initialize"));
  await (how === "quit" ? service.quit() : service.stopRuns("cursor"));
  expect(await reading).toBeInstanceOf(Error);
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
});

// permission-mode S2: the chosen mode set after every open by the mapping table, Default included.
const COPILOT_MODE = "https://agentclientprotocol.com/protocol/session-modes#";
const cursorModes = (current: string) => ({ modes: { currentModeId: current, availableModes: [{ id: "agent", name: "Agent" }, { id: "plan", name: "Plan" }, { id: "ask", name: "Ask" }] } });
const copilotModes = (mode: string, allowAll: string) => ({
  modes: { currentModeId: `${COPILOT_MODE}${mode}`, availableModes: ["agent", "plan", "autopilot"].map(id => ({ id: `${COPILOT_MODE}${id}`, name: id })) },
  configOptions: [{ type: "select", id: "mode", category: "mode", currentValue: `${COPILOT_MODE}${mode}`, options: [] },
    { type: "select", id: "allow_all", category: "permissions", currentValue: allowAll, options: [{ value: "on", name: "On" }, { value: "off", name: "Off" }] }],
});
async function modeRequests(provider: "cursor" | "copilot", session: object, over: Partial<Prepared>) {
  const log = logFile();
  const runner = await openAcp(input(provider, { env: { PATH: process.env.PATH ?? "", FAKE_ACP: "stop:end_turn", FAKE_ACP_LOG: log, FAKE_ACP_SESSION: JSON.stringify(session) }, ...over }), () => {}, () => {}, () => {});
  await runner.send("hi", "turn");
  return logged(log).filter(r => r.method === "session/set_config_option" || r.method === "session/prompt").map(r => r.method === "session/prompt" ? "prompt" : r.params);
}
it("sets a Cursor session's mode after session/new and session/load before the prompt, unless it already runs it", async () => {
  expect(await modeRequests("cursor", cursorModes("agent"), { permissionMode: "plan" })).toEqual([{ sessionId: SESSION, configId: "mode", value: "plan" }, "prompt"]);
  expect(await modeRequests("cursor", cursorModes("agent"), {})).toEqual(["prompt"]);
  // A session keeps its last mode across session/load, so Default is set back explicitly.
  expect(await modeRequests("cursor", cursorModes("plan"), { sessionId: SESSION })).toEqual([{ sessionId: SESSION, configId: "mode", value: "agent" }, "prompt"]);
  expect(await modeRequests("cursor", cursorModes("plan"), { sessionId: SESSION, permissionMode: "plan" })).toEqual(["prompt"]);
});
it("sets Copilot's mode and allow_all together, and turns allow_all off again for Default", async () => {
  expect(await modeRequests("copilot", copilotModes("agent", "off"), { permissionMode: "bypass" })).toEqual([{ sessionId: SESSION_OF.copilot, configId: "allow_all", value: "on" }, "prompt"]);
  expect(await modeRequests("copilot", copilotModes("agent", "on"), { sessionId: SESSION_OF.copilot })).toEqual([{ sessionId: SESSION_OF.copilot, configId: "allow_all", value: "off" }, "prompt"]);
  expect(await modeRequests("copilot", copilotModes("agent", "on"), { sessionId: SESSION_OF.copilot, permissionMode: "plan" })).toEqual([
    { sessionId: SESSION_OF.copilot, configId: "mode", value: `${COPILOT_MODE}plan` }, { sessionId: SESSION_OF.copilot, configId: "allow_all", value: "off" }, "prompt"]);
});
it("sets no mode when the server lists none, or lists no mode the mapping table names", async () => {
  expect(await modeRequests("cursor", {}, { permissionMode: "plan" })).toEqual(["prompt"]);
  expect(await modeRequests("cursor", { modes: { currentModeId: "ask", availableModes: [{ id: "ask" }] } }, {})).toEqual(["prompt"]);
});
// A loaded session keeps its last, possibly wider, mode, so a mode the provider cannot take falls back to Default
// rather than leaving the session as it was (RV-A 🔴 1).
it("sets Default when the chosen mode has no mapping for the provider", async () => {
  expect(await modeRequests("copilot", copilotModes("agent", "on"), { sessionId: SESSION_OF.copilot, permissionMode: "acceptEdits" })).toEqual([{ sessionId: SESSION_OF.copilot, configId: "allow_all", value: "off" }, "prompt"]);
  const antigravityModes = { modes: { currentModeId: "yolo", availableModes: ["default", "auto_edit", "yolo"].map(id => ({ id, name: id })) } };
  expect(await modeRequests("copilot", antigravityModes, { runtime: "antigravity", sessionId: SESSION_OF.copilot, permissionMode: "plan" })).toEqual([{ sessionId: SESSION_OF.copilot, configId: "mode", value: "default" }, "prompt"]);
  expect(await modeRequests("cursor", cursorModes("plan"), { sessionId: SESSION, permissionMode: "bypass" })).toEqual([{ sessionId: SESSION, configId: "mode", value: "agent" }, "prompt"]);
});
it("lists an ACP provider's modes with its models from the same session/new", async () => {
  const log = logFile();
  const env = { PATH: process.env.PATH ?? "", FAKE_ACP_MODELS: JSON.stringify(MODELS), FAKE_ACP_LOG: log, FAKE_ACP_SESSION: JSON.stringify(copilotModes("agent", "off")) };
  const list = await listModels(input("copilot", { env }), () => {}, () => {});
  expect(list.modes).toEqual({ available: ["agent", "plan", "autopilot"].map(id => `${COPILOT_MODE}${id}`), allowAll: true });
  expect(logged(log).map(r => r.method)).toEqual(["initialize", "session/new"]);
});

// agent-questions: Antigravity asks with a standard permission request whose options are the answers (P5).
const QUESTION = "Which color should the header be?";
function questionFixture(): string {
  const sessionId = copilot.turn[0]!.params!.sessionId;
  const fixture = { ...copilot, turn: [
    { jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Let me ask." } } } },
    { jsonrpc: "2.0", id: 0, method: "session/request_permission", params: { sessionId, toolCall: { toolCallId: "interaction_1", title: QUESTION, rawInput: {} }, options: [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }] } },
    { jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Thanks." } } } },
    { jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn" } }] };
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), "doan-acp-question-"))), "acp-antigravity.json");
  writeFileSync(path, JSON.stringify(fixture)); return path;
}
async function asking(runtime: "antigravity" | "copilot", mode = "") {
  const log = logFile(), events: EventPayload[] = [];
  const runner = await openAcp({ ...input("copilot", { args: [SERVER, questionFixture()], env: { PATH: process.env.PATH ?? "", FAKE_ACP: mode, FAKE_ACP_LOG: log } }), runtime }, e => events.push(e), () => {}, () => {});
  const sent = runner.send("hi", "turn-1");
  await vi.waitFor(() => expect(events.some(e => e.type === "question.request" || e.type === "permission.request")).toBe(true));
  const request = events.find(e => e.type === "question.request" || e.type === "permission.request") as Extract<EventPayload, { type: "question.request" | "permission.request" }>;
  // Replies to the question's JSON-RPC id 0: there must be exactly one.
  const replies = () => logged(log).filter(r => !r.method && (r as { id?: unknown }).id === 0).map(r => (r as { result?: unknown }).result);
  return { runner, events, sent, request, replies };
}

it("shows Antigravity's question as a question card and answers with the chosen option's optionId", async () => {
  const { runner, events, sent, request, replies } = await asking("antigravity");
  expect(request).toEqual({ type: "question.request", requestId: request.requestId, questions: [{ id: "0", header: "", question: QUESTION, options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false }] });
  // An answer that does not fit the question leaves it pending; a permission answer cannot settle it.
  expect(runner.answerQuestion!(request.requestId, { outcome: "answered", answers: { "0": { selected: [2] } } })).toBe("bad_request");
  expect(runner.answerQuestion!(request.requestId, { outcome: "answered", answers: { "0": { selected: [0], other: "Green" } } })).toBe("bad_request");
  expect(runner.answer(request.requestId, "allow")).toBe(false);
  expect(runner.answerQuestion!(request.requestId, { outcome: "answered", answers: { "0": { selected: [1] } } })).toBe("ok");
  expect(runner.answerQuestion!(request.requestId, { outcome: "skipped" })).toBe("stale");
  await sent;
  expect(events).toContainEqual({ type: "question.resolved", requestId: request.requestId, outcome: "answered", answers: { "0": { selected: ["Blue"] } } });
  expect(events.filter(e => e.type === "question.resolved")).toHaveLength(1);
  expect(events.at(-1)).toEqual({ type: "turn.done" });
  expect(replies()).toEqual([{ outcome: { outcome: "selected", optionId: "2" } }]);
});

it("answers a skipped Antigravity question as cancelled", async () => {
  const { runner, events, sent, request, replies } = await asking("antigravity");
  expect(runner.answerQuestion!(request.requestId, { outcome: "skipped" })).toBe("ok");
  await sent;
  expect(events).toContainEqual({ type: "question.resolved", requestId: request.requestId, outcome: "skipped" });
  expect(replies()).toEqual([{ outcome: { outcome: "cancelled" } }]);
});

it("expires a pending Antigravity question on Stop with one cancelled reply, and refuses a late answer", async () => {
  const { runner, events, sent, request, replies } = await asking("antigravity");
  await runner.stop(); await sent;
  expect(events).toContainEqual({ type: "question.resolved", requestId: request.requestId, outcome: "expired" });
  expect(events.filter(e => e.type === "question.resolved")).toHaveLength(1);
  expect(events.at(-1)).toEqual({ type: "interrupted", reason: "user" });
  expect(runner.answerQuestion!(request.requestId, { outcome: "answered", answers: { "0": { selected: [0] } } })).toBe("stale");
  expect(replies()).toEqual([{ outcome: { outcome: "cancelled" } }]);
});

it("keeps the same request a permission card for another ACP provider", async () => {
  const { runner, sent, request, replies } = await asking("copilot");
  expect(request).toMatchObject({ type: "permission.request", summary: QUESTION, options: [{ id: "allow" }] });
  expect(runner.answerQuestion!(request.requestId, { outcome: "skipped" })).toBe("stale");
  expect(runner.answer(request.requestId, "allow")).toBe(true);
  await sent;
  expect(replies()).toEqual([{ outcome: { outcome: "selected", optionId: "1" } }]);
});
