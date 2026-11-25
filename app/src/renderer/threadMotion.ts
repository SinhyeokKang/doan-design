import { splitRequest } from "./homeComposer";
import { FOLLOW_DISTANCE, anchorParts, sameItem, type ThreadItem } from "./threadItems";

// The thread's motion as pure steps: which sent messages enter, how far a streamed reply shows, how the view follows.
// The constants are chosen motion values, not settings.
export const MAX_LAG_MS = 400;
export const FINISH_MS = 150;
export const TAU_MS = 40;
export const WHEEL_HOLD_MS = 100;

// A message this window sent, kept until the history's user.message for it arrives. after: the conversation's last seq
// when it was sent, so an older message with the same text never matches.
export interface LocalSend { text: string; after: number }

type UserItem = Extract<ThreadItem, { kind: "user" }>;

// The user items that enter this render. prev: the items the previous render drew for the same conversation ([] when it
// opens, so nothing already on screen enters again). A Send now item (q key) enters as it appears; the history's item
// for it, drawn beside it or after it, does not. Queued messages go out combined (combineQueued), so their mark holds
// the combined text.
export function entering(prev: readonly ThreadItem[], items: readonly ThreadItem[], localSends: readonly LocalSend[]): Set<string> {
  const drawn = new Set(prev.map(item => item.key));
  const sending = [...prev, ...items].filter((item): item is UserItem => item.kind === "user" && item.sending === true);
  const marks = [...localSends];
  const out = new Set<string>();
  for (const item of items) {
    if (item.kind !== "user" || drawn.has(item.key)) continue;
    if (item.sending) { if (prev.length > 0) out.add(item.key); continue; }
    const seq = item.seq;
    const mark = seq === null ? -1 : marks.findIndex(m => seq > m.after && sameItem(anchorParts(splitRequest(m.text, item.attachments.length).body), item.parts));
    if (mark !== -1) marks.splice(mark, 1);
    const sent = sending.some(q => sameItem(q.parts, item.parts) && sameItem(q.anchors, item.anchors));
    if (mark !== -1 && !sent) out.add(item.key);
  }
  return out;
}

// finishing: ms since message.done, which shows the rest within FINISH_MS. flush: Stop, a failure, the turn's end, an
// item after the reply, a selection, or the window coming back.
export type RevealPhase = "streaming" | "flush" | { finishing: number };

// How many characters of `target` received to show next frame. Paced so the oldest hidden character shows by MAX_LAG_MS.
export function revealStep(shown: number, target: number, oldestHiddenAgeMs: number, dtMs: number, phase: RevealPhase): number {
  if (phase === "flush" || shown >= target) return target;
  let budget = MAX_LAG_MS - oldestHiddenAgeMs;
  if (typeof phase === "object") budget = Math.min(budget, FINISH_MS - phase.finishing);
  if (budget <= dtMs) return target;
  return Math.min(target, shown + Math.ceil((target - shown) * dtMs / budget));
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TABLE_ROW = /^ *\|/;
const DELIMITER = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *\r?$/;
const DELIMITER_START = /^[ |:\-\r]*$/;
const LINK = /^\[[^\]\n]*\]\([^)\s]*(?:\s+"[^"\n]*")?\)/;
const LINK_START = /^\[[^\]\n]*(?:\](?:\([^)\s]*(?:\s+(?:"[^"\n]*)?)?)?)?$/;
const words = new Intl.Segmenter(undefined, { granularity: "word" });

// The fence still open before `at`, by CommonMark's rule: a close is the same character, at least as long, then only
// whitespace.
function openFence(text: string, at: number): boolean {
  let open: string | null = null;
  for (const row of text.slice(0, at).split("\n")) {
    const fence = FENCE.exec(row)?.[1];
    if (!fence) continue;
    if (open === null) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length && row.trim() === fence) open = null;
  }
  return open !== null;
}

// A `[` that may still become a link: not in a code span, not right after a letter or digit, its label so far without
// brackets or parentheses.
function mayBeLink(text: string, bracket: number): boolean {
  const lineStart = text.lastIndexOf("\n", bracket - 1) + 1;
  if ((text.slice(lineStart, bracket).match(/`/g)?.length ?? 0) % 2 === 1) return false;
  if (bracket > 0 && /[\p{L}\p{N}]/u.test(text[bracket - 1]!)) return false;
  const label = /^\[([^\]\n]*)/.exec(text.slice(bracket))![1]!;
  return !/[()[]/.test(label) && LINK_START.test(text.slice(bracket));
}

// Where to cut `text` when showing up to about `to` from `from`: a word's end; whole lines in a code block or a table;
// never inside a link. While streaming, a trailing unfinished code line, link, or table before its delimiter row is
// held, since it would draw as plain text first and then change. complete: message.done gave the whole text, so
// nothing more will come and nothing is held.
export function revealBoundary(text: string, from: number, to: number, complete: boolean): number {
  const end = Math.min(Math.max(to, from), text.length);
  if (end <= from) return from;
  // The line holding the last character shown; next is null while it has no newline yet.
  const line = (at: number) => {
    const start = text.lastIndexOf("\n", at - 1) + 1, nl = text.indexOf("\n", at);
    return { start, next: nl < 0 ? null : nl + 1 };
  };
  const last = line(end - 1);
  const held = (at: number) => complete ? text.length : Math.max(from, at);

  if (openFence(text, last.start) || FENCE.test(text.slice(last.start))) return last.next ?? held(last.start);

  let head = last;
  while (head.start > 0 && TABLE_ROW.test(text.slice(line(head.start - 1).start, head.start - 1))) head = line(head.start - 1);
  if (TABLE_ROW.test(text.slice(head.start))) {
    const delimiter = head.next === null || head.next === text.length ? null : line(head.next);
    const row = delimiter ? text.slice(head.next!, delimiter.next === null ? text.length : delimiter.next - 1) : "";
    if (!complete && (!delimiter || (delimiter.next === null && DELIMITER_START.test(row)))) return held(head.start);
    if (delimiter && DELIMITER.test(row)) return Math.max(last.next ?? held(last.start), delimiter.next ?? text.length);
  }

  let cut = end;
  if (end < text.length && !/\s/.test(text[end - 1]!)) {
    const lineEnd = last.next ?? text.length;
    const word = words.segment(text.slice(last.start, lineEnd)).containing(end - 1 - last.start)!;
    cut = last.start + word.index + word.segment.length;
    // Punctuation trailing a word shows with it; a `[` waits, as it may start a link.
    while (cut < text.length && /[^\s\p{L}\p{N}[]/u.test(text[cut]!)) cut += 1;
    if (cut < text.length && /\s/.test(text[cut]!)) cut += 1;
  }
  const bracket = text.lastIndexOf("[", cut - 1);
  if (bracket >= 0) {
    const link = LINK.exec(text.slice(bracket));
    if (link) cut = Math.max(cut, bracket + link[0].length);
    else if (!complete && mayBeLink(text, bracket)) cut = held(bracket);
  }
  return cut;
}

// One frame of the eased follow: pos += (goal − pos)·(1 − e^(−dt/τ)), toward the target cut to the live bottom
// (scrollHeight − clientHeight), which drops when the composer shrinks. Never passes the goal; done within 0.5 px.
export function followStep(pos: number, target: number, dtMs: number, bottom: number): { pos: number; done: boolean } {
  const goal = Math.min(target, bottom);
  const next = pos + (goal - pos) * (1 - Math.exp(-dtMs / TAU_MS));
  return Math.abs(goal - next) < 0.5 ? { pos: goal, done: true } : { pos: next, done: false };
}

// pinned: the thread follows its bottom. held: scrollToItem moved it, so it waits for the person's own input or a release.
// wheelAt: the last wheel event, whose trackpad inertia may still scroll.
export interface FollowState { pinned: boolean; held: boolean; selecting: boolean; wheelAt: number }
// input: the person's wheel, pointerdown on the scroller (a scrollbar drag too) or keydown in the thread; the composer is
// outside it. scroll: a scroll the follow loop did not write. frame: distance is from the bottom.
export type FollowEvent =
  | { type: "input"; kind: "wheel" | "pointer"; at: number }
  | { type: "input"; kind: "key"; key: string; at: number }
  | { type: "scroll" }
  | { type: "scrollToItem" }
  // The card scrollToItem went to stopped waiting (answered, expired or gone).
  | { type: "release" }
  | { type: "selection"; active: boolean }
  | { type: "jump" }
  | { type: "frame"; at: number; distance: number };

export const FOLLOW_START: FollowState = { pinned: true, held: false, selecting: false, wheelAt: -Infinity };
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);

export function nextFollow(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case "input":
      if (event.kind === "key" && !SCROLL_KEYS.has(event.key)) return state;
      return { ...state, pinned: false, held: false, wheelAt: event.kind === "wheel" ? event.at : state.wheelAt };
    case "scroll": return state.pinned ? { ...state, pinned: false } : state;
    case "scrollToItem": return { ...state, pinned: false, held: true };
    case "release": return state.held ? { ...state, held: false } : state;
    case "selection": return { ...state, selecting: event.active, pinned: event.active ? false : state.pinned };
    case "jump": return { ...state, pinned: true, held: false };
    case "frame":
      if (state.pinned || state.held || state.selecting || event.at - state.wheelAt < WHEEL_HOLD_MS || event.distance > FOLLOW_DISTANCE) return state;
      return { ...state, pinned: true };
  }
}
