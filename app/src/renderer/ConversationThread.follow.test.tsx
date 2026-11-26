import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// The follow's ResizeObserver callback with the answer popover's end inset, run through ThreadBody's own effects. No DOM:
// the scroller, the thread, the root and the popover are stand-ins with the sizes a layout would give.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effectCursor: 0, pending: [] as (() => void)[], handle: null as { scrollToItem(key: string): void } | null,
  effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): number => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = init();
    return index;
  };
  // As React runs them: a changed effect's cleanup before its next run, every cleanup on unmount.
  const effect = (run: () => void | (() => void), deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const entry: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = entry;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      const cleanup = run();
      if (typeof cleanup === "function") entry.cleanup = cleanup;
    });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value }))],
    useMemo: (factory: () => unknown) => factory(),
    useEffect: effect, useLayoutEffect: effect, useImperativeHandle: (_ref: unknown, create: () => { scrollToItem(key: string): void }) => { hooks.handle = create(); }, useId: () => "k",
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
// The scroller's and the window's listeners, and the animation frames waiting to run. A remove takes only the listener
// that was added.
type Listener = (event: unknown) => void;
const on = new Map<string, Listener>(), onWindow = new Map<string, Listener>();
// A capture listener is kept apart, as the DOM does: "keydown:capture".
type Options = boolean | { capture?: boolean; passive?: boolean } | undefined;
const slot = (type: string, options: Options) => (options === true || (typeof options === "object" && options.capture)) ? `${type}:capture` : type;
const listen = (map: Map<string, Listener>) => ({
  addEventListener: (type: string, listener: Listener, options?: Options) => { map.set(slot(type, options), listener); },
  removeEventListener: (type: string, listener: Listener, options?: Options) => { if (map.get(slot(type, options)) === listener) map.delete(slot(type, options)); },
});
const frames = new Map<number, (now: number) => void>();
let rawTop = 0;
// A smooth scroll the browser runs toward `to`, from the frame after it was asked for, one step a frame; a scrollTop the
// code writes cancels it.
let smooth: { to: number; moving: boolean } | null = null, smoothStep = 150;
// With echo, the code's own scrollTop writes come back at the next frame as a scroll and a scrollend, as Chromium sends
// them; a fractional write reads back truncated until then and lands on the next whole pixel, so the event can be 1 px
// off the read.
let echo = false, echoing = false;
// A focus target for a key: in a field, or anywhere else.
class El {
  constructor(readonly kind = "div") {}
  closest(selector: string) { return selector.split(",").map(part => part.trim()).includes(this.kind) ? this : null; }
}
let frameId = 0, clock = 0;
const scroller = {
  // The browser keeps scrollTop within the scroll extent: a shrinking extent lowers it.
  get scrollTop() {
    rawTop = Math.min(Math.max(rawTop, 0), Math.max(0, this.scrollHeight - this.clientHeight));
    return echoing ? Math.floor(rawTop) : rawTop;
  },
  set scrollTop(value: number) { smooth = null; rawTop = value; echoing = echo; void this.scrollTop; },
  clientHeight: 400,
  get scrollHeight() { return Math.max(layout.viewport, layout.content + 32 + Number.parseFloat(vars.get("--ap-inset") ?? "0")); },
  firstElementChild: { getBoundingClientRect: () => ({ height: layout.content }) },
  // The thread's first item, a received handoff bubble at the top of the thread.
  querySelector: () => ({ querySelector: (selector: string) => selector === ".from-agent" ? {} : null, scrollIntoView: () => { smooth = { to: 0, moving: false }; } }),
  ...listen(on),
};
// No rows to measure: the floor that keeps the head and buttons is the real DOM's (popoverFloor is tested on its own).
const popover = { get offsetHeight() { return layout.inset; }, style: { minHeight: "", overflow: "" }, querySelector: () => null, querySelectorAll: () => [], closest: () => null, hasAttribute: () => false, toggleAttribute: () => false };
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
  on.clear(); onWindow.clear(); frames.clear(); frameId = 0; clock = 0; smooth = null; smoothStep = 150; echo = false; echoing = false;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("window", listen(onWindow));
  Object.assign(layout, { content: 1000, inset: 0, viewport: 400 });
  scroller.scrollTop = 0; scroller.clientHeight = 400;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observed = callback; } observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("document", { activeElement: null, body: null, hasFocus: () => true, querySelectorAll: () => [], getSelection: () => null, addEventListener: () => {}, removeEventListener: () => {}, timeline: { currentTime: 0 } });
  vi.stubGlobal("Element", El);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
  // Tab order runs thread → popover → composer, so the thread's Jump to latest comes first.
  const order = tree.findIndex(element => element.type === "button" && String(element.props.className).includes("jump-latest"));
  expect(order).toBeLessThan(tree.findIndex(element => element.type === AnswerPopover));
});

// Jump to latest rides above the popover; with no room left there in the thread area it would sit on the panel's head.
test("Jump to latest stays away while the popover leaves it no room in the thread area", () => {
  layout.inset = 120;
  draw([user, ask]);
  observed();
  scroller.scrollTop = 200;
  (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.onScroll as () => void)();
  resize({ inset: 360 }, [user, ask]);
  resize({ content: 1300 }, [user, ask]);
  expect(jump()).toBe(false);
  resize({ inset: 120 }, [user, ask]);
  expect(jump()).toBe(true);
});

// The room rule is the popover's: with none drawn, a short thread area keeps Jump to latest.
test("with no popover, a thread area shorter than Jump to latest's room still shows it for new content", () => {
  Object.assign(layout, { viewport: 50 });
  scroller.clientHeight = 50;
  draw([user]);
  scroller.scrollTop = 200;
  (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.onScroll as () => void)();
  resize({ content: 1300 }, [user]);
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

// The person's own scroll: a scroll event the follow did not write.
const scrolled = () => (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.onScroll as () => void)();
function scrollBy(dy: number): void {
  rawTop += dy;
  void scroller.scrollTop;
  scrolled();
}
// Runs the waiting animation frames, 16 ms apart, until `until`. One follow loop never has two frames waiting.
function frameUntil(until: number): void {
  while (clock < until) {
    clock += 16;
    if (echoing) {
      echoing = false;
      rawTop = Math.ceil(rawTop);
      scrolled();
      on.get("scrollend")?.({});
    }
    if (smooth?.moving) {
      const to = smooth.to;
      rawTop = rawTop > to ? Math.max(to, rawTop - smoothStep) : Math.min(to, rawTop + smoothStep);
      scrolled();
      if (scroller.scrollTop === to) { smooth = null; on.get("scrollend")?.({}); }
    } else if (smooth) smooth.moving = true;
    const now = [...frames.values()];
    frames.clear();
    for (const run of now) run(clock);
    expect(frames.size).toBeLessThanOrEqual(1);
  }
}
function unmount(): void {
  for (const effect of hooks.effects) effect?.cleanup?.();
}

test("a wheel of NUDGE or less near the bottom shows no Jump to latest and, once the wheel is over, eases back to the bottom", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  resize({ content: 1060 }, [user]);
  expect(jump()).toBe(false);
  frameUntil(80);
  expect(atBottom()).toBe(90);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
  draw([user]);
  expect(jump()).toBe(false);
});

test("a wheel of more than NUDGE stays where the person left it; new content past the band shows Jump to latest", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -200 });
  scrollBy(-200);
  frameUntil(1000);
  expect(atBottom()).toBe(200);
  resize({ content: 1100 }, [user]);
  expect(atBottom()).toBe(300);
  expect(jump()).toBe(true);
  // Back within the band, it goes away.
  scrollBy(200);
  draw([user]);
  expect(jump()).toBe(false);
});

// Chromium animates a scroll key for about 150 ms; focus is often outside the thread (the panel, the page) after a click
// on reply text, so the key is read from the window.
test("a scroll key pressed with focus outside the thread counts until its scroll ends, past the wheel's hold", () => {
  draw([user]);
  onWindow.get("keydown:capture")?.({ key: "ArrowUp", target: new El() });
  scrollBy(-20);
  frameUntil(64);
  scrollBy(-20);
  frameUntil(160);
  expect(atBottom()).toBe(40);
  on.get("scrollend")?.({});
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a key in a field is not the thread's input; a key that scrolls nothing leaves the follow alone", () => {
  draw([user]);
  onWindow.get("keydown:capture")?.({ key: "ArrowUp", target: new El("textarea") });
  scrollBy(-40);
  on.get("scrollend")?.({});
  frameUntil(1000);
  expect(atBottom()).toBe(40);
  scrollBy(40);
  frameUntil(2000);
  onWindow.get("keydown:capture")?.({ key: "ArrowUp", target: new El() });
  frameUntil(3000);
  resize({ content: 1100 }, [user]);
  frameUntil(4000);
  expect(atBottom()).toBe(0);
});

test("never follows again while the pointer is held on the scroller; a release anywhere in the window lets it", () => {
  draw([user]);
  on.get("pointerdown")!({ target: scroller });
  scrollBy(-20);
  frameUntil(2000);
  expect(atBottom()).toBe(20);
  resize({ content: 1050 }, [user]);
  frameUntil(4000);
  expect(atBottom()).toBe(70);
  onWindow.get("pointerup")!({});
  frameUntil(6000);
  expect(atBottom()).toBe(0);
});

test("the window losing focus or the pointer being cancelled ends the press too", () => {
  for (const end of ["pointercancel", "blur"]) {
    draw([user]);
    on.get("pointerdown")!({ target: scroller });
    scrollBy(-20);
    frameUntil(clock + 1000);
    expect(atBottom()).toBe(20);
    onWindow.get(end)!({});
    frameUntil(clock + 1000);
    expect(atBottom()).toBe(0);
  }
});

// The observer runs after the follow's frame has read the grown distance: the growth must still not count as the
// person's move.
test("growth read by a follow frame before the observer still leaves a small wheel's nudge at NUDGE or less", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  layout.content = 1060;
  frameUntil(32);
  observed();
  draw([user]);
  expect(jump()).toBe(false);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a person reading far up who wheels a little is not pulled to the bottom", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -400 });
  scrollBy(-400);
  frameUntil(1000);
  expect(atBottom()).toBe(400);
  on.get("wheel")!({ deltaY: 30 });
  scrollBy(30);
  frameUntil(2000);
  expect(atBottom()).toBe(370);
  on.get("pointerdown")!({ target: scroller });
  scrollBy(-20);
  onWindow.get("pointerup")!({});
  frameUntil(3000);
  expect(atBottom()).toBe(390);
});

test("Jump to latest waits while the unpinning wheel is unjudged; once it ends away from the bottom, it shows for the growth", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -100 });
  scrollBy(-100);
  resize({ content: 1200 }, [user]);
  expect(atBottom()).toBe(300);
  expect(jump()).toBe(false);
  frameUntil(1000);
  draw([user]);
  expect(atBottom()).toBe(300);
  expect(jump()).toBe(true);
});

test("an unjudged wheel that ends without growth shows no Jump to latest", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -300 });
  scrollBy(-300);
  frameUntil(1000);
  draw([user]);
  expect(atBottom()).toBe(300);
  expect(jump()).toBe(false);
});

// The band is a third of the scroller's height less the end inset: (900 − 300) / 3 = 200.
test("in a tall thread under the popover, growth shows Jump to latest only past the band of the visible height", () => {
  Object.assign(layout, { viewport: 900, inset: 300 });
  scroller.clientHeight = 900;
  draw([user, ask]);
  observed();
  scroller.scrollTop -= 199;
  (tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.onScroll as () => void)();
  resize({ content: 1001 }, [user, ask]);
  expect(atBottom()).toBe(200);
  expect(jump()).toBe(false);
  resize({ content: 1002 }, [user, ask]);
  expect(atBottom()).toBe(201);
  expect(jump()).toBe(true);
});

test("unmounting removes every listener it added and cancels the follow's waiting frame", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  frameUntil(120);
  expect(frames.size).toBe(1);
  expect([...onWindow.keys()].sort()).toEqual(["blur", "keydown:capture", "pointercancel", "pointerup"]);
  unmount();
  expect(on.size).toBe(0);
  expect(onWindow.size).toBe(0);
  expect(frames.size).toBe(0);
});

// A shrink lowers scrollTop to the new bottom; that is the browser's move, not the person's.
test("a small wheel whose view the browser clamps when content shrinks still follows again after later growth", () => {
  draw([user]);
  expect(scroller.scrollTop).toBe(632);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  resize({ content: 700 }, [user]);
  expect(scroller.scrollTop).toBe(332);
  resize({ content: 760 }, [user]);
  expect(atBottom()).toBe(60);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

// The end inset is applied in the observer's callback, so the observer reads this clamp first.
test("a small wheel whose view is clamped when the popover goes away still follows again after later growth", () => {
  layout.inset = 180;
  draw([user, ask]);
  observed();
  expect(scroller.scrollTop).toBe(812);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  layout.inset = 0;
  observed();
  expect(scroller.scrollTop).toBe(632);
  layout.content = 1060;
  frameUntil(48);
  observed();
  expect(atBottom()).toBe(60);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a clamp seen first by the follow's frame is not counted as the person's move", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  layout.content = 700;
  frameUntil(32);
  layout.content = 760;
  frameUntil(64);
  observed();
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a clamp seen first by a scroll event is not counted as the person's move", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  layout.content = 700;
  scrollBy(0);
  expect(scroller.scrollTop).toBe(332);
  layout.content = 760;
  observed();
  draw([user]);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a wheel of more than NUDGE stays away even when a clamp moves the view down meanwhile", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -100 });
  scrollBy(-100);
  expect(scroller.scrollTop).toBe(532);
  resize({ content: 800 }, [user]);
  expect(scroller.scrollTop).toBe(432);
  resize({ content: 1000 }, [user]);
  frameUntil(1000);
  expect(atBottom()).toBe(200);
});

// Known limit (accepted): a move of the person's that no read saw before a clamp counts as clamp, so it re-pins.
test("known limit: a move past NUDGE that no read saw before a clamp counts as the clamp and follows again", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -100 });
  scroller.scrollTop -= 100;
  resize({ content: 800 }, [user]);
  expect(scroller.scrollTop).toBe(432);
  resize({ content: 1000 }, [user]);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

// The panel asks for the scroll after the thread's own effects ran, so the observer's first callback comes after it.
test("scrolling to a received handoff keeps its top in view: the follow neither eases back nor follows a growing reply", () => {
  draw([user]);
  expect(scroller.scrollTop).toBe(632);
  hooks.handle!.scrollToItem("u1");
  observed();
  frameUntil(400);
  expect(scroller.scrollTop).toBe(0);
  resize({ content: 1300 }, [user]);
  frameUntil(1000);
  expect(scroller.scrollTop).toBe(0);
});

// One read sees the clamp and new growth at once, so the view is no longer at the bottom.
test("a clamp read together with growth is still not counted as the person's move", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -30 });
  scrollBy(-30);
  layout.content = 700;
  expect(scroller.scrollTop).toBe(332);
  layout.content = 760;
  observed();
  draw([user]);
  expect(atBottom()).toBe(60);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a person reading far up who wheels back to the bottom follows again even when a reply grows during the wheel's hold", () => {
  draw([user]);
  on.get("wheel")!({ deltaY: -400 });
  scrollBy(-400);
  frameUntil(1000);
  on.get("wheel")!({ deltaY: 399 });
  scrollBy(399);
  resize({ content: 1036 }, [user]);
  expect(atBottom()).toBe(37);
  frameUntil(2000);
  expect(atBottom()).toBe(0);
});

const key = (name = "ArrowUp", target = new El()) => onWindow.get("keydown:capture")?.({ key: name, target });

test("a scroll key whose scrollend never comes still ends once the thread stops scrolling", () => {
  draw([user]);
  key();
  scrollBy(-20);
  frameUntil(64);
  scrollBy(-20);
  frameUntil(150);
  expect(atBottom()).toBe(40);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test("a scroll key cut off by the window losing focus, with no scrollend, still ends", () => {
  draw([user]);
  key();
  scrollBy(-30);
  onWindow.get("blur")!({});
  frameUntil(1000);
  expect(atBottom()).toBe(0);
});

test.each(["input", "textarea", "button", "[contenteditable]"])("a key in %s is not the thread's input", kind => {
  draw([user]);
  key("ArrowUp", new El(kind));
  scrollBy(-40);
  frameUntil(1000);
  expect(atBottom()).toBe(40);
});

test("a held scroll key's repeats are one input: within NUDGE it follows again, past it it stays", () => {
  draw([user]);
  for (const _ of [1, 2]) { key(); scrollBy(-20); frameUntil(clock + 32); }
  on.get("scrollend")?.({});
  frameUntil(1000);
  expect(atBottom()).toBe(0);
  for (const _ of [1, 2, 3]) { key(); scrollBy(-20); frameUntil(clock + 32); }
  on.get("scrollend")?.({});
  frameUntil(2000);
  expect(atBottom()).toBe(60);
});

// The key scrolled the popover or another thread; here only a clamp moved scrollTop.
test("a key that scrolled something else is not this thread's input when this thread only clamps meanwhile", () => {
  draw([user]);
  key();
  layout.content = 900;
  scrollBy(0);
  expect(atBottom()).toBe(0);
  frameUntil(64);
  resize({ content: 1000 }, [user]);
  frameUntil(1000);
  expect(atBottom()).toBe(0);
  expect(jump()).toBe(false);
});

// A thread just taller than its area: the item's bottom is within BOTTOM of where it starts.
test("scrolling to a received handoff in a thread that barely overflows keeps its top in view while the reply grows", () => {
  layout.content = 388;
  draw([user]);
  expect(scroller.scrollTop).toBe(20);
  smoothStep = 10;
  hooks.handle!.scrollToItem("u1");
  observed();
  frameUntil(32);
  expect(scroller.scrollTop).toBe(10);
  resize({ content: 488 }, [user]);
  frameUntil(1000);
  expect(scroller.scrollTop).toBe(0);
});

// The canvas panel's trace: the pinned follow still eases toward a revealing reply when the key goes down, so its own
// writes come back as scroll + scrollend before the key's animation (upward, about 150 ms) starts.
test("the follow's own scroll and scrollend right after a scroll key neither take the key nor end it", () => {
  echo = true;
  draw([user]);
  resize({ content: 1002 }, [user]);
  key();
  frameUntil(80);
  expect(atBottom()).toBe(0);
  for (let at = 80; at < 208; at += 16) { scrollBy(-5); frameUntil(at + 16); }
  expect(atBottom()).toBeGreaterThan(35);
  on.get("scrollend")?.({});
  frameUntil(2000);
  expect(atBottom()).toBe(0);
  draw([user]);
  expect(jump()).toBe(false);
});

// The key scrolled something else; this thread only clamped, then a focus or scrollIntoView moves it within 100 ms.
test("a key candidate a scroll here passed over is never claimed by a later, unrelated move", () => {
  draw([user]);
  key();
  layout.content = 995;
  scrollBy(0);
  frameUntil(48);
  expect(atBottom()).toBe(0);
  scrollBy(-40);
  frameUntil(1000);
  expect(atBottom()).toBe(40);
});

// The person's End interrupts the thread's scroll to a received handoff and brings the view back to the bottom.
test("a key pressed during an item scroll that scrolls this thread to the bottom ends the item and follows again after growth", () => {
  draw([user]);
  hooks.handle!.scrollToItem("u1");
  observed();
  frameUntil(48);
  expect(scroller.scrollTop).toBe(332);
  key("End");
  smooth = null;
  scrollBy(300);
  expect(atBottom()).toBe(0);
  resize({ content: 1100 }, [user]);
  expect(atBottom()).toBe(100);
  on.get("scrollend")?.({});
  frameUntil(2000);
  expect(atBottom()).toBe(0);
});
