import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { CanvasMenu } from "./ShellSidebar";

// The real CanvasController runs its `clear {trashed}` path with fake board elements, so the App-connected
// derivation is tested (POSTMORTEM 2026-10-27), not an injected substitute.
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
// The App clock reads document and native visibility, which these harnesses do not stub.
vi.mock("./visibleClock", () => ({ useVisibleClock: () => Date.now() }));
vi.mock("./Toast", () => ({ useToast: () => harness.toast }));
vi.mock("./agentSignIn", () => ({
  agentSignIn: () => ({ state: { auth: undefined }, subscribe: () => () => {}, onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
}));
vi.mock("./thumbnails", () => ({ useThumbnailHub: () => null, useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { CanvasTrashDialog } = await import("./CanvasTrashDialog");

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html";
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" }, updates: { autoCheck: true } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let calls: string[];
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; calls = [];
  harness.toast.show.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { calls.push(`on:${name}`); listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationStage: on("stage"), onConversationBoundary: on("boundary"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })), readBuddyIntro: vi.fn(async () => false),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), openSettings: vi.fn(async () => true),
    showCanvas: vi.fn(async () => true), retryReadState: vi.fn(async () => null), onReadStateProblem: vi.fn(() => () => {}), onFoldersSaveFailed: vi.fn(() => () => {}),
    onWorkChanged: on("work"), onConversationWorkChanged: on("conversationWork"), getConversationWork: vi.fn(async () => []), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onPrototypeReveal: on("prototypeReveal"), onPrototypeLastUsed: on("prototypeLastUsed"), onFullScreen: on("fullScreen"), getWork: vi.fn(() => { calls.push("getWork"); return new Promise(() => {}); }),
    onOpenLink: on("openLink"), onQuitting: vi.fn(() => () => {}), openLinksReady: vi.fn(async () => { calls.push("openLinksReady"); }), onOpenRequest: on("openRequest"), onConversationHandoff: on("handoff"), onFoldersRemoved: on("foldersRemoved"), answerOpenRequest: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn(), style: { setProperty: vi.fn() } }, addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null, body: {}, hasFocus: () => true, querySelector: () => null, querySelectorAll: () => [],
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
type Sidebar = { canvasMenu: CanvasMenu; canvas: string | undefined; open(root: string, row: CanvasRow): void; slots?: ReadonlyMap<string, { kind: string; label: string; source?: string }>; cards: { key: string; rows: { path: string }[] }[]; toggle(key: string): void; goHome(): void; projects: Record<string, { expanded: boolean }> };
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
  doan.planCanvasTrash = vi.fn(async () => ({ kind: "ready" }));
  const reply = deferred<unknown>();
  doan.trashCanvas = vi.fn(() => reply.promise);
  sidebar().canvasMenu.trash("/w/a", row, null); await flush(); render();
  dialog()!.confirm(); render();
  const drop = () => { listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rows()[1]!] }] as never); render(); };
  if (replyFirst) { reply.resolve({ kind: "trashed" }); await flush(); render(); drop(); }
  else { drop(); reply.resolve({ kind: "trashed" }); await flush(); render(); }
  expect(pane().state.open).toBeNull();
  expect(pane().covered).toBe(true);
  expect(sidebar().canvas).toBeUndefined();
  // The trash reply's toast only: no removed-canvas toast from the controller.
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show).toHaveBeenCalledWith("Moved “a” to Trash.");
  // The Overview came from the closed canvas, not a navigation: no visit is committed.
  expect(visits()).toEqual(before);
});

// ui-state's conversationByCanvas forgets a canvas moved to the Trash, so the memory shrinks with the canvases.
test("a canvas moved to the Trash leaves the canvas conversation memory; a refused move keeps it", async () => {
  // Both remembered conversations are listed: a save drops what the read list does not name.
  const listedSummary = (conversationId: string) => ({ conversationId, title: "", owner: "doan", provider: "codex", fromHome: false, phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-06T00:00:00Z", preview: "", working: false });
  doan.listConversations = vi.fn(async () => [listedSummary("c1"), listedSummary("c2")]);
  await start({ ...workspace, conversationByCanvas: { "/w/a": { [A]: "c1", [B]: "c2" } } });
  const saved = () => (doan.saveUiState!.mock.calls.at(-1)?.[0] as { conversationByCanvas?: unknown } | undefined)?.conversationByCanvas;
  const move = async (row: CanvasRow, reply: unknown) => {
    doan.planCanvasTrash = vi.fn(async () => ({ kind: "ready" }));
    doan.trashCanvas = vi.fn(async () => reply);
    sidebar().canvasMenu.trash("/w/a", row, null); await flush(); render();
    dialog()!.confirm(); await flush(); render();
  };
  await move(rows()[1]!, { kind: "refused", reason: "busy" });
  expect(saved()).toEqual({ "/w/a": { [A]: "c1", [B]: "c2" } });
  await move(rows()[1]!, { kind: "trashed" });
  expect(saved()).toEqual({ "/w/a": { [A]: "c1" } });
});

test("a canvas that leaves the list without a Move to Trash keeps the removed-canvas toast", async () => {
  await start();
  sidebar().open("/w/a", rows()[0]!); await flush(); render();
  listeners.folders!([{ path: "/w/a", kind: "list", servedRev: 0, canvases: [rows()[1]!] }] as never); render();
  expect(pane().covered).toBe(true);
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show.mock.lastCall![0]).not.toContain("Trash");
});
