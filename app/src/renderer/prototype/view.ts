import type { PrototypeFrame, PrototypePhase, PrototypeView } from "../../main/prototype/ipc";

// What the prototype window draws from main's view: the window title, the state scene over the content panel, the
// live region's line and the frame drawer's rows. Pure, so every state's copy and rule is tested without a window.

// `number` (the frame's number in the canvas, as the main frame drawer shows it) and `canvas` (the canvas label) are
// optional here until the view contract carries them; the window drops the number column and the canvas name meanwhile.
export type ShownFrame = PrototypeFrame & { number?: number };
export type ShownView = Omit<PrototypeView, "frames"> & { frames: ShownFrame[]; canvas?: string };

export const LOADING_LABEL = "Loading prototype";
export const RETRY = "Retry", CLOSE = "Close", DETAILS = "Details";
export const EMPTY_DRAWER = "No frames in this canvas are marked for prototyping. Ask an agent to mark one.";
// init-failed comes only from the host's own 10 s timer, so the window can say why when main sends no detail.
export const TIMEOUT_DETAIL = "The frame didn’t finish loading within 10 seconds.";

export function windowTitle(view: ShownView | null): string {
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

const LOST_CLAUSE = "; to play another, choose one from the frame menu above";

// The state scene for a failure or a lost target; null while loading or ready. A lost scene names the frame menu only
// while it has a frame to choose (the canvas is gone, or no other frame is marked).
export function stateScene(view: Pick<ShownView, "phase" | "detail" | "frames">): Scene | null {
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

// The always-mounted polite live region: the reading line once it shows, a scene's heading and body, nothing when the
// prototype runs (a restored frame needs no announcement of success).
export function liveText(view: Pick<ShownView, "phase" | "detail" | "frames"> | null, readingShown: boolean): string {
  if (view === null) return "";
  if (view.phase === "loading") return readingShown ? LOADING_LABEL : "";
  const scene = stateScene(view);
  return scene === null ? "" : `${scene.heading}. ${scene.body}`;
}

export function covered(phase: PrototypePhase): boolean {
  return phase !== "ready";
}

export interface DrawerRow {
  key: string;
  id: string;
  number: number | null;
  name: string;
  current: boolean;
}

// The frames the run listed, in document order; the playing frame is current while it is still listed.
export function drawerRows(view: Pick<ShownView, "frames" | "frame">): DrawerRow[] {
  return view.frames.map(frame => ({ key: frame.id, id: frame.id, number: frame.number ?? null, name: frame.title ?? frame.id, current: frame.id === view.frame }));
}

export function drawerLabel(view: Pick<ShownView, "canvas">): string {
  return view.canvas === undefined ? "Prototype frames" : `Prototype frames in ${view.canvas}`;
}
