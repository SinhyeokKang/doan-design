import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { WorkItem } from "../main/workState";
import { initialCanvasState } from "./CanvasController";

// terminal-agent-activity design 'Renderer IPC', '표시' and 'Deep link': App reads main's terminal work list (subscribing
// first), gives it to the sidebar and the canvas page, and opens doan:// links once the launch restore and the first
// folders are in. Hooks run as plain state so App's own wiring runs (App.canvasNotice.test.tsx).
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
  agentSignIn: () => ({ onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
}));
vi.mock("./CanvasController", async original => ({
  ...await original<typeof import("./CanvasController")>(),
  CanvasController: class {
    constructor(_viewport: unknown, _board: unknown, _overlay: unknown, setState: (state: unknown) => void) {
      harness.setState = setState;
      const self = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate"]) self[name] = vi.fn();
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
const { ProjectSettingsDialog } = await import("./ProjectSettingsDialog");

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
    onWorkChanged: on("work"), getWork: vi.fn(() => { calls.push("getWork"); return new Promise(resolve => { getWork = resolve; }); }),
    onOpenLink: on("openLink"), openLinksReady: vi.fn(async () => { calls.push("openLinksReady"); }),
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
    for (const ref of [pane?.viewport, pane?.board, pane?.overlay]) if (ref && !ref.current) ref.current = {};
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
type Sidebar = { slots?: ReadonlyMap<string, { kind: string; label: string; source?: string }>; cards: { key: string; rows: { path: string }[] }[]; toggle(key: string, notice?: { root: string; path: string }): void; goHome(): void; projects: Record<string, { expanded: boolean }> };
const sidebar = () => (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as Sidebar);
const agent = () => (all(tree).find(element => "agent" in (element.props as object))!.props as unknown as { agent: { work: readonly WorkItem[] } }).agent;
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

test("App subscribes to work changes before it reads the list, and a change wins over an older read", async () => {
  render();
  expect(calls.indexOf("on:work")).toBeGreaterThan(-1);
  expect(calls.indexOf("on:work")).toBeLessThan(calls.indexOf("getWork"));
  folders();
  listeners.work!([item(A)] as never); render();
  getWork([]); await flush(); render();
  expect(sidebar().slots?.get(`/w/a\n${A}`)).toEqual({ kind: "working", label: "Codex is working in a terminal", source: "terminal" });
});

test("the read list shows on the sidebar and the canvas page; a change replaces it", async () => {
  await start();
  getWork([item(B)]); await flush(); render();
  expect(sidebar().slots?.get(`/w/a\n${B}`)?.source).toBe("terminal");
  show(rows()[0]!);
  expect(agent().work).toEqual([item(B)]);
  listeners.work!([] as never); render();
  expect(sidebar().slots?.get(`/w/a\n${B}`)).toBeUndefined();
  expect(agent().work).toEqual([]);
});

// RD2: a project row's terminal slot stands for the canvas its session works on, so the click opens that canvas before
// the row's own move, which would re-enter the loaded project's last canvas from Home or fold an expanded project.
test("from Home, the loaded project's terminal slot opens its canvas, not the last one", async () => {
  await start();
  show(rows()[0]!);
  sidebar().goHome(); render();
  listeners.work!([item(B)] as never); render();
  const key = sidebar().cards.find(card => card.rows.some(row => row.path === "/w/a"))!.key;
  const before = harness.controller!.openCanvas!.mock.calls.length;
  sidebar().toggle(key, { root: "/w/a", path: B }); render();
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before + 1);
  expect(harness.controller!.openCanvas).toHaveBeenLastCalledWith("/w/a", expect.objectContaining({ path: B }), undefined, expect.anything());
  // Without a terminal slot the row keeps its move: it goes back to the loaded workspace.
  sidebar().goHome(); render();
  listeners.work!([] as never); render();
  sidebar().toggle(key); render();
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before + 1);
});

test("an expanded project that is not loaded opens its terminal slot's canvas and stays expanded", async () => {
  const other: FolderEntry = { path: "/w/b", kind: "list", servedRev: 0, canvases: [{ path: B, url: "u-b2", mtimeMs: 3 }] };
  render();
  folders([other]);
  readUiState({ ...workspace, shellProjects: { "/w/b": { roots: ["/w/b"], expanded: true } } }); await flush(); render();
  const key = sidebar().cards.find(card => card.rows.some(row => row.path === "/w/b"))!.key;
  expect(sidebar().projects[key]?.expanded).toBe(true);
  listeners.work!([item(B, "/w/b")] as never); render();
  sidebar().toggle(key, { root: "/w/b", path: B }); await flush(); render();
  expect(harness.controller!.openCanvas).toHaveBeenLastCalledWith("/w/b", expect.objectContaining({ path: B }), undefined, expect.anything());
  expect(sidebar().projects[key]?.expanded).toBe(true);
  // Without a terminal slot an expanded project's row folds it.
  listeners.work!([] as never); render();
  const before = harness.controller!.openCanvas!.mock.calls.length;
  sidebar().toggle(key); await flush(); render();
  expect(sidebar().projects[key]?.expanded).toBe(false);
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before);
});

test("App subscribes to links first and says it is ready only after the restore and the first folders", async () => {
  render();
  expect(calls).toContain("on:openLink");
  expect(doan.openLinksReady).not.toHaveBeenCalled();
  folders();
  expect(doan.openLinksReady).not.toHaveBeenCalled();
  readUiState(workspace); await flush(); render();
  expect(doan.openLinksReady).toHaveBeenCalledTimes(1);
  expect(calls.indexOf("on:openLink")).toBeLessThan(calls.indexOf("openLinksReady"));
  // The restore opened its canvas before the link's move can land on top of it.
  expect(harness.controller!.openWorkspace).toHaveBeenCalledWith("/w/a", expect.anything());
  folders(); render();
  expect(doan.openLinksReady).toHaveBeenCalledTimes(1);
});

test("a link opens its canvas as Quick Open does and moves to its frame with no toast when the frame is missing", async () => {
  await start();
  listeners.openLink!({ kind: "navigate", root: "/w/a", canvas: B, frame: "pricing" } as never); render();
  const call = harness.controller!.openCanvas!.mock.lastCall!;
  expect(call.slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: B }), "pricing"]);
  expect(call[3]).not.toHaveProperty("found");
  listeners.openLink!({ kind: "navigate", root: "/w/a", canvas: A } as never); render();
  expect(harness.controller!.openCanvas!.mock.lastCall!.slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: A }), undefined]);
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(doan.setSelection).not.toHaveBeenCalled();
});

test("a refused link shows one toast with its reason and no action, and moves nowhere", async () => {
  await start();
  const before = harness.controller!.openCanvas!.mock.calls.length;
  listeners.openLink!({ kind: "malformed" } as never); render();
  expect(harness.toast.show).toHaveBeenLastCalledWith("Couldn’t open the link. It isn’t a Doan canvas link.");
  listeners.openLink!({ kind: "unregistered-root" } as never); render();
  expect(harness.toast.show).toHaveBeenLastCalledWith("Couldn’t open the link. Its project isn’t in Doan. Add it from Add Projects, then open the link again.");
  listeners.openLink!({ kind: "canvas-not-listed", project: "acme-web" } as never); render();
  expect(harness.toast.show).toHaveBeenLastCalledWith("Couldn’t open the link. The canvas isn’t in acme-web.");
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before);
});

// User decision D7: a link only ever comes from a person's click, so an open dialog is dismissed as Escape or Cancel
// would (its own cancel event), and the link then moves as usual. A dialog that refuses to close keeps the link from
// moving under it.
function openDialog(closes: boolean) {
  const dialog = { open: true, events: [] as { type: string; cancelable: boolean }[], dispatchEvent(event: Event) {
    dialog.events.push({ type: event.type, cancelable: event.cancelable });
    if (closes) { dialog.open = false; (all(tree).find(element => element.type === ProjectSettingsDialog)!.props as unknown as { onClose(): void }).onClose(); }
    return false;
  } };
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: (selector: string) => selector === "dialog[open]" && dialog.open ? [dialog] : [] });
  return dialog;
}
test("a link that lands while a dialog is open dismisses it as its Cancel would, then moves", async () => {
  await start();
  (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as { projectSettings(root: string, key: string): void }).projectSettings("/w/a", "/w/a"); render();
  const dialog = openDialog(true);
  listeners.openLink!({ kind: "navigate", root: "/w/a", canvas: B, frame: "pricing" } as never); render();
  expect(dialog.events).toEqual([{ type: "cancel", cancelable: true }]);
  expect(all(tree).some(element => element.type === ProjectSettingsDialog)).toBe(false);
  expect(harness.controller!.openCanvas!.mock.lastCall!.slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: B }), "pricing"]);
});

test("a dialog that does not close for its cancel (busy) keeps the link from moving", async () => {
  await start();
  (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as { projectSettings(root: string, key: string): void }).projectSettings("/w/a", "/w/a"); render();
  const dialog = openDialog(false);
  const before = harness.controller!.openCanvas!.mock.calls.length;
  listeners.openLink!({ kind: "navigate", root: "/w/a", canvas: B } as never); render();
  expect(dialog.events).toEqual([{ type: "cancel", cancelable: true }]);
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(before);
  expect(all(tree).some(element => element.type === ProjectSettingsDialog)).toBe(true);
});

// From Home a project row opens its Overview, never the last canvas (user decision): the loaded project's row and
// another project's row alike. From a workspace another project's row still restores its last canvas.
test("from Home, a project row opens its Overview, the loaded project's and another's", async () => {
  await start();
  folders([{ path: "/w/b", kind: "list", servedRev: 0, canvases: [{ path: B, url: "u-b2", mtimeMs: 3 }] }]);
  show(rows()[0]!);
  const key = (root: string) => sidebar().cards.find(card => card.rows.some(row => row.path === root))!.key;
  sidebar().goHome(); render();
  const overviews = harness.controller!.showOverview!.mock.calls.length, canvases = harness.controller!.openCanvas!.mock.calls.length;
  sidebar().toggle(key("/w/a")); render();
  expect(harness.controller!.showOverview!.mock.calls.length).toBe(overviews + 1);
  expect(harness.controller!.openCanvas!.mock.calls.length).toBe(canvases);
  sidebar().goHome(); render();
  sidebar().toggle(key("/w/b")); await flush(); render();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/b", expect.any(Function), false, undefined, true);
  // From the workspace now loaded on /w/b, /w/a's row keeps restoring its last canvas.
  sidebar().toggle(key("/w/a")); await flush(); render();
  expect(harness.controller!.openWorkspace!.mock.lastCall?.[0]).toBe("/w/a");
  expect(harness.controller!.openWorkspace!.mock.lastCall?.[4]).not.toBe(true);
});
