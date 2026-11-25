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

// The app's frame name (canvasTree.ts frameName): the trimmed title, else the id. This file shares a scope with
// lib.js, whose frameName names the drawer's rows.
function playedFrameName(frame) {
  return frame.title?.trim() || frame.id;
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

// ── Export prototype ──────────────────────────────────────────────────────────
// The player downloads the playing frame's prototype file, the file `doan export --frame <id> --prototype` writes,
// by joining the strings the page's META carries (assemble.go frameExports): Go alone judges and escapes, the
// browser only joins, with one escape of its own for the canvas (srcdocAttribute, held to Go's by a shared table).
// Saving is the browser's, which never says whether a file was written: the toast says a download was requested.

// The app's wait before its progress toast (PrototypeWindow.tsx EXPORT_PROGRESS_DELAY_MS).
const EXPORT_PROGRESS_DELAY_MS = 1000;
// Chromium silently cancels a download whose name is 245 UTF-16 units or longer.
const MAX_FILE_NAME = 240;
// The canvas is escaped in slices of this many UTF-16 units, and the window is handed back between them once
// EXPORT_WORK_MS of work has gone by, so a large file keeps the window answering and lets the progress toast paint.
const EXPORT_SLICE = 1 << 20;
const EXPORT_WORK_MS = 50;

function exportProgressText(frame) {
  return "Exporting “" + frame + "”";
}

// `linked` is how many frames the file plays besides the clicked one; `external` the CLI's count of the internet
// URLs the canvas loads, which the app's toast mentions when there is any.
function exportRequestedText(frame, linked, external) {
  const what = linked > 0 ? "Download requested for “" + frame + "” and " + linked + " linked frame" + (linked === 1 ? "" : "s") + "." : "Download requested for “" + frame + "”.";
  return what + " The file also contains the rest of the canvas." + (external > 0 ? " Parts of it load from the internet." : "") + " If nothing downloads, allow downloads for this file and try again.";
}

// missing: the file does not have the frame, or has its id on two frames (a script made the one that plays, as the
// app reads the CLI's frame_not_found); unmarked: its mark in the file is missing or invalid; broken: the page's
// data does not hold together (someone edited the page); failed: the browser could not build the file.
const EXPORT_REFUSED = {
  missing: "This frame isn’t in the canvas file. Ask the sender for an updated file.",
  unmarked: "It isn’t marked for prototyping in the canvas file. Ask the sender for an updated file.",
  broken: "Ask the sender for an updated file.",
  failed: "Try again.",
};

function exportRefusedText(frame, reason) {
  return "Couldn’t export “" + frame + "”. " + EXPORT_REFUSED[reason];
}

// The app's save panel's name (canvasExport.ts prototypeExportName): <canvas file stem>-<frame id>.html, the id alone
// for a canvas file named only .html, with `/`, `:` and control characters as hyphens. Left to the browser, they
// would be replaced its own way, and WebKit names a file with a control character "example.com". Past MAX_FILE_NAME
// the stem and id lose their end, never half of a surrogate pair, and .html stays; a hyphen replaces one unit, so
// it moves no cut.
function exportFileName(stem, id) {
  const base = (stem === "" ? id : stem + "-" + id).replace(/[/:\u0000-\u001f\u007f]/g, "-");
  const room = MAX_FILE_NAME - ".html".length;
  if (base.length <= room) return base + ".html";
  const last = base.charCodeAt(room - 1);
  return base.slice(0, last >= 0xd800 && last <= 0xdbff ? room - 1 : room) + ".html";
}

// The canvas as the double-quoted srcdoc attribute value of a prototype file, as assemble.go writes it.
function srcdocAttribute(text) {
  return text.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
}

// The pieces escaped in slices of about `size` units. A Blob encodes each of its parts on its own, so a slice never
// ends inside a surrogate pair, whose half would be written as U+FFFD.
function* srcdocSlices(pieces, size) {
  for (const piece of pieces) {
    for (let at = 0; at < piece.length;) {
      let end = Math.min(at + size, piece.length);
      const last = piece.charCodeAt(end - 1);
      if (end < piece.length && last >= 0xd800 && last <= 0xdbff) end += 1;
      yield srcdocAttribute(piece.slice(at, end));
      at = end;
    }
  }
}

// The measure script assemble.go puts in the srcdoc, which a prototype file has isolate.js in place of. The end tag
// is written in two parts: this file runs inside a script element of the page.
const MEASURE_HEAD = "<script>(function () {\n";
const MEASURE_TAIL = "\n})();<" + "/script>";

// The prototype file of frame `id` from META's "prototype" data, the board iframe's srcdoc as the parser left it and
// the text of this page's font style, which the file carries as its own (META leaves it out so the face is in this
// file once):
// { kind: "file", head, canvas, tail, linked }, the file being head + the canvas pieces escaped + tail, or
// { kind: "refused", reason } (EXPORT_REFUSED). Data that does not hold together is refused, never joined into a
// file that would not play. Ids are looked up in Maps: as keys of an object, "__proto__" or "constructor" would
// find Object.prototype's members.
function prototypeExport(proto, srcdoc, id, font) {
  const broken = { kind: "refused", reason: "broken" };
  const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const text = (value) => typeof value === "string";
  const count = (value) => Number.isInteger(value) && value >= 0;
  if (!record(proto) || !text(srcdoc) || !text(font)) return broken;
  const { frames, refused, groups, page, isolate, measure } = proto;
  if (!Array.isArray(frames) || !Array.isArray(refused) || !Array.isArray(groups) || !text(isolate) || !record(measure)) return broken;
  if (!Array.isArray(page) || page.length !== 6 || !page.every(text)) return broken;
  const exportable = new Map();
  for (const frame of frames) {
    if (!record(frame) || !text(frame.id) || !text(frame.name) || !text(frame.start) || !Number.isInteger(frame.group)) return broken;
    exportable.set(frame.id, frame);
  }
  const reasons = new Map();
  for (const entry of refused) {
    if (!record(entry) || !text(entry.id) || !text(entry.reason)) return broken;
    reasons.set(entry.id, entry.reason);
  }
  const frame = exportable.get(id);
  if (frame === undefined) return { kind: "refused", reason: reasons.get(id) === "unmarked" ? "unmarked" : "missing" };
  const group = groups[frame.group];
  if (!text(group)) return broken;
  let members;
  try {
    members = JSON.parse(group);
  } catch {
    return broken;
  }
  if (!Array.isArray(members) || !members.some((member) => record(member) && member.id === id)) return broken;
  // The range must still be the measure script (cli/internal/export/exporttest StitchPrototype checks the same):
  // a srcdoc that changed around it would otherwise lose part of the canvas.
  const { offset, length } = measure;
  if (!count(offset) || !count(length) || offset + length > srcdoc.length) return broken;
  const script = srcdoc.slice(offset, offset + length);
  if (!script.startsWith(MEASURE_HEAD) || !script.endsWith(MEASURE_TAIL)) return broken;
  return {
    kind: "file",
    head: page[0] + frame.name + page[1] + font + page[2] + frame.start + page[3] + group + page[4],
    canvas: [srcdoc.slice(0, offset), isolate, srcdoc.slice(offset + length)],
    tail: page[5],
    linked: members.length - 1,
  };
}

// ── The player ────────────────────────────────────────────────────────────────

// The app's reading line waits so a quick load does not flash it (PrototypeWindow.tsx READING_DELAY_MS).
const READING_DELAY_MS = 300;
// The run script reports the frame it was given against the document it runs in.
const RUN_URL = "about:srcdoc";

// Whether this page is a player window; if it is, it plays. The guard in shell.html decided before
// the board's iframe was parsed and left its srcdoc here.
function startPlayer() {
  const source = window.doanPlayCanvas;
  if (typeof source !== "string") return false;
  window.doanPlayCanvas = undefined;

  const $ = (id) => document.getElementById(id);
  const meta = JSON.parse($("doan-meta").textContent);
  const proto = meta.prototype;
  const font = $("doan-font")?.textContent;
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
  // An export holds the header's Export ("Exporting") from the click to the download; `exportToast` is the id of the
  // toast an export last showed, which a broken link's toast must not replace (view.ts linkMove).
  let exporting = false;
  let exportToast = null;
  // The last file's Blob address, kept until the next export: a browser that asks before it saves still has it.
  let download = null;

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
    return playedFrameName(frame ?? { id, title: fileFrames.get(id)?.name });
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
    const exportState = viewerApp.exportAvailability({ phase: appPhase(current) }, exporting);
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
    // The address first: an id no address can hold (a lone surrogate, which only a frame a script made can have)
    // throws here, before the history has an entry the window never shows.
    const hash = playHashFor(id);
    trail = viewerApp.recordEntry(trail, id, same);
    location.hash = hash;
    save();
    start(id);
  }

  // A link the run's frame followed, as isolate.js decided it, judged as the app's window judges it
  // (view.ts linkMove): only a ready run moves, to a frame its document listed; the frame playing
  // starts over with no entry; any other value gets the broken link's toast.
  function follow(target, value) {
    // The last argument says whether an export's toast is on screen, which a broken link's toast must
    // not replace.
    const exportToastShown = exportToast !== null && toast.current() === exportToast;
    const move = viewerApp.linkMove({ gen: target.gen, phase: target.phase === "ready" ? "ready" : "loading", frames: listed.frames }, { gen: target.gen, goto: value }, exportToastShown);
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
    if (viewerApp.exportAvailability({ phase: appPhase(run) }, exporting).available) void exportPrototype(run.id);
  });

  // ── Export prototype ──
  const showExportToast = (text) => {
    exportToast = toast.show(text);
  };
  // A frame for the window to paint (the progress toast), or a moment when it is hidden and paints none.
  const nextFrame = () => new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });

  // The frame at the click and its link group: a frame that starts playing before the file is ready changes
  // neither the file nor the toast's name. Past EXPORT_PROGRESS_DELAY_MS the progress toast shows, and the result's
  // replaces it as the download is requested.
  async function exportPrototype(frameId) {
    if (exporting) return;
    const frame = nameOf(frameId);
    const plan = prototypeExport(proto, source, frameId, font);
    if (plan.kind === "refused") {
      showExportToast(exportRefusedText(frame, plan.reason));
      return;
    }
    exporting = true;
    render();
    let progress = false;
    const timer = setTimeout(() => {
      progress = true;
      showExportToast(exportProgressText(frame));
    }, EXPORT_PROGRESS_DELAY_MS);
    let result;
    try {
      const parts = [plan.head];
      let painted = false;
      let since = performance.now();
      for (const slice of srcdocSlices(plan.canvas, EXPORT_SLICE)) {
        parts.push(slice);
        if ((progress && !painted) || performance.now() - since >= EXPORT_WORK_MS) {
          painted = progress;
          await nextFrame();
          since = performance.now();
        }
      }
      parts.push(plan.tail);
      const file = new Blob(parts, { type: "text/html" });
      if (download !== null) URL.revokeObjectURL(download);
      download = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = download;
      link.download = exportFileName(meta.name, frameId);
      document.body.append(link);
      link.click();
      link.remove();
      result = exportRequestedText(frame, plan.linked, proto.external);
    } catch (error) {
      console.error(error);
      result = exportRefusedText(frame, "failed");
    }
    clearTimeout(timer);
    exporting = false;
    showExportToast(result);
    render();
  }

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
