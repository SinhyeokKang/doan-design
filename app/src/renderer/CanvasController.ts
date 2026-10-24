import { projectPins, type CommentPin } from "../comments/projection";
import { anchorSnapshot, type AnchorSnapshot, type CommentBinding, type CommentHooks, type PinDestination } from "./commentAnchors";
import { CommentPins } from "./CommentPins";
import type { AnchorsMessage } from "./canvasMessage";
import type { Selection } from "../formats/types";
import type { ViewCommand } from "../main/index";
import type { InspectResult, InspectRow } from "../main/inspect";
import type { CanvasRow, FolderEntry } from "../main/view";
import { acceptCanvasMessage, type CanvasRect, type LayoutMessage, type PathItem, type SelectionMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, INITIAL_HEIGHT, layoutHeight, sameDocument, type OpenCanvas } from "./canvasView";
import { projectNames } from "./projectRow";
import { activityFor, pushActivity, type ActivityEvent } from "./activity";
import { acceptSelectionMessage, anchorRequest, editableTarget, mainSelection, SELECTION_LOST, selectedFromLayout, selectionAfter, sizeLabel, type AnchorRequest, type SelectionTrigger, type SelectionView } from "./selection";
import { boardRectToScreen, boardToScreen, FIRST_LAYOUT_TIMEOUT_MS, FIT_MARGIN, fitFrame, fitWidth, panBy, wheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt, type Point, type View, type WheelInput } from "./viewport";

const MEASURE_ANSWER_MS = 1000;

export interface CanvasState {
  hasFrame: boolean;
  open: (OpenCanvas & { row: CanvasRow }) | null;
  shown: string | null;
  layout: LayoutMessage | null;
  selection: SelectionView | null;
  // The selection-lost line, until the next selection or canvas change.
  notice: string;
  // Main's inspector rows for the current selection.
  inspector: InspectorView | null;
  status: "empty" | "loading" | "noWidth" | "failed" | "missing" | null;
  message: string;
  error: string;
  unlisted: boolean;
  zoom: number;
  updated: Date | null;
  activity: ActivityEvent[];
}

export type InspectorView = { status: "loading" } | { status: "ready"; rows: InspectRow[] } | { status: "failed"; reason: string };

export function initialCanvasState(): CanvasState {
  return { hasFrame: false, open: null, shown: null, layout: null, selection: null, notice: "", inspector: null, status: "empty", message: "Pick a canvas from the list", error: "", unlisted: false, zoom: 100, updated: null, activity: [] };
}

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
  private loadKind: ActivityEvent["kind"] = "opened";
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private jumpTo: number | null = null;
  // Selection (design flows 3–7). `seq` orders the renderer's commands against
  // the script's own clicks; each new document starts again at 0.
  private seq = 0;
  private acceptedSelectionSeq = 0;
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
  private comments: CommentBinding | null = null;
  private commentHooks: CommentHooks | null = null;
  private anchors: AnchorSnapshot | null = null;
  private pinLayer: CommentPins | null = null;
  private pins: CommentPin[] = [];
  private pinResize: ResizeObserver | null = null;
  private pinIntent = 0;
  // Selection acknowledgements refresh queries without replacing the binding.
  private commentRevision = 0;
  private pendingPin: { seq: number; intent: number; generation: number; revision: number; destination: PinDestination } | null = null;

  private transitionGuard: (() => boolean | Promise<boolean>) | null = null;
  private transitionIntent = 0;
  private inputGuard = false;
  private canvasIntent = 0;
  setTransitionGuard(guard: (() => boolean | Promise<boolean>) | null): void { this.transitionGuard = guard; }
  setDraftGuard(active: boolean): void {
    this.inputGuard = active;
    this.post({ type: "draft-guard", active });
  }
  private transition(apply: () => void, valid: () => boolean = () => true): void {
    const intent = ++this.transitionIntent, frame = this.frame, href = this.lastHref, document = this.state.layout?.document;
    if (!this.transitionGuard) { apply(); return; }
    const allowed = this.transitionGuard();
    if (typeof allowed === "boolean") { if (allowed && valid()) apply(); return; }
    void allowed.then(allow => {
      if (allow && intent === this.transitionIntent && frame === this.frame && href === this.lastHref && document === this.state.layout?.document && valid()) apply();
    }).catch(error => console.error("Comment transition failed", error));
  }

  setComments(binding: CommentBinding, hooks: CommentHooks): void {
    this.commentRevision++;
    this.comments = { ...binding, comments: structuredClone([...binding.comments]) };
    this.commentHooks = hooks;
    if (!this.pinResize && typeof ResizeObserver !== "undefined" && "nodeType" in this.viewport) {
      this.pinResize = new ResizeObserver(() => this.drawPins());
      this.pinResize.observe(this.viewport as Element);
    }
    this.requestAnchors();
  }

  private resetAnchors(): void {
    this.canvasIntent = 0;    this.anchorGeneration++;
    this.anchorDocument = null;
    this.anchorRevision = 0;
    this.pinIntent++;
    this.pendingPin = null;
    this.clearAnchors();
  }

  private clearAnchors(): void {
    const binding = this.comments;
    this.anchors = binding ? { lookup: { root: binding.root, canvas: binding.canvas, generation: this.anchorGeneration, nodes: new Map() }, rects: new Map(), selected: null } : null;
    this.drawPins();
    if (this.anchors) this.commentHooks?.changed(this.anchors);
  }

  private matchingComments(): CommentBinding | null {
    const open = this.state.open, binding = this.comments;
    return binding && open && binding.root === open.folder && binding.canvas === open.row.id &&
      !this.state.unlisted && this.state.status === null ? binding : null;
  }

  private requestAnchors(): void {
    const binding = this.matchingComments();
    this.anchorRequest++;
    this.anchorRevision = 0;
    if (!binding || !this.anchorDocument || !this.frame) { this.clearAnchors(); return; }
    this.post({ type: "anchors-query", document: this.anchorDocument, generation: this.anchorGeneration, request: this.anchorRequest,
      targets: binding.comments.map(comment => ({ id: comment.comment,
        ...(comment.target.element ? { selector: comment.target.element.selector, ...(comment.target.element.doanId === undefined ? {} : { doanId: comment.target.element.doanId }) }
          : comment.target.frame === undefined ? {} : { frame: comment.target.frame }) })) });
  }

  private onAnchors(message: AnchorsMessage): void {
    const binding = this.matchingComments();
    if (!binding || message.document !== this.anchorDocument || message.generation !== this.anchorGeneration ||
      message.request !== this.anchorRequest || message.revision <= this.anchorRevision || message.href !== this.lastHref ||
      message.viewport !== this.frameHeight || message.width !== this.frameWidth) return;
    const ids = new Set(binding.comments.map(comment => comment.comment));
    if (message.results.length !== ids.size || message.results.some(result => !ids.has(result.id))) return;
    this.anchorRevision = message.revision;
    this.anchors = anchorSnapshot(binding.comments, { root: binding.root, canvas: binding.canvas, generation: this.anchorGeneration }, { ...message, selected: this.state.selection !== null && message.selectionSeq === this.acceptedSelectionSeq ? message.selected : null });
    this.drawPins();
    this.commentHooks?.changed(this.anchors);
  }

  private drawPins(): void {
    const binding = this.matchingComments(), snapshot = this.anchors;
    const size = this.viewportSize();
    this.pins = binding && snapshot ? projectPins(binding.comments,
      { root: binding.root, canvas: binding.canvas, generation: this.anchorGeneration }, snapshot.lookup, snapshot.rects,
      this.view, { x: 0, y: 0, ...size }) : [];
    if (!this.pinLayer && this.pins.length) this.pinLayer = new CommentPins(this.overlay, node => { void this.activatePin(node); }, () => this.commentHooks?.focusFallback());
    this.pinLayer?.render(this.pins);
  }

  async activatePin(node: string): Promise<void> {
    const pin = this.pins.find(pin => pin.node === node), binding = this.matchingComments();
    const original = binding?.comments.find(comment => comment.comment === pin?.comments[0]);
    const hooks = this.commentHooks;
    if (!pin || !original || !hooks) return;
    const destination: PinDestination = { node, comments: [...pin.comments], originalTarget: structuredClone(original.target) };
    const intent = ++this.pinIntent, generation = this.anchorGeneration, revision = this.commentRevision;
    let allowed: boolean;
    try { allowed = await hooks.guard(destination); } catch { return; }
    if (!allowed || intent !== this.pinIntent || generation !== this.anchorGeneration || revision !== this.commentRevision ||
      !this.pins.some(pin => pin.node === node)) return;
    this.pendingPin = { seq: this.seq + 1, intent, generation, revision, destination };
    this.sendCommand({ type: "select-comment", node, document: this.anchorDocument, generation, request: this.anchorRequest });
  }

  constructor(
    private viewport: Pick<HTMLElement, "clientWidth" | "clientHeight" | "addEventListener" | "removeEventListener" | "getBoundingClientRect">,
    private board: Pick<HTMLElement, "hidden" | "prepend"> & { style: Pick<CSSStyleDeclaration, "transform" | "visibility"> },
    private overlay: Pick<HTMLElement, "append">,
    private changed: (state: CanvasState) => void,
    private sendSelection: (selection: Selection | null) => void,
    private inspect: (selector: string) => Promise<InspectResult>,
  ) {
    window.addEventListener("message", this.receive);
    window.addEventListener("wheel", this.preventPageZoom, { passive: false });
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("pointermove", this.pointerOnApp, { capture: true });
    viewport.addEventListener("click", this.clickOnMargin);
    viewport.addEventListener("wheel", this.wheelOnMargin, { passive: false });
  }

  dispose(): void {
    this.pinResize?.disconnect();
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
    this.state.updated = open ? activityFor(this.state.activity, open.folder, open.canvas)[0]?.at ?? null : null;
    this.state.hasFrame = this.frame !== null;
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
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        this.load(update.canvas, false);
        break;
      case "resize":
        this.state.error = "";
        this.state.open = { ...open, row: update.canvas };
        if (update.canvas.width === undefined || this.frame === null) this.load(update.canvas, this.frame === null, "reloaded");
        else this.setFrameWidth(update.canvas.width);
        break;
      case "clear": {
        const name = projectNames(prev.map(entry => entry.path)).get(open.folder) ?? open.folder;
        this.state.open = null;
        this.state.shown = null;
        this.state.error = "";
        this.dropFrame();
        this.state.status = update.reason === "closed" ? "empty" : "missing";
        this.state.message = update.reason === "closed" ? "Pick a canvas from the list"
          : update.reason === "notFound" ? `The project ${name} is gone or moved. Reopen it from the sidebar.`
          : update.reason === "uninitialized" ? `The project ${name} is not initialized. Choose Set Up… in the sidebar.`
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
    if (this.comments && !this.matchingComments()) this.clearAnchors();
    this.publish();
  }

  openCanvas(folder: string, row: CanvasRow): void {
    const current = () => {
      const entry = this.entries.find(entry => entry.path === folder);
      return entry?.kind === "list" ? entry.canvases.find(candidate => candidate.path === row.path && candidate.id === row.id && candidate.url === row.url) : undefined;
    };
    this.transition(() => this.openCanvasNow(folder, current() ?? row), () => current() !== undefined);
  }

  private openCanvasNow(folder: string, row: CanvasRow): void {
    this.state.open = { folder, canvas: row.path, row };
    this.state.shown = row.path;
    this.state.error = "";
    this.load(row, true);
  }

  // A new element ends the old document before resetting its measurement viewport.
  private load(row: CanvasRow, fresh: boolean, kind: ActivityEvent["kind"] = fresh ? "opened" : "reloaded"): void {
    this.resetAnchors();
    this.loadKind = kind;
    this.applySelectionEffect({ kind: fresh ? "otherCanvas" : "reload" });
    if (row.width === undefined) {
      this.dropFrame();
      this.state.status = "noWidth";
      this.state.message = 'Missing or invalid board width. Ask the agent to add <meta name="doan:width" content="1440"> to <head>. Run doan check in a terminal to verify.';
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
      this.view = fitWidth(row.width, this.viewportSize(), FIT_MARGIN);
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
    this.acceptedSelectionSeq = 0;
    this.hoverSeq = 0;
    this.hoverRect = null;
    this.drawMarks();
    this.state.unlisted = false;
    this.loading = true;
    clearTimeout(this.answerTimer);
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (!this.loading || this.frame === null) return;
      this.jumpTo = null;
      this.board.style.visibility = "hidden";
      this.state.status = "failed";
      this.applySelectionEffect({ kind: "loadFailed" });
      this.publish();
    }, FIRST_LAYOUT_TIMEOUT_MS);
    this.publish();
  }

  private dropFrame(): void {
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
    if (message.type === "transition-intent") {
      if (message.document !== this.state.layout?.document || message.href !== this.lastHref || message.viewport !== this.frameHeight || message.intent <= this.canvasIntent) return;
      this.canvasIntent = message.intent;
      const frame = this.frame, document = message.document;
      this.transition(() => this.post({ type: "transition-answer", document, intent: message.intent }),
        () => frame === this.frame && document === this.state.layout?.document);
      return;
    }
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
      if (message.key === "Escape") this.escape();
      // Unlike Escape, an old modifier snapshot must not override a newer press.
      else if (message.seq >= this.hoverSeq) {
        this.hoverSeq = message.seq;
        this.altHeld = message.alt;
        this.drawMarks();
      }
      return;
    }
    if (message.type === "hover") { this.hoverSeq = message.seq; this.hoverRect = message.rect; this.drawMarks(); return; }
    const pin = this.pendingPin;
    // A sent pin's acknowledgement is document state, not a newer user intent.
    if (pin?.seq !== message.seq) this.pinIntent++;
    this.pendingPin = null;
    this.seq = message.seq;
    this.acceptedSelectionSeq = message.seq;
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
    if (pin?.seq === message.seq && pin.intent === this.pinIntent && pin.generation === this.anchorGeneration &&
      pin.revision === this.commentRevision) this.commentHooks?.open(pin.destination);
    if (this.comments) this.requestAnchors();
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
    this.pendingPin = null;
    this.pinIntent++;
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
    if (!("type" in message) || message.type !== "select-comment") { this.pinIntent++; this.pendingPin = null; }
    this.seq += 1;
    this.post({ ...message, seq: this.seq });
  }

  private sendHoverCommand(message: object): void {
    this.hoverSeq += 1;
    this.post({ ...message, seq: this.hoverSeq });
  }

  private escape(): void { this.transition(() => this.escapeNow()); }

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
    if (event.key === "Alt") {
      // Focus may move into the canvas before keyup; fence off earlier snapshots.
      if (!this.altHeld) this.sendHoverCommand({ type: "hover-alt", alt: true });
      this.altHeld = true;
      this.drawMarks();
      return;
    }
    if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || event.defaultPrevented || editableTarget(event.target)) return;
    if (this.inputGuard) event.preventDefault();
    this.escape();
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
    this.escape();
  };

  private onLayout(message: LayoutMessage): void {
    this.post({ type: "draft-guard", active: this.inputGuard });
    const documentChanged = message.document !== undefined && message.document !== this.anchorDocument;
    if (documentChanged) { this.resetAnchors(); this.anchorDocument = message.document ?? null; }
    const before = this.layoutDisplayKey();
    const beforeSelection = this.state.selection;
    const previousActivity = this.state.activity;
    const newDocument = this.lastHref !== null && !sameDocument(this.lastHref, message.href);
    // Against the height before this layout resizes the iframe, as layoutHeight does.
    const selected = selectedFromLayout({ ...this.expectation(), href: message.href }, message);
    this.setFrameHeight(layoutHeight(this.lastHref, this.frameHeight, message));
    this.lastHref = message.href;
    clearTimeout(this.answerTimer);
    if (newDocument) {
      this.jumpTo = null;
      this.seq = 0;
      this.acceptedSelectionSeq = 0;
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
    if (this.state.unlisted) this.clearAnchors();
    if ((first || linked) && this.state.open && !this.state.unlisted) {
      const at = new Date();
      this.state.activity = pushActivity(this.state.activity, { ...this.state.open, at, kind: linked ? "opened" : this.loadKind }, 50);
    }
    if (this.jumpTo !== null) {
      const target = message.frames[this.jumpTo];
      if (target !== undefined) {
        this.view = fitFrame(target, this.viewportSize(), FIT_MARGIN, this.view);
        this.applyView();
      }
      this.jumpTo = null;
    }
    if (selected !== undefined && !newDocument && this.state.selection !== null && this.reanchor === null) {
      if (selected === null) this.applySelectionEffect({ kind: "anchorLost" });
      else { this.selectedRect = selected; this.drawMarks(); }
    }
    if (this.comments && (documentChanged || first || linked)) this.requestAnchors();
    if (documentChanged || before !== this.layoutDisplayKey() || previousActivity !== this.state.activity || beforeSelection !== this.state.selection) this.publish();
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
    const target = this.state.layout?.frames[index];
    this.transition(() => this.jumpNow(index), () => target !== undefined && this.state.layout?.frames[index]?.id === target.id);
  }

  private jumpNow(index: number): void {
    if (this.frame?.contentWindow == null) return;
    // IDs may repeat or be empty; a jump selects the frame by list position.
    this.jumpTo = index;
    this.post({ type: "measure" });
    // The script answers with a select only if that position still holds this id.
    const frame = this.state.layout?.frames[index];
    if (frame !== undefined) this.sendCommand({ type: "pick-frame", index, id: frame.id });
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
      case "fit": this.view = fitWidth(this.frameWidth, size, FIT_MARGIN); break;
    }
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
    this.drawPins();
    const zoom = Math.round(this.view.scale * 100);
    if (zoom !== this.state.zoom) { this.state.zoom = zoom; this.publish(); }
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
