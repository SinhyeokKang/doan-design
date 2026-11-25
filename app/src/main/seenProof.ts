import type { LoadedDocument } from "./document/bindings";

// The proof comes from the main window's own document bindings, never the renderer's say, so a thumbnail or prototype
// never counts. While a reload swaps the iframe two frames can match: nothing is proven until the next bindings change.
export function shownDocument(
  frames: readonly { id: string; parentId: string; url: string }[],
  current: (frame: string, url: string) => LoadedDocument | null,
  mainFrame: string,
  target: { url: string; root: string; path: string },
): LoadedDocument | null {
  const matching = frames.filter(frame => frame.parentId === mainFrame && frame.url === target.url);
  if (matching.length !== 1) return null;
  const shown = current(matching[0]!.id, target.url);
  return shown && shown.root === target.root && shown.path === target.path ? shown : null;
}
