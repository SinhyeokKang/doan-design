import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import type { DotCanvas, DotFieldMessage, DotFieldSize } from "./dotField";

// The indicator's wiring, run with hooks as plain state (the App tests' no-DOM style): the Stop callback's
// failure recovery, and the dot field's pauses and cleanup.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0, dirty: false,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { CanvasAgent, DotField } = await import("./CanvasAgent");
const { dotFieldWorker } = await import("./dotField");
const { TooltipContent } = await import("./components/ui/tooltip");

function reset() { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; }
// Renders until state settles; `mounted` runs after each render, before its effects (to attach refs).
function render(component: () => ReactNode, mounted: () => void = () => {}): ReactNode {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
    const tree = component();
    mounted();
    for (const run of hooks.pending) run();
    if (!hooks.dirty) return tree;
  }
  throw new Error("did not settle");
}
function unmount() { for (const slot of hooks.effects) slot?.cleanup?.(); hooks.effects = []; }
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const button = (tree: ReactNode) => all(tree).find(element => element.type === "button");
// The button's words without its icon or spinner.
const label = (tree: ReactNode) => { const children = button(tree)?.props.children; return [children].flat().filter(child => typeof child === "string").join(""); };
// What leads the words: the filled square on Stop, the spinner on "Stopping" (the draft's 'agent-working' and
// 'agent-waiting' frames; the square is the composer's Stop glyph).
// Both are hidden from assistive tech, so the button's name stays its words.
const lead = (tree: ReactNode) => { const first = all(button(tree)?.props.children as ReactNode)[0]; if (first && first.props["aria-hidden"] !== "true" && first.props["aria-hidden"] !== true) return "announced"; return first?.props.className === "doan-spinner" ? "spinner" : first ? "icon" : null; };
// The indicator itself (its glow and notice); the top column stays for the canvas notices.
const shown = (tree: ReactNode) => all(tree).some(element => element.props.className === "doan-agent");

const canvas = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "codex", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", canvas, ...patch,
});
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

afterEach(() => vi.unstubAllGlobals());

describe("CanvasAgent Stop", () => {
  let reply: (value: unknown) => void;
  let interrupt: ReturnType<typeof vi.fn>;
  const onStopFailed = vi.fn();
  const agent = (list: readonly ConversationSummary[]) => () => CanvasAgent({ list, canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, work: [], entries: [], onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed });
  beforeEach(() => {
    reset(); onStopFailed.mockClear();
    interrupt = vi.fn(() => new Promise(resolve => { reply = resolve; }));
    vi.stubGlobal("window", { doan: { interruptConversation: interrupt } });
  });

  test("a ConversationError brings back an enabled Stop and shows the toast", async () => {
    let tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
    expect(lead(tree)).toBe("icon");
    (button(tree)!.props.onClick as () => void)();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stopping");
    expect(lead(tree)).toBe("spinner");
    expect(button(tree)!.props["aria-disabled"]).toBe(true);
    // "Stopping" ignores another press.
    (button(tree)!.props.onClick as () => void)();
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(interrupt).toHaveBeenCalledWith({ conversationId: "c1" });
    reply({ error: "not_found" }); await flush();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
    expect(button(tree)!.props["aria-disabled"]).toBeUndefined();
    expect(onStopFailed).toHaveBeenCalledWith("Couldn’t stop Codex. Try again.");
  });

  test("a rejected interrupt recovers the same way", async () => {
    let tree = render(agent([summary({})]));
    (button(tree)!.props.onClick as () => void)();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stopping");
    // Resolving with a rejected promise makes the pending interrupt reject instead of answering an error.
    reply(Promise.reject(new Error("gone"))); await flush();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
    expect(onStopFailed).toHaveBeenCalledWith("Couldn’t stop Codex. Try again.");
  });

  test("an accepted stop holds 'Stopping' until the list shows the turn ended, and no toast", async () => {
    let tree = render(agent([summary({})]));
    (button(tree)!.props.onClick as () => void)();
    reply(undefined); await flush();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stopping");
    tree = render(agent([summary({ phase: "ended" })]));
    expect(shown(tree)).toBe(false);
    expect(onStopFailed).not.toHaveBeenCalled();
    // A later turn of the same conversation starts with Stop again.
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
  });

  // The app turn ends while a terminal session still works on the canvas.
  test("after a Stop, the notice stays for a terminal session left on the canvas, without its button", async () => {
    const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "claude" as const, root: "/w/a", path: canvas.path }];
    const withWork = (list: readonly ConversationSummary[]) => () => CanvasAgent({ list, canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, work, entries: [], onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed });
    let tree = render(withWork([summary({})]));
    (button(tree)!.props.onClick as () => void)();
    reply(undefined); await flush();
    tree = render(withWork([summary({ phase: "ended" })]));
    expect(all(tree).some(element => element.props.className === "doan-agent doan-agent-terminal")).toBe(true);
    expect(button(tree)).toBeUndefined();
    tree = render(agent([summary({ phase: "ended" })]));
    expect(shown(tree)).toBe(false);
  });

  test("a twin canvas in another project shows nothing from the first while its list is unread", () => {
    render(agent([summary({})]));
    const tree = render(() => CanvasAgent({ list: "error", canvas: { root: "/w/b", canvas }, buddy: "doany" as const, running: true, work: [], entries: [], onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed }));
    expect(shown(tree)).toBe(false);
  });
});

// DESIGN 'Terminal work in another worktree': the other worktree's notice. Open hands its root to App; the text's tooltip says
// the whole sentence, so a long label cut by the ellipsis stays readable.
describe("CanvasAgent another worktree", () => {
  const LONG = "feat/checkout-redesign-with-saved-payment-methods-and-guest-flow";
  const git = { common: "/repo/.git", main: "/w/a", worktrees: ["/w/a", "/w/b"] };
  const row = { path: canvas.path, id: canvas.id, url: "u" };
  const entries: FolderEntry[] = [
    { path: "/w/a", kind: "list", servedRev: 0, canvases: [row], git: { ...git, branch: "main" } },
    { path: "/w/b", kind: "list", servedRev: 0, canvases: [row], git: { ...git, branch: LONG } },
  ];
  const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "claude" as const, root: "/w/b", path: canvas.path }];
  beforeEach(reset);
  test("Open opens that worktree, and the tooltip carries the full sentence", () => {
    const onOpenSibling = vi.fn(), onOpen = vi.fn();
    const tree = render(() => CanvasAgent({ list: [], canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, work, entries, onOpen, onOpenSibling, onStopFailed: vi.fn() }));
    expect(button(tree)?.props["aria-label"]).toBe(`Open this canvas in ${LONG}`);
    expect(label(tree)).toBe("Open");
    (button(tree)!.props.onClick as () => void)();
    expect(onOpenSibling).toHaveBeenCalledWith("/w/b");
    expect(onOpen).not.toHaveBeenCalled();
    const tip = all(tree).find(element => element.type === TooltipContent);
    expect(tip?.props.children).toBe(`Agent is working on this canvas in ${LONG}`);
  });
  // design-sync (draft frame sibling-notice, tile 'sibling-long'): the tooltip opened above the notice (Radix's default
  // side), and a two-line sentence crossed the board's top edge; the draft puts it 4px under the capsule.
  test("the tooltip opens under the notice, clear of the capsule", () => {
    const tree = render(() => CanvasAgent({ list: [], canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, work, entries, onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed: vi.fn() }));
    const tip = all(tree).find(element => element.type === TooltipContent);
    expect(tip?.props.side).toBe("bottom");
    expect(tip?.props.sideOffset).toBe(14);
  });
  test("the notice goes when the session ends", () => {
    const props = { list: [] as ConversationSummary[], canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, entries, onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed: vi.fn() };
    expect(button(render(() => CanvasAgent({ ...props, work })))).toBeDefined();
    expect(button(render(() => CanvasAgent({ ...props, work: [] })))).toBeUndefined();
  });
});

describe("DotField lifecycle", () => {
  let frames: Map<number, unknown>, next: number;
  let visibility: (() => void) | null, windowVisible: ((visible: boolean) => void) | null, resize: (() => void) | null;
  const stopWindow = vi.fn();
  const doc = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const media = { motion: { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }, scheme: { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } };
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), globalAlpha: 1, fillStyle: "" };
  let rect = { width: 120, height: 60 }, color = "rgb(255, 255, 255)";
  const node = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => rect };
  // The Worker's side runs in-process on the stubbed frames: vitest has no Worker or transferControlToOffscreen.
  let posted: DotFieldMessage[], close = vi.fn<() => void>();
  const start = vi.fn((canvas: HTMLCanvasElement, init: { size: DotFieldSize; color: string; reducedMotion: boolean }) => {
    const receive = dotFieldWorker({ request: run => requestAnimationFrame(run), cancel: frame => cancelAnimationFrame(frame) });
    receive({ kind: "start", canvas: canvas as unknown as DotCanvas, ...init });
    return { post: (message: DotFieldMessage) => { posted.push(message); receive(message); }, close };
  });
  const field = (running: boolean) => () => DotField({ running, start });
  // The canvas element's ref is DotField's first ref.
  const attach = () => { if (!hooks.refs[0]!.current) hooks.refs[0]!.current = node; };

  beforeEach(() => {
    reset(); frames = new Map(); next = 1; visibility = null; windowVisible = null; resize = null; doc.hidden = false; posted = []; close = vi.fn<() => void>();
    rect = { width: 120, height: 60 }; color = "rgb(255, 255, 255)";
    for (const mock of [stopWindow, doc.addEventListener, doc.removeEventListener, media.motion.addEventListener, media.motion.removeEventListener, media.scheme.addEventListener, media.scheme.removeEventListener, observer.observe, observer.disconnect, start]) mock.mockClear();
    doc.addEventListener.mockImplementation((name: string, listener: () => void) => { if (name === "visibilitychange") visibility = listener; });
    vi.stubGlobal("window", { devicePixelRatio: 2, matchMedia: (query: string) => query.includes("reduced-motion") ? media.motion : media.scheme, doan: { onWindowVisible: (listener: (visible: boolean) => void) => { windowVisible = listener; return stopWindow; } } });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("getComputedStyle", () => ({ color }));
    vi.stubGlobal("requestAnimationFrame", (run: unknown) => { const id = next++; frames.set(id, run); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
    vi.stubGlobal("ResizeObserver", class { constructor(run: () => void) { resize = run; } observe = observer.observe; disconnect = observer.disconnect; });
  });
  afterEach(() => { vi.useRealTimers(); });

  test("hands the canvas to the Worker once, with its CSS size, the device pixel ratio, the colour and the motion setting", () => {
    render(field(true), attach);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(node, { size: { width: 120, height: 60, ratio: 2 }, color: "rgb(255, 255, 255)", reducedMotion: false });
    expect(posted).toContainEqual({ kind: "running", running: true });
    expect([node.width, node.height]).toEqual([240, 120]);
  });

  test("runs while shown; a hidden document leaves no frame pending, and it resumes when shown", () => {
    render(field(true), attach);
    expect(frames.size).toBe(1);
    doc.hidden = true; visibility!(); render(field(true), attach);
    expect(frames.size).toBe(0);
    doc.hidden = false; visibility!(); render(field(true), attach);
    expect(frames.size).toBe(1);
  });

  test("a hidden native window leaves no frame pending", () => {
    render(field(true), attach);
    windowVisible!(false); render(field(true), attach);
    expect(frames.size).toBe(0);
    windowVisible!(true); render(field(true), attach);
    expect(frames.size).toBe(1);
  });

  test("not running (hidden workspace, Overview cover) leaves no frame pending", () => {
    render(field(true), attach);
    render(field(false), attach);
    expect(frames.size).toBe(0);
  });

  test("reduced motion paints once and asks for no frame", () => {
    media.motion.matches = true;
    try {
      render(field(true), attach);
      expect(frames.size).toBe(0);
      expect(ctx.fill).toHaveBeenCalled();
    } finally { media.motion.matches = false; }
  });

  test("a change of the motion setting goes to the Worker", () => {
    render(field(true), attach);
    const change = media.motion.addEventListener.mock.calls.find(call => call[0] === "change")![1] as () => void;
    media.motion.matches = true;
    try { change(); } finally { media.motion.matches = false; }
    expect(posted).toContainEqual({ kind: "motion", reduced: true });
    expect(frames.size).toBe(0);
  });

  test("a resize sends the new size; the colour goes only when it changed, also on a colour scheme change", () => {
    render(field(true), attach);
    posted = [];
    rect = { width: 300, height: 100 };
    resize!();
    expect(posted).toEqual([{ kind: "size", size: { width: 300, height: 100, ratio: 2 } }]);
    posted = [];
    color = "rgb(0, 0, 0)";
    const scheme = media.scheme.addEventListener.mock.calls.find(call => call[0] === "change")![1] as () => void;
    scheme();
    expect(posted).toEqual([{ kind: "color", color: "rgb(0, 0, 0)" }]);
    posted = [];
    scheme();
    expect(posted).toEqual([]);
  });

  // Records each arc's radius to tell near dots (bigger than the base 1.5px) from far ones.
  function nearArcs(width: number, height: number) {
    const near: { x: number; y: number }[] = [];
    let far = 0;
    ctx.arc.mockImplementation((x: number, y: number, r: number) => { if (r > 1.5) near.push({ x, y }); else far++; });
    rect = { width, height };
    return { near, farCount: () => far, reset: () => { near.length = 0; far = 0; } };
  }

  test("a running frame draws near dots around the sweeping spot and its opposing spot", () => {
    const probe = nearArcs(1000, 60);
    try {
      render(field(true), attach);
      probe.reset();
      // The first frame starts the clock; the second is 1000ms in: the spot is at x 0 and its opposite at x 1000.
      (frames.get(1) as (now: number) => void)(1000);
      (frames.get(2) as (now: number) => void)(2000);
      expect(probe.near.some(dot => dot.x < 300)).toBe(true);
      expect(probe.near.some(dot => dot.x > 700)).toBe(true);
      expect(probe.near.every(dot => dot.x < 320 || dot.x > 680)).toBe(true);
    } finally { ctx.arc.mockReset(); }
  });

  test("reduced motion draws no spot at all: every dot is far", () => {
    media.motion.matches = true;
    try {
      const probe = nearArcs(1000, 60);
      render(field(true), attach);
      expect(probe.near).toEqual([]);
      expect(probe.farCount()).toBeGreaterThan(0);
    } finally { media.motion.matches = false; ctx.arc.mockReset(); }
  });

  test("unmount ends the Worker and leaves no observer, media listener or visibility subscription", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(field(true), attach);
    expect(observer.observe).toHaveBeenCalledWith(node);
    const motion = media.motion.addEventListener.mock.calls[0], scheme = media.scheme.addEventListener.mock.calls[0];
    expect(motion?.[0]).toBe("change");
    unmount();
    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(media.motion.removeEventListener).toHaveBeenCalledWith("change", motion![1]);
    expect(media.scheme.removeEventListener).toHaveBeenCalledWith("change", scheme![1]);
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", visibility);
    expect(stopWindow).toHaveBeenCalled();
  });

  // StrictMode runs a mounted effect's cleanup and the effect again on the same canvas, which can be transferred only once.
  test("a cleanup followed at once by a run on the same canvas keeps its Worker", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(field(true), attach);
    unmount();
    render(field(true), attach);
    vi.runAllTimers();
    expect(start).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });
});

// The indicator tells App the open canvas's work for the controller once per change, not per render.
describe("CanvasAgent work for the controller", () => {
  const term = { touched: 5, turn: "claude:t1", session: "s1", provider: "claude" as const, root: "/w/a", path: canvas.path, frame: "plans" };
  test("tells the picked work and its turn keys when they change, and the canvas with no work", () => {
    reset();
    const onWork = vi.fn();
    const props = { list: [] as ConversationSummary[], canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, entries: [], onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed: vi.fn(), onWork };
    render(() => CanvasAgent({ ...props, work: [] }));
    expect(onWork).toHaveBeenLastCalledWith({ root: "/w/a", path: canvas.path, work: null, keys: [] });
    render(() => CanvasAgent({ ...props, work: [term] }));
    expect(onWork).toHaveBeenLastCalledWith({ root: "/w/a", path: canvas.path, work: { source: "terminal:claude:s1", key: "terminal:claude:t1", frame: "plans", waiting: false }, keys: ["terminal:claude:t1"] });
    const calls = onWork.mock.calls.length;
    render(() => CanvasAgent({ ...props, work: [{ ...term }] }));
    expect(onWork).toHaveBeenCalledTimes(calls);
    render(() => CanvasAgent({ ...props, canvas: null, work: [term] }));
    expect(onWork).toHaveBeenLastCalledWith(null);
  });
  test("a project conversation's work reaches the controller too", () => {
    reset();
    const onWork = vi.fn();
    render(() => CanvasAgent({ list: [], canvas: { root: "/w/a", canvas }, buddy: "doany" as const, running: true, work: [], entries: [], onOpen: vi.fn(), onOpenSibling: vi.fn(), onStopFailed: vi.fn(), onWork,
      conversationWork: [{ conversationId: "p1", root: "/w/a", path: canvas.path, frame: "hero", touched: 3, turnId: "u1" }] }));
    expect(onWork).toHaveBeenLastCalledWith({ root: "/w/a", path: canvas.path, work: { source: "conversation:p1", key: "conversation:p1:u1", frame: "hero", waiting: false }, keys: ["conversation:p1:u1"] });
  });
});
