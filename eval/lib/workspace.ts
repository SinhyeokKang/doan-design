import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type { Agent } from "./args.ts";
import { sh } from "./context.ts";
import { assertOutsideCheckout } from "./isolate.ts";
import type { LoadedScenario } from "./scenario.ts";
import { startFakeApp, type FakeApp } from "./socket.ts";

export interface Workspace {
  // `/tmp/doan-eval-<id>-<agent>-XXXXXX/`: repo/, bin/doan, rt/ (runtime file and socket),
  // and worktree/ when the scenario sets `worktree`.
  base: string;
  // The instruction's root and the root the fake app has open.
  repo: string;
  // Where the agent runs: `repo`, or the second worktree.
  cwd: string;
  env: NodeJS.ProcessEnv;
  seedCommit: string;
  app: FakeApp | null;
  dispose(): Promise<void>;
}

// Identity and signing come from flags so a run never depends on, or writes to, the user's git config.
// core.hooksPath: --no-verify does not stop a global post-commit hook.
const GIT = ["-c", "core.hooksPath=/dev/null", "-c", "user.name=doan-eval", "-c", "user.email=eval@doan.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

function must(result: { code: number; stdout: string; stderr: string }, what: string): string {
  if (result.code !== 0) throw new Error(`${what} failed (${result.code}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

// Builds the starting repo outside any checkout: seed, `doan init` when the
// scenario asks and the seed has no .doan/config.json, the discovery stub at repo level
// only, then one baseline commit. init output and the stub are in that commit
// so changedFiles() reports only what the agent did.
export async function prepareWorkspace(o: { scenario: LoadedScenario; agent: Agent | "fixture"; cli: string; stub: string }): Promise<Workspace> {
  // /tmp keeps the socket path under macOS's 104-byte sun_path limit.
  const base = realpathSync(mkdtempSync(`/tmp/doan-eval-${o.scenario.id}-${o.agent}-`));
  try {
    assertOutsideCheckout(base);
    const repo = join(base, "repo");
    cpSync(join(o.scenario.dir, "seed"), repo, { recursive: true });
    mkdirSync(join(base, "bin"));
    if (o.scenario.shellCli) symlinkSync(o.cli, join(base, "bin/doan"));
    const inheritedPath = (process.env.PATH ?? "").split(delimiter);
    // Removing an entire PATH directory would also hide colocated agents/tools.
    // Substitute only those directories containing doan, preserving PATH order.
    const path = o.scenario.shellCli ? inheritedPath : inheritedPath.map((entry, index) => {
      const source = resolve(entry || ".");
      if (!existsSync(join(source, "doan"))) return entry;
      const filtered = join(base, `path-${index}`);
      mkdirSync(filtered);
      for (const name of readdirSync(source))
        if (name !== "doan") symlinkSync(join(source, name), join(filtered, name));
      return filtered;
    });
    mkdirSync(join(base, "rt"), { mode: 0o700 });
    const env = { ...process.env, PATH: [join(base, "bin"), ...path].join(delimiter), DOAN_RUNTIME: join(base, "rt/runtime.json") };
    if (o.scenario.mcp && o.agent === "claude") {
      writeFileSync(join(base, "mcp.json"), JSON.stringify({ mcpServers: { doan: { command: o.cli, args: ["mcp"], env: { DOAN_RUNTIME: env.DOAN_RUNTIME } } } }) + "\n");
    }
    const git = (args: string[]) => must(sh("git", [...GIT, "-C", repo, ...args], repo, env), `git ${args[0]}`);
    git(["init", "-q"]);
    if (o.scenario.init && !existsSync(join(repo, ".doan/config.json")))
      must(sh(o.cli, ["init", "--json", "--repo", repo, "--token-css", join(repo, o.scenario.init.tokenCss)], repo, env), "doan init");
    for (const dir of [".claude", ".agents"]) {
      mkdirSync(join(repo, dir, "skills/doan"), { recursive: true });
      writeFileSync(join(repo, dir, "skills/doan/SKILL.md"), o.stub);
    }
    // -f: a seed .gitignore or the user's global excludes must not keep seed files out of the baseline.
    git(["add", "-A", "-f"]);
    git(["commit", "-q", "--no-verify", "-m", "seed"]);
    const seedCommit = git(["rev-parse", "HEAD"]).trim();
    let cwd = repo;
    if (o.scenario.worktree) {
      cwd = join(base, "worktree");
      git(["worktree", "add", "-q", "-b", o.scenario.worktree.branch, cwd]);
    }
    // A worktree scenario stands for an instruction copied from the running app,
    // so the app is up even without a selection; `doan active` from the second
    // worktree then gets project_not_open.
    const app = o.scenario.selectionValue || o.scenario.worktree
      ? await startFakeApp({ dir: join(base, "rt"), root: repo, selection: o.scenario.selectionValue ? { root: repo, ...o.scenario.selectionValue } : null })
      : null;
    return {
      base, repo, cwd, env, seedCommit, app,
      async dispose() {
        await app?.close();
        rmSync(base, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(base, { recursive: true, force: true });
    throw error;
  }
}

export function copyRepo(repo: string, dest: string): void {
  const git = join(repo, ".git");
  cpSync(repo, dest, { recursive: true, verbatimSymlinks: true, filter: source => source !== git && !source.startsWith(`${git}/`) });
}
