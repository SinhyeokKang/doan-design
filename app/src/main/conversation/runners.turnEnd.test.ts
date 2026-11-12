import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
import type { EventPayload } from "./types";

// A fake Claude CLI for the turn-end rules (PoC, Claude Code 2.1.322 and 2.1.284):
//  meta     a turn the CLI opened itself (a background task's notice) closes with a success result before the prompt is
//           read; the prompt's own turn follows and echoes its uuid.
//  unread   only the meta result; the prompt is never read and the input's end is ignored.
//  failed   a failed result before the prompt was read; the input's end is ignored.
//  bg       the done turn leaves a background task: the set is announced, and once the task ends (FAKE_TASK_MS) the set
//           empties and the CLI calls the model on its own 100 ms later unless it was killed.
//  done     a plain done turn; the CLI ends a while after its input closes (FAKE_EXIT_MS), or at once on SIGTERM.
// SIGTERM is logged and ends the task with the CLI, as the real CLI's own handling does.
function fakeClaude(root: string): string {
  const command = join(root, "claude"), log = join(root, "seen");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const log = ${JSON.stringify(log)};
const note = value => fs.appendFileSync(log, JSON.stringify(value) + '\\n');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_MODE; let task = false;
process.on('SIGTERM', () => { note({ signal: 'SIGTERM', task }); process.exit(143); });
const say = (id, text) => send({type:'assistant',parent_tool_use_id:null,message:{id,role:'assistant',content:[{type:'text',text}]}});
const meta = () => { say('meta-m', 'The task finished.'); send({type:'result',subtype:'success',is_error:false,num_turns:0,result:'',session_id:'s'}); };
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line); note(r);
 if(r.type==='control_request') { send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:r.request.subtype==='get_usage'?{rate_limits_available:true,rate_limits:{}}:{commands:[],models:[],account:{}}}}); return; }
 if(r.type!=='user') return;
 if(mode==='meta') { meta(); setTimeout(() => { send({type:'system',subtype:'init',user_message_uuids:[r.uuid],session_id:'s'}); say('own', '4'); send({type:'result',subtype:'success',is_error:false,num_turns:1,result:'4',user_message_uuids:[r.uuid],session_id:'s'}); }, 50); }
 if(mode==='unread') meta();
 if(mode==='failed') send({type:'result',subtype:'error_during_execution',is_error:true,errors:['boom'],session_id:'s'});
 if(mode==='bg') {
  task = true;
  send({type:'system',subtype:'background_tasks_changed',tasks:[{task_id:'b1',task_type:'local_bash',description:'Sleep'}],session_id:'s'});
  say('own', 'started'); send({type:'result',subtype:'success',is_error:false,result:'started',user_message_uuids:[r.uuid],session_id:'s'});
  setTimeout(() => {
   task = false; note({ taskEnded: true });
   send({type:'system',subtype:'background_tasks_changed',tasks:[],session_id:'s'});
   setTimeout(() => { note({ model: true }); send({type:'system',subtype:'status',status:'requesting',session_id:'s'}); meta(); setTimeout(() => process.exit(0), 20); }, 100);
  }, Number(process.env.FAKE_TASK_MS || 300));
 }
 if(mode==='done') { say('own', 'hello'); send({type:'result',subtype:'success',is_error:false,result:'hello',user_message_uuids:[r.uuid],session_id:'s'}); }
}).on('close', () => {
 note({ closed: true });
 if(mode==='done') setTimeout(() => process.exit(0), Number(process.env.FAKE_EXIT_MS || 20));
});
`, { mode: 0o700 });
  return command;
}
const seen = (root: string) => existsSync(join(root, "seen")) ? readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>) : [];
type Run = { runner: Awaited<ReturnType<typeof openRunner>>; events: EventPayload[]; exited: ReturnType<typeof vi.fn>; background: ReturnType<typeof vi.fn>; root: string };
async function run(env: Record<string, string>, body: (h: Run) => Promise<void>, extra: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "doan-turn-end-claude-")), command = fakeClaude(root);
  const events: EventPayload[] = [], exited = vi.fn(), background = vi.fn();
  const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, ...env }, backgroundChanged: background, ...extra } as Parameters<typeof openRunner>[0], e => events.push(e), exited, () => {});
  try { await body({ runner, events, exited, background, root }); }
  finally { await runner.close(); await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 5000 }); rmSync(root, { recursive: true, force: true }); }
}
const terminals = (events: EventPayload[]) => events.filter(e => e.type === "turn.done" || e.type === "turn.failed" || e.type === "interrupted");

describe("a Claude turn's prompt read", () => {
  it("sends the prompt with a uuid, and ends at the prompt's own result after a meta turn's result, showing the meta turn's reply", async () => {
    await run({ FAKE_MODE: "meta" }, async ({ runner, events, root }) => {
      await runner.send("What is 2 + 2?", "turn-1");
      const prompt = seen(root).find(line => line.type === "user")!;
      expect(typeof prompt.uuid).toBe("string");
      expect(terminals(events)).toEqual([{ type: "turn.done" }]);
      expect(events.filter(e => e.type === "message.done").map(e => e.type === "message.done" && e.text)).toEqual(["The task finished.", "4"]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }, 15000);
  // The bound is STEER_READ_WAIT_MS (30 s); only setTimeout is faked, from just after the send.
  it("fails the turn with prompt_unread when the prompt is never read, and stops the group", async () => {
    await run({ FAKE_MODE: "unread" }, async ({ runner, events, exited }) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const sending = runner.send("hello", "turn-1").then(() => "resolved", (e: unknown) => e);
        await vi.waitFor(() => expect(events).toContainEqual({ type: "message.done", messageId: "meta-m", text: "The task finished." }));
        await new Promise<void>(resolve => { const t = setInterval(() => { clearInterval(t); resolve(); }, 100); });
        await vi.advanceTimersByTimeAsync(29_000);
        expect(terminals(events)).toEqual([]);
        await vi.advanceTimersByTimeAsync(1_500);
        await vi.waitFor(() => expect(terminals(events)).toEqual([{ type: "turn.failed", code: "prompt_unread" }]));
        expect(await sending).toBe("resolved");
        // The fake ignores its input's end, so only the group's stop ends it.
        await vi.advanceTimersByTimeAsync(1_000);
        await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      } finally { vi.useRealTimers(); }
    });
  }, 15000);
  it("ends at once on a failed result before the prompt was read and stops the group so the CLI cannot run it unseen", async () => {
    await run({ FAKE_MODE: "failed" }, async ({ runner, events, exited }) => {
      const began = Date.now();
      await runner.send("hello", "turn-1");
      expect(terminals(events)).toEqual([{ type: "turn.failed", code: "unknown", detail: "boom" }]);
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(Date.now() - began).toBeLessThan(3000);
    });
  }, 15000);
});

describe("background work after a done turn", () => {
  it("reports the background set at the done turn and kills the group where it empties, before the CLI calls the model", async () => {
    await run({ FAKE_MODE: "bg", FAKE_TASK_MS: "400" }, async ({ runner, events, exited, background, root }) => {
      await runner.send("start a build", "turn-1");
      expect(terminals(events)).toEqual([{ type: "turn.done" }]);
      expect(background.mock.calls).toEqual([[true]]);
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(background.mock.calls).toEqual([[true], [false]]);
      const log = seen(root);
      expect(log).toContainEqual({ taskEnded: true });
      // Killed, not terminated: no SIGTERM handling, and the model call never happened.
      expect(log.some(line => line.signal)).toBe(false);
      expect(log.some(line => line.model)).toBe(false);
      expect(terminals(events)).toEqual([{ type: "turn.done" }]);
    });
  }, 15000);
  it("ends a group with live background work through SIGTERM, never an immediate kill", async () => {
    await run({ FAKE_MODE: "bg", FAKE_TASK_MS: "10000" }, async ({ runner, exited, root }) => {
      await runner.send("start a dev server", "turn-1");
      await vi.waitFor(() => expect(seen(root)).toContainEqual({ closed: true }));
      expect(runner.endAfterTurn!()).toBe("term");
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(seen(root)).toContainEqual({ signal: "SIGTERM", task: true });
    });
  }, 15000);
  it("a stop of the run while background work runs takes the SIGTERM path", async () => {
    await run({ FAKE_MODE: "bg", FAKE_TASK_MS: "10000" }, async ({ runner, exited, root }) => {
      await runner.send("start a dev server", "turn-1");
      await vi.waitFor(() => expect(seen(root)).toContainEqual({ closed: true }));
      await runner.stop();
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(seen(root)).toContainEqual({ signal: "SIGTERM", task: true });
    });
  }, 15000);
});

describe("ending a finished turn's process for the next send", () => {
  it("kills at once a done turn's process that has only its suggestion left", async () => {
    await run({ FAKE_MODE: "done", FAKE_EXIT_MS: "4000" }, async ({ runner, exited, root }) => {
      await runner.send("hello", "turn-1");
      await vi.waitFor(() => expect(seen(root)).toContainEqual({ closed: true }));
      const began = Date.now();
      expect(runner.endAfterTurn!()).toBe("kill");
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(Date.now() - began).toBeLessThan(400);
      expect(seen(root).some(line => line.signal)).toBe(false);
    });
  }, 15000);
  it("asked during the usage read, decides once the read ends and the input closes", async () => {
    let finish = () => {};
    const usageAtTurnEnd = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
    await run({ FAKE_MODE: "done", FAKE_EXIT_MS: "4000" }, async ({ runner, exited, root }) => {
      const sending = runner.send("hello", "turn-1");
      await vi.waitFor(() => expect(usageAtTurnEnd).toHaveBeenCalledOnce());
      expect(runner.endAfterTurn!()).toBe("later");
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(seen(root)).not.toContainEqual({ closed: true });
      expect(exited).not.toHaveBeenCalled();
      const began = Date.now(); finish();
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(Date.now() - began).toBeLessThan(1000);
      expect(seen(root).some(line => line.signal)).toBe(false);
      await sending;
    }, { usageAtTurnEnd });
  }, 15000);
  it("takes the SIGTERM path for a failed turn's process", async () => {
    await run({ FAKE_MODE: "failed" }, async ({ runner }) => {
      await runner.send("hello", "turn-1");
      expect(["term", "none"]).toContain(runner.endAfterTurn!());
    });
  }, 15000);
  it("does nothing for a process that already ended", async () => {
    await run({ FAKE_MODE: "done" }, async ({ runner, exited }) => {
      await runner.send("hello", "turn-1");
      await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(runner.endAfterTurn!()).toBe("none");
    });
  }, 15000);
});
