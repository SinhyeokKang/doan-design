import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, type OpenRunner, type Prepare, type Prepared, type Runner } from "./service";
import type { Provider } from "../agentAuth/types";
import type { BoundarySignal } from "./types";

const paths: string[] = []; afterEach(() => { paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Canonical, as a profile directory always is (macOS tmpdir goes through the /var link).
const temp = (prefix: string) => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); paths.push(dir); return dir; };
const VERSION: Record<Provider, string> = { claude: "2.1.326", codex: "0.167.1", cursor: "2026.10.22", copilot: "1.0.105", antigravity: "1.3.0" };
function fixture(provider: Provider = "codex") {
  const dir = temp("doan-commands-"), profile = temp("doan-commands-profile-");
  const store = new ConversationStore(dir); const runners: (Runner & { send: ReturnType<typeof vi.fn> })[] = []; const inputs: Prepared[] = []; const exits: (() => void)[] = [];
  let connectionId = "conn-1";
  const owner = () => ({ kind: "doan" as const, provider, connectionId, accountId: "acct", workspaceId: "org", profile: "p" });
  const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
    inputs.push(input); exits.push(exited);
    const runner = { sessionId: input.sessionId ?? "11111111-1111-4111-8111-111111111111", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), steer: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: provider, configDir: profile, cwd: "/repo", command: "/fake", env: {}, owner: owner(), installed: VERSION[provider], ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const signals: BoundarySignal[] = [];
  const service = new ConversationService(store, prepare, open, () => {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, signal => signals.push(signal));
  const start = async (text: string, extra: Record<string, unknown> = {}) => (await service.start({ root: "/repo", mode: "new", runtime: provider, canvas: { path: ".doan/canvases/a.html" }, text, anchors: [], ...extra })).conversationId;
  const prompts = () => runners.flatMap(r => r.send.mock.calls.map(call => call[0] as string));
  return { service, store, profile, runners, inputs, exits, open, prepare, signals, start, prompts, reconnect: (id: string) => { connectionId = id; } };
}

// A command message is the whole text, sent as is: the provider runs it only as the first and only thing it reads.
describe("sending a command", () => {
  it("sends a command as its own text and any other message wrapped as a turn prompt", async () => {
    const h = fixture();
    const id = await h.start("/compact");
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "/review the parser", []);
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "hello", []);
    expect(h.prompts().slice(0, 2)).toEqual(["/compact", "/review the parser"]);
    expect(h.prompts()[2]).toMatch(/^The JSON below/);
    expect(h.store.read(id).filter(e => e.type === "user.message").map(e => (e as { text: string }).text)).toEqual(["/compact", "/review the parser", "hello"]);
  });
  it("refuses a command that carries anchors or attachments, before anything runs", async () => {
    const h = fixture();
    await expect(h.start("/compact {{1}}", { anchors: [{ frame: { id: "f" } }] })).rejects.toThrow("bad_request");
    await expect(h.start("/compact", { attachments: [{ name: "a.png", size: 1, kind: "image", path: "/tmp/a.png" }] })).rejects.toThrow("bad_request");
    const id = await h.start("hello"); h.service.receive(id, { type: "turn.done" });
    await expect(h.service.send(id, "/compact", [], { attachments: [{ name: "a.png", size: 1, kind: "image", path: "/tmp/a.png" }] })).rejects.toThrow("bad_request");
    expect(h.prompts()).toHaveLength(1);
  });
  // The composer shows a card instead; main refuses one that reaches it anyway, and nothing goes to the provider.
  it.each([["claude", "/model opus"], ["codex", "/clear"], ["antigravity", "/logout"]] as const)("never sends %s's %s", async (provider, text) => {
    const h = fixture(provider);
    await expect(h.start(text)).rejects.toThrow("bad_request");
    expect(h.open).not.toHaveBeenCalled(); expect(h.store.list()).toEqual([]);
  });
  it("refuses an unsupported command on send and in the queue", async () => {
    const h = fixture("claude");
    const id = await h.start("hello");
    expect(() => h.service.queue(id, { text: "/model", anchors: [] })).toThrow("bad_request");
    h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
    await expect(h.service.send(id, "/permissions", [])).rejects.toThrow("bad_request");
    expect(h.prompts()).toHaveLength(1);
  });
});

// Command turns are left out of the title rule: the first message that is not a command names the conversation.
describe("titles", () => {
  it("leaves a conversation started by a command untitled until its first message", async () => {
    const h = fixture();
    const id = await h.start("/review");
    expect(h.store.list()[0]!.title).toBe("");
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "/compact", []); h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.title).toBe("");
    await h.service.send(id, "Make the header blue", []);
    expect(h.store.list()[0]!.title).toBe("Make the header blue");
  });
  it("keeps a title through a later command", async () => {
    const h = fixture();
    const id = await h.start("Make the header blue"); h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "/compact", []);
    expect(h.store.list()[0]!.title).toBe("Make the header blue");
  });
});

// A command queued while a turn runs goes out alone, never joined with the messages around it.
describe("queued commands", () => {
  it("sends the messages before a command, then the command alone, then the rest", async () => {
    const h = fixture();
    const id = await h.start("hello");
    for (const text of ["a", "b", "/compact", "c"]) h.service.queue(id, { text, anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prompts()).toHaveLength(2));
    expect(h.store.read(id).filter(e => e.type === "user.message").map(e => (e as { text: string }).text)).toEqual(["hello", "a\n\nb"]);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prompts()).toHaveLength(3));
    expect(h.prompts()[2]).toBe("/compact");
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prompts()).toHaveLength(4));
    expect(h.store.read(id).filter(e => e.type === "user.message").map(e => (e as { text: string }).text)).toEqual(["hello", "a\n\nb", "/compact", "c"]);
  });
  it("refuses Send now for a queued command", async () => {
    const h = fixture();
    const id = await h.start("hello");
    const { itemId } = h.service.queue(id, { text: "/compact", anchors: [] });
    await expect(h.service.sendNow(id, itemId)).rejects.toThrow("bad_request");
    expect(h.runners[0]!.steer).not.toHaveBeenCalled();
  });
  it("refuses a queued command that carries anchors or attachments", async () => {
    const h = fixture();
    const id = await h.start("hello");
    expect(() => h.service.queue(id, { text: "/compact", anchors: [], attachments: [{ name: "a.png", size: 1, kind: "image", path: "/tmp/a.png" }] })).toThrow("bad_request");
  });
});

// In this run a boundary shows once the provider's own event says so (its own channel, never stored); after a restart it
// is rebuilt from the record: a /compact or /clear turn that ended done.
describe("boundaries", () => {
  it("publishes a command turn's boundary when the provider reports it, and reads it back", async () => {
    const h = fixture();
    const id = await h.start("/compact");
    const turnId = h.store.read(id)[0]!.turnId;
    expect(h.service.read(id).commands).toEqual({ turns: { [turnId]: "compact" }, boundaries: [] });
    h.inputs[0]!.boundary!("compacted");
    expect(h.signals).toEqual([{ conversationId: id, turnId, kind: "compacted" }]);
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.read(id).commands.boundaries).toEqual([{ turnId, kind: "compacted" }]);
    expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done"]);
  });
  it("draws none in this run for a command turn that ended done without the provider's report", async () => {
    const h = fixture();
    const id = await h.start("/compact"); h.service.receive(id, { type: "turn.done" });
    expect(h.service.read(id).commands.boundaries).toEqual([]);
    // After a restart the record decides.
    const again = new ConversationService(h.store, h.prepare, h.open, () => {});
    expect(again.read(id).commands.boundaries).toEqual([{ turnId: h.store.read(id)[0]!.turnId, kind: "compacted" }]);
  });
  it("ignores a boundary reported during a turn that is not a command (an automatic compaction)", async () => {
    const h = fixture();
    const id = await h.start("hello"); h.inputs[0]!.boundary!("compacted");
    expect(h.signals).toEqual([]); expect(h.service.read(id).commands).toEqual({ turns: {}, boundaries: [] });
  });
  it("draws Copilot's compaction from its result text, as the only sign over ACP", async () => {
    const h = fixture("copilot");
    const id = await h.start("/compact");
    h.service.receive(id, { type: "message.done", messageId: "m", text: "Compacted conversation history and removed 1 message and 0 tokens." });
    expect(h.signals).toEqual([{ conversationId: id, turnId: h.store.read(id)[0]!.turnId, kind: "compacted" }]);
  });
});

// Only the person's /clear moves a conversation to another session; the new id must be a session of the same profile.
describe("Claude /clear", () => {
  const NEXT = "bda22031-0000-4000-8000-000000000002";
  const transcript = (profile: string, id: string) => { mkdirSync(join(profile, "projects", "-repo"), { recursive: true }); writeFileSync(join(profile, "projects", "-repo", `${id}.jsonl`), "{}\n"); };
  it("rebinds the conversation to the session /clear moved to, and resumes it next", async () => {
    const h = fixture("claude");
    const id = await h.start("hello"); h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
    const before = h.store.list()[0]!.session.sessionId;
    await h.service.send(id, "/clear", []);
    transcript(h.profile, NEXT);
    h.inputs[1]!.boundary!("cleared"); h.inputs[1]!.sessionChanged!(NEXT); h.runners[1]!.sessionId = NEXT;
    // The clear is drawn once the conversation followed it, not on the provider's reset alone.
    expect(h.signals).toEqual([]);
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.session).toMatchObject({ sessionId: NEXT, configDir: h.profile, cwd: "/repo" });
    const turnId = h.store.read(id).at(-1)!.turnId;
    expect(h.signals).toEqual([{ conversationId: id, turnId, kind: "cleared" }]);
    expect(h.service.read(id).commands.boundaries).toEqual([{ turnId, kind: "cleared" }]);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.done" });
    h.exits[1]!();
    await h.service.send(id, "next", []);
    expect(h.inputs[2]!.sessionId).toBe(NEXT);
    // The previous session is no longer held by this conversation.
    expect(h.service.sessionHeld("claude", h.profile, before)).toBe(false);
  });
  it("fails the turn and keeps the binding when the new session is not in the profile", async () => {
    const h = fixture("claude");
    const id = await h.start("/clear");
    const before = h.store.list()[0]!.session.sessionId;
    h.inputs[0]!.boundary!("cleared"); h.inputs[0]!.sessionChanged!(NEXT);
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.session.sessionId).toBe(before);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "session_unavailable" });
    expect(h.signals).toEqual([]); expect(h.service.read(id).commands.boundaries).toEqual([]);
  });
  it("never follows a session change on a turn that is not /clear", async () => {
    const h = fixture("claude");
    const id = await h.start("hello");
    const before = h.store.list()[0]!.session.sessionId;
    transcript(h.profile, NEXT); h.inputs[0]!.sessionChanged!(NEXT);
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.session.sessionId).toBe(before);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "session_unavailable" });
  });
});

// An ACP conversation's commands are the last list its connection pushed; none before its first session, and none once
// the provider's connection changed (POSTMORTEM 2026-11-06).
describe("ACP command lists", () => {
  const update = (names: string[]) => ({ sessionUpdate: "available_commands_update", availableCommands: names.map(name => ({ name, description: `${name} it` })) });
  it("lists the confirmed commands of the conversation's last push, and keeps it through an unreadable one", async () => {
    const h = fixture("copilot");
    const id = await h.start("hello");
    expect(h.service.acpCommands(id, "/repo", "copilot")).toEqual([]);
    h.inputs[0]!.acpCommands!(update(["compact", "model", "fleet"]));
    expect(h.service.acpCommands(id, "/repo", "copilot")).toEqual([{ kind: "command", name: "compact", description: "compact it" }]);
    h.inputs[0]!.acpCommands!({ sessionUpdate: "available_commands_update" });
    expect(h.service.acpCommands(id, "/repo", "copilot")).toEqual([{ kind: "command", name: "compact", description: "compact it" }]);
  });
  it("drops a list once the provider's connection changes, and answers none for another root or provider", async () => {
    const h = fixture("copilot");
    const id = await h.start("hello");
    h.inputs[0]!.acpCommands!(update(["compact"]));
    expect(h.service.acpCommands(id, "/other", "copilot")).toEqual([]);
    expect(h.service.acpCommands(id, "/repo", "cursor")).toEqual([]);
    h.service.connectionChanged("copilot", "conn-2");
    expect(h.service.acpCommands(id, "/repo", "copilot")).toEqual([]);
  });
});

// Codex's review/start takes no permission mode: the review runs in the mode the thread was last told on a turn. Main
// sends /review only while that is the picker's mode now, known in this run (an override holds across thread/resume, and
// nothing in the record says which mode a turn stated).
describe("Codex /review and the permission mode", () => {
  const done = (h: ReturnType<typeof fixture>, id: string) => h.service.receive(id, { type: "turn.done" });
  it("sends /review after a turn that stated the picker's mode", async () => {
    const h = fixture();
    const id = await h.start("hello", { permissionMode: "acceptEdits" }); done(h, id);
    await h.service.send(id, "/review", []);
    expect(h.prompts().at(-1)).toBe("/review");
  });
  it("refuses /review once the picker changed after the last turn, and sends it after a message in the new mode", async () => {
    const h = fixture();
    const id = await h.start("hello"); done(h, id);
    h.service.setPermissionMode(id, "acceptEdits");
    await expect(h.service.send(id, "/review", [])).rejects.toThrow("command_mode_stale");
    await expect(h.service.send(id, "/review", [], { permissionMode: "plan" })).rejects.toThrow("command_mode_stale");
    expect(h.prompts()).toHaveLength(1);
    await h.service.send(id, "Tighten the header", []); done(h, id);
    await h.service.send(id, "/review", []);
    expect(h.prompts().at(-1)).toBe("/review");
  });
  it("refuses /review as a conversation's first message, and after a restart until a message states the mode", async () => {
    const h = fixture();
    await expect(h.start("/review")).rejects.toThrow("command_mode_stale");
    const id = await h.start("hello"); done(h, id);
    const again = new ConversationService(h.store, h.prepare, h.open, () => {});
    await expect(again.send(id, "/review", [])).rejects.toThrow("command_mode_stale");
  });
  it("forgets the stated mode when a turn in another mode did not end done", async () => {
    const h = fixture();
    const id = await h.start("hello"); done(h, id);
    await h.service.send(id, "Try plan mode", [], { permissionMode: "plan" });
    h.service.receive(id, { type: "interrupted", reason: "user" });
    await expect(h.service.send(id, "/review", [], { permissionMode: "default" })).rejects.toThrow("command_mode_stale");
  });
  it("sends /compact whatever the mode, since it runs no tools, and a /compact turn states none", async () => {
    const h = fixture();
    const id = await h.start("hello"); done(h, id);
    h.service.setPermissionMode(id, "plan");
    await h.service.send(id, "/compact", []); done(h, id);
    expect(h.prompts().at(-1)).toBe("/compact");
    await expect(h.service.send(id, "/review", [])).rejects.toThrow("command_mode_stale");
  });
  it("hands a queued /review back with the refusal when the mode changed before it went out", async () => {
    const h = fixture();
    const id = await h.start("hello");
    h.service.queue(id, { text: "/review", anchors: [] });
    h.service.setPermissionMode(id, "plan");
    done(h, id);
    await vi.waitFor(() => expect(h.service.takeDraft(id)).toMatchObject({ text: "/review", reason: "command_mode_stale" }));
    expect(h.prompts()).toHaveLength(1);
  });
});

// A command the ACP conversation's server reported (not confirmed) goes out as is, alone, and with no anchors or files.
describe("unconfirmed ACP commands", () => {
  const update = (names: string[]) => ({ sessionUpdate: "available_commands_update", availableCommands: names.map(name => ({ name, description: "" })) });
  it("sends a reported command as is, and lists it apart from the confirmed rows", async () => {
    const h = fixture("copilot");
    const id = await h.start("hello"); h.inputs[0]!.acpCommands!(update(["compact", "fleet", "model"]));
    expect(h.service.acpPassthrough(id, "/repo", "copilot")).toEqual(["fleet"]);
    h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
    await h.service.send(id, "/fleet run the tests", []);
    expect(h.prompts().at(-1)).toBe("/fleet run the tests");
    await expect(h.service.send(id, "/fleet", [{ frame: { id: "f" } }])).rejects.toThrow();
  });
  it("wraps it as a message once the server's list no longer has it, and for another connection", async () => {
    const h = fixture("copilot");
    const id = await h.start("hello"); h.inputs[0]!.acpCommands!(update(["fleet"]));
    h.service.connectionChanged("copilot", "conn-2");
    expect(h.service.acpPassthrough(id, "/repo", "copilot")).toEqual([]);
    h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
    await h.service.send(id, "/fleet", []);
    expect(h.prompts().at(-1)).toMatch(/^The JSON below/);
  });
});
