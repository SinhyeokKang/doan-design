import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";
import type { ThreadTurn } from "./turnStatus";

// The background work line under a done turn (draft frames background-line, background-widths): one still sentence in
// the turn indicator's place with a small Stop. There is no DOM in these tests (ARCHITECTURE §7 'Home tests without a
// DOM'): the thread body runs with its hooks kept by call order and its layout effects run after each draw, against a
// stubbed document, as ConversationThread.focus.test.tsx does. Static markup checks what is drawn. Shift+Tab from the
// composer is the real DOM order, checked in the real app.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, mocked: false,
  layout: [] as ({ deps: unknown[] | undefined } | undefined)[], layoutCursor: 0, pending: [] as (() => void)[],
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): number => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = init();
    return index;
  };
  const pick = <T,>(mine: T, theirs: T): T => hooks.mocked ? mine : theirs;
  return {
    ...actual,
    useState: (initial: unknown) => pick(() => {
      const index = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    }, () => actual.useState(initial))(),
    useRef: (value: unknown) => pick(() => hooks.slots[slot(() => ({ current: value }))], () => actual.useRef(value))(),
    useMemo: (factory: () => unknown, deps: unknown[]) => pick(() => factory(), () => actual.useMemo(factory, deps))(),
    useEffect: (run: () => void, deps?: unknown[]) => hooks.mocked ? undefined : actual.useEffect(run, deps),
    useImperativeHandle: (...args: Parameters<typeof actual.useImperativeHandle>) => hooks.mocked ? undefined : actual.useImperativeHandle(...args),
    useLayoutEffect: (run: () => void, deps?: unknown[]) => {
      if (!hooks.mocked) return actual.useLayoutEffect(run, deps);
      const index = hooks.layoutCursor++, previous = hooks.layout[index];
      if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
      hooks.layout[index] = { deps };
      hooks.pending.push(run);
    },
    useId: () => hooks.mocked ? "k" : actual.useId(),
  };
});
const { ConversationThread, ThreadEntry } = await import("./ConversationThread");

const SENTENCE = "Background work is still running. It stops when you send your next message or press Stop.";
const user = (key: string, text: string): ThreadItem => ({ kind: "user", key, seq: 1, anchors: [], preset: null, parts: [{ text }], attachments: [] });
const reply: ThreadItem = { kind: "agent", key: "a3", messageId: "m1", text: "The dev server is running at `localhost:5173`.", streaming: false };
const done: ThreadTurn = { turnId: "t1", status: { kind: "none" }, at: "2026-11-13T10:00:00.000Z" };
const ITEMS = [user("u1", "Start the dev server and check the checkout page"), reply];

const body = { tagName: "BODY" };
let active: unknown;
let composer: ReturnType<typeof vi.fn<() => void>>;
let stopBackground: ReturnType<typeof vi.fn<(turnId: string) => Promise<boolean>>>;
let answer: { resolve(ok: boolean): void };
let tree: ReactElement<Record<string, unknown>>[];
let props: ConversationThreadProps;

beforeEach(() => {
  hooks.slots = []; hooks.layout = []; hooks.mocked = true;
  active = body; composer = vi.fn<() => void>();
  stopBackground = vi.fn((_turnId: string) => new Promise<boolean>(resolve => { answer = { resolve }; }));
  vi.stubGlobal("document", { get activeElement() { return active; }, body });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  props = {
    conversationId: "c1", items: ITEMS, provider: "claude", project: "acme-web", liveAfter: 0, canvasListed: () => true,
    onAnswer: () => {}, onFocusComposer: composer, onStop: vi.fn(), onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {},
    onOpenCanvas: () => {}, onOpenLink: () => {}, onCopy: async () => true,
    turn: done, background: { turnId: "t1" }, onStopBackground: stopBackground,
  };
});
afterEach(() => { hooks.mocked = false; vi.unstubAllGlobals(); });

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const drawn = node.type === ThreadEntry ? [(node.props.draw as (entry: unknown) => ReactNode)(node.props.entry)] : [];
  return [node, ...[node.props.children, ...drawn].flat().flatMap(child => all(child as ReactNode))];
}
// One render with these props, then its layout effects. commit: what happens to focus as React commits this render
// (a removed button takes focus to the body).
function draw(patch: Partial<ConversationThreadProps> = {}, commit?: () => void): void {
  hooks.cursor = 0; hooks.layoutCursor = 0; hooks.pending = [];
  props = { ...props, ...patch };
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(props, null);
  tree = all((outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props));
  const scroller = tree.find(element => element.props.className === "thread-scroll")!.props.ref as { current: unknown };
  scroller.current = {
    scrollHeight: 100, scrollTop: 0, clientHeight: 100, contains: (node: unknown) => typeof node === "object" && node !== null && "item" in node,
    querySelector: () => null,
  };
  commit?.();
  for (const run of hooks.pending) run();
}
const line = () => tree.find(element => element.props["data-item"] === "background");
const stop = () => tree.find(element => element.type === "button" && String(element.props.className).includes("bg-stop"));
const text = (element: ReactElement<Record<string, unknown>> | undefined): string => element ? all(element.props.children as ReactNode).length === 0 && typeof element.props.children === "string"
  ? element.props.children : [element.props.children].flat().map(child => typeof child === "string" ? child : isValidElement(child) ? text(child as ReactElement<Record<string, unknown>>) : "").join("") : "";
const status = () => text(tree.find(element => element.props.className === "sr-only"));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
// Focus on the line's Stop, as the thread reads it: inside the scroller, in the item keyed "background".
const onStop = { item: "background", closest: () => ({ getAttribute: () => "background" }) };

test("the line sits under the done turn's reply, in the indicator's place, with Stop named for the screen reader", () => {
  draw();
  expect(line()).toBeDefined();
  expect(text(line())).toContain(SENTENCE);
  expect(stop()!.props["aria-label"]).toBe("Stop background work");
  expect(text(stop())).toBe("Stop");
  expect(stop()!.props["aria-disabled"]).toBeUndefined();
  // An ordinary Tab stop: a native button with no tabindex of its own.
  expect(stop()!.props.tabIndex).toBeUndefined();
  // Not a live region; the thread's status says it once, in the render it appears.
  expect(line()!.props.role).toBeUndefined();
  expect(status()).toBe("Background work is still running");
  hooks.mocked = false;
  const out = renderToStaticMarkup(<ConversationThread {...props} />);
  expect(out.indexOf("The dev server is running")).toBeLessThan(out.indexOf(SENTENCE));
  expect(out).toContain('<div class="thread-item" data-item="background"><div class="bg-line">');
  expect(out).toContain('<button type="button" class="doan-button bg-stop" data-ui-size="xs" data-ui-variant="subtle" aria-label="Stop background work">');
  expect(out).not.toContain("ti-reply");
});

test("no line without background work, for another turn's work, or in the render the person's next message enters", () => {
  draw({ background: null });
  expect(line()).toBeUndefined();
  draw({ background: { turnId: "t0" } });
  expect(line()).toBeUndefined();
  // The next message enters the thread before main's list drops the line: the next turn's indicator takes the place.
  draw({ items: [...ITEMS, user("u9", "Now make the total row sticky")], turn: { turnId: "t2", status: { kind: "general" }, at: "2026-11-13T10:01:00.000Z" }, background: { turnId: "t1" } });
  expect(line()).toBeUndefined();
  expect(tree.some(element => element.props.text === "Claude Code is working")).toBe(true);
  // A Send now message in flight is the person's message too.
  draw({ items: [...ITEMS, { ...user("qx", "Also this"), seq: null, sending: true } as ThreadItem], turn: done, background: { turnId: "t1" } });
  expect(line()).toBeUndefined();
});

test("Stop asks once for that turn, then shows Stopping with a spinner and cannot be pressed again; the line stays", async () => {
  draw();
  (stop()!.props.onClick as () => void)();
  expect(stopBackground).toHaveBeenCalledWith("t1");
  draw();
  expect(line()).toBeDefined();
  expect(text(stop())).toBe("Stopping");
  expect(stop()!.props["aria-label"]).toBe("Stopping background work");
  expect(stop()!.props["aria-disabled"]).toBe(true);
  expect(stop()!.props["data-disabled"]).toBe("");
  expect(all(stop()!.props.children as ReactNode).some(child => child.props.className === "doan-spinner")).toBe(true);
  (stop()!.props.onClick as () => void)();
  expect(stopBackground).toHaveBeenCalledOnce();
  // The screen reader's status does not change with Stopping, so the line is not announced again.
  expect(status()).toBe("Background work is still running");
  answer.resolve(true);
  await settle();
  draw();
  expect(text(stop())).toBe("Stopping");
  // Main drops the line once the process group is gone.
  draw({ background: null });
  expect(line()).toBeUndefined();
});

test("a Stop that failed comes back pressable; main's own stopping, from the other window's press, shows Stopping", async () => {
  draw();
  (stop()!.props.onClick as () => void)();
  answer.resolve(false);
  await settle();
  draw();
  expect(text(stop())).toBe("Stop");
  expect(stop()!.props["aria-disabled"]).toBeUndefined();
  (stop()!.props.onClick as () => void)();
  expect(stopBackground).toHaveBeenCalledTimes(2);
  hooks.slots = []; hooks.layout = [];
  draw({ background: { turnId: "t1", stopping: true } });
  expect(text(stop())).toBe("Stopping");
  (stop()!.props.onClick as () => void)();
  expect(stopBackground).toHaveBeenCalledTimes(2);
});

test("when the line goes while Stop holds focus, focus moves to the composer field; focus elsewhere stays", () => {
  draw();
  active = onStop;
  draw({ background: null }, () => { active = body; });
  expect(composer).toHaveBeenCalledOnce();
  hooks.slots = []; hooks.layout = []; composer.mockClear();
  draw({ background: { turnId: "t1" } });
  active = { elsewhere: true };
  draw({ background: null });
  expect(composer).not.toHaveBeenCalled();
  // Stopping keeps the button (aria-disabled, not disabled), so focus stays on it.
  hooks.slots = []; hooks.layout = [];
  draw({ background: { turnId: "t1" } });
  active = onStop;
  draw({ background: { turnId: "t1", stopping: true } });
  expect(composer).not.toHaveBeenCalled();
});

// Main answers a Stop at once when another host's Stop is already under way. Should that earlier Stop fail, main shows
// the line without `stopping` again; this host's own press must not keep it stuck on Stopping.
test("a Stop main answered for the other host's press comes back when main's stopping ends without the work ending", async () => {
  draw({ background: { turnId: "t1", stopping: true } });
  draw({ background: { turnId: "t1" } });
  (stop()!.props.onClick as () => void)();
  draw({ background: { turnId: "t1", stopping: true } });
  answer.resolve(true);
  await settle();
  draw({ background: { turnId: "t1", stopping: true } });
  expect(text(stop())).toBe("Stopping");
  // The other press failed: main's line is back without stopping while the work runs on.
  draw({ background: { turnId: "t1" } });
  draw({ background: { turnId: "t1" } });
  expect(text(stop())).toBe("Stop");
  expect(stop()!.props["aria-disabled"]).toBeUndefined();
});

test("the line goes in the first render whose turn is a later one, before that turn's status arrives", () => {
  draw();
  draw({ items: [...ITEMS, user("u9", "Now make the total row sticky")], turn: { turnId: "t2", status: { kind: "none" }, at: "2026-11-13T10:01:00.000Z" } });
  expect(line()).toBeUndefined();
});
