import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import { initialCanvasState } from "./CanvasController";

// App gives the sidebar canvas notices from main's `unseen` rows, tells main which canvas the canvas page shows, tells
// read-state failures with a Retry toast, and lets a project row's notice open that canvas. Hooks run as plain state so
// App's own wiring runs (App.sidebarGroups.test.tsx).
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
  toast: { toast: null, element: null, show: vi.fn(), retry: vi.fn(), action: vi.fn(), setModal: vi.fn() },
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setCovered", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "onCapture", "pick", "cancelPick", "locate", "dropPendingLocate"]) self[name] = vi.fn();
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

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html";
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {};
  harness.toast.show.mockClear();
  harness.toast.retry.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onPrototypeTarget: on("prototypeTarget"), readPrototypeTarget: vi.fn(async () => null), setPrototypeDrawing: vi.fn(async () => true), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
    showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: on("readStateProblem"),
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
type Sidebar = { slots?: ReadonlyMap<string, { kind: string }>; toggle(key: string): void; cards: { key: string }[] };
const sidebar = () => (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as Sidebar);
const rows = (a: Partial<CanvasRow>, b: Partial<CanvasRow> = {}): CanvasRow[] => [{ path: A, url: "u-a", mtimeMs: 10, ...a }, { path: B, url: "u-b", mtimeMs: 5, ...b }];
const folders = (canvases: CanvasRow[], extra: FolderEntry[] = []) => { listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases }, ...extra] as never); render(); };
const show = (row: CanvasRow | null) => { harness.setState!({ ...initialCanvasState(), open: row && { folder: "/w/a", canvas: row.path, row }, shown: row?.path ?? null }); render(); };

async function start(canvases: CanvasRow[], extra: FolderEntry[] = [], restored: unknown = null) {
  render();
  folders(canvases, extra);
  readUiState(restored); await Promise.resolve(); await Promise.resolve(); render();
}
const workspace = { screen: "workspace", root: "/w/a", canvas: A, expanded: {}, lastByRoot: {} };

test("an unseen row gets a canvas notice; the canvas page tells main which canvas it shows, once per canvas", async () => {
  await start(rows({ unseen: "changed" }, { unseen: "new" }), [], workspace);
  show(rows({ unseen: "changed" })[0]!);
  expect(sidebar().slots?.get(`/w/a\n${A}`)).toBeUndefined();
  expect(sidebar().slots?.get(`/w/a\n${B}`)?.kind).toBe("canvas");
  expect(doan.showCanvas).toHaveBeenLastCalledWith({ root: "/w/a", path: A });
  const told = doan.showCanvas!.mock.calls.length;
  // A change while shown is main's to prove; the renderer says nothing new.
  folders(rows({ mtimeMs: 12, unseen: "changed" }, { unseen: "new" }));
  expect(doan.showCanvas).toHaveBeenCalledTimes(told);
  show(rows({}, { unseen: "new" })[1]!);
  expect(doan.showCanvas).toHaveBeenLastCalledWith({ root: "/w/a", path: B });
  show(null);
  expect(doan.showCanvas).toHaveBeenLastCalledWith(null);
});

test("the Overview and Home never tell main a canvas is shown", async () => {
  await start(rows({ unseen: "changed" }));
  expect(sidebar().slots?.get(`/w/a\n${A}`)?.kind).toBe("canvas");
  expect(doan.showCanvas).not.toHaveBeenCalled();
});

test("the shown canvas keeps its dot while its read state could not be saved, with the failure's label", async () => {
  await start(rows({ unseen: "changed", saveFailed: "save" }), [], workspace);
  show(rows({})[0]!);
  expect(sidebar().slots?.get(`/w/a\n${A}`)).toEqual({ kind: "canvas", label: "Read state could not be saved for a" });
});

test("a read-state failure found meanwhile is a Retry toast only on its project and canvas; Retry asks main again", async () => {
  await start(rows({ unseen: "changed" }), [], workspace);
  show(rows({})[0]!);
  listeners.readStateProblem!({ root: "/w/b", problem: { kind: "records" } } as never);
  listeners.readStateProblem!({ root: "/w/a", problem: { kind: "save", path: B, readOnly: true } } as never);
  expect(harness.toast.retry).not.toHaveBeenCalled();
  listeners.readStateProblem!({ root: "/w/a", problem: { kind: "save", path: A, readOnly: true } } as never);
  expect(harness.toast.retry).toHaveBeenCalledTimes(1);
  const [message, label, busy, running, attempt] = harness.toast.retry.mock.lastCall! as [string, string, string, string, () => Promise<string | null>];
  expect([message, label, busy, running]).toEqual(["Couldn’t save a’s read state. This folder is read-only.", "Retry", "Saving a’s read state.", "Retrying"]);
  doan.retryReadState!.mockResolvedValueOnce({ kind: "save", path: A, readOnly: false });
  expect(await attempt()).toBe("Couldn’t save a’s read state.");
  expect(doan.retryReadState).toHaveBeenLastCalledWith({ root: "/w/a", path: A });
  doan.retryReadState!.mockResolvedValueOnce(null);
  expect(await attempt()).toBeNull();
});

test("entering a project tries its read state again and tells what still fails, once", async () => {
  doan.retryReadState!.mockResolvedValue({ kind: "baseline", readOnly: true });
  await start(rows({}), [], workspace);
  await Promise.resolve(); await Promise.resolve(); render();
  expect(doan.retryReadState).toHaveBeenCalledWith({ root: "/w/a" });
  expect(harness.toast.retry).toHaveBeenCalledTimes(1);
  expect(harness.toast.retry.mock.lastCall![0]).toBe("Couldn’t save the initial read state. This folder is read-only.");
  folders(rows({ mtimeMs: 20 }));
  await Promise.resolve(); render();
  expect(doan.retryReadState).toHaveBeenCalledTimes(1);
});

// A project row's canvas notice only marks: the row keeps its own move (PRODUCT §5 item 1 'Canvas notice').
test("a loaded project row's canvas notice leaves its move, which opens the Overview over its canvas", async () => {
  await start(rows({}, { unseen: "new" }), [], workspace);
  show(rows({})[0]!);
  const key = sidebar().cards[0]!.key;
  const before = harness.controller!.openCanvas!.mock.calls.length;
  sidebar().toggle(key); render();
  expect(harness.controller!.showOverview).toHaveBeenCalledTimes(1);
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before);
});

test("a collapsed project's canvas notice leaves its move, which opens that project's Overview", async () => {
  const other: FolderEntry = { path: "/w/b", kind: "list", servedRev: 0, canvases: [{ path: B, url: "u-b2", mtimeMs: 3, unseen: "new" }] };
  await start(rows({}), [other], workspace);
  show(rows({})[0]!);
  const key = sidebar().cards.find(card => card.key !== sidebar().cards.find(item => item.key.includes("/w/a"))?.key)!.key;
  expect(sidebar().slots?.get(`/w/b\n${B}`)?.kind).toBe("canvas");
  const before = harness.controller!.openCanvas!.mock.calls.length;
  sidebar().toggle(key); await Promise.resolve(); await Promise.resolve(); render();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/b", expect.any(Function), false, undefined, true);
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before);
});

// Text a user may need to copy (an error reason, the reason a canvas could not load) is selectable; the buttons around it are not.
const classOf = (element: ReactElement<Record<string, unknown>>) => String(element.props.className ?? "").split(" ");
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
// The canvas page is its own component, so it is expanded by hand after App's render.
const canvasPane = () => {
  const pane = all(tree).find(element => "viewport" in element.props)!;
  return all((pane.type as (props: unknown) => ReactNode)(pane.props));
};
const showState = (extra: Record<string, unknown>) => { harness.setState!({ ...initialCanvasState(), ...extra }); render(); };

test("the canvas error notice's text is selectable", async () => {
  await start(rows({}), [], workspace);
  showState({ error: "Couldn’t export: permission denied" });
  const notice = canvasPane().find(element => element.type === "span" && classOf(element).includes("grow-text") && words(element.props.children).includes("permission denied"))!;
  expect(classOf(notice)).toContain("selectable");
});

test.each([
  ["noWidth", "Could not read a valid board width. Set a width on the board."],
  ["plain message", "Open timed out."],
])("the canvas status paragraph for %s is selectable, its Reload button and heading are not", async (name, message) => {
  await start(rows({}), [], workspace);
  showState({ status: name === "noWidth" ? "noWidth" : "empty", message });
  const paragraph = canvasPane().find(element => element.type === "p" && words(element.props.children).includes(message.slice(-10)))!;
  expect(classOf(paragraph)).toContain("selectable");
  expect(canvasPane().filter(element => element.type === "b" || element.type === "button").some(element => classOf(element).includes("selectable"))).toBe(false);
});
