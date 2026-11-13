import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { PrototypeReveal } from "../main/prototype/ipc";
import type { ComposerChoice } from "./rememberChoice";

// The prototype window's chips, Sign in and Open buttons, which main hands the main window once it brought it forward,
// and the prototype composer's Last used. Driven with hooks as plain state and a stub controller, as
// App.replyChips.test.tsx is.
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "onCapture", "pick", "cancelPick", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
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
const { unavailableCanvasMessage } = await import("./quickOpen");
const { SettingsPage } = await import("./SettingsPage");
const { initialCanvasState } = await import("./CanvasController");

const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
let prefs = PREFS;
let dialogs: unknown[] = [];
let listeners: Record<string, (...args: never[]) => void>;
let windowListeners: Record<string, (event: never) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  prefs = PREFS; dialogs = [];
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; windowListeners = {};
  harness.toast.show.mockClear(); harness.toast.showIn.mockClear(); harness.signIn.windowFocused.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), answerOpenRequest: vi.fn(async () => {}), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => prefs), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: vi.fn(() => () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: (selector: string) => selector === "dialog[open]" ? dialogs : [], hasFocus: () => true });
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
type OpenOptions = { opened(): void; unavailable(entry: FolderEntry | undefined): void; located?(outcome: string): void };
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

const reveal = async (request: PrototypeReveal) => { listeners.prototypeReveal!(request as never); await flushAll(); };
const lastUsed = async (choice: ComposerChoice) => { listeners.prototypeLastUsed!(choice as never); await flushAll(); };

test("a person's chip into the canvas on screen locates there, with no move and no visit", async () => {
  await onDrafts();
  harness.controller!.locate!.mockImplementation((_anchor: unknown, settle: (outcome: string) => void) => { settle("shown"); return true; });
  clearController();
  const backBefore = back();
  const anchor = { element: { doanId: "save", selector: "#save", text: "Save" } };
  await reveal({ kind: "chip", root: "/w/a", canvas: { path: D, id: "drafts" }, conversationId: "c1", anchor });
  expect(harness.controller!.locate!.mock.calls[0]![0]).toStrictEqual(anchor);
  for (const name of ["openCanvas", "showOverview", "openWorkspace"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  expect(back()).toBe(backBefore);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("a chip whose target is gone says so in the main window", async () => {
  await onDrafts();
  harness.controller!.locate!.mockImplementation((_anchor: unknown, settle: (outcome: string) => void) => { settle("missing"); return true; });
  await reveal({ kind: "chip", root: "/w/a", canvas: { path: D, id: "drafts" }, conversationId: "c1", anchor: { frame: { id: "gone" } } });
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith("No longer in the canvas");
});

test("a chip into another canvas opens it as a deep link does, then locates the anchor there", async () => {
  await onDrafts();
  clearController();
  const anchor = { point: { frameId: "payment", dx: 4, dy: 8 } };
  await reveal({ kind: "chip", root: "/w/a", canvas: { path: C, id: "checkout" }, conversationId: "c1", anchor });
  const [root, row, to, options] = lastOpen();
  expect([root, row.path, to]).toEqual(["/w/a", C, { anchor }]);
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  options.opened(); render();
  expect(back()).toBe(true);
  options.located!("missing");
  expect(harness.toast.show).toHaveBeenLastCalledWith("No longer in the canvas");
});

test("a chip whose canvas the list does not name shows the canvas-not-found toast", async () => {
  await onDrafts();
  clearController();
  await reveal({ kind: "chip", root: "/w/a", canvas: { path: ".doan/canvases/gone.html", id: "gone" }, conversationId: "c1", anchor: { frame: { id: "x" } } });
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(unavailableCanvasMessage(listA(), ".doan/canvases/gone.html"));
});

test("an open dialog stays open: the toast names the chip and the reason inside it", async () => {
  await onDrafts();
  clearController();
  const dialog = { dispatchEvent: vi.fn() };
  dialogs = [dialog];
  await reveal({ kind: "chip", root: "/w/a", canvas: { path: C, id: "checkout" }, conversationId: "c1", anchor: { frame: { id: "payment", title: "Payment" } } });
  expect(dialog.dispatchEvent).not.toHaveBeenCalled();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.controller!.locate).not.toHaveBeenCalled();
  expect(harness.toast.showIn).toHaveBeenCalledExactlyOnceWith(dialog, "Couldn’t show Payment. A dialog is open. Finish or cancel it, then try again.");
  // Sign in and the Open buttons are held the same way.
  await reveal({ kind: "settings", provider: "codex" });
  expect(harness.toast.showIn).toHaveBeenLastCalledWith(dialog, "Couldn’t show Settings. A dialog is open. Finish or cancel it, then try again.");
  expect(find(SettingsPage)).toHaveLength(0);
});

test("an answer's chip takes the reply chip path", async () => {
  await onDrafts();
  clearController();
  await reveal({ kind: "reply", root: "/w/a", conversationId: "c1", link: { canvas: "checkout", kind: "frame", id: "payment" } });
  const [root, row, to] = lastOpen();
  expect([root, row.path, to]).toEqual(["/w/a", C, { frame: "payment" }]);
});

test("Sign in opens Settings > Agents at the provider, as the panel's Sign in does", async () => {
  await onDrafts();
  await reveal({ kind: "settings", provider: "codex" });
  expect(find<{ section: string }>(SettingsPage)[0]?.props.section).toBe("agents");
});

test("a conversation's Open with a canvas, and a handoff's Open, open that canvas as the panel's Open buttons do", async () => {
  await onDrafts();
  clearController();
  await reveal({ kind: "conversation", root: "/w/a", conversationId: "c7", canvas: { path: C, id: "checkout" } });
  expect(lastOpen()[1].path).toBe(C);
  clearController();
  await reveal({ kind: "handoff", root: "/w/a", canvas: { path: D, id: "drafts" } });
  expect(harness.controller!.openCanvas).toHaveBeenCalled();
  clearController();
  await reveal({ kind: "handoff", root: "/w/a", canvas: { path: ".doan/canvases/gone.html" }, conversationId: "c8" });
  expect(harness.toast.show).toHaveBeenLastCalledWith(unavailableCanvasMessage(listA(), ".doan/canvases/gone.html"));
});

test("a conversation's Open without a canvas shows its root's Overview", async () => {
  await onDrafts();
  harness.controller!.showOverview!.mockClear();
  await reveal({ kind: "conversation", root: "/w/a", conversationId: "p1" });
  expect(harness.controller!.showOverview).toHaveBeenCalled();
});

// POSTMORTEM 2026-11-06: a pick of anything else never fixes what Settings leaves to the provider's default.
describe("Last used from the prototype composer", () => {
  const shapes = [
    { provider: "codex" as const },
    { provider: "codex" as const, model: "gpt-6" },
    { provider: "codex" as const, model: "gpt-6", effort: "high" },
  ];
  test.each(shapes)("a permission pick keeps Settings' fixed model and effort (%o)", async fixed => {
    prefs = { ...PREFS, preferences: { ...PREFS.preferences, newConversation: fixed } };
    await overview();
    doan.savePreferences!.mockClear();
    await lastUsed({ provider: "codex", model: "gpt-6-luna", effort: "low", permissionMode: "plan" });
    expect(doan.savePreferences).toHaveBeenCalledExactlyOnceWith({ newConversation: { ...fixed, permissionMode: "plan" } });
  });

  test("with nothing fixed in Settings only Last used changes", async () => {
    prefs = { ...PREFS, preferences: { ...PREFS.preferences, newConversation: null } } as never;
    await overview();
    doan.savePreferences!.mockClear();
    await lastUsed({ provider: "codex", model: "gpt-6-luna", effort: "low", modelPicked: true });
    expect(doan.savePreferences).not.toHaveBeenCalled();
  });

  test("a picked model of another agent moves a fixed agent to it", async () => {
    await overview();
    doan.savePreferences!.mockClear();
    await lastUsed({ provider: "claude", model: "opus", effort: null, modelPicked: true });
    expect(doan.savePreferences).toHaveBeenCalledExactlyOnceWith({ newConversation: { provider: "claude", model: "opus" } });
  });

  test("Last used is saved with the main window's own ui-state", async () => {
    await overview();
    doan.saveUiState!.mockClear();
    await lastUsed({ provider: "claude", model: "opus", effort: null, modelPicked: true });
    await flushAll();
    const saved = doan.saveUiState!.mock.calls.at(-1)?.[0] as { home?: { lastProvider?: string } } | undefined;
    expect(saved?.home?.lastProvider).toBe("claude");
  });
});
