import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// App owns the docked buddy: it starts it with the workspace screen, stops it off it, and tells it what only App knows
// (the Overview over the canvas page, the panel folding and folded, a covering overlay, a picking or capture hint, the
// chosen buddy). Driven with hooks as plain state, with App.problemOverlay.test.tsx's harness; the shell is a fake.
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
const docked = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), setBuddy: vi.fn(), update: vi.fn(), dockSlot: () => {}, toolsSlot: () => {} }));
vi.mock("./dockedBuddyShell", () => ({ dockedBuddy: docked }));
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
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onPrototypeTarget: on("prototypeTarget"), readPrototypeTarget: vi.fn(async () => null), setPrototypeDrawing: vi.fn(async () => true), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
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
beforeEach(() => { for (const mock of [docked.start, docked.stop, docked.setBuddy, docked.update]) mock.mockClear(); reset(); });
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
    const main = all(tree).find(element => element.type === "main")?.props.ref as { current: unknown } | undefined;
    if (main && !main.current) main.current = MAIN;
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

type Sidebar = { cards: { key: string; rows: { path: string }[] }[]; overview(root: string): void; goHome?(): void };
const sidebar = () => find<Sidebar>(ShellSidebar)[0]!.props;
const toOverview = (root = "/w/a") => { sidebar().overview(root); render(); };
function canvasOpen(root = "/w/a", patch: Record<string, unknown> = {}) {
  toOverview(root);
  harness.setState!({ ...initialCanvasState(), open: { folder: root, canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 }, ...patch });
  render();
}
const MAIN = { name: "main", querySelector: () => null, style: { setProperty() {} } };
const lastUpdate = () => docked.update.mock.lastCall?.[0] as Record<string, boolean>;
const panel = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "ConversationPanel")!.props as { onHide(): void };

test("the buddy starts with the workspace on <main> and stops when the screen leaves it", () => {
  render(); folders([listed("/w/a")]);
  expect(docked.start).not.toHaveBeenCalled();
  toOverview();
  expect(docked.start).toHaveBeenCalledTimes(1);
  expect(docked.start.mock.lastCall![0]).toBe(MAIN);
  // Its rest follows the canvas page's: the controller's last view move or selection change.
  (harness.controller as Record<string, unknown>).personMovedAt = () => 1234;
  expect((docked.start.mock.lastCall![1] as () => number)()).toBe(1234);
  // A canvas switch and the Overview keep it.
  canvasOpen("/w/a");
  toOverview();
  expect(docked.start).toHaveBeenCalledTimes(1);
  expect(docked.stop).not.toHaveBeenCalled();
  sidebar().goHome!(); render();
  expect(docked.stop).toHaveBeenCalledTimes(1);
});

test("the chosen buddy reaches the shell", async () => {
  render(); await flush();
  expect(docked.setBuddy).toHaveBeenLastCalledWith("doany");
});

test("App tells the buddy about the Overview, the folding panel, a covering overlay and a picking or capture hint", () => {
  vi.useFakeTimers();
  render(); folders([listed("/w/a")]);
  toOverview();
  expect(lastUpdate()).toEqual({ overview: true, folded: false, folding: false, covered: false, hint: false });
  canvasOpen("/w/a");
  expect(lastUpdate()).toEqual({ overview: false, folded: false, folding: false, covered: false, hint: false });
  panel().onHide(); render();
  expect(lastUpdate()).toMatchObject({ folded: false, folding: true });
  vi.advanceTimersByTime(300); render();
  expect(lastUpdate()).toMatchObject({ folded: true, folding: false });
  canvasOpen("/w/a", { picking: true });
  expect(lastUpdate()).toMatchObject({ hint: true });
  canvasOpen("/w/a", { capturing: true });
  expect(lastUpdate()).toMatchObject({ hint: true });
  folders([configError()]);
  expect(lastUpdate()).toMatchObject({ covered: true });
  folders([listed("/w/a")]);
  expect(lastUpdate()).toMatchObject({ covered: false });
});
