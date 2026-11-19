// Match the menu and row padding (--space-1 + --space-3 = 16px) and the icon and gap per level
// (--size-icon + --space-2 = 24px). An overlong name keeps its icon visible and scrolls for the rest.
export function treeScrollLeft(depth: number, viewport: { width: number; nameWidth: number }, current: number): number {
  const indent = depth * 24;
  const iconStart = 16 + indent;
  const nameEnd = iconStart + 24 + viewport.nameWidth;
  if (current <= iconStart && nameEnd <= current + viewport.width) return current;
  return Math.max(0, Math.min(indent, Math.max(current, nameEnd + 16 - viewport.width)));
}
