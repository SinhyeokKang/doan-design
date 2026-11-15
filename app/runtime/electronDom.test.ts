import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Loads the helper without launching Electron: only its shutdown is checked here, with stand-in processes.
const dom: typeof import("./electronDom") = await import(new URL("./electronDom.ts", import.meta.url).href);

const exists = (path: string) => stat(path).then(() => true, () => false);
const tempDir = () => mkdtemp(join(tmpdir(), "doan-dom-test-"));
// Exits 0 on SIGTERM, as an app does when it quits.
const quitting = () => spawn(process.execPath, ["-e", "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)"]);

test("a clean close removes the temporary folder", async () => {
  const dir = await tempDir();
  const child = quitting();
  await dom.closeElectron({ process: () => child, close: async () => { child.kill("SIGTERM"); } }, dir, 2_000);
  assert.equal(child.exitCode, 0);
  assert.equal(await exists(dir), false);
});

test("a close that fails kills the process, waits for its exit, removes the folder and still fails", async () => {
  const dir = await tempDir();
  const child = quitting();
  await assert.rejects(dom.closeElectron({ process: () => child, close: async () => { throw new Error("close refused"); } }, dir, 2_000), /close refused/);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(await exists(dir), false);
});

test("a close that hangs is bounded, then the process is killed and the folder removed", async () => {
  const dir = await tempDir();
  const child = quitting();
  await assert.rejects(dom.closeElectron({ process: () => child, close: () => new Promise(() => {}) }, dir, 200), /timed out/);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(await exists(dir), false);
});

test("a process whose exit cannot be confirmed keeps the folder and fails", async () => {
  const dir = await tempDir();
  const stuck = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: () => false }) as unknown as ChildProcess;
  await assert.rejects(dom.closeElectron({ process: () => stuck, close: () => new Promise(() => {}) }, dir, 100), /exit unconfirmed/);
  assert.equal(await exists(dir), true);
  await dom.closeElectron(null, dir);
  assert.equal(await exists(dir), false);
});
