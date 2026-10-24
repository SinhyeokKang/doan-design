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
