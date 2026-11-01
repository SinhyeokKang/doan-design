// Plain text to the clipboard from the renderer (buzz-project design §8). Main denies every permission check, so the
// async Clipboard API is always refused here, and main never writes a string the renderer names. The document's own
// copy command fires a copy event whose clipboard data takes the text; nothing takes focus or selection for it, so
// the field the person is in (an IME composition may be in it) is never blurred.
export function copyText(text: string): boolean {
  let written = false;
  const listener = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    written = true;
  };
  document.addEventListener("copy", listener, true);
  try {
    return document.execCommand("copy") && written;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", listener, true);
  }
}
