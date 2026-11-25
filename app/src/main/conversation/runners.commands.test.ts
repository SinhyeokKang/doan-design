import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSkills, openRunner } from "./runners";
import type { Prepared } from "./service";
import type { EventPayload } from "./types";

// A fake Claude Code answering each prompt by FAKE_CLAUDE. "clear": conversation_reset (its new_conversation_id is not the
// session id), then system/init and the result under the new id; "drift": another id, no reset; "compact": its boundary.
function fakeClaude(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_CLAUDE;
const commands = [{name:'deploy',description:'Ship to staging. (project)',argumentHint:''},{name:'compact',description:'Built-in command.',argumentHint:'',builtin:true},{name:'usage',description:'Show plan usage limits and more',argumentHint:'',builtin:true}];
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands,models:[],account:{}}}});
 if(r.type!=='user') return;
 const old = r.session_id, next = 'bda22031-0000-4000-8000-000000000002';
 const result = sid => send({type:'result',subtype:'success',is_error:false,result:'',user_message_uuids:[r.uuid],session_id:sid});
 send({type:'system',subtype:'init',session_id:old,user_message_uuids:[r.uuid]});
 if(mode==='clear') { send({type:'conversation_reset',trigger:'clear',new_conversation_id:'94d0fd20-0000-4000-8000-000000000003',uuid:'u1',session_id:old}); send({type:'system',subtype:'init',session_id:next}); result(next); }
 else if(mode==='drift') { send({type:'system',subtype:'init',session_id:next}); result(next); }
 else if(mode==='result-only') { send({type:'conversation_reset',trigger:'clear',new_conversation_id:'94d0fd20-0000-4000-8000-000000000003',uuid:'u1',session_id:old}); result(next); }
 else if(mode==='local-only') { send({type:'system',subtype:'local_command',content:'<command-name>/clear</command-name>',session_id:old}); send({type:'system',subtype:'init',session_id:next}); result(next); }
 else if(mode==='twice') { send({type:'conversation_reset',trigger:'clear',new_conversation_id:'94d0fd20-0000-4000-8000-000000000003',uuid:'u1',session_id:old}); send({type:'system',subtype:'init',session_id:next}); send({type:'system',subtype:'init',session_id:'cccccccc-0000-4000-8000-000000000004'}); result(next); }
 else if(mode==='plan-exit') { send({type:'conversation_reset',trigger:'plan_mode_exit',new_conversation_id:'94d0fd20-0000-4000-8000-000000000003',uuid:'u1',session_id:old}); send({type:'system',subtype:'init',session_id:next}); result(next); }
 else if(mode==='compact') { send({type:'system',subtype:'compact_boundary',compact_metadata:{trigger:'manual',pre_tokens:100,post_tokens:40},session_id:old}); result(old); }
 else result(old);
 process.stdin.pause(); setTimeout(()=>process.exit(0),20);
});
`, { mode: 0o700 });
  return command;
}
async function claudeRun(mode: string, prompt: string, sessionId: string | undefined, body: (h: { events: EventPayload[]; changed: string[]; boundaries: string[]; runner: Awaited<ReturnType<typeof openRunner>> }) => void) {
  const root = mkdtempSync(join(tmpdir(), "doan-claude-command-")), command = fakeClaude(root);
  const events: EventPayload[] = [], changed: string[] = [], boundaries: string[] = [];
  const input = { command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_CLAUDE: mode }, ...(sessionId ? { sessionId } : {}),
    sessionChanged: (id: string) => changed.push(id), boundary: (kind: string) => boundaries.push(kind) } as Prepared;
  const runner = await openRunner(input, e => events.push(e), () => {}, () => {});
  try { await runner.send(prompt, "turn-1"); body({ events, changed, boundaries, runner }); }
  finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
}
const RESUMED = "5625b508-0000-4000-8000-000000000001", NEXT = "bda22031-0000-4000-8000-000000000002";

// Only the person's /clear may move a conversation to another session (PRODUCT 'Resume and permissions'): the new id is
// read from system/init after conversation_reset, never from new_conversation_id.
describe("Claude /clear", () => {
  it.each([["a new session", undefined], ["a resumed session", RESUMED]])("follows the session id /clear moves to, in %s", async (_label, sessionId) => {
    await claudeRun("clear", "/clear", sessionId, ({ events, changed, boundaries, runner }) => {
      expect(changed).toEqual([NEXT]);
      expect(runner.sessionId).toBe(NEXT);
      expect(boundaries).toEqual(["cleared"]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }, 15000);
  it("reads /clear sent by its /reset alias text the same way", async () => {
    await claudeRun("clear", "/reset", RESUMED, ({ changed }) => expect(changed).toEqual([NEXT]));
  }, 15000);
  it("fails any other turn whose session id changes, and follows nothing", async () => {
    await claudeRun("drift", "The JSON below contains the user's message…", RESUMED, ({ events, changed, runner }) => {
      expect(changed).toEqual([]);
      expect(runner.sessionId).toBe(RESUMED);
      expect(events.filter(e => e.type === "turn.failed" || e.type === "turn.done")).toEqual([{ type: "turn.failed", code: "session_unavailable" }]);
    });
  }, 15000);
  it("fails a /clear whose session id changes without the clear's reset", async () => {
    await claudeRun("drift", "/clear", RESUMED, ({ events, changed }) => {
      expect(changed).toEqual([]);
      expect(events.filter(e => e.type === "turn.failed" || e.type === "turn.done")).toEqual([{ type: "turn.failed", code: "session_unavailable" }]);
    });
  }, 15000);
  // The new id is read only from system/init after the clear's own reset: a result alone, the file's /clear line, a
  // second change and another kind of reset (a plan's clear-context exit) are not the person's /clear.
  it.each(["result-only", "local-only", "plan-exit"])("fails a /clear whose session moves without its reset and a new system/init (%s)", async mode => {
    await claudeRun(mode, "/clear", RESUMED, ({ events, changed }) => {
      expect(changed).toEqual([]);
      expect(events.filter(e => e.type === "turn.failed" || e.type === "turn.done")).toEqual([{ type: "turn.failed", code: "session_unavailable" }]);
    });
  }, 15000);
  it("fails a /clear whose session moves a second time", async () => {
    await claudeRun("twice", "/clear", RESUMED, ({ events, changed }) => {
      expect(changed).toEqual([NEXT]);
      expect(events.filter(e => e.type === "turn.failed" || e.type === "turn.done")).toEqual([{ type: "turn.failed", code: "session_unavailable" }]);
    });
  }, 15000);
  it("keeps a session whose id stays the same", async () => {
    await claudeRun("", "/clear", RESUMED, ({ events, changed }) => {
      expect(changed).toEqual([]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }, 15000);
  it("sends the command text itself as the prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "doan-claude-command-")), command = fakeClaude(root);
    const runner = await openRunner({ command, runtime: "claude", cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root, FAKE_CLAUDE: "" } }, () => {}, () => {}, () => {});
    try {
      await runner.send("/compact keep notes", "turn-1");
      const user = readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { type?: string; message?: unknown }).find(r => r.type === "user");
      expect(user?.message).toEqual({ role: "user", content: "/compact keep notes" });
    } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
  }, 15000);
});

describe("Claude /compact", () => {
  it("reports the compaction boundary and the context it left", async () => {
    await claudeRun("compact", "/compact", RESUMED, ({ events, boundaries }) => {
      expect(boundaries).toEqual(["compacted"]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }, 15000);
});

// The SkillCatalog read gives the commands beside the skills: Claude's and Codex's fixed tables at the confirmed version
// or later, none when the version is older or unknown.
describe("listSkills with commands", () => {
  it("lists Claude's commands after its project skills on a confirmed CLI, with the SDK's own descriptions", async () => {
    const root = mkdtempSync(join(tmpdir(), "doan-claude-commands-")), command = fakeClaude(root);
    const input = (installed?: string) => ({ command, runtime: "claude" as const, cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, ...(installed ? { installed } : {}) });
    try {
      const rows = await listSkills(input("2.1.326"), () => {}, () => {});
      expect(rows[0]).toEqual({ kind: "skill", name: "deploy", description: "Ship to staging." });
      expect(rows.slice(1).map(r => [r.kind, r.name])).toEqual(["clear", "compact", "context", "init", "review", "usage"].map(name => ["command", name]));
      expect(rows.find(r => r.name === "usage")?.description).toBe("Show plan usage limits and more");
      expect(await listSkills(input("2.1.325"), () => {}, () => {})).toEqual([{ kind: "skill", name: "deploy", description: "Ship to staging." }]);
      expect(await listSkills(input(), () => {}, () => {})).toEqual([{ kind: "skill", name: "deploy", description: "Ship to staging." }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 20000);
  it("lists Codex's two commands after its project skills on a confirmed CLI only", async () => {
    const root = mkdtempSync(join(tmpdir(), "doan-codex-commands-")), command = fakeCodex(root);
    const input = (installed?: string) => ({ command, runtime: "codex" as const, cwd: root, configDir: root, env: process.env, ...(installed ? { installed } : {}) });
    try {
      expect(await listSkills(input("0.167.1"), () => {}, () => {})).toEqual([
        { kind: "skill", name: "migrate", description: "Run migrations." },
        { kind: "command", name: "compact", description: "Summarize the conversation to free up context." },
        { kind: "command", name: "review", description: "Review the current changes." }]);
      expect(await listSkills(input("0.166.0"), () => {}, () => {})).toEqual([{ kind: "skill", name: "migrate", description: "Run migrations." }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// A fake Codex app-server. thread/compact/start answers {} at once and opens a turn of its own (FAKE_CODEX "early":
// the turn starts before the reply; "late": 300 ms after it); review/start answers with its turn like turn/start.
function fakeCodex(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const mode = process.env.FAKE_CODEX ?? '';
const note = (turnId, method, params) => send({method,params:{threadId:'session',turnId,...params}});
const compaction = turnId => {
 send({method:'turn/started',params:{threadId:'session',turn:{id:turnId,status:'inProgress'}}});
 if(mode==='hang') return;
 note(turnId,'item/started',{item:{type:'contextCompaction',id:'c1'}});
 note(turnId,'thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:900},modelContextWindow:200000}});
 note(turnId,'item/completed',{item:{type:'contextCompaction',id:'c1'}});
 send({method:'turn/completed',params:{threadId:'session',turn:{id:turnId,status:'completed'}}});
};
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{userAgent:'fake'}});
 if(r.method==='skills/list') send({id:r.id,result:{data:[{cwd:r.params.cwds[0],skills:[{name:'migrate',description:'Run migrations.',path:'/r/.agents/skills/migrate/SKILL.md',scope:'repo',enabled:true,pluginId:null}],errors:[]}]}});
 if(r.method==='thread/start') send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'on-request',sandbox:{type:'readOnly'}}});
 if(r.method==='thread/resume') send({id:r.id,result:{thread:{id:r.params.threadId}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') { send({id:r.id,result:{turn:{id:'text-turn'}}}); send({method:'turn/completed',params:{threadId:'session',turn:{id:'text-turn',status:'completed'}}}); }
 if(r.method==='turn/interrupt') { send({id:r.id,result:{}}); send({method:'turn/completed',params:{threadId:'session',turn:{id:r.params.turnId,status:'interrupted'}}}); }
 if(r.method==='thread/compact/start') {
  if(mode==='early') { compaction('compact-turn'); send({id:r.id,result:{}}); }
  else if(mode==='late'||mode==='hang') { send({id:r.id,result:{}}); setTimeout(() => compaction('compact-turn'), 300); }
  else { send({id:r.id,result:{}}); compaction('compact-turn'); }
 }
 if(r.method==='review/start') {
  send({id:r.id,result:{turn:{id:'review-turn',status:'inProgress',items:[]},reviewThreadId:'session'}});
  // The review's own child turn, which thread/read later shows as interrupted (PoC, 0.167.1).
  send({method:'turn/started',params:{threadId:'session',turn:{id:'review-child',status:'inProgress'}}});
  note('review-child','item/completed',{item:{type:'agentMessage',id:'child-a',text:'child text'}});
  send({method:'turn/completed',params:{threadId:'session',turn:{id:'review-child',status:'interrupted',rootTurnId:'review-turn'}}});
  note('review-turn','item/completed',{item:{type:'agentMessage',id:'a1',text:'No issues found.'}});
  send({method:'turn/completed',params:{threadId:'session',turn:{id:'review-turn',status:'completed'}}});
 }
});
`, { mode: 0o700 });
  return command;
}
async function codexRun(mode: string, body: (h: { runner: Awaited<ReturnType<typeof openRunner>>; events: EventPayload[]; boundaries: string[]; requests: () => { method?: string; params?: Record<string, unknown> }[] }) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "doan-codex-command-")), command = fakeCodex(root), events: EventPayload[] = [], boundaries: string[] = [];
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: { ...process.env, FAKE_CODEX: mode }, sessionId: "session", boundary: (kind: string) => boundaries.push(kind) } as Prepared, e => events.push(e), () => {}, () => {});
  const requests = () => readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { method?: string; params?: Record<string, unknown> });
  try { await body({ runner, events, boundaries, requests }); } finally { await runner.close(); rmSync(root, { recursive: true, force: true }); }
}

// Codex runs its commands only as app-server requests (text "/compact" reaches the model, which claims it compacted).
describe("Codex commands", () => {
  it.each(["", "early", "late"])("runs /compact as thread/compact/start and follows the turn it opens (%s)", async mode => {
    await codexRun(mode, async ({ runner, events, boundaries, requests }) => {
      await runner.send("/compact", "local-turn");
      await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "turn.done" }));
      expect(requests().filter(r => r.method === "thread/compact/start")).toEqual([expect.objectContaining({ params: { threadId: "session" } })]);
      expect(requests().some(r => r.method === "turn/start")).toBe(false);
      expect(events).toEqual([{ type: "context.usage", used: 900, size: 200000 }, { type: "turn.done" }]);
      expect(boundaries).toEqual(["compacted"]);
    });
  }, 15000);
  it.each([["/review", { type: "uncommittedChanges" }], ["/review the parser only", { type: "custom", instructions: "the parser only" }]])("runs %s as review/start with its target", async (text, target) => {
    await codexRun("", async ({ runner, events, requests }) => {
      await runner.send(text, "local-turn");
      await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "turn.done" }));
      expect(requests().filter(r => r.method === "review/start").map(r => r.params)).toEqual([{ threadId: "session", target }]);
      expect(events).toContainEqual({ type: "message.done", messageId: "a1", text: "No issues found." });
      // The review's interrupted child turn is not this turn's: neither its text nor its end reach the thread.
      expect(events.some(e => e.type === "interrupted" || (e.type === "message.done" && e.messageId === "child-a"))).toBe(false);
    });
  }, 15000);
  it("a Stop while /compact waits for its turn interrupts that turn once it starts", async () => {
    await codexRun("hang", async ({ runner, events, requests }) => {
      const sending = runner.send("/compact", "local-turn");
      await vi.waitFor(() => expect(requests().some(r => r.method === "thread/compact/start")).toBe(true));
      await runner.stop(); await sending;
      await vi.waitFor(() => expect(requests().filter(r => r.method === "turn/interrupt").map(r => r.params)).toEqual([{ threadId: "session", turnId: "compact-turn" }]));
      await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "interrupted", reason: "user" }));
    });
  }, 15000);
  it("sends any other text as turn/start", async () => {
    await codexRun("", async ({ runner, requests }) => {
      await runner.send("The JSON below…\n/compact", "local-turn");
      expect(requests().some(r => r.method === "thread/compact/start")).toBe(false);
      expect(requests().some(r => r.method === "turn/start")).toBe(true);
    });
  }, 15000);
});
