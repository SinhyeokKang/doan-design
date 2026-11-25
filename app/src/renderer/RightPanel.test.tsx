import { expect, test } from "vitest";

// The canvas panel's head matches the 56px canvas header even with a conversation title.
test("the canvas conversation panel's head is as tall as the canvas header", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-conv-head \{[^}]*min-height: var\(--size-chrome\);/);
  // The canvas header is an `.ov-head`, which sets the same height.
  expect(css).toMatch(/\.ov-head \{[^}]*min-height: var\(--size-chrome\);/);
});
