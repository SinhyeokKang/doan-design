import type { KeyboardEvent } from "react";

// ←/→ walk the enabled buttons of a roving-tabindex row; Tab stops on the row once, so buttons added later keep the page's Tab order.
// Focus only moves (it never presses) and does not wrap at either end.
export function moveBetweenTools(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tools = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  // React also brings keys from a portal rendered under the row (the Play drawer's list): those are not the row's.
  const at = tools.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const next = tools[at + (event.key === "ArrowRight" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}
