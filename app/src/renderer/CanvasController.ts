import type { PinGeometry, TargetCandidates } from "../comments/projection";
import type { AnchorsMessage, CanvasFrameRect, PickedMessage, PickStartedMessage } from "./canvasMessage";
import type { Anchor } from "../main/conversation/types";
import type { Selection } from "../formats/types";
import type { ViewCommand } from "../main/index";
import type { InspectResult, InspectRow } from "../main/inspect";
import type { CanvasRow, FolderEntry } from "../main/view";
import { acceptCanvasMessage, type CanvasRect, type LayoutMessage, type PathItem, type SelectionMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, INITIAL_HEIGHT, layoutHeight, MAX_HEIGHT, sameDocument, TrashMarks, type OpenCanvas } from "./canvasView";
import { projectNames } from "./projectRow";
import { switchTarget } from "./switchTarget";
import { activityKey, activityKind, pushActivity, type ActivityEvent } from "./activity";
import { acceptSelectionMessage, anchorRequest, editableTarget, mainSelection, SELECTION_LOST, selectedFromLayout, selectionAfter, shouldGuardEscape, sizeLabel, type AnchorRequest, type SelectionTrigger, type SelectionView } from "./selection";
import { boardRectToScreen, boardToScreen, elementView, FIRST_LAYOUT_TIMEOUT_MS, FIT_INSET, fitFrame, fitWidth, MAX_SCALE, MIN_SCALE, panBy, wheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt, type Point, type View, type WheelInput } from "./viewport";
import { scaleFactor } from "./zoomControl";
import { currentFrame } from "./currentFrame";
import { pointAnchor, resolveChipTarget, targetAnchor } from "./canvasPicker";
import { escapeStep, toolShortcut, type CanvasTool, type ToolShortcut } from "./canvasTool";

export const MEASURE_ANSWER_MS = 1000;
const REMEASURE_MS = 50;
// A cursor reading that comes later than this may no longer be where the click was.
const CLICK_CURSOR_MS = 500;
// Focus a pointer press gives the canvas area. Without focusVisible: false the Canvas region draws its keyboard ring
// after any key use: the app never sees a click that lands in the canvas's iframe, so Chromium counts it as keyboard.
const CLICK_FOCUS: FocusOptions = { preventScroll: true, focusVisible: false };

export interface CanvasState {
  hasFrame: boolean;
  open: (OpenCanvas & { row: CanvasRow }) | null;
  shown: string | null;
  layout: LayoutMessage | null;
  selection: SelectionView | null;
  currentFrame: number | null;
  // The selection-lost line, until the next selection or canvas change.
  notice: string;
  // Main's inspector rows for the current selection.
  inspector: InspectorView | null;
  status: "empty" | "loading" | "noWidth" | "failed" | "missing" | null;
  // The reloaded document is still being asked for the previous selection.
  reanchoring: boolean;
  // A reload of the open canvas has not laid out its new document yet. The
  // previous layout stays shown and `status` stays null meanwhile, so this is
  // the only sign that the document on screen is about to be replaced.
  reloading: boolean;
  message: string;
  error: string;
  unlisted: boolean;
  zoom: number;
  // The exact view scale behind the rounded `zoom`: the zoom controller's step limits read it. Published with the
  // other changes, and whenever the view reaches or leaves a zoom limit.
  scale: number;
  activity: ActivityEvent[];
  // The tool a person chose (canvas-hand-tool spec 결정 1); a pick runs ahead of it and leaves it as it was.
  tool: CanvasTool;
  // While the canvas waits for one click to name a chip's target (buzz-canvas-conversation design §2 'Picker').
  picking: boolean;
}

// How a pick ended. `frames` is the layout's frame list the anchor was taken from, for the chip's name.
export type PickResult = { kind: "picked"; anchor: Anchor; frames: readonly CanvasFrameRect[] } | { kind: "cancelled" };
// "missing": the canvas answered with no unique match. "timeout": it did not answer in time, which says nothing about
// the target, so the caller ends the locate without claiming the target is gone.
export type LocateResult = "shown" | "missing" | "timeout";

// A point's ring on the board, in screen px (design §2 'Chip locate').
const POINT_RING = 12;
const LOCATE_ID = "locate";

export type InspectorView = { status: "loading" } | { status: "ready"; rows: InspectRow[] } | { status: "failed"; reason: string };

export function initialCanvasState(): CanvasState {
  return { hasFrame: false, open: null, shown: null, layout: null, selection: null, currentFrame: null, notice: "", inspector: null, status: "empty", reanchoring: false, reloading: false, message: "Pick a canvas from the list", error: "", unlisted: false, zoom: 100, scale: 1, activity: [], tool: "select", picking: false };
}

// ARCH §13: a row has no `rev` until main sees its file change after the folder
// was added, so a missing one is 0, not unknown.
function reloadKind(before: CanvasRow, after: CanvasRow): ActivityEvent["kind"] {
  return activityKind(before.rev ?? 0, after.rev ?? 0);
}

// One target of an anchors query: a frame id, or an element's doan id and selector.
export interface AnchorTarget { id: string; doanId?: string; selector?: string; frame?: string }
// Where openCanvas moves once the canvas shows: a frame (Quick Open, a deep link, `doan open`, a reply chip) or an
// element by its doan id (a reply chip).
export type OpenTarget = { frame: string } | { element: string };

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
  // `moved` was logged when the move was seen, so its first layout logs nothing.
  private loadKind: ActivityEvent["kind"] = "opened";
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private remeasureTimer: ReturnType<typeof setTimeout> | undefined;
  private jumpTo: number | null = null;
  // The view a fresh load fitted to the board as it was then, until settleFit fits it again to the canvas page's
  // column. Held by identity: any other view (a pan, a zoom, a jump, a remembered view) replaces the object and so
  // ends the wait without a refit.
  private firstFit: View | null = null;
  private pendingFrame: { id: string; index?: number; found?: (found: boolean) => void } | null = null;
  // A reply chip's element, located after the first layout (agent-reply-chips design 'Pressing'). It lives as
  // pendingFrame does and also carries the root and canvas it was asked for: worktrees share canvas ids and paths
  // (POSTMORTEM 2026-11-01), so only that canvas's first layout takes it. A missing target ends silently.
  private pendingLocate: { folder: string; path: string; doanId: string } | null = null;
  private jumpRect: CanvasRect | null = null;
  private jumpKind: "rect" | "point" = "rect";
  private jumpMark: HTMLElement | null = null;
  private viewResize: ResizeObserver | null = null;
  private jumpTimer: ReturnType<typeof setTimeout> | undefined;
  // Selection (design flows 3–7). `seq` orders the renderer's commands against
  // the script's own clicks; each new document starts again at 0.
  private seq = 0;
  private hoverSeq = 0;
  private selectedRect: CanvasRect | null = null;
  private hoverRect: CanvasRect | null = null;
  private altHeld = false;
  private markHidden = false;
  private reanchor: AnchorRequest | null = null;
  private marks: { hover: HTMLElement; selected: HTMLElement; size: HTMLElement } | null = null;
  private sentSelection = "null";
  // Tags inspector requests so an answer for an older selection is dropped.
  private inspectTag = 0;
  private anchorDocument: string | null = null;
  private anchorGeneration = 0;
  private anchorRequest = 0;
  private anchorRevision = 0;
  // The ids last asked for in this document, and the newest reply for them.
  private anchorTargets: ReadonlySet<string> = new Set();
  private anchors: { generation: number; candidates: ReadonlyMap<string, TargetCandidates>; rects: ReadonlyMap<string, PinGeometry> } | null = null;
  // Picking (design §4 'Structure'). The pick channel has its own seq, apart from selection and hover, and lives as
  // long as one canvas document (its token, `pickDocument`): a reload, a same-ID move or the canvas replacing its
  // own document at the same URL restarts it. Not `anchorDocument`: the iframe's load event clears that to re-ask for
  // anchors, also when it comes late for the same document, and a channel restarted then would resend seq 1, which
  // the script has already taken and ignores, leaving the canvas closed to clicks. `activePick` is the pick-start sent to the current document; null while
  // the pick waits for a document's first layout, and after the pick ended. `pickAcked`: that document took it.
  // Until then the iframe gets no pointer input, since a click there would still select.
  private pickDocument: string | null = null;
  private pickSeq = 0;
  private activePick: number | null = null;
  private pickAcked = false;
  private pickListener: ((result: PickResult) => void) | null = null;
  // A pick that ended in a flow which publishes later: told after that publish, so the listener sees the new state.
  private pickEnded: PickResult | null = null;
  // The Frames drawer's last pick-frame command in this document, to tell its reply from a click.
  private pickFrameCommand: { seq: number; id: string } | null = null;
  private locating: { anchor: Anchor; generation: number; request: number; settled: (result: LocateResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  // Hand tool (canvas-hand-tool design '방식', '도구 상태'). The controller lives as long as the app, so the tool
  // outlives the Overview and empty states, which rebuild `state`. `toolChosen`: the person picked one, so a late
  // saved tool does not replace it. A tool chosen during a drag waits for its end (`pendingTool`): lowering the
  // layer first would drop the pointerup on the iframe, which selects.
  private tool: CanvasTool = "select";
  private toolChosen = false;
  private pendingTool: CanvasTool | null = null;
  private spaceHeld = false;
  private drag: { pointerId: number; x: number; y: number } | null = null;
  private layerShown = false;
  private canvasPage = true;
  // The newest canvas click waiting for main's cursor reading; an older reading does not move focus.
  private clickTag = 0;

  // Raised by every move or selection change; a workspace open that waits for its folder's read goes ahead only
  // while it is still the latest. `valid` checks the destination against the current list right before applying.
  private transitionIntent = 0;
  private transition(apply: () => void, valid: () => boolean = () => true): void {
    this.transitionIntent++;
    if (valid()) apply();
  }

  private recordDocument(event: ActivityEvent): void {
    this.state.activity = pushActivity(this.state.activity, event, 50);
  }

  private resetAnchors(): void {
    // A locate asked the document being replaced; its nodes mean nothing in the next one.
    this.endLocate();
    this.anchorGeneration++;
    this.anchorDocument = null;
    this.anchorRevision = 0;
    this.anchorTargets = new Set();
    this.anchors = null;
  }

  // Asks the canvas where `targets` are now; its reply replaces any earlier one. The canvas answers again by
  // itself when its layout, scroll or DOM changes. Returns the generation the reply's node tokens belong to, or
  // null when no document has laid out yet.
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

  // Chip locate (design §2 'Chip locate'): finds the anchor in the shown document, moves the view to it (settleLocate)
  // and highlights it for 1.2 s; a point gets a 12 px ring at its offset in its frame. `settled` hears "missing" when
  // the canvas has no unique match, "timeout" when it does not answer within MEASURE_ANSWER_MS. A newer locate or a
  // new document drops one in flight without an answer. false: no shown document to ask, so locate is unavailable.
  // Never changes the selection, main's selection or the composer.
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

  // Frames move as picking one in the drawer does (fitFrame); elements and points keep the scale and are centred,
  // an element larger than the view zoomed out to fit (design §2 'Chip locate', 2026-11-02 user).
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
    private inspect: (selector: string) => Promise<InspectResult>,
    // The drag layer App renders right after the overlay: over the board and the iframe, under the canvas chrome.
    private layer: Pick<HTMLElement, "hidden" | "dataset" | "addEventListener" | "removeEventListener" | "setPointerCapture" | "releasePointerCapture" | "hasPointerCapture">,
    // Main's reading of the OS cursor in the window's content coordinates, null when it cannot tell.
    private pointer: () => Promise<{ x: number; y: number } | null>,
  ) {
    if (typeof ResizeObserver !== "undefined" && "nodeType" in viewport) {
      this.viewResize = new ResizeObserver(() => this.applyView());
      this.viewResize.observe(viewport as unknown as Element);
    }
    window.addEventListener("message", this.receive);
    window.addEventListener("wheel", this.preventPageZoom, { passive: false });
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("pointermove", this.pointerOnApp, { capture: true });
    window.addEventListener("blur", this.appBlur);
    viewport.addEventListener("click", this.clickOnMargin);
    viewport.addEventListener("wheel", this.wheelOnMargin, { passive: false });
    layer.hidden = true;
    layer.addEventListener("pointerdown", this.layerDown);
    layer.addEventListener("pointermove", this.layerMove);
    layer.addEventListener("pointerup", this.layerUp);
    layer.addEventListener("pointercancel", this.layerUp);
    layer.addEventListener("lostpointercapture", this.layerUp);
  }

  dispose(): void {
    this.pickListener = null;
    this.endLocate();
    this.viewResize?.disconnect();
    window.removeEventListener("message", this.receive);
    window.removeEventListener("wheel", this.preventPageZoom);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("pointermove", this.pointerOnApp, { capture: true });
    window.removeEventListener("blur", this.appBlur);
    this.viewport.removeEventListener("click", this.clickOnMargin);
    this.viewport.removeEventListener("wheel", this.wheelOnMargin);
    this.layer.removeEventListener("pointerdown", this.layerDown);
    this.layer.removeEventListener("pointermove", this.layerMove);
    this.layer.removeEventListener("pointerup", this.layerUp);
    this.layer.removeEventListener("pointercancel", this.layerUp);
    this.layer.removeEventListener("lostpointercapture", this.layerUp);
    this.dropFrame();
  }

  private publish(): void {
    // First: a board that went away ends a drag, and the tool chosen during it applies now.
    this.syncLayer();
    this.state.tool = this.tool;
    this.state.hasFrame = this.frame !== null;
    this.state.reanchoring = this.reanchor !== null;
    this.state.reloading = this.loading && this.state.status === null;
    this.syncMain();
    this.changed({ ...this.state });
    const ended = this.pickEnded;
    this.pickEnded = null;
    if (ended) this.pickListener?.(ended);
  }

  // Main keeps the one app-wide selection for `doan active` (design flow 11).
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
    return JSON.stringify([layout?.frames.map(frame => [frame.id, frame.title]), layout?.truncated, status, shown, unlisted]);
  }

  updateEntries(next: FolderEntry[]): void {
    this.applyEntries(next);
    // After the open canvas has followed this update, so the entered workspace
    // starts from the new list rather than being diffed against the old one.
    const waiting = this.waitingWorkspace;
    const kind = waiting && next.find(entry => entry.path === waiting.folder)?.kind;
    if (!waiting || kind === "loading") return;
    this.waitingWorkspace = null;
    if (waiting.intent === this.transitionIntent && (kind === "list" || waiting.unavailable)) {
      this.transition(waiting.open, () => this.entries.find(entry => entry.path === waiting.folder)?.kind !== "loading");
    }
  }

  private applyEntries(next: FolderEntry[]): void {
    for (const root of this.workspaceMemory.keys()) {
      if (!next.some(entry => entry.path === root)) this.workspaceMemory.delete(root);
    }
    const prev = this.entries;
    this.entries = next;
    const open = this.state.open;
    if (open === null) { this.trash.sweep(next); return; }
    const update = canvasViewUpdate(prev, next, open, this.trash);
    this.trash.sweep(next);
    // Reads the flow-7 table for every folder update in one place. For reload
    // and clear, load() and dropFrame() apply the same effect again, so either
    // path alone keeps the rule (the clearing-row tests go red only without both).
    this.applySelectionEffect(update);
    switch (update.kind) {
      case "reload":
        // Another canvas id at this path is another canvas: like opening one, it ends the pick.
        if (update.idChanged) this.endPick({ kind: "cancelled" });
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        this.load(update.canvas, false, reloadKind(open.row, update.canvas));
        break;
      case "moved": {
        const to = update.canvas.path, at = new Date();
        this.state.error = "";
        this.state.open = { folder: open.folder, canvas: to, row: update.canvas };
        this.state.shown = to;
        const remembered = this.workspaceMemory.get(open.folder);
        if (remembered?.path === open.canvas) remembered.path = to;
        // A reply chip's element still waiting for this canvas's first layout follows it, as the waiting frame does.
        if (this.pendingLocate?.folder === open.folder && this.pendingLocate.path === open.canvas) this.pendingLocate = { ...this.pendingLocate, path: to };
        this.recordDocument({ ...activityKey(open.folder, update.canvas), at, kind: "moved", from: open.canvas });
        // The same canvas reloaded at its new path: the view stays and the selection is asked for again.
        this.load(update.canvas, false, "moved");
        this.canvasMoved?.({ folder: open.folder, from: open.canvas, row: update.canvas });
        break;
      }
      case "resize":
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        if (update.canvas.width === undefined || this.frame === null) this.load(update.canvas, this.frame === null, reloadKind(open.row, update.canvas));
        else this.setFrameWidth(update.canvas.width);
        break;
      case "clear": {
        const name = projectNames(prev.map(entry => entry.path)).get(open.folder) ?? open.folder;
        this.state.open = null;
        this.state.shown = null;
        this.state.error = "";
        this.dropFrame();
        if (update.reason === "missing" || update.reason === "duplicateId") this.canvasRemoved?.({ folder: open.folder, row: open.row, duplicates: update.reason === "duplicateId" ? update.count : null });
        this.state.status = update.reason === "closed" ? "empty" : "missing";
        this.state.message = update.reason === "closed" ? "Pick a canvas from the list"
          : update.reason === "notFound" ? `The project ${name} is missing. Use Locate above.`
          : update.reason === "uninitialized" ? `The project ${name} is not set up. Use Set Up above.`
          : `${open.canvas} is no longer in the list. It was deleted or moved.`;
        break;
      }
      // Keep the last rendered document while its folder cannot be read.
      case "errorLine": this.state.error = update.message; break;
      case "none": {
        // A listing change that needs no reload still updates the row.
        const entry = next.find(entry => entry.path === open.folder);
        const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === open.canvas) : undefined;
        if (row) this.state.open = { ...open, row };
        break;
      }
    }
    this.publish();
  }

  private workspaceMemory = new Map<string, { path: string; view: View }>();
  // The open canvas left the folder's list (deleted or moved). `duplicates`:
  // how many rows now use its id, when that is why it was not followed.
  canvasRemoved: ((removed: { folder: string; row: CanvasRow; duplicates: number | null }) => void) | null = null;
  // A `trashed` clear calls neither canvasRemoved nor canvasMoved: App shows the Overview from `open: null` alone and
  // records no visit, as for a missing canvas (App.canvasTrash.test.tsx).
  // Move to Trash marks: begin before `canvas:trash` is sent, settle with its reply.
  readonly trash = new TrashMarks();
  // The open canvas was followed to `row`, the row of the list that decided it.
  canvasMoved: ((move: { folder: string; from: string; row: CanvasRow }) => void) | null = null;
  // Pans do not publish state, so persistence listens here.
  viewChanged: (() => void) | null = null;
  linkedCanvas: ((root: string) => void) | null = null;
  currentView(): View { return { ...this.view }; }
  // Per-root memory as saved to and restored from `ui-state.json` (`lastByRoot`).
  memory(): Record<string, { canvas: string; view: View }> {
    return Object.fromEntries([...this.workspaceMemory].map(([root, item]) => [root, { canvas: item.path, view: { ...item.view } }]));
  }
  remember(root: string, item: { canvas: string; view: View } | null): void {
    if (item === null) this.workspaceMemory.delete(root);
    else this.workspaceMemory.set(root, { path: item.canvas, view: { ...item.view } });
  }
  private workspaceActive = true;
  setWorkspaceActive(active: boolean): void {
    this.workspaceActive = active;
    if (!active) this.cancelWorkspaceOpen();
    if (!active) this.releaseInput();
    // Leaving the canvas page for another screen cancels the pick.
    if (!active && this.state.picking) { this.endPick({ kind: "cancelled" }); this.publish(); }
  }

  // The canvas page is on screen: not Home, the Overview or a modal. V, H and Space act only there.
  setCanvasPage(shown: boolean): void {
    this.canvasPage = shown;
    if (!shown) this.releaseInput();
  }

  private onCanvasPage(): boolean { return this.workspaceActive && this.canvasPage; }

  // The toolbar's Select and Hand. A pick runs ahead of the tool, so they change nothing meanwhile, like V and H.
  setTool(tool: CanvasTool): void {
    if (this.state.picking) return;
    this.toolChosen = true;
    this.applyTool(tool);
  }

  // The tool read from ui-state at launch; a tool the person chose before the read stays.
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

  // Switching to Hand drops the selection (canvas-selection-tools spec 1). A held Space and a pick leave `tool`
  // alone, so they keep it. Does not publish: callers do.
  private enterTool(tool: CanvasTool): void {
    const toHand = this.tool === "select" && tool === "hand";
    this.tool = tool;
    if (toHand) this.dropSelection();
  }

  // Esc's clear without its publish. The clear command raises the selection seq, so a select the canvas sent before
  // it cannot bring the selection back, and it makes the script forget the node its layouts would report again.
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

  // A project added a moment ago is still being read when its "Added" toast
  // offers Open; dropping that click left the previous workspace on screen.
  // Any later transition bumps `transitionIntent` and so supersedes the wait.
  private waitingWorkspace: { folder: string; intent: number; open: () => void; unavailable: boolean } | null = null;

  openWorkspace(folder: string, entered: (folder: string) => void, sameCanvas = false, unavailable?: (entry: FolderEntry | undefined) => void, overview = false): void {
    const kind = () => this.entries.find(entry => entry.path === folder)?.kind;
    this.transition(() => {
      this.waitingWorkspace = null;
      const open = () => { if (kind() === "list") this.enterWorkspace(folder, entered, sameCanvas, overview); else unavailable?.(this.entries.find(entry => entry.path === folder)); };
      if (kind() === "loading") this.waitingWorkspace = { folder, intent: this.transitionIntent, open, unavailable: !!unavailable };
      else open();
    }, () => kind() === "list" || kind() === "loading" || !!unavailable);
  }

  private enterWorkspace(folder: string, entered: (folder: string) => void, sameCanvas: boolean, overview: boolean): void {
    const entry = this.entries.find(entry => entry.path === folder);
    if (entry?.kind !== "list") return;
    const open = this.state.open;
    if (open) this.workspaceMemory.set(open.folder, { path: open.canvas, view: { ...this.view } });
    const remembered = this.workspaceMemory.get(folder);
    const row = overview ? undefined : switchTarget(sameCanvas ? open?.row.id : undefined, entry.canvases, remembered?.path);
    if (row) {
      this.openCanvasNow(folder, row);
      if (remembered?.path === row.path) { this.view = { ...remembered.view }; this.applyView(); }
    } else {
      this.dropFrame();
      this.state = { ...initialCanvasState(), activity: this.state.activity };
      this.publish();
    }
    entered(folder);
  }

  // `shown`: told once the Overview is on screen.
  showOverview(shown?: () => void): void {
    if (!this.state.open) { this.cancelWorkspaceOpen(); shown?.(); return; }
    this.transition(() => {
      const open = this.state.open;
      if (open) this.workspaceMemory.set(open.folder, { path: open.canvas, view: { ...this.view } });
      this.dropFrame();
      this.state = { ...initialCanvasState(), activity: this.state.activity };
      this.publish();
      shown?.();
    });
  }

  // `opened`: told once the canvas is the open one. A frame or element target replaces any earlier one still waiting
  // for the first layout: the last request wins.
  openCanvas(folder: string, row: CanvasRow, to?: OpenTarget, target?: { index?: number; found?: (found: boolean) => void; unavailable?: (entry: FolderEntry | undefined) => void; opened?: () => void }): void {
    const frameId = to && "frame" in to ? to.frame : undefined;
    const element = to && "element" in to ? to.element : undefined;
    if (this.state.open?.folder === folder && this.state.shown === row.path) {
      this.cancelWorkspaceOpen();
      target?.opened?.();
      if (frameId !== undefined) {
        this.pendingLocate = null;
        const frames = this.state.layout?.frames ?? [];
        const index = target?.index !== undefined && frames[target.index]?.id === frameId ? target.index : frames.findIndex(frame => frame.id === frameId);
        if (index >= 0) this.jump(index);
        if (this.loading && !this.state.layout) this.pendingFrame = { id: frameId, ...target };
        else target?.found?.(index >= 0);
      }
      if (element !== undefined) {
        this.pendingFrame = null;
        this.pendingLocate = { folder, path: row.path, doanId: element };
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
      this.openCanvasNow(folder, opening);
      this.pendingFrame = frameId === undefined ? null : { id: frameId, ...target };
      this.pendingLocate = element === undefined ? null : { folder, path: opening.path, doanId: element };
      if (this.state.status === "noWidth") { this.pendingFrame?.found?.(false); this.pendingFrame = null; this.pendingLocate = null; }
      target?.opened?.();
    }, () => {
      if (current() !== undefined) return true;
      target?.unavailable?.(this.entries.find(entry => entry.path === folder));
      return false;
    });
  }

  // A move the person made in the conversation panel before the opened canvas laid out (choosing another conversation,
  // New, ⌘N) drops the reply chip's element still waiting there.
  dropPendingLocate(): void { this.pendingLocate = null; }

  private locatePending(): void {
    const pending = this.pendingLocate, open = this.state.open;
    this.pendingLocate = null;
    if (pending === null || open?.folder !== pending.folder || open.canvas !== pending.path) return;
    this.locate({ element: { doanId: pending.doanId } }, () => {});
  }

  private openCanvasNow(folder: string, row: CanvasRow): void {
    const previous = this.state.open;
    if (previous && previous.folder !== folder) this.workspaceMemory.set(previous.folder, { path: previous.canvas, view: { ...this.view } });
    this.state.open = { folder, canvas: row.path, row };
    this.state.shown = row.path;
    this.state.error = "";
    this.load(row, true);
  }

  // A new element ends the old document before resetting its measurement viewport.
  private load(row: CanvasRow, fresh: boolean, kind: ActivityEvent["kind"] = fresh ? "opened" : "reloaded"): void {
    // The document under a drag or a held Space goes away; neither carries over to the next one.
    this.stopDrag();
    this.spaceHeld = false;
    this.clearJump();
    // A reload of the same row before its first layout still owes the picked frame and element.
    if (fresh) { this.pendingFrame = null; this.pendingLocate = null; }
    // A new document restarts the pick channel. Opening a canvas ends the pick (dropFrame below); a reload or a
    // same-ID move keeps it for the new document's first layout.
    this.pickDocument = null;
    this.resetPickChannel();
    this.resetAnchors();
    // A plain reload that replaces a changed one before its layout keeps Changed.
    this.loadKind = !fresh && this.loading && this.loadKind === "changed" && kind === "reloaded" ? "changed" : kind;
    this.applySelectionEffect({ kind: fresh ? "otherCanvas" : "reload" });
    if (row.width === undefined) {
      this.pendingFrame?.found?.(false);
      this.dropFrame();
      this.state.status = "noWidth";
      this.state.message = "Could not read a valid board width. Run doan check in a terminal to diagnose the canvas.";
      this.publish();
      return;
    }
    const next = document.createElement("iframe");
    next.setAttribute("sandbox", "allow-scripts");
    // The draft's own controls are not the app's: Tab walking into them drew their focus rings and made Chromium
    // scroll the canvas area to reveal them, carrying the floating tools out of view (dogfooding).
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
      this.view = fitWidth(row.width, this.viewportSize(), FIT_INSET);
      this.firstFit = this.view;
      this.applyView();
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
    this.hoverRect = null;
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
      this.pendingLocate = null;
      this.applySelectionEffect({ kind: "loadFailed" });
      this.endPick({ kind: "cancelled" });
      this.publish();
    }, FIRST_LAYOUT_TIMEOUT_MS);
    this.publish();
  }

  private dropFrame(): void {
    this.stopDrag();
    this.spaceHeld = false;
    this.endPick({ kind: "cancelled" });
    this.pickDocument = null;
    this.clearJump();
    this.pendingFrame = null;
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
      if (message.key === "Escape") this.escape(false);
      // Space, V and H come only from a canvas focused by an ⌥-click. A Space down is believed only while the iframe
      // has focus, so a canvas cannot raise the layer over a person's clicks by itself; its release always counts.
      else if (message.key === "Space") this.shortcut({ kind: "space", down: message.down }, !this.onCanvasPage() || document.activeElement !== this.frame);
      else if (message.key === "V" || message.key === "H") this.shortcut({ kind: "tool", tool: message.key === "V" ? "select" : "hand" }, !this.onCanvasPage());
      // Unlike Escape, an old modifier snapshot must not override a newer press.
      else if (message.key === "Alt" && message.seq >= this.hoverSeq) {
        this.hoverSeq = message.seq;
        this.altHeld = message.alt;
        this.drawMarks();
      }
      return;
    }
    if (message.type === "hover") { this.hoverSeq = message.seq; this.hoverRect = message.rect; this.drawMarks(); return; }
    if (!this.commandReply(message)) this.focusOnClick();
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
    this.requestRows(view);
    this.publish();
  }

  // A click takes a seq at least the renderer's: it can win the race with a command still on its way and take that
  // command's seq. A select-anchor reply names its command; a pick-frame reply has no name, so it is the frame the
  // drawer asked for at that command's seq. The canvas never answers a clear.
  private commandReply(message: Exclude<SelectionMessage, { type: "hover" | "key" }>): boolean {
    if (message.type === "clear") return false;
    if (message.answer !== undefined) return true;
    const asked = this.pickFrameCommand;
    return asked !== null && message.seq === asked.seq && message.target !== null && message.target.element === undefined && message.target.frame?.id === asked.id;
  }

  // Every select (click, Frames list, ancestor path, the anchor found again
  // after a reload) asks again: values may have changed with the document.
  private requestRows(view: SelectionView): void {
    const tag = ++this.inspectTag;
    const selector = view.element?.selector ?? view.path.at(-1)?.selector;
    if (selector === undefined) { this.state.inspector = { status: "failed", reason: "The canvas could not be inspected." }; return; }
    this.state.inspector = { status: "loading" };
    const settle = (inspector: InspectorView) => {
      if (tag !== this.inspectTag) return;
      this.state.inspector = inspector;
      this.publish();
    };
    this.inspect(selector).then(
      result => settle(result.ok ? { status: "ready", rows: result.rows } : { status: "failed", reason: result.reason }),
      (error: unknown) => {
        console.error("inspect:get failed", error);
        settle({ status: "failed", reason: "The canvas could not be inspected." });
      },
    );
  }

  private applySelectionEffect(trigger: SelectionTrigger): void {
    if (this.state.selection === null && this.reanchor === null && trigger.kind !== "anchorLost") return;
    const effect = selectionAfter(trigger);
    if (!effect.keep) { this.clearSelection(effect.notice); return; }
    if (!effect.mark && this.state.selection !== null) {
      // Ask the next document for the same anchor after its first layout.
      this.reanchor = anchorRequest(this.state.selection);
      this.markHidden = true;
      this.drawMarks();
    }
  }

  // Does not publish: callers publish once with their other changes.
  private clearSelection(notice: boolean): void {
    this.state.selection = null;
    this.state.inspector = null;
    this.inspectTag++;
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

  private sendCommand(message: object): void {
    this.seq += 1;
    this.post({ ...message, seq: this.seq });
  }

  private sendHoverCommand(message: object): void {
    this.hoverSeq += 1;
    this.post({ ...message, seq: this.hoverSeq });
  }

  // Without a selection to clear, Esc and a blank click only raise the intent,
  // which still cancels a pending Open: the person's latest action wins over an open that was still waiting.
  private clearOnEscape(): void {
    if (!shouldGuardEscape(this.state.selection, this.reanchor)) { this.transitionIntent++; return; }
    this.transition(() => this.escapeNow());
  }

  private escapeNow(): void {
    if (this.state.selection === null && this.reanchor === null) return;
    this.sendCommand({ type: "clear" });
    this.clearSelection(false);
    this.publish();
  }

  // The one listener for how picks end; returns its removal.
  onPicked(listener: (result: PickResult) => void): () => void {
    this.pickListener = listener;
    return () => { if (this.pickListener === listener) this.pickListener = null; };
  }

  // Puts the shown canvas in the pick tool until one click names a target, Esc, cancelPick or leaving the canvas.
  // false: no canvas is shown. A reload in progress keeps the pick for the new document's first layout.
  pick(): boolean {
    if (this.frame === null || this.state.open === null || this.state.status !== null || this.state.unlisted) return false;
    if (this.state.picking) return true;
    // A pick that starts drops the selection, ahead of pick-start so the script lets go of it before picking.
    this.dropSelection();
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

  // Sent once the current document has laid out with its token; the token keeps a command from reaching the
  // document that replaces this one.
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

  // The canvas takes pointer input unless a pick waits for the current document to acknowledge its start. Pans and
  // zooms then land on the board's margin handlers, so they keep working.
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

  // A reply counts only for the pick-start in force in the current document: one after Esc, a toggle, leaving the
  // canvas or a newer pick names another seq, or none, and one from a replaced document another token.
  private receivePicked(message: PickedMessage): void {
    if (!this.state.picking || this.activePick === null || message.pick !== this.activePick || message.document !== this.pickDocument ||
      this.lastHref === null || !sameDocument(this.lastHref, message.href)) return;
    if ("cancelled" in message) { this.cancelPick(); return; }
    // The picker's boundary: only frames and what is in them can be chips. A forged or stray reply for anything
    // outside every frame keeps picking (targetAnchor itself still takes such a selection for Add to conversation).
    if ("target" in message && message.target.frame === undefined) return;
    const frames = this.state.layout?.frames ?? [];
    const anchor = "target" in message ? targetAnchor(message.target) : pointAnchor(message.point, frames);
    // Outside every frame there is nothing to point at, and the pick goes on.
    if (anchor === null) return;
    this.endPick({ kind: "picked", anchor, frames });
    this.publish();
  }

  selectPath(item: PathItem): void { this.transition(() => this.selectPathNow(item)); }

  private selectPathNow(item: PathItem): void {
    if (this.frame === null) return;
    this.sendCommand(item.doanId === undefined ? { type: "select-anchor", selector: item.selector } : { type: "select-anchor", doanId: item.doanId, selector: item.selector });
  }

  private keydown = (event: KeyboardEvent): void => {
    if (!this.workspaceActive) return;
    if (event.key === "Alt") {
      // Focus may move into the canvas before keyup; fence off earlier snapshots.
      if (!this.altHeld) this.sendHoverCommand({ type: "hover-alt", alt: true });
      this.altHeld = true;
      this.drawMarks();
      return;
    }
    const shortcut = toolShortcut(event, { canvasPage: this.canvasPage });
    if (shortcut !== null) { if (this.shortcut(shortcut, false)) event.preventDefault(); return; }
    // A held Space's repeats keep its default (scrolling, pressing) off too.
    if (event.code === "Space" && event.repeat && this.spaceHeld) { event.preventDefault(); return; }
    if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    // Esc while picking cancels only the pick, wherever focus is: the composer, the canvas or the panel. Menus and
    // the `/` list handle their Esc first and prevent it (design §2 'Esc and cancel').
    const step = this.escape(editableTarget(event.target));
    if (step === "cancelPick" || step === "selectTool") event.preventDefault();
  };

  // Esc's next step (canvas-hand-tool design '키' 'Esc'); `editable`: it came from a text field. Returns the step.
  private escape(editable: boolean): ReturnType<typeof escapeStep> {
    const step = escapeStep({ picking: this.state.picking, hand: this.canvasPage && (this.pendingTool ?? this.tool) === "hand", editable });
    if (step === "cancelPick") this.cancelPick();
    else if (step === "selectTool") { this.toolChosen = true; this.applyTool("select"); }
    else if (step === "clearSelection") this.clearOnEscape();
    return step;
  }

  // V, H and Space from the app or a focused canvas; `ignored`: the source does not count. A pick runs ahead of the
  // tool, so it takes neither. Returns whether the key was the canvas's.
  private shortcut(shortcut: ToolShortcut, ignored: boolean): boolean {
    if (shortcut.kind === "space" && !shortcut.down) {
      const held = this.spaceHeld;
      this.spaceHeld = false;
      this.syncLayer();
      return held;
    }
    if (ignored || this.state.picking) return false;
    if (shortcut.kind === "tool") { this.toolChosen = true; this.applyTool(shortcut.tool); return true; }
    // Without a drawn board Space does nothing, and a Space held from then does not pan the board that comes later.
    if (!this.boardDrawn()) return false;
    this.spaceHeld = true;
    this.syncLayer();
    return true;
  }

  private keyup = (event: KeyboardEvent): void => {
    const shortcut = toolShortcut(event, { canvasPage: this.canvasPage });
    if (shortcut !== null) { if (this.shortcut(shortcut, false)) event.preventDefault(); return; }
    if (event.key !== "Alt") return;
    this.altHeld = false;
    this.sendHoverCommand({ type: "hover-alt", alt: false });
    this.drawMarks();
  };

  // The window's blur also fires when focus moves into the canvas iframe; only the app losing focus releases Space.
  private appBlur = (): void => {
    if (!document.hasFocus()) this.releaseInput();
  };

  private releaseInput(): void {
    this.spaceHeld = false;
    this.finishDrag();
  }

  private pointerOnApp = (event: PointerEvent): void => {
    this.altHeld = event.altKey;
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
    this.clearOnEscape();
  };

  // A click on the canvas sends the keys after it there, not to the composer. Never during a pick: its chip goes in at
  // the composer's caret. The click reaches the app only as the canvas's message, which a canvas can send without one,
  // and the app gets no pointer event while the pointer is over the out-of-process iframe (it enters straight from the
  // composer or the tools row). So main reads the OS cursor, and focus moves only when it is over the canvas area,
  // read soon after this click and before anything else took focus.
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

  // The layer shows while Hand or a held Space can pan a drawn board, and through a drag in progress.
  private boardDrawn(): boolean {
    return !this.state.picking && this.frame !== null && this.state.status === null && !this.state.unlisted;
  }

  private syncLayer(): void {
    const board = this.boardDrawn();
    // A drag and a held Space end with the board they were on; the tool stays.
    if (!board) { this.stopDrag(); this.spaceHeld = false; }
    const show = board && (this.tool === "hand" || this.spaceHeld || this.drag !== null);
    if (show && !this.layerShown) {
      // The iframe gets no pointermove under the layer, and an OOPIF's pointerout cannot be trusted (POSTMORTEM 2026-10-23).
      this.hoverRect = null;
      this.sendHoverCommand({ type: "hover-leave" });
    }
    this.layerShown = show;
    this.layer.hidden = !show;
    if (this.drag !== null) this.layer.dataset.grabbing = "";
    else delete this.layer.dataset.grabbing;
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

  // Only the primary button drags, with any modifier. The layer never takes focus; a drag in Hand moves it to the
  // canvas area as a click there would, while a held Space already has it where Space came from.
  private layerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (event.button !== 0 || this.drag !== null) return;
    if (!this.spaceHeld) this.viewport.focus(CLICK_FOCUS);
    // Keeps the drag when the pointer leaves the window.
    this.layer.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.syncLayer();
  };

  // Each move's own travel, not the start plus the total: a zoom during the drag stays. The board's transform holds
  // the scale, so screen px move it 1:1.
  private layerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx === 0 && dy === 0) return;
    this.view = panBy(this.view, dx, dy);
    this.applyView();
  };

  private layerUp = (event: PointerEvent): void => {
    if (this.drag === null || event.pointerId !== this.drag.pointerId) return;
    this.finishDrag();
  };

  private onLayout(message: LayoutMessage): void {
    const documentChanged = message.document !== undefined && message.document !== this.anchorDocument;
    if (documentChanged) { this.resetAnchors(); this.anchorDocument = message.document ?? null; }
    // Another document, even at the same URL in the same iframe (the canvas's own location.reload()), ends the pick
    // channel of the one it replaced; the pick itself goes on below unless the page is another canvas.
    if (message.document !== undefined && message.document !== this.pickDocument) {
      this.pickDocument = message.document;
      this.resetPickChannel();
      // A held Space and a drag end with the board they were on, also when the canvas replaces its own document
      // (its location.reload()), which keeps the iframe; the tool stays. Not on the anchor document's change: the
      // iframe's load event forgets that one while the document stays.
      if (this.spaceHeld || this.drag !== null) { this.spaceHeld = false; this.finishDrag(); }
    }
    const before = this.layoutDisplayKey();
    const previousCurrent = this.state.currentFrame;
    const beforeSelection = this.state.selection;
    const previousActivity = this.state.activity;
    const previousPicking = this.state.picking;
    const newDocument = this.lastHref !== null && !sameDocument(this.lastHref, message.href);
    // Against the height before this layout resizes the iframe, as layoutHeight does.
    const selected = selectedFromLayout({ ...this.expectation(), href: message.href }, message);
    this.setFrameHeight(layoutHeight(this.lastHref, this.frameHeight, message));
    // A layout that does not confirm the current height (measured before the
    // iframe had its viewport, or before our resize) needs another one, and the
    // canvas sends that one on an animation frame an off-screen iframe never
    // gets. `measure` is answered without one.
    clearTimeout(this.remeasureTimer);
    if (Math.abs(message.viewport - this.frameHeight) > 1 || Math.min(message.height, MAX_HEIGHT) !== this.frameHeight) {
      const frame = this.frame;
      this.remeasureTimer = setTimeout(() => { if (frame === this.frame) this.post({ type: "measure" }); }, REMEASURE_MS);
    }
    this.lastHref = message.href;
    clearTimeout(this.answerTimer);
    if (newDocument) {
      this.clearJump();
      this.jumpTo = null;
      this.seq = 0;
      this.pickFrameCommand = null;
      this.hoverSeq = 0;
      this.hoverRect = null;
      this.applySelectionEffect({ kind: "otherCanvas" });
      // A link or the canvas's own script left for another page: another canvas, so the pick ends.
      this.resetPickChannel();
      this.endPick({ kind: "cancelled" });
    }
    const first = this.loading;
    if (first) {
      this.loading = false;
      clearTimeout(this.loadTimer);
      this.board.style.visibility = "";
      this.state.status = null;
      if (this.reanchor !== null) this.sendCommand({ type: "select-anchor", ...this.reanchor });
    }
    this.state.layout = message;
    const linked = this.markShown(message.href);
    if (linked && this.state.open) this.linkedCanvas?.(this.state.open.folder);
    if (this.state.unlisted) this.endPick({ kind: "cancelled" });
    else if (this.state.picking && this.activePick === null) this.armPick();
    if ((first || linked) && this.state.open && !this.state.unlisted && (linked || this.loadKind !== "moved")) {
      const at = new Date();
      this.recordDocument({ ...activityKey(this.state.open.folder, this.state.open.row), at, kind: linked ? "opened" : this.loadKind });
    }
    if (first && this.pendingFrame !== null) {
      const target = this.pendingFrame;
      const index = target.index !== undefined && message.frames[target.index]?.id === target.id ? target.index : message.frames.findIndex(frame => frame.id === target.id);
      this.jumpTo = index >= 0 ? index : null;
      this.pendingFrame = null;
      target.found?.(index >= 0);
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
    if (selected !== undefined && !newDocument && this.state.selection !== null && this.reanchor === null) {
      if (selected === null) this.applySelectionEffect({ kind: "anchorLost" });
      else { this.selectedRect = selected; this.drawMarks(); }
    }
    this.state.currentFrame = this.state.unlisted ? null : currentFrame(message.frames, this.view, this.viewportSize());
    if (first || previousCurrent !== this.state.currentFrame || documentChanged || before !== this.layoutDisplayKey() || previousActivity !== this.state.activity || beforeSelection !== this.state.selection || previousPicking !== this.state.picking) this.publish();
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
    this.jumpTo = index;
    this.post({ type: "measure" });
  }

  // `index` and `id` are the row the frame drawer drew, which may predate the current layout. Like Quick Open's
  // pending frame: the index while it still holds that id, else the id's first frame, else nothing.
  selectFrame(index: number, id: string): void {
    const resolve = () => {
      const frames = this.state.unlisted ? [] : this.state.layout?.frames ?? [];
      return frames[index]?.id === id ? index : frames.findIndex(frame => frame.id === id);
    };
    if (resolve() < 0) return;
    this.transition(() => {
      const at = resolve();
      if (at < 0) return;
      this.jump(at);
      this.sendCommand({ type: "pick-frame", index: at, id });
      this.pickFrameCommand = { seq: this.seq, id };
    }, () => resolve() >= 0);
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
    }
    this.applyView();
  }

  // The first Fit of a freshly opened canvas, again at the board's present size (buzz-canvas design §2 '첫 Fit'). The
  // canvas loads while the Overview still lays out the page (its right column is 280 wide), so the renderer calls this
  // once the canvas page's own column width is applied. Only once per load; later width changes keep the top-left.
  settleFit(): void {
    const pending = this.firstFit;
    this.firstFit = null;
    if (pending === null || pending !== this.view || this.frame === null) return;
    this.view = fitWidth(this.frameWidth, this.viewportSize(), FIT_INSET);
    this.applyView();
  }

  // The zoom menu's fixed percentages: the view center stays put, like the steps and 100%.
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
    // The element under the cursor changes without a pointermove (flow 2).
    this.hoverRect = null;
    const action = wheelAction(input);
    this.view = "zoom" in action ? zoomAt(this.view, action.zoom, point, ZOOM_LIMITS) : panBy(this.view, action.pan.dx, action.pan.dy);
    this.applyView();
  }

  private applyView(): void {
    this.board.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    this.drawMarks();
    this.drawJump();
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
  // Marks live outside the iframe so the canvas DOM, its MutationObserver and
  // the anchors stay untouched; drawn in screen px so lines stay 1px at any
  // scale, while the size label (a child of the selection mark, centered
  // under it by CSS) reads canvas px.
  private drawMarks(): void {
    const hover = this.markHidden || this.altHeld || this.layerShown ? null : this.hoverRect;
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
    place(this.marks.hover, hover);
    place(this.marks.selected, selected);
    if (selected !== null) this.marks.size.textContent = sizeLabel(selected);
  }

  private setFrameWidth(width: number): void { this.frameWidth = width; if (this.frame) this.frame.style.width = `${width}px`; }
  private setFrameHeight(height: number): void { this.frameHeight = height; if (this.frame) this.frame.style.height = `${height}px`; }
  private viewportSize() { return { width: this.viewport.clientWidth, height: this.viewport.clientHeight }; }
}
