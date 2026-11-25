import type { InspectGroup, InspectRow, InspectSide } from "../main/inspect";

// Pure: the panel and the canvas page hold the state and pass it in.

export const NO_STYLES = "The canvas sets no styles here.";

// With `token` the value is only in the tooltip; `swatch` sits inside the chip when there is one.
export interface RowView {
  key: string;
  label: string;
  text: string;
  token?: string;
  swatch?: string;
  // Below a cut name or value: a token row's computed value, the alias chain, each side's value, where it is inherited
  // from.
  tip: string[];
  copy: string;
  spoken: string;
}

export interface GroupView {
  group: InspectGroup;
  title: string;
  rows: RowView[];
}

export interface RowsView {
  groups: GroupView[];
  empty?: string;
}

// A row the list does not name follows in the resolver's order.
const GROUPS: readonly (readonly [InspectGroup, string])[] = [["box", "Box"], ["typography", "Typography"], ["colors", "Colors"], ["radius", "Radius"], ["shadow", "Shadow"], ["layout", "Layout"]];
const ROW_ORDER: Partial<Record<InspectGroup, readonly string[]>> = {
  box: ["Padding", "Gap", "Margin", "Width", "Height"],
  typography: ["Size", "Weight", "Line height", "Family"],
  colors: ["Text", "Background", "Border"],
  layout: ["Display", "Direction", "Columns", "Wrap", "Justify", "Align"],
};

// Kept across replies, so focus, scroll and the late-reply check follow a row, not its position.
export function rowKey(row: Pick<InspectRow, "group" | "label">): string {
  return `${row.group}:${row.label.toLowerCase().replace(/\s+/g, "-")}`;
}

// What the row shows is what it copies.
export function rowCopyText(row: InspectRow): string {
  return rowView(row).copy;
}

export function rowDisplay(rows: readonly InspectRow[]): RowsView {
  const groups = GROUPS.flatMap(([group, title]) => {
    const order = ROW_ORDER[group] ?? [];
    const rank = (label: string) => (order.includes(label) ? order.indexOf(label) : order.length);
    // A stable sort keeps the resolver's order among rows the order list does not name.
    const list = rows.filter(row => row.group === group && row.state !== "default").sort((a, b) => rank(a.label) - rank(b.label));
    return list.length ? [{ group, title, rows: list.map(rowView) }] : [];
  });
  return groups.length ? { groups } : { groups, empty: NO_STYLES };
}

// A cut name or value puts its full text first (the app's NameTip rule). `cut` is measured after drawing.
export function rowTooltip(row: RowView, cut: boolean): string[] {
  return cut ? [row.token ?? row.text, ...row.tip] : row.tip;
}

// main's resolver ROWS with `sides` (a test ties the two); `sides` is read on these only.
export const SPLIT_ROWS = new Set(["box:padding", "box:margin", "radius:radius"]);

function rowView(row: InspectRow): RowView {
  const split = SPLIT_ROWS.has(rowKey(row));
  const sides = split ? row.sides : undefined;
  const token = chipToken(row.token, split, sides);
  const text = oneSide(sides) ?? row.value;
  const swatch = swatchColor(row);
  const tip = [
    token === undefined ? "" : row.value,
    row.chain ? row.chain.join(" → ") : "",
    sides && !uniform(sides) ? sideList(sides) : "",
    row.inheritedFrom === undefined ? "" : `Inherited from ${row.inheritedFrom}`,
  ].filter(line => line !== "");
  const view: RowView = { key: rowKey(row), label: row.label, text, tip, copy: token ?? text, spoken: [row.label, token === undefined ? text : row.value, token === undefined ? "" : `token ${token}`].filter(part => part !== "").join(", ") };
  if (token !== undefined) view.token = token;
  if (swatch !== undefined) view.swatch = swatch;
  return view;
}

// A chip stands for the whole value, so a split row is a token only when every side names the same one; a split row
// without its sides is never a chip, and neither are space-joined tokens.
function chipToken(token: string | undefined, split: boolean, sides: readonly InspectSide[] | undefined): string | undefined {
  if (token === undefined || token === "" || /\s/.test(token)) return undefined;
  if (!split) return token;
  return sides !== undefined && sides.length > 0 && sides.every(side => side.token === token) ? token : undefined;
}

const ZERO = /^0[a-z%]*$/i;

// Any other shorthand stays as the resolver wrote it.
function oneSide(sides: readonly InspectSide[] | undefined): string | undefined {
  if (sides === undefined || sides.length < 2) return undefined;
  const set = sides.filter(side => !ZERO.test(side.value));
  const first = set[0];
  return set.length === 1 && first ? `${capitalized(sideName(first.side))} ${first.value}` : undefined;
}

function uniform(sides: readonly InspectSide[]): boolean {
  return sides.every(side => side.value === sides[0]?.value && side.token === sides[0].token);
}

// A two-value shorthand pairs them: "Top and bottom 20px, left and right 24px"; anything else lists the sides in
// order.
function sideList(sides: readonly InspectSide[]): string {
  const part = (names: string, side: InspectSide) => `${names} ${side.value}${side.token === undefined ? "" : ` (${side.token})`}`;
  const same = (a: InspectSide | undefined, b: InspectSide | undefined) => a !== undefined && b !== undefined && a.value === b.value && a.token === b.token;
  const [a, b, c, d] = sides;
  const parts = sides.length === 4 && a && b && c && d && same(a, c) && same(b, d)
    ? [part(`${sideName(a.side)} and ${sideName(c.side)}`, a), part(pairName(b, d), b)]
    : sides.map(side => part(sideName(side.side), side));
  return capitalized(parts.join(", "));
}

// "left and right", not the resolver's right-before-left order.
function pairName(b: InspectSide, d: InspectSide): string {
  return b.side === "right" && d.side === "left" ? "left and right" : `${sideName(b.side)} and ${sideName(d.side)}`;
}

function sideName(side: string): string {
  return side.replace(/-/g, " ");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Anything other than hex or `transparent` gets no swatch, so a canvas string never reaches a style property
// unchecked.
function swatchColor(row: InspectRow): string | undefined {
  if (row.group !== "colors") return undefined;
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(row.value) || row.value === "transparent" ? row.value : undefined;
}

export interface InspectCanvas {
  root: string;
  path: string;
}

export interface InspectTarget {
  canvas: InspectCanvas;
  selector: string;
}

// `target` is null when nothing is asked, so any reply still on its way is dropped. `same`: a read of the selection
// already shown, whose rows stay until the reply.
export interface InspectFlight {
  seq: number;
  target: InspectTarget | null;
  same: boolean;
  notShown?: true;
}

export interface InspectRequestInput {
  // Open and not yielding to a narrow window.
  visible: boolean;
  // Never one only sent to the canvas.
  accepted: InspectTarget | null;
  flight: InspectFlight;
  // Found again after a reload, the same canvas id at a new path, or Retry.
  again: boolean;
}

export function inspectRequestFor({ visible, accepted, flight, again }: InspectRequestInput): { flight: InspectFlight; send: InspectFlight | null } {
  if (!visible || accepted === null) return { flight: flight.target === null ? flight : { seq: flight.seq, target: null, same: false }, send: null };
  if (!again && flight.target !== null && sameTarget(flight.target, accepted)) return { flight, send: null };
  // A same-canvas move keeps the anchor but not the path, so "same" is the caller's word plus the same anchor.
  const send: InspectFlight = { seq: flight.seq + 1, target: accepted, same: again && flight.target !== null && flight.target.selector === accepted.selector };
  if (flight.notShown && flight.target !== null && sameTarget(flight.target, accepted)) send.notShown = true;
  return { flight: send, send };
}

function sameTarget(a: InspectTarget, b: InspectTarget): boolean {
  return a.selector === b.selector && a.canvas.root === b.canvas.root && a.canvas.path === b.canvas.path;
}

export type InspectFailure = "not-shown" | "not-found" | "unavailable";

// A request main refuses outright gets a bare `{ok: false, reason: "unavailable"}` with no echo.
export type InspectReply = Partial<{ seq: number; canvas: InspectCanvas; selector: string }> & ({ ok: true; rows: InspectRow[] } | { ok: false; reason: InspectFailure });

export type InspectPanel =
  | { kind: "empty" }
  // Kept while the same selection is read again.
  | { kind: "reading"; rows: InspectRow[] | null }
  | { kind: "failed" }
  | { kind: "rows"; rows: InspectRow[] };

// null: a late reply or a bare refusal changes nothing. `again`: main answers not-shown until the canvas is its shown
// document again, so the caller asks once more on the next change; a second not-shown in a row is a failure.
export function acceptInspect(panel: InspectPanel, flight: InspectFlight, reply: InspectReply): { panel: InspectPanel; again: boolean; flight: InspectFlight } | null {
  if (flight.target === null || reply.seq !== flight.seq || reply.canvas === undefined || reply.selector === undefined || !sameTarget(flight.target, { canvas: reply.canvas, selector: reply.selector })) return null;
  const answered: InspectFlight = { seq: flight.seq, target: flight.target, same: flight.same };
  if (reply.ok) return { panel: { kind: "rows", rows: reply.rows }, again: false, flight: answered };
  switch (reply.reason) {
    // Retry cannot bring back a node CDP does not find, so it reads like a selection that left the canvas.
    case "not-found": return { panel: { kind: "empty" }, again: false, flight: answered };
    // Once without a failure, then a failure with Retry (see above).
    case "not-shown": return flight.notShown ? { panel: { kind: "failed" }, again: false, flight: answered } : { panel, again: true, flight: { ...answered, notShown: true } };
    case "unavailable": return { panel: { kind: "failed" }, again: false, flight: answered };
  }
}
