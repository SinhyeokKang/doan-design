import { describe, expect, test } from "vitest";
import type { InspectRow } from "../main/inspect";
import { sourceNotes, swatchColor, tokenTitle, UNKNOWN_SOURCE_TIP } from "./inspector";

const row = (over: Partial<InspectRow>): InspectRow => ({ group: "colors", label: "Text", value: "#111827", state: "token", ...over });

describe("sourceNotes", () => {
  test("names every state but Default in text, after the token chip", () => {
    expect(sourceNotes(row({ token: "--mock-ink" }))).toEqual([]);
    expect(sourceNotes(row({ state: "hardcoded" }))).toEqual([{ text: "Hardcoded", title: "Hardcoded", hardcoded: true }]);
    expect(sourceNotes(row({ state: "unknown" }))).toEqual([{ text: "Unknown source", title: UNKNOWN_SOURCE_TIP, hardcoded: false }]);
    expect(sourceNotes(row({ token: "--mock-ink", inheritedFrom: "div", hoverState: true }))).toEqual([
      { text: "Inherited from div", title: "Inherited from div", hardcoded: false },
      { text: "Hover state", title: "Hover state", hardcoded: false },
    ]);
  });

  test("leaves Default without notes", () => {
    expect(sourceNotes(row({ state: "default", inheritedFrom: "body", hoverState: true }))).toEqual([]);
  });
});

describe("swatchColor", () => {
  test("only for hex or transparent values in Colors", () => {
    expect(swatchColor(row({}))).toBe("#111827");
    expect(swatchColor(row({ value: "#4f46e580" }))).toBe("#4f46e580");
    expect(swatchColor(row({ value: "transparent" }))).toBe("transparent");
    for (const value of ["—", "red", "#fff", "url(x)", "#11182"]) expect(swatchColor(row({ value }))).toBeUndefined();
    expect(swatchColor(row({ group: "box", value: "#111827" }))).toBeUndefined();
  });
});

describe("tokenTitle", () => {
  test("shows the alias chain down to the value, or the token alone", () => {
    expect(tokenTitle(row({ token: "--brand-alias", chain: ["--brand-alias", "--brand", "--indigo-600"], value: "#4f46e5" }))).toBe("--brand-alias → --brand → --indigo-600 → #4f46e5");
    expect(tokenTitle(row({ token: "--space-2 --space-4", value: "8px 16px" }))).toBe("--space-2 --space-4");
  });
});

test("the unknown tooltip says doan cannot tell the source (CDP decision)", () => {
  expect(UNKNOWN_SOURCE_TIP).toBe("Doan can't tell where this value comes from");
});
