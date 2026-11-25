// A real Chromium DOM (the app's Electron) for Vitest, never bundled: our own main script, temp userData, no network.
// Each load is one srcdoc iframe, the top window's direct child at about:srcdoc, as injected scripts' guards expect.
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron, type ElectronApplication, type Frame, type Page } from "playwright";
// Loaded by URL with its extension, as the other runtime modules load each other, so `node --test` can run it as is.
const { bounded, closeApp }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);

const TIMEOUT_MS = 15_000;
// Electron's graceful quit is the step most sensitive to a loaded machine; 12 s for the quit and 12 s for a forced exit
// still fit the suites' 30 s afterAll.
const CLOSE_MS = 12_000;

const MAIN_SCRIPT = `
const { app, BrowserWindow, session } = require("electron");
app.dock?.hide();
app.on("window-all-closed", () => app.quit());
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(about|data):/.test(details.url) }));
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  void win.loadURL("about:blank");
});
`;

// The binary `require("electron")` would download when missing; a test must not reach the network, so it only looks.
function electronBinary(): string {
  const packageDir = dirname(createRequire(import.meta.url).resolve("electron/package.json"));
  const pathFile = join(packageDir, "path.txt");
  const binary = existsSync(pathFile) ? join(packageDir, "dist", readFileSync(pathFile, "utf8").trim()) : null;
  if (binary === null || !existsSync(binary)) {
    throw new Error("The Electron binary is missing: run `node -e \"require('electron')\"` in app/ once (Electron has no postinstall).");
  }
  return binary;
}

interface AppProcess { process(): ChildProcess; close(): Promise<void> }

// `dir` is removed only once the process has exited; if that cannot be confirmed it stays and close throws.
// A forced close only warns once the kill is confirmed and `dir` is gone; any other unclean exit throws.
export async function closeElectron(app: AppProcess | null, dir: string, ms = CLOSE_MS): Promise<void> {
  const child = app?.process();
  let failure: unknown;
  try {
    await closeApp(app ?? undefined, ms);
  } catch (error) {
    failure = error;
  }
  if (child !== undefined && child.exitCode === null && child.signalCode === null) {
    throw new AggregateError([failure], `Electron exit unconfirmed; kept ${dir}`);
  }
  await rm(dir, { recursive: true, force: true });
  if (failure === undefined) return;
  // `killed` is set only by this process's own kill, so a SIGKILL from elsewhere still fails.
  if (child?.killed !== true || child.signalCode !== "SIGKILL") throw failure;
  console.warn("Electron close was forced after it failed; its exit is confirmed and its folder removed:", failure);
}

export interface ElectronDom {
  // Shows `html` as a new srcdoc document and resolves after its `load` handlers, with the posted messages reset.
  load(html: string): Promise<Frame>;
  // Waits two 0 ms timers in `frame` (the current document or one inside it), so that timers queued by what just ran
  // have fired, then returns every message the current document has posted so far.
  flush(frame: Frame): Promise<unknown[]>;
  close(): Promise<void>;
}

interface TopWindow {
  doanPosted: unknown[];
  doanFrame: HTMLIFrameElement | null;
}

export async function launchElectronDom(): Promise<ElectronDom> {
  const executablePath = electronBinary();
  const dir = await mkdtemp(join(tmpdir(), "doan-dom-"));
  let app: ElectronApplication | null = null;
  const close = () => closeElectron(app, dir);
  try {
    const main = join(dir, "main.cjs");
    await writeFile(main, MAIN_SCRIPT);
    app = await _electron.launch({ executablePath, args: [main, `--user-data-dir=${join(dir, "user-data")}`], timeout: TIMEOUT_MS });
    const page: Page = await app.firstWindow({ timeout: TIMEOUT_MS });
    await page.waitForLoadState("load", { timeout: TIMEOUT_MS });
    await bounded(page.evaluate(() => {
      const top = window as unknown as TopWindow;
      top.doanPosted = [];
      top.doanFrame = null;
      window.addEventListener("message", event => {
        if (top.doanFrame !== null && event.source === top.doanFrame.contentWindow) top.doanPosted.push(event.data);
      });
    }), TIMEOUT_MS, "message collector");
    let flushes = 0;
    return {
      async load(html) {
        await bounded(page.evaluate(source => new Promise<void>(resolve => {
          const top = window as unknown as TopWindow;
          top.doanFrame?.remove();
          top.doanPosted = [];
          const iframe = document.createElement("iframe");
          iframe.addEventListener("load", () => resolve(), { once: true });
          iframe.srcdoc = source;
          top.doanFrame = iframe;
          document.body.append(iframe);
        }), html), TIMEOUT_MS, "srcdoc load");
        const frame = await (await page.$("iframe"))?.contentFrame();
        if (!frame) throw new Error("The srcdoc iframe has no frame");
        return frame;
      },
      async flush(frame) {
        const marker = `doan-flush-${++flushes}`;
        let current: Frame = frame;
        while (current.parentFrame() !== null && current.parentFrame() !== page.mainFrame()) current = current.parentFrame()!;
        if (current !== frame) await bounded(frame.evaluate(() => new Promise<void>(resolve => setTimeout(() => setTimeout(resolve, 0), 0))), TIMEOUT_MS, "nested frame timers");
        // Posted by the current document after its own timers, so it arrives after that document's earlier messages.
        await bounded(current.evaluate(token => new Promise<void>(resolve => setTimeout(() => setTimeout(() => {
          parent.postMessage({ doanFlush: token }, "*");
          resolve();
        }, 0), 0)), marker), TIMEOUT_MS, "flush marker");
        await page.waitForFunction(token => (window as unknown as TopWindow).doanPosted.some(message => (message as { doanFlush?: unknown } | null)?.doanFlush === token), marker, { timeout: TIMEOUT_MS });
        return bounded(page.evaluate(() => {
          const posted = (window as unknown as TopWindow).doanPosted;
          return posted.filter(message => (message as { doanFlush?: unknown } | null)?.doanFlush === undefined);
        }), TIMEOUT_MS, "posted messages");
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Electron launch failed and its cleanup failed too");
    }
    throw error;
  }
}
