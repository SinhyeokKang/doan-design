import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// The size bubble's Add to message on the canvas page: its availability, the chip it puts in the panel's composer, the
// folded panel it unfolds, and where focus goes. Driven with hooks as plain state (App.settings.test.tsx), with the
// harness of App.conversationPanel.test.tsx.
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
// The App clock reads document and native visibility, which these harnesses do not stub.
vi.mock("./visibleClock", () => ({ useVisibleClock: () => Date.now() }));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ state: { auth: undefined }, subscribe: () => () => {}, onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
}));
vi.mock("./CanvasController", async original => ({
  ...await original<typeof import("./CanvasController")>(),
  CanvasController: class {
    constructor(_viewport: unknown, _board: unknown, _overlay: unknown, setState: (state: unknown) => void) {
      harness.setState = setState;
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "onPicked", "onElementTree", "requestElementTree", "previewElement", "selectElement", "pick", "cancelPick", "onCapture", "startCapture", "cancelCapture", "locate", "dropPendingLocate", "settleFit", "bubblePlayButton", "toolbarEscape"]) self[name] = vi.fn();
      self.openWorkspace = vi.fn((root: string, done: (root: string) => void) => done(root));
      self.showOverview = vi.fn((done: () => void) => done());
      self.destination = vi.fn((root: string) => ({ root }));
      self.currentView = vi.fn(() => ({ scale: 1, x: 0, y: 0 }));
      self.memory = vi.fn(() => ({}));
      self.canvasPress = vi.fn(() => () => {});
      harness.controller = self;
    }
  },
}));
vi.mock("./thumbnails", () => ({ useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { ConversationPanel } = await import("./ConversationPanel");
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { initialCanvasState } = await import("./CanvasController");
const { BubbleAdd } = await import("./BubbleAdd");
const { ADD_TO_MESSAGE_CAPTURING, ADD_TO_MESSAGE_OUTSIDE_FRAMES, ADD_TO_MESSAGE_UNAVAILABLE, ANCHOR_LIMIT_TEXT } = await import("./canvasPicker");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
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
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationBoundary: on("boundary"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onPrototypeTarget: on("prototypeTarget"), readPrototypeTarget: vi.fn(async () => null), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: vi.fn(() => () => {}), onFoldersSaveFailed: vi.fn(() => () => {}), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn(), style: { setProperty: vi.fn() } }, addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true });
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
const find = <P,>(type: unknown) => all(tree).filter(element => element.type === type) as unknown as ReactElement<P>[];
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
const clearController = () => { for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear(); };


type Panel = { open: boolean; width: number; onHide(): void; onResize(width: number | undefined): void };
const panel = () => find<Panel>(ConversationPanel)[0]?.props;
const pane = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "CanvasPane")?.props as unknown as ToolsProps;
const flushAll = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); render(); };

type ToolsProps = { picking: boolean; picker: { enabled: boolean; reason: string | null; onToggle(): void; button?: { current: unknown } } };
type Link = { insert: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; composing: ReturnType<typeof vi.fn>; element: ReturnType<typeof vi.fn> };
type ConversationProps = { composerLink: { current: unknown } };
type BubbleProps = { inspectButton: { current: unknown }; host: unknown; enabled: boolean; reason: string | null; button: { current: unknown }; onEscape(event: unknown): void };
type BubbleAddHook = { host(element: unknown): void; onAdd(): void; button(): unknown; onFocusLost(): void };
const rowB: CanvasRow = { path: ".doan/canvases/b.html", id: "b", url: "u-b" };
const LAYOUT = { type: "layout", href: "u-a", height: 100, viewport: 100, frames: [{ id: "cart", x: 0, y: 0, width: 10, height: 10 }], truncated: false };
// A selected element in the frame `cart`, and the anchor a pick of it makes.
const SELECTION = { tag: "button", frame: { id: "cart", title: "Cart" }, frameIndex: 0, element: { doanId: "pay", selector: '[data-doan-id="pay"]', html: "<button>Pay</button>", text: "Pay" }, path: [] };
const ANCHOR = { frame: { id: "cart", title: "Cart" }, element: { doanId: "pay", selector: '[data-doan-id="pay"]', text: "Pay", tag: "button" } };
const NOTE = { tag: "p", element: { selector: "body > p:nth-of-type(1)", html: "<p>Note</p>" }, path: [] };
const element = (name: string) => Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { name, isConnected: true, focus: vi.fn() });
const focusMoved = (target: unknown) => windowListeners.focusin?.({ target } as never);
const hook = () => (harness.controller as unknown as { bubbleAdd: BubbleAddHook }).bubbleAdd;
const bubble = () => find<BubbleProps>(BubbleAdd)[0]?.props;
const HOST = { name: "the bubble's host" };
const rowSummary = (patch: Record<string, unknown> = {}) => ({ conversationId: "c1", canvas: { path: rowA.path, id: "a" }, title: "Payment copy", owner: "doan", provider: "claude",
  fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch });
function canvas(patch: Record<string, unknown> = {}) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, layout: LAYOUT, selection: SELECTION, ...patch });
  render();
}

// The canvas page of /w/a's canvas a with an element in a frame selected, the bubble's host handed over, and the
// panel's composer field registered.
async function bubbleWithComposer(options: { panel?: boolean; composing?: boolean } = {}) {
  vi.stubGlobal("Node", class {});
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: options.panel ?? true } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rowA, rowB] }]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  canvas();
  await flushAll();
  hook().host(HOST); render();
  const field = { name: "field" };
  const link: Link = { insert: vi.fn(() => "inserted"), focus: vi.fn(), composing: vi.fn(() => options.composing ?? false), element: vi.fn(() => field) };
  find<ConversationProps>(CanvasConversation)[0]!.props.composerLink.current = link;
  harness.controller!.pick!.mockReturnValue(true);
  return { link, field };
}

test("Add to message waits for the controller's host, then renders into it with the selection's availability", async () => {
  render();
  expect(find(BubbleAdd)).toHaveLength(0);
  await bubbleWithComposer();
  expect(bubble()).toMatchObject({ host: HOST, enabled: true, reason: null });
});

test("rendering the portal needs no read of the controller's native Play button", async () => {
  await bubbleWithComposer();
  const play = harness.controller!.bubblePlayButton!;
  play.mockClear();
  render();
  expect(play).not.toHaveBeenCalled();
});

test("a press with the panel open puts the selection's chip at the field's caret, focus first, and leaves the selection alone", async () => {
  const { link } = await bubbleWithComposer();
  clearController();
  hook().onAdd(); render();
  expect(link.insert).toHaveBeenCalledExactlyOnceWith(ANCHOR);
  expect(link.focus).toHaveBeenCalledOnce();
  expect(link.focus.mock.invocationCallOrder[0]).toBeLessThan(link.insert.mock.invocationCallOrder[0]!);
  for (const name of ["pick", "cancelPick", "setTool", "cancelCapture"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  // Pressing again adds the same chip again: the draft counts one place for both (PRODUCT §5 item 6).
  hook().onAdd(); render();
  expect(link.insert).toHaveBeenCalledTimes(2);
});

// A folded panel's composer is mounted but inert, so a focus call in the press itself would fail: the chip goes in
// after the commit that unfolds the panel.
test("a press with the panel folded unfolds it, then focuses the field and puts the chip in once it shows", async () => {
  const { link } = await bubbleWithComposer({ panel: false });
  expect(panel()?.open).toBe(false);
  let openAtInsert: boolean | undefined;
  link.insert.mockImplementation(() => { openAtInsert = panel()?.open; return "inserted"; });
  hook().onAdd();
  expect(link.insert).not.toHaveBeenCalled();
  expect(link.focus).not.toHaveBeenCalled();
  render();
  expect(panel()?.open).toBe(true);
  expect(openAtInsert).toBe(true);
  expect(link.insert).toHaveBeenCalledExactlyOnceWith(ANCHOR);
  expect(link.focus.mock.invocationCallOrder[0]).toBeLessThan(link.insert.mock.invocationCallOrder[0]!);
  render();
  expect(link.insert).toHaveBeenCalledOnce();
});

// ARCHITECTURE §3: a pending pick or Add carries a FocusIntent.
test("a waiting chip still goes in after focus moved elsewhere, but focus stays where the person put it", async () => {
  const { link } = await bubbleWithComposer({ panel: false });
  hook().onAdd();
  focusMoved({ name: "a menu" });
  render();
  expect(link.insert).toHaveBeenCalledExactlyOnceWith(ANCHOR);
  expect(link.focus).not.toHaveBeenCalled();
});

test("a waiting chip is dropped when another canvas opens or the composer stops taking input", async () => {
  for (const change of [{ open: { folder: "/w/a", canvas: rowB.path, row: rowB }, shown: rowB.path }, { unlisted: true }]) {
    reset();
    const { link } = await bubbleWithComposer({ panel: false });
    hook().onAdd();
    harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, layout: LAYOUT, selection: SELECTION, ...change });
    render();
    expect(link.insert, JSON.stringify(change)).not.toHaveBeenCalled();
    expect(link.focus, JSON.stringify(change)).not.toHaveBeenCalled();
  }
});

test("a composing field gets the chip, which waits for the composition to end, and no focus call", async () => {
  const { link } = await bubbleWithComposer({ composing: true });
  link.insert.mockReturnValue("pending");
  hook().onAdd(); render();
  expect(link.insert).toHaveBeenCalledExactlyOnceWith(ANCHOR);
  expect(link.focus).not.toHaveBeenCalled();
});

// The press is the host's native click, so Enter, Space and a click on an unavailable button all arrive as onAdd.
test("unavailable, it gives its reason and a press does nothing", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ capturing: true }, ADD_TO_MESSAGE_CAPTURING],
    [{ selection: NOTE }, ADD_TO_MESSAGE_OUTSIDE_FRAMES],
    [{ status: "failed", layout: null }, ADD_TO_MESSAGE_UNAVAILABLE],
    [{ unlisted: true }, "This canvas isn’t listed in a, so its conversation can’t continue."],
  ];
  for (const [patch, reason] of cases) {
    reset();
    const { link } = await bubbleWithComposer();
    canvas(patch);
    expect(bubble(), reason).toMatchObject({ enabled: false, reason });
    hook().onAdd(); render();
    expect(link.insert, reason).not.toHaveBeenCalled();
    expect(link.focus, reason).not.toHaveBeenCalled();
  }
});

test("32 places in the draft give the limit reason", async () => {
  await bubbleWithComposer();
  const run = find<{ run: { store: { setDrafts(change: (drafts: Map<string, unknown>) => Map<string, unknown>): void }; composerKey(): string | null } }>(CanvasConversation)[0]!.props.run;
  const segments = Array.from({ length: 32 }, (_, i) => ({ kind: "chip", anchor: { frame: { id: `f${i}` } } }));
  run.store.setDrafts(drafts => new Map(drafts).set(run.composerKey()!, { segments, preset: null, shape: "capsule", attachments: [] }));
  render();
  expect(bubble()).toMatchObject({ enabled: false, reason: ANCHOR_LIMIT_TEXT });
});

test("the tooltip's Escape goes to the controller's tooltip Escape", async () => {
  await bubbleWithComposer();
  const event = { key: "Escape" };
  bubble()!.onEscape(event);
  expect(harness.controller!.toolbarEscape).toHaveBeenCalledExactlyOnceWith(event);
});

test("the bubble going with focus on Add to message hands it to the toolbar's Picker", async () => {
  await bubbleWithComposer();
  const picker = element("Picker");
  pane().picker.button!.current = picker;
  hook().onFocusLost();
  expect(picker.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
});

test("the controller reads App's Add to message button", async () => {
  await bubbleWithComposer();
  const add = element("Add to message");
  bubble()!.button.current = add;
  expect(hook().button()).toBe(add);
});

// A pick clears the selection, so a bubble button it starts from goes away and the controller hands focus to the
// toolbar (its onFocusLost). A cancel then sends focus to the composer field, never back to the hidden button and
// never the page body, whether the panel was open or folded (a folded panel's field takes no focus until it unfolds).
// Add to message's button stays in the DOM, hidden; Play's is removed.
test.each([["Add to message", "open"], ["Add to message", "folded"], ["Play", "open"], ["Play", "folded"], ["Show inspector", "open"]] as const)(
  "a pick started with ⌘L from the bubble's %s, panel %s, ends in the composer field when cancelled", async (which, shown) => {
    const { link, field } = await bubbleWithComposer({ panel: shown === "open" });
    const NodeClass = class {};
    vi.stubGlobal("Node", NodeClass);
    vi.stubGlobal("HTMLElement", class extends NodeClass {});
    const doc = document as { activeElement: unknown };
    const focusable = (name: string, connected = true) => {
      const node: { name: string; isConnected: boolean; focus: ReturnType<typeof vi.fn> } = Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { name, isConnected: connected, focus: vi.fn(() => { doc.activeElement = node; }) });
      return node;
    };
    // The toolbar sits in the canvas area, where a pick leaves focus.
    const picker = focusable("Picker"), toolbarPlay = focusable("toolbar Play");
    pane().picker.button!.current = picker;
    (pane() as unknown as { player: { button: { current: unknown } } }).player.button.current = toolbarPlay;
    const viewport = (all(tree).find(element => "viewport" in (element.props as object))!.props as { viewport: { current: Record<string, unknown> } }).viewport;
    viewport.current.contains = (node: unknown) => node === picker || node === toolbarPlay;
    viewport.current.focus = vi.fn();
    // A hidden button refuses focus.
    const bubbleButton = { ...focusable(which, which === "Add to message"), focus: vi.fn() };
    Object.setPrototypeOf(bubbleButton, (globalThis.HTMLElement as unknown as { prototype: object }).prototype);
    if (which === "Show inspector") {
      bubble()!.inspectButton.current = bubbleButton;
      const header = focusable("header Show inspector");
      const query = document.querySelector.bind(document);
      Object.assign(document, { querySelector: (selector: string) => selector === '.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]' ? header : query(selector) });
    } else if (which === "Add to message") bubble()!.button.current = bubbleButton;
    else harness.controller!.bubblePlayButton!.mockReturnValue(bubbleButton);
    doc.activeElement = bubbleButton;
    // The field takes focus only once its column is not inert.
    link.focus.mockImplementation(() => { if (panel()?.open) doc.activeElement = field; });
    listeners.menu!("pickFromCanvas" as never); render();
    expect(harness.controller!.pick, `${which} ${shown}`).toHaveBeenCalledOnce();
    // The pick cleared the selection: the bubble went, and if its button still had focus the controller handed it on.
    if (doc.activeElement === bubbleButton) {
      const hooks = harness.controller as unknown as { bubbleAdd: BubbleAddHook; bubblePlay: { onFocusLost(): void }; bubbleInspect: { onFocusLost(): void } };
      (which === "Add to message" ? hooks.bubbleAdd : which === "Play" ? hooks.bubblePlay : hooks.bubbleInspect).onFocusLost();
      focusMoved(doc.activeElement);
    }
    harness.controller!.bubblePlayButton!.mockReturnValue(null);
    harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, layout: LAYOUT, picking: true });
    render();
    (harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void)({ kind: "cancelled" });
    expect((doc.activeElement as { name?: string } | null)?.name, `${which} ${shown}`).toBe(field.name);
    expect(bubbleButton.focus, `${which} ${shown}`).not.toHaveBeenCalled();
  });

// The same conversation's composer, or none: a chip for one the panel no longer shows is dropped.
test("a waiting chip is dropped when the panel's conversation changes on the same canvas", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary(), rowSummary({ conversationId: "c2", title: "Header copy", lastActivityAt: "2026-10-31T00:00:00.000Z" })]);
  const { link } = await bubbleWithComposer({ panel: false });
  const run = find<{ run: { composerKey(): string | null; target(): unknown; request(target: unknown, conversationId: string, scroll: null): void } }>(CanvasConversation)[0]!.props.run;
  const before = run.composerKey();
  expect(before).toBe("conversation:c1");
  hook().onAdd();
  run.request(run.target(), "c2", null);
  render();
  expect(run.composerKey()).not.toBe(before);
  expect(link.insert).not.toHaveBeenCalled();
  expect(link.focus).not.toHaveBeenCalled();
});
