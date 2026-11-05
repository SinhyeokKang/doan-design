// The viewer page's behaviour. `assemble` puts lib.js before this file in one inline <script>
// wrapped in a function. Anything that can be decided without the DOM lives in lib.js (and is
// tested there); this file only reads and writes the page.
//
// What it takes from the app's canvas view (design 'viewer shell'): the iframe is `doan:width`
// wide and as tall as the canvas reports (lib.js height rules); the window only changes the
// zoom; zoom and the frame jump use the app's constants and Fit rules; the Select and Hand tools,
// Space and V/H/Esc use the app's key rules (lib.js toolShortcut). The canvas reports only Space,
// V, H and Escape pressed while it has focus. What it leaves out: selection, comments,
// conversation and Reload.

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

$("name").title = meta.name;
canvas.title = meta.name;
drawerList.setAttribute("aria-label", "Frames in " + meta.name);

let viewer = initialViewer();
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

// The frame drawer: rows in document order, the one nearest the view's centre marked "Viewing".
// Text goes in with textContent only: a frame's id and title come from the canvas.
const drawerPopup = createPopup({
  button: drawerButton,
  panel: drawer,
  items: () => Array.from(drawerList.children),
  onOpen: () => {
    const shown = drawerView(viewer.frames, viewer.total, current);
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
        const viewing = document.createElement("span");
        viewing.className = "doan-frame-viewing";
        viewing.textContent = "Viewing";
        node.append(viewing);
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

zoomOut.addEventListener("click", () => zoomBy(1 / ZOOM_STEP));
zoomIn.addEventListener("click", () => zoomBy(ZOOM_STEP));

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
  zoomOut.disabled = zoom.zoomOutDisabled;
  zoomIn.disabled = zoom.zoomInDisabled;
  zoomValue.textContent = zoom.value;
  zoomButton.setAttribute("aria-label", zoom.triggerLabel);
  if (!zoom.enabled && zoomPopup.isOpen()) zoomPopup.hide("none");
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
  const message = acceptMessage(event, canvas.contentWindow);
  if (message === null) return;
  if (message.type === "layout") {
    step(viewerLayout(viewer, message));
    return;
  }
  if (message.type === "key") {
    // A Space down counts only while the canvas has focus, so the canvas's own scripts cannot raise
    // the drag surface over a person's clicks; a release always counts.
    if (message.key === "Space") {
      if (!message.down || document.activeElement === canvas) spaceKey(message.down);
    } else if (message.key === "Escape") escapeKey(false, false);
    else chooseTool(message.key === "V" ? "select" : "hand");
    return;
  }
  // Wheel input the canvas cannot use itself. Ctrl/Cmd (a pinch included) zooms around the point
  // under the cursor, which arrives in board coordinates; anything else scrolls the board.
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

function syncSurface() {
  // A Space held before the canvas was drawn does not pan the canvas that comes later.
  if (!boardDrawn()) spaceHeld = false;
  board.toggleAttribute("data-pan", layerShown(tool, spaceHeld, drag !== null, boardDrawn()));
  board.toggleAttribute("data-grabbing", drag !== null);
}

// The pressed tool holds the toolbar's one Tab stop.
function chooseTool(next) {
  if (drag !== null) {
    pendingTool = next;
    return;
  }
  pendingTool = null;
  tool = next;
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

// Esc closes the tooltip first, as the app's; an open menu takes its own Esc before this (it
// prevents it); then Hand goes back to Select. Returns whether Esc was used.
function escapeKey(editable, handled) {
  if (!handled && !tip.hidden) {
    hideTip();
    return true;
  }
  if (!escapeSelects({ hand: (pendingTool ?? tool) === "hand", editable, defaultPrevented: handled })) return false;
  chooseTool("select");
  return true;
}

document.addEventListener("keydown", (event) => {
  const shortcut = toolShortcut(event, { canvasPage: true });
  if (shortcut !== null) {
    if (shortcut.kind === "tool" ? (chooseTool(shortcut.tool), true) : spaceKey(true)) event.preventDefault();
    return;
  }
  // A held Space's repeats keep the board from scrolling a screen down, and a button from pressing.
  if (event.code === "Space" && event.repeat && spaceHeld) {
    event.preventDefault();
    return;
  }
  if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
  if (escapeKey(editableTarget(event.target), event.defaultPrevented)) event.preventDefault();
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
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, restX: 0, restY: 0 };
  syncSurface();
});

// Each move's own travel, so a zoom during the drag stays. Safari keeps scroll offsets in whole
// pixels: what a move could not apply goes into the next one, so the canvas stays under the cursor.
board.addEventListener("pointermove", (event) => {
  if (drag === null || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (dx === 0 && dy === 0) return;
  const next = panScroll({ left: board.scrollLeft + drag.restX, top: board.scrollTop + drag.restY }, maxScroll(), dx, dy);
  board.scrollLeft = next.left;
  board.scrollTop = next.top;
  drag.restX = next.left - board.scrollLeft;
  drag.restY = next.top - board.scrollTop;
});

// A tool chosen during the drag comes in at its end.
function finishDrag() {
  const ending = drag;
  drag = null;
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
canvas.addEventListener("load", releaseInput);

// ── Toolbar: buttons, ←/→ and the tooltip ─────────────────────────────────────

for (const button of toolButtons) button.addEventListener("click", () => chooseTool(button.dataset.tool));

tools.addEventListener("keydown", (event) => {
  const next = toolbarMove(toolButtons.indexOf(document.activeElement), toolButtons.length, event.key);
  if (next === null) return;
  event.preventDefault();
  toolButtons[next].focus();
});

// One tooltip, the tool's name and key, 4 above the tool (the app's sideOffset), centred on it.
// Text goes in with textContent only.
const TOOLTIP_OFFSET = 4;
let tipFor = null;

function showTip(button) {
  const key = document.createElement("span");
  key.className = "doan-kbd";
  key.setAttribute("data-ui-variant", "on-prominent");
  key.setAttribute("data-ui-size", "sm");
  key.textContent = button.getAttribute("aria-keyshortcuts");
  tip.textContent = button.getAttribute("aria-label");
  tip.append(key);
  const panel = tip.parentElement.getBoundingClientRect();
  const box = button.getBoundingClientRect();
  tip.style.left = box.left + box.width / 2 - panel.left + "px";
  tip.style.top = box.top - TOOLTIP_OFFSET - panel.top + "px";
  if (tipFor !== null && tipFor !== button) tipFor.removeAttribute("aria-describedby");
  button.setAttribute("aria-describedby", "tool-tip");
  tipFor = button;
  tip.hidden = false;
}

function hideTip() {
  if (tipFor !== null) tipFor.removeAttribute("aria-describedby");
  tipFor = null;
  tip.hidden = true;
}

for (const button of toolButtons) {
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") showTip(button);
  });
  button.addEventListener("pointerleave", hideTip);
  button.addEventListener("pointerdown", hideTip);
  // Keyboard focus only: a press focuses the button too (in Chromium), and its tooltip is closed.
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) showTip(button);
  });
  button.addEventListener("blur", hideTip);
}

refresh();
