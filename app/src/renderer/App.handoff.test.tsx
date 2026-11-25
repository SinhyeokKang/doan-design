import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { ConversationHandoffNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";

// App's handling of conversation:handoff, with hooks as plain state and a stub controller.
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
// The window's one thumbnail hub, which every viewer of a root shares.
const HUB = vi.hoisted(() => ({ hub: "window" }));
vi.mock("./thumbnails", () => ({ useThumbnailHub: () => HUB, useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { initialCanvasState } = await import("./CanvasController");
const { CanvasRun } = await import("./canvasRun");

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
const handoff = (n: ConversationHandoffNotice = notice) => { listeners.handoff!(n as never); render(); };
type Panel = { arrival: { focus: string } | null; project: string; thumbnailHub?: unknown };
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

// The receiving card and the canvas cards show their canvases' images from the window's hub, as the Overview's list does.
test("the canvas panel's thread and the Overview's get the window's thumbnail hub", async () => {
  await overview();
  expect(overviewProps()!.thumbnailHub).toBe(HUB);
  showCanvas(drafts); await flushAll();
  handoff();
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  lastOpen()[3].opened(); render();
  expect(panel()!.thumbnailHub).toBe(HUB);
});

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
  expect(panel()!.arrival).toMatchObject({ focus: "handoff", handoff: { root: "/w/a", canvas: { path: C, id: "checkout" }, conversationId: "c2" } });
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

// A person's choice while the read is awaited is never replaced by the move (POSTMORTEM 2026-10-26).
test("a panel choice of the person's while the read is awaited turns the move into the toast", async () => {
  await onDrafts(listA([drafts]));
  clearController();
  handoff();
  find<{ run: { select(id: string | null): void } }>(CanvasConversation)[0]!.props.run.select(null); render();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
  folders([listA()]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
});

test("the toast's Open before the list names the target waits for that read, then opens", async () => {
  await overview(listA([drafts]));
  handoff();
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  clearController(); harness.toast.show.mockClear();
  open(); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
  folders([listA()]);
  expect(lastOpen().slice(0, 2)).toEqual(["/w/a", expect.objectContaining({ path: C })]);
});

test("a waiting toast Open is dropped by a later move of the person's", async () => {
  await overview(listA([drafts]));
  handoff();
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  open(); render();
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render(); await flushAll();
  clearController(); harness.toast.show.mockClear();
  folders([listA()]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("typing in the source composer, a draft or an IME composition, keeps the screen and shows the toast", async () => {
  const summary = { conversationId: "c1", title: "Split", owner: "doan", provider: "claude", fromHome: false, canvas: { path: D, id: "drafts" },
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" };
  for (const how of ["composing", "draft"] as const) {
    reset();
    doan.listConversations = vi.fn(async () => [summary]);
    doan.readConversation = vi.fn(async () => ({ events: [], lastSeq: 0, turn: "idle" }));
    await onDrafts();
    const props = find<{ composerLink: { current: unknown }; run: { store: { setDrafts(update: (drafts: Map<string, unknown>) => Map<string, unknown>): void } } }>(CanvasConversation)[0]!.props;
    const inside = {};
    props.composerLink.current = { element: () => ({ contains: (node: unknown) => node === inside }), composing: () => how === "composing", focus: () => {}, insert: () => "inserted" };
    (document as unknown as { activeElement: unknown }).activeElement = inside;
    if (how === "draft") props.run.store.setDrafts(drafts => new Map(drafts).set("conversation:c1", { segments: [{ text: "Make it" }], preset: null, attachments: [], shape: "capsule" }));
    render(); await flushAll();
    clearController();
    handoff();
    expect(harness.controller!.openCanvas, how).not.toHaveBeenCalled();
    expect(harness.toast.show, how).toHaveBeenCalledWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
  }
});

test("an open dialog keeps the screen and shows the toast", async () => {
  await onDrafts();
  (document as unknown as { querySelectorAll(selector: string): unknown[] }).querySelectorAll = selector => selector === "dialog[open]" ? [{}] : [];
  clearController();
  handoff();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
});

test("the move's card focus is dropped once the person leaves the receiving canvas", async () => {
  await onDrafts();
  handoff();
  const options = lastOpen()[3];
  showCanvas(checkout);
  options.opened(); render();
  expect(panel()!.arrival).toMatchObject({ focus: "handoff" });
  showCanvas(drafts); await flushAll();
  expect(panel()!.arrival).toBeNull();
});

test("a toast's Open on a project that can no longer be read answers at once", async () => {
  await overview(listA([drafts]));
  handoff();
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  folders([{ path: "/w/a", kind: "error", message: "unreadable", config: "/w/a/.doan/config.json" }]);
  clearController(); harness.toast.show.mockClear();
  open(); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show.mock.lastCall![0]).not.toMatch(/handed off/);
});

// Several started handoffs of one turn: the screen never moves. On the source canvas page its lines are enough;
// anywhere else one summary toast whose Open goes to the source canvas and its conversation.
const P = ".doan/canvases/payment.html";
const payment: CanvasRow = { path: P, id: "payment", url: "u-p", width: 600, frames: [] };
const multi: HandoffMultiNotice = { root: "/w/a", source: { conversationId: "c1", canvas: { path: D, id: "drafts" } },
  targets: [{ conversationId: "c2", canvas: { path: C, id: "checkout" } }, { conversationId: "c3", canvas: { path: P, id: "payment" } }] };

test("several handoffs on the source canvas page neither move nor toast", async () => {
  await onDrafts(listA([drafts, checkout, payment]));
  clearController();
  handoff(multi);
  folders([listA([drafts, checkout, payment])]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("several handoffs elsewhere show one summary toast whose Open opens the source conversation", async () => {
  await overview(listA([drafts, checkout, payment]));
  clearController();
  handoff(multi);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to 2 canvases", "Open", expect.any(Function));
  const request = vi.spyOn(CanvasRun.prototype, "request");
  try {
    (harness.toast.show.mock.lastCall![2] as () => void)(); render();
    expect(lastOpen().slice(0, 2)).toEqual(["/w/a", expect.objectContaining({ path: D })]);
    expect(request).toHaveBeenCalledWith({ root: "/w/a", canvas: { path: D, id: "drafts" } }, "c1", null);
  } finally { request.mockRestore(); }
});

test("several handoffs on a target canvas page still toast and stay", async () => {
  await onDrafts(listA([drafts, checkout, payment]));
  showCanvas(checkout); await flushAll();
  clearController();
  handoff(multi);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to 2 canvases", "Open", expect.any(Function));
});

test("the summary toast's Open after the source disappeared answers that it couldn't open", async () => {
  await overview(listA([drafts, checkout, payment]));
  showCanvas(drafts); await flushAll();
  const project = panel()!.project;
  find<{ overview(root: string): void }>(ShellSidebar)[0]!.props.overview("/w/a");
  harness.setState!({ ...initialCanvasState() }); render(); await flushAll();
  handoff(multi);
  const open = harness.toast.show.mock.lastCall![2] as () => void;
  folders([listA([checkout, payment])]);
  clearController(); harness.toast.show.mockClear();
  open(); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(`Couldn’t open drafts.html. The canvas isn’t in ${project}.`);
});

test("a single handoff still waiting turns into its toast when a summary arrives", async () => {
  await onDrafts(listA([drafts]));
  clearController();
  handoff();
  handoff(multi);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("drafts.html handed off to checkout-flow.html", "Open", expect.any(Function));
});

// A project conversation's handoff: its source page is the root's Overview showing the source conversation
// (PRODUCT §5 item 2 'Handoff').
const { ProjectOverview } = await import("./ProjectOverview");
type OverviewProps = { root: string; thumbnailHub?: unknown; composerLink: { current: unknown }; run: { view(root: string): { kind: string; conversationId?: string }; select(root: string, id: string | null): void; setDrafts(update: (drafts: Map<string, unknown>) => Map<string, unknown>): void } };
const overviewProps = () => find<OverviewProps>(ProjectOverview)[0]?.props;
const projectConversation = (conversationId: string, minute: number) => ({ conversationId, title: conversationId, owner: "doan", provider: "claude", fromHome: false,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: `2026-11-01T00:0${minute}:00.000Z`, preview: "" });
const fromOverview = { root: "/w/a", source: { conversationId: "c1" }, target: { conversationId: "c2", canvas: { path: C, id: "checkout" } } } as unknown as HandoffNotice;
const multiFromOverview = { root: "/w/a", source: { conversationId: "c1" },
  targets: [{ conversationId: "c2", canvas: { path: C, id: "checkout" } }, { conversationId: "c3", canvas: { path: P, id: "payment" } }] } as unknown as HandoffMultiNotice;
// The Overview of /w/a showing c1, the most recent of its project conversations.
async function onSourceOverview(list = listA([drafts, checkout, payment])) {
  doan.listConversations = vi.fn(async () => [projectConversation("c1", 5), projectConversation("c9", 1)]);
  doan.readConversation = vi.fn(async () => ({ events: [], lastSeq: 0, turn: "idle" }));
  await overview(list);
  await flushAll();
  expect(overviewProps()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
}

test("from the Overview showing its source conversation the handoff moves to the target; Back shows that conversation again", async () => {
  await onSourceOverview();
  const project = overviewProps() && find<{ project: string }>(ProjectOverview)[0]!.props.project;
  clearController();
  handoff(fromOverview);
  expect(harness.toast.show).not.toHaveBeenCalled();
  const [root, row, , options] = lastOpen();
  expect([root, row.path]).toEqual(["/w/a", C]);
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  options.opened(); render();
  expect(panel()!.arrival).toMatchObject({ focus: "handoff", handoff: { root: "/w/a", canvas: { path: C, id: "checkout" }, conversationId: "c2" } });
  expect(back()).toBe(true);
  const top = all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar")!;
  (top.props.previous as () => void)(); render();
  harness.setState!({ ...initialCanvasState() }); render(); await flushAll();
  expect(overviewProps()?.root).toBe("/w/a");
  expect(overviewProps()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
  expect(project).toBeTruthy();
});

test("the same root's Overview showing another conversation, or New, keeps the screen and toasts with the project's name", async () => {
  for (const shown of ["c9", null]) {
    reset();
    await onSourceOverview();
    const project = find<{ project: string }>(ProjectOverview)[0]!.props.project;
    overviewProps()!.run.select("/w/a", shown); render(); await flushAll();
    clearController(); harness.toast.show.mockClear();
    handoff(fromOverview);
    expect(harness.controller!.openCanvas, String(shown)).not.toHaveBeenCalled();
    expect(harness.toast.show, String(shown)).toHaveBeenCalledExactlyOnceWith(`${project} Overview handed off to checkout-flow.html`, "Open", expect.any(Function));
  }
});

test("typing in the Overview composer, or focus in the Conversations list or the header menu, keeps the screen", async () => {
  for (const how of ["draft", "composing", "list", "menu"] as const) {
    reset();
    await onSourceOverview();
    const props = overviewProps()!;
    props.composerLink.current = { element: () => null, composing: () => how === "composing", focus: () => {}, insert: () => "inserted" };
    if (how === "draft") props.run.setDrafts(drafts => new Map(drafts).set("conversation:c1", { segments: [{ text: "Make it" }], preset: null, attachments: [], shape: "capsule" }));
    const selector = how === "list" ? '[role="region"][aria-label="Conversations"]' : how === "menu" ? '[role="menu"][aria-label="Project conversations"]' : null;
    (document as unknown as { activeElement: unknown }).activeElement = { closest: (query: string) => selector && query.split(",").map(part => part.trim()).includes(selector) ? {} : null };
    render(); await flushAll();
    clearController(); harness.toast.show.mockClear();
    handoff(fromOverview);
    expect(harness.controller!.openCanvas, how).not.toHaveBeenCalled();
    expect(harness.toast.show, how).toHaveBeenCalledWith(expect.stringMatching(/ Overview handed off to checkout-flow\.html$/), "Open", expect.any(Function));
  }
});

test("a choice of the person's in the Overview while the target's read is awaited turns the move into the toast", async () => {
  await onSourceOverview(listA([drafts]));
  clearController();
  handoff(fromOverview);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  overviewProps()!.run.select("/w/a", "c9"); render();
  folders([listA([drafts, checkout])]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledWith(expect.stringMatching(/ Overview handed off to checkout-flow\.html$/), "Open", expect.any(Function));
});

test("several handoffs on the Overview showing their source neither move nor toast", async () => {
  await onSourceOverview();
  clearController();
  handoff(multiFromOverview);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("several handoffs elsewhere toast once; Open shows the source conversation in its Overview", async () => {
  await onSourceOverview();
  const project = find<{ project: string }>(ProjectOverview)[0]!.props.project;
  overviewProps()!.run.select("/w/a", "c9"); render();
  showCanvas(payment); await flushAll();
  clearController();
  handoff(multiFromOverview);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(`${project} Overview handed off to 2 canvases`, "Open", expect.any(Function));
  (harness.toast.show.mock.lastCall![2] as () => void)(); render();
  harness.setState!({ ...initialCanvasState() }); render(); await flushAll();
  expect(harness.controller!.showOverview).toHaveBeenCalled();
  expect(overviewProps()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
});

// A problem or reading overlay over the Overview hides the source conversation: the toast comes at once, without the
// wait for the target's read that a move from a visible source page would take.
test("the Overview under a problem overlay is not the source page: the toast comes at once", async () => {
  await onSourceOverview(listA([drafts]));
  folders([{ path: "/w/a", kind: "error", message: "unexpected end of JSON input", config: "/w/a/.doan/config.json" } as FolderEntry]);
  await flushAll();
  clearController(); harness.toast.show.mockClear();
  handoff(fromOverview);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledWith(expect.stringMatching(/ Overview handed off to checkout-flow\.html$/), "Open", expect.any(Function));
});
