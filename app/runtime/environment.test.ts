import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const { isolatedEnv }: typeof import("./environment") = await import(new URL("./environment.ts", import.meta.url).href);
const { classifyCompletion }: typeof import("../src/main/onboarding/completion") = await import(new URL("../src/main/onboarding/completion.ts", import.meta.url).href);

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
  // The app's own classifier decides; the legacy `{}` no longer ends first run.
  assert.deepEqual(classifyCompletion(await readFile(join(data, "onboarding.json"), "utf8")), { kind: "complete", projectRoot: env.HOME });
});

test("runtime launches inherit only an allowlist, never provider credentials or profile overrides", async t => {
  const dir = await mkdtemp(join(tmpdir(), "doan-runtime-env-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const names = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "CURSOR_API_KEY", "GEMINI_API_KEY", "GH_TOKEN", "GITHUB_TOKEN",
    "COPILOT_GITHUB_TOKEN", "COPILOT_HOME", "XDG_CONFIG_HOME", "AGENT_CLI_CREDENTIAL_STORE", "AGY_ADC_AUTH"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; });
  for (const name of names) process.env[name] = "external";
  const env = await isolatedEnv(join(dir, "data"), join(dir, "doan"));
  for (const name of names) assert.equal(env[name], undefined, name);
  assert.equal(env.PATH, process.env.PATH);
});
