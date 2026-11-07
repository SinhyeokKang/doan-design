// `<userData>/ui-state.json` (design-nav 'Restart restore'). Pure and shared:
// main validates what the renderer saves, and the restore plan reads the result.

import { validProvider, type Provider } from "../main/agentAuth/types";
import { readPermissionMode, type PermissionModeId } from "../main/conversation/permissionMode";
import { parseSettingsSection, type SettingsSection } from "../renderer/settingsSections";

export interface UiView {
  scale: number;
  x: number;
  y: number;
}

export interface ShellProject {
  roots: string[];
  selectedRoot?: string;
  selectedAt?: number;
  expanded: boolean;
  // The loaded project folded by its chevron (project-row-disclosure). Saved with the rest but not read back, so a
  // relaunch shows it unfolded.
  collapsed?: boolean;
  // The sidebar groups the person closed, by fixed id; a missing one is open.
  groups?: { ds?: false; canvases?: false };
}

export interface HomeModel {
  model: string;
  effort?: string;
}

// The Home composer's last choices on this device (buzz-home). Readiness and
// model lists are only known at run time, so their users ignore stale values.
export interface HomeMemory {
  lastRoot?: string;
  lastProvider?: Provider;
  models?: Partial<Record<Provider, HomeModel>>;
  // Each provider's last permission mode, apart from `models`: a mode is kept even when no model was read
  // (permission-mode design '저장 규칙'). Default is no entry.
  permissions?: Partial<Record<Provider, PermissionModeId>>;
  // Each provider's last Fast, apart from `models` like `permissions`. Off is no entry.
  fast?: Partial<Record<Provider, true>>;
}

export interface UiState {
  shellProjects?: Record<string, ShellProject>;
  screen: "home" | "workspace";
  root?: string;
  canvas?: string;
  // The open canvas's id, so a restart follows a canvas moved while the app was closed.
  canvasId?: string;
  view?: UiView;
  expanded: Record<string, string[]>;
  lastByRoot: Record<string, { canvas: string; view: UiView }>;
  home?: HomeMemory;
  // The Settings page's last category. The page itself is not restored; only where it opens next.
  settingsSection?: SettingsSection;
  // The project conversation last shown in each root's Overview. Top-level, not in
  // `shellProjects`: those entries are rebuilt per group on every save and would drop it.
  conversationByRoot?: Record<string, string>;
  // The canvas page's conversation panel, one per device. A missing `width` is the
  // window-relative default, which only the renderer can compute.
  rightPanel?: { open: boolean; width?: number };
  // The Overview's canvas conversations panel, apart from the canvas panel's. Missing is
  // its default.
  overviewPanel?: { width: number };
  // The shell sidebar, one per device: its width (missing is the default; the renderer clamps a kept width) and whether
  // it is hidden (only `true` is stored). Each is read on its own; with neither the field is left out.
  sidebar?: { width?: number; hidden?: true };
  // The canvas tool last chosen on this device (canvas-hand-tool design '기기 저장'). Only Hand is stored; a missing
  // field is Select.
  canvasTool?: "hand";
}

export const UI_STATE_MAX_BYTES = 64 * 1024;
// No window is wider; the renderer clamps a kept width (the panel's or the sidebar's) to its own bounds.
const RIGHT_PANEL_MAX_SAVED_WIDTH = 10_000;

// The kebab canvas id rule `doan check` enforces (`cli/internal/check/check.go`).
const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// The conversation id rule main's history files enforce (`main/conversation/io.ts`).
const CONVERSATION_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

// A broken file or a size over the limit is `null`, which starts at home. A
// wrong-typed optional field or map entry is dropped on its own so one bad
// entry does not cost the rest. Roots outside `savedRoots` are dropped
// everywhere: a removed project must not keep memory. The scale is kept as
// saved; the restore plan clamps it.
// `spellings` (FolderStore.spellings) map another spelling of a listed root to the listed one: memory kept under it is
// read under the listed root before the filter, so the same project is not dropped as a removed one.
export function parseUiState(text: string, savedRoots: readonly string[], spellings: ReadonlyMap<string, string> = new Map()): UiState | null {
  if (new TextEncoder().encode(text).length > UI_STATE_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const value = spellings.size > 0 ? renameUiRoots(parsed, spellings) : parsed;
  const screen = value["screen"];
  if (screen !== "home" && screen !== "workspace") return null;
  const saved = new Set(savedRoots);
  const root = typeof value["root"] === "string" && saved.has(value["root"]) ? value["root"] : undefined;
  const canvas = root !== undefined && typeof value["canvas"] === "string" && value["canvas"] !== "" ? value["canvas"] : undefined;
  const view = canvas !== undefined ? parseView(value["view"]) : undefined;
  const canvasId = canvas !== undefined && typeof value["canvasId"] === "string" && CANVAS_ID.test(value["canvasId"]) ? value["canvasId"] : undefined;
  const state: UiState = {
    screen: root === undefined ? "home" : screen,
    expanded: entries(value["expanded"], saved, (item) => (Array.isArray(item) ? item.filter((name) => typeof name === "string") : undefined)),
    lastByRoot: entries(value["lastByRoot"], saved, (item) => {
      if (!isRecord(item) || typeof item["canvas"] !== "string") return undefined;
      const itemView = parseView(item["view"]);
      return itemView === undefined ? undefined : { canvas: item["canvas"], view: itemView };
    }),
  };
  if (isRecord(value["shellProjects"])) {
    const projects: [string, ShellProject][] = [];
    for (const [key, item] of Object.entries(value["shellProjects"])) {
      if (!isRecord(item) || !Array.isArray(item.roots) || typeof item.expanded !== "boolean") continue;
      const roots = [...new Set(item.roots.filter((root): root is string => typeof root === "string" && saved.has(root)))];
      if (!roots.length) continue;
      const project: ShellProject = { roots, expanded: item.expanded };
      if (typeof item.selectedRoot === "string" && roots.includes(item.selectedRoot)) {
        project.selectedRoot = item.selectedRoot;
        if (typeof item.selectedAt === "number" && Number.isFinite(item.selectedAt) && item.selectedAt >= 0 && item.selectedAt <= 8.64e15) project.selectedAt = item.selectedAt;
      }
      const groups = parseGroups(item.groups);
      if (groups) project.groups = groups;
      projects.push([key, project]);
    }
    state.shellProjects = Object.fromEntries(projects);
  }
  if (isRecord(value["conversationByRoot"])) state.conversationByRoot = entries(value["conversationByRoot"], saved, (item) => (typeof item === "string" && CONVERSATION_ID.test(item) ? item : undefined));
  const rightPanel = parseRightPanel(value["rightPanel"]);
  if (rightPanel !== undefined) state.rightPanel = rightPanel;
  const overviewWidth = isRecord(value["overviewPanel"]) ? value["overviewPanel"]["width"] : undefined;
  if (savedWidth(overviewWidth)) state.overviewPanel = { width: overviewWidth };
  if (isRecord(value["sidebar"])) {
    const width = value["sidebar"]["width"], hidden = value["sidebar"]["hidden"] === true;
    if (savedWidth(width) || hidden) state.sidebar = { ...(savedWidth(width) ? { width } : {}), ...(hidden ? { hidden: true } : {}) };
  }
  if (value["canvasTool"] === "hand") state.canvasTool = "hand";
  if (isRecord(value["home"])) state.home = parseHome(value["home"], saved);
  // `settingsTab` is the old Settings window's field, read until the renderer first saves `settingsSection`.
  // Settings > Connections was removed; a stored one opens About.
  const restored = (stored: unknown) => stored === "connections" ? "about" : parseSettingsSection(stored);
  const section = restored(value["settingsSection"]) ?? restored(value["settingsTab"]);
  if (section !== null) state.settingsSection = section;
  if (root !== undefined) state.root = root;
  if (canvas !== undefined) state.canvas = canvas;
  if (canvasId !== undefined) state.canvasId = canvasId;
  if (view !== undefined) state.view = view;
  return state;
}

// Rewrites every root this file keys or names (the open place, `expanded`, `lastByRoot`, `shellProjects` keys, roots
// and selection, `conversationByRoot`, `home.lastRoot`) from each spelling in `aliases` to the one it maps to, on the
// raw value so parseUiState still validates the result. Where both spellings hold a value the target's wins, per map
// key and per `shellProjects` field; the other fills only what the target lacks.
export function renameUiRoots(value: Record<string, unknown>, aliases: ReadonlyMap<string, string>): Record<string, unknown> {
  const real = (root: unknown) => typeof root === "string" ? aliases.get(root) ?? root : root;
  const rekey = (map: unknown, merge: (kept: unknown, alias: unknown) => unknown = kept => kept): unknown => {
    if (!isRecord(map)) return map;
    const next: Record<string, unknown> = Object.fromEntries(Object.entries(map).filter(([key]) => !aliases.has(key)));
    for (const [key, item] of Object.entries(map)) {
      const to = aliases.get(key);
      if (to === undefined) continue;
      next[to] = Object.hasOwn(next, to) ? merge(next[to], item) : item;
    }
    return next;
  };
  const project = (item: unknown): unknown => !isRecord(item) ? item : {
    ...item,
    ...(Array.isArray(item.roots) ? { roots: item.roots.map(real) } : {}),
    ...("selectedRoot" in item ? { selectedRoot: real(item.selectedRoot) } : {}),
  };
  const next: Record<string, unknown> = { ...value, root: real(value["root"]) };
  if (!("root" in value)) delete next["root"];
  for (const key of ["expanded", "lastByRoot", "conversationByRoot"]) if (key in value) next[key] = rekey(value[key]);
  if (isRecord(value["shellProjects"])) {
    const projects = Object.fromEntries(Object.entries(value["shellProjects"]).map(([key, item]) => [key, project(item)]));
    next["shellProjects"] = rekey(projects, (kept, alias) => isRecord(kept) && isRecord(alias) ? { ...alias, ...kept } : kept);
  }
  if (isRecord(value["home"])) next["home"] = { ...value["home"], ...("lastRoot" in value["home"] ? { lastRoot: real(value["home"]["lastRoot"]) } : {}) };
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Only a closed flag under a known id is kept; anything else reads as open.
function parseGroups(value: unknown): ShellProject["groups"] {
  if (!isRecord(value)) return undefined;
  const groups: NonNullable<ShellProject["groups"]> = {};
  if (value["ds"] === false) groups.ds = false;
  if (value["canvases"] === false) groups.canvases = false;
  return Object.keys(groups).length ? groups : undefined;
}

function parseHome(value: Record<string, unknown>, saved: ReadonlySet<string>): HomeMemory {
  const home: HomeMemory = {};
  if (typeof value["lastRoot"] === "string" && saved.has(value["lastRoot"])) home.lastRoot = value["lastRoot"];
  if (validProvider(value["lastProvider"])) home.lastProvider = value["lastProvider"];
  if (isRecord(value["models"])) {
    const models: [Provider, HomeModel][] = [];
    for (const [provider, item] of Object.entries(value["models"])) {
      if (!validProvider(provider) || !isRecord(item) || !nonEmpty(item["model"])) continue;
      models.push([provider, nonEmpty(item["effort"]) ? { model: item["model"], effort: item["effort"] } : { model: item["model"] }]);
    }
    home.models = Object.fromEntries(models);
  }
  // A mode this build does not know (a later build's, or a damaged entry) reads as Default for that provider only.
  if (isRecord(value["permissions"])) {
    const permissions: [Provider, PermissionModeId][] = [];
    for (const [provider, item] of Object.entries(value["permissions"])) {
      const mode = readPermissionMode(item);
      if (validProvider(provider) && mode !== "default") permissions.push([provider, mode]);
    }
    home.permissions = Object.fromEntries(permissions);
  }
  if (isRecord(value["fast"])) {
    const fast: [Provider, true][] = [];
    for (const [provider, on] of Object.entries(value["fast"])) if (validProvider(provider) && on === true) fast.push([provider, true]);
    home.fast = Object.fromEntries(fast);
  }
  return home;
}

// Each field falls back on its own; a value with neither field usable is dropped so it reads as the default.
function parseRightPanel(value: unknown): UiState["rightPanel"] {
  if (!isRecord(value)) return undefined;
  const open = typeof value["open"] === "boolean" ? value["open"] : undefined;
  const raw = value["width"];
  const width = typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= RIGHT_PANEL_MAX_SAVED_WIDTH ? raw : undefined;
  if (open === undefined && width === undefined) return undefined;
  return width === undefined ? { open: open ?? true } : { open: open ?? true, width };
}

function savedWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= RIGHT_PANEL_MAX_SAVED_WIDTH;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function parseView(value: unknown): UiView | undefined {
  if (!isRecord(value)) return undefined;
  const { scale, x, y } = value;
  if (typeof scale !== "number" || typeof x !== "number" || typeof y !== "number") return undefined;
  if (!Number.isFinite(scale) || !Number.isFinite(x) || !Number.isFinite(y) || scale <= 0) return undefined;
  return { scale, x, y };
}

// `Object.fromEntries` defines own properties, so a `__proto__` key could not
// reach the prototype even if a saved root were named that.
function entries<T>(value: unknown, saved: ReadonlySet<string>, read: (item: unknown) => T | undefined): Record<string, T> {
  if (!isRecord(value)) return {};
  const kept: [string, T][] = [];
  for (const [root, item] of Object.entries(value)) {
    if (!saved.has(root)) continue;
    const parsed = read(item);
    if (parsed !== undefined) kept.push([root, parsed]);
  }
  return Object.fromEntries(kept);
}

// A per-root map without the removed roots, so a removed project keeps no memory until the next read prunes it.
export function withoutRoots<T>(map: Readonly<Record<string, T>>, removed: readonly string[]): Record<string, T> {
  const gone = new Set(removed);
  return Object.fromEntries(Object.entries(map).filter(([root]) => !gone.has(root)));
}
