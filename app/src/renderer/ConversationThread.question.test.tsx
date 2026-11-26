import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Question } from "../main/conversation/question";
import { answerRefusal, ConversationThread, settleQuestionSend, type ConversationThreadProps } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";
import { EMPTY_QUESTION_DRAFT, questionDraft, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import type { ThreadItem } from "./threadItems";

// No DOM here: the thread is drawn to markup. The popover itself is AnswerPopover.test.tsx.

const layout: Question = { id: "0", header: "Layout", question: "Which layout should the settings header use?", options: [{ label: "Compact", description: "Title and actions on one line" }, { label: "Two rows" }], multiSelect: false, other: true };
const sections: Question = { id: "1", header: "Sections", question: "Which sections should the Settings page keep?", options: [{ label: "Agents" }, { label: "Notifications" }], multiSelect: true, other: true };
type QuestionItem = Extract<ThreadItem, { kind: "question" }>;
const item = (questions: Question[], patch: Partial<QuestionItem> = {}): QuestionItem => ({ kind: "question", key: "Qq1", seq: 5, requestId: "q1", questions, status: "pending", answers: null, ...patch });

const noop = () => {};
const draftOf = (...actions: QuestionDraftAction[]): QuestionDraft => actions.reduce(questionDraft, EMPTY_QUESTION_DRAFT);
const permission = (patch: Partial<Extract<ThreadItem, { kind: "permission" }>> = {}): ThreadItem => ({ kind: "permission", key: "pr1", seq: 4, requestId: "r1", summary: "npm test", status: "pending", answer: null,
  options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "deny", label: "Deny", kind: "deny" }], ...patch });

afterEach(() => vi.unstubAllGlobals());

describe("the thread's question items", () => {
  const props = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
    items, conversationId: "c1", provider: "claude", project: "doan-design", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
    onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
  });
  const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<TooltipProvider><ConversationThread {...props(items, patch)} /></TooltipProvider>);

  // The thread's own scroller holds no card while a request waits; the popover after it does.
  const inThread = (out: string) => out.slice(0, out.indexOf('<div class="ap"'));
  test("a pending question has no card in the thread: the popover after the scroller holds it, with the host's draft", () => {
    const draft = draftOf({ type: "choose", question: layout, option: 1 });
    const out = html([item([layout], { seq: 3 })], { liveAfter: 2, questionDraft: id => id === "q1" ? draft : EMPTY_QUESTION_DRAFT });
    expect(out).not.toContain('data-item="Qq1"><div');
    expect(out).toMatch(/<\/div><\/div><div class="ap" id="[^"]*-ap" role="region" aria-labelledby="[^"]*-ap-title" data-item="Qq1">/);
    expect(inThread(out)).not.toContain("Which layout");
    expect(out).toMatch(/<input type="radio" aria-labelledby="[^"]*-q1-0-l1" data-entry="" name="[^"]*-q1-0" checked=""/);
    expect(out).toContain('<div class="sr-only" role="status">Claude Code needs your answer</div>');
  });

  test("a pending permission request has no card in the thread either; the popover holds it", () => {
    const out = html([permission()], { liveAfter: 10 });
    expect(inThread(out)).not.toContain("npm test");
    expect(out).toContain('data-item="pr1"><div class="ap-head">');
    expect(out).toContain('<span class="ask-command">npm test</span>');
  });

  test("two waiting requests: the earliest shows with the order; the later one is not drawn", () => {
    const out = html([permission(), item([layout], { seq: 6 })]);
    expect(out).toContain('data-item="pr1"');
    expect(out).toContain('<span class="ap-order">1 of 2 requests</span>');
    expect(out).not.toContain("Which layout");
  });

  test("the host's fold shows the bar, asked with the waiting requests' ids", () => {
    const asked: (readonly string[])[] = [];
    const out = html([permission(), item([layout], { seq: 6 })], { popoverCollapsed: waiting => { asked.push(waiting); return true; } });
    expect(out).toContain('class="ap-bar" aria-expanded="false"');
    expect(asked).toContainEqual(["r1", "q1"]);
  });

  test("with nothing waiting there is no popover", () => {
    expect(html([permission({ status: "answered", answer: { id: "allow", label: "Allow", kind: "allow" } })])).not.toContain('class="ap');
  });

  test("a finished question folds to its lines, each ellipsized with its full text as the tooltip", () => {
    const answered = item([layout, sections], { status: "answered", answers: { "0": { selected: ["Two rows"] }, "1": { selected: ["Agents"], other: "Keyboard shortcuts" } } });
    const out = html([answered, item([layout], { key: "Qq2", requestId: "q2", status: "skipped" }), item([layout], { key: "Qq3", requestId: "q3", status: "expired" })]);
    expect(out).toContain('<div class="thread-item" data-item="Qq1"><div class="q-folded"><div class="activity"><div class="activity-head ask-answered"><span class="selectable" data-state="closed" data-slot="tooltip-trigger">Answered · Layout: Two rows</span></div></div><div class="activity"><div class="activity-head ask-answered"><span class="selectable" data-state="closed" data-slot="tooltip-trigger">Answered · Sections: Agents, Keyboard shortcuts</span></div></div></div></div>');
    expect(out).toContain('<span class="selectable" data-state="closed" data-slot="tooltip-trigger">Skipped · Layout</span>');
    expect(out).toContain('<span class="selectable" data-state="closed" data-slot="tooltip-trigger">Expired without an answer · Layout</span>');
    expect(out).not.toContain('class="ap');
    expect(out).toContain('<div class="sr-only" role="status"></div>');
  });

  test("every folded question line is selectable", () => {
    const answered = item([layout], { status: "answered", answers: { "0": { selected: ["Two rows"] } } });
    expect(html([answered, item([layout], { key: "Qq2", requestId: "q2", status: "skipped" })]).match(/<span class="selectable" data-state="closed" data-slot="tooltip-trigger">/g)).toHaveLength(2);
  });

  test("a header-less question (Antigravity) folds with its sentence", () => {
    const bare: Question = { id: "0", header: "", question: "Which colour?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false };
    expect(html([item([bare], { status: "answered", answers: { "0": { selected: ["Red"] } } })])).toContain('<span class="selectable" data-state="closed" data-slot="tooltip-trigger">Answered · Which colour?: Red</span>');
  });
});

describe("settleQuestionSend", () => {
  // main may keep a request pending after a stale reply until its own expiry resolves it, so the card folds only on
  // question.resolved and a stale reply leaves it locked without an error line.
  test("a stale reply keeps the card locked without an error; any other refusal unlocks it with the error", async () => {
    const edit = vi.fn();
    await settleQuestionSend(async () => ({ error: "stale" }), edit);
    await settleQuestionSend(async () => {}, edit);
    expect(edit).not.toHaveBeenCalled();
    await settleQuestionSend(async () => ({ error: "bad_request" }), edit);
    await settleQuestionSend(async () => { throw new Error("gone"); }, edit);
    expect(edit.mock.calls).toEqual([[{ type: "failed" }], [{ type: "failed" }]]);
  });
});

describe("answerRefusal", () => {
  test("null when the answer reached main; main's reason or unknown when it did not", async () => {
    expect(await answerRefusal(async () => {})).toBeNull();
    expect(await answerRefusal(() => undefined)).toBeNull();
    expect(await answerRefusal(async () => ({ error: "stale" }))).toBe("stale");
    expect(await answerRefusal(async () => { throw new Error("gone"); })).toBe("unknown");
  });
});
