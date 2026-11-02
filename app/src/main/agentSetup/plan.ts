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
  // The file's bytes are not UTF-8, so `content` is null rather than a lossy decode Doan could write back.
  undecodable?: true;
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

// Claude Code Bash rules (Claude Code docs 'Configure permissions', 'Wildcard patterns'): a trailing ` *` matches any
// arguments and the bare command, and `&&`, `;`, `|` split a command so each part needs its own rule. Only the two
// work commands: an agent needs no prompt to report what it edits, but every other doan command still asks.
export const CLAUDE_ALLOW_RULES: readonly string[] = ["Bash(doan work start *)", "Bash(doan work done *)"];
export type ClaudeAllowMerge = { kind: "keep" } | { kind: "write"; text: string } | { kind: "refuse"; problem: "json" | "object" | "permissions" | "allow" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Offsets into JSON text that JSON.parse has already accepted, so the scan below assumes valid input. An entry is an
// object member (`key` set, `at` is its key) or an array element; `end` is just past its value.
interface Entry { key: string | undefined; at: number; end: number }
function skipSpace(text: string, at: number): number {
  while (at < text.length && " \t\n\r".includes(text.charAt(at))) at++;
  return at;
}
function stringEnd(text: string, at: number): number {
  let i = at + 1;
  while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}
// A container is skipped by counting brackets, not by recursing: JSON.parse accepts nesting deeper than the stack.
function valueEnd(text: string, at: number): number {
  if (text[at] === '"') return stringEnd(text, at);
  if (text[at] === "{" || text[at] === "[") {
    let depth = 0, i = at;
    do {
      if (text[i] === '"') { i = stringEnd(text, i); continue; }
      if (text[i] === "{" || text[i] === "[") depth++;
      else if (text[i] === "}" || text[i] === "]") depth--;
      i++;
    } while (depth > 0);
    return i;
  }
  let i = at;
  while (i < text.length && !",]} \t\n\r".includes(text.charAt(i))) i++;
  return i;
}
// The entries of the object or array opening at `at`.
function entries(text: string, at: number): Entry[] {
  const object = text[at] === "{", list: Entry[] = [];
  let i = skipSpace(text, at + 1);
  while (text[i] !== (object ? "}" : "]")) {
    const start = i;
    let key: string | undefined;
    if (object) { const keyEnd = stringEnd(text, i); key = JSON.parse(text.slice(i, keyEnd)) as string; i = skipSpace(text, skipSpace(text, keyEnd) + 1); }
    const end = valueEnd(text, i);
    list.push({ key, at: start, end });
    i = skipSpace(text, end);
    if (text[i] === ",") i = skipSpace(text, i + 1);
  }
  return list;
}
// Adds `values` as the last entries of the container opening at `open`, separated the way its last entry is.
function append(text: string, open: number, values: string[]): string {
  const list = entries(text, open), last = list.at(-1);
  if (!last) return `${text.slice(0, open + 1)}${values.join(", ")}${text.slice(open + 1)}`;
  const gap = text.slice(list.at(-2)?.end ?? open + 1, last.at);
  const lead = gap.slice(gap.indexOf(",") + 1);
  return `${text.slice(0, last.end)}${values.map(value => `,${lead}${value}`).join("")}${text.slice(last.end)}`;
}
// JSON.parse keeps the last of duplicate keys, so the value it read is the last member with that key.
function memberValue(text: string, open: number, key: string): number | null {
  const member = entries(text, open).filter(entry => entry.key === key).at(-1);
  return member ? skipSpace(text, skipSpace(text, stringEnd(text, member.at)) + 1) : null;
}

// The person's ~/.claude/settings.json with Doan's rules added; null is a missing file. JSON.parse decides; the write
// inserts only the missing rules into the original text, since a parse/stringify round trip would change big
// integers, out-of-range numbers and duplicate keys elsewhere in the file.
export function mergeClaudeAllow(text: string | null): ClaudeAllowMerge {
  let settings: unknown = {};
  if (text !== null) { try { settings = JSON.parse(text); } catch { return { kind: "refuse", problem: "json" }; } }
  if (!isObject(settings)) return { kind: "refuse", problem: "object" };
  // A key set to null is the person's value, not a missing one.
  const permissions = settings.permissions === undefined ? {} : settings.permissions;
  if (!isObject(permissions)) return { kind: "refuse", problem: "permissions" };
  const allow = permissions.allow === undefined ? [] : permissions.allow;
  if (!Array.isArray(allow)) return { kind: "refuse", problem: "allow" };
  const missing = CLAUDE_ALLOW_RULES.filter(rule => !allow.includes(rule));
  if (missing.length === 0) return { kind: "keep" };
  if (text === null) return { kind: "write", text: `${JSON.stringify({ permissions: { allow: missing } }, null, 2)}\n` };
  const rules = missing.map(rule => JSON.stringify(rule)), list = `[${rules.join(", ")}]`;
  const root = skipSpace(text, 0), permissionsAt = memberValue(text, root, "permissions");
  if (permissionsAt === null) return { kind: "write", text: append(text, root, [`"permissions": {"allow": ${list}}`]) };
  const allowAt = memberValue(text, permissionsAt, "allow");
  return { kind: "write", text: allowAt === null ? append(text, permissionsAt, [`"allow": ${list}`]) : append(text, allowAt, rules) };
}

const CREATED_CLAUDE_SETTINGS = (mergeClaudeAllow(null) as Extract<ClaudeAllowMerge, { kind: "write" }>).text;

export function classifyTarget(target: SetupTarget, home: string, observation: Pick<Observation, "kind" | "value" | "content">): Ownership {
  const { kind, value } = observation;
  if (kind === "missing") return "missing";
  // The person's settings: Doan only merges into a regular file there, never through a link.
  if (target === "claude-allow") return kind === "file" ? "ours" : "foreign";
  // Ownership of the rule is its exact content; when the text changes, the old text joins this check.
  if (target === "codex-rule") return kind === "file" && observation.content === codexRuleText() ? "ours" : "foreign";
  if (kind !== "symlink" || value == null) return "foreign";
  // Doan never placed another form in /usr/local/bin, so only the exact link is ours there and nothing is replaced as root.
  if (target === "system-cli") return value === `${home}/.local/share/doan/current/bin/doan` ? "ours" : "foreign";
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
    // Allows the same PATH `doan` as the Codex rule. `want` is the file Doan creates when there is none.
    ...(providerDirs.includes("claude") ? [{ target: "claude-allow", path: `${home}/.claude/settings.json`, want: CREATED_CLAUDE_SETTINGS, file: true, root: `${home}/.claude`, providers: ["claude"], after: ["current", "cli", "system-cli"] } satisfies PlannedTarget] : []),
  ];
}

// A regular file is merged into; a link is read through only to see whether the person already added the rules.
function claudeSettingsStep(target: PlannedTarget, observation: Observation): Step {
  const base = { target: target.target, path: target.path };
  const item = (problem: Extract<SetupItem, { reason: "claude-settings" }>["problem"]): Step =>
    ({ ...base, action: "skip", item: { target: target.target, path: target.path, providers: [...target.providers], reason: "claude-settings", problem } });
  const merged = typeof observation.content === "string" ? mergeClaudeAllow(observation.content) : null;
  if (observation.kind === "symlink") return merged?.kind === "keep" ? { ...base, action: "keep" } : item("link");
  if (observation.undecodable) return item("json");
  if (merged === null) return { ...base, action: "changed" };
  return merged.kind === "keep" ? { ...base, action: "keep" } : merged.kind === "write" ? { ...base, action: "replace" } : item(merged.problem);
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
  const ownership = classifyTarget(target.target, home, observation);
  if (target.target === "claude-allow" && (ownership === "ours" || observation.kind === "symlink")) return claudeSettingsStep(target, observation);
  switch (ownership) {
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
