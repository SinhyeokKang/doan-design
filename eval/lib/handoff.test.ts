import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { handoffCommands, noHandoff } from "./handoff.ts";
import { startFakeApp, validHandoffRequest, validHandoffResponse } from "./socket.ts";
import { toolCalls } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { CheckContext, HandoffExchange } from "./types.ts";

const path = ".doan/canvases/next.html";
const key = "ab".repeat(32);
const shell = (...commands: string[]) => toolCalls(commands.map(command => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } })).join("\n"));

test("v5 validators decide all shared schema fixtures", () => {
  for (const [kind, valid] of [["request", validHandoffRequest], ["response", validHandoffResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v5", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v5", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});

test("handoffCommands reads doan handoff only, whatever the flags around it", () => {
  const calls = shell(
    `doan handoff ${path} --message - <<'EOF'\nhello\nEOF`,
    `/tmp/bin/doan --repo /r handoff ${path} --message "x" --json`,
    "echo 'doan handoff x.html'",
    "doan ls --json",
  );
  assert.equal(handoffCommands({ calls }).length, 2);
});

test("noHandoff fails on a command or on a request the app received, and passes on neither", () => {
  const sent: HandoffExchange = { request: { v: 5, root: "/r", handoff: key, path, text: "x" }, response: { v: 5, ok: true, requested: true }, at: "", hashes: {} };
  const ctx = (commands: string[], log: HandoffExchange[]) => ({ calls: shell(...commands), handoff: () => log }) as unknown as CheckContext;
  assert.equal(noHandoff(ctx([], [])).pass, true);
  assert.equal(noHandoff(ctx([`doan handoff ${path} --message x`], [])).pass, false);
  assert.equal(noHandoff(ctx([], [sent])).pass, false);
});

test("the fake app answers v5 in the app's order, spends the one handoff only on an accepted request, and logs token-free, hashed exchanges", async () => {
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
    // already_requested comes before same_canvas, as in the app.
    assert.equal(code(await ask({ path: source })), "already_requested");
    // Not a v5 line at all: the v1 answer, and nothing in the handoff log.
    assert.equal((await ask({}, "not json")).error.code, "bad_request");
    const raw = readFileSync(app.handoffLog, "utf8");
    const log: HandoffExchange[] = raw.trim().split("\n").map(line => JSON.parse(line));
    // Every v5 line is logged, refused or not; the line that is not v5 at all is not.
    assert.equal(log.length, 8);
    assert.equal(log[5]!.hashes[path], contentHash(readFileSync(join(root, path))));
    assert.deepEqual(log[0]!.hashes, {});
    assert.ok(!raw.includes(runtime.token));
    assert.throws(() => readFileSync(app.workLog));
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
