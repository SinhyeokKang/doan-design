import { canvasStem } from "../../renderer/canvasTree";
import type { Anchor, Canvas } from "./types";

// Shared by main and the renderer: imports nothing but types and pure helpers (messageText.ts says why).

export type CanvasLookup = { path: string } | "missing" | "duplicate";
export function canvasById(canvases: readonly Canvas[], id: string): CanvasLookup {
  let found: string | undefined;
  for (const canvas of canvases) {
    if (canvas.id !== id) continue;
    if (found !== undefined) return "duplicate";
    found = canvas.path;
  }
  return found === undefined ? "missing" : { path: found };
}

// A dropped chip's name stays in the text, where a brace pair would read as a marker that anchorTokens refuses.
function nameText(path: string): string { return canvasStem(path).replace(/([{}])(?=[{}])/g, "$1 "); }

// An anchor's path is the sender's and never trusted: each canvas anchor goes out with the one path the root lists for
// its id, else as its name in the text, with the remaining markers numbered again. A name can make the text longer
// than LIMITS.text, and the send is then refused as any over-long message is.
export function sendCanvasAnchors(text: string, anchors: readonly Anchor[], canvases: readonly Canvas[]): { text: string; anchors: Anchor[] } {
  if (!anchors.some(anchor => anchor.canvas)) return { text, anchors: [...anchors] };
  const kept: Anchor[] = [], marks: (number | string)[] = [];
  for (const anchor of anchors) {
    if (!anchor.canvas) { kept.push(anchor); marks.push(kept.length); continue; }
    const found = canvasById(canvases, anchor.canvas.id);
    if (typeof found !== "object") { marks.push(nameText(anchor.canvas.path)); continue; }
    kept.push({ canvas: { path: found.path, id: anchor.canvas.id } });
    marks.push(kept.length);
  }
  const out = text.replace(/\{\{([1-9][0-9]*)\}\}/g, (marker, n: string) => {
    const mark = marks[Number(n) - 1];
    return mark === undefined ? marker : typeof mark === "number" ? `{{${mark}}}` : mark;
  });
  return { text: out, anchors: kept };
}

// A missing or shared id is left as it is: send and press handle it.
export function refreshCanvasAnchor(anchor: Anchor, canvases: readonly Canvas[]): Anchor {
  if (!anchor.canvas) return anchor;
  const found = canvasById(canvases, anchor.canvas.id);
  return typeof found === "object" && found.path !== anchor.canvas.path ? { canvas: { path: found.path, id: anchor.canvas.id } } : anchor;
}
