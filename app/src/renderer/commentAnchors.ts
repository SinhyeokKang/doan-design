import type { Comment, Target } from "../formats/types";
import { matchTarget, type CanvasContext, type PinGeometry, type TargetLookup } from "../comments/projection";
import type { AnchorsMessage } from "./canvasMessage";

export interface AnchorSnapshot {
  lookup: TargetLookup;
  rects: ReadonlyMap<string, PinGeometry>;
  selected: string | null;
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
  return { lookup: { ...context, nodes }, rects: new Map(message.rects.map(({ node, ...rect }) => [node, rect])), selected: message.selected };
}
