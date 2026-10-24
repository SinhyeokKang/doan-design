import type { Locator, Page } from "playwright";

export function canvasRow(page: Page, path: string): Locator {
  return page.getByRole("tree", { name: "Canvases", exact: true }).getByRole("treeitem").filter({ has: page.getByText(path.split("/").at(-1) ?? path, { exact: true }) });
}

export function frameRows(page: Page): Locator {
  return page.getByRole("tree", { name: "Canvases", exact: true }).getByRole("treeitem").filter({ has: page.locator('button[aria-label^="Select "]:enabled') });
}
