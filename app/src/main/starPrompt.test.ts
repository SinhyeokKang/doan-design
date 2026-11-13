import { describe, expect, test } from "vitest";
import { clampDeferred, readStarPromptState, starPromptAfter, starPromptDue, starPromptMomentFor, starPromptText, starPromptTurn, STAR_PROMPT_INITIAL, type StarPromptState } from "./starPrompt";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 13, 12);
const state = (over: Partial<StarPromptState> = {}): StarPromptState => ({ ...STAR_PROMPT_INITIAL, ...over });

describe("starPromptDue", () => {
  test("the first ask comes at 20 successful turns, not at 19", () => {
    expect(STAR_PROMPT_INITIAL).toEqual({ turns: 0, threshold: 20, deferredUntil: 0, asks: 0, done: false });
    expect(starPromptDue(state({ turns: 19 }), NOW)).toBe(false);
    expect(starPromptDue(state({ turns: 20 }), NOW)).toBe(true);
    // A moment that was put off waits for the next turn's end, which is still due.
    expect(starPromptDue(state({ turns: 27 }), NOW)).toBe(true);
  });

  test("a deferred ask waits for its time as well as its count", () => {
    const deferred = state({ turns: 67, threshold: 67, deferredUntil: NOW + 1, asks: 1 });
    expect(starPromptDue(deferred, NOW)).toBe(false);
    expect(starPromptDue(deferred, NOW + 1)).toBe(true);
    expect(starPromptDue({ ...deferred, turns: 66 }, NOW + DAY * 10)).toBe(false);
  });

  test("never once done", () => {
    expect(starPromptDue(state({ turns: 500, done: true }), NOW)).toBe(false);
  });
});

describe("starPromptAfter", () => {
  test("the first Not now asks again 40 turns after the count when Not now is pressed, and at least 3 days later", () => {
    expect(starPromptAfter(state({ turns: 20 }), "dismissed", NOW)).toEqual(state({ turns: 20, threshold: 60, deferredUntil: NOW + 3 * DAY, asks: 1 }));
    // Put off by an open overlay, Not now was pressed at the 27th turn.
    expect(starPromptAfter(state({ turns: 27 }), "dismissed", NOW)).toEqual(state({ turns: 27, threshold: 67, deferredUntil: NOW + 3 * DAY, asks: 1 }));
  });

  test("Don't ask again on the second card ends it", () => {
    const second = state({ turns: 70, threshold: 67, deferredUntil: NOW - 1, asks: 1 });
    expect(starPromptAfter(second, "dismissed", NOW)).toEqual({ ...second, done: true });
  });

  test.each([0, 1] as const)("a browser that opened ends it, on either card (asks %s)", asks => {
    const shown = state({ turns: 80, asks });
    expect(starPromptAfter(shown, "opened", NOW)).toEqual({ ...shown, done: true });
  });

  test("a browser that did not open changes nothing, and a retry that opens ends it", () => {
    const shown = state({ turns: 20 });
    const failed = starPromptAfter(shown, "openFailed", NOW);
    expect(failed).toEqual(shown);
    expect(starPromptAfter(failed, "opened", NOW).done).toBe(true);
  });
});

describe("starPromptTurn", () => {
  test("counts one turn and pulls a deferral more than 3 days ahead back to now + 3 days", () => {
    expect(starPromptTurn(state({ turns: 4 }), NOW)).toEqual(state({ turns: 5 }));
    expect(starPromptTurn(state({ turns: 30, deferredUntil: NOW + 400 * DAY, asks: 1 }), NOW)).toEqual(state({ turns: 31, deferredUntil: NOW + 3 * DAY, asks: 1 }));
  });
});

test("the moment names the card: the second asks Don't ask again", () => {
  expect(starPromptMomentFor(state({ turns: 20 }))).toEqual({ second: false });
  expect(starPromptMomentFor(state({ turns: 70, asks: 1 }))).toEqual({ second: true });
});

describe("clampDeferred", () => {
  test("a time within 3 days stays; one further ahead, from a clock set back, becomes now + 3 days", () => {
    expect(clampDeferred(0, NOW)).toBe(0);
    expect(clampDeferred(NOW + DAY, NOW)).toBe(NOW + DAY);
    expect(clampDeferred(NOW + 3 * DAY, NOW)).toBe(NOW + 3 * DAY);
    expect(clampDeferred(NOW + 3 * DAY + 1, NOW)).toBe(NOW + 3 * DAY);
  });
});

describe("readStarPromptState", () => {
  test("no file yet is the first state", () => {
    expect(readStarPromptState(undefined)).toEqual(STAR_PROMPT_INITIAL);
  });

  test("a written state reads back", () => {
    const saved = state({ turns: 27, threshold: 67, deferredUntil: NOW + 3 * DAY, asks: 1 });
    expect(starPromptText(saved)).toBe(`${JSON.stringify({ v: 1, turns: 27, threshold: 67, deferredUntil: NOW + 3 * DAY, asks: 1, done: false })}\n`);
    expect(readStarPromptState(starPromptText(saved))).toEqual(saved);
  });

  test.each([
    ["broken JSON", "{"],
    ["not an object", "[]"],
    ["a later Doan's version", JSON.stringify({ v: 2, turns: 1, threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["no version", JSON.stringify({ turns: 1, threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["a missing field", JSON.stringify({ v: 1, turns: 1, threshold: 20, deferredUntil: 0, asks: 0 })],
    ["a wrong-typed field", JSON.stringify({ v: 1, turns: "1", threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["a negative count", JSON.stringify({ v: 1, turns: -1, threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["a fractional count", JSON.stringify({ v: 1, turns: 1.5, threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["an unknown ask count", JSON.stringify({ v: 1, turns: 1, threshold: 20, deferredUntil: 0, asks: 2, done: false })],
  ])("%s means never ask", (_name, text) => {
    expect(readStarPromptState(text)).toBeNull();
  });
});
