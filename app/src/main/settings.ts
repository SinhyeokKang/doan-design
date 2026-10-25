import { displayPath } from "../renderer/projectDisplay";
import type { FolderEntry } from "./view";

// Pure parts of the Settings window (app-setup design 'Settings 창'). Kept free
// of Electron so the request parsers can be tested on their own.

export type SettingsTab = "connections" | "projects";
export type ConnectionRow = "cli" | "claude" | "codex";
// Where main opens Settings: a home chip, the banner's Fix…, a row's Project Settings….
export type SettingsTarget = { tab: "connections"; connection?: ConnectionRow } | { tab: "projects"; project?: string };
export type ExternalTarget = "claude" | "codex";
// Problem-row actions that belong to the main window; Show in Finder runs in main directly.
export type ForwardedAction = "setUp" | "locate" | "remove" | "retry" | "details";

export const SETTINGS_TITLES: Record<SettingsTab, string> = { connections: "Connections", projects: "Projects" };

export const SETTINGS_WINDOW = { width: 640, height: 560, resizable: false, minimizable: false, maximizable: false, fullscreenable: false } as const;

// The only pages `setup:open-external` opens; the renderer names one by enum.
// Checked 2026-10-25: the official install pages (the Codex CLI page is where
// developers.openai.com/codex/cli redirects).
export const INSTALL_URLS: Record<ExternalTarget, string> = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://learn.chatgpt.com/docs/codex/cli",
};

// What the Projects tab may see of a saved project: enough to group rows by
// repository, name a worktree like Home (`branch`, else `detached <first 7 of
// sha>`) and pick a chip, nothing of its canvases. `displayPath` is `path`
// shortened as Home shows it, so the window needs no home directory of its own.
export interface ProjectRow {
  path: string;
  displayPath: string;
  kind: FolderEntry["kind"];
  lastCommon?: string;
  git?: { common: string; main?: string; branch?: string; detached?: string };
}

const CONNECTION_ROWS: readonly string[] = ["cli", "claude", "codex"];
const FORWARDED: readonly string[] = ["setUp", "locate", "remove", "retry", "details"];

function exact(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
}

export function parseSettingsTab(value: unknown): SettingsTab | null {
  return value === "connections" || value === "projects" ? value : null;
}

export function parseSettingsTarget(value: unknown, stored: (root: string) => boolean): SettingsTarget | null {
  if (exact(value, ["tab"], ["connection"]) && value.tab === "connections") {
    if (value.connection === undefined) return { tab: "connections" };
    return typeof value.connection === "string" && CONNECTION_ROWS.includes(value.connection) ? { tab: "connections", connection: value.connection as ConnectionRow } : null;
  }
  if (exact(value, ["tab"], ["project"]) && value.tab === "projects") {
    if (value.project === undefined) return { tab: "projects" };
    return typeof value.project === "string" && stored(value.project) ? { tab: "projects", project: value.project } : null;
  }
  return null;
}

export function projectRows(entries: readonly FolderEntry[], home: string | null): ProjectRow[] {
  return entries.map(entry => {
    const row: ProjectRow = { path: entry.path, displayPath: displayPath(entry.path, home), kind: entry.kind };
    if (entry.lastCommon !== undefined) row.lastCommon = entry.lastCommon;
    if (entry.kind === "list" && entry.git) {
      const { common, main, branch, detached } = entry.git;
      row.git = { common, ...(main === undefined ? {} : { main }), ...(branch === undefined ? {} : { branch }), ...(detached === undefined ? {} : { detached }) };
    }
    return row;
  });
}

export function parseForwardedAction(value: unknown, stored: (root: string) => boolean): { path: string; action: ForwardedAction } | null {
  if (!exact(value, ["path", "action"]) || typeof value.path !== "string" || typeof value.action !== "string") return null;
  return FORWARDED.includes(value.action) && stored(value.path) ? { path: value.path, action: value.action as ForwardedAction } : null;
}

export function parseExternalTarget(value: unknown): ExternalTarget | null {
  return exact(value, ["target"]) && (value.target === "claude" || value.target === "codex") ? value.target : null;
}
