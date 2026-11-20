// The shell owns the open state. Each reveal or navigation starts a new epoch so a late frame
// reply cannot paint the previous selection over the current one.
function mountViewerInspector(canvas, board, popupOpenNow) {
  const panel = $("inspector"), show = $("inspector-show"), hide = $("inspector-hide");
  const trigger = $("element-trigger"), wrap = $("element-trigger-wrap"), menu = $("element-menu"), tree = $("element-tree");
  const body = $("inspect-body"), status = $("inspect-status"), rowTip = $("inspect-row-tip"), headTip = $("inspector-tip");
  const hasRoom = matchMedia("(min-width: 657px)");
  const noRoom = "No room for the inspector. Widen the browser window.";
  let wanted = false, epoch = 0, seq = 0, selection = 0, nodes = [];
  let text = "", dragging = false, copyAttempt = 0, rowTimer = 0, point = null;
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
  function reset() {
    closeMenu(false);
    clearTip();
    nodes = []; selection = 0; text = ""; dragging = false; point = null; copyAttempt++;
    status.replaceChildren(); tree.replaceChildren(); body.replaceChildren();
    $("inspect-range").replaceChildren(); $("hover-mark").hidden = true; $("selected-mark").hidden = true;
    $("inspect-empty").hidden = false; body.hidden = true;
    $("inspect-title").hidden = false; wrap.hidden = true; wrap.classList.remove("doan-insp-pick");
  }
  function mode(focus, reload = false) {
    const open = wanted && hasRoom.matches;
    show.setAttribute("aria-disabled", String(!hasRoom.matches));
    if (!hasRoom.matches) show.setAttribute("aria-description", noRoom);
    else show.removeAttribute("aria-description");
    headTip.textContent = !hasRoom.matches ? noRoom : "Show inspector";
    if (!reload && open === !panel.hidden) return;
    const focusMoved = panel.contains(document.activeElement) || document.activeElement === show;
    clearShowTip(); clearHideTip();
    reset();
    panel.hidden = !open;
    panel.parentElement.toggleAttribute("data-inspector", open);
    $("inspector-show-wrap").hidden = open; $("inspector-sep").hidden = open;
    show.setAttribute("aria-expanded", String(open));
    epoch++; seq = 0;
    command("inspect-mode", { open, retain: wanted });
    if (focus || focusMoved) (open ? hide : show).focus({ preventScroll: true });
  }
  show.addEventListener("mousedown", event => event.preventDefault());
  show.addEventListener("click", () => { if (hasRoom.matches) { wanted = true; mode(true); } });
  hide.addEventListener("click", () => { wanted = false; mode(true); });
  hasRoom.addEventListener("change", () => mode(false));
  canvas.addEventListener("load", () => { if (wanted) mode(false, true); });
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
  mode(false);

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
    if (event.button === 0 && !event.ctrlKey && !panel.hidden && board.contains(event.target) && !panTold) command("inspect-clear-text");
  });
  board.addEventListener("click", event => {
    if (panel.hidden || panTold || event.button !== 0 || event.ctrlKey || event.altKey) return;
    if (event.target === board || event.target === $("spacer")) {
      board.focus({ preventScroll: true });
      command("inspect-clear");
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
    if (!panel.hidden && ["Meta", "Alt"].includes(event.key)) command("inspect-modifiers", { alt: event.altKey, meta: event.metaKey });
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
      if (panel.hidden) return;
      const message = inspectorMessages.parseMessage(event, canvas.contentWindow, epoch, seq, document.activeElement === canvas);
      if (!message) return;
      seq = message.seq;
      if (message.type === "inspection") render(message);
      else if (message.type === "inspect-marks") {
        setBox($("selected-mark"), message.selected); setBox($("hover-mark"), message.hover);
      } else if (message.type === "inspect-press") {
        closeMenu(false);
        if (drawerPopup.isOpen()) drawerPopup.hide("none");
        if (zoomPopup.isOpen()) zoomPopup.hide("none");
      } else {
        if (dragging && !message.dragging && document.activeElement === canvas) board.focus({ preventScroll: true });
        dragging = message.dragging; text = message.text;
        if (dragging && !document.getSelection()?.isCollapsed) document.getSelection()?.removeAllRanges();
        $("inspect-range").replaceChildren(...message.rects.map(box => { const el = element("i", "text-rect"); setBox(el, box); return el; }));
      }
    },
    escape() {
      if (!menu.hidden) { closeMenu(true); return true; }
      if (panel.hidden || (!nodes.length && !text && !dragging)) return false;
      command("inspect-escape"); return true;
    },
    blocks(target) { return dragging || panel.contains(target) || !menu.hidden; },
    menuOpen() { return !menu.hidden; },
    clearSelection() { if (wanted) command("inspect-clear"); },
    syncOverlay() { if (!panel.hidden) command("inspect-overlay", { open: !menu.hidden || popupOpenNow() }); },
    wheel,
  };
}
