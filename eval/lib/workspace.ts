import { installRecorder } from "./call-log.ts";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { LOG_BYTES, readArtifact } from "./artifact.ts";
import type { Agent } from "./args.ts";
import { agentEnvironment, isolateUserInstructions } from "./agent.ts";
import { CLAUDE_ALLOW_RULES, CODEX_RULE, evalCodexRuleText } from "./codex-rule.ts";
import { sh } from "./context.ts";
import { watchCanvasDirs } from "./canvas-watch.ts";
import { assertOutsideCheckout } from "./isolate.ts";
import type { LoadedScenario } from "./scenario.ts";
import { APP_WRITES, startFakeApp, type FakeApp } from "./socket.ts";

export interface Workspace {
  // `/tmp/doan-eval-<id>-<agent>-XXXXXX/`: repo/, bin/doan, rt/ (runtime file and socket),
  // and worktree/ when the scenario sets `worktree`.
  base: string;
  // A Codex run's own CODEX_HOME (isolateUserInstructions); null for any other agent.
  codexHome: string | null;
  // The instruction's root and the root the fake app has open.
  repo: string;
  // Where the agent runs: `repo`, or the second worktree.
  cwd: string;
  env: NodeJS.ProcessEnv;
  seedCommit: string;
  // The baseline's Git directory when the scenario sets `git: false`, outside `repo` so the
  // CLI and the agent find no repository there; null when the baseline is `repo/.git`.
  gitDir: string | null;
  app: FakeApp | null;
  // The fake app's app-socket v2 exchanges (eval/lib/socket.ts); absent until the first one.
  onboardingLog: string;
  doanLog?: string | undefined;
  workLog: string;
  openLog: string;
  handoffLog: string;
  prototypeLog: string;
  // Files the fake app wrote into `repo` with their content; absent until it writes one.
  appWrites: string;
  // Names reported under `repo`'s canvas directories after the baseline (canvas-watch.ts).
  canvasLog: string;
  // Lets the last reports arrive and ends the watch; call it once the agent or fixture has finished writing.
  stopCanvasWatch(): Promise<void>;
  dispose(): Promise<void>;
}

// Identity and signing come from flags so a run never depends on, or writes to, the user's git config.
// core.hooksPath: --no-verify does not stop a global post-commit hook.
const GIT = ["-c", "core.hooksPath=/dev/null", "-c", "user.name=doan-eval", "-c", "user.email=eval@doan.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

function must(result: { code: number; stdout: string; stderr: string }, what: string): string {
  if (result.code !== 0) throw new Error(`${what} failed (${result.code}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

// A new directory no Codex agent's shell can write: Codex's workspace-write sandbox opens the agent's folder, /tmp and
// $TMPDIR to it (codex-cli 0.169.0 `codex sandbox -P :workspace`), but not /var/tmp. The two lanes run side by side, so
// this covers every Codex home of a round, a judge's included. A short path, because Codex binds ipc/ipc.sock in it.
export function outsideCodexSandbox(prefix: string): string {
  return realpathSync(mkdtempSync(`/var/tmp/${prefix}`));
}

// Builds the starting repo outside any checkout: seed, `doan init` when the
// scenario asks and the seed has no .doan/config.json, the discovery stub at repo level
// only, the Codex rule, then one baseline commit. init output, the stub and the rule
// are in that commit so changedFiles() reports only what the agent did.
export async function prepareWorkspace(o: { scenario: LoadedScenario; agent: Agent | "fixture"; cli: string; stub: string }): Promise<Workspace> {
  // /tmp keeps the socket path under macOS's 104-byte sun_path limit.
  const base = realpathSync(mkdtempSync(`/tmp/doan-eval-${o.scenario.id}-${o.agent}-`));
  let codexHome: string | null = null;
  // An open watch would keep the runner alive after a failed setup.
  let canvasWatch: Awaited<ReturnType<typeof watchCanvasDirs>> | null = null;
  try {
    assertOutsideCheckout(base);
    const repo = join(base, "repo");
    cpSync(join(o.scenario.dir, "seed"), repo, { recursive: true });
    mkdirSync(join(base, "bin"));
    const doanLog = o.scenario.shellCli ? join(base, "doan-calls.jsonl") : undefined;
    if (doanLog) installRecorder(join(base, "bin/doan"), o.cli, doanLog);
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
    // The key the app puts in a conversation's environment; the fake app knows the same one.
    const handoff = o.scenario.handoff ? { key: randomBytes(32).toString("hex"), canvas: o.scenario.handoff.canvas } : null;
    const shared = { ...agentEnvironment(process.env), PATH: [join(base, "bin"), ...path].join(delimiter), DOAN_RUNTIME: join(base, "rt/runtime.json"), ...(handoff ? { DOAN_HANDOFF: handoff.key } : {}) };
    // Codex itself, outside its sandbox, writes refreshed tokens through this home's links and reads instructions and
    // settings there, and the rollout read as evidence lives there, so the agent must not be able to rewrite it.
    if (o.agent === "codex") codexHome = outsideCodexSandbox("doan-eval-codex-");
    // Codex loads the run's project rule only in a trusted project. Trusting the first worktree also covers a second one
    // (codex-cli 0.169.0 probe), so the repo is the only folder trusted.
    const env = o.agent === "fixture" ? shared : isolateUserInstructions(o.agent, shared, codexHome ?? join(base, "codex-home"), [repo]);
    const gitDir = o.scenario.git ? null : join(base, "seed.git");
    const git = (args: string[]) => must(sh("git", [...GIT, "-C", repo, ...(gitDir ? ["--git-dir", gitDir, "--work-tree", repo] : []), ...args], repo, env), `git ${args[0]}`);
    if (gitDir) must(sh("git", [...GIT, "init", "-q", "--bare", gitDir], base, env), "git init");
    else git(["init", "-q"]);
    if (o.scenario.init && !existsSync(join(repo, ".doan/config.json")))
      must(sh(o.cli, ["init", "--json", "--repo", repo, "--token-css", join(repo, o.scenario.init.tokenCss)], repo, env), "doan init");
    for (const dir of [".claude", ".agents"]) {
      mkdirSync(join(repo, dir, "skills/doan"), { recursive: true });
      writeFileSync(join(repo, dir, "skills/doan/SKILL.md"), o.stub);
    }
    // Codex runs `doan` outside its workspace-write sandbox only through this rule, as
    // agent setup arranges for users; the app socket is outside that sandbox.
    mkdirSync(join(repo, ".codex/rules"), { recursive: true });
    writeFileSync(join(repo, CODEX_RULE), evalCodexRuleText());
    // Project settings keep the terminal-work permissions inside this disposable run.
    writeFileSync(join(repo, ".claude/settings.json"), JSON.stringify({ permissions: { allow: CLAUDE_ALLOW_RULES } }, null, 2) + "\n");
    // -f: a seed .gitignore or the user's global excludes must not keep seed files out of the baseline.
    git(["add", "-A", "-f"]);
    git(["commit", "-q", "--no-verify", "-m", "seed"]);
    const seedCommit = git(["rev-parse", "HEAD"]).trim();
    // `repo` is the root the app would list; a worktree scenario's second checkout is not watched.
    const canvasLog = join(base, "rt/canvas-names.jsonl");
    const watch = canvasWatch = await watchCanvasDirs(repo, canvasLog);
    let cwd = repo;
    if (o.scenario.worktree) {
      cwd = join(base, "worktree");
      git(["worktree", "add", "-q", "-b", o.scenario.worktree.branch, cwd]);
    }
    // A worktree scenario stands for an instruction copied from the running app,
    // so the app is up even without a selection; `doan active` from the second
    // worktree then gets project_not_open.
    const app = o.scenario.selectionValue || o.scenario.worktree || o.scenario.onboardingValue || handoff || o.scenario.workOthers
      ? await startFakeApp({ dir: join(base, "rt"), root: repo, selection: o.scenario.selectionValue ? { root: repo, ...o.scenario.selectionValue } : null, onboarding: o.scenario.onboardingValue, workOthers: o.scenario.workOthers, handoff })
      : null;
    return {
      base, codexHome, repo, cwd, env, doanLog, seedCommit, gitDir, app, onboardingLog: join(base, "rt/onboarding.jsonl"), workLog: join(base, "rt/work.jsonl"), openLog: join(base, "rt/open.jsonl"), handoffLog: join(base, "rt/handoff.jsonl"), prototypeLog: join(base, "rt/prototype.jsonl"), appWrites: join(base, "rt", APP_WRITES), canvasLog,
      stopCanvasWatch: () => watch.stop(),
      async dispose() {
        await watch.stop();
        await app?.close();
        rmSync(base, { recursive: true, force: true });
        if (codexHome) rmSync(codexHome, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await canvasWatch?.stop();
    rmSync(base, { recursive: true, force: true });
    if (codexHome) rmSync(codexHome, { recursive: true, force: true });
    throw error;
  }
}

// dispose deletes rt/, and the log is what onboarding checks were scored on.
// It holds no token (eval/lib/socket.ts strips it).
export function keepOnboardingLog(ws: Pick<Workspace, "onboardingLog"> & Partial<Pick<Workspace, "doanLog" | "workLog" | "openLog" | "handoffLog" | "prototypeLog" | "canvasLog">>, dir: string): void {
  const keep = (path: string | undefined, name: string) => {
    if (path && existsSync(path)) writeFileSync(join(dir, name), readArtifact(path, LOG_BYTES), { mode: 0o600 });
  };
  keep(ws.onboardingLog, "onboarding.jsonl");
  keep(ws.doanLog, "doan-calls.jsonl");
  keep(ws.workLog, "work.jsonl");
  keep(ws.openLog, "open.jsonl");
  keep(ws.prototypeLog, "prototype.jsonl");
  keep(ws.handoffLog, "handoff.jsonl");
  keep(ws.canvasLog, "canvas-names.jsonl");
}

// A Codex run's own CODEX_HOME (isolateUserInstructions) goes with the workspace; when readAgentTranscript could not
// copy the run's rollout, its sessions are kept so the rollout can still be found by hand. Only that home is copied:
// any other CODEX_HOME may hold the user's own sessions.
export function keepCodexSessions(ws: Pick<Workspace, "codexHome">, dir: string): void {
  if (!ws.codexHome) return;
  const sessions = join(ws.codexHome, "sessions");
  if (existsSync(join(dir, "codex-rollout.jsonl")) || !existsSync(sessions)) return;
  cpSync(sessions, join(dir, "codex-sessions"), { recursive: true });
}

export function copyRepo(repo: string, dest: string): void {
  const git = join(repo, ".git");
  cpSync(repo, dest, { recursive: true, verbatimSymlinks: true, filter: source => source !== git && !source.startsWith(`${git}/`) });
}
