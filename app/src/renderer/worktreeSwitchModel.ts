import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasStem } from "./canvasTree";
import { cardRow, worktreeLabel, type RowAction } from "./homeCards";
import { displayPath } from "./projectDisplay";
import { shownFolders } from "./shellNavigation";

export { worktreeLabel };

type Choice = { kind: "open" } | { kind: "repair"; actions: RowAction[] };
type RowState = Choice | { kind: "disabled"; reason: string };

export function worktreeChoice(row: FolderEntry): Choice {
  if (row.kind === "list" || row.kind === "loading") return { kind: "open" };
  return { kind: "repair", actions: cardRow(row, null, null).actions.filter(action => action !== "remove" && action !== "showInFinder") };
}

export function worktreeSwitchModel(entries: readonly FolderEntry[], root: string, home: string | null, stateOf: (row: FolderEntry) => RowState = worktreeChoice) {
  const visible = shownFolders(entries);
  const current = visible.find(row => row.path === root);
  if (!current || !visible.some(row => row.kind === "list" ? row.git : row.lastCommon)) return null;
  const rows = visible.map(row => ({
    root: row.path, label: worktreeLabel(row), path: displayPath(row.path, home), current: row.path === root, state: stateOf(row),
    chip: row.kind === "list" || row.kind === "loading" ? undefined : cardRow(row, null, null).chip,
  }));
  return { label: worktreeLabel(current), path: displayPath(root, home), rows };
}
export type WorktreeModel = NonNullable<ReturnType<typeof worktreeSwitchModel>>;

export function headerMove(row: FolderEntry | undefined, path: string): { kind: "canvas"; root: string; path: string } | { kind: "stay" } {
  return row?.kind === "list" && row.canvases.some(canvas => canvas.path === path) ? { kind: "canvas", root: row.path, path } : { kind: "stay" };
}

export function headerRowState(row: FolderEntry, path: string): RowState {
  if (row.kind === "loading") return { kind: "disabled", reason: "Reading…" };
  if (row.kind !== "list") return { kind: "disabled", reason: cardRow(row, null, null).chip! };
  return headerMove(row, path).kind === "canvas" ? { kind: "open" } : { kind: "disabled", reason: `No ${canvasStem(path)} here` };
}

export type Crumb =
  | { kind: "project"; label: string; name: string }
  | { kind: "worktree"; model: WorktreeModel; reason: string | null }
  | { kind: "canvas"; label: string; path: string };

export function canvasCrumbs(card: { name: string; rows: readonly FolderEntry[] }, root: string, canvas: CanvasRow | null, home: string | null): Crumb[] {
  const current = card.rows.find(row => row.path === root);
  const listed = current?.kind === "list" && canvas && current.canvases.some(row => row.path === canvas.path);
  const crumbs: Crumb[] = [{ kind: "project", label: card.name, name: `${card.name} Overview` }];
  const model = worktreeSwitchModel(card.rows, root, home, row => headerRowState(row, canvas?.path ?? ""));
  if (model) {
    const reason = current?.kind !== "list" ? "Switching worktrees isn’t available while the canvas can’t be shown."
      : !listed ? "Switching worktrees isn’t available on a page that isn’t a listed canvas." : null;
    crumbs.push({ kind: "worktree", model, reason });
  }
  if (listed) crumbs.push({ kind: "canvas", label: canvasStem(canvas.path), path: canvas.path });
  return crumbs;
}
