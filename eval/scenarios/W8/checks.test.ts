import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import checks from "./checks.ts";
import { contentHash } from "../../lib/work.ts";
import type { CheckContext, PrototypeExchange } from "../../lib/types.ts";

const path = ".doan/canvases/onboarding.html";
const command = `doan open ${path} --frame signup-phone --prototype`;
const played: PrototypeExchange = { request: { v: 6, root: "/repo", path, frame: "signup-phone", mark: "390x844" }, response: { v: 6, ok: true, played: true }, at: "now", hashes: { [path]: contentHash("canvas") } };
const failures = (commands = [command], log = [played], changed: string[] = []) => checks({
  repo: "/repo", cwd: "/repo", calls: { commands }, prototype: () => log, read: () => "canvas", changedFiles: () => changed,
} as CheckContext).filter(c => !c.pass).map(c => c.id);

test("W8 requires both a prototype invocation and accepted v6 evidence for the final canvas", () => {
  assert.deepEqual(failures(), []);
  assert.deepEqual(failures([], []), ["prototype_open_command", "app_played_prototype"]);
  assert.deepEqual(failures([command], []), ["app_played_prototype"]);
  assert.deepEqual(failures([command.replace(" --prototype", "")]), ["prototype_open_command"]);
  assert.deepEqual(failures([command], [{ ...played, hashes: { [path]: contentHash("before") } }]), ["app_played_prototype"]);
  assert.deepEqual(failures([command], [{ ...played, request: { ...played.request, frame: "signup-desktop" } }]), ["app_played_prototype"]);
  assert.deepEqual(failures([command], [{ ...played, response: { v: 6, ok: false, error: { code: "busy", message: "Busy" } } }]), ["app_played_prototype"]);
  assert.deepEqual(failures([command], [played], [path]), ["repo_unchanged"]);
});

test("W8 resolves relative canvas paths from the repository even when cwd differs", () => {
  const result = checks({ repo: "/repo", cwd: "/elsewhere", calls: { commands: [`doan --repo /repo open ${path} --frame signup-phone --prototype`] },
    prototype: () => [played], read: () => "canvas", changedFiles: () => [],
  } as CheckContext);
  assert.deepEqual(result.filter(c => !c.pass).map(c => c.id), []);
});

test("W8 accepts absolute canvas paths through a repository alias in either direction", () => {
  const dir = mkdtempSync("/tmp/doan-W8-alias-");
  try {
    mkdirSync(join(dir, "repo/.doan/canvases"), { recursive: true });
    const repo = realpathSync(join(dir, "repo"));
    writeFileSync(join(repo, path), "canvas");
    const alias = join(dir, "alias");
    symlinkSync(repo, alias);
    for (const [root, candidate] of [[repo, alias], [alias, repo]]) {
      const result = checks({ repo: root, cwd: dir, calls: { commands: [command.replace(path, join(candidate!, path))] },
        prototype: () => [{ ...played, request: { ...played.request, root: root! } }], read: () => "canvas", changedFiles: () => [],
      } as CheckContext);
      assert.deepEqual(result.filter(c => !c.pass).map(c => c.id), []);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
