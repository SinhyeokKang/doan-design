import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { Anchor } from "../main/conversation/types";

type Canvas = NonNullable<Anchor["canvas"]>;

// A canvas chip pressed in the canvas panel or the Overview, sent or in the composer. Hooks run as plain state with a
// stub controller (the harness of App.replyChips.test.tsx).
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "onPicked", "onElementTree", "requestElementTree", "previewElement", "selectElement", "onCapture", "pick", "cancelPick", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
      self.openWorkspace = vi.fn((root: string, done: (root: string) => void) => done(root));
      self.showOverview = vi.fn((done: () => void) => done());
      self.destination = vi.fn((root: string) => ({ root }));
      self.currentView = vi.fn(() => ({ scale: 1, x: 0, y: 0 }));
      self.memory = vi.fn(() => ({}));
      harness.controller = self;
    }
  },
}));
vi.mock("./thumbnails", () => ({ useThumbnailHub: () => null, useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { ProjectOverview } = await import("./ProjectOverview");
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { initialCanvasState } = await import("./CanvasController");

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
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
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

const D = ".doan/canvases/drafts.html", C = ".doan/canvases/checkout.html";
const drafts: CanvasRow = { path: D, id: "drafts", url: "u-d", width: 600, frames: [{ id: "editor", title: "Editor" }] };
const checkout: CanvasRow = { path: C, id: "checkout", url: "u-c", width: 600, frames: [{ id: "payment", title: "Payment" }] };
const twins: CanvasRow[] = [{ path: ".doan/canvases/x.html", id: "dup", url: "u-x" }, { path: ".doan/canvases/y.html", id: "dup", url: "u-y" }];
const listA = (canvases: CanvasRow[] = [drafts, checkout, ...twins]): FolderEntry => ({ path: "/w/a", kind: "list", servedRev: 0, canvases });
const HOME = { screen: "home", expanded: {}, lastByRoot: {}, home: {} };
const flushAll = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); render(); };
type Chips = { onCanvasChip(canvas: Canvas): Promise<unknown> };
const panelChip = (canvas: Canvas) => find<Chips>(CanvasConversation)[0]!.props.onCanvasChip(canvas);
const overviewChip = (canvas: Canvas) => find<Chips>(ProjectOverview)[0]!.props.onCanvasChip(canvas);
type OpenOptions = { opened(): void; unavailable(entry: FolderEntry | undefined): void };
const lastOpen = () => harness.controller!.openCanvas!.mock.lastCall as [string, CanvasRow, unknown, OpenOptions];
const back = () => (all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar")!.props as { back: boolean }).back;

// /w/a's Overview, entered from Home.
async function overview(extra: FolderEntry[] = [], list = listA()) {
  render();
  readUiState(HOME); await Promise.resolve(); await Promise.resolve(); render();
  folders([list, ...extra]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  await flushAll();
}
// Then Drafts open on the canvas page with its live layout.
async function onDrafts(patch: Record<string, unknown> = {}) {
  await overview();
  showCanvas(drafts, patch);
  await flushAll();
}
function showCanvas(row: CanvasRow, patch: Record<string, unknown> = {}) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: row.path, row }, shown: row.path, status: null, message: "",
    layout: { frames: [{ id: "editor", title: "Editor (live)", x: 0, y: 0, width: 10, height: 10 }], width: 600 }, ...patch });
  render();
}

const ref = (row: CanvasRow) => ({ path: row.path, id: row.id! });

test("the canvas panel and the Overview both hand their threads and composers the canvas chip press", async () => {
  await onDrafts();
  expect(find<Chips>(CanvasConversation)[0]!.props.onCanvasChip).toBeTypeOf("function");
  find<{ overview(root: string): void }>(ShellSidebar)[0]!.props.overview("/w/a");
  harness.setState!({ ...initialCanvasState() }); render();
  await flushAll();
  expect(find<Chips>(ProjectOverview)[0]!.props.onCanvasChip).toBeTypeOf("function");
});

test("another canvas's chip opens it as a deep link does: the canvas alone, one visit for Back, no toast", async () => {
  await onDrafts();
  clearController();
  expect(back()).toBe(false);
  await expect(panelChip(ref(checkout))).resolves.toBeNull();
  render();
  const [root, row, to, options] = lastOpen();
  expect([root, row.path, to]).toEqual(["/w/a", C, undefined]);
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  options.opened(); render();
  expect(harness.controller!.destination).toHaveBeenCalledWith("/w/a");
  expect(back()).toBe(true);
  for (const name of ["locate", "command"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// The id decides, not the chip's path: a canvas moved since the chip was made opens at its row now.
test("a chip opens the row its id names now, whatever path it carries", async () => {
  await onDrafts();
  clearController();
  void panelChip({ path: ".doan/canvases/old-checkout.html", id: "checkout" });
  expect(lastOpen().slice(0, 2)).toEqual(["/w/a", checkout]);
});

test("the chip of the canvas on screen fits its board, with no move and no visit", async () => {
  await onDrafts();
  clearController();
  const backBefore = back();
  await expect(panelChip(ref(drafts))).resolves.toBeNull();
  render();
  expect(harness.controller!.command).toHaveBeenCalledExactlyOnceWith("fit");
  for (const name of ["openCanvas", "locate", "destination", "showOverview", "openWorkspace"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  expect(back()).toBe(backBefore);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// The note beside the chip says it; a toast would say it twice.
test("a chip whose canvas is gone settles missing for its note, with no toast and no move", async () => {
  await onDrafts();
  clearController();
  await expect(panelChip({ path: ".doan/canvases/billing.html", id: "billing" })).resolves.toBe("missing");
  expect(harness.toast.show).not.toHaveBeenCalled();
  for (const name of ["openCanvas", "locate", "command"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
});

test("a shared id, or a list being read or with a problem, shows one toast and moves nowhere", async () => {
  await overview();
  const name = find<{ project: string }>(ProjectOverview)[0]!.props.project;
  clearController();
  const toasts = async (canvas: Canvas, text: string) => {
    harness.toast.show.mockClear();
    await expect(overviewChip(canvas)).resolves.toBeNull();
    expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(text);
  };
  await toasts({ path: ".doan/canvases/x.html", id: "dup" }, `Couldn’t open x. More than one canvas in ${name} uses this ID. Run doan check in a terminal to find them.`);
  folders([{ path: "/w/a", kind: "loading" }]);
  await toasts(ref(drafts), `${name} is still being read. Try again shortly.`);
  folders([{ path: "/w/a", kind: "notFound" }]);
  await toasts(ref(drafts), `${name} isn’t available. Fix it from its menu in the sidebar.`);
  for (const method of ["openCanvas", "locate", "command", "showOverview", "openWorkspace"]) expect(harness.controller![method], method).not.toHaveBeenCalled();
});

// The Overview covers the canvas it came from, so that canvas's chip opens it again instead of fitting a board nobody sees.
test("the Overview's chips open their canvas, the one it last showed included", async () => {
  await onDrafts();
  find<{ overview(root: string): void }>(ShellSidebar)[0]!.props.overview("/w/a");
  harness.setState!({ ...initialCanvasState() }); render();
  await flushAll();
  clearController();
  void overviewChip(ref(drafts));
  expect(lastOpen().slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: D }), undefined]);
  expect(harness.controller!.command).not.toHaveBeenCalled();
});

test("a chip looks only in its conversation's root: another worktree's canvas with that id is missing here", async () => {
  await overview([{ path: "/w/b", kind: "list", servedRev: 0, canvases: [checkout] }], listA([drafts]));
  clearController();
  await expect(overviewChip(ref(checkout))).resolves.toBe("missing");
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
});
