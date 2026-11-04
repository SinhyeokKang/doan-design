// The script main runs inside each canvas iframe (WebFrameMain.executeJavaScript).
// It is shipped as the source text of the functions below, so every function
// here must be self-contained: no imports, no module-level names, nothing the
// bundler could hoist out. `canvasScript` gets the helpers as an argument
// instead, which keeps the helpers unit-testable on their own. It runs in the
// canvas's main world, so the canvas can see and fake everything it posts
// (the renderer validates it, design flow 5).

export interface HeightState {
  sent: number;
  inner: number;
  frozen: boolean;
  fonts: number;
}

// `min-height: 100vh` style canvases grow with the iframe we resize to fit
// them. Right after our own resize (the viewport became the height we sent),
// a document that still outgrows the viewport is chasing it, so the last sent
// height is kept until this document ends. Not after a sent 0: that was measured
// before the iframe was laid out, and no document chases a 0 px viewport.
// Except once per web font load (`fonts` counts `loadingdone`): a font that
// applies between the first measurement and our resize also grows the document
// right after it, which looks the same as chasing and would cut its bottom off.
// A chasing document then grows once per load and freezes again after the last
// one, so it ends only because a canvas loads finitely many fonts.
export function nextHeight(prev: HeightState | null, measured: number, inner: number, fonts: number): HeightState {
  if (prev === null || prev.fonts !== fonts) return { sent: measured, inner, frozen: false, fonts };
  if (prev.frozen) return prev;
  const ownResize = inner !== prev.inner && Math.abs(inner - prev.sent) <= 1;
  if (ownResize && prev.sent > 0 && measured > inner + 1) return { sent: prev.sent, inner: prev.inner, frozen: true, fonts };
  return { sent: measured, inner, frozen: false, fonts };
}

// Not scrollHeight alone: it never drops below the viewport, so a canvas could
// not shrink. But with `html { height: 100% }` the rect is the viewport and the
// content overflows it, so then only scrollHeight tells the content height.
// Absolutely positioned frames add nothing to the rect, and scrollHeight cannot
// tell their extent from the viewport once the iframe is at least as tall, so
// without their bottom such a canvas alternates between 0 and its extent.
// `framesBottom` already ends clipped frames at their box (frameBottom); the
// cap at scrollHeight only bounds clipping that misses, such as `contain: paint`.
export function documentHeight(rect: number, scrollHeight: number, inner: number, framesBottom: number): number {
  return Math.max(Math.abs(rect - inner) <= 1 && scrollHeight > rect ? scrollHeight : rect, Math.min(Math.ceil(framesBottom), scrollHeight));
}

// One ancestor of a frame, nearest first, up to body. `bottom` is in document
// coordinates and is only read when the ancestor clips.
export interface ClipLink {
  position: string;
  overflowY: string;
  display: string;
  bottom: number;
}


// A frame inside a box that scrolls or clips it shows no further than that box,
// and the box then stands for it in the document's height. An absolutely
// positioned element escapes the static boxes below its containing block, a
// fixed one escapes every box.
export function frameBottom(bottom: number, position: string, ancestors: readonly ClipLink[]): number {
  // Overflow applies to block, flex and grid containers only (CSS Overflow 3
  // §3), but an inline span or a `display: contents` wrapper still computes
  // `overflow: hidden`, so the display decides whether the box clips.
  const noOverflow = /^(inline|contents|none|table-(row|row-group|header-group|footer-group|column|column-group)|ruby.*)$/;
  if (position === "fixed") return bottom;
  let escaping = position === "absolute";
  for (const link of ancestors) {
    const positioned = link.position !== "static";
    if ((!escaping || positioned) && link.overflowY !== "visible" && !noOverflow.test(link.display)) bottom = Math.min(bottom, link.bottom);
    if (link.position === "fixed") return bottom;
    if (positioned) escaping = link.position === "absolute";
  }
  return bottom;
}

export function canScrollAxis(overflow: string, position: number, client: number, size: number, delta: number): boolean {
  if (delta === 0 || size <= client) return false;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  // Fractional scroll offsets can stop just short of the end.
  return delta > 0 ? position + client < size - 0.5 : position > 0;
}

export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

// One step of an element's ancestor chain, the element first and body (or
// html) last. `doanId` and `frameId` are the raw attribute values.
export interface ChainLink {
  tag: string;
  indexOfType: number;
  doanId?: string;
  frameId?: string;
}

export type AnchorAttribute = "data-doan-id" | "data-doan-frame";

// Main later runs this selector with CDP `DOM.querySelector`, which returns the
// first match, so an id only anchors it when `unique` says the document has it
// once; otherwise the path continues up to the next id or to body.
export function elementSelector(chain: readonly ChainLink[], unique: (attribute: AnchorAttribute, value: string) => boolean): string {
  const quote = (value: string) => `"${value.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => (c === "\\" || c === '"' ? `\\${c}` : `\\${c.charCodeAt(0).toString(16)} `))}"`;
  // SVG and custom tags may hold characters a type selector cannot; case is
  // kept because non-HTML type selectors match case-sensitively.
  const ident = (name: string) =>
    Array.from(name, (c, i) => {
      const code = c.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f || (i === 0 && /[0-9]/.test(c))) return `\\${code.toString(16)} `;
      return code >= 0x80 || /[\w-]/.test(c) ? c : `\\${c}`;
    }).join("");
  const steps: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    if (link === undefined) break;
    if (link.doanId !== undefined && unique("data-doan-id", link.doanId)) {
      steps.push(`[data-doan-id=${quote(link.doanId)}]`);
      break;
    }
    if (link.frameId !== undefined && unique("data-doan-frame", link.frameId)) {
      steps.push(`[data-doan-frame=${quote(link.frameId)}]`);
      break;
    }
    if (i === chain.length - 1) {
      steps.push(ident(link.tag));
      break;
    }
    steps.push(`${ident(link.tag)}:nth-of-type(${link.indexOfType})`);
  }
  return steps.reverse().join(" > ");
}

export interface PathStep {
  label: string;
  // Index into the chain the step came from (0 is the element).
  depth: number;
  doanId?: string;
}

// From the nearest frame (or right below body) down to the element, at most
// the 32 steps nearest the element.
export function ancestorPath(chain: readonly ChainLink[]): PathStep[] {
  const frame = chain.findIndex((link) => link.frameId !== undefined);
  const end = Math.min(frame === -1 ? chain.length - 1 : frame + 1, 32);
  const steps: PathStep[] = [];
  for (let depth = 0; depth < end; depth++) {
    const link = chain[depth];
    if (link === undefined) break;
    const step: PathStep = { label: link.frameId || link.doanId || link.tag, depth };
    if (link.doanId !== undefined) step.doanId = link.doanId;
    steps.push(step);
  }
  return steps.reverse();
}

// Code points, as JSON Schema `maxLength` counts them; a pair is never split.
export function clipHtml(html: string, max: number): { html: string; truncated: boolean } {
  let end = 0;
  for (let count = 0; count < max && end < html.length; count++) end += (html.codePointAt(end) ?? 0) > 0xffff ? 2 : 1;
  return end < html.length ? { html: html.slice(0, end), truncated: true } : { html, truncated: false };
}

export function textQuote(text: string, max: number): string {
  const folded = text.replace(/\s+/g, " ").trim();
  let end = 0;
  for (let count = 0; count < max && end < folded.length; count++) end += (folded.codePointAt(end) ?? 0) > 0xffff ? 2 : 1;
  return folded.slice(0, end);
}

interface CanvasLib {
  nextHeight: typeof nextHeight;
  documentHeight: typeof documentHeight;
  frameBottom: typeof frameBottom;
  canScrollAxis: typeof canScrollAxis;
  clipText: typeof clipText;
  elementSelector: typeof elementSelector;
  ancestorPath: typeof ancestorPath;
  clipHtml: typeof clipHtml;
  textQuote: typeof textQuote;
  commentAnchors: typeof commentAnchors;
}

export function canvasScript(lib: CanvasLib): void {
  const MAX_FRAMES = 1000;
  const MAX_STRING = 200;
  const MAX_SELECTOR = 1000;
  const MAX_HTML = 2000;
  const MAX_TEXT = 500;
  const MAX_VALUE = 500;
  const ANCHOR_RETRY_MS = 1000;
  // Each navigation is injected once, but a canvas re-running us must not
  // double every listener.
  const mark = Symbol.for("doan.canvas");
  const marked = window as unknown as Record<symbol, unknown>;
  if (marked[mark]) return;
  marked[mark] = true;

  const post = (message: unknown) => parent.postMessage(message, "*");
  let height: HeightState | null = null;
  let fontLoads = 0;
  let started = false;
  const documentToken = `${Date.now()}-${Math.random()}`;

  const frames = () => {
    const list: { id: string; title?: string; x: number; y: number; width: number; height: number }[] = [];
    let truncated = false;
    const clip = (text: string) => {
      const kept = lib.clipText(text, MAX_STRING);
      if (kept !== text) truncated = true;
      return kept;
    };
    const html = document.documentElement;
    const rootStyle = getComputedStyle(html);
    // body's overflow belongs to the viewport while html's is visible, and then body clips nothing.
    const bodyClips = rootStyle.overflowX !== "visible" || rootStyle.overflowY !== "visible";
    const ancestors = (el: Element) => {
      const links: ClipLink[] = [];
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
      bottom = Math.max(bottom, lib.frameBottom(rect.top + rect.height + scrollY, getComputedStyle(el).position, ancestors(el)));
      if (list.length === MAX_FRAMES) {
        truncated = true;
        continue;
      }
      const frame: (typeof list)[number] = { id: clip(el.getAttribute("data-doan-frame") ?? ""), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
      const title = el.getAttribute("data-doan-title");
      if (title !== null) frame.title = clip(title);
      list.push(frame);
    }
    return { list, truncated, bottom };
  };

  // Selection state. `seq` is the last command seq from the renderer, raised by
  // one on each human click; every selection message echoes it so the renderer
  // can drop answers that a later click or Esc already replaced (design flow 4).
  interface Anchor {
    doanId?: string;
    selector?: string;
    frame?: string;
  }
  type Rect = { x: number; y: number; width: number; height: number };
  let seq = 0;
  // Hover and modifier freshness is independent of selection command validity.
  let hoverSeq = 0;
  let selected: Element | null = null;
  let anchor: Anchor | null = null;
  let pending: Anchor | null = null;
  let pendingTimer = false;
  let firstLayoutAt: number | null = null;
  let hoverEl: EventTarget | null = null;
  let alt = false;
  let hoverQueued = false;
  let lastHover = JSON.stringify([0, null]);
  // Picking (buzz-canvas-conversation design §4): the app's pick-start and pick-cancel commands carry their own seq,
  // which neither clicks nor selection or hover commands move, and name this document's token, so a command meant for
  // the document this one replaced changes nothing here. `picking` is the seq of the pick-start in force. A pick-start
  // is acknowledged with `pick-started`: until then the app keeps clicks away from this document, because a click
  // here would select. A pick click answers `picked` and leaves `selected`, `anchor` and the hover as they were;
  // picking lasts until the app cancels it, so a second click before that cancel arrives answers again instead of
  // selecting.
  let pickSeq = 0;
  let picking: number | null = null;
  // The crosshair while picking: the cursor over the canvas is this document's, so a constructed sheet is adopted. It
  // changes no DOM node, so neither the MutationObserver nor the layout runs for it, and sheets the canvas adopted
  // itself stay as they are.
  let crosshair: CSSStyleSheet | null = null;
  const setPicking = (next: number | null) => {
    picking = next;
    try {
      if (next !== null && crosshair === null && typeof CSSStyleSheet === "function") {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync("*{cursor:crosshair!important}");
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        crosshair = sheet;
      } else if (next === null && crosshair !== null) {
        const sheet = crosshair;
        crosshair = null;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(adopted => adopted !== sheet);
      }
    } catch {
      // The cursor is only a hint: a canvas that broke adoptedStyleSheets still picks, without the crosshair.
    }
  };

  const isRoot = (el: unknown) => el === document.documentElement || el === document.body;
  const isElement = (target: unknown): target is Element => typeof target === "object" && target !== null && "nodeType" in target && target.nodeType === 1;
  const isEditable = (el: Element) => "isContentEditable" in el && el.isContentEditable === true;
  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  const byAttribute = (attribute: string, value: string) => Array.from(document.querySelectorAll(`[${attribute}]`)).filter((el) => el.getAttribute(attribute) === value);
  const postSelection = (type: "select" | "clear" | "key", fields: Record<string, unknown>) => post({ type, href: location.href, seq, viewport: innerHeight, ...fields });

  const describe = (start: Element) => {
    const chain: ChainLink[] = [];
    const nodes: Element[] = [];
    for (let el: Element | null = start; el !== null; el = el.parentElement) {
      let indexOfType = 1;
      for (let sibling = el.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
        if (sibling.localName === el.localName && sibling.namespaceURI === el.namespaceURI) indexOfType++;
      }
      const link: ChainLink = { tag: el.localName, indexOfType };
      const doanId = el.getAttribute("data-doan-id");
      if (doanId !== null) link.doanId = doanId;
      const frameId = el.getAttribute("data-doan-frame");
      if (frameId !== null) link.frameId = frameId;
      chain.push(link);
      nodes.push(el);
      if (isRoot(el)) break;
    }
    const counts = new Map<string, boolean>();
    // Over-long ids are clipped or left out of messages, so they never anchor.
    const unique = (attribute: AnchorAttribute, value: string) => {
      const key = `${attribute}\n${value}`;
      if (!counts.has(key)) counts.set(key, value.length <= MAX_STRING && byAttribute(attribute, value).length === 1);
      return counts.get(key) === true;
    };
    // A selector over the cap cannot be sent, so a very deep element without
    // ids gives way to its nearest ancestor whose selector fits.
    let depth = 0;
    let selector = lib.elementSelector(chain, unique);
    while (selector.length > MAX_SELECTOR) {
      depth++;
      if (depth >= chain.length - 1) return null;
      selector = lib.elementSelector(chain.slice(depth), unique);
    }
    const own = chain.slice(depth);
    const el = nodes[depth];
    if (el === undefined || isRoot(el)) return null;
    const target: Record<string, unknown> = { rect: rectOf(el), tag: lib.clipText(el.localName, MAX_STRING) };
    const frameAt = own.findIndex((link) => link.frameId !== undefined);
    const frameEl = frameAt === -1 ? undefined : nodes[depth + frameAt];
    const frameId = frameEl === undefined ? undefined : lib.clipText(frameEl.getAttribute("data-doan-frame") ?? "", MAX_STRING);
    if (frameEl !== undefined && frameId !== undefined) {
      const frame: Record<string, string> = { id: frameId };
      const title = frameEl.getAttribute("data-doan-title");
      if (title !== null) frame.title = lib.clipText(title, MAX_STRING);
      const implementsPaths = frameEl.getAttribute("data-doan-implements");
      if (implementsPaths !== null) frame.implements = lib.clipText(implementsPaths, MAX_VALUE);
      target.frame = frame;
      const index = Array.from(document.querySelectorAll("[data-doan-frame]")).indexOf(frameEl);
      if (index >= 0 && index < MAX_FRAMES) target.frameIndex = index;
    }
    const doanId = own[0]?.doanId;
    const usableId = doanId !== undefined && doanId.length <= MAX_STRING ? doanId : undefined;
    if (frameAt !== 0) {
      const html = lib.clipHtml(el.outerHTML, MAX_HTML);
      const element: Record<string, unknown> = { selector, html: html.html };
      if (usableId !== undefined) element.doanId = usableId;
      if (html.truncated) element.truncated = true;
      const text = lib.textQuote(el.textContent ?? "", MAX_TEXT);
      if (text !== "") element.text = text;
      target.element = element;
    }
    target.path = lib.ancestorPath(own).map((step) => {
      const item: Record<string, string> = { label: lib.clipText(step.label, MAX_STRING), selector: lib.elementSelector(own.slice(step.depth), unique) };
      if (step.doanId !== undefined && step.doanId.length <= MAX_STRING) item.doanId = step.doanId;
      return item;
    });
    if (el.localName === "a" && el.hasAttribute("href")) target.interactive = "link";
    else if (["button", "input", "select", "textarea"].includes(el.localName) || isEditable(el)) target.interactive = "control";
    const next: Anchor = { selector };
    if (usableId !== undefined) next.doanId = usableId;
    if (frameAt === 0 && frameId !== undefined) next.frame = frameId;
    return { el, anchor: next, target };
  };

  const anchors = lib.commentAnchors(documentToken, () => {
    // Anchor measurement can precede layout's recovery in the same frame.
    // Leave a missing node for layout to report as a lost selection.
    if (selected && !selected.isConnected && anchor) selected = resolve(anchor) ?? selected;
    return { element: selected, seq };
  });

  const resolve = (wanted: Anchor): Element | null => {
    if (wanted.doanId !== undefined) {
      const found = byAttribute("data-doan-id", wanted.doanId);
      if (found.length === 1 && found[0] !== undefined) return found[0];
    }
    if (wanted.selector !== undefined) {
      try {
        const found = document.querySelector(wanted.selector);
        if (found !== null) return found;
      } catch {
        // The selector came back from the renderer and may be malformed; that
        // is the same as not finding it.
      }
    }
    if (wanted.frame !== undefined) return byAttribute("data-doan-frame", wanted.frame)[0] ?? null;
    return null;
  };

  const postHover = () => {
    const el = hoverEl;
    const rect = isElement(el) && !isRoot(el) && el !== selected && !alt ? rectOf(el) : null;
    const key = JSON.stringify([hoverSeq, rect]);
    if (key === lastHover) return;
    lastHover = key;
    post({ type: "hover", href: location.href, seq: hoverSeq, viewport: innerHeight, rect });
  };

  // `answer` names the renderer command this selection answers. A click can
  // take a queued command's seq before it arrives, so seq alone cannot tell
  // that click from the answer; clicks never carry it.
  type Answer = "select-anchor";
  const apply = (described: NonNullable<ReturnType<typeof describe>>, answer?: Answer) => {
    selected = described.el;
    anchor = described.anchor;
    pending = null;
    postSelection("select", answer === undefined ? { target: described.target } : { target: described.target, answer });
    postHover();
    anchors.schedule();
  };

  const drop = () => {
    selected = null;
    anchor = null;
    pending = null;
    anchors.schedule();
  };

  const postPicked = (fields: Record<string, unknown>) => post({ type: "picked", href: location.href, document: documentToken, pick: picking, ...fields });
  const inFrame = (el: Element) => {
    for (let node: Element | null = el; node !== null; node = node.parentElement) if (node.hasAttribute("data-doan-frame")) return true;
    return false;
  };
  // A click picks what it lands on, as the select message would describe it: a frame's own background is the frame, an
  // element (or a nested iframe) is that element. A Shift-click picks the spot instead, whatever is under it: its
  // point goes in the document's coordinates, which the app turns into an offset from the innermost frame there.
  // Anything outside every frame (the document, a frame's sibling, a wrapper, a nested iframe there) answers nothing,
  // and picking goes on: an agent can only be pointed at frames and what is in them.
  const pickAt = (target: EventTarget | null, point: { x: number; y: number } | null) => {
    if (!isElement(target) || !target.isConnected || isRoot(target) || !inFrame(target)) return;
    if (point !== null) {
      postPicked({ point: { x: point.x + scrollX, y: point.y + scrollY } });
      return;
    }
    const described = describe(target);
    if (described !== null) postPicked({ target: described.target });
  };

  // Human input raises seq so a renderer command already on its way loses.
  const choose = (target: EventTarget | null) => {
    if (!isElement(target)) return;
    if (isRoot(target)) {
      drop();
      seq++;
      postSelection("clear", {});
      postHover();
      return;
    }
    const described = describe(target);
    if (described === null) return;
    seq++;
    apply(described);
  };

  // An anchor sent after a reload may name an element the canvas's own script
  // has not drawn yet, so it is retried until 1 s after the first layout and
  // the document's load, then answered with null (design flow 6).
  const tryPending = () => {
    if (pending === null) return;
    const found = resolve(pending);
    const described = found === null ? null : describe(found);
    if (described !== null) {
      apply(described, "select-anchor");
      return;
    }
    const deadline = (firstLayoutAt ?? performance.now()) + ANCHOR_RETRY_MS;
    if (performance.now() >= deadline) {
      if (document.readyState !== "complete") return;
      drop();
      postSelection("select", { target: null, answer: "select-anchor" });
      postHover();
      return;
    }
    if (pendingTimer) return;
    pendingTimer = true;
    setTimeout(() => {
      pendingTimer = false;
      tryPending();
    }, deadline - performance.now());
  };

  const send = () => {
    if (firstLayoutAt === null) firstLayoutAt = performance.now();
    tryPending();
    const html = document.documentElement;
    const { list, truncated, bottom } = frames();
    const measured = lib.documentHeight(Math.ceil(html.getBoundingClientRect().height), html.scrollHeight, innerHeight, bottom);
    height = lib.nextHeight(height, measured, innerHeight, fontLoads);
    // `viewport` lets the renderer drop a layout measured before its last
    // resize of the iframe reached this document.
    const message: Record<string, unknown> = { type: "layout", document: documentToken, href: location.href, height: height.sent, viewport: innerHeight, frames: list, truncated };
    if (selected !== null) {
      // A framework may swap the node for an equal one; look once more by the
      // same anchor before giving the selection up.
      if (!selected.isConnected) selected = anchor === null ? null : resolve(anchor);
      if (selected === null) anchor = null;
      message.seq = seq;
      message.selected = selected === null ? null : rectOf(selected);
    }
    post(message);
  };

  let queued = false;
  const schedule = () => {
    anchors.schedule();
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      send();
    });
  };

  // The first layout and measure replies skip rAF: an iframe outside the
  // viewport gets no animation frames, so a batched reply would never come.
  const start = () => {
    started = true;
    const resized = new ResizeObserver(schedule);
    resized.observe(document.documentElement);
    if (document.body) resized.observe(document.body);
    new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener("resize", schedule);
    addEventListener("load", schedule);
    addEventListener("load", tryPending);
    // Inner scrollers move the selected element without resizing anything.
    addEventListener("scroll", schedule, { capture: true, passive: true });
    void document.fonts.ready.then(() => {
      schedule();
      tryPending();
    });
    send();
  };

  // Not `ready`: it may already be resolved here, which would count as a load
  // before the first measurement and miss the first freeze of a chasing document.
  // Registered before `measure` is answered, so a load after an early measure
  // still counts. Sent without rAF: an off-screen iframe gets no animation
  // frames, and after a confirming layout the renderer pulls no more measures.
  document.fonts.addEventListener("loadingdone", () => {
    fontLoads++;
    if (!started) return;
    anchors.schedule();
    send();
  });

  const optionalString = (value: unknown) => value === undefined || typeof value === "string";
  const command = (data: Record<string, unknown>) => {
    const next = data.seq;
    if (typeof next !== "number" || !Number.isInteger(next)) return;
    const { type, frame, doanId, selector, index, id } = data;
    if (type === "pick-start" || type === "pick-cancel") {
      if (data.document !== documentToken || next <= pickSeq) return;
      pickSeq = next;
      setPicking(type === "pick-start" ? next : null);
      if (picking !== null) post({ type: "pick-started", href: location.href, document: documentToken, pick: picking });
      return;
    }
    if (type === "select-anchor") {
      if (!optionalString(frame) || !optionalString(doanId) || !optionalString(selector)) return;
      if (frame === undefined && doanId === undefined && selector === undefined) return;
    } else if (type === "pick-frame") {
      if (typeof index !== "number" || !Number.isInteger(index) || typeof id !== "string") return;
    } else if (type === "hover-alt") {
      if (typeof data.alt !== "boolean") return;
    } else if (type !== "clear" && type !== "hover-leave") return;
    if (type === "hover-alt" || type === "hover-leave") {
      if (next <= hoverSeq) return;
      hoverSeq = next;
    } else {
      // Not newer: a click here already moved past this selection command.
      if (next <= seq) return;
      seq = next;
    }
    if (type === "hover-alt") {
      alt = data.alt === true;
      postHover();
    } else if (type === "hover-leave") {
      hoverEl = null;
      lastHover = "";
    } else if (type === "clear") {
      drop();
      postHover();
    } else if (type === "select-anchor") {
      const wanted: Anchor = {};
      if (typeof frame === "string") wanted.frame = frame;
      if (typeof doanId === "string") wanted.doanId = doanId;
      if (typeof selector === "string") wanted.selector = selector;
      pending = wanted;
      tryPending();
    } else if (typeof index === "number") {
      const el = document.querySelectorAll("[data-doan-frame]")[index];
      if (el === undefined || lib.clipText(el.getAttribute("data-doan-frame") ?? "", MAX_STRING) !== id) return;
      const described = describe(el);
      if (described !== null) apply(described);
    }
  };

  addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) return;
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    if ((data as { type?: unknown }).type === "measure") send();
    else command(data as Record<string, unknown>);
  });

  // The document's own scroll (before the height fits) is not an inner scroller:
  // a wheel there pans the board.
  const scrollsFurther = (target: EventTarget | null, dx: number, dy: number) => {
    // nodeType, not instanceof: a wheel can target the document itself.
    let node = target as Element | null;
    for (; node && node.nodeType === 1 && node !== document.documentElement && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (lib.canScrollAxis(style.overflowY, node.scrollTop, node.clientHeight, node.scrollHeight, dy)) return true;
      if (lib.canScrollAxis(style.overflowX, node.scrollLeft, node.clientWidth, node.scrollWidth, dx)) return true;
    }
    return false;
  };

  addEventListener(
    "wheel",
    (event: WheelEvent) => {
      // The element under the cursor changes without a pointermove, so the
      // hover waits for the next one.
      hoverEl = null;
      postHover();
      const zoom = event.ctrlKey || event.metaKey;
      if (!zoom && scrollsFurther(event.target, event.deltaX, event.deltaY)) return;
      event.preventDefault();
      post({ type: "wheel", dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode, x: event.clientX + scrollX, y: event.clientY + scrollY });
    },
    { passive: false, capture: true },
  );

  // Input direction (design flow 1): a plain primary press is selection and
  // never reaches the canvas, so links, buttons, inputs, text selection and
  // :focus stay inert. ⌥ passes through. Only trusted input counts: a canvas's
  // own `el.click()` keeps working as before. Right and Ctrl presses must
  // prevent focus too, but their clicks never select.
  const linkOf = (target: EventTarget | null) => {
    for (let el = isElement(target) ? target : null; el !== null; el = el.parentElement) {
      if (el.localName === "a" && el.hasAttribute("href")) return el;
    }
    return null;
  };
  for (const type of ["pointerdown", "mousedown", "click", "dblclick"] as const) {
    addEventListener(
      type,
      (event: MouseEvent) => {
        if (!event.isTrusted) return;
        // Every press, ⌥, right and Ctrl included, tells the app the canvas was pressed: the app's document never sees
        // a press inside this frame, and its open lists close on a press anywhere outside them.
        if (type === "pointerdown") post({ type: "press" });
        if (type !== "pointerdown" && (event.button !== 0 || event.ctrlKey)) return;
        // ⌥ picks like a plain click while picking, so nothing reaches the canvas then.
        if (event.altKey && picking === null) {
          // Chromium turns an ⌥-clicked link into a download, which the
          // sandbox does not stop; navigating here still passes main's gate.
          const link = type === "click" ? linkOf(event.target) : null;
          if (link !== null) {
            event.preventDefault();
            const href = link.getAttribute("href") ?? "";
            if (link.isConnected && link.getAttribute("href") === href) location.assign(href);
          }
          return;
        }
        // preventDefault on pointerdown also suppresses mousedown and mouseup.
        event.preventDefault();
        event.stopPropagation();
        if (type === "pointerdown") {
          // Focus left inside by an ⌥-click would make Esc look like typing.
          const active = document.activeElement;
          if (active !== null && !isRoot(active) && "blur" in active && typeof active.blur === "function") active.blur();
        } else if (type === "click" && picking !== null) {
          pickAt(event.target, event.shiftKey ? { x: event.clientX, y: event.clientY } : null);
        } else if (type === "click") {
          const target = event.target;
          if (!isElement(target) || target.isConnected) choose(target);
        }
      },
      { capture: true },
    );
  }

  let spaceHeld = false;

  // A nested iframe has no script of ours; a click inside it only shows here
  // as focus moving into it.
  addEventListener("blur", () => {
    if (spaceHeld) {
      spaceHeld = false;
      postSelection("key", { key: "Space", down: false });
    }
    setTimeout(() => {
      const active = document.activeElement;
      if (active === null || !["iframe", "frame", "object", "embed"].includes(active.localName)) return;
      // The press itself happened in the nested document, out of this script's sight; focus moving in is all of it
      // that shows here, so it is the press the app hears. A second press in the same nested frame moves no focus
      // and goes unheard.
      post({ type: "press" });
      if (picking !== null) {
        if (active.isConnected) pickAt(active, null);
        return;
      }
      if (alt) return;
      if (active.isConnected) choose(active);
    }, 0);
  });

  addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (alt !== event.altKey) postSelection("key", { key: "Alt", alt: event.altKey, seq: hoverSeq });
      alt = event.altKey;
      hoverEl = event.target;
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        postHover();
      });
    },
    { capture: true, passive: true },
  );
  addEventListener(
    "pointerout",
    (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      hoverEl = null;
      postHover();
    },
    { capture: true, passive: true },
  );

  // Focus is in this canvas only after an ⌥-click into it; then keys land
  // here instead of the app's keydown.
  const editable = (target: EventTarget | null) => isElement(target) && (["input", "textarea", "select"].includes(target.localName) || isEditable(target));
  const toolKeyAllowed = (event: KeyboardEvent) => !event.isComposing && event.keyCode !== 229 && !event.metaKey && !event.ctrlKey && !event.altKey && !editable(event.target);
  addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        alt = true;
        postSelection("key", { key: "Alt", alt, seq: hoverSeq });
        postHover();
      }
      if (toolKeyAllowed(event)) {
        if (event.code === "Space") {
          event.preventDefault();
          if (!event.repeat) {
            spaceHeld = true;
            postSelection("key", { key: "Space", down: true });
          }
        } else if (!event.repeat && (event.code === "KeyV" || event.code === "KeyH")) {
          postSelection("key", { key: event.code === "KeyV" ? "V" : "H" });
        }
      }
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
      // Esc while picking cancels only the pick, wherever focus is in the canvas; the selection stays.
      if (picking !== null) {
        event.preventDefault();
        postPicked({ cancelled: true });
        setPicking(null);
        return;
      }
      if (!editable(event.target)) postSelection("key", { key: "Escape" });
    },
    { capture: true },
  );
  addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (event.code === "Space") {
        if (!editable(event.target) && (spaceHeld || toolKeyAllowed(event))) event.preventDefault();
        // Focus and modifiers can change between the press and release.
        spaceHeld = false;
        postSelection("key", { key: "Space", down: false });
      }
      if (event.key !== "Alt") return;
      alt = false;
      postSelection("key", { key: "Alt", alt, seq: hoverSeq });
      postHover();
    },
    { capture: true },
  );

  // Injection happens at did-frame-navigate, while the document is still loading.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function canvasScriptSource(): string {
  const lib = { nextHeight, documentHeight, frameBottom, canScrollAxis, clipText, elementSelector, ancestorPath, clipHtml, textQuote, commentAnchors };
  return `(${canvasScript.toString()})({${Object.entries(lib).map(([name, fn]) => `${name}: ${fn.toString()}`).join(", ")}}); void 0;`;
}


// Kept self-contained because this function is serialized into the sandbox.
export function commentAnchors(documentToken: string, selected: () => { element: Element | null; seq: number }) {
  type Query = { id: string; doanId?: string; selector?: string; frame?: string };
  let query: { generation: number; request: number; targets: Query[] } | null = null;
  let revision = 0;
  let queued = false;
  let nextNode = 0;
  const tokens = new WeakMap<Element, string>();
  let nodes = new Map<string, Element>();
  const token = (el: Element) => {
    let id = tokens.get(el);
    if (id === undefined) { id = `n${++nextNode}`; tokens.set(el, id); }
    return id;
  };
  const measure = () => {
    if (query === null) return;
    nodes = new Map();
    const styles = new Map<Element, CSSStyleDeclaration>();
    const styleOf = (el: Element) => {
      let style = styles.get(el);
      if (!style) { style = getComputedStyle(el); styles.set(el, style); }
      return style;
    };
    const attributes = new Map<string, Map<string, Element[]>>();
    const attribute = (name: string, value: string) => {
      let index = attributes.get(name);
      if (!index) {
        index = new Map(); attributes.set(name, index);
        for (const el of document.querySelectorAll(`[${name}]`)) {
          const key = el.getAttribute(name) ?? "";
          const list = index.get(key) ?? []; list.push(el); index.set(key, list);
        }
      }
      return index.get(value) ?? [];
    };
    const ids = (elements: Iterable<Element>) => Array.from(elements, el => {
      const id = token(el); nodes.set(id, el); return id;
    });
    const selectors = new Map<string, string[] | null>();
    const results = query.targets.map(target => {
      const candidates: { doanId?: string[]; selector?: string[] | null; frame?: string[] } = {};
      // Compared as an attribute value, never spliced into a selector: a reply chip's id is untrusted text.
      if (target.doanId !== undefined) candidates.doanId = ids(attribute("data-doan-id", target.doanId));
      if (target.selector !== undefined) {
        if (!selectors.has(target.selector)) {
          try { selectors.set(target.selector, ids(document.querySelectorAll(target.selector))); }
          catch { selectors.set(target.selector, null); }
        }
        candidates.selector = selectors.get(target.selector) ?? null;
      } else if (target.frame !== undefined) candidates.frame = ids(attribute("data-doan-frame", target.frame));
      return { id: target.id, candidates };
    });
    const rects = Array.from(nodes, ([node, el]) => {
      const rect = el.getBoundingClientRect();
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
        const style = styleOf(ancestor);
        if (style.display === "none" || style.opacity === "0" ||
          ancestor === el && (style.visibility === "hidden" || style.visibility === "collapse")) right = left;
        if (ancestor === el) continue;
        const clipX = ["hidden", "clip", "auto", "scroll", "overlay"].includes(style.overflowX);
        const clipY = ["hidden", "clip", "auto", "scroll", "overlay"].includes(style.overflowY);
        if (!clipX && !clipY) continue;
        const box = ancestor.getBoundingClientRect();
        const html = ancestor as HTMLElement;
        const sx = html.offsetWidth ? box.width / html.offsetWidth : 1;
        const sy = html.offsetHeight ? box.height / html.offsetHeight : 1;
        const x = box.left + ancestor.clientLeft * sx, y = box.top + ancestor.clientTop * sy;
        if (clipX) { left = Math.max(left, x); right = Math.min(right, x + ancestor.clientWidth * sx); }
        if (clipY) { top = Math.max(top, y); bottom = Math.min(bottom, y + ancestor.clientHeight * sy); }
      }
      return { node, x: rect.left, y: rect.top, width: rect.width, height: rect.height,
        clip: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) } };
    });
    const current = selected();
    parent.postMessage({ type: "anchors", href: location.href, document: documentToken,
      generation: query.generation, request: query.request, revision: ++revision,
      viewport: innerHeight, width: innerWidth, results, rects,
      selected: current.element?.isConnected ? token(current.element) : null, selectionSeq: current.seq }, "*");
  };
  const schedule = () => {
    if (query === null || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; measure(); });
  };
  addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent || !event.data || event.data.type !== "anchors-query") return;
    const data = event.data;
    if (data.document !== documentToken || !Number.isSafeInteger(data.generation) || data.generation < 0 ||
      !Number.isSafeInteger(data.request) || data.request < 0 || !Array.isArray(data.targets)) return;
    if (query && (data.generation < query.generation || data.generation === query.generation && data.request <= query.request)) return;
    const targets: Query[] = [];
    const seen = new Set<string>();
    for (const item of data.targets) {
      if (!item || typeof item.id !== "string" || seen.has(item.id) ||
        [item.doanId, item.selector, item.frame].some(value => value !== undefined && typeof value !== "string")) return;
      seen.add(item.id);
      targets.push({ id: item.id, ...(item.doanId === undefined ? {} : { doanId: item.doanId }),
        ...(item.selector === undefined ? {} : { selector: item.selector }), ...(item.frame === undefined ? {} : { frame: item.frame }) });
    }
    query = { generation: data.generation, request: data.request, targets };
    // Answered at once, like the first layout: an iframe outside the viewport gets no animation frames. Later
    // changes still batch on one.
    measure();
  });
  return { schedule };
}
