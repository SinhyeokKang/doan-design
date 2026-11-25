import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { PlayTool } from "./CanvasTools";

// The toolbar's Play prototype: its state from the selection, the frame drawer it opens, what a pick sends, and the
// prototype window's playing frame in that drawer. Hooks run as plain state.
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "onPicked", "onElementTree", "requestElementTree", "previewElement", "selectElement", "pick", "cancelPick", "onCapture", "startCapture", "cancelCapture", "locate", "dropPendingLocate", "settleFit", "bubblePlayButton", "toolbarEscape"]) self[name] = vi.fn();
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
vi.mock("./thumbnails", () => ({ useThumbnailHub: () => null, useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { initialCanvasState } = await import("./CanvasController");
const { PrototypePlaying } = await import("./PrototypePlaying");
const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
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
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), playPrototype: vi.fn(), onPrototypeClosed: vi.fn(() => () => {}), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
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

const pane = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "CanvasPane")?.props as unknown as { player: PlayTool };
const player = () => pane().player;
const flushAll = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); render(); };
const frame = (id: string, extra: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, width: 10, height: 10, ...extra });
// 0 cart and 2 checkout are linked through cta (1) inside cart; 3 account has no links; 4 notes is not marked.
const FRAMES = [frame("cart", { title: "Cart", prototype: "390x844" }), frame("cta", { parent: 0 }), frame("checkout", { title: "Checkout", prototype: "390x844" }), frame("account", { title: "Account", prototype: "390x844" }), frame("notes")];
const LAYOUT = { type: "layout", href: "u-a", height: 100, viewport: 100, frames: FRAMES, truncated: false, gotos: [{ value: "checkout", frame: 1 }] };
const select = (index: number, element = false) => ({ tag: "section", frame: { id: FRAMES[index]!.id }, frameIndex: index, ...(element ? { element: { selector: "button", html: "<button>" } } : {}), path: [] });
function canvas(patch: Record<string, unknown> = {}) {
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, layout: LAYOUT, selection: null, ...patch });
  render();
}
async function canvasPage(patch: Record<string, unknown> = {}) {
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true } }); await Promise.resolve(); await Promise.resolve(); render();
  folders([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rowA] }]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  canvas(patch);
  await flushAll();
}
const rows = () => player().drawer!.groups.map(group => [group.label, group.rows.map(row => [row.id, row.current])]);

test("with nothing selected Play opens the drawer of playable frames in link groups", async () => {
  await canvasPage();
  expect(player()).toMatchObject({ kind: "drawer", tooltip: "Choose a prototype to play", open: false });
  expect(player().drawer!.label).toBe("Prototype frames in a");
  expect(rows()).toEqual([["Cart and 1 more", [["cart", false], ["checkout", false]]], ["Frames without links", [["account", false]]]]);
});

test("a playable frame, an element in one or an unmarked frame in one plays it, in Select and in Hand", async () => {
  for (const tool of ["select", "hand"] as const) {
    reset();
    await canvasPage({ tool, selection: select(2) });
    expect(player(), tool).toMatchObject({ kind: "play", tooltip: "Play “Checkout”", drawer: null });
    player().onPlay();
    expect(doan.playPrototype, tool).toHaveBeenLastCalledWith({ root: "/w/a", path: rowA.path, frame: "checkout", mark: "390x844" });
    canvas({ tool, selection: select(1) });
    expect(player().tooltip, tool).toBe("Play “Cart”");
    canvas({ tool, selection: select(2, true) });
    expect(player().tooltip, tool).toBe("Play “Checkout”");
    canvas({ tool, selection: select(4) });
    expect(player().kind, tool).toBe("drawer");
  }
});

test("picking and capture make Play unavailable with their reasons and close an open drawer", async () => {
  await canvasPage();
  player().onOpenChange(true); render();
  expect(player().open).toBe(true);
  canvas({ picking: true });
  expect(player()).toMatchObject({ kind: "disabled", tooltip: "Finish picking from the canvas first.", open: false });
  canvas({ picking: false });
  // The drawer does not come back by itself (POSTMORTEM 2026-11-01).
  expect(player()).toMatchObject({ kind: "drawer", open: false });
  canvas({ capturing: true });
  expect(player()).toMatchObject({ kind: "disabled", tooltip: "Finish the capture first." });
});

test("a pick plays the chosen frame only and closes the drawer, leaving the selection, view and tool alone", async () => {
  await canvasPage({ selection: select(4) });
  player().onOpenChange(true); render();
  clearController();
  const account = player().drawer!.groups[1]!.rows[0]!;
  player().drawer!.onPick(account); render();
  expect(doan.playPrototype).toHaveBeenCalledExactlyOnceWith({ root: "/w/a", path: rowA.path, frame: "account", mark: "390x844" });
  expect(player().open).toBe(false);
  for (const name of ["setTool", "openCanvas", "locate", "command", "pick", "startCapture"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  expect(doan.setSelection).not.toHaveBeenCalled();
});

test("the drawer marks the frame the prototype window plays only when it plays this canvas", async () => {
  await canvasPage();
  const onChange = find<{ onChange(playing: unknown): void }>(PrototypePlaying)[0]!.props.onChange;
  onChange({ root: "/w/a", canvas: { id: "a", path: rowA.path }, frame: "checkout" }); render();
  expect(rows()).toEqual([["Cart and 1 more", [["cart", false], ["checkout", true]]], ["Frames without links", [["account", false]]]]);
  onChange({ root: "/w/b", canvas: { id: "a", path: rowA.path }, frame: "checkout" }); render();
  expect(rows().flatMap(([, list]) => list as [string, boolean][]).some(([, current]) => current)).toBe(false);
  onChange(null); render();
  expect(rows().flatMap(([, list]) => list as [string, boolean][]).some(([, current]) => current)).toBe(false);
});
