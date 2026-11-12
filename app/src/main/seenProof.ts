import type { LoadedDocument } from "./document/bindings";

// Whether the canvas page shows this listed canvas, and which bytes: the proof a read-state record needs. The renderer
// only says which canvas the page is meant to show; what it shows comes from the main window's own document bindings
// (the bytes the server sent, a finished loader of the current generation), so a thumbnail (another window) or a
// prototype never counts, and a screen showing A while the disk holds B records A and leaves B unseen.
//
// The canvas iframe is a direct child of the main window's main frame whose URL is the row's URL. While a reload swaps
// the iframe two frames can match until the old one detaches: then nothing is proven yet, and the next bindings change
// decides again.
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
