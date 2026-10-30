import type { FolderEntry } from "../main/view";
import { MAX_SCALE, MIN_SCALE } from "../renderer/viewport";
import type { UiState, UiView } from "./uiState";

// After this long a root that is still loading no longer holds the restore.
export const RESTORE_LOADING_WAIT_MS = 10_000;

export type RestorePlan =
  | { kind: "home" }
  // The saved root is still loading; ask again when the list changes or time passes.
  | { kind: "wait" }
  // `canvas: null` is the overview. `missingCanvas` is the saved path that is
  // no longer listed, for the "is no longer in .doan/canvases/" toast; `duplicateId`
  // is the saved canvas id now used by several rows. `view` is applied as the
  // canvas opens; the board stays hidden until its first layout.
  | { kind: "workspace"; root: string; canvas: { path: string; view?: UiView } | null; missingCanvas?: string; duplicateId?: { id: string; count: number } };

// `elapsedMs` is time since the restore started; the caller owns the clock.
export function restorePlan(state: UiState | null, entries: readonly FolderEntry[], elapsedMs: number): RestorePlan {
  if (state === null || state.screen === "home" || state.root === undefined) return { kind: "home" };
  const { root } = state;
  const entry = entries.find((candidate) => candidate.path === root);
  if (entry === undefined) return { kind: "home" };
  if (entry.kind === "loading") return elapsedMs >= RESTORE_LOADING_WAIT_MS ? { kind: "home" } : { kind: "wait" };
  // A problem row never enters a workspace (ARCHITECTURE §7 'Memory'), restored or not.
  if (entry.kind !== "list") return { kind: "home" };
  if (state.canvas === undefined) return { kind: "workspace", root, canvas: null };
  // The saved id wins over the saved path: the file may have moved, or another
  // canvas may now sit at the path. No row with the id falls back to the path.
  const { canvasId } = state;
  const same = canvasId === undefined ? [] : entry.canvases.filter((row) => row.id === canvasId);
  if (canvasId !== undefined && same.length > 1) return { kind: "workspace", root, canvas: null, duplicateId: { id: canvasId, count: same.length } };
  const path = same[0]?.path ?? state.canvas;
  if (!entry.canvases.some((row) => row.path === path)) return { kind: "workspace", root, canvas: null, missingCanvas: path };
  return { kind: "workspace", root, canvas: state.view === undefined ? { path } : { path, view: { ...state.view, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale)) } } };
}
