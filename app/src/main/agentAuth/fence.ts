import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { codexPermission, type CodexDefaults, type CodexWorkspace, type PermissionModeId } from "../conversation/permissionMode";
import { CONVERSATION_RUNTIME } from "../runtime";
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
// The pinned Antigravity server lives under userData.
const ANTIGRAVITY = `(allow file-read-metadata (literal (param "AGENT_RUNTIMES")))
(allow file-read* (subpath (param "AGENT_RUNTIME")))
`;
const hooked = (provider: Provider) => provider === "claude" || provider === "antigravity";

// Claude Code 2.1.329 coordinates account and MCP refreshes before taking the shared storage lock. Only the owner
// record is replaced through a temporary file. The MCP lock is at the profile root: Claude replaces punctuation in
// the Doan connector name with underscores and appends its 16-digit hex hash. Seatbelt has no counted repetition.
const CLAUDE_REFRESH = `(let ((account-lock (string-append (param "AGENT_FOLDER") "/.oauth_refresh.lock")))
  (allow file-write* (literal account-lock) (literal (string-append account-lock ".owner")) (prefix (string-append account-lock ".owner.tmp."))))
(allow file-write* (regex (string-append "^" (regex-quote (param "AGENT_FOLDER")) #"/mcp-refresh-doan_[a-z0-9]${"[a-z0-9_]?".repeat(15)}_${"[0-9a-f]".repeat(16)}\\.lock\\.lock$")))
`;

// The agent's own folder: the profile for Claude (CLAUDE_CONFIG_DIR) and Codex (CODEX_HOME), the CLI's folder in the
// dedicated HOME for the others. A later process reads its instructions, settings, rules, skills, subagents, plugins,
// hooks and MCP servers there, some outside this fence (Codex outside Full access; Claude's sign-in, status and
// sign-out), so the fence closes the folder to writes and reopens only what the CLI itself writes during a run, its
// sign-in and its status: an allowlist, so a store a new CLI version adds is closed until a probe opens it. The rest of
// a dedicated HOME stays writable but for other agents' folders (HOME_STORES): it is the HOME the agent's own commands
// use (npm, pip and build caches).
// dirs are reopened with everything under them, files by prefix, which covers each file's lock, temporary, backup and
// write-ahead names. pattern: a constant regex for names a list cannot hold, applied inside the folder only.
// Doan writes the doan skill stub, the Codex rules and Claude's and Copilot's settings from outside the fence.
interface AgentWrites { folder: string; dirs: readonly string[]; files: readonly string[]; pattern?: string }
const AGENT_WRITES: Record<Provider, AgentWrites> = {
  // Claude Code 2.1.327 (a turn with a tool call) and a signed-in profile's entries. In 2.1.329, MCP sign-in takes
  // .storage-write.lock before saving OAuth client information and tokens, including in the macOS Keychain. Account
  // and MCP token renewal also need CLAUDE_REFRESH. Fenced runs disable auto memory (claudeRunSettings in runners.ts)
  // because its files sit beside transcripts under projects/. session-env/ stays closed: hooks leave environment files
  // there that the session's commands source again on resume (probe); the CLI runs without it.
  claude: { folder: "", dirs: ["projects", "sessions", "shell-snapshots", "file-history", "todos", "plans", "tasks", "backups", "cache", "statsig", "debug", "paste-cache", "image-cache", "telemetry"],
    files: [".claude.json", ".credentials.json", ".storage-write.lock", "history.jsonl", "stats-cache.json", "mcp-needs-auth-cache.json", ".last-cleanup"] },
  // codex-cli 0.169.0 (isolated CODEX_HOME): the Codex process itself writes these, and runs inside this fence only in
  // Full access; tmp/ holds its runtime helpers, and .tmp both a folder and the temporary files it renames onto a root
  // file (.sandbox_migration). Its SQLite databases carry a version in their names. Its login lives in the
  // keyring (providers.ts), so only auth.json's locks are written.
  codex: { folder: "", dirs: ["sessions", "archived_sessions", "shell_snapshots", "memories", "tmp", "cache", "log", "thread-writer-locks"],
    files: [".tmp", "installation_id", ".sandbox_migration", "models_cache.json", "auth.json.lock", "auth.lock"], pattern: "\\.sqlite[^/]*$" },
  // Copilot 1.0.105 (dedicated HOME: version, status and an ACP session) and a signed-in profile's entries.
  copilot: { folder: ".copilot", dirs: ["session-state", "logs", "plugin-data"], files: ["config.json", "settings.json", "session-store.db"] },
  // Cursor 2026.10.22 (dedicated HOME: version, status and an ACP session) and a signed-in profile's entries, rechecked
  // on 2026.11.22. Its cli-config.json stays closed: it holds the permission allow list a later conversation runs under,
  // which Cursor's own sandbox protects as well, and Cursor runs without writing it (probe). projects/ stays closed too
  // (cursorWorkerDir).
  cursor: { folder: ".cursor", dirs: ["acp-sessions", "ai-tracking"], files: ["statsig-cache.json", "agent-cli-state.json", "auth.json"] },
  // The Antigravity ACP server 1.3.0, from a signed-in profile's entries and their times (no isolated probe: the server
  // runs only signed in). Its config/ holds per-conversation databases named by a UUID beside the memory, skills,
  // workflows and MCP and hook files.
  antigravity: { folder: ".gemini", dirs: ["antigravity-acp/conversations", "antigravity-acp/brain", "antigravity"], files: ["antigravity-acp/acp_token.json", "antigravity-acp/acp_business_token.json"],
    pattern: "/config/[0-9a-f-]+\\.(db|meta)[^/]*$" },
};
// Other agents' folders in a dedicated HOME, read there as the person's own: Copilot 1.0.105 loads personal skills from
// ~/.agents/skills, and Cursor 2026.10.22 skills from .agents, .claude, .codex and .grok and hooks, permissions and
// commands from .claude. Each whole folder is closed, so none can be moved into place either.
const HOME_STORES = [".agents", ".claude", ".codex", ".grok"];
function agentRule(provider: Provider): string {
  const { folder, dirs, files, pattern } = AGENT_WRITES[provider];
  const reopen = [...dirs.map((_, i) => ` (subpath (param "AGENT_DIR_${i + 1}"))`), ...files.map((_, i) => ` (prefix (param "AGENT_FILE_${i + 1}"))`)].join("");
  const stores = folder ? `(deny file-write*${HOME_STORES.map((_, i) => ` (subpath (param "HOME_STORE_${i + 1}"))`).join("")})\n` : "";
  return `(deny file-write* (subpath (param "AGENT_FOLDER")))
${stores}(allow file-write*${reopen})
${pattern ? `(allow file-write* (require-all (subpath (param "AGENT_FOLDER")) (regex #"${pattern}")))\n` : ""}`;
}
function agentParams(provider: Provider, profile: string): [string, string][] {
  const { folder: name, dirs, files } = AGENT_WRITES[provider];
  const folder = name ? `${profile}/${name}` : profile;
  return [["AGENT_FOLDER", folder], ...(name ? HOME_STORES.map((store, i): [string, string] => [`HOME_STORE_${i + 1}`, `${profile}/${store}`]) : []), ...dirs.map((dir, i): [string, string] => [`AGENT_DIR_${i + 1}`, `${folder}/${dir}`]), ...files.map((file, i): [string, string] => [`AGENT_FILE_${i + 1}`, `${folder}/${file}`])];
}
// cursor-agent 2026.11.22 creates its local worker's socket folder (mkdir -p) when any process with a workspace starts,
// acp included, and exits when it cannot. With a short HOME the folder is inside .cursor: under projects/, beside each
// workspace's MCP approvals and disabled list that a later run reads, or in .cursor itself. Seatbelt cannot tell a
// mkdir from a rename onto the same path, so a rule letting the fenced process make the folder would also let it move a
// prepared one, approvals inside, into place. Doan creates the empty folder from outside the fence instead (prepare.ts);
// the fenced CLI's mkdir -p then finds it. The path rule is the CLI's own (its worker socket path, 2026.11.22 probe):
// <data>/projects, else <data>, else $TMPDIR/.cursor, else /tmp/.cursor, the first one at most 83 characters long, then
// the workspace slug; a path over 91 characters is cut to 83 and given the first 7 hex digits of its SHA-256. The
// workspace is the nearest folder holding .git above the working directory (never the root), else the directory itself.
export function cursorWorkerDir(at: { home: string; cwd: string; tmpdir: string | undefined }, exists: (path: string) => boolean = existsSync): string {
  const data = join(at.home, ".cursor"), tmp = (at.tmpdir || "/tmp").replace(/(.)\/$/, "$1");
  const base = [join(data, "projects"), data, join(tmp, ".cursor")].find(path => path.length <= 83) ?? "/tmp/.cursor";
  let workspace = at.cwd;
  for (let dir = at.cwd; dirname(dir) !== dir; dir = dirname(dir)) if (exists(join(dir, ".git"))) { workspace = dir; break; }
  const slug = workspace.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const path = join(base, slug);
  return path.length > 91 ? `${path.slice(0, 83)}-${createHash("sha256").update(path).digest("hex").slice(0, 7)}` : path;
}
// Every Codex process loads <CODEX_HOME>/.env into its own environment (codex-cli 0.169.0, probe): a PATH there decides
// what the harness's unsandboxed children (git) run, so the agent must not write it, and AuthManager removes one before
// any Codex process starts.
export const CODEX_DOTENV = ".env";
// Codex's settings and instruction files, denied in its permission profiles so that an approved escalated command, which
// keeps only deny entries, cannot write them either. AGENTS.md and AGENTS.override.md are the person's own instructions
// to every later Codex thread in this profile.
const codexSettingsFiles = (profile: string) => [`${profile}/config.toml`, `${profile}/hooks.json`, `${profile}/managed_config.toml`, `${profile}/${CODEX_DOTENV}`, `${profile}/rules`,
  `${profile}/AGENTS.md`, `${profile}/AGENTS.override.md`];

// attachments: the number of attachment directories; each one past the first gets its own parameter and rule.
export function fencePolicy(provider: Provider, attachments = 0): string {
  let text = BASE + agentRule(provider) + (provider === "claude" ? CLAUDE_REFRESH : "") + (hooked(provider) ? HOOK : "") + (provider === "antigravity" ? ANTIGRAVITY : "");
  for (let n = 2; n <= attachments; n++) text += `(allow file-read* (subpath (param "ATTACHMENTS_${n}")))\n`;
  return text;
}
export function fenceArgs(provider: Provider, paths: FencePaths): string[] {
  const { userData: u, profile: p, attachments } = paths;
  // No pasted image: the profile, already open for reading and writing, so the rule opens nothing new.
  const params: [string, string][] = [["USERDATA", u], ["AGENT_AUTH", `${u}/agent-auth`], ["PROFILES", `${u}/agent-auth/profiles`], ["PROFILE", p],
    ["RUNTIME", `${u}/${CONVERSATION_RUNTIME}`], ["ATTACHMENTS", attachments[0] ?? p]];
  if (hooked(provider)) params.push(["BROWSER_HOOK", `${u}/agent-auth/browser-hook`]);
  params.push(...agentParams(provider, p));
  if (provider === "antigravity") params.push(["AGENT_RUNTIMES", `${u}/agent-runtimes`], ["AGENT_RUNTIME", `${u}/agent-runtimes/antigravity-acp`]);
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
  return [paths.profile, `${paths.userData}/${CONVERSATION_RUNTIME}`, ...paths.attachments];
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
// them to an approved escalated command (so `doan handoff` lost its runtime file). The cost: an entry made after the
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
// The profile is read-only to sandboxed commands: Codex writes its rollouts, databases, caches and runtime helpers
// (tmp/) from its own process, outside the command sandbox, and the commands need no write there (codex-cli 0.169.0
// probe: a turn's commands, apply_patch included, ran and its rollout was recorded). The settings files are
// also denied: an escalated command keeps only deny entries. The rest stays readable, since the model opens a skill's
// SKILL.md (the doan stub included) with shell tools; an approved escalated command can therefore write there (a known
// limit).
// socketDir: the app socket's directory. Codex opens no unix socket without network, for a sandboxed or an approved
// escalated command alike, so `doan` could not reach the app; network goes on with only that socket directory allowed
// (sandboxed commands in these modes now reach the network without approval).
export function codexProfileArgs(paths: FencePaths, denied: readonly FenceEntry[], socketDir: string): string[] {
  // TOML basic strings take JSON's escapes.
  const q = (text: string) => JSON.stringify(text);
  const entries = `{${[...denied.map(entry => entry.path), ...codexSettingsFiles(paths.profile)].map(path => `${q(path)}="deny"`).concat(`${q(paths.profile)}="read"`, `${q(`${paths.userData}/${CONVERSATION_RUNTIME}`)}="read"`, `${q(`${paths.userData}/attachments`)}="read"`).join(",")}}`;
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
