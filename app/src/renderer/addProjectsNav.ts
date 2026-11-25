import type { ProjectPhase } from "./projectStep";

// The last Projects-side screen, not the previous one, so moving from one page to another never makes a page the
// return target.
export type AddPageOrigin = { screen: "home" } | { screen: "workspace"; root: string };
export type PageName = "addProjects" | "settings" | "projectSettings";
export type ShellScreen = AddPageOrigin | { screen: PageName };
export type AddPageEvent =
  | { kind: "projectsTab" } | { kind: "back" } | { kind: "cancel" } | { kind: "forward" } | { kind: "reopen" } | { kind: "home" }
  // overlay: Quick Open or a dialog closes itself first.
  | { kind: "escape"; editing: boolean; overlay: boolean }
  | { kind: "added"; root: string }
  // Nothing is left to hold the page.
  | { kind: "gone" };
// A sidebar row or Quick Open pick leaves through the shell's own navigation, which asks the draft guard; the page
// never decides that a move may skip it.
export type AddPageDestination =
  | { kind: "stay" }
  | { kind: "home"; select: string | null }
  | { kind: "workspace"; root: string };

// Entering keeps the Projects-side screen's state, so a start-up restore or an opening workspace must not land after
// the entry and take the window away. A locked page cannot be left, not even for the other one.
export function pageEnter(from: ShellScreen, origin: AddPageOrigin, to: PageName, locked: boolean): { kind: "stay" } | { kind: "enter"; origin: AddPageOrigin; cancelPending: true } {
  if (locked || from.screen === to) return { kind: "stay" };
  return { kind: "enter", origin: from.screen === "home" || from.screen === "workspace" ? from : origin, cancelPending: true };
}

// Never through pageEnter, which would stay: the page is the same, only its worktree changes.
export function projectSettingsReentry(shown: string, target: string, locked: boolean):
  { kind: "ignore" } | { kind: "focusTitle" } | { kind: "switch"; root: string; cancelPending: true } {
  if (locked) return { kind: "ignore" };
  return target === shown ? { kind: "focusTitle" } : { kind: "switch", root: target, cancelPending: true };
}

// Completion (added) is not a move away, and gone passes the lock because the page has nothing left to show.
export function addPageReturn(origin: AddPageOrigin, event: AddPageEvent, roots: readonly string[], locked = false): AddPageDestination {
  if (locked && event.kind !== "added" && event.kind !== "gone") return { kind: "stay" };
  switch (event.kind) {
    case "forward": case "reopen": return { kind: "stay" };
    case "escape": if (event.editing || event.overlay) return { kind: "stay" }; break;
    case "home": return { kind: "home", select: null };
    case "added": return { kind: "home", select: event.root };
  }
  return origin.screen === "workspace" && roots.includes(origin.root) ? { kind: "workspace", root: origin.root } : { kind: "home", select: null };
}

// A reroot is not a removal: a Set Up or Locate focus moves the loaded root first, and a pending workspace Locate holds
// the old root (`locatingFrom`).
export function workspaceRemoved(screen: ShellScreen["screen"], loadedRoot: string | null, roots: readonly string[], locatingFrom: string | null): boolean {
  return screen === "workspace" && loadedRoot !== null && loadedRoot !== locatingFrom && !roots.includes(loadedRoot);
}

// An IME may hold Escape without setting isComposing; keyCode 229 is its own key then (homeComposer isSubmitKey).
const UNTYPED = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
function typing(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  if (target.tagName === "TEXTAREA" || ("isContentEditable" in target && target.isContentEditable === true)) return true;
  return target.tagName === "INPUT" && !UNTYPED.has("type" in target && typeof target.type === "string" ? target.type : "text");
}
export function pageEscape(event: { target: unknown; isComposing: boolean; keyCode: number }, overlay: boolean): AddPageEvent {
  return { kind: "escape", editing: typing(event.target) || event.isComposing || event.keyCode === 229, overlay };
}

// Selecting writes the project and a clone runs to its end; neither result may be dropped, so the page cannot be left.
export function leaveLocked(phase: Pick<ProjectPhase, "kind">): boolean {
  return phase.kind === "selecting" || phase.kind === "cloning";
}
