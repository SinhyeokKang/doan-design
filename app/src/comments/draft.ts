import type { Target } from "../formats/types";
import type { ExpectedComment } from "./events";

export type DraftOrigin =
  | { kind: "create"; root: string; canvas: string; path: string; generation: number; canvasHash: string; target: Target }
  | { kind: "edit"; root: string; canvas: string; comment: string; expected: ExpectedComment };
export interface CommentDraft { id: string; origin: DraftOrigin; body: string; blocked: string | null }
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
  | { type: "document-lost" };
export type DraftEffect =
  | { type: "none" | "confirm" | "focus-editor" }
  | { type: "move"; destination: string }
  | { type: "save"; draft: CommentDraft; request: string };
export interface DraftResult { state: DraftState; effect: DraftEffect }

export function beginDraft(id: string, origin: DraftOrigin, body: string): DraftState {
  return { draft: { id, origin: structuredClone(origin), body, blocked: null }, transition: null, request: null, error: null };
}

// Destination tokens belong to the controller, which revalidates the destination
// before applying an effect. List filters are deliberately outside draft state.
export function transitionDraft(state: DraftState, action: DraftAction): DraftResult {
  const none: DraftResult = { state, effect: { type: "none" } };
  const draft = state.draft;
  if (action.type === "invalidate" || action.type === "document-lost") {
    if (!draft) return none;
    const reason = action.type === "invalidate" ? action.reason : draft.origin.kind === "create" ? "Original document or target is unavailable." : null;
    return { state: { ...state, transition: null, draft: { ...draft, blocked: reason ?? draft.blocked } }, effect: { type: "none" } };
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
