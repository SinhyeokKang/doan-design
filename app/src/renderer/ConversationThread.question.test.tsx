import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Question } from "../main/conversation/question";
import { answerRefusal, ConversationThread, QuestionCard, settleQuestionSend, type ConversationThreadProps, type QuestionCardProps } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";
import { EMPTY_QUESTION_DRAFT, questionDraft, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import type { ThreadItem } from "./threadItems";

// agent-questions design §7 and the draft frames question-card, keyboard, send-states and folded. There is no DOM in
// these tests: the card is drawn to markup, and its handlers are called from the element tree it returns.

const layout: Question = { id: "0", header: "Layout", question: "Which layout should the settings header use?", options: [{ label: "Compact", description: "Title and actions on one line" }, { label: "Two rows" }], multiSelect: false, other: true };
const sections: Question = { id: "1", header: "Sections", question: "Which sections should the Settings page keep?", options: [{ label: "Agents" }, { label: "Notifications" }], multiSelect: true, other: true };
const name: Question = { id: "n", header: "Canvas name", question: "What should the new canvas be called?", options: [], multiSelect: false, other: true };
const token: Question = { id: "t", header: "Staging token", question: "Paste the token", options: [], multiSelect: false, other: true, secret: true };
const fixed: Question = { ...layout, id: "f", other: false };
type QuestionItem = Extract<ThreadItem, { kind: "question" }>;
const item = (questions: Question[], patch: Partial<QuestionItem> = {}): QuestionItem => ({ kind: "question", key: "Qq1", seq: 5, requestId: "q1", questions, status: "pending", answers: null, ...patch });

const noop = () => {};
const cardProps = (patch: Partial<QuestionCardProps> = {}): QuestionCardProps => ({
  item: item([layout]), provider: "claude", live: false, base: "b", draft: EMPTY_QUESTION_DRAFT, onDraft: noop, onSend: noop, onSkip: noop, onStop: noop, ...patch,
});
const card = (patch: Partial<QuestionCardProps> = {}) => renderToStaticMarkup(<TooltipProvider><QuestionCard {...cardProps(patch)} /></TooltipProvider>);
const draftOf = (questions: Question[], ...actions: QuestionDraftAction[]): QuestionDraft => actions.reduce(questionDraft, EMPTY_QUESTION_DRAFT);

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const tree = (patch: Partial<QuestionCardProps> = {}) => all(QuestionCard(cardProps(patch)));
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";
const button = (elements: ReactElement<Record<string, unknown>>[], label: string) => elements.find(el => el.type === "button" && textOf(el.props.children as ReactNode) === label)!;
const inputs = (elements: ReactElement<Record<string, unknown>>[]) => elements.filter(el => el.type === "input");

afterEach(() => vi.unstubAllGlobals());

describe("question card", () => {
  test("the notice with the provider mark and the first question as its title; no needs-your-answer title, no header chip", () => {
    const out = card({ item: item([layout, sections]) });
    expect(out).toContain('<div class="doan-notice thread-notice q-card">');
    expect(out).toContain('<span class="strip-agent doan-alert-icon"><img class="logo" src="provider-logos/claude.png" alt=""/></span>');
    expect(out).toContain('<span class="strip-text q-title"><b>Which layout should the settings header use?</b></span>');
    expect(out).not.toContain("needs your answer");
    expect(out).not.toContain("doan-chip");
    // The second question's sentence sits above its options in the same weight.
    expect(out).toContain('<div class="q-head"><span class="q-text">Which sections should the Settings page keep?</span></div>');
    // Each group is named by its header and question.
    expect(out).toContain('role="radiogroup" aria-label="Layout: Which layout should the settings header use?"');
    expect(out).toContain('role="group" aria-label="Sections: Which sections should the Settings page keep?"');
  });

  test("options are Settings rows: a radio or checkbox in the icon slot, the label and its description; Other closes a Claude list", () => {
    const out = card({ item: item([layout, sections]) });
    expect(out).toContain('<div class="q-opts doan-settings-group q-group">');
    expect(out).toMatch(/<label class="doan-preference-row q-pref" data-has-icon=""><input type="radio" aria-labelledby="b-q1-0-l0" aria-describedby="b-q1-0-d0" name="b-q1-0"\/><span class="doan-preference-row-icon"><span class="ob-radio" aria-hidden="true"><\/span><\/span><span class="doan-preference-row-content"><span class="doan-preference-row-label" id="b-q1-0-l0">Compact<\/span><span class="doan-preference-row-description" id="b-q1-0-d0">Title and actions on one line<\/span><\/span><\/label>/);
    // Without a description the row is its label alone.
    expect(out).toMatch(/<span class="doan-preference-row-label" id="b-q1-0-l1">Two rows<\/span><\/span><\/label>/);
    expect(out).toMatch(/<input type="checkbox" aria-labelledby="b-q1-1-l0" name="b-q1-1"[^>]*\/><span class="doan-preference-row-icon"><span class="doan-checkbox q-check" aria-hidden="true"><\/span>/);
    expect(out.match(/doan-preference-row-label" id="b-q1-\d-lother">Other</g)).toHaveLength(2);
    // A Codex question with isOther false has no Other.
    expect(card({ item: item([fixed]) })).not.toContain(">Other<");
  });

  // VoiceOver reads a control's name, then its description: the name is the label line alone so the description is
  // read once (batch R review ⚪2).
  test("each option is named by its label line and described by its description", () => {
    const out = card({ item: item([layout, sections]) });
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l0" aria-describedby="b-q1-0-d0" name="b-q1-0"\/>/);
    expect(out).toContain('<span class="doan-preference-row-label" id="b-q1-0-l0">Compact</span>');
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l1" name="b-q1-0"\/>/);
    expect(out).toContain('<span class="doan-preference-row-label" id="b-q1-0-l1">Two rows</span>');
    expect(out).toMatch(/<input type="checkbox" aria-labelledby="b-q1-1-lother" name="b-q1-1"\/>/);
    expect(out).toContain('<span class="doan-preference-row-label" id="b-q1-1-lother">Other</span>');
  });

  // Entry focus takes the card's first focusable control (ENTRY_FOCUS); a markup that put Send first would land there.
  test("the first focusable control in the card is the first option, or the answer input when there are no options", () => {
    const first = (out: string) => out.match(/<(input|button|textarea|select)\b[^>]*>/)?.[0];
    expect(first(card({ item: item([layout, sections]) }))).toMatch(/^<input type="radio"[^>]*aria-labelledby="b-q1-0-l0"/);
    expect(first(card({ item: item([sections]) }))).toMatch(/^<input type="checkbox"[^>]*aria-labelledby="b-q1-1-l0"/);
    expect(first(card({ item: item([name, layout]) }))).toMatch(/^<input class="doan-input q-input q-text-answer"[^>]*id="b-q1-n-other"/);
  });

  test("chosen options show by their control; Other chosen opens its input, masked for a secret question", () => {
    const draft = draftOf([layout, sections], { type: "other", question: layout }, { type: "text", questionId: "0", text: "Both" }, { type: "choose", question: sections, option: 0 });
    const out = card({ item: item([layout, sections]), draft });
    expect(out).toMatch(/<input type="checkbox" aria-labelledby="b-q1-1-l0" name="b-q1-1"[^>]*checked=""[^>]*\/><span class="doan-preference-row-icon"><span class="doan-checkbox q-check" data-state="checked" aria-hidden="true">/);
    expect(out).toContain('<span class="doan-preference-row-extra"><input class="doan-input q-input" type="text" placeholder="Type your answer" aria-label="Other answer" maxLength="4096" id="b-q1-0-other" value="Both"/></span>');
    const masked = card({ item: item([{ ...layout, secret: true }]), draft });
    expect(masked).toContain('type="password" placeholder="Type your answer" aria-label="Other answer"');
  });

  test("a question without options is answered in its input alone; a secret one is masked", () => {
    expect(card({ item: item([name]) })).toContain('<div class="q" role="group" aria-label="Canvas name: What should the new canvas be called?"><input class="doan-input q-input q-text-answer" type="text" placeholder="Type your answer" aria-label="Canvas name: answer" maxLength="4096" id="b-q1-n-other" value=""/></div>');
    expect(card({ item: item([token]) })).toContain('type="password"');
  });

  test("Send (prominent), Skip (panel), Stop; Send stays focusable while it cannot send and its tooltip says what is missing", () => {
    const out = card();
    expect(out).toMatch(/<span class="strip-actions"><button type="button" class="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled="true"[^>]*>Send<\/button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Skip<\/button><button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*>.*<\/svg>Stop<\/button><\/span>/);
    const off = tree();
    const tip = off.find(el => typeof el.type !== "string" && textOf(el.props.children as ReactNode) === "Choose or type an answer first.");
    expect(tip).toBeDefined();
    expect(all(QuestionCard(cardProps({ item: item([layout, sections]) }))).some(el => textOf(el.props.children as ReactNode) === "Answer each question first.")).toBe(true);
    const ready = card({ draft: draftOf([layout], { type: "choose", question: layout, option: 1 }) });
    expect(ready).toContain('<button type="button" class="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent">Send</button>');
  });

  test("Send asks only when every question is answered; Skip and Stop always", () => {
    const onSend = vi.fn(), onSkip = vi.fn(), onStop = vi.fn();
    (button(tree({ onSend, onSkip, onStop }), "Send").props.onClick as () => void)();
    expect(onSend).not.toHaveBeenCalled();
    const ready = tree({ onSend, onSkip, onStop, draft: draftOf([layout], { type: "choose", question: layout, option: 0 }) });
    (button(ready, "Send").props.onClick as () => void)();
    (button(ready, "Skip").props.onClick as () => void)();
    (button(ready, "Stop").props.onClick as () => void)();
    expect([onSend.mock.calls.length, onSkip.mock.calls.length, onStop.mock.calls.length]).toEqual([1, 1, 1]);
  });

  test("choosing an option or Other edits the draft by the question", () => {
    vi.stubGlobal("document", { getElementById: () => null });
    const onDraft = vi.fn();
    const els = tree({ onDraft, item: item([layout, sections]) });
    const [compact, , other, agents] = inputs(els);
    (compact!.props.onChange as () => void)();
    (agents!.props.onChange as () => void)();
    (other!.props.onChange as () => void)();
    expect(onDraft.mock.calls.map(call => call[0])).toEqual([
      { type: "choose", question: layout, option: 0 }, { type: "choose", question: sections, option: 0 }, { type: "other", question: layout },
    ]);
  });

  test("Other chosen by click or Space moves focus into its input; arrowing past it only opens it", async () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: (id: string) => id === "b-q1-0-other" ? { focus } : null });
    const els = tree({ onDraft: noop });
    const radios = inputs(els);
    (radios[2]!.props.onChange as () => void)();
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
    // Arrow keys move the choice through the group's radios: the keydown comes before the change.
    (radios[1]!.props.onKeyDown as (e: unknown) => void)({ key: "ArrowDown" });
    (radios[2]!.props.onChange as () => void)();
    (radios[2]!.props.onKeyUp as (e: unknown) => void)({ key: "ArrowDown" });
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test("Return in the Other input sends only when Send can, and never while an IME composes", () => {
    const onSend = vi.fn(), preventDefault = vi.fn();
    const draft = draftOf([layout], { type: "other", question: layout }, { type: "text", questionId: "0", text: "Both" });
    const field = (d: QuestionDraft) => inputs(tree({ onSend, draft: d })).find(el => el.props.type === "text")!;
    const press = (d: QuestionDraft, nativeEvent: Record<string, unknown>) => (field(d).props.onKeyDown as (e: unknown) => void)({ key: "Enter", nativeEvent, preventDefault });
    press(draft, { isComposing: true });
    press(draft, { isComposing: false, keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    press(draft, { isComposing: false });
    expect(onSend).toHaveBeenCalledTimes(1);
    press(draftOf([layout], { type: "other", question: layout }), { isComposing: false });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test("typing in the input edits that question's text", () => {
    const onDraft = vi.fn();
    const field = inputs(tree({ onDraft, item: item([name]) }))[0]!;
    (field.props.onChange as (e: unknown) => void)({ currentTarget: { value: "Header" } });
    expect(onDraft).toHaveBeenCalledWith({ type: "text", questionId: "n", text: "Header" });
  });

  test("Esc inside the card does nothing: it stops there", () => {
    const stopPropagation = vi.fn();
    const root = tree()[0]!;
    (root.props.onKeyDown as (e: unknown) => void)({ key: "Escape", stopPropagation });
    (root.props.onKeyDown as (e: unknown) => void)({ key: "a", stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  test("sending: Send is busy with a spinner, the choices and Skip are read-only, Stop stays live", () => {
    const onSend = vi.fn(), onSkip = vi.fn(), onStop = vi.fn();
    const draft = questionDraft(draftOf([layout], { type: "choose", question: layout, option: 1 }), { type: "sending", how: "answer" });
    const out = card({ draft });
    expect(out).toContain('<div class="doan-notice thread-notice q-card is-locked">');
    expect(out).toContain('<button type="button" class="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-busy="true"><span class="doan-spinner" aria-hidden="true"></span>Send</button>');
    expect(out).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-disabled="true">Skip</button>');
    const els = tree({ draft, onSend, onSkip, onStop });
    (button(els, "Send").props.onClick as () => void)();
    (button(els, "Skip").props.onClick as () => void)();
    (button(els, "Stop").props.onClick as () => void)();
    expect([onSend.mock.calls.length, onSkip.mock.calls.length, onStop.mock.calls.length]).toEqual([0, 0, 1]);
    expect(inputs(els).every(el => el.props["aria-disabled"] === true)).toBe(true);
  });

  test("a failed send keeps the choices and says so under the actions", () => {
    const draft = questionDraft(questionDraft(draftOf([layout], { type: "choose", question: layout, option: 1 }), { type: "sending", how: "answer" }), { type: "failed" });
    const out = card({ draft });
    expect(out).toContain('<span class="ask-error" role="alert">Couldn’t send your answer. Try again.</span>');
    expect(out).toContain('<div class="doan-notice thread-notice q-card">');
    expect(out).toMatch(/<input type="radio" aria-labelledby="b-q1-0-l1" name="b-q1-0" checked=""[^>]*\/><span class="doan-preference-row-icon"><span class="ob-radio" aria-hidden="true"><\/span><\/span><span class="doan-preference-row-content"><span class="doan-preference-row-label" id="b-q1-0-l1">Two rows/);
  });

  test("only a card that arrived while the thread was open announces itself, by its title alone; focus never moves to it", () => {
    expect(card({ live: true })).toContain('<span class="strip-text q-title" role="alert"><b>Which layout should the settings header use?</b></span>');
    expect(card({ live: true }).match(/role="alert"/g)).toHaveLength(1);
    expect(card({ live: true })).not.toMatch(/autofocus/i);
  });

  test("labels and descriptions are drawn in full, never cut", () => {
    const long = "fix/header-overflow-on-narrow-panels-when-the-project-name-is-long".repeat(4);
    expect(card({ item: item([{ ...layout, options: [{ label: long, description: long }] }]) }).split(long)).toHaveLength(3);
  });
});

describe("the thread's question items", () => {
  const props = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
    items, conversationId: "c1", provider: "claude", project: "doan-design", liveAfter: 0, canvasListed: () => true,
    onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
  });
  const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<TooltipProvider><ConversationThread {...props(items, patch)} /></TooltipProvider>);

  test("a pending question draws its card with the host's draft; the status says the agent needs an answer", () => {
    const draft = draftOf([layout], { type: "choose", question: layout, option: 1 });
    const out = html([item([layout], { seq: 3 })], { liveAfter: 2, questionDraft: id => id === "q1" ? draft : EMPTY_QUESTION_DRAFT });
    expect(out).toContain('<div class="thread-item" data-item="Qq1"><div class="doan-notice thread-notice q-card">');
    expect(out).toContain('role="alert"><b>Which layout');
    expect(out).toMatch(/<input type="radio" aria-labelledby="[^"]*-q1-0-l1" name="[^"]*-q1-0" checked=""[^>]*\/><span class="doan-preference-row-icon"><span class="ob-radio" aria-hidden="true"><\/span><\/span><span class="doan-preference-row-content"><span class="doan-preference-row-label" id="[^"]*-q1-0-l1">Two rows/);
    expect(out).toContain('<div class="sr-only" role="status">Claude Code needs your answer</div>');
  });

  test("a finished question folds to its lines, each ellipsized with its full text as the tooltip", () => {
    const answered = item([layout, sections], { status: "answered", answers: { "0": { selected: ["Two rows"] }, "1": { selected: ["Agents"], other: "Keyboard shortcuts" } } });
    const out = html([answered, item([layout], { key: "Qq2", requestId: "q2", status: "skipped" }), item([layout], { key: "Qq3", requestId: "q3", status: "expired" })]);
    expect(out).toContain('<div class="thread-item" data-item="Qq1"><div class="q-folded"><div class="activity"><div class="activity-head ask-answered"><span title="Answered · Layout: Two rows">Answered · Layout: Two rows</span></div></div><div class="activity"><div class="activity-head ask-answered"><span title="Answered · Sections: Agents, Keyboard shortcuts">Answered · Sections: Agents, Keyboard shortcuts</span></div></div></div></div>');
    expect(out).toContain('<span title="Skipped · Layout">Skipped · Layout</span>');
    expect(out).toContain('<span title="Expired without an answer · Layout">Expired without an answer · Layout</span>');
    expect(out).not.toContain("q-card");
    expect(out).toContain('<div class="sr-only" role="status"></div>');
  });

  test("a header-less question (Antigravity) folds with its sentence", () => {
    const bare: Question = { id: "0", header: "", question: "Which colour?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false };
    expect(html([item([bare], { status: "answered", answers: { "0": { selected: ["Red"] } } })])).toContain('<span title="Answered · Which colour?: Red">Answered · Which colour?: Red</span>');
  });
});

describe("settleQuestionSend", () => {
  // Batch G review: main may keep a request pending after a stale reply until its own expiry resolves it, so the card
  // folds only on question.resolved and a stale reply leaves it locked without an error line.
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
