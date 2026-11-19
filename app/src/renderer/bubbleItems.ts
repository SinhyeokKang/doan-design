import { inspectorShowButton } from "./headerShowButtons";

export type BubbleAction = "play" | "add" | "inspect";
export type BubbleItem = { kind: "play" | "size" | "add" } | { kind: "inspect"; disabled?: string };

export function bubbleItems(state: { play: boolean; inspectorOpen: boolean; inspectorFits: boolean }): BubbleItem[] {
  const items: BubbleItem[] = [];
  if (state.play) items.push({ kind: "play" });
  items.push({ kind: "size" }, { kind: "add" });
  const show = inspectorShowButton(state);
  if (show) items.push({ kind: "inspect", ...(show.disabled && { disabled: show.disabled }) });
  return items;
}

export function bubbleAction(target: EventTarget | null): BubbleAction | null {
  if (!target || !("closest" in target) || typeof target.closest !== "function") return null;
  const action = (target as Element).closest("[data-bubble-action]")?.getAttribute("data-bubble-action");
  return action === "play" || action === "add" || action === "inspect" ? action : null;
}
