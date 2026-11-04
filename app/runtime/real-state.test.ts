import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

for (const relative of ["agent-setup.json", "sessions.jsonl", "conversations/index.json", "conversations/start-undo.json", "conversations/nested/session.jsonl", "agent-auth/vault/cursor.bin"]) {
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
for (const relative of [".local/share/doan/current", ".codex/rules/doan.rules", ".gemini/config/skills/doan", ".cursor/skills/doan", ".copilot/skills/doan"]) {
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
