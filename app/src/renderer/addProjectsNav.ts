import type { ProjectPhase } from "./projectStep";

// Where the Add Projects page goes when it is left (buzz-add-projects design '화면과 이동'). The origin is the last
// Projects-side screen, not the previous one, so a later Settings tab cannot become the return target.
export type AddPageOrigin = { screen: "home" } | { screen: "workspace"; root: string };
export type AddPageEvent =
  | { kind: "projectsTab" } | { kind: "back" } | { kind: "cancel" } | { kind: "forward" } | { kind: "reopen" } | { kind: "home" }
  // editing: an edited field or an IME composition holds the key. overlay: Quick Open or a dialog closes itself first.
  | { kind: "escape"; editing: boolean; overlay: boolean }
  | { kind: "added"; root: string };
// A sidebar row or a Quick Open pick is not an event here: it leaves through the shell's own navigation, whose
// controller asks the draft guard canvas by canvas (only the canvas already open skips it). The page never decides
// that a move may skip the guard.
export type AddPageDestination =
  | { kind: "stay" }
  | { kind: "home"; select: string | null }
  | { kind: "workspace"; root: string };

export function addPageReturn(origin: AddPageOrigin, event: AddPageEvent, roots: readonly string[]): AddPageDestination {
  switch (event.kind) {
    case "forward": case "reopen": return { kind: "stay" };
    case "escape": if (event.editing || event.overlay) return { kind: "stay" }; break;
    case "home": return { kind: "home", select: null };
    case "added": return { kind: "home", select: event.root };
  }
  return origin.screen === "workspace" && roots.includes(origin.root) ? { kind: "workspace", root: origin.root } : { kind: "home", select: null };
}

// Only a field you type into holds Escape (design '화면과 이동': the URL field, an IME composition); a focused radio of
// the candidates list does not. An IME may hold Escape without setting isComposing; keyCode 229 is its own key then
// (homeComposer isSubmitKey).
const UNTYPED = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
function typing(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  if (target.tagName === "TEXTAREA" || ("isContentEditable" in target && target.isContentEditable === true)) return true;
  return target.tagName === "INPUT" && !UNTYPED.has("type" in target && typeof target.type === "string" ? target.type : "text");
}
export function pageEscape(event: { target: unknown; isComposing: boolean; keyCode: number }, overlay: boolean): AddPageEvent {
  return { kind: "escape", editing: typing(event.target) || event.isComposing || event.keyCode === 229, overlay };
}

// Selecting writes the project and a clone runs until it ends or is cancelled; neither result may be dropped, so the
// page cannot be left meanwhile (design '잠금').
export function leaveLocked(phase: Pick<ProjectPhase, "kind">): boolean {
  return phase.kind === "selecting" || phase.kind === "cloning";
}
