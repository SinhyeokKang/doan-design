import type { BrowserWindow } from "electron";
import type { ElectronApplication, JSHandle, Page } from "playwright";

// The thumbnail capture window (design-nav) is a BrowserWindow too, so steps
// reach the app window through its page, never `BrowserWindow.getAllWindows()[0]`.
export function appWindow(app: ElectronApplication, page: Page): Promise<JSHandle<BrowserWindow>> {
  return app.browserWindow(page);
}

// Windows other than the capture window, which only ever shows a data: host page.
export function appWindowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => !window.webContents.getURL().startsWith("data:")).length);
}
