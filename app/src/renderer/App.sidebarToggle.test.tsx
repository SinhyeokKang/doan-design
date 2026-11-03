import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { WorkItem } from "../main/workState";

// shell-panel-layout design §2.4: App hides and shows the sidebar on every screen from the header button and the
// menu, remembers it after the startup read, and names the hidden button by the sidebar's signals. Driven with hooks as
// plain state so App's own wiring runs (App.settings.test.tsx).
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
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T,>(callback: T) => callback,
  };
});
const harness = vi.hoisted(() => ({
  controller: null as null | Record<string, ReturnType<typeof vi.fn>>,
  setState: null as null | ((state: unknown) => void),
  toast: { toast: null, element: null, show: vi.fn(), action: vi.fn(), setModal: vi.fn() },
  signIn: { onToast: null as null | ((toast: { text: string; action: { label: string; target: unknown } | null }) => void), windowFocused: vi.fn() },
}));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
}));
vi.mock("./CanvasController", async original => ({
  ...await original<typeof import("./CanvasController")>(),
  CanvasController: class {
    constructor(_viewport: unknown, _board: unknown, _overlay: unknown, setState: (state: unknown) => void) {
      harness.setState = setState;
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate", "dropPendingLocate"]) self[name] = vi.fn();
      self.openWorkspace = vi.fn((root: string, done: (root: string) => void) => done(root));
      self.showOverview = vi.fn((done: () => void) => done());
      self.destination = vi.fn((root: string) => ({ root }));
      self.currentView = vi.fn(() => ({ scale: 1, x: 0, y: 0 }));
      self.memory = vi.fn(() => ({}));
      harness.controller = self;
    }
  },
}));
vi.mock("./thumbnails", () => ({ useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");

const screen: CanvasRow = { path: ".doan/canvases/checkout.html", id: "checkout", url: "u-checkout" };
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let windowListeners: Record<string, (event: never) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; windowListeners = {};
  harness.toast.show.mockClear(); harness.signIn.windowFocused.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [] });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
}
beforeEach(reset);
afterEach(() => vi.unstubAllGlobals());

function render(): ReactNode {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
    tree = App();
    const pane = all(tree).find(element => "viewport" in (element.props as object))?.props as Record<string, { current: unknown }> | undefined;
    for (const ref of [pane?.viewport, pane?.board, pane?.overlay, pane?.dragLayer]) if (ref && !ref.current) ref.current = {};
    for (const run of hooks.pending) run();
    if (!hooks.dirty) return tree;
  }
  throw new Error("App did not settle");
}
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
const sidebars = () => all(tree).filter(element => element.type === ShellSidebar);
type Bar = { sidebar: { view: { label: string; icon: string; badge: string | null }; controls: string | undefined; toggle(): void } };
const bars = () => all(tree).filter(element => typeof element.type === "function" && element.type.name === "TopBar").map(element => element.props as unknown as Bar);
// The header button itself, as TopBar draws it.
function button(bar = bars()[0]!) {
  const header = all((all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar")!.type as (props: unknown) => ReactNode)(bar));
  return header.find(element => element.type === "button" && String(element.props.className).includes("shell-sidebar-toggle"))!.props;
}
const saved = () => doan.saveUiState!.mock.lastCall?.[0] as { sidebar?: unknown } | undefined;
const menuState = () => doan.setMenuState!.mock.lastCall?.[0] as Record<string, unknown>;
const toggle = () => { bars()[0]!.sidebar.toggle(); render(); };

async function start(restored: unknown = null) {
  render();
  folders([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [screen] }]);
  readUiState(restored); await Promise.resolve(); await Promise.resolve(); render();
}

test("the header button and View > Hide/Show Sidebar hide and show the sidebar on every screen", async () => {
  await start();
  expect(sidebars().length).toBeGreaterThan(0);
  expect(button()).toMatchObject({ "aria-label": "Hide sidebar", "aria-expanded": true, "aria-controls": "doan-page-sidebar" });
  toggle();
  // Unmounted, with its handle: nothing of it stays in the Tab order or keeps a menu open.
  expect(sidebars()).toHaveLength(0);
  for (const bar of bars()) expect(bar.sidebar).toMatchObject({ view: { label: "Show sidebar", icon: "show", badge: null }, controls: undefined });
  expect(button()).toMatchObject({ "aria-label": "Show sidebar", "aria-expanded": false, "aria-controls": undefined });
  expect(menuState()).toMatchObject({ sidebarHidden: true });
  listeners.menu!("toggleSidebar" as never); render();
  expect(sidebars().length).toBeGreaterThan(0);
  expect(menuState()).not.toHaveProperty("sidebarHidden");
  listeners.menu!("toggleSidebar" as never); render();
  expect(sidebars()).toHaveLength(0);
});

test("the hidden state is saved beside the width only after the startup read; a toggle before it wins", async () => {
  render();
  folders([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [screen] }]);
  toggle();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, sidebar: { width: 260 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(saved()?.sidebar).toEqual({ width: 260, hidden: true });
  expect(sidebars()).toHaveLength(0);
  toggle();
  expect(saved()?.sidebar).toEqual({ width: 260 });

  reset();
  await start({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, sidebar: { hidden: true } });
  expect(sidebars()).toHaveLength(0);
  expect(saved()?.sidebar).toEqual({ hidden: true });
});

test("hidden, the button names the sidebar's most urgent signal: a terminal agent's work", async () => {
  await start();
  const work: WorkItem = { session: "s1", provider: "codex", root: "/w/a", path: screen.path };
  listeners.work!([work] as never); render();
  expect(bars()[0]!.sidebar.view.badge).toBeNull();
  toggle();
  expect(bars()[0]!.sidebar.view).toEqual({ label: "Show sidebar, agent working", icon: "show", badge: "working" });
  expect(button()["data-badge"]).toBe("true");
  listeners.work!([] as never); render();
  expect(bars()[0]!.sidebar.view).toEqual({ label: "Show sidebar", icon: "show", badge: null });
  expect(button()["data-badge"]).toBeUndefined();
});

class FakeElement { constructor(readonly inside: boolean) {} closest(selector: string) { return this.inside && selector.includes(".shell-side") ? this : null; } }
function focusScene(active: FakeElement) {
  const shown = { closest: () => null, focus: vi.fn() }, inert = { closest: () => ({}), focus: vi.fn() };
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("document", { activeElement: active, body: {}, querySelector: () => null, querySelectorAll: (selector: string) => selector === ".shell-sidebar-toggle" ? [inert, shown] : [] });
  return { shown, inert };
}

test("hiding with focus in the sidebar or its menu moves focus to the shown Show sidebar button; elsewhere focus stays", async () => {
  await start();
  const inside = focusScene(new FakeElement(true));
  toggle();
  expect(inside.shown.focus).toHaveBeenCalledOnce();
  expect(inside.inert.focus).not.toHaveBeenCalled();
  // Showing it again moves no focus.
  toggle();
  expect(inside.shown.focus).toHaveBeenCalledOnce();
  const outside = focusScene(new FakeElement(false));
  toggle();
  expect(outside.shown.focus).not.toHaveBeenCalled();
});

test("⌘B in the composer toggles the sidebar instead of Bold, once; other keys and fields are left alone", async () => {
  const keydowns: ((event: unknown) => void)[] = [];
  vi.stubGlobal("HTMLElement", FakeElement);
  const stubbed = document as unknown as Record<string, unknown>;
  stubbed.addEventListener = (name: string, listener: (event: unknown) => void) => { if (name === "keydown") keydowns.push(listener); };
  stubbed.removeEventListener = vi.fn();
  await start();
  expect(keydowns).toHaveLength(1);
  const field = Object.assign(new FakeElement(false), { isContentEditable: true, closest: (selector: string) => selector === "[data-chip-field]" ? {} : null });
  const plain = Object.assign(new FakeElement(false), { isContentEditable: false, closest: () => null });
  const key = (target: unknown, patch: Record<string, unknown> = {}) => { const event = { key: "b", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, target, preventDefault: vi.fn(), ...patch }; keydowns[0]!(event); render(); return event; };
  expect(key(field).preventDefault).toHaveBeenCalledOnce();
  expect(sidebars()).toHaveLength(0);
  // A plain input leaves ⌘B to the menu's key equivalent.
  expect(key(plain).preventDefault).not.toHaveBeenCalled();
  expect(sidebars()).toHaveLength(0);
  for (const patch of [{ shiftKey: true }, { isComposing: true }, { metaKey: false }, { key: "i" }]) expect(key(field, patch).preventDefault, JSON.stringify(patch)).not.toHaveBeenCalled();
  expect(sidebars()).toHaveLength(0);
  key(field);
  expect(sidebars().length).toBeGreaterThan(0);
});

// T11 runtime probe: the page panels and the workspace's right column are auto-placed after the sidebar, so with it
// unmounted they fell into the empty first column (0px wide). Hidden, they are placed explicitly.
test("a hidden sidebar places the auto-placed panels in their own columns", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(':root[data-sidebar="hidden"] .home-shell > .home-panel { grid-column: 2; }');
  expect(css).toContain(':root[data-sidebar="hidden"] .workspace > :is(.doan-conv-column, .right-stack) { grid-column: 3; }');
});

// shell-panel-layout design §2.5: main's fullscreen value (its initial read, then each change) marks the root element,
// and the header's traffic-light space collapses under it.
test("fullscreen marks the root element so the header drops the traffic-light space", async () => {
  const attributes = new Map<string, string>();
  const root = { setAttribute: (name: string, value: string) => attributes.set(name, value), removeAttribute: (name: string) => attributes.delete(name), style: { setProperty: vi.fn() } };
  vi.stubGlobal("document", { activeElement: null, body: {}, documentElement: root, querySelector: () => null, querySelectorAll: () => [] });
  await start();
  expect(doan.onFullScreen).toHaveBeenCalledOnce();
  expect(attributes.has("data-fullscreen")).toBe(false);
  listeners.fullScreen!(true as never); render();
  expect(attributes.get("data-fullscreen")).toBe("");
  // Independent of the sidebar's hidden state.
  toggle();
  expect(attributes.get("data-fullscreen")).toBe("");
  listeners.fullScreen!(false as never); render();
  expect(attributes.has("data-fullscreen")).toBe(false);
  expect(attributes.get("data-sidebar")).toBe("hidden");
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(":root[data-fullscreen] .shell-top .traffic-space { width: 0; }");
  // The header sits inside the shell's 8px margin, so its padding would put the first button at x16 (T13 probe).
  expect(css).toContain(":root[data-fullscreen] .shell-top.top { padding-left: 0; }");
});
