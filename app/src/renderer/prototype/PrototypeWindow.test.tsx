import type { ReactElement, ReactNode } from "react";
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
    useReducer: (reducer: (state: unknown, event: unknown) => unknown, initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = initial;
      return [hooks.states[index], (event: unknown) => {
        const value = reducer(hooks.states[index], event);
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});
const { PrototypeWindow } = await import("./PrototypeWindow");
const { deleteRefusalText } = await import("../conversationDelete");
type Shell = import("./PrototypeWindow").ShellProps;
type PrototypeApi = import("./PrototypeWindow").PrototypeApi;

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html";
const BOX = { x: 0, y: 0, width: 390, height: 844 };
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "loading", mode: "fit", run: { url: A, markWidth: 390, markHeight: 844 }, frames: [], gotos: [], canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: false, width: null }, canvasRow: "present", ...over,
});

let changed: (view: PrototypeView | null) => void;
let snapshot: (value: { gen: number; png: Uint8Array; box: typeof BOX }) => void;
let messages: ((event: unknown) => void)[];
let resizes: (() => void)[];
// Every keydown listener the window or its document adds, so a test can press a key on the whole page.
let keydowns: ((event: unknown) => void)[];
let win: { innerWidth: number };
let api: Record<string, ReturnType<typeof vi.fn>>;
let doc: { title: string; activeElement: unknown; body: object; hidden: boolean; addEventListener(type: string, listener: (event: unknown) => void): void; removeEventListener(type: string, listener: (event: unknown) => void): void; querySelector(): null; querySelectorAll(): unknown[]; hasFocus(): boolean };
// The window's focus and pointerdown listeners, which the activation hand-off (activationFocus.ts) adds.
let activation: Record<"focus" | "pointerdown", ((event: unknown) => void)[]>;
// The window comes forward: its focus event, then the task after the platform's own focus restore.
function activate() {
  for (const listener of [...activation.focus]) listener({});
  vi.advanceTimersByTime(0);
}
class FakeElement { isConnected = true; focus = vi.fn(); }
let running: (target: { root: string; path: string; frame: string }) => void;
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
    reportResult: vi.fn(async () => {}), reportFrames: vi.fn(async () => {}), goto: vi.fn(async () => {}), reload: vi.fn(async () => {}),
    back: vi.fn(async () => {}), forward: vi.fn(async () => {}), choose: vi.fn(async () => {}), close: vi.fn(async () => {}), setMode: vi.fn(async () => {}),
    export: vi.fn(async () => ({ kind: "cancelled" })), revealExport: vi.fn(async () => {}),
    onExportRunning: vi.fn((listener: typeof running) => { running = listener; return () => {}; }),
    onWindowVisible: vi.fn((listener: (visible: boolean) => void) => { listener(true); return () => {}; }),
    // The conversation panel's calls; the panel itself has its own tests (PrototypeConversation*.test.tsx).
    setPanel: vi.fn(async () => {}), setShowing: vi.fn(async () => {}), reveal: vi.fn(async () => {}), rememberChoice: vi.fn(async () => {}),
    readComposerSettings: vi.fn(async () => null), readTargetEntry: vi.fn(async () => null), rememberedConversation: vi.fn(async () => null), conversationListed: vi.fn(async () => null), getWork: vi.fn(async () => []), listConversations: vi.fn(() => new Promise(() => {})),
    conversationResumeTarget: vi.fn(() => new Promise(() => {})),
    getThumbnail: vi.fn(async () => ({ kind: "pending" })), setThumbnailVisibility: vi.fn(async () => {}), onThumbnailChanged: vi.fn(() => () => {}),
    ...Object.fromEntries(["onComposerSettings", "onTargetEntry", "onWorkChanged", "onConversationEvent", "onConversationStage", "onConversationBoundary", "onConversationListChanged", "onConversationHandoff", "onAgentAuth"].map(name => [name, vi.fn(() => () => {})])),
  };
  keydowns = [];
  const keys = {
    addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "keydown") keydowns.push(listener); },
    removeEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "keydown") keydowns = keydowns.filter(item => item !== listener); },
  };
  doc = { title: "", activeElement: null, body: {}, hidden: false, ...keys, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true };
  activation = { focus: [], pointerdown: [] };
  vi.stubGlobal("HTMLElement", FakeElement);
  // The toast's clock reads performance.now, which the fake timers leave alone.
  vi.stubGlobal("performance", { now: () => Date.now() });
  vi.stubGlobal("document", doc);
  win = { innerWidth: 640,
    addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "message") messages.push(listener); if (type === "resize") resizes.push(listener as () => void); if (type === "focus" || type === "pointerdown") activation[type].push(listener); keys.addEventListener(type, listener); },
    removeEventListener: (type: string, listener: (event: unknown) => void) => { messages = messages.filter(item => item !== listener); resizes = resizes.filter(item => item !== listener); if (type === "focus" || type === "pointerdown") activation[type] = activation[type].filter(item => item !== listener); keys.removeEventListener(type, listener); } } as never;
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
    const ready = { gen: 1, state: "ready", size: "390x844", frames: [], gotos: [] };
    for (const listener of messages) listener({ source: stale, origin: "null", data: ready });
    expect(api.reportResult).not.toHaveBeenCalled();
    for (const listener of messages) listener({ source: own, origin: "null", data: ready });
    expect(api.reportResult).toHaveBeenCalledExactlyOnceWith(ready);
    for (const listener of messages) listener({ source: own, origin: "null", data: { gen: 1, frames: [], gotos: [] } });
    expect(api.reportFrames).toHaveBeenCalledExactlyOnceWith({ gen: 1, frames: [], gotos: [] });
  });

  test("a ready run still sends its late drawer list; a run that left the screen is not heard", () => {
    const own = {};
    const s = show(view());
    s.frames!.set(1, { contentWindow: own } as never);
    show(view({ phase: "ready" }));
    for (const listener of messages) listener({ source: own, origin: "null", data: { gen: 1, frames: [], gotos: [] } });
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

// The first read failed and no change came yet: the window shows the failure scene with Retry, not a blank panel.
describe("a failed first read", () => {
  const LINE = "Couldn’t open this prototype. Doan couldn’t start this window. Retry, or close it and play the frame again from the canvas.";
  const failFirst = async () => {
    api.read!.mockRejectedValueOnce(new Error("ipc"));
    hooks.states = []; hooks.refs = []; hooks.effects = [];
    render();
    await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve();
    return render();
  };
  const settle = async () => { await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve(); return render(); };

  test("shows the failure scene and says it in the live region", async () => {
    const s = await failFirst();
    expect(s.view).toBeNull();
    expect(s.readFailure).toEqual({ running: false });
    expect(s.live).toBe(LINE);
  });

  test("Retry reads again and is busy until the read answers; a press meanwhile reads nothing more", async () => {
    await failFirst();
    const reads = api.read!.mock.calls.length;
    let answer!: (value: PrototypeView | null) => void;
    api.read!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    shell.onReadRetry!();
    expect(render().readFailure).toEqual({ running: true });
    shell.onReadRetry!();
    expect(api.read).toHaveBeenCalledTimes(reads + 1);
    answer(view({ gen: 5 }));
    const s = await settle();
    expect(s.readFailure ?? null).toBeNull();
    expect(s.view?.gen).toBe(5);
  });

  test("a Retry that fails again keeps the scene, Retry pressable, and changes the line so it is read again", async () => {
    await failFirst();
    api.read!.mockRejectedValueOnce(new Error("ipc"));
    shell.onReadRetry!();
    const s = await settle();
    expect(s.readFailure).toEqual({ running: false });
    expect(s.live).toBe(`${LINE}\u00a0`);
  });

  test("a change from main replaces the scene with its view, and a Retry's later answer does not replace it", async () => {
    await failFirst();
    let answer!: (value: PrototypeView | null) => void;
    api.read!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    shell.onReadRetry!();
    const s = show(view({ gen: 7 }));
    expect(s.readFailure ?? null).toBeNull();
    answer(view({ gen: 3 }));
    expect((await settle()).view?.gen).toBe(7);
  });

  test("the scene's title takes focus when focus is on the page", async () => {
    await failFirst();
    const heading = { focus: vi.fn() };
    shell.heading!.current = heading as never;
    doc.activeElement = doc.body;
    api.read!.mockRejectedValueOnce(new Error("ipc"));
    hooks.states = []; hooks.refs = []; hooks.effects = [];
    render();
    shell.heading!.current = heading as never;
    await settle();
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
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

  // POSTMORTEM 2026-11-17 and its 2026-11-20 recurrence: activation restores focus to the removed iframe's place.
  test("a state that arrives while the window is in the background takes the title again on activation", () => {
    const s = show(view({ phase: "ready" }));
    const heading = { focus: vi.fn() };
    s.heading!.current = heading as never;
    s.content!.current = { contains: () => true } as never;
    doc.hasFocus = () => false;
    show(view({ phase: "frame-unavailable" }));
    expect(heading.focus).toHaveBeenCalledOnce();
    activate();
    expect(heading.focus.mock.calls.length).toBeGreaterThan(1);
    expect(heading.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  test("the replay finds only the scene that still owns focus", () => {
    const s = show(view({ phase: "ready" }));
    const heading = { focus: vi.fn() };
    s.heading!.current = heading as never;
    s.content!.current = { contains: () => true } as never;
    doc.hasFocus = () => false;
    show(view({ phase: "frame-unavailable" }));
    // A run starts again before activation: its loading view has no scene, so the old title is not the destination.
    show(view({ gen: 2 }));
    activate();
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
    shell.onReloadClick(true);
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
    shell.onReloadClick(false);
    expect(api.reload).toHaveBeenCalledWith(1);
    show(view({ gen: 2 }));
    s.frames!.set(2, next as never);
    show(view({ gen: 2, phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
  });

  // A press released off the button sends no click, so no Reload happened: nothing it remembered may move focus later.
  test("a cancelled press does not move focus when another Play's run is ready", () => {
    const s = show(view({ phase: "ready" }));
    const old = iframe(), next = iframe();
    s.frames!.set(1, old as never);
    doc.activeElement = old;
    shell.onReloadPress();
    expect(api.reload).not.toHaveBeenCalled();
    show(view({ gen: 2, frame: "account" }));
    s.frames!.set(2, next as never);
    doc.activeElement = doc.body;
    show(view({ gen: 2, frame: "account", phase: "ready" }));
    expect(next.focus).not.toHaveBeenCalled();
  });

  test("a keyboard Reload after a cancelled press leaves focus where it is", () => {
    const s = show(view({ phase: "ready" }));
    const old = iframe(), next = iframe();
    s.frames!.set(1, old as never);
    doc.activeElement = old;
    shell.onReloadPress();
    doc.activeElement = { name: "Reload prototype" };
    shell.onReloadClick(false);
    show(view({ gen: 2 }));
    s.frames!.set(2, next as never);
    doc.activeElement = doc.body;
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

// A link click in the playing frame: the script posts `{gen, goto}`, the window judges it by its own view
// and either asks main to move, shows the broken link's toast or drops it.
describe("link moves", () => {
  const LISTED = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", title: "Account", size: "390x844", number: 2 }];
  const at = (over: Partial<PrototypeView> = {}) => view({ phase: "ready", frames: LISTED, ...over });
  const iframe = () => ({ focus: vi.fn(), contentWindow: {} });
  const toastText = () => {
    const element = shell.toast as ReactElement<{ children: [ReactElement<{ children: string }>, unknown] }> | null | undefined;
    return element ? element.props.children[0].props.children : null;
  };
  function click(goto: string | null, gen = 1) {
    const element = shell.frames!.get(gen) as unknown as { contentWindow: unknown } | undefined;
    for (const listener of [...messages]) listener({ source: element?.contentWindow, origin: "null", data: { gen, goto } });
    return render();
  }
  // A run mounts its iframe while it loads; only then does the window hear its messages.
  function playing(over: Partial<PrototypeView> = {}) {
    show(at({ ...over, phase: "loading" }));
    const s = show(at(over));
    const old = iframe();
    s.frames!.set(over.gen ?? 1, old as never);
    return old;
  }

  test("a link to a listed frame asks main to move; the title, the drawer and the panel follow main's view", () => {
    playing();
    click("account");
    expect(api.goto).toHaveBeenCalledExactlyOnceWith({ gen: 1, goto: "account" });
    show(at({ gen: 2, phase: "loading", frame: "account", title: "Account" }));
    expect(doc.title).toBe("Account — Prototype");
    expect(shell.view).toMatchObject({ frame: "account", title: "Account" });
  });

  test("focus in the frame at the click goes to the new frame once it is ready, and the live region names it once", () => {
    const old = playing();
    doc.activeElement = old;
    click("account");
    show(at({ gen: 2, phase: "loading", frame: "account", title: "Account" }));
    const next = iframe();
    shell.frames!.set(2, next as never);
    doc.activeElement = doc.body;
    expect(shell.live).toBe("");
    show(at({ gen: 2, frame: "account", title: "Account" }));
    expect(next.focus).toHaveBeenCalledOnce();
    expect(shell.live).toBe("Account");
    // A Reload of the frame it moved to is no move: nothing is announced again.
    show(at({ gen: 3, phase: "loading", frame: "account", title: "Account" }));
    shell.frames!.set(3, iframe() as never);
    show(at({ gen: 3, frame: "account", title: "Account" }));
    expect(shell.live).toBe("");
    expect(next.focus).toHaveBeenCalledOnce();
  });

  test("focus outside the frame at the click stays where it is", () => {
    playing();
    doc.activeElement = { name: "Back" };
    click("account");
    show(at({ gen: 2, phase: "loading", frame: "account", title: "Account" }));
    const next = iframe();
    shell.frames!.set(2, next as never);
    show(at({ gen: 2, frame: "account", title: "Account" }));
    expect(next.focus).not.toHaveBeenCalled();
    expect(shell.live).toBe("Account");
  });

  test("a link to the playing frame restarts it with focus back in it and no announcement", () => {
    const old = playing();
    doc.activeElement = old;
    click("checkout");
    expect(api.goto).toHaveBeenCalledExactlyOnceWith({ gen: 1, goto: "checkout" });
    show(at({ gen: 2, phase: "loading" }));
    const next = iframe();
    shell.frames!.set(2, next as never);
    doc.activeElement = doc.body;
    show(at({ gen: 2 }));
    expect(next.focus).toHaveBeenCalledOnce();
    expect(shell.live).toBe("");
  });

  // Main holds the loading view behind its still of A, so this window still shows A ready when a second link follows:
  // main refuses that one (its gen is old), and the first move's announcement must survive it.
  test("a second link sent before the first move's view arrives keeps the first move's announcement", () => {
    for (const second of ["settings", "checkout"]) {
      hooks.states = []; hooks.refs = []; hooks.effects = []; messages = [];
      render();
      const frames = [...LISTED, { id: "settings", title: "Settings", size: "390x844", number: 3 }];
      playing({ frames });
      click("account");
      click(second);
      expect(api.goto!.mock.calls.slice(-2), second).toEqual([[{ gen: 1, goto: "account" }], [{ gen: 1, goto: second }]]);
      show(at({ gen: 2, phase: "loading", frame: "account", title: "Account", frames }));
      shell.frames!.set(2, iframe() as never);
      show(at({ gen: 2, frame: "account", title: "Account", frames }));
      expect(shell.live, second).toBe("Account");
    }
  });

  test("a link to a frame the run does not list shows one toast, replaced by the next, and does not ask main", () => {
    playing();
    click("receipt");
    expect(toastText()).toBe("Can’t go to “receipt”. Ask your agent to fix this link.");
    click(null);
    expect(toastText()).toBe("Can’t go to this link’s frame. Ask your agent to fix this link.");
    expect(api.goto).not.toHaveBeenCalled();
  });

  test("an export's toast on screen keeps the link's toast away", async () => {
    playing();
    let answer!: (reply: unknown) => void;
    api.export!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    shell.onExport();
    running({ root: "/r", path: ".doan/canvases/a.html", frame: "checkout" });
    vi.advanceTimersByTime(1000);
    render();
    expect(toastText()).toBe("Exporting “Checkout”");
    click("receipt");
    expect(toastText()).toBe("Exporting “Checkout”");
    answer({ kind: "exported", external: 0, reveal: "id-1" });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    render();
    const result = toastText();
    expect(result).toMatch(/^Exported “Checkout”/);
    click("receipt");
    expect(toastText()).toBe(result);
    // A listed frame still moves.
    click("account");
    expect(api.goto).toHaveBeenCalledExactlyOnceWith({ gen: 1, goto: "account" });
  });

  test("a click while the run loads, failed or was lost does nothing", () => {
    for (const phase of ["loading", "init-failed", "frame-unavailable"] as const) {
      hooks.states = []; hooks.refs = []; hooks.effects = []; messages = [];
      render();
      show(at({ phase }));
      shell.frames!.set(1, iframe() as never);
      click("account");
      click("receipt");
      expect(api.goto, phase).not.toHaveBeenCalled();
      expect(toastText(), phase).toBeNull();
    }
  });
});

// The header's Export (ARCHITECTURE §7 'Prototype window IPC'): main shows the save panel and runs the CLI; the window
// shows "Exporting" from main's running event to the reply, and the result as a toast in this window.
describe("Export", () => {
  type Reply = Awaited<ReturnType<PrototypeApi["export"]>>;
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); return render(); };
  const toastParts = () => {
    const element = shell.toast as ReactElement<{ children: [ReactElement<{ children: string }>, ReactElement<{ children: ReactNode; onClick(): void }> | false | undefined] }> | null | undefined;
    if (!element) return null;
    const [message, action] = element.props.children;
    return { text: message.props.children, action: action || null };
  };
  function pending() {
    let answer!: (reply: Reply) => void;
    api.export!.mockImplementationOnce(() => new Promise<Reply>(resolve => { answer = resolve; }));
    return (reply: Reply) => answer(reply);
  }
  const target = { root: "/r", path: ".doan/canvases/a.html", frame: "checkout" };

  test("sends the target shown at the click, once while an export is pending", () => {
    show(view({ phase: "ready" }));
    pending();
    shell.onExport();
    shell.onExport();
    expect(api.export).toHaveBeenCalledExactlyOnceWith(target);
  });

  test("main's running event turns Export to Exporting and shows the progress toast after 1 s", async () => {
    show(view({ phase: "ready" }));
    const answer = pending();
    shell.onExport();
    expect(render().exporting).toBe(false);
    running(target);
    expect(render().exporting).toBe(true);
    vi.advanceTimersByTime(999);
    expect(render() && toastParts()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(render() && toastParts()?.text).toBe("Exporting “Checkout”");
    answer({ kind: "exported", external: 0, reveal: "id-1" });
    expect((await settle()).exporting).toBe(false);
  });

  test("a running event for another export changes nothing", () => {
    show(view({ phase: "ready" }));
    running(target);
    expect(render().exporting).toBe(false);
    pending();
    shell.onExport();
    running({ ...target, frame: "other" });
    expect(render().exporting).toBe(false);
  });

  test("the success toast says the file holds the whole canvas, reveals the file and goes after its time", async () => {
    show(view({ phase: "ready" }));
    const answer = pending();
    shell.onExport();
    running(target);
    answer({ kind: "exported", external: 1, reveal: "id-1" });
    await settle();
    const toast = toastParts()!;
    expect(toast.text).toBe("Exported “Checkout”. The file also contains the rest of the canvas. Parts of it load from the internet.");
    expect(toast.action && toast.action.props.children).toBe("Show in Finder");
    vi.advanceTimersByTime(8_000);
    render();
    vi.advanceTimersByTime(500);
    expect(render() && toastParts()).toBeNull();
  });

  test("Show in Finder asks main with the reply's id", async () => {
    show(view({ phase: "ready" }));
    const answer = pending();
    shell.onExport();
    answer({ kind: "exported", external: 0, reveal: "id-7" });
    await settle();
    toastParts()!.action!.props.onClick();
    render();
    expect(api.revealExport).toHaveBeenCalledExactlyOnceWith("id-7");
  });

  test("a cancelled save panel shows nothing and frees Export", async () => {
    show(view({ phase: "ready" }));
    shell.onExport();
    await settle();
    expect(toastParts()).toBeNull();
    expect(shell.exporting).toBe(false);
    shell.onExport();
    expect(api.export).toHaveBeenCalledTimes(2);
  });

  test("the result names the clicked frame even when another plays by then", async () => {
    show(view({ phase: "ready" }));
    const answer = pending();
    shell.onExport();
    running(target);
    show(view({ gen: 2, frame: "account", title: "Account", phase: "loading" }));
    expect(shell.exporting).toBe(true);
    answer({ kind: "failed", reason: "notMarked" });
    await settle();
    expect(toastParts()?.text).toBe("Couldn’t export “Checkout”. It isn’t marked for prototyping in the canvas file. Ask your agent to mark it.");
  });

  test("a click on a frame that stopped playing gets the stale-click toast", async () => {
    show(view({ phase: "ready" }));
    api.export!.mockResolvedValueOnce({ kind: "refused", reason: "changed" });
    shell.onExport();
    await settle();
    expect(toastParts()?.text).toBe("Couldn’t export “Checkout”. Another frame started playing first. Play “Checkout” again, then export it.");
  });

  test("a failed call reads as any other failure", async () => {
    show(view({ phase: "ready" }));
    api.export!.mockRejectedValueOnce(new Error("gone"));
    shell.onExport();
    await settle();
    expect(toastParts()?.text).toBe("Couldn’t export “Checkout”. Try again.");
  });

  // The save panel takes focus from the page; it goes back where it was before the press (Export after a key press,
  // the frame after a pointer press, which never moves focus), once, if it fell to the page.
  test("focus that fell to the page during the save panel goes back where it was before the press", async () => {
    show(view({ phase: "ready" }));
    const before = new FakeElement();
    doc.activeElement = before;
    const answer = pending();
    shell.onExport();
    doc.activeElement = doc.body;
    running(target);
    expect(before.focus).toHaveBeenCalledOnce();
    doc.activeElement = doc.body;
    answer({ kind: "cancelled" });
    await settle();
    expect(before.focus).toHaveBeenCalledOnce();
  });

  test("a return made while the window is in the background is made again on activation", async () => {
    show(view({ phase: "ready" }));
    const before = new FakeElement();
    doc.activeElement = before;
    const answer = pending();
    shell.onExport();
    doc.activeElement = doc.body;
    doc.hasFocus = () => false;
    answer({ kind: "cancelled" });
    await settle();
    expect(before.focus).toHaveBeenCalledOnce();
    activate();
    expect(before.focus.mock.calls.length).toBeGreaterThan(1);
  });

  test("focus put elsewhere meanwhile stays there", async () => {
    show(view({ phase: "ready" }));
    const before = new FakeElement();
    doc.activeElement = before;
    shell.onExport();
    doc.activeElement = { name: "Back" };
    await settle();
    expect(before.focus).not.toHaveBeenCalled();
  });
});

describe("the conversation panel", () => {
  const conversation = () => shell.conversation!;
  const field = () => ({ focus: vi.fn() });

  test("the button asks main to open the panel, before any view too, and to fold it", () => {
    conversation().onToggle();
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: true });
    show(view({ panel: { open: true, width: 280 } }));
    conversation().onToggle();
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: false });
  });

  test("the button and column follow main's panel state, at the width main answered", () => {
    // A window wide enough that 300 is within the panel's range (at 640 the range is 280 only).
    win.innerWidth = 1000;
    resizes.forEach(resize => resize());
    expect(show(view()).conversation).toMatchObject({ open: false, button: { label: "Show conversation" } });
    expect(show(view({ panel: { open: true, width: 300 } })).conversation).toMatchObject({ open: true, width: 300, button: { label: "Show conversation" } });
  });

  test("opening puts focus in the composer's field; folding puts it on the button", () => {
    show(view());
    const input = field();
    conversation().column!.current = { querySelector: (selector: string) => selector === ".composer-input" ? input : null, contains: () => false } as never;
    conversation().onToggle();
    // Not before main's view opens the panel: until then the column is hidden ([data-collapsed]) and inert, so a focus() there
    // does nothing and focus falls to the page (POSTMORTEM 2026-11-03).
    vi.runAllTicks();
    expect(input.focus).not.toHaveBeenCalled();
    show(view({ panel: { open: true, width: 280 } }));
    vi.runAllTicks();
    expect(input.focus).toHaveBeenCalledOnce();
    const button = field();
    conversation().buttonRef!.current = button as never;
    conversation().onToggle();
    // Not before main's view closes it: the header's button is still hidden (display: none) until then.
    vi.runAllTicks();
    expect(button.focus).not.toHaveBeenCalled();
    show(view({ panel: { open: false, width: 280 } }));
    vi.runAllTicks();
    expect(button.focus).toHaveBeenCalledOnce();
    expect(input.focus).toHaveBeenCalledOnce();
  });

  // Space and Enter on the header's button are its click; Hide conversation in the panel's head is the same toggle.
  test("opened by key it focuses the composer; Hide conversation closes it onto the header's button; Esc is no toggle", () => {
    show(view());
    const input = field(), button = field();
    conversation().column!.current = { querySelector: (selector: string) => selector === ".composer-input" ? input : null, contains: () => false } as never;
    conversation().buttonRef!.current = button as never;
    conversation().onToggle();
    expect(input.focus).not.toHaveBeenCalled();
    show(view({ panel: { open: true, width: 280 } }));
    expect(input.focus).toHaveBeenCalledOnce();
    expect(button.focus).not.toHaveBeenCalled();
    // Esc pressed anywhere in the window asks main for nothing; the panel stays open.
    api.setPanel!.mockClear();
    const escape = { type: "keydown", key: "Escape", code: "Escape", target: input, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of [...keydowns]) listener(escape);
    expect(api.setPanel).not.toHaveBeenCalled();
    expect(render().conversation).toMatchObject({ open: true });
    conversation().onToggle();
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: false });
    expect(button.focus).not.toHaveBeenCalled();
    show(view({ panel: { open: false, width: 280 } }));
    expect(button.focus).toHaveBeenCalledOnce();
  });

  // Before the first view the panel has no composer: focus goes to the head's menu button (aria-disabled, still
  // focusable), not the hidden header button.
  test("opened before the first view, focus goes to the head's menu button, then once to the composer the view brings", () => {
    const head = field(), input = field();
    let composer: typeof input | null = null;
    conversation().column!.current = { querySelector: (selector: string) => selector === ".composer-input" ? composer : selector === ".doan-conv-title .ov-title" ? head : null, contains: () => false } as never;
    conversation().onToggle();
    show(view({ panel: { open: true, width: 280 } }));
    expect(head.focus).toHaveBeenCalledOnce();
    expect(input.focus).not.toHaveBeenCalled();
    doc.activeElement = head;
    composer = input;
    show(view({ panel: { open: true, width: 280 }, phase: "ready" }));
    expect(input.focus).toHaveBeenCalledOnce();
    doc.activeElement = input;
    show(view({ gen: 2, panel: { open: true, width: 280 } }));
    expect(input.focus).toHaveBeenCalledOnce();
  });

  test("focus the person moved off the head's menu button before the composer came stays where it is", () => {
    const head = field(), input = field(), elsewhere = field();
    let composer: typeof input | null = null;
    conversation().column!.current = { querySelector: (selector: string) => selector === ".composer-input" ? composer : selector === ".doan-conv-title .ov-title" ? head : null, contains: () => false } as never;
    conversation().onToggle();
    show(view({ panel: { open: true, width: 280 } }));
    expect(head.focus).toHaveBeenCalledOnce();
    doc.activeElement = elsewhere;
    composer = input;
    show(view({ panel: { open: true, width: 280 }, phase: "ready" }));
    expect(input.focus).not.toHaveBeenCalled();
  });

  // The canvas page's fold motion: only this window's own toggle animates the column, both ways, for as long as the
  // canvas page keeps it (250 ms); main's own state, a drag and a committed width do not.
  test("the toggle animates the column both ways, then the motion ends", () => {
    show(view());
    expect(conversation().motion).toBeFalsy();
    conversation().onToggle();
    expect(render().conversation!.motion).toBe(true);
    show(view({ panel: { open: true, width: 280 } }));
    expect(conversation().motion).toBe(true);
    vi.advanceTimersByTime(250);
    expect(render().conversation!.motion).toBe(false);
    conversation().onToggle();
    expect(render().conversation!.motion).toBe(true);
    show(view({ panel: { open: false, width: 280 } }));
    vi.advanceTimersByTime(250);
    expect(render().conversation!.motion).toBe(false);
  });

  test("a panel main opens or closes by itself, a drag and a committed width do not animate", () => {
    show(view({ panel: { open: true, width: 280 } }));
    expect(conversation().motion).toBeFalsy();
    conversation().preview(300);
    expect(render().conversation!.motion).toBeFalsy();
    conversation().onResize(300);
    expect(render().conversation!.motion).toBeFalsy();
    show(view({ panel: { open: false, width: 280 } }));
    expect(conversation().motion).toBeFalsy();
  });

  // Main keeps the panel's state across another play, so Back and doan open --prototype leave it open with its head.
  test("Back and a CLI play keep the panel open with its head's title", () => {
    show(view({ panel: { open: true, width: 280 } }));
    const title = conversation().title;
    expect(title).toBeDefined();
    show(view({ gen: 2, frame: "cart", title: "Cart", panel: { open: true, width: 280 } }));
    expect(conversation()).toMatchObject({ open: true });
    expect((conversation().title as { type: unknown }).type).toBe((title as { type: unknown }).type);
    expect(api.setPanel).not.toHaveBeenCalled();
  });

  test("a window narrowed while open cuts the panel to that window's maximum", () => {
    win.innerWidth = 1024;
    resizes.forEach(resize => resize());
    expect(show(view({ panel: { open: true, width: 512 } })).conversation).toMatchObject({ width: 512 });
    win.innerWidth = 700;
    resizes.forEach(resize => resize());
    expect(render().conversation).toMatchObject({ width: 340, bounds: { min: 280, max: 340 } });
    expect(render().width).toBe(700);
  });

  test("a view that arrives with the panel already open moves no focus", () => {
    const input = field();
    conversation().column!.current = { querySelector: () => input, contains: () => false } as never;
    show(view({ panel: { open: true, width: 280 } }));
    vi.runAllTicks();
    expect(input.focus).not.toHaveBeenCalled();
  });

  test("a resize is clamped to the panel's range for the window before main hears it", () => {
    win.innerWidth = 1000;
    resizes.forEach(resize => resize());
    show(view({ panel: { open: true, width: 320 } }));
    conversation().onResize(900);
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: true, width: 500 });
    conversation().onResize(100);
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: true, width: 280 });
    // A double click is the default width, max(320, 28 %) cut to the maximum.
    conversation().onResize(undefined);
    expect(api.setPanel).toHaveBeenLastCalledWith({ open: true, width: 320 });
    expect(conversation().bounds).toEqual({ min: 280, max: 500 });
  });

  test("under 640 the handle has no range: 280 to 280", () => {
    win.innerWidth = 600;
    resizes.forEach(resize => resize());
    expect(show(view({ panel: { open: true, width: 280 } })).conversation).toMatchObject({ width: 280, bounds: { min: 280, max: 280 } });
  });
});

// The head menu's Delete asks first; afterwards focus goes to the head's menu button, whatever the panel shows next.
describe("Delete from the head menu", () => {
  type Head = ReactElement<{ onDelete(target: unknown, trigger: HTMLElement | null): boolean }>;
  type Dialog = ReactElement<{ view: { title: string }; pending: boolean; confirm(): void; cancel(): void }>;
  const target = { conversationId: "c1", root: "/r", title: "Ideas", provider: "claude", from: "canvas" };
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); return render(); };
  const toastText = () => (shell.toast as ReactElement<{ children: [ReactElement<{ children: string }>] }> | null | undefined)?.props.children[0].props.children ?? null;
  function asked(): { trigger: InstanceType<typeof FakeElement>; dialog: () => Dialog | undefined } {
    show(view({ panel: { open: true, width: 280 } }));
    const trigger = new FakeElement();
    expect((shell.conversation!.title as Head).props.onDelete(target, trigger as never)).toBe(true);
    return { trigger, dialog: () => render().dialog as Dialog | undefined };
  }

  test("asks first; confirming asks main, closes the alert and puts focus on the head's menu button", async () => {
    api.deleteConversation = vi.fn(async () => undefined);
    const { trigger, dialog } = asked();
    expect(dialog()!.props.view.title).toContain("Ideas");
    expect(api.deleteConversation).not.toHaveBeenCalled();
    dialog()!.props.confirm();
    expect(dialog()!.props.pending).toBe(true);
    await settle();
    expect(api.deleteConversation).toHaveBeenCalledExactlyOnceWith({ conversationId: "c1" });
    expect(dialog()).toBeFalsy();
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(toastText()).toBeNull();
  });

  test("a delete that ends while the window is in the background returns focus again on activation", async () => {
    api.deleteConversation = vi.fn(async () => undefined);
    const { trigger, dialog } = asked();
    doc.hasFocus = () => false;
    dialog()!.props.confirm();
    await settle();
    expect(trigger.focus).toHaveBeenCalledOnce();
    activate();
    expect(trigger.focus.mock.calls.length).toBeGreaterThan(1);
  });

  test("Cancel closes the alert onto the head's menu button and asks main nothing", () => {
    api.deleteConversation = vi.fn(async () => undefined);
    const { trigger, dialog } = asked();
    dialog()!.props.cancel();
    expect(dialog()).toBeFalsy();
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });

  test("a refusal closes the alert and says why", async () => {
    api.deleteConversation = vi.fn(async () => ({ error: "busy" }));
    const { trigger, dialog } = asked();
    dialog()!.props.confirm();
    await settle();
    expect(dialog()).toBeFalsy();
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(toastText()).toBe(deleteRefusalText("busy", "Ideas"));
  });

  // A modal holds the toast's clock (ARCHITECTURE §7 'Toasts'), in this window as in the main one.
  test("a toast shown before the alert opens outlasts it, and its time runs again once the alert closes", async () => {
    api.deleteConversation = vi.fn(async () => ({ error: "busy" }));
    const first = asked();
    first.dialog()!.props.confirm();
    await settle();
    expect(toastText()).toBe(deleteRefusalText("busy", "Ideas"));
    const second = asked();
    // The mocked hooks apply state only on render, so time passes in steps with a render after each.
    const wait = (ms: number) => { for (let at = 0; at < ms; at += 500) { vi.advanceTimersByTime(500); render(); } };
    const leaving = () => (shell.toast as ReactElement<Record<string, unknown>> | null | undefined)?.props["data-closing"] !== undefined;
    wait(20_000);
    expect(second.dialog()).toBeTruthy();
    expect(toastText()).toBe(deleteRefusalText("busy", "Ideas"));
    expect(leaving()).toBe(false);
    second.dialog()!.props.cancel();
    render();
    expect(toastText()).toBe(deleteRefusalText("busy", "Ideas"));
    expect(leaving()).toBe(false);
    wait(20_000);
    expect(toastText()).toBeNull();
  });
});

describe("presses before main answers", () => {
  test("two presses before an answer both ask to open; the open then puts focus in the composer once", () => {
    const conversation = () => shell.conversation!;
    const input = { focus: vi.fn() }, button = { focus: vi.fn() };
    conversation().column!.current = { querySelector: () => input, contains: () => false } as never;
    conversation().buttonRef!.current = button as never;
    conversation().onToggle();
    conversation().onToggle();
    expect(api.setPanel!.mock.calls.map(([request]) => request)).toEqual([{ open: true }, { open: true }]);
    show(view({ panel: { open: true, width: 280 } }));
    expect(input.focus).toHaveBeenCalledOnce();
    expect(button.focus).not.toHaveBeenCalled();
  });

  test("a request main never shows leaves the next press deciding from the view", () => {
    show(view({ panel: { open: false, width: null } }));
    shell.conversation!.onToggle();
    // Main refused or dropped it: the view stays folded.
    show(view({ gen: 2, panel: { open: false, width: null } }));
    shell.conversation!.onToggle();
    expect(api.setPanel!.mock.calls.map(([request]) => request)).toEqual([{ open: true }, { open: true }]);
  });
});

// The guard's wiring (focusGuard.ts holds its rule): armed by where focus is when a run's iframe is created, fed by
// the column's focusout, ended a second after that run shows.
describe("the conversation column's focus guard", () => {
  const conversation = () => shell.conversation!;
  function setUp(focusInColumn: boolean) {
    const field = new FakeElement(), frame = { focus: vi.fn(), contentWindow: {} };
    conversation().column!.current = { contains: (node: unknown) => node === field, querySelector: () => null } as never;
    doc.activeElement = focusInColumn ? field : doc.body;
    show(view({ gen: 2 }));
    shell.frames!.set(2, frame as never);
    return { field, frame };
  }
  const leave = (field: FakeElement, frame: unknown) => {
    conversation().onFocusOut!({ target: field, relatedTarget: null } as never);
    doc.activeElement = frame;
    vi.advanceTimersByTime(0);
  };

  test("a run created while focus was in the column gives focus back when its frame takes it", () => {
    const { field, frame } = setUp(true);
    leave(field, frame);
    expect(field.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  test("a run created while focus was elsewhere is left alone", () => {
    const { field, frame } = setUp(false);
    leave(field, frame);
    expect(field.focus).not.toHaveBeenCalled();
  });

  test("a second after the run is ready and shown, the frame keeps the focus it takes", () => {
    const { field, frame } = setUp(true);
    show(view({ gen: 2, phase: "ready" }));
    vi.advanceTimersByTime(999);
    leave(field, frame);
    expect(field.focus).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    leave(field, frame);
    expect(field.focus).toHaveBeenCalledOnce();
  });

  test("focus moving to another element of the page is not the frame's", () => {
    const { field } = setUp(true);
    conversation().onFocusOut!({ target: field, relatedTarget: new FakeElement() } as never);
    vi.advanceTimersByTime(0);
    expect(field.focus).not.toHaveBeenCalled();
  });
});

