import type { Selection } from "../formats/types";
import type { CanvasRow } from "../main/view";
import type { CanvasRect, LayoutMessage, SelectionMessage, SelectTarget } from "./canvasMessage";
import { sameDocument, type CanvasViewUpdate } from "./canvasView";

// What the panel and sidebar show; the rect stays in CanvasController so a
// pan or a scroll never re-renders React.
export type SelectionView = Omit<SelectTarget, "rect">;

export const SELECTION_LOST = "The selection is no longer in the canvas.";

// What the renderer last asked of or heard from the canvas script: its
// document, the iframe height (the script's innerHeight) and the seq.
export interface Expectation {
  href: string | null;
  height: number;
  seq: number;
}

function viewportCurrent(expected: Expectation, viewport: number): boolean {
  // 1px: the same rule as layoutHeight.
  return Math.abs(viewport - expected.height) <= 1;
}

// Design flow 4. A message from another document, or older than the last
// command the renderer sent (an Esc, a path step, a frame pick), is dropped.
// A rect measured at another iframe height is stale; a select still counts
// and its rect follows with the next layout.
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

// Design flow 7 'selection by state'. `mark`: whether the overlay shows it. A
// move is the same canvas reloaded at another path; a new id at the same path
// is another canvas.
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

// root and canvas come from renderer state (what main listed), never from the
// canvas; only fields of the app-socket selection schema go to main.
export function mainSelection(open: { folder: string; canvas: string; row: Pick<CanvasRow, "id"> }, view: SelectionView): Selection {
  const selection: Selection = { root: open.folder, canvas: { path: open.canvas } };
  if (open.row.id) selection.canvas.id = open.row.id;
  if (view.frame) selection.frame = view.frame.title === undefined ? { id: view.frame.id } : { id: view.frame.id, title: view.frame.title };
  if (view.element) selection.element = view.element;
  return selection;
}

// Who the selection is, for keeping a person's Comments scope across a reload
// or a move: the path is left out, and an element is its doanId when it has
// one, so a selector rewritten by the agent is still the same element.
export function selectionIdentity(selection: Selection | null): string | null {
  if (selection === null) return null;
  const canvas = [selection.root, selection.canvas.id ?? null];
  if (selection.element) {
    const { doanId, selector } = selection.element;
    return JSON.stringify(["element", ...canvas, ...(doanId === undefined ? ["selector", selector] : ["doanId", doanId])]);
  }
  return JSON.stringify(["frame", ...canvas, selection.frame?.id ?? null]);
}

// Esc and a blank click change nothing without a selection or one being found
// again, so they neither ask about the draft nor take Esc's default action.
export function shouldGuardEscape(selection: SelectionView | null, reanchor: AnchorRequest | null): boolean {
  return selection !== null || reanchor !== null;
}

export interface AnchorRequest {
  frame?: string;
  doanId?: string;
  selector?: string;
}

// What the next document is asked to select again after a reload (flow 6).
export function anchorRequest(view: SelectionView): AnchorRequest {
  if (view.element) return view.element.doanId === undefined ? { selector: view.element.selector } : { doanId: view.element.doanId, selector: view.element.selector };
  const request: AnchorRequest = {};
  if (view.frame) request.frame = view.frame.id;
  const own = view.path.at(-1);
  if (own) request.selector = own.selector;
  return request;
}

export function sizeLabel(rect: CanvasRect): string {
  const px = (value: number) => String(Math.round(value * 100) / 100);
  return `${px(rect.width)} × ${px(rect.height)}`;
}

// Esc in a text field belongs to the field (#7 comment drafts).
export function editableTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const { tagName } = target;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || ("isContentEditable" in target && target.isContentEditable === true);
}
