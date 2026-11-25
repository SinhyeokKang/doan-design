// The app's own selection is not a condition: making one clears the canvas range, so the selection made last is the
// one copied. A handler that ran before (the composer's field, copyText) wins.
export function textCopy(input: { canvasText: string | null; defaultPrevented: boolean; onCanvasPage: boolean; overlayOpen: boolean }): string | null {
  if (input.defaultPrevented || !input.onCanvasPage || input.overlayOpen || !input.canvasText) return null;
  return input.canvasText;
}
