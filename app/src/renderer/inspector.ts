import type { InspectGroup, InspectRow } from "../main/inspect";

// Section order and headings of the confirmed draft.
export const INSPECT_GROUPS: readonly (readonly [InspectGroup, string])[] = [["box", "Box"], ["typography", "Typography"], ["colors", "Colors"], ["effects", "Effects"]];

// With CDP collecting, Unknown means a CSS-wide keyword, a variable invalid at
// computed time or an unplaceable shorthand part, not an unreadable sheet
// (2026-10-22 decision).
export const UNKNOWN_SOURCE_TIP = "Doan can't tell where this value comes from";

export interface SourceNote {
  text: string;
  title: string;
  hardcoded: boolean;
}

// Every state but Default is visible text, not color alone (accessibility; e2e
// reads it by name). Default is a dim value titled "Default" with no notes.
export function sourceNotes(row: InspectRow): SourceNote[] {
  if (row.state === "default") return [];
  const notes: SourceNote[] = [];
  if (row.state === "hardcoded") notes.push({ text: "Hardcoded", title: "Hardcoded", hardcoded: true });
  if (row.state === "unknown") notes.push({ text: "Unknown source", title: UNKNOWN_SOURCE_TIP, hardcoded: false });
  if (row.inheritedFrom !== undefined) {
    const text = `Inherited from ${row.inheritedFrom}`;
    notes.push({ text, title: text, hardcoded: false });
  }
  if (row.hoverState) notes.push({ text: "Hover state", title: "Hover state", hardcoded: false });
  return notes;
}

// The chip keeps the declared name; an alias chain goes only in the tooltip.
export function tokenTitle(row: InspectRow): string {
  return row.chain === undefined ? row.token ?? "" : [...row.chain, row.value].join(" → ");
}

// Colors arrive as hex (`#rrggbb`, `#rrggbbaa`) or `transparent` (2026-10-22
// draft decision). Anything else gets no swatch, so a canvas string never
// reaches a style property unchecked.
export function swatchColor(row: InspectRow): string | undefined {
  if (row.group !== "colors") return undefined;
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(row.value) || row.value === "transparent" ? row.value : undefined;
}
