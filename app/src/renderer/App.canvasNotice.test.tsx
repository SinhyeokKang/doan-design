import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import { initialCanvasState } from "./CanvasController";

// canvas-viewport-units D9/D10: App gives the sidebar canvas notices from main's `unseen` rows, tells main when the
// canvas page shows an unseen canvas, and lets a project row's notice open that canvas. Hooks run as plain state so
// App's own wiring runs (App.sidebarGroups.test.tsx).
// each newly shown canvas, driven with hooks as plain state so App's own wiring runs (App.settings.test.tsx).
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate", "dropPendingLocate"]) self[name] = vi.fn();
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
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {};
  harness.toast.show.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
    markCanvasSeen: vi.fn(async () => {}),
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
type Sidebar = { slots?: ReadonlyMap<string, { kind: string }>; toggle(key: string, notice?: { root: string; path: string }): void; cards: { key: string }[] };
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

test("an unseen row gets a canvas notice; once shown it loses it and main is told, again after a change while shown", async () => {
  await start(rows({ unseen: "changed" }, { unseen: "new" }), [], workspace);
  show(rows({ unseen: "changed" })[0]!);
  expect(sidebar().slots?.get(`/w/a\n${A}`)).toBeUndefined();
  expect(sidebar().slots?.get(`/w/a\n${B}`)?.kind).toBe("canvas");
  expect(doan.markCanvasSeen).toHaveBeenLastCalledWith({ root: "/w/a", path: A, mtimeMs: 10 });
  folders(rows({}, { unseen: "new" }));
  expect(doan.markCanvasSeen).toHaveBeenCalledTimes(1);
  folders(rows({ mtimeMs: 12, unseen: "changed" }, { unseen: "new" }));
  expect(doan.markCanvasSeen).toHaveBeenLastCalledWith({ root: "/w/a", path: A, mtimeMs: 12 });
  expect(sidebar().slots?.get(`/w/a\n${A}`)).toBeUndefined();
});

test("the Overview and Home never mark a canvas seen", async () => {
  await start(rows({ unseen: "changed" }));
  expect(sidebar().slots?.get(`/w/a\n${A}`)?.kind).toBe("canvas");
  expect(doan.markCanvasSeen).not.toHaveBeenCalled();
});

test("a project row's canvas notice opens that canvas where its conversation slot would open the Overview", async () => {
  await start(rows({}, { unseen: "new" }), [], workspace);
  show(rows({})[0]!);
  const key = sidebar().cards[0]!.key;
  sidebar().toggle(key, { root: "/w/a", path: B }); render();
  expect(harness.controller!.openCanvas).toHaveBeenLastCalledWith("/w/a", expect.objectContaining({ path: B }), undefined, expect.anything());
  expect(harness.controller!.showOverview).not.toHaveBeenCalled();
  // Without a notice the row keeps its move.
  sidebar().toggle(key); render();
  expect(harness.controller!.showOverview).toHaveBeenCalledTimes(1);
});

test("a collapsed project's notice opens its canvas instead of the project's workspace", async () => {
  const other: FolderEntry = { path: "/w/b", kind: "list", servedRev: 0, canvases: [{ path: B, url: "u-b2", mtimeMs: 3, unseen: "new" }] };
  await start(rows({}), [other], workspace);
  show(rows({})[0]!);
  const key = sidebar().cards.find(card => card.key !== sidebar().cards.find(item => item.key.includes("/w/a"))?.key)!.key;
  expect(sidebar().slots?.get(`/w/b\n${B}`)?.kind).toBe("canvas");
  sidebar().toggle(key, { root: "/w/b", path: B }); await Promise.resolve(); render();
  expect(harness.controller!.openCanvas).toHaveBeenLastCalledWith("/w/b", expect.objectContaining({ path: B }), undefined, expect.anything());
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalledWith("/w/b", expect.anything());
});
