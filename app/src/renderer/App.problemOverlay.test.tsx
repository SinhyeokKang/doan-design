import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// A project in a problem state shows its Overview (or the canvas page it was on) under an
// overlay that holds the recovery actions. Driven with hooks as plain state (App.settings.test.tsx); timers are fake
// wherever the 300 ms reading rule or the busy state is involved (POSTMORTEM 2026-10-30).
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
  toast: { toast: null, element: null, show: vi.fn(), showIn: vi.fn(), action: vi.fn(), setModal: vi.fn() },
}));
// The App clock reads document and native visibility, which these harnesses do not stub.
vi.mock("./visibleClock", () => ({ useVisibleClock: () => Date.now() }));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ state: { auth: undefined }, subscribe: () => () => {}, onToast: () => () => {}, windowFocused: vi.fn() }),
}));
vi.mock("./CanvasController", async original => ({
  ...await original<typeof import("./CanvasController")>(),
  CanvasController: class {
    constructor(_viewport: unknown, _board: unknown, _overlay: unknown, setState: (state: unknown) => void) {
      harness.setState = setState;
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "onCapture", "startCapture", "cancelCapture", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
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
const { ProjectOverview } = await import("./ProjectOverview");
const { ProblemOverlay } = await import("./ProblemOverlay");
const { ProjectSetupDialog } = await import("./ProjectSetupDialog");
const { KeyedConversationStrip, ConversationStrip } = await import("./ConversationStripView");
const { HomeRun } = await import("./homeRun");
const { OverviewRun } = await import("./overviewRun");
const { Home } = await import("./Home");
const { initialCanvasState } = await import("./CanvasController");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA] });
const notFound = (path = "/w/a"): FolderEntry => ({ path, kind: "notFound" });
const uninitialized = (path = "/w/a"): FolderEntry => ({ path, kind: "uninitialized" });
const configError = (path = "/w/a", message = "unexpected end of JSON input"): FolderEntry => ({ path, kind: "error", message, config: `${path}/.doan/config.json` });
const cliError = (path = "/w/a"): FolderEntry => ({ path, kind: "cliError", reason: "Unavailable" });
const loading = (path = "/w/a"): FolderEntry => ({ path, kind: "loading" });
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
const HEADING = ".workspace .problem-overlay h2", COMPOSER = ".workspace .ov-main .composer-input", AREA = ".workspace .doan-canvas-panel .area";
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;
let focused: string[];
const BODY = { name: "body" };

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; focused = [];
  harness.toast.show.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
    reopenFolder: vi.fn(async () => {}), revealProject: vi.fn(async () => {}), removeProjects: vi.fn(async () => ({ kind: "removed" })), showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: vi.fn(() => () => {}),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible", paddingRight: "0" }));
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  dom(null);
}
beforeEach(reset);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// A fake element that records its focus; `inside` names the classes of the elements it sits in.
function element(name: string, inside: string[] = [], connected = true) {
  return Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), {
    name, isConnected: connected, focus: () => focused.push(name), matches: () => false, getClientRects: () => [{}], getAttribute: () => null, toggleAttribute: vi.fn(),
    closest: (selector: string) => inside.some(name => selector.includes(name)) ? {} : null,
  });
}
// The document as App reads it: the focused element and the nodes its selectors find (heading, composer, canvas area).
function dom(active: unknown, extra: Record<string, unknown> = {}) {
  const nodes: Record<string, unknown> = { [HEADING]: element("heading", ["problem-overlay", "workspace"]), [COMPOSER]: element("composer", ["ov-main", "workspace"]), [AREA]: element("area", ["doan-canvas-panel", "workspace"]), ...extra };
  vi.stubGlobal("document", { activeElement: active ?? BODY, body: BODY, hasFocus: () => true, querySelector: (selector: string) => nodes[selector] ?? null, querySelectorAll: () => [] });
}

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
function folders(entries: FolderEntry[], focus?: { from: string; root: string }) { listeners.folders!(entries as never, focus as never); render(); }
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); render(); };

type Overlay = { view: { kind: string; entryKind?: string; heading?: string; busy?: boolean; actions?: { name: string }[] }; details: boolean; detail?: string; pressed: string | null; announcement: string; onAction(name: string): void };
const overlay = () => find<Overlay>(ProblemOverlay)[0]?.props;
type Sidebar = { cards: { key: string; rows: { path: string }[] }[]; overview(root: string): void; toggle(key: string): void; remove(roots: string[]): void; worktree(root: string): void };
const sidebar = () => find<Sidebar>(ShellSidebar)[0]!.props;
const keyOf = (root: string) => sidebar().cards.find(card => card.rows.some(row => row.path === root))!.key;
const overview = () => find<{ root: string; unavailable: string | null }>(ProjectOverview)[0]?.props;
const pane = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "CanvasPane");
const homeRun = () => hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as InstanceType<typeof HomeRun>;
const overviewRun = () => hooks.refs.find(ref => ref.current instanceof OverviewRun)!.current as InstanceType<typeof OverviewRun>;
const menuState = () => doan.setMenuState!.mock.lastCall?.[0] as Record<string, unknown>;
const toOverview = (root = "/w/a") => { sidebar().overview(root); render(); };
const clearController = () => { for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear(); };
// A canvas of /w/a open on the canvas page, entered through its Overview.
function canvasOpen(root = "/w/a", patch: Record<string, unknown> = {}) {
  toOverview(root);
  harness.setState!({ ...initialCanvasState(), open: { folder: root, canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 }, ...patch });
  render();
}
const removalDialog = () => all(tree).find(element => element.type === "dialog" && element.props.role === "alertdialog");
const dialogButton = (label: string) => all(removalDialog()!).find(element => element.type === "button" && element.props.children === label)!;

test("an open Overview whose project goes missing stays, under the overlay, with no reason line in its composer", () => {
  render(); folders([listed("/w/a")]);
  toOverview();
  expect(overlay()).toBeUndefined();
  folders([notFound()]);
  expect(overview()?.root).toBe("/w/a");
  expect(overview()?.unavailable).toBeNull();
  expect(overlay()?.view).toMatchObject({ kind: "problem", entryKind: "notFound", heading: "a is missing", busy: false });
  folders([listed("/w/a")]);
  expect(overlay()).toBeUndefined();
});

// The overlay and the Overview it covers are siblings in the workspace grid. With the same key React cannot tell them
// apart: entering a problem project from Home remounted the Overview on every render until the renderer stopped with
// "Maximum update depth exceeded" (found by /design-sync in the real app).
test("the overlay and the Overview under it never share a key", () => {
  render(); folders([notFound()]);
  toOverview();
  const main = all(tree).find(element => element.type === "main")!;
  const keys = all(main.props.children as ReactNode).filter(element => element.key !== null && (element.type === ProjectOverview || element.type === ProblemOverlay)).map(element => element.key);
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(2);
});

test("an open canvas whose project gets a config error keeps the canvas page under the overlay; Missing closes it to the Overview", () => {
  render(); folders([listed("/w/a")]);
  canvasOpen();
  folders([configError()]);
  expect(overview()).toBeUndefined();
  expect(overlay()?.view).toMatchObject({ kind: "problem", entryKind: "error" });
  expect(pane()!.props.covered).toBe(true);
  // The controller closes a canvas whose root went missing (canvasViewUpdate); the Overview takes the body.
  folders([notFound()]);
  harness.setState!({ ...initialCanvasState(), status: "missing", message: "" }); render();
  expect(overview()?.root).toBe("/w/a");
  expect(overlay()?.view).toMatchObject({ entryKind: "notFound" });
});

test("a loaded root moved to another root's problem without a workspace open shows that root's Overview, not the other root's canvas", () => {
  render(); folders([listed("/w/a"), listed("/w/b")]);
  canvasOpen("/w/a");
  folders([uninitialized("/w/b")], { from: "/w/a", root: "/w/b" });
  expect(overview()?.root).toBe("/w/b");
  expect(overlay()?.view).toMatchObject({ entryKind: "uninitialized" });
});

test("a problem project's row and the menu's Overview item open its Overview with the overlay", async () => {
  render(); folders([listed("/w/a"), notFound("/w/b")]);
  toOverview("/w/a");
  clearController();
  sidebar().toggle(keyOf("/w/b")); await flush();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/b", expect.any(Function), false, undefined, true);
  expect(overview()?.root).toBe("/w/b");
  expect(overlay()?.view).toMatchObject({ entryKind: "notFound" });
  listeners.menu!("home" as never); render();
  clearController();
  sidebar().overview("/w/a"); render();
  sidebar().overview("/w/b"); render();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/b", expect.any(Function), false, undefined, true);
  expect(overlay()?.view).toMatchObject({ entryKind: "notFound" });
});

test("the loaded problem project's row: from Home and the canvas page it shows the Overview; over the covered Overview it focuses the heading and asks for no slot", async () => {
  render(); folders([configError("/w/a")]);
  toOverview();
  listeners.menu!("home" as never); render();
  expect(find(Home)).toHaveLength(1);
  sidebar().toggle(keyOf("/w/a")); await flush();
  expect(find(Home)).toHaveLength(0);
  expect(overview()?.root).toBe("/w/a");
  expect(overlay()).toBeDefined();
  // From the canvas page.
  reset(); render(); folders([listed("/w/a")]);
  canvasOpen();
  folders([configError()]);
  clearController();
  sidebar().toggle(keyOf("/w/a")); await flush();
  expect(harness.controller!.showOverview).toHaveBeenCalled();
  // Over the covered Overview.
  reset(); render(); folders([configError()]);
  toOverview();
  dom(element("row", ["shell-side"]));
  focused.length = 0;
  const request = vi.spyOn(overviewRun(), "request");
  vi.spyOn(homeRun(), "slotConversation").mockReturnValue({ conversationId: "c1", waiting: false } as never);
  sidebar().toggle(keyOf("/w/a")); await flush();
  expect(focused).toEqual(["heading"]);
  expect(request).not.toHaveBeenCalled();
});

test("Locate from the overlay opens the located root; a root still in a problem is entered on its Overview", async () => {
  for (const [after, args] of [[listed("/w/moved"), 2], [uninitialized("/w/moved"), 5]] as const) {
    reset(); render(); folders([notFound()]);
    toOverview();
    let finish: (value: unknown) => void = () => {};
    doan.locateProject = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    clearController();
    overlay()!.onAction("locate"); render();
    expect(doan.locateProject).toHaveBeenCalledWith("/w/a");
    folders([after], { from: "/w/a", root: "/w/moved" });
    finish({ kind: "located", root: "/w/moved" }); await flush();
    const call = harness.controller!.openWorkspace!.mock.lastCall!;
    expect(call[0]).toBe("/w/moved");
    expect(call.length, after.kind).toBe(args);
    if (args === 5) expect(call[4]).toBe(true);
    expect(overview()?.root).toBe("/w/moved");
    if (args === 5) expect(overlay()?.view).toMatchObject({ kind: "problem", entryKind: "uninitialized" });
    else expect(overlay()).toBeUndefined();
  }
});

test("a Set Up from the overlay that succeeds removes the overlay and puts focus in the composer", () => {
  render(); folders([uninitialized()]);
  toOverview();
  const button = element("setUp", ["problem-overlay", "workspace"]);
  dom(button);
  overlay()!.onAction("setUp"); render();
  expect(find<{ root: string }>(ProjectSetupDialog)[0]?.props.root).toBe("/w/a");
  focused.length = 0;
  Object.assign(button, { isConnected: false });
  dom(BODY);
  folders([listed("/w/a")]);
  expect(find(ProjectSetupDialog)).toHaveLength(0);
  expect(overlay()).toBeUndefined();
  expect(focused.at(-1)).toBe("composer");
});

test("Remove from Doan on the overlay asks first, then goes Home from the Overview and from the canvas page", async () => {
  for (const onCanvas of [false, true]) {
    reset(); render(); folders([listed("/w/a"), listed("/w/c")]);
    if (onCanvas) canvasOpen(); else toOverview();
    folders([configError("/w/a"), listed("/w/c")]);
    overlay()!.onAction("showInFinder");
    expect(doan.revealProject).toHaveBeenCalledWith("/w/a");
    folders([cliError("/w/a"), listed("/w/c")]);
    overlay()!.onAction("remove"); render();
    expect(removalDialog(), String(onCanvas)).toBeDefined();
    (dialogButton("Remove from Doan").props.onClick as () => void)(); await flush();
    expect(doan.removeProjects).toHaveBeenCalledWith(["/w/a"]);
    folders([listed("/w/c")]);
    expect(find(Home), String(onCanvas)).toHaveLength(1);
  }
});

test("heading focus: on entry; not from the sidebar, where the live region reads the heading; again when the kind changes; from the covered body", () => {
  render(); folders([notFound()]);
  dom(element("row", ["shell-side"]));
  toOverview();
  expect(focused).toEqual(["heading"]);
  // Focus left in the sidebar stays there; the polite live region reads the new heading.
  focused.length = 0;
  folders([uninitialized()]);
  expect(focused).toEqual([]);
  expect(overlay()!.announcement.trim()).toBe("a isn’t set up");
  // Focus inside the overlay follows a kind change to the new heading.
  dom(element("heading", ["problem-overlay", "workspace"]));
  folders([cliError()]);
  expect(focused).toEqual(["heading"]);
  // Focus in the body the overlay covers moves to the heading.
  reset(); render(); folders([listed("/w/a")]);
  toOverview();
  dom(element("composer", ["ov-main", "workspace"]));
  folders([configError()]);
  expect(focused).toEqual(["heading"]);
});

test("heading focus waits while the Remove alert or the Set Up form is open", async () => {
  render(); folders([listed("/w/a"), listed("/w/c")]);
  toOverview();
  dom(element("composer", ["ov-main", "workspace"]));
  sidebar().remove(["/w/c"]); render();
  expect(removalDialog()).toBeDefined();
  folders([cliError("/w/a"), listed("/w/c")]);
  expect(focused).toEqual([]);
  (removalDialog()!.props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render();
  expect(focused.at(-1)).toBe("heading");
  // The Set Up form of another root.
  reset(); render(); folders([listed("/w/a"), uninitialized("/w/c")]);
  toOverview();
  dom(element("composer", ["ov-main", "workspace"]));
  overlayLessSetUp("/w/c");
  folders([cliError("/w/a"), uninitialized("/w/c")]);
  expect(focused).toEqual([]);
  find<{ onClose(): void }>(ProjectSetupDialog)[0]!.props.onClose(); render();
  expect(focused.at(-1)).toBe("heading");
});
function overlayLessSetUp(root: string) { (find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action)("setUp", root); render(); }

test("recovery: Retry keeps the scene busy through loading, past 300 ms; the same kind keeps Details and its text; another kind moves focus and closes Details", () => {
  vi.useFakeTimers();
  render(); folders([configError("/w/a", "first message")]);
  toOverview();
  overlay()!.onAction("details"); render();
  expect(overlay()).toMatchObject({ details: true, detail: "first message" });
  const retry = element("retry", ["problem-overlay", "workspace"]);
  dom(retry);
  focused.length = 0;
  overlay()!.onAction("retry"); render();
  expect(doan.reopenFolder).toHaveBeenCalledWith("/w/a");
  folders([loading()]);
  expect(overlay()).toMatchObject({ view: { kind: "problem", entryKind: "error", busy: true }, details: true, detail: "first message", pressed: "retry" });
  vi.advanceTimersByTime(400); render();
  expect(overlay()?.view).toMatchObject({ kind: "problem", busy: true });
  // Busy actions do nothing.
  overlay()!.onAction("showInFinder");
  expect(doan.revealProject).not.toHaveBeenCalled();
  folders([configError("/w/a", "second message")]);
  expect(overlay()).toMatchObject({ view: { entryKind: "error", busy: false }, details: true, detail: "second message" });
  expect(overlay()!.announcement.trim()).toBe("Doan couldn’t read a’s configuration");
  expect(focused).toEqual([]);
  overlay()!.onAction("retry"); render();
  folders([loading()]);
  folders([cliError()]);
  expect(overlay()).toMatchObject({ view: { entryKind: "cliError", busy: false }, details: false });
  expect(focused).toEqual(["heading"]);
});

test("CLI error: Details shows the CLI's reason and stays open with the last one through a Retry of the same kind", () => {
  render(); folders([{ path: "/w/a", kind: "cliError", reason: "first reason" }]);
  toOverview();
  expect(overlay()).toMatchObject({ details: false, detail: "first reason" });
  overlay()!.onAction("details"); render();
  expect(overlay()).toMatchObject({ details: true, detail: "first reason" });
  overlay()!.onAction("retry"); render();
  folders([loading()]);
  expect(overlay()).toMatchObject({ view: { entryKind: "cliError", busy: true }, details: true, detail: "first reason" });
  folders([{ path: "/w/a", kind: "cliError", reason: "second reason" }]);
  expect(overlay()).toMatchObject({ view: { entryKind: "cliError", busy: false }, details: true, detail: "second reason" });
  folders([configError("/w/a", "config message")]);
  expect(overlay()).toMatchObject({ view: { entryKind: "error" }, details: false });
});

// The sidebar's project menu and the Overview's repair menu reach App's `action`, which shows Details in the toast.
test("menu Details shows a Config error's message or a CLI error's reason in the toast", () => {
  render(); folders([configError("/w/a", "config message"), { path: "/w/b", kind: "cliError", reason: "The doan command exited with code 2 without a message." }, listed("/w/c")]);
  const action = find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action;
  action("details", "/w/a");
  expect(harness.toast.show).toHaveBeenLastCalledWith("config message");
  action("details", "/w/b");
  expect(harness.toast.show).toHaveBeenLastCalledWith("The doan command exited with code 2 without a message.");
  harness.toast.show.mockClear();
  action("details", "/w/c");
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// The toast draws its message as a text node, so markup and line breaks reach it as the reason's own characters.
test("menu Details passes a CLI error's markup or multi-line reason to the toast unchanged", () => {
  const reason = "doan: <img src=x onerror=alert(1)>\nsecond line & more";
  render(); folders([{ path: "/w/a", kind: "cliError", reason }, listed("/w/c")]);
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("details", "/w/a");
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(reason);
});

test("reading: a list read within 300 ms shows nothing and moves no focus; past 300 ms the reading panel shows; a problem read shows at once", () => {
  vi.useFakeTimers();
  render(); folders([listed("/w/a")]);
  toOverview();
  dom(element("composer", ["ov-main", "workspace"]));
  folders([loading()]);
  vi.advanceTimersByTime(299); render();
  expect(overlay()).toBeUndefined();
  folders([listed("/w/a")]);
  vi.advanceTimersByTime(300); render();
  expect(overlay()).toBeUndefined();
  expect(focused).toEqual([]);
  folders([loading()]);
  vi.advanceTimersByTime(300); render();
  expect(overlay()?.view).toEqual({ kind: "reading", label: "Reading project" });
  expect(focused).toEqual([]);
  folders([notFound()]);
  expect(overlay()?.view).toMatchObject({ kind: "problem", entryKind: "notFound" });
  // Straight from loading to a problem, before 300 ms.
  folders([listed("/w/a")]);
  folders([loading()]);
  folders([configError()]);
  expect(overlay()?.view).toMatchObject({ kind: "problem", entryKind: "error", busy: false });
});

// The covered Overview's inert comes off in the same commit the overlay goes; focus must reach the composer
// after it, not the sidebar row. The fake DOM keeps the inert state its toggle sets, and focus falls to the page only
// because the overlay (and the Retry button in it) left the tree (POSTMORTEM 2026-10-24).
test("Retry that clears the problem lands focus in the Overview's composer once it is no longer inert", () => {
  render(); folders([configError()]);
  toOverview();
  const ovMain = Object.assign(element("ov-main"), { inert: false });
  ovMain.toggleAttribute = ((_name: string, on: boolean) => { ovMain.inert = on; return on; }) as never;
  const composer = Object.assign(element("composer", ["ov-main", "workspace"]), {
    closest: (selector: string) => selector === "[inert]" ? (ovMain.inert ? ovMain : null) : ["ov-main", "workspace"].some(name => selector.includes(name)) ? {} : null,
  });
  const retry = element("retry", ["problem-overlay", "workspace"]);
  Object.defineProperty(retry, "isConnected", { get: () => overlay() !== undefined });
  const row = element("row", ["shell-side", "workspace"]);
  const nodes: Record<string, unknown> = { [HEADING]: element("heading", ["problem-overlay", "workspace"]), [COMPOSER]: composer };
  vi.stubGlobal("document", { get activeElement() { return overlay() ? retry : BODY; }, body: BODY, hasFocus: () => true, querySelector: (selector: string) => nodes[selector] ?? null,
    querySelectorAll: (selector: string) => selector.includes(".ov-main") ? [ovMain] : selector.includes("treeitem") ? [row] : [] });
  render();
  expect(ovMain.inert).toBe(true);
  overlay()!.onAction("retry"); render();
  folders([loading()]);
  focused.length = 0;
  folders([listed("/w/a")]);
  expect(overlay()).toBeUndefined();
  expect(ovMain.inert).toBe(false);
  expect(focused).toEqual(["composer"]);
});

// Esc's steps reach no covered canvas.
test("the overlay tells the controller its canvas is covered, and not once it goes", () => {
  render(); folders([listed("/w/a")]);
  canvasOpen();
  expect(harness.controller!.setCovered).toHaveBeenLastCalledWith(false);
  folders([configError()]);
  expect(harness.controller!.setCovered).toHaveBeenLastCalledWith(true);
  folders([listed("/w/a")]);
  expect(harness.controller!.setCovered).toHaveBeenLastCalledWith(false);
});

// A press that ends without a busy phase leaves no spinner for a later read the person did not start.
test("a Retry that settles without a read, or a cancelled Remove, leaves no pressed action for a later busy scene", async () => {
  vi.useFakeTimers();
  render(); folders([configError()]);
  toOverview();
  overlay()!.onAction("retry"); render();
  expect(overlay()?.pressed).toBe("retry");
  await flush();
  expect(overlay()?.pressed).toBeNull();
  overlay()!.onAction("remove"); render();
  (removalDialog()!.props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render();
  folders([loading()]);
  expect(overlay()).toMatchObject({ view: { busy: true }, pressed: null });
});

test("when the problem clears with focus in the overlay, focus goes to the composer or the canvas area, not the page body", () => {
  render(); folders([configError()]);
  toOverview();
  dom(BODY);
  focused.length = 0;
  folders([listed("/w/a")]);
  expect(focused.at(-1)).toBe("composer");
  reset(); render(); folders([listed("/w/a")]);
  canvasOpen();
  folders([configError()]);
  dom(BODY);
  focused.length = 0;
  folders([listed("/w/a")]);
  expect(overlay()).toBeUndefined();
  expect(focused.at(-1)).toBe("area");
  // Focus the person left in the sidebar stays.
  reset(); render(); folders([configError()]);
  toOverview();
  dom(element("row", ["shell-side"]));
  focused.length = 0;
  folders([listed("/w/a")]);
  expect(focused).toEqual([]);
});

test("Details closes when the root or the problem kind changes", () => {
  render(); folders([configError("/w/a"), configError("/w/b")]);
  toOverview("/w/a");
  overlay()!.onAction("details"); render();
  expect(overlay()?.details).toBe(true);
  overlay()!.onAction("details"); render();
  expect(overlay()?.details).toBe(false);
  overlay()!.onAction("details"); render();
  folders([cliError("/w/a"), configError("/w/b")]);
  folders([configError("/w/a"), configError("/w/b")]);
  expect(overlay()?.details).toBe(false);
  overlay()!.onAction("details"); render();
  toOverview("/w/b");
  expect(overlay()?.details).toBe(false);
  toOverview("/w/a");
  expect(overlay()?.details).toBe(false);
});

test("while the overlay shows, the menu has no canvas items, V and H and view commands do nothing, a pick or capture ends, and nothing covered is seen", () => {
  render(); folders([listed("/w/a")]);
  canvasOpen("/w/a", { picking: true, capturing: true });
  expect(menuState()).toMatchObject({ screen: "canvas" });
  const visit = vi.spyOn(homeRun(), "visit");
  clearController();
  folders([configError()]);
  expect(visit).not.toHaveBeenCalled();
  expect(menuState()).toEqual({ screen: "workspace", modal: false });
  expect(harness.controller!.setCanvasPage).toHaveBeenLastCalledWith(false);
  expect(harness.controller!.cancelPick).toHaveBeenCalled();
  expect(harness.controller!.cancelCapture).toHaveBeenCalled();
  listeners.view!("zoomIn" as never);
  expect(harness.controller!.command).not.toHaveBeenCalled();
  // Gone, the seen rules apply again.
  folders([listed("/w/a")]);
  expect(visit).toHaveBeenCalled();
  // The covered Overview: no overview menu state, and its thread is not shown as seen.
  reset(); render(); folders([listed("/w/a")]);
  toOverview();
  expect(menuState()).toMatchObject({ overview: true });
  const show = vi.spyOn(overviewRun(), "show");
  folders([notFound()]);
  expect(menuState()).toEqual({ screen: "workspace", modal: false });
  expect(show).toHaveBeenLastCalledWith(null);
  folders([listed("/w/a")]);
  expect(show).toHaveBeenLastCalledWith("/w/a");
});

test("covered elements the overlay's parent does not draw are made inert, and given back", () => {
  render(); folders([listed("/w/a")]);
  toOverview();
  const covered = element("ov-main");
  vi.stubGlobal("document", { activeElement: BODY, body: BODY, hasFocus: () => true, querySelector: () => null, querySelectorAll: (selector: string) => selector.includes(".ov-main") ? [covered] : [] });
  folders([notFound()]);
  expect(covered.toggleAttribute).toHaveBeenLastCalledWith("inert", true);
  expect(find<{ inert?: boolean }>("div").find(element => (element.props as { className?: string }).className === "right-stack")?.props.inert).toBe(true);
  folders([listed("/w/a")]);
  expect(covered.toggleAttribute).toHaveBeenLastCalledWith("inert", false);
});

test("a problem workspace keeps the conversation strip over the overlay without its Open", () => {
  render(); folders([listed("/w/a")]);
  toOverview();
  vi.spyOn(homeRun(), "strip").mockReturnValue({ conversation: { conversationId: "c1", root: "/w/a", provider: "codex", phase: "ended", canvas: rowA.path }, state: { kind: "done" } } as never);
  render();
  expect(find(KeyedConversationStrip)).toHaveLength(0);
  folders([notFound()]);
  const strip = find<{ view: { actions: { command: string }[] } }>(KeyedConversationStrip)[0];
  expect(strip).toBeDefined();
  expect(strip!.props.view.actions.map(action => action.command)).toEqual(["dismiss"]);
  folders([listed("/w/a")]);
  expect(find(KeyedConversationStrip)).toHaveLength(0);
});

test("over the overlay the strip's Stop and permission answers still reach their handlers", () => {
  render(); folders([listed("/w/a")]);
  toOverview();
  doan.interruptConversation = vi.fn(async () => {});
  doan.answerConversationPermission = vi.fn(async () => {});
  vi.spyOn(homeRun(), "strip").mockReturnValue({ conversation: { conversationId: "c1", root: "/w/a", provider: "codex", phase: "waiting" },
    state: { kind: "permission", requestId: "r1", summary: "Edit a.html", options: [{ id: "allow", label: "Allow", kind: "allow" }] } } as never);
  folders([notFound()]);
  expect(overlay()).toBeDefined();
  const strip = find<Parameters<typeof ConversationStrip>[0]>(KeyedConversationStrip)[0]!;
  const buttons = all(ConversationStrip(strip.props) as ReactNode).filter(element => element.type === "button");
  const press = (label: string) => (buttons.find(button => [button.props.children].flat(2).includes(label))!.props.onClick as () => void)();
  press("Allow");
  expect(doan.answerConversationPermission).toHaveBeenCalledWith({ conversationId: "c1", requestId: "r1", optionId: "allow" });
  press("Stop");
  expect(doan.interruptConversation).toHaveBeenCalledWith({ conversationId: "c1" });
});

test("a re-read shorter than 300 ms does not flash the strip in; the reading panel brings it", () => {
  vi.useFakeTimers();
  render(); folders([listed("/w/a")]);
  toOverview();
  vi.spyOn(homeRun(), "strip").mockReturnValue({ conversation: { conversationId: "c1", root: "/w/a", provider: "codex", phase: "working" }, state: { kind: "working", activity: null } } as never);
  folders([loading()]);
  expect(find(KeyedConversationStrip)).toHaveLength(0);
  folders([listed("/w/a")]);
  expect(find(KeyedConversationStrip)).toHaveLength(0);
  folders([loading()]);
  vi.advanceTimersByTime(300); render();
  expect(overlay()?.view.kind).toBe("reading");
  expect(find(KeyedConversationStrip)).toHaveLength(1);
});

test("a launch whose saved root is a problem stays Home; the Overview composer's draft outlives the overlay", async () => {
  render();
  readUiState({ screen: "workspace", root: "/w/a", expanded: {}, lastByRoot: {}, home: {} }); await flush();
  folders([notFound()]);
  expect(find(Home)).toHaveLength(1);
  expect(overlay()).toBeUndefined();
  reset(); render(); folders([listed("/w/a")]);
  toOverview();
  const store = overviewRun().store;
  store.setDrafts(drafts => new Map(drafts).set("new:/w/a", { segments: [{ kind: "text", text: "keep me" }], preset: null, attachments: [] } as never));
  folders([notFound()]);
  folders([listed("/w/a")]);
  expect(store.drafts.get("new:/w/a")).toMatchObject({ segments: [{ text: "keep me" }] });
});

// Also the Home run's move, Back/Forward, and the canvas status left by a closed canvas.
test("a Home send's move into a problem root lands on its Overview with the overlay and focuses the heading, not the inert composer", () => {
  render(); folders([notFound()]);
  dom(BODY);
  vi.spyOn(homeRun(), "takeFocus").mockReturnValue("composer");
  const unavailable = vi.fn();
  const host = (homeRun() as unknown as { host: { openOverview(root: string, arrived: () => boolean, unavailable: () => void): void } }).host;
  host.openOverview("/w/a", () => true, unavailable); render();
  expect(unavailable).not.toHaveBeenCalled();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/a", expect.any(Function), false, expect.any(Function), true);
  expect(overview()?.root).toBe("/w/a");
  expect(overlay()).toBeDefined();
  expect(focused).toContain("heading");
  expect(focused).not.toContain("composer");
});

test("Back to a project now in a problem enters its Overview with the overlay instead of a toast; a canvas visit goes to the Overview", () => {
  for (const visitCanvas of [false, true]) {
    reset(); render(); folders([listed("/w/a"), listed("/w/b")]);
    if (visitCanvas) { harness.controller!.openCanvas!.mockImplementation((_root: string, _row: CanvasRow, _to: unknown, done: { opened(): void }) => done.opened()); sidebar().worktree("/w/a"); render(); (find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open)("/w/a", rowA); render(); }
    else toOverview("/w/a");
    toOverview("/w/b");
    folders([configError("/w/a"), listed("/w/b")]);
    clearController();
    const top = all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar")!;
    (top.props.previous as () => void)(); render();
    expect(harness.toast.show).not.toHaveBeenCalled();
    expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
    expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/a", expect.any(Function), false, undefined, true);
    expect(overview()?.root).toBe("/w/a");
    expect(overlay()?.view).toMatchObject({ entryKind: "error" });
  }
});

test("a canvas closed for a missing or not set up root leaves no empty canvas status block", () => {
  render(); folders([listed("/w/a")]);
  canvasOpen();
  folders([notFound()]);
  harness.setState!({ ...initialCanvasState(), status: "missing", message: "" }); render();
  const blocks = all((pane()!.type as (props: unknown) => ReactNode)(pane()!.props)).filter(element => element.props.className === "canvas-status");
  expect(blocks).toEqual([]);
  // A message still shows.
  harness.setState!({ ...initialCanvasState(), status: "missing", message: "a.html is no longer in the list. It was deleted or moved." }); render();
  expect(all((pane()!.type as (props: unknown) => ReactNode)(pane()!.props)).filter(element => element.props.className === "canvas-status")).toHaveLength(1);
});
