// Test support, never bundled: a real Chromium DOM for Vitest. The scripts Doan injects into canvas documents read
// what only a browser's HTML parser and event dispatch decide (character references, attribute name case, the first of
// a repeated attribute, `<template/>`, shadow retargeting, `defaultPrevented` after a timer), so their drift tests run
// against the shared fixtures in the app's own Electron, the engine the prototype window ships, instead of a fake DOM.
//
// One launch serves a whole test file: each `load` replaces a single srcdoc iframe in a hidden window, and the
// messages that iframe posts to its parent (the top page) are collected. A srcdoc iframe is the direct child of the
// top window, at `about:srcdoc`, as the scripts' own guards expect of a canvas run. The Electron main script is our
// own minimal one, not Doan's, with a temporary user data folder and every network request cancelled.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron, type ElectronApplication, type Frame, type Page } from "playwright";

const TIMEOUT_MS = 15_000;

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
  const close = async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      if (app !== null) await Promise.race([app.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Electron did not close")), TIMEOUT_MS); })]);
    } catch {
      app?.process().kill("SIGKILL");
    } finally {
      // A pending timer would hold the test worker open after a normal close.
      clearTimeout(timer);
      await rm(dir, { recursive: true, force: true });
    }
  };
  try {
    const main = join(dir, "main.cjs");
    await writeFile(main, MAIN_SCRIPT);
    app = await _electron.launch({ executablePath, args: [main, `--user-data-dir=${join(dir, "user-data")}`], timeout: TIMEOUT_MS });
    const page: Page = await app.firstWindow({ timeout: TIMEOUT_MS });
    await page.waitForLoadState("load", { timeout: TIMEOUT_MS });
    await page.evaluate(() => {
      const top = window as unknown as TopWindow;
      top.doanPosted = [];
      top.doanFrame = null;
      window.addEventListener("message", event => {
        if (top.doanFrame !== null && event.source === top.doanFrame.contentWindow) top.doanPosted.push(event.data);
      });
    });
    let flushes = 0;
    return {
      async load(html) {
        await page.evaluate(source => new Promise<void>(resolve => {
          const top = window as unknown as TopWindow;
          top.doanFrame?.remove();
          top.doanPosted = [];
          const iframe = document.createElement("iframe");
          iframe.addEventListener("load", () => resolve(), { once: true });
          iframe.srcdoc = source;
          top.doanFrame = iframe;
          document.body.append(iframe);
        }), html);
        const frame = await (await page.$("iframe"))?.contentFrame();
        if (!frame) throw new Error("The srcdoc iframe has no frame");
        return frame;
      },
      async flush(frame) {
        const marker = `doan-flush-${++flushes}`;
        let current: Frame = frame;
        while (current.parentFrame() !== null && current.parentFrame() !== page.mainFrame()) current = current.parentFrame()!;
        if (current !== frame) await frame.evaluate(() => new Promise<void>(resolve => setTimeout(() => setTimeout(resolve, 0), 0)));
        // Posted by the current document after its own timers, so it arrives after that document's earlier messages.
        await current.evaluate(token => new Promise<void>(resolve => setTimeout(() => setTimeout(() => {
          parent.postMessage({ doanFlush: token }, "*");
          resolve();
        }, 0), 0)), marker);
        await page.waitForFunction(token => (window as unknown as TopWindow).doanPosted.some(message => (message as { doanFlush?: unknown } | null)?.doanFlush === token), marker, { timeout: TIMEOUT_MS });
        return page.evaluate(token => {
          const posted = (window as unknown as TopWindow).doanPosted;
          return posted.filter(message => (message as { doanFlush?: unknown } | null)?.doanFlush === undefined);
        }, marker);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
