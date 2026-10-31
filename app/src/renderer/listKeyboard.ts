// Roving focus for a list with one Tab stop (buzz-project design §2.3). Rows that cannot be opened are still keys:
// they take focus so their reason can be read.

export type ListKey = "ArrowUp" | "ArrowDown" | "Home" | "End";

// The row a key moves focus to, stopping at the ends; null for any other key or an empty list. A focused key no longer
// listed starts from the first row.
export function listKeyTarget(keys: readonly string[], focused: string | null, key: string): string | null {
  if (keys.length === 0) return null;
  const at = focused === null ? -1 : keys.indexOf(focused);
  switch (key) {
    case "Home": return keys[0]!;
    case "End": return keys.at(-1)!;
    case "ArrowDown": return at === -1 ? keys[0]! : keys[Math.min(at + 1, keys.length - 1)]!;
    case "ArrowUp": return at === -1 ? keys[0]! : keys[Math.max(at - 1, 0)]!;
    default: return null;
  }
}

// Where focus goes after a list change: the focused row while listed, else the next row of the previous order still
// listed, else the nearest one before it, else the panel title.
export function focusAfterLeave(previous: readonly string[], current: readonly string[], focused: string): { kind: "row"; key: string } | { kind: "title" } {
  if (current.includes(focused)) return { kind: "row", key: focused };
  const listed = new Set(current), at = previous.indexOf(focused);
  const next = at === -1 ? undefined : previous.slice(at + 1).find(key => listed.has(key)) ?? previous.slice(0, at).reverse().find(key => listed.has(key));
  return next === undefined ? { kind: "title" } : { kind: "row", key: next };
}
