// Shipped as source text (WebFrameMain.executeJavaScript): self-contained, no imports or module-level names. It runs in
// the canvas's main world, so the canvas can fake what it posts and the renderer validates it.

import type { ElementKind } from "../renderer/canvasMessage";

export interface HeightState {
  sent: number;
  inner: number;
  frozen: boolean;
  fonts: number;
}

// A `min-height: 100vh` document that still outgrows the viewport right after our resize is chasing it, so the last
// sent height is kept, except after a sent 0 and once per web font load (`fonts`) (ARCHITECTURE §3 'Canvas view').
export function nextHeight(prev: HeightState | null, measured: number, inner: number, fonts: number): HeightState {
  if (prev === null || prev.fonts !== fonts) return { sent: measured, inner, frozen: false, fonts };
  if (prev.frozen) return prev;
  const ownResize = inner !== prev.inner && Math.abs(inner - prev.sent) <= 1;
  if (ownResize && prev.sent > 0 && measured > inner + 1) return { sent: prev.sent, inner: prev.inner, frozen: true, fonts };
  return { sent: measured, inner, frozen: false, fonts };
}

// Not scrollHeight alone (never below the viewport), but only it tells the height under `html { height: 100% }`.
// `framesBottom` stops absolute-frame canvases alternating; its scrollHeight cap bounds clipping misses (`contain: paint`).
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


// A frame inside a box that scrolls or clips it shows no further than that box. An absolutely positioned element
// escapes the static boxes below its containing block, a fixed one every box.
export function frameBottom(bottom: number, position: string, ancestors: readonly ClipLink[]): number {
  // Overflow applies to block, flex and grid containers only (CSS Overflow 3 §3), yet an inline span or a
  // `display: contents` wrapper still computes `overflow: hidden`, so the display decides.
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

// `box` is where the ancestor clips its content (its padding box, inside any scrollbar), in the viewport, read only
// on an axis whose overflow is not `visible`.
export interface ClipBox {
  position: string;
  overflowX: string;
  overflowY: string;
  display: string;
  box: { x: number; y: number; width: number; height: number };
}

// The part of an element's box its ancestors let show, so an overlay mark never reaches past the window that clips
// it. The ancestors that clip follow frameBottom, on both axes.
export function visibleRect(rect: { x: number; y: number; width: number; height: number }, position: string, ancestors: readonly ClipBox[]): { x: number; y: number; width: number; height: number } {
  const noOverflow = /^(inline|contents|none|table-(row|row-group|header-group|footer-group|column|column-group)|ruby.*)$/;
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  if (position !== "fixed") {
    let escaping = position === "absolute";
    for (const link of ancestors) {
      const positioned = link.position !== "static";
      if ((!escaping || positioned) && !noOverflow.test(link.display)) {
        if (link.overflowX !== "visible") { left = Math.max(left, link.box.x); right = Math.min(right, link.box.x + link.box.width); }
        if (link.overflowY !== "visible") { top = Math.max(top, link.box.y); bottom = Math.min(bottom, link.box.y + link.box.height); }
      }
      if (link.position === "fixed") break;
      if (positioned) escaping = link.position === "absolute";
    }
  }
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
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

// Main runs this selector with CDP `DOM.querySelector`, which returns the first match, so an id anchors it only when
// `unique`; otherwise the path continues up to the next id or to body.
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

// Select enters frames one level per click (PRODUCT §5 item 4). `frames` and `entered` come from the live DOM at the
// click, outermost first; the shared frames stay entered and the next frame below them is the step (null: the node).
export function frameStep<T>(frames: readonly T[], entered: readonly T[]): T | null {
  let shared = 0;
  while (shared < frames.length && shared < entered.length && frames[shared] === entered[shared]) shared++;
  return shared < frames.length ? frames[shared] ?? null : null;
}

// Esc's step back: an element goes to its own frame, a frame to the frame around it; null clears.
export function escapeTarget<T>(entered: readonly T[], selectedIsFrame: boolean): T | null {
  return entered[entered.length - (selectedIsFrame ? 2 : 1)] ?? null;
}

// A Select press on canvas text becomes a text drag once the pointer has moved `threshold` screen px from where it was
// pressed (screen px, so the zoom does not change it), and stays one even back at its start.
export type TextDragState = "press" | "drag";
export function textDragState(prev: TextDragState, start: { x: number; y: number }, point: { x: number; y: number }, threshold: number): TextDragState {
  if (prev === "drag") return "drag";
  return Math.hypot(point.x - start.x, point.y - start.y) >= threshold ? "drag" : "press";
}

// The boundary a text drag's range stays inside, as an index into `frames` (start element and ancestors, nearest
// first): the innermost frame, or outside every frame the start element; null when it holds frames.
export function textBoundary(frames: readonly boolean[], holdsFrames: boolean): number | null {
  const frame = frames.indexOf(true);
  if (frame !== -1) return frame;
  return frames.length === 0 || holdsFrames ? null : 0;
}

// Labels, headings and paragraphs read as text even when laid out as flex, since a person names them by their words;
// other inline text tags are text unless they are a flex or grid box.
export function nodeKind(tag: string, display: string, direction: string, frame: boolean): ElementKind {
  if (frame) return "frame";
  if (tag === "input" || tag === "textarea" || tag === "select") return "input";
  if (tag === "button") return "button";
  if (/^(label|p|h[1-6])$/.test(tag)) return "text";
  if (display === "flex" || display === "inline-flex") return direction.startsWith("column") ? "flex-column" : "flex-row";
  if (display === "grid" || display === "inline-grid") return "grid";
  if (/^(a|abbr|b|cite|code|em|i|kbd|mark|q|s|small|span|strong|sub|sup|time|u)$/.test(tag)) return "text";
  return "box";
}

export interface LabelSource {
  tag: string;
  frame?: { id: string; title?: string };
  doanId?: string;
  // The element's own text nodes, joined: a wrapper's name is not the text of everything inside it.
  text: string;
}

// ancestorPath's label rule, with the frame's title first and a short quote of the element's own text when it has no
// data-doan-id. The quote ends at a word when it is cut.
export function nodeLabel(source: LabelSource): string {
  // Trimmed as the canvas tree trims it (canvasTree.ts frameLabel), so both name a frame alike.
  if (source.frame !== undefined) return source.frame.title?.trim() || source.frame.id || source.tag;
  if (source.doanId) return source.doanId;
  const folded = source.text.replace(/\s+/g, " ").trim();
  if (folded === "") return source.tag;
  const points = Array.from(folded);
  if (points.length <= 24) return `${source.tag} “${folded}”`;
  const kept = points.slice(0, 24).join("");
  const space = points[24] === " " ? kept.length : kept.lastIndexOf(" ");
  return `${source.tag} “${(space > 0 ? kept.slice(0, space) : kept).trimEnd()}…”`;
}

// Which nodes of a frame's tree an element-tree answer sends (`depths` in document order, the frame at 0). Over `max`
// it keeps the path to the selection, its children, then its nearest siblings; what is kept always nests.
export function elementTree(depths: readonly number[], selected: number, max: number): { keep: number[]; truncated: boolean } {
  const all = depths.map((_, i) => i);
  if (depths.length <= max) return { keep: all, truncated: false };
  const own = depths[selected];
  if (own === undefined) return { keep: all.slice(0, max), truncated: true };
  const chosen = new Set<number>();
  const add = (i: number) => { if (chosen.size < max) chosen.add(i); };
  const path = [selected];
  for (let i = selected - 1, depth = own; i >= 0 && depth > 0; i--) {
    const at = depths[i] ?? 0;
    if (at < depth) { path.unshift(i); depth = at; }
  }
  // A path deeper than `max` keeps its top and loses the selection: the depths must start at the frame, and describe
  // already anchors so deep an element at an ancestor whose selector fits, so it hardly ever happens.
  for (const i of path) add(i);
  for (let i = selected + 1; i < depths.length && (depths[i] ?? 0) > own; i++) if (depths[i] === own + 1) add(i);
  const parent = path.at(-2);
  if (parent !== undefined) {
    const siblings: number[] = [];
    for (let i = parent + 1; i < depths.length && (depths[i] ?? 0) >= own; i++) if (depths[i] === own && i !== selected) siblings.push(i);
    const before = siblings.filter(i => i < selected).reverse();
    const after = siblings.filter(i => i > selected);
    for (let n = 0; n < Math.max(before.length, after.length); n++) {
      const earlier = before[n];
      const later = after[n];
      if (earlier !== undefined) add(earlier);
      if (later !== undefined) add(later);
    }
  }
  return { keep: [...chosen].sort((a, b) => a - b), truncated: true };
}

interface CanvasLib {
  nextHeight: typeof nextHeight;
  documentHeight: typeof documentHeight;
  frameBottom: typeof frameBottom;
  visibleRect: typeof visibleRect;
  canScrollAxis: typeof canScrollAxis;
  clipText: typeof clipText;
  elementSelector: typeof elementSelector;
  ancestorPath: typeof ancestorPath;
  clipHtml: typeof clipHtml;
  textQuote: typeof textQuote;
  chipAnchors: typeof chipAnchors;
  frameStep: typeof frameStep;
  escapeTarget: typeof escapeTarget;
  textDragState: typeof textDragState;
  textBoundary: typeof textBoundary;
  nodeKind: typeof nodeKind;
  nodeLabel: typeof nodeLabel;
  elementTree: typeof elementTree;
}

export function canvasScript(lib: CanvasLib): void {
  const MAX_FRAMES = 1000;
  // canvasMessage.ts's MAX_GOTOS.
  const MAX_GOTOS = 1000;
  const MAX_STRING = 200;
  // mark.ts's MAX_PROTOTYPE_MARK: the longest valid mark is 11 characters, so a cut value stays invalid.
  const MAX_PROTOTYPE_MARK = 32;
  const MAX_SELECTOR = 1000;
  const MAX_HTML = 2000;
  const MAX_TEXT = 500;
  const MAX_VALUE = 500;
  // canvasMessage.ts drops a text range over these, so they are clipped here first.
  const MAX_COPY_TEXT = 100_000;
  const MAX_TEXT_RECTS = 2000;
  const TEXT_DRAG_PX = 4;
  const ANCHOR_RETRY_MS = 1000;
  // canvasMessage.ts's MAX_TREE_NODES.
  const MAX_TREE_NODES = 200;
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

  // `parent` is the nearest enclosing frame's index in the list; a frame's ancestors come before it in document order,
  // so a listed frame's enclosing frames are all listed. `gotos` name the innermost listed frame around each link.
  const frames = () => {
    const list: { id: string; title?: string; prototype?: string; cut?: true; parent?: number; x: number; y: number; width: number; height: number }[] = [];
    const listed = new Map<Element, number>();
    const listedAround = (el: Element | null) => {
      for (let node = el; node !== null; node = node.parentElement) {
        const index = listed.get(node);
        if (index !== undefined) return index;
      }
      return undefined;
    };
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
      const id = el.getAttribute("data-doan-frame") ?? "";
      const frame: (typeof list)[number] = { id: clip(id), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
      const title = el.getAttribute("data-doan-title");
      if (title !== null) frame.title = clip(title);
      // A cut ID is not the frame's, so the frame cannot play: `cut` keeps it out of play and out of link groups (which
      // compare raw ids), while its place, number and mark stay, so Play can say a marked frame can't play.
      if (frame.id !== id) frame.cut = true;
      // The raw prototype mark, judged by the renderer; cutting a junk value does not make the list truncated.
      const mark = el.getAttribute("data-doan-prototype");
      if (mark !== null) frame.prototype = lib.clipText(mark, MAX_PROTOTYPE_MARK);
      const parentIndex = listedAround(el.parentElement);
      if (parentIndex !== undefined) frame.parent = parentIndex;
      listed.set(el, list.length);
      list.push(frame);
    }
    // A value over the cap is left out, not cut: no frame can have it, and a cut one could name another frame.
    const gotos: { value: string; frame?: number }[] = [];
    for (const el of document.querySelectorAll("[data-doan-goto]")) {
      if (gotos.length === MAX_GOTOS) break;
      const value = el.getAttribute("data-doan-goto") ?? "";
      if (value.length > MAX_STRING) continue;
      const frame = listedAround(el);
      gotos.push(frame === undefined ? { value } : { value, frame });
    }
    return { list, truncated, bottom, gotos };
  };

  // `seq` is the last command seq from the renderer, raised by one on each human click; every selection message echoes
  // it so the renderer can drop answers a later click or Esc already replaced.
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
  // ⌘ turns the hover to the direct target (a ⌘-click's); a click itself reads its own metaKey.
  let meta = false;
  let hoverQueued = false;
  // When the last pointer activity was posted (performance.now()).
  let activityAt = -Infinity;
  let lastHover = JSON.stringify([0, null]);
  // Picking has its own seq, which no click, selection or hover command moves, and names this document's token. Until
  // `pick-started` the app keeps clicks away (a click would select); a click before the app's cancel answers again.
  let pickSeq = 0;
  let picking: number | null = null;
  // The cursor over the canvas is this document's, so a constructed sheet is adopted: it changes no DOM node, so no
  // MutationObserver or layout runs for it, and the canvas's own sheets stay. Returns the sheet now adopted, if any.
  const cursorSheet = (sheet: CSSStyleSheet | null, on: boolean, cursor: string): CSSStyleSheet | null => {
    try {
      if (on && sheet === null && typeof CSSStyleSheet === "function") {
        const added = new CSSStyleSheet();
        added.replaceSync(`*{cursor:${cursor}!important}`);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, added];
        return added;
      }
      if (!on && sheet !== null) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(adopted => adopted !== sheet);
        return null;
      }
    } catch {
      // The cursor is only a hint: a canvas that broke adoptedStyleSheets still picks and pans, without it.
    }
    return sheet;
  };
  let crosshair: CSSStyleSheet | null = null;
  // A pointer resting over the canvas keeps the cursor this out-of-process document last set until it moves, so the
  // drag layer's own grab cursor shows only after a move; this sheet shows the hand at once.
  let hand: CSSStyleSheet | null = null;
  const setPicking = (next: number | null) => {
    picking = next;
    // A pick takes the canvas's clicks: a text range or drag in progress ends without a read.
    if (next !== null) dropText();
    crosshair = cursorSheet(crosshair, next !== null, "crosshair");
    // A pick hovers what is under the pointer, Select its next step: the resting pointer's hover changes with it.
    postHover();
  };

  const isRoot = (el: unknown) => el === document.documentElement || el === document.body;
  const isElement = (target: unknown): target is Element => typeof target === "object" && target !== null && "nodeType" in target && target.nodeType === 1;
  const isText = (node: unknown): node is Text => typeof node === "object" && node !== null && "nodeType" in node && node.nodeType === 3;
  const isEditable = (el: Element) => "isContentEditable" in el && el.isContentEditable === true;
  // Every overlay mark, and the size and measurements read from it, is the part of the element that shows.
  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    const html = document.documentElement;
    // body's overflow belongs to the viewport while html's is visible, and then body clips nothing.
    const rootStyle = getComputedStyle(html);
    const bodyClips = rootStyle.overflowX !== "visible" || rootStyle.overflowY !== "visible";
    const links: ClipBox[] = [];
    for (let node = el.parentElement; node !== null && node !== html; node = node.parentElement) {
      const style = getComputedStyle(node);
      const unclipped = node === document.body && !bodyClips;
      const overflowX = unclipped ? "visible" : style.overflowX;
      const overflowY = unclipped ? "visible" : style.overflowY;
      let box = { x: 0, y: 0, width: 0, height: 0 };
      if (overflowX !== "visible" || overflowY !== "visible") {
        // The border box scaled back to layout px gives the transform's scale for the padding box's offsets.
        const outer = node.getBoundingClientRect();
        const width = "offsetWidth" in node && typeof node.offsetWidth === "number" ? node.offsetWidth : 0;
        const height = "offsetHeight" in node && typeof node.offsetHeight === "number" ? node.offsetHeight : 0;
        const sx = width ? outer.width / width : 1;
        const sy = height ? outer.height / height : 1;
        box = { x: outer.left + node.clientLeft * sx, y: outer.top + node.clientTop * sy, width: node.clientWidth * sx, height: node.clientHeight * sy };
      }
      links.push({ position: style.position, overflowX, overflowY, display: style.display, box });
    }
    return lib.visibleRect({ x: r.left, y: r.top, width: r.width, height: r.height }, getComputedStyle(el).position, links);
  };
  const byAttribute = (attribute: string, value: string) => Array.from(document.querySelectorAll(`[${attribute}]`)).filter((el) => el.getAttribute(attribute) === value);
  const postSelection = (type: "select" | "clear" | "key", fields: Record<string, unknown>) => post({ type, href: location.href, seq, viewport: innerHeight, ...fields });
  const isFrame = (el: Element) => el.hasAttribute("data-doan-frame");
  // The frames around a node, outermost first, the node itself last when it is a frame.
  const framesOf = (el: Element) => {
    const list: Element[] = [];
    for (let node: Element | null = el; node !== null && !isRoot(node); node = node.parentElement) if (isFrame(node)) list.unshift(node);
    return list;
  };
  // A framework may have swapped the selected node for an equal one; the anchor finds it again first.
  const current = () => {
    if (selected !== null && !selected.isConnected && anchor !== null) selected = resolve(anchor) ?? selected;
    return selected !== null && selected.isConnected ? selected : null;
  };
  // html or body clears (null), and so does the own background of an element outside every frame that holds frames;
  // ⌘ selects the node itself, otherwise the next frame level below what the selection already entered.
  const selectTarget = (target: Element, direct: boolean): Element | null => {
    if (isRoot(target)) return null;
    const frames = framesOf(target);
    if (frames.length === 0 && target.querySelector("[data-doan-frame]") !== null) return null;
    if (direct) return target;
    const now = current();
    return lib.frameStep(frames, now === null ? [] : framesOf(now)) ?? target;
  };

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
      const text = lib.textQuote(el.textContent, MAX_TEXT);
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

  const anchors = lib.chipAnchors(documentToken, () => {
    // Anchor measurement can precede layout's recovery in the same frame.
    // Leave a missing node for layout to report as a lost selection.
    current();
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

  // The hover shows what the next click would select, nothing where it would select the selection again. It keeps
  // coming while ⌥ is held: the app measures from the selection to it.
  const postHover = () => {
    const over = hoverEl;
    const el = !isElement(over) || isRoot(over) || textDrag?.state === "drag" ? null : picking !== null ? over : selectTarget(over, meta);
    const rect = el !== null && el !== selected ? rectOf(el) : null;
    const key = JSON.stringify([hoverSeq, rect]);
    if (key === lastHover) return;
    lastHover = key;
    post({ type: "hover", href: location.href, seq: hoverSeq, viewport: innerHeight, rect });
  };

  // The renderer command this selection answers. A click can take a queued command's seq before it arrives, so seq alone
  // cannot tell that click from the answer; clicks never carry it.
  type Answer = "select-anchor" | "select-parent";
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
  // A click picks what the select message would describe; a Shift-click picks the spot, in document coordinates.
  // Outside every frame it answers nothing and picking goes on: an agent can only be pointed at frames.
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
  const choose = (target: EventTarget | null, direct: boolean) => {
    if (!isElement(target)) return;
    const next = selectTarget(target, direct);
    if (next === null) {
      drop();
      seq++;
      postSelection("clear", {});
      postHover();
      return;
    }
    const described = describe(next);
    if (described === null) return;
    seq++;
    apply(described);
  };

  // An anchor sent after a reload may name an element the canvas's own script has not drawn yet, so it is retried until
  // 1 s after the first layout and the document's load, then answered with null.
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

  const failedSheets = new WeakSet<HTMLLinkElement>();
  const send = () => {
    if (firstLayoutAt === null) {
      // Unstyled frame rects can already be nonzero. Resizing to that height can also
      // make the stylesheet's later growth look like a document chasing its viewport.
      if (document.readyState !== "complete" && Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet" i][href]:not([rel~="alternate" i])')).some(
        link => !link.sheet && !link.disabled && !failedSheets.has(link) && (!link.media || matchMedia(link.media).matches),
      )) return;
      firstLayoutAt = performance.now();
    }
    tryPending();
    const html = document.documentElement;
    const { list, truncated, bottom, gotos } = frames();
    const measured = lib.documentHeight(Math.ceil(html.getBoundingClientRect().height), html.scrollHeight, innerHeight, bottom);
    height = lib.nextHeight(height, measured, innerHeight, fontLoads);
    // `viewport` lets the renderer drop a layout measured before its last
    // resize of the iframe reached this document.
    const message: Record<string, unknown> = { type: "layout", document: documentToken, href: location.href, height: height.sent, viewport: innerHeight, frames: list, truncated, gotos };
    if (selected !== null) {
      // A framework may swap the node for an equal one; look once more by the
      // same anchor before giving the selection up.
      if (!selected.isConnected) selected = anchor === null ? null : resolve(anchor);
      if (selected === null) anchor = null;
      message.seq = seq;
      message.selected = selected === null ? null : rectOf(selected);
    }
    post(message);
    refreshText();
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
  const stylesheetSettled = (event: Event) => {
    if (firstLayoutAt !== null || !(event.target instanceof HTMLLinkElement)) return;
    if (event.type === "error") failedSheets.add(event.target);
    if (started) send();
  };
  document.addEventListener("load", stylesheetSettled, true);
  document.addEventListener("error", stylesheetSettled, true);
  const start = () => {
    started = true;
    const resized = new ResizeObserver(schedule);
    resized.observe(document.documentElement);
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- document.body is null until the parser has created it
    if (document.body) resized.observe(document.body);
    new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener("resize", schedule);
    addEventListener("load", () => { if (firstLayoutAt === null) send(); else schedule(); });
    addEventListener("load", tryPending);
    // Inner scrollers move the selected element without resizing anything.
    addEventListener("scroll", schedule, { capture: true, passive: true });
    void document.fonts.ready.then(() => {
      schedule();
      tryPending();
    });
    send();
  };

  // Not `ready`: it may already be resolved, which would miss the first freeze of a chasing document. Registered before
  // `measure` is answered and sent without rAF: an off-screen iframe gets no animation frames.
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
    const { type, frame, doanId, selector, index, id, x, y } = data;
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
    } else if (type === "hover-meta") {
      if (typeof data.meta !== "boolean") return;
    } else if (type === "hover-hand") {
      if (typeof data.hand !== "boolean") return;
    } else if (type === "hover-at") {
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    } else if (type !== "clear" && type !== "hover-leave" && type !== "select-parent") return;
    if (type === "hover-alt" || type === "hover-meta" || type === "hover-hand" || type === "hover-leave" || type === "hover-at") {
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
    } else if (type === "hover-meta") {
      meta = data.meta === true;
      postHover();
    } else if (type === "hover-hand") {
      hand = cursorSheet(hand, data.hand === true, "grab");
    } else if (type === "hover-leave") {
      hoverEl = null;
      lastHover = "";
    } else if (type === "hover-at" && typeof x === "number" && typeof y === "number") {
      // The pointer rests where the app names (this document's client px) and no move will come to say what is under
      // it; the dedupe value is emptied as after a leave, so the same rect is sent again.
      hoverEl = document.elementFromPoint(x, y);
      lastHover = "";
      postHover();
    } else if (type === "clear") {
      drop();
      postHover();
    } else if (type === "select-parent") {
      // Esc's step, from the selection's frames in the DOM as it is now.
      const now = current();
      const next = now === null ? null : lib.escapeTarget(framesOf(now), isFrame(now));
      const described = next === null ? null : describe(next);
      if (described !== null) { apply(described, "select-parent"); return; }
      drop();
      postSelection("clear", { answer: "select-parent" });
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

  // The element menu's tree request has its own seq, which no click, selection or hover command moves, and names this
  // document's token, so a request for a replaced document is never answered.
  let treeSeq = 0;
  const skippedTags = new Set(["script", "style", "template", "noscript"]);
  const treeCommand = (data: Record<string, unknown>) => {
    const next = data.seq;
    if (typeof next !== "number" || !Number.isSafeInteger(next) || data.document !== documentToken || next <= treeSeq) return;
    treeSeq = next;
    const nodes: Record<string, unknown>[] = [];
    let truncated = false;
    const now = current();
    const root = now === null ? undefined : framesOf(now).at(-1);
    if (root !== undefined) {
      const els: Element[] = [];
      const depths: number[] = [];
      // Iterative, so a deeply nested canvas cannot overflow the stack.
      const stack: [Element, number][] = [[root, 0]];
      for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
        const [el, depth] = item;
        els.push(el);
        depths.push(depth);
        const children: Element[] = [];
        // An element that renders no box is left out unless the selection is it or inside it; a display:contents element's
        // children take its place at its depth.
        const gather = (parent: Element) => {
          for (const child of parent.children) {
            if (skippedTags.has(child.localName)) continue;
            if (child.getClientRects().length > 0) children.push(child);
            else if (getComputedStyle(child).display === "contents") gather(child);
            else if (now !== null && child.contains(now)) children.push(child);
          }
        };
        gather(el);
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i];
          if (child !== undefined) stack.push([child, depth + 1]);
        }
      }
      const reduced = lib.elementTree(depths, now === null ? -1 : els.indexOf(now), MAX_TREE_NODES);
      truncated = reduced.truncated;
      const counts = new Map<string, boolean>();
      const unique = (attribute: AnchorAttribute, value: string) => {
        const key = `${attribute}\n${value}`;
        if (!counts.has(key)) counts.set(key, value.length <= MAX_STRING && byAttribute(attribute, value).length === 1);
        return counts.get(key) === true;
      };
      // A node whose selector does not fit cannot be sent; its subtree goes with it so the depths still nest.
      let droppedBelow: number | null = null;
      for (const index of reduced.keep) {
        const el = els[index];
        const depth = depths[index];
        if (el === undefined || depth === undefined) continue;
        if (droppedBelow !== null && depth > droppedBelow) continue;
        droppedBelow = null;
        const chain: ChainLink[] = [];
        for (let node: Element | null = el; node !== null; node = node.parentElement) {
          let indexOfType = 1;
          for (let sibling = node.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
            if (sibling.localName === node.localName && sibling.namespaceURI === node.namespaceURI) indexOfType++;
          }
          const link: ChainLink = { tag: node.localName, indexOfType };
          const doanId = node.getAttribute("data-doan-id");
          if (doanId !== null) link.doanId = doanId;
          const frameId = node.getAttribute("data-doan-frame");
          if (frameId !== null) link.frameId = frameId;
          chain.push(link);
          if (isRoot(node)) break;
        }
        const selector = lib.elementSelector(chain, unique);
        if (selector.length > MAX_SELECTOR) {
          droppedBelow = depth;
          truncated = true;
          continue;
        }
        const anchor: Record<string, string> = { selector };
        const doanId = el.getAttribute("data-doan-id");
        if (doanId !== null && doanId.length <= MAX_STRING) anchor.doanId = doanId;
        const frameId = el.getAttribute("data-doan-frame");
        const frame = frameId === null ? undefined : { id: lib.clipText(frameId, MAX_STRING), title: el.getAttribute("data-doan-title") ?? undefined };
        if (frame !== undefined) anchor.frame = frame.id;
        let text = "";
        for (const child of el.childNodes) if (isText(child)) text += child.data;
        const style = getComputedStyle(el);
        const source: LabelSource = { tag: el.localName, text };
        if (frame !== undefined) source.frame = frame.title === undefined ? { id: frame.id } : { id: frame.id, title: frame.title };
        if (doanId !== null) source.doanId = doanId;
        const node: Record<string, unknown> = {
          depth,
          name: lib.clipText(lib.nodeLabel(source), MAX_STRING),
          kind: lib.nodeKind(el.localName, style.display, style.flexDirection, frame !== undefined),
          anchor,
          rect: rectOf(el),
        };
        if (el === now) node.selected = true;
        nodes.push(node);
      }
    }
    post({ type: "element-tree", href: location.href, document: documentToken, seq: next, viewport: innerHeight, nodes, truncated });
  };

  addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) return;
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    const type = (data as { type?: unknown }).type;
    if (type === "measure") send();
    else if (type === "clear-text" || type === "text-point" || type === "text-at" || type === "text-press" || type === "text-move" || type === "text-release") textCommand(data as Record<string, unknown>);
    else if (type === "element-tree") treeCommand(data as Record<string, unknown>);
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
      // The element under the cursor changes without a pointermove. While ⌥ is held the app measures to the hover target,
      // a rect that follows the board's move, so it stays until the pointer moves.
      if (!alt) {
        hoverEl = null;
        postHover();
      }
      const zoom = event.ctrlKey || event.metaKey;
      if (!zoom && scrollsFurther(event.target, event.deltaX, event.deltaY)) return;
      event.preventDefault();
      post({ type: "wheel", dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode, x: event.clientX + scrollX, y: event.clientY + scrollY });
    },
    { passive: false, capture: true },
  );

  // A plain primary press is selection and never reaches the canvas, so links, inputs, native text selection and :focus
  // stay inert; ⌥ passes through, and only trusted input counts. Right and Ctrl presses prevent focus but never select.
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
        } else if (type === "click" && dragClick) {
          // The click that ends a text drag selects nothing, and picks nothing when a pick started during the drag.
          dragClick = false;
        } else if (type === "click" && picking !== null) {
          pickAt(event.target, event.shiftKey ? { x: event.clientX, y: event.clientY } : null);
        } else if (type === "click") {
          const target = event.target;
          if (!isElement(target) || target.isConnected) choose(target, event.metaKey);
        }
      },
      { capture: true },
    );
  }

  let spaceHeld = false;

  // A nested iframe has no script of ours; a click inside it only shows here
  // as focus moving into it.
  addEventListener("blur", () => {
    // The ⌘ and ⌥ held on the way into a nested iframe, before the release below forgets them.
    const direct = meta;
    const usesCanvas = alt;
    // ⌘ and ⌥ released while focus was elsewhere (⌘Tab) never come back as a keyup.
    if (meta) {
      meta = false;
      postHover();
    }
    if (alt) {
      alt = false;
      postSelection("key", { key: "Alt", alt, seq: hoverSeq });
    }
    if (spaceHeld) {
      spaceHeld = false;
      postSelection("key", { key: "Space", down: false });
    }
    setTimeout(() => {
      const active = document.activeElement;
      if (active === null || !["iframe", "frame", "object", "embed"].includes(active.localName)) return;
      // The press happened in the nested document, out of this script's sight; focus moving in is all that shows, so it is
      // the press the app hears.
      post({ type: "press" });
      // It is the canvas's next press, so a text range goes as with any other.
      if (textRange !== null || textDrag !== null) {
        dropText();
        postText(false);
      }
      if (picking !== null) {
        if (active.isConnected) pickAt(active, null);
        return;
      }
      if (usesCanvas) return;
      if (!active.isConnected) return;
      choose(active, direct);
      // Focus goes back to this document, or the next press in the same nested frame moves no focus and goes unheard,
      // and a frame step would never reach the nested frame itself.
      if ("blur" in active && typeof active.blur === "function") active.blur();
    }, 0);
  });

  addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (!event.isTrusted) return;
      // The app never sees pointer moves in this frame and hover is posted only on a rect change, so activity is posted at
      // most once a second, without an animation frame, which an off-screen frame never gets.
      const now = performance.now();
      if (now - activityAt >= 1000) { activityAt = now; post({ type: "activity" }); }
      if (alt !== event.altKey) postSelection("key", { key: "Alt", alt: event.altKey, seq: hoverSeq });
      alt = event.altKey;
      meta = event.metaKey;
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
      if (event.key === "Meta") {
        meta = true;
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
      // The app takes one Select step per forwarded Esc, so a held Esc's auto-repeats are not forwarded.
      if (!editable(event.target) && !event.repeat) postSelection("key", { key: "Escape" });
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
      if (event.key === "Meta") {
        meta = false;
        postHover();
      }
      if (event.key !== "Alt") return;
      alt = false;
      postSelection("key", { key: "Alt", alt, seq: hoverSeq });
      postHover();
    },
    { capture: true },
  );

  // The press never reaches the canvas: the script posts its own Range's Text line rects for the app's overlay and reads
  // the text through the canvas's Selection within one task, so nothing is painted. `remote`: Hand's drag (pointerId -1).
  type TextDrag = { pointerId: number; node: Text; offset: number; screen: { x: number; y: number }; boundary: Element; state: TextDragState; remote: boolean };
  let textDrag: TextDrag | null = null;
  let textRange: Range | null = null;
  let textCopy: string | null = null;
  // The last clear-text epoch taken from the app; every text-range carries it.
  let textEpoch = 0;
  let textQueued = false;
  let ibeam: CSSStyleSheet | null = null;
  // The click that follows a released text drag; any next press forgets it.
  let dragClick = false;

  const insideField = (el: Element) => {
    if (isEditable(el)) return true;
    for (let node: Element | null = el; node !== null; node = node.parentElement) if (["input", "textarea", "select"].includes(node.localName)) return true;
    return false;
  };
  const glyphHolds = (node: Text, index: number, x: number, y: number) => {
    if (index < 0 || index >= node.data.length) return false;
    const glyph = document.createRange();
    glyph.setStart(node, index);
    glyph.setEnd(node, index + 1);
    for (const r of Array.from(glyph.getClientRects())) if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) return true;
    return false;
  };
  // Where a text drag may start: a Text caret whose glyph beside it is under the press, or whose own element was pressed.
  // Fields, editable text, nested iframes and Shadow DOM hosts have no caret here; a frame's background, no boundary.
  const textAt = (x: number, y: number, target: unknown): { node: Text; offset: number; boundary: Element } | null => {
    if (typeof document.caretPositionFromPoint !== "function") return null;
    const caret = document.caretPositionFromPoint(x, y);
    const text = caret?.offsetNode;
    if (!caret || !isText(text)) return null;
    const parent = text.parentElement;
    if (parent === null || insideField(parent)) return null;
    if (!glyphHolds(text, caret.offset - 1, x, y) && !glyphHolds(text, caret.offset, x, y) && target !== parent) return null;
    const chain: Element[] = [];
    for (let el: Element | null = parent; el !== null && !isRoot(el); el = el.parentElement) chain.push(el);
    const at = lib.textBoundary(chain.map(isFrame), parent.querySelector("[data-doan-frame]") !== null);
    const boundary = at === null ? undefined : chain[at];
    if (boundary === undefined) return null;
    return { node: text, offset: caret.offset, boundary };
  };
  const textStart = (event: PointerEvent): Omit<TextDrag, "state" | "remote"> | null => {
    const start = textAt(event.clientX, event.clientY, event.target);
    return start === null ? null : { ...start, pointerId: event.pointerId, screen: { x: event.screenX, y: event.screenY } };
  };

  // Only the Text nodes' own boxes: a range also returns the border box of each element it holds whole, and those
  // would stack the overlay's alpha over the lines.
  const textRects = (range: Range): Rect[] => {
    const rects: Rect[] = [];
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = root.nodeType === 3 ? root : walker.nextNode(); node !== null && rects.length < MAX_TEXT_RECTS; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      const part = document.createRange();
      part.selectNodeContents(node);
      if (node === range.startContainer) part.setStart(node, range.startOffset);
      if (node === range.endContainer) part.setEnd(node, range.endOffset);
      for (const r of Array.from(part.getClientRects())) {
        if (r.width <= 0 || r.height <= 0) continue;
        rects.push({ x: r.left, y: r.top, width: r.width, height: r.height });
        if (rects.length === MAX_TEXT_RECTS) break;
      }
    }
    return rects;
  };

  // The browser's own serialization (line breaks, table cells, hidden text left out), read in one task so it is never
  // painted. The canvas's `user-select: none` is overridden for the read only, and its own selection (an ⌥-drag) put back.
  const readText = (range: Range): string => {
    const selection = getSelection();
    if (selection === null) return lib.clipHtml(range.toString(), MAX_COPY_TEXT).html;
    let sheet: CSSStyleSheet | null = null;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync("*{user-select:text!important}");
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      sheet = null;
    }
    const kept = selection.rangeCount > 0 && selection.anchorNode !== null && selection.focusNode !== null
      ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset } : null;
    // Whatever the read throws, the canvas gets its own styles and selection back.
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      return lib.clipHtml(selection.toString(), MAX_COPY_TEXT).html;
    } finally {
      selection.removeAllRanges();
      if (kept !== null) {
        try { selection.setBaseAndExtent(kept.anchor, kept.anchorOffset, kept.focus, kept.focusOffset); } catch { /* its nodes left the document */ }
      }
      if (sheet !== null) {
        const added = sheet;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(adopted => adopted !== added);
      }
    }
  };

  const postText = (dragging: boolean, text?: string) => {
    const message: Record<string, unknown> = { type: "text-range", document: documentToken, epoch: textEpoch, dragging, rects: textRange === null || textRange.collapsed ? [] : textRects(textRange) };
    if (text !== undefined) message.text = text;
    post(message);
  };

  // The range from the pressed caret to the caret at (x, y), inside the boundary. No caret there (empty space, outside
  // the document) keeps the last end.
  const extendText = (x: number, y: number) => {
    const drag = textDrag;
    if (drag === null) return;
    const caret = document.caretPositionFromPoint(x, y);
    if (!caret) return;
    let node: Node = caret.offsetNode, offset = caret.offset;
    const bounds = document.createRange();
    bounds.selectNodeContents(drag.boundary);
    let side = 0;
    try { side = bounds.comparePoint(node, offset); } catch { return; }
    if (side < 0) { node = bounds.startContainer; offset = bounds.startOffset; }
    else if (side > 0) { node = bounds.endContainer; offset = bounds.endOffset; }
    const range = document.createRange();
    range.setStart(drag.node, drag.offset);
    if (range.comparePoint(node, offset) < 0) { range.setStart(node, offset); range.setEnd(drag.node, drag.offset); }
    else range.setEnd(node, offset);
    textRange = range;
    if (textQueued) return;
    textQueued = true;
    requestAnimationFrame(() => {
      textQueued = false;
      if (textDrag?.state === "drag") postText(true);
    });
  };

  // `read`: the drag ends as the person left it (release, cancel, lost capture, blur) and its text goes to the app.
  // Otherwise (clear-text, a pick, the next press) the range goes with it.
  const endTextDrag = (read: boolean, point: { x: number; y: number } | null) => {
    const drag = textDrag;
    if (drag === null) return;
    textDrag = null;
    try {
      if (document.documentElement.hasPointerCapture(drag.pointerId)) document.documentElement.releasePointerCapture(drag.pointerId);
    } catch {
      // The pointer is already gone.
    }
    if (drag.state !== "drag") return;
    ibeam = cursorSheet(ibeam, false, "text");
    dragClick = true;
    if (read) {
      if (textRange !== null && textRange.collapsed) textRange = null;
      textCopy = textRange === null ? null : readText(textRange);
      postText(false, textCopy ?? undefined);
    }
    // The hover hid through the drag and the pointer may rest where it was before; without emptying the dedupe value the
    // same rect would never be sent again.
    lastHover = "";
    hoverEl = point === null ? null : document.elementFromPoint(point.x, point.y);
    postHover();
  };

  const dropText = () => {
    endTextDrag(false, null);
    textRange = null;
    textCopy = null;
  };

  // A layout change moves the lines under the range; a range whose ends left the document is gone.
  const refreshText = () => {
    if (textRange === null) return;
    if (!textRange.startContainer.isConnected || !textRange.endContainer.isConnected) {
      dropText();
      postText(false);
      return;
    }
    postText(textDrag?.state === "drag");
  };

  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  // Hand's text drag: the app's drag layer takes every press, so the app asks here whether a press at a document point
  // would start one (`text-at`, `text-press`), then drives it with `text-move` (the app's px) and `text-release`.
  const handText = (x: number, y: number) => textAt(x - scrollX, y - scrollY, document.elementFromPoint(x - scrollX, y - scrollY));

  const textCommand = (data: Record<string, unknown>) => {
    const { type, epoch, x, y, probe } = data;
    if (type === "text-at") {
      if (typeof probe !== "number" || !Number.isSafeInteger(probe) || !finite(x) || !finite(y)) return;
      post({ type: "text-hit", document: documentToken, probe, hit: handText(x, y) !== null });
      return;
    }
    if (typeof epoch !== "number" || !Number.isSafeInteger(epoch)) return;
    if (type === "clear-text") {
      if (epoch <= textEpoch) return;
      textEpoch = epoch;
      dropText();
      return;
    }
    if (type === "text-press") {
      const { sx, sy } = data;
      if (typeof probe !== "number" || !Number.isSafeInteger(probe) || !finite(x) || !finite(y) || !finite(sx) || !finite(sy)) return;
      // A press the app sent before its last clear-text is not the person's current one.
      const start = epoch === textEpoch && picking === null ? handText(x, y) : null;
      if (start !== null) {
        dropText();
        dragClick = false;
        textDrag = { ...start, pointerId: -1, screen: { x: sx, y: sy }, state: "press", remote: true };
      }
      post({ type: "text-hit", document: documentToken, probe, hit: start !== null });
      return;
    }
    if (epoch !== textEpoch) return;
    if (type === "text-release") {
      if (textDrag?.remote === true) endTextDrag(true, finite(x) && finite(y) ? { x: x - scrollX, y: y - scrollY } : null);
      return;
    }
    if (!finite(x) || !finite(y)) return;
    if (type === "text-move") {
      const drag = textDrag;
      const { sx, sy } = data;
      if (drag === null || !drag.remote || !finite(sx) || !finite(sy)) return;
      const was = drag.state;
      drag.state = lib.textDragState(was, drag.screen, { x: sx, y: sy }, TEXT_DRAG_PX);
      if (drag.state !== "drag") return;
      if (was !== "drag") postHover();
      extendText(x - scrollX, y - scrollY);
      return;
    }
    // The board moved under a resting pointer (a wheel pan or pinch): the app sends where the pointer is now, in the
    // canvas's document coordinates, as the wheel message gives them.
    if (textDrag?.state !== "drag") return;
    extendText(x - scrollX, y - scrollY);
  };

  addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      // Every primary press ends the last range, ⌥ and ⌘ included; right and Ctrl presses keep it.
      if (!event.isTrusted || event.button !== 0 || event.ctrlKey) return;
      dragClick = false;
      if (textRange !== null || textDrag !== null) {
        dropText();
        postText(false);
      }
      if (event.metaKey || event.altKey || event.shiftKey || picking !== null || spaceHeld) return;
      const start = textStart(event);
      if (start !== null) textDrag = { ...start, state: "press", remote: false };
    },
    { capture: true },
  );
  addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      const drag = textDrag;
      if (!event.isTrusted || drag === null || drag.remote || event.pointerId !== drag.pointerId) return;
      // A release outside the frame before the capture was taken never comes back as a pointerup: a move with the
      // button up ends the press there instead of starting a drag.
      if (drag.state === "press" && (event.buttons & 1) === 0) {
        textDrag = null;
        return;
      }
      const was = drag.state;
      drag.state = lib.textDragState(was, drag.screen, { x: event.screenX, y: event.screenY }, TEXT_DRAG_PX);
      if (drag.state !== "drag") return;
      if (was !== "drag") {
        // Taken only now: a capture taken at the press would make a still click land on html, which clears.
        try { document.documentElement.setPointerCapture(drag.pointerId); } catch { /* the pointer is already up */ }
        ibeam = cursorSheet(ibeam, true, "text");
        postHover();
      }
      extendText(event.clientX, event.clientY);
    },
    { capture: true, passive: true },
  );
  addEventListener("pointerup", (event: PointerEvent) => { if (event.pointerId === textDrag?.pointerId) endTextDrag(true, { x: event.clientX, y: event.clientY }); }, { capture: true });
  for (const type of ["pointercancel", "lostpointercapture"] as const) {
    addEventListener(type, (event: PointerEvent) => { if (event.pointerId === textDrag?.pointerId) endTextDrag(true, null); }, { capture: true });
  }
  addEventListener("blur", () => { endTextDrag(true, null); });
  // Focus is in this canvas after an ⌥-click into it, and then ⌘C and Edit > Copy fire here, not in the app.
  addEventListener(
    "copy",
    (event: ClipboardEvent) => {
      if (textRange === null || !textCopy || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", textCopy);
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );

  // Injection happens at did-frame-navigate, while the document is still loading.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function canvasScriptSource(): string {
  const lib = { nextHeight, documentHeight, frameBottom, visibleRect, canScrollAxis, clipText, elementSelector, ancestorPath, clipHtml, textQuote, chipAnchors, frameStep, escapeTarget, textDragState, textBoundary, nodeKind, nodeLabel, elementTree };
  return `(${canvasScript.toString()})({${Object.entries(lib).map(([name, fn]) => `${name}: ${fn.toString()}`).join(", ")}}); void 0;`;
}


// Kept self-contained because this function is serialized into the sandbox.
export function chipAnchors(documentToken: string, selected: () => { element: Element | null; seq: number }) {
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
