import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { answer, startFakeApp, validRequest, validResponse, validRuntimeFile, validSelection } from "./socket.ts";

const fixtures = join(import.meta.dirname, "../../schema/fixtures");

function agreesWithSchema(dir: string, valid: (value: unknown) => boolean) {
  for (const kind of ["valid", "invalid"])
    for (const name of readdirSync(join(fixtures, dir, kind)))
      assert.equal(valid(JSON.parse(readFileSync(join(fixtures, dir, kind, name), "utf8"))), kind === "valid", `${dir}/${kind}/${name}`);
}

test("validators agree with every schema fixture", () => {
  agreesWithSchema("runtime", validRuntimeFile);
  agreesWithSchema("app-socket/request", validRequest);
  agreesWithSchema("app-socket/response", validResponse);
  agreesWithSchema("app-socket/selection", validSelection);
});

test("answers follow the app: request shape, then token, then project", () => {
  const token = "a".repeat(64);
  const selection = { root: "/r", canvas: { path: "design/a.html", id: "a" } };
  assert.deepEqual(answer("nope", token, "/r", selection), { v: 1, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v1 request." } });
  assert.equal((answer(JSON.stringify({ v: 1, token: "b", root: "/x" }), token, "/r", selection) as any).error.code, "bad_token");
  assert.equal((answer(JSON.stringify({ v: 1, token, root: "/x" }), token, "/r", selection) as any).error.code, "project_not_open");
  assert.deepEqual(answer(JSON.stringify({ v: 1, token, root: "/r" }), token, "/r", selection), { v: 1, ok: true, result: { selection } });
  assert.deepEqual(answer(JSON.stringify({ v: 1, token, root: "/r" }), token, "/r", null), { v: 1, ok: true, result: {} });
});

test("the fake app writes a runtime file and answers one line per connection", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const selection = { root: "/r", canvas: { path: "design/a.html" } };
    const app = await startFakeApp({ dir, root: "/r", selection });
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    assert.ok(validRuntimeFile(runtime));
    assert.equal(statSync(app.runtimePath).mode & 0o777, 0o600);
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let data = "";
      socket.on("data", chunk => { data += chunk; });
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
      socket.write(JSON.stringify({ v: 1, token: runtime.token, root: "/r" }) + "\n");
    });
    assert.deepEqual(JSON.parse(reply), { v: 1, ok: true, result: { selection } });
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The fake app is this test process's only child running socket.ts.
function fakeAppPid(): number {
  const pids = execFileSync("pgrep", ["-P", String(process.pid), "-f", "socket.ts"], { encoding: "utf8" }).trim().split("\n");
  assert.equal(pids.length, 1, `fake app pids: ${pids}`);
  return Number(pids[0]);
}

const settlesWithin = (promise: Promise<void>, ms: number) =>
  Promise.race([promise.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), ms))]);

test("close settles when the fake app was killed by a signal before it", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const app = await startFakeApp({ dir, root: "/r", selection: null });
    process.kill(fakeAppPid(), "SIGKILL");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(await settlesWithin(app.close(), 500), "close still pending after the child was killed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("close settles and kills a fake app that does not exit on its own", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const app = await startFakeApp({ dir, root: "/r", selection: null });
    const pid = fakeAppPid();
    // A stopped process never reads the closed stdin.
    process.kill(pid, "SIGSTOP");
    try {
      assert.ok(await settlesWithin(app.close(), 5000), "close still pending for an unresponsive child");
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
