import { EditorState } from "prosemirror-state";
import { expect, test } from "vitest";
import { unitLength, type FieldSegment } from "./anchorField";
import { docFromSegments, FILLER, fieldSchema, fixFillers, posFromUnit, segmentsFromDoc, sliceFromSegments, unitFromPos } from "./fieldDoc";

const chip = (id: string): FieldSegment => ({ kind: "chip", anchor: { frame: { id, title: id } } });
const text = (value: string): FieldSegment => ({ kind: "text", text: value });
const CASES: FieldSegment[][] = [
  [], [text("a")], [text("\n")], [text("a\n")], [text("\na")], [text("a\n\nb")], [text("\n\n")], [text("- a\n  - b\n    - c")],
  [text("1. x\n10. y\n100. z")], [text("  - lead\tand tab")], [text("a😀\nb👨‍👩‍👧 🇰🇷")], [chip("a")], [chip("a"), text("\n"), chip("b")],
  [text("a"), chip("a"), text("b")], [text("- "), chip("a"), text(" body\n")], [text("a\n"), chip("a"), text(" b\n"), chip("b")],
];

test.each(CASES.map(segments => [JSON.stringify(segments), segments] as const))("segments ↔ document round trip %s", (_name, segments) => {
  const doc = docFromSegments(segments);
  expect(segmentsFromDoc(doc)).toEqual(segments);
  const lines = segments.map(s => (s.kind === "text" ? s.text : "x")).join("").split("\n").length;
  expect(doc.childCount).toBe(lines);
});

test.each(CASES.map(segments => [JSON.stringify(segments), segments] as const))("every unit maps to a position and back %s", (_name, segments) => {
  const doc = docFromSegments(segments);
  for (let unit = 0; unit <= unitLength(segments); unit++) expect(unitFromPos(doc, posFromUnit(doc, unit))).toBe(unit);
  expect(posFromUnit(doc, unitLength(segments) + 5)).toBe(doc.content.size - 1);
});

test("a line that starts with a chip starts with a filler, which is no unit; its line start stands after it", () => {
  const doc = docFromSegments([text("a\n"), chip("a"), text(" b")]);
  const line = doc.child(1);
  expect(line.firstChild!.text).toBe(FILLER);
  expect(line.firstChild!.marks.map(mark => mark.type.name)).toEqual(["filler"]);
  // Units: "a" 0, "\n" 1, chip 2. Positions: paragraph 2 opens at 3, its filler is 4..5, the chip 5..6.
  expect(posFromUnit(doc, 2)).toBe(5);
  expect(unitFromPos(doc, 4)).toBe(2);
  expect(unitFromPos(doc, 6)).toBe(3);
  expect(docFromSegments([text("a"), chip("a")]).child(0).childCount).toBe(2);
});

test("fixFillers keeps a filler only before a line-start chip and keeps text typed into one", () => {
  const filler = (value: string) => fieldSchema.text(value, [fieldSchema.marks.filler.create()]);
  const para = (...nodes: ReturnType<typeof filler>[]) => fieldSchema.nodes.paragraph.create(null, nodes);
  const chipNode = fieldSchema.nodes.chip.create({ anchor: { frame: { id: "a", title: "a" } } });
  const doc = fieldSchema.nodes.doc.create(null, [
    para(filler(`${FILLER}x`), chipNode), // typed into the filler: the text stays, the filler goes
    para(chipNode), // a line-start chip without one gets one
    para(fieldSchema.text("y"), filler(FILLER), chipNode), // not at the line start
    para(filler(FILLER), chipNode), // right as it is
  ]);
  const tr = EditorState.create({ doc }).tr;
  expect(fixFillers(tr)).toBe(true);
  expect(segmentsFromDoc(tr.doc)).toEqual([text("x"), chip("a"), text("\n"), chip("a"), text("\ny"), chip("a"), text("\n"), chip("a")]);
  tr.doc.forEach((line, _offset, index) => {
    const fillers: (string | undefined)[] = [];
    line.forEach(node => { if (node.marks.length) fillers.push(node.text); });
    expect([index, fillers]).toEqual([index, index === 1 || index === 3 ? [FILLER] : []]);
  });
  const again = EditorState.create({ doc: tr.doc }).tr;
  expect(fixFillers(again)).toBe(false);
});

test("a slice of segments put in a paragraph splits it at its line breaks", () => {
  const doc = docFromSegments([text("ab")]);
  const tr = EditorState.create({ doc }).tr.replace(2, 2, sliceFromSegments([text("1\n2")]));
  expect(segmentsFromDoc(tr.doc)).toEqual([text("a1\n2b")]);
});
