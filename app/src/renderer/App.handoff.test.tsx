import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { HandoffNotice } from "../main/conversation/handoff";

// canvas-handoff U2 (design §6 'Move', decision 5): App's handling of conversation:handoff. Driven with hooks as plain
// state and a stub controller, as App.replyChips.test.tsx is.
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "onCapture", "pick", "cancelPick", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
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
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { initialCanvasState } = await import("./CanvasController");

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
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), answerOpenRequest: vi.fn(async () => {}),
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
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
const clearController = () => { for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear(); };

const D = ".doan/canvases/drafts.html", C = ".doan/canvases/checkout-flow.html";
const drafts: CanvasRow = { path: D, id: "drafts", url: "u-d", width: 600, frames: [] };
const checkout: CanvasRow = { path: C, id: "checkout", url: "u-c", width: 600, frames: [] };
const listA = (canvases: CanvasRow[] = [drafts, checkout]): FolderEntry => ({ path: "/w/a", kind: "list", servedRev: 0, canvases });
const HOME = { screen: "home", expanded: {}, lastByRoot: {}, home: {} };
const flushAll = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); render(); };
type OpenOptions = { opened(): void; unavailable(entry: FolderEntry | undefined): void };
const lastOpen = () => harness.controller!.openCanvas!.mock.lastCall as [string, CanvasRow, unknown, OpenOptions];
const back = () => (all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar")!.props as { back: boolean }).back;
const notice: HandoffNotice = { root: "/w/a", source: { conversationId: "c1", canvas: { path: D, id: "drafts" } }, target: { conversationId: "c2", canvas: { path: C, id: "checkout" } } };
const handoff = (n: HandoffNotice = notice) => { listeners.handoff!(n as never); render(); };
type Panel = { arrival: { focus: string } | null; project: string };
const panel = () => find<Panel>(CanvasConversation)[0]?.props;

async function overview(list = listA()) {
  render();
  readUiState(HOME); await Promise.resolve(); await Promise.resolve(); render();
  folders([list]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  await flushAll();
}
function showCanvas(row: CanvasRow) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: row.path, row }, shown: row.path, status: null, message: "", layout: { frames: [], width: 600 } });
  render();
}
async function onDrafts(list = listA()) { await overview(list); showCanvas(drafts); await flushAll(); }

test("on the source canvas the handoff moves through Quick Open's path: one visit, the panel on the card", async () => {
  await onDrafts();
  clearController();
  handoff();
  const [root, row, to, options] = lastOpen();
  expect([root, row.path, to]).toEqual(["/w/a", C, undefined]);
  expect(harness.toast.show).not.toHaveBeenCalled();
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  options.opened(); render();
  expect(back()).toBe(true);
  expect(panel()!.arrival).toMatchObject({ focus: "handoff" });
});

test("away from the source canvas the handoff is a toast whose Open opens the target conversation", async () => {
  await overview();
  clearController();
  handoff();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  open(); render();
  expect(lastOpen().slice(0, 2)).toEqual(["/w/a", expect.objectContaining({ path: C })]);
});

test("a toast's Open after the target disappeared answers that it couldn't open, and moves nowhere", async () => {
  await overview();
  showCanvas(drafts); await flushAll();
  const project = panel()!.project;
  find<{ overview(root: string): void }>(ShellSidebar)[0]!.props.overview("/w/a");
  harness.setState!({ ...initialCanvasState() }); render(); await flushAll();
  handoff();
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  folders([listA([drafts])]);
  clearController(); harness.toast.show.mockClear();
  open(); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(`Couldn’t open checkout-flow.html. The canvas isn’t in ${project}.`);
});

test("a target the renderer's list does not have yet waits for its read, then moves", async () => {
  await onDrafts(listA([drafts]));
  clearController();
  handoff();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
  folders([listA()]);
  expect(lastOpen().slice(0, 2)).toEqual(["/w/a", expect.objectContaining({ path: C })]);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("a read that takes over 10 s turns the move into the toast", async () => {
  vi.useFakeTimers();
  try {
    await onDrafts(listA([drafts]));
    clearController();
    handoff();
    vi.advanceTimersByTime(9_999); render();
    expect(harness.toast.show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); render();
    expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
    // The read arriving afterwards moves nothing.
    folders([listA()]);
    expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

test("leaving the source canvas while the read is awaited turns the move into the toast", async () => {
  await onDrafts(listA([drafts]));
  handoff();
  find<{ overview(root: string): void }>(ShellSidebar)[0]!.props.overview("/w/a");
  harness.setState!({ ...initialCanvasState() }); render(); await flushAll();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
  clearController();
  folders([listA()]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
});

test("a locked page shows the toast instead of moving", async () => {
  await onDrafts();
  listeners.openSettingsPage!({} as never); render();
  clearController();
  handoff();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
});
