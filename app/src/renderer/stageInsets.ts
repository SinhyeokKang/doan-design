// Vertical insets that centre a stage's group in its reference area with an optical lift (doan-mascot design '배치').
// The lift has no upper limit, so a tall window keeps the group centred instead of pinning it to a fixed top. On a
// short window the lift gives way first; once only the `min` insets are left the content scrolls, never more.
export function stageInsets({ available, group, offset, min }: { available: number; group: number; offset: number; min: number }): { top: number; bottom: number } {
  const slack = available - group - 2 * min;
  if (slack <= 0) return { top: min, bottom: min };
  const lift = Math.min(offset, slack / 2);
  return { top: min + slack / 2 - lift, bottom: min + slack / 2 + lift };
}
