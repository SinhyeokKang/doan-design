import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ShellSidebar } from "./ShellSidebar";
import { commitVisit, emptyHistory, fallbackWorktree, historyTarget, loadedProjectRow, projectExpanded, projectsTab, reconcileProjects, selectProjectRoot, shownFolders, type Visit } from "./shellNavigation";
import { groupToOpen, openGroup, toggleGroup, type GroupId, type ShownCanvas } from "./sidebarGroups";
import { canvasLabel, moveExpanded } from "./canvasTree";
import type { Selection } from "../formats/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import type { TrashPlanReply, TrashReply } from "../main/canvasTrash";
import type { ExportReply } from "../main/canvasExport";
import { canvasExportReason, trashBlock } from "./canvasRowMenu";
import { canvasStem, exportProgress, exportToast, trashToast } from "./canvasRowMessages";
import { CanvasTrashDialog, trashDialogView } from "./CanvasTrashDialog";
import { ConversationDeleteDialog, unsentDraft, type DeleteTarget } from "./ConversationDeleteDialog";
import { deleteAvailability, deleteDialogView, deleteRefusalText } from "./conversationDelete";
import { focusFieldEnd } from "./chipField";
import { draftKey } from "./dockedRules";
import type { OpenAsk, OpenLinkResult, OpenResult } from "../main/deepLinks";
import type { MenuCommand, ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState, type PickResult } from "./CanvasController";
import { CanvasHeader } from "./CanvasHeader";
import { CanvasTools, type ExportTool, type PickerTool } from "./CanvasTools";
import { AlertIcon } from "./AlertIcon";
import { noticeToast } from "./selection";
import { CanvasAgent } from "./CanvasAgent";
import { workingCanvas, type WorkingCanvas } from "./agentIndicator";
import { controlFocusLost } from "./canvasFocus";
import { projectNames } from "./projectRow";
import { ArrowLeft, ArrowRight, Crosshair, Plus, Settings, LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Home, ProblemActions } from "./Home";
import { ProjectSetupDialog } from "./ProjectSetupDialog";
import { ProjectSettingsPage } from "./ProjectSettingsPage";
import { useToast } from "./Toast";
import { AddProjectsPage, type AddPageReport } from "./AddProjectsPage";
import { addPageReturn, pageEnter, pageEscape, projectSettingsReentry, workspaceRemoved, type AddPageEvent, type AddPageOrigin, type PageName, type ShellScreen } from "./addProjectsNav";
import type { FolderFocus } from "../main/shell";
import type { RowAction } from "./homeCards";
import { groupProjects } from "./homeCards";
import { CanvasConversations } from "./RightPanel";
import { CanvasRun, type CanvasTarget } from "./canvasRun";
import { CanvasConversation, CanvasConversationTitle, canvasConversationTitle } from "./CanvasConversationPanel";
import { canvasUnlistedText, DUPLICATE_CANVAS_TEXT } from "./canvasConversation";
import { openButtonBadge, panelOpenFor, type OpenBadge, type PanelTrigger } from "./rightPanelOpen";
import { PICKER_UNAVAILABLE, pickerAvailability, type CanvasLoad } from "./canvasPicker";
import type { DockedFieldLink } from "./DockedComposer";
import type { LocateOutcome } from "./ConversationThread";
import { replyChipTarget } from "./replyChipTarget";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import { distinctTargets } from "./anchorField";
import type { ScrollTo } from "./overviewRun";
import { ConversationPanel, ResizeHandle } from "./ConversationPanel";
import { canvasPanelDefault, OVERVIEW_PANEL_DEFAULT, panelBounds, panelWidth } from "./rightPanelSize";
import { SIDEBAR_BOUNDS, sidebarToggleView, sidebarWidth, type SidebarToggleView } from "./sidebarSize";
import { duplicateIdText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Wizard } from "./Onboarding";
import { isMainCheckout } from "./projectStep";
import { ProjectOverview } from "./ProjectOverview";
import { useThumbnails } from "./thumbnails";
import { canvasConversationRows } from "./canvasConversationRows";
import type { CanvasList } from "./CanvasConversationList";
import { QuickOpen } from "./QuickOpenDialog";
import { missingCanvasMessage, openLinkRefusal, removedCanvasMessage, unavailableCanvasMessage, type SearchResult } from "./quickOpen";
import { decideOpen, type OpenPage } from "./openDecision";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import { withoutRoots, type HomeMemory, type UiState, type ShellProject } from "../restore/uiState";
import { emptyComposer } from "./HomeComposerView";
import { defaultProject, startErrorView } from "./homeComposer";
import { OverviewRun } from "./overviewRun";
import { DockedSupport } from "./dockedSupport";
import { sameCanvas } from "./ProjectOverview";
import { removalQuestionLabel, slotKey as canvasSlotKey, type Slot } from "./homeConversations";
import type { Anchor, Canvas } from "../main/conversation/types";
import type { ConversationSummary } from "../main/conversation/summary";
import { KeyedConversationStrip } from "./ConversationStripView";
import { stripView } from "./conversationStrip";
import { slotKey } from "./homeConversations";
import { withTerminalSlots } from "./conversationList";
import { seenMark, sidebarSlots } from "./canvasNotice";
import { HomeRun } from "./homeRun";
import { SettingsPage, type SettingsArrival } from "./SettingsPage";
import { parseSettingsTarget, settingsArrival, SettingsTargetQueue, shownSettingsSection, type SettingsSection, type SettingsTarget } from "./settingsSections";
import { MCP_HIDDEN_ANNOUNCEMENT, mcpAvailable } from "./mcpConnectorsView";
import { McpConnectorsWatch } from "./mcpConnectorsWatch";
import { agentSignIn } from "./agentSignIn";
import { notificationTarget, type NotificationTarget } from "../main/notifications";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { PreferencesPatch, PreferencesSnapshot } from "../main/preferences";
import { preferenceAfterPick, rememberChoice, rememberPermission, type ComposerChoice } from "./rememberChoice";

// Each command names its handler; one App does not know does nothing (R-M ⚪5).
export function menuCommand(name: MenuCommand, to: { home: () => void; quickOpen: () => void; newConversation: () => void; pickFromCanvas: () => void; toggleSidebar: () => void }): void {
  if (name === "home") to.home();
  else if (name === "toggleSidebar") to.toggleSidebar();
  else if (name === "newConversation") to.newConversation();
  else if (name === "pickFromCanvas") to.pickFromCanvas();
  else if (name === "quickOpen") to.quickOpen();
}

// A focus move that waits (a pick's end) carries the intent it started with (design §2 'Focus
// return', POSTMORTEM 2026-10-23 R-L): it holds while focus stays where the wait left it, and ends for good the moment
// focus goes anywhere else, even if it comes back later.
export class FocusIntent {
  private live = true;
  private readonly moved = (event: FocusEvent) => { if (!this.stays(event.target)) this.end(); };
  constructor(private readonly stays: (target: EventTarget | null) => boolean) { window.addEventListener("focusin", this.moved, true); }
  holds(): boolean { return this.live; }
  end(): void { this.live = false; window.removeEventListener("focusin", this.moved, true); }
}

// Main replaces the main window's ui-state wholesale on each save, so every save carries Home's memory, and none is
// sent before that memory was read (it would be dropped).
// A project's closed groups after `change`; no field when every group is open, as ui-state stores them.
function withGroups(project: ShellProject, change: (groups: ShellProject["groups"]) => ShellProject["groups"]): ShellProject {
  const { groups, ...rest } = project, next = change(groups);
  return next ? { ...rest, groups: next } : rest;
}
export function savedUiState(input: { screen: "home" | "workspace"; loadedRoot: string | null; open: CanvasState["open"]; expanded: Record<string, string[]>; shellProjects: Record<string, ShellProject>; home: HomeMemory | null; view: UiState["view"] & {}; memory: UiState["lastByRoot"]; settingsSection?: SettingsSection; conversationByRoot?: Record<string, string> | null; rightPanel?: UiState["rightPanel"]; overviewPanel?: UiState["overviewPanel"]; sidebar?: UiState["sidebar"]; canvasTool?: CanvasState["tool"] }): UiState | null {
  const { screen, loadedRoot, open, expanded, shellProjects, home, view, settingsSection, rightPanel, overviewPanel, sidebar, canvasTool } = input;
  const conversationByRoot = input.conversationByRoot && Object.keys(input.conversationByRoot).length ? input.conversationByRoot : undefined;
  if (home === null) return null;
  const canvas = open && open.folder === loadedRoot ? open.canvas : undefined;
  const canvasId = canvas ? open?.row.id : undefined;
  // The loaded root's canvas is in `lastByRoot` too, so a restart on Home still reopens it on entry.
  const lastByRoot = { ...input.memory, ...(loadedRoot && canvas ? { [loadedRoot]: { canvas, view } } : {}) };
  return { screen, expanded, shellProjects, lastByRoot, home, ...(loadedRoot ? { root: loadedRoot } : {}), ...(canvas ? { canvas, view, ...(canvasId ? { canvasId } : {}) } : {}), ...(settingsSection ? { settingsSection } : {}), ...(conversationByRoot ? { conversationByRoot } : {}), ...(rightPanel ? { rightPanel } : {}), ...(overviewPanel ? { overviewPanel } : {}), ...(sidebar ? { sidebar } : {}), ...(canvasTool === "hand" ? { canvasTool } : {}) };
}

// The start's ui-state read under what the run wrote before it (buzz-project T1): a root the run set, cleared (New) or
// removed keeps the run's word, so a late read never brings back a cleared memory.
export function mergeConversationMemory(saved: Readonly<Record<string, string>> | undefined, current: Readonly<Record<string, string>>, touched: ReadonlySet<string>): Record<string, string> {
  return { ...Object.fromEntries(Object.entries(saved ?? {}).filter(([root]) => !touched.has(root))), ...current };
}

// First run's project handoff puts focus in the Home composer, ahead of the focus held before the wizard (§4.9).
export function wizardCloseFocus(root: string | null): "composer" | "previous" { return root ? "composer" : "previous"; }

// A reply chip whose canvas cannot be opened (agent-reply-chips design '초안 요청', draft frame `toasts`). The canvas is
// named by the link's id, since no row names it; the project by its sidebar name. A list still being read gets the
// chip's own copy, which has no Open to try again; a project problem keeps Quick Open's.
export function replyChipRefusal(target: "missing" | "duplicate" | "unavailable", canvas: string, project: string, entry: FolderEntry | undefined): string {
  if (target === "missing") return `Couldn’t open ${canvas}. The canvas isn’t in ${project}.`;
  if (target === "duplicate") return `Couldn’t open ${canvas}. More than one canvas in ${project} uses this ID. Run doan check in a terminal to find them.`;
  return entry?.kind === "loading" ? "Project is still being read. Try again shortly." : unavailableCanvasMessage(entry, canvas);
}

export function validHistoryVisit(entries: readonly FolderEntry[], visit: Visit): boolean {
  const entry = entries.find(entry => entry.path === visit.root);
  return !!entry && entry.kind !== "notFound" && (entry.kind !== "list" || !visit.canvas || entry.canvases.some(row => row.path === visit.canvas));
}

export function App() {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace" | "addProjects" | "settings" | "projectSettings">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  // canvas-row-menu: the canvas the Move to Trash dialog asks about and main's plan for it (null until main answers);
  // `seq` drops a closed dialog's late plan. Set through `changeTrashing`, so a reply that lands before the next render
  // sees the dialog as it is.
  const [trashing, setTrashing] = useState<{ root: string; row: CanvasRow; plan: TrashPlanReply | null; seq: number } | null>(null);
  const trashingRef = useRef(trashing);
  const changeTrashing = (next: typeof trashing) => { trashingRef.current = next; setTrashing(next); };
  const trashSeq = useRef(0);
  // conversation-delete: the conversation a title menu's Delete asks about, and whether its request is out. Set through
  // `changeDeleting`, so the reply sees the dialog as it is. `afterDelete` is the composer focus goes to once the
  // shown conversation was deleted, instead of the menu's trigger.
  const [deletingConversation, setDeletingConversation] = useState<{ target: DeleteTarget; pending: boolean } | null>(null);
  const deletingRef = useRef(deletingConversation);
  const changeDeleting = (next: typeof deletingConversation) => { deletingRef.current = next; setDeletingConversation(next); };
  const afterDelete = useRef<string | null>(null);
  const quittingRef = useRef(false);
  // The canvases whose `doan export` runs (`root\npath`): from main's running event, sent once the save panel closed on
  // a file, to the export's reply. The progress toast waits a second from that event.
  const [exporting, setExporting] = useState<ReadonlySet<string>>(new Set());
  const exportTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
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
  // The Project Settings page (project-settings design '이동과 잠금'): the worktree it shows, a key that changes only when
  // another worktree is picked (a reroot is followed inside the page, which keeps its config session), its title-focus
  // arrival and whether it holds a picker, a confirmation or a write. It shares the other pages' origin.
  const [projectSettings, setProjectSettingsState] = useState<{ root: string; key: number; arrival: { seq: number } | null; locked: boolean }>({ root: "", key: 0, arrival: null, locked: false });
  const projectSettingsRef = useRef(projectSettings); projectSettingsRef.current = projectSettings;
  const setProjectSettings = (next: typeof projectSettings) => { projectSettingsRef.current = next; setProjectSettingsState(next); };
  // A category the person or a target chose wins over the one ui-state read later.
  const sectionChosen = useRef(false);
  // MCP Connectors exists while Claude Code or Codex is signed in; null until agent-auth is read (mcp-connectors spec 1).
  const [mcpShown, setMcpShown] = useState<boolean | null>(null);
  const mcpShownRef = useRef(mcpShown); mcpShownRef.current = mcpShown;
  // Read once on the page when MCP Connectors turned into Agents while shown; cleared by the next move.
  const [settingsAnnouncement, setSettingsAnnouncement] = useState<string | undefined>(undefined);
  const beforeModal = useRef<HTMLElement | null>(null);
  const focusAfterModal = useRef(false);
  const toast = useToast(previous => {
    if (document.activeElement === document.body || !document.activeElement?.isConnected) focusCurrent(previous);
  });
  const workspaceFocus = useRef<HTMLElement | null>(null);
  // Set by the Overview's branch chip menu; the workspace focus effect then focuses the new Overview's chip.
  const chipFocus = useRef(false);
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  // `entries` is the list as shown: hidden auto-registered worktrees are left out everywhere (shownFolders). Only the
  // launch restore reads main's whole list, so it can wait for a saved worktree that is still being read.
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [allEntries, setAllEntries] = useState<FolderEntry[]>([]);
  // The group's selection before it moved to an auto-registered worktree, by that worktree (design §3.4), in memory.
  const beforeAuto = useRef(new Map<string, string>());
  const [state, setState] = useState(initialCanvasState);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const dragLayer = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  const [reroot, setReroot] = useState<(FolderFocus & { seq: number }) | null>(null);
  // `rerootSeq` counts the re-root focuses seen; Set Up keeps the count at its start so a re-root from before it is not
  // taken for its own. `locateFrom` is the root a Locate is waiting on: main reports that move as a re-root focus too,
  // but only the workspace Locate (which opens the new root itself) may move `loadedRoot` along with it.
  const rerootSeq = useRef(0), setupSeq = useRef(0), locateFrom = useRef<string | null>(null);
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
  // Why the open canvas was closed (its ID now shared by another canvas), shown on its project's Overview until another
  // canvas opens or the Overview is left, so the person learns why the canvas page went away.
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
    view: () => ({ screen: currentScreen.current, loadedRoot: loadedRootRef.current, entries: entriesRef.current, canvas: openRef.current?.folder === loadedRootRef.current ? openRef.current.canvas : null }),
    label: root => live.current.projectLabel(root),
    // The move after a send cancels the restore like any navigation but is not the person's own move.
    openOverview: (root, arrived, unavailable, conversationId) => {
      // The run settles with its started toast instead of waiting for a move that cannot happen.
      if (locked()) { unavailable(); return; }
      navigationIntent.current++; restoreCancelled.current = true; setRestore("done");
      // Already on that Overview: only the main conversation changes (buzz-project design §2.4).
      if (shownOverviewRef.current === root) { if (arrived()) live.current.askConversation(root, conversationId); return; }
      controller.current?.openWorkspace(root, next => {
        if (!arrived()) return;
        workspaceFocus.current = null; live.current.askConversation(root, conversationId); live.current.completeNavigation(next);
      }, false, () => unavailable(), true);
    },
    // The controller's own wait for the project's read; the person's next navigation starts after this.
    cancelMove: () => controller.current?.cancelWorkspaceOpen(),
    openCanvas: (root, row, conversation) => conversation
      ? live.current.openCanvasConversation(root, row, conversation.conversationId, { kind: "notification", permission: conversation.waiting })
      : live.current.openShellCanvas(root, row),
    goHome: () => live.current.home(),
    removeNow: paths => live.current.removeNow(paths),
    toast: (message, label, run) => live.current.toast.show(message, label, run),
    sent: request => setHomeMemory(previous => {
      const next = { ...previous, lastRoot: request.root, lastProvider: request.runtime,
        ...(request.model ? { models: { ...previous?.models, [request.runtime]: { model: request.model, ...(request.effort ? { effort: request.effort } : {}) } } } : {}) };
      return request.permissionMode ? rememberPermission(next, request.runtime, request.permissionMode) : next;
    }),
    followedMode: (provider, mode) => live.current.followMode(provider, mode),
    changed: () => { setRunTick(tick => tick + 1); overviewRun.current?.sync(); canvasRun.current?.sync(); },
  });
  // The Overview's main conversation and its composer's lists (buzz-project), for the run; the root it shows, as
  // committed.
  const shownOverviewRef = useRef<string | null>(null);
  // conversationByRoot is written from the start; the Overview reads it only once ui-state was read (memoryRead).
  const conversationByRoot = useRef<Record<string, string>>({});
  // The initial ui-state read has settled (a failed read counts). No save is sent before it: main replaces the whole
  // file on each save, so an early save would drop every remembered field it does not carry (RBR4).
  const memoryRead = useRef(false);
  // Roots the run wrote, cleared or removed before that read.
  const memoryTouched = useRef(new Set<string>());
  const [memoryTick, setMemoryTick] = useState(0);
  // The canvas page's conversation panel (buzz-canvas design §2): open state and width on this device. A change the
  // person made before the ui-state read wins over the read value.
  const [rightPanel, setRightPanelState] = useState<NonNullable<UiState["rightPanel"]>>({ open: true });
  const rightPanelRef = useRef(rightPanel); rightPanelRef.current = rightPanel;
  const panelTouched = useRef(false);
  const changePanel = (change: (previous: NonNullable<UiState["rightPanel"]>) => NonNullable<UiState["rightPanel"]>) => { panelTouched.current = true; setRightPanelState(change); };
  // The Overview's canvas conversations panel width on this device (undefined: its default), apart from the canvas
  // panel's, the same way: a resize before the read wins.
  const [overviewSaved, setOverviewSaved] = useState<number | undefined>(undefined);
  const overviewTouched = useRef(false);
  // The sidebar's width on this device (undefined: the default), the same way: a resize before the read wins. The
  // shown width is a root variable, so every shell's grid follows it and a drag can preview it without a render.
  const [sidebarSaved, setSidebarSaved] = useState<number | undefined>(undefined);
  const sidebarTouched = useRef(false);
  const shownSidebar = sidebarWidth(sidebarSaved);
  // Hidden on every screen at once and remembered on this device like the width; a toggle before the read wins. Shown
  // as a root attribute, so every shell's grid drops its first column the way it follows the width variable.
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const sidebarHiddenRef = useRef(sidebarHidden); sidebarHiddenRef.current = sidebarHidden;
  const sidebarHiddenTouched = useRef(false);
  // Focus was in the sidebar (or one of its menus) when it was hidden: the header's Show sidebar button takes it.
  const sidebarFocus = useRef(false);
  // Only a toggle animates the shells' first column; the startup read and a resize do not.
  const sidebarMotion = useRef(false);
  // The header button, ⌘B and View > Hide/Show Sidebar. Hiding unmounts the sidebar, so its open menus close with it
  // instead of waiting under a flag to reappear (POSTMORTEM 2026-11-01 'A frame drawer list closed by a disabled trigger
  // reopened by itself'). Not a Back/Forward visit.
  function toggleSidebar() {
    const hide = !sidebarHiddenRef.current;
    const active = document.activeElement;
    sidebarFocus.current = hide && typeof Element !== "undefined" && active instanceof Element && active.closest(".shell-side, .doan-sidebar-handle, .shell-side-menu") !== null;
    sidebarHiddenTouched.current = true;
    sidebarMotion.current = true;
    setSidebarHidden(hide);
  }
  // Optional: App's DOM-less tests stub a document without a root element.
  const previewSidebar = (width: number) => document.documentElement?.style.setProperty("--doan-sidebar-width", `${width}px`);
  useLayoutEffect(() => previewSidebar(shownSidebar), [shownSidebar]);
  // The window and the measured column holding the canvas and the panel (sidebar and margins excluded).
  const [panelSize, setPanelSize] = useState<{ window: number; shell: number } | null>(null);
  const shellRoot = useRef<HTMLElement>(null);
  // Which button takes focus after the panel folds ("show") or comes back ("hide"), or the panel itself ("panel", the
  // agent notice's Open).
  // "content": an entry's arrival takes focus inside the panel itself.
  const panelFocus = useRef<"show" | "hide" | "panel" | "content" | null>(null);
  // Only folding and unfolding animate the column; a drag, a window resize or the Overview's own column must not.
  const [panelMotion, setPanelMotion] = useState(false);
  const overviewRun = useRef<OverviewRun | null>(null);
  if (!(overviewRun.current instanceof OverviewRun)) overviewRun.current = new OverviewRun({
    list: root => homeRun.current.listState(root),
    readsStarted: root => homeRun.current.readsStarted(root),
    readsApplied: root => homeRun.current.readsApplied(root),
    reread: root => homeRun.current.retryList(root),
    remembered: () => memoryRead.current ? conversationByRoot.current : null,
    remember: (root, id) => {
      if (!memoryRead.current) memoryTouched.current.add(root);
      const current = conversationByRoot.current;
      if (current[root] === (id ?? undefined)) return;
      const next = { ...current };
      if (id === null) delete next[root]; else next[root] = id;
      conversationByRoot.current = next; setMemoryTick(tick => tick + 1);
    },
    markSeen: (id, seq) => homeRun.current.markSeenThrough(id, seq),
    focused: () => document.hasFocus(),
    openCanvas: (root, canvas, conversationId, scroll) => live.current.openConversationCanvas(root, canvas, conversationId, { kind: "notification", permission: scroll === "permission" }),
    toast: (message, label, run) => live.current.toast.show(message, label, run),
    notice: text => live.current.toast.show(text),
    label: root => live.current.projectLabel(root),
    changed: () => setRunTick(tick => tick + 1),
  });
  // The canvas page's conversation panel (buzz-canvas-conversation); it shares the Overview's threads and drafts.
  const canvasRun = useRef<CanvasRun | null>(null);
  if (!(canvasRun.current instanceof CanvasRun)) canvasRun.current = new CanvasRun({
    list: root => homeRun.current.listState(root),
    readsStarted: root => homeRun.current.readsStarted(root),
    readsApplied: root => homeRun.current.readsApplied(root),
    reread: root => homeRun.current.retryList(root),
    markSeen: (id, seq) => homeRun.current.markSeenThrough(id, seq),
    focused: () => document.hasFocus(),
    drawing: (root, canvas) => homeRun.current.drawing(root, canvas),
    changed: () => setRunTick(tick => tick + 1),
  }, overviewRun.current.store);
  // Where focus goes once the panel shows what an entry asked for (design §2 'Opening the panel'); a new seq per entry.
  // The seq only grows: the panel applies an arrival once by its seq, so a later entry must never reuse one.
  const [arrival, setArrival] = useState<{ focus: "permission" | "composer"; seq: number } | null>(null);
  const panelArrivals = useRef(0);
  const support = useRef<DockedSupport | null>(null);
  if (!support.current) support.current = new DockedSupport(() => setRunTick(tick => tick + 1));
  const loadedRootRef = useRef(loadedRoot); loadedRootRef.current = loadedRoot;
  const openRef = useRef(state.open); openRef.current = state.open;
  function focusCurrent(previous: HTMLElement | null = null) {
    if (document.querySelector("dialog[open]")) return;
    // The Project Settings page is drawn in the Settings page's shell.
    const settingsShell = currentScreen.current === "settings" || currentScreen.current === "projectSettings";
    const scope = currentScreen.current === "home" ? ".home-shell" : currentScreen.current === "addProjects" ? ".add-shell" : settingsShell ? ".settings-shell" : ".workspace";
    const usable = (node: HTMLElement | null): node is HTMLElement => !!node && node.isConnected && !!node.closest(scope)
      && !node.closest('[inert], [hidden], [aria-hidden="true"]') && !node.matches(":disabled")
      && node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible";
    const selectors = currentScreen.current === "home" ? [".home-shell .composer-input", ".home-shell button"]
      : currentScreen.current === "addProjects" ? [".add-panel h2", ".add-shell button"]
      : settingsShell ? [".settings-panel h1", ".settings-shell button"]
      : ['.side [role="treeitem"][tabindex="0"]', '.shell-search', '.workspace .top button'];
    const fallback = selectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)));
    (usable(previous) ? previous : fallback.find(usable))?.focus();
  }
  const [foldersSeen, setFoldersSeen] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  useEffect(() => {
    if (!viewport.current || !board.current || !overlay.current || !dragLayer.current) return;
    const sendSelection = (selection: Selection | null) => {
      window.doan.setSelection(selection).catch((error: unknown) => console.error("selection:set failed", error));
    };
    const instance = new CanvasController(viewport.current, board.current, overlay.current, setState, sendSelection, selector => window.doan.inspect(selector), dragLayer.current, () => window.doan.pointer());
    controller.current = instance;
    const stopFolders = window.doan.onFolders((all, focus) => {
      const next = shownFolders(all), before = entriesRef.current;
      if (focus) {
        const located = locateFrom.current === focus.from;
        if (!located) setLoadedRoot(root => root === focus.from ? focus.root : root);
        rerootSeq.current += 1;
        setReroot({ ...focus, seq: rerootSeq.current });
      }
      const removed = entriesRef.current.filter(entry => !next.some(row => row.path === entry.path)).map(entry => entry.path);
      if (removed.length) {
        setExpanded(previous => Object.fromEntries(Object.entries(previous).filter(([root]) => !removed.includes(root))));
        setShellProjects(previous => Object.fromEntries(Object.entries(previous).flatMap(([key, project]) => {
          const roots = project.roots.filter(root => !removed.includes(root));
          return roots.length ? [[key, { roots, expanded: project.expanded, ...(project.selectedRoot && roots.includes(project.selectedRoot) ? { selectedRoot: project.selectedRoot, ...(project.selectedAt !== undefined ? { selectedAt: project.selectedAt } : {}) } : {}), ...(project.groups ? { groups: project.groups } : {}) }]] : [];
        })));
        const previous = historyRef.current;
        const nextHistory = { visits: previous.visits.filter(visit => !removed.includes(visit.root)), cursor: previous.visits.slice(0, previous.cursor + 1).filter(visit => !removed.includes(visit.root)).length - 1 };
        historyRef.current = nextHistory; setHistory(nextHistory);
        forgetConversations(removed);
      }
      entriesRef.current = next;
      setEntries(next); setAllEntries(all); instance.updateEntries(next, all); setFoldersSeen(true);
      live.current.leaveVanished(before, next);
    });
    instance.canvasRemoved = ({ folder, row, duplicates }) => {
      if (duplicates === null) { live.current.toast.show(removedCanvasMessage(row)); return; }
      const text = duplicateIdText(row, duplicates);
      live.current.toast.show(text);
      setOverviewNotice({ root: folder, text });
    };
    instance.canvasMoved = ({ folder, from, row }) => {
      setExpanded(previous => previous[folder] ? { ...previous, [folder]: moveExpanded(previous[folder], from, row.path) } : previous);
    };
    instance.viewChanged = () => live.current.save();
    instance.onPicked(result => live.current.pickEnded(result));
    instance.linkedCanvas = root => live.current.completeNavigation(root);
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace") instance.command(name); });
    return () => { navigationIntent.current++; stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { void window.doan.homeDirectory().then(setHomeDirectory).catch(console.error); }, []);
  // First run shows when main's session has no completion record (P's v1 marker); the session is the one the CLI
  // shares, so a hidden and shown window keeps it.
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
  // While the Add Projects page selects or clones, or a Settings category or the Project Settings page holds a picker, a
  // confirmation or a write, every move away is ignored here, in one place (buzz-add-projects, buzz-settings and
  // project-settings design '잠금'): marking the controls alone would leak through toasts and keyboard activation.
  const locked = () => (currentScreen.current === "addProjects" && pageRef.current.locked) || (currentScreen.current === "settings" && settingsRef.current.locked)
    || (currentScreen.current === "projectSettings" && projectSettingsRef.current.locked);
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
      // A Home send lands in the Overview's composer field (buzz-project design §2.5).
      if (homeRun.current.takeFocus() === "composer") { const field = document.querySelector<HTMLElement>(".workspace .ov-main .composer-input"); if (field) { field.focus(); return; } }
      // A worktree picked from the Overview's branch chip lands on the new Overview's chip (design §2.5).
      if (chipFocus.current) { chipFocus.current = false; const chip = document.querySelector<HTMLElement>(".workspace .ov-main .wt-chip"); if (chip) { chip.focus(); return; } }
      const previous = workspaceFocus.current;
      (previous?.isConnected && previous.closest(".workspace") ? previous : document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]'))?.focus();
    }
  }, [screen, loadedRoot]);
  useEffect(() => {
    if (!loadedRoot || loadedRoot === locating?.from || entries.some(entry => entry.path === loadedRoot)) return;
    setLoadedRoot(null);
    // Leaving as leavePage does for Home: a startup restore or a workspace still opening must not land after it.
    if (workspaceRemoved(screen, loadedRoot, entries.map(entry => entry.path), locating?.from ?? null)) { cancelRestore(); controller.current?.cancelWorkspaceOpen(); setScreen("home"); }
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
      // The same for the Overview's memory: a conversation shown before the read keeps its newer entry.
      if (active) { conversationByRoot.current = mergeConversationMemory(state?.conversationByRoot, conversationByRoot.current, memoryTouched.current); memoryRead.current = true; setMemoryTick(tick => tick + 1); overviewRun.current?.sync(); }
      if (active && state?.settingsSection && !sectionChosen.current) setSettings({ ...settingsRef.current, section: state.settingsSection });
      if (active && state?.rightPanel && !panelTouched.current) setRightPanelState(state.rightPanel);
      if (active && state?.overviewPanel && !overviewTouched.current) setOverviewSaved(state.overviewPanel.width);
      if (active && state?.sidebar && !sidebarTouched.current) setSidebarSaved(state.sidebar.width);
      if (active && state?.sidebar?.hidden && !sidebarHiddenTouched.current) setSidebarHidden(true);
      // The controller keeps a tool the person chose before this read.
      if (active && state?.canvasTool) controller.current?.restoreTool(state.canvasTool);
      if (active && !restoreCancelled.current) setRestore({ state, started: performance.now() });
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (restoreCancelled.current || restore === null || restore === "done" || !foldersSeen) return;
    const elapsed = performance.now() - restore.started;
    const plan = restorePlan(restore.state, allEntries, elapsed);
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
    const listed = allEntries.find(entry => entry.path === plan.root);
    const row = plan.canvas && !plan.canvas.view && listed?.kind === "list" ? listed.canvases.find(row => row.path === plan.canvas?.path) : undefined;
    controller.current?.openWorkspace(plan.root, next => {
      setLoadedRoot(next); setScreen("workspace");
      if (row) controller.current?.openCanvas(next, row);
    });
    if (plan.missingCanvas) toast.show(missingCanvasMessage(plan.missingCanvas));
    if (plan.duplicateId && listed?.kind === "list") {
      const { id, count } = plan.duplicateId, saved = restore.state.canvas;
      const named = listed.canvases.find(row => row.path === saved && row.id === id) ?? listed.canvases.find(row => row.id === id);
      if (named) {
        const text = duplicateIdText(named, count);
        toast.show(text);
        setOverviewNotice({ root: plan.root, text });
      }
    }
  }, [restore, foldersSeen, allEntries, restoreTick]);
  // Sent at once, pans included: main debounces the write and flushes it on
  // quit, while a value still waiting here would be lost to a quick ⌘Q.
  const save = () => {
    if (restore !== "done" || !memoryRead.current) return;
    const instance = controller.current;
    if (!instance) return;
    const state = savedUiState({ ...persisted.current, view: instance.currentView(), memory: instance.memory(), conversationByRoot: conversationByRoot.current });
    if (state) void window.doan.saveUiState(state).then(saved => { if (!saved) console.error("doan: UI state was not saved"); }).catch(console.error);
  };
  // A page is never restored; a restart opens the screen it came from. Settings keeps only its last category.
  const savedScreen = screen === "addProjects" || screen === "settings" || screen === "projectSettings" ? page.origin.screen : screen;
  const sidebarState = sidebarSaved === undefined && !sidebarHidden ? undefined
    : { ...(sidebarSaved === undefined ? {} : { width: sidebarSaved }), ...(sidebarHidden ? { hidden: true as const } : {}) };
  const overviewPanelState = overviewSaved === undefined ? undefined : { width: overviewSaved };
  const persisted = useRef({ screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section, rightPanel, overviewPanel: overviewPanelState, sidebar: sidebarState, canvasTool: state.tool });
  persisted.current = { screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section, rightPanel, overviewPanel: overviewPanelState, sidebar: sidebarState, canvasTool: state.tool };
  // At commit, so a change already on screen has been sent.
  useLayoutEffect(save, [restore, savedScreen, loadedRoot, state.open, expanded, shellProjects, homeMemory, settings.section, memoryTick, rightPanel, overviewSaved, sidebarSaved, sidebarHidden, state.tool]);
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
    const selected = group && shellRef.current[group.key]?.selectedRoot;
    if (selected && selected !== root && entriesRef.current.find(entry => entry.path === root)?.autoRegistered) beforeAuto.current.set(root, selected);
    if (group) setShellProjects(previous => { const groups = previous[group.key]?.groups; return { ...previous, [group.key]: { roots: group.rows.map(row => row.path), expanded: previous[group.key]?.expanded ?? false, selectedRoot: root, selectedAt: Date.now(), ...(groups ? { groups } : {}) } }; });
  };
  const enter = (root: string) => {
    if (locked()) return;
    cancelRestore();
    if (root === loadedRoot) { controller.current?.cancelWorkspaceOpen(); setScreen("workspace"); }
    else controller.current?.openWorkspace(root, next => completeNavigation(next), false);
  };
  // opened: after the canvas shows, for a caller that records something only once the open went through.
  const openShellCanvas = (root: string, row: CanvasRow, cursor?: number, opened?: () => void) => {
    if (locked()) return;
    cancelRestore();
    controller.current?.openCanvas(root, row, undefined, { opened: () => { completeNavigation(root, cursor); opened?.(); }, unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, row.path)) });
  };
  // arrived: after the move commits, for an entry point that asks the Overview for a conversation.
  const showShellOverview = (root: string, cursor?: number, arrived?: () => void) => {
    if (locked()) return;
    cancelRestore();
    if (root === loadedRoot) controller.current?.showOverview(() => { arrived?.(); completeNavigation(root, cursor); });
    else controller.current?.openWorkspace(root, next => { arrived?.(); completeNavigation(next, cursor); }, false, undefined, true);
  };
  // An entry point's conversation: the root's Overview shows it (a waiting one scrolled to its request), a canvas one
  // opens its canvas (buzz-project design §2.4).
  function askConversation(root: string, conversationId: string) {
    const list = homeRun.current.listState(root);
    const waiting = Array.isArray(list) && list.some(c => c.conversationId === conversationId && c.phase === "waiting");
    overviewRun.current!.request(root, conversationId, waiting ? "permission" : null);
  }
  function openConversationCanvas(root: string, canvas: Canvas, conversationId?: string, trigger: PanelTrigger = { kind: "promotion" }) {
    const listed = entriesRef.current.find(entry => entry.path === root);
    const row = listed?.kind === "list" ? listed.canvases.find(row => sameCanvas(canvas, row)) : undefined;
    if (!row) { live.current.toast.show(unavailableCanvasMessage(listed, canvas.path)); return; }
    if (conversationId) live.current.openCanvasConversation(root, row, conversationId, trigger);
    else live.current.openShellCanvas(root, row);
  }
  // The conversation slots with the terminal sessions' spinners over them, as the sidebar shows them.
  const shownSlots = () => withTerminalSlots(homeRun.current.slots(), work, entriesRef.current);
  // A sidebar canvas row: its slot decides whether the panel unfolds (design §2 'Opening the panel'). A row that needs an
  // answer or has an unseen ending shows the canvas's current conversation; working or no mark keeps the panel as is.
  // The slot is the one the row shows, so a terminal spinner over an unseen ending keeps the panel.
  function openSidebarCanvas(root: string, row: CanvasRow, cursor?: number) {
    const slot = shownSlots().get(canvasSlotKey(root, row.path)) ?? null;
    const open = panelOpenFor({ kind: "sidebarRow" }, slot?.kind ?? null);
    const list = homeRun.current.listState(root);
    const target = { path: row.path, ...(row.id ? { id: row.id } : {}) };
    const current = open.open === true && Array.isArray(list) ? list.find(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, target)) : undefined;
    if (current) openCanvasConversation(root, row, current.conversationId, { kind: "sidebarRow" }, slot?.kind ?? null);
    else openShellCanvas(root, row, cursor);
  }
  // An entry to one of a canvas's conversations (design §2 'Opening the panel'): the canvas opens with that
  // conversation asked for in its panel, and the panel unfolds when the trigger opens it.
  // `slot` is the canvas row's sidebar slot, which a sidebar row's trigger reads.
  function openCanvasConversation(root: string, row: CanvasRow, conversationId: string, trigger: PanelTrigger, slot: Slot["kind"] | null = null) {
    if (locked()) return;
    const target: CanvasTarget = { root, canvas: row.id ? { path: row.path, id: row.id } : { path: row.path } };
    const open = panelOpenFor(trigger, slot);
    const scroll: ScrollTo | null = open.open === true && open.focus === "permission" ? "permission" : null;
    canvasRun.current!.request(target, conversationId, scroll);
    const reveal = () => { if (open.open === true) revealPanel(open.focus); };
    const shown = openRef.current;
    if (currentScreen.current === "workspace" && shown?.folder === root && shown.canvas === row.path && shownOverviewRef.current === null) reveal();
    else live.current.openShellCanvas(root, row, undefined, reveal);
  }
  // An auto-registered worktree left the list as shown (its folder vanished, or it can no longer be read) without any
  // move of the person's (design §3.4). Its remembered canvas and previous selection go. When it was on screen, its
  // canvas, Overview or Project Settings page moves to the same place in the worktree selected before it, else the
  // group's main checkout, even in a problem state (orch decision 7); no toast. A page opened from its workspace keeps
  // its screen and takes that worktree as its origin. A group with nothing left was removed from Doan, and that path
  // goes Home as before.
  function leaveVanished(before: readonly FolderEntry[], after: readonly FolderEntry[]) {
    for (const gone of before) {
      if (gone.autoRegistered !== true || after.some(entry => entry.path === gone.path)) continue;
      const previous = beforeAuto.current.get(gone.path) ?? null;
      beforeAuto.current.delete(gone.path);
      controller.current?.remember(gone.path, null);
      const now = currentScreen.current;
      const workspace = now === "workspace" && loadedRootRef.current === gone.path;
      const settingsPage = now === "projectSettings" && projectSettingsRef.current.root === gone.path;
      const origin = pageRef.current.origin;
      const fromPage = (now === "addProjects" || now === "settings" || now === "projectSettings") && origin.screen === "workspace" && origin.root === gone.path;
      if (!workspace && !settingsPage && !fromPage) continue;
      const card = groupProjects(before, new Map(before.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : []))).find(card => card.rows.some(row => row.path === gone.path));
      const rows = after.filter(entry => card?.rows.some(row => row.path === entry.path));
      const open = openRef.current;
      const to = fallbackWorktree(rows, gone.path, previous, workspace && open?.folder === gone.path ? open.canvas : null);
      if (!to) continue;
      // The page's origin follows as Locate moves it (projectSettingsRerooted): leaving enters the destination, its
      // remembered canvas or Overview, rather than finding the origin gone and going Home (orch decision 10).
      if (fromPage) { const next = { ...pageRef.current, origin: { screen: "workspace" as const, root: to.root } }; pageRef.current = next; setPage(next); }
      if (settingsPage) setProjectSettings({ root: to.root, key: projectSettingsRef.current.key + 1, arrival: { seq: ++arrivals.current }, locked: false });
      if (!workspace) continue;
      const entry = after.find(entry => entry.path === to.root);
      const row = entry?.kind === "list" && to.canvas ? entry.canvases.find(row => row.path === to.canvas) : undefined;
      if (row) openShellCanvas(to.root, row);
      else if (entry?.kind === "list") showShellOverview(to.root);
      // A worktree that is not a list cannot be entered; it takes the workspace as it is, its problem screen.
      else completeNavigation(to.root);
    }
  }
  function forgetConversations(roots: readonly string[]) {
    if (!memoryRead.current) for (const root of roots) memoryTouched.current.add(root);
    conversationByRoot.current = withoutRoots(conversationByRoot.current, roots); setMemoryTick(tick => tick + 1);
    overviewRun.current?.forgetRoots(roots);
  }
  const cards = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const card = cards.find(card => card.rows.some(row => row.path === loadedRoot));
  const entry = entries.find(entry => entry.path === loadedRoot);
  const groupSignature = JSON.stringify(cards.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })));
  useEffect(() => {
    if (!foldersSeen || restore !== "done") return;
    // Loading may not yet expose git.common; preserve membership until classification settles. A hidden auto-registered
    // worktree still loading counts too, or a restart would drop it as the group's saved selection.
    if (allEntries.some(entry => entry.kind === "loading")) return;
    setShellProjects(previous => {
      const next = reconcileProjects(previous, cards.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })));
      // A hand fold lasts only while its project stays loaded, so entering it again by any path shows it unfolded.
      for (const [key, project] of Object.entries(next)) if (project.collapsed && !(loadedRoot && project.roots.includes(loadedRoot))) { const { collapsed: _, ...rest } = project; next[key] = rest; }
      if (loadedRoot && card && next[card.key]?.selectedRoot !== loadedRoot) {
        const project = next[card.key]!;
        next[card.key] = { roots: project.roots, expanded: project.expanded, selectedRoot: loadedRoot, ...(project.collapsed ? { collapsed: true } : {}), ...(project.groups ? { groups: project.groups } : {}) };
      }
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
  }, [groupSignature, entries, allEntries, loadedRoot, restore, foldersSeen]);
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
  // A project row's canvas notice opens its canvas wherever a conversation slot would open the Overview (D10).
  const openNotice = (notice: { root: string; path: string }, opened?: () => void) => {
    const listed = entriesRef.current.find(entry => entry.path === notice.root);
    const row = listed?.kind === "list" ? listed.canvases.find(row => row.path === notice.path) : undefined;
    if (row) openShellCanvas(notice.root, row, undefined, opened);
    else toast.show(unavailableCanvasMessage(listed, notice.path));
  };
  const toggleProject = async (key: string, notice?: { root: string; path: string }) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    // A locked page ignores only the move to a workspace (design '잠금'): the row still unfolds another project, and
    // never folds one, as unlocked; the chevron folds. The loaded project is already unfolded or folded by hand.
    if (locked()) {
      if (!loadedRoot || !group.rows.some(row => row.path === loadedRoot))
        setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path), expanded: true } }));
      return;
    }
    const loaded = loadedRoot !== null && group.rows.some(row => row.path === loadedRoot);
    // A terminal slot stands for the canvas its session works on: the row opens it before its own move, which would
    // re-enter the loaded project's last canvas or fold an expanded project (terminal-agent-activity design '표시').
    if (notice && shownSlots().get(canvasSlotKey(notice.root, notice.path))?.source === "terminal") {
      if (!loaded) { cancelRestore(); controller.current?.cancelWorkspaceOpen(); }
      openNotice(notice, loaded ? undefined : () => setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path), expanded: true } })));
      return;
    }
    // Home and the Add Projects page show the sidebar without a current project: from Home its row opens the Overview,
    // from the page it goes back to the loaded workspace (design §3).
    if (loaded) {
      if (shellRef.current[key]?.collapsed) setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path), expanded: true, collapsed: false } }));
      const move = loadedProjectRow({ screen: currentScreen.current, overviewShown: shownOverviewRef.current === loadedRoot });
      if (move === "enter") enter(loadedRoot);
      else if (notice) openNotice(notice);
      else if (move === "slot") askSlot(loadedRoot);
      else showShellOverview(loadedRoot, undefined, () => askSlot(loadedRoot));
      return;
    }
    cancelRestore(); controller.current?.cancelWorkspaceOpen();
    const memory = { ...(shellRef.current[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) };
    if (notice) { openNotice(notice, () => setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? memory), expanded: true } }))); return; }
    const intent = navigationIntent.current, signature = groupSignature;
    const activity = await window.doan.readShellActivity({ roots: memory.roots }).catch(() => null);
    const groups = groupProjects(entriesRef.current, new Map(entriesRef.current.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
    if (intent !== navigationIntent.current || signature !== JSON.stringify(groups.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })))) return;
    const root = selectProjectRoot(memory, activity ?? [], loadedRoot); if (!root) return;
    const selected = entriesRef.current.find(entry => entry.path === root);
    if (selected?.kind !== "list" && selected?.kind !== "loading") { setShellProjects(previous => ({ ...previous, [key]: { ...memory, selectedRoot: root, expanded: true } })); return; }
    // Another project's row opens its Overview from anywhere, never its last canvas, and never folds it: only its chevron
    // does (user decisions; project-row-disclosure draft).
    controller.current?.openWorkspace(root, next => {
      setShellProjects(previous => ({ ...previous, [key]: { ...memory, expanded: true } }));
      askSlot(next);
      completeNavigation(next);
    }, false, undefined, true);
  };
  // The project row's chevron (project-row-disclosure draft): fold or unfold only, the loaded project included.
  const discloseProject = (key: string) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    setShellProjects(previous => {
      const memory = { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) };
      const open = projectExpanded(memory, loadedRoot);
      // Only the loaded project needs the mark: projectExpanded opens it regardless of `expanded`.
      const loaded = loadedRoot !== null && memory.roots.includes(loadedRoot);
      return { ...previous, [key]: { ...memory, expanded: !open, collapsed: open && loaded } };
    });
  };
  // The project row's slot stands for a project conversation with work left: its Overview opens on it.
  const askSlot = (root: string) => {
    const slot = homeRun.current.slotConversation(root);
    if (slot) overviewRun.current!.request(root, slot.conversationId, slot.waiting ? "permission" : null);
  };
  // A locked page keeps the disclosure, as project expansion does (design-system-canvases design 'sidebar').
  const toggleShellGroup = (key: string, id: GroupId) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    setShellProjects(previous => ({ ...previous, [key]: withGroups({ ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) }, groups => toggleGroup(groups, id)) }));
  };
  // Whatever opened it, a newly shown canvas opens its group (Q12); a group closed while it stays shown stays closed.
  const lastShown = useRef<ShownCanvas | null>(null);
  useEffect(() => {
    const next = state.open && state.shown ? { root: state.open.folder, path: state.shown } : null;
    const id = groupToOpen(lastShown.current, next);
    lastShown.current = next;
    const key = id && cards.find(card => card.rows.some(row => row.path === next!.root))?.key;
    if (!id || !key) return;
    setShellProjects(previous => previous[key]?.groups?.[id] === false ? { ...previous, [key]: withGroups(previous[key]!, groups => openGroup(groups, id)) } : previous);
  }, [state.open?.folder, state.shown]);
  const search = () => { if (locked()) return; cancelRestore(); beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQuickOpen(true); };


  const modal = wizard !== null || setup !== null || quickOpen || homeRun.current.removing !== null || trashing !== null || deletingConversation !== null;
  // A locked Project Settings page holds the toast too: its Share confirmation makes the toast inert while the page
  // itself is not modal (project-settings design '영향 범위' 토스트, POSTMORTEM 2026-10-25 'Native hiding bypassed
  // renderer-only lifetime checks').
  const toastHeld = modal || (screen === "projectSettings" && projectSettings.locked);
  useLayoutEffect(() => { toast.setModal(toastHeld); }, [toastHeld]);
  const live = useRef({ home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: (root: string) => root, askConversation, openConversationCanvas, openCanvasConversation, newConversation: () => {}, pickFromCanvas: () => {}, toggleSidebar: () => {}, pickEnded: (_result: PickResult) => {}, followMode: (_provider: Provider, _mode: PermissionModeId) => {}, openLink: (_result: OpenLinkResult) => {}, openCanvasRequest: (_request: OpenAsk) => {} });
  live.current = { home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: root => projectLabelRef.current(root), askConversation, openConversationCanvas, openCanvasConversation, newConversation, pickFromCanvas, toggleSidebar, pickEnded, followMode, openLink, openCanvasRequest };
  const rememberFocus = () => { beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const modalClosed = () => { focusAfterModal.current = true; };
  useEffect(() => {
    if (modal || !focusAfterModal.current) return;
    focusAfterModal.current = false;
    const field = afterDelete.current && document.querySelector<HTMLElement>(afterDelete.current);
    afterDelete.current = null;
    if (field) { focusFieldEnd(field); return; }
    const previous = beforeModal.current;
    focusCurrent(previous);
  }, [modal, entries]);
  // A path the removal confirmation names left the list (a reroot, a removal elsewhere): it closes, since it no longer
  // names what would go and main refuses a removal of an unlisted path (project-remove-confirm design §2).
  useEffect(() => {
    const removing = homeRun.current.removing;
    if (removing && !removing.paths.every(path => entries.some(entry => entry.path === path))) { homeRun.current.cancelRemove(); modalClosed(); }
  }, [entries]);
  // The row the Move to Trash dialog asks about left the list: the dialog closes. A folder still loading keeps it.
  useEffect(() => {
    if (!trashing) return;
    const entry = entries.find(entry => entry.path === trashing.root);
    if (entry?.kind === "loading" || (entry?.kind === "list" && entry.canvases.some(row => row.path === trashing.row.path))) return;
    closeTrash();
  }, [entries, trashing]);
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
      const root = reroot?.from === setup && reroot.seq > setupSeq.current ? reroot.root : setup;
      choose(root);
      setSetup(null); modalClosed();
    }
  }, [setup, entries, reroot]);
  useEffect(() => { if (!highlight.length) return; const timer = setTimeout(() => setHighlight([]), 2400); return () => clearTimeout(timer); }, [highlight]);
  // A page opens from Home or a workspace and remembers that screen as its origin; the workspace stays hidden as on
  // Home, so its canvas, view, selection and drafts are kept. From the other page the origin stays.
  const shellScreen = (): ShellScreen => {
    const now = currentScreen.current;
    if (now === "addProjects" || now === "settings" || now === "projectSettings") return { screen: now };
    return now === "workspace" && loadedRootRef.current !== null ? { screen: "workspace", root: loadedRootRef.current } : { screen: "home" };
  };
  // Entering cancels a pending startup restore and a workspace still opening (POSTMORTEM 2026-10-27), and so does
  // entering the page already shown: it is the person's latest move too (that entry's no-op path rule).
  const cancelPending = () => { cancelRestore(); controller.current?.cancelWorkspaceOpen(); };
  function enterPage(to: PageName): AddPageOrigin | null {
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
    const arrival = settingsArrival(target, settingsRef.current.section), focus = arrival.focus;
    // A hidden MCP Connectors opens Agents (the failure toast's Open MCP Connectors, a saved last category).
    const section = shownSettingsSection(arrival.section, mcpShownRef.current);
    sectionChosen.current = true;
    setSettingsAnnouncement(undefined);
    setSettings({ section, locked: false, arrival: { focus, seq: ++arrivals.current } });
  };
  // A category picked in the sidebar keeps focus on its row, so it brings no arrival (design '포커스').
  const selectSection = (section: SettingsSection) => {
    if (currentScreen.current !== "settings" || locked()) return;
    sectionChosen.current = true;
    setSettingsAnnouncement(undefined);
    setSettings({ ...settingsRef.current, section, arrival: null });
  };
  // Project Settings from a project menu (the sidebar's or the Overview's recovery menu). On the page, picking another
  // worktree switches to it with a new page and the same origin, and picking the same one focuses its title
  // (project-settings design '같은 페이지에서 다시 들어오기'); a locked page takes neither.
  function openProjectSettings(root: string) {
    if (live.current.modal) return;
    const current = projectSettingsRef.current;
    if (currentScreen.current === "projectSettings") {
      const next = projectSettingsReentry(current.root, root, locked());
      if (next.kind === "ignore") return;
      cancelPending();
      const arrival = { seq: ++arrivals.current };
      setProjectSettings(next.kind === "switch" ? { root: next.root, key: current.key + 1, arrival, locked: false } : { ...current, arrival });
      return;
    }
    const origin = enterPage("projectSettings");
    if (!origin) return;
    const next = { ...pageRef.current, origin };
    pageRef.current = next; setPage(next);
    setProjectSettings({ root, key: current.key + 1, arrival: { seq: ++arrivals.current }, locked: false });
    setScreen("projectSettings");
  }
  // The page's lock, as Settings reports its own: a move started before it would otherwise land after it.
  const projectSettingsReport = ({ locked: next }: { locked: boolean }) => {
    const current = projectSettingsRef.current;
    if (next === current.locked) return;
    if (next) { navigationIntent.current++; controller.current?.cancelWorkspaceOpen(); }
    setProjectSettings({ ...current, locked: next });
  };
  // Locate or Set Up moved the page's worktree: App's root and an origin on the old root's workspace follow, or leaving
  // would find the origin gone and go Home (POSTMORTEM 2026-10-25 'Locating a project kept the old root's selection').
  const projectSettingsRerooted = (root: string, origin: AddPageOrigin) => {
    setProjectSettings({ ...projectSettingsRef.current, root });
    const next = { ...pageRef.current, origin };
    pageRef.current = next; setPage(next);
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
    const known = homeRun.current.knows(click.conversationId);
    const registered = entriesRef.current.some(entry => entry.path === click.root);
    const to = notificationTarget(click, known, registered, locked() || live.current.modal);
    if (to.kind === "conversation") homeRun.current.openConversation(to.conversationId);
    // A conversation this run has not listed yet is asked for on its root's Overview, which reads the list again and
    // falls back to its default when main does not list it either.
    else if (to.kind === "overview") {
      if (shownOverviewRef.current === to.root) askConversation(to.root, click.conversationId);
      else showShellOverview(to.root, undefined, () => askConversation(to.root, click.conversationId));
    }
  }
  function leavePage(event: AddPageEvent) {
    const now = currentScreen.current;
    if (now !== "addProjects" && now !== "settings" && now !== "projectSettings") return;
    // gone (the page's worktree left the list) passes the lock; the lock goes with the page, so the move below runs.
    const to = addPageReturn(pageRef.current.origin, event, entriesRef.current.map(entry => entry.path), locked());
    if (to.kind === "stay") return;
    if (event.kind === "gone") setProjectSettings({ ...projectSettingsRef.current, locked: false });
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
  useEffect(() => window.doan.onQuitting(quitting => { quittingRef.current = quitting; }), []);
  // doan:// links: subscribed on mount, while main holds them until App is ready (below).
  useEffect(() => window.doan.onOpenLink(result => live.current.openLink(result)), []);
  // `doan open` requests (canvas-open-offer): main sends them only once links are ready, and each is answered by its id.
  useEffect(() => window.doan.onOpenRequest(request => live.current.openCanvasRequest(request)), []);
  // Ready once the launch restore is applied (or cancelled) and the first folders are in, so a link's canvas opens over
  // the restored screen (terminal-agent-activity design 'Deep link' '대기').
  const linksReady = useRef(false);
  useEffect(() => {
    if (linksReady.current || restore !== "done" || !foldersSeen) return;
    linksReady.current = true;
    void window.doan.openLinksReady().catch(console.error);
  }, [restore, foldersSeen]);
  // The canvases terminal sessions work on (terminal-agent-activity 'Renderer IPC'): subscribed first, then read, and a
  // change that lands before the read answers is newer than it.
  const [work, setWork] = useState<readonly WorkItem[]>([]);
  useEffect(() => {
    let current = true, changed = false;
    const stop = window.doan.onWorkChanged(items => { changed = true; setWork(items); });
    void window.doan.getWork().then(items => { if (current && !changed) setWork(items); }).catch(console.error);
    return () => { current = false; stop(); };
  }, []);
  // The renderer's one sign-in controller tells a sign-in that ended away from Agents in the shared toast, and hears
  // when the window comes back to the front (design 'App 수준 로그인 컨트롤러').
  useEffect(() => agentSignIn().onToast(({ text, action }) => live.current.toast.show(text, action?.label, action ? () => live.current.openSettings(action.target) : undefined)), []);
  // Settings > MCP Connectors: one reader of main's snapshots for the whole window, since a connection attempt
  // outlives the page. It tells a failure elsewhere in the shared toast (spec 4) and follows running turns (spec 10).
  const mcpWatch = useRef<McpConnectorsWatch | null>(null);
  if (!mcpWatch.current) mcpWatch.current = new McpConnectorsWatch({
    api: window.doan,
    running: provider => homeRun.current.runningProviders().has(provider),
    pageShown: () => currentScreen.current === "settings" && settingsRef.current.section === "mcp",
    toast: (text, label, run) => live.current.toast.show(text, label, run),
    openPage: () => live.current.openSettings({ section: "mcp" }),
  });
  useEffect(() => mcpWatch.current!.start(), []);
  useEffect(() => {
    const signIn = agentSignIn(), update = () => setMcpShown(mcpAvailable(signIn.state.auth));
    update();
    return signIn.subscribe(update);
  }, []);
  // A notice goes once its agent's running turn has ended; the conversation lists redraw App when that changes.
  useEffect(() => { mcpWatch.current!.runningChanged(); });
  // While neither Claude Code nor Codex is signed in, a shown or restored MCP Connectors becomes Agents; on the page
  // focus goes to the Agents title and the page says why once (spec 1).
  useEffect(() => {
    if (mcpShown !== false || settingsRef.current.section !== "mcp") return;
    const onPage = currentScreen.current === "settings";
    setSettings({ ...settingsRef.current, section: "agents", arrival: onPage ? { focus: { kind: "heading" }, seq: ++arrivals.current } : null });
    if (onPage) setSettingsAnnouncement(MCP_HIDDEN_ANNOUNCEMENT);
  }, [mcpShown, settings.section]);
  useEffect(() => {
    const focused = () => { agentSignIn().windowFocused(); overviewRun.current!.focusChanged(); canvasRun.current!.focusChanged(); };
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
  const rememberPick = (choice: ComposerChoice) => {
    setHomeMemory(previous => rememberChoice(previous, choice));
    const next = preferenceAfterPick(preferences?.preferences.newConversation ?? null, choice);
    if (next) void savePreferences({ newConversation: next });
  };
  // A mode main moved a conversation to after a Claude plan approval: that provider's last mode and a fixed Settings
  // default of the same provider follow it, but the last provider stays (permission-mode design '저장 규칙').
  function followMode(provider: Provider, mode: PermissionModeId) {
    setHomeMemory(previous => rememberPermission(previous, provider, mode));
    const next = preferenceAfterPick(preferences?.preferences.newConversation ?? null, { provider, model: null, effort: null, permissionMode: mode });
    if (next) void savePreferences({ newConversation: next });
  }
  // Escape leaves a page unless a field or an IME composition holds it, or an overlay closes itself first.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (currentScreen.current !== "addProjects" && currentScreen.current !== "settings" && currentScreen.current !== "projectSettings")) return;
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
    return homeRun.current.remove(paths, removalQuestionLabel(cards, paths, names));
  }
  async function removeNow(paths: string[]) {
    cancelRestore();
    const result = await window.doan.removeProjects(paths);
    if (result.kind === "removed") {
      setShellProjects(previous => Object.fromEntries(Object.entries(previous).flatMap(([key, project]) => {
        const roots = project.roots.filter(root => !paths.includes(root));
        return roots.length ? [[key, { roots, expanded: project.expanded, ...(project.selectedRoot && roots.includes(project.selectedRoot) ? { selectedRoot: project.selectedRoot, ...(project.selectedAt !== undefined ? { selectedAt: project.selectedAt } : {}) } : {}), ...(project.groups ? { groups: project.groups } : {}) }]] : [];
      })));
      setExpanded(previous => Object.fromEntries(Object.entries(previous).filter(([root]) => !paths.includes(root))));
      for (const root of paths) controller.current?.remember(root, null);
      forgetConversations(paths);
      const previous = historyRef.current;
      const before = previous.visits.slice(0, previous.cursor + 1).filter(visit => !paths.includes(visit.root));
      const nextHistory = { visits: previous.visits.filter(visit => !paths.includes(visit.root)), cursor: before.length - 1 };
      historyRef.current = nextHistory; setHistory(nextHistory);
    }
  }
  // canvas-row-menu design 'Alert Dialog': the dialog asks main whether a comment file goes too before it can be
  // confirmed. A busy plan keeps it open with its working line; any other refusal closes it with that refusal's toast.
  // Closing returns focus to the row's menu button through `beforeModal`.
  function openTrash(root: string, row: CanvasRow, button: HTMLElement | null) {
    if (locked() || live.current.modal) return;
    beforeModal.current = button;
    const seq = ++trashSeq.current;
    changeTrashing({ root, row, plan: null, seq });
    const answered = (plan: TrashPlanReply) => {
      const current = trashingRef.current;
      if (current?.seq !== seq) return;
      if (plan.kind === "refused" && plan.reason !== "busy") { closeTrash(); live.current.toast.show(trashToast(canvasStem(row.path), plan)); return; }
      changeTrashing({ ...current, plan });
    };
    window.doan.planCanvasTrash(root, row.path).then(answered, () => answered({ kind: "refused", reason: "failed" }));
  }
  function closeTrash() { changeTrashing(null); modalClosed(); }
  // Confirmed: the dialog closes at once and the reply's toast is the only one (design '삭제 뒤 화면'). The mark set
  // before the request makes the open canvas's removal a trash, not a move to another canvas of the same id.
  function confirmTrash() {
    const current = trashingRef.current;
    if (!current) return;
    closeTrash();
    const { root, row } = current, marks = controller.current?.trash, mark = marks?.begin(root, row.path);
    const done = (reply: TrashReply) => {
      if (mark) marks!.settle(mark, reply.kind === "trashed" ? "trashed" : "refused");
      live.current.toast.show(trashToast(canvasStem(row.path), reply));
    };
    window.doan.trashCanvas(root, row.path).then(done, () => done({ kind: "refused", reason: "failed" }));
  }
  // conversation-delete design §3.4: a title menu row's Delete asks first. Cancel and Escape return focus to the menu's
  // trigger (`beforeModal`); the row's button is inside the closed menu.
  function openDelete(target: DeleteTarget, trigger: HTMLElement | null): boolean {
    if (locked() || live.current.modal) return false;
    beforeModal.current = trigger;
    changeDeleting({ target, pending: false });
    return true;
  }
  function closeDelete() { changeDeleting(null); modalClosed(); }
  // main answers busy for a refusal while the app quits too, and that refusal shows no toast; main says when a quit
  // proceeds (never reset).
  const quitting = () => quittingRef.current;
  function deleteSummary(target: DeleteTarget) {
    const list = homeRun.current.listState(target.root);
    return Array.isArray(list) ? list.find(c => c.conversationId === target.conversationId) : undefined;
  }
  // The store marks the conversation as being deleted before main is asked, and the mark ends exactly once: deleted
  // (success, or not_found: main has none either) or cancelled (any other refusal, a rejected call). A leaked mark would
  // freeze that conversation's state until a reload. The dialog closes on the reply; only a refusal shows a toast.
  async function confirmDelete() {
    const current = deletingRef.current;
    if (!current || current.pending) return;
    changeDeleting({ ...current, pending: true });
    const { conversationId, root, title, from } = current.target;
    const overviewRuns = overviewRun.current!, canvasRuns = canvasRun.current!, store = overviewRuns.store;
    store.startDelete(conversationId);
    let code: string | null = "unknown";
    try {
      const reply = await window.doan.deleteConversation({ conversationId });
      code = reply && "error" in reply ? reply.error : null;
    } catch (error) { console.error(error); }
    // The cleanup may throw (a Run's defect); the mark still ends once and the alert, which refuses its cancel while
    // busy, still closes, or the window would stay behind it until a reload.
    try {
      if (code === null || code === "not_found") {
        try {
          const overviewView = overviewRuns.view(root), canvasView = canvasRuns.view();
          const shown = from === "overview" ? overviewView.kind === "conversation" && overviewView.conversationId === conversationId
            : canvasView?.kind === "conversation" && canvasView.conversationId === conversationId;
          overviewRuns.deleted(conversationId); canvasRuns.deleted(conversationId); homeRun.current.deleted(conversationId);
          if (shown) afterDelete.current = from === "overview" ? ".workspace .ov-main .composer-input" : ".doan-conv-panel .composer-input";
        } finally { store.deleted(conversationId); }
      } else { store.cancelDelete(conversationId); overviewRuns.sync(); canvasRuns.sync(); }
    } catch (error) { console.error(error); }
    finally {
      closeDelete();
      if (code !== null && !quitting()) live.current.toast.show(deleteRefusalText(code, title));
    }
  }
  // What keeps Move to Trash unavailable, for the menu and the open dialog alike (main judges again).
  function trashWorking(root: string, row: CanvasRow) {
    const list = homeRun.current.listState(root);
    return trashBlock({ root, path: row.path, ...(row.id ? { id: row.id } : {}) }, Array.isArray(list) ? list : null, work, (at, canvas) => homeRun.current.drawing(at, canvas)) !== null;
  }
  // canvas-row-menu design '앱 Export 흐름': main shows the save panel, runs the CLI and answers once; the item stays
  // unavailable from main's running event to the reply. A refusal of a second request leaves the first one's state.
  function exportCanvas(root: string, row: CanvasRow) {
    if (locked()) return;
    const key = `${root}\n${row.path}`;
    const done = (reply: ExportReply) => {
      if (reply.kind !== "refused" || reply.reason !== "exporting") {
        clearTimeout(exportTimers.current.get(key)); exportTimers.current.delete(key);
        setExporting(previous => { if (!previous.has(key)) return previous; const next = new Set(previous); next.delete(key); return next; });
      }
      returnExportFocus(key);
      const result = exportToast(canvasStem(row.path), reply);
      if (!result) return;
      const reveal = result.reveal;
      if (reveal) live.current.toast.show(result.text, "Show in Finder", () => { void window.doan.revealExport(reveal).catch(console.error); });
      else live.current.toast.show(result.text);
    };
    window.doan.exportCanvas(root, row.path).then(done, () => done({ kind: "failed", reason: "failed" }));
  }
  // The canvas toolbar's Export (canvas-composer-polish spec 5): the row menu's export on the open canvas. Focus that
  // fell to the page while the save panel was open goes back to the button once, when main reports the run or answers
  // (POSTMORTEM 2026-11-03: never leave focus on the page body). Reads refs only, so the running listener may call it.
  const exportFocus = useRef<{ key: string; button: HTMLElement } | null>(null);
  function returnExportFocus(key: string) {
    const waiting = exportFocus.current;
    if (!waiting || waiting.key !== key) return;
    exportFocus.current = null;
    const active = document.activeElement;
    if ((!active || active === document.body) && waiting.button.isConnected) waiting.button.focus({ preventScroll: true });
  }
  useEffect(() => {
    const timers = exportTimers.current;
    const stop = window.doan.onExportRunning(({ root, path }) => {
      const key = `${root}\n${path}`;
      setExporting(previous => new Set(previous).add(key));
      returnExportFocus(key);
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { timers.delete(key); live.current.toast.show(exportProgress(canvasStem(path))); }, 1000));
    });
    return () => { stop(); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); };
  }, []);
  // notice: a caller that shows the action's own feedback itself (the Project Settings page, under its notice);
  // otherwise the toast.
  function action(name: RowAction, root: string, notice: (text: string) => void = text => toast.show(text)) {
    cancelRestore();
    if ((name === "retry" || name === "locate") && document.activeElement instanceof HTMLElement) recoveryFocus.current = { element: document.activeElement, root };
    if (name === "details") { const entry = entriesRef.current.find(entry => entry.path === root); if (entry?.kind === "error") notice(entry.message); }
    else if (name === "setUp") { rememberFocus(); setupSeq.current = rerootSeq.current; setSetup(root); }
    else if (name === "remove") void remove([root]);
    else if (name === "showInFinder") void window.doan.revealProject(root).catch(console.error);
    else if (name === "retry") void window.doan.reopenFolder(root).catch(console.error);
    else if (name === "locate") {
      const workspace = loadedRoot === root && currentScreen.current === "workspace";
      if (workspace) setLocating({ from: root, root: null });
      locateFrom.current = root;
      void window.doan.locateProject(root).then(result => {
        if (result.kind === "refused") notice(result.message);
        if (workspace && result.kind === "located") { setLoadedRoot(result.root); setLocating({ from: root, root: result.root }); }
        else if (workspace) setLocating(null);
      }).catch(error => { if (workspace) setLocating(null); console.error(error); }).finally(() => { if (locateFrom.current === root) locateFrom.current = null; });
    }
  }
  useEffect(() => window.doan.onMenuCommand(name => {
    if (live.current.modal) return;
    menuCommand(name, {
      home: () => live.current.home(),
      quickOpen: () => live.current.search(),
      newConversation: () => live.current.newConversation(),
      pickFromCanvas: () => live.current.pickFromCanvas(),
      toggleSidebar: () => live.current.toggleSidebar(),
    });
  }), []);
  const onPage = screen === "addProjects", onSettings = screen === "settings", onProjectSettings = screen === "projectSettings";
  const pageLocked = (onPage && page.locked) || (onSettings && settings.locked) || (onProjectSettings && projectSettings.locked);
  const command = (name: ViewCommand) => controller.current?.command(name);
  // A pick from the Add Projects page goes through openCanvas too.
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
    controller.current?.openCanvas(result.root, row, frameId === undefined ? undefined : { frame: frameId }, { unavailable, ...(result.kind === "frame" ? { found, index: result.frameIndex } : {}), opened: () => completeNavigation(result.root) });
  }
  // A doan:// link (terminal-agent-activity design 'Deep link'): Quick Open's move. A frame moves the view as Quick Open's
  // frame does, without selection; a frame not in the canvas leaves the canvas only, with no toast. A refused link
  // shows one toast. Main checked the root and the list; the renderer's list may still lag, as for any move. A link
  // landing on a locked page or first run goes nowhere. A link or a `doan open` comes only from a person (a click, or a
  // request they asked an agent for), so an open dialog is dismissed first through its own cancel event, the path
  // Escape and Cancel take; one that refuses (it is busy) keeps the move from happening.
  function openLink(result: OpenLinkResult) {
    if (result.kind !== "navigate") { live.current.toast.show(openLinkRefusal(result)); return; }
    const decision = decideOpen(result, openPage());
    if (decision.kind === "busy") return;
    cancelRestore();
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.canvas));
    if (decision.kind === "canvas_not_found") { unavailable(decision.entry); return; }
    controller.current?.openCanvas(result.root, decision.row, result.frame === undefined ? undefined : { frame: result.frame }, { unavailable, opened: () => completeNavigation(result.root) });
  }
  // A chip in an agent's reply (agent-reply-chips design 'Pressing'), from the canvas panel or the Overview of `root`.
  // A chip into the canvas on screen locates there, as a sent chip does: no move, no visit. A chip into another canvas
  // of the root moves as a link does (decideOpen, then Quick Open's path with its visit), to its frame without
  // selecting it or to its element after the first layout; a target that is not there leaves the canvas only. A canvas
  // that cannot be opened shows one toast. Settles with the locate's outcome, or null when it did not locate.
  function replyChip(root: string, link: ReplyAnchor): Promise<LocateOutcome | null> {
    const entry = entriesRef.current.find(entry => entry.path === root);
    const onScreen = canvasOnScreenRef.current;
    const target = replyChipTarget(link, { root, openCanvasId: onScreen?.root === root ? onScreen.id : null, entry });
    if (target === "locate") return locateChip(link.kind === "frame" ? { frame: { id: link.id } } : { element: { doanId: link.id } });
    if (typeof target === "string") { live.current.toast.show(replyChipRefusal(target, link.canvas, live.current.projectLabel(root), entry)); return Promise.resolve(null); }
    const decision = decideOpen({ root, canvas: target.open.path }, openPage());
    if (decision.kind === "busy") return Promise.resolve(null);
    cancelRestore();
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, target.open.path));
    if (decision.kind === "canvas_not_found") { unavailable(decision.entry); return Promise.resolve(null); }
    controller.current?.openCanvas(root, decision.row, link.kind === "frame" ? { frame: link.id } : { element: link.id }, { unavailable, opened: () => completeNavigation(root) });
    return Promise.resolve(null);
  }
  // `doan open` moves as a link does, but answers main instead of showing a toast: a refusal changes nothing on screen,
  // and the agent tells the person why. The answer is sent once the move is decided, not when the canvas has loaded;
  // the frame result comes from the canvas's listed frames, the ones the rendered canvas reports.
  function openCanvasRequest(request: OpenAsk) {
    // Past `expires` main has already told the CLI busy and drops any answer: close no dialog and move nowhere.
    // Checked again before the move, since closing a dialog runs its handlers first.
    const expired = () => Date.now() >= request.expires;
    if (expired()) return;
    const answer = (result: OpenResult) => void window.doan.answerOpenRequest({ id: request.id, ...result }).catch(console.error);
    const decision = decideOpen(request, openPage());
    if (decision.kind === "busy") { answer({ kind: "busy", reason: decision.reason }); return; }
    if (decision.kind === "canvas_not_found") { answer({ kind: "canvas_not_found" }); return; }
    if (expired()) return;
    cancelRestore();
    let opened = false;
    controller.current?.openCanvas(request.root, decision.row, request.frame === undefined ? undefined : { frame: request.frame }, { opened: () => { opened = true; completeNavigation(request.root); } });
    if (!opened) { answer({ kind: "canvas_not_found" }); return; }
    answer({ kind: "opened", frame: request.frame === undefined ? "none" : decision.row.frames?.some(frame => frame.id === request.frame) ? "found" : "missing" });
  }
  function openPage(): OpenPage {
    const screen = currentScreen.current;
    const page = !locked() ? null : screen === "addProjects" ? "add_projects" : screen === "settings" ? "settings" : "project_settings";
    return { locked: page, firstRun: wizard !== null, entries: () => entriesRef.current, dismissDialogs() {
      const dialog = topDialog();
      // Synchronous, so the dialog's close has rendered before the check below.
      if (dialog) flushSync(() => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
      return !topDialog();
    } };
  }
  // An Overview that was open when its project turned into a problem stays, its thread readable and Send held; one
  // entered while the project is a problem shows the problem screen (buzz-project spec decision 12).
  const healthyOverview = screen === "workspace" && entry?.kind === "list" && !state.open ? entry.path : null;
  const [keptOverview, setKeptOverview] = useState<string | null>(null);
  useEffect(() => {
    if (healthyOverview) setKeptOverview(healthyOverview);
    else if (screen !== "workspace" || state.open || loadedRoot !== keptOverview) setKeptOverview(null);
  }, [healthyOverview, screen, state.open, loadedRoot]);
  const overview = healthyOverview !== null || (keptOverview !== null && screen === "workspace" && !state.open && loadedRoot === keptOverview && entry) ? entry ?? null : null;
  const shownOverview = overview?.path ?? null;
  shownOverviewRef.current = shownOverview;
  // The canvas the conversation panel belongs to: the open canvas of a listed project, while its page shows.
  const panelCanvas = screen === "workspace" && overview === null && state.open && entry?.kind === "list" && entry.path === state.open.folder ? state.open : null;
  const panelKey = panelCanvas ? JSON.stringify([panelCanvas.folder, panelCanvas.row.id ?? null, panelCanvas.canvas]) : null;
  const panelTarget = useMemo<CanvasTarget | null>(() => panelCanvas ? { root: panelCanvas.folder, canvas: panelCanvas.row.id ? { path: panelCanvas.canvas, id: panelCanvas.row.id } : { path: panelCanvas.canvas } } : null, [panelKey]);
  const panelTargetRef = useRef(panelTarget); panelTargetRef.current = panelTarget;
  // The canvas a reply chip can locate in: the panel's, while the canvas page shows it, with its root, since worktrees
  // share canvas ids (POSTMORTEM 2026-11-01). The Overview leaves the last canvas laid out but covers it, so it is not
  // on screen then (agent-reply-chips design 'Pressing').
  const canvasOnScreenRef = useRef<{ root: string; id: string } | null>(null);
  canvasOnScreenRef.current = panelCanvas && !state.unlisted && panelCanvas.row.id ? { root: panelCanvas.folder, id: panelCanvas.row.id } : null;
  // Keyed by the canvas, not the target object: a render that reads the same canvas does not show it again.
  useLayoutEffect(() => { canvasRun.current!.show(panelTargetRef.current); }, [panelKey]);
  useEffect(() => { canvasRun.current!.panel(rightPanel.open && panelKey !== null); }, [rightPanel.open, panelKey]);
  const panelList = panelTarget ? homeRun.current.listState(panelTarget.root) : "loading";
  const panelCanvasName = panelCanvas ? canvasLabel(panelCanvas.row) : "";
  const panelTitle = canvasConversationTitle(canvasRun.current!, panelList);
  // A page that knows its canvas is outside the list, or that another canvas shares its ID, keeps the draft in a
  // composer that takes no input (design §2 'Errors').
  const duplicated = panelCanvas?.row.id !== undefined && entry?.kind === "list" && entry.canvases.filter(row => row.id === panelCanvas.row.id).length > 1;
  const panelProject = panelTarget ? cards.find(card => card.rows.some(row => row.path === panelTarget.root))?.name ?? projectNames(entries.map(entry => entry.path)).get(panelTarget.root) ?? panelTarget.root : "";
  const panelBlocked = !panelTarget ? null : state.unlisted ? canvasUnlistedText(panelProject) : duplicated ? DUPLICATE_CANVAS_TEXT : null;
  const panelCurrent = panelTarget && Array.isArray(panelList) ? panelList.find(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, panelTarget.canvas)) : undefined;
  const panelBadge = openButtonBadge(panelCurrent, rightPanel.open, homeRun.current.seenPending());
  const canvasLoad: CanvasLoad = state.unlisted ? "unlisted" : state.status === null && state.layout ? "loaded" : state.status === "failed" ? "failed" : state.status === "noWidth" ? "noWidth" : "loading";
  const composerKey = canvasRun.current!.composerKey();
  const composerChips = composerKey ? distinctTargets(overviewRun.current!.store.drafts.get(composerKey)?.segments ?? []) : 0;
  const pickerView = panelTarget !== null ? pickerAvailability(panelBlocked, canvasLoad, composerChips) : { enabled: false, reason: PICKER_UNAVAILABLE };
  const pickerReady = pickerView.enabled;
  // Edit > Pick from Canvas follows the canvas toolbar's Picker: the canvas page, with the picker available (the
  // composer takes input and the canvas is loaded).
  const canvasPageShown = screen === "workspace" && !!state.open && shownOverview === null;
  const menuPicker = canvasPageShown && pickerReady;
  const exportTarget = state.open;
  const exportReason = canvasExportReason(exportTarget?.row ?? null, !!exportTarget && exporting.has(`${exportTarget.folder}\n${exportTarget.row.path}`), state.unlisted);
  const exporter: ExportTool = { reason: exportReason, onExport: button => {
    if (!exportTarget || exportReason !== null || locked()) return;
    exportFocus.current = { key: `${exportTarget.folder}\n${exportTarget.row.path}`, button };
    exportCanvas(exportTarget.folder, exportTarget.row);
  } };
  const picking = state.picking;
  // V, H and Space switch tools only on the canvas page itself (canvas-hand-tool design '키').
  const toolPage = screen === "workspace" && shownOverview === null && !modal;
  useEffect(() => { controller.current?.setCanvasPage(toolPage); }, [toolPage]);
  // Pick from canvas: the composer's Pick, the toolbar's Picker and ⌘L share one pick (canvas-composer-polish spec 3).
  // The pick's start keeps where focus was, so the end can tell whether focus still waits for the composer.
  // The pick's start: the composer field it will put the chip in, where focus was, and whether focus may go back.
  // `pressed`: the pick ends because the person pressed a control (the Picker, Pick, ⌘L, Select or Hand), which keeps
  // focus where that press left it.
  const pickIntent = useRef<{ field: HTMLElement | null; from: Element | null; focus: FocusIntent; pressed?: boolean } | null>(null);
  // The shown composer's field, which the panel's composer registers (DockedFieldLink).
  const composerLink = useRef<DockedFieldLink | null>(null);
  const togglePick = () => {
    const instance = controller.current;
    if (!instance) return;
    if (picking) { pressedCancel(); instance.cancelPick(); return; }
    if (!pickerReady) return;
    const from = document.activeElement, field = composerLink.current?.element() ?? null;
    // The picker, the page, the canvas and the field itself are where a pick leaves focus; anything else ends it.
    const focus = new FocusIntent(target => !target || target === from || target === document.body || target === field
      || (target instanceof Node && !!viewport.current?.contains(target)));
    pickIntent.current?.focus.end();
    pickIntent.current = { field, from, focus };
    if (!instance.pick()) { focus.end(); pickIntent.current = null; }
  };
  const pressedCancel = () => { if (pickIntent.current) pickIntent.current.pressed = true; };
  // The toolbar's Picker and ⌘L: a folded panel unfolds first. Its composer stays mounted, so the pick starts at once
  // and focus waits for the pick's end.
  function pickFromCanvas() {
    if (!picking && pickerReady && !rightPanelRef.current.open && panelOpenFor({ kind: "picker" }, null).open === true) foldPanel(true, "content");
    togglePick();
  }
  // The toolbar's Select and Hand cancel a pick, then switch (the controller); focus stays on the pressed tool.
  const chooseTool = (tool: CanvasState["tool"]) => {
    if (picking) pressedCancel();
    controller.current?.setTool(tool);
  };
  function pickEnded(result: PickResult) {
    const intent = pickIntent.current;
    pickIntent.current = null;
    const holds = intent?.focus.holds() ?? false;
    intent?.focus.end();
    const link = composerLink.current;
    // A pick ends with its composer: another one now on screen gets nothing (the switch also cancels the pick).
    if (!link || !intent || link.element() !== intent.field) return;
    const active = document.activeElement;
    // A composing field gets its chip once the composition ends, and no focus or caret call meanwhile.
    const returns = holds && !link.composing();
    if (result.kind !== "picked") {
      // A cancel by a press leaves focus on what was pressed; Esc and the other cancels go back to where focus was
      // before the pick, or the field when that was the page itself (spec 3: never the page body).
      if (!returns || intent.pressed) return;
      const from = intent.from;
      if (from instanceof HTMLElement && from !== document.body && from.isConnected) from.focus({ preventScroll: true });
      else link.focus();
      return;
    }
    // Focus first, then the chip: the field puts its kept caret back on focus, and Chromium moves a caret set in an
    // unfocused field to the field's start when it takes focus afterwards (BR4b runtime probe).
    if (returns) link.focus();
    link.insert(result.anchor, "caret");
    // Placing the caret for the chip can pull focus into the field; focus that may not move goes back where it was.
    if (!returns && active instanceof HTMLElement && active !== document.activeElement) active.focus({ preventScroll: true });
  }
  // The picker stops when its composer changes (another conversation from the menu, New) or stops taking chips
  // (design §2 'Esc and cancel'); a reload or a same-ID move keeps both, so the pick goes on.
  useEffect(() => { controller.current?.cancelPick(); }, [composerKey]);
  useEffect(() => { if (!pickerReady) controller.current?.cancelPick(); }, [pickerReady]);
  const locateChip = (anchor: Anchor) => new Promise<LocateOutcome>(settle => {
    if (!controller.current?.locate(anchor, settle)) settle("unavailable");
  });
  useEffect(() => {
    // The Project Settings page enables the menu as Settings does (no canvas items, no New Conversation), so main's
    // menu state needs no screen of its own (project-settings design '영향 범위' 메뉴).
    void window.doan.setMenuState({ screen: onPage ? "addProjects" : onSettings || onProjectSettings ? "settings" : screen === "home" ? "home" : state.open ? "canvas" : "workspace", modal,
      ...(onPage && page.choose ? { choose: true } : {}), ...(pageLocked ? { locked: true } : {}), ...(shownOverview !== null ? { overview: true } : {}),
      ...(menuPicker ? { pickerAvailable: true } : {}), ...(sidebarHidden ? { sidebarHidden: true } : {}) });
  }, [screen, state.open, modal, page.choose, pageLocked, shownOverview, menuPicker, sidebarHidden]);
  useLayoutEffect(() => { overviewRun.current!.show(shownOverview); }, [shownOverview]);
  // The window's focus decides whether the shown conversation is seen (spec decision 11); the focus listener is the
  // sign-in controller's below.
  useEffect(() => {
    const blur = () => { overviewRun.current!.focusChanged(); canvasRun.current!.focusChanged(); };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  // File > New Conversation (⌘N): on the shown Overview its new conversation state; on the canvas page the panel unfolds
  // in the canvas's new conversation state. Either way the composer field takes focus.
  function newConversation() {
    if (live.current.modal || currentScreen.current !== "workspace") return;
    const root = shownOverviewRef.current;
    if (root) {
      overviewRun.current!.select(root, null);
      queueMicrotask(() => document.querySelector<HTMLElement>(".workspace .ov-main .composer-input")?.focus());
      return;
    }
    if (!panelTargetRef.current) return;
    controller.current?.dropPendingLocate();
    canvasRun.current!.select(null);
    const open = panelOpenFor({ kind: "newConversation" }, null);
    if (open.open === true) revealPanel(open.focus);
  }
  const previousOverview = useRef(shownOverview);
  useEffect(() => {
    if (previousOverview.current !== null && previousOverview.current !== shownOverview) setOverviewNotice(null);
    previousOverview.current = shownOverview;
  }, [shownOverview]);
  // The canvas page's right column (buzz-canvas design §2 '오른쪽 패널'): the conversation panel at its remembered width,
  // clamped to the window's bounds, or none while folded. The Overview's column has its own remembered width under the
  // same bounds: the canvas panel stays in the layout under the Overview, so the one measure serves both.
  const canvasPage = overview === null;
  const panelBox = panelSize ?? { window: 0, shell: 0 };
  const panelLimits = panelBounds(panelBox.window, panelBox.shell);
  const shownPanel = panelWidth(rightPanel.width, panelLimits, canvasPanelDefault(panelBox.window));
  const shownOverviewPanel = panelWidth(overviewSaved, panelLimits, OVERVIEW_PANEL_DEFAULT);
  const rightColumn = canvasPage ? (rightPanel.open ? `${shownPanel}px` : "0px") : `${shownOverviewPanel}px`;
  useLayoutEffect(() => {
    // Optional: App's DOM-less tests stub a document without a root element.
    const root = document.documentElement;
    if (!root) return;
    const animate = sidebarMotion.current;
    sidebarMotion.current = false;
    if (animate) root.setAttribute("data-sidebar-motion", "");
    if (sidebarHidden) root.setAttribute("data-sidebar", "hidden");
    else root.removeAttribute("data-sidebar");
    if (!animate) return;
    const timer = setTimeout(() => root.removeAttribute("data-sidebar-motion"), 250);
    return () => { clearTimeout(timer); root.removeAttribute("data-sidebar-motion"); };
  }, [sidebarHidden]);
  // Fullscreen has no traffic lights; the header's CSS drops their space under this attribute (design §2.5).
  useEffect(() => window.doan.onFullScreen(fullScreen => {
    const root = document.documentElement;
    if (!root) return;
    if (fullScreen) root.setAttribute("data-fullscreen", "");
    else root.removeAttribute("data-fullscreen");
  }), []);
  useEffect(() => {
    if (!sidebarFocus.current) return;
    sidebarFocus.current = false;
    // Every screen draws its own header; the shown one is outside the inert workspace or page.
    [...document.querySelectorAll<HTMLElement>(".shell-sidebar-toggle")].find(button => !button.closest("[inert]"))?.focus();
  }, [sidebarHidden]);
  // The composer is contenteditable, where Chromium takes ⌘B as Bold before the menu's key equivalent sees it (T0 PoC):
  // the field hands it to the sidebar instead. A handled key never reaches the menu, so this cannot toggle twice.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || event.key.toLowerCase() !== "b") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.isContentEditable || !target.closest("[data-chip-field]")) return;
      event.preventDefault();
      if (!live.current.modal) live.current.toggleSidebar();
    };
    // On the document, ahead of the field's own handlers in the capture phase; the window's keydown is the pages' Escape.
    // Optional: App's DOM-less tests stub a document without listeners.
    document.addEventListener?.("keydown", keydown, true);
    return () => document.removeEventListener?.("keydown", keydown, true);
  }, []);
  useLayoutEffect(() => {
    const measure = () => {
      const main = shellRoot.current, canvas = main?.querySelector<HTMLElement>(":scope > .doan-canvas-panel");
      if (!main || !canvas) return;
      // The shell column runs from the canvas panel's left edge to the workspace's right padding.
      const right = main.getBoundingClientRect().left + main.clientWidth - (Number.parseFloat(getComputedStyle(main).paddingRight) || 0);
      const next = { window: window.innerWidth, shell: Math.round(right - canvas.getBoundingClientRect().left) };
      setPanelSize(previous => previous?.window === next.window && previous.shell === next.shell ? previous : next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  // The sidebar's width and hiding move the canvas column's start, so either measures again.
  }, [shownSidebar, sidebarHidden]);
  // Written here rather than in the style prop: a drag previews its width on the same property (previewPanel), and this
  // runs only when the committed width changes, so a render during the drag does not undo the preview.
  useLayoutEffect(() => {
    const main = shellRoot.current;
    if (!main) return;
    main.style.setProperty("--doan-right-width", rightColumn);
  }, [rightColumn]);
  // A canvas opened under the Overview was fitted to the Overview's layout; fit it again once this commit has applied
  // the canvas page's column (design §2 '첫 Fit'). The controller does it once per opened canvas.
  useLayoutEffect(() => { if (panelSize && canvasPage) controller.current?.settleFit(); });
  const foldPanel = (open: boolean, focus: "panel" | "content" | null = null) => {
    panelFocus.current = focus ?? (open ? "hide" : "show");
    setPanelMotion(true);
    changePanel(previous => ({ ...previous, open }));
  };
  // The panel's title takes focus when nothing in it was asked for.
  const focusPanel = () => document.querySelector<HTMLElement>(".doan-conv-panel :is(.rp-head, .doan-conv-title .ov-title)")?.focus();
  // An entry unfolds a folded panel (never the agent's own events) and hands focus to what it asked for, once the panel
  // shows it (design §2 'Opening the panel').
  function revealPanel(focus: "permission" | "composer") {
    if (!rightPanelRef.current.open) foldPanel(true, "content");
    setArrival({ focus, seq: ++panelArrivals.current });
  }
  // The other worktree notice's Open (DESIGN 'Terminal work in another worktree'): the terminal slot's path to W's same canvas,
  // which makes W the selected worktree and leaves one canvas visit. A pick on this canvas ends first.
  const onOpenSibling = (root: string) => {
    if (!state.open) return;
    controller.current?.cancelPick();
    openNotice({ root, path: state.open.canvas });
  };
  // The work capsule's Open while the agent waits for an answer (design §2): the panel shows that conversation, scrolled
  // to its request with focus on the first choice.
  const openRequest = () => {
    const target = panelTargetRef.current;
    const list = target ? homeRun.current.listState(target.root) : null;
    const waiting = target && Array.isArray(list) ? list.find(c => c.state === "current" && c.phase === "waiting" && c.canvas && sameCanvas(c.canvas, target.canvas)) : undefined;
    if (!target || !waiting) { if (rightPanel.open) focusPanel(); else foldPanel(true, "panel"); return; }
    canvasRun.current!.request(target, waiting.conversationId, "permission");
    revealPanel(panelOpenFor({ kind: "capsule" }, null).open === true ? "permission" : "composer");
  };
  // Folding hands focus to the button that undoes it (design §2: close → open button, open → close button).
  useEffect(() => {
    const to = panelFocus.current;
    panelFocus.current = null;
    if (to === "panel") focusPanel();
    else if (to === "content") return;
    else if (to) document.querySelector<HTMLElement>(to === "show" ? ".doan-canvas-head .doan-panel-show" : ".doan-conv-panel .doan-panel-hide")?.focus();
  }, [rightPanel.open]);
  useEffect(() => {
    if (!panelMotion) return;
    const timer = setTimeout(() => setPanelMotion(false), 250);
    return () => clearTimeout(timer);
  }, [panelMotion, rightPanel.open]);
  // A drag shows its width on the grid directly and commits once at the end.
  const previewPanel = (width: number) => shellRoot.current?.style.setProperty("--doan-right-width", `${width}px`);
  const resizePanel = (width: number | undefined) => changePanel(previous => width === undefined ? { open: previous.open } : { ...previous, width });
  const rendered = useMemo(() => state.open && state.layout ? { root: state.open.folder, path: state.open.canvas, frames: state.layout.frames } : undefined, [state.open?.folder, state.open?.canvas, state.layout]);
  const names = projectNames(entries.map(entry => entry.path));
  const name = names.get(state.open?.folder ?? entries[0]?.path ?? "") ?? "";
  // Home conversations (buzz-home design §7) are decided by HomeRun; App wires its navigation, toasts and dialogs.
  const projectLabel = (root: string) => cards.find(card => card.rows.some(row => row.path === root))?.name ?? names.get(root) ?? root;
  const projectLabelRef = useRef(projectLabel); projectLabelRef.current = projectLabel;
  const run = homeRun.current;
  // The Overview's right panel (design §2.3): canvases with a current conversation, thumbnails asked for those only.
  const listed = overview ? run.listState(overview.path) : null;
  const canvasList: CanvasList = overview === null || listed === null ? [] : typeof listed === "string" ? listed
    : canvasConversationRows(listed, overview.kind === "list" ? overview.canvases : [], Date.now(), run.seenPending());
  const thumbs = useThumbnails(overview?.kind === "list" ? overview.path : null, typeof canvasList === "string" ? [] : canvasList.flatMap(item => item.row ? [item.row] : []));
  useEffect(() => window.doan.onConversationEvent(event => { homeRun.current.event(event); overviewRun.current!.event(event); }), []);
  useEffect(() => window.doan.onConversationListChanged(({ root }) => homeRun.current.listChanged(root)), []);
  useEffect(() => {
    if (modal) { homeRun.current.modalChanged(true); return; }
    // Checked one task after the modal closes, the timing arrival settling has always had: a move the close leads to
    // lands first. Kept as is when the comment draft guard went (POSTMORTEM 2026-10-23 'Draft guards changed existing
    // transition timing').
    const timer = setTimeout(() => homeRun.current.modalChanged(false), 0);
    return () => clearTimeout(timer);
  }, [modal]);
  useEffect(() => { if (state.open) homeRun.current.canvasShown(state.open.folder, state.open.canvas); }, [state.open?.folder, state.open?.canvas]);
  useEffect(() => { homeRun.current.entriesChanged(); }, [entries]);
  // The canvas page, not the Overview's thumbnails, makes a canvas seen; a change while it stays shown marks it again.
  const shownCanvas = screen === "workspace" && overview === null && state.open && state.shown && !state.unlisted ? { root: state.open.folder, path: state.shown } : null;
  const mark = seenMark(entries, { screen, overview: overview !== null, root: state.open?.folder ?? null, shown: state.shown, unlisted: Boolean(state.unlisted) });
  useEffect(() => { if (mark) void window.doan.markCanvasSeen(mark).catch(() => {}); }, [mark?.root, mark?.path, mark?.mtimeMs]);
  useEffect(() => {
    if (screen !== "workspace" || !loadedRoot) return;
    homeRun.current.visit([slotKey(loadedRoot), ...(state.open?.folder === loadedRoot ? [slotKey(loadedRoot, state.open.canvas)] : [])]);
    setRunTick(tick => tick + 1);
  }, [screen, loadedRoot, state.open?.canvas, run.conversations, run.revision]);
  const shown = run.strip(loadedRoot);
  // The canvas page has no conversation strip: the panel shows this canvas's conversation, and the sidebar slots and
  // permission toasts the others (design §2 'Strip'). The problem workspace screen keeps it.
  const strip = overview === null && entry?.kind !== "list" && shown && <div className="strip-slot"><KeyedConversationStrip conversationId={shown.conversation.conversationId} provider={shown.conversation.provider} state={shown.state}
    view={stripView(shown.state, { provider: shown.conversation.provider, project: projectLabel(shown.conversation.root), branch: null, canvas: shown.conversation.canvas ? canvasLabel({ path: shown.conversation.canvas, url: "" }) : null })}
    onEditOnHome={() => void run.editOnHome(shown.conversation.conversationId)} onOpen={() => run.openConversation(shown.conversation.conversationId)}
    onDismiss={() => run.dismiss(shown.conversation.conversationId)} /></div>;
  const shellSlots = sidebarSlots(withTerminalSlots(run.slots(), work, entries), entries, shownCanvas);
  const sidebarId = (home: boolean) => home ? "doan-page-sidebar" : "doan-workspace-sidebar";
  const sidebar = (home: boolean) => sidebarHidden ? null : <ShellSidebar id={sidebarId(home)} cards={cards} projects={shellProjects} loaded={loadedRoot} canvas={state.shown ?? undefined} unlisted={state.unlisted} homeDirectory={homeDirectory} search={search} toggle={(key, notice) => void toggleProject(key, notice)} disclose={discloseProject} toggleGroup={toggleShellGroup} worktree={enter} open={openSidebarCanvas} overview={showShellOverview} action={action} remove={remove}
    projectSettings={root => openProjectSettings(root)}
    canvasMenu={{ blocked: trashWorking, exporting: (root, path) => exporting.has(`${root}\n${path}`), exportCanvas, trash: openTrash }}
    home={home} homeCurrent={screen === "home"} goHome={() => live.current.home()} slots={shellSlots} highlight={highlight} locked={pageLocked} {...(onSettings ? { settings: { section: settings.section, select: selectSection, mcp: mcpShown !== false } } : {})}
    resize={{ width: shownSidebar, bounds: SIDEBAR_BOUNDS, preview: previewSidebar, onResize: width => { sidebarTouched.current = true; setSidebarSaved(width); } }} />;
  // The Project Settings page sits under the Projects tab (page null) but leaves like the other pages.
  const anyPage = onPage || onSettings || onProjectSettings;
  const sidebarToggle = sidebarToggleView(sidebarHidden, shellSlots);
  const topBar = (overPage: boolean) => <TopBar sidebar={{ view: sidebarToggle, controls: sidebarHidden ? undefined : sidebarId(overPage), toggle: toggleSidebar }} back={anyPage || back !== null} forward={!anyPage && forward !== null} page={onPage ? "addProjects" : onSettings ? "settings" : null} locked={pageLocked}
    previous={() => anyPage ? leavePage({ kind: "back" }) : travel(back)} next={() => travel(forward)}
    addProjects={openAddProjects} projects={() => { const move = projectsTab(currentScreen.current); if (move === "leavePage") leavePage({ kind: "projectsTab" }); else if (move === "home") home(); }} settings={() => { if (!locked()) openSettings({}); }} />;
  // The selection-lost notice is an event: a toast once, not a line left on the board.
  const shownNotice = useRef("");
  useEffect(() => {
    const message = noticeToast(shownNotice.current, state.notice);
    shownNotice.current = state.notice;
    if (message) toast.show(message);
  }, [state.notice]);
  // Settings > Agents lists models for the project Home would start with.
  const modelRoot = defaultProject(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])), {
    current: composerMemory.current.root ? { root: composerMemory.current.root, name: composerMemory.current.root } : null, loaded: loadedRoot, lastRoot: homeMemory?.lastRoot ?? null }).root;
  const settingsProject = entries.some(entry => entry.path === modelRoot && entry.kind === "list") ? { root: modelRoot!, name: projectLabel(modelRoot!) } : null;
  return <TooltipProvider>
  {screen === "home" && <Home header={topBar(true)} sidebar={sidebar(true)}
    entries={entries} homeDirectory={homeDirectory} shellProjects={shellProjects} loaded={loadedRoot} select={select} prefs={homeMemory}
    memory={composerMemory} running={run.running()} restore={run.restore} start={(request, last) => run.start(request, last)} openConversation={id => run.openConversation(id)} addProjects={openAddProjects}
    defaults={preferences ? preferences.preferences.newConversation : undefined} openSettings={openSettings} onRemember={rememberPick} />}
  {onSettings && <SettingsPage header={topBar(true)} sidebar={sidebar(true)} section={settings.section} arrival={settings.arrival} onState={settingsReport}
    agents={{ signIn: agentSignIn(), preferences, save: savePreferences, project: settingsProject }}
    mcp={{ watch: mcpWatch.current, openAgents: provider => openSettings({ section: "agents", provider }) }} announcement={settingsAnnouncement} />}
  {onProjectSettings && <ProjectSettingsPage key={projectSettings.key} header={topBar(true)} sidebar={sidebar(true)} root={projectSettings.root} entries={entries} reroot={reroot}
    origin={page.origin} homeDirectory={homeDirectory} arrival={projectSettings.arrival} onState={projectSettingsReport} onGone={() => leavePage({ kind: "gone" })}
    onRerooted={projectSettingsRerooted} onAction={(name, root, notice) => action(name, root, notice)}
    onRemove={() => { const group = cards.find(card => card.rows.some(row => row.path === projectSettings.root)); if (group) void remove(group.rows.map(row => row.path)); }} />}
  {onPage && <AddProjectsPage key={page.seq} header={topBar(true)} sidebar={sidebar(true)} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)} choose={page.chooseSeq} onState={pageReport} onCancel={() => leavePage({ kind: "cancel" })} onAdded={pageAdded} />}
  <main ref={shellRoot} className={`app-shell workspace${entry && entry.kind !== "list" ? " with-status" : ""}${strip ? " with-strip" : ""}`}
    style={{ visibility: screen !== "workspace" ? "hidden" : "visible" }}
    data-panel={canvasPage && !rightPanel.open ? "collapsed" : undefined} data-panel-motion={panelMotion ? "" : undefined}
    inert={screen !== "workspace"} aria-hidden={screen !== "workspace"}>
    {topBar(false)}
    {entry && entry.kind !== "list" && <ProblemActions entry={entry} action={action} workspace={{ name: card?.name ?? name, homeDirectory, home }} />}
    {sidebar(false)}
    {strip}
    <CanvasPane viewport={viewport} board={board} overlay={overlay} dragLayer={dragLayer} state={state} entry={entry} projectName={names.get(loadedRoot ?? "") ?? loadedRoot ?? ""} command={command} covered={overview !== null}
      zoomTo={scale => controller.current?.zoomTo(scale)} selectFrame={(index, id) => controller.current?.selectFrame(index, id)} conversation={{ open: rightPanel.open, show: () => foldPanel(true), badge: panelBadge }}
      agent={{ list: state.open ? run.listState(state.open.folder) : undefined, canvas: workingCanvas(state.open, state.unlisted, entry), running: screen === "workspace" && overview === null, work, entries,
        onOpen: openRequest, onOpenSibling, onStopFailed: text => toast.show(text) }}
      picking={picking} tool={state.tool} onTool={chooseTool} picker={{ enabled: pickerReady, reason: pickerView.reason, onToggle: pickFromCanvas }} exporter={exporter} />
    {overview && <ProjectOverview key={overview.path} run={overviewRun.current!} support={support.current!} root={overview.path} project={projectLabel(overview.path)} entry={overview}
      worktrees={card?.rows ?? [overview]} homeDirectory={homeDirectory} notice={overviewNotice?.root === overview.path ? overviewNotice.text : null}
      unavailable={overview.kind === "list" ? null : startErrorView("project_not_open", "claude", projectLabel(overview.path)).text}
      list={run.listState(overview.path)} seen={run.seenPending()} holder={run.running().get(overview.path) ?? null}
      prefs={homeMemory} defaults={preferences ? preferences.preferences.newConversation : undefined} now={Date.now()} onRemember={rememberPick}
      onWorktree={root => { chipFocus.current = true; showShellOverview(root); }} onOpenCanvas={(canvas, conversationId) => openConversationCanvas(overview.path, canvas, conversationId, { kind: "promotion" })}
      onReplyChip={link => replyChip(overview.path, link)}
      onRetryList={() => run.retryList(overview.path)} onStart={(request, last) => run.start(request, last, { stay: true })}
      onSendConversation={(provider, request) => run.send(overview.path, provider, request)}
      onAction={(name, root) => action(name, root)}
      onProjectSettings={root => openProjectSettings(root)}
      onSettings={target => openSettings(target)} onNotice={text => toast.show(text)} onDeleteConversation={openDelete} />}
    {overview && <ResizeHandle className="doan-overview-handle" label="Resize canvas conversations" width={shownOverviewPanel} bounds={panelLimits} preview={previewPanel}
      onResize={width => { overviewTouched.current = true; setOverviewSaved(width); }} />}
    {overview ? <div className="right-stack"><CanvasConversations key={overview.path} list={canvasList} project={projectLabel(overview.path)} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible}
      open={item => { if (item.row) openCanvasConversation(overview.path, item.row, item.conversationId, { kind: "overviewRow" }); }} retry={() => run.retryList(overview.path)} /></div>
      : <ConversationPanel open={rightPanel.open} width={shownPanel} bounds={panelLimits} onHide={() => { controller.current?.cancelPick(); foldPanel(false); }} onResize={resizePanel} preview={previewPanel}
        title={panelTarget && <CanvasConversationTitle run={canvasRun.current!} list={panelList} canvasName={panelCanvasName} now={Date.now()} seen={run.seenPending()}
          title={panelTitle.title} current={panelTitle.current} onChoose={() => controller.current?.dropPendingLocate()} onDelete={openDelete} onPicked={() => queueMicrotask(() => document.querySelector<HTMLElement>(".doan-conv-panel .composer-input")?.focus())} />}>
        {panelTarget && entry?.kind === "list" && <CanvasConversation run={canvasRun.current!} support={support.current!} target={panelTarget} canvasName={panelCanvasName}
          project={panelProject} entry={entry} list={panelList} seen={run.seenPending()} prefs={homeMemory}
          defaults={preferences ? preferences.preferences.newConversation : undefined} now={Date.now()} blocked={panelBlocked} onRemember={rememberPick}
          frames={state.layout?.frames} locateDisabled={state.status !== null || state.unlisted} arrival={arrival} onArrived={seq => setArrival(current => current?.seq === seq ? null : current)}
          onLocate={locateChip} onReplyChip={link => replyChip(panelTarget.root, link)} onChoose={() => controller.current?.dropPendingLocate()} pick={{ pressed: picking, enabled: pickerReady, reason: pickerView.reason, onToggle: togglePick }} composerLink={composerLink}
          onSettings={target => openSettings(target)} onNotice={text => toast.show(text)}
          onOpenProjectConversation={id => showShellOverview(panelTarget.root, undefined, () => askConversation(panelTarget.root, id))} work={work} />}
      </ConversationPanel>}
  </main>
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} onClose={() => { setSetup(null); modalClosed(); }} onRerooted={(root, message) => { choose(root); setSetup(null); setHighlight([root]); toast.show(message); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => { setQuickOpen(false); if (document.activeElement === document.body || !document.activeElement?.isConnected || document.activeElement.closest("dialog.qo")) modalClosed(); }} />}
  {run.removing && <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="project-remove-title" aria-describedby="project-remove-body" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); run.cancelRemove(); modalClosed(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="project-remove-title">{run.removing.title}</h3><p className="doan-dialog-description" id="project-remove-body">{run.removing.body}</p></div></div>
    <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={() => { run.cancelRemove(); modalClosed(); }}>{run.removing.cancel}</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={() => { modalClosed(); void run.confirmRemove(); }}>{run.removing.confirm}</button></div>
  </dialog>}
  {deletingConversation && (() => {
    const { target, pending } = deletingConversation, summary = deleteSummary(target);
    const draft = unsentDraft(overviewRun.current!.store.drafts.get(draftKey({ kind: "existing", conversationId: target.conversationId, provider: target.provider }))) || summary?.returnedDraft === true;
    const availability = summary ? deleteAvailability(summary) : { available: true as const };
    return <ConversationDeleteDialog view={deleteDialogView(target.title, target.provider, draft)} reason={availability.available ? null : availability.reason} pending={pending}
      cancel={closeDelete} confirm={() => void confirmDelete()} />;
  })()}
  {trashing && <CanvasTrashDialog view={trashDialogView(canvasStem(trashing.row.path), trashing.row.path, trashing.plan, trashWorking(trashing.root, trashing.row))} cancel={closeTrash} confirm={confirmTrash} />}
  {toast.element}
  {wizard !== null && <Wizard key={wizard} session={wizard} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)}
    onClose={root => {
      setWizard(null);
      if (wizardCloseFocus(root) === "composer") { beforeWizard.current = null; focusComposer.current = true; live.current.home(); choose(root ?? undefined); }
      else restoreFocus.current = true;
    }} />}
  </TooltipProvider>;
}

// The dialog on top, the one Escape would answer.
function topDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return open[open.length - 1] ?? null;
}

// Add Projects, Projects and Settings are page tabs; on a page Back returns to where it was opened from. `locked` marks
// the tabs and Back unavailable while App ignores them (buzz-add-projects and buzz-settings design '잠금').
function TopBar({ sidebar, back, forward, previous, next, page, locked, addProjects, projects, settings }: { sidebar: { view: SidebarToggleView; controls: string | undefined; toggle(): void }; back: boolean; forward: boolean; previous(): void; next(): void; page: "addProjects" | "settings" | null; locked: boolean; addProjects(): void; projects(): void; settings(): void }) {
  const unavailable = locked || undefined;
  const tab = (name: typeof page) => name === page ? { className: "current", "aria-current": "page" as const } : {};
  return <header className="top shell-top"><span className="traffic-space" aria-hidden="true" />
    <div className="shell-history">
      {/* Left of Back, so Back and Forward move one button right (shell-panel-layout design §2.4 '헤더'). */}
      <Tooltip><TooltipTrigger asChild><button className="doan-icon-button shell-sidebar-toggle" data-ui-placement="chrome" aria-label={sidebar.view.label} aria-expanded={sidebar.view.icon === "hide"}
        aria-controls={sidebar.controls} data-badge={sidebar.view.badge ? "true" : undefined} onClick={sidebar.toggle}>{sidebar.view.icon === "hide" ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}</button></TooltipTrigger>
        <TooltipContent className="has-key">{sidebar.view.icon === "hide" ? "Hide sidebar" : "Show sidebar"}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘B</span></TooltipContent></Tooltip>
      <button className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!back} aria-disabled={unavailable} onClick={previous}><ArrowLeft /></button><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!forward} onClick={next}><ArrowRight /></button></div>
    <div className="shell-modes"><button {...tab("addProjects")} aria-disabled={unavailable} onClick={addProjects}><Plus />Add Projects</button><button {...tab(null)} aria-disabled={unavailable} onClick={projects}><LayoutGrid />Projects</button><button {...tab("settings")} aria-disabled={unavailable} onClick={settings}><Settings />Settings</button></div>
  </header>;
}

type AgentProps = { list: readonly ConversationSummary[] | "loading" | "error" | undefined; canvas: WorkingCanvas | null; running: boolean; work: readonly WorkItem[]; entries: readonly FolderEntry[]; onOpen(): void; onOpenSibling(root: string): void; onStopFailed(text: string): void };

function CanvasPane({ viewport, board, overlay, dragLayer, state, entry, projectName, command, covered, zoomTo, selectFrame, conversation, agent, picking, tool, onTool, picker, exporter }: {
  viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>; dragLayer: RefObject<HTMLDivElement | null>;
  state: CanvasState; entry: FolderEntry | undefined; projectName: string; command: (name: ViewCommand) => void; covered: boolean;
  zoomTo(scale: number): void; selectFrame(index: number, id: string): void; conversation: { open: boolean; show(): void; badge: OpenBadge | null }; agent: AgentProps;
  picking: boolean; tool: CanvasState["tool"]; onTool(tool: CanvasState["tool"]): void; picker: PickerTool; exporter: ExportTool;
}) {
  const problem = !state.open && entry && entry.kind !== "list" ? entry : null;
  const problemMessage = problem?.kind === "loading" ? "Reading project"
    : problem?.kind === "notFound" ? `The project ${projectName} is missing. Use Locate above.`
    : problem?.kind === "uninitialized" ? `The project ${projectName} is not set up. Use Set Up above.`
    : problem?.kind === "error" ? "Could not read the project configuration. Use Details or Retry above."
    : problem?.kind === "cliError" ? "Could not read the project. Use Retry above." : null;
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const track = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const control = target?.matches('button, [role="option"], [role="menuitem"]') && (panel.current?.contains(target) || target.closest(".doan-frame-list, .doan-zoom-menu"));
      lastFocus.current = control ? target : null;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);
  // A canvas control that vanished or turned disabled under focus hands it to the canvas region, not the page
  // (buzz-canvas design §2 'Esc와 포커스'). Checked a task later, after a closing Radix menu has tried its trigger.
  useEffect(() => {
    const timer = setTimeout(() => {
      const last = lastFocus.current, active = document.activeElement;
      if (!controlFocusLost({ last: last && { connected: last.isConnected, disabled: last.matches(":disabled") }, covered,
        activeLost: !active || active === document.body || !active.isConnected, activeIsLast: !!last && active === last })) return;
      lastFocus.current = null;
      viewport.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  });
  const canvasKey = state.open ? JSON.stringify([state.open.folder, state.open.canvas]) : null;
  // Stays laid out under the Overview: opening a canvas fits it to this size at once.
  return <div className="doan-canvas-panel" ref={panel} inert={covered}>
    <CanvasHeader state={state} canvasKey={canvasKey} command={command} zoomTo={zoomTo} selectFrame={selectFrame} fallbackFocus={() => viewport.current?.focus()} panel={conversation} />
    <section className="area" role="region" aria-label="Canvas" tabIndex={-1} ref={viewport} data-picking={picking ? "" : undefined}>
    <div className="board" ref={board} hidden />
    <div className="overlay" ref={overlay} />
    {/* The controller shows it for Hand and a held Space (canvas-hand-tool design '방식'); React never changes it. */}
    <div className="drag-layer" ref={dragLayer} hidden />
    {/* The agent notice comes first, the canvas notices stack under it (design §2 '겹침 순서', 'Esc와 포커스'). */}
    <CanvasAgent {...agent}>
      {state.error && <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text">{state.error}</span></div>}
      {state.unlisted && <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text">This page is not a listed canvas. Choose a canvas from the Sidebar.</span></div>}
    </CanvasAgent>
    {(state.status || problemMessage) && <div className="canvas-status" role="status">
      {problemMessage ? <p>{problemMessage}</p> : state.status === "loading" ? <p><span className="doan-spinner" aria-hidden="true" />Loading</p>
        : state.status === "failed" ? <div><b>Couldn’t load the canvas</b><br />Run doan check in a terminal<br /><br /><button className="doan-button" data-ui-variant="panel" data-ui-size="sm" onClick={() => command("reload")}>Reload</button></div>
        : state.status === "noWidth" ? <p><b>Could not read a valid board width.</b>{state.message.slice("Could not read a valid board width.".length)}</p>
        : <p>{state.message}</p>}
    </div>}
    {/* Picking is a mode the person turned on, so its hint sits by the tools, out of the agent notices' column: their
        coming and going never moves it (DESIGN 'Terminal work in another worktree'). The composer pick button's glyph leads it. */}
    <div className="doan-canvas-bottom">
      {picking && <div className="doan-agent doan-picking" role="status"><Crosshair className="doan-picking-icon" aria-hidden="true" /><span className="doan-agent-text">Click a frame or an element, or Shift-click a spot</span>
        <span className="doan-kbd" data-ui-variant="on-prominent" aria-hidden="true">Esc</span><span className="sr-only">Press Escape to cancel</span></div>}
      <CanvasTools tool={tool} picking={picking} onTool={onTool} picker={picker} exporter={exporter} />
    </div>
    </section>
  </div>;
}
