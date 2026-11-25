import { linkGroups } from "../main/prototype/links";
import { typeaheadNext } from "./canvasTree";

// `key` is the frame id unless the id repeats, so following the key follows the frame across a reload.
export interface DrawerListRow {
  key: string;
  name: string;
  current: boolean;
}

// Derived from the current rows every time. Null when no row is left: the list closes.
export function focusedRowAfter(rows: readonly DrawerListRow[], focusedKey: string | null): string | null {
  if (focusedKey !== null && rows.some(row => row.key === focusedKey)) return focusedKey;
  return (rows.find(row => row.current) ?? rows[0])?.key ?? null;
}

// As in the sidebar tree.
export function drawerKeyTarget(rows: readonly DrawerListRow[], focusedKey: string | null, key: string): string | null {
  if (rows.length === 0) return null;
  const index = Math.max(0, rows.findIndex(row => row.key === focusedKey));
  const next = key === "ArrowDown" ? Math.min(index + 1, rows.length - 1)
    : key === "ArrowUp" ? Math.max(index - 1, 0)
    : key === "Home" ? 0
    : key === "End" ? rows.length - 1 : null;
  return next === null ? null : rows[next]!.key;
}

// The caller keeps the 500 ms buffer.
export function drawerTypeahead(rows: readonly DrawerListRow[], focusedKey: string | null, buffer: string): string | null {
  const match = typeaheadNext(rows.map(row => row.name), rows.findIndex(row => row.key === focusedKey), buffer);
  return match === null ? null : rows[match]!.key;
}

// `mark` is its raw mark, which link grouping checks again.
export interface DrawerFrame {
  key: string;
  id: string;
  number: number;
  name: string;
  current: boolean;
  mark: string;
}

export interface DrawerRow extends DrawerListRow {
  id: string;
  number: number;
  group: number;
}

export interface DrawerGroup {
  label: string;
  rows: DrawerRow[];
}

export const UNLINKED_GROUP = "Frames without links";

// Linked groups first, in the document order of their first frames, then every frame without links together.
export function groupDrawer(frames: readonly DrawerFrame[], gotos: readonly { value: string; frames: readonly string[] }[]): DrawerGroup[] {
  const byId = new Map(frames.map(frame => [frame.id, frame]));
  const linked = linkGroups(frames.map(frame => ({ id: frame.id, prototype: frame.mark })), gotos).filter(group => group.length > 1);
  const grouped = new Set(linked.flat());
  const sets = linked.map(group => group.map(id => byId.get(id)!));
  const alone = frames.filter(frame => !grouped.has(frame.id));
  if (alone.length > 0) sets.push(alone);
  return sets.map((members, group) => ({
    label: group < linked.length ? `${members[0]!.name} and ${members.length - 1} more` : UNLINKED_GROUP,
    rows: members.map(({ key, id, number, name, current }) => ({ key, id, number, name, current, group })),
  }));
}

// Arrows, Home/End and typeahead follow this order across groups.
export function drawerOrder(groups: readonly DrawerGroup[]): DrawerRow[] {
  return groups.flatMap(group => group.rows);
}

export interface Typed { text: string; at: number }

function listTakesKey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}
export interface DrawerKey { prevent: boolean; pick?: string; move?: string; typed: Typed }

// Even a key the typeahead cannot match, so the canvas tools' V and H never fire while the list is open. Esc is
// Radix's.
export function drawerKey(rows: readonly DrawerListRow[], focusedKey: string | null, event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, typed: Typed, now: number): DrawerKey {
  const { key } = event;
  if (key === "Tab") return { prevent: true, typed };
  if (key === "Enter" || key === " ") {
    const row = rows.find(candidate => candidate.key === focusedKey);
    return row ? { prevent: true, pick: row.key, typed } : { prevent: false, typed };
  }
  const target = drawerKeyTarget(rows, focusedKey, key);
  if (target !== null) return { prevent: true, move: target, typed };
  if (!listTakesKey(event)) return { prevent: false, typed };
  const next = { text: (now - typed.at < 500 ? typed.text : "") + key.toLowerCase(), at: now };
  const match = drawerTypeahead(rows, focusedKey, next.text);
  return match === null ? { prevent: true, typed: next } : { prevent: true, move: match, typed: next };
}
