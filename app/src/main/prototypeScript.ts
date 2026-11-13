// The script the prototype window injects into its run's canvas document, before the canvas's own scripts. It is
// serialized with toString() and must stay self-contained: no imports, no closure over this module. It never runs in
// the board (canvasScript.ts does), so a prototype gets no Select or Picker key and click handling and no iframe
// height growth.
//
// It finds the target frame in the live document at DOMContentLoaded, or after the `load` handlers when it is not
// there yet (frames made while parsing or in `load` handlers count; later ones do not). The whole document stays as it
// is and the frame is placed in the viewport in place: its ancestors lose their layout and their other children are
// hidden, so ancestor selectors, listeners and relative assets keep working. Elements added outside the frame after
// that moment (a modal appended to body) show. One RunMessage goes to the host; when it went out before the `load`
// handlers, one FramesMessage follows them with the drawer list.
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
  const post = (message: unknown) => parent.postMessage(message, "*");
  const frameId = (el: Element) => el.getAttribute("data-doan-frame") ?? "";
  // querySelectorAll does not reach into <template> content, so frames there are not frames, as in the board.
  const frames = () => Array.from(document.querySelectorAll("[data-doan-frame]"));

  const clip = (text: string) => {
    if (text.length <= MAX_STRING) return text;
    const last = text.charCodeAt(MAX_STRING - 1);
    return text.slice(0, last >= 0xd800 && last <= 0xdbff ? MAX_STRING - 1 : MAX_STRING);
  };

  // The drawer list: frames with a unique, non-empty ID and a valid mark, in document order, numbered by their
  // position among all frames as the board's frame drawer numbers them.
  const list = () => {
    const all = frames();
    const counts = new Map<string, number>();
    for (const el of all) counts.set(frameId(el), (counts.get(frameId(el)) ?? 0) + 1);
    const listed: { id: string; title?: string; size: string; number: number }[] = [];
    all.forEach((el, index) => {
      const id = frameId(el);
      const size = el.getAttribute(MARK_ATTRIBUTE) ?? "";
      if (listed.length === MAX_FRAMES || id === "" || id.length > MAX_STRING || counts.get(id) !== 1 || !MARK.test(size)) return;
      const title = el.getAttribute("data-doan-title");
      listed.push({ id, ...(title === null ? {} : { title: clip(title) }), size, number: index + 1 });
    });
    return listed;
  };

  type Found = { state: "ready"; el: Element; size: string } | { state: "missing" | "duplicate" | "unmarked" | "invalid" };
  const find = (final: boolean): Found | null => {
    const matches = frames().filter(el => frameId(el) === target);
    if (matches.length === 0) return final ? { state: "missing" } : null;
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
      [data-doan-proto-frame] { position: relative !important; inset: auto !important; float: none !important; margin: 0 !important;
        transform: none !important; translate: none !important; scale: none !important; rotate: none !important; zoom: 1 !important;
        width: 100% !important; min-width: 0 !important; max-width: none !important; min-height: 100vh !important; box-sizing: border-box !important; }
    `);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  };

  let done = false;
  const finish = (final: boolean): boolean => {
    if (done) return true;
    const found = find(final);
    if (found === null) return false;
    done = true;
    if (found.state === "ready") {
      isolate(found.el);
      post({ gen, state: "ready", size: found.size, frames: list() });
    } else post({ gen, state: found.state, frames: list() });
    return true;
  };
  // After the `load` handlers: a 0 ms timer queued from a `load` listener runs once every listener has run.
  const afterLoad = (then: () => void) => window.addEventListener("load", () => setTimeout(then, 0), { once: true });
  const atContentLoaded = () => {
    if (finish(false)) afterLoad(() => post({ gen, frames: list() }));
    else afterLoad(() => finish(true));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atContentLoaded, { once: true });
  else if (document.readyState === "interactive") atContentLoaded();
  else setTimeout(() => finish(true), 0);
}

export function prototypeScriptSource(target: string, gen: number, url: string): string {
  return `(${prototypeScript.toString()})(${JSON.stringify(target)}, ${JSON.stringify(gen)}, ${JSON.stringify(url)}); void 0;`;
}
