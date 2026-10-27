import type { ElectronApplication, Locator, Page } from "playwright";
const { menu }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);

export function homeRow(page: Page, root: string): Locator {
  return page.getByRole("button", { name: /^Project / }).or(page.getByRole("group", { name: /^Project / })).filter({ has: page.getByRole("button", { name: `Row menu ${root}`, exact: true }) });
}
export async function goHome(page: Page, app: ElectronApplication): Promise<void> {
  const home = page.getByRole("region", { name: "Home", exact: true });
  if (await home.isVisible()) return;
  await menu(app, page, "Home");
  await home.waitFor();
}
export async function requestProject(page: Page, root: string, app: ElectronApplication): Promise<void> {
  await goHome(page, app);
  await homeRow(page, root).and(page.getByRole("button", { name: /^Project / })).click();
}
export async function enterProject(page: Page, root: string, app: ElectronApplication): Promise<void> {
  await requestProject(page, root, app);
  await page.getByRole("tree", { name: "Projects and canvases", exact: true }).waitFor();
}
export async function removeHomeProject(page: Page, root: string, app: ElectronApplication): Promise<void> {
  await goHome(page, app);
  await homeRow(page, root).getByRole("button", { name: `Row menu ${root}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).click();
}
