import { codexPermission, type CodexDefaults, type CodexWorkspace, type PermissionModeId } from "../conversation/permissionMode";
import type { Provider } from "./types";

// How a Doan-connection run is kept out of the rest of Doan's userData (the other providers' profiles, Doan's own
// conversations, the vault, other conversations' pasted images). A process already inside a Seatbelt policy cannot
// apply a second one with any rule (sandbox_apply fails with exit 71), so a provider that sandboxes its own commands
// (Claude Code with its sandbox on, Codex outside Full access) gets Doan's limits as its own settings instead of an
// outer sandbox-exec.
export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
// The two ways a fenced Codex server runs; it keeps one for its life.
export type FenceMechanism = "fence" | "codex-profile";

// Real paths (realpath.native): Seatbelt compares the resolved path, so an unresolved /var/... or relative -D value
// matches nothing and blocks nothing.
// attachments: Claude and ACP runs get this turn's pasted-image directories, Codex its whole attachment directory,
// because one Codex server serves many turns and a policy is fixed when the process starts.
export interface FencePaths { userData: string; profile: string; attachments: readonly string[] }

// Allow by default; deny userData; reopen what the run needs. The last matching rule wins, so the deny comes first.
// The metadata of the three ancestors lets Node's realpathSync reach the profile.
const BASE = `(version 1)
(allow default)
(deny file-read* file-write* (subpath (param "USERDATA")))
(allow file-read-metadata (literal (param "USERDATA")) (literal (param "AGENT_AUTH")) (literal (param "PROFILES")))
(allow file-read* file-write* (subpath (param "PROFILE")))
(allow file-read* (literal (param "RUNTIME")))
(allow file-read* (subpath (param "ATTACHMENTS")))
`;
// The $BROWSER hook Claude and the Antigravity server run.
const HOOK = `(allow file-read* (literal (param "BROWSER_HOOK")))
`;
// The pinned Antigravity server lives under userData. Its own profile's skill paths are closed to writes: the server
// hands them to the agent as workspace roots, and an agent writing there changes the next conversation's skills.
const ANTIGRAVITY = `(allow file-read-metadata (literal (param "AGENT_RUNTIMES")))
(allow file-read* (subpath (param "AGENT_RUNTIME")))
(deny file-write* (subpath (param "SKILLS_CONFIG")) (subpath (param "SKILLS_CLI")))
`;
const hooked = (provider: Provider) => provider === "claude" || provider === "antigravity";

// attachments: the number of attachment directories; each one past the first gets its own parameter and rule.
export function fencePolicy(provider: Provider, attachments = 0): string {
  let text = BASE + (hooked(provider) ? HOOK : "") + (provider === "antigravity" ? ANTIGRAVITY : "");
  for (let n = 2; n <= attachments; n++) text += `(allow file-read* (subpath (param "ATTACHMENTS_${n}")))\n`;
  return text;
}
export function fenceArgs(provider: Provider, paths: FencePaths): string[] {
  const { userData: u, profile: p, attachments } = paths;
  // No pasted image: the profile, already open for reading and writing, so the rule opens nothing new.
  const params: [string, string][] = [["USERDATA", u], ["AGENT_AUTH", `${u}/agent-auth`], ["PROFILES", `${u}/agent-auth/profiles`], ["PROFILE", p],
    ["RUNTIME", `${u}/runtime.json`], ["ATTACHMENTS", attachments[0] ?? p]];
  if (hooked(provider)) params.push(["BROWSER_HOOK", `${u}/agent-auth/browser-hook`]);
  if (provider === "antigravity") params.push(["AGENT_RUNTIMES", `${u}/agent-runtimes`], ["AGENT_RUNTIME", `${u}/agent-runtimes/antigravity-acp`],
    ["SKILLS_CONFIG", `${p}/.gemini/config/skills`], ["SKILLS_CLI", `${p}/.gemini/antigravity-cli/skills`]);
  attachments.slice(1).forEach((dir, i) => params.push([`ATTACHMENTS_${i + 2}`, dir]));
  // Paths go in -D, never into the policy text, so quotes or parentheses in a path cannot change the policy.
  return ["-p", fencePolicy(provider, attachments.length), ...params.flatMap(([name, value]) => ["-D", `${name}=${value}`])];
}
export function fencedCommand(command: string, args: readonly string[], fence?: readonly string[], exec = SANDBOX_EXEC): { command: string; args: string[] } {
  return fence ? { command: exec, args: [...fence, command, ...args] } : { command, args: [...args] };
}

const usable = (path: string) => path.startsWith("/") && !/[\0\r\n]/.test(path);
// null: the fence cannot be built, and the run must not start without it.
export function resolveFencePaths(input: { provider: Provider; userData: string; profileDir: string; attachments: readonly string[] }, realpath: (path: string) => string): FencePaths | null {
  if (![input.userData, input.profileDir, ...input.attachments].every(usable)) return null;
  let userData: string, profile: string;
  try { userData = realpath(input.userData); profile = realpath(input.profileDir); } catch { return null; }
  if (!usable(userData) || !usable(profile)) return null;
  const profiles = `${userData}/agent-auth/profiles`;
  const name = profile.slice(profiles.length + 1);
  if (!profile.startsWith(`${profiles}/`) || !name || name.includes("/")) return null;
  const store = `${userData}/attachments`;
  if (input.provider === "codex") return { userData, profile, attachments: [store] };
  // A pasted image is <store>/<id>/<file> (attachments.ts); files the person chose elsewhere need no opening.
  const dirs: string[] = [];
  for (const path of input.attachments) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir.startsWith(`${store}/`) && !dir.slice(store.length + 1).includes("/") && !dirs.includes(dir)) dirs.push(dir);
  }
  return { userData, profile, attachments: dirs };
}

// Claude Code's settings sources as the SDK's resolveSettings merges them (0.3.312): user < project < local < managed,
// managed-settings.json first and its managed-settings.d drop-ins after it in name order. Each value is the file's
// parsed JSON, undefined when it is missing or unreadable.
export interface ClaudeSettingSources { user: unknown; project: unknown; local: unknown; managed: readonly unknown[] }
export function claudeSandboxEnabled(sources: ClaudeSettingSources): boolean {
  let enabled = false;
  for (const source of [sources.user, sources.project, sources.local, ...sources.managed]) {
    const sandbox = record(source) ? source.sandbox : undefined;
    if (record(sandbox) && typeof sandbox.enabled === "boolean") enabled = sandbox.enabled;
  }
  return enabled;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Each listed directory's entries; the caller lists userData and every ancestor of an allowed path inside it.
export type FenceListing = ReadonlyMap<string, readonly { name: string; directory: boolean }[]>;
const claudeAllowed = (paths: FencePaths) => [paths.profile, `${paths.userData}/runtime.json`, ...paths.attachments, `${paths.userData}/agent-auth/browser-hook`];
// Characters a permission rule reads as a pattern or as the end of its content.
const PATTERN = /[*?[\]{}\\()]/;
// A deny rule beats every allow, so one rule over all of userData would also hide the agent's own profile and this
// turn's pasted image from the Read tool. Instead every entry off the way to an allowed path is denied by name. An
// entry made after the listing is not in it; the sandbox's filesystem rules still keep Bash from it.
export function claudeDenyRules(paths: FencePaths, listing: FenceListing): string[] | null {
  const allowed = claudeAllowed(paths), u = paths.userData;
  const ancestors = new Set<string>([u]);
  for (const path of allowed) for (let at = path.lastIndexOf("/"); at > u.length; at = path.lastIndexOf("/", at - 1)) ancestors.add(path.slice(0, at));
  if (PATTERN.test(u)) return null;
  const rules: string[] = [];
  for (const dir of [...ancestors].sort()) {
    const entries = listing.get(dir); if (!entries) return null;
    for (const entry of entries) {
      if (entry.name.includes("/") || /[\0\r\n]/.test(entry.name) || PATTERN.test(entry.name)) return null;
      const path = `${dir}/${entry.name}`;
      if (allowed.includes(path) || ancestors.has(path)) continue;
      // `//` starts an absolute path in a permission rule.
      const target = `/${path}${entry.directory ? "/**" : ""}`;
      rules.push(`Read(${target})`, `Edit(${target})`);
    }
  }
  return rules;
}
export interface ClaudeFenceSettings {
  permissions: { deny: string[] };
  sandbox: { allowUnsandboxedCommands: false; filesystem: { denyRead: string[]; allowRead: string[]; denyWrite: string[]; allowWrite: string[] } };
}
// The flag tier (SDK settings, the CLI's --settings), which neither the agent nor a repository can edit. Its
// filesystem rules hold every sandboxed command at the OS level; allowUnsandboxedCommands false keeps a command from
// asking its way out (Full access would run it outside without asking).
export function claudeFenceSettings(paths: FencePaths, deny: readonly string[]): ClaudeFenceSettings {
  return { permissions: { deny: [...deny] }, sandbox: { allowUnsandboxedCommands: false, filesystem: {
    denyRead: [paths.userData], allowRead: claudeAllowed(paths), denyWrite: [paths.userData], allowWrite: [paths.profile] } } };
}

// Codex permission profiles (experimental API): a profile's deny entries hold its sandboxed commands, approved
// escalations and view_image. Defining any profile requires default_permissions, so Ask first runs on Doan's read-only
// one; a Doan profile records no project trust, so Codex's own default there is read-only too.
export function codexProfileArgs(paths: FencePaths): string[] {
  // TOML basic strings take JSON's escapes.
  const q = (text: string) => JSON.stringify(text);
  const entries = `{${q(paths.userData)}="deny",${q(paths.profile)}="write",${q(`${paths.userData}/runtime.json`)}="read",${q(`${paths.userData}/attachments`)}="read"}`;
  return ["-c", 'default_permissions="doan"', "-c", `permissions.doan={extends=":read-only",filesystem=${entries}}`,
    "-c", `permissions.doan-workspace={extends=":workspace",filesystem=${entries}}`];
}
// Full access has no Codex sandbox to carry the deny entries, so its server runs inside the outer fence instead.
export function codexMechanism(mode: PermissionModeId): FenceMechanism {
  return mode === "bypass" ? "fence" : "codex-profile";
}
// current: the mechanism the live server started with; undefined for a run with no fence (a terminal session's).
export function codexRestart(current: FenceMechanism | undefined, mode: PermissionModeId): boolean {
  return current !== undefined && current !== codexMechanism(mode);
}
export type CodexTurnArgs = { approvalPolicy: string | Record<string, unknown>; permissions: string } | { approvalPolicy: string | Record<string, unknown>; sandboxPolicy: Record<string, unknown> };
// A profile server never gets a sandboxPolicy: combined with a profile it closes all of userData, the profile and
// runtime.json included. A mode the server's mechanism does not hold is refused rather than run unfenced; the service
// restarts the server before such a send (codexRestart).
export function codexTurnPermission(mode: PermissionModeId, defaults: CodexDefaults, workspace: CodexWorkspace, mechanism: FenceMechanism | undefined): CodexTurnArgs {
  if (mechanism === undefined) return codexPermission(mode, defaults, workspace);
  if (mechanism !== codexMechanism(mode)) throw new Error("session_unavailable");
  switch (mode) {
    case "default": return { approvalPolicy: defaults.approvalPolicy, permissions: "doan" };
    case "acceptEdits": return { approvalPolicy: "on-request", permissions: "doan-workspace" };
    case "plan": return { approvalPolicy: "never", permissions: "doan" };
    case "bypass": return { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } };
  }
}
