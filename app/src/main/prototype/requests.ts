import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import type { ExportTarget, FramesMessage, LostState, PrototypeFrame, PrototypeMode, RunReport } from "./ipc";
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
  // Numbers count every frame of the document, listed or not, so they only ever grow down the list.
  let last = 0;
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = record(raw, "title" in raw ? ["id", "title", "size", "number"] : ["id", "size", "number"]);
    if (entry === null || !id(entry.id) || seen.has(entry.id) || parsePrototypeMark(entry.size) === null) return null;
    if (entry.title !== undefined && (typeof entry.title !== "string" || entry.title.length > MAX_REPORT_STRING)) return null;
    if (!Number.isSafeInteger(entry.number) || (entry.number as number) <= last) return null;
    last = entry.number as number;
    seen.add(entry.id);
    frames.push({ id: entry.id, ...(entry.title === undefined ? {} : { title: entry.title as string }), size: entry.size as string, number: last });
  }
  return frames;
}

// The row and canvas key a play names in main's own list: the main window's Play and `doan open --prototype` alike. A
// canvas ID two rows share is no target, as the board refuses it.
export function playTarget(root: string, path: string, frame: unknown, mark: unknown, entries: readonly FolderEntry[]): { target: PrototypeTarget; size: PrototypeSize } | null {
  if (!id(frame)) return null;
  const size = parsePrototypeMark(mark);
  if (size === null) return null;
  const entry = entries.find(candidate => candidate.path === root);
  if (entry === undefined || entry.kind !== "list") return null;
  const row = entry.canvases.find(candidate => candidate.path === path);
  if (row === undefined) return null;
  const canvas = canvasKeyFor(row, entry.canvases);
  if (canvas === null) return null;
  return { target: { root: entry.path, canvas, frame }, size };
}

export function validatePlay(kind: unknown, value: unknown, entries: readonly FolderEntry[]): { target: PrototypeTarget; size: PrototypeSize } | null {
  if (kind !== ("main" satisfies WindowKind)) return null;
  const request = record(value, ["root", "path", "frame", "mark"]);
  if (request === null || typeof request.root !== "string" || typeof request.path !== "string") return null;
  return playTarget(request.root, request.path, request.frame, request.mark, entries);
}

// `doan open --prototype` (app-socket v6) as main acts on it. The schema allows a frame ID of 200 code points; only 200
// UTF-16 units can be selected on the board or listed by a run, so a longer one is refused here too.
export interface CliPlay {
  root: string;
  path: string;
  frame: string;
  mark: string;
}

export function validateCliPlay(value: unknown): CliPlay | null {
  const request = record(value, ["v", "token", "root", "path", "frame", "mark"]);
  if (request === null || request.v !== 6 || typeof request.token !== "string" || typeof request.root !== "string" || typeof request.path !== "string") return null;
  if (!id(request.frame) || typeof request.mark !== "string" || parsePrototypeMark(request.mark) === null) return null;
  return { root: request.root, path: request.path, frame: request.frame, mark: request.mark };
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

export function parseModeRequest(kind: unknown, value: unknown): PrototypeMode | null {
  if (!windowRequest(kind)) return null;
  const request = record(value, ["mode"]);
  return request !== null && (request.mode === "fit" || request.mode === "responsive") ? request.mode : null;
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

// `prototype:export`: the target the window showed when Export was pressed, compared with what plays when main gets it.
export function parseExportRequest(kind: unknown, value: unknown): ExportTarget | null {
  if (!windowRequest(kind)) return null;
  const request = record(value, ["root", "path", "frame"]);
  if (request === null || typeof request.root !== "string" || typeof request.path !== "string" || !id(request.frame)) return null;
  return { root: request.root, path: request.path, frame: request.frame };
}

// `current` is null when nothing plays that main can name by a listed row (the canvas went, or its ID is now shared).
export function exportTargetMatches(clicked: ExportTarget, current: ExportTarget | null): boolean {
  return current !== null && clicked.root === current.root && clicked.path === current.path && clicked.frame === current.frame;
}
