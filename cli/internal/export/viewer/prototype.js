// The page around an exported prototype. It plays the frames of one link group, one at a time, each
// in a new sandboxed iframe that holds the whole canvas: the frame to play is the iframe's name,
// which the isolation script in it reads. Every frame starts anew, the way the app's prototype
// window plays a frame again.
//
// The frame shown is the page's hash, `#<encodeURIComponent(id)>`, so the browser's Back and Forward,
// a reload and a bookmark follow it. A link in the frame changes the hash (one history entry), and
// the hash change plays the frame. A link to the frame playing restarts it without a history entry.
//
// A new iframe starts hidden: until the isolation script in it reports, it would show the whole
// canvas, other frames and notes included, which the sender did not mean to show. Meanwhile the
// frame before stays on screen, inert. The new one shows on `ready`; on `missing`, or when nothing
// came within LOAD_TIMEOUT_MS, it stays hidden and the line says the frame did not load. Either way
// the frame before goes then. A `ready` after the timeout still shows the frame (a slow canvas), so
// the line goes again.

const LOAD_TIMEOUT_MS = 10000;

// phase: "waiting" until the first answer or the timeout, "late" after the timeout with no answer,
// then "ready" or "missing" for good: the isolation script reports once.
function nextPhase(phase, input) {
  if (phase !== "waiting" && phase !== "late") return phase;
  if (input === "ready" || input === "missing") return input;
  if (input === "timeout" && phase === "waiting") return "late";
  return phase;
}

function phaseView(phase) {
  return { frameShown: phase === "ready", lineShown: phase === "missing" || phase === "late" };
}

// Only the current iframe's own window, whose sandbox gives it the opaque origin: one of the two
// states, or the value of a link it followed. An iframe replaced by a newer one is another window,
// so nothing it still sends counts.
function acceptMessage(event, frameWindow) {
  if (event.source !== frameWindow || event.origin !== "null") return null;
  const data = event.data;
  if (data === null || typeof data !== "object" || data.type !== "doan-prototype") return null;
  if (data.state === "ready" || data.state === "missing") return { state: data.state };
  if (typeof data.goto === "string") return { goto: data.goto };
  return null;
}

// The frame a hash names. An empty hash, one that does not decode, or one naming no frame of the
// group is the start frame. Opening the file and every hash change read it the same way.
function resolveHash(hash, ids, start) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return start;
  let id;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return start;
  }
  return ids.includes(id) ? id : start;
}

function hashFor(id) {
  return "#" + encodeURIComponent(id);
}

// A link is followed only from a frame that plays, once: a second click before the next frame
// shows does nothing. A value naming no frame of the group does nothing either (the file has no
// toast to say so).
function gotoTarget(value, run, ids) {
  if (run.phase !== "ready" || run.followed || !ids.includes(value)) return null;
  return value;
}

function pageTitle(name) {
  return name + " — Prototype";
}

// The page's last script: the group, the holder and the line are parsed.
const page = JSON.parse(document.getElementById("doan-prototype").textContent);
const ids = page.frames.map((frame) => frame.id);
const names = new Map(page.frames.map((frame) => [frame.id, frame.title]));
// Read once; every iframe gets the same string.
const canvas = document.getElementById("canvas").getAttribute("data-srcdoc");
const line = document.getElementById("line");

// `current` is the newest frame, `visible` the one on screen (the line counts as on screen). They
// differ while a frame loads.
let current = null;
let visible = null;

function show(id) {
  // A frame dropped while it loads passes its claim on, since the inert frame on screen has lost
  // focus by then.
  const focused = document.activeElement;
  const wantFocus = current !== null && (current.wantFocus || focused === current.iframe || focused === visible?.iframe);
  if (current !== null) {
    clearTimeout(current.timer);
    // A frame that never got on screen is dropped at once; the one on screen stays until this one
    // settles.
    if (current !== visible) current.iframe.remove();
  }
  if (visible !== null) visible.iframe.inert = true;
  document.title = pageTitle(names.get(id));
  const iframe = document.createElement("iframe");
  iframe.className = "proto-frame";
  iframe.title = names.get(id);
  // The sandbox before the name and the canvas, and all three before the iframe is in the page: the
  // flags apply from the first document on, and that document reads its frame from the name.
  iframe.setAttribute("sandbox", "allow-scripts allow-forms");
  iframe.name = id;
  iframe.srcdoc = canvas;
  const run = { id, iframe, phase: "waiting", followed: false, wantFocus, timer: 0 };
  current = run;
  document.body.append(iframe);
  run.timer = setTimeout(() => apply(run, "timeout"), LOAD_TIMEOUT_MS);
}

function apply(run, input) {
  run.phase = nextPhase(run.phase, input);
  if (run !== current) return;
  const view = phaseView(run.phase);
  if (!view.frameShown && !view.lineShown) return;
  if (run.phase === "ready" || run.phase === "missing") clearTimeout(run.timer);
  if (visible !== null && visible !== run) visible.iframe.remove();
  visible = run;
  run.iframe.classList.toggle("shown", view.frameShown);
  line.hidden = !view.lineShown;
  if (view.frameShown && run.wantFocus) {
    run.wantFocus = false;
    run.iframe.focus();
  }
}

window.addEventListener("message", (event) => {
  const run = current;
  if (run === null) return;
  const message = acceptMessage(event, run.iframe.contentWindow);
  if (message === null) return;
  if (message.state !== undefined) {
    apply(run, message.state);
    return;
  }
  const target = gotoTarget(message.goto, run, ids);
  if (target === null) return;
  run.followed = true;
  if (target === run.id) {
    show(target);
    return;
  }
  location.hash = hashFor(target);
  // Right after the new entry, so the browser's history menu names the frame.
  document.title = pageTitle(names.get(target));
});
window.addEventListener("hashchange", () => {
  const id = resolveHash(location.hash, ids, page.start);
  if (id !== current.id) show(id);
});

const first = resolveHash(location.hash, ids, page.start);
location.replace(hashFor(first));
show(first);
