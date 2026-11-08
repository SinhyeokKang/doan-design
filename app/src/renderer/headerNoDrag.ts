import { useEffect, useRef, type RefObject } from "react";

// The header is a window drag region, whose presses never reach the page, so Radix could not close a popover on a
// press in its empty part. While a popover under it is open the header takes presses; with none open it drags again.
// Agent usage and Restart to Update can both be open under one header, so the header counts its open popovers and
// only the last one closing lets it drag. Set inline because Electron kept the draggable region when the same change
// came from a .top:has() rule (computed style changed, native presses still dragged; observed 2026-11-06, Electron 45).
const holders = new WeakMap<HTMLElement, Set<object>>();

// `owner` is the popover: holding again while it already holds counts once. The returned release is safe to call
// more than once.
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

// Holds the header around `button` while `open`; an unmount while open releases it like a close.
export function useHeaderNoDrag(open: boolean, button: RefObject<HTMLElement | null>) {
  const owner = useRef({}).current;
  useEffect(() => {
    const bar = button.current?.closest("header");
    if (!open || !bar) return;
    return holdHeaderNoDrag(bar, owner);
  }, [open, button, owner]);
}
