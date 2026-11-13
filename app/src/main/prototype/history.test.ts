import { describe, expect, test } from "vitest";
import { EMPTY_HISTORY, canStep, recordEntry, stepHistory, type History } from "./history";

const same = (a: string, b: string) => a === b;
const all = () => true;

function of(entries: string[], index: number): History<string> {
  return { entries, index };
}

describe("recordEntry", () => {
  test("the first play starts the history", () => {
    expect(recordEntry(EMPTY_HISTORY, "a", same)).toEqual(of(["a"], 0));
  });

  test("a different target is appended and becomes current", () => {
    expect(recordEntry(of(["a"], 0), "b", same)).toEqual(of(["a", "b"], 1));
  });

  test("the current target again records nothing", () => {
    const h = of(["a", "b"], 1);
    expect(recordEntry(h, "b", same)).toBe(h);
  });

  test("a play after Back drops the forward entries", () => {
    expect(recordEntry(of(["a", "b", "c"], 0), "d", same)).toEqual(of(["a", "d"], 1));
  });
});

describe("stepHistory", () => {
  test("Back and Forward move one usable entry", () => {
    expect(stepHistory(of(["a", "b", "c"], 2), "back", all)).toEqual(of(["a", "b", "c"], 1));
    expect(stepHistory(of(["a", "b", "c"], 0), "forward", all)).toEqual(of(["a", "b", "c"], 1));
  });

  test("unusable entries are skipped and kept", () => {
    expect(stepHistory(of(["a", "b", "c"], 2), "back", e => e !== "b")).toEqual(of(["a", "b", "c"], 0));
    expect(stepHistory(of(["a", "b", "c"], 0), "forward", e => e !== "b")).toEqual(of(["a", "b", "c"], 2));
  });

  test("nothing usable in that direction is null", () => {
    expect(stepHistory(of(["a", "b"], 0), "back", all)).toBeNull();
    expect(stepHistory(of(["a", "b"], 1), "forward", all)).toBeNull();
    expect(stepHistory(of(["a", "b", "c"], 2), "back", () => false)).toBeNull();
    expect(stepHistory(EMPTY_HISTORY, "back", all)).toBeNull();
    expect(stepHistory(EMPTY_HISTORY, "forward", all)).toBeNull();
  });
});

describe("canStep", () => {
  test("is enabled only when a usable entry lies that way", () => {
    const h = of(["a", "b", "c"], 1);
    expect(canStep(h, "back", all)).toBe(true);
    expect(canStep(h, "forward", all)).toBe(true);
    expect(canStep(h, "back", e => e !== "a")).toBe(false);
    expect(canStep(h, "forward", e => e !== "c")).toBe(false);
    expect(canStep(EMPTY_HISTORY, "back", all)).toBe(false);
  });
});
