import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Forced colours paint author backgrounds as Canvas and drop shadows. jsdom cannot emulate them, so this pins the rules.
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = read("./styles.css"), surfaces = read("./ds/surfaces.css");

// The rules inside every forced-colours block, in source order.
function forced(css: string): string {
  const opening = "@media (forced-colors: active) {";
  const blocks: string[] = [];
  for (let at = css.indexOf(opening); at >= 0; at = css.indexOf(opening, at + 1)) {
    let depth = 1, end = at + opening.length;
    for (; depth > 0 && end < css.length; end++) depth += css[end] === "{" ? 1 : css[end] === "}" ? -1 : 0;
    blocks.push(css.slice(at + opening.length, end - 1));
  }
  return blocks.join("\n").replace(/\s+/g, " ");
}

// Every selector of every rule, split at the list's own commas, not at those inside :is() or :has().
function selectors(css: string): string[] {
  return [...css.matchAll(/([^{};]+)\{/g)].flatMap(match => {
    const list = [""];
    let depth = 0;
    for (const char of match[1]!) {
      depth += char === "(" ? 1 : char === ")" ? -1 : 0;
      if (char === "," && depth === 0) list.push("");
      else list[list.length - 1] += char;
    }
    return list.map(item => item.replace(/\s+/g, " ").trim());
  });
}

const CHECKED_RADIOS = ":is(.ob-choice:has(input:checked), .buddy-row:has(input:checked), .conversation-thread .q-pref:has(> input:checked), .storage-option:has(> input:checked), .storage-row:has(> input:checked), .storage-pref:has(> input:checked))";
const DISABLED_CHECKED_RADIOS = ":is(.buddy-row[data-disabled]:has(input:checked), .storage-option:has(> input[aria-disabled=\"true\"]:checked), .storage-row:has(> input[aria-disabled=\"true\"]:checked), .doan-preference-row[data-disabled].storage-pref:has(> input:checked))";

describe("under forced colours", () => {
  test.each([
    ["a checked radio's ring", `${CHECKED_RADIOS} .ob-radio { border-color: Highlight; }`],
    ["a checked radio's dot", `${CHECKED_RADIOS} .ob-radio::before { forced-color-adjust: none; background: Highlight; }`],
    ["a disabled checked radio's ring", `${DISABLED_CHECKED_RADIOS} .ob-radio { border-color: GrayText; }`],
    ["a disabled checked radio's dot", `${DISABLED_CHECKED_RADIOS} .ob-radio::before { background: GrayText; }`],
    ["the composer's edge", ".composer-card { outline: 1px solid CanvasText; }"],
    ["the composer's focus", ".composer-card:focus-within { outline: 2px solid Highlight; }"],
    // Every tab carries the border, so the current one is no wider than its siblings.
    ["every setup step's and mode's border", ":is(.ob-steps .doan-button, .shell-modes button) { border: 2px solid Canvas; }"],
    ["the current setup step and mode", ":is(.ob-steps .doan-button, .shell-modes button).current { border-color: Highlight; }"],
    ["the Fast switch knob", ".fast-switch::before { forced-color-adjust: none; background: CanvasText; }"],
    ["the checked Fast switch", ".fast-item[aria-checked=\"true\"] .fast-switch { border-color: Highlight; }"],
    ["the checked Fast knob", ".fast-item[aria-checked=\"true\"] .fast-switch::before { background: Highlight; }"],
    ["the disabled Fast switch", ".fast-item[data-disabled] .fast-switch { border-color: GrayText; }"],
    ["the disabled Fast knob", ".fast-item[data-disabled] .fast-switch::before { background: GrayText; }"],
    ["the agent notice", ".doan-agent { outline: 1px solid CanvasText; outline-offset: -1px; }"],
    ["a queued message", ".queue-item { outline: 1px solid CanvasText; outline-offset: -1px; }"],
    ["the row's unread dot", ".row-slot.unseen i { forced-color-adjust: none; background: Highlight; }"],
    ["the header buttons' unread dot", ":is(.doan-icon-button[data-badge=\"true\"], :is(.doan-canvas-head .doan-panel-show, .pw-conv).doan-icon-button[data-badge=\"unseen\"])::after { forced-color-adjust: none; background: Highlight; box-shadow: none; }"],
    ["the thread's streaming caret", ".conversation-thread .caret { forced-color-adjust: none; background: CanvasText; }"],
  ])("%s stays visible", (_name, rule) => {
    expect(forced(styles)).toContain(rule);
  });

  test("a floating notice keeps an edge", () => {
    expect(forced(surfaces)).toContain(".doan-notice.doan-panel { outline: 1px solid CanvasText; outline-offset: -1px; }");
  });

  // The notice takes focus from code, and its edge's outline would replace the browser's focus ring.
  test("a focused floating notice reads apart from an unfocused one", () => {
    expect(forced(surfaces)).toContain(".doan-notice.doan-panel:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }");
  });

  // A new copy of the radio, or of its disabled look, needs its selector in the lists above.
  test("every row that draws a checked radio dot is covered", () => {
    const dot = " .ob-radio::before";
    const rows = selectors(styles).filter(item => item.includes(":checked") && item.endsWith(dot)).map(item => item.slice(0, -dot.length));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const row of rows) expect(`${CHECKED_RADIOS} ${DISABLED_CHECKED_RADIOS}`).toContain(row);
  });

  // Equal or higher specificity alone does not win: each override has to follow the rules it replaces.
  test.each([
    [".storage-pref:has(> input:checked) .ob-radio::before { content", `${CHECKED_RADIOS} .ob-radio::before`],
    [`${CHECKED_RADIOS} .ob-radio::before`, `${DISABLED_CHECKED_RADIOS} .ob-radio::before`],
    [".fast-item[data-disabled] .fast-switch::before { background: var(--surface-panel)", ".fast-switch::before { forced-color-adjust"],
    [".fast-item[aria-checked=\"true\"] .fast-switch::before { background: Highlight", ".fast-item[data-disabled] .fast-switch::before { background: GrayText"],
    [":is(.doan-canvas-head .doan-panel-show, .pw-conv).doan-icon-button[data-badge=\"unseen\"]::after { content", "[data-badge=\"unseen\"])::after { forced-color-adjust"],
    [".conversation-thread .caret { display", ".conversation-thread .caret { forced-color-adjust"],
  ])("%s comes before %s", (earlier, later) => {
    const flat = styles.replace(/\s+/g, " ");
    expect(flat.indexOf(earlier)).toBeGreaterThanOrEqual(0);
    expect(flat.indexOf(later)).toBeGreaterThan(flat.indexOf(earlier));
  });
});
