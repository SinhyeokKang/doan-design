import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Question } from "../main/conversation/question";
import { AnswerPopover, popoverCramped, popoverFloor, type AnswerPopoverProps } from "./AnswerPopover";
import { Tooltip, TooltipProvider } from "./components/ui/tooltip";
import { EMPTY_QUESTION_DRAFT, questionDraft, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import type { ThreadItem } from "./threadItems";

// No DOM here: the popover is drawn to markup, and its handlers are called from the element tree it returns.

const layout: Question = { id: "0", header: "Layout", question: "Which layout should the settings header use?", options: [{ label: "Compact", description: "Title and actions on one line" }, { label: "Two rows" }], multiSelect: false, other: true };
const sections: Question = { id: "1", header: "Sections", question: "Which sections should the Settings page keep?", options: [{ label: "Agents" }, { label: "Notifications" }], multiSelect: true, other: true };
const name: Question = { id: "n", header: "Canvas name", question: "What should the new canvas be called?", options: [], multiSelect: false, other: true };
const token: Question = { id: "t", header: "Staging token", question: "Paste the token", options: [], multiSelect: false, other: true, secret: true };
// Antigravity's: no header, no Other.
const bare: Question = { id: "0", header: "", question: "Which colour?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false };
type QuestionItem = Extract<ThreadItem, { kind: "question" }>;
type PermissionItem = Extract<ThreadItem, { kind: "permission" }>;
const asked = (questions: Question[], patch: Partial<QuestionItem> = {}): QuestionItem => ({ kind: "question", key: "Qq1", seq: 5, requestId: "q1", questions, status: "pending", answers: null, ...patch });
const permission: PermissionItem = { kind: "permission", key: "pr1", seq: 5, requestId: "r1", summary: "npm --prefix app run build", reason: "Build the app to check the header compiles.", status: "pending", answer: null,
  options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "always", label: "Always allow", kind: "allowAlways", detail: "Claude can run npm commands in this project without asking again." }, { id: "deny", label: "Deny", kind: "deny" }] };

const noop = () => {};
const popoverProps = (patch: Partial<AnswerPopoverProps> = {}): AnswerPopoverProps => ({
  item: asked([layout]), provider: "claude", count: 1, base: "b", collapsed: false, announce: 0, draft: EMPTY_QUESTION_DRAFT, pressed: null, failed: false,
  onAnswer: noop, onDraft: noop, onNext: noop, onBack: noop, onSend: noop, onSkip: noop, onStop: noop, onCollapse: noop, onExpand: noop, onEscape: noop, ...patch,
});
// React puts an image preload link before the markup; the popover's own markup is what follows it.
const html = (patch: Partial<AnswerPopoverProps> = {}) => renderToStaticMarkup(<TooltipProvider><AnswerPopover {...popoverProps(patch)} /></TooltipProvider>).replace(/^<link[^>]*>/, "");
const draftOf = (...actions: QuestionDraftAction[]): QuestionDraft => actions.reduce(questionDraft, EMPTY_QUESTION_DRAFT);

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const tree = (patch: Partial<AnswerPopoverProps> = {}) => all(AnswerPopover(popoverProps(patch)));
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";
const button = (elements: ReactElement<Record<string, unknown>>[], label: string) => elements.find(el => el.type === "button" && textOf(el.props.children as ReactNode) === label)!;
const inputs = (elements: ReactElement<Record<string, unknown>>[]) => elements.filter(el => el.type === "input");
const click = (el: ReactElement<Record<string, unknown>>) => (el.props.onClick as () => void)();
const root = (patch: Partial<AnswerPopoverProps> = {}) => tree(patch)[0]!;
const key = (event: Record<string, unknown>) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(), defaultPrevented: false, nativeEvent: { isComposing: false, keyCode: 0 }, ...event });

afterEach(() => vi.unstubAllGlobals());

describe("the popover", () => {
  test("a region named by its head: the provider mark, “<Provider> needs your answer” and Collapse; the request id names its place", () => {
    const out = html();
    expect(out).toMatch(/^<div class="ap" id="b-ap" role="region" aria-labelledby="b-ap-title" data-item="Qq1">/);
    expect(out).toContain('<div class="ap-head"><span class="strip-agent"><img class="logo" src="provider-logos/claude.png" alt=""/></span><b id="b-ap-title">Claude Code needs your answer</b><span></span>');
    expect(out).toMatch(/<button type="button" class="doan-icon-button" data-ui-size="sm" aria-label="Collapse" aria-expanded="true" aria-controls="b-ap"[^>]*><svg/);
    // No order while one request waits; no step for a single question.
    expect(out).not.toContain("ap-order");
    expect(out).not.toContain("ap-step");
  });

  test("with two waiting requests the head shows the order before Collapse", () => {
    expect(html({ count: 2 })).toContain('<b id="b-ap-title">Claude Code needs your answer</b><span class="ap-order">1 of 2 requests</span>');
  });

  test("collapsed: one bar button with the head's mark, title and order, no body or buttons", () => {
    const out = html({ count: 2, collapsed: true });
    expect(out).toMatch(/^<div class="ap" id="b-ap" role="region" aria-labelledby="b-ap-title" data-item="Qq1" data-collapsed="">/);
    expect(out).toMatch(/<button type="button" class="ap-bar" aria-expanded="false" aria-controls="b-ap" aria-label="Claude Code needs your answer · 1 of 2 requests"><span class="strip-agent"><img class="logo" src="provider-logos\/claude.png" alt=""\/><\/span><b id="b-ap-title">Claude Code needs your answer<\/b><span class="ap-order">1 of 2 requests<\/span><span class="bar-chev"><svg/);
    expect(out).not.toContain("ap-body");
    expect(out).not.toContain("ap-actions");
    expect(html({ collapsed: true })).toContain('aria-label="Claude Code needs your answer"');
    const onExpand = vi.fn();
    click(tree({ collapsed: true, onExpand }).find(el => el.props.className === "ap-bar")!);
    expect(onExpand).toHaveBeenCalledOnce();
  });

  test("Collapse folds it", () => {
    const onCollapse = vi.fn();
    click(tree({ onCollapse }).find(el => el.type === "button" && el.props["aria-label"] === "Collapse")!);
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  // Focus left on a control of an ended request must not land on the next request's control in the same place.
  test("each request draws its own subtree under the kept surface, keyed by the request", () => {
    for (const [item, collapsed] of [[asked([layout]), false], [permission, false], [permission, true]] as const) {
      const inner = (root({ item, collapsed }).props.children as ReactNode[]).filter(isValidElement);
      expect(inner.map(el => el.key), `${item.key} collapsed=${collapsed}`).toEqual([item.key]);
    }
  });

  test("announce > 0 reads the title once more in an alert keyed by it; 0 reads nothing", () => {
    expect(html()).not.toContain('role="alert"');
    const els = tree({ announce: 3 });
    const alert = els.find(el => el.props.role === "alert")!;
    expect(alert.key).toBe("3");
    expect(alert.props.className).toBe("sr-only");
    expect(textOf(alert.props.children as ReactNode)).toBe("Claude Code needs your answer");
  });

  test("labels and descriptions are drawn in full, never cut", () => {
    const long = "fix/header-overflow-on-narrow-panels-when-the-project-name-is-long".repeat(4);
    expect(html({ item: asked([{ ...layout, options: [{ label: long, description: long }] }]) }).split(long)).toHaveLength(3);
  });
});

describe("keys", () => {
  test("Esc collapses and stops there, sending focus on by onEscape", () => {
    const onEscape = vi.fn();
    const event = key({ key: "Escape" });
    (root({ onEscape }).props.onKeyDown as (e: unknown) => void)(event);
    expect(onEscape).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  // An open tooltip takes the first Esc (Radix prevents its default); an Esc that ends an IME composition is the IME's.
  test("Esc a tooltip or an IME already used does not collapse, and never leaves the popover", () => {
    for (const event of [key({ key: "Escape", defaultPrevented: true }), key({ key: "Escape", nativeEvent: { isComposing: true, keyCode: 0 } }), key({ key: "Escape", nativeEvent: { isComposing: false, keyCode: 229 } })]) {
      const onEscape = vi.fn();
      (root({ onEscape }).props.onKeyDown as (e: unknown) => void)(event);
      expect(onEscape).not.toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    }
  });

  test("Esc on the bar does nothing, and does not reach the canvas tools either", () => {
    const onEscape = vi.fn(), event = key({ key: "Escape" });
    (root({ collapsed: true, onEscape }).props.onKeyDown as (e: unknown) => void)(event);
    expect(onEscape).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("other keys pass", () => {
    const event = key({ key: "a" });
    (root().props.onKeyDown as (e: unknown) => void)(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  // Holding Return as the popover opens must not allow a permission.
  test("an auto-repeated Return or Space on a button or choice is ignored; typing in a field is not", () => {
    const capture = root().props.onKeyDownCapture as (e: unknown) => void;
    for (const target of [{ tagName: "BUTTON" }, { tagName: "INPUT", type: "radio" }, { tagName: "INPUT", type: "checkbox" }]) {
      for (const pressed of ["Enter", " "]) {
        const event = key({ key: pressed, repeat: true, target });
        capture(event);
        expect(event.preventDefault, `${target.tagName} ${pressed}`).toHaveBeenCalled();
      }
    }
    for (const event of [key({ key: "Enter", repeat: false, target: { tagName: "BUTTON" } }), key({ key: " ", repeat: true, target: { tagName: "INPUT", type: "text" } }), key({ key: "a", repeat: true, target: { tagName: "BUTTON" } })]) {
      capture(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });
});

describe("a question", () => {
  test("one question: its sentence under the head, its options in a group named by header and question, Send · Skip · Stop", () => {
    const out = html();
    expect(out).toContain('<div class="ap-body doan-scroll" id="b-ap-body"><div class="ap-question" role="radiogroup" aria-label="Layout: Which layout should the settings header use?"><div class="ap-q"><span class="ap-q-text">Which layout should the settings header use?</span></div>');
    expect(out).toContain('<div class="q-opts doan-settings-group q-group">');
    expect(out).toMatch(/<div class="ap-actions"><span class="ap-group"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Skip<\/button><button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*>.*?<\/svg>Stop<\/button><\/span><span class="ap-group end"><button type="button" class="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled="true"[^>]*>Send<\/button><\/span><\/div>/);
  });

  test("options are Settings rows named by their label line and described by their description; Other closes a list that allows it", () => {
    const out = html({ item: asked([layout]) });
    expect(out).toMatch(/<label class="doan-preference-row q-pref" data-has-icon=""><input type="radio" aria-labelledby="b-q1-0-l0" aria-describedby="b-q1-0-d0" data-entry="" name="b-q1-0"\/><span class="doan-preference-row-icon"><span class="ob-radio" aria-hidden="true"><\/span><\/span><span class="doan-preference-row-content"><span class="doan-preference-row-label" id="b-q1-0-l0">Compact<\/span><span class="doan-preference-row-description" id="b-q1-0-d0">Title and actions on one line<\/span><\/span><\/label>/);
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l1" name="b-q1-0"\/>/);
    expect(out).toContain('<span class="doan-preference-row-label" id="b-q1-0-lother">Other</span>');
    const several = html({ item: asked([sections]) });
    expect(several).toContain('role="group" aria-label="Sections: Which sections should the Settings page keep?"');
    expect(several).toMatch(/<input type="checkbox" aria-labelledby="b-q1-1-l0" data-entry="" name="b-q1-1"\/><span class="doan-preference-row-icon"><span class="doan-checkbox q-check" aria-hidden="true"><\/span>/);
  });

  test("Antigravity's question: named by its sentence alone, no Other", () => {
    const out = html({ item: asked([bare]) });
    expect(out).toContain('role="radiogroup" aria-label="Which colour?"');
    expect(out).not.toContain(">Other<");
  });

  test("a question without options is answered in its input alone, which takes entry focus; a secret one is masked", () => {
    const out = html({ item: asked([name]) });
    expect(out).toContain('<div class="ap-question" role="group" aria-label="Canvas name: What should the new canvas be called?"><div class="ap-q"><span class="ap-q-text">What should the new canvas be called?</span></div><input class="doan-input q-input q-text-answer" type="text" placeholder="Type your answer" aria-label="Canvas name: answer" maxLength="4096" id="b-q1-n-other" data-entry="" value=""/></div>');
    expect(html({ item: asked([token]) })).toContain('type="password"');
  });

  test("entry focus is the chosen option, else the first", () => {
    const out = html({ item: asked([layout]), draft: draftOf({ type: "choose", question: layout, option: 1 }) });
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l0" aria-describedby="b-q1-0-d0" name="b-q1-0"\/>/);
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l1" data-entry="" name="b-q1-0" checked=""\/>/);
    expect(out.match(/data-entry/g)).toHaveLength(1);
  });

  test("chosen options show by their control; Other chosen opens its input, masked for a secret question", () => {
    const draft = draftOf({ type: "other", question: layout }, { type: "text", questionId: "0", text: "Both" });
    const out = html({ draft });
    expect(out).toContain('<span class="doan-preference-row-extra"><input class="doan-input q-input" type="text" placeholder="Type your answer" aria-label="Other answer" maxLength="4096" id="b-q1-0-other" value="Both"/></span>');
    expect(html({ item: asked([{ ...layout, secret: true }]), draft })).toContain('type="password" placeholder="Type your answer" aria-label="Other answer"');
  });

  test("Send off says why in its tooltip; Send, Skip and Stop act only as they may", () => {
    const onSend = vi.fn(), onSkip = vi.fn(), onStop = vi.fn();
    const off = tree({ onSend, onSkip, onStop });
    expect(off.some(el => typeof el.type !== "string" && textOf(el.props.children as ReactNode) === "Choose or type an answer first.")).toBe(true);
    expect(off.some(el => textOf(el.props.children as ReactNode) === "Answer each question first.")).toBe(false);
    click(button(off, "Send"));
    expect(onSend).not.toHaveBeenCalled();
    const ready = tree({ onSend, onSkip, onStop, draft: draftOf({ type: "choose", question: layout, option: 0 }) });
    expect(button(ready, "Send").props["aria-disabled"]).toBeUndefined();
    click(button(ready, "Send"));
    click(button(ready, "Skip"));
    click(button(ready, "Stop"));
    expect([onSend.mock.calls.length, onSkip.mock.calls.length, onStop.mock.calls.length]).toEqual([1, 1, 1]);
  });

  // The tooltip wraps the button in every state, so the button stays the same element when it turns on or off; only its
  // content comes and goes, so the tooltip never switches between controlled and uncontrolled.
  test("the Send tooltip has its reason only while Send cannot send, and the button keeps its place", () => {
    const tip = (draft: QuestionDraft) => tree({ draft }).find(el => el.type === Tooltip && all(el.props.children as ReactNode).some(child => child.props.className === "doan-button q-send"))!;
    const reason = (draft: QuestionDraft) => all(tip(draft).props.children as ReactNode).some(el => textOf(el.props.children as ReactNode) === "Choose or type an answer first.");
    for (const draft of [EMPTY_QUESTION_DRAFT, draftOf({ type: "choose", question: layout, option: 0 })]) expect("open" in tip(draft).props).toBe(false);
    expect(reason(EMPTY_QUESTION_DRAFT)).toBe(true);
    expect(reason(draftOf({ type: "choose", question: layout, option: 0 }))).toBe(false);
  });

  test("choosing an option or Other edits the draft by the question; typing edits its text", () => {
    vi.stubGlobal("document", { getElementById: () => null });
    const onDraft = vi.fn();
    const els = tree({ onDraft });
    const [compact, , other] = inputs(els);
    (compact!.props.onChange as () => void)();
    (other!.props.onChange as () => void)();
    const field = inputs(tree({ onDraft, item: asked([name]) }))[0]!;
    (field.props.onChange as (e: unknown) => void)({ currentTarget: { value: "Header" } });
    expect(onDraft.mock.calls.map(call => call[0])).toEqual([{ type: "choose", question: layout, option: 0 }, { type: "other", question: layout }, { type: "text", questionId: "n", text: "Header" }]);
  });

  test("Other chosen by click or Space moves focus into its input; arrowing past it only opens it", async () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: (id: string) => id === "b-q1-0-other" ? { focus } : null });
    const radios = inputs(tree());
    (radios[2]!.props.onChange as () => void)();
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
    (radios[1]!.props.onKeyDown as (e: unknown) => void)({ key: "ArrowDown" });
    (radios[2]!.props.onChange as () => void)();
    (radios[2]!.props.onKeyUp as (e: unknown) => void)({ key: "ArrowDown" });
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test("sending: Send is busy with a spinner, the choices and Skip are read-only, Stop stays live", () => {
    const onSend = vi.fn(), onSkip = vi.fn(), onStop = vi.fn();
    const draft = questionDraft(draftOf({ type: "choose", question: layout, option: 1 }), { type: "sending", how: "answer" });
    const out = html({ draft });
    expect(out).toMatch(/^<div class="ap is-locked"/);
    expect(out).toContain('<button type="button" class="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled="true" aria-busy="true" data-state="closed" data-slot="tooltip-trigger"><span class="doan-spinner" aria-hidden="true"></span>Send</button>');
    expect(out).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-disabled="true">Skip</button>');
    const els = tree({ draft, onSend, onSkip, onStop });
    click(button(els, "Send"));
    click(button(els, "Skip"));
    click(button(els, "Stop"));
    expect([onSend.mock.calls.length, onSkip.mock.calls.length, onStop.mock.calls.length]).toEqual([0, 0, 1]);
    expect(inputs(els).every(el => el.props["aria-disabled"] === true)).toBe(true);
  });

  test("a failed send keeps the choices and says so under the buttons; a failed Skip says the question was not skipped", () => {
    const failed = (how: "answer" | "skip") => questionDraft(questionDraft(draftOf({ type: "choose", question: layout, option: 1 }), { type: "sending", how }), { type: "failed" });
    const out = html({ draft: failed("answer") });
    expect(out).toMatch(/<\/div><div class="ap-error"><p class="settings-msg error ask-error" role="alert"><svg[^>]*class="[^"]*doan-alert-icon[^"]*"[^>]*>.*?<\/svg><span>Couldn’t send your answer\. Try again\.<\/span><\/p><\/div><\/div>$/);
    expect(out).toMatch(/name="b-q1-0" checked=""/);
    expect(html({ draft: failed("skip") })).toContain("<span>Couldn’t skip the question. Try again.</span>");
  });
});

describe("several questions", () => {
  const three = [layout, sections, name];
  const step = (n: number, ...answers: QuestionDraftAction[]) => {
    let draft = draftOf(...answers);
    for (let i = 0; i < n; i++) draft = questionDraft(draft, { type: "next", questions: three });
    return draft;
  };
  const first = [{ type: "choose", question: layout, option: 0 }, { type: "choose", question: sections, option: 1 }] as const;

  test("one question at a time with its step, which also leads the group's name", () => {
    const out = html({ item: asked(three), draft: step(1, ...first) });
    expect(out).toContain('<div class="ap-question" role="group" aria-label="Question 2 of 3, Sections: Which sections should the Settings page keep?"><div class="ap-q"><span class="ap-step">Question 2 of 3</span><span class="ap-q-text">Which sections should the Settings page keep?</span></div>');
    expect(out).not.toContain("Which layout should");
    expect(html({ item: asked(three) })).toContain('aria-label="Question 1 of 3, Layout: Which layout should the settings header use?"');
  });

  test("Skip all and Stop on every step; Back from the second; Next before the last step and Send on it, in the same place", () => {
    const end = (draft: QuestionDraft) => tree({ item: asked(three), draft }).find(el => el.props.className === "ap-group end")!;
    const labels = (draft: QuestionDraft) => all(end(draft).props.children as ReactNode).filter(el => el.type === "button").map(el => textOf(el.props.children as ReactNode));
    expect(labels(EMPTY_QUESTION_DRAFT)).toEqual(["Next"]);
    expect(labels(step(1, ...first))).toEqual(["Back", "Next"]);
    expect(labels(step(2, ...first))).toEqual(["Back", "Send"]);
    // The primary sits in the same child slot whether Back shows or not.
    const slot = (draft: QuestionDraft) => (end(draft).props.children as unknown[]).findIndex(child => isValidElement(child) && typeof child.type !== "string");
    expect(slot(EMPTY_QUESTION_DRAFT)).toBe(slot(step(2, ...first)));
    for (const draft of [EMPTY_QUESTION_DRAFT, step(2, ...first)]) expect(html({ item: asked(three), draft })).toContain('data-ui-variant="subtle">Skip all</button>');
  });

  test("Next is on only when the question in view has an answer; one choice of several is enough; Other with spaces is not", () => {
    const next = (draft: QuestionDraft) => button(tree({ item: asked(three), draft }), "Next");
    expect(next(EMPTY_QUESTION_DRAFT).props["aria-disabled"]).toBe(true);
    expect(next(draftOf(first[0])).props["aria-disabled"]).toBeUndefined();
    expect(next(step(1, first[0])).props["aria-disabled"]).toBe(true);
    expect(next(step(1, ...first)).props["aria-disabled"]).toBeUndefined();
    expect(next(draftOf({ type: "other", question: layout }, { type: "text", questionId: "0", text: "   " })).props["aria-disabled"]).toBe(true);
  });

  test("Next, Back and Send call their handlers only when on", () => {
    const onNext = vi.fn(), onBack = vi.fn(), onSend = vi.fn();
    click(button(tree({ item: asked(three), onNext }), "Next"));
    expect(onNext).not.toHaveBeenCalled();
    click(button(tree({ item: asked(three), draft: draftOf(first[0]), onNext }), "Next"));
    click(button(tree({ item: asked(three), draft: step(1, ...first), onBack }), "Back"));
    const last = questionDraft(step(2, ...first), { type: "text", questionId: "n", text: "Header" });
    click(button(tree({ item: asked(three), draft: last, onSend }), "Send"));
    click(button(tree({ item: asked(three), draft: questionDraft(last, { type: "sending", how: "answer" }), onBack }), "Back"));
    expect([onNext.mock.calls.length, onBack.mock.calls.length, onSend.mock.calls.length]).toEqual([1, 1, 1]);
  });

  test("Return in an Other or answer field presses Next before the last step and Send on it, only while on and never mid-IME", () => {
    const onNext = vi.fn(), onSend = vi.fn();
    const press = (draft: QuestionDraft, nativeEvent: Record<string, unknown>) => {
      const field = inputs(tree({ item: asked(three), draft, onNext, onSend })).find(el => el.props.type === "text")!;
      (field.props.onKeyDown as (e: unknown) => void)({ key: "Enter", nativeEvent, preventDefault: noop });
    };
    const typed = draftOf({ type: "other", question: layout }, { type: "text", questionId: "0", text: "Both" });
    press(typed, { isComposing: true });
    press(typed, { isComposing: false, keyCode: 229 });
    press(draftOf({ type: "other", question: layout }), { isComposing: false });
    expect(onNext).not.toHaveBeenCalled();
    press(typed, { isComposing: false });
    expect(onNext).toHaveBeenCalledOnce();
    const last = questionDraft(step(2, ...first), { type: "text", questionId: "n", text: "Header" });
    press(last, { isComposing: false });
    expect(onSend).toHaveBeenCalledOnce();
  });

  test("a secret answer stays masked after Back and forward again", () => {
    const questions = [layout, token];
    let draft = draftOf({ type: "choose", question: layout, option: 0 });
    draft = questionDraft(draft, { type: "next", questions });
    draft = questionDraft(draft, { type: "text", questionId: "t", text: "sk-123" });
    draft = questionDraft(questionDraft(draft, { type: "back" }), { type: "next", questions });
    expect(html({ item: asked(questions), draft })).toContain('type="password" placeholder="Type your answer" aria-label="Staging token: answer" maxLength="4096" id="b-q1-t-other" data-entry="" value="sk-123"');
  });

  test("a failed send keeps the step and its answers", () => {
    const draft = questionDraft(questionDraft(questionDraft(step(2, ...first), { type: "text", questionId: "n", text: "Header" }), { type: "sending", how: "answer" }), { type: "failed" });
    const out = html({ item: asked(three), draft });
    expect(out).toContain("Question 3 of 3");
    expect(out).toContain('value="Header"');
    expect(out).toContain("Couldn’t send your answer. Try again.");
  });

  test("the order and the step show together", () => {
    const out = html({ item: asked(three), count: 2, draft: step(1, ...first) });
    expect(out).toContain('<span class="ap-order">1 of 2 requests</span>');
    expect(out).toContain('<span class="ap-step">Question 2 of 3</span>');
  });
});

describe("a permission request", () => {
  test("what will run leads, then the agent's reason, then what a saving choice adds; the first button takes entry focus", () => {
    const out = html({ item: permission });
    expect(out).toMatch(/^<div class="ap" id="b-ap" role="region" aria-labelledby="b-ap-title" data-item="pr1">/);
    expect(out).toContain('<div class="ap-body doan-scroll" id="b-ap-body"><div class="strip-text selectable"><span class="ask-command">npm --prefix app run build</span><span class="ask-reason">Build the app to check the header compiles.</span><span class="ask-saves">Always allow: Claude can run npm commands in this project without asking again.</span></div></div>');
    expect(out).toMatch(/<div class="ap-actions perm"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="prominent" data-request="r1" data-entry="">Allow<\/button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle" data-request="r1">Always allow<\/button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle" data-request="r1">Deny<\/button><button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*>.*?<\/svg>Stop<\/button><\/div>/);
  });

  test("a press answers once: the pressed button spins, the others lock, Stop stays live", () => {
    const onAnswer = vi.fn(), onStop = vi.fn();
    click(button(tree({ item: permission, onAnswer }), "Always allow"));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("always");
    const out = html({ item: permission, pressed: "allow" });
    expect(out).toMatch(/^<div class="ap is-locked"/);
    expect(out).toContain('data-ui-variant="prominent" data-request="r1" data-entry="" aria-disabled="true" aria-busy="true"><span class="doan-spinner" aria-hidden="true"></span>Allow</button>');
    expect(out).toContain('data-ui-variant="subtle" data-request="r1" aria-disabled="true">Deny</button>');
    const els = tree({ item: permission, pressed: "allow", onAnswer, onStop });
    click(button(els, "Deny"));
    click(button(els, "Stop"));
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });

  test("a refused answer asks to choose again under the buttons", () => {
    expect(html({ item: permission, failed: true })).toMatch(/<div class="ap-error"><p class="settings-msg error ask-error" role="alert"><svg[^>]*>.*?<\/svg><span>Couldn’t send your answer\. Choose again\.<\/span><\/p><\/div><\/div>$/);
  });
});

// The head and the buttons always show: past the cap the popover keeps their height (with the body's padding) and rises
// over the thread area's top, but no higher than the conversation panel's top.
describe("popoverFloor", () => {
  test("the head and button rows plus the body's padding, within the room up to the panel's top", () => {
    expect(popoverFloor({ chrome: [40, 96], bodyPadding: 8, room: 300 })).toBe(144);
    expect(popoverFloor({ chrome: [48], bodyPadding: 0, room: 300 })).toBe(48);
    expect(popoverFloor({ chrome: [40, 96, 32], bodyPadding: 8, room: 120 })).toBe(120);
    expect(popoverFloor({ chrome: [], bodyPadding: 0, room: 0 })).toBe(0);
  });
});

// Where even the full rise cannot hold the head and the buttons, the head stays and the body and the buttons scroll
// together under it, so the popover never lies over the composer.
describe("popoverCramped", () => {
  test("only when the head and button rows with the body's padding are taller than the room up to the panel's top", () => {
    expect(popoverCramped({ chrome: [40, 96], bodyPadding: 8, room: 108 })).toBe(true);
    expect(popoverCramped({ chrome: [40, 96], bodyPadding: 8, room: 144 })).toBe(false);
    expect(popoverCramped({ chrome: [48], bodyPadding: 0, room: 52 })).toBe(false);
  });
});

describe("styles", () => {
  const css = readFileSync(new URL("styles.css", import.meta.url), "utf8");
  // A body past the cap fades at its lower edge; one that fits (an inactive scroll timeline) draws none.
  test("the body fades at its lower edge only while it scrolls", () => {
    expect(css).toContain(".conversation-thread .ap-body { animation: ap-body-fade linear both; animation-timeline: scroll(self); }");
    expect(css).toContain("@keyframes ap-body-fade { from, 99% { mask-image: linear-gradient(to bottom, black calc(100% - var(--space-6)), transparent); } to { mask-image: none; } }");
  });

  test("a cramped popover scrolls its body and buttons together under a sticky head", () => {
    expect(css).toContain(".conversation-thread .ap[data-cramped] { overflow-y: auto; scroll-padding-top: calc(var(--size-control-sm) + var(--space-2)); }");
    expect(css).toContain(".conversation-thread .ap[data-cramped] > .ap-head { position: sticky; top: 0; z-index: 1; background: var(--surface-panel); }");
    expect(css).toContain(".conversation-thread .ap[data-cramped] > .ap-body { flex: none; overflow: visible; animation: none; }");
  });

  // While an answer is out, every control but Send (which keeps its fill with the spinner) reads as off, the pressed
  // permission button and the option rows included.
  test("a locked popover dims its option rows and every unavailable control but Send", () => {
    expect(css).toContain('.conversation-thread .ap.is-locked :is([aria-disabled="true"]:not(.q-send), .q-pref) { color: var(--text-disabled); cursor: default; }');
  });
});
