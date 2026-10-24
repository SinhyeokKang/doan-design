import { posix } from "node:path";
import type { CliRun } from "../folderState";

export type Agent = "claude" | "codex";
export type LinkState = "missing" | "ours" | "link-other" | "blocked";
export type StubState = "missing" | "ours" | "differs" | "blocked";
export type McpState = "missing" | "ours" | "other" | "unknown";

// The I/O shell must lstat ancestors too: ENOENT alone cannot prove a safe
// destination if an ancestor is a symlink. Never follow a blocked parent.
export type PathStat = (
  | { kind: "missing" | "file" | "directory" | "symlink" | "other" }
  | { kind: "error"; code: string }
) & { parentBlocked?: boolean };

export interface LinkRead {
  value: string;
  // Resolve relative targets and disk spelling in the I/O shell. null means
  // dangling/unresolvable; lowercasing would merge distinct case-sensitive files.
  resolved: string | null;
}

export function linkState(lstat: PathStat, readlink: LinkRead | null, expected: string): LinkState {
  if (lstat.parentBlocked) return "blocked";
  if (lstat.kind === "missing") return "missing";
  if (lstat.kind !== "symlink" || readlink === null) return "blocked";
  return readlink.resolved !== null && readlink.resolved === expected ? "ours" : "link-other";
}

export function stubState(dirLstat: PathStat, fileLstat: PathStat, content: string | null, bundled: string): StubState {
  if (dirLstat.parentBlocked || fileLstat.parentBlocked) return "blocked";
  if (dirLstat.kind === "missing") return "missing";
  if (dirLstat.kind !== "directory") return "blocked";
  if (fileLstat.kind === "missing") return "missing";
  if (fileLstat.kind !== "file" || content === null) return "blocked";
  return content === bundled ? "ours" : "differs";
}

export interface McpRead extends CliRun {
  // Established by the selected configuration location, not Codex JSON.
  scope: "user" | "project" | "local";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mcpState(agent: Agent, output: McpRead, expected: string): McpState {
  if (output.timedOut || output.spawnError !== undefined || output.exitCode === null) return "unknown";
  if (agent === "codex" && output.exitCode === 1 && output.stdout.trim() === "" &&
    output.stderr.trim() === "Error: No MCP server named 'doan' found.") return "missing";
  if (output.exitCode !== 0) return "unknown";
  let value: unknown;
  try {
    value = JSON.parse(output.stdout);
  } catch {
    return "unknown";
  }
  if (!record(value)) return "unknown";
  let entry: unknown;
  if (agent === "claude") {
    // Passive Claude input is the selected .claude.json, never `mcp get`
    // output: that command starts the server as a health check (PoC 7c).
    if (!("mcpServers" in value)) return "missing";
    if (!record(value.mcpServers)) return "unknown";
    if (!("doan" in value.mcpServers)) return "missing";
    entry = value.mcpServers.doan;
  } else {
    if (value.name !== "doan" || !record(value.transport)) return "unknown";
    if (value.enabled !== true) return "other";
    entry = value.transport;
  }
  if (!record(entry)) return "unknown";
  if (output.scope !== "user") return "other";
  if ((entry.type !== undefined && entry.type !== "stdio") || (agent === "codex" && entry.type !== "stdio")) return "other";
  return entry.command === expected && Array.isArray(entry.args) && entry.args.length === 1 && entry.args[0] === "mcp" ? "ours" : "other";
}

export type ShellProbe =
  | { ok: true; path: string; claudeConfigDir?: string; codexHome?: string }
  | { ok: false; reason: string };

export function parseShellProbe(stdout: string, nonce: string): ShellProbe {
  const lines = stdout.split(/\r?\n/);
  const begin = `DOAN_PROBE_${nonce}_BEGIN`;
  const end = `DOAN_PROBE_${nonce}_END`;
  const start = lines.indexOf(begin);
  if (!nonce || start < 0) return { ok: false, reason: "Shell probe start marker is missing." };
  const finish = lines.indexOf(end, start + 1);
  if (finish !== start + 4 || lines.lastIndexOf(begin) !== start || lines.lastIndexOf(end) !== finish) {
    return { ok: false, reason: "Shell probe output is incomplete or ambiguous." };
  }
  const path = lines[start + 1];
  const claudeConfigDir = lines[start + 2];
  const codexHome = lines[start + 3];
  if (!path || path.includes("\0") || claudeConfigDir?.includes("\0") || codexHome?.includes("\0")) return { ok: false, reason: "Shell probe PATH is empty or invalid." };
  return { ok: true, path, ...(claudeConfigDir ? { claudeConfigDir } : {}), ...(codexHome ? { codexHome } : {}) };
}

function pathEntries(path: string): string[] {
  return path.split(":").filter((entry) => posix.isAbsolute(entry) && !entry.includes("\0"));
}

// `exists` must mean an executable regular file; the I/O shell owns access/stat.
export function findOnPath(path: string, name: string, exists: (path: string) => boolean): string | null {
  if (!name || name.includes("/") || name.includes("\0")) return null;
  for (const dir of pathEntries(path)) {
    // Collapsing .. before filesystem lookup changes paths through symlinks.
    const candidate = `${dir.replace(/\/+$/, "")}/${name}`;
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function pathIncludes(path: string, dir: string): boolean {
  const trimTrailing = (value: string) => value.replace(/\/+$/, "") || "/";
  return posix.isAbsolute(dir) && pathEntries(path).some((entry) => trimTrailing(entry) === trimTrailing(dir));
}

export function rcFileFor(shell: string): string | null {
  switch (posix.basename(shell)) {
    case "zsh": return "~/.zshrc";
    case "bash": return "~/.bash_profile";
    default: return null;
  }
}

export function isTranslocated(path: string): boolean {
  return path.split("/").includes("AppTranslocation");
}

export function mcpAddArgs(agent: Agent, command: string): string[] {
  return ["mcp", "add", ...(agent === "claude" ? ["--scope", "user"] : []), "doan", "--", command, "mcp"];
}

export function mcpRemoveArgs(agent: Agent): string[] {
  return ["mcp", "remove", ...(agent === "claude" ? ["--scope", "user"] : []), "doan"];
}

export function initArgs(folder: string, tokenCss: string | null): string[] {
  return ["init", "--json", "--repo", folder, ...(tokenCss === null ? [] : ["--token-css", tokenCss])];
}

export function firstSentence(root: string): string {
  return `Use the doan skill to make a design canvas in ${root} for <what you want to design>.`;
}
