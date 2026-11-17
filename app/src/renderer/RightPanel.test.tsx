import { expect, test } from "vitest";

// Dogfooding: with a conversation title the canvas panel's head was 48 high beside the 56px canvas header.
test("the canvas conversation panel's head is as tall as the canvas header", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-conv-head \{[^}]*min-height: var\(--size-chrome\);/);
  // The canvas header is an `.ov-head`, which sets the same height.
  expect(css).toMatch(/\.ov-head \{[^}]*min-height: var\(--size-chrome\);/);
});
