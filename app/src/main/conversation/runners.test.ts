import { expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listModels, openRunner } from "./runners";
import { ConversationService } from "./service";
import { ConversationStore } from "./store";
import type { EventPayload } from "./types";
it("delivers notifications immediately following the turn reply and confirms owned server exit", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-fake-codex-")), command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{}});
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') {
   process.stdout.write(JSON.stringify({id:r.id,result:{turn:{id:'native-turn'}}})+'\\n'+JSON.stringify({method:'item/agentMessage/delta',params:{threadId:'session',turnId:'native-turn',itemId:'m',delta:'hello'}})+'\\n'+JSON.stringify({method:'turn/completed',params:{threadId:'session',turn:{id:'native-turn',status:'completed'}}})+'\\n');
 }
});
`, { mode: 0o700 });
  const events: EventPayload[] = []; const exited = vi.fn();
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: process.env }, e => events.push(e), exited, () => {});
  try { await runner.send("hello", "local-turn"); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" })); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); rmSync(root, { recursive: true, force: true }); }
});
it("starts the official Claude SDK through only the supplied executable and releases its group", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-fake-claude-")), command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type==='user') {
  send({type:'assistant',parent_tool_use_id:null,message:{id:'m',role:'assistant',content:[{type:'text',text:'hello'}]}});
  send({type:'result',subtype:'success',is_error:false,result:'hello',session_id:r.session_id});
  process.stdin.pause(); setTimeout(()=>process.exit(0),20);
 }
});
`, { mode: 0o700 });
  const events: EventPayload[] = []; const exited = vi.fn();
  const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root } }, e => events.push(e), exited, () => {});
  try { await runner.send("hello", "local-turn"); expect(events).toContainEqual({ type: "turn.done" }); expect(events).toContainEqual({ type: "message.done", messageId: "m", text: "hello" }); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); rmSync(root, { recursive: true, force: true }); }
}, 15000);
it("pins a doan-account Claude run to its login's organization so a repo API key cannot replace the login", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-pinned-claude-")), command = join(root, "claude");
  // The SDK hands the parent policy to the CLI as --managed-settings <json> (0.3.312); the fake records its argv.
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, JSON.stringify(process.argv.slice(2)) + '\\n');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
});
`, { mode: 0o700 });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c1", accountId: "a1", workspaceId: "org-uuid-1", profile: "claude" };
  try {
    for (const input of [{ owner }, {}]) {
      const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, ...input }, () => {}, () => {}, () => {});
      await runner.close();
    }
    const [pinned, legacy] = readFileSync(join(root, "seen"), "utf8").split("\n").filter(line => line.startsWith("[")).map(line => JSON.parse(line) as string[]);
    expect(pinned!.slice(pinned!.indexOf("--managed-settings"), pinned!.indexOf("--managed-settings") + 2)).toEqual(["--managed-settings", '{"forceLoginOrgUUID":"org-uuid-1"}']);
    expect(legacy).not.toContain("--managed-settings");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 15000);
it("refuses an unpinned doan Claude run and names the pin's refusal of a repo-supplied credential", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-pin-claude-")), command = join(root, "claude");
  // Claude Code 2.1.312's refusal when a repo's settings supply an API key under forceLoginOrgUUID (B3 live check).
  writeFileSync(command, `#!/bin/sh
echo started >> ${JSON.stringify(join(root, "seen"))}
echo "This machine's managed settings require a first-party login: they pin Anthropic sign-ins to your organization (forceLoginOrgUUID), and this session is configured with an API key from ANTHROPIC_API_KEY, set in the env block of /repo/.claude/settings.json, which cannot be checked against that policy." >&2
exit 1
`, { mode: 0o700 });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c1", accountId: "a1", workspaceId: "org-uuid-1", profile: "claude" };
  const open = (workspaceId: string | null) => openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, owner: { ...owner, workspaceId } }, () => {}, () => {}, () => {});
  try {
    await expect(open(null)).rejects.toThrow("not_logged_in");
    expect(() => readFileSync(join(root, "seen"))).toThrow();
    await expect(open("org-uuid-1")).rejects.toThrow("credential_override");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 15000);
it("reports malformed accepted transport immediately instead of waiting for process exit", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-malformed-codex-")), command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const readline=require('node:readline'); const send=v=>process.stdout.write(JSON.stringify(v)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);
 if(r.method==='initialize')send({id:r.id,result:{}});
 if(r.method==='thread/start')send({id:r.id,result:{thread:{id:'s'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read')send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start'){send({id:r.id,result:{turn:{id:'t'}}});setTimeout(()=>process.stdout.write('not-json\\n'),10);}
});
`, { mode: 0o700 });
  const events: EventPayload[] = [], exited = vi.fn();
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root } }, e => events.push(e), exited, () => {});
  try { await runner.send("hello", "local"); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.failed", code: "session_unavailable" })); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); rmSync(root, { recursive: true, force: true }); }
});
it.each([
  { mode: "exit", terminal: { type: "turn.failed", code: "process_exited" } },
  { mode: "signal", terminal: { type: "turn.failed", code: "process_exited" } },
  { mode: "interrupt", terminal: { type: "interrupted", reason: "user" } },
  { mode: "lookalike", terminal: { type: "turn.failed", code: "unknown" } },
  { mode: "unknown", terminal: { type: "turn.failed", code: "unknown" } },
  { mode: "auth", terminal: { type: "turn.failed", code: "not_logged_in" } },
  { mode: "rate", terminal: { type: "turn.failed", code: "rate_limited" } },
])("classifies real SDK $mode termination once without inventing success", async ({ mode, terminal }) => {
  const root = mkdtempSync(join(tmpdir(), "doan-sdk-exit-")), command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type==='user') {
  const mode = ${JSON.stringify(mode)};
  if(mode==='exit' || mode==='signal') require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'ignore'});
  if(mode==='exit') process.exit(7);
  if(mode==='signal') process.kill(process.pid, 'SIGKILL');
  if(mode==='interrupt') send({type:'assistant',parent_tool_use_id:null,message:{id:'ready',role:'assistant',content:[{type:'text',text:'waiting'}]}});
  else if(mode!=='exit' && mode!=='signal') {
   const errors = {lookalike:'Claude Code process exited with code 7',unknown:'Unrecognized provider failure',auth:'Authentication required',rate:'Rate limit exceeded'};
   send({type:'result',subtype:'error_during_execution',is_error:true,errors:[errors[mode]],session_id:r.session_id});
   setTimeout(()=>process.exit(7),20);
  }
 }
});
`, { mode: 0o700 });
  const store = new ConversationStore(root), exited = vi.fn();
  const service = new ConversationService(store,
    async () => ({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root } }),
    (input, emit, onExit, registerStop) => openRunner(input, emit, () => { exited(); onExit(); }, registerStop), () => {});
  try {
    const { conversationId } = await service.start({ root, mode: "new", runtime: "claude", text: "hello", anchors: [] });
    if (mode === "interrupt") {
      await vi.waitFor(() => expect(store.read(conversationId)).toContainEqual(expect.objectContaining({ type: "message.done", messageId: "ready", text: "waiting" })));
      await service.interrupt(conversationId);
    }
    await vi.waitFor(() => expect(store.read(conversationId)).toContainEqual(expect.objectContaining(terminal)));
    await service.quit();
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
    expect(store.read(conversationId).filter(e => ["turn.done", "turn.failed", "interrupted"].includes(e.type))).toEqual([expect.objectContaining(terminal)]);
  } finally {
    await service.quit(); rmSync(root, { recursive: true, force: true });
  }
}, 15000);

it.each(["exit", "signal", "eof", "pending", "resend", "completed", "interrupt", "startup"])("settles Codex %s death before releasing surviving descendants", async mode => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-death-")), command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'), readline = require('node:readline');
const mode = ${JSON.stringify(mode)};
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const descendant = require('node:child_process').spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); process.send('ready'); setInterval(()=>{},1000)"], {stdio:['ignore','ignore','ignore','ipc']});
descendant.once('message',()=>{
 fs.writeFileSync('pids.json', JSON.stringify({server:process.pid, child:descendant.pid}));
 const die = () => mode==='eof' ? process.stdout.end() : mode==='signal' ? process.kill(process.pid,'SIGKILL') : process.exit(7);
 readline.createInterface({input:process.stdin}).on('line',line=>{
  const r=JSON.parse(line);
  if(r.method==='initialize') { if(mode==='startup') die(); else send({id:r.id,result:{}}); }
  if(r.method==='thread/start' || r.method==='thread/resume') send({id:r.id,result:{thread:{id:'s'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
  if(r.method==='config/read') send({id:r.id,result:{config:{}}});
  if(r.method==='turn/start') {
   if(mode==='pending') { die(); return; }
   send({id:r.id,result:{turn:{id:'t'}}});
   if(mode==='completed') send({method:'turn/completed',params:{threadId:'s',turn:{id:'t',status:'completed'}}});
   else send({id:7,method:'item/fileChange/requestApproval',params:{threadId:'s',turnId:'t'}});
   if(mode!=='interrupt') setTimeout(die,30);
  }
  if(r.method==='turn/interrupt') die();
 });
});
`, { mode: 0o700 });
  const store = new ConversationStore(root), exited = vi.fn();
  const service = new ConversationService(store,
    async (request, session) => ({ command, runtime: "codex", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root }, ...(session || request.mode === "resume" ? { sessionId: "s" } : {}) }),
    (input, emit, onExit, registerStop) => openRunner(input, emit, () => { exited(); onExit(); }, registerStop), () => {});
  try {
    const request = { root, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
    if (mode === "startup") {
      await expect(service.start(request)).rejects.toThrow("process_exited");
      expect(store.list()).toEqual([]);
    } else {
      const { conversationId } = await service.start(request);
      if (mode === "interrupt") {
        await vi.waitFor(() => expect(store.read(conversationId).some(e => e.type === "permission.request")).toBe(true));
        await service.interrupt(conversationId);
      }
      const terminal = mode === "completed" ? { type: "turn.done" } : mode === "interrupt" ? { type: "interrupted", reason: "user" } : { type: "turn.failed", code: "process_exited" };
      await vi.waitFor(() => expect(store.read(conversationId)).toContainEqual(expect.objectContaining(terminal)), { timeout: 400, interval: 10 });
      expect(exited).not.toHaveBeenCalled();
      const pids: { server: number; child: number } = JSON.parse(readFileSync(join(root, "pids.json"), "utf8"));
      expect(() => process.kill(pids.child, 0)).not.toThrow();
      await expect(service.start({ ...request, mode: "resume" })).rejects.toThrow("session_in_use");
      if (mode === "resend") {
        await service.send(conversationId, "again", []);
        await vi.waitFor(() => expect(store.read(conversationId).filter(e => e.type === "turn.failed")).toEqual([expect.objectContaining(terminal), expect.objectContaining(terminal)]));
      }
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 2500 });
      expect(store.read(conversationId).filter(e => ["turn.done", "turn.failed", "interrupted"].includes(e.type))).toEqual((mode === "resend" ? [terminal, terminal] : [terminal]).map(e => expect.objectContaining(e)));
      if (["exit", "signal", "eof"].includes(mode)) expect(store.read(conversationId)).toContainEqual(expect.objectContaining({ type: "permission.resolved", requestId: "number:7", optionId: "expired" }));
      expect(() => process.kill(-pids.server, 0)).toThrow();
    }
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 2500 });
  } finally {
    await service.quit();
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 2500 });
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);
it("puts doan-account arguments ahead of the Codex app-server subcommand", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-fake-codex-")), command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(join(root, "argv.json"))}, JSON.stringify(process.argv.slice(2)));
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{}});
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
});
`, { mode: 0o700 });
  const exited = vi.fn();
  const runner = await openRunner({ command, args: ["-c", 'cli_auth_credentials_store="keyring"'], runtime: "codex", cwd: root, configDir: root, env: process.env }, () => {}, exited, () => {});
  try { expect(JSON.parse(readFileSync(join(root, "argv.json"), "utf8"))).toEqual(["-c", 'cli_auth_credentials_store="keyring"', "app-server"]); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); rmSync(root, { recursive: true, force: true }); }
});
// A fake Codex app-server whose handshake answers come from FAKE_CODEX: "init-error:<message>", "init-null", "no-thread", "exit", "silent".
function fakeCodex() {
  const root = mkdtempSync(join(tmpdir(), "doan-fake-codex-")), command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const mode = process.env.FAKE_CODEX ?? "";
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.method==='initialize') { if(mode==='silent') return; if(mode==='exit') process.exit(7); if(mode.startsWith('init-error:')) send({id:r.id,error:{code:-32600,message:mode.slice(11)}}); else send({id:r.id,result:mode==='init-null'?null:{}}); }
 if(r.method==='thread/start') send({id:r.id,result:mode==='no-thread'?{thread:{}}:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='thread/resume') send({id:r.id,result:{thread:{id:r.params.threadId}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
});
`, { mode: 0o700 });
  return { root, command };
}
async function codexHandshake(mode: string, sessionId?: string) {
  const { root, command } = fakeCodex(); const order: string[] = [];
  const incompatible = vi.fn(() => { order.push("recorded"); }), compatible = vi.fn(() => { order.push("cleared"); }), exited = vi.fn();
  const opened = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { ...process.env, FAKE_CODEX: mode }, ...(sessionId ? { sessionId } : {}), incompatible, compatible }, () => {}, exited, () => {})
    .then(runner => runner, (error: unknown) => { order.push("refused"); return error as Error; });
  if (!(opened instanceof Error)) { await opened.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); }
  rmSync(root, { recursive: true, force: true });
  return { opened, order, incompatible, compatible };
}
it.each([
  ["an initialize error reply", "init-error:Unsupported client capabilities", "unknown"],
  ["a thread/start reply without a thread id", "no-thread", "session_unavailable"],
])("records a new Codex session's installed version as incompatible on %s before refusing with the unchanged code", async (_label, mode, code) => {
  const h = await codexHandshake(mode);
  expect(h.opened).toBeInstanceOf(Error); expect((h.opened as Error).message).toBe(code);
  expect(h.order).toEqual(["recorded", "refused"]);
});
it.each([
  ["Authentication required", "not_logged_in"],
  ["Too many requests", "rate_limited"],
  ["Thread already has an active writer", "session_in_use"],
])("does not record a new Codex initialize error reply that reads as an account or ownership answer (%s)", async (message, code) => {
  const h = await codexHandshake(`init-error:${message}`);
  expect((h.opened as Error).message).toBe(code); expect(h.order).toEqual(["refused"]);
});
it("does not record a Codex server that exits during initialize", async () => {
  const h = await codexHandshake("exit");
  expect((h.opened as Error).message).toBe("process_exited"); expect(h.order).toEqual(["refused"]);
});
it("clears a Codex record once a new session's thread/start passes", async () => {
  expect((await codexHandshake("")).order).toEqual(["cleared"]);
});
it("records a new Codex session's non-object initialize result, then refuses it with the generic code", async () => {
  const odd = await codexHandshake("init-null");
  expect(odd.opened).toBeInstanceOf(Error); expect((odd.opened as Error).message).toBe("unknown");
  expect(odd.order).toEqual(["recorded", "refused"]);
});
it("does not record a Codex initialize that times out", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const pending = codexHandshake("silent");
    await vi.advanceTimersByTimeAsync(10_000);
    const h = await pending; expect((h.opened as Error).message).toBe("unknown"); expect(h.order).toEqual(["refused"]);
  } finally { vi.useRealTimers(); }
});
it("never records on a Codex resume and clears once its initialize passes", async () => {
  const session = "01a178ba-f9dc-7161-9544-f20f656064a1";
  expect((await codexHandshake("init-error:Unsupported client capabilities", session)).order).toEqual(["refused"]);
  expect((await codexHandshake("", session)).order).toEqual(["cleared"]);
});

// buzz-home: model lists without a prompt, and the conversation's model and effort on every run.
function listingClaude(root: string): string {
  const command = join(root, "claude");
  // Answers initialize with the supportedModels rows the P1 PoC recorded; records argv and stdin lines.
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, JSON.stringify(process.argv.slice(2)) + '\\n');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const models = [{value:'default',displayName:'Default (recommended)',description:'',supportsEffort:true,supportedEffortLevels:['low','high']},{value:'haiku',displayName:'Haiku',description:'',supportsEffort:false}];
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models,account:{}}}});
 if(r.type==='user') { send({type:'result',subtype:'success',is_error:false,result:'ok',session_id:r.session_id}); process.stdin.pause(); setTimeout(()=>process.exit(0),20); }
});
`, { mode: 0o700 });
  return command;
}
it("lists Claude's models from the SDK without sending a prompt and reports the process gone", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-models-")), command = listingClaude(root);
  const release = vi.fn();
  try {
    const models = await listModels({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root } }, release, () => {});
    expect(models).toEqual({ models: [{ id: "default", label: "Default (recommended)", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku", default: false }] });
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(readFileSync(join(root, "seen"), "utf8")).not.toContain('"type":"user"');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 15000);
it("passes the chosen Claude model and effort on a new run and again on a resume", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-choice-")), command = listingClaude(root);
  try {
    for (const sessionId of [undefined, "11111111-1111-4111-8111-111111111111"]) {
      const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, model: "haiku", effort: "low", ...(sessionId ? { sessionId } : {}) }, () => {}, () => {}, () => {});
      await runner.send("hello", "turn"); await runner.close();
    }
    const runs = readFileSync(join(root, "seen"), "utf8").split("\n").filter(line => line.startsWith("[")).map(line => (JSON.parse(line) as string[]).join(" "));
    expect(runs).toHaveLength(2);
    for (const argv of runs) { expect(argv).toMatch(/--model[= ]haiku/); expect(argv).toMatch(/--effort[= ]low/); }
    expect(runs[1]).toContain("--resume");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 20000);
function listingCodex(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
let turn = 0;
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{userAgent:'fake'}});
 if(r.method==='model/list') send({id:r.id,result:{data:[{id:'gpt-6-luna',displayName:'GPT-6-Luna',isDefault:true,hidden:false,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]}],nextCursor:null}});
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') { const id = 'native-' + (++turn); send({id:r.id,result:{turn:{id}}}); send({method:'turn/completed',params:{threadId:'session',turn:{id,status:'completed'}}}); }
});
`, { mode: 0o700 });
  return command;
}
it("lists Codex models with model/list and starts no thread", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-models-")), command = listingCodex(root);
  const release = vi.fn();
  try {
    expect(await listModels({ command, runtime: "codex", cwd: root, configDir: root, env: process.env }, release, () => {})).toEqual({ models: [{ id: "gpt-6-luna", label: "GPT-6-Luna", default: true, efforts: ["low", "high"] }] });
    const methods = readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => (JSON.parse(line) as { method?: string }).method);
    expect(methods).toEqual(["initialize", "initialized", "model/list"]);
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it("passes the chosen Codex model and effort on every turn/start of the same server", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-choice-")), command = listingCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: process.env, model: "gpt-6-luna", effort: "high" }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("one", "t1"); await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(1));
    await runner.send("two", "t2"); await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(2));
    const turns = readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> }).filter(r => r.method === "turn/start");
    expect(turns.map(t => [t.params?.model, t.params?.effort])).toEqual([["gpt-6-luna", "high"], ["gpt-6-luna", "high"]]);
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});
it("lets a send change the Codex model and effort on the reused server for that turn on", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-turn-choice-")), command = listingCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: process.env, model: "gpt-6-luna", effort: "high" }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("one", "t1"); await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(1));
    await runner.send("two", "t2", undefined, { model: "gpt-6-sol" }); await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(2));
    await runner.send("three", "t3", undefined, { model: "gpt-6-luna", effort: "low" }); await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(3));
    const turns = readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> }).filter(r => r.method === "turn/start");
    expect(turns.map(t => [t.params?.model, t.params?.effort])).toEqual([["gpt-6-luna", "high"], ["gpt-6-sol", undefined], ["gpt-6-luna", "low"]]);
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});

// permission-mode S2: the chosen mode on every Claude run and every Codex turn.
it("passes each mode to a doan-owned Claude run, with the dangerous skip only for Full access and nothing for Default", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-mode-")), command = listingClaude(root);
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c1", accountId: "a1", workspaceId: "org-uuid-1", profile: "claude" };
  try {
    for (const permissionMode of [undefined, "default", "acceptEdits", "plan", "bypass"] as const) {
      const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, owner, ...(permissionMode ? { permissionMode } : {}) }, () => {}, () => {}, () => {});
      await runner.send("hello", "turn"); await runner.close();
    }
    // A terminal session's run (no doan owner) keeps the person's own profile settings, as Codex does (RV-A ⚪ 2).
    const legacy = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, permissionMode: "bypass" }, () => {}, () => {}, () => {});
    await legacy.send("hello", "turn"); await legacy.close();
    const runs = readFileSync(join(root, "seen"), "utf8").split("\n").filter(line => line.startsWith("[")).map(line => JSON.parse(line) as string[]);
    // The SDK writes the mode as --permission-mode=<mode> or as two arguments.
    const mode = (argv: string[]) => { const at = argv.findIndex(arg => arg.startsWith("--permission-mode")); return at < 0 ? null : argv[at]!.includes("=") ? argv[at]!.split("=")[1] : argv[at + 1]; };
    const flags = runs.map(argv => [mode(argv), argv.includes("--allow-dangerously-skip-permissions")]);
    expect(flags).toEqual([[null, false], [null, false], ["acceptEdits", false], ["plan", false], ["bypassPermissions", true], [null, false]]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
// Answers initialize; a prompt reports a status message with FAKE_STATUS's permissionMode before its result.
function statusClaude(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type==='user') {
  send({type:'system',subtype:'status',status:null,permissionMode:process.env.FAKE_STATUS,uuid:'00000000-0000-4000-8000-000000000001',session_id:r.session_id});
  send({type:'result',subtype:'success',is_error:false,result:'ok',session_id:r.session_id});
  process.stdin.pause(); setTimeout(()=>process.exit(0),20);
 }
});
`, { mode: 0o700 });
  return command;
}
it("reports the mode Claude switched to after a plan approval, only on a turn sent with Plan", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-plan-")), command = statusClaude(root);
  const run = async (permissionMode: "plan" | "default" | undefined, status: string) => {
    const planApproved = vi.fn(), events: EventPayload[] = [];
    const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_STATUS: status }, planApproved, ...(permissionMode ? { permissionMode } : {}) }, e => events.push(e), () => {}, () => {});
    await runner.send("hello", "turn"); await runner.close();
    expect(events).toContainEqual({ type: "turn.done" });
    return planApproved.mock.calls.map(call => call[0]);
  };
  try {
    expect(await run("plan", "default")).toEqual(["default"]);
    expect(await run("plan", "bypassPermissions")).toEqual(["default"]);
    expect(await run("plan", "auto")).toEqual(["default"]);
    // Still planning is no switch; outside a Plan turn a mode switch (a suggestion's setMode) is never followed.
    expect(await run("plan", "plan")).toEqual([]);
    expect(await run("default", "acceptEdits")).toEqual([]);
    expect(await run(undefined, "acceptEdits")).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 40000);

const CODEX_OWNER = { kind: "doan" as const, provider: "codex" as const, connectionId: "c1", accountId: "a1", workspaceId: null, profile: "codex" };
// A Codex app-server that records every line. FAKE_PROBE picks the ephemeral thread/start reply: "" the trusted
// project's values, "error" an error, "bare" no values, "exit" a server exit; FAKE_CONFIG "error" fails config/read.
function modeCodex(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const probe = process.env.FAKE_PROBE ?? '', config = process.env.FAKE_CONFIG ?? '';
let turn = 0;
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{userAgent:'fake'}});
 if(r.method==='thread/start' && !r.params.ephemeral) send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'never',sandbox:{type:'dangerFullAccess'}}});
 if(r.method==='thread/resume') send({id:r.id,result:{thread:{id:r.params.threadId},approvalPolicy:'never',sandbox:{type:'dangerFullAccess'}}});
 if(r.method==='thread/start' && r.params.ephemeral) {
  if(probe==='exit') process.exit(7);
  if(probe==='error') send({id:r.id,error:{code:-32600,message:'ephemeral threads are not supported'}});
  else send({id:r.id,result:probe==='bare'?{thread:{id:'probe'}}:{thread:{id:'probe'},approvalPolicy:'on-request',sandbox:{type:'workspaceWrite',writableRoots:[],networkAccess:false}}});
 }
 if(r.method==='config/read') send(config==='error'?{id:r.id,error:{code:-32601,message:'Method not found'}}:{id:r.id,result:{config:{approval_policy:null,sandbox_mode:null,sandbox_workspace_write:{network_access:true,writable_roots:['/extra'],exclude_slash_tmp:false}}}});
 if(r.method==='turn/start') { const id = 'native-' + (++turn); send({id:r.id,result:{turn:{id}}}); send({method:'turn/completed',params:{threadId:'session',turn:{id,status:'completed'}}}); }
});
`, { mode: 0o700 });
  return command;
}
const seenLines = (root: string) => readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> });
it("reads Codex's Default values once per server and states every turn's approval and sandbox, Default included", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-mode-")), command = modeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, permissionMode: "bypass" }, e => events.push(e), () => {}, () => {});
  try {
    const modes = [undefined, "acceptEdits", "default", "plan", "bypass"] as const;
    for (const [i, permissionMode] of modes.entries()) {
      await runner.send("x", `t${i}`, undefined, permissionMode ? { permissionMode } : undefined);
      await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(i + 1));
    }
    const lines = seenLines(root);
    expect(lines.filter(r => r.method && r.method !== "turn/start").map(r => [r.method, r.params])).toEqual([
      ["initialize", expect.anything()], ["initialized", undefined], ["thread/start", { cwd: root }], ["thread/start", { cwd: root, ephemeral: true }], ["config/read", { cwd: root }]]);
    const userDefault = { approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", writableRoots: [], networkAccess: false } };
    expect(lines.filter(r => r.method === "turn/start").map(r => ({ approvalPolicy: r.params?.approvalPolicy, sandboxPolicy: r.params?.sandboxPolicy }))).toEqual([
      // No choice on the send: the mode the server was opened with.
      { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } },
      { approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", networkAccess: true, writableRoots: ["/extra"] } },
      // Back to Default after an override: the probe's values, stated.
      userDefault,
      { approvalPolicy: "never", sandboxPolicy: { type: "readOnly" } },
      { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } },
    ]);
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});
it("probes after a Codex resume too, whose thread still carries the last override", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-mode-resume-")), command = modeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, sessionId: "session" }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("x", "t1"); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    const lines = seenLines(root);
    expect(lines.filter(r => r.method === "thread/resume" || r.method === "thread/start").map(r => r.params)).toEqual([{ threadId: "session" }, { cwd: root, ephemeral: true }]);
    expect(lines.find(r => r.method === "turn/start")!.params).toMatchObject({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", writableRoots: [], networkAccess: false } });
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});
it("sends a bare workspaceWrite for Accept edits when config/read fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-mode-config-")), command = modeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: { ...process.env, FAKE_CONFIG: "error" }, permissionMode: "acceptEdits" }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("x", "t1"); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    expect(seenLines(root).find(r => r.method === "turn/start")!.params).toMatchObject({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite" } });
    expect(seenLines(root).find(r => r.method === "turn/start")!.params!.sandboxPolicy).toEqual({ type: "workspaceWrite" });
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});
// A failed or incomplete probe never falls back to sending nothing: an earlier override would stay (conductor decision).
it.each([["an error reply", "error"], ["a reply without the values", "bare"]])("refuses to open a Codex server whose Default probe gets %s, without recording the version", async (_label, probe) => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-probe-")), command = modeCodex(root);
  const incompatible = vi.fn(), compatible = vi.fn(), exited = vi.fn();
  try {
    await expect(openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: { ...process.env, FAKE_PROBE: probe }, incompatible, compatible }, () => {}, exited, () => {})).rejects.toThrow("session_unavailable");
    expect(incompatible).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it("releases a Codex conversation's reservation when its server dies during the Default probe", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-probe-death-")), command = modeCodex(root);
  const store = new ConversationStore(root), exited = vi.fn(); let probe = "exit";
  const service = new ConversationService(store,
    async () => ({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: { ...process.env, FAKE_PROBE: probe }, sessionId: "session" }),
    (input, emit, onExit, registerStop) => openRunner(input, emit, () => { exited(); onExit(); }, registerStop), () => {});
  const request = { root, mode: "resume" as const, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] };
  try {
    await expect(service.start(request)).rejects.toThrow("process_exited");
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
    expect(store.list()).toEqual([]);
    probe = "";
    const { conversationId } = await service.start(request);
    await vi.waitFor(() => expect(store.read(conversationId)).toContainEqual(expect.objectContaining({ type: "turn.done" })));
  } finally { await service.quit(); rmSync(root, { recursive: true, force: true }); }
});
// A terminal session runs on the person's own Codex profile and takes no mode: whatever override its thread carries
// from the terminal stays, as before (spec non-goal).
it("sends no probe and no approval or sandbox for a Codex run on an external profile", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-external-")), command = modeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { ...process.env, FAKE_PROBE: "error" }, sessionId: "session" }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("x", "t1", undefined, { permissionMode: "default" }); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    const lines = seenLines(root);
    expect(lines.map(r => r.method).filter(Boolean)).toEqual(["initialize", "initialized", "thread/resume", "turn/start"]);
    expect(lines.find(r => r.method === "turn/start")!.params).not.toHaveProperty("approvalPolicy");
    expect(lines.find(r => r.method === "turn/start")!.params).not.toHaveProperty("sandboxPolicy");
  } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
});

// queue-send-now: steer on the Codex and Claude runners. The fakes follow the PoC's wire shapes (Claude Code 2.1.317, Codex 0.166.0).
// FAKE_STEER: "echo" accepts and echoes the clientUserMessageId in the same turn, then completes; "error" answers the
// steer with the server's after-completion error and completes; "refused" answers with an error and then echoes it anyway;
// "early" echoes the message before its steer reply and completes later; "silent" never answers the steer, echoes it
// and completes later;
// "complete" completes the turn with turn/start; "slow" answers turn/start late.
function steerCodex(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_STEER;
const done = () => send({method:'turn/completed',params:{threadId:'session',turn:{id:'native-1',status:'completed'}}});
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{userAgent:'fake'}});
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') {
  const reply = () => send({id:r.id,result:{turn:{id:'native-1'}}});
  if(mode==='slow') setTimeout(() => { reply(); done(); }, 400); else reply();
  if(mode==='complete') done();
 }
 if(r.method==='turn/steer') {
  if(mode==='echo') {
   send({id:r.id,result:{turnId:r.params.expectedTurnId}});
   const item = {type:'userMessage',id:'u1',clientId:r.params.clientUserMessageId,content:r.params.input};
   send({method:'item/started',params:{threadId:'session',turnId:'native-1',item}});
   send({method:'item/completed',params:{threadId:'session',turnId:'native-1',item}});
   send({method:'item/completed',params:{threadId:'session',turnId:'native-1',item:{type:'agentMessage',id:'a1',text:'BANANA'}}});
   done();
  }
  const item = {type:'userMessage',id:'u1',clientId:r.params.clientUserMessageId,content:r.params.input};
  const echo = () => send({method:'item/started',params:{threadId:'session',turnId:'native-1',item}});
  if(mode==='error') { send({id:r.id,error:{code:-32600,message:'no active turn to steer'}}); done(); }
  if(mode==='refused') { send({id:r.id,error:{code:-32600,message:'no active turn to steer'}}); echo(); done(); }
  if(mode==='early') { echo(); send({id:r.id,result:{turnId:r.params.expectedTurnId}}); setTimeout(done, 50); }
  if(mode==='silent') setTimeout(() => { echo(); done(); }, 500);
 }
});
`, { mode: 0o700 });
  return command;
}
async function codexSteerRun(mode: string, body: (h: { runner: Awaited<ReturnType<typeof openRunner>> & { steer?: (prompt: string, turnId: string, messageId: string) => Promise<void> }; seq: unknown[]; root: string }) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-steer-")), command = steerCodex(root), seq: unknown[] = [];
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { ...process.env, FAKE_STEER: mode }, model: "gpt-6-luna", effort: "high", steerConsumed: (id: string) => seq.push({ consumed: id }) } as Parameters<typeof openRunner>[0], e => seq.push(e), () => {}, () => {});
  try { await body({ runner, seq, root }); } finally { vi.useRealTimers(); await runner.close(); rmSync(root, { recursive: true, force: true }); }
}
it("steers a running Codex turn with the native turn id and the message id, no overrides, and reports its echo in line", async () => {
  await codexSteerRun("echo", async ({ runner, seq, root }) => {
    await runner.send("first", "local-1");
    await runner.steer!("Extra note", "local-1", "c1");
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    expect(seq).toEqual([{ consumed: "c1" }, { type: "message.done", messageId: "a1", text: "BANANA" }, { type: "turn.done" }]);
    const steers = seenLines(root).filter(r => r.method === "turn/steer");
    expect(steers.map(r => r.params)).toEqual([{ threadId: "session", expectedTurnId: "native-1", input: [{ type: "text", text: "Extra note" }], clientUserMessageId: "c1" }]);
  });
});
it("refuses a Codex steer the server answers with an error, and the turn still ends as it would", async () => {
  await codexSteerRun("error", async ({ runner, seq }) => {
    await runner.send("first", "local-1");
    await expect(runner.steer!("late", "local-1", "c1")).rejects.toThrow("no active turn to steer");
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    expect(seq).toEqual([{ type: "turn.done" }]);
  });
});
it("never reports a Codex steer read once the server refused it, even if an echo follows", async () => {
  await codexSteerRun("refused", async ({ runner, seq }) => {
    await runner.send("first", "local-1");
    await expect(runner.steer!("late", "local-1", "c1")).rejects.toThrow("no active turn to steer");
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    expect(seq).toEqual([{ type: "turn.done" }]);
  });
});
// The server does not order its turn/steer reply and the userMessage echo: consumption can come before acceptance.
it("reports a Codex steer read before steer resolves when the echo precedes the reply", async () => {
  await codexSteerRun("early", async ({ runner, seq }) => {
    await runner.send("first", "local-1");
    await runner.steer!("Extra note", "local-1", "c1").then(() => seq.push("accepted"));
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    expect(seq).toEqual([{ consumed: "c1" }, "accepted", { type: "turn.done" }]);
  });
});
it("refuses a Codex steer unanswered for 10 s without failing the turn, and still reports its late echo", async () => {
  await codexSteerRun("silent", async ({ runner, seq }) => {
    await runner.send("first", "local-1");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const refused = runner.steer!("note", "local-1", "c1").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(((await refused) as Error).message).toBe("RPC timeout");
    vi.useRealTimers();
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    expect(seq).toEqual([{ consumed: "c1" }, { type: "turn.done" }]);
  });
}, 15000);
it("refuses a Codex steer before the turn has its native id, after it ended, and for another turn, without writing it", async () => {
  await codexSteerRun("slow", async ({ runner, seq, root }) => {
    const sending = runner.send("first", "local-1");
    await vi.waitFor(() => expect(seenLines(root).some(r => r.method === "turn/start")).toBe(true));
    await expect(runner.steer!("early", "local-1", "c1")).rejects.toThrow("not_running");
    await sending; await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    await expect(runner.steer!("late", "local-1", "c2")).rejects.toThrow("not_running");
    expect(seenLines(root).filter(r => r.method === "turn/steer")).toEqual([]);
  });
  await codexSteerRun("complete", async ({ runner, seq, root }) => {
    await runner.send("first", "local-1"); await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
    await expect(runner.steer!("late", "local-1", "c1")).rejects.toThrow("not_running");
    await runner.send("second", "local-2");
    await expect(runner.steer!("other turn", "local-1", "c2")).rejects.toThrow("not_running");
    expect(seenLines(root).filter(r => r.method === "turn/steer")).toEqual([]);
  });
});
// A Claude CLI that, like the real one in streaming-input mode, exits only once its stdin ends. FAKE_STEER: "fold" runs
// a tool and folds a steered message into the turn at its status frame; "continued" answers without tools and goes on
// to another turn for the steered message, after a result with queued_turn_count 0; "single" ends the first turn
// at once; "failed" and "aborted" end it with an error or an aborted result; "hold" never ends it; "hidden" runs a tool,
// answers the steered message's line with a failed result and then goes on to a turn for it that ignores stdin's end;
// "late" answers the steered message's line with a success result that leaves it unread, echoes it in a follow-up turn
// only once the file "go" exists, and ignores stdin's end until then.
function steerClaude(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_STEER; let users = 0, first = '00000000-0000-4000-8000-00000000000f', echoed = false;
const sys = (subtype, uuids) => send({type:'system',subtype,user_message_uuids:uuids,session_id:'s'});
const say = (id, text) => send({type:'assistant',parent_tool_use_id:null,message:{id,role:'assistant',content:[{type:'text',text}]}});
const result = (uuids, extra) => send({type:'result',subtype:'success',is_error:false,result:'ok',user_message_uuids:uuids,queued_turn_count:0,session_id:'s',...extra});
const input = readline.createInterface({input:process.stdin});
input.on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
 if(r.type!=='user') return;
 if(++users === 1) {
  if(r.uuid) first = r.uuid;
  sys('init',[first]); sys('status',[first]);
  if(mode==='fold' || mode==='hidden') send({type:'assistant',parent_tool_use_id:null,message:{id:'a1',role:'assistant',content:[{type:'tool_use',id:'toolu_1',name:'Bash',input:{command:'sleep 12'}}]}});
  if(mode==='continued' || mode==='hold' || mode==='late') say('a1','40 facts');
  if(mode==='single') { say('a1','hello'); result([first]); }
  if(mode==='failed') send({type:'result',subtype:'error_during_execution',is_error:true,errors:['Unrecognized provider failure'],session_id:'s'});
  if(mode==='aborted') send({type:'result',subtype:'error_during_execution',is_error:true,terminal_reason:'aborted_tools',errors:[],session_id:'s'});
  return;
 }
 if(mode==='fold') { sys('status',[first, r.uuid]); say('a2','BANANA'); result([first, r.uuid]); }
 if(mode==='continued') { result([first]); sys('init',[r.uuid]); sys('status',[r.uuid]); say('a2','BANANA'); result([r.uuid]); }
 if(mode==='late') {
  result([first]); fs.writeFileSync(${JSON.stringify(join(root, "resulted"))}, '');
  const poll = setInterval(() => {
   if(!fs.existsSync(${JSON.stringify(join(root, "go"))})) return;
   clearInterval(poll); echoed = true; sys('init',[r.uuid]); sys('status',[r.uuid]); say('a2','BANANA'); result([r.uuid]);
  }, 20);
 }
 if(mode==='hidden') {
  send({type:'result',subtype:'error_during_execution',is_error:true,errors:['Unrecognized provider failure'],session_id:'s'});
  setTimeout(() => { sys('init',[r.uuid]); say('a2','hidden edit'); }, 50);
  setInterval(() => say('a3','still working'), 100); setTimeout(() => { result([r.uuid]); process.exit(0); }, 10000);
 }
});
input.on('close', () => { fs.writeFileSync(${JSON.stringify(join(root, "closed"))}, ''); if(mode!=='hidden' && (mode!=='late' || echoed)) setTimeout(() => process.exit(0), 20); });
`, { mode: 0o700 });
  return command;
}
const STEER_ID = "6190301c-24ce-42a9-8a51-ad4fdf91835e";
async function claudeSteerRun(mode: string, body: (h: { runner: Awaited<ReturnType<typeof openRunner>> & { steer?: (prompt: string, turnId: string, messageId: string) => Promise<void> }; seq: unknown[]; root: string; exited: ReturnType<typeof vi.fn> }) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-steer-")), command = steerClaude(root), seq: unknown[] = [], exited = vi.fn();
  const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_STEER: mode }, steerConsumed: (id: string) => seq.push({ consumed: id }) } as Parameters<typeof openRunner>[0], e => seq.push(e), exited, () => {});
  try { await body({ runner, seq, root, exited }); } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
}
const userLines = (root: string) => readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>).filter(r => r.type === "user");
it("folds a Claude message steered during a tool into the running turn, then closes its input on the result", async () => {
  await claudeSteerRun("fold", async ({ runner, seq, root, exited }) => {
    const sending = runner.send("hello", "turn-1");
    await vi.waitFor(() => expect(seq).toContainEqual(expect.objectContaining({ type: "activity" })));
    await runner.steer!("Extra note", "turn-1", STEER_ID);
    await sending;
    expect(seq).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }, { consumed: STEER_ID }, { type: "message.done", messageId: "a2", text: "BANANA" }, { type: "turn.done" }]);
    const steered = userLines(root)[1];
    expect(steered).toMatchObject({ uuid: STEER_ID, message: { role: "user", content: "Extra note" }, parent_tool_use_id: null });
    expect(steered).not.toHaveProperty("priority");
    expect(readFileSync(join(root, "closed"), "utf8")).toBe("");
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
    await expect(runner.steer!("after", "turn-1", "late")).rejects.toThrow("not_running");
  });
}, 15000);
it("waits past a Claude result with queued_turn_count 0 while the steered message is unread, and ends on the continued turn's result", async () => {
  await claudeSteerRun("continued", async ({ runner, seq }) => {
    const sending = runner.send("hello", "turn-1");
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "message.done", messageId: "a1", text: "40 facts" }));
    await runner.steer!("Extra note", "turn-1", STEER_ID);
    await sending;
    expect(seq).toEqual([{ type: "message.done", messageId: "a1", text: "40 facts" }, { consumed: STEER_ID }, { type: "message.done", messageId: "a2", text: "BANANA" }, { type: "turn.done" }]);
  });
}, 15000);
it.each([
  ["single", { type: "turn.done" }],
  ["failed", { type: "turn.failed", code: "unknown", detail: "Unrecognized provider failure" }],
  ["aborted", { type: "turn.failed", code: "process_exited" }],
])("closes a Claude turn's input on its %s terminal so the CLI exits, and refuses a steer after it", async (mode, terminal) => {
  await claudeSteerRun(mode, async ({ runner, seq, exited }) => {
    await runner.send("hello", "turn-1");
    expect(seq.filter(e => ["turn.done", "turn.failed", "interrupted"].includes((e as { type?: string }).type ?? ""))).toEqual([terminal]);
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
    await expect(runner.steer!("late", "turn-1", STEER_ID)).rejects.toThrow("not_running");
  });
}, 15000);
// A failed result that leaves a steered message unread ends the turn and the item goes back to the draft, so the CLI must
// not go on to run it unseen: the group stops with the input, and send does not wait for the hidden turn.
it("stops the Claude CLI when a failed result leaves a steered message unread, so its hidden turn neither records nor holds send", async () => {
  await claudeSteerRun("hidden", async ({ runner, seq, root, exited }) => {
    const sending = runner.send("hello", "turn-1");
    await vi.waitFor(() => expect(seq).toContainEqual(expect.objectContaining({ type: "activity" })));
    const started = Date.now();
    await runner.steer!("Extra note", "turn-1", STEER_ID);
    await sending;
    expect(Date.now() - started).toBeLessThan(3000);
    expect(userLines(root)[1]).toMatchObject({ uuid: STEER_ID });
    expect(seq).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }, { type: "turn.failed", code: "unknown", detail: "Unrecognized provider failure" }]);
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
  });
}, 15000);
// A success result that leaves a steered uuid unread waits at most STEER_READ_WAIT_MS (30 s) for its echo. The CLI's own
// timers run in real time; only setTimeout is faked, from just before the steer, so a group stop's 2 s wait must be advanced.
async function lateSteer(runner: { send(prompt: string, turnId: string): Promise<void>; steer?: (prompt: string, turnId: string, messageId: string) => Promise<void> }, seq: unknown[], root: string) {
  const sending = runner.send("hello", "turn-1").then(() => "resolved", (e: unknown) => e);
  await vi.waitFor(() => expect(seq).toContainEqual({ type: "message.done", messageId: "a1", text: "40 facts" }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await runner.steer!("Extra note", "turn-1", STEER_ID);
  await vi.waitFor(() => expect(existsSync(join(root, "resulted"))).toBe(true));
  // The result is written before the marker; give the runner real time to read it (setInterval is not faked).
  await new Promise<void>(resolve => { const timer = setInterval(() => { clearInterval(timer); resolve(); }, 100); });
  return { sending };
}
const terminals = (seq: unknown[]) => seq.filter(e => ["turn.done", "turn.failed", "interrupted"].includes((e as { type?: string }).type ?? ""));
it("ends a Claude turn as done when its steered message stays unread 30 s after a success result, and stops the CLI", async () => {
  await claudeSteerRun("late", async ({ runner, seq, root, exited }) => {
    try {
      const { sending } = await lateSteer(runner, seq, root);
      await vi.advanceTimersByTimeAsync(29_000);
      expect(terminals(seq)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_500);
      await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
      expect(await sending).toBe("resolved");
      // The fake ignores stdin's end while the message is unread, so only the group's stop ends it.
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      await vi.advanceTimersByTimeAsync(31_000);
      expect(seq).toEqual([{ type: "message.done", messageId: "a1", text: "40 facts" }, { type: "turn.done" }]);
      await expect(runner.steer!("late", "turn-1", "late")).rejects.toThrow("not_running");
    } finally { vi.useRealTimers(); }
  });
}, 15000);
it("goes on to the follow-up Claude turn when the steered message is read 29 s after the success result, and ends at its result", async () => {
  await claudeSteerRun("late", async ({ runner, seq, root, exited }) => {
    try {
      const { sending } = await lateSteer(runner, seq, root);
      await vi.advanceTimersByTimeAsync(29_000);
      writeFileSync(join(root, "go"), "");
      await vi.waitFor(() => expect(seq).toContainEqual({ type: "turn.done" }));
      expect(await sending).toBe("resolved");
      await vi.advanceTimersByTimeAsync(31_000);
      expect(seq).toEqual([{ type: "message.done", messageId: "a1", text: "40 facts" }, { consumed: STEER_ID }, { type: "message.done", messageId: "a2", text: "BANANA" }, { type: "turn.done" }]);
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
    } finally { vi.useRealTimers(); }
  });
}, 15000);
it("leaves a Claude turn stopped during the unread-steer wait as a stop, with no late done", async () => {
  await claudeSteerRun("late", async ({ runner, seq, root, exited }) => {
    try {
      const { sending } = await lateSteer(runner, seq, root);
      await vi.advanceTimersByTimeAsync(10_000);
      const stopped = runner.stop();
      await vi.advanceTimersByTimeAsync(2_000); await stopped;
      expect(await sending).not.toBe("resolved");
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      await vi.advanceTimersByTimeAsync(31_000);
      expect(terminals(seq)).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
}, 15000);
it("refuses a Claude steer for another turn or after a stop, and a stop closes the input", async () => {
  await claudeSteerRun("hold", async ({ runner, seq, exited }) => {
    await expect(runner.steer!("before", "turn-1", STEER_ID)).rejects.toThrow("not_running");
    // A stopped send rejects with the SDK's abort; it is caught from the start so the rejection is never unhandled.
    const sending = runner.send("hello", "turn-1").catch((e: unknown) => e);
    await vi.waitFor(() => expect(seq).toContainEqual({ type: "message.done", messageId: "a1", text: "40 facts" }));
    await expect(runner.steer!("other", "turn-2", STEER_ID)).rejects.toThrow("not_running");
    await runner.stop();
    await expect(runner.steer!("stopped", "turn-1", STEER_ID)).rejects.toThrow("not_running");
    await sending;
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
  });
}, 15000);
// POSTMORTEM 2026-10-28: a send on turn.done, before the previous process's exit callback, is not refused as busy.
it("accepts a Claude send issued on turn.done, before the first CLI has exited", async () => {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-next-")), command = steerClaude(root);
  const store = new ConversationStore(root);
  const service = new ConversationService(store,
    async (_request, stored) => ({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_STEER: "single" }, ...(stored ? { sessionId: stored.session.sessionId } : {}) }),
    openRunner, () => {});
  try {
    const { conversationId } = await service.start({ root, mode: "new", runtime: "claude", text: "hello", anchors: [] });
    await vi.waitFor(() => expect(store.read(conversationId)).toContainEqual(expect.objectContaining({ type: "turn.done" })), { interval: 1 });
    await service.send(conversationId, "again", []);
    await vi.waitFor(() => expect(store.read(conversationId).filter(e => e.type === "turn.done")).toHaveLength(2));
  } finally { await service.quit(); rmSync(root, { recursive: true, force: true }); }
}, 15000);

// mcp-connectors C1/C2: a Codex app-server started a thread's MCP servers at thread/start; a turn waits until the
// profile's doan- servers settle, so their tools are there from the first turn. The fake records every line it reads and
// marks when it sent a status, so the order of a status and turn/start is read from one file.
function mcpCodex(plan: { readyMs?: number | null; elicit?: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "doan-mcp-codex-")), command = join(root, "codex"), seen = join(root, "seen");
  writeFileSync(join(root, "config.toml"), 'model = "gpt-6"\n[mcp_servers.doan-notion]\nurl = "https://mcp.notion.com/mcp"\n');
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const plan = ${JSON.stringify(plan)}; const seen = ${JSON.stringify(seen)};
const mark = text => fs.appendFileSync(seen, text + '\\n');
const line = value => JSON.stringify(value) + '\\n';
const status = (threadId, name, value) => line({ method: 'mcpServer/startupStatus/updated', params: { threadId, name, status: value, error: null, failureReason: null } });
let reloads = 0;
readline.createInterface({ input: process.stdin }).on('line', text => {
  mark(text); const r = JSON.parse(text);
  if (r.method === 'initialize') process.stdout.write(line({ id: r.id, result: {} }));
  if (r.method === 'thread/start' && r.params.ephemeral) process.stdout.write(line({ id: r.id, result: { thread: { id: 'probe' }, approvalPolicy: 'on-request', sandbox: { type: 'workspaceWrite' } } }) + status('probe', 'doan-notion', 'starting') + status('probe', 'doan-notion', 'ready'));
  else if (r.method === 'thread/start') {
    // The reply and the thread's first statuses in one chunk; another thread says ready at once.
    process.stdout.write(line({ id: r.id, result: { thread: { id: 'session' }, approvalPolicy: 'on-request', sandbox: { type: 'workspaceWrite' } } }) + status('session', 'doan-notion', 'starting') + status('other', 'doan-notion', 'ready'));
    if (plan.readyMs != null) setTimeout(() => { process.stdout.write(status('session', 'doan-notion', 'ready')); mark('ready-sent'); }, plan.readyMs);
  }
  if (r.method === 'config/read') process.stdout.write(line({ id: r.id, result: { config: {} } }));
  if (r.method === 'config/mcpServer/reload') {
    reloads += 1; const round = reloads;
    process.stdout.write(line({ id: r.id, result: {} }) + status('session', 'doan-notion', 'starting'));
    if (round === 1) setTimeout(() => { process.stdout.write(status('session', 'doan-notion', 'ready')); mark('notion-settled'); }, 150);
    else { process.stdout.write(status('session', 'doan-notion', 'ready')); setTimeout(() => { process.stdout.write(status('session', 'doan-figma', 'failed')); mark('figma-settled'); }, 150); }
  }
  if (r.method === 'turn/start') {
    process.stdout.write(line({ id: r.id, result: { turn: { id: 'native-turn' } } }));
    if (plan.elicit) process.stdout.write(line({ id: 7, method: 'mcpServer/elicitation/request', params: { threadId: 'session', turnId: 'native-turn', serverName: 'doan-example-com', mode: 'form', _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] }, message: 'Allow the doan-example-com MCP server to run tool "search"?', requestedSchema: { type: 'object', properties: {} } } }));
    else process.stdout.write(line({ method: 'turn/completed', params: { threadId: 'session', turn: { id: 'native-turn', status: 'completed' } } }));
  }
  if (r.id === 7 && !r.method) process.stdout.write(line({ method: 'turn/completed', params: { threadId: 'session', turn: { id: 'native-turn', status: 'completed' } } }));
});
`, { mode: 0o700 });
  const owner = { kind: "doan" as const, provider: "codex" as const, connectionId: "c1", accountId: "a1", workspaceId: null, profile: "codex" };
  const lines = () => existsSync(seen) ? readFileSync(seen, "utf8").split("\n").filter(Boolean) : [];
  const at = (match: (text: string) => boolean) => lines().findIndex(match);
  const method = (name: string) => (text: string) => text.startsWith("{") && (JSON.parse(text) as { method?: string }).method === name;
  return { root, command, owner, lines, at, method, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const MCP_RUN = { generation: () => 0, labels: () => ({ "doan-example-com": "example.com", "doan-notion": "Notion" }) };
it("waits for the profile's doan- servers before turn/start, counting only its own thread, and reloads on request", async () => {
  const h = mcpCodex({ readyMs: 300 }); const events: EventPayload[] = [];
  const runner = await openRunner({ command: h.command, runtime: "codex", cwd: h.root, configDir: h.root, env: process.env, owner: h.owner, mcp: MCP_RUN }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("first", "t1");
    expect(h.at(t => t === "ready-sent")).toBeGreaterThan(-1);
    expect(h.at(h.method("turn/start"))).toBeGreaterThan(h.at(t => t === "ready-sent"));
    await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    // Ready within a second: no activity line.
    expect(events.filter(e => e.type === "activity")).toEqual([]);
    // A reused thread keeps what it learned, so the next turn starts at once.
    const before = h.lines().length; await runner.send("second", "t2");
    expect(h.lines().slice(before).map(t => (JSON.parse(t) as { method?: string }).method)).toEqual(["turn/start"]);
    // After a reload the statuses are forgotten and the new ones waited for.
    await runner.send("third", "t3", undefined, { permissionMode: "default", reloadMcp: true });
    expect(h.at(h.method("config/mcpServer/reload"))).toBeGreaterThan(-1);
    expect(h.lines().findLastIndex(h.method("turn/start"))).toBeGreaterThan(h.at(t => t === "notion-settled"));
    expect(h.at(h.method("config/mcpServer/reload"))).toBeLessThan(h.at(t => t === "notion-settled"));
    // The servers to wait for are read from the profile again for every turn.
    writeFileSync(join(h.root, "config.toml"), '[mcp_servers.doan-notion]\nurl = "https://mcp.notion.com/mcp"\n[mcp_servers.doan-figma]\nurl = "https://mcp.figma.com/mcp"\n');
    await runner.send("fourth", "t4", undefined, { permissionMode: "default", reloadMcp: true });
    expect(h.lines().findLastIndex(h.method("turn/start"))).toBeGreaterThan(h.at(t => t === "figma-settled"));
    expect(h.lines().filter(h.method("config/mcpServer/reload"))).toHaveLength(2);
  } finally { await runner.close(); h.cleanup(); }
}, 15000);
it("does not wait for a run on an external profile, which Doan registered nothing in", async () => {
  const h = mcpCodex({ readyMs: null }); const events: EventPayload[] = [];
  const runner = await openRunner({ command: h.command, runtime: "codex", cwd: h.root, configDir: h.root, env: process.env }, e => events.push(e), () => {}, () => {});
  try { await runner.send("hello", "t1"); await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" })); expect(events.filter(e => e.type === "activity")).toEqual([]); }
  finally { await runner.close(); h.cleanup(); }
}, 15000);
it("a Stop while the turn waits for its servers ends it as interrupted without starting it or losing the server", async () => {
  const h = mcpCodex({ readyMs: null }); const events: EventPayload[] = []; const exited = vi.fn();
  const runner = await openRunner({ command: h.command, runtime: "codex", cwd: h.root, configDir: h.root, env: process.env, owner: h.owner, mcp: MCP_RUN }, e => events.push(e), exited, () => {});
  try {
    const sent = runner.send("hello", "t1");
    await new Promise(resolve => setTimeout(resolve, 200));
    await runner.stop(); await sent;
    expect(events).toEqual([{ type: "interrupted", reason: "user" }]);
    expect(h.at(h.method("turn/start"))).toBe(-1); expect(h.at(h.method("turn/interrupt"))).toBe(-1);
    expect(exited).not.toHaveBeenCalled();
  } finally { await runner.close(); h.cleanup(); }
}, 15000);
it("asks before a Doan connector's MCP tool with the connector's name and sends the chosen answer", async () => {
  const h = mcpCodex({ readyMs: 0, elicit: true }); const events: EventPayload[] = [];
  const runner = await openRunner({ command: h.command, runtime: "codex", cwd: h.root, configDir: h.root, env: process.env, owner: h.owner, mcp: MCP_RUN }, e => events.push(e), () => {}, () => {});
  try {
    await runner.send("hello", "t1");
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: "permission.request", requestId: "number:7", tool: "mcpToolCall", summary: "Run search on example.com" })));
    expect(runner.answer("number:7", "accept")).toBe(true);
    await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    expect(h.lines().filter(t => t.startsWith('{"id":7'))).toEqual([JSON.stringify({ id: 7, result: { action: "accept", content: {} } })]);
  } finally { await runner.close(); h.cleanup(); }
}, 15000);
