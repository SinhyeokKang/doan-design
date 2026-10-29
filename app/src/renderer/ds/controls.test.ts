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

test("quiet, trigger and accent own their hover and pressed fills, so the shared opaque rules skip them", () => {
  const css = read("./controls.css");
  const excluded = ':not([data-ui-variant="prominent"], [data-ui-variant="quiet"], [data-ui-variant="trigger"], [data-ui-variant="accent"], [data-ui-placement="chrome"])';
  expect(css).toContain(`:is(.doan-button, .doan-icon-button)${excluded}:hover:not(:disabled) { background: var(--affordance-subtle-hover); }`);
  expect(css).toContain(`:is(.doan-button, .doan-icon-button)${excluded}:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { background: var(--affordance-subtle-pressed); }`);
  // A disabled Send keeps the disabled fill instead of vanishing like a ghost button.
  expect(css).toContain(':is(.doan-button, .doan-icon-button):not([data-ui-variant="prominent"], [data-ui-variant="subtle"], [data-ui-variant="accent"]):is(:disabled, [data-disabled]) { background: transparent; }');
});

test("quiet is the header capsule's backdrop with a blur, and steps one backdrop layer on hover and pressed", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-button[data-ui-variant="quiet"]')).toBe("background: var(--affordance-backdrop-hover); -webkit-backdrop-filter: blur(var(--blur-md)); backdrop-filter: blur(var(--blur-md));");
  expect(css).toContain('.doan-button[data-ui-variant="quiet"]:hover:not(:disabled) { box-shadow: inset 0 0 0 100vmax var(--affordance-backdrop-hover); }');
  expect(css).toContain('.doan-button[data-ui-variant="quiet"]:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { box-shadow: inset 0 0 0 100vmax var(--affordance-backdrop-pressed); }');
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.doan-button\[data-ui-variant="quiet"\] \{ background: var\(--affordance-subtle\); -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  expect(rule(css, ":is(.doan-button, .doan-icon-button)")).toContain("box-shadow var(--time-state) var(--ease-state)");
});

test("trigger has no fill at rest, 8px inline padding after the size rules, and the backdrop fill on hover and open", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-button[data-ui-variant="trigger"]')).toBe("padding-inline: var(--space-2);");
  expect(css.indexOf('.doan-button[data-ui-variant="trigger"] {')).toBeGreaterThan(css.indexOf('.doan-button[data-ui-size="lg"] {'));
  expect(css).toContain('.doan-button[data-ui-variant="trigger"]:hover:not(:disabled) { background: var(--affordance-backdrop-hover); }');
  expect(css).toContain('.doan-button[data-ui-variant="trigger"]:is([aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { background: var(--affordance-backdrop-hover); }');
  expect(css).toContain('.doan-button[data-ui-variant="trigger"]:active:not(:disabled) { background: var(--affordance-backdrop-pressed); }');
});

test("icon button size xs is a 24px pill with the small icon; variant accent is the violet fill", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-icon-button[data-ui-size="xs"]')).toBe("width: var(--size-control-xs); height: var(--size-control-xs); border-radius: var(--radius-pill);");
  expect(rule(css, '.doan-icon-button[data-ui-size="xs"] > svg')).toBe("width: var(--size-icon-sm); height: var(--size-icon-sm);");
  expect(rule(css, '.doan-icon-button[data-ui-variant="accent"]')).toBe("border-radius: var(--radius-pill); background: var(--affordance-accent); color: var(--text-on-accent);");
  expect(css).toContain('.doan-icon-button[data-ui-variant="accent"]:hover:not(:disabled) { background: var(--affordance-accent-hover); }');
  expect(css).toContain('.doan-icon-button[data-ui-variant="accent"]:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { background: var(--affordance-accent-pressed); }');
  // The accent resting fill must come before the shared disabled rule of equal weight, which then wins.
  expect(css.indexOf('.doan-icon-button[data-ui-variant="accent"] {')).toBeLessThan(css.indexOf(":is(.doan-button, .doan-icon-button):is(:disabled, [data-disabled]) {"));
});

test("a toast puts its message and action on one row and sits at the window's bottom-right", () => {
  const surfaces = read("./surfaces.css");
  expect(rule(surfaces, ".doan-toast")).toBe("display: flex;\n  align-items: center;\n  gap: var(--space-3);\n  width: min(384px, calc(100vw - 2 * var(--space-4)));\n  padding: var(--space-3);\n  overflow-wrap: anywhere;");
  expect(rule(surfaces, ".doan-toast .msg")).toContain("flex: 1; min-width: 0;");
  const styles = read("../styles.css");
  expect(rule(styles, ".toast")).toBe("position: absolute; right: var(--space-4); bottom: var(--space-4); z-index: 6;");
  expect(styles).not.toContain("~ .toast");
});
