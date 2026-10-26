import { expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
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
