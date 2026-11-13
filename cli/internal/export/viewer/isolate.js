// The first script in an exported prototype's canvas document (srcdoc), wrapped in a function by
// AssemblePrototype after `const FRAME = <frame id as JSON>;`. It isolates that one frame as the
// app's prototype window does (app/src/main/prototypeScript.ts), keeps the canvas from leaving its
// document, and tells the page around it, once, whether the frame is there.
//
// The CLI already judged the frame from the file, so the mark is not read again: a frame a script
// removes, or duplicates, before the frame is found is reported as missing.

// Taken before any canvas script runs, so a canvas name cannot shadow it.
const host = window.parent;
const post = (state) => host.postMessage({ type: "doan-prototype", state }, "*");

// Only links whose written value starts with "#" stay in the document. Everything else would load
// another document into the frame, which the recipient's browser cannot reach (the file is alone).
function sameDocument(href) {
  return href.startsWith("#");
}

// Bubble phase, so the canvas's own handlers run first and a handler that checks defaultPrevented
// (a client-side router's link) still sees its own event. A handler that stops propagation keeps
// its default.
window.addEventListener("submit", (event) => {
  event.preventDefault();
});
window.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  for (const node of event.composedPath()) {
    if (!(node instanceof Element) || (node.localName !== "a" && node.localName !== "area")) continue;
    const href = node.getAttribute("href") ?? node.getAttribute("xlink:href");
    if (href === null) return;
    event.preventDefault();
    // A srcdoc document resolves "#id" against the page's file URL, not its own, so the browser's
    // own handling leaves it: WebKit loads the page around the frame into the frame, and Chromium
    // drops the click. Setting the hash moves within the document, as the link would in the app.
    if (sameDocument(href)) location.hash = href;
    return;
  }
});

// The same list and sheet as prototypeScript.ts's isolate (exportViewer.test.ts compares them).
const KEEP = new Set(["HEAD", "SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "TITLE", "NOSCRIPT"]);
function isolate(el) {
  for (let node = el; node.parentElement !== null; node = node.parentElement) {
    const parentEl = node.parentElement;
    parentEl.setAttribute("data-doan-proto-path", "");
    for (const sibling of Array.from(parentEl.children)) {
      if (sibling !== node && !KEEP.has(sibling.tagName.toUpperCase())) sibling.setAttribute("data-doan-proto-hidden", "");
    }
  }
  el.setAttribute("data-doan-proto-frame", "");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
      [data-doan-proto-hidden] { display: none !important; }
      [data-doan-proto-path] { display: block !important; position: static !important; inset: auto !important; float: none !important;
        margin: 0 !important; padding: 0 !important; border: 0 !important; gap: 0 !important;
        width: auto !important; min-width: 0 !important; max-width: none !important;
        height: auto !important; min-height: 0 !important; max-height: none !important;
        transform: none !important; translate: none !important; scale: none !important; rotate: none !important; zoom: 1 !important;
        filter: none !important; contain: none !important; overflow: visible !important; columns: auto !important; }
      [data-doan-proto-frame] { position: relative !important; inset: auto !important; float: none !important; margin: 0 !important;
        transform: none !important; translate: none !important; scale: none !important; rotate: none !important; zoom: 1 !important;
        width: 100% !important; min-width: 0 !important; max-width: none !important; min-height: 100vh !important; box-sizing: border-box !important; }
    `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

// At DOMContentLoaded, or after the `load` handlers when the frame is not there yet, as the app's
// prototype window finds it: a frame a script makes while parsing or in `load` handlers counts.
let done = false;
function finish(final) {
  if (done) return true;
  const matches = Array.from(document.querySelectorAll("[data-doan-frame]")).filter((el) => el.getAttribute("data-doan-frame") === FRAME);
  if (matches.length === 0 && !final) return false;
  done = true;
  if (matches.length === 1) {
    isolate(matches[0]);
    post("ready");
  } else post("missing");
  return true;
}
const afterLoad = (then) => window.addEventListener("load", () => setTimeout(then, 0), { once: true });
const atContentLoaded = () => {
  if (!finish(false)) afterLoad(() => finish(true));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atContentLoaded, { once: true });
else if (document.readyState === "interactive") atContentLoaded();
else setTimeout(() => finish(true), 0);
