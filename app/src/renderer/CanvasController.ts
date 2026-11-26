import type { AnchorsMessage, PinGeometry, TargetCandidates, CanvasFrameRect, PickedMessage, PickStartedMessage, TextRangeMessage, TextHitMessage, ElementTreeAnchor, ElementTreeMessage } from "./canvasMessage";
import type { Anchor } from "../main/conversation/types";
import type { Selection } from "../formats/types";
import type { ViewCommand } from "../main/index";
import type { CanvasRow, FolderEntry } from "../main/view";
import { acceptCanvasMessage, type CanvasRect, type LayoutMessage, type SelectionMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, INITIAL_HEIGHT, layoutHeight, MAX_HEIGHT, sameDocument, TrashMarks, type OpenCanvas } from "./canvasView";
import { switchTarget } from "./switchTarget";
import { bubbleAction, type BubbleAction } from "./bubbleItems";
import { sizeBubblePlay } from "./prototypePlay";
import { focusThroughActivation } from "./activationFocus";
import { acceptSelectionMessage, anchorRequest, canvasPx, editableTarget, mainSelection, SELECTION_LOST, selectedFromLayout, selectionAfter, shouldGuardEscape, sizeLabel, type AnchorRequest, type SelectionTrigger, type SelectionView } from "./selection";
import { boardRectToScreen, boardToScreen, screenToBoard, elementView, FIRST_LAYOUT_TIMEOUT_MS, FIT_INSET, fitFrame, fitWidth, MAX_SCALE, MIN_SCALE, panBy, selectionView, wheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt, type Point, type View, type WheelInput } from "./viewport";
import { scaleFactor } from "./zoomControl";
import { currentFrame } from "./currentFrame";
import { pointAnchor, resolveChipTarget, targetAnchor } from "./canvasPicker";
import { escapeStep, overlayOpen as pageOverlayOpen, toolShortcut, type CanvasTool, type ToolShortcut } from "./canvasTool";
import { textCopy } from "./canvasTextCopy";
import { captureRect } from "./canvasCapture";
import type { Rect } from "./canvasPicker";
import { workFrameRect } from "./agentIndicator";
import { measureLines } from "./measure";
import { EMPTY_FOLLOW, followDecision, followedFrames, followStopped, markFollowed, type FollowMemory } from "./workFollow";

export const MEASURE_ANSWER_MS = 1000;
const REMEASURE_MS = 50;
// A later cursor reading may no longer be where the click was.
const CLICK_CURSOR_MS = 500;
// Without focusVisible: false the Canvas region draws its keyboard ring: the app never sees a click inside the
// iframe, so Chromium counts the focus as keyboard focus.
const CLICK_FOCUS: FocusOptions = { preventScroll: true, focusVisible: false };

export interface CanvasState {
  hasFrame: boolean;
  open: (OpenCanvas & { row: CanvasRow }) | null;
  shown: string | null;
  layout: LayoutMessage | null;
  selection: SelectionView | null;
  currentFrame: number | null;
  notice: string;
  status: "empty" | "loading" | "noWidth" | "failed" | "missing" | null;
  message: string;
  error: string;
  unlisted: boolean;
  zoom: number;
  // The exact scale behind the rounded `zoom`; the zoom controller's step limits read it.
  scale: number;
  // A pick runs ahead of it and leaves it as it was.
  tool: CanvasTool;
  picking: boolean;
  // Never with `picking`; like a pick it runs ahead of `tool` and leaves it as it was.
  capturing: boolean;
}

// Called with the area (window content CSS px) once capture mode ends; null takes no snapshot. The controller hides
// the marks, calls the snapshot two frames later and shows them again once it settles.
export type CaptureListener = (rect: Rect) => (() => Promise<unknown>) | null;

// `frames` is the layout the anchor was taken from, for the chip's name.
export type PickResult = { kind: "picked"; anchor: Anchor; frames: readonly CanvasFrameRect[] } | { kind: "cancelled" };
// "timeout" says nothing about the target, so the caller ends the locate without claiming the target is gone.
export type LocateResult = "shown" | "missing" | "timeout";

// `source` is the terminal session or conversation, `key` its work turn; `keys` are every work turn on the canvas.
export interface CanvasWork { source: string; key: string; frame?: string; waiting: boolean }
export interface CanvasWorkTarget { root: string; path: string; work: CanvasWork | null; keys: readonly string[] }
// The working-frame marker's slide to another frame (--time-settle).
const WORK_SLIDE_MS = 220;
// Defaults to the person, so a new route that moves the view stops following without anyone opting in. A viewport
// resize counts as the app's: it only re-places the view it has.
type ViewOrigin = "person" | "app";
const canvasKey = (root: string, path: string) => `${root}\0${path}`;

const POINT_RING = 12;
const LOCATE_ID = "locate";

export function initialCanvasState(): CanvasState {
  return { hasFrame: false, open: null, shown: null, layout: null, selection: null, currentFrame: null, notice: "", status: "empty", message: "Pick a canvas from the list", error: "", unlisted: false, zoom: 100, scale: 1, tool: "select", picking: false, capturing: false };
}

// Only the canvas header shows these, so App hands them over through a store instead of re-rendering the page.
export interface CanvasViewFields { zoom: number; scale: number; currentFrame: number | null }
const VIEW_KEYS = new Set<keyof CanvasState>(["zoom", "scale", "currentFrame"]);
export const canvasViewFields = (state: CanvasState): CanvasViewFields => ({ zoom: state.zoom, scale: state.scale, currentFrame: state.currentFrame });

// `publish` copies the state, so an unchanged field keeps its identity. A publish that changed nothing still counts.
export function viewOnlyChange(previous: CanvasState, next: CanvasState): boolean {
  const keys = Object.keys(next) as (keyof CanvasState)[];
  if (keys.some(key => !VIEW_KEYS.has(key) && previous[key] !== next[key])) return false;
  return [...VIEW_KEYS].some(key => previous[key] !== next[key]);
}

export class CanvasViewStore {
  private fields: CanvasViewFields;
  private readonly listeners = new Set<() => void>();
  constructor(fields: CanvasViewFields) { this.fields = fields; }
  readonly get = (): CanvasViewFields => this.fields;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  // `notify: false` when an App render follows that draws the header with the rest of the same publish.
  set(next: CanvasViewFields, notify = true): void {
    const now = this.fields;
    if (now.zoom === next.zoom && now.scale === next.scale && now.currentFrame === next.currentFrame) return;
    this.fields = next;
    if (notify) for (const listener of this.listeners) listener();
  }
}

// A view-only publish goes to the store's subscribers and App keeps its state (null). Any other goes to App, and the
// store takes its view fields silently, so the header never draws the new view over the old layout.
export function routeCanvasPublish(last: CanvasState, next: CanvasState, store: CanvasViewStore): CanvasState | null {
  const viewOnly = viewOnlyChange(last, next);
  store.set(canvasViewFields(next), viewOnly);
  return viewOnly ? null : next;
}

const isProblemKind = (kind: FolderEntry["kind"] | undefined): boolean =>
  kind === "notFound" || kind === "uninitialized" || kind === "error" || kind === "cliError";

export interface AnchorTarget { id: string; doanId?: string; selector?: string; frame?: string }
export type OpenTarget = { frame: string } | { element: string } | { anchor: Anchor };

// React owns the surrounding shell; only this controller owns the board's children.
export class CanvasController {
  private state = initialCanvasState();
  private entries: FolderEntry[] = [];
  private frame: HTMLIFrameElement | null = null;
  private frameHeight = INITIAL_HEIGHT;
  private frameWidth = 0;
  private view: View = { x: 0, y: 0, scale: 1 };
  private lastHref: string | null = null;
  private loading = false;
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private remeasureTimer: ReturnType<typeof setTimeout> | undefined;
  private jumpTo: number | null = null;
  // Held by identity: any other view (pan, zoom, jump, remembered view) replaces the object and so ends the wait for
  // settleFit without a refit.
  private firstFit: View | null = null;
  private pendingFrame: { id: string; index?: number; found?: (found: boolean) => void } | null = null;
  // Carries the root and canvas it was asked for: worktrees share canvas ids and paths, so only that canvas's first
  // layout takes it. A missing target ends silently.
  private pendingLocate: { folder: string; path: string; anchor: Anchor; located?: (result: LocateResult) => void } | null = null;
  private jumpRect: CanvasRect | null = null;
  private jumpKind: "rect" | "point" = "rect";
  private jumpMark: HTMLElement | null = null;
  private viewResize: ResizeObserver | null = null;
  private viewportLeft: number | null = null;
  private jumpTimer: ReturnType<typeof setTimeout> | undefined;
  private work: CanvasWorkTarget | null = null;
  private workMark: HTMLElement | null = null;
  // Null while hidden: a slide needs a frame to come from, and a reload keeps only a marker already shown.
  private workMarkFrame: string | null = null;
  private workSlideTimer: ReturnType<typeof setTimeout> | undefined;
  private workCanvas: string | null = null;
  // Kept across a pick with no work while a work turn is still on the canvas: the followed conversation's work can go a
  // moment before the board moves to another conversation, and that switch is still a change of source.
  private workSource: string | null = null;
  // Per canvas (root + path), renderer memory only.
  private followMemory = new Map<string, FollowMemory>();
  private lastPersonMove = Date.now();
  // Any new judgement replaces it.
  private followTimer: ReturnType<typeof setTimeout> | undefined;
  // `seq` orders the renderer's commands against the script's own clicks; each new document starts again at 0.
  private seq = 0;
  private hoverSeq = 0;
  // Set when a layout comes from a new document; that layout may return before the seq reset and the end of loading.
  private hoverResend = false;
  private selectedRect: CanvasRect | null = null;
  private hoverRect: CanvasRect | null = null;
  private treeHover: CanvasRect | null = null;
  // The element-tree channel has its own seq, apart from selection, hover and pick; only the latest answer counts.
  private treeSeq = 0;
  private treeAsked: { document: string; seq: number } | null = null;
  private treeListener: ((message: ElementTreeMessage) => void) | null = null;
  private altHeld = false;
  // Whether the canvas was told ⌘ is down, so the app losing focus can take it back (⌘Tab sends no keyup).
  private metaHeld = false;
  // The Escape a toolbar tooltip took, and whether anything after the tooltip handled it (toolbarEscape).
  private tooltipEscape: { event: KeyboardEvent; handledAfter: boolean } | null = null;
  private markHidden = false;
  private reanchor: AnchorRequest | null = null;
  private marks: { hover: HTMLElement; selected: HTMLElement; size: HTMLElement } | null = null;
  private measure: { layer: HTMLElement; lines: { line: HTMLElement; label: HTMLElement }[] } | null = null;
  private sentSelection = "null";
  private anchorDocument: string | null = null;
  private anchorGeneration = 0;
  private anchorRequest = 0;
  private anchorRevision = 0;
  private anchorTargets: ReadonlySet<string> = new Set();
  private anchors: { generation: number; candidates: ReadonlyMap<string, TargetCandidates>; rects: ReadonlyMap<string, PinGeometry> } | null = null;
  // The pick channel lives as long as one canvas document (`pickDocument`), not `anchorDocument`: a late load event
  // clears that, and a restarted channel would resend seq 1, which the script ignores, leaving clicks blocked.
  private pickDocument: string | null = null;
  private pickSeq = 0;
  private activePick: number | null = null;
  private pickAcked = false;
  private pickListener: ((result: PickResult) => void) | null = null;
  // Told after the later publish, so the listener sees the new state.
  private pickEnded: PickResult | null = null;
  // To tell the Frames drawer's reply from a click.
  private pickFrameCommand: { seq: number; id: string } | null = null;
  // A drawer pick made while the canvas loads, sent at its first layout unless the person acted since (intent).
  private pickAfterLoad: { id: string; intent: number } | null = null;
  private locating: { anchor: Anchor; generation: number; request: number; settled: (result: LocateResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  // The controller outlives the Overview and empty states, which rebuild `state`. A tool chosen mid-drag waits for its
  // end: lowering the layer first would drop the pointerup on the iframe, which selects.
  private tool: CanvasTool = "select";
  private toolChosen = false;
  private pendingTool: CanvasTool | null = null;
  private spaceHeld = false;
  // `asking`: Hand's plain press waiting for the canvas to say whether it is on text; `ended`: Esc ended it, moves do
  // nothing.
  private drag: { pointerId: number; x: number; y: number; mode: "pan" | "asking" | "text" | "ended"; probe: number; held: Point } | null = null;
  // Probes count for text-at and text-press together.
  private textProbe = 0;
  private hoverProbe = 0;
  private textHover = false;
  private hoverPoint: Point | null = null;
  private layerShown = false;
  // A drag that capture mode leaves early stays `dropped`: the layer stays up until that pointer's release, which would
  // otherwise land on the iframe as a selecting click (ARCHITECTURE §3 'Input').
  private captureLayer: HTMLElement | null = null;
  private marquee: HTMLElement | null = null;
  private captureShown = false;
  private captureDrag: { pointerId: number; start: Point; end: Point; dropped: boolean } | null = null;
  private captureListener: CaptureListener | null = null;
  // The root attribute stays until the last snapshot settles.
  private snapshots = 0;
  private snapshotFrames = new Set<number>();
  private canvasPage = true;
  // Open menus, lists, popovers and dialogs hold following off; their React owners live outside, so it reads the DOM.
  overlayOpen: () => boolean = () => pageOverlayOpen(document);
  // An older cursor reading does not move focus.
  private clickTag = 0;
  // The composer's preset lists: they close on a canvas press, which the app's document never sees.
  private pressListeners = new Set<() => void>();
  // `textEpoch` is the last clear-text sent to the current document; a range posted before that clear carries a
  // smaller one.
  private textRects: CanvasRect[] = [];
  private canvasText: string | null = null;
  private textDragging = false;
  private textEpoch = 0;
  // `message` waits for the OS cursor reading and applies only if it passes; `tag` makes a later check or a clear win
  // over an older reply.
  private textTrust: "none" | "dragging" | "held" = "none";
  private textCheck: { tag: number; asked: number; message: TextRangeMessage } | null = null;
  private textTag = 0;
  private textLayer: { layer: HTMLElement; rects: HTMLElement[] } | null = null;

  // A workspace open waiting for its folder's read goes ahead only while it is still the latest.
  private transitionIntent = 0;
  private transition(apply: () => void, valid: () => boolean = () => true): void {
    this.transitionIntent++;
    if (valid()) apply();
  }

  private resetAnchors(): void {
    // The located nodes mean nothing in the next document.
    this.endLocate();
    this.anchorGeneration++;
    this.anchorDocument = null;
    this.anchorRevision = 0;
    this.anchorTargets = new Set();
    this.anchors = null;
  }

  // The canvas answers again by itself when its layout, scroll or DOM changes. Returns the generation the reply's node
  // tokens belong to, or null before any layout.
  requestAnchors(targets: readonly AnchorTarget[]): number | null {
    this.anchorRequest++;
    this.anchorRevision = 0;
    this.anchors = null;
    this.anchorTargets = new Set(targets.map(target => target.id));
    if (!this.anchorDocument || !this.frame) return null;
    this.post({ type: "anchors-query", document: this.anchorDocument, generation: this.anchorGeneration, request: this.anchorRequest,
      targets: targets.map(target => ({ ...target })) });
    return this.anchorGeneration;
  }

  private onAnchors(message: AnchorsMessage): void {
    if (message.document !== this.anchorDocument || message.generation !== this.anchorGeneration ||
      message.request !== this.anchorRequest || message.revision <= this.anchorRevision || message.href !== this.lastHref ||
      message.viewport !== this.frameHeight || message.width !== this.frameWidth) return;
    if (message.results.length !== this.anchorTargets.size || message.results.some(result => !this.anchorTargets.has(result.id))) return;
    this.anchorRevision = message.revision;
    this.anchors = { generation: this.anchorGeneration, candidates: new Map(message.results.map(item => [item.id, item.candidates])),
      rects: new Map(message.rects.map(({ node, ...rect }) => [node, rect])) };
    const locating = this.locating;
    if (locating && locating.generation === this.anchorGeneration && locating.request === this.anchorRequest) {
      this.endLocate();
      this.settleLocate(locating, resolveChipTarget(locating.anchor, { candidates: this.anchors.candidates.get(LOCATE_ID) ?? {}, rects: this.anchors.rects }));
    }
  }

  // A newer locate or a new document drops one in flight without an answer. false: no shown document to ask. Never
  // changes the selection, main's selection or the composer.
  locate(anchor: Anchor, settled: (result: LocateResult) => void): boolean {
    this.endLocate();
    if (this.loading || this.state.status !== null || this.state.unlisted) return false;
    const frame = anchor.frame?.id ?? anchor.point?.frameId;
    const target: AnchorTarget = anchor.element
      ? { id: LOCATE_ID, ...(anchor.element.doanId === undefined ? {} : { doanId: anchor.element.doanId }),
        ...(anchor.element.selector === undefined ? {} : { selector: anchor.element.selector }) }
      : { id: LOCATE_ID, ...(frame === undefined ? {} : { frame }) };
    const generation = this.requestAnchors([target]);
    if (generation === null) return false;
    const timer = setTimeout(() => {
      const locating = this.locating;
      this.endLocate();
      locating?.settled("timeout");
    }, MEASURE_ANSWER_MS);
    this.locating = { anchor, generation, request: this.anchorRequest, settled, timer };
    return true;
  }

  private endLocate(): void {
    if (this.locating) clearTimeout(this.locating.timer);
    this.locating = null;
  }

  // Elements and points keep the scale and are centred; an element larger than the view is zoomed out to fit.
  private settleLocate(locating: NonNullable<CanvasController["locating"]>, target: ReturnType<typeof resolveChipTarget>): void {
    if (this.frame === null || (target.kind !== "node" && target.kind !== "point")) { locating.settled("missing"); return; }
    const size = this.viewportSize();
    if (target.kind === "point") {
      const spot = { x: target.x, y: target.y, width: 0, height: 0 };
      this.view = elementView(spot, size, FIT_INSET, this.view);
      this.showJump(spot, "point");
    } else {
      this.view = locating.anchor.element ? elementView(target.rect, size, FIT_INSET, this.view) : fitFrame(target.rect, size, FIT_INSET, this.view);
      this.showJump(target.rect);
    }
    this.applyView();
    locating.settled("shown");
  }

  constructor(
    private viewport: Pick<HTMLElement, "clientWidth" | "clientHeight" | "addEventListener" | "removeEventListener" | "getBoundingClientRect" | "focus">,
    private board: Pick<HTMLElement, "hidden" | "prepend"> & { style: Pick<CSSStyleDeclaration, "transform" | "visibility"> },
    private overlay: Pick<HTMLElement, "append">,
    private changed: (state: CanvasState) => void,
    private sendSelection: (selection: Selection | null) => void,
    // Over the board and the iframe, under the canvas chrome.
    private layer: Pick<HTMLElement, "hidden" | "dataset" | "addEventListener" | "removeEventListener" | "setPointerCapture" | "releasePointerCapture" | "hasPointerCapture" | "after">,
    // Window content coordinates; null when main cannot tell.
    private pointer: () => Promise<{ x: number; y: number } | null>,
  ) {
    if (typeof ResizeObserver !== "undefined" && "nodeType" in viewport) {
      this.viewResize = new ResizeObserver(this.viewportResized);
      this.viewResize.observe(viewport as unknown as Element);
    }
    window.addEventListener("message", this.receive);
    window.addEventListener("wheel", this.preventPageZoom, { passive: false });
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("pointermove", this.pointerOnApp, { capture: true });
    window.addEventListener("blur", this.appBlur);
    // `focus` in the capture phase reaches the window for every element, as focusin would.
    window.addEventListener("focus", this.focusMoved, true);
    window.addEventListener("input", this.typed, { capture: true });
    // Bubbling, so the composer's field and copyText, which copy on their own element or in the capture phase, go first.
    window.addEventListener("copy", this.copy);
    // selectionchange does not bubble from the document; the capture phase still passes the window.
    window.addEventListener("selectionchange", this.appSelection, { capture: true });
    viewport.addEventListener("click", this.clickOnMargin);
    viewport.addEventListener("wheel", this.wheelOnMargin, { passive: false });
    layer.hidden = true;
    layer.addEventListener("pointerdown", this.layerDown);
    layer.addEventListener("pointermove", this.layerMove);
    layer.addEventListener("pointerup", this.layerUp);
    layer.addEventListener("pointercancel", this.layerUp);
    layer.addEventListener("lostpointercapture", this.layerUp);
  }

  // An arrow property, so the page can hand it on as is.
  canvasPress = (listener: () => void): (() => void) => {
    this.pressListeners.add(listener);
    return () => { this.pressListeners.delete(listener); };
  };

  dispose(): void {
    this.dropBubbleReturn();
    this.bubbleActivation();
    clearTimeout(this.workSlideTimer);
    clearTimeout(this.followTimer);
    this.pickListener = null;
    this.pressListeners.clear();
    this.endLocate();
    this.viewResize?.disconnect();
    window.removeEventListener("message", this.receive);
    window.removeEventListener("wheel", this.preventPageZoom);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("pointermove", this.pointerOnApp, { capture: true });
    window.removeEventListener("blur", this.appBlur);
    window.removeEventListener("focus", this.focusMoved, true);
    window.removeEventListener("input", this.typed, { capture: true });
    window.removeEventListener("copy", this.copy);
    window.removeEventListener("selectionchange", this.appSelection, { capture: true });
    this.viewport.removeEventListener("click", this.clickOnMargin);
    this.viewport.removeEventListener("wheel", this.wheelOnMargin);
    this.layer.removeEventListener("pointerdown", this.layerDown);
    this.layer.removeEventListener("pointermove", this.layerMove);
    this.layer.removeEventListener("pointerup", this.layerUp);
    this.layer.removeEventListener("pointercancel", this.layerUp);
    this.layer.removeEventListener("lostpointercapture", this.layerUp);
    this.captureListener = null;
    if (this.captureLayer) {
      this.captureLayer.removeEventListener("pointerdown", this.captureDown);
      this.captureLayer.removeEventListener("pointermove", this.captureMove);
      this.captureLayer.removeEventListener("pointerup", this.captureUp);
      this.captureLayer.removeEventListener("pointercancel", this.captureDropped);
      this.captureLayer.removeEventListener("lostpointercapture", this.captureDropped);
    }
    for (const frame of this.snapshotFrames) cancelAnimationFrame(frame);
    this.snapshotFrames.clear();
    if (this.snapshots > 0) document.documentElement.removeAttribute("data-capture-snapshot");
    this.snapshots = 0;
    this.dropFrame();
  }

  private publish(): void {
    // First: a board that went away ends a drag, and the tool chosen during it applies now.
    this.syncLayer();
    this.state.tool = this.tool;
    this.state.hasFrame = this.frame !== null;
    // Play's judgement reads the tool, a pick, capture mode and the layout, which change without a selection change.
    if (this.marks !== null) this.placeSize(this.marks.size, this.markHidden ? null : this.selectedRect);
    this.drawWork();
    this.syncMain();
    this.changed({ ...this.state });
    const ended = this.pickEnded;
    this.pickEnded = null;
    if (ended) this.pickListener?.(ended);
  }

  // For `doan active`.
  private syncMain(): void {
    const open = this.state.open;
    const selection = open && this.state.selection ? mainSelection(open, this.state.selection) : null;
    const key = JSON.stringify(selection);
    if (key === this.sentSelection) return;
    this.sentSelection = key;
    this.sendSelection(selection);
  }

  private layoutDisplayKey(): string {
    const { layout, status, shown, unlisted } = this.state;
    // The prototype mark too: the drawer's caption and Play's availability show it.
    return JSON.stringify([layout?.frames.map(frame => [frame.id, frame.title, frame.prototype]), layout?.truncated, status, shown, unlisted]);
  }

  // `listed` is main's list before App hides rows: a hidden root keeps its remembered canvas, since a restart reads an
  // auto-registered worktree as `loading` and only then shows it.
  updateEntries(next: FolderEntry[], listed: readonly FolderEntry[] = next): void {
    this.applyEntries(next, listed);
    // After the open canvas followed this update, so the entered workspace starts from the new list.
    const waiting = this.waitingWorkspace;
    const kind = waiting && next.find(entry => entry.path === waiting.folder)?.kind;
    if (!waiting || kind === "loading") return;
    this.waitingWorkspace = null;
    if (waiting.intent === this.transitionIntent && waiting.settled(kind ?? undefined)) {
      this.transition(waiting.open, () => this.entries.find(entry => entry.path === waiting.folder)?.kind !== "loading");
    }
  }

  private applyEntries(next: FolderEntry[], listed: readonly FolderEntry[]): void {
    for (const root of this.workspaceMemory.keys()) {
      if (!listed.some(entry => entry.path === root)) this.workspaceMemory.delete(root);
    }
    const prev = this.entries;
    this.entries = next;
    const open = this.state.open;
    if (open === null) { this.trash.sweep(next); return; }
    const update = canvasViewUpdate(prev, next, open, this.trash);
    this.trash.sweep(next);
    // load() and dropFrame() apply the same effect again for reload and clear, so either path alone keeps the rule.
    this.applySelectionEffect(update);
    switch (update.kind) {
      case "reload":
        // Another canvas id at this path is another canvas: like opening one, it ends the pick and capture mode.
        if (update.idChanged) { this.endPick({ kind: "cancelled" }); this.endCaptureWithBoard(); }
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        this.load(update.canvas, false);
        break;
      case "moved": {
        const to = update.canvas.path;
        this.state.error = "";
        this.state.open = { folder: open.folder, canvas: to, row: update.canvas };
        this.state.shown = to;
        const remembered = this.workspaceMemory.get(open.folder);
        if (remembered?.path === open.canvas) remembered.path = to;
        if (this.pendingLocate?.folder === open.folder && this.pendingLocate.path === open.canvas) this.pendingLocate = { ...this.pendingLocate, path: to };
        // The view stays and the selection is asked for again.
        this.load(update.canvas, false);
        this.canvasMoved?.({ folder: open.folder, from: open.canvas, row: update.canvas });
        break;
      }
      case "resize":
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        if (update.canvas.width === undefined || this.frame === null) this.load(update.canvas, this.frame === null);
        else this.setFrameWidth(update.canvas.width);
        break;
      case "clear": {
        this.state.open = null;
        this.state.shown = null;
        this.state.error = "";
        this.dropFrame();
        if (update.reason === "missing" || update.reason === "duplicateId") this.canvasRemoved?.({ folder: open.folder, row: open.row, duplicates: update.reason === "duplicateId" ? update.count : null });
        this.state.status = update.reason === "closed" ? "empty" : "missing";
        this.state.message = update.reason === "closed" ? "Pick a canvas from the list"
          : update.reason === "notFound" || update.reason === "uninitialized" ? ""
          : `${open.canvas} is no longer in the list. It was deleted or moved.`;
        break;
      }
      // Keep the last rendered document while its folder cannot be read.
      case "errorLine": this.state.error = update.message; break;
      case "none": {
        const entry = next.find(entry => entry.path === open.folder);
        const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === open.canvas) : undefined;
        if (row) this.state.open = { ...open, row };
        break;
      }
    }
    this.publish();
  }

  private workspaceMemory = new Map<string, { path: string; view: View }>();
  // `duplicates`: how many rows now use its id, when that is why it was not followed.
  canvasRemoved: ((removed: { folder: string; row: CanvasRow; duplicates: number | null }) => void) | null = null;
  // A `trashed` clear calls neither canvasRemoved nor canvasMoved: App shows the Overview from `open: null` alone and
  // records no visit. Marks begin before `canvas:trash` is sent and settle with its reply.
  readonly trash = new TrashMarks();
  canvasMoved: ((move: { folder: string; from: string; row: CanvasRow }) => void) | null = null;
  // Pans do not publish state, so persistence listens here.
  viewChanged: (() => void) | null = null;
  linkedCanvas: ((root: string) => void) | null = null;
  // ⇧Space: App does what the toolbar's Play prototype would.
  playKey: (() => void) | null = null;
  // `onFocusLost`: the button had focus and the whole bubble is going away, so App can move focus to another visible
  // control first.
  bubblePlay: { onPlay(): void; onFocusLost(): void } | null = null;
  // The controller keeps the bubble's DOM and its press; App renders the button into `host` and owns its availability and
  // tooltip. `onAdd` fires on any press while the bubble shows (App checks availability).
  bubbleAdd: { host(element: HTMLElement): void; onAdd(): void; button(): HTMLElement | null; onFocusLost(): void } | null = null;
  bubbleInspect: { onInspect(): void; button(): HTMLElement | null; onFocusLost(): void; restoreFocus(): void } | null = null;
  // The host stays after the label as Play comes and goes, so its focused button stays mounted.
  private bubble: { play: HTMLButtonElement | null; label: HTMLElement; host: HTMLElement; playShown: boolean } | null = null;
  // Focus comes back to the same button once the selection is found again, unless focus left the holder meanwhile
  // (ARCHITECTURE §3, as `FocusIntent`).
  private bubbleReturn: { button: BubbleAction; holder: Element | null; moved: (event: FocusEvent) => void } | null = null;
  private bubbleActivation: () => void = () => {};
  // Counts the bubble's own focus moves, so App's toolbar hand-off can tell a return to the bubble from a bubble shown
  // again for another selection.
  private bubbleFocusMoves = 0;
  bubbleReturns(): number { return this.bubbleFocusMoves; }
  // For focus to come back to when the prototype window closes.
  bubblePlayButton(): HTMLButtonElement | null { return this.bubble?.playShown ? this.bubble.play : null; }
  currentView(): View { return { ...this.view }; }
  // Saved to and restored from `ui-state.json` (`lastByRoot`).
  memory(): Record<string, { canvas: string; view: View }> {
    return Object.fromEntries([...this.workspaceMemory].map(([root, item]) => [root, { canvas: item.path, view: { ...item.view } }]));
  }
  remember(root: string, item: { canvas: string; view: View } | null): void {
    if (item === null) this.workspaceMemory.delete(root);
    else this.workspaceMemory.set(root, { path: item.canvas, view: { ...item.view } });
  }
  private workspaceActive = true;
  setWorkspaceActive(active: boolean): void {
    const shown = this.onCanvasPage();
    this.workspaceActive = active;
    if (!shown && this.onCanvasPage()) this.enteredPage();
    if (!active) this.cancelWorkspaceOpen();
    if (!active) { this.releaseInput(); this.clearText(true); }
    if (!active && this.state.picking) { this.endPick({ kind: "cancelled" }); this.publish(); }
    if (!active) this.cancelCapture();
  }

  // Not Home, the Overview or a modal. V, H and Space act only there; capture mode ends when it goes.
  setCanvasPage(shown: boolean): void {
    const before = this.onCanvasPage();
    const changed = shown !== this.canvasPage;
    this.canvasPage = shown;
    if (!before && this.onCanvasPage()) this.enteredPage();
    if (!shown) { this.releaseInput(); this.cancelCapture(); this.clearText(true); }
    // An Option measurement hides under a modal and comes back when it closes.
    if (changed) this.drawMarks();
    if (changed && shown) this.refindHover();
  }

  private onCanvasPage(): boolean { return this.workspaceActive && this.canvasPage; }

  // No key reaches the canvas while focus sits in the problem overlay, Esc's selection clear included
  // (ARCHITECTURE §7 'Problem overlay').
  private covered = false;
  setCovered(covered: boolean): void {
    if (covered === this.covered) return;
    this.covered = covered;
    // The overlay took the hover away, so it is asked for again at the resting pointer.
    this.drawMarks();
    if (!covered) this.refindHover();
  }

  // While picking they cancel the pick first; V and H still change nothing then.
  setTool(tool: CanvasTool): void {
    this.cancelPick();
    this.cancelCapture();
    this.toolChosen = true;
    this.applyTool(tool);
  }

  // A tool the person chose before the read stays.
  restoreTool(tool: CanvasTool): void {
    if (!this.toolChosen) this.applyTool(tool);
  }

  private applyTool(tool: CanvasTool): void {
    if (this.drag !== null) { this.pendingTool = tool; return; }
    this.pendingTool = null;
    if (tool === this.tool) return;
    this.enterTool(tool);
    this.publish();
  }

  // Switching to Hand drops the selection; a held Space and a pick leave `tool` alone, so they keep it. Callers publish.
  private enterTool(tool: CanvasTool): void {
    const toHand = this.tool === "select" && tool === "hand";
    this.tool = tool;
    // The range stays: Hand drags and copies canvas text too.
    if (toHand) this.dropSelection();
  }

  // The clear raises the selection seq, so a select sent before it cannot bring the selection back, and the script
  // forgets the node its layouts would report again.
  private dropSelection(): void {
    if (!shouldGuardEscape(this.state.selection, this.reanchor)) return;
    this.transition(() => {
      this.sendCommand({ type: "clear" });
      this.clearSelection(false);
    });
  }

  destination(root: string): { root: string; canvas?: string } {
    return this.state.open?.folder === root ? { root, canvas: this.state.open.canvas } : { root };
  }

  cancelWorkspaceOpen(): void { this.waitingWorkspace = null; this.transitionIntent++; }

  // A project added a moment ago is still being read when its "Added" toast offers Open. Any later transition bumps
  // `transitionIntent` and so supersedes the wait.
  private waitingWorkspace: { folder: string; intent: number; open: () => void; settled: (kind: FolderEntry["kind"] | undefined) => boolean } | null = null;

  // A problem root enters the Overview too, which shows its overlay (ARCHITECTURE §7 'Memory'); a path that opens a
  // canvas still needs a list.
  openWorkspace(folder: string, entered: (folder: string) => void, sameCanvas = false, unavailable?: (entry: FolderEntry | undefined) => void, overview = false): void {
    const kind = () => this.entries.find(entry => entry.path === folder)?.kind;
    const enters = (kind: FolderEntry["kind"] | undefined) => kind === "list" || (overview && isProblemKind(kind));
    this.transition(() => {
      this.waitingWorkspace = null;
      const open = () => { if (enters(kind())) this.enterWorkspace(folder, entered, sameCanvas, overview); else unavailable?.(this.entries.find(entry => entry.path === folder)); };
      if (kind() === "loading") this.waitingWorkspace = { folder, intent: this.transitionIntent, open, settled: kind => enters(kind) || !!unavailable };
      else open();
    }, () => enters(kind()) || kind() === "loading" || !!unavailable);
  }

  private enterWorkspace(folder: string, entered: (folder: string) => void, sameCanvas: boolean, overview: boolean): void {
    const entry = this.entries.find(entry => entry.path === folder);
    if (!entry || (entry.kind !== "list" && !(overview && isProblemKind(entry.kind)))) return;
    const open = this.state.open;
    if (open) this.workspaceMemory.set(open.folder, { path: open.canvas, view: { ...this.view } });
    const remembered = this.workspaceMemory.get(folder);
    const row = overview || entry.kind !== "list" ? undefined : switchTarget(sameCanvas ? open?.row.id : undefined, entry.canvases, remembered?.path);
    if (row) {
      this.openCanvasNow(folder, row);
      if (remembered?.path === row.path) { this.view = { ...remembered.view }; this.applyView("app"); }
    } else {
      this.dropFrame();
      this.state = initialCanvasState();
      this.publish();
    }
    entered(folder);
  }

  showOverview(shown?: () => void): void {
    if (!this.state.open) { this.cancelWorkspaceOpen(); shown?.(); return; }
    this.transition(() => {
      const open = this.state.open;
      if (open) this.workspaceMemory.set(open.folder, { path: open.canvas, view: { ...this.view } });
      this.dropFrame();
      this.state = initialCanvasState();
      this.publish();
      shown?.();
    });
  }

  // A frame or element target replaces any earlier one still waiting for the first layout: the last request wins.
  openCanvas(folder: string, row: CanvasRow, to?: OpenTarget, target?: { keepView?: boolean; index?: number; found?: (found: boolean) => void; unavailable?: (entry: FolderEntry | undefined) => void; opened?: () => void; located?: (result: LocateResult) => void }): void {
    const frameId = to && "frame" in to ? to.frame : undefined;
    const element: Anchor | undefined = to && "element" in to ? { element: { doanId: to.element } } : to && "anchor" in to ? to.anchor : undefined;
    const located = target?.located ? { located: target.located } : {};
    if (this.state.open?.folder === folder && this.state.shown === row.path) {
      this.cancelWorkspaceOpen();
      target?.opened?.();
      if (frameId !== undefined) {
        this.pendingLocate = null;
        this.jumpTo = null;
        if (this.loading || (this.state.layout?.viewport === 0 && this.frameHeight > 0)) this.pendingFrame = { id: frameId, ...target };
        else {
          const frames = this.state.layout?.frames ?? [];
          const index = target?.index !== undefined && frames[target.index]?.id === frameId ? target.index : frames.findIndex(frame => frame.id === frameId);
          if (index >= 0) this.jump(index);
          target?.found?.(index >= 0);
        }
      }
      if (element !== undefined) {
        this.jumpTo = null;
        this.pendingFrame = null;
        this.pendingLocate = { folder, path: row.path, anchor: element, ...located };
        if (!this.loading) this.locatePending();
      }
      return;
    }
    const current = () => {
      const entry = this.entries.find(entry => entry.path === folder);
      return entry?.kind === "list" ? entry.canvases.find(candidate => candidate.path === row.path && candidate.id === row.id && candidate.url === row.url) : undefined;
    };
    this.transition(() => {
      const opening = current() ?? row;
      this.openCanvasNow(folder, opening, target?.keepView ? this.currentView() : undefined);
      this.pendingFrame = frameId === undefined ? null : { id: frameId, ...target };
      this.pendingLocate = element === undefined ? null : { folder, path: opening.path, anchor: element, ...located };
      if (this.state.status === "noWidth") { this.pendingFrame?.found?.(false); this.pendingFrame = null; this.pendingLocate = null; }
      target?.opened?.();
    }, () => {
      if (current() !== undefined) return true;
      target?.unavailable?.(this.entries.find(entry => entry.path === folder));
      return false;
    });
  }

  // A move the person made in the conversation panel before the canvas laid out drops the waiting reply chip element.
  dropPendingLocate(): void { this.pendingLocate = null; }

  private locatePending(): void {
    const pending = this.pendingLocate, open = this.state.open;
    this.pendingLocate = null;
    if (pending === null || open?.folder !== pending.folder || open.canvas !== pending.path) return;
    this.locate(pending.anchor, pending.located ?? (() => {}));
  }

  private openCanvasNow(folder: string, row: CanvasRow, view?: View): void {
    const previous = this.state.open;
    if (previous && previous.folder !== folder) this.workspaceMemory.set(previous.folder, { path: previous.canvas, view: { ...this.view } });
    this.state.open = { folder, canvas: row.path, row };
    this.state.shown = row.path;
    this.state.error = "";
    // Opening a canvas is the person's moment: following waits a full rest after it.
    this.lastPersonMove = Date.now();
    this.load(row, true, view);
  }

  // A new element ends the old document before resetting its measurement viewport.
  private load(row: CanvasRow, fresh: boolean, view?: View): void {
    this.stopDrag();
    this.spaceHeld = false;
    this.clearJump();
    // A reload of the same row before its first layout still owes the picked frame and element.
    if (fresh) { this.pendingFrame = null; this.pendingLocate = null; }
    // Opening a canvas ends the pick (dropFrame); a reload or a same-ID move keeps it for the new document's first layout.
    this.pickDocument = null;
    this.resetPickChannel();
    this.resetAnchors();
    this.textEpoch = 0;
    this.resetText();
    this.applySelectionEffect({ kind: fresh ? "otherCanvas" : "reload" });
    this.refindOnLoad = !fresh;
    if (row.width === undefined) {
      this.pendingFrame?.found?.(false);
      this.dropFrame();
      this.state.status = "noWidth";
      this.state.message = "Couldn’t read a valid board width. Run doan check in a terminal to diagnose the canvas.";
      this.publish();
      return;
    }
    const next = document.createElement("iframe");
    next.setAttribute("sandbox", "allow-scripts");
    // Tab walking into the canvas's own controls drew their focus rings and made Chromium scroll the canvas area,
    // carrying the floating tools out of view.
    next.tabIndex = -1;
    next.title = row.path;
    next.addEventListener("load", () => this.frameLoaded(next));
    // Only the URL supplied by main may become src; a canvas message is not authority.
    next.src = row.url;
    if (fresh || this.frame === null) {
      this.dropFrame();
      this.frame = next;
      this.board.prepend(next);
      this.board.hidden = false;
      this.board.style.visibility = "hidden";
      this.state.status = "loading";
      this.view = view ?? fitWidth(row.width, this.viewportSize(), FIT_INSET);
      this.firstFit = view ? null : this.view;
      this.applyView("app");
    } else {
      this.frame.replaceWith(next);
      this.frame = next;
      if (this.state.status === "failed") this.state.status = "loading";
    }
    this.setFrameWidth(row.width);
    this.setFrameHeight(INITIAL_HEIGHT);
    this.syncFrameInput();
    this.lastHref = null;
    this.jumpTo = null;
    this.seq = 0;
    this.pickFrameCommand = null;
    this.hoverSeq = 0;
    this.refindSeq = null;
    this.hoverRect = null;
    this.treeHover = null;
    this.treeAsked = null;
    this.drawMarks();
    this.state.unlisted = false;
    this.loading = true;
    clearTimeout(this.answerTimer);
    clearTimeout(this.remeasureTimer);
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (!this.loading || this.frame === null) return;
      this.jumpTo = null;
      this.board.style.visibility = "hidden";
      this.state.status = "failed";
      this.pendingFrame?.found?.(false);
      this.pendingFrame = null;
      this.pickAfterLoad = null;
      this.pendingLocate = null;
      this.applySelectionEffect({ kind: "loadFailed" });
      this.endPick({ kind: "cancelled" });
      this.publish();
    }, FIRST_LAYOUT_TIMEOUT_MS);
    this.publish();
  }

  private dropFrame(): void {
    clearTimeout(this.followTimer);
    this.stopDrag();
    this.spaceHeld = false;
    this.endPick({ kind: "cancelled" });
    this.endCaptureWithBoard();
    this.pickDocument = null;
    this.textEpoch = 0;
    this.resetText();
    this.clearJump();
    this.pendingFrame = null;
    this.pickAfterLoad = null;
    this.pendingLocate = null;
    this.state.currentFrame = null;
    this.resetAnchors();
    this.frame?.remove();
    this.frame = null;
    this.state.layout = null;
    this.lastHref = null;
    this.loading = false;
    this.jumpTo = null;
    this.hoverRect = null;
    this.treeHover = null;
    this.treeAsked = null;
    this.clearSelection(false);
    clearTimeout(this.loadTimer);
    clearTimeout(this.answerTimer);
    clearTimeout(this.remeasureTimer);
    this.board.hidden = true;
    this.state.unlisted = false;
  }

  private frameLoaded(target: HTMLIFrameElement): void {
    if (target !== this.frame || this.loading) return;
    this.resetAnchors();
    clearTimeout(this.answerTimer);
    this.answerTimer = setTimeout(() => {
      if (this.frame === null) return;
      this.state.layout = null;
      this.jumpTo = null;
      this.applySelectionEffect({ kind: "unlisted" });
      this.state.shown = null;
      this.state.unlisted = true;
      this.endPick({ kind: "cancelled" });
      this.publish();
    }, MEASURE_ANSWER_MS);
    // The sandbox has an opaque origin, so a concrete target origin cannot match it.
    target.contentWindow?.postMessage({ type: "measure" }, "*");
  }

  private receive = (event: MessageEvent): void => {
    if (this.frame === null) return;
    const message = acceptCanvasMessage(event, this.frame.contentWindow);
    if (message === null) return;
    if (message.type === "wheel") { this.wheel(message, boardToScreen(this.view, message)); return; }
    if (message.type === "layout") { this.onLayout(message); return; }
    if (message.type === "anchors") { this.onAnchors(message); return; }
    if (message.type === "picked") { this.receivePicked(message); return; }
    if (message.type === "pick-started") { this.receivePickStarted(message); return; }
    if (message.type === "press") { this.pressed(); return; }
    if (message.type === "activity") { this.personActive(false); return; }
    if (message.type === "text-range") { this.onTextRange(message); return; }
    if (message.type === "text-hit") { this.onTextHit(message); return; }
    if (message.type === "element-tree") { this.receiveElementTree(message); return; }
    this.onSelectionMessage(message);
  };

  private expectation() {
    return { href: this.lastHref, height: this.frameHeight, seq: this.seq };
  }

  private onSelectionMessage(message: SelectionMessage): void {
    // Hover/modifier traffic cannot invalidate an outstanding selection reply.
    const hover = message.type === "hover" || (message.type === "key" && message.key === "Alt");
    const expected = { ...this.expectation(), seq: hover ? this.hoverSeq : this.seq };
    const verdict = acceptSelectionMessage(expected, message);
    if (verdict === "drop") return;
    if (message.type === "key") {
      // An Escape the canvas sent before its pick-start arrived still meant the pick.
      if (message.key === "Escape") this.forwardEscape();
      // Only a canvas focused by an ⌥-click sends these. Space down counts only while the iframe has focus, so a canvas
      // cannot raise the layer over clicks by itself; its release always counts.
      else if (message.key === "Space") this.shortcut({ kind: "space", down: message.down }, !this.onCanvasPage() || document.activeElement !== this.frame);
      else if (message.key === "V" || message.key === "H") this.shortcut({ kind: "tool", tool: message.key === "V" ? "select" : "hand" }, !this.onCanvasPage());
      else if (message.key === "Shift2" || message.key === "ShiftSpace") this.shortcut({ kind: message.key === "Shift2" ? "zoomSelection" : "play" }, !this.onCanvasPage());
      // Unlike Escape, an old modifier snapshot must not override a newer press.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the key check narrows the message to its Alt variant, which TypeScript cannot do after the V/H branch
      else if (message.key === "Alt" && message.seq >= this.hoverSeq) {
        this.hoverSeq = message.seq;
        this.altHeld = message.alt;
        this.drawMarks();
      }
      return;
    }
    if (message.type === "hover") {
      // The answer to the app's own hover-at is not the person moving; later hovers at that seq are.
      const asked = message.seq === this.refindSeq;
      this.refindSeq = null;
      this.hoverSeq = message.seq; this.hoverRect = message.rect; this.drawMarks();
      if (!asked) this.personActive(false);
      return;
    }
    // A click's selection, not a command's answer: the person's, which stops following in a work turn.
    if (!this.commandReply(message)) { this.focusOnClick(); this.personActive(true); }
    this.seq = message.seq;
    if (message.type === "clear") { this.clearSelection(false); this.publish(); return; }
    if (message.target === null) { this.applySelectionEffect({ kind: "anchorLost" }); this.publish(); return; }
    const { rect, ...view } = message.target;
    this.reanchor = null;
    this.markHidden = false;
    this.selectedRect = verdict === "apply" ? rect : null;
    this.state.selection = view;
    this.state.notice = "";
    this.drawMarks();
    this.publish();
  }

  // A click takes a seq at least the renderer's, so it can take the seq of a command still on its way. A pick-frame
  // reply has no name, so it is the drawer's frame at that seq; of clears, only Esc's step past the outermost answers.
  private commandReply(message: Exclude<SelectionMessage, { type: "hover" | "key" }>): boolean {
    if (message.answer !== undefined) return true;
    if (message.type === "clear") return false;
    const asked = this.pickFrameCommand;
    return asked !== null && message.seq === asked.seq && message.target !== null && message.target.element === undefined && message.target.frame?.id === asked.id;
  }

  private applySelectionEffect(trigger: SelectionTrigger): void {
    if (this.state.selection === null && this.reanchor === null && trigger.kind !== "anchorLost") return;
    const effect = selectionAfter(trigger);
    if (!effect.keep) { this.clearSelection(effect.notice); return; }
    if (!effect.mark && this.state.selection !== null) {
      this.reanchor = anchorRequest(this.state.selection);
      this.markHidden = true;
      this.drawMarks();
    }
  }

  // Does not publish: callers publish once with their other changes.
  private clearSelection(notice: boolean): void {
    this.state.selection = null;
    this.selectedRect = null;
    this.reanchor = null;
    this.markHidden = false;
    this.state.notice = notice ? SELECTION_LOST : "";
    this.drawMarks();
  }

  private post(message: object): void {
    // The sandbox has an opaque origin, so a concrete target origin cannot match it.
    this.frame?.contentWindow?.postMessage(message, "*");
  }

  // Not to an iframe still loading, as for sendHoverCommand: the seq would run ahead of the new document's clicks.
  private sendCommand(message: object): void {
    if (this.loading) return;
    this.seq += 1;
    this.post({ ...message, seq: this.seq });
  }

  // Not to an iframe still loading: its script cannot hear it, and the hover seq would run ahead of the new document and
  // drop its hovers. The first layout sends what changed meanwhile (resendHover).
  private sendHoverCommand(message: object): void {
    if (this.loading) return;
    this.hoverSeq += 1;
    this.post({ ...message, seq: this.hoverSeq });
  }

  // Without a selection, Esc and a blank click still raise the intent, so the person's latest action cancels a
  // pending Open.
  private clearOnEscape(): void {
    if (!shouldGuardEscape(this.state.selection, this.reanchor)) { this.transitionIntent++; return; }
    this.transition(() => this.escapeNow());
  }

  // Only the canvas knows the frames around the selection, so it answers the step on the selection channel. A selection
  // a reload is still looking for has no node to step from yet, so Esc clears it.
  private stepOnEscape(): void {
    if (this.state.selection === null || this.reanchor !== null) { this.clearOnEscape(); return; }
    this.transition(() => {
      this.personActive(true);
      this.sendCommand({ type: "select-parent" });
    });
  }

  // The person's deselect, which stops following in a work turn.
  private escapeNow(): void {
    if (this.state.selection === null && this.reanchor === null) return;
    this.personActive(true);
    this.sendCommand({ type: "clear" });
    this.clearSelection(false);
    this.publish();
  }

  // The tree has its own channel, so no selection, hover or pick seq moves. False when no listed canvas has laid out.
  requestElementTree(): boolean {
    const document = this.pickDocument;
    if (document === null || this.frame === null || this.loading || this.state.unlisted) return false;
    this.treeSeq += 1;
    this.treeAsked = { document, seq: this.treeSeq };
    this.post({ type: "element-tree", document, seq: this.treeSeq });
    return true;
  }

  onElementTree(listener: (message: ElementTreeMessage) => void): () => void {
    this.treeListener = listener;
    return () => { if (this.treeListener === listener) this.treeListener = null; };
  }

  private receiveElementTree(message: ElementTreeMessage): void {
    const asked = this.treeAsked;
    if (asked === null || message.document !== asked.document || message.seq !== asked.seq || message.document !== this.pickDocument) return;
    this.treeListener?.(message);
  }

  // Iframe viewport px, as hover rects are; null takes it off and the canvas's own hover shows again.
  previewElement(rect: CanvasRect | null): void {
    if (this.treeHover === rect) return;
    this.treeHover = rect;
    this.drawMarks();
  }

  // Selected as a ⌘-click on that node would; the canvas answers on the selection channel like any select-anchor.
  selectElement(anchor: ElementTreeAnchor): void {
    if (this.frame === null || this.loading || this.state.unlisted) return;
    this.treeHover = null;
    this.transition(() => {
      this.personActive(true);
      this.sendCommand({ type: "select-anchor", ...anchor });
    });
  }

  onPicked(listener: (result: PickResult) => void): () => void {
    this.pickListener = listener;
    return () => { if (this.pickListener === listener) this.pickListener = null; };
  }

  // false: no canvas is shown. A reload in progress keeps the pick for the new document's first layout.
  pick(): boolean {
    if (this.frame === null || this.state.open === null || this.state.status !== null || this.state.unlisted) return false;
    if (this.state.picking) return true;
    // Ahead of pick-start, so the script lets go of the selection before picking.
    this.dropSelection();
    // Capture mode already cleared it, and its layer kept every press from the canvas since.
    if (!this.state.capturing) this.clearText(true);
    this.endCapture();
    this.state.picking = true;
    this.armPick();
    this.syncFrameInput();
    this.publish();
    return true;
  }

  cancelPick(): void {
    if (!this.state.picking) return;
    this.endPick({ kind: "cancelled" });
    this.publish();
  }

  // false: no board is drawn. A reload in progress keeps capture mode and the drag. A pick ends; the selection stays.
  startCapture(): boolean {
    if (this.state.open === null || !this.boardShown()) return false;
    if (this.state.capturing) return true;
    // The capture image shows no highlight. A pick in progress already cleared it.
    if (!this.state.picking) this.clearText(true);
    this.endPick({ kind: "cancelled" });
    this.makeCaptureLayer();
    this.state.capturing = true;
    this.publish();
    return true;
  }

  cancelCapture(): void {
    if (!this.state.capturing) return;
    this.endCapture();
    this.publish();
  }

  onCapture(listener: CaptureListener): () => void {
    this.captureListener = listener;
    return () => { if (this.captureListener === listener) this.captureListener = null; };
  }

  // Does not publish: callers do.
  private endCapture(): void {
    if (!this.state.capturing) return;
    this.state.capturing = false;
    if (this.captureDrag !== null) { this.captureDrag.dropped = true; this.drawMarquee(); }
  }

  // A drag on the board ends at once, as Hand's does.
  private endCaptureWithBoard(): void {
    this.stopCaptureDrag();
    this.endCapture();
  }

  // Under the canvas chrome, so Stop, Open, Reload and the tools row stay clickable, and the wheel still reaches
  // wheelOnMargin through `.area`.
  private makeCaptureLayer(): void {
    if (this.captureLayer !== null) return;
    const layer = document.createElement("div");
    layer.className = "capture-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.hidden = true;
    const marquee = document.createElement("div");
    marquee.className = "capture-marquee";
    marquee.hidden = true;
    layer.append(marquee);
    layer.addEventListener("pointerdown", this.captureDown);
    layer.addEventListener("pointermove", this.captureMove);
    layer.addEventListener("pointerup", this.captureUp);
    layer.addEventListener("pointercancel", this.captureDropped);
    layer.addEventListener("lostpointercapture", this.captureDropped);
    this.layer.after(layer);
    this.captureLayer = layer;
    this.marquee = marquee;
  }

  // The layer never takes focus, so focus stays where the person left it.
  private captureDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (event.button !== 0 || this.captureDrag !== null || !this.state.capturing || this.captureLayer === null) return;
    this.captureLayer.setPointerCapture(event.pointerId);
    const at = this.areaPoint(event);
    this.captureDrag = { pointerId: event.pointerId, start: at, end: at, dropped: false };
    this.drawMarquee();
  };

  // Screen px: a wheel pan during the drag moves the canvas under a fixed marquee.
  private captureMove = (event: PointerEvent): void => {
    const drag = this.captureDrag;
    if (drag === null || event.pointerId !== drag.pointerId || drag.dropped) return;
    drag.end = this.areaPoint(event);
    this.drawMarquee();
  };

  // The layer comes down only here, after the release it took. A click, a small area, a dropped drag or a document not
  // laid out yet takes nothing and capture mode goes on.
  private captureUp = (event: PointerEvent): void => {
    const drag = this.captureDrag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const area = drag.dropped || this.loading ? null : captureRect(drag.start, this.areaPoint(event), this.viewportSize());
    this.stopCaptureDrag();
    if (area === null) { this.syncLayer(); return; }
    const origin = this.viewport.getBoundingClientRect();
    const rect = { ...area, x: Math.round(area.x + origin.left), y: Math.round(area.y + origin.top) };
    this.endCapture();
    this.publish();
    this.snapshot(rect);
  };

  // The drag only; capture mode goes on.
  private captureDropped = (event: PointerEvent): void => {
    if (this.captureDrag === null || event.pointerId !== this.captureDrag.pointerId) return;
    this.stopCaptureDrag();
    this.syncLayer();
  };

  // Does not redraw the layers: callers do.
  private stopCaptureDrag(): void {
    const drag = this.captureDrag;
    if (drag === null) return;
    this.captureDrag = null;
    if (this.captureLayer?.hasPointerCapture(drag.pointerId)) this.captureLayer.releasePointerCapture(drag.pointerId);
    this.drawMarquee();
  }

  private drawMarquee(): void {
    if (this.marquee === null) return;
    const drag = this.captureDrag;
    const rect = drag === null || drag.dropped ? null : captureRect(drag.start, drag.end, this.viewportSize());
    this.marquee.hidden = rect === null;
    if (rect !== null) Object.assign(this.marquee.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  private areaPoint(event: PointerEvent): Point {
    const origin = this.viewport.getBoundingClientRect();
    return { x: event.clientX - origin.left, y: event.clientY - origin.top };
  }

  // The root attribute hides the marks by opacity, so nothing moves and focus stays. The second frame lets the hidden
  // paint reach the window before main reads its pixels.
  private snapshot(rect: Rect): void {
    const take = this.captureListener?.(rect) ?? null;
    if (take === null) return;
    if (this.snapshots++ === 0) document.documentElement.setAttribute("data-capture-snapshot", "");
    const first = requestAnimationFrame(() => {
      this.snapshotFrames.delete(first);
      const second = requestAnimationFrame(() => {
        this.snapshotFrames.delete(second);
        let shot: Promise<unknown>;
        try { shot = take(); } catch (error) { shot = Promise.reject(error); }
        void shot.then(() => {}, (error: unknown) => { console.error("canvas capture failed", error); }).then(() => this.snapshotSettled());
      });
      this.snapshotFrames.add(second);
    });
    this.snapshotFrames.add(first);
  }

  private snapshotSettled(): void {
    if (this.snapshots === 0) return;
    if (--this.snapshots === 0) document.documentElement.removeAttribute("data-capture-snapshot");
  }

  // The token keeps a command from reaching the document that replaces this one.
  private armPick(): void {
    if (this.loading || this.frame === null || this.pickDocument === null) return;
    this.pickSeq += 1;
    this.activePick = this.pickSeq;
    this.pickAcked = false;
    this.post({ type: "pick-start", document: this.pickDocument, seq: this.pickSeq });
    this.syncFrameInput();
  }

  // A new document starts its pick seq at 0 and is not picking, so it gets no cancel.
  private resetPickChannel(): void {
    this.activePick = null;
    this.pickSeq = 0;
    this.pickAcked = false;
    this.syncFrameInput();
  }

  // Off until the document acknowledges a pick, since a click there would still select; pans and zooms then land on
  // the board's margin handlers.
  private syncFrameInput(): void {
    if (this.frame) this.frame.style.pointerEvents = this.state.picking && !this.pickAcked ? "none" : "";
  }

  private receivePickStarted(message: PickStartedMessage): void {
    if (!this.state.picking || message.pick !== this.activePick || message.document !== this.pickDocument ||
      this.lastHref === null || !sameDocument(this.lastHref, message.href)) return;
    this.pickAcked = true;
    this.syncFrameInput();
  }

  // Does not publish: the listener hears the result after the caller's publish.
  private endPick(result: PickResult): void {
    if (!this.state.picking) return;
    this.state.picking = false;
    if (this.activePick !== null && this.pickDocument !== null) {
      this.pickSeq += 1;
      this.post({ type: "pick-cancel", document: this.pickDocument, seq: this.pickSeq });
    }
    this.activePick = null;
    this.pickAcked = false;
    this.syncFrameInput();
    this.pickEnded = result;
  }

  // A reply counts only for the pick-start in force in the current document; one from a replaced document carries
  // another token.
  private receivePicked(message: PickedMessage): void {
    if (!this.state.picking || this.activePick === null || message.pick !== this.activePick || message.document !== this.pickDocument ||
      this.lastHref === null || !sameDocument(this.lastHref, message.href)) return;
    if ("cancelled" in message) { this.cancelPick(); return; }
    // Only frames and what is in them can be chips; a forged or stray reply outside every frame keeps picking
    // (targetAnchor itself takes any named frame or element).
    if ("target" in message && !message.target.frame?.id) return;
    const frames = this.state.layout?.frames ?? [];
    const anchor = "target" in message ? targetAnchor(message.target) : pointAnchor(message.point, frames);
    if (anchor === null) return;
    this.endPick({ kind: "picked", anchor, frames });
    this.publish();
  }

  private keydown = (event: KeyboardEvent): void => {
    if (!this.workspaceActive || this.covered) return;
    if (event.key === "Alt") {
      // Focus may move into the canvas before keyup; fence off earlier snapshots.
      if (!this.altHeld) this.sendHoverCommand({ type: "hover-alt", alt: true });
      this.altHeld = true;
      this.drawMarks();
      return;
    }
    if (event.key === "Meta") {
      // Every press, not only a change: a release inside a focused canvas never reaches the app.
      if (!event.repeat) this.setMeta(true);
      return;
    }
    const shortcut = toolShortcut(event, { canvasPage: this.canvasPage });
    if (shortcut !== null) { if (this.shortcut(shortcut, false)) event.preventDefault(); return; }
    // A held Space's repeats keep its default (scrolling, pressing) off too.
    if (event.code === "Space" && event.repeat && this.spaceHeld) { event.preventDefault(); return; }
    const tooltipOnly = this.tooltipEscape?.event === event && !this.tooltipEscape.handledAfter;
    this.tooltipEscape = null;
    if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || (event.defaultPrevented && !tooltipOnly)) return;
    // Esc while picking cancels only the pick, wherever focus is. Menus and the `/` list handle their Esc first.
    const step = this.escape(editableTarget(event.target), event.repeat);
    if (step === "cancelPick" || step === "cancelCapture" || step === "selectTool" || step === "clearText") event.preventDefault();
  };

  // A toolbar tooltip takes Escape at the capture phase and Radix prevents it right after this call, so keydown would
  // skip it (ARCHITECTURE §3 'Actions and focus'); Radix's prevention is its first call, a later one is someone else's.
  toolbarEscape(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const mark = { event, handledAfter: false };
    const prevent = event.preventDefault.bind(event);
    let tooltip = true;
    event.preventDefault = () => { if (tooltip) tooltip = false; else mark.handledAfter = true; prevent(); };
    this.tooltipEscape = mark;
  }

  // A focused canvas's Escape never reaches the app's document, where Radix's layers listen, so it is replayed there
  // as the key itself would arrive.
  private forwardEscape(): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }

  // A held Esc's auto-repeat takes no Select step, so one press steps back one level instead of walking all the way out.
  private escape(editable: boolean, repeat = false): ReturnType<typeof escapeStep> {
    // Esc during Hand's text drag ends it and clears the range, as in Select, before it turns Hand off.
    if (this.drag?.mode === "text" && !editable && !this.state.picking && !this.state.capturing) {
      this.drag.mode = "ended";
      this.clearText(true);
      this.syncLayer();
      return "clearText";
    }
    const step = escapeStep({ picking: this.state.picking, capturing: this.state.capturing, hand: this.canvasPage && (this.pendingTool ?? this.tool) === "hand", editable, canvasText: this.hasText() });
    if (step === "cancelPick") this.cancelPick();
    else if (step === "cancelCapture") this.cancelCapture();
    else if (step === "selectTool") { this.toolChosen = true; this.applyTool("select"); }
    else if (step === "clearText") this.clearText();
    else if (step === "stepSelection" && !repeat) this.stepOnEscape();
    return step;
  }

  // A pick and capture mode run ahead of the tool, so they take neither. Returns whether the key was the canvas's.
  private shortcut(shortcut: ToolShortcut, ignored: boolean): boolean {
    if (shortcut.kind === "space" && !shortcut.down) {
      const held = this.spaceHeld;
      this.spaceHeld = false;
      this.syncLayer();
      return held;
    }
    if (ignored || this.state.picking || this.state.capturing) return false;
    // The key is still the canvas's, so nothing else acts on it.
    if (this.textDragging) return true;
    if (shortcut.kind === "tool") { this.toolChosen = true; this.applyTool(shortcut.tool); return true; }
    if (shortcut.kind === "zoomSelection") return this.zoomToSelection();
    if (shortcut.kind === "play") { this.playKey?.(); return true; }
    // A Space held from here does not pan the board that comes later.
    if (!this.boardDrawn()) return false;
    this.spaceHeld = true;
    this.syncLayer();
    return true;
  }

  private keyup = (event: KeyboardEvent): void => {
    const shortcut = toolShortcut(event, { canvasPage: this.canvasPage });
    if (shortcut !== null) { if (this.shortcut(shortcut, false)) event.preventDefault(); return; }
    if (event.key === "Meta") { this.setMeta(false); return; }
    if (event.key !== "Alt") return;
    this.altHeld = false;
    this.sendHoverCommand({ type: "hover-alt", alt: false });
    this.drawMarks();
  };

  // The hover channel: ⌘ changes only what the canvas's hover shows, never a selection command's seq.
  private setMeta(down: boolean): void {
    this.metaHeld = down;
    this.sendHoverCommand({ type: "hover-meta", meta: down });
  }

  // The window's blur also fires when focus moves into the canvas iframe; only the app losing focus releases Space.
  private appBlur = (): void => {
    if (document.hasFocus()) return;
    this.releaseInput();
    if (this.metaHeld) this.setMeta(false);
    // Option released in another app never comes back as a keyup either.
    if (this.altHeld) {
      this.altHeld = false;
      this.sendHoverCommand({ type: "hover-alt", alt: false });
      this.drawMarks();
    }
  };

  // The app hears no pointer move over the canvas iframe, so to show a hover again at a resting pointer it sends main's
  // OS cursor point (hover-at) and the canvas finds what is under it.
  private refindOnLoad = false;
  private refindSeq: number | null = null;
  private refindHover(): void {
    if (this.hoverRect !== null || this.loading || this.frame === null) return;
    const frame = this.frame;
    this.pointer().then(point => {
      if (point === null || frame !== this.frame || this.hoverRect !== null || this.loading || !this.onCanvasPage() || this.covered) return;
      if (this.layerShown || this.captureShown || this.textDragging || this.overlayOpen()) return;
      const area = this.viewport.getBoundingClientRect();
      if (point.x < area.left || point.x >= area.right || point.y < area.top || point.y >= area.bottom) return;
      if (document.elementFromPoint(point.x, point.y) !== frame) return;
      const at = screenToBoard(this.view, { x: point.x - area.left, y: point.y - area.top });
      this.sendHoverCommand({ type: "hover-at", x: at.x, y: at.y });
      this.refindSeq = this.hoverSeq;
    }, (error: unknown) => { console.error("pointer:get failed", error); });
  }

  // Focus moving is the only sign here that a menu or popover opened or closed.
  private focusMoved = (): void => {
    if (this.altHeld) this.drawMarks();
  };

  // stopDrag drops the drag before the lost capture reaches layerUp, so the canvas's drag is released here.
  private releaseInput(): void {
    this.spaceHeld = false;
    this.stopCaptureDrag();
    if (this.drag?.mode === "asking" || this.drag?.mode === "text") this.post({ type: "text-release", epoch: this.textEpoch });
    this.finishDrag();
  }

  private pointerOnApp = (event: PointerEvent): void => {
    this.altHeld = event.altKey;
    // ⌘ released inside a focused canvas never reaches the app as a keyup; a stale one would be resent to every reload.
    this.metaHeld = event.metaKey;
    // Over the canvas itself the move arrives as its hover message.
    if (Object.is(event.target, this.viewport) || Object.is(event.target, this.layer)) this.personActive(false);
    // OOPIFs do not reliably receive pointerout when the pointer enters the app.
    if (event.target !== this.frame && this.hoverRect !== null) {
      this.hoverRect = null;
      this.sendHoverCommand({ type: "hover-leave" });
    }
    this.drawMarks();
  };

  private clickOnMargin = (event: MouseEvent): void => {
    if (!Object.is(event.target, this.viewport) && !Object.is(event.target, this.board)) return;
    if (event.button !== 0 || event.ctrlKey || event.altKey) return;
    // The board margin is outside every frame: picking goes on and the selection stays.
    if (this.state.picking) return;
    this.viewport.focus(CLICK_FOCUS);
    this.clearText(true);
    this.clearOnEscape();
  };

  // A focused search box closing with its list would drop focus to the body, so it goes to the canvas area instead. The
  // isConnected check holds only while the Presets popover has no close animation.
  private pressed(): void {
    const focused = document.activeElement;
    for (const listener of [...this.pressListeners]) listener();
    const now = document.activeElement;
    if (focused !== null && focused !== document.body && !(focused as Node).isConnected && (now === null || now === document.body)) this.viewport.focus(CLICK_FOCUS);
  }

  // The app gets no pointer event over the out-of-process iframe, and a canvas can send a click message without a
  // click, so focus moves only when main's OS cursor reading, taken soon after, is over the canvas area. Never in a pick.
  private focusOnClick(): void {
    if (this.state.picking) return;
    const tag = ++this.clickTag;
    const asked = Date.now();
    const focused = document.activeElement;
    this.pointer().then(point => {
      if (point === null || tag !== this.clickTag || this.state.picking || document.activeElement !== focused || Date.now() - asked > CLICK_CURSOR_MS) return;
      const area = this.viewport.getBoundingClientRect();
      if (point.x >= area.left && point.x < area.right && point.y >= area.top && point.y < area.bottom) this.viewport.focus(CLICK_FOCUS);
    }, (error: unknown) => { console.error("pointer:get failed", error); });
  }

  // False under the capture layer, or in Hand the drag layer and the capture layer would both be up.
  private boardDrawn(): boolean {
    return !this.state.picking && !this.captureHeld() && this.boardShown();
  }

  private boardShown(): boolean {
    return this.frame !== null && this.state.status === null && !this.state.unlisted;
  }

  private captureHeld(): boolean { return this.state.capturing || this.captureDrag !== null; }

  private syncLayer(): void {
    // Capture mode and a text range end with the board they were on.
    if (!this.boardShown()) { this.endCaptureWithBoard(); this.resetText(); }
    const capture = this.captureHeld();
    const board = this.boardDrawn();
    // A drag and a held Space end with the board they were on; the tool stays.
    if (!board) { this.stopDrag(); this.spaceHeld = false; }
    const show = board && (this.tool === "hand" || this.spaceHeld || this.drag !== null);
    // Chromium recomputes the cursor over the iframe only when the iframe's own cursor value changes, and reliably only
    // after a frame without the layer has been drawn; a resting pointer keeps the canvas's cursor, so it shows the hand.
    if (show !== this.layerShown) {
      this.sendHoverCommand({ type: "hover-hand", hand: show });
      const frame = this.frame;
      if (!show && frame !== null) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          // The iframe's computed cursor starts as auto, so the first change is to default.
          frame.style.cursor = frame.style.cursor === "default" ? "auto" : "default";
        }));
      }
    }
    if ((show && !this.layerShown) || (capture && !this.captureShown)) {
      // The iframe gets no pointermove under the layer, and an OOPIF's pointerout cannot be trusted.
      this.hoverRect = null;
      this.sendHoverCommand({ type: "hover-leave" });
    }
    this.layerShown = show;
    this.layer.hidden = !show;
    this.captureShown = capture;
    if (this.captureLayer !== null) this.captureLayer.hidden = !capture;
    if (!show || this.tool !== "hand" || this.spaceHeld) this.textHover = false;
    if (this.drag?.mode === "pan") this.layer.dataset.grabbing = "";
    else delete this.layer.dataset.grabbing;
    if (this.drag === null ? this.textHover : this.drag.mode === "text" || (this.drag.mode === "asking" && this.textHover)) this.layer.dataset.text = "";
    else delete this.layer.dataset.text;
    this.drawMarks();
  }

  // Does not publish or redraw: callers do, once the tool chosen during the drag is in.
  private stopDrag(): void {
    const drag = this.drag;
    if (drag === null) return;
    this.drag = null;
    if (this.layer.hasPointerCapture(drag.pointerId)) this.layer.releasePointerCapture(drag.pointerId);
    if (this.pendingTool !== null) { const tool = this.pendingTool; this.pendingTool = null; if (tool !== this.tool) this.enterTool(tool); }
  }

  private finishDrag(): void {
    const before = this.tool;
    this.stopDrag();
    if (this.tool !== before) this.publish();
    else this.syncLayer();
  }

  // The layer never takes focus; a drag in Hand moves it to the canvas area as a click would, while a held Space
  // already has it where Space came from.
  private layerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (event.button !== 0 || this.drag !== null) return;
    if (!this.spaceHeld) this.viewport.focus(CLICK_FOCUS);
    this.layer.setPointerCapture(event.pointerId);
    // Hand's press is the canvas's next primary press, so it ends the range as in Select; a held Space and Ctrl keep it.
    const handPress = !this.spaceHeld && this.tool === "hand" && !event.ctrlKey;
    if (handPress) this.clearText();
    // Only the canvas can tell whether a plain press is on text, so the pan waits for its answer (onTextHit); a press
    // with a modifier pans at once.
    const asks = handPress && !event.metaKey && !event.altKey && !event.shiftKey && this.frame !== null && !this.loading && this.pickDocument !== null;
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, mode: asks ? "asking" : "pan", probe: asks ? ++this.textProbe : 0, held: { x: 0, y: 0 } };
    if (asks) this.post({ type: "text-press", epoch: this.textEpoch, ...this.boardPointAt(event.clientX, event.clientY), sx: event.clientX, sy: event.clientY, probe: this.textProbe });
    this.syncLayer();
  };

  private boardPointAt(x: number, y: number): Point {
    const area = this.viewport.getBoundingClientRect();
    return screenToBoard(this.view, { x: x - area.left, y: y - area.top });
  }

  private onTextHit(message: TextHitMessage): void {
    if (message.document !== this.pickDocument) return;
    const drag = this.drag;
    if (drag !== null && drag.mode === "asking" && message.probe === drag.probe) {
      const { x: dx, y: dy } = drag.held;
      drag.mode = message.hit ? "text" : "pan";
      if (message.hit) {
        if (dx !== 0 || dy !== 0) this.post({ type: "text-move", epoch: this.textEpoch, ...this.boardPointAt(drag.x, drag.y), sx: drag.x, sy: drag.y });
      } else if (dx !== 0 || dy !== 0) {
        this.view = panBy(this.view, dx, dy);
        this.applyView();
      }
      this.syncLayer();
      return;
    }
    if (message.probe !== this.hoverProbe) return;
    this.textHover = message.hit;
    this.syncLayer();
  }

  // One text-at a frame, for the newest point.
  private askTextHover(point: Point): void {
    const queued = this.hoverPoint !== null;
    this.hoverPoint = point;
    if (queued) return;
    requestAnimationFrame(() => {
      const at = this.hoverPoint;
      this.hoverPoint = null;
      if (at === null || this.drag !== null || !this.layerShown || this.tool !== "hand" || this.spaceHeld || this.loading || this.pickDocument === null) return;
      this.hoverProbe = ++this.textProbe;
      this.post({ type: "text-at", ...this.boardPointAt(at.x, at.y), probe: this.hoverProbe });
    });
  }

  // Each move's own travel, not the start plus the total: a zoom during the drag stays.
  private layerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null) {
      if (this.tool === "hand" && !this.spaceHeld) this.askTextHover({ x: event.clientX, y: event.clientY });
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx === 0 && dy === 0 || drag.mode === "ended") return;
    if (drag.mode === "asking") { drag.held = { x: drag.held.x + dx, y: drag.held.y + dy }; return; }
    if (drag.mode === "text") { this.post({ type: "text-move", epoch: this.textEpoch, ...this.boardPointAt(drag.x, drag.y), sx: drag.x, sy: drag.y }); return; }
    this.view = panBy(this.view, dx, dy);
    this.applyView();
  };

  private layerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    // A cancel or a lost capture ends it where it was.
    if (drag.mode === "asking" || drag.mode === "text") {
      this.post(event.type === "pointerup" ? { type: "text-release", epoch: this.textEpoch, ...this.boardPointAt(event.clientX, event.clientY) } : { type: "text-release", epoch: this.textEpoch });
    }
    this.finishDrag();
  };

  private onLayout(message: LayoutMessage): void {
    const documentChanged = message.document !== undefined && message.document !== this.anchorDocument;
    if (documentChanged) { this.resetAnchors(); this.anchorDocument = message.document ?? null; }
    // Another document, even the canvas's own location.reload() in the same iframe, ends the replaced one's pick
    // channel; the pick itself goes on below unless the page is another canvas.
    // Not loading: the canvas replaced its own document, so load() reset nothing.
    const replaced = message.document !== undefined && message.document !== this.pickDocument && this.pickDocument !== null && !this.loading;
    if (message.document !== undefined && message.document !== this.pickDocument) {
      this.pickDocument = message.document;
      this.resetPickChannel();
      // The new document counts its clears from 0.
      this.textEpoch = 0;
      this.resetText();
      // A held Space and a drag end with the document, even one the canvas replaced itself in the same iframe. Not on the
      // anchor document's change: the iframe's load event forgets that one while the document stays.
      if (this.spaceHeld || this.drag !== null) { this.spaceHeld = false; this.finishDrag(); }
      this.hoverResend = true;
    }
    const before = this.layoutDisplayKey();
    const previousCurrent = this.state.currentFrame;
    const beforeSelection = this.state.selection;
    const previousPicking = this.state.picking;
    const previousCapturing = this.state.capturing;
    const newDocument = this.lastHref !== null && !sameDocument(this.lastHref, message.href);
    // Its new script counts both channels from 0 and has no selection, so the selection is found again as after a reload.
    if (replaced && !newDocument) {
      this.resetChannels();
      this.drawMarks();
      this.applySelectionEffect({ kind: "reload" });
      if (this.reanchor !== null) this.sendCommand({ type: "select-anchor", ...this.reanchor });
    }
    // Against the height before this layout resizes the iframe, as layoutHeight does.
    const selected = selectedFromLayout({ ...this.expectation(), href: message.href }, message);
    this.setFrameHeight(layoutHeight(this.lastHref, this.frameHeight, message));
    // A layout that does not confirm the current height needs another, which the canvas sends on an animation frame an
    // off-screen iframe never gets. `measure` is answered without one.
    clearTimeout(this.remeasureTimer);
    if (Math.abs(message.viewport - this.frameHeight) > 1 || Math.min(message.height, MAX_HEIGHT) !== this.frameHeight) {
      const frame = this.frame;
      this.remeasureTimer = setTimeout(() => { if (frame === this.frame) this.post({ type: "measure" }); }, REMEASURE_MS);
    }
    // A hidden iframe can report every frame at the origin before receiving its viewport; the open waits for the
    // measurement requested above, also across a reload.
    if (this.pendingFrame !== null && message.viewport === 0 && this.frameHeight > 0) return;
    this.lastHref = message.href;
    clearTimeout(this.answerTimer);
    if (newDocument) {
      this.clearJump();
      this.jumpTo = null;
      this.resetChannels();
      this.applySelectionEffect({ kind: "otherCanvas" });
      // Another page is another canvas, so the pick and capture mode end.
      this.resetPickChannel();
      this.endPick({ kind: "cancelled" });
      this.endCaptureWithBoard();
    }
    const first = this.loading;
    if (first) {
      this.loading = false;
      clearTimeout(this.loadTimer);
      this.board.style.visibility = "";
      this.state.status = null;
      if (this.reanchor !== null) this.sendCommand({ type: "select-anchor", ...this.reanchor });
    }
    // After the seq reset above and once loading is over, so the new document hears it from seq 1.
    if (this.hoverResend || first) this.resendHover();
    // A reloaded document hears no pointer move until the pointer moves.
    if (first && this.refindOnLoad) { this.refindOnLoad = false; this.refindHover(); }
    this.state.layout = message;
    const linked = this.markShown(message.href);
    if (linked && this.state.open) this.linkedCanvas?.(this.state.open.folder);
    if (this.state.unlisted) { this.endPick({ kind: "cancelled" }); this.endCaptureWithBoard(); }
    else if (this.state.picking && this.activePick === null) this.armPick();
    if (this.pendingFrame !== null) {
      const target = this.pendingFrame;
      const index = target.index !== undefined && message.frames[target.index]?.id === target.id ? target.index : message.frames.findIndex(frame => frame.id === target.id);
      this.jumpTo = index >= 0 ? index : null;
      this.pendingFrame = null;
      target.found?.(index >= 0);
    }
    if (first && this.pickAfterLoad !== null) {
      const { id, intent } = this.pickAfterLoad;
      this.pickAfterLoad = null;
      const index = message.frames.findIndex(frame => frame.id === id);
      if (intent === this.transitionIntent && index >= 0) this.pickFrame(index, id);
    }
    if (this.jumpTo !== null) {
      const target = message.frames[this.jumpTo];
      if (target !== undefined) {
        this.view = fitFrame(target, this.viewportSize(), FIT_INSET, this.view);
        this.showJump(target);
        this.applyView();
      }
      this.jumpTo = null;
    }
    if (first && this.pendingLocate !== null) this.locatePending();
    // A reload may bring the working frame an update named before it existed.
    if (!this.followWork()) this.drawWork();
    if (selected !== undefined && !newDocument && this.state.selection !== null && this.reanchor === null) {
      if (selected === null) this.applySelectionEffect({ kind: "anchorLost" });
      else { this.selectedRect = selected; this.drawMarks(); }
    }
    this.state.currentFrame = this.state.unlisted ? null : currentFrame(message.frames, this.view, this.viewportSize());
    if (first || previousCurrent !== this.state.currentFrame || documentChanged || before !== this.layoutDisplayKey() || linked || beforeSelection !== this.state.selection || previousPicking !== this.state.picking || previousCapturing !== this.state.capturing) this.publish();
  }

  private resetChannels(): void {
    this.seq = 0;
    this.pickFrameCommand = null;
    this.hoverSeq = 0;
    this.refindSeq = null;
    this.hoverRect = null;
    this.treeHover = null;
  }

  // A new document has no hand, ⌥ or ⌘ of its own; Hand keeps the layer up through the canvas's own reload.
  private resendHover(): void {
    this.hoverResend = false;
    if (this.layerShown) this.sendHoverCommand({ type: "hover-hand", hand: true });
    if (this.altHeld) this.sendHoverCommand({ type: "hover-alt", alt: true });
    if (this.metaHeld) this.sendHoverCommand({ type: "hover-meta", meta: true });
  }

  private markShown(href: string): boolean {
    const open = this.state.open;
    if (open === null) return false;
    const entry = this.entries.find(candidate => candidate.path === open.folder);
    if (entry?.kind !== "list") return false;
    const row = canvasAtHref(entry.canvases, href);
    const linked = row !== undefined && row.path !== open.canvas;
    if (linked) {
      this.state.open = { folder: open.folder, canvas: row.path, row };
      if (row.width !== undefined) this.setFrameWidth(row.width);
    }
    this.state.shown = row?.path ?? null;
    this.state.unlisted = row === undefined;
    return linked;
  }

  jump(index: number): void {
    if (this.frame?.contentWindow == null || !this.state.layout?.frames[index] || this.state.unlisted) return;
    this.pendingFrame = null;
    this.jumpTo = index;
    this.post({ type: "measure" });
  }

  // The row the frame drawer drew may predate the current layout: the index while it still holds that id, else the
  // id's first frame, else nothing.
  selectFrame(index: number, id: string): void {
    const resolve = () => {
      const frames = this.state.unlisted ? [] : this.state.layout?.frames ?? [];
      return frames[index]?.id === id ? index : frames.findIndex(frame => frame.id === id);
    };
    if (resolve() < 0) return;
    this.transition(() => {
      const at = resolve();
      if (at < 0) return;
      if (this.loading) {
        this.pendingFrame = { id };
        this.pickAfterLoad = { id, intent: this.transitionIntent };
        return;
      }
      this.jump(at);
      this.pickFrame(at, id);
    }, () => resolve() >= 0);
  }

  private pickFrame(index: number, id: string): void {
    this.sendCommand({ type: "pick-frame", index, id });
    this.pickFrameCommand = { seq: this.seq, id };
  }

  private clearJump(): void {
    clearTimeout(this.jumpTimer);
    this.jumpRect = null;
    if (this.jumpMark) this.jumpMark.hidden = true;
  }

  private showJump(rect: CanvasRect, kind: "rect" | "point" = "rect"): void {
    this.clearJump();
    this.jumpRect = rect;
    this.jumpKind = kind;
    // A fresh element restarts the CSS animation even for repeated jumps.
    this.jumpMark?.remove();
    this.jumpMark = document.createElement("div");
    this.jumpMark.className = kind === "point" ? "mark jump-highlight jump-point" : "mark jump-highlight";
    this.overlay.append(this.jumpMark);
    this.jumpTimer = setTimeout(() => this.clearJump(), 1200);
  }

  private drawJump(): void {
    if (!this.jumpRect || !this.jumpMark) return;
    const center = boardToScreen(this.view, this.jumpRect);
    // A point's ring keeps its screen size at every zoom.
    const rect = this.jumpKind === "point"
      ? { x: center.x - POINT_RING / 2, y: center.y - POINT_RING / 2, width: POINT_RING, height: POINT_RING }
      : boardRectToScreen(this.view, this.jumpRect);
    this.jumpMark.hidden = false;
    Object.assign(this.jumpMark.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  command(name: ViewCommand): void {
    if (name === "reload") { this.transition(() => { if (this.state.open) this.load(this.state.open.row, false); }); return; }
    if (this.frame === null) return;
    const size = this.viewportSize();
    const center = { x: size.width / 2, y: size.height / 2 };
    switch (name) {
      case "zoomIn": this.view = zoomAt(this.view, ZOOM_STEP, center, ZOOM_LIMITS); break;
      case "zoomOut": this.view = zoomAt(this.view, 1 / ZOOM_STEP, center, ZOOM_LIMITS); break;
      case "actualSize": this.view = zoomAt(this.view, 1 / this.view.scale, center, ZOOM_LIMITS); break;
      case "fit": this.view = fitWidth(this.frameWidth, size, FIT_INSET); break;
      case "zoomSelection": this.zoomToSelection(); return;
    }
    this.applyView();
  }

  // Nothing happens without a selection.
  private zoomToSelection(): boolean {
    const rect = this.state.selection === null ? null : this.selectedRect;
    if (this.frame === null || rect === null) return false;
    this.view = selectionView(rect, this.viewportSize(), FIT_INSET, this.view);
    this.applyView();
    return true;
  }

  // The canvas loads while the Overview still lays out the page, so the renderer calls this once the canvas page's
  // column width applies. Once per load; later resizes keep the board's screen position (viewportResized).
  settleFit(): void {
    const pending = this.firstFit;
    this.firstFit = null;
    if (pending === null || pending !== this.view || this.frame === null) return;
    this.view = fitWidth(this.frameWidth, this.viewportSize(), FIT_INSET);
    this.applyView("app");
  }

  // The view center stays put, like the steps and 100%.
  zoomTo(scale: number): void {
    if (this.frame === null) return;
    const size = this.viewportSize();
    this.view = zoomAt(this.view, scaleFactor(scale, this.view), { x: size.width / 2, y: size.height / 2 }, ZOOM_LIMITS);
    this.applyView();
  }

  private preventPageZoom = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };

  private wheelOnMargin = (event: WheelEvent): void => {
    if (this.frame === null) return;
    event.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    this.wheel({ dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode }, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  wheel(input: WheelInput, point: Point): void {
    // The element under the cursor changes without a pointermove. An Option measurement keeps its target, a board rect
    // that applyView redraws where the board moved it.
    if (!this.altHeld) this.hoverRect = null;
    const action = wheelAction(input);
    this.view = "zoom" in action ? zoomAt(this.view, action.zoom, point, ZOOM_LIMITS) : panBy(this.view, action.pan.dx, action.pan.dy);
    this.applyView();
    // The canvas never hears the board moving under a resting pointer, so the drag's end follows the board point now
    // under it.
    if (this.textDragging) { const at = screenToBoard(this.view, point); this.post({ type: "text-point", epoch: this.textEpoch, x: at.x, y: at.y }); }
  }

  // The view is relative to the area's top-left, so a sidebar fold or resize would carry the board along; taking the
  // edge's move off keeps it in place. A zero-width area is skipped, so its return counts the edge it had before.
  private viewportResized = (): void => {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width > 0) {
      const shift = this.viewportLeft === null ? 0 : rect.left - this.viewportLeft;
      this.viewportLeft = rect.left;
      if (shift !== 0) {
        // A first Fit still waiting for settleFit stays that wait: the moved view takes over its identity.
        const waiting = this.firstFit !== null && this.firstFit === this.view;
        this.view = { ...this.view, x: this.view.x - shift };
        if (waiting) this.firstFit = this.view;
      }
    }
    this.applyView("app");
  };

  private applyView(origin: ViewOrigin = "person"): void {
    if (origin === "person") this.personActive(true);
    this.board.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    this.drawMarks();
    this.placeText();
    this.drawJump();
    this.drawWork();
    const current = this.state.unlisted ? null : currentFrame(this.state.layout?.frames ?? [], this.view, this.viewportSize());
    const changedCurrent = current !== this.state.currentFrame;
    this.state.currentFrame = current;
    const zoom = Math.round(this.view.scale * 100);
    // Within one rounded percent the zoom steps only change at a limit, so only crossing one needs a render.
    const limit = (scale: number) => scale <= MIN_SCALE ? -1 : scale >= MAX_SCALE ? 1 : 0;
    const changedLimit = limit(this.view.scale) !== limit(this.state.scale);
    this.state.scale = this.view.scale;
    if (zoom !== this.state.zoom || changedCurrent || changedLimit) { this.state.zoom = zoom; this.publish(); }
    this.viewChanged?.();
  }
  // App also calls it with no work, so a change of canvas is seen as entering it: the frame worked on then counts as
  // followed, and following waits for the next one.
  setWork(target: CanvasWorkTarget | null): void {
    const key = target && canvasKey(target.root, target.path);
    const entered = key !== this.workCanvas;
    const previous = entered ? null : this.workSource;
    const before = this.workMarkFrame;
    this.work = target;
    this.workCanvas = key;
    const next = target?.work ?? null;
    // Another source winning names a frame the board must not swing to, so it counts as followed here, not when the
    // frame is next evaluated.
    const sourceChanged = previous !== null && next !== null && previous !== next.source;
    // A later turn is then followed from its first frame, whichever source it is.
    if (entered || (next === null && (target?.keys.length ?? 0) === 0)) this.workSource = null;
    if (next) this.workSource = next.source;
    if (target && key) {
      let memory = followStopped(this.followMemory.get(key) ?? EMPTY_FOLLOW, target.keys, false);
      if ((entered || sourceChanged) && next?.frame !== undefined) memory = markFollowed(memory, next.key, next.frame);
      this.followMemory.set(key, memory);
    }
    if (this.followWork()) return;
    const frame = this.openWork()?.frame;
    this.drawWork(before !== null && frame !== undefined && frame !== before);
  }

  // true when it moved (the move placed the marker). Not while the document reloads or failed: the frame is read from
  // the next layout.
  private followWork(): boolean {
    clearTimeout(this.followTimer);
    const work = this.openWork(), target = this.work;
    if (!work || !target || work.frame === undefined || this.frame === null || this.loading || this.state.status !== null) return false;
    const key = canvasKey(target.root, target.path), memory = this.followMemory.get(key) ?? EMPTY_FOLLOW;
    const decision = followDecision({
      frame: work.frame, followed: followedFrames(memory, work.key), rect: workFrameRect(this.state.layout, work.frame),
      viewport: this.viewportSize(), view: this.view, lastPersonMove: this.lastPersonMove, now: Date.now(), stopped: memory.stopped.has(work.key), busy: this.followBusy(),
    });
    if (decision.kind === "stay") {
      if (decision.followed) this.followMemory.set(key, markFollowed(memory, work.key, work.frame));
      if (decision.retryAt !== undefined) this.followTimer = setTimeout(() => this.followWork(), Math.max(0, decision.retryAt - Date.now()));
      return false;
    }
    this.followMemory.set(key, markFollowed(memory, work.key, work.frame));
    this.view = decision.view;
    this.applyView("app");
    return true;
  }

  private followBusy(): boolean {
    return this.state.picking || this.state.capturing || this.drag !== null || this.captureDrag !== null || this.spaceHeld || this.textDragging || !this.onCanvasPage() || this.overlayOpen();
  }

  // A view or selection change also stops every work turn on the open canvas (`stop`); a pointer move or typing does
  // not.
  private personActive(stop: boolean): void {
    this.lastPersonMove = Date.now();
    // A plain move only pushes the rest's end, which the timer finds when it fires and re-arms.
    if (stop) clearTimeout(this.followTimer);
    const target = this.work, open = this.state.open;
    if (!stop || !target || !open || target.root !== open.folder || target.path !== open.canvas || target.keys.length === 0) return;
    const key = canvasKey(target.root, target.path);
    this.followMemory.set(key, followStopped(this.followMemory.get(key) ?? EMPTY_FOLLOW, target.keys, true));
  }

  private typed = (): void => { this.personActive(false); };

  // Date.now() ms; the docked buddy's rest starts from it, as following's does.
  personMovedAt(): number { return this.lastPersonMove; }

  // Like opening the canvas: the frame worked on now counts as followed and the rest starts again.
  private enteredPage(): void {
    this.lastPersonMove = Date.now();
    const work = this.openWork(), target = this.work;
    if (!work || !target || work.frame === undefined) return;
    const key = canvasKey(target.root, target.path);
    this.followMemory.set(key, markFollowed(this.followMemory.get(key) ?? EMPTY_FOLLOW, work.key, work.frame));
  }

  private openWork(): CanvasWork | null {
    const open = this.state.open, target = this.work;
    return open && target && !this.state.unlisted && target.root === open.folder && target.path === open.canvas ? target.work : null;
  }

  // A reload keeps a shown marker on the previous rect until the new layout places it: every agent write reloads the
  // canvas, and hiding it in between restarted its animations each time. It slides only when the working frame changes.
  private drawWork(slide = false): void {
    clearTimeout(this.workSlideTimer);
    const work = this.state.status !== null || (this.loading && this.workMarkFrame === null) ? null : this.openWork();
    const rect = work ? workFrameRect(this.state.layout, work.frame) : null;
    // A reload's first layout can report every frame as 0 × 0 before measuring; the frame has not gone, so the marker
    // stays put.
    const frames = this.state.layout?.frames ?? [];
    if (rect === null && work !== null && work.frame === this.workMarkFrame && frames.some(frame => frame.id === work.frame) && frames.every(frame => frame.width === 0 && frame.height === 0)) return;
    if (work === null || rect === null) {
      if (this.workMark) this.workMark.hidden = true;
      this.workMarkFrame = null;
      return;
    }
    if (this.workMark === null) {
      this.workMark = document.createElement("div");
      this.overlay.append(this.workMark);
    }
    const mark = this.workMark;
    const look = work.waiting ? "mark jump-highlight working still" : "mark jump-highlight working";
    mark.className = slide ? `${look} moving` : look;
    if (slide) this.workSlideTimer = setTimeout(() => { mark.className = look; }, WORK_SLIDE_MS);
    const screen = boardRectToScreen(this.view, rect);
    mark.hidden = false;
    Object.assign(mark.style, { left: `${screen.x}px`, top: `${screen.y}px`, width: `${screen.width}px`, height: `${screen.height}px` });
    this.workMarkFrame = rect.id;
  }

  // A range waiting for its cursor reading counts: Esc and the other clears must drop it before the reply paints it.
  private hasText(): boolean { return this.textRects.length > 0 || this.textDragging || this.textCheck !== null; }

  // A pick or capture mode cleared the range and leaves the canvas no clicks of its own. In Hand the canvas sees no
  // press, so a range comes only from the text drag the app drives (onTextHit).
  private onTextRange(message: TextRangeMessage): void {
    if (message.document !== this.pickDocument || message.epoch < this.textEpoch) return;
    if (this.state.picking || this.state.capturing) return;
    if (this.tool === "hand" && this.drag?.mode !== "text" && this.textTrust === "none" && this.textCheck === null) return;
    this.personActive(false);
    if (this.textTrust === "dragging") { this.applyText(message); return; }
    // The canvas cleared it (its next press, or a drag back to its start).
    if (!message.dragging && message.rects.length === 0) { this.resetText(); return; }
    if (this.textTrust === "held" && !message.dragging && message.text === undefined) { this.applyText(message); return; }
    this.checkText(message);
  }

  // A canvas can post a range unprompted, so a new range counts only when main reads the OS cursor over the canvas area
  // within 500 ms, as a click's focus does; messages arriving meanwhile wait and the newest applies if it passes.
  private checkText(message: TextRangeMessage): void {
    const waiting = this.textCheck;
    if (waiting !== null && Date.now() - waiting.asked <= CLICK_CURSOR_MS) { waiting.message = message; return; }
    const check = { tag: ++this.textTag, asked: Date.now(), message };
    this.textCheck = check;
    this.pointer().then(point => this.textChecked(check, point), (error: unknown) => {
      console.error("pointer:get failed", error);
      this.textChecked(check, null);
    });
  }

  private textChecked(check: NonNullable<CanvasController["textCheck"]>, point: { x: number; y: number } | null): void {
    if (check.tag !== this.textTag || this.textCheck !== check) return;
    this.textCheck = null;
    const area = this.viewport.getBoundingClientRect();
    const inside = point !== null && Date.now() - check.asked <= CLICK_CURSOR_MS && point.x >= area.left && point.x < area.right && point.y >= area.top && point.y < area.bottom;
    // The canvas drops its range too, so a later layout does not bring it back.
    if (!inside) { this.clearText(true); return; }
    // The selection made last is the one copied: a canvas text drag folds the app's own text selection.
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) selection.collapseToEnd();
    this.textTrust = "dragging";
    this.applyText(check.message);
  }

  private applyText(message: TextRangeMessage): void {
    const ended = !message.dragging && this.textTrust === "dragging";
    this.textRects = message.rects;
    this.textDragging = message.dragging;
    this.textTrust = message.dragging ? "dragging" : message.rects.length > 0 ? "held" : "none";
    this.canvasText = message.dragging || message.rects.length === 0 ? null : message.text ?? this.canvasText;
    // Keys after the release go to the canvas area, as after a click.
    if (ended) this.focusOnClick();
    this.drawText();
    this.drawMarks();
  }

  // `always`: also when nothing is shown yet, since a range the canvas posted may still be on its way.
  private clearText(always = false): void {
    if (!always && !this.hasText()) return;
    if (this.frame !== null && !this.loading && this.pickDocument !== null) {
      this.textEpoch += 1;
      this.post({ type: "clear-text", epoch: this.textEpoch });
    }
    this.resetText();
  }

  // Nothing to tell the canvas.
  private resetText(): void {
    this.textCheck = null;
    this.textTag += 1;
    this.textTrust = "none";
    if (!this.hasText() && this.canvasText === null) return;
    this.textRects = [];
    this.canvasText = null;
    this.textDragging = false;
    this.drawText();
    this.drawMarks();
  }

  private copy = (event: ClipboardEvent): void => {
    const text = textCopy({ canvasText: this.canvasText, defaultPrevented: event.defaultPrevented, onCanvasPage: this.onCanvasPage(), overlayOpen: this.covered || this.overlayOpen() });
    if (text === null || !event.clipboardData) return;
    // Plain text only: it is the canvas's data, never drawn as HTML.
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  };

  // A new app text selection clears the canvas range, so only one shows. A caret moving, as typing does, is none.
  private appSelection = (event: Event): void => {
    if (!this.hasText()) return;
    const target: unknown = event.target;
    const inField = typeof target === "object" && target !== null && "selectionStart" in target && "selectionEnd" in target &&
      typeof target.selectionStart === "number" && target.selectionStart !== target.selectionEnd;
    const selection = window.getSelection();
    if (inField || (selection && selection.rangeCount > 0 && !selection.isCollapsed)) this.clearText();
  };

  // The layer takes the board's own transform, so a pan moves one element, not every rect. Under the marks
  // (styles.css), so the selection and hover outlines stay on top.
  private drawText(): void {
    if (this.textLayer === null) {
      if (this.textRects.length === 0) return;
      const layer = document.createElement("div");
      layer.className = "text-range";
      layer.setAttribute("aria-hidden", "true");
      this.overlay.append(layer);
      this.textLayer = { layer, rects: [] };
    }
    const { layer, rects } = this.textLayer;
    layer.hidden = this.textRects.length === 0;
    this.textRects.forEach((rect, index) => {
      let element = rects[index];
      if (element === undefined) {
        element = document.createElement("div");
        element.className = "text-rect";
        layer.append(element);
        rects.push(element);
      }
      element.hidden = false;
      Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    });
    for (const element of rects.slice(this.textRects.length)) element.hidden = true;
    this.placeText();
  }

  private placeText(): void {
    if (this.textLayer === null) return;
    this.textLayer.layer.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
  }

  // Outside the iframe so the canvas DOM, its MutationObserver and the anchors stay untouched; screen px so lines stay
  // 1px at any scale, while the size label reads canvas px.
  private drawMarks(): void {
    const measured = this.measured();
    const hover = measured === null && (this.markHidden || this.altHeld || this.layerShown || this.captureShown || this.textDragging) ? null : this.treeHover ?? this.hoverRect;
    const selected = this.markHidden ? null : this.selectedRect;
    if (this.marks === null) {
      if (hover === null && selected === null) return;
      const node = (className: string) => {
        const element = document.createElement("div");
        element.className = className;
        return element;
      };
      this.marks = { hover: node("mark hover"), selected: node("mark selected"), size: node("dims") };
      this.marks.selected.append(this.marks.size);
      this.overlay.append(this.marks.hover, this.marks.selected);
      this.bubble = this.makeBubble(this.marks.size);
    }
    const place = (element: HTMLElement, rect: CanvasRect | null) => {
      element.hidden = rect === null;
      if (rect === null) return;
      const screen = boardRectToScreen(this.view, rect);
      element.style.left = `${screen.x}px`;
      element.style.top = `${screen.y}px`;
      element.style.width = `${screen.width}px`;
      element.style.height = `${screen.height}px`;
    };
    // Hiding the selection can blur its focused button before the hand-off.
    const active = document.activeElement;
    place(this.marks.hover, hover);
    place(this.marks.selected, selected);
    this.marks.hover.className = measured === null ? "mark hover" : "mark hover measuring";
    this.marks.selected.className = measured === null ? "mark selected" : "mark selected measuring";
    this.placeSize(this.marks.size, selected, active);
    this.drawMeasure(measured);
  }

  // altHeld stays the one source of Option's state. Nothing measures over a pick, the drag or capture layer, a text
  // drag, or anything covering the canvas.
  private measured(): { selected: CanvasRect; target: CanvasRect } | null {
    const selected = this.selectedRect;
    const target = this.hoverRect;
    if (!this.altHeld || this.markHidden || selected === null || target === null) return null;
    if (this.layerShown || this.captureShown || this.textDragging || this.state.picking || this.covered || this.overlayOpen()) return null;
    return { selected, target };
  }

  // Screen px, so lines stay 1px at any zoom; the labels read canvas px.
  private drawMeasure(measured: { selected: CanvasRect; target: CanvasRect } | null): void {
    if (measured === null) {
      if (this.measure !== null) this.measure.layer.hidden = true;
      return;
    }
    if (this.measure === null) {
      const layer = document.createElement("div");
      layer.className = "measure";
      this.overlay.append(layer);
      this.measure = { layer, lines: [] };
    }
    const { layer, lines } = this.measure;
    layer.hidden = false;
    const drawn = measureLines(measured.selected, measured.target);
    drawn.forEach((line, index) => {
      let element = lines[index];
      if (element === undefined) {
        element = { line: document.createElement("div"), label: document.createElement("span") };
        element.label.className = "measure-label";
        element.line.append(element.label);
        layer.append(element.line);
        lines.push(element);
      }
      const horizontal = line.axis === "x";
      element.line.hidden = false;
      element.line.className = `measure-line ${horizontal ? "h" : "v"}${line.dashed ? " dashed" : ""}`;
      element.label.hidden = line.dashed;
      element.label.textContent = line.dashed ? "" : canvasPx(line.to - line.from);
      const start = boardToScreen(this.view, horizontal ? { x: line.from, y: line.at } : { x: line.at, y: line.from });
      const length = `${(line.to - line.from) * this.view.scale}px`;
      Object.assign(element.line.style, { left: `${start.x}px`, top: `${start.y}px`, width: horizontal ? length : "", height: horizontal ? "" : length });
    });
    for (const element of lines.slice(drawn.length)) element.line.hidden = true;
  }

  private placeSize(size: HTMLElement, selected: CanvasRect | null, active = document.activeElement): void {
    const bubble = this.bubble;
    if (bubble === null) return;
    const onPlay = bubble.playShown && active === bubble.play;
    const onAdd = active !== null && this.bubbleAdd !== null && active === this.bubbleAdd.button();
    const onInspect = active != null && active === this.bubbleInspect?.button();
    const play = selected !== null && this.bubblePlay !== null && sizeBubblePlay(this.state);
    if (play !== bubble.playShown) {
      if (play) size.prepend(bubble.play ??= this.makePlay());
      else bubble.play?.remove();
      bubble.playShown = play;
    }
    if (selected !== null) {
      bubble.label.textContent = sizeLabel(selected);
      size.className = play ? "dims playable" : "dims";
    }
    this.moveBubbleFocus(selected !== null, onPlay ? "play" : onAdd ? "add" : onInspect ? "inspect" : null);
  }

  // Focus never falls to the page body when a bubble button goes (PRODUCT §5 item 2 'Play controls').
  private moveBubbleFocus(shown: boolean, had: BubbleAction | null): void {
    const bubble = this.bubble!;
    if (!shown) {
      // Gone for good (not a reload's wait): nothing to come back to.
      if (had === null) { if (this.reanchor === null) this.dropBubbleReturn(); return; }
      // App takes the hand-off now; an earlier one to a bubble button is over.
      this.bubbleActivation();
      (had === "play" ? this.bubblePlay : had === "inspect" ? this.bubbleInspect : this.bubbleAdd)?.onFocusLost();
      this.dropBubbleReturn();
      // Hidden while a reload looks for the same selection: focus may come back to this button.
      if (this.reanchor !== null) this.awaitBubbleReturn(had, document.activeElement);
      return;
    }
    if (had === "play" && !bubble.playShown) this.handBubbleFocus(() => this.bubbleAdd?.button());
    const back = this.reanchor === null ? this.bubbleReturn : null;
    if (back === null) return;
    this.dropBubbleReturn();
    if (document.activeElement !== back.holder) return;
    if (back.button === "inspect") this.bubbleInspect?.restoreFocus();
    else this.handBubbleFocus(() => back.button === "play" && bubble.playShown ? bubble.play : this.bubbleAdd?.button());
  }

  // A reload can move this focus while the prototype window is in front, so it is made again on activation
  // (POSTMORTEM 2026-11-17), only to a button the bubble still shows.
  private handBubbleFocus(target: () => HTMLElement | null | undefined): void {
    this.bubbleFocusMoves++;
    this.bubbleActivation();
    this.bubbleActivation = focusThroughActivation(() => {
      const button = target();
      if (button?.isConnected && button.closest("[hidden]") === null) button.focus({ preventScroll: true });
    });
  }

  private awaitBubbleReturn(button: BubbleAction, holder: Element | null): void {
    const moved = (event: FocusEvent) => { if (event.target !== holder) this.dropBubbleReturn(); };
    window.addEventListener("focusin", moved, true);
    this.bubbleReturn = { button, holder, moved };
  }

  private dropBubbleReturn(): void {
    if (this.bubbleReturn === null) return;
    window.removeEventListener("focusin", this.bubbleReturn.moved, true);
    this.bubbleReturn = null;
  }

  private makeBubble(size: HTMLElement): NonNullable<CanvasController["bubble"]> {
    const label = document.createElement("span");
    const host = document.createElement("span");
    host.className = "bubble-host";
    const stop = (event: Event) => event.stopPropagation();
    host.addEventListener("pointerdown", stop);
    host.addEventListener("mousedown", event => {
      stop(event);
      if (bubbleAction(event.target) === "inspect") event.preventDefault();
    });
    host.addEventListener("click", this.clickBubble);
    size.append(label, host);
    this.bubbleAdd?.host(host);
    return { play: null, label, host, playShown: false };
  }

  // Play precedes the size label outside the portal host; both native listeners dispatch the same way.
  private clickBubble = (event: Event) => {
    event.stopPropagation();
    if (!this.marks || this.marks.selected.hidden) return;
    switch (bubbleAction(event.target)) {
      case "play": if (this.bubble?.playShown) this.bubblePlay?.onPlay(); break;
      case "add": this.bubbleAdd?.onAdd(); break;
      case "inspect": this.bubbleInspect?.onInspect(); break;
    }
  };

  private makePlay(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "doan-icon-button bubble-button bubble-play";
    button.setAttribute("data-ui-size", "xs");
    button.setAttribute("aria-label", "Play prototype");
    button.setAttribute("data-bubble-action", "play");
    // lucide's Play, as the toolbar's button draws it.
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
    const stop = (event: Event) => event.stopPropagation();
    button.addEventListener("pointerdown", stop);
    button.addEventListener("mousedown", stop);
    button.addEventListener("click", this.clickBubble);
    return button;
  }

  private setFrameWidth(width: number): void { this.frameWidth = width; if (this.frame) this.frame.style.width = `${width}px`; }
  private setFrameHeight(height: number): void { this.frameHeight = height; if (this.frame) this.frame.style.height = `${height}px`; }
  private viewportSize() { return { width: this.viewport.clientWidth, height: this.viewport.clientHeight }; }
}
