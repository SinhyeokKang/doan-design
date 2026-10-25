import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { ReviewMarker } from "../comments/review";

// `<userData>/review-state.json`: when this device last reviewed each canvas's
// resolved comments. A device-local seen marker, not approval; never shared
// and never shown to agents. Main owns it; the renderer reads and asks for raises.

// A marker is what `toReview` takes for one canvas; `since` is when this file
// was first created.
export interface ReviewRead { root: string; canvas: string }
export interface ReviewRaise extends ReviewRead { at: string }

export interface ReviewStore {
  marker(root: string, canvas: string): ReviewMarker;
  // Only raises: a time not after the current marker changes nothing.
  raise(root: string, canvas: string, at: string): ReviewMarker;
  // Called once a project's removal can no longer be undone.
  forget(roots: readonly string[]): void;
}

// The comment event `at` format: fixed width, so string order is time order.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEPARATOR = "\u0000";

export function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const time = Date.parse(value);
  // Rejects dates the pattern allows but the calendar does not (Feb 30).
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

const validRoot = (value: unknown): value is string => typeof value === "string" && value.startsWith("/") && !value.includes(SEPARATOR);
const validCanvas = (value: unknown): value is string => typeof value === "string" && CANVAS_ID.test(value);

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function parseReviewRead(value: unknown): ReviewRead | null {
  if (!exact(value, ["root", "canvas"]) || !validRoot(value.root) || !validCanvas(value.canvas)) return null;
  return { root: value.root, canvas: value.canvas };
}

export function parseReviewRaise(value: unknown): ReviewRaise | null {
  if (!exact(value, ["root", "canvas", "at"]) || !validRoot(value.root) || !validCanvas(value.canvas) || !validTimestamp(value.at)) return null;
  return { root: value.root, canvas: value.canvas, at: value.at };
}

interface State { since: string; canvases: Map<string, string> }

// Invalid entries are dropped one by one; anything wrong with the file itself
// starts again from now, which hides past resolves rather than flooding them.
function parse(text: string, saved: ReadonlySet<string>): State | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!exact(value, ["v", "since", "canvases"]) || value.v !== 1 || !validTimestamp(value.since)) return null;
  const canvases = value.canvases;
  if (typeof canvases !== "object" || canvases === null || Array.isArray(canvases)) return null;
  const kept = new Map<string, string>();
  for (const [key, at] of Object.entries(canvases)) {
    const parts = key.split(SEPARATOR);
    if (parts.length !== 2 || !validRoot(parts[0]) || !validCanvas(parts[1]) || !validTimestamp(at) || !saved.has(parts[0])) continue;
    kept.set(key, at);
  }
  return { since: value.since, canvases: kept };
}

const serialize = (state: State) => `${JSON.stringify({ v: 1, since: state.since, canvases: Object.fromEntries(state.canvases) })}\n`;

export function createReviewStore(file: string, savedRoots: () => readonly string[], now: () => Date = () => new Date()): ReviewStore {
  // Synchronous like the rest of this store: raises are rare (a Review step),
  // the file is small, and a write that is already done cannot be lost to a
  // quit that skips its teardown (POSTMORTEM "A crash during quit teardown").
  const write = (current: State) => {
    const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      writeFileSync(temp, serialize(current), { flag: "wx" });
      renameSync(temp, file);
    } catch (error) {
      console.error("doan: cannot save review-state.json", error);
    } finally {
      rmSync(temp, { force: true });
    }
  };
  // Loaded at creation, while the saved roots are the ones on disk: a root
  // removed later may still come back with Undo and must not be pruned. Roots
  // removed while the app could not forget them (a quit with the Undo toast
  // up) are pruned here on the next launch.
  let text: string | null = null;
  try { text = readFileSync(file, "utf8"); } catch (error) {
    // Missing on first launch; anything else starts from now too, which hides
    // past resolves rather than flooding them, but is worth a trace.
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) console.error("doan: cannot read review-state.json", error);
  }
  const state = (text === null ? null : parse(text, new Set(savedRoots()))) ?? { since: now().toISOString(), canvases: new Map<string, string>() };
  if (text !== serialize(state)) write(state);
  const markerOf = (key: string): ReviewMarker => {
    const at = state.canvases.get(key);
    return at === undefined ? { since: state.since } : { since: state.since, lastReviewedAt: at };
  };
  return {
    marker(root, canvas) {
      return markerOf(root + SEPARATOR + canvas);
    },
    raise(root, canvas, at) {
      const key = root + SEPARATOR + canvas;
      if (at > (state.canvases.get(key) ?? state.since)) {
        state.canvases.set(key, at);
        write(state);
      }
      return markerOf(key);
    },
    forget(roots) {
      let changed = false;
      for (const key of [...state.canvases.keys()]) {
        if (roots.includes(key.slice(0, key.indexOf(SEPARATOR)))) changed = state.canvases.delete(key) || changed;
      }
      if (changed) write(state);
    },
  };
}
