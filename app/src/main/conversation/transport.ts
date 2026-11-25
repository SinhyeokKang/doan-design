import { posix } from "node:path";
import { canvasDir } from "../../formats/canvasPath";
import { object } from "./sessions";
import { connectorLabels, serverLabel } from "../mcpConnectors/presets";
import { codexMcpApproval } from "../mcpConnectors/codexApproval";
import { CONNECTOR_NAME_PATTERN } from "../mcpConnectors/names";
import type { BoundaryKind } from "./commandRecords";
import { clip, quoted, visibleText } from "./cardText";
import { QUESTION_LIMITS, type Question, type QuestionAnswer, type StoredAnswer } from "./question";
import { LIMITS } from "./messageText";
import { countStructuredPatch, countUnifiedDiff } from "./editLines";
import type { EditLines, EventPayload, FailureCode, FastUnused, FastUnusedReason, PendingPermission, PermissionChoice, TransportResult, TransportState, TurnStage } from "./types";

export function initialTransport(): TransportState {
  return { terminal: false, stop: null, messageId: "assistant", textBlock: null, completedMessages: [], activities: [], fileSummaries: {} };
}
function unchanged(state: TransportState): TransportResult { return { state, events: [] }; }
export const GENERAL_STAGE: TurnStage = { kind: "general" };
const THINKING_STAGE: TurnStage = { kind: "thinking" };
// judged: the turn's own end, whose Fast verdict goes out first; a crash or an aborted result is not judged.
function finish(state: TransportState, event: EventPayload, judged = true): TransportResult {
  if (state.terminal) return unchanged(state);
  const terminal: EventPayload = state.stop ? { type: "interrupted", reason: state.stop } : event;
  const fast = judged && state.fastUnused && (terminal.type === "turn.done" || terminal.type === "turn.failed") ? [state.fastUnused] : [];
  const { claudeFailure: _failure, claudeEdits: _claude, codexEdits: _codex, ...ended } = withoutRunning(state);
  return { state: { ...ended, terminal: true, fileSummaries: {} }, events: [...fast, ...contextBefore(state, terminal), terminal] };
}
// The state with the given calls (all of them when none are named) no longer running; the field goes once it is empty.
function withoutRunning(state: TransportState, ids?: readonly string[]): TransportState {
  const { running: before, ...rest } = state;
  const running = ids ? (before ?? []).filter(id => !ids.includes(id)) : [];
  return running.length ? { ...rest, running } : rest;
}
function withRunning(state: TransportState, id: string): TransportState {
  const before = state.running ?? [];
  return before.includes(id) ? state : { ...state, running: [...before, id] };
}
// Claude Code's reasons Fast cannot serve that hold on: the turn turns Fast off. Any other reason
// is recorded without one and leaves Fast on.
const CONTINUING: Readonly<Record<string, FastUnusedReason>> = { free: "plan", extra_usage_disabled: "extra_usage", model_not_allowed: "model", preference: "policy" };
// A Claude result of a turn that asked for Fast and ran without it; null when it did not ask, ran with Fast, or the
// result carries no state (an older CLI).
export function claudeFastOutcome(result: unknown, requested: boolean): FastUnused | null {
  if (!requested || !object(result)) return null;
  if (result.fast_mode_state === "cooldown") return { type: "fast.unused", reason: "cooldown" };
  if (result.fast_mode_state !== "off") return null;
  const reason = typeof result.fast_mode_disabled_reason === "string" && Object.hasOwn(CONTINUING, result.fast_mode_disabled_reason) ? CONTINUING[result.fast_mode_disabled_reason] : undefined;
  return reason ? { type: "fast.unused", reason, turnedOff: true } : { type: "fast.unused" };
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
// the model whose modelUsage entry gives the window. A message Claude Code makes up itself (an API error, "No response
// requested.") names the SDK's "<synthetic>" model and made no call, so the turn's last real call stays.
const CLAUDE_SYNTHETIC_MODEL = "<synthetic>";
// The `error` Claude Code sets on the assistant message it makes up for an account problem (SDKAssistantMessageError).
// Only values with an existing FailureCode are read; the rest fall to the result's text.
const CLAUDE_ERROR_CODE: Readonly<Record<string, FailureCode>> = { rate_limit: "rate_limited", authentication_failed: "not_logged_in" };
function claudeCall(message: Record<string, unknown>): { used: number; model: string } | undefined {
  if (!object(message.usage) || typeof message.model !== "string" || !message.model || message.model === CLAUDE_SYNTHETIC_MODEL) return undefined;
  const parts = [message.usage.input_tokens, message.usage.cache_creation_input_tokens ?? 0, message.usage.cache_read_input_tokens ?? 0];
  if (!parts.every(count)) return undefined;
  const used = parts.reduce((sum, part) => sum + part, 0);
  return Number.isSafeInteger(used) ? { used, model: message.model } : undefined;
}
// modelUsage also holds auxiliary models' keys (Claude Code 2.1.318 and 2.1.284 listed a Haiku entry beside the turn's
// model, whose key equals the top-level message.model), so the window is the call's own model's.
function claudeWindow(modelUsage: unknown, model: string): unknown {
  return object(modelUsage) && Object.hasOwn(modelUsage, model) && object(modelUsage[model]) ? modelUsage[model].contextWindow : undefined;
}
// /compact's summary may run on a smaller auxiliary model, so the turn's largest window is the conversation model's.
function largestWindow(modelUsage: unknown): number | undefined {
  if (!object(modelUsage)) return undefined;
  const windows = Object.values(modelUsage).filter(object).map(usage => usage.contextWindow).filter(count);
  return windows.length ? Math.max(...windows) : undefined;
}
// The CLI may wrap a local command's output in its stdout tag, which is not text for the thread.
const STDOUT = /^<local-command-stdout>([\s\S]*)<\/local-command-stdout>$/;
function commandOutput(output: string): string {
  return (STDOUT.exec(output.trim())?.[1] ?? output).trim();
}
function aborted(state: TransportState): TransportResult { return finish(state, { type: "turn.failed", code: "process_exited" }, false); }
export function endTransport(state: TransportState): TransportResult { return aborted(state); }
// A Claude frame under a session id the run did not ask for: the turn fails rather than go on in another session.
export function claudeSessionLost(state: TransportState): TransportResult { return finish(state, { type: "turn.failed", code: "session_unavailable" }); }
// consumed: steered message ids the agent read with this frame, reported before the frame's events. awaitingRead: a
// success result that is not terminal because a steered message is still unread; the runner bounds that wait.
export interface SteerResult extends TransportResult { consumed?: string[]; awaitingRead?: true }
// Registered before the message is written, so a result racing it already knows the turn is not over.
export function steerTransport(state: TransportState, id: string): TransportState {
  return state.terminal ? state : { ...state, steered: [...state.steered ?? [], id] };
}
// The wait after awaitingRead ran out: the turn ends as that success result would have.
export function endSteerWait(state: TransportState): TransportResult { return finish(state, { type: "turn.done" }); }
// The turn's own prompt, registered before it is written: a success result before the CLI read it closes a turn the
// CLI opened by itself (a background task's notice, PoC Claude Code 2.1.322 and 2.1.284), not this one.
export function promptTransport(state: TransportState, uuid: string): TransportState {
  return state.terminal ? state : { ...state, prompt: uuid };
}
// The wait ran out with the prompt still unread: the CLI never took the message, so the turn fails.
export function endPromptWait(state: TransportState): TransportResult { return finish(state, { type: "turn.failed", code: "prompt_unread" }); }
// The live background tasks after a background_tasks_changed frame, null for any other frame. The frame is a level
// signal that carries the whole set each time (SDK 0.3.312). An ambient entry is one the host leaves out of activity, so
// it is left out of what is shown; withAmbient keeps it, since it may still run in a process group of its own.
export function backgroundTasks(_current: readonly string[], raw: unknown, withAmbient = false): string[] | null {
  if (!object(raw) || raw.type !== "system" || raw.subtype !== "background_tasks_changed") return null;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return tasks.filter(object).filter(task => typeof task.task_id === "string" && task.task_id && (withAmbient || task.ambient !== true)).map(task => task.task_id as string);
}
function consume(state: TransportState, seen: readonly unknown[]): { state: TransportState; consumed: string[] } {
  const consumed = (state.steered ?? []).filter(id => seen.includes(id));
  return consumed.length ? { state: { ...state, steered: state.steered!.filter(id => !consumed.includes(id)) }, consumed } : { state, consumed };
}
function withConsumed(result: TransportResult, consumed: string[]): SteerResult { return consumed.length ? { ...result, consumed } : result; }
export function transportError(detail: string): FailureCode {
  if (/already has an active writer/i.test(detail)) return "session_in_use";
  if (/not logged in|authentication required|unauthorized|invalid api key|authentication failed/i.test(detail)) return "not_logged_in";
  // "hit your usage limit": Codex's own words for a reached usage limit (0.144.2).
  if (/rate.?limit|too many requests|hit your weekly limit|hit your usage limit/i.test(detail)) return "rate_limited";
  if (/session.*(not found|unavailable)|thread.*not found/i.test(detail)) return "session_unavailable";
  return "unknown";
}
function failed(state: TransportState, detail: string, code: FailureCode = transportError(detail)): TransportResult {
  return finish(state, { type: "turn.failed", code, ...(detail ? { detail: detail.slice(0, 4096) } : {}) });
}
// A Codex TurnError (the error notification's, or a failed turn/completed's). modelNotFound names the model only in
// its message; the model ID comes from there, since a model the account lacks is one Doan never sent (ipc.ts takes
// only models on the run's model/list). Without a readable ID the turn fails as any other error does.
function codexFailed(state: TransportState, error: unknown): TransportResult {
  const detail = object(error) ? text(error.message) : "";
  const model = object(error) && error.codexErrorInfo === "modelNotFound" ? /'([^'\s]+)' model\b/.exec(detail)?.[1] : undefined;
  if (!model) return failed(state, detail);
  return finish(state, { type: "turn.failed", code: "model_unavailable", model, detail: detail.slice(0, 4096) });
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
// Fallbacks when an item carries nothing readable: provider item types (commandExecution, fileChange, Bash) are wire
// vocabulary, not words for the strip.
export const GENERIC_SUMMARY = { edit: "Editing files", read: "Reading files", command: "Running a command", other: "Using a tool" } as const;
// A permission request leads with what will run (ARCHITECTURE §7: the approval card shows the command), so it keeps far
// more of it than other one-line summaries; the agent's own words about it (reason) stay short. A cut text ends in "…",
// so the person sees that more would run than the card shows (clip).
export const PERMISSION_SUMMARY_MAX = 8192;
const PERMISSION_REASON_MAX = 512;
// The agent's description of a request, unless it only repeats what the card already shows.
export function permissionReason(reason: string, summary: string): { reason?: string } {
  const trimmed = reason.trim();
  return trimmed && visibleText(trimmed) !== summary ? { reason: clip(trimmed, PERMISSION_REASON_MAX) } : {};
}
type ActivityKind = keyof typeof GENERIC_SUMMARY;
export function displayPath(path: string, root: string): string {
  const relative = posix.relative(root, posix.resolve(root, path));
  return relative && !relative.startsWith("..") && !posix.isAbsolute(relative) ? relative : path;
}
// Allow answers for `command` whole. Codex's `commandActions` is a best-effort parse for display that can name only part
// of the line, so it never stands in for the command. Only
// the login-shell wrapper Codex adds (`/bin/zsh -lc <script>`, a system shell) comes off, and only when the rest decodes
// as exactly one shell word; anything else shows as sent.
const SHELL_WRAPPER = /^\/bin\/(?:zsh|bash|sh) -l?c (.+)$/s;
function commandText(input: Record<string, unknown>): string {
  const command = text(input.command);
  const script = SHELL_WRAPPER.exec(command)?.[1];
  return (script !== undefined && shellWord(script)) || command;
}
// One POSIX shell word, as Codex's quoting writes it: '…' runs, "…" runs with \ escapes, backslash escapes and plain
// characters. Null for anything a shell would expand or split (an unescaped $ or ` in double quotes, a space, an
// operator), since the decoded text would then not be the script.
function shellWord(source: string): string | null {
  let word = "", i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === "'") {
      const end = source.indexOf("'", i + 1);
      if (end < 0) return null;
      word += source.slice(i + 1, end); i = end + 1;
    } else if (char === '"') {
      for (i++; ; i++) {
        const inner = source[i];
        if (inner === undefined || inner === "$" || inner === "`") return null;
        if (inner === '"') { i++; break; }
        if (inner === "\\" && "$`\"\\\n".includes(source[i + 1] ?? "x")) { i++; if (source[i] !== "\n") word += source.charAt(i); continue; }
        word += inner;
      }
    } else if (char === "\\") {
      if (i + 1 >= source.length) return null;
      if (source[i + 1] !== "\n") word += source.charAt(i + 1);
      i += 2;
    } else if (/[\w@%+=:,./-]/.test(char)) { word += char; i++; }
    else return null;
  }
  return word || null;
}
// Codex app-server's RequestPermissionProfile (checked against 0.169.0's generated schema): `network.enabled`, and
// `fileSystem` paths by access, as the legacy `read`/`write` lists and as `entries`. Each kind reads as one line; a piece
// of another shape stays as short JSON, so a new kind is still shown.
const ACCESS_LINES = { read: "Read", write: "Write", deny: "No access to" } as const;
const SPECIAL_PATHS: Readonly<Record<string, string>> = { root: "/", slash_tmp: "/tmp", tmpdir: "the temporary folder", minimal: "system folders", project_roots: "the project" };
const shortJson = (value: unknown) => { const json = JSON.stringify(value); return json.length > 120 ? `${json.slice(0, 120)}…` : json; };
type Access = keyof typeof ACCESS_LINES;
const isAccess = (value: unknown): value is Access => typeof value === "string" && Object.hasOwn(ACCESS_LINES, value);
function profilePath(path: unknown): string | null {
  if (!object(path)) return null;
  if (path.type === "path") return text(path.path) || null;
  if (path.type === "glob_pattern") return text(path.pattern) || null;
  if (path.type !== "special" || !object(path.value)) return null;
  const { kind, subpath } = path.value;
  if (text(subpath)) return text(subpath);
  if (kind === "unknown") return text(path.value.path) || null;
  return typeof kind === "string" ? SPECIAL_PATHS[kind] ?? null : null;
}
function codexPermissionSummary(permissions: Record<string, unknown>, root: string): string {
  const paths: Record<Access, string[]> = { read: [], write: [], deny: [] };
  const unknown: unknown[] = [];
  let network = false;
  for (const [key, value] of Object.entries(permissions)) {
    if (value === null || value === undefined) continue;
    if (key === "network" && object(value) && Object.keys(value).every(name => name === "enabled")) { network = value.enabled === true; continue; }
    if (key !== "fileSystem" || !object(value)) { unknown.push({ [key]: value }); continue; }
    for (const [name, part] of Object.entries(value)) {
      if (part === null || part === undefined || name === "globScanMaxDepth") continue;
      if ((name === "read" || name === "write") && Array.isArray(part) && part.every(path => typeof path === "string")) paths[name].push(...part);
      else if (name === "entries" && Array.isArray(part)) {
        for (const entry of part) {
          const path = object(entry) ? profilePath(entry.path) : null;
          if (path !== null && object(entry) && isAccess(entry.access)) paths[entry.access].push(path); else unknown.push(entry);
        }
      } else unknown.push({ fileSystem: { [name]: part } });
    }
  }
  const lines = [
    ...(network ? ["Use the network"] : []),
    ...(["read", "write", "deny"] as const).filter(access => paths[access].length).map(access => `${ACCESS_LINES[access]} ${filesSummary(paths[access], root)}`),
    ...unknown.map(shortJson),
  ];
  return clip(lines.length ? lines.join("; ") : shortJson(permissions), PERMISSION_SUMMARY_MAX);
}
// Every path an approval covers: one it left out could be the one that matters.
function filesSummary(paths: string[], root: string): string {
  return clip(paths.map(path => displayPath(path, root)).join(", "), PERMISSION_SUMMARY_MAX);
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
type ActivityEvent = Extract<EventPayload, { type: "activity" }>;
function activity(kind: ActivityKind, path: string, line: string, root: string, callId?: string): ActivityEvent {
  // Paths and tool names come from the agent unbounded; the strip shows one line and every event is stored.
  const summary = line.slice(0, 512);
  const id = callId ? { callId } : {};
  if (!path) return { type: "activity", kind, summary, ...id };
  const resolved = posix.resolve(root, path);
  return { type: "activity", kind, path, insideDesign: canvasDir(posix.relative(root, resolved)) !== null, summary, ...id };
}
// A provider's call id as an edit's activity.callId, or undefined for one the store refuses (empty, past the label
// limit, holding a NUL): a refused event ends the whole turn, while a missing id only leaves the step without numbers.
export function callIdOf(id: string): string | undefined {
  return id && id.length <= LIMITS.label && !id.includes("\0") ? id : undefined;
}
// A whole file's lines, as git counts them: a last line without a newline is still a line.
function contentLines(text: string): number { return text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0; }
// path is exactly the one the edit's activity stored ("" for none), so the thread matches a result to its step by the
// call id and that path alone.
export function editResult(callId: string, path: string, lines: EditLines | null): EventPayload[] {
  return lines ? [{ type: "activity.result", callId, ...(path ? { path } : {}), lines }] : [];
}
// tool_use_result belongs to the whole frame, so the caller reads it only for a frame with one result. A denied or
// failed edit brings an "Error: …" string instead of the object.
function claudeEditLines(result: unknown): EditLines | null {
  if (!object(result) || !Array.isArray(result.structuredPatch)) return null;
  // A new file's patch is empty (Claude Code 2.1.284 and 2.1.332); its content is all added.
  if (result.type === "create" && result.structuredPatch.length === 0 && typeof result.content === "string") return { added: contentLines(result.content), removed: 0 };
  return countStructuredPatch(result.structuredPatch);
}
// A Codex change's diff is a hunk for an update but the whole file for an add or a delete.
function codexChangeLines(change: Record<string, unknown>): EditLines | null {
  const kind = object(change.kind) ? change.kind.type : undefined;
  if (typeof change.diff !== "string") return null;
  if (kind === "update") return countUnifiedDiff(change.diff);
  if (kind === "add") return { added: contentLines(change.diff), removed: 0 };
  if (kind === "delete") return { added: 0, removed: contentLines(change.diff) };
  return null;
}
// Only a completed item was applied: a declined one still carries its diff. stored: the paths the item's activities
// stored; each is matched by one change at most, and a change on any other path has no step to show it.
function codexEditResults(item: Record<string, unknown>, callId: string, stored: readonly string[]): EventPayload[] {
  if (item.status !== "completed" || !Array.isArray(item.changes)) return [];
  const left = [...stored];
  return item.changes.filter(object).flatMap(change => {
    const path = text(change.path), at = left.indexOf(path);
    if (at < 0) return [];
    left.splice(at, 1);
    return editResult(callId, path, codexChangeLines(change));
  });
}
function claudeKind(tool: string): ActivityKind {
  return /^(Write|Edit|MultiEdit)$/.test(tool) ? "edit" : /^(Read|Glob|Grep)$/.test(tool) ? "read" : tool === "Bash" ? "command" : "other";
}
function claudePath(input: Record<string, unknown>): string { return text(input.file_path) || text(input.path); }
// A Doan connector's tool (`mcp__doan-<slug>__<tool>`) is named with its connector, and its input never reaches the
// summary: it can hold page ids, queries and bodies. labels maps doan- names to
// connector names; the presets are always known.
const DOAN_MCP_TOOL = new RegExp(`^mcp__(${CONNECTOR_NAME_PATTERN})__(.+)$`, "s");
const PRESET_LABELS = connectorLabels([]);
function doanToolSummary(tool: string, labels: Readonly<Record<string, string>>): string | null {
  const mcp = tool.match(DOAN_MCP_TOOL);
  return mcp ? clip(`Run ${mcp[2]} on ${serverLabel(mcp[1]!, { ...PRESET_LABELS, ...labels })}`, 512) : null;
}
// Another MCP server's tool, named by its server as Claude Code names it (mcp__<server>__<tool>).
const MCP_TOOL = /^mcp__(.+?)__(.+)$/s;
// What the approval lets run, never the agent's description of it: the command, the file, the pattern or address, or
// the MCP tool with its server and then its arguments. An MCP tool's argument named command, path or url is only an
// argument, so it never leads.
export function claudePermissionSummary(tool: string, input: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>> = PRESET_LABELS): string {
  const doan = doanToolSummary(tool, labels);
  if (doan) return doan;
  const mcp = tool.match(MCP_TOOL);
  if (mcp) return clip(`Run ${mcp[2]} on ${mcp[1]}${Object.keys(input).length ? `\n${JSON.stringify(input)}` : ""}`, PERMISSION_SUMMARY_MAX);
  const path = claudePath(input) || text(input.notebook_path);
  return clip(text(input.command) || (path && displayPath(path, root)) || text(input.pattern) || text(input.url) || GENERIC_SUMMARY[claudeKind(tool)], PERMISSION_SUMMARY_MAX);
}
function claudeToolSummary(tool: string, input: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>>): string {
  const path = claudePath(input);
  return doanToolSummary(tool, labels) ?? (text(input.description) || text(input.command) || (path && displayPath(path, root)) || text(input.pattern) || GENERIC_SUMMARY[claudeKind(tool)]).slice(0, 512);
}
// Activity is stored and published for every call, so a shell command's text, description or arguments never go in it
// (user decision 2026-10-30); only the permission request shows the command being approved.
// A Doan connector's tool input is the connector's (a page id, a query), never a file of the repo, so it gives no path.
function claudeActivity(tool: string, input: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>>, id: string): ActivityEvent {
  const kind = claudeKind(tool);
  return activity(kind, DOAN_MCP_TOOL.test(tool) ? "" : claudePath(input), kind === "command" ? GENERIC_SUMMARY.command : claudeToolSummary(tool, input, root, labels), root, kind === "edit" ? callIdOf(id) : undefined);
}
// A command Codex parsed into one read-only action reads files; the turn indicator says so, while its activity stays a
// command. Anything else (unknown, several actions, none) gives no stage. The command text never
// goes in, only a read's file path. A listFiles or search names a folder the indicator does not show ("Reading files"),
// so its stage carries no path: the renderer shows "Reading <path>" exactly when a path is there.
function codexReadStage(item: Record<string, unknown>, root: string): TurnStage | null {
  const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
  const [only] = actions;
  if (actions.length !== 1 || !object(only)) return null;
  const path = text(only.path);
  if (only.type === "read") return path ? { kind: "tool", activity: "read", path: path.slice(0, 512), summary: displayPath(path, root).slice(0, 512) } : null;
  if (only.type === "listFiles" || only.type === "search") return { kind: "tool", activity: "read", summary: GENERIC_SUMMARY.read };
  return null;
}
function codexActivities(item: Record<string, unknown>, root: string, labels: Readonly<Record<string, string>>): { events: ActivityEvent[]; files: string } {
  if (item.type === "fileChange") {
    const paths = (Array.isArray(item.changes) ? item.changes.filter(object) : []).map(change => text(change.path));
    const callId = callIdOf(text(item.id));
    const events = paths.length ? paths.map(path => activity("edit", path, path ? displayPath(path, root) : GENERIC_SUMMARY.edit, root, callId)) : [activity("edit", "", GENERIC_SUMMARY.edit, root, callId)];
    return { events, files: filesSummary(paths.filter(Boolean), root) };
  }
  if (item.type === "commandExecution") return { events: [activity("command", "", GENERIC_SUMMARY.command, root)], files: "" };
  const tool = text(item.tool), server = text(item.server);
  return { events: [activity("other", "", tool ? (server ? `${tool} (${serverLabel(server, labels)})` : tool) : GENERIC_SUMMARY.other, root)], files: "" };
}
// The mode a top-level Claude system/init or system/status reports ({type: "system", subtype, permissionMode}, SDK
// 0.3.312), in Claude's own ids; undefined for a subagent's frame and any other message. Callers map it: init gives the
// mode an Ask first turn's settings run, status a switch inside the process (a plan approval, or a suggestion's setMode).
export interface ClaudeModeReport { source: "init" | "status"; mode: string }
export function claudeModeReport(raw: unknown): ClaudeModeReport | undefined {
  if (!object(raw) || raw.parent_tool_use_id || raw.type !== "system" || (raw.subtype !== "init" && raw.subtype !== "status") || typeof raw.permissionMode !== "string") return undefined;
  return { source: raw.subtype, mode: raw.permissionMode };
}
// labels: the connector names of the run (connectorLabels), so a Doan connector's tool never shows its doan- name.
export function normalizeClaude(state: TransportState, raw: unknown, root: string, labels?: Readonly<Record<string, string>>): SteerResult {
  if (state.terminal || !object(raw) || raw.parent_tool_use_id) return unchanged(state);
  // A steered message is read when its uuid first appears in a frame's user_message_uuids: the system/status after a
  // tool result when it folds into the running turn, or the system/init of the turn the CLI runs for it (PoC, Claude Code 2.1.317 and 2.1.312).
  // An older producer's frame names only user_message_uuid (SDK 0.3.312); 2.1.284 first names the prompt on message_start.
  const seen: unknown[] = [...Array.isArray(raw.user_message_uuids) ? raw.user_message_uuids : [], raw.user_message_uuid];
  const read = consume(state, seen);
  const { prompt: _prompt, ...rest } = read.state;
  const prompted = read.state.prompt !== undefined && seen.includes(read.state.prompt) ? rest : read.state;
  return withConsumed(claudeFrame(prompted, raw, root, labels), read.consumed);
}
function claudeFrame(state: TransportState, raw: Record<string, unknown>, root: string, labels?: Readonly<Record<string, string>>): SteerResult {
  if (raw.type === "stream_event" && object(raw.event)) {
    const event = raw.event;
    if (event.type === "message_start" && object(event.message) && typeof event.message.id === "string") return { state: { ...state, messageId: event.message.id, textBlock: null }, events: [] };
    if (event.type === "content_block_start" && object(event.content_block) && event.content_block.type === "text" && typeof event.index === "number") {
      return { state: { ...state, textBlock: event.index }, events: [] };
    }
    // Thinking lasts from its block's start to that block's stop. A tool block's stop says nothing: the activity its
    // assistant frame brought already tells the tool.
    if (event.type === "content_block_start" && object(event.content_block) && event.content_block.type === "thinking" && typeof event.index === "number") {
      return { state: { ...state, thinkingBlock: event.index }, events: [], stage: THINKING_STAGE };
    }
    if (event.type === "content_block_stop" && state.thinkingBlock !== undefined && event.index === state.thinkingBlock) {
      const { thinkingBlock: _, ...rest } = state;
      return { state: rest, events: [], stage: GENERAL_STAGE };
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
    const running = [...state.running ?? []];
    let edits = state.claudeEdits;
    const call = claudeCall(raw.message);
    // The latest assistant frame decides: a later call that went through means the error did not end the turn.
    const { claudeFailure: _failure, ...kept } = state, failure = typeof raw.error === "string" && Object.hasOwn(CLAUDE_ERROR_CODE, raw.error) ? CLAUDE_ERROR_CODE[raw.error] : undefined;
    state = failure ? { ...kept, claudeFailure: failure } : kept;
    const body = raw.message.content.filter(object).filter(c => c.type === "text").map(c => text(c.text)).join("");
    if (body && !completedMessages.includes(messageId)) {
      events.push({ type: "message.done", messageId, text: body }); completedMessages.push(messageId);
    }
    for (const content of raw.message.content) {
      // The question card stands for an AskUserQuestion call, so it shows no "Using a tool" line.
      if (object(content) && content.type === "tool_use" && content.name === CLAUDE_QUESTION_TOOL) continue;
      if (object(content) && content.type === "tool_use" && typeof content.id === "string" && !activities.includes(content.id)) {
        const event = claudeActivity(text(content.name), object(content.input) ? content.input : {}, root, labels ?? PRESET_LABELS, content.id);
        events.push(event); activities.push(content.id); running.push(content.id);
        if (event.callId) edits = { ...edits, [event.callId]: event.path ?? "" };
      }
    }
    return { state: { ...state, completedMessages, activities, ...(running.length ? { running } : {}), ...(call ? { claudeCall: call } : {}), ...(edits ? { claudeEdits: edits } : {}) }, events };
  }
  if (raw.type === "result") {
    // A result ends every call of the turn it closes, including one that waits for a steered message: the continued
    // turn starts with none running.
    state = withoutRunning(state);
    // Read on every result, so a steer wait that ends without the follow-up's result (endSteerWait) still has it.
    const value = state.claudeCall ? contextValue(state.claudeCall.used, claudeWindow(raw.modelUsage, state.claudeCall.model))
      : state.compacted && contextValue(state.compacted.post, largestWindow(raw.modelUsage));
    if (value) state = { ...state, context: value };
    // Every result judges anew, so a steered turn's last result decides.
    const { fastUnused: _previous, ...rest } = state, verdict = claudeFastOutcome(raw, state.fastRequested === true);
    state = verdict ? { ...rest, fastUnused: verdict } : rest;
    if (raw.terminal_reason === "aborted_tools" || raw.terminal_reason === "interrupted") return aborted(state);
    // queued_turn_count stays 0 while a steered message is unread (same PoC), so only the uuids tell that the CLI goes on
    // to another turn for it; that turn's result ends this one. A stop still ends here.
    // The same holds for the turn's own prompt: a success result before it was read is another turn's.
    if (raw.subtype === "success" && raw.is_error === false) {
      if ((state.steered?.length || state.prompt !== undefined) && !state.stop) return { ...unchanged(state), awaitingRead: true };
      // A built-in that answers without the model (/context) may bring its text only here. num_turns 0 says no model turn
      // ran (PoC: /compact's result), so a model turn's result never repeats its last message.
      const answer = raw.num_turns === 0 && !state.stop && !state.compacted && !state.completedMessages.length ? commandOutput(text(raw.result)) : "";
      const done = finish(state, { type: "turn.done" });
      return answer ? { ...done, events: [{ type: "message.done", messageId: text(raw.uuid) || state.messageId, text: answer }, ...done.events] } : done;
    }
    const detail = Array.isArray(raw.errors) ? raw.errors.filter((e): e is string => typeof e === "string").join("\n") : text(raw.result);
    return failed(state, detail, state.claudeFailure);
  }
  // The model is being asked again (after the prompt and after every tool result), or the last running tool just
  // returned. A result while a parallel sibling still runs reports nothing, so the activity rule keeps naming a tool.
  // A result for a call that never ran as an activity (AskUserQuestion) removes nothing.
  if (raw.type === "system" && raw.subtype === "status" && raw.status === "requesting") return { ...unchanged(state), stage: GENERAL_STAGE };
  if (raw.type === "system" && raw.subtype === "compact_boundary") {
    const metadata = object(raw.compact_metadata) ? raw.compact_metadata : {};
    return unchanged({ ...state, compacted: count(metadata.post_tokens) ? { post: metadata.post_tokens } : {} });
  }
  // A local command's output (SDK SDKLocalCommandOutputMessage, "displayed as assistant-style text"): /usage, /context.
  if (raw.type === "system" && raw.subtype === "local_command_output" && !state.compacted) {
    const output = commandOutput(text(raw.content)), messageId = text(raw.uuid) || state.messageId;
    if (!output || state.completedMessages.includes(messageId)) return unchanged(state);
    return { state: { ...state, completedMessages: [...state.completedMessages, messageId] }, events: [{ type: "message.done", messageId, text: output }] };
  }
  if (raw.type === "user" && object(raw.message) && Array.isArray(raw.message.content) && raw.message.content.some(c => object(c) && c.type === "tool_result")) {
    const results = raw.message.content.filter(object).filter(c => c.type === "tool_result");
    const ended = results.map(c => text(c.tool_use_id));
    const { claudeEdits: before, ...rest } = withoutRunning(state, ended);
    const edits = Object.entries(before ?? {}).filter(([id]) => !ended.includes(id));
    const next: TransportState = edits.length ? { ...rest, claudeEdits: Object.fromEntries(edits) } : rest;
    // Only a frame with one result tells whose tool_use_result it carries.
    const [only] = results, id = results.length === 1 && only ? text(only.tool_use_id) : "";
    const path = id && before && Object.hasOwn(before, id) ? before[id] : undefined;
    const events = path !== undefined && only?.is_error !== true ? editResult(id, path, claudeEditLines(raw.tool_use_result)) : [];
    return { state: next, events, ...(next.running ? {} : { stage: GENERAL_STAGE }) };
  }
  return unchanged(state);
}
export const CLAUDE_QUESTION_TOOL = "AskUserQuestion";
// A Claude question as the card shows it, and each ordinal id's question text: Claude keys its answers by that text.
export interface ClaudeQuestion { questions: Question[]; textById: Record<string, string> }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
// AskUserQuestion's input (sdk-tools.d.ts AskUserQuestionInput); null for anything a card cannot show whole. A
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
// own card answers. A skip sends no answer text, which the model would read as an answer, and marks each question
// unanswered only for a session that advertises it (system/init capabilities); an older CLI refuses the mark, so a
// skip there is a denial.
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
// tool approval with no turn to ask in), and every requestUserInput of this thread (Codex 0.166.0 sends none in a
// Doan mode, so no card exists for it). unsupported and route are answered with an error.
// boundary: the turn's compaction item completed (thread/compact/start's turn), the only sign it compacted.
export interface CodexTransportResult extends SteerResult {
  boundary?: BoundaryKind;
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
    // tool call fails and the turn goes on.
    // No answers is a normal reply Codex reads as "no answer received" and goes on from, whatever the question.
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
  // last is the turn's latest model call; its inputTokens already include the cached ones (Codex 0.166.0 and 0.158.0:
  // cachedInputTokens never exceeded inputTokens), while totalTokens adds output. After thread/resume, 0.158.0 replayed
  // the previous turn's notification once before the new turn/start reply; the turn check drops it.
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
    if (raw.method === "item/completed" && item.type === "contextCompaction") return { ...unchanged(state), boundary: "compacted" };
    const id = text(item.id);
    if (raw.method === "item/completed" && id in state.fileSummaries) state = { ...state, fileSummaries: withoutFileSummary(state.fileSummaries, id) };
    if (raw.method === "item/completed" && item.type === "agentMessage" && id && !state.completedMessages.includes(id)) {
      return { state: { ...state, completedMessages: [...state.completedMessages, id] }, events: [{ type: "message.done", messageId: id, text: text(item.text) }] };
    }
    // A tool item runs from its start to its completion. Only a read has a stage of its own; any tool's completion
    // reports general once no other tool item runs.
    const tool = item.type === "fileChange" || item.type === "commandExecution" || item.type === "mcpToolCall";
    const started = raw.method === "item/started";
    if (tool && id) state = started ? withRunning(state, id) : withoutRunning(state, [id]);
    const read = started && item.type === "commandExecution" ? codexReadStage(item, context.root) : null;
    const stage = read ?? (tool && !started && !state.running ? GENERAL_STAGE : null);
    let events: EventPayload[] = [];
    if (id && !state.activities.includes(id) && tool) {
      const made = codexActivities(item, context.root, context.labels ?? PRESET_LABELS);
      // A file approval names only its itemId, so the paths seen when the item started are kept for it.
      const fileSummaries = made.files && raw.method === "item/started" ? withFileSummary(state.fileSummaries, id, made.files) : state.fileSummaries;
      const edits = made.events[0]?.callId ? { codexEdits: { ...state.codexEdits, [id]: made.events.map(event => event.path ?? "") } } : {};
      state = { ...state, activities: [...state.activities, id], fileSummaries, ...edits };
      events = made.events;
    }
    // An item completes once; its stored paths go with it.
    if (!started && state.codexEdits && Object.hasOwn(state.codexEdits, id)) {
      const { [id]: stored, ...rest } = state.codexEdits;
      const { codexEdits: _, ...without } = state;
      state = Object.keys(rest).length ? { ...without, codexEdits: rest } : without;
      events = [...events, ...codexEditResults(item, id, stored ?? [])];
    }
    if (events.length || stage) return { state, events, ...(stage ? { stage } : {}) };
  }
  if (raw.method === "turn/completed" && object(params.turn)) {
    if (params.turn.status === "interrupted") return aborted(state);
    if (params.turn.status === "completed") return finish(state, { type: "turn.done" });
    return codexFailed(state, params.turn.error);
  }
  if (raw.method === "error" && params.willRetry !== true) return codexFailed(state, params.error);
  return unchanged(state);
}
function choice(id: string, label: string, kind: "allow" | "allowAlways" | "deny", response: unknown): PermissionChoice {
  return { option: { id, label, kind }, response };
}
// What a choice that saves something saves, in a sentence the card shows beside the request.
function savedDetail(detail: string): { detail: string } { return { detail: clip(detail, PERMISSION_SUMMARY_MAX) }; }
// Claude Code's PermissionUpdate (SDK 0.3.x): where it lands, and what it adds, replaces or removes there. A shape this
// build does not know stays as short JSON, so nothing it saves goes unshown.
const CLAUDE_DESTINATIONS: Readonly<Record<string, string>> = {
  localSettings: ".claude/settings.local.json", projectSettings: ".claude/settings.json", userSettings: "your Claude Code user settings", session: "this session", cliArg: "this run",
};
function claudeRule(rule: unknown): string {
  if (!object(rule) || !text(rule.toolName)) return shortJson(rule);
  return text(rule.ruleContent) ? `${text(rule.toolName)}(${text(rule.ruleContent)})` : text(rule.toolName);
}
function claudeUpdateLine(update: unknown): string {
  if (!object(update)) return shortJson(update);
  const where = `in ${CLAUDE_DESTINATIONS[text(update.destination)] ?? text(update.destination)}`;
  const rules = Array.isArray(update.rules) ? update.rules.map(claudeRule) : [];
  const directories = Array.isArray(update.directories) ? update.directories.map(d => text(d) || shortJson(d)) : [];
  const ruleWord = `the ${text(update.behavior)} rule${rules.length === 1 ? "" : "s"} ${rules.join(", ")}`;
  if (update.type === "addRules" && rules.length) return `Adds ${ruleWord} ${where}.`;
  if (update.type === "replaceRules" && rules.length) return `Replaces the ${text(update.behavior)} rules with ${rules.join(", ")} ${where}.`;
  if (update.type === "removeRules" && rules.length) return `Removes ${ruleWord} ${where}.`;
  if (update.type === "addDirectories" && directories.length) return `Allows access to ${directories.join(", ")} ${where}.`;
  if (update.type === "removeDirectories" && directories.length) return `Removes access to ${directories.join(", ")} ${where}.`;
  if (update.type === "setMode" && text(update.mode)) return `Switches to the ${text(update.mode)} mode ${where}.`;
  return shortJson(update);
}
function claudeSuggestionsDetail(suggestions: readonly unknown[]): string { return suggestions.map(claudeUpdateLine).join(" "); }
export function claudePermissionRequest(requestId: string, tool: string, input: Record<string, unknown>, suggestions: readonly unknown[], root: string, labels?: Readonly<Record<string, string>>): Extract<EventPayload, { type: "permission.request" }> {
  const summary = claudePermissionSummary(tool, input, root, labels);
  return {
    // A Doan connector's input, its description included, stays out (claudePermissionSummary).
    type: "permission.request", requestId, tool, summary, ...(DOAN_MCP_TOOL.test(tool) ? {} : permissionReason(text(input.description), summary)),
    options: [
      { id: "allow", label: "Allow", kind: "allow" }, { id: "deny", label: "Deny", kind: "deny" },
      ...(suggestions.length ? [{ id: "always", label: "Allow with suggested permissions", kind: "allowAlways" as const, ...savedDetail(claudeSuggestionsDetail(suggestions)) }] : []),
    ],
  };
}
export function claudePermission(requestId: string, tool: string, input: Record<string, unknown>, suggestions: readonly unknown[], root: string, labels?: Readonly<Record<string, string>>): PendingPermission {
  const event = claudePermissionRequest(requestId, tool, input, suggestions, root, labels);
  const responses: Record<string, unknown> = {
    allow: { behavior: "allow", updatedInput: input }, deny: { behavior: "deny", message: "Denied by the user." },
    always: { behavior: "allow", updatedInput: input, updatedPermissions: [...suggestions] },
  };
  return { event, choices: event.options.map(option => ({ option, response: responses[option.id] })) };
}
// Codex's execpolicy prefix as one command line; a word with a space or a quote keeps its JSON quotes.
function commandPrefix(words: readonly string[]): string { return words.map(word => /[\s"'\\]/.test(word) ? JSON.stringify(word) : word).join(" "); }
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
    const summary = codexPermissionSummary(params.permissions, text(params.cwd));
    return { event: { type: "permission.request", requestId: `${typeof raw.id}:${raw.id}`, tool: "permissions", summary, ...permissionReason(text(params.reason), summary), options: choices.map(c => c.option) }, choices };
  }
  if (raw.method !== "item/fileChange/requestApproval" && raw.method !== "item/commandExecution/requestApproval") return null;
  const response = (decision: unknown) => ({ id: raw.id, result: { decision } });
  // grantRoot (unstable in Codex's schema) asks for writes under a folder for the rest of the session on top of this change.
  const grantRoot = raw.method === "item/fileChange/requestApproval" ? text(params.grantRoot) : "";
  const session = choice("acceptForSession", "Allow for this session", "allowAlways", response("acceptForSession"));
  const choices = [
    choice("accept", "Allow", "allow", response("accept")),
    choice("decline", "Deny", "deny", response("decline")),
    grantRoot ? { ...session, option: { ...session.option, ...savedDetail(`Codex also asks to allow writes anywhere under ${quoted(grantRoot)} for the rest of this session.`) } } : session,
  ];
  if (raw.method === "item/commandExecution/requestApproval") {
    if (Array.isArray(params.proposedExecpolicyAmendment) && params.proposedExecpolicyAmendment.length && params.proposedExecpolicyAmendment.every(p => typeof p === "string")) {
      const rule = choice("execpolicy", "Allow with proposed command rule", "allowAlways", response({ acceptWithExecpolicyAmendment: { execpolicy_amendment: params.proposedExecpolicyAmendment } }));
      choices.push({ ...rule, option: { ...rule.option, ...savedDetail(`Adds a rule that runs commands starting with ${quoted(commandPrefix(params.proposedExecpolicyAmendment))} without asking.`) } });
    }
    if (Array.isArray(params.proposedNetworkPolicyAmendments)) for (const [index, amendment] of params.proposedNetworkPolicyAmendments.entries()) {
      if (object(amendment) && typeof amendment.host === "string" && (amendment.action === "allow" || amendment.action === "deny")) {
        const allow = amendment.action === "allow";
        const rule = choice(`network-${index}`, visibleText(`${allow ? "Allow" : "Deny"} ${amendment.host}`), allow ? "allowAlways" : "deny", response({ applyNetworkPolicyAmendment: { network_policy_amendment: amendment } }));
        // Either answer saves a rule for later requests, so both say so.
        choices.push({ ...rule, option: { ...rule.option, ...savedDetail(allow ? `Adds a rule that allows network access to ${quoted(amendment.host)} without asking.` : `Adds a rule that blocks network access to ${quoted(amendment.host)}.`) } });
      }
    }
  }
  const files = raw.method === "item/fileChange/requestApproval";
  const summary = clip((files ? fileSummaries[text(params.itemId)] || GENERIC_SUMMARY.edit : commandText(params) || GENERIC_SUMMARY.command), PERMISSION_SUMMARY_MAX);
  return { event: { type: "permission.request", requestId: `${typeof raw.id}:${raw.id}`, tool: files ? "fileChange" : "commandExecution", summary, ...permissionReason(text(params.reason), summary), options: choices.map(c => c.option) }, choices };
}
export function permissionAnswer(request: PendingPermission, optionId: string): { response: unknown; event: EventPayload } | null {
  const chosen = request.choices.find(c => c.option.id === optionId);
  return chosen ? { response: chosen.response, event: { type: "permission.resolved", requestId: request.event.requestId, optionId } } : null;
}
