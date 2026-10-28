import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { ancestorPath, canScrollAxis, canvasScriptSource, clipHtml, clipText, documentHeight, elementSelector, nextHeight, textQuote, type ChainLink } from "./canvasScript";

describe("nextHeight", () => {
  test("sends the first measurement as is", () => {
    expect(nextHeight(null, 900, 150)).toEqual({ sent: 900, inner: 150, frozen: false });
  });

  test("follows a canvas that grows or shrinks without tracking the viewport", () => {
    const first = nextHeight(null, 900, 150);
    expect(nextHeight(first, 1200, 150)).toEqual({ sent: 1200, inner: 150, frozen: false });
    expect(nextHeight(first, 900, 900)).toEqual({ sent: 900, inner: 900, frozen: false });
    expect(nextHeight(first, 400, 150)).toEqual({ sent: 400, inner: 150, frozen: false });
  });

  test("freezes when the document still outgrows the viewport right after our own resize", () => {
    const first = nextHeight(null, 580, 150);
    // The iframe became 580 tall and the document grew with it (min-height: 100vh + padding).
    expect(nextHeight(first, 660, 580)).toEqual({ sent: 580, inner: 150, frozen: true });
  });

  test("treats a resize within 1px of the sent height as our own", () => {
    const first = nextHeight(null, 580, 150);
    expect(nextHeight(first, 700, 581).frozen).toBe(true);
    expect(nextHeight(first, 700, 579).frozen).toBe(true);
    expect(nextHeight(first, 700, 582).frozen).toBe(false);
  });

  test("does not freeze when the viewport did not change", () => {
    const first = nextHeight(null, 580, 580);
    expect(nextHeight(first, 900, 580)).toEqual({ sent: 900, inner: 580, frozen: false });
  });

  test("does not freeze when the document fits the resized viewport", () => {
    const first = nextHeight(null, 580, 150);
    expect(nextHeight(first, 581, 580).frozen).toBe(false);
    expect(nextHeight(first, 580, 580)).toEqual({ sent: 580, inner: 580, frozen: false });
  });

  test("stays frozen for the rest of the document", () => {
    const frozen = nextHeight(nextHeight(null, 580, 150), 660, 580);
    expect(nextHeight(frozen, 300, 580)).toEqual(frozen);
    expect(nextHeight(frozen, 5000, 900)).toEqual(frozen);
  });
});

// Measured in Electron 45 (800×150 viewport, 2,000px of content): a plain canvas
// reports its rect (2016), `html,body{height:100%}` and `html{height:100%}` report
// a 150 rect with scrollHeight 2000 and 2008.
describe("documentHeight", () => {
  test("uses the rect of a canvas that sizes to its content", () => {
    expect(documentHeight(2016, 2016, 150)).toBe(2016);
    expect(documentHeight(80, 150, 150)).toBe(80);
  });

  test("uses scrollHeight when html is as tall as the viewport and the content is taller", () => {
    expect(documentHeight(150, 2000, 150)).toBe(2000);
    expect(documentHeight(150, 2008, 150)).toBe(2008);
    expect(documentHeight(151, 2000, 150)).toBe(2000);
    expect(documentHeight(149, 2000, 150)).toBe(2000);
  });

  test("keeps the rect when it is more than 1px from the viewport", () => {
    expect(documentHeight(152, 2000, 150)).toBe(152);
    expect(documentHeight(148, 2000, 150)).toBe(148);
  });

  test("keeps the viewport height when nothing overflows html (a body scroller)", () => {
    expect(documentHeight(150, 150, 150)).toBe(150);
  });

  test("settles once the iframe is resized to the reported height", () => {
    for (const content of [2000, 2008]) {
      const first = nextHeight(null, documentHeight(150, content, 150), 150);
      expect(first.sent).toBe(content);
      expect(nextHeight(first, documentHeight(content, content, content), content)).toEqual({ sent: content, inner: content, frozen: false });
    }
  });

  test("still freezes a 100% canvas whose content keeps outgrowing the viewport", () => {
    // html{height:100%} with body{min-height:100vh} and 8px margins: always 16px taller.
    const first = nextHeight(null, documentHeight(150, 166, 150), 150);
    expect(nextHeight(first, documentHeight(166, 182, 166), 166)).toEqual({ sent: 166, inner: 150, frozen: true });
  });
});

describe("canScrollAxis", () => {
  test("scrolls an overflowing auto, scroll or overlay box in the wheel's direction", () => {
    for (const overflow of ["auto", "scroll", "overlay"]) {
      expect(canScrollAxis(overflow, 0, 100, 300, 10)).toBe(true);
    }
  });

  test("does not scroll a visible or hidden box", () => {
    expect(canScrollAxis("visible", 0, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("hidden", 0, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("clip", 0, 100, 300, 10)).toBe(false);
  });

  test("stops at either end", () => {
    expect(canScrollAxis("auto", 200, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("auto", 199.7, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("auto", 150, 100, 300, 10)).toBe(true);
    expect(canScrollAxis("auto", 0, 100, 300, -10)).toBe(false);
    expect(canScrollAxis("auto", 1, 100, 300, -10)).toBe(true);
  });

  test("ignores an axis without movement or without overflow", () => {
    expect(canScrollAxis("auto", 50, 100, 300, 0)).toBe(false);
    expect(canScrollAxis("auto", 0, 100, 100, 10)).toBe(false);
  });
});

describe("clipText", () => {
  test("keeps short text and cuts long text at the limit", () => {
    expect(clipText("abc", 200)).toBe("abc");
    expect(clipText("a".repeat(201), 200)).toBe("a".repeat(200));
  });

  test("does not leave half of a surrogate pair", () => {
    expect(clipText(`${"a".repeat(199)}😀`, 200)).toBe("a".repeat(199));
  });
});

const link = (tag: string, indexOfType = 1, ids: { doanId?: string; frameId?: string } = {}): ChainLink => ({ tag, indexOfType, ...ids });
const everyUnique = () => true;

describe("elementSelector", () => {
  test("starts at the nearest unique data-doan-id and walks down by type index", () => {
    const chain = [link("span", 2), link("button"), link("form", 1, { doanId: "login" }), link("div", 3), link("body")];
    expect(elementSelector(chain, everyUnique)).toBe('[data-doan-id="login"] > button:nth-of-type(1) > span:nth-of-type(2)');
  });

  test("uses a frame as the anchor and prefers data-doan-id on the same element", () => {
    expect(elementSelector([link("p"), link("section", 1, { frameId: "hero" }), link("body")], everyUnique)).toBe('[data-doan-frame="hero"] > p:nth-of-type(1)');
    expect(elementSelector([link("section", 1, { frameId: "hero", doanId: "s" }), link("body")], everyUnique)).toBe('[data-doan-id="s"]');
  });

  test("is the anchor alone when the element itself carries a unique id", () => {
    expect(elementSelector([link("button", 4, { doanId: "cta" }), link("body")], everyUnique)).toBe('[data-doan-id="cta"]');
  });

  test("starts at body when no ancestor has an id", () => {
    expect(elementSelector([link("li", 3), link("ul", 2), link("body")], everyUnique)).toBe("body > ul:nth-of-type(2) > li:nth-of-type(3)");
  });

  test("skips an id that is not unique in the document", () => {
    const chain = [link("b"), link("p", 1, { doanId: "dup" }), link("div", 2, { frameId: "f" }), link("body")];
    const unique = (attr: string, value: string) => !(attr === "data-doan-id" && value === "dup");
    expect(elementSelector(chain, unique)).toBe('[data-doan-frame="f"] > p:nth-of-type(1) > b:nth-of-type(1)');
    expect(elementSelector(chain, () => false)).toBe("body > div:nth-of-type(2) > p:nth-of-type(1) > b:nth-of-type(1)");
  });

  test("escapes quotes, backslashes and control characters in attribute values", () => {
    expect(elementSelector([link("i", 1, { doanId: 'a"b\\c' }), link("body")], everyUnique)).toBe('[data-doan-id="a\\"b\\\\c"]');
    expect(elementSelector([link("i", 1, { doanId: "a\nb" }), link("body")], everyUnique)).toBe('[data-doan-id="a\\a b"]');
    expect(elementSelector([link("i", 1, { doanId: "" }), link("body")], everyUnique)).toBe('[data-doan-id=""]');
  });

  test("keeps SVG tag case and escapes characters a type selector cannot hold", () => {
    expect(elementSelector([link("linearGradient", 2), link("svg"), link("body")], everyUnique)).toBe("body > svg:nth-of-type(1) > linearGradient:nth-of-type(2)");
    expect(elementSelector([link("foo:bar"), link("body")], everyUnique)).toBe("body > foo\\:bar:nth-of-type(1)");
    expect(elementSelector([link("my-el"), link("body")], everyUnique)).toBe("body > my-el:nth-of-type(1)");
  });
});

describe("ancestorPath", () => {
  test("runs from the nearest frame down to the element, outermost first", () => {
    const chain = [link("span"), link("button", 1, { doanId: "cta" }), link("form"), link("section", 1, { frameId: "hero" }), link("main"), link("body")];
    expect(ancestorPath(chain)).toEqual([
      { label: "hero", depth: 3 },
      { label: "form", depth: 2 },
      { label: "cta", depth: 1, doanId: "cta" },
      { label: "span", depth: 0 },
    ]);
  });

  test("stops right below body when there is no frame", () => {
    expect(ancestorPath([link("a"), link("nav"), link("body")])).toEqual([{ label: "nav", depth: 1 }, { label: "a", depth: 0 }]);
  });

  test("is the frame alone for a frame and labels an id-less frame by its tag", () => {
    expect(ancestorPath([link("div", 1, { frameId: "" }), link("body")])).toEqual([{ label: "div", depth: 0 }]);
  });

  test("keeps the 32 steps nearest the element", () => {
    const chain = [...Array.from({ length: 40 }, () => link("div")), link("body")];
    const path = ancestorPath(chain);
    expect(path).toHaveLength(32);
    expect(path[0]?.depth).toBe(31);
    expect(path.at(-1)?.depth).toBe(0);
  });
});

describe("clipHtml", () => {
  test("keeps html within the limit and cuts longer html by code points", () => {
    expect(clipHtml("<b>x</b>", 2000)).toEqual({ html: "<b>x</b>", truncated: false });
    expect(clipHtml("a".repeat(2000), 2000)).toEqual({ html: "a".repeat(2000), truncated: false });
    expect(clipHtml("a".repeat(2001), 2000)).toEqual({ html: "a".repeat(2000), truncated: true });
  });

  test("counts a surrogate pair as one code point and never splits it", () => {
    expect(clipHtml("😀".repeat(2000), 2000)).toEqual({ html: "😀".repeat(2000), truncated: false });
    expect(clipHtml(`${"a".repeat(1999)}😀😀`, 2000)).toEqual({ html: `${"a".repeat(1999)}😀`, truncated: true });
  });
});

describe("textQuote", () => {
  test("folds whitespace runs to one space and trims the ends", () => {
    expect(textQuote("  Sign\n\t in  now ", 500)).toBe("Sign in now");
    expect(textQuote(" \n ", 500)).toBe("");
  });

  test("cuts at the limit by code points without splitting a pair", () => {
    expect(textQuote("a".repeat(501), 500)).toBe("a".repeat(500));
    expect(textQuote("😀".repeat(501), 500)).toBe("😀".repeat(500));
    expect(textQuote(`${"a".repeat(499)}😀😀`, 500)).toBe(`${"a".repeat(499)}😀`);
  });
});

// A stand-in for the canvas window: just enough DOM for the script to run in a
// fresh VM context, which also proves the source has no outer references.
interface FakeElement {
  nodeType?: number;
  attrs?: Record<string, string>;
  rect?: { left: number; top: number; width: number; height: number };
  style?: { overflowX: string; overflowY: string };
  scrollTop?: number;
  scrollLeft?: number;
  clientHeight?: number;
  clientWidth?: number;
  scrollHeight?: number;
  scrollWidth?: number;
  parentElement?: FakeElement | null;
}

type Listener = (event: unknown) => void;
type Trigger = "ResizeObserver" | "MutationObserver" | "resize" | "load";

// A tree element for the selection tests: parent links, type indexes, rects.
interface FakeNode {
  nodeType: 1;
  localName: string;
  namespaceURI: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  parentElement: FakeNode | null;
  rect: { left: number; top: number; width: number; height: number };
  isConnected: boolean;
  textContent: string;
  outerHTML: string;
  isContentEditable: boolean;
  blurred: number;
  readonly previousElementSibling: FakeNode | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  blur(): void;
}

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

function node(localName: string, attrs: Record<string, string> = {}, children: FakeNode[] = [], extra: Partial<Pick<FakeNode, "rect" | "textContent" | "outerHTML" | "isContentEditable" | "namespaceURI">> = {}): FakeNode {
  const self: FakeNode = {
    nodeType: 1,
    localName,
    namespaceURI: HTML_NS,
    attrs,
    children,
    parentElement: null,
    rect: { left: 1, top: 2, width: 30, height: 40 },
    isConnected: true,
    textContent: "",
    outerHTML: `<${localName}>`,
    isContentEditable: false,
    blurred: 0,
    get previousElementSibling() {
      const siblings = self.parentElement?.children ?? [];
      return siblings[siblings.indexOf(self) - 1] ?? null;
    },
    getAttribute: (name) => self.attrs[name] ?? null,
    hasAttribute: (name) => name in self.attrs,
    getBoundingClientRect: () => self.rect,
    blur() {
      self.blurred += 1;
    },
    ...extra,
  };
  for (const child of children) child.parentElement = self;
  return self;
}

function descendants(root: FakeNode): FakeNode[] {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

function fakeCanvas(options: { readyState?: string; height?: number; scrollHeight?: number; frames?: FakeElement[]; body?: FakeNode } = {}) {
  const posted: unknown[] = [];
  const windowListeners = new Map<string, Listener[]>();
  const documentListeners = new Map<string, Listener[]>();
  const frames: unknown[] = [];
  const add = (map: Map<string, Listener[]>) => (type: string, listener: Listener, listenerOptions?: unknown) => {
    map.set(type, [...(map.get(type) ?? []), listener]);
    listenerOptionsSeen.push({ type, options: listenerOptions });
  };
  const listenerOptionsSeen: { type: string; options: unknown }[] = [];
  const state = { height: options.height ?? 900, now: 0 };
  const body = options.body ?? node("body");
  const html = Object.assign(node("html", {}, [body]), {
    scrollHeight: options.scrollHeight ?? Math.max(state.height, 150),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: state.height }),
  });
  const animationFrames: (() => void)[] = [];
  const timers: { at: number; callback: () => void }[] = [];
  const resizeCallbacks: (() => void)[] = [];
  const mutationCallbacks: (() => void)[] = [];
  const resizeTargets: unknown[] = [];
  const mutationTargets: { target: unknown; options: unknown }[] = [];
  const assigned: string[] = [];
  const selectors = new Map<string, FakeNode>();
  const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const element = (el: FakeElement) => ({
    ...el,
    getAttribute: (name: string) => el.attrs?.[name] ?? null,
    getBoundingClientRect: () => el.rect ?? { left: 0, top: 0, width: 0, height: 0 },
  });
  for (const frame of options.frames ?? []) frames.push(element(frame));
  const document = {
    readyState: options.readyState ?? "loading",
    addEventListener: add(documentListeners),
    documentElement: html,
    body,
    activeElement: body as FakeNode | null,
    querySelectorAll: (selector: string) => {
      if (options.body === undefined) return frames;
      const attr = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
      if (attr === undefined) { const found = selectors.get(selector); return found?.isConnected ? [found] : []; }
      return descendants(html).filter((el) => el.isConnected && el.hasAttribute(attr));
    },
    querySelector: (selector: string) => {
      if (selector === "!bad") throw new SyntaxError("bad selector");
      const found = selectors.get(selector);
      return found?.isConnected ? found : null;
    },
    fonts: { ready: new Promise<void>(() => {}) },
  };
  const context: Record<string, unknown> = {
    parent,
    location: { href: "http://127.0.0.1:4000/t/tok/key/.doan/canvases/a.html", assign: (url: string) => assigned.push(url) },
    innerHeight: 150,
    scrollX: 0,
    scrollY: 40,
    addEventListener: add(windowListeners),
    requestAnimationFrame: (callback: () => void) => animationFrames.push(callback),
    setTimeout: (callback: () => void, delay: number) => timers.push({ at: state.now + delay, callback }),
    performance: { now: () => state.now },
    getComputedStyle: (el: FakeElement) => el.style ?? { overflowX: "visible", overflowY: "visible" },
    ResizeObserver: class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe(target: unknown) {
        resizeTargets.push(target);
      }
    },
    MutationObserver: class {
      constructor(callback: () => void) {
        mutationCallbacks.push(callback);
      }
      observe(target: unknown, observeOptions: unknown) {
        mutationTargets.push({ target, options: observeOptions });
      }
    },
    document,
  };
  context.window = context;
  runInNewContext(canvasScriptSource(), context);
  const fire = (map: Map<string, Listener[]>, type: string, event: unknown) => {
    for (const listener of map.get(type) ?? []) listener(event);
  };
  return {
    posted,
    state,
    html,
    body,
    parent,
    context,
    document,
    selectors,
    assigned,
    listenerOptionsSeen,
    ready: () => fire(documentListeners, "DOMContentLoaded", {}),
    fireWindow: (type: string, event: unknown) => fire(windowListeners, type, event),
    windowListeners,
    animationFrames,
    resizeTargets,
    mutationTargets,
    trigger: (kind: Trigger) => {
      if (kind === "ResizeObserver") for (const callback of resizeCallbacks) callback();
      else if (kind === "MutationObserver") for (const callback of mutationCallbacks) callback();
      else fire(windowListeners, kind, {});
    },
    runFrame: () => {
      for (const callback of animationFrames.splice(0)) callback();
    },
    advance: (ms: number) => {
      state.now += ms;
      for (const timer of timers.filter((t) => t.at <= state.now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    },
    fromParent: (data: unknown) => fire(windowListeners, "message", { source: parent, data }),
  };
}

function wheelEvent(fields: Record<string, unknown>) {
  const event = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, clientX: 10, clientY: 20, prevented: false, ...fields };
  return Object.assign(event, {
    preventDefault() {
      event.prevented = true;
    },
  });
}

describe("canvasScriptSource", () => {
  test("posts nothing before DOMContentLoaded and the first layout synchronously after it", () => {
    const canvas = fakeCanvas({ height: 899.2 });
    expect(canvas.posted).toEqual([]);
    canvas.ready();
    expect(canvas.posted).toEqual([
      {
        message: { type: "layout", document: expect.any(String), href: "http://127.0.0.1:4000/t/tok/key/.doan/canvases/a.html", height: 900, viewport: 150, frames: [], truncated: false },
        origin: "*",
      },
    ]);
  });

  // The renderer drops heights measured before its last resize reached the canvas.
  test("reports the viewport height each layout was measured at", () => {
    const canvas = fakeCanvas();
    canvas.ready();
    canvas.context.innerHeight = 2500;
    canvas.trigger("resize");
    canvas.runFrame();
    expect(canvas.posted.map((post) => (post as { message: { viewport: number } }).message.viewport)).toEqual([150, 2500]);
  });

  test("starts at once when injected after the document is parsed", () => {
    const canvas = fakeCanvas({ readyState: "interactive" });
    expect(canvas.posted).toHaveLength(1);
  });

  test("lists [data-doan-frame] elements in document order with board coordinates", () => {
    const canvas = fakeCanvas({
      frames: [
        { attrs: { "data-doan-frame": "b", "data-doan-title": "Second" }, rect: { left: 5, top: 10, width: 300, height: 200 } },
        { attrs: { "data-doan-frame": "" }, rect: { left: 0, top: -40, width: 0, height: 0 } },
        { attrs: { "data-doan-frame": "b" }, rect: { left: 1, top: 2, width: 3, height: 4 } },
      ],
    });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({
      message: {
        frames: [
          { id: "b", title: "Second", x: 5, y: 50, width: 300, height: 200 },
          { id: "", x: 0, y: 0, width: 0, height: 0 },
          { id: "b", x: 1, y: 42, width: 3, height: 4 },
        ],
        truncated: false,
      },
    });
    const second = (canvas.posted[0] as { message: { frames: object[] } }).message.frames[1];
    expect(second).not.toHaveProperty("title");
  });

  test("cuts the list at 1,000 frames and strings at 200 characters", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ attrs: { "data-doan-frame": `f${i}` } }));
    const canvas = fakeCanvas({ frames: many });
    canvas.ready();
    const message = (canvas.posted[0] as { message: { frames: object[]; truncated: boolean } }).message;
    expect(message.frames).toHaveLength(1000);
    expect(message.truncated).toBe(true);

    const long = fakeCanvas({ frames: [{ attrs: { "data-doan-frame": "x", "data-doan-title": "t".repeat(201) } }] });
    long.ready();
    expect(long.posted[0]).toMatchObject({ message: { frames: [{ id: "x", title: "t".repeat(200) }], truncated: true } });
  });

  test("answers measure from the parent synchronously and ignores other senders", () => {
    const canvas = fakeCanvas();
    canvas.ready();
    canvas.state.height = 1234;
    canvas.fireWindow("message", { source: {}, data: { type: "measure" } });
    expect(canvas.posted).toHaveLength(1);
    canvas.fireWindow("message", { source: canvas.parent, data: { type: "other" } });
    canvas.fireWindow("message", { source: canvas.parent, data: null });
    expect(canvas.posted).toHaveLength(1);
    canvas.fireWindow("message", { source: canvas.parent, data: { type: "measure" } });
    expect(canvas.posted).toHaveLength(2);
    expect(canvas.posted[1]).toMatchObject({ message: { type: "layout", height: 1234 } });
  });

  test("reports scrollHeight for a canvas whose html is as tall as the viewport", () => {
    const canvas = fakeCanvas({ height: 150.4, scrollHeight: 2008 });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({ message: { type: "layout", height: 2008 } });
  });

  test("watches html and body for size changes and the whole document for edits", () => {
    const canvas = fakeCanvas();
    canvas.ready();
    expect(canvas.resizeTargets).toEqual([canvas.html, canvas.body]);
    expect(canvas.mutationTargets).toEqual([{ target: canvas.html, options: { subtree: true, childList: true, attributes: true, characterData: true } }]);
  });

  test.each<Trigger>(["ResizeObserver", "MutationObserver", "resize", "load"])("a %s trigger posts one layout on the next animation frame", (kind) => {
    const canvas = fakeCanvas();
    canvas.ready();
    canvas.state.height = 1300;
    canvas.html.scrollHeight = 1300;
    canvas.trigger(kind);
    expect(canvas.animationFrames).toHaveLength(1);
    expect(canvas.posted).toHaveLength(1);
    canvas.runFrame();
    expect(canvas.posted).toHaveLength(2);
    expect(canvas.posted[1]).toMatchObject({ message: { type: "layout", height: 1300 } });
  });

  test("batches several triggers in one frame into one layout, and queues again after it", () => {
    const canvas = fakeCanvas();
    canvas.ready();
    for (const kind of ["ResizeObserver", "MutationObserver", "resize", "load", "MutationObserver"] as const) canvas.trigger(kind);
    expect(canvas.animationFrames).toHaveLength(1);
    expect(canvas.posted).toHaveLength(1);
    canvas.runFrame();
    expect(canvas.posted).toHaveLength(2);
    canvas.runFrame();
    expect(canvas.posted).toHaveLength(2);
    canvas.trigger("resize");
    expect(canvas.animationFrames).toHaveLength(1);
    canvas.runFrame();
    expect(canvas.posted).toHaveLength(3);
  });

  test("installs once per document", () => {
    const canvas = fakeCanvas({ readyState: "complete" });
    runInNewContext(canvasScriptSource(), canvas.context);
    expect(canvas.posted).toHaveLength(1);
    expect(canvas.windowListeners.get("wheel")).toHaveLength(1);
  });

  test("forwards a Ctrl or Cmd wheel as zoom even over a scrollable box", () => {
    const canvas = fakeCanvas();
    const box: FakeElement = { nodeType: 1, style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 0, clientHeight: 100, scrollHeight: 300, parentElement: null };
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = wheelEvent({ target: box, deltaY: 10, ...modifier });
      canvas.fireWindow("wheel", event);
      expect(event.prevented).toBe(true);
    }
    expect(canvas.posted.map((p) => (p as { message: { ctrl: boolean; meta: boolean } }).message)).toEqual([
      { type: "wheel", dx: 0, dy: 10, ctrl: true, meta: false, deltaMode: 0, x: 10, y: 60 },
      { type: "wheel", dx: 0, dy: 10, ctrl: false, meta: true, deltaMode: 0, x: 10, y: 60 },
    ]);
  });

  test("leaves a plain wheel to an ancestor that can still scroll that way", () => {
    const canvas = fakeCanvas();
    const box: FakeElement = { nodeType: 1, style: { overflowX: "visible", overflowY: "auto" }, scrollTop: 0, clientHeight: 100, scrollHeight: 300, parentElement: null };
    const inner: FakeElement = { nodeType: 1, parentElement: box };
    const event = wheelEvent({ target: inner, deltaY: 10 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(false);
    expect(canvas.posted).toEqual([]);
  });

  test("pans with a plain wheel when no ancestor can scroll further", () => {
    const canvas = fakeCanvas();
    const atEnd: FakeElement = { nodeType: 1, style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 200, clientHeight: 100, scrollHeight: 300, parentElement: canvas.body as FakeElement };
    const event = wheelEvent({ target: atEnd, deltaY: 10, deltaX: -3, deltaMode: 1 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(true);
    expect(canvas.posted).toEqual([{ message: { type: "wheel", dx: -3, dy: 10, ctrl: false, meta: false, deltaMode: 1, x: 10, y: 60 }, origin: "*" }]);
  });

  test("does not treat the document's own scrolling as an inner scroller", () => {
    const canvas = fakeCanvas();
    Object.assign(canvas.html, { nodeType: 1, style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 0, clientHeight: 150, scrollHeight: 900, parentElement: null });
    const event = wheelEvent({ target: canvas.html, deltaY: 10 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(true);
  });
});

interface FakeEvent {
  isComposing?: boolean;
  type?: string;
  target: unknown;
  isTrusted: boolean;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  key?: string;
  relatedTarget?: unknown;
  prevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

function input(fields: Partial<Omit<FakeEvent, "prevented" | "stopped" | "preventDefault" | "stopPropagation">> & { target: unknown }): FakeEvent {
  const event: FakeEvent = {
    isTrusted: true,
    button: 0,
    altKey: false,
    ctrlKey: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      event.prevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
    ...fields,
  };
  return event;
}

const messages = (canvas: { posted: unknown[] }) => canvas.posted.map((post) => (post as { message: Record<string, unknown> }).message);
const ofType = (canvas: { posted: unknown[] }, type: string) => messages(canvas).filter((message) => message.type === type);
const HREF = "http://127.0.0.1:4000/t/tok/key/.doan/canvases/a.html";

// body > main > section[data-doan-frame=hero] > form > button[data-doan-id=cta] > span
function heroCanvas() {
  const span = node("span", {}, [], { textContent: "  Sign\n in ", outerHTML: "<span>Sign in</span>", rect: { left: 10, top: 20, width: 60.5, height: 18 } });
  const button = node("button", { "data-doan-id": "cta" }, [span], { outerHTML: '<button data-doan-id="cta"><span>Sign in</span></button>' });
  const field = node("input");
  const form = node("form", {}, [field, button]);
  const hero = node("section", { "data-doan-frame": "hero", "data-doan-title": "Hero", "data-doan-implements": "app/src/renderer/App.tsx" }, [form]);
  const first = node("section", { "data-doan-frame": "intro" });
  const main = node("main", {}, [first, hero]);
  const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [main]) });
  canvas.posted.length = 0;
  return { canvas, span, button, field, form, hero, first, main };
}

const click = (canvas: ReturnType<typeof fakeCanvas>, target: unknown, fields: Partial<FakeEvent> = {}) => {
  const event = input({ target, ...fields });
  canvas.fireWindow("click", event);
  return event;
};

describe("canvasScript selection input", () => {
  test("a plain click selects the element under it with anchors, path and frame", () => {
    const { canvas, span } = heroCanvas();
    const event = click(canvas, span);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
    expect(ofType(canvas, "select")).toEqual([
      {
        type: "select",
        href: HREF,
        seq: 1,
        viewport: 150,
        target: {
          rect: { x: 10, y: 20, width: 60.5, height: 18 },
          tag: "span",
          frame: { id: "hero", title: "Hero", implements: "app/src/renderer/App.tsx" },
          frameIndex: 1,
          element: { selector: '[data-doan-id="cta"] > span:nth-of-type(1)', html: "<span>Sign in</span>", text: "Sign in" },
          path: [
            { label: "hero", selector: '[data-doan-frame="hero"]' },
            { label: "form", selector: '[data-doan-frame="hero"] > form:nth-of-type(1)' },
            { label: "cta", selector: '[data-doan-id="cta"]', doanId: "cta" },
            { label: "span", selector: '[data-doan-id="cta"] > span:nth-of-type(1)' },
          ],
        },
      },
    ]);
  });

  test("marks links and controls so the panel can show the ⌥ hint", () => {
    const linkEl = node("a", { href: "b.html" });
    const plainA = node("a");
    const editable = node("div", {}, [], { isContentEditable: true });
    const area = node("textarea");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [linkEl, plainA, editable, area]) });
    for (const target of [linkEl, plainA, editable, area]) click(canvas, target);
    expect(ofType(canvas, "select").map((m) => (m.target as { interactive?: string }).interactive)).toEqual(["link", undefined, "control", "control"]);
  });

  test("a click on the frame element itself is a frame selection", () => {
    const { canvas, hero } = heroCanvas();
    click(canvas, hero);
    const target = ofType(canvas, "select")[0]?.target as Record<string, unknown>;
    expect(target).not.toHaveProperty("element");
    expect(target.frame).toEqual({ id: "hero", title: "Hero", implements: "app/src/renderer/App.tsx" });
    expect(target.frameIndex).toBe(1);
    expect(target.path).toEqual([{ label: "hero", selector: '[data-doan-frame="hero"]' }]);
  });

  test("a click on body or html clears with a new seq", () => {
    const { canvas, span } = heroCanvas();
    click(canvas, span);
    click(canvas, canvas.body);
    click(canvas, canvas.html);
    expect(messages(canvas).filter((m) => m.type !== "hover").map((m) => [m.type, m.seq])).toEqual([["select", 1], ["clear", 2], ["clear", 3]]);
    expect(ofType(canvas, "clear")[0]).toEqual({ type: "clear", href: HREF, seq: 2, viewport: 150 });
  });

  test("ignores clicks the canvas made itself, right clicks and Ctrl-clicks", () => {
    const { canvas, span } = heroCanvas();
    for (const fields of [{ isTrusted: false }, { button: 2 }, { ctrlKey: true }]) {
      const event = click(canvas, span, fields);
      expect(event.prevented).toBe(false);
    }
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("blocks the canvas's own pointer actions on a plain press without selecting yet", () => {
    const { canvas, span } = heroCanvas();
    for (const type of ["pointerdown", "mousedown", "dblclick"]) {
      const event = input({ target: span });
      canvas.fireWindow(type, event);
      expect([type, event.prevented, event.stopped]).toEqual([type, true, true]);
    }
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("blocks Ctrl and non-primary presses without selecting, but preserves Alt pass-through", () => {
    const { canvas, field } = heroCanvas();
    for (const fields of [{ ctrlKey: true }, { button: 1 }, { button: 2 }]) {
      const event = input({ target: field, ...fields });
      canvas.fireWindow("pointerdown", event);
      expect(event.prevented).toBe(true);
      expect(event.stopped).toBe(true);
      const pass = input({ target: field, ...fields, altKey: true });
      canvas.fireWindow("pointerdown", pass);
      expect(pass.prevented).toBe(false);
      click(canvas, field, fields);
    }
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("a plain press blurs whatever the canvas had focused, so Esc reaches the script", () => {
    const { canvas, span, field } = heroCanvas();
    canvas.document.activeElement = field;
    canvas.fireWindow("pointerdown", input({ target: span }));
    expect(field.blurred).toBe(1);
    canvas.document.activeElement = canvas.body;
    canvas.fireWindow("pointerdown", input({ target: span }));
    expect(canvas.body.blurred).toBe(0);
  });

  test("⌥ passes every press and click through without selecting", () => {
    const { canvas, span, field } = heroCanvas();
    for (const type of ["pointerdown", "mousedown", "click", "dblclick"]) {
      const event = input({ target: type === "click" ? field : span, altKey: true });
      canvas.fireWindow(type, event);
      expect(event.prevented).toBe(false);
      expect(event.stopped).toBe(false);
    }
    expect(ofType(canvas, "select")).toEqual([]);
    expect(canvas.assigned).toEqual([]);
  });

  test("⌥-click on a link navigates by location.assign instead of the download Chromium would start", () => {
    const label = node("b");
    const anchor = node("a", { href: "other.html#x" }, [label]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [anchor]) });
    const event = click(canvas, label, { altKey: true });
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(false);
    expect(canvas.assigned).toEqual(["other.html#x"]);
  });

  test("forwards Esc outside editable elements only", () => {
    const { canvas, span, field } = heroCanvas();
    const editable = node("div", {}, [], { isContentEditable: true });
    for (const target of [span, canvas.body, field, node("textarea"), node("select"), editable]) {
      canvas.fireWindow("keydown", input({ target, key: "Escape" }));
    }
    canvas.fireWindow("keydown", input({ target: span, key: "Enter" }));
    expect(ofType(canvas, "key")).toEqual([
      { type: "key", href: HREF, seq: 0, viewport: 150, key: "Escape" },
      { type: "key", href: HREF, seq: 0, viewport: 150, key: "Escape" },
    ]);
  });

  test("selects an SVG element itself and keeps its tag case in the selector", () => {
    const stop = node("stop", {}, [], { namespaceURI: SVG_NS });
    const gradient = node("linearGradient", {}, [stop], { namespaceURI: SVG_NS });
    const svg = node("svg", {}, [node("linearGradient", {}, [], { namespaceURI: SVG_NS }), gradient], { namespaceURI: SVG_NS });
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [svg]) });
    click(canvas, stop);
    const target = ofType(canvas, "select")[0]?.target as { tag: string; element: { selector: string } };
    expect(target.tag).toBe("stop");
    expect(target.element.selector).toBe("body > svg:nth-of-type(1) > linearGradient:nth-of-type(2) > stop:nth-of-type(1)");
  });

  test("counts only same-namespace siblings for the type index", () => {
    const htmlA = node("a");
    const svgA = node("a", {}, [], { namespaceURI: SVG_NS });
    const target = node("a");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [htmlA, svgA, target]) });
    click(canvas, target);
    expect((ofType(canvas, "select")[0]?.target as { element: { selector: string } }).element.selector).toBe("body > a:nth-of-type(2)");
  });

  test("selects a nested iframe when focus moves into it on a plain click", () => {
    const nested = node("iframe");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [nested]) });
    canvas.document.activeElement = nested;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
    expect((ofType(canvas, "select")[0]?.target as { tag: string }).tag).toBe("iframe");
  });

  test("leaves a nested iframe alone when ⌥ was held on the way in", () => {
    const nested = node("iframe");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [nested]) });
    canvas.fireWindow("pointermove", input({ target: nested, altKey: true }));
    canvas.document.activeElement = nested;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("carries the frame id but no index for a frame past the 1,000 listed", () => {
    const inner = node("p");
    const frames = Array.from({ length: 1001 }, (_, i) => node("div", { "data-doan-frame": `f${i}` }, i === 1000 ? [inner] : []));
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, frames) });
    click(canvas, inner);
    const target = ofType(canvas, "select")[0]?.target as Record<string, unknown>;
    expect(target.frame).toEqual({ id: "f1000" });
    expect(target).not.toHaveProperty("frameIndex");
  });

  test("anchors inside duplicate or empty frame ids by position", () => {
    const inDup = node("p");
    const inEmpty = node("p");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [node("div", { "data-doan-frame": "d" }), node("div", { "data-doan-frame": "d" }, [inDup]), node("div", { "data-doan-frame": "" }, [inEmpty])]) });
    click(canvas, inDup);
    click(canvas, inEmpty);
    const targets = ofType(canvas, "select").map((m) => m.target as { frame: unknown; frameIndex: number; element: { selector: string } });
    expect(targets[0]).toMatchObject({ frame: { id: "d" }, frameIndex: 1, element: { selector: "body > div:nth-of-type(2) > p:nth-of-type(1)" } });
    expect(targets[1]).toMatchObject({ frame: { id: "" }, frameIndex: 2, element: { selector: '[data-doan-frame=""] > p:nth-of-type(1)' } });
  });

  test("clips frame strings and html, folds text, and leaves out an over-long doanId", () => {
    const el = node("p", { "data-doan-id": "x".repeat(201) }, [], { outerHTML: "h".repeat(2001), textContent: "t".repeat(501) });
    const frame = node("div", { "data-doan-frame": "f".repeat(201), "data-doan-title": "T".repeat(201), "data-doan-implements": "i".repeat(501) }, [el]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [frame]) });
    click(canvas, el);
    const target = ofType(canvas, "select")[0]?.target as { frame: unknown; element: Record<string, unknown> };
    expect(target.frame).toEqual({ id: "f".repeat(200), title: "T".repeat(200), implements: "i".repeat(500) });
    expect(target.element).toEqual({ selector: "body > div:nth-of-type(1) > p:nth-of-type(1)", html: "h".repeat(2000), truncated: true, text: "t".repeat(500) });
  });

  test("selects the nearest ancestor whose selector fits in 1,000 characters", () => {
    let deepest = node("i");
    const levels = [deepest];
    for (let i = 0; i < 80; i++) {
      deepest = node("div", {}, [deepest]);
      levels.push(deepest);
    }
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [deepest]) });
    click(canvas, levels[0]);
    const target = ofType(canvas, "select")[0]?.target as { tag: string; element: { selector: string } };
    expect(target.tag).toBe("div");
    expect(target.element.selector.length).toBeLessThanOrEqual(1000);
    expect(target.element.selector.length).toBeGreaterThan(1000 - "div:nth-of-type(1) > ".length);
  });
});

describe("canvasScript hover", () => {
  const move = (canvas: ReturnType<typeof fakeCanvas>, target: unknown, fields: Partial<FakeEvent> = {}) => canvas.fireWindow("pointermove", input({ target, ...fields }));

  test("posts the hovered element's rect once per animation frame", () => {
    const { canvas, span, button } = heroCanvas();
    move(canvas, button);
    move(canvas, span);
    expect(ofType(canvas, "hover")).toEqual([]);
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toEqual([{ type: "hover", href: HREF, seq: 0, viewport: 150, rect: { x: 10, y: 20, width: 60.5, height: 18 } }]);
    move(canvas, span);
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toHaveLength(1);
  });

  test("resends the same element after the app reports a canvas leave", () => {
    const { canvas, span } = heroCanvas();
    move(canvas, span);
    canvas.runFrame();
    canvas.fromParent({ type: "hover-leave", seq: 1 });
    move(canvas, span);
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toHaveLength(2);
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 1, rect: { x: 10, y: 20, width: 60.5, height: 18 } });
  });

  test("reports Alt release in the canvas at the app's modifier sequence without losing selection", () => {
    const { canvas, span, button } = heroCanvas();
    click(canvas, button);
    move(canvas, span);
    canvas.runFrame();
    canvas.fromParent({ type: "hover-alt", alt: true, seq: 2 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 2, rect: null });
    canvas.fireWindow("keyup", input({ target: canvas.body, key: "Alt" }));
    expect(ofType(canvas, "key").at(-1)).toMatchObject({ key: "Alt", alt: false, seq: 2 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 2, rect: { x: 10, y: 20, width: 60.5, height: 18 } });
    canvas.fromParent({ type: "measure" });
    expect(ofType(canvas, "layout").at(-1)).toMatchObject({ seq: 1, selected: { x: 1, y: 2, width: 30, height: 40 } });
  });

  test("hides when the pointer leaves, ⌥ is held, the wheel turns or over body", () => {
    const { canvas, span } = heroCanvas();
    const rects = () => ofType(canvas, "hover").map((m) => m.rect === null ? null : "rect");
    move(canvas, span);
    canvas.runFrame();
    canvas.fireWindow("pointerout", input({ target: span, relatedTarget: null }));
    move(canvas, span);
    canvas.runFrame();
    move(canvas, span, { altKey: true });
    canvas.runFrame();
    move(canvas, span);
    canvas.runFrame();
    canvas.fireWindow("wheel", Object.assign(wheelEvent({ target: span, deltaY: 5 }), { target: span }));
    move(canvas, span);
    canvas.runFrame();
    move(canvas, canvas.body);
    canvas.runFrame();
    expect(rects()).toEqual(["rect", null, "rect", null, "rect", null, "rect", null]);
  });

  test("an Alt keydown hides the hover until the next move without ⌥", () => {
    const { canvas, span } = heroCanvas();
    move(canvas, span);
    canvas.runFrame();
    canvas.fireWindow("keydown", input({ target: canvas.body, key: "Alt", altKey: true }));
    expect(ofType(canvas, "hover").at(-1)?.rect).toBeNull();
  });

  test("shows nothing over the selected element without advancing the hover channel", () => {
    const { canvas, span, button } = heroCanvas();
    move(canvas, span);
    canvas.runFrame();
    click(canvas, span);
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 1 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 0, rect: null });
    move(canvas, button);
    canvas.runFrame();
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 0, rect: { x: 1, y: 2, width: 30, height: 40 } });
  });

  test("ignores moves the canvas dispatched itself", () => {
    const { canvas, span } = heroCanvas();
    move(canvas, span, { isTrusted: false });
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toEqual([]);
  });
});

describe("canvasScript independent command channels", () => {
  test("hover commands cannot supersede selection commands, and stale commands stay rejected in each channel", () => {
    const { canvas, span, button } = heroCanvas();
    canvas.fromParent({ type: "hover-alt", alt: true, seq: 10 });
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "cta" });
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 1, target: { tag: "button" } });
    canvas.fromParent({ type: "hover-alt", alt: false, seq: 9 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 10, rect: null });
    canvas.fireWindow("pointermove", input({ target: span, altKey: true }));
    canvas.runFrame();
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 10, rect: null });
    canvas.fromParent({ type: "clear", seq: 2 });
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "cta" });
    expect(ofType(canvas, "select")).toHaveLength(1);
    canvas.fromParent({ type: "hover-alt", alt: false, seq: 11 });
    click(canvas, button);
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 3, target: { tag: "button" } });
    canvas.fromParent({ type: "measure" });
    expect(ofType(canvas, "layout").at(-1)).toMatchObject({ seq: 3 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 11 });
  });
});

describe("canvasScript selected rect in layout", () => {
  test("adds seq and the selected rect to each layout while something is selected", () => {
    const { canvas, span } = heroCanvas();
    canvas.trigger("resize");
    canvas.runFrame();
    expect(ofType(canvas, "layout")[0]).not.toHaveProperty("selected");
    expect(ofType(canvas, "layout")[0]).not.toHaveProperty("seq");
    click(canvas, span);
    span.rect = { left: 10, top: -30, width: 60.5, height: 18 };
    canvas.trigger("resize");
    canvas.runFrame();
    expect(ofType(canvas, "layout")[1]).toMatchObject({ seq: 1, selected: { x: 10, y: -30, width: 60.5, height: 18 } });
  });

  test("sends a layout after any scroll in the canvas, caught in the capture phase", () => {
    const { canvas } = heroCanvas();
    expect(canvas.listenerOptionsSeen.find((seen) => seen.type === "scroll")?.options).toMatchObject({ capture: true });
    canvas.fireWindow("scroll", {});
    canvas.runFrame();
    expect(ofType(canvas, "layout")).toHaveLength(1);
  });

  test("finds a replaced element again by the same anchor", () => {
    const { canvas, button, form } = heroCanvas();
    click(canvas, button);
    button.isConnected = false;
    const again = node("button", { "data-doan-id": "cta" }, [], { rect: { left: 5, top: 6, width: 7, height: 8 } });
    form.children.splice(form.children.indexOf(button), 1, again);
    again.parentElement = form;
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    expect(ofType(canvas, "layout").at(-1)).toMatchObject({ seq: 1, selected: { x: 5, y: 6, width: 7, height: 8 } });
  });

  test("reports null once when the element is gone, then stops sending selected", () => {
    const { canvas, span } = heroCanvas();
    click(canvas, span);
    span.isConnected = false;
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    const layouts = ofType(canvas, "layout");
    expect(layouts[0]).toMatchObject({ seq: 1, selected: null });
    expect(layouts[1]).not.toHaveProperty("selected");
  });
});

describe("canvasScript messages from the renderer", () => {
  test("select-anchor finds a unique data-doan-id first and adopts the renderer's seq", () => {
    const { canvas } = heroCanvas();
    canvas.fromParent({ type: "select-anchor", seq: 4, doanId: "cta", selector: "!bad" });
    expect(ofType(canvas, "select")[0]).toMatchObject({ seq: 4, target: { tag: "button", element: { doanId: "cta", selector: '[data-doan-id="cta"]' } } });
  });

  test("select-anchor falls back to the selector when the id is repeated, and survives a bad selector", () => {
    const first = node("p", { "data-doan-id": "dup" });
    const second = node("p", { "data-doan-id": "dup" });
    const canvas = fakeCanvas({ readyState: "complete", body: node("body", {}, [first, second]) });
    canvas.selectors.set("body > p:nth-of-type(2)", second);
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "dup", selector: "body > p:nth-of-type(2)" });
    expect(ofType(canvas, "select")[0]).toMatchObject({ seq: 1, target: { element: { doanId: "dup", selector: "body > p:nth-of-type(2)" } } });
    canvas.advance(1000);
    canvas.fromParent({ type: "select-anchor", seq: 2, selector: "!bad" });
    expect(ofType(canvas, "select")[1]).toEqual({ type: "select", href: HREF, seq: 2, viewport: 150, target: null, answer: "select-anchor" });
  });

  test("select-anchor with only a frame id selects that frame", () => {
    const { canvas } = heroCanvas();
    canvas.fromParent({ type: "select-anchor", seq: 1, frame: "hero" });
    const target = ofType(canvas, "select")[0]?.target as Record<string, unknown>;
    expect(target.frame).toMatchObject({ id: "hero" });
    expect(target).not.toHaveProperty("element");
  });

  test("ignores a command whose seq is not newer than the script's, so a click wins over a late answer", () => {
    const { canvas, span } = heroCanvas();
    click(canvas, span);
    canvas.fromParent({ type: "select-anchor", seq: 1, frame: "intro" });
    canvas.fromParent({ type: "clear", seq: 1 });
    canvas.fromParent({ type: "select-anchor", seq: 2, frame: "intro", extra: "ignored" });
    expect(ofType(canvas, "select").map((m) => [m.seq, (m.target as { tag: string }).tag])).toEqual([[1, "span"], [2, "section"]]);
  });

  test("marks only the answer to a select-anchor, never a click that took its seq first", () => {
    const now = node("p", { "data-doan-id": "now" });
    const later = node("p", { "data-doan-id": "late" });
    const body = node("body", {}, [now]);
    const canvas = fakeCanvas({ readyState: "loading", body });
    canvas.ready();
    click(canvas, now);
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "now" });
    canvas.fromParent({ type: "select-anchor", seq: 2, doanId: "now" });
    canvas.fromParent({ type: "select-anchor", seq: 3, doanId: "late" });
    body.children.push(later);
    later.parentElement = body;
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    canvas.fromParent({ type: "select-anchor", seq: 4, doanId: "never" });
    canvas.advance(1000);
    canvas.document.readyState = "complete";
    canvas.trigger("load");
    click(canvas, now);
    expect(ofType(canvas, "select").map((m) => [m.seq, m.answer])).toEqual([[1, undefined], [2, "select-anchor"], [3, "select-anchor"], [4, "select-anchor"], [5, undefined]]);
    expect(ofType(canvas, "select")[3]).toMatchObject({ target: null });
  });

  test("ignores messages from anything but the parent and malformed commands", () => {
    const { canvas } = heroCanvas();
    canvas.fireWindow("message", { source: {}, data: { type: "select-anchor", seq: 1, frame: "hero" } });
    for (const data of [{ type: "select-anchor", seq: "2", frame: "hero" }, { type: "select-anchor", seq: 3, frame: 5 }, { type: "pick-frame", seq: 4, index: "1", id: "hero" }]) canvas.fromParent(data);
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("keeps looking for a missing anchor until 1 s after the first layout and the load, then answers null", () => {
    const later = node("p", { "data-doan-id": "late" });
    const body = node("body");
    const canvas = fakeCanvas({ readyState: "loading", body });
    canvas.ready();
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "late", selector: "#late" });
    canvas.fromParent({ type: "hover-alt", alt: true, seq: 1 });
    canvas.fromParent({ type: "hover-leave", seq: 2 });
    canvas.fromParent({ type: "hover-alt", alt: false, seq: 3 });
    expect(ofType(canvas, "select")).toEqual([]);
    body.children.push(later);
    later.parentElement = body;
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    expect(ofType(canvas, "select")).toHaveLength(1);
    expect(ofType(canvas, "select")[0]).toMatchObject({ seq: 1, target: { element: { doanId: "late" } } });

    canvas.fromParent({ type: "select-anchor", seq: 2, doanId: "never" });
    canvas.advance(1000);
    expect(ofType(canvas, "select")).toHaveLength(1);
    canvas.document.readyState = "complete";
    canvas.trigger("load");
    expect(ofType(canvas, "select")[1]).toEqual({ type: "select", href: HREF, seq: 2, viewport: 150, target: null, answer: "select-anchor" });
  });

  test("pick-frame selects the frame at that index only when its id matches", () => {
    const { canvas, hero } = heroCanvas();
    canvas.fromParent({ type: "pick-frame", seq: 1, index: 1, id: "intro" });
    canvas.fromParent({ type: "pick-frame", seq: 2, index: 7, id: "hero" });
    expect(ofType(canvas, "select")).toEqual([]);
    canvas.fireWindow("pointermove", input({ target: hero }));
    canvas.runFrame();
    expect(ofType(canvas, "hover")[0]).toMatchObject({ seq: 0 });
    canvas.fromParent({ type: "pick-frame", seq: 3, index: 1, id: "hero" });
    expect(ofType(canvas, "select")[0]).toMatchObject({ seq: 3, target: { frame: { id: "hero" }, frameIndex: 1 } });
  });

  test("clear from the renderer drops the selection from later layouts", () => {
    const { canvas, span } = heroCanvas();
    click(canvas, span);
    canvas.fromParent({ type: "clear", seq: 2 });
    canvas.trigger("resize");
    canvas.runFrame();
    expect(ofType(canvas, "layout").at(-1)).not.toHaveProperty("selected");
    expect(ofType(canvas, "select")).toHaveLength(1);
  });
});


describe("comment anchors", () => {
  test("returns shared node tokens, exact candidates and separate sequence state", () => {
    const child = node("span", { "data-doan-id": "child" });
    const frame = node("section", { "data-doan-frame": "hero", "data-doan-id": "hero" }, [child]);
    const canvas = fakeCanvas({ body: node("body", {}, [frame]), readyState: "complete" });
    canvas.context.innerWidth = 600;
    canvas.selectors.set(".hero", frame);
    canvas.selectors.set(".child", child);
    canvas.selectors.set("body", canvas.body);
    const messages = () => canvas.posted.map(p => (p as { message: Record<string, unknown> }).message);
    const document = messages().find(p => p.type === "layout")?.document;
    canvas.fromParent({ type: "anchors-query", document, generation: 1, request: 1, targets: [
      { id: "frame", frame: "hero" }, { id: "element", doanId: "hero", selector: ".hero" }, { id: "child", selector: ".child" }, { id: "root", selector: "body" },
    ] });
    canvas.runFrame();
    const reply = messages().filter(p => p.type === "anchors").at(-1) as { results: { candidates: { frame?: string[]; doanId?: string[]; selector?: string[] } }[]; rects: unknown[] } | undefined;
    expect(reply).toBeDefined();
    expect(reply?.results[0]?.candidates.frame).toEqual(reply?.results[1]?.candidates.doanId);
    expect(reply?.results[2]?.candidates.selector).not.toEqual(reply?.results[1]?.candidates.doanId);
    expect(reply?.rects).toHaveLength(3);
    const before = messages().filter(p => p.type === "anchors").length;
    canvas.fireWindow("scroll", {}); canvas.trigger("resize"); canvas.trigger("MutationObserver");
    canvas.runFrame();
    expect(messages().filter(p => p.type === "anchors")).toHaveLength(before + 1);
    canvas.fromParent({ type: "anchors-query", document: "old", generation: 1, request: 9, targets: [] });
    canvas.runFrame();
    expect(messages().filter(p => p.type === "anchors")).toHaveLength(before + 1);
    canvas.fromParent({ type: "select-anchor", seq: 1, selector: ".child" });
    expect(messages().filter(p => p.type === "select").at(-1)).toMatchObject({ seq: 1, answer: "select-anchor" });
    canvas.fromParent({ type: "select-comment", document, generation: 1, request: 1, seq: 2, node: reply?.results[3]?.candidates.selector?.[0] });
    expect(messages().filter(p => p.type === "select").at(-1)).toMatchObject({ seq: 2, answer: "select-comment", target: { tag: "body", element: { selector: "body" } } });
    canvas.fromParent({ type: "select-comment", document, generation: 1, request: 1, seq: 3, node: "missing" });
    expect(messages().filter(p => p.type === "select").at(-1)).toEqual({ type: "select", href: expect.any(String), seq: 3, viewport: expect.any(Number), target: null, answer: "select-comment" });
  });
});

test("Y2 same-size replacement recovers selected anchor token without another event", () => {
  const { canvas, button, form } = heroCanvas();
  canvas.context.innerWidth = 600;
  canvas.fromParent({ type: "measure" });
  const document = ofType(canvas, "layout")[0]?.document;
  click(canvas, button);
  canvas.fromParent({ type: "anchors-query", document, generation: 1, request: 1,
    targets: [{ id: "a", doanId: "cta", selector: "button" }] });
  canvas.runFrame();
  const before = ofType(canvas, "anchors").at(-1) as any;
  const again = node("button", { "data-doan-id": "cta" }, [], { rect: { ...button.rect } });
  button.isConnected = false;
  form.children.splice(form.children.indexOf(button), 1, again); again.parentElement = form;
  canvas.trigger("MutationObserver"); canvas.runFrame(); canvas.runFrame();
  const after = ofType(canvas, "anchors").at(-1) as any;
  expect(after.results[0].candidates.doanId[0]).not.toBe(before.selected);
  expect(after.selected).toBe(after.results[0].candidates.doanId[0]);
});

describe("draft preselection protocol", () => {
  test("waits before actual selection and rejects old, foreign and changed-document approvals", () => {
    const { canvas, span, hero } = heroCanvas();
    const command = (data: unknown, source: unknown = canvas.parent) => canvas.fireWindow("message", { source, data });
    command({ type: "draft-guard", active: true });
    click(canvas, span);
    const first = ofType(canvas, "transition-intent").at(-1)!;
    expect(first.kind).toBe("selection");
    expect(ofType(canvas, "select")).toHaveLength(0);
    click(canvas, hero);
    const second = ofType(canvas, "transition-intent").at(-1)!;
    command({ type: "transition-answer", document: first.document, intent: first.intent });
    command({ type: "transition-answer", document: second.document, intent: second.intent }, {});
    command({ type: "transition-answer", document: "old", intent: second.intent });
    expect(ofType(canvas, "select")).toHaveLength(0);
    command({ type: "transition-answer", document: second.document, intent: second.intent });
    expect(ofType(canvas, "select")).toHaveLength(1);
    expect(ofType(canvas, "select")[0]?.target).toMatchObject({ frame: { id: "hero" } });
    command({ type: "transition-answer", document: second.document, intent: second.intent });
    expect(ofType(canvas, "select")).toHaveLength(1);
  });
  test("a click on the document's own background asks as a clear; a click on an element does not", () => {
    const { canvas, span } = heroCanvas();
    canvas.fromParent({ type: "draft-guard", active: true });
    click(canvas, canvas.body);
    const background = ofType(canvas, "transition-intent").at(-1)!;
    expect(background).toMatchObject({ kind: "selection", clear: true });
    canvas.fromParent({ type: "transition-answer", document: background.document, intent: background.intent });
    expect(ofType(canvas, "clear")).toHaveLength(1);
    click(canvas, span);
    expect(ofType(canvas, "transition-intent").at(-1)).not.toHaveProperty("clear");
  });
  test("an ⌥-clicked link asks as navigation and waits for the answer", () => {
    const anchor = node("a", { href: "other.html" }, [node("b")]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [anchor]) });
    canvas.fromParent({ type: "draft-guard", active: true });
    let stopped = 0;
    click(canvas, anchor, { altKey: true, stopImmediatePropagation: () => { stopped++; } } as Partial<FakeEvent>);
    expect(stopped).toBe(1);
    const intent = ofType(canvas, "transition-intent").at(-1)!;
    expect(intent.kind).toBe("navigation");
    expect(canvas.assigned).toEqual([]);
    canvas.fromParent({ type: "transition-answer", document: intent.document, intent: intent.intent });
    expect(canvas.assigned).toEqual(["other.html"]);
  });
  test("native composition Escape does not emit a transition", () => {
    const { canvas, span } = heroCanvas();
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", isComposing: true }));
    expect(ofType(canvas, "key")).toHaveLength(0);
  });
});

describe("nextHeight after a first measurement of 0", () => {
  test("does not freeze at 0 when the document has content once the iframe is 0 tall", () => {
    const first = nextHeight(null, 0, 150);
    expect(nextHeight(first, 2600, 0)).toEqual({ sent: 2600, inner: 0, frozen: false });
  });
});
