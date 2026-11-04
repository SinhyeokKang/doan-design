import type { Anchor, Canvas, ConversationEvent, FailureCode, PermissionOption } from "../main/conversation/types";
import { splitRequest, type PresetRef } from "./homeComposer";

// A conversation's merged events (conversationStrip's mergeConversationEvents) as the thread draws them
// (buzz-conversation design §3.3). Every item has a key that stays the same while later events arrive.

// The person's text in order, with each anchor token `{{n}}` kept where it was typed (spec decision 17).
export type MessagePart = { text: string } | { anchor: number };
// sentence: a step whose text is a sentence and wraps instead of staying on one line (Codex's MCP startup lines).
export interface ActivityStep { key: string; kind: "edit" | "read" | "command" | "other"; verb: string; path: string | null; sentence?: true }
export type TurnEnd = { kind: "failed"; code: FailureCode } | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" };
export type ThreadItem =
  // anchors: the message's own, which its `{{n}}` parts point at (1-based), drawn as chips.
  | { kind: "user"; key: string; seq: number; parts: MessagePart[]; anchors: readonly Anchor[]; preset: PresetRef | null; attachments: { name: string; size: number; kind: "image" | "file" }[] }
  // `streaming`: more text may still come; a stopped or failed turn keeps what arrived and drops the caret.
  | { kind: "agent"; key: string; messageId: string; text: string; streaming: boolean }
  | { kind: "noReply"; key: string }
  // A run of activities folds into one line: the latest activity while it runs, "N steps" once the turn moved on.
  | { kind: "activity"; key: string; running: boolean; head: string; steps: ActivityStep[] }
  | { kind: "permission"; key: string; seq: number; requestId: string; summary: string; options: PermissionOption[]; status: "pending" | "answered" | "expired"; answer: PermissionOption | null }
  // seq is null for the end a crash-folded turn never wrote; its key is the turn's, so it stays when later turns arrive.
  | { kind: "end"; key: string; seq: number | null; end: TurnEnd }
  | { kind: "marker"; key: string; seq: number; marker: "bound" | "archived" | "restored"; canvas: Canvas | null };

export function anchorParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let at = 0;
  for (const match of text.matchAll(/\{\{([1-9][0-9]*)\}\}/g)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push({ anchor: Number(match[1]) });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

// Paths in activity events are what the agent sent: absolute, relative, with ./ or .. segments. Steps show them
// relative to the project root; a path outside it stays absolute. /tmp and /private/tmp name the same folder on macOS.
export function rootRelative(path: string, root: string): string {
  const normal = (value: string) => {
    const out: string[] = [];
    for (const part of value.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop(); else out.push(part);
    }
    return out;
  };
  const target = normal(path.startsWith("/") ? path : `${root}/${path}`);
  const roots = [root, root.startsWith("/private/") ? root.slice("/private".length) : `/private${root}`].map(normal);
  for (const base of roots) if (base.length <= target.length && base.every((part, i) => target[i] === part)) return target.slice(base.length).join("/") || ".";
  return `/${target.join("/")}`;
}

const DONE_VERB = { read: "Read", edit: "Edited" } as const;
const RUNNING_VERB = { read: "Reading", edit: "Editing" } as const;
type ActivityEvent = Extract<ConversationEvent, { type: "activity" }>;

// A command's text is never shown, only that one ran (user decision 2026-10-30, transport.ts).
function step(event: ActivityEvent, root: string): ActivityStep {
  const path = event.path && (event.kind === "read" || event.kind === "edit") ? rootRelative(event.path, root) : null;
  const verb = event.kind === "command" ? "Ran a command" : event.kind === "other" || !path ? event.summary : DONE_VERB[event.kind];
  const sentence = event.kind === "other" && (WAITING.test(event.summary) || NOT_READY.test(event.summary));
  return { key: `s${event.seq}`, kind: event.kind, verb, path, ...(sentence ? { sentence: true as const } : {}) };
}
// Codex's MCP startup lines (main/conversation/mcpStartup.ts waitingLine and notReadyLine). History is append-only, so
// main writes the not-ready line after its Waiting line; the thread shows them as one step that changed its text
// (mcp-connectors spec 6).
const WAITING = /^Waiting for \S/;
const NOT_READY = / (?:wasn’t ready, so this turn started without it|weren’t ready, so this turn started without them)\.$/;
function runningHead(last: ActivityStep): string {
  if (last.kind === "command") return "Running a command";
  return (last.kind === "read" || last.kind === "edit") && last.path ? `${RUNNING_VERB[last.kind]} ${last.path}` : last.verb;
}
export const stepCount = (n: number) => n === 1 ? "1 step" : `${n} steps`;

// `live`: main holds a turn of this conversation (the list summary's phase is not "ended", or live events arrive). A
// last turn without an end event while nothing is live was cut by a quit or crash: main never writes that end, its
// fold folds the turn (state.ts), and the thread shows it as stopped before it finished, as it does for a turn folded
// by the next turn.started.
export function threadItems(events: readonly ConversationEvent[], root: string, live: boolean): ThreadItem[] {
  const items: ThreadItem[] = [];
  const agents = new Map<string, Extract<ThreadItem, { kind: "agent" }>>();
  const permissions = new Map<string, Extract<ThreadItem, { kind: "permission" }>>();
  const ended = new Set<string>(), replied = new Set<string>();
  let turn: string | null = null, group: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string } | null = null;
  const groups: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string }[] = [];
  const turnOf = new Map<string, string>(), askTurn = new Map<string, string>();
  const endTurn = (turnId: string) => {
    ended.add(turnId);
    for (const [key, message] of agents) if (message.streaming && turnOf.get(key) === turnId) message.streaming = false;
    for (const ask of permissions.values()) if (ask.status === "pending" && askTurn.get(ask.requestId) === turnId) ask.status = "expired";
  };
  const push = (item: ThreadItem) => { group = null; items.push(item); };
  const foldCrashed = (turnId: string) => {
    endTurn(turnId);
    push({ kind: "end", key: `x${turnId}`, seq: null, end: { kind: "interrupted", reason: "crashed" } });
  };

  for (const event of events) {
    switch (event.type) {
      case "conversation.archived": case "conversation.bound": case "conversation.restored":
        push({ kind: "marker", key: `k${event.seq}`, seq: event.seq, marker: event.type === "conversation.archived" ? "archived" : event.type === "conversation.bound" ? "bound" : "restored", canvas: event.type === "conversation.bound" ? event.canvas : null });
        continue;
      case "user.message": {
        // The next turn's message comes before its turn.started: an unfinished turn before it was folded.
        if (turn !== null && event.turnId !== turn && !ended.has(turn)) foldCrashed(turn);
        const attachments = (event.attachments ?? []).map(a => ({ name: a.name, size: a.size, kind: a.kind }));
        const { preset, body } = splitRequest(event.text, attachments.length);
        push({ kind: "user", key: `u${event.seq}`, seq: event.seq, parts: anchorParts(body), anchors: event.anchors, preset, attachments });
        continue;
      }
      case "turn.started":
        // A new turn without an end before it: the previous one was folded by a quit or crash.
        if (turn !== null && !ended.has(turn)) foldCrashed(turn);
        turn = event.turnId;
        continue;
    }
    // Nothing after a turn's end counts, as in main's fold.
    if (event.turnId !== turn || ended.has(event.turnId)) continue;
    switch (event.type) {
      case "message.delta": case "message.done": {
        // Message ids repeat across turns (Claude's default "assistant", transport.ts), so a message is keyed by its turn.
        const key = `${event.turnId}:${event.messageId}`, held = agents.get(key);
        replied.add(event.turnId);
        if (held) {
          // Text after message.done does not count, as in main's fold.
          if (!held.streaming && event.type === "message.delta") break;
          held.text = event.type === "message.done" ? event.text : held.text + event.text;
          if (event.type === "message.done") held.streaming = false;
          group = null;
          break;
        }
        const item = { kind: "agent" as const, key: `m${key}`, messageId: event.messageId, text: event.text, streaming: event.type === "message.delta" };
        agents.set(key, item); turnOf.set(key, event.turnId);
        push(item);
        break;
      }
      case "activity": {
        const next = step(event, root);
        const previous = group?.turnId === event.turnId ? group.item.steps.at(-1) : undefined;
        if (previous?.sentence && NOT_READY.test(next.verb) && WAITING.test(previous.verb)) group!.item.steps[group!.item.steps.length - 1] = next;
        else if (group && group.turnId === event.turnId) group.item.steps.push(next);
        else {
          const item = { kind: "activity" as const, key: `a${event.seq}`, running: false, head: "", steps: [next] };
          items.push(item);
          group = { item, turnId: event.turnId };
          groups.push(group);
        }
        break;
      }
      case "permission.request": {
        const item = { kind: "permission" as const, key: `p${event.requestId}`, seq: event.seq, requestId: event.requestId, summary: event.summary, options: event.options, status: "pending" as const, answer: null as PermissionOption | null };
        permissions.set(event.requestId, item); askTurn.set(event.requestId, event.turnId);
        push(item);
        break;
      }
      case "permission.resolved": {
        const ask = permissions.get(event.requestId);
        if (ask) { ask.status = "answered"; ask.answer = ask.options.find(o => o.id === event.optionId) ?? null; }
        break;
      }
      case "turn.done":
        endTurn(event.turnId);
        if (!replied.has(event.turnId)) push({ kind: "noReply", key: `n${event.seq}` });
        break;
      case "turn.failed":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "failed", code: event.code } });
        break;
      case "interrupted":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "interrupted", reason: event.reason } });
        break;
    }
  }
  if (!live && turn !== null && !ended.has(turn)) foldCrashed(turn);
  const last = items.at(-1);
  for (const { item, turnId } of groups) {
    item.running = item === last && !ended.has(turnId);
    item.head = item.running ? runningHead(item.steps.at(-1)!) : stepCount(item.steps.length);
    // A command still running reads as running in its own row too.
    if (item.running && item.steps.at(-1)!.kind === "command") item.steps[item.steps.length - 1] = { ...item.steps.at(-1)!, verb: "Running a command" };
  }
  return items;
}

export const FOLLOW_DISTANCE = 24;
// The thread opens at the bottom and follows new output only while it is within 24px of the bottom; scrolled further
// up, it stays and offers Jump to latest (design §3.3).
export function scrollFollow(opening: boolean, distanceFromBottom: number): boolean {
  return opening || distanceFromBottom <= FOLLOW_DISTANCE;
}
