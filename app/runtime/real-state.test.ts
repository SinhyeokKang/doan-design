import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

for (const relative of ["sessions.jsonl", "conversations/index.json", "conversations/start-undo.json", "conversations/nested/session.jsonl", "agent-auth/vault/cursor.bin"]) {
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
