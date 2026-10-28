import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { answer, onboardingApp, startFakeApp, validOnboardingRequest, validOnboardingResponse, validRequest, validResponse, validRuntimeFile, validSelection, type OnboardingScript } from "./socket.ts";

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
  const selection = { root: "/r", canvas: { path: ".doan/canvases/a.html", id: "a" } };
  assert.deepEqual(answer("nope", token, "/r", selection), { v: 1, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v1 request." } });
  assert.equal((answer(JSON.stringify({ v: 1, token: "b", root: "/x" }), token, "/r", selection) as any).error.code, "bad_token");
  assert.equal((answer(JSON.stringify({ v: 1, token, root: "/x" }), token, "/r", selection) as any).error.code, "project_not_open");
  assert.deepEqual(answer(JSON.stringify({ v: 1, token, root: "/r" }), token, "/r", selection), { v: 1, ok: true, result: { selection } });
  assert.deepEqual(answer(JSON.stringify({ v: 1, token, root: "/r" }), token, "/r", null), { v: 1, ok: true, result: {} });
});

test("the fake app writes a runtime file and answers one line per connection", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const selection = { root: "/r", canvas: { path: ".doan/canvases/a.html" } };
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

test("onboarding validators agree with every app-socket v2 fixture", () => {
  agreesWithSchema("app-socket-v2/request", validOnboardingRequest);
  agreesWithSchema("app-socket-v2/response", validOnboardingResponse);
});

const notConnected = (provider: string) => ({ provider, phase: "disconnected", readiness: { ready: false, cause: "not_connected", action: "signIn" }, error: null, actions: ["signIn"] });
const ready = (provider: string) => ({ provider, phase: "connected", readiness: { ready: true }, error: null, actions: ["signOut"] });
const unverified = (provider: string) => ({ provider, phase: "connected", readiness: { ready: false, cause: "unverified", action: "retry" }, error: null, actions: ["retry", "signOut"] });
const CHANGES = [".doan/config.json", ".doan/canvases/", ".gitattributes"];

// Every reply the fake gives must itself be a valid app-socket v2 response.
function session(script: OnboardingScript, root = "/r") {
  const app = onboardingApp(script, root);
  const token = "t".repeat(64);
  return (request: Record<string, unknown>, sentToken = token): any => {
    const reply = app.answer(JSON.stringify({ v: 2, token: sentToken, ...request }), token);
    assert.ok(validOnboardingResponse(reply), JSON.stringify(reply));
    return reply;
  };
}
const S = { sessionId: "s_eval" };

test("onboarding answers check shape, then token, then session", () => {
  const ask = session({ providers: [ready("claude")], changes: CHANGES, readyAfterCheck: [] });
  assert.equal(ask({ op: "status" }).error.code, "bad_request");
  assert.equal(ask({ op: "start" }, "wrong").error.code, "bad_token");
  assert.equal(ask({ op: "status", ...S }).error.code, "session_stale");
  const start = ask({ op: "start" });
  assert.equal(start.result.sessionId, "s_eval");
  assert.deepEqual(start.result.agents.providers, [ready("claude")]);
  assert.equal(start.result.completed, false);
  assert.equal(ask({ op: "status", sessionId: "s_other" }).error.code, "session_stale");
  assert.equal(ask({ op: "start" }).result.sessionId, "s_eval", "start reuses the session");
});

test("a project is inspected, selected with --initialize and completed through status polls", () => {
  const ask = session({ providers: [ready("claude")], changes: CHANGES, readyAfterCheck: [] });
  ask({ op: "start" });
  assert.equal(ask({ op: "project_inspect", ...S, requestId: "i1", path: "/elsewhere" }).error.code, "path_unavailable");
  const inspect = ask({ op: "project_inspect", ...S, requestId: "i2", path: "/r" }).result.operation;
  assert.equal(inspect.state, "running");
  assert.equal(ask({ op: "project_select", ...S, requestId: "s0", inspectionId: "insp_1", path: "/r", initialize: true }).error.code, "inspection_stale", "not inspected yet");
  const settled = ask({ op: "status", ...S, operationId: inspect.operationId }).result.operations;
  assert.deepEqual(settled[0].inspection, { inspectionId: "insp_1", candidates: [{ path: "/r", changes: CHANGES }] });
  assert.equal(ask({ op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: "/r" }).error.code, "initialize_required");
  assert.equal(ask({ op: "project_select", ...S, requestId: "s2", inspectionId: "insp_1", path: "/x", initialize: true }).error.code, "not_candidate");
  assert.equal(ask({ op: "complete", ...S, requestId: "c0" }).error.code, "no_project");
  const select = ask({ op: "project_select", ...S, requestId: "s3", inspectionId: "insp_1", path: "/r", initialize: true }).result.operation;
  assert.equal(select.state, "running");
  assert.deepEqual(ask({ op: "status", ...S }).result.project, { root: "/r" });
  const complete = ask({ op: "complete", ...S, requestId: "c1" }).result.operation;
  assert.equal(complete.state, "running");
  const done = ask({ op: "status", ...S }).result;
  assert.equal(done.completed, true);
  assert.deepEqual(done.operations.find((o: any) => o.kind === "complete"), { ...complete, state: "succeeded", project: { root: "/r" } });
});

test("a requestId returns its original operation and refuses other arguments", () => {
  const ask = session({ providers: [ready("claude")], changes: [], readyAfterCheck: [] });
  ask({ op: "start" });
  const first = ask({ op: "project_inspect", ...S, requestId: "i1", path: "/r" }).result.operation;
  assert.deepEqual(ask({ op: "project_inspect", ...S, requestId: "i1", path: "/r" }).result.operation, first);
  assert.equal(ask({ op: "project_inspect", ...S, requestId: "i1", path: "/r/sub" }).error.code, "request_conflict");
  ask({ op: "status", ...S });
  assert.equal(ask({ op: "project_inspect", ...S, requestId: "i1", path: "/r" }).result.operation.state, "succeeded");
  // An already set-up folder needs no --initialize.
  assert.equal(ask({ op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: "/r" }).result.operation.kind, "project_select");
});

test("a sign-in waits for the user in the browser and blocks a second one", () => {
  const ask = session({ providers: [notConnected("claude"), unverified("copilot")], changes: CHANGES, readyAfterCheck: ["copilot"] });
  ask({ op: "start" });
  assert.equal(ask({ op: "sign_in", ...S, requestId: "x", provider: "cursor" }).error.code, "bad_request", "the script has no cursor state");
  assert.equal(ask({ op: "check", ...S, requestId: "y", provider: "claude" }).error.code, "not_connected");
  const signIn = ask({ op: "sign_in", ...S, requestId: "a1", provider: "claude" }).result.operation;
  assert.equal(signIn.state, "pending");
  for (let i = 0; i < 3; i++) assert.equal(ask({ op: "status", ...S, operationId: signIn.operationId }).result.operations[0].state, "awaiting_user");
  assert.equal(ask({ op: "sign_in", ...S, requestId: "a2", provider: "claude" }).error.code, "busy");
  assert.equal(ask({ op: "complete", ...S, requestId: "c1" }).error.code, "no_ready_agent");
  assert.equal(ask({ op: "status", ...S, operationId: "op_99" }).error.code, "operation_not_found");
  const cancelled = ask({ op: "cancel", ...S, requestId: "k1", operationId: signIn.operationId });
  assert.equal(cancelled.op, "cancel");
  assert.deepEqual(cancelled.result.operation, { ...signIn, state: "cancelled" });
  assert.equal(ask({ op: "cancel", ...S, requestId: "k2", operationId: "op_99" }).error.code, "operation_not_found");
  const check = ask({ op: "check", ...S, requestId: "p1", provider: "copilot", spendCopilotRequest: true }).result.operation;
  assert.equal(check.state, "running");
  const after = ask({ op: "status", ...S }).result;
  assert.deepEqual(after.agents.providers.find((p: any) => p.provider === "copilot"), ready("copilot"));
  assert.equal(after.operations.find((o: any) => o.operationId === check.operationId).state, "succeeded");
});

test("an onboarding script must describe valid app state", () => {
  assert.throws(() => onboardingApp({ providers: [{ provider: "claude" }], changes: [], readyAfterCheck: [] } as any, "/r"));
  assert.throws(() => onboardingApp({ providers: [], changes: ["README.md"], readyAfterCheck: [] }, "/r"));
  assert.throws(() => onboardingApp({ providers: [], changes: [], readyAfterCheck: ["claude"] }, "/r"));
  assert.throws(() => onboardingApp({ providers: [], changes: [], readyAfterCheck: [], extra: 1 } as any, "/r"));
});

function exchange(socketPath: string, line: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let data = "";
    socket.on("data", chunk => { data += chunk; });
    socket.on("end", () => resolve(JSON.parse(data)));
    socket.on("error", reject);
    socket.write(line + "\n");
  });
}

test("the fake app answers v2 only with a script and logs onboarding exchanges without the token", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const plain = await startFakeApp({ dir, root: "/r", selection: null });
    const runtime = JSON.parse(readFileSync(plain.runtimePath, "utf8"));
    assert.deepEqual(await exchange(runtime.socket, JSON.stringify({ v: 2, token: runtime.token, op: "start" })),
      { v: 1, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v1 request." } }, "an app without onboarding is an older app");
    await plain.close();

    const app = await startFakeApp({ dir, root: "/r", selection: null, onboarding: { providers: [ready("claude")], changes: [], readyAfterCheck: [] } });
    const { socket, token } = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const start = await exchange(socket, JSON.stringify({ v: 2, token, op: "start" }));
    assert.equal(start.result.sessionId, "s_eval");
    assert.equal((await exchange(socket, JSON.stringify({ v: 1, token, root: "/r" }))).ok, true, "v1 still answers");
    const refused = await exchange(socket, JSON.stringify({ v: 2, token: "nope", op: "start" }));
    await app.close();
    const log = readFileSync(app.onboardingLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(log, [{ request: { v: 2, op: "start" }, response: start }, { request: { v: 2, op: "start" }, response: refused }], "only v2 exchanges, in order");
    assert.equal(refused.error.code, "bad_token");
    assert.ok(!readFileSync(app.onboardingLog, "utf8").includes(token));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
