// A row without Send now falls to its Remove. A message Send now has in flight is no row: it shows in the thread.
export type QueueFocus = { kind: "sendNow" | "remove"; itemId: string } | { kind: "input" };

export function queueFocusAfter(items: readonly { itemId: string; sendNow: boolean }[], index: number): QueueFocus {
  const next = index >= 0 ? items[index + 1] : undefined;
  if (!next) return { kind: "input" };
  return { kind: next.sendNow ? "sendNow" : "remove", itemId: next.itemId };
}
