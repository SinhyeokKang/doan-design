import assert from "node:assert/strict";
import type { Page } from "playwright";

// Read the rendered shell: jsdom cannot catch inherited CSS or border-box drift.
export async function shellPresentation(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.evaluate(() => {
    const failures: string[] = [];
    const check = (name: string, actual: unknown, expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    };
    const node = (selector: string) => document.querySelector(selector)!;
    const css = (selector: string) => getComputedStyle(node(selector));
    const box = (selector: string) => node(selector).getBoundingClientRect();
    const side = box(".workspace .shell-side");
    check("history position", [box(".workspace .shell-history").x, box(".workspace .shell-history").y], [104, 12]);
    check("header history corner", css(".shell-history button").borderRadius, "10px");
    check("Add Projects plus glyph", Array.from(node(".shell-modes button:first-child svg").querySelectorAll("path")).map(path => path.getAttribute("d")).sort(), ["M12 5v14", "M5 12h14"]);
    check("Projects grid glyph", node(".shell-modes .current svg")?.querySelectorAll("rect").length, 4);
    for (const button of document.querySelectorAll(".shell-modes button")) {
      const style = getComputedStyle(button);
      check(`${button.textContent} inset`, [style.paddingLeft, style.paddingRight], ["16px", "16px"]);
      check(`${button.textContent} ink`, style.color, button.getAttribute("aria-current") ? "rgb(15, 15, 15)" : "rgb(82, 82, 82)");
    }
    check("selected header elevation", css(".shell-modes .current").boxShadow !== "none", true);
    check("Search relative position", [box(".shell-search").x - side.x, box(".shell-search").y - side.y], [8, 8]);
    check("Search inset", [css(".shell-search").paddingLeft, css(".shell-search").paddingRight], ["10px", "10px"]);
    check("Search ink", css(".shell-search").color, "rgb(82, 82, 82)");
    const heading = document.querySelector('.shell-side h2');
    check("Projects heading", heading?.textContent, "Projects");
    if (heading) check("heading typography", [getComputedStyle(heading).fontSize, getComputedStyle(heading).lineHeight], ["10px", "16px"]);
    check("first project position", box(".shell-project-row").y - side.y, 84);
    check("project to canvas spacing", box(".shell-canvas-row").y - box(".shell-project-row").bottom, 4);
    check("project name ink", css(".shell-project-name").color, "rgb(15, 15, 15)");
    check("project tracking", css(".shell-project-name").letterSpacing, "-0.035px");
    check("thumbnail inset", box(".shell-thumbnail").x - side.x, 18);
    check("thumbnail typography", [css(".shell-thumbnail").fontWeight, css(".shell-thumbnail").lineHeight], ["600", "16px"]);
    check("project options ink", css(".shell-more").color, "rgb(82, 82, 82)");
    for (const row of document.querySelectorAll(".shell-canvas-row")) {
      const style = getComputedStyle(row);
      check("canvas tracking", style.letterSpacing, "-0.035px");
      check("canvas row inset", [style.paddingLeft, style.paddingRight], ["10px", "10px"]);
    }
    return failures;
  });
  assert.deepEqual(failures, [], "shell presentation");
}

// Call with the real project menu open; selection must survive focus moving elsewhere.
export async function shellMenuPresentation(page: Page) {
  const failures = await page.locator(".shell-project-menu").evaluate(menu => {
    const failures: string[] = [];
    for (const row of menu.querySelectorAll('.doan-menu-item:not(.shell-worktree)')) {
      if (row.getBoundingClientRect().height !== 32) failures.push(`${row.textContent}: height ${row.getBoundingClientRect().height}`);
    }
    for (const path of menu.querySelectorAll(".shell-worktree small")) {
      const style = getComputedStyle(path);
      if (style.lineHeight !== "14px" || style.marginTop !== "4px") failures.push(`worktree path: ${style.lineHeight}/${style.marginTop}`);
    }
    for (const glyph of menu.querySelectorAll(".doan-menu-item > svg:first-child")) {
      if (getComputedStyle(glyph).color !== "rgb(82, 82, 82)") failures.push(`menu glyph ink: ${getComputedStyle(glyph).color}`);
    }
    const selected = menu.querySelector('.shell-worktree[aria-current="true"]');
    if (!selected || getComputedStyle(selected).backgroundColor !== "rgba(0, 0, 0, 0.1)") failures.push(`selected worktree fill: ${selected && getComputedStyle(selected).backgroundColor}`);
    return failures;
  });
  assert.deepEqual(failures, [], "shell menu presentation");
}

export async function shellEmptyPresentation(page: Page) {
  const actual = await page.locator(".shell-empty").filter({ hasText: "No canvases yet" }).evaluate(el => {
    const style = getComputedStyle(el);
    return { padding: style.padding, lineHeight: style.lineHeight };
  });
  assert.deepEqual(actual, { padding: "6px 10px 10px 34px", lineHeight: "16px" }, "empty project paragraph");
}
