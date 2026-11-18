// The canvas header's Show buttons for folded right panels, after Reload. Pure; CanvasHeader draws them.

export const NO_ROOM_FOR_INSPECTOR = "No room for the inspector. Widen the window or hide the conversation.";

export interface HeaderShowButton {
  target: "inspector" | "conversation";
  // Set when the button cannot open its panel; the reason is its tooltip and description.
  disabled?: string;
}

// `separator`: the one divider after Reload, drawn only with a button after it.
export function headerShowButtons(input: { inspectorOpen: boolean; conversationOpen: boolean; inspectorFits: boolean }): { separator: boolean; buttons: HeaderShowButton[] } {
  void input;
  return { separator: true, buttons: [] };
}
