// Keep the normal 16px inset (menu padding + row padding) on either side. If the name alone exceeds the menu,
// its icon and beginning take priority; the rest can be reached by scrolling.
export function treeScrollLeft(depth: number, viewport: { width: number; nameWidth: number }, current: number): number {
  const indent = depth * 24;
  const iconStart = 16 + indent;
  const nameEnd = iconStart + 24 + viewport.nameWidth;
  if (current <= iconStart && nameEnd <= current + viewport.width) return current;
  return Math.max(0, Math.min(indent, Math.max(current, nameEnd + 16 - viewport.width)));
}
