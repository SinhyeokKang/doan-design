import { describe, expect, test } from "vitest";
import { MAX_FRAMES, MAX_STRING, acceptCanvasMessage, parseCanvasMessage } from "./canvasMessage";

const frame = { id: "login", title: "Login", x: 0, y: 10, width: 375, height: 800 };
const layout = (over: Record<string, unknown> = {}) => ({
  type: "layout",
  href: "http://127.0.0.1:4000/t/tok/key/design/a.html",
  height: 2400,
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
  test("pin the limits design.md fixes", () => {
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
      frames: [frame],
      truncated: false,
    });
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
