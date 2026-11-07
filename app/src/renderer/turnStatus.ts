import type { ConversationEvent, StageSignal, TurnStage } from "../main/conversation/types";
import { rootRelative, runningHead, waitsForPerson, type ActivityStep, type ThreadItem } from "./threadItems";

// The turn indicator's state: what the agent of the last turn does now, read from the
// thread's items, the turn and main's latest stage signal. threadItems already folds streaming, waiting cards, ends and
// crashes, so none of it is decided again here.

// The last turn as the indicator needs it. lastSeq: the last event seq of that turn, which a stage signal must not be
// older than; live: main holds a turn of this conversation (threadItems' `live`); ended: the turn has its terminal.
export interface TurnInfo { turnId: string; at: string; lastSeq: number; live: boolean; ended: boolean }
// tool: `text` is what the indicator shows, the activity rows' words for the same tool.
export type TurnStatus =
  | { kind: "none" } | { kind: "waiting" } | { kind: "reply" } | { kind: "general" } | { kind: "thinking" }
  | { kind: "tool"; activity: "read" | "edit" | "command" | "other"; text: string };

// Main appends a turn's opening user.message and its turn.started one after the other and pushes each (a save and a
// list notice lie between), so a render can hold the message alone; that message already opens its turn, or the
// indicator would miss the render the message enters (measured 10–14 ms on an existing conversation). A
// steered message carries the running turn's id and opens nothing.
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
    lastSeq = Math.max(lastSeq, event.seq);
    if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") ended = true;
  }
  return { turnId: started.turnId, at: started.at, lastSeq, live, ended };
}

// A read or edit with a path reads "Reading/Editing <path>", as the activity rows do; without one, its summary. Main
// leaves the folder out of a Codex listFiles or search, which reads as "Reading files".
function stageTool(stage: Extract<TurnStage, { kind: "tool" }>, root: string): TurnStatus {
  const path = stage.path ? rootRelative(stage.path, root) : null;
  return { kind: "tool", activity: stage.activity, text: runningHead({ key: "", kind: stage.activity, verb: stage.summary, path }) };
}
const eventTool = (step: ActivityStep): TurnStatus => ({ kind: "tool", activity: step.kind, text: runningHead(step) });

// A stage counts only for this turn and only while no event of it came after (seq). Without one, the last item says it:
// an activity, or a permission answered with Allow right after one (the tool now runs). Codex's MCP startup lines are
// activities but no tool. A tool activity row may still spin while this says general.
export function turnStatus(items: readonly ThreadItem[], turn: TurnInfo | null, stage: StageSignal | null, root: string): TurnStatus {
  if (!turn || !turn.live || turn.ended) return { kind: "none" };
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

// What both hosts pass the thread: the last turn's status, its id and its start, which the elapsed time
// counts from. The id lets the thread drop the settle state of an earlier turn.
export interface ThreadTurn { turnId: string; status: TurnStatus; at: string }
export function threadTurn(events: readonly ConversationEvent[], items: readonly ThreadItem[], live: boolean, stage: StageSignal | null, root: string): ThreadTurn | null {
  const turn = turnOf(events, live);
  return turn ? { turnId: turn.turnId, status: turnStatus(items, turn, stage, root), at: turn.at } : null;
}

// Which stage to keep: within a turn the higher rev, since a read's reply and a push sent after it may
// arrive in either order (POSTMORTEM 2026-10-26). A stage of another turn than the history's current one is dropped;
// `current` is null while the history is not read.
export function newerStage(held: StageSignal | null, incoming: StageSignal, current: string | null): StageSignal | null {
  if (current !== null && incoming.turnId !== current) return held;
  if (held && held.turnId === incoming.turnId && held.rev >= incoming.rev) return held;
  return incoming;
}

// Settle: a new stage shows once it has held for 300 ms, so short tools between model requests do not
// flicker; one replaced sooner never shows. Replying, waiting and none show at once, and so does the first stage after
// none or waiting (spec condition 1: the indicator is there from the render the message enters, and again right after
// a card is answered). Every other change waits, replying back to general included.
export const SETTLE_MS = 300;
export interface Settled { shown: TurnStatus; pending: TurnStatus | null; since: number }
const hidden = (status: TurnStatus) => status.kind === "none" || status.kind === "waiting";
export const statusKey = (status: TurnStatus) => status.kind === "tool" ? `tool:${status.activity}:${status.text}` : status.kind;
// Nothing changed gives `previous` itself, so the thread can keep the result as state derived while it renders.
export function settle(previous: Settled | null, next: TurnStatus, now: number): Settled {
  const same = previous !== null && statusKey(next) === statusKey(previous.shown);
  if (same && !previous.pending) return previous;
  if (!previous || same || hidden(previous.shown) || hidden(next) || next.kind === "reply") return { shown: next, pending: null, since: now };
  if (previous.pending && statusKey(previous.pending) === statusKey(next)) {
    return now - previous.since >= SETTLE_MS ? { shown: next, pending: null, since: now } : previous;
  }
  return { shown: previous.shown, pending: next, since: now };
}

// Elapsed time in whole seconds, seconds always shown; an unreadable, negative or future span is 0s.
export function elapsedText(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// The indicator's words: the provider names only the stages without a tool.
export function turnText(status: TurnStatus, provider: string): string {
  switch (status.kind) {
    case "tool": return status.text;
    case "thinking": return `${provider} is thinking`;
    case "reply": return `${provider} is replying`;
    default: return `${provider} is working`;
  }
}
// The status text read to screen readers: the stage's kind only, never a path or the time, so it changes only when the
// kind does (spec condition 7). Hidden states say nothing here.
const TOOL_ANNOUNCEMENT = { read: "is reading files", edit: "is editing files", command: "is running a command", other: "is using a tool" } as const;
export function turnAnnouncement(status: TurnStatus, provider: string): string {
  if (hidden(status)) return "";
  return status.kind === "tool" ? `${provider} ${TOOL_ANNOUNCEMENT[status.activity]}` : turnText(status, provider);
}
