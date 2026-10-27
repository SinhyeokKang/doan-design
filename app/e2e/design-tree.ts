import type { Locator, Page } from "playwright";

export function projectTree(page: Page): Locator {
  return page.getByRole("tree", { name: "Projects and canvases", exact: true });
}

export function canvasKeySelector(path: string, root?: string): string {
  const full = path.startsWith("design/");
  const key = root && full ? `${root}\n${path}` : full ? `\n${path}` : `/${path}`;
  const quote = (key: string) => key.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ").replace(/\r/g, "\\d ");
  const prefix = root && !full ? `[data-key^="${quote(`${root}\n`)}"]` : "";
  return `${prefix}[data-key${root && full ? "" : "$"}="${quote(key)}"]`;
}

export function canvasRow(page: Page, path: string, root?: string): Locator {
  const tree = projectTree(page);
  // Several projects can remain expanded; default to the viewed project's group.
  const scope = root ? tree : tree.locator('.shell-project').filter({ has: page.locator('[aria-current="location"]') });
  const row = scope.getByRole("treeitem", { name: (path.split("/").at(-1) ?? path).replace(/\.html$/, ""), exact: true });
  return row.and(page.locator(canvasKeySelector(path, root)));
}

export async function openOverview(page: Page, project?: string): Promise<void> {
  const scope = project ? projectTree(page).getByRole("treeitem", { name: project, exact: true })
    : projectTree(page).locator('.shell-project').filter({ has: page.locator('[aria-current="location"]') });
  await scope.getByRole("button", { name: project ? `${project} menu` : / menu$/, exact: !!project }).click();
  await page.getByRole("menuitem", { name: "Overview", exact: true }).click();
}

export async function canvasTitle(page: Page): Promise<string> {
  return page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("head title").textContent().then(title => title ?? "");
}

export async function jumpFrame(page: Page, index: number): Promise<void> {
  const frame = page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("[data-doan-frame]").nth(index);
  const label = await frame.getAttribute("data-doan-title") || await frame.getAttribute("data-doan-frame");
  if (!label) throw new Error("Quick Open cannot search a frame without an id or title");
  const title = await canvasTitle(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Open", exact: true });
  await dialog.getByRole("combobox", { name: "Search canvases and frames", exact: true }).fill(label);
  // Current-root results precede other worktrees; the index disambiguates repeated IDs.
  await dialog.getByRole("option").filter({ has: page.getByText(` — ${title} › ${index + 1}`, { exact: true }) }).first().click();
}

export async function selectFrame(page: Page, index: number): Promise<void> {
  await jumpFrame(page, index);
  // The top-left inset of these fixtures is empty frame background, not a child.
  await page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("[data-doan-frame]").nth(index).click({ position: { x: 2, y: 2 } });
}
