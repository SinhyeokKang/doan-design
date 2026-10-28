import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
function rule(css: string, selector: string): string | null {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? null : css.slice(at + selector.length + 2, css.indexOf("}", at)).trim();
}

test("the lg button is 48px with 16/24 text and 12/32 padding; default 40 and sm 32 stay", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-button[data-ui-size="lg"]')).toBe("min-height: var(--size-control-lg); padding: var(--space-3) var(--space-8); font-size: var(--type-label-size); line-height: var(--type-label-line-height);");
  expect(css).toContain(".doan-button[data-ui-size=\"sm\"] { min-height: var(--size-control-sm); padding: var(--space-1h) var(--space-4); }");
  expect(rule(css, ".doan-button")).toContain("min-height: var(--size-control);\n  padding: var(--space-2) var(--space-6);");
  const tokens = read("../tokens.css");
  for (const [name, value] of [["--size-control-lg", "48px"], ["--size-control", "40px"], ["--size-control-sm", "32px"], ["--type-label-size", "16px"], ["--type-label-line-height", "24px"]]) expect(tokens).toContain(`${name}: ${value};`);
});

test("a notice on a panel takes the panel's ink and 12/16 padding, and its icon inherits the text colour", () => {
  const css = read("./surfaces.css");
  expect(rule(css, ".doan-notice.doan-panel")).toBe("padding: var(--space-3) var(--space-4); background: var(--surface-panel); color: var(--text-standard);");
  expect(css).toContain(".doan-notice.error.doan-panel > .doan-alert-icon { color: inherit; }");
});
