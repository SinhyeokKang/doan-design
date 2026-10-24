import type { Locator, Page } from "playwright";

export function homeRow(page: Page, root: string): Locator {
  return page.getByRole("button", { name: `Project ${root}`, exact: true }).or(page.getByRole("group", { name: `Project ${root}`, exact: true }));
}
export async function goHome(page: Page): Promise<void> {
  const home = page.getByRole("region", { name: "Home", exact: true });
  if (await home.isVisible()) return;
  await page.getByRole("button", { name: "Go Home", exact: true }).first().click();
  await home.waitFor();
}
export async function requestProject(page: Page, root: string): Promise<void> {
  await goHome(page);
  await page.getByRole("button", { name: `Project ${root}`, exact: true }).click();
}
export async function enterProject(page: Page, root: string): Promise<void> {
  const tree = page.getByRole("treeitem", { name: root.split("/").at(-1) ?? root, exact: true });
  if (await tree.isVisible()) return;
  await requestProject(page, root);
  await tree.waitFor();
}
export async function removeHomeProject(page: Page, root: string): Promise<void> {
  await goHome(page);
  await homeRow(page, root).getByRole("button", { name: `Row menu ${root}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).click();
}
