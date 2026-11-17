import type { GotoMessage, PrototypeMode, PrototypePhase, PrototypeView } from "../../main/prototype/ipc";
import { groupDrawer, type DrawerGroup } from "../frameDrawerList";

// What the prototype window draws from main's view: the window title, the state scene over the content panel, the
// live region's line and the frame drawer's rows. Pure, so every state's copy and rule is tested without a window.

export const LOADING_LABEL = "Loading prototype";
export const RETRY = "Retry", CLOSE = "Close", DETAILS = "Details";
export const EMPTY_DRAWER = "No frames in this canvas are marked for prototyping. Ask an agent to mark one.";
// init-failed comes only from the host's own 10 s timer, so the window can say why when main sends no detail.
export const TIMEOUT_DETAIL = "The frame didn’t finish loading within 10 seconds.";

export function windowTitle(view: PrototypeView | null): string {
  return view === null ? "Prototype" : `${view.title} — Prototype`;
}

export type SceneIcon = "read" | "init" | "frame" | "support";
export interface Scene {
  icon: SceneIcon;
  heading: string;
  body: string;
  // Retry · Close · Details for a failure, Close alone for a lost frame or mark.
  failure: boolean;
  detail?: string;
}

// The window's own first read of main's view failed and no view came since (main has no phase to send then): the read
// failure's scene with Retry alone, which reads again; there is no detail to show.
export const FIRST_READ_SCENE: Scene = { icon: "read", heading: "Couldn’t open this prototype", body: "Doan couldn’t start this window. Retry, or close it and play the frame again from the canvas.", failure: true };

const LOST_CLAUSE = "; to play another, choose one from the frame menu above";

// The state scene for a failure or a lost target; null while loading or ready. A lost scene names the frame menu only
// while it has a frame to choose (the canvas is gone, or no other frame is marked).
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

// The always-mounted polite live region: the reading line once it shows, a scene's heading and body, and for a running
// prototype only the name of the frame a link moved to (`moved`, true for that run alone); a restored frame or a reload
// needs no announcement of success.
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

// The viewport toggle's tooltips. Fit names the frame's size and that it fits to the window, so it does not read as
// resizing the window to that size; a mark not known yet leaves the size out.
export function modeTooltip(mode: PrototypeMode, run: { markWidth: number; markHeight: number } | null | undefined): string {
  if (mode === "responsive") return "Responsive";
  return run != null && run.markWidth > 0 && run.markHeight > 0 ? `Fit ${run.markWidth} × ${run.markHeight} to the window` : "Fit to the window";
}

// The frames the run listed, in link groups (groupDrawer); the playing frame is current while it is still listed.
export function drawerGroups(view: Pick<PrototypeView, "frames" | "frame" | "gotos">): DrawerGroup[] {
  return groupDrawer(view.frames.map(frame => ({ key: frame.id, id: frame.id, number: frame.number, name: frame.title ?? frame.id, current: frame.id === view.frame, mark: frame.size })), view.gotos);
}

export function drawerLabel(view: Pick<PrototypeView, "canvas">): string {
  return `Prototype frames in ${view.canvas}`;
}

// The header's Export. Available while the frame plays, loads or failed to start (the CLI reads the file, not the run);
// otherwise unavailable with the canvas toolbar's reason, and with none before the first view, as the header's other
// controls. An export under way holds it for its whole run.
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

// A link to a frame this run cannot play. A value over 200 UTF-16 units comes as null: no frame can have it, and it is
// not quoted.
export function linkToast(id: string | null): string {
  return id === null ? "Can’t go to this link’s frame. Ask your agent to fix this link." : `Can’t go to “${id}”. Ask your agent to fix this link.`;
}

export type LinkMove = { kind: "move"; frame: string } | { kind: "toast"; text: string } | { kind: "drop" };

// A link the run's document followed, judged by the view this window shows (main judges it again by its own state): only
// a ready run of that gen moves; a link to a frame the run did not list gets one toast, unless an export's progress or
// result toast is on screen, which it would replace.
export function linkMove(view: Pick<PrototypeView, "gen" | "phase" | "frames"> | null, message: GotoMessage, exportToast: boolean): LinkMove {
  if (view === null || view.phase !== "ready" || message.gen !== view.gen) return { kind: "drop" };
  const value = message.goto;
  if (value !== null && view.frames.some(frame => frame.id === value)) return { kind: "move", frame: value };
  return exportToast ? { kind: "drop" } : { kind: "toast", text: linkToast(value) };
}
