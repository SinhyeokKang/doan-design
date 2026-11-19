import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
const harness: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);

test("observation rejection is retried, persistent rejection is preserved, false times out", async () => {
  const failure = new Error("frame detached"); let tries = 0;
  await harness.waitFor(async () => { if (++tries === 1) throw failure; return true; }, "reattached", 50, 1);
  assert.equal(tries, 2);
  await assert.rejects(harness.waitFor(async () => { throw failure; }, "broken", 10, 1), error => error === failure);
  await assert.rejects(harness.waitFor(async () => false, "missing", 10, 1), /missing/);
});

test("a crash is not a successful close even after state has persisted", async () => {
  const root = await mkdtemp("/tmp/doan-close-test-");
  try {
    await writeFile(join(root, "ui-state.json"), '{"screen":"home"}');
    // "spawn" fires before node has started; a child still starting is busy on a CPU, and under load its
    // SIGTERM exit can outlast the 100 ms bound, so wait until it is idle.
    const child = spawn(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "ignore"] });
    await once(child.stdout, "data");
    await assert.rejects(harness.closeApp({ process: () => child, close: async () => { child.kill("SIGTERM"); } }, 100), /SIGTERM/);
    assert.equal(await readFile(join(root, "ui-state.json"), "utf8"), '{"screen":"home"}');
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const mode of ["suite-hang", "close-hang", "verify-hang"]) {
  test(`${mode} exits nonzero after bounded cleanup and records real-state verification`, async () => {
    const root = await mkdtemp("/tmp/doan-harness-test-");
    try {
      const marker = join(root, "cleanup"), source = join(root, "run.mjs");
      await writeFile(source, `
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { suiteGuard } from ${JSON.stringify(new URL("./harness.ts", import.meta.url).href)};
// A child still starting node is busy on a CPU, and on a loaded machine its SIGKILL exit can take longer than
// the 20 ms forced-exit bound; the guard starts only once the child is idle, as a launched app is.
const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'ignore'] });
await once(child.stdout, 'data');
const guard = suiteGuard({ name: 'fixture', timeoutMs: 100, closeMs: 20, verifyMs: 30,
  app: () => ({ process: () => child, close: () => new Promise(() => {}) }),
  verify: async () => { console.error('fixture verification attempted'); ${mode === "verify-hang" ? "await new Promise(() => {});" : ""} },
  cleanup: async () => { if (child.exitCode === null && child.signalCode === null) throw new Error('cleanup before exit'); await writeFile(${JSON.stringify(marker)}, 'settled'); }
});
${mode === "suite-hang" ? "await new Promise(() => {});" : "try { await guard.finish(); console.log('PASS'); } catch (error) { console.error(error); process.exitCode = 1; }"}
`);
      const child = spawn(process.execPath, [source], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
      // Only a hang guard: starting node and loading harness.ts can take seconds on a loaded machine.
      const deadline = setTimeout(() => child.kill("SIGKILL"), 20_000);
      const [code, signal] = await once(child, "exit"); clearTimeout(deadline);
      assert.equal(code, 1, output); assert.equal(signal, null, output);
      assert.match(output, /fixture verification attempted/);
      assert.match(output, mode === "verify-hang" ? /verification incomplete/ : /real-state verification passed/);
      assert.doesNotMatch(output, /PASS/);
      assert.equal(await readFile(marker, "utf8"), "settled");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test("normal close waits for exit code zero even when close resolves earlier", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 40)"]);
  // The bound covers the child's whole node startup, which takes seconds on a loaded runner; it is only a hang guard.
  await harness.closeApp({ process: () => child, close: async () => {} }, 20_000);
  assert.equal(child.exitCode, 0); assert.equal(child.signalCode, null);
});

test("cleanup retains the child handle after Playwright disposes its process accessor", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 40)"]);
  let disposed = false, cleaned = false;
  const app = { process: () => { if (disposed) throw new Error("disposed dispatcher"); return child; }, close: async () => { await once(child, "exit"); disposed = true; } };
  // The watchdog and the close bound start before the child's node has started, and the watchdog's expiry exits
  // the whole test file; this test pins the retained handle, not either expiry, so both are only hang guards.
  const guard = harness.suiteGuard({ name: "disposed-fixture", timeoutMs: 30_000, closeMs: 20_000, app: () => app, verify: async () => {}, cleanup: async () => { cleaned = true; } });
  await assert.doesNotReject(guard.finish()); assert.equal(cleaned, true);
});
