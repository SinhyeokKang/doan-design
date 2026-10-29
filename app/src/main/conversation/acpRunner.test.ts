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

const SERVER = join(__dirname, "fixtures", "fake-acp-server.cjs");
const SESSION = cursor.turn[0]!.params!.sessionId;
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
    { type: "activity", kind: "command", summary: "`command -v doan; echo $PATH | cut -c1-200`" }]);
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
  expect(events.filter(e => e.type === "activity")).toEqual([{ type: "activity", kind: "command", summary: "Run the requested shell command" }]);
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
  expect(models).toEqual([{ id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", default: true }, { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", default: false }]);
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
