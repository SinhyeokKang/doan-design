import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("the panel header paints its fade behind the controls and turns opaque in either accessibility mode", () => {
  expect(css).toMatch(/\.panel-fade-head::before\s*\{[^}]*z-index: -1;[^}]*pointer-events: none;[^}]*linear-gradient\(\s*to bottom,\s*color-mix\(in srgb, var\(--surface-panel\) 90%, transparent\) 0 calc\(100% - var\(--space-4\)\),\s*transparent 100%\s*\)/);
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(forced-colors: active\)\s*\{\s*\.panel-fade-head::before \{ background: var\(--surface-panel\); \}/);
});

test("the Conversations heading stays at the top of its existing scroller", () => {
  expect(css).toContain(".ov-right.doan-scroll > .panel-fade-head { position: sticky; inset-block-start: 0; }");
});

test("the three body scrollers reserve the chrome height for scroll-to-item and keyboard focus", () => {
  expect(css).toContain(":is(.ov-right.doan-scroll, .doan-insp-body, .thread-scroll) { scroll-padding-block-start: var(--size-chrome); }");
});
