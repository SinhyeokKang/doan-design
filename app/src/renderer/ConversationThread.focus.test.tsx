import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Question } from "../main/conversation/question";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// Once a card the person answered or stopped here folds, the focus that was on its button (now
// gone, so on the page body) moves by composerRules.focusAfter: an answer to the next waiting request or the composer,
// Stop to the composer. There is no DOM in these tests (ARCHITECTURE §7 'Home tests without a DOM'): the thread body
// runs with its hooks kept by call order and its layout effects run after each run, against a stubbed document and a
// scroller whose querySelector hands out the control focus would land on. A native button's Enter and Space reach its
// onClick, so the click covers them here; the real-app probe presses the keys.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  layout: [] as ({ deps: unknown[] | undefined } | undefined)[], layoutCursor: 0, pending: [] as (() => void)[],
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): number => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = init();
    return index;
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value }))],
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => {}, useImperativeHandle: () => {},
    useLayoutEffect: (run: () => void, deps?: unknown[]) => {
      const index = hooks.layoutCursor++, previous = hooks.layout[index];
      if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
      hooks.layout[index] = { deps };
      hooks.pending.push(run);
    },
    useId: () => "k",
  };
});
const { ConversationThread, QuestionCard, ThreadEntry } = await import("./ConversationThread");

const question: Question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }], multiSelect: false, other: true };
const permission = (requestId: string, status: "pending" | "answered" | "expired" = "pending"): ThreadItem => ({ kind: "permission", key: `p${requestId}`, seq: 1, requestId, summary: `Run ${requestId}`,
  options: [{ id: "allow", kind: "allow", label: "Allow" }, { id: "reject", kind: "reject", label: "Deny" }], status, answer: status === "answered" ? { id: "allow", kind: "allow", label: "Allow" } : null } as ThreadItem);
const asked = (requestId: string, status: "pending" | "answered" | "skipped" | "expired" = "pending"): ThreadItem => ({ kind: "question", key: `q${requestId}`, seq: 2, requestId, questions: [question], status, answers: null });

const body = { tagName: "BODY" };
let active: unknown;
let controls: Map<string, { focus: ReturnType<typeof vi.fn> }>;
let composer: ReturnType<typeof vi.fn<() => void>>;
let tree: ReactElement<Record<string, unknown>>[];
let props: ConversationThreadProps;

beforeEach(() => {
  hooks.slots = []; hooks.layout = [];
  active = body; controls = new Map(); composer = vi.fn<() => void>();
  vi.stubGlobal("document", { get activeElement() { return active; }, body });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  props = {
    conversationId: "c1", items: [], provider: "claude", project: "acme", liveAfter: 0, canvasListed: () => true,
    onAnswer: () => new Promise(() => {}), onAnswerQuestion: () => new Promise(() => {}), onFocusComposer: composer,
    onStop: vi.fn(), onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {}, onOpenCanvas: () => {}, onOpenLink: () => {}, onCopy: async () => true,
  };
});
afterEach(() => vi.unstubAllGlobals());

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  // A thread item draws its content when React renders it; draw it here as that render would.
  const drawn = node.type === ThreadEntry ? [(node.props.draw as (entry: unknown) => ReactNode)(node.props.entry)] : [];
  return [node, ...[node.props.children, ...drawn].flat().flatMap(child => all(child as ReactNode))];
}
// One render of the thread with these items, then its layout effects, as React commits.
// commit: what happens to focus as React commits this render, before its layout effects (a folded card's control leaving
// the page takes focus to the body).
function draw(items: ThreadItem[], commit?: () => void): void {
  hooks.cursor = 0; hooks.layoutCursor = 0; hooks.pending = [];
  props = { ...props, items };
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(props, null);
  tree = all((outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props));
  const scroller = tree.find(element => element.props.className === "thread-scroll")!.props.ref as { current: unknown };
  scroller.current = {
    scrollHeight: 100, scrollTop: 0, clientHeight: 100, contains: (node: unknown) => typeof node === "object" && node !== null && "item" in node,
    querySelector: (selector: string) => {
      const key = /data-item="([^"]+)"/.exec(selector)?.[1] ?? "";
      if (!controls.has(key)) controls.set(key, { focus: vi.fn(() => { active = { key }; }) });
      return controls.get(key);
    },
  };
  commit?.();
  for (const run of hooks.pending) run();
}
const permissionButton = (requestId: string, label: string) => tree.find(element => element.type === "button" && element.props["data-request"] === requestId && element.props.children === label)!;
const stopOf = (requestId: string) => {
  const card = tree.find(element => element.type === QuestionCard && (element.props.item as { requestId: string }).requestId === requestId);
  if (card) return card.props.onStop as () => void;
  const notice = tree.find(element => all(element.props.children as ReactNode).some(child => child.props["data-request"] === requestId) && element.props.className === "doan-notice thread-notice")!;
  return all(notice.props.children as ReactNode).find(child => child.type === "button" && [child.props.children].flat().includes("Stop"))!.props.onClick as () => void;
};
// The pressed button is gone once its card folds, so the page body holds focus by then.
const press = (run: () => void) => { active = { pressed: true }; run(); active = body; };
const focusedOption = () => [...controls].filter(([, control]) => control.focus.mock.calls.length > 0).map(([key]) => key);

test("a permission answer moves focus to the next waiting request once its card folds, and to the composer after the last", () => {
  draw([permission("a"), permission("b")]);
  press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
  // Still pending until main's resolution arrives: nothing moves yet.
  draw([permission("a"), permission("b")]);
  expect(focusedOption()).toEqual([]);
  draw([permission("a", "answered"), permission("b")]);
  expect(focusedOption()).toEqual(["pb"]);
  expect(composer).not.toHaveBeenCalled();
  active = body;
  press(() => (permissionButton("b", "Deny").props.onClick as () => void)());
  draw([permission("a", "answered"), permission("b", "answered")]);
  expect(composer).toHaveBeenCalledOnce();
});

test("a permission answer leaves focus alone when the person moved it elsewhere before the card folded", () => {
  draw([permission("a")]);
  press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
  active = { elsewhere: true };
  draw([permission("a", "answered")]);
  expect(composer).not.toHaveBeenCalled();
  expect(focusedOption()).toEqual([]);
});

test("Stop on a permission card or a question card moves focus to the composer once that card folds, with or without another request", () => {
  for (const [stopped, other] of [["a", true], ["a", false], ["q", true], ["q", false]] as const) {
    hooks.slots = []; hooks.layout = []; controls = new Map(); composer.mockClear(); active = body;
    const card = (status: "pending" | "expired") => stopped === "a" ? permission("a", status) : asked("q", status);
    const rest = other ? [stopped === "a" ? asked("q") : permission("a")] : [];
    draw([card("pending"), ...rest]);
    press(stopOf(stopped));
    expect(props.onStop).toHaveBeenCalled();
    draw([card("expired"), ...rest]);
    expect(composer, `${stopped} other=${other}`).toHaveBeenCalledOnce();
    expect(focusedOption(), `${stopped} other=${other}`).toEqual([]);
  }
});

// The rule the question card's answer already followed, through the same harness.
test("a question's Skip moves focus to the next waiting request once its card folds", () => {
  draw([asked("q"), permission("b")]);
  const card = tree.find(element => element.type === QuestionCard)!;
  press(card.props.onSkip as () => void);
  draw([asked("q", "skipped"), permission("b")]);
  expect(focusedOption()).toEqual(["pb"]);
});

// A card the agent's CLI cancels folds as expired with no press here. Focus that was in it, or its
// Other text not sent, moves on as after an answer; any other card folding leaves focus alone.
const inCard = (key: string) => ({ item: key, closest: () => ({ getAttribute: () => key }) });
const toBody = () => { active = body; };
test("a cancelled card that held focus hands it to the next waiting request, or to the composer after the last", () => {
  draw([asked("q"), permission("b")]);
  active = inCard("qq");
  draw([asked("q", "expired"), permission("b")], toBody);
  expect(focusedOption()).toEqual(["pb"]);
  active = inCard("pb");
  draw([asked("q", "expired"), permission("b", "expired")], toBody);
  expect(composer).toHaveBeenCalledOnce();
});

test("a cancelled question whose Other field held unsent text moves focus from the page to the composer", () => {
  props = { ...props, questionDraft: () => ({ choices: { "0": { selected: [], other: true, text: "Grid" } }, sending: null, failed: false }) };
  draw([asked("q")]);
  draw([asked("q", "expired")]);
  expect(composer).toHaveBeenCalledOnce();
});

test("a cancelled card focus was not in, with nothing typed, moves no focus", () => {
  draw([asked("q"), permission("b")]);
  draw([asked("q", "expired"), permission("b")]);
  active = inCard("pb");
  draw([asked("q", "expired"), permission("b"), permission("c")]);
  draw([asked("q", "expired"), permission("b"), permission("c", "expired")]);
  expect(composer).not.toHaveBeenCalled();
  expect(focusedOption()).toEqual([]);
});
