import { posix } from "node:path";

export type ShellProbe =
  | { ok: true; path: string; claudeConfigDir?: string; codexHome?: string; promptSuggestion?: string }
  | { ok: false; reason: string };

export function parseShellProbe(stdout: string, nonce: string): ShellProbe {
  const lines = stdout.split(/\r?\n/);
  const begin = `DOAN_PROBE_${nonce}_BEGIN`;
  const end = `DOAN_PROBE_${nonce}_END`;
  const start = lines.indexOf(begin);
  if (!nonce || start < 0) return { ok: false, reason: "Shell probe start marker is missing." };
  const finish = lines.indexOf(end, start + 1);
  if (finish !== start + 5 || lines.lastIndexOf(begin) !== start || lines.lastIndexOf(end) !== finish) {
    return { ok: false, reason: "Shell probe output is incomplete or ambiguous." };
  }
  const path = lines[start + 1];
  const claudeConfigDir = lines[start + 2];
  const codexHome = lines[start + 3];
  // CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: the person's own setting, which wins over Doan's default (conversation/environment.ts).
  const promptSuggestion = lines[start + 4];
  if (!path || path.includes("\0") || claudeConfigDir?.includes("\0") || codexHome?.includes("\0") || promptSuggestion?.includes("\0")) return { ok: false, reason: "Shell probe PATH is empty or invalid." };
  return { ok: true, path, ...(claudeConfigDir ? { claudeConfigDir } : {}), ...(codexHome ? { codexHome } : {}), ...(promptSuggestion ? { promptSuggestion } : {}) };
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

export function isTranslocated(path: string): boolean {
  return path.split("/").includes("AppTranslocation");
}

export function initArgs(folder: string, tokenCss: string | null): string[] {
  return ["init", "--json", "--repo", folder, ...(tokenCss === null ? [] : ["--token-css", tokenCss])];
}
