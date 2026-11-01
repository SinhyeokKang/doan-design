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
    constructor() {
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "settleFit"]) self[name] = vi.fn();
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
const { RightPanel } = await import("./RightPanel");
const { ConversationPanel } = await import("./ConversationPanel");
const { ProjectOverview } = await import("./ProjectOverview");
const { HomeRun } = await import("./homeRun");

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
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
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
    for (const ref of [pane?.viewport, pane?.board, pane?.overlay]) if (ref && !ref.current) ref.current = {};
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

// buzz-canvas R5 (design §2 '에이전트 작업 표시'): the agent notice's Open unfolds the panel and moves focus into it; a Stop
// failure is the shared toast; a page without a listed canvas gives the indicator no canvas.
type Agent = { canvas: unknown; running: boolean; list: unknown; onOpen(): void; onStopFailed(text: string): void };
const agent = () => (pane() as unknown as { agent: Agent } | undefined)?.agent;
function focusable() {
  const focus = vi.fn();
  const querySelector = vi.fn((selector: string) => selector === ".doan-conv-panel .rp-head" ? { focus } : null);
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector, querySelectorAll: () => [] });
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
