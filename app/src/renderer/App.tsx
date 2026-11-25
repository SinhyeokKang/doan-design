import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ShellSidebar } from "./ShellSidebar";
import { useBuddySelection } from "./buddySelection";
import { useBuddyIntroLock } from "./buddyIntroLock";
import type { BuddyPaint } from "./buddyPaint";
import type { BuddyId } from "./buddies";
import { commitVisit, emptyHistory, fallbackWorktree, historyTarget, loadedProjectRow, projectExpanded, projectsTab, reconcileProjects, selectProjectRoot, shownFolders, type Visit } from "./shellNavigation";
import { afterRemoved } from "./afterRemoved";
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
import { CanvasTrashDialog, trashDialogView, type TrashMove } from "./CanvasTrashDialog";
import { ConversationDeleteDialog, unsentDraft, type DeleteTarget } from "./ConversationDeleteDialog";
import { deleteAvailability, deleteDialogView, deleteRefusalText, quoted } from "./conversationDelete";
import { focusFieldEnd } from "./chipField";
import { draftKey, EMPTY_DRAFT, hasDraft } from "./dockedRules";
import type { OpenAsk, OpenLinkResult, OpenResult } from "../main/deepLinks";
import type { ConversationHandoffNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import type { MenuCommand, ViewCommand } from "../main/index";
import { useControlFocusRecovery } from "./canvasControlFocus";
import { CANVAS_RETRY_IDLE, canvasFailedShown, canvasRetryPressed, canvasRetrySettled } from "./canvasRetry";
import { retryButton } from "./ListRetryButton";
import { announcedAgain } from "./listRetry";
import { useVisibleClock } from "./visibleClock";
import { useActivationFocus } from "./activationFocus";
import { CanvasController, CanvasViewStore, canvasViewFields, initialCanvasState, routeCanvasPublish, type CanvasState, type CanvasWorkTarget, type PickResult } from "./CanvasController";
import { headerMove } from "./worktreeSwitchModel";
import { CanvasHeader, type CanvasHeaderNavigation } from "./CanvasHeader";
import { CanvasTools, type CaptureTool, type ExportTool, type PickerTool, type PlayTool } from "./CanvasTools";
import { canvasPlayability, drawerPlayRequest, playDrawer, playRequest, playTooltip } from "./prototypePlay";
import { prototypeMainCalls } from "./prototype/mainCalls";
import { PrototypeClosedFocus } from "./PrototypeClosedFocus";
import { PrototypePlaying } from "./PrototypePlaying";
import type { PlayRequest, PrototypePlaying as Playing } from "../main/prototype/ipc";
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
import { groupProjects, groupRoots } from "./homeCards";
import { CanvasConversations } from "./RightPanel";
import { CanvasRun, type CanvasTarget } from "./canvasRun";
import { CanvasConversation, CanvasConversationTitle, canvasConversationTitle, composerFixed, settleChips } from "./CanvasConversationPanel";
import { captureAvailability } from "./canvasCapture";
import { canvasUnlistedText, DUPLICATE_CANVAS_TEXT, sidebarRowRequest } from "./canvasConversation";
import { canvasStrongestSignal, panelOpenFor, type CanvasSignal, type PanelArrival, type PanelFocus, type PanelTrigger } from "./rightPanelOpen";
import { HANDOFF_WAIT_MS, handoffArrival, handoffGoneText, handoffMultiStep, handoffToastText, type HandoffScreen } from "./handoffView";
import { bubbleAddAvailability, PICKER_UNAVAILABLE, pickerAvailability, targetAnchor, type CanvasLoad, type Rect } from "./canvasPicker";
import { bubbleItems } from "./bubbleItems";
import { BubbleAdd } from "./BubbleAdd";
import type { DockedFieldLink } from "./DockedComposer";
import type { LocateOutcome } from "./ConversationThread";
import type { PrototypeReveal } from "../main/prototype/ipc";
import { REVEAL_UNSHOWN, revealDecision, revealName } from "./revealDecision";
import { replyChipTarget } from "./replyChipTarget";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import { distinctTargets } from "./anchorField";
import type { ScrollTo } from "./overviewRun";
import { ConversationPanel, ResizeHandle } from "./ConversationPanel";
import { canvasPanelDefault, canvasPanelsLayout, OVERVIEW_PANEL_DEFAULT, PANEL_MIN, panelBounds, panelWidth } from "./rightPanelSize";
import { InspectorColumn, type ElementTreeSource } from "./InspectorPanel";
import { refocusOnActivation } from "./activationFocus";
import type { InspectorSelection } from "./inspectorReads";
import type { ElementTreeMessage } from "./canvasMessage";
import type { InspectRequest } from "../main/inspector";
import { SIDEBAR_BOUNDS, sidebarToggleView, sidebarWidth, type SidebarToggleView } from "./sidebarSize";
import { duplicateIdText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { AgentUsageButton } from "./AgentUsageButton";
import { UpdateHeaderButton } from "./UpdateHeaderButton";
import type { CanvasPress } from "./ComposerParts";
import { BuddyIntro, Wizard } from "./Onboarding";
import { isMainCheckout } from "./projectStep";
import { ProjectOverview } from "./ProjectOverview";
import { useThumbnailHub, useThumbnails } from "./thumbnails";
import { canvasConversationRows, type CanvasConversationRow } from "./canvasConversationRows";
import type { CanvasList } from "./CanvasConversationList";
import { QuickOpen } from "./QuickOpenDialog";
import { missingCanvasMessage, openLinkRefusal, removedCanvasMessage, sameShownConversation, unavailableCanvasMessage, type ConversationLists, type SearchResult, type ShownConversation } from "./quickOpen";
import { blockedLinkMessage, blockedReason, decideOpen, type OpenPage } from "./openDecision";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import { conversationCanvasKey, withoutCanvas, withoutConversation, withoutRoots, withoutUnlisted, type HomeMemory, type UiState, type ShellProject } from "../restore/uiState";
import { emptyComposer, forgetHomeStarts } from "./HomeComposerView";
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
export function menuCommand(name: MenuCommand | (string & {}), to: { home: () => void; quickOpen: () => void; newConversation: () => void; pickFromCanvas: () => void; toggleSidebar: () => void }): void {
  if (name === "home") to.home();
  else if (name === "toggleSidebar") to.toggleSidebar();
  else if (name === "newConversation") to.newConversation();
  else if (name === "pickFromCanvas") to.pickFromCanvas();
  else if (name === "quickOpen") to.quickOpen();
}

// A focus move that waits (a pick's end) carries the intent it started with (POSTMORTEM 2026-10-23): it holds while
// focus stays where the wait left it, and ends for good once focus goes anywhere else.
export class FocusIntent {
  private live = true;
  private readonly moved = (event: FocusEvent) => { if (!this.stays(event.target)) this.end(); };
  constructor(private readonly stays: (target: EventTarget | null) => boolean) { window.addEventListener("focusin", this.moved, true); }
  holds(): boolean { return this.live; }
  end(): void { this.live = false; window.removeEventListener("focusin", this.moved, true); }
}

// Add to message's chip while a folded panel unfolds: the composer (and canvas) it was pressed for, and the focus it
// may still take.
interface WaitingChip { anchor: Anchor; composer: string | null; panel: string | null; focus: FocusIntent }

// Main replaces ui-state wholesale on each save, so every save carries Home's memory and none is sent before it was
// read. No field when every group is open, as ui-state stores them.
function withGroups(project: ShellProject, change: (groups: ShellProject["groups"]) => ShellProject["groups"]): ShellProject {
  const { groups, ...rest } = project, next = change(groups);
  return next ? { ...rest, groups: next } : rest;
}
export function savedUiState(input: { screen: "home" | "workspace"; loadedRoot: string | null; open: CanvasState["open"]; expanded: Record<string, string[]>; shellProjects: Record<string, ShellProject>; home: HomeMemory | null; view: UiState["view"] & {}; memory: UiState["lastByRoot"]; settingsSection?: SettingsSection; conversationByRoot?: Record<string, string> | null; conversationByCanvas?: Record<string, Record<string, string>> | null; rightPanel?: UiState["rightPanel"]; inspector?: UiState["inspector"]; overviewPanel?: UiState["overviewPanel"]; sidebar?: UiState["sidebar"]; canvasTool?: CanvasState["tool"] }): UiState | null {
  const { screen, loadedRoot, open, expanded, shellProjects, home, view, settingsSection, rightPanel, inspector, overviewPanel, sidebar, canvasTool } = input;
  const conversationByRoot = input.conversationByRoot && Object.keys(input.conversationByRoot).length ? input.conversationByRoot : undefined;
  const conversationByCanvas = input.conversationByCanvas && Object.keys(input.conversationByCanvas).length ? input.conversationByCanvas : undefined;
  if (home === null) return null;
  const canvas = open && open.folder === loadedRoot ? open.canvas : undefined;
  const canvasId = canvas ? open?.row.id : undefined;
  // The loaded root's canvas is in `lastByRoot` too, so a restart on Home still reopens it on entry.
  const lastByRoot = { ...input.memory, ...(loadedRoot && canvas ? { [loadedRoot]: { canvas, view } } : {}) };
  return { screen, expanded, shellProjects, lastByRoot, home, ...(loadedRoot ? { root: loadedRoot } : {}), ...(canvas ? { canvas, view, ...(canvasId ? { canvasId } : {}) } : {}), ...(settingsSection ? { settingsSection } : {}), ...(conversationByRoot ? { conversationByRoot } : {}), ...(conversationByCanvas ? { conversationByCanvas } : {}), ...(rightPanel ? { rightPanel } : {}), ...(inspector ? { inspector } : {}), ...(overviewPanel ? { overviewPanel } : {}), ...(sidebar ? { sidebar } : {}), ...(canvasTool === "hand" ? { canvasTool } : {}) };
}

// The start's ui-state read under what the run wrote before it: a root the run set, cleared (New) or
// removed keeps the run's word, so a late read never brings back a cleared memory.
export function mergeConversationMemory(saved: Readonly<Record<string, string>> | undefined, current: Readonly<Record<string, string>>, touched: ReadonlySet<string>): Record<string, string> {
  return { ...Object.fromEntries(Object.entries(saved ?? {}).filter(([root]) => !touched.has(root))), ...current };
}

// The same for the canvas memory (ui-state conversationByCanvas), per canvas: a canvas seen before the read keeps the
// run's word, and a root removed before it keeps none of the read memory.
export function mergeCanvasMemory(saved: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined, current: Readonly<Record<string, Readonly<Record<string, string>>>>, removed: ReadonlySet<string>): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = {};
  for (const [root, canvases] of Object.entries(saved ?? {})) if (!removed.has(root)) merged[root] = { ...canvases };
  for (const [root, canvases] of Object.entries(current)) merged[root] = { ...merged[root], ...canvases };
  return merged;
}

// The read sidebar projects under the run's: a project the run holds keeps its roots, selection, fold and groups, and
// unfolds when either unfolded it, as reconcileProjects merges a rejoined group.
export function mergeShellProjects(saved: Readonly<Record<string, ShellProject>>, current: Readonly<Record<string, ShellProject>>): Record<string, ShellProject> {
  const merged = { ...saved };
  for (const [key, project] of Object.entries(current)) {
    const read = saved[key];
    if (!read) { merged[key] = project; continue; }
    const { selectedRoot, selectedAt, ...rest } = read;
    const selection = !project.selectedRoot && selectedRoot && project.roots.includes(selectedRoot) ? { selectedRoot, ...(selectedAt !== undefined ? { selectedAt } : {}) } : {};
    merged[key] = { ...rest, ...project, ...selection, expanded: project.expanded || read.expanded };
  }
  return merged;
}

// First run's project handoff puts focus in the Home composer, ahead of the focus held before the wizard.
export function wizardCloseFocus(root: string | null): "composer" | "previous" { return root ? "composer" : "previous"; }

// The canvas is named by the link's id, since no row names it; the project by its sidebar name. A project still
// being read or with a problem says so as Quick Open does.
export function replyChipRefusal(target: "missing" | "duplicate" | "unavailable", canvas: string, project: string, entry: FolderEntry | undefined): string {
  if (target === "missing") return `Couldn’t open ${canvas}. The canvas isn’t in ${project}.`;
  if (target === "duplicate") return `Couldn’t open ${canvas}. More than one canvas in ${project} uses this ID. Run doan check in a terminal to find them.`;
  return unavailableCanvasMessage(entry, canvas, project);
}

// The title is quoted as the delete toasts quote it, then the reply chip's sentences for a canvas that is gone or
// whose id is shared.
export function conversationOpenRefusal(cause: "deleted" | "missing" | "duplicate", title: string, project: string): string {
  const name = quoted(title) ?? "this conversation";
  return cause === "deleted" ? `Couldn’t open ${name}. It was deleted.` : replyChipRefusal(cause, name, project, undefined);
}

export function validHistoryVisit(entries: readonly FolderEntry[], visit: Visit): boolean {
  const entry = entries.find(entry => entry.path === visit.root);
  return !!entry && entry.kind !== "notFound" && (entry.kind !== "list" || !visit.canvas || entry.canvases.some(row => row.path === visit.canvas));
}

const HEADER_SHOW_INSPECTOR = '.doan-canvas-head .doan-panel-show[data-panel-target="inspector"]';
// The Overview's Conversations list and its open header menu, asked by role and name: the canvas page's panel shares
// their classes, and a class rename would silently turn the check off.
const OVERVIEW_LISTS = '[role="region"][aria-label="Conversations"], [role="menu"][aria-label="Project conversations"]';

// paint: the renderer entry's first-paint buddy and how to apply another; without it (tests) nothing is painted.
export function App({ paint }: { paint?: BuddyPaint } = {}) {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace" | "addProjects" | "settings" | "projectSettings">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  // A Set Up reply can come after the folder list closed the dialog; that late reply must not close it again.
  const setupRef = useRef(setup); setupRef.current = setup;
  // main's plan for the canvas is null until it answers; `seq` drops a closed dialog's late plan. Set through
  // `changeTrashing`, so a reply that lands before the next render sees the dialog as it is.
  const [trashing, setTrashing] = useState<{ root: string; row: CanvasRow; plan: TrashPlanReply | null; seq: number; move: TrashMove } | null>(null);
  const trashingRef = useRef(trashing);
  const changeTrashing = (next: typeof trashing) => { trashingRef.current = next; setTrashing(next); };
  const trashSeq = useRef(0);
  // Set through `changeDeleting`, so the reply sees the dialog as it is. `afterDelete` is where focus goes once
  // deleted: the shown conversation's composer (`field`), or the row or title the list chose.
  const [deletingConversation, setDeletingConversation] = useState<{ target: DeleteTarget; pending: boolean } | null>(null);
  const deletingRef = useRef(deletingConversation);
  const changeDeleting = (next: typeof deletingConversation) => { deletingRef.current = next; setDeletingConversation(next); };
  const afterDelete = useRef<{ selector: string; field: boolean; fallback?: string } | null>(null);
  const quittingRef = useRef(false);
  // The canvases whose `doan export` runs (`root\npath`): from main's running event, sent once the save panel closed on
  // a file, to the export's reply. The progress toast waits a second from that event.
  const [exporting, setExporting] = useState<ReadonlySet<string>>(new Set());
  const exportTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // `chooseSeq` is raised by File > Add Projects… to run Choose folder; the page mounts anew (`seq`) on each
  // opening.
  const [page, setPage] = useState<{ origin: AddPageOrigin; seq: number; chooseSeq: number } & AddPageReport>({ origin: { screen: "home" }, seq: 0, chooseSeq: 0, locked: false, choose: true });
  const pageRef = useRef(page); pageRef.current = page;
  // The Settings page's category, its arrival focus, and whether a category holds a confirmation or a write. It
  // shares the Add Projects page's origin, so moving between them keeps where both return to.
  const [settings, setSettingsState] = useState<{ section: SettingsSection; arrival: SettingsArrival | null; locked: boolean }>({ section: "agents", arrival: null, locked: false });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const setSettings = (next: typeof settings) => { settingsRef.current = next; setSettingsState(next); };
  const settingsQueue = useRef(new SettingsTargetQueue());
  const arrivals = useRef(0);
  // `key` changes only when another worktree is picked: a reroot is followed inside the page, which keeps its config
  // session. It shares the other pages' origin.
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
  const allEntriesRef = useRef(allEntries);
  // The group's selection before it moved to an auto-registered worktree, by that worktree, in memory.
  const beforeAuto = useRef(new Map<string, string>());
  const [state, setState] = useState(initialCanvasState);
  // The zoom and current frame go to the header alone (an App render per pan or zoom tick cost most of the page's
  // script), so `state.zoom`, `state.scale` and `state.currentFrame` can lag: read them from `canvasView`.
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
  // The toolbar Play's frame drawer, open only in its drawer state, and the frame the prototype window plays, which
  // that drawer marks.
  const [playOpen, setPlayOpen] = useState(false);
  const [playing, setPlaying] = useState<Playing | null>(null);
  // The size bubble's Add to message: the controller's host it renders into (once the bubble is built), its button,
  // the toolbar's Picker that focus goes to when the bubble goes, and the chip waiting for a folded panel to unfold.
  const [bubbleHost, setBubbleHost] = useState<HTMLElement | null>(null);
  const bubbleAddButton = useRef<HTMLButtonElement | null>(null);
  const bubbleInspectButton = useRef<HTMLButtonElement | null>(null);
  const pickerButton = useRef<HTMLButtonElement | null>(null);
  const waitingChip = useRef<WaitingChip | null>(null);
  const [reroot, setReroot] = useState<(FolderFocus & { seq: number }) | null>(null);
  // Set Up keeps `rerootSeq` at its start so an older re-root is not taken for its own. `locateFrom`: main reports a
  // Locate as a re-root focus too, but only the workspace Locate may move `loadedRoot` with it.
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
  // Retry must lock before main publishes loading. A later retry of the same root owns a different token.
  const overlayRetries = useRef(new Map<string, symbol>());
  const [, redrawRetry] = useState(0);
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
    openCanvas: (root, row, conversation) => live.current.openCanvasConversation(root, row, conversation.conversationId, { kind: "notification", permission: conversation.waiting }),
    goHome: () => live.current.home(),
    removeNow: (paths, group) => live.current.removeNow(paths, group),
    toast: (message, label, run) => live.current.toast.show(message, label, run),
    sent: request => setHomeMemory(previous => {
      const next = { ...previous, lastRoot: request.root, lastProvider: request.runtime,
        ...(request.model ? { models: { ...previous?.models, [request.runtime]: { model: request.model, ...(request.effort ? { effort: request.effort } : {}) } } } : {}) };
      return request.permissionMode ? rememberPermission(next, request.runtime, request.permissionMode) : next;
    }),
    followedMode: (provider, mode) => live.current.followMode(provider, mode),
    seenFailed: (id, seq) => { overviewRun.current?.seenFailed(id, seq); canvasRun.current?.seenFailed(id, seq); },
    changed: () => { setRunTick(tick => tick + 1); overviewRun.current?.sync(); canvasRun.current?.sync(); },
  });
  // The Overview's main conversation and its composer's lists, for the run; the root it shows, as committed.
  const shownOverviewRef = useRef<string | null>(null);
  // conversationByRoot is written from the start; the Overview reads it only once ui-state was read (memoryRead).
  const conversationByRoot = useRef<Record<string, string>>({});
  // The initial ui-state read has settled (a failed read counts). No save before it: main replaces the whole file on
  // each save, so an early save would drop every field it does not carry.
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
  // The canvas conversation last seen on each canvas (ui-state conversationByCanvas): CanvasRun writes it on Seen from
  // the start and reads it only once ui-state was read (memoryRead), merged under what it wrote before.
  const conversationByCanvas = useRef<Record<string, Record<string, string>>>({});
  // Roots removed before that read: the read's memory for them is dropped by the merge.
  const canvasMemoryRemoved = useRef(new Set<string>());
  // A canvas whose id another listed canvas shares has no memory: neither of the two can tell it is the one meant.
  const sharedCanvasId = (root: string, canvas: Canvas) => {
    const listed = entriesRef.current.find(entry => entry.path === root);
    return canvas.id !== undefined && listed?.kind === "list" && listed.canvases.filter(row => row.id === canvas.id).length > 1;
  };
  const [memoryTick, setMemoryTick] = useState(0);
  // The canvas page's conversation panel: open state and width on this device. A change the
  // person made before the ui-state read wins over the read value.
  const [rightPanel, setRightPanelState] = useState<NonNullable<UiState["rightPanel"]>>({ open: true });
  const rightPanelRef = useRef(rightPanel); rightPanelRef.current = rightPanel;
  const panelTouched = useRef(false);
  const changePanel = (change: (previous: NonNullable<UiState["rightPanel"]>) => NonNullable<UiState["rightPanel"]>) => { panelTouched.current = true; setRightPanelState(change); };
  // The canvas page's inspector column, the same way: open state and width on this device, closed until the person
  // opens it, and a change before the read wins.
  const [inspectorPanel, setInspectorState] = useState<NonNullable<UiState["inspector"]>>({ open: false });
  const inspectorTouched = useRef(false);
  const changeInspector = (change: (previous: NonNullable<UiState["inspector"]>) => NonNullable<UiState["inspector"]>) => { inspectorTouched.current = true; setInspectorState(change); };
  // The Overview's Conversations panel width on this device (undefined: its default), apart from the canvas
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
  // The viewed canvas's conversation list under its sidebar row, folded for every canvas at once and remembered with the
  // sidebar's other values; a fold before the read wins.
  const [conversationsFolded, setConversationsFolded] = useState(false);
  const conversationsFoldTouched = useRef(false);
  // Focus was in the sidebar (or one of its menus) when it was hidden: the header's Show sidebar button takes it.
  const sidebarFocus = useRef(false);
  // Only a toggle animates the shells' first column; the startup read and a resize do not.
  const sidebarMotion = useRef(false);
  // Hiding unmounts the sidebar, so its open menus close with it instead of waiting under a flag to reappear
  // (POSTMORTEM 2026-11-01). Not a Back/Forward visit.
  function toggleSidebar() {
    const hide = !sidebarHiddenRef.current;
    const active = document.activeElement;
    sidebarFocus.current = hide && typeof Element !== "undefined" && active instanceof Element && active.closest(".shell-side, .doan-sidebar-handle, .shell-side-menu") !== null;
    sidebarHiddenTouched.current = true;
    sidebarMotion.current = true;
    setSidebarHidden(hide);
  }
  const previewSidebar = (width: number) => document.documentElement.style.setProperty("--doan-sidebar-width", `${width}px`);
  useLayoutEffect(() => previewSidebar(shownSidebar), [shownSidebar]);
  // The window and the measured column holding the canvas and the panel (sidebar and margins excluded).
  const [panelSize, setPanelSize] = useState<{ window: number; shell: number } | null>(null);
  const shellRoot = useRef<HTMLElement>(null);
  // Which button takes focus after the panel folds ("show") or comes back ("hide"), the panel itself ("panel"), or
  // inside the panel on an entry's arrival ("content").
  const panelFocus = useRef<"show" | "hide" | "panel" | "content" | null>(null);
  // The same for the inspector: its Show button after it folds, its Hide button after it comes back.
  const inspectorFocus = useRef<"show" | "hide" | null>(null);
  // Only folding and unfolding animate the column; a drag, a window resize or the Overview's own column must not.
  const [panelMotion, setPanelMotion] = useState(false);
  // The inspector's own, so the docked buddy, which follows the conversation column, is not told it folds.
  const [inspectorMotion, setInspectorMotion] = useState(false);
  // The inspector element menu's answers, from the controller App makes after its children have mounted.
  const treeListener = useRef<((message: ElementTreeMessage) => void) | null>(null);
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
    seen: () => homeRun.current.seenPending(),
    focused: () => document.hasFocus(),
    openCanvas: (root, canvas, conversationId, scroll) => live.current.openConversationCanvas(root, canvas, conversationId, { kind: "notification", permission: scroll === "permission" }),
    toast: (message, label, run) => live.current.toast.show(message, label, run),
    notice: text => live.current.toast.show(text),
    label: root => live.current.projectLabel(root),
    changed: () => setRunTick(tick => tick + 1),
  }, window.doan);
  // The canvas page's conversation panel; it shares the Overview's threads and drafts.
  const canvasRun = useRef<CanvasRun | null>(null);
  if (!(canvasRun.current instanceof CanvasRun)) canvasRun.current = new CanvasRun({
    list: root => homeRun.current.listState(root),
    readsStarted: root => homeRun.current.readsStarted(root),
    readsApplied: root => homeRun.current.readsApplied(root),
    reread: root => homeRun.current.retryList(root),
    listRetry: root => homeRun.current.listRetry(root),
    markSeen: (id, seq) => homeRun.current.markSeenThrough(id, seq),
    focused: () => document.hasFocus(),
    remembered: (root, canvas) => !memoryRead.current ? undefined : sharedCanvasId(root, canvas) ? null : conversationByCanvas.current[root]?.[conversationCanvasKey(canvas)] ?? null,
    remember: (root, canvas, conversationId) => {
      const key = conversationCanvasKey(canvas), current = conversationByCanvas.current;
      if (sharedCanvasId(root, canvas) || current[root]?.[key] === conversationId) return;
      conversationByCanvas.current = { ...current, [root]: { ...current[root], [key]: conversationId } }; setMemoryTick(tick => tick + 1);
    },
    changed: () => setRunTick(tick => tick + 1),
  }, overviewRun.current.store, window.doan);
  // Where focus goes once the panel shows what an entry asked for; a new seq per entry.
  // The seq only grows: the panel applies an arrival once by its seq, so a later entry must never reuse one.
  const [arrival, setArrival] = useState<PanelArrival | null>(null);
  const panelArrivals = useRef(0);
  const support = useRef<DockedSupport | null>(null);
  if (!support.current) support.current = new DockedSupport(() => setRunTick(tick => tick + 1), window.doan);
  const loadedRootRef = useRef(loadedRoot); loadedRootRef.current = loadedRoot;
  const openRef = useRef(state.open); openRef.current = state.open;
  // Problem overlay (ARCHITECTURE §7): set by the render below, read by effects and listeners declared before it.
  // Whether a problem or reading overlay shows, whether it is a problem scene, and the body under it.
  const overlaidRef = useRef(false), sceneRef = useRef<{ key: string } | null>(null);
  const bodyRef = useRef<"overview" | "canvas" | null>(null);
  // Whether an overlay showed at the last commit, so its going can hand focus on.
  const overlayCommitted = useRef(false);
  // Counts the person's moves into a workspace (completeNavigation): a scene they arrive at takes focus.
  const [arrivalSeq, setArrivalSeq] = useState(0);
  // A scene that should take focus while a modal is open takes it once the modal closes (POSTMORTEM 2026-10-24).
  const headingPending = useRef<typeof sceneRef.current>(null);
  function focusHeading() {
    const destination = sceneRef.current;
    if (!destination) return;
    if (live.current.modal || document.querySelector("dialog[open]")) { headingPending.current = destination; return; }
    headingPending.current = null;
    handFocus.current(() => {
      if (sceneRef.current !== destination || live.current.modal || document.querySelector("dialog[open]")) return;
      document.querySelector<HTMLElement>(".workspace .problem-overlay h2")?.focus();
    });
  }
  // Where focus goes once the overlay is gone: the Overview's composer or the canvas area, else the screen's usual
  // place (PRODUCT §5 item 3 'Problem states'), never the page body.
  function focusResolved() {
    if (live.current.modal || document.querySelector("dialog[open]")) return;
    const to = resolvedFocus(bodyRef.current === "canvas" ? "canvas" : "overview");
    handFocus.current(() => {
      const target = document.querySelector<HTMLElement>(to === "composer" ? ".workspace .ov-main .composer-input" : ".workspace .doan-canvas-panel .area");
      if (target?.isConnected && !target.closest("[inert]")) target.focus();
      else focusCurrentNow();
    });
  }
  function focusCurrent(previous: HTMLElement | null = null) { handFocus.current(() => focusCurrentNow(previous)); }
  function focusCurrentNow(previous: HTMLElement | null = null) {
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
    const instance = new CanvasController(viewport.current, board.current, overlay.current, canvasChanged, sendSelection, dragLayer.current, () => window.doan.pointer());
    controller.current = instance;
    const stopFolders = window.doan.onFolders((all, focus) => {
      const next = shownFolders(all), before = entriesRef.current;
      for (const root of overlayRetries.current.keys()) {
        const kind = next.find(row => row.path === root)?.kind;
        if (kind === undefined || (kind !== "loading" && before.find(row => row.path === root)?.kind === "loading")) overlayRetries.current.delete(root);
      }
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
      // From main's whole list: a hidden auto-registered worktree is still registered and keeps its memory.
      const removed = allEntriesRef.current.filter(entry => !all.some(row => row.path === entry.path)).map(entry => entry.path);
      if (removed.length) {
        forgetRemovedState(removed);
        forgetConversations(removed);
      }
      entriesRef.current = next;
      allEntriesRef.current = all;
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
    instance.bubblePlay = {
      onPlay: () => sendPlay(playNext.current),
      // The bubble went while it had focus: the toolbar's Play is the visible control for the same action.
      onFocusLost: () => { (playButton.current?.isConnected ? playButton.current : viewport.current)?.focus({ preventScroll: true }); },
    };
    instance.bubbleAdd = {
      host: element => setBubbleHost(element),
      onAdd: () => live.current.addToMessage(),
      button: () => bubbleAddButton.current,
      // The bubble went while Add to message had focus: the toolbar's Picker is the visible control that adds a chip.
      onFocusLost: () => { (pickerButton.current?.isConnected ? pickerButton.current : viewport.current)?.focus({ preventScroll: true }); },
    };
    instance.bubbleInspect = {
      onInspect: () => live.current.showBubbleInspector(),
      button: () => bubbleInspectButton.current,
      onFocusLost: () => handInspectorFocus(HEADER_SHOW_INSPECTOR),
      restoreFocus: () => {
        // A background reload can restore DOM focus before the window delivers focusin.
        inspectorActivation.current();
        bubbleInspectButton.current?.focus({ preventScroll: true });
      },
    };
    // The overlay covers the canvas, so its view commands do nothing meanwhile (ARCHITECTURE §7 'Problem overlay').
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace" && !overlaidRef.current) instance.command(name); });
    return () => { navigationIntent.current++; stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  // After the effect above, which makes the controller: the inspector's element menu subscribes before it exists.
  useEffect(() => controller.current?.onElementTree(message => treeListener.current?.(message)), []);
  // App's focus hand-offs also run with the window in the background, so each is made again on activation
  // (POSTMORTEM 2026-11-17). Held in a ref, the stable hand stays out of every effect's dependencies.
  const activationFocus = useActivationFocus();
  const handFocus = useRef(activationFocus);
  const inspectCall = useCallback((request: InspectRequest) => window.doan.inspect(request), []);
  const elementTree = useMemo<ElementTreeSource>(() => ({
    request: () => controller.current?.requestElementTree() ?? false,
    subscribe: listener => { treeListener.current = listener; return () => { if (treeListener.current === listener) treeListener.current = null; }; },
    preview: rect => controller.current?.previewElement(rect),
    select: anchor => controller.current?.selectElement(anchor),
  }), []);
  // Wall-clock text ("3m", "now", a time of day) is computed while rendering, and nothing re-renders App at rest.
  const clock = useVisibleClock(1000, window.doan);
  useEffect(() => { void window.doan.homeDirectory().then(setHomeDirectory).catch(console.error); }, []);
  // First run shows when main's session has no completion record; the session is the one the CLI shares, so a
  // hidden and shown window keeps it.
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
    if (wizard === null && focusComposer.current) { focusComposer.current = false; handFocus.current(() => document.querySelector<HTMLElement>(".home-shell .composer-input")?.focus()); return; }
    if (wizard !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const previous = beforeWizard.current;
    beforeWizard.current = null;
    focusCurrent(previous);
  }, [wizard]);
  // While a page selects, clones, or holds a picker, confirmation or write, every move away is ignored here, in one
  // place: marking the controls alone would leak through toasts and keyboard activation.
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
    // A root still in a problem enters its Overview, where the overlay shows it (POSTMORTEM 2026-11-03).
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
      if (active) {
        conversationByRoot.current = mergeConversationMemory(state?.conversationByRoot, conversationByRoot.current, memoryTouched.current);
        conversationByCanvas.current = mergeCanvasMemory(state?.conversationByCanvas, conversationByCanvas.current, canvasMemoryRemoved.current);
        // Merged here, not in the restore, which a navigation before the read cancels.
        const read = afterRemoved({ shellProjects: state?.shellProjects ?? {}, expanded: state?.expanded ?? {}, history: emptyHistory() }, [...canvasMemoryRemoved.current]);
        setExpanded(previous => ({ ...read.expanded, ...previous }));
        setShellProjects(previous => mergeShellProjects(read.shellProjects, previous));
        const remembered = controller.current?.memory() ?? {};
        for (const [root, item] of Object.entries(state?.lastByRoot ?? {})) if (!(root in remembered) && !canvasMemoryRemoved.current.has(root)) controller.current?.remember(root, item);
        memoryRead.current = true; setMemoryTick(tick => tick + 1); overviewRun.current?.sync(); canvasRun.current?.sync();
      }
      if (active && state?.settingsSection && !sectionChosen.current) setSettings({ ...settingsRef.current, section: state.settingsSection });
      if (active && state?.rightPanel && !panelTouched.current) setRightPanelState(state.rightPanel);
      if (active && state?.inspector && !inspectorTouched.current) setInspectorState(state.inspector);
      if (active && state?.overviewPanel && !overviewTouched.current) setOverviewSaved(state.overviewPanel.width);
      if (active && state?.sidebar && !sidebarTouched.current) setSidebarSaved(state.sidebar.width);
      if (active && state?.sidebar?.hidden && !sidebarHiddenTouched.current) setSidebarHidden(true);
      if (active && state?.sidebar?.conversationsFolded && !conversationsFoldTouched.current) setConversationsFolded(true);
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
    if (!restore.state || plan.kind === "home") return;
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
    // Entries a read list no longer names go here: nothing else forgets a conversation deleted in the prototype window
    // or a canvas deleted outside Doan, and the map would grow toward UI_STATE_MAX_BYTES.
    conversationByCanvas.current = withoutUnlisted(conversationByCanvas.current, root => {
      const entry = entriesRef.current.find(item => item.path === root), list = homeRun.current.listState(root);
      return { canvases: entry?.kind === "list" ? entry.canvases : null, conversations: Array.isArray(list) ? list : null };
    });
    const state = savedUiState({ ...persisted.current, view: instance.currentView(), memory: instance.memory(), conversationByRoot: conversationByRoot.current, conversationByCanvas: conversationByCanvas.current });
    if (state) void window.doan.saveUiState(state).then(saved => { if (!saved) console.error("doan: UI state was not saved"); }).catch(console.error);
  };
  // A page is never restored; a restart opens the screen it came from. Settings keeps only its last category.
  const savedScreen = screen === "addProjects" || screen === "settings" || screen === "projectSettings" ? page.origin.screen : screen;
  const sidebarState = sidebarSaved === undefined && !sidebarHidden && !conversationsFolded ? undefined
    : { ...(sidebarSaved === undefined ? {} : { width: sidebarSaved }), ...(sidebarHidden ? { hidden: true as const } : {}), ...(conversationsFolded ? { conversationsFolded: true as const } : {}) };
  const overviewPanelState = overviewSaved === undefined ? undefined : { width: overviewSaved };
  // Closed at its default width is what a missing value reads as, so it is not written.
  const inspectorState = inspectorPanel.open || inspectorPanel.width !== undefined ? inspectorPanel : undefined;
  const persisted = useRef({ screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section, rightPanel, inspector: inspectorState, overviewPanel: overviewPanelState, sidebar: sidebarState, canvasTool: state.tool });
  persisted.current = { screen: savedScreen, loadedRoot, open: state.open, expanded, shellProjects, home: homeMemory, settingsSection: settings.section, rightPanel, inspector: inspectorState, overviewPanel: overviewPanelState, sidebar: sidebarState, canvasTool: state.tool };
  // At commit, so a change already on screen has been sent.
  useLayoutEffect(save, [restore, savedScreen, loadedRoot, state.open, expanded, shellProjects, homeMemory, settings.section, memoryTick, rightPanel, inspectorPanel, overviewSaved, sidebarSaved, sidebarHidden, conversationsFolded, state.tool]);
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
    if (group) setShellProjects(previous => { const { collapsed, groups } = previous[group.key] ?? {}; return { ...previous, [group.key]: { roots: group.rows.map(row => row.path), expanded: previous[group.key]?.expanded ?? false, selectedRoot: root, selectedAt: Date.now(), ...(collapsed ? { collapsed } : {}), ...(groups ? { groups } : {}) } }; });
  };
  const enter = (root: string) => {
    if (locked()) return;
    cancelRestore();
    if (root === loadedRoot) { controller.current?.cancelWorkspaceOpen(); setScreen("workspace"); }
    else controller.current?.openWorkspace(root, next => completeNavigation(next), false);
  };
  // opened: after the canvas shows, for a caller that records something only once the open went through.
  const openShellCanvas = (root: string, row: CanvasRow, cursor?: number, opened?: () => void, keepView = false) => {
    if (locked()) return;
    cancelRestore();
    controller.current?.openCanvas(root, row, undefined, { ...(keepView ? { keepView } : {}), opened: () => { completeNavigation(root, cursor); opened?.(); }, unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, row.path, live.current.projectLabel(root))) });
  };
  const switchCanvasWorktree = (root: string, path: string) => {
    const entry = entriesRef.current.find(entry => entry.path === root);
    const move = headerMove(entry, path);
    const row = move.kind === "canvas" && entry?.kind === "list" ? entry.canvases.find(row => row.path === move.path) : undefined;
    if (row) openShellCanvas(root, row, undefined, undefined, true);
    else toast.show(unavailableCanvasMessage(entry, path, projectLabel(root)));
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
  // A canvas row opens its canvas; a project row shows its conversation in the main column with no visit. The row
  // already shown only moves focus: picking it again would move the revision and drop a reply on its way.
  function openOverviewRow(root: string, item: CanvasConversationRow) {
    if (item.kind === "canvas") { if (item.row) openCanvasConversation(root, item.row, item.conversationId, { kind: "overviewRow" }); return; }
    const run = overviewRun.current!;
    if (item.status?.kind === "permission") { run.request(root, item.conversationId, "permission"); return; }
    const view = run.view(root);
    if (view.kind !== "conversation" || view.conversationId !== item.conversationId) run.select(root, item.conversationId);
    queueMicrotask(() => focusFieldEnd(document.querySelector<HTMLElement>(".workspace .ov-main .composer-input")));
  }
  // A project conversation in its root's Overview: the Overview opens, then asks for it.
  function openOverviewConversation(root: string, conversationId: string) {
    showShellOverview(root, undefined, () => askConversation(root, conversationId));
  }
  function openConversationCanvas(root: string, canvas: Canvas, conversationId?: string, trigger: PanelTrigger = { kind: "card" }) {
    const listed = entriesRef.current.find(entry => entry.path === root);
    const row = listed?.kind === "list" ? listed.canvases.find(row => sameCanvas(canvas, row)) : undefined;
    if (!row) { live.current.toast.show(unavailableCanvasMessage(listed, canvas.path, live.current.projectLabel(root))); return; }
    if (conversationId) live.current.openCanvasConversation(root, row, conversationId, trigger);
    else live.current.openShellCanvas(root, row);
  }
  // The conversation slots with the terminal sessions' spinners over them, as the sidebar shows them.
  const shownSlots = () => withTerminalSlots(homeRun.current.slots(), work, entriesRef.current);
  // The row's slot decides whether the panel unfolds, so a terminal spinner over an unseen ending keeps the panel.
  // `listed`: the conversation list shows under this row, so the row carries no signal and its press keeps the panel.
  function openSidebarCanvas(root: string, row: CanvasRow, cursor?: number, listed = false) {
    const slot = listed ? null : shownSlots().get(canvasSlotKey(root, row.path)) ?? null;
    const open = panelOpenFor({ kind: "sidebarRow" }, slot?.kind ?? null);
    const list = homeRun.current.listState(root);
    const target = { path: row.path, ...(row.id ? { id: row.id } : {}) };
    const requested = open.open === true && Array.isArray(list) ? sidebarRowRequest(list, target, slot?.kind ?? null, homeRun.current.seenPending()) : null;
    if (requested) openCanvasConversation(root, row, requested, { kind: "sidebarRow" }, slot?.kind ?? null);
    else openShellCanvas(root, row, cursor);
  }
  // A sidebar conversation row: the panel shows that conversation and unfolds, focusing its waiting request, else the
  // composer, as a notification's Open does (PRODUCT §5 item 2 'Opening'). On the canvas already shown it adds no visit.
  function openSidebarConversation(root: string, row: CanvasRow, conversationId: string) {
    const list = homeRun.current.listState(root);
    const waiting = Array.isArray(list) && list.some(c => c.conversationId === conversationId && c.phase === "waiting");
    openCanvasConversation(root, row, conversationId, { kind: "notification", permission: waiting });
  }
  // The canvas opens with that conversation asked for in its panel, which unfolds when the trigger opens it. `slot`
  // is the canvas row's sidebar slot, which a sidebar row's trigger reads.
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
  // An auto-registered worktree left the shown list without the person's move: on screen, its page moves to the
  // worktree selected before it (else the main checkout), no toast; a group with nothing left goes Home.
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
  // Saved only when something was forgotten (withoutCanvas and withoutConversation answer the same map otherwise).
  function forgetCanvasConversation(next: Record<string, Record<string, string>>) {
    if (next === conversationByCanvas.current) return;
    conversationByCanvas.current = next; setMemoryTick(tick => tick + 1);
  }
  function forgetConversations(roots: readonly string[]) {
    if (!memoryRead.current) for (const root of roots) { memoryTouched.current.add(root); canvasMemoryRemoved.current.add(root); }
    conversationByRoot.current = withoutRoots(conversationByRoot.current, roots);
    conversationByCanvas.current = withoutRoots(conversationByCanvas.current, roots); setMemoryTick(tick => tick + 1);
    forgetHomeStarts(composerMemory, roots);
    overviewRun.current?.forgetRoots(roots);
    canvasRun.current?.forgetRoots(roots);
    homeRun.current.forgetRoots(roots);
  }
  const cards = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const card = cards.find(card => card.rows.some(row => row.path === loadedRoot));
  const entry = entries.find(entry => entry.path === loadedRoot);
  const groupSignature = JSON.stringify(cards.map(card => ({ key: card.key, roots: card.rows.map(row => row.path) })));
  const names = projectNames(entries.map(entry => entry.path));
  const autoRoots = entries.flatMap(entry => entry.autoRegistered ? [entry.path] : []);
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
    else toast.show(unavailableCanvasMessage(listed, notice.path, live.current.projectLabel(notice.root)));
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
    // Another project's row opens its Overview from anywhere, never its last canvas, and never folds it: only its
    // chevron does. A problem root's Overview shows under its overlay.
    controller.current?.openWorkspace(root, next => {
      setShellProjects(previous => ({ ...previous, [key]: { ...memory, expanded: true } }));
      askSlot(next);
      completeNavigation(next);
    }, false, undefined, true);
  };
  // The project row's chevron: fold or unfold only, the loaded project included.
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
  // itself is not modal (POSTMORTEM 2026-10-25).
  const toastHeld = modal || (screen === "projectSettings" && projectSettings.locked);
  useLayoutEffect(() => { toast.setModal(toastHeld); }, [toastHeld]);
  const live = useRef({ home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: (root: string) => root, askConversation, openConversationCanvas, openCanvasConversation, newConversation: () => {}, pickFromCanvas: () => {}, toggleSidebar: () => {}, pickEnded: (_result: PickResult) => {}, addToMessage: () => {}, showBubbleInspector: () => {}, captured: (_rect: Rect): (() => Promise<unknown>) | null => null, followMode: (_provider: Provider, _mode: PermissionModeId) => {}, openLink: (_result: OpenLinkResult) => {}, openCanvasRequest: (_request: OpenAsk) => {}, prototypeReveal: (_request: PrototypeReveal) => {}, prototypeLastUsed: (_choice: ComposerChoice) => {}, conversationHandoff: (_notice: ConversationHandoffNotice) => {}, handoffCheck: () => {}, forgetRemoved: (_paths: readonly string[]) => {} });
  live.current = { home, enter, toast, modal, save, completeNavigation, openShellCanvas, removeNow, search, openAddProjects, leavePage, openSettings, openProjectSettings, notificationClick, leaveVanished, projectLabel: root => projectLabelRef.current(root), askConversation, openConversationCanvas, openCanvasConversation, newConversation, pickFromCanvas, toggleSidebar, pickEnded, addToMessage, showBubbleInspector, captured, followMode, openLink, openCanvasRequest, prototypeReveal, prototypeLastUsed, conversationHandoff, handoffCheck, forgetRemoved };
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
  // A surviving worktree can still anchor the group for a fresh confirmation. Without one the target is gone.
  useEffect(() => {
    const removing = homeRun.current.removing;
    if (!removing) return;
    if (removing.paths.some(path => allEntries.some(entry => entry.path === path))) return;
    homeRun.current.closeRemove(); modalClosed();
  }, [allEntries]);
  // The row the Move to Trash dialog asks about left the list: the dialog closes. A folder still loading keeps it.
  useEffect(() => {
    if (!trashing) return;
    const entry = entries.find(entry => entry.path === trashing.root);
    if (entry?.kind === "loading" || (entry?.kind === "list" && entry.canvases.some(row => row.path === trashing.row.path))) return;
    closeTrash();
  }, [entries, trashing]);
  // The covered parts App does not draw itself are inert under the overlay; the folded conversation column keeps its own.
  useLayoutEffect(() => {
    for (const node of document.querySelectorAll<HTMLElement>(".workspace > :is(.ov-main, .doan-overview-handle, .doan-conv-column, .doan-insp-column)"))
      node.toggleAttribute("inert", overlaidRef.current || (node.matches(".doan-conv-column") && !rightPanelRef.current.open) || (node.matches(".doan-insp-column") && !inspectorShownRef.current));
  });
  // Add to message's chip for a folded panel, once the inert above is off: a focus call before it would fail.
  useLayoutEffect(() => {
    const pending = waitingChip.current;
    if (pending === null || !rightPanelRef.current.open) return;
    waitingChip.current = null;
    insertAdd(pending);
  });
  // The overlay went with focus in it: focus goes to the uncovered body (PRODUCT §5 item 3 'Problem states'), after
  // the inert above comes off and ahead of the recovery focus below, which would take it to the sidebar.
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
  // Every way into Settings comes here. While a category holds a confirmation or a write, the latest target waits for
  // it (POSTMORTEM 2026-10-25).
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
  // On the page, picking another worktree switches to it with a new page and the same origin, and picking the same one
  // focuses its title; a locked page takes neither.
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
  // would find the origin gone and go Home (POSTMORTEM 2026-10-25).
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
  // A registered project goes Home chosen and flashed. The registration can answer before the folder list has the root,
  // so the choice waits for the list (POSTMORTEM 2026-10-25).
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
  // File > Add Projects… (⌘O) opens the page; on the page it runs Choose folder, which main allows only in choose.
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
  useEffect(() => window.doan.onPrototypeReveal(request => live.current.prototypeReveal(request)), []);
  useEffect(() => window.doan.onPrototypeLastUsed(choice => live.current.prototypeLastUsed(choice)), []);
  // `doan open` requests: main sends them only once links are ready, and each is answered by its id.
  useEffect(() => window.doan.onOpenRequest(request => live.current.openCanvasRequest(request)), []);
  // A started handoff, and every later render's check of the one still waiting for its read.
  useEffect(() => window.doan.onConversationHandoff(notice => live.current.conversationHandoff(notice)), []);
  useEffect(() => window.doan.onFoldersRemoved(paths => live.current.forgetRemoved(paths)), []);
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
  // One reader of main's MCP Connectors snapshots for the whole window, since a connection attempt outlives the page;
  // it toasts a failure elsewhere and follows running turns.
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
  // focus goes to the Agents title and the page says why once.
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
  // Escape leaves a page unless a field or IME composition holds it, or an overlay closes itself first. A Radix popover
  // closes on Escape and prevents the default, so a handled Escape is skipped as CanvasController skips it.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (currentScreen.current !== "addProjects" && currentScreen.current !== "settings" && currentScreen.current !== "projectSettings")) return;
      live.current.leavePage(pageEscape(event, live.current.modal || !!document.querySelector('dialog[open], [role="menu"], [role="tooltip"]')));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  // Only the 'Use a folder on your Mac' card takes a file drop; elsewhere the window refuses files so it never opens one.
  // A target that took the drag has already prevented the default; text and links are left to fields.
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
  function remove(paths: string[], currentGroup?: (paths: string[]) => string[] | null): Promise<void> {
    cancelRestore();
    rememberFocus();
    return homeRun.current.remove(paths, removalQuestionLabel(cards, paths, names), currentGroup);
  }
  function cancelRemove() {
    if (homeRun.current.removing?.pending) return;
    homeRun.current.cancelRemove();
    modalClosed();
  }
  // A project's Remove from Doan (the sidebar, the problem overlay, Project Settings) takes the whole group as
  // `doan remove` does, an auto-registered worktree hidden from the shown rows included (PRODUCT §5 item 1).
  const removeProject = (shown: string[]) => {
    const roots = (paths: string[]) => {
      const anchor = paths.find(root => allEntriesRef.current.some(entry => entry.path === root));
      return anchor ? groupRoots(allEntriesRef.current, [anchor]) : [];
    };
    return remove(roots(shown) ?? shown, roots);
  };
  async function removeNow(paths: string[], group?: true) {
    cancelRestore();
    const result = group ? await window.doan.removeProjects(paths, group) : await window.doan.removeProjects(paths);
    if (result.kind === "removed") forgetRemoved(paths);
    return result;
  }
  // The sidebar's part of a removal, also for roots main's list dropped. Refs and setters only: `onFolders` keeps the
  // first render's copy.
  function forgetRemovedState(paths: readonly string[]) {
    const none = emptyHistory();
    setShellProjects(previous => afterRemoved({ shellProjects: previous, expanded: {}, history: none }, paths).shellProjects);
    setExpanded(previous => afterRemoved({ shellProjects: {}, expanded: previous, history: none }, paths).expanded);
    const current = historyRef.current, next = afterRemoved({ shellProjects: {}, expanded: {}, history: current }, paths).history;
    if (next !== current) { historyRef.current = next; setHistory(next); }
  }
  // What the window forgets about roots it or `doan remove` (folders:removed) took out; going Home is the entries effect's.
  // A second pass for the same roots sets no state.
  function forgetRemoved(paths: readonly string[]) {
    forgetRemovedState(paths);
    for (const root of paths) controller.current?.remember(root, null);
    // Only while something is left to forget, so a second pass bumps no memory tick and saves nothing: before ui-state
    // is read every removal is marked (memoryTouched), and after it a root's conversation memory or Overview draft.
    if (!memoryRead.current || paths.some(root => root in conversationByRoot.current || root in conversationByCanvas.current || overviewRun.current?.drafts.has(`root:${root}`))) forgetConversations(paths);
  }
  // The dialog asks main for its plan before it can be confirmed; notListed and notFile close it with that refusal's
  // toast. Closing returns focus to the row's menu button through `beforeModal`.
  function openTrash(root: string, row: CanvasRow, button: HTMLElement | null) {
    if (locked() || live.current.modal) return;
    beforeModal.current = button;
    const seq = ++trashSeq.current;
    changeTrashing({ root, row, plan: null, seq, move: { pending: false, failed: null } });
    void readTrashPlan(root, row.path).then(plan => applyTrashPlan(seq, plan));
  }
  function readTrashPlan(root: string, path: string): Promise<TrashPlanReply> {
    return window.doan.planCanvasTrash(root, path).catch(() => ({ kind: "refused", reason: "failed" }));
  }
  function applyTrashPlan(seq: number, plan: TrashPlanReply) {
    const current = trashingRef.current;
    if (current?.seq !== seq) return;
    if (plan.kind === "refused" && (plan.reason === "notListed" || plan.reason === "notFile")) {
      closeTrash();
      live.current.toast.show(trashToast(canvasStem(current.row.path), plan));
      return;
    }
    changeTrashing({ ...current, plan });
  }
  function closeTrash() { changeTrashing(null); modalClosed(); }
  // Cancel and Escape: refused while the move is out, since cancelling would stop nothing.
  function cancelTrash() { if (!trashingRef.current?.move.pending) closeTrash(); }
  // The dialog stays busy and refuses its cancel until main answers (DESIGN 'Busy action'). The mark set before the
  // request makes the open canvas's removal a trash, not a move to another canvas of the same id.
  function confirmTrash() {
    const current = trashingRef.current;
    if (!current || current.move.pending || current.plan?.kind !== "ready" || trashWorking(current.root, current.row)) return;
    changeTrashing({ ...current, move: { pending: true, failed: null } });
    const { root, row, seq } = current, marks = controller.current?.trash, mark = marks?.begin(root, row.path);
    const done = (reply: TrashReply) => {
      if (mark) marks!.settle(mark, reply.kind === "trashed" ? "trashed" : "refused");
      // The canvas's conversation memory goes with it, so ui-state does not grow toward its cap.
      if (reply.kind === "trashed") forgetCanvasConversation(withoutCanvas(conversationByCanvas.current, root, row));
      const open = trashingRef.current?.seq === seq ? trashingRef.current : null;
      if (open && reply.kind === "refused") { changeTrashing({ ...open, move: { pending: false, failed: reply } }); return; }
      if (open) closeTrash();
      live.current.toast.show(trashToast(canvasStem(row.path), reply));
    };
    window.doan.trashCanvas(root, row.path).then(done, () => done({ kind: "refused", reason: "failed" }));
  }
  // Cancel and Escape return focus to the menu's trigger (`beforeModal`); the row's button is inside the closed menu. A
  // Conversations list row's Delete passes itself as the trigger.
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
  // The deleting mark ends exactly once: deleted (success, or not_found) or cancelled (any other refusal, a rejected
  // call). A leaked mark would freeze that conversation's state until a reload.
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
          forgetCanvasConversation(withoutConversation(conversationByCanvas.current, conversationId));
          // The row the list chose can leave too before focus moves (another deletion, a re-read); the title stays, and
          // the deleted row's Delete, where focus would otherwise go back, leaves with its row.
          if (target.from === "canvasList") afterDelete.current = target.after.kind === "row"
            ? { field: false, selector: `.ov-right .cv-row[data-key="${CSS.escape(target.after.key)}"]`, fallback: ".ov-right .rp-head" }
            : { field: false, selector: ".ov-right .rp-head" };
          // The canvas panel moves on under the title menu button, which takes focus. A sidebar Delete's row comes first even
          // for the shown conversation: focus stays in the list it was pressed in.
          else if (target.from === "sidebar") afterDelete.current = { field: false, selector: sidebarRow(target.after), fallback: sidebarRow(target.canvasRow) };
          else if (shown) afterDelete.current = from === "overview" ? { field: true, selector: ".workspace .ov-main .composer-input" } : { field: false, selector: ".doan-conv-panel .doan-conv-title .ov-title" };
        } finally { store.deleted(conversationId); }
      } else { store.cancelDelete(conversationId); overviewRuns.sync(); canvasRuns.sync(); }
    } catch (error) { console.error(error); }
    finally {
      closeDelete();
      if (code !== null && !quitting()) live.current.toast.show(deleteRefusalText(code, title));
    }
  }
  function sidebarRow(key: string): string { return `.shell-side [role="treeitem"][data-key="${CSS.escape(key)}"]`; }
  const trashHeld = trashing !== null && trashWorking(trashing.root, trashing.row);
  const busyTrash = trashing?.plan?.kind === "refused" && trashing.plan.reason === "busy" ? trashing : null;
  useEffect(() => {
    if (!busyTrash || trashHeld) return;
    let closed = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const plan = await readTrashPlan(busyTrash.root, busyTrash.row.path);
      if (closed || trashingRef.current?.seq !== busyTrash.seq) return;
      // Main can see a pending start or a binding before the renderer ever sees the work.
      if (plan.kind === "refused" && plan.reason === "busy") timer = setTimeout(() => void refresh(), 1000);
      else applyTrashPlan(busyTrash.seq, plan);
    };
    void refresh();
    return () => { closed = true; clearTimeout(timer); };
  }, [busyTrash, trashHeld]);
  // What keeps Move to Trash unavailable, for the menu and the open dialog alike (main judges again).
  function trashWorking(root: string, row: CanvasRow) {
    const list = homeRun.current.listState(root);
    return trashBlock({ root, path: row.path, ...(row.id ? { id: row.id } : {}) }, Array.isArray(list) ? list : null, work,
      (at, canvas) => canvasRun.current!.startingOn({ root: at, canvas })) !== null;
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
  // Focus that fell to the page while the save panel was open goes back to the button once, when main reports the run
  // or answers (POSTMORTEM 2026-11-03). Reads refs only, so the running listener may call it.
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
    else if (name === "retry") return window.doan.reopenFolder(root).catch(console.error).finally(() => settled?.());
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- keeps a new RowAction from falling into the locate branch
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
  // What an aria-disabled Back or sidebar button says in its tooltip while the page holds every move.
  const lockReason = onPage && page.locked ? blockedReason("add_projects") : onSettings && settings.locked ? blockedReason("settings")
    : onProjectSettings && projectSettings.locked ? blockedReason("project_settings") : null;
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
  // The conversation already on screen only takes focus: no move and no visit. One that can no longer be opened returns
  // false, so Quick Open hands focus back to where it was opened.
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
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.path, live.current.projectLabel(result.root)));
    if (!row) { unavailable(target); return; }
    const frameId = result.kind === "frame" ? result.frameId : undefined;
    const found = (ok: boolean) => { if (!ok) live.current.toast.show("This frame is no longer in the canvas."); };
    controller.current?.openCanvas(result.root, row, frameId === undefined ? undefined : { frame: frameId }, { unavailable, ...(result.kind === "frame" ? { found, index: result.frameIndex } : {}), opened: () => completeNavigation(result.root) });
  }
  // ARCHITECTURE §7 'Deep links'. A link comes only from a person, so an open dialog is dismissed first through its own
  // cancel event; one that refuses (busy) keeps the move from happening.
  function openLink(result: OpenLinkResult) {
    if (result.kind !== "navigate") { live.current.toast.show(openLinkRefusal(result)); return; }
    const decision = decideOpen(result, openPage());
    if (decision.kind === "busy") { live.current.toast.showIn(topDialog(), blockedLinkMessage(decision.reason)); return; }
    cancelRestore();
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, result.canvas, live.current.projectLabel(result.root)));
    if (decision.kind === "canvas_not_found") { unavailable(decision.entry); return; }
    controller.current?.openCanvas(result.root, decision.row, result.frame === undefined ? undefined : { frame: result.frame }, { unavailable, opened: () => completeNavigation(result.root) });
  }
  // A chip into the canvas on screen locates there, with no move or visit; one into another canvas moves as a link does
  // (decideOpen). Settles with the locate's outcome, or null when it did not locate.
  function replyChip(root: string, link: ReplyAnchor): Promise<LocateOutcome | null> {
    const entry = entriesRef.current.find(entry => entry.path === root);
    const onScreen = canvasOnScreenRef.current;
    const target = replyChipTarget(link, { root, openCanvasId: onScreen?.root === root ? onScreen.id : null, entry });
    if (target === "locate") return locateChip(link.kind === "frame" ? { frame: { id: link.id } } : { element: { doanId: link.id } });
    if (typeof target === "string") { live.current.toast.show(replyChipRefusal(target, link.canvas, live.current.projectLabel(root), entry)); return Promise.resolve(null); }
    const decision = decideOpen({ root, canvas: target.open.path }, openPage());
    if (decision.kind === "busy") return Promise.resolve(null);
    cancelRestore();
    const unavailable = (entry: FolderEntry | undefined) => live.current.toast.show(unavailableCanvasMessage(entry, target.open.path, live.current.projectLabel(root)));
    if (decision.kind === "canvas_not_found") { unavailable(decision.entry); return Promise.resolve(null); }
    controller.current?.openCanvas(root, decision.row, link.kind === "frame" ? { frame: link.id } : { element: link.id }, { unavailable, opened: () => completeNavigation(root) });
    return Promise.resolve(null);
  }
  // A chip, Sign in or an Open pressed in the prototype window: main checked it and brought this window forward. It
  // acts as this window's own chip or button would; a dialog, a locked page or first run stays as it is, with a toast.
  function prototypeReveal(request: PrototypeReveal) {
    const page = openPage();
    const step = revealDecision(request, { locked: page.locked, firstRun: page.firstRun, dialog: topDialog() !== null, onScreen: panelTargetRef.current, entries: entriesRef.current });
    const missing = (outcome: string | null) => { if (outcome === "missing") live.current.toast.show(`Couldn’t show ${revealName(request, entriesRef.current)}. It’s no longer in the canvas.`); };
    switch (step.kind) {
      case "blocked": live.current.toast.showIn(topDialog(), step.text); return;
      case "locate": void locateChip(step.anchor).then(outcome => {
        if (outcome === "unavailable") live.current.toast.show(`Couldn’t show ${revealName(request, entriesRef.current)}. ${REVEAL_UNSHOWN}`);
        else missing(outcome);
      }); return;
      case "open": {
        cancelRestore();
        const path = step.row.path;
        controller.current?.openCanvas(step.root, step.row, { anchor: step.anchor }, { unavailable: entry => live.current.toast.show(unavailableCanvasMessage(entry, path, live.current.projectLabel(step.root))), opened: () => completeNavigation(step.root), located: missing });
        return;
      }
      case "canvas_not_found": live.current.toast.show(unavailableCanvasMessage(step.entry, step.path, live.current.projectLabel(step.root))); return;
      case "reply": void replyChip(step.root, step.link).then(missing); return;
      case "settings": openSettings({ section: "agents", ...(step.provider ? { provider: step.provider } : {}) }); return;
      case "conversation":
        if (step.canvas) openConversationCanvas(step.root, step.canvas, step.conversationId, { kind: "card" });
        else showShellOverview(step.root, undefined, () => askConversation(step.root, step.conversationId));
        return;
      case "handoff": openConversationCanvas(step.root, step.canvas, step.conversationId, { kind: "card" }); return;
    }
  }
  // The prototype composer's pick, as this window's own composers remember theirs (Last used, and a fixed Settings
  // default only by what was picked).
  function prototypeLastUsed(choice: ComposerChoice) { rememberPick(choice); }
  // `doan open` moves as a link does but answers main instead of toasting; the answer is sent once the move is decided,
  // and the frame result comes from the canvas's listed frames.
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
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the openCanvas callback sets opened
    if (!opened) { answer({ kind: "canvas_not_found" }); return; }
    answer({ kind: "opened", frame: request.frame === undefined ? "none" : decision.row.frames?.some(frame => frame.id === request.frame) ? "found" : "missing" });
  }
  // A target the list does not name yet waits for that read up to HANDOFF_WAIT_MS; any choice of the person's meanwhile
  // turns the move into the toast (POSTMORTEM 2026-10-25, 2026-10-26). It never closes a dialog: the person did not ask for it.
  interface HandoffWait { notice: HandoffNotice; expired: boolean; timer: ReturnType<typeof setTimeout>; intent: number; revision: number; entry: FolderEntry | undefined }
  const handoffWait = useRef<HandoffWait | null>(null);
  // A toast's Open whose canvas the list did not name yet: it waits the same way, and a later move of the person's drops
  // it. to: the single handoff's target, or a summary's source canvas.
  interface HandoffOpen { root: string; to: { conversationId: string; canvas: Canvas }; expired: boolean; timer: ReturnType<typeof setTimeout>; intent: number; entry: FolderEntry | undefined }
  const handoffOpen = useRef<HandoffOpen | null>(null);
  // The source page's revision: the canvas panel's, or the Overview's for the root it shows (an Overview not on screen
  // has none; asking it would make that root's state).
  const sourceRevision = (notice: ConversationHandoffNotice) => notice.source.canvas ? canvasRun.current!.revision()
    : shownOverviewRef.current === notice.root ? overviewRun.current!.revision(notice.root) : -1;
  const handoffWaitFor = (notice: HandoffNotice, entry: FolderEntry | undefined): HandoffWait => {
    const wait: HandoffWait = { notice, expired: false, intent: navigationIntent.current, revision: sourceRevision(notice), entry,
      timer: setTimeout(() => { wait.expired = true; live.current.handoffCheck(); }, HANDOFF_WAIT_MS) };
    return wait;
  };
  function conversationHandoff(notice: ConversationHandoffNotice) {
    const earlier = handoffWait.current;
    if (earlier) { clearTimeout(earlier.timer); handoffWait.current = null; handoffToast(earlier.notice, earlier.notice.target, earlier.entry); }
    if ("targets" in notice) {
      if (handoffMultiStep(handoffScreen(notice, false), notice) !== "toast") return;
      const source = notice.source;
      if (source.canvas) handoffToast(notice, { conversationId: source.conversationId, canvas: source.canvas }, listedRow(notice.root, source.canvas).entry);
      else overviewToast(notice);
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
    const chose = wait.intent !== navigationIntent.current || wait.revision !== sourceRevision(notice);
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
    const open = openRef.current, onWorkspace = currentScreen.current === "workspace";
    const canvas = onWorkspace && open && shownOverviewRef.current === null ? { root: open.folder, canvas: open.row.id ? { path: open.canvas, id: open.row.id } : { path: open.canvas } } : null;
    // The Overview on screen with what its main column shows; a problem or reading overlay hides it.
    const shownRoot = onWorkspace && !overlaidRef.current ? shownOverviewRef.current : null;
    const shownView = shownRoot ? overviewRun.current!.view(shownRoot) : null;
    const overview = shownRoot && shownView && shownView.kind !== "wait" ? { root: shownRoot, conversationId: shownView.kind === "conversation" ? shownView.conversationId : null } : null;
    const key = `conversation:${notice.source.conversationId}`, active = document.activeElement;
    let typing: boolean;
    if (notice.source.canvas) {
      // The source conversation's composer holding focus with something in it: a draft, or an IME composition.
      const link = composerLink.current, field = link?.element() ?? null;
      const draft = canvasRun.current!.composerKey() === key ? overviewRun.current!.store.drafts.get(key) : undefined;
      typing = !!field && !!active && field.contains(active) && (hasDraft(draft) || link!.composing());
    } else {
      // The Overview composer's draft or IME composition, or keyboard focus in its Conversations list or an open
      // header menu: the person is at work on the Overview (PRODUCT §5 item 2 'Handoff').
      const inList = !!(active as { closest?: (selector: string) => unknown } | null)?.closest?.(OVERVIEW_LISTS);
      typing = hasDraft(overviewRun.current!.store.drafts.get(key)) || !!overviewComposerLink.current?.composing() || inList;
    }
    return { canvas, overview, locked: locked(), dialog: topDialog() !== null, firstRun: wizard !== null || buddyIntro.open, typing, chose };
  }
  // entry: the project of Open's canvas as the renderer listed it when the handoff was announced. A list read since then
  // that still lacks the canvas answers at once; before any, Open waits for it.
  function handoffToast(notice: ConversationHandoffNotice, to: HandoffOpen["to"], entry: FolderEntry | undefined) {
    live.current.toast.show(handoffToastText(notice, live.current.projectLabel(notice.root)), "Open", () => {
      const earlier = handoffOpen.current;
      if (earlier) clearTimeout(earlier.timer);
      const wait: HandoffOpen = { root: notice.root, to, expired: false, intent: navigationIntent.current, entry,
        timer: setTimeout(() => { wait.expired = true; live.current.handoffCheck(); }, HANDOFF_WAIT_MS) };
      handoffOpen.current = wait;
      live.current.handoffCheck();
    });
  }
  // Several handoffs from the Overview: Open shows the source conversation in its root's Overview, and a source deleted
  // meanwhile leaves the toast without Open, as its card has none (PRODUCT §5 item 2 'Handoff').
  function overviewToast(notice: HandoffMultiNotice) {
    const { root } = notice, { conversationId } = notice.source, text = handoffToastText(notice, live.current.projectLabel(root));
    const list = homeRun.current.listState(root);
    if (Array.isArray(list) && !list.some(c => c.conversationId === conversationId)) { live.current.toast.show(text); return; }
    live.current.toast.show(text, "Open", () => openOverviewConversation(root, conversationId));
  }
  function handoffOpenCheck() {
    const wait = handoffOpen.current;
    if (!wait) return;
    const { root, to } = wait, { entry, row } = listedRow(root, to.canvas);
    const done = () => { clearTimeout(wait.timer); handoffOpen.current = null; };
    if (wait.intent !== navigationIntent.current) { done(); return; }
    // Only a read still to come is waited for: a finished one that failed, or a project removed, answers at once
    // (POSTMORTEM 2026-10-25).
    if (!row && !wait.expired && (entry?.kind === "loading" || (entry?.kind === "list" && entry === wait.entry))) return;
    done();
    if (!row) { live.current.toast.show(entry?.kind === "list" ? handoffGoneText(to.canvas.path, live.current.projectLabel(root)) : unavailableCanvasMessage(entry, to.canvas.path, live.current.projectLabel(root))); return; }
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
  const folderProblem = body !== null && entry ? problemView(entry, projectLabel(entry.path), homeDirectory,
    { slow: slowRoot !== null && slowRoot === loadingRoot, shown: lastOverlay.current.root === loadedRoot ? lastOverlay.current.shown : null }) : null;
  const retryPending = loadedRoot !== null && overlayRetries.current.has(loadedRoot);
  const problem = retryPending && folderProblem?.kind === "problem" ? { ...folderProblem, busy: true } : folderProblem;
  lastOverlay.current = { root: loadedRoot, shown: problem === null ? null : problem.kind === "reading" ? { kind: "reading" } : { kind: "problem", entryKind: problem.entryKind, ...(problem.newer ? { newer: true } : {}) } };
  const scene = problem?.kind === "problem" ? problem : null;
  const overlaid = problem !== null;
  const sceneKey = scene ? `${loadedRoot}\n${scene.entryKind}` : null, sceneHeading = scene?.heading ?? "";
  overlaidRef.current = overlaid;
  // A later visit can show the same root and kind without owning the earlier visit's activation focus.
  if (sceneKey !== (sceneRef.current?.key ?? null)) sceneRef.current = sceneKey === null ? null : { key: sceneKey };
  // Details is open per root and kind: another root or kind closes it, a read in between keeps it, and it keeps the
  // message last shown while the entry carries none.
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
  // Only Retry, Locate and Set Up can make the scene busy. A press that ends without a read lets go, so a later read the
  // person did not start shows no spinner.
  const pressEnded = (root: string, name: RowAction) => {
    if (entriesRef.current.find(entry => entry.path === root)?.kind === "loading") return;
    setPressed(current => current?.root === root && current.name === name ? null : current);
  };
  const overlayAction = (name: RowAction) => {
    if (!scene || scene.busy || loadedRoot === null || overlayRetries.current.has(loadedRoot)) return;
    if (name === "details") { setDetails(detailsOpen ? null : { root: loadedRoot, kind: scene.entryKind }); return; }
    const root = loadedRoot;
    // The overlay's Remove from Doan is the project's, as the sidebar menu's and Project Settings' are (PRODUCT §5 item
    // 1): every registered worktree of the group, not only the open one.
    if (name === "remove") { void removeProject([root]); return; }
    if (name === "retry") {
      const token = Symbol();
      overlayRetries.current.set(root, token);
      redrawRetry(n => n + 1);
      void action(name, root, undefined, () => {
        if (overlayRetries.current.get(root) !== token || entriesRef.current.find(row => row.path === root)?.kind === "loading") return;
        overlayRetries.current.delete(root);
        redrawRetry(n => n + 1);
      });
      return;
    }
    if (name === "locate" || name === "setUp") setPressed({ root, name });
    void action(name, root, undefined, () => pressEnded(root, name));
  };
  // The polite live region's text: the heading, when a scene shows or comes back from a read without taking focus.
  // Alternating a trailing no-break space makes the same heading read again.
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null);
  const announce = (text: string) => setAnnouncement(previous => ({ text, seq: (previous?.seq ?? 0) + 1 }));
  // The scene takes focus to its heading when the person arrived at it or focus was in what it covers, on the page, or
  // in the overlay; otherwise the live region reads it (PRODUCT §5 item 3 'Problem states').
  const entryKey = screen === "workspace" ? loadedRoot : null;
  const sceneSeen = useRef<{ scene: string | null; arrival: number; entry: string | null; busy: boolean }>({ scene: null, arrival: 0, entry: null, busy: false });
  useEffect(() => {
    const seen = sceneSeen.current;
    sceneSeen.current = { scene: sceneKey, arrival: arrivalSeq, entry: entryKey, busy };
    if (!sceneKey) { headingPending.current = null; return; }
    const arrived = arrivalSeq !== seen.arrival || entryKey !== seen.entry;
    if (sceneKey !== seen.scene || arrived) {
      const active = document.activeElement;
      const left = !active || active === document.body || !(active instanceof HTMLElement) || !active.isConnected
        || active.closest(".problem-overlay, .workspace > :is(.ov-main, .right-stack, .doan-canvas-panel, .doan-insp-column, .doan-conv-column, .doan-overview-handle)") !== null;
      // A watcher can change the error while the same focused Retry is still pending.
      const retryStillFocused = retryPending && active === recoveryFocus.current?.element && active.isConnected;
      if (arrived || (left && !retryStillFocused)) { setAnnouncement(null); focusHeading(); }
      else announce(sceneHeading);
      return;
    }
    if (seen.busy && !busy) { announce(sceneHeading); return; }
    if (headingPending.current === sceneRef.current && !modal) focusHeading();
  }, [sceneKey, sceneHeading, arrivalSeq, entryKey, busy, modal, retryPending]);
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
  // The panel's canvas while the canvas page shows it, with its root, since worktrees share canvas ids (POSTMORTEM
  // 2026-11-01). The Overview covers the last laid-out canvas, so it is not on screen then.
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
  // The folded panel's badge: the strongest signal across the canvas's conversations, working included.
  const panelBadge = panelTarget && Array.isArray(panelList) && !rightPanel.open ? canvasStrongestSignal(panelList, panelTarget.canvas, homeRun.current.seenPending()) : null;
  // Show conversation: with a badge the panel unfolds on the conversation it stands for, focus on its request when it
  // waits for an answer; without one it unfolds on what it showed.
  const showPanel = () => {
    const target = panelTargetRef.current;
    if (!target || !panelBadge) { foldPanel(true); return; }
    const waits = panelBadge.kind === "permission";
    canvasRun.current!.request(target, panelBadge.conversationId, waits ? "permission" : null);
    if (waits) revealPanel("permission"); else foldPanel(true);
  };
  const canvasLoad: CanvasLoad = state.unlisted ? "unlisted" : state.status === null && state.layout ? "loaded" : state.status === "failed" ? "failed" : state.status === "noWidth" ? "noWidth" : "loading";
  const composerKey = canvasRun.current!.composerKey();
  const composerChips = composerKey ? distinctTargets(overviewRun.current!.store.drafts.get(composerKey)?.segments ?? []) : 0;
  const pickerView = panelTarget !== null ? pickerAvailability(panelBlocked, canvasLoad, composerChips) : { enabled: false, reason: PICKER_UNAVAILABLE };
  const pickerReady = pickerView.enabled;
  // The size bubble's Add to message makes the chip a pick of the selection would; the selection itself stays.
  const bubbleAnchor = state.selection ? targetAnchor(state.selection) : null;
  const bubbleAddView = bubbleAddAvailability({ capturing: state.capturing, anchor: bubbleAnchor, picker: pickerView, unlisted: panelTarget !== null && state.unlisted ? canvasUnlistedText(panelProject) : null });
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
  // A drawer whose state went (a pick or capture started, a playable frame got selected) closes its own open state, so
  // it does not come back by itself when the drawer state does (POSTMORTEM 2026-11-01).
  const playDrawerState = playable.kind === "drawer";
  useEffect(() => { if (!playDrawerState) setPlayOpen(false); }, [playDrawerState]);
  // A pick plays that frame only: the selection, the view and `doan active` stay as they are.
  const player: PlayTool = { kind: playable.kind, tooltip: playTooltip(state), button: playButton, onPlay: () => sendPlay(playNext.current),
    open: playOpen && playDrawerState, onOpenChange: setPlayOpen,
    drawer: playDrawerState ? { ...playDrawer(state, playing), onPick: row => { setPlayOpen(false); sendPlay(drawerPlayRequest(state, row.id)); } } : null };
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
  // The composer's Pick, the toolbar's Picker and ⌘L share one pick. `pressed`: a control press ended it, so focus stays
  // there. `bubble`: it started from a size bubble button, which the pick's clear of the selection takes away.
  const pickIntent = useRef<{ field: HTMLElement | null; from: Element | null; focus: FocusIntent; pressed?: boolean; bubble: boolean } | null>(null);
  // The shown composer's field, which the panel's composer registers (DockedFieldLink).
  const composerLink = useRef<DockedFieldLink | null>(null);
  // The Overview composer's, for a handoff from the conversation it shows (an IME composition keeps the screen).
  const overviewComposerLink = useRef<DockedFieldLink | null>(null);
  const togglePick = () => {
    const instance = controller.current;
    if (!instance) return;
    if (picking) { pressedCancel(); instance.cancelPick(); return; }
    if (!pickerReady) return;
    const from = document.activeElement, field = composerLink.current?.element() ?? null;
    const fromInspect = from !== null && from === bubbleInspectButton.current;
    const bubble = fromInspect || (from !== null && (from === bubbleAddButton.current || from === instance.bubblePlayButton()));
    // The picker, the page, the canvas and the field itself are where a pick leaves focus; anything else ends it.
    const focus = new FocusIntent(target => !target || target === from || target === document.body || target === field
      || (fromInspect && target === document.querySelector(HEADER_SHOW_INSPECTOR))
      || (target instanceof Node && !!viewport.current?.contains(target)));
    pickIntent.current?.focus.end();
    pickIntent.current = { field, from, focus, bubble };
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
  // The selection's chip at the panel composer's caret, with the selection and `doan active` left as they are. A folded
  // panel's composer is inert until its unfold commits, so the chip waits for it (the layout effect after the inert one).
  function addToMessage() {
    if (overlaidRef.current || !bubbleAddView.enabled || bubbleAnchor === null) return;
    waitingChip.current?.focus.end();
    waitingChip.current = null;
    const from = document.activeElement, field = composerLink.current?.element() ?? null;
    const focus = new FocusIntent(target => !target || target === from || target === document.body || target === field);
    const pending: WaitingChip = { anchor: bubbleAnchor, composer: composerKey, panel: panelKey, focus };
    if (!rightPanelRef.current.open && panelOpenFor({ kind: "picker" }, null).open === true) { waitingChip.current = pending; foldPanel(true, "content"); return; }
    insertAdd(pending);
  }
  // Focus first, then the chip, for pickEnded's reason; a composing field gets the chip once the composition ends and no
  // focus call. A chip for another canvas, another conversation or a composer that stopped taking input is dropped.
  function insertAdd(pending: WaitingChip) {
    const holds = pending.focus.holds();
    pending.focus.end();
    const link = composerLink.current;
    if (!link || pending.panel !== panelKey || pending.composer !== canvasRun.current!.composerKey() || panelBlocked !== null) return;
    if (holds && !link.composing()) link.focus();
    link.insert(pending.anchor);
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
      // A cancel by a press leaves focus on what was pressed. Other cancels go back to where focus was before the pick (never
      // the page body), but only from where the pick left focus.
      if (!returns || intent.pressed) return;
      // A pick from a size bubble button took the button with it, so focus waited on the toolbar: the field is where it goes
      // back to, after the commit that unfolded a folded panel.
      if (intent.bubble) { link.focus(); return; }
      const left = !active || active === document.body || active === intent.from || (active instanceof Node && !!viewport.current?.contains(active));
      if (!left) return;
      const from = intent.from;
      if (from instanceof HTMLElement && from !== document.body && from.isConnected) from.focus({ preventScroll: true });
      else link.focus();
      return;
    }
    // Focus first, then the chip: Chromium moves a caret set in an unfocused field to the field's start when it takes
    // focus afterwards.
    if (!composing) link.focus();
    link.insert(result.anchor);
  }
  // Capture mode outlives composer changes (a terminal session, another conversation, a full draft), so the composer is
  // checked again with captureAvailability's order and copy; a folded panel unfolds only once main has read the pixels.
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
    // The Project Settings page enables the menu as Settings does; its flag only names the page in `doan remove`'s busy
    // sentence. Under the overlay there are no canvas or Overview items (ARCHITECTURE §7 'Problem overlay').
    void window.doan.setMenuState({ screen: onPage ? "addProjects" : onSettings || onProjectSettings ? "settings" : screen === "home" ? "home" : state.open && !overlaid ? "canvas" : "workspace", modal,
      ...(onPage && page.choose ? { choose: true } : {}), ...(pageLocked ? { locked: true } : {}), ...(shownOverview !== null && !overlaid ? { overview: true } : {}),
      ...(menuPicker && !overlaid ? { pickerAvailable: true } : {}), ...(sidebarHidden ? { sidebarHidden: true } : {}), ...(onProjectSettings ? { projectSettings: true } : {}) });
  }, [screen, state.open, modal, page.choose, pageLocked, shownOverview, menuPicker, sidebarHidden, overlaid, onProjectSettings]);
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
  // The canvas panel at its remembered width clamped to the window, or none while folded. The Overview's column uses the
  // same bounds: the canvas panel stays in the layout under the Overview, so one measure serves both.
  const canvasPage = overview === null;
  const panelBox = panelSize ?? { window: 0, shell: 0 };
  const panelLimits = panelBounds(panelBox.window, panelBox.shell);
  // The canvas page sizes the conversation first and gives the inspector what is left beside a 360px board; a window
  // too narrow for the inspector's minimum hides it and keeps its saved open flag.
  const canvasPanels = canvasPanelsLayout({ windowWidth: panelBox.window, shellWidth: panelBox.shell, conversation: rightPanel, inspector: inspectorPanel });
  const conversationLimits = canvasPanels.conversation.bounds;
  const shownPanel = panelWidth(rightPanel.width, conversationLimits, canvasPanelDefault(panelBox.window));
  const shownOverviewPanel = panelWidth(overviewSaved, panelLimits, OVERVIEW_PANEL_DEFAULT);
  const rightColumn = canvasPage ? (rightPanel.open ? `${shownPanel}px` : "0px") : `${shownOverviewPanel}px`;
  const inspectorShown = canvasPage && inspectorPanel.open && canvasPanels.inspectorFits;
  const inspectorLimits = canvasPanels.inspector.bounds ?? { min: PANEL_MIN, max: PANEL_MIN };
  const shownInspector = panelWidth(inspectorPanel.width, inspectorLimits, PANEL_MIN);
  const inspectorColumn = inspectorShown ? `${shownInspector}px` : "0px";
  const inspectorShownRef = useRef(inspectorShown); inspectorShownRef.current = inspectorShown;
  // The docked buddy lives while the workspace is the screen; Home, Settings and Add Projects give its WebGL context back.
  // The <main> is its stable container: slots fold and leave, the shell stays.
  const inWorkspace = screen === "workspace";
  useEffect(() => {
    const root = shellRoot.current;
    if (!inWorkspace || !root) return;
    dockedBuddy.start(root, () => controller.current?.personMovedAt() ?? 0, window.doan);
    return () => dockedBuddy.stop();
  }, [inWorkspace]);
  useLayoutEffect(() => { dockedBuddy.setBuddy(buddySelection.shown); }, [buddySelection.shown]);
  const panelFolded = canvasPage && !rightPanel.open, coveredWorkspace = overlaid || wizard !== null || buddyIntro.open;
  useLayoutEffect(() => {
    dockedBuddy.update({ overview: !canvasPage, folded: panelFolded && !panelMotion, folding: panelFolded && panelMotion, covered: coveredWorkspace, hint: picking || state.capturing });
  }, [canvasPage, panelFolded, panelMotion, coveredWorkspace, picking, state.capturing]);
  useLayoutEffect(() => {
    const root = document.documentElement;
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
    if (fullScreen) root.setAttribute("data-fullscreen", "");
    else root.removeAttribute("data-fullscreen");
  }), []);
  useEffect(() => {
    if (!sidebarFocus.current) return;
    sidebarFocus.current = false;
    // Every screen draws its own header; the shown one is outside the inert workspace or page.
    [...document.querySelectorAll<HTMLElement>(".shell-sidebar-toggle")].find(button => !button.closest("[inert]"))?.focus();
  }, [sidebarHidden]);
  // Chromium takes ⌘B as Bold in the contenteditable composer before the menu's key equivalent sees it, so the field hands
  // it to the sidebar. A handled key never reaches the menu, so this cannot toggle twice.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || event.key.toLowerCase() !== "b") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.isContentEditable || !target.closest("[data-chip-field]")) return;
      event.preventDefault();
      if (!live.current.modal) live.current.toggleSidebar();
    };
    // On the document, ahead of the field's own handlers in the capture phase; the window's keydown is the pages' Escape.
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
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
    // Hiding or showing the sidebar animates the shell's columns, so the measure above still sees the old start; the
    // end of the shell's own transition measures the final layout (the inspector's room depends on it).
    const settled = (event: Event) => { if (event.target === shellRoot.current) measure(); };
    // A transition cut short (its motion flag cleared by a late timer) ends with transitioncancel instead.
    window.addEventListener("transitionend", settled);
    window.addEventListener("transitioncancel", settled);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("transitionend", settled); window.removeEventListener("transitioncancel", settled); };
  // The sidebar's width and hiding move the canvas column's start, so either measures again.
  }, [shownSidebar, sidebarHidden]);
  // Written here rather than in the style prop: a drag previews its width on the same property (previewPanel), and this
  // runs only when the committed width changes, so a render during the drag does not undo the preview.
  useLayoutEffect(() => {
    const main = shellRoot.current;
    if (!main) return;
    main.style.setProperty("--doan-right-width", rightColumn);
  }, [rightColumn]);
  // The inspector's column the same way; the Overview has none.
  useLayoutEffect(() => {
    shellRoot.current?.style.setProperty("--doan-inspector-width", inspectorColumn);
  }, [inspectorColumn]);
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
  // The other worktree notice's Open (docs/design/canvas.md 'Terminal work in another worktree'): opens W's same canvas,
  // selecting W with one canvas visit. A pick on this canvas ends first.
  const onOpenSibling = (root: string) => {
    if (!state.open) return;
    controller.current?.cancelPick();
    openNotice({ root, path: state.open.canvas });
  };
  // The work capsule's Open while the agent waits for an answer: the panel shows the followed conversation, scrolled
  // to its request with focus on the first choice.
  const openRequest = (conversationId: string) => {
    const target = panelTargetRef.current;
    const list = target ? homeRun.current.listState(target.root) : null;
    const waiting = target && Array.isArray(list) ? list.find(c => c.conversationId === conversationId && c.phase === "waiting" && c.canvas && sameCanvas(c.canvas, target.canvas)) : undefined;
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
    else if (to) document.querySelector<HTMLElement>(to === "show" ? '.doan-canvas-head .doan-panel-show[data-panel-target="conversation"]' : ".doan-conv-panel .doan-panel-hide")?.focus();
  }, [rightPanel.open]);
  useEffect(() => {
    if (!panelMotion) return;
    const timer = setTimeout(() => setPanelMotion(false), 250);
    return () => clearTimeout(timer);
  }, [panelMotion, rightPanel.open]);
  // A drag shows its width on the grid directly and commits once at the end.
  const previewPanel = (width: number) => shellRoot.current?.style.setProperty("--doan-right-width", `${width}px`);
  const resizePanel = (width: number | undefined) => changePanel(previous => width === undefined ? { open: previous.open } : { ...previous, width });
  // Only the person opens the inspector; folding it hands focus to the button that undoes it.
  const foldInspector = (open: boolean) => {
    inspectorFocus.current = open ? "hide" : "show";
    setInspectorMotion(true);
    changeInspector(previous => ({ ...previous, open }));
  };
  function showBubbleInspector() {
    if (canvasPage && !overlaidRef.current && canvasPanels.inspectorFits && !inspectorPanel.open) foldInspector(true);
  }
  const previewInspector = (width: number) => shellRoot.current?.style.setProperty("--doan-inspector-width", `${width}px`);
  const resizeInspector = (width: number | undefined) => changeInspector(previous => width === undefined ? { open: previous.open } : { ...previous, width });
  useEffect(() => {
    const to = inspectorFocus.current;
    inspectorFocus.current = null;
    if (to) document.querySelector<HTMLElement>(to === "show" ? HEADER_SHOW_INSPECTOR : ".doan-insp-panel .doan-panel-hide")?.focus();
  }, [inspectorPanel.open]);
  // focusInInspector records that focus was in the column: it turns inert in the commit that hides it, so focus is already on
  // the page when an effect runs. Read when focus arrives, since the control may have been redrawn.
  const inspectorActivation = useRef<() => void>(() => {});
  const inspectorShowFocused = useRef<Element | null>(null);
  const focusInInspector = useRef(false);
  useEffect(() => {
    // focusin targets an element (focus on the page itself fires none).
    // The element menu is portalled out of the column, and it closes with it, so focus in it counts as in the inspector.
    const focusin = (event: FocusEvent) => {
      // A later destination in the background supersedes the pending hand-off. Once active, the platform's own
      // restore can move focus between the immediate hand-off and its deferred repeat.
      if (!document.hasFocus()) inspectorActivation.current();
      if (event.target !== inspectorShowFocused.current) inspectorShowFocused.current = null;
      focusInInspector.current = (event.target as Element | null)?.closest(".doan-insp-column, .doan-insp-menu") != null;
    };
    document.addEventListener("focusin", focusin);
    return () => document.removeEventListener("focusin", focusin);
  }, []);
  // A window narrowed under the inspector's minimum takes the column away; focus inside goes to Show inspector. Widening
  // again removes it, so focus on it goes on to Hide inspector.
  const inspectorWasShown = useRef(inspectorShown);
  // A hand-off made while the window is in the background is made again on activation (POSTMORTEM 2026-11-17): the
  // platform restores focus to the control it remembered, here one the column took away, and lands on Hide sidebar.
  useEffect(() => () => inspectorActivation.current(), []);
  const handInspectorFocus = (selector: string) => {
    const target = () => document.querySelector<HTMLElement>(selector);
    target()?.focus();
    inspectorActivation.current();
    inspectorActivation.current = refocusOnActivation(window, () => document.hasFocus(), () => {
      const element = target();
      if (element?.isConnected && document.activeElement !== element) element.focus();
    });
  };
  useLayoutEffect(() => {
    const was = inspectorWasShown.current;
    inspectorWasShown.current = inspectorShown;
    if (was === inspectorShown || inspectorFocus.current !== null) return;
    const active = document.activeElement;
    if (!inspectorShown) {
      // Still inside the column or its element menu (closing, it stays mounted for its exit animation), or already on
      // the page.
      const fell = active === null || active === document.body || (active instanceof HTMLElement && active.closest(".doan-insp-column, .doan-insp-menu") !== null);
      if (fell && focusInInspector.current) handInspectorFocus(HEADER_SHOW_INSPECTOR);
      return;
    }
    const show = inspectorShowFocused.current;
    inspectorShowFocused.current = null;
    if (show !== null && !show.isConnected && (active === null || active === document.body)) handInspectorFocus(".doan-insp-panel .doan-panel-hide");
  }, [inspectorShown]);
  useEffect(() => {
    if (!inspectorMotion) return;
    const timer = setTimeout(() => setInspectorMotion(false), 250);
    return () => clearTimeout(timer);
  }, [inspectorMotion, inspectorPanel.open]);
  const rendered = useMemo(() => state.open && state.layout ? { root: state.open.folder, path: state.open.canvas, frames: state.layout.frames } : undefined, [state.open?.folder, state.open?.canvas, state.layout]);
  // The inspector reads the selection the controller applied and published, never one only sent to the canvas.
  const openFolder = state.open?.folder, openPath = state.open?.canvas, appliedSelection = state.unlisted ? null : state.selection;
  const inspectorSelection = useMemo<InspectorSelection | null>(() => openFolder !== undefined && openPath !== undefined && appliedSelection !== null ? { canvas: { root: openFolder, path: openPath }, view: appliedSelection } : null,
    [openFolder, openPath, appliedSelection]);
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
  // The Overview's right panel: the root's project and canvas conversations, thumbnails asked for canvas rows only. Its
  // current row follows the conversation the main column shows, not the list read.
  const listed = overview ? run.listState(overview.path) : null;
  const canvasList: CanvasList = overview === null || listed === null ? [] : typeof listed === "string" ? listed
    : canvasConversationRows(listed, overview.kind === "list" ? overview.canvases : [], clock, run.seenPending());
  // Every viewer of a root in this window (the Overview list, the canvas panel's thread cards) shares its images.
  const thumbnailHub = useThumbnailHub(window.doan);
  const thumbs = useThumbnails(thumbnailHub, overview?.kind === "list" ? overview.path : null, typeof canvasList === "string" ? [] : canvasList.flatMap(item => item.kind === "canvas" && item.row ? [item.row] : []));
  const overviewShown = overview ? overviewRun.current!.view(overview.path) : null;
  // Fast turned itself off: that provider's Last used follows and the composer's held switch goes. Only here, as events
  // arrive: this channel never replays history, so a restart cannot undo a Fast turned on again (shouldTurnOffFast).
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
  // A command turn's boundary as its provider reported it in this run (main stores none).
  useEffect(() => window.doan.onConversationBoundary(signal => overviewRun.current!.store.boundary(signal)), []);
  // Every render follows a list change, so a waiting auto-off is tried again once a list may name its conversation.
  useEffect(() => { for (const [conversationId, seenAt] of fastOffPending.current) if (fastOffFor(conversationId, seenAt)) fastOffPending.current.delete(conversationId); });
  useEffect(() => window.doan.onConversationListChanged(({ root }) => homeRun.current.listChanged(root)), []);
  useEffect(() => {
    if (modal) { homeRun.current.modalChanged(true); return; }
    // Checked one task after the modal closes, so a move the close leads to lands first (POSTMORTEM 2026-10-23 'Draft
    // guards changed existing transition timing').
    const timer = setTimeout(() => homeRun.current.modalChanged(false), 0);
    return () => clearTimeout(timer);
  }, [modal]);
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
  // A project list main could not save is a Retry toast on any screen; Retry writes the list again (ARCHITECTURE §7).
  useEffect(() => window.doan.onFoldersSaveFailed(() => {
    const message = "Couldn’t save the project list. Doan may show the earlier list after it restarts.";
    live.current.toast.retry(message, "Retry", "Saving the project list.", "Retrying", async () => await window.doan.saveFoldersAgain() ? null : message);
  }), []);
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
  // The canvas page has no conversation strip. A problem or reading root keeps it over its overlay without Open
  // (ARCHITECTURE §7 'Problem overlay'); it follows the overlay, so a re-read under 300 ms does not flash it in.
  const stripShown = overlaid && shown && stripView(shown.state, { provider: shown.conversation.provider, project: projectLabel(shown.conversation.root), branch: null });
  const strip = shown && stripShown && <div className="strip-slot"><KeyedConversationStrip conversationId={shown.conversation.conversationId} provider={shown.conversation.provider} state={shown.state}
    view={stripShown}
    onEditOnHome={() => void run.editOnHome(shown.conversation.conversationId)}
    onDismiss={() => run.dismiss(shown.conversation.conversationId)} /></div>;
  const shellSlots = sidebarSlots(withTerminalSlots(run.slots(), work, entries), entries, shownCanvas);
  const sidebarId = (home: boolean) => home ? "doan-page-sidebar" : "doan-workspace-sidebar";
  const sidebar = (home: boolean) => sidebarHidden ? null : <ShellSidebar id={sidebarId(home)} cards={cards} projects={shellProjects} loaded={loadedRoot} canvas={state.shown ?? undefined} unlisted={state.unlisted} homeDirectory={homeDirectory} search={search} toggle={key => void toggleProject(key)} disclose={discloseProject} toggleGroup={toggleShellGroup} worktree={enter} open={(root, row, listed) => openSidebarCanvas(root, row, undefined, listed)} overview={showShellOverview} action={action} remove={removeProject}
    projectSettings={root => openProjectSettings(root)}
    canvasMenu={{ blocked: trashWorking, exporting: (root, path) => exporting.has(`${root}\n${path}`), exportCanvas, trash: openTrash }}
    home={home} homeCurrent={screen === "home"} goHome={() => live.current.home()} slots={shellSlots} highlight={highlight} locked={pageLocked} lockReason={lockReason} {...(onSettings ? { settings: { section: settings.section, select: selectSection, mcp: mcpShown !== false } } : {})}
    resize={{ width: shownSidebar, bounds: SIDEBAR_BOUNDS, preview: previewSidebar, onResize: width => { sidebarTouched.current = true; setSidebarSaved(width); } }}
    conversations={{ list: root => run.listState(root), shown: canvasRun.current!.showing()?.conversationId ?? null, seen: run.seenPending(), now: clock, folded: conversationsFolded,
      bare: sidebarSlots(withTerminalSlots(new Map(), work, entries), entries, shownCanvas), fold: folded => { conversationsFoldTouched.current = true; setConversationsFolded(folded); },
      open: openSidebarConversation, remove: openDelete }} />;
  // The Project Settings page sits under the Projects tab (page null) but leaves like the other pages.
  const anyPage = onPage || onSettings || onProjectSettings;
  const sidebarToggle = sidebarToggleView(sidebarHidden, shellSlots);
  const topBar = (overPage: boolean) => <TopBar sidebar={{ view: sidebarToggle, controls: sidebarHidden ? undefined : sidebarId(overPage), toggle: toggleSidebar }} back={anyPage || back !== null} forward={!anyPage && forward !== null} page={onPage ? "addProjects" : onSettings ? "settings" : null} locked={pageLocked} lockReason={lockReason} reasonId={overPage ? "page-lock-reason" : "workspace-lock-reason"} updateDisabled={pageLocked || modal}
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
    memory={composerMemory} working={run.workingRoots()} restore={run.restore} start={(request, last) => run.start(request, last).then(outcome => {
      // The new conversation's first message enters the Overview's thread.
      if ("ok" in outcome && outcome.conversationId) overviewRun.current?.store.markSent(outcome.conversationId, request.text, 0);
      return outcome;
    })} addProjects={openAddProjects}
    defaults={preferences ? preferences.preferences.newConversation : undefined} openSettings={openSettings} onRemember={rememberPick} buddy={buddySelection.shown} />}
  {onSettings && <SettingsPage header={topBar(true)} sidebar={sidebar(true)} section={settings.section} arrival={settings.arrival} onState={settingsReport}
    agents={{ signIn: agentSignIn(), preferences, save: savePreferences, project: settingsProject }} buddy={buddySelection}
    mcp={{ watch: mcpWatch.current, openAgents: provider => openSettings({ section: "agents", provider }) }} announcement={settingsAnnouncement} />}
  {onProjectSettings && <ProjectSettingsPage key={projectSettings.key} header={topBar(true)} sidebar={sidebar(true)} root={projectSettings.root} entries={entries} reroot={reroot}
    origin={page.origin} homeDirectory={homeDirectory} arrival={projectSettings.arrival} onState={projectSettingsReport} onGone={() => leavePage({ kind: "gone" })}
    onRerooted={projectSettingsRerooted} onAction={(name, root, notice) => void action(name, root, notice)}
    onRemove={() => void removeProject([projectSettings.root])} />}
  {onPage && <AddProjectsPage key={page.seq} header={topBar(true)} sidebar={sidebar(true)} projects={entries.map(entry => entry.path)} autoRegistered={autoRoots} homeDirectory={homeDirectory}
    mainCheckout={path => isMainCheckout(entries, path)} choose={page.chooseSeq} onState={pageReport} onCancel={() => leavePage({ kind: "cancel" })} onAdded={pageAdded} />}
  <main ref={shellRoot} className={`app-shell workspace${overlaid ? " overlaid" : ""}${strip ? " with-strip" : ""}`}
    style={{ visibility: screen !== "workspace" ? "hidden" : "visible" }}
    data-panel={canvasPage && !rightPanel.open && !inspectorShown ? "collapsed" : undefined} data-conv={canvasPage && !rightPanel.open ? "collapsed" : undefined} data-panel-motion={panelMotion || inspectorMotion ? "" : undefined}
    inert={screen !== "workspace"} aria-hidden={screen !== "workspace"}>
    {topBar(false)}
    {sidebar(false)}
    {strip}
    <CanvasPane navigation={card && loadedRoot ? { card, root: loadedRoot, homeDirectory, worktree: switchCanvasWorktree } : null}
      viewport={viewport} board={board} overlay={overlay} dragLayer={dragLayer} state={state} view={canvasView.current} command={command} covered={overview !== null || overlaid} overlaid={overlaid}
      zoomTo={scale => controller.current?.zoomTo(scale)} onToolbarEscape={event => controller.current?.toolbarEscape(event)} selectFrame={(index, id) => controller.current?.selectFrame(index, id)} conversation={{ open: rightPanel.open, show: showPanel, badge: panelBadge }}
      inspector={{ open: inspectorPanel.open, fits: canvasPanels.inspectorFits, show: () => foldInspector(true), focused: node => { inspectorShowFocused.current = node; } }}
      agent={{ list: state.open ? run.listState(state.open.folder) : undefined, shown: canvasRun.current!.showing()?.conversationId ?? null, canvas: workingCanvas(state.open, state.unlisted, entry), buddy: buddySelection.shown, running: screen === "workspace" && overview === null, work, entries,
        conversationWork, frames: state.layout?.frames ?? null, onWork: target => controller.current?.setWork(target),
        onOpen: openRequest, onOpenSibling }}
      picking={picking} capturing={state.capturing} tool={state.tool} onTool={chooseTool} picker={{ enabled: pickerReady, reason: pickerView.reason, onToggle: pickFromCanvas, button: pickerButton }} capture={capture} player={player} exporter={exporter} />
    {bubbleHost && <BubbleAdd host={bubbleHost} enabled={bubbleAddView.enabled} reason={bubbleAddView.reason} button={bubbleAddButton}
      items={bubbleItems({ play: false, inspectorOpen: inspectorPanel.open, inspectorFits: canvasPanels.inspectorFits })}
      inspectButton={bubbleInspectButton} focused={node => { inspectorShowFocused.current = node; }} onEscape={event => controller.current?.toolbarEscape(event)} />}
    {overview && <ProjectOverview key={overview.path} run={overviewRun.current!} support={support.current!} root={overview.path} project={projectLabel(overview.path)} entry={overview}
      worktrees={card?.rows ?? [overview]} homeDirectory={homeDirectory} notice={overviewNotice?.root === overview.path ? overviewNotice.text : null}
      unavailable={null}
      list={run.listState(overview.path)} seen={run.seenPending()} composerLink={overviewComposerLink}
      prefs={homeMemory} defaults={preferences ? preferences.preferences.newConversation : undefined} now={clock} onRemember={rememberPick}
      onWorktree={root => { chipFocus.current = true; showShellOverview(root); }} onOpenCanvas={(canvas, conversationId) => openConversationCanvas(overview.path, canvas, conversationId, { kind: "card" })}
      onReplyChip={link => replyChip(overview.path, link)} thumbnailHub={thumbnailHub}
      onRetryList={() => run.retryList(overview.path)} listRetry={run.listRetry(overview.path)} onStart={(request, last) => run.start(request, last, { stay: true })}
      onSendConversation={(provider, request) => run.send(overview.path, provider, request)}
      onAction={(name, root) => action(name, root)}
      onProjectSettings={root => openProjectSettings(root)}
      onSettings={target => openSettings(target)} onNotice={text => toast.show(text)} onDeleteConversation={openDelete} />}
    {overview && <ResizeHandle className="doan-overview-handle" label="Resize conversations" width={shownOverviewPanel} bounds={panelLimits} preview={previewPanel}
      onResize={width => { overviewTouched.current = true; setOverviewSaved(width); }} />}
    {overview ? <div className="right-stack" inert={overlaid}><CanvasConversations key={overview.path} list={canvasList} current={overviewShown?.kind === "conversation" ? overviewShown.conversationId : null}
      project={projectLabel(overview.path)} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible}
      open={item => openOverviewRow(overview.path, item)} retry={() => run.retryList(overview.path)} listRetry={run.listRetry(overview.path)}
      onDelete={(item, button, after) => openDelete({ conversationId: item.conversationId, root: overview.path, title: item.title, provider: item.provider, from: "canvasList", after }, button)} /></div>
      : <><InspectorColumn shown={inspectorShown} width={shownInspector} bounds={inspectorLimits} onHide={() => foldInspector(false)} onResize={resizeInspector} preview={previewInspector}
        selection={inspectorSelection} document={state.layout?.document ?? null} inspect={inspectCall} tree={elementTree} onNotice={text => toast.show(text)}
        onEscape={event => controller.current?.toolbarEscape(event)} />
      <ConversationPanel open={rightPanel.open} width={shownPanel} bounds={conversationLimits} onHide={() => { controller.current?.cancelPick(); foldPanel(false); }} onResize={resizePanel} preview={previewPanel}
        title={panelTarget && <CanvasConversationTitle run={canvasRun.current!} list={panelList} canvasName={panelCanvasName} now={clock} seen={run.seenPending()}
          title={panelTitle.title} current={panelTitle.current} onChoose={() => controller.current?.dropPendingLocate()} onDelete={openDelete} onPicked={() => queueMicrotask(() => document.querySelector<HTMLElement>(".doan-conv-panel .composer-input")?.focus())} />}>
        {panelTarget && entry?.kind === "list" && <CanvasConversation calls={window.doan} run={canvasRun.current!} support={support.current!} target={panelTarget} canvasName={panelCanvasName}
          project={panelProject} entry={entry} list={panelList} seen={run.seenPending()} prefs={homeMemory}
          defaults={preferences ? preferences.preferences.newConversation : undefined} now={clock} blocked={panelBlocked} onRemember={rememberPick}
          frames={state.layout?.frames} locateDisabled={state.status !== null || state.unlisted} arrival={arrival} onArrived={seq => setArrival(current => current?.seq === seq ? null : current)}
          onLocate={locateChip} onReplyChip={link => replyChip(panelTarget.root, link)} onChoose={() => controller.current?.dropPendingLocate()} pick={{ pressed: picking, enabled: pickerReady, reason: pickerView.reason, onToggle: togglePick }} composerLink={composerLink} canvasPress={controller.current?.canvasPress}
          onSettings={target => openSettings(target)} onNotice={text => toast.show(text)}
          onOpenHandoff={(canvas, id) => openConversationCanvas(panelTarget.root, canvas, id, { kind: "card" })}
          onOpenOverview={id => openOverviewConversation(panelTarget.root, id)}
          conversationListed={id => !Array.isArray(panelList) || panelList.some(c => c.conversationId === id)} work={work} thumbnailHub={thumbnailHub} />}
      </ConversationPanel></>}
    {/* Its own key space: the Overview beside it is keyed by the same root, and siblings sharing a key remount on every render. */}
    {problem && <ProblemOverlay key={`problem\n${loadedRoot}`} view={problem} details={detailsOpen} detail={detailText} pressed={retryPending ? "retry" : pressed && pressed.root === loadedRoot ? pressed.name : null}
      announcement={announcement ? `${announcement.text}${announcement.seq % 2 ? "" : "\u00a0"}` : ""} onAction={overlayAction} />}
  </main>
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} kept={projectKeepsLocal(allEntries, setup)} notGit={allEntries.some(entry => entry.path === setup && entry.kind === "uninitialized" && entry.notGit === true)} onClose={() => { pressEnded(setup, "setUp"); if (setupRef.current !== setup) return; setSetup(null); modalClosed(); }} onRerooted={(root, message) => { setHighlight([root]); toast.show(message); if (setupRef.current !== setup) return; choose(root); setSetup(null); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} conversations={conversationLists} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => { setQuickOpen(false); if (document.activeElement === document.body || !document.activeElement?.isConnected || document.activeElement.closest("dialog.qo")) modalClosed(); }} />}
  {run.removing && <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="project-remove-title" aria-describedby="project-remove-body" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); cancelRemove(); }}
    onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); cancelRemove(); } }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="project-remove-title">{run.removing.title}</h3><p className="doan-dialog-description" id="project-remove-body">{run.removing.body}</p></div></div>
    {run.removing.error && <p className="doan-notice error" role="alert" id="project-remove-error"><AlertIcon /><span className="selectable">{run.removing.error}</span></p>}
    <div className="doan-dialog-actions">{!run.removing.pending && <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus={!run.removing.error} onClick={cancelRemove}>{run.removing.cancel}</button>}
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-busy={run.removing.pending || undefined} aria-disabled={run.removing.pending || undefined}
        aria-describedby={run.removing.error ? "project-remove-error" : undefined} onClick={() => { modalClosed(); void run.confirmRemove(); }}>
        {run.removing.pending ? <><span className="doan-spinner" aria-hidden="true" />{run.removing.confirm}</> : run.removing.confirm}</button></div>
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
  {trashing && <CanvasTrashDialog view={trashDialogView(canvasStem(trashing.row.path), trashing.row.path, trashing.plan, trashHeld, trashing.move)} cancel={cancelTrash} confirm={confirmTrash} />}
  {toast.element}
  <PrototypeClosedFocus controller={controller} toolbar={playButton} />
  <PrototypePlaying onChange={setPlaying} />
  <StarPrompt onboarding={wizard !== null || buddyIntro.open} pickOrCapture={state.picking || state.capturing} restoreFocus={restoreFloatingFocus} />
  {wizard !== null && <Wizard key={wizard} session={wizard} projects={entries.map(entry => entry.path)} autoRegistered={autoRoots} homeDirectory={homeDirectory}
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

// On a page Back returns to where it was opened from; `locked` marks the tabs and Back unavailable while App ignores
// them. `updateDisabled` is the Settings menu item's rule, which the update button follows.
export function TopBar({ sidebar, back, forward, previous, next, page, locked, lockReason, reasonId, updateDisabled, addProjects, projects, settings, usage }: { sidebar: { view: SidebarToggleView; controls: string | undefined; toggle(): void }; back: boolean; forward: boolean; previous(): void; next(): void; page: "addProjects" | "settings" | null; locked: boolean; lockReason: string | null; reasonId: string; updateDisabled: boolean; addProjects(): void; projects(): void; settings(): void; usage: { openSettings(): boolean; canvasPress?: CanvasPress | undefined } }) {
  const unavailable = locked || undefined;
  const tab = (name: typeof page) => name === page ? { className: "current", "aria-current": "page" as const } : {};
  return <header className="top shell-top"><span className="traffic-space" aria-hidden="true" />
    <div className="shell-history">
      {/* Left of Back, so Back and Forward move one button right. */}
      <Tooltip><TooltipTrigger asChild><button className="doan-icon-button shell-sidebar-toggle" data-ui-placement="chrome" aria-label={sidebar.view.label} aria-expanded={sidebar.view.icon === "hide"}
        aria-controls={sidebar.controls} data-badge={sidebar.view.badge ? (sidebar.view.badge === "unseen" ? "unseen" : "true") : undefined} onClick={sidebar.toggle}>{sidebar.view.icon === "hide" ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}{sidebar.view.badge === "unseen" && <span className="badge-bubble" aria-hidden="true"><MessageCircle /></span>}</button></TooltipTrigger>
        <TooltipContent className="has-key">{sidebar.view.icon === "hide" ? "Hide sidebar" : "Show sidebar"}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘B</span></TooltipContent></Tooltip>
      {/* The end of the history is aria-disabled, not disabled: a Back or Forward pressed to it keeps focus. */}
      {/* While the page is locked Back gives the lock as its reason, in the tooltip and as its own description. */}
      <Tooltip><TooltipTrigger asChild><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" aria-disabled={unavailable ?? (!back || undefined)}
        aria-describedby={locked && lockReason ? reasonId : undefined} onClick={() => { if (back) previous(); }}><ArrowLeft aria-hidden="true" /></button></TooltipTrigger>
        <TooltipContent>{locked && lockReason ? lockReason : "Back"}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" aria-disabled={!forward || undefined} onClick={() => { if (forward) next(); }}><ArrowRight aria-hidden="true" /></button></TooltipTrigger>
        <TooltipContent>Forward</TooltipContent></Tooltip>
      {locked && lockReason && <span className="sr-only" id={reasonId}>{lockReason}</span>}</div>
    <div className="shell-modes"><button {...tab("addProjects")} aria-disabled={unavailable} onClick={addProjects}><Plus />Add Projects</button><button {...tab(null)} aria-disabled={unavailable} onClick={projects}><LayoutGrid />Projects</button><button {...tab("settings")} aria-disabled={unavailable} onClick={settings}><Settings />Settings</button></div>
    {/* The update button follows at the right end (docs/design/shell.md 'Agent usage'). */}
    <AgentUsageButton openSettings={usage.openSettings} canvasPress={usage.canvasPress} />
    <UpdateHeaderButton disabled={updateDisabled} canvasPress={usage.canvasPress} />
  </header>;
}

type AgentProps = { list: readonly ConversationSummary[] | "loading" | "error" | undefined; shown: string | null; canvas: WorkingCanvas | null; buddy: BuddyId; running: boolean; work: readonly WorkItem[]; entries: readonly FolderEntry[];
  conversationWork: readonly ConversationWork[]; frames: readonly CanvasFrameRect[] | null; onWork(target: CanvasWorkTarget | null): void; onOpen(conversationId: string): void; onOpenSibling(root: string): void };

function sendPlay(request: PlayRequest | null): void {
  if (request !== null) prototypeMainCalls().playPrototype(request);
}

// The canvas page's first Loading line waits LOADING_DELAY_MS, as the app's other first-load lines do, so a quick load
// never flashes it; its status region is drawn at once, so the line is read when it appears.
export function CanvasLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return slow ? <p><span className="doan-spinner" aria-hidden="true" />Loading</p> : null;
}

// The window draws one canvas pane, so the failure line's id is fixed.
const CANVAS_FAILED_ID = "doan-canvas-failed";

function CanvasPane({ navigation, viewport, board, overlay, dragLayer, state, view, command, covered, overlaid, zoomTo, onToolbarEscape, selectFrame, conversation, inspector, agent, picking, capturing, tool, onTool, picker, capture, player, exporter }: {
  navigation: CanvasHeaderNavigation | null; viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>; dragLayer: RefObject<HTMLDivElement | null>;
  // covered: the Overview or a problem's overlay is over the pane. overlaid: the overlay, which names the problem itself.
  state: CanvasState; view: CanvasViewStore; command: (name: ViewCommand) => void; covered: boolean; overlaid: boolean;
  zoomTo(scale: number): void; onToolbarEscape(event: KeyboardEvent): void; selectFrame(index: number, id: string): void; conversation: { open: boolean; show(): void; badge: CanvasSignal | null }; inspector: { open: boolean; fits: boolean; show(): void; focused(node: Element): void }; agent: AgentProps;
  picking: boolean; capturing: boolean; tool: CanvasState["tool"]; onTool(tool: CanvasState["tool"]): void; picker: PickerTool; capture: CaptureTool; player: PlayTool; exporter: ExportTool;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useControlFocusRecovery(panel, viewport, covered, view);
  const canvasKey = state.open ? JSON.stringify([state.open.folder, state.open.canvas]) : null;
  const [pressedRetry, setRetry] = useState(CANVAS_RETRY_IDLE);
  const retry = canvasRetrySettled(pressedRetry, canvasKey, state.status);
  if (retry !== pressedRetry) setRetry(retry);
  // Stays laid out under the Overview: opening a canvas fits it to this size at once.
  return <div className="doan-canvas-panel" ref={panel} inert={covered}>
    <CanvasHeader navigation={navigation} state={state} view={view} canvasKey={canvasKey} command={command} zoomTo={zoomTo} selectFrame={selectFrame} fallbackFocus={() => viewport.current?.focus()} panel={conversation} inspector={inspector} />
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
      {/* Through a reload its Retry started, the failure and the busy Retry stay; once the line goes, focus that was
          on the Retry goes to the canvas region (useControlFocusRecovery). */}
      {canvasFailedShown(retry, canvasKey, state.status) ? <div className="canvas-status-block"><AlertIcon size={20} /><h2 id={CANVAS_FAILED_ID}>{announcedAgain("Couldn’t load the canvas", retry.failures)}</h2><p>Run doan check in a terminal.</p>
          {retryButton({ running: retry.running, variant: "subtle", describedBy: CANVAS_FAILED_ID, onRetry: () => { setRetry(current => canvasRetryPressed(current, canvasKey)); command("reload"); } })}</div>
        : state.status === "loading" ? <CanvasLoading />
        : state.status === "noWidth" ? <p className="selectable"><b>Couldn’t read a valid board width.</b>{state.message.slice("Couldn’t read a valid board width.".length)}</p>
        : <p className="selectable">{state.message}</p>}
    </div>}
    {/* Picking is a mode the person turned on, so its hint sits by the tools, out of the agent notices' column, whose
       coming and going never moves it. */}
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
