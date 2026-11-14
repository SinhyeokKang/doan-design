import type { ComposerChoice } from "../../renderer/rememberChoice";
import { validAuthId } from "../agentAuth/metadata";
import { validProvider } from "../agentAuth/types";
import { permissionModeId } from "../conversation/permissionMode";
import { validAnchor } from "../conversation/prompt";
import { parseReplyAnchor, type ReplyAnchor } from "../conversation/replyAnchor";
import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import { PROTOTYPE_PANEL_MIN_WIDTH } from "./fit";
import type { ExportTarget, FramesMessage, LostState, PanelRequest, PrototypeFrame, PrototypeMode, RevealPayload, RunReport } from "./ipc";
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

// The widest panel any screen gives; the window's own range is the renderer's and main's fit's to apply.
export const MAX_PANEL_WIDTH = 4096;

export function parsePanelRequest(kind: unknown, value: unknown): PanelRequest | null {
  if (!windowRequest(kind) || typeof value !== "object" || value === null) return null;
  const request = record(value, "width" in value ? ["open", "width"] : ["open"]);
  if (request === null || typeof request.open !== "boolean") return null;
  if (request.width === undefined) return { open: request.open };
  if (typeof request.width !== "number" || !Number.isFinite(request.width)) return null;
  const width = Math.round(request.width);
  return width >= PROTOTYPE_PANEL_MIN_WIDTH && width <= MAX_PANEL_WIDTH ? { open: request.open, width } : null;
}

export function parseShowingRequest(kind: unknown, value: unknown): { conversationId: string | null } | null {
  if (!windowRequest(kind)) return null;
  const request = record(value, ["conversationId"]);
  if (request === null || (request.conversationId !== null && !validAuthId(request.conversationId))) return null;
  return { conversationId: request.conversationId };
}

// The canvas a handoff names, as the conversation records it; main then finds it among the root's listed rows.
const MAX_CANVAS_PATH = 4096;
function canvasRef(value: unknown): { path: string; id?: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const canvas = record(value, "id" in value ? ["path", "id"] : ["path"]);
  if (canvas === null || typeof canvas.path !== "string" || canvas.path === "" || canvas.path.length > MAX_CANVAS_PATH) return null;
  if (canvas.id !== undefined && !id(canvas.id)) return null;
  return { path: canvas.path, ...(canvas.id === undefined ? {} : { id: canvas.id as string }) };
}

// An answer's chip as the thread parsed it from its doan: link; the same parse again must give the same link.
function replyLink(value: unknown): ReplyAnchor | null {
  const link = record(value, ["canvas", "kind", "id"]);
  if (link === null || typeof link.canvas !== "string" || typeof link.kind !== "string" || typeof link.id !== "string") return null;
  const parsed = parseReplyAnchor(`doan:${link.canvas}/${link.kind}/${encodeURIComponent(link.id)}`);
  return parsed !== null && parsed.canvas === link.canvas && parsed.kind === link.kind && parsed.id === link.id ? parsed : null;
}

// The shape of `prototype:reveal`; whether its conversation and canvas belong to the playing canvas is
// prototypeRevealRequest's check.
export function parseRevealRequest(kind: unknown, value: unknown): RevealPayload | null {
  if (!windowRequest(kind) || typeof value !== "object" || value === null) return null;
  switch ((value as { kind?: unknown }).kind) {
    case "chip": {
      const request = record(value, ["kind", "conversationId", "anchor"]);
      return request !== null && validAuthId(request.conversationId) && validAnchor(request.anchor) ? { kind: "chip", conversationId: request.conversationId, anchor: request.anchor } : null;
    }
    case "reply": {
      const request = record(value, ["kind", "conversationId", "link"]);
      const link = request === null ? null : replyLink(request.link);
      return request !== null && link !== null && validAuthId(request.conversationId) ? { kind: "reply", conversationId: request.conversationId, link } : null;
    }
    // "Sign in to an agent…" and "Manage agents…" name no provider.
    case "settings": {
      const request = record(value, "provider" in value ? ["kind", "provider"] : ["kind"]);
      if (request === null) return null;
      if (!("provider" in request)) return { kind: "settings" };
      return validProvider(request.provider) ? { kind: "settings", provider: request.provider } : null;
    }
    case "conversation": {
      const request = record(value, ["kind", "conversationId"]);
      return request !== null && validAuthId(request.conversationId) ? { kind: "conversation", conversationId: request.conversationId } : null;
    }
    case "handoff": {
      const request = record(value, "conversationId" in value ? ["kind", "canvas", "conversationId"] : ["kind", "canvas"]);
      const canvas = request === null ? null : canvasRef(request.canvas);
      if (request === null || canvas === null) return null;
      if (request.conversationId === undefined) return { kind: "handoff", canvas };
      return validAuthId(request.conversationId) ? { kind: "handoff", canvas, conversationId: request.conversationId } : null;
    }
    default:
      return null;
  }
}

// Model and effort ids come from a provider's model list; the bound only keeps a forged pick small.
const MAX_CHOICE_ID = 256;
const choiceId = (value: unknown): value is string | null => value === null || (typeof value === "string" && value !== "" && value.length <= MAX_CHOICE_ID);
const CHOICE_KEYS = ["provider", "model", "effort", "permissionMode", "fast", "modelPicked", "effortPicked"];

// `prototype:remember`: a composer pick as ComposerChoice; the main window remembers it as its own composer's.
export function parseComposerChoice(kind: unknown, value: unknown): ComposerChoice | null {
  if (!windowRequest(kind) || typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const choice = value as Record<string, unknown>;
  if (!Object.keys(choice).every(key => CHOICE_KEYS.includes(key)) || !validProvider(choice.provider) || !("model" in choice) || !("effort" in choice)) return null;
  if (!choiceId(choice.model) || !choiceId(choice.effort)) return null;
  if (choice.permissionMode !== undefined && !permissionModeId(choice.permissionMode)) return null;
  if (choice.fast !== undefined && typeof choice.fast !== "boolean") return null;
  if ((choice.modelPicked !== undefined && choice.modelPicked !== true) || (choice.effortPicked !== undefined && choice.effortPicked !== true)) return null;
  return {
    provider: choice.provider, model: choice.model, effort: choice.effort,
    ...(choice.permissionMode !== undefined ? { permissionMode: choice.permissionMode } : {}), ...(choice.fast !== undefined ? { fast: choice.fast } : {}),
    ...(choice.modelPicked ? { modelPicked: true as const } : {}), ...(choice.effortPicked ? { effortPicked: true as const } : {}),
  };
}
