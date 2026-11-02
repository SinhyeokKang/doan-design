import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";

// agent-reply-chips T4 (design 'Pressing'): a chip in an agent's reply, pressed in the canvas panel or the Overview.
// Driven with hooks as plain state and a stub controller, as App.conversationPanel.test.tsx is.
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
      for (const name of ["dispose", "command", "updateEntries", "setWorkspaceActive", "setCanvasPage", "setTool", "restoreTool", "openCanvas", "cancelWorkspaceOpen", "remember", "selectPath", "onPicked", "pick", "cancelPick", "locate", "dropPendingLocate", "settleFit"]) self[name] = vi.fn();
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
const { ProjectOverview } = await import("./ProjectOverview");
const { CanvasConversation, CanvasConversationTitle } = await import("./CanvasConversationPanel");
const { unavailableCanvasMessage } = await import("./quickOpen");
const { initialCanvasState } = await import("./CanvasController");

const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" } }, notice: null };
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
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true });
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
type Chips = { onReplyChip(link: ReplyAnchor): Promise<unknown>; onChoose?(): void };
const panelChip = (link: ReplyAnchor) => find<Chips>(CanvasConversation)[0]!.props.onReplyChip(link);
const overviewChip = (link: ReplyAnchor) => find<Chips>(ProjectOverview)[0]!.props.onReplyChip(link);
type OpenOptions = { opened(): void; unavailable(entry: FolderEntry | undefined): void };
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

test("the panel's thread gets the chip callback, and its live frames only while the canvas has a layout", async () => {
  await onDrafts();
  const props = find<{ frames: unknown; onReplyChip: unknown }>(CanvasConversation)[0]!.props;
  expect(props.onReplyChip).toBeTypeOf("function");
  expect(props.frames).toEqual([expect.objectContaining({ id: "editor", title: "Editor (live)" })]);
  showCanvas(drafts, { layout: null, status: "failed" });
  expect(find<{ frames: unknown }>(CanvasConversation)[0]!.props.frames).toBeUndefined();
});

test("a chip into the canvas on screen locates there by its doan id alone, with no move and no visit", async () => {
  await onDrafts();
  harness.controller!.locate!.mockImplementation((_anchor: unknown, settle: (outcome: string) => void) => { settle("missing"); return true; });
  clearController();
  const backBefore = back();
  await expect(panelChip({ canvas: "drafts", kind: "element", id: "save" })).resolves.toBe("missing");
  expect(harness.controller!.locate!.mock.calls[0]![0]).toStrictEqual({ element: { doanId: "save" } });
  await expect(panelChip({ canvas: "drafts", kind: "frame", id: "editor" })).resolves.toBe("missing");
  expect(harness.controller!.locate!.mock.calls[1]![0]).toStrictEqual({ frame: { id: "editor" } });
  render();
  for (const name of ["openCanvas", "destination", "showOverview", "openWorkspace"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
  expect(back()).toBe(backBefore);
  expect(harness.toast.show).not.toHaveBeenCalled();
  // A canvas that cannot be asked ends silently.
  harness.controller!.locate!.mockReturnValue(false);
  await expect(panelChip({ canvas: "drafts", kind: "frame", id: "editor" })).resolves.toBe("unavailable");
});

test("a chip into another canvas opens it as a link does: its frame or element, no frame toast, one visit for Back", async () => {
  await onDrafts();
  clearController();
  expect(back()).toBe(false);
  await expect(panelChip({ canvas: "checkout", kind: "frame", id: "payment" })).resolves.toBeNull();
  render();
  const [root, row, to, options] = lastOpen();
  expect([root, row.path, to]).toEqual(["/w/a", C, { frame: "payment" }]);
  // No `found`: a frame or element the canvas does not have leaves the canvas only, with no toast (deep link rule).
  expect(options).not.toHaveProperty("found");
  expect(harness.controller!.destination).not.toHaveBeenCalled();
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout);
  options.opened(); render();
  expect(harness.controller!.destination).toHaveBeenCalledWith("/w/a");
  expect(back()).toBe(true);
  void panelChip({ canvas: "drafts", kind: "element", id: "save" });
  expect(lastOpen().slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: D }), { element: "save" }]);
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(doan.setSelection).not.toHaveBeenCalled();
  expect(harness.controller!.locate).not.toHaveBeenCalled();
});

test("a canvas that cannot load after the chip opened it says so as Quick Open does", async () => {
  await onDrafts();
  void panelChip({ canvas: "checkout", kind: "element", id: "pay" });
  lastOpen()[3].unavailable(listA());
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(unavailableCanvasMessage(listA(), C));
});

test("the Overview's chips open their canvas, the one it last showed included", async () => {
  await overview();
  clearController();
  void overviewChip({ canvas: "drafts", kind: "frame", id: "editor" });
  expect(lastOpen().slice(0, 3)).toEqual(["/w/a", expect.objectContaining({ path: D }), { frame: "editor" }]);
  expect(harness.controller!.locate).not.toHaveBeenCalled();
});

test("a chip's canvas the project does not have, or has twice, or whose list is not usable shows one toast and moves nowhere", async () => {
  await overview();
  const name = find<{ project: string }>(ProjectOverview)[0]!.props.project;
  clearController();
  const toasts = async (link: ReplyAnchor, text: string) => {
    harness.toast.show.mockClear();
    await expect(overviewChip(link)).resolves.toBeNull();
    expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(text);
  };
  await toasts({ canvas: "billing", kind: "frame", id: "a" }, `Couldn’t open billing. The canvas isn’t in ${name}.`);
  await toasts({ canvas: "dup", kind: "element", id: "a" }, `Couldn’t open dup. More than one canvas in ${name} uses this ID. Run doan check in a terminal to find them.`);
  // The Overview stays while its project is read again or turns into a problem (buzz-project spec decision 12).
  folders([{ path: "/w/a", kind: "loading" }]);
  await toasts({ canvas: "drafts", kind: "frame", id: "editor" }, "Project is still being read. Try again shortly.");
  folders([{ path: "/w/a", kind: "notFound" }]);
  await toasts({ canvas: "drafts", kind: "frame", id: "editor" }, "Project is unavailable. Fix it from its menu in the sidebar, then try again.");
  // Quick Open keeps its own copy for a list still being read.
  expect(unavailableCanvasMessage({ path: "/w/a", kind: "loading" }, D)).toBe("Project is still being read. Try Open again shortly.");
  for (const name of ["openCanvas", "locate", "showOverview", "openWorkspace"]) expect(harness.controller![name], name).not.toHaveBeenCalled();
});

test("a chip looks only in its conversation's root: another worktree's canvas with that id is not opened", async () => {
  await overview([{ path: "/w/b", kind: "list", servedRev: 0, canvases: [checkout] }], listA([drafts]));
  clearController();
  void overviewChip({ canvas: "checkout", kind: "frame", id: "payment" });
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^Couldn’t open checkout\. The canvas isn’t in /));
});

// POSTMORTEM 2026-11-01: two worktrees share the canvas id `drafts`. Another root's chip is never located in the canvas
// on screen; it opens that root's own row.
test("with two roots sharing a canvas id, a chip locates only in its own root's canvas and opens the other root's own row", async () => {
  const draftsB: CanvasRow = { ...drafts, url: "u-d-b" };
  await overview([{ path: "/w/b", kind: "list", servedRev: 0, canvases: [draftsB] }]);
  showCanvas(drafts);
  await flushAll();
  harness.controller!.locate!.mockReturnValue(true);
  clearController();
  void panelChip({ canvas: "drafts", kind: "frame", id: "editor" });
  expect(harness.controller!.locate).toHaveBeenCalledOnce();
  // The controller enters /w/b's Overview and publishes no open canvas.
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/b");
  harness.setState!({ ...initialCanvasState() }); render();
  await flushAll();
  expect(find<{ root: string }>(ProjectOverview)[0]!.props.root).toBe("/w/b");
  void overviewChip({ canvas: "drafts", kind: "frame", id: "editor" });
  expect(harness.controller!.locate).toHaveBeenCalledOnce();
  const [root, row] = lastOpen();
  expect([root, row.url]).toEqual(["/w/b", "u-d-b"]);
});

// A dialog that refuses its cancel (busy), as App.terminalWork.test.tsx's links meet it.
function refusingDialog() {
  const dialog = { open: true, events: [] as string[], dispatchEvent(event: Event) { dialog.events.push(event.type); return false; } };
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: (selector: string) => selector === "dialog[open]" && dialog.open ? [dialog] : [], hasFocus: () => true });
  return dialog;
}
test("another canvas's chip goes through the link's decision: a busy dialog or first run keeps it from moving, silently", async () => {
  await onDrafts();
  clearController();
  const dialog = refusingDialog();
  await expect(panelChip({ canvas: "checkout", kind: "frame", id: "payment" })).resolves.toBeNull();
  expect(dialog.events).toEqual(["cancel"]);
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("during first run another canvas's chip moves nowhere and shows nothing", async () => {
  doan.startOnboardingSession!.mockResolvedValue({ ok: true, result: { sessionId: "s", completed: false } });
  await overview();
  clearController();
  await expect(overviewChip({ canvas: "drafts", kind: "frame", id: "editor" })).resolves.toBeNull();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// Conductor decision (A2): the waiting element goes when the person picks what the panel shows before the first
// layout; the panel's own switch to the opened canvas's conversation keeps it.
test("a person's conversation choice drops the waiting element; the panel following the opened canvas does not", async () => {
  await onDrafts();
  clearController();
  void panelChip({ canvas: "checkout", kind: "element", id: "pay" });
  harness.controller!.destination!.mockReturnValue({ root: "/w/a", canvas: C });
  showCanvas(checkout, { layout: null, status: "loading" });
  lastOpen()[3].opened(); render();
  await flushAll();
  expect(find<{ target: { canvas: { id?: string } } }>(CanvasConversation)[0]!.props.target.canvas.id).toBe("checkout");
  expect(harness.controller!.dropPendingLocate).not.toHaveBeenCalled();
  find<Chips>(CanvasConversation)[0]!.props.onChoose!();
  expect(harness.controller!.dropPendingLocate).toHaveBeenCalledTimes(1);
  find<Chips>(CanvasConversationTitle)[0]!.props.onChoose!();
  expect(harness.controller!.dropPendingLocate).toHaveBeenCalledTimes(2);
  listeners.menu!("newConversation" as never); render();
  expect(harness.controller!.dropPendingLocate).toHaveBeenCalledTimes(3);
});
