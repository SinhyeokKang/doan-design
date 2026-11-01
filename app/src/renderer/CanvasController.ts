import type { PinGeometry, TargetCandidates } from "../comments/projection";
import type { AnchorsMessage } from "./canvasMessage";
import type { Selection } from "../formats/types";
import type { ViewCommand } from "../main/index";
import type { InspectResult, InspectRow } from "../main/inspect";
import type { CanvasRow, FolderEntry } from "../main/view";
import { acceptCanvasMessage, type CanvasRect, type LayoutMessage, type PathItem, type SelectionMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, INITIAL_HEIGHT, layoutHeight, MAX_HEIGHT, sameDocument, type OpenCanvas } from "./canvasView";
import { projectNames } from "./projectRow";
import { switchTarget } from "./switchTarget";
import { activityKey, activityKind, pushActivity, type ActivityEvent } from "./activity";
import { acceptSelectionMessage, anchorRequest, editableTarget, mainSelection, SELECTION_LOST, selectedFromLayout, selectionAfter, shouldGuardEscape, sizeLabel, type AnchorRequest, type SelectionTrigger, type SelectionView } from "./selection";
import { boardRectToScreen, boardToScreen, FIRST_LAYOUT_TIMEOUT_MS, FIT_INSET, fitFrame, fitWidth, locateView, MAX_SCALE, MIN_SCALE, panBy, wheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt, type Point, type View, type WheelInput } from "./viewport";
import { scaleFactor } from "./zoomControl";
import { currentFrame } from "./currentFrame";

export const MEASURE_ANSWER_MS = 1000;
const REMEASURE_MS = 50;

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
  // The id the open path held before a reload gave it another one (or none),
  // until that id comes back (project-feedback design §5).
  idChangedFrom: string | null;
}

export type InspectorView = { status: "loading" } | { status: "ready"; rows: InspectRow[] } | { status: "failed"; reason: string };

export function initialCanvasState(): CanvasState {
  return { hasFrame: false, open: null, shown: null, layout: null, selection: null, currentFrame: null, notice: "", inspector: null, status: "empty", reanchoring: false, reloading: false, message: "Pick a canvas from the list", error: "", unlisted: false, zoom: 100, scale: 1, activity: [], idChangedFrom: null };
}

// ARCH §13: a row has no `rev` until main sees its file change after the folder
// was added, so a missing one is 0, not unknown.
function reloadKind(before: CanvasRow, after: CanvasRow): ActivityEvent["kind"] {
  return activityKind(before.rev ?? 0, after.rev ?? 0);
}

function pathKey(folder: string, path: string): string { return JSON.stringify([folder, path]); }

// One target of an anchors query: a frame id, or an element's doan id and selector.
export interface AnchorTarget { id: string; doanId?: string; selector?: string; frame?: string }

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
  private jumpRect: CanvasRect | null = null;
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
  }

  // Moves the view to a node of the current anchors at the same zoom and
  // highlights it, without selecting (like a frame jump). `generation` is the
  // one the node came from: node tokens restart in every new document, so an
  // older one may name another element.
  jumpToNode(node: string, generation: number): boolean {
    const rect = generation === this.anchorGeneration ? this.anchors?.rects.get(node) : undefined;
    if (!rect || this.frame === null) return false;
    this.view = locateView(rect, this.viewportSize(), this.view);
    this.showJump(rect);
    this.applyView();
    return true;
  }

  constructor(
    private viewport: Pick<HTMLElement, "clientWidth" | "clientHeight" | "addEventListener" | "removeEventListener" | "getBoundingClientRect">,
    private board: Pick<HTMLElement, "hidden" | "prepend"> & { style: Pick<CSSStyleDeclaration, "transform" | "visibility"> },
    private overlay: Pick<HTMLElement, "append">,
    private changed: (state: CanvasState) => void,
    private sendSelection: (selection: Selection | null) => void,
    private inspect: (selector: string) => Promise<InspectResult>,
  ) {
    if (typeof ResizeObserver !== "undefined" && "nodeType" in viewport) {
      this.viewResize = new ResizeObserver(() => this.applyView());
      this.viewResize.observe(viewport as Element);
    }
    window.addEventListener("message", this.receive);
    window.addEventListener("wheel", this.preventPageZoom, { passive: false });
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("pointermove", this.pointerOnApp, { capture: true });
    viewport.addEventListener("click", this.clickOnMargin);
    viewport.addEventListener("wheel", this.wheelOnMargin, { passive: false });
  }

  dispose(): void {
    this.viewResize?.disconnect();
    window.removeEventListener("message", this.receive);
    window.removeEventListener("wheel", this.preventPageZoom);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("pointermove", this.pointerOnApp, { capture: true });
    this.viewport.removeEventListener("click", this.clickOnMargin);
    this.viewport.removeEventListener("wheel", this.wheelOnMargin);
    this.dropFrame();
  }

  private publish(): void {
    const open = this.state.open;
    const lost = open ? this.idChanges.get(pathKey(open.folder, open.canvas)) : undefined;
    if (open && lost !== undefined && open.row.id === lost) this.idChanges.delete(pathKey(open.folder, open.canvas));
    this.state.idChangedFrom = open && lost !== undefined && open.row.id !== lost ? lost : null;
    this.state.hasFrame = this.frame !== null;
    this.state.reanchoring = this.reanchor !== null;
    this.state.reloading = this.loading && this.state.status === null;
    this.syncMain();
    this.changed({ ...this.state });
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
    if (open === null) return;
    const update = canvasViewUpdate(prev, next, open);
    // Reads the flow-7 table for every folder update in one place. For reload
    // and clear, load() and dropFrame() apply the same effect again, so either
    // path alone keeps the rule (the clearing-row tests go red only without both).
    this.applySelectionEffect(update);
    switch (update.kind) {
      case "reload":
        // The first id the path lost, kept through further changes: its
        // comments are the ones that no longer show.
        if (update.idChanged && open.row.id !== undefined && !this.idChanges.has(pathKey(open.folder, open.canvas))) this.idChanges.set(pathKey(open.folder, open.canvas), open.row.id);
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
        const lost = this.idChanges.get(pathKey(open.folder, open.canvas));
        if (lost !== undefined) { this.idChanges.delete(pathKey(open.folder, open.canvas)); this.idChanges.set(pathKey(open.folder, to), lost); }
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
          : update.reason === "notFound" ? `The project ${name} is missing. Use Locate… to find it.`
          : update.reason === "uninitialized" ? `The project ${name} is not set up. Use Set Up… on Home.`
          : `${open.canvas} is no longer in the list. It was deleted or moved.`;
        break;
      }
      // Keep the last rendered document while its folder cannot be read.
      case "errorLine": this.state.error = update.message; break;
      case "none": {
        // Comment-only changes update metadata without reloading the document.
        const entry = next.find(entry => entry.path === open.folder);
        const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === open.canvas) : undefined;
        if (row) this.state.open = { ...open, row };
        break;
      }
    }
    this.publish();
  }

  private workspaceMemory = new Map<string, { path: string; view: View }>();
  // (root, path) → the id that path lost, for this app run only.
  private idChanges = new Map<string, string>();
  // The open canvas left the folder's list (deleted or moved). `duplicates`:
  // how many rows now use its id, when that is why it was not followed.
  canvasRemoved: ((removed: { folder: string; row: CanvasRow; duplicates: number | null }) => void) | null = null;
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

  // `opened`: told once the canvas is the open one.
  openCanvas(folder: string, row: CanvasRow, frameId?: string, target?: { index?: number; found?: (found: boolean) => void; unavailable?: (entry: FolderEntry | undefined) => void; opened?: () => void }): void {
    if (this.state.open?.folder === folder && this.state.shown === row.path) {
      this.cancelWorkspaceOpen();
      target?.opened?.();
      if (frameId !== undefined) {
        const frames = this.state.layout?.frames ?? [];
        const index = target?.index !== undefined && frames[target.index]?.id === frameId ? target.index : frames.findIndex(frame => frame.id === frameId);
        if (index >= 0) this.jump(index);
        if (this.loading && !this.state.layout) this.pendingFrame = { id: frameId, ...target };
        else target?.found?.(index >= 0);
      }
      return;
    }
    const current = () => {
      const entry = this.entries.find(entry => entry.path === folder);
      return entry?.kind === "list" ? entry.canvases.find(candidate => candidate.path === row.path && candidate.id === row.id && candidate.url === row.url) : undefined;
    };
    this.transition(() => {
      this.openCanvasNow(folder, current() ?? row);
      this.pendingFrame = frameId === undefined ? null : { id: frameId, ...target };
      if (this.pendingFrame && this.state.status === "noWidth") { this.pendingFrame.found?.(false); this.pendingFrame = null; }
      target?.opened?.();
    }, () => {
      if (current() !== undefined) return true;
      target?.unavailable?.(this.entries.find(entry => entry.path === folder));
      return false;
    });
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
    this.clearJump();
    // A reload of the same row before its first layout still owes the picked frame.
    if (fresh) this.pendingFrame = null;
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
    this.lastHref = null;
    this.jumpTo = null;
    this.seq = 0;
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
      this.applySelectionEffect({ kind: "loadFailed" });
      this.publish();
    }, FIRST_LAYOUT_TIMEOUT_MS);
    this.publish();
  }

  private dropFrame(): void {
    this.clearJump();
    this.pendingFrame = null;
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
      if (message.key === "Escape") this.clearOnEscape();
      // Unlike Escape, an old modifier snapshot must not override a newer press.
      else if (message.seq >= this.hoverSeq) {
        this.hoverSeq = message.seq;
        this.altHeld = message.alt;
        this.drawMarks();
      }
      return;
    }
    if (message.type === "hover") { this.hoverSeq = message.seq; this.hoverRect = message.rect; this.drawMarks(); return; }
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
  // which still cancels a pending Open (feature revision-continuity L-17).
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
    if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || event.defaultPrevented || editableTarget(event.target)) return;
    this.clearOnEscape();
  };

  private keyup = (event: KeyboardEvent): void => {
    if (event.key !== "Alt") return;
    this.altHeld = false;
    this.sendHoverCommand({ type: "hover-alt", alt: false });
    this.drawMarks();
  };

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
    this.clearOnEscape();
  };

  private onLayout(message: LayoutMessage): void {
    const documentChanged = message.document !== undefined && message.document !== this.anchorDocument;
    if (documentChanged) { this.resetAnchors(); this.anchorDocument = message.document ?? null; }
    const before = this.layoutDisplayKey();
    const previousCurrent = this.state.currentFrame;
    const beforeSelection = this.state.selection;
    const previousActivity = this.state.activity;
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
      this.hoverSeq = 0;
      this.hoverRect = null;
      this.applySelectionEffect({ kind: "otherCanvas" });
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
    if (selected !== undefined && !newDocument && this.state.selection !== null && this.reanchor === null) {
      if (selected === null) this.applySelectionEffect({ kind: "anchorLost" });
      else { this.selectedRect = selected; this.drawMarks(); }
    }
    this.state.currentFrame = this.state.unlisted ? null : currentFrame(message.frames, this.view, this.viewportSize());
    if (first || previousCurrent !== this.state.currentFrame || documentChanged || before !== this.layoutDisplayKey() || previousActivity !== this.state.activity || beforeSelection !== this.state.selection) this.publish();
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
    }, () => resolve() >= 0);
  }

  private clearJump(): void {
    clearTimeout(this.jumpTimer);
    this.jumpRect = null;
    if (this.jumpMark) this.jumpMark.hidden = true;
  }

  private showJump(rect: CanvasRect): void {
    this.clearJump();
    this.jumpRect = rect;
    // A fresh element restarts the CSS animation even for repeated jumps.
    this.jumpMark?.remove();
    this.jumpMark = document.createElement("div");
    this.jumpMark.className = "mark jump-highlight";
    this.overlay.append(this.jumpMark);
    this.jumpTimer = setTimeout(() => this.clearJump(), 1200);
  }

  private drawJump(): void {
    if (!this.jumpRect || !this.jumpMark) return;
    const rect = boardRectToScreen(this.view, this.jumpRect);
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
    const hover = this.markHidden || this.altHeld ? null : this.hoverRect;
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
