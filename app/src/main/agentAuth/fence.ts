import { realpathSync } from "node:fs";
import { codexPermission, type CodexDefaults, type CodexWorkspace, type PermissionModeId } from "../conversation/permissionMode";
import type { Provider } from "./types";

// How a Doan-connection run is kept out of the rest of Doan's userData (the other providers' profiles, Doan's own
// conversations, the vault, other conversations' pasted images). A process already inside a Seatbelt policy cannot
// apply a second one with any rule (sandbox_apply fails with exit 71), so Codex outside Full access, which sandboxes its
// own commands, gets Doan's limits as its own settings instead of an outer sandbox-exec. Claude Code always runs in the
// outer one with its own sandbox turned off: the hooks, MCP servers and helpers the CLI starts beside the model run
// outside its command sandbox, and choosing the mechanism by detecting them kept missing shapes.
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
// dependencies, Codex plugins). A later process reads them, and some start without this outer fence (Codex outside
// Full access; Claude's sign-in, status and sign-out commands): hooks, MCP servers and notify named there then run
// outside any sandbox (Codex MCP servers and notify do even inside its own, probe), so the agent must not plant them.
// Doan writes the doan skill stub before spawning, so it stays readable. Neither CLI writes these files during a run (Claude Code 2.1.319: suggested permissions go
// to the project's local settings or the session; codex-cli 0.166.0 wrote no config.toml). Doan main writes them from
// outside the fence. The ACP providers' profiles get no such line: every Copilot and Cursor process and every ACP list read
// runs in this fence. Of the processes left outside it, Antigravity's status check started none of the hooks and MCP
// servers planted in its profile and loaded no user site-packages (probe); its sign-in was not probed.
const CLAUDE_SETTINGS = `(deny file-write* (literal (param "PROVIDER_SETTINGS")) (subpath (param "PROVIDER_SKILLS")) (subpath (param "PROVIDER_AGENTS")) (subpath (param "PROVIDER_PLUGINS")) (subpath (param "PROVIDER_COMMANDS")) (subpath (param "PROVIDER_PROJECT")) (literal (param "PROVIDER_MCP")))
`;
const CODEX_SETTINGS = `(deny file-write* (literal (param "CODEX_CONFIG")) (literal (param "CODEX_HOOKS")) (literal (param "CODEX_MANAGED")) (literal (param "CODEX_ENV")) (subpath (param "CODEX_RULES")) (subpath (param "CODEX_SKILLS")) (subpath (param "CODEX_PLUGINS")))
`;
const hooked = (provider: Provider) => provider === "claude" || provider === "antigravity";
// Every Codex process loads <CODEX_HOME>/.env into its own environment (codex-cli 0.169.0, probe): a PATH there decides
// what the harness's unsandboxed children (git) run, so the agent must not write it, and AuthManager removes one before
// any Codex process starts.
export const CODEX_DOTENV = ".env";
const codexSettingsFiles = (profile: string) => [`${profile}/config.toml`, `${profile}/hooks.json`, `${profile}/managed_config.toml`, `${profile}/${CODEX_DOTENV}`, `${profile}/rules`];
const codexSettingsDirs = (profile: string) => [`${profile}/skills`, `${profile}/plugins`];
// commands/ is the older skill format and takes the same frontmatter, hooks included. .claude/ and .mcp.json are the
// profile's project settings and project MCP servers for a process Doan starts with the profile as its folder (the
// usage read and the MCP connector commands, which health-check project servers).
const claudeSettingsDirs = (profile: string) => [`${profile}/skills`, `${profile}/agents`, `${profile}/plugins`, `${profile}/commands`, `${profile}/.claude`];
const claudeSettingsFiles = (profile: string) => [`${profile}/settings.json`, `${profile}/.mcp.json`];

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
  if (provider === "claude") {
    const [skills, agents, plugins, commands, project] = claudeSettingsDirs(p), [settings, mcp] = claudeSettingsFiles(p);
    params.push(["PROVIDER_SETTINGS", settings!], ["PROVIDER_SKILLS", skills!], ["PROVIDER_AGENTS", agents!], ["PROVIDER_PLUGINS", plugins!], ["PROVIDER_COMMANDS", commands!],
      ["PROVIDER_PROJECT", project!], ["PROVIDER_MCP", mcp!]);
  }
  if (provider === "codex") {
    const [config, hooks, managed, dotenv, rules] = codexSettingsFiles(p), [skills, plugins] = codexSettingsDirs(p);
    params.push(["CODEX_CONFIG", config!], ["CODEX_HOOKS", hooks!], ["CODEX_MANAGED", managed!], ["CODEX_ENV", dotenv!], ["CODEX_RULES", rules!], ["CODEX_SKILLS", skills!], ["CODEX_PLUGINS", plugins!]);
  }
  if (provider === "antigravity") params.push(["AGENT_RUNTIMES", `${u}/agent-runtimes`], ["AGENT_RUNTIME", `${u}/agent-runtimes/antigravity-acp`],
    ["SKILLS_CONFIG", `${p}/.gemini/config/skills`], ["SKILLS_CLI", `${p}/.gemini/antigravity-cli/skills`]);
  attachments.slice(1).forEach((dir, i) => params.push([`ATTACHMENTS_${i + 2}`, dir]));
  // Paths go in -D, never into the policy text, so quotes or parentheses in a path cannot change the policy.
  return ["-p", fencePolicy(provider, attachments.length), ...params.flatMap(([name, value]) => ["-D", `${name}=${value}`])];
}
// sandbox-exec's own refusal (65 for a policy error, 71 when it cannot exec the command) comes with its own
// "sandbox-exec:" line; a CLI that exits 65 or 71 by itself writes none, and failed as a CLI.
export function sandboxRefused(run: { exitCode: number | null; stderr: string }): boolean {
  return (run.exitCode === 65 || run.exitCode === 71) && /^sandbox-exec: /m.test(run.stderr);
}
export function fencedCommand(command: string, args: readonly string[], fence?: readonly string[], exec = SANDBOX_EXEC): { command: string; args: string[] } {
  return fence ? { command: exec, args: [...fence, command, ...args] } : { command, args: [...args] };
}
// Copilot imports its own JavaScript from the profile's package cache ($HOME/Library/Caches/copilot/pkg, ~/.copilot/pkg)
// with no signature check, in every process (--version too, once a newer package is cached), and its prompt sessions
// start the hooks and MCP servers the profile names; a fenced Copilot turn can rewrite all of them. Cursor's launcher
// starts Node with NODE_COMPILE_CACHE=$HOME/Library/Caches/cursor-compile-cache, and Node runs a cache entry whose header
// matches the source's length and checksum, whatever code it holds (probe: a forged entry ran in `--version`). Both CLIs
// write those caches themselves, so rather than closing them to writes, every process Doan starts for them runs in the
// outer fence.
export const fencedEverywhere = (provider: Provider) => provider === "copilot" || provider === "cursor";
// A process Doan starts outside a conversation in the outer fence: Claude's usage read, MCP connector commands and a
// sign-out's MCP logout (the CLI starts the MCP servers the profile's .claude.json names, and the usage read's SDK those
// of a .mcp.json in its folder or any folder above it, all of which an agent in the outer fence can write), and every
// Copilot and Cursor process (fencedEverywhere). null: the fence cannot be built, and the process must not start.
export function profileFencedCommand(provider: Provider, setup: { userData: string; exec?: string }, profileDir: string, command: string, args: readonly string[], realpath: (path: string) => string = path => realpathSync.native(path)): { command: string; args: string[] } | null {
  const paths = resolveFencePaths({ provider, userData: setup.userData, profileDir, attachments: [] }, realpath);
  return paths ? fencedCommand(command, args, fenceArgs(provider, paths), setup.exec) : null;
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

// Each listed directory's entries, as fenceListingDirs names them.
// directory: false for a link too, so a link gets a file rule; Doan makes no link inside userData that points back into it
// (Electron's Singleton* links point outside).
export type FenceListing = ReadonlyMap<string, readonly { name: string; directory: boolean }[]>;
export interface FenceEntry { path: string; directory: boolean }
// What Codex's permission profiles reopen: its whole attachment store (paths.attachments) and no hook.
function allowedPaths(paths: FencePaths): string[] {
  return [paths.profile, `${paths.userData}/runtime.json`, ...paths.attachments];
}
function ancestors(paths: FencePaths, allowed: readonly string[]): string[] {
  const u = paths.userData, found = new Set<string>([u]);
  for (const path of allowed) for (let at = path.lastIndexOf("/"); at > u.length; at = path.lastIndexOf("/", at - 1)) found.add(path.slice(0, at));
  return [...found].sort();
}
// userData and every directory between it and an allowed path: the shell lists each for fenceDenied.
export function fenceListingDirs(paths: FencePaths): string[] {
  return ancestors(paths, allowedPaths(paths));
}
// Characters a Codex filesystem entry may read as a pattern or as the end of its content.
const PATTERN = /[*?[\]{}\\()]/;
// Every entry off the way to an allowed path, denied by name. A deny over userData as a whole would beat what the
// profile reopens inside it: Codex applies a profile's deny entries but not the narrower read and write entries under
// them to an approved escalated command (so `doan handoff` lost runtime.json). The cost: an entry made after the
// listing is not denied.
export function fenceDenied(paths: FencePaths, listing: FenceListing): FenceEntry[] | null {
  const allowed = allowedPaths(paths), dirs = ancestors(paths, allowed);
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
// Codex permission profiles (experimental API): a profile's deny entries hold its sandboxed commands, approved
// escalations and view_image. Defining any profile requires default_permissions, so Ask first runs on Doan's read-only
// one; a Doan profile records no project trust, so Codex's own default there is read-only too. denied: listed when the
// server starts, which lives across turns, so an entry made later (another provider's new profile, a new staging
// profile) is not denied for that server's life.
// The profile's settings files are denied, not read-only: an escalated command keeps only deny entries. Its skills and
// plugins are read-only instead: the model opens a skill's SKILL.md (the doan stub included) with shell tools, and a deny
// would hide it; an approved escalated command can therefore write there (a known limit).
// socketDir: the app socket's directory. Codex opens no unix socket without network, for a sandboxed or an approved
// escalated command alike, so `doan` could not reach the app; network goes on with only that socket directory allowed
// (sandboxed commands in these modes now reach the network without approval).
export function codexProfileArgs(paths: FencePaths, denied: readonly FenceEntry[], socketDir: string): string[] {
  // TOML basic strings take JSON's escapes.
  const q = (text: string) => JSON.stringify(text);
  const entries = `{${[...denied.map(entry => entry.path), ...codexSettingsFiles(paths.profile)].map(path => `${q(path)}="deny"`).concat(`${q(paths.profile)}="write"`, `${q(`${paths.userData}/runtime.json`)}="read"`, `${q(`${paths.userData}/attachments`)}="read"`, ...codexSettingsDirs(paths.profile).map(dir => `${q(dir)}="read"`)).join(",")}}`;
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
