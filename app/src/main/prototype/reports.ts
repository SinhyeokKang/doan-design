import type { FramesMessage, LostState, PrototypeFrame, PrototypeGoto, RunReport } from "./ipc";
import { parsePrototypeMark } from "./mark";

// The run's reports as the prototype script posts them. Main and the window's host both check them, so a canvas cannot
// hand IPC an unbounded object; keep this module free of imports the renderer cannot take.

// The board's `layout` message clips frame IDs and titles at 200 UTF-16 units, so no longer ID can be selected.
export const MAX_REPORT_STRING = 200;
export const MAX_REPORT_FRAMES = 1000;
// The links a run reports, and the frames around one link: the script leaves out a link past either rather than cut.
export const MAX_REPORT_GOTOS = 1000;
export const MAX_GOTO_FRAMES = 1000;

const LOST: ReadonlySet<string> = new Set<LostState>(["missing", "duplicate", "unmarked", "invalid"]);

export function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const own = Object.keys(value);
  if (own.length !== keys.length || !keys.every(key => own.includes(key))) return null;
  return value as Record<string, unknown>;
}

export function id(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= MAX_REPORT_STRING;
}

export function gen(value: unknown): value is number {
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

// Values and ids are raw: an empty one is a link or frame the drawer's groups leave out, not a malformed report.
function gotoList(value: unknown): PrototypeGoto[] | null {
  if (!Array.isArray(value) || value.length > MAX_REPORT_GOTOS) return null;
  const gotos: PrototypeGoto[] = [];
  for (const raw of value) {
    const entry = record(raw, ["value", "frames"]);
    if (entry === null || typeof entry.value !== "string" || entry.value.length > MAX_REPORT_STRING) return null;
    if (!Array.isArray(entry.frames) || entry.frames.length > MAX_GOTO_FRAMES) return null;
    // for…of reads every index, holes as undefined: a structured clone keeps a sparse array's holes, which every() skips.
    const frames: string[] = [];
    for (const frame of entry.frames as unknown[]) {
      if (typeof frame !== "string" || frame.length > MAX_REPORT_STRING) return null;
      frames.push(frame);
    }
    gotos.push({ value: entry.value, frames });
  }
  return gotos;
}

export function runReport(value: unknown): RunReport | null {
  if (typeof value !== "object" || value === null) return null;
  const state = (value as { state?: unknown }).state;
  if (state === "timeout") {
    const message = record(value, ["gen", "state"]);
    return message !== null && gen(message.gen) ? { gen: message.gen, state } : null;
  }
  if (state === "ready") {
    const message = record(value, ["gen", "state", "size", "frames", "gotos"]);
    if (message === null || !gen(message.gen)) return null;
    const size = parsePrototypeMark(message.size);
    const frames = frameList(message.frames);
    const gotos = gotoList(message.gotos);
    return size === null || frames === null || gotos === null ? null : { gen: message.gen, state, size, frames, gotos };
  }
  if (typeof state !== "string" || !LOST.has(state)) return null;
  const message = record(value, ["gen", "state", "frames", "gotos"]);
  if (message === null || !gen(message.gen)) return null;
  const frames = frameList(message.frames);
  const gotos = gotoList(message.gotos);
  return frames === null || gotos === null ? null : { gen: message.gen, state: state as LostState, frames, gotos };
}

export function framesReport(value: unknown): FramesMessage | null {
  const message = record(value, ["gen", "frames", "gotos"]);
  if (message === null || !gen(message.gen)) return null;
  const frames = frameList(message.frames);
  const gotos = gotoList(message.gotos);
  return frames === null || gotos === null ? null : { gen: message.gen, frames, gotos };
}
