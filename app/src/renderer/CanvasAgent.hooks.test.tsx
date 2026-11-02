import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";

// RBR5 🟡1: the indicator's wiring, run with hooks as plain state (the App tests' no-DOM style): the Stop callback's
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
// What leads the words: the filled square on Stop, the spinner on "Stopping…" (the draft's 'agent-working' and
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
  const agent = (list: readonly ConversationSummary[]) => () => CanvasAgent({ list, canvas: { root: "/w/a", canvas }, running: true, work: [], onOpen: vi.fn(), onStopFailed });
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
    expect(label(tree)).toBe("Stopping…");
    expect(lead(tree)).toBe("spinner");
    expect(button(tree)!.props["aria-disabled"]).toBe(true);
    // "Stopping…" ignores another press.
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
    expect(label(tree)).toBe("Stopping…");
    // Resolving with a rejected promise makes the pending interrupt reject instead of answering an error.
    reply(Promise.reject(new Error("gone"))); await flush();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
    expect(onStopFailed).toHaveBeenCalledWith("Couldn’t stop Codex. Try again.");
  });

  test("an accepted stop holds 'Stopping…' until the list shows the turn ended, and no toast", async () => {
    let tree = render(agent([summary({})]));
    (button(tree)!.props.onClick as () => void)();
    reply(undefined); await flush();
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stopping…");
    tree = render(agent([summary({ phase: "ended" })]));
    expect(shown(tree)).toBe(false);
    expect(onStopFailed).not.toHaveBeenCalled();
    // A later turn of the same conversation starts with Stop again.
    tree = render(agent([summary({})]));
    expect(label(tree)).toBe("Stop");
  });

  // terminal-agent-activity design '표시': the app turn ends while a terminal session still works on the canvas.
  test("after a Stop, the notice stays for a terminal session left on the canvas, without its button", async () => {
    const work = [{ session: "s1", provider: "claude" as const, root: "/w/a", path: canvas.path }];
    const withWork = (list: readonly ConversationSummary[]) => () => CanvasAgent({ list, canvas: { root: "/w/a", canvas }, running: true, work, onOpen: vi.fn(), onStopFailed });
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
    const tree = render(() => CanvasAgent({ list: "error", canvas: { root: "/w/b", canvas }, running: true, work: [], onOpen: vi.fn(), onStopFailed }));
    expect(shown(tree)).toBe(false);
  });
});

describe("DotField lifecycle", () => {
  let frames: Map<number, unknown>, next: number;
  let visibility: (() => void) | null, windowVisible: ((visible: boolean) => void) | null;
  const stopWindow = vi.fn();
  const doc = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), globalAlpha: 1, fillStyle: "" };
  const node = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 120, height: 60 }) };
  const field = (running: boolean) => () => DotField({ running });
  // The canvas element's ref is DotField's first ref.
  const attach = () => { if (!hooks.refs[0]!.current) hooks.refs[0]!.current = node; };

  beforeEach(() => {
    reset(); frames = new Map(); next = 1; visibility = null; windowVisible = null; doc.hidden = false;
    for (const mock of [stopWindow, doc.addEventListener, doc.removeEventListener, media.addEventListener, media.removeEventListener, observer.observe, observer.disconnect]) mock.mockClear();
    doc.addEventListener.mockImplementation((name: string, listener: () => void) => { if (name === "visibilitychange") visibility = listener; });
    vi.stubGlobal("window", { devicePixelRatio: 1, matchMedia: () => media, doan: { onWindowVisible: (listener: (visible: boolean) => void) => { windowVisible = listener; return stopWindow; } } });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("getComputedStyle", () => ({ color: "rgb(255, 255, 255)" }));
    vi.stubGlobal("requestAnimationFrame", (run: unknown) => { const id = next++; frames.set(id, run); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
    vi.stubGlobal("ResizeObserver", class { observe = observer.observe; disconnect = observer.disconnect; });
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
    media.matches = true;
    try {
      render(field(true), attach);
      expect(frames.size).toBe(0);
      expect(ctx.fill).toHaveBeenCalled();
    } finally { media.matches = false; }
  });

  test("unmount leaves no frame, observer, media listener or visibility subscription", () => {
    render(field(true), attach);
    expect(observer.observe).toHaveBeenCalledWith(node);
    const change = media.addEventListener.mock.calls[0];
    expect(change?.[0]).toBe("change");
    unmount();
    expect(frames.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", change![1]);
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", visibility);
    expect(stopWindow).toHaveBeenCalled();
  });
});
