import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { ancestorPath, canScrollAxis, canvasScriptSource, clipHtml, clipText, documentHeight, elementSelector, frameBottom, nextHeight, textQuote, type ChainLink } from "./canvasScript";

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
  // buzz-project-settings: 7,832 px in the fallback font, 7,932 px once Geist applies.
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
    // The pin command went with the app's comment pins: an anchors node selects nothing.
    const selects = messages().filter(p => p.type === "select").length;
    canvas.fromParent({ type: "select-comment", document, generation: 1, request: 1, seq: 2, node: reply?.results[3]?.candidates.selector?.[0] });
    expect(messages().filter(p => p.type === "select")).toHaveLength(selects);
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

// buzz-canvas-conversation removed the app's comment drafts and their guard: a click, a background click and an
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

// buzz-canvas-conversation design §4 'Structure': picking is the canvas script's internal command. Start and cancel
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
    click(canvas, button);
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
    expect(messages(canvas)).toEqual([]);
    click(canvas, inside);
    click(canvas, inside, { ...at(5, 5), shiftKey: true } as Partial<FakeEvent>);
    expect(picked(canvas)).toEqual([
      expect.objectContaining({ target: expect.objectContaining({ tag: "span", frame: { id: "card" } }) }),
      expect.objectContaining({ point: { x: 5, y: 45 } }),
    ]);
  });
  // The board's crosshair while picking (design §2 'Picker'). The cursor over the canvas is the canvas document's own,
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

describe("anchors-query reply", () => {
  test("answers a new query without waiting for an animation frame, which an off-screen iframe never gets", () => {
    const { canvas } = heroCanvas();
    canvas.context.innerWidth = 600;
    canvas.fromParent({ type: "measure" });
    canvas.fromParent({ type: "anchors-query", document: ofType(canvas, "layout")[0]?.document, generation: 1, request: 1, targets: [{ id: "f", frame: "hero" }] });
    expect(ofType(canvas, "anchors")).toEqual([expect.objectContaining({ generation: 1, request: 1, results: [{ id: "f", candidates: { frame: [expect.any(String)] } }] })]);
  });
});
