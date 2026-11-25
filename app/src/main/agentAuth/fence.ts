import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { codexPermission, type CodexDefaults, type CodexWorkspace, type PermissionModeId } from "../conversation/permissionMode";
import { MAX_SLUG } from "../mcpConnectors/names";
import { CONVERSATION_RUNTIME } from "../runtime";
import type { Provider } from "./types";

// A process inside a Seatbelt policy cannot apply a second one, so sandboxed Codex gets Doan's limits as its own
// settings. Claude Code runs in the outer fence with its sandbox off: its hooks and MCP servers run outside that sandbox.
export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
// The two ways a fenced Codex server runs; it keeps one for its life.
export type FenceMechanism = "fence" | "codex-profile";

// Real paths: Seatbelt compares resolved paths, so an unresolved -D value matches nothing. Codex gets its whole attachment
// directory, not this turn's, because one server serves many turns and a policy is fixed at process start.
export interface FencePaths { userData: string; profile: string; attachments: readonly string[] }

// The last matching rule wins, so the userData deny comes first. Ancestor metadata lets realpathSync reach the profile.
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

// Claude takes these refresh locks before the shared storage lock. The MCP lock name is the connector name with
// punctuation replaced by underscores plus a 16-digit hex hash; Seatbelt has no counted repetition, so the slug's
// optional characters are spelled out up to MAX_SLUG.
const CLAUDE_REFRESH = `(let ((account-lock (string-append (param "AGENT_FOLDER") "/.oauth_refresh.lock")))
  (allow file-write* (literal account-lock) (literal (string-append account-lock ".owner")) (prefix (string-append account-lock ".owner.tmp."))))
(allow file-write* (regex (string-append "^" (regex-quote (param "AGENT_FOLDER")) #"/mcp-refresh-doan_[a-z0-9]${"[a-z0-9_]?".repeat(MAX_SLUG - 1)}_${"[0-9a-f]".repeat(16)}\\.lock\\.lock$")))
`;

// The agent's folder is closed but for this allowlist (ARCHITECTURE §7 'Fence'). dirs open whole subtrees; files are
// PREFIX rules (lock, temp, backup, WAL names), so a short entry opens its siblings too. pattern: a regex inside the folder.
interface AgentWrites { folder: string; dirs: readonly string[]; files: readonly string[]; pattern?: string }
const AGENT_WRITES: Record<Provider, AgentWrites> = {
  // MCP sign-in takes .storage-write.lock; renewal needs CLAUDE_REFRESH. Auto memory is off (it would persist under the
  // writable projects/). session-env/ stays closed: hooks leave env files there that a resume sources again.
  claude: { folder: "", dirs: ["projects", "sessions", "shell-snapshots", "file-history", "todos", "plans", "tasks", "backups", "cache", "statsig", "debug", "paste-cache", "image-cache", "telemetry"],
    files: [".claude.json", ".credentials.json", ".storage-write.lock", "history.jsonl", "stats-cache.json", "mcp-needs-auth-cache.json", ".last-cleanup"] },
  // Written by the Codex process itself, inside this fence only in Full access. Its login is in the keyring (providers.ts),
  // so only auth.json's locks are written.
  codex: { folder: "", dirs: ["sessions", "archived_sessions", "shell_snapshots", "memories", "tmp", "cache", "log", "thread-writer-locks"],
    files: [".tmp", "installation_id", ".sandbox_migration", "models_cache.json", "auth.json.lock", "auth.lock"], pattern: "\\.sqlite[^/]*$" },
  // What Copilot writes for status, an ACP session and a signed-in profile.
  copilot: { folder: ".copilot", dirs: ["session-state", "logs", "plugin-data"], files: ["config.json", "settings.json", "session-store.db"] },
  // cli-config.json stays closed: it holds the permission allow list later conversations run under, so Doan sets the model
  // in acp-config.json from outside instead (acpRunner.ts). projects/ stays closed too (cursorWorkerDir).
  cursor: { folder: ".cursor", dirs: ["acp-sessions", "ai-tracking"], files: ["statsig-cache.json", "agent-cli-state.json", "auth.json"] },
  // config/ holds per-conversation databases named by a UUID beside the memory, skills, workflows, MCP and hook files.
  antigravity: { folder: ".gemini", dirs: ["antigravity-acp/conversations", "antigravity-acp/brain", "antigravity"], files: ["antigravity-acp/acp_token.json", "antigravity-acp/acp_business_token.json"],
    pattern: "/config/[0-9a-f-]+\\.(db|meta)[^/]*$" },
};
// Other agents' folders, which Copilot and Cursor load from a dedicated HOME as the person's own skills and settings.
// Each whole folder is closed, so none can be moved into place either.
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
// cursor-agent's worker socket folder can sit under projects/, beside MCP approvals a later run reads, and Seatbelt cannot
// tell a mkdir from a rename, so Doan creates it outside the fence (prepare.ts). The path rule mirrors the CLI's, cut and hash included.
export function cursorWorkerDir(at: { home: string; cwd: string; tmpdir: string | undefined }, exists: (path: string) => boolean = existsSync): string {
  const data = join(at.home, ".cursor"), tmp = (at.tmpdir || "/tmp").replace(/(.)\/$/, "$1");
  const base = [join(data, "projects"), data, join(tmp, ".cursor")].find(path => path.length <= 83) ?? "/tmp/.cursor";
  let workspace = at.cwd;
  for (let dir = at.cwd; dirname(dir) !== dir; dir = dirname(dir)) if (exists(join(dir, ".git"))) { workspace = dir; break; }
  const slug = workspace.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const path = join(base, slug);
  return path.length > 91 ? `${path.slice(0, 83)}-${createHash("sha256").update(path).digest("hex").slice(0, 7)}` : path;
}
// Every Codex process loads <CODEX_HOME>/.env, which decides what its unsandboxed children run, so the agent must not
// write it and AuthManager removes one before any Codex process starts.
export const CODEX_DOTENV = ".env";
// Denied in Codex's permission profiles, so an approved escalated command, which keeps only deny entries, cannot write
// them either.
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
// Copilot runs unsigned JavaScript from its profile package cache, and Cursor's Node runs any compile-cache entry with a
// matching header; both CLIs write those caches, so every process Doan starts for them runs in the outer fence.
export const fencedEverywhere = (provider: Provider) => provider === "copilot" || provider === "cursor";
// Outside conversations: processes that start agent-writable MCP servers (.claude.json; for the usage read also any
// .mcp.json above its cwd), and every Copilot and Cursor process. null: no fence can be built, so do not start.
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
  // A pasted file is <store>/<id>/<file> (attachments.ts). Each path is resolved like userData, so one recorded through a
  // link still matches; one that does not resolve stays closed.
  const dirs: string[] = [];
  for (const recorded of input.attachments) {
    let path: string; try { path = realpath(recorded); } catch { continue; }
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir.startsWith(`${store}/`) && !dir.slice(store.length + 1).includes("/") && !dirs.includes(dir)) dirs.push(dir);
  }
  return { userData, profile, attachments: dirs };
}

// Each listed directory's entries, as fenceListingDirs names them. A link gets a file rule: Doan makes no link inside
// userData that points back into it.
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
// Entries off the way to an allowed path, denied by name: Codex drops a profile's narrower allow entries under a deny for
// approved escalated commands. An entry made after the listing is not denied.
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
// Codex permission profiles: deny entries are what sandboxed commands and approved escalations keep. denied is listed
// at server start, so a later entry is not denied for its life (ARCHITECTURE §7 'Fence').
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
// A profile server never gets a sandboxPolicy: combined with a profile it closes all of userData. A mode the mechanism does
// not hold is refused rather than run unfenced; the service restarts the server first (codexRestart).
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
