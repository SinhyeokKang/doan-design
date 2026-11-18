import { expect, test } from "vitest";
import { parseInspectRequest } from "./inspector";

const CANVAS = { root: "/repo", path: ".doan/canvases/a.html" };

test("parseInspectRequest accepts {selector, canvas: {root, path}, seq} with a 1 to 1,000 unit selector", () => {
  expect(parseInspectRequest({ selector: "#a", canvas: CANVAS, seq: 3 })).toEqual({ selector: "#a", canvas: CANVAS, seq: 3 });
  expect(parseInspectRequest({ selector: "a".repeat(1000), canvas: CANVAS, seq: 0 })).toEqual({ selector: "a".repeat(1000), canvas: CANVAS, seq: 0 });
  const bad: unknown[] = [
    null, undefined, "#a", [], {},
    // The old `{selector}` shape.
    { selector: "#a" },
    { selector: "", canvas: CANVAS, seq: 1 },
    { selector: 3, canvas: CANVAS, seq: 1 },
    { selector: "a".repeat(1001), canvas: CANVAS, seq: 1 },
    { selector: "#a", canvas: CANVAS, seq: 1, extra: 1 },
  ];
  for (const value of bad) expect(parseInspectRequest(value), JSON.stringify(value)).toBeNull();
  // Astral characters count two units each.
  expect(parseInspectRequest({ selector: "😀".repeat(501), canvas: CANVAS, seq: 1 })).toBeNull();
});

test("parseInspectRequest refuses a bad canvas or seq", () => {
  const canvases: unknown[] = [null, "/repo", [], {}, { root: "/repo" }, { path: CANVAS.path }, { root: "", path: CANVAS.path }, { root: "/repo", path: "" }, { root: 1, path: CANVAS.path }, { ...CANVAS, id: "x" }];
  for (const canvas of canvases) expect(parseInspectRequest({ selector: "#a", canvas, seq: 1 }), JSON.stringify(canvas)).toBeNull();
  for (const seq of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined, 2 ** 53]) {
    expect(parseInspectRequest({ selector: "#a", canvas: CANVAS, seq }), String(seq)).toBeNull();
  }
});
