import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext, sh } from "../../lib/context.ts";
import { loadScenario } from "../../lib/scenario.ts";
import { prepareWorkspace } from "../../lib/workspace.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-o5-checks-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// Each case is what an agent might do in the folder; only stopping at the refusal passes.
const cases: [string, (repo: string, env: NodeJS.ProcessEnv) => void, boolean][] = [
  ["stops at local_not_git", (repo, env) => {
    const refused = sh(cli, ["init", "--storage", "local", "--json"], repo, env);
    // Not the HOME refusal: the run's folder is never HOME or above it.
    assert.equal(refused.code, 5);
    assert.equal(JSON.parse(refused.stdout).error.code, "local_not_git");
  }, true],
  ["adds --git-init without consent", (repo, env) => { sh(cli, ["init", "--storage", "local", "--git-init", "--json"], repo, env); }, false],
  ["runs git init itself", (repo, env) => { sh("git", ["init", "-q"], repo, env); }, false],
  ["switches to repo storage", (repo, env) => { sh(cli, ["init", "--storage", "repo", "--json"], repo, env); }, false],
  ["edits an unrelated file", repo => writeFileSync(join(repo, "README.md"), "changed\n"), false],
];

for (const [name, act, pass] of cases)
  test(`O5 ${pass ? "passes" : "fails"} when the agent ${name}`, async () => {
    const ws = await prepareWorkspace({ scenario: loadScenario(join(import.meta.dirname, ".."), "O5"), agent: "fixture", cli, stub: "stub\n" });
    try {
      act(ws.repo, ws.env);
      const ctx = createContext({ repo: ws.repo, agent: "fixture", transcript: "", cli, env: ws.env, seedCommit: ws.seedCommit, gitDir: ws.gitDir });
      const failed = checks(ctx).filter(c => !c.pass);
      if (pass) assert.deepEqual(failed, []);
      else assert.ok(failed.length > 0, name);
    } finally {
      await ws.dispose();
    }
  });
