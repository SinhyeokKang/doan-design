import { posix } from "node:path";
import { canvasDir } from "../../formats/canvasPath";
import { object } from "./sessions";
import { claudeModeAfterPlan, type PermissionModeId } from "./permissionMode";
import { connectorLabels, serverLabel } from "../mcpConnectors/presets";
import { codexMcpApproval } from "../mcpConnectors/codexApproval";
import { QUESTION_LIMITS, type Question, type QuestionAnswer, type StoredAnswer } from "./question";
import type { EventPayload, FailureCode, PendingPermission, PermissionChoice, TransportResult, TransportState } from "./types";

export function initialTransport(): TransportState {
  return { terminal: false, stop: null, messageId: "assistant", textBlock: null, completedMessages: [], activities: [], fileSummaries: {} };
}
function unchanged(state: TransportState): TransportResult { return { state, events: [] }; }
function finish(state: TransportState, event: EventPayload): TransportResult {
  if (state.terminal) return unchanged(state);
  const terminal: EventPayload = state.stop ? { type: "interrupted", reason: state.stop } : event;
  return { state: { ...state, terminal: true, fileSummaries: {} }, events: [...contextBefore(state, terminal), terminal] };
}
// The turn's context value goes out in the terminal's own batch, right before it, so it adds no wait at turn end and
// frames after the terminal (Claude's prompt suggestion call) cannot change it. Only a done or failed turn the
// transport ended carries one: a stopped turn's interrupted does not.
export function contextBefore(state: TransportState, terminal: EventPayload): EventPayload[] {
  return state.context && (terminal.type === "turn.done" || terminal.type === "turn.failed") ? [{ type: "context.usage", ...state.context }] : [];
}
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
// A provider's value, or undefined for one that is not a token count and a window of at least one token; such a value
// is dropped and the turn's earlier one stays.
export function contextValue(used: unknown, size: unknown): { used: number; size: number } | undefined {
  return count(used) && count(size) && size >= 1 ? { used, size } : undefined;
}
// A top-level call's context: its input tokens with both cache kinds (BetaUsage; the cache fields may be null), and
// the model whose modelUsage entry gives the window.
function claudeCall(message: Record<string, unknown>): { used: number; model: string } | undefined {
  if (!object(message.usage) || typeof message.model !== "string" || !message.model) return undefined;
  const parts = [message.usage.input_tokens, message.usage.cache_creation_input_tokens ?? 0, message.usage.cache_read_input_tokens ?? 0];
  if (!parts.every(count)) return undefined;
  const used = parts.reduce((sum, part) => sum + part, 0);
  return Number.isSafeInteger(used) ? { used, model: message.model } : undefined;
}
// modelUsage also holds auxiliary models' keys (P1 (a)), so the window is the call's own model's.
function claudeWindow(modelUsage: unknown, model: string): unknown {
  return object(modelUsage) && Object.hasOwn(modelUsage, model) && object(modelUsage[model]) ? modelUsage[model].contextWindow : undefined;
}
function aborted(state: TransportState): TransportResult { return finish(state, { type: "turn.failed", code: "process_exited" }); }
export function endTransport(state: TransportState): TransportResult { return aborted(state); }
// consumed: steered message ids the agent read with this frame, reported before the frame's events. awaitingRead: a
// success result that is not terminal because a steered message is still unread; the runner bounds that wait.
export interface SteerResult extends TransportResult { consumed?: string[]; awaitingRead?: true }
// Registered before the message is written, so a result racing it already knows the turn is not over.
export function steerTransport(state: TransportState, id: string): TransportState {
  return state.terminal ? state : { ...state, steered: [...state.steered ?? [], id] };
}
// The wait after awaitingRead ran out: the turn ends as that success result would have.
export function endSteerWait(state: TransportState): TransportResult { return finish(state, { type: "turn.done" }); }
function consume(state: TransportState, seen: readonly unknown[]): { state: TransportState; consumed: string[] } {
  const consumed = (state.steered ?? []).filter(id => seen.includes(id));
  return consumed.length ? { state: { ...state, steered: state.steered!.filter(id => !consumed.includes(id)) }, consumed } : { state, consumed };
}
function withConsumed(result: TransportResult, consumed: string[]): SteerResult { return consumed.length ? { ...result, consumed } : result; }
export function transportError(detail: string): FailureCode {
  if (/already has an active writer/i.test(detail)) return "session_in_use";
  if (/not logged in|authentication required|unauthorized|invalid api key|authentication failed/i.test(detail)) return "not_logged_in";
  if (/rate.?limit|too many requests/i.test(detail)) return "rate_limited";
  if (/session.*(not found|unavailable)|thread.*not found/i.test(detail)) return "session_unavailable";
  return "unknown";
}
function failed(state: TransportState, detail: string): TransportResult {
  return finish(state, { type: "turn.failed", code: transportError(detail), ...(detail ? { detail: detail.slice(0, 4096) } : {}) });
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
// Fallbacks when an item carries nothing readable: provider item types (commandExecution, fileChange, Bash) are wire
// vocabulary, not words for the strip.
export const GENERIC_SUMMARY = { edit: "Editing files", read: "Reading files", command: "Running a command", other: "Using a tool" } as const;
type ActivityKind = keyof typeof GENERIC_SUMMARY;
export function displayPath(path: string, root: string): string {
  const relative = posix.relative(root, posix.resolve(root, path));
  return relative && !relative.startsWith("..") && !posix.isAbsolute(relative) ? relative : path;
}
// Codex wraps commands in the login shell (`/bin/zsh -c '…'`); a single parsed action is the command as written.
function commandText(input: Record<string, unknown>): string {
  const actions = Array.isArray(input.commandActions) ? input.commandActions.filter(object) : [];
  const [only] = actions;
  return (actions.length === 1 && only && text(only.command)) || text(input.command);
}
function filesSummary(paths: string[], root: string): string {
  const [first] = paths;
  if (!first) return "";
  return (paths.length === 1 ? displayPath(first, root) : `${displayPath(first, root)} and ${paths.length - 1} more`).slice(0, 512);
}
// Only an approval still to come needs its item's paths; an evicted entry falls back to the generic phrase.
const FILE_SUMMARY_LIMIT = 32;
function withoutFileSummary(summaries: Record<string, string>, id: string): Record<string, string> {
  if (!(id in summaries)) return summaries;
  const { [id]: _, ...rest } = summaries;
  return rest;
}
function withFileSummary(summaries: Record<string, string>, id: string, summary: string): Record<string, string> {
  const kept = Object.entries(summaries).slice(-(FILE_SUMMARY_LIMIT - 1));
  return { ...Object.fromEntries(kept), [id]: summary };
}
function activity(kind: ActivityKind, path: string, line: string, root: string): EventPayload {
  // Paths and tool names come from the agent unbounded; the strip shows one line and every event is stored.
  const summary = line.slice(0, 512);
  if (!path) return { type: "activity", kind, summary };
  const resolved = posix.resolve(root, path);
  return { type: "activity", kind, path, insideDesign: canvasDir(posix.relative(root, resolved)) !== null, summary };
}
function claudeKind(tool: string): ActivityKind {
  return /^(Write|Edit|MultiEdit)$/.test(tool) ? "edit" : /^(Read|Glob|Grep)$/.test(tool) ? "read" : tool === "Bash" ? "command" : "other";
}
function claudePath(input: Record<string, unknown>): string { return text(input.file_path) || text(input.path); }
// A Doan connector's tool (`mcp__doan-<slug>__<tool>`) is named with its connector, and its input never reaches the
// summary: it can hold page ids, queries and bodies (mcp-connectors spec 완료 조건 6). labels maps doan- names to
// connector names; the presets are always known.
const DOAN_MCP_TOOL = /^mcp__(doan-[a-z0-9][a-z0-9-]{0,15})__(.+)$/s;
const PRESET_LABELS = connectorLabels([]);
export function claudePermissionSummary(tool: string, input: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>> = PRESET_LABELS): string {
  const mcp = tool.match(DOAN_MCP_TOOL);
  if (mcp) return `Run ${mcp[2]} on ${serverLabel(mcp[1]!, { ...PRESET_LABELS, ...labels })}`.slice(0, 512);
  const path = claudePath(input);
  return (text(input.description) || text(input.command) || (path && displayPath(path, root)) || text(input.pattern) || GENERIC_SUMMARY[claudeKind(tool)]).slice(0, 512);
}
// Activity is stored and published for every call, so a shell command's text, description or arguments never go in it
// (user decision 2026-10-30); only the permission request shows the command being approved.
// A Doan connector's tool input is the connector's (a page id, a query), never a file of the repo, so it gives no path.
function claudeActivity(tool: string, input: Record<string, unknown>, root: string, labels?: Readonly<Record<string, string>>): EventPayload {
  const kind = claudeKind(tool);
  return activity(kind, DOAN_MCP_TOOL.test(tool) ? "" : claudePath(input), kind === "command" ? GENERIC_SUMMARY.command : claudePermissionSummary(tool, input, root, labels), root);
}
function codexActivities(item: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>>): { events: EventPayload[]; files: string } {
  if (item.type === "fileChange") {
    const paths = (Array.isArray(item.changes) ? item.changes.filter(object) : []).map(change => text(change.path));
    const events = paths.length ? paths.map(path => activity("edit", path, path ? displayPath(path, root) : GENERIC_SUMMARY.edit, root)) : [activity("edit", "", GENERIC_SUMMARY.edit, root)];
    return { events, files: filesSummary(paths.filter(Boolean), root) };
  }
  if (item.type === "commandExecution") return { events: [activity("command", "", GENERIC_SUMMARY.command, root)], files: "" };
  const tool = text(item.tool), server = text(item.server);
  return { events: [activity("other", "", tool ? (server ? `${tool} (${serverLabel(server, labels)})` : tool) : GENERIC_SUMMARY.other, root)], files: "" };
}
// The mode a Claude status message reports ({type: "system", subtype: "status", permissionMode}, SDK 0.3.312), as a
// common id; undefined for any other message. After a plan approval it names the mode the session now runs (P1).
export function claudeReportedMode(raw: unknown): PermissionModeId | undefined {
  if (!object(raw) || raw.type !== "system" || raw.subtype !== "status" || typeof raw.permissionMode !== "string") return undefined;
  return claudeModeAfterPlan(raw.permissionMode);
}
// labels: the connector names of the run (connectorLabels), so a Doan connector's tool never shows its doan- name.
export function normalizeClaude(state: TransportState, raw: unknown, root: string, labels?: Readonly<Record<string, string>>): SteerResult {
  if (state.terminal || !object(raw) || raw.parent_tool_use_id) return unchanged(state);
  // A steered message is read when its uuid first appears in a frame's user_message_uuids: the system/status after a
  // tool result when it folds into the running turn, or the system/init of the turn the CLI runs for it (PoC, Claude Code 2.1.317 and 2.1.312).
  const read = consume(state, Array.isArray(raw.user_message_uuids) ? raw.user_message_uuids : []);
  return withConsumed(claudeFrame(read.state, raw, root, labels), read.consumed);
}
function claudeFrame(state: TransportState, raw: Record<string, unknown>, root: string, labels?: Readonly<Record<string, string>>): SteerResult {
  if (raw.type === "stream_event" && object(raw.event)) {
    const event = raw.event;
    if (event.type === "message_start" && object(event.message) && typeof event.message.id === "string") return { state: { ...state, messageId: event.message.id, textBlock: null }, events: [] };
    if (event.type === "content_block_start" && object(event.content_block) && event.content_block.type === "text" && typeof event.index === "number") {
      return { state: { ...state, textBlock: event.index }, events: [] };
    }
    if (event.type === "content_block_delta" && object(event.delta) && event.delta.type === "text_delta" && typeof event.delta.text === "string") {
      return { state, events: [{ type: "message.delta", messageId: `${state.messageId}:${event.index}`, text: event.delta.text }] };
    }
  }
  if (raw.type === "assistant" && object(raw.message) && Array.isArray(raw.message.content)) {
    const events: EventPayload[] = [];
    const baseId = text(raw.message.id) || state.messageId;
    const messageId = baseId === state.messageId && state.textBlock !== null ? `${baseId}:${state.textBlock}` : baseId;
    const completedMessages = [...state.completedMessages];
    const activities = [...state.activities];
    const call = claudeCall(raw.message);
    const body = raw.message.content.filter(object).filter(c => c.type === "text").map(c => text(c.text)).join("");
    if (body && !completedMessages.includes(messageId)) {
      events.push({ type: "message.done", messageId, text: body }); completedMessages.push(messageId);
    }
    for (const content of raw.message.content) {
      // The question card stands for an AskUserQuestion call, so it shows no "Using a tool" line.
      if (object(content) && content.type === "tool_use" && content.name === CLAUDE_QUESTION_TOOL) continue;
      if (object(content) && content.type === "tool_use" && typeof content.id === "string" && !activities.includes(content.id)) {
        events.push(claudeActivity(text(content.name), object(content.input) ? content.input : {}, root, labels)); activities.push(content.id);
      }
    }
    return { state: { ...state, completedMessages, activities, ...(call ? { claudeCall: call } : {}) }, events };
  }
  if (raw.type === "result") {
    // Read on every result, so a steer wait that ends without the follow-up's result (endSteerWait) still has it.
    const value = state.claudeCall && contextValue(state.claudeCall.used, claudeWindow(raw.modelUsage, state.claudeCall.model));
    if (value) state = { ...state, context: value };
    if (raw.terminal_reason === "aborted_tools" || raw.terminal_reason === "interrupted") return aborted(state);
    // queued_turn_count stays 0 while a steered message is unread (same PoC), so only the uuids tell that the CLI goes on
    // to another turn for it; that turn's result ends this one. A stop still ends here.
    if (raw.subtype === "success" && raw.is_error === false) return state.steered?.length && !state.stop ? { ...unchanged(state), awaitingRead: true } : finish(state, { type: "turn.done" });
    const detail = Array.isArray(raw.errors) ? raw.errors.filter((e): e is string => typeof e === "string").join("\n") : text(raw.result);
    return failed(state, detail);
  }
  return unchanged(state);
}
export const CLAUDE_QUESTION_TOOL = "AskUserQuestion";
// A Claude question as the card shows it, and each ordinal id's question text: Claude keys its answers by that text.
export interface ClaudeQuestion { questions: Question[]; textById: Record<string, string> }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
// AskUserQuestion's input (sdk-tools.d.ts AskUserQuestionInput, P1); null for anything a card cannot show whole. A
// question past a limit is refused, never cut, and so is a repeated question text, which would key two answers alike.
export function claudeQuestion(input: unknown): ClaudeQuestion | null {
  const L = QUESTION_LIMITS;
  if (!object(input) || !Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > L.questions) return null;
  const questions: Question[] = [], textById: Record<string, string> = {};
  for (const [index, raw] of input.questions.entries()) {
    if (!object(raw) || !bounded(raw.question, L.text) || !raw.question || !bounded(raw.header, L.label) || (raw.multiSelect !== undefined && typeof raw.multiSelect !== "boolean")) return null;
    if (!Array.isArray(raw.options) || raw.options.length > L.options) return null;
    const options: Question["options"] = [];
    for (const option of raw.options) {
      if (!object(option) || !bounded(option.label, L.label) || !option.label || (option.description !== undefined && !bounded(option.description, L.label))) return null;
      options.push({ label: option.label, ...(option.description ? { description: option.description } : {}) });
    }
    if (Object.values(textById).includes(raw.question)) return null;
    const id = String(index);
    questions.push({ id, header: raw.header, question: raw.question, options, multiSelect: raw.multiSelect === true, other: true });
    textById[id] = raw.question;
  }
  return { questions, textById };
}
// The PermissionResult for a checked answer. Several choices and Other text go as one comma-joined string, as the CLI's
// own card answers (P1). A skip sends no answer text, which the model would read as an answer, and marks each question
// unanswered only for a session that advertises it (system/init capabilities); an older CLI refuses the mark, so a
// skip there is a denial (P1 Skip b).
export type ClaudeQuestionResult = { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string };
export function claudeQuestionResult(input: Record<string, unknown>, read: ClaudeQuestion, answer: QuestionAnswer, unanswered: boolean): ClaudeQuestionResult {
  if (answer.outcome === "skipped") {
    if (!unanswered) return { behavior: "deny", message: "The person skipped the question." };
    return { behavior: "allow", updatedInput: { ...input, answers: {}, annotations: Object.fromEntries(Object.values(read.textById).map(text => [text, { unanswered: "skipped" }])) } };
  }
  const answers: Record<string, string> = {};
  for (const question of read.questions) {
    const given = answer.answers[question.id]!;
    answers[read.textById[question.id]!] = [...given.selected.map(n => question.options[n]!.label), ...(given.other ? [given.other] : [])].join(", ");
  }
  return { behavior: "allow", updatedInput: { ...input, answers } };
}
const CLAUDE_UNANSWERED = "ask_user_question_unanswered_v1";
// Whether a system/init frame advertises the unanswered mark; undefined for any other frame.
export function claudeUnansweredSupport(raw: unknown): boolean | undefined {
  if (!object(raw) || raw.type !== "system" || raw.subtype !== "init") return undefined;
  return Array.isArray(raw.capabilities) && raw.capabilities.includes(CLAUDE_UNANSWERED);
}
// A checked answer as the history keeps it: chosen labels apart from the typed text. A secret question's answer is passed
// on to the provider only, never kept.
export function storedAnswers(questions: readonly Question[], answer: Extract<QuestionAnswer, { outcome: "answered" }>): Record<string, StoredAnswer> {
  const stored: Record<string, StoredAnswer> = {};
  for (const question of questions) {
    const given = answer.answers[question.id];
    if (!given || question.secret) continue;
    stored[question.id] = { selected: given.selected.map(n => question.options[n]!.label), ...(given.other ? { other: given.other } : {}) };
  }
  return stored;
}
// labels: the connector names of the run (connectorLabels); the presets when absent.
export interface CodexContext { root: string; sessionId: string; turnId: string; labels?: Readonly<Record<string, string>> }
// decline: answered with response at once, and the turn goes on: an MCP elicitation doan does not ask about (a form, or a
// tool approval with no turn to ask in), and every requestUserInput of this thread (P2: Codex 0.166.0 sends none in a
// Doan mode, so no card exists for it). unsupported and route are answered with an error.
export interface CodexTransportResult extends SteerResult {
  request?: { id: string | number; method: string; disposition: "permission" | "unsupported" | "route" } | { id: string | number; method: string; disposition: "decline"; response: unknown };
}
const MCP_ELICITATION = "mcpServer/elicitation/request";
const USER_INPUT = "item/tool/requestUserInput";
export interface CodexReplyOwner { requestId: string | number; sessionId: string; turnId: string }
// The dispatcher supplies ownership from its pending RPC table, never from the active turn.
export function normalizeCodexReply(state: TransportState, raw: unknown, context: CodexContext, owner: CodexReplyOwner): TransportResult {
  if (!object(raw) || "method" in raw || raw.id !== owner.requestId || owner.sessionId !== context.sessionId || owner.turnId !== context.turnId) return unchanged(state);
  if (object(raw.error) && !("result" in raw)) return failed(state, text(raw.error.message));
  return unchanged(state);
}
export function normalizeCodex(state: TransportState, raw: unknown, context: CodexContext): CodexTransportResult {
  if (!object(raw) || typeof raw.method !== "string") return unchanged(state);
  if (typeof raw.id === "string" || typeof raw.id === "number") {
    const params = object(raw.params) ? raw.params : {};
    const turnId = object(params.turn) ? params.turn.id : params.turnId;
    const otherOwner = (typeof params.threadId === "string" && params.threadId !== context.sessionId)
      || (typeof turnId === "string" && turnId !== context.turnId);
    const matched = params.threadId === context.sessionId && turnId === context.turnId;
    // A stopped turn asks nothing more: the person already left it, and the service drops its later events, so an MCP
    // approval held now could never be answered.
    const asking = matched && !state.terminal && !(state.stop && raw.method === MCP_ELICITATION);
    const permission = asking ? codexPermission(raw, state.fileSummaries, context.labels) : null;
    // An elicitation this turn cannot ask about (a form, or one with no running turn to ask in) is declined, never failed: the
    // tool call fails and the turn goes on (mcp-connectors spec 완료 조건 6).
    // No answers is a normal reply Codex reads as "no answer received" and goes on from (P2), whatever the question.
    if (!otherOwner && raw.method === USER_INPUT) return { ...unchanged(state), request: { id: raw.id, method: raw.method, disposition: "decline", response: { id: raw.id, result: { answers: {} } } } };
    if (!otherOwner && !permission && raw.method === MCP_ELICITATION) return { ...unchanged(state), request: { id: raw.id, method: raw.method, disposition: "decline", response: { id: raw.id, result: { action: "decline" } } } };
    const disposition = otherOwner ? "route" : permission ? "permission" : "unsupported";
    const answered = permission ? { ...state, fileSummaries: withoutFileSummary(state.fileSummaries, text(params.itemId)) } : state;
    const result = permission ? { state: answered, events: [permission.event] }
      : matched && !otherOwner ? finish(state, { type: "turn.failed", code: "session_unavailable" }) : unchanged(state);
    return { ...result, request: { id: raw.id, method: raw.method, disposition } };
  }
  if (state.terminal || "id" in raw) return unchanged(state);
  if (!object(raw.params)) return unchanged(state);
  const params = raw.params;
  if (params.threadId !== context.sessionId) return unchanged(state);
  const turnId = object(params.turn) ? params.turn.id : params.turnId;
  if (turnId !== context.turnId) return unchanged(state);
  // last is the turn's latest model call; its inputTokens already include the cached ones (P2 (b)), while totalTokens
  // adds output. A resumed thread replays the previous turn's notification first (P2 (d)); the turn check drops it.
  if (raw.method === "thread/tokenUsage/updated") {
    const usage = object(params.tokenUsage) ? params.tokenUsage : {};
    const value = contextValue(object(usage.last) ? usage.last.inputTokens : undefined, usage.modelContextWindow);
    return value ? { state: { ...state, context: value }, events: [] } : unchanged(state);
  }
  if (raw.method === "item/agentMessage/delta" && typeof params.delta === "string" && typeof params.itemId === "string") {
    return { state, events: [{ type: "message.delta", messageId: params.itemId, text: params.delta }] };
  }
  if ((raw.method === "item/completed" || raw.method === "item/started") && object(params.item)) {
    const item = params.item;
    // A turn/steer is read on acceptance; its userMessage item echoes clientUserMessageId as clientId
    // (PoC, Codex 0.166.0 and 0.164.0).
    if (item.type === "userMessage") {
      const read = consume(state, typeof item.clientId === "string" ? [item.clientId] : []);
      return withConsumed(unchanged(read.state), read.consumed);
    }
    const id = text(item.id);
    if (raw.method === "item/completed" && id in state.fileSummaries) state = { ...state, fileSummaries: withoutFileSummary(state.fileSummaries, id) };
    if (raw.method === "item/completed" && item.type === "agentMessage" && id && !state.completedMessages.includes(id)) {
      return { state: { ...state, completedMessages: [...state.completedMessages, id] }, events: [{ type: "message.done", messageId: id, text: text(item.text) }] };
    }
    if (id && !state.activities.includes(id) && (item.type === "fileChange" || item.type === "commandExecution" || item.type === "mcpToolCall")) {
      const { events, files } = codexActivities(item, context.root, context.labels ?? PRESET_LABELS);
      // A file approval names only its itemId, so the paths seen when the item started are kept for it.
      const fileSummaries = files && raw.method === "item/started" ? withFileSummary(state.fileSummaries, id, files) : state.fileSummaries;
      return { state: { ...state, activities: [...state.activities, id], fileSummaries }, events };
    }
  }
  if (raw.method === "turn/completed" && object(params.turn)) {
    if (params.turn.status === "interrupted") return aborted(state);
    if (params.turn.status === "completed") return finish(state, { type: "turn.done" });
    return failed(state, object(params.turn.error) ? text(params.turn.error.message) : "");
  }
  if (raw.method === "error" && params.willRetry !== true) return failed(state, object(params.error) ? text(params.error.message) : "");
  return unchanged(state);
}
function choice(id: string, label: string, kind: "allow" | "allowAlways" | "deny", response: unknown): PermissionChoice {
  return { option: { id, label, kind }, response };
}
export function claudePermission(requestId: string, tool: string, input: Record<string, unknown>, suggestions: readonly unknown[], root: string, labels?: Readonly<Record<string, string>>): PendingPermission {
  const choices = [
    choice("allow", "Allow", "allow", { behavior: "allow", updatedInput: input }),
    choice("deny", "Deny", "deny", { behavior: "deny", message: "Denied by the user." }),
  ];
  if (suggestions.length) choices.push(choice("always", "Allow with suggested permissions", "allowAlways", { behavior: "allow", updatedInput: input, updatedPermissions: [...suggestions] }));
  return { event: { type: "permission.request", requestId, tool, summary: claudePermissionSummary(tool, input, root, labels), options: choices.map(c => c.option) }, choices };
}
export function codexPermission(raw: unknown, fileSummaries: Readonly<Record<string, string>> = {}, labels: Readonly<Record<string, string>> = PRESET_LABELS): PendingPermission | null {
  if (!object(raw) || (typeof raw.id !== "number" && typeof raw.id !== "string") || !object(raw.params)) return null;
  const params = raw.params;
  if (raw.method === MCP_ELICITATION) { const approval = codexMcpApproval(raw, labels); return approval?.kind === "permission" ? approval.permission : null; }
  if (raw.method === "item/permissions/requestApproval" && object(params.permissions)) {
    const response = (permissions: unknown, scope: "turn" | "session") => ({ id: raw.id, result: { permissions, scope } });
    const choices = [
      choice("allow", "Allow for this turn", "allow", response(params.permissions, "turn")),
      choice("deny", "Deny", "deny", response({}, "turn")),
      choice("always", "Allow for this session", "allowAlways", response(params.permissions, "session")),
    ];
    return { event: { type: "permission.request", requestId: `${typeof raw.id}:${raw.id}`, tool: "permissions", summary: text(params.reason) || JSON.stringify(params.permissions), options: choices.map(c => c.option) }, choices };
  }
  if (raw.method !== "item/fileChange/requestApproval" && raw.method !== "item/commandExecution/requestApproval") return null;
  const response = (decision: unknown) => ({ id: raw.id, result: { decision } });
  const choices = [
    choice("accept", "Allow", "allow", response("accept")),
    choice("decline", "Deny", "deny", response("decline")),
    choice("acceptForSession", "Allow for this session", "allowAlways", response("acceptForSession")),
  ];
  if (raw.method === "item/commandExecution/requestApproval") {
    if (Array.isArray(params.proposedExecpolicyAmendment) && params.proposedExecpolicyAmendment.length && params.proposedExecpolicyAmendment.every(p => typeof p === "string")) {
      choices.push(choice("execpolicy", "Allow with proposed command rule", "allowAlways", response({ acceptWithExecpolicyAmendment: { execpolicy_amendment: params.proposedExecpolicyAmendment } })));
    }
    if (Array.isArray(params.proposedNetworkPolicyAmendments)) for (const [index, amendment] of params.proposedNetworkPolicyAmendments.entries()) {
      if (object(amendment) && typeof amendment.host === "string" && (amendment.action === "allow" || amendment.action === "deny")) {
        choices.push(choice(`network-${index}`, `${amendment.action === "allow" ? "Allow" : "Deny"} ${amendment.host}`, amendment.action === "allow" ? "allowAlways" : "deny", response({ applyNetworkPolicyAmendment: { network_policy_amendment: amendment } })));
      }
    }
  }
  const files = raw.method === "item/fileChange/requestApproval";
  const summary = text(params.reason) || (files ? fileSummaries[text(params.itemId)] || GENERIC_SUMMARY.edit : commandText(params) || GENERIC_SUMMARY.command);
  return { event: { type: "permission.request", requestId: `${typeof raw.id}:${raw.id}`, tool: files ? "fileChange" : "commandExecution", summary: summary.slice(0, 512), options: choices.map(c => c.option) }, choices };
}
export function permissionAnswer(request: PendingPermission, optionId: string): { response: unknown; event: EventPayload } | null {
  const chosen = request.choices.find(c => c.option.id === optionId);
  return chosen ? { response: chosen.response, event: { type: "permission.resolved", requestId: request.event.requestId, optionId } } : null;
}
