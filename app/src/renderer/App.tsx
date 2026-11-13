import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ShellSidebar } from "./ShellSidebar";
import { useBuddySelection } from "./buddySelection";
import { useBuddyIntroLock } from "./buddyIntroLock";
import type { BuddyPaint } from "./buddyPaint";
import type { BuddyId } from "./buddies";
import { commitVisit, emptyHistory, fallbackWorktree, historyTarget, loadedProjectRow, projectExpanded, projectsTab, reconcileProjects, selectProjectRoot, shownFolders, type Visit } from "./shellNavigation";
import { groupToOpen, openGroup, toggleGroup, type GroupId, type ShownCanvas } from "./sidebarGroups";
import { canvasLabel, moveExpanded } from "./canvasTree";
import type { Selection } from "../formats/types";
import type { CanvasRow, FolderEntry, ReadStateProblem } from "../main/view";
import { projectKeepsLocal } from "../main/storage";
import type { WorkItem } from "../main/workState";
import type { ConversationWork } from "../main/conversationWork";
import type { CanvasFrameRect } from "./canvasMessage";
import type { TrashPlanReply, TrashReply } from "../main/canvasTrash";
import type { ExportReply } from "../main/canvasExport";
import type { AttachmentResult } from "../main/attachments";
import { canvasExportReason, trashBlock } from "./canvasRowMenu";
import { canvasStem, exportProgress, exportToast, trashToast } from "./canvasRowMessages";
import { CanvasTrashDialog, trashDialogView } from "./CanvasTrashDialog";
import { ConversationDeleteDialog, unsentDraft, type DeleteTarget } from "./ConversationDeleteDialog";
import { deleteAvailability, deleteDialogView, deleteRefusalText, quoted } from "./conversationDelete";
import { focusFieldEnd } from "./chipField";
import { draftKey, EMPTY_DRAFT } from "./dockedRules";
import type { OpenAsk, OpenLinkResult, OpenResult } from "../main/deepLinks";
import type { ConversationHandoffNotice, HandoffNotice } from "../main/conversation/handoff";
import type { MenuCommand, ViewCommand } from "../main/index";
import { useControlFocusRecovery } from "./canvasControlFocus";
import { useVisibleClock } from "./visibleClock";
import { CanvasController, CanvasViewStore, canvasViewFields, initialCanvasState, routeCanvasPublish, type CanvasState, type CanvasWorkTarget, type PickResult } from "./CanvasController";
import { CanvasHeader } from "./CanvasHeader";
import { CanvasTools, type CaptureTool, type ExportTool, type PickerTool, type PlayTool } from "./CanvasTools";
import { canvasPlayability, playRequest } from "./prototypePlay";
import { prototypeMainCalls } from "./prototype/mainCalls";
import { PrototypeClosedFocus } from "./PrototypeClosedFocus";
import type { PlayRequest } from "../main/prototype/ipc";
import { dockedBuddy } from "./dockedBuddyShell";
import { AlertIcon } from "./AlertIcon";
import { noticeToast } from "./selection";
import { CanvasAgent } from "./CanvasAgent";
import { workingCanvas, type WorkingCanvas } from "./agentIndicator";
import { projectNames } from "./projectRow";
import { ArrowLeft, ArrowRight, Crosshair, Plus, Scan, Settings, LayoutGrid, MessageCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Home } from "./Home";
import { ProblemOverlay } from "./ProblemOverlay";
import { problemView, resolvedFocus, workspaceBody, type ProblemKind, type ShownOverlay } from "./problemView";
import { LOADING_DELAY_MS } from "./ConversationThread";
import { ProjectSetupDialog } from "./ProjectSetupDialog";
import { ProjectSettingsPage } from "./ProjectSettingsPage";
import { useToast } from "./Toast";
import { StarPrompt } from "./StarPrompt";
import { AddProjectsPage, type AddPageReport } from "./AddProjectsPage";
import { addPageReturn, pageEnter, pageEscape, projectSettingsReentry, workspaceRemoved, type AddPageEvent, type AddPageOrigin, type PageName, type ShellScreen } from "./addProjectsNav";
import type { FolderFocus } from "../main/shell";
import type { RowAction } from "./homeCards";
import { groupProjects } from "./homeCards";
import { CanvasConversations } from "./RightPanel";
import { CanvasRun, type CanvasTarget } from "./canvasRun";
import { CanvasConversation, CanvasConversationTitle, canvasConversationTitle, composerFixed, settleChips } from "./CanvasConversationPanel";
import { captureAvailability } from "./canvasCapture";
import { canvasUnlistedText, DUPLICATE_CANVAS_TEXT } from "./canvasConversation";
import { openButtonBadge, panelOpenFor, type OpenBadge, type PanelArrival, type PanelFocus, type PanelTrigger } from "./rightPanelOpen";
import { HANDOFF_WAIT_MS, handoffArrival, handoffGoneText, handoffMultiStep, handoffToastText, type HandoffScreen } from "./handoffView";
import { PICKER_UNAVAILABLE, pickerAvailability, type CanvasLoad, type Rect } from "./canvasPicker";
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
import { AgentUsageButton } from "./AgentUsageButton";
import { UpdateHeaderButton } from "./UpdateHeaderButton";
import type { CanvasPress } from "./ComposerParts";
import { BuddyIntro, Wizard } from "./Onboarding";
import { isMainCheckout } from "./projectStep";
import { ProjectOverview } from "./ProjectOverview";
import { useThumbnails } from "./thumbnails";
import { canvasConversationRows } from "./canvasConversationRows";
import type { CanvasList } from "./CanvasConversationList";
import { QuickOpen } from "./QuickOpenDialog";
import { missingCanvasMessage, openLinkRefusal, removedCanvasMessage, sameShownConversation, unavailableCanvasMessage, type ConversationLists, type SearchResult, type ShownConversation } from "./quickOpen";
import { blockedLinkMessage, decideOpen, type OpenPage } from "./openDecision";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import { withoutRoots, type HomeMemory, type UiState, type ShellProject } from "../restore/uiState";
import { emptyComposer } from "./HomeComposerView";
import { attachmentLimit, defaultProject, type AttachmentDraft } from "./homeComposer";
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
import { readStateToast, shownIntent, sidebarSlots } from "./canvasNotice";
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
import { preferenceAfterPick, rememberChoice, rememberFast, rememberPermission, shouldTurnOffFast, withFastChanges, type ComposerChoice } from "./rememberChoice";

// Each command names its handler; one App does not know does nothing.
export function menuCommand(name: MenuCommand, to: { home: () => void; quickOpen: () => void; newConversation: () => void; pickFromCanvas: () => void; toggleSidebar: () => void }): void {
  if (name === "home") to.home();
  else if (name === "toggleSidebar") to.toggleSidebar();
  else if (name === "newConversation") to.newConversation();
  else if (name === "pickFromCanvas") to.pickFromCanvas();
  else if (name === "quickOpen") to.quickOpen();
}

// A focus move that waits (a pick's end) carries the intent it started with
// (POSTMORTEM 2026-10-23 R-L): it holds while focus stays where the wait left it, and ends for good the moment
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

// The start's ui-state read under what the run wrote before it: a root the run set, cleared (New) or
// removed keeps the run's word, so a late read never brings back a cleared memory.
export function mergeConversationMemory(saved: Readonly<Record<string, string>> | undefined, current: Readonly<Record<string, string>>, touched: ReadonlySet<string>): Record<string, string> {
  return { ...Object.fromEntries(Object.entries(saved ?? {}).filter(([root]) => !touched.has(root))), ...current };
}

// First run's project handoff puts focus in the Home composer, ahead of the focus held before the wizard (§4.9).
export function wizardCloseFocus(root: string | null): "composer" | "previous" { return root ? "composer" : "previous"; }

// A reply chip whose canvas cannot be opened (draft frame `toasts`). The canvas is
// named by the link's id, since no row names it; the project by its sidebar name. A list still being read gets the
// chip's own copy, which has no Open to try again; a project problem keeps Quick Open's.
export function replyChipRefusal(target: "missing" | "duplicate" | "unavailable", canvas: string, project: string, entry: FolderEntry | undefined): string {
  if (target === "missing") return `Couldn’t open ${canvas}. The canvas isn’t in ${project}.`;
  if (target === "duplicate") return `Couldn’t open ${canvas}. More than one canvas in ${project} uses this ID. Run doan check in a terminal to find them.`;
  return entry?.kind === "loading" ? "Project is still being read. Try again shortly." : unavailableCanvasMessage(entry, canvas);
}

// A Quick Open conversation that can no longer be opened (draft frame `open-failed`): the title quoted as the delete
// toasts quote it, then the reply chip's sentences for a canvas that is gone or whose id is shared.
export function conversationOpenRefusal(cause: "deleted" | "missing" | "duplicate", title: string, project: string): string {
  const name = quoted(title) ?? "this conversation";
  return cause === "deleted" ? `Couldn’t open ${name}. It was deleted.` : replyChipRefusal(cause, name, project, undefined);
}

export function validHistoryVisit(entries: readonly FolderEntry[], visit: Visit): boolean {
  const entry = entries.find(entry => entry.path === visit.root);
  return !!entry && entry.kind !== "notFound" && (entry.kind !== "list" || !visit.canvas || entry.canvases.some(row => row.path === visit.canvas));
}

// paint: the renderer entry's first-paint buddy and how to apply another; without it (tests) nothing is painted.
export function App({ paint }: { paint?: BuddyPaint } = {}) {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace" | "addProjects" | "settings" | "projectSettings">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  // The canvas the Move to Trash dialog asks about and main's plan for it (null until main answers);
  // `seq` drops a closed dialog's late plan. Set through `changeTrashing`, so a reply that lands before the next render
  // sees the dialog as it is.
  const [trashing, setTrashing] = useState<{ root: string; row: CanvasRow; plan: TrashPlanReply | null; seq: number } | null>(null);
  const trashingRef = useRef(trashing);
  const changeTrashing = (next: typeof trashing) => { trashingRef.current = next; setTrashing(next); };
  const trashSeq = useRef(0);
  // The conversation a title menu's Delete asks about, and whether its request is out. Set through
  // `changeDeleting`, so the reply sees the dialog as it is. `afterDelete` is where focus goes once the conversation
  // was deleted, instead of the Delete's trigger: the shown conversation's composer (`field`), or the Canvas
  // conversations row or title the list chose.
  const [deletingConversation, setDeletingConversation] = useState<{ target: DeleteTarget; pending: boolean } | null>(null);
  const deletingRef = useRef(deletingConversation);
  const changeDeleting = (next: typeof deletingConversation) => { deletingRef.current = next; setDeletingConversation(next); };
  const afterDelete = useRef<{ selector: string; field: boolean; fallback?: string } | null>(null);
  const quittingRef = useRef(false);
  // The canvases whose `doan export` runs (`root\npath`): from main's running event, sent once the save panel closed on
  // a file, to the export's reply. The progress toast waits a second from that event.
  const [exporting, setExporting] = useState<ReadonlySet<string>>(new Set());
  const exportTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // The Add Projects page: where it returns to, the page's own report, and a
  // counter File > Add Project… raises to run its Choose folder. Mounted anew (`seq`) on each opening.
  const [page, setPage] = useState<{ origin: AddPageOrigin; seq: number; chooseSeq: number } & AddPageReport>({ origin: { screen: "home" }, seq: 0, chooseSeq: 0, locked: false, choose: true });
  const pageRef = useRef(page); pageRef.current = page;
  // The Settings page: its category, what it was asked to focus on arrival, and
  // whether a category holds a confirmation or a write. It shares the Add Projects page's origin, so moving between
  // the two pages keeps where both return to.
  const [settings, setSettingsState] = useState<{ section: SettingsSection; arrival: SettingsArrival | null; locked: boolean }>({ section: "agents", arrival: null, locked: false });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const setSettings = (next: typeof settings) => { settingsRef.current = next; setSettingsState(next); };
  const settingsQueue = useRef(new SettingsTargetQueue());
  const arrivals = useRef(0);
  // The Project Settings page: the worktree it shows, a key that changes only when
  // another worktree is picked (a reroot is followed inside the page, which keeps its config session), its title-focus
  // arrival and whether it holds a picker, a confirmation or a write. It shares the other pages' origin.
  const [projectSettings, setProjectSettingsState] = useState<{ root: string; key: number; arrival: { seq: number } | null; locked: boolean }>({ root: "", key: 0, arrival: null, locked: false });
  const projectSettingsRef = useRef(projectSettings); projectSettingsRef.current = projectSettings;
  const setProjectSettings = (next: typeof projectSettings) => { projectSettingsRef.current = next; setProjectSettingsState(next); };
  // A category the person or a target chose wins over the one ui-state read later.
  const sectionChosen = useRef(false);
  // MCP Connectors exists while Claude Code or Codex is signed in; null until agent-auth is read.
  const [mcpShown, setMcpShown] = useState<boolean | null>(null);
  const mcpShownRef = useRef(mcpShown); mcpShownRef.current = mcpShown;
  // Read once on the page when MCP Connectors turned into Agents while shown; cleared by the next move.
  const [settingsAnnouncement, setSettingsAnnouncement] = useState<string | undefined>(undefined);
  const beforeModal = useRef<HTMLElement | null>(null);
  const focusAfterModal = useRef(false);
  // A focused toast or star card that goes hands focus back to where it came from, or to the screen.
  const restoreFloatingFocus = (previous: HTMLElement | null) => {
    if (document.activeElement === document.body || !document.activeElement?.isConnected) focusCurrent(previous);
  };
  const toast = useToast(restoreFloatingFocus);
  const workspaceFocus = useRef<HTMLElement | null>(null);
  // Set by the Overview's branch chip menu; the workspace focus effect then focuses the new Overview's chip.
  const chipFocus = useRef(false);
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  // `entries` is the list as shown: hidden auto-registered worktrees are left out everywhere (shownFolders). Only the
  // launch restore reads main's whole list, so it can wait for a saved worktree that is still being read.
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [allEntries, setAllEntries] = useState<FolderEntry[]>([]);
  // The group's selection before it moved to an auto-registered worktree, by that worktree, in memory.
  const beforeAuto = useRef(new Map<string, string>());
  const [state, setState] = useState(initialCanvasState);
  // The zoom and current frame go to the header alone: a pan or zoom publishes them many times a second, and an App
  // render for each cost most of the page's script while moving. So `state.zoom`, `state.scale` and
  // `state.currentFrame` can be older than the view; read them from `canvasView`.
  const canvasView = useRef<CanvasViewStore>(null as unknown as CanvasViewStore);
  if (!(canvasView.current instanceof CanvasViewStore)) canvasView.current = new CanvasViewStore(canvasViewFields(state));
  const handedCanvas = useRef(state);
  const canvasChanged = (next: CanvasState) => {
    const handed = routeCanvasPublish(handedCanvas.current, next, canvasView.current);
    if (handed) { handedCanvas.current = handed; setState(handed); }
  };
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const dragLayer = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  // Play prototype: the toolbar's button (focus comes back to it) and the request the bubble's Play sends, as of the
  // last render.
  const playButton = useRef<HTMLButtonElement | null>(null);
  const playNext = useRef<PlayRequest | null>(null);
  const [reroot, setReroot] = useState<(FolderFocus & { seq: number }) | null>(null);
  // `rerootSeq` counts the re-root focuses seen; Set Up keeps the count at its start so a re-root from before it is not
  // taken for its own. `locateFrom` is the root a Locate is waiting on: main reports that move as a re-root focus too,
  // but only the workspace Locate (which opens the new root itself) may move `loadedRoot` along with it.
  const rerootSeq = useRef(0), setupSeq = useRef(0), locateFrom = useRef<string | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const beforeWizard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const [quickOpen, setQuickOpen] = useState(false);
  // Counts Quick Open picks of a project conversation that should focus the Overview's composer field.
  const [overviewComposerFocus, setOverviewComposerFocus] = useState(0);
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
  // Home: the composer's run memory, ui-state's Home memory (null until read), the first-run handoff and
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
      // Already on that Overview: only the main conversation changes.
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
  // The Overview's main conversation and its composer's lists, for the run; the root it shows, as
  // committed.
  const shownOverviewRef = useRef<string | null>(null);
  // conversationByRoot is written from the start; the Overview reads it only once ui-state was read (memoryRead).
  const conversationByRoot = useRef<Record<string, string>>({});
  // The initial ui-state read has settled (a failed read counts). No save is sent before it: main replaces the whole
  // file on each save, so an early save would drop every remembered field it does not carry (RBR4).
  const memoryRead = useRef(false);
  // Fast changes (switches and auto-offs) made before that read, laid over the read map per provider when it lands.
  const fastBeforeRead = useRef(new Map<Provider, boolean>());
  // One clock for the person's Fast switches and the auto-offs seen live, so an auto-off whose provider is learned
  // later never undoes a switch the person made after it was seen.
  const fastClock = useRef(0);
  const fastSwitchedAt = useRef(new Map<Provider, number>());
  // Live auto-offs for conversations no list names yet, by conversation, with when they were seen.
  const fastOffPending = useRef(new Map<string, number>());
  // Roots the run wrote, cleared or removed before that read.
  const memoryTouched = useRef(new Set<string>());
  const [memoryTick, setMemoryTick] = useState(0);
  // The canvas page's conversation panel: open state and width on this device. A change the
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
  // The canvas page's conversation panel; it shares the Overview's threads and drafts.
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
  // Where focus goes once the panel shows what an entry asked for; a new seq per entry.
  // The seq only grows: the panel applies an arrival once by its seq, so a later entry must never reuse one.
  const [arrival, setArrival] = useState<PanelArrival | null>(null);
  const panelArrivals = useRef(0);
  const support = useRef<DockedSupport | null>(null);
  if (!support.current) support.current = new DockedSupport(() => setRunTick(tick => tick + 1));
  const loadedRootRef = useRef(loadedRoot); loadedRootRef.current = loadedRoot;
  const openRef = useRef(state.open); openRef.current = state.open;
  // Problem overlay (ARCHITECTURE §7): set by the render below, read by effects and listeners declared before it.
  // Whether a problem or reading overlay shows, whether it is a problem scene, and the body under it.
  const overlaidRef = useRef(false), sceneRef = useRef(false);
  const bodyRef = useRef<"overview" | "canvas" | null>(null);
  // Whether an overlay showed at the last commit, so its going can hand focus on.
  const overlayCommitted = useRef(false);
  // Counts the person's moves into a workspace (completeNavigation): a scene they arrive at takes focus.
  const [arrivalSeq, setArrivalSeq] = useState(0);
  // A scene that should take focus while a modal is open takes it once the modal closes (POSTMORTEM 2026-10-24).
  const headingPending = useRef(false);
  function focusHeading() {
    if (live.current.modal || document.querySelector("dialog[open]")) { headingPending.current = true; return; }
    headingPending.current = false;
    document.querySelector<HTMLElement>(".workspace .problem-overlay h2")?.focus();
  }
  // Where focus goes once the overlay is gone: the Overview's composer or the canvas area, else the screen's usual
  // place (PRODUCT §5 item 3 'Problem states'), never the page body.
  function focusResolved() {
    if (live.current.modal || document.querySelector("dialog[open]")) return;
    const to = resolvedFocus(bodyRef.current === "canvas" ? "canvas" : "overview");
    const target = document.querySelector<HTMLElement>(to === "composer" ? ".workspace .ov-main .composer-input" : ".workspace .doan-canvas-panel .area");
    if (target?.isConnected && !target.closest("[inert]")) target.focus();
    else focusCurrent();
  }
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
    const instance = new CanvasController(viewport.current, board.current, overlay.current, canvasChanged, sendSelection, selector => window.doan.inspect(selector), dragLayer.current, () => window.doan.pointer());
    controller.current = instance;
    const stopFolders = window.doan.onFolders((all, focus) => {
      const next = shownFolders(all), before = entriesRef.current;
      if (focus) {
        const located = locateFrom.current === focus.from;
        if (!located) setLoadedRoot(root => root === focus.from ? focus.root : root);
        // A page's origin on the moved root follows it, also when the page's sidebar moved a root other than the page's
        // own, or leaving would find the origin gone and go Home (PRODUCT §5 item 0: leaving returns to where it came from).
        const origin = pageRef.current.origin;
        if (origin.screen === "workspace" && origin.root === focus.from) {
          const next = { ...pageRef.current, origin: { screen: "workspace" as const, root: focus.root } };
          pageRef.current = next; setPage(next);
        }
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
    instance.onCapture(rect => live.current.captured(rect));
    instance.linkedCanvas = root => live.current.completeNavigation(root);
    // The floating tools cover the area's bottom: the size bubble stays above them, 8px clear (sizeBubble.ts).
    instance.bubbleRoom = () => {
      const tools = viewport.current?.querySelector<HTMLElement>(".doan-canvas-bottom");
      return tools ? { top: 0, bottom: tools.offsetTop - 8 } : null;
    };
    instance.bubblePlay = {
      onPlay: () => sendPlay(playNext.current),
      // The bubble went while it had focus: the toolbar's Play is the visible control for the same action.
      onFocusLost: () => { (playButton.current?.isConnected ? playButton.current : viewport.current)?.focus({ preventScroll: true }); },
    };
    // The overlay covers the canvas, so its view commands do nothing meanwhile (ARCHITECTURE §7 'Problem overlay').
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace" && !overlaidRef.current) instance.command(name); });
    return () => { navigationIntent.current++; stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  // Wall-clock text ("3m", "now", a time of day) is computed while rendering, and nothing re-renders App at rest.
  const clock = useVisibleClock(1000);
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
  // confirmation or a write, every move away is ignored here, in one place:
  // marking the controls alone would leak through toasts and keyboard activation.
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
      // A problem scene takes focus first: what it covers is inert (PRODUCT §5 item 3 'Problem states'); the scene's
      // own effect gives it to the heading.
      if (sceneRef.current) { homeRun.current.takeFocus(); chipFocus.current = false; return; }
      // A Home send lands in the Overview's composer field.
      if (homeRun.current.takeFocus() === "composer") { const field = document.querySelector<HTMLElement>(".workspace .ov-main .composer-input"); if (field) { field.focus(); return; } }
      // A worktree picked from the Overview's branch chip lands on the new Overview's chip.
      if (chipFocus.current) { chipFocus.current = false; const chip = document.querySelector<HTMLElement>(".workspace .ov-main .wt-chip"); if (chip) { chip.focus(); return; } }
      // An entry to a waiting request focused its card in the same commit; child effects run first, so this default
      // would otherwise take the focus to the sidebar row right after.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.isConnected && active.closest(".workspace .conversation-thread")) return;
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
    // A root still in a problem enters its Overview, where the overlay shows it (POSTMORTEM 2026-11-03 'Locate on the Project Settings page…').
    else controller.current?.openWorkspace(root, setLoadedRoot, false, undefined, true);
    setLocating(null);
  }, [entries, locating]);
  useEffect(() => {
    let active = true;
    void window.doan.readUiState().then(state => state, () => null).then(state => {
      // Main replaces the whole state on each save, so Home's memory is kept even when the restore was cancelled.
      // A send that finished before this read keeps its newer choices over the saved ones.
      if (active) setHomeMemory(previous => {
        const fast = withFastChanges(state?.home?.fast, fastBeforeRead.current);
        return { ...state?.home, ...previous, ...(fast ? { fast } : {}) };
      });
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
    workspaceFocus.current = null; setLoadedRoot(root); setScreen("workspace"); setArrivalSeq(seq => seq + 1);
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
  // opens its canvas.
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
  // A sidebar canvas row: its slot decides whether the panel unfolds. A row that needs an
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
  // An entry to one of a canvas's conversations: the canvas opens with that
  // conversation asked for in its panel, and the panel unfolds when the trigger opens it.
  // `slot` is the canvas row's sidebar slot, which a sidebar row's trigger reads.
  function openCanvasConversation(root: string, row: CanvasRow, conversationId: string, trigger: PanelTrigger, slot: Slot["kind"] | null = null) {
    if (locked()) return;
    const target: CanvasTarget = { root, canvas: row.id ? { path: row.path, id: row.id } : { path: row.path } };
    const open = panelOpenFor(trigger, slot);
    const scroll: ScrollTo | null = open.open === true && open.focus === "permission" ? "permission" : null;
    canvasRun.current!.request(target, conversationId, scroll);
    const reveal = () => { if (open.open === true) revealPanel(open.focus, open.focus === "handoff" ? { root, canvas: target.canvas, conversationId } : undefined); };
    const shown = openRef.current;
    if (currentScreen.current === "workspace" && shown?.folder === root && shown.canvas === row.path && shownOverviewRef.current === null) reveal();
    else live.current.openShellCanvas(root, row, undefined, reveal);
  }
  // An auto-registered worktree left the list as shown (its folder vanished, or it can no longer be read) without any
  // move of the person's. Its remembered canvas and previous selection go. When it was on screen, its
  // canvas, Overview or Project Settings page moves to the same place in the worktree selected before it, else the
  // group's main checkout, even in a problem state; no toast. A page opened from its workspace keeps
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
      // remembered canvas or Overview, rather than finding the origin gone and going Home.
      if (fromPage) { const next = { ...pageRef.current, origin: { screen: "workspace" as const, root: to.root } }; pageRef.current = next; setPage(next); }
      if (settingsPage) setProjectSettings({ root: to.root, key: projectSettingsRef.current.key + 1, arrival: { seq: ++arrivals.current }, locked: false });
      if (!workspace) continue;
      const entry = after.find(entry => entry.path === to.root);
      const row = entry?.kind === "list" && to.canvas ? entry.canvases.find(row => row.path === to.canvas) : undefined;
      if (row) openShellCanvas(to.root, row);
      else if (entry?.kind === "list") showShellOverview(to.root);
      // A worktree that is not a list takes the workspace as it is: its Overview under the overlay (workspaceBody).
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
  const names = projectNames(entries.map(entry => entry.path));
  // Home conversations are decided by HomeRun; App wires its navigation, toasts and dialogs.
  const projectLabel = (root: string) => cards.find(card => card.rows.some(row => row.path === root))?.name ?? names.get(root) ?? root;
  const projectLabelRef = useRef(projectLabel); projectLabelRef.current = projectLabel;
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
    // A root in a problem (or being read) enters its Overview, where the overlay shows it; canvases open only on a list
    // (PRODUCT §5 item 3 'Problem states'). A deleted root never gets here (validHistoryVisit).
    if (entry?.kind !== "list") { showShellOverview(visit.root, cursor); return; }
    const row = entry.canvases.find(row => row.path === visit.canvas);
    if (visit.canvas && row) openShellCanvas(visit.root, row, cursor);
    else showShellOverview(visit.root, cursor);
  };
  // Opens a canvas named by an explicit entry (the board's other worktree notice), or says why it cannot.
  const openNotice = (notice: { root: string; path: string }) => {
    const listed = entriesRef.current.find(entry => entry.path === notice.root);
    const row = listed?.kind === "list" ? listed.canvases.find(row => row.path === notice.path) : undefined;
    if (row) openShellCanvas(notice.root, row);
    else toast.show(unavailableCanvasMessage(listed, notice.path));
  };
  const toggleProject = async (key: string) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    // A locked page ignores only the move to a workspace: the row still unfolds another project, and
    // never folds one, as unlocked; the chevron folds. The loaded project is already unfolded or folded by hand.
    if (locked()) {
      if (!loadedRoot || !group.rows.some(row => row.path === loadedRoot))
        setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path), expanded: true } }));
      return;
    }
    const loaded = loadedRoot !== null && group.rows.some(row => row.path === loadedRoot);
    // Home and the Add Projects page show the sidebar without a current project: from Home its row opens the Overview,
    // from the page it goes back to the loaded workspace.
    if (loaded) {
      if (shellRef.current[key]?.collapsed) setShellProjects(previous => ({ ...previous, [key]: { ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path), expanded: true, collapsed: false } }));
      const move = loadedProjectRow({ screen: currentScreen.current, overviewShown: shownOverviewRef.current === loadedRoot });
      if (move === "enter") enter(loadedRoot);
      // Over the covered Overview a changed conversation would not show: the row takes focus to the scene (PRODUCT §5 item 1).
      else if (move === "slot" && sceneRef.current) focusHeading();
      else if (move === "slot") askSlot(loadedRoot);
      else showShellOverview(loadedRoot, undefined, () => askSlot(loadedRoot));
      return;
    }
    cancelRestore(); controller.current?.cancelWorkspaceOpen();
    const memory = { ...(shellRef.current[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) };
    const intent = navigationIntent.current, signature = groupSignature;
    const activity = await window.doan.readShellActivity({ roots: memory.roots }).catch(() => null);
    const groups = groupProjects(entriesRef.current, new Map(entriesRef.current.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
    if (intent !== navigationIntent.current || signature !== JSON.stringify(groups.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })))) return;
    const root = selectProjectRoot(memory, activity ?? [], loadedRoot); if (!root) return;
    // Another project's row opens its Overview from anywhere, never its last canvas, and never folds it: only its chevron
    // does (user decisions; project-row-disclosure draft). A problem root's Overview shows under its overlay.
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
  // A locked page keeps the disclosure, as project expansion does.
  const toggleShellGroup = (key: string, id: GroupId) => {
    const group = cards.find(card => card.key === key); if (!group) return;
    setShellProjects(previous => ({ ...previous, [key]: withGroups({ ...(previous[key] ?? { expanded: false }), roots: group.rows.map(row => row.path) }, groups => toggleGroup(groups, id)) }));
  };
  // Whatever opened it, a newly shown canvas opens its group; a group closed while it stays shown stays closed.
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


  // The existing-user buddy screen holds first run's lock while it is open.
  const buddyIntro = useBuddyIntroLock();
  // The buddy screen closes over the screen restored at launch; focus goes where finishing first run puts it, the
  // composer, when that screen is Home, else to the restored screen's own place.
  const introClosed = useRef(false);
  const closeBuddyIntro = () => { introClosed.current = true; buddyIntro.close(); };
  useEffect(() => {
    if (buddyIntro.open || !introClosed.current) return;
    introClosed.current = false;
    if (currentScreen.current === "home") document.querySelector<HTMLElement>(".home-shell .composer-input")?.focus();
    else focusCurrent();
  }, [buddyIntro.open]);
  const modal = wizard !== null || buddyIntro.open || setup !== null || quickOpen || homeRun.current.removing !== null || trashing !== null || deletingConversation !== null;
  // A locked Project Settings page holds the toast too: its Share confirmation makes the toast inert while the page
  // itself is not modal (POSTMORTEM 2026-10-25 'Native hiding bypassed
  // renderer-only lifetime checks').
  const toastHeld = modal || (screen === "projectSettings" && projectSettings.locked);
  useLayoutEffect(() => { toast.setModal(toastHeld); }, [toastHeld]);
  const live = useRef({ home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: (root: string) => root, askConversation, openConversationCanvas, openCanvasConversation, newConversation: () => {}, pickFromCanvas: () => {}, toggleSidebar: () => {}, pickEnded: (_result: PickResult) => {}, captured: (_rect: Rect): (() => Promise<unknown>) | null => null, followMode: (_provider: Provider, _mode: PermissionModeId) => {}, openLink: (_result: OpenLinkResult) => {}, openCanvasRequest: (_request: OpenAsk) => {}, conversationHandoff: (_notice: ConversationHandoffNotice) => {}, handoffCheck: () => {} });
  live.current = { home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: root => projectLabelRef.current(root), askConversation, openConversationCanvas, openCanvasConversation, newConversation, pickFromCanvas, toggleSidebar, pickEnded, captured, followMode, openLink, openCanvasRequest, conversationHandoff, handoffCheck };
  const rememberFocus = () => { beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const modalClosed = () => { focusAfterModal.current = true; };
  useEffect(() => {
    if (modal || !focusAfterModal.current) return;
    focusAfterModal.current = false;
    const after = afterDelete.current;
    const field = after && (document.querySelector<HTMLElement>(after.selector) ?? (after.fallback ? document.querySelector<HTMLElement>(after.fallback) : null));
    afterDelete.current = null;
    if (field) { if (after.field) focusFieldEnd(field); else field.focus(); return; }
    const previous = beforeModal.current;
    // A Set Up (or other action) opened from the overlay that took the overlay with it lands where the overlay's going
    // sends focus (PRODUCT §5 item 3 'Problem states'), not on the screen's fallback.
    if (previous && !previous.isConnected && previous.closest(".problem-overlay")) { focusResolved(); return; }
    focusCurrent(previous);
  }, [modal, entries]);
  // A path the removal confirmation names left the list (a reroot, a removal elsewhere): it closes, since it no longer
  // names what would go and main refuses a removal of an unlisted path.
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
  // The covered parts App does not draw itself are inert under the overlay; the folded conversation column keeps its own.
  useLayoutEffect(() => {
    for (const node of document.querySelectorAll<HTMLElement>(".workspace > :is(.ov-main, .doan-overview-handle, .doan-conv-column)"))
      node.toggleAttribute("inert", overlaidRef.current || (node.matches(".doan-conv-column") && !rightPanelRef.current.open));
  });
  // The overlay just went with focus in it (focus fell to the page): it goes to the uncovered body instead (PRODUCT §5 item 3
  // 'Problem states'). After the inert above comes off, or the composer still refuses focus; ahead of the recovery focus below,
  // which would take it to the sidebar.
  useLayoutEffect(() => {
    const was = overlayCommitted.current;
    overlayCommitted.current = overlaidRef.current;
    if (!was || overlaidRef.current || currentScreen.current !== "workspace") return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    recoveryFocus.current = null;
    focusResolved();
  });
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
  // Every way into Settings — the header tab, Settings… (⌘,), Home's agent picker, a sign-in toast — comes here.
  // While a category holds a confirmation or a write, the latest target waits for it
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
  // A category picked in the sidebar keeps focus on its row, so it brings no arrival.
  const selectSection = (section: SettingsSection) => {
    if (currentScreen.current !== "settings" || locked()) return;
    sectionChosen.current = true;
    setSettingsAnnouncement(undefined);
    setSettings({ ...settingsRef.current, section, arrival: null });
  };
  // Project Settings from a project menu (the sidebar's or the Overview's recovery menu). On the page, picking another
  // worktree switches to it with a new page and the same origin, and picking the same one focuses its title;
  // a locked page takes neither.
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
  // A notification's click, after main has shown the window.
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
  // `doan open` requests: main sends them only once links are ready, and each is answered by its id.
  useEffect(() => window.doan.onOpenRequest(request => live.current.openCanvasRequest(request)), []);
  // A started handoff, and every later render's check of the one still waiting for its read.
  useEffect(() => window.doan.onConversationHandoff(notice => live.current.conversationHandoff(notice)), []);
  useEffect(() => { live.current.handoffCheck(); });
  // Ready once the launch restore is applied (or cancelled) and the first folders are in, so a link's canvas opens over
  // the restored screen (ARCHITECTURE §7 'Deep links').
  const linksReady = useRef(false);
  useEffect(() => {
    if (linksReady.current || restore !== "done" || !foldersSeen) return;
    linksReady.current = true;
    void window.doan.openLinksReady().catch(console.error);
  }, [restore, foldersSeen]);
  // The canvases terminal sessions work on: subscribed first, then read, and a
  // change that lands before the read answers is newer than it.
  const [work, setWork] = useState<readonly WorkItem[]>([]);
  useEffect(() => {
    let current = true, changed = false;
    const stop = window.doan.onWorkChanged(items => { changed = true; setWork(items); });
    void window.doan.getWork().then(items => { if (current && !changed) setWork(items); }).catch(console.error);
    return () => { current = false; stop(); };
  }, []);
  // App conversations' `doan work update` content, read the same way.
  const [conversationWork, setConversationWork] = useState<readonly ConversationWork[]>([]);
  useEffect(() => {
    let current = true, changed = false;
    const stop = window.doan.onConversationWorkChanged(items => { changed = true; setConversationWork(items); });
    void window.doan.getConversationWork().then(items => { if (current && !changed) setConversationWork(items); }).catch(console.error);
    return () => { current = false; stop(); };
  }, []);
  // The renderer's one sign-in controller tells a sign-in that ended away from Agents in the shared toast, and hears
  // when the window comes back to the front.
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
  // The buddy shows the latest pick at once, else the snapshot; every snapshot re-applies it, so a reloaded renderer
  // follows what is saved rather than the query the window opened with.
  const buddySelection = useBuddySelection(preferences, savePreferences, paint?.first ?? "doany");
  useLayoutEffect(() => { paint?.apply(buddySelection.shown); }, [paint, preferences, buddySelection.shown]);
  const rememberPick = (choice: ComposerChoice) => {
    if (choice.fast !== undefined) {
      fastSwitchedAt.current.set(choice.provider, ++fastClock.current);
      if (!memoryRead.current) fastBeforeRead.current.set(choice.provider, choice.fast);
    }
    setHomeMemory(previous => rememberChoice(previous, choice));
    const next = preferenceAfterPick(preferences?.preferences.newConversation ?? null, choice);
    if (next) void savePreferences({ newConversation: next });
  };
  // A mode main moved a conversation to after a Claude plan approval: that provider's last mode and a fixed Settings
  // default of the same provider follow it, but the last provider stays.
  function followMode(provider: Provider, mode: PermissionModeId) {
    setHomeMemory(previous => rememberPermission(previous, provider, mode));
    const next = preferenceAfterPick(preferences?.preferences.newConversation ?? null, { provider, model: null, effort: null, permissionMode: mode });
    if (next) void savePreferences({ newConversation: next });
  }
  // Escape leaves a page unless a field or an IME composition holds it, or an overlay closes itself first. A Radix
  // popover (the usage popover) closes on Escape and prevents the default; its role="dialog" content is not one the
  // overlay query finds, so a handled Escape is skipped as CanvasController skips it.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (currentScreen.current !== "addProjects" && currentScreen.current !== "settings" && currentScreen.current !== "projectSettings")) return;
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
  // A running Home conversation is stopped first, and only after the person agrees.
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
  // The dialog asks main for its plan before it can be
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
  // Confirmed: the dialog closes at once and the reply's toast is the only one. The mark set
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
  // A title menu row's Delete asks first. Cancel and Escape return focus to the menu's
  // trigger (`beforeModal`); the row's button is inside the closed menu. A Canvas conversations row's Delete passes
  // itself as the trigger.
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
    const { conversationId, root, title, from } = current.target, target = current.target;
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
            : from === "canvas" && canvasView?.kind === "conversation" && canvasView.conversationId === conversationId;
          overviewRuns.deleted(conversationId); canvasRuns.deleted(conversationId); homeRun.current.deleted(conversationId);
          // The row the list chose can leave too before focus moves (another deletion, a re-read); the title stays, and
          // the deleted row's Delete, where focus would otherwise go back, leaves with its row.
          if (target.from === "canvasList") afterDelete.current = target.after.kind === "row"
            ? { field: false, selector: `.ov-right .cv-row[data-key="${CSS.escape(target.after.key)}"]`, fallback: ".ov-right .rp-head" }
            : { field: false, selector: ".ov-right .rp-head" };
          else if (shown) afterDelete.current = { field: true, selector: from === "overview" ? ".workspace .ov-main .composer-input" : ".doan-conv-panel .composer-input" };
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
  // ARCHITECTURE §7 'Canvas row menu IPC': main shows the save panel, runs the CLI and answers once; the item stays
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
  // The canvas toolbar's Export: the row menu's export on the open canvas. Focus that
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
  // otherwise the toast. settled: once main has answered a Retry or a Locate (the problem overlay's busy press).
  function action(name: RowAction, root: string, notice: (text: string) => void = text => toast.show(text), settled?: () => void) {
    cancelRestore();
    if ((name === "retry" || name === "locate") && document.activeElement instanceof HTMLElement) recoveryFocus.current = { element: document.activeElement, root };
    if (name === "details") {
      const entry = entriesRef.current.find(entry => entry.path === root);
      if (entry?.kind === "error") notice(entry.message);
      else if (entry?.kind === "cliError") notice(entry.reason);
    }
    else if (name === "setUp") { rememberFocus(); setupSeq.current = rerootSeq.current; setSetup(root); }
    else if (name === "remove") void remove([root]);
    else if (name === "showInFinder") void window.doan.revealProject(root).catch(console.error);
    else if (name === "retry") void window.doan.reopenFolder(root).catch(console.error).finally(() => settled?.());
    else if (name === "locate") {
      const workspace = loadedRoot === root && currentScreen.current === "workspace";
      if (workspace) setLocating({ from: root, root: null });
      locateFrom.current = root;
      void window.doan.locateProject(root).then(result => {
        if (result.kind === "refused") notice(result.message);
        if (workspace && result.kind === "located") { setLoadedRoot(result.root); setLocating({ from: root, root: result.root }); }
        else if (workspace) setLocating(null);
      }).catch(error => { if (workspace) setLocating(null); console.error(error); }).finally(() => { if (locateFrom.current === root) locateFrom.current = null; settled?.(); });
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
  // What the workspace shows now, for a pick of the conversation already on screen.
  function shownConversation(): ShownConversation {
    if (currentScreen.current !== "workspace" || overlaidRef.current) return null;
    const root = shownOverviewRef.current;
    if (root) {
      const view = overviewRun.current!.view(root);
      return { kind: "overview", root, conversationId: view.kind === "conversation" ? view.conversationId : null };
    }
    const open = openRef.current;
    if (!open || !rightPanelRef.current.open) return null;
    return { kind: "canvas", root: open.folder, path: open.canvas, conversationId: canvasRun.current!.showing()?.conversationId ?? null };
  }
  // A conversation result opens through HomeRun with the rows Quick Open searched. The one already on screen only takes
  // focus: no move and no visit. One that can no longer be opened goes nowhere and returns false, so Quick Open hands
  // focus back to where it was opened.
  function pickConversation(result: Extract<SearchResult, { kind: "conversation" }>): boolean {
    const target = entries.find(entry => entry.path === result.root);
    const rows = target?.kind === "list" ? target.canvases : [];
    const list = homeRun.current.listState(result.root);
    // The listed phase, the rule askConversation scrolls by, so focus lands on the waiting card or the composer.
    const waiting = Array.isArray(list) && list.some(c => c.conversationId === result.conversationId && c.phase === "waiting");
    if (sameShownConversation(result, shownConversation())) {
      const row = result.canvas && rows.find(row => row.path === result.canvas!.path);
      if (row) openCanvasConversation(result.root, row, result.conversationId, { kind: "notification", permission: waiting });
      else if (waiting) askConversation(result.root, result.conversationId);
      else setOverviewComposerFocus(seq => seq + 1);
      return true;
    }
    const outcome = homeRun.current.openFound(result.root, result.conversationId, rows, waits => { if (!waits) setOverviewComposerFocus(seq => seq + 1); });
    if (outcome === "opened") return true;
    live.current.toast.show(conversationOpenRefusal(outcome, result.title, live.current.projectLabel(result.root)));
    return false;
  }
  // A pick from the Add Projects page goes through openCanvas too.
  function pick(result: SearchResult): boolean | void {
    if (locked()) return;
    cancelRestore();
    setQuickOpen(false);
    if (result.kind === "conversation") return pickConversation(result);
    const target = entries.find(entry => entry.path === result.root);
    const row = target?.kind === "list" ? target.canvases.find(row => row.path === result.path) : undefined;
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.path));
    if (!row) { unavailable(target); return; }
    const frameId = result.kind === "frame" ? result.frameId : undefined;
    const found = (ok: boolean) => { if (!ok) live.current.toast.show("This frame is not in the rendered canvas"); };
    controller.current?.openCanvas(result.root, row, frameId === undefined ? undefined : { frame: frameId }, { unavailable, ...(result.kind === "frame" ? { found, index: result.frameIndex } : {}), opened: () => completeNavigation(result.root) });
  }
  // A doan:// link (ARCHITECTURE §7 'Deep links'): Quick Open's move. A frame moves the view as Quick Open's
  // frame does, without selection; a frame not in the canvas leaves the canvas only, with no toast. A refused link
  // shows one toast. Main checked the root and the list; the renderer's list may still lag, as for any move. A link
  // landing on a locked page or first run goes nowhere. A link or a `doan open` comes only from a person (a click, or a
  // request they asked an agent for), so an open dialog is dismissed first through its own cancel event, the path
  // Escape and Cancel take; one that refuses (it is busy) keeps the move from happening. A blocked link says why, in
  // the modal dialog still open (a running Set Up, first run), the only place not inert, or else in the usual place.
  function openLink(result: OpenLinkResult) {
    if (result.kind !== "navigate") { live.current.toast.show(openLinkRefusal(result)); return; }
    const decision = decideOpen(result, openPage());
    if (decision.kind === "busy") { live.current.toast.showIn(topDialog(), blockedLinkMessage(decision.reason)); return; }
    cancelRestore();
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.canvas));
    if (decision.kind === "canvas_not_found") { unavailable(decision.entry); return; }
    controller.current?.openCanvas(result.root, decision.row, result.frame === undefined ? undefined : { frame: result.frame }, { unavailable, opened: () => completeNavigation(result.root) });
  }
  // A chip in an agent's reply, from the canvas panel or the Overview of `root`.
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
  // A started handoff moves from its source canvas through Quick Open's path, with
  // the panel on the receiving conversation and focus on its card, or shows the toast. A target the renderer's list does
  // not name yet waits for that read up to HANDOFF_WAIT_MS; leaving the source canvas, or any move or panel choice of the
  // person's meanwhile, turns the move into the toast (POSTMORTEM 2026-10-25: an action offered before a read finishes
  // waits for it; 2026-10-26: a later choice of the person's is never replaced). Unlike a link, it never closes a dialog:
  // the person did not ask for this move. Several started handoffs never move: a summary toast, or nothing on the
  // source canvas page, whose lines already show each one.
  interface HandoffWait { notice: HandoffNotice; expired: boolean; timer: ReturnType<typeof setTimeout>; intent: number; revision: number; entry: FolderEntry | undefined }
  const handoffWait = useRef<HandoffWait | null>(null);
  // A toast's Open whose canvas the list did not name yet: it waits the same way, and a later move of the person's drops
  // it. to: the single handoff's target, or a summary's source.
  interface HandoffOpen { root: string; to: { conversationId: string; canvas: Canvas }; expired: boolean; timer: ReturnType<typeof setTimeout>; intent: number; entry: FolderEntry | undefined }
  const handoffOpen = useRef<HandoffOpen | null>(null);
  const handoffWaitFor = (notice: HandoffNotice, entry: FolderEntry | undefined): HandoffWait => {
    const wait: HandoffWait = { notice, expired: false, intent: navigationIntent.current, revision: canvasRun.current!.revision(), entry,
      timer: setTimeout(() => { wait.expired = true; live.current.handoffCheck(); }, HANDOFF_WAIT_MS) };
    return wait;
  };
  function conversationHandoff(notice: ConversationHandoffNotice) {
    const earlier = handoffWait.current;
    if (earlier) { clearTimeout(earlier.timer); handoffWait.current = null; handoffToast(earlier.notice, earlier.notice.target, earlier.entry); }
    if ("targets" in notice) {
      if (handoffMultiStep(handoffScreen(notice, false), notice) === "toast") handoffToast(notice, notice.source, listedRow(notice.root, notice.source.canvas).entry);
      return;
    }
    handoffWait.current = handoffWaitFor(notice, listedRow(notice.root, notice.target.canvas).entry);
    handoffCheck();
  }
  function handoffCheck() {
    // A move's card focus belongs to the receiving canvas: once the person is elsewhere it is dropped, so it never fires
    // on a later visit.
    if (arrival?.handoff && !canvasShown(arrival.handoff.root, arrival.handoff.canvas)) setArrival(null);
    handoffOpenCheck();
    const wait = handoffWait.current;
    if (!wait) return;
    const notice = wait.notice, row = listedRow(notice.root, notice.target.canvas).row;
    const chose = wait.intent !== navigationIntent.current || wait.revision !== canvasRun.current!.revision();
    const step = handoffArrival(handoffScreen(notice, chose), notice, row !== undefined, wait.expired);
    if (step === "wait") return;
    clearTimeout(wait.timer);
    handoffWait.current = null;
    if (step === "move") openCanvasConversation(notice.root, row!, notice.target.conversationId, { kind: "handoff" });
    else handoffToast(notice, notice.target, wait.entry);
  }
  function canvasShown(root: string, canvas: Canvas): boolean {
    const open = openRef.current;
    return currentScreen.current === "workspace" && !!open && open.folder === root && shownOverviewRef.current === null && sameCanvas(canvas, open.row.id ? { path: open.canvas, id: open.row.id } : { path: open.canvas });
  }
  function handoffScreen(notice: ConversationHandoffNotice, chose: boolean): HandoffScreen {
    const open = openRef.current;
    const canvas = currentScreen.current === "workspace" && open && shownOverviewRef.current === null ? { root: open.folder, canvas: open.row.id ? { path: open.canvas, id: open.row.id } : { path: open.canvas } } : null;
    // The source conversation's composer holding focus with something in it: a draft, or an IME composition.
    const key = `conversation:${notice.source.conversationId}`, link = composerLink.current, field = link?.element() ?? null, active = document.activeElement;
    const draft = canvasRun.current!.composerKey() === key ? overviewRun.current!.store.drafts.get(key) : undefined;
    const filled = !!draft && (draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0);
    const typing = !!field && !!active && field.contains(active) && (filled || link!.composing());
    return { canvas, locked: locked(), dialog: topDialog() !== null, firstRun: wizard !== null || buddyIntro.open, typing, chose };
  }
  // entry: the project of Open's canvas as the renderer listed it when the handoff was announced. A list read since then
  // that still lacks the canvas answers at once; before any, Open waits for it.
  function handoffToast(notice: ConversationHandoffNotice, to: HandoffOpen["to"], entry: FolderEntry | undefined) {
    live.current.toast.show(handoffToastText(notice), "Open", () => {
      const earlier = handoffOpen.current;
      if (earlier) clearTimeout(earlier.timer);
      const wait: HandoffOpen = { root: notice.root, to, expired: false, intent: navigationIntent.current, entry,
        timer: setTimeout(() => { wait.expired = true; live.current.handoffCheck(); }, HANDOFF_WAIT_MS) };
      handoffOpen.current = wait;
      live.current.handoffCheck();
    });
  }
  function handoffOpenCheck() {
    const wait = handoffOpen.current;
    if (!wait) return;
    const { root, to } = wait, { entry, row } = listedRow(root, to.canvas);
    const done = () => { clearTimeout(wait.timer); handoffOpen.current = null; };
    if (wait.intent !== navigationIntent.current) { done(); return; }
    // Only a read still to come is waited for: a finished one that failed, or a project removed, answers at once
    // (POSTMORTEM 2026-10-25 recurrence).
    if (!row && !wait.expired && (entry?.kind === "loading" || (entry?.kind === "list" && entry === wait.entry))) return;
    done();
    if (!row) { live.current.toast.show(entry?.kind === "list" ? handoffGoneText(to.canvas.path, live.current.projectLabel(root)) : unavailableCanvasMessage(entry, to.canvas.path)); return; }
    openCanvasConversation(root, row, to.conversationId, { kind: "notification", permission: false });
  }
  function listedRow(root: string, canvas: Canvas): { entry: FolderEntry | undefined; row: CanvasRow | undefined } {
    const entry = entriesRef.current.find(entry => entry.path === root);
    return { entry, row: entry?.kind === "list" ? entry.canvases.find(row => sameCanvas(canvas, row)) : undefined };
  }
  function openPage(): OpenPage {
    const screen = currentScreen.current;
    const page = !locked() ? null : screen === "addProjects" ? "add_projects" : screen === "settings" ? "settings" : "project_settings";
    return { locked: page, firstRun: wizard !== null || buddyIntro.open, entries: () => entriesRef.current, dismissDialogs() {
      const dialog = topDialog();
      // Synchronous, so the dialog's close has rendered before the check below.
      if (dialog) flushSync(() => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
      return !topDialog();
    } };
  }
  // The body: the loaded root's Overview, problem and reading roots included, or the canvas page of its own open canvas
  // (PRODUCT §5 item 3 'Problem states').
  const body = workspaceBody(screen, loadedRoot, state.open);
  const overview = body === "overview" && entry ? entry : null;
  const shownOverview = overview?.path ?? null;
  shownOverviewRef.current = shownOverview;
  bodyRef.current = body;
  // The overlay over it: a problem scene, or the reading panel once a first read takes 300 ms. A read that follows a
  // scene keeps that scene, busy, so `problemView` is given the overlay this root showed at the last render.
  const loadingRoot = entry?.kind === "loading" ? entry.path : null;
  const [slowRoot, setSlowRoot] = useState<string | null>(null);
  useEffect(() => {
    setSlowRoot(null);
    if (!loadingRoot) return;
    const timer = setTimeout(() => setSlowRoot(loadingRoot), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loadingRoot]);
  const lastOverlay = useRef<{ root: string | null; shown: ShownOverlay }>({ root: null, shown: null });
  const problem = body !== null && entry ? problemView(entry, projectLabel(entry.path), homeDirectory,
    { slow: slowRoot !== null && slowRoot === loadingRoot, shown: lastOverlay.current.root === loadedRoot ? lastOverlay.current.shown : null }) : null;
  lastOverlay.current = { root: loadedRoot, shown: problem === null ? null : problem.kind === "reading" ? { kind: "reading" } : { kind: "problem", entryKind: problem.entryKind, ...(problem.newer ? { newer: true } : {}) } };
  const scene = problem?.kind === "problem" ? problem : null;
  const overlaid = problem !== null;
  overlaidRef.current = overlaid; sceneRef.current = scene !== null;
  // Details is open per root and kind: another root or kind closes it, a read in between keeps it (PRODUCT §5 item 3 'Problem states'), and
  // keeps the message last shown while the entry carries none.
  const [details, setDetails] = useState<{ root: string; kind: ProblemKind } | null>(null);
  const detailsOpen = scene !== null && details?.root === loadedRoot && details.kind === scene.entryKind;
  useEffect(() => { if (details && !detailsOpen) setDetails(null); }, [details, detailsOpen]);
  const lastDetail = useRef<{ root: string | null; kind: ProblemKind; text: string } | null>(null);
  if (scene?.detail !== undefined) lastDetail.current = { root: loadedRoot, kind: scene.entryKind, text: scene.detail };
  const detailText = scene?.detail ?? (scene && lastDetail.current?.root === loadedRoot && lastDetail.current.kind === scene.entryKind ? lastDetail.current.text : undefined);
  // The action whose press made the scene busy, until that read ends.
  const [pressed, setPressed] = useState<{ root: string; name: RowAction } | null>(null);
  const busy = scene?.busy ?? false, sceneShown = scene !== null;
  const wasBusy = useRef(false);
  useEffect(() => {
    if (pressed && (!sceneShown || pressed.root !== loadedRoot || (wasBusy.current && !busy))) setPressed(null);
    wasBusy.current = busy;
  }, [pressed, sceneShown, loadedRoot, busy]);
  // Only Retry, Locate and Set Up can make the scene busy, so only they keep the press for the spinner. A press that
  // ends without a read (main answered and the root is not being read; the Set Up form closed) lets it go, so a later
  // read the person did not start shows no spinner.
  const pressEnded = (root: string, name: RowAction) => {
    if (entriesRef.current.find(entry => entry.path === root)?.kind === "loading") return;
    setPressed(current => current?.root === root && current.name === name ? null : current);
  };
  const overlayAction = (name: RowAction) => {
    if (!scene || scene.busy || loadedRoot === null) return;
    if (name === "details") { setDetails(detailsOpen ? null : { root: loadedRoot, kind: scene.entryKind }); return; }
    const root = loadedRoot;
    if (name === "retry" || name === "locate" || name === "setUp") setPressed({ root, name });
    action(name, root, undefined, () => pressEnded(root, name));
  };
  // The polite live region's text: the heading, when a scene shows or comes back from a read without taking focus.
  // Alternating a trailing no-break space makes the same heading read again.
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null);
  const announce = (text: string) => setAnnouncement(previous => ({ text, seq: (previous?.seq ?? 0) + 1 }));
  // The scene takes focus to its heading when the person arrived at it, or when focus was in what it covers, on the
  // page, or in the overlay itself (a kind change after a recovery); otherwise the live region reads it (PRODUCT §5 item 3 'Problem states').
  const sceneKey = scene ? `${loadedRoot}\n${scene.entryKind}` : null, sceneHeading = scene?.heading ?? "";
  const entryKey = screen === "workspace" ? loadedRoot : null;
  const sceneSeen = useRef<{ scene: string | null; arrival: number; entry: string | null; busy: boolean }>({ scene: null, arrival: 0, entry: null, busy: false });
  useEffect(() => {
    const seen = sceneSeen.current;
    sceneSeen.current = { scene: sceneKey, arrival: arrivalSeq, entry: entryKey, busy };
    if (!sceneKey) { headingPending.current = false; return; }
    const arrived = arrivalSeq !== seen.arrival || entryKey !== seen.entry;
    if (sceneKey !== seen.scene || arrived) {
      const active = document.activeElement;
      const left = !active || active === document.body || !(active instanceof HTMLElement) || !active.isConnected
        || active.closest(".problem-overlay, .workspace > :is(.ov-main, .right-stack, .doan-canvas-panel, .doan-conv-column, .doan-overview-handle)") !== null;
      if (arrived || left) { setAnnouncement(null); focusHeading(); }
      else announce(sceneHeading);
      return;
    }
    if (seen.busy && !busy) { announce(sceneHeading); return; }
    if (headingPending.current && !modal) focusHeading();
  }, [sceneKey, sceneHeading, arrivalSeq, entryKey, busy, modal]);
  // A pick or a capture on the covered canvas ends as the overlay shows (ARCHITECTURE §7 'Problem overlay').
  useEffect(() => {
    if (!overlaid) return;
    if (state.picking) controller.current?.cancelPick();
    if (state.capturing) controller.current?.cancelCapture();
  }, [overlaid, state.picking, state.capturing]);
  // The canvas the conversation panel belongs to: the open canvas of a listed project, while its page shows.
  const panelCanvas = screen === "workspace" && overview === null && state.open && entry?.kind === "list" && entry.path === state.open.folder ? state.open : null;
  const panelKey = panelCanvas ? JSON.stringify([panelCanvas.folder, panelCanvas.row.id ?? null, panelCanvas.canvas]) : null;
  const panelTarget = useMemo<CanvasTarget | null>(() => panelCanvas ? { root: panelCanvas.folder, canvas: panelCanvas.row.id ? { path: panelCanvas.canvas, id: panelCanvas.row.id } : { path: panelCanvas.canvas } } : null, [panelKey]);
  const panelTargetRef = useRef(panelTarget); panelTargetRef.current = panelTarget;
  // The canvas a reply chip can locate in: the panel's, while the canvas page shows it, with its root, since worktrees
  // share canvas ids (POSTMORTEM 2026-11-01). The Overview leaves the last canvas laid out but covers it, so it is not
  // on screen then.
  const canvasOnScreenRef = useRef<{ root: string; id: string } | null>(null);
  canvasOnScreenRef.current = panelCanvas && !state.unlisted && panelCanvas.row.id ? { root: panelCanvas.folder, id: panelCanvas.row.id } : null;
  // Keyed by the canvas, not the target object: a render that reads the same canvas does not show it again.
  useLayoutEffect(() => { canvasRun.current!.show(panelTargetRef.current); }, [panelKey]);
  useEffect(() => { canvasRun.current!.panel(rightPanel.open && panelKey !== null); }, [rightPanel.open, panelKey]);
  const panelList = panelTarget ? homeRun.current.listState(panelTarget.root) : "loading";
  const panelCanvasName = panelCanvas ? canvasLabel(panelCanvas.row) : "";
  const panelTitle = canvasConversationTitle(canvasRun.current!, panelList);
  // A page that knows its canvas is outside the list, or that another canvas shares its ID, keeps the draft in a
  // composer that takes no input.
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
  // One judgement for the toolbar's Play and the size bubble's (prototypePlay.ts); main opens or reuses the prototype
  // window and nothing here changes the canvas.
  const playable = canvasPlayability(state);
  playNext.current = playRequest(state);
  const player: PlayTool = { reason: playable.enabled ? null : playable.reason, button: playButton,
    onPlay: () => sendPlay(playNext.current) };
  const picking = state.picking;
  // Capture area: the canvas, the composer's input, its Attach rule and its attachment count,
  // first match wins. Without the panel's composer the canvas counts as not shown, as for the Picker.
  const captureView = captureAvailability({ canvas: panelTarget !== null && composerKey !== null ? canvasLoad : "loading", composer: panelBlocked,
    fixed: composerFixed(canvasRun.current!.view() ?? { kind: "wait" }, panelList, work), attachments: composerKey ? overviewRun.current!.store.drafts.get(composerKey)?.attachments.length ?? 0 : 0 });
  // The second press ends capture mode. A pick in progress ends by this press, so focus stays on the button. A locked
  // page leaves the button looking usable and doing nothing, as Export does.
  const capture: CaptureTool = { enabled: captureView.enabled, reason: captureView.reason, onToggle: () => {
    const instance = controller.current;
    if (!instance || locked()) return;
    if (state.capturing) { instance.cancelCapture(); return; }
    if (!captureView.enabled) return;
    if (picking) pressedCancel();
    instance.startCapture();
  } };
  // V, H and Space switch tools only on the canvas page itself.
  const toolPage = screen === "workspace" && shownOverview === null && !modal && !overlaid;
  useEffect(() => { controller.current?.setCanvasPage(toolPage); }, [toolPage]);
  // No key, Esc included, reaches the canvas under a problem's overlay (ARCHITECTURE §7 'Problem overlay').
  useLayoutEffect(() => { controller.current?.setCovered(overlaid); }, [overlaid]);
  // Pick from canvas: the composer's Pick, the toolbar's Picker and ⌘L share one pick.
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
    if (overlaidRef.current) return;
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
    const composing = link.composing();
    const returns = holds && !composing;
    if (result.kind !== "picked") {
      // A cancel by a press leaves focus on what was pressed. Esc and the other cancels go back to where focus was
      // before the pick, or the field when that was the page itself (spec 3: never the page body), but only from where
      // the pick left focus: focus the person moved meanwhile, such as into the field, stays.
      const left = !active || active === document.body || active === intent.from || (active instanceof Node && !!viewport.current?.contains(active));
      if (!returns || intent.pressed || !left) return;
      const from = intent.from;
      if (from instanceof HTMLElement && from !== document.body && from.isConnected) from.focus({ preventScroll: true });
      else link.focus();
      return;
    }
    // A chip always lands focus in the field (spec 3), even when focus moved meanwhile, such as into the Presets
    // popover the canvas click closed. Focus first, then the chip: the field puts its kept caret back on focus, and
    // Chromium moves a caret set in an unfocused field to the field's start when it takes focus afterwards (BR4b
    // runtime probe).
    if (!composing) link.focus();
    link.insert(result.anchor);
  }
  // A captured area. Availability was decided when capture mode started;
  // the composer may since have turned to a terminal session or another conversation, or its draft may have filled
  // (main refuses an eleventh file), and none of that ends capture mode. So the composer is checked again before any
  // chip or snapshot, with captureAvailability's order and copy; the limit keeps its left-out line. The checking
  // chip goes in at once. A folded panel unfolds, with focus for the composer, only once main answers: unfolding
  // narrows the canvas area, so before main has read the pixels the area would show something else. A composer no
  // longer shown gets no focus; the answer still lands on the chip wherever its draft is.
  function captured(rect: Rect): (() => Promise<unknown>) | null {
    const at = canvasRun.current!.composerKey();
    if (at === null) return null;
    const store = overviewRun.current!.store;
    const now = captureAvailability({ canvas: canvasLoad, composer: panelBlocked, fixed: composerFixed(canvasRun.current!.view() ?? { kind: "wait" }, panelList, work), attachments: 0 });
    if (!now.enabled) { if (now.reason) toast.show(now.reason); return null; }
    const limit = attachmentLimit((store.drafts.get(at) ?? EMPTY_DRAFT).attachments.length, [{ pasted: false, size: 0 }]);
    if (!limit.accept.length) { toast.show(limit.notices.join(" ")); return null; }
    // Named like main's capture file, so the chip reads "Canvas capture" while main checks it (homeComposer.ts).
    const chip: AttachmentDraft = { key: crypto.randomUUID(), name: "canvas-capture-checking.png", kind: "image", pasted: true, status: "checking" };
    store.setDrafts(drafts => {
      const current = drafts.get(at) ?? EMPTY_DRAFT;
      return new Map(drafts).set(at, { ...current, attachments: [...current.attachments, chip] });
    });
    return () => window.doan.captureCanvas(rect).catch(() => null).then(answer => {
      settleChips(store, support.current!, [chip.key], [answer ?? CAPTURE_FAILED], text => live.current.toast.show(text));
      if (canvasRun.current!.composerKey() === at) revealPanel("composer");
    });
  }
  // The picker stops when its composer changes (another conversation from the menu, New) or stops taking chips;
  // a reload or a same-ID move keeps both, so the pick goes on.
  useEffect(() => { controller.current?.cancelPick(); }, [composerKey]);
  useEffect(() => { if (!pickerReady) controller.current?.cancelPick(); }, [pickerReady]);
  const locateChip = (anchor: Anchor) => new Promise<LocateOutcome>(settle => {
    if (!controller.current?.locate(anchor, settle)) settle("unavailable");
  });
  useEffect(() => {
    // The Project Settings page enables the menu as Settings does (no canvas items, no New Conversation), so main's
    // menu state needs no screen of its own.
    // Under the overlay the workspace has no canvas or Overview items: they would act on what it covers (ARCHITECTURE §7 'Problem overlay').
    void window.doan.setMenuState({ screen: onPage ? "addProjects" : onSettings || onProjectSettings ? "settings" : screen === "home" ? "home" : state.open && !overlaid ? "canvas" : "workspace", modal,
      ...(onPage && page.choose ? { choose: true } : {}), ...(pageLocked ? { locked: true } : {}), ...(shownOverview !== null && !overlaid ? { overview: true } : {}),
      ...(menuPicker && !overlaid ? { pickerAvailable: true } : {}), ...(sidebarHidden ? { sidebarHidden: true } : {}) });
  }, [screen, state.open, modal, page.choose, pageLocked, shownOverview, menuPicker, sidebarHidden, overlaid]);
  // A covered Overview's thread is not seen (PRODUCT §5 item 3 'Problem states').
  useLayoutEffect(() => { overviewRun.current!.show(overlaid ? null : shownOverview); }, [shownOverview, overlaid]);
  // The window's focus decides whether the shown conversation is seen; the focus listener is the
  // sign-in controller's below.
  useEffect(() => {
    const blur = () => { overviewRun.current!.focusChanged(); canvasRun.current!.focusChanged(); };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  // File > New Conversation (⌘N): on the shown Overview its new conversation state; on the canvas page the panel unfolds
  // in the canvas's new conversation state. Either way the composer field takes focus.
  function newConversation() {
    if (live.current.modal || currentScreen.current !== "workspace" || overlaidRef.current) return;
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
  // The canvas page's right column: the conversation panel at its remembered width,
  // clamped to the window's bounds, or none while folded. The Overview's column has its own remembered width under the
  // same bounds: the canvas panel stays in the layout under the Overview, so the one measure serves both.
  const canvasPage = overview === null;
  const panelBox = panelSize ?? { window: 0, shell: 0 };
  const panelLimits = panelBounds(panelBox.window, panelBox.shell);
  const shownPanel = panelWidth(rightPanel.width, panelLimits, canvasPanelDefault(panelBox.window));
  const shownOverviewPanel = panelWidth(overviewSaved, panelLimits, OVERVIEW_PANEL_DEFAULT);
  const rightColumn = canvasPage ? (rightPanel.open ? `${shownPanel}px` : "0px") : `${shownOverviewPanel}px`;
  // The docked buddy lives while the workspace is the screen: canvas switches and the Overview keep it, and Home,
  // Settings and Add Projects give its WebGL context back. It animates on its own frames; App only tells it what
  // changed. The <main> is its stable container: slots fold and leave, the shell stays.
  const inWorkspace = screen === "workspace";
  useEffect(() => {
    const root = shellRoot.current;
    if (!inWorkspace || !root) return;
    dockedBuddy.start(root, () => controller.current?.personMovedAt() ?? 0);
    return () => dockedBuddy.stop();
  }, [inWorkspace]);
  useLayoutEffect(() => { dockedBuddy.setBuddy(buddySelection.shown); }, [buddySelection.shown]);
  const panelFolded = canvasPage && !rightPanel.open, coveredWorkspace = overlaid || wizard !== null || buddyIntro.open;
  useLayoutEffect(() => {
    dockedBuddy.update({ overview: !canvasPage, folded: panelFolded && !panelMotion, folding: panelFolded && panelMotion, covered: coveredWorkspace, hint: picking || state.capturing });
  }, [canvasPage, panelFolded, panelMotion, coveredWorkspace, picking, state.capturing]);
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
  // Fullscreen has no traffic lights; the header's CSS drops their space under this attribute.
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
  // the canvas page's column. The controller does it once per opened canvas.
  useLayoutEffect(() => { if (panelSize && canvasPage) controller.current?.settleFit(); });
  const foldPanel = (open: boolean, focus: "panel" | "content" | null = null) => {
    panelFocus.current = focus ?? (open ? "hide" : "show");
    setPanelMotion(true);
    changePanel(previous => ({ ...previous, open }));
  };
  // The panel's title takes focus when nothing in it was asked for.
  const focusPanel = () => document.querySelector<HTMLElement>(".doan-conv-panel :is(.rp-head, .doan-conv-title .ov-title)")?.focus();
  // An entry unfolds a folded panel (never the agent's own events) and hands focus to what it asked for, once the panel
  // shows it.
  function revealPanel(focus: PanelFocus, handoff?: PanelArrival["handoff"]) {
    if (!rightPanelRef.current.open) foldPanel(true, "content");
    setArrival({ focus, seq: ++panelArrivals.current, ...(handoff ? { handoff } : {}) });
  }
  // The other worktree notice's Open (DESIGN 'Terminal work in another worktree'): opens W's same canvas,
  // which makes W the selected worktree and leaves one canvas visit. A pick on this canvas ends first.
  const onOpenSibling = (root: string) => {
    if (!state.open) return;
    controller.current?.cancelPick();
    openNotice({ root, path: state.open.canvas });
  };
  // The work capsule's Open while the agent waits for an answer: the panel shows that conversation, scrolled
  // to its request with focus on the first choice.
  const openRequest = () => {
    const target = panelTargetRef.current;
    const list = target ? homeRun.current.listState(target.root) : null;
    const waiting = target && Array.isArray(list) ? list.find(c => c.state === "current" && c.phase === "waiting" && c.canvas && sameCanvas(c.canvas, target.canvas)) : undefined;
    if (!target || !waiting) { if (rightPanel.open) focusPanel(); else foldPanel(true, "panel"); return; }
    canvasRun.current!.request(target, waiting.conversationId, "permission");
    revealPanel(panelOpenFor({ kind: "capsule" }, null).open === true ? "permission" : "composer");
  };
  // Folding hands focus to the button that undoes it (close → open button, open → close button).
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
  const run = homeRun.current;
  // Quick Open searches every listed project's conversations; a new map at each list change, so open results follow.
  const conversationLists = useMemo<ConversationLists>(() => new Map(entries.flatMap(entry => entry.kind === "list" ? [[entry.path, run.listState(entry.path)] as const] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run.revision moves with each list HomeRun applies or fails to read.
    [entries, run, run.revision]);
  // A Quick Open pick of a project conversation lands in the Overview's composer field. Declared after the workspace's
  // focus effect, so in the commit that shows the Overview it runs last.
  useEffect(() => {
    if (overviewComposerFocus === 0 || sceneRef.current) return;
    document.querySelector<HTMLElement>(".workspace .ov-main .composer-input")?.focus();
  }, [overviewComposerFocus]);
  // The Overview's right panel: canvases with a current conversation, thumbnails asked for those only.
  const listed = overview ? run.listState(overview.path) : null;
  const canvasList: CanvasList = overview === null || listed === null ? [] : typeof listed === "string" ? listed
    : canvasConversationRows(listed, overview.kind === "list" ? overview.canvases : [], clock, run.seenPending());
  const thumbs = useThumbnails(overview?.kind === "list" ? overview.path : null, typeof canvasList === "string" ? [] : canvasList.flatMap(item => item.row ? [item.row] : []));
  // Fast turned itself off: that provider's Last used follows, and the conversation's own switch
  // held in a composer goes, so the next turn is not asked for Fast again. Only here, as events arrive: this channel
  // never replays history, so a restart cannot undo a Fast the person turned on again (shouldTurnOffFast).
  // A conversation the lists do not name yet waits in fastOffPending until one does.
  const fastOffFor = (conversationId: string, seenAt: number): boolean => {
    const provider = [...homeRun.current.lists.values()].flat().find(c => c.conversationId === conversationId)?.provider
      ?? homeRun.current.conversations.find(c => c.conversationId === conversationId)?.provider;
    if (!provider) return false;
    if ((fastSwitchedAt.current.get(provider) ?? 0) < seenAt) {
      if (!memoryRead.current) fastBeforeRead.current.set(provider, false);
      setHomeMemory(previous => previous ? rememberFast(previous, provider, false) : previous);
    }
    return true;
  };
  const fastTurnedOff = (conversationId: string) => {
    support.current?.fastTurnedOff(conversationId);
    const seenAt = ++fastClock.current;
    if (!fastOffFor(conversationId, seenAt)) fastOffPending.current.set(conversationId, seenAt);
  };
  useEffect(() => window.doan.onConversationEvent(event => {
    homeRun.current.event(event); overviewRun.current!.event(event);
    if (shouldTurnOffFast(event, true)) fastTurnedOff(event.conversationId);
  }), []);
  // A running turn's stage for the threads' turn indicator: one store serves both screens.
  useEffect(() => window.doan.onConversationStage(signal => overviewRun.current!.store.stage(signal)), []);
  // Every render follows a list change, so a waiting auto-off is tried again once a list may name its conversation.
  useEffect(() => { for (const [conversationId, seenAt] of fastOffPending.current) if (fastOffFor(conversationId, seenAt)) fastOffPending.current.delete(conversationId); });
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
  // The canvas page, not the Overview's thumbnails or a canvas under the overlay, makes a canvas seen; a change while it
  // stays shown marks it again.
  const shownCanvas = screen === "workspace" && overview === null && !overlaid && state.open && state.shown && !state.unlisted ? { root: state.open.folder, path: state.shown } : null;
  // Main proves what the page shows from its own document bindings; the renderer only says what it means to show.
  const intent = shownIntent(entries, { screen, overview: overview !== null, covered: overlaid, root: state.open?.folder ?? null, shown: state.shown, unlisted: Boolean(state.unlisted) });
  const intentKey = intent ? `${intent.root}\n${intent.path}` : null;
  const intentRef = useRef(intent); intentRef.current = intent;
  const toldIntent = useRef<string | null>(null);
  useEffect(() => {
    if (intentKey === toldIntent.current) return;
    toldIntent.current = intentKey;
    void window.doan.showCanvas(intentRef.current).catch(() => {});
  }, [intentKey]);
  // A read-state failure is a Retry toast, once: for a failure found meanwhile, only on its project (and canvas); after
  // the toast has gone, entering the project again tries once more and tells what still fails.
  const readStatePlace = useRef<{ root: string | null; shown: string | null }>({ root: null, shown: null });
  readStatePlace.current = { root: screen === "workspace" ? loadedRoot : null, shown: intent?.path ?? null };
  const readStateRetry = (root: string, problem: ReadStateProblem) => {
    const text = readStateToast(problem);
    live.current.toast.retry(text.message, "Retry", text.busy, "Retrying", async () => {
      const next = await window.doan.retryReadState({ root, ...("path" in problem ? { path: problem.path } : {}) });
      return next ? readStateToast(next).message : null;
    });
  };
  const readStateRetryRef = useRef(readStateRetry); readStateRetryRef.current = readStateRetry;
  useEffect(() => window.doan.onReadStateProblem(({ root, problem }) => {
    const place = readStatePlace.current;
    if (place.root !== root || ("path" in problem && problem.path !== place.shown)) return;
    readStateRetryRef.current(root, problem);
  }), []);
  const enteredRoot = screen === "workspace" ? loadedRoot : null;
  useEffect(() => {
    if (enteredRoot === null) return;
    let here = true;
    window.doan.retryReadState({ root: enteredRoot }).then(problem => {
      if (here && problem && readStatePlace.current.root === enteredRoot) readStateRetryRef.current(enteredRoot, problem);
    }, () => {});
    return () => { here = false; };
  }, [enteredRoot]);
  useEffect(() => {
    if (screen !== "workspace" || !loadedRoot || overlaid) return;
    homeRun.current.visit([slotKey(loadedRoot), ...(state.open?.folder === loadedRoot ? [slotKey(loadedRoot, state.open.canvas)] : [])]);
    setRunTick(tick => tick + 1);
  }, [screen, loadedRoot, state.open?.canvas, run.conversations, run.revision, overlaid]);
  const shown = run.strip(loadedRoot);
  // The canvas page has no conversation strip: the panel shows this canvas's conversation, and the sidebar slots and
  // permission toasts the others. A problem or reading root keeps it over its overlay, without the
  // Open that would lead under it (ARCHITECTURE §7 'Problem overlay'); it follows the overlay, so a re-read shorter
  // than 300 ms does not flash it in.
  const stripShown = overlaid && shown && stripView(shown.state, { provider: shown.conversation.provider, project: projectLabel(shown.conversation.root), branch: null, canvas: shown.conversation.canvas ? canvasLabel({ path: shown.conversation.canvas, url: "" }) : null });
  const strip = shown && stripShown && <div className="strip-slot"><KeyedConversationStrip conversationId={shown.conversation.conversationId} provider={shown.conversation.provider} state={shown.state}
    view={{ ...stripShown, actions: stripShown.actions.filter(action => action.command !== "open") }}
    onEditOnHome={() => void run.editOnHome(shown.conversation.conversationId)} onOpen={() => run.openConversation(shown.conversation.conversationId)}
    onDismiss={() => run.dismiss(shown.conversation.conversationId)} /></div>;
  const shellSlots = sidebarSlots(withTerminalSlots(run.slots(), work, entries), entries, shownCanvas);
  const sidebarId = (home: boolean) => home ? "doan-page-sidebar" : "doan-workspace-sidebar";
  const sidebar = (home: boolean) => sidebarHidden ? null : <ShellSidebar id={sidebarId(home)} cards={cards} projects={shellProjects} loaded={loadedRoot} canvas={state.shown ?? undefined} unlisted={state.unlisted} homeDirectory={homeDirectory} search={search} toggle={key => void toggleProject(key)} disclose={discloseProject} toggleGroup={toggleShellGroup} worktree={enter} open={openSidebarCanvas} overview={showShellOverview} action={action} remove={remove}
    projectSettings={root => openProjectSettings(root)}
    canvasMenu={{ blocked: trashWorking, exporting: (root, path) => exporting.has(`${root}\n${path}`), exportCanvas, trash: openTrash }}
    home={home} homeCurrent={screen === "home"} goHome={() => live.current.home()} slots={shellSlots} highlight={highlight} locked={pageLocked} {...(onSettings ? { settings: { section: settings.section, select: selectSection, mcp: mcpShown !== false } } : {})}
    resize={{ width: shownSidebar, bounds: SIDEBAR_BOUNDS, preview: previewSidebar, onResize: width => { sidebarTouched.current = true; setSidebarSaved(width); } }} />;
  // The Project Settings page sits under the Projects tab (page null) but leaves like the other pages.
  const anyPage = onPage || onSettings || onProjectSettings;
  const sidebarToggle = sidebarToggleView(sidebarHidden, shellSlots);
  const topBar = (overPage: boolean) => <TopBar sidebar={{ view: sidebarToggle, controls: sidebarHidden ? undefined : sidebarId(overPage), toggle: toggleSidebar }} back={anyPage || back !== null} forward={!anyPage && forward !== null} page={onPage ? "addProjects" : onSettings ? "settings" : null} locked={pageLocked} updateDisabled={pageLocked || modal || wizard !== null}
    previous={() => anyPage ? leavePage({ kind: "back" }) : travel(back)} next={() => travel(forward)}
    addProjects={openAddProjects} projects={() => { const move = projectsTab(currentScreen.current); if (move === "leavePage") leavePage({ kind: "projectsTab" }); else if (move === "home") home(); }} settings={() => { if (!locked()) openSettings({}); }}
    usage={{ openSettings: () => { if (locked()) return false; openSettings({ section: "agents" }); return true; }, canvasPress: controller.current?.canvasPress }} />;
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
    defaults={preferences ? preferences.preferences.newConversation : undefined} openSettings={openSettings} onRemember={rememberPick} buddy={buddySelection.shown} />}
  {onSettings && <SettingsPage header={topBar(true)} sidebar={sidebar(true)} section={settings.section} arrival={settings.arrival} onState={settingsReport}
    agents={{ signIn: agentSignIn(), preferences, save: savePreferences, project: settingsProject }} buddy={buddySelection}
    mcp={{ watch: mcpWatch.current, openAgents: provider => openSettings({ section: "agents", provider }) }} announcement={settingsAnnouncement} />}
  {onProjectSettings && <ProjectSettingsPage key={projectSettings.key} header={topBar(true)} sidebar={sidebar(true)} root={projectSettings.root} entries={entries} reroot={reroot}
    origin={page.origin} homeDirectory={homeDirectory} arrival={projectSettings.arrival} onState={projectSettingsReport} onGone={() => leavePage({ kind: "gone" })}
    onRerooted={projectSettingsRerooted} onAction={(name, root, notice) => action(name, root, notice)}
    onRemove={() => { const group = cards.find(card => card.rows.some(row => row.path === projectSettings.root)); if (group) void remove(group.rows.map(row => row.path)); }} />}
  {onPage && <AddProjectsPage key={page.seq} header={topBar(true)} sidebar={sidebar(true)} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)} choose={page.chooseSeq} onState={pageReport} onCancel={() => leavePage({ kind: "cancel" })} onAdded={pageAdded} />}
  <main ref={shellRoot} className={`app-shell workspace${overlaid ? " overlaid" : ""}${strip ? " with-strip" : ""}`}
    style={{ visibility: screen !== "workspace" ? "hidden" : "visible" }}
    data-panel={canvasPage && !rightPanel.open ? "collapsed" : undefined} data-panel-motion={panelMotion ? "" : undefined}
    inert={screen !== "workspace"} aria-hidden={screen !== "workspace"}>
    {topBar(false)}
    {sidebar(false)}
    {strip}
    <CanvasPane viewport={viewport} board={board} overlay={overlay} dragLayer={dragLayer} state={state} view={canvasView.current} command={command} covered={overview !== null || overlaid} overlaid={overlaid}
      zoomTo={scale => controller.current?.zoomTo(scale)} onToolbarEscape={event => controller.current?.toolbarEscape(event)} selectFrame={(index, id) => controller.current?.selectFrame(index, id)} conversation={{ open: rightPanel.open, show: () => foldPanel(true), badge: panelBadge }}
      agent={{ list: state.open ? run.listState(state.open.folder) : undefined, canvas: workingCanvas(state.open, state.unlisted, entry), buddy: buddySelection.shown, running: screen === "workspace" && overview === null, work, entries,
        conversationWork, frames: state.layout?.frames ?? null, onWork: target => controller.current?.setWork(target),
        onOpen: openRequest, onOpenSibling, onStopFailed: text => toast.show(text) }}
      picking={picking} capturing={state.capturing} tool={state.tool} onTool={chooseTool} picker={{ enabled: pickerReady, reason: pickerView.reason, onToggle: pickFromCanvas }} capture={capture} player={player} exporter={exporter} />
    {overview && <ProjectOverview key={overview.path} run={overviewRun.current!} support={support.current!} root={overview.path} project={projectLabel(overview.path)} entry={overview}
      worktrees={card?.rows ?? [overview]} homeDirectory={homeDirectory} notice={overviewNotice?.root === overview.path ? overviewNotice.text : null}
      unavailable={null}
      list={run.listState(overview.path)} seen={run.seenPending()} holder={run.running().get(overview.path) ?? null}
      prefs={homeMemory} defaults={preferences ? preferences.preferences.newConversation : undefined} now={clock} onRemember={rememberPick}
      onWorktree={root => { chipFocus.current = true; showShellOverview(root); }} onOpenCanvas={(canvas, conversationId) => openConversationCanvas(overview.path, canvas, conversationId, { kind: "promotion" })}
      onReplyChip={link => replyChip(overview.path, link)}
      onRetryList={() => run.retryList(overview.path)} onStart={(request, last) => run.start(request, last, { stay: true })}
      onSendConversation={(provider, request) => run.send(overview.path, provider, request)}
      onAction={(name, root) => action(name, root)}
      onProjectSettings={root => openProjectSettings(root)}
      onSettings={target => openSettings(target)} onNotice={text => toast.show(text)} onDeleteConversation={openDelete} />}
    {overview && <ResizeHandle className="doan-overview-handle" label="Resize canvas conversations" width={shownOverviewPanel} bounds={panelLimits} preview={previewPanel}
      onResize={width => { overviewTouched.current = true; setOverviewSaved(width); }} />}
    {overview ? <div className="right-stack" inert={overlaid}><CanvasConversations key={overview.path} list={canvasList} project={projectLabel(overview.path)} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible}
      open={item => { if (item.row) openCanvasConversation(overview.path, item.row, item.conversationId, { kind: "overviewRow" }); }} retry={() => run.retryList(overview.path)}
      onDelete={(item, button, after) => openDelete({ conversationId: item.conversationId, root: overview.path, title: item.title, provider: item.provider, from: "canvasList", after }, button)} /></div>
      : <ConversationPanel open={rightPanel.open} width={shownPanel} bounds={panelLimits} onHide={() => { controller.current?.cancelPick(); foldPanel(false); }} onResize={resizePanel} preview={previewPanel}
        title={panelTarget && <CanvasConversationTitle run={canvasRun.current!} list={panelList} canvasName={panelCanvasName} now={clock} seen={run.seenPending()}
          title={panelTitle.title} current={panelTitle.current} onChoose={() => controller.current?.dropPendingLocate()} onDelete={openDelete} onPicked={() => queueMicrotask(() => document.querySelector<HTMLElement>(".doan-conv-panel .composer-input")?.focus())} />}>
        {panelTarget && entry?.kind === "list" && <CanvasConversation run={canvasRun.current!} support={support.current!} target={panelTarget} canvasName={panelCanvasName}
          project={panelProject} entry={entry} list={panelList} seen={run.seenPending()} prefs={homeMemory}
          defaults={preferences ? preferences.preferences.newConversation : undefined} now={clock} blocked={panelBlocked} onRemember={rememberPick}
          frames={state.layout?.frames} locateDisabled={state.status !== null || state.unlisted} arrival={arrival} onArrived={seq => setArrival(current => current?.seq === seq ? null : current)}
          onLocate={locateChip} onReplyChip={link => replyChip(panelTarget.root, link)} onChoose={() => controller.current?.dropPendingLocate()} pick={{ pressed: picking, enabled: pickerReady, reason: pickerView.reason, onToggle: togglePick }} composerLink={composerLink} canvasPress={controller.current?.canvasPress}
          onSettings={target => openSettings(target)} onNotice={text => toast.show(text)}
          onOpenProjectConversation={id => showShellOverview(panelTarget.root, undefined, () => askConversation(panelTarget.root, id))}
          onOpenHandoff={(canvas, id) => openConversationCanvas(panelTarget.root, canvas, id, { kind: "promotion" })} work={work} />}
      </ConversationPanel>}
    {/* Its own key space: the Overview beside it is keyed by the same root, and siblings sharing a key remount on every render. */}
    {problem && <ProblemOverlay key={`problem\n${loadedRoot}`} view={problem} details={detailsOpen} detail={detailText} pressed={pressed && pressed.root === loadedRoot ? pressed.name : null}
      announcement={announcement ? `${announcement.text}${announcement.seq % 2 ? "" : "\u00a0"}` : ""} onAction={overlayAction} />}
  </main>
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} kept={projectKeepsLocal(allEntries, setup)} notGit={allEntries.some(entry => entry.path === setup && entry.kind === "uninitialized" && entry.notGit === true)} onClose={() => { pressEnded(setup, "setUp"); setSetup(null); modalClosed(); }} onRerooted={(root, message) => { choose(root); setSetup(null); setHighlight([root]); toast.show(message); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} conversations={conversationLists} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => { setQuickOpen(false); if (document.activeElement === document.body || !document.activeElement?.isConnected || document.activeElement.closest("dialog.qo")) modalClosed(); }} />}
  {run.removing && <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="project-remove-title" aria-describedby="project-remove-body" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); run.cancelRemove(); modalClosed(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="project-remove-title">{run.removing.title}</h3><p className="doan-dialog-description" id="project-remove-body">{run.removing.body}</p></div></div>
    <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={() => { run.cancelRemove(); modalClosed(); }}>{run.removing.cancel}</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={() => { modalClosed(); void run.confirmRemove(); }}>{run.removing.confirm}</button></div>
  </dialog>}
  {deletingConversation && (() => {
    const { target, pending } = deletingConversation, summary = deleteSummary(target);
    const draft = unsentDraft(overviewRun.current!.store.drafts.get(draftKey({ kind: "existing", conversationId: target.conversationId, provider: target.provider }))) || summary?.returnedDraft === true;
    const availability = summary ? deleteAvailability(summary) : { available: true as const };
    // Not working with messages queued: they wait for the usage limit's reset, and go with the conversation.
    const queued = summary && !summary.working ? summary.queued : 0;
    return <ConversationDeleteDialog view={deleteDialogView(target.title, target.provider, draft, queued)} reason={availability.available ? null : availability.reason} pending={pending}
      cancel={closeDelete} confirm={() => void confirmDelete()} />;
  })()}
  {trashing && <CanvasTrashDialog view={trashDialogView(canvasStem(trashing.row.path), trashing.row.path, trashing.plan, trashWorking(trashing.root, trashing.row))} cancel={closeTrash} confirm={confirmTrash} />}
  {toast.element}
  <PrototypeClosedFocus controller={controller} toolbar={playButton} />
  <StarPrompt onboarding={wizard !== null || buddyIntro.open} pickOrCapture={state.picking || state.capturing} restoreFocus={restoreFloatingFocus} />
  {wizard !== null && <Wizard key={wizard} session={wizard} projects={entries.map(entry => entry.path)} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)} buddy={buddySelection} preferences={preferences}
    onClose={root => {
      setWizard(null);
      if (wizardCloseFocus(root) === "composer") { beforeWizard.current = null; focusComposer.current = true; live.current.home(); choose(root ?? undefined); }
      else restoreFocus.current = true;
    }} />}
  {wizard === null && buddyIntro.open && <BuddyIntro selection={buddySelection} preferences={preferences} onClose={closeBuddyIntro} />}
  </TooltipProvider>;
}

// main refused the request or the call failed: the same notice as an empty capture.
const CAPTURE_FAILED: AttachmentResult = { ok: false, name: "Canvas capture", error: "capture_failed" };

// The dialog on top, the one Escape would answer.
function topDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return open[open.length - 1] ?? null;
}

// Add Projects, Projects and Settings are page tabs; on a page Back returns to where it was opened from. `locked` marks
// the tabs and Back unavailable while App ignores them.
// `updateDisabled` is the Settings menu item's rule (a locked page, a modal, first run), which the update button follows.
function TopBar({ sidebar, back, forward, previous, next, page, locked, updateDisabled, addProjects, projects, settings, usage }: { sidebar: { view: SidebarToggleView; controls: string | undefined; toggle(): void }; back: boolean; forward: boolean; previous(): void; next(): void; page: "addProjects" | "settings" | null; locked: boolean; updateDisabled: boolean; addProjects(): void; projects(): void; settings(): void; usage: { openSettings(): boolean; canvasPress?: CanvasPress | undefined } }) {
  const unavailable = locked || undefined;
  const tab = (name: typeof page) => name === page ? { className: "current", "aria-current": "page" as const } : {};
  return <header className="top shell-top"><span className="traffic-space" aria-hidden="true" />
    <div className="shell-history">
      {/* Left of Back, so Back and Forward move one button right. */}
      <Tooltip><TooltipTrigger asChild><button className="doan-icon-button shell-sidebar-toggle" data-ui-placement="chrome" aria-label={sidebar.view.label} aria-expanded={sidebar.view.icon === "hide"}
        aria-controls={sidebar.controls} data-badge={sidebar.view.badge ? (sidebar.view.badge === "unseen" ? "unseen" : "true") : undefined} onClick={sidebar.toggle}>{sidebar.view.icon === "hide" ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}{sidebar.view.badge === "unseen" && <span className="badge-bubble" aria-hidden="true"><MessageCircle /></span>}</button></TooltipTrigger>
        <TooltipContent className="has-key">{sidebar.view.icon === "hide" ? "Hide sidebar" : "Show sidebar"}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘B</span></TooltipContent></Tooltip>
      <button className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!back} aria-disabled={unavailable} onClick={previous}><ArrowLeft /></button><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!forward} onClick={next}><ArrowRight /></button></div>
    <div className="shell-modes"><button {...tab("addProjects")} aria-disabled={unavailable} onClick={addProjects}><Plus />Add Projects</button><button {...tab(null)} aria-disabled={unavailable} onClick={projects}><LayoutGrid />Projects</button><button {...tab("settings")} aria-disabled={unavailable} onClick={settings}><Settings />Settings</button></div>
    {/* Beside the tabs (docs/DESIGN.md 'Agent usage'), then the update button at the right end. */}
    <AgentUsageButton openSettings={usage.openSettings} canvasPress={usage.canvasPress} />
    <UpdateHeaderButton disabled={updateDisabled} canvasPress={usage.canvasPress} />
  </header>;
}

type AgentProps = { list: readonly ConversationSummary[] | "loading" | "error" | undefined; canvas: WorkingCanvas | null; buddy: BuddyId; running: boolean; work: readonly WorkItem[]; entries: readonly FolderEntry[];
  conversationWork: readonly ConversationWork[]; frames: readonly CanvasFrameRect[] | null; onWork(target: CanvasWorkTarget | null): void; onOpen(): void; onOpenSibling(root: string): void; onStopFailed(text: string): void };

function sendPlay(request: PlayRequest | null): void {
  if (request !== null) prototypeMainCalls().playPrototype(request);
}

function CanvasPane({ viewport, board, overlay, dragLayer, state, view, command, covered, overlaid, zoomTo, onToolbarEscape, selectFrame, conversation, agent, picking, capturing, tool, onTool, picker, capture, player, exporter }: {
  viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>; dragLayer: RefObject<HTMLDivElement | null>;
  // covered: the Overview or a problem's overlay is over the pane. overlaid: the overlay, which names the problem itself.
  state: CanvasState; view: CanvasViewStore; command: (name: ViewCommand) => void; covered: boolean; overlaid: boolean;
  zoomTo(scale: number): void; onToolbarEscape(event: KeyboardEvent): void; selectFrame(index: number, id: string): void; conversation: { open: boolean; show(): void; badge: OpenBadge | null }; agent: AgentProps;
  picking: boolean; capturing: boolean; tool: CanvasState["tool"]; onTool(tool: CanvasState["tool"]): void; picker: PickerTool; capture: CaptureTool; player: PlayTool; exporter: ExportTool;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useControlFocusRecovery(panel, viewport, covered, view);
  const canvasKey = state.open ? JSON.stringify([state.open.folder, state.open.canvas]) : null;
  // Stays laid out under the Overview: opening a canvas fits it to this size at once.
  return <div className="doan-canvas-panel" ref={panel} inert={covered}>
    <CanvasHeader state={state} view={view} canvasKey={canvasKey} command={command} zoomTo={zoomTo} selectFrame={selectFrame} fallbackFocus={() => viewport.current?.focus()} panel={conversation} />
    <section className="area" role="region" aria-label="Canvas" tabIndex={-1} ref={viewport} data-picking={picking ? "" : undefined}>
    <div className="board" ref={board} hidden />
    <div className="overlay" ref={overlay} />
    {/* The controller shows it for Hand and a held Space; React never changes it. */}
    <div className="drag-layer" ref={dragLayer} hidden />
    {/* The agent notice comes first, the canvas notices stack under it. */}
    <CanvasAgent {...agent}>
      {state.error && !overlaid && <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text selectable">{state.error}</span></div>}
      {state.unlisted && <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text selectable">This page is not a listed canvas. Choose a canvas from the Sidebar.</span></div>}
    </CanvasAgent>
    {/* A canvas closed for a missing or not set up root leaves no message: the overlay names the problem. */}
    {state.status && (state.status !== "missing" || state.message) && <div className="canvas-status" role="status">
      {state.status === "loading" ? <p><span className="doan-spinner" aria-hidden="true" />Loading</p>
        : state.status === "failed" ? <div><b>Couldn’t load the canvas</b><br />Run doan check in a terminal<br /><br /><button className="doan-button" data-ui-variant="panel" data-ui-size="sm" onClick={() => command("reload")}>Reload</button></div>
        : state.status === "noWidth" ? <p className="selectable"><b>Could not read a valid board width.</b>{state.message.slice("Could not read a valid board width.".length)}</p>
        : <p className="selectable">{state.message}</p>}
    </div>}
    {/* Picking is a mode the person turned on, so its hint sits by the tools, out of the agent notices' column: their
        coming and going never moves it (DESIGN 'Terminal work in another worktree'). The composer pick button's glyph leads it. */}
    <div className="doan-canvas-bottom">
      {picking && <div className="doan-agent doan-picking" role="status"><Crosshair className="doan-picking-icon" aria-hidden="true" /><span className="doan-agent-text">Click a frame or an element, or Shift-click a spot</span>
        <span className="doan-kbd" data-ui-variant="on-prominent" aria-hidden="true">Esc</span><span className="sr-only">Press Escape to cancel</span></div>}
      {/* Capture mode's hint, in the picking hint's look with Capture area's glyph. */}
      {capturing && <div className="doan-agent doan-picking" role="status"><Scan className="doan-picking-icon" aria-hidden="true" /><span className="doan-agent-text">Drag to capture an area</span>
        <span className="doan-kbd" data-ui-variant="on-prominent" aria-hidden="true">Esc</span><span className="sr-only">Press Escape to cancel</span></div>}
      <CanvasTools tool={tool} picking={picking} capturing={capturing} onTool={onTool} picker={picker} capture={capture} player={player} exporter={exporter} onEscape={onToolbarEscape} />
    </div>
    </section>
  </div>;
}
