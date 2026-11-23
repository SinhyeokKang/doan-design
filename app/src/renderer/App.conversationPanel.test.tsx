import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// the canvas page's right column is the conversation panel shell, and its
// open state and width are remembered once ui-state was read. Driven with hooks as plain state (App.settings.test.tsx).
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "onPicked", "onElementTree", "requestElementTree", "previewElement", "selectElement", "pick", "cancelPick", "onCapture", "startCapture", "cancelCapture", "locate", "dropPendingLocate", "settleFit", "bubblePlayButton"]) self[name] = vi.fn();
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
// The rows the Overview asks thumbnails for, and the fields given focus.
const probe = vi.hoisted(() => ({ thumbRows: [] as unknown[], focused: [] as unknown[], fields: {} as Record<string, unknown> }));
vi.mock("./thumbnails", () => ({ useThumbnails: (_root: unknown, rows: unknown[]) => { probe.thumbRows = rows; return { thumbnails: new Map(), onVisible: vi.fn() }; } }));
vi.mock("./chipField", async original => ({ ...await original<typeof import("./chipField")>(), focusFieldEnd: (field: unknown) => { if (field) probe.focused.push(field); } }));

const { App, TopBar } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { ConversationPanel, ResizeHandle } = await import("./ConversationPanel");
const { InspectorColumn } = await import("./InspectorPanel");
const { BubbleAdd } = await import("./BubbleAdd");
const { ProjectOverview } = await import("./ProjectOverview");
const { SettingsPage } = await import("./SettingsPage");
const { CAPTURE_LIMIT, CAPTURE_TERMINAL, CAPTURE_UNAVAILABLE } = await import("./canvasCapture");
const { DUPLICATE_CANVAS_TEXT } = await import("./canvasConversation");
const { HomeRun } = await import("./homeRun");
const { Home } = await import("./Home");
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { CanvasConversations } = await import("./RightPanel");
const { initialCanvasState } = await import("./CanvasController");
const { canvasAgent, listForPresence } = await import("./agentIndicator");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA] });
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let windowListeners: Record<string, (event: never) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; windowListeners = {};
  probe.thumbRows = []; probe.focused = []; probe.fields = {};
  harness.toast.show.mockClear(); harness.signIn.windowFocused.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationBoundary: on("boundary"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onPrototypeTarget: on("prototypeTarget"), readPrototypeTarget: vi.fn(async () => null), setPrototypeDrawing: vi.fn(async () => true), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: vi.fn(() => () => {}), onFoldersSaveFailed: vi.fn(() => () => {}), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn(), style: { setProperty: vi.fn() } }, addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null, body: {}, querySelector: (selector: string) => probe.fields[selector] ?? null, querySelectorAll: () => [], hasFocus: () => true });
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
type Pane = { conversation: { open: boolean; show(): void } };
const panel = () => find<Panel>(ConversationPanel)[0]?.props;
const pane = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "CanvasPane")?.props as Pane | undefined;
const saved = () => doan.saveUiState!.mock.lastCall?.[0] as { rightPanel?: unknown } | undefined;

// A workspace on /w/a without an Overview: the canvas page of its open canvas, here under a config error's overlay
// (a problem root's canvas page; PRODUCT §5 item 3 'Problem states').
async function canvasPage(state: unknown = null) {
  render();
  readUiState(state); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render();
  folders([{ path: "/w/a", kind: "error", message: "bad", config: "/w/a/.doan/config.json" }]);
  expect(find(ProjectOverview)).toHaveLength(0);
}

test("the canvas page shows the conversation panel shell", async () => {
  await canvasPage();
  expect(find(ConversationPanel)).toHaveLength(1);
  expect(doan.setMenuState!.mock.lastCall?.[0]).not.toHaveProperty("reviewing");
});

test("the Overview keeps its own right panel", () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(ProjectOverview)).toHaveLength(1);
  expect(find(ConversationPanel)).toHaveLength(0);
});

test("the read panel state is shown and saved with every later save", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  expect(panel()?.open).toBe(false);
  expect(pane()?.conversation.open).toBe(false);
  expect(saved()?.rightPanel).toEqual({ open: false, width: 400 });
});

test("a read without a panel state starts open at the default width", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
  expect(panel()?.open).toBe(true);
  expect(saved()?.rightPanel).toEqual({ open: true });
});

test("closing and reopening keeps the width; resizing saves the new width and a reset goes back to the default", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 } });
  panel()!.onHide(); render();
  expect(panel()?.open).toBe(false);
  expect(pane()?.conversation.open).toBe(false);
  expect(saved()?.rightPanel).toEqual({ open: false, width: 400 });
  pane()!.conversation.show(); render();
  expect(panel()?.open).toBe(true);
  expect(saved()?.rightPanel).toEqual({ open: true, width: 400 });
  panel()!.onResize(450); render();
  expect(saved()?.rightPanel).toEqual({ open: true, width: 450 });
  panel()!.onResize(undefined); render();
  expect(saved()?.rightPanel).toEqual({ open: true });
});

test("a change made before ui-state was read wins over the read value", async () => {
  render();
  folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render();
  panel()!.onHide(); render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 500 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(panel()?.open).toBe(false);
  expect(saved()?.rightPanel).toMatchObject({ open: false });
});

// main replaces the whole ui-state file on each save, so leaving a field out does not keep it. Nothing is
// saved until the initial read settles; the first save after it carries the saved panel and the early changes.
test("no save is sent before the initial ui-state read, even after an early send and navigation", async () => {
  render(); folders([listed("/w/a")]);
  const host = (hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as { host: { sent(request: unknown): void } }).host;
  host.sent({ root: "/w/a", runtime: "codex" }); render();
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(doan.saveUiState).toHaveBeenCalled();
  expect(saved()).toMatchObject({ screen: "workspace", root: "/w/a", home: { lastRoot: "/w/a", lastProvider: "codex" }, rightPanel: { open: false, width: 400 } });
});

// POSTMORTEM 2026-11-01: a Fast switch and a Fast turned off are Home memory like any pick, so neither
// sends a save while the startup read is held; the first save after it carries them.
test("no save is sent before the initial ui-state read after a Fast switch or a Fast turned off", async () => {
  doan.listConversations!.mockImplementation(async () => [{ conversationId: "c1", title: "", owner: "doan", provider: "codex", fromHome: false, phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-06T00:00:00Z", preview: "", working: false }]);
  render(); folders([listed("/w/a")]); await Promise.resolve(); await Promise.resolve(); render();
  const home = () => find<{ onRemember(choice: unknown): void }>(Home)[0]!.props;
  home().onRemember({ provider: "claude", model: null, effort: null, fast: true }); render();
  home().onRemember({ provider: "codex", model: null, effort: null, fast: true }); render();
  listeners.conversation!({ v: 1, conversationId: "c1", seq: 4, turnId: "t1", at: "2026-11-06T00:00:00Z", type: "fast.unused", reason: "plan", turnedOff: true } as never); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {} }); await Promise.resolve(); await Promise.resolve(); render();
  expect(saved()).toMatchObject({ home: { fast: { claude: true } } });
  expect((saved() as { home?: { fast?: unknown } }).home?.fast).toEqual({ claude: true });
});

// Fast changed before the startup read lands only for the provider it
// changed; the read keeps every other provider's Fast, an auto-off seen first still holds, and a later switch on wins.
const summaryOf = (conversationId: string, provider: string) => ({ conversationId, title: "", owner: "doan", provider, fromHome: false, phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-06T00:00:00Z", preview: "", working: false });
const fastOff = (conversationId: string) => listeners.conversation!({ v: 1, conversationId, seq: 4, turnId: "t1", at: "2026-11-06T00:00:00Z", type: "fast.unused", reason: "plan", turnedOff: true } as never);
const savedFast = () => (saved() as { home?: { fast?: unknown } }).home?.fast;
async function fastBeforeRead(steps: (home: { onRemember(choice: unknown): void }) => void, read: unknown) {
  doan.listConversations!.mockImplementation(async () => [summaryOf("c1", "claude")]);
  render(); folders([listed("/w/a")]); await Promise.resolve(); await Promise.resolve(); render();
  steps(find<{ onRemember(choice: unknown): void }>(Home)[0]!.props); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: { fast: read } }); await Promise.resolve(); await Promise.resolve(); render();
}
test("a Fast switch before the startup read keeps the read Fast of the other providers", async () => {
  await fastBeforeRead(home => home.onRemember({ provider: "codex", model: null, effort: null, fast: true }), { claude: true, cursor: true });
  expect(savedFast()).toEqual({ claude: true, cursor: true, codex: true });
});
test("a switch off before the startup read removes only that provider's read Fast", async () => {
  await fastBeforeRead(home => home.onRemember({ provider: "claude", model: null, effort: null, fast: false }), { claude: true, codex: true });
  expect(savedFast()).toEqual({ codex: true });
});
test("an auto-off seen before the startup read holds after it", async () => {
  await fastBeforeRead(() => fastOff("c1"), { claude: true, codex: true });
  expect(savedFast()).toEqual({ codex: true });
});
test("a switch on after an auto-off, both before the startup read, wins", async () => {
  await fastBeforeRead(home => { fastOff("c1"); render(); home.onRemember({ provider: "claude", model: null, effort: null, fast: true }); }, { codex: true });
  expect(savedFast()).toEqual({ codex: true, claude: true });
});

// a live auto-off for a conversation the lists do not name yet waits for its provider.
test("a live auto-off waits until a list names the conversation's provider", async () => {
  render(); folders([listed("/w/a")]); await Promise.resolve(); await Promise.resolve(); render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: { fast: { claude: true, codex: true } } }); await Promise.resolve(); await Promise.resolve(); render();
  fastOff("c1"); render();
  expect(savedFast()).toEqual({ claude: true, codex: true });
  doan.listConversations!.mockImplementation(async () => [summaryOf("c1", "claude")]);
  listeners.conversationList!({ root: "/w/a" } as never); await Promise.resolve(); await Promise.resolve(); render();
  expect(savedFast()).toEqual({ codex: true });
});
test("a switch on made after the auto-off was seen wins over the late provider", async () => {
  render(); folders([listed("/w/a")]); await Promise.resolve(); await Promise.resolve(); render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: { fast: { codex: true } } }); await Promise.resolve(); await Promise.resolve(); render();
  fastOff("c1"); render();
  find<{ onRemember(choice: unknown): void }>(Home)[0]!.props.onRemember({ provider: "claude", model: null, effort: null, fast: true }); render();
  doan.listConversations!.mockImplementation(async () => [summaryOf("c1", "claude")]);
  listeners.conversationList!({ root: "/w/a" } as never); await Promise.resolve(); await Promise.resolve(); render();
  expect(savedFast()).toEqual({ codex: true, claude: true });
});

test("a read that fails still lets saves through, with the panel's own state", async () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState(null); await Promise.resolve(); await Promise.resolve(); render();
  expect(saved()).toMatchObject({ screen: "workspace", root: "/w/a", rightPanel: { open: true } });
});

// the Overview's canvas conversations panel has its own handle and its own remembered
// width; changing one panel's width leaves the other's alone.
type Handle = { label?: string; onResize(width: number | undefined): void };
const overviewHandle = () => find<Handle>(ResizeHandle).find(element => element.props.label === "Resize conversations")?.props;
const savedPanels = () => doan.saveUiState!.mock.lastCall?.[0] as { rightPanel?: unknown; overviewPanel?: unknown } | undefined;
const toOverview = () => { find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render(); };

test("the Overview's panel has its own handle, and its width and the canvas panel's are saved apart", async () => {
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]); toOverview();
  expect(find(ProjectOverview)).toHaveLength(1);
  overviewHandle()!.onResize(420); render();
  expect(savedPanels()).toMatchObject({ rightPanel: { open: true, width: 400 }, overviewPanel: { width: 420 } });
  // A double click goes back to the default and stores nothing.
  overviewHandle()!.onResize(undefined); render();
  expect(savedPanels()).not.toHaveProperty("overviewPanel");
  expect(savedPanels()?.rightPanel).toEqual({ open: true, width: 400 });
  // The canvas page's panel resizes on its own.
  reset();
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 }, overviewPanel: { width: 500 } });
  expect(overviewHandle()).toBeUndefined();
  panel()!.onResize(450); render();
  expect(savedPanels()).toMatchObject({ rightPanel: { open: true, width: 450 }, overviewPanel: { width: 500 } });
});

test("the read Overview width is kept; one changed before the read wins, and nothing is saved before it", async () => {
  render(); folders([listed("/w/a")]); toOverview();
  overviewHandle()!.onResize(360); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, overviewPanel: { width: 600 }, rightPanel: { open: true, width: 400 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(savedPanels()).toMatchObject({ overviewPanel: { width: 360 }, rightPanel: { open: true, width: 400 } });

  reset(); render(); folders([listed("/w/a")]); toOverview();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, overviewPanel: { width: 600 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(savedPanels()?.overviewPanel).toEqual({ width: 600 });
});

// the last canvas tool is saved with the rest of ui-state, only
// after the startup read, and the read's tool goes to the controller, which keeps a tool the person chose before it.
const publishTool = (tool: "select" | "hand") => { harness.setState!({ ...initialCanvasState(), tool }); render(); };
const savedTool = () => doan.saveUiState!.mock.lastCall?.[0] as { canvasTool?: unknown; rightPanel?: unknown } | undefined;

test("a saved Hand starts the controller in Hand", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, canvasTool: "hand" });
  expect(harness.controller!.restoreTool).toHaveBeenCalledExactlyOnceWith("hand");
});

test("a read without a saved tool leaves the controller's tool alone", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
  expect(harness.controller!.restoreTool).not.toHaveBeenCalled();
  expect(savedTool()).not.toHaveProperty("canvasTool");
});

test("no save is sent before the read, even after a tool change; the first save carries the chosen tool", async () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  publishTool("hand");
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(savedTool()).toMatchObject({ canvasTool: "hand", rightPanel: { open: false, width: 400 } });
});

test("a tool chosen before the read keeps its value in the saves after it", async () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  publishTool("hand");
  publishTool("select");
  // The controller kept the person's Select; the read's Hand reaches it but does not reach the save.
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, canvasTool: "hand" }); await Promise.resolve(); await Promise.resolve(); render();
  expect(harness.controller!.restoreTool).toHaveBeenCalledWith("hand");
  expect(doan.saveUiState).toHaveBeenCalled();
  expect(savedTool()).not.toHaveProperty("canvasTool");
});

test("switching to Hand or Select saves the merged state; Select saves no field", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  publishTool("hand");
  expect(savedTool()).toMatchObject({ canvasTool: "hand", rightPanel: { open: false, width: 400 } });
  publishTool("select");
  expect(savedTool()).not.toHaveProperty("canvasTool");
  expect(savedTool()?.rightPanel).toEqual({ open: false, width: 400 });
});

test("tells the controller whether the canvas page is the one shown", async () => {
  await canvasPage();
  // Under a problem's overlay the canvas page takes no tool keys (ARCHITECTURE §7 'Problem overlay').
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(false);
  folders([listed("/w/a")]);
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(true);
  harness.setState!(initialCanvasState()); render();
  expect(find(ProjectOverview)).toHaveLength(1);
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(false);
});

// the agent notice's Open unfolds the panel and moves focus into it; a Stop
// failure is the shared toast; a page without a listed canvas gives the indicator no canvas.
type Agent = { canvas: unknown; running: boolean; list: unknown; shown: string | null; onOpen(conversationId: string): void };
const agent = () => (pane() as unknown as { agent: Agent } | undefined)?.agent;
function focusable() {
  const focus = vi.fn();
  const querySelector = vi.fn((selector: string) => selector === ".doan-conv-panel :is(.rp-head, .doan-conv-title .ov-title)" ? { focus } : null);
  vi.stubGlobal("document", { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn(), style: { setProperty: vi.fn() } }, addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null, body: {}, querySelector, querySelectorAll: () => [], hasFocus: () => true });
  return { focus, querySelector };
}

test("Open unfolds a folded panel and moves focus to the panel, not to its close button", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  const { focus, querySelector } = focusable();
  agent()!.onOpen("c9"); render();
  expect(panel()?.open).toBe(true);
  expect(saved()?.rightPanel).toEqual({ open: true, width: 400 });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(querySelector).not.toHaveBeenCalledWith(".doan-conv-panel .doan-panel-hide");
});

test("Open with the panel already open only moves focus to the panel", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 } });
  const { focus } = focusable();
  const before = doan.saveUiState!.mock.calls.length;
  agent()!.onOpen("c9"); render();
  expect(panel()?.open).toBe(true);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(doan.saveUiState!.mock.calls.length).toBe(before);
});

// The board has no Stop (user decision), so the indicator is handed no Stop failure callback.
test("the board indicator is handed no Stop failure callback", async () => {
  await canvasPage();
  expect(agent()).not.toHaveProperty("onStopFailed");
});

test("a project problem gives the indicator no canvas; the canvas page runs it, the Overview does not", async () => {
  await canvasPage();
  expect(agent()?.canvas).toBeNull();
  expect(agent()?.running).toBe(true);
  harness.setState!(initialCanvasState()); render();
  expect(find(ProjectOverview)).toHaveLength(1);
  expect(agent()?.running).toBe(false);
});

// the canvas page's panel holds the open canvas's conversation; entries unfold it.
const rowSummary = (patch: Record<string, unknown> = {}) => ({ conversationId: "c1", canvas: { path: rowA.path, id: "a" }, title: "Payment copy", owner: "doan", provider: "claude",
  fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch });
type Conversation = { target: { root: string; canvas: { path: string; id?: string } }; arrival: { focus: string; seq: number } | null; blocked: string | null };
const conversation = () => find<Conversation>(CanvasConversation)[0]?.props;
const menuState = () => doan.setMenuState!.mock.lastCall?.[0] as Record<string, unknown>;
const flushAll = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); render(); };
// The Overview of /w/a, then its canvas a open on the canvas page.
async function openCanvas(state: unknown = { screen: "home", expanded: {}, lastByRoot: {}, home: {} }, patch: Record<string, unknown> = {}) {
  render();
  readUiState(state); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "",
    layout: { frames: [], width: 800 }, ...patch });
  render();
  await flushAll();
}

test("the canvas page's panel holds the open canvas's conversation", async () => {
  await openCanvas();
  expect(find(ProjectOverview)).toHaveLength(0);
  expect(conversation()?.target).toEqual({ root: "/w/a", canvas: { path: rowA.path, id: "a" } });
  expect(conversation()?.blocked).toBeNull();
  expect(doan.conversationResumeTarget).toHaveBeenCalledWith({ root: "/w/a", canvas: { path: rowA.path, id: "a" } });
});

test("a header switch and Back/Forward open the matching path and its conversation in each root", async () => {
  await openCanvas();
  const second = { ...rowA, id: "b", url: "u-b" };
  const rows = [rowA, second].map((canvas, i): FolderEntry => ({ kind: "list", path: i ? "/w/b" : "/w/a", servedRev: 0,
    canvases: [canvas], git: { common: "/w/a/.git", branch: i ? "topic" : "main", worktrees: [] } }));
  folders(rows);
  const controller = harness.controller!;
  controller.openCanvas!.mockImplementation((root: string, row: CanvasRow, _target, options: { opened(): void }) => {
    controller.destination!.mockReturnValue({ root, canvas: row.path });
    harness.setState!({ ...initialCanvasState(), open: { folder: root, canvas: row.path, row }, shown: row.path, status: null });
    options.opened();
  });
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA);
  render();
  const nav = () => (pane() as Pane & { navigation: { worktree(root: string, path: string): void } }).navigation;
  nav().worktree("/w/b", rowA.path); render();
  expect(controller.openCanvas!.mock.lastCall).toMatchObject(["/w/b", second, undefined, { keepView: true }]);
  expect(conversation()?.target).toEqual({ root: "/w/b", canvas: { path: rowA.path, id: "b" } });
  find<{ previous(): void }>(TopBar)[0]!.props.previous(); render();
  expect(conversation()?.target.root).toBe("/w/a");
  find<{ next(): void }>(TopBar)[0]!.props.next(); render();
  expect(conversation()?.target.root).toBe("/w/b");
  const pick = nav().worktree;
  folders([rows[1]!, { ...listed("/w/a"), kind: "list", servedRev: 1, canvases: [] }]);
  controller.openCanvas!.mockClear();
  pick("/w/a", rowA.path); render();
  expect(controller.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledWith(expect.stringContaining("a is no longer"));
  expect(conversation()?.target.root).toBe("/w/b");
  expect(nav()).not.toHaveProperty("overview");
});

test("a canvas page showing a page outside the list keeps the draft in a composer that takes no input", async () => {
  await openCanvas(undefined, { unlisted: true });
  expect(conversation()?.blocked).toBe("This canvas isn’t listed in a, so its conversation can’t continue.");
});

test("⌘N on the canvas page unfolds a folded panel in the new conversation state, focus for the composer", async () => {
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  expect(panel()?.open).toBe(false);
  listeners.menu!("newConversation" as never); render();
  expect(panel()?.open).toBe(true);
  expect(conversation()?.arrival).toMatchObject({ focus: "composer" });
});

// Pick from Canvas (⌘L) follows the picker alone; a selection is not a menu input.
test("Pick from Canvas's menu flag follows the canvas page and the picker, not the selection", async () => {
  await openCanvas(undefined, { selection: { frame: { id: "f" } } });
  expect(menuState()).toMatchObject({ screen: "canvas", pickerAvailable: true });
  expect(menuState()).not.toHaveProperty("selection");
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 }, selection: null });
  render();
  expect(menuState()).toMatchObject({ screen: "canvas", pickerAvailable: true });
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: "failed", message: "", selection: null });
  render();
  expect(menuState()).not.toHaveProperty("pickerAvailable");
});

test("an Overview row opens its canvas with that conversation and unfolds the panel, focus for the composer", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary()]);
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  await flushAll();
  const row = { kind: "canvas", key: "c1", conversationId: "c1", row: rowA };
  find<{ open(item: unknown): void }>(CanvasConversations)[0]!.props.open(row); render();
  const [root, opened, , options] = harness.controller!.openCanvas!.mock.lastCall as [string, CanvasRow, unknown, { opened(): void }];
  expect([root, opened.path]).toEqual(["/w/a", rowA.path]);
  // The controller publishes the open canvas, then reports it opened.
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render();
  expect(panel()?.open).toBe(false);
  options.opened(); render();
  expect(panel()?.open).toBe(true);
  expect(conversation()?.arrival).toMatchObject({ focus: "composer" });
});

const badge = () => (pane() as unknown as { conversation: { badge: unknown } }).conversation.badge;
const shownId = () => { const view = (conversation() as unknown as { run: { view(): { kind: string; conversationId?: string } | null } }).run.view(); return view?.kind === "conversation" ? view.conversationId : null; };
const selectShown = (id: string | null) => { (conversation() as unknown as { run: { select(id: string | null): void } }).run.select(id); render(); };
const FOLDED = { screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } };

test("a folded panel's open button carries the news dot while a conversation of the canvas waits", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ phase: "waiting", working: true })]);
  await openCanvas(FOLDED);
  expect(badge()).toEqual({ kind: "permission", label: "Show conversation, needs your answer", conversationId: "c1" });
  pane()!.conversation.show(); render();
  expect(badge()).toBeNull();
});

// The badge: the strongest signal across every conversation of the canvas, working included.
test("the badge shows the strongest signal across the canvas's conversations: working over another's unseen ending", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", unseen: true, lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2", phase: "running", working: true })]);
  await openCanvas(FOLDED);
  expect(badge()).toEqual({ kind: "working", label: "Show conversation, agent is working", conversationId: "c2" });
});

test("unfolding from the badged button shows the conversation the badge stands for, focus on its request", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2", phase: "waiting", working: true })]);
  await openCanvas(FOLDED);
  selectShown("c1");
  expect(shownId()).toBe("c1");
  expect(badge()).toMatchObject({ kind: "permission", conversationId: "c2" });
  pane()!.conversation.show(); await flushAll();
  expect(panel()?.open).toBe(true);
  expect(shownId()).toBe("c2");
  expect(conversation()?.arrival).toMatchObject({ focus: "permission" });
});

test("unfolding without a badge keeps what the panel showed", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2" })]);
  await openCanvas(FOLDED);
  selectShown("c2");
  expect(badge()).toBeNull();
  pane()!.conversation.show(); await flushAll();
  expect(shownId()).toBe("c2");
});

// The board follows what the panel shows, or would show once unfolded.
test("the board's indicator gets the conversation the panel shows, also while it is folded", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2" })]);
  await openCanvas(FOLDED);
  expect(agent()?.shown).toBe("c1");
  selectShown("c2");
  expect(agent()?.shown).toBe("c2");
  selectShown(null);
  expect(agent()?.shown).toBeNull();
});

// While the panel is folded the board follows the conversation the panel picked, not the badge's: the notice stays on
// one conversation whichever way the panel is unfolded later.
test("folded, the board follows the picked working conversation while the badge names another waiting one", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", phase: "running", working: true, lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2", phase: "waiting", working: true })]);
  await openCanvas(FOLDED);
  selectShown("c1");
  expect(panel()?.open).toBe(false);
  expect(badge()).toMatchObject({ kind: "permission", conversationId: "c2" });
  const props = agent() as unknown as { list: Parameters<typeof listForPresence>[0]; canvas: Parameters<typeof canvasAgent>[1]; shown: string | null };
  expect(props.shown).toBe("c1");
  expect(canvasAgent(listForPresence(props.list), props.canvas, null, [], [], props.shown)?.presence).toMatchObject({ conversationId: "c1", kind: "working" });
});

test("the capsule's Open shows the followed waiting conversation, unfolds the panel and sends focus to its first choice", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2", phase: "waiting", working: true })]);
  await openCanvas(FOLDED);
  selectShown("c1");
  agent()!.onOpen("c2"); await flushAll();
  expect(panel()?.open).toBe(true);
  expect(shownId()).toBe("c2");
  expect(conversation()?.arrival).toMatchObject({ focus: "permission" });
});

// The conversation last seen on a canvas on this device: ui-state's conversationByCanvas.
test("the panel opens on the conversation last seen on the canvas, and what is seen there is saved", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2" })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, conversationByCanvas: { "/w/a": { a: "c2", other: "c9" } } });
  expect(shownId()).toBe("c2");
  selectShown("c1");
  // `other` names a canvas and a conversation the read lists do not have: the save drops it.
  expect((saved() as { conversationByCanvas?: unknown }).conversationByCanvas).toEqual({ "/w/a": { a: "c1" } });
});

// POSTMORTEM 2026-11-01: a conversation seen before the startup ui-state read sends no save; the first save after the
// read carries the read memory with the newly seen conversation laid over it, per canvas.
test("a conversation seen before the ui-state read sends no save, and the first save merges it into the read memory", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2" })]);
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render(); await flushAll();
  // Before the read nothing is picked; a request (a notification's Open) shows c2, and the open, focused panel sees it.
  (conversation() as unknown as { run: { request(target: unknown, id: string, scroll: null): void } }).run.request({ root: "/w/a", canvas: { path: rowA.path, id: "a" } }, "c2", null);
  await flushAll();
  expect(panel()?.open).toBe(true);
  expect(shownId()).toBe("c2");
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, conversationByCanvas: { "/w/a": { a: "c1", other: "c9" }, "/w/b": { x: "c8" } } });
  await Promise.resolve(); await Promise.resolve(); render();
  expect(doan.saveUiState).toHaveBeenCalled();
  expect((doan.saveUiState!.mock.calls[0]![0] as { conversationByCanvas?: unknown }).conversationByCanvas).toEqual({ "/w/a": { a: "c2" }, "/w/b": { x: "c8" } });
});

test("a canvas whose ID another canvas shares neither reads nor writes the memory", async () => {
  const twin: CanvasRow = { path: ".doan/canvases/a-copy.html", id: "a", url: "u-a2" };
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2" })]);
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, conversationByCanvas: { "/w/a": { a: "c2" } } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rowA, twin] }]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render(); await flushAll();
  expect(shownId()).toBe("c1");
  selectShown("c2"); selectShown("c1");
  expect((saved() as { conversationByCanvas?: unknown }).conversationByCanvas).toEqual({ "/w/a": { a: "c2" } });
});

test("a sidebar canvas row unfolds the panel only when its slot needs an answer or has an unseen ending", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ fromHome: true, unseen: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA); render();
  expect(panel()?.open).toBe(true);
  expect(conversation()?.arrival).toMatchObject({ focus: "composer" });
});

// the row shows the terminal spinner over the app's unseen ending (withTerminalSlots), so its click decides with
// that working slot and keeps the panel as it was.
// A sidebar row whose slot unfolds the panel names its conversation; otherwise the shared rule picks.
test("a sidebar canvas row with an unseen ending shows that conversation, not the most recent one", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ conversationId: "c1", fromHome: true, lastActivityAt: "2026-11-01T00:02:00.000Z" }), rowSummary({ conversationId: "c2", fromHome: true, unseen: true })]);
  await openCanvas(FOLDED);
  expect(shownId()).toBe("c1");
  // With two conversations the sidebar lists them under the row and the row itself carries no signal; folded, the row
  // shows the strongest one again and its press follows it.
  find<{ conversations: { fold(folded: boolean): void } }>(ShellSidebar)[0]!.props.conversations.fold(true); render();
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA); await flushAll();
  expect(panel()?.open).toBe(true);
  expect(shownId()).toBe("c2");
});

test("a sidebar canvas row whose terminal spinner covers an unseen ending keeps a folded panel folded", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ fromHome: true, unseen: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  listeners.work!([{ session: "s1", provider: "codex", root: "/w/a", path: rowA.path }] as never); render();
  const sidebar = find<{ open(root: string, row: CanvasRow): void; slots?: ReadonlyMap<string, { kind: string; source?: string }> }>(ShellSidebar)[0]!.props;
  expect(sidebar.slots?.get(`/w/a\n${rowA.path}`)).toMatchObject({ kind: "working", source: "terminal" });
  sidebar.open("/w/a", rowA); render();
  expect(panel()?.open).toBe(false);
  expect(conversation()?.arrival).toBeNull();
});

test("a sidebar canvas row without a mark keeps a folded panel folded", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ fromHome: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA); render();
  expect(panel()?.open).toBe(false);
  expect(conversation()?.arrival).toBeNull();
});

// each entry is a new arrival, also after the panel consumed the previous one.
test("a second entry after the first was consumed is a new arrival the panel applies", async () => {
  await openCanvas();
  listeners.menu!("newConversation" as never); render();
  const first = conversation()!.arrival!;
  (find<{ onArrived(seq: number): void }>(CanvasConversation)[0]!.props.onArrived)(first.seq); render();
  expect(conversation()?.arrival).toBeNull();
  listeners.menu!("newConversation" as never); render();
  const second = conversation()!.arrival!;
  expect(second.focus).toBe("composer");
  expect(second.seq).toBeGreaterThan(first.seq);
});

// POSTMORTEM 2026-10-23 R-L: the picker's waiting
// focus moves carry the intent they started with; focus that went elsewhere meanwhile is never pulled back, and a
// composing field gets its chip later but no focus or caret call.
type Link = { insert: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; composing: ReturnType<typeof vi.fn>; element: ReturnType<typeof vi.fn> };
type ConversationProps = { pick: { pressed: boolean; enabled: boolean; onToggle(): void }; composerLink: { current: unknown } };
const ANCHOR = { frame: { id: "cart" } };
async function canvasWithComposer(options: { panel?: boolean; composing?: boolean } = {}) {
  vi.stubGlobal("Node", class {});
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: options.panel ?? true } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null,
    layout: { type: "layout", href: "u-a", height: 100, viewport: 100, frames: [{ id: "cart", x: 0, y: 0, width: 10, height: 10 }], truncated: false },
    selection: { tag: "section", frame: { id: "cart" }, path: [] } });
  render();
  const field = { name: "field" };
  const link: Link = { insert: vi.fn(() => "inserted"), focus: vi.fn(), composing: vi.fn(() => options.composing ?? false), element: vi.fn(() => field) };
  const conversation = find<ConversationProps>(CanvasConversation)[0]!.props;
  conversation.composerLink.current = link;
  harness.controller!.pick!.mockReturnValue(true);
  return { link, field, conversation };
}
const focusMoved = (target: unknown) => windowListeners.focusin?.({ target } as never);

test("a pick ends with focus back in the composer while focus stayed with the picker or the canvas", async () => {
  const { link, conversation } = await canvasWithComposer();
  conversation.pick.onToggle();
  harness.setState!({ ...initialCanvasState(), tool: "pick" });
  focusMoved(undefined);
  const ended = harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void;
  ended({ kind: "picked", anchor: ANCHOR, frames: [] });
  expect(link.focus).toHaveBeenCalledOnce();
  expect(link.insert).toHaveBeenCalledWith(ANCHOR);
  expect(link.focus.mock.invocationCallOrder[0]).toBeLessThan(link.insert.mock.invocationCallOrder[0]!);
});

// A chip a pick inserts always lands focus in the field, even after focus went elsewhere meanwhile, such as
// into the Presets popover the canvas click then closed; only the cancels keep focus the person moved.
test("a pick that inserts a chip takes focus to the field even after focus went elsewhere; a cancel then leaves focus alone", async () => {
  const { link, conversation } = await canvasWithComposer();
  conversation.pick.onToggle();
  const ended = harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void;
  focusMoved({ name: "the Presets popover's search box" });
  focusMoved(null);
  ended({ kind: "picked", anchor: ANCHOR, frames: [] });
  expect(link.insert).toHaveBeenCalledWith(ANCHOR);
  expect(link.focus).toHaveBeenCalledOnce();
  expect(link.focus.mock.invocationCallOrder[0]).toBeLessThan(link.insert.mock.invocationCallOrder[0]!);
  link.focus.mockClear();
  conversation.pick.onToggle();
  focusMoved({ name: "a menu" });
  (harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void)({ kind: "cancelled" });
  expect(link.focus).not.toHaveBeenCalled();
});

test("a pick that ends while the field composes keeps the chip waiting and makes no focus call", async () => {
  const { link, conversation } = await canvasWithComposer({ composing: true });
  link.insert.mockReturnValue("pending");
  conversation.pick.onToggle();
  (harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void)({ kind: "picked", anchor: ANCHOR, frames: [] });
  expect(link.insert).toHaveBeenCalledWith(ANCHOR);
  expect(link.focus).not.toHaveBeenCalled();
});

// the toolbar's Picker and ⌘L run the composer's own pick.
type ToolsProps = { picking: boolean; picker: { enabled: boolean; reason: string | null; onToggle(): void }; onTool(tool: string): void };
const toolbar = () => pane() as unknown as ToolsProps;
const ended = () => harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void;
const element = (name: string) => Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { name, isConnected: true, focus: vi.fn() });
function picking(on: boolean) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null,
    layout: { type: "layout", href: "u-a", height: 100, viewport: 100, frames: [{ id: "cart", x: 0, y: 0, width: 10, height: 10 }], truncated: false }, picking: on });
  render();
}

test("the toolbar's Picker and the composer's Pick share one pick: either starts it, and either cancels it", async () => {
  const { conversation } = await canvasWithComposer();
  expect(toolbar().picker).toMatchObject({ enabled: true, reason: null });
  toolbar().picker.onToggle();
  expect(harness.controller!.pick).toHaveBeenCalledOnce();
  picking(true);
  expect(toolbar().picking).toBe(true);
  expect(find<ConversationProps>(CanvasConversation)[0]!.props.pick.pressed).toBe(true);
  conversation.pick.onToggle();
  expect(harness.controller!.cancelPick).toHaveBeenCalled();
  harness.controller!.cancelPick!.mockClear();
  find<ConversationProps>(CanvasConversation)[0]!.props.pick.onToggle();
  expect(harness.controller!.cancelPick).toHaveBeenCalledOnce();
});

test("⌘L starts a pick, and cancels it while picking", async () => {
  await canvasWithComposer();
  listeners.menu!("pickFromCanvas" as never); render();
  expect(harness.controller!.pick).toHaveBeenCalledOnce();
  picking(true);
  harness.controller!.cancelPick!.mockClear();
  listeners.menu!("pickFromCanvas" as never); render();
  expect(harness.controller!.cancelPick).toHaveBeenCalledOnce();
  expect(harness.controller!.pick).toHaveBeenCalledOnce();
});

test("an unavailable Picker gives the composer's reason and starts nothing", async () => {
  await openCanvas(undefined, { unlisted: true });
  expect(toolbar().picker.enabled).toBe(false);
  expect(toolbar().picker.reason).toBe(find<ConversationProps & { pick: { reason: string | null } }>(CanvasConversation)[0]!.props.pick.reason);
  toolbar().picker.onToggle();
  listeners.menu!("pickFromCanvas" as never); render();
  expect(harness.controller!.pick).not.toHaveBeenCalled();
});

test("the Picker and ⌘L unfold a folded panel and start the pick, which the unfolding does not cancel", async () => {
  for (const start of [() => toolbar().picker.onToggle(), () => listeners.menu!("pickFromCanvas" as never)]) {
    reset();
    await canvasWithComposer({ panel: false });
    expect(panel()?.open).toBe(false);
    clearController();
    harness.controller!.pick!.mockReturnValue(true);
    start(); render();
    expect(panel()?.open).toBe(true);
    expect(harness.controller!.pick).toHaveBeenCalledOnce();
    picking(true); render();
    expect(harness.controller!.cancelPick).not.toHaveBeenCalled();
  }
});

test("a pick cancelled by pressing the Picker again leaves focus on the Picker", async () => {
  const { link } = await canvasWithComposer();
  const picker = element("Picker");
  (document as { activeElement: unknown }).activeElement = picker;
  toolbar().picker.onToggle();
  picking(true);
  toolbar().picker.onToggle();
  ended()({ kind: "cancelled" });
  expect(link.focus).not.toHaveBeenCalled();
  expect(picker.focus).not.toHaveBeenCalled();
});

test("a pick cancelled by Esc returns focus to where it was before the pick, never the page", async () => {
  const { link } = await canvasWithComposer();
  const before = element("the frame drawer");
  (document as { activeElement: unknown }).activeElement = before;
  listeners.menu!("pickFromCanvas" as never); render();
  picking(true);
  ended()({ kind: "cancelled" });
  expect(before.focus).toHaveBeenCalledOnce();
  expect(link.focus).not.toHaveBeenCalled();
  // From the page itself there is nowhere to go back to, so the composer takes focus.
  reset();
  const second = await canvasWithComposer();
  (document as { activeElement: unknown }).activeElement = document.body;
  listeners.menu!("pickFromCanvas" as never); render();
  picking(true);
  ended()({ kind: "cancelled" });
  expect(second.link.focus).toHaveBeenCalledOnce();
});

// going back to where focus was is for focus the pick left behind (the page, the canvas, the element
// before it), never for focus the person moved meanwhile, such as into the field they type in.
test("Esc pressed in the field after a pick started from the toolbar's Picker keeps focus in the field", async () => {
  const { link, field } = await canvasWithComposer();
  const picker = element("Picker");
  (document as { activeElement: unknown }).activeElement = picker;
  toolbar().picker.onToggle();
  picking(true);
  focusMoved(field);
  (document as { activeElement: unknown }).activeElement = field;
  ended()({ kind: "cancelled" });
  expect(picker.focus).not.toHaveBeenCalled();
  expect(link.focus).not.toHaveBeenCalled();
});

test("the toolbar's Select or Hand while picking switches the tool through the controller and leaves focus on the tool", async () => {
  const { link } = await canvasWithComposer();
  const picker = element("Picker");
  (document as { activeElement: unknown }).activeElement = picker;
  toolbar().picker.onToggle();
  picking(true);
  toolbar().onTool("hand");
  expect(harness.controller!.setTool).toHaveBeenCalledWith("hand");
  ended()({ kind: "cancelled" });
  expect(link.focus).not.toHaveBeenCalled();
  expect(picker.focus).not.toHaveBeenCalled();
});
// The canvas's press reaches the panel's composer, whose preset lists close on it: the panel gets the controller's
// subscription, the same function on every render so the lists do not subscribe again each time.
test("the canvas page hands the controller's press subscription to the panel's composer", async () => {
  await openCanvas();
  const press = (conversation() as unknown as { canvasPress?: unknown }).canvasPress;
  expect(press).toBe(harness.controller!.canvasPress);
  render();
  expect((conversation() as unknown as { canvasPress?: unknown }).canvasPress).toBe(press);
});

// Capture area's availability, its chip in the panel's composer, and when
// the panel unfolds. The controller hands each captured area to App's listener; the listener's snapshot calls main.
type CaptureProps = { capturing: boolean; capture: { enabled: boolean; reason: string | null; onToggle(): void } };
type Store = { drafts: ReadonlyMap<string, { attachments: readonly { key: string; name: string; pasted: boolean; status: string; id?: string }[] }>; setDrafts(change: (drafts: Map<string, unknown>) => Map<string, unknown>): void };
type Run = { store: Store; composerKey(): string | null; choose(choice: string): void };
const captureTool = () => (pane() as unknown as CaptureProps).capture;
const panelRun = () => (find<{ run: Run }>(CanvasConversation)[0]!.props.run);
const composerChips = () => panelRun().store.drafts.get(panelRun().composerKey()!)?.attachments ?? [];
const fileChip = (i: number) => ({ key: `f${i}`, name: `f${i}.txt`, kind: "file", pasted: false, status: "ready" });
function attachFiles(count: number) {
  const key = panelRun().composerKey()!;
  panelRun().store.setDrafts(drafts => new Map(drafts).set(key, { segments: [], preset: null, shape: "capsule", attachments: Array.from({ length: count }, (_, i) => fileChip(i)) }));
  render();
}
const RECT = { x: 260, y: 140, width: 300, height: 196 };
type Listener = (rect: typeof RECT) => (() => Promise<unknown>) | null;
const captureListener = () => harness.controller!.onCapture!.mock.calls[0]![0] as Listener;
const captured = (patch: Record<string, unknown> = {}) => ({ ok: true, attachment: { id: "cap1", name: "canvas-capture-2026-11-05T12-00-00-000Z.png", kind: "image", pasted: true, size: 2048, path: "/u/attachments/cap1/canvas-capture.png", thumbnail: new Uint8Array([1, 2]), ...patch } });
function capturing(on: boolean) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null,
    layout: { type: "layout", href: "u-a", height: 100, viewport: 100, frames: [{ id: "cart", x: 0, y: 0, width: 10, height: 10 }], truncated: false }, capturing: on });
  render();
}

test("Capture area starts capture mode on a loaded canvas whose composer takes files, and its second press ends it", async () => {
  await canvasWithComposer();
  expect(captureTool()).toMatchObject({ enabled: true, reason: null });
  captureTool().onToggle();
  expect(harness.controller!.startCapture).toHaveBeenCalledOnce();
  capturing(true);
  expect((pane() as unknown as CaptureProps).capturing).toBe(true);
  captureTool().onToggle();
  expect(harness.controller!.cancelCapture).toHaveBeenCalledOnce();
  expect(harness.controller!.startCapture).toHaveBeenCalledOnce();
});

test("Capture area is unavailable, with the canvas's reason, while the canvas can't be shown, and starts nothing", async () => {
  for (const patch of [{ unlisted: true }, { status: "failed", layout: null }, { status: "loading", layout: null }]) {
    reset();
    await openCanvas(undefined, patch);
    expect(captureTool()).toEqual(expect.objectContaining({ enabled: false, reason: CAPTURE_UNAVAILABLE }));
    captureTool().onToggle();
    expect(harness.controller!.startCapture).not.toHaveBeenCalled();
  }
});

test("Capture area gives Attach's reason while the composer continues a terminal session, and not once it starts a new one", async () => {
  doan.conversationResumeTarget!.mockResolvedValue({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  await canvasWithComposer();
  await flushAll();
  expect(captureTool()).toMatchObject({ enabled: false, reason: CAPTURE_TERMINAL });
  captureTool().onToggle();
  expect(harness.controller!.startCapture).not.toHaveBeenCalled();
  panelRun().choose("new"); render();
  expect(captureTool()).toMatchObject({ enabled: true, reason: null });
});

test("Capture area gives Attach's reason while the panel shows a legacy external conversation", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ owner: "legacy-external" })]);
  await canvasWithComposer();
  await flushAll();
  expect(panelRun().composerKey()).toBe("conversation:c1");
  expect(captureTool()).toMatchObject({ enabled: false, reason: CAPTURE_TERMINAL });
});

test("Capture area is unavailable once the composer's draft holds 10 files", async () => {
  await canvasWithComposer();
  attachFiles(9);
  expect(captureTool().enabled).toBe(true);
  attachFiles(10);
  expect(captureTool()).toMatchObject({ enabled: false, reason: CAPTURE_LIMIT });
});

// Export's rule: a press that lands while a page is locked does nothing. The pane is
// not shown on a page, so the press is the handler taken before the page opened, as the reply chip test does.
test("a Capture area press that lands while a page is locked does nothing", async () => {
  await canvasWithComposer();
  const press = captureTool().onToggle;
  listeners.openSettingsPage!({} as never); render();
  find<{ onState(report: { locked: boolean }): void }>(SettingsPage)[0]!.props.onState({ locked: true }); render();
  press();
  expect(harness.controller!.startCapture).not.toHaveBeenCalled();
});

test("a captured area lands as a checking Canvas capture chip at once, and main's answer settles it with its thumbnail", async () => {
  await canvasWithComposer();
  let answer!: (value: unknown) => void;
  doan.captureCanvas = vi.fn(() => new Promise(resolve => { answer = resolve; }));
  const snapshot = captureListener()(RECT);
  expect(snapshot).toBeTypeOf("function");
  expect(composerChips()).toEqual([expect.objectContaining({ pasted: true, status: "checking", kind: "image" })]);
  expect(composerChips()[0]!.name.startsWith("canvas-capture-")).toBe(true);
  expect(doan.captureCanvas).not.toHaveBeenCalled();
  const done = snapshot!();
  expect(doan.captureCanvas).toHaveBeenCalledWith(RECT);
  answer(captured()); await done; render();
  const key = composerChips()[0]!.key;
  expect(composerChips()).toEqual([expect.objectContaining({ id: "cap1", status: "ready", pasted: true, name: "canvas-capture-2026-11-05T12-00-00-000Z.png" })]);
  expect((find<{ support: { thumbnails: Record<string, string> } }>(CanvasConversation)[0]!.props.support.thumbnails)[key]).toBeTruthy();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// unfolding narrows the canvas area, so it waits for main's answer,
// which comes after main has read the pixels; the checking chip goes in at once.
test("a folded panel unfolds, with focus for the composer, only once main answers the capture", async () => {
  for (const reply of [captured(), { ok: false, name: "Canvas capture", error: "capture_failed" }]) {
    reset();
    await canvasWithComposer({ panel: false });
    let answer!: (value: unknown) => void;
    doan.captureCanvas = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const snapshot = captureListener()(RECT); render();
    expect(composerChips()).toHaveLength(1);
    expect(panel()?.open).toBe(false);
    const done = snapshot!(); render();
    expect(panel()?.open).toBe(false);
    expect(conversation()?.arrival).toBeNull();
    answer(reply); await done; render();
    expect(panel()?.open).toBe(true);
    expect(conversation()?.arrival).toMatchObject({ focus: "composer" });
  }
});

test.each([
  ["main could not capture or save the PNG", async () => ({ ok: false, name: "Canvas capture", error: "capture_failed" }), "Couldn’t capture the canvas. Try again."],
  ["main refused the request", async () => null, "Couldn’t capture the canvas. Try again."],
  ["the call threw", async () => { throw new Error("window closed"); }, "Couldn’t capture the canvas. Try again."],
  ["the image is over 50 MB", async () => ({ ok: false, name: "Canvas capture", error: "too_large" }), "This image is over 50 MB, so it wasn’t attached."],
])("a capture that fails because %s removes its chip and shows one toast", async (_case, reply, text) => {
  await canvasWithComposer();
  doan.captureCanvas = vi.fn(reply);
  await captureListener()(RECT)!(); render();
  expect(composerChips()).toEqual([]);
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(text);
});

// Availability was decided at render; a paste since then may have filled the draft, and main refuses an eleventh file.
test("a draft that reached 10 files after the render takes no snapshot and says one was left out", async () => {
  await canvasWithComposer();
  attachFiles(9);
  expect(captureTool().enabled).toBe(true);
  const key = panelRun().composerKey()!;
  panelRun().store.setDrafts(drafts => new Map(drafts).set(key, { segments: [], preset: null, shape: "capsule", attachments: Array.from({ length: 10 }, (_, i) => fileChip(i)) }));
  doan.captureCanvas = vi.fn();
  expect(captureListener()(RECT)).toBeNull();
  expect(doan.captureCanvas).not.toHaveBeenCalled();
  expect(composerChips()).toHaveLength(10);
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("Only 10 attachments can be added. 1 was left out.");
});

// a role=status line above the tools, in the picking hint's look.
test("capture mode shows its hint line above the tools, with Esc and a spoken cancel", async () => {
  await canvasWithComposer();
  const paneTree = () => {
    const element = all(tree).find(node => typeof node.type === "function" && node.type.name === "CanvasPane")!;
    return all((element.type as (props: unknown) => ReactNode)(element.props));
  };
  const hint = (nodes = paneTree()) => nodes.find(node => node.props.role === "status" && String(node.props.className).includes("doan-picking"));
  const words = (node: ReactNode): string => Array.isArray(node) ? node.map(words).filter(Boolean).join("|") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? words(node.props.children) : "";
  expect(hint()).toBeUndefined();
  capturing(true);
  const nodes = paneTree(), line = hint(nodes)!;
  expect(line.props.className).toBe("doan-agent doan-picking");
  expect(words(line.props.children as ReactNode)).toBe("Drag to capture an area|Esc|Press Escape to cancel");
  const bottom = nodes.find(node => node.props.className === "doan-canvas-bottom")!;
  const order = (bottom.props.children as ReactNode[]).filter(isValidElement);
  expect(order[0]).toBe(line);
});

// capture mode does not end when the composer turns to one that refuses files, so the release checks the
// composer again, with captureAvailability's order and copy, before any chip or snapshot.
test("a release after the composer turned to a terminal session takes no snapshot and gives Attach's reason", async () => {
  doan.conversationResumeTarget!.mockResolvedValue({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  await canvasWithComposer();
  await flushAll();
  panelRun().choose("new"); render();
  captureTool().onToggle();
  expect(harness.controller!.startCapture).toHaveBeenCalledOnce();
  capturing(true);
  panelRun().choose("resume"); render();
  doan.captureCanvas = vi.fn();
  expect(captureListener()(RECT)).toBeNull();
  expect(doan.captureCanvas).not.toHaveBeenCalled();
  expect([...panelRun().store.drafts.values()].flatMap(draft => draft.attachments)).toEqual([]);
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(CAPTURE_TERMINAL);
});

test("a release after the panel switched to a legacy external conversation takes no snapshot and gives Attach's reason", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary(), rowSummary({ conversationId: "c2", owner: "legacy-external" })]);
  await canvasWithComposer();
  await flushAll();
  expect(panelRun().composerKey()).toBe("conversation:c1");
  expect(captureTool().enabled).toBe(true);
  captureTool().onToggle();
  capturing(true);
  (panelRun() as unknown as { select(id: string): void }).select("c2"); render();
  expect(panelRun().composerKey()).toBe("conversation:c2");
  doan.captureCanvas = vi.fn();
  expect(captureListener()(RECT)).toBeNull();
  expect(doan.captureCanvas).not.toHaveBeenCalled();
  expect([...panelRun().store.drafts.values()].flatMap(draft => draft.attachments)).toEqual([]);
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(CAPTURE_TERMINAL);
});

test("a release after another canvas took the same ID takes no snapshot and gives the composer's reason", async () => {
  await canvasWithComposer();
  captureTool().onToggle();
  capturing(true);
  folders([{ path: "/w/a", kind: "list", servedRev: 1, canvases: [rowA, { path: ".doan/canvases/b.html", id: "a", url: "u-b" }] }]);
  expect(conversation()?.blocked).toBe(DUPLICATE_CANVAS_TEXT);
  doan.captureCanvas = vi.fn();
  expect(captureListener()(RECT)).toBeNull();
  expect(doan.captureCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(DUPLICATE_CANVAS_TEXT);
});

// an answer that lands after the composer changed settles on its chip but moves no panel or focus.
test("a late answer after the panel switched conversation or the canvas page left settles its chip without unfolding", async () => {
  for (const leave of ["conversation", "home"] as const) {
    reset();
    doan.listConversations!.mockResolvedValue([rowSummary(), rowSummary({ conversationId: "c2" })]);
    await canvasWithComposer({ panel: false });
    await flushAll();
    const store = panelRun().store, at = panelRun().composerKey()!;
    let answer!: (value: unknown) => void;
    doan.captureCanvas = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const done = captureListener()(RECT)!();
    if (leave === "conversation") (panelRun() as unknown as { select(id: string): void }).select("c2");
    else find<{ goHome(): void }>(ShellSidebar)[0]!.props.goHome();
    render();
    answer(captured()); await done; render();
    expect(store.drafts.get(at)?.attachments).toEqual([expect.objectContaining({ id: "cap1", status: "ready" })]);
    expect(saved()?.rightPanel).toMatchObject({ open: false });
    if (leave === "conversation") { expect(panel()?.open).toBe(false); expect(conversation()?.arrival).toBeNull(); }
  }
});

// The inspector column (PRODUCT §5 item 4): closed until the person opens it, open state and width kept per device,
// sized after the conversation and taken away, with its saved open flag kept, from a window too narrow for it.
describe("the inspector column", () => {
  type Column = { shown: boolean; width: number; bounds: { min: number; max: number }; onHide(): void; onResize(width: number | undefined): void };
  type InspectorPane = { inspector: { open: boolean; fits: boolean; show(): void; focused?(node: Element): void } };
  const column = () => find<Column>(InspectorColumn)[0]?.props;
  const inspectorPane = () => (pane() as unknown as InspectorPane | undefined)?.inspector;
  const savedInspector = () => (doan.saveUiState!.mock.lastCall?.[0] as { inspector?: unknown } | undefined)?.inspector;
  // The window and the shell column App measures: the canvas panel starts 236px in, and the shell ends 8px before the
  // window's right edge.
  function measure(width: number, canvasLeft = 236) {
    (window as unknown as { innerWidth: number }).innerWidth = width;
    vi.stubGlobal("getComputedStyle", () => ({ paddingRight: "8px" }));
    const main = all(tree).find(element => element.type === "main")!.props.ref as { current: unknown };
    main.current = { clientWidth: width, getBoundingClientRect: () => ({ left: 0 }), querySelector: () => ({ getBoundingClientRect: () => ({ left: canvasLeft }) }), style: { setProperty: vi.fn() } };
    windowListeners.resize!(undefined as never); render();
    return main.current;
  }
  const focusing = () => {
    const asked: string[] = [];
    const focus = vi.fn();
    (document as unknown as { querySelector(selector: string): unknown }).querySelector = (selector: string) => { asked.push(selector); return { focus, isConnected: true }; };
    return { asked, focus };
  };

  test("a read without its state leaves it closed, and Show inspector opens it and hands focus to Hide inspector", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
    measure(1470);
    expect(column()?.shown).toBe(false);
    expect(inspectorPane()).toMatchObject({ open: false, fits: true });
    expect(savedInspector()).toBeUndefined();
    const { asked, focus } = focusing();
    inspectorPane()!.show(); render();
    expect(column()).toMatchObject({ shown: true, width: 280, bounds: { min: 280, max: 1226 - 412 - 360 } });
    expect(savedInspector()).toEqual({ open: true });
    expect(asked).toContain(".doan-insp-panel .doan-panel-hide");
    expect(focus).toHaveBeenCalled();
  });

  test("the bubble's Show inspector respects yield, then opens the same saved panel and focuses Hide", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
    folders([listed("/w/a")]);
    const hooks = harness.controller as unknown as { bubbleInspect: { onInspect(): void; onFocusLost(): void } };
    measure(1100);
    hooks.bubbleInspect.onInspect(); render();
    expect(inspectorPane()!.open).toBe(false);
    const { asked } = focusing();
    hooks.bubbleInspect.onFocusLost();
    expect(asked).toContain('.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]');
    measure(1470);
    hooks.bubbleInspect.onInspect(); render();
    expect(column()?.shown).toBe(true);
    expect(savedInspector()).toEqual({ open: true });
    expect(asked).toContain(".doan-insp-panel .doan-panel-hide");
  });

  test.each([true, false])("widening removes the bubble action and hands off only its own focus (still focused: %s)", async stillFocused => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true } });
    folders([listed("/w/a")]);
    (harness.controller as unknown as { bubbleAdd: { host(node: unknown): void } }).bubbleAdd.host({});
    measure(1100);
    const portal = () => find<Parameters<typeof BubbleAdd>[0]>(BubbleAdd)[0]!.props;
    expect(portal().items.at(-1)).toMatchObject({ kind: "inspect", disabled: expect.any(String) });
    const action = { isConnected: true };
    portal().focused(action as Element);
    if (!stillFocused) {
      const focusin = (document.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[0] === "focusin");
      for (const [, listener] of focusin) listener({ target: { closest: () => null } });
    }
    const { asked } = focusing();
    action.isConnected = false;
    Object.assign(document, { activeElement: document.body });
    measure(1470);
    expect(portal().items.some(item => item.kind === "inspect")).toBe(false);
    expect(asked.includes(".doan-insp-panel .doan-panel-hide")).toBe(stillFocused);
  });

  test("Hide inspector folds it, keeps its width and hands focus to its own Show button", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1470);
    expect(column()).toMatchObject({ shown: true, width: 320 });
    const { asked } = focusing();
    column()!.onHide(); render();
    expect(column()?.shown).toBe(false);
    expect(savedInspector()).toEqual({ open: false, width: 320 });
    expect(asked).toContain('.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]');
    column()!.onResize(360); render();
    expect(savedInspector()).toEqual({ open: false, width: 360 });
  });

  test("the conversation's fold hands focus to its own Show button, not the inspector's", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
    const { asked } = focusing();
    panel()!.onHide(); render();
    expect(asked).toContain('.doan-canvas-head .doan-panel-show[data-panel-target="conversation"]');
  });

  test("a window too narrow for it takes the column away and keeps the saved open flag; widening brings it back", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1100);
    expect(column()?.shown).toBe(false);
    expect(inspectorPane()).toMatchObject({ open: true, fits: false });
    expect(savedInspector()).toEqual({ open: true, width: 320 });
    // The conversation keeps its width: it is sized first.
    expect(panel()?.width).toBe(320);
    measure(1470);
    expect(column()).toMatchObject({ shown: true, width: 320 });
  });

  // Found in the real app: the column turns inert in the same commit that hides it, so focus has already fallen to the
  // page when App's effect runs; the last control focused inside the column is what says focus was there.
  test("narrowing the window with focus in the inspector hands focus to Show inspector", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1470);
    const focusin = (document.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[0] === "focusin").map(call => call[1] as (event: unknown) => void);
    expect(focusin.length).toBeGreaterThan(0);
    // The row is redrawn afterwards (the list read again), so the node that took focus is no longer in the column.
    let attached = true;
    const row = { closest: (selector: string) => attached && selector.includes(".doan-insp-column") ? {} : null };
    for (const listener of focusin) listener({ target: row });
    attached = false;
    const { asked, focus } = focusing();
    (document as unknown as { activeElement: unknown }).activeElement = (document as unknown as { body: unknown }).body;
    measure(1100);
    expect(column()?.shown).toBe(false);
    expect(asked).toContain('.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]');
    expect(focus).toHaveBeenCalled();
  });

  // POSTMORTEM 2026-11-13: the narrow window's hand-off put focus on Show inspector; widening again removes that
  // button, so focus goes on to Hide inspector, as unfolding does.
  test("widening again after the narrow window's hand-off gives focus to Hide inspector", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1100);
    const show = { isConnected: true };
    inspectorPane()!.focused!(show as never);
    const { asked, focus } = focusing();
    show.isConnected = false;
    (document as unknown as { activeElement: unknown }).activeElement = (document as unknown as { body: unknown }).body;
    measure(1470);
    expect(column()?.shown).toBe(true);
    expect(asked).toContain(".doan-insp-panel .doan-panel-hide");
    expect(focus).toHaveBeenCalled();
  });

  const narrowWithFocusIn = async (target: { closest(selector: string): unknown }, hasFocus = true, active?: unknown) => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1470);
    const focusin = (document.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[0] === "focusin").map(call => call[1] as (event: unknown) => void);
    for (const listener of focusin) listener({ target });
    const seen = focusing();
    (document as unknown as { hasFocus(): boolean }).hasFocus = () => hasFocus;
    (document as unknown as { activeElement: unknown }).activeElement = active ?? (document as unknown as { body: unknown }).body;
    measure(1100);
    return seen;
  };
  const SHOW = '.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]';

  // The element menu is portalled out of the column; a narrow window closes it and Radix cannot give focus back to its
  // trigger in the inert column, so focus in the menu is focus in the inspector.
  test("narrowing the window with focus in the element menu hands focus to Show inspector", async () => {
    const { asked, focus } = await narrowWithFocusIn({ closest: (selector: string) => selector.includes(".doan-insp-menu") ? {} : null });
    expect(asked).toContain(SHOW);
    expect(focus).toHaveBeenCalled();
  });

  // Found in the real app: the closing menu stays mounted for its exit animation, with focus still on its row, when
  // App's effect runs.
  test("narrowing the window while focus is still on the closing element menu hands focus to Show inspector", async () => {
    vi.stubGlobal("HTMLElement", class {});
    const HTMLElementFake = (globalThis as unknown as { HTMLElement: new () => object }).HTMLElement;
    const menuRow = Object.assign(new HTMLElementFake(), { closest: (selector: string) => selector.includes(".doan-insp-menu") ? {} : null });
    const { asked, focus } = await narrowWithFocusIn(menuRow, true, menuRow);
    expect(asked).toContain(SHOW);
    expect(focus).toHaveBeenCalled();
  });

  test("focus that was outside the inspector before it fell to the page stays put when the window narrows", async () => {
    const { asked } = await narrowWithFocusIn({ closest: () => null });
    expect(asked).not.toContain(SHOW);
  });

  // POSTMORTEM 2026-11-17: in a background window the platform's own restore on activation would put focus back on the
  // remembered row (now inert) and fall to Hide sidebar; the hand-off is made again once the window is active.
  test("a hand-off made in a background window is made again on activation", async () => {
    const { asked, focus } = await narrowWithFocusIn({ closest: (selector: string) => selector.includes(".doan-insp-column") ? {} : null }, false);
    expect(asked).toContain(SHOW);
    const before = focus.mock.calls.length;
    (document as unknown as { hasFocus(): boolean }).hasFocus = () => true;
    windowListeners.focus!(undefined as never);
    expect(focus.mock.calls.length).toBeGreaterThan(before);
    // And once more after the platform's own restore.
    const restored = focus.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(focus.mock.calls.length).toBeGreaterThan(restored);
  });

  test.each(["reload return", "focusin"] as const)("activating the window preserves later inspector bubble focus (%s)", async move => {
    await canvasPage();
    folders([listed("/w/a")]);
    const win = new EventTarget();
    vi.stubGlobal("window", Object.assign(win, { doan }));
    let activeWindow = false;
    Object.assign(document, { hasFocus: () => activeWindow });
    const focused = (target: unknown) => {
      Object.assign(document, { activeElement: target });
      if (move === "reload return") return;
      for (const [type, listener] of vi.mocked(document.addEventListener).mock.calls) {
        if (type === "focusin") (listener as (event: unknown) => void)({ target });
      }
    };
    const header = { name: "header", closest: () => null, isConnected: true, focus: () => focused(header) };
    const bubble = { name: "bubble", closest: () => null, isConnected: true, focus: () => focused(bubble) };
    Object.assign(document, { querySelector: (selector: string) => selector === SHOW ? header : null });
    const controller = harness.controller as unknown as { bubbleAdd: { host(node: unknown): void }; bubbleInspect: { onFocusLost(): void; restoreFocus(): void } };
    controller.bubbleAdd.host({}); render();
    const portal = find<Parameters<typeof BubbleAdd>[0]>(BubbleAdd)[0]!.props;
    portal.inspectButton.current = bubble as unknown as HTMLButtonElement;
    focused(bubble);
    controller.bubbleInspect.onFocusLost();
    expect(document.activeElement).toBe(header);
    // A reload can restore DOM focus silently in the background. A separate focus move can also end the hold.
    if (move === "reload return") controller.bubbleInspect.restoreFocus();
    else bubble.focus();
    expect(document.activeElement).toBe(bubble);
    activeWindow = true;
    win.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(bubble);
  });

  // Found in the real app: hiding the sidebar animates the shell's columns, so the measure taken when it hides still saw
  // the sidebar, and at 1000 the inspector stayed away until the next window resize. The end of the shell's own
  // transition measures again.
  test("the shell measures again when its columns finish moving, so a hidden sidebar makes room for the inspector", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true } });
    const main = measure(1000);
    expect(column()?.shown).toBe(false);
    (main as { querySelector(): unknown }).querySelector = () => ({ getBoundingClientRect: () => ({ left: 8 }) });
    windowListeners.transitionend!({ target: {} } as never); render();
    expect(column()?.shown).toBe(false);
    windowListeners.transitionend!({ target: main } as never); render();
    expect(column()?.shown).toBe(true);
  });

  test("with the inspector shown the conversation's drag stops where the board keeps 360", async () => {
    await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, inspector: { open: true, width: 320 } });
    measure(1470);
    expect(find<{ bounds: { max: number } }>(ConversationPanel)[0]?.props.bounds.max).toBe(1226 - 320 - 360);
  });

  test("the Overview has no inspector column", () => {
    render(); folders([listed("/w/a")]);
    find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
    expect(find(InspectorColumn)).toHaveLength(0);
  });
});

// The Overview's Conversations list: project conversations beside canvas conversations; the shown one is current and
// a project row opens in the Overview's main column (PRODUCT §5 item 3 'Project Overview').
describe("the Overview's Conversations list", () => {
  type Run = { view(root: string): { kind: string; conversationId?: string }; select(root: string, id: string | null): void; started(root: string, id: string, provider?: string): void;
    scrollRequest(id: string): unknown; revision(root: string): number; show(root: string | null): void };
  type ListItem = { kind: string; key: string; conversationId: string };
  type List = { list: unknown; current: string | null; open(item: unknown): void };
  const COMPOSER = ".workspace .ov-main .composer-input";
  const project = (conversationId: string, patch: Record<string, unknown> = {}) => ({ conversationId, title: `Title ${conversationId}`, owner: "doan", provider: "claude", fromHome: true,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch });
  const run = () => find<{ run: Run }>(ProjectOverview)[0]!.props.run;
  const list = () => find<List>(CanvasConversations)[0]!.props;
  const item = (key: string) => (list().list as ListItem[]).find(row => row.key === key)!;
  const history = () => { const bar = find<{ back: boolean; forward: boolean }>(TopBar)[0]!.props; return [bar.back, bar.forward]; };
  // The Overview of /w/a after its first list read; `remembered` is the conversation ui-state names for the root.
  async function overviewWith(conversations: unknown[], remembered: string | null = "p1") {
    doan.listConversations!.mockResolvedValue(conversations);
    render();
    readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, ...(remembered ? { conversationByRoot: { "/w/a": remembered } } : {}) }); await flushAll();
    folders([listed("/w/a")]); toOverview();
    await flushAll();
  }
  const listChanged = async (conversations: unknown[]) => {
    doan.listConversations!.mockResolvedValue(conversations);
    listeners.conversationList!({ root: "/w/a" } as never); await flushAll();
  };

  test("the panel is named Conversations and lists project and canvas conversations together", async () => {
    await overviewWith([project("p1", { unseen: true }), rowSummary({ conversationId: "c1", lastActivityAt: "2026-11-01T00:01:00.000Z" })]);
    expect((list().list as ListItem[]).map(row => [row.key, row.kind])).toEqual([["c1", "canvas"], ["p1", "project"]]);
    expect(overviewHandle()).toBeDefined();
  });

  test("thumbnails are asked only for canvas rows", async () => {
    await overviewWith([project("p1", { unseen: true }), rowSummary({ conversationId: "c1" })]);
    expect(probe.thumbRows).toEqual([rowA]);
  });

  test("current is the conversation the main column shows, and follows a title menu pick before any list read", async () => {
    await overviewWith([project("p1", { unseen: true }), project("p2")]);
    expect(list().current).toBe("p1");
    const reads = doan.listConversations!.mock.calls.length;
    run().select("/w/a", "p2"); render();
    expect(list().current).toBe("p2");
    run().select("/w/a", null); render();
    expect(list().current).toBeNull();
    expect(doan.listConversations!.mock.calls.length).toBe(reads);
  });

  test("no current while the column waits or shows the new conversation state; a started conversation becomes current when a list read has it", async () => {
    doan.listConversations!.mockResolvedValue(new Promise(() => {}));
    render(); folders([listed("/w/a")]); toOverview();
    expect(run().view("/w/a").kind).toBe("wait");
    expect(list().current).toBeNull();
    reset();
    // p1's ending was seen, so the run's first pick starts fresh.
    await overviewWith([project("p1")]);
    expect(run().view("/w/a").kind).toBe("new");
    expect(list().current).toBeNull();
    run().started("/w/a", "p9", "claude"); render();
    expect((list().list as ListItem[]).map(row => row.key)).toEqual(["p1"]);
    await listChanged([project("p1"), project("p9", { phase: "running", working: true, lastActivityAt: "2026-11-01T00:05:00.000Z" })]);
    expect(item("p9").kind).toBe("project");
    expect(list().current).toBe("p9");
  });

  // POSTMORTEM 2026-11-23: the list read and the run's own state arrive apart; a promoted row is a canvas row.
  test("the shown conversation promoted to a canvas: its row turns into a canvas row and no row is current", async () => {
    await overviewWith([project("p1", { unseen: true }), project("p2")]);
    await listChanged([{ ...project("p1"), canvas: { path: rowA.path, id: "a" }, startedBy: "promotion" }, project("p2")]);
    expect(item("p1").kind).toBe("canvas");
    expect(list().current).toBeNull();
  });

  test("a project row shows its conversation in the main column, focus for the composer, with no Back/Forward visit and no canvas opened", async () => {
    await overviewWith([project("p1", { unseen: true }), project("p2")]);
    probe.fields[COMPOSER] = { field: "overview" };
    clearController();
    const before = history();
    list().open(item("p2")); render(); await flushAll();
    expect(run().view("/w/a")).toEqual({ kind: "conversation", conversationId: "p2" });
    expect(list().current).toBe("p2");
    expect(probe.focused).toEqual([{ field: "overview" }]);
    expect(history()).toEqual(before);
    expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
    expect(harness.controller!.showOverview).not.toHaveBeenCalled();
    expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
  });

  test("a project row waiting for an answer opens scrolled to its request, as a toast's Open does, and leaves the composer alone", async () => {
    await overviewWith([project("p1", { unseen: true }), project("p2", { phase: "waiting", working: true })]);
    probe.fields[COMPOSER] = { field: "overview" };
    list().open(item("p2")); render(); await flushAll();
    expect(run().view("/w/a")).toEqual({ kind: "conversation", conversationId: "p2" });
    expect(run().scrollRequest("p2")).toMatchObject({ to: "permission" });
    expect(probe.focused).toEqual([]);
  });

  test("the row of the conversation already shown changes nothing but focus", async () => {
    await overviewWith([project("p1", { unseen: true }), project("p2")]);
    probe.fields[COMPOSER] = { field: "overview" };
    const revision = run().revision("/w/a");
    list().open(item("p1")); render(); await flushAll();
    expect(run().view("/w/a")).toEqual({ kind: "conversation", conversationId: "p1" });
    expect(run().revision("/w/a")).toBe(revision);
    expect(probe.focused).toEqual([{ field: "overview" }]);
  });

  test("a row press is a pick: it ends a fresh start, so coming back reopens the picked conversation", async () => {
    await overviewWith([project("p1"), project("p2")]);
    expect(run().view("/w/a").kind).toBe("new");
    list().open(item("p2")); render(); await flushAll();
    expect(run().view("/w/a")).toEqual({ kind: "conversation", conversationId: "p2" });
    run().show(null); run().show("/w/a"); render();
    expect(run().view("/w/a")).toEqual({ kind: "conversation", conversationId: "p2" });
  });
});
