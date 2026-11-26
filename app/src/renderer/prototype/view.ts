import { PROTOTYPE_LOAD_TIMEOUT_MS, type GotoMessage, type PrototypeMode, type PrototypePhase, type PrototypeView } from "../../main/prototype/ipc";
import { frameName } from "../canvasTree";
import { inOpenOverlay, type ShortcutEvent } from "../canvasTool";
import { editableTarget } from "../selection";
import { groupDrawer, type DrawerGroup } from "../frameDrawerList";

// Pure, so every state's copy and rule is tested without a window.

export const LOADING_LABEL = "Loading prototype";
export const RETRY = "Retry", CLOSE = "Close", DETAILS = "Details";
export const EMPTY_DRAWER = "No frames in this canvas are marked for prototyping. Ask an agent to mark one.";
// init-failed comes only from the host's own timer, so the window can say why when main sends no detail.
export const TIMEOUT_DETAIL = `The frame didn’t finish loading within ${PROTOTYPE_LOAD_TIMEOUT_MS / 1000} seconds.`;

export function windowTitle(view: PrototypeView | null): string {
  return view === null ? "Prototype" : `${view.title} — Prototype`;
}

export type SceneIcon = "read" | "init" | "frame" | "support";
export interface Scene {
  icon: SceneIcon;
  heading: string;
  body: string;
  failure: boolean;
  detail?: string;
}

// main has no phase to send then, so there is no detail to show; Retry reads again.
export const FIRST_READ_SCENE: Scene = { icon: "read", heading: "Couldn’t open this prototype", body: "Doan couldn’t start this window. Retry, or close it and play the frame again from the canvas.", failure: true };

const LOST_CLAUSE = "; to play another, choose one from the frame menu above";

// A lost scene names the frame menu only while it has a frame to choose.
export function stateScene(view: Pick<PrototypeView, "phase" | "detail" | "frames">): Scene | null {
  const clause = view.frames.length > 0 ? LOST_CLAUSE : "";
  switch (view.phase) {
    case "read-failed":
      return { icon: "read", heading: "Couldn’t open this prototype", body: "Doan couldn’t read the canvas file for this frame.", failure: true, ...(view.detail === undefined ? {} : { detail: view.detail }) };
    case "init-failed":
      return { icon: "init", heading: "Couldn’t start this prototype", body: "The frame was read, but Doan couldn’t set it up in this window.", failure: true, detail: view.detail ?? TIMEOUT_DETAIL };
    case "frame-unavailable":
      return { icon: "frame", heading: "Frame unavailable", body: `This frame is no longer available. It reappears here when the frame is restored${clause}.`, failure: false };
    case "prototype-unavailable":
      return { icon: "support", heading: "Prototype unavailable", body: `This frame is no longer marked for prototyping. It reappears here when the mark is restored${clause}.`, failure: false };
    default:
      return null;
  }
}

// A restored frame or a reload needs no announcement of success.
export function liveText(view: Pick<PrototypeView, "phase" | "detail" | "frames" | "title"> | null, readingShown: boolean, moved = false): string {
  if (view === null) return "";
  if (view.phase === "loading") return readingShown ? LOADING_LABEL : "";
  if (view.phase === "ready") return moved ? view.title : "";
  const scene = stateScene(view);
  return scene === null ? "" : `${scene.heading}. ${scene.body}`;
}

export function covered(phase: PrototypePhase): boolean {
  return phase !== "ready";
}

// Fit names the frame's size so it does not read as resizing the window to that size.
// Z switches the viewport mode, as Figma's presentation view does: a plain key, by `code` so a Korean layout's ㅋ counts,
// never in a text field or an open menu, list or dialog (the frame drawer and the head menus type-ahead).
export function viewportKey(event: ShortcutEvent): boolean {
  if (event.type !== "keydown" || event.code !== "KeyZ" || event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  return !editableTarget(event.target) && !inOpenOverlay(event.target);
}

export function otherMode(mode: PrototypeMode): PrototypeMode {
  return mode === "fit" ? "responsive" : "fit";
}

export function modeTooltip(mode: PrototypeMode, run: { markWidth: number; markHeight: number } | null | undefined): string {
  if (mode === "responsive") return "Responsive";
  return run != null && run.markWidth > 0 && run.markHeight > 0 ? `Fit ${run.markWidth} × ${run.markHeight} to the window` : "Fit to the window";
}

// The playing frame is current while it is still listed.
export function drawerGroups(view: Pick<PrototypeView, "frames" | "frame" | "gotos">): DrawerGroup[] {
  return groupDrawer(view.frames.map(frame => ({ key: frame.id, id: frame.id, number: frame.number, name: frameName(frame), current: frame.id === view.frame, mark: frame.size })), view.gotos);
}

export function drawerLabel(view: Pick<PrototypeView, "canvas">): string {
  return `Prototype frames in ${view.canvas}`;
}

// The CLI reads the file, not the run, so a failed start can still export.
export type ExportAvailability = { available: true } | { available: false; reason: string | null };

export function exportAvailability(view: Pick<PrototypeView, "phase"> | null, exporting: boolean): ExportAvailability {
  if (view === null) return { available: false, reason: null };
  if (exporting) return { available: false, reason: "Exporting" };
  switch (view.phase) {
    case "read-failed": return { available: false, reason: "Can’t read this canvas." };
    // "prototype", not "frame": a prototype-unavailable frame is still there.
    case "frame-unavailable":
    case "prototype-unavailable": return { available: false, reason: "Export isn’t available while this prototype can’t play." };
    default: return { available: true };
  }
}

// A value over 200 UTF-16 units comes as null: no frame can have it, and it is not quoted.
export function linkToast(id: string | null): string {
  return id === null ? "Can’t go to this link’s frame. Ask your agent to fix this link." : `Can’t go to “${id}”. Ask your agent to fix this link.`;
}

export type LinkMove = { kind: "move"; frame: string } | { kind: "toast"; text: string } | { kind: "drop" };

// main judges it again by its own state. No toast replaces an export's toast on screen.
export function linkMove(view: Pick<PrototypeView, "gen" | "phase" | "frames"> | null, message: GotoMessage, exportToast: boolean): LinkMove {
  if (view === null || view.phase !== "ready" || message.gen !== view.gen) return { kind: "drop" };
  const value = message.goto;
  if (value !== null && view.frames.some(frame => frame.id === value)) return { kind: "move", frame: value };
  return exportToast ? { kind: "drop" } : { kind: "toast", text: linkToast(value) };
}
