import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PrototypeView } from "../../main/prototype/ipc";

// The window's host with hooks as plain state (StarPrompt.test.tsx style): main's view, the run's iframe, the 10 s
// timer, the forwarded reports, the still image and the focus rule. WindowShell's markup has its own tests.
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
const { PrototypeWindow } = await import("./PrototypeWindow");
type Shell = import("./PrototypeWindow").ShellProps;

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html";
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, frame: "checkout", title: "Checkout", phase: "loading", run: { url: A, markWidth: 390 }, frames: [], canGoBack: false, canGoForward: false, ...over,
});

let changed: (view: PrototypeView | null) => void;
let snapshot: (value: { gen: number; png: Uint8Array }) => void;
let messages: ((event: unknown) => void)[];
let api: Record<string, ReturnType<typeof vi.fn>>;
let doc: { title: string; activeElement: unknown; body: object };
let shell: Shell;

function render(): Shell {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.dirty = false;
    const tree = PrototypeWindow({ api: api as never }) as ReactElement<Shell>;
    shell = tree.props;
    const pending = hooks.pending.splice(0);
    for (const run of pending) run();
    if (!hooks.dirty && pending.length === 0) break;
  }
  return shell;
}
const show = (next: PrototypeView | null) => { changed(next); return render(); };

beforeEach(() => {
  vi.useFakeTimers();
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  messages = [];
  api = {
    read: vi.fn(async () => null),
    onChanged: vi.fn((listener: typeof changed) => { changed = listener; return () => {}; }),
    onSnapshot: vi.fn((listener: typeof snapshot) => { snapshot = listener; return () => {}; }),
    reportResult: vi.fn(async () => {}), reportFrames: vi.fn(async () => {}), reload: vi.fn(async () => {}),
    back: vi.fn(async () => {}), forward: vi.fn(async () => {}), choose: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  doc = { title: "", activeElement: null, body: {} };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "message") messages.push(listener); },
    removeEventListener: (type: string, listener: (event: unknown) => void) => { messages = messages.filter(item => item !== listener); } });
  let blobs = 0;
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => `blob:${++blobs}`), revokeObjectURL: vi.fn() }));
  render();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the run's iframe", () => {
  test("a loading view mounts a new iframe per gen and names the window after the frame", () => {
    expect(show(view()).layers).toEqual({ frames: [{ gen: 1, url: A }], visible: null, snapshot: null });
    expect(doc.title).toBe("Checkout — Prototype");
    expect(show(view({ phase: "ready" })).layers.visible).toBe(1);
    expect(show(view({ gen: 2 })).layers.frames.map(frame => frame.gen)).toEqual([1, 2]);
  });

  test("the first read applies only when no change arrived before it", async () => {
    api.read!.mockResolvedValueOnce(view({ gen: 9 }));
    hooks.states = []; hooks.refs = []; hooks.effects = [];
    render();
    await vi.runAllTicks();
    await Promise.resolve();
    expect(render().view?.gen).toBe(9);
  });
});

describe("the host's 10 s limit", () => {
  test("reports a timeout for a run that never answers", () => {
    show(view());
    vi.advanceTimersByTime(9_999);
    expect(api.reportResult).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(api.reportResult).toHaveBeenCalledExactlyOnceWith({ gen: 1, state: "timeout" });
  });

  test("stops once the run is no longer loading, and restarts for a new gen", () => {
    show(view());
    vi.advanceTimersByTime(5_000);
    show(view({ phase: "ready" }));
    vi.advanceTimersByTime(10_000);
    expect(api.reportResult).not.toHaveBeenCalled();
    show(view({ gen: 2 }));
    vi.advanceTimersByTime(10_000);
    expect(api.reportResult).toHaveBeenCalledExactlyOnceWith({ gen: 2, state: "timeout" });
  });
});

describe("forwarded reports", () => {
  test("only the current iframe's messages for the current gen reach main", () => {
    const own = {}, stale = {};
    const s = show(view());
    s.frames!.set(1, { contentWindow: own } as never);
    const ready = { gen: 1, state: "ready", size: "390x844", frames: [] };
    for (const listener of messages) listener({ source: stale, origin: "null", data: ready });
    expect(api.reportResult).not.toHaveBeenCalled();
    for (const listener of messages) listener({ source: own, origin: "null", data: ready });
    expect(api.reportResult).toHaveBeenCalledExactlyOnceWith(ready);
    for (const listener of messages) listener({ source: own, origin: "null", data: { gen: 1, frames: [] } });
    expect(api.reportFrames).toHaveBeenCalledExactlyOnceWith({ gen: 1, frames: [] });
  });

  test("a run that is ready stops listening", () => {
    show(view());
    show(view({ phase: "ready" }));
    expect(messages).toHaveLength(0);
  });
});

describe("the reading line", () => {
  test("shows 300 ms into a load and is spoken then", () => {
    show(view());
    expect(shell.readingShown).toBe(false);
    expect(shell.live).toBe("");
    vi.advanceTimersByTime(300);
    render();
    expect(shell.readingShown).toBe(true);
    expect(shell.live).toBe("Loading prototype");
  });
});

describe("the still image", () => {
  test("replaces the run for the gen on screen, and goes when a new run is ready", () => {
    show(view());
    show(view({ phase: "ready" }));
    snapshot({ gen: 1, png: new Uint8Array([1]) });
    expect(render().layers).toEqual({ frames: [], visible: null, snapshot: { gen: 1, url: "blob:1" } });
    snapshot({ gen: 0, png: new Uint8Array([1]) });
    render();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    show(view({ gen: 2 }));
    show(view({ gen: 2, phase: "ready" }));
    expect(shell.layers.snapshot).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
});

describe("focus on a new state", () => {
  test("moves to the title only when focus was inside the content", () => {
    const s = show(view({ phase: "ready" }));
    const heading = { focus: vi.fn() };
    s.heading!.current = heading as never;
    s.content!.current = { contains: () => true } as never;
    show(view({ phase: "frame-unavailable" }));
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    // Focus on a header control stays there.
    s.content!.current = { contains: () => false } as never;
    doc.activeElement = { name: "Back" };
    show(view({ gen: 2, phase: "prototype-unavailable" }));
    expect(heading.focus).toHaveBeenCalledOnce();
  });

  test("also moves when a load's inert content already dropped focus to the page", () => {
    const s = show(view({ phase: "ready" }));
    const heading = { focus: vi.fn() };
    s.heading!.current = heading as never;
    s.content!.current = { contains: () => false } as never;
    show(view({ gen: 2 }));
    doc.activeElement = doc.body;
    show(view({ gen: 2, phase: "frame-unavailable" }));
    expect(heading.focus).toHaveBeenCalledOnce();
  });
});

describe("header and scene actions", () => {
  test("go to main with the view's gen for Reload and Retry", () => {
    show(view({ gen: 4, phase: "init-failed" }));
    shell.onReload();
    shell.onBack();
    shell.onForward();
    shell.onChoose("account");
    shell.onClose();
    expect(api.reload).toHaveBeenCalledWith(4);
    expect(api.back).toHaveBeenCalledOnce();
    expect(api.forward).toHaveBeenCalledOnce();
    expect(api.choose).toHaveBeenCalledWith("account");
    expect(api.close).toHaveBeenCalledOnce();
  });

  test("Details opens and a new state closes it", () => {
    show(view({ phase: "read-failed", detail: "EACCES" }));
    shell.onDetails();
    expect(render().details).toBe(true);
    show(view({ gen: 2, phase: "read-failed", detail: "EACCES" }));
    expect(shell.details).toBe(false);
  });
});
