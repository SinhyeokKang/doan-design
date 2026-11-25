// Injected into the run's canvas document before its own scripts and serialized with toString(), so self-contained.
// Placement, late frames and link clicks follow ARCHITECTURE §3 'Prototype window'.
export function prototypeScript(target: string, gen: number, url: string): void {
  // Only the prototype window's direct child, and only the run's own document: a nested iframe or a document the
  // canvas moved to (the navigation gate refuses those anyway) gets nothing.
  if (window === window.top || window.parent !== window.top || location.href !== new URL(url).href) return;
  const once = Symbol.for("doan.prototype");
  const marked = window as unknown as Record<symbol, unknown>;
  if (marked[once]) return;
  marked[once] = true;

  // The same literal as mark.ts's MARK: ASCII digits, no leading zero, one lowercase `x`, nothing trimmed.
  const MARK = /^([1-9][0-9]{0,4})x([1-9][0-9]{0,4})$/;
  const MARK_ATTRIBUTE = "data-doan-prototype";
  // requests.ts refuses a report past these (MAX_REPORT_STRING, MAX_REPORT_FRAMES): an ID over the cap cannot be
  // selected on the board either, so it is left out rather than cut.
  const MAX_STRING = 200;
  const MAX_FRAMES = 1000;
  // requests.ts's MAX_REPORT_GOTOS. Its MAX_GOTO_FRAMES needs no check here: only the first 1,000 frames enclose.
  const MAX_GOTOS = 1000;
  const GOTO_ATTRIBUTE = "data-doan-goto";
  // isolate.js waits as long (exportViewer.test.ts compares the literals).
  const LATE_FRAME_MS = 2000;
  const post = (message: unknown) => parent.postMessage(message, "*");
  const frameId = (el: Element) => el.getAttribute("data-doan-frame") ?? "";
  // querySelectorAll does not reach into <template> content, so frames there are not frames, as in the board.
  const frames = () => Array.from(document.querySelectorAll("[data-doan-frame]"));

  const clip = (text: string) => {
    if (text.length <= MAX_STRING) return text;
    const last = text.charCodeAt(MAX_STRING - 1);
    return text.slice(0, last >= 0xd800 && last <= 0xdbff ? MAX_STRING - 1 : MAX_STRING);
  };

  // Frames with a unique, non-empty ID and a valid mark, numbered as the board's frame drawer numbers them. Only the
  // first 1,000 frames can be listed, the board's limit; an ID is still judged shared over all frames.
  const list = () => {
    const all = frames();
    const counts = new Map<string, number>();
    for (const el of all) counts.set(frameId(el), (counts.get(frameId(el)) ?? 0) + 1);
    const listed: { id: string; title?: string; size: string; number: number }[] = [];
    all.forEach((el, index) => {
      const id = frameId(el);
      const size = el.getAttribute(MARK_ATTRIBUTE) ?? "";
      if (index >= MAX_FRAMES || id === "" || id.length > MAX_STRING || counts.get(id) !== 1 || !MARK.test(size)) return;
      const title = el.getAttribute("data-doan-title");
      listed.push({ id, ...(title === null ? {} : { title: clip(title) }), size, number: index + 1 });
    });
    return listed;
  };

  // The links the drawer groups frames by, in document order. Over a cap a value or id is left out, never cut, so the
  // groups computed from what is left match those of the raw document as far as the run can play them.
  const gotos = () => {
    // Frames past the 1,000th are no link's enclosing frames, as on the board, which does not list them.
    const firstFrames = new Set(frames().slice(0, MAX_FRAMES));
    const reported: { value: string; frames: string[] }[] = [];
    for (const el of Array.from(document.querySelectorAll(`[${GOTO_ATTRIBUTE}]`))) {
      if (reported.length === MAX_GOTOS) break;
      const value = el.getAttribute(GOTO_ATTRIBUTE) ?? "";
      if (value.length > MAX_STRING) continue;
      const around: string[] = [];
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        if (firstFrames.has(node) && frameId(node).length <= MAX_STRING) around.push(frameId(node));
      }
      reported.push({ value, frames: around.reverse() });
    }
    return reported;
  };

  type Found = { state: "ready"; el: Element; size: string } | { state: "missing" | "duplicate" | "unmarked" | "invalid" };
  const find = (): Found => {
    const matches = frames().filter(el => frameId(el) === target);
    if (matches.length === 0) return { state: "missing" };
    if (matches.length > 1) return { state: "duplicate" };
    const el = matches[0]!;
    const size = el.getAttribute(MARK_ATTRIBUTE);
    if (size === null) return { state: "unmarked" };
    if (!MARK.test(size)) return { state: "invalid" };
    return { state: "ready", el, size };
  };

  // These never draw, so they stay as they are; hiding a <style> would not stop it applying anyway.
  const KEEP = new Set(["HEAD", "SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "TITLE", "NOSCRIPT"]);
  const isolate = (el: Element) => {
    for (let node: Element = el; node.parentElement !== null; node = node.parentElement) {
      const parentEl = node.parentElement;
      parentEl.setAttribute("data-doan-proto-path", "");
      for (const sibling of Array.from(parentEl.children)) {
        if (sibling !== node && !KEEP.has(sibling.tagName.toUpperCase())) sibling.setAttribute("data-doan-proto-hidden", "");
      }
    }
    el.setAttribute("data-doan-proto-frame", "");
    // An adopted sheet with !important beats the canvas's own stylesheet rules (not its inline !important ones).
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      [data-doan-proto-hidden] { display: none !important; }
      [data-doan-proto-path] { display: block !important; position: static !important; inset: auto !important; float: none !important;
        margin: 0 !important; padding: 0 !important; border: 0 !important; gap: 0 !important;
        width: auto !important; min-width: 0 !important; max-width: none !important;
        height: auto !important; min-height: 0 !important; max-height: none !important;
        transform: none !important; translate: none !important; scale: none !important; rotate: none !important; zoom: 1 !important;
        filter: none !important; contain: none !important; overflow: visible !important; columns: auto !important; }
      [data-doan-proto-clear][data-doan-proto-path], [data-doan-proto-clear] [data-doan-proto-path] {
        background: none !important; box-shadow: none !important; outline: none !important; }
      [data-doan-proto-frame] { position: relative !important; inset: auto !important; float: none !important; margin: 0 !important;
        transform: none !important; translate: none !important; scale: none !important; rotate: none !important; zoom: 1 !important;
        width: 100% !important; min-width: 0 !important; max-width: none !important; min-height: 100vh !important; box-sizing: border-box !important; }
      :root { --doan-viewport-height: 100vh !important; }
      @supports (height: 100dvh) { :root { --doan-viewport-height: 100dvh !important; } }
    `);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    judge(el);
    // A linked stylesheet with no script after it may still be loading at DOMContentLoaded, so the frame's background
    // is read again once the `load` handlers have run.
    if (document.readyState !== "complete") afterLoad(() => judge(el));
  };

  // A frame that paints its own opaque background is the whole picture, so its ancestors' paint must not show around its
  // rounded corners. Only ever added; the root and the body are not judged when they are the frame.
  const judge = (el: Element) => {
    if (el === document.documentElement || el === document.body) return;
    if (ownBackground(getComputedStyle(el).backgroundColor)) document.documentElement.setAttribute("data-doan-proto-clear", "");
  };
  // Chromium writes the alpha after "/" or as rgba()/hsla()'s fourth argument, and omits it at 1. A background image or
  // a detached frame's "" never counts. isolate.js holds the same body (exportViewer.test.ts compares them).
  function ownBackground(color: string): boolean {
    if (color === "" || color === "transparent") return false;
    const slash = color.lastIndexOf("/");
    let alpha = "1";
    if (slash >= 0) alpha = color.slice(slash + 1).replace(")", "").trim();
    else if (/^(rgba|hsla)\(/.test(color)) alpha = (color.slice(color.indexOf("(") + 1, -1).split(",")[3] ?? "1").trim();
    const value = alpha === "none" ? 0 : alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
    return value === 1;
  }

  let playing: Element | null = null;
  window.addEventListener("click", event => {
    const target = event.target;
    if (playing === null || !(target instanceof Element)) return;
    const link = target.closest(`[${GOTO_ATTRIBUTE}]`);
    if (link === null || !playing.contains(link)) return;
    const value = link.getAttribute(GOTO_ATTRIBUTE) ?? "";
    setTimeout(() => {
      if (!event.defaultPrevented) post({ gen, goto: value.length <= MAX_STRING ? value : null });
    }, 0);
  }, true);

  const report = (found: Found) => {
    if (found.state === "ready") {
      isolate(found.el);
      playing = found.el;
      post({ gen, state: "ready", size: found.size, frames: list(), gotos: gotos() });
    } else post({ gen, state: found.state, frames: list(), gotos: gotos() });
  };
  // A frame that cannot play once the `load` handlers have run gets LATE_FRAME_MS to become playable. The observer
  // hands over each task's changes at once, so a burst of changes is judged once; it and the timer end with the report.
  const settle = () => {
    const now = find();
    if (now.state === "ready") return report(now);
    const observer = new MutationObserver(() => {
      const found = find();
      if (found.state !== "ready") return;
      observer.disconnect();
      clearTimeout(timer);
      report(found);
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      report(find());
    }, LATE_FRAME_MS);
    observer.observe(document, { childList: true, subtree: true, attributeFilter: ["data-doan-frame", MARK_ATTRIBUTE] });
  };
  // After the `load` handlers: a 0 ms timer queued from a `load` listener runs once every listener has run.
  const afterLoad = (then: () => void) => window.addEventListener("load", () => setTimeout(then, 0), { once: true });
  const atContentLoaded = () => {
    // A frame not there yet may still come; one there in any other state is reported now.
    const found = find();
    if (found.state === "missing") return afterLoad(settle);
    report(found);
    afterLoad(() => post({ gen, frames: list(), gotos: gotos() }));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atContentLoaded, { once: true });
  else if (document.readyState === "interactive") atContentLoaded();
  else setTimeout(settle, 0);
}

export function prototypeScriptSource(target: string, gen: number, url: string): string {
  return `(${prototypeScript.toString()})(${JSON.stringify(target)}, ${JSON.stringify(gen)}, ${JSON.stringify(url)}); void 0;`;
}
