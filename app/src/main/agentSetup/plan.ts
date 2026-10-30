import { posix } from "node:path";
import { PROVIDERS, type Provider } from "../agentAuth/types";
import type { Ineligible, SetupItem, SetupTarget } from "./notice";

// What agent setup should look like on this machine (design '배치') and what to do about each target. Pure: the
// runner reads the file system and writes; these only decide.

export type Eligibility = "eligible" | Ineligible;
export type ProviderDir = "claude" | "codex" | "gemini";
export type Ownership = "ours" | "legacy-ours" | "missing" | "foreign";
// The I/O shell's reading of one target. `real` is the target's location under its resolved parent, null when the
// parent does not resolve; `blockedParent` is an ancestor that is not a directory (broken, looping or a file).
export interface Observation {
  kind: "missing" | "file" | "directory" | "symlink" | "other";
  value?: string | null; content?: string | null; real?: string | null; blockedParent?: string | null; error?: string;
}
// `want` is the link value, or the file content when `file`. `root` is the deepest folder the runner may not
// create: provider folders are never created. `after` lists the targets this one goes through.
export interface PlannedTarget { target: SetupTarget; path: string; want: string; file?: true; root: string; providers: Provider[]; after: SetupTarget[] }
export type Step = { target: SetupTarget; path: string } & (
  | { action: "create" | "replace" | "keep" }
  // The same location as an earlier target (~/.claude/skills resolving to ~/.agents/skills): counted once.
  | { action: "shared"; with: SetupTarget }
  // Goes through a target that was skipped or failed; About names only that one.
  | { action: "skip"; on: SetupTarget }
  | { action: "skip"; item: SetupItem }
  // The runner found the target changed while it was writing and left it; the next run decides again.
  | { action: "changed" });
export interface Outcome { ok: boolean; real: string | null; item?: SetupItem }

const MISSING: Observation = { kind: "missing" };

export function installEligibility(bundle: string, home: string, packaged: boolean): Eligibility {
  if (!packaged) return "dev";
  if (bundle.split("/").includes("AppTranslocation")) return "translocated";
  const parent = posix.dirname(bundle);
  return parent === "/Applications" || parent === `${home}/Applications` ? "eligible" : "outside-applications";
}

function pathIncludes(path: string, dir: string): boolean {
  const trimTrailing = (value: string) => value.replace(/\/+$/, "") || "/";
  return path.split(":").some(entry => posix.isAbsolute(entry) && !entry.includes("\0") && trimTrailing(entry) === trimTrailing(dir));
}

// null: the login shell probe failed, which is no evidence that an administrator dialog is needed.
export function needsSystemLink(loginPath: string | null, home: string): boolean {
  return loginPath !== null && !pathIncludes(loginPath, `${home}/.local/bin`);
}

// Only exact absolute values under this HOME's namespace: `..` or another user's HOME is someone else's link.
function underNamespace(value: string, home: string): boolean {
  return posix.isAbsolute(value) && posix.normalize(value) === value && value.startsWith(`${home}/.local/share/doan/`);
}

// Codex runs a command an `allow` rule matches outside the sandbox without asking (Codex docs 'Rules'); the app socket
// needs that. Doan's own file, not default.rules, where the Codex TUI saves the person's approvals.
export function codexRuleText(): string {
  return '# Written by Doan so Codex runs `doan` outside its sandbox without asking. If you edit this file, Doan leaves it alone.\nprefix_rule(pattern=["doan"], decision="allow")\n';
}

export function classifyTarget(target: SetupTarget, home: string, observation: Pick<Observation, "kind" | "value" | "content">): Ownership {
  const { kind, value } = observation;
  if (kind === "missing") return "missing";
  // Ownership of the rule is its exact content; when the text changes, the old text joins this check.
  if (target === "codex-rule") return kind === "file" && observation.content === codexRuleText() ? "ours" : "foreign";
  if (kind !== "symlink" || value == null) return "foreign";
  // ~/.local/share/doan is Doan's namespace: any link there is ours, whichever bundle it names.
  if (target === "current" || target === "skill" || underNamespace(value, home)) return "ours";
  // Connect linked the bundled CLI directly and the Claude skill relatively; both are replaced.
  if (target === "cli" && posix.isAbsolute(value) && /\.app\/Contents\/Resources\/bin\/doan$/i.test(value)) return "legacy-ours";
  if (target === "claude-skill" && value === "../../.agents/skills/doan") return "legacy-ours";
  return "foreign";
}

// `systemBin` is replaced only by tests: the real one needs an administrator dialog.
export function plannedTargets(home: string, resources: string, providerDirs: readonly ProviderDir[], systemLink: boolean, systemBin = "/usr/local/bin"): PlannedTarget[] {
  const share = `${home}/.local/share/doan`, cli = `${share}/current/bin/doan`, skill = `${share}/skill`, all = [...PROVIDERS];
  const skillLink = (target: SetupTarget, dir: string, sub: string, providers: Provider[]): PlannedTarget =>
    ({ target, path: `${home}/${dir}/${sub}/doan`, want: skill, root: dir === ".agents" ? home : `${home}/${dir}`, providers, after: ["current", "skill"] });
  return [
    { target: "current", path: `${share}/current`, want: resources, root: home, providers: all, after: [] },
    { target: "skill", path: skill, want: `${share}/current/skills/doan`, root: home, providers: all, after: ["current"] },
    { target: "cli", path: `${home}/.local/bin/doan`, want: cli, root: home, providers: all, after: ["current"] },
    ...(systemLink ? [{ target: "system-cli", path: `${systemBin}/doan`, want: cli, root: "/", providers: all, after: ["current"] } satisfies PlannedTarget] : []),
    skillLink("agents-skill", ".agents", "skills", ["codex", "cursor", "copilot"]),
    ...(providerDirs.includes("claude") ? [skillLink("claude-skill", ".claude", "skills", ["claude"])] : []),
    ...(providerDirs.includes("gemini") ? [skillLink("gemini-skill", ".gemini", "config/skills", ["antigravity"])] : []),
    // The rule lets the `doan` an agent finds on PATH run unsandboxed, so it waits for Doan's links on that PATH.
    ...(providerDirs.includes("codex") ? [{ target: "codex-rule", path: `${home}/.codex/rules/doan.rules`, want: codexRuleText(), file: true, root: `${home}/.codex`, providers: ["codex"], after: ["current", "cli", "system-cli"] } satisfies PlannedTarget] : []),
  ];
}

export function writeFailure(target: PlannedTarget, code: string, at = posix.dirname(target.path)): SetupItem {
  const cause = code === "EACCES" || code === "EPERM" || code === "EROFS" ? "permission" : "other";
  return { target: target.target, path: target.path, providers: [...target.providers], reason: "write-failed", cause, at, code };
}

export function decide(target: PlannedTarget, observation: Observation, home: string, outcomes: ReadonlyMap<SetupTarget, Outcome>): Step {
  const base = { target: target.target, path: target.path };
  // A cancelled administrator dialog leaves no doan in /usr/local/bin to go through.
  const blocked = target.after.find(dep => outcomes.get(dep)?.ok === false && outcomes.get(dep)?.item?.reason !== "admin-cancelled");
  if (blocked) return { ...base, action: "skip", on: blocked };
  if (observation.blockedParent) {
    return { ...base, action: "skip", item: { target: target.target, path: target.path, providers: [...target.providers], reason: "write-failed", cause: "blocked-parent", at: observation.blockedParent, code: "ENOTDIR" } };
  }
  if (observation.error) return { ...base, action: "skip", item: writeFailure(target, observation.error) };
  const shared = observation.real == null ? undefined : [...outcomes].find(([, outcome]) => outcome.real === observation.real)?.[0];
  if (shared) return { ...base, action: "shared", with: shared };
  switch (classifyTarget(target.target, home, observation)) {
    case "missing": return { ...base, action: "create" };
    case "foreign": {
      const found = observation.kind === "symlink" ? "link" : observation.kind === "directory" ? "folder" : "file";
      return { ...base, action: "skip", item: { target: target.target, path: target.path, providers: [...target.providers], reason: "foreign", found } };
    }
    // An owned file is ours only when its content is exactly `want`.
    default: return { ...base, action: target.file || observation.value === target.want ? "keep" : "replace" };
  }
}

// Records what happened to a target. A shared target follows the one it shares, and adds its agents to that one's item.
export function record(outcomes: Map<SetupTarget, Outcome>, target: PlannedTarget, step: Step, observation: Observation, ok: boolean, item?: SetupItem): void {
  if (step.action === "shared") {
    const first = outcomes.get(step.with)!, firstItem = first.item;
    if (firstItem) firstItem.providers = PROVIDERS.filter(p => firstItem.providers.includes(p) || target.providers.includes(p));
    outcomes.set(step.target, { ok: first.ok, real: observation.real ?? null });
    return;
  }
  outcomes.set(step.target, { ok, real: observation.real ?? null, ...(item ? { item } : {}) });
}

// The plan for observations read once, as if every write succeeds.
export function plan(targets: PlannedTarget[], observations: Partial<Record<SetupTarget, Observation>>, home: string): Step[] {
  const outcomes = new Map<SetupTarget, Outcome>();
  return targets.map(target => {
    const observation = observations[target.target] ?? MISSING;
    const step = decide(target, observation, home, outcomes);
    record(outcomes, target, step, observation, step.action !== "skip", step.action === "skip" && "item" in step ? step.item : undefined);
    return step;
  });
}
