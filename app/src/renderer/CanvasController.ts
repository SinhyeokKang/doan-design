import type { ViewCommand } from "../main/index";
import type { CanvasRow, FolderEntry } from "../main/view";
import { acceptCanvasMessage, type LayoutMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, INITIAL_HEIGHT, layoutHeight, sameDocument, type OpenCanvas } from "./canvasView";
import { projectNames } from "./projectRow";
import { activityFor, pushActivity, type ActivityEvent } from "./activity";
import { boardToScreen, FIRST_LAYOUT_TIMEOUT_MS, FIT_MARGIN, fitFrame, fitWidth, panBy, wheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt, type Point, type View, type WheelInput } from "./viewport";

const MEASURE_ANSWER_MS = 1000;

export interface CanvasState {
  hasFrame: boolean;
  open: (OpenCanvas & { row: CanvasRow }) | null;
  shown: string | null;
  layout: LayoutMessage | null;
  pickedFrame: number | null;
  status: "empty" | "loading" | "noWidth" | "failed" | "missing" | null;
  message: string;
  error: string;
  unlisted: boolean;
  zoom: number;
  updated: Date | null;
  activity: ActivityEvent[];
}

export function initialCanvasState(): CanvasState {
  return { hasFrame: false, open: null, shown: null, layout: null, pickedFrame: null, status: "empty", message: "Pick a canvas from the list", error: "", unlisted: false, zoom: 100, updated: null, activity: [] };
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

  constructor(
    private viewport: Pick<HTMLElement, "clientWidth" | "clientHeight" | "addEventListener" | "removeEventListener" | "getBoundingClientRect">,
    private board: Pick<HTMLElement, "hidden" | "prepend"> & { style: Pick<CSSStyleDeclaration, "transform" | "visibility"> },
    private changed: (state: CanvasState) => void,
  ) {
    window.addEventListener("message", this.receive);
    window.addEventListener("wheel", this.preventPageZoom, { passive: false });
    viewport.addEventListener("wheel", this.wheelOnMargin, { passive: false });
  }

  dispose(): void {
    window.removeEventListener("message", this.receive);
    window.removeEventListener("wheel", this.preventPageZoom);
    this.viewport.removeEventListener("wheel", this.wheelOnMargin);
    this.dropFrame();
  }

  private publish(): void {
    const open = this.state.open;
    this.state.updated = open ? activityFor(this.state.activity, open.folder, open.canvas)[0]?.at ?? null : null;
    this.state.hasFrame = this.frame !== null;
    this.changed({ ...this.state });
  }

  private layoutDisplayKey(): string {
    const { layout, pickedFrame, status, shown, unlisted } = this.state;
    return JSON.stringify([layout?.frames.map(frame => [frame.id, frame.title]), layout?.truncated, pickedFrame, status, shown, unlisted]);
  }

  updateEntries(next: FolderEntry[]): void {
    const prev = this.entries;
    this.entries = next;
    const open = this.state.open;
    if (open === null) return;
    const update = canvasViewUpdate(prev, next, open);
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
          : update.reason === "uninitialized" ? `The project ${name} is not initialized. Run doan init in a terminal.`
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

  openCanvas(folder: string, row: CanvasRow): void {
    this.state.open = { folder, canvas: row.path, row };
    this.state.shown = row.path;
    this.state.error = "";
    this.load(row, true);
  }

  // A new element ends the old document before resetting its measurement viewport.
  private load(row: CanvasRow, fresh: boolean, kind: ActivityEvent["kind"] = fresh ? "opened" : "reloaded"): void {
    this.loadKind = kind;
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
    this.state.unlisted = false;
    this.loading = true;
    clearTimeout(this.answerTimer);
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (!this.loading || this.frame === null) return;
      this.jumpTo = null;
      this.board.style.visibility = "hidden";
      this.state.status = "failed";
      this.publish();
    }, FIRST_LAYOUT_TIMEOUT_MS);
    this.publish();
  }

  private dropFrame(): void {
    this.frame?.remove();
    this.frame = null;
    this.state.layout = null;
    this.lastHref = null;
    this.loading = false;
    this.jumpTo = null;
    this.state.pickedFrame = null;
    clearTimeout(this.loadTimer);
    clearTimeout(this.answerTimer);
    this.board.hidden = true;
    this.state.unlisted = false;
  }

  private frameLoaded(target: HTMLIFrameElement): void {
    if (target !== this.frame || this.loading) return;
    clearTimeout(this.answerTimer);
    this.answerTimer = setTimeout(() => {
      if (this.frame === null) return;
      this.state.layout = null;
      this.jumpTo = null;
      this.state.pickedFrame = null;
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
    this.onLayout(message);
  };

  private onLayout(message: LayoutMessage): void {
    const before = this.layoutDisplayKey();
    const previousActivity = this.state.activity;
    const newDocument = this.lastHref !== null && !sameDocument(this.lastHref, message.href);
    this.setFrameHeight(layoutHeight(this.lastHref, this.frameHeight, message));
    this.lastHref = message.href;
    clearTimeout(this.answerTimer);
    if (newDocument) { this.state.pickedFrame = null; this.jumpTo = null; }
    const first = this.loading;
    if (first) {
      this.loading = false;
      clearTimeout(this.loadTimer);
      this.board.style.visibility = "";
      this.state.status = null;
    }
    this.state.layout = message;
    const linked = this.markShown(message.href);
    if ((first || linked) && this.state.open && !this.state.unlisted) {
      const at = new Date();
      this.state.activity = pushActivity(this.state.activity, { ...this.state.open, at, kind: linked ? "opened" : this.loadKind }, 50);
    }
    if (this.jumpTo !== null) {
      const target = message.frames[this.jumpTo];
      if (target !== undefined) {
        this.state.pickedFrame = this.jumpTo;
        this.view = fitFrame(target, this.viewportSize(), FIT_MARGIN, this.view);
        this.applyView();
      }
      this.jumpTo = null;
    }
    if (before !== this.layoutDisplayKey() || previousActivity !== this.state.activity) this.publish();
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
    if (this.frame?.contentWindow == null) return;
    // IDs may repeat or be empty; a jump selects the frame by list position.
    this.jumpTo = index;
    // The sandbox has an opaque origin, so a concrete target origin cannot match it.
    this.frame.contentWindow.postMessage({ type: "measure" }, "*");
  }

  command(name: ViewCommand): void {
    if (name === "reload") { if (this.state.open) this.load(this.state.open.row, false); return; }
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
    const action = wheelAction(input);
    this.view = "zoom" in action ? zoomAt(this.view, action.zoom, point, ZOOM_LIMITS) : panBy(this.view, action.pan.dx, action.pan.dy);
    this.applyView();
  }

  private applyView(): void {
    this.board.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    const zoom = Math.round(this.view.scale * 100);
    if (zoom !== this.state.zoom) { this.state.zoom = zoom; this.publish(); }
  }
  private setFrameWidth(width: number): void { this.frameWidth = width; if (this.frame) this.frame.style.width = `${width}px`; }
  private setFrameHeight(height: number): void { this.frameHeight = height; if (this.frame) this.frame.style.height = `${height}px`; }
  private viewportSize() { return { width: this.viewport.clientWidth, height: this.viewport.clientHeight }; }
}
