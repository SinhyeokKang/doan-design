import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
import { ConversationService, type OpenRunner, type Prepare } from "./service";
import { ConversationStore } from "./store";
import claude from "./fixtures/claude-thinking.json";
import codex from "./fixtures/codex-read.json";
import thought from "./fixtures/acp-copilot-thought.json";
import copilot from "./fixtures/acp-copilot.json";
import type { ConversationEvent, StageSignal, TurnStage } from "./types";

// Real runners against fake executables replaying the recorded turns, through the service. These runs
// carry no doan owner, so they also take the terminal session (legacy external) path: the same runners and callbacks.
const TERMINALS = ["turn.done", "turn.failed", "interrupted"];
const dirs: string[] = []; afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
function temp(prefix: string): string { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); dirs.push(dir); return dir; }
// raw: every stage a runner reported, before the service's checks; signals: what the service sent.
function service(root: string, prepare: Prepare) {
  const store = new ConversationStore(root), signals: StageSignal[] = [], raw: TurnStage[] = [];
  const open: OpenRunner = (input, emit, exited, registerStop) => openRunner({ ...input, stage: stage => { raw.push(stage); input.stage?.(stage); } }, emit, exited, registerStop);
  const conversations = new ConversationService(store, prepare, open, () => {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, signal => signals.push(signal));
  return { service: conversations, store, signals, raw };
}
const terminalOf = (events: readonly ConversationEvent[]) => events.filter(e => TERMINALS.includes(e.type));
const brief = (signals: readonly StageSignal[]) => signals.map(s => [s.stage.kind === "tool" ? `${s.stage.activity}:${s.stage.summary}` : s.stage.kind, s.seq]);
// Every signal is the turn's (turnId; the history's only turn by default), sent before its one terminal of any kind, with
// a rev rising by one; the whole history holds no stage line.
function expectTurnSignals(signals: readonly StageSignal[], events: readonly ConversationEvent[], historyFile: string, turnId = events[0]?.turnId) {
  const turn = events.filter(e => e.turnId === turnId), [terminal] = terminalOf(turn);
  expect(terminalOf(turn)).toHaveLength(1);
  expect(signals.length).toBeGreaterThan(0);
  for (const signal of signals) { expect(signal.turnId).toBe(terminal!.turnId); expect(signal.seq).toBeLessThan(terminal!.seq); }
  expect(signals.map(s => s.rev)).toEqual(signals.map((_, i) => (signals[0]?.rev ?? 1) + i));
  const lines = readFileSync(historyFile, "utf8").split("\n").filter(Boolean);
  expect(lines).toHaveLength(events.length);
  expect(lines.every(line => !line.includes('"stage"'))).toBe(true);
}

// A Claude CLI in streaming-input mode replaying the recorded thinking turn on the prompt. FAKE_STAGE "hold" stops right
// after the first thinking block starts and waits; the CLI exits once its stdin ends.
function claudeCli(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const frames = ${JSON.stringify(claude.thinking)};
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const input = readline.createInterface({input:process.stdin});
input.on('line', line => {
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type!=='user') return;
 for (const frame of frames) {
  send({...frame, session_id: r.session_id, ...(frame.type==='result' ? {user_message_uuids:[r.uuid]} : {})});
  if(process.env.FAKE_STAGE==='hold' && frame.type==='stream_event' && frame.event.type==='content_block_start' && frame.event.content_block.type==='thinking') return;
 }
});
input.on('close', () => setTimeout(() => process.exit(0), 20));
`, { mode: 0o700 });
  return command;
}
describe("Claude", () => {
  const prepare = (root: string, mode = ""): Prepare => async () => ({ command: claudeCli(root), runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_STAGE: mode } });
  it("sends the recorded turn's stages in order, once each, and none after its terminal", async () => {
    const root = temp("doan-stage-claude-"), h = service(root, prepare(root));
    try {
      const { conversationId: id } = await h.service.start({ root, mode: "new", runtime: "claude", text: "hello", anchors: [] });
      await vi.waitFor(() => expect(terminalOf(h.store.read(id))).toHaveLength(1));
      // Requesting, then each thinking block from its start to its stop; a tool result after each Bash activity.
      expect(brief(h.signals)).toEqual([["general", 2], ["thinking", 2], ["general", 2], ["general", 3], ["thinking", 3], ["general", 3], ["general", 4], ["thinking", 4], ["general", 4]]);
      expect(h.signals.every(s => s.stage.kind !== "tool")).toBe(true);
      expectTurnSignals(h.signals, h.store.read(id), join(root, "conversations", `${id}.jsonl`));
      expect(h.service.read(id)).not.toHaveProperty("stage");
    } finally { await h.service.quit(); }
  }, 15000);
  it("answers a read during thinking with that stage, and sends none after Stop", async () => {
    const root = temp("doan-stage-claude-"), h = service(root, prepare(root, "hold"));
    try {
      const { conversationId: id } = await h.service.start({ root, mode: "new", runtime: "claude", text: "hello", anchors: [] });
      await vi.waitFor(() => expect(h.service.read(id).stage?.stage).toEqual({ kind: "thinking" }));
      expect(h.service.read(id).stage).toEqual(h.signals.at(-1));
      const sent = h.signals.length;
      await h.service.interrupt(id);
      expect(h.service.read(id)).not.toHaveProperty("stage");
      await vi.waitFor(() => expect(terminalOf(h.store.read(id))).toEqual([expect.objectContaining({ type: "interrupted", reason: "user" })]));
      expect(h.signals).toHaveLength(sent);
    } finally { await h.service.quit(); }
  }, 15000);
});

// A Codex app-server replaying the recorded listFiles-and-read turn. Its second turn first replays one notification of
// the first turn, then the same frames under the new turn id. FAKE_STAGE "hold" sends nothing after the reply until
// turn/interrupt, then a read command's start before the reply and the interrupted completion.
function codexServer(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const frames = ${JSON.stringify(codex.read)};
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const under = (turn, frame) => JSON.parse(JSON.stringify(frame).replaceAll('"turn-1"', JSON.stringify(turn)));
let turns = 0;
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{}});
 if(r.method==='thread/start' || r.method==='thread/resume') send({id:r.id,result:{thread:{id:'session-1'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') {
  const turn = 'turn-' + ++turns;
  send({id:r.id,result:{turn:{id:turn}}});
  if(process.env.FAKE_STAGE==='hold') return;
  if(turns > 1) send(frames[8]);
  for (const frame of frames) send(under(turn, frame));
 }
 if(r.method==='turn/interrupt') {
  send(under(r.params.turnId, frames[11]));
  send({id:r.id,result:{}});
  send({method:'turn/completed',params:{threadId:'session-1',turn:{id:r.params.turnId,status:'interrupted'}}});
 }
});
`, { mode: 0o700 });
  return command;
}
describe("Codex", () => {
  const prepare = (root: string, mode = ""): Prepare => async () => ({ command: codexServer(root), runtime: "codex", cwd: root, configDir: root, sessionId: "session-1", env: { PATH: process.env.PATH, HOME: root, FAKE_STAGE: mode } });
  const canvas = { path: ".doan/canvases/a.html" };
  it("sends each turn's read stages under that turn on a reused server, and none for the earlier turn's notification", async () => {
    const root = temp("doan-stage-codex-"), h = service(root, prepare(root));
    try {
      const { conversationId: id } = await h.service.start({ root, mode: "resume", canvas, text: "hello", anchors: [] });
      await vi.waitFor(() => expect(terminalOf(h.store.read(id))).toHaveLength(1));
      const first = h.signals.splice(0);
      // The listFiles command reads files, the read command its path; each one's completion is general again.
      const turn = [["read:Reading files", 7], ["general", 7], ["read:/repo/notes.txt", 8], ["general", 8]];
      expect(brief(first)).toEqual(turn);
      expectTurnSignals(first, h.store.read(id), join(root, "conversations", `${id}.jsonl`));
      const rawFirst = h.raw.length;
      await h.service.send(id, "again", []);
      await vi.waitFor(() => expect(terminalOf(h.store.read(id))).toHaveLength(2));
      const second = h.store.read(id).filter(e => e.turnId === h.store.read(id).at(-1)!.turnId);
      expect(brief(h.signals)).toEqual(turn.map(([stage, seq]) => [stage, (seq as number) + second[0]!.seq - 1]));
      expectTurnSignals(h.signals, h.store.read(id), join(root, "conversations", `${id}.jsonl`), second[0]!.turnId);
      expect(terminalOf(h.store.read(id)).map(e => e.type)).toEqual(["turn.done", "turn.done"]);
      // The replayed first-turn start reached no stage, not even before the service's checks.
      expect(h.raw.length - rawFirst).toBe(rawFirst);
      expect(h.signals[0]!.rev).toBeGreaterThan(first.at(-1)!.rev);
    } finally { await h.service.quit(); }
  }, 15000);
  it("sends no stage from frames after Stop, though the server reports a read before its interrupted end", async () => {
    const root = temp("doan-stage-codex-"), h = service(root, prepare(root, "hold"));
    try {
      const { conversationId: id } = await h.service.start({ root, mode: "resume", canvas, text: "hello", anchors: [] });
      await vi.waitFor(() => expect(h.store.read(id).at(-1)!.type).toBe("turn.started"));
      await new Promise(resolve => setTimeout(resolve, 100));
      await h.service.interrupt(id);
      await vi.waitFor(() => expect(h.raw).toContainEqual(expect.objectContaining({ kind: "tool", activity: "read" })));
      expect(h.signals).toEqual([]);
      expect(terminalOf(h.store.read(id))).toEqual([expect.objectContaining({ type: "interrupted", reason: "user" })]);
    } finally { await h.service.quit(); }
  }, 15000);
});

describe("ACP", () => {
  // The recorded Copilot handshake with the recorded thought turn as its turn.
  function fixture(): string {
    const dir = temp("doan-stage-acp-"), path = join(dir, "acp-copilot.json"), session = copilot.turn[0]!.params!.sessionId;
    writeFileSync(path, JSON.stringify({ ...copilot, turn: JSON.parse(JSON.stringify(thought.turn).replaceAll('"session-1"', JSON.stringify(session))) }));
    return path;
  }
  it("sends Copilot's 83 thought chunks as one thinking stage, then each tool while it runs, and none after the terminal", async () => {
    const root = temp("doan-stage-acp-root-"), path = fixture();
    const h = service(root, async () => ({ runtime: "copilot", command: process.execPath, args: [join(__dirname, "fixtures", "fake-acp-server.cjs"), path], cwd: root, configDir: root, env: { PATH: process.env.PATH ?? "" },
      owner: { kind: "doan", provider: "copilot", connectionId: "c1", accountId: "a1", workspaceId: null, profile: "copilot" } }));
    try {
      const { conversationId: id } = await h.service.start({ root, mode: "new", runtime: "copilot", text: "hello", anchors: [] });
      await vi.waitFor(() => expect(terminalOf(h.store.read(id))).toHaveLength(1));
      expect(h.raw.filter(s => s.kind === "thinking").length).toBeGreaterThan(80);
      expect(brief(h.signals)).toEqual([["thinking", 2], ["command:Running a command", 2], ["general", 3], ["read:Viewing /repo/notes.txt", 3], ["general", 4]]);
      expectTurnSignals(h.signals, h.store.read(id), join(root, "conversations", `${id}.jsonl`));
    } finally { await h.service.quit(); }
  }, 15000);
});
