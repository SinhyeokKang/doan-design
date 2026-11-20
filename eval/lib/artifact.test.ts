import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { connect } from "node:net";
import { serveFakeApp } from "./socket.ts";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { cliProvenance } from "./agent.ts";
import { appWritten, createContext } from "./context.ts";
import type { CheckContext } from "./types.ts";
import x1 from "../scenarios/X1/checks.ts";
import x2 from "../scenarios/X2/checks.ts";

// Only the descriptor metadata changes. Every underlying file is a tiny regular fixture.
function descriptor(t: TestContext, target: string, change: Partial<Pick<fs.Stats, "isFile" | "size">>) {
  const { openSync, fstatSync } = fs;
  let fd: number | null = null;
  const flagsSeen: number[] = [];
  t.mock.method(fs, "openSync", (path: string, flags: number) => {
    const opened = openSync(path, flags);
    if (path === target) {
      fd = opened;
      flagsSeen.push(flags);
    } else if (opened === fd) fd = null;
    return opened;
  });
  t.mock.method(fs, "fstatSync", (opened: number) => {
    const stat = fstatSync(opened);
    return opened === fd ? Object.assign(stat, change) : stat;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    assert.ok(flagsSeen.length > 0 && flagsSeen.every(flags => flags & fs.constants.O_NONBLOCK), "nonblocking open");
  });
}

function temp(t: TestContext) {
  const dir = fs.realpathSync(fs.mkdtempSync("/tmp/doan-artifact-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("checker reads and app-write attribution use the admitted descriptor", { timeout: 3000 }, t => {
  const repo = temp(t);
  const target = join(repo, "text");
  const manifest = join(repo, "manifest.json");
  fs.writeFileSync(target, "fixture");
  fs.symlinkSync("text", join(repo, "alias"));
  fs.writeFileSync(manifest, JSON.stringify({ alias: "fixture" }));
  const ctx = createContext({ repo, cli: "", seedCommit: "", agent: "fixture", transcript: "", env: {} });
  assert.equal(ctx.read("alias"), "fixture");
  assert.deepEqual(appWritten(repo, manifest), ["alias"]);
  descriptor(t, target, { isFile: () => false });
  assert.equal(ctx.read("alias"), null);
  assert.deepEqual(appWritten(repo, manifest), []);
});

test("CLI provenance retains the exact admitted bytes, including for an empty PATH result", { timeout: 3000 }, t => {
  const dir = temp(t);
  const target = join(dir, "path");
  const report = join(dir, "report");
  const retained = join(dir, "retained");
  fs.writeFileSync(target, "\n");
  fs.symlinkSync("path", report);
  assert.equal(cliProvenance(report, null, retained).pass, true);
  assert.equal(fs.readFileSync(retained, "utf8"), "\n");
  assert.ok(fs.lstatSync(retained).isFile());
  fs.unlinkSync(retained);
  descriptor(t, target, { size: 64 * 1024 + 1 });
  assert.equal(cliProvenance(report, null, retained).pass, false);
  assert.ok(!fs.existsSync(retained));
});

for (const [name, check] of [["profile.html", x1], ["signup-prototype.html", x2]] as const) {
  test(`${name} rejects an output beyond the export limit before comparing it`, { timeout: 3000 }, t => {
    const dir = temp(t);
    const repo = join(dir, "repo");
    fs.mkdirSync(repo);
    const target = join(dir, name);
    fs.writeFileSync(target, "small page");
    descriptor(t, target, { size: 50 * 1024 * 1024 + 1 });
    const ctx = { repo, cwd: repo, calls: { commands: [] }, changedFiles: () => [], doan() { assert.fail("should not compare an oversized page"); } } as unknown as CheckContext;
    assert.throws(() => check(ctx), /limit/);
  });
}

test("the fake app keeps logging an update when its linked canvas cannot be admitted", { timeout: 3000 }, async t => {
  const dir = temp(t);
  const path = ".doan/canvases/page.html";
  fs.mkdirSync(join(dir, ".doan/canvases"), { recursive: true });
  fs.writeFileSync(join(dir, "page"), "fixture");
  fs.symlinkSync("../../page", join(dir, path));
  const app = await serveFakeApp({ dir, root: dir, selection: null });
  try {
    const runtime = JSON.parse(fs.readFileSync(app.runtimePath, "utf8"));
    const update = () => new Promise<void>((resolve, reject) => {
      const socket = connect(runtime.socket);
      socket.on("error", reject).resume().on("end", resolve);
      socket.end(JSON.stringify({ v: 3, token: runtime.token, root: dir, action: "update", path, frame: "page", note: "edit" }) + "\n");
    });
    await update();
    descriptor(t, join(dir, "page"), { isFile: () => false });
    await update();
    const [first, second] = fs.readFileSync(app.workLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(first.canvas, "fixture");
    assert.equal(second.response.ok, true);
    assert.equal(second.hashes[path], null);
    assert.equal(second.canvas, null);
  } finally { await app.close(); }
});
