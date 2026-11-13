import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import type { FramesMessage, LostState, PrototypeFrame, RunReport } from "./ipc";
import { parsePrototypeMark, type PrototypeSize } from "./mark";
import { canvasKeyFor, type PrototypeTarget } from "./targets";

// Validation of `prototype:*` request payloads. The sender guard has already checked the window role; each parser
// checks it again so a handler wired to the wrong role still refuses.

// The board's `layout` message clips frame IDs and titles at 200 UTF-16 units, so no longer ID can be selected.
export const MAX_REPORT_STRING = 200;
export const MAX_REPORT_FRAMES = 1000;

const LOST: ReadonlySet<string> = new Set<LostState>(["missing", "duplicate", "unmarked", "invalid"]);

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const own = Object.keys(value);
  if (own.length !== keys.length || !keys.every(key => own.includes(key))) return null;
  return value as Record<string, unknown>;
}

function id(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= MAX_REPORT_STRING;
}

function gen(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function frameList(value: unknown): PrototypeFrame[] | null {
  if (!Array.isArray(value) || value.length > MAX_REPORT_FRAMES) return null;
  const seen = new Set<string>();
  const frames: PrototypeFrame[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = record(raw, "title" in raw ? ["id", "title", "size"] : ["id", "size"]);
    if (entry === null || !id(entry.id) || seen.has(entry.id) || parsePrototypeMark(entry.size) === null) return null;
    if (entry.title !== undefined && (typeof entry.title !== "string" || entry.title.length > MAX_REPORT_STRING)) return null;
    seen.add(entry.id);
    frames.push({ id: entry.id, ...(entry.title === undefined ? {} : { title: entry.title as string }), size: entry.size as string });
  }
  return frames;
}

export function validatePlay(kind: unknown, value: unknown, entries: readonly FolderEntry[]): { target: PrototypeTarget; size: PrototypeSize } | null {
  if (kind !== ("main" satisfies WindowKind)) return null;
  const request = record(value, ["root", "path", "frame", "mark"]);
  if (request === null || typeof request.root !== "string" || typeof request.path !== "string" || !id(request.frame)) return null;
  const size = parsePrototypeMark(request.mark);
  if (size === null) return null;
  const entry = entries.find(candidate => candidate.path === request.root);
  if (entry === undefined || entry.kind !== "list") return null;
  const row = entry.canvases.find(candidate => candidate.path === request.path);
  if (row === undefined) return null;
  const canvas = canvasKeyFor(row, entry.canvases);
  if (canvas === null) return null;
  return { target: { root: entry.path, canvas, frame: request.frame }, size };
}

// Back, Forward, Close and the state read carry nothing; only the role is checked.
export function windowRequest(kind: unknown): boolean {
  return kind === ("prototype" satisfies WindowKind);
}

export function parseChooseRequest(kind: unknown, value: unknown): string | null {
  if (!windowRequest(kind)) return null;
  const request = record(value, ["frame"]);
  return request !== null && id(request.frame) ? request.frame : null;
}

export function parseReloadRequest(kind: unknown, value: unknown): number | null {
  if (!windowRequest(kind)) return null;
  const request = record(value, ["gen"]);
  return request !== null && gen(request.gen) ? request.gen : null;
}

export function parseRunReport(kind: unknown, value: unknown): RunReport | null {
  if (!windowRequest(kind) || typeof value !== "object" || value === null) return null;
  const state = (value as { state?: unknown }).state;
  if (state === "timeout") {
    const message = record(value, ["gen", "state"]);
    return message !== null && gen(message.gen) ? { gen: message.gen, state } : null;
  }
  if (state === "ready") {
    const message = record(value, ["gen", "state", "size", "frames"]);
    if (message === null || !gen(message.gen)) return null;
    const size = parsePrototypeMark(message.size);
    const frames = frameList(message.frames);
    return size === null || frames === null ? null : { gen: message.gen, state, size, frames };
  }
  if (typeof state !== "string" || !LOST.has(state)) return null;
  const message = record(value, ["gen", "state", "frames"]);
  if (message === null || !gen(message.gen)) return null;
  const frames = frameList(message.frames);
  return frames === null ? null : { gen: message.gen, state: state as LostState, frames };
}

export function parseFramesReport(kind: unknown, value: unknown): FramesMessage | null {
  if (!windowRequest(kind)) return null;
  const message = record(value, ["gen", "frames"]);
  if (message === null || !gen(message.gen)) return null;
  const frames = frameList(message.frames);
  return frames === null ? null : { gen: message.gen, frames };
}
