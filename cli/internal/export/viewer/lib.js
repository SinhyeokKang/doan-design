// DOM-free functions shared by shell.js (the viewer page) and measure.js (the script inside the
// canvas document). Plain function declarations and constants, no exports: `assemble` concatenates
// this file before measure.js and before shell.js, and app/src/main/exportViewer.test.ts evaluates
// it in node. Nothing here may touch `document`, `window` or timers.
//
// Copied from the app, with a test that fails when a copy drifts:
//   - nextHeight, documentHeight, frameBottom, canScrollAxis, clipText: app/src/main/canvasScript.ts
//     (compared as function text);
//   - the constants, fitScale, wheelAction: app/src/renderer/viewport.ts (compared as values);
//   - toolShortcut with TOOL_KEYS, CONTROL_ROLES, interactiveTarget, OPEN_OVERLAY and inOpenOverlay:
//     app/src/renderer/canvasTool.ts,
//     and editableTarget: app/src/renderer/selection.ts (compared as values over one event table,
//     since the app does not export the helpers);
//   - TIP_DELAY_MS and TIP_SKIP_MS: app/src/renderer/components/ui/tooltip.tsx (compared as values
//     read from its source).

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_MAX = 1.25;
const WHEEL_ZOOM_SENSITIVITY = 0.01;
const LINE_PX = 16;
const PAGE_PX = 800;
const FIT_INSET = { top: 80, right: 32, bottom: 80, left: 32 };
const FIT_SCALE_MAX = 1;
const FIRST_LAYOUT_TIMEOUT_MS = 5000;

// app/src/renderer/canvasView.ts and CanvasController.ts.
const INITIAL_HEIGHT = 150;
const MAX_HEIGHT = 200000;
const REMEASURE_MS = 50;

// app/src/renderer/canvasMessage.ts limits, and app/src/main/prototype/mark.ts's cap on a raw mark.
const MAX_FRAMES = 1000;
const MAX_STRING = 200;
const MAX_HREF = 8192;
const MAX_GOTOS = 1000;
const MAX_PROTOTYPE_MARK = 32;

// ── Height rules (canvasScript.ts) ────────────────────────────────────────────

function nextHeight(prev, measured, inner, fonts) {
  if (prev === null || prev.fonts !== fonts) return { sent: measured, inner, frozen: false, fonts };
  if (prev.frozen) return prev;
  const ownResize = inner !== prev.inner && Math.abs(inner - prev.sent) <= 1;
  if (ownResize && prev.sent > 0 && measured > inner + 1) return { sent: prev.sent, inner: prev.inner, frozen: true, fonts };
  return { sent: measured, inner, frozen: false, fonts };
}

function documentHeight(rect, scrollHeight, inner, framesBottom) {
  return Math.max(Math.abs(rect - inner) <= 1 && scrollHeight > rect ? scrollHeight : rect, Math.min(Math.ceil(framesBottom), scrollHeight));
}

function frameBottom(bottom, position, ancestors) {
  const noOverflow = /^(inline|contents|none|table-(row|row-group|header-group|footer-group|column|column-group)|ruby.*)$/;
  if (position === "fixed") return bottom;
  let escaping = position === "absolute";
  for (const link of ancestors) {
    const positioned = link.position !== "static";
    if ((!escaping || positioned) && link.overflowY !== "visible" && !noOverflow.test(link.display)) bottom = Math.min(bottom, link.bottom);
    if (link.position === "fixed") return bottom;
    if (positioned) escaping = link.position === "absolute";
  }
  return bottom;
}

function canScrollAxis(overflow, position, client, size, delta) {
  if (delta === 0 || size <= client) return false;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  return delta > 0 ? position + client < size - 0.5 : position > 0;
}

function clipText(text, max) {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

// ── Messages from the canvas document ─────────────────────────────────────────
// The canvas's own scripts share its window and can post anything, so a message is checked field
// by field and copied (canvasMessage.ts). Only `layout`, `wheel` and `key` exist here; the selection
// travels on the inspector's own channel (inspectMessage.js). `key` carries the tool keys pressed
// while focus is in the canvas: Space down and up, V, H and Escape, nothing else.

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegative(value) {
  return isFiniteNumber(value) && value >= 0;
}

// A frame keeps what Play prototype judges (canvasMessage.ts parseFrame): its raw mark, dropped when
// it is not a string or is over the cap, and `cut` when the id was cut here or by the canvas.
function parseFrame(raw) {
  if (!isRecord(raw)) return null;
  const { id, title, prototype, x, y, width, height } = raw;
  if (typeof id !== "string" || (title !== undefined && typeof title !== "string")) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isNonNegative(width) || !isNonNegative(height)) return null;
  const frame = { id: clipText(id, MAX_STRING), x, y, width, height };
  if (frame.id !== id || raw.cut === true) frame.cut = true;
  if (typeof prototype === "string" && prototype.length <= MAX_PROTOTYPE_MARK) frame.prototype = prototype;
  if (title !== undefined) frame.title = clipText(title, MAX_STRING);
  return frame;
}

// `total` counts every frame in the canvas, listed or not: the page cannot know how many more
// there are from the first 1,000 alone. Absent or smaller than what is listed, it is the listed count.
// `parent` and a link's `frame` are indexes into the canvas's list; a dropped frame shifts the rest,
// so they are mapped onto the kept list, and one that names a dropped or later frame is left out
// (canvasMessage.ts parseLayout).
function parseLayout(data) {
  const { href, height, viewport, frames, total, gotos } = data;
  if (typeof href !== "string" || href.length > MAX_HREF || !isNonNegative(height) || !isNonNegative(viewport) || !Array.isArray(frames)) return null;
  if (gotos !== undefined && !Array.isArray(gotos)) return null;
  const listed = [];
  const keptAt = [];
  const keptIndex = (value, before) => Number.isInteger(value) && value >= 0 && value < before ? keptAt[value] : undefined;
  for (const [index, raw] of frames.slice(0, MAX_FRAMES).entries()) {
    const frame = parseFrame(raw);
    if (frame === null) {
      keptAt.push(undefined);
      continue;
    }
    const parent = keptIndex(raw.parent, index);
    if (parent !== undefined) frame.parent = parent;
    keptAt.push(listed.length);
    listed.push(frame);
  }
  const links = [];
  for (const raw of (gotos ?? []).slice(0, MAX_GOTOS)) {
    if (!isRecord(raw) || typeof raw.value !== "string" || raw.value.length > MAX_STRING) continue;
    if (raw.frame === undefined) {
      links.push({ value: raw.value });
      continue;
    }
    const frame = keptIndex(raw.frame, keptAt.length);
    if (frame !== undefined) links.push({ value: raw.value, frame });
  }
  const all = Number.isSafeInteger(total) && total >= frames.length ? total : frames.length;
  return { type: "layout", height, viewport, frames: listed, total: all, gotos: links };
}

function parseWheel(data) {
  const { dx, dy, ctrl, meta, deltaMode, x, y } = data;
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy) || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (typeof ctrl !== "boolean" || typeof meta !== "boolean") return null;
  if (deltaMode !== 0 && deltaMode !== 1 && deltaMode !== 2) return null;
  return { type: "wheel", dx, dy, ctrl, meta, deltaMode, x, y };
}

// A held Esc's repeats still turn Hand back to Select but take no Select step (the app's escape).
function parseKey(data) {
  const { key, down } = data;
  if (key === "Space") return typeof down === "boolean" ? { type: "key", key, down } : null;
  if (key === "Escape") return { type: "key", key, repeat: data.repeat === true };
  if (key === "V" || key === "H" || key === "Shift2") return { type: "key", key };
  return null;
}

function parseMessage(data) {
  if (!isRecord(data)) return null;
  if (data.type === "layout") return parseLayout(data);
  if (data.type === "wheel") return parseWheel(data);
  if (data.type === "key") return parseKey(data);
  return null;
}

// A sandboxed iframe without `allow-same-origin` posts from the opaque origin "null", and `source`
// is the only thing tying the message to our iframe. A detached iframe has a null `contentWindow`,
// which must not match the null `source` of a message from a closed window.
function acceptMessage(event, frameWindow) {
  if (frameWindow === null || frameWindow === undefined) return null;
  if (event.source !== frameWindow || event.origin !== "null") return null;
  return parseMessage(event.data);
}

// ── Zoom and view (viewport.ts) ───────────────────────────────────────────────
// A view is where the board's top-left sits on the scroll container's visible area (screen px)
// and the scale, as in the app. The viewer reads x and y back from the scroll offsets.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fitScale(contentWidth, viewport, inset) {
  const wanted = contentWidth > 0 ? (viewport.width - inset.left - inset.right) / contentWidth : FIT_SCALE_MAX;
  return Math.max(MIN_SCALE, Math.min(FIT_SCALE_MAX, wanted));
}

function safeArea(viewport, inset) {
  return {
    x: inset.left,
    y: inset.top,
    width: Math.max(0, viewport.width - inset.left - inset.right),
    height: Math.max(0, viewport.height - inset.top - inset.bottom),
  };
}

function fitWidth(boardWidth, viewport) {
  const scale = fitScale(boardWidth, viewport, FIT_INSET);
  const safe = safeArea(viewport, FIT_INSET);
  return { x: safe.x + (safe.width - boardWidth * scale) / 2, y: safe.y, scale };
}

// A frame is shown whole at the scale that fits its width, centred; one taller than the safe area
// is read from its top. Same as the app's frame jump (fitFrame); a zero-size frame keeps the
// current scale there too.
function fitFrame(rect, viewport, current) {
  const safe = safeArea(viewport, FIT_INSET);
  const centerX = rect.x + rect.width / 2;
  if (rect.width <= 0 || rect.height <= 0) {
    const centerY = rect.y + rect.height / 2;
    return {
      x: safe.x + safe.width / 2 - centerX * current.scale,
      y: safe.y + safe.height / 2 - centerY * current.scale,
      scale: current.scale,
    };
  }
  const scale = fitScale(rect.width, viewport, FIT_INSET);
  const y = rect.height * scale > safe.height ? safe.y - rect.y * scale : safe.y + safe.height / 2 - (rect.y + rect.height / 2) * scale;
  return { x: safe.x + safe.width / 2 - centerX * scale, y, scale };
}

// Keeps the screen point fixed while the scale changes by `factor`, within the zoom limits.
function zoomAt(view, factor, point) {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = scale / view.scale;
  return { x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio, scale };
}

function wheelAction(input) {
  const unit = input.deltaMode === 1 ? LINE_PX : input.deltaMode === 2 ? PAGE_PX : 1;
  if (input.ctrl || input.meta) {
    const dy = Number.isNaN(input.dy) ? 0 : input.dy * unit;
    return { zoom: clamp(Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY), 1 / WHEEL_ZOOM_MAX, WHEEL_ZOOM_MAX) };
  }
  const finite = (delta) => (Number.isFinite(delta) ? delta * unit : 0);
  return { pan: { dx: -finite(input.dx), dy: -finite(input.dy) } };
}

// The scroll container's content for a scale: the board at (left, top) inside a spacer that is at
// least as big as the scaled board plus the Fit inset, and is centred when the container is wider.
// The spacer's width is the container's (a plain block) with `minWidth` as the floor, so a scrollbar
// appearing cannot push it wider than the container. The page scrolls natively, so the view's x and
// y are `left - scrollLeft` and `top - scrollTop`.
function geometry(scale, boardWidth, boardHeight, viewport) {
  const scaled = boardWidth * scale;
  return {
    left: Math.max(FIT_INSET.left, (viewport.width - scaled) / 2),
    top: FIT_INSET.top,
    minWidth: scaled + FIT_INSET.left + FIT_INSET.right,
    height: boardHeight * scale + FIT_INSET.top + FIT_INSET.bottom,
  };
}

function scrollFor(view, geom) {
  return { left: geom.left - view.x, top: geom.top - view.y };
}

function viewFrom(scroll, scale, geom) {
  return { x: geom.left - scroll.left, y: geom.top - scroll.top, scale };
}

// The frame the person is looking at: the one under the viewport centre (the last in document
// order when frames nest, so the innermost), else the nearest. app/src/renderer/currentFrame.ts.
function currentFrame(frames, view, viewport) {
  const center = { x: (viewport.width / 2 - view.x) / view.scale, y: (viewport.height / 2 - view.y) / view.scale };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const [index, frame] of frames.entries()) {
    const distance = Math.hypot(Math.max(frame.x - center.x, 0, center.x - (frame.x + frame.width)), Math.max(frame.y - center.y, 0, center.y - (frame.y + frame.height)));
    if (distance === 0 ? nearestDistance >= 0 : distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// A drag's own travel moves the board's native scroll, so the view stops at 0 and at the most the
// board scrolls (the app pans without bounds; the viewer keeps the scroll range). Inside the range
// it is the app's panBy: the view moves by (dx, dy), the scroll by the opposite.
function panScroll(scroll, max, dx, dy) {
  return { left: clamp(scroll.left - dx, 0, Math.max(0, max.left)), top: clamp(scroll.top - dy, 0, Math.max(0, max.top)) };
}

// ── Tools (canvasTool.ts) ─────────────────────────────────────────────────────
// Select leaves the canvas to the person; Hand, a held Space and a drag in progress turn the board
// into the drag surface (the canvas iframe takes no pointer). Before the canvas is drawn nothing
// pans, so a Space held then does not carry over.

const TOOL_KEYS = { KeyV: "select", KeyH: "hand" };
const CONTROL_ROLES = new Set(["button", "menuitem", "treeitem", "option", "tab", "switch", "checkbox", "radio", "combobox"]);
// The app's rule for an open menu, list, popover or dialog. The viewer's drawer and zoom menu carry `doan-menu` and a
// listbox; the rest of the rule is kept so the copy answers as the app's does.
const OPEN_OVERLAY = '.doan-menu, [role="menu"], [role="listbox"], .preset-popover, dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog)';

function editableTarget(target) {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const { tagName } = target;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || ("isContentEditable" in target && target.isContentEditable === true);
}

// Space on a focused control presses it; elsewhere it pans.
function interactiveTarget(target) {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const element = target;
  if (element.tagName === "BUTTON") return true;
  if (element.tagName === "A" && element.hasAttribute?.("href") === true) return true;
  const role = element.getAttribute?.("role");
  return typeof role === "string" && CONTROL_ROLES.has(role);
}

function inOpenOverlay(target) {
  if (typeof target !== "object" || target === null || !("closest" in target) || typeof target.closest !== "function") return false;
  return target.closest(OPEN_OVERLAY) !== null;
}

// By key position (`code`), so a Korean layout's ㅍ and ㅗ still switch tools and ⇧2 is one key on
// every layout. A Space release always counts, so a held Space never outlives the key. An open menu or
// list keeps every printable key. ⇧Space plays and never pans.
function toolShortcut(event, context) {
  if (event.type === "keyup") return event.code === "Space" ? { kind: "space", down: false } : null;
  if (event.type !== "keydown") return null;
  const tool = TOOL_KEYS[event.code];
  const zoom = event.code === "Digit2" && event.shiftKey;
  if (tool === undefined && !zoom && event.code !== "Space") return null;
  if (!context.canvasPage || event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || editableTarget(event.target) || inOpenOverlay(event.target)) return null;
  if (tool !== undefined) return { kind: "tool", tool };
  if (zoom) return { kind: "zoomSelection" };
  if (interactiveTarget(event.target)) return null;
  return event.shiftKey ? { kind: "play" } : { kind: "space", down: true };
}

function layerShown(tool, spaceHeld, dragging, boardDrawn) {
  return boardDrawn && (tool === "hand" || spaceHeld || dragging);
}

// The viewer has no pick or capture, so of the app's escapeStep Hand → Select comes first and the
// selection's step after it (inspectView.js). A text field keeps its own Esc, and an Esc a menu or
// the tooltip took (prevented) is spent.
function escapeSelects(state) {
  return state.hand && !state.editable && !state.defaultPrevented;
}

// The toolbar's ←/→ move focus between the tools and stop at the ends; no Home or End
// (CanvasTools.tsx moveBetweenTools). null: focus stays.
function toolbarMove(index, count, key) {
  if (index < 0 || index >= count) return null;
  const next = key === "ArrowRight" ? index + 1 : key === "ArrowLeft" ? index - 1 : -1;
  return next >= 0 && next < count ? next : null;
}

// A pointer tooltip waits as the app's (Radix delayDuration and skipDelayDuration in components/ui/tooltip.tsx):
// the first one after TIP_DELAY_MS, and one entered within TIP_SKIP_MS of the last tooltip closing at once.
const TIP_DELAY_MS = 700;
const TIP_SKIP_MS = 300;
function tipWait(now, closedAt) {
  return closedAt !== null && now - closedAt < TIP_SKIP_MS ? 0 : TIP_DELAY_MS;
}

// ── Viewer state ──────────────────────────────────────────────────────────────

// The iframe's height after a layout: only one measured at the height we set counts (a layout
// from before our last resize is dropped), as canvasView.ts layoutHeight.
function layoutHeight(current, layout) {
  if (Math.abs(layout.viewport - current) > 1) return current;
  return Math.min(layout.height, MAX_HEIGHT);
}

function initialViewer() {
  return { phase: "loading", height: INITIAL_HEIGHT, frames: null, total: 0, gotos: [] };
}

// `ready` is the first time the board may be shown: either the first layout, or the timeout
// (a canvas whose script failed never reports; it stays at the last height and the person still
// gets Fit). `remeasure` asks the canvas for one more layout: a layout that does not confirm the
// height needs another, and the canvas sends that on an animation frame an off-screen iframe
// never gets.
function viewerLayout(state, layout) {
  const height = layoutHeight(state.height, layout);
  const remeasure = Math.abs(layout.viewport - height) > 1 || Math.min(layout.height, MAX_HEIGHT) !== height;
  return { state: { phase: "ready", height, frames: layout.frames, total: layout.total, gotos: layout.gotos }, ready: state.phase === "loading", remeasure };
}

function viewerTimeout(state) {
  if (state.phase !== "loading") return { state, ready: false, remeasure: false };
  return { state: { ...state, phase: "ready" }, ready: true, remeasure: false };
}

// ── Header text ───────────────────────────────────────────────────────────────

function frameName(frame) {
  return (frame.title !== undefined ? frame.title.trim() : "") || frame.id || "(no id)";
}

function groupDigits(count) {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// What the frame drawer shows: its button, its rows and the note after a capped list. Without a
// layout it says "Frames" and is off; with no frames it says "No frames" and is off.
function drawerView(frames, total, current) {
  if (frames === null) return { enabled: false, buttonLabel: "Frames", ariaLabel: "Frames", rows: [], note: null };
  if (frames.length === 0) return { enabled: false, buttonLabel: "No frames", ariaLabel: "No frames", rows: [], note: null };
  const rows = frames.map((frame, index) => ({ index, number: index + 1, name: frameName(frame), current: index === current }));
  const viewing = current !== null && rows[current] !== undefined ? rows[current] : null;
  const unlisted = total - frames.length;
  return {
    enabled: true,
    buttonLabel: viewing ? viewing.number + ". " + viewing.name : "Frames",
    ariaLabel: viewing ? "Frame " + viewing.number + ": " + viewing.name : "Frames",
    rows,
    note: unlisted > 0 ? "Showing the first " + groupDigits(frames.length) + " frames. " + groupDigits(unlisted) + " more aren’t listed." : null,
  };
}

const ZOOM_ITEMS = [
  { id: "fit", label: "Fit", shortcut: "⇧1" },
  { id: "actual", label: "100%", shortcut: "⇧0" },
  { id: "selection", label: "Zoom to selection", shortcut: "⇧2" },
  { id: "half", label: "50%", scale: 0.5 },
  { id: "double", label: "200%", scale: 2 },
];

function zoomView(scale, ready) {
  const percent = Math.round(scale * 100);
  return {
    enabled: ready,
    value: ready ? percent + "%" : "—",
    triggerLabel: ready ? "Zoom " + percent + "%, zoom options" : "Zoom options",
    zoomOutDisabled: !ready || scale <= MIN_SCALE,
    zoomInDisabled: !ready || scale >= MAX_SCALE,
  };
}

// ⇧1 Fit and ⇧0 100%, only while the page outside the canvas has focus. Matched on the physical
// key (`code`): with Shift held, `key` is "!" or ")" and differs by layout.
function shortcutCommand(event) {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.code === "Digit1") return "fit";
  if (event.code === "Digit0") return "actual";
  return null;
}

// ── Popup lists (frame drawer, zoom menu) ─────────────────────────────────────
// `focus` says where focus goes after the key: into the list at `active`, back to the trigger
// (Escape, or a pick), or nowhere new. Arrow keys stop at the ends (frameDrawerList.ts).

function popupOpen(count, current) {
  return { open: count > 0, active: count > 0 ? clamp(current, 0, count - 1) : -1, focus: "list", pick: -1, prevent: true };
}

// `code` is the physical key: an open list keeps V and H (any layout) as handled, so the tool does
// not change under it.
function popupKey(popup, key, count, code) {
  const close = { open: false, active: -1, focus: "trigger", pick: -1, prevent: true };
  if (key === "Escape") return close;
  if (code === "KeyV" || code === "KeyH") return { ...popup, focus: "none", prevent: true };
  if (key === "Enter" || key === " ") return popup.active >= 0 && popup.active < count ? { ...close, pick: popup.active } : close;
  // Like a menu, Tab does not walk out of the open list into the page.
  if (key === "Tab") return { ...popup, focus: "none", prevent: true };
  const last = count - 1;
  const next = key === "ArrowDown" ? Math.min(popup.active + 1, last) : key === "ArrowUp" ? Math.max(popup.active - 1, 0) : key === "Home" ? 0 : key === "End" ? last : null;
  if (next === null || count === 0) return { ...popup, focus: "none", prevent: false };
  return { ...popup, active: next, focus: "list", prevent: true };
}

// Focus moving into the canvas iframe (a click there never reaches the page as a pointerdown, and
// Escape no longer reaches the panel) closes an open popup. Focus stays where the person put it:
// pulling it back to the trigger would take it out of the canvas.
function popupBlur(popup, canvasFocused) {
  if (!popup.open || !canvasFocused) return popup;
  return { open: false, active: -1, focus: "none", pick: -1, prevent: false };
}

// ── The browser player ────────────────────────────────────────────────────────
// Play on the board opens this same file again in a window of its own, with `#doan-play=<id>` in the
// address: the page then plays that frame (player.js) and the board never runs in it. Each move is
// a new hash, so the window's own Back and Forward, the header's and a reload follow the frames. A
// window written from about:blank, a blob: or a data: URL loses that history, or the separation
// from the board's page, in Chromium or WebKit.

const PLAY_HASH = "#doan-play=";

// The frame a player address names, or null when it is no player address. An address someone
// edited so that it no longer decodes names its raw text: no frame has it, and its run fails to start.
function playHash(hash) {
  if (!hash.startsWith(PLAY_HASH) || hash.length === PLAY_HASH.length) return null;
  const raw = hash.slice(PLAY_HASH.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function playHashFor(id) {
  return PLAY_HASH + encodeURIComponent(id);
}

// The board's own file at the frame: whatever hash the board has is dropped.
function playerAddress(href, id) {
  const at = href.indexOf("#");
  return (at < 0 ? href : href.slice(0, at)) + playHashFor(id);
}

function messageId(text) {
  return text !== "" && text.length <= MAX_STRING ? text : null;
}

function messageMode(text) {
  return text === "fit" || text === "responsive" ? text : null;
}

// The board and the player post strings only, each to the window it opened or was opened by; the
// receiver checks event.source (a file page's origin is "null" for every file). The board says which
// frame to play (`play:<id>`) and, once, the mode its last player window had; the player says which
// frame it plays (`playing:<id>`) and every mode it changes to. Whether `play:` restarts is the
// player's decision: the board does not know where links have taken it.
function boardMessage(data) {
  if (typeof data !== "string") return null;
  if (data.startsWith("play:")) {
    const id = messageId(data.slice(5));
    return id === null ? null : { kind: "play", id };
  }
  if (data.startsWith("mode:")) {
    const mode = messageMode(data.slice(5));
    return mode === null ? null : { kind: "mode", mode };
  }
  return null;
}

function playerMessage(data) {
  if (typeof data !== "string") return null;
  if (data.startsWith("playing:")) {
    const id = messageId(data.slice(8));
    return id === null ? null : { kind: "playing", id };
  }
  if (data.startsWith("mode:")) {
    const mode = messageMode(data.slice(5));
    return mode === null ? null : { kind: "mode", mode };
  }
  return null;
}

// The browser has its own window controls, so the header starts with Back 16 from the left (the
// app's starts after the traffic lights). Back, Forward and Reload take 104, Fit, Responsive and
// Export 104, and the name keeps 40 on each side; under 120 for it, it takes a second row.
const PLAYER_GROUP = 104;
const PLAYER_GAP = 40;
const PLAYER_NAME_MIN = 120;
function playerRows(width) {
  return width - 2 * (16 + PLAYER_GROUP + PLAYER_GAP) >= PLAYER_NAME_MIN ? 1 : 2;
}

// What a player window starts with: the entry's own history and mode when it is reloaded (the entry's
// state holds them), else one entry at Fit until the board says otherwise.
function restorePlayer(saved, id) {
  const fresh = { history: { entries: [id], index: 0 }, mode: "fit", restored: false };
  if (!isRecord(saved) || !Array.isArray(saved.entries) || saved.entries.length === 0) return fresh;
  if (!saved.entries.every((entry) => typeof entry === "string")) return fresh;
  const index = saved.index;
  if (!Number.isInteger(index) || index < 0 || index >= saved.entries.length || saved.entries[index] !== id) return fresh;
  const mode = messageMode(saved.mode);
  if (mode === null) return fresh;
  return { history: { entries: [...saved.entries], index }, mode, restored: true };
}

// A run's canvas: the board's srcdoc with its measure script replaced by isolate.js and then the
// run's script. isolate.js stays first, so the srcdoc fixes it carries (History calls, # links,
// followed links) apply before any canvas script runs. `measure` is in the srcdoc's UTF-16 units.
function playSrcdoc(srcdoc, measure, isolate, script) {
  return srcdoc.slice(0, measure.offset) + isolate + script + srcdoc.slice(measure.offset + measure.length);
}

// A script element around generated code whose only outside text is JSON (a frame id): a backslash
// before the slash of a script end tag and before the bang of a comment opener, which a JS string
// reads as the same characters, so the code can neither end the element nor open a comment. This
// file runs inside the canvas's own script element too, so neither sequence is written out here.
function inlineScript(code) {
  return "<script>" + code.replace(/<(\/script|!--)/gi, "<\\$1") + "<" + "/script>";
}
