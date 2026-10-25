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
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    await once(child, "spawn");
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
import { writeFile } from 'node:fs/promises';
import { suiteGuard } from ${JSON.stringify(new URL("./harness.ts", import.meta.url).href)};
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
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
      const deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
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
  await harness.closeApp({ process: () => child, close: async () => {} }, 1000);
  assert.equal(child.exitCode, 0); assert.equal(child.signalCode, null);
});
