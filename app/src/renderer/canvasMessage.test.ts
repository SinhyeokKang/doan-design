import { describe, expect, test } from "vitest";
import { MAX_FRAMES, MAX_HREF, MAX_STRING, acceptCanvasMessage, parseCanvasMessage } from "./canvasMessage";

const frame = { id: "login", title: "Login", x: 0, y: 10, width: 375, height: 800 };
const layout = (over: Record<string, unknown> = {}) => ({
  type: "layout",
  href: "http://127.0.0.1:4000/t/tok/key/design/a.html",
  height: 2400,
  viewport: 150,
  frames: [frame],
  truncated: false,
  ...over,
});
const wheel = (over: Record<string, unknown> = {}) => ({
  type: "wheel",
  dx: 1,
  dy: -2,
  ctrl: true,
  meta: false,
  deltaMode: 0,
  x: 120,
  y: 340,
  ...over,
});

describe("constants", () => {
  test("pin the limits ARCHITECTURE §3 fixes", () => {
    expect(MAX_FRAMES).toBe(1000);
    expect(MAX_STRING).toBe(200);
  });
});

describe("parseCanvasMessage: layout", () => {
  test("accepts a well-formed layout", () => {
    expect(parseCanvasMessage(layout())).toEqual({
      type: "layout",
      href: "http://127.0.0.1:4000/t/tok/key/design/a.html",
      height: 2400,
      viewport: 150,
      frames: [frame],
      truncated: false,
    });
  });

  test("rejects a viewport height that is missing, not finite or negative", () => {
    for (const viewport of [undefined, null, "150", Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(parseCanvasMessage(layout({ viewport }))).toBeNull();
    }
    expect(parseCanvasMessage(layout({ viewport: 0 }))).toHaveProperty("viewport", 0);
  });

  test("drops keys it does not know, at both levels", () => {
    const parsed = parseCanvasMessage(layout({ extra: 1, frames: [{ ...frame, evil: "x" }] }));
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed).toHaveProperty("frames", [frame]);
  });

  test("rejects a NaN, Infinity or negative height", () => {
    for (const height of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expect(parseCanvasMessage(layout({ height }))).toBeNull();
    }
  });

  test("rejects a height that is not a number", () => {
    for (const height of ["100", null, undefined, {}]) {
      expect(parseCanvasMessage(layout({ height }))).toBeNull();
    }
  });

  test("accepts a height of 0", () => {
    expect(parseCanvasMessage(layout({ height: 0 }))).toHaveProperty("height", 0);
  });

  test("rejects a layout without a string href", () => {
    expect(parseCanvasMessage(layout({ href: 5 }))).toBeNull();
    expect(parseCanvasMessage(layout({ href: undefined }))).toBeNull();
  });

  test("rejects a frames value that is not an array", () => {
    expect(parseCanvasMessage(layout({ frames: "x" }))).toBeNull();
    expect(parseCanvasMessage(layout({ frames: {} }))).toBeNull();
  });

  test("keeps an empty id", () => {
    const parsed = parseCanvasMessage(layout({ frames: [{ ...frame, id: "" }] }));
    expect(parsed).toHaveProperty("frames", [{ ...frame, id: "" }]);
  });

  test("keeps duplicate ids as they are", () => {
    const parsed = parseCanvasMessage(layout({ frames: [frame, { ...frame, y: 900 }] }));
    expect(parsed).toHaveProperty("frames", [frame, { ...frame, y: 900 }]);
  });

  test("omits the title when the frame has none", () => {
    const { title: _title, ...noTitle } = frame;
    const parsed = parseCanvasMessage(layout({ frames: [noTitle] }));
    expect(parsed).toHaveProperty("frames", [noTitle]);
    expect((parsed as { frames: object[] }).frames[0]).not.toHaveProperty("title");
  });

  test("drops only the frame whose id or title is not a string", () => {
    const parsed = parseCanvasMessage(
      layout({
        frames: [{ ...frame, id: 5 }, frame, { ...frame, title: 7 }, { ...frame, id: null }, { ...frame, id: "kept" }],
      }),
    );
    expect(parsed).toHaveProperty("frames", [frame, { ...frame, id: "kept" }]);
  });

  test("drops only a frame with a non-finite coordinate or a negative size", () => {
    const bad = [
      { ...frame, x: Number.NaN },
      { ...frame, y: Number.POSITIVE_INFINITY },
      { ...frame, width: -1 },
      { ...frame, height: Number.NaN },
      { ...frame, width: "10" },
      null,
      "frame",
      [],
    ];
    const parsed = parseCanvasMessage(layout({ frames: [...bad, frame] }));
    expect(parsed).toHaveProperty("frames", [frame]);
  });

  test("keeps a frame at a negative position or with a zero size", () => {
    const odd = { id: "z", x: -50, y: -5, width: 0, height: 0 };
    expect(parseCanvasMessage(layout({ frames: [odd] }))).toHaveProperty("frames", [odd]);
  });

  test("cuts a frame array over the cap and marks it truncated", () => {
    const many = Array.from({ length: MAX_FRAMES + 5 }, (_, i) => ({ ...frame, id: `f${i}` }));
    const parsed = parseCanvasMessage(layout({ frames: many })) as { frames: { id: string }[]; truncated: boolean };
    expect(parsed.frames).toHaveLength(MAX_FRAMES);
    expect(parsed.frames[MAX_FRAMES - 1]?.id).toBe(`f${MAX_FRAMES - 1}`);
    expect(parsed.truncated).toBe(true);
  });

  test("does not mark an array of exactly the cap as truncated", () => {
    const exact = Array.from({ length: MAX_FRAMES }, (_, i) => ({ ...frame, id: `f${i}` }));
    const parsed = parseCanvasMessage(layout({ frames: exact })) as { frames: unknown[]; truncated: boolean };
    expect(parsed.frames).toHaveLength(MAX_FRAMES);
    expect(parsed.truncated).toBe(false);
  });

  test("cuts a frame string over 200 characters and marks it truncated", () => {
    const long = "가".repeat(MAX_STRING + 1);
    const parsed = parseCanvasMessage(layout({ frames: [{ ...frame, id: long, title: long }] })) as {
      frames: { id: string; title: string }[];
      truncated: boolean;
    };
    expect(parsed.frames[0]?.id).toBe("가".repeat(MAX_STRING));
    expect(parsed.frames[0]?.title).toBe("가".repeat(MAX_STRING));
    expect(parsed.truncated).toBe(true);
  });

  test("keeps a string of exactly 200 characters untouched", () => {
    const exact = "a".repeat(MAX_STRING);
    const parsed = parseCanvasMessage(layout({ frames: [{ ...frame, id: exact }] })) as {
      frames: { id: string }[];
      truncated: boolean;
    };
    expect(parsed.frames[0]?.id).toBe(exact);
    expect(parsed.truncated).toBe(false);
  });

  test("does not leave half a surrogate pair when cutting", () => {
    const text = `${"a".repeat(MAX_STRING - 1)}😀`;
    const parsed = parseCanvasMessage(layout({ frames: [{ ...frame, id: text }] })) as { frames: { id: string }[] };
    const id = parsed.frames[0]?.id ?? "";
    expect(id).toBe("a".repeat(MAX_STRING - 1));
    expect(/[\uD800-\uDBFF]$/.test(id)).toBe(false);
  });

  test("keeps a truncated flag the injected script already raised", () => {
    expect(parseCanvasMessage(layout({ truncated: true }))).toHaveProperty("truncated", true);
  });

  test("treats a missing or non-boolean truncated flag as false", () => {
    expect(parseCanvasMessage(layout({ truncated: undefined }))).toHaveProperty("truncated", false);
    expect(parseCanvasMessage(layout({ truncated: "yes" }))).toHaveProperty("truncated", false);
  });

  test("keeps a long href whole so it can still match a canvas url", () => {
    const href = `http://127.0.0.1:4000/t/tok/key/${"a".repeat(500)}.html`;
    expect(parseCanvasMessage(layout({ href }))).toHaveProperty("href", href);
  });

  test("accepts an href of exactly 8192 code units and rejects one code unit more", () => {
    expect(MAX_HREF).toBe(8192);
    const at = "h".repeat(8192);
    expect(parseCanvasMessage(layout({ href: at }))).toHaveProperty("href", at);
    expect(parseCanvasMessage(layout({ href: `${at}h` }))).toBeNull();
  });

  test("counts the href bound in UTF-16 code units, not characters", () => {
    expect(parseCanvasMessage(layout({ href: "😀".repeat(4096) }))).not.toBeNull();
    expect(parseCanvasMessage(layout({ href: "😀".repeat(4097) }))).toBeNull();
  });
});

describe("parseCanvasMessage: wheel", () => {
  test("accepts a well-formed wheel message", () => {
    expect(parseCanvasMessage(wheel())).toEqual({
      type: "wheel",
      dx: 1,
      dy: -2,
      ctrl: true,
      meta: false,
      deltaMode: 0,
      x: 120,
      y: 340,
    });
  });

  test("drops keys it does not know", () => {
    expect(parseCanvasMessage(wheel({ extra: 1 }))).not.toHaveProperty("extra");
  });

  test("rejects non-finite deltas and coordinates", () => {
    for (const key of ["dx", "dy", "x", "y"]) {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined]) {
        expect(parseCanvasMessage(wheel({ [key]: value }))).toBeNull();
      }
    }
  });

  test("accepts negative coordinates", () => {
    expect(parseCanvasMessage(wheel({ x: -10, y: -20 }))).toHaveProperty("x", -10);
  });

  test("rejects a deltaMode other than 0, 1 or 2", () => {
    for (const deltaMode of [3, -1, 0.5, "0", null, undefined, Number.NaN]) {
      expect(parseCanvasMessage(wheel({ deltaMode }))).toBeNull();
    }
    for (const deltaMode of [0, 1, 2]) {
      expect(parseCanvasMessage(wheel({ deltaMode }))).toHaveProperty("deltaMode", deltaMode);
    }
  });

  test("rejects ctrl or meta that is not a boolean", () => {
    expect(parseCanvasMessage(wheel({ ctrl: 1 }))).toBeNull();
    expect(parseCanvasMessage(wheel({ meta: "true" }))).toBeNull();
    expect(parseCanvasMessage(wheel({ ctrl: undefined }))).toBeNull();
  });
});

describe("parseCanvasMessage: anything else", () => {
  test("returns null for an unknown type", () => {
    expect(parseCanvasMessage({ type: "measure" })).toBeNull();
    expect(parseCanvasMessage({ type: 5 })).toBeNull();
    expect(parseCanvasMessage({})).toBeNull();
  });

  test("returns null for null, arrays and primitives", () => {
    for (const data of [null, undefined, [], [layout()], "layout", 5, true, Symbol("s")]) {
      expect(parseCanvasMessage(data)).toBeNull();
    }
  });
});

describe("acceptCanvasMessage", () => {
  const frameWindow = {};
  const event = (over: Record<string, unknown> = {}) => ({
    source: frameWindow,
    origin: "null",
    data: wheel(),
    ...over,
  });

  test("returns the parsed message when source and origin match", () => {
    expect(acceptCanvasMessage(event(), frameWindow)).toEqual(parseCanvasMessage(wheel()));
    expect(acceptCanvasMessage(event(), frameWindow)).not.toBeNull();
  });

  test("returns null when the source is another window", () => {
    expect(acceptCanvasMessage(event({ source: {} }), frameWindow)).toBeNull();
  });

  test("returns null when the origin is not the opaque origin", () => {
    for (const origin of ["http://127.0.0.1:4000", "", "https://evil.example", "NULL"]) {
      expect(acceptCanvasMessage(event({ origin }), frameWindow)).toBeNull();
    }
  });

  test("returns null when the iframe has no window, even for a null source", () => {
    expect(acceptCanvasMessage(event({ source: null }), null)).toBeNull();
    expect(acceptCanvasMessage(event({ source: undefined }), undefined)).toBeNull();
  });

  test("returns null when the data does not validate", () => {
    expect(acceptCanvasMessage(event({ data: { type: "wheel" } }), frameWindow)).toBeNull();
  });
});

const HREF = "http://127.0.0.1:4000/t/tok/key/design/a.html";
const rect = { x: 10, y: -20, width: 60.5, height: 0 };
const target = (over: Record<string, unknown> = {}) => ({
  rect,
  tag: "span",
  frame: { id: "hero", title: "Hero", implements: "app/src/renderer/App.tsx" },
  frameIndex: 1,
  element: { doanId: "cta", selector: '[data-doan-id="cta"] > span:nth-of-type(1)', html: "<span>Sign in</span>", truncated: true, text: "Sign in" },
  path: [{ label: "hero", selector: '[data-doan-frame="hero"]' }, { label: "cta", selector: '[data-doan-id="cta"]', doanId: "cta" }],
  interactive: "link",
  ...over,
});
const select = (over: Record<string, unknown> = {}, targetOver: Record<string, unknown> = {}) => ({ type: "select", href: HREF, seq: 3, viewport: 150, target: target(targetOver), ...over });
const withElement = (over: Record<string, unknown>) => ({ element: { ...target().element, ...over } });

describe("parseCanvasMessage: hover", () => {
  test("accepts a rect or null and drops unknown keys", () => {
    expect(parseCanvasMessage({ type: "hover", href: HREF, seq: 0, viewport: 150, rect: { ...rect, extra: 1 }, extra: 1 })).toEqual({ type: "hover", href: HREF, seq: 0, viewport: 150, rect });
    expect(parseCanvasMessage({ type: "hover", href: HREF, seq: 2, viewport: 150, rect: null })).toEqual({ type: "hover", href: HREF, seq: 2, viewport: 150, rect: null });
  });

  test("rejects a seq that is not a non-negative integer", () => {
    for (const seq of [undefined, -1, 1.5, "1", Number.NaN, 2 ** 53]) {
      expect(parseCanvasMessage({ type: "hover", href: HREF, seq, viewport: 150, rect: null })).toBeNull();
    }
  });

  test("rejects a rect with a non-finite coordinate or a negative size, and a missing rect", () => {
    for (const bad of [{ ...rect, x: Number.NaN }, { ...rect, width: -1 }, { ...rect, height: Number.POSITIVE_INFINITY }, undefined, "r"]) {
      expect(parseCanvasMessage({ type: "hover", href: HREF, seq: 0, viewport: 150, rect: bad })).toBeNull();
    }
  });

  test("rejects an over-long href or a bad viewport", () => {
    expect(parseCanvasMessage({ type: "hover", href: `${HREF}?${"q".repeat(MAX_HREF)}`, seq: 0, viewport: 150, rect: null })).toBeNull();
    expect(parseCanvasMessage({ type: "hover", href: HREF, seq: 0, viewport: -1, rect: null })).toBeNull();
  });
});

describe("parseCanvasMessage: select", () => {
  test("accepts a full target and copies only known keys", () => {
    const raw = select({ extra: 1 }, { extra: 1, frame: { ...target().frame, extra: 1 }, element: { ...target().element, extra: 1 }, path: [{ ...target().path[0], extra: 1 }] });
    expect(parseCanvasMessage(raw)).toEqual({
      type: "select",
      href: HREF,
      seq: 3,
      viewport: 150,
      target: { ...target(), path: [target().path[0]] },
    });
  });

  test("accepts a frame selection, a target without frame and a null target", () => {
    const { element: _element, ...frameOnly } = target({ interactive: undefined });
    expect(parseCanvasMessage(select({ target: frameOnly }))).toMatchObject({ target: { frame: { id: "hero" }, path: target().path } });
    const { frame: _frame, frameIndex: _index, ...noFrame } = target();
    expect(parseCanvasMessage(select({ target: noFrame }))).toHaveProperty("target.tag", "span");
    expect(parseCanvasMessage(select({ target: null }))).toEqual({ type: "select", href: HREF, seq: 3, viewport: 150, target: null });
  });

  test("keeps the command a selection answers, and drops a message naming any other", () => {
    expect(parseCanvasMessage(select())).not.toHaveProperty("answer");
    expect(parseCanvasMessage(select({ answer: "select-anchor" }))).toHaveProperty("answer", "select-anchor");
    expect(parseCanvasMessage(select({ answer: "select-comment", target: null }))).toEqual({ type: "select", href: HREF, seq: 3, viewport: 150, target: null, answer: "select-comment" });
    for (const answer of ["pick-frame", "clear", "", 1, null, true]) expect(parseCanvasMessage(select({ answer }))).toBeNull();
    expect(parseCanvasMessage({ type: "clear", href: HREF, seq: 3, viewport: 150, answer: "select-anchor" })).toEqual({ type: "clear", href: HREF, seq: 3, viewport: 150 });
  });

  test("keeps an element without doanId, truncated or text", () => {
    const element = { selector: "body > p:nth-of-type(1)", html: "<p></p>" };
    expect(parseCanvasMessage(select({}, { element }))).toHaveProperty("target.element", element);
  });

  test("drops the message when a string is over its cap (design 'length caps')", () => {
    const over: Record<string, unknown>[] = [
      { tag: "t".repeat(201) },
      { frame: { id: "f".repeat(201) } },
      { frame: { id: "f", title: "t".repeat(201) } },
      { frame: { id: "f", implements: "i".repeat(501) } },
      withElement({ doanId: "d".repeat(201) }),
      withElement({ selector: "s".repeat(1001) }),
      withElement({ html: "h".repeat(2001) }),
      withElement({ text: "t".repeat(501) }),
      { path: Array.from({ length: 33 }, () => ({ label: "div", selector: "div" })) },
      { path: [{ label: "l".repeat(201), selector: "div" }] },
      { path: [{ label: "div", selector: "s".repeat(1001) }] },
      { path: [{ label: "div", selector: "div", doanId: "d".repeat(201) }] },
    ];
    for (const fields of over) expect(parseCanvasMessage(select({}, fields))).toBeNull();
  });

  test("accepts every string at exactly its cap", () => {
    const at = select({}, {
      tag: "t".repeat(200),
      frame: { id: "f".repeat(200), title: "t".repeat(200), implements: "i".repeat(500) },
      ...withElement({ doanId: "d".repeat(200), selector: "s".repeat(1000), html: "h".repeat(2000), text: "t".repeat(500) }),
      path: Array.from({ length: 32 }, () => ({ label: "l".repeat(200), selector: "s".repeat(1000) })),
    });
    expect(parseCanvasMessage(at)).not.toBeNull();
  });

  test("counts html and text in code points and the other caps in UTF-16 units", () => {
    expect(parseCanvasMessage(select({}, withElement({ html: "😀".repeat(2000), text: "😀".repeat(500) })))).not.toBeNull();
    expect(parseCanvasMessage(select({}, withElement({ html: "😀".repeat(2001) })))).toBeNull();
    expect(parseCanvasMessage(select({}, { tag: "😀".repeat(101) }))).toBeNull();
  });

  test("rejects wrong types and values", () => {
    const bad: Record<string, unknown>[] = [
      { tag: 5 },
      { frameIndex: -1 },
      { frameIndex: 1000 },
      { frameIndex: 1.5 },
      { interactive: "maybe" },
      { path: "a" },
      { path: [{ label: "a" }] },
      { frame: { title: "no id" } },
      withElement({ selector: undefined }),
      withElement({ html: 5 }),
      withElement({ truncated: "yes" }),
      { rect: null },
    ];
    for (const fields of bad) expect(parseCanvasMessage(select({}, fields))).toBeNull();
    expect(parseCanvasMessage(select({ target: undefined }))).toBeNull();
  });
});

describe("parseCanvasMessage: clear and key", () => {
  test("accepts a clear with href, seq and viewport", () => {
    expect(parseCanvasMessage({ type: "clear", href: HREF, seq: 4, viewport: 150, extra: 1 })).toEqual({ type: "clear", href: HREF, seq: 4, viewport: 150 });
    expect(parseCanvasMessage({ type: "clear", href: HREF, viewport: 150 })).toBeNull();
  });

  test("accepts Escape as the only key", () => {
    expect(parseCanvasMessage({ type: "key", href: HREF, seq: 0, viewport: 150, key: "Escape" })).toEqual({ type: "key", href: HREF, seq: 0, viewport: 150, key: "Escape" });
    expect(parseCanvasMessage({ type: "key", href: HREF, seq: 0, viewport: 150, key: "Enter" })).toBeNull();
  });
});

describe("parseCanvasMessage: layout selection", () => {
  test("keeps seq and the selected rect or null", () => {
    expect(parseCanvasMessage(layout({ seq: 2, selected: rect }))).toMatchObject({ seq: 2, selected: rect });
    expect(parseCanvasMessage(layout({ seq: 2, selected: null }))).toMatchObject({ seq: 2, selected: null });
  });

  test("rejects a selected rect without a seq, a bad rect or a bad seq", () => {
    expect(parseCanvasMessage(layout({ selected: rect }))).toBeNull();
    expect(parseCanvasMessage(layout({ seq: 1, selected: { ...rect, width: -1 } }))).toBeNull();
    expect(parseCanvasMessage(layout({ seq: -1, selected: rect }))).toBeNull();
  });

  test("leaves both out when the script has no selection", () => {
    const parsed = parseCanvasMessage(layout({ seq: 1 }));
    expect(parsed).not.toHaveProperty("selected");
    expect(parsed).not.toHaveProperty("seq");
  });
});

test("validates Alt state messages separately from Escape", () => {
  for (const alt of [true, false]) {
    const message = { type: "key", key: "Alt", alt, href: HREF, seq: 2, viewport: 150 };
    expect(parseCanvasMessage(message)).toEqual(message);
  }
  for (const alt of [undefined, null, 0, "false"]) {
    expect(parseCanvasMessage({ type: "key", key: "Alt", alt, href: HREF, seq: 2, viewport: 150 })).toBeNull();
  }
});

describe("parseCanvasMessage: transition-intent", () => {
  const intent = (over: Record<string, unknown> = {}) => ({ type: "transition-intent", document: "d1", href: "http://x/a.html", viewport: 150, intent: 1, kind: "selection", ...over });
  test("keeps the kind that separates a selection from a link", () => {
    expect(parseCanvasMessage(intent())).toEqual(intent());
    expect(parseCanvasMessage(intent({ kind: "navigation" }))).toHaveProperty("kind", "navigation");
  });
  test("keeps the flag of a click that only clears the selection", () => {
    expect(parseCanvasMessage(intent({ clear: true }))).toEqual(intent({ clear: true }));
  });
  test.each([false, "true", 1])("rejects clear %j", clear => {
    expect(parseCanvasMessage(intent({ clear }))).toBeNull();
  });
  test.each([undefined, "other", 1])("rejects kind %j", kind => {
    expect(parseCanvasMessage(intent({ kind }))).toBeNull();
  });
});
