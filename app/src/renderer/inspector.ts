// Placeholder until main sends rows over `inspect:get` (values collected with
// CDP, 2026-10-22 after PoC 2); the shape follows design.md `inspectRows` and
// the confirmed draft `design/select-inspect.html`, and is replaced by main's
// row type when that lands.
export type InspectGroup = "Box" | "Typography" | "Colors" | "Effects";
export const INSPECT_GROUPS: readonly InspectGroup[] = ["Box", "Typography", "Colors", "Effects"];

export interface InspectRow {
  group: InspectGroup;
  label: string;
  value: string;
  state: "token" | "hardcoded" | "unknown" | "default";
  // The name written in the declaration; the alias chain only goes in the tooltip.
  token?: string;
  tokenChain?: string;
  inheritedFrom?: string;
  hoverState?: boolean;
}

export const INSPECTOR_PLACEHOLDER: readonly InspectRow[] = [];

export const UNKNOWN_SOURCE_TIP = "Set by a stylesheet doan can't read, such as a CDN";

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

// Colors arrive as hex (`#rrggbb`, `#rrggbbaa`) or `transparent` (2026-10-22
// draft decision). Anything else gets no swatch, so a canvas string never
// reaches a style property unchecked.
export function swatchColor(row: InspectRow): string | undefined {
  if (row.group !== "Colors") return undefined;
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(row.value) || row.value === "transparent" ? row.value : undefined;
}
