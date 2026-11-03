import { readdirSync, readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { PreferencesSnapshot } from "../main/preferences";

// buzz-settings U2: App's Settings page — entry, return, lock, the incoming-target queue and notification clicks —
// driven with hooks as plain state so App's own navigation functions run (App.addProjects.test.tsx).
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
    constructor() {
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
const { SettingsPage } = await import("./SettingsPage");
const { AddProjectsPage } = await import("./AddProjectsPage");
const { ShellSidebar } = await import("./ShellSidebar");
const { QuickOpen } = await import("./QuickOpenDialog");
const { Home } = await import("./Home");
const { HomeRun } = await import("./homeRun");
const { ProjectSettingsPage } = await import("./ProjectSettingsPage");
const { ProjectSetupDialog } = await import("./ProjectSetupDialog");
const { RightPanel } = await import("./RightPanel");
const { ConversationPanel } = await import("./ConversationPanel");
const { KeyedConversationStrip } = await import("./ConversationStripView");
const { ProjectOverview } = await import("./ProjectOverview");
const { ProblemActions } = await import("./Home");

const rowA: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "u-a" };
const listed = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [rowA] });
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
    onFolders: on("folders"), onViewCommand: on("view"), onMenuCommand: on("menu"), onConversationEvent: on("conversation"), onConversationListChanged: on("conversationList"), listConversations: vi.fn(async () => []), onOpenAddProjects: on("openAddProjects"),
    onOpenSettingsPage: on("openSettingsPage"), onNotificationClick: on("notificationClick"),
    onWorkChanged: on("work"), onExportRunning: on("exportRunning"), getWork: vi.fn(async () => []), onOpenLink: on("openLink"), openLinksReady: vi.fn(async () => {}), onOpenRequest: on("openRequest"), answerOpenRequest: vi.fn(async () => {}),
    homeDirectory: vi.fn(async () => "/Users/ada"), startOnboardingSession: vi.fn(async () => ({ ok: true, result: { sessionId: "s", completed: true } })),
    readUiState: vi.fn(() => new Promise(resolve => { readUiState = resolve; })), saveUiState: vi.fn(async () => true), setMenuState: vi.fn(async () => {}),
    readPreferences: vi.fn(async () => PREFS), savePreferences: vi.fn(async () => null),
    readShellActivity: vi.fn(async () => []), setSelection: vi.fn(async () => {}), inspect: vi.fn(), openSettings: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: (event: never) => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
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
const find = <P,>(type: unknown) => all(tree).filter(element => element.type === type) as unknown as ReactElement<P>[];
type Sidebar = ReactElement<{ locked?: boolean; settings?: { section: string; select(section: string): void } } & Record<string, (...args: never[]) => void>>;
type PageProps = { section: string; arrival: { focus: { kind: string; provider?: string }; seq: number } | null; onState(report: { locked: boolean }): void; header: ReactElement; sidebar: Sidebar;
  agents: { preferences: PreferencesSnapshot | null; save(patch: unknown): Promise<unknown>; project: { root: string; name: string } | null } };
const settings = () => find<PageProps>(SettingsPage)[0];
const onSettings = () => settings() !== undefined;
const addPage = () => find<{ header: ReactElement }>(AddProjectsPage)[0];
const homeEl = () => find<{ header: ReactElement; openSettings(target: unknown): void; defaults: unknown; select: { root: string; seq: number } | null }>(Home)[0];
function topBar(header: ReactElement) {
  const bar = (header.type as (props: unknown) => ReactNode)(header.props);
  const buttons = all(bar).filter(element => element.type === "button");
  const text = (button: ReactElement<Record<string, unknown>>) => [button.props["aria-label"], ...[button.props.children].flat()].filter(item => typeof item === "string");
  const named = (label: string) => buttons.find(button => text(button).includes(label))!;
  return { back: named("Back"), forward: named("Forward"), add: named("Add Projects"), projects: named("Projects"), settings: named("Settings") };
}
const workspaceHeader = () => all(tree).find(element => typeof element.type === "function" && element.type.name === "TopBar" && !all(settings()?.props.header).includes(element) && !all(addPage()?.props.header).includes(element) && !all(projectPage()?.props.header).includes(element))!;
function folders(entries: FolderEntry[]) { listeners.folders!(entries as never); render(); }
const click = (element: ReactElement<Record<string, unknown>>) => { (element.props.onClick as () => void)(); render(); };
const escape = () => { windowListeners.keydown!({ key: "Escape", target: { tagName: "BUTTON" }, isComposing: false, keyCode: 27, preventDefault: vi.fn() } as never); render(); };
const cmdComma = (target: unknown = {}) => { listeners.openSettingsPage!(target as never); render(); };
const lock = (locked = true) => { settings()!.props.onState({ locked }); render(); };
const clearController = () => { for (const mock of Object.values(harness.controller!)) if (vi.isMockFunction(mock)) mock.mockClear(); };

// From a workspace on /w/a, open Settings with the header tab.
function openFromWorkspace() {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  click(topBar(workspaceHeader()).settings);
  expect(onSettings()).toBe(true);
  clearController();
}

test("the header Settings tab opens the page on the last category's title; the sidebar lists categories; the menu knows the screen", () => {
  openFromWorkspace();
  const bar = topBar(settings()!.props.header);
  expect(bar.settings.props["aria-current"]).toBe("page");
  expect([bar.add.props["aria-current"], bar.projects.props["aria-current"]]).toEqual([undefined, undefined]);
  expect([bar.back.props.disabled, bar.forward.props.disabled]).toEqual([false, true]);
  expect(settings()!.props).toMatchObject({ section: "agents", arrival: { focus: { kind: "heading" } } });
  expect(settings()!.props.sidebar.props.settings?.section).toBe("agents");
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "settings", modal: false });
  expect(doan.openSettings).not.toHaveBeenCalled();
});

test("Projects tab, Back and Escape return to the origin workspace; a sidebar category keeps focus and is remembered", async () => {
  for (const leave of [() => click(topBar(settings()!.props.header).projects), () => click(topBar(settings()!.props.header).back), escape]) {
    reset();
    openFromWorkspace();
    readUiState(null); await Promise.resolve(); await Promise.resolve(); render();
    settings()!.props.sidebar.props.settings!.select("about"); render();
    expect(settings()!.props.section).toBe("about");
    // No arrival: focus stays on the sidebar row, and a later remount of a category finds nothing to apply.
    expect(settings()!.props.arrival).toBeNull();
    expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "workspace", root: "/w/a", settingsSection: "about" });
    leave();
    expect(onSettings()).toBe(false);
    expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
    // Settings… later opens the remembered category.
    cmdComma();
    expect(settings()!.props.section).toBe("about");
  }
});

test("Settings… (⌘,) and Home's picker open the page; on the page ⌘, focuses the title again and a provider target its row", () => {
  render();
  folders([listed("/w/a")]);
  homeEl()!.props.openSettings({ section: "agents", provider: "codex" }); render();
  expect(settings()!.props).toMatchObject({ section: "agents", arrival: { focus: { kind: "provider", provider: "codex" } } });
  const seq = settings()!.props.arrival!.seq;
  cmdComma();
  expect(settings()!.props.arrival).toEqual({ focus: { kind: "heading" }, seq: seq + 1 });
  // A malformed IPC target is dropped.
  cmdComma({ section: "projects", extra: 1 });
  expect(settings()!.props.arrival!.seq).toBe(seq + 1);
  // The page returns to Home, where it came from.
  click(topBar(settings()!.props.header).projects);
  expect(homeEl()).toBeDefined();
});

test("while a category holds a confirmation or a write, incoming targets wait and the latest applies after; every way out is ignored", () => {
  const moves: [string, () => void][] = [
    ["Projects tab", () => click(topBar(settings()!.props.header).projects)],
    ["Back", () => click(topBar(settings()!.props.header).back)],
    ["Add Projects tab", () => click(topBar(settings()!.props.header).add)],
    ["Escape", escape],
    ["Go > Home", () => { listeners.menu!("home" as never); render(); }],
    ["Quick Open", () => { listeners.menu!("quickOpen" as never); render(); }],
    ["Search", () => { settings()!.props.sidebar.props.search!(); render(); }],
    ["sidebar category", () => { settings()!.props.sidebar.props.settings!.select("about"); render(); }],
    ["File > Add Project…", () => { listeners.openAddProjects!(); render(); }],
    ["notification click", () => { listeners.notificationClick!({ conversationId: "c1", root: "/w/b" } as never); render(); }],
  ];
  for (const [name, move] of moves) {
    reset();
    openFromWorkspace();
    lock();
    expect(settings()!.props.sidebar.props.locked, name).toBe(true);
    move();
    expect(onSettings(), name).toBe(true);
    expect(settings()!.props.section, name).toBe("agents");
    for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method], `${name}: ${method}`).not.toHaveBeenCalled();
    expect(find(QuickOpen), name).toHaveLength(0);
  }
  reset();
  openFromWorkspace();
  lock();
  const bar = topBar(settings()!.props.header);
  for (const button of [bar.add, bar.projects, bar.settings, bar.back]) expect(button.props["aria-disabled"]).toBe(true);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "settings", modal: false, locked: true });
  const before = settings()!.props.arrival;
  cmdComma({ section: "about" });
  harness.signIn.onToast!({ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } });
  (harness.toast.show.mock.lastCall![2] as () => void)(); render();
  expect(settings()!.props.arrival).toBe(before);
  expect(settings()!.props.section).toBe("agents");
  lock(false);
  expect(settings()!.props).toMatchObject({ section: "agents", arrival: { focus: { kind: "provider", provider: "codex" } } });
  expect(settings()!.props.arrival!.seq).toBe(before!.seq + 1);
  click(topBar(settings()!.props.header).projects);
  expect(onSettings()).toBe(false);
});

test("while Add Projects is locked the Settings tab, Settings… and a toast's Open Agents settings do nothing", () => {
  render();
  folders([listed("/w/a")]);
  click(topBar(homeEl()!.props.header).add);
  find<{ onState(report: { locked: boolean; choose: boolean }): void }>(AddProjectsPage)[0]!.props.onState({ locked: true, choose: false }); render();
  const bar = topBar(addPage()!.props.header);
  expect(bar.settings.props["aria-disabled"]).toBe(true);
  click(bar.settings);
  cmdComma();
  harness.signIn.onToast!({ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } });
  (harness.toast.show.mock.lastCall![2] as () => void)(); render();
  expect(onSettings()).toBe(false);
  expect(addPage()).toBeDefined();
});

test("Settings and Add Projects move between each other without changing where they return to", () => {
  openFromWorkspace();
  click(topBar(settings()!.props.header).add);
  expect(addPage()).toBeDefined();
  click(topBar(addPage()!.props.header).settings);
  expect(onSettings()).toBe(true);
  click(topBar(settings()!.props.header).projects);
  expect(onSettings()).toBe(false);
  expect(addPage()).toBeUndefined();
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
});

test("entering the page cancels a pending startup restore and a workspace still opening", async () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  let pending: (() => void) | null = null;
  harness.controller!.openWorkspace!.mockImplementation((root: string, done: (root: string) => void) => { pending = () => done(root); });
  harness.controller!.cancelWorkspaceOpen!.mockImplementation(() => { pending = null; });
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/b"); render();
  expect(pending).not.toBeNull();
  cmdComma();
  (pending as (() => void) | null)?.(); render();
  expect(onSettings()).toBe(true);
  readUiState({ screen: "workspace", root: "/w/a", expanded: {}, lastByRoot: {}, home: {} });
  await Promise.resolve(); await Promise.resolve(); render();
  expect(onSettings()).toBe(true);
  expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "home" });
});

// review BU1 🟡1: a target on the page is a navigation too, so a move still in flight must not land after it
// (POSTMORTEM 2026-10-27 no-op path rule); the same for Add Projects' own re-entry.
test("on a page, ⌘, or the page's own tab cancels a navigation still in flight", () => {
  for (const reenter of ["cmdComma", "toast"] as const) {
    reset();
    openFromWorkspace();
    let pending: (() => void) | null = null;
    harness.controller!.openWorkspace!.mockImplementation((root: string, done: (root: string) => void) => { pending = () => done(root); });
    harness.controller!.cancelWorkspaceOpen!.mockImplementation(() => { pending = null; });
    listeners.notificationClick!({ conversationId: "gone", root: "/w/b" } as never); render();
    expect(pending, reenter).not.toBeNull();
    if (reenter === "cmdComma") cmdComma();
    else { harness.signIn.onToast!({ text: "x", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } }); (harness.toast.show.mock.lastCall![2] as () => void)(); render(); }
    (pending as (() => void) | null)?.(); render();
    expect(onSettings(), reenter).toBe(true);
  }
  for (const reenter of ["tab", "menu"] as const) {
    reset();
    render();
    folders([listed("/w/a"), listed("/w/b")]);
    click(topBar(homeEl()!.props.header).add);
    let pending: (() => void) | null = null;
    harness.controller!.openWorkspace!.mockImplementation((root: string, done: (root: string) => void) => { pending = () => done(root); });
    harness.controller!.cancelWorkspaceOpen!.mockImplementation(() => { pending = null; });
    find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/b"); render();
    expect(pending, reenter).not.toBeNull();
    if (reenter === "tab") click(topBar(addPage()!.props.header).add);
    else { listeners.openAddProjects!(); render(); }
    (pending as (() => void) | null)?.(); render();
    expect(addPage(), reenter).toBeDefined();
  }
});

// review BU1 ⚪3: the Settings tab is a control the lock shows unavailable; only targets from outside wait.
test("while the page is locked a click on the Settings tab is ignored, not queued", () => {
  openFromWorkspace();
  lock();
  const before = settings()!.props.arrival;
  click(topBar(settings()!.props.header).settings);
  lock(false);
  expect(settings()!.props.arrival).toBe(before);
});

test("a notification click: a known conversation goes where the permission toast's Open goes, an unknown one to its registered project's Overview, else nowhere", () => {
  const click = (target: { conversationId: string; root: string }) => { listeners.notificationClick!(target as never); render(); };
  // Known: the run's own conversation in /w/b opens its project, like the toast's Open.
  openFromWorkspace();
  const run = hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as InstanceType<typeof HomeRun>;
  run.conversations = [{ conversationId: "c1", root: "/w/b", provider: "codex", phase: "permission" } as never];
  const open = vi.spyOn(run, "openConversation");
  click({ conversationId: "c1", root: "/w/b" });
  expect(open).toHaveBeenCalledWith("c1");
  expect(harness.controller!.openWorkspace).toHaveBeenCalledWith("/w/b", expect.any(Function), false, expect.any(Function), true);
  expect(onSettings()).toBe(false);
  // Unknown with a registered root: that project's Overview.
  reset(); openFromWorkspace();
  click({ conversationId: "gone", root: "/w/b" });
  expect(harness.controller!.openWorkspace).toHaveBeenCalledWith("/w/b", expect.any(Function), false, undefined, true);
  expect(onSettings()).toBe(false);
  // Unknown and unregistered: the window only.
  reset(); openFromWorkspace();
  click({ conversationId: "gone", root: "/w/elsewhere" });
  expect(onSettings()).toBe(true);
  for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method]).not.toHaveBeenCalled();
  // A modal: the window only (the locked page is in the lock test above).
  reset(); openFromWorkspace();
  settings()!.props.sidebar.props.search!(); render();
  expect(find(QuickOpen)).toHaveLength(1);
  click({ conversationId: "gone", root: "/w/b" });
  for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method]).not.toHaveBeenCalled();
});

test("a sign-in toast's Open Agents settings opens that provider's row; the window's focus reaches the sign-in controller", () => {
  render();
  folders([listed("/w/a")]);
  harness.signIn.onToast!({ text: "Codex connected.", action: null });
  expect(harness.toast.show).toHaveBeenLastCalledWith("Codex connected.", undefined, undefined);
  harness.signIn.onToast!({ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } });
  expect(harness.toast.show.mock.lastCall![1]).toBe("Open Agents settings");
  (harness.toast.show.mock.lastCall![2] as () => void)(); render();
  expect(settings()!.props).toMatchObject({ section: "agents", arrival: { focus: { kind: "provider", provider: "codex" } } });
  windowListeners.focus!({} as never);
  expect(harness.signIn.windowFocused).toHaveBeenCalledTimes(1);
});

test("App reads preferences once; Home starts from the saved default and Settings' saves update it", async () => {
  render();
  folders([listed("/w/a")]);
  await Promise.resolve(); await Promise.resolve(); render();
  expect(doan.readPreferences).toHaveBeenCalledTimes(1);
  expect(homeEl()!.props.defaults).toEqual({ provider: "codex" });
  cmdComma();
  expect(settings()!.props.agents).toMatchObject({ preferences: PREFS, project: { root: "/w/a", name: "a" } });
  const saved: PreferencesSnapshot = { ...PREFS, preferences: { ...PREFS.preferences, newConversation: null } };
  doan.savePreferences!.mockResolvedValueOnce({ ok: true, snapshot: saved });
  await settings()!.props.agents.save({ newConversation: null }); render();
  expect(doan.savePreferences).toHaveBeenCalledWith({ newConversation: null });
  expect(settings()!.props.agents.preferences).toEqual(saved);
  click(topBar(settings()!.props.header).projects);
  expect(homeEl()!.props.defaults).toBeNull();
  expect(doan.readPreferences).toHaveBeenCalledTimes(1);
});

// design '창 제거와 IPC' 잃는 보장: the Settings page shares the main window's preload, so only this convention keeps it
// from starting or sending a conversation.
test("Settings components never start or send a conversation", () => {
  const dir = new URL(".", import.meta.url);
  const files = readdirSync(dir).filter(name => /^Settings.*\.tsx$/.test(name) && !name.includes(".test."));
  expect(files).toEqual(expect.arrayContaining(["SettingsAgents.tsx", "SettingsPage.tsx"]));
  for (const name of files) expect(readFileSync(new URL(name, dir), "utf8"), name).not.toMatch(/startConversation|sendConversation/);
});

// project-settings T4: Project Settings is a page now (design '이동과 잠금'). App opens it from the project menus,
// keeps the origin it shares with Add Projects and Settings, holds the page's lock and leaves when its worktree goes.
type ProjectPage = ReactElement<{ root: string; origin: unknown; arrival: { seq: number } | null; header: ReactElement; sidebar: Sidebar & { props: { home?: boolean } };
  onState(report: { locked: boolean }): void; onGone(): void; onRerooted(root: string, origin: unknown): void;
  onAction(action: string, root: string, notice: (text: string) => void): void; onRemove(): void }>;
const projectPage = () => find<ProjectPage["props"]>(ProjectSettingsPage)[0] as ProjectPage | undefined;
const grouped = (path: string): FolderEntry => ({ ...listed(path), git: { common: "/w/a/.git", main: "/w/a", worktrees: [] } } as FolderEntry);
const sidebarOf = () => find<{ projectSettings(root: string): void; worktree(root: string): void; toggle(key: string): void; locked?: boolean; home?: boolean; cards: { key: string; rows: { path: string }[] }[] }>(ShellSidebar)[0]!.props;
const openProjectSettings = (root = "/w/a") => { sidebarOf().projectSettings(root); render(); };
const lockPage = (locked = true) => { projectPage()!.props.onState({ locked }); render(); };
// From a workspace on /w/a, open /w/a's Project Settings from its sidebar menu.
function projectSettingsFromWorkspace(entries: FolderEntry[] = [listed("/w/a"), listed("/w/b")]) {
  render();
  folders(entries);
  sidebarOf().worktree("/w/a"); render();
  openProjectSettings("/w/a");
  expect(projectPage()).toBeDefined();
  clearController();
}

// The Home row as the sidebar draws it: current only on Home (PRODUCT §5 item 3), not on a page showing Home's sidebar.
const homeRowCurrent = (sidebar: ReactElement) => /class="shell-home-row row"[^>]*aria-current="page"/.test(renderToStaticMarkup(sidebar));

test("Project Settings opens as a page from Home, a workspace or Add Projects: the Projects tab is current, the sidebar marks no row, not even Home, the menu sees Settings", () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  openProjectSettings("/w/a");
  const page = projectPage()!;
  expect(page.props).toMatchObject({ root: "/w/a", origin: { screen: "home" } });
  expect(page.props.arrival?.seq).toBeGreaterThan(0);
  const bar = topBar(page.props.header);
  expect(bar.projects.props["aria-current"]).toBe("page");
  expect([bar.add.props["aria-current"], bar.settings.props["aria-current"]]).toEqual([undefined, undefined]);
  expect([bar.back.props.disabled, bar.forward.props.disabled]).toEqual([false, true]);
  // Home's sidebar: no current project or canvas, no category list, and the Home row is not current either.
  expect(page.props.sidebar.props.home).toBe(true);
  expect(page.props.sidebar.props.settings).toBeUndefined();
  expect(homeRowCurrent(page.props.sidebar)).toBe(false);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "settings", modal: false });
  // Nothing modal: the page is a screen, so the toast keeps running.
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(false);
  // From a workspace the workspace is the origin; from Add Projects the origin stays.
  reset(); projectSettingsFromWorkspace();
  expect(projectPage()!.props.origin).toEqual({ screen: "workspace", root: "/w/a" });
  click(topBar(projectPage()!.props.header).add);
  expect(addPage()).toBeDefined();
  expect(homeRowCurrent(find<Record<string, unknown>>(AddProjectsPage)[0]!.props.sidebar as ReactElement)).toBe(false);
  openProjectSettings("/w/b");
  expect(projectPage()!.props).toMatchObject({ root: "/w/b", origin: { screen: "workspace", root: "/w/a" } });
  // And back to Settings and Add Projects without changing it either.
  click(topBar(projectPage()!.props.header).settings);
  expect(onSettings()).toBe(true);
  click(topBar(settings()!.props.header).projects);
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
});

test("the Overview's recovery menu opens the page too", () => {
  render();
  folders([listed("/w/a")]);
  sidebarOf().worktree("/w/a"); render();
  find<{ onProjectSettings(root: string): void }>(ProjectOverview)[0]!.props.onProjectSettings("/w/a"); render();
  expect(projectPage()!.props).toMatchObject({ root: "/w/a", origin: { screen: "workspace", root: "/w/a" } });
});

test("Projects tab, Back and Escape leave for the origin, Home when the origin project is gone; the loaded project's row opens its Overview", async () => {
  for (const leave of [() => click(topBar(projectPage()!.props.header).projects), () => click(topBar(projectPage()!.props.header).back), escape]) {
    reset();
    projectSettingsFromWorkspace();
    readUiState(null); await Promise.resolve(); await Promise.resolve(); render();
    expect(doan.saveUiState!.mock.lastCall?.[0]).toMatchObject({ screen: "workspace", root: "/w/a" });
    leave();
    expect(projectPage()).toBeUndefined();
    expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
    // The workspace was kept hidden, not opened again.
    expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
    // From a workspace on /w/b, the origin /w/b removed: Home.
    reset();
    render();
    folders([listed("/w/a"), listed("/w/b")]);
    sidebarOf().worktree("/w/b"); render();
    openProjectSettings("/w/a");
    folders([listed("/w/a")]);
    leave();
    expect(projectPage()).toBeUndefined();
    expect(homeEl()).toBeDefined();
  }
  // The loaded project's sidebar row opens its Overview, as from Home.
  reset();
  projectSettingsFromWorkspace();
  const key = sidebarOf().cards.find(card => card.rows.some(row => row.path === "/w/a"))!.key;
  sidebarOf().toggle(key); render();
  expect(harness.controller!.showOverview).toHaveBeenCalledTimes(1);
  expect(projectPage()).toBeUndefined();
});

test("picking another worktree's Project Settings on the page switches to it with a new page and the same origin; the same one focuses the title", () => {
  projectSettingsFromWorkspace();
  const first = projectPage()!;
  openProjectSettings("/w/a");
  expect(projectPage()!.key).toBe(first.key);
  expect(projectPage()!.props.arrival!.seq).toBeGreaterThan(first.props.arrival!.seq);
  openProjectSettings("/w/b");
  const second = projectPage()!;
  // A new key mounts a new page: /w/a's config session ends and its late replies can't reach /w/b's page.
  expect(second.key).not.toBe(first.key);
  expect(second.props).toMatchObject({ root: "/w/b", origin: { screen: "workspace", root: "/w/a" } });
  // Picking /w/a again right away remounts once more; the origin is still the workspace.
  openProjectSettings("/w/a");
  expect(projectPage()!.key).not.toBe(second.key);
  expect(projectPage()!.props).toMatchObject({ root: "/w/a", origin: { screen: "workspace", root: "/w/a" } });
  click(topBar(projectPage()!.props.header).back);
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
});

test("while the page holds a picker, a confirmation or a write, every way out and every entry from outside is ignored; the toast waits", () => {
  const moves: [string, () => void][] = [
    ["Projects tab", () => click(topBar(projectPage()!.props.header).projects)],
    ["Back", () => click(topBar(projectPage()!.props.header).back)],
    ["Add Projects tab", () => click(topBar(projectPage()!.props.header).add)],
    ["Settings tab", () => click(topBar(projectPage()!.props.header).settings)],
    ["Escape", escape],
    ["Go > Home", () => { listeners.menu!("home" as never); render(); }],
    ["Quick Open", () => { listeners.menu!("quickOpen" as never); render(); }],
    ["Search", () => { (projectPage()!.props.sidebar.props.search as () => void)(); render(); }],
    ["sidebar worktree", () => { sidebarOf().worktree("/w/b"); render(); }],
    ["sidebar project row", () => { sidebarOf().toggle(sidebarOf().cards[0]!.key); render(); }],
    ["another worktree's Project Settings", () => openProjectSettings("/w/b")],
    ["Settings… (⌘,)", () => cmdComma()],
    ["sign-in toast", () => { harness.signIn.onToast!({ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } }); (harness.toast.show.mock.lastCall![2] as () => void)(); render(); }],
    ["notification click", () => { listeners.notificationClick!({ conversationId: "gone", root: "/w/b" } as never); render(); }],
    ["File > Add Project…", () => { listeners.openAddProjects!(); render(); }],
  ];
  for (const [name, move] of moves) {
    reset();
    projectSettingsFromWorkspace();
    const before = projectPage()!;
    lockPage();
    move();
    expect(projectPage()?.props.root, name).toBe("/w/a");
    expect(projectPage()!.key, name).toBe(before.key);
    expect(onSettings(), name).toBe(false);
    expect(addPage(), name).toBeUndefined();
    for (const method of ["openWorkspace", "openCanvas", "showOverview"]) expect(harness.controller![method], `${name}: ${method}`).not.toHaveBeenCalled();
    expect(find(QuickOpen), name).toHaveLength(0);
  }
  reset();
  projectSettingsFromWorkspace();
  lockPage();
  const bar = topBar(projectPage()!.props.header);
  for (const button of [bar.add, bar.projects, bar.settings, bar.back]) expect(button.props["aria-disabled"]).toBe(true);
  expect(projectPage()!.props.sidebar.props.locked).toBe(true);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "settings", modal: false, locked: true });
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(true);
  // A Settings target that came in while locked was dropped, not queued.
  cmdComma({ section: "about" });
  lockPage(false);
  expect(onSettings()).toBe(false);
  expect(harness.toast.setModal).toHaveBeenLastCalledWith(false);
  expect(doan.setMenuState!).toHaveBeenLastCalledWith({ screen: "settings", modal: false });
  click(topBar(projectPage()!.props.header).projects);
  expect(projectPage()).toBeUndefined();
});

test("a doan:// link leaves an unlocked page for its canvas and is dropped on a locked one", () => {
  projectSettingsFromWorkspace();
  lockPage();
  listeners.openLink!({ kind: "navigate", root: "/w/b", canvas: rowA.path } as never); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(projectPage()).toBeDefined();
  lockPage(false);
  listeners.openLink!({ kind: "navigate", root: "/w/b", canvas: rowA.path } as never); render();
  const call = harness.controller!.openCanvas!.mock.lastCall!;
  expect(call.slice(0, 2)).toEqual(["/w/b", rowA]);
  (call[3] as { opened(): void }).opened(); render();
  expect(projectPage()).toBeUndefined();
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
});

test("a doan open request on a locked page answers busy with that page and moves nowhere, and opens once unlocked", () => {
  projectSettingsFromWorkspace();
  harness.controller!.openCanvas!.mockImplementation((...args: unknown[]) => { (args[3] as { opened?: () => void } | undefined)?.opened?.(); });
  lockPage();
  listeners.openRequest!({ id: "1", root: "/w/b", canvas: rowA.path, expires: Date.now() + 1000 } as never); render();
  expect(harness.controller!.openCanvas).not.toHaveBeenCalled();
  expect(projectPage()).toBeDefined();
  lockPage(false);
  listeners.openRequest!({ id: "2", root: "/w/b", canvas: rowA.path, expires: Date.now() + 1000 } as never); render();
  expect(harness.controller!.openCanvas!.mock.lastCall!.slice(0, 2)).toEqual(["/w/b", rowA]);
  expect(projectPage()).toBeUndefined();
  expect(doan.answerOpenRequest!.mock.calls).toStrictEqual([[{ id: "1", kind: "busy", reason: "project_settings" }], [{ id: "2", kind: "opened", frame: "none" }]]);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("while Add Projects is locked the sidebar shows Project Settings unavailable and it opens nothing", () => {
  render();
  folders([listed("/w/a")]);
  click(topBar(homeEl()!.props.header).add);
  find<{ onState(report: { locked: boolean; choose: boolean }): void }>(AddProjectsPage)[0]!.props.onState({ locked: true, choose: false }); render();
  expect(sidebarOf().locked).toBe(true);
  openProjectSettings("/w/a");
  expect(projectPage()).toBeUndefined();
  expect(addPage()).toBeDefined();
});

test("the page's worktree removed while the page is locked leaves for the origin anyway", () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/b"); render();
  openProjectSettings("/w/a");
  lockPage();
  folders([listed("/w/b")]);
  projectPage()!.props.onGone(); render();
  expect(projectPage()).toBeUndefined();
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
  // The lock went with the page.
  click(topBar(workspaceHeader()).projects);
  expect(homeEl()).toBeDefined();
});

test("Locate or Set Up moving the worktree keeps the page and its origin on the new root", () => {
  projectSettingsFromWorkspace([listed("/w/a")]);
  const before = projectPage()!;
  listeners.folders!([listed("/w/moved")] as never, { from: "/w/a", root: "/w/moved" } as never); render();
  // The page follows the reroot itself (followProjectSettings) and reports it.
  projectPage()!.props.onRerooted("/w/moved", { screen: "workspace", root: "/w/moved" }); render();
  expect(projectPage()!.key).toBe(before.key);
  expect(projectPage()!.props).toMatchObject({ root: "/w/moved", origin: { screen: "workspace", root: "/w/moved" } });
  click(topBar(projectPage()!.props.header).back);
  expect(projectPage()).toBeUndefined();
  expect(homeEl()).toBeUndefined();
  expect(topBar(workspaceHeader()).projects.props["aria-current"]).toBe("page");
});

// main reports a located project as a re-root focus (shell.replace), like Set Up. From Home, Add Projects or the Project
// Settings page the Locate does not open the new root, so the loaded root must not follow it (the controller never
// opened it); only the workspace Locate, which opens the new root itself, keeps working as before.
const locating = () => { let finish: (value: unknown) => void = () => {}; doan.locateProject = vi.fn(() => new Promise(resolve => { finish = resolve; })); return (value: unknown) => finish(value); };
const loadedOf = (sidebar: ReactElement) => (sidebar.props as { loaded?: unknown }).loaded;
const settleLocate = async () => { await Promise.resolve(); await Promise.resolve(); render(); };

test("Locate of the loaded root from Home does not move the loaded root to the located one", async () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  expect(loadedOf(find(ShellSidebar)[0]!)).toBe("/w/a");
  find<{ goHome(): void }>(ShellSidebar)[0]!.props.goHome(); render();
  expect(homeEl()).toBeDefined();
  clearController();
  const answer = locating();
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("locate", "/w/a"); render();
  listeners.folders!([listed("/w/moved"), listed("/w/b")] as never, { from: "/w/a", root: "/w/moved" } as never); render();
  answer({ kind: "located", root: "/w/moved" }); await settleLocate();
  expect(loadedOf(find(ShellSidebar)[0]!)).not.toBe("/w/moved");
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
});

test("Locate of the loaded root from the Project Settings page does not move the loaded root, while the page follows", async () => {
  projectSettingsFromWorkspace([listed("/w/a"), listed("/w/b")]);
  expect(loadedOf(projectPage()!.props.sidebar)).toBe("/w/a");
  const answer = locating();
  projectPage()!.props.onAction("locate", "/w/a", vi.fn()); render();
  listeners.folders!([listed("/w/moved"), listed("/w/b")] as never, { from: "/w/a", root: "/w/moved" } as never); render();
  answer({ kind: "located", root: "/w/moved" }); await settleLocate();
  expect(loadedOf(projectPage()!.props.sidebar)).not.toBe("/w/moved");
  expect(harness.controller!.openWorkspace).not.toHaveBeenCalled();
});

test("Locate from the workspace still opens the located root", async () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  clearController();
  const answer = locating();
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("locate", "/w/a"); render();
  listeners.folders!([listed("/w/moved"), listed("/w/b")] as never, { from: "/w/a", root: "/w/moved" } as never); render();
  answer({ kind: "located", root: "/w/moved" }); await settleLocate();
  expect(harness.controller!.openWorkspace).toHaveBeenCalledWith("/w/moved", expect.any(Function));
});

// Locate now produces re-roots too, and one is never consumed: a later in-place Set Up of a root equal to an old
// re-root's `from` must not follow that old move.
test("Set Up chooses the re-root made after it started, not an older one from the same root", () => {
  render();
  folders([{ path: "/w/a", kind: "uninitialized" }]);
  listeners.folders!([listed("/w/old")] as never, { from: "/w/a", root: "/w/old" } as never); render();
  folders([{ path: "/w/a", kind: "uninitialized" }, listed("/w/old")]);
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("setUp", "/w/a"); render();
  expect(find(ProjectSetupDialog)).toHaveLength(1);
  folders([listed("/w/a"), listed("/w/old")]);
  expect(find(ProjectSetupDialog)).toHaveLength(0);
  expect(homeEl()!.props.select).toMatchObject({ root: "/w/a" });
});

test("Set Up chooses the root it was re-rooted to", () => {
  render();
  folders([{ path: "/w/a", kind: "uninitialized" }]);
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("setUp", "/w/a"); render();
  listeners.folders!([listed("/w/up")] as never, { from: "/w/a", root: "/w/up" } as never); render();
  expect(find(ProjectSetupDialog)).toHaveLength(0);
  expect(homeEl()!.props.select).toMatchObject({ root: "/w/up" });
});

// A fake focusable element for focusCurrent's checks (connected, in the page's shell, visible).
function focusable(name: string, focused: string[], connected = true) {
  return Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), {
    name, isConnected: connected, focus: () => focused.push(name), matches: () => false, getClientRects: () => [{}],
    closest: (selector: string) => selector === ".settings-shell" ? {} : null,
  });
}

test("Set Up opens its dialog over the page; closed from outside, focus returns to the page once the dialog is gone", () => {
  render();
  folders([{ path: "/w/a", kind: "uninitialized" }]);
  openProjectSettings("/w/a");
  const focused: string[] = [];
  const setUpButton = focusable("Set Up", focused), heading = focusable("title", focused);
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  vi.stubGlobal("document", { activeElement: setUpButton, body: {}, querySelector: () => null, querySelectorAll: (selector: string) => selector === ".settings-panel h1" ? [heading] : [] });
  projectPage()!.props.onAction("setUp", "/w/a", vi.fn()); render();
  expect(find<{ root: string }>(ProjectSetupDialog)[0]?.props.root).toBe("/w/a");
  expect(projectPage()).toBeDefined();
  expect(doan.setMenuState!).toHaveBeenLastCalledWith(expect.objectContaining({ screen: "settings", modal: true }));
  // `doan init` in a terminal: the dialog closes, the page shows the settings and its Set Up button is gone.
  Object.assign(setUpButton, { isConnected: false });
  folders([listed("/w/a")]);
  expect(find(ProjectSetupDialog)).toHaveLength(0);
  expect(projectPage()).toBeDefined();
  expect(focused).toEqual(["title"]);
});

// project-remove-confirm design §2: every Remove from Doan asks first in one alert dialog, found by its role and title.
const removalDialog = () => all(tree).find(element => element.type === "dialog" && element.props.role === "alertdialog" && element.props["aria-labelledby"] === "project-remove-title");
const removalTitle = () => { const dialog = removalDialog(); return dialog && all(dialog).find(element => element.props.id === "project-remove-title")?.props.children; };
const dialogButton = (label: string) => all(removalDialog()!).find(element => element.type === "button" && element.props.children === label)!;
const removed = () => vi.fn(async () => ({ kind: "removed" }));

test("Remove from Doan on the page asks first for the page's whole group; Cancel returns focus; confirming removes without a toast and the page leaves", async () => {
  projectSettingsFromWorkspace([grouped("/w/a"), grouped("/w/b"), listed("/w/c")]);
  doan.removeProjects = removed();
  const focused: string[] = [];
  const removeButton = focusable("Remove from Doan", focused);
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  vi.stubGlobal("document", { activeElement: removeButton, body: {}, querySelector: () => null, querySelectorAll: () => [] });
  projectPage()!.props.onRemove(); render();
  expect(removalTitle()).toBe("Remove a from Doan?");
  expect(removalDialog()!.props["aria-describedby"]).toBe("project-remove-body");
  expect(dialogButton("Remove from Doan")).toBeDefined();
  expect(doan.removeProjects).not.toHaveBeenCalled();
  expect(projectPage()).toBeDefined();
  click(dialogButton("Cancel"));
  expect(removalDialog()).toBeUndefined();
  expect(focused).toEqual(["Remove from Doan"]);
  expect(doan.removeProjects).not.toHaveBeenCalled();
  // Confirmed: removed with no toast, and the page leaves once its worktree is gone.
  projectPage()!.props.onRemove(); render();
  click(dialogButton("Remove from Doan"));
  await Promise.resolve(); await Promise.resolve(); render();
  expect(doan.removeProjects).toHaveBeenCalledWith(["/w/a", "/w/b"]);
  expect(harness.toast.show).not.toHaveBeenCalled();
  folders([listed("/w/c")]);
  projectPage()!.props.onGone(); render();
  expect(projectPage()).toBeUndefined();
  expect(homeEl()).toBeDefined();
});

test("the sidebar menu and the status line ask first too; Escape removes nothing and returns focus", () => {
  const entrances: [string, () => void, string][] = [
    ["sidebar menu", () => { find<{ remove(roots: string[]): void }>(ShellSidebar)[0]!.props.remove(["/w/a"]); render(); }, "Remove a from Doan?"],
    ["status line", () => { sidebarOf().worktree("/w/b"); render(); find<{ action(name: string, root: string): void }>(ProblemActions)[0]!.props.action("remove", "/w/b"); render(); }, "Remove b from Doan?"],
  ];
  for (const [name, open, title] of entrances) {
    reset();
    render();
    folders([listed("/w/a"), { path: "/w/b", kind: "notFound" }, listed("/w/c")]);
    doan.removeProjects = removed();
    const focused: string[] = [];
    const menu = Object.assign(focusable("menu", focused), { closest: (selector: string) => selector === ".home-shell" || selector === ".workspace" ? {} : null });
    vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
    vi.stubGlobal("document", { activeElement: menu, body: {}, querySelector: () => null, querySelectorAll: () => [] });
    open();
    expect(removalTitle(), name).toBe(title);
    expect(doan.removeProjects, name).not.toHaveBeenCalled();
    (removalDialog()!.props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render();
    expect(removalDialog(), name).toBeUndefined();
    expect(focused, name).toEqual(["menu"]);
    expect(doan.removeProjects, name).not.toHaveBeenCalled();
  }
});

test("one worktree of several removed from the status line is named by its branch", () => {
  render();
  folders([{ ...grouped("/w/a"), git: { common: "/w/a/.git", main: "/w/a", branch: "main", worktrees: [] } } as FolderEntry, { ...grouped("/w/b"), git: { common: "/w/a/.git", main: "/w/a", branch: "fix", worktrees: [] } } as FolderEntry]);
  sidebarOf().worktree("/w/b"); render();
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("remove", "/w/b"); render();
  expect(removalTitle()).toBe("Remove a (fix) from Doan?");
});

test("with a running conversation only its Stop and Remove confirmation shows", async () => {
  render();
  folders([listed("/w/a"), listed("/w/c")]);
  doan.removeProjects = removed();
  const run = hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as InstanceType<typeof HomeRun>;
  vi.spyOn(run as unknown as { merged(): Map<string, unknown[]> }, "merged").mockReturnValue(new Map([["/w/a", [{ conversationId: "c1", state: "current", working: true, phase: "running" }]]]));
  doan.interruptConversation = vi.fn(async () => {});
  find<{ remove(roots: string[]): void }>(ShellSidebar)[0]!.props.remove(["/w/a"]); render();
  expect(all(tree).filter(element => element.type === "dialog")).toHaveLength(1);
  expect(removalTitle()).toBe("Stop the conversation and remove a?");
  click(dialogButton("Stop and Remove"));
  for (let i = 0; i < 4; i++) await Promise.resolve();
  render();
  expect(doan.interruptConversation).toHaveBeenCalledWith({ conversationId: "c1" });
  expect(doan.removeProjects).toHaveBeenCalledWith(["/w/a"]);
  expect(harness.toast.show).not.toHaveBeenCalled();
});

test("the removal confirmation closes when a path it names leaves the list", () => {
  render();
  folders([listed("/w/a"), listed("/w/c")]);
  doan.removeProjects = removed();
  find<{ remove(roots: string[]): void }>(ShellSidebar)[0]!.props.remove(["/w/a"]); render();
  expect(removalDialog()).toBeDefined();
  listeners.folders!([listed("/w/a2"), listed("/w/c")] as never, { from: "/w/a", root: "/w/a2" } as never); render();
  expect(removalDialog()).toBeUndefined();
  expect(doan.removeProjects).not.toHaveBeenCalled();
});

const problemEntries: FolderEntry[] = [
  { path: "/w/a", kind: "loading" },
  { path: "/w/a", kind: "notFound" },
  { path: "/w/a", kind: "uninitialized" },
  { path: "/w/a", kind: "cliError", reason: "Unavailable" },
  { path: "/w/a", kind: "error", message: "Invalid config" },
];

// buzz-project spec decision 12: an Overview that turns into a problem stays (thread readable, Send held) with its own
// panel; a project entered as a problem shows the problem screen with the canvas page's conversation panel
// (buzz-canvas R4: no Canvas info on the canvas page).
test("the Overview's panel replaces the conversation panel, and stays while the open Overview's project is a problem", () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(RightPanel)).toHaveLength(0);
  expect(find(ProjectOverview)).toHaveLength(1);
  for (const entry of problemEntries) {
    folders([entry]);
    expect(find(RightPanel), entry.kind).toHaveLength(0);
    expect(find<{ unavailable: string | null }>(ProjectOverview)[0]?.props.unavailable, entry.kind).toBe("a isn’t available. Fix it from its menu in the sidebar.");
  }
  listeners.menu!("home" as never); render();
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  expect(find(ProjectOverview)).toHaveLength(0);
  expect(find(RightPanel)).toHaveLength(0);
  expect(find(ConversationPanel)).toHaveLength(1);
});

test("only Overview hides a conversation strip when no canvas is open", () => {
  render(); folders([listed("/w/a")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  const run = hooks.refs.find(ref => ref.current instanceof HomeRun)!.current as InstanceType<typeof HomeRun>;
  vi.spyOn(run, "strip").mockReturnValue({ conversation: { conversationId: "c1", root: "/w/a", provider: "codex", phase: "working" }, state: { kind: "working", activity: null } });
  render();
  expect(find(KeyedConversationStrip)).toHaveLength(0);
  // The open Overview stays through a problem, so the strip stays hidden; a problem screen entered anew shows it.
  for (const entry of problemEntries) {
    folders([entry]);
    expect(find(KeyedConversationStrip), entry.kind).toHaveLength(0);
  }
  listeners.menu!("home" as never); render();
  for (const entry of problemEntries) {
    folders([entry]);
    find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
    expect(find(KeyedConversationStrip), entry.kind).toHaveLength(1);
  }
  folders([listed("/w/a")]);
  expect(find(KeyedConversationStrip)).toHaveLength(0);
});

// buzz-project design §2.5: a worktree picked from the Overview's branch chip lands focus on the new Overview's chip;
// the runtime test found it on the sidebar's project row, where the workspace's default focus put it after the chip.
test("a worktree picked from the branch chip focuses the new Overview's chip, not the sidebar row", () => {
  render(); folders([listed("/w/a"), listed("/w/b")]);
  find<{ worktree(root: string): void }>(ShellSidebar)[0]!.props.worktree("/w/a"); render();
  const focused: string[] = [];
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelectorAll: () => [], querySelector: (selector: string) => ({ focus: () => focused.push(selector) }) });
  find<{ onWorktree(root: string): void }>(ProjectOverview)[0]!.props.onWorktree("/w/b"); render();
  expect(find<{ root: string }>(ProjectOverview)[0]!.props.root).toBe("/w/b");
  expect(focused).toEqual([".workspace .ov-main .wt-chip"]);
});

// project-settings design '영향 범위' 복구 라벨: a problem workspace with no canvas open points at the status line's
// recovery action above the canvas, by its label without the ellipsis.
test("the canvas area of a missing or not set up workspace points at Locate or Set Up above", () => {
  const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? text(node.props.children) : "";
  for (const [entry, sentence] of [[{ path: "/w/a", kind: "notFound" }, "The project a is missing. Use Locate above."], [{ path: "/w/a", kind: "uninitialized" }, "The project a is not set up. Use Set Up above."]] as [FolderEntry, string][]) {
    reset();
    render();
    folders([entry]);
    sidebarOf().worktree("/w/a"); render();
    const pane = all(tree).find(element => "viewport" in (element.props as object))!;
    const status = all((pane.type as (props: unknown) => ReactNode)(pane.props)).find(element => element.props.className === "canvas-status")!;
    expect(text(status), entry.kind).toBe(sentence);
  }
});

// Fix round 1 (review RA2 ⚪3): what the sidebar does around the page, as Home does.
test("entering the page leaves the sidebar's expansion as it was", () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  const before = JSON.stringify(sidebarOf().cards.map(card => [card.key, (find<{ projects: Record<string, { expanded: boolean }> }>(ShellSidebar)[0]!.props.projects[card.key])?.expanded ?? false]));
  openProjectSettings("/w/b");
  const after = JSON.stringify(sidebarOf().cards.map(card => [card.key, (find<{ projects: Record<string, { expanded: boolean }> }>(ShellSidebar)[0]!.props.projects[card.key])?.expanded ?? false]));
  expect(projectPage()).toBeDefined();
  expect(after).toBe(before);
});

test("another project's row opens its Overview from the page, as from Home, never its last canvas", async () => {
  projectSettingsFromWorkspace();
  const key = sidebarOf().cards.find(card => card.rows.some(row => row.path === "/w/b"))!.key;
  sidebarOf().toggle(key); for (let i = 0; i < 5; i++) await Promise.resolve(); render();
  expect(harness.controller!.openWorkspace).toHaveBeenLastCalledWith("/w/b", expect.any(Function), false, undefined, true);
  expect(projectPage()).toBeUndefined();
});

// project-remove-confirm design §1: the loaded workspace's project leaving the list (Remove from Doan) goes Home; a
// reroot (Locate, Set Up) or another project's removal keeps the workspace.
const workspaceMain = () => all(tree).find(element => element.type === "main" && String(element.props.className).includes("workspace"))!;
const workspaceShown = () => (workspaceMain().props.style as { visibility: string }).visibility === "visible" && workspaceMain().props.inert === false;

test("removing the project of a workspace showing a canvas goes Home and hides the workspace", () => {
  render();
  folders([listed("/w/a"), listed("/w/c")]);
  harness.controller!.openCanvas!.mockImplementation((_root: string, _row: CanvasRow, _view: unknown, done: { opened(): void }) => done.opened());
  find<{ open(root: string, row: CanvasRow): void }>(ShellSidebar)[0]!.props.open("/w/a", rowA); render();
  expect(workspaceShown()).toBe(true);
  clearController();
  folders([listed("/w/c")]);
  expect(homeEl()).toBeDefined();
  expect(workspaceMain().props.style).toEqual({ visibility: "hidden" });
  expect(workspaceMain().props.inert).toBe(true);
  expect(harness.controller!.cancelWorkspaceOpen).toHaveBeenCalled();
});

test("removing the project of a workspace showing its Overview or a problem goes Home", () => {
  for (const entry of [listed("/w/a"), { path: "/w/a", kind: "notFound" } as FolderEntry]) {
    reset();
    render();
    folders([entry, listed("/w/c")]);
    sidebarOf().worktree("/w/a"); render();
    expect(workspaceShown()).toBe(true);
    folders([listed("/w/c")]);
    expect(homeEl(), entry.kind).toBeDefined();
    expect(workspaceMain().props.style).toEqual({ visibility: "hidden" });
  }
});

test("removing another project keeps the loaded workspace", () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  folders([listed("/w/a")]);
  expect(workspaceShown()).toBe(true);
  expect(loadedOf(find(ShellSidebar)[0]!)).toBe("/w/a");
});

test("a workspace Locate or a Set Up reroot of the loaded root keeps the workspace on the new root", async () => {
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  const answer = locating();
  find<{ action(name: string, root: string): void }>(ShellSidebar)[0]!.props.action("locate", "/w/a"); render();
  listeners.folders!([listed("/w/moved"), listed("/w/b")] as never, { from: "/w/a", root: "/w/moved" } as never); render();
  expect(workspaceShown()).toBe(true);
  answer({ kind: "located", root: "/w/moved" }); await settleLocate();
  expect(workspaceShown()).toBe(true);
  expect(loadedOf(find(ShellSidebar)[0]!)).toBe("/w/moved");
  // A Set Up reroot arrives as a focus on the same list event.
  reset();
  render();
  folders([listed("/w/a"), listed("/w/b")]);
  sidebarOf().worktree("/w/a"); render();
  listeners.folders!([listed("/w/a2"), listed("/w/b")] as never, { from: "/w/a", root: "/w/a2" } as never); render();
  expect(workspaceShown()).toBe(true);
  expect(loadedOf(find(ShellSidebar)[0]!)).toBe("/w/a2");
});
