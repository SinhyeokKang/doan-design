// The canvas header's Show buttons for folded right panels, after Reload. Pure; CanvasHeader draws them.

export const NO_ROOM_FOR_INSPECTOR = "No room for the inspector. Widen the window, or narrow or hide the conversation.";

export interface HeaderShowButton {
  target: "inspector" | "conversation";
  // Set when the button cannot open its panel; the reason is its tooltip and description.
  disabled?: string;
}

export function inspectorShowButton({ inspectorOpen, inspectorFits }: { inspectorOpen: boolean; inspectorFits: boolean }): HeaderShowButton | null {
  if (!inspectorFits) return { target: "inspector", disabled: NO_ROOM_FOR_INSPECTOR };
  return inspectorOpen ? null : { target: "inspector" };
}

// `separator`: the one divider after Reload, drawn only with a button after it. An inspector saved open but yielding
// to a narrow window is not shown, so its Show button stays, unavailable, to say why.
export function headerShowButtons({ inspectorOpen, conversationOpen, inspectorFits }: { inspectorOpen: boolean; conversationOpen: boolean; inspectorFits: boolean }): { separator: boolean; buttons: HeaderShowButton[] } {
  const buttons: HeaderShowButton[] = [];
  const show = inspectorShowButton({ inspectorOpen, inspectorFits });
  if (show) buttons.push(show);
  if (!conversationOpen) buttons.push({ target: "conversation" });
  return { separator: buttons.length > 0, buttons };
}
