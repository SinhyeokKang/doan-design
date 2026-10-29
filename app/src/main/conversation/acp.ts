import { posix } from "node:path";
import { insideRoot, object } from "./sessions";
import { displayPath, GENERIC_SUMMARY, transportError } from "./transport";
import type { EventPayload, PermissionOption, TransportResult, TransportState } from "./types";

// Agent Client Protocol (https://agentclientprotocol.com) over newline-delimited JSON-RPC 2.0 on stdio, as Cursor
// (`agent acp`), Copilot (`copilot --acp --stdio`) and Antigravity (agy_acp_server) speak it.
export const ACP_PROTOCOL_VERSION = 1;
export const ACP_LINE_LIMIT = 4 * 1024 * 1024;
type Handler = (params: Record<string, unknown>, id: string | number) => void;
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }
export class AcpError extends Error { constructor(message: string, readonly code?: number) { super(message); } }
export class AcpConnection {
  private pending = new Map<string | number, Pending>();
  private next = 1;
  private buffer = "";
  private closed = false;
  constructor(private write: (line: string) => void, private onRequest: Handler, private onNotification: (method: string, params: Record<string, unknown>) => void, private onFailure: (detail: string) => void) {}
  request(method: string, params: unknown, timeoutMs: number | null = 60_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new AcpError("process_exited"));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const entry: Pending = { resolve, reject };
      if (timeoutMs !== null) entry.timer = setTimeout(() => { this.pending.delete(id); reject(new AcpError(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, entry);
      try { this.send({ jsonrpc: "2.0", id, method, params }); } catch (error) { clearTimeout(entry.timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(method: string, params: unknown): void { this.send({ jsonrpc: "2.0", method, params }); }
  respond(id: string | number, result: unknown): void { this.send({ jsonrpc: "2.0", id, result }); }
  fail(id: string | number, code: number, message: string): void { this.send({ jsonrpc: "2.0", id, error: { code, message } }); }
  receive(text: string): void {
    if (this.closed) return;
    this.buffer += text;
    if (this.buffer.length > ACP_LINE_LIMIT) { this.close(); this.onFailure("ACP message too large"); return; }
    let end: number;
    while (!this.closed && (end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end + 1);
      if (line) this.line(line);
    }
  }
  close(): void {
    if (this.closed) return; this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new AcpError("process_exited")); }
    this.pending.clear();
  }
  private send(value: unknown): void { if (this.closed) throw new AcpError("process_exited"); this.write(JSON.stringify(value) + "\n"); }
  private line(line: string): void {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { this.close(); this.onFailure("ACP output is not JSON"); return; }
    if (!object(raw) || raw.jsonrpc !== "2.0") { this.close(); this.onFailure("ACP message is not JSON-RPC 2.0"); return; }
    const id = raw.id;
    if (id !== undefined && typeof id !== "string" && !(typeof id === "number" && Number.isSafeInteger(id))) { this.close(); this.onFailure("ACP message has an invalid id"); return; }
    if (typeof raw.method === "string") {
      const params = object(raw.params) ? raw.params : {};
      if (id === undefined) this.onNotification(raw.method, params); else this.onRequestOf(raw.method, params, id);
      return;
    }
    if (id === undefined) return;
    const entry = this.pending.get(id); if (!entry) return;
    this.pending.delete(id); clearTimeout(entry.timer);
    if (object(raw.error)) entry.reject(new AcpError(acpErrorText(raw.error), typeof raw.error.code === "number" ? raw.error.code : undefined));
    else entry.resolve(raw.result);
  }
  private onRequestOf(method: string, params: Record<string, unknown>, id: string | number): void {
    if (method === "session/request_permission") this.onRequest(params, id);
    // Cursor's documented blocking extension: skipping lets the turn go on without a question UI.
    else if (method === "cursor/ask_question") this.respond(id, { outcome: { outcome: "skipped" } });
    // doan declares no fs or terminal capability, so every other client method is unsupported.
    else this.fail(id, -32601, "Method not found");
  }
}
// error.data.message carries the provider's own wording (Cursor, Antigravity: "Authentication required...").
export function acpErrorText(error: Record<string, unknown>): string {
  const data = object(error.data) && typeof error.data.message === "string" ? error.data.message : "";
  const message = typeof error.message === "string" ? error.message : "ACP error";
  return (data && !data.startsWith(message) ? `${message}: ${data}` : data || message).slice(0, 4096);
}

export interface AcpChoice { option: PermissionOption; optionId: string }
// ACP option kinds are allow_once | allow_always | reject_once | reject_always; doan offers allow, deny and, only when
// the agent offers one, allow always. A one-time choice is preferred so a deny never becomes a standing rule.
export function acpPermission(params: Record<string, unknown>, requestId: string): { event: Extract<EventPayload, { type: "permission.request" }>; choices: AcpChoice[] } | null {
  if (!Array.isArray(params.options)) return null;
  const options = params.options.filter(object).filter(o => typeof o.optionId === "string" && o.optionId.length <= 512 && typeof o.kind === "string");
  const pick = (...kinds: string[]) => { for (const kind of kinds) { const found = options.find(o => o.kind === kind); if (found) return String(found.optionId); } return null; };
  const allow = pick("allow_once"), always = pick("allow_always"), deny = pick("reject_once", "reject_always");
  const choices: AcpChoice[] = [];
  if (allow) choices.push({ optionId: allow, option: { id: "allow", label: "Allow", kind: "allow" } });
  if (always) choices.push({ optionId: always, option: { id: "always", label: "Always allow", kind: "allowAlways" } });
  if (deny) choices.push({ optionId: deny, option: { id: "deny", label: "Deny", kind: "deny" } });
  if (!allow && !always) return null;
  const tool = object(params.toolCall) ? params.toolCall : {};
  const title = typeof tool.title === "string" && tool.title ? tool.title.slice(0, 512) : GENERIC_SUMMARY[ACTIVITY[str(tool.kind)] ?? "other"];
  return { event: { type: "permission.request", requestId, tool: typeof tool.kind === "string" ? tool.kind : "other", summary: title, options: choices.map(c => c.option) }, choices };
}

export interface AcpTransport extends TransportState { turn: string; segment: number; text: string; tools: Record<string, { kind: string; path: string; title: string }> }
export function initialAcp(turn: string): AcpTransport {
  return { terminal: false, stop: null, messageId: `${turn}:0`, textBlock: null, completedMessages: [], activities: [], fileSummaries: {}, turn, segment: 0, text: "", tools: {} };
}
function flush(state: AcpTransport): TransportResult & { state: AcpTransport } {
  if (!state.text) return { state, events: [] };
  const done: EventPayload = { type: "message.done", messageId: state.messageId, text: state.text };
  const segment = state.segment + 1;
  return { state: { ...state, text: "", segment, messageId: `${state.turn}:${segment}` }, events: [done] };
}
const ACTIVITY: Record<string, "edit" | "read" | "command"> = { edit: "edit", delete: "edit", move: "edit", read: "read", search: "read", execute: "command" };
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function toolPath(update: Record<string, unknown>): string {
  if (Array.isArray(update.locations)) for (const location of update.locations) if (object(location) && str(location.path)) return str(location.path);
  const input = object(update.rawInput) ? update.rawInput : {};
  return str(input.path) || str(input.fileName) || str(input.file_path);
}
// Updates arriving while no prompt is running (session/load replays the stored history) are not events of this turn.
export function normalizeAcp(state: AcpTransport, update: Record<string, unknown>, root: string): TransportResult & { state: AcpTransport } {
  if (state.terminal) return { state, events: [] };
  const kind = update.sessionUpdate;
  if (kind === "agent_message_chunk") {
    const content = object(update.content) ? update.content : {};
    const text = content.type === "text" ? str(content.text) : "";
    if (!text) return { state, events: [] };
    return { state: { ...state, text: state.text + text }, events: [{ type: "message.delta", messageId: state.messageId, text }] };
  }
  if (kind !== "tool_call" && kind !== "tool_call_update") return { state, events: [] };
  const id = str(update.toolCallId);
  if (!id || state.activities.includes(id)) return { state, events: [] };
  const known = state.tools[id] ?? { kind: "", path: "", title: "" };
  const tool = { kind: str(update.kind) || known.kind, path: toolPath(update) || known.path, title: str(update.title) || known.title };
  const flushed = flush(state);
  const next = { ...flushed.state, tools: { ...state.tools, [id]: tool } };
  // One activity per tool call, once it completed: a rejected or failed call changed nothing.
  if (update.status !== "completed") return { state: next, events: flushed.events };
  const activityKind = ACTIVITY[tool.kind] ?? "other";
  const summary = (tool.title || (tool.path && displayPath(tool.path, root)) || GENERIC_SUMMARY[activityKind]).slice(0, 512);
  const event: EventPayload = tool.path
    ? { type: "activity", kind: activityKind, path: tool.path, insideDesign: insideRoot(posix.join(root, ".doan/canvases"), posix.resolve(root, tool.path)), summary }
    : { type: "activity", kind: activityKind, summary };
  return { state: { ...next, activities: [...state.activities, id] }, events: [...flushed.events, event] };
}
function finishAcp(state: AcpTransport, event: EventPayload): TransportResult & { state: AcpTransport } {
  if (state.terminal) return { state, events: [] };
  const flushed = flush(state);
  return { state: { ...flushed.state, terminal: true }, events: [...flushed.events, state.stop ? { type: "interrupted", reason: state.stop } : event] };
}
// stopReason is end_turn | max_tokens | max_turn_requests | refusal | cancelled (ACP prompt-turn).
export function acpPromptDone(state: AcpTransport, result: unknown): TransportResult & { state: AcpTransport } {
  const reason = object(result) ? result.stopReason : undefined;
  if (reason === "cancelled") return finishAcp({ ...state, stop: state.stop ?? "user" }, { type: "interrupted", reason: "user" });
  if (typeof reason !== "string") return finishAcp(state, { type: "turn.failed", code: "unknown", detail: "ACP prompt returned no stopReason" });
  return finishAcp(state, { type: "turn.done" });
}
export function acpPromptFailed(state: AcpTransport, detail: string): TransportResult & { state: AcpTransport } {
  return finishAcp(state, { type: "turn.failed", code: transportError(detail), ...(detail ? { detail: detail.slice(0, 4096) } : {}) });
}
export function acpEnded(state: AcpTransport): TransportResult & { state: AcpTransport } { return finishAcp(state, { type: "turn.failed", code: "process_exited" }); }
