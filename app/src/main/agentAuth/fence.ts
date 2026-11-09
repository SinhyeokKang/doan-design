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
// Claude's and Codex's own settings in the profile: settings files, and the skills, subagents and plugins that can carry
// hooks and MCP servers (Claude skill and subagent frontmatter hooks, skills-dir plugins; a Codex skill's MCP
// dependencies, Codex plugins). A later run reads them, and the next Claude or Codex run may start without this outer
// fence (Claude by its sandbox setting, Codex outside Full access): hooks, MCP servers and notify named there then run
// outside any sandbox (Codex MCP servers and notify do even inside its own, probe), so the agent must not plant them.
// Doan writes the doan skill stub before spawning, so it stays readable. Neither CLI writes these files during a run (Claude Code 2.1.319: suggested permissions go
// to the project's local settings or the session; codex-cli 0.166.0 wrote no config.toml). Doan main writes them from
// outside the fence. The ACP providers always run inside this fence, so their settings need no such line.
const CLAUDE_SETTINGS = `(deny file-write* (literal (param "PROVIDER_SETTINGS")) (subpath (param "PROVIDER_SKILLS")) (subpath (param "PROVIDER_AGENTS")) (subpath (param "PROVIDER_PLUGINS")))
`;
const CODEX_SETTINGS = `(deny file-write* (literal (param "CODEX_CONFIG")) (literal (param "CODEX_HOOKS")) (literal (param "CODEX_MANAGED")) (subpath (param "CODEX_RULES")) (subpath (param "CODEX_SKILLS")) (subpath (param "CODEX_PLUGINS")))
`;
const hooked = (provider: Provider) => provider === "claude" || provider === "antigravity";
const codexSettingsFiles = (profile: string) => [`${profile}/config.toml`, `${profile}/hooks.json`, `${profile}/managed_config.toml`, `${profile}/rules`, `${profile}/skills`, `${profile}/plugins`];
const claudeSettingsDirs = (profile: string) => [`${profile}/skills`, `${profile}/agents`, `${profile}/plugins`];

// attachments: the number of attachment directories; each one past the first gets its own parameter and rule.
export function fencePolicy(provider: Provider, attachments = 0): string {
  let text = BASE + (hooked(provider) ? HOOK : "") + (provider === "claude" ? CLAUDE_SETTINGS : provider === "codex" ? CODEX_SETTINGS : "") + (provider === "antigravity" ? ANTIGRAVITY : "");
  for (let n = 2; n <= attachments; n++) text += `(allow file-read* (subpath (param "ATTACHMENTS_${n}")))\n`;
  return text;
}
export function fenceArgs(provider: Provider, paths: FencePaths): string[] {
  const { userData: u, profile: p, attachments } = paths;
  // No pasted image: the profile, already open for reading and writing, so the rule opens nothing new.
  const params: [string, string][] = [["USERDATA", u], ["AGENT_AUTH", `${u}/agent-auth`], ["PROFILES", `${u}/agent-auth/profiles`], ["PROFILE", p],
    ["RUNTIME", `${u}/runtime.json`], ["ATTACHMENTS", attachments[0] ?? p]];
  if (hooked(provider)) params.push(["BROWSER_HOOK", `${u}/agent-auth/browser-hook`]);
  if (provider === "claude") { const [skills, agents, plugins] = claudeSettingsDirs(p); params.push(["PROVIDER_SETTINGS", `${p}/settings.json`], ["PROVIDER_SKILLS", skills!], ["PROVIDER_AGENTS", agents!], ["PROVIDER_PLUGINS", plugins!]); }
  if (provider === "codex") {
    const [config, hooks, managed, rules, skills, plugins] = codexSettingsFiles(p);
    params.push(["CODEX_CONFIG", config!], ["CODEX_HOOKS", hooks!], ["CODEX_MANAGED", managed!], ["CODEX_RULES", rules!], ["CODEX_SKILLS", skills!], ["CODEX_PLUGINS", plugins!]);
  }
  if (provider === "antigravity") params.push(["AGENT_RUNTIMES", `${u}/agent-runtimes`], ["AGENT_RUNTIME", `${u}/agent-runtimes/antigravity-acp`],
    ["SKILLS_CONFIG", `${p}/.gemini/config/skills`], ["SKILLS_CLI", `${p}/.gemini/antigravity-cli/skills`]);
  attachments.slice(1).forEach((dir, i) => params.push([`ATTACHMENTS_${i + 2}`, dir]));
  // Paths go in -D, never into the policy text, so quotes or parentheses in a path cannot change the policy.
  return ["-p", fencePolicy(provider, attachments.length), ...params.flatMap(([name, value]) => ["-D", `${name}=${value}`])];
}
export function fencedCommand(command: string, args: readonly string[], fence?: readonly string[], exec = SANDBOX_EXEC): { command: string; args: string[] } {
  return fence ? { command: exec, args: [...fence, command, ...args] } : { command, args: [...args] };
}

// Control characters: a path or name carrying one is refused rather than escaped (TOML takes no U+007F).
const CONTROL = /[\x00-\x1f\x7f]/;
const usable = (path: string) => path.startsWith("/") && !CONTROL.test(path);
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
  // A pasted image is <store>/<id>/<file> (attachments.ts); files the person chose elsewhere need no opening. Each path
  // is resolved like userData, so one recorded through a link still matches; one that no longer resolves stays closed.
  const dirs: string[] = [];
  for (const recorded of input.attachments) {
    let path: string; try { path = realpath(recorded); } catch { continue; }
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

// Each listed directory's entries, as fenceListingDirs names them.
// directory: false for a link too, so a link gets a file rule; Doan makes no link inside userData that points back into it
// (Electron's Singleton* links point outside).
export type FenceListing = ReadonlyMap<string, readonly { name: string; directory: boolean }[]>;
export interface FenceEntry { path: string; directory: boolean }
// What a provider's own settings reopen: Claude this turn's pasted images and the $BROWSER hook it runs, Codex its
// whole attachment store (paths.attachments) and no hook.
function allowedPaths(provider: "claude" | "codex", paths: FencePaths): string[] {
  return [paths.profile, `${paths.userData}/runtime.json`, ...paths.attachments, ...provider === "claude" ? [`${paths.userData}/agent-auth/browser-hook`] : []];
}
function ancestors(paths: FencePaths, allowed: readonly string[]): string[] {
  const u = paths.userData, found = new Set<string>([u]);
  for (const path of allowed) for (let at = path.lastIndexOf("/"); at > u.length; at = path.lastIndexOf("/", at - 1)) found.add(path.slice(0, at));
  return [...found].sort();
}
// userData and every directory between it and an allowed path: the shell lists each for fenceDenied.
export function fenceListingDirs(provider: "claude" | "codex", paths: FencePaths): string[] {
  return ancestors(paths, allowedPaths(provider, paths));
}
// Characters a permission rule or a Codex filesystem entry may read as a pattern or as the end of its content.
const PATTERN = /[*?[\]{}\\()]/;
// Every entry off the way to an allowed path, denied by name. A deny over userData as a whole would beat what the
// settings reopen inside it: Claude's denyWrite beats an allowWrite under it, and Codex applies a profile's deny
// entries but not the narrower read and write entries under them to an approved escalated command (so `doan handoff`
// lost runtime.json). The cost: an entry made after the listing is not denied.
export function fenceDenied(provider: "claude" | "codex", paths: FencePaths, listing: FenceListing): FenceEntry[] | null {
  const allowed = allowedPaths(provider, paths), dirs = ancestors(paths, allowed);
  if (PATTERN.test(paths.userData)) return null;
  const denied: FenceEntry[] = [];
  for (const dir of dirs) {
    const entries = listing.get(dir); if (!entries) return null;
    for (const entry of entries) {
      if (entry.name.includes("/") || CONTROL.test(entry.name) || PATTERN.test(entry.name)) return null;
      const path = `${dir}/${entry.name}`;
      if (!allowed.includes(path) && !dirs.includes(path)) denied.push({ path, directory: entry.directory });
    }
  }
  return denied;
}
// A deny rule beats every allow, so the Read and Edit tools get the listed entries rather than userData as a whole,
// which would hide the agent's own profile and this turn's pasted image. `//` starts an absolute path.
export function claudeDenyRules(denied: readonly FenceEntry[]): string[] {
  return denied.flatMap(entry => { const target = `/${entry.path}${entry.directory ? "/**" : ""}`; return [`Read(${target})`, `Edit(${target})`]; });
}
export interface ClaudeFenceSettings {
  permissions: { deny: string[] };
  sandbox: { enabled: true; allowUnsandboxedCommands: false; network?: { allowUnixSockets: string[] }; filesystem: { denyRead: string[]; allowRead: string[]; denyWrite: string[]; allowWrite: string[] } };
}
// The flag tier (SDK settings, the CLI's --settings), which neither the agent nor a repository can edit. Reading:
// userData is denied and the allowed paths reopened (an allowRead holds inside a denyRead). Writing: a sandboxed
// command writes only where it is allowed, so the profile is the one allowed path; the listed entries and the read-only
// allowed paths are denied too, in case the agent's own profile settings widen allowWrite for a later turn. A new
// entry is therefore writable only through such a widening. allowUnsandboxedCommands false keeps a command from asking
// its way out (Full access would run it outside without asking).
// Doan judged the sandbox on, so the flag tier keeps it on: a user, project or local source Doan misread can no longer
// turn it off, which leaves only managed sources Doan does not read. The profile's settings.json, .claude.json, skills,
// agents and plugins are closed to Bash and the Edit tool and stay readable (the CLI itself still writes .claude.json
// and plugins/store; only a sandbox-on turn's tools are held here, the outer fence holds the rest for a sandbox-off one).
// socketDir: the app socket's directory. Claude's sandbox blocks unix sockets, and with allowUnsandboxedCommands false
// `doan` cannot ask to run outside it, so only that directory is allowed (no other network changes).
export function claudeFenceSettings(paths: FencePaths, denied: readonly FenceEntry[], socketDir?: string): ClaudeFenceSettings {
  const allowed = allowedPaths("claude", paths);
  const files = [`${paths.profile}/settings.json`, `${paths.profile}/.claude.json`], dirs = claudeSettingsDirs(paths.profile);
  return { permissions: { deny: [...claudeDenyRules([...denied, ...files.map(path => ({ path, directory: false }))]), ...dirs.map(dir => `Edit(/${dir}/**)`)] }, sandbox: { enabled: true, allowUnsandboxedCommands: false, ...socketDir ? { network: { allowUnixSockets: [socketDir] } } : {}, filesystem: {
    denyRead: [paths.userData], allowRead: allowed, denyWrite: [...denied.map(entry => entry.path), ...allowed.filter(path => path !== paths.profile), ...files, ...dirs], allowWrite: [paths.profile] } } };
}

// Codex permission profiles (experimental API): a profile's deny entries hold its sandboxed commands, approved
// escalations and view_image. Defining any profile requires default_permissions, so Ask first runs on Doan's read-only
// one; a Doan profile records no project trust, so Codex's own default there is read-only too. denied: listed when the
// server starts, which lives across turns, so an entry made later (another provider's new profile, a new staging
// profile) is not denied for that server's life.
// The profile's settings files are denied, not read-only: an escalated command keeps only deny entries.
// socketDir: the app socket's directory. Codex opens no unix socket without network, for a sandboxed or an approved
// escalated command alike, so `doan` could not reach the app; network goes on with only that socket directory allowed
// (sandboxed commands in these modes now reach the network without approval).
export function codexProfileArgs(paths: FencePaths, denied: readonly FenceEntry[], socketDir: string): string[] {
  // TOML basic strings take JSON's escapes.
  const q = (text: string) => JSON.stringify(text);
  const entries = `{${[...denied.map(entry => entry.path), ...codexSettingsFiles(paths.profile)].map(path => `${q(path)}="deny"`).concat(`${q(paths.profile)}="write"`, `${q(`${paths.userData}/runtime.json`)}="read"`, `${q(`${paths.userData}/attachments`)}="read"`).join(",")}}`;
  const network = `network={enabled=true,unix_sockets={${q(socketDir)}="allow"}}`;
  return ["-c", 'default_permissions="doan"', "-c", `permissions.doan={extends=":read-only",filesystem=${entries},${network}}`,
    "-c", `permissions.doan-workspace={extends=":workspace",filesystem=${entries},${network}}`];
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
