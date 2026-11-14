import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// `doan remove` took a project's roots out of the list (folders:removed): the window ends in the state the menu's
// Remove from Doan leaves. Driven with hooks as plain state, on the problem overlay's harness (App.problemOverlay.test.tsx).
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
type Sidebar = { cards: { key: string; rows: { path: string }[] }[]; overview(root: string): void; toggle(key: string): void; remove(roots: string[]): void; worktree(root: string): void; projects: Record<string, { roots: string[] }> };
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

const COMMON = "/w/a/.git";
const worktree = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA], git: { common: COMMON, main: "/w/a", branch: path === "/w/a" ? "main" : "fix", worktrees: ["/w/a", "/w/b"] } });
const GROUP = [worktree("/w/a"), worktree("/w/b")];
const removedByCli = (paths: string[]) => { listeners.foldersRemoved!(paths as never); render(); };
const remembered = () => harness.controller!.remember!.mock.calls.filter(([, item]) => item === null).map(([root]) => root as string);

const DRAFT = { segments: [{ kind: "text", text: "half a thought" }], preset: null, attachments: [], shape: "capsule" } as const;
// What both removals must leave alike: sidebar projects, Home, forgotten canvases, Back/Forward history, conversation
// memory as saved, and the Overview drafts.
function windowState() {
  const history = hooks.refs.map(ref => ref.current).find(value => typeof value === "object" && value !== null && Array.isArray(Reflect.get(value, "visits")) && typeof Reflect.get(value, "cursor") === "number");
  const saved = doan.saveUiState!.mock.lastCall?.[0] as { conversationByRoot?: Record<string, string> } | undefined;
  return { projects: sidebar().projects, home: find(Home).length, remembered: [...new Set(remembered())].sort(), history, conversations: saved?.conversationByRoot ?? {}, drafts: [...overviewRun().drafts.keys()].sort() };
}
// The group and another project listed, ui-state read with conversation memory for /w/b and /w/c, /w/c then /w/b
// visited, and an Overview draft on /w/a (no conversation memory), /w/b and /w/c.
async function seeded(memory: Record<string, string> = { "/w/b": "conv-b", "/w/c": "conv-c" }) {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_000_000);
  render(); folders([...GROUP, listed("/w/c")]);
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, shellProjects: {}, conversationByRoot: memory });
  await flush();
  toOverview("/w/c"); toOverview("/w/b");
  expect(overview()?.root).toBe("/w/b");
  overviewRun().setDrafts(drafts => new Map([...drafts, ["root:/w/a", DRAFT as never], ["root:/w/b", DRAFT as never], ["root:/w/c", DRAFT as never]]));
  render();
}
// The group's second worktree open, then the list without the group, as main sends it before folders:removed.
async function cliRemoval() {
  await seeded();
  folders([listed("/w/c")]);
  removedByCli(["/w/a", "/w/b"]);
  await flush();
}
async function menuRemoval() {
  await seeded();
  sidebar().remove(["/w/a", "/w/b"]); render();
  (dialogButton("Remove from Doan").props.onClick as () => void)();
  folders([listed("/w/c")]);
  await flush();
}

test("a CLI removal of the open project's group goes Home, leaves the sidebar and forgets each root's canvas", async () => {
  await cliRemoval();
  expect(overview()).toBeUndefined();
  expect(find(Home)).toHaveLength(1);
  expect(sidebar().cards.flatMap(card => card.rows.map(row => row.path))).toEqual(["/w/c"]);
  expect(remembered()).toEqual(expect.arrayContaining(["/w/a", "/w/b"]));
  // No toast and nothing that asks the person.
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(removalDialog()).toBeUndefined();
});

test("a CLI removal leaves the same window state as the menu's Remove from Doan", async () => {
  await menuRemoval();
  const byMenu = windowState();
  expect(doan.removeProjects).toHaveBeenCalledExactlyOnceWith(["/w/a", "/w/b"]);
  reset();
  await cliRemoval();
  expect(windowState()).toEqual(byMenu);
  expect(byMenu.remembered).toEqual(["/w/a", "/w/b"]);
  expect(byMenu.history).toEqual({ visits: [{ root: "/w/c" }], cursor: 0 });
  expect(byMenu.conversations).toEqual({ "/w/c": "conv-c" });
  expect(byMenu.drafts).toEqual(["root:/w/c"]);
});

test("folders:removed for roots the window's own Remove already tidied changes nothing", async () => {
  await menuRemoval();
  const projects = sidebar().projects, saves = doan.saveUiState!.mock.calls.length;
  removedByCli(["/w/a", "/w/b"]);
  expect(sidebar().projects).toBe(projects);
  expect(doan.saveUiState!.mock.calls.length).toBe(saves);
  expect(find(Home)).toHaveLength(1);
});

test("folders:removed that arrives before the list update tidies the same state", async () => {
  await seeded();
  removedByCli(["/w/a", "/w/b"]);
  // Before the list says so: the removed root's Overview draft and conversation memory are already gone.
  expect([...overviewRun().drafts.keys()]).toEqual(["root:/w/c"]);
  folders([listed("/w/c")]);
  expect(find(Home)).toHaveLength(1);
  expect(Object.values(sidebar().projects).flatMap(project => project.roots)).not.toEqual(expect.arrayContaining(["/w/a"]));
  expect(remembered()).toEqual(expect.arrayContaining(["/w/a", "/w/b"]));
});

// A root with an Overview draft but no conversation memory still loses the draft, as the menu's Remove drops it.
test("folders:removed drops the removed roots' Overview drafts even without conversation memory", async () => {
  await seeded({ "/w/c": "conv-c" });
  removedByCli(["/w/a", "/w/b"]);
  expect([...overviewRun().drafts.keys()]).toEqual(["root:/w/c"]);
});
