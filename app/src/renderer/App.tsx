import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ShellSidebar } from "./ShellSidebar";
import { commitVisit, emptyHistory, historyTarget, reconcileProjects, selectProjectRoot, type Visit } from "./shellNavigation";
import { canvasLabel, moveExpanded } from "./canvasTree";
import type { Selection } from "../formats/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { MenuCommand, ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState } from "./CanvasController";
import { projectNames } from "./projectRow";
import { ArrowLeft, ArrowRight, Minus, Plus, Settings, LayoutGrid } from "lucide-react";
import { Home, ProblemActions, useProjectComments } from "./Home";
import { ProjectSetupDialog } from "./ProjectSetupDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { useToast } from "./Toast";
import { AddProjectsPage, type AddPageReport } from "./AddProjectsPage";
import { addPageReturn, pageEnter, pageEscape, type AddPageEvent, type AddPageOrigin, type ShellScreen } from "./addProjectsNav";
import type { FolderFocus } from "../main/shell";
import type { RowAction } from "./homeCards";
import { groupProjects } from "./homeCards";
import { useComments } from "./useComments";
import { RightPanel } from "./RightPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { duplicateIdText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Wizard } from "./Onboarding";
import { isMainCheckout } from "./projectStep";
import { FirstPromptContext, useFirstPromptWait } from "./FirstPrompt";
import { ProjectOverview, useThumbnails } from "./ProjectOverview";
import { QuickOpen } from "./QuickOpenDialog";
import { unavailableCanvasMessage, type SearchResult } from "./quickOpen";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import type { HomeMemory, UiState, ShellProject } from "../restore/uiState";
import { emptyComposer } from "./HomeComposerView";
import { defaultProject } from "./homeComposer";
import { KeyedConversationStrip } from "./ConversationStripView";
import { stripView } from "./conversationStrip";
import { slotKey } from "./homeConversations";
import { HomeRun } from "./homeRun";
import { SettingsPage, type SettingsArrival } from "./SettingsPage";
import { parseSettingsTarget, settingsArrival, SettingsTargetQueue, type SettingsSection, type SettingsTarget } from "./settingsSections";
import { agentSignIn } from "./agentSignIn";
import { notificationTarget, type NotificationTarget } from "../main/notifications";
import type { PreferencesPatch, PreferencesSnapshot } from "../main/preferences";

// Each command names its handler; one App does not know does nothing, so a
// new menu item can never run the Undo toast's action (R-M ⚪5).
export function menuCommand(name: MenuCommand, to: { home: () => void; quickOpen: () => void; undo: () => void; review: (move: "next" | "previous") => void }): void {
  if (name === "home") to.home();
  else if (name === "quickOpen") to.quickOpen();
  else if (name === "undoRemove") to.undo();
  else if (name === "nextResolved") to.review("next");
  else if (name === "previousResolved") to.review("previous");
}

// Main replaces the main window's ui-state wholesale on each save, so every save carries Home's memory, and none is
// sent before that memory was read (it would be dropped).
export function savedUiState(input: { screen: "home" | "workspace"; loadedRoot: string | null; open: CanvasState["open"]; expanded: Record<string, string[]>; shellProjects: Record<string, ShellProject>; home: HomeMemory | null; view: UiState["view"] & {}; memory: UiState["lastByRoot"]; settingsSection?: SettingsSection }): UiState | null {
  const { screen, loadedRoot, open, expanded, shellProjects, home, view, settingsSection } = input;
  if (home === null) return null;
  const canvas = open && open.folder === loadedRoot ? open.canvas : undefined;
  const canvasId = canvas ? open?.row.id : undefined;
  // The loaded root's canvas is in `lastByRoot` too, so a restart on Home still reopens it on entry.
  const lastByRoot = { ...input.memory, ...(loadedRoot && canvas ? { [loadedRoot]: { canvas, view } } : {}) };
  return { screen, expanded, shellProjects, lastByRoot, home, ...(loadedRoot ? { root: loadedRoot } : {}), ...(canvas ? { canvas, view, ...(canvasId ? { canvasId } : {}) } : {}), ...(settingsSection ? { settingsSection } : {}) };
}

// First run's project handoff puts focus in the Home composer, ahead of the focus held before the wizard (§4.9).
export function wizardCloseFocus(root: string | null): "composer" | "previous" { return root ? "composer" : "previous"; }

export function validHistoryVisit(entries: readonly FolderEntry[], visit: Visit): boolean {
  const entry = entries.find(entry => entry.path === visit.root);
  return !!entry && entry.kind !== "notFound" && (entry.kind !== "list" || !visit.canvas || entry.canvases.some(row => row.path === visit.canvas));
}

export function App() {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace" | "addProjects" | "settings">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  // The project menu's Project Settings dialog; seq mounts each opening anew.
  const [projectSettings, setProjectSettings] = useState<{ root: string; key: string; seq: number } | null>(null);
  // The Add Projects page (buzz-add-projects design '화면과 이동'): where it returns to, the page's own report, and a
  // counter File > Add Project… raises to run its Choose folder. Mounted anew (`seq`) on each opening.
  const [page, setPage] = useState<{ origin: AddPageOrigin; seq: number; chooseSeq: number } & AddPageReport>({ origin: { screen: "home" }, seq: 0, chooseSeq: 0, locked: false, choose: true });
  const pageRef = useRef(page); pageRef.current = page;
  // The Settings page (buzz-settings design '화면과 내비게이션'): its category, what it was asked to focus on arrival, and
  // whether a category holds a confirmation or a write. It shares the Add Projects page's origin, so moving between
  // the two pages keeps where both return to.
  const [settings, setSettingsState] = useState<{ section: SettingsSection; arrival: SettingsArrival | null; locked: boolean }>({ section: "agents", arrival: null, locked: false });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const setSettings = (next: typeof settings) => { settingsRef.current = next; setSettingsState(next); };
  const settingsQueue = useRef(new SettingsTargetQueue());
  const arrivals = useRef(0);
  // A category the person or a target chose wins over the one ui-state read later.
  const sectionChosen = useRef(false);
  const beforeModal = useRef<HTMLElement | null>(null);
  const focusAfterModal = useRef(false);
  const toast = useToast(previous => {
    if (document.activeElement === document.body || !document.activeElement?.isConnected) focusCurrent(previous);
  });
  const workspaceFocus = useRef<HTMLElement | null>(null);
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [state, setState] = useState(initialCanvasState);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  const [reroot, setReroot] = useState<(FolderFocus & { seq: number }) | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const beforeWizard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, string[]>>({});
  const [shellProjects, setShellProjects] = useState<Record<string, ShellProject>>({});
  const [history, setHistory] = useState(emptyHistory);
  const historyRef = useRef(history); historyRef.current = history;
  const navigationIntent = useRef(0);
  const entriesRef = useRef(entries); entriesRef.current = entries;
  const shellRef = useRef(shellProjects); shellRef.current = shellProjects;
  // Why the open canvas was closed, shown on its project's Overview until another
  // canvas opens or the Overview is left (.doan/canvases/revision-continuity.html, duplicate-id).
  const [overviewNotice, setOverviewNotice] = useState<{ root: string; text: string } | null>(null);
  // The saved ui state until the restore is applied, then "done"; null while it is read.
  const [restore, setRestore] = useState<{ state: UiState | null; started: number } | "done" | null>(null);
  const restoreCancelled = useRef(false);
  const cancelRestore = () => { navigationIntent.current++; restoreCancelled.current = true; setRestore("done"); homeRun.current.personNavigated(); };
  const recoveryFocus = useRef<{ element: HTMLElement; root: string } | null>(null);
  // Home (buzz-home): the composer's run memory, ui-state's Home memory (null until read), the first-run handoff and
  // an added project to choose. Home conversations, their strip states and last requests live for this run only.
  const composerMemory = useRef(emptyComposer());
  const [homeMemory, setHomeMemory] = useState<HomeMemory | null>(null);
  const [select, setSelect] = useState<{ root: string; seq: number } | null>(null);
  const choose = (root: string | undefined) => { if (root) setSelect(previous => ({ root, seq: (previous?.seq ?? 0) + 1 })); };
  const focusComposer = useRef(false);
  const [, setRunTick] = useState(0);
  const homeRun = useRef<HomeRun>(null as unknown as HomeRun);
  if (!(homeRun.current instanceof HomeRun)) homeRun.current = new HomeRun({
    view: () => ({ screen: currentScreen.current, loadedRoot: loadedRootRef.current, entries: entriesRef.current }),
    label: root => live.current.projectLabel(root),
    // The move after a send cancels the restore like any navigation but is not the person's own move.
    openOverview: (root, arrived, unavailable) => {
      // The run settles with its started toast instead of waiting for a move that cannot happen.
      if (locked()) { unavailable(); return; }
      navigationIntent.current++; restoreCancelled.current = true; setRestore("done");
      controller.current?.openWorkspace(root, next => { if (!arrived()) return; workspaceFocus.current = null; live.current.completeNavigation(next); }, false, () => unavailable(), true);
    },
    // The controller's own wait for the project's read; the person's next navigation starts after this.
    cancelMove: () => controller.current?.cancelWorkspaceOpen(),
    openCanvas: (root, row) => live.current.openShellCanvas(root, row),
    goHome: () => live.current.home(),
    removeNow: paths => live.current.removeNow(paths),
    toast: (message, label, run) => live.current.toast.show(message, label, run),
    sent: request => setHomeMemory(previous => ({ ...previous, lastRoot: request.root, lastProvider: request.runtime,
      ...(request.model ? { models: { ...previous?.models, [request.runtime]: { model: request.model, ...(request.effort ? { effort: request.effort } : {}) } } } : {}) })),
    changed: () => setRunTick(tick => tick + 1),
  });
  const loadedRootRef = useRef(loadedRoot); loadedRootRef.current = loadedRoot;
  function focusCurrent(previous: HTMLElement | null = null) {
    if (document.querySelector("dialog[open]")) return;
    const scope = currentScreen.current === "home" ? ".home-shell" : currentScreen.current === "addProjects" ? ".add-shell" : currentScreen.current === "settings" ? ".settings-shell" : ".workspace";
    const usable = (node: HTMLElement | null): node is HTMLElement => !!node && node.isConnected && !!node.closest(scope)
      && !node.closest('[inert], [hidden], [aria-hidden="true"]') && !node.matches(":disabled")
      && node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible";
    const selectors = currentScreen.current === "home" ? [".home-shell .composer-input", ".home-shell button"]
      : currentScreen.current === "addProjects" ? [".add-panel h2", ".add-shell button"]
      : currentScreen.current === "settings" ? [".settings-panel h1", ".settings-shell button"]
      : ['.side [role="treeitem"][tabindex="0"]', '.shell-search', '.workspace .top button'];
    const fallback = selectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)));
    (usable(previous) ? previous : fallback.find(usable))?.focus();
  }
  const [foldersSeen, setFoldersSeen] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  useEffect(() => {
    if (!viewport.current || !board.current || !overlay.current) return;
    const sendSelection = (selection: Selection | null) => {
      window.doan.setSelection(selection).catch((error: unknown) => console.error("selection:set failed", error));
    };
    const instance = new CanvasController(viewport.current, board.current, overlay.current, setState, sendSelection, selector => window.doan.inspect(selector));
    controller.current = instance;
    const stopFolders = window.doan.onFolders((next, focus) => {
      if (focus) {
        setLoadedRoot(root => root === focus.from ? focus.root : root);
        setReroot(previous => ({ ...focus, seq: (previous?.seq ?? 0) + 1 }));
      }
      const removed = entriesRef.current.filter(entry => !next.some(row => row.path === entry.path)).map(entry => entry.path);
      if (removed.length) {
        setExpanded(previous => Object.fromEntries(Object.entries(previous).filter(([root]) => !removed.includes(root))));
        setShellProjects(previous => Object.fromEntries(Object.entries(previous).flatMap(([key, project]) => {
          const roots = project.roots.filter(root => !removed.includes(root));
          return roots.length ? [[key, { roots, expanded: project.expanded, ...(project.selectedRoot && roots.includes(project.selectedRoot) ? { selectedRoot: project.selectedRoot, ...(project.selectedAt !== undefined ? { selectedAt: project.selectedAt } : {}) } : {}) }]] : [];
        })));
        const previous = historyRef.current;
        const nextHistory = { visits: previous.visits.filter(visit => !removed.includes(visit.root)), cursor: previous.visits.slice(0, previous.cursor + 1).filter(visit => !removed.includes(visit.root)).length - 1 };
        historyRef.current = nextHistory; setHistory(nextHistory);
      }
      entriesRef.current = next;
      setEntries(next); instance.updateEntries(next); setFoldersSeen(true);
    });
    instance.canvasRemoved = ({ folder, row, duplicates }) => {
      if (duplicates === null) { live.current.toast.show(`${canvasLabel(row)} was removed from .doan/canvases/`); return; }
      const text = duplicateIdText(row, duplicates);
      live.current.toast.show(text);
      setOverviewNotice({ root: folder, text });
    };
    instance.canvasMoved = ({ folder, from, row }) => {
      setExpanded(previous => previous[folder] ? { ...previous, [folder]: moveExpanded(previous[folder], from, row.path) } : previous);
    };
    instance.viewChanged = () => live.current.save();
    instance.linkedCanvas = root => live.current.completeNavigation(root);
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace") instance.command(name); });
    return () => { navigationIntent.current++; stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { void window.doan.homeDirectory().then(setHomeDirectory).catch(console.error); }, []);
  // First run shows when main's session has no completion record (P's v1 marker); the session is the one the CLI
  // and MCP share, so a hidden and shown window keeps it.
  useEffect(() => {
    let current = true;
    window.doan.startOnboardingSession().then(reply => {
      if (!current || !reply.ok || !("sessionId" in reply.result) || reply.result.completed) return;
      const active = document.activeElement;
      beforeWizard.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setWizard(reply.result.sessionId);
    }).catch(console.error);
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (wizard === null && focusComposer.current) { focusComposer.current = false; document.querySelector<HTMLElement>(".home-shell .composer-input")?.focus(); return; }
    if (wizard !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const previous = beforeWizard.current;
    beforeWizard.current = null;
    focusCurrent(previous);
  }, [wizard]);
  // Set once the project counts below exist; a raised review marker refreshes them.
  const reviewedRoot = useRef<(root: string) => void>(() => {});
  // While the Add Projects page selects or clones, or a Settings category holds a confirmation or a write, every move
  // away is ignored here, in one place (buzz-add-projects and buzz-settings design '잠금'): marking the controls alone
  // would leak through toasts, the comment guard and keyboard activation.
  const locked = () => (currentScreen.current === "addProjects" && pageRef.current.locked) || (currentScreen.current === "settings" && settingsRef.current.locked);
  // The id-change notice's Show: the Overview's Feedback expands that id's
  // orphan group and focuses its head (project-feedback design §5).
  const [reveal, setReveal] = useState<{ root: string; id: string; seq: number } | null>(null);
  const showOrphans = (root: string, id: string) => {
    if (locked()) return;
    cancelRestore();
    controller.current?.showOverview(() => { completeNavigation(root); setReveal(previous => ({ root, id, seq: (previous?.seq ?? 0) + 1 })); });
  };
  const comments = useComments(state, controller, () => { if (!locked()) setScreen("workspace"); }, entries, root => reviewedRoot.current(root), homeDirectory, showOrphans);
  const home = () => {
    if (locked()) return;
    cancelRestore();
    controller.current?.cancelWorkspaceOpen();
    if (currentScreen.current === "workspace") workspaceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScreen("home");
  };
  useEffect(() => {
    controller.current?.setWorkspaceActive(screen === "workspace");
    if (screen === "home") {
      document.querySelector<HTMLElement>(".home-shell .composer-input")?.focus();
    } else if (screen === "workspace") {
      // A Home send lands on the strip's first action (design §4.9).
      if (homeRun.current.takeFocus() === "stop") { const stop = document.querySelector<HTMLElement>(".workspace .convo-strip [data-strip-stop]"); if (stop) { stop.focus(); return; } }
      if (comments.session.draft.draft) { document.querySelector<HTMLTextAreaElement>(".comments-panel textarea")?.focus(); return; }
      const previous = workspaceFocus.current;
      (previous?.isConnected && previous.closest(".workspace") ? previous : document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]'))?.focus();
    }
  }, [screen, loadedRoot]);
  useEffect(() => {
    if (loadedRoot && loadedRoot !== locating?.from && !entries.some(entry => entry.path === loadedRoot)) { setLoadedRoot(null); }
  }, [entries, loadedRoot, locating]);
  useEffect(() => {
    const root = locating?.root;
    if (!root) return;
    const next = entries.find(entry => entry.path === root);
    if (!next || next.kind === "loading") return;
    if (next.kind === "list") controller.current?.openWorkspace(root, setLoadedRoot);
    setLocating(null);
  }, [entries, locating]);
  useEffect(() => {
    let active = true;
    void window.doan.readUiState().then(state => state, () => null).then(state => {
      // Main replaces the whole state on each save, so Home's memory is kept even when the restore was cancelled.
      // A send that finished before this read keeps its newer choices over the saved ones.
      if (active) setHomeMemory(previous => ({ ...state?.home, ...previous }));
      if (active && state?.settingsSection && !sectionChosen.current) setSettings({ ...settingsRef.current, section: state.settingsSection });
      if (active && !restoreCancelled.current) setRestore({ state, started: performance.now() });
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (restoreCancelled.current || restore === null || restore === "done" || !foldersSeen) return;
    const elapsed = performance.now() - restore.started;
    const plan = restorePlan(restore.state, entries, elapsed);
    if (plan.kind === "wait") {
      const timer = setTimeout(() => setRestoreTick(tick => tick + 1), RESTORE_LOADING_WAIT_MS - elapsed + 10);
      return () => clearTimeout(timer);
    }
    setRestore("done");
    if (!restore.state) return;
    setExpanded(restore.state.expanded);
    setShellProjects(restore.state.shellProjects ?? {});
    for (const [root, item] of Object.entries(restore.state.lastByRoot)) controller.current?.remember(root, item);
    if (plan.kind === "home") return;
    // The workspace opens its remembered canvas and view, as a worktree switch does.
    controller.current?.remember(plan.root, plan.canvas?.view ? { canvas: plan.canvas.path, view: plan.canvas.view } : null);
    const listed = entries.find(entry => entry.path === plan.root);
    const row = plan.canvas && !plan.canvas.view && listed?.kind === "list" ? listed.canvases.find(row => row.path === plan.canvas?.path) : undefined;
    controller.current?.openWorkspace(plan.root, next => {
      setLoadedRoot(next); setScreen("workspace");
      if (row) controller.current?.openCanvas(next, row);
    });
    if (plan.missingCanvas) toast.show(`${canvasLabel({ path: plan.missingCanvas, open: 0, resolved: 0, url: "" })} is no longer in .doan/canvases/`);
    if (plan.duplicateId && listed?.kind === "list") {
      const { id, count } = plan.duplicateId, saved = restore.state.canvas;
      const named = listed.canvases.find(row => row.path === saved && row.id === id) ?? listed.canvases.find(row => row.id === id);
      if (named) {
        const text = duplicateIdText(named, count);
        toast.show(text);
        setOverviewNotice({ root: plan.root, text });
      }
    }
  }, [restore, foldersSeen, entries, restoreTick]);
  // Sent at once, pans included: main debounces the write and flushes it on
  // quit, while a value still waiting here would be lost to a quick ⌘Q.
  const save = () => {
    if (restore !== "done") return;
    const instance = controller.current;
    if (!instance) return;
    const state = savedUiState({ ...persisted.current, view: instance.currentView(), memory: instance.memory() });
    if (state) void window.doan.saveUiState(state).then(saved => { if (!saved) console.error("doan: UI state was not saved"); }).catch(console.error);
  };
  // A page is never restored; a restart opens the screen it came from. Settings keeps only its last category.
  const savedScreen = screen === "addProjects" || screen === "settings" ? page.origin.screen : screen;
  const persisted = useRef({ screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section });
  persisted.current = { screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section };
  // At commit, so a change already on screen has been sent.
  useLayoutEffect(save, [restore, savedScreen, loadedRoot, state.open, expanded, shellProjects, homeMemory, settings.section]);
  const completeNavigation = (root: string, cursor?: number) => {
    const visit = controller.current?.destination(root);
    if (!visit || !entriesRef.current.some(entry => entry.path === root)) return;
    workspaceFocus.current = null; setLoadedRoot(root); setScreen("workspace");
    const stored = historyRef.current;
    const before = stored.visits.length === 0 && loadedRoot && entriesRef.current.some(entry => entry.path === loadedRoot) && screen === "workspace" ? commitVisit(stored, { root: loadedRoot, ...(state.open ? { canvas: state.open.canvas } : {}) }) : stored;
    const next = cursor === undefined ? commitVisit(before, visit) : { ...before, cursor };
    if (next === before) return;
    historyRef.current = next; setHistory(next);
    const groups = groupProjects(entriesRef.current, new Map(entriesRef.current.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
    const group = groups.find(group => group.rows.some(row => row.path === root));
    if (group) setShellProjects(previous => ({ ...previous, [group.key]: { roots: group.rows.map(row => row.path), expanded: previous[group.key]?.expanded ?? false, selectedRoot: root, selectedAt: Date.now() } }));
  };
  const enter = (root: string) => {
    if (locked()) return;
    cancelRestore();
    if (root === loadedRoot) { controller.current?.cancelWorkspaceOpen(); setScreen("workspace"); }
    else controller.current?.openWorkspace(root, next => completeNavigation(next), false);
  };
  const openShellCanvas = (root: string, row: CanvasRow, cursor?: number) => {
    if (locked()) return;
    cancelRestore();
    controller.current?.openCanvas(root, row, undefined, { opened: () => completeNavigation(root, cursor), unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, row.path)) });
  };
  const showShellOverview = (root: string, cursor?: number) => {
    if (locked()) return;
    cancelRestore();
    if (root === loadedRoot) controller.current?.showOverview(() => completeNavigation(root, cursor));
    else controller.current?.openWorkspace(root, next => completeNavigation(next, cursor), false, undefined, true);
  };
  const cards = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const card = cards.find(card => card.rows.some(row => row.path === loadedRoot));
  const entry = entries.find(entry => entry.path === loadedRoot);
  const groupSignature = JSON.stringify(cards.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })));
  useEffect(() => {
    if (!foldersSeen || restore !== "done") return;
    // Loading may not yet expose git.common; preserve membership until classification settles.
    if (entries.some(entry => entry.kind === "loading")) return;
    setShellProjects(previous => {
      const next = reconcileProjects(previous, cards.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })));
      if (loadedRoot && card && next[card.key]?.selectedRoot !== loadedRoot) {
        const project = next[card.key]!;
        next[card.key] = { roots: project.roots, expanded: project.expanded, selectedRoot: loadedRoot };
      }
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
  }, [groupSignature, entries, loadedRoot, restore, foldersSeen]);
  const validVisit = (visit: Visit) => validHistoryVisit(entries, visit);
  const back = historyTarget(history, -1, validVisit), forward = historyTarget(history, 1, validVisit);
  const travel = (cursor: number | null) => {
    if (cursor === null || locked()) return;
    const visit = history.visits[cursor]; if (!visit) return;
    const entry = entries.find(entry => entry.path === visit.root);
    if (entry?.kind !== "list") { toast.show("This project is unavailable. Use its recovery actions."); return; }
    const row = entry.canvases.find(row => row.path === visit.canvas);
    if (visit.canvas && row) openShellCanvas(visit.root, row, cursor);
    else showShellOverview(visit.root, cursor);
  };
  const toggleProject = async (key: string) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    // A locked page keeps the disclosure; only the move to a workspace is ignored (design '잠금'). The loaded project's
    // row is always open, so activating it only ever navigates.
    if (locked()) {
      if (!loadedRoot || !group.rows.some(row => row.path === loadedRoot))
        setShellProjects(previous => { const memory = { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) }; return { ...previous, [key]: { ...memory, expanded: !memory.expanded } }; });
      return;
    }
    // Home and the Add Projects page show the sidebar without a current project; its row goes back to the loaded
    // workspace (design §3).
    if (loadedRoot && group.rows.some(row => row.path === loadedRoot)) { if (currentScreen.current !== "workspace") enter(loadedRoot); return; }
    cancelRestore(); controller.current?.cancelWorkspaceOpen();
    const memory = { ...(shellRef.current[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) };
    if (memory.expanded) { setShellProjects(previous => ({ ...previous, [key]: { ...memory, expanded: false } })); return; }
    const intent = navigationIntent.current, signature = groupSignature;
    const activity = await window.doan.readShellActivity({ roots: memory.roots }).catch(() => null);
    const groups = groupProjects(entriesRef.current, new Map(entriesRef.current.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
    if (intent !== navigationIntent.current || signature !== JSON.stringify(groups.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })))) return;
    const root = selectProjectRoot(memory, activity ?? [], loadedRoot); if (!root) return;
    const selected = entriesRef.current.find(entry => entry.path === root);
    if (selected?.kind !== "list" && selected?.kind !== "loading") { setShellProjects(previous => ({ ...previous, [key]: { ...memory, selectedRoot: root, expanded: true } })); return; }
    controller.current?.openWorkspace(root, next => {
      setShellProjects(previous => ({ ...previous, [key]: { ...memory, expanded: true } }));
      completeNavigation(next);
    });
  };
  const search = () => { if (locked()) return; cancelRestore(); beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQuickOpen(true); };


  const modal = wizard !== null || !!comments.dialog || setup !== null || quickOpen || homeRun.current.removing !== null || projectSettings !== null;
  useLayoutEffect(() => { toast.setModal(modal); }, [modal]);
  const live = useRef({ home, enter, toast, modal, save, comments, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, notificationClick, projectLabel: (root: string) => root });
  live.current = { home, enter, toast, modal, save, comments, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, notificationClick, projectLabel: root => projectLabelRef.current(root) };
  const rememberFocus = () => { beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const modalClosed = () => { focusAfterModal.current = true; };
  useEffect(() => {
    if (modal || !focusAfterModal.current) return;
    focusAfterModal.current = false;
    const previous = beforeModal.current;
    focusCurrent(previous);
  }, [modal, entries]);
  useLayoutEffect(() => {
    const lost = recoveryFocus.current;
    if (!lost || modal) return;
    if (document.activeElement !== lost.element && document.activeElement !== document.body && document.activeElement?.isConnected) { recoveryFocus.current = null; return; }
    if (lost.element.isConnected && !lost.element.matches(":disabled")) return;
    recoveryFocus.current = null;
    if (document.activeElement !== document.body && document.activeElement?.isConnected) return;
    focusCurrent(null);
  }, [entries, modal]);
  useEffect(() => {
    if (setup && !entries.some(entry => entry.path === setup && (entry.kind === "uninitialized" || entry.kind === "loading"))) {
      const root = reroot?.from === setup ? reroot.root : setup;
      choose(root);
      setSetup(null); modalClosed();
    }
  }, [setup, entries, reroot]);
  useEffect(() => { if (!highlight.length) return; const timer = setTimeout(() => setHighlight([]), 2400); return () => clearTimeout(timer); }, [highlight]);
  // A page opens from Home or a workspace and remembers that screen as its origin; the workspace stays hidden as on
  // Home, so its canvas, view, selection and drafts are kept. From the other page the origin stays.
  const shellScreen = (): ShellScreen => {
    const now = currentScreen.current;
    if (now === "addProjects" || now === "settings") return { screen: now };
    return now === "workspace" && loadedRootRef.current !== null ? { screen: "workspace", root: loadedRootRef.current } : { screen: "home" };
  };
  // Entering cancels a pending startup restore and a workspace still opening (POSTMORTEM 2026-10-27), and so does
  // entering the page already shown: it is the person's latest move too (that entry's no-op path rule).
  const cancelPending = () => { cancelRestore(); controller.current?.cancelWorkspaceOpen(); };
  function enterPage(to: "addProjects" | "settings"): AddPageOrigin | null {
    const entered = pageEnter(shellScreen(), pageRef.current.origin, to, locked());
    if (entered.kind === "stay") { if (currentScreen.current === to && !locked()) cancelPending(); return null; }
    cancelPending();
    if (currentScreen.current === "workspace" && loadedRootRef.current !== null) workspaceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return entered.origin;
  }
  function openAddProjects() {
    if (live.current.modal) return;
    const origin = enterPage("addProjects");
    if (!origin) return;
    const next = { ...pageRef.current, origin, seq: pageRef.current.seq + 1, locked: false, choose: true };
    pageRef.current = next; setPage(next);
    setScreen("addProjects");
  }
  // Every way into Settings — the header tab, Settings… (⌘,), Home's agent picker, a sign-in toast — comes here
  // (design '들어가는 길'). While a category holds a confirmation or a write, the latest target waits for it
  // (POSTMORTEM 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation').
  function openSettings(target: SettingsTarget) {
    if (live.current.modal) return;
    if (currentScreen.current === "settings") {
      const now = settingsQueue.current.offer(target, settingsRef.current.locked);
      if (now) { cancelPending(); arrive(now); }
      return;
    }
    const origin = enterPage("settings");
    if (!origin) return;
    const next = { ...pageRef.current, origin };
    pageRef.current = next; setPage(next);
    arrive(target);
    setScreen("settings");
  }
  // Only an unlocked page takes a target: a fresh one, one not holding anything, or one whose lock just ended.
  const arrive = (target: SettingsTarget) => {
    const { section, focus } = settingsArrival(target, settingsRef.current.section);
    sectionChosen.current = true;
    setSettings({ section, locked: false, arrival: { focus, seq: ++arrivals.current } });
  };
  // A category picked in the sidebar keeps focus on its row, so it brings no arrival (design '포커스').
  const selectSection = (section: SettingsSection) => {
    if (currentScreen.current !== "settings" || locked()) return;
    sectionChosen.current = true;
    setSettings({ ...settingsRef.current, section, arrival: null });
  };
  // Reported as the category changes, not after a render; a target held meanwhile applies once the lock ends.
  const settingsReport = ({ locked: next }: { locked: boolean }) => {
    const current = settingsRef.current;
    if (next === current.locked) return;
    // A move started before the lock (a project still being read) would otherwise land after it.
    if (next) { navigationIntent.current++; controller.current?.cancelWorkspaceOpen(); }
    setSettings({ ...current, locked: next });
    const held = next ? null : settingsQueue.current.release();
    if (held) arrive(held);
  };
  // A notification's click, after main has shown the window (design 'Notifications' 클릭 해석).
  function notificationClick(click: NotificationTarget) {
    const known = homeRun.current.conversations.some(item => item.conversationId === click.conversationId);
    const registered = entriesRef.current.some(entry => entry.path === click.root);
    const to = notificationTarget(click, known, registered, locked() || live.current.modal);
    if (to.kind === "conversation") homeRun.current.openConversation(to.conversationId);
    else if (to.kind === "overview") showShellOverview(to.root);
  }
  function leavePage(event: AddPageEvent) {
    if ((currentScreen.current !== "addProjects" && currentScreen.current !== "settings") || locked()) return;
    const to = addPageReturn(pageRef.current.origin, event, entriesRef.current.map(entry => entry.path));
    if (to.kind === "stay") return;
    if (to.kind === "workspace") live.current.enter(to.root);
    else { cancelRestore(); controller.current?.cancelWorkspaceOpen(); setScreen("home"); }
  }
  // A registered project goes Home with it chosen and its row flashed. The registration can answer before the folder
  // list has the root, so the choice waits for the list rather than reading it once (POSTMORTEM 2026-10-25
  // 'Navigation feedback read the previous React snapshot').
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  function pageAdded(root: string) {
    if (currentScreen.current !== "addProjects") return;
    const to = addPageReturn(pageRef.current.origin, { kind: "added", root }, entriesRef.current.map(entry => entry.path));
    if (to.kind !== "home") return;
    pageRef.current = { ...pageRef.current, locked: false };
    cancelRestore(); controller.current?.cancelWorkspaceOpen();
    setScreen("home"); setPendingAdd(to.select);
  }
  useEffect(() => {
    if (!pendingAdd || !entries.some(entry => entry.path === pendingAdd)) return;
    choose(pendingAdd); setHighlight([pendingAdd]); setPendingAdd(null);
  }, [entries, pendingAdd]);
  const pageReport = (report: AddPageReport) => {
    // A move started on the page before the lock (a project still being read, a row reading its worktrees'
    // activity) would otherwise land after it and leave the page mid-clone.
    if (report.locked && !pageRef.current.locked) { navigationIntent.current++; controller.current?.cancelWorkspaceOpen(); }
    pageRef.current = { ...pageRef.current, ...report };
    setPage(previous => ({ ...previous, ...report }));
  };
  // File > Add Project… (⌘O) opens the page; on the page it runs Choose folder, which main allows only in choose.
  useEffect(() => window.doan.onOpenAddProjects(() => {
    live.current.openAddProjects();
    if (currentScreen.current === "addProjects" && pageRef.current.choose) setPage(previous => ({ ...previous, chooseSeq: previous.chooseSeq + 1 }));
  }), []);
  // Settings… (⌘,) from main, after it has shown a hidden window; a payload that is not a target is dropped.
  useEffect(() => window.doan.onOpenSettingsPage(value => { const target = parseSettingsTarget(value); if (target) live.current.openSettings(target); }), []);
  useEffect(() => window.doan.onNotificationClick(click => live.current.notificationClick(click)), []);
  // The renderer's one sign-in controller tells a sign-in that ended away from Agents in the shared toast, and hears
  // when the window comes back to the front (design 'App 수준 로그인 컨트롤러').
  useEffect(() => agentSignIn().onToast(({ text, action }) => live.current.toast.show(text, action?.label, action ? () => live.current.openSettings(action.target) : undefined)), []);
  useEffect(() => {
    const focused = () => agentSignIn().windowFocused();
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, []);
  // Home and Settings share one renderer, so App holds the one preferences snapshot: read once, then each save's reply.
  const [preferences, setPreferences] = useState<PreferencesSnapshot | null>(null);
  useEffect(() => { void window.doan.readPreferences().then(snapshot => { if (snapshot) setPreferences(snapshot); }).catch(console.error); }, []);
  const savePreferences = async (patch: PreferencesPatch) => {
    const reply = await window.doan.savePreferences(patch).catch(() => null);
    if (reply) setPreferences(reply.snapshot);
    return reply;
  };
  // Escape leaves a page unless a field or an IME composition holds it, or an overlay closes itself first.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (currentScreen.current !== "addProjects" && currentScreen.current !== "settings")) return;
      live.current.leavePage(pageEscape(event, live.current.modal || !!document.querySelector('dialog[open], [role="menu"], [role="tooltip"]')));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  // Only the Open a local folder card takes a file drop. Elsewhere the window refuses files, so the cursor shows no
  // drop and the window never opens the file; a target that took the drag has already prevented the default. Text
  // and links are left to the fields that take them.
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented || !Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => { window.removeEventListener("dragover", refuse); window.removeEventListener("drop", refuse); };
  }, []);
  // A running Home conversation is stopped first, and only after the person agrees (design §7.5).
  function remove(paths: string[]): Promise<void> {
    cancelRestore();
    rememberFocus();
    return homeRun.current.remove(paths, cards.find(card => card.rows.some(row => paths.includes(row.path)))?.name ?? names.get(paths[0] ?? "") ?? "");
  }
  async function removeNow(paths: string[]) {
    cancelRestore();
    const result = await window.doan.removeProjects(paths);
    if (result.kind === "removed") {
      setShellProjects(previous => Object.fromEntries(Object.entries(previous).flatMap(([key, project]) => {
        const roots = project.roots.filter(root => !paths.includes(root));
        return roots.length ? [[key, { roots, expanded: project.expanded, ...(project.selectedRoot && roots.includes(project.selectedRoot) ? { selectedRoot: project.selectedRoot, ...(project.selectedAt !== undefined ? { selectedAt: project.selectedAt } : {}) } : {}) }]] : [];
      })));
      setExpanded(previous => Object.fromEntries(Object.entries(previous).filter(([root]) => !paths.includes(root))));
      for (const root of paths) controller.current?.remember(root, null);
      const previous = historyRef.current;
      const before = previous.visits.slice(0, previous.cursor + 1).filter(visit => !paths.includes(visit.root));
      const nextHistory = { visits: previous.visits.filter(visit => !paths.includes(visit.root)), cursor: before.length - 1 };
      historyRef.current = nextHistory; setHistory(nextHistory);
      toast.show(`${result.label} removed. Files stay on disk.`, "Undo", () => { void window.doan.restoreProjects(result.removalId).catch(console.error); }, () => { void window.doan.forgetRemoval(result.removalId).catch(console.error); });
    }
  }
  function action(name: RowAction, root: string) {
    cancelRestore();
    if ((name === "retry" || name === "locate") && document.activeElement instanceof HTMLElement) recoveryFocus.current = { element: document.activeElement, root };
    if (name === "details") { const entry = entriesRef.current.find(entry => entry.path === root); if (entry?.kind === "error") toast.show(entry.message); }
    else if (name === "setUp") { rememberFocus(); setSetup(root); }
    else if (name === "remove") void remove([root]);
    else if (name === "showInFinder") void window.doan.revealProject(root).catch(console.error);
    else if (name === "retry") void window.doan.reopenFolder(root).catch(console.error);
    else if (name === "locate") {
      const workspace = loadedRoot === root && currentScreen.current === "workspace";
      if (workspace) setLocating({ from: root, root: null });
      void window.doan.locateProject(root).then(result => {
        if (result.kind === "refused") toast.show(result.message);
        if (workspace && result.kind === "located") { setLoadedRoot(result.root); setLocating({ from: root, root: result.root }); }
        else if (workspace) setLocating(null);
      }).catch(error => { if (workspace) setLocating(null); console.error(error); });
    }
  }
  useEffect(() => window.doan.onProjectAction(request => {
    if (live.current.modal) return;
    if (request.action === "details") {
      const entry = entries.find(entry => entry.path === request.path);
      if (entry?.kind === "error") toast.show(entry.message);
    } else action(request.action, request.path);
  }), [entries, loadedRoot]);
  useEffect(() => window.doan.onMenuCommand(name => {
    if (live.current.modal) return;
    menuCommand(name, {
      home: () => live.current.home(),
      quickOpen: () => live.current.search(),
      undo: () => { if (live.current.toast.toast?.action === "Undo") live.current.toast.action(); },
      review: move => live.current.comments.reviewStep(move),
    });
  }), []);
  const onPage = screen === "addProjects", onSettings = screen === "settings";
  const pageLocked = (onPage && page.locked) || (onSettings && settings.locked);
  useEffect(() => {
    void window.doan.setMenuState({ screen: onPage || onSettings ? screen : screen === "home" ? "home" : state.open ? "canvas" : "workspace", modal, toast: toast.toast?.action === "Undo", reviewing: comments.reviewing,
      ...(onPage && page.choose ? { choose: true } : {}), ...(pageLocked ? { locked: true } : {}) });
  }, [screen, state.open, modal, toast.toast?.action, comments.reviewing, page.choose, pageLocked]);
  // Home and the pages end a Review like another canvas; the progress passed stays raised.
  useEffect(() => { if (screen !== "workspace") comments.closeReview(); }, [screen]);
  const command = (name: ViewCommand) => controller.current?.command(name);
  // A pick from the Add Projects page goes through openCanvas too, whose draft guard is per canvas.
  function pick(result: SearchResult) {
    if (locked()) return;
    cancelRestore();
    setQuickOpen(false);
    const target = entries.find(entry => entry.path === result.root);
    const row = target?.kind === "list" ? target.canvases.find(row => row.path === result.path) : undefined;
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.path));
    if (!row) { unavailable(target); return; }
    const frameId = result.kind === "frame" ? result.frameId : undefined;
    const found = (ok: boolean) => { if (!ok) live.current.toast.show("This frame is not in the rendered canvas"); };
    controller.current?.openCanvas(result.root, row, frameId, { unavailable, ...(result.kind === "frame" ? { found, index: result.frameIndex } : {}), opened: () => completeNavigation(result.root) });
  }
  const thumbs = useThumbnails(entry?.kind === "list" ? entry.path : null, entry?.kind === "list" ? entry.canvases : []);
  const overview = screen === "workspace" && entry?.kind === "list" && !state.open ? entry : null;
  const shownOverview = overview?.path ?? null;
  // Only roots on screen are read: an open canvas being edited would otherwise
  // cost a second ls per change. A root is read again when it comes back on
  // screen, so `projectComments.refresh` matters only for one already shown.
  const countedRoots = useMemo(() => shownOverview ? [shownOverview] : [], [shownOverview]);
  const projectComments = useProjectComments(entries, countedRoots);
  reviewedRoot.current = projectComments.refresh;
  // A Feedback row or its "N resolved to review": the canvas opens (draft guard
  // applies), then the Comments panel goes to the comment or starts Review.
  // `unavailable` gets the entry the controller judged by, not this render's
  // (POSTMORTEM 2026-10-25 "Navigation feedback read the previous React snapshot").
  const openFeedback = (root: string, row: CanvasRow, target: { comment: string; status: "open" | "resolved" } | "review") => {
    cancelRestore();
    controller.current?.openCanvas(root, row, undefined, {
      unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, row.path)),
      opened: () => { completeNavigation(root); live.current.comments.openAt(target === "review" ? { root, path: row.path, review: true } : { root, path: row.path, ...target }); },
    });
  };
  const feedback = overview && <FeedbackPanel key={overview.path} root={overview.path} rows={overview.canvases} read={projectComments.reads.get(overview.path)} orphans={comments.orphans}
    onRetry={() => projectComments.refresh(overview.path)}
    onOrphan={(intent, at, comment) => { comments.orphanIntent(intent, at, comment); if (intent === "read-latest") projectComments.refresh(at.root); }}
    onRetryGit={() => { void comments.orphans.retryGit(overview.path); }}
    onOpenComment={(row, comment, status) => openFeedback(overview.path, row, { comment, status })}
    onOpenCanvas={row => openShellCanvas(overview.path, row)}
    onReview={row => openFeedback(overview.path, row, "review")}
    reveal={reveal?.root === overview.path ? reveal : null} onRevealed={() => setReveal(null)} />;
  const previousOverview = useRef(shownOverview);
  useEffect(() => {
    if (previousOverview.current !== null && previousOverview.current !== shownOverview) { setOverviewNotice(null); setReveal(null); }
    previousOverview.current = shownOverview;
  }, [shownOverview]);
  const rendered = useMemo(() => state.open && state.layout ? { root: state.open.folder, path: state.open.canvas, frames: state.layout.frames } : undefined, [state.open?.folder, state.open?.canvas, state.layout]);
  const names = projectNames(entries.map(entry => entry.path));
  const name = names.get(state.open?.folder ?? entries[0]?.path ?? "") ?? "";
  const firstPrompt = useFirstPromptWait({
    entries, wizardOpen: wizard !== null, workspaceRoot: screen === "workspace" ? loadedRoot : null,
    toast: (message, label, run) => toast.show(message, label, run),
    projectName: root => cards.find(card => card.rows.some(row => row.path === root))?.name ?? names.get(root) ?? root,
    openCanvas: (root: string, row: CanvasRow, explicit: boolean) => {
      if (locked()) return;
      cancelRestore();
      const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, row.path));
      controller.current?.openCanvas(root, row, undefined, { ...(explicit ? { unavailable } : {}), opened: () => completeNavigation(root) });
    },
  });

  // Home conversations (buzz-home design §7) are decided by HomeRun; App wires its navigation, toasts and dialogs.
  const projectLabel = (root: string) => cards.find(card => card.rows.some(row => row.path === root))?.name ?? names.get(root) ?? root;
  const projectLabelRef = useRef(projectLabel); projectLabelRef.current = projectLabel;
  const run = homeRun.current;
  useEffect(() => window.doan.onConversationEvent(event => homeRun.current.event(event)), []);
  useEffect(() => {
    if (modal) { homeRun.current.modalChanged(true); return; }
    // The guard's answer applies the transition asynchronously; check once it has had the chance to arrive.
    const timer = setTimeout(() => homeRun.current.modalChanged(false), 0);
    return () => clearTimeout(timer);
  }, [modal]);
  useEffect(() => { if (state.open) homeRun.current.canvasShown(state.open.folder, state.open.canvas); }, [state.open?.folder, state.open?.canvas]);
  useEffect(() => { homeRun.current.entriesChanged(); }, [entries]);
  useEffect(() => {
    if (screen !== "workspace" || !loadedRoot) return;
    homeRun.current.visit([slotKey(loadedRoot), ...(state.open?.folder === loadedRoot ? [slotKey(loadedRoot, state.open.canvas)] : [])]);
    setRunTick(tick => tick + 1);
  }, [screen, loadedRoot, state.open?.canvas, run.conversations]);
  const shown = run.strip(loadedRoot);
  const strip = shown && <div className="strip-slot"><KeyedConversationStrip conversationId={shown.conversation.conversationId} provider={shown.conversation.provider} state={shown.state}
    view={stripView(shown.state, { provider: shown.conversation.provider, project: projectLabel(shown.conversation.root), branch: entry?.kind === "list" ? entry.git?.branch ?? null : null, canvas: shown.conversation.canvas ? canvasLabel({ path: shown.conversation.canvas, open: 0, resolved: 0, url: "" }) : null })}
    onEditOnHome={() => run.editOnHome(shown.conversation.root)} onOpen={() => run.openConversation(shown.conversation.conversationId)}
    onDismiss={() => run.dismiss(shown.conversation.conversationId)} /></div>;
  const sidebar = (home: boolean) => <ShellSidebar cards={cards} projects={shellProjects} loaded={loadedRoot} canvas={state.shown ?? undefined} unlisted={state.unlisted} homeDirectory={homeDirectory} search={search} toggle={key => void toggleProject(key)} worktree={enter} open={openShellCanvas} overview={showShellOverview} action={action} remove={remove}
    projectSettings={(root, key) => { if (!live.current.modal) setProjectSettings(previous => ({ root, key, seq: (previous?.seq ?? 0) + 1 })); }}
    home={home} slots={run.slots()} highlight={highlight} locked={pageLocked} {...(onSettings ? { settings: { section: settings.section, select: selectSection } } : {})} />;
  const topBar = <TopBar back={onPage || onSettings || back !== null} forward={!onPage && !onSettings && forward !== null} page={onPage ? "addProjects" : onSettings ? "settings" : null} locked={pageLocked}
    previous={() => onPage || onSettings ? leavePage({ kind: "back" }) : travel(back)} next={() => travel(forward)}
    addProjects={openAddProjects} projects={() => leavePage({ kind: "projectsTab" })} settings={() => { if (!locked()) openSettings({}); }} />;
  // Settings > Agents lists models for the project Home would start with.
  const modelRoot = defaultProject(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])), {
    current: composerMemory.current.root ? { root: composerMemory.current.root, name: composerMemory.current.root } : null, loaded: loadedRoot, lastRoot: homeMemory?.lastRoot ?? null }).root;
  const settingsProject = entries.some(entry => entry.path === modelRoot && entry.kind === "list") ? { root: modelRoot!, name: projectLabel(modelRoot!) } : null;
  return <TooltipProvider><FirstPromptContext.Provider value={firstPrompt}>
  {screen === "home" && <Home header={topBar} sidebar={sidebar(true)}
    entries={entries} homeDirectory={homeDirectory} shellProjects={shellProjects} loaded={loadedRoot} select={select} prefs={homeMemory}
    memory={composerMemory} running={run.running()} restore={run.restore} start={(request, last) => run.start(request, last)} openConversation={id => run.openConversation(id)} addProjects={openAddProjects}
    defaults={preferences ? preferences.preferences.newConversation : undefined} openSettings={openSettings} />}
  {onSettings && <SettingsPage header={topBar} sidebar={sidebar(true)} section={settings.section} arrival={settings.arrival} onState={settingsReport}
    agents={{ signIn: agentSignIn(), preferences, save: savePreferences, project: settingsProject }} />}
  {onPage && <AddProjectsPage key={page.seq} header={topBar} sidebar={sidebar(true)} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)} choose={page.chooseSeq} onState={pageReport} onCancel={() => leavePage({ kind: "cancel" })} onAdded={pageAdded} />}
  <main className={`app-shell workspace${entry && entry.kind !== "list" ? " with-status" : ""}${strip ? " with-strip" : ""}`} style={{ visibility: screen !== "workspace" ? "hidden" : "visible" }} inert={screen !== "workspace"} aria-hidden={screen !== "workspace"}>
    {topBar}
    {entry && entry.kind !== "list" && <ProblemActions entry={entry} action={action} workspace={{ name: card?.name ?? name, homeDirectory, home }} />}
    {sidebar(false)}
    {strip}
    <CanvasPane viewport={viewport} board={board} overlay={overlay} state={state} entry={entry} projectName={names.get(loadedRoot ?? "") ?? loadedRoot ?? ""} command={command} covered={overview !== null} />
    {overview && <ProjectOverview key={overview.path} root={overview.path} rows={overview.canvases} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible} notice={overviewNotice?.root === overview.path ? overviewNotice.text : null} comments={projectComments.comments.get(overview.path)} open={row => openShellCanvas(overview.path, row)} />}
    <div className="right-stack"><RightPanel state={state} selectPath={item => controller.current?.selectPath(item)} feedback={feedback} />{comments.panel}</div>
  </main>
  {comments.dialog}
  {projectSettings && <ProjectSettingsDialog key={projectSettings.seq} root={projectSettings.root} projectKey={projectSettings.key} entries={entries} reroot={reroot} homeDirectory={homeDirectory}
    onClose={() => setProjectSettings(null)} onAction={(name, root) => action(name, root)} />}
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} onClose={() => { setSetup(null); modalClosed(); }} onRerooted={(root, message) => { choose(root); setSetup(null); setHighlight([root]); toast.show(message); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => { setQuickOpen(false); if (document.activeElement === document.body || !document.activeElement?.isConnected || document.activeElement.closest("dialog.qo")) modalClosed(); }} />}
  {run.removing && <dialog className="doan-dialog" data-ui-size="compact" aria-label={run.removing.title} ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); run.cancelRemove(); modalClosed(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{run.removing.title}</h3><p className="doan-dialog-description">{run.removing.body}</p></div></div>
    <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={() => { run.cancelRemove(); modalClosed(); }}>{run.removing.cancel}</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={() => { modalClosed(); void run.confirmRemove(); }}>{run.removing.confirm}</button></div>
  </dialog>}
  {toast.element}
  {wizard !== null && <Wizard key={wizard} session={wizard} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)}
    onClose={root => {
      setWizard(null);
      if (wizardCloseFocus(root) === "composer") { beforeWizard.current = null; focusComposer.current = true; live.current.home(); choose(root ?? undefined); }
      else restoreFocus.current = true;
    }} />}
  </FirstPromptContext.Provider></TooltipProvider>;
}

// Add Projects, Projects and Settings are page tabs; on a page Back returns to where it was opened from. `locked` marks
// the tabs and Back unavailable while App ignores them (buzz-add-projects and buzz-settings design '잠금').
function TopBar({ back, forward, previous, next, page, locked, addProjects, projects, settings }: { back: boolean; forward: boolean; previous(): void; next(): void; page: "addProjects" | "settings" | null; locked: boolean; addProjects(): void; projects(): void; settings(): void }) {
  const unavailable = locked || undefined;
  const tab = (name: typeof page) => name === page ? { className: "current", "aria-current": "page" as const } : {};
  return <header className="top shell-top"><span className="traffic-space" aria-hidden="true" />
    <div className="shell-history"><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!back} aria-disabled={unavailable} onClick={previous}><ArrowLeft /></button><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!forward} onClick={next}><ArrowRight /></button></div>
    <div className="shell-modes"><button {...tab("addProjects")} aria-disabled={unavailable} onClick={addProjects}><Plus />Add Projects</button><button {...tab(null)} aria-disabled={unavailable} onClick={projects}><LayoutGrid />Projects</button><button {...tab("settings")} aria-disabled={unavailable} onClick={settings}><Settings />Settings</button></div>
  </header>;
}

function CanvasPane({ viewport, board, overlay, state, entry, projectName, command, covered }: {
  viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>;
  state: CanvasState; entry: FolderEntry | undefined; projectName: string; command: (name: ViewCommand) => void; covered: boolean;
}) {
  const problem = !state.open && entry && entry.kind !== "list" ? entry : null;
  const problemMessage = problem?.kind === "loading" ? "Reading project…"
    : problem?.kind === "notFound" ? `The project ${projectName} is missing. Use Locate… to find it.`
    : problem?.kind === "uninitialized" ? `The project ${projectName} is not set up. Use Set Up… on Home.`
    : problem?.kind === "error" ? "Could not read the project configuration. Use Details or Retry above."
    : problem?.kind === "cliError" ? "Could not read the project. Use Retry above." : null;
  // Stays laid out under the Overview: opening a canvas fits it to this size at once.
  return <section className="area" role="region" aria-label="Canvas" ref={viewport} inert={covered}>
    <div className="board" ref={board} hidden />
    <div className="overlay" ref={overlay} />
    <div className="canvas-notices">
      {state.error && <div className="canvas-notice" role="status">{state.error}</div>}
      {state.unlisted && <div className="canvas-notice" role="status">This page is not a listed canvas. Choose a canvas from the Sidebar.</div>}
      {state.notice && <div className="canvas-notice" role="status">{state.notice}</div>}
    </div>
    {(state.status || problemMessage) && <div className="canvas-status" role="status">
      {problemMessage ? <p>{problemMessage}</p> : state.status === "loading" ? <p><span className="spinner doan-spinner" aria-hidden="true" />Loading…</p>
        : state.status === "failed" ? <div><b>Couldn’t load the canvas</b><br />Run doan check in a terminal<br /><br /><button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => command("reload")}>Reload</button></div>
        : state.status === "noWidth" ? <p><b>Could not read a valid board width.</b>{state.message.slice("Could not read a valid board width.".length)}</p>
        : <p>{state.message}</p>}
    </div>}
    {state.label && state.open && <output className="updated meta" aria-label={state.label}><span className="dot" /> {state.label}</output>}
    <div className={`zctl${state.hasFrame ? "" : " disabled"}`}>
      <button className="doan-button" data-ui-size="sm" aria-label="Reload canvas" disabled={!state.open} onClick={() => command("reload")}>Reload</button>
      <div className="zoom">
        <button className="doan-icon-button" data-ui-variant="subtle" aria-label="Zoom out" disabled={!state.hasFrame} onClick={() => command("zoomOut")}><Minus aria-hidden="true" /></button>
        <output aria-label={state.hasFrame ? `Zoom ${state.zoom}%` : "Zoom"}>{state.hasFrame ? `${state.zoom}%` : "—"}</output>
        <button className="doan-icon-button" data-ui-variant="subtle" aria-label="Zoom in" disabled={!state.hasFrame} onClick={() => command("zoomIn")}><Plus aria-hidden="true" /></button>
      </div>
      <Tooltip><TooltipTrigger asChild><button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-label="Fit" disabled={!state.hasFrame} onClick={() => command("fit")}>Fit <span className="kbd doan-kbd">⌘1</span></button></TooltipTrigger><TooltipContent>Fit to width</TooltipContent></Tooltip>
    </div>
  </section>;
}
