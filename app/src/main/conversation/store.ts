import { closeSync, constants, fstatSync, ftruncateSync, mkdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { CANVAS_DIRS, canvasDir } from "../../formats/canvasPath";
import { canonicalDirectory, openRegular, readRegular, readDescriptor, CONVERSATION_HISTORY_BYTES } from "./io";
import { absolutePath, object, sameCanvas } from "./sessions";
import { anchorTokens, validAnchor } from "./prompt";
import { validAuthId, validOwner } from "../agentAuth/metadata";
import { permissionModeId, type PermissionModeId } from "./permissionMode";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import type { Canvas, ConversationEvent, EventPayload, Runtime } from "./types";
interface SessionBinding<R> { runtime: R; origin: "resumed" | "new" | "newDesign"; sessionId: string; configDir: string; cwd: string }
export type ExternalSession = SessionBinding<Runtime>;
// model and effort are the conversation's latest choice; canvasesAtStart is the root's canvas list when its most recent
// turn was accepted, so a project conversation binds only to a canvas that appeared after that; fromHome marks a
// newDesign started from Home, whose turns carry Home's fixed paragraph (entries without it never do). seenSeq is the
// last seq the person has seen; an entry without it counts as seen, so an upgrade does not light up every conversation.
// permissionMode is the conversation's chosen mode; Default is stored as no key.
interface MetadataBase {
  conversationId: string; root: string; canvas?: Canvas; title: string; state: "current" | "archived";
  model?: string; effort?: string; permissionMode?: Exclude<PermissionModeId, "default">; canvasesAtStart?: Canvas[]; fromHome?: true; seenSeq?: number;
}
// Legacy-external conversations keep the shared two-runtime session; doan-owned ones run on an app provider.
export type ConversationMetadata = MetadataBase & (
  | { owner: { kind: "legacy-external" }; session: ExternalSession }
  | { owner: Extract<ConversationOwner, { kind: "doan" }>; session: SessionBinding<Provider> });
export function externalConversation(m: ConversationMetadata): m is MetadataBase & { owner: { kind: "legacy-external" }; session: ExternalSession } { return m.owner.kind === "legacy-external"; }
export const validId = validAuthId;
function str(value: unknown): value is string { return typeof value === "string" && value.length <= 1_048_576 && !value.includes("\0"); }
// Strictly below a canvas directory; the segment check below rejects `..` and empty names.
function insideCanvasDir(path: string): boolean {
  const kind = canvasDir(path);
  return kind !== null && path !== CANVAS_DIRS[kind];
}
export function validCanvas(value: unknown): value is Canvas {
  return object(value) && typeof value.path === "string" && insideCanvasDir(value.path) && value.path.length <= 4096 &&
    !value.path.includes("\0") && !value.path.split("/").some(p => p === ".." || p === "." || !p) &&
    (value.id === undefined || (typeof value.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)));
}
function label(value: unknown): value is string { return str(value) && value.length > 0; }
function metadata(value: unknown, version: 1 | 2): value is ConversationMetadata {
  if (!object(value) || !validId(value.conversationId) || typeof value.root !== "string" || !absolutePath(value.root) || !str(value.title) ||
      (value.state !== "current" && value.state !== "archived") || (value.canvas !== undefined && !validCanvas(value.canvas)) || !object(value.session) ||
      (value.fromHome !== undefined && value.fromHome !== true) || (value.model !== undefined && !label(value.model)) || (value.effort !== undefined && !label(value.effort)) ||
      (value.canvasesAtStart !== undefined && (!Array.isArray(value.canvasesAtStart) || ![...value.canvasesAtStart].every(validCanvas))) ||
      (value.seenSeq !== undefined && (typeof value.seenSeq !== "number" || !Number.isSafeInteger(value.seenSeq) || value.seenSeq < 0))) return false;
  const s = value.session;
  if (!["resumed", "new", "newDesign"].includes(String(s.origin)) ||
    typeof s.sessionId !== "string" || s.sessionId.length === 0 || s.sessionId.length > 512 || s.sessionId.startsWith("-") || s.sessionId.includes("\0") ||
    typeof s.cwd !== "string" || !absolutePath(s.cwd) || typeof s.configDir !== "string" || !absolutePath(s.configDir)) return false;
  const external = s.runtime === "claude" || s.runtime === "codex";
  // v1 predates account ownership; any owner field there is ignored, never trusted.
  if (version === 1) return external;
  return validOwner(value.owner) && (value.owner.kind === "legacy-external" ? external : s.runtime === value.owner.provider);
}
function validEntries(entries: readonly unknown[], version: 1 | 2): entries is ConversationMetadata[] {
  return entries.every(m => metadata(m, version)) && new Set(entries.map(m => (m as ConversationMetadata).conversationId)).size === entries.length;
}
export type IndexRead = { ok: true; entries: ConversationMetadata[] } | { ok: false; code: "corrupt" | "unknown_version" | "invalid" };
export function parseIndex(text: string): IndexRead {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: "corrupt" }; }
  if (!object(raw)) return { ok: false, code: "corrupt" };
  const version = raw.v;
  if (version !== 1 && version !== 2) return { ok: false, code: "unknown_version" };
  if (!Array.isArray(raw.conversations) || !validEntries(raw.conversations, version)) return { ok: false, code: "invalid" };
  const entries = raw.conversations.map(storedMode);
  return { ok: true, entries: version === 1 ? entries.map(m => ({ ...m, owner: { kind: "legacy-external" } }) as ConversationMetadata) : entries };
}
// Unlike the other known fields, a permission mode this build cannot read (a later build's mode) reads as Default for
// that entry alone instead of making the index invalid; Default is never wider than the person's own settings.
function storedMode(m: ConversationMetadata): ConversationMetadata {
  const stored: unknown = m.permissionMode;
  if (!("permissionMode" in m) || (permissionModeId(stored) && stored !== "default")) return m;
  const { permissionMode: _unknown, ...rest } = m;
  return rest as ConversationMetadata;
}
function payload(value: Record<string, unknown>): value is Record<string, unknown> & EventPayload {
  switch (value.type) {
    case "turn.started": case "turn.done": case "conversation.archived": case "conversation.restored": return true;
    case "conversation.bound": return validCanvas(value.canvas);
    case "user.message": return str(value.text) && Array.isArray(value.anchors) && [...value.anchors].every(validAnchor) && anchorTokens(value.text, value.anchors) !== null &&
      (value.attachments === undefined || (Array.isArray(value.attachments) && [...value.attachments].every(attachment)));
    case "message.delta": case "message.done": return str(value.messageId) && str(value.text);
    case "activity": return ["edit", "read", "command", "other"].includes(String(value.kind)) && str(value.summary) && (value.path === undefined || str(value.path)) && (value.insideDesign === undefined || typeof value.insideDesign === "boolean");
    case "permission.request": return str(value.requestId) && str(value.tool) && str(value.summary) && Array.isArray(value.options) && value.options.length > 0 && [...value.options].every(o => object(o) && str(o.id) && str(o.label) && ["allow", "allowAlways", "deny"].includes(String(o.kind)));
    case "permission.resolved": return str(value.requestId) && str(value.optionId);
    case "interrupted": return ["user", "appQuit", "crashed"].includes(String(value.reason));
    case "turn.failed": return ["runtime_unsupported", "cli_missing", "not_logged_in", "session_unavailable", "session_in_use", "process_exited", "rate_limited", "unknown"].includes(String(value.code)) && (value.detail === undefined || str(value.detail));
    default: return false;
  }
}
function attachment(value: unknown): boolean {
  return object(value) && label(value.name) && typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0 &&
    (value.kind === "image" || value.kind === "file") && typeof value.path === "string" && absolutePath(value.path);
}
function event(value: unknown, id: string, seq: number): value is ConversationEvent {
  return object(value) && value.v === 1 && value.conversationId === id && value.seq === seq && validId(value.turnId) &&
    typeof value.at === "string" && Number.isFinite(Date.parse(value.at)) && payload(value);
}
// A restore: the archived target becomes its canvas's current conversation and the current one is archived. Null when
// the target is not an archived canvas conversation.
export function restoreEntries(entries: readonly ConversationMetadata[], id: string): { entries: ConversationMetadata[]; replaced: string[] } | null {
  const target = entries.find(m => m.conversationId === id);
  if (!target || target.state !== "archived" || !target.canvas) return null;
  const canvas = target.canvas;
  const replaced = entries.filter(m => m.state === "current" && m.root === target.root && m.canvas && sameCanvas(m.canvas, canvas)).map(m => m.conversationId);
  return { entries: entries.map(m => m === target ? { ...m, state: "current" } : replaced.includes(m.conversationId) ? { ...m, state: "archived" } : m), replaced };
}
export interface JournalWrite { id: string; turn: string; body: EventPayload }
// What an accepted change does to the index. replaced: the current conversations it archives.
export type JournalChange =
  | { kind: "start"; id: string }
  | { kind: "bind" | "promote"; id: string; canvas: Canvas; replaced: string[] }
  | { kind: "restore"; id: string; replaced: string[] };
interface FileIdentity { id: string; size: number; ino: number; dev: number }
type Journal = JournalChange & { previous: FileIdentity[] };
function sameIds(a: readonly string[], b: readonly string[]): boolean { return a.length === new Set(b).size && new Set([...a, ...b]).size === a.length; }
function validChange(change: JournalChange): boolean {
  if (!validId(change.id)) return false;
  if (change.kind === "start") return true;
  if ((change.kind === "bind" || change.kind === "promote") && !validCanvas(change.canvas)) return false;
  return Array.isArray(change.replaced) && change.replaced.every(validId) && !change.replaced.includes(change.id) && new Set(change.replaced).size === change.replaced.length;
}
// Whether an index holds the change, does not hold it yet, or neither (a damaged or foreign record). others: every
// touched conversation besides the target, all current before the change and archived by it.
function changeState(change: JournalChange, others: readonly string[], index: readonly ConversationMetadata[]): "committed" | "uncommitted" | null {
  const find = (id: string) => index.find(m => m.conversationId === id);
  const all = (state: "current" | "archived") => others.every(id => find(id)?.state === state);
  const target = find(change.id);
  switch (change.kind) {
    case "start":
      if (index.some(m => m.conversationId !== change.id && m.conversationId.toLowerCase() === change.id.toLowerCase())) return null;
      if (!target) return all("current") ? "uncommitted" : null;
      return target.state === "current" && all("archived") ? "committed" : null;
    case "bind": case "promote":
      if (!target || target.state !== "current") return null;
      if (!target.canvas) return all("current") ? "uncommitted" : null;
      return sameCanvas(target.canvas, change.canvas) && all("archived") ? "committed" : null;
    case "restore":
      if (!target) return null;
      if (target.state === "archived") return all("current") ? "uncommitted" : null;
      return all("archived") ? "committed" : null;
  }
}
// A journal without a version predates the kinds and is always a start.
function parseJournal(raw: unknown): Journal {
  const legacy = object(raw) && raw.v === undefined && raw.kind === undefined;
  const kind = legacy ? "start" : object(raw) && raw.v === 1 && ["start", "bind", "promote", "restore"].includes(String(raw.kind)) ? raw.kind as JournalChange["kind"] : null;
  const invalid = () => new Error(kind ? `Invalid ${kind} recovery record` : "Invalid recovery record");
  if (!kind || !object(raw) || !validId(raw.id) || !Array.isArray(raw.previous)) throw invalid();
  const id = raw.id;
  const change: JournalChange = kind === "start" ? { kind, id } : kind === "restore" ? { kind, id, replaced: raw.replaced as string[] } : { kind, id, canvas: raw.canvas as Canvas, replaced: raw.replaced as string[] };
  if (!validChange(change)) throw invalid();
  const previous: FileIdentity[] = [];
  // A start's own log is not a previous record; every other kind lists its target among them.
  const ids = new Set(kind === "start" ? [id.toLowerCase()] : []), identities = new Set<string>();
  for (const old of raw.previous) {
    if (!object(old) || !validId(old.id) || typeof old.size !== "number" || !Number.isSafeInteger(old.size) || old.size < 0 || old.size > CONVERSATION_HISTORY_BYTES ||
        typeof old.ino !== "number" || !Number.isSafeInteger(old.ino) || old.ino < 0 || typeof old.dev !== "number" || !Number.isSafeInteger(old.dev) || old.dev < 0 ||
        ids.has(old.id.toLowerCase()) || identities.has(`${old.dev}:${old.ino}`)) throw invalid();
    ids.add(old.id.toLowerCase()); identities.add(`${old.dev}:${old.ino}`);
    previous.push({ id: old.id, size: old.size, ino: old.ino, dev: old.dev });
  }
  if (change.kind !== "start" && !sameIds(previous.map(old => old.id), [id, ...change.replaced])) throw invalid();
  return { ...change, previous };
}
export class ConversationStore {
  private readonly directory: string;
  private accepting = false;
  constructor(userData: string) {
    const root = canonicalDirectory(userData); this.directory = join(root, "conversations");
    try { mkdirSync(this.directory, { mode: 0o700 }); } catch (error) { if (!object(error) || error.code !== "EEXIST") throw error; }
    if (canonicalDirectory(this.directory) !== this.directory) throw new Error("Linked conversation directory");
    this.recover();
  }
  list(): ConversationMetadata[] {
    if (!this.accepting) this.recover();
    return this.readIndex();
  }
  private readIndex(): ConversationMetadata[] {
    let text: string;
    try { text = readRegular(join(this.directory, "index.json")); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
    const read = parseIndex(text);
    if (!read.ok) throw new Error(read.code === "unknown_version" ? "Unsupported conversation index version" : "Invalid conversation index");
    return read.entries;
  }
  save(entries: readonly ConversationMetadata[]): void {
    if (!this.accepting) this.recover();
    if (!validEntries(entries, 2)) throw new Error("Invalid conversation index");
    // A future or damaged index is kept for diagnosis instead of being replaced.
    this.readIndex();
    const path = join(this.directory, `index-${randomUUID()}.tmp`);
    const fd = openRegular(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try { this.write(fd, JSON.stringify({ v: 2, conversations: entries })); } finally { closeSync(fd); }
    try { renameSync(path, join(this.directory, "index.json")); } catch (error) { unlinkSync(path); throw error; }
  }
  // The index rename is the commit point. An undo record survives interrupted log writes.
  acceptStart(entries: ConversationMetadata[], id: string, writes: JournalWrite[]): ConversationEvent[] {
    return this.acceptChange({ kind: "start", id }, entries, writes);
  }
  // Binding, promotion and restore change conversations already in the index, so their logs are cut back to their
  // prefixes instead of removed; each kind has its own test of whether the new index holds it.
  acceptChange(change: JournalChange, entries: ConversationMetadata[], writes: JournalWrite[]): ConversationEvent[] {
    this.recover();
    const currentIndex = this.readIndex();
    const touched = [...new Set(writes.map(w => w.id))];
    if (!validChange(change) || !touched.every(validId) ||
        (change.kind !== "start" && !sameIds(touched, [change.id, ...change.replaced]))) throw new Error("Invalid change targets");
    const others = touched.filter(id => id !== change.id);
    if (changeState(change, others, currentIndex) !== "uncommitted" || changeState(change, others, entries) !== "committed") throw new Error("Invalid change targets");
    const previous = (change.kind === "start" ? others : touched).map(old => {
      const fd = openRegular(join(this.directory, `${old}.jsonl`));
      try { this.parse(readDescriptor(fd, CONVERSATION_HISTORY_BYTES), old); const stat = fstatSync(fd); return { id: old, size: stat.size, ino: stat.ino, dev: stat.dev }; } finally { closeSync(fd); }
    });
    const journal = join(this.directory, "start-undo.json");
    const temp = join(this.directory, `undo-${randomUUID()}.tmp`);
    const fd = openRegular(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try { this.write(fd, JSON.stringify({ v: 1, ...change, previous })); } finally { closeSync(fd); }
    renameSync(temp, journal);
    let saved: ConversationEvent[];
    this.accepting = true;
    try {
      saved = writes.map(w => this.append(w.id, w.turn, w.body));
      this.save(entries);
    } catch (error) { this.recover(); throw error; } finally { this.accepting = false; }
    // A cleanup failure cannot turn a committed change into a rejected operation.
    try { unlinkSync(journal); } catch (error) { console.error("doan: committed change cleanup deferred", error); }
    return saved;
  }
  private recover(): void {
    const path = join(this.directory, "start-undo.json");
    let text: string;
    try { text = readRegular(path); } catch (error) { if (object(error) && error.code === "ENOENT") return; throw error; }
    const journal = parseJournal(JSON.parse(text));
    const index = this.readIndex(), ids = journal.previous.map(old => old.id);
    const state = changeState(journal, ids.filter(id => id !== journal.id), index);
    if (!state) throw new Error(`Invalid ${journal.kind} recovery record`);
    if (state === "uncommitted") {
      const identities = new Set(journal.previous.map(old => `${old.dev}:${old.ino}`));
      const targets: { fd: number; size: number }[] = [];
      let newFd: number | undefined;
      try {
        // Validate every pinned target and rollback prefix before the first destructive write.
        for (const old of journal.previous) {
          const fd = openRegular(join(this.directory, `${old.id}.jsonl`), constants.O_RDWR);
          targets.push({ fd, size: old.size });
          const stat = fstatSync(fd);
          if (stat.ino !== old.ino || stat.dev !== old.dev || stat.size < old.size) throw new Error("Recovery file identity changed");
          const prefix = readDescriptor(fd, CONVERSATION_HISTORY_BYTES, old.size);
          if (prefix && !prefix.endsWith("\n")) throw new Error("Invalid recovery boundary");
          this.parse(prefix, old.id);
        }
        // Only a start created a log of its own, which goes away with it.
        if (journal.kind === "start") {
          try { newFd = openRegular(join(this.directory, `${journal.id}.jsonl`)); }
          catch (error) { if (!object(error) || error.code !== "ENOENT") throw error; }
          if (newFd !== undefined) {
            const stat = fstatSync(newFd);
            if (identities.has(`${stat.dev}:${stat.ino}`)) throw new Error("Invalid start recovery target");
          }
        }
        for (const target of targets) ftruncateSync(target.fd, target.size);
        if (newFd !== undefined) unlinkSync(join(this.directory, `${journal.id}.jsonl`));
      } finally { if (newFd !== undefined) closeSync(newFd); for (const target of targets) closeSync(target.fd); }
    }
    unlinkSync(path);
  }
  read(id: string): ConversationEvent[] {
    if (!this.accepting) this.recover();
    if (!validId(id)) throw new Error("Invalid conversation ID");
    let text: string;
    try { text = readRegular(join(this.directory, `${id}.jsonl`), CONVERSATION_HISTORY_BYTES); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
    return this.parse(text, id);
  }
  // Aggregation must distinguish a missing indexed history from a valid empty one.
  readRequired(id: string): ConversationEvent[] {
    if (!this.accepting) this.recover();
    if (!validId(id)) throw new Error("Invalid conversation ID");
    return this.parse(readRegular(join(this.directory, `${id}.jsonl`), CONVERSATION_HISTORY_BYTES), id);
  }
  private parse(text: string, id: string): ConversationEvent[] {
    const result: ConversationEvent[] = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      const raw: unknown = JSON.parse(line);
      if (!event(raw, id, result.length + 1)) throw new Error("Invalid conversation event");
      result.push(raw);
    }
    return result;
  }
  append(id: string, turnId: string, body: EventPayload): ConversationEvent {
    if (!this.accepting) this.recover();
    if (!validId(id)) throw new Error("Invalid conversation ID");
    const fd = openRegular(join(this.directory, `${id}.jsonl`), constants.O_RDWR | constants.O_APPEND | constants.O_CREAT);
    try {
      const history = this.parse(readDescriptor(fd, CONVERSATION_HISTORY_BYTES), id);
      const next: ConversationEvent = { ...body, v: 1, conversationId: id, turnId, seq: history.length + 1, at: new Date().toISOString() };
      if (!event(next, id, next.seq)) throw new Error("Invalid conversation event");
      const serialized = JSON.stringify(next) + "\n";
      if (fstatSync(fd).size + Buffer.byteLength(serialized, "utf8") > CONVERSATION_HISTORY_BYTES) throw new Error("File exceeds limit");
      this.write(fd, serialized);
      return next;
    } finally { closeSync(fd); }
  }
  private write(fd: number, text: string): void {
    const bytes = Buffer.from(text); if (writeSync(fd, bytes) !== bytes.length) throw new Error("Incomplete conversation write");
  }
}
