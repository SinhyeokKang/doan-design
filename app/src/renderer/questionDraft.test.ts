import { describe, expect, test } from "vitest";
import type { Question } from "../main/conversation/question";
import { canSend, EMPTY_QUESTION_DRAFT, questionDraft, questionInput, sendBlockedText, type QuestionDraft } from "./questionDraft";

const single: Question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }, { label: "Two rows" }], multiSelect: false, other: true };
const several: Question = { id: "1", header: "Sections", question: "Which sections?", options: [{ label: "Agents" }, { label: "Notifications" }, { label: "Appearance" }], multiSelect: true, other: true };
const textOnly: Question = { id: "name", header: "Name", question: "What name?", options: [], multiSelect: false, other: true };
const noOther: Question = { ...single, id: "2", other: false };
const run = (_questions: readonly Question[], ...actions: Parameters<typeof questionDraft>[1][]) => actions.reduce<QuestionDraft>(questionDraft, EMPTY_QUESTION_DRAFT);

describe("questionDraft", () => {
  test("the send failure line goes as soon as the answer changes, and the choices stay", () => {
    const failed: QuestionDraft = { ...run([single], { type: "choose", question: single, option: 0 }), failed: true };
    for (const action of [{ type: "choose", question: single, option: 1 }, { type: "other", question: single }, { type: "text", questionId: "0", text: "x" }] as const) {
      const next = questionDraft(failed, action);
      expect(next.failed).toBe(false);
      expect(next.sending).toBeNull();
    }
    expect(questionDraft(failed, { type: "choose", question: single, option: 1 }).choices["0"]).toEqual({ selected: [1], other: false, text: "" });
  });

  test("a radio question holds one choice: an option, or Other in its place", () => {
    let draft = run([single], { type: "choose", question: single, option: 0 }, { type: "choose", question: single, option: 1 });
    expect(draft.choices["0"]).toEqual({ selected: [1], other: false, text: "" });
    draft = questionDraft(draft, { type: "other", question: single });
    expect(draft.choices["0"]).toEqual({ selected: [], other: true, text: "" });
    draft = questionDraft(draft, { type: "text", questionId: "0", text: "Both" });
    // Choosing an option again closes Other; its text stays for when Other is chosen again.
    draft = questionDraft(draft, { type: "choose", question: single, option: 0 });
    expect(draft.choices["0"]).toEqual({ selected: [0], other: false, text: "Both" });
  });

  test("a several-choice question toggles each option and Other", () => {
    let draft = run([several], { type: "choose", question: several, option: 2 }, { type: "choose", question: several, option: 0 }, { type: "other", question: several });
    expect(draft.choices["1"]).toEqual({ selected: [0, 2], other: true, text: "" });
    draft = questionDraft(questionDraft(draft, { type: "choose", question: several, option: 2 }), { type: "other", question: several });
    expect(draft.choices["1"]).toEqual({ selected: [0], other: false, text: "" });
  });

  test("Send is possible only when every question has an answer; Other without text is no answer", () => {
    expect(canSend([single], EMPTY_QUESTION_DRAFT)).toBe(false);
    expect(canSend([single], run([single], { type: "other", question: single }))).toBe(false);
    expect(canSend([single], run([single], { type: "other", question: single }, { type: "text", questionId: "0", text: "   " }))).toBe(false);
    expect(canSend([single], run([single], { type: "other", question: single }, { type: "text", questionId: "0", text: " Both " }))).toBe(true);
    const one = run([single, several], { type: "choose", question: single, option: 0 });
    expect(canSend([single, several], one)).toBe(false);
    expect(canSend([single, several], questionDraft(one, { type: "choose", question: several, option: 1 }))).toBe(true);
    // Other checked with no text leaves a several-choice question unanswered, whatever else is checked.
    const checked = run([several], { type: "choose", question: several, option: 0 }, { type: "other", question: several });
    expect(canSend([several], checked)).toBe(false);
    expect(canSend([several], questionDraft(checked, { type: "text", questionId: "1", text: "  " }))).toBe(false);
    expect(canSend([several], questionDraft(checked, { type: "text", questionId: "1", text: "D" }))).toBe(true);
    expect(canSend([several], questionDraft(checked, { type: "other", question: several }))).toBe(true);
    // A question without options is answered by its text alone.
    expect(canSend([textOnly], run([textOnly], { type: "text", questionId: "name", text: "Settings header" }))).toBe(true);
    // A question without Other ignores leftover text.
    expect(canSend([noOther], run([noOther], { type: "text", questionId: "2", text: "x" }))).toBe(false);
  });

  test("the answer sent: choices by index and Other's text only while Other is chosen", () => {
    const draft = run([single, several, textOnly], { type: "other", question: single }, { type: "text", questionId: "0", text: "Both" },
      { type: "choose", question: several, option: 1 }, { type: "text", questionId: "1", text: "kept, not sent" }, { type: "text", questionId: "name", text: "Header" });
    expect(questionInput([single, several, textOnly], draft)).toEqual({ outcome: "answered", answers: { "0": { selected: [], other: "Both" }, "1": { selected: [1] }, name: { selected: [], other: "Header" } } });
  });

  test("while sending the choices are locked; a failure unlocks them and keeps them", () => {
    const chosen = run([single], { type: "choose", question: single, option: 1 });
    const sending = questionDraft(chosen, { type: "sending", how: "answer" });
    expect(sending.sending).toBe("answer");
    expect(canSend([single], sending)).toBe(false);
    expect(questionDraft(sending, { type: "choose", question: single, option: 0 })).toBe(sending);
    expect(questionDraft(sending, { type: "text", questionId: "0", text: "x" })).toBe(sending);
    const failed = questionDraft(sending, { type: "failed" });
    expect(failed).toEqual({ choices: chosen.choices, sending: null, failed: true });
    // The next send clears the error line.
    expect(questionDraft(failed, { type: "sending", how: "skip" })).toEqual({ choices: chosen.choices, sending: "skip", failed: false });
  });

  test("the disabled Send's tooltip says what is missing", () => {
    expect(sendBlockedText([single])).toBe("Choose or type an answer first.");
    expect(sendBlockedText([single, several])).toBe("Answer each question first.");
  });
});
