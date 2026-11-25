import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, type OpenRunner, type Prepare, type Prepared, type Runner } from "./service";
import { DraftStore } from "./drafts";
import type { Provider } from "../agentAuth/types";
import type { BoundarySignal } from "./types";

const paths: string[] = []; afterEach(() => { paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Canonical, as a profile directory always is (macOS tmpdir goes through the /var link).
const temp = (prefix: string) => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); paths.push(dir); return dir; };
const VERSION: Record<Provider, string> = { claude: "2.1.326", codex: "0.167.1", cursor: "2026.10.22", copilot: "1.0.105", antigravity: "1.3.0" };
function fixture(provider: Provider = "codex") {
  const dir = temp("doan-commands-"), profile = temp("doan-commands-profile-"), cwd = temp("doan-commands-work-");
  const store = new ConversationStore(dir); const runners: (Runner & { send: ReturnType<typeof vi.fn> })[] = []; const inputs: Prepared[] = []; const exits: (() => void)[] = [];
  let connectionId = "conn-1";
  const owner = () => ({ kind: "doan" as const, provider, connectionId, accountId: "acct", workspaceId: "org", profile: "p" });
  const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
    inputs.push(input); exits.push(exited);
    const runner = { sessionId: input.sessionId ?? "11111111-1111-4111-8111-111111111111", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), steer: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: provider, configDir: profile, cwd, command: "/fake", env: {}, owner: owner(), installed: VERSION[provider], ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const signals: BoundarySignal[] = [];
  // drafts.json on disk, so a restart (a new service on the same files) reads what a quit left.
  const make = () => new ConversationService(store, prepare, open, () => {}, undefined, undefined, undefined, undefined, { drafts: new DraftStore(join(dir, "conversations")) }, undefined, undefined, undefined, undefined, signal => signals.push(signal));
  const service = make();
  const start = async (text: string, extra: Record<string, unknown> = {}) => (await service.start({ root: "/repo", mode: "new", runtime: provider, canvas: { path: ".doan/canvases/a.html" }, text, anchors: [], ...extra })).conversationId;
  const prompts = () => runners.flatMap(r => r.send.mock.calls.map(call => call[0] as string));
  return { service, store, profile, cwd, restart: make, runners, inputs, exits, open, prepare, signals, start, prompts, reconnect: (id: string) => { connectionId = id; } };
}

// A command message is the whole text, sent as is: the provider runs it only as the first and only thing it reads.
describe("sending a command", () => {
  it("sends a command as its own text and any other message wrapped as a turn prompt", async () => {
    const h = fixture();
    const id = await h.start("/compact");
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "hello", []);
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "/review the parser", []);
    expect(h.prompts()[0]).toBe("/compact");
    expect(h.prompts()[1]).toMatch(/^The JSON below/);
    expect(h.prompts()[2]).toBe("/review the parser");
    expect(h.store.read(id).filter(e => e.type === "user.message").map(e => (e as { text: string }).text)).toEqual(["/compact", "hello", "/review the parser"]);
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
    const id = await h.start("/compact");
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
    expect(h.service.read(id).commands).toEqual({ boundaries: [] });
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
    expect(h.signals).toEqual([]); expect(h.service.read(id).commands).toEqual({ boundaries: [] });
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
  const OLD = "11111111-1111-4111-8111-111111111111", NEXT = "bda22031-0000-4000-8000-000000000002";
  // A session's transcript in a project folder of the profile: lines that carry the session id and its cwd, as Claude
  // Code writes them; a new session's file starts with the /clear line.
  const transcript = (profile: string, id: string, lines: Record<string, unknown>[], folder = "-proj") => {
    mkdirSync(join(profile, "projects", folder), { recursive: true });
    writeFileSync(join(profile, "projects", folder, `${id}.jsonl`), lines.map(line => JSON.stringify(line)).join("\n") + "\n");
  };
  const clearLine = (cwd: string) => ({ type: "system", subtype: "local_command", content: "<command-name>/clear</command-name>", sessionId: NEXT, cwd });
  async function cleared(h: ReturnType<typeof fixture>) {
    const id = await h.start("hello"); transcript(h.profile, OLD, [{ type: "user", sessionId: OLD, cwd: h.cwd }]);
    h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
    await h.service.send(id, "/clear", []);
    return id;
  }
  const move = (h: ReturnType<typeof fixture>) => { h.inputs[1]!.boundary!("cleared"); h.inputs[1]!.sessionChanged!(NEXT); h.runners[1]!.sessionId = NEXT; };
  const refused = (h: ReturnType<typeof fixture>, id: string) => {
    expect(h.store.list().find(m => m.conversationId === id)!.session.sessionId).toBe(OLD);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed" });
    expect(h.signals).toEqual([]); expect(h.service.read(id).commands.boundaries).toEqual([]);
  };
  it("rebinds the conversation to the session /clear moved to, and resumes it next", async () => {
    const h = fixture("claude");
    const id = await cleared(h);
    transcript(h.profile, NEXT, [clearLine(h.cwd)]);
    move(h);
    // The clear is drawn once the conversation followed it, not on the provider's reset alone.
    expect(h.signals).toEqual([]);
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.session).toMatchObject({ sessionId: NEXT, configDir: h.profile, cwd: h.cwd });
    const turnId = h.store.read(id).at(-1)!.turnId;
    expect(h.signals).toEqual([{ conversationId: id, turnId, kind: "cleared" }]);
    expect(h.service.read(id).commands.boundaries).toEqual([{ turnId, kind: "cleared" }]);
    // The /clear was held only until its acceptance: the swap leaves no draft behind.
    expect(h.restart().takeDraft(id)).toBeNull();
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.done" });
    h.exits[1]!();
    await h.service.send(id, "next", []);
    expect(h.inputs[2]!.sessionId).toBe(NEXT);
    // The previous session is no longer held by this conversation.
    expect(h.service.sessionHeld("claude", h.profile, OLD)).toBe(false);
  });
  it("fails the turn and keeps the binding when the new session is not in the profile", async () => {
    const h = fixture("claude");
    const id = await cleared(h); move(h);
    h.service.receive(id, { type: "turn.done" });
    refused(h, id);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "session_unavailable" });
  });
  it("refuses a new session that is another project folder's", async () => {
    const h = fixture("claude");
    const id = await cleared(h);
    transcript(h.profile, NEXT, [clearLine(h.cwd)], "-elsewhere");
    move(h); h.service.receive(id, { type: "turn.done" });
    refused(h, id);
  });
  it.each([["names no cwd", (cwd: string) => [{ type: "system", subtype: "local_command", sessionId: NEXT }, { type: "user", cwd, sessionId: "other" }]],
    ["names another cwd", () => [clearLine(tmpdir())]],
    ["names the cwd in one line and another in the next", (cwd: string) => [clearLine(cwd), clearLine(tmpdir())]]])("refuses a new session whose transcript %s", async (_label, lines) => {
    const h = fixture("claude");
    const id = await cleared(h);
    transcript(h.profile, NEXT, lines(h.cwd));
    move(h); h.service.receive(id, { type: "turn.done" });
    refused(h, id);
  });
  it("refuses a session another conversation holds, even one that ended", async () => {
    const h = fixture("claude");
    h.prepare.mockImplementationOnce(async () => ({ runtime: "claude", configDir: h.profile, cwd: h.cwd, command: "/fake", env: {}, sessionId: NEXT, owner: { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct", workspaceId: "org", profile: "p" }, installed: "2.1.326" }));
    const other = await h.start("other", { mode: "resume", canvas: { path: ".doan/canvases/b.html" } });
    h.service.receive(other, { type: "turn.done" }); h.exits[0]!();
    h.inputs.shift(); h.runners.shift(); h.exits.shift();
    const id = await cleared(h);
    transcript(h.profile, NEXT, [clearLine(h.cwd)]);
    move(h); h.service.receive(id, { type: "turn.done" });
    refused(h, id);
    expect(h.store.list().find(m => m.conversationId === other)!.session.sessionId).toBe(NEXT);
  });
  it("never follows a session change on a turn that is not /clear", async () => {
    const h = fixture("claude");
    const id = await h.start("hello");
    const before = h.store.list()[0]!.session.sessionId;
    transcript(h.profile, OLD, [{ type: "user", sessionId: OLD, cwd: h.cwd }]); transcript(h.profile, NEXT, [clearLine(h.cwd)]);
    h.inputs[0]!.sessionChanged!(NEXT);
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]!.session.sessionId).toBe(before);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "session_unavailable" });
  });
});

// A command turn takes no other message: Send now of an ordinary queued message waits for the next turn instead.
describe("Send now during a command turn", () => {
  it("refuses Send now of an ordinary message while a command runs, and sends it after the command's turn", async () => {
    const h = fixture();
    const id = await h.start("hello"); h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "/compact", []);
    const { itemId } = h.service.queue(id, { text: "after the compaction", anchors: [] });
    await expect(h.service.sendNow(id, itemId)).rejects.toThrow("not_running");
    expect(h.runners[0]!.steer).not.toHaveBeenCalled();
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.store.read(id).filter(e => e.type === "user.message").map(e => (e as { text: string }).text)).toEqual(["hello", "/compact", "after the compaction"]));
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

// Codex's review/start takes no permission mode: it runs in the mode the thread was last told. Main sends /review only
// while that is the picker's mode, known in this run (an override holds across thread/resume; the record keeps none).
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
  // A turn whose history stopped taking writes never records its end, yet its turn/start may have told the thread a
  // wider mode: the mode is unknown until an ordinary turn in the picker's mode ends done.
  it("forgets the stated mode when a turn ends through a failed history write", async () => {
    const h = fixture();
    const id = await h.start("hello", { permissionMode: "plan" }); done(h, id);
    await h.service.send(id, "Do it all", [], { permissionMode: "bypass" });
    const append = vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("EIO"); });
    h.service.receive(id, { type: "activity", kind: "command", summary: "Running a command" });
    append.mockRestore();
    h.exits[0]!();
    await expect(h.service.send(id, "/review", [], { permissionMode: "plan" })).rejects.toThrow("command_mode_stale");
    await h.service.send(id, "Back to planning", [], { permissionMode: "plan" }); done(h, id);
    await h.service.send(id, "/review", [], { permissionMode: "plan" });
    expect(h.prompts().at(-1)).toBe("/review");
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

// A command is a send like any other until main accepts it: drafts.json holds it, so a quit before acceptance returns it
// as the conversation's draft, and an accepted or refused one leaves nothing behind.
describe("commands held until acceptance", () => {
  it("returns a command a quit stopped before acceptance as the conversation's draft", async () => {
    const h = fixture();
    const id = await h.start("hello"); h.service.receive(id, { type: "turn.done" });
    let release = () => {};
    h.prepare.mockImplementationOnce(async (_request, stored) => { await new Promise<void>(resolve => { release = resolve; }); return { runtime: "codex", configDir: h.profile, cwd: h.cwd, command: "/fake", env: {}, sessionId: stored!.session.sessionId }; });
    const pending = h.service.send(id, "/compact", []);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await h.service.quit(); release(); await expect(pending).rejects.toThrow("busy");
    expect(h.restart().takeDraft(id)).toMatchObject({ text: "/compact", reason: "restarted" });
  });
  it("leaves nothing for a command main refused, whose composer keeps it", async () => {
    const h = fixture();
    const id = await h.start("hello"); h.service.receive(id, { type: "turn.done" });
    h.service.setPermissionMode(id, "plan");
    await expect(h.service.send(id, "/review", [])).rejects.toThrow("command_mode_stale");
    await expect(h.service.send(id, "/clear", [])).rejects.toThrow("bad_request");
    expect(h.restart().takeDraft(id)).toBeNull();
  });
});
