// The drawing project conversation of the canvas the prototype window plays. The main window computes it (from its
// project conversations' events, which the prototype role cannot read) and main relays only its id, so the window can
// show the notice and its Open, which reveals that conversation in the main window. Main takes it only from the main
// window, only for the canvas playing now (root and canvas key), only a project conversation of that root, and only
// until the playing canvas changes (also back to the same one) or the window closes. Electron-free.
import { validAuthId } from "../agentAuth/metadata";
import type { WindowKind } from "../senderAllowed";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";

// The playing canvas as the main window names a canvas: its root, its row's last listed path and its ID when it has one.
// `generation` names this play of it (the controller's canvasGeneration): a report carries it back, so one made for an
// earlier play of the same canvas (A → B → A) is refused.
export interface PrototypeTargetRef {
  root: string;
  canvas: { path: string; id?: string };
  generation: number;
}

export function prototypeTargetRef(playing: PlayingCanvas | null, generation: number): PrototypeTargetRef | null {
  if (playing === null) return null;
  return { root: playing.root, canvas: { ...("id" in playing.canvas ? { id: playing.canvas.id } : {}), path: playing.path }, generation };
}

// `prototype:setDrawing`, from the main window.
export interface DrawingReport extends PrototypeTargetRef {
  conversationId: string | null;
}

function exactly(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => own.includes(key)) ? value as Record<string, unknown> : null;
}

function parseDrawingReport(value: unknown): DrawingReport | null {
  const report = exactly(value, ["root", "canvas", "generation", "conversationId"]);
  const generation = report?.generation;
  if (report === null || typeof report.root !== "string" || typeof generation !== "number" || !Number.isSafeInteger(generation) || (report.conversationId !== null && !validAuthId(report.conversationId))) return null;
  const raw = report.canvas;
  const canvas = typeof raw === "object" && raw !== null ? exactly(raw, "id" in raw ? ["path", "id"] : ["path"]) : null;
  if (canvas === null || typeof canvas.path !== "string" || (canvas.id !== undefined && typeof canvas.id !== "string")) return null;
  return { root: report.root, canvas: { path: canvas.path, ...(typeof canvas.id === "string" ? { id: canvas.id } : {}) }, generation, conversationId: report.conversationId };
}

// The playing canvas's key with its root: an ID-keyed canvas by its ID (its path may have moved), an ID-less one by its
// path (POSTMORTEM 2026-11-01: worktrees share both).
function isPlaying(report: DrawingReport, playing: PlayingCanvas): boolean {
  if (report.root !== playing.root) return false;
  return "id" in playing.canvas ? report.canvas.id === playing.canvas.id : report.canvas.id === undefined && report.canvas.path === playing.canvas.path;
}

export interface DrawingDeps {
  playing(): PlayingCanvas | null;
  // The controller's count of playing-canvas changes.
  generation(): number;
  conversations(): ScopedConversation[];
}

export function createPrototypeDrawing(deps: DrawingDeps) {
  let drawing: { conversationId: string; generation: number } | null = null;
  return {
    // Whether main took the report; a refused one leaves what was there.
    set(kind: unknown, value: unknown): boolean {
      const report = kind === ("main" satisfies WindowKind) ? parseDrawingReport(value) : null;
      const playing = deps.playing();
      if (report === null || playing === null || report.generation !== deps.generation() || !isPlaying(report, playing)) return false;
      const id = report.conversationId;
      if (id === null) { drawing = null; return true; }
      const project = deps.conversations().some(conversation => conversation.conversationId === id && conversation.root === playing.root && conversation.canvas === undefined);
      if (!project) return false;
      drawing = { conversationId: id, generation: deps.generation() };
      return true;
    },
    current(): string | null {
      return drawing !== null && deps.playing() !== null && drawing.generation === deps.generation() ? drawing.conversationId : null;
    },
    closed(): void { drawing = null; },
  };
}
