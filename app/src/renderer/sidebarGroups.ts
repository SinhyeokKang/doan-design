import type { CanvasRow } from "../main/view";
import { canvasDir, type CanvasKind } from "../formats/canvasPath";

// The sidebar's two groups under an expanded project (design-system-canvases design 'sidebar'): the directory a
// canvas sits in picks its group. Ids are fixed so a saved closed state survives a label or order change.
export type GroupId = CanvasKind;
export type ClosedGroups = Partial<Record<GroupId, false>>;

export interface SidebarGroup {
  id: GroupId;
  label: string;
  empty: string;
  open: boolean;
  rows: CanvasRow[];
}

// Design system first: it is short and rarely changes, so many canvases never push it down.
const GROUPS: readonly { id: GroupId; label: string; empty: string }[] = [
  { id: "ds", label: "Design system", empty: "No design system yet" },
  { id: "canvases", label: "Canvases", empty: "No canvases yet" },
];

// Rows keep the order they are given in; a missing closed flag is open.
export function sidebarGroups(rows: readonly CanvasRow[], closed?: ClosedGroups): SidebarGroup[] {
  return GROUPS.map(group => ({ ...group, open: closed?.[group.id] !== false, rows: rows.filter(row => (canvasDir(row.path) === "ds" ? "ds" : "canvases") === group.id) }));
}

export type SidebarItem = { kind: "head"; group: SidebarGroup } | { kind: "canvas"; group: SidebarGroup; row: CanvasRow };

// The rows on screen: every head, and the rows of open groups. Keyboard movement and the status slot's `shown` both
// read this, so a row in a closed group is off screen for both.
export function visibleItems(groups: readonly SidebarGroup[]): SidebarItem[] {
  return groups.flatMap(group => [{ kind: "head", group } as SidebarItem, ...(group.open ? group.rows.map(row => ({ kind: "canvas", group, row }) as SidebarItem) : [])]);
}

// ←/→ on a group head, as the APG tree pattern: → opens, then enters; ← closes, then leaves. An open empty group has
// nothing to enter.
export function headArrow(group: SidebarGroup, key: "ArrowLeft" | "ArrowRight"): "toggle" | "firstRow" | "project" | null {
  if (key === "ArrowRight") return !group.open ? "toggle" : group.rows.length ? "firstRow" : null;
  return group.open ? "toggle" : "project";
}

export interface ShownCanvas { root: string; path: string }

// The group to open when the shown canvas changes: another canvas, another worktree, or the same id moved to the other
// directory. Nothing while the same canvas stays shown, so a group the person closed stays closed.
export function groupToOpen(previous: ShownCanvas | null, next: ShownCanvas | null): GroupId | null {
  if (!next || (previous?.root === next.root && previous.path === next.path)) return null;
  return canvasDir(next.path) === "ds" ? "ds" : "canvases";
}

// Only closed groups are stored, and no field at all when every group is open.
export function openGroup(closed: ClosedGroups | undefined, id: GroupId): ClosedGroups | undefined {
  const { [id]: _, ...rest } = closed ?? {};
  return Object.keys(rest).length ? rest : undefined;
}

export function toggleGroup(closed: ClosedGroups | undefined, id: GroupId): ClosedGroups | undefined {
  return closed?.[id] === false ? openGroup(closed, id) : { ...closed, [id]: false };
}

export function countDescription(count: number): string {
  return `${count} ${count === 1 ? "canvas" : "canvases"}`;
}
