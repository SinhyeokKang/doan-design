// Runs inside the canvas document, the first script in its <head>, so the font listener below
// cannot miss `loadingdone`. `assemble` wraps lib.js, the inspector readers and this file together
// in one function, so none of the names leak into the canvas's own scripts.
//
// The size-reporting half of app/src/main/canvasScript.ts: it tells the viewer page how tall the
// document is and where its frames are, and hands wheel input the canvas itself cannot scroll to
// the page. It forwards tool keys (Space, V, H, Escape) and shows the hand while the board pans.
// Select's input handling (inspectSelection.js) runs whether the inspector column shows or not;
// styles are read only while it shows.
// POSTMORTEM 2026-11-01 (absolutely positioned frames resizing the iframe between 0 and 405 px
// forever) is why the height comes from lib.js `documentHeight`/`frameBottom`/`nextHeight`
// unchanged.

const post = (message) => parent.postMessage(message, "*");
const inspection = canvasInspection(post);

// The canvas is a srcdoc document here, unlike in the app, so it gets the prototype page's handling
// of the two things that break there; the History retry, sameDocument and linkElement are isolate.js's
// text (exportViewer.test.ts compares them).
// A srcdoc document's URL is about:srcdoc while its base is the page's file URL, so a fragment or a
// path given to pushState or replaceState resolves against that file URL and the browser refuses it
// with SecurityError (Chromium and WebKit), and a router's next statement never runs. Such a call is
// made again without the URL: the state and the entry are kept and the script goes on, though
// location does not change. A call the browser takes (an about:srcdoc URL) keeps its own result. Any
// other error, and a retry that fails, still reaches the canvas.
for (const name of ["pushState", "replaceState"]) {
  const native = history[name];
  history[name] = function (...args) {
    try {
      return native.apply(this, args);
    } catch (error) {
      const url = args[2];
      if (url === undefined || url === null || error?.name !== "SecurityError") throw error;
      return native.call(this, args[0], args[1]);
    }
  };
}

// Only links whose written value starts with "#" stay in the document.
function sameDocument(href) {
  return href.startsWith("#");
}

// The nearest <a> or <area> in the click's path, as a browser follows it.
function linkElement(event) {
  for (const node of event.composedPath()) {
    if (node instanceof Element && (node.localName === "a" || node.localName === "area")) return node;
  }
  return null;
}

// A srcdoc document resolves "#id" against the page's file URL, not its own, so the browser's own
// handling leaves it: WebKit loads the viewer page into the canvas frame, and Chromium drops the
// click. Setting the hash moves within the document, as the link does in the app. Bubble phase, so
// a canvas that cancelled the click keeps it; links to other documents are left as they are
// (`doan export` reports them under `links`).
addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  const node = linkElement(event);
  const href = node?.getAttribute("href") ?? node?.getAttribute("xlink:href") ?? null;
  if (href === null || !sameDocument(href)) return;
  event.preventDefault();
  location.hash = href;
});

let height = null;
let fontLoads = 0;
let started = false;

// `parent` is the nearest enclosing listed frame's index; a frame's ancestors come before it in
// document order, so a listed frame's enclosing frames are all listed. `gotos` name the innermost
// listed frame around each link. Play prototype judges both, as in the app (canvasScript.ts).
const frames = () => {
  const list = [];
  const listed = new Map();
  const listedAround = (el) => {
    for (let node = el; node !== null; node = node.parentElement) {
      const index = listed.get(node);
      if (index !== undefined) return index;
    }
    return undefined;
  };
  let total = 0;
  const html = document.documentElement;
  const rootStyle = getComputedStyle(html);
  // body's overflow belongs to the viewport while html's is visible, and then body clips nothing.
  const bodyClips = rootStyle.overflowX !== "visible" || rootStyle.overflowY !== "visible";
  const ancestors = (el) => {
    const links = [];
    for (let node = el.parentElement; node !== null && node !== html; node = node.parentElement) {
      const style = getComputedStyle(node);
      const overflowY = node === document.body && !bodyClips ? "visible" : style.overflowY;
      const box = overflowY === "visible" ? null : node.getBoundingClientRect();
      links.push({ position: style.position, overflowY, display: style.display, bottom: box === null ? Infinity : box.top + box.height + scrollY });
    }
    return links;
  };
  let bottom = 0;
  for (const el of document.querySelectorAll("[data-doan-frame]")) {
    const rect = el.getBoundingClientRect();
    // Frames past the listed ones still count toward the height.
    bottom = Math.max(bottom, frameBottom(rect.top + rect.height + scrollY, getComputedStyle(el).position, ancestors(el)));
    total++;
    if (list.length === MAX_FRAMES) continue;
    const id = el.getAttribute("data-doan-frame") || "";
    const frame = { id: clipText(id, MAX_STRING), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
    const title = el.getAttribute("data-doan-title");
    if (title !== null) frame.title = clipText(title, MAX_STRING);
    // A cut id is not the frame's, so the frame cannot play; its place, number and mark stay.
    if (frame.id !== id) frame.cut = true;
    // The raw mark, judged by the page; the longest valid one is 11 characters, so a cut value stays invalid.
    const mark = el.getAttribute("data-doan-prototype");
    if (mark !== null) frame.prototype = clipText(mark, MAX_PROTOTYPE_MARK);
    const parentIndex = listedAround(el.parentElement);
    if (parentIndex !== undefined) frame.parent = parentIndex;
    listed.set(el, list.length);
    list.push(frame);
  }
  // A value over the cap is left out, not cut: no frame can have it, and a cut one could name another frame.
  const gotos = [];
  for (const el of document.querySelectorAll("[data-doan-goto]")) {
    if (gotos.length === MAX_GOTOS) break;
    const value = el.getAttribute("data-doan-goto") ?? "";
    if (value.length > MAX_STRING) continue;
    const frame = listedAround(el);
    gotos.push(frame === undefined ? { value } : { value, frame });
  }
  return { list, total, bottom, gotos };
};

// The first layout waits for linked stylesheets (canvasScript.ts): a height measured unstyled sticks in
// nextHeight once the iframe takes it (POSTMORTEM 2026-11-20).
let laidOut = false;
const failedSheets = new WeakSet();
const stylesheetPending = () => document.readyState !== "complete" && Array.from(document.querySelectorAll('link[rel~="stylesheet" i][href]:not([rel~="alternate" i])')).some(
  (link) => !link.sheet && !link.disabled && !failedSheets.has(link) && (!link.media || matchMedia(link.media).matches));
const send = () => {
  if (!laidOut) {
    if (stylesheetPending()) return;
    laidOut = true;
  }
  inspection.layout();
  const html = document.documentElement;
  const { list, total, bottom, gotos } = frames();
  const measured = documentHeight(Math.ceil(html.getBoundingClientRect().height), html.scrollHeight, innerHeight, bottom);
  height = nextHeight(height, measured, innerHeight, fontLoads);
  // `viewport` lets the page drop a layout measured before its last resize of the iframe reached
  // this document.
  post({ type: "layout", href: location.href, height: height.sent, viewport: innerHeight, frames: list, total, gotos });
};

let queued = false;
const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    send();
  });
};

// The first layout and measure replies skip rAF: an iframe outside the viewport gets no animation
// frames, so a batched reply would never come.
const stylesheetSettled = (event) => {
  if (laidOut || !(event.target instanceof HTMLLinkElement)) return;
  if (event.type === "error") failedSheets.add(event.target);
  if (started) send();
};
document.addEventListener("load", stylesheetSettled, true);
document.addEventListener("error", stylesheetSettled, true);
const start = () => {
  started = true;
  const resized = new ResizeObserver(schedule);
  resized.observe(document.documentElement);
  if (document.body) resized.observe(document.body);
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("resize", schedule);
  addEventListener("load", () => { if (laidOut) schedule(); else send(); });
  // Inner scrollers move frames without resizing anything.
  addEventListener("scroll", schedule, { capture: true, passive: true });
  void document.fonts.ready.then(schedule);
  send();
};

// Not `ready`: it may already be resolved here, which would count as a load before the first
// measurement and miss the first freeze of a chasing document. Sent without rAF: an off-screen
// iframe gets no animation frames.
document.fonts.addEventListener("loadingdone", () => {
  fontLoads++;
  if (started) send();
});

// The hand while the page's board pans: a pointer resting over the canvas keeps the cursor this
// document last set until it moves, so the board's own grab cursor shows only after a move. A
// constructed sheet changes no DOM node, and sheets the canvas adopted itself stay as they are.
let hand = null;
const showHand = (on) => {
  try {
    if (on && hand === null && typeof CSSStyleSheet === "function") {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync("*{cursor:grab!important}");
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      hand = sheet;
    } else if (!on && hand !== null) {
      const sheet = hand;
      hand = null;
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((adopted) => adopted !== sheet);
    }
  } catch {
    // The cursor is only a hint: a canvas that broke adoptedStyleSheets still pans, without it.
  }
};

addEventListener("message", (event) => {
  if (event.source !== parent) return;
  const data = event.data;
  if (typeof data !== "object" || data === null) return;
  if (data.type === "measure") send();
  else if (data.type === "pan" && typeof data.pan === "boolean") { showHand(data.pan); inspection.pan(data.pan); }
  else inspection.command(data);
});

// The document's own scroll (before the height fits) is not an inner scroller: a wheel there pans
// the board.
const scrollsFurther = (target, dx, dy) => {
  // nodeType, not instanceof: a wheel can target the document itself.
  let node = target;
  for (; node && node.nodeType === 1 && node !== document.documentElement && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (canScrollAxis(style.overflowY, node.scrollTop, node.clientHeight, node.scrollHeight, dy)) return true;
    if (canScrollAxis(style.overflowX, node.scrollLeft, node.clientWidth, node.scrollWidth, dx)) return true;
  }
  return false;
};

addEventListener(
  "wheel",
  (event) => {
    const zoom = event.ctrlKey || event.metaKey;
    if (!zoom && scrollsFurther(event.target, event.deltaX, event.deltaY)) return;
    event.preventDefault();
    post({ type: "wheel", dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode, x: event.clientX + scrollX, y: event.clientY + scrollY });
  },
  { passive: false, capture: true },
);

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

// The tool keys pressed while focus is in the canvas go to the page, decided by the same rules as
// there (lib.js toolShortcut): not in a text field, with ⌘/⌃/⌥, while composing, and a focused
// control's Space presses it. Bubble phase, so a key the canvas's own scripts handled stays theirs.
let spaceHeld = false;
const releaseSpace = () => {
  if (!spaceHeld) return;
  spaceHeld = false;
  post({ type: "key", key: "Space", down: false });
};

addEventListener("keydown", (event) => {
  const shortcut = toolShortcut(event, { canvasPage: true });
  if (shortcut !== null) {
    if (shortcut.kind === "tool") {
      post({ type: "key", key: shortcut.tool === "select" ? "V" : "H" });
      return;
    }
    // The page pans: the canvas must not scroll or take a space.
    event.preventDefault();
    spaceHeld = true;
    post({ type: "key", key: "Space", down: true });
    return;
  }
  if (event.code === "Space" && event.repeat && spaceHeld) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229 && !event.defaultPrevented && !editableTarget(event.target)) post({ type: "key", key: "Escape", repeat: event.repeat });
});

// Every Space release goes to the page, which ignores one it did not hold: focus and modifiers can
// change between the press and the release.
addEventListener("keyup", (event) => {
  if (toolShortcut(event, { canvasPage: true }) === null) return;
  if (spaceHeld) event.preventDefault();
  spaceHeld = false;
  post({ type: "key", key: "Space", down: false });
});

addEventListener("blur", releaseSpace);
addEventListener("pagehide", releaseSpace);
