import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent } from "./args.ts";
import { sh } from "./context.ts";
import { assertOutsideCheckout } from "./isolate.ts";
import type { LoadedScenario } from "./scenario.ts";
import { startFakeApp, type FakeApp } from "./socket.ts";

export interface Workspace {
  // `/tmp/doan-eval-<id>-<agent>-XXXXXX/`: repo/, bin/doan, rt/ (runtime file and socket).
  base: string;
  repo: string;
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
// scenario asks and the seed has no .doan/, the discovery stub at repo level
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
    symlinkSync(o.cli, join(base, "bin/doan"));
    mkdirSync(join(base, "rt"), { mode: 0o700 });
    const env = { ...process.env, PATH: `${join(base, "bin")}:${process.env.PATH ?? ""}`, DOAN_RUNTIME: join(base, "rt/runtime.json") };
    const git = (args: string[]) => must(sh("git", [...GIT, "-C", repo, ...args], repo, env), `git ${args[0]}`);
    git(["init", "-q"]);
    if (o.scenario.init && !existsSync(join(repo, ".doan")))
      must(sh(o.cli, ["init", "--json", "--repo", repo, "--token-css", join(repo, o.scenario.init.tokenCss)], repo, env), "doan init");
    for (const dir of [".claude", ".agents"]) {
      mkdirSync(join(repo, dir, "skills/doan"), { recursive: true });
      writeFileSync(join(repo, dir, "skills/doan/SKILL.md"), o.stub);
    }
    // -f: a seed .gitignore or the user's global excludes must not keep seed files out of the baseline.
    git(["add", "-A", "-f"]);
    git(["commit", "-q", "--no-verify", "-m", "seed"]);
    const seedCommit = git(["rev-parse", "HEAD"]).trim();
    const app = o.scenario.selectionValue
      ? await startFakeApp({ dir: join(base, "rt"), root: repo, selection: { root: repo, ...o.scenario.selectionValue } })
      : null;
    return {
      base, repo, env, seedCommit, app,
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
