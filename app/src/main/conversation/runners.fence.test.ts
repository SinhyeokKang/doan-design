import { afterEach, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRunner } from "./runners";
import { openAcp } from "./acpRunner";
import { fencePolicy } from "../agentAuth/fence";
import type { Prepared } from "./service";
import type { EventPayload } from "./types";

// Runs get a stand-in for sandbox-exec that records its arguments and runs the command after them, so the tests see
// what a fenced spawn passes without depending on Seatbelt (which a sandboxed test runner could not apply anyway).
const roots: string[] = []; afterEach(() => { roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp(): string { const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-runner-fence-"))); roots.push(root); return root; }
function fakeExec(root: string, exit?: number): string {
  const exec = join(root, "sandbox-exec");
  writeFileSync(exec, `#!/bin/sh
printf '%s\\n' "$@" > ${JSON.stringify(join(root, "exec-args"))}
${exit === undefined ? "" : `echo "sandbox-exec: refused for the test" >&2; exit ${exit}`}
while [ "$1" = "-p" ] || [ "$1" = "-D" ]; do shift 2; done
exec "$@"
`, { mode: 0o700 });
  return exec;
}
const execArgs = (root: string) => existsSync(join(root, "exec-args")) ? readFileSync(join(root, "exec-args"), "utf8").split("\n").slice(0, -1) : null;
const paths = (provider: string) => ({ userData: "/u", profile: `/u/agent-auth/profiles/${provider}`, attachments: [] as string[] });

const SERVER = join(__dirname, "fixtures", "fake-acp-server.cjs");
function acpInput(root: string, over: Partial<Prepared> = {}): Prepared {
  return { runtime: "cursor", command: process.execPath, args: [SERVER, join(__dirname, "fixtures", "acp-cursor.json")], cwd: root, configDir: "/profile", env: { PATH: process.env.PATH ?? "" }, authenticate: "cursor_login", ...over };
}
it("starts a fenced ACP server under sandbox-exec with the policy, its parameters and the original command line", async () => {
  const root = temp(), exec = fakeExec(root);
  const events: EventPayload[] = []; const exited = vi.fn();
  let runner: Awaited<ReturnType<typeof openAcp>> | undefined;
  // The recorded Cursor turn asks to run a command; it is allowed, as a person would.
  runner = await openAcp(acpInput(root, { fence: { paths: paths("cursor"), exec } }), e => { events.push(e); if (e.type === "permission.request") setTimeout(() => runner?.answer(e.requestId, "allow"), 5); }, exited, () => {});
  await runner.send("hi", "turn-1");
  expect(events.at(-1)).toEqual({ type: "turn.done" });
  const args = execArgs(root)!;
  // The recorded policy spans lines; the parameters and the command follow it.
  expect(args.join("\n")).toContain(`-p\n${fencePolicy("cursor")}\n-D\nUSERDATA=/u\n`);
  expect(args.slice(-5)).toEqual(["-D", "ATTACHMENTS=/u/agent-auth/profiles/cursor", process.execPath, SERVER, join(__dirname, "fixtures", "acp-cursor.json")]);
  await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
});
it("starts an unfenced ACP server (a list read) as before", async () => {
  const root = temp(); fakeExec(root);
  const runner = await openAcp(acpInput(root), () => {}, () => {}, () => {});
  await runner.close();
  expect(execArgs(root)).toBeNull();
});
it("fails a fenced ACP start as process_exited, never cli_missing, when sandbox-exec is missing or ends at once", async () => {
  const root = temp();
  for (const exec of [join(root, "missing-sandbox-exec"), fakeExec(root, 65)]) {
    const exited = vi.fn();
    const error = await openAcp(acpInput(root, { fence: { paths: paths("cursor"), exec } }), () => {}, exited, () => {}).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("process_exited");
  }
});

// A Claude CLI stand-in that records its argv and answers initialize.
function fakeClaude(root: string): string {
  const command = join(root, "claude");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
fs.writeFileSync(${JSON.stringify(join(root, "claude-argv"))}, JSON.stringify(process.argv.slice(2)));
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const r = JSON.parse(line);
 if(r.type==='control_request') send({type:'control_response',response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}}});
});
`, { mode: 0o700 });
  return command;
}
const CLAUDE_OWNER = { kind: "doan" as const, provider: "claude" as const, connectionId: "c1", accountId: "a1", workspaceId: "org-1", profile: "claude" };
it("wraps a Claude turn with its sandbox off in sandbox-exec, and gives one with its sandbox on Doan's settings instead", async () => {
  const root = temp(), exec = fakeExec(root), command = fakeClaude(root);
  const base = { command, runtime: "claude" as const, owner: CLAUDE_OWNER, cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root } };
  const off = await openRunner({ ...base, fence: { paths: paths("claude"), exec } }, () => {}, () => {}, () => {});
  await off.close();
  expect(execArgs(root)?.slice(-1)[0]).toBe(JSON.parse(readFileSync(join(root, "claude-argv"), "utf8")).at(-1));
  expect(execArgs(root)).toContain(command);
  expect(JSON.parse(readFileSync(join(root, "claude-argv"), "utf8"))).not.toContain("--settings");

  rmSync(join(root, "exec-args"));
  const on = await openRunner({ ...base, fast: true, fence: { paths: paths("claude"), exec, claudeSandbox: true, denied: [{ path: "/u/conversations", directory: true }], socketDir: "/tmp/doan-sock" } }, () => {}, () => {}, () => {});
  await on.close();
  expect(execArgs(root)).toBeNull();
  const argv = JSON.parse(readFileSync(join(root, "claude-argv"), "utf8")) as string[];
  const settings = JSON.parse(argv[argv.indexOf("--settings") + 1]!) as Record<string, unknown>;
  expect(settings).toMatchObject({ fastMode: true, permissions: { deny: expect.arrayContaining(["Read(//u/conversations/**)", "Edit(//u/conversations/**)", "Edit(//u/agent-auth/profiles/claude/settings.json)"]) },
    sandbox: { enabled: true, allowUnsandboxedCommands: false, network: { allowUnixSockets: ["/tmp/doan-sock"] }, filesystem: { denyRead: ["/u"], denyWrite: expect.arrayContaining(["/u/conversations", "/u/runtime.json", "/u/agent-auth/profiles/claude/settings.json"]), allowWrite: ["/u/agent-auth/profiles/claude"] } } });
}, 20000);

const CODEX_OWNER = { kind: "doan" as const, provider: "codex" as const, connectionId: "c1", accountId: "a1", workspaceId: null, profile: "codex" };
// A Codex app-server stand-in that records its argv and every line.
function fakeCodex(root: string): string {
  const command = join(root, "codex");
  writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs'); const readline = require('node:readline');
fs.writeFileSync(${JSON.stringify(join(root, "codex-argv"))}, JSON.stringify(process.argv.slice(2)));
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
let turn = 0;
readline.createInterface({input:process.stdin}).on('line', line => {
 fs.appendFileSync(${JSON.stringify(join(root, "seen"))}, line + '\\n');
 const r = JSON.parse(line);
 if(r.method==='initialize') send({id:r.id,result:{userAgent:'fake'}});
 if(r.method==='thread/start' && !r.params.ephemeral) send({id:r.id,result:{thread:{id:'session'},approvalPolicy:'untrusted',sandbox:{type:'readOnly'}}});
 if(r.method==='thread/resume') send({id:r.id,result:{thread:{id:r.params.threadId},approvalPolicy:'untrusted',sandbox:{type:'readOnly'}}});
 if(r.method==='thread/start' && r.params.ephemeral) send({id:r.id,result:{thread:{id:'probe'},approvalPolicy:'untrusted',sandbox:{type:'readOnly'}}});
 if(r.method==='config/read') send({id:r.id,result:{config:{}}});
 if(r.method==='turn/start') { const id = 'native-' + (++turn); send({id:r.id,result:{turn:{id}}}); send({method:'turn/completed',params:{threadId:'session',turn:{id,status:'completed'}}}); }
});
`, { mode: 0o700 });
  return command;
}
const turnStarts = (root: string) => readFileSync(join(root, "seen"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> }).filter(r => r.method === "turn/start").map(r => r.params!);
it("runs a fenced Codex server outside Full access on Doan's permission profiles, selected per turn without a sandboxPolicy", async () => {
  const root = temp(), exec = fakeExec(root), command = fakeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, args: ["-c", "allow_login_shell=false"], fence: { paths: { ...paths("codex"), attachments: ["/u/attachments"] }, denied: [{ path: "/u/conversations", directory: true }], socketDir: "/tmp/doan-sock", exec } }, e => events.push(e), () => {}, () => {});
  try {
    expect(runner.mechanism).toBe("codex-profile");
    expect(execArgs(root)).toBeNull();
    const argv = JSON.parse(readFileSync(join(root, "codex-argv"), "utf8")) as string[];
    expect(argv.slice(0, 4)).toEqual(["-c", "allow_login_shell=false", "-c", 'default_permissions="doan"']);
    expect(argv[5]).toContain(`"/u/conversations"="deny"`); expect(argv[5]).not.toContain(`"/u"="deny"`);
    expect(argv[5]).toContain(`network={enabled=true,unix_sockets={"/tmp/doan-sock"="allow"}}`);
    expect(argv.at(-1)).toBe("app-server");
    for (const [i, permissionMode] of (["default", "acceptEdits", "plan"] as const).entries()) {
      await runner.send("x", `t${i}`, undefined, { permissionMode });
      await vi.waitFor(() => expect(events.filter(e => e.type === "turn.done")).toHaveLength(i + 1));
    }
    const turns = turnStarts(root);
    expect(turns.map(t => [t.approvalPolicy, t.permissions])).toEqual([["untrusted", "doan"], ["on-request", "doan-workspace"], ["never", "doan"]]);
    expect(turns.some(t => "sandboxPolicy" in t)).toBe(false);
    // Full access on this server would run unfenced: the turn is refused instead.
    await expect(runner.send("x", "t3", undefined, { permissionMode: "bypass" })).rejects.toThrow("session_unavailable");
    expect(turnStarts(root)).toHaveLength(3);
  } finally { await runner.close(); }
}, 20000);
it("runs a Full access Codex server inside sandbox-exec with dangerFullAccess turns", async () => {
  const root = temp(), exec = fakeExec(root), command = fakeCodex(root);
  const events: EventPayload[] = [];
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, permissionMode: "bypass", fence: { paths: { ...paths("codex"), attachments: ["/u/attachments"] }, exec } }, e => events.push(e), () => {}, () => {});
  try {
    expect(runner.mechanism).toBe("fence");
    const args = execArgs(root)!;
    expect(args).toContain("ATTACHMENTS=/u/attachments");
    expect(args.slice(-2)).toEqual([command, "app-server"]);
    expect(JSON.parse(readFileSync(join(root, "codex-argv"), "utf8"))).toEqual(["app-server"]);
    await runner.send("x", "t0", undefined, { permissionMode: "bypass" });
    await vi.waitFor(() => expect(events).toContainEqual({ type: "turn.done" }));
    expect(turnStarts(root)[0]).toMatchObject({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
    expect("permissions" in turnStarts(root)[0]!).toBe(false);
  } finally { await runner.close(); }
}, 20000);
it("starts an unfenced Codex server (a terminal session's) as before", async () => {
  const root = temp(), exec = fakeExec(root), command = fakeCodex(root);
  const runner = await openRunner({ command, runtime: "codex", cwd: root, configDir: root, env: process.env }, () => {}, () => {}, () => {});
  try { expect(runner.mechanism).toBeUndefined(); expect(execArgs(root)).toBeNull(); expect(JSON.parse(readFileSync(join(root, "codex-argv"), "utf8"))).toEqual(["app-server"]); void exec; }
  finally { await runner.close(); }
}, 20000);
it("fails a fenced Claude or Codex start as process_exited, never cli_missing, when sandbox-exec is missing or ends at once", async () => {
  const root = temp(), claude = fakeClaude(root), codex = fakeCodex(root);
  for (const exec of [join(root, "missing-sandbox-exec"), fakeExec(root, 65)]) {
    const fence = { paths: paths("x"), exec };
    const inputs: Prepared[] = [
      { command: claude, runtime: "claude", owner: CLAUDE_OWNER, cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, fence },
      { command: codex, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, permissionMode: "bypass", fence },
    ];
    for (const input of inputs) expect(await openRunner(input, () => {}, () => {}, () => {}).then(() => "started", (e: unknown) => (e as Error).message)).toBe("process_exited");
  }
}, 40000);
it("refuses a Claude turn with its sandbox on, or a Codex profile server, that has no listing to deny", async () => {
  const root = temp(), exec = fakeExec(root), claude = fakeClaude(root), codex = fakeCodex(root);
  await expect(openRunner({ command: claude, runtime: "claude", owner: CLAUDE_OWNER, cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, fence: { paths: paths("claude"), exec, claudeSandbox: true } }, () => {}, () => {}, () => {})).rejects.toThrow("unknown");
  await expect(openRunner({ command: codex, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, fence: { paths: paths("codex"), exec, socketDir: "/tmp/doan-sock" } }, () => {}, () => {}, () => {})).rejects.toThrow("unknown");
  // Without the app socket's directory the profile would leave `doan` unable to reach the app.
  await expect(openRunner({ command: codex, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, fence: { paths: paths("codex"), exec, denied: [] } }, () => {}, () => {}, () => {})).rejects.toThrow("unknown");
  expect(existsSync(join(root, "claude-argv")) || existsSync(join(root, "codex-argv"))).toBe(false);
});
// Only sandbox-exec's own failure is reclassified: a CLI that ends during its start keeps the SDK's error, so its
// sign-in or version guidance is not lost.
it("keeps a fenced Claude CLI's own early exit out of process_exited", async () => {
  const root = temp(), exec = fakeExec(root), command = join(root, "claude");
  writeFileSync(command, "#!/bin/sh\necho 'Invalid API key' >&2\nexit 1\n", { mode: 0o700 });
  const message = await openRunner({ command, runtime: "claude", owner: CLAUDE_OWNER, cwd: root, configDir: root, env: { PATH: process.env.PATH, HOME: root, CLAUDE_CONFIG_DIR: root }, fence: { paths: paths("claude"), exec } }, () => {}, () => {}, () => {}).then(() => "started", (e: unknown) => (e as Error).message);
  expect(message).not.toBe("process_exited");
  expect(message).not.toBe("started");
}, 20000);
// A Full access server runs inside the outer fence and never uses the app socket's directory.
it("starts a Full access Codex server without the app socket's directory", async () => {
  const root = temp(), exec = fakeExec(root), command = fakeCodex(root);
  const runner = await openRunner({ command, runtime: "codex", owner: CODEX_OWNER, cwd: root, configDir: root, env: process.env, permissionMode: "bypass", fence: { paths: { ...paths("codex"), attachments: ["/u/attachments"] }, exec } }, () => {}, () => {}, () => {});
  try { expect(runner.mechanism).toBe("fence"); } finally { await runner.close(); }
}, 20000);
