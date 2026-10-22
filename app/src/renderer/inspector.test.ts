import { describe, expect, test } from "vitest";
import { sourceNotes, swatchColor, UNKNOWN_SOURCE_TIP, type InspectRow } from "./inspector";

const row = (over: Partial<InspectRow>): InspectRow => ({ group: "Colors", label: "Text", value: "#111827", state: "token", ...over });

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
    expect(swatchColor(row({ group: "Box", value: "#111827" }))).toBeUndefined();
  });
});
