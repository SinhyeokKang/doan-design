import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createContext, judgeMaterial, sh } from "./context.ts";
import { loadScenario } from "./scenario.ts";
import { prepareWorkspace } from "./workspace.ts";

const root = mkdtempSync(join(tmpdir(), "doan-workspace-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
// R6 has a seed with comments and no selection; only `worktree` differs between the cases.
const r6 = () => loadScenario(join(import.meta.dirname, "../scenarios"), "R6");
const git = (dir: string, args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

test("without worktree the agent works in the instruction's root", async () => {
  const ws = await prepareWorkspace({ scenario: r6(), agent: "fixture", cli, stub: "stub\n" });
  try {
    assert.equal(ws.cwd, ws.repo);
    assert.equal(ws.app, null);
  } finally {
    await ws.dispose();
  }
});

test("worktree runs the agent in a second worktree of the seed commit while the app has the first open", async () => {
  const ws = await prepareWorkspace({ scenario: { ...r6(), worktree: { branch: "feat-plan-copy" } }, agent: "fixture", cli, stub: "stub\n" });
  try {
    assert.equal(ws.cwd, join(ws.base, "worktree"));
    assert.equal(git(ws.repo, ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
    assert.equal(git(ws.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]), "feat-plan-copy");
    assert.equal(git(ws.cwd, ["rev-parse", "HEAD"]), ws.seedCommit);
    assert.equal(git(ws.cwd, ["status", "--porcelain"]), "");
    assert.ok(existsSync(join(ws.cwd, ".doan/canvases/profile.html")));
    assert.ok(existsSync(join(ws.cwd, ".claude/skills/doan/SKILL.md")));
    // The fake app compares root literally, so only the first worktree is open in it.
    const active = (repo: string) => sh(cli, ["active", "--json", "--repo", repo], repo, ws.env);
    const fromCwd = active(ws.cwd);
    assert.equal(fromCwd.code, 3, fromCwd.stdout);
    assert.equal(JSON.parse(fromCwd.stdout).error.code, "project_not_open");
    const fromRoot = active(ws.repo);
    assert.equal(fromRoot.code, 0, fromRoot.stdout);
    assert.equal(JSON.parse(fromRoot.stdout).result.selection, undefined);
  } finally {
    await ws.dispose();
  }
  assert.equal(existsSync(ws.base), false);
});

test("checks and the judge see changes in each worktree separately", async () => {
  const ws = await prepareWorkspace({ scenario: { ...r6(), worktree: { branch: "feat-plan-copy" } }, agent: "fixture", cli, stub: "stub\n" });
  try {
    const ctx = createContext({ repo: ws.repo, cwd: ws.cwd, agent: "fixture", transcript: "", cli, env: ws.env, seedCommit: ws.seedCommit });
    assert.equal(ctx.cwd, ws.cwd);
    writeFileSync(join(ws.cwd, ".doan/canvases/profile.html"), "changed in the agent's worktree\n");
    assert.deepEqual(ctx.changedFiles(), []);
    assert.deepEqual(ctx.cwdChangedFiles(), [".doan/canvases/profile.html"]);
    writeFileSync(join(ws.repo, "notes.md"), "changed in the root\n");
    assert.deepEqual(ctx.changedFiles(), ["notes.md"]);
    assert.deepEqual(ctx.cwdChangedFiles(), [".doan/canvases/profile.html"]);
    const { changed, diff } = judgeMaterial(ws, ctx);
    assert.deepEqual(changed, ["notes.md", "(working directory) .doan/canvases/profile.html"]);
    assert.match(diff, /changed in the root/);
    assert.match(diff, /changed in the agent's worktree/);
    // Without a second worktree both views are the repo.
    const plain = createContext({ repo: ws.repo, agent: "fixture", transcript: "", cli, env: ws.env, seedCommit: ws.seedCommit });
    assert.equal(plain.cwd, ws.repo);
    assert.deepEqual(plain.cwdChangedFiles(), ["notes.md"]);
  } finally {
    await ws.dispose();
  }
});

test("canvas-only seeds are initialized even though .doan already exists", async () => {
  const scenario = loadScenario(join(import.meta.dirname, "../scenarios"), "_example");
  const ws = await prepareWorkspace({ scenario, agent: "fixture", cli, stub: "stub\n" });
  try {
    assert.ok(existsSync(join(ws.repo, ".doan/config.json")));
    assert.equal(sh(cli, ["check", "--json", "--repo", ws.repo], ws.repo, ws.env).code, 0);
  } finally { await ws.dispose(); }
});
