import type { Canvas, ConversationEvent, FailureCode, PermissionOption } from "../main/conversation/types";
import { splitRequest, type PresetRef } from "./homeComposer";

// A conversation's merged events (conversationStrip's mergeConversationEvents) as the thread draws them
// (buzz-conversation design §3.3). Every item has a key that stays the same while later events arrive.

// conversation.bound and conversation.restored are event types this feature adds on main (design §2.8). The renderer
// names them here so the thread can draw them before main's types include them.
type EventBase = { v: 1; conversationId: string; seq: number; turnId: string; at: string };
export type ThreadEvent = ConversationEvent | (EventBase & ({ type: "conversation.bound"; canvas: Canvas } | { type: "conversation.restored" }));

// The person's text in order, with each anchor token `{{n}}` kept where it was typed (spec decision 17).
export type MessagePart = { text: string } | { anchor: number };
export interface ActivityStep { key: string; kind: "edit" | "read" | "command" | "other"; verb: string; path: string | null }
export type TurnEnd = { kind: "failed"; code: FailureCode } | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" };
export type ThreadItem =
  | { kind: "user"; key: string; seq: number; parts: MessagePart[]; preset: PresetRef | null; attachments: { name: string; size: number; kind: "image" | "file" }[] }
  // `streaming`: more text may still come; a stopped or failed turn keeps what arrived and drops the caret.
  | { kind: "agent"; key: string; messageId: string; text: string; streaming: boolean }
  | { kind: "noReply"; key: string }
  // A run of activities folds into one line: the latest activity while it runs, "N steps" once the turn moved on.
  | { kind: "activity"; key: string; running: boolean; head: string; steps: ActivityStep[] }
  | { kind: "permission"; key: string; seq: number; requestId: string; summary: string; options: PermissionOption[]; status: "pending" | "answered" | "expired"; answer: string | null }
  | { kind: "end"; key: string; seq: number; end: TurnEnd }
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
  return { key: `s${event.seq}`, kind: event.kind, verb, path };
}
function runningHead(last: ActivityStep): string {
  if (last.kind === "command") return "Running a command";
  return (last.kind === "read" || last.kind === "edit") && last.path ? `${RUNNING_VERB[last.kind]} ${last.path}` : last.verb;
}
export const stepCount = (n: number) => n === 1 ? "1 step" : `${n} steps`;

export function threadItems(events: readonly ThreadEvent[], root: string): ThreadItem[] {
  const items: ThreadItem[] = [];
  const agents = new Map<string, Extract<ThreadItem, { kind: "agent" }>>();
  const permissions = new Map<string, Extract<ThreadItem, { kind: "permission" }>>();
  const ended = new Set<string>(), replied = new Set<string>();
  let turn: string | null = null, group: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string } | null = null;
  const groups: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string }[] = [];
  const turnOf = new Map<string, string>(), askTurn = new Map<string, string>();
  const endTurn = (turnId: string) => {
    ended.add(turnId);
    for (const message of agents.values()) if (message.streaming && turnOf.get(message.messageId) === turnId) message.streaming = false;
    for (const ask of permissions.values()) if (ask.status === "pending" && askTurn.get(ask.requestId) === turnId) ask.status = "expired";
  };
  const push = (item: ThreadItem) => { group = null; items.push(item); };

  for (const event of events) {
    switch (event.type) {
      case "conversation.archived": case "conversation.bound": case "conversation.restored":
        push({ kind: "marker", key: `k${event.seq}`, seq: event.seq, marker: event.type === "conversation.archived" ? "archived" : event.type === "conversation.bound" ? "bound" : "restored", canvas: event.type === "conversation.bound" ? event.canvas : null });
        continue;
      case "user.message": {
        const attachments = (event.attachments ?? []).map(a => ({ name: a.name, size: a.size, kind: a.kind }));
        const { preset, body } = splitRequest(event.text, attachments.length);
        push({ kind: "user", key: `u${event.seq}`, seq: event.seq, parts: anchorParts(body), preset, attachments });
        continue;
      }
      case "turn.started":
        // A new turn without an end before it was folded by a crash: what streamed stays without a caret.
        if (turn !== null && !ended.has(turn)) endTurn(turn);
        turn = event.turnId;
        continue;
    }
    // Nothing after a turn's end counts, as in main's fold.
    if (event.turnId !== turn || ended.has(event.turnId)) continue;
    switch (event.type) {
      case "message.delta": case "message.done": {
        const held = agents.get(event.messageId);
        replied.add(event.turnId);
        if (held) {
          held.text = event.type === "message.done" ? event.text : held.text + event.text;
          if (event.type === "message.done") held.streaming = false;
          group = null;
          break;
        }
        const item = { kind: "agent" as const, key: `m${event.messageId}`, messageId: event.messageId, text: event.text, streaming: event.type === "message.delta" };
        agents.set(event.messageId, item); turnOf.set(event.messageId, event.turnId);
        push(item);
        break;
      }
      case "activity": {
        const next = step(event, root);
        if (group && group.turnId === event.turnId) group.item.steps.push(next);
        else {
          const item = { kind: "activity" as const, key: `a${event.seq}`, running: false, head: "", steps: [next] };
          items.push(item);
          group = { item, turnId: event.turnId };
          groups.push(group);
        }
        break;
      }
      case "permission.request": {
        const item = { kind: "permission" as const, key: `p${event.requestId}`, seq: event.seq, requestId: event.requestId, summary: event.summary, options: event.options, status: "pending" as const, answer: null };
        permissions.set(event.requestId, item); askTurn.set(event.requestId, event.turnId);
        push(item);
        break;
      }
      case "permission.resolved": {
        const ask = permissions.get(event.requestId);
        if (ask) { ask.status = "answered"; ask.answer = ask.options.find(o => o.id === event.optionId)?.label ?? null; }
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
