import { describe, expect, test } from "vitest";
import { nextStopHold, STOP_HOLD_MS, stopHeld, stopName } from "./stopTarget";

describe("Stop target switch", () => {
  const T = 10_000;

  test("the first followed conversation's Stop is available at once", () => {
    const hold = nextStopHold(null, "a", T);
    expect(stopHeld(hold, T)).toBe(false);
    expect(stopHeld(nextStopHold(nextStopHold(null, null, T), "a", T), T)).toBe(false);
  });

  test("when the followed conversation changes, Stop is held for about a second, then available", () => {
    const first = nextStopHold(null, "a", T);
    const next = nextStopHold(first, "b", T + 500);
    expect(STOP_HOLD_MS).toBe(1000);
    expect(stopHeld(next, T + 500)).toBe(true);
    expect(stopHeld(next, T + 1499)).toBe(true);
    expect(stopHeld(next, T + 1500)).toBe(false);
  });

  test("the same followed conversation keeps its hold; a read that changes nothing does not restart it", () => {
    const next = nextStopHold(nextStopHold(null, "a", T), "b", T);
    expect(nextStopHold(next, "b", T + 900)).toBe(next);
    expect(stopHeld(nextStopHold(next, "b", T + 900), T + 1000)).toBe(false);
  });

  test("nothing to follow drops the hold; the next conversation that shows is not held", () => {
    const next = nextStopHold(nextStopHold(null, "a", T), null, T + 10);
    expect(stopHeld(next, T + 10)).toBe(false);
    expect(stopHeld(nextStopHold(next, "b", T + 20), T + 20)).toBe(false);
  });

  test("a change while held starts the hold again from that change", () => {
    const b = nextStopHold(nextStopHold(null, "a", T), "b", T);
    const c = nextStopHold(b, "c", T + 800);
    expect(stopHeld(c, T + 1500)).toBe(true);
    expect(stopHeld(c, T + 1800)).toBe(false);
  });
});

describe("stopName", () => {
  test("Stop alone for the shown conversation; another conversation's names it by its quoted title", () => {
    expect(stopName("Add an empty state", true)).toBe("Stop");
    expect(stopName("Add an empty state to the orders list", false)).toBe("Stop “Add an empty state to the orders list”");
  });

  test("an empty title reads Stop alone; a long or multi-line one is quoted on one line and cut", () => {
    expect(stopName("  ", false)).toBe("Stop");
    expect(stopName("Fix\nthe header", false)).toBe("Stop “Fix the header”");
    expect(stopName("x".repeat(70), false)).toBe(`Stop “${"x".repeat(60)}…”`);
  });
});
