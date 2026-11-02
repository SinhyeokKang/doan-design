// The viewer page's behaviour. `assemble` puts lib.js before this file in one inline <script>
// wrapped in a function. Anything that can be decided without the DOM lives in lib.js (and is
// tested there); this file only reads and writes the page.
//
// What it takes from the app's canvas view (design 'viewer shell'): the iframe is `doan:width`
// wide and as tall as the canvas reports (lib.js height rules); the window only changes the
// zoom; zoom and the frame jump use the app's constants and Fit rules. What it leaves out: tools,
// selection, comments, conversation, Reload, and any key forwarding from the canvas.

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

$("name").title = meta.name;
canvas.title = meta.name;
drawerList.setAttribute("aria-label", "Frames in " + meta.name);

let viewer = initialViewer();
let scale = 1;
let remeasureTimer = 0;
let current = null;

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
    const next = popupKey(popup, event.key, items().length);
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

// ⇧1 Fit and ⇧0 100% while this page has focus; the canvas keeps its own keys.
document.addEventListener("keydown", (event) => {
  const command = shortcutCommand(event);
  if (command === null || viewer.phase !== "ready") return;
  event.preventDefault();
  commands[command]();
});

refresh();
