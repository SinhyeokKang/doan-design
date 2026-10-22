import type { ViewCommand } from "../main/index";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { DoanApi } from "../preload/index";
import { acceptCanvasMessage, type LayoutMessage } from "./canvasMessage";
import { canvasAtHref, canvasViewUpdate, cliErrorText, frameLabel, INITIAL_HEIGHT, layoutHeight, sameDocument, updatedText, type CanvasViewUpdate, type OpenCanvas } from "./canvasView";
import {
  boardToScreen,
  FIRST_LAYOUT_TIMEOUT_MS,
  FIT_MARGIN,
  fitFrame,
  fitWidth,
  panBy,
  wheelAction,
  ZOOM_LIMITS,
  ZOOM_STEP,
  zoomAt,
  type Point,
  type Size,
  type View,
  type WheelInput,
} from "./viewport";

declare global {
  interface Window {
    doan: DoanApi;
  }
}

// Plain DOM until a UI framework is chosen with the first design draft
// (feature 6). Text goes in through textContent only: titles, paths and frame
// labels come from files an agent wrote.
const list = element("folders");
const openButton = element("open-folder");
const framesSection = element("frames");
const framesStatus = framesSection.querySelector(".frames-status") as HTMLElement;
const frameList = framesSection.querySelector(".frame-list") as HTMLElement;
const toolbar = document.querySelector(".canvas-toolbar") as HTMLElement;
const zoomLevel = element("zoom-level");
const updated = element("updated");
const viewport = element("viewport");
const board = element("board");
const errorLine = element("canvas-error");
const unlistedLine = element("canvas-unlisted");
const status = element("canvas-status");

let entries: FolderEntry[] = [];
// The canvas picked from the list, or the listed canvas a link inside it
// went to; reloads load its URL. A canvas-sent href only picks among the rows
// main sent, so it never decides what the iframe loads by itself.
let open: (OpenCanvas & { row: CanvasRow }) | null = null;
let shown: string | null = null;
// Lives outside the sidebar tree that `render` replaces, so a list update
// never reloads or resets it.
let frame: HTMLIFrameElement | null = null;
let frameHeight = INITIAL_HEIGHT;
// The width the board is drawn at. Not always the open canvas's: a link to a
// listed canvas without a width keeps the previous one.
let frameWidth = 0;
let view: View = { x: 0, y: 0, scale: 1 };
let layout: LayoutMessage | null = null;
let lastHref: string | null = null;
let loading = false;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
let answerTimer: ReturnType<typeof setTimeout> | undefined;
let jumpTo: number | null = null;
let pickedFrame: number | null = null;
let canvasButtons: { folder: string; canvas: string; button: HTMLButtonElement }[] = [];
let framesKey = "";

openButton.addEventListener("click", () => void window.doan.openFolder());
window.doan.onFolders(render);
window.doan.onViewCommand(command);
element("zoom-out").addEventListener("click", () => command("zoomOut"));
element("zoom-in").addEventListener("click", () => command("zoomIn"));
element("zoom-fit").addEventListener("click", () => command("fit"));
window.addEventListener("message", receive);
viewport.addEventListener("wheel", wheelOnMargin, { passive: false });
// A pinch outside the board would otherwise zoom the whole app page.
window.addEventListener(
  "wheel",
  (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  },
  { passive: false },
);
setStatus("empty", ["왼쪽 목록에서 캔버스를 고르세요"]);

// How long a loaded document has to answer `measure` before it counts as one
// without the canvas script. The script answers at once; a busy canvas that
// answers late only shows the unlisted line until its next layout.
const MEASURE_ANSWER_MS = 1000;

function render(next: FolderEntry[]): void {
  const prev = entries;
  entries = next;
  if (open !== null) applyUpdate(canvasViewUpdate(prev, next, open));
  const focused = canvasButtons.find((item) => item.button === document.activeElement);
  canvasButtons = [];
  if (next.length === 0) list.replaceChildren(text("p", "folder-status", "열린 폴더가 없습니다. '폴더 열기'로 리포를 여세요."));
  else list.replaceChildren(...next.map(folderSection));
  markCanvases();
  if (focused) canvasButtons.find((item) => item.folder === focused.folder && item.canvas === focused.canvas)?.button.focus();
}

function folderSection(entry: FolderEntry): HTMLElement {
  const section = document.createElement("section");
  section.className = "folder";
  section.dataset.path = entry.path;
  section.dataset.state = entry.kind;

  const header = document.createElement("div");
  header.className = "folder-header";
  const close = text("button", "close", "닫기");
  close.setAttribute("type", "button");
  close.addEventListener("click", () => void window.doan.closeFolder(entry.path));
  header.append(text("h2", "folder-path", entry.path), close);
  section.append(header, ...body(entry));
  return section;
}

function body(entry: FolderEntry): HTMLElement[] {
  switch (entry.kind) {
    case "loading":
      return [text("p", "folder-status", "읽는 중…")];
    case "list": {
      if (entry.canvases.length === 0) return [text("p", "folder-status", "캔버스 없음")];
      const ul = document.createElement("ul");
      ul.className = "canvases";
      // CLI order as-is; the CLI sorts by path bytes.
      for (const canvas of entry.canvases) {
        const li = document.createElement("li");
        li.className = "canvas";
        li.dataset.path = canvas.path;
        li.dataset.url = canvas.url;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "canvas-button";
        button.append(
          text("span", "canvas-path", canvas.path),
          text("span", "canvas-title", canvas.title ?? ""),
          text("span", "canvas-open", `열린 코멘트 ${canvas.open}`),
        );
        button.addEventListener("click", () => openCanvas(entry.path, canvas));
        canvasButtons.push({ folder: entry.path, canvas: canvas.path, button });
        li.append(button);
        ul.append(li);
      }
      return [ul];
    }
    case "uninitialized": {
      const hint = text("p", "folder-hint", "터미널에서 실행: ");
      hint.append(text("code", "", "doan init"));
      return [text("p", "folder-status", "초기화되지 않음"), hint];
    }
    case "error":
      return [text("p", "folder-status", entry.message)];
    case "cliError":
      return [text("p", "folder-status", cliErrorText(entry.reason))];
    case "notFound":
      return [text("p", "folder-status", "폴더를 찾을 수 없음")];
  }
}

function markCanvases(): void {
  for (const item of canvasButtons) {
    if (open !== null && item.folder === open.folder && item.canvas === shown) item.button.setAttribute("aria-current", "true");
    else item.button.removeAttribute("aria-current");
  }
}

function openCanvas(folder: string, row: CanvasRow): void {
  open = { folder, canvas: row.path, row };
  shown = row.path;
  errorLine.hidden = true;
  markCanvases();
  load(row, true);
}

// Every load gets a new iframe. In the same iframe the replaced document lives
// on until the new one commits and sees the reset to 150 too, so its late
// layouts would pass for the new document's. Removing the old iframe ends its
// document, and acceptCanvasMessage drops by source any of its layouts still
// in flight. `fresh` (open) also fits the view
// and hides the board until the first height; otherwise (live reload, menu
// reload, retry) the view and the board stay.
function load(row: CanvasRow, fresh: boolean): void {
  if (row.width === undefined) {
    dropFrame();
    setStatus("noWidth", [
      "보드 폭 선언이 없거나 값이 잘못되었습니다. 에이전트에게 ",
      { code: "<head>" },
      "에 ",
      { code: '<meta name="doan:width" content="1440">' },
      "을 넣어 달라고 하세요. 터미널에서 ",
      { code: "doan check" },
      "로 확인할 수 있습니다.",
    ]);
    return;
  }
  const next = document.createElement("iframe");
  next.setAttribute("sandbox", "allow-scripts");
  next.title = row.path;
  next.addEventListener("load", () => frameLoaded(next));
  // Only ever a CanvasRow.url from main: app-started navigations may go to any
  // folder key (ARCHITECTURE §3, iframe src).
  next.src = row.url;
  if (fresh || frame === null) {
    dropFrame();
    frame = next;
    board.prepend(frame);
    board.hidden = false;
    toolbar.hidden = false;
    // The board stays hidden until the first height arrives.
    board.style.visibility = "hidden";
    setStatus("loading", ["불러오는 중…"]);
    view = fitWidth(row.width, viewportSize(), FIT_MARGIN);
    applyView();
  } else {
    frame.replaceWith(next);
    frame = next;
    if (status.dataset.state === "failed") setStatus("loading", ["불러오는 중…"]);
  }
  setFrameWidth(row.width);
  setFrameHeight(INITIAL_HEIGHT);
  lastHref = null;
  jumpTo = null;
  // It was about the replaced document.
  unlistedLine.hidden = true;
  loading = true;
  clearTimeout(answerTimer);
  clearTimeout(loadTimer);
  loadTimer = setTimeout(loadFailed, FIRST_LAYOUT_TIMEOUT_MS);
  updated.textContent = updatedText(new Date());
}

function loadFailed(): void {
  if (!loading || frame === null) return;
  jumpTo = null;
  board.style.visibility = "hidden";
  const retry = text("button", "retry", "다시 읽기");
  retry.setAttribute("type", "button");
  retry.addEventListener("click", reload);
  setStatus("failed", ["캔버스를 불러오지 못했습니다"], retry);
}

function dropFrame(): void {
  frame?.remove();
  frame = null;
  layout = null;
  lastHref = null;
  loading = false;
  jumpTo = null;
  pickedFrame = null;
  clearTimeout(loadTimer);
  clearTimeout(answerTimer);
  board.hidden = true;
  toolbar.hidden = true;
  unlistedLine.hidden = true;
  renderFrames();
}

// A document the canvas navigated to may post its first layout before or
// after its load event (main injects the script on navigation, as a task on
// the canvas's thread), and here that cannot be told apart from the previous
// document's last ones, so the loaded document is asked directly. A load still waiting
// for its first layout has the 5 s failure instead.
function frameLoaded(target: HTMLIFrameElement): void {
  if (target !== frame || loading) return;
  clearTimeout(answerTimer);
  answerTimer = setTimeout(noCanvasDocument, MEASURE_ANSWER_MS);
  target.contentWindow?.postMessage({ type: "measure" }, "*");
}

// A CSP error page after a blocked link, about:blank: no canvas script, so
// nothing to list or jump to.
function noCanvasDocument(): void {
  if (frame === null) return;
  layout = null;
  jumpTo = null;
  pickedFrame = null;
  shown = null;
  unlistedLine.hidden = false;
  markCanvases();
  renderFrames();
}

function reload(): void {
  if (open !== null) load(open.row, false);
}

function applyUpdate(update: CanvasViewUpdate): void {
  if (open === null) return;
  switch (update.kind) {
    case "reload":
      errorLine.hidden = true;
      open.row = update.canvas;
      load(update.canvas, false);
      return;
    case "resize":
      errorLine.hidden = true;
      open.row = update.canvas;
      if (update.canvas.width === undefined || frame === null) load(update.canvas, frame === null);
      else setFrameWidth(update.canvas.width);
      return;
    case "clear": {
      const path = open.canvas;
      open = null;
      shown = null;
      errorLine.hidden = true;
      dropFrame();
      markCanvases();
      setStatus("missing", ["열려 있던 캔버스(", { code: path }, ")가 목록에서 사라졌습니다. 파일이 지워졌거나 옮겨졌습니다."]);
      return;
    }
    case "errorLine":
      errorLine.textContent = update.message;
      errorLine.hidden = false;
      return;
    case "none":
      return;
  }
}

function receive(event: MessageEvent): void {
  if (frame === null) return;
  const message = acceptCanvasMessage(event, frame.contentWindow);
  if (message === null) return;
  if (message.type === "wheel") {
    // Deltas are screen px already; only the position is in board px.
    wheel(message, boardToScreen(view, message));
    return;
  }
  onLayout(message);
}

function onLayout(message: LayoutMessage): void {
  const newDocument = lastHref !== null && !sameDocument(lastHref, message.href);
  setFrameHeight(layoutHeight(lastHref, frameHeight, message));
  lastHref = message.href;
  clearTimeout(answerTimer);
  if (newDocument) {
    pickedFrame = null;
    jumpTo = null;
  }
  if (loading) {
    loading = false;
    clearTimeout(loadTimer);
    board.style.visibility = "";
    setStatus(null, []);
  }
  layout = message;
  markShown(message.href);
  if (jumpTo !== null) {
    const target = message.frames[jumpTo];
    if (target !== undefined) {
      pickedFrame = jumpTo;
      view = fitFrame(target, viewportSize(), FIT_MARGIN, view);
      applyView();
    }
    jumpTo = null;
  }
  renderFrames();
}

function markShown(href: string): void {
  if (open === null) return;
  const entry = entries.find((candidate) => candidate.path === open?.folder);
  // A failing folder has no list to compare with; keep the mark until it recovers.
  if (entry?.kind !== "list") return;
  const row = canvasAtHref(entry.canvases, href);
  if (row !== undefined && row.path !== open.canvas) {
    open = { folder: open.folder, canvas: row.path, row };
    // Without a width the current one stays; a reload then shows the notice.
    if (row.width !== undefined) setFrameWidth(row.width);
  }
  shown = row?.path ?? null;
  unlistedLine.hidden = row !== undefined;
  markCanvases();
}

function renderFrames(): void {
  if (layout === null) {
    framesSection.hidden = true;
    framesKey = "";
    frameList.replaceChildren();
    return;
  }
  const labels = layout.frames.map(frameLabel);
  // Layouts arrive on every resize and mutation; rebuilding an unchanged list
  // would also drop keyboard focus.
  const key = JSON.stringify([labels, layout.truncated, pickedFrame]);
  if (key === framesKey) return;
  framesKey = key;
  framesSection.hidden = false;
  const notes: HTMLElement[] = [];
  if (labels.length === 0) {
    const none = document.createElement("p");
    none.className = "frames-empty";
    none.append(...richText(["이 캔버스에는 ", { code: "data-doan-frame" }, "이 없습니다"]));
    notes.push(none);
  }
  if (layout.truncated) notes.push(text("p", "frames-truncated", "일부만 표시"));
  framesStatus.replaceChildren(...notes);
  framesStatus.hidden = notes.length === 0;

  const focused = document.activeElement instanceof HTMLElement && frameList.contains(document.activeElement) ? document.activeElement.dataset.index : undefined;
  frameList.replaceChildren(
    ...labels.map((label, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "frame-button";
      button.dataset.index = String(index);
      button.append(text("span", label.mono ? "frame-label frame-id" : "frame-label", label.text));
      if (index === pickedFrame) button.setAttribute("aria-current", "true");
      button.addEventListener("click", () => jump(index));
      li.append(button);
      return li;
    }),
  );
  if (focused !== undefined) (frameList.querySelector(`[data-index="${focused}"]`) as HTMLElement | null)?.focus();
}

// By list position, not id: ids may be empty or repeated. Positions are
// re-measured first so a canvas that moved since its last layout is not missed.
function jump(index: number): void {
  if (frame?.contentWindow == null) return;
  jumpTo = index;
  // The sandboxed canvas has an opaque origin, which no target origin but "*" matches.
  frame.contentWindow.postMessage({ type: "measure" }, "*");
}

function command(name: ViewCommand): void {
  if (name === "reload") {
    reload();
    return;
  }
  if (frame === null) return;
  const size = viewportSize();
  const center: Point = { x: size.width / 2, y: size.height / 2 };
  switch (name) {
    case "zoomIn":
      view = zoomAt(view, ZOOM_STEP, center, ZOOM_LIMITS);
      break;
    case "zoomOut":
      view = zoomAt(view, 1 / ZOOM_STEP, center, ZOOM_LIMITS);
      break;
    case "actualSize":
      view = zoomAt(view, 1 / view.scale, center, ZOOM_LIMITS);
      break;
    case "fit":
      view = fitWidth(frameWidth, size, FIT_MARGIN);
      break;
  }
  applyView();
}

// Wheel over the margin or the overlay; over the iframe the canvas script
// forwards it instead, and both go through the same wheelAction.
function wheelOnMargin(event: WheelEvent): void {
  if (frame === null) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  wheel(
    { dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode },
    { x: event.clientX - rect.left, y: event.clientY - rect.top },
  );
}

function wheel(input: WheelInput, point: Point): void {
  const action = wheelAction(input);
  view = "zoom" in action ? zoomAt(view, action.zoom, point, ZOOM_LIMITS) : panBy(view, action.pan.dx, action.pan.dy);
  applyView();
}

function applyView(): void {
  board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  zoomLevel.textContent = `${Math.round(view.scale * 100)}%`;
}

function setFrameWidth(width: number): void {
  frameWidth = width;
  if (frame !== null) frame.style.width = `${width}px`;
}

function setFrameHeight(height: number): void {
  frameHeight = height;
  if (frame !== null) frame.style.height = `${height}px`;
}

function viewportSize(): Size {
  return { width: viewport.clientWidth, height: viewport.clientHeight };
}

type Rich = string | { code: string };

function richText(parts: readonly Rich[]): Node[] {
  return parts.map((part) => (typeof part === "string" ? document.createTextNode(part) : text("code", "", part.code)));
}

// `state` names the screen for e2e and styling; null hides the status layer.
function setStatus(state: string | null, parts: readonly Rich[], action?: HTMLElement): void {
  if (state === null) {
    status.replaceChildren();
    delete status.dataset.state;
    return;
  }
  status.dataset.state = state;
  const message = document.createElement("p");
  message.className = "canvas-message";
  message.append(...richText(parts));
  status.replaceChildren(message, ...(action ? [action] : []));
}

function element(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function text(tag: string, className: string, content: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}
