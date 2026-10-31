import { describe, expect, test } from "vitest";
import { composerAction, composerShape, focusAfter } from "./composerRules";

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
    expect(composerAction(false, "", 0)).toBe("send");
    expect(composerAction(false, "Draw it", 0)).toBe("send");
  });
  test("while a turn runs: Stop with an empty field, Queue with text", () => {
    expect(composerAction(true, "", 0)).toBe("stop");
    expect(composerAction(true, "  \n", 0)).toBe("stop");
    expect(composerAction(true, "Also the caption", 0)).toBe("queue");
  });
  test("queued messages do not turn an empty field's Stop into anything else", () => {
    expect(composerAction(true, "", 2)).toBe("stop");
    expect(composerAction(true, "More", 2)).toBe("queue");
  });
  test("a chip alone is content: the composed request is not empty", () => {
    expect(composerAction(true, "Look at the attached files.", 0)).toBe("queue");
  });
});

describe("focusAfter", () => {
  test("after an answer: the next waiting request's first choice, else the field", () => {
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: ["r1", "r2"] })).toEqual({ kind: "option", requestId: "r2" });
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: ["r1"] })).toEqual({ kind: "field", caretAtEnd: false });
    expect(focusAfter({ kind: "answered", requestId: "r1" }, { pending: [] })).toEqual({ kind: "field", caretAtEnd: false });
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
