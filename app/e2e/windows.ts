import type { BrowserWindow } from "electron";
import type { ElectronApplication, JSHandle, Page } from "playwright";

// The thumbnail capture window (design-nav) is a BrowserWindow too, so steps
// reach the app window through its page, never `BrowserWindow.getAllWindows()[0]`.
export function appWindow(app: ElectronApplication, page: Page): Promise<JSHandle<BrowserWindow>> {
  return app.browserWindow(page);
}

// `CAPTURE_WINDOW_TITLE` in src/main/thumbnailWindow.ts, which imports electron
// and so cannot be loaded here.
export const CAPTURE_WINDOW_TITLE = "doan thumbnails";

// Windows other than the capture window. Told apart by its title, which it has
// from creation: its URL stays empty until the host page loads.
export function appWindowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }, title) => BrowserWindow.getAllWindows().filter((window) => window.getTitle() !== title).length, CAPTURE_WINDOW_TITLE);
}

// Wait for the page URL, including a window still navigating from about:blank.
export async function settingsPage(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const page = app.windows().find(page => /\/settings\.html(?:[?#]|$)/.test(page.url()));
    if (page) return page;
    if (Date.now() >= deadline) throw new Error("Settings window did not load settings.html");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

// Serialized by Playwright, so this callback must stay self-contained.
export function clickMenu({ Menu }: Pick<typeof import("electron"), "Menu">, [label, window]: readonly [string, BrowserWindow]): boolean {
  const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
    for (const item of items) {
      if (item.label === label || (label === "Enter Full Screen" && item.role === "togglefullscreen")) return item;
      const child = item.submenu && find(item.submenu.items); if (child) return child;
    }
    return undefined;
  };
  const item = find(Menu.getApplicationMenu()?.items ?? []);
  if (!item?.enabled) return false;
  if (label === "Enter Full Screen") {
    if (item.role !== "togglefullscreen") throw new Error("Missing togglefullscreen menu role");
    // Shared desktops can focus another app; keep the existing direct transition.
    window.setFullScreen(true);
  } else if (item.role === "quit") Menu.sendActionToFirstResponder("terminate:");
  else item.click(undefined, window, undefined);
  return true;
}

export async function menu(app: ElectronApplication, page: Page, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (await app.evaluate(clickMenu, [label, await appWindow(app, page)] as const)) return;
    if (Date.now() >= deadline) throw new Error(`Disabled or missing menu ${label}`);
    await page.waitForTimeout(20);
  }
}
