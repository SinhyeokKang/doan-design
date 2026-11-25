import { expect, test } from "vitest";
import type { PlayingCanvas } from "./conversationScope";
import { prototypeThumbnailRoot } from "./thumbnailScope";

const PLAYING: PlayingCanvas = { root: "/w/acme", canvas: { id: "checkout" }, path: ".doan/canvases/checkout.html" };

test("the prototype window may ask thumbnails of the playing root's canvases", () => {
  expect(prototypeThumbnailRoot("/w/acme", PLAYING)).toBe(true);
});

// Worktrees of one repository share canvas paths, so only the root itself counts (POSTMORTEM 2026-11-01).
test("a canvas in another root is refused, a worktree or a nested folder included", () => {
  for (const root of ["/w/other", "/w/acme-wt", "/w/acme/", "/w/acme/sub", "/w", "", "/W/acme"]) expect(prototypeThumbnailRoot(root, PLAYING), root).toBe(false);
});

test("nothing playing refuses every root", () => {
  expect(prototypeThumbnailRoot("/w/acme", null)).toBe(false);
});
