import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { FieldSegment } from "./anchorField";
import { fieldListItems } from "./composerLists";
import { posFromUnit } from "./fieldDoc";
import type { FieldRun } from "./skillWords";

// Depth spaces take no width; the line's padding draws the depth. The marker gap is letter-spacing, not padding, so a
// caret at the body start stays outside every decoration (styles.css 'Composer field lists').

// ChipField measures once per string and caches.
export type Measure = (text: string) => number;

export interface FieldLineDraw { line: number; depth: number; markWidth: number }
export type FieldInlineDraw =
  | { kind: "skill"; start: number; end: number }
  | { kind: "mark"; start: number; end: number; list: "ul" | "ol" }
  | { kind: "depth"; start: number; end: number; spaceWidth: number };

// Units in `start`/`end`, lines by index.
export function fieldDraws(segments: readonly FieldSegment[], runs: readonly FieldRun[], measure: Measure): { lines: FieldLineDraw[]; inlines: FieldInlineDraw[] } {
  const lines: FieldLineDraw[] = [];
  const text = segments.map(segment => (segment.kind === "text" ? segment.text : "￼")).join("");
  for (const item of fieldListItems(segments)) {
    const line = text.slice(0, item.start).split("\n").length - 1;
    lines.push({ line, depth: item.depth, markWidth: measure(item.marker) });
  }
  const inlines: FieldInlineDraw[] = [];
  for (const run of runs) {
    if (run.kind === "skill") inlines.push({ kind: "skill", start: run.start, end: run.end });
    // Its one space stays plain text.
    else if (run.kind === "mark") inlines.push({ kind: "mark", start: run.start, end: run.end - 1, list: run.list });
    else inlines.push({ kind: "depth", start: run.start, end: run.end, spaceWidth: measure(" ") });
  }
  return { lines, inlines };
}

export function fieldDecorations(doc: PMNode, segments: readonly FieldSegment[], runs: readonly FieldRun[], measure: Measure): DecorationSet {
  const { lines, inlines } = fieldDraws(segments, runs, measure);
  // Its line's padding and its own letter-spacing read it (styles.css).
  const marks = new Map(lines.map(line => [line.line, line.markWidth]));
  const starts: number[] = [];
  doc.forEach((_line, offset) => { starts.push(offset); });
  const decorations: Decoration[] = [];
  for (const { line, depth, markWidth } of lines) {
    const from = starts[line]!;
    decorations.push(Decoration.node(from, from + doc.child(line).nodeSize, { class: "field-item", "data-depth": String(depth), "data-mark": px(markWidth) }));
  }
  for (const draw of inlines) {
    const from = posFromUnit(doc, draw.start), to = posFromUnit(doc, draw.end);
    if (draw.kind === "skill") decorations.push(Decoration.inline(from, to, { class: "skill-word" }));
    else if (draw.kind === "mark") decorations.push(Decoration.inline(from, to, { class: "field-mark", "data-kind": draw.list, "data-mark": px(marks.get(doc.resolve(from).index(0))!), "data-chars": String(draw.end - draw.start) }));
    else decorations.push(Decoration.inline(from, to, { class: "field-depth", style: `word-spacing: ${px(-draw.spaceWidth)}` }));
  }
  return DecorationSet.create(doc, decorations);
}

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`;
