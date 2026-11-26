import { splitRequest } from "./homeComposer";
import { anchorParts, sameItem, type ThreadItem } from "./threadItems";

// The constants are chosen motion values, not settings.
export const MAX_LAG_MS = 400;
export const FINISH_MS = 150;
export const TAU_MS = 40;
export const WHEEL_HOLD_MS = 100;
// From the bottom: within BOTTOM it always follows again; NUDGE is the most a person's own move can be and still have
// it follow again once the input ends.
export const BOTTOM = 24;
export const NUDGE = 48;

// after: the conversation's last seq when it was sent, so an older message with the same text never matches.
export interface LocalSend { text: string; after: number }

type UserItem = Extract<ThreadItem, { kind: "user" }>;

// prev is [] when the thread opens, so nothing already on screen enters again. A Send now item enters as it appears;
// the history's item for it does not. Queued messages go out combined, so their mark holds the combined text.
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

// flush: Stop, a failure, the turn's end, an item after the reply, a selection, or the window coming back.
export type RevealPhase = "streaming" | "flush" | { finishing: number };

// Paced so the oldest hidden character shows by MAX_LAG_MS.
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

// CommonMark's rule: a close is the same character, at least as long, then only whitespace.
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

// Before `](` arrives, not right after a Latin letter or digit (`a[i`) and with no bracket or parenthesis in its label
// (`[0, 1)`). CJK text puts links right after a letter.
function mayBeLink(text: string, bracket: number): boolean {
  const rest = text.slice(bracket);
  if (!LINK_START.test(rest)) return false;
  const lineStart = text.lastIndexOf("\n", bracket - 1) + 1;
  if ((text.slice(lineStart, bracket).match(/`/g)?.length ?? 0) % 2 === 1) return false;
  if (/^\[[^\]\n]*\]\(/.test(rest)) return true;
  if (bracket > 0 && /[\p{Script=Latin}\p{N}]/u.test(text[bracket - 1]!)) return false;
  return !/[()[]/.test(rest.slice(1));
}

// While streaming, an unfinished code line, link, or table before its delimiter row is held, since it would draw as
// plain text first and then change. complete: nothing more will come, so nothing is held.
export function revealBoundary(text: string, from: number, to: number, complete: boolean): number {
  const end = Math.min(Math.max(to, from), text.length);
  if (end <= from) return from;
  // next is null while the line has no newline yet.
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
    // Cut only between two words (CJK has no spaces) or at a space, so punctuation and markup marks stay with the word
    // they close or open.
    const segments = words.segment(text.slice(last.start, lineEnd));
    let word = segments.containing(end - 1 - last.start)!;
    cut = last.start + word.index + word.segment.length;
    while (cut < lineEnd && !/\s/.test(text[cut]!)) {
      const next = segments.containing(cut - last.start)!;
      if (word.isWordLike && next.isWordLike) break;
      word = next;
      cut = last.start + next.index + next.segment.length;
    }
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

// pos += (goal − pos)·(1 − e^(−dt/τ)), toward the live bottom, which drops when the composer shrinks. Never passes the
// goal; done within 0.5 px.
export function followStep(pos: number, target: number, dtMs: number, bottom: number): { pos: number; done: boolean } {
  const goal = Math.min(target, bottom);
  const next = pos + (goal - pos) * (1 - Math.exp(-dtMs / TAU_MS));
  return Math.abs(goal - next) < 0.5 ? { pos: goal, done: true } : { pos: next, done: false };
}

// Where Jump to latest turns on and off: a third of the visible height (the scroller's, less the end inset), 120 at least.
export function followBand(height: number): number {
  return Math.max(120, height / 3);
}

// inputAt: the last wheel or scroll key; trackpad inertia may still be moving the view. pressed: a pointer held on the
// scroller (its scrollbar). origin: set only by the input that unpinned the follow, until a frame judges it once that
// input is over: the scrollTop where it began (with scroll anchoring off, growth never moves scrollTop, so the person's
// own move is origin.top − top) and whether the content grew since. scroll: a scroll key's or an item's scroll, awaited
// and then running until its scrollend (Chromium animates a key for about 150 ms, past WHEEL_HOLD_MS). floor: the
// scrollTop of the bottom when a scroll of the person's last ended within BOTTOM while unpinned, so growth after it never
// keeps the view away.
export interface FollowOrigin { top: number; grew: boolean }
export interface FollowState { pinned: boolean; selecting: boolean; pressed: boolean; inputAt: number; origin: FollowOrigin | null; scroll: "idle" | "awaited" | "running"; floor: number | null }
// The composer is outside the thread. scroll: one the follow loop did not write. A pointer's release comes from the
// window, since a scrollbar drag often ends outside the scroller. top: the scroller's scrollTop. clamp: the browser
// lowered scrollTop by `by` to a scroll extent that shrank (content or the end inset), which is no move of the person's.
// item: the thread scrolls to an item, which is not following. moved: the scroll changed scrollTop since the last read,
// and not by a clamp (only the person's own move reaches the bottom).
export type FollowEvent =
  | { type: "input"; kind: "wheel"; at: number; top: number }
  | { type: "input"; kind: "key"; key: string; at: number; top: number }
  | { type: "pointer"; down: true; top: number }
  | { type: "pointer"; down: false }
  | { type: "item"; at: number }
  | { type: "scroll"; distance: number; top: number; moved: boolean }
  | { type: "scrollend" }
  | { type: "clamp"; by: number }
  | { type: "selection"; active: boolean }
  | { type: "jump" }
  | { type: "frame"; at: number; distance: number; top: number };

export const FOLLOW_START: FollowState = { pinned: true, selecting: false, pressed: false, inputAt: -Infinity, origin: null, scroll: "idle", floor: null };
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);

// An input that starts while already unpinned (the person reading further up) gets no origin: only BOTTOM re-pins it.
const unpinBy = (state: FollowState, top: number): FollowOrigin | null => state.pinned ? { top, grew: false } : state.origin;
const seen = (state: FollowState, event: { distance: number; top: number; moved: boolean }): FollowState =>
  !state.pinned && event.moved && event.distance <= BOTTOM ? { ...state, floor: event.top + event.distance } : state;
const PINNED = { pinned: true, origin: null, scroll: "idle", floor: null } as const;

export function nextFollow(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case "input":
      if (event.kind === "key" && !SCROLL_KEYS.has(event.key)) return state;
      return { ...state, pinned: false, inputAt: event.at, origin: unpinBy(state, event.top), scroll: event.kind === "key" ? "awaited" : "idle" };
    case "pointer":
      if (!event.down) return state.pressed ? { ...state, pressed: false } : state;
      return { ...state, pinned: false, pressed: true, origin: unpinBy(state, event.top), scroll: "idle" };
    case "item": return { ...state, pinned: false, origin: null, inputAt: event.at, scroll: "awaited", floor: null };
    case "scroll": {
      const next = state.pinned ? { ...state, pinned: false, origin: null } : state.scroll === "awaited" ? { ...state, scroll: "running" as const } : state;
      return seen(next, event);
    }
    case "scrollend": return state.scroll === "running" ? { ...state, scroll: "idle" } : state;
    case "clamp":
      if (state.origin === null && state.floor === null) return state;
      return { ...state, origin: state.origin && { ...state.origin, top: state.origin.top - event.by }, floor: state.floor === null ? null : state.floor - event.by };
    case "selection":
      if (!event.active) return { ...state, selecting: false };
      return { ...state, selecting: true, pinned: false, origin: state.pinned ? null : state.origin };
    case "jump": return { ...state, ...PINNED, origin: state.origin };
    case "frame": {
      if (state.pinned) return state;
      const next = state;
      if (next.selecting || next.pressed || next.scroll === "running" || event.at - next.inputAt < WHEEL_HOLD_MS) return next;
      const back = event.distance <= BOTTOM || (next.floor !== null && next.floor - event.top <= BOTTOM) || (next.origin !== null && next.origin.top - event.top <= NUDGE);
      if (back) return { ...next, ...PINNED };
      return next.origin === null && next.floor === null && next.scroll === "idle" ? next : { ...next, origin: null, floor: null, scroll: "idle" };
    }
  }
}

// Jump to latest waits while the unpinning input is unjudged; once a frame judges it without a re-pin, it shows if the
// content grew meanwhile and the view is past the band.
export function judgedBehind(before: FollowState, after: FollowState, distance: number, band: number): boolean {
  return before.origin !== null && after.origin === null && !after.pinned && before.origin.grew && distance > band;
}

// content: the thread's own height, measured apart from the end inset and the viewport (the scroll height has the
// viewport as its floor); inset: the end inset under the popover; distance: from the bottom, before and after.
export interface ThreadSize { content: number; inset: number; distance: number }
export type FollowMove = "snap" | "ease" | "none";
// A revealing reply or an inset change snaps (an ease would leave the line being written, or the last item under the
// popover, out of view), except that a running ease, or one starting from outside BOTTOM, only moves its goal. Only the
// content's own growth past the band is new for Jump to latest; back within the band it goes.
export function followResize(state: FollowState, change: { reduced: boolean; revealing: boolean; easing: boolean; now: number; top: number; band: number; before: ThreadSize; after: ThreadSize }): { state: FollowState; move: FollowMove; behind: boolean | null } {
  const next = nextFollow(state, { type: "frame", at: change.now, distance: change.before.distance, top: change.top });
  const grew = change.after.content - change.before.content >= 0.5;
  if (!next.pinned) {
    const within = change.after.distance <= change.band;
    if (next.origin !== null) return { state: grew && !next.origin.grew ? { ...next, origin: { ...next.origin, grew: true } } : next, move: "none", behind: within ? false : null };
    if (within) return { state: next, move: "none", behind: false };
    return { state: next, move: "none", behind: grew || judgedBehind(state, next, change.after.distance, change.band) ? true : null };
  }
  if (change.reduced) return { state: next, move: "snap", behind: false };
  const insetMoved = change.after.inset !== change.before.inset;
  const easing = (!state.pinned && change.before.distance > BOTTOM) || (change.easing && !insetMoved);
  return { state: next, move: easing || !(change.revealing || insetMoved) ? "ease" : "snap", behind: false };
}

// A time token read back from computed style: registered tokens compute in seconds ("0.12s"), plain ones keep "120ms".
export function timeMs(value: string): number {
  const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(value);
  if (!match) return 0;
  const n = Number.parseFloat(match[1]!);
  return Number.isFinite(n) ? (match[2] === "s" ? n * 1000 : n) : 0;
}
