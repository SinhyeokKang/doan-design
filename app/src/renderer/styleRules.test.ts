import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
// The body of the rule whose selector list is exactly `selector`, at the start of a line.
function rule(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const start = at + selector.length + 3;
  return css.slice(start, css.indexOf("}", start)).trim();
}

const styles = read("./styles.css");

// DESIGN 'Scrollbars': `.doan-scroll` is the one thin bar; no rule restates it.
describe("scrollers take .doan-scroll instead of their own scrollbar rules", () => {
  test.each([".conversation-thread .md-code pre", ".conversation-thread .md-table", ".conversation-thread .thread-scroll", ".composer-input"])("%s sets no scrollbar property", selector => {
    expect(rule(styles, selector)).not.toMatch(/scrollbar-/);
  });
});

// DESIGN 'Type roles': secondary lines in the sidebar are captions (12/16 with caption tracking), not 11/14 or 12/18.
describe("sidebar secondary lines are captions", () => {
  const caption = ["font-size: var(--type-caption-size);", "line-height: var(--type-caption-line-height);", "letter-spacing: var(--type-caption-letter-spacing);"];
  test("a worktree's path sits 2px under its name in caption type", () => {
    const body = rule(styles, ".shell-worktree small");
    for (const declaration of caption) expect(body).toContain(declaration);
    expect(body).toContain("margin-top: var(--space-half);");
  });
  test("the canvas group's empty and read-error lines are captions", () => {
    const body = rule(styles, ".shell-empty, .shell-canvas-error");
    for (const declaration of caption) expect(body).toContain(declaration);
    expect(rule(styles, ".shell-empty")).not.toContain("line-height");
  });
  test("a project skill row's description carries caption tracking", () => {
    expect(rule(styles, ".preset-desc")).toContain("letter-spacing: var(--type-caption-letter-spacing);");
  });
});

// DESIGN 'Radii': the small steps are named for their use; every computed corner stays the same.
describe("small corners read the radius steps", () => {
  test.each([".anchor-chip", ".suggestion-value", ".skill-word"])("%s, a word-sized highlight, uses --radius-word", selector => {
    expect(rule(styles, selector)).toContain("border-radius: var(--radius-word);");
  });
  test.each([".shell-disclosure", ".badge-bubble", ".settings-page code", ".problem-heading p code"])("%s uses --radius-inline", selector => {
    expect(rule(styles, selector)).toContain("border-radius: var(--radius-inline);");
  });
  test("the checkbox uses --radius-inline", () => {
    expect(read("./ds/controls.css")).toMatch(/\.doan-checkbox \{[^}]*border-radius: var\(--radius-inline\);/);
  });
  test("project thumbnails take a quarter of their side from one rule", () => {
    expect(rule(styles, ".shell-thumbnail")).toContain("border-radius: var(--radius-thumbnail);");
    expect(rule(styles, ":is(.home-project, .project-item) .shell-thumbnail")).not.toContain("border-radius");
    expect(rule(styles, ".settings-title .project-settings-thumbnail.shell-thumbnail")).not.toContain("border-radius");
  });
});

describe("scrollers carry .doan-scroll in markup", () => {
  test("the thread, its code blocks and tables, and the composer field", () => {
    const thread = read("./ConversationThread.tsx"), parts = read("./ComposerParts.tsx");
    expect(thread).toContain('<pre className="doan-scroll">');
    expect(thread).toContain('<div className="md-table doan-scroll">');
    expect(thread).toContain('<div className="thread-scroll doan-scroll"');
    expect(parts).toContain('className="composer-input doan-scroll"');
  });
});

// DESIGN 'No coloured edge stripes': a narrow list's read failure is an inline error.
describe("narrow list read failures are inline errors", () => {
  test.each([".rp-error", ".conv-error", ".shell-canvas-error"])("%s takes the danger ink", selector => {
    expect(rule(styles, selector)).toContain("color: var(--text-danger);");
  });
  test.each(["./ProjectOverview.tsx", "./CanvasConversationPanel.tsx", "./prototype/PrototypeConversation.tsx", "./CanvasConversationList.tsx"])("%s leads its failure line with the alert icon", name => {
    expect(read(name)).toMatch(/className="(?:conv|rp)-error" role="status"><AlertIcon \/>/);
  });
  test("the sidebar's icon is the small icon, centred on the caption line", () => {
    expect(rule(styles, ".shell-canvas-error .doan-alert-icon")).toBe("width: var(--size-icon-sm); height: var(--size-icon-sm); margin-block: calc((var(--type-caption-line-height) - var(--size-icon-sm)) / 2);");
  });
});

// Rows and status chips set what they show: no base `.row` or `.err` rule.
test("no legacy .row or .err base rule remains", () => {
  for (const selector of [".row", ".row .g", ".row:hover", ".err"]) expect(styles).not.toContain(`\n${selector} {`);
});
