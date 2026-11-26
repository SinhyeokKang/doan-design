import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// The follow's ResizeObserver callback with the answer popover's end inset, run through ThreadBody's own effects. No DOM:
// the scroller, the thread, the root and the popover are stand-ins with the sizes a layout would give.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as ({ deps: unknown[] | undefined } | undefined)[], effectCursor: 0, pending: [] as (() => void)[],
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): number => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = init();
    return index;
  };
  const effect = (run: () => void, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    hooks.effects[index] = { deps };
    hooks.pending.push(run);
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value }))],
    useMemo: (factory: () => unknown) => factory(),
    useEffect: effect, useLayoutEffect: effect, useImperativeHandle: () => {}, useId: () => "k",
  };
});
const { ConversationThread } = await import("./ConversationThread");
const { AnswerPopover } = await import("./AnswerPopover");

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}

const user: ThreadItem = { kind: "user", key: "u1", seq: 1, parts: [{ text: "Make it" }], anchors: [], preset: null, attachments: [] };
const ask: ThreadItem = { kind: "permission", key: "p2", seq: 2, requestId: "r1", summary: "ls", options: [{ id: "a", label: "Allow", kind: "allow" }], status: "pending", answer: null };
let observed: () => void;
let tree: ReactElement<Record<string, unknown>>[];
// The thread's content, the end inset and the viewport; the scroller's scroll height follows them as a layout would.
const layout = { content: 1000, inset: 0, viewport: 400 };
const vars = new Map<string, string>();
const scroller = {
  scrollTop: 0, clientHeight: 400,
  get scrollHeight() { return Math.max(layout.viewport, layout.content + 32 + Number.parseFloat(vars.get("--ap-inset") ?? "0")); },
  firstElementChild: { getBoundingClientRect: () => ({ height: layout.content }) },
  addEventListener: () => {},
  removeEventListener: () => {},
};
const popover = { get offsetHeight() { return layout.inset; } };
const root = { style: { setProperty: (name: string, value: string) => { vars.set(name, value); } }, contains: () => false, querySelector: () => null };

function draw(items: ThreadItem[]): void {
  hooks.cursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  const props: ConversationThreadProps = {
    conversationId: "c1", items, provider: "claude", project: "acme", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
    onAnswer: () => {}, onStop: () => {}, onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {}, onOpenCanvas: () => {}, onOpenLink: () => {}, onCopy: async () => true,
  };
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(props, null);
  tree = all((outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props));
  (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.ref as { current: unknown }).current = scroller;
  (tree.find(element => element.props.className === "conversation-thread")!.props.ref as { current: unknown }).current = root;
  const shown = tree.find(element => element.type === AnswerPopover);
  (shown?.props.rootRef as ((node: unknown) => void) | undefined)?.(popover);
  for (const run of hooks.pending) run();
}
const jump = () => tree.some(element => element.type === "button" && String(element.props.className).includes("jump-latest"));
const atBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
// A change in layout, then the observer's callback and the render that its state change brings.
function resize(change: Partial<typeof layout>, items: ThreadItem[]): void {
  Object.assign(layout, change);
  observed();
  draw(items);
}

beforeEach(() => {
  hooks.slots = []; hooks.effects = [];
  vars.clear();
  Object.assign(layout, { content: 1000, inset: 0, viewport: 400 });
  scroller.scrollTop = 0;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observed = callback; } observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("document", { activeElement: null, body: null, hasFocus: () => true, querySelectorAll: () => [], getSelection: () => null, addEventListener: () => {}, removeEventListener: () => {}, timeline: { currentTime: 0 } });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

test("at the bottom, the popover's height becomes the end inset and the view lands on the new bottom at once", () => {
  draw([user]);
  expect(atBottom()).toBe(0);
  layout.inset = 180;
  draw([user, ask]);
  observed();
  expect(vars.get("--ap-inset")).toBe("180px");
  expect(atBottom()).toBe(0);
  expect(jump()).toBe(false);
});

test("scrolled away, the popover opening or changing height shows no Jump to latest; new content does", () => {
  layout.inset = 120;
  draw([user, ask]);
  observed();
  // The person scrolls up: a scroll the follow did not write.
  scroller.scrollTop = 200;
  (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.onScroll as () => void)();
  resize({ inset: 180.5 }, [user, ask]);
  expect(jump()).toBe(false);
  resize({ inset: 40 }, [user, ask]);
  expect(jump()).toBe(false);
  resize({ content: 1300 }, [user, ask]);
  expect(jump()).toBe(true);
});

test("the popover going away sets the end inset back to nothing", () => {
  layout.inset = 180;
  draw([user, ask]);
  observed();
  expect(vars.get("--ap-inset")).toBe("180px");
  draw([user, { ...ask, status: "answered", answer: null } as ThreadItem]);
  const gone = tree.find(element => element.type === AnswerPopover);
  expect(gone).toBeUndefined();
  layout.inset = 0;
  observed();
  expect(vars.get("--ap-inset")).toBe("0px");
});
