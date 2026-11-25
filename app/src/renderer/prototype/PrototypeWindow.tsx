import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Popover } from "radix-ui";
import { ArrowLeft, ArrowRight, ChevronDown, CircleSlash, Download, Expand, FileWarning, MessageSquare, Proportions, RotateCw, SquareDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ExportReply } from "../../main/canvasExport";
import { PROTOTYPE_LOAD_TIMEOUT_MS, type ExportTarget, type GotoMessage, type PrototypeMode, type PrototypeSnapshot, type PrototypeView, type PrototypeWindowApi } from "../../main/prototype/ipc";
import { prototypePanelBounds, prototypeSideLayout, prototypeViewportBox, type Rect, type ViewportBox } from "../../main/prototype/fit";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { moveBetweenTools } from "../toolbarKeys";
import { currentRun, forwardedMessage, layersForSnapshot, layersForView, NO_LAYERS, type HostLayers } from "./host";
import { exportProgress, exportToast } from "../canvasRowMessages";
import { CONVERSATION_PANEL_ID, ConversationPanel } from "../ConversationPanel";
import type { PanelBounds } from "../rightPanelSize";
import type { ConversationButton } from "./conversation";
import { PrototypeConversationRun, type PrototypeConversationCalls } from "./conversationRun";
import { ColumnFocusGuard } from "./focusGuard";
import { PrototypeConversationPanel, PrototypeHeadMenu } from "./PrototypeConversation";
import { ConversationDeleteDialog, unsentDraft, type DeleteTarget } from "../ConversationDeleteDialog";
import { deleteAvailability, deleteDialogView, deleteRefusalText } from "../conversationDelete";
import { draftKey } from "../dockedRules";
import { applyBuddy } from "../buddyPaint";
import { dockedBuddy } from "../dockedBuddyShell";
import { useVisibleClock } from "../visibleClock";
import { useToast } from "../Toast";
import { CLOSE, covered, DETAILS, drawerGroups, drawerLabel, EMPTY_DRAWER, exportAvailability, FIRST_READ_SCENE, linkMove, liveText, LOADING_LABEL, modeTooltip, RETRY, stateScene, windowTitle, type SceneIcon } from "./view";
import { announcedAgain } from "../listRetry";
import { FrameListBody } from "../FrameListBody";
import { useHeaderNoDrag } from "../headerNoDrag";
import { useActivationFocus } from "../activationFocus";

// The prototype window (PRODUCT §3 Show, one frame). Every decision is main's; this window draws its view, hosts the run's sandboxed
// iframe, forwards the run's reports and shows its export's toasts.

export type PrototypeApi = PrototypeWindowApi & { onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void } & PrototypeConversationCalls;

// The reading line waits so a quick load does not flash it in, as the problem overlay's does.
const READING_DELAY_MS = 300;
const SCENE_HEADING_ID = "prototype-state-heading", SCENE_LINE_ID = "prototype-state-line";
// Export's sr-only reason while it is unavailable: Radix links the tooltip only while it is open.
const EXPORT_REASON_ID = "prototype-export-reason";
// As the canvas row's Export: a quick export shows only its result.
const EXPORT_PROGRESS_DELAY_MS = 1000;
// The empty drawer's sentence as the name button's description: focus stays on the button when that drawer opens.
const EMPTY_DRAWER_ID = "prototype-drawer-empty";
const ICONS: Record<SceneIcon, LucideIcon> = { read: FileWarning, init: TriangleAlert, frame: SquareDashed, support: CircleSlash };
const MODES: { mode: PrototypeMode; label: string; icon: LucideIcon }[] = [{ mode: "fit", label: "Fit", icon: Proportions }, { mode: "responsive", label: "Responsive", icon: Expand }];
// A pointer press on a header control keeps focus where it was (usually in the frame), so keys keep reaching the frame.
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();
const sameTarget = (a: ExportTarget, b: ExportTarget) => a.root === b.root && a.path === b.path && a.frame === b.frame;

// An export from the click to main's reply. `before`: where focus was at the click (Export after a key press; the frame
// or wherever it was after a pointer press, which never moves it), given back once if the save panel left it on the page.
interface ExportRun {
  target: ExportTarget;
  title: string;
  before: HTMLElement | null;
  timer?: ReturnType<typeof setTimeout>;
}

export function PrototypeWindow({ api }: { api: PrototypeApi }) {
  const [view, setView] = useState<PrototypeView | null>(null);
  // The first read's failure while no view came: whether its Retry runs (DESIGN 'Busy action'), and how many reads
  // failed, so a Retry that fails again has the live region read the same line again.
  const [readFailure, setReadFailure] = useState<{ running: boolean } | null>(null);
  const [readFailures, setReadFailures] = useState(0);
  const changed = useRef(false);
  const [layers, setLayers] = useState<HostLayers>(NO_LAYERS);
  const [readingGen, setReadingGen] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const [menuOpen, setMenuOpen] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const name = useRef<HTMLButtonElement>(null);
  // Whether focus was in the frame or on the page at the last primary press on Reload (null: no press since the last
  // click), and the gen a pointer Reload then left (null otherwise).
  const pressedInFrame = useRef<boolean | null>(null);
  const reloadFocus = useRef<number | null>(null);
  // A link move sent to main (the gen it left, the frame it asked for), and the gen whose ready run is announced.
  // A self link (a restart) is pending with no frame to announce.
  const moving = useRef<{ gen: number; frame: string | null } | null>(null);
  const [announced, setAnnounced] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  // The text of the export toast this window last showed: while it is the toast on screen, a link's toast waits.
  const exportToastShown = useRef<string | null>(null);
  const exportRun = useRef<ExportRun | null>(null);
  const toast = useToast(previous => {
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) previous?.focus();
  }, api.onWindowVisible);
  const toastRef = useRef(toast); toastRef.current = toast;
  // The conversation panel's host, connected before the view effect below reads anything (subscribe, then read).
  const [, setConversationTick] = useState(0);
  const conversation = useRef<PrototypeConversationRun | null>(null);
  if (conversation.current === null) conversation.current = new PrototypeConversationRun(api, {
    changed: () => setConversationTick(tick => tick + 1), notice: text => toastRef.current.show(text), focused: () => document.hasFocus(),
  });
  const run = conversation.current;
  useEffect(() => run.connect(), [run]);
  const clock = useVisibleClock(1000, api);
  const column = useRef<HTMLDivElement>(null);
  const convButton = useRef<HTMLButtonElement>(null);
  // The open state last asked of main, until main's view shows it: focus then goes to the composer or the button. Each press decides
  // from the view, not from this, so an unanswered request cannot turn the next press into the opposite.
  const panelAsked = useRef<boolean | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // The canvas page's fold motion, for this window's own toggle only: a drag must not animate, or the handle trails the
  // pointer, and a panel main opens or closes by itself just shows. Held as long as the canvas page holds it.
  const [panelMotion, setPanelMotion] = useState(false);
  const focusGuard = useRef<ColumnFocusGuard | null>(null);
  focusGuard.current ??= new ColumnFocusGuard(() => performance.now());

  // The header's rows follow the window's content width, which main's fit and capture use too.
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const readAgain = useRef(() => {});
  useEffect(() => {
    // A view main sends wins over any read's answer, the first one's or a Retry's.
    const read = () => void api.read().then(first => { if (changed.current) return; setReadFailure(null); setView(first); }, () => {
      if (changed.current) return;
      setReadFailures(count => count + 1);
      setReadFailure({ running: false });
    });
    const stop = api.onChanged(next => { changed.current = true; setReadFailure(null); setView(next); });
    readAgain.current = read;
    read();
    return stop;
  }, [api]);
  const retryRead = () => {
    if (readFailure === null || readFailure.running) return;
    setReadFailure({ running: true });
    readAgain.current();
  };

  useEffect(() => api.onSnapshot(({ gen, png, box }) => {
    const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
    setLayers(previous => {
      const next = layersForSnapshot(previous, { gen, url, box }, viewRef.current?.gen ?? null);
      if (next === previous) URL.revokeObjectURL(url);
      return next;
    });
  }), [api]);

  // Views drive the iframes; a still image that leaves the screen frees its blob.
  useLayoutEffect(() => { setLayers(previous => layersForView(previous, view)); }, [view]);
  const snapshotUrl = layers.snapshot?.url;
  useEffect(() => () => { if (snapshotUrl !== undefined) URL.revokeObjectURL(snapshotUrl); }, [snapshotUrl]);

  useEffect(() => { document.title = windowTitle(view); }, [view]);
  useEffect(() => { run.setView(view); }, [run, view]);
  useEffect(() => {
    const focusChanged = () => run.focusChanged();
    window.addEventListener("focus", focusChanged);
    window.addEventListener("blur", focusChanged);
    return () => { window.removeEventListener("focus", focusChanged); window.removeEventListener("blur", focusChanged); };
  }, [run]);

  // The panel: main's state, shown at the width main answered, cut to the handle's range for the window as it is now.
  const panelOpen = view?.panel.open ?? false;
  const panelBounds = prototypePanelBounds(width);
  const clampPanel = (value: number) => Math.min(panelBounds.max, Math.max(panelBounds.min, value));
  const panelWidth = clampPanel(dragWidth ?? view?.panel.width ?? panelBounds.default);
  const togglePanel = () => {
    const open = !panelOpen;
    if (open) run.unfoldTarget();
    panelAsked.current = open;
    setPanelMotion(true);
    void api.setPanel({ open });
  };
  // Opening focuses the composer, or the head's menu button before the first view; closing focuses the header's button, which has its
  // box again by this effect. A composer blocked while open keeps focus itself (readOnly).
  const headFallback = useRef(false);
  const composer = () => column.current?.querySelector<HTMLElement>(".composer-input") ?? null;
  const headTitle = () => column.current?.querySelector<HTMLElement>(".doan-conv-title .ov-title") ?? null;
  useEffect(() => {
    if (!panelOpen) headFallback.current = false;
    if (panelAsked.current !== panelOpen) return;
    panelAsked.current = null;
    if (!panelOpen) { convButton.current?.focus(); return; }
    const field = composer();
    if (field) { field.focus(); return; }
    headFallback.current = true;
    headTitle()?.focus();
  }, [panelOpen]);
  useEffect(() => {
    if (!panelMotion) return;
    const timer = setTimeout(() => setPanelMotion(false), 250);
    return () => clearTimeout(timer);
  }, [panelMotion, panelOpen]);
  // Once the first view brings the composer, focus left on the head's menu button moves to it, once; focus the person
  // put elsewhere meanwhile stays.
  useEffect(() => {
    if (!headFallback.current) return;
    const field = composer();
    if (!field) return;
    headFallback.current = false;
    const head = headTitle();
    if (head !== null && document.activeElement === head) field.focus();
  });
  // The column's docked buddy, its accent and the reasons it reads (docs/design/project.md 'Docked buddy').
  const buddy = run.settings()?.buddy;
  useEffect(() => {
    const node = column.current;
    if (!node || typeof matchMedia !== "function") return;
    dockedBuddy.start(node, () => 0, api);
    return () => dockedBuddy.stop();
  }, [api]);
  useLayoutEffect(() => {
    if (buddy === undefined) return;
    dockedBuddy.setBuddy(buddy);
    applyBuddy(document.documentElement, buddy);
  }, [buddy]);
  useLayoutEffect(() => { dockedBuddy.update({ overview: false, folded: !panelOpen, folding: false, covered: false, hint: false }); }, [panelOpen]);

  const gen = view?.gen ?? null;
  const phase = view?.phase ?? null;
  // The run whose reports count: its result while it loads, and its drawer list, which can come after it is ready.
  const runGen = currentRun(layers, gen)?.gen ?? null;
  const loadingRun = phase === "loading" ? runGen : null;

  // A followed link: a move arms the pointer Reload's focus return when focus was in the frame and names the frame it moves to for the live region.
  // The broken link's toast stays off an export's toast, which it would replace.
  const followLink = (message: GotoMessage) => {
    const current = viewRef.current;
    const shown = toastRef.current.toast?.message;
    const move = linkMove(current, message, shown !== undefined && shown === exportToastShown.current);
    if (move.kind === "drop" || current === null) return;
    if (move.kind === "toast") { toastRef.current.show(move.text); return; }
    // Main may hold the moved run's view behind its still of this one, so a second link can come while this run still
    // shows: main refuses it (its gen is old), and it must not replace the first move's focus return or announcement.
    if (moving.current?.gen !== current.gen) {
      const active = document.activeElement;
      if (active !== null && [...frames.current.values()].some(frame => frame === active)) reloadFocus.current = current.gen;
      moving.current = { gen: current.gen, frame: move.frame === current.frame ? null : move.frame };
    }
    void api.goto(message);
  };
  const followRef = useRef(followLink); followRef.current = followLink;
  // The first view after a move names the gen whose ready run is announced, if it is the frame the link moved to.
  useEffect(() => {
    const pending = moving.current;
    if (view === null || pending === null || view.gen <= pending.gen) return;
    moving.current = null;
    setAnnounced(pending.frame !== null && view.frame === pending.frame ? view.gen : null);
  }, [view]);

  // The host's own limit, from the moment the iframe's src is set to the run's result (PROTOTYPE_LOAD_TIMEOUT_MS).
  useEffect(() => {
    if (loadingRun === null) return;
    const timer = setTimeout(() => { void api.reportResult({ gen: loadingRun, state: "timeout" }); }, PROTOTYPE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [api, loadingRun]);

  useEffect(() => {
    if (runGen === null) return;
    const receive = (event: MessageEvent) => {
      const element = frames.current.get(runGen);
      const forward = forwardedMessage(event, element ? { gen: runGen, window: element.contentWindow } : null);
      if (forward === null) return;
      if (forward.kind === "result") void api.reportResult(forward.message);
      else if (forward.kind === "frames") void api.reportFrames(forward.message);
      else followRef.current(forward.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [api, runGen]);

  // The reading line and its announcement come 300 ms into a load.
  const loadingGen = phase === "loading" ? gen : null;
  useEffect(() => {
    if (loadingGen === null) return;
    const timer = setTimeout(() => setReadingGen(loadingGen), READING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loadingGen]);

  // A new state closes Details. Focus moves to a new scene's title only when it was inside the now-covered content or already fell to
  // the page; otherwise it stays and the live region speaks.
  const scene = view === null ? (readFailure === null ? null : FIRST_READ_SCENE) : stateScene(view);
  const sceneKey = scene === null ? null : view === null ? "first-read" : `${gen}\n${phase}`;
  const focusWasInside = useRef(false);
  const active = document.activeElement;
  focusWasInside.current = active === null || active === document.body || (!!content.current && content.current.contains(active));
  // A state can arrive with the window in the background, so the title takes focus again on activation while it is still the scene's.
  const handFocus = useActivationFocus();
  const currentScene = useRef(sceneKey); currentScene.current = sceneKey;
  useLayoutEffect(() => {
    setDetails(false);
    if (sceneKey === null || !focusWasInside.current) return;
    handFocus(() => { if (currentScene.current === sceneKey) heading.current?.focus({ preventScroll: true }); });
  }, [sceneKey, handFocus]);

  // A pointer Reload replaces the iframe, so focus that was in the frame falls to the page; the new run takes it back once ready unless
  // the person moved it. A failure or lost state forgets the press.
  const visibleGen = layers.visible;
  useEffect(() => {
    const pressed = reloadFocus.current;
    if (pressed === null || phase === null || phase === "loading") return;
    if (phase !== "ready") { reloadFocus.current = null; return; }
    if (visibleGen === null || visibleGen <= pressed) return;
    reloadFocus.current = null;
    // The run can be ready with the window in the background, so the frame takes focus again on activation.
    if (document.activeElement === document.body) handFocus(() => frames.current.get(visibleGen)?.focus());
  }, [phase, visibleGen, handFocus]);
  // A run reloaded while focus is in the conversation column gives focus back to it (focusGuard.ts): each new run's
  // iframe is armed by where focus is as it is created, until a second after that run is ready and shown.
  const knownFrames = useRef(new Set<number>());
  useLayoutEffect(() => {
    for (const frame of layers.frames) {
      if (knownFrames.current.has(frame.gen)) continue;
      knownFrames.current.add(frame.gen);
      const active = document.activeElement;
      focusGuard.current!.created(frame.gen, !!active && !!column.current?.contains(active));
    }
  }, [layers.frames]);
  useEffect(() => { if (phase === "ready" && visibleGen !== null) focusGuard.current!.shown(visibleGen); }, [phase, visibleGen]);
  // A focus that went into a cross-origin iframe shows only as a focusout with no relatedTarget; the iframe holds focus
  // one task later.
  const onColumnFocusOut = (event: { target: EventTarget | null; relatedTarget: EventTarget | null }) => {
    if (!(event.target instanceof HTMLElement) || !focusGuard.current!.left(event.target, event.relatedTarget)) return;
    setTimeout(() => focusGuard.current!.returnTo(document.activeElement, gen => frames.current.get(gen) ?? null)?.focus({ preventScroll: true }), 0);
  };
  const onReloadPress = () => {
    const active = document.activeElement;
    pressedInFrame.current = active === null || active === document.body || [...frames.current.values()].some(frame => frame === active);
  };
  // Only a pointer click arms the return: a press released off the button sends no click, and a key's click (detail 0)
  // after such a press must not inherit it.
  const onReloadClick = (pointer: boolean) => {
    if (gen === null) return;
    reloadFocus.current = pointer && pressedInFrame.current === true ? gen : null;
    pressedInFrame.current = null;
    void api.reload(gen);
  };

  // The save panel is a sheet of this window: focus that fell to the page while it was open goes back once, when main
  // reports the run or answers (POSTMORTEM 2026-11-03: never leave focus on the page body).
  const returnExportFocus = (run: ExportRun) => {
    const before = run.before;
    run.before = null;
    const active = document.activeElement;
    if (before !== null && (active === null || active === document.body) && before.isConnected) handFocus(() => { if (before.isConnected) before.focus({ preventScroll: true }); });
  };
  const showExportToast = (text: string, label?: string, action?: () => void) => {
    exportToastShown.current = text;
    toastRef.current.show(text, label, action);
  };
  useEffect(() => api.onExportRunning(target => {
    const run = exportRun.current;
    if (run === null || !sameTarget(run.target, target)) return;
    setExporting(true);
    returnExportFocus(run);
    clearTimeout(run.timer);
    run.timer = setTimeout(() => showExportToast(exportProgress(run.title)), EXPORT_PROGRESS_DELAY_MS);
  }), [api]);
  useEffect(() => () => clearTimeout(exportRun.current?.timer), []);
  // The frame and title at the click: main exports it only if it still plays, and the result names it even if another
  // frame plays by then.
  const onExport = () => {
    if (view === null || exportRun.current !== null) return;
    const active = document.activeElement;
    const run: ExportRun = { target: { root: view.root, path: view.path, frame: view.frame }, title: view.title, before: active instanceof HTMLElement ? active : null };
    exportRun.current = run;
    const done = (reply: ExportReply) => {
      clearTimeout(run.timer);
      if (exportRun.current === run) exportRun.current = null;
      setExporting(false);
      returnExportFocus(run);
      const result = exportToast(run.title, reply, true);
      if (result === null) return;
      const reveal = result.reveal;
      if (reveal !== undefined) showExportToast(result.text, "Show in Finder", () => { void api.revealExport(reveal).catch(console.error); });
      else showExportToast(result.text);
    };
    api.export(run.target).then(done, () => done({ kind: "failed", reason: "failed" }));
  };

  // Cancel, the delete and a refusal all return focus to the menu's button; the move waits for the render that closes the modal alert
  // (POSTMORTEM 2026-11-14), since the page behind it takes no focus.
  const [deleting, setDeleting] = useState<{ target: DeleteTarget; pending: boolean } | null>(null);
  // The delete alert is this window's modal: it holds the toast's clock as the main window's modals do (ARCHITECTURE §7 'Toasts').
  const modalOpen = deleting !== null;
  useLayoutEffect(() => { toastRef.current.setModal(modalOpen); }, [modalOpen]);
  const deleteReturn = useRef<HTMLElement | null>(null);
  const deleteLanding = useRef(false);
  useEffect(() => {
    if (!deleteLanding.current || deleting !== null) return;
    deleteLanding.current = false;
    const to = deleteReturn.current;
    deleteReturn.current = null;
    if (to !== null) handFocus(() => { if (to.isConnected) to.focus(); });
  });
  const openDelete = (target: DeleteTarget, trigger: HTMLElement | null) => {
    if (deleting !== null) return false;
    deleteReturn.current = trigger;
    setDeleting({ target, pending: false });
    return true;
  };
  const closeDelete = () => { deleteLanding.current = true; setDeleting(null); };
  const confirmDelete = async () => {
    if (deleting === null || deleting.pending) return;
    const { target } = deleting;
    setDeleting({ target, pending: true });
    const code = await run.deleteConversation(target.conversationId);
    closeDelete();
    if (code !== null) toastRef.current.show(deleteRefusalText(code, target.title));
  };
  const deleteDialog = (() => {
    if (deleting === null) return null;
    const { target, pending } = deleting, list = run.list();
    const summary = Array.isArray(list) ? list.find(c => c.conversationId === target.conversationId) : undefined;
    const draft = unsentDraft(run.store.drafts.get(draftKey({ kind: "existing", conversationId: target.conversationId, provider: target.provider }))) || summary?.returnedDraft === true;
    const availability = summary ? deleteAvailability(summary) : { available: true as const };
    // Not working with messages queued: they wait for the usage limit's reset, and go with the conversation.
    const queued = summary && !summary.working ? summary.queued : 0;
    return <ConversationDeleteDialog view={deleteDialogView(target.title, target.provider, draft, queued)} reason={availability.available ? null : availability.reason} pending={pending}
      cancel={closeDelete} confirm={() => void confirmDelete()} />;
  })();

  const readingShown = phase === "loading" && readingGen === gen;
  const live = view === null && readFailure !== null ? announcedAgain(`${FIRST_READ_SCENE.heading}. ${FIRST_READ_SCENE.body}`, readFailures - 1) : liveText(view, readingShown, view !== null && announced === view.gen);
  return <WindowShell view={view} layers={layers} readingShown={readingShown} details={details} live={live} readFailure={view === null ? readFailure : null} onReadRetry={retryRead}
    width={width} menuOpen={menuOpen} content={content} heading={heading} name={name} frames={frames.current}
    onBack={() => void api.back()} onForward={() => void api.forward()} onReload={() => { if (gen !== null) void api.reload(gen); }} onReloadPress={onReloadPress} onReloadClick={onReloadClick}
    onMode={mode => void api.setMode(mode)} onMenuOpen={setMenuOpen} exporting={exporting} onExport={onExport} toast={toast.element} dialog={deleteDialog}
    onChoose={frame => void api.choose(frame)} onClose={() => void api.close()} onDetails={() => setDetails(open => !open)}
    conversation={{ button: run.button(), open: panelOpen, motion: panelMotion, width: panelWidth, bounds: { min: panelBounds.min, max: panelBounds.max }, buttonRef: convButton, column,
      title: <PrototypeHeadMenu run={run} now={clock} onPicked={() => composer()?.focus()} onDelete={openDelete} />,
      body: <PrototypeConversationPanel run={run} calls={api} now={clock} onNotice={text => toastRef.current.show(text)} />,
      onToggle: togglePanel, preview: setDragWidth, onFocusOut: onColumnFocusOut,
      // The renderer cuts the width to the window's range; main fits the window, not the width.
      onResize: next => { setDragWidth(null); void api.setPanel({ open: true, width: next === undefined ? panelBounds.default : clampPanel(next) }); } }} />;
}

// The header's Show conversation, and the panel on the window's right at the width main answered (the drag's preview width during
// a drag), with its resize handle, its head and its body.
export interface ShellConversation {
  button: ConversationButton;
  open: boolean;
  // While the window's own toggle folds or unfolds the column.
  motion?: boolean;
  width: number;
  bounds: PanelBounds;
  title?: ReactNode;
  body?: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  column?: RefObject<HTMLDivElement | null>;
  onToggle(): void;
  onResize(width: number | undefined): void;
  preview(width: number): void;
  // A focusout inside the column (React's onBlur bubbles as focusout does), for the focus guard.
  onFocusOut?(event: { target: EventTarget | null; relatedTarget: EventTarget | null }): void;
}
const FOLDED: ShellConversation = { button: { label: "Show conversation", badge: null, name: "Show conversation" }, open: false, width: 0, bounds: { min: 0, max: 0 }, onToggle: () => {}, onResize: () => {}, preview: () => {} };

export interface ShellProps {
  view: PrototypeView | null;
  layers: HostLayers;
  readingShown: boolean;
  details: boolean;
  live: string;
  // The window's content width; with the panel's width it decides whether the name takes the header's second row.
  width: number;
  menuOpen: boolean;
  // From main's running event to its reply: Export is unavailable as "Exporting".
  exporting: boolean;
  // The toast host: one per window, at its bottom right, after everything else in the Tab order.
  toast?: ReactNode;
  // A modal alert the window shows (the head menu's Delete confirmation).
  dialog?: ReactNode;
  content?: RefObject<HTMLDivElement | null>;
  heading?: RefObject<HTMLHeadingElement | null>;
  name?: RefObject<HTMLButtonElement | null>;
  frames?: Map<number, HTMLIFrameElement>;
  conversation?: ShellConversation;
  // The first read failed and no view came yet: its scene with Retry, busy while the read runs again (onReadRetry).
  readFailure?: { running: boolean } | null;
  onReadRetry?(): void;
  // onReload: the failure scene's Retry. The header's Reload reports its primary press and whether a pointer clicked it,
  // so only a pointer Reload hands focus back to the new run.
  onBack(): void; onForward(): void; onReload(): void; onReloadPress(): void; onReloadClick(pointer: boolean): void; onMode(mode: PrototypeMode): void; onMenuOpen(open: boolean): void;
  onChoose(frame: string): void; onClose(): void; onDetails(): void; onExport(): void;
}

// Header controls, then the open conversation panel, come before the content in the Tab order, so a focus trap in the frame cannot
// keep them out of reach. Every control keeps one element tree in every state, so focus and the open frame menu survive.
export function WindowShell({ view, layers, readingShown, details, live, width, menuOpen, exporting, toast, dialog, content, heading, name, frames, conversation: conv = FOLDED, readFailure = null, onReadRetry, onBack, onForward, onReload, onReloadPress, onReloadClick, onMode, onMenuOpen, onChoose, onClose, onDetails, onExport }: ShellProps) {
  const firstRead = view === null && readFailure !== null;
  const scene = view === null ? (firstRead ? FIRST_READ_SCENE : null) : stateScene(view);
  const retrying = firstRead && readFailure.running;
  // Export's rule is the canvas toolbar's: disabled with no reason before the first view, otherwise aria-disabled with
  // its reason, so it keeps its Tab stop and stays the same element (and focus) through an export.
  const exportState = exportAvailability(view, exporting);
  const exportReason = exportState.available ? null : exportState.reason;
  const coveredNow = view !== null && covered(view.phase);
  // Radix gives an Esc to the top layer only, so a header tooltip over the open frame menu would leave the menu open;
  // the tooltip closes it as that Esc would have, and focus goes back to the name.
  const tipEscape = () => { if (!menuOpen) return; onMenuOpen(false); name?.current?.focus(); };
  // The open panel's width as a variable, so the grid and the stylesheet share one value.
  const columns: CSSProperties & Record<"--pw-panel", string> = { "--pw-panel": `${conv.width}px` };
  // The name's row from the header's own width, given rather than measured: the window's while the panel is closed, the
  // area left of it while open (main fits and captures by the same rule).
  const rows = prototypeSideLayout(width, conv.open ? conv.width : null).rows;
  return <div className={rows === 2 ? "pw name-row" : "pw"} {...(conv.open ? { "data-panel": "open", style: columns } : {})} data-panel-motion={conv.motion ? "" : undefined}>
    <header className="top shell-top pw-top">
      <span className="traffic-space" aria-hidden="true" />
      <div className="shell-history">
        {/* The end of the history is aria-disabled, not disabled: a Back or Forward pressed to it keeps focus. */}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" aria-disabled={!view?.canGoBack || undefined} onClick={() => { if (view?.canGoBack) onBack(); }}><ArrowLeft aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>Back</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" aria-disabled={!view?.canGoForward || undefined} onClick={() => { if (view?.canGoForward) onForward(); }}><ArrowRight aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>Forward</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Reload prototype" disabled={view === null} onMouseDown={event => { keepFocus(event); if (event.button === 0) onReloadPress(); }} onClick={event => onReloadClick(event.detail > 0)}><RotateCw aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>Reload prototype</TooltipContent></Tooltip>
      </div>
      {view !== null && <FrameMenu view={view} open={menuOpen} onOpenChange={onMenuOpen} trigger={name} onTipEscape={tipEscape} onChoose={onChoose} />}
      <div className="pw-right">
        <div className="doan-toggle-group" role="group" aria-label="Viewport" onKeyDown={moveBetweenTools}>
          {MODES.map(({ mode, label, icon: Icon }) => {
            const pressed = view?.mode === mode;
            return <Tooltip key={mode}><TooltipTrigger asChild>
              <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label={label} aria-pressed={pressed} tabIndex={pressed ? 0 : -1} disabled={view === null}
                onMouseDown={keepFocus} onClick={() => { if (!pressed) onMode(mode); }}><Icon aria-hidden="true" /></button>
            </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>{modeTooltip(mode, view?.run)}</TooltipContent></Tooltip>;
          })}
        </div>
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Export prototype" disabled={view === null}
            {...(exportReason !== null ? { "aria-disabled": true, "aria-describedby": EXPORT_REASON_ID } : {})}
            onMouseDown={keepFocus} onClick={() => { if (exportState.available) onExport(); }}><Download aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>{exportReason ?? "Export prototype"}</TooltipContent></Tooltip>
        {/* One element in every state (POSTMORTEM 2026-11-13). While the panel is open it is hidden, since Hide conversation is in the
           panel's head; its name carries the badges, as the dot alone does not tell an answer waiting from an unread ending. */}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button pw-conv" data-ui-placement="chrome" aria-label={conv.button.name} aria-expanded={false} aria-controls={CONVERSATION_PANEL_ID}
            data-badge={conv.button.badge === null ? undefined : conv.button.badge === "permission" ? "true" : conv.button.badge} ref={conv.buttonRef} hidden={conv.open}
            onMouseDown={keepFocus} onClick={conv.onToggle}>
            <MessageSquare aria-hidden="true" />
            {conv.button.badge === "working" && <span className="badge-working" aria-hidden="true"><span className="doan-spinner" /></span>}
          </button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>{conv.button.name}</TooltipContent></Tooltip>
      </div>
    </header>
    {exportReason !== null && <span className="sr-only" id={EXPORT_REASON_ID}>{exportReason}</span>}
    {/* Before the content panel in the DOM and the Tab order; the grid places it on the right. Folded, it stays in the
        DOM out of reach, so the button's aria-controls resolves. Esc does not fold it: only Hide conversation does. */}
    <ConversationPanel open={conv.open} width={conv.width} bounds={conv.bounds} onHide={conv.onToggle} onResize={conv.onResize} preview={conv.preview}
      title={conv.title} columnRef={conv.column} onBlur={conv.onFocusOut}>{conv.body}</ConversationPanel>
    <ContentPanel view={view} layers={layers} covered={coveredNow} content={content} frames={frames}>
      {view?.phase === "loading" && readingShown && <div className="problem-overlay reading doan-scroll"><p className="problem-reading"><span className="doan-spinner" aria-hidden="true" />{LOADING_LABEL}</p></div>}
      {scene !== null && <div className="problem-overlay doan-scroll">
        <div className="problem-scene" role="group" aria-labelledby={SCENE_HEADING_ID}>
          <SceneIcon icon={scene.icon} />
          <div className="ob-heading problem-heading">
            <h2 id={SCENE_HEADING_ID} ref={heading} tabIndex={-1} aria-describedby={SCENE_LINE_ID}>{scene.heading}</h2>
            <p id={SCENE_LINE_ID} className="selectable">{scene.body}</p>
          </div>
          <div className="problem-actions">
            {scene.failure && (firstRead
              ? <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" aria-disabled={retrying || undefined} aria-busy={retrying || undefined}
                onClick={() => { if (!retrying) onReadRetry?.(); }}>{retrying ? <><span className="doan-spinner" aria-hidden="true" />{RETRY}</> : RETRY}</button>
              : <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={onReload}>{RETRY}</button>)}
            {!firstRead && <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={onClose}>{CLOSE}</button>}
            {scene.failure && scene.detail !== undefined && <button type="button" className="doan-button ghost" data-ui-size="sm" aria-expanded={details} onClick={onDetails}>{DETAILS}{details ? " ▾" : " ▸"}</button>}
          </div>
          {scene.failure && details && scene.detail !== undefined && <pre className="problem-detail selectable">{scene.detail}</pre>}
        </div>
      </div>}
    </ContentPanel>
    {dialog}
    {toast}
    <p className="sr-only" role="status" aria-live="polite">{live}</p>
  </div>;
}

function SceneIcon({ icon }: { icon: SceneIcon }) {
  const Icon = ICONS[icon];
  return <Icon className="problem-icon" aria-hidden="true" />;
}

function clipStyle(rect: Rect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

// The run iframe at its viewport size, scaled from its top-left, inside a box of the whole-pixel visible size that
// main's capture takes too. Inline styles: the prototype page's CSP blocks injected style elements.
export function viewportStyles(box: ViewportBox) {
  return {
    clip: clipStyle({ x: box.x, y: box.y, width: box.visibleWidth, height: box.visibleHeight }),
    frame: { width: box.width, height: box.height, transform: `scale(${box.scale})` },
  };
}

// A new iframe per run; one loading stays hidden under the previous screen until ready, else main's still image shows. Inert while
// anything but a ready run shows. A mode change only restyles the same elements, so the run is never loaded again.
function ContentPanel({ view, layers, covered, content, frames, children }: { view: PrototypeView | null; layers: HostLayers; covered: boolean; content?: RefObject<HTMLDivElement | null> | undefined; frames?: Map<number, HTMLIFrameElement> | undefined; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const measure = () => setSize(previous => (previous.width === node.clientWidth && previous.height === node.clientHeight ? previous : { width: node.clientWidth, height: node.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const mode = view?.mode;
  return <div className="pw-panel" ref={panel}>
    <div className="pw-content" ref={content} inert={covered} data-mode={mode}>
      <div className="pw-stage">
        {layers.snapshot && layers.visible === null && <div className="pw-box" style={clipStyle(layers.snapshot.box)}><img className="pw-snapshot" src={layers.snapshot.url} alt="" /></div>}
        {layers.frames.map(frame => {
          const styles = viewportStyles(prototypeViewportBox(size, { width: frame.markWidth, height: frame.markHeight }, mode ?? "fit"));
          return <div key={frame.gen} className="pw-box" style={{ ...styles.clip, visibility: layers.visible === frame.gen ? "visible" : "hidden" }}>
            <iframe className="pw-frame" src={frame.url} sandbox="allow-scripts allow-forms" title={view?.title ?? "Prototype"}
              ref={node => { if (!frames) return; if (node) frames.set(frame.gen, node); else frames.delete(frame.gen); }} style={styles.frame} />
          </div>;
        })}
      </div>
    </div>
    {children}
  </div>;
}

// The frame name opens this canvas's marked frames in their link groups, with the whole title in the shared Tooltip only while cut.
// The shell holds the menu's open state, which its other header tooltips close on Esc too.
function FrameMenu({ view, open, onOpenChange, trigger: triggerRef, onTipEscape, onChoose }: { view: PrototypeView; open: boolean; onOpenChange(open: boolean): void; trigger?: RefObject<HTMLButtonElement | null> | undefined; onTipEscape(): void; onChoose(frame: string): void }) {
  const [cut, setCut] = useState(false);
  const [tip, setTip] = useState(false);
  const text = useRef<HTMLSpanElement>(null);
  const groups = drawerGroups(view);
  // The header is a drag region: an open menu holds it so a press on its empty part closes the menu.
  useHeaderNoDrag(open, text);

  useLayoutEffect(() => {
    const node = text.current;
    if (!node) return;
    // A name that fits closes the tooltip's own state too: masked by `cut` alone, a hover kept from before would open
    // it with nobody pointing once the name is cut short again.
    const measure = () => { const now = node.scrollWidth > node.clientWidth; setCut(now); if (!now) setTip(false); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view.title]);

  // With no marked frame the drawer holds a line of text, not a list: it is then a labelled dialog.
  const empty = groups.length === 0;
  const trigger = <button type="button" className="shell-search pw-name" ref={triggerRef} aria-haspopup={empty ? "dialog" : "listbox"}>
    <span className="pw-name-text" ref={text}>{view.title}</span><ChevronDown className="chev" aria-hidden="true" /></button>;
  return <><Popover.Root open={open} onOpenChange={onOpenChange}>
    <Tooltip open={tip} onOpenChange={next => setTip(next && cut)}><TooltipTrigger asChild><Popover.Trigger asChild {...(empty ? { "aria-describedby": EMPTY_DRAWER_ID } : {})}>{trigger}</Popover.Trigger></TooltipTrigger><TooltipContent onEscapeKeyDown={onTipEscape}>{view.title}</TooltipContent></Tooltip>
    <FrameListBody label={drawerLabel(view)} groups={groups} open={open} empty={EMPTY_DRAWER} className="doan-floating doan-menu doan-frame-list pw-drawer" align="center"
      onPick={row => { onOpenChange(false); onChoose(row.id); }} onClose={() => onOpenChange(false)} />
  </Popover.Root>{empty && <span className="sr-only" id={EMPTY_DRAWER_ID}>{EMPTY_DRAWER}</span>}</>;
}
