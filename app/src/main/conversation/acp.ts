import { posix } from "node:path";
import { canvasDir } from "../../formats/canvasPath";
import { object } from "./sessions";
import { QUESTION_LIMITS } from "./question";
import { countTextChange } from "./editLines";
import { callIdOf, contextBefore, contextValue, displayPath, editResult, GENERAL_STAGE, GENERIC_SUMMARY, PERMISSION_SUMMARY_MAX, permissionReason, storableText, transportError } from "./transport";
import { clip, quoted } from "./cardText";
import type { EventPayload, FailureCode, PermissionOption, TransportResult, TransportState, TurnStage } from "./types";

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
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- line() can close the connection from inside the loop
    while (!this.closed && (end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end + 1);
      if (line) this.line(line);
    }
  }
  // The leader has exited. Its bounded output drain now decides which requests received no reply.
  clearDeadlines(): void { for (const entry of this.pending.values()) clearTimeout(entry.timer); }
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
export function acpPermission(params: Record<string, unknown>, requestId: string, root: string): { event: Extract<EventPayload, { type: "permission.request" }>; choices: AcpChoice[] } | null {
  if (!Array.isArray(params.options)) return null;
  const options = params.options.filter(object).filter(o => typeof o.optionId === "string" && o.optionId.length <= 512 && typeof o.kind === "string");
  const pick = (...kinds: string[]) => { for (const kind of kinds) { const found = options.find(o => o.kind === kind); if (found) return String(found.optionId); } return null; };
  const allow = pick("allow_once"), always = pick("allow_always"), deny = pick("reject_once", "reject_always");
  const choices: AcpChoice[] = [];
  if (allow) choices.push({ optionId: allow, option: { id: "allow", label: "Allow", kind: "allow" } });
  // The agent keeps this choice itself, and the protocol does not say what it covers, so the card says only that.
  if (always) {
    const name = str(options.find(o => o.optionId === always)?.name).trim();
    const detail = name ? `The agent saves this choice as ${quoted(name)} and decides what it covers.` : "The agent saves this choice and decides what it covers.";
    choices.push({ optionId: always, option: { id: "always", label: "Always allow", kind: "allowAlways", detail: clip(detail, PERMISSION_SUMMARY_MAX) } });
  }
  if (deny) choices.push({ optionId: deny, option: { id: "deny", label: "Deny", kind: "deny" } });
  if (!allow && !always) return null;
  const tool = object(params.toolCall) ? params.toolCall : {};
  const title = str(tool.title);
  const summary = clip(acpOperation(tool, root) || title || GENERIC_SUMMARY[ACTIVITY[str(tool.kind)] ?? "other"], PERMISSION_SUMMARY_MAX);
  return { event: { type: "permission.request", requestId, tool: typeof tool.kind === "string" ? tool.kind : "other", summary, ...permissionReason(title, summary), options: choices.map(c => c.option) }, choices };
}
// What an ACP request lets run, when its tool call names it: the command (Copilot's title is a fixed phrase and the
// command is only in rawInput), else every path it touches. Cursor's requests carry neither; their title is the command.
function acpOperation(tool: Record<string, unknown>, root: string): string {
  const input = object(tool.rawInput) ? tool.rawInput : {};
  const commands = Array.isArray(input.commands) ? input.commands.filter(c => typeof c === "string" && c) : [];
  const command = str(input.command) || commands.join("\n");
  if (command) return command;
  const located = Array.isArray(tool.locations) ? tool.locations.filter(object).map(l => str(l.path)) : [];
  const paths = [...new Set([...located, str(input.fileName) || str(input.path) || str(input.file_path)].filter(Boolean))];
  return paths.map(path => displayPath(path, root)).join(", ");
}

// Antigravity asks through a permission request whose options are the answers (two or more, all allow_once, no reject).
// Anything else, or past the limits, stays a permission request: a cut question or a merged answer could not be answered.
export function acpQuestion(params: Record<string, unknown>, requestId: string): { event: Extract<EventPayload, { type: "question.request" }>; optionIds: string[] } | null {
  const L = QUESTION_LIMITS;
  const tool = object(params.toolCall) ? params.toolCall : {};
  const question = tool.title;
  if (typeof question !== "string" || !question || question.length > L.text) return null;
  if (!Array.isArray(params.options) || params.options.length < 2 || params.options.length > L.options) return null;
  const options = params.options.filter(object);
  if (options.length !== params.options.length) return null;
  if (!options.every(o => o.kind === "allow_once" && typeof o.optionId === "string" && o.optionId.length <= 512 && typeof o.name === "string" && o.name && o.name.length <= L.label)) return null;
  const labels = options.map(o => o.name as string);
  if (new Set(labels).size !== labels.length) return null;
  return {
    event: { type: "question.request", requestId, questions: [{ id: "0", header: "", question, options: labels.map(label => ({ label })), multiSelect: false, other: false }] },
    optionIds: options.map(o => o.optionId as string),
  };
}

// thinking: thought chunks came and nothing ended thinking since. running holds the pending or in-progress tool calls.
// countsEdits: only Copilot's completed diff is the applied change (ARCHITECTURE §7 'Edit line counts').
export interface AcpTransport extends TransportState { turn: string; segment: number; text: string; tools: Record<string, AcpTool>; thinking?: true; countsEdits?: true }
// diffs: the last diff content of a running call; it may come before a completion that carries none.
interface AcpTool { kind: string; path: string; title: string; diffs?: AcpDiff[] }
interface AcpDiff { path: string; oldText: string; newText: string }
export function initialAcp(turn: string, countsEdits = false): AcpTransport {
  return { terminal: false, stop: null, messageId: `${turn}:0`, textBlock: null, completedMessages: [], activities: [], fileSummaries: {}, turn, segment: 0, text: "", tools: {}, ...(countsEdits ? { countsEdits: true } : {}) };
}
// undefined when the content holds no diff, so the last diff received stays.
function acpDiffs(content: unknown): AcpDiff[] | undefined {
  if (!Array.isArray(content) || !content.some(item => object(item) && item.type === "diff")) return undefined;
  const diffs: AcpDiff[] = [];
  for (const item of content) if (object(item) && item.type === "diff" && typeof item.newText === "string") diffs.push({ path: str(item.path), oldText: str(item.oldText), newText: item.newText });
  return diffs;
}
function flush(state: AcpTransport): TransportResult & { state: AcpTransport } {
  if (!state.text) return { state, events: [] };
  const done: EventPayload = { type: "message.done", messageId: state.messageId, text: state.text };
  const segment = state.segment + 1;
  return { state: { ...state, text: "", segment, messageId: `${state.turn}:${segment}` }, events: [done] };
}
type AcpActivityKind = keyof typeof GENERIC_SUMMARY;
const ACTIVITY: Record<string, "edit" | "read" | "command"> = { edit: "edit", delete: "edit", move: "edit", read: "read", search: "read", execute: "command", terminal: "command" };
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
// A path with U+0000 goes, and summaries escape it (storableText): the store refuses the character, and one refused
// event fails the turn's whole write.
const storable = (path: string) => path.includes("\0") ? "" : path;
function toolPath(update: Record<string, unknown>): string {
  if (Array.isArray(update.locations)) for (const location of update.locations) if (object(location) && str(location.path)) return storable(str(location.path));
  const input = object(update.rawInput) ? update.rawInput : {};
  return storable(str(input.path) || str(input.fileName) || str(input.file_path));
}
// One rule for a tool call's words, whether it still runs (its stage) or completed (its activity). A shell command's
// title is the command itself; activity is stored and published, so it gets the generic phrase.
function acpToolSummary(kind: AcpActivityKind, tool: AcpTool, root: string): string {
  return kind === "command" ? GENERIC_SUMMARY.command : storableText(tool.title || (tool.path && displayPath(tool.path, root)) || GENERIC_SUMMARY[kind]).slice(0, 512);
}
function acpToolStage(kind: AcpActivityKind, tool: AcpTool, root: string): TurnStage {
  return { kind: "tool", activity: kind, ...(tool.path ? { path: tool.path.slice(0, 512) } : {}), summary: acpToolSummary(kind, tool, root) };
}
// The stage once a tool call ends: the latest-started call still running, else general.
function endedStage(running: readonly string[], tools: Record<string, AcpTool>, root: string): TurnStage {
  const latest = running.at(-1), tool = latest ? tools[latest] : undefined;
  return tool ? acpToolStage(ACTIVITY[tool.kind] ?? "other", tool, root) : GENERAL_STAGE;
}
// The thinking stage ends here; a stage the caller reports in its place goes out instead of the general one.
function awake(state: AcpTransport): { state: AcpTransport; stage?: TurnStage } {
  if (!state.thinking) return { state };
  const { thinking: _, ...rest } = state;
  return { state: rest, stage: GENERAL_STAGE };
}
// Updates while no prompt runs (session/load replays history) are not this turn's events. Thinking ends on a message
// chunk, a tool call or a tool update with a status; usage, plan, command-list and status-less updates come within it.
export function normalizeAcp(state: AcpTransport, update: Record<string, unknown>, root: string): TransportResult & { state: AcpTransport } {
  if (state.terminal) return { state, events: [] };
  const kind = update.sessionUpdate;
  if (kind === "agent_thought_chunk") return { state: state.thinking ? state : { ...state, thinking: true }, events: [], stage: { kind: "thinking" } };
  if (kind === "agent_message_chunk") {
    const woke = awake(state);
    const content = object(update.content) ? update.content : {};
    const text = content.type === "text" ? str(content.text) : "";
    if (!text) return { state: woke.state, events: [], ...(woke.stage ? { stage: woke.stage } : {}) };
    return { state: { ...woke.state, text: woke.state.text + text }, events: [{ type: "message.delta", messageId: woke.state.messageId, text }], ...(woke.stage ? { stage: woke.stage } : {}) };
  }
  // used is what the provider reports; ACP does not define it (Antigravity sends the last model call's size).
  if (kind === "usage_update") {
    const value = contextValue(update.used, update.size);
    return { state: value ? { ...state, context: value } : state, events: [] };
  }
  if (kind !== "tool_call" && kind !== "tool_call_update") return { state, events: [] };
  // ACP's tool_call status defaults to pending; a tool_call_update without one only adds content or details.
  const status = kind === "tool_call" ? str(update.status) || "pending" : str(update.status);
  const woke = status ? awake(state) : { state };
  const id = str(update.toolCallId);
  if (!id) return { state: woke.state, events: [], ...(woke.stage ? { stage: woke.stage } : {}) };
  // A call already in activities gets no second activity, but whether it runs is kept apart from that: the runner puts
  // an Antigravity question's call there while it still runs, and its completion must end it all the same.
  if (woke.state.activities.includes(id)) {
    const before = woke.state.running ?? [];
    if (!status || status === "pending" || status === "in_progress" || !before.includes(id)) return { state: woke.state, events: [], ...(woke.stage ? { stage: woke.stage } : {}) };
    const running = before.filter(other => other !== id);
    const { running: _, ...rest } = woke.state;
    return { state: { ...rest, ...(running.length ? { running } : {}) }, events: [], stage: endedStage(running, woke.state.tools, root) };
  }
  const known = woke.state.tools[id] ?? { kind: "", path: "", title: "" };
  const runs = status === "pending" || status === "in_progress";
  const diffs = woke.state.countsEdits ? acpDiffs(update.content) ?? known.diffs : undefined;
  const tool: AcpTool = { kind: str(update.kind) || known.kind, path: toolPath(update) || known.path, title: str(update.title) || known.title };
  const flushed = flush(woke.state);
  const tools = { ...woke.state.tools, [id]: diffs && (runs || !status) ? { ...tool, diffs } : tool };
  const before = woke.state.running ?? [];
  const running = !status ? before : runs ? (before.includes(id) ? before : [...before, id]) : before.filter(other => other !== id);
  const { running: _, ...rest } = flushed.state;
  const next: AcpTransport = { ...rest, tools, ...(running.length ? { running } : {}) };
  const activityKind = ACTIVITY[tool.kind] ?? "other";
  // A running tool is the stage; any other status (completed, failed) ends it. Copilot runs tool calls in parallel, so
  // a call that ends while others still run hands the stage to the latest of them that started.
  const ended = endedStage(running, tools, root);
  const stage = !status ? undefined : runs ? acpToolStage(activityKind, tool, root) : ended;
  // One activity per tool call, once it completed: a rejected or failed call changed nothing.
  if (status !== "completed") return { state: next, events: flushed.events, ...(stage ? { stage } : {}) };
  const summary = acpToolSummary(activityKind, tool, root);
  const callId = activityKind === "edit" ? callIdOf(id) : undefined;
  const call = callId ? { callId } : {};
  const event: EventPayload = tool.path
    ? { type: "activity", kind: activityKind, path: tool.path, insideDesign: canvasDir(posix.relative(root, posix.resolve(root, tool.path))) !== null, summary, ...call }
    : { type: "activity", kind: activityKind, summary, ...call };
  // A multi-file call is one step named by one path, so only that path's diff items count (all when it has none).
  const counted = (diffs ?? []).filter(diff => !tool.path || diff.path === tool.path);
  const results = callId ? counted.flatMap(diff => editResult(callId, tool.path, countTextChange(diff.oldText, diff.newText))) : [];
  return { state: { ...next, activities: [...woke.state.activities, id] }, events: [...flushed.events, event, ...results], stage: ended };
}
function finishAcp(state: AcpTransport, event: EventPayload): TransportResult & { state: AcpTransport } {
  if (state.terminal) return { state, events: [] };
  const flushed = flush(state);
  const terminal: EventPayload = state.stop ? { type: "interrupted", reason: state.stop } : event;
  const { running: _, ...rest } = flushed.state;
  return { state: { ...rest, terminal: true }, events: [...flushed.events, ...contextBefore(state, terminal), terminal] };
}
// stopReason is end_turn | max_tokens | max_turn_requests | refusal | cancelled (ACP prompt-turn).
export function acpPromptDone(state: AcpTransport, result: unknown): TransportResult & { state: AcpTransport } {
  const reason = object(result) ? result.stopReason : undefined;
  if (reason === "cancelled") return finishAcp({ ...state, stop: state.stop ?? "user" }, { type: "interrupted", reason: "user" });
  if (typeof reason !== "string") return finishAcp(state, { type: "turn.failed", code: "unknown", detail: "ACP prompt returned no stopReason" });
  return finishAcp(state, { type: "turn.done" });
}
// One reading of a failure's text whether the session was opening or a prompt ran, for the words a recorded provider
// message or Doan itself backs. The rest of transportError's patterns have no recorded ACP answer, so opening keeps
// its earlier reading of them: a Cursor rate_limited refusal comes only from its usage read (limitReached).
export function acpFailureCode(detail: string, phase: "open" | "prompt"): FailureCode {
  // AcpConnection's own deadline for a request: "<method> timed out".
  if (/^(?:initialize|authenticate|session\/[\w-]+) timed out$/.test(detail)) return "process_exited";
  // Cursor's and Antigravity's "Authentication required", Copilot CLI's "Please sign in".
  if (/authentication required|not logged in|unauthorized|sign in/i.test(detail)) return "not_logged_in";
  // cursor-agent's session/load for a session it never saved: "Session not found".
  if (/session.*(not found|unavailable)/i.test(detail)) return "session_unavailable";
  if (phase === "prompt") return transportError(detail);
  return /timed out/i.test(detail) ? "process_exited" : "session_unavailable";
}
export function acpPromptFailed(state: AcpTransport, detail: string): TransportResult & { state: AcpTransport } {
  return finishAcp(state, { type: "turn.failed", code: acpFailureCode(detail, "prompt"), ...(detail ? { detail: detail.slice(0, 4096) } : {}) });
}
export function acpEnded(state: AcpTransport): TransportResult & { state: AcpTransport } { return finishAcp(state, { type: "turn.failed", code: "process_exited" }); }
