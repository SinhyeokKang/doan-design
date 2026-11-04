import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry, GitInfo } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { WorkItem } from "../main/workState";
import { initialCanvasState } from "./CanvasController";
import type { ShellProject } from "../restore/uiState";

// PRODUCT §5 item 1: an auto-registered worktree that is not a list is hidden everywhere the
// group's worktrees show, its registration and removal move nothing, and the worktree on screen that vanishes or hides
// hands the screen to the worktree selected before it (else the main checkout) instead of going Home. Hooks run as plain
// state so App's own wiring runs (App.terminalWork.test.tsx).
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
const { Home, ProblemActions } = await import("./Home");
const { ProjectSettingsPage } = await import("./ProjectSettingsPage");

const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let getWork: (items: WorkItem[]) => void;
let calls: string[];
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; calls = [];
  harness.toast.show.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { calls.push(`on:${name}`); listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
    markCanvasSeen: vi.fn(async () => {}),
    onWorkChanged: on("work"), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(() => { calls.push("getWork"); return new Promise(resolve => { getWork = resolve; }); }),
    onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => { calls.push("openLinksReady"); }), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
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
type Sidebar = { cards: { key: string; rows: { path: string }[] }[]; projects: Record<string, ShellProject>; loaded: string | null; worktree(root: string): void; projectSettings(root: string): void };
const sidebar = () => (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as Sidebar);
const topBar = () => all(tree).find(element => "forward" in element.props && "previous" in element.props)!.props as { back: boolean; forward: boolean };
const home = () => all(tree).find(element => element.type === Home)?.props as { entries: FolderEntry[] } | undefined;
const projectPage = () => all(tree).find(element => element.type === ProjectSettingsPage)?.props as { root: string; entries: FolderEntry[] } | undefined;
const problem = () => all(tree).find(element => element.type === ProblemActions)?.props as { entry: FolderEntry } | undefined;
const controller = () => harness.controller!;

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html", C = ".doan/canvases/c.html";
const MAIN = "/w/a", OTHER = "/w/b", W = "/w/wt", KEY = "/w/.git";
const git = (branch: string): GitInfo => ({ common: KEY, main: MAIN, branch, worktrees: [MAIN, OTHER, W] });
const row = (path: string, root: string): CanvasRow => ({ path, url: `u-${root}-${path}`, mtimeMs: 1 });
const list = (root: string, paths: string[], extra: Partial<FolderEntry> = {}): FolderEntry => ({ path: root, kind: "list", servedRev: 0, git: git(root.split("/").at(-1)!), canvases: paths.map(path => row(path, root)), ...extra } as FolderEntry);
const main = () => list(MAIN, [A, B]), other = () => list(OTHER, [A]), wt = () => list(W, [A, C], { autoRegistered: true });
const hiddenW = (kind: "uninitialized" | "loading" = "uninitialized"): FolderEntry => ({ path: W, kind, lastCommon: KEY, autoRegistered: true });
const folders = (entries: FolderEntry[]) => { listeners.folders!(entries as never); render(); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
// The controller opens a canvas at once, as the real one does for a listed row.
const opensAtOnce = () => controller().openCanvas!.mockImplementation((_root: unknown, _row: unknown, _to: unknown, target?: { opened?: () => void }) => target?.opened?.());
const show = (root: string, path: string) => { harness.setState!({ ...initialCanvasState(), open: { folder: root, canvas: path, row: row(path, root) }, shown: path }); render(); };
const showOverview = () => { harness.setState!(initialCanvasState()); render(); };
const enter = (root: string) => { sidebar().worktree(root); render(); };

async function start(entries: FolderEntry[] = [main(), other(), wt()], restored: unknown = null) {
  render();
  folders(entries);
  readUiState(restored); await flush(); render();
  getWork([]); await flush(); render();
  opensAtOnce();
}

test("registering a worktree for a terminal agent leaves the screen, the selected worktree and Back/Forward as they were", async () => {
  await start([main(), other()]);
  enter(MAIN); enter(OTHER); show(OTHER, A);
  const before = { back: topBar().back, forward: topBar().forward, loaded: sidebar().loaded, selected: sidebar().projects[KEY]?.selectedRoot };
  const calls = { canvas: controller().openCanvas!.mock.calls.length, workspace: controller().openWorkspace!.mock.calls.length, overview: controller().showOverview!.mock.calls.length };
  folders([main(), other(), wt()]);
  expect(sidebar().cards.find(card => card.key === KEY)!.rows.map(row => row.path)).toEqual([MAIN, OTHER, W]);
  expect({ back: topBar().back, forward: topBar().forward, loaded: sidebar().loaded, selected: sidebar().projects[KEY]?.selectedRoot }).toEqual(before);
  expect({ canvas: controller().openCanvas!.mock.calls.length, workspace: controller().openWorkspace!.mock.calls.length, overview: controller().showOverview!.mock.calls.length }).toEqual(calls);
  expect(home()).toBeUndefined();
  expect(before).toEqual({ back: true, forward: false, loaded: OTHER, selected: OTHER });
});

test("the worktree on screen leaving the list opens the same canvas in the worktree selected before it, and forgets the vanished one", async () => {
  await start();
  enter(OTHER); enter(W); show(W, A);
  controller().remember!.mockClear();
  folders([main(), other()]);
  expect(controller().openCanvas!).toHaveBeenLastCalledWith(OTHER, expect.objectContaining({ path: A }), undefined, expect.anything());
  expect(sidebar().loaded).toBe(OTHER);
  expect(home()).toBeUndefined();
  expect(sidebar().projects[KEY]?.selectedRoot).toBe(OTHER);
  expect(controller().remember!).toHaveBeenCalledWith(W, null);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("a canvas the destination does not list opens the destination's Overview", async () => {
  await start();
  enter(MAIN); enter(W); show(W, C);
  folders([main(), other()]);
  expect(controller().openWorkspace!).toHaveBeenLastCalledWith(MAIN, expect.any(Function), false, undefined, true);
  expect(sidebar().loaded).toBe(MAIN);
  expect(home()).toBeUndefined();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("hiding the worktree on screen (it can no longer be read) moves its Overview to the Overview of the worktree selected before", async () => {
  await start();
  enter(OTHER); enter(W); showOverview();
  folders([main(), other(), hiddenW()]);
  expect(controller().openWorkspace!).toHaveBeenLastCalledWith(OTHER, expect.any(Function), false, undefined, true);
  expect(sidebar().loaded).toBe(OTHER);
  expect(home()).toBeUndefined();
  expect(controller().remember!).toHaveBeenCalledWith(W, null);
});

test("without a remembered selection (the worktree was restored at launch), the main checkout takes the screen", async () => {
  await start([main(), other(), wt()], { screen: "workspace", root: W, canvas: A, expanded: {}, lastByRoot: {} });
  expect(sidebar().loaded).toBe(W);
  show(W, A);
  folders([other(), main()]);
  expect(controller().openCanvas!).toHaveBeenLastCalledWith(MAIN, expect.objectContaining({ path: A }), undefined, expect.anything());
  expect(sidebar().loaded).toBe(MAIN);
});

test("the worktree selected before goes on the screen even in a problem state (orch decision 7)", async () => {
  await start();
  enter(OTHER); enter(W); show(W, A);
  folders([main(), { path: OTHER, kind: "uninitialized", lastCommon: KEY }, wt()]);
  const workspaces = controller().openWorkspace!.mock.calls.length;
  folders([main(), { path: OTHER, kind: "uninitialized", lastCommon: KEY }]);
  expect(sidebar().loaded).toBe(OTHER);
  expect(home()).toBeUndefined();
  expect(problem()?.entry.path).toBe(OTHER);
  expect(controller().openWorkspace!.mock.calls.length).toBe(workspaces);
});

test("the Project Settings page of the vanished worktree shows the destination's Project Settings", async () => {
  await start();
  enter(OTHER); enter(W);
  sidebar().projectSettings(W); render();
  expect(projectPage()?.root).toBe(W);
  folders([main(), other()]);
  expect(projectPage()?.root).toBe(OTHER);
  expect(home()).toBeUndefined();
});

test("Remove from Doan of the whole group still goes Home from the auto-registered worktree", async () => {
  await start();
  enter(OTHER); enter(W); show(W, A);
  folders([]);
  expect(home()).toBeDefined();
  expect(sidebar().loaded).toBeNull();
});

test("an auto-registered worktree that is not a list is absent from the group's lists, the problem rows and Home's cards", async () => {
  await start([main(), other(), hiddenW("loading")]);
  const shown = (entries: readonly FolderEntry[] | undefined) => entries?.map(entry => entry.path);
  expect(sidebar().cards.map(card => card.rows.map(row => row.path))).toEqual([[MAIN, OTHER]]);
  expect(shown(home()?.entries)).toEqual([MAIN, OTHER]);
  for (const kind of ["uninitialized", "error", "cliError", "notFound"] as const) {
    folders([main(), other(), { path: W, kind, lastCommon: KEY, autoRegistered: true, ...(kind === "error" ? { message: "bad" } : kind === "cliError" ? { reason: "x" } : {}) } as FolderEntry]);
    expect(sidebar().cards.map(card => card.rows.map(row => row.path))).toEqual([[MAIN, OTHER]]);
    expect(shown(home()?.entries)).toEqual([MAIN, OTHER]);
  }
  // A hand-added worktree keeps its problem row.
  folders([main(), other(), { path: W, kind: "uninitialized", lastCommon: KEY }]);
  expect(sidebar().cards.map(card => card.rows.map(row => row.path))).toEqual([[MAIN, OTHER, W]]);
  // The Project Settings page's worktree list is the group as shown.
  folders([main(), other(), hiddenW()]);
  sidebar().projectSettings(MAIN); render();
  expect(shown(projectPage()?.entries)).toEqual([MAIN, OTHER]);
  // Read again as a list, it shows at the end of the group.
  folders([main(), other(), wt()]);
  expect(sidebar().cards.map(card => card.rows.map(row => row.path))).toEqual([[MAIN, OTHER, W]]);
});

test("a launch restore on an auto-registered worktree waits while it is read, though the row is hidden meanwhile", async () => {
  await start([main(), other(), hiddenW("loading")], { screen: "workspace", root: W, expanded: {}, lastByRoot: {} });
  expect(home()).toBeDefined();
  expect(sidebar().cards.map(card => card.rows.map(row => row.path))).toEqual([[MAIN, OTHER]]);
  folders([main(), other(), wt()]);
  expect(controller().openWorkspace!).toHaveBeenLastCalledWith(W, expect.any(Function));
  expect(sidebar().loaded).toBe(W);
});

// R2 review 🟡1·🟡2: at a restart the auto-registered worktree is `loading`, hidden but not gone. Its remembered canvas
// and the group's saved selection stay until it is read, even when another root is read first.
const loading = (root: string): FolderEntry => ({ path: root, kind: "loading", lastCommon: KEY });
const VIEW = { scale: 0.5, x: 12, y: -40 };
const homeRestore = { screen: "home", expanded: {}, lastByRoot: { [W]: { canvas: A, view: VIEW } }, shellProjects: { [KEY]: { roots: [MAIN, OTHER, W], expanded: true, selectedRoot: W, selectedAt: 5 } } };

test("a Home restore keeps the remembered canvas of an auto-registered worktree read after another root", async () => {
  await start([loading(MAIN), loading(OTHER), hiddenW("loading")], homeRestore);
  expect(controller().remember!).toHaveBeenCalledWith(W, { canvas: A, view: VIEW });
  folders([main(), loading(OTHER), hiddenW("loading")]);
  folders([main(), other(), wt()]);
  // The controller prunes its per-root memory against main's list, which still holds the hidden worktree.
  for (const [, listed] of controller().updateEntries!.mock.calls) expect((listed as FolderEntry[] | undefined)?.map(entry => entry.path)).toContain(W);
  expect(controller().remember!).not.toHaveBeenCalledWith(W, null);
  enter(W);
  expect(controller().openWorkspace!).toHaveBeenLastCalledWith(W, expect.any(Function), false);
  expect(sidebar().loaded).toBe(W);
});

test("a Home restore keeps the group's selected auto-registered worktree while it is read last", async () => {
  await start([main(), other(), hiddenW("loading")], homeRestore);
  expect(sidebar().projects[KEY]?.selectedRoot).toBe(W);
  folders([main(), other(), wt()]);
  expect(sidebar().projects[KEY]?.selectedRoot).toBe(W);
  expect(home()).toBeDefined();
});

// orch decision 10: a page opened from the vanished worktree's workspace leaves for the worktree that took its place,
// as Locate moves the origin (POSTMORTEM 2026-10-25); Remove from Doan of the whole group still leaves for Home.
const leave = () => { (all(tree).find(element => "forward" in element.props && "previous" in element.props)!.props as { previous(): void }).previous(); render(); };
const pages = [
  ["Project Settings", () => { sidebar().projectSettings(W); render(); }],
  ["Add Projects", () => { listeners.openAddProjects!(); render(); }],
  ["Settings", () => { listeners.openSettingsPage!({} as never); render(); }],
] as const;
for (const [name, open] of pages) {
  test(`leaving the ${name} page opened from the vanished worktree's workspace enters the worktree selected before it`, async () => {
    await start();
    enter(OTHER); enter(W); show(W, A);
    open();
    expect(home()).toBeUndefined();
    folders([main(), other()]);
    leave();
    expect(home()).toBeUndefined();
    expect(sidebar().loaded).toBe(OTHER);
    expect(controller().openWorkspace!).toHaveBeenLastCalledWith(OTHER, expect.any(Function), false);
    expect(harness.toast.show).not.toHaveBeenCalled();
  });
  test(`leaving the ${name} page after Remove from Doan of the whole group goes Home`, async () => {
    await start();
    enter(OTHER); enter(W); show(W, A);
    open();
    folders([]);
    leave();
    expect(home()).toBeDefined();
    expect(sidebar().loaded).toBeNull();
  });
}
