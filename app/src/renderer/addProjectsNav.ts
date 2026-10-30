import type { ProjectPhase } from "./projectStep";

// Where the Add Projects page goes when it is left (buzz-add-projects design '화면과 이동'). The origin is the last
// Projects-side screen, not the previous one, so a later Settings tab cannot become the return target.
export type AddPageOrigin = { screen: "home" } | { screen: "workspace"; root: string };
export type AddPageEvent =
  | { kind: "projectsTab" } | { kind: "back" } | { kind: "cancel" } | { kind: "forward" } | { kind: "reopen" } | { kind: "home" }
  // editing: an edited field or an IME composition holds the key. overlay: Quick Open or a dialog closes itself first.
  | { kind: "escape"; editing: boolean; overlay: boolean }
  | { kind: "added"; root: string }
  // originDraft: the origin workspace holds a draft, so leaving it for another root goes through the draft guard.
  | { kind: "row" | "quickOpen"; root: string; originDraft: boolean };
export type AddPageDestination =
  | { kind: "stay" }
  | { kind: "home"; select: string | null }
  | { kind: "workspace"; root: string; guard: boolean };

export function addPageReturn(origin: AddPageOrigin, event: AddPageEvent, roots: readonly string[]): AddPageDestination {
  switch (event.kind) {
    case "forward": case "reopen": return { kind: "stay" };
    case "escape": if (event.editing || event.overlay) return { kind: "stay" }; break;
    case "home": return { kind: "home", select: null };
    case "added": return { kind: "home", select: event.root };
    case "row": case "quickOpen":
      return { kind: "workspace", root: event.root, guard: event.originDraft && origin.screen === "workspace" && origin.root !== event.root };
  }
  return origin.screen === "workspace" && roots.includes(origin.root) ? { kind: "workspace", root: origin.root, guard: false } : { kind: "home", select: null };
}

// Selecting writes the project and a clone runs until it ends or is cancelled; neither result may be dropped, so the
// page cannot be left meanwhile (design '잠금').
export function leaveLocked(phase: Pick<ProjectPhase, "kind">): boolean {
  return phase.kind === "selecting" || phase.kind === "cloning";
}
