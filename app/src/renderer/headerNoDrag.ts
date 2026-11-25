import { useEffect, useRef, type RefObject } from "react";

// The drag region swallows presses, so Radix could not close a popover on one; a count lets only the last popover
// closing drag again. Inline: Electron 45 kept the drag region when the change came from a .top:has() rule.
const holders = new WeakMap<HTMLElement, Set<object>>();

// Holding again while it already holds counts once. The returned release is safe to call more than once.
export function holdHeaderNoDrag(bar: HTMLElement, owner: object): () => void {
  let open = holders.get(bar);
  if (open === undefined) { open = new Set(); holders.set(bar, open); }
  open.add(owner);
  bar.style.setProperty("-webkit-app-region", "no-drag");
  return () => {
    const held = holders.get(bar);
    if (held === undefined || !held.delete(owner) || held.size > 0) return;
    holders.delete(bar);
    bar.style.removeProperty("-webkit-app-region");
  };
}

// An unmount while open releases it like a close.
export function useHeaderNoDrag(open: boolean, button: RefObject<HTMLElement | null>) {
  const owner = useRef({}).current;
  useEffect(() => {
    const bar = button.current?.closest("header");
    if (!open || !bar) return;
    return holdHeaderNoDrag(bar, owner);
  }, [open, button, owner]);
}
