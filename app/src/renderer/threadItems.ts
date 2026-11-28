import type { Question, QuestionOutcome, StoredAnswer } from "../main/conversation/question";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent, EditLines, FailureCode, FastUnusedReason, HandoffOrigin, PermissionOption } from "../main/conversation/types";
import { fastReason, splitRequest, type PresetRef } from "./homeComposer";
import { boundaryLabel, type ThreadCommands } from "./commandView";
import { PRESETS } from "../main/mcpConnectors/presets";
import { stepCount } from "./editLinesLabel";

// Every item has a key that stays the same while later events arrive.

export type MessagePart = { text: string } | { anchor: number };
// sentence: wraps instead of staying on one line (Codex's MCP startup lines). lines: absent until the edit's
// activity.result arrives.
export interface ActivityStep { key: string; kind: "edit" | "read" | "command" | "other"; verb: string; path: string | null; sentence?: true; lines?: EditLines }
// detail: a usage limit's provider wording, which may name when the limit resets.
export type TurnEnd = { kind: "failed"; code: FailureCode; model?: string; detail?: string } | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" };
export type ThreadItem =
  // `{{n}}` parts point at `anchors` (1-based). `sending`: Send now has it in flight and the history has no event for
  // it yet (seq null).
  | { kind: "user"; key: string; seq: number | null; parts: MessagePart[]; anchors: readonly Anchor[]; preset: PresetRef | null; skills?: string[]; attachments: SentFile[]; sending?: true }
  // A stopped or failed turn keeps what arrived and drops the caret.
  | { kind: "agent"; key: string; messageId: string; text: string; streaming: boolean }
  | { kind: "noReply"; key: string }
  | { kind: "fast"; key: string; seq: number; text: string; turnedOff: boolean }
  // head: "N steps", or the tool's words while this is the running turn's last item and the indicator names a tool
  // (activityRun). total: the known counts' sum, never on a running head.
  | { kind: "activity"; key: string; running: boolean; head: string; total?: EditLines; steps: ActivityStep[] }
  | { kind: "permission"; key: string; seq: number; requestId: string; summary: string; reason?: string; options: PermissionOption[]; status: "pending" | "answered" | "expired"; answer: PermissionOption | null }
  // answers: what main kept of an answered one, by question id.
  | { kind: "question"; key: string; seq: number; requestId: string; questions: Question[]; status: "pending" | QuestionOutcome; answers: Record<string, StoredAnswer> | null }
  // seq is null for the end a crash-folded turn never wrote; its key is the turn's, so it stays when later turns arrive.
  | { kind: "end"; key: string; seq: number | null; end: TurnEnd }
  | { kind: "marker"; key: string; seq: number; marker: "bound"; canvas: Canvas }
  // "missed": a new canvas the turn edited and asked no handoff for. The key is the turn's and the path's, so the card
  // stays the same element through every status.
  | { kind: "canvasCard"; key: string; canvas: Canvas; drawing: boolean; drawn: boolean; handoff?: CardHandoff }
  // A handoff's first message is the earlier agent's text, never the person's, so it is not read for a preset line
  // or {{n}} markers.
  | { kind: "handoffCard"; key: string; seq: number; origin: HandoffOrigin; text: string; at: string }
  // After a /compact or /clear turn that ran.
  | { kind: "boundary"; key: string; label: string };

// via: only a send's card has it.
export type CardHandoff = ({ outcome: "pending" | "cancelled" | "missed" } | { outcome: "started"; target: { conversationId: string; canvas: Canvas } }
  | { outcome: "sent"; target: { conversationId: string; canvas: Canvas }; queued: boolean } | { outcome: "refused"; reason: string }) & { via?: "send" };
type CanvasCard = Extract<ThreadItem, { kind: "canvasCard" }>;

export type SentFile = AttachmentRecord;
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

// The agent sends absolute, relative, ./ or .. paths; one outside the root stays absolute. /tmp and /private/tmp name
// the same folder on macOS.
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

// A command's text is never shown, only that one ran (transport.ts).
function step(event: ActivityEvent, root: string): ActivityStep {
  const path = event.path && (event.kind === "read" || event.kind === "edit") ? rootRelative(event.path, root) : null;
  const verb = event.kind === "command" ? "Ran a command" : event.kind === "other" || !path ? event.summary : DONE_VERB[event.kind];
  const sentence = event.kind === "other" && startupServers(event.summary) !== null;
  return { key: `s${event.seq}`, kind: event.kind, verb, path, ...(sentence ? { sentence: true as const } : {}) };
}
// Codex's MCP startup lines (main/conversation/mcpStartup.ts). History is append-only, so main writes the not-ready
// line after its Waiting line; the thread shows them as one step.
const WAITING = /^Waiting for (.+)$/;
const NOT_READY = /^(.+) (?:wasn’t ready, so this turn started without it|weren’t ready, so this turn started without them)\.$/;
// connectorLabel's host of any URL parseConnectorUrl accepts. A single word that is a valid host can't be told apart,
// which is safe because folding also needs a following not-ready line for the same servers.
const PRESET_LABELS = new Set(PRESETS.map(preset => preset.label));
function isServerLabel(name: string): boolean {
  if (PRESET_LABELS.has(name)) return true;
  if (!name || /[\s/?#@\\]/.test(name) || !URL.canParse(`https://${name}/`)) return false;
  return new URL(`https://${name}/`).host === name;
}
// main bounds both lines at 512 characters by cutting the server list, so a line of that length may end in part of a
// server name or separator.
const LINE_BOUND = 512;
interface StartupServers { kind: "waiting" | "notReady"; names: string[]; cut: string | null }
function startupServers(summary: string): StartupServers | null {
  const waiting = WAITING.exec(summary), notReady = waiting ? null : NOT_READY.exec(summary);
  const list = waiting?.[1] ?? notReady?.[1];
  if (!list) return null;
  const names = list.split(/, | and /);
  let cut: string | null = null;
  if (summary.length >= LINE_BOUND) {
    // A host has no space or comma, so whatever follows one is a separator's start. One name alone never reaches the
    // bound, so a bounded line with no complete name before its cut is no startup line.
    cut = names.pop()!.split(/[ ,]/)[0]!;
    if (names.length === 0) return null;
  }
  return names.every(isServerLabel) ? { kind: waiting ? "waiting" : "notReady", names, cut: cut || null } : null;
}
// A cut item matches the waited-for name it begins, so another server's line still stays apart.
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
// Re-exported where turnStatus.ts reads it; it lives beside the head's accessible name.
export { stepCount };
export function countHead(steps: readonly ActivityStep[]): { head: string; total?: EditLines } {
  const known = steps.flatMap(step => step.lines ? [step.lines] : []);
  if (known.length === 0) return { head: stepCount(steps.length) };
  return { head: stepCount(steps.length), total: { added: known.reduce((n, l) => n + l.added, 0), removed: known.reduce((n, l) => n + l.removed, 0) } };
}

// threadItems builds new objects on every call, so the thread compares by value; items hold plain data only (no
// functions, dates or class instances).
export function sameItem(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => Object.hasOwn(b, key) && sameItem((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

// A last turn without an end while nothing is live was cut by a quit or crash: main never writes that end, so the
// thread shows it as stopped. A turn with a boundary draws it in place of No reply.
export function threadItems(events: readonly ConversationEvent[], root: string, live: boolean, commands?: ThreadCommands): ThreadItem[] {
  const items: ThreadItem[] = [];
  const opened = new Set<string>();
  const agents = new Map<string, Extract<ThreadItem, { kind: "agent" }>>();
  // By turn and request id: a new Codex app-server numbers its requests from 0 again, so ids repeat across turns.
  const permissions = new Map<string, Extract<ThreadItem, { kind: "permission" }>>();
  // Apart from permissions, as main's fold keeps them: a resolution settles only a request of its own kind.
  const questions = new Map<string, Extract<ThreadItem, { kind: "question" }>>();
  const ended = new Set<string>(), replied = new Set<string>();
  let turn: string | null = null, group: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string } | null = null;
  const groups: { item: Extract<ThreadItem, { kind: "activity" }>; turnId: string }[] = [];
  // askTurn: each request card's turn, by the card's key.
  const turnOf = new Map<string, string>(), askTurn = new Map<string, string>();
  // Keyed by call and the activity's stored path, never the root-relative path a step shows.
  const edits = new Map<string, { step: ActivityStep; path: string | undefined }[]>();
  // canvas.drawn and handoff.missed can come after the turn's end, even after the next message, so a card goes by its
  // turn, not by its arrival, and never closes the activity group still open.
  const cards = new Map<string, CanvasCard>(), turnCards = new Map<string, CanvasCard[]>();
  const card = (turnId: string, canvas: Canvas): CanvasCard => {
    const id = `${turnId}:${canvas.path}`, held = cards.get(id);
    // The ID judges a later rename; a request's path alone lacks it.
    if (held) { if (canvas.id !== undefined && held.canvas.id === undefined) held.canvas = canvas; return held; }
    const item: CanvasCard = { kind: "canvasCard", key: `c${id}`, canvas, drawing: false, drawn: false };
    cards.set(id, item); turnCards.set(turnId, [...(turnCards.get(turnId) ?? []), item]);
    return item;
  };
  const lastOf = new Map<string, ThreadItem>();
  const endTurn = (turnId: string) => {
    ended.add(turnId);
    for (const [key, message] of agents) if (message.streaming && turnOf.get(key) === turnId) message.streaming = false;
    for (const ask of [...permissions.values(), ...questions.values()]) if (ask.status === "pending" && askTurn.get(ask.key) === turnId) ask.status = "expired";
  };
  const push = (item: ThreadItem, turnId?: string) => { group = null; items.push(item); if (turnId !== undefined) lastOf.set(turnId, item); };
  const foldCrashed = (turnId: string) => {
    endTurn(turnId);
    push({ kind: "end", key: `x${turnId}`, seq: null, end: { kind: "interrupted", reason: "crashed" } }, turnId);
  };

  for (const event of events) {
    switch (event.type) {
      case "conversation.bound":
        push({ kind: "marker", key: `k${event.seq}`, seq: event.seq, marker: "bound", canvas: event.canvas });
        continue;
      // An earlier build's archive and restore lines: nothing is archived any more, so they draw nothing.
      case "conversation.archived": case "conversation.restored": continue;
      case "user.message": {
        // The next turn's message comes before its turn.started: an unfinished turn before it was folded.
        if (turn !== null && event.turnId !== turn && !ended.has(turn)) foldCrashed(turn);
        if (event.origin) { push({ kind: "handoffCard", key: `u${event.seq}`, seq: event.seq, origin: event.origin, text: event.text, at: event.at }, event.turnId); continue; }
        const attachments = (event.attachments ?? []).map((a): SentFile => a.kind === "directory" ? { name: a.name, kind: a.kind, path: a.path } : { name: a.name, size: a.size, kind: a.kind, path: a.path, ...(a.lines === undefined ? {} : { lines: a.lines }), ...(a.excerpt === undefined ? {} : { excerpt: a.excerpt }) });
        const { preset, skills, body } = splitRequest(event.text, attachments.length);
        const first = !opened.has(event.turnId);
        opened.add(event.turnId);
        const command = first && commands?.turns.has(event.turnId) ? /^\/(\S+)/.exec(body)?.[1] : undefined;
        if (command !== undefined) skills.push(command);
        push({ kind: "user", key: `u${event.seq}`, seq: event.seq, parts: anchorParts(body), anchors: event.anchors, preset, ...(skills.length ? { skills } : {}), attachments }, event.turnId);
        continue;
      }
      case "turn.started":
        // A new turn without an end before it: the previous one was folded by a quit or crash.
        if (turn !== null && !ended.has(turn)) foldCrashed(turn);
        turn = event.turnId;
        continue;
      // Written after the turn's end with the asking turn's id. One without a path (written before a turn could request
      // several) settles the turn's only requested card.
      case "handoff.resolved": {
        const asked = (turnCards.get(event.turnId) ?? []).filter(item => item.handoff);
        const item = event.canvas ? cards.get(`${event.turnId}:${event.canvas.path}`) : asked.length === 1 ? asked[0] : undefined;
        if (item?.handoff?.outcome !== "pending") continue;
        const send = item.handoff.via === "send" || event.via === "send" ? { via: "send" as const } : {};
        item.handoff = event.outcome === "started" ? { outcome: "started", target: event.target, ...send } : event.outcome === "sent" ? { outcome: "sent", target: event.target, queued: event.queued, ...send }
          : event.outcome === "refused" ? { outcome: "refused", reason: event.reason, ...send } : { outcome: event.outcome, ...send };
        continue;
      }
      case "handoff.missed": {
        const item = card(event.turnId, event.canvas);
        if (!item.handoff) item.handoff = { outcome: "missed" };
        continue;
      }
      // Written while the turn runs or up to main's settle deadline after its end.
      case "canvas.drawn":
        card(event.turnId, event.canvas).drawn = true;
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
        push(item, event.turnId);
        break;
      }
      case "activity": {
        const next = step(event, root);
        if (event.kind === "edit" && event.callId !== undefined) {
          const id = `${event.turnId}\0${event.callId}`;
          edits.set(id, [...(edits.get(id) ?? []), { step: next, path: event.path }]);
        }
        const previous = group?.turnId === event.turnId ? group.item.steps.at(-1) : undefined;
        if (previous && endsWaiting(previous, next)) group!.item.steps[group!.item.steps.length - 1] = next;
        else if (group && group.turnId === event.turnId) group.item.steps.push(next);
        else {
          const item = { kind: "activity" as const, key: `a${event.seq}`, running: false, head: "", steps: [next] };
          items.push(item); lastOf.set(event.turnId, item);
          group = { item, turnId: event.turnId };
          groups.push(group);
        }
        break;
      }
      // Same-key results add up: an ACP call may report a path's removal and rewrite apart.
      case "activity.result": {
        const target = edits.get(`${event.turnId}\0${event.callId}`)?.find(edit => edit.path === event.path)?.step;
        if (target) target.lines = { added: (target.lines?.added ?? 0) + event.lines.added, removed: (target.lines?.removed ?? 0) + event.lines.removed };
        break;
      }
      case "permission.request": {
        const item = { kind: "permission" as const, key: `p${event.turnId}:${event.requestId}`, seq: event.seq, requestId: event.requestId, summary: event.summary, ...(event.reason ? { reason: event.reason } : {}), options: event.options, status: "pending" as const, answer: null as PermissionOption | null };
        permissions.set(`${event.turnId}\0${event.requestId}`, item); askTurn.set(item.key, event.turnId);
        push(item, event.turnId);
        break;
      }
      case "permission.resolved": {
        const ask = permissions.get(`${event.turnId}\0${event.requestId}`);
        // "expired" is main's record of a request that ended unanswered (a Stop, a turn's end), never a choice.
        if (ask && event.optionId === "expired") { ask.status = "expired"; ask.answer = null; }
        else if (ask) { ask.status = "answered"; ask.answer = ask.options.find(o => o.id === event.optionId) ?? null; }
        break;
      }
      case "question.request": {
        const item = { kind: "question" as const, key: `Q${event.requestId}`, seq: event.seq, requestId: event.requestId, questions: event.questions, status: "pending" as Extract<ThreadItem, { kind: "question" }>["status"], answers: null as Record<string, StoredAnswer> | null };
        questions.set(event.requestId, item); askTurn.set(item.key, event.turnId);
        push(item, event.turnId);
        break;
      }
      case "question.resolved": {
        const ask = questions.get(event.requestId);
        if (ask?.status === "pending") { ask.status = event.outcome; ask.answers = event.answers ?? null; }
        break;
      }
      case "handoff.requested": {
        const item = card(event.turnId, { path: event.canvas.path });
        if (!item.handoff) item.handoff = { outcome: "pending", ...(event.via === "send" ? { via: "send" as const } : {}) };
        break;
      }
      case "fast.unused":
        push({ kind: "fast", key: `f${event.seq}`, seq: event.seq, text: fastUnusedText(event), turnedOff: event.turnedOff === true }, event.turnId);
        break;
      case "turn.done": {
        endTurn(event.turnId);
        const boundary = commands?.turns.has(event.turnId) ? commands.boundaries.get(event.turnId) : undefined;
        if (boundary) push({ kind: "boundary", key: `b${event.turnId}`, label: boundaryLabel(boundary) }, event.turnId);
        else if (!replied.has(event.turnId)) push({ kind: "noReply", key: `n${event.seq}` }, event.turnId);
        break;
      }
      case "turn.failed":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "failed", code: event.code, ...(event.model !== undefined ? { model: event.model } : {}), ...(event.code === "rate_limited" && event.detail !== undefined ? { detail: event.detail } : {}) } }, event.turnId);
        break;
      case "interrupted":
        endTurn(event.turnId);
        push({ kind: "end", key: `e${event.seq}`, seq: event.seq, end: { kind: "interrupted", reason: event.reason } }, event.turnId);
        break;
    }
  }
  if (!live && turn !== null && !ended.has(turn)) foldCrashed(turn);
  for (const [turnId, list] of turnCards) for (const item of list) {
    item.drawing = turnId === turn && !ended.has(turnId);
    // Nothing judges a request once main holds nothing of this conversation (main's fold: a restart's cancel).
    if (!live && item.handoff?.outcome === "pending") item.handoff = { outcome: "cancelled", ...(item.handoff.via ? { via: item.handoff.via } : {}) };
  }
  // The turn indicator says whether the last row runs (turnStatus activityRun): an activity marks a tool's start or
  // end, never both.
  for (const { item } of groups) Object.assign(item, countHead(item.steps));
  return placeCards(items, turnCards, lastOf, askTurn);
}

// While a request of the running turn waits, they go right above it, so Send now's messages come after them and the
// request stays last.
function placeCards(items: ThreadItem[], turnCards: ReadonlyMap<string, CanvasCard[]>, lastOf: ReadonlyMap<string, ThreadItem>, askTurn: ReadonlyMap<string, string>): ThreadItem[] {
  if (turnCards.size === 0) return items;
  const before = new Map<ThreadItem, CanvasCard[]>(), after = new Map<ThreadItem, CanvasCard[]>(), rest: CanvasCard[] = [];
  for (const [turnId, list] of turnCards) {
    const ask = items.find(item => waitsForPerson(item) && askTurn.get(item.key) === turnId);
    const last = lastOf.get(turnId);
    if (ask) before.set(ask, list);
    else if (last) after.set(last, list);
    else rest.push(...list);
  }
  return [...items.flatMap(item => [...(before.get(item) ?? []), item, ...(after.get(item) ?? [])]), ...rest];
}

// An open request stays last, so they sit right above the first one still waiting. main writes the history event
// before it answers Send now, so for a moment both may show.
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

export function waitsForPerson(item: ThreadItem): item is Extract<ThreadItem, { kind: "permission" | "question" }> {
  return (item.kind === "permission" || item.kind === "question") && item.status === "pending";
}
// For where focus goes after one is answered (composerRules.focusAfter).
export function pendingAsks(items: readonly ThreadItem[]): { requestId: string; key: string }[] {
  return items.filter(waitsForPerson).map(item => ({ requestId: item.requestId, key: item.key }));
}

// A question without a header (Antigravity's) names itself by its sentence; a secret answer is never shown.
export function questionLines(item: Extract<ThreadItem, { kind: "question" }>): string[] {
  const name = (question: Question) => question.header || question.question;
  if (item.status === "skipped" || item.status === "expired") return [`${item.status === "skipped" ? "Skipped" : "Expired without an answer"} · ${item.questions.map(name).join(", ")}`];
  return item.questions.map(question => {
    const answer = item.answers?.[question.id];
    const text = answer && !question.secret ? [...answer.selected, ...(answer.other ? [answer.other] : [])].join(", ") : "";
    return text ? `Answered · ${name(question)}: ${text}` : `Answered · ${name(question)}`;
  });
}

// Whether a scroll back within the follow band (threadMotion followBand) takes Jump to latest away.
export function scrollFollow(distanceFromBottom: number, band: number): boolean {
  return distanceFromBottom <= band;
}
