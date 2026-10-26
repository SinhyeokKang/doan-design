import { closeSync, constants, fstatSync, ftruncateSync, mkdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalDirectory, openRegular, readRegular, readDescriptor } from "./io";
import { absolutePath, object } from "./sessions";
import { anchorTokens, validAnchor } from "./prompt";
import type { Canvas, ConversationEvent, EventPayload, Runtime } from "./types";
export interface ConversationMetadata {
  conversationId: string; root: string; canvas?: Canvas; title: string; state: "current" | "archived";
  session: { runtime: Runtime; origin: "resumed" | "new" | "newDesign"; sessionId: string; configDir: string; cwd: string };
}
export function validId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value); }
function str(value: unknown): value is string { return typeof value === "string" && value.length <= 1_048_576 && !value.includes("\0"); }
export function validCanvas(value: unknown): value is Canvas {
  return object(value) && typeof value.path === "string" && value.path.startsWith("design/") && value.path.length <= 4096 &&
    !value.path.includes("\0") && !value.path.split("/").some(p => p === ".." || p === "." || !p) &&
    (value.id === undefined || (typeof value.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)));
}
function metadata(value: unknown): value is ConversationMetadata {
  if (!object(value) || !validId(value.conversationId) || typeof value.root !== "string" || !absolutePath(value.root) || !str(value.title) ||
      (value.state !== "current" && value.state !== "archived") || (value.canvas !== undefined && !validCanvas(value.canvas)) || !object(value.session)) return false;
  const s = value.session;
  return (s.runtime === "claude" || s.runtime === "codex") && ["resumed", "new", "newDesign"].includes(String(s.origin)) &&
    typeof s.sessionId === "string" && s.sessionId.length > 0 && s.sessionId.length <= 512 && !s.sessionId.startsWith("-") && !s.sessionId.includes("\0") &&
    typeof s.cwd === "string" && absolutePath(s.cwd) && typeof s.configDir === "string" && absolutePath(s.configDir);
}
function payload(value: Record<string, unknown>): value is Record<string, unknown> & EventPayload {
  switch (value.type) {
    case "turn.started": case "turn.done": case "conversation.archived": return true;
    case "user.message": return str(value.text) && Array.isArray(value.anchors) && [...value.anchors].every(validAnchor) && anchorTokens(value.text, value.anchors) !== null;
    case "message.delta": case "message.done": return str(value.messageId) && str(value.text);
    case "activity": return ["edit", "read", "command", "other"].includes(String(value.kind)) && str(value.summary) && (value.path === undefined || str(value.path)) && (value.insideDesign === undefined || typeof value.insideDesign === "boolean");
    case "permission.request": return str(value.requestId) && str(value.tool) && str(value.summary) && Array.isArray(value.options) && value.options.length > 0 && [...value.options].every(o => object(o) && str(o.id) && str(o.label) && ["allow", "allowAlways", "deny"].includes(String(o.kind)));
    case "permission.resolved": return str(value.requestId) && str(value.optionId);
    case "interrupted": return ["user", "appQuit", "crashed"].includes(String(value.reason));
    case "turn.failed": return ["runtime_unsupported", "cli_missing", "not_logged_in", "session_unavailable", "session_in_use", "process_exited", "rate_limited", "unknown"].includes(String(value.code)) && (value.detail === undefined || str(value.detail));
    default: return false;
  }
}
function event(value: unknown, id: string, seq: number): value is ConversationEvent {
  return object(value) && value.v === 1 && value.conversationId === id && value.seq === seq && validId(value.turnId) &&
    typeof value.at === "string" && Number.isFinite(Date.parse(value.at)) && payload(value);
}
export class ConversationStore {
  private readonly directory: string;
  private accepting = false;
  constructor(userData: string) {
    const root = canonicalDirectory(userData); this.directory = join(root, "conversations");
    try { mkdirSync(this.directory, { mode: 0o700 }); } catch (error) { if (!object(error) || error.code !== "EEXIST") throw error; }
    if (canonicalDirectory(this.directory) !== this.directory) throw new Error("Linked conversation directory");
    this.recoverStart();
  }
  list(): ConversationMetadata[] {
    if (!this.accepting) this.recoverStart();
    return this.readIndex();
  }
  private readIndex(): ConversationMetadata[] {
    let text: string;
    try { text = readRegular(join(this.directory, "index.json")); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
    const raw: unknown = JSON.parse(text);
    if (!object(raw) || raw.v !== 1 || !Array.isArray(raw.conversations) || !raw.conversations.every(metadata) || new Set(raw.conversations.map(m => m.conversationId)).size !== raw.conversations.length) throw new Error("Invalid conversation index");
    return raw.conversations;
  }
  save(entries: readonly ConversationMetadata[]): void {
    if (!this.accepting) this.recoverStart();
    if (!entries.every(metadata)) throw new Error("Invalid conversation index");
    const path = join(this.directory, `index-${randomUUID()}.tmp`);
    const fd = openRegular(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try { this.write(fd, JSON.stringify({ v: 1, conversations: entries })); } finally { closeSync(fd); }
    try { renameSync(path, join(this.directory, "index.json")); } catch (error) { unlinkSync(path); throw error; }
  }
  // The index rename is the commit point. An undo record survives interrupted log writes.
  acceptStart(entries: ConversationMetadata[], id: string, writes: { id: string; turn: string; body: EventPayload }[]): ConversationEvent[] {
    this.recoverStart();
    const previous = [...new Set(writes.map(w => w.id).filter(old => old !== id))].map(old => {
      const fd = openRegular(join(this.directory, `${old}.jsonl`));
      try { this.parse(readDescriptor(fd, 256 * 1024 * 1024), old); const stat = fstatSync(fd); return { id: old, size: stat.size, ino: stat.ino, dev: stat.dev }; } finally { closeSync(fd); }
    });
    const journal = join(this.directory, "start-undo.json");
    const temp = join(this.directory, `undo-${randomUUID()}.tmp`);
    const fd = openRegular(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try { this.write(fd, JSON.stringify({ id, previous })); } finally { closeSync(fd); }
    renameSync(temp, journal);
    let saved: ConversationEvent[];
    this.accepting = true;
    try {
      saved = writes.map(w => this.append(w.id, w.turn, w.body));
      this.save(entries);
    } catch (error) { this.recoverStart(); throw error; } finally { this.accepting = false; }
    // A cleanup failure cannot turn a committed start into a rejected operation.
    try { unlinkSync(journal); } catch (error) { console.error("doan: committed start cleanup deferred", error); }
    return saved;
  }
  private recoverStart(): void {
    const journal = join(this.directory, "start-undo.json");
    let text: string;
    try { text = readRegular(journal); } catch (error) { if (object(error) && error.code === "ENOENT") return; throw error; }
    const raw: unknown = JSON.parse(text);
    if (!object(raw) || !validId(raw.id) || !Array.isArray(raw.previous)) throw new Error("Invalid start recovery record");
    if (!this.readIndex().some(m => m.conversationId === raw.id)) {
      for (const old of raw.previous) {
        if (!object(old) || !validId(old.id) || typeof old.size !== "number" || !Number.isSafeInteger(old.size) || old.size < 0 || typeof old.ino !== "number" || typeof old.dev !== "number") throw new Error("Invalid start recovery record");
        const fd = openRegular(join(this.directory, `${old.id}.jsonl`), constants.O_RDWR);
        try {
          const stat = fstatSync(fd);
          if (stat.ino !== old.ino || stat.dev !== old.dev || stat.size < old.size) throw new Error("Recovery file identity changed");
          ftruncateSync(fd, old.size);
        } finally { closeSync(fd); }
      }
      try { unlinkSync(join(this.directory, `${raw.id}.jsonl`)); } catch (error) { if (!object(error) || error.code !== "ENOENT") throw error; }
    }
    unlinkSync(journal);
  }
  read(id: string): ConversationEvent[] {
    if (!this.accepting) this.recoverStart();
    if (!validId(id)) throw new Error("Invalid conversation ID");
    let text: string;
    try { text = readRegular(join(this.directory, `${id}.jsonl`), 256 * 1024 * 1024); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
    return this.parse(text, id);
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
    if (!this.accepting) this.recoverStart();
    if (!validId(id)) throw new Error("Invalid conversation ID");
    const fd = openRegular(join(this.directory, `${id}.jsonl`), constants.O_RDWR | constants.O_APPEND | constants.O_CREAT);
    try {
      const history = this.parse(readDescriptor(fd, 256 * 1024 * 1024), id);
      const next: ConversationEvent = { ...body, v: 1, conversationId: id, turnId, seq: history.length + 1, at: new Date().toISOString() };
      if (!event(next, id, next.seq)) throw new Error("Invalid conversation event");
      this.write(fd, JSON.stringify(next) + "\n");
      return next;
    } finally { closeSync(fd); }
  }
  private write(fd: number, text: string): void {
    const bytes = Buffer.from(text); if (writeSync(fd, bytes) !== bytes.length) throw new Error("Incomplete conversation write");
  }
}
