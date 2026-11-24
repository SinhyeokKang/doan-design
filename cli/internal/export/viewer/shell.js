// The viewer page's behaviour. `assemble` puts lib.js before this file in one inline <script>
// wrapped in a function. Anything that can be decided without the DOM lives in lib.js (and is
// tested there); this file only reads and writes the page.
//
// What it takes from the app's canvas view: the iframe is `doan:width`
// wide and as tall as the canvas reports (lib.js height rules); the window only changes the
// zoom; zoom and the frame jump use the app's constants and Fit rules; the Select and Hand tools,
// Space and V/H/Esc use the app's key rules (lib.js toolShortcut). The canvas reports only Space,
// V, H and Escape pressed while it has focus. Play prototype, its drawer, the frame drawer's
// prototype mark, the size bubble and the Option measurement use the app's own judgments
// (viewerApp.js, generated). What it leaves out: conversation, Reload, Pick and Capture.

document.documentElement.classList.add("js");

const $ = (id) => document.getElementById(id);
const meta = JSON.parse($("doan-meta").textContent);
const board = $("board");
const spacer = $("spacer");
const stage = $("stage");
const canvas = $("canvas");
const drawerButton = $("drawer-button");
const drawerLabel = $("drawer-label");
const drawer = $("drawer");
const drawerList = $("drawer-list");
const drawerNote = $("drawer-note");
const zoomOut = $("zoom-out");
const zoomIn = $("zoom-in");
const zoomButton = $("zoom-button");
const zoomValue = $("zoom-value");
const zoomMenu = $("zoom-menu");
const tools = $("tools");
const toolButtons = Array.from(tools.querySelectorAll("[data-tool]"));
const tip = $("tool-tip");
const eyeIcon = $("eye-icon");
const playIcon = $("play-icon");
const playButton = $("play");
const playReason = $("play-reason");
const playPanel = $("play-drawer");
const playList = $("play-list");
const selectionBox = $("selection-box");
const sizeBubble = $("size-bubble");
const sizeLabel = $("size-label");
const measureLayer = $("measure");
const icon = (template) => template.content.firstElementChild.cloneNode(true);

$("name").title = meta.name;
canvas.title = meta.name;
drawerList.setAttribute("aria-label", "Frames in " + meta.name);

let viewer = initialViewer();
// The selection's nearest frame and its marks, as the inspector last heard them (inspectView.js).
let selection = { target: null, selected: null, hover: null, alt: false };
// The frame the prototype player plays, for the play drawer's Playing row; null while none plays.
let playingFrame = null;
let scale = 1;
let remeasureTimer = 0;
let current = null;
// The tool and the drag (lib.js layerShown). A tool chosen during a drag waits for its end.
let tool = "select";
let pendingTool = null;
let spaceHeld = false;
let drag = null;

canvas.style.width = meta.width + "px";
canvas.style.height = viewer.height + "px";

const viewport = () => ({ width: board.clientWidth, height: board.clientHeight });

// ── Board geometry and view ───────────────────────────────────────────────────

const layoutBoard = () => {
  const geom = geometry(scale, meta.width, viewer.height, viewport());
  spacer.style.minWidth = geom.minWidth + "px";
  spacer.style.height = geom.height + "px";
  stage.style.left = geom.left + "px";
  stage.style.top = geom.top + "px";
  stage.style.setProperty("--canvas-scale", scale);
  stage.style.transform = "scale(" + scale + ")";
  return geom;
};

const readView = () => viewFrom({ left: board.scrollLeft, top: board.scrollTop }, scale, layoutBoard());

const setView = (view) => {
  scale = view.scale;
  const to = scrollFor(view, layoutBoard());
  board.scrollLeft = to.left;
  board.scrollTop = to.top;
  refresh();
};

const center = () => ({ x: board.clientWidth / 2, y: board.clientHeight / 2 });
const zoomBy = (factor, point) => setView(zoomAt(readView(), factor, point || center()));
const commands = {
  fit: () => setView(fitWidth(meta.width, viewport())),
  actual: () => zoomBy(1 / scale),
};

// ── Popup lists: the frame drawer and the zoom menu ───────────────────────────
// State and keys are lib.js popupOpen/popupKey; this wires them to a button and a panel.

const createPopup = ({ button, panel, items, onOpen, onPick }) => {
  let popup = { open: false, active: -1, focus: "none", pick: -1, prevent: false };
  const focusActive = () => {
    const nodes = items();
    nodes.forEach((node, index) => {
      node.tabIndex = index === popup.active ? 0 : -1;
      if (index === popup.active) node.setAttribute("data-highlighted", "");
      else node.removeAttribute("data-highlighted");
    });
    const node = nodes[popup.active];
    if (node) {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
    }
  };
  const hide = (focus) => {
    popup = { open: false, active: -1, focus, pick: -1, prevent: true };
    panel.hidden = true;
    inspector.syncOverlay();
    button.setAttribute("aria-expanded", "false");
    if (focus === "trigger") button.focus();
  };
  const pick = (index) => {
    hide("trigger");
    onPick(index);
  };
  const open = () => {
    const { count, start } = onOpen();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    popup = popupOpen(count, start);
    inspector.syncOverlay();
    focusActive();
  };
  button.addEventListener("click", () => (popup.open ? hide("trigger") : open()));
  panel.addEventListener("keydown", (event) => {
    if (!popup.open) return;
    const next = popupKey(popup, event.key, items().length, event.metaKey || event.ctrlKey || event.altKey ? "" : event.code);
    if (next.prevent) event.preventDefault();
    if (!next.open) {
      hide(next.focus);
      if (next.pick >= 0) onPick(next.pick);
      return;
    }
    popup = next;
    if (next.focus === "list") focusActive();
  });
  panel.addEventListener("focusin", (event) => {
    const index = items().indexOf(event.target);
    if (popup.open && index >= 0) popup = { ...popup, active: index };
  });
  // A press elsewhere closes it and leaves focus where the press put it.
  document.addEventListener("pointerdown", (event) => {
    if (popup.open && !panel.contains(event.target) && !button.contains(event.target)) hide("none");
  });
  window.addEventListener("blur", () => {
    if (popupBlur(popup, document.activeElement === canvas).open !== popup.open) hide("none");
  });
  return { hide, pick, isOpen: () => popup.open };
};

const hover = (node) => node.addEventListener("pointermove", () => {
  if (document.activeElement !== node) node.focus({ preventScroll: true });
});

const jumpTo = (index) => {
  const frame = viewer.frames && viewer.frames[index];
  if (frame) setView(fitFrame(frame, viewport(), readView()));
};

// The frame drawer: rows in document order, the one nearest the view's centre marked with the app's
// Eye (FrameRowMarks), its word kept for assistive technology. The icon is cloned from a <template>
// in shell.html: building it here would need the SVG namespace URL, and the page carries none.
// Text goes in with textContent only: a frame's id and title come from the canvas.
const drawerPopup = createPopup({
  button: drawerButton,
  panel: drawer,
  items: () => Array.from(drawerList.children),
  onOpen: () => {
    const shown = drawerView(viewer.frames, viewer.total, current);
    const playable = viewer.frames === null ? [] : viewerApp.playableFrames(viewer.frames);
    drawerList.textContent = "";
    for (const row of shown.rows) {
      const node = document.createElement("div");
      node.className = "doan-menu-item doan-frame-row";
      node.setAttribute("role", "option");
      node.tabIndex = -1;
      node.title = row.name;
      if (row.current) node.setAttribute("aria-current", "location");
      const number = document.createElement("span");
      number.className = "doan-frame-num";
      number.textContent = String(row.number);
      const name = document.createElement("span");
      name.className = "doan-frame-name";
      name.textContent = row.name;
      node.append(number, name);
      if (row.current) {
        const mark = document.createElement("span");
        mark.className = "doan-frame-current";
        mark.title = "Viewing";
        const word = document.createElement("span");
        word.className = "sr-only";
        word.textContent = "Viewing";
        mark.append(eyeIcon.content.firstElementChild.cloneNode(true), word);
        node.append(mark);
      }
      // A frame Play prototype can play, after the Eye so it lines up in every row (FrameRowMarks).
      if (playable[row.index]) {
        const mark = document.createElement("span");
        mark.className = "doan-frame-current prototype-meta-icon";
        mark.title = "Prototype supported";
        const word = document.createElement("span");
        word.className = "sr-only";
        word.textContent = "Prototype";
        mark.append(icon(playIcon), word);
        node.append(mark);
      }
      hover(node);
      node.addEventListener("click", () => drawerPopup.pick(row.index));
      drawerList.append(node);
    }
    drawerNote.hidden = shown.note === null;
    drawerNote.textContent = shown.note === null ? "" : shown.note;
    return { count: shown.rows.length, start: current === null ? 0 : current };
  },
  onPick: jumpTo,
});

// The zoom menu: Fit and 100% with their shortcuts, then two fixed percentages.
ZOOM_ITEMS.forEach((item, index) => {
  if (index === 2) {
    const separator = document.createElement("div");
    separator.className = "doan-menu-sep";
    separator.setAttribute("role", "separator");
    zoomMenu.append(separator);
  }
  const node = document.createElement("div");
  node.className = "doan-menu-item";
  node.setAttribute("role", "menuitem");
  node.tabIndex = -1;
  node.append(item.label);
  if (item.shortcut !== undefined) {
    const key = document.createElement("span");
    key.className = "sub doan-zoom-key";
    key.textContent = item.shortcut;
    node.append(key);
  }
  hover(node);
  node.addEventListener("click", () => zoomPopup.pick(index));
  zoomMenu.append(node);
});
const zoomPopup = createPopup({
  button: zoomButton,
  panel: zoomMenu,
  items: () => Array.from(zoomMenu.querySelectorAll('[role="menuitem"]')),
  onOpen: () => ({ count: ZOOM_ITEMS.length, start: 0 }),
  onPick: (index) => {
    const item = ZOOM_ITEMS[index];
    if (item.scale !== undefined) zoomBy(item.scale / scale);
    else commands[item.id]();
  },
});

// At a zoom limit a button stays focusable and its press does nothing: a native `disabled` set by the
// button's own press would drop focus to the page (POSTMORTEM 2026-10-24). Before the first view the
// whole zoom control is off, natively disabled.
const unavailable = (button) => button.getAttribute("aria-disabled") === "true";
const setZoomStep = (button, ready, atLimit) => {
  button.disabled = !ready;
  if (ready && atLimit) button.setAttribute("aria-disabled", "true");
  else button.removeAttribute("aria-disabled");
};
zoomOut.addEventListener("click", () => {
  if (!unavailable(zoomOut)) zoomBy(1 / ZOOM_STEP);
});
zoomIn.addEventListener("click", () => {
  if (!unavailable(zoomIn)) zoomBy(ZOOM_STEP);
});

// ── Header ────────────────────────────────────────────────────────────────────

function refresh() {
  const ready = viewer.phase === "ready";
  current = ready && viewer.frames !== null ? currentFrame(viewer.frames, readView(), viewport()) : null;
  const shown = drawerView(viewer.frames, viewer.total, current);
  drawerButton.disabled = !shown.enabled;
  drawerButton.setAttribute("aria-label", shown.ariaLabel);
  drawerButton.title = shown.buttonLabel;
  drawerLabel.textContent = shown.buttonLabel;
  if (!shown.enabled && drawerPopup.isOpen()) drawerPopup.hide("none");
  const zoom = zoomView(scale, ready);
  zoomButton.disabled = !zoom.enabled;
  setZoomStep(zoomOut, zoom.enabled, zoom.zoomOutDisabled);
  setZoomStep(zoomIn, zoom.enabled, zoom.zoomInDisabled);
  zoomValue.textContent = zoom.value;
  zoomButton.setAttribute("aria-label", zoom.triggerLabel);
  if (!zoom.enabled && zoomPopup.isOpen()) zoomPopup.hide("none");
  drawSelection();
}

// ── The canvas ────────────────────────────────────────────────────────────────

// The first view is Fit, once the canvas has reported a height (or the wait ran out).
const step = (result) => {
  viewer = result.state;
  canvas.style.height = viewer.height + "px";
  layoutBoard();
  clearTimeout(remeasureTimer);
  if (result.remeasure) {
    remeasureTimer = setTimeout(() => {
      if (canvas.contentWindow) canvas.contentWindow.postMessage({ type: "measure" }, "*");
    }, REMEASURE_MS);
  }
  if (result.ready) {
    document.documentElement.classList.add("ready");
    commands.fit();
    syncSurface();
  } else {
    refresh();
  }
};

setTimeout(() => {
  const result = viewerTimeout(viewer);
  if (result.ready) step(result);
}, FIRST_LAYOUT_TIMEOUT_MS);

window.addEventListener("message", (event) => {
  if (acceptPlayer(event)) return;
  const message = acceptMessage(event, canvas.contentWindow);
  if (message === null) { inspector.accept(event); return; }
  if (message.type === "layout") {
    step(viewerLayout(viewer, message));
    return;
  }
  if (message.type === "key") {
    // A Space down counts only while the canvas has focus, so the canvas's own scripts cannot raise
    // the drag surface over a person's clicks; a release always counts.
    if (message.key !== "Escape" && inspector.menuOpen()) return;
    if (message.key === "Space") {
      if (!message.down || document.activeElement === canvas) spaceKey(message.down);
    } else if (message.key === "Escape") escapeTool(false, false, message.repeat);
    else chooseTool(message.key === "V" ? "select" : "hand");
    return;
  }
  // Wheel input the canvas cannot use itself. Ctrl/Cmd (a pinch included) zooms around the point
  // under the cursor, which arrives in board coordinates; anything else scrolls the board.
  inspector.wheel(message);
  const action = wheelAction(message);
  if (action.zoom !== undefined) {
    const view = readView();
    zoomBy(action.zoom, { x: message.x * view.scale + view.x, y: message.y * view.scale + view.y });
  } else {
    board.scrollLeft -= action.pan.dx;
    board.scrollTop -= action.pan.dy;
  }
});

// A wheel over the page around the canvas: plain scrolls the board natively, Ctrl/Cmd zooms.
board.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const box = board.getBoundingClientRect();
    const action = wheelAction({ dx: event.deltaX, dy: event.deltaY, ctrl: true, meta: false, deltaMode: event.deltaMode });
    zoomBy(action.zoom, { x: event.clientX - box.left, y: event.clientY - box.top });
  },
  { passive: false },
);

// The frame in view follows scrolling; one repaint per frame at most.
let scrolling = false;
board.addEventListener("scroll", () => {
  if (scrolling) return;
  scrolling = true;
  requestAnimationFrame(() => {
    scrolling = false;
    refresh();
  });
});

new ResizeObserver(() => {
  layoutBoard();
  refresh();
}).observe(board);

// ⇧1 Fit and ⇧0 100% while this page has focus; the canvas does not pass them on.
document.addEventListener("keydown", (event) => {
  const command = shortcutCommand(event);
  if (command === null || viewer.phase !== "ready") return;
  event.preventDefault();
  commands[command]();
});

// ── Tools: Select and Hand ────────────────────────────────────────────────────
// Select leaves the canvas to the person. In Hand, while Space is held and through a drag, the
// board is the drag surface: the canvas iframe takes no pointer (shell.css), so a press, a drag
// and the wheel over the canvas reach the board, whose native scroll and ⌘/Ctrl-wheel listener
// above do the rest.

const boardDrawn = () => viewer.phase === "ready";
// Whether the canvas document was last told the board pans. A pointer resting over the canvas keeps the cursor the
// canvas last set until it moves, so the canvas shows the hand itself (measure.js). A newly loaded document has been
// told nothing.
let panTold = false;

const flipCursor = () => {
  canvas.style.cursor = canvas.style.cursor === "default" ? "auto" : "default";
};

function syncSurface() {
  // A Space held before the canvas was drawn does not pan the canvas that comes later.
  if (!boardDrawn()) spaceHeld = false;
  const pan = board.toggleAttribute("data-pan", layerShown(tool, spaceHeld, drag !== null, boardDrawn()));
  if (!pan || tool !== "hand" || spaceHeld) textHover = false;
  board.toggleAttribute("data-grabbing", drag?.mode === "pan");
  board.toggleAttribute("data-text", drag === null ? textHover : drag.mode === "text" || (drag.mode === "asking" && textHover));
  if (pan !== panTold && canvas.contentWindow) {
    panTold = pan;
    canvas.contentWindow.postMessage({ type: "pan", pan }, "*");
    inspector.pan(pan);
    // Once the pointer has moved over the panning board the page holds the cursor, and after the pan
    // Chromium recomputes it over the iframe only when the iframe's own cursor value changes, and only
    // reliably once a frame without the pan has been drawn. Its computed cursor starts as auto.
    if (!pan) requestAnimationFrame(() => requestAnimationFrame(flipCursor));
  }
}

// The pressed tool holds the toolbar's one Tab stop.
function chooseTool(next) {
  if (drag !== null) {
    pendingTool = next;
    return;
  }
  pendingTool = null;
  tool = next;
  if (next === "hand") inspector.clearSelection();
  for (const button of toolButtons) {
    const own = button.dataset.tool === tool;
    button.setAttribute("aria-pressed", String(own));
    button.tabIndex = own ? 0 : -1;
  }
  syncSurface();
}

// Returns whether the key was the tools'. Without a drawn canvas Space does nothing.
function spaceKey(down) {
  if (!down) {
    const held = spaceHeld;
    spaceHeld = false;
    syncSurface();
    return held;
  }
  if (!boardDrawn()) return false;
  spaceHeld = true;
  syncSurface();
  return true;
}

// Esc on the page closes the tooltip first, as the app's; an open menu takes its own Esc before
// this (it prevents it); then Hand goes back to Select. Returns whether Esc was used.
function escapeKey(editable, handled, repeat) {
  if (!handled && !tip.hidden) {
    hideTip();
    return true;
  }
  return escapeTool(editable, handled, repeat);
}

// Hand back to Select, else the selection's step. An Esc forwarded from the canvas comes straight
// here: the app's tooltip hears Esc only on the app document, so it never spends one pressed inside
// the canvas. A held Esc's repeats take no selection step, so one press steps back one level.
function escapeTool(editable, handled, repeat) {
  if (editable || handled) return false;
  // Esc during Hand's text drag ends it and clears the range, as in Select, before it turns Hand off.
  if (drag?.mode === "text") {
    drag.mode = "ended";
    inspector.clearText();
    syncSurface();
    return true;
  }
  if (!escapeSelects({ hand: (pendingTool ?? tool) === "hand", editable, defaultPrevented: handled })) return !repeat && inspector.escape();
  chooseTool("select");
  return true;
}

document.addEventListener("keydown", (event) => {
  const shortcut = toolShortcut(event, { canvasPage: true });
  if (shortcut !== null) {
    if (inspector.blocks(event.target)) return;
    if (shortcut.kind === "tool" ? (chooseTool(shortcut.tool), true) : spaceKey(true)) event.preventDefault();
    return;
  }
  // A held Space's repeats keep the board from scrolling a screen down, and a button from pressing.
  if (event.code === "Space" && event.repeat && spaceHeld) {
    event.preventDefault();
    return;
  }
  if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
  if (escapeKey(editableTarget(event.target), event.defaultPrevented, event.repeat)) event.preventDefault();
});

document.addEventListener("keyup", (event) => {
  const shortcut = toolShortcut(event, { canvasPage: true });
  if (shortcut !== null && spaceKey(false)) event.preventDefault();
});

// The board's scroll range, so a drag stops at its edges (lib.js panScroll).
const maxScroll = () => ({ left: board.scrollWidth - board.clientWidth, top: board.scrollHeight - board.clientHeight });

// Only the primary button drags, with any modifier. A drag in Hand focuses the board, so the keys
// after it (Esc, V, H) reach this page; a held Space already has focus where it came from.
board.addEventListener("pointerdown", (event) => {
  if (!layerShown(tool, spaceHeld, false, boardDrawn()) || event.button !== 0 || drag !== null) return;
  // A press on the board's own scrollbar scrolls it.
  const box = board.getBoundingClientRect();
  if (event.clientX - box.left - board.clientLeft >= board.clientWidth || event.clientY - box.top - board.clientTop >= board.clientHeight) return;
  event.preventDefault();
  if (!spaceHeld) board.focus({ preventScroll: true });
  // Keeps the drag when the pointer leaves the window.
  board.setPointerCapture(event.pointerId);
  // Hand's press is the canvas's next primary press, so it ends the range as one in Select does; a held
  // Space and a Ctrl press keep it.
  const handPress = !spaceHeld && tool === "hand" && !event.ctrlKey;
  if (handPress) inspector.clearText();
  // A plain press on canvas text drags a range as Select's does (PRODUCT §5 item 3 'Export and viewer').
  // Only the canvas can tell, so the pan waits for its answer, holding the travel; a modifier pans at once.
  const asks = handPress && !event.metaKey && !event.altKey && !event.shiftKey;
  const own = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, restX: 0, restY: 0, mode: asks ? "asking" : "pan", heldX: 0, heldY: 0 };
  drag = own;
  if (asks) inspector.handPress(event.clientX, event.clientY, (hit) => handHit(own, hit));
  syncSurface();
});

function handHit(own, hit) {
  if (drag !== own || own.mode !== "asking") return;
  own.mode = hit ? "text" : "pan";
  if (own.heldX !== 0 || own.heldY !== 0) {
    if (hit) inspector.handMove(own.x, own.y);
    else panBoard(own, own.heldX, own.heldY);
  }
  syncSurface();
}

// Safari keeps scroll offsets in whole pixels: what a move could not apply goes into the next one, so
// the canvas stays under the cursor.
function panBoard(own, dx, dy) {
  const next = panScroll({ left: board.scrollLeft + own.restX, top: board.scrollTop + own.restY }, maxScroll(), dx, dy);
  board.scrollLeft = next.left;
  board.scrollTop = next.top;
  own.restX = next.left - board.scrollLeft;
  own.restY = next.top - board.scrollTop;
}

// Hand's text cursor follows a resting pointer: one question to the canvas a frame, for the newest point.
let textHover = false;
let hoverAt = null;
function askTextHover(x, y) {
  const queued = hoverAt !== null;
  hoverAt = { x, y };
  if (queued) return;
  requestAnimationFrame(() => {
    const at = hoverAt;
    hoverAt = null;
    if (at === null || drag !== null || tool !== "hand" || spaceHeld || !boardDrawn()) return;
    inspector.handAt(at.x, at.y, (hit) => {
      textHover = hit;
      syncSurface();
    });
  });
}

// Each move's own travel, so a zoom during the drag stays.
board.addEventListener("pointermove", (event) => {
  if (drag === null) {
    if (tool === "hand" && !spaceHeld) askTextHover(event.clientX, event.clientY);
    return;
  }
  if (event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if ((dx === 0 && dy === 0) || drag.mode === "ended") return;
  if (drag.mode === "asking") {
    drag.heldX += dx;
    drag.heldY += dy;
  } else if (drag.mode === "text") inspector.handMove(drag.x, drag.y);
  else panBoard(drag, dx, dy);
});

// A tool chosen during the drag comes in at its end. The canvas's press or text drag ends with it.
function finishDrag() {
  const ending = drag;
  drag = null;
  // Also after Esc ended it: the page stops taking the canvas's dragging range without its focus.
  if (ending !== null && ending.mode !== "pan") inspector.handRelease();
  if (ending !== null && board.hasPointerCapture(ending.pointerId)) board.releasePointerCapture(ending.pointerId);
  if (pendingTool !== null) chooseTool(pendingTool);
  else syncSurface();
}

const endDrag = (event) => {
  if (drag !== null && event.pointerId === drag.pointerId) finishDrag();
};
board.addEventListener("pointerup", endDrag);
board.addEventListener("pointercancel", endDrag);
board.addEventListener("lostpointercapture", endDrag);

const releaseInput = () => {
  spaceHeld = false;
  finishDrag();
};
// The window's blur also fires when focus moves into the canvas iframe; only the page losing focus
// lets Space go. A canvas that loads another document ends a held Space and a drag too.
window.addEventListener("blur", () => {
  if (!document.hasFocus()) releaseInput();
});
canvas.addEventListener("load", () => {
  panTold = false;
});
canvas.addEventListener("load", releaseInput);

// ── Toolbar: buttons, ←/→ and the tooltip ─────────────────────────────────────

for (const button of toolButtons) button.addEventListener("click", () => chooseTool(button.dataset.tool));
// A pointer press leaves focus where it was (the canvas area), so Space after a click pans instead of
// pressing the tool again; Chromium would otherwise focus the button. Focus that came by keyboard stays.
// Play prototype follows the same rule (CanvasTools.tsx keepFocus).
for (const button of [...toolButtons, playButton]) button.addEventListener("mousedown", (event) => event.preventDefault());

// ←/→ walk the tools and then Play prototype, which never holds the Tab stop itself.
const navButtons = [...toolButtons, playButton];
tools.addEventListener("keydown", (event) => {
  const next = toolbarMove(navButtons.indexOf(document.activeElement), navButtons.length, event.key);
  if (next === null) return;
  event.preventDefault();
  navButtons[next].focus();
});

// One tooltip, 4 above its button (the app's sideOffset), centred on it: a tool's name or its
// `data-tip` with its key, Play prototype's reason, a size bubble button's name or reason. Text goes
// in with textContent only. Play prototype keeps its reason as its own description.
const TOOLTIP_OFFSET = 4;
let tipFor = null;
let tipTimer = 0;
let tipClosedAt = null;

function scheduleTip(button) {
  clearTimeout(tipTimer);
  const wait = tipWait(performance.now(), tipClosedAt);
  if (wait === 0) showTip(button);
  else tipTimer = setTimeout(() => showTip(button), wait);
}

function showTip(button) {
  const shortcut = button.getAttribute("aria-keyshortcuts");
  const text = button === playButton ? playReason.textContent : button.dataset.tip ?? button.getAttribute("aria-label");
  tip.classList.toggle("has-key", shortcut !== null);
  tip.textContent = shortcut === null ? text : "";
  if (shortcut !== null) {
    // The label in its own box, so a label longer than the tooltip's width (Select's) wraps before its key
    // instead of pushing the key out of the capsule.
    const label = document.createElement("span");
    label.className = "vw-tip-label";
    label.textContent = text;
    tip.append(label);
    const key = document.createElement("span");
    key.className = "doan-kbd";
    key.setAttribute("data-ui-variant", "on-prominent");
    key.setAttribute("data-ui-size", "sm");
    key.textContent = shortcut;
    tip.append(key);
  }
  const panel = tip.parentElement.getBoundingClientRect();
  const box = button.getBoundingClientRect();
  tip.style.left = box.left + box.width / 2 - panel.left + "px";
  tip.style.top = box.top - TOOLTIP_OFFSET - panel.top + "px";
  if (tipFor !== null && tipFor !== button && tipFor !== playButton) tipFor.removeAttribute("aria-describedby");
  if (button !== playButton && !button.hasAttribute("data-own-description")) button.setAttribute("aria-describedby", "tool-tip");
  tipFor = button;
  tip.hidden = false;
}

function hideTip() {
  clearTimeout(tipTimer);
  if (!tip.hidden) tipClosedAt = performance.now();
  if (tipFor !== null && tipFor !== playButton && !tipFor.hasAttribute("data-own-description")) tipFor.removeAttribute("aria-describedby");
  tipFor = null;
  tip.hidden = true;
}

function bindTip(button) {
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") scheduleTip(button);
  });
  button.addEventListener("pointerleave", hideTip);
  button.addEventListener("pointerdown", hideTip);
  // Keyboard focus only: a pointer press does not focus the button, and closes its tooltip.
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) showTip(button);
  });
  button.addEventListener("blur", hideTip);
}
for (const button of navButtons) bindTip(button);

// ── Play prototype ────────────────────────────────────────────────────────────
// The toolbar's button is one element in every state (the app's CanvasTools.tsx): it plays the
// frame, opens the play drawer above it, or is unavailable with its reason. Its judgement, tooltip
// and drawer are the app's prototypePlay.ts, generated into viewerApp.js, over a state built from
// this page: the canvas file as the open row, no pick or capture, the layout once the board is drawn
// and the selection's nearest frame. The file's own prototype data (META) is what Export
// prototype can write; it is not what plays.

const CANVAS_PATH = meta.name + ".html";

function playState() {
  const target = selection.target;
  return {
    open: { folder: "", row: { path: CANVAS_PATH } },
    status: null,
    picking: false,
    capturing: false,
    selection: target === null || target.id === undefined ? null
      : { frame: { id: target.id }, ...(target.kind === "element" ? { element: {} } : {}), ...(target.index === undefined ? {} : { frameIndex: target.index }) },
    layout: viewer.phase === "ready" && viewer.frames !== null ? { frames: viewer.frames, gotos: viewer.gotos } : null,
  };
}

const playing = () => (playingFrame === null ? null : { root: "", canvas: { path: CANVAS_PATH }, frame: playingFrame });

// ── The player window ─────────────────────────────────────────────────────────
// Every Play (the toolbar's, the size bubble's, a play drawer row) comes here with the frame's id,
// always from the press's own click or keydown handler: the browser allows a window only during the
// person's input, and a click in the canvas iframe would lend this page that allowance, so nothing a
// canvas message starts may open one. The window is this file again at `#doan-play=<id>`
// (player.js), under a name made for this board's page, so a reloaded board, or another file's,
// opens a window of its own. One window per board: Play while it is open brings it forward and tells
// it the frame (a string, as everything this page and the player send each other); the player keeps
// the frame it plays or starts the new one. The browser says nothing when a window closes, so the
// board looks every POLL_MS; focus then comes back to the Play pressed (prototypePlay.ts
// closedFocusTarget).
const PLAYER_NAME = "doan-play-" + Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const POLL_MS = 250;
// How long the board waits to lose focus to the window it brought forward: no blur by then means the
// browser did not bring it, or the board cannot tell, and the toast says where the prototype is.
const RAISE_MS = 250;
const toast = createToast();
let playerWindow = null;
let playerHeard = false;
// The mode the last player window of this page had: a window opened again starts in it.
let playerMode = "fit";
let blockedToast = null;
let playerPoll = 0;

function playPrototype(frameId) {
  if (playerWindow !== null && !playerWindow.closed) {
    let raised = false;
    const lost = () => { raised = true; };
    window.addEventListener("blur", lost, { once: true });
    playerWindow.focus();
    playerWindow.postMessage("play:" + frameId, "*");
    playerOpened();
    setTimeout(() => {
      window.removeEventListener("blur", lost);
      if (!raised) toast.show(PLAYER_COPY.elsewhere);
    }, RAISE_MS);
    return;
  }
  const opened = window.open(playerAddress(location.href, frameId), PLAYER_NAME);
  if (opened === null) {
    blockedToast = toast.show(PLAYER_COPY.blocked);
    return;
  }
  playerWindow = opened;
  playerHeard = false;
  playerOpened();
  clearInterval(playerPoll);
  playerPoll = setInterval(() => {
    if (playerWindow !== null && !playerWindow.closed) return;
    clearInterval(playerPoll);
    playerWindow = null;
    playingFrame = null;
    refreshPlay();
    viewerApp.closedFocusTarget(selectionBox.hidden ? null : bubblePlay, playButton)?.focus({ preventScroll: true });
  }, POLL_MS);
}

// A Play that reached a window takes the blocked window's toast away.
function playerOpened() {
  if (blockedToast !== null && toast.current() === blockedToast) toast.dismiss(blockedToast);
  blockedToast = null;
}

// The player's strings, only from the window this page opened. Its first word answers with the mode
// to start in; the play drawer marks the frame it says it plays.
function acceptPlayer(event) {
  if (playerWindow === null || event.source === null || event.source !== playerWindow) return false;
  const message = playerMessage(event.data);
  if (message === null) return true;
  if (message.kind === "mode") {
    playerMode = message.mode;
    return true;
  }
  if (!playerHeard) {
    playerHeard = true;
    playerWindow.postMessage("mode:" + playerMode, "*");
  }
  playingFrame = message.id;
  refreshPlay();
  return true;
}

// The play drawer: the playable frames in link groups, the Playing row marked with the app's Eye, and
// the app's keys (frameDrawerList.ts drawerKey: arrows stop at the ends, Home/End, typeahead, Enter
// and Space pick, Tab stays). Opening focuses the playing row, else the first; Esc and a pick close
// it and return focus to Play prototype. A pick plays that frame and leaves the board's selection.
const playPopup = (() => {
  let open = false;
  let focused = null;
  let typed = { text: "", at: 0 };
  let rows = [];
  let shownKey = "";
  let nodes = new Map();
  const move = (key) => {
    const node = key === null ? undefined : nodes.get(key);
    if (!node) return;
    focused = key;
    for (const [other, row] of nodes) row.tabIndex = other === key ? 0 : -1;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  };
  const close = (focus) => {
    if (!open) return;
    open = false;
    focused = null;
    playPanel.hidden = true;
    playButton.setAttribute("aria-expanded", "false");
    inspector.syncOverlay();
    if (focus) playButton.focus({ preventScroll: true });
  };
  const pick = (row) => {
    const request = viewerApp.drawerPlayRequest(playState(), row.id);
    close(true);
    if (request !== null) playPrototype(request.frame);
  };
  const render = (drawer) => {
    shownKey = JSON.stringify(drawer);
    playList.setAttribute("aria-label", drawer.label);
    nodes = drawerRows(playList, drawer.groups, eyeIcon, "Playing", { focus: (row) => { focused = row.key; }, pick });
    rows = viewerApp.drawerOrder(drawer.groups);
  };
  playPanel.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    const result = viewerApp.drawerKey(rows, focused, event, typed, Date.now());
    typed = result.typed;
    if (result.prevent) event.preventDefault();
    const picked = result.pick === undefined ? undefined : rows.find((row) => row.key === result.pick);
    if (picked) pick(picked);
    else if (result.move !== undefined) move(result.move);
  });
  // A press elsewhere closes it and leaves focus where the press put it.
  document.addEventListener("pointerdown", (event) => {
    if (open && !playPanel.contains(event.target) && !playButton.contains(event.target)) close(false);
  });
  window.addEventListener("blur", () => {
    if (open && document.activeElement === canvas) close(false);
  });
  return {
    isOpen: () => open,
    close,
    toggle() {
      if (open) {
        close(true);
        return;
      }
      render(viewerApp.playDrawer(playState(), playing()));
      open = true;
      const holder = playPanel.parentElement.getBoundingClientRect();
      const button = playButton.getBoundingClientRect();
      playPanel.style.left = button.left + button.width / 2 - holder.left + "px";
      playPanel.style.bottom = holder.bottom - button.top + "px";
      playPanel.hidden = false;
      playButton.setAttribute("aria-expanded", "true");
      inspector.syncOverlay();
      move(viewerApp.focusedRowAfter(rows, null));
    },
    // Rows that change while it is open keep the focused frame, else the current one. A scroll or a
    // zoom changes no row, so the list is not rebuilt under the pointer.
    refresh() {
      if (!open) return;
      const drawer = viewerApp.playDrawer(playState(), playing());
      if (JSON.stringify(drawer) === shownKey) return;
      const inside = playPanel.contains(document.activeElement);
      render(drawer);
      const next = viewerApp.focusedRowAfter(rows, focused);
      if (inside) move(next);
      else focused = next;
    },
  };
})();

let playKind = "disabled";
function refreshPlay() {
  const state = playState();
  const play = viewerApp.canvasPlayability(state);
  playKind = play.kind;
  playReason.textContent = viewerApp.playTooltip(state);
  if (play.kind === "disabled") playButton.setAttribute("aria-disabled", "true");
  else playButton.removeAttribute("aria-disabled");
  if (play.kind === "drawer") {
    playButton.setAttribute("aria-haspopup", "listbox");
    playButton.setAttribute("aria-controls", "play-drawer");
    playButton.setAttribute("aria-expanded", String(playPopup.isOpen()));
    playPopup.refresh();
  } else {
    // A drawer whose state went closes for good, so it does not come back by itself (the app's App.tsx).
    if (playPopup.isOpen()) playPopup.close(playPanel.contains(document.activeElement));
    for (const name of ["aria-haspopup", "aria-controls", "aria-expanded"]) playButton.removeAttribute(name);
  }
  if (tipFor === playButton && !tip.hidden) showTip(playButton);
}

playButton.addEventListener("click", () => {
  if (playKind === "play") {
    const request = viewerApp.playRequest(playState());
    if (request !== null) playPrototype(request.frame);
  } else if (playKind === "drawer") playPopup.toggle();
});

// ── The size bubble and the Option measurement ────────────────────────────────
// Drawn in the board's scrolled content over the scaled stage, in screen px as the app draws them, so
// lines stay 1px and the bubble keeps its size at any zoom. The bubble is outside the aria-hidden
// marks so its buttons take focus. It always hangs below the selection, as the app's (styles.css
// .dims); its items and its size are the app's (bubbleItems.ts without Add to message, selection.ts
// sizeLabel); the lines are measure.ts's.

const bubblePlay = document.createElement("button");
bubblePlay.type = "button";
bubblePlay.className = "doan-icon-button bubble-button bubble-play";
bubblePlay.setAttribute("data-ui-size", "xs");
bubblePlay.setAttribute("aria-label", "Play prototype");
bubblePlay.append(icon(playIcon));
const bubbleInspect = document.createElement("button");
bubbleInspect.type = "button";
bubbleInspect.className = "doan-icon-button bubble-button";
bubbleInspect.setAttribute("data-ui-size", "xs");
bubbleInspect.setAttribute("aria-label", "Show inspector");
bubbleInspect.setAttribute("aria-expanded", "false");
bubbleInspect.setAttribute("aria-controls", "inspector");
bubbleInspect.append(icon($("sliders-icon")));
for (const button of [bubblePlay, bubbleInspect]) bindTip(button);

// The bubble's presses stay its own: the board's drag, a text range's clear and the popups' outside
// press do not see them (the app's makeBubble). Show inspector keeps focus off itself, as the header's.
sizeBubble.addEventListener("pointerdown", (event) => event.stopPropagation());
sizeBubble.addEventListener("mousedown", (event) => {
  event.stopPropagation();
  if (bubbleInspect.contains(event.target)) event.preventDefault();
});
sizeBubble.addEventListener("click", (event) => {
  event.stopPropagation();
  if (bubblePlay.contains(event.target)) {
    if (!viewerApp.sizeBubblePlay(playState())) return;
    const request = viewerApp.playRequest(playState());
    if (request !== null) playPrototype(request.frame);
  } else if (bubbleInspect.contains(event.target) && bubbleInspect.getAttribute("aria-disabled") !== "true") inspector.reveal();
});

let mounted = false;

function drawSelection() {
  if (!mounted) return;
  refreshPlay();
  const active = document.activeElement;
  const had = active === bubblePlay ? "play" : active === bubbleInspect ? "inspect" : null;
  const rect = selection.target !== null && boardDrawn() ? selection.selected : null;
  selectionBox.hidden = rect === null;
  const left = parseFloat(stage.style.left) || 0;
  const top = parseFloat(stage.style.top) || 0;
  if (rect !== null) {
    const screen = { x: left + rect.x * scale, y: top + rect.y * scale, width: rect.width * scale, height: rect.height * scale };
    Object.assign(selectionBox.style, { left: screen.x + "px", top: screen.y + "px", width: screen.width + "px", height: screen.height + "px" });
    const state = playState();
    const play = viewerApp.sizeBubblePlay(state);
    const items = viewerApp.bubbleItems({ play, ...inspector.panelState() }).filter((item) => item.kind !== "add");
    const children = [];
    for (const item of items) {
      if (item.kind === "play") children.push(bubblePlay);
      else if (item.kind === "size") children.push(sizeLabel);
      else if (item.kind === "inspect") {
        children.push(bubbleInspect);
        // The app's reason names the conversation; the browser's is the header's own.
        if (item.disabled !== undefined) {
          bubbleInspect.setAttribute("aria-disabled", "true");
          bubbleInspect.setAttribute("aria-describedby", "bubble-inspect-reason");
          bubbleInspect.setAttribute("data-own-description", "");
          bubbleInspect.dataset.tip = inspector.noRoom;
          $("bubble-inspect-reason").textContent = inspector.noRoom;
        } else {
          for (const name of ["aria-disabled", "aria-describedby", "data-own-description", "data-tip"]) bubbleInspect.removeAttribute(name);
        }
      }
    }
    if (children.some((child, index) => sizeBubble.children[index] !== child) || sizeBubble.children.length !== children.length) sizeBubble.replaceChildren(...children);
    sizeLabel.textContent = viewerApp.sizeLabel(rect);
    sizeBubble.className = play ? "dims playable" : "dims";
  }
  // Focus never falls to the page when a bubble button goes: Play hands it to the toolbar's Play
  // prototype, the visible control for the same action; Show inspector to the header's, else the board.
  if (had === "play" && (rect === null || !bubblePlay.isConnected)) playButton.focus({ preventScroll: true });
  if (had === "inspect" && (rect === null || !bubbleInspect.isConnected)) {
    const show = $("inspector-show");
    (show.offsetParent !== null ? show : board).focus({ preventScroll: true });
  }
  drawMeasure(left, top);
}

let measureNodes = [];
function drawMeasure(left, top) {
  const { selected, hover, alt } = selection;
  const measured = alt && selected !== null && hover !== null && boardDrawn();
  measureLayer.hidden = !measured;
  if (!measured) return;
  const drawn = viewerApp.measureLines(selected, hover);
  drawn.forEach((line, index) => {
    let element = measureNodes[index];
    if (element === undefined) {
      element = { line: document.createElement("div"), label: document.createElement("span") };
      element.label.className = "measure-label";
      element.line.append(element.label);
      measureLayer.append(element.line);
      measureNodes.push(element);
    }
    const horizontal = line.axis === "x";
    element.line.hidden = false;
    element.line.className = "measure-line " + (horizontal ? "h" : "v") + (line.dashed ? " dashed" : "");
    element.label.hidden = line.dashed;
    element.label.textContent = line.dashed ? "" : viewerApp.canvasPx(line.to - line.from);
    const x = left + (horizontal ? line.from : line.at) * scale;
    const y = top + (horizontal ? line.at : line.from) * scale;
    const length = (line.to - line.from) * scale + "px";
    Object.assign(element.line.style, { left: x + "px", top: y + "px", width: horizontal ? length : "", height: horizontal ? "" : length });
  });
  for (const element of measureNodes.slice(drawn.length)) element.line.hidden = true;
}

const inspector = mountViewerInspector(canvas, board, () => drawerPopup.isOpen() || zoomPopup.isOpen() || playPopup.isOpen(), (state) => {
  selection = state;
  drawSelection();
});
mounted = true;
refresh();
