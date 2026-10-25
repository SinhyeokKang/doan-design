// `<userData>/ui-state.json` (design-nav 'Restart restore'). Pure and shared:
// main validates what the renderer saves, and the restore plan reads the result.

export interface UiView {
  scale: number;
  x: number;
  y: number;
}

export interface UiState {
  screen: "home" | "workspace";
  root?: string;
  canvas?: string;
  // The open canvas's id, so a restart follows a canvas moved while the app was closed.
  canvasId?: string;
  view?: UiView;
  expanded: Record<string, string[]>;
  lastByRoot: Record<string, { canvas: string; view: UiView }>;
}

export const UI_STATE_MAX_BYTES = 64 * 1024;

// The kebab id rule main's comment files enforce (`main/comments/files.ts`).
const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A broken file or a size over the limit is `null`, which starts at home. A
// wrong-typed optional field or map entry is dropped on its own so one bad
// entry does not cost the rest. Roots outside `savedRoots` are dropped
// everywhere: a removed project must not keep memory. The scale is kept as
// saved; the restore plan clamps it.
export function parseUiState(text: string, savedRoots: readonly string[]): UiState | null {
  if (new TextEncoder().encode(text).length > UI_STATE_MAX_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
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
  if (root !== undefined) state.root = root;
  if (canvas !== undefined) state.canvas = canvas;
  if (canvasId !== undefined) state.canvasId = canvasId;
  if (view !== undefined) state.view = view;
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
