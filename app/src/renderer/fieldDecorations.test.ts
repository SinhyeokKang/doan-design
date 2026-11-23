import { expect, test } from "vitest";
import { textSegments } from "./anchorField";
import { fieldDecorations, fieldDraws } from "./fieldDecorations";
import { docFromSegments } from "./fieldDoc";
import { fieldRuns } from "./skillWords";

// Widths stand in for the field's font: 5 px per character.
const measure = (value: string) => value.length * 5;
const NESTED = "Intro\n- Title\n  - Run /copy-check on it\n10. Ten";

test("an item's line carries its depth and marker width; the marker's one space stays plain text", () => {
  const segments = textSegments(NESTED);
  const { lines, inlines } = fieldDraws(segments, fieldRuns(segments, new Set(["copy-check"]), new Set()), measure);
  expect(lines).toEqual([{ line: 1, depth: 0, markWidth: 10 }, { line: 2, depth: 1, markWidth: 10 }, { line: 3, depth: 0, markWidth: 20 }]);
  expect(inlines).toEqual([
    { kind: "mark", start: 6, end: 7, list: "ul" },
    { kind: "depth", start: 14, end: 16, spaceWidth: 5 },
    { kind: "mark", start: 16, end: 17, list: "ul" },
    { kind: "skill", start: 22, end: 33 },
    { kind: "mark", start: 40, end: 43, list: "ol" },
  ]);
});

test("the decorations sit on the item's paragraph and its text", () => {
  const segments = textSegments(NESTED), doc = docFromSegments(segments);
  const set = fieldDecorations(doc, segments, fieldRuns(segments, new Set(["copy-check"]), new Set()), measure);
  const found = set.find().map(d => [d.from, d.to, (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs]);
  // Paragraph 2 ("- Title") spans positions 7..16; its "-" is 8..9.
  expect(found).toContainEqual([7, 16, { class: "field-item", style: "--depth: 0; --mark-width: 10px" }]);
  expect(found).toContainEqual([8, 9, { class: "field-mark", "data-kind": "ul", style: "--mark-chars: 1" }]);
  expect(found).toContainEqual([17, 19, { class: "field-depth", style: "word-spacing: -5px" }]);
  expect(found.filter(([, , attrs]) => (attrs as Record<string, string>).class === "skill-word")).toHaveLength(1);
});
