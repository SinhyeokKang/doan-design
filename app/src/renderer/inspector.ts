// Placeholder until main collects inspector values with CDP (2026-10-22, after
// PoC 2); the row shape follows design.md `inspectRows` and is replaced by
// main's row type when that lands.
export interface InspectRow {
  property: string;
  value: string;
  state: "token" | "hardcoded" | "unknown" | "default";
  token?: string;
  inheritedFrom?: string;
  hoverState?: boolean;
}

export const INSPECTOR_PLACEHOLDER: readonly InspectRow[] = [];

// The state is text as well as color (accessibility; e2e reads it by name).
export function inspectorStateText(row: InspectRow): string {
  const parts = [row.state === "token" ? row.token ?? "Token" : row.state === "hardcoded" ? "Hardcoded" : row.state === "unknown" ? "Unknown source" : "Default"];
  if (row.inheritedFrom !== undefined) parts.push(`Inherited from ${row.inheritedFrom}`);
  if (row.hoverState) parts.push("Hover state");
  return parts.join(" · ");
}
