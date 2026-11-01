import { typeaheadNext } from "./canvasTree";

// The part of a FrameDrawerRow the open list moves focus by. `key` is the frame id unless the id repeats
// (frameDrawer.ts rowKeys), so following the key follows the frame across a reload.
export interface DrawerListRow {
  key: string;
  name: string;
  current: boolean;
}

// The row to keep focused after the rows changed: the same frame while it is listed (even when the viewed frame
// moved on), else the viewed row, else the first. Null when no row is left: the list closes.
// Derived from the current rows every time (POSTMORTEM 'Home card roving tabindex').
export function focusedRowAfter(rows: readonly DrawerListRow[], focusedKey: string | null): string | null {
  if (focusedKey !== null && rows.some(row => row.key === focusedKey)) return focusedKey;
  return (rows.find(row => row.current) ?? rows[0])?.key ?? null;
}

// Arrow keys stop at the ends, as in the sidebar tree.
export function drawerKeyTarget(rows: readonly DrawerListRow[], focusedKey: string | null, key: string): string | null {
  if (rows.length === 0) return null;
  const index = Math.max(0, rows.findIndex(row => row.key === focusedKey));
  const next = key === "ArrowDown" ? Math.min(index + 1, rows.length - 1)
    : key === "ArrowUp" ? Math.max(index - 1, 0)
    : key === "Home" ? 0
    : key === "End" ? rows.length - 1 : null;
  return next === null ? null : rows[next]!.key;
}

// The sidebar tree's typeahead over frame names; the caller keeps the 500 ms buffer.
export function drawerTypeahead(rows: readonly DrawerListRow[], focusedKey: string | null, buffer: string): string | null {
  const match = typeaheadNext(rows.map(row => row.name), rows.findIndex(row => row.key === focusedKey), buffer);
  return match === null ? null : rows[match]!.key;
}
