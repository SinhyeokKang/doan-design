import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// conversation-delete design §3.2–§3.4 wired in App: a title menu row's Delete asks in the alert, the store's deleting
// mark pairs with exactly one of deleted/cancelled, the runs are cleaned after main deletes (or no longer has it), a
// refusal toasts and leaves focus on the menu's trigger, and deleting the shown conversation focuses that screen's
// composer. Driven with hooks as plain state (App.conversationPanel.test.tsx).
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
  agentSignIn: () => ({ state: { auth: undefined }, subscribe: () => () => {}, onToast: (listener: typeof harness.signIn.onToast) => { harness.signIn.onToast = listener; return () => {}; }, windowFocused: harness.signIn.windowFocused }),
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
const focused = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./chipField", async original => ({ ...await original<typeof import("./chipField")>(), focusFieldEnd: (field: unknown) => { focused.calls.push(field); } }));
vi.mock("./thumbnails", () => ({ useThumbnails: () => ({ thumbnails: new Map(), onVisible: vi.fn() }) }));

const { App } = await import("./App");
const { ShellSidebar } = await import("./ShellSidebar");
const { ProjectOverview } = await import("./ProjectOverview");
const { CanvasConversationTitle } = await import("./CanvasConversationPanel");
const { ConversationDeleteDialog } = await import("./ConversationDeleteDialog");
const { OverviewRun } = await import("./overviewRun");
const { CanvasRun } = await import("./canvasRun");
const { HomeRun } = await import("./homeRun");
const { ConversationStore } = await import("./conversationStore");
const { initialCanvasState } = await import("./CanvasController");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA] });
const PREFS: PreferencesSnapshot = { preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: { provider: "codex" } }, notice: null };
let listeners: Record<string, (...args: never[]) => void>;
let readUiState: (state: unknown) => void;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let tree: ReactNode;
let calls: string[];
const FIELDS: Record<string, { field: string }> = { ".workspace .ov-main .composer-input": { field: "overview" }, ".doan-conv-panel .composer-input": { field: "canvas" } };

function reset() {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners = {}; calls = []; focused.calls.length = 0;
  harness.toast.show.mockClear(); harness.toast.setModal.mockClear();
  const on = (name: string) => vi.fn((listener: (...args: never[]) => void) => { listeners[name] = listener; return () => {}; });
  doan = {
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onMcpConnectors: on("mcp"), onExportRunning: on("exportRunning"), onFullScreen: on("fullScreen"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), onQuitting: on("quitting"), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true), markConversationSeen: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: (selector: string) => FIELDS[selector] ?? null, querySelectorAll: () => [], hasFocus: () => true });
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
  // The order of the deleting mark, main's call and the cleanups.
  for (const [type, names] of [[ConversationStore, ["startDelete", "cancelDelete", "deleted"]], [OverviewRun, ["deleted", "sync"]], [CanvasRun, ["deleted", "sync"]], [HomeRun, ["deleted"]]] as const) {
    for (const name of names) {
      const proto = type.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      const original = (proto[name] as { original?: (...args: unknown[]) => unknown }).original ?? proto[name]!;
      const wrapped = function (this: unknown, ...args: unknown[]) { calls.push(`${type.name}.${name}`); return original.apply(this, args); };
      (wrapped as unknown as { original: unknown }).original = original;
      proto[name] = wrapped;
    }
  }
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
const flushAll = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); render(); };
const summary = (conversationId: string, patch: Record<string, unknown> = {}) => ({ conversationId, title: `Title ${conversationId}`, state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch });
const onCanvas = (conversationId: string, patch: Record<string, unknown> = {}) => summary(conversationId, { canvas: { path: rowA.path, id: "a" }, fromHome: false, ...patch });
type Target = { conversationId: string; root: string; title: string; provider: string; from: "overview" | "canvas" };
type Overview = { run: InstanceType<typeof OverviewRun>; onDeleteConversation(target: Target, trigger: unknown): void };
type Title = { run: InstanceType<typeof CanvasRun>; onDelete(target: Target, trigger: unknown): void };
type Dialog = { view: { title: string; body: string }; reason: string | null; pending: boolean; cancel(): void; confirm(): void };
const overview = () => find<Overview>(ProjectOverview)[0]?.props;
const title = () => find<Title>(CanvasConversationTitle)[0]?.props;
const dialog = () => find<Dialog>(ConversationDeleteDialog)[0]?.props;
function trigger() {
  return { isConnected: true, focus: vi.fn(), closest: (selector: string) => selector === ".workspace" ? {} : null, matches: () => false, getClientRects: () => [{}] };
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const target = (conversationId: string, from: "overview" | "canvas" = "overview"): Target => ({ conversationId, root: "/w/a", title: `Title ${conversationId}`, provider: "claude", from });

// The Overview of /w/a showing c1, with c2 also listed.
async function openOverview(list: unknown[] = [summary("c1"), summary("c2")]) {
  doan.listConversations!.mockResolvedValue(list);
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, conversationByRoot: { "/w/a": "c1" } }); await flushAll();
  listeners.folders!([listed("/w/a")] as never); render();
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  await flushAll();
  expect(overview()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
}
// The canvas page on a, its panel showing c1 (current on a), with archived c2.
async function openCanvasPanel(list: unknown[] = [onCanvas("c1"), onCanvas("c2", { state: "archived" })]) {
  doan.listConversations!.mockResolvedValue(list);
  render();
  readUiState({ screen: "home", expanded: {}, lastByRoot: {}, home: {}, rightPanel: { open: true, width: 400 } }); await flushAll();
  listeners.folders!([listed("/w/a")] as never); render();
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  harness.setState!({ ...initialCanvasState(), open: { folder: "/w/a", canvas: rowA.path, row: rowA }, shown: rowA.path, status: null, message: "", layout: { frames: [], width: 800 } });
  render(); await flushAll();
  expect(title()!.run.view()).toMatchObject({ kind: "conversation", conversationId: "c1" });
}
const ask = (t: Target, button = trigger()) => { (t.from === "overview" ? overview()!.onDeleteConversation : title()!.onDelete)(t, button); render(); return button; };

test("Delete asks first: the alert names the conversation and its provider, and Cancel deletes nothing and returns focus to the trigger", async () => {
  await openOverview();
  const button = ask(target("c2"));
  expect(dialog()!.view).toEqual({ title: "Delete “Title c2”?", body: "Doan deletes this conversation from this device. Claude Code’s own session files stay. You can’t undo this." });
  expect(dialog()!.pending).toBe(false);
  expect(dialog()!.reason).toBeNull();
  // The alert is a modal: the toast holds its timer and other modals stay closed.
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(true);
  dialog()!.cancel(); render();
  expect(dialog()).toBeUndefined();
  expect(doan.deleteConversation).toBeUndefined();
  expect(button.focus).toHaveBeenCalledOnce();
});

test("the alert says an unsent draft or a returned queue is discarded too", async () => {
  await openOverview([summary("c1"), summary("c2", { returnedDraft: true }), summary("c3")]);
  ask(target("c2"));
  expect(dialog()!.view.body).toMatch(/ Its unsent message is discarded too\.$/);
  dialog()!.cancel(); render();
  overview()!.run.store.setDrafts(drafts => new Map(drafts).set("conversation:c3", { segments: [{ kind: "text", text: "x" }], preset: null, attachments: [], shape: "capsule" } as never)); render();
  ask(target("c3"));
  expect(dialog()!.view.body).toMatch(/ Its unsent message is discarded too\.$/);
  dialog()!.cancel(); render();
  ask(target("c1"));
  expect(dialog()!.view.body).not.toContain("unsent");
});

test("a conversation that starts working while the alert is open makes Delete unavailable with the reason", async () => {
  await openOverview();
  ask(target("c2"));
  doan.listConversations!.mockResolvedValue([summary("c1"), summary("c2", { working: true, phase: "running" })]);
  listeners.conversationList!({ root: "/w/a" } as never); await flushAll();
  expect(dialog()!.reason).toBe("The agent is working on this conversation.");
});

test("deleting the shown Overview conversation: mark, main, every run's cleanup, the new conversation state, no toast, focus to its composer", async () => {
  await openOverview();
  const reply = deferred<undefined>();
  doan.deleteConversation = vi.fn(() => { calls.push("main"); return reply.promise; });
  ask(target("c1"));
  calls.length = 0;
  dialog()!.confirm(); render();
  expect(dialog()!.pending).toBe(true);
  // A second press while the request is out sends nothing more.
  dialog()!.confirm(); render();
  expect(doan.deleteConversation).toHaveBeenCalledOnce();
  expect(doan.deleteConversation).toHaveBeenCalledWith({ conversationId: "c1" });
  expect(calls).toEqual(["ConversationStore.startDelete", "main"]);
  reply.resolve(undefined); await flushAll();
  expect(calls.filter(call => !call.endsWith(".sync"))).toEqual(["ConversationStore.startDelete", "main", "OverviewRun.deleted", "CanvasRun.deleted", "HomeRun.deleted", "ConversationStore.deleted"]);
  expect(overview()!.run.store.deleting("c1")).toBe(false);
  expect(overview()!.run.view("/w/a").kind).toBe("new");
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(focused.calls).toEqual([FIELDS[".workspace .ov-main .composer-input"]]);
});

test("deleting a conversation that was not shown leaves the screen and returns focus to the trigger", async () => {
  await openOverview();
  doan.deleteConversation = vi.fn(async () => undefined);
  const button = ask(target("c2"));
  dialog()!.confirm(); await flushAll();
  expect(overview()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(focused.calls).toEqual([]);
  expect(button.focus).toHaveBeenCalledOnce();
});

test.each([
  ["busy", { error: "busy" }, "Couldn’t delete “Title c1”. The agent started working on it."],
  ["unknown", { error: "unknown" }, "Couldn’t delete “Title c1”. Try again."],
  ["bad_request", { error: "bad_request" }, "Couldn’t delete “Title c1”. Try again."],
  ["a rejected call", "reject", "Couldn’t delete “Title c1”. Try again."],
])("refused (%s): the mark is cancelled, the runs read again, the toast says why and focus goes to the trigger", async (_name, answer, text) => {
  await openOverview();
  vi.spyOn(console, "error").mockImplementation(() => {});
  doan.deleteConversation = vi.fn(() => answer === "reject" ? Promise.reject(new Error("gone")) : Promise.resolve(answer));
  const button = ask(target("c1"));
  calls.length = 0;
  dialog()!.confirm(); await flushAll();
  expect(calls.slice(0, 4)).toEqual(["ConversationStore.startDelete", "ConversationStore.cancelDelete", "OverviewRun.sync", "CanvasRun.sync"]);
  expect(calls).not.toContain("ConversationStore.deleted");
  expect(calls).not.toContain("OverviewRun.deleted");
  expect(overview()!.run.store.deleting("c1")).toBe(false);
  expect(overview()!.run.view("/w/a")).toEqual({ kind: "conversation", conversationId: "c1" });
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).toHaveBeenCalledOnce();
  expect(harness.toast.show).toHaveBeenCalledWith(text);
  expect(focused.calls).toEqual([]);
  expect(button.focus).toHaveBeenCalledOnce();
});

// orch decision 3: main no longer has it, so the screens are cleaned as for a deletion, with the toast.
test("not_found cleans up as a deletion and says it was already deleted", async () => {
  await openOverview();
  doan.deleteConversation = vi.fn(async () => ({ error: "not_found" }));
  ask(target("c1"));
  calls.length = 0;
  dialog()!.confirm(); await flushAll();
  expect(calls.filter(call => !call.endsWith(".sync"))).toEqual(["ConversationStore.startDelete", "OverviewRun.deleted", "CanvasRun.deleted", "HomeRun.deleted", "ConversationStore.deleted"]);
  expect(overview()!.run.view("/w/a").kind).toBe("new");
  expect(harness.toast.show).toHaveBeenCalledWith("“Title c1” was already deleted.");
  // The shown conversation is gone and the screen is the new conversation state: focus goes to its composer.
  expect(focused.calls).toEqual([FIELDS[".workspace .ov-main .composer-input"]]);
});

test("deleting the canvas's current conversation from its Title menu shows the new conversation state, not the archived one, and focuses the panel's composer", async () => {
  await openCanvasPanel();
  doan.deleteConversation = vi.fn(async () => undefined);
  ask(target("c1", "canvas"));
  dialog()!.confirm(); await flushAll();
  expect(title()!.run.view()).toMatchObject({ kind: "new" });
  doan.listConversations!.mockResolvedValue([onCanvas("c2", { state: "archived" })]);
  listeners.conversationList!({ root: "/w/a" } as never); await flushAll();
  expect(title()!.run.view()).toMatchObject({ kind: "new" });
  expect(harness.toast.show).not.toHaveBeenCalled();
  expect(focused.calls).toEqual([FIELDS[".doan-conv-panel .composer-input"]]);
});

// PRODUCT item 3 'Deep links': a busy dialog refuses its cancel. Cancelling here would stop nothing, and a second
// request for the same conversation would share the store's one deleting mark with the first (review 🟡1).
test("while its request is out the alert refuses Cancel and Escape, and stays until main answers", async () => {
  await openOverview();
  const reply = deferred<undefined>();
  doan.deleteConversation = vi.fn(() => reply.promise);
  const button = ask(target("c1"));
  dialog()!.confirm(); render();
  // Through the drawn alert: its Cancel button and its cancel event (Escape, a link's dismissal).
  const drawn = ConversationDeleteDialog(dialog() as never);
  const cancelButton = all(drawn).find(element => element.type === "button" && element.props["children"] === "Cancel")!;
  (cancelButton.props["onClick"] as () => void)();
  (drawn.props["onCancel"] as (event: unknown) => void)({ preventDefault: () => {} });
  render();
  expect(dialog()?.pending).toBe(true);
  expect(button.focus).not.toHaveBeenCalled();
  reply.resolve(undefined); await flushAll();
  expect(dialog()).toBeUndefined();
  expect(overview()!.run.view("/w/a").kind).toBe("new");
  expect(focused.calls).toEqual([FIELDS[".workspace .ov-main .composer-input"]]);
});

// main answers busy for a refusal while the app quits too: after its quitting push the refusal shows no toast, and the
// mark is still cancelled.
test("a refusal after main said the app is quitting shows no toast", async () => {
  await openOverview();
  doan.deleteConversation = vi.fn(async () => ({ error: "busy" }));
  listeners.quitting!(true as never);
  ask(target("c1"));
  calls.length = 0;
  dialog()!.confirm(); await flushAll();
  expect(calls.slice(0, 2)).toEqual(["ConversationStore.startDelete", "ConversationStore.cancelDelete"]);
  expect(overview()!.run.store.deleting("c1")).toBe(false);
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).not.toHaveBeenCalled();
});

// Review RC (conductor) 🟡1: a throw in any cleanup must still end the deleting mark and close the alert, which refuses
// its cancel while busy and would otherwise hold the window until a reload.
test("a cleanup that throws after a deletion still ends the mark and closes the alert", async () => {
  await openOverview();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  doan.deleteConversation = vi.fn(async () => undefined);
  const deleted = vi.spyOn(OverviewRun.prototype, "deleted").mockImplementationOnce(() => { throw new Error("broken run"); });
  try {
    ask(target("c2"));
    dialog()!.confirm(); await flushAll();
    expect(overview()!.run.store.deleting("c2")).toBe(false);
    expect(dialog()).toBeUndefined();
    expect(error).toHaveBeenCalled();
  } finally { deleted.mockRestore(); }
});
test("a re-read that throws after a refusal still ends the mark, closes the alert and shows the toast", async () => {
  await openOverview();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  doan.deleteConversation = vi.fn(async () => ({ error: "busy" }));
  ask(target("c1"));
  const sync = vi.spyOn(OverviewRun.prototype, "sync").mockImplementation(() => { throw new Error("broken read"); });
  try {
    dialog()!.confirm(); await flushAll();
  } finally { sync.mockRestore(); }
  render();
  expect(overview()!.run.store.deleting("c1")).toBe(false);
  expect(dialog()).toBeUndefined();
  expect(harness.toast.show).toHaveBeenCalledWith("Couldn’t delete “Title c1”. The agent started working on it.");
  expect(error).toHaveBeenCalled();
});

// Review RC ⚪3: the canvas panel's refusal and Cancel return focus to the panel's title trigger.
test.each([["a refusal", true], ["Cancel", false]])("canvas panel, %s: focus returns to the panel's title trigger", async (_name, confirm) => {
  await openCanvasPanel();
  doan.deleteConversation = vi.fn(async () => ({ error: "busy" }));
  const button = ask(target("c1", "canvas"));
  if (confirm) { dialog()!.confirm(); await flushAll(); } else { dialog()!.cancel(); render(); }
  expect(dialog()).toBeUndefined();
  expect(title()!.run.view()).toMatchObject({ kind: "conversation", conversationId: "c1" });
  expect(button.focus).toHaveBeenCalledOnce();
  expect(focused.calls).toEqual([]);
  expect(harness.toast.show).toHaveBeenCalledTimes(confirm ? 1 : 0);
});
