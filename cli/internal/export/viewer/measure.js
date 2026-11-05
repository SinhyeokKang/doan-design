// Runs inside the canvas document, the first script in its <head>, so the font listener below
// cannot miss `loadingdone`. `assemble` puts lib.js, then this file, in one inline <script> wrapped
// in a function, so none of the names leak into the canvas's own scripts.
//
// The size-reporting half of app/src/main/canvasScript.ts: it tells the viewer page how tall the
// document is and where its frames are, and hands wheel input the canvas itself cannot scroll to
// the page. Of the app's key channel only the tool keys are here (Space, V, H, Escape); its
// selection, hover, picking and anchor channels do not exist.
// POSTMORTEM 2026-11-01 (absolutely positioned frames resizing the iframe between 0 and 405 px
// forever) is why the height comes from lib.js `documentHeight`/`frameBottom`/`nextHeight`
// unchanged.

const post = (message) => parent.postMessage(message, "*");
let height = null;
let fontLoads = 0;
let started = false;

const frames = () => {
  const list = [];
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
    const frame = { id: clipText(el.getAttribute("data-doan-frame") || "", MAX_STRING), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
    const title = el.getAttribute("data-doan-title");
    if (title !== null) frame.title = clipText(title, MAX_STRING);
    list.push(frame);
  }
  return { list, total, bottom };
};

const send = () => {
  const html = document.documentElement;
  const { list, total, bottom } = frames();
  const measured = documentHeight(Math.ceil(html.getBoundingClientRect().height), html.scrollHeight, innerHeight, bottom);
  height = nextHeight(height, measured, innerHeight, fontLoads);
  // `viewport` lets the page drop a layout measured before its last resize of the iframe reached
  // this document.
  post({ type: "layout", href: location.href, height: height.sent, viewport: innerHeight, frames: list, total });
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
const start = () => {
  started = true;
  const resized = new ResizeObserver(schedule);
  resized.observe(document.documentElement);
  if (document.body) resized.observe(document.body);
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("resize", schedule);
  addEventListener("load", schedule);
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

addEventListener("message", (event) => {
  if (event.source !== parent) return;
  const data = event.data;
  if (typeof data === "object" && data !== null && data.type === "measure") send();
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
  if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229 && !event.defaultPrevented && !editableTarget(event.target)) post({ type: "key", key: "Escape" });
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
