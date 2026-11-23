import { Schema, Slice, type Node as PMNode } from "prosemirror-model";
import type { Transform } from "prosemirror-transform";
import type { Anchor } from "../main/conversation/types";
import { normalize, type FieldSegment } from "./anchorField";

// The composer field's ProseMirror document (ChipField). Every line of the field's text is one paragraph, drawn as a
// <div> (a <p> would add a line break per line to the selected text and the accessibility value), and a chip is an
// inline atom. Markers and depth spaces stay typed text: lists are only drawn, as decorations (fieldDecorations.ts).
// Positions convert to the field's units (anchorField.ts): a unit is a UTF-16 code unit of text or one chip, and a
// line break is one unit where the document has a paragraph boundary of two positions.
//
// Chromium cannot draw a caret before a contenteditable=false element at a line's start, so a line that starts with a
// chip starts with a filler: a zero-width space under the `filler` mark, which is no unit. `fixFillers` keeps exactly
// those fillers after every change; the caret at that line's start stands after the filler, on the chip's line.

export const FILLER = "​";

// The chip's DOM is drawn by ChipField's node view; toDOM only serves ProseMirror's own serialisation, which the field
// never uses for the clipboard.
export const fieldSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", toDOM: () => ["div", 0], parseDOM: [{ tag: "div" }] },
    text: { group: "inline" },
    chip: { group: "inline", inline: true, atom: true, selectable: false, draggable: false, attrs: { anchor: {} }, toDOM: () => ["span", { class: "anchor-chip" }] },
  },
  // Not inclusive, so text typed or composed at the filler never takes the mark (ProseMirror wraps the IME's caret
  // outside it).
  marks: { filler: { inclusive: false, toDOM: () => ["span", { class: "field-filler" }, 0], parseDOM: [{ tag: "span.field-filler" }] } },
});

const isFiller = (node: PMNode | null | undefined) => node?.isText === true && node.marks.some(mark => mark.type === fieldSchema.marks.filler);
// The paragraph's leading filler: 1 when it starts with one, else 0.
const lead = (line: PMNode) => (isFiller(line.firstChild) && line.firstChild!.text === FILLER ? 1 : 0);

function lineNodes(segments: readonly FieldSegment[]): PMNode[][] {
  const lines: PMNode[][] = [[]];
  for (const segment of normalize(segments)) {
    if (segment.kind === "chip") {
      const line = lines[lines.length - 1]!;
      if (line.length === 0) line.push(fieldSchema.text(FILLER, [fieldSchema.marks.filler.create()]));
      line.push(fieldSchema.nodes.chip.create({ anchor: segment.anchor }));
      continue;
    }
    segment.text.split("\n").forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece !== "") lines[lines.length - 1]!.push(fieldSchema.text(piece));
    });
  }
  return lines;
}

export function docFromSegments(segments: readonly FieldSegment[]): PMNode {
  return fieldSchema.nodes.doc.create(null, lineNodes(segments).map(line => fieldSchema.nodes.paragraph.create(null, line)));
}

// Segments as a slice to put in at a position inside a paragraph: open at both ends, so its line breaks split the
// paragraph there.
export function sliceFromSegments(segments: readonly FieldSegment[]): Slice {
  return new Slice(docFromSegments(segments).content, 1, 1);
}

export function segmentsFromDoc(doc: PMNode): FieldSegment[] {
  const out: FieldSegment[] = [];
  doc.forEach((line, _offset, index) => {
    if (index > 0) out.push({ kind: "text", text: "\n" });
    line.forEach(node => {
      if (isFiller(node)) return;
      out.push(node.isText ? { kind: "text", text: node.text! } : { kind: "chip", anchor: node.attrs.anchor as Anchor });
    });
  });
  return normalize(out);
}

// A unit offset → the document position at it, past a line's filler; past the end it clamps to the end.
export function posFromUnit(doc: PMNode, unit: number): number {
  let pos = 1, left = Math.max(0, unit);
  for (let i = 0; i < doc.childCount; i++) {
    const line = doc.child(i), filler = lead(line), size = line.content.size - filler;
    if (left <= size || i === doc.childCount - 1) return pos + filler + Math.min(left, size);
    left -= size + 1;
    pos += line.nodeSize;
  }
  return pos;
}

// A document position → its unit offset. A position between two paragraphs (never a caret) counts as the next line's
// start, and one before a line's filler as that line's start.
export function unitFromPos(doc: PMNode, pos: number): number {
  let unit = 0, start = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const line = doc.child(i), end = start + line.nodeSize, filler = lead(line), size = line.content.size - filler;
    if (pos < end) return unit + Math.max(0, Math.min(pos - start - 1 - filler, size));
    unit += size + 1;
    start = end;
  }
  return Math.max(0, unit - 1);
}

// Puts the fillers right in `tr`: one before a chip that starts a line, and none elsewhere. A filler that took typed
// text loses the zero-width space and the mark but keeps the text. True when it changed something.
export function fixFillers(tr: Transform): boolean {
  const fixes: { from: number; to: number; text: string | null }[] = [];
  tr.doc.forEach((line, offset) => {
    const start = offset + 1;
    let kept = false, first: PMNode | null = null;
    for (let index = 0, at = 0; index < line.childCount; at += line.child(index).nodeSize, index++) {
      const node = line.child(index);
      if (!isFiller(node)) { first ??= node; continue; }
      if (index === 0 && node.text === FILLER && line.maybeChild(1)?.type === fieldSchema.nodes.chip) { kept = true; continue; }
      const rest = node.text!.replaceAll(FILLER, "");
      if (rest !== "") first ??= node;
      fixes.push({ from: start + at, to: start + at + node.nodeSize, text: rest });
    }
    if (!kept && first?.type === fieldSchema.nodes.chip) fixes.push({ from: start, to: start, text: null });
  });
  for (const fix of fixes.sort((a, b) => b.from - a.from)) {
    if (fix.text === null) tr.insert(fix.from, fieldSchema.text(FILLER, [fieldSchema.marks.filler.create()]));
    else if (fix.text !== "") tr.replaceWith(fix.from, fix.to, fieldSchema.text(fix.text));
    else tr.delete(fix.from, fix.to);
  }
  return fixes.length > 0;
}
