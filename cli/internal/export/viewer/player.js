// The browser player, and the two parts the board shares with it (its toast and the frame drawer's
// rows). `assemble` puts this file after lib.js and the generated viewerApp.js, before shell.js, in
// the page's one function: in a player window startPlayer() plays and shell.js never runs.
//
// A player window is this same file, opened again by the board's Play with `#doan-play=<id>` in its
// address (lib.js PLAY_HASH). A script before the board's iframe in shell.html takes the iframe out
// as the parser inserts it, before its canvas can load, and keeps its srcdoc for the runs here. So
// the window has every frame of the file by itself: it plays on after the board closes, and a reload
// plays the frame its address names.
//
// It plays one frame at a time as the app's prototype window does (PrototypeWindow.tsx), each run in
// a new iframe sandboxed with allow-scripts allow-forms and no same-origin access: the board's
// file URL is this window's too, and the canvas must not reach it. The run's document is the canvas with
// isolate.js first (the srcdoc fixes it carries, and the link a click follows) and the app's own run
// script after it (prototypeScript.ts, generated): the frame it finds, its mark, the frames it lists
// for the drawer and the links they group by, judged as the app judges them. Only the current run's
// iframe counts; a replaced one is another window, so nothing it still posts is read.
//
// What the app's main process decides in the app, this page decides with the app's own functions
// (viewerApp.js): the history (each move is also a browser history entry, so the header's Back, the
// browser's Back and ⌘[ agree), the viewport box for Fit and Responsive, the drawer's groups, a
// followed link's move, Export's availability and the window title. Strings from the canvas (ids,
// titles, link values) are written with textContent and attribute APIs only.

// ── Shared with the board ─────────────────────────────────────────────────────

// The player's own copy. The recipient has no Doan and no agent, so where the app names them this
// names the shared file or its sender.
const PLAYER_COPY = {
  blocked: "Your browser blocked the prototype window. Allow pop-ups, then press Play again.",
  elsewhere: "The prototype is already playing in another window.",
  failed: "Couldn’t start this prototype",
  timeout: "The frame didn’t finish loading within 10 seconds. Retry, or ask the sender for an updated file.",
  missing: "This frame isn’t in the shared file. Retry, or ask the sender for an updated file.",
  empty: "No frames in this canvas are marked for prototyping.",
};

// A link to a frame the run cannot play. A value over 200 UTF-16 units comes as null and is not
// quoted (the app's linkToast, with the sender in place of the agent).
function linkToastText(value) {
  return value === null
    ? "Can’t go to this link’s frame. Ask the sender to fix this link and send an updated file."
    : "Can’t go to “" + value + "”. Ask the sender to fix this link and send an updated file.";
}


// The window's toast: one at a time, at its bottom right, with the app's timer (toastState.ts,
// generated), held while the pointer is over it or the page is hidden. show() returns its id, which
// dismiss() takes; another toast replaces it.
function createToast() {
  let state = viewerApp.initialToastState;
  let node = null;
  let count = 0;
  let last = performance.now();
  const draw = () => {
    if (state.toast === null) {
      node?.remove();
      node = null;
      return;
    }
    if (node === null) {
      node = document.createElement("div");
      node.className = "toast doan-floating doan-toast";
      node.setAttribute("role", "status");
      const message = document.createElement("span");
      message.className = "msg";
      node.append(message);
      node.addEventListener("mouseenter", () => dispatch({ type: "hover", on: true }));
      node.addEventListener("mouseleave", () => {
        last = performance.now();
        dispatch({ type: "hover", on: false });
      });
      document.body.append(node);
    }
    node.firstElementChild.textContent = state.toast.message;
  };
  // There is no exit motion: a toast that went is gone at once.
  const dispatch = (event) => {
    state = viewerApp.toastState(state, event);
    if (state.toast === null && state.leaving !== null) state = viewerApp.toastState(state, { type: "left" });
    draw();
  };
  setInterval(() => {
    const now = performance.now();
    const elapsedMs = now - last;
    last = now;
    if (state.toast !== null) dispatch({ type: "tick", elapsedMs });
  }, 100);
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    dispatch({ type: "hidden", on: document.hidden });
  });
  return {
    show(message) {
      const id = String(++count);
      last = performance.now();
      dispatch({ type: "show", toast: { id, message } });
      return id;
    },
    dismiss(id) {
      dispatch({ type: "dismiss", id });
    },
    current: () => state.toast?.id ?? null,
  };
}

// A frame drawer's rows in the app's link groups (frameDrawerList.ts groupDrawer), the current row
// marked with the app's Eye under `word` (Playing). The Eye is cloned from a <template>: building it
// here would need the SVG namespace URL, and the page carries none. Returns the rows by key.
function drawerRows(list, groups, eye, word, on) {
  list.textContent = "";
  const nodes = new Map();
  groups.forEach((group, index) => {
    if (index > 0) {
      const separator = document.createElement("div");
      separator.className = "doan-menu-sep";
      separator.setAttribute("aria-hidden", "true");
      list.append(separator);
    }
    const box = document.createElement("div");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", group.label);
    for (const row of group.rows) {
      const node = document.createElement("div");
      node.className = "doan-menu-item doan-frame-row";
      node.setAttribute("role", "option");
      node.tabIndex = -1;
      if (row.current) node.setAttribute("aria-current", "location");
      const number = document.createElement("span");
      number.className = "doan-frame-num";
      number.textContent = String(row.number);
      const name = document.createElement("span");
      name.className = "doan-frame-name";
      name.title = row.name;
      name.textContent = row.name;
      node.append(number, name);
      if (row.current) {
        const mark = document.createElement("span");
        mark.className = "doan-frame-current";
        mark.title = word;
        const text = document.createElement("span");
        text.className = "sr-only";
        text.textContent = word;
        mark.append(eye.content.firstElementChild.cloneNode(true), text);
        node.append(mark);
      }
      node.addEventListener("focus", () => on.focus(row));
      node.addEventListener("pointermove", () => {
        if (document.activeElement !== node) node.focus({ preventScroll: true });
      });
      node.addEventListener("click", () => on.pick(row));
      nodes.set(row.key, node);
      box.append(node);
    }
    list.append(box);
  });
  return nodes;
}

// ── The player ────────────────────────────────────────────────────────────────

// The app's reading line waits so a quick load does not flash it (PrototypeWindow.tsx READING_DELAY_MS).
const READING_DELAY_MS = 300;
// The run script reports the frame it was given against the document it runs in.
const RUN_URL = "about:srcdoc";

// TODO(export prototype): download the playing frame's prototype file, joined from META's
// "prototype" data (assemble.go frameExports). Until it exists a press does nothing.
function exportPrototype(frameId) {
  void frameId;
}

// Whether this page is a player window; if it is, it plays. The guard in shell.html decided before
// the board's iframe was parsed and left its srcdoc here.
function startPlayer() {
  const source = window.doanPlayCanvas;
  if (typeof source !== "string") return false;
  window.doanPlayCanvas = undefined;

  const $ = (id) => document.getElementById(id);
  const meta = JSON.parse($("doan-meta").textContent);
  const proto = meta.prototype;
  const eye = $("eye-icon");
  document.querySelector(".doan-canvas-panel")?.remove();
  document.body.prepend($("player").content.cloneNode(true));
  const pw = $("pw");
  const back = $("pw-back");
  const forward = $("pw-forward");
  const reload = $("pw-reload");
  const nameButton = $("pw-name");
  const nameText = $("pw-name-text");
  const drawer = $("pw-drawer");
  const list = $("pw-list");
  const empty = $("pw-empty");
  const modeButtons = Array.from($("pw-modes").querySelectorAll("[data-mode]"));
  const exportButton = $("pw-export");
  const exportReason = $("pw-export-reason");
  const content = $("pw-content");
  const stage = $("pw-stage");
  const reading = $("pw-reading");
  const scene = $("pw-scene");
  const heading = $("pw-scene-heading");
  const sceneLine = $("pw-scene-line");
  const retry = $("pw-retry");
  const closeButton = $("pw-close");
  const tip = $("pw-tip");
  const live = $("pw-live");
  $("pw-reading-text").textContent = viewerApp.LOADING_LABEL;
  retry.textContent = viewerApp.RETRY;
  closeButton.textContent = viewerApp.CLOSE;
  heading.textContent = PLAYER_COPY.failed;
  empty.textContent = PLAYER_COPY.empty;
  const toast = createToast();

  // Each frame the file lets the CLI export, by id: its name and its mark, until a run lists the
  // frames its document has (a frame a script made is only in that list).
  const fileFrames = new Map();
  for (const group of proto.groups) for (const frame of JSON.parse(group)) fileFrames.set(frame.id, { name: frame.title, mark: null });
  for (const frame of proto.frames) {
    const known = fileFrames.get(frame.id);
    if (known !== undefined) known.mark = frame.mark;
  }
  // The latest run's lists, which the drawer, the link moves and the names read.
  let listed = { frames: [], gotos: [] };
  const listedFrame = (id) => listed.frames.find((frame) => frame.id === id);
  const nameOf = (id) => {
    const frame = listedFrame(id);
    if (frame !== undefined) return frame.title ?? frame.id;
    return fileFrames.get(id)?.name ?? id;
  };
  const markOf = (id) => viewerApp.parsePrototypeMark(listedFrame(id)?.size ?? fileFrames.get(id)?.mark ?? null);

  // The history and the mode: the entry's own when the window is reloaded, else one entry at Fit until
  // the board says the mode its last player window had. Every entry's state is kept current, so a
  // reload on any of them finds the whole history.
  const first = playHash(location.hash) ?? "";
  const restored = restorePlayer(isRecord(history.state) ? history.state.doanPlayer : null, first);
  let trail = restored.history;
  let mode = restored.mode;
  let modeSettled = restored.restored;
  const save = () => history.replaceState({ doanPlayer: { entries: trail.entries, index: trail.index, mode } }, "");
  const same = (a, b) => a === b;
  // Every entry can be gone back to: the browser's Back cannot skip one, and the header's must agree.
  const usable = () => true;

  const tellBoard = (text) => {
    const board = window.opener;
    if (board !== null && !board.closed) board.postMessage(text, "*");
  };

  let gen = 0;
  // `run` is the newest run, `shown` the one on screen; they differ while a run loads. A run:
  // { gen, id, box, iframe, phase: "loading" | "ready" | "failed", lost, mark, timer, reading,
  //   readingShown, wantFocus, announce }.
  let run = null;
  let shown = null;

  // The run's box in the content panel from the panel, the run's mark and the mode only (fit.ts
  // prototypeViewportBox): Fit keeps the viewport at the mark and scales it down, Responsive and a
  // mark not known yet fill the panel. A mode change restyles the same iframe, never loads it again.
  const place = (target) => {
    const box = viewerApp.prototypeViewportBox({ width: stage.clientWidth, height: stage.clientHeight }, target.mark ?? { width: 0, height: 0 }, mode);
    target.box.style.left = box.x + "px";
    target.box.style.top = box.y + "px";
    target.box.style.width = box.visibleWidth + "px";
    target.box.style.height = box.visibleHeight + "px";
    target.iframe.style.width = box.width + "px";
    target.iframe.style.height = box.height + "px";
    target.iframe.style.transform = "scale(" + box.scale + ")";
  };
  const placeAll = () => {
    for (const target of new Set([shown, run])) if (target !== null) place(target);
  };

  // The app's phase for a run, which Export's availability is judged by (view.ts).
  const appPhase = (target) => {
    if (target.phase !== "failed") return target.phase;
    if (target.lost === "timeout") return "init-failed";
    return target.lost === "unmarked" || target.lost === "invalid" ? "prototype-unavailable" : "frame-unavailable";
  };

  function render() {
    const current = run;
    for (const [button, direction] of [[back, "back"], [forward, "forward"]]) {
      if (viewerApp.canStep(trail, direction, usable)) button.removeAttribute("aria-disabled");
      else button.setAttribute("aria-disabled", "true");
    }
    const title = nameOf(current.id);
    nameText.textContent = title;
    document.title = viewerApp.windowTitle({ title });
    current.iframe.title = title;
    for (const button of modeButtons) {
      const pressed = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(pressed));
      button.tabIndex = pressed ? 0 : -1;
    }
    content.dataset.mode = mode;
    const exportState = viewerApp.exportAvailability({ phase: appPhase(current) }, false);
    if (exportState.available) {
      exportButton.removeAttribute("aria-disabled");
      exportButton.removeAttribute("aria-describedby");
      exportReason.textContent = "";
    } else {
      exportButton.setAttribute("aria-disabled", "true");
      exportButton.setAttribute("aria-describedby", "pw-export-reason");
      exportReason.textContent = exportState.reason ?? "";
    }
    content.inert = current.phase !== "ready";
    reading.hidden = !(current.phase === "loading" && current.readingShown);
    scene.hidden = current.phase !== "failed";
    if (current.phase === "failed") sceneLine.textContent = current.lost === "timeout" ? PLAYER_COPY.timeout : PLAYER_COPY.missing;
    // The app's live region (view.ts liveText): the reading line once it shows, a failure's heading and
    // line, and only the name of a frame a link moved to.
    live.textContent = current.phase === "loading" ? (current.readingShown ? viewerApp.LOADING_LABEL : "")
      : current.phase === "ready" ? (current.announce ? title : "")
      : PLAYER_COPY.failed + ". " + sceneLine.textContent;
    frameList.refresh();
    if (tipFor !== null) showTip(tipFor);
  }

  // A new run of `id` in a new iframe, from the start. While it loads, the run on screen stays there,
  // inert; focus that was in it goes into the new one once that is ready.
  function start(id) {
    const active = document.activeElement;
    const wantFocus = run !== null && (run.wantFocus || active === run.iframe || active === shown?.iframe);
    if (run !== null) {
      clearTimeout(run.timer);
      clearTimeout(run.reading);
      if (run !== shown) run.box.remove();
    }
    gen += 1;
    const box = document.createElement("div");
    box.className = "pw-box";
    box.style.visibility = "hidden";
    const iframe = document.createElement("iframe");
    iframe.className = "pw-frame";
    // The sandbox before the name and the document, and all three before the iframe is in the page:
    // the flags hold from the first document on, and isolate.js reads its frame from the name.
    iframe.setAttribute("sandbox", "allow-scripts allow-forms");
    iframe.name = id;
    iframe.srcdoc = playSrcdoc(source, proto.measure, proto.isolate, inlineScript(viewerApp.prototypeScriptSource(id, gen, RUN_URL)));
    box.append(iframe);
    const current = { gen, id, box, iframe, phase: "loading", lost: null, mark: markOf(id), timer: 0, reading: 0, readingShown: false, wantFocus, announce: false };
    run = current;
    place(current);
    stage.append(box);
    // The app's limit, from the moment the run's document is set (PROTOTYPE_LOAD_TIMEOUT_MS).
    current.timer = setTimeout(() => {
      if (run === current && current.phase === "loading") fail(current, "timeout");
    }, viewerApp.PROTOTYPE_LOAD_TIMEOUT_MS);
    current.reading = setTimeout(() => {
      if (run !== current || current.phase !== "loading") return;
      current.readingShown = true;
      render();
    }, READING_DELAY_MS);
    tellBoard("playing:" + id);
    render();
  }

  // A failed or lost run takes every iframe with it, as the app's does; focus that was in the content
  // or fell to the page goes to the failure's heading, and anywhere else it stays.
  function fail(target, lost) {
    clearTimeout(target.timer);
    clearTimeout(target.reading);
    const active = document.activeElement;
    const focusScene = active === null || active === document.body || content.contains(active);
    target.phase = "failed";
    target.lost = lost;
    target.box.remove();
    shown?.box.remove();
    shown = null;
    render();
    if (focusScene) heading.focus({ preventScroll: true });
  }

  function result(target, report) {
    if (target.phase !== "loading") return;
    listed = { frames: report.frames, gotos: report.gotos };
    if (report.state !== "ready") {
      fail(target, report.state);
      return;
    }
    clearTimeout(target.timer);
    clearTimeout(target.reading);
    target.phase = "ready";
    target.mark = report.size;
    if (shown !== null && shown !== target) shown.box.remove();
    shown = target;
    place(target);
    target.box.style.visibility = "visible";
    render();
    if (target.wantFocus) {
      target.wantFocus = false;
      target.iframe.focus();
    }
  }

  // A move to another frame: one history entry, which the address, the header's Back and the
  // browser's Back all have.
  function navigate(id) {
    trail = viewerApp.recordEntry(trail, id, same);
    location.hash = playHashFor(id);
    save();
    start(id);
  }

  // A link the run's frame followed, as isolate.js decided it, judged as the app's window judges it
  // (view.ts linkMove): only a ready run moves, to a frame its document listed; the frame playing
  // starts over with no entry; any other value gets the broken link's toast.
  function follow(target, value) {
    // The last argument says whether an export's toast is on screen, which a broken link's toast must
    // not replace; Export prototype shows none yet.
    const move = viewerApp.linkMove({ gen: target.gen, phase: target.phase === "ready" ? "ready" : "loading", frames: listed.frames }, { gen: target.gen, goto: value }, false);
    if (move.kind === "drop") return;
    if (move.kind === "toast") {
      toast.show(linkToastText(value));
      return;
    }
    if (move.frame === target.id) {
      start(target.id);
      return;
    }
    navigate(move.frame);
    run.announce = true;
  }

  function setMode(next, byPerson) {
    if (next === mode) return;
    mode = next;
    if (byPerson) {
      modeSettled = true;
      tellBoard("mode:" + mode);
    }
    save();
    placeAll();
    render();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== null && event.source === window.opener) {
      const message = boardMessage(event.data);
      if (message === null) return;
      if (message.kind === "mode") {
        if (!modeSettled) setMode(message.mode, false);
        return;
      }
      // The frame playing stays as it is (the board brought the window forward); another starts anew.
      if (message.id !== run.id) navigate(message.id);
      return;
    }
    const current = run;
    if (event.source === null || event.source !== current.iframe.contentWindow || event.origin !== "null") return;
    const data = event.data;
    if (data === null || typeof data !== "object" || Array.isArray(data)) return;
    // isolate.js's message for a followed link: it decides before the frame can navigate away. The
    // run script's own `{gen, goto}` for the same click is left alone.
    if (data.type === "doan-prototype") {
      const value = data.goto;
      if (value === null || (typeof value === "string" && value.length <= MAX_STRING)) follow(current, value);
      return;
    }
    if (data.gen !== current.gen) return;
    if ("state" in data) {
      const report = viewerApp.parseRunReport("prototype", data);
      if (report !== null && report.state !== "timeout") result(current, report);
      return;
    }
    if ("goto" in data) return;
    // The drawer's list again after the `load` handlers, when the run reported before them.
    const report = viewerApp.parseFramesReport("prototype", data);
    if (report === null || current.phase === "failed") return;
    listed = { frames: report.frames, gotos: report.gotos };
    render();
  });

  // The browser's Back and Forward (and the header's, which ask the browser) arrive here, and so
  // does an address someone typed: an entry this window made says where it is in the history.
  window.addEventListener("hashchange", () => {
    const id = playHash(location.hash) ?? "";
    const saved = isRecord(history.state) ? history.state.doanPlayer : null;
    if (isRecord(saved) && Number.isInteger(saved.index) && trail.entries[saved.index] === id) trail = { entries: trail.entries, index: saved.index };
    else if (trail.entries[trail.index] !== id) trail = viewerApp.recordEntry(trail, id, same);
    save();
    if (run === null || run.id !== id) start(id);
    else render();
  });

  // ── Header ──
  // The end of the history is aria-disabled, not disabled: a Back or Forward pressed to it keeps focus.
  back.addEventListener("click", () => {
    if (viewerApp.canStep(trail, "back", usable)) history.back();
  });
  forward.addEventListener("click", () => {
    if (viewerApp.canStep(trail, "forward", usable)) history.forward();
  });
  // A pointer press on these keeps focus where it was (usually in the frame), so keys keep reaching
  // the frame, and a Reload from there hands focus to the new run.
  for (const button of [reload, ...modeButtons, exportButton]) button.addEventListener("mousedown", (event) => event.preventDefault());
  reload.addEventListener("click", () => start(run.id));
  retry.addEventListener("click", () => start(run.id));
  closeButton.addEventListener("click", () => window.close());
  for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode, true));
  $("pw-modes").addEventListener("keydown", (event) => {
    const next = toolbarMove(modeButtons.indexOf(document.activeElement), modeButtons.length, event.key);
    if (next === null) return;
    event.preventDefault();
    modeButtons[next].focus();
  });
  exportButton.addEventListener("click", () => {
    if (viewerApp.exportAvailability({ phase: appPhase(run) }, false).available) exportPrototype(run.id);
  });

  // The name opens the drawer of the frames the run listed, in link groups, the playing one marked
  // (view.ts drawerGroups); with none it holds one line. The app's keys (drawerKey). A row plays its
  // frame; the frame playing stays as it is.
  let drawerOpen = false;
  let focused = null;
  let typed = { text: "", at: 0 };
  let rows = [];
  let nodes = new Map();
  let shownKey = "";
  const moveTo = (key) => {
    const node = key === null ? undefined : nodes.get(key);
    if (!node) return;
    focused = key;
    for (const [other, row] of nodes) row.tabIndex = other === key ? 0 : -1;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  };
  const drawRows = () => {
    const groups = viewerApp.drawerGroups({ frames: listed.frames, frame: run.id, gotos: listed.gotos });
    shownKey = JSON.stringify(groups);
    list.setAttribute("aria-label", viewerApp.drawerLabel({ canvas: meta.name }));
    nodes = drawerRows(list, groups, eye, "Playing", {
      focus: (row) => { focused = row.key; },
      pick: (row) => pick(row),
    });
    rows = viewerApp.drawerOrder(groups);
    list.hidden = groups.length === 0;
    empty.hidden = groups.length > 0;
    nameButton.setAttribute("aria-haspopup", groups.length === 0 ? "dialog" : "listbox");
  };
  const closeDrawer = (focus) => {
    if (!drawerOpen) return;
    drawerOpen = false;
    focused = null;
    drawer.hidden = true;
    nameButton.setAttribute("aria-expanded", "false");
    if (focus) nameButton.focus({ preventScroll: true });
  };
  const pick = (row) => {
    closeDrawer(true);
    if (row.id !== run.id) navigate(row.id);
  };
  const frameList = {
    refresh() {
      if (!drawerOpen) return;
      if (JSON.stringify(viewerApp.drawerGroups({ frames: listed.frames, frame: run.id, gotos: listed.gotos })) === shownKey) return;
      const inside = drawer.contains(document.activeElement);
      drawRows();
      const next = viewerApp.focusedRowAfter(rows, focused);
      if (inside) moveTo(next);
      else focused = next;
    },
  };
  nameButton.addEventListener("click", () => {
    if (drawerOpen) {
      closeDrawer(true);
      return;
    }
    drawRows();
    drawerOpen = true;
    hideTip();
    const head = nameButton.parentElement.getBoundingClientRect();
    const box = nameButton.getBoundingClientRect();
    drawer.style.left = box.left + box.width / 2 - head.left + "px";
    drawer.style.top = box.bottom + 4 - head.top + "px";
    drawer.hidden = false;
    nameButton.setAttribute("aria-expanded", "true");
    // With no row, focus stays on the name, which takes the Esc; WebKit does not focus a clicked button.
    if (rows.length === 0) nameButton.focus({ preventScroll: true });
    else moveTo(viewerApp.focusedRowAfter(rows, null));
  });
  drawer.addEventListener("keydown", (event) => {
    if (!drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer(true);
      return;
    }
    const answer = viewerApp.drawerKey(rows, focused, event, typed, Date.now());
    typed = answer.typed;
    if (answer.prevent) event.preventDefault();
    const picked = answer.pick === undefined ? undefined : rows.find((row) => row.key === answer.pick);
    if (picked) pick(picked);
    else if (answer.move !== undefined) moveTo(answer.move);
  });
  // An empty drawer keeps focus on the name, so Esc there closes it too.
  nameButton.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawerOpen) {
      event.preventDefault();
      closeDrawer(true);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (drawerOpen && !drawer.contains(event.target) && !nameButton.contains(event.target)) closeDrawer(false);
  });
  // Focus that went into the frame (a click there never reaches this page) closes it, and stays there.
  window.addEventListener("blur", () => {
    if (drawerOpen && document.activeElement?.localName === "iframe") closeDrawer(false);
  });

  // ── Tooltips ──
  // One tooltip, 4 under its control: its name, Fit's size (view.ts modeTooltip), Export's reason, and
  // the frame's whole name only while the header cuts it. A pointer waits as the app's (tipWait).
  let tipFor = null;
  let tipTimer = 0;
  let tipClosedAt = null;
  const tipText = (button) => {
    if (button === nameButton) return nameText.scrollWidth > nameText.clientWidth ? nameText.textContent : null;
    if (button === exportButton) return exportReason.textContent || button.getAttribute("aria-label");
    if (button.dataset.mode !== undefined) return viewerApp.modeTooltip(button.dataset.mode, run.mark === null ? null : { markWidth: run.mark.width, markHeight: run.mark.height });
    return button.getAttribute("aria-label");
  };
  function showTip(button) {
    const text = tipText(button);
    if (text === null) {
      hideTip();
      return;
    }
    tip.textContent = text;
    tip.hidden = false;
    const panel = pw.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left + box.width / 2 - tip.offsetWidth / 2, panel.width - 8 - tip.offsetWidth));
    tip.style.left = left - panel.left + "px";
    tip.style.top = box.bottom + 4 - panel.top + "px";
    tipFor = button;
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (!tip.hidden) tipClosedAt = performance.now();
    tipFor = null;
    tip.hidden = true;
  }
  for (const button of [back, forward, reload, nameButton, ...modeButtons, exportButton]) {
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch" || drawerOpen) return;
      clearTimeout(tipTimer);
      const wait = tipWait(performance.now(), tipClosedAt);
      if (wait === 0) showTip(button);
      else tipTimer = setTimeout(() => showTip(button), wait);
    });
    button.addEventListener("pointerleave", hideTip);
    button.addEventListener("pointerdown", hideTip);
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible") && !drawerOpen) showTip(button);
    });
    button.addEventListener("blur", hideTip);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && tipFor !== null) hideTip();
  });

  // The name takes the header's second row when the first would leave it under 120 px (lib.js).
  const rows2 = () => pw.classList.toggle("name-row", playerRows(window.innerWidth) === 2);
  window.addEventListener("resize", () => {
    rows2();
    if (tipFor !== null) showTip(tipFor);
  });
  rows2();
  new ResizeObserver(placeAll).observe(stage);

  save();
  if (restored.restored) tellBoard("mode:" + mode);
  start(first);
  return true;
}
