// The shell owns the open state. Each reveal or navigation starts a new epoch so a late frame
// reply cannot paint the previous selection over the current one. Select works whether the column
// shows, is folded or yields to a narrow window; the column only decides whether styles are read.
// `onSelection` hears every change of the selection's frame or marks, for Play prototype, the size
// bubble and the Option measurement.
function mountViewerInspector(canvas, board, popupOpenNow, onSelection) {
  const panel = $("inspector"), show = $("inspector-show"), hide = $("inspector-hide");
  const trigger = $("element-trigger"), wrap = $("element-trigger-wrap"), menu = $("element-menu"), tree = $("element-tree");
  const body = $("inspect-body"), status = $("inspect-status"), rowTip = $("inspect-row-tip"), headTip = $("inspector-tip");
  const shell = panel.parentElement, handle = $("inspector-resize"), cover = $("resize-cover");
  const storageKey = "doan.viewer.inspector.width";
  let preferred, bounds, shown, resize = null;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null && Number(stored) > 0 && Number.isFinite(Number(stored))) preferred = Number(stored);
  } catch { /* A file can have no storage; the in-memory preference still works. */ }

  function paintWidth(width) {
    shown = inspectPanel.panelWidth(width, bounds, inspectPanel.PANEL_MIN);
    shell.style.setProperty("--inspector-width", shown + "px");
    handle.setAttribute("aria-valuenow", String(shown));
  }
  function saveWidth(width) {
    preferred = width;
    paintWidth(width);
    try {
      if (width === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(width));
    } catch { /* Storage can also reject writes after a successful read. */ }
  }
  function finishResize(commit) {
    if (!resize) return;
    const { pointer, start, now } = resize;
    resize = null;
    cover.hidden = true;
    handle.removeAttribute("data-drag");
    if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
    if (commit && now !== start) saveWidth(now);
    else if (bounds) paintWidth(preferred);
  }
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || resize || !bounds) return;
    event.preventDefault();
    // A key pressed inside the sandbox cannot reach our capture-phase Escape listener.
    if (document.activeElement === canvas) handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    resize = { pointer: event.pointerId, x: event.clientX, start: shown, now: shown };
    handle.setAttribute("data-drag", "");
    cover.hidden = false;
  });
  handle.addEventListener("pointermove", event => {
    if (resize?.pointer !== event.pointerId) return;
    paintWidth(resize.start + resize.x - event.clientX);
    resize.now = shown;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, event => {
    if (resize?.pointer === event.pointerId) finishResize(true);
  });
  window.addEventListener("keydown", event => {
    if (!resize || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finishResize(false);
  }, true);
  handle.addEventListener("keydown", event => {
    if (resize || !bounds) return;
    const next = inspectPanel.nudgePanel(shown, event.key, bounds);
    if (next === null) return;
    event.preventDefault();
    if (next !== shown) saveWidth(next);
  });
  handle.addEventListener("dblclick", () => saveWidth(undefined));
  const noRoom = "No room for the inspector. Widen the browser window.";
  let wanted = false, epoch = 0, seq = 0, selection = 0, nodes = [];
  // The selection's nearest frame and the marks the canvas last drew, kept across a mode change that
  // retains the selection so the bubble does not blink while the canvas answers the new epoch.
  let nearest = null, marks = { selected: null, hover: null, alt: false };
  const changed = () => onSelection({ target: nearest, ...marks });
  let text = "", dragging = false, copyAttempt = 0, rowTimer = 0, point = null;
  // Hand's text drag and cursor (shell.js): probes count for both; `handDrag` while the page drives a press, whose
  // dragging range is the person's although the canvas has no focus.
  let handProbe = 0, pressProbe = 0, atProbe = 0, handDrag = false, onPressHit = null, onAtHit = null;
  const framePoint = (x, y) => {
    const box = canvas.getBoundingClientRect();
    return { x: (x - box.left) / scale, y: (y - box.top) / scale };
  };
  const command = (type, fields = {}) => canvas.contentWindow?.postMessage({ type, epoch, ...fields }, "*");
  const element = (tag, className, value) => {
    const el = document.createElement(tag);
    el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  };
  const icon = name => $("inspect-icon-" + name).content.firstElementChild.cloneNode(true);
  const setBox = (el, box) => {
    el.hidden = !box || box.width <= 0 || box.height <= 0;
    if (el.hidden) return;
    el.style.left = box.x + "px"; el.style.top = box.y + "px";
    el.style.width = box.width + "px"; el.style.height = box.height + "px";
  };
  function clearTip() {
    clearTimeout(rowTimer);
    rowTip.hidden = true;
    body.querySelector('[aria-describedby="inspect-row-tip"]')?.removeAttribute("aria-describedby");
  }
  function closeMenu(focus) {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    command("inspect-overlay", { open: popupOpenNow() });
    if (focus) trigger.focus({ preventScroll: true });
  }
  function paintMarks() {
    // While Option is held the hover is the measurement's target: it shows, solid, only with a
    // selection to measure from (the app's drawMarks).
    const measuring = marks.alt && marks.selected !== null && marks.hover !== null;
    setBox($("selected-mark"), marks.selected);
    setBox($("hover-mark"), marks.alt && !measuring ? null : marks.hover);
    $("selected-mark").classList.toggle("measuring", measuring);
    $("hover-mark").classList.toggle("measuring", measuring);
  }
  function reset(retain) {
    closeMenu(false);
    clearTip();
    nodes = []; selection = 0; text = ""; dragging = false; point = null; copyAttempt++;
    status.replaceChildren(); tree.replaceChildren(); body.replaceChildren();
    $("inspect-range").replaceChildren();
    if (!retain) nearest = null;
    marks = { selected: retain ? marks.selected : null, hover: null, alt: false };
    paintMarks();
    changed();
    $("inspect-empty").hidden = false; body.hidden = true;
    $("inspect-title").hidden = false; wrap.hidden = true; wrap.classList.remove("doan-insp-pick");
  }
  // The sandbox can read sibling WindowProxy identities synchronously. This empty context marks
  // which opening owns a native press before inspect-mode arrives, without intercepting hit tests.
  let inputMarker = null, inputId = 0, acknowledged = false;
  function syncInputWindow(panning) {
    if (panning) {
      inputMarker?.remove();
      inputMarker = null;
    } else if (!inputMarker) {
      inputMarker = document.createElement("iframe");
      inputMarker.name = "doan-inspector-input-" + ++inputId;
      inputMarker.hidden = true;
      inputMarker.setAttribute("sandbox", "");
      panel.append(inputMarker);
    }
  }
  function mode(focus, reason) {
    bounds = inspectPanel.inspectorBounds(shell.clientWidth);
    if (!bounds || !wanted) finishResize(false);
    if (bounds) {
      handle.setAttribute("aria-valuemin", String(bounds.min));
      handle.setAttribute("aria-valuemax", String(bounds.max));
      paintWidth(resize ? resize.now : preferred);
    }
    const open = wanted && bounds !== null;
    show.setAttribute("aria-disabled", String(!bounds));
    if (!bounds) show.setAttribute("aria-description", noRoom);
    else show.removeAttribute("aria-description");
    headTip.textContent = !bounds ? noRoom : "Show inspector";
    if (!reason && open === !panel.hidden) return;
    // A fold, an unfold or a Yield keeps the selection; a board clear drops it, and so does a canvas
    // document that loaded again, whose elements are new.
    const retain = reason !== "clear" && reason !== "reload";
    const focusMoved = panel.contains(document.activeElement) || document.activeElement === handle || document.activeElement === show;
    clearShowTip(); clearHideTip();
    reset(retain);
    syncInputWindow(true);
    handle.hidden = !open;
    panel.hidden = !open;
    syncInputWindow(panTold);
    panel.parentElement.toggleAttribute("data-inspector", open);
    $("inspector-show-wrap").hidden = open; $("inspector-sep").hidden = open;
    show.setAttribute("aria-expanded", String(open));
    epoch++; seq = 0; acknowledged = false;
    command("inspect-mode", { open: true, styles: open, retain, input: inputMarker?.name ?? null });
    if (focus || focusMoved) (open ? hide : show).focus({ preventScroll: true });
  }
  show.addEventListener("mousedown", event => event.preventDefault());
  show.addEventListener("click", () => { if (bounds) { wanted = true; mode(true); } });
  hide.addEventListener("click", () => { wanted = false; mode(true); });
  new ResizeObserver(() => mode(false)).observe(shell);
  canvas.addEventListener("load", () => mode(false, "reload"));
  function bindHeadTooltip(button, tip) {
    let timer = 0;
    function display() {
      tip.hidden = false;
      button.setAttribute("aria-describedby", tip.id);
    }
    function dismiss() {
      clearTimeout(timer);
      tip.hidden = true;
      button.removeAttribute("aria-describedby");
    }
    button.addEventListener("pointerenter", () => { timer = setTimeout(display, TIP_DELAY_MS); });
    button.addEventListener("focus", () => { if (button.matches(":focus-visible")) display(); });
    for (const type of ["pointerleave", "blur", "pointerdown"]) button.addEventListener(type, dismiss);
    return dismiss;
  }
  const clearShowTip = bindHeadTooltip(show, headTip);
  const clearHideTip = bindHeadTooltip(hide, $("inspector-hide-tip"));
  // Menu handlers can stop propagation. Dismiss the hint without consuming their Escape or the selection step.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) clearHideTip();
  }, true);
  mode(false, "start");

  async function copy(value) {
    const attempt = ++copyAttempt;
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; }
    catch {
      // file: clipboard permission varies by engine. Keep the focused row and the panel's scroll.
      if (attempt !== copyAttempt) return;
      const field = element("textarea", "sr-only");
      field.value = value;
      const previous = document.activeElement;
      panel.append(field);
      try { field.focus({ preventScroll: true }); field.select(); ok = document.execCommand("copy"); }
      catch { ok = false; }
      finally { field.remove(); previous?.focus({ preventScroll: true }); }
    }
    if (attempt !== copyAttempt) return;
    const note = element("div", ok ? "doan-notice" : "doan-notice error");
    const glyph = icon(ok ? "success" : "failure");
    glyph.classList.add("doan-alert-icon");
    note.append(glyph, element("span", "", ok ? "Copied " + value : "This browser blocked copying. Open the file in another browser."));
    status.replaceChildren(note);
  }
  function rowButton(row, first) {
    const button = element("button", "doan-insp-row");
    button.type = "button"; button.tabIndex = first ? 0 : -1;
    button.setAttribute("aria-label", row.spoken);
    button.setAttribute("aria-description", "Press to copy");
    const value = element("span", "doan-insp-value");
    const line = element("span", row.token ? "" : "doan-insp-text", row.token ?? row.text);
    const chip = row.token ? element("code", "doan-code") : value;
    if (row.swatch) {
      const swatch = element("i", "doan-insp-swatch" + (row.swatch === "transparent" ? " transparent" : ""));
      swatch.style.backgroundColor = row.swatch;
      chip.append(swatch);
    }
    chip.append(line);
    if (row.token) value.append(chip);
    button.append(element("span", "doan-insp-label", row.label), value);
    button.addEventListener("click", () => { void copy(row.copy); });
    button.addEventListener("keydown", event => {
      if (event.key.toLowerCase() === "c" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        void copy(row.copy);
      }
    });
    const tip = () => {
      clearTip();
      const lines = inspectPanel.rowTooltip(row, line.scrollWidth > line.clientWidth);
      if (!lines.length) return;
      rowTip.replaceChildren(...lines.map(content => element("span", "", content)));
      const box = button.getBoundingClientRect();
      rowTip.hidden = false;
      rowTip.style.left = Math.max(8, Math.min(box.left, innerWidth - rowTip.offsetWidth - 8)) + "px";
      rowTip.style.top = (box.bottom + 4 + rowTip.offsetHeight <= innerHeight ? box.bottom + 4 : box.top - 4 - rowTip.offsetHeight) + "px";
      button.setAttribute("aria-describedby", rowTip.id);
    };
    button.addEventListener("focus", () => {
      body.querySelector('[tabindex="0"]')?.setAttribute("tabindex", "-1");
      button.tabIndex = 0;
      if (button.matches(":focus-visible")) tip();
    });
    button.addEventListener("pointerenter", () => { clearTip(); rowTimer = setTimeout(tip, TIP_DELAY_MS); });
    for (const type of ["blur", "pointerleave", "pointerdown"]) button.addEventListener(type, clearTip);
    return button;
  }
  body.addEventListener("scroll", clearTip);
  body.addEventListener("keydown", event => {
    const rows = Array.from(body.querySelectorAll("button"));
    const index = rows.indexOf(event.target);
    if (index < 0) return;
    const to = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 }[event.key];
    if (typeof to === "number") { event.preventDefault(); rows[clamp(to, 0, rows.length - 1)].focus(); }
  });
  function render(message) {
    const hadFocus = document.activeElement === trigger || body.contains(document.activeElement) || menu.contains(document.activeElement);
    closeMenu(false); clearTip();
    selection = message.seq; nodes = message.nodes; copyAttempt++;
    body.replaceChildren(); status.replaceChildren();
    const own = nodes.find(node => node.selected);
    wrap.hidden = !own; wrap.classList.toggle("doan-insp-pick", !!own);
    $("inspect-title").hidden = !!own; $("inspect-empty").hidden = !!own; body.hidden = !own;
    if (own) {
      trigger.firstElementChild.textContent = own.name;
      trigger.setAttribute("aria-label", own.name + (own.kind === "frame" ? ", frame." : ", element.") + " Elements in this frame");
      const view = inspectPanel.rowDisplay(message.rows);
      if (view.empty) body.append(element("p", "doan-insp-none", view.empty));
      else {
        const groups = element("div", "doan-insp-groups");
        groups.setAttribute("role", "group"); groups.setAttribute("aria-label", "Styles");
        for (const group of view.groups) {
          const section = element("section", "doan-insp-group");
          section.setAttribute("aria-label", group.title);
          section.append(element("h3", "doan-insp-group-title", group.title));
          for (const row of group.rows) section.append(rowButton(row, groups.childElementCount === 0 && section.childElementCount === 1));
          groups.append(section);
        }
        body.append(groups);
      }
    }
    if (hadFocus) (own ? trigger : board).focus({ preventScroll: true });
  }
  function focusNode(index) {
    const row = tree.children[index];
    const left = menu.scrollLeft;
    row.focus();
    menu.scrollLeft = inspectPanel.treeScrollLeft(nodes[index].depth, { width: menu.clientWidth, nameWidth: row.lastElementChild.offsetWidth }, left);
  }
  function pick(index) {
    closeMenu(true);
    if (!nodes[index].selected) command("inspect-node", { selection, index, selector: nodes[index].selector, pick: true });
  }
  trigger.addEventListener("click", () => {
    if (!menu.hidden) { closeMenu(true); return; }
    tree.replaceChildren();
    for (const [index, node] of nodes.entries()) {
      const row = element("div", "doan-menu-item");
      row.setAttribute("role", "treeitem"); row.tabIndex = -1;
      row.setAttribute("aria-selected", String(node.selected)); row.setAttribute("aria-level", node.depth + 1);
      row.style.setProperty("--tree-depth", node.depth);
      for (let level = 0; level < node.depth; level++) {
        const guide = element("i", "guide"); guide.style.setProperty("--tree-level", level); row.append(guide);
      }
      row.append(icon(node.kind), element("span", "name", node.name));
      row.addEventListener("focus", () => command("inspect-node", { selection, index, selector: node.selector, pick: false }));
      row.addEventListener("pointermove", () => { if (row !== document.activeElement) row.focus({ preventScroll: true }); });
      row.addEventListener("click", () => pick(index));
      tree.append(row);
    }
    menu.hidden = false; trigger.setAttribute("aria-expanded", "true");
    command("inspect-overlay", { open: true });
    focusNode(nodes.findIndex(node => node.selected));
  });
  menu.addEventListener("keydown", event => {
    const index = Array.from(tree.children).indexOf(document.activeElement);
    if (event.key === "Escape") closeMenu(true);
    else if (event.key === "Enter" || event.key === " ") pick(index);
    else if (event.key === "Home") focusNode(0);
    else if (event.key === "End") focusNode(nodes.length - 1);
    else if (event.key === "ArrowDown") focusNode(Math.min(nodes.length - 1, index + 1));
    else if (event.key === "ArrowUp") focusNode(Math.max(0, index - 1));
    else if (event.key !== "Tab") return;
    event.preventDefault(); event.stopPropagation();
  });
  const endDrag = () => { dragging = false; point = null; };
  window.addEventListener("pointerup", endDrag, true);
  window.addEventListener("blur", endDrag);
  document.addEventListener("focusin", event => { if (event.target !== canvas) endDrag(); });
  document.addEventListener("pointerdown", event => {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) closeMenu(false);
    if (event.button === 0 && !event.ctrlKey && board.contains(event.target) && !panTold) command("inspect-clear-text");
  });
  board.addEventListener("click", event => {
    if (panTold || event.button !== 0 || event.ctrlKey || event.altKey) return;
    if (event.target === board || event.target === $("spacer")) {
      board.focus({ preventScroll: true });
      // A blank-board click also clears canvas input still waiting for the previous epoch.
      mode(false, "clear");
    }
  });
  document.addEventListener("selectionchange", () => {
    if (text && !document.getSelection()?.isCollapsed) command("inspect-clear-text");
  });
  document.addEventListener("copy", event => {
    if (!text || popupOpenNow() || !menu.hidden || editableTarget(event.target) || !event.clipboardData || !document.getSelection()?.isCollapsed) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  });
  for (const type of ["keydown", "keyup"]) document.addEventListener(type, event => {
    if (["Meta", "Alt"].includes(event.key)) command("inspect-modifiers", { alt: event.altKey, meta: event.metaKey });
  });
  // A wheel during a drag moves the stage under the pointer. The wheel gives the original
  // position in frame coordinates; recompute it after the shell has applied its pan or zoom.
  function wheel(message) {
    if (!dragging) return;
    const box = canvas.getBoundingClientRect();
    point = { x: box.left + message.x * scale, y: box.top + message.y * scale };
    requestAnimationFrame(() => {
      if (!point || !dragging) return;
      const moved = canvas.getBoundingClientRect();
      command("inspect-extend", { x: (point.x - moved.left) / scale, y: (point.y - moved.top) / scale });
    });
  }
  return {
    accept(event) {
      const message = inspectorMessages.parseMessage(event, canvas.contentWindow, epoch, seq, document.activeElement === canvas || handDrag);
      if (!message) return;
      seq = message.seq;
      if (message.type === "inspection") {
        if (!acknowledged) { acknowledged = true; command("inspect-ready"); }
        render(message);
        nearest = message.target;
        changed();
      } else if (message.type === "inspect-marks") {
        marks = { selected: message.selected, hover: message.hover, alt: message.alt };
        paintMarks();
        changed();
      } else if (message.type === "inspect-hand-hit") {
        const done = message.probe === pressProbe ? onPressHit : message.probe === atProbe ? onAtHit : null;
        if (message.probe === pressProbe) onPressHit = null;
        done?.(message.hit);
      } else if (message.type === "inspect-press") {
        closeMenu(false);
        if (drawerPopup.isOpen()) drawerPopup.hide("none");
        if (zoomPopup.isOpen()) zoomPopup.hide("none");
        if (playPopup.isOpen()) playPopup.close(false);
      } else {
        if (dragging && !message.dragging && document.activeElement === canvas) board.focus({ preventScroll: true });
        dragging = message.dragging; text = message.text;
        if (dragging && !document.getSelection()?.isCollapsed) document.getSelection()?.removeAllRanges();
        $("inspect-range").replaceChildren(...message.rects.map(box => { const el = element("i", "text-rect"); setBox(el, box); return el; }));
      }
    },
    escape() {
      if (!menu.hidden) { closeMenu(true); return true; }
      if (!nearest && !text && !dragging) return false;
      command("inspect-escape"); return true;
    },
    blocks(target) { return dragging || resize !== null || target === handle || panel.contains(target) || !menu.hidden; },
    menuOpen() { return !menu.hidden; },
    pan(on) {
      syncInputWindow(on);
      if (inputMarker) command("inspect-input", { input: inputMarker.name });
    },
    // Switching to Hand: the text range stays, since Hand drags and copies canvas text too.
    clearSelection() { command("inspect-clear"); },
    clearText() { command("inspect-clear-text"); },
    handPress(x, y, done) {
      pressProbe = ++handProbe;
      handDrag = true;
      onPressHit = done;
      command("inspect-hand-press", { ...framePoint(x, y), sx: x, sy: y, probe: pressProbe });
    },
    handMove(x, y) { command("inspect-hand-move", { ...framePoint(x, y), sx: x, sy: y }); },
    handRelease() {
      handDrag = false;
      onPressHit = null;
      command("inspect-hand-release");
    },
    handAt(x, y, done) {
      atProbe = ++handProbe;
      onAtHit = done;
      command("inspect-hand-at", { ...framePoint(x, y), probe: atProbe });
    },
    syncOverlay() { command("inspect-overlay", { open: !menu.hidden || popupOpenNow() }); },
    // The size bubble's Show inspector does what the header's does.
    reveal() { if (bounds) { wanted = true; mode(true); } },
    // What the size bubble's Show inspector follows (bubbleItems.ts): the saved preference and the room.
    panelState() { return { inspectorOpen: wanted, inspectorFits: bounds !== null }; },
    noRoom,
    wheel,
  };
}
