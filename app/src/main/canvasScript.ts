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
}

// `min-height: 100vh` style canvases grow with the iframe we resize to fit
// them. Right after our own resize (the viewport became the height we sent),
// a document that still outgrows the viewport is chasing it, so the last sent
// height is kept until this document ends.
export function nextHeight(prev: HeightState | null, measured: number, inner: number): HeightState {
  if (prev === null) return { sent: measured, inner, frozen: false };
  if (prev.frozen) return prev;
  const ownResize = inner !== prev.inner && Math.abs(inner - prev.sent) <= 1;
  if (ownResize && measured > inner + 1) return { sent: prev.sent, inner: prev.inner, frozen: true };
  return { sent: measured, inner, frozen: false };
}

// Not scrollHeight alone: it never drops below the viewport, so a canvas could
// not shrink. But with `html { height: 100% }` the rect is the viewport and the
// content overflows it, so then only scrollHeight tells the content height.
export function documentHeight(rect: number, scrollHeight: number, inner: number): number {
  return Math.abs(rect - inner) <= 1 && scrollHeight > rect ? scrollHeight : rect;
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
  canScrollAxis: typeof canScrollAxis;
  clipText: typeof clipText;
  elementSelector: typeof elementSelector;
  ancestorPath: typeof ancestorPath;
  clipHtml: typeof clipHtml;
  textQuote: typeof textQuote;
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

  const frames = () => {
    const list: { id: string; title?: string; x: number; y: number; width: number; height: number }[] = [];
    let truncated = false;
    const clip = (text: string) => {
      const kept = lib.clipText(text, MAX_STRING);
      if (kept !== text) truncated = true;
      return kept;
    };
    for (const el of document.querySelectorAll("[data-doan-frame]")) {
      if (list.length === MAX_FRAMES) {
        truncated = true;
        break;
      }
      const rect = el.getBoundingClientRect();
      const frame: (typeof list)[number] = { id: clip(el.getAttribute("data-doan-frame") ?? ""), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
      const title = el.getAttribute("data-doan-title");
      if (title !== null) frame.title = clip(title);
      list.push(frame);
    }
    return { list, truncated };
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
  let selected: Element | null = null;
  let anchor: Anchor | null = null;
  let pending: Anchor | null = null;
  let pendingTimer = false;
  let firstLayoutAt: number | null = null;
  let hoverEl: EventTarget | null = null;
  let alt = false;
  let hoverQueued = false;
  let lastHover = JSON.stringify([0, null]);

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
    const key = JSON.stringify([seq, rect]);
    if (key === lastHover) return;
    lastHover = key;
    post({ type: "hover", href: location.href, seq, viewport: innerHeight, rect });
  };

  const apply = (described: NonNullable<ReturnType<typeof describe>>) => {
    selected = described.el;
    anchor = described.anchor;
    pending = null;
    postSelection("select", { target: described.target });
    postHover();
  };

  const drop = () => {
    selected = null;
    anchor = null;
    pending = null;
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
      apply(described);
      return;
    }
    const deadline = (firstLayoutAt ?? performance.now()) + ANCHOR_RETRY_MS;
    if (performance.now() >= deadline) {
      if (document.readyState !== "complete") return;
      drop();
      postSelection("select", { target: null });
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
    const measured = lib.documentHeight(Math.ceil(html.getBoundingClientRect().height), html.scrollHeight, innerHeight);
    height = lib.nextHeight(height, measured, innerHeight);
    const { list, truncated } = frames();
    // `viewport` lets the renderer drop a layout measured before its last
    // resize of the iframe reached this document.
    const message: Record<string, unknown> = { type: "layout", href: location.href, height: height.sent, viewport: innerHeight, frames: list, truncated };
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

  const optionalString = (value: unknown) => value === undefined || typeof value === "string";
  const command = (data: Record<string, unknown>) => {
    const next = data.seq;
    if (typeof next !== "number" || !Number.isInteger(next)) return;
    const { type, frame, doanId, selector, index, id } = data;
    if (type === "select-anchor") {
      if (!optionalString(frame) || !optionalString(doanId) || !optionalString(selector)) return;
      if (frame === undefined && doanId === undefined && selector === undefined) return;
    } else if (type === "pick-frame") {
      if (typeof index !== "number" || !Number.isInteger(index) || typeof id !== "string") return;
    } else if (type !== "clear") return;
    // Not newer: a click here already moved past this command.
    if (next <= seq) return;
    seq = next;
    if (type === "clear") {
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
  // own `el.click()` keeps working as before. Right and Ctrl-clicks are left
  // alone for a later context menu.
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
        if (!event.isTrusted || event.button !== 0 || event.ctrlKey) return;
        if (event.altKey) {
          // Chromium turns an ⌥-clicked link into a download, which the
          // sandbox does not stop; navigating here still passes main's gate.
          const link = type === "click" ? linkOf(event.target) : null;
          if (link !== null) {
            event.preventDefault();
            location.assign(link.getAttribute("href") ?? "");
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
        } else if (type === "click") choose(event.target);
      },
      { capture: true },
    );
  }

  // A nested iframe has no script of ours; a click inside it only shows here
  // as focus moving into it.
  addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (alt || active === null || !["iframe", "frame", "object", "embed"].includes(active.localName)) return;
      choose(active);
    }, 0);
  });

  addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (!event.isTrusted) return;
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

  // Focus is in this canvas only after an ⌥-click into it; then Esc lands
  // here instead of the app's keydown.
  const editable = (target: EventTarget | null) => isElement(target) && (["input", "textarea", "select"].includes(target.localName) || isEditable(target));
  addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        alt = true;
        postHover();
      }
      if (event.key === "Escape" && !editable(event.target)) postSelection("key", { key: "Escape" });
    },
    { capture: true },
  );
  addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;
      alt = false;
      postHover();
    },
    { capture: true },
  );

  // Injection happens at did-frame-navigate, while the document is still loading.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function canvasScriptSource(): string {
  const lib = { nextHeight, documentHeight, canScrollAxis, clipText, elementSelector, ancestorPath, clipHtml, textQuote };
  return `(${canvasScript.toString()})({${Object.entries(lib).map(([name, fn]) => `${name}: ${fn.toString()}`).join(", ")}}); void 0;`;
}
