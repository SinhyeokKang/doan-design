import type { ConversationEvent, StageSignal, TurnStage } from "../main/conversation/types";
import { countHead, rootRelative, runningHead, sameItem, waitsForPerson, type ActivityStep, type ThreadItem } from "./threadItems";

// threadItems already folds streaming, waiting cards, ends and crashes, so none of it is decided again here.

// lastSeq: the turn's last event seq, which a stage signal must not be older than. live: threadItems' `live`.
export interface TurnInfo { turnId: string; at: string; lastSeq: number; live: boolean; ended: boolean }
// `step`: the activity step the event rule took the tool from; absent when main's stage named it.
export type TurnStatus =
  | { kind: "none" } | { kind: "waiting" } | { kind: "reply" } | { kind: "general" } | { kind: "thinking" }
  | { kind: "tool"; activity: "read" | "edit" | "command" | "other"; text: string; step?: string };

// main pushes a turn's user.message and its turn.started separately, so a render can hold the message alone; the
// message opens its turn, or the indicator would miss that render. A steered message opens nothing.
export function turnOf(events: readonly ConversationEvent[], live: boolean): TurnInfo | null {
  let last = events.length - 1;
  while (last >= 0 && events[last]!.type !== "turn.started") last--;
  const latest = last >= 0 ? events[last] : undefined;
  const opening = events.slice(last + 1).find(event => event.type === "user.message" && event.turnId !== latest?.turnId);
  const started = opening ?? latest;
  if (!started) return null;
  let lastSeq = started.seq, ended = false;
  for (const event of events) {
    if (event.turnId !== started.turnId) continue;
    // These events can land while another tool runs and are not the agent acting, so they age no stage.
    if (event.type !== "canvas.drawn" && event.type !== "activity.result") lastSeq = Math.max(lastSeq, event.seq);
    if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") ended = true;
  }
  return { turnId: started.turnId, at: started.at, lastSeq, live, ended };
}

// Main leaves the folder out of a Codex listFiles or search, which reads as "Reading files".
function stageTool(stage: Extract<TurnStage, { kind: "tool" }>, root: string): TurnStatus {
  const path = stage.path ? rootRelative(stage.path, root) : null;
  return { kind: "tool", activity: stage.activity, text: runningHead({ key: "", kind: stage.activity, verb: stage.summary, path }) };
}
const eventTool = (step: ActivityStep): TurnStatus => ({ kind: "tool", activity: step.kind, text: runningHead(step), step: step.key });

// Send now's messages in flight and a turn's canvas cards sit at the thread's end, so the status and the last row are
// judged above both.
function ownEnd(items: readonly ThreadItem[]): number {
  let end = items.length;
  while (end > 0) { const item = items[end - 1]!; if (item.kind !== "canvasCard" && (item.kind !== "user" || !item.sending)) break; end--; }
  return end;
}

// A stage counts only for this turn and only while no event of it came after. stopping: the indicator goes at once,
// although main may hold the turn's end while it reads the transcript for steered messages.
export function turnStatus(all: readonly ThreadItem[], turn: TurnInfo | null, stage: StageSignal | null, root: string, stopping = false): TurnStatus {
  if (!turn || !turn.live || turn.ended || stopping) return { kind: "none" };
  const items = all.slice(0, ownEnd(all));
  if (items.some(waitsForPerson)) return { kind: "waiting" };
  const last = items.at(-1);
  if (last?.kind === "agent" && last.streaming) return { kind: "reply" };
  if (stage && stage.turnId === turn.turnId && stage.seq >= turn.lastSeq) {
    return stage.stage.kind === "tool" ? stageTool(stage.stage, root) : { kind: stage.stage.kind };
  }
  const allowed = last?.kind === "permission" && last.status === "answered" && (last.answer?.kind === "allow" || last.answer?.kind === "allowAlways");
  const tool = last?.kind === "activity" ? last : allowed ? items.at(-2) : undefined;
  const step = tool?.kind === "activity" ? tool.steps.at(-1) : undefined;
  return step && !step.sentence ? eventTool(step) : { kind: "general" };
}

type ActivityItem = Extract<ThreadItem, { kind: "activity" }>;
const fromStage = (status: TurnStatus) => status.kind === "tool" && status.step === undefined;
// From the indicator's shown status, so the two agree and a fast tool does not flicker the row. An ACP agent writes an
// activity only once its tool completed, so there only a stage of that same tool (`acp`, before settle) makes it run.
export function activityRun(items: readonly ThreadItem[], status: TurnStatus, acp: TurnStatus | null): readonly ThreadItem[] {
  const at = ownEnd(items) - 1;
  const row = items[at];
  if (row?.kind !== "activity") return items;
  const last = row.steps.at(-1);
  const { total: _total, ...base } = row;
  let next: ActivityItem = { ...base, running: false, ...countHead(row.steps) };
  if (last?.sentence) {
    if (status.kind !== "none") next = { ...base, running: true, head: runningHead(last) };
  } else if (status.kind === "tool" && (acp === null || (fromStage(status) && fromStage(acp) && statusKey(status) === statusKey(acp)))) {
    const own = last !== undefined && last.kind === "command" && status.step === last.key;
    next = { ...base, running: true, head: status.text, ...(own ? { steps: [...row.steps.slice(0, -1), { ...last, verb: "Running a command" }] } : {}) };
  }
  if (next.running === row.running && next.head === row.head && sameItem(next.total, row.total) && next.steps === row.steps) return items;
  return items.map((item, i) => i === at ? next : item);
}

// A Stop main took hides the indicator before the turn's end arrives, so the cards stop drawing in that same render.
export function drawingCards(items: readonly ThreadItem[], status: TurnStatus): readonly ThreadItem[] {
  if (status.kind !== "none" || !items.some(item => item.kind === "canvasCard" && item.drawing)) return items;
  return items.map(item => item.kind === "canvasCard" && item.drawing ? { ...item, drawing: false } : item);
}

// The id lets the thread drop the settle state of an earlier turn. label: a command turn's own running words.
export interface ThreadTurn { turnId: string; status: TurnStatus; at: string; label?: string }
export function threadTurn(events: readonly ConversationEvent[], items: readonly ThreadItem[], live: boolean, stage: StageSignal | null, root: string, stopping = false, labelOf?: (turnId: string) => string | null): ThreadTurn | null {
  const turn = turnOf(events, live);
  if (!turn) return null;
  const label = labelOf?.(turn.turnId);
  return { turnId: turn.turnId, status: turnStatus(items, turn, stage, root, stopping), at: turn.at, ...(label ? { label } : {}) };
}

// A read's reply and a push sent after it may arrive in either order, so within a turn the higher rev wins. `current`
// is null while the history is not read.
export function newerStage(held: StageSignal | null, incoming: StageSignal, current: string | null): StageSignal | null {
  if (current !== null && incoming.turnId !== current) return held;
  if (held && held.turnId === incoming.turnId && held.rev >= incoming.rev) return held;
  return incoming;
}

// A new stage shows after holding this long, so short tools do not flicker. Replying, waiting and none show at once,
// as does the first stage after none or waiting.
export const SETTLE_MS = 300;
export interface Settled { shown: TurnStatus; pending: TurnStatus | null; since: number }
const hidden = (status: TurnStatus) => status.kind === "none" || status.kind === "waiting";
export const statusKey = (status: TurnStatus) => status.kind === "tool" ? `tool:${status.activity}:${status.text}` : status.kind;
// Nothing changed gives `previous` itself, so the thread can keep the result as state derived while it renders.
const laterStep = (shown: TurnStatus, next: TurnStatus) => shown.kind === "tool" && next.kind === "tool" && shown.step !== undefined && next.step !== undefined && shown.step !== next.step;
export function settle(previous: Settled | null, next: TurnStatus, now: number): Settled {
  const same = previous !== null && statusKey(next) === statusKey(previous.shown);
  if (same && !previous.pending) return laterStep(previous.shown, next) ? { shown: next, pending: null, since: now } : previous;
  if (!previous || same || hidden(previous.shown) || hidden(next) || next.kind === "reply") return { shown: next, pending: null, since: now };
  if (previous.pending && statusKey(previous.pending) === statusKey(next)) {
    return now - previous.since >= SETTLE_MS ? { shown: next, pending: null, since: now } : previous;
  }
  return { shown: previous.shown, pending: next, since: now };
}

// Seconds always shown; an unreadable, negative or future span is 0s.
export function elapsedText(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// The provider names only the stages without a tool.
export function turnText(status: TurnStatus, provider: string): string {
  switch (status.kind) {
    case "tool": return status.text;
    case "thinking": return `${provider} is thinking`;
    case "reply": return `${provider} is replying`;
    default: return `${provider} is working`;
  }
}
// The stage's kind only, never a path or the time, so it changes only when the kind does.
const TOOL_ANNOUNCEMENT = { read: "is reading files", edit: "is editing files", command: "is running a command", other: "is using a tool" } as const;
export function turnAnnouncement(status: TurnStatus, provider: string): string {
  if (hidden(status)) return "";
  return status.kind === "tool" ? `${provider} ${TOOL_ANNOUNCEMENT[status.activity]}` : turnText(status, provider);
}

// sending: the next send stops the group first, so the line goes in that same render rather than when main's list
// catches up. stopping: this window's Stop; main's own `stopping` covers a press in the other host.
export function backgroundLine(input: { background: { turnId: string; stopping?: true } | null | undefined; sending: boolean; stopping: boolean }): { turnId: string; stopping: boolean } | null {
  const { background } = input;
  if (!background || input.sending) return null;
  return { turnId: background.turnId, stopping: input.stopping || background.stopping === true };
}

export const BACKGROUND_STOP_FAILED = "Couldn’t stop the background work. Try again.";
// The stop names its done turn, so a press reaching main after a newer send stops nothing there. null when the stop
// went through.
export async function stopBackground(request: { conversationId: string; turnId: string }, interrupt: (request: { conversationId: string; turnId: string }) => Promise<void | { error: string }>): Promise<string | null> {
  try {
    const reply = await interrupt(request);
    return reply && "error" in reply ? BACKGROUND_STOP_FAILED : null;
  } catch {
    return BACKGROUND_STOP_FAILED;
  }
}
