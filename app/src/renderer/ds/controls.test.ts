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

test("menu rows are 32px from the primitive: 6px block insets around the 20px line, with no local project-menu override", () => {
  expect(rule(read("./surfaces.css"), ".doan-menu-item")).toContain("min-height: var(--size-control-sm);\n  padding: var(--space-1h) var(--space-3);");
  expect(read("../styles.css")).not.toMatch(/\.shell-project-menu \.doan-menu-item[^{]*\{[^}]*padding-block/);
});

// buzz-settings design 'Buzz 레퍼런스' (buzz-app c40dfdf4 components.css .buzz-switch*, settings-group.css), in doan tokens.
test("the switch is a 36 × 20 button[role=switch] with a 14px thumb as its own constants, prominent when on", () => {
  const css = read("./controls.css");
  const track = rule(css, '.doan-switch[role="switch"]');
  expect(track).toContain("width: 36px;\n  height: 20px;\n  padding: 2px;");
  expect(track).toContain("box-sizing: border-box;");
  expect(track).toContain("border: 1px solid var(--border-standard);");
  expect(track).toContain("border-radius: var(--radius-pill);");
  expect(track).toContain("background: var(--affordance-subtle-hover);");
  expect(track).not.toContain("--size-icon");
  const thumb = rule(css, '.doan-switch[role="switch"]::before');
  expect(thumb).toContain("width: 14px;\n  height: 14px;");
  expect(thumb).toContain("background: var(--text-on-prominent);");
  expect(thumb).not.toContain("--size-icon");
  expect(css).toContain('.doan-switch[role="switch"][aria-checked="true"] { border-color: var(--affordance-prominent); background: var(--affordance-prominent); }');
  expect(css).toContain('.doan-switch[role="switch"][aria-checked="true"]::before { transform: translateX(16px); }');
});

test("a disabled switch takes the disabled fill and keeps its position; focus shows the shared ring", () => {
  const css = read("./controls.css");
  expect(css).toContain('.doan-switch[role="switch"]:disabled { border-color: var(--affordance-disabled); background: var(--affordance-disabled); cursor: not-allowed; }');
  expect(css).toContain('.doan-switch[role="switch"]:disabled::before { background: var(--affordance-subtle-pressed); box-shadow: none; }');
  expect(css).toContain('.doan-switch[role="switch"]:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }');
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
  expect(reduced).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{(\n  [^\n]*)*\n  \.doan-switch\[role="switch"\], \.doan-switch\[role="switch"\]::before \{ transition: none; \}\n\}/);
});

test("a settings group is a bordered container of rows split by lines, and each row is a title column and a trailing control", () => {
  const css = read("./surfaces.css");
  const group = rule(css, ".doan-settings-group");
  expect(group).toContain("padding: 0 var(--space-4);");
  expect(group).toContain("border: 1px solid var(--border-standard);");
  expect(group).toContain("border-radius: var(--radius-container);");
  expect(css).toContain(".doan-settings-group > * + * { border-block-start: 1px solid var(--border-standard); }");
  const row = rule(css, ".doan-preference-row");
  expect(row).toContain("grid-template-columns: minmax(0, 1fr) auto;");
  expect(row).toContain("gap: var(--space-4);");
  expect(row).toContain("padding: var(--space-3) 0;");
  expect(rule(css, ".doan-preference-row-content")).toContain("gap: var(--space-half);");
  expect(rule(css, ".doan-preference-row-label")).toContain("font-size: var(--type-body-sm-size);");
  expect(rule(css, ".doan-preference-row-description")).toContain("font-size: var(--type-caption-size);");
  expect(rule(css, ".doan-preference-row-description")).toContain("color: var(--text-subtle);");
  expect(rule(css, ".doan-preference-row-trailing")).toContain("justify-content: flex-end;");
  expect(css).toContain(".doan-preference-row[data-disabled] :is(.doan-preference-row-label, .doan-preference-row-description) { color: var(--text-disabled); cursor: not-allowed; }");
});

test("in a narrow group a button control moves under the title; a switch stays beside it", () => {
  const css = read("./surfaces.css");
  expect(rule(css, ".doan-settings-group")).toContain("container-type: inline-size;");
  expect(css).toMatch(/@container \(max-width: 24rem\) \{\s*\.doan-preference-row-trailing:has\(button:not\(\[role="switch"\]\)\) \{ grid-column: 1 \/ -1; justify-content: flex-start; \}/);
});
