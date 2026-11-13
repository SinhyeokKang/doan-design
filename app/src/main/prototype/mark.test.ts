import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { MAX_PROTOTYPE_MARK, PROTOTYPE_MARK_ATTRIBUTE, parsePrototypeMark } from "./mark";

interface ValueCase { name: string; value: string; valid: boolean; width?: number; height?: number }
// Shared with Go's canvas parser and `doan check`, so both sides judge every value the same way.
const fixture = JSON.parse(readFileSync(new URL("../../../../schema/fixtures/prototype-mark/cases.json", import.meta.url), "utf8")) as { values: ValueCase[] };

describe("shared prototype-mark fixture", () => {
  test("has value cases", () => {
    expect(fixture.values.length).toBeGreaterThan(0);
  });

  test.each(fixture.values.map(c => [c.name, c] as const))("%s", (_name, c) => {
    expect(parsePrototypeMark(c.value)).toEqual(c.valid ? { width: c.width, height: c.height } : null);
  });
});

describe("parsePrototypeMark", () => {
  test("reads width and height in CSS px", () => {
    expect(parsePrototypeMark("390x844")).toEqual({ width: 390, height: 844 });
    expect(parsePrototypeMark("1x1")).toEqual({ width: 1, height: 1 });
    expect(parsePrototypeMark("99999x99999")).toEqual({ width: 99999, height: 99999 });
    expect(parsePrototypeMark("1280x800")).toEqual({ width: 1280, height: 800 });
  });

  test.each([
    ["one number", "390"],
    ["empty", ""],
    ["zero width", "0x844"],
    ["zero height", "390x0"],
    ["leading zero", "0390x844"],
    ["leading zero in height", "390x0844"],
    ["six digits", "100000x1"],
    ["six digit height", "1x100000"],
    ["upper-case X", "390X844"],
    ["multiplication sign", "390×844"],
    ["two x", "390xx844"],
    ["three numbers", "390x844x1"],
    ["space inside", "390 x 844"],
    ["leading space", " 390x844"],
    ["trailing space", "390x844 "],
    ["trailing newline", "390x844\n"],
    ["leading newline", "\n390x844"],
    ["CR only", "390x844\r"],
    ["BOM", "﻿390x844"],
    ["NBSP", "390x844 "],
    ["U+0085", "390x844\u0085"],
    ["full-width digits", "３９０x８４４"],
    ["Arabic-Indic digits", "٣٩٠x٨٤٤"],
    ["sign", "+390x844"],
    ["negative", "-390x844"],
    ["decimal", "390.5x844"],
    ["exponent", "1e3x844"],
    ["units", "390pxx844px"],
  ])("rejects %s", (_name, value) => {
    expect(parsePrototypeMark(value)).toBeNull();
  });

  test("rejects anything that is not a string", () => {
    for (const value of [undefined, null, 390, { width: 390, height: 844 }, ["390x844"], true]) expect(parsePrototypeMark(value)).toBeNull();
  });

  test("the raw value cap holds every valid mark", () => {
    expect("99999x99999".length).toBeLessThanOrEqual(MAX_PROTOTYPE_MARK);
    expect(PROTOTYPE_MARK_ATTRIBUTE).toBe("data-doan-prototype");
  });
});
