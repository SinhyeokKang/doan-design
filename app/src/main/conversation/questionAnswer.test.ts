import { describe, expect, it } from "vitest";
import { questionAnswer } from "./questionAnswer";
import { QUESTION_LIMITS, type Question } from "./question";

const single: Question = { id: "0", header: "Color", question: "Which color?", options: [{ label: "Red" }, { label: "Blue", description: "Calm" }], multiSelect: false, other: true };
const multi: Question = { id: "1", header: "Areas", question: "Which areas?", options: [{ label: "A" }, { label: "B" }, { label: "C" }], multiSelect: true, other: true };
const closed: Question = { ...single, id: "closed", other: false };
const textOnly: Question = { id: "free", header: "Name", question: "What name?", options: [], multiSelect: false, other: true };

describe("questionAnswer", () => {
  it("accepts one choice of a single-choice question and keeps the choice numbers", () => {
    expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected: [1] } } })).toEqual({ outcome: "answered", answers: { "0": { selected: [1] } } });
  });
  it("refuses a choice number out of range, not an integer, or repeated", () => {
    for (const selected of [[2], [-1], [0.5], [Number.NaN]]) expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected } } })).toBeNull();
    expect(questionAnswer([multi], { outcome: "answered", answers: { "1": { selected: [0, 0] } } })).toBeNull();
  });
  it("refuses two choices on a single-choice question, and a choice with Other text there", () => {
    expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected: [0, 1] } } })).toBeNull();
    expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected: [0], other: "Green" } } })).toBeNull();
  });
  it("takes several choices and Other text together on a multi-select question, and counts none as unanswered", () => {
    expect(questionAnswer([multi], { outcome: "answered", answers: { "1": { selected: [0, 2], other: " D " } } })).toEqual({ outcome: "answered", answers: { "1": { selected: [0, 2], other: "D" } } });
    expect(questionAnswer([multi], { outcome: "answered", answers: { "1": { selected: [] } } })).toBeNull();
  });
  it("refuses Other text on a question without Other and allows text on a question without choices", () => {
    expect(questionAnswer([closed], { outcome: "answered", answers: { closed: { selected: [], other: "Green" } } })).toBeNull();
    expect(questionAnswer([textOnly], { outcome: "answered", answers: { free: { selected: [], other: "Doan" } } })).toEqual({ outcome: "answered", answers: { free: { selected: [], other: "Doan" } } });
  });
  it("counts Other text of only spaces as unanswered and drops it beside a choice", () => {
    expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected: [], other: " \n\t" } } })).toBeNull();
    expect(questionAnswer([textOnly], { outcome: "answered", answers: { free: { selected: [] , other: "   " } } })).toBeNull();
    expect(questionAnswer([multi], { outcome: "answered", answers: { "1": { selected: [1], other: "  " } } })).toEqual({ outcome: "answered", answers: { "1": { selected: [1] } } });
  });
  it("needs an answer for every question and no answer for another", () => {
    expect(questionAnswer([single, multi], { outcome: "answered", answers: { "0": { selected: [0] } } })).toBeNull();
    expect(questionAnswer([single], { outcome: "answered", answers: { "0": { selected: [0] }, "9": { selected: [0] } } })).toBeNull();
    expect(questionAnswer([single], { outcome: "answered" })).toBeNull();
    expect(questionAnswer([single, multi], { outcome: "answered", answers: { "0": { selected: [0] }, "1": { selected: [1, 2] } } })).toEqual({ outcome: "answered", answers: { "0": { selected: [0] }, "1": { selected: [1, 2] } } });
  });
  it("refuses Other text over the limit, counted before trimming", () => {
    const at = "x".repeat(QUESTION_LIMITS.text);
    expect(QUESTION_LIMITS.text).toBe(4_096);
    expect(questionAnswer([textOnly], { outcome: "answered", answers: { free: { selected: [], other: at } } })).not.toBeNull();
    expect(questionAnswer([textOnly], { outcome: "answered", answers: { free: { selected: [], other: `${at}x` } } })).toBeNull();
    expect(questionAnswer([textOnly], { outcome: "answered", answers: { free: { selected: [], other: ` ${at}` } } })).toBeNull();
  });
  it("skips without answers and refuses a skip that carries some", () => {
    expect(questionAnswer([single, multi], { outcome: "skipped" })).toEqual({ outcome: "skipped" });
    expect(questionAnswer([single], { outcome: "skipped", answers: { "0": { selected: [0] } } })).toBeNull();
  });
  it("refuses shapes the IPC check would have let through only by mistake", () => {
    const bad = [{ outcome: "answered", answers: { "0": { selected: "0" } } }, { outcome: "answered", answers: { "0": null } }, { outcome: "answered", answers: { "0": { selected: [0], other: 3 } } }, { outcome: "expired" }];
    for (const input of bad) expect(questionAnswer([single], input as never)).toBeNull();
  });
});
