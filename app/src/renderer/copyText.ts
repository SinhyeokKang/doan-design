// Main denies every permission check, so the async Clipboard API is refused here. The document's copy command takes no
// focus or selection, so the field the person is in (an IME composition may be in it) is never blurred.
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
