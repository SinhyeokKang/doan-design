import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { startFakeApp, validWorkRequest, validWorkResponse } from "./socket.ts";
import { workChecks } from "./work.ts";
import type { CheckContext, WorkExchange } from "./types.ts";

const path = ".doan/canvases/profile.html";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const exchange = (action: "start" | "done", hashes: Record<string, string | null>, target = path): WorkExchange => ({
  request: { v: 3, action, root: "/repo", ...(action === "start" ? { path: target } : {}) },
  response: { v: 3, ok: true }, hashes, at: new Date().toISOString(),
});
function failed(log: WorkExchange[], changed = [path], seed: string | null = "seed") {
  const ctx = { work: () => log, changedFiles: () => changed, seed: () => seed, read: () => "final" } as CheckContext;
  return workChecks(ctx).filter(c => !c.pass).map(c => c.id);
}
test("work checks accept a start before editing and a done after the final edit", () => {
  assert.deepEqual(failed([exchange("start", { [path]: hash("seed") }), exchange("done", { [path]: hash("final") })]), []);
});
test("work checks reject a late first start even if a later start looks correct", () => {
  assert.deepEqual(failed([exchange("start", { [path]: hash("final") }), exchange("start", { [path]: hash("seed") }), exchange("done", { [path]: hash("final") })]), ["start_before_edit"]);
});
test("work checks require done and compare the last done with final content", () => {
  assert.ok(failed([exchange("start", { [path]: hash("seed") })]).includes("done_at_end"));
  assert.ok(failed([exchange("start", { [path]: hash("seed") }), exchange("done", { [path]: hash("final") }), exchange("done", { [path]: hash("seed") })]).includes("done_at_end"));
});
test("work checks require a start for every changed canvas including ds", () => {
  assert.ok(failed([exchange("start", { [path]: hash("seed") }), exchange("done", { [path]: hash("final") })], [path, ".doan/ds/button.html"]).includes("start_path"));
});
test("work checks accept missing files before creation and reject failed delivery", () => {
  assert.deepEqual(failed([exchange("start", { [path]: null }), exchange("done", { [path]: hash("final") })], [path], null), []);
  const rejected = exchange("start", { [path]: hash("seed") });
  rejected.response = { v: 3, ok: false, error: { code: "bad_token", message: "wrong" } };
  assert.ok(failed([rejected, exchange("done", { [path]: hash("final") })]).includes("start_path"));
});
test("v3 validators decide all shared schema fixtures", () => {
  for (const [kind, valid] of [["request", validWorkRequest], ["response", validWorkResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v3", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v3", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});
test("fake app records arrival hashes, missing paths, auth failures and token-free evidence", async () => {
  const dir = mkdtempSync("/tmp/doan-work-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  const app = await startFakeApp({ dir, root, selection: null });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const request = async (args: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end(JSON.stringify({ v: 3, token: runtime.token, root, ...args }) + "\n");
    });
    assert.deepEqual(await request({ action: "start", path }), { v: 3, ok: true });
    writeFileSync(join(root, path), "final");
    assert.deepEqual(await request({ action: "done" }), { v: 3, ok: true });
    assert.equal((await request({ action: "start", path, token: "wrong" }) as { error: { code: string } }).error.code, "bad_token");
    const raw = readFileSync(app.workLog, "utf8");
    const log: WorkExchange[] = raw.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(log[0].hashes[path], null);
    assert.equal(log[1].hashes[path], hash("final"));
    assert.ok(!raw.includes(runtime.token));
    assert.ok(Number.isFinite(Date.parse(log[0].at)));
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("an unreadable snapshot records null and leaves the fake app serving work requests", async () => {
  const dir = mkdtempSync("/tmp/doan-work-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, path), { recursive: true });
  const app = await startFakeApp({ dir, root, selection: null });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const request = (action: string) => new Promise<unknown>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => {
        try { resolve(JSON.parse(reply)); } catch (error) { reject(error); }
      });
      socket.end(JSON.stringify({ v: 3, token: runtime.token, root, action, ...(action === "start" ? { path } : {}) }) + "\n");
    });
    assert.deepEqual(await request("start"), { v: 3, ok: true });
    rmSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path), "readable again");
    assert.deepEqual(await request("done"), { v: 3, ok: true });
    const log: WorkExchange[] = readFileSync(app.workLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(log[0].hashes[path], null);
    assert.equal(log[1].hashes[path], hash("readable again"));
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
