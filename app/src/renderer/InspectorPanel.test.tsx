import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import type { InspectRow } from "../main/inspect";
import { COPY_FAILED, INSPECTOR_EMPTY, INSPECTOR_FAILED, INSPECTOR_PANEL_ID, InspectorBody, InspectorColumn, InspectorPanel, selectionName, type ElementTreeSource } from "./InspectorPanel";
import type { InspectorReadState } from "./inspectorReads";
import type { SelectionView } from "./selection";
import { TooltipProvider } from "./components/ui/tooltip";

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const body = (read: InspectorReadState) => html(<InspectorBody read={read} onRetry={vi.fn()} onNotice={vi.fn()} onEscape={vi.fn()} />);
const read = (panel: InspectorReadState["panel"], retrying = false): InspectorReadState => ({ panel, retrying, seq: 1 });
const tree: ElementTreeSource = { request: () => true, subscribe: () => () => {}, preview: vi.fn(), select: vi.fn() };
const PAY: SelectionView = { tag: "button", frame: { id: "pay", title: "Payment" }, element: { selector: "#pay-button", doanId: "pay-button", html: "<button>" }, path: [{ label: "pay", selector: "section" }, { label: "pay-button", selector: "#pay-button" }] };

const ROWS: InspectRow[] = [
  { group: "box", label: "Width", value: "342px", state: "default" },
  { group: "box", label: "Height", value: "52px", state: "hardcoded" },
  { group: "box", label: "Padding", value: "24px", state: "token", token: "--space-6", sides: ["top", "right", "bottom", "left"].map(side => ({ side, value: "24px", token: "--space-6" })) },
  { group: "typography", label: "Size", value: "16px", state: "token", token: "--text-label" },
  { group: "colors", label: "Background", value: "#4f46e5", state: "token", token: "--color-brand" },
  { group: "colors", label: "Text", value: "#ffffff", state: "hardcoded" },
  { group: "shadow", label: "Shadow", value: "none", state: "default" },
];

describe("the panel's states", () => {
  test("no selection: the conversation panel's empty line", () => {
    const markup = body(read({ kind: "empty" }));
    expect(markup).toBe(`<div class="doan-conv-body"><p class="doan-conv-empty">${INSPECTOR_EMPTY}</p></div>`);
    expect(INSPECTOR_EMPTY).toBe("Select a frame or element on the canvas to see its styles.");
  });

  test("a new selection's read shows its status region at once and its line only after the delay", () => {
    const markup = body(read({ kind: "reading", rows: null }));
    expect(markup).toContain('<div class="doan-insp-loading" role="status"></div>');
    expect(markup).not.toContain("Reading styles");
  });

  test("the same selection read again keeps its rows, marked busy", () => {
    const markup = body(read({ kind: "reading", rows: ROWS }));
    expect(markup).toContain('role="group" aria-label="Styles" aria-busy="true"');
    expect(markup).toContain('aria-label="Height, 52px"');
    expect(markup).not.toContain("doan-insp-loading");
  });

  test("a failed read is one alert line with Retry at its end, busy while Retry reads", () => {
    const markup = body(read({ kind: "failed" }));
    expect(INSPECTOR_FAILED).toBe("Couldn’t read the styles.");
    const id = markup.match(/<span id="([^"]+)">Couldn’t read the styles\.<\/span>/)?.[1];
    expect(id).toBeDefined();
    expect(markup).toMatch(/<div class="doan-insp-failed" role="alert"><svg[^>]*doan-alert-icon/);
    expect(markup).toContain(`<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-describedby="${id}">Retry</button>`);
    const busy = body(read({ kind: "failed" }, true));
    expect(busy).toMatch(/aria-disabled="true" aria-busy="true"><span class="doan-spinner" aria-hidden="true"><\/span>Retry<\/button>/);
    expect(busy).toContain("Couldn’t read the styles.");
  });

  test("rows that are all browser defaults leave the panel's no-styles line", () => {
    expect(body(read({ kind: "rows", rows: [ROWS[0]!, ROWS[6]!] }))).toContain('<p class="doan-insp-none">The canvas sets no styles here.</p>');
  });
});

describe("rows", () => {
  const markup = body(read({ kind: "rows", rows: ROWS }));

  test("only what the canvas sets, grouped in the person's order, with no source captions", () => {
    expect([...markup.matchAll(/<h3 class="doan-insp-group-title">([^<]+)<\/h3>/g)].map(match => match[1])).toEqual(["Box", "Typography", "Colors"]);
    expect([...markup.matchAll(/<span class="doan-insp-label">([^<]+)<\/span>/g)].map(match => match[1])).toEqual(["Padding", "Height", "Size", "Text", "Background"]);
    expect(markup).not.toMatch(/Width|Shadow|Hardcoded|Default|Unknown/);
  });

  test("a token row shows its chip alone; a value row shows its value; a colour's swatch sits in its chip", () => {
    expect(markup).toContain('<span class="doan-insp-value"><code class="doan-code"><span>--space-6</span></code></span>');
    expect(markup).toContain('<span class="doan-insp-value"><span class="doan-insp-text">52px</span></span>');
    expect(markup).toContain('<code class="doan-code"><i class="doan-insp-swatch" style="background:#4f46e5" aria-hidden="true"></i><span>--color-brand</span></code>');
    expect(markup).toContain('<span class="doan-insp-value"><i class="doan-insp-swatch" style="background:#ffffff" aria-hidden="true"></i><span class="doan-insp-text">#ffffff</span></span>');
  });

  test("each row is one button read as it shows, with the copy hint as its description, and one Tab stop", () => {
    const buttons = [...markup.matchAll(/<button type="button" class="doan-insp-row"[^>]*>/g)].map(match => match[0]);
    expect(buttons).toHaveLength(5);
    expect(buttons[0]).toContain('data-key="box:padding"');
    expect(buttons[0]).toContain('aria-label="Padding, 24px, token --space-6"');
    expect(buttons.filter(button => button.includes('tabindex="0"'))).toHaveLength(1);
    expect(buttons[0]).toContain('tabindex="0"');
    const hint = buttons[0]!.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(buttons.every(button => button.includes(`aria-describedby="${hint}"`))).toBe(true);
    expect(markup).toContain(`<span class="sr-only" id="${hint}">Press to copy</span>`);
  });
});

describe("the head and the column", () => {
  test("without a selection the title is Inspector, then Hide inspector", () => {
    const markup = html(<InspectorPanel shown={true} onHide={vi.fn()} selection={null} document={null} inspect={vi.fn()} tree={tree} onNotice={vi.fn()} onEscape={vi.fn()} />);
    expect(markup).toContain(`<aside class="right ov-right doan-insp-panel" id="${INSPECTOR_PANEL_ID}" role="region" aria-label="Inspector">`);
    expect(markup).toContain('<div class="doan-conv-head doan-insp-head"><span class="doan-insp-title">Inspector</span>');
    expect(markup).toMatch(/<button type="button" class="doan-icon-button doan-panel-hide" aria-label="Hide inspector" aria-expanded="true" aria-controls="doan-inspector-panel"[^>]*><svg[^>]*lucide-panel-right-close/);
    expect(markup).toContain(INSPECTOR_EMPTY);
  });

  test("with a selection the title is its name in the conversation head's title-menu trigger, opening a tree", () => {
    const markup = html(<InspectorPanel shown={true} onHide={vi.fn()} selection={{ canvas: { root: "/repo", path: "a.html" }, view: PAY }} document="d" inspect={() => new Promise(() => {})} tree={tree} onNotice={vi.fn()} onEscape={vi.fn()} />);
    expect(markup).toMatch(/<span class="ov-title-wrap doan-conv-title doan-insp-pick"><button type="button" class="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-haspopup="tree" aria-label="pay-button, element\. Elements in this frame"/);
    expect(markup).toMatch(/<span>pay-button<\/span><svg[^>]*lucide-chevron-down chev/);
  });

  test("the name before the canvas's tree answers: a frame's title, an element's data-doan-id, else its tag", () => {
    expect(selectionName({ tag: "section", frame: { id: "pay", title: " Payment " }, path: [] })).toBe("Payment");
    expect(selectionName({ tag: "section", frame: { id: "pay" }, path: [] })).toBe("pay");
    expect(selectionName(PAY)).toBe("pay-button");
    expect(selectionName({ tag: "div", element: { selector: "div", html: "<div>" }, path: [] })).toBe("div");
  });

  test("folded or yielding, the column stays in the DOM, inert and hidden, with its resize handle", () => {
    const column = (shown: boolean) => html(<InspectorColumn shown={shown} width={280} bounds={{ min: 280, max: 512 }} onHide={vi.fn()} onResize={vi.fn()} preview={vi.fn()} selection={null} document={null} inspect={vi.fn()} tree={tree} onNotice={vi.fn()} onEscape={vi.fn()} />);
    expect(column(false)).toMatch(/^<div class="doan-insp-column" data-collapsed="" inert="">/);
    expect(column(true)).toMatch(/^<div class="doan-insp-column">/);
    expect(column(true)).toContain('<div class="doan-panel-handle" role="separator" aria-orientation="vertical" aria-label="Resize inspector" aria-valuenow="280" aria-valuemin="280" aria-valuemax="512" tabindex="0"></div>');
  });

  test("copy failure wording", () => {
    expect(COPY_FAILED).toBe("Couldn’t copy the value. Try again.");
  });
});

describe("styles", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const controls = readFileSync(new URL("./ds/controls.css", import.meta.url), "utf8");
  const surfaces = readFileSync(new URL("./ds/surfaces.css", import.meta.url), "utf8");

  // A fourth column, placed by number, for every rule the third column answered.
  test("the inspector is the shell's third column; the conversation and the Overview's list take the fourth", () => {
    expect(css).toContain(".workspace.app-shell { grid-template-columns: var(--doan-sidebar-width) minmax(0, 1fr) var(--doan-inspector-width) var(--doan-right-width);");
    expect(css).toContain(':root[data-sidebar="hidden"] .workspace.app-shell { grid-template-columns: 0px minmax(0, 1fr) var(--doan-inspector-width) var(--doan-right-width); }');
    expect(css).toContain(".workspace > .doan-insp-column { grid-column: 3; grid-row: -2;");
    expect(css).toContain(".workspace > :is(.doan-conv-column, .right-stack) { grid-column: 4; }");
    expect(css).toContain(".workspace.with-strip > :is(.doan-conv-column, .doan-insp-column) { grid-row: -3 / -1; }");
    expect(css).toContain(".doan-panel-handle.doan-overview-handle { grid-column: 4 / 5;");
    expect(css).toContain(":root { --doan-inspector-width: 0px; }");
  });

  test("the panel's right corners belong to the last column shown", () => {
    expect(css).toContain(".right.doan-insp-panel { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; border-radius: 0; overflow: hidden; }");
    expect(css).toContain('.workspace[data-conv="collapsed"] .right.doan-insp-panel { border-radius: 0 var(--radius-container) var(--radius-container) 0; }');
    expect(css).toContain('.workspace[data-panel="collapsed"] > .doan-canvas-panel { border-top-right-radius: var(--radius-container); border-bottom-right-radius: var(--radius-container); }');
  });

  test("folding the inspector moves like the conversation's, and reduced motion drops it", () => {
    expect(css).toContain(".doan-insp-column[data-collapsed] { visibility: hidden; }");
    expect(css).toContain(".workspace[data-panel-motion] > .doan-insp-column[data-collapsed] { transition: visibility 0s linear var(--time-panel-enter); }");
    expect(css).toContain("  .workspace[data-panel-motion] > .doan-insp-column[data-collapsed] { transition: none; }");
  });

  // The reading, failed and no-styles lines are body-sm like the rest of the panel (they would inherit the app's 13px body); the
  // "Inspector" title has no ellipsis, and a token chip keeps proportional figures.
  test("the panel's lines set their own type; the title and chips follow the draft", () => {
    const bodySm = /font-size: var\(--type-body-sm-size\); line-height: var\(--type-body-sm-line-height\); letter-spacing: var\(--type-body-sm-letter-spacing\);/;
    for (const selector of [".doan-insp-loading", ".doan-insp-failed", ".doan-insp-none"]) expect(css.match(new RegExp(`\\n\\${selector} \\{[^}]*\\}`))?.[0], selector).toMatch(bodySm);
    expect(css).toMatch(/\n\.doan-insp-title \{ flex: 1; min-width: 0; font:/);
    expect(css).not.toContain(".doan-insp-value .doan-code { font-variant-numeric: tabular-nums; }");
  });

  // The element menu and the row tooltip draw proportional figures (the app body's tabular figures are reset at the call site,
  // not in the shared tooltip); the menu follows the panel's width, above the shared menu cap of 320.
  test("the element menu and the row tooltip use proportional figures; the menu is not capped below the panel", () => {
    expect(css).toMatch(/\n\.ov-main, \.right\.ov-right, \.conv-menu, \.wt-menu, \.doan-insp-menu, \.doan-insp-tip \{ font-variant-numeric: normal; \}/);
    expect(css).toContain(".doan-floating.doan-insp-menu { width: calc(var(--doan-insp-panel-width) - 2 * var(--space-2)); max-width: none; }");
  });

  test("the shared code chip and the tree menu variant", () => {
    expect(controls).toMatch(/\.doan-code \{[^}]*border-radius: var\(--radius-inline\);[^}]*background: var\(--surface-inset\);[^}]*white-space: nowrap;[^}]*overflow: hidden;/);
    expect(controls).toContain(".doan-code > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }");
    expect(controls).toContain(".doan-code > i { flex: none; width: var(--size-icon-xs); height: var(--size-icon-xs); }");
    expect(surfaces).toContain('.doan-menu[data-ui-variant="tree"] .doan-menu-item { position: relative; gap: var(--space-2); padding-inline-start: calc(var(--space-3) + var(--tree-depth) * (var(--size-icon) + var(--space-2))); }');
    expect(surfaces).toContain('.doan-menu[data-ui-variant="tree"] .doan-menu-item[aria-selected="true"] { background: var(--affordance-backdrop-pressed); }');
    expect(surfaces).toMatch(/\.doan-menu\[data-ui-variant="tree"\] \.guide \{[^}]*width: 1px;[^}]*background: var\(--border-standard\);/);
  });
});
