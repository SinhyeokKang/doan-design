import { canvasById, refreshCanvasAnchor } from "../main/conversation/canvasAnchors";
import { LIMITS } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { distinctTargets, normalize, plainText, type FieldSegment } from "./anchorField";
import { ADD_TO_MESSAGE_CAPTURING, ANCHOR_LIMIT_TEXT } from "./canvasPicker";
import { groupProjects } from "./homeCards";
import { projectReadingLine, projectUnavailableLine } from "./problemView";

export const CANVAS_CHIP_UNREADABLE = "Can’t read this canvas.";
export const CANVAS_CHIP_NO_ID = "This canvas has no ID, so it can’t go in a message. Run doan check in a terminal to see why.";
export const CANVAS_CHIP_SHARED_ID = "Another canvas has the same ID, so this one can’t go in a message. Run doan check in a terminal to find it.";
export const CANVAS_CHIP_NO_COMPOSER = "Open Home, the Overview or a canvas to add this to a message.";
export const CANVAS_CHIP_PICKING = "Finish or cancel the pick first.";
export const CANVAS_CHIP_COMPOSING = "Finish typing first.";

// The visible composer registers this, so the row menu and a drop judge it the same way.
export interface CanvasChipComposer { root: string; canTake(anchor: Anchor): string | null }
export type CanvasChipScreen = "canvas" | "overview" | "home" | "noComposer" | "prototype";
// entries: every folder row, for the row's list and for telling another worktree of the same project from another project.
export interface CanvasChipRow { root: string; canvas: CanvasRow; entries: readonly FolderEntry[] }

function basename(path: string): string { return path.split("/").filter(Boolean).at(-1) ?? path; }

function projectOf(entries: readonly FolderEntry[], root: string): { key: string; name: string } {
  const card = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))
    .find(each => each.rows.some(row => row.path === root));
  return card ? { key: card.key, name: card.name } : { key: root, name: basename(root) };
}

// `doan ls` may list an empty id, which names nothing.
export function canvasRowIdReason(row: CanvasRow, rows: readonly CanvasRow[]): string | null {
  if (!row.id) return CANVAS_CHIP_NO_ID;
  return canvasById(rows, row.id) === "duplicate" ? CANVAS_CHIP_SHARED_ID : null;
}

// null: the composer can take the row's chip. The root comes first, since dragging from the composer's own project is the fix.
export function canvasChipTarget(row: CanvasChipRow, screen: CanvasChipScreen, composer: CanvasChipComposer | null): string | null {
  if (screen === "noComposer" || screen === "prototype" || composer === null) return CANVAS_CHIP_NO_COMPOSER;
  const here = projectOf(row.entries, composer.root);
  if (composer.root !== row.root) {
    if (here.key !== projectOf(row.entries, row.root).key) return `Only canvases in ${here.name} can go in this message.`;
    const entry = row.entries.find(each => each.path === composer.root);
    const git = entry?.kind === "list" ? entry.git : undefined;
    return `Only canvases on ${git?.branch ?? basename(composer.root)} can go in this message.`;
  }
  if (row.canvas.error) return CANVAS_CHIP_UNREADABLE;
  const entry = row.entries.find(each => each.path === row.root);
  if (entry?.kind === "loading") return projectReadingLine(here.name);
  if (entry?.kind !== "list") return projectUnavailableLine(here.name);
  const idReason = canvasRowIdReason(row.canvas, entry.canvases);
  if (idReason !== null || !row.canvas.id) return idReason;
  return composer.canTake({ canvas: { path: row.canvas.path, id: row.canvas.id } });
}

// The chip field's side of canTake. blocked: the composer's own sentence while it takes no input.
export interface ChipFieldState { blocked: string | null; capturing: boolean; picking: boolean; composing: boolean; segments: readonly FieldSegment[]; reserved?: readonly FieldSegment[] }
export function chipFieldTakes(state: ChipFieldState, anchor: Anchor): string | null {
  if (state.blocked !== null) return state.blocked;
  if (state.capturing) return ADD_TO_MESSAGE_CAPTURING;
  if (state.picking) return CANVAS_CHIP_PICKING;
  if (state.composing) return CANVAS_CHIP_COMPOSING;
  const after = [...state.reserved ?? [], ...state.segments, { kind: "chip" as const, anchor }];
  return distinctTargets(after) > LIMITS.anchors ? ANCHOR_LIMIT_TEXT : null;
}

// Home's chips all belong to the root they were added in, so a draft that lands in another root (a switch, Edit on
// Home) keeps their names only; switching back does not bring them back.
export function homeRootChange(segments: readonly FieldSegment[], from: string, to: string, entries: readonly FolderEntry[]): { segments: readonly FieldSegment[]; notice: string | null } {
  const count = segments.filter(segment => segment.kind === "chip" && segment.anchor.canvas).length;
  if (from === to || count === 0) return { segments, notice: null };
  const next = normalize(segments.map(segment => (segment.kind === "chip" && segment.anchor.canvas ? { kind: "text" as const, text: plainText([segment]) } : segment)));
  const where = projectOf(entries, from).key === projectOf(entries, to).key ? "on another worktree" : "in another project";
  const notice = count === 1 ? `1 canvas chip became plain text. Its canvas is ${where}.` : `${count} canvas chips became plain text. Their canvases are ${where}.`;
  return { segments: next, notice };
}

// A missing or shared id is left as it is: send and press handle it. The same array when nothing changed.
export function refreshCanvasSegments(segments: readonly FieldSegment[], rows: readonly CanvasRow[]): readonly FieldSegment[] {
  const next = segments.map(segment => {
    if (segment.kind !== "chip") return segment;
    const anchor = refreshCanvasAnchor(segment.anchor, rows);
    return anchor === segment.anchor ? segment : { kind: "chip" as const, anchor };
  });
  return next.some((segment, i) => segment !== segments[i]) ? next : segments;
}
