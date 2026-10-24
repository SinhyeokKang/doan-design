import type { Locator, Page } from "playwright";

export function homeRow(page: Page, root: string): Locator {
  return page.getByRole("button", { name: /^Project / }).or(page.getByRole("group", { name: /^Project / })).filter({ has: page.getByRole("button", { name: `Row menu ${root}`, exact: true }) });
}
export async function goHome(page: Page): Promise<void> {
  const home = page.getByRole("region", { name: "Home", exact: true });
  if (await home.isVisible()) return;
  await page.getByRole("button", { name: "Go Home", exact: true }).first().click();
  await home.waitFor();
}
export async function requestProject(page: Page, root: string): Promise<void> {
  await goHome(page);
  await homeRow(page, root).and(page.getByRole("button", { name: /^Project / })).click();
}
export async function enterProject(page: Page, root: string): Promise<void> {
  await requestProject(page, root);
  await page.getByRole("tree", { name: "Canvases", exact: true }).waitFor();
}
export async function removeHomeProject(page: Page, root: string): Promise<void> {
  await goHome(page);
  await homeRow(page, root).getByRole("button", { name: `Row menu ${root}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).click();
}
