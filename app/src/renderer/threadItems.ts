import type { Question, QuestionOutcome, StoredAnswer } from "../main/conversation/question";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent, FailureCode, FastUnusedReason, HandoffOrigin, PermissionOption } from "../main/conversation/types";
import { fastReason, splitRequest, type PresetRef } from "./homeComposer";
import { PRESETS } from "../main/mcpConnectors/presets";

// A conversation's merged events (conversationStrip's mergeConversationEvents) as the thread draws them.
// Every item has a key that stays the same while later events arrive.

// The person's text in order, with each anchor token `{{n}}` kept where it was typed.
export type MessagePart = { text: string } | { anchor: number };
// sentence: a step whose text is a sentence and wraps instead of staying on one line (Codex's MCP startup lines).
export interface ActivityStep { key: string; kind: "edit" | "read" | "command" | "other"; verb: string; path: string | null; sentence?: true }
// model: the model a model_unavailable end named.
// detail: a usage limit's provider wording, which may name when the limit resets.
export type TurnEnd = { kind: "failed"; code: FailureCode; model?: string; detail?: string } | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" };
export type ThreadItem =
  // anchors: the message's own, which its `{{n}}` parts point at (1-based), drawn as chips. `sending`: Send now has it
  // in flight and the history has no event for it yet (seq null).
  | { kind: "user"; key: string; seq: number | null; parts: MessagePart[]; anchors: readonly Anchor[]; preset: PresetRef | null; skills?: string[]; attachments: SentFile[]; sending?: true }
  // `streaming`: more text may still come; a stopped or failed turn keeps what arrived and drops the caret.
  | { kind: "agent"; key: string; messageId: string; text: string; streaming: boolean }
  | { kind: "noReply"; key: string }
  // A Claude turn that asked for Fast and did not run it: one line in the turn, under the reply.
  | { kind: "fast"; key: string; seq: number; text: string; turnedOff: boolean }
  // A run of activities folds into one line: "N steps", or the running tool's words while it is the running turn's last
  // item and the turn indicator names a tool (activityRun).
  | { kind: "activity"; key: string; running: boolean; head: string; steps: ActivityStep[] }
  | { kind: "permission"; key: string; seq: number; requestId: string; summary: string; options: PermissionOption[]; status: "pending" | "answered" | "expired"; answer: PermissionOption | null }
  // An agent's question. answers: what main kept of an answered one, by question id.
  | { kind: "question"; key: string; seq: number; requestId: string; questions: Question[]; status: "pending" | QuestionOutcome; answers: Record<string, StoredAnswer> | null }
  // seq is null for the end a crash-folded turn never wrote; its key is the turn's, so it stays when later turns arrive.
  | { kind: "end"; key: string; seq: number | null; end: TurnEnd }
  | { kind: "marker"; key: string; seq: number; marker: "bound" | "archived" | "restored"; canvas: Canvas | null }
  // A turn's handoff: the line sits where the request was made, and its resolution, which
  // comes after the turn's end, replaces it there. Keyed by the turn: one request per turn.
  | { kind: "handoff"; key: string; canvas: { path: string }; outcome: "pending" | "started" | "refused" | "cancelled"; target?: { conversationId: string; canvas: Canvas }; reason?: string }
  // A conversation a handoff started: its first message is the earlier agent's text, never the person's, so it is not
  // read for a preset line or {{n}} markers.
  | { kind: "handoffCard"; key: string; seq: number; origin: HandoffOrigin; text: string };

// A sent file or folder as its message recorded it; a folder's path is its tooltip.
export type SentFile = AttachmentRecord;
// A queued message Send now put into the running turn, as its request: the text with its preset line and `{{n}}`
// markers, the anchors those point at, and its files.
export interface SendingMessage { id: string; text: string; anchors: readonly Anchor[]; attachments: readonly SentFile[] }

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

// The reason is its own sentence (fastReason), so it never reads as a fragment of the lead.
export function fastUnusedText(event: { reason?: FastUnusedReason; turnedOff?: true }): string {
  const lead = event.turnedOff ? "Fast was turned off." : "Fast wasn’t used for this turn.";
  return event.reason ? `${lead} ${fastReason(event.reason)}` : lead;
}

const DONE_VERB = { read: "Read", edit: "Edited" } as const;
const RUNNING_VERB = { read: "Reading", edit: "Editing" } as const;
type ActivityEvent = Extract<ConversationEvent, { type: "activity" }>;

// A command's text is never shown, only that one ran (user decision 2026-10-30, transport.ts).
function step(event: ActivityEvent, root: string): ActivityStep {
  const path = event.path && (event.kind === "read" || event.kind === "edit") ? rootRelative(event.path, root) : null;
  const verb = event.kind === "command" ? "Ran a command" : event.kind === "other" || !path ? event.summary : DONE_VERB[event.kind];
  const sentence = event.kind === "other" && startupServers(event.summary) !== null;
  return { key: `s${event.seq}`, kind: event.kind, verb, path, ...(sentence ? { sentence: true as const } : {}) };
}
// Codex's MCP startup lines (main/conversation/mcpStartup.ts waitingLine and notReadyLine). History is append-only, so
// main writes the not-ready line after its Waiting line; the thread shows them as one step that changed its text.
const WAITING = /^Waiting for (.+)$/;
const NOT_READY = /^(.+) (?:wasn’t ready, so this turn started without it|weren’t ready, so this turn started without them)\.$/;
// What mcpStartup.ts names: a preset's label or a URL server's label, which is connectorLabel's URL host (presets.ts)
// of any URL parseConnectorUrl accepts: localhost, IPv6 literals, trailing dots and ports included. Joined
// "A, B and C". A name that is no such host ("the review") is not a startup line; a single word that is a valid host
// can't be told apart, which is safe because folding also needs a following not-ready line for the same servers.
const PRESET_LABELS = new Set(PRESETS.map(preset => preset.label));
function isServerLabel(name: string): boolean {
  if (PRESET_LABELS.has(name)) return true;
  if (!name || /[\s/?#@\\]/.test(name) || !URL.canParse(`https://${name}/`)) return false;
  return new URL(`https://${name}/`).host === name;
}
// main bounds both lines at 512 characters by cutting the server list (waitingLine slices the line, notReadyLine its
// list), so a line of that length may end in part of a server name, or in part of ", " / " and ".
const LINE_BOUND = 512;
interface StartupServers { kind: "waiting" | "notReady"; names: string[]; cut: string | null }
function startupServers(summary: string): StartupServers | null {
  const waiting = WAITING.exec(summary), notReady = waiting ? null : NOT_READY.exec(summary);
  const list = waiting?.[1] ?? notReady?.[1];
  if (!list) return null;
  const names = list.split(/, | and /);
  let cut: string | null = null;
  if (summary.length >= LINE_BOUND) {
    // Possibly cut: the last item is the start of a name (a host has no space or comma, so whatever follows one is a
    // separator's start). One name alone never reaches the bound (a host is at most a few hundred characters), so a
    // bounded line with no complete name before its cut is no startup line (an agent's own long "Waiting for …").
    cut = names.pop()!.split(/[ ,]/)[0]!;
    if (names.length === 0) return null;
  }
  return names.every(isServerLabel) ? { kind: waiting ? "waiting" : "notReady", names, cut: cut || null } : null;
}
// The not-ready line replaces the Waiting line it ends: the servers it names were all waited for (some of them may have
// become ready meanwhile). Complete names match exactly; a cut item matches the waited-for name it begins,
// so another server's line still stays apart.
function endsWaiting(previous: ActivityStep, next: ActivityStep): boolean {
  const before = previous.sentence ? startupServers(previous.verb) : null, after = next.sentence ? startupServers(next.verb) : null;
  if (before?.kind !== "waiting" || after?.kind !== "notReady") return false;
  const waited = (name: string) => before.names.includes(name) || (before.cut !== null && name.startsWith(before.cut));
  const begins = (start: string) => before.names.some(name => name.startsWith(start)) || (before.cut !== null && (before.cut.startsWith(start) || start.startsWith(before.cut)));
  return after.names.every(waited) && (after.cut === null || begins(after.cut));
}
export function runningHead(last: ActivityStep): string {
  if (last.kind === "command") return "Running a command";
  return (last.kind === "read" || last.kind === "edit") && last.path ? `${RUNNING_VERB[last.kind]} ${last.path}` : last.verb;
}
export const stepCount = (n: number) => n === 1 ? "1 step" : `${n} steps`;

// Whether two items hold the same data. threadItems builds new objects on every call, so the thread compares items by
// value to skip drawing unchanged ones; items hold plain data only (no functions, dates or class instances).
export function sameItem(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => Object.hasOwn(b, key) && sameItem((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

// `live`: main holds a turn of this conversation (the list summary's phase is not "ended", or live events arrive). A
// last turn without an end event while nothing is live was cut by a quit or crash: main never writes that end, its
// fold folds the turn (state.ts), and the thread shows it as stopped before it finished, as it does for a turn folded
// by the next turn.started.
export function threadItems(events: readonly ConversationEvent[], root: string, live: boolean): ThreadItem[] {
  const items: ThreadItem[] = [];
  const agents = new Map<string, Extract<ThreadItem, { kind: "agent" }>>();
  const permissions = new Map<string, Extract<ThreadItem, { kind: "permission" }>>();
  // Apart from permissions, as main's fold keeps them: a resolution settles only a request of its own kind.
  const questions = new Map<string, Extract<ThreadItem, { kind: "question" }>>();
  const ended = new Set<string>(), replied = new Set<string>();
  let turn: string | null = null, group: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string } | null = null;
  const groups: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string }[] = [];
  const turnOf = new Map<string, string>(), askTurn = new Map<string, string>();
  const handoffs = new Map<string, Extract<ThreadItem, { kind: "handoff" }>>();
  const endTurn = (turnId: string) => {
    ended.add(turnId);
    for (const [key, message] of agents) if (message.streaming && turnOf.get(key) === turnId) message.streaming = false;
    for (const ask of [...permissions.values(), ...questions.values()]) if (ask.status === "pending" && askTurn.get(`${ask.kind}:${ask.requestId}`) === turnId) ask.status = "expired";
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
        if (event.origin) { push({ kind: "handoffCard", key: `u${event.seq}`, seq: event.seq, origin: event.origin, text: event.text }); continue; }
        const attachments = (event.attachments ?? []).map((a): SentFile => a.kind === "directory" ? { name: a.name, kind: a.kind, path: a.path } : { name: a.name, size: a.size, kind: a.kind, path: a.path });
        const { preset, skills, body } = splitRequest(event.text, attachments.length);
        push({ kind: "user", key: `u${event.seq}`, seq: event.seq, parts: anchorParts(body), anchors: event.anchors, preset, ...(skills.length ? { skills } : {}), attachments });
        continue;
      }
      case "turn.started":
        // A new turn without an end before it: the previous one was folded by a quit or crash.
        if (turn !== null && !ended.has(turn)) foldCrashed(turn);
        turn = event.turnId;
        continue;
      // Written after the turn's end with the asking turn's id, and possibly after an archive marker.
      case "handoff.resolved": {
        const line = handoffs.get(event.turnId);
        if (line?.outcome !== "pending") continue;
        line.outcome = event.outcome;
        if (event.outcome === "started") line.target = event.target;
        if (event.outcome === "refused") line.reason = event.reason;
        continue;
      }
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
        if (previous && endsWaiting(previous, next)) group!.item.steps[group!.item.steps.length - 1] = next;
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
        permissions.set(event.requestId, item); askTurn.set(`permission:${event.requestId}`, event.turnId);
        push(item);
        break;
      }
      case "permission.resolved": {
        const ask = permissions.get(event.requestId);
        // "expired" is main's record of a request that ended unanswered (a Stop, a turn's end), never a choice.
        if (ask && event.optionId === "expired") { ask.status = "expired"; ask.answer = null; }
        else if (ask) { ask.status = "answered"; ask.answer = ask.options.find(o => o.id === event.optionId) ?? null; }
        break;
      }
      case "question.request": {
        const item = { kind: "question" as const, key: `Q${event.requestId}`, seq: event.seq, requestId: event.requestId, questions: event.questions, status: "pending" as Extract<ThreadItem, { kind: "question" }>["status"], answers: null as Record<string, StoredAnswer> | null };
        questions.set(event.requestId, item); askTurn.set(`question:${event.requestId}`, event.turnId);
        push(item);
        break;
      }
      case "question.resolved": {
        const ask = questions.get(event.requestId);
        if (ask?.status === "pending") { ask.status = event.outcome; ask.answers = event.answers ?? null; }
        break;
      }
      case "handoff.requested": {
        if (handoffs.has(event.turnId)) break;
        const item = { kind: "handoff" as const, key: `h${event.turnId}`, canvas: { path: event.canvas.path }, outcome: "pending" as Extract<ThreadItem, { kind: "handoff" }>["outcome"] };
        handoffs.set(event.turnId, item);
        push(item);
        break;
      }
      case "fast.unused":
        push({ kind: "fast", key: `f${event.seq}`, seq: event.seq, text: fastUnusedText(event), turnedOff: event.turnedOff === true });
        break;
      case "turn.done":
        endTurn(event.turnId);
        if (!replied.has(event.turnId)) push({ kind: "noReply", key: `n${event.seq}` });
        break;
      case "turn.failed":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "failed", code: event.code, ...(event.model !== undefined ? { model: event.model } : {}), ...(event.code === "rate_limited" && event.detail !== undefined ? { detail: event.detail } : {}) } });
        break;
      case "interrupted":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "interrupted", reason: event.reason } });
        break;
    }
  }
  if (!live && turn !== null && !ended.has(turn)) foldCrashed(turn);
  // Nothing judges a request once main holds nothing of this conversation (main's fold: a restart's cancel).
  if (!live) for (const line of handoffs.values()) if (line.outcome === "pending") line.outcome = "cancelled";
  // Whether the thread's last row runs is the turn indicator's to say (turnStatus activityRun), not the events': an
  // activity marks a tool's start or end, never both.
  for (const { item } of groups) item.head = stepCount(item.steps.length);
  return items;
}

// Messages Send now has in flight, as the person's messages after the history in press order.
// An open permission request or question stays last, so they sit right above the first one still waiting. The history
// has no event for them until the agent reads one; main writes that event before it answers Send now, so for a
// moment both may show.
export function withSending(items: ThreadItem[], sending: readonly SendingMessage[]): ThreadItem[] {
  if (sending.length === 0) return items;
  const messages = sending.map((message): ThreadItem => {
    const { preset, skills, body } = splitRequest(message.text, message.attachments.length);
    return { kind: "user", key: `q${message.id}`, seq: null, sending: true, parts: anchorParts(body), anchors: message.anchors, preset, ...(skills.length ? { skills } : {}), attachments: [...message.attachments] };
  });
  const ask = items.findIndex(waitsForPerson);
  const at = ask === -1 ? items.length : ask;
  return [...items.slice(0, at), ...messages, ...items.slice(at)];
}

// A permission request or a question still waiting for the person.
export function waitsForPerson(item: ThreadItem): item is Extract<ThreadItem, { kind: "permission" | "question" }> {
  return (item.kind === "permission" || item.kind === "question") && item.status === "pending";
}
// The open requests in arrival order, for where focus goes after one is answered (composerRules.focusAfter).
export function pendingAsks(items: readonly ThreadItem[]): { requestId: string; key: string }[] {
  return items.filter(waitsForPerson).map(item => ({ requestId: item.requestId, key: item.key }));
}

// A finished question's folded lines: one per answered question, one per skipped or expired request. A
// question without a header (Antigravity's) names itself by its sentence; a secret answer is never shown.
export function questionLines(item: Extract<ThreadItem, { kind: "question" }>): string[] {
  const name = (question: Question) => question.header || question.question;
  if (item.status === "skipped" || item.status === "expired") return [`${item.status === "skipped" ? "Skipped" : "Expired without an answer"} · ${item.questions.map(name).join(", ")}`];
  return item.questions.map(question => {
    const answer = item.answers?.[question.id];
    const text = answer && !question.secret ? [...answer.selected, ...(answer.other ? [answer.other] : [])].join(", ") : "";
    return text ? `Answered · ${name(question)}: ${text}` : `Answered · ${name(question)}`;
  });
}

export const FOLLOW_DISTANCE = 24;
// The thread opens at the bottom and follows new output only while it is within 24px of the bottom; scrolled further
// up, it stays and offers Jump to latest.
export function scrollFollow(opening: boolean, distanceFromBottom: number): boolean {
  return opening || distanceFromBottom <= FOLLOW_DISTANCE;
}
// After an update: drew says whether the thread's height changed. The thread re-renders without new output (every
// list read, every tick), and following then would undo an entry's scroll to a question card before the scroll event
// that measures it arrives.
export function threadScroll(opening: boolean, drew: boolean, distanceFromBottom: number): "bottom" | "behind" | "stay" {
  if (!opening && !drew) return "stay";
  return scrollFollow(opening, distanceFromBottom) ? "bottom" : "behind";
}
