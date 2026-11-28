import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { handoffCommands, noHandoff, sendCommands } from "./handoff.ts";
import { openCalls } from "./open.ts";
import { startFakeApp, validHandoffRequest, validHandoffResponse, validSendRequest, validSendResponse } from "./socket.ts";
import { toolCalls } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { CheckContext, HandoffExchange, SendExchange } from "./types.ts";

const path = ".doan/canvases/next.html";
const key = "ab".repeat(32);
const shell = (...commands: string[]) => toolCalls(commands.map(command => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } })).join("\n"));

test("v5 validators decide all shared schema fixtures", () => {
  for (const [kind, valid] of [["request", validHandoffRequest], ["response", validHandoffResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v5", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v5", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});

test("v8 validators decide all shared schema fixtures", () => {
  for (const [kind, valid] of [["request", validSendRequest], ["response", validSendResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v8", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v8", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});

test("handoffCommands reads doan handoff only, whatever the flags around it", () => {
  const calls = shell(
    `doan handoff ${path} --message - <<'EOF'\nhello\nEOF`,
    `/tmp/bin/doan handoff --repo /r ${path} --message "x" --json`,
    "echo 'doan handoff x.html'",
    "doan ls --json",
  );
  assert.equal(handoffCommands({ calls }).length, 2);
});

test("sendCommands reads doan send only, and handoffCommands does not count it", () => {
  const calls = shell(
    `doan send ${path} --message - <<'EOF'\nhello\nEOF`,
    `/tmp/bin/doan send --repo /r ${path} --message "x" --json`,
    `doan handoff ${path} --message x`,
    "echo 'doan send x.html'",
  );
  assert.equal(sendCommands({ calls }).length, 2);
  assert.equal(handoffCommands({ calls }).length, 1);
});

test("a heredoc body is message text, not commands: a line starting with doan open or doan handoff in it counts for neither", () => {
  const body = "Next step:\ndoan open .doan/canvases/a.html\ndoan handoff .doan/canvases/b.html --message x";
  for (const open of ["<<'EOF'", "<<EOF", '<<"EOF"', "<<-EOF"]) {
    const calls = shell(`doan handoff .doan/canvases/a.html --message - ${open}\n${body}\nEOF`);
    assert.equal(handoffCommands({ calls }).length, 1, open);
    assert.deepEqual(openCalls({ calls }), [], open);
  }
  // Commands after the terminator and inside a bash -c string still count, and a here-string is not a heredoc.
  assert.equal(handoffCommands({ calls: shell(`cat <<'EOF'\nx\nEOF\ndoan handoff .doan/canvases/a.html --message y`) }).length, 1);
  assert.equal(handoffCommands({ calls: shell(`bash -lc "doan handoff .doan/canvases/a.html --message - <<'EOF'\ndoan handoff z\nEOF"`) }).length, 1);
  assert.equal(handoffCommands({ calls: shell(`cat <<< hi\ndoan handoff .doan/canvases/a.html --message y`) }).length, 1);
  // A body that never reaches its terminator runs to the end, as the shell reads it.
  assert.equal(handoffCommands({ calls: shell(`doan handoff .doan/canvases/a.html --message - <<EOF\ndoan handoff z`) }).length, 1);
});

test("noHandoff fails on a command or on a request the app received, and passes on neither", () => {
  const sent: HandoffExchange = { request: { v: 5, root: "/r", handoff: key, path, text: "x" }, response: { v: 5, ok: true, requested: true }, at: "", hashes: {} };
  const ctx = (commands: string[], log: HandoffExchange[]) => ({ calls: shell(...commands), handoff: () => log, send: () => [] }) as unknown as CheckContext;
  assert.equal(noHandoff(ctx([], [])).pass, true);
  assert.equal(noHandoff(ctx([`doan handoff ${path} --message x`], [])).pass, false);
  assert.equal(noHandoff(ctx([], [sent])).pass, false);
});

test("noHandoff counts doan send and a v8 request as well, so a send without an instruction fails it once", () => {
  const sent: SendExchange = { request: { v: 8, root: "/r", handoff: key, path, text: "x" }, response: { v: 8, ok: true, requested: true }, at: "", hashes: {} };
  const ctx = (commands: string[], log: SendExchange[]) => ({ calls: shell(...commands), handoff: () => [], send: () => log }) as unknown as CheckContext;
  assert.equal(noHandoff(ctx([], [])).pass, true);
  assert.equal(noHandoff(ctx([`doan send ${path} --message x`], [])).pass, false);
  assert.equal(noHandoff(ctx([], [sent])).pass, false);
  assert.match(noHandoff(ctx([`doan send ${path} --message x`], [sent])).detail, /doan send commands/);
});

test("noHandoff fails beside a command the reader could not follow, which may have run doan handoff", () => {
  const ctx = (commands: string[]) => ({ calls: shell(...commands), handoff: () => [], send: () => [] }) as unknown as CheckContext;
  const check = noHandoff(ctx([`if [ -f ${path} ]; then doan handoff ${path} --message x; fi`]));
  assert.equal(check.pass, false);
  assert.match(check.detail, /could not be read completely/);
  // The same command, readable, is seen, and a readable command without one still passes.
  assert.equal(noHandoff(ctx([`test -f ${path} && doan handoff ${path} --message x`])).pass, false);
  assert.equal(noHandoff(ctx([`test -f ${path} && doan ls --json`])).pass, true);
});

test("the fake app answers v5 in the app's order, accepts each different path once, and logs token-free, hashed exchanges", async () => {
  const dir = mkdtempSync("/tmp/doan-handoff-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, path), "<p>next</p>\n");
  const source = ".doan/canvases/account.html";
  const app = await startFakeApp({ dir, root, selection: null, handoff: { key, canvas: source } });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const ask = (args: Record<string, unknown>, line?: string) => new Promise<any>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end((line ?? JSON.stringify({ v: 5, token: runtime.token, root, handoff: key, path, text: "Continue on next.", ...args })) + "\n");
    });
    const code = (reply: any) => reply.ok ? "ok" : reply.error.code;
    assert.equal(code(await ask({ text: " " })), "bad_request");
    assert.equal(code(await ask({ token: "wrong" })), "bad_token");
    assert.equal(code(await ask({ root: "/elsewhere" })), "project_not_open");
    assert.equal(code(await ask({ handoff: "cd".repeat(32) })), "not_app_conversation");
    assert.equal(code(await ask({ path: source })), "same_canvas");
    assert.deepEqual(await ask({}), { v: 5, ok: true, requested: true });
    assert.equal(code(await ask({})), "already_requested");
    assert.equal((await ask({})).error.message, "This turn already handed off to this canvas.");
    const other = ".doan/canvases/other.html";
    writeFileSync(join(root, other), "<p>other</p>\n");
    assert.deepEqual(await ask({ path: other }), { v: 5, ok: true, requested: true });
    assert.equal(code(await ask({ path: other })), "already_requested");
    assert.equal(code(await ask({ path: source })), "same_canvas");
    // Not a v5 line at all: the v1 answer, and nothing in the handoff log.
    assert.equal((await ask({}, "not json")).error.code, "bad_request");
    const raw = readFileSync(app.handoffLog, "utf8");
    const log: HandoffExchange[] = raw.trim().split("\n").map(line => JSON.parse(line));
    // Every v5 line is logged, refused or not; the line that is not v5 at all is not.
    assert.equal(log.length, 11);
    assert.equal(log[5]!.hashes[path], contentHash(readFileSync(join(root, path))));
    assert.equal(log[8]!.hashes[other], contentHash(readFileSync(join(root, other))));
    assert.deepEqual(log[0]!.hashes, {});
    assert.ok(!raw.includes(runtime.token));
    assert.throws(() => readFileSync(app.workLog));
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a handoff conversation with no canvas (a Home conversation) never answers same_canvas", async () => {
  const dir = mkdtempSync("/tmp/doan-handoff-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  const account = ".doan/canvases/account.html";
  writeFileSync(join(root, account), "<p>account</p>\n");
  const app = await startFakeApp({ dir, root, selection: null, handoff: { key, canvas: null } });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const ask = (args: Record<string, unknown>) => new Promise<any>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end(JSON.stringify({ v: 5, token: runtime.token, root, handoff: key, path: account, text: "Continue on account.", ...args }) + "\n");
    });
    assert.equal((await ask({ handoff: "cd".repeat(32) })).error.code, "not_app_conversation");
    assert.deepEqual(await ask({}), { v: 5, ok: true, requested: true });
    assert.equal((await ask({})).error.code, "already_requested");
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("without a handoff conversation the fake app is an older app that does not know v5", async () => {
  const dir = mkdtempSync("/tmp/doan-handoff-test-");
  const root = join(dir, "repo");
  mkdirSync(root, { recursive: true });
  const app = await startFakeApp({ dir, root, selection: null });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const reply = await new Promise<any>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let text = "";
      socket.on("error", reject).on("data", bytes => { text += bytes; }).on("end", () => resolve(JSON.parse(text)));
      socket.end(JSON.stringify({ v: 5, token: runtime.token, root, handoff: key, path, text: "x" }) + "\n");
    });
    assert.deepEqual(reply, { v: 1, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v1 request." } });
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

// The v8 and v5 requests of one turn share the turn's request set, and each version's lines stay in its own list.
test("the fake app answers v8 like v5, shares a canvas path with v5, and keeps the two versions' exchanges apart", async () => {
  const dir = mkdtempSync("/tmp/doan-handoff-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  const other = ".doan/canvases/other.html";
  writeFileSync(join(root, path), "<p>next</p>\n");
  writeFileSync(join(root, other), "<p>other</p>\n");
  const source = ".doan/canvases/account.html";
  const app = await startFakeApp({ dir, root, selection: null, handoff: { key, canvas: source } });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const ask = (v: number, args: Record<string, unknown>) => new Promise<any>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end(JSON.stringify({ v, token: runtime.token, root, handoff: key, path, text: "Pass this on.", ...args }) + "\n");
    });
    const code = (reply: any) => reply.ok ? "ok" : reply.error.code;
    assert.equal(code(await ask(8, { text: " " })), "bad_request");
    assert.equal(code(await ask(8, { token: "wrong" })), "bad_token");
    assert.equal(code(await ask(8, { root: "/elsewhere" })), "project_not_open");
    assert.equal(code(await ask(8, { handoff: "cd".repeat(32) })), "not_app_conversation");
    assert.equal(code(await ask(8, { path: source })), "same_canvas");
    assert.deepEqual(await ask(8, {}), { v: 8, ok: true, requested: true });
    assert.equal(code(await ask(8, {})), "already_requested");
    // handoff and send count together for one canvas in one turn.
    assert.equal(code(await ask(5, {})), "already_requested");
    assert.deepEqual(await ask(5, { path: other }), { v: 5, ok: true, requested: true });
    assert.equal(code(await ask(8, { path: other })), "already_requested");
    const lines: any[] = readFileSync(app.handoffLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(lines.map(line => line.request.v), [8, 8, 8, 8, 8, 8, 8, 5, 8, 8]);
    assert.equal(lines[5].hashes[path], contentHash(readFileSync(join(root, path))));
    assert.ok(!readFileSync(app.handoffLog, "utf8").includes(runtime.token));
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

// The app judges these after the schema, token, project, key and the turn's own state; a request the app refused here
// reserves nothing and does not count as a request received.
test("a turn started by a received message gets chain_one for a second accepted request and chain_limit at five steps", async () => {
  const dir = mkdtempSync("/tmp/doan-handoff-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  const [a, b] = [".doan/canvases/a.html", ".doan/canvases/b.html"];
  for (const file of [a, b]) writeFileSync(join(root, file), "<p>x</p>\n");
  const run = async (chain: string[], body: (ask: (v: number, args: Record<string, unknown>) => Promise<any>) => Promise<void>) => {
    const sub = mkdtempSync(join(dir, "app-"));
    const app = await startFakeApp({ dir: sub, root, selection: null, handoff: { key, canvas: ".doan/canvases/account.html", received: { chain } } });
    try {
      const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
      await body((v, args) => new Promise<any>((resolve, reject) => {
        const socket = connect(runtime.socket);
        let reply = "";
        socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
        socket.end(JSON.stringify({ v, token: runtime.token, root, handoff: key, path: a, text: "Pass this on.", ...args }) + "\n");
      }));
    } finally { await app.close(); }
  };
  try {
    const code = (reply: any) => reply.ok ? "ok" : reply.error.code;
    await run(["c1"], async ask => {
      assert.equal(code(await ask(8, {})), "ok");
      // The second request is refused whatever the version or canvas; a repeat of the first path is already_requested.
      assert.equal(code(await ask(8, { path: b })), "chain_one");
      assert.equal(code(await ask(5, { path: b })), "chain_one");
      assert.equal(code(await ask(8, {})), "already_requested");
    });
    await run(["c1"], async ask => {
      // A request refused earlier in the order is not received, so it does not use the turn's one request.
      assert.equal(code(await ask(8, { path: ".doan/canvases/account.html" })), "same_canvas");
      assert.equal(code(await ask(5, {})), "ok");
    });
    await run(["c1", "c2", "c3", "c4", "c5"], async ask => {
      assert.equal(code(await ask(8, {})), "chain_limit");
      assert.equal(code(await ask(5, {})), "chain_limit");
    });
    await run(["c1", "c2", "c3", "c4"], async ask => {
      assert.equal(code(await ask(8, {})), "ok");
      assert.equal(code(await ask(8, { path: b })), "chain_one");
    });
    // Step 0 (no received message) allows several requests, as before.
    await run([], async ask => {
      assert.equal(code(await ask(8, {})), "ok");
      assert.equal(code(await ask(8, { path: b })), "ok");
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
