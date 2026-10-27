import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const { isolatedEnv }: typeof import("./environment") = await import(new URL("./environment.ts", import.meta.url).href);

test("runtime launches override every user-state location without changing the parent environment", async t => {
  const dir = await mkdtemp(join(tmpdir(), "doan-runtime-env-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const before = { ...process.env }, data = join(dir, "data"), cli = join(dir, "doan");
  const env = await isolatedEnv(data, cli);
  assert.deepEqual({ ...process.env }, before);
  assert.equal(env.HOME, join(dir, "home"));
  assert.equal(env.TMPDIR, dir);
  assert.equal(env.SHELL, join(dir, "fake-shell"));
  assert.equal(env.CLAUDE_CONFIG_DIR, join(dir, "home/.claude"));
  assert.equal(env.CODEX_HOME, join(dir, "home/.codex"));
  assert.equal(env.DOAN_RUNTIME, join(data, "runtime.json"));
  assert.equal(env.DOAN_CLI, cli);
  assert.equal((await stat(env.SHELL!)).mode & 0o777, 0o755);
  assert.equal(await readFile(join(data, "onboarding.json"), "utf8"), "{}\n");
});
