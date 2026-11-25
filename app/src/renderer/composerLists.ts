import { LIST_MARKER } from "../main/conversation/messageText";
import { spliceUnits, textSegments, type FieldSegment } from "./anchorField";
import type { MessagePart } from "./threadItems";

// Lists are a reading of the text, never a value of their own: the field keeps its segments and the message its text,
// markers and depth spaces included (PRODUCT §5 'Composer').

export type ListKind = "ul" | "ol";
// `lead` and `body` are code units into the line: the marker an edit copies or removes is always the marker and one
// space. `column` is the body's column for nesting (CommonMark §5.2, see bodyColumn).
export interface ListItem { list: ListKind; marker: string; number: number | null; depth: number; lead: number; body: number; indent: number; column: number }
export type ListLine = ListItem | null;
export type FieldListItem = ListItem & { start: number };
export type FieldEdit = { segments: FieldSegment[]; caret: number };

// A tab advances to the next multiple of 4 columns (CommonMark §2.2), so " \t" reaches column 4 as Markdown readers
// count it.
function columns(text: string, from = 0): number {
  let column = from;
  for (const char of text) column = char === "\t" ? column + 4 - (column % 4) : column + 1;
  return column;
}

// 1 to 4 columns of whitespace after the marker put the body past them, 5 or more (or no body) one column past the
// marker. `rest` is the line after the marker's one space.
function bodyColumn(indent: number, marker: string, rest: string): number {
  const end = indent + marker.length - 1, space = /^[ \t]*/.exec(rest)?.[0] ?? "";
  const width = columns(" " + space, end) - end;
  return end + (width <= 4 && rest.trim() !== "" ? width : 1);
}

// Unlike full CommonMark, any line that is not an item ends the list here, so the next item starts again at depth 0.
export function listLines(lines: readonly string[]): ListLine[] {
  const open: ListItem[] = [];
  return lines.map(line => {
    const match = LIST_MARKER.exec(line);
    if (!match) { open.length = 0; return null; }
    const lead = match[1] ?? "", marker = match[2] ?? "", indent = columns(lead);
    while (open.length > 0 && indent < open[open.length - 1]!.column) open.pop();
    const ordered = marker.endsWith(". "), column = bodyColumn(indent, marker, line.slice(lead.length + marker.length));
    const item: ListItem = {
      list: ordered ? "ol" : "ul", marker, number: ordered ? Number(marker.slice(0, -2)) : null, depth: open.length,
      lead: lead.length, body: lead.length + marker.length, indent, column,
    };
    open.push(item);
    return item;
  });
}

// A chip reads as one non-whitespace character, so string offsets stay field units and a line that starts with a chip
// is not an item.
const CHIP = "￼";
function layout(segments: readonly FieldSegment[]): { lines: string[]; starts: number[]; items: ListLine[] } {
  const lines = segments.map(segment => (segment.kind === "text" ? segment.text : CHIP)).join("").split("\n");
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) { starts.push(at); at += line.length + 1; }
  return { lines, starts, items: listLines(lines) };
}
function lineOf(starts: readonly number[], caret: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1]! <= caret) i++;
  return i;
}

export function fieldListItems(segments: readonly FieldSegment[]): FieldListItem[] {
  const { starts, items } = layout(segments);
  return items.flatMap((item, i) => (item ? [{ ...item, start: starts[i]! }] : []));
}

// A number marker has at most 3 digits; the one after 999 would read as text.
const numbered = (n: number) => (n > 999 ? null : `${n}. `);

// Null leaves it to a plain line break.
export function continueList(segments: readonly FieldSegment[], caret: number): FieldEdit | null {
  const { lines, starts, items } = layout(segments);
  const i = lineOf(starts, caret), item = items[i], start = starts[i]!, line = lines[i]!;
  if (!item || caret < start + item.body) return null;
  if (line.slice(item.body).trim() === "") {
    if (item.depth > 0) return indentItem(segments, caret, -1);
    const edit = spliceUnits(segments, start + item.lead, start + item.body, []);
    return { segments: edit.segments, caret: caret - (item.body - item.lead) };
  }
  const marker = item.list === "ul" ? item.marker : numbered((item.number ?? 0) + 1);
  if (marker === null) return null;
  return spliceUnits(segments, caret, caret, textSegments(`\n${line.slice(0, item.lead)}${marker}`));
}

// Its children move with it. When the new number would have 4 digits the item keeps its marker, since the depth change
// is what the key asked for.
export function indentItem(segments: readonly FieldSegment[], caret: number, dir: 1 | -1): FieldEdit | null {
  const { lines, starts, items } = layout(segments);
  const i = lineOf(starts, caret), item = items[i];
  if (!item) return null;
  // The new parent for Tab, the old parent for Shift+Tab: the nearest item above at the depth the item keeps or leaves.
  const level = dir === 1 ? item.depth : item.depth - 1;
  let at = i - 1;
  while (at >= 0 && items[at] && items[at]!.depth > level) at--;
  const target = at >= 0 ? items[at] : null;
  if (!target || target.depth !== level) return null;
  let previous: ListItem | null = dir === 1 ? null : target;
  for (let j = i - 1; dir === 1 && j > at; j--) if (items[j]!.depth === item.depth + 1) { previous = items[j]!; break; }
  const marker = item.list === "ul" ? item.marker : numbered(previous?.list === "ol" ? (previous.number ?? 0) + 1 : 1) ?? item.marker;
  const lead = dir === 1 ? " ".repeat(target.column) : lines[at]!.slice(0, target.lead);
  // A tab after the marker can reach a different stop from the new place, so the children move by the body column's
  // actual change.
  const shift = bodyColumn(columns(lead), marker, lines[i]!.slice(item.body)) - item.column;
  let edit: FieldEdit = { segments: [...segments], caret };
  // Bottom to top, so the units of the lines still to change stay where layout found them.
  let end = i + 1;
  while (items[end] && items[end]!.depth > item.depth) end++;
  for (let j = end - 1; j > i; j--) {
    const child = items[j]!;
    edit = spliceUnits(edit.segments, starts[j]!, starts[j]! + child.lead, textSegments(" ".repeat(Math.max(0, child.indent + shift))));
  }
  const start = starts[i]!, prefix = lead + marker;
  edit = spliceUnits(edit.segments, start, start + item.body, textSegments(prefix));
  const offset = caret - start;
  const moved = offset >= item.body ? start + prefix.length + offset - item.body : offset === 0 ? start : start + prefix.length;
  return { segments: edit.segments, caret: moved };
}

// At depth 0 the line becomes plain text; its leading spaces stay.
export function removeMarker(segments: readonly FieldSegment[], caret: number): FieldEdit | null {
  const { starts, items } = layout(segments);
  const i = lineOf(starts, caret), item = items[i], start = starts[i]!;
  if (!item || caret !== start + item.body) return null;
  if (item.depth > 0) return indentItem(segments, caret, -1);
  return spliceUnits(segments, start + item.lead, start + item.body, []);
}

// Markers, numbers and depth spaces are kept as typed, so the blocks stand for exactly the sent text.
export interface BubbleItem { lead: string; marker: string; parts: MessagePart[]; children: BubbleList[] }
export interface BubbleList { kind: "list"; list: ListKind; items: BubbleItem[] }
export type BubbleBlock = { kind: "text"; parts: MessagePart[] } | BubbleList;

function push(parts: MessagePart[], part: MessagePart): void {
  if (!("text" in part)) { parts.push(part); return; }
  if (part.text === "") return;
  const last = parts[parts.length - 1];
  if (last && "text" in last) parts[parts.length - 1] = { text: last.text + part.text };
  else parts.push(part);
}

export function bubbleBlocks(parts: readonly MessagePart[]): BubbleBlock[] {
  if (parts.length === 0) return [];
  const lines: MessagePart[][] = [[]];
  for (const part of parts) {
    if (!("text" in part)) { push(lines[lines.length - 1]!, part); continue; }
    part.text.split("\n").forEach((piece, i) => {
      if (i > 0) lines.push([]);
      push(lines[lines.length - 1]!, { text: piece });
    });
  }
  const items = listLines(lines.map(line => line.map(part => ("text" in part ? part.text : CHIP)).join("")));
  const blocks: BubbleBlock[] = [], open: BubbleList[] = [];
  items.forEach((item, i) => {
    const line = lines[i]!;
    if (!item) {
      open.length = 0;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "text" && i > 0 && !items[i - 1]) {
        push(last.parts, { text: "\n" });
        for (const part of line) push(last.parts, part);
      } else blocks.push({ kind: "text", parts: line });
      return;
    }
    // A marker is text, so the line's first part is text that holds all of it.
    const first = line[0], head = first && "text" in first ? first.text : "";
    const body: MessagePart[] = [];
    for (const part of [{ text: head.slice(item.body) }, ...line.slice(1)]) push(body, part);
    open.length = Math.min(open.length, item.depth + 1);
    let list = open[item.depth];
    if (!list || list.list !== item.list) {
      list = { kind: "list", list: item.list, items: [] };
      const parent = open[item.depth - 1];
      if (parent) parent.items[parent.items.length - 1]!.children.push(list);
      else blocks.push(list);
      open[item.depth] = list;
    }
    list.items.push({ lead: head.slice(0, item.lead), marker: item.marker, parts: body, children: [] });
  });
  return blocks;
}

// Only blank lines go, so the first line's indentation, which may be a list's depth, survives.
export function trimBlankLines(text: string): string {
  const lines = text.split("\n");
  let from = 0, to = lines.length;
  while (from < to && lines[from]!.trim() === "") from++;
  while (to > from && lines[to - 1]!.trim() === "") to--;
  return lines.slice(from, to).join("\n");
}
