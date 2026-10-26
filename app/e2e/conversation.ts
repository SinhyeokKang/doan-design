// Real main/preload contracts with synthetic SDK and JSONL peers; no product UI hooks.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, stat, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
import type { ConversationEvent, Runtime } from "../src/main/conversation/types";
const { rememberApp, closeApp, suiteGuard, waitFor }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { enterProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const before = await realState();
const failures: string[] = [];
const work = await realpath(await mkdtemp("/tmp/doan-conversation-"));
const home = join(work, "home"), data = join(work, "data"), repo = join(work, "repo"), bin = join(work, "bin"), cli = join(work, "doan"), shell = join(work, "shell");
const shots = join(root, ".scratch/runtime-test", `conversation-${Date.now()}`);
const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(data, "runtime.json"), DOAN_FAKE_ROOT: work };
let app: ElectronApplication | undefined;
let page!: Page;
const canvas = { path: "design/a.html", id: "a" }, other = { path: "design/b.html", id: "b" };
const html = (id: string, text: string) => `<!doctype html><html><head><title>${id}</title><meta name="doan:canvas" content="${id}"><meta name="doan:width" content="800"></head><body><section data-doan-frame="main"><button data-doan-id="button">${text}</button></section></body></html>`;
// A running peer must never observe a truncated control document.
async function config(runtime: Runtime, value: Record<string, unknown>) {
  const temporary = join(work, `${runtime}.tmp`);
  await writeFile(temporary, JSON.stringify(value)); await rename(temporary, join(work, `${runtime}.json`));
}
const wire = async (): Promise<{ runtime: Runtime; pid: number; child?: number; kind: string; value?: Record<string, unknown> }[]> => (await readFile(join(work, "wire.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") return false; throw e; } };
async function noPeers() {
  await waitFor(async () => (await wire()).filter(r => r.kind === "spawn" || r.kind === "descendant").every(r => !alive(r.child ?? r.pid)), "owned peers and descendants absent", 10_000);
  // Main observes group exit on a 100 ms poll after the child exit callback.
  await new Promise(resolve => setTimeout(resolve, 150));
}
const guard = suiteGuard({ name: "conversation", app: () => app, timeoutMs: 480_000,
  verify: async () => { await copyFile(join(work, "wire.jsonl"), join(shots, "wire.jsonl")); await assertRealState(before); await noPeers(); },
  cleanup: async () => { await noPeers(); await rm(work, { recursive: true, force: true }); },
});
async function launch() {
  app = rememberApp(await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${data}`], env }));
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.doan);
  await enterProject(page, repo);
  await canvasRow(page, canvas.path).click();
}
async function read(id: string) {
  const value = await page.evaluate(id => window.doan.readConversation({ conversationId: id }), id);
  assert.ok(!("error" in value), JSON.stringify(value)); return value;
}
async function event(id: string, type: ConversationEvent["type"]) {
  await waitFor(async () => (await read(id)).events.some(e => e.type === type), `${id} ${type}`);
  return (await read(id)).events.find(e => e.type === type)!;
}
async function terminal(id: string) {
  await event(id, "turn.done"); const result = await read(id);
  assert.equal(result.events.filter(e => ["turn.done", "turn.failed", "interrupted"].includes(e.type)).length, result.events.filter(e => e.type === "user.message").length);
  assert.deepEqual(result.events.map(e => e.seq), result.events.map((_, i) => i + 1));
}
async function start(runtime: Runtime, target = canvas, mode: "resume" | "new" = "resume", text = "Fixture message") {
  return page.evaluate(input => window.doan.startConversation(input), { root: repo, canvas: target, mode, runtime, text });
}
async function accepted(runtime: Runtime, target = canvas, mode: "resume" | "new" = "resume") {
  const result = await start(runtime, target, mode); assert.ok("conversationId" in result, JSON.stringify(result)); return result.conversationId;
}
async function seed(runtime: Runtime, id: string) {
  if (runtime === "claude") {
    await mkdir(join(env.CLAUDE_CONFIG_DIR, "projects/fixture"), { recursive: true });
    await writeFile(join(env.CLAUDE_CONFIG_DIR, `projects/fixture/${id}.jsonl`), "{}\n");
  } else {
    const dir = join(env.CODEX_HOME, "sessions/2026/10/27"); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `rollout-2026-10-27T00-00-00-${id}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id, cwd: repo, cli_version: "0.163.0" } }) + "\n");
  }
  // The real CLI associates only changed canvases, so each seed changes both.
  for (const target of [canvas, other]) await writeFile(join(repo, target.path), html(target.id, id));
  const cliEnv = { ...env, CLAUDE_CODE_SESSION_ID: runtime === "claude" ? id : "", CODEX_THREAD_ID: runtime === "codex" ? id : "", CODEX_SESSION_ID: "" };
  await exec(cli, ["check", "--repo", repo, "--json"], { env: cliEnv, cwd: repo });
  const records = (await readFile(join(data, "sessions.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(records.at(-1).sessionId, id); assert.equal(records.at(-1).configDir, runtime === "claude" ? env.CLAUDE_CONFIG_DIR : env.CODEX_HOME);
}
async function histories() {
  const directory = join(data, "conversations");
  return Promise.all((await readdir(directory)).sort().map(async name => [name, await readFile(join(directory, name), "utf8")]));
}
async function quit() { assert.ok(app); await closeApp(app); app = undefined; await noPeers(); }
try {
  for (const dir of [home, data, bin, shots, join(repo, ".doan"), join(repo, "design"), join(env.CLAUDE_CONFIG_DIR, "sessions"), env.CODEX_HOME]) await mkdir(dir, { recursive: true });
  await writeFile(join(work, "wire.jsonl"), "");
  await writeFile(join(data, "onboarding.json"), "{}"); await writeFile(join(data, "folders.json"), JSON.stringify([repo]));
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');
  await writeFile(shell, `#!/bin/sh\nPATH='${bin}:/usr/bin:/bin'; export PATH\neval "$2"\n`, { mode: 0o755 });
  for (const runtime of ["claude", "codex"] as const) {
    await config(runtime, {});
    await writeFile(join(bin, runtime), `#!/bin/sh\nexec '${process.execPath}' '${join(root, "app/e2e/conversation-agent.cjs")}' '${runtime}' "$@"\n`, { mode: 0o755 });
  }
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  for (const runtime of ["claude", "codex"] as const) {
    console.log(`conversation: ${runtime} E1.1–4 association/resume/permissions/render`);
    await seed(runtime, randomUUID());
    await launch();
    const preview = await page.evaluate(input => window.doan.conversationResumeTarget(input), { root: repo, canvas });
    assert.ok("available" in preview && preview.available, JSON.stringify(preview));
    await config(runtime, { mode: "permission", write: { path: canvas.path, html: html("a", `${runtime} edited`) } });
    const id = await accepted(runtime);
    const permission = await event(id, "permission.request"); assert.equal(permission.type, "permission.request");
    if (permission.type !== "permission.request") throw new Error("Missing permission");
    assert.equal(await page.evaluate(input => window.doan.sendConversation(input), { conversationId: id, text: "must not queue" }).then(r => r?.error), "busy");
    const prior = await readFile(join(data, `conversations/${id}.jsonl`), "utf8");
    assert.deepEqual(await start(runtime, other), { error: "session_in_use" });
    assert.equal(await readFile(join(data, `conversations/${id}.jsonl`), "utf8"), prior);
    const allow = permission.options.find(o => o.kind === "allow"); assert.ok(allow);
    assert.equal(await page.evaluate(input => window.doan.answerConversationPermission(input), { conversationId: id, requestId: permission.requestId, optionId: allow.id }), undefined);
    await terminal(id);
    const firstTurn = (await read(id)).events;
    assert.deepEqual(firstTurn.slice(0, 2).map(e => e.type), ["user.message", "turn.started"]);
    assert.ok(firstTurn.some(e => e.type === "message.delta"));
    assert.ok(firstTurn.some(e => e.type === "activity" && e.insideDesign));
    await waitFor(async () => (await page.locator("iframe").first().contentFrame().locator("button").textContent()) === `${runtime} edited`, "canvas rerender");
    await page.screenshot({ path: join(shots, `${runtime}-edited.png`) });
    if (runtime === "codex") assert.deepEqual(await start(runtime, other), { error: "session_in_use" });
    else await noPeers();
    await config(runtime, { mode: "permission" });
    assert.equal(await page.evaluate(id => window.doan.sendConversation({ conversationId: id, text: "deny" }), id), undefined);
    await waitFor(async () => !!(await read(id)).pendingPermission, "second permission");
    const denyRequest = (await read(id)).pendingPermission!;
    const deny = denyRequest.type === "permission.request" && denyRequest.options.find(o => o.kind === "deny"); assert.ok(deny);
    assert.equal(await page.evaluate(input => window.doan.answerConversationPermission(input), { conversationId: id, requestId: denyRequest.requestId, optionId: deny.id }), undefined);
    await waitFor(async () => (await read(id)).events.filter(e => e.type === "turn.done").length === 2, "denial continues to completion");
    if (runtime === "codex") assert.equal((await wire()).filter(r => r.runtime === "codex" && r.kind === "spawn").length, 1, "own sends reuse the same server");
    const replies = (await wire()).filter(r => r.runtime === runtime && r.kind === "in").map(r => JSON.stringify(r.value));
    assert.ok(replies.some(r => r.includes(runtime === "claude" ? '"behavior":"deny"' : '"decision":"decline"')));
    assert.ok(!replies.some(r => r.includes('"decision":"cancel"')));
    if (runtime === "claude") { await noPeers(); await new Promise(resolve => setTimeout(resolve, 150)); }
    console.log(`conversation: ${runtime} E1.5 listener-first final-only merge`);
    await config(runtime, { doneGate: `${runtime}-done`, finalOnly: true });
    await page.reload(); await page.waitForFunction(() => !!window.doan);
    await page.evaluate(async id => {
      const buffer: ConversationEvent[] = []; const delivered: ConversationEvent[] = [];
      let buffering = true;
      window.doan.onConversationEvent(e => { if (e.conversationId === id) { if (buffering) buffer.push(e); else if (!delivered.some(old => old.seq === e.seq)) delivered.push(e); } });
      const sent = await window.doan.sendConversation({ conversationId: id, text: "reload" });
      if (sent) throw new Error(sent.error);
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 10_000;
        const timer = setInterval(() => { if (buffer.some(e => e.type === "message.done")) { clearInterval(timer); resolve(); } else if (Date.now() > deadline) { clearInterval(timer); reject(new Error("No pre-snapshot message")); } }, 10);
      });
      const snapshot = await window.doan.readConversation({ conversationId: id });
      if ("error" in snapshot) throw new Error(snapshot.error);
      Reflect.set(window, "conversationConsumer", { buffer, snapshot, delivered, merge: () => {
        const bySeq = new Map([...buffer, ...snapshot.events].map(e => [e.seq, e]));
        delivered.push(...[...bySeq.values()].sort((a, b) => a.seq - b.seq)); buffering = false;
      } });
    }, id);
    await writeFile(join(work, `${runtime}-done`), "release");
    await waitFor(async () => page.evaluate(() => Reflect.get(window, "conversationConsumer").buffer.some((e: ConversationEvent) => e.type === "turn.done")), "final buffered event");
    const duplicateCount = await page.evaluate(() => { const c = Reflect.get(window, "conversationConsumer"); return c.buffer.filter((e: ConversationEvent) => c.snapshot.events.some((s: ConversationEvent) => s.seq === e.seq)).length; });
    assert.ok(duplicateCount > 0, "snapshot/buffer genuinely overlap");
    const merged: ConversationEvent[] = await page.evaluate(() => { const c = Reflect.get(window, "conversationConsumer"); c.merge(); return c.delivered; });
    assert.equal(merged.at(-1)?.type, "turn.done"); assert.equal(new Set(merged.map((e: ConversationEvent) => e.seq)).size, merged.length);
    assert.deepEqual(merged, (await read(id)).events);
    console.log(`conversation: ${runtime} E1.7 interrupt and expiry`);
    if (runtime === "claude") await noPeers();
    await config(runtime, { mode: "permission" });
    assert.equal(await page.evaluate(id => window.doan.sendConversation({ conversationId: id, text: "interrupt" }), id), undefined);
    await waitFor(async () => !!(await read(id)).pendingPermission, "interrupt permission");
    const expiring = (await read(id)).pendingPermission!;
    assert.equal(await page.evaluate(id => window.doan.interruptConversation({ conversationId: id }), id), undefined);
    await event(id, "interrupted");
    assert.ok((await read(id)).events.some(e => e.type === "permission.resolved" && e.optionId === "expired"));
    if (runtime === "codex") assert.ok((await wire()).some(r => r.kind === "in" && `string:${r.value?.id}` === expiring.requestId && r.value.error), "expired native request explicitly settled");
    assert.ok(!(await read(id)).events.some(e => e.type === "user.message" && e.text === "must not queue"));
    await quit();
    console.log(`conversation: ${runtime} E1.11 persisted restart`);
    await launch(); assert.ok((await read(id)).events.some(e => e.type === "interrupted"));
    console.log(`conversation: ${runtime} E1.8 crash`);
    await config(runtime, { mode: "crash" });
    const crashed = await accepted(runtime, canvas, "new");
    try {
      const failure = await event(crashed, "turn.failed");
      assert.ok(failure.type === "turn.failed" && failure.code === "process_exited", JSON.stringify(failure));
    } catch (error) {
      failures.push(`${runtime} E1.8: ${String(error)}`); console.error(failures.at(-1));
      await writeFile(join(shots, `${runtime}-crash.json`), JSON.stringify(await read(crashed)));
      await quit(); await launch();
    }
    await noPeers();
    await config(runtime, {});
    const storedOther = await accepted(runtime, other); await terminal(storedOther);
    await quit(); await launch();
    console.log(`conversation: ${runtime} E1.9 CLI and version refusal`);
    const index = await readFile(join(data, "conversations/index.json"), "utf8");
    const refusedHistory = await histories();
    await rename(join(bin, runtime), join(bin, `${runtime}-missing`));
    assert.deepEqual(await start(runtime, canvas, "new"), { error: "cli_missing" });
    await rename(join(bin, `${runtime}-missing`), join(bin, runtime));
    await config(runtime, { version: "99.0.0" });
    assert.deepEqual(await start(runtime, canvas, "new"), { error: "runtime_unsupported" });
    assert.deepEqual(await start(runtime), { error: "session_unavailable" });
    assert.equal(await readFile(join(data, "conversations/index.json"), "utf8"), index);
    console.log(`conversation: ${runtime} startup death rejects without persistence`);
    await config(runtime, { mode: "startup-crash" });
    const refused = await start(runtime, canvas, "new"); assert.ok("error" in refused, JSON.stringify(refused));
    await noPeers(); assert.deepEqual(await histories(), refusedHistory);
    console.log(`conversation: ${runtime} E1.9 profile/cwd/registry checks`);
    await config(runtime, {});
    const originalRecords = await readFile(join(data, "sessions.jsonl"), "utf8");
    const record = originalRecords.trim().split("\n").map(line => JSON.parse(line)).reverse().find(r => r.canvas.id === "a");
    for (const patch of [{ configDir: home }, { cwd: home }, { cwd: join(repo, "missing") }]) {
      await appendFile(join(data, "sessions.jsonl"), JSON.stringify({ ...record, ...patch, at: "2099-01-01T00:00:00.000Z" }) + "\n");
      assert.deepEqual(await start(runtime), { error: "session_unavailable" });
      await writeFile(join(data, "sessions.jsonl"), originalRecords);
    }
    if (runtime === "claude") {
      await writeFile(join(env.CLAUDE_CONFIG_DIR, "sessions/unknown.json"), "{}");
      assert.deepEqual(await start(runtime), { error: "session_unavailable" });
      await rm(join(env.CLAUDE_CONFIG_DIR, "sessions/unknown.json"));
      const identity = await exec("/bin/ps", ["-p", String(process.pid), "-o", "lstart="], { env: { ...process.env, TZ: "UTC" } });
      const registry = join(env.CLAUDE_CONFIG_DIR, `sessions/${process.pid}.json`);
      await writeFile(registry, JSON.stringify({ pid: process.pid, procStart: identity.stdout.trim(), sessionId: record.sessionId, cwd: home, version: "2.1.310", kind: "interactive" }));
      assert.deepEqual(await start(runtime), { error: "session_in_use" });
      await rm(registry);
    } else {
      const daemon = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env, cwd: repo, stdio: "ignore" });
      await once(daemon, "spawn"); assert.ok(daemon.pid);
      try {
        await config(runtime, { mode: "active-writer" });
        assert.deepEqual(await start(runtime), { error: "session_in_use" });
        assert.ok(alive(daemon.pid), "unowned daemon is not terminated");
      } finally { const exited = once(daemon, "exit"); daemon.kill("SIGTERM"); await exited; }
      await noPeers();
    }
    assert.equal(await readFile(join(data, "conversations/index.json"), "utf8"), index);
    assert.deepEqual(await histories(), refusedHistory, "rejected requests leave every history byte unchanged");
    console.log(`conversation: ${runtime} E1.6 simultaneous starting ownership`);
    await config(runtime, { handshakeGate: `${runtime}-handshake`, doneGate: `${runtime}-ownership-done` });
    const spawnCount = (await wire()).filter(r => r.kind === "spawn").length;
    await page.evaluate(input => { Reflect.set(window, "pendingStart", window.doan.startConversation(input)); }, { root: repo, canvas, mode: "resume" as const, runtime, text: "starting owner" });
    await waitFor(async () => (await wire()).filter(r => r.kind === "spawn").length > spawnCount, "pending owner process");
    assert.deepEqual(await start(runtime, other), { error: "session_in_use" });
    const storedOtherBytes = await readFile(join(data, `conversations/${storedOther}.jsonl`), "utf8");
    assert.deepEqual(await page.evaluate(id => window.doan.sendConversation({ conversationId: id, text: "must not append" }), storedOther), { error: "session_in_use" });
    assert.equal(await readFile(join(data, `conversations/${storedOther}.jsonl`), "utf8"), storedOtherBytes);
    assert.equal(await readFile(join(data, "conversations/index.json"), "utf8"), index);
    await writeFile(join(work, `${runtime}-handshake`), "release");
    const owner: { conversationId?: string; error?: string } = await page.evaluate(() => Reflect.get(window, "pendingStart"));
    assert.ok(owner.conversationId, JSON.stringify(owner));
    await config(runtime, {});
    const independent = await accepted(runtime, other, "new"); await terminal(independent);
    if (runtime === "codex") {
      await config(runtime, { generatedId: record.sessionId });
      const ownedIndex = await readFile(join(data, "conversations/index.json"), "utf8");
      assert.deepEqual(await start(runtime, other, "new"), { error: "session_in_use" });
      assert.equal(await readFile(join(data, "conversations/index.json"), "utf8"), ownedIndex);
    }
    await writeFile(join(work, `${runtime}-ownership-done`), "release");
    await terminal(owner.conversationId);
    if (runtime === "codex") {
      console.log("conversation: Codex uncertain exit retains ownership");
      const ownerPid = (await wire()).filter(r => r.kind === "in" && r.value?.method === "thread/resume").at(-1)!.pid;
      await app!.evaluate((_electron, pid) => {
        const original = process.kill;
        Reflect.set(globalThis, "conversationOriginalKill", original);
        process.kill = (target, signal) => { if (target === -pid && signal === 0) throw Object.assign(new Error("unverifiable fixture"), { code: "EPERM" }); return original(target, signal); };
      }, ownerPid);
      await config(runtime, {});
      const newOwner = await accepted(runtime, canvas, "new"); await terminal(newOwner);
      await waitFor(async () => !alive(ownerPid), "old server actually exited");
      assert.deepEqual(await start(runtime, other), { error: "session_in_use" }, "unverifiable group exit retains reservation");
      await app!.evaluate(() => { process.kill = Reflect.get(globalThis, "conversationOriginalKill"); });
      await new Promise(resolve => setTimeout(resolve, 150));
      const released = await accepted(runtime, other); await terminal(released);
    }
    await quit(); await launch();
    console.log(`conversation: ${runtime} E1.10 replacement and anchors`);
    await config(runtime, {});
    const replacement = await page.evaluate(input => window.doan.startConversation(input), { root: repo, canvas, mode: "new" as const, runtime, text: "Compare {{1}} and {{2}}", anchors: [{ point: { dx: 1, dy: 2 } }, { element: { selector: "button", text: "untrusted fixture" } }] });
    assert.ok("conversationId" in replacement, JSON.stringify(replacement)); await terminal(replacement.conversationId);
    assert.ok((await read(crashed)).events.some(e => e.type === "conversation.archived"));
    assert.ok((await read(replacement.conversationId)).events.some(e => e.type === "user.message" && e.anchors.length === 2));
    if (runtime === "codex") {
      await config(runtime, { foreign: true });
      assert.equal(await page.evaluate(id => window.doan.sendConversation({ conversationId: id, text: "wire settlement" }), replacement.conversationId), undefined);
      await waitFor(async () => (await wire()).filter(r => r.runtime === "codex" && r.kind === "in" && ["foreign-thread", "global", "nullable", "post-terminal"].includes(String(r.value?.id)) && r.value?.error).length === 4, "every foreign/global/post-terminal request rejected on wire");
      for (const requestId of ["foreign-thread", "global", "nullable", "post-terminal"]) assert.equal((await wire()).filter(r => r.runtime === "codex" && r.kind === "in" && r.value?.id === requestId && r.value.error).length, 1, `${requestId} settles exactly once`);
      await waitFor(async () => (await read(replacement.conversationId)).events.filter(e => e.type === "turn.done").length === 2, "wire test completion");
    }
    await config(runtime, { mode: "malformed" });
    const malformed = await accepted(runtime, canvas, "new");
    if (runtime === "codex") {
      const malformedEvent = await event(malformed, "turn.failed");
      assert.ok(malformedEvent.type === "turn.failed" && malformedEvent.code === "session_unavailable");
      await noPeers();
    } else {
      // SDK 0.3.310 tolerates non-JSON stdout; it does not impose a turn timeout.
      await waitFor(async () => (await wire()).some(r => r.runtime === "claude" && r.kind === "noise"), "SDK noise emitted");
      assert.ok(!(await read(malformed)).events.some(e => e.type === "turn.done"), "noise is not fabricated success");
      assert.equal(await page.evaluate(id => window.doan.interruptConversation({ conversationId: id }), malformed), undefined);
      await event(malformed, "interrupted"); await noPeers();
      await config(runtime, { mode: "noise-valid" });
      const tolerated = await accepted(runtime, canvas, "new"); await terminal(tolerated); await noPeers();
    }
    await quit();
    for (const phase of ["permission", "hidden"] as const) {
      console.log(`conversation: ${runtime} E1.12 ${phase} Quit`);
      await launch(); await config(runtime, { mode: phase === "permission" ? "permission" : "hold" });
      const quitting = await accepted(runtime, canvas, "new");
      await event(quitting, phase === "permission" ? "permission.request" : "turn.started");
      if (phase === "hidden") await app!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(w => w.isVisible())!.hide(); });
      await quit();
      const saved = (await readFile(join(data, `conversations/${quitting}.jsonl`), "utf8")).trim().split("\n").map(line => JSON.parse(line));
      assert.ok(saved.some(e => e.type === "interrupted" && e.reason === "appQuit"));
      if (phase === "permission") assert.ok(saved.some(e => e.type === "permission.resolved" && e.optionId === "expired"));
    }
    if (runtime === "codex") {
      await launch(); await config(runtime, { mode: "crash-before-reply" });
      const early = await accepted(runtime, canvas, "new");
      const failed = await event(early, "turn.failed"); assert.ok(failed.type === "turn.failed" && failed.code === "process_exited");
      assert.equal((await read(early)).events.filter(e => e.type === "turn.failed").length, 1);
      await noPeers(); await quit();
    }
    console.log(`conversation: ${runtime} E1.12 pending handshake Quit`);
    await launch();
    const pendingIndex = await readFile(join(data, "conversations/index.json"), "utf8");
    await config(runtime, { handshakeGate: `${runtime}-never-release` });
    const pendingCount = (await wire()).filter(r => r.kind === "spawn").length;
    await page.evaluate(input => { void window.doan.startConversation(input).catch(() => {}); }, { root: repo, canvas, mode: "new" as const, runtime, text: "Quit while opening" });
    await waitFor(async () => (await wire()).filter(r => r.kind === "spawn").length > pendingCount, "pending handshake process");
    await quit();
    assert.equal(await readFile(join(data, "conversations/index.json"), "utf8"), pendingIndex);
    console.log(`conversation: ${runtime} crash restart fold`);
    await config(runtime, { mode: "permission" }); await launch();
    const interrupted = await accepted(runtime, canvas, "new"); await event(interrupted, "permission.request");
    const child = app!.process(), exited = once(child, "exit"); child.kill("SIGKILL");
    const [code, signal] = await exited; assert.equal(code, null); assert.equal(signal, "SIGKILL"); app = undefined;
    // An intentionally crashed main cannot clean its groups; terminate only peers
    // whose PIDs this fixture recorded, then verify disappearance before restart.
    for (const row of (await wire()).filter(r => r.kind === "spawn" && alive(r.pid))) {
      const identity = await exec("/bin/ps", ["-p", String(row.pid), "-o", "command="]);
      assert.ok(identity.stdout.includes(join(root, "app/e2e/conversation-agent.cjs")), "verify peer identity before crash cleanup");
      try { process.kill(-row.pid, "SIGTERM"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; }
    }
    await noPeers(); await launch();
    const recovered = await read(interrupted); assert.equal(recovered.turn, "interrupted"); assert.equal(recovered.pendingPermission, undefined);
    assert.ok(!recovered.events.some(e => ["turn.done", "interrupted"].includes(e.type)), "crash projection does not invent persisted events");
    await quit();
    console.log(`conversation: ${runtime} scenarios completed`);
  }
  for (const runtime of ["claude", "codex"] as const) {
    console.log(`conversation: ${runtime} newDesign binding, moved ID, interrupted-start recovery`);
    const fresh = join(work, `new-${runtime}`), first = { path: "design/first.html", id: "first" };
    await mkdir(join(fresh, ".doan"), { recursive: true }); await mkdir(join(fresh, "design"));
    await writeFile(join(fresh, ".doan/config.json"), '{"v":1}');
    await writeFile(join(data, "folders.json"), JSON.stringify([repo, fresh]));
    await launch(); await config(runtime, { write: { path: first.path, html: html("first", "new design") } });
    const created = await page.evaluate(input => window.doan.startConversation(input), { root: fresh, mode: "newDesign" as const, runtime, subject: "Fixture first canvas", text: "fixture" });
    assert.ok("conversationId" in created, JSON.stringify(created)); await terminal(created.conversationId);
    await waitFor(async () => {
      const summary = await page.evaluate(input => window.doan.conversationForCanvas(input), { root: fresh, canvas: first });
      return !("error" in summary) && summary.current?.conversationId === created.conversationId;
    }, "first canvas binding");
    await rename(join(fresh, first.path), join(fresh, "design/moved.html"));
    await waitFor(async () => {
      const summary = await page.evaluate(input => window.doan.conversationForCanvas(input), { root: fresh, canvas: { path: "design/moved.html", id: "first" } });
      return !("error" in summary) && summary.current?.canvas?.path === "design/moved.html";
    }, "stable ID move binding");
    if (runtime === "claude") await noPeers();
    await config(runtime, {});
    assert.equal(await page.evaluate(id => window.doan.sendConversation({ conversationId: id, text: "send after move" }), created.conversationId), undefined);
    await waitFor(async () => (await read(created.conversationId)).events.filter(e => e.type === "turn.done").length === 2, "moved conversation send");
    const original = await read(created.conversationId); await quit();
    const oldPath = join(data, `conversations/${created.conversationId}.jsonl`), bytes = await readFile(oldPath), info = await stat(oldPath), uncommitted = randomUUID();
    await appendFile(oldPath, JSON.stringify({ ...original.events.at(-1), seq: original.lastSeq + 1, type: "conversation.archived" }) + "\n");
    await writeFile(join(data, `conversations/${uncommitted}.jsonl`), '{"partial":');
    await writeFile(join(data, "conversations/start-undo.json"), JSON.stringify({ id: uncommitted, previous: [{ id: created.conversationId, size: bytes.length, ino: info.ino, dev: info.dev }] }));
    await launch();
    assert.deepEqual((await read(created.conversationId)).events, original.events);
    assert.ok((await readFile(oldPath)).equals(bytes));
    await assert.rejects(readFile(join(data, "conversations/start-undo.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(data, `conversations/${uncommitted}.jsonl`)), { code: "ENOENT" });
    await quit();
  }
  if (failures.length) throw new Error(failures.join("\n"));
} catch (error) {
  if (app) await page!.screenshot({ path: join(shots, "failure.png") }).catch(() => {});
  await cp(join(data, "conversations"), join(shots, "conversations"), { recursive: true }).catch(() => {});
  console.error(`conversation: FAIL; evidence ${shots}; temp ${work}`); throw error;
} finally { await guard.finish(); }
console.log(`conversation: PASS; evidence ${shots}`);
