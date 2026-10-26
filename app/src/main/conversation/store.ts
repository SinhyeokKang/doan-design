import { closeSync, constants, mkdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalDirectory, openRegular, readRegular } from "./io";
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
  constructor(userData: string) {
    const root = canonicalDirectory(userData); this.directory = join(root, "conversations");
    try { mkdirSync(this.directory, { mode: 0o700 }); } catch (error) { if (!object(error) || error.code !== "EEXIST") throw error; }
    if (canonicalDirectory(this.directory) !== this.directory) throw new Error("Linked conversation directory");
  }
  list(): ConversationMetadata[] {
    let text: string;
    try { text = readRegular(join(this.directory, "index.json")); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
    const raw: unknown = JSON.parse(text);
    if (!object(raw) || raw.v !== 1 || !Array.isArray(raw.conversations) || !raw.conversations.every(metadata) || new Set(raw.conversations.map(m => m.conversationId)).size !== raw.conversations.length) throw new Error("Invalid conversation index");
    return raw.conversations;
  }
  save(entries: readonly ConversationMetadata[]): void {
    if (!entries.every(metadata)) throw new Error("Invalid conversation index");
    const path = join(this.directory, `index-${randomUUID()}.tmp`);
    const fd = openRegular(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try { this.write(fd, JSON.stringify({ v: 1, conversations: entries })); } finally { closeSync(fd); }
    try { renameSync(path, join(this.directory, "index.json")); } catch (error) { unlinkSync(path); throw error; }
  }
  read(id: string): ConversationEvent[] {
    if (!validId(id)) throw new Error("Invalid conversation ID");
    let text: string;
    try { text = readRegular(join(this.directory, `${id}.jsonl`), 256 * 1024 * 1024); } catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
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
    const next: ConversationEvent = { ...body, v: 1, conversationId: id, turnId, seq: this.read(id).length + 1, at: new Date().toISOString() };
    if (!event(next, id, next.seq)) throw new Error("Invalid conversation event");
    const fd = openRegular(join(this.directory, `${id}.jsonl`), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT);
    try { this.write(fd, JSON.stringify(next) + "\n"); } finally { closeSync(fd); }
    return next;
  }
  private write(fd: number, text: string): void {
    const bytes = Buffer.from(text); if (writeSync(fd, bytes) !== bytes.length) throw new Error("Incomplete conversation write");
  }
}
