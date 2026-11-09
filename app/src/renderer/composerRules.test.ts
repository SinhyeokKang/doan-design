import { describe, expect, test } from "vitest";
import { composerAction, composerShape, steerAllPlan, focusAfter } from "./composerRules";

describe("composerShape", () => {
  test("chips or a wrapped line make a box", () => {
    expect(composerShape("capsule", { empty: false, chips: 0, overflows: true })).toBe("box");
    expect(composerShape("capsule", { empty: true, chips: 1, overflows: false })).toBe("box");
    expect(composerShape("box", { empty: false, chips: 2, overflows: false })).toBe("box");
  });
  test("only an empty draft without chips goes back to a capsule", () => {
    expect(composerShape("box", { empty: true, chips: 0, overflows: false })).toBe("capsule");
    expect(composerShape("capsule", { empty: true, chips: 0, overflows: false })).toBe("capsule");
  });
  test("one line of text keeps the current shape, so a box never flips back while typing", () => {
    expect(composerShape("capsule", { empty: false, chips: 0, overflows: false })).toBe("capsule");
    expect(composerShape("box", { empty: false, chips: 0, overflows: false })).toBe("box");
    // Typing past the capsule width, then deleting back to one line: stays a box until the field is cleared.
    let shape = composerShape("capsule", { empty: false, chips: 0, overflows: true });
    shape = composerShape(shape, { empty: false, chips: 0, overflows: false });
    expect(shape).toBe("box");
    expect(composerShape(shape, { empty: true, chips: 0, overflows: false })).toBe("capsule");
  });
});

describe("composerAction", () => {
  test("Send while nothing runs", () => {
    expect(composerAction("idle", "", 0)).toBe("send");
    expect(composerAction("idle", "Draw it", 0)).toBe("send");
  });
  test("while a turn runs or waits: Stop with an empty field, Queue with text; queued rows change nothing", () => {
    for (const turn of ["running", "waiting"] as const) {
      expect(composerAction(turn, "", 0)).toBe("stop");
      expect(composerAction(turn, "  \n", 0)).toBe("stop");
      expect(composerAction(turn, "Also the caption", 0)).toBe("queue");
      expect(composerAction(turn, "", 2)).toBe("stop");
      expect(composerAction(turn, "Also the caption", 2)).toBe("queue");
    }
  });
  // The turn ended and main still works on the conversation (a judgement, a queue going out): nothing runs to stop.
  test("holding: Send (disabled by the host) with an empty field, Queue with text, Stop only while queue rows wait", () => {
    expect(composerAction("holding", "", 0)).toBe("send");
    expect(composerAction("holding", "  \n", 0)).toBe("send");
    expect(composerAction("holding", "Also the caption", 0)).toBe("queue");
    expect(composerAction("holding", "", 1)).toBe("stop");
    expect(composerAction("holding", "Also the caption", 1)).toBe("queue");
  });
  test("a chip alone is content: the composed request is not empty", () => {
    expect(composerAction("running", "Look at the attached files.", 0)).toBe("queue");
    expect(composerAction("holding", "Look at the attached files.", 0)).toBe("queue");
  });
});

describe("focusAfter", () => {
  test("after an answer: the next waiting request's first choice, else the field", () => {
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: ["r1", "r2"] })).toEqual({ kind: "option", requestId: "r2" });
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: ["r1"] })).toEqual({ kind: "field", caretAtEnd: false });
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: [] })).toEqual({ kind: "field", caretAtEnd: false });
  });
  test("after a question's answer: the next waiting question or permission request in arrival order, else the field", () => {
    expect(focusAfter({ kind: "answered", requestId: "q1" }, { pending: ["q1", "p1", "q2"] })).toEqual({ kind: "option", requestId: "p1" });
    expect(focusAfter({ kind: "answered", requestId: "p1" }, { pending: ["p1", "q2"] })).toEqual({ kind: "option", requestId: "q2" });
    expect(focusAfter({ kind: "answered", requestId: "q2" }, { pending: ["q2"] })).toEqual({ kind: "field", caretAtEnd: false });
  });
  test("after Stop and an accepted send: the field", () => {
    expect(focusAfter({ kind: "stopped" }, { pending: ["r1"] })).toEqual({ kind: "field", caretAtEnd: false });
    expect(focusAfter({ kind: "sent" }, { pending: [] })).toEqual({ kind: "field", caretAtEnd: false });
  });
  test("after Edit and resend and the Replace your draft? dialog: the field, caret at the end", () => {
    expect(focusAfter({ kind: "restored" }, { pending: [] })).toEqual({ kind: "field", caretAtEnd: true });
    expect(focusAfter({ kind: "draftDialog" }, { pending: [] })).toEqual({ kind: "field", caretAtEnd: true });
  });
});


describe("steerAllPlan", () => {
  test.each([0, 3])("falls back to Enter without Send now, with %i rows", rows => {
    for (const draft of [false, true]) expect(steerAllPlan({ sendNow: false, rows, draft })).toBe("enter");
  });
  test("plans rows and draft independently, and does nothing when both are empty", () => {
    expect(steerAllPlan({ sendNow: true, rows: 0, draft: false })).toBe("none");
    expect(steerAllPlan({ sendNow: true, rows: 3, draft: false })).toEqual({ rows: true, draft: false });
    expect(steerAllPlan({ sendNow: true, rows: 0, draft: true })).toEqual({ rows: false, draft: true });
    expect(steerAllPlan({ sendNow: true, rows: 3, draft: true })).toEqual({ rows: true, draft: true });
  });
});
