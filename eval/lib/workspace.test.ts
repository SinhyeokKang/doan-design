import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CODEX_RULE, codexRuleText } from "./codex-rule.ts";
import { createContext, judgeMaterial, sh } from "./context.ts";
import { loadScenario } from "./scenario.ts";
import { keepOnboardingLog, prepareWorkspace } from "./workspace.ts";

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

// Codex reaches the app socket through this rule (design.md Q2); a Claude run gets the same baseline,
// so neither agent's diff or judge sees it as the agent's work.
test("every agent's baseline commits the project Codex rule Doan's agent setup writes", async () => {
  assert.equal(CODEX_RULE, ".codex/rules/doan.rules");
  for (const agent of ["claude", "codex"] as const) {
    const ws = await prepareWorkspace({ scenario: r6(), agent, cli, stub: "stub\n" });
    try {
      assert.equal(execFileSync("git", ["-C", ws.repo, "show", `${ws.seedCommit}:${CODEX_RULE}`], { encoding: "utf8" }), codexRuleText(), agent);
      assert.equal(git(ws.repo, ["status", "--porcelain"]), "", agent);
    } finally {
      await ws.dispose();
    }
  }
});

test("an onboarding script starts the fake app, and checks read its v2 exchanges", async () => {
  const onboardingValue = { providers: [{ provider: "claude", connected: true, verified: true }], changes: [], readyAfterCheck: [] };
  const ws = await prepareWorkspace({ scenario: { ...r6(), onboarding: "onboarding.json", onboardingValue }, agent: "fixture", cli, stub: "stub\n" });
  try {
    assert.notEqual(ws.app, null);
    const ctx = createContext({ repo: ws.repo, agent: "fixture", transcript: "", cli, env: ws.env, seedCommit: ws.seedCommit, onboardingLog: ws.onboardingLog });
    assert.deepEqual(ctx.onboarding(), []);
    const start = sh(cli, ["onboarding", "start", "--json"], ws.repo, ws.env);
    assert.equal(start.code, 0, start.stderr);
    const log = ctx.onboarding();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0].request, { v: 2, op: "start" });
    assert.equal(log[0].response.result.sessionId, "s_eval");
    // Kept with the run's evidence, since dispose deletes rt/.
    const out = mkdtempSync(join(root, "run-"));
    keepOnboardingLog(ws, out);
    assert.equal(readFileSync(join(out, "onboarding.jsonl"), "utf8"), readFileSync(ws.onboardingLog, "utf8"));
    assert.ok(!readFileSync(join(out, "onboarding.jsonl"), "utf8").includes(JSON.parse(readFileSync(ws.env.DOAN_RUNTIME!, "utf8")).token));
  } finally {
    await ws.dispose();
  }
});

// A correct agent must find the project set up after the app says so (agent-eval
// 2026-10-29 O1), while repo_untouched still sees only what the agent changed.
test("a successful initialize writes what doan init writes, and only the agent's edits count as changes", async () => {
  const o1 = loadScenario(join(import.meta.dirname, "../scenarios"), "O1");
  const ws = await prepareWorkspace({ scenario: o1, agent: "fixture", cli, stub: "stub\n" });
  try {
    const ctx = createContext({ repo: ws.repo, agent: "fixture", transcript: "", cli, env: ws.env, seedCommit: ws.seedCommit, onboardingLog: ws.onboardingLog, appWrites: ws.appWrites });
    const onboarding = (...args: string[]) => {
      const result = sh(cli, ["onboarding", ...args, "--json"], ws.repo, ws.env);
      assert.equal(result.code, 0, result.stdout);
    };
    onboarding("start");
    onboarding("project", "inspect", "--session", "s_eval", "--path", ws.repo, "--request", "i1");
    onboarding("status", "--session", "s_eval");
    onboarding("project", "select", "--session", "s_eval", "--inspection", "insp_1", "--path", ws.repo, "--initialize", "--request", "s1");
    assert.equal(existsSync(join(ws.repo, ".doan")), false, "nothing is written before the select succeeds");
    onboarding("status", "--session", "s_eval");
    assert.ok(statSync(join(ws.repo, ".doan/canvases")).isDirectory());
    assert.deepEqual(JSON.parse(readFileSync(join(ws.repo, ".doan/config.json"), "utf8")), { v: 1 });
    assert.ok(readFileSync(join(ws.repo, ".gitattributes"), "utf8").split("\n").includes(".doan/comments/*.jsonl merge=union"));
    const ls = sh(cli, ["ls", "--json", "--repo", ws.repo], ws.repo, ws.env);
    assert.equal(ls.code, 0, ls.stdout);
    assert.deepEqual(ctx.changedFiles(), []);
    const material = judgeMaterial(ws, ctx);
    assert.deepEqual(material.changed, []);
    assert.ok(!material.diff.includes(".doan/config.json") && !material.diff.includes(".gitattributes"), material.diff);
    writeFileSync(join(ws.repo, ".doan/config.json"), JSON.stringify({ v: 1, tokenCss: "tokens.css" }) + "\n");
    assert.deepEqual(ctx.changedFiles(), [".doan/config.json"], "an agent's edit of an app-written file still counts");
    assert.ok(judgeMaterial(ws, ctx).diff.includes(".doan/config.json"));
  } finally {
    await ws.dispose();
  }
});

test("a run without onboarding exchanges keeps no log", async () => {
  const ws = await prepareWorkspace({ scenario: r6(), agent: "fixture", cli, stub: "stub\n" });
  try {
    const out = mkdtempSync(join(root, "run-"));
    keepOnboardingLog(ws, out);
    assert.equal(existsSync(join(out, "onboarding.jsonl")), false);
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
