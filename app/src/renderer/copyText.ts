// Plain text to the clipboard from the renderer (buzz-project design §8). Main denies every permission check, so the
// async Clipboard API is always refused here, and main never writes a string the renderer names; the document's own
// copy command needs neither. The copy selects a hidden field, so the field that had focus (the composer may hold an
// IME composition) gets its focus and selection back without scrolling.
export function copyText(text: string): boolean {
  const previous = document.activeElement;
  const field = previous instanceof HTMLTextAreaElement || previous instanceof HTMLInputElement ? previous : null;
  const range = field ? [field.selectionStart, field.selectionEnd] as const : null;
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.setAttribute("aria-hidden", "true");
  Object.assign(helper.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(helper);
  let copied = false;
  try {
    helper.focus({ preventScroll: true });
    helper.select();
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    helper.remove();
    if (previous && "focus" in previous && (previous as HTMLElement).isConnected) {
      (previous as HTMLElement).focus({ preventScroll: true });
      if (field && range && range[0] !== null && range[1] !== null) field.setSelectionRange(range[0], range[1]);
    }
  }
  return copied;
}
