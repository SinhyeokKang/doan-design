import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
import { openAcp } from "./acpRunner";
import { ConversationService } from "./service";
import { ConversationStore, type ConversationMetadata } from "./store";
import { foldConversation } from "./state";
import { conversationSummary } from "./summary";
import { threadItems } from "../../renderer/threadItems";
import acpContext from "./fixtures/acp-context.json";
import copilot from "./fixtures/acp-copilot.json";
import type { ConversationEvent, EventPayload } from "./types";

// context-window-ring B1: the runners pass the transport's context.usage through unchanged and the service records it
// like any other event, right before the terminal; terminals the transport does not produce carry none.
const TERMINALS = ["turn.done", "turn.failed", "interrupted"];
const ends = (events: readonly { type: string }[]) => events.filter(e => e.type === "context.usage" || TERMINALS.includes(e.type)).map(e => e.type);

// A Claude CLI in streaming-input mode that exits once its stdin ends. FAKE_CTX: "done" answers with a top-level call
// whose usage and model the result's modelUsage names, a subagent call, then a prompt suggestion after the terminal
// (the real CLI sends no assistant frame for the suggestion's call; transport tests cover frames after the terminal).
// "hold" and "eof" make the call, and on a steered message answer with a success result that leaves it unread, so the
// transport holds a value with no terminal (the steer wait); then "hold" waits and "eof" exits.
function claudeCli(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_CTX; let users = 0;
const modelUsage = {'claude-haiku-5-5':{contextWindow:200000},'claude-sonnet-5-5':{contextWindow:1000000}};
const call = (id, usage, parent = null) => send({type:'assistant',parent_tool_use_id:parent,message:{id,role:'assistant',model:'claude-sonnet-5-5',content:[{type:'text',text:'OK'}],usage}});
const input = readline.createInterface({input:process.stdin});
input.on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type!=='user') return;
 if(++users > 1) {
  send({type:'result',subtype:'success',is_error:false,result:'OK',user_message_uuids:[],queued_turn_count:0,session_id:r.session_id,modelUsage});
  fs.writeFileSync(${JSON.stringify(join(root, "resulted"))}, '');
  if(mode==='eof') setTimeout(() => process.exit(0), 50);
  return;
 }
 call('m1', {input_tokens:2,cache_creation_input_tokens:4916,cache_read_input_tokens:30853,output_tokens:28});
 if(mode!=='done') return;
 call('sub', {input_tokens:900000}, 'tool-1');
 send({type:'result',subtype:'success',is_error:false,result:'OK',session_id:r.session_id,modelUsage});
 send({type:'prompt_suggestion',suggestion:'Next',uuid:'00000000-0000-4000-8000-0000000000a2',session_id:r.session_id});
});
input.on('close', () => { fs.writeFileSync(${JSON.stringify(join(root, "closed"))}, ''); setTimeout(() => process.exit(0), 20); });
`, { mode: 0o700 });
  return command;
}
const seenLines = (root: string) => readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, any>);
const CLAUDE_OWNER = { kind: "doan" as const, provider: "claude" as const, connectionId: "c1", accountId: "a1", workspaceId: "org-1", profile: "claude" };
const STEER_ID = "6190301c-24ce-42a9-8a51-ad4fdf91835e";
type Steering = Awaited<ReturnType<typeof openRunner>> & { steer?: (prompt: string, turnId: string, messageId: string) => Promise<void> };
// Steers into the running turn and waits for the fake's result that leaves it unread: the transport then holds the
// turn's value without a terminal.
async function holdValue(runner: Steering, turnId: string, root: string) {
  await runner.steer!("extra", turnId, STEER_ID);
  await vi.waitFor(() => expect(existsSync(join(root, "resulted"))).toBe(true));
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function claudeService(mode: string, body: (h: { service: ConversationService; store: ConversationStore; id: string; root: string; exited: ReturnType<typeof vi.fn>; running: () => { runner: Steering; turnId: string } }) => Promise<void>, owner = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-claude-"))), command = claudeCli(root), store = new ConversationStore(root), exited = vi.fn();
  let running: { runner: Steering; turnId: string } | undefined;
  const service = new ConversationService(store,
    async () => ({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_CTX: mode }, ...(owner ? { owner: CLAUDE_OWNER } : {}) }),
    async (input, emit, onExit, registerStop) => {
      const runner: Steering = await openRunner(input, emit, () => { exited(); onExit(); }, registerStop);
      return { ...runner, send: (prompt, turnId, ...rest) => { running = { runner, turnId }; return runner.send(prompt, turnId, ...rest); } };
    }, () => {});
  try {
    const { conversationId } = await service.start({ root, mode: "new", runtime: "claude", text: "hello", anchors: [] });
    await body({ service, store, id: conversationId, root, exited, running: () => running! });
  } finally { await service.quit(); rmSync(root, { recursive: true, force: true }); }
}

describe("Claude", () => {
  it("records the turn's value in history right before turn.done, adds no control request and still closes the input", async () => {
    await claudeService("done", async ({ store, id, root, exited }) => {
      await vi.waitFor(() => expect(ends(store.read(id))).toEqual(["context.usage", "turn.done"]));
      const events = store.read(id);
      expect(events.at(-2)).toMatchObject({ type: "context.usage", used: 35771, size: 1_000_000, turnId: events.at(-1)!.turnId });
      // The value comes from the stream: no get_context_usage, and the CLI's input closes on the terminal as before
      // (POSTMORTEM 2026-10-28), so the next send waits no longer.
      expect(seenLines(root).filter(r => r.type === "control_request").map(r => r.request.subtype)).toEqual(["initialize"]);
      await vi.waitFor(() => expect(existsSync(join(root, "closed"))).toBe(true));
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
      expect(ends(store.read(id))).toEqual(["context.usage", "turn.done"]);
    });
  }, 15000);
  it.each([
    ["Stop", (service: ConversationService, id: string) => service.interrupt(id), { type: "interrupted", reason: "user" }],
    ["quit", (service: ConversationService) => service.quit(), { type: "interrupted", reason: "appQuit" }],
    ["a sign-out's stopRuns", (service: ConversationService) => service.stopRuns("claude"), { type: "interrupted", reason: "user" }],
  ])("records no value for a turn ended by %s, though the transport holds one", async (_name, end, terminal) => {
    await claudeService("hold", async ({ service, store, id, root, running }) => {
      await vi.waitFor(() => expect(store.read(id)).toContainEqual(expect.objectContaining({ type: "message.done", messageId: "m1" })));
      await holdValue(running().runner, running().turnId, root);
      await end(service, id);
      await vi.waitFor(() => expect(ends(store.read(id))).toEqual([terminal.type]));
      expect(store.read(id).at(-1)).toMatchObject(terminal);
    }, true);
  }, 15000);
  it("records no value when the stream ends without a terminal, though the transport holds one", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-claude-"))), command = claudeCli(root), events: EventPayload[] = [];
    const runner: Steering = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_CTX: "eof" } }, e => events.push(e), () => {}, () => {});
    try {
      const sending = runner.send("hello", "turn-1");
      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: "message.done", messageId: "m1" })));
      await holdValue(runner, "turn-1", root);
      await sending;
      expect(ends(events)).toEqual(["turn.failed"]); expect(events.at(-1)).toEqual({ type: "turn.failed", code: "process_exited" });
    } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
  }, 15000);
});

// A Codex app-server. On resume it replays the previous turn's thread/tokenUsage/updated before the new turn/start
// reply (P2 (d)), then sends two notifications for the new turn. FAKE_CTX: "done" completes the turn; "garbage" breaks
// the protocol after the notifications; "hold" waits and completes as interrupted on turn/interrupt; "twice" completes
// the first turn like "done" and a second one with no notification.
function codexServer(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_CTX; let turns = 0;
const usage = (turnId, inputTokens) => ({method:'thread/tokenUsage/updated',params:{threadId:'s',turnId,tokenUsage:{total:{inputTokens:99999,totalTokens:99999},last:{inputTokens,cachedInputTokens:100,cacheWriteInputTokens:0,outputTokens:5,totalTokens:inputTokens+5},modelContextWindow:258400}}});
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{}});
 if(r.method==='thread/start' || r.method==='thread/resume') send({id:r.id,result:{thread:{id:'s'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start' && ++turns === 2) {
  send({id:r.id,result:{turn:{id:'second'}}});
  send({method:'turn/completed',params:{threadId:'s',turn:{id:'second',status:'completed'}}});
 } else if(r.method==='turn/start') {
  send(usage('previous', 17109));
  send({id:r.id,result:{turn:{id:'native'}}});
  send(usage('native', 17020)); send(usage('native', 31087));
  if(mode==='done' || mode==='twice') send({method:'turn/completed',params:{threadId:'s',turn:{id:'native',status:'completed'}}});
  if(mode==='garbage') process.stdout.write('not json\\n');
 }
 if(r.method==='turn/interrupt') { send({id:r.id,result:{}}); send({method:'turn/completed',params:{threadId:'s',turn:{id:'native',status:'interrupted'}}}); }
});
`, { mode: 0o700 });
  return command;
}
describe("Codex", () => {
  it("records the new turn's last value right before turn.done and drops the replayed previous turn's", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-codex-"))), command = codexServer(root), store = new ConversationStore(root);
    const service = new ConversationService(store,
      async () => ({ command, runtime: "codex", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, FAKE_CTX: "done" }, sessionId: "s" }), openRunner, () => {});
    try {
      const { conversationId } = await service.start({ root, mode: "resume", canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] });
      await vi.waitFor(() => expect(ends(store.read(conversationId))).toEqual(["context.usage", "turn.done"]));
      expect(store.read(conversationId).at(-2)).toMatchObject({ type: "context.usage", used: 31087, size: 258400 });
    } finally { await service.quit(); rmSync(root, { recursive: true, force: true }); }
  }, 15000);
  it("starts each turn of the same server without a value", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-codex-"))), command = codexServer(root), events: EventPayload[] = [];
    const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, FAKE_CTX: "twice" } }, e => events.push(e), () => {}, () => {});
    try {
      await runner.send("hello", "turn-1"); await vi.waitFor(() => expect(ends(events)).toEqual(["context.usage", "turn.done"]));
      await runner.send("again", "turn-2"); await vi.waitFor(() => expect(ends(events)).toEqual(["context.usage", "turn.done", "turn.done"]));
    } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
  }, 15000);
  it.each([
    ["a protocol failure", "garbage", { type: "turn.failed", code: "session_unavailable" }, false],
    ["Stop", "hold", { type: "interrupted", reason: "user" }, true],
  ])("emits no value for a turn ended by %s", async (_name, mode, terminal, stop) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-codex-"))), command = codexServer(root), events: EventPayload[] = [];
    const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, FAKE_CTX: mode } }, e => events.push(e), () => {}, () => {});
    try {
      await runner.send("hello", "local-turn");
      if (stop) await runner.stop();
      await vi.waitFor(() => expect(ends(events)).toEqual([terminal.type]));
      expect(events.find(e => TERMINALS.includes(e.type))).toEqual(terminal);
    } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
  }, 15000);
});

describe("ACP", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const SERVER = join(__dirname, "fixtures", "fake-acp-server.cjs");
  const session = copilot.turn[0]!.params!.sessionId;
  // The recorded Copilot handshake with the P3 tool turn's frames as its turn.
  function fixture(frames: unknown[]): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-acp-"))), path = join(dir, "acp-copilot.json"); dirs.push(dir);
    const turn = JSON.parse(JSON.stringify(frames).replaceAll('"session-1"', JSON.stringify(session)));
    writeFileSync(path, JSON.stringify({ ...copilot, turn }));
    return path;
  }
  async function run(runtime: "copilot" | "cursor", path: string) {
    const events: EventPayload[] = [];
    let runner: Awaited<ReturnType<typeof openAcp>> | undefined;
    runner = await openAcp({ runtime, command: process.execPath, args: [SERVER, path], cwd: tmpdir(), configDir: "/profile", env: { PATH: process.env.PATH ?? "" }, ...(runtime === "cursor" ? { authenticate: "cursor_login" } : {}) }, e => {
      events.push(e);
      if (e.type === "permission.request") setTimeout(() => runner?.answer(e.requestId, "allow"), 5);
    }, () => {}, () => {});
    await runner.send("hi", "turn-1");
    return events;
  }
  it("emits the turn's last usage_update right before turn.done", async () => {
    const events = await run("copilot", fixture(acpContext.copilotTool));
    expect(events.slice(-2)).toEqual([{ type: "context.usage", used: 15162, size: 272000 }, { type: "turn.done" }]);
  });
  it("emits no value for Cursor's recorded turn", async () => {
    const events = await run("cursor", join(__dirname, "fixtures", "acp-cursor.json"));
    expect(ends(events)).toEqual(["turn.done"]);
  });
});

describe("history readers", () => {
  const at = "2026-11-06T00:00:00.000Z";
  const event = (seq: number, body: EventPayload): ConversationEvent => ({ ...body, v: 1, conversationId: "c", seq, turnId: "t", at } as ConversationEvent);
  const turn = (usage: boolean): ConversationEvent[] => {
    const bodies: EventPayload[] = [{ type: "user.message", text: "hello", anchors: [] }, { type: "turn.started" }, { type: "message.done", messageId: "m", text: "OK" },
      ...(usage ? [{ type: "context.usage", used: 84_000, size: 200_000 } as EventPayload] : []), { type: "turn.done" }];
    return bodies.map((body, index) => event(index + 1, body));
  };
  const meta = (seenSeq: number): ConversationMetadata => ({ conversationId: "c", root: "/repo", title: "c", canvas: { path: ".doan/canvases/a.html" }, state: "current", owner: { kind: "legacy-external" }, session: { runtime: "claude", origin: "new", sessionId: "s", configDir: "/profile", cwd: "/repo" }, seenSeq });
  it("folds, summarizes and draws a turn with a value as it does the same turn without one", () => {
    const { lastSeq: withSeq, ...withValue } = foldConversation(turn(true), "c", false);
    const { lastSeq: withoutSeq, ...without } = foldConversation(turn(false), "c", false);
    expect(withValue).toEqual(without); expect([withSeq, withoutSeq]).toEqual([5, 4]);
    const live = { live: false, queued: 0, working: false };
    expect(conversationSummary(meta(0), { ok: true, events: turn(true) }, live)).toEqual(conversationSummary(meta(0), { ok: true, events: turn(false) }, live));
    // The terminal stays the last seq, so marking it seen leaves nothing unseen.
    expect(conversationSummary(meta(5), { ok: true, events: turn(true) }, live).unseen).toBe(false);
    expect(conversationSummary(meta(4), { ok: true, events: turn(true) }, live).unseen).toBe(true);
    expect(threadItems(turn(true), "/repo", false)).toEqual(threadItems(turn(false), "/repo", false));
  });
});
