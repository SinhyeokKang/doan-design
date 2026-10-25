import type { Target } from "../formats/types";
import type { ExpectedComment } from "./events";

export type DraftOrigin =
  | { kind: "create"; root: string; canvas: string; path: string; generation: number; canvasHash: string; target: Target }
  | { kind: "edit"; root: string; canvas: string; comment: string; expected: ExpectedComment };
// Why a create draft lost its document: `reloaded` when the session still shows
// the origin's root and canvas id (the same canvas came back), which a person
// can continue on; `unavailable` otherwise. Null for any other block.
export type DraftLoss = "reloaded" | "unavailable";
export interface CommentDraft { id: string; origin: DraftOrigin; body: string; blocked: string | null; lost: DraftLoss | null }
export interface DraftState {
  draft: CommentDraft | null;
  transition: string | null;
  request: string | null;
  error: string | null;
}
export type DraftAction =
  | { type: "body"; body: string }
  | { type: "move"; destination: string }
  | { type: "answer"; choice: "continue" | "discard" }
  | { type: "save"; request: string }
  | { type: "saved"; draft: string; request: string; outcome: "saved" | "failed" | "unknown"; error?: string }
  | { type: "invalidate"; reason: string }
  // `identity` is the session's current root and canvas id, null without one;
  // `loading` counts as the same canvas until the load settles, only when
  // `identity` is not passed.
  | { type: "document-lost"; identity?: { root: string; canvas: string } | null; loading?: boolean }
  // A new begin on the current version succeeded; the body moves over as it is now.
  | { type: "continue"; id: string; origin: DraftOrigin };
export type DraftEffect =
  | { type: "none" | "confirm" | "focus-editor" }
  | { type: "move"; destination: string }
  | { type: "save"; draft: CommentDraft; request: string };
export interface DraftResult { state: DraftState; effect: DraftEffect }

export const DOCUMENT_RELOADED = "The canvas reloaded while you were writing. Your text is kept \u2014 continue on the current version to save it.";
const DOCUMENT_UNAVAILABLE = "Original document or target is unavailable.";

export function beginDraft(id: string, origin: DraftOrigin, body: string): DraftState {
  return { draft: { id, origin: structuredClone(origin), body, blocked: null, lost: null }, transition: null, request: null, error: null };
}

function loss(origin: DraftOrigin, action: Extract<DraftAction, { type: "document-lost" }>): DraftLoss {
  const identity = action.identity;
  // A known other canvas (including a same-path id change) is never the same
  // canvas, even while it loads, and neither is a canvas without an id (null);
  // loading only stands in for an identity the caller did not pass.
  if (identity === null) return "unavailable";
  if (identity) return identity.root === origin.root && identity.canvas === origin.canvas ? "reloaded" : "unavailable";
  return action.loading ? "reloaded" : "unavailable";
}

const continuable = (state: DraftState) => state.request === null && state.draft?.origin.kind === "create" && state.draft.lost === "reloaded";

// Destination tokens belong to the controller, which revalidates the destination
// before applying an effect. List filters are deliberately outside draft state.
export function transitionDraft(state: DraftState, action: DraftAction): DraftResult {
  const none: DraftResult = { state, effect: { type: "none" } };
  const draft = state.draft;
  if (action.type === "invalidate") {
    if (!draft) return none;
    return { state: { ...state, transition: null, draft: { ...draft, blocked: action.reason, lost: null } }, effect: { type: "none" } };
  }
  if (action.type === "document-lost") {
    if (!draft) return none;
    // An edit draft keeps its expected comment and survives DOM loss.
    if (draft.origin.kind !== "create") return { state: { ...state, transition: null }, effect: { type: "none" } };
    const lost = loss(draft.origin, action);
    return { state: { ...state, transition: null, draft: { ...draft, lost, blocked: lost === "reloaded" ? DOCUMENT_RELOADED : DOCUMENT_UNAVAILABLE } }, effect: { type: "none" } };
  }
  if (action.type === "continue") {
    if (!draft || !continuable(state)) return none;
    return { state: { ...state, error: null, draft: { id: action.id, origin: structuredClone(action.origin), body: draft.body, blocked: null, lost: null } }, effect: { type: "focus-editor" } };
  }
  if (action.type === "saved") {
    if (!draft || draft.id !== action.draft || state.request === null || state.request !== action.request) return none;
    if (action.outcome !== "saved") return {
      state: { ...state, request: action.outcome === "unknown" ? state.request : null, error: action.error ?? "Unable to save comment." }, effect: { type: "none" },
    };
    return { state: { draft: null, request: null, transition: null, error: null },
      effect: state.transition === null ? { type: "none" } : { type: "move", destination: state.transition } };
  }
  // A pending request owns its immutable payload, including after response loss.
  if (state.request !== null) return none;
  if (action.type === "move") {
    if (!draft) return { state, effect: { type: "move", destination: action.destination } };
    return { state: { ...state, transition: action.destination }, effect: { type: "confirm" } };
  }
  if (!draft) return none;
  if (action.type === "body") return { state: { ...state, draft: { ...draft, body: action.body }, error: null }, effect: { type: "none" } };
  if (action.type === "save") {
    if (draft.blocked || !draft.body.trim() || !action.request) return none;
    return { state: { ...state, request: action.request, error: null }, effect: { type: "save", request: action.request, draft: structuredClone(draft) } };
  }
  if (action.type === "answer") {
    if (action.choice === "continue") return { state: { ...state, transition: null }, effect: { type: "focus-editor" } };
    return { state: { draft: null, request: null, transition: null, error: null },
      effect: state.transition === null ? { type: "none" } : { type: "move", destination: state.transition } };
  }
  return none;
}

// The disabled reasons are the confirmed draft copy (design/revision-continuity.html).
export const CONTINUE_REASONS = {
  loading: "Waiting for the canvas to finish loading.",
  noWidth: "The current version has no readable width. Run doan check in a terminal.",
  failed: "The current version couldn\u2019t load. Reload the canvas to try again.",
  unlisted: "The page shown is not a listed canvas. Return to the canvas to continue.",
  reanchoring: "Finding your selection in the current version\u2026",
  selectionGone: "Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.",
} as const;

// Renderer state continueEnabled reads; `canvas` mirrors CanvasState.
export interface ContinueContext {
  canvas: { status: "empty" | "loading" | "noWidth" | "failed" | "missing" | null; unlisted: boolean; hasFrame: boolean; reloading: boolean };
  reanchoring: boolean;
  author: "loading" | "ready" | "missing" | "failed";
  selection: boolean;
}

// `canvas`: "Continue on canvas" is offered. A null reason means the editor
// already shows why (the author line).
export type ContinueView =
  | { kind: "hidden" }
  | { kind: "enabled"; scope: "selection" | "canvas" }
  | { kind: "disabled"; reason: string | null; canvas: boolean };

// The scope a continue keeps: the original draft's target kind.
export function draftScope(origin: Extract<DraftOrigin, { kind: "create" }>): "selection" | "canvas" {
  return origin.target.frame !== undefined || origin.target.element !== undefined ? "selection" : "canvas";
}

// Shown only for a create draft blocked as `reloaded` with no request, so a
// pending or uncertain save keeps its own controls.
export function continueEnabled(draft: DraftState, state: ContinueContext): ContinueView {
  if (!continuable(draft) || draft.draft?.origin.kind !== "create") return { kind: "hidden" };
  const { status, unlisted, hasFrame, reloading } = state.canvas;
  const reason = status === "noWidth" ? CONTINUE_REASONS.noWidth
    : status === "failed" ? CONTINUE_REASONS.failed
    : status === null && unlisted ? CONTINUE_REASONS.unlisted
    : status !== null || !hasFrame || reloading ? CONTINUE_REASONS.loading
    : state.reanchoring ? CONTINUE_REASONS.reanchoring
    : null;
  if (reason !== null) return { kind: "disabled", reason, canvas: false };
  if (state.author !== "ready") return { kind: "disabled", reason: null, canvas: false };
  const scope = draftScope(draft.draft.origin);
  if (scope === "selection" && !state.selection) return { kind: "disabled", reason: CONTINUE_REASONS.selectionGone, canvas: true };
  return { kind: "enabled", scope };
}

// A blocked `reloaded` create draft cannot be saved and keeps its body, so a
// selection change inside the same canvas loses nothing and is not asked
// about; leaving the canvas still is.
export function guardsSelectionChange(draft: DraftState, destination: "selection" | "navigation"): boolean {
  if (draft.draft === null) return false;
  return !(destination === "selection" && continuable(draft));
}
