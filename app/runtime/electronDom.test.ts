import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Loads the helper without launching Electron: only its shutdown is checked here, with stand-in processes.
const dom: typeof import("./electronDom") = await import(new URL("./electronDom.ts", import.meta.url).href);

const exists = (path: string) => stat(path).then(() => true, () => false);
const tempDir = () => mkdtemp(join(tmpdir(), "doan-dom-test-"));
// Exits 0 on SIGTERM, as an app does when it quits; resolves once its handler is in place.
const quitting = async (): Promise<ChildProcess> => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => process.exit(0)); console.log('ready'); setInterval(() => {}, 1000)"]);
  await once(child.stdout!, "data");
  return child;
};

test("a clean close removes the temporary folder", async () => {
  const dir = await tempDir();
  const child = await quitting();
  await dom.closeElectron({ process: () => child, close: async () => { child.kill("SIGTERM"); } }, dir, 2_000);
  assert.equal(child.exitCode, 0);
  assert.equal(await exists(dir), false);
});

// A slow quit on a loaded machine is not a defect of the scripts under test: once the kill is confirmed and the folder
// is gone nothing is left behind, so the close only warns.
test("a close that fails kills the process, waits for its exit, removes the folder and only warns", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const dir = await tempDir();
  const child = await quitting();
  await dom.closeElectron({ process: () => child, close: async () => { throw new Error("close refused"); } }, dir, 2_000);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(await exists(dir), false);
  assert.match(String(warn.mock.calls[0]?.arguments.join(" ")), /close refused/);
});

test("a close that hangs is bounded, then the process is killed, the folder removed and the close only warns", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const dir = await tempDir();
  const child = await quitting();
  await dom.closeElectron({ process: () => child, close: () => new Promise(() => {}) }, dir, 200);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(await exists(dir), false);
  assert.match(String(warn.mock.calls[0]?.arguments.join(" ")), /timed out/);
});

test("a SIGKILL from outside the close is not its own kill and still fails", async () => {
  const dir = await tempDir();
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => process.kill(process.pid, 'SIGKILL')); console.log('ready'); setInterval(() => {}, 1000)"]);
  await once(child.stdout!, "data");
  await assert.rejects(dom.closeElectron({ process: () => child, close: async () => { process.kill(child.pid!, "SIGTERM"); } }, dir, 2_000), /exit cleanly/);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(await exists(dir), false);
});

test("an exit the close did not force, such as a crash on quit, still fails", async () => {
  const dir = await tempDir();
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => process.exit(3)); console.log('ready'); setInterval(() => {}, 1000)"]);
  await once(child.stdout!, "data");
  await assert.rejects(dom.closeElectron({ process: () => child, close: async () => { child.kill("SIGTERM"); } }, dir, 2_000), /exit cleanly/);
  assert.equal(child.exitCode, 3);
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
