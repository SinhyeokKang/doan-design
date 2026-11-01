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

test("every notice shares one style on the base class; tones colour the text only and doan-panel changes only the surface", () => {
  const css = read("./surfaces.css");
  const base = rule(css, ".doan-notice")!;
  for (const declaration of ["align-items: flex-start;", "gap: var(--space-1h);", "padding: var(--space-3) var(--space-4);", "border-radius: var(--radius-row);", "color: var(--text-standard);", "font-size: var(--type-body-sm-size);", "line-height: var(--type-body-sm-line-height);"]) expect(base).toContain(declaration);
  expect(rule(css, ".doan-notice.warning")).toBe("color: var(--text-warning);");
  expect(rule(css, ".doan-notice.error")).toBe("color: var(--text-danger);");
  expect(rule(css, ".doan-notice.ok")).toBe("color: var(--text-success);");
  expect(rule(css, ".doan-notice.doan-panel")).toBe("background: var(--surface-panel);");
  // Inline actions centre on the first text line, as the icon does.
  expect(css).toContain(".doan-notice > :is(.doan-button, :has(> .doan-button)) { flex: none; align-self: flex-start; margin-block: calc((var(--type-body-sm-line-height) - var(--size-control-sm)) / 2); }");
  expect(css).toContain(".doan-alert-icon { flex: none; margin-block: calc((var(--type-body-sm-line-height) - var(--size-icon)) / 2); }");
  // The icon follows the text: no rule colours it on its own.
  expect(css).not.toMatch(/\.doan-notice[^{]*\.doan-alert-icon\s*\{[^}]*color/);
});

test("a notice's text parts take no ink of their own, so the title, body, lines and agent names follow the tone", () => {
  // Code chips and buttons keep their own ink; every other text inside a notice inherits the notice's tone colour.
  const parts = /\.(ob-notice-title|ob-notice-body|strip-text|setup-notice-body|setup-notice-list|setup-notice-item|setup-notice-agents|grow-text)(?![\w-])/;
  const sources = [read("./surfaces.css"), read("../styles.css")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const inked: string[] = [];
  for (const [, selectors, body] of sources.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const colours = body!.split(";").some(d => d.split(":")[0]!.trim() === "color");
    if (!colours) continue;
    // :not(...) arguments exclude elements, so they do not make a rule target a notice.
    for (const selector of selectors!.split(",").map(s => s.trim().replace(/:not\([^)]*\)/g, ""))) {
      const subject = selector.split(/[\s>+~]+/).at(-1)!;
      const insideNotice = /\.(doan-notice|convo-strip|setup-notice)(?![\w-])/.test(selector) && !/^(code|button|a|\.doan-button|\.doan-kbd)\b/.test(subject) && selector.trim() !== subject;
      if (parts.test(selector) || insideNotice) inked.push(`${selector} { ${body!.trim()} }`);
    }
  }
  expect(inked).toEqual([]);
});

test("screens set only outer margins on a notice: no per-screen padding, gap, type, ink or alignment", () => {
  const notice = /\.(doan-notice|composer-notice|settings-notice|ob-list-notice|ob-project-notice|ob-drop-notice|setup-notice|convo-strip)(?![\w-])/;
  const sources = [read("./surfaces.css"), read("../styles.css")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const shared = new Set([".doan-notice", ".doan-notice.warning", ".doan-notice.error", ".doan-notice.ok", ".doan-notice.doan-panel"]);
  const offenders: string[] = [];
  for (const [, selectors, body] of sources.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors!.split(",").map(s => s.trim())) {
      // The rule's subject is the last compound selector, without :not(...) arguments.
      const subject = selector.replace(/:not\([^)]*\)/g, "").split(/[\s>+~]+/).at(-1)!;
      if (!notice.test(subject) || shared.has(selector)) continue;
      const properties = body!.split(";").map(d => d.split(":")[0]!.trim()).filter(Boolean);
      if (properties.some(prop => !prop.startsWith("margin"))) offenders.push(`${selector} { ${body!.trim()} }`);
    }
  }
  expect(offenders).toEqual([]);
});

test("quiet, trigger and accent own their hover and pressed fills, so the shared opaque rules skip them", () => {
  const css = read("./controls.css");
  const excluded = ':not([data-ui-variant="prominent"], [data-ui-variant="quiet"], [data-ui-variant="trigger"], [data-ui-variant="accent"], [data-ui-placement="chrome"])';
  expect(css).toContain(`:is(.doan-button, .doan-icon-button)${excluded}:hover:not(:disabled) { background: var(--affordance-subtle-hover); }`);
  expect(css).toContain(`:is(.doan-button, .doan-icon-button)${excluded}:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { background: var(--affordance-subtle-pressed); }`);
  // A disabled Send keeps the disabled fill instead of vanishing like a ghost button.
  expect(css).toContain(':is(.doan-button, .doan-icon-button):not([data-ui-variant="prominent"], [data-ui-variant="subtle"], [data-ui-variant="panel"], [data-ui-variant="accent"]):is(:disabled, [data-disabled]) { background: transparent; }');
});

test("panel rests on the panel white for a notice's inset fill, hovers one step darker, takes subtle's pressed fill and the shared disabled fill", () => {
  const css = read("./controls.css");
  expect(css).toContain(':is(.doan-button, .doan-icon-button)[data-ui-variant="panel"] { background: var(--surface-panel); }');
  // Its hover comes after the shared opaque hover of the same weight, so it wins.
  const hover = ':is(.doan-button, .doan-icon-button)[data-ui-variant="panel"]:hover:not(:disabled) { background: var(--affordance-panel-hover); }';
  expect(css.indexOf(hover)).toBeGreaterThan(css.indexOf(":hover:not(:disabled) { background: var(--affordance-subtle-hover); }"));
  expect(read("../tokens.css")).toContain("--affordance-panel-hover: var(--neutral-3);");
  // Not excluded from the shared pressed rule, and a filled control when disabled.
  expect(css).not.toMatch(/:not\([^)]*\[data-ui-variant="panel"\][^)]*\):hover/);
  expect(css).not.toMatch(/:not\([^)]*\[data-ui-variant="panel"\][^)]*\):is\(:active/);
  expect(css).toMatch(/:not\(\[data-ui-variant="prominent"\], \[data-ui-variant="subtle"\], \[data-ui-variant="panel"\], \[data-ui-variant="accent"\]\):is\(:disabled, \[data-disabled\]\) \{ background: transparent; \}/);
});

test("quiet is the header capsule's backdrop with a blur, and steps one backdrop layer on hover and pressed", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-button[data-ui-variant="quiet"]')).toBe("background: var(--affordance-backdrop-hover); -webkit-backdrop-filter: blur(var(--blur-md)); backdrop-filter: blur(var(--blur-md));");
  expect(css).toContain('.doan-button[data-ui-variant="quiet"]:hover:not(:disabled) { box-shadow: inset 0 0 0 100vmax var(--affordance-backdrop-hover); }');
  expect(css).toContain('.doan-button[data-ui-variant="quiet"]:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled) { box-shadow: inset 0 0 0 100vmax var(--affordance-backdrop-pressed); }');
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.doan-button\[data-ui-variant="quiet"\] \{ background: var\(--affordance-subtle\); -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  expect(rule(css, ":is(.doan-button, .doan-icon-button)")).toContain("box-shadow var(--time-state) var(--ease-state)");
});

test("the xs button is 24px with caption type, 4/8 padding and 14px icons, before the trigger rule", () => {
  const css = read("./controls.css");
  expect(rule(css, '.doan-button[data-ui-size="xs"]')).toBe("min-height: var(--size-control-xs); padding: var(--space-1) var(--space-2); gap: var(--space-1); font-size: var(--type-caption-size); line-height: var(--type-caption-line-height); letter-spacing: var(--type-caption-letter-spacing);");
  expect(rule(css, '.doan-button[data-ui-size="xs"] > svg')).toBe("width: var(--size-icon-sm); height: var(--size-icon-sm);");
  // Trigger keeps its 8px inline padding at every size, so it must still come after the size rules.
  expect(css.indexOf('.doan-button[data-ui-variant="trigger"] {')).toBeGreaterThan(css.indexOf('.doan-button[data-ui-size="xs"] {'));
  expect(read("../tokens.css")).toContain("--size-control-xs: 24px;");
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
  expect(css).toContain('.doan-switch[role="switch"]:disabled { border-color: transparent; background: var(--affordance-disabled); cursor: default; }');
  expect(css).toContain('.doan-switch[role="switch"]:disabled::before { background: var(--surface-panel); box-shadow: none; }');
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
  // No row gap: a line under the row (a notice, a helper) sets its own distance.
  expect(row).toContain("gap: 0 var(--space-4);");
  expect(row).toContain("padding: var(--space-3) 0;");
  expect(rule(css, ".doan-preference-row-content")).toContain("gap: var(--space-half);");
  expect(rule(css, ".doan-preference-row-label")).toContain("font-size: var(--type-body-sm-size);");
  expect(rule(css, ".doan-preference-row-description")).toContain("font-size: var(--type-caption-size);");
  expect(rule(css, ".doan-preference-row-description")).toContain("color: var(--text-subtle);");
  expect(rule(css, ".doan-preference-row-trailing")).toContain("justify-content: flex-end;");
  expect(css).toContain(".doan-preference-row[data-disabled] :is(.doan-preference-row-label, .doan-preference-row-description) { color: var(--text-disabled); }");
});

test("in a narrow group a button control moves under the title; a switch stays beside it", () => {
  const css = read("./surfaces.css");
  expect(rule(css, ".doan-settings-group")).toContain("container-type: inline-size;");
  expect(css).toMatch(/@container \(max-width: 24rem\) \{\s*\.doan-preference-row-trailing:has\(button:not\(\[role="switch"\]\)\) \{ grid-column: 1 \/ -1; justify-content: flex-start; \}/);
});
