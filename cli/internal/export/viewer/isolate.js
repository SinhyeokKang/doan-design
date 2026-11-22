// The first script in an exported prototype's canvas document (srcdoc), wrapped in a function by
// AssemblePrototype. It isolates one frame as the app's prototype window does
// (app/src/main/prototypeScript.ts), keeps the canvas from leaving its document, tells the page
// around it, once, whether the frame is there, and tells it which link a click in the frame follows.
//
// The frame is the iframe's name, which prototype.js sets before the document loads: the canvas is
// held once in the page for every frame of the group. The CLI already judged the group from the
// file, so the mark is not read again: a frame a script removes, or duplicates, before the frame is
// found is reported as missing.

// Taken before any canvas script runs, so a canvas name cannot shadow them.
const FRAME = window.name;
const host = window.parent;
const post = (message) => host.postMessage({ type: "doan-prototype", ...message }, "*");

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

// Only links whose written value starts with "#" stay in the document. Everything else would load
// another document into the frame, which the recipient's browser cannot reach (the file is alone).
function sameDocument(href) {
  return href.startsWith("#");
}

// A click on a data-doan-goto link inside the playing frame posts its value, as the prototype
// window's injected script decides it (the shared table in schema/fixtures/prototype-links/clicks.json
// holds both to it). The listener is on the window's capture phase and registered before the
// canvas's own scripts run, so a canvas stopping the click's propagation cannot keep it from us. The
// click's target is the one the window sees, so a link inside a shadow root (retargeted to its host)
// or a nested iframe (its clicks never reach this window) does nothing. A value over 200 UTF-16 units
// is posted as null, as the window's script does; the page follows neither it nor a value naming no
// frame of its group.
//
// Only the canvas cancelling the click stops it, judged as the window's script judges it: by the
// final defaultPrevented, after a 0 ms timer. So isolate.js never cancels such a click itself. Yet the
// browser must not follow the link's own href (another document, or a fragment a srcdoc document
// resolves against the page's file URL). So the capture listener adds a one-time window listener for
// the click, which runs in the window's bubble phase after every listener the canvas registered
// before the click (each phase invokes a fresh copy of the window's list). It takes every href the
// browser could follow off the nearest <a> or <area> (an SVG link falls back to its XLink href), and
// the browser's activation finds nothing to follow. The timer decides the click first, then puts each
// node back unless the canvas set that href again or moved the node elsewhere meanwhile. Limits: a
// listener the canvas adds during the click that runs after ours sees the link without its href, and
// one that sets the href again there makes the browser follow it, so the frame navigates while the
// link is still followed; a MutationObserver on the href sees it removed and restored; and a canvas
// that stops the click's propagation before the window's bubble phase keeps the href, so the browser
// navigates the frame as it did before, while the link is still followed.
const GOTO_ATTRIBUTE = "data-doan-goto";
const MAX_GOTO = 200;
let playing = null;
// Followed clicks, which the ordinary link handling below leaves alone.
const followed = new WeakSet();
window.addEventListener("click", (event) => {
  const target = event.target;
  if (playing === null || !(target instanceof Element)) return;
  const link = target.closest(`[${GOTO_ATTRIBUTE}]`);
  if (link === null || !playing.contains(link)) return;
  const value = link.getAttribute(GOTO_ATTRIBUTE) ?? "";
  followed.add(event);
  let taken = [];
  // The guard: a click the canvas dispatches from its own handler (a nested click()) reaches this
  // listener before the outer click's bubble phase does.
  const late = (other) => {
    if (other !== event) return;
    window.removeEventListener("click", late);
    taken = takeHref(event);
  };
  window.addEventListener("click", late);
  let decided = false;
  const decide = () => {
    if (decided) return;
    decided = true;
    window.removeEventListener("click", late);
    window.removeEventListener("beforeunload", leaving);
    if (!event.defaultPrevented) post({ goto: value.length <= MAX_GOTO ? value : null });
    for (const { node, attr } of taken) {
      if (attr.ownerElement === null && node.getAttributeNodeNS(attr.namespaceURI, attr.localName) === null) node.setAttributeNode(attr);
    }
  };
  // An href the canvas set again makes the browser leave the document after the dispatch. If that navigation commits
  // first, the timer is gone, and even a message posted just before reaches the viewer with no source, which it
  // refuses. The navigation starts with beforeunload, so the click is decided there, before the request leaves; the
  // dispatch is over by then, so `defaultPrevented` is final. One fired while the click is still being dispatched (a
  // script's own navigation) leaves the decision to the timer.
  const leaving = () => {
    if (event.eventPhase === Event.NONE) decide();
  };
  window.addEventListener("beforeunload", leaving);
  setTimeout(decide, 0);
}, true);

// The nearest <a> or <area> in the click's path, as a browser follows it.
function linkElement(event) {
  for (const node of event.composedPath()) {
    if (node instanceof Element && (node.localName === "a" || node.localName === "area")) return node;
  }
  return null;
}

// A namespace name, not an address: nothing is fetched from it.
const XLINK = "http://www.w3.org/1999/xlink";

// Removes the hrefs a browser follows, the one with no namespace and the XLink one an SVG link falls
// back to (matched by namespace, whatever its prefix), and returns them as attribute nodes, which
// keep their namespace and prefix for the way back. An href in any other namespace is the canvas's.
function takeHref(event) {
  const node = linkElement(event);
  if (node === null) return [];
  const taken = [];
  for (const namespace of [null, XLINK]) {
    const attr = node.getAttributeNodeNS(namespace, "href");
    if (attr === null) continue;
    node.removeAttributeNode(attr);
    taken.push({ node, attr });
  }
  return taken;
}

// Bubble phase, so the canvas's own handlers run first and a handler that checks defaultPrevented
// (a client-side router's link) still sees its own event. A handler that stops propagation keeps
// its default. A followed click is left alone.
window.addEventListener("submit", (event) => {
  event.preventDefault();
});
window.addEventListener("click", (event) => {
  if (event.defaultPrevented || followed.has(event)) return;
  const node = linkElement(event);
  const href = node?.getAttribute("href") ?? node?.getAttribute("xlink:href") ?? null;
  if (href === null) return;
  event.preventDefault();
  // A srcdoc document resolves "#id" against the page's file URL, not its own, so the browser's
  // own handling leaves it: WebKit loads the page around the frame into the frame, and Chromium
  // drops the click. Setting the hash moves within the document, as the link would in the app.
  if (sameDocument(href)) location.hash = href;
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
      :root { --doan-viewport-height: 100vh !important; }
      @supports (height: 100dvh) { :root { --doan-viewport-height: 100dvh !important; } }
    `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

// At DOMContentLoaded, or after the `load` handlers when the frame is not there yet, as the app's
// prototype window finds it. When there is not exactly one frame with the id after the `load`
// handlers, the document is watched for up to LATE_FRAME_MS, as prototypeScript.ts watches it: the
// frame plays as soon as it is the only one, else the state when the time is up is reported. The run
// script after this one waits as long, so its links follow a frame the run script finds late. That
// script also reads the mark, which this one does not, so the player's verdict stays the run script's.
// prototypeScript.ts waits as long (exportViewer.test.ts compares the literals).
const LATE_FRAME_MS = 2000;
const targets = () => Array.from(document.querySelectorAll("[data-doan-frame]")).filter((el) => el.getAttribute("data-doan-frame") === FRAME);
function report(matches) {
  if (matches.length === 1) {
    isolate(matches[0]);
    playing = matches[0];
    post({ state: "ready" });
  } else post({ state: "missing" });
}
function settle() {
  if (targets().length === 1) return report(targets());
  const observer = new MutationObserver(() => {
    const matches = targets();
    if (matches.length !== 1) return;
    observer.disconnect();
    clearTimeout(timer);
    report(matches);
  });
  const timer = setTimeout(() => {
    observer.disconnect();
    report(targets());
  }, LATE_FRAME_MS);
  observer.observe(document, { childList: true, subtree: true, attributeFilter: ["data-doan-frame"] });
}
const afterLoad = (then) => window.addEventListener("load", () => setTimeout(then, 0), { once: true });
const atContentLoaded = () => {
  const matches = targets();
  if (matches.length === 0) afterLoad(settle);
  else report(matches);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atContentLoaded, { once: true });
else if (document.readyState === "interactive") atContentLoaded();
else setTimeout(settle, 0);
