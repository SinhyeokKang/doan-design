import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { noOpen, openCalls, openChecks } from "./open.ts";
import { startFakeApp, validOpenRequest, validOpenResponse } from "./socket.ts";
import { toolCalls } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { CheckContext, OpenExchange } from "./types.ts";

const path = ".doan/canvases/profile.html";
const shell = (...commands: string[]) => toolCalls(commands.map(command => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } })).join("\n"));

test("v4 validators decide all shared schema fixtures", () => {
  for (const [kind, valid] of [["request", validOpenRequest], ["response", validOpenResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v4", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v4", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});

test("openCalls reads the canvas and frame whatever the flag spelling, and only for doan open", () => {
  const calls = openCalls({ calls: shell(
    `doan open ${path} --frame profile-form --json`,
    `/tmp/bin/doan --repo /r open ${path} --frame=profile-form`,
    `doan open --frame profile-form ${path}`,
    `doan open ${path}`,
    "echo 'doan open x.html'",
    "doan ls --json",
  ) });
  assert.deepEqual(calls, [
    { path, frame: "profile-form" }, { path, frame: "profile-form" }, { path, frame: "profile-form" }, { path, frame: undefined },
  ]);
});

const exchange = (request: Partial<OpenExchange["request"]>, response: OpenExchange["response"], hash: string | null): OpenExchange => ({
  request: { v: 4, root: "/repo", path, ...request }, response, at: new Date().toISOString(), hashes: response.ok ? { [path]: hash } : {},
});
const found = { v: 4, ok: true, opened: true, frame: "found" } as const;
const ctx = (commands: string[], log: OpenExchange[], final = "final") =>
  ({ calls: shell(...commands), open: () => log, read: () => final }) as unknown as CheckContext;

test("noOpen fails on a command or on a request the app received, and passes on neither", () => {
  assert.equal(noOpen(ctx([], [])).pass, true);
  assert.equal(noOpen(ctx([`doan open ${path} --frame profile-form`], [])).pass, false);
  assert.equal(noOpen(ctx([], [exchange({}, found, null)])).pass, false);
});

test("openChecks need the call and an accepted request that arrived after the final edit", () => {
  const command = `doan open ${path} --frame profile-form --json`;
  const verdict = (commands: string[], log: OpenExchange[]) => Object.fromEntries(openChecks(ctx(commands, log), path, "profile-form").map(c => [c.id, c.pass]));
  const after = exchange({ frame: "profile-form" }, found, contentHash("final"));
  assert.deepEqual(verdict([command], [after]), { open_command: true, app_opened_canvas: true });
  // A call with no request at the app is not an open.
  assert.deepEqual(verdict([command], []), { open_command: true, app_opened_canvas: false });
  // A request with no call in the transcript still fails open_command: the transcript is the agent's own account.
  assert.deepEqual(verdict([], [after]), { open_command: false, app_opened_canvas: true });
  // Before the edit finished, at the title instead of the id, a missing frame and a refusal.
  assert.equal(verdict([command], [exchange({ frame: "profile-form" }, found, contentHash("seed"))]).app_opened_canvas, false);
  assert.deepEqual(verdict([`doan open ${path} --frame "Profile form"`], [exchange({ frame: "Profile form" }, { ...found, frame: "missing" }, contentHash("final"))]), { open_command: false, app_opened_canvas: false });
  assert.equal(verdict([command], [exchange({ frame: "profile-form" }, { v: 4, ok: false, error: { code: "busy", message: "x" } }, null)]).app_opened_canvas, false);
  assert.equal(verdict([command], [exchange({}, { ...found, frame: "none" }, contentHash("final"))]).app_opened_canvas, false);
});

test("the fake app answers v4 like the app's list check and logs token-free, hashed exchanges", async () => {
  const dir = mkdtempSync("/tmp/doan-open-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, path), '<section data-doan-frame="profile-form" data-doan-title="Profile form"></section>');
  const app = await startFakeApp({ dir, root, selection: null });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const request = (args: Record<string, unknown>, line?: string) => new Promise<any>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end((line ?? JSON.stringify({ v: 4, token: runtime.token, root, ...args })) + "\n");
    });
    assert.deepEqual(await request({ path, frame: "profile-form" }), { v: 4, ok: true, opened: true, frame: "found" });
    assert.deepEqual(await request({ path, frame: "elsewhere" }), { v: 4, ok: true, opened: true, frame: "missing" });
    assert.deepEqual(await request({ path }), { v: 4, ok: true, opened: true, frame: "none" });
    assert.equal((await request({ path: ".doan/canvases/gone.html" })).error.code, "canvas_not_found");
    assert.equal((await request({ path, root: "/elsewhere" })).error.code, "project_not_open");
    assert.equal((await request({ path, token: "wrong" })).error.code, "bad_token");
    assert.equal((await request({ path: "../x.html" })).error.code, "bad_request");
    // Not a v4 line at all: the v1 answer, and nothing in the open log.
    assert.deepEqual(await request({}, "not json"), { v: 1, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v1 request." } });
    const raw = readFileSync(app.openLog, "utf8");
    const log: OpenExchange[] = raw.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(log.length, 7);
    assert.equal(log[0].hashes[path], contentHash(readFileSync(join(root, path))));
    assert.deepEqual(log[3].hashes, {});
    assert.ok(!raw.includes(runtime.token));
    // v4 traffic stays out of the work log.
    assert.throws(() => readFileSync(app.workLog));
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
