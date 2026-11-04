// Where focus goes when a queue row leaves (Send now accepted, or Remove): the next row's Send now, else its Remove,
// else the input (queue-send-now spec decision 11). A row without Send now (unsupported provider, wrong phase) falls to
// its Remove. Pure so the rule is tested without a DOM; the host applies it.
// sendNow: this row renders a Send now button, including its in-flight `Sending` state (focusable, aria-disabled). The
// host computes it as sendNowShown({ ...row, sending: false }), not with the row's real sending flag.
export type QueueFocus = { kind: "sendNow" | "remove"; itemId: string } | { kind: "input" };

export function queueFocusAfter(items: readonly { itemId: string; sendNow: boolean }[], index: number): QueueFocus {
  const next = index >= 0 ? items[index + 1] : undefined;
  if (!next) return { kind: "input" };
  return { kind: next.sendNow ? "sendNow" : "remove", itemId: next.itemId };
}
