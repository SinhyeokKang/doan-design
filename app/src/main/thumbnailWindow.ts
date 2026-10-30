import { BrowserWindow, webFrameMain, type FrameCreatedDetails } from "electron";

// Measured: `show: false` captured every case `offscreen` did, with
// less memory, so the window is an ordinary hidden one.
export const THUMBNAIL_WIDTH = 480;
// The iframe's `load` + 500 ms, or what is painted at 8 s when `load` never
// ends (design-nav orch decision). Only the whole-job limit is a failure.
export const SETTLE_MS = 500;
export const LOAD_LIMIT_MS = 8000;
export const JOB_LIMIT_MS = 20_000;
// Tells the capture window apart from app windows (runtime/windows.ts) from the
// moment it exists, before its host page has loaded.
export const CAPTURE_WINDOW_TITLE = "Doan thumbnails";

// No script runs in the host but main's; the canvas iframe is the only frame
// it may hold, and only from the local server.
const HOST_CSP = "default-src 'none'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline'";

export function hostPage(width: number, height: number): string {
  const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${HOST_CSP}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:${width}px;height:${height}px}</style>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Resolves to the iframe's rectangle once it settled. A new iframe each time:
// a reused one can keep the previous document's state (POSTMORTEM "fresh-iframe").
export function frameScript(url: string): string {
  return `new Promise((resolve) => {
  const frame = document.createElement("iframe");
  frame.sandbox = "allow-scripts";
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const r = frame.getBoundingClientRect();
    resolve({ x: r.x, y: r.y, width: r.width, height: r.height });
  };
  setTimeout(finish, ${LOAD_LIMIT_MS});
  frame.onload = () => setTimeout(finish, ${SETTLE_MS});
  frame.src = ${JSON.stringify(url)};
  document.body.append(frame);
})`;
}

export interface Capturer {
  // A 480 px wide PNG of the canvas's first 16:10 screen, or null when it
  // could not be taken ("Preview unavailable").
  capture(url: string, width: number): Promise<Buffer | null>;
  // For good: later captures fail without opening a window.
  close(): void;
}

export function createWindowCapturer(jobLimitMs = JOB_LIMIT_MS): Capturer {
  let window: BrowserWindow | undefined;
  // For good: quit closes the window before will-quit, and a capture window
  // opened after that keeps the app from quitting.
  let closed = false;

  const open = (): BrowserWindow => {
    if (window && !window.isDestroyed()) return window;
    // No preload, so the page has no IPC to send; the default session keeps
    // the app's permission and download refusals, and the app-wide
    // `web-contents-created` handlers gate its navigation like the app
    // window's (index.ts).
    const created = new BrowserWindow({
      show: false,
      title: CAPTURE_WINDOW_TITLE,
      useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    created.on("page-title-updated", (event) => event.preventDefault());
    window = created;
    return created;
  };

  const discard = () => {
    if (window && !window.isDestroyed()) window.destroy();
    window = undefined;
  };

  const run = async (url: string, width: number, job: { active: boolean; cleanup: () => void }): Promise<Buffer | null> => {
    const target = open();
    const current = () => job.active && !closed && !target.isDestroyed();
    const height = Math.round((width * 10) / 16);
    target.setContentSize(width, height);
    await target.loadURL(hostPage(width, height));
    if (!current()) return null;
    const contents = target.webContents;
    let outerFrameId: number | undefined;
    let frameFailed = false;
    // Bind the new host's direct child, not its URL: nested frames can use
    // the same URL, and redirects can replace a frame's renderer process.
    const created = (_event: Electron.Event, { frame }: FrameCreatedDetails) => {
      if (current() && outerFrameId === undefined && frame?.parent === contents.mainFrame) outerFrameId = frame.frameTreeNodeId;
    };
    const failed = (isMainFrame: boolean, processId: number, routingId: number) => {
      if (!current() || isMainFrame || outerFrameId === undefined) return;
      const frame = webFrameMain.fromId(processId, routingId);
      if (frame?.frameTreeNodeId === outerFrameId) frameFailed = true;
    };
    const loadFailed = (_event: Electron.Event, _code: number, _text: string, _url: string, main: boolean, process: number, routing: number) => failed(main, process, routing);
    const navigated = (_event: Electron.Event, _url: string, code: number, _status: string, main: boolean, process: number, routing: number) => {
      if (code >= 400) failed(main, process, routing);
    };
    contents.on("frame-created", created);
    contents.on("did-fail-load", loadFailed);
    contents.on("did-frame-navigate", navigated);
    job.cleanup = () => {
      contents.off("frame-created", created);
      contents.off("did-fail-load", loadFailed);
      contents.off("did-frame-navigate", navigated);
    };
    const rect: unknown = await contents.executeJavaScript(frameScript(url));
    if (!current() || frameFailed || !isRect(rect)) return null;
    const image = await contents.capturePage(rect);
    if (!current() || frameFailed || image.isEmpty()) return null;
    return image.resize({ width: THUMBNAIL_WIDTH, quality: "best" }).toPNG();
  };

  return {
    async capture(url, width) {
      if (closed) return null;
      const job = { active: true, cleanup: () => {} };
      let timer: NodeJS.Timeout | undefined;
      const limit = new Promise<"limit">((resolve) => { timer = setTimeout(() => resolve("limit"), jobLimitMs); });
      try {
        const result = await Promise.race([run(url, width, job), limit]);
        if (closed) return null;
        if (result !== "limit") return result;
        // A job past its limit may still hold the page; the next starts clean.
        discard();
        return null;
      } catch {
        discard();
        return null;
      } finally {
        job.active = false;
        job.cleanup();
        clearTimeout(timer);
      }
    },
    close() {
      closed = true;
      discard();
    },
  };
}

interface Rect { x: number; y: number; width: number; height: number }

function isRect(value: unknown): value is Rect {
  if (typeof value !== "object" || value === null) return false;
  const [x, y, width, height]: unknown[] = ["x", "y", "width", "height"].map((key) => Reflect.get(value, key));
  return typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof height === "number" &&
    Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height);
}
