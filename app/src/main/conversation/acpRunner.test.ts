import { expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acpPermission, acpPromptDone, initialAcp, normalizeAcp, AcpConnection } from "./acp";
import { openAcp } from "./acpRunner";
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
