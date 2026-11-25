import type { Selection } from "../formats/types";
import type { CanvasRow } from "../main/view";
import type { CanvasRect, LayoutMessage, SelectionMessage, SelectTarget } from "./canvasMessage";
import { sameDocument, type CanvasViewUpdate } from "./canvasView";

// The rect stays in CanvasController so a pan or a scroll never re-renders React.
export type SelectionView = Omit<SelectTarget, "rect">;

export const SELECTION_LOST = "The selection is no longer in the canvas.";

// A toast, not a board notice: as one it stayed indefinitely and competed with the agent notice at the top centre.
export function noticeToast(previous: string, next: string): string | null {
  return next && next !== previous ? next : null;
}

export interface Expectation {
  href: string | null;
  height: number;
  seq: number;
}

function viewportCurrent(expected: Expectation, viewport: number): boolean {
  // 1px: the same rule as layoutHeight.
  return Math.abs(viewport - expected.height) <= 1;
}

// A message older than the last command the renderer sent is dropped. A rect measured at another iframe height is
// stale; a select still counts and its rect follows with the next layout.
export function acceptSelectionMessage(expected: Expectation, message: SelectionMessage): "drop" | "apply" | "applyWithoutRect" {
  if (expected.href === null || !sameDocument(expected.href, message.href)) return "drop";
  // A key is the person's intent whatever the canvas was doing.
  if (message.type === "key") return "apply";
  if (message.seq < expected.seq) return "drop";
  if (message.type === "clear" || viewportCurrent(expected, message.viewport)) return "apply";
  if (message.type === "hover") return "drop";
  return message.target === null ? "apply" : "applyWithoutRect";
}

// undefined: nothing to apply. null: the script lost the element.
export function selectedFromLayout(expected: Expectation, layout: LayoutMessage): CanvasRect | null | undefined {
  if (layout.selected === undefined || layout.seq === undefined || layout.seq < expected.seq) return undefined;
  if (layout.selected === null) return null;
  return viewportCurrent(expected, layout.viewport) ? layout.selected : undefined;
}

export type SelectionTrigger =
  | { kind: "reload"; idChanged?: boolean }
  | { kind: "moved" | "resize" | "none" | "errorLine" | "loadFailed" | "anchorLost" | "unlisted" | "otherCanvas" }
  | { kind: "clear"; reason: Extract<CanvasViewUpdate, { kind: "clear" }>["reason"] };

// A move is the same canvas reloaded at another path; a new id at the same path is another canvas.
export function selectionAfter(trigger: SelectionTrigger): { keep: boolean; mark: boolean; notice: boolean } {
  switch (trigger.kind) {
    case "reload": return trigger.idChanged ? { keep: false, mark: false, notice: false } : { keep: true, mark: false, notice: false };
    case "moved": return { keep: true, mark: false, notice: false };
    case "resize":
    case "none":
    case "errorLine": return { keep: true, mark: true, notice: false };
    case "anchorLost": return { keep: false, mark: false, notice: true };
    case "loadFailed":
    case "unlisted":
    case "otherCanvas":
    case "clear": return { keep: false, mark: false, notice: false };
  }
}

// root and canvas come from renderer state, never from the canvas; only app-socket selection schema fields go to main.
export function mainSelection(open: { folder: string; canvas: string; row: Pick<CanvasRow, "id"> }, view: SelectionView): Selection {
  const selection: Selection = { root: open.folder, canvas: { path: open.canvas } };
  if (open.row.id) selection.canvas.id = open.row.id;
  if (view.frame) selection.frame = view.frame.title === undefined ? { id: view.frame.id } : { id: view.frame.id, title: view.frame.title };
  if (view.element) selection.element = view.element;
  return selection;
}

// They then neither ask about the draft nor take Esc's default action.
export function shouldGuardEscape(selection: SelectionView | null, reanchor: AnchorRequest | null): boolean {
  return selection !== null || reanchor !== null;
}

export interface AnchorRequest {
  frame?: string;
  doanId?: string;
  selector?: string;
}

export function anchorRequest(view: SelectionView): AnchorRequest {
  if (view.element) return view.element.doanId === undefined ? { selector: view.element.selector } : { doanId: view.element.doanId, selector: view.element.selector };
  const request: AnchorRequest = {};
  if (view.frame) request.frame = view.frame.id;
  const own = view.path.at(-1);
  if (own) request.selector = own.selector;
  return request;
}

// Up to two decimals, trailing zeros dropped.
export function canvasPx(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function sizeLabel(rect: CanvasRect): string {
  return `${canvasPx(rect.width)} × ${canvasPx(rect.height)}`;
}

// Esc in a text field belongs to the field.
export function editableTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const { tagName } = target;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || ("isContentEditable" in target && target.isContentEditable === true);
}
