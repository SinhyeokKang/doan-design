import { expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
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
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'}}});
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
 if(r.method==='thread/start')send({id:r.id,result:{thread:{id:'s'}}});
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
  if(r.method==='thread/start' || r.method==='thread/resume') send({id:r.id,result:{thread:{id:'s'}}});
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
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'}}});
});
`, { mode: 0o700 });
  const exited = vi.fn();
  const runner = await openRunner({ command, args: ["-c", 'cli_auth_credentials_store="keyring"'], runtime: "codex", cwd: root, configDir: root, env: process.env }, () => {}, exited, () => {});
  try { expect(JSON.parse(readFileSync(join(root, "argv.json"), "utf8"))).toEqual(["-c", 'cli_auth_credentials_store="keyring"', "app-server"]); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce()); rmSync(root, { recursive: true, force: true }); }
});
