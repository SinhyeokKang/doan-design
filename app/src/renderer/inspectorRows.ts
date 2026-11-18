import type { InspectGroup, InspectRow } from "../main/inspect";

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

export function rowKey(row: Pick<InspectRow, "group" | "label">): string {
  void row;
  return "";
}

export function rowCopyText(row: InspectRow): string {
  void row;
  return "";
}

export function rowDisplay(rows: readonly InspectRow[]): RowsView {
  void rows;
  return { groups: [] };
}

// The row's tooltip lines; a cut name or value puts its full text first (the app's NameTip rule). `cut` is measured
// after drawing, so it is the caller's.
export function rowTooltip(row: RowView, cut: boolean): string[] {
  void cut;
  return row.tip;
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
export function inspectRequestFor(input: InspectRequestInput): { flight: InspectFlight; send: InspectFlight | null } {
  return { flight: input.flight, send: null };
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
  void panel;
  void flight;
  void reply;
  return { panel: { kind: "failed" }, again: false };
}
