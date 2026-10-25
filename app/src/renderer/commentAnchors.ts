import type { Comment, Target } from "../formats/types";
import { matchTarget, type CanvasContext, type PinGeometry, type TargetLookup } from "../comments/projection";
import type { AnchorsMessage } from "./canvasMessage";

// `answered`: the current document's anchors. `pending`: a document of the
// bound canvas is loading and has not answered yet. `none`: no rendered
// document will answer (no width, load failed, unlisted page, another canvas).
export interface AnchorSnapshot {
  lookup: TargetLookup;
  rects: ReadonlyMap<string, PinGeometry>;
  selected: string | null;
  status: "answered" | "pending" | "none";
}
export interface CommentBinding { root: string; canvas: string; comments: readonly Comment[] }
export interface PinDestination { node: string; comments: readonly string[]; originalTarget: Target }
export interface CommentHooks {
  changed(snapshot: AnchorSnapshot): void;
  guard(destination: PinDestination): boolean | Promise<boolean>;
  open(destination: PinDestination): void;
  focusFallback(): void;
}

export function anchorSnapshot(comments: readonly Comment[], context: CanvasContext,
  message: Pick<AnchorsMessage, "results" | "rects" | "selected">): AnchorSnapshot {
  const results = new Map(message.results.map(item => [item.id, item.candidates]));
  const nodes = new Map<string, string>();
  for (const comment of comments) {
    const node = matchTarget(comment.target, results.get(comment.comment) ?? {});
    if (node !== null) nodes.set(comment.comment, node);
  }
  return { lookup: { ...context, nodes }, rects: new Map(message.rects.map(({ node, ...rect }) => [node, rect])), selected: message.selected, status: "answered" };
}

// What the panel shows next. While the same canvas reloads, its last answer
// stands until the new document answers, so badges and the Selection list do
// not blink empty (T-11); anything else replaces it at once.
export function shownAnchors(previous: AnchorSnapshot | null, next: AnchorSnapshot): AnchorSnapshot {
  const same = previous !== null && previous.lookup.root === next.lookup.root && previous.lookup.canvas === next.lookup.canvas;
  return next.status === "pending" && same && previous.status === "answered" ? previous : next;
}
