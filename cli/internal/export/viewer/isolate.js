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
// canvas's own scripts run, so a canvas stopping the click's propagation cannot keep it from us; only
// the canvas cancelling the click stops it. The click's target is the one the window sees, so a link
// inside a shadow root (retargeted to its host) or a nested iframe (its clicks never reach this
// window) does nothing. A value over 200 UTF-16 units is posted as null, as the window's script does;
// the page follows neither it nor a value naming no frame of its group.
//
// A link with nothing of isolate.js's own to cancel (no <a href> around it) is decided by the final
// defaultPrevented, read after a 0 ms timer, as the window's script does.
//
// On an <a href> or <area href> isolate.js must cancel the default itself before the dispatch ends,
// and that must not read as the canvas cancelling. So the capture listener adds a one-time window
// listener for the click, which runs in the window's bubble phase after every canvas listener that
// was there before the click (each phase invokes a fresh copy of the window's list). It records
// defaultPrevented, which holds every cancel made so far, `returnValue = false` and an event handler
// returning false included, then cancels with the native method. From then on that one event's own
// preventDefault and returnValue setter (shadowing Event.prototype's) note a canvas cancel and call
// the native ones, so a cancel from a listener the canvas added during the click still counts. Limits:
// such a listener that is passive counts as a cancel although the browser ignores it, and an event
// handler (an `onclick` property) first set during the click whose `return false` comes after ours
// is not seen. When the bubble phase never reaches the window (the canvas stopped propagation), the
// timer reads defaultPrevented itself and removes the listener, so it never sees a later click.
const GOTO_ATTRIBUTE = "data-doan-goto";
const MAX_GOTO = 200;
// Taken before any canvas script runs.
const nativePreventDefault = Event.prototype.preventDefault;
const nativeReturnValue = Object.getOwnPropertyDescriptor(Event.prototype, "returnValue");
let playing = null;
// Each followed click with an href: whether the canvas cancelled it, null until our listener ran.
const cancelled = new WeakMap();
window.addEventListener("click", (event) => {
  const target = event.target;
  if (playing === null || !(target instanceof Element)) return;
  const link = target.closest(`[${GOTO_ATTRIBUTE}]`);
  if (link === null || !playing.contains(link)) return;
  const value = link.getAttribute(GOTO_ATTRIBUTE) ?? "";
  const follow = () => post({ goto: value.length <= MAX_GOTO ? value : null });
  if (linkHref(event) === null) {
    setTimeout(() => {
      if (!event.defaultPrevented) follow();
    }, 0);
    return;
  }
  // The guard: a click the canvas dispatches from its own handler (a nested click()) reaches this
  // listener before the outer click's bubble phase does.
  const late = (other) => {
    if (other !== event) return;
    window.removeEventListener("click", late);
    cancelled.set(event, event.defaultPrevented);
    // A link followed replaces the whole document, so moving to its fragment first would only leave
    // a history entry behind.
    keepInDocument(event, false);
    watchCancels(event);
  };
  cancelled.set(event, null);
  window.addEventListener("click", late);
  setTimeout(() => {
    window.removeEventListener("click", late);
    delete event.preventDefault;
    delete event.returnValue;
    if (!(cancelled.get(event) ?? event.defaultPrevented)) follow();
  }, 0);
}, true);

// Own properties on the one event, so no other event and no Event.prototype changes. A call counts
// only when the event can be cancelled; the native method or setter still does the work, with the
// caller's receiver, result and exceptions, and the getter stays native.
function watchCancels(event) {
  const counted = (self) => {
    if (self === event && event.cancelable) cancelled.set(event, true);
  };
  Object.defineProperty(event, "preventDefault", {
    configurable: true,
    writable: true,
    value: function preventDefault() {
      counted(this);
      return nativePreventDefault.call(this);
    },
  });
  Object.defineProperty(event, "returnValue", {
    configurable: true,
    get() {
      return nativeReturnValue.get.call(this);
    },
    set(value) {
      if (!value) counted(this);
      nativeReturnValue.set.call(this, value);
    },
  });
}

// The href of the link the click is on, as a browser would follow it: the nearest <a> or <area> in
// the click's path, or null when that has no href or there is none.
function linkHref(event) {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element) || (node.localName !== "a" && node.localName !== "area")) continue;
    return node.getAttribute("href") ?? node.getAttribute("xlink:href");
  }
  return null;
}

// Only links whose written value starts with "#" stay in the document; every other link's default is
// cancelled. Unless the canvas cancelled the click already: a handler that checks defaultPrevented (a
// client-side router's link) still sees its own event.
function keepInDocument(event, moveToFragment) {
  if (event.defaultPrevented) return;
  const href = linkHref(event);
  if (href === null) return;
  // Before watchCancels, if at all, so this is the native method.
  event.preventDefault();
  // A srcdoc document resolves "#id" against the page's file URL, not its own, so the browser's
  // own handling leaves it: WebKit loads the page around the frame into the frame, and Chromium
  // drops the click. Setting the hash moves within the document, as the link would in the app.
  if (moveToFragment && sameDocument(href)) location.hash = href;
}

// Bubble phase, so the canvas's own handlers run first. A handler that stops propagation keeps its
// default. A followed click is left to its own listener above, which runs after the canvas's window
// listeners too.
window.addEventListener("submit", (event) => {
  event.preventDefault();
});
window.addEventListener("click", (event) => {
  if (!cancelled.has(event)) keepInDocument(event, true);
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
    playing = matches[0];
    post({ state: "ready" });
  } else post({ state: "missing" });
  return true;
}
const afterLoad = (then) => window.addEventListener("load", () => setTimeout(then, 0), { once: true });
const atContentLoaded = () => {
  if (!finish(false)) afterLoad(() => finish(true));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atContentLoaded, { once: true });
else if (document.readyState === "interactive") atContentLoaded();
else setTimeout(() => finish(true), 0);
