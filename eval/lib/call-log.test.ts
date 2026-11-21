import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { installRecorder, readCallLog } from "./call-log.ts";

test("the recorder preserves the process interface and refuses to launch without a writable row", () => {
  const base = mkdtempSync("/tmp/doan-record-");
  try {
    const cli = join(base, "real"), path = join(base, "doan"), log = join(base, "calls");
    writeFileSync(cli, `#!${process.execPath}
process.stdout.write(JSON.stringify([process.argv.slice(2), process.env]) + "\\n");
process.stdin.pipe(process.stdout);
process.stderr.write("diagnostic");
process.exitCode = 17;
`, { mode: 0o700 });
    installRecorder(path, cli, log);
    const argv = ["two words", "", "a'\\n$HOME"];
    const options = { env: { PATH: process.env.PATH, VALUE: "exact" }, input: Buffer.from([0, 255, 10]) };
    const expected = spawnSync(cli, argv, options);
    const actual = spawnSync(path, argv, options);
    assert.equal(actual.status, 17);
    assert.deepEqual(actual.stderr, expected.stderr);
    assert.deepEqual(actual.stdout, expected.stdout);
    assert.deepEqual(readCallLog(log), [{ argv, code: 17 }]);
    chmodSync(log, 0o400);
    const blocked = spawnSync(path, argv, options);
    assert.notEqual(blocked.status, 0);
    assert.equal(blocked.stdout.length, 0);
    chmodSync(log, 0o600);
    writeFileSync(log, '{"id":"pending","argv":["design-skill","audit"]}\n');
    assert.throws(() => readCallLog(log), /Incomplete/);
    rmSync(log);
    assert.throws(() => readCallLog(log));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
