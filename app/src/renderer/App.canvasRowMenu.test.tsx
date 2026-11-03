import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { WorkItem } from "../main/workState";
import { initialCanvasState } from "./CanvasController";
import type { CanvasMenu } from "./ShellSidebar";
import type { TrashDialogView } from "./CanvasTrashDialog";

// canvas-row-menu design 'Alert Dialog', '삭제 뒤 화면' and '앱 Export 흐름': App owns the Move to Trash dialog and the
// Export flow the sidebar's canvas row menu starts. Hooks run as plain state so App's own wiring runs
// (App.terminalWork.test.tsx).
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
  trash: { begin: vi.fn((folder: string, path: string) => ({ folder, path })), settle: vi.fn() },
  signIn: { onToast: null as null | ((toast: { text: string; action: { label: string; target: unknown } | null }) => void), windowFocused: vi.fn() },
}));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
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
      (self as Record<string, unknown>).trash = harness.trash;
      harness.controller = self;
    }
  },
}));
vi.mock("./thumbnails", () => ({ useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { CanvasTrashDialog } = await import("./CanvasTrashDialog");

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html";
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
  harness.toast.show.mockClear(); harness.trash.begin.mockClear(); harness.trash.settle.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { calls.push(`on:${name}`); listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
    markCanvasSeen: vi.fn(async () => {}),
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(() => { calls.push("getWork"); return new Promise(resolve => { getWork = resolve; }); }),
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
type Sidebar = { canvasMenu: CanvasMenu; slots?: ReadonlyMap<string, { kind: string; label: string; source?: string }>; cards: { key: string; rows: { path: string }[] }[]; toggle(key: string, notice?: { root: string; path: string }): void; goHome(): void; projects: Record<string, { expanded: boolean }> };
const sidebar = () => (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as Sidebar);
const rows = (): CanvasRow[] => [{ path: A, url: "u-a", mtimeMs: 10 }, { path: B, url: "u-b", mtimeMs: 5 }];
const folders = (extra: FolderEntry[] = []) => { listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: rows() }, ...extra] as never); render(); };
const show = (row: CanvasRow) => { harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: row.path, row }, shown: row.path }); render(); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const item = (path: string, root = "/w/a"): WorkItem => ({ session: "s1", provider: "codex", root, path });
const workspace = { screen: "workspace", root: "/w/a", canvas: A, expanded: {}, lastByRoot: {} };

async function start(restored: unknown = workspace) {
  render();
  folders();
  readUiState(restored); await flush(); render();
}

type Dialog = { view: TrashDialogView; cancel(): void; confirm(): void };
const dialog = () => all(tree).find(element => element.type === CanvasTrashDialog)?.props as unknown as Dialog | undefined;
const row = (path = A) => rows().find(item => item.path === path)!;
// A menu button focus can go back to, as focusCurrent checks it.
function button(focused: string[], connected = true) {
  return Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), {
    isConnected: connected, focus: () => focused.push("a menu"), matches: () => false, getClientRects: () => [{}],
    closest: (selector: string) => selector === ".workspace" ? {} : null,
  }) as unknown as HTMLElement;
}
type Plan = { kind: "ready"; comments: boolean } | { kind: "refused"; reason: string };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function openDialog(focused: string[] = []) {
  await start();
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  const plan = deferred<Plan>();
  doan.planCanvasTrash = vi.fn(() => plan.promise);
  sidebar().canvasMenu.trash("/w/a", row(), button(focused)); render();
  return plan;
}

test("Move to Trash opens a modal confirmation that waits for main's plan; Cancel changes nothing and focus goes back to the button", async () => {
  const focused: string[] = [];
  const plan = await openDialog(focused);
  expect(doan.planCanvasTrash).toHaveBeenCalledWith("/w/a", A);
  expect(dialog()!.view).toMatchObject({ title: "Move “a” to Trash?", confirmable: false });
  expect(dialog()!.view.body).not.toContain("comments");
  // App's modal: the toast timer holds and the native menus see it.
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(true);
  expect(doan.setMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ modal: true }));
  plan.resolve({ kind: "ready", comments: true }); await flush(); render();
  expect(dialog()!.view).toMatchObject({ confirmable: true });
  expect(dialog()!.view.body).toContain("and its comments");
  dialog()!.cancel(); render();
  expect(dialog()).toBeUndefined();
  expect(focused).toEqual(["a menu"]);
  expect(doan.trashCanvas).toBeUndefined();
  expect(harness.trash.begin).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(false);
});

test("a plan that lands after its dialog closed opens nothing", async () => {
  const plan = await openDialog();
  dialog()!.cancel(); render();
  plan.resolve({ kind: "refused", reason: "notListed" }); await flush(); render();
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test.each([
  [{ kind: "trashed", comments: "trashed" }, "Moved “a” to Trash.", "trashed"],
  [{ kind: "trashed", comments: "failed", file: ".doan/comments/a.jsonl" }, "Moved “a” to Trash, but its comments couldn’t be moved. They stay at .doan/comments/a.jsonl.", "trashed"],
  [{ kind: "refused", reason: "busy" }, "Couldn’t move “a” to Trash. An agent started working on it.", "refused"],
  [{ kind: "refused", reason: "notFile" }, "Couldn’t move “a” to Trash. It isn’t a regular file.", "refused"],
] as const)("confirming closes the dialog at once, marks the trash before the request and shows the reply's one toast: %j", async (reply, toast, settled) => {
  const focused: string[] = [];
  const plan = await openDialog(focused);
  plan.resolve({ kind: "ready", comments: false }); await flush(); render();
  const answer = deferred<unknown>();
  doan.trashCanvas = vi.fn(() => { calls.push("trashCanvas"); return answer.promise; });
  harness.trash.begin.mockImplementation((folder: string, path: string) => { calls.push("begin"); return { folder, path }; });
  dialog()!.confirm(); render();
  expect(dialog()).toBeUndefined();
  expect(focused).toEqual(["a menu"]);
  expect(calls.slice(-2)).toEqual(["begin", "trashCanvas"]);
  expect(doan.trashCanvas).toHaveBeenCalledWith("/w/a", A);
  expect(harness.trash.settle).not.toHaveBeenCalled();
  answer.resolve(reply); await flush(); render();
  expect(harness.trash.settle).toHaveBeenCalledWith({ folder: "/w/a", path: A }, settled);
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show).toHaveBeenCalledWith(toast);
});

test("a move whose request fails lifts the mark and says to try again", async () => {
  const plan = await openDialog();
  plan.resolve({ kind: "ready", comments: false }); await flush(); render();
  doan.trashCanvas = vi.fn(async () => { throw new Error("ipc"); });
  dialog()!.confirm(); await flush(); render();
  expect(harness.trash.settle).toHaveBeenCalledWith({ folder: "/w/a", path: A }, "refused");
  expect(harness.toast.show).toHaveBeenCalledWith("Couldn’t move “a” to Trash. Try again, or move the file in Finder.");
});

test("a busy plan keeps the dialog with its working line; any other refusal closes it with that refusal's toast", async () => {
  const busy = await openDialog();
  busy.resolve({ kind: "refused", reason: "busy" }); await flush(); render();
  expect(dialog()!.view).toMatchObject({ confirmable: false, reason: "An agent started working on this canvas. Try again when it finishes." });
  expect(harness.toast.show).not.toHaveBeenCalled();
  dialog()!.cancel(); render();
  for (const [plan, toast] of [
    [{ kind: "refused", reason: "notListed" }, "Couldn’t move “a” to Trash. It’s no longer in this project."],
    [{ kind: "refused", reason: "notFile" }, "Couldn’t move “a” to Trash. It isn’t a regular file."],
    [{ kind: "refused", reason: "failed" }, "Couldn’t move “a” to Trash. Try again, or move the file in Finder."],
  ] as const) {
    const answer = deferred<Plan>();
    doan.planCanvasTrash = vi.fn(() => answer.promise);
    sidebar().canvasMenu.trash("/w/a", row(), null); render();
    expect(dialog()).toBeDefined();
    answer.resolve(plan); await flush(); render();
    expect(dialog()).toBeUndefined();
    expect(harness.toast.show).toHaveBeenLastCalledWith(toast);
  }
  // A plan request that fails reads as failed.
  doan.planCanvasTrash = vi.fn(async () => { throw new Error("ipc"); });
  sidebar().canvasMenu.trash("/w/a", row(), null); await flush(); render();
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).toHaveBeenLastCalledWith("Couldn’t move “a” to Trash. Try again, or move the file in Finder.");
});

test("the dialog follows the canvas live: an agent starting holds Move to Trash, the row leaving the list closes it", async () => {
  const plan = await openDialog();
  plan.resolve({ kind: "ready", comments: false }); await flush(); render();
  expect(sidebar().canvasMenu.blocked("/w/a", row())).toBe(false);
  listeners.work!([item(A)] as never); render();
  expect(dialog()!.view).toMatchObject({ confirmable: false, reason: "An agent started working on this canvas. Try again when it finishes." });
  // The same judgement keeps the menu's Move to Trash unavailable; another worktree's work on that path does not.
  expect(sidebar().canvasMenu.blocked("/w/a", row())).toBe(true);
  listeners.work!([item(A, "/w/other")] as never); render();
  expect(dialog()!.view.confirmable).toBe(true);
  // A folder that is being read again keeps the dialog; one that no longer lists the row closes it.
  listeners.folders!([{ path: "/w/a", kind: "loading" }] as never); render();
  expect(dialog()).toBeDefined();
  listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [row(B)] }] as never); render();
  expect(dialog()).toBeUndefined();
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(false);
});

test("Export: the item is unavailable from main's running event to the reply, the progress toast waits a second, and the result offers Show in Finder", async () => {
  await start();
  const answer = deferred<unknown>();
  doan.exportCanvas = vi.fn(() => answer.promise);
  doan.revealExport = vi.fn(async () => {});
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    sidebar().canvasMenu.exportCanvas("/w/a", row()); render();
    expect(doan.exportCanvas).toHaveBeenCalledWith("/w/a", A);
    // The save panel is still open: nothing is running yet.
    expect(sidebar().canvasMenu.exporting("/w/a", A)).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(harness.toast.show).not.toHaveBeenCalled();
    listeners.exportRunning!({ root: "/w/a", path: A } as never); render();
    expect(sidebar().canvasMenu.exporting("/w/a", A)).toBe(true);
    expect(sidebar().canvasMenu.exporting("/w/a", B)).toBe(false);
    vi.advanceTimersByTime(999);
    expect(harness.toast.show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(harness.toast.show).toHaveBeenLastCalledWith("Exporting “a”…");
    // A second request main refuses while this one runs leaves it as it is.
    const second = deferred<unknown>();
    doan.exportCanvas = vi.fn(() => second.promise);
    sidebar().canvasMenu.exportCanvas("/w/a", row()); second.resolve({ kind: "refused", reason: "exporting" }); await flush(); render();
    expect(sidebar().canvasMenu.exporting("/w/a", A)).toBe(true);
    answer.resolve({ kind: "exported", external: 1, reveal: "r1" }); await flush(); render();
    expect(sidebar().canvasMenu.exporting("/w/a", A)).toBe(false);
    expect(harness.toast.show).toHaveBeenLastCalledWith("Exported “a”. Parts of it load from the internet.", "Show in Finder", expect.any(Function));
    (harness.toast.show.mock.lastCall![2] as () => void)();
    expect(doan.revealExport).toHaveBeenCalledWith("r1");
  } finally { vi.useRealTimers(); }
});

test("Export: a fast run shows no progress toast, a cancelled save panel no toast at all, and a failure says why", async () => {
  await start();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    doan.exportCanvas = vi.fn(async () => ({ kind: "failed", reason: "refused", count: 2, first: "../logo.png" }));
    listeners.exportRunning!({ root: "/w/a", path: A } as never); render();
    sidebar().canvasMenu.exportCanvas("/w/a", row()); await flush(); render();
    vi.advanceTimersByTime(2000);
    expect(harness.toast.show).toHaveBeenCalledOnce();
    expect(harness.toast.show).toHaveBeenCalledWith("Couldn’t export “a”. It uses 2 files Doan can’t include, starting with ../logo.png. Ask your agent to fix them.");
    expect(sidebar().canvasMenu.exporting("/w/a", A)).toBe(false);
    doan.exportCanvas = vi.fn(async () => ({ kind: "cancelled" }));
    sidebar().canvasMenu.exportCanvas("/w/a", row()); await flush(); render();
    expect(harness.toast.show).toHaveBeenCalledOnce();
    doan.exportCanvas = vi.fn(async () => { throw new Error("ipc"); });
    sidebar().canvasMenu.exportCanvas("/w/a", row()); await flush(); render();
    expect(harness.toast.show).toHaveBeenLastCalledWith("Couldn’t export “a”. Try again.");
  } finally { vi.useRealTimers(); }
});
