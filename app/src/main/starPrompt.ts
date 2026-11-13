// The GitHub star card's rules: how many successful app-conversation turns before it asks, how long a Not now waits,
// and what star-prompt.json may hold. Pure: the store applies them, and the preload takes the moment's type.

export interface StarPromptState {
  // Successful app-conversation turns counted on this device.
  turns: number;
  // The count at which the next card is due.
  threshold: number;
  // Epoch ms before which no card is due.
  deferredUntil: number;
  // Cards answered with Not now: the second card is the last.
  asks: 0 | 1;
  // Opened in the browser, or Don’t ask again.
  done: boolean;
}

// Main's one signal to the renderer: a card is due now. The renderer still waits for a quiet moment.
export interface StarMoment { second: boolean }

export type StarPromptAction = "opened" | "openFailed" | "dismissed";

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_TURNS = 20;
const MORE_TURNS = 40;
const DEFER_MS = 3 * DAY_MS;

export const STAR_PROMPT_INITIAL: StarPromptState = { turns: 0, threshold: FIRST_TURNS, deferredUntil: 0, asks: 0, done: false };

export function starPromptDue(state: StarPromptState, now: number): boolean {
  return !state.done && state.turns >= state.threshold && now >= state.deferredUntil;
}

// A deferral is counted from when it was written. A clock set back since then must not hold the card off longer than
// the 3 days a Not now asks for.
export function clampDeferred(deferredUntil: number, now: number): number {
  return Math.min(deferredUntil, now + DEFER_MS);
}

// One successful turn. The clamp is written back with the count, so a clock set back gives up its extra wait once.
export function starPromptTurn(state: StarPromptState, now: number): StarPromptState {
  return { ...state, turns: state.turns + 1, deferredUntil: clampDeferred(state.deferredUntil, now) };
}

export function starPromptAfter(state: StarPromptState, action: StarPromptAction, now: number): StarPromptState {
  if (action === "openFailed") return state;
  if (action === "opened" || state.asks === 1) return { ...state, done: true };
  // Counted from the turn the card showed on, which an overlay may have put off past the threshold.
  return { ...state, asks: 1, threshold: state.turns + MORE_TURNS, deferredUntil: now + DEFER_MS };
}

export function starPromptMomentFor(state: StarPromptState): StarMoment {
  return { second: state.asks === 1 };
}

export function starPromptText(state: StarPromptState): string {
  return `${JSON.stringify({ v: 1, ...state })}\n`;
}

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

// `text` is the file's contents, undefined when there is no file yet. null: Doan cannot use the file (broken, a later
// Doan's version, a field missing or wrong), so it never asks, and never writes over it.
export function readStarPromptState(text: string | undefined): StarPromptState | null {
  if (text === undefined) return STAR_PROMPT_INITIAL;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { v, turns, threshold, deferredUntil, asks, done } = value as Record<string, unknown>;
  if (v !== 1 || !count(turns) || !count(threshold) || !count(deferredUntil) || (asks !== 0 && asks !== 1) || typeof done !== "boolean") return null;
  return { turns, threshold, deferredUntil, asks, done };
}
