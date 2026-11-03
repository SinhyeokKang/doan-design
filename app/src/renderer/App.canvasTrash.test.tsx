import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { WorkItem } from "../main/workState";
import type { CanvasMenu } from "./ShellSidebar";
import type { TrashDialogView } from "./CanvasTrashDialog";

// canvas-row-menu spec '완료 조건' Move to Trash, design '삭제 뒤 화면' (review RC2 🟡2): trashing the open canvas shows
// its project's Overview with the trash reply's one toast and records no visit. The real CanvasController runs its
// `clear {trashed}` path here, with fake elements for its board (CanvasController.test.ts), so the App-connected
// derivation is what is tested (POSTMORTEM 2026-10-27: "Test the App-connected predicate, not just an injected
// substitute"). Hooks run as plain state (App.canvasRowMenu.test.tsx).
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
  toast: { toast: null, element: null, show: vi.fn(), action: vi.fn(), setModal: vi.fn() },
  signIn: { onToast: null as null | ((toast: { text: string; action: { label: string; target: unknown } | null }) => void), windowFocused: vi.fn() },
}));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
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
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(() => { calls.push("getWork"); return new Promise(resolve => { getWork = resolve; }); }),
    onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => { calls.push("openLinksReady"); }), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, hasFocus: () => true, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => Object.assign(new EventTarget(), { className: "", hidden: false, textContent: "", contentWindow: { postMessage: vi.fn() }, style: {}, children: [], append: vi.fn(), setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() }) });
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
    const fakes = [viewportFake(), { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() }, { append: vi.fn() }, layerFake()];
    [pane?.viewport, pane?.board, pane?.overlay, pane?.dragLayer].forEach((ref, index) => { if (ref && !ref.current) ref.current = fakes[index]; });
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
type Sidebar = { canvasMenu: CanvasMenu; canvas: string | undefined; open(root: string, row: CanvasRow): void; slots?: ReadonlyMap<string, { kind: string; label: string; source?: string }>; cards: { key: string; rows: { path: string }[] }[]; toggle(key: string, notice?: { root: string; path: string }): void; goHome(): void; projects: Record<string, { expanded: boolean }> };
const sidebar = () => (all(tree).find(element => element.type === ShellSidebar)!.props as unknown as Sidebar);
const rows = (): CanvasRow[] => [{ path: A, url: "u-a", mtimeMs: 10 }, { path: B, url: "u-b", mtimeMs: 5 }];
const folders = (extra: FolderEntry[] = []) => { listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: rows() }, ...extra] as never); render(); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const workspace = { screen: "workspace", root: "/w/a", canvas: A, expanded: {}, lastByRoot: {} };

async function start(restored: unknown = workspace) {
  render();
  folders();
  readUiState(restored); await flush(); render();
}

// The controller's own elements, as CanvasController.test.ts fakes them.
function viewportFake() {
  return Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, focus: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, width: 800, height: 600 }) });
}
function layerFake() {
  return Object.assign(new EventTarget(), { hidden: false, dataset: {}, setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => false });
}
type Pane = { state: { open: { canvas: string } | null }; covered: boolean };
const pane = () => all(tree).find(element => "covered" in (element.props as object))!.props as unknown as Pane;
const visits = () => (hooks.states.find(value => typeof value === "object" && value !== null && "visits" in value && "cursor" in value) as { visits: unknown[]; cursor: number });
const dialog = () => all(tree).find(element => element.type === CanvasTrashDialog)?.props as unknown as { confirm(): void } | undefined;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

test.each([
  ["the reply lands before the list drops the canvas", true],
  ["the list drops the canvas before the reply lands", false],
])("trashing the open canvas shows its Overview, one toast and no new visit: %s", async (_name, replyFirst) => {
  await start();
  const row = rows()[0]!;
  sidebar().open("/w/a", row); await flush(); render();
  expect(pane().state.open?.canvas).toBe(A);
  expect(pane().covered).toBe(false);
  const before = structuredClone(visits());
  doan.planCanvasTrash = vi.fn(async () => ({ kind: "ready", comments: false }));
  const reply = deferred<unknown>();
  doan.trashCanvas = vi.fn(() => reply.promise);
  sidebar().canvasMenu.trash("/w/a", row, null); await flush(); render();
  dialog()!.confirm(); render();
  const drop = () => { listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rows()[1]!] }] as never); render(); };
  if (replyFirst) { reply.resolve({ kind: "trashed", comments: "none" }); await flush(); render(); drop(); }
  else { drop(); reply.resolve({ kind: "trashed", comments: "none" }); await flush(); render(); }
  expect(pane().state.open).toBeNull();
  expect(pane().covered).toBe(true);
  expect(sidebar().canvas).toBeUndefined();
  // The trash reply's toast only: no removed-canvas toast from the controller.
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show).toHaveBeenCalledWith("Moved “a” to Trash.");
  // The Overview came from the closed canvas, not a navigation: no visit is committed.
  expect(visits()).toEqual(before);
});

test("a canvas that leaves the list without a Move to Trash keeps the removed-canvas toast", async () => {
  await start();
  sidebar().open("/w/a", rows()[0]!); await flush(); render();
  listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rows()[1]!] }] as never); render();
  expect(pane().covered).toBe(true);
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show.mock.lastCall![0]).not.toContain("Trash");
});
