import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

for (const relative of ["agent-setup.json", "sessions.jsonl", "conversations/index.json", "conversations/start-undo.json", "conversations/nested/session.jsonl", "agent-auth/vault/cursor.bin",
  "preferences.json", "auto-folders.json", "canvas-seen.json", "mcp-connectors.json", "mcp-connectors-pending.json", "star-prompt.json", "attachments/0f4e/pasted.png"]) {
  for (const mutation of ["create", "modify", "remove"]) {
    test(`real-state detects ${mutation} of ${relative} in a simulated HOME`, async () => {
      const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
      try {
        const source = join(home, "fixture.mjs");
        await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const path = join(process.env.HOME, 'Library/Application Support/doan', ${JSON.stringify(relative)});
await mkdir(dirname(path), {recursive:true});
if (${JSON.stringify(mutation)} !== 'create') await writeFile(path, 'before');
const before = await realState();
await assertRealState(before);
if (${JSON.stringify(mutation)} === 'remove') await unlink(path);
else await writeFile(path, 'after');
await assert.rejects(assertRealState(before), /real onboarding state changed/);
`);
        const result = await promisify(execFile)(process.execPath, [source], {
          env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
          timeout: 15_000,
        });
        assert.equal(result.stderr, "");
      } finally { await rm(home, { recursive: true, force: true }); }
    });
  }
}

for (const relative of [".cursor/auth.json", ".codex/auth.json", ".copilot/config.json"]) {
  test(`real-state detects a provider credential change at ~/${relative} without reading it`, async () => {
    const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
    try {
      const source = join(home, "fixture.mjs");
      await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const path = join(process.env.HOME, ${JSON.stringify(relative)});
await mkdir(dirname(path), {recursive:true});
await writeFile(path, 'secret-before');
const before = await realState();
assert.ok(!JSON.stringify(before).includes('secret-before'));
await assertRealState(before);
await writeFile(path, 'secret-after-longer');
await assert.rejects(assertRealState(before), /real onboarding state changed/);
`);
      const result = await promisify(execFile)(process.execPath, [source], {
        env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
        timeout: 15_000,
      });
      assert.equal(result.stderr, "");
    } finally { await rm(home, { recursive: true, force: true }); }
  });
}

// Launching the packaged app writes agent setup into HOME, so a probe that misses isolation must fail on these too.
for (const relative of [".local/share/doan/current", ".codex/rules/doan.rules", ".gemini/config/skills/doan"]) {
  test(`real-state detects agent setup creating ~/${relative} in a simulated HOME`, async () => {
    const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
    try {
      const source = join(home, "fixture.mjs");
      await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const path = join(process.env.HOME, ${JSON.stringify(relative)});
await mkdir(dirname(path), {recursive:true});
const before = await realState();
await assertRealState(before);
await symlink('/Applications/Doan.app/Contents/Resources', path);
await assert.rejects(assertRealState(before), /real onboarding state changed/);
`);
      const result = await promisify(execFile)(process.execPath, [source], {
        env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
        timeout: 15_000,
      });
      assert.equal(result.stderr, "");
    } finally { await rm(home, { recursive: true, force: true }); }
  });
}

// MCP connector probes must show the person's own terminal servers untouched, not only a server named `doan`.
for (const [relative, before, after] of [
  [".claude.json", '{"mcpServers":{"malmoi":{"type":"http","url":"https://example.com/mcp"}}}', '{"mcpServers":{"malmoi":{"type":"http","url":"https://example.com/mcp"},"notion":{"type":"http","url":"https://mcp.notion.com/mcp"}}}'],
  [".codex/config.toml", '[mcp_servers.malmoi]\nurl = "https://example.com/mcp"\n', '[mcp_servers.malmoi]\nurl = "https://example.com/other"\n'],
]) {
  test(`real-state detects a change to a non-doan MCP server in ~/${relative}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
    try {
      const source = join(home, "fixture.mjs");
      await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const path = join(process.env.HOME, ${JSON.stringify(relative)});
await mkdir(dirname(path), {recursive:true});
await writeFile(path, ${JSON.stringify(before)});
const before = await realState();
await assertRealState(before);
await writeFile(path, ${JSON.stringify(after)});
await assert.rejects(assertRealState(before), /real onboarding state changed/);
`);
      const result = await promisify(execFile)(process.execPath, [source], {
        env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
        timeout: 15_000,
      });
      assert.equal(result.stderr, "");
    } finally { await rm(home, { recursive: true, force: true }); }
  });
}

// Every location agent setup writes must be watched, so a target added to the plan without a fingerprint fails here.
test("real-state fingerprints every agent setup target the plan writes", async () => {
  const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
  try {
    const source = join(home, "fixture.mjs");
    await writeFile(source, `
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { realState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
// app/src imports omit the extension (Vite resolves them; Node does not).
registerHooks({ resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.includes('/app/src/')) return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { plannedTargets } = await import(${JSON.stringify(new URL("../src/main/agentSetup/plan.ts", import.meta.url).href)});
const watched = Object.keys(await realState()).map(key => key.replace(/:[^/]*$/, ''));
for (const { path } of plannedTargets(process.env.HOME, '/Applications/Doan.app/Contents/Resources', ['claude', 'codex', 'gemini'], true))
  assert.ok(watched.some(root => path === root || path.startsWith(root + '/')), path + ' is not in the real-state snapshot');
`);
    const result = await promisify(execFile)(process.execPath, [source], {
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
      timeout: 15_000,
    });
    assert.equal(result.stderr, "");
  } finally { await rm(home, { recursive: true, force: true }); }
});

// The person's Claude Code rewrites settings.json on its own, so only Doan's allow rules are compared. Both the default
// directory and a CLAUDE_CONFIG_DIR profile are watched.
for (const configDir of [".claude", "profile/claude"]) {
  for (const [label, before, after, changed] of [
    ["adding Doan's allow rules", '{"permissions":{"allow":["Bash(ls *)"]}}', '{"permissions":{"allow":["Bash(ls *)","Bash(doan work start *)","Bash(doan work done *)","Bash(doan open *)","Bash(doan work update *)"]}}', true],
    ["creating the file with Doan's allow rules", null, '{\n  "permissions": {\n    "allow": ["Bash(doan work start *)"]\n  }\n}\n', true],
    ["removing a Doan allow rule", '{"permissions":{"allow":["Bash(doan open *)","Bash(doan work done *)"]}}', '{"permissions":{"allow":["Bash(doan open *)"]}}', true],
    ["the person's own settings change", '{"model":"opus","permissions":{"allow":["Bash(doan open *)"]}}', '{"model":"sonnet","theme":"dark","permissions":{"allow":["Bash(doan open *)","Bash(git *)"]}}', false],
  ] as const) {
    test(`real-state ${changed ? "detects" : "ignores"} ${label} in ${configDir}/settings.json`, async () => {
      const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
      try {
        const source = join(home, "fixture.mjs");
        await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const dir = join(process.env.HOME, ${JSON.stringify(configDir)});
await mkdir(dir, {recursive:true});
const before = ${JSON.stringify(before)};
if (before !== null) await writeFile(join(dir, 'settings.json'), before);
const state = await realState();
await assertRealState(state);
await writeFile(join(dir, 'settings.json'), ${JSON.stringify(after)});
${changed ? "await assert.rejects(assertRealState(state), /real onboarding state changed/);" : "await assertRealState(state);"}
`);
        const result = await promisify(execFile)(process.execPath, [source], {
          env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, configDir), CODEX_HOME: join(home, ".codex") },
          timeout: 15_000,
        });
        assert.equal(result.stderr, "");
      } finally { await rm(home, { recursive: true, force: true }); }
    });
  }
}

// A probe that launches another copy of the app (a PoC build, an unisolated dev run) creates its own userData folder
// beside Doan's.
test("real-state detects a sibling Application Support/doan* folder appearing", async () => {
  const home = await mkdtemp(join(tmpdir(), "doan-state-fixture-"));
  try {
    const source = join(home, "fixture.mjs");
    await writeFile(source, `
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { realState, assertRealState } from ${JSON.stringify(new URL("./real-state.ts", import.meta.url).href)};
const support = join(process.env.HOME, 'Library/Application Support');
await mkdir(join(support, 'doan'), {recursive:true});
await mkdir(join(support, 'Other App'), {recursive:true});
const before = await realState();
await assertRealState(before);
await mkdir(join(support, 'Unrelated'));
await assertRealState(before);
await mkdir(join(support, 'doan-notify-poc'));
await assert.rejects(assertRealState(before), /real onboarding state changed/);
`);
    const result = await promisify(execFile)(process.execPath, [source], {
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") },
      timeout: 15_000,
    });
    assert.equal(result.stderr, "");
  } finally { await rm(home, { recursive: true, force: true }); }
});
