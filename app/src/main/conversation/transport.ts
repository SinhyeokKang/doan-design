import { posix } from "node:path";
import { insideRoot, object } from "./sessions";
import type { EventPayload, FailureCode, PendingPermission, PermissionChoice, TransportResult, TransportState } from "./types";

export function initialTransport(): TransportState {
  return { terminal: false, stop: null, messageId: "assistant", textBlock: null, completedMessages: [], activities: [], fileSummaries: {} };
}
function unchanged(state: TransportState): TransportResult { return { state, events: [] }; }
function finish(state: TransportState, event: EventPayload): TransportResult {
  if (state.terminal) return unchanged(state);
  return { state: { ...state, terminal: true, fileSummaries: {} }, events: [state.stop ? { type: "interrupted", reason: state.stop } : event] };
}
function aborted(state: TransportState): TransportResult { return finish(state, { type: "turn.failed", code: "process_exited" }); }
export function endTransport(state: TransportState): TransportResult { return aborted(state); }
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
  return { type: "activity", kind, path, insideDesign: insideRoot(posix.join(root, ".doan/canvases"), resolved), summary };
}
function claudeKind(tool: string): ActivityKind {
  return /^(Write|Edit|MultiEdit)$/.test(tool) ? "edit" : /^(Read|Glob|Grep)$/.test(tool) ? "read" : tool === "Bash" ? "command" : "other";
}
function claudePath(input: Record<string, unknown>): string { return text(input.file_path) || text(input.path); }
export function claudePermissionSummary(tool: string, input: Record<string, unknown>, root: string): string {
  const path = claudePath(input);
  return (text(input.description) || text(input.command) || (path && displayPath(path, root)) || text(input.pattern) || GENERIC_SUMMARY[claudeKind(tool)]).slice(0, 512);
}
// Activity is stored and published for every call, so a shell command's text, description or arguments never go in it
// (user decision 2026-10-30); only the permission request shows the command being approved.
function claudeActivity(tool: string, input: Record<string, unknown>, root: string): EventPayload {
  const kind = claudeKind(tool);
  return activity(kind, claudePath(input), kind === "command" ? GENERIC_SUMMARY.command : claudePermissionSummary(tool, input, root), root);
}
function codexActivities(item: Record<string, unknown>, root: string): { events: EventPayload[]; files: string } {
  if (item.type === "fileChange") {
    const paths = (Array.isArray(item.changes) ? item.changes.filter(object) : []).map(change => text(change.path));
    const events = paths.length ? paths.map(path => activity("edit", path, path ? displayPath(path, root) : GENERIC_SUMMARY.edit, root)) : [activity("edit", "", GENERIC_SUMMARY.edit, root)];
    return { events, files: filesSummary(paths.filter(Boolean), root) };
  }
  if (item.type === "commandExecution") return { events: [activity("command", "", GENERIC_SUMMARY.command, root)], files: "" };
  const tool = text(item.tool), server = text(item.server);
  return { events: [activity("other", "", tool ? (server ? `${tool} (${server})` : tool) : GENERIC_SUMMARY.other, root)], files: "" };
}
export function normalizeClaude(state: TransportState, raw: unknown, root: string): TransportResult {
  if (state.terminal || !object(raw) || raw.parent_tool_use_id) return unchanged(state);
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
    const body = raw.message.content.filter(object).filter(c => c.type === "text").map(c => text(c.text)).join("");
    if (body && !completedMessages.includes(messageId)) {
      events.push({ type: "message.done", messageId, text: body }); completedMessages.push(messageId);
    }
    for (const content of raw.message.content) {
      if (object(content) && content.type === "tool_use" && typeof content.id === "string" && !activities.includes(content.id)) {
        events.push(claudeActivity(text(content.name), object(content.input) ? content.input : {}, root)); activities.push(content.id);
      }
    }
    return { state: { ...state, completedMessages, activities }, events };
  }
  if (raw.type === "result") {
    if (raw.terminal_reason === "aborted_tools" || raw.terminal_reason === "interrupted") return aborted(state);
    if (raw.subtype === "success" && raw.is_error === false) return finish(state, { type: "turn.done" });
    const detail = Array.isArray(raw.errors) ? raw.errors.filter((e): e is string => typeof e === "string").join("\n") : text(raw.result);
    return failed(state, detail);
  }
  return unchanged(state);
}
export interface CodexContext { root: string; sessionId: string; turnId: string }
export interface CodexTransportResult extends TransportResult {
  request?: { id: string | number; method: string; disposition: "permission" | "unsupported" | "route" };
}
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
    const permission = matched && !state.terminal ? codexPermission(raw, state.fileSummaries) : null;
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
  if (raw.method === "item/agentMessage/delta" && typeof params.delta === "string" && typeof params.itemId === "string") {
    return { state, events: [{ type: "message.delta", messageId: params.itemId, text: params.delta }] };
  }
  if ((raw.method === "item/completed" || raw.method === "item/started") && object(params.item)) {
    const item = params.item;
    const id = text(item.id);
    if (raw.method === "item/completed" && id in state.fileSummaries) state = { ...state, fileSummaries: withoutFileSummary(state.fileSummaries, id) };
    if (raw.method === "item/completed" && item.type === "agentMessage" && id && !state.completedMessages.includes(id)) {
      return { state: { ...state, completedMessages: [...state.completedMessages, id] }, events: [{ type: "message.done", messageId: id, text: text(item.text) }] };
    }
    if (id && !state.activities.includes(id) && (item.type === "fileChange" || item.type === "commandExecution" || item.type === "mcpToolCall")) {
      const { events, files } = codexActivities(item, context.root);
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
export function claudePermission(requestId: string, tool: string, input: Record<string, unknown>, suggestions: readonly unknown[], root: string): PendingPermission {
  const choices = [
    choice("allow", "Allow", "allow", { behavior: "allow", updatedInput: input }),
    choice("deny", "Deny", "deny", { behavior: "deny", message: "Denied by the user." }),
  ];
  if (suggestions.length) choices.push(choice("always", "Allow with suggested permissions", "allowAlways", { behavior: "allow", updatedInput: input, updatedPermissions: [...suggestions] }));
  return { event: { type: "permission.request", requestId, tool, summary: claudePermissionSummary(tool, input, root), options: choices.map(c => c.option) }, choices };
}
export function codexPermission(raw: unknown, fileSummaries: Readonly<Record<string, string>> = {}): PendingPermission | null {
  if (!object(raw) || (typeof raw.id !== "number" && typeof raw.id !== "string") || !object(raw.params)) return null;
  const params = raw.params;
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
