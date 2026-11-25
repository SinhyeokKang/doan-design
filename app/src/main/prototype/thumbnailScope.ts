import type { PlayingCanvas } from "./conversationScope";

// The prototype window's thread cards show thumbnails of the playing root's canvases only: main answers its requests,
// and sends it changes, for that root alone. The root is compared whole, since worktrees share canvas paths.
export function prototypeThumbnailRoot(root: string, playing: PlayingCanvas | null): boolean {
  return playing !== null && root === playing.root;
}
