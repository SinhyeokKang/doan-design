import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// buzz-canvas R4: the canvas page's right column is the conversation panel shell, not Inspector or Comments, and its
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
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
const { RightPanel } = await import("./RightPanel");
const { ConversationPanel, ResizeHandle } = await import("./ConversationPanel");
const { ProjectOverview } = await import("./ProjectOverview");
const { HomeRun } = await import("./homeRun");
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { CanvasConversations } = await import("./RightPanel");
const { initialCanvasState } = await import("./CanvasController");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA] });
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
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true });
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
type Sidebar = ReactElement<{ locked?: boolean; settings?: { section: string; select(section: string): void } } & Record<string, (...args: never[]) => void>>;
type PageProps = { section: string; arrival: { focus: { kind: string; provider?: string }; seq: number } | null; onState(report: { locked: boolean }): void; header: ReactElement; sidebar: Sidebar;
  agents: { preferences: PreferencesSnapshot | null; save(patch: unknown): Promise<unknown>; project: { root: string; name: string } | null } };
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
const click = (element: ReactElement<Record<string, unknown>>) => { (element.props.onClick as () => void)(); render(); };
const clearController = () => { for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear(); };


type Panel = { open: boolean; width: number; onHide(): void; onResize(width: number | undefined): void };
type Pane = { conversation: { open: boolean; show(): void } };
const panel = () => find<Panel>(ConversationPanel)[0]?.props;
const pane = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "CanvasPane")?.props as Pane | undefined;
const saved = () => doan.saveUiState!.mock.lastCall?.[0] as { rightPanel?: unknown } | undefined;

// A workspace on /w/a without an Overview: the canvas page, here showing the project's problem screen.
async function canvasPage(state: unknown = null) {
  render();
  readUiState(state); await Promise.resolve(); await Promise.resolve(); render();
  folders([listed("/w/a")]);
  folders([{ path: "/w/a", kind: "notFound" }]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(ProjectOverview)).toHaveLength(0);
}

test("the canvas page shows the conversation panel shell, not Canvas info or the Inspector", async () => {
  await canvasPage();
  expect(find(ConversationPanel)).toHaveLength(1);
  expect(find(RightPanel)).toHaveLength(0);
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
  folders([{ path: "/w/a", kind: "notFound" }]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  panel()!.onHide(); render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 500 } }); await Promise.resolve(); await Promise.resolve(); render();
  expect(panel()?.open).toBe(false);
  expect(saved()?.rightPanel).toMatchObject({ open: false });
});

// RBR4 🟡1: main replaces the whole ui-state file on each save, so leaving a field out does not keep it. Nothing is
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

test("a read that fails still lets saves through, with the panel's own state", async () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(doan.saveUiState).not.toHaveBeenCalled();
  readUiState(null); await Promise.resolve(); await Promise.resolve(); render();
  expect(saved()).toMatchObject({ screen: "workspace", root: "/w/a", rightPanel: { open: true } });
});

// shell-panel-layout design §2.3: the Overview's canvas conversations panel has its own handle and its own remembered
// width; changing one panel's width leaves the other's alone.
type Handle = { label?: string; onResize(width: number | undefined): void };
const overviewHandle = () => find<Handle>(ResizeHandle).find(element => element.props.label === "Resize canvas conversations")?.props;
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

// canvas-hand-tool design '기기 저장' and '시작 복원': the last canvas tool is saved with the rest of ui-state, only
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
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(true);
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(ProjectOverview)).toHaveLength(1);
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(false);
});

// buzz-canvas R5 (design §2 '에이전트 작업 표시'): the agent notice's Open unfolds the panel and moves focus into it; a Stop
// failure is the shared toast; a page without a listed canvas gives the indicator no canvas.
type Agent = { canvas: unknown; running: boolean; list: unknown; onOpen(): void; onStopFailed(text: string): void };
const agent = () => (pane() as unknown as { agent: Agent } | undefined)?.agent;
function focusable() {
  const focus = vi.fn();
  const querySelector = vi.fn((selector: string) => selector === ".doan-conv-panel :is(.rp-head, .doan-conv-title .ov-title)" ? { focus } : null);
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector, querySelectorAll: () => [], hasFocus: () => true });
  return { focus, querySelector };
}

test("Open unfolds a folded panel and moves focus to the panel, not to its close button", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  const { focus, querySelector } = focusable();
  agent()!.onOpen(); render();
  expect(panel()?.open).toBe(true);
  expect(saved()?.rightPanel).toEqual({ open: true, width: 400 });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(querySelector).not.toHaveBeenCalledWith(".doan-conv-panel .doan-panel-hide");
});

test("Open with the panel already open only moves focus to the panel", async () => {
  await canvasPage({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 } });
  const { focus } = focusable();
  const before = doan.saveUiState!.mock.calls.length;
  agent()!.onOpen(); render();
  expect(panel()?.open).toBe(true);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(doan.saveUiState!.mock.calls.length).toBe(before);
});

test("a Stop failure is shown in the shared toast", async () => {
  await canvasPage();
  agent()!.onStopFailed("Couldn’t stop Codex. Try again.");
  expect(harness.toast.show).toHaveBeenCalledWith("Couldn’t stop Codex. Try again.");
});

test("a project problem gives the indicator no canvas; the canvas page runs it, the Overview does not", async () => {
  await canvasPage();
  expect(agent()?.canvas).toBeNull();
  expect(agent()?.running).toBe(true);
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(ProjectOverview)).toHaveLength(1);
  expect(agent()?.running).toBe(false);
});

// buzz-canvas-conversation R2/R3: the canvas page's panel holds the open canvas's conversation; entries unfold it.
const rowSummary = (patch: Record<string, unknown> = {}) => ({ conversationId: "c1", canvas: { path: rowA.path, id: "a" }, title: "Payment copy", state: "current", owner: "doan", provider: "claude",
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

// canvas-composer-polish spec 3: Pick from Canvas (⌘L) follows the picker alone; a selection is not a menu input.
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
  const row = { key: "c1", conversationId: "c1", row: rowA };
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

test("a folded panel's open button carries the news dot while the canvas's conversation waits", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ phase: "waiting", working: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  expect((pane() as unknown as { conversation: { badge: unknown } }).conversation.badge).toEqual({ kind: "permission", label: "Show conversation, needs your answer" });
  pane()!.conversation.show(); render();
  expect((pane() as unknown as { conversation: { badge: unknown } }).conversation.badge).toBeNull();
});

test("the capsule's Open shows the waiting conversation, unfolds the panel and sends focus to its first choice", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ phase: "waiting", working: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  agent()!.onOpen(); render();
  expect(panel()?.open).toBe(true);
  expect(conversation()?.arrival).toMatchObject({ focus: "permission" });
});

test("a sidebar canvas row unfolds the panel only when its slot needs an answer or has an unseen ending", async () => {
  doan.listConversations!.mockResolvedValue([rowSummary({ fromHome: true, unseen: true })]);
  await openCanvas({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: false, width: 400 } });
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA); render();
  expect(panel()?.open).toBe(true);
  expect(conversation()?.arrival).toMatchObject({ focus: "composer" });
});

// RD3: the row shows the terminal spinner over the app's unseen ending (withTerminalSlots), so its click decides with
// that working slot and keeps the panel as it was.
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

// Review BR2 R1: each entry is a new arrival, also after the panel consumed the previous one.
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

// buzz-canvas-conversation R4 (design §2 'Focus return', POSTMORTEM 2026-10-23 R-L): the picker's waiting
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

test("a pick whose focus went elsewhere meanwhile adds its chip but does not take focus back, also after focus returns", async () => {
  const { link, conversation } = await canvasWithComposer();
  conversation.pick.onToggle();
  const ended = harness.controller!.onPicked!.mock.calls[0]![0] as (result: unknown) => void;
  focusMoved({ name: "a search field elsewhere" });
  // Focus coming back to the picker before the canvas click does not restore the intent.
  focusMoved(null);
  ended({ kind: "picked", anchor: ANCHOR, frames: [] });
  expect(link.insert).toHaveBeenCalledWith(ANCHOR);
  expect(link.focus).not.toHaveBeenCalled();
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

// canvas-composer-polish spec 3: the toolbar's Picker and ⌘L run the composer's own pick.
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

// Review TOOL 🟡1: going back to where focus was is for focus the pick left behind (the page, the canvas, the element
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
