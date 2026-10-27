import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ShellSidebar } from "./ShellSidebar";
import { commitVisit, emptyHistory, historyTarget, reconcileProjects, selectProjectRoot, type Visit } from "./shellNavigation";
import { canvasLabel } from "./canvasTree";
import type { Selection } from "../formats/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { MenuCommand, ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState } from "./CanvasController";
import { projectNames } from "./projectRow";
import { ArrowLeft, ArrowRight, Minus, Plus, Settings, LayoutGrid } from "lucide-react";
import { Home, ProblemActions, useProjectComments } from "./Home";
import { AddProjectsDialog, SetUpFolderConfirm } from "./AddProjectsDialog";
import { ProjectSetupDialog } from "./ProjectSetupDialog";
import { useToast } from "./Toast";
import { DropOverlay } from "./DropOverlay";
import type { AddOutcome } from "../main/addProjects";
import type { RowAction } from "./homeCards";
import { groupProjects } from "./homeCards";
import { moveExpanded } from "./Sidebar";
import { useComments } from "./useComments";
import { RightPanel } from "./RightPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { duplicateIdText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Wizard, type Reroot } from "./Onboarding";
import { FirstPromptContext, useFirstPromptWait } from "./FirstPrompt";
import { ProjectOverview, useThumbnails } from "./ProjectOverview";
import { QuickOpen } from "./QuickOpenDialog";
import { unavailableCanvasMessage, type SearchResult } from "./quickOpen";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import type { UiState, ShellProject } from "../restore/uiState";

// Each command names its handler; one App does not know does nothing, so a
// new menu item can never run the Undo toast's action (R-M ⚪5).
export function menuCommand(name: MenuCommand, to: { home: () => void; quickOpen: () => void; undo: () => void; review: (move: "next" | "previous") => void }): void {
  if (name === "home") to.home();
  else if (name === "quickOpen") to.quickOpen();
  else if (name === "undoRemove") to.undo();
  else if (name === "nextResolved") to.review("next");
  else if (name === "previousResolved") to.review("previous");
}

export function validHistoryVisit(entries: readonly FolderEntry[], visit: Visit): boolean {
  const entry = entries.find(entry => entry.path === visit.root);
  return !!entry && entry.kind !== "notFound" && (entry.kind !== "list" || !visit.canvas || entry.canvases.some(row => row.path === visit.canvas));
}

export function App() {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [rerootHint, setRerootHint] = useState<{ root: string; message: string; seen?: FolderEntry } | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [scan, setScan] = useState<string | null>(null);
  const [confirms, setConfirms] = useState<AddOutcome["confirms"]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  const beforeModal = useRef<HTMLElement | null>(null);
  const focusAfterModal = useRef(false);
  const focusModalPath = useRef<string | null>(null);
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
  const [reroot, setReroot] = useState<Reroot | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const [wizardAddOutcome, setWizardAddOutcome] = useState<AddOutcome | null>(null);
  const wizardOpen = useRef(false);
  wizardOpen.current = wizard !== null;
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
  // canvas opens or the Overview is left (doan/revision-continuity.html, duplicate-id).
  const [overviewNotice, setOverviewNotice] = useState<{ root: string; text: string } | null>(null);
  // The saved ui state until the restore is applied, then "done"; null while it is read.
  const [restore, setRestore] = useState<{ state: UiState | null; started: number } | "done" | null>(null);
  const restoreCancelled = useRef(false);
  const cancelRestore = () => { navigationIntent.current++; restoreCancelled.current = true; setRestore("done"); };
  const recoveryFocus = useRef<{ element: HTMLElement; root: string } | null>(null);
  function focusCurrent(previous: HTMLElement | null = null) {
    if (document.querySelector("dialog[open]")) return;
    const scope = currentScreen.current === "home" ? ".home-shell" : ".workspace";
    const usable = (node: HTMLElement | null): node is HTMLElement => !!node && node.isConnected && !!node.closest(scope)
      && !node.closest('[inert], [hidden], [aria-hidden="true"]') && !node.matches(":disabled")
      && node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible";
    const selectors = currentScreen.current === "home" ? ['.home-body [data-path][tabindex="0"]', '.home-shell button']
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
      if (duplicates === null) { live.current.toast.show(`${canvasLabel(row)} was removed from doan/`); return; }
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
  useEffect(() => window.doan.onOnboardingOpen(opened => {
    const active = document.activeElement;
    // A reopen while the wizard is up keeps the focus it came from.
    if (!(active instanceof HTMLElement && active.closest(".ob-overlay"))) beforeWizard.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setWizardAddOutcome(null);
    setWizard(opened.session);
  }), []);
  useEffect(() => {
    if (wizard !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const previous = beforeWizard.current;
    beforeWizard.current = null;
    focusCurrent(previous);
  }, [wizard]);
  // Set once the project counts below exist; a raised review marker refreshes them.
  const reviewedRoot = useRef<(root: string) => void>(() => {});
  // The id-change notice's Show: the Overview's Feedback expands that id's
  // orphan group and focuses its head (project-feedback design §5).
  const [reveal, setReveal] = useState<{ root: string; id: string; seq: number } | null>(null);
  const showOrphans = (root: string, id: string) => {
    cancelRestore();
    controller.current?.showOverview(() => { completeNavigation(root); setReveal(previous => ({ root, id, seq: (previous?.seq ?? 0) + 1 })); });
  };
  const comments = useComments(state, controller, () => setScreen("workspace"), entries, root => reviewedRoot.current(root), homeDirectory, showOrphans);
  const home = () => {
    cancelRestore();
    controller.current?.cancelWorkspaceOpen();
    if (currentScreen.current === "workspace") workspaceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScreen("home");
  };
  useEffect(() => {
    controller.current?.setWorkspaceActive(screen === "workspace");
    if (screen === "home") {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]"));
      (rows.find(row => row.dataset.path === loadedRoot) ?? rows[0])?.focus();
    } else {
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
    if (plan.missingCanvas) toast.show(`${canvasLabel({ path: plan.missingCanvas, open: 0, resolved: 0, url: "" })} is no longer in doan/`);
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
    const { screen, loadedRoot, open, expanded, shellProjects } = persisted.current;
    const instance = controller.current;
    if (!instance) return;
    const canvas = open && open.folder === loadedRoot ? open.canvas : undefined;
    const canvasId = canvas ? open?.row.id : undefined;
    const view = instance.currentView();
    // The loaded root's canvas is in `lastByRoot` too, so a restart on Home still reopens it on entry.
    const lastByRoot = { ...instance.memory(), ...(loadedRoot && canvas ? { [loadedRoot]: { canvas, view } } : {}) };
    const state: UiState = { screen, expanded, shellProjects, lastByRoot, ...(loadedRoot ? { root: loadedRoot } : {}), ...(canvas ? { canvas, view, ...(canvasId ? { canvasId } : {}) } : {}) };
    void window.doan.saveUiState(state).then(saved => { if (!saved) console.error("doan: UI state was not saved"); }).catch(console.error);
  };
  const persisted = useRef({ screen, loadedRoot, open: state.open, expanded, shellProjects });
  persisted.current = { screen, loadedRoot, open: state.open, expanded, shellProjects };
  // At commit, so a change already on screen has been sent.
  useLayoutEffect(save, [restore, screen, loadedRoot, state.open, expanded, shellProjects]);
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
    cancelRestore();
    if (root === loadedRoot) { controller.current?.cancelWorkspaceOpen(); setScreen("workspace"); }
    else controller.current?.openWorkspace(root, next => completeNavigation(next), false);
  };
  const openShellCanvas = (root: string, row: CanvasRow, cursor?: number) => {
    cancelRestore();
    controller.current?.openCanvas(root, row, undefined, { opened: () => completeNavigation(root, cursor), unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, row.path)) });
  };
  const showShellOverview = (root: string, cursor?: number) => {
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
    if (cursor === null) return;
    const visit = history.visits[cursor]; if (!visit) return;
    const entry = entries.find(entry => entry.path === visit.root);
    if (entry?.kind !== "list") { toast.show("This project is unavailable. Use its recovery actions."); return; }
    const row = entry.canvases.find(row => row.path === visit.canvas);
    if (visit.canvas && row) openShellCanvas(visit.root, row, cursor);
    else showShellOverview(visit.root, cursor);
  };
  const toggleProject = async (key: string) => {
    const group = cards.find(card => card.key === key); if (!group || group.rows.some(row => row.path === loadedRoot)) return;
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
  const search = () => { cancelRestore(); beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQuickOpen(true); };


  const modal = wizard !== null || !!comments.dialog || setup !== null || scan !== null || confirms.length > 0 || quickOpen;
  useLayoutEffect(() => { toast.setModal(modal); }, [modal]);
  const live = useRef({ home, enter, toast, modal, save, comments, completeNavigation });
  live.current = { home, enter, toast, modal, save, comments, completeNavigation };
  const rememberFocus = () => { beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(".home-body [data-path]") ?? document.activeElement : null; };
  const modalClosed = () => { focusAfterModal.current = true; };
  useEffect(() => {
    if (modal || !focusAfterModal.current) return;
    focusAfterModal.current = false;
    const previous = (focusModalPath.current ? Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]")).find(row => row.dataset.path === focusModalPath.current) : null) ?? beforeModal.current;
    focusModalPath.current = null;
    focusCurrent(previous);
  }, [modal, entries]);
  useLayoutEffect(() => {
    const lost = recoveryFocus.current;
    if (!lost || modal) return;
    if (document.activeElement !== lost.element && document.activeElement !== document.body && document.activeElement?.isConnected) { recoveryFocus.current = null; return; }
    if (lost.element.isConnected && !lost.element.matches(":disabled")) return;
    recoveryFocus.current = null;
    if (document.activeElement !== document.body && document.activeElement?.isConnected) return;
    const row = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]")).find(row => row.dataset.path === lost.root);
    focusCurrent(row ?? null);
  }, [entries, modal]);
  useEffect(() => {
    if (setup && !entries.some(entry => entry.path === setup && (entry.kind === "uninitialized" || entry.kind === "loading"))) {
      const root = reroot?.from === setup ? reroot.root : setup;
      focusModalPath.current = root;
      beforeModal.current = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]")).find(row => row.dataset.path === root) ?? null;
      setSetup(null); modalClosed();
    }
  }, [setup, entries, reroot]);
  useEffect(() => {
    if (!rerootHint) return;
    const entry = entries.find(entry => entry.path === rerootHint.root);
    if (!entry) setRerootHint(null);
    else if (!rerootHint.seen || rerootHint.seen.kind === "loading") { if (entry !== rerootHint.seen) setRerootHint({ ...rerootHint, seen: entry }); }
    else if (entry !== rerootHint.seen) setRerootHint(null);
  }, [entries, rerootHint]);
  useEffect(() => { if (!highlight.length) return; const timer = setTimeout(() => setHighlight([]), 2400); return () => clearTimeout(timer); }, [highlight]);
  const added = (paths: string[]) => {
    const root = paths.at(-1);
    if (!root) return;
    if (currentScreen.current === "home") setHighlight(paths);
    else live.current.toast.show(paths.length === 1 ? `Added ${root.split("/").at(-1)}` : `Added ${paths.length} projects`, "Open", () => {
      cancelRestore();
      controller.current?.openWorkspace(root, next => { workspaceFocus.current = null; completeNavigation(next); }, false,
        () => { live.current.home(); setHighlight([root]); });
    });
  };
  useEffect(() => window.doan.onAddOutcome(outcome => {
    if (wizardOpen.current) { setWizardAddOutcome(outcome); return; }
    added(outcome.added);
    if (outcome.duplicate) { live.current.home(); setHighlight([...outcome.added, outcome.duplicate]); }
    if (outcome.messages.length) live.current.toast.show(outcome.messages.join("\n"));
    if (outcome.scanId || outcome.confirms.length) rememberFocus();
    setScan(outcome.scanId); setConfirms(outcome.confirms);
  }), []);
  async function remove(paths: string[]) {
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
      quickOpen: () => { cancelRestore(); beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQuickOpen(true); },
      undo: () => { if (live.current.toast.toast?.action === "Undo") live.current.toast.action(); },
      review: move => live.current.comments.reviewStep(move),
    });
  }), []);
  useEffect(() => { void window.doan.setMenuState({ screen: screen === "home" ? "home" : state.open ? "canvas" : "workspace", modal, toast: toast.toast?.action === "Undo", reviewing: comments.reviewing }); }, [screen, state.open, modal, toast.toast?.action, comments.reviewing]);
  // Home ends a Review like another canvas; the progress passed stays raised.
  useEffect(() => { if (screen === "home") comments.closeReview(); }, [screen]);
  const command = (name: ViewCommand) => controller.current?.command(name);
  function pick(result: SearchResult) {
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
  const countedRoots = useMemo(() => screen === "home" ? entries.map(entry => entry.path) : shownOverview ? [shownOverview] : [], [screen, entries, shownOverview]);
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
      cancelRestore();
      const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, row.path));
      controller.current?.openCanvas(root, row, undefined, { ...(explicit ? { unavailable } : {}), opened: () => completeNavigation(root) });
    },
  });
  return <TooltipProvider><FirstPromptContext.Provider value={firstPrompt}>
  {screen === "home" && <Home header={<TopBar back={back !== null} forward={forward !== null} previous={() => travel(back)} next={() => travel(forward)} />} homeDirectory={homeDirectory} entries={entries} loaded={loadedRoot} selection={state.selection} highlight={highlight} rerootHint={rerootHint} comments={projectComments.comments} enter={enter} action={action} remove={paths => void remove(paths)} />}
  <main className={`app-shell workspace${entry && entry.kind !== "list" ? " with-status" : ""}`} style={{ visibility: screen === "home" ? "hidden" : "visible" }} inert={screen === "home"} aria-hidden={screen === "home"}>
    <TopBar back={back !== null} forward={forward !== null} previous={() => travel(back)} next={() => travel(forward)} />
    {entry && entry.kind !== "list" && <ProblemActions entry={entry} action={action} workspace={{ name: card?.name ?? name, homeDirectory, home }} />}
    <ShellSidebar cards={cards} projects={shellProjects} loaded={loadedRoot} canvas={state.shown ?? undefined} unlisted={state.unlisted} homeDirectory={homeDirectory} search={search} toggle={key => void toggleProject(key)} worktree={enter} open={openShellCanvas} overview={showShellOverview} action={action} remove={remove} />
    <CanvasPane viewport={viewport} board={board} overlay={overlay} state={state} entry={entry} projectName={names.get(loadedRoot ?? "") ?? loadedRoot ?? ""} command={command} covered={overview !== null} />
    {overview && <ProjectOverview key={overview.path} root={overview.path} rows={overview.canvases} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible} notice={overviewNotice?.root === overview.path ? overviewNotice.text : null} comments={projectComments.comments.get(overview.path)} open={row => openShellCanvas(overview.path, row)} />}
    <div className="right-stack"><RightPanel state={state} selectPath={item => controller.current?.selectPath(item)} feedback={feedback} />{comments.panel}</div>
  </main>
  {comments.dialog}
  {scan && <AddProjectsDialog homeDirectory={homeDirectory} key={scan} scanId={scan} close={() => { setScan(null); modalClosed(); }} added={added} />}
  {!scan && !setup && confirms[0] && <SetUpFolderConfirm key={confirms[0].confirmId} name={confirms[0].name} path={confirms[0].path} cancel={() => { setConfirms(items => items.slice(1)); modalClosed(); }} confirm={async () => { const first = confirms[0]; if (!first) return; const result = await window.doan.confirmFolder(first.confirmId); if (result.kind !== "added") throw new Error("This confirmation is no longer available. Add the folder again."); setConfirms(items => items.slice(1)); setSetup(result.added[0] ?? first.path); focusModalPath.current = result.added[0] ?? first.path; added(result.added); }} />}
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} onClose={() => { setSetup(null); modalClosed(); }} onRerooted={(root, message) => { focusModalPath.current = root; setSetup(null); setHighlight([root]); setRerootHint({ root, message }); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => { setQuickOpen(false); if (document.activeElement === document.body || !document.activeElement?.isConnected || document.activeElement.closest("dialog.qo")) modalClosed(); }} />}
  {toast.element}
  <DropOverlay blocked={modal} />
  {wizard !== null && <Wizard key={wizard} session={wizard} addOutcome={wizardAddOutcome} entries={entries} reroot={reroot} homeDirectory={homeDirectory} onClose={() => { restoreFocus.current = true; setWizard(null); }} />}
  </FirstPromptContext.Provider></TooltipProvider>;
}

function TopBar({ back, forward, previous, next }: { back: boolean; forward: boolean; previous(): void; next(): void }) {
  return <header className="top shell-top"><span className="traffic-space" aria-hidden="true" />
    <div className="shell-history"><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!back} onClick={previous}><ArrowLeft /></button><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!forward} onClick={next}><ArrowRight /></button></div>
    <div className="shell-modes"><button onClick={() => void window.doan.addProjects()}><Plus />Add Projects</button><button className="current" aria-current="page"><LayoutGrid />Projects</button><button onClick={() => void window.doan.openSettings({ tab: "connections" })}><Settings />Settings</button></div>
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
