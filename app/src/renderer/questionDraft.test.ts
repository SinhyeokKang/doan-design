import { describe, expect, test } from "vitest";
import type { Question } from "../main/conversation/question";
import { canSend, EMPTY_QUESTION_DRAFT, lastStep, otherReturn, questionAnswered, questionDraft, questionInput, stepButton, type QuestionDraft } from "./questionDraft";

const single: Question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }, { label: "Two rows" }], multiSelect: false, other: true };
const several: Question = { id: "1", header: "Sections", question: "Which sections?", options: [{ label: "Agents" }, { label: "Notifications" }, { label: "Appearance" }], multiSelect: true, other: true };
const textOnly: Question = { id: "name", header: "Name", question: "What name?", options: [], multiSelect: false, other: true };
const noOther: Question = { ...single, id: "2", other: false };
const run = (_questions: readonly Question[], ...actions: Parameters<typeof questionDraft>[1][]) => actions.reduce<QuestionDraft>(questionDraft, EMPTY_QUESTION_DRAFT);

describe("questionDraft", () => {
  test("the send failure line goes as soon as the answer changes, and the choices stay", () => {
    const failed: QuestionDraft = { ...run([single], { type: "choose", question: single, option: 0 }), failed: "answer" };
    for (const action of [{ type: "choose", question: single, option: 1 }, { type: "other", question: single }, { type: "text", questionId: "0", text: "x" }] as const) {
      const next = questionDraft(failed, action);
      expect(next.failed).toBeNull();
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
    expect(failed).toEqual({ choices: chosen.choices, step: 0, sending: null, failed: "answer" });
    // The next send clears the error line.
    expect(questionDraft(failed, { type: "sending", how: "skip" })).toEqual({ choices: chosen.choices, step: 0, sending: "skip", failed: null });
  });

  // The failure line names the press main refused, as the strip's does.
  test("a refused Skip is remembered as a skip failure, a refused answer as an answer failure", () => {
    const chosen = run([single], { type: "choose", question: single, option: 1 });
    const skipped = questionDraft(questionDraft(chosen, { type: "sending", how: "skip" }), { type: "failed" });
    expect(skipped).toEqual({ choices: chosen.choices, step: 0, sending: null, failed: "skip" });
    expect(questionDraft(questionDraft(skipped, { type: "sending", how: "answer" }), { type: "failed" }).failed).toBe("answer");
  });
});

describe("question steps", () => {
  const secret: Question = { id: "key", header: "Key", question: "Which API key?", options: [], multiSelect: false, other: true, secret: true };
  const three = [single, several, textOnly];
  const next = { type: "next", questions: three } as const;

  test("Next moves on only when the current question has an answer, and not past the last step", () => {
    expect(EMPTY_QUESTION_DRAFT.step).toBe(0);
    expect(questionDraft(EMPTY_QUESTION_DRAFT, next)).toBe(EMPTY_QUESTION_DRAFT);
    let draft = run(three, { type: "choose", question: single, option: 1 }, next);
    expect(draft.step).toBe(1);
    expect(questionDraft(draft, next)).toBe(draft);
    draft = run(three, { type: "choose", question: single, option: 1 }, next, { type: "choose", question: several, option: 0 }, next);
    expect(draft.step).toBe(2);
    draft = questionDraft(draft, { type: "text", questionId: "name", text: "Header" });
    expect(questionDraft(draft, next)).toBe(draft);
  });

  test("Back moves back except on the first question, and every answer stays across the steps", () => {
    expect(questionDraft(EMPTY_QUESTION_DRAFT, { type: "back" })).toBe(EMPTY_QUESTION_DRAFT);
    const questions = [single, secret];
    const forward = run(questions, { type: "choose", question: single, option: 1 }, { type: "next", questions }, { type: "text", questionId: "key", text: "sk-123" });
    const back = questionDraft(forward, { type: "back" });
    expect(back.step).toBe(0);
    expect(back.choices).toEqual(forward.choices);
    // A secret answer is kept, still typed, for when the person comes forward again.
    const again = questionDraft(back, { type: "next", questions });
    expect(again.step).toBe(1);
    expect(again.choices["key"]).toEqual({ selected: [], other: false, text: "sk-123" });
  });

  test("each question is judged on its own: one choice answers a several-choice question; Other with only spaces does not", () => {
    expect(questionAnswered(several, EMPTY_QUESTION_DRAFT)).toBe(false);
    expect(questionAnswered(several, run([several], { type: "choose", question: several, option: 2 }))).toBe(true);
    const blank = run([single], { type: "other", question: single }, { type: "text", questionId: "0", text: "   " });
    expect(questionAnswered(single, blank)).toBe(false);
    expect(questionAnswered(single, questionDraft(blank, { type: "text", questionId: "0", text: " Both " }))).toBe(true);
    // A question without options is answered by its text.
    expect(questionAnswered(textOnly, run([textOnly], { type: "text", questionId: "name", text: "Header" }))).toBe(true);
    // Another question's answer does not count for this one.
    expect(questionAnswered(several, run([single], { type: "choose", question: single, option: 0 }))).toBe(false);
  });

  test("the shared button is Next before the last step and Send on it, on only when the question in view has an answer", () => {
    expect(stepButton(three, EMPTY_QUESTION_DRAFT)).toEqual({ kind: "next", enabled: false });
    const first = run(three, { type: "choose", question: single, option: 0 });
    expect(stepButton(three, first)).toEqual({ kind: "next", enabled: true });
    const last = run(three, { type: "choose", question: single, option: 0 }, next, { type: "choose", question: several, option: 1 }, next);
    expect(lastStep(three, last)).toBe(true);
    expect(lastStep(three, first)).toBe(false);
    expect(stepButton(three, last)).toEqual({ kind: "send", enabled: false });
    const ready = questionDraft(last, { type: "text", questionId: "name", text: "Header" });
    expect(stepButton(three, ready)).toEqual({ kind: "send", enabled: true });
    // A single question has only the last step.
    expect(lastStep([single], EMPTY_QUESTION_DRAFT)).toBe(true);
    expect(stepButton([single], run([single], { type: "choose", question: single, option: 0 }))).toEqual({ kind: "send", enabled: true });
    // Locked while sending.
    expect(stepButton(three, questionDraft(first, { type: "sending", how: "answer" })).enabled).toBe(false);
  });

  test("Return in Other's field presses Next before the last step and Send on it, only while that is on", () => {
    const blank = run(three, { type: "other", question: single });
    expect(otherReturn(three, blank)).toBeNull();
    const typed = questionDraft(blank, { type: "text", questionId: "0", text: "Both" });
    expect(otherReturn(three, typed)).toBe("next");
    const last = run(three, { type: "other", question: single }, { type: "text", questionId: "0", text: "Both" }, next,
      { type: "choose", question: several, option: 0 }, next, { type: "text", questionId: "name", text: "Header" });
    expect(otherReturn(three, last)).toBe("send");
    expect(otherReturn(three, questionDraft(last, { type: "sending", how: "answer" }))).toBeNull();
  });

  test("while sending, the steps are locked; a refused send keeps the step and every answer", () => {
    const second = run(three, { type: "choose", question: single, option: 0 }, next, { type: "choose", question: several, option: 1 });
    const sending = questionDraft(second, { type: "sending", how: "answer" });
    expect(questionDraft(sending, { type: "back" })).toBe(sending);
    expect(questionDraft(sending, next)).toBe(sending);
    const failed = questionDraft(sending, { type: "failed" });
    expect(failed).toEqual({ choices: second.choices, step: 1, sending: null, failed: "answer" });
  });
});
