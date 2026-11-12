import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { ancestorPath, canScrollAxis, canvasScriptSource, clipHtml, clipText, documentHeight, elementSelector, escapeTarget, frameBottom, frameStep, nextHeight, textBoundary, textDragState, textQuote, type ChainLink } from "./canvasScript";

describe("nextHeight", () => {
  test("sends the first measurement as is", () => {
    expect(nextHeight(null, 900, 150, 0)).toEqual({ sent: 900, inner: 150, frozen: false, fonts: 0 });
  });

  test("follows a canvas that grows or shrinks without tracking the viewport", () => {
    const first = nextHeight(null, 900, 150, 0);
    expect(nextHeight(first, 1200, 150, 0)).toEqual({ sent: 1200, inner: 150, frozen: false, fonts: 0 });
    expect(nextHeight(first, 900, 900, 0)).toEqual({ sent: 900, inner: 900, frozen: false, fonts: 0 });
    expect(nextHeight(first, 400, 150, 0)).toEqual({ sent: 400, inner: 150, frozen: false, fonts: 0 });
  });

  test("freezes when the document still outgrows the viewport right after our own resize", () => {
    const first = nextHeight(null, 580, 150, 0);
    // The iframe became 580 tall and the document grew with it (min-height: 100vh + padding).
    expect(nextHeight(first, 660, 580, 0)).toEqual({ sent: 580, inner: 150, frozen: true, fonts: 0 });
  });

  test("treats a resize within 1px of the sent height as our own", () => {
    const first = nextHeight(null, 580, 150, 0);
    expect(nextHeight(first, 700, 581, 0).frozen).toBe(true);
    expect(nextHeight(first, 700, 579, 0).frozen).toBe(true);
    expect(nextHeight(first, 700, 582, 0).frozen).toBe(false);
  });

  test("does not freeze when the viewport did not change", () => {
    const first = nextHeight(null, 580, 580, 0);
    expect(nextHeight(first, 900, 580, 0)).toEqual({ sent: 900, inner: 580, frozen: false, fonts: 0 });
  });

  test("does not freeze when the document fits the resized viewport", () => {
    const first = nextHeight(null, 580, 150, 0);
    expect(nextHeight(first, 581, 580, 0).frozen).toBe(false);
    expect(nextHeight(first, 580, 580, 0)).toEqual({ sent: 580, inner: 580, frozen: false, fonts: 0 });
  });

  test("stays frozen for the rest of the document", () => {
    const frozen = nextHeight(nextHeight(null, 580, 150, 0), 660, 580, 0);
    expect(nextHeight(frozen, 300, 580, 0)).toEqual(frozen);
    expect(nextHeight(frozen, 5000, 900, 0)).toEqual(frozen);
  });
});

// `fonts` counts the document's `loadingdone` events. Each round measures the
// document at the viewport we set from the previous round (measure → send →
// resize → measure), as the canvas and renderer do.
describe("nextHeight after web fonts load", () => {
  type Round = { applied: boolean; fonts: number };
  const run = (inner: number, rounds: Round[], measure: (inner: number, applied: boolean) => number) => {
    let state: ReturnType<typeof nextHeight> | null = null;
    const sent: number[] = [];
    for (const round of rounds) {
      state = nextHeight(state, measure(inner, round.applied), inner, round.fonts);
      inner = state.sent;
      sent.push(inner);
    }
    return { sent, frozen: state?.frozen };
  };
  const rounds = (applyAt: number, eventAt: number, count = 7) =>
    Array.from({ length: count }, (_, n) => ({ applied: n >= applyAt, fonts: n >= eventAt ? 1 : 0 }));
  // doan-project-settings: 7,832 px in the fallback font, 7,932 px once Geist applies.
  const swap = (_inner: number, applied: boolean) => (applied ? 7932 : 7832);

  test("grows from the fallback height to the web font height when the event comes with it", () => {
    for (const start of [150, 0]) {
      expect(run(start, rounds(1, 1), swap)).toEqual({ sent: [7832, 7932, 7932, 7932, 7932, 7932, 7932], frozen: false });
    }
  });

  test("unfreezes a height frozen by a measurement taken before the event", () => {
    for (const start of [150, 0]) {
      // Round 1 measures the web font right after our resize but before `loadingdone`.
      expect(run(start, rounds(1, 2), swap)).toEqual({ sent: [7832, 7832, 7932, 7932, 7932, 7932, 7932], frozen: false });
    }
  });

  test("grows a min-height: 100vh document once per event and freezes it again", () => {
    // min-height: 100vh plus 80 px of padding always outgrows the viewport.
    const chase = (inner: number) => inner + 80;
    const twoEvents = Array.from({ length: 10 }, (_, n) => ({ applied: true, fonts: n >= 6 ? 2 : n >= 3 ? 1 : 0 }));
    expect(run(150, twoEvents, chase)).toEqual({ sent: [230, 230, 230, 310, 310, 310, 390, 390, 390, 390], frozen: true });
    expect(run(0, twoEvents, chase)).toEqual({ sent: [80, 80, 80, 160, 160, 160, 240, 240, 240, 240], frozen: true });
  });

  test("keeps growing while events continue and freezes after the last one", () => {
    const chase = (inner: number) => inner + 80;
    const burst = Array.from({ length: 8 }, (_, n) => ({ applied: true, fonts: Math.min(n, 4) }));
    expect(run(150, burst, chase)).toEqual({ sent: [230, 310, 390, 470, 550, 550, 550, 550], frozen: true });
  });

  test("keeps today's behavior when the fonts loaded before injection", () => {
    for (const start of [150, 0]) {
      expect(run(start, rounds(0, Infinity), swap)).toEqual({ sent: [7932, 7932, 7932, 7932, 7932, 7932, 7932], frozen: false });
    }
    const chase = (inner: number) => inner + 80;
    expect(run(150, rounds(0, Infinity), chase)).toEqual({ sent: [230, 230, 230, 230, 230, 230, 230], frozen: true });
  });

  test("settles absolutely positioned frames at their extent after the font applies", () => {
    // The frames end at 405 px in the fallback font and at 425 px in the web font.
    const absolute = (inner: number, applied: boolean) => {
      const extent = applied ? 425 : 405;
      return documentHeight(0, Math.max(inner, extent), inner, extent);
    };
    for (const start of [150, 0]) {
      expect(run(start, rounds(1, 1), absolute)).toEqual({ sent: [405, 425, 425, 425, 425, 425, 425], frozen: false });
      expect(run(start, rounds(1, 2), absolute)).toEqual({ sent: [405, 405, 425, 425, 425, 425, 425], frozen: false });
    }
  });
});

// Measured in Electron 45 (800×150 viewport, 2,000px of content): a plain canvas
// reports its rect (2016), `html,body{height:100%}` and `html{height:100%}` report
// a 150 rect with scrollHeight 2000 and 2008.
describe("documentHeight", () => {
  test("uses the rect of a canvas that sizes to its content", () => {
    expect(documentHeight(2016, 2016, 150, 0)).toBe(2016);
    expect(documentHeight(80, 150, 150, 0)).toBe(80);
  });

  test("uses scrollHeight when html is as tall as the viewport and the content is taller", () => {
    expect(documentHeight(150, 2000, 150, 0)).toBe(2000);
    expect(documentHeight(150, 2008, 150, 0)).toBe(2008);
    expect(documentHeight(151, 2000, 150, 0)).toBe(2000);
    expect(documentHeight(149, 2000, 150, 0)).toBe(2000);
  });

  test("keeps the rect when it is more than 1px from the viewport", () => {
    expect(documentHeight(152, 2000, 150, 0)).toBe(152);
    expect(documentHeight(148, 2000, 150, 0)).toBe(148);
  });

  test("keeps the viewport height when nothing overflows html (a body scroller)", () => {
    expect(documentHeight(150, 150, 150, 0)).toBe(150);
  });

  test("settles once the iframe is resized to the reported height", () => {
    for (const content of [2000, 2008]) {
      const first = nextHeight(null, documentHeight(150, content, 150, 0), 150, 0);
      expect(first.sent).toBe(content);
      expect(nextHeight(first, documentHeight(content, content, content, 0), content, 0)).toEqual({ sent: content, inner: content, frozen: false, fonts: 0 });
    }
  });

  test("still freezes a 100% canvas whose content keeps outgrowing the viewport", () => {
    // html{height:100%} with body{min-height:100vh} and 8px margins: always 16px taller.
    const first = nextHeight(null, documentHeight(150, 166, 150, 0), 150, 0);
    expect(nextHeight(first, documentHeight(166, 182, 166, 0), 166, 0)).toEqual({ sent: 166, inner: 150, frozen: true, fonts: 0 });
  });
});

// Every frame `position: absolute`: html has no in-flow content (rect 0) and
// scrollHeight is the frames' extent, but never less than the viewport.
describe("documentHeight with only absolutely positioned frames", () => {
  const run = (extent: number, inner: number) => {
    let state: ReturnType<typeof nextHeight> | null = null;
    const sent: number[] = [];
    for (let n = 0; n < 6; n++) {
      state = nextHeight(state, documentHeight(0, Math.max(inner, extent), inner, extent), inner, 0);
      inner = state.sent;
      sent.push(inner);
    }
    return sent;
  };

  test("settles at the frames' extent instead of alternating with 0", () => {
    expect(run(405, 150)).toEqual([405, 405, 405, 405, 405, 405]);
  });

  test("settles from a first layout measured before the iframe had a viewport", () => {
    expect(run(405, 0)).toEqual([405, 405, 405, 405, 405, 405]);
  });

  test("settles at a frame extent below the initial height", () => {
    expect(run(100, 150)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  test("follows the frames when they move up", () => {
    const first = nextHeight(null, documentHeight(0, 405, 405, 405), 405, 0);
    expect(nextHeight(first, documentHeight(0, 405, 405, 300), 405, 0)).toEqual({ sent: 300, inner: 405, frozen: false, fonts: 0 });
  });

  // html{height:100%} with body{height:100%;overflow:auto}: html cannot scroll,
  // so scrollHeight is the viewport while the frames run on below it inside body.
  test("does not count frames below what the document itself scrolls to", () => {
    expect(documentHeight(150, 150, 150, 2000)).toBe(150);
    // A 600px box that scrolls its own frames.
    expect(documentHeight(600, 600, 150, 3000)).toBe(600);
    expect(documentHeight(600, 600, 600, 3000)).toBe(600);
  });

  test("rounds a fractional frame bottom up and keeps a taller flow height", () => {
    expect(documentHeight(0, 405, 150, 404.2)).toBe(405);
    expect(documentHeight(2016, 2016, 150, 900)).toBe(2016);
    expect(documentHeight(150, 2008, 150, 900)).toBe(2008);
  });
});

// A frame's ancestors, nearest first, up to body: position, overflow-y and the
// ancestor's bottom in document coordinates.
describe("frameBottom", () => {
  const clipper = (bottom: number, overflowY = "auto", position = "static", display = "block") => ({ position, overflowY, display, bottom });
  const plain = (position = "static") => ({ position, overflowY: "visible", display: "block", bottom: Infinity });

  test("keeps the bottom of a frame no ancestor clips", () => {
    expect(frameBottom(405, "absolute", [plain()])).toBe(405);
    expect(frameBottom(405, "static", [])).toBe(405);
  });

  test("ends a frame at the bottom of a box that scrolls or clips it", () => {
    expect(frameBottom(3000, "static", [clipper(100), plain()])).toBe(100);
    expect(frameBottom(3000, "static", [plain(), clipper(600, "hidden"), clipper(100, "clip")])).toBe(100);
  });

  test("lets an absolutely positioned frame escape clipping boxes below its containing block", () => {
    expect(frameBottom(405, "absolute", [clipper(0, "hidden"), plain()])).toBe(405);
    expect(frameBottom(405, "absolute", [clipper(100, "hidden", "relative")])).toBe(100);
    expect(frameBottom(405, "absolute", [plain("relative"), clipper(100, "hidden")])).toBe(100);
  });

  test("passes the escape on through an absolutely positioned ancestor", () => {
    expect(frameBottom(500, "static", [plain("absolute"), clipper(100, "hidden")])).toBe(500);
    expect(frameBottom(500, "static", [plain("absolute"), clipper(100, "hidden", "relative")])).toBe(100);
  });

  // Overflow applies to block, flex and grid containers only (CSS Overflow 3 §3);
  // elsewhere the computed value stays as specified and clips nothing.
  test("ignores overflow on boxes it does not apply to", () => {
    for (const display of ["inline", "contents", "table-row", "table-row-group", "table-column", "ruby"]) {
      expect(frameBottom(405, "absolute", [clipper(20, "hidden", "relative", display)])).toBe(405);
      expect(frameBottom(3000, "static", [clipper(20, "hidden", "static", display)])).toBe(3000);
    }
    for (const display of ["block", "inline-block", "flow-root", "flex", "inline-flex", "grid", "list-item", "table-cell"]) {
      expect(frameBottom(3000, "static", [clipper(100, "hidden", "static", display)])).toBe(100);
    }
  });

  test("an inline containing block still lets the boxes above it clip", () => {
    expect(frameBottom(405, "absolute", [clipper(20, "hidden", "relative", "inline"), clipper(100, "hidden")])).toBe(100);
  });

  test("no ancestor clips a fixed frame or anything inside a fixed ancestor", () => {
    expect(frameBottom(500, "fixed", [clipper(100, "hidden", "relative")])).toBe(500);
    expect(frameBottom(500, "static", [plain("fixed"), clipper(100, "hidden", "relative")])).toBe(500);
    expect(frameBottom(500, "static", [clipper(300, "auto", "fixed"), clipper(100, "hidden", "relative")])).toBe(300);
  });
});

// An absolute 405 px frame in an inline `position: relative; overflow: hidden`
// span: html is one short line tall, the span ends with it.
describe("documentHeight with an absolute frame inside an inline wrapper", () => {
  test("settles at the frame's extent, not the line's", () => {
    let state: ReturnType<typeof nextHeight> | null = null;
    let inner = 150;
    const sent: number[] = [];
    for (let n = 0; n < 6; n++) {
      const bottom = frameBottom(405, "absolute", [{ position: "relative", overflowY: "hidden", display: "inline", bottom: 20 }]);
      state = nextHeight(state, documentHeight(20, Math.max(inner, 405), inner, bottom), inner, 0);
      inner = state.sent;
      sent.push(inner);
    }
    expect(sent).toEqual([405, 405, 405, 405, 405, 405]);
  });
});

// A 3,000 px frame inside an in-flow `overflow: auto` box: html is as tall as
// the box, scrollHeight never below the viewport.
describe("documentHeight with a frame inside a box that scrolls it", () => {
  const run = (box: number, inner: number) => {
    let state: ReturnType<typeof nextHeight> | null = null;
    const sent: number[] = [];
    for (let n = 0; n < 6; n++) {
      const bottom = frameBottom(3000, "static", [{ position: "static", overflowY: "auto", display: "block", bottom: box }]);
      state = nextHeight(state, documentHeight(box, Math.max(inner, box), inner, bottom), inner, 0);
      inner = state.sent;
      sent.push(inner);
    }
    return sent;
  };

  test("settles at a box shorter than the initial height", () => {
    expect(run(100, 150)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  test("shrinks with the box when it shrinks in place", () => {
    expect(run(600, 150)).toEqual([600, 600, 600, 600, 600, 600]);
    expect(run(100, 600)).toEqual([100, 100, 100, 100, 100, 100]);
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
  style?: { overflowX: string; overflowY: string; position?: string; display?: string };
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
  querySelector(selector: string): FakeNode | null;
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
    // Only the `[attribute]` form the script uses on elements.
    querySelector: (selector) => {
      const attr = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
      if (attr === undefined) throw new SyntaxError(`unsupported selector ${selector}`);
      return descendants(self).find((el) => el.hasAttribute(attr)) ?? null;
    },
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
  const fontListeners = new Map<string, Listener[]>();
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
    parentElement: el.parentElement ?? null,
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
    fonts: { ready: new Promise<void>(() => {}), addEventListener: add(fontListeners) },
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
    getComputedStyle: (el: FakeElement) => el.style ?? { overflowX: "visible", overflowY: "visible", position: "static" },
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
    fireFonts: (type: string) => fire(fontListeners, type, {}),
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

  test("unfreezes the height once when web fonts finish loading", () => {
    const canvas = fakeCanvas({ height: 7832 });
    canvas.ready();
    // Resized to the fallback height, the document measures in the web font before `loadingdone`.
    canvas.context.innerHeight = 7832;
    canvas.state.height = 7932;
    canvas.html.scrollHeight = 7932;
    canvas.trigger("ResizeObserver");
    canvas.runFrame();
    canvas.trigger("ResizeObserver");
    canvas.runFrame();
    canvas.fireFonts("loadingdone");
    canvas.runFrame();
    expect(ofType(canvas, "layout").map((message) => message.height)).toEqual([7832, 7832, 7832, 7932]);
  });

  // An iframe outside the visible area gets no animation frames, and after a
  // confirming layout the renderer pulls no more measures (POSTMORTEM 2026-10-26).
  test("posts the web font height without an animation frame after a confirming layout", () => {
    const canvas = fakeCanvas({ height: 7832 });
    canvas.ready();
    canvas.context.innerHeight = 7832;
    canvas.fromParent({ type: "measure" });
    canvas.state.height = 7932;
    canvas.html.scrollHeight = 7932;
    canvas.fireFonts("loadingdone");
    expect(ofType(canvas, "layout").map((message) => message.height)).toEqual([7832, 7832, 7932]);
  });

  test("counts a web font load between an early measure and DOMContentLoaded", () => {
    const canvas = fakeCanvas({ height: 7832 });
    // A measure pulled before DOMContentLoaded records the fallback height.
    canvas.fromParent({ type: "measure" });
    canvas.context.innerHeight = 7832;
    canvas.state.height = 7932;
    canvas.html.scrollHeight = 7932;
    canvas.fireFonts("loadingdone");
    expect(ofType(canvas, "layout").map((message) => message.height)).toEqual([7832]);
    canvas.ready();
    canvas.fromParent({ type: "measure" });
    canvas.fromParent({ type: "measure" });
    expect(ofType(canvas, "layout").map((message) => message.height)).toEqual([7832, 7932, 7932, 7932]);
  });

  test("posts nothing for a web font load before DOMContentLoaded", () => {
    const canvas = fakeCanvas({ height: 7932 });
    canvas.fireFonts("loadingdone");
    expect(canvas.posted).toEqual([]);
    canvas.ready();
    expect(ofType(canvas, "layout").map((message) => message.height)).toEqual([7932]);
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

  test("reports the bottom of absolutely positioned frames when html has no height", () => {
    // scrollY is 40 in the fake: the frame ends at 365 + 40 in document coordinates.
    const canvas = fakeCanvas({ height: 0, scrollHeight: 405, frames: [{ attrs: { "data-doan-frame": "a" }, rect: { left: 0, top: 265, width: 300, height: 100 } }] });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({ message: { type: "layout", height: 405, viewport: 150 } });
  });

  test("keeps an absolute frame that an inline wrapper's overflow cannot clip", () => {
    // The span is one 20 px line: 20 - 40 + 40 = 20 in document coordinates (scrollY is 40 in the fake).
    const span = { nodeType: 1, style: { overflowX: "hidden", overflowY: "hidden", position: "relative", display: "inline" }, getBoundingClientRect: () => ({ left: 0, top: -40, width: 100, height: 20 }), parentElement: null };
    const canvas = fakeCanvas({ height: 20, scrollHeight: 405, frames: [{ attrs: { "data-doan-frame": "a" }, style: { overflowX: "visible", overflowY: "visible", position: "absolute" }, rect: { left: 0, top: -40, width: 100, height: 405 }, parentElement: span as unknown as FakeElement }] });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({ message: { type: "layout", height: 405 } });
  });

  test("does not grow past a short box that scrolls its frame", () => {
    // The box ends at 20 + 40 + 40 = 100 in document coordinates (scrollY is 40 in the fake).
    const box = { nodeType: 1, style: { overflowX: "auto", overflowY: "auto", position: "static" }, getBoundingClientRect: () => ({ left: 0, top: 20, width: 800, height: 40 }), parentElement: null };
    const canvas = fakeCanvas({ height: 100, scrollHeight: 150, frames: [{ attrs: { "data-doan-frame": "a" }, rect: { left: 0, top: -40, width: 800, height: 3000 }, parentElement: box as unknown as FakeElement }] });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({ message: { type: "layout", height: 100 } });
  });

  test("counts frames past the listed 1,000 in the height", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ attrs: { "data-doan-frame": `f${i}` }, rect: { left: 0, top: i === 1000 ? 4960 : 0, width: 10, height: i === 1000 ? 100 : 10 } }));
    const canvas = fakeCanvas({ height: 0, scrollHeight: 5100, frames: many });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({ message: { type: "layout", height: 5100, truncated: true } });
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
  code?: string;
  keyCode?: number;
  repeat?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  type?: string;
  target: unknown;
  isTrusted: boolean;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  key?: string;
  relatedTarget?: unknown;
  shiftKey?: boolean;
  clientX?: number;
  clientY?: number;
  screenX?: number;
  screenY?: number;
  pointerId?: number;
  clipboardData?: unknown;
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
  test("a ⌘-click selects the element under it with anchors, path and frame", () => {
    const { canvas, span } = heroCanvas();
    const event = click(canvas, span, { metaKey: true });
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

  // The app's document never sees a press inside the canvas frame, yet its open lists close on a press anywhere outside
  // them: every trusted press says so, whatever its button or modifier, and before any click selects.
  test("every trusted press, ⌥, right and Ctrl included, posts a press; the canvas's own presses and later events do not", () => {
    const { canvas, span, field } = heroCanvas();
    for (const fields of [{}, { altKey: true }, { button: 2 }, { ctrlKey: true }, { button: 1 }]) canvas.fireWindow("pointerdown", input({ target: span, ...fields }));
    expect(ofType(canvas, "press")).toEqual(Array(5).fill({ type: "press" }));
    canvas.fireWindow("pointerdown", input({ target: field, isTrusted: false }));
    for (const type of ["mousedown", "click", "dblclick"]) canvas.fireWindow(type, input({ target: span }));
    expect(ofType(canvas, "press")).toHaveLength(5);
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

  // The app takes one Select step per forwarded Esc, so a held Esc's auto-repeats stay in the canvas.
  test("does not forward a held Esc's auto-repeats", () => {
    const { canvas, span } = heroCanvas();
    canvas.fireWindow("keydown", input({ target: span, key: "Escape" }));
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", repeat: true }));
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", repeat: true }));
    expect(ofType(canvas, "key")).toEqual([{ type: "key", href: HREF, seq: 0, viewport: 150, key: "Escape" }]);
  });

  test("forwards Space down/up outside editable elements, ignores repeat", () => {
    const { canvas, span, field } = heroCanvas();
    for (const target of [span, canvas.body, field, node("textarea"), node("select"), node("div", {}, [], { isContentEditable: true })]) {
      canvas.fireWindow("keydown", input({ target, code: "Space", key: " " }));
      canvas.fireWindow("keydown", input({ target, code: "Space", key: " ", repeat: true }));
      canvas.fireWindow("keyup", input({ target, code: "Space", key: " " }));
    }
    for (const ignored of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      for (const type of ["keydown", "keyup"]) canvas.fireWindow(type, input({ target: span, code: "Space", ...ignored }));
    }
    expect(ofType(canvas, "key")).toEqual([true, false, true, false, ...Array<boolean>(9).fill(false)].map(down => ({
      type: "key", href: HREF, seq: 0, viewport: 150, key: "Space", down,
    })));
  });

  test("releases Space across editable targets, modifiers and composition without blocking editing", () => {
    const { canvas, span, field } = heroCanvas();
    for (const fields of [{ target: field }, { target: span, metaKey: true }, { target: span, ctrlKey: true }, { target: span, altKey: true }, { target: span, isComposing: true }, { target: span, keyCode: 229 }]) {
      canvas.fireWindow("keydown", input({ target: span, code: "Space" }));
      const event = input({ code: "Space", ...fields });
      canvas.fireWindow("keyup", event);
      expect(ofType(canvas, "key").at(-1)).toMatchObject({ key: "Space", down: false });
      expect(event.prevented).toBe(fields.target !== field);
    }
  });

  test("prevents Space scrolling the canvas", () => {
    const { canvas, span, button, field } = heroCanvas();
    for (const target of [span, canvas.body, button]) {
      for (const fields of [{}, { repeat: true }]) {
        for (const type of ["keydown", "keyup"]) {
          const event = input({ target, code: "Space", ...fields });
          canvas.fireWindow(type, event);
          expect(event.prevented).toBe(true);
        }
      }
    }
    for (const fields of [{ target: field }, { target: span, metaKey: true }, { target: span, ctrlKey: true }, { target: span, altKey: true }, { target: span, isComposing: true }, { target: span, keyCode: 229 }]) {
      const event = input({ code: "Space", ...fields });
      canvas.fireWindow("keydown", event);
      expect(event.prevented).toBe(false);
    }
  });

  test("sends Space up on blur", () => {
    const { canvas, span } = heroCanvas();
    canvas.fireWindow("keydown", input({ target: span, code: "Space" }));
    canvas.fireWindow("blur", {});
    expect(ofType(canvas, "key")).toEqual([true, false].map(down => ({
      type: "key", href: HREF, seq: 0, viewport: 150, key: "Space", down,
    })));
    canvas.fireWindow("blur", {});
    expect(ofType(canvas, "key")).toHaveLength(2);
  });

  test("forwards V and H outside editable elements", () => {
    const { canvas, span, field } = heroCanvas();
    for (const { code, key } of [{ code: "KeyV", key: "ㅍ" }, { code: "KeyH", key: "ㅗ" }]) {
      for (const target of [span, canvas.body, field, node("textarea"), node("select"), node("div", {}, [], { isContentEditable: true })]) {
        canvas.fireWindow("keydown", input({ target, code, key }));
        canvas.fireWindow("keyup", input({ target, code, key }));
      }
      for (const ignored of [{ repeat: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }]) {
        canvas.fireWindow("keydown", input({ target: span, code, key, ...ignored }));
      }
    }
    canvas.fireWindow("keydown", input({ target: span, code: "KeyX", key: "v" }));
    expect(ofType(canvas, "key")).toEqual(["V", "V", "H", "H"].map(key => ({
      type: "key", href: HREF, seq: 0, viewport: 150, key,
    })));
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

  // A nested iframe has no script of ours, so a press in it shows only as focus moving into it: that is the press the
  // app's preset lists close on, sent before the selection or pick it leads to, with or without ⌥.
  test("focus moving into a nested iframe posts a press before its selection, ⌥ included", () => {
    const types = (canvas: { posted: unknown[] }) => messages(canvas).map(message => message.type).filter(type => type === "press" || type === "select" || type === "picked");
    const nested = node("iframe");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [nested]) });
    canvas.document.activeElement = nested;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
    expect(types(canvas)).toEqual(["press", "select"]);
    const inner = node("iframe");
    const alt = fakeCanvas({ readyState: "interactive", body: node("body", {}, [inner]) });
    alt.fireWindow("pointermove", input({ target: inner, altKey: true }));
    alt.document.activeElement = inner;
    alt.fireWindow("blur", {});
    alt.advance(0);
    expect(types(alt)).toEqual(["press"]);
    // Focus leaving for anything else is not a press.
    const away = fakeCanvas({ readyState: "interactive", body: node("body", {}, [node("p")]) });
    away.fireWindow("blur", {});
    away.advance(0);
    expect(types(away)).toEqual([]);
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
    click(canvas, inDup, { metaKey: true });
    click(canvas, inEmpty, { metaKey: true });
    const targets = ofType(canvas, "select").map((m) => m.target as { frame: unknown; frameIndex: number; element: { selector: string } });
    expect(targets[0]).toMatchObject({ frame: { id: "d" }, frameIndex: 1, element: { selector: "body > div:nth-of-type(2) > p:nth-of-type(1)" } });
    expect(targets[1]).toMatchObject({ frame: { id: "" }, frameIndex: 2, element: { selector: '[data-doan-frame=""] > p:nth-of-type(1)' } });
  });

  test("clips frame strings and html, folds text, and leaves out an over-long doanId", () => {
    const el = node("p", { "data-doan-id": "x".repeat(201) }, [], { outerHTML: "h".repeat(2001), textContent: "t".repeat(501) });
    const frame = node("div", { "data-doan-frame": "f".repeat(201), "data-doan-title": "T".repeat(201), "data-doan-implements": "i".repeat(501) }, [el]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [frame]) });
    click(canvas, el, { metaKey: true });
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
    move(canvas, button, { metaKey: true });
    move(canvas, span, { metaKey: true });
    expect(ofType(canvas, "hover")).toEqual([]);
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toEqual([{ type: "hover", href: HREF, seq: 0, viewport: 150, rect: { x: 10, y: 20, width: 60.5, height: 18 } }]);
    move(canvas, span, { metaKey: true });
    canvas.runFrame();
    expect(ofType(canvas, "hover")).toHaveLength(1);
  });

  // The app never sees pointer moves inside the canvas frame and hover is sent only when
  // its rect changes, so trusted moves also post an activity message, at most once a second and without an animation
  // frame, which an off-screen frame never gets.
  test("trusted moves post activity at most once a second, over the same element too", () => {
    const { canvas, span } = heroCanvas();
    canvas.state.now = 10_000;
    move(canvas, span);
    expect(ofType(canvas, "activity")).toEqual([{ type: "activity" }]);
    canvas.state.now += 500; move(canvas, span);
    expect(ofType(canvas, "activity")).toHaveLength(1);
    canvas.state.now += 500; move(canvas, span);
    expect(ofType(canvas, "activity")).toHaveLength(2);
    canvas.state.now += 2000; move(canvas, span, { isTrusted: false });
    expect(ofType(canvas, "activity")).toHaveLength(2);
  });

  test("resends the same element after the app reports a canvas leave", () => {
    const { canvas, span } = heroCanvas();
    move(canvas, span, { metaKey: true });
    canvas.runFrame();
    canvas.fromParent({ type: "hover-leave", seq: 1 });
    move(canvas, span, { metaKey: true });
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
    move(canvas, span, { metaKey: true });
    canvas.runFrame();
    click(canvas, span, { metaKey: true });
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 1 });
    expect(ofType(canvas, "hover").at(-1)).toMatchObject({ seq: 0, rect: null });
    move(canvas, button, { metaKey: true });
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
    click(canvas, button, { metaKey: true });
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
    click(canvas, span, { metaKey: true });
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
    click(canvas, button, { metaKey: true });
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
    click(canvas, span, { metaKey: true });
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
    click(canvas, span, { metaKey: true });
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


describe("chip anchors", () => {
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
    // The pin command went with the app's comment pins: an anchors node selects nothing.
    const selects = messages().filter(p => p.type === "select").length;
    canvas.fromParent({ type: "select-comment", document, generation: 1, request: 1, seq: 2, node: reply?.results[3]?.candidates.selector?.[0] });
    expect(messages().filter(p => p.type === "select")).toHaveLength(selects);
  });
});

test("same-size replacement recovers selected anchor token without another event", () => {
  const { canvas, button, form } = heroCanvas();
  canvas.context.innerWidth = 600;
  canvas.fromParent({ type: "measure" });
  const document = ofType(canvas, "layout")[0]?.document;
  click(canvas, button, { metaKey: true });
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

// The app's comment drafts and their guard are gone: a click, a background click and an
// ⌥-clicked link act at once, and the guard's messages from the app change nothing.
describe("selection without a draft guard", () => {
  test("a click selects at once, and draft-guard and transition-answer messages are ignored", () => {
    const { canvas, span, hero } = heroCanvas();
    canvas.fromParent({ type: "draft-guard", active: true });
    click(canvas, span);
    expect(ofType(canvas, "select")).toHaveLength(1);
    click(canvas, hero);
    expect(ofType(canvas, "select")).toHaveLength(2);
    expect(ofType(canvas, "select")[1]?.target).toMatchObject({ frame: { id: "hero" } });
    const document = ofType(canvas, "layout")[0]?.document;
    canvas.fromParent({ type: "transition-answer", document, intent: 1 });
    expect(ofType(canvas, "select")).toHaveLength(2);
    expect(ofType(canvas, "transition-intent")).toHaveLength(0);
  });
  test("a click on the document's own background clears at once", () => {
    const { canvas, span } = heroCanvas();
    click(canvas, span);
    click(canvas, canvas.body);
    expect(ofType(canvas, "clear")).toHaveLength(1);
    expect(ofType(canvas, "transition-intent")).toHaveLength(0);
  });
  test("an ⌥-clicked link navigates at once and leaves the event to the page", () => {
    const anchor = node("a", { href: "other.html" }, [node("b")]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [anchor]) });
    canvas.fromParent({ type: "draft-guard", active: true });
    let stopped = 0;
    click(canvas, anchor, { altKey: true, stopImmediatePropagation: () => { stopped++; } } as Partial<FakeEvent>);
    expect(stopped).toBe(0);
    expect(canvas.assigned).toEqual(["other.html"]);
    expect(ofType(canvas, "transition-intent")).toHaveLength(0);
  });
  test("native composition Escape does not emit a key", () => {
    const { canvas, span } = heroCanvas();
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", isComposing: true }));
    expect(ofType(canvas, "key")).toHaveLength(0);
  });
});

describe("nextHeight after a first measurement of 0", () => {
  test("does not freeze at 0 when the document has content once the iframe is 0 tall", () => {
    const first = nextHeight(null, 0, 150, 0);
    expect(nextHeight(first, 2600, 0, 0)).toEqual({ sent: 2600, inner: 0, frozen: false, fonts: 0 });
  });
});

// Picking is the canvas script's internal command. Start and cancel
// use their own seq, a pick click answers `picked` and leaves the selection, its anchor and the hover as they were.
describe("canvasScript picking", () => {
  const at = (x: number, y: number) => ({ clientX: x, clientY: y }) as Partial<FakeEvent>;
  const picked = (canvas: ReturnType<typeof fakeCanvas>) => ofType(canvas, "picked");
  const tokenOf = (canvas: ReturnType<typeof fakeCanvas>) => {
    const before = canvas.posted.length;
    canvas.fromParent({ type: "measure" });
    const token = (canvas.posted[before] as { message: { document: string } }).message.document;
    canvas.posted.splice(before);
    return token;
  };
  // Sends a pick command for the current document and leaves no message of its own behind (the ack has its own test).
  const command = (canvas: ReturnType<typeof fakeCanvas>, type: string, seq: number, extra: Record<string, unknown> = {}) => {
    const document = tokenOf(canvas);
    const before = canvas.posted.length;
    canvas.fromParent({ type, seq, document, ...extra });
    canvas.posted.splice(before);
  };
  const startPick = (canvas: ReturnType<typeof fakeCanvas>, seq: number) => command(canvas, "pick-start", seq);
  const cancelPick = (canvas: ReturnType<typeof fakeCanvas>, seq: number) => command(canvas, "pick-cancel", seq);

  test("a click while picking answers with the element and changes no selection, anchor or hover", () => {
    const { canvas, span, button } = heroCanvas();
    canvas.context.innerWidth = 600;
    click(canvas, button, { metaKey: true });
    startPick(canvas, 1);
    canvas.posted.length = 0;
    const event = click(canvas, span);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
    expect(messages(canvas)).toEqual([{ type: "picked", href: HREF, document: expect.any(String), pick: 1, target: expect.objectContaining({ tag: "span", element: expect.objectContaining({ selector: '[data-doan-id="cta"] > span:nth-of-type(1)' }) }) }]);
    // The selection is still the button: the next layout reports its rect at the click's selection seq.
    canvas.fromParent({ type: "measure" });
    expect(ofType(canvas, "layout").at(-1)).toMatchObject({ seq: 1, selected: { x: 1, y: 2, width: 30, height: 40 } });
    canvas.fromParent({ type: "anchors-query", document: ofType(canvas, "layout")[0]?.document, generation: 1, request: 1, targets: [{ id: "a", doanId: "cta", selector: "x" }] });
    const reply = ofType(canvas, "anchors").at(-1) as { selected: string; results: { candidates: { doanId: string[] } }[]; selectionSeq: number };
    expect(reply.selected).toBe(reply.results[0]?.candidates.doanId[0]);
    expect(reply.selectionSeq).toBe(1);
  });

  test("keeps picking until the app cancels, then a click selects again", () => {
    const { canvas, span, button } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, span);
    click(canvas, button);
    expect(picked(canvas)).toHaveLength(2);
    expect(ofType(canvas, "select")).toHaveLength(0);
    cancelPick(canvas, 2);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(2);
    expect(ofType(canvas, "select")).toEqual([expect.objectContaining({ seq: 1 })]);
  });

  test("the pick channel has its own seq: stale pick commands are ignored and selection commands still apply", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 5);
    cancelPick(canvas, 4);
    click(canvas, span);
    expect(picked(canvas).at(-1)).toMatchObject({ pick: 5 });
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "cta" });
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 1, answer: "select-anchor" });
    cancelPick(canvas, 6);
    startPick(canvas, 6);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(1);
    const document = tokenOf(canvas);
    for (const bad of [{ type: "pick-start", document }, { type: "pick-start", seq: 7.5, document }, { type: "pick-start", seq: "8", document }, { type: "pick-start", seq: 9 }, { type: "pick-start", seq: 9, document: "other" }]) canvas.fromParent(bad);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(1);
  });

  test("Esc while picking answers cancelled instead of an Escape key, wherever focus is in the canvas, and ends picking", () => {
    const { canvas, span, field } = heroCanvas();
    startPick(canvas, 3);
    const event = input({ target: field, key: "Escape" });
    canvas.fireWindow("keydown", event);
    expect(event.prevented).toBe(true);
    expect(picked(canvas)).toEqual([{ type: "picked", href: HREF, document: expect.any(String), pick: 3, cancelled: true }]);
    expect(ofType(canvas, "key")).toHaveLength(0);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(1);
    expect(ofType(canvas, "select")).toHaveLength(1);
    canvas.fireWindow("keydown", input({ target: span, key: "Escape" }));
    expect(ofType(canvas, "key")).toEqual([expect.objectContaining({ key: "Escape" })]);
  });

  test("a held Esc that cancels a pick forwards none of its auto-repeats", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 3);
    canvas.fireWindow("keydown", input({ target: span, key: "Escape" }));
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", repeat: true }));
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", repeat: true }));
    expect(picked(canvas)).toEqual([expect.objectContaining({ pick: 3, cancelled: true })]);
    expect(ofType(canvas, "key")).toHaveLength(0);
  });

  test("an Escape during IME composition does not cancel", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 1);
    canvas.fireWindow("keydown", input({ target: span, key: "Escape", isComposing: true }));
    expect(picked(canvas)).toHaveLength(0);
  });

  test("an ⌥-click picks too, and a link under it does not navigate", () => {
    const anchor = node("a", { href: "other.html" }, [node("b")]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [node("section", { "data-doan-frame": "nav" }, [anchor])]) });
    startPick(canvas, 1);
    for (const type of ["pointerdown", "mousedown", "click"]) {
      const event = input({ target: anchor, altKey: true });
      canvas.fireWindow(type, event);
      expect(event.prevented).toBe(true);
    }
    expect(canvas.assigned).toEqual([]);
    expect(picked(canvas)).toEqual([expect.objectContaining({ pick: 1, target: expect.objectContaining({ tag: "a" }) })]);
  });

  test("right and Ctrl clicks do not pick", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, span, { button: 2 });
    click(canvas, span, { ctrlKey: true });
    expect(picked(canvas)).toHaveLength(0);
  });

  test("a click on a frame's own background picks the frame", () => {
    const { canvas, hero } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, hero, at(30, 50));
    const target = picked(canvas)[0]?.target as Record<string, unknown>;
    expect(target).toMatchObject({ tag: "section", frame: { id: "hero", title: "Hero" } });
    expect(target).not.toHaveProperty("element");
  });

  // Shift had no meaning in the canvas before (a Shift-click selected like a click, and still does outside picking).
  test("a Shift-click is a point at that spot in document coordinates, whatever element is under it, also with ⌥", () => {
    const { canvas, hero, span } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, span, { ...at(30, 50), shiftKey: true } as Partial<FakeEvent>);
    click(canvas, hero, { ...at(7, 8), shiftKey: true, altKey: true } as Partial<FakeEvent>);
    expect(picked(canvas)).toEqual([
      { type: "picked", href: HREF, document: expect.any(String), pick: 1, point: { x: 30, y: 90 } },
      { type: "picked", href: HREF, document: expect.any(String), pick: 1, point: { x: 7, y: 48 } },
    ]);
    cancelPick(canvas, 2);
    click(canvas, span, { shiftKey: true } as Partial<FakeEvent>);
    expect(ofType(canvas, "select")).toHaveLength(1);
  });

  test("a click on the document outside every frame inserts nothing and keeps picking", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, canvas.body, at(5, 5));
    click(canvas, canvas.html, at(5, 5));
    click(canvas, canvas.body, { ...at(5, 5), shiftKey: true } as Partial<FakeEvent>);
    expect(messages(canvas)).toEqual([]);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(1);
  });

  test("the wheel still pans and zooms the board while picking", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 1);
    canvas.fireWindow("wheel", wheelEvent({ target: span, deltaY: 30, ctrlKey: true }));
    expect(ofType(canvas, "wheel")).toEqual([expect.objectContaining({ dy: 30, ctrl: true })]);
  });

  test("focus moving into a nested iframe picks the iframe instead of selecting it", () => {
    const nested = node("iframe");
    const frame = node("section", { "data-doan-frame": "embed" }, [nested]);
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [frame]) });
    startPick(canvas, 1);
    canvas.document.activeElement = nested;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
    expect(ofType(canvas, "select")).toHaveLength(0);
    expect(picked(canvas)).toEqual([expect.objectContaining({ pick: 1, target: expect.objectContaining({ tag: "iframe" }) })]);
    // The press the app's lists close on comes first.
    expect(messages(canvas).map(message => message.type).filter(type => type === "press" || type === "picked")).toEqual(["press", "picked"]);
  });
  test("acknowledges a pick-start for its own document only, so the app can open the canvas to clicks", () => {
    const { canvas, span } = heroCanvas();
    const document = tokenOf(canvas);
    canvas.fromParent({ type: "pick-start", seq: 1, document: "an earlier document" });
    click(canvas, span);
    expect(ofType(canvas, "pick-started")).toEqual([]);
    expect(picked(canvas)).toEqual([]);
    canvas.fromParent({ type: "pick-start", seq: 2, document });
    expect(ofType(canvas, "pick-started")).toEqual([{ type: "pick-started", href: HREF, document, pick: 2 }]);
    canvas.fromParent({ type: "pick-start", seq: 2, document });
    expect(ofType(canvas, "pick-started")).toHaveLength(1);
    click(canvas, span);
    expect(picked(canvas)).toEqual([expect.objectContaining({ document, pick: 2 })]);
  });

  test("elements, wrappers and nested iframes outside every frame pick nothing, with or without Shift, and picking goes on", () => {
    const note = node("p", {}, [node("em")]);
    const inside = node("span");
    const frame = node("section", { "data-doan-frame": "card" }, [inside]);
    const wrapper = node("div", {}, [frame]);
    const loose = node("iframe");
    const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [note, wrapper, loose]) });
    canvas.posted.length = 0;
    startPick(canvas, 1);
    for (const target of [note, note.children[0], wrapper, loose]) {
      click(canvas, target);
      click(canvas, target, { ...at(5, 5), shiftKey: true } as Partial<FakeEvent>);
    }
    canvas.document.activeElement = loose;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
    // Focus moving into the loose iframe is still a press in the canvas, though it picks nothing.
    expect(messages(canvas)).toEqual([{ type: "press" }]);
    click(canvas, inside);
    click(canvas, inside, { ...at(5, 5), shiftKey: true } as Partial<FakeEvent>);
    expect(picked(canvas)).toEqual([
      expect.objectContaining({ target: expect.objectContaining({ tag: "span", frame: { id: "card" } }) }),
      expect.objectContaining({ point: { x: 5, y: 45 } }),
    ]);
  });
  // The board's crosshair while picking. The cursor over the canvas is the canvas document's own,
  // so the script adopts a constructed sheet: it changes no DOM node, so no MutationObserver or layout runs for it.
  test("adopts a crosshair sheet while picking and removes only its own when picking ends", () => {
    const { canvas, span } = heroCanvas();
    class FakeSheet { text = ""; replaceSync(text: string) { this.text = text; } }
    canvas.context.CSSStyleSheet = FakeSheet;
    const own = new FakeSheet();
    const doc = canvas.document as unknown as { adoptedStyleSheets: FakeSheet[] };
    doc.adoptedStyleSheets = [own];
    const ours = () => doc.adoptedStyleSheets.filter(sheet => sheet !== own);
    startPick(canvas, 1);
    expect(doc.adoptedStyleSheets[0]).toBe(own);
    expect(ours().map(sheet => sheet.text)).toEqual(["*{cursor:crosshair!important}"]);
    // A second start keeps one sheet.
    startPick(canvas, 2);
    expect(ours()).toHaveLength(1);
    cancelPick(canvas, 3);
    expect(doc.adoptedStyleSheets).toEqual([own]);
    startPick(canvas, 4);
    canvas.fireWindow("keydown", input({ target: span, key: "Escape" }));
    expect(doc.adoptedStyleSheets).toEqual([own]);
    // The canvas replacing its own list meanwhile keeps whatever it set.
    startPick(canvas, 5);
    const later = new FakeSheet();
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, later];
    cancelPick(canvas, 6);
    expect(doc.adoptedStyleSheets).toEqual([own, later]);
    expect(ofType(canvas, "layout")).toHaveLength(0);
  });

  test("picks without a crosshair where constructed sheets are missing", () => {
    const { canvas, span } = heroCanvas();
    startPick(canvas, 1);
    click(canvas, span);
    expect(picked(canvas)).toHaveLength(1);
  });
});

// The hand while the app's drag layer is up (Hand, a held Space, a drag). A pointer resting over the canvas keeps the
// cursor this out-of-process document last set until it moves, so the layer's own grab cursor does not show there.
describe("hand cursor", () => {
  class FakeSheet { text = ""; replaceSync(text: string) { this.text = text; } }
  const setup = () => {
    const { canvas } = heroCanvas();
    canvas.context.CSSStyleSheet = FakeSheet;
    const own = new FakeSheet();
    const doc = canvas.document as unknown as { adoptedStyleSheets: FakeSheet[] };
    doc.adoptedStyleSheets = [own];
    const ours = () => doc.adoptedStyleSheets.filter(sheet => sheet !== own).map(sheet => sheet.text);
    return { canvas, doc, own, ours };
  };

  test("adopts a grab sheet while the layer is up and removes only its own when it goes down", () => {
    const { canvas, doc, own, ours } = setup();
    canvas.fromParent({ type: "hover-hand", hand: true, seq: 1 });
    expect(doc.adoptedStyleSheets[0]).toBe(own);
    expect(ours()).toEqual(["*{cursor:grab!important}"]);
    // A second raise keeps one sheet.
    canvas.fromParent({ type: "hover-hand", hand: true, seq: 2 });
    expect(ours()).toHaveLength(1);
    canvas.fromParent({ type: "hover-hand", hand: false, seq: 3 });
    expect(doc.adoptedStyleSheets).toEqual([own]);
    // The canvas replacing its own list meanwhile keeps whatever it set.
    canvas.fromParent({ type: "hover-hand", hand: true, seq: 4 });
    const later = new FakeSheet();
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, later];
    canvas.fromParent({ type: "hover-hand", hand: false, seq: 5 });
    expect(doc.adoptedStyleSheets).toEqual([own, later]);
    expect(ofType(canvas, "layout")).toHaveLength(0);
  });

  test("takes the hover channel's order: an older command changes nothing", () => {
    const { canvas, ours } = setup();
    canvas.fromParent({ type: "hover-hand", hand: true, seq: 5 });
    canvas.fromParent({ type: "hover-hand", hand: false, seq: 4 });
    expect(ours()).toEqual(["*{cursor:grab!important}"]);
    canvas.fromParent({ type: "hover-alt", alt: true, seq: 6 });
    canvas.fromParent({ type: "hover-hand", hand: false, seq: 6 });
    expect(ours()).toEqual(["*{cursor:grab!important}"]);
    canvas.fromParent({ type: "hover-hand", hand: false, seq: 7 });
    expect(ours()).toEqual([]);
  });

  test("drops a command without a boolean hand", () => {
    const { canvas, ours } = setup();
    for (const hand of [undefined, "true", 1]) canvas.fromParent({ type: "hover-hand", hand, seq: 1 });
    expect(ours()).toEqual([]);
    // None of them used up the seq.
    canvas.fromParent({ type: "hover-hand", hand: true, seq: 1 });
    expect(ours()).toEqual(["*{cursor:grab!important}"]);
  });

  test("works without constructed sheets, as a canvas that broke them", () => {
    const { canvas } = heroCanvas();
    expect(() => canvas.fromParent({ type: "hover-hand", hand: true, seq: 1 })).not.toThrow();
  });
});

describe("anchors-query reply", () => {
  test("answers a new query without waiting for an animation frame, which an off-screen iframe never gets", () => {
    const { canvas } = heroCanvas();
    canvas.context.innerWidth = 600;
    canvas.fromParent({ type: "measure" });
    canvas.fromParent({ type: "anchors-query", document: ofType(canvas, "layout")[0]?.document, generation: 1, request: 1, targets: [{ id: "f", frame: "hero" }] });
    expect(ofType(canvas, "anchors")).toEqual([expect.objectContaining({ generation: 1, request: 1, results: [{ id: "f", candidates: { frame: [expect.any(String)] } }] })]);
  });

  // A reply chip carries a doan id and no selector.
  const ask = (canvas: ReturnType<typeof heroCanvas>["canvas"], targets: Record<string, unknown>[]) => {
    canvas.context.innerWidth = 600;
    canvas.fromParent({ type: "measure" });
    canvas.fromParent({ type: "anchors-query", document: ofType(canvas, "layout")[0]?.document, generation: 1, request: 1, targets });
    return (ofType(canvas, "anchors").at(-1) as { results: { id: string; candidates: Record<string, string[] | null> }[]; rects: unknown[] }).results;
  };
  test("finds an element by its doan id when the target has no selector", () => {
    const { canvas } = heroCanvas();
    const [result] = ask(canvas, [{ id: "e", doanId: "cta" }]);
    expect(result?.candidates).toEqual({ doanId: [expect.any(String)] });
  });
  test("compares the data-doan-id value instead of building a selector from the id", () => {
    const odd = node("i", { "data-doan-id": 'a"] , [x' });
    const { canvas, main } = heroCanvas();
    main.children.push(odd); odd.parentElement = main;
    const [result] = ask(canvas, [{ id: "e", doanId: 'a"] , [x' }]);
    expect(result?.candidates.doanId).toHaveLength(1);
  });
  test("returns both nodes of a duplicated doan id so the app reads it as missing", () => {
    const twin = node("b", { "data-doan-id": "cta" });
    const { canvas, main } = heroCanvas();
    main.children.push(twin); twin.parentElement = main;
    const [result] = ask(canvas, [{ id: "e", doanId: "cta" }]);
    expect(result?.candidates.doanId).toHaveLength(2);
  });
  test("a doan id nothing carries has no candidates", () => {
    const { canvas } = heroCanvas();
    const [result] = ask(canvas, [{ id: "e", doanId: "gone" }]);
    expect(result?.candidates).toEqual({ doanId: [] });
  });
  test("a person's chip still gets both doan id and selector candidates", () => {
    const { canvas, button } = heroCanvas();
    canvas.selectors.set("button", button);
    const [result] = ask(canvas, [{ id: "e", doanId: "cta", selector: "button" }]);
    expect(result?.candidates).toEqual({ doanId: [expect.any(String)], selector: [expect.any(String)] });
  });
});

// The spec's state table, as frames outermost first: [] is no selection or one outside every frame.
describe("frameStep", () => {
  const [A, B, C, D] = ["A", "B", "C", "D"];
  test.each<[string, string[], string[], string | null]>([
    ["nothing selected, an element in B inside A selects A", [], [A, B], A],
    ["A selected, an element in B selects B", [A], [A, B], B],
    ["B selected, an element in B selects the element", [A, B], [A, B], null],
    ["an element of B selected, a click in sibling C keeps A and selects C", [A, B], [A, C], C],
    ["an element of B selected, B's own background selects B", [A, B], [A, B], null],
    ["an element of B selected, A's own background selects A", [A, B], [A], null],
    ["an element of B selected, an element directly in A selects that element", [A, B], [A], null],
    ["any selection, a click inside another top-level D selects D", [A, B], [D], D],
    ["a note outside every frame selected, a click in B starts again from A", [], [A, B], A],
    ["a click outside every frame selects what it lands on", [A, B], [], null],
  ])("%s", (_name, entered, frames, expected) => {
    expect(frameStep(frames, entered)).toBe(expected);
  });
});

describe("escapeTarget", () => {
  test("an element steps to its own frame, a frame to the frame around it, an outer frame or a note to nothing", () => {
    expect(escapeTarget(["A", "B"], false)).toBe("B");
    expect(escapeTarget(["A", "B"], true)).toBe("A");
    expect(escapeTarget(["A"], true)).toBeNull();
    expect(escapeTarget([], false)).toBeNull();
  });
});

// body > [A[a] > [B[b] > [button#ok, div(empty)], C[c] > [p], span(direct)], D[d] > [q], aside(note)]
function nestedCanvas() {
  const button = node("button", { "data-doan-id": "ok" }, [], { rect: { left: 30, top: 30, width: 20, height: 10 } });
  const empty = node("div", {}, [], { rect: { left: 30, top: 50, width: 20, height: 10 } });
  const b = node("section", { "data-doan-frame": "b" }, [button, empty], { rect: { left: 20, top: 20, width: 100, height: 60 } });
  const p = node("p", {}, [], { rect: { left: 130, top: 30, width: 20, height: 10 } });
  const c = node("section", { "data-doan-frame": "c" }, [p], { rect: { left: 120, top: 20, width: 100, height: 60 } });
  const direct = node("span", {}, [], { rect: { left: 20, top: 90, width: 20, height: 10 } });
  const a = node("section", { "data-doan-frame": "a" }, [b, c, direct], { rect: { left: 10, top: 10, width: 300, height: 100 } });
  const q = node("q", {}, [], { rect: { left: 410, top: 20, width: 20, height: 10 } });
  const d = node("section", { "data-doan-frame": "d" }, [q], { rect: { left: 400, top: 10, width: 100, height: 100 } });
  const note = node("aside", {}, [], { rect: { left: 10, top: 200, width: 50, height: 20 } });
  const canvas = fakeCanvas({ readyState: "complete", body: node("body", {}, [a, d, note]) });
  canvas.posted.length = 0;
  return { canvas, a, b, c, d, button, empty, p, direct, q, note };
}

// What the last selection message names: the frame id, or the element's tag within its frame; "clear" after a clear.
const lastSelection = (canvas: ReturnType<typeof fakeCanvas>) => {
  const last = messages(canvas).filter((m) => m.type === "select" || m.type === "clear").at(-1);
  if (last === undefined) return undefined;
  if (last.type === "clear") return "clear";
  const target = last.target as { tag: string; frame?: { id: string }; element?: unknown } | null;
  if (target === null) return null;
  return target.element === undefined ? target.frame?.id : `${target.frame?.id ?? "-"}>${target.tag}`;
};

describe("canvasScript frame-first selection", () => {
  test("clicks enter one frame level at a time from the outside, then select the element", () => {
    const { canvas, button } = nestedCanvas();
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) { click(canvas, button); seen.push(lastSelection(canvas)); }
    expect(seen).toEqual(["a", "b", "b>button", "b>button"]);
  });

  test("a sibling keeps the entered common frame, another top-level frame starts over, an own background is the frame", () => {
    const { canvas, a, b, c, button, empty, p, direct, q } = nestedCanvas();
    const seen: unknown[] = [];
    const step = (target: unknown) => { click(canvas, target); seen.push(lastSelection(canvas)); };
    step(button); step(button); step(button);
    step(p); step(p);
    step(b);
    step(button);
    step(empty);
    step(a);
    step(direct);
    step(c);
    step(q);
    expect(seen).toEqual(["a", "b", "b>button", "c", "c>p", "b", "b>button", "b>div", "a", "a>span", "c", "d"]);
  });

  test("a note outside every frame is selected at once and drops the entered frame; empty space clears", () => {
    const { canvas, button, note } = nestedCanvas();
    click(canvas, button); click(canvas, button);
    click(canvas, note);
    expect(lastSelection(canvas)).toBe("->aside");
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("a");
    click(canvas, canvas.body);
    expect(lastSelection(canvas)).toBe("clear");
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("a");
  });

  // A row or grid that lays frames out is the space between them: its own background clears like html or body.
  test("a wrapper's own background around frames clears, with or without ⌘, and hovers nothing; a note beside it is selected", () => {
    const button = node("button", {}, [], { rect: { left: 30, top: 30, width: 20, height: 10 } });
    const a = node("section", { "data-doan-frame": "a" }, [button], { rect: { left: 10, top: 10, width: 100, height: 100 } });
    const b = node("section", { "data-doan-frame": "b" }, [], { rect: { left: 130, top: 10, width: 100, height: 100 } });
    const label = node("span", {}, [], { rect: { left: 250, top: 10, width: 40, height: 10 } });
    const inner = node("div", {}, [a, b, label], { rect: { left: 0, top: 0, width: 300, height: 120 } });
    const row = node("div", { class: "row" }, [inner], { rect: { left: 0, top: 0, width: 300, height: 120 } });
    const note = node("aside", {}, [node("em")], { rect: { left: 10, top: 200, width: 50, height: 20 } });
    const canvas = fakeCanvas({ readyState: "complete", body: node("body", {}, [row, note]) });
    canvas.posted.length = 0;
    const hover = () => ofType(canvas, "hover").at(-1)?.rect;
    for (const wrapper of [row, inner]) {
      click(canvas, button); click(canvas, button);
      expect(lastSelection(canvas)).toBe("a>button");
      click(canvas, wrapper);
      expect(lastSelection(canvas)).toBe("clear");
      click(canvas, button);
      expect(lastSelection(canvas)).toBe("a");
      click(canvas, wrapper, { metaKey: true });
      expect(lastSelection(canvas)).toBe("clear");
      canvas.fireWindow("pointermove", input({ target: b }));
      canvas.runFrame();
      expect(hover()).toEqual({ x: 130, y: 10, width: 100, height: 100 });
      canvas.fireWindow("pointermove", input({ target: wrapper }));
      canvas.runFrame();
      expect(hover()).toBeNull();
      canvas.fireWindow("pointermove", input({ target: wrapper, metaKey: true }));
      canvas.runFrame();
      expect(hover()).toBeNull();
    }
    expect(ofType(canvas, "select").map((m) => (m.target as { tag: string }).tag)).not.toContain("div");
    // Outside every frame, what holds no frame is a note: selected at once, inside the wrapper or beside it.
    click(canvas, label);
    expect(lastSelection(canvas)).toBe("->span");
    click(canvas, note);
    expect(lastSelection(canvas)).toBe("->aside");
    click(canvas, note.children[0]);
    expect(lastSelection(canvas)).toBe("->em");
    click(canvas, b);
    expect(lastSelection(canvas)).toBe("b");
  });

  test("Esc steps back from the element to its frame, through the frames around it, then clears", () => {
    const { canvas, button } = nestedCanvas();
    for (let i = 0; i < 3; i++) click(canvas, button);
    const seen: unknown[] = [];
    for (let seq = 4; seq <= 6; seq++) {
      canvas.fromParent({ type: "select-parent", seq });
      const last = messages(canvas).filter((m) => m.type === "select" || m.type === "clear").at(-1);
      expect(last).toMatchObject({ seq, answer: "select-parent" });
      seen.push(lastSelection(canvas));
    }
    expect(seen).toEqual(["b", "a", "clear"]);
    // The next click starts from the outside again.
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("a");
  });

  test("Esc on a note clears; a stale or malformed step changes nothing", () => {
    const { canvas, note } = nestedCanvas();
    click(canvas, note);
    canvas.fromParent({ type: "select-parent", seq: 1 });
    canvas.fromParent({ type: "select-parent" });
    expect(ofType(canvas, "clear")).toEqual([]);
    canvas.fromParent({ type: "select-parent", seq: 2 });
    expect(ofType(canvas, "clear")).toEqual([{ type: "clear", href: HREF, seq: 2, viewport: 150, answer: "select-parent" }]);
  });

  test("the hover shows what the next click selects, and nothing over what it would select again", () => {
    const { canvas, b, button } = nestedCanvas();
    const hover = () => ofType(canvas, "hover").at(-1)?.rect;
    canvas.fireWindow("pointermove", input({ target: button }));
    canvas.runFrame();
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
    // A selection with the pointer resting recomputes the hover at once.
    click(canvas, button);
    expect(hover()).toEqual({ x: 20, y: 20, width: 100, height: 60 });
    click(canvas, button);
    expect(hover()).toEqual({ x: 30, y: 30, width: 20, height: 10 });
    click(canvas, button);
    expect(hover()).toBeNull();
    canvas.fireWindow("pointermove", input({ target: b }));
    canvas.runFrame();
    expect(hover()).toEqual({ x: 20, y: 20, width: 100, height: 60 });
    // Esc with the pointer resting, too.
    canvas.fromParent({ type: "select-parent", seq: 4 });
    expect(hover()).toBeNull();
    canvas.fromParent({ type: "select-parent", seq: 5 });
    expect(hover()).toEqual({ x: 20, y: 20, width: 100, height: 60 });
  });

  test("a frame the drawer picked is entered by the next click, and Esc goes to the frame around it", () => {
    const { canvas, button } = nestedCanvas();
    canvas.fromParent({ type: "pick-frame", seq: 1, index: 1, id: "b" });
    expect(lastSelection(canvas)).toBe("b");
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("b>button");
    canvas.fromParent({ type: "select-parent", seq: 3 });
    canvas.fromParent({ type: "select-parent", seq: 4 });
    expect(lastSelection(canvas)).toBe("a");
  });

  test("a reload's recovered element keeps its selection under a new parent, and the next steps follow its current frames", () => {
    const { canvas, b, c, button } = nestedCanvas();
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "ok" });
    expect(lastSelection(canvas)).toBe("b>button");
    // The element moves from B to C, the same node by the same anchor.
    b.children.splice(b.children.indexOf(button), 1);
    c.children.push(button);
    button.parentElement = c;
    canvas.trigger("MutationObserver");
    canvas.runFrame();
    expect(ofType(canvas, "layout").at(-1)).toMatchObject({ seq: 1, selected: { x: 30, y: 30, width: 20, height: 10 } });
    canvas.fromParent({ type: "select-parent", seq: 2 });
    expect(lastSelection(canvas)).toBe("c");
  });

  test("a frame that lost its frame attribute is no longer a step", () => {
    const { canvas, b, button } = nestedCanvas();
    canvas.fromParent({ type: "select-anchor", seq: 1, doanId: "ok" });
    delete b.attrs["data-doan-frame"];
    canvas.fromParent({ type: "select-parent", seq: 2 });
    expect(lastSelection(canvas)).toBe("a");
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("a>button");
  });
});

describe("canvasScript ⌘ direct selection", () => {
  test("a ⌘-click selects the element under the pointer at once, and later clicks and Esc go on from its frame", () => {
    const { canvas, b, button, empty } = nestedCanvas();
    const event = click(canvas, button, { metaKey: true });
    expect([event.prevented, event.stopped]).toEqual([true, true]);
    expect(lastSelection(canvas)).toBe("b>button");
    click(canvas, empty);
    expect(lastSelection(canvas)).toBe("b>div");
    canvas.fromParent({ type: "select-parent", seq: 3 });
    expect(lastSelection(canvas)).toBe("b");
    click(canvas, b, { metaKey: true });
    expect(lastSelection(canvas)).toBe("b");
  });

  test("⌥ wins over ⌘: the press and click pass through to the canvas", () => {
    const { canvas, button } = nestedCanvas();
    const event = click(canvas, button, { metaKey: true, altKey: true });
    expect(event.prevented).toBe(false);
    expect(ofType(canvas, "select")).toEqual([]);
  });

  test("the ⌘ hover follows the pointer's own modifier and the app's command, at once with the pointer resting", () => {
    const { canvas, button } = nestedCanvas();
    const hover = () => ofType(canvas, "hover").at(-1);
    canvas.fireWindow("pointermove", input({ target: button, metaKey: true }));
    canvas.runFrame();
    expect(hover()?.rect).toEqual({ x: 30, y: 30, width: 20, height: 10 });
    canvas.fireWindow("pointermove", input({ target: button }));
    canvas.runFrame();
    expect(hover()?.rect).toEqual({ x: 10, y: 10, width: 300, height: 100 });
    canvas.fromParent({ type: "hover-meta", meta: true, seq: 1 });
    expect(hover()).toMatchObject({ seq: 1, rect: { x: 30, y: 30, width: 20, height: 10 } });
    // A stale or malformed modifier command changes nothing, and none moves the selection channel.
    canvas.fromParent({ type: "hover-meta", meta: false, seq: 1 });
    canvas.fromParent({ type: "hover-meta", meta: "no", seq: 2 });
    expect(hover()).toMatchObject({ seq: 1, rect: { x: 30, y: 30, width: 20, height: 10 } });
    canvas.fromParent({ type: "hover-meta", meta: false, seq: 2 });
    expect(hover()).toMatchObject({ seq: 2, rect: { x: 10, y: 10, width: 300, height: 100 } });
    click(canvas, button);
    expect(ofType(canvas, "select").at(-1)).toMatchObject({ seq: 1 });
  });

  test("⌘ pressed and released in a focused canvas recomputes the hover, and a blur releases it", () => {
    const { canvas, button } = nestedCanvas();
    const hover = () => ofType(canvas, "hover").at(-1)?.rect;
    canvas.fireWindow("pointermove", input({ target: button }));
    canvas.runFrame();
    canvas.fireWindow("keydown", input({ target: canvas.body, key: "Meta", metaKey: true }));
    expect(hover()).toEqual({ x: 30, y: 30, width: 20, height: 10 });
    canvas.fireWindow("keyup", input({ target: canvas.body, key: "Meta" }));
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
    canvas.fireWindow("keydown", input({ target: canvas.body, key: "Meta", metaKey: true }));
    canvas.fireWindow("blur", {});
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
  });

  test("the click's own ⌘ decides, not the hover's last modifier", () => {
    const { canvas, button } = nestedCanvas();
    canvas.fromParent({ type: "hover-meta", meta: true, seq: 1 });
    click(canvas, button);
    expect(lastSelection(canvas)).toBe("a");
  });
});

describe("canvasScript picking keeps its own targets", () => {
  test("a pick click names the element under it and the hover shows that element, whatever Select entered", () => {
    const { canvas, button } = nestedCanvas();
    click(canvas, button);
    const before = canvas.posted.length;
    canvas.fromParent({ type: "measure" });
    const document = (canvas.posted[before] as { message: { document: string } }).message.document;
    canvas.fromParent({ type: "pick-start", seq: 1, document });
    canvas.fireWindow("pointermove", input({ target: button }));
    canvas.runFrame();
    expect(ofType(canvas, "hover").at(-1)?.rect).toEqual({ x: 30, y: 30, width: 20, height: 10 });
    click(canvas, button);
    expect(ofType(canvas, "picked").at(-1)).toMatchObject({ target: { tag: "button", frame: { id: "b" }, element: { doanId: "ok" } } });
    expect(lastSelection(canvas)).toBe("a");
  });
});

// A nested iframe inside a frame: the press is seen only as focus moving in, so the canvas hands focus back after each
// selection, or the next press in the same iframe would move no focus and go unheard.
describe("canvasScript nested iframe in a frame", () => {
  const nestedCanvas2 = () => {
    const nested = node("iframe", {}, [], { rect: { left: 30, top: 30, width: 50, height: 40 } });
    const frame = node("section", { "data-doan-frame": "f" }, [nested], { rect: { left: 10, top: 10, width: 200, height: 100 } });
    const canvas = fakeCanvas({ readyState: "complete", body: node("body", {}, [frame]) });
    canvas.posted.length = 0;
    return { canvas, nested, frame };
  };
  const focusIn = (canvas: ReturnType<typeof fakeCanvas>, nested: FakeNode) => {
    canvas.document.activeElement = nested;
    canvas.fireWindow("blur", {});
    canvas.advance(0);
  };

  test("the first press selects the frame and gives focus back, so the second press selects the iframe", () => {
    const { canvas, nested } = nestedCanvas2();
    focusIn(canvas, nested);
    expect(lastSelection(canvas)).toBe("f");
    expect(nested.blurred).toBe(1);
    canvas.document.activeElement = canvas.body;
    focusIn(canvas, nested);
    expect(lastSelection(canvas)).toBe("f>iframe");
  });

  test("⌘ held on the way in selects the iframe directly", () => {
    const { canvas, nested } = nestedCanvas2();
    canvas.fireWindow("pointermove", input({ target: nested, metaKey: true }));
    focusIn(canvas, nested);
    expect(lastSelection(canvas)).toBe("f>iframe");
  });
});

describe("canvasScript hover across a pick", () => {
  test("starting and ending a pick recomputes the hover with the pointer resting", () => {
    const { canvas, button } = nestedCanvas();
    const hover = () => ofType(canvas, "hover").at(-1)?.rect;
    canvas.fireWindow("pointermove", input({ target: button }));
    canvas.runFrame();
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
    canvas.fromParent({ type: "measure" });
    const document = (ofType(canvas, "layout").at(-1) as { document: string }).document;
    canvas.fromParent({ type: "pick-start", seq: 1, document });
    expect(hover()).toEqual({ x: 30, y: 30, width: 20, height: 10 });
    canvas.fromParent({ type: "pick-cancel", seq: 2, document });
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
    // Esc in a focused canvas ends the pick there too.
    canvas.fromParent({ type: "pick-start", seq: 3, document });
    canvas.fireWindow("keydown", input({ target: canvas.body, key: "Escape" }));
    expect(hover()).toEqual({ x: 10, y: 10, width: 300, height: 100 });
  });
});

// Select's text drag (PRODUCT §5 item 4): a press on text that moves 4 screen px becomes a range the script holds.
describe("textDragState", () => {
  const start = { x: 100, y: 100 };
  test("stays a press under the threshold and becomes a drag at it, in screen px", () => {
    expect(textDragState("press", start, { x: 103.99, y: 100 }, 4)).toBe("press");
    expect(textDragState("press", start, { x: 104, y: 100 }, 4)).toBe("drag");
    expect(textDragState("press", start, { x: 100, y: 96 }, 4)).toBe("drag");
    // Diagonal distance, not either axis alone.
    expect(textDragState("press", start, { x: 102.9, y: 102.9 }, 4)).toBe("drag");
    expect(textDragState("press", start, { x: 102.8, y: 102.8 }, 4)).toBe("press");
  });

  test("a drag stays a drag back at its start", () => {
    expect(textDragState("drag", start, start, 4)).toBe("drag");
  });
});

describe("textBoundary", () => {
  // Frame flags of the start element and its ancestors, nearest first, up to body.
  test("is the innermost frame around the start", () => {
    expect(textBoundary([false, true, false, true], false)).toBe(1);
    expect(textBoundary([true], false)).toBe(0);
  });

  test("outside every frame is the start element itself, the note a click selects", () => {
    expect(textBoundary([false, false], false)).toBe(0);
  });

  test("a row holding frames, or the root, has no boundary", () => {
    expect(textBoundary([false, false], true)).toBeNull();
    expect(textBoundary([], false)).toBeNull();
  });
});

// The copy cap counts code points and never splits a surrogate pair (clipHtml is the code-point clip the script uses).
describe("copy text cap", () => {
  const CAP = 100_000;
  test("keeps exactly the cap, cuts one more, and keeps an astral character whole", () => {
    expect(clipHtml("a".repeat(CAP), CAP)).toEqual({ html: "a".repeat(CAP), truncated: false });
    expect(clipHtml("a".repeat(CAP + 1), CAP)).toEqual({ html: "a".repeat(CAP), truncated: true });
    expect(clipHtml(`${"a".repeat(CAP - 1)}😀😀`, CAP)).toEqual({ html: `${"a".repeat(CAP - 1)}😀`, truncated: true });
  });
});

// Text nodes, ranges and the selection for the text drag tests: each character is a 10 × 18 box on its text node's line,
// and document order is the order the fixture lists the text nodes in.
type Box = { left: number; top: number; width: number; height: number };
interface FakeText { nodeType: 3; data: string; parentElement: FakeNode; parentNode: FakeNode; box: Box; readonly isConnected: boolean }

function textCanvas() {
  const one = node("p", { "data-doan-id": "one" });
  const two = node("p", { "data-doan-id": "two" });
  const hero = node("section", { "data-doan-frame": "hero" }, [one, two]);
  const three = node("p", { "data-doan-id": "three" });
  const side = node("section", { "data-doan-frame": "side" }, [three]);
  const note = node("aside");
  const field = node("input");
  const editable = node("div", {}, [], { isContentEditable: true });
  const row = node("div", {}, [hero, side]);
  const header = node("header");
  const canvas = fakeCanvas({ readyState: "interactive", body: node("body", {}, [header, row, note, field, editable]) });
  canvas.posted.length = 0;
  const texts: FakeText[] = [];
  const text = (parent: FakeNode, data: string, left: number, top: number): FakeText => {
    const t: FakeText = { nodeType: 3, data, parentElement: parent, parentNode: parent, box: { left, top, width: data.length * 10, height: 18 }, get isConnected() { return parent.isConnected; } };
    texts.push(t);
    return t;
  };
  const tLead = text(header, "Lead", 0, -40);
  const t1 = text(one, "Hello world", 0, 0);
  const t2 = text(two, "Second line", 0, 30);
  const t3 = text(three, "Other frame", 300, 0);
  const tNote = text(note, "Note text", 0, 100);
  const tEdit = text(editable, "Edit me", 0, 200);
  const contains = (el: unknown, n: unknown): boolean => {
    for (let at = n as { parentElement?: unknown } | null; at; at = (at.parentElement ?? null) as { parentElement?: unknown } | null) if (at === el) return true;
    return false;
  };
  const textsIn = (el: unknown) => texts.filter(t => contains(el, t));
  // A boundary point as [text index, offset]; an element's offset 0 is before its first text, anything else after its last.
  const key = (n: unknown, o: number): [number, number] => {
    if ((n as { nodeType: number }).nodeType === 3) return [texts.indexOf(n as FakeText), o];
    const inside = textsIn(n);
    if (inside.length === 0) return [o === 0 ? -1 : texts.length, 0];
    return o === 0 ? [texts.indexOf(inside[0]!), 0] : [texts.indexOf(inside.at(-1)!), inside.at(-1)!.data.length];
  };
  const cmp = (a: [number, number], b: [number, number]) => a[0] !== b[0] ? Math.sign(a[0] - b[0]) : Math.sign(a[1] - b[1]);
  class FakeRange {
    startContainer: unknown = null; startOffset = 0; endContainer: unknown = null; endOffset = 0;
    get collapsed() { return cmp(key(this.startContainer, this.startOffset), key(this.endContainer, this.endOffset)) === 0; }
    get commonAncestorContainer() { return canvas.html; }
    setStart(n: unknown, o: number) { this.startContainer = n; this.startOffset = o; if (this.endContainer === null || cmp(key(n, o), key(this.endContainer, this.endOffset)) > 0) this.setEnd(n, o); }
    setEnd(n: unknown, o: number) { this.endContainer = n; this.endOffset = o; }
    selectNodeContents(n: FakeNode | FakeText) { this.startContainer = n; this.startOffset = 0; this.endContainer = n; this.endOffset = n.nodeType === 3 ? n.data.length : 1; }
    comparePoint(n: unknown, o: number) { const at = key(n, o); return cmp(at, key(this.startContainer, this.startOffset)) < 0 ? -1 : cmp(at, key(this.endContainer, this.endOffset)) > 0 ? 1 : 0; }
    intersectsNode(t: FakeText) { const i = texts.indexOf(t); return cmp([i, t.data.length], key(this.startContainer, this.startOffset)) > 0 && cmp([i, 0], key(this.endContainer, this.endOffset)) < 0; }
    private parts() {
      const [s, e] = [key(this.startContainer, this.startOffset), key(this.endContainer, this.endOffset)];
      return texts.flatMap((t, i) => i < s[0] || i > e[0] ? [] : [{ t, from: i === s[0] ? s[1] : 0, to: i === e[0] ? e[1] : t.data.length }]).filter(p => p.to > p.from);
    }
    toString() { return this.parts().map(p => p.t.data.slice(p.from, p.to)).join("\n"); }
    getClientRects() { return this.parts().map(p => ({ left: p.t.box.left + p.from * 10, top: p.t.box.top, width: (p.to - p.from) * 10, height: 18 })); }
  }
  // The sheets adopted while the selection was read, to see that user-select was forced only for the read.
  const sheetsAtRead: string[][] = [];
  const selection = {
    ranges: [] as FakeRange[],
    anchorNode: null as unknown, anchorOffset: 0, focusNode: null as unknown, focusOffset: 0,
    get rangeCount() { return selection.ranges.length; },
    removeAllRanges() { selection.ranges = []; selection.anchorNode = selection.focusNode = null; },
    addRange(r: FakeRange) { selection.ranges.push(r); selection.anchorNode = r.startContainer; selection.anchorOffset = r.startOffset; selection.focusNode = r.endContainer; selection.focusOffset = r.endOffset; },
    setBaseAndExtent(a: unknown, ao: number, f: unknown, fo: number) { const r = new FakeRange(); r.setStart(a, ao); r.setEnd(f, fo); selection.ranges = [r]; selection.anchorNode = a; selection.anchorOffset = ao; selection.focusNode = f; selection.focusOffset = fo; },
    toString() { sheetsAtRead.push((doc.adoptedStyleSheets ?? []).map(sheet => sheet.text)); return selection.ranges.map(r => r.toString()).join(""); },
  };
  class FakeSheet { text = ""; replaceSync(value: string) { this.text = value; } }
  const doc = canvas.document as unknown as Record<string, unknown> & { adoptedStyleSheets: FakeSheet[] };
  doc.adoptedStyleSheets = [];
  canvas.context.CSSStyleSheet = FakeSheet;
  canvas.context.getSelection = () => selection;
  // The caret of a point over a text's line; `carets` overrides points off the text (padding, elements, nothing).
  const carets = new Map<string, { offsetNode: unknown; offset: number } | null>();
  doc.caretPositionFromPoint = (x: number, y: number) => {
    const own = carets.get(`${x},${y}`);
    if (own !== undefined) return own;
    const t = texts.find(t => y >= t.box.top && y < t.box.top + 18 && x >= t.box.left - 5 && x <= t.box.left + t.box.width + 5);
    return t ? { offsetNode: t, offset: Math.max(0, Math.min(t.data.length, Math.round((x - t.box.left) / 10))) } : null;
  };
  doc.createRange = () => new FakeRange();
  doc.createTreeWalker = (root: unknown) => {
    const list = texts.filter(t => contains(root, t));
    let at = -1;
    return { get currentNode() { return at < 0 ? root : list[at]; }, nextNode: () => list[++at] ?? null };
  };
  const pointAt = { el: one as unknown };
  doc.elementFromPoint = () => pointAt.el;
  const captured = new Set<number>();
  Object.assign(canvas.html, {
    setPointerCapture: (id: number) => { captured.add(id); },
    releasePointerCapture: (id: number) => { captured.delete(id); },
    hasPointerCapture: (id: number) => captured.has(id),
  });
  const ranges = () => ofType(canvas, "text-range");
  const ours = () => doc.adoptedStyleSheets.map(sheet => sheet.text);
  return { canvas, one, two, hero, three, side, note, field, editable, row, tLead, t1, t2, t3, tNote, tEdit, selection, carets, captured, ranges, ours, sheetsAtRead, pointAt, doc };
}

describe("canvasScript text drag", () => {
  type T = ReturnType<typeof textCanvas>;
  // Screen px are the client px plus 1000, so a drag's 4 px are measured in screen px only.
  const at = (x: number, y: number, over: Partial<FakeEvent> = {}): Partial<FakeEvent> => ({ clientX: x, clientY: y, screenX: x + 1000, screenY: y + 1000, pointerId: 7, ...over });
  const down = (t: T, target: unknown, x: number, y: number, over: Partial<FakeEvent> = {}) => { const e = input({ target, type: "pointerdown", ...at(x, y, over) }); t.canvas.fireWindow("pointerdown", e); return e; };
  const move = (t: T, x: number, y: number, over: Partial<FakeEvent> = {}) => t.canvas.fireWindow("pointermove", input({ target: t.canvas.html, ...at(x, y, over) }));
  const up = (t: T, x: number, y: number) => t.canvas.fireWindow("pointerup", input({ target: t.canvas.html, ...at(x, y) }));
  // A drag over "Hello world" from before "world" (x 60) to after it (x 110).
  const dragWorld = (t: T) => { down(t, t.one, 60, 5); move(t, 80, 5); move(t, 110, 5); up(t, 110, 5); };
  const copyEvent = () => {
    const data = new Map<string, string>();
    const event = Object.assign(input({ target: null }), { clipboardData: { setData: (type: string, value: string) => data.set(type, value) }, immediate: false, stopImmediatePropagation() { event.immediate = true; } });
    return { event, data };
  };

  test("a press on text that moves 4 screen px posts the range's rects while dragging and its text once released", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5);
    move(t, 63, 5);
    expect(t.ranges()).toEqual([]);
    move(t, 110, 5);
    t.canvas.runFrame();
    const dragging = t.ranges();
    expect(dragging.length).toBeGreaterThan(0);
    expect(dragging.every(m => m.dragging === true && !("text" in m))).toBe(true);
    expect(dragging.at(-1)).toMatchObject({ document: expect.any(String), epoch: 0, rects: [{ x: 60, y: 0, width: 50, height: 18 }] });
    up(t, 110, 5);
    expect(t.ranges().at(-1)).toEqual({ type: "text-range", document: dragging[0]!.document, epoch: 0, dragging: false, rects: [{ x: 60, y: 0, width: 50, height: 18 }], text: "world" });
  });

  test("a still press stays a click that selects, and takes no pointer capture", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5);
    move(t, 62, 6);
    expect(t.captured.size).toBe(0);
    up(t, 62, 6);
    click(t.canvas, t.one);
    expect(t.ranges()).toEqual([]);
    expect(ofType(t.canvas, "select")).toHaveLength(1);
  });

  test("the click after a drag selects nothing and still reaches no canvas listener", () => {
    const t = textCanvas();
    dragWorld(t);
    const event = click(t.canvas, t.canvas.html);
    expect([event.prevented, event.stopped]).toEqual([true, true]);
    expect(ofType(t.canvas, "select")).toEqual([]);
    expect(ofType(t.canvas, "clear")).toEqual([]);
    // Only that one click: the next press's click selects again.
    down(t, t.one, 5, 5);
    up(t, 5, 5);
    click(t.canvas, t.one);
    expect(ofType(t.canvas, "select")).toHaveLength(1);
  });

  test("the press, mousedown and dblclick of a text drag stay blocked as every plain press is", () => {
    const t = textCanvas();
    const press = down(t, t.one, 60, 5);
    expect([press.prevented, press.stopped]).toEqual([true, true]);
    move(t, 110, 5);
    for (const type of ["mousedown", "mouseup", "dblclick"]) {
      const event = input({ target: t.one });
      t.canvas.fireWindow(type, event);
      if (type !== "mouseup") expect([type, event.prevented, event.stopped]).toEqual([type, true, true]);
    }
  });

  test("takes the pointer capture on html once it becomes a drag and lets it go at the end", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5);
    move(t, 110, 5);
    expect([...t.captured]).toEqual([7]);
    up(t, 110, 5);
    expect(t.captured.size).toBe(0);
  });

  test("starts only for a plain primary press with no pick", () => {
    for (const over of [{ button: 2 }, { button: 1 }, { metaKey: true }, { altKey: true }, { ctrlKey: true }, { shiftKey: true }, { isTrusted: false }]) {
      const t = textCanvas();
      down(t, t.one, 60, 5, over);
      move(t, 110, 5, over);
      t.canvas.runFrame();
      up(t, 110, 5);
      expect([over, t.ranges()]).toEqual([over, []]);
    }
    const t = textCanvas();
    t.canvas.fromParent({ type: "pick-start", seq: 1, document: (() => { t.canvas.fromParent({ type: "measure" }); return (ofType(t.canvas, "layout").at(-1) as { document: string }).document; })() });
    dragWorld(t);
    expect(t.ranges()).toEqual([]);
  });

  test("starts on a glyph either side of the caret and in the padding of the element that holds the text", () => {
    // x 64 lies in "o" (index 6) while the caret rounds to offset 6: the glyph after the caret.
    const t = textCanvas();
    down(t, t.one, 64, 5); move(t, 110, 5); up(t, 110, 5);
    expect(t.ranges().at(-1)).toMatchObject({ text: "world" });
    // x 66 rounds to offset 7, and the glyph holding it is before the caret.
    const u = textCanvas();
    down(u, u.one, 66, 5); move(u, 110, 5); up(u, 110, 5);
    expect(u.ranges().at(-1)).toMatchObject({ text: "orld" });
    // Below the line, in the paragraph's own padding: the caret is its text and the press lands on the paragraph.
    const v = textCanvas();
    v.carets.set("60,25", { offsetNode: v.t1, offset: 6 });
    down(v, v.one, 60, 25); move(v, 110, 5); up(v, 110, 5);
    expect(v.ranges().at(-1)).toMatchObject({ text: "world" });
  });

  test("does not start off the text: a frame's background, another element's caret, a field, editable text", () => {
    const t = textCanvas();
    // Over the frame's background the caret is the nearest text, but neither its glyph nor its element is under the press.
    t.carets.set("60,25", { offsetNode: t.t1, offset: 6 });
    down(t, t.hero, 60, 25); move(t, 110, 5); up(t, 110, 5);
    t.carets.set("5,300", { offsetNode: t.field, offset: 2 });
    down(t, t.field, 5, 300); move(t, 110, 5); up(t, 110, 5);
    down(t, t.editable, 20, 205); move(t, 60, 205); up(t, 60, 205);
    t.carets.set("5,400", null);
    down(t, t.canvas.body, 5, 400); move(t, 110, 5); up(t, 110, 5);
    expect(t.ranges()).toEqual([]);
  });

  test("keeps the range inside the start's innermost frame", () => {
    const t = textCanvas();
    // From "Second" (frame hero) across into frame side: the range ends at the end of hero.
    down(t, t.two, 0, 35); move(t, 40, 35); move(t, 350, 5); up(t, 350, 5);
    expect(t.ranges().at(-1)).toMatchObject({ text: "Hello world\nSecond line".slice(12) });
    // Backwards out of hero's top: it starts at hero's start.
    const u = textCanvas();
    down(u, u.two, 60, 35); move(u, 20, 35); move(u, 5, -35); up(u, 5, -35);
    expect(u.ranges().at(-1)).toMatchObject({ text: "Hello world\nSecond" });
  });

  test("outside every frame the range stays in the note it started in", () => {
    const t = textCanvas();
    down(t, t.note, 50, 105); move(t, 90, 105);
    // Back over a frame's text, which comes before the note: the range runs to the note's start.
    move(t, 110, 5); up(t, 110, 5);
    expect(t.ranges().at(-1)).toMatchObject({ text: "Note " });
  });

  test("a point with no caret keeps the last end", () => {
    const t = textCanvas();
    t.carets.set("500,500", null);
    down(t, t.one, 60, 5); move(t, 110, 5); move(t, 500, 500); up(t, 500, 500);
    expect(t.ranges().at(-1)).toMatchObject({ text: "world" });
  });

  test("a drag back to its start is no range, and its click still selects nothing", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5); move(t, 110, 5); move(t, 60, 5); up(t, 60, 5);
    expect(t.ranges().at(-1)).toEqual(expect.objectContaining({ dragging: false, rects: [] }));
    expect(t.ranges().at(-1)).not.toHaveProperty("text");
    click(t.canvas, t.canvas.html);
    expect(ofType(t.canvas, "select")).toEqual([]);
  });

  test("reads the text with user-select forced on for that read only, and puts back the canvas's own selection", () => {
    const t = textCanvas();
    t.selection.setBaseAndExtent(t.t2, 4, t.t2, 1);
    dragWorld(t);
    expect(t.sheetsAtRead.at(-1)).toEqual(["*{user-select:text!important}"]);
    expect(t.ours()).toEqual([]);
    expect([t.selection.anchorNode, t.selection.anchorOffset, t.selection.focusNode, t.selection.focusOffset]).toEqual([t.t2, 4, t.t2, 1]);
  });

  test("shows the text cursor through the drag only", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5);
    expect(t.ours()).toEqual([]);
    move(t, 110, 5);
    expect(t.ours()).toEqual(["*{cursor:text!important}"]);
    up(t, 110, 5);
    expect(t.ours()).toEqual([]);
  });

  test("hides the hover through the drag and posts it again at the release with the pointer resting", () => {
    const t = textCanvas();
    t.canvas.fireWindow("pointermove", input({ target: t.one, ...at(5, 5) }));
    t.canvas.runFrame();
    expect(ofType(t.canvas, "hover").at(-1)).toMatchObject({ rect: expect.any(Object) });
    down(t, t.one, 60, 5); move(t, 110, 5); t.canvas.runFrame();
    expect(ofType(t.canvas, "hover").at(-1)).toMatchObject({ rect: null });
    const before = ofType(t.canvas, "hover").length;
    t.pointAt.el = t.one;
    up(t, 110, 5);
    // The same element as before the drag: the dedupe value was emptied, so it is posted again without a move.
    expect(ofType(t.canvas, "hover").length).toBe(before + 1);
    expect(ofType(t.canvas, "hover").at(-1)).toMatchObject({ rect: expect.any(Object) });
  });

  test("pointercancel, a lost capture and blur end the drag keeping the range so far", () => {
    for (const end of ["pointercancel", "lostpointercapture", "blur"]) {
      const t = textCanvas();
      down(t, t.one, 60, 5); move(t, 110, 5);
      t.canvas.fireWindow(end, input({ target: t.canvas.html, ...at(110, 5) }));
      expect([end, t.ranges().at(-1)]).toEqual([end, expect.objectContaining({ dragging: false, text: "world" })]);
      expect(t.captured.size).toBe(0);
      // A move after the end makes no range of its own.
      const count = t.ranges().length;
      move(t, 20, 5); t.canvas.runFrame();
      expect(t.ranges()).toHaveLength(count);
    }
  });

  test("clear-text ends the drag and drops the range; later messages carry its epoch and an older one changes nothing", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5); move(t, 110, 5);
    t.canvas.fromParent({ type: "clear-text", epoch: 3 });
    expect(t.captured.size).toBe(0);
    expect(t.ours()).toEqual([]);
    const count = t.ranges().length;
    move(t, 20, 5); up(t, 20, 5); t.canvas.runFrame();
    expect(t.ranges()).toHaveLength(count);
    t.canvas.fromParent({ type: "clear-text", epoch: 2 });
    dragWorld(t);
    expect(t.ranges().at(-1)).toMatchObject({ epoch: 3, text: "world" });
    // An older or malformed clear does not drop it.
    for (const epoch of [3, 2, "4", -1]) t.canvas.fromParent({ type: "clear-text", epoch });
    const { event, data } = copyEvent();
    t.canvas.fireWindow("copy", event);
    expect(data.get("text/plain")).toBe("world");
  });

  test("a pick start drops the range and ends a drag", () => {
    const t = textCanvas();
    dragWorld(t);
    t.canvas.fromParent({ type: "measure" });
    const document = (ofType(t.canvas, "layout").at(-1) as { document: string }).document;
    t.canvas.fromParent({ type: "pick-start", seq: 1, document });
    const { event, data } = copyEvent();
    t.canvas.fireWindow("copy", event);
    expect(data.size).toBe(0);
  });

  test("the next primary press drops the range at once, ⌥ and ⌘ included; a right or Ctrl press keeps it", () => {
    for (const over of [{ button: 2 }, { ctrlKey: true }]) {
      const t = textCanvas();
      dragWorld(t);
      const count = t.ranges().length;
      down(t, t.two, 5, 35, over);
      expect([over, t.ranges()]).toEqual([over, expect.any(Array)]);
      expect(t.ranges()).toHaveLength(count);
    }
    for (const over of [{}, { altKey: true }, { metaKey: true }]) {
      const t = textCanvas();
      dragWorld(t);
      down(t, t.hero, 500, 500, over);
      expect([over, t.ranges().at(-1)]).toEqual([over, expect.objectContaining({ dragging: false, rects: [] })]);
    }
  });

  test("the canvas's copy event takes the released text as plain text only; without a range it is left alone", () => {
    const t = textCanvas();
    const none = copyEvent();
    t.canvas.fireWindow("copy", none.event);
    expect([none.event.prevented, none.data.size]).toEqual([false, 0]);
    dragWorld(t);
    const { event, data } = copyEvent();
    t.canvas.fireWindow("copy", event);
    expect([...data]).toEqual([["text/plain", "world"]]);
    expect([event.prevented, event.immediate]).toEqual([true, true]);
  });

  test("text-point moves the end of a drag to where the pointer now is over the board", () => {
    const t = textCanvas();
    down(t, t.one, 60, 5); move(t, 80, 5);
    // The board panned under a resting pointer: the app sends the new point in canvas coordinates (scrollY is 40).
    t.canvas.fromParent({ type: "text-point", epoch: 0, x: 40, y: 75 });
    up(t, 40, 75);
    expect(t.ranges().at(-1)).toMatchObject({ text: "Hello world\nSecond line".slice(6, 16) });
  });

  test("text-point outside a drag or for an old epoch changes nothing", () => {
    const t = textCanvas();
    dragWorld(t);
    const count = t.ranges().length;
    t.canvas.fromParent({ type: "text-point", epoch: 0, x: 40, y: 75 });
    t.canvas.runFrame();
    expect(t.ranges()).toHaveLength(count);
  });

  test("posts the rects again after a layout, and drops the range when its text left the document", () => {
    const t = textCanvas();
    dragWorld(t);
    const count = t.ranges().length;
    t.canvas.trigger("ResizeObserver");
    t.canvas.runFrame();
    expect(t.ranges()).toHaveLength(count + 1);
    expect(t.ranges().at(-1)).toMatchObject({ dragging: false, rects: [{ x: 60, y: 0, width: 50, height: 18 }] });
    expect(t.ranges().at(-1)).not.toHaveProperty("text");
    t.one.isConnected = false;
    t.canvas.trigger("ResizeObserver");
    t.canvas.runFrame();
    expect(t.ranges().at(-1)).toMatchObject({ dragging: false, rects: [] });
  });
});
