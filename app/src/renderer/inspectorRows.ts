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

function rowView(row: InspectRow): RowView {
  const token = chipToken(row);
  const text = oneSide(row.sides) ?? row.value;
  const swatch = swatchColor(row);
  const tip = [
    token === undefined ? "" : row.value,
    row.chain ? row.chain.join(" → ") : "",
    row.sides && !uniform(row.sides) ? sideList(row.sides) : "",
    row.inheritedFrom === undefined ? "" : `Inherited from ${row.inheritedFrom}`,
  ].filter(line => line !== "");
  const view: RowView = { key: rowKey(row), label: row.label, text, tip, copy: token ?? text, spoken: [row.label, token === undefined ? text : row.value, token === undefined ? "" : `token ${token}`].filter(part => part !== "").join(", ") };
  if (token !== undefined) view.token = token;
  if (swatch !== undefined) view.swatch = swatch;
  return view;
}

// A chip stands for the whole value, so a split row is a token only when every side names the same one: a chip on a
// partly tokenized padding would give a wrong answer to "what is the padding?". The resolver joins different tokens
// with spaces, which is never one token either.
function chipToken(row: InspectRow): string | undefined {
  const { token, sides } = row;
  if (token === undefined || token === "" || /\s/.test(token)) return undefined;
  return sides === undefined || sides.every(side => side.token === token) ? token : undefined;
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

function sideList(sides: readonly InspectSide[]): string {
  const parts = sides.map(side => `${sideName(side.side)} ${side.value}${side.token === undefined ? "" : ` (${side.token})`}`);
  return capitalized(parts.join(", "));
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
// until the reply.
export interface InspectFlight {
  seq: number;
  target: InspectTarget | null;
  same: boolean;
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
  const send = { seq: flight.seq + 1, target: accepted, same: again && flight.target !== null && flight.target.selector === accepted.selector };
  return { flight: send, send };
}

function sameTarget(a: InspectTarget, b: InspectTarget): boolean {
  return a.selector === b.selector && a.canvas.root === b.canvas.root && a.canvas.path === b.canvas.path;
}

export type InspectFailure = "not-shown" | "not-found" | "unavailable";

// What the request asked, and main's answer to it.
export interface InspectReply {
  seq: number;
  canvas: InspectCanvas;
  selector: string;
  result: { ok: true; rows: InspectRow[] } | { ok: false; reason: InspectFailure };
}

export type InspectPanel =
  | { kind: "empty" }
  // `rows`: the previous rows, kept while the same selection is read again.
  | { kind: "reading"; rows: InspectRow[] | null }
  | { kind: "failed" }
  | { kind: "rows"; rows: InspectRow[] };

// null: a late reply (an older seq, another selection or another canvas) that changes nothing. `again`: ask once
// more without showing a failure.
export function acceptInspect(panel: InspectPanel, flight: InspectFlight, reply: InspectReply): { panel: InspectPanel; again: boolean } | null {
  if (flight.target === null || reply.seq !== flight.seq || !sameTarget(flight.target, reply)) return null;
  if (reply.result.ok) return { panel: { kind: "rows", rows: reply.result.rows }, again: false };
  switch (reply.result.reason) {
    // Retry cannot bring back a node CDP does not find, so it reads like a selection that left the canvas.
    case "not-found": return { panel: { kind: "empty" }, again: false };
    // Main's shown document is not yet the requested canvas (a switch in progress): no failure, ask again.
    case "not-shown": return { panel, again: true };
    case "unavailable": return { panel: { kind: "failed" }, again: false };
  }
}
