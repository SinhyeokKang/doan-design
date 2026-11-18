import type { InspectGroup, InspectRow, InspectSide } from "../main/inspect";

// What the inspector panel shows for the resolver's rows, and which `inspect:get` request and reply it acts on.
// Pure: the panel and the canvas page hold the state and pass it in.

export const NO_STYLES = "The canvas sets no styles here.";

// One row as the panel shows it. `token` is set when the row shows a token chip (then the value is only in the
// tooltip); otherwise `text` is shown as is. `swatch` is a color row's swatch, inside the chip when there is one.
export interface RowView {
  key: string;
  label: string;
  text: string;
  token?: string;
  swatch?: string;
  // The tooltip's lines below a cut name or value: the computed value of a token row, the alias chain, each side's
  // value, where it is inherited from.
  tip: string[];
  copy: string;
  // The row's accessible name: what it shows, read in order.
  spoken: string;
}

export interface GroupView {
  group: InspectGroup;
  title: string;
  rows: RowView[];
}

// `empty` is the panel's line when the canvas sets none of the listed properties.
export interface RowsView {
  groups: GroupView[];
  empty?: string;
}

// The order a person asks about: groups, then the rows inside each. A row the list does not name follows in the
// resolver's order.
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

// What the row shows is what it copies: the token name, else the value as shown.
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

// The row's tooltip lines; a cut name or value puts its full text first (the app's NameTip rule). `cut` is measured
// after drawing, so it is the caller's.
export function rowTooltip(row: RowView, cut: boolean): string[] {
  return cut ? [row.token ?? row.text, ...row.tip] : row.tip;
}

// The rows main splits by side or corner; `sides` is read on these only.
const SPLIT_ROWS = new Set(["box:padding", "box:margin", "radius:radius"]);

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

// A chip stands for the whole value, so a split row is a token only when every side names the same one: a chip on a
// partly tokenized padding would give a wrong answer to "what is the padding?". A split row without its sides cannot
// show that, so it is never a chip. Space-joined tokens are never one token either.
function chipToken(token: string | undefined, split: boolean, sides: readonly InspectSide[] | undefined): string | undefined {
  if (token === undefined || token === "" || /\s/.test(token)) return undefined;
  if (!split) return token;
  return sides !== undefined && sides.length > 0 && sides.every(side => side.token === token) ? token : undefined;
}

const ZERO = /^0[a-z%]*$/i;

// A split value set on one side only reads by that side ("Top 8px"); any other shorthand stays as the resolver wrote it.
function oneSide(sides: readonly InspectSide[] | undefined): string | undefined {
  if (sides === undefined || sides.length < 2) return undefined;
  const set = sides.filter(side => !ZERO.test(side.value));
  const first = set[0];
  return set.length === 1 && first ? `${capitalized(sideName(first.side))} ${first.value}` : undefined;
}

function uniform(sides: readonly InspectSide[]): boolean {
  return sides.every(side => side.value === sides[0]?.value && side.token === sides[0].token);
}

// Each side's value, a side's token in parentheses. A two-value shorthand (opposite sides equal) pairs them as the
// draft words it: "Top and bottom 20px, left and right 24px"; anything else lists the sides in order.
function sideList(sides: readonly InspectSide[]): string {
  const part = (names: string, side: InspectSide) => `${names} ${side.value}${side.token === undefined ? "" : ` (${side.token})`}`;
  const same = (a: InspectSide | undefined, b: InspectSide | undefined) => a !== undefined && b !== undefined && a.value === b.value && a.token === b.token;
  const [a, b, c, d] = sides;
  const parts = sides.length === 4 && a && b && c && d && same(a, c) && same(b, d)
    ? [part(`${sideName(a.side)} and ${sideName(c.side)}`, a), part(pairName(b, d), b)]
    : sides.map(side => part(sideName(side.side), side));
  return capitalized(parts.join(", "));
}

// The draft names the horizontal pair "left and right", not in the resolver's right-before-left order.
function pairName(b: InspectSide, d: InspectSide): string {
  return b.side === "right" && d.side === "left" ? "left and right" : `${sideName(b.side)} and ${sideName(d.side)}`;
}

function sideName(side: string): string {
  return side.replace(/-/g, " ");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Colors arrive as hex or `transparent`; anything else gets no swatch, so a canvas string never reaches a style
// property unchecked.
function swatchColor(row: InspectRow): string | undefined {
  if (row.group !== "colors") return undefined;
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(row.value) || row.value === "transparent" ? row.value : undefined;
}

export interface InspectCanvas {
  root: string;
  path: string;
}

// An accepted selection: the anchor main's collector looks up in the shown canvas.
export interface InspectTarget {
  canvas: InspectCanvas;
  selector: string;
}

// The request in flight or last answered. `seq` only grows; `target` is null when nothing is asked (hidden, no
// selection), so any reply still on its way is dropped. `same`: a read of the selection already shown, whose rows stay
// until the reply. `notShown`: the last reply for this target was not-shown, carried to the one re-ask with `again`.
export interface InspectFlight {
  seq: number;
  target: InspectTarget | null;
  same: boolean;
  notShown?: true;
}

export interface InspectRequestInput {
  // Open and not yielding to a narrow window.
  visible: boolean;
  // The selection the canvas page applied, never one only sent to the canvas.
  accepted: InspectTarget | null;
  flight: InspectFlight;
  // The same selection asked again: found again after a reload, the same canvas id at a new path, or Retry.
  again: boolean;
}

// `send` is the request to make now, if any; `flight` replaces the caller's.
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

// Main's answer beside the request it echoes (`{selector, canvas, seq}`). A request main refuses outright gets a bare
// `{ok: false, reason: "unavailable"}` with no echo.
export type InspectReply = Partial<{ seq: number; canvas: InspectCanvas; selector: string }> & ({ ok: true; rows: InspectRow[] } | { ok: false; reason: InspectFailure });

export type InspectPanel =
  | { kind: "empty" }
  // `rows`: the previous rows, kept while the same selection is read again.
  | { kind: "reading"; rows: InspectRow[] | null }
  | { kind: "failed" }
  | { kind: "rows"; rows: InspectRow[] };

// null: a late reply (an older seq, another selection or another canvas), or a bare refusal that echoes no request,
// changes nothing. `flight` replaces the caller's.
// `again` (after a not-shown): ask once more without showing a failure, but not from this reply. Main answers
// not-shown until the requested canvas is its shown document again (a switch or reload in progress, or a debugger
// that detached), so asking straight back would loop. The caller asks on the next accepted-selection apply or
// shown-document change; a second not-shown in a row for the same selection and canvas is a failure with Retry.
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
