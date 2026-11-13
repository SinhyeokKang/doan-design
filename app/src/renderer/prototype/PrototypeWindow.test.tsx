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
const BOX = { x: 0, y: 0, width: 390, height: 844 };
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "loading", mode: "fit", run: { url: A, markWidth: 390, markHeight: 844 }, frames: [], canGoBack: false, canGoForward: false, previousStopped: false, ...over,
});

let changed: (view: PrototypeView | null) => void;
let snapshot: (value: { gen: number; png: Uint8Array; box: typeof BOX }) => void;
let messages: ((event: unknown) => void)[];
let resizes: (() => void)[];
let win: { innerWidth: number };
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
  messages = []; resizes = [];
  api = {
    read: vi.fn(async () => null),
    onChanged: vi.fn((listener: typeof changed) => { changed = listener; return () => {}; }),
    onSnapshot: vi.fn((listener: typeof snapshot) => { snapshot = listener; return () => {}; }),
    reportResult: vi.fn(async () => {}), reportFrames: vi.fn(async () => {}), reload: vi.fn(async () => {}),
    back: vi.fn(async () => {}), forward: vi.fn(async () => {}), choose: vi.fn(async () => {}), close: vi.fn(async () => {}), setMode: vi.fn(async () => {}),
  };
  doc = { title: "", activeElement: null, body: {} };
  vi.stubGlobal("document", doc);
  win = { innerWidth: 640,
    addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "message") messages.push(listener); if (type === "resize") resizes.push(listener as () => void); },
    removeEventListener: (type: string, listener: (event: unknown) => void) => { messages = messages.filter(item => item !== listener); resizes = resizes.filter(item => item !== listener); } } as never;
  vi.stubGlobal("window", win);
  let blobs = 0;
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => `blob:${++blobs}`), revokeObjectURL: vi.fn() }));
  render();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the run's iframe", () => {
  test("a loading view mounts a new iframe per gen and names the window after the frame", () => {
    expect(show(view()).layers).toEqual({ frames: [{ gen: 1, url: A, markWidth: 390, markHeight: 844 }], visible: null, snapshot: null });
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

  test("a ready run still sends its late drawer list; a run that left the screen is not heard", () => {
    const own = {};
    const s = show(view());
    s.frames!.set(1, { contentWindow: own } as never);
    show(view({ phase: "ready" }));
    for (const listener of messages) listener({ source: own, origin: "null", data: { gen: 1, frames: [] } });
    expect(api.reportFrames).toHaveBeenCalledOnce();
    show(view({ gen: 2, phase: "read-failed" }));
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
  test("waits behind a reloading run, replaces every run when the reload fails, and goes when a run is ready", () => {
    show(view());
    show(view({ phase: "ready" }));
    // Main captures the ready run as it leaves for the reload, before the loading view.
    snapshot({ gen: 2, png: new Uint8Array([1]), box: BOX });
    expect(show(view({ gen: 2 })).layers).toEqual({ frames: [{ gen: 1, url: A, markWidth: 390, markHeight: 844 }, { gen: 2, url: A, markWidth: 390, markHeight: 844 }], visible: 1, snapshot: { gen: 2, url: "blob:1", box: BOX } });
    expect(show(view({ gen: 2, phase: "init-failed" })).layers).toEqual({ frames: [], visible: null, snapshot: { gen: 2, url: "blob:1", box: BOX } });
    // A late image for an older gen is freed at once.
    snapshot({ gen: 1, png: new Uint8Array([1]), box: BOX });
    render();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    show(view({ gen: 3 }));
    show(view({ gen: 3, phase: "ready" }));
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

describe("the header's width and mode", () => {
  test("the shell gets the window's content width, before any view and after a resize", () => {
    expect(shell.width).toBe(640);
    win.innerWidth = 371;
    for (const listener of resizes) listener();
    expect(render().width).toBe(371);
  });

  test("Fit and Responsive go to main; the view's mode comes back from it", () => {
    show(view({ phase: "ready" }));
    shell.onMode("responsive");
    expect(api.setMode).toHaveBeenCalledExactlyOnceWith("responsive");
  });

  test("the frame menu's open state is held here and handed to the shell", () => {
    show(view({ phase: "ready" }));
    expect(shell.menuOpen).toBe(false);
    shell.onMenuOpen(true);
    expect(render().menuOpen).toBe(true);
    shell.onMenuOpen(false);
    expect(render().menuOpen).toBe(false);
  });
});

// A pointer Reload leaves focus where it was; the new run's iframe takes it when it was in the frame or on the page
// before the press and is still on the page when the new run is ready.
describe("focus after a pointer Reload", () => {
  const iframe = () => ({ focus: vi.fn(), contentWindow: {} });
  function reloadFrom(active: (old: ReturnType<typeof iframe>) => unknown) {
    const s = show(view({ phase: "ready" }));
    const old = iframe(), next = iframe();
    s.frames!.set(1, old as never);
    doc.activeElement = active(old);
    shell.onReloadPress();
    shell.onReload();
    expect(api.reload).toHaveBeenCalledWith(1);
    show(view({ gen: 2 }));
    s.frames!.set(2, next as never);
    return { s, old, next };
  }

  test("focus in the frame moves to the new iframe once it is ready, if it fell to the page meanwhile", () => {
    const { next } = reloadFrom(old => old);
    doc.activeElement = doc.body;
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).toHaveBeenCalledOnce();
    // Only once: a later run is not pulled along.
    show(view({ gen: 3 }));
    shell.frames!.set(3, iframe() as never);
    show(view({ gen: 3, phase: "ready" }));
    expect(next.focus).toHaveBeenCalledOnce();
  });

  test("focus on the page before the press also moves to the new iframe", () => {
    const { next } = reloadFrom(() => doc.body);
    doc.activeElement = doc.body;
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).toHaveBeenCalledOnce();
  });

  test("focus that moved elsewhere before the run was ready stays there", () => {
    const { next } = reloadFrom(old => old);
    doc.activeElement = { name: "composer" };
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
  });

  test("focus elsewhere at the press stays there", () => {
    const { next } = reloadFrom(() => ({ name: "Back" }));
    doc.activeElement = doc.body;
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
  });

  test("a keyboard Reload leaves focus on Reload", () => {
    const s = show(view({ phase: "ready" }));
    const next = iframe();
    doc.activeElement = doc.body;
    shell.onReload();
    show(view({ gen: 2 }));
    s.frames!.set(2, next as never);
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
  });

  test("a new run that fails takes focus to the scene's title instead, and a later ready does not take it", () => {
    const { s, next } = reloadFrom(old => old);
    const heading = { focus: vi.fn() };
    s.heading!.current = heading as never;
    s.content!.current = { contains: () => false } as never;
    doc.activeElement = doc.body;
    show(view({ gen: 2, phase: "init-failed" }));
    expect(heading.focus).toHaveBeenCalledOnce();
    show(view({ gen: 3 }));
    const third = iframe();
    shell.frames!.set(3, third as never);
    show(view({ gen: 3, phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
    expect(third.focus).not.toHaveBeenCalled();
  });
});
