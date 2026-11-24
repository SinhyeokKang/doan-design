// Register before canvas scripts can claim capture-phase input. Select takes the canvas's input from
// the first inspect-mode on, whether the inspector column shows or not; `styles` says whether it shows,
// and only then are rows and the element tree read. Every inspection names the selection's nearest
// frame, which the page needs for Play prototype and the size bubble.
function canvasInspection(post) {
  let open = false, styles = false, epoch = 0, seq = 0, selectionSeq = 0;
  let selected = null, hovered = null, preview = null, tree = [], menuNodes = [];
  let alt = false, meta = false, pan = false, overlay = false;
  let press = null, range = null, copied = "", dragged = false, cursor = null;
  let lastMarks = "", marksFrame = 0;
  // The shell has one direct frame (this canvas) and adds a second only while Select can claim
  // input. A command names its particular sibling so late delivery cannot claim a newer press.
  function inputWindow(name) {
    if (parent.length !== 2 || parent[0] !== window) return null;
    if (name === undefined) return parent[1];
    if (!name) return null;
    try { return parent.frames[name] === parent[1] ? parent[1] : null; }
    catch (error) {
      if (error.name !== "SecurityError") throw error;
      return null; // Cross-origin named access throws when the named frame no longer exists.
    }
  }
  let pressWindow = null, downId = null, cancelledPress = false;
  let modeWindow = null, readyWindow = null, acknowledged = false, pendingClicks = [];
  function acceptClicks(owner) {
    readyWindow = owner;
    if (owner) {
      for (const click of pendingClicks) if (click.owner === owner) inspect(targetOf(click.target, click.direct));
    }
    pendingClicks = pendingClicks.filter(click => !click.owner.closed && click.owner !== owner);
  }
  const emit = (type, fields) => post({ type, ...fields, epoch, seq: ++seq });
  const targetOf = (element, direct = meta) => {
    if (!(element instanceof Element) || !element.isConnected || element === document.body || element === document.documentElement) return null;
    const frames = inspectCanvas.framesOf(element);
    if (!frames.length && element.querySelector("[data-doan-frame]")) return null;
    return direct ? element : inspectCanvas.frameStep(frames, selected ? inspectCanvas.framesOf(selected) : []) ?? element;
  };
  // While Option is held the hover is the measurement's target, which the page draws only with a
  // selection (the app's CanvasController measured), so it is sent with `alt` instead of being dropped.
  function marks() {
    if (!open) return;
    const next = preview ?? (overlay || press?.state === "drag" ? null : targetOf(hovered));
    const box = (el) => el?.isConnected && !pan ? inspectCanvas.rectOf(el) : null;
    const fields = { selected: box(selected), hover: next === selected ? null : box(next), alt: alt && preview === null };
    const key = JSON.stringify(fields);
    if (key === lastMarks) return;
    lastMarks = key;
    emit("inspect-marks", fields);
  }
  function queueMarks() {
    if (!marksFrame) marksFrame = requestAnimationFrame(() => { marksFrame = 0; marks(); });
  }
  function elementNodes() {
    tree = [];
    if (!selected) return [];
    const frame = selected.closest("[data-doan-frame]");
    const pending = [[frame ?? selected, 0]], elements = [], depths = [];
    while (pending.length) {
      const [el, depth] = pending.pop();
      if (["script", "style", "template", "noscript"].includes(el.localName)) continue;
      const visible = el.getClientRects().length > 0 || el.contains(selected);
      if (!visible && getComputedStyle(el).display !== "contents") continue;
      if (visible) { elements.push(el); depths.push(depth); }
      if (frame) for (let i = el.children.length - 1; i >= 0; i--) pending.push([el.children[i], depth + Number(visible)]);
    }
    const { keep } = inspectCanvas.elementTree(depths, elements.indexOf(selected), 200);
    const counts = new Map();
    for (const attr of ["data-doan-frame", "data-doan-id"]) {
      const values = new Map();
      for (const el of document.querySelectorAll("[" + attr + "]")) {
        const value = el.getAttribute(attr);
        values.set(value, (values.get(value) ?? 0) + 1);
      }
      counts.set(attr, values);
    }
    const unique = (attr, value) => value.length <= MAX_STRING && counts.get(attr).get(value) === 1;
    const describe = (el, depth) => {
      const chain = [];
      for (let node = el; node; node = node.parentElement) {
        let indexOfType = 1;
        for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
          if (sib.localName === node.localName && sib.namespaceURI === node.namespaceURI) indexOfType++;
        }
        chain.push({ tag: node.localName, indexOfType, doanId: node.getAttribute("data-doan-id") ?? undefined, frameId: node.getAttribute("data-doan-frame") ?? undefined });
        if (node === document.body) break;
      }
      const id = el.getAttribute("data-doan-frame");
      const ownFrame = id === null ? undefined : { id, title: el.getAttribute("data-doan-title") ?? undefined };
      const text = Array.from(el.childNodes).filter(node => node.nodeType === 3).map(node => node.data).join("");
      const name = inspectCanvas.nodeLabel({ frame: ownFrame, tag: el.localName, doanId: el.getAttribute("data-doan-id") ?? undefined, text });
      const style = getComputedStyle(el);
      const selector = inspectCanvas.elementSelector(chain, unique);
      return { name: clipText(name, MAX_STRING), depth, selector: selector.length <= 1000 ? selector : "", selected: el === selected,
        kind: inspectCanvas.nodeKind(el.localName, style.display, style.flexDirection, ownFrame !== undefined) };
    };
    // A path deeper than the tree cap can lose even its selected node. Its own one-row menu stays usable.
    if (!keep.some(i => elements[i] === selected)) { tree = [selected]; return [describe(selected, 0)]; }
    tree = keep.map(i => elements[i]);
    return keep.map(i => describe(elements[i], depths[i]));
  }
  // The selection's nearest frame as the app's select target names it: `kind` frame when the frame
  // itself is selected, its id cut at 200 units, and its place among the first 1,000 frames, the list
  // the layout reports.
  function frameOf(element) {
    if (!element) return null;
    const frame = element.closest("[data-doan-frame]");
    if (!frame) return { kind: "element" };
    const target = { kind: frame === element ? "frame" : "element", id: clipText(frame.getAttribute("data-doan-frame") ?? "", MAX_STRING) };
    const index = Array.from(document.querySelectorAll("[data-doan-frame]")).indexOf(frame);
    if (index >= 0 && index < MAX_FRAMES) target.index = index;
    return target;
  }
  function inspect(element) {
    selected = element?.isConnected ? element : null;
    preview = null;
    if (!open) return;
    let nodes = [];
    if (styles) nodes = elementNodes();
    else tree = [];
    menuNodes = nodes;
    const rows = styles && selected ? inspectCanvas.inspectElement(selected) : [];
    emit("inspection", { rows, nodes, target: frameOf(selected) });
    selectionSeq = seq;
    marks();
  }
  function sendText(dragging) {
    emit("inspect-text", { dragging, rects: range && !range.collapsed ? inspectCanvas.textRects(range) : [], text: copied });
  }
  function finishDrag() {
    if (!press) return;
    const ending = press;
    press = null;
    if (document.documentElement.hasPointerCapture(ending.pointerId)) document.documentElement.releasePointerCapture(ending.pointerId);
    if (ending.state !== "drag") return;
    if (cursor) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== cursor);
    cursor = null;
    dragged = true;
    if (range?.collapsed) range = null;
    copied = range ? inspectCanvas.readText(range) : "";
    sendText(false);
    marks();
  }
  function clearText() {
    finishDrag();
    if (!range) return;
    range = null;
    copied = "";
    sendText(false);
  }
  function extend(x, y) {
    if (press?.state !== "drag") return;
    const caret = document.caretPositionFromPoint(x, y);
    if (!caret || !press.node.isConnected) return;
    let node = caret.offsetNode, offset = caret.offset;
    const bounds = document.createRange();
    bounds.selectNodeContents(press.boundary);
    const side = bounds.comparePoint(node, offset);
    if (side < 0) { node = bounds.startContainer; offset = bounds.startOffset; }
    if (side > 0) { node = bounds.endContainer; offset = bounds.endOffset; }
    range = document.createRange();
    range.setStart(press.node, press.offset);
    if (range.comparePoint(node, offset) < 0) { range.setStart(node, offset); range.setEnd(press.node, press.offset); }
    else range.setEnd(node, offset);
    sendText(true);
  }
  // Hand's text drag: the board takes every press, so the page asks whether a Select press at a point
  // (canvas client px) would start a text drag, and then drives it with the page's own px for the 4 px.
  // `pointerId` -1: none of this document's pointer events is its.
  const handStart = (x, y) => inspectCanvas.textAt(x, y, document.elementFromPoint(x, y));
  const finite = (...values) => values.every(value => typeof value === "number" && Number.isFinite(value));
  function listen() {
    const on = (type, handler) => addEventListener(type, event => {
      if (type === "pointerdown" && event.isTrusted) {
        pressWindow = !event.altKey && event.button === 0 && !event.ctrlKey ? inputWindow() : null;
        cancelledPress = false;
        downId = event.pointerId;
      }
      if (open || (pressWindow && (!pressWindow.closed || type === "click"))) handler(event);
    }, { capture: true });
    for (const type of ["pointerdown", "mousedown", "click", "dblclick"]) on(type, event => {
      const owner = inputWindow();
      if (!event.isTrusted) return;
      if (type === "click" && event.detail && pressWindow && (cancelledPress || pressWindow !== owner)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!owner) return;
      if (type === "pointerdown") {
        emit("inspect-press", {});
        if (event.button === 0 && !event.ctrlKey) { clearText(); dragged = false; }
      }
      if (event.altKey || (type !== "pointerdown" && (event.ctrlKey || event.button !== 0))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      meta = event.metaKey;
      alt = false;
      if (type === "pointerdown") {
        if (document.activeElement !== document.body) document.activeElement?.blur?.();
        window.focus();
        if (event.button === 0 && !event.ctrlKey && !meta && !event.shiftKey) {
          const start = inspectCanvas.textStart(event);
          if (start) press = { ...start, state: "press" };
        }
      } else if (type === "click" && !dragged && (!event.detail || pressWindow === owner)) {
        // A close and reopen may both be in flight. Step from the selection for this opening,
        // once the shell has accepted its epoch, using the element hit by the original click.
        if (owner === readyWindow) inspect(targetOf(event.target));
        else pendingClicks.push({ owner, target: event.target, direct: meta });
      }
    });
    on("pointermove", event => {
      if (!event.isTrusted || !inputWindow()) return;
      meta = event.metaKey; alt = event.altKey; hovered = event.target;
      if (press?.pointerId === event.pointerId) {
        if (!(event.buttons & 1)) finishDrag();
        else if (inspectCanvas.textDragState(press.state, press.screen, { x: event.screenX, y: event.screenY }, 4) === "drag") {
          if (press.state === "press") {
            press.state = "drag";
            document.documentElement.setPointerCapture(press.pointerId);
            if (typeof CSSStyleSheet === "function" && CSSStyleSheet.prototype.replaceSync && document.adoptedStyleSheets) {
              cursor = new CSSStyleSheet();
              cursor.replaceSync("*{cursor:text!important}");
              document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursor];
            }
          }
          extend(event.clientX, event.clientY);
        }
      }
      queueMarks();
    });
    on("pointerout", event => { if (!event.relatedTarget) { hovered = null; marks(); } });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) on(type, event => {
      if (downId === event.pointerId) {
        if (type !== "pointerup") cancelledPress = true;
        downId = null;
      }
      if (press?.pointerId === event.pointerId) {
        finishDrag();
        hovered = document.elementFromPoint(event.clientX, event.clientY);
        marks();
      }
    });
    for (const type of ["keydown", "keyup"]) on(type, event => {
      if (event.key === "Meta" || event.key === "Alt") { alt = event.altKey; meta = event.metaKey; marks(); }
      if (type === "keydown" && press?.state === "drag" && ["Space", "KeyV", "KeyH"].includes(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    });
    on("blur", () => {
      const direct = meta, pass = alt, at = epoch;
      finishDrag(); alt = false; meta = false; hovered = null; marks();
      // A press inside a nested document reaches this frame only as a focus change.
      setTimeout(() => {
        const el = document.activeElement;
        if (!open || at !== epoch || pan || !el?.matches("iframe, frame, object, embed")) return;
        clearText(); emit("inspect-press", {});
        if (!pass) { inspect(targetOf(el, direct)); el.blur?.(); }
      }, 0);
    });
    on("copy", event => {
      if (!overlay && copied && event.clipboardData) {
        event.clipboardData.setData("text/plain", copied);
        event.preventDefault(); event.stopImmediatePropagation();
      }
    });
  }
  listen();
  return {
    command(data) {
      if (data.type === "inspect-mode" && Number.isSafeInteger(data.epoch) && data.epoch > epoch) {
        const livePress = !cancelledPress && pressWindow && !pressWindow.closed;
        if (!livePress) clearText();
        open = data.open === true;
        styles = open && data.styles === true;
        modeWindow = open ? inputWindow(data.input) : null;
        acknowledged = false;
        acceptClicks(null);
        overlay = false;
        epoch = data.epoch;
        seq = 0; hovered = null; preview = null; tree = []; alt = false; meta = false; lastMarks = "";
        if (!data.retain) selected = null;
        if (open) {
          inspect(selected);
          if (range) sendText(press?.state === "drag");
        }
        return;
      }
      if (data.epoch !== epoch) return;
      if (!open) {
        if (data.type === "inspect-clear") selected = null;
        return;
      }
      if (data.type === "inspect-input") {
        modeWindow = inputWindow(data.input);
        if (acknowledged) acceptClicks(modeWindow);
      } else if (data.type === "inspect-ready") {
        acknowledged = true;
        if (!pan && modeWindow === inputWindow()) acceptClicks(modeWindow);
      } else if (data.type === "inspect-escape") {
        if (range || press?.state === "drag") clearText();
        else if (selected) inspect(inspectCanvas.escapeTarget(inspectCanvas.framesOf(selected), selected.hasAttribute("data-doan-frame")));
      } else if (data.type === "inspect-clear") inspect(null);
      else if (data.type === "inspect-node" && data.selection === selectionSeq) {
        const el = tree[data.index];
        if (data.selector !== menuNodes[data.index]?.selector) return;
        if (data.pick && el?.isConnected) inspect(el);
        else { preview = el ?? null; marks(); }
      } else if (data.type === "inspect-overlay") { overlay = data.open; preview = null; marks(); }
      else if (data.type === "inspect-modifiers") { meta = data.meta; alt = data.alt; marks(); }
      else if (data.type === "inspect-clear-text") clearText();
      else if (data.type === "inspect-extend") extend(data.x, data.y);
      else if (data.type === "inspect-hand-at" && finite(data.x, data.y) && Number.isSafeInteger(data.probe)) {
        emit("inspect-hand-hit", { probe: data.probe, hit: handStart(data.x, data.y) !== null });
      } else if (data.type === "inspect-hand-press" && finite(data.x, data.y, data.sx, data.sy) && Number.isSafeInteger(data.probe)) {
        const start = handStart(data.x, data.y);
        if (start) {
          clearText();
          dragged = false;
          press = { ...start, pointerId: -1, screen: { x: data.sx, y: data.sy }, state: "press", remote: true };
        }
        emit("inspect-hand-hit", { probe: data.probe, hit: start !== null });
      } else if (data.type === "inspect-hand-move" && press?.remote && finite(data.x, data.y, data.sx, data.sy)) {
        if (inspectCanvas.textDragState(press.state, press.screen, { x: data.sx, y: data.sy }, 4) !== "drag") return;
        if (press.state === "press") { press.state = "drag"; marks(); }
        extend(data.x, data.y);
      } else if (data.type === "inspect-hand-release" && press?.remote) finishDrag();
    },
    pan(on) {
      pan = on;
      marks();
    },
    layout() {
      if (!open) return;
      if (selected && !selected.isConnected) inspect(null);
      else marks();
      if (range && (!range.startContainer.isConnected || !range.endContainer.isConnected || range.collapsed)) clearText();
      else if (range) sendText(press?.state === "drag");
    },
  };
}
