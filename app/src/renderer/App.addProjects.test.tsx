import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";

// buzz-add-projects U1–U3 (and T1's App cases): App's own navigation functions, driven with hooks as plain state so the
// page's entry, return, lock and completion run through the real App code (ShellSidebar.interaction.test.tsx style).
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
}));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./CanvasController", async original => ({
  ...await original<typeof import("./CanvasController")>(),
  CanvasController: class {
    constructor() {
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "showOverview", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate", "dropPendingLocate"]) self[name] = vi.fn();
      // The guarded moves report arrival at once, as when no draft guard is up.
      self.openWorkspace = vi.fn((root: string, done: (root: string) => void) => done(root));
      self.destination = vi.fn((root: string) => ({ root }));
      self.currentView = vi.fn(() => ({ scale: 1, x: 0, y: 0 }));
      self.memory = vi.fn(() => ({}));
      harness.controller = self;
    }
  },
}));
vi.mock("./thumbnails", () => ({ useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { AddProjectsPage } = await import("./AddProjectsPage");
const { ShellSidebar } = await import("./ShellSidebar");
const { QuickOpen } = await import("./QuickOpenDialog");
const { Home } = await import("./Home");
const { HomeRun } = await import("./homeRun");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const rowB: CanvasRow = { path: ".doan/canvases/b.html", id: "b", url: "u-b" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA, rowB] });
let listeners: Record<string, (...args: never[]) => void>;
let windowListeners: Record<string, (event: never) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; windowListeners = {};
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), onOpenAddProjects: on("openAddProjects"),
    // buzz-settings: App also listens for Settings…, notification clicks and sign-in changes, and reads preferences.
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}), onAgentAuth: on("agentAuth"), onAgentSignInPrompt: on("prompt"), readPreferences: vi.fn(async () => null),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [] });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
});
afterEach(() => vi.unstubAllGlobals());

function render(): ReactNode {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
    tree = App();
    // React would attach the canvas pane's DOM nodes before the controller's effect.
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
const page = () => find<{ onState(state: { locked: boolean; choose: boolean }): void; onCancel(): void; onAdded(root: string): void; header: ReactElement; sidebar: ReactElement<{ home: boolean; locked?: boolean } & Record<string, (...args: never[]) => void>>; choose: number }>(AddProjectsPage)[0];
const homeEl = () => find<{ select: { root: string } | null; addProjects(): void; sidebar: ReactElement<{ highlight?: readonly string[] }> }>(Home)[0];
function topBar(header: ReactElement) {
  const bar = (header.type as (props: unknown) => ReactNode)(header.props);
  const buttons = all(bar).filter(element => element.type === "button");
  const text = (button: ReactElement<Record<string, unknown>>) => [button.props["aria-label"], ...[button.props.children].flat()].filter(item => typeof item === "string");
  const named = (label: string) => buttons.find(button => text(button).includes(label));
  return { back: named("Back")!, forward: named("Forward")!, add: named("Add Projects")!, projects: named("Projects")! };
}
const workspaceHeader = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar" && !all(page()?.props.header).includes(element))!;
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
function onPage() { return page() !== undefined; }
const click = (element: ReactElement<Record<string, unknown>>) => { (element.props.onClick as () => void)(); render(); };

// From a workspace on /w/a, open the page with the header tab.
function openFromWorkspace() {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  const sidebar = find<{ worktree(root: string): void }>(ShellSidebar)[0]!;
  sidebar.props.worktree("/w/a"); render();
  expect(onPage()).toBe(false);
  click(topBar(workspaceHeader()).add);
  expect(onPage()).toBe(true);
  for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear();
}
function lock() { page()!.props.onState({ locked: true, choose: false }); render(); }

test("the header tab opens the page: Add Projects is the current page, the sidebar marks no row, the menu knows the screen", () => {
  openFromWorkspace();
  const bar = topBar(page()!.props.header);
  expect(bar.add.props["aria-current"]).toBe("page");
  expect(bar.projects.props["aria-current"]).toBeUndefined();
  expect(bar.forward.props.disabled).toBe(true);
  expect(bar.back.props.disabled).toBe(false);
  expect(page()!.props.sidebar.props.home).toBe(true);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "addProjects", modal: false, toast: false, choose: true });
  // Reopening from the page does nothing; File > Add Project… there runs Choose folder.
  const seq = page()!.props.choose;
  click(bar.add);
  expect(page()!.props.choose).toBe(seq);
  listeners.openAddProjects!(); render();
  expect(page()!.props.choose).toBe(seq + 1);
});

test("Projects tab, Back, Cancel and Escape return to the origin workspace without a history visit", async () => {
  for (const leave of [() => click(topBar(page()!.props.header).projects), () => click(topBar(page()!.props.header).back), () => { page()!.props.onCancel(); render(); },
    () => { windowListeners.keydown!({ key: "Escape", target: { tagName: "BUTTON" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render(); }]) {
    beforeEachReset();
    openFromWorkspace();
    // Saves start once Home's memory is read.
    readUiState(null); await Promise.resolve(); await Promise.resolve(); render();
    expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "workspace", root: "/w/a" });
    leave();
    expect(onPage()).toBe(false);
    expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
    // The workspace's Back still has nowhere to go: the page made no visit.
    expect(topBar(workspaceHeader()).back.props.disabled).toBe(true);
    expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "workspace", root: "/w/a" });
  }
});
function beforeEachReset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  doan.saveUiState!.mockClear();
}

test("Escape in a field, during an IME composition or under an open dialog stays on the page", () => {
  openFromWorkspace();
  for (const event of [{ target: { tagName: "INPUT" }, isComposing: false, keyCode: 27 }, { target: { tagName: "BUTTON" }, isComposing: true, keyCode: 27 }, { target: { tagName: "BUTTON" }, isComposing: false, keyCode: 229 }]) {
    windowListeners.keydown!({ key: "Escape", preventDefault: vi.fn(), ...event } as never); render();
    expect(onPage()).toBe(true);
  }
  find<{ search(): void }>(ShellSidebar).at(-1)!.props.search(); render();
  windowListeners.keydown!({ key: "Escape", target: { tagName: "BUTTON" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render();
  expect(onPage()).toBe(true);
});

test("the page is not saved: a restart restores the origin, and opening the page cancels a pending startup restore", async () => {
  render();
  folders([listed("/w/a")]);
  click(topBar(workspaceHeader()).add);
  readUiState({ screen: "workspace", root: "/w/a", expanded: {}, lastByRoot: {}, home: {} });
  await Promise.resolve(); await Promise.resolve();
  render();
  expect(onPage()).toBe(true);
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
  expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "home" });
});

test("while the page is locked every way out is ignored, one case per navigation function", () => {
  const moves: [string, () => void][] = [
    ["Projects tab", () => click(topBar(page()!.props.header).projects)],
    ["header Back (leavePage back)", () => click(topBar(page()!.props.header).back)],
    ["Escape", () => { windowListeners.keydown!({ key: "Escape", target: { tagName: "BUTTON" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render(); }],
    ["Go > Home (home)", () => { listeners.menu!("home" as never); render(); }],
    ["Quick Open menu", () => { listeners.menu!("quickOpen" as never); render(); }],
    ["Search (search)", () => { page()!.props.sidebar.props.search!(); render(); }],
    ["project row (toggleProject)", () => { page()!.props.sidebar.props.toggle!("/w/b" as never); render(); }],
    ["worktree item (enter)", () => { page()!.props.sidebar.props.worktree!("/w/b" as never); render(); }],
    ["canvas row (openShellCanvas)", () => { (page()!.props.sidebar.props.open as (root: string, row: CanvasRow) => void)("/w/b", rowA); render(); }],
    ["Overview item (showShellOverview)", () => { page()!.props.sidebar.props.overview!("/w/b" as never); render(); }],
    ["Home send's move (HomeRun openOverview)", () => { const host = (hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as { host: { openOverview(root: string, arrived: () => boolean, unavailable: () => void): void } }).host; host.openOverview("/w/b", () => true, vi.fn()); render(); }],
    ["Home run's canvas (HomeRun openCanvas)", () => { const host = (hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as { host: { openCanvas(root: string, row: CanvasRow): void } }).host; host.openCanvas("/w/b", rowA); render(); }],
  ];
  for (const [name, move] of moves) {
    beforeEachReset();
    openFromWorkspace();
    lock();
    expect(page()!.props.sidebar.props.locked, name).toBe(true);
    move();
    expect(onPage(), name).toBe(true);
    for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method], `${name}: ${method}`).not.toHaveBeenCalled();
    expect(find(QuickOpen), name).toHaveLength(0);
  }
  // Quick Open already open when the lock came: its pick is ignored too.
  beforeEachReset();
  openFromWorkspace();
  page()!.props.sidebar.props.search!(); render();
  lock();
  find<{ pick(result: unknown): void }>(QuickOpen)[0]!.props.pick({ kind: "canvas", root: "/w/b", path: rowA.path }); render();
  expect(onPage()).toBe(true);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
});

test("the lock shows on the header tabs and Back, and reaches the menu", () => {
  openFromWorkspace();
  lock();
  const bar = topBar(page()!.props.header);
  for (const button of [bar.add, bar.projects, bar.back]) expect(button.props["aria-disabled"]).toBe(true);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "addProjects", modal: false, toast: false, locked: true });
  page()!.props.onState({ locked: false, choose: false }); render();
  expect(topBar(page()!.props.header).projects.props["aria-disabled"]).toBeUndefined();
  click(topBar(page()!.props.header).projects);
  expect(onPage()).toBe(false);
});

test("a Quick Open pick from the page goes through the controller's canvas-level guard, same canvas or not", () => {
  for (const row of [rowB, rowA]) {
    beforeEachReset();
    openFromWorkspace();
    page()!.props.sidebar.props.search!(); render();
    find<{ pick(result: unknown): void }>(QuickOpen)[0]!.props.pick({ kind: "canvas", root: "/w/a", path: row.path }); render();
    expect(harness.controller!.openCanvas).toHaveBeenCalledWith("/w/a", row, undefined, expect.objectContaining({ opened: expect.any(Function) }));
  }
});

test("a sidebar row leaves the page for its workspace", () => {
  openFromWorkspace();
  page()!.props.sidebar.props.toggle!("/w/a" as never);
  render();
  expect(onPage()).toBe(false);
  openFromWorkspaceAgain();
  (page()!.props.sidebar.props.open as (root: string, row: CanvasRow) => void)("/w/b", rowA);
  expect(harness.controller!.openCanvas).toHaveBeenCalledWith("/w/b", rowA, undefined, expect.anything());
});
function openFromWorkspaceAgain() { click(topBar(workspaceHeader()).add); expect(onPage()).toBe(true); }

test("a finished add goes Home and chooses the root once the folder list has it, highlighting its row", () => {
  openFromWorkspace();
  page()!.props.onAdded("/w/new"); render();
  expect(onPage()).toBe(false);
  // The registration answered before the folder list: nothing is chosen yet, and nothing else is chosen instead.
  expect(homeEl()!.props.select).toBeNull();
  folders([listed("/w/a"), listed("/w/b"), listed("/w/new")]);
  expect(homeEl()!.props.select).toMatchObject({ root: "/w/new" });
  expect(homeEl()!.props.sidebar.props.highlight).toEqual(["/w/new"]);
  // An already registered folder is chosen at once.
  beforeEachReset();
  openFromWorkspace();
  page()!.props.onAdded("/w/b"); render();
  expect(homeEl()!.props.select).toMatchObject({ root: "/w/b" });
});

test("a finished add leaves even though the page reported its select as locked", () => {
  openFromWorkspace();
  lock();
  page()!.props.onAdded("/w/b"); render();
  expect(onPage()).toBe(false);
});

test("with a modal open the three entry points do nothing", () => {
  render();
  folders([listed("/w/a")]);
  find<{ search(): void }>(ShellSidebar)[0]!.props.search(); render();
  expect(find(QuickOpen)).toHaveLength(1);
  const header = find<{ header: ReactElement }>(Home)[0]!.props.header;
  click(topBar(header).add);
  listeners.openAddProjects!(); render();
  homeEl()!.props.addProjects(); render();
  expect(onPage()).toBe(false);
  // Without the modal the composer's Add Projects… opens the page.
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  render();
  homeEl()!.props.addProjects(); render();
  expect(onPage()).toBe(true);
});

test("the window takes no file drop: dragover and drop only prevent the default, unless a target already took it", () => {
  render();
  const event = (defaultPrevented: boolean) => ({ defaultPrevented, preventDefault: vi.fn(), dataTransfer: { types: ["Files"], dropEffect: "copy" } });
  for (const name of ["dragover", "drop"]) {
    const free = event(false);
    windowListeners[name]!(free as never);
    expect(free.preventDefault).toHaveBeenCalled();
    expect(free.dataTransfer.dropEffect).toBe("none");
    const taken = event(true);
    windowListeners[name]!(taken as never);
    expect(taken.dataTransfer.dropEffect).toBe("copy");
  }
});

// Conductor decision on design '잠금' ('펼치기' is allowed): while locked a project row still expands and collapses;
// only the move to its workspace is ignored, whether by click or by keyboard activation (both call toggle).
test("while locked a project row's disclosure still expands and collapses, without leaving the page", () => {
  openFromWorkspace();
  lock();
  const expanded = () => (page()!.props.sidebar.props as unknown as { projects: Record<string, { expanded: boolean }> }).projects["/w/b"]?.expanded;
  page()!.props.sidebar.props.toggle!("/w/b" as never); render();
  expect(expanded()).toBe(true);
  page()!.props.sidebar.props.toggle!("/w/b" as never); render();
  expect(expanded()).toBe(false);
  // The loaded project's row is its workspace; activating it while locked does nothing.
  page()!.props.sidebar.props.toggle!("/w/a" as never); render();
  expect(onPage()).toBe(true);
  for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method]).not.toHaveBeenCalled();
  expect(doan.readShellActivity).not.toHaveBeenCalled();
});

// review-BU1 🟡1: a move started on the page before the lock must not land after it.
test("locking cancels a workspace open still waiting for its project's read", () => {
  openFromWorkspace();
  let pending: (() => void) | null = null;
  harness.controller!.openWorkspace!.mockImplementation((root: string, done: (root: string) => void) => { pending = () => done(root); });
  // The controller drops its waiting open on cancelWorkspaceOpen; the held callback stands for that wait.
  harness.controller!.cancelWorkspaceOpen!.mockImplementation(() => { pending = null; });
  page()!.props.sidebar.props.worktree!("/w/b" as never); render();
  expect(pending).not.toBeNull();
  expect(onPage()).toBe(true);
  lock();
  (pending as (() => void) | null)?.();
  render();
  expect(onPage()).toBe(true);
});

test("locking supersedes a project row still reading its worktrees' activity", async () => {
  openFromWorkspace();
  let answer: (value: unknown) => void = () => {};
  doan.readShellActivity!.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
  page()!.props.sidebar.props.toggle!("/w/b" as never); render();
  lock();
  answer([]); await Promise.resolve(); await Promise.resolve(); render();
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
  expect(onPage()).toBe(true);
});

// review-BU1 🟡2: only file drags are refused; text and links still reach fields that take them.
test("text and link drags are left to the window's fields", () => {
  render();
  for (const type of ["text/plain", "text/uri-list"]) for (const name of ["dragover", "drop"]) {
    const event = { defaultPrevented: false, preventDefault: vi.fn(), dataTransfer: { types: [type], dropEffect: "copy" } };
    windowListeners[name]!(event as never);
    expect(event.preventDefault, `${type} ${name}`).not.toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe("copy");
  }
});

// Conductor decision ⚪3: a focused radio (the candidates list) is not editing; an open tooltip closes first.
test("Escape on a focused radio leaves the page, and an open tooltip takes the Escape first", () => {
  openFromWorkspace();
  windowListeners.keydown!({ key: "Escape", target: { tagName: "INPUT", type: "radio" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render();
  expect(onPage()).toBe(false);
  beforeEachReset();
  openFromWorkspace();
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: (selector: string) => selector.includes('[role="tooltip"]') ? {} : null, querySelectorAll: () => [] });
  windowListeners.keydown!({ key: "Escape", target: { tagName: "BUTTON" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render();
  expect(onPage()).toBe(true);
});
