// The single prototype window (PrototypeHost for prototype/controller.ts). It lives outside the main window's
// lifecycle: main-screen moves and hiding the main window never reach it, ⌘W and the native close close only it, and
// Quit destroys it.
//
// It runs in its own memory-only session, so a hung canvas renderer killed on a timeout is never shared with the
// main window's canvas or the host page. Its debugger only injects the prototype script; it never feeds
// DocumentBindings or the read proof, so viewing a prototype never marks a canvas read.
import { app, BrowserWindow, screen, session, webFrameMain, type BaseWindow, type IpcMainInvokeEvent, type Session } from "electron";
import { fileURLToPath } from "node:url";
import { childOfTopFrame, fromAppFrame } from "./canvasFrame";
import { createPrototypeController, type PrototypeController, type PrototypeHost } from "./prototype/controller";
import { fitPrototypeWindow, prototypeIframeBox, PROTOTYPE_CHROME, PROTOTYPE_WINDOW_MIN_WIDTH } from "./prototype/fit";
import { PROTOTYPE_CHANNELS } from "./prototype/ipc";
import { prototypeFrameNavigationAllowed } from "./prototypeFrame";
import { prototypeScriptSource } from "./prototypeScript";
import type { FolderEntry } from "./view";

// No `persist:` prefix: the session is in memory only and nothing a prototype stores outlives the app.
export const PROTOTYPE_PARTITION = "doan-prototype";
// Chromium's net::ERR_ABORTED: a navigation the gate (or a newer one) cancelled, not a document that failed to read.
const ERR_ABORTED = -3;
// Runs whose iframe may still be in the window; older generations are long gone.
const KEPT_RUNS = 8;

export interface PrototypeWindowDeps {
  entries(): readonly FolderEntry[];
  // The main window, for the display a new window opens on and to keep its renderer out of a kill.
  mainWindow(): BrowserWindow | undefined;
  // The prototype window closed for any reason.
  closed(): void;
  // The same permission, device and download denials as the default session.
  denyPermissions(target: Session): void;
}

export interface PrototypeWindow {
  controller: PrototypeController;
  // The window's own main frame, for the sender guard; its iframes and other windows are not.
  owns(event: IpcMainInvokeEvent): boolean;
  ownsWindow(window: BaseWindow | undefined): boolean;
  close(): void;
  destroyForQuit(): void;
}

function sameUrl(a: string, b: string): boolean {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
}

export function createPrototypeWindow(deps: PrototypeWindowDeps): PrototypeWindow {
  let window: BrowserWindow | undefined;
  // Set from the native `close` until `closed`: the transition's destroy must not destroy a window already closing.
  let closing = false;
  let sessionReady = false;
  // The latest `load`: the navigation gate's run URL and the run the next attached canvas target gets the script for.
  let armed: { gen: number; url: string; frame: string } | null = null;
  const runs = new Map<number, string>();

  const live = (): BrowserWindow | undefined => window !== undefined && !window.isDestroyed() && !window.webContents.isDestroyed() ? window : undefined;

  const prototypeSession = (): string => {
    if (!sessionReady) {
      deps.denyPermissions(session.fromPartition(PROTOTYPE_PARTITION));
      sessionReady = true;
    }
    return PROTOTYPE_PARTITION;
  };

  // The window's debugger auto-attaches each canvas iframe paused, adds the armed run's script before any of the
  // document's own scripts and always resumes it. Nothing here is awaited by a run: a hung canvas process can block
  // these commands forever, and the host renderer's own timer ends that run.
  function injectRuns(target: BrowserWindow): void {
    const dbg = target.webContents.debugger;
    try { dbg.attach("1.3"); } catch (error) {
      console.error("doan: the prototype window's debugger did not attach; runs will time out", error);
      return;
    }
    dbg.on("message", (_event, method, params: { sessionId?: string; targetInfo?: { type?: string } }, sessionId) => {
      if (method !== "Target.attachedToTarget" || sessionId || typeof params.sessionId !== "string") return;
      const child = params.sessionId;
      const run = armed;
      void (async () => {
        try {
          if (params.targetInfo?.type === "iframe" && run !== null) {
            // Without Page.enable the added script never ran (PoC).
            await dbg.sendCommand("Page.enable", {}, child);
            await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: prototypeScriptSource(run.frame, run.gen, run.url) }, child);
          }
        } catch {
          // A target gone mid-setup; the run times out in the host if it was the current one.
        } finally {
          await dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, child).catch(() => undefined);
        }
      })();
    });
    dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
      .catch((error: unknown) => console.error("doan: prototype injection did not start", error));
  }

  const directChild = (processId: number, routingId: number): boolean => {
    try { return childOfTopFrame(webFrameMain.fromId(processId, routingId)); } catch { return false; }
  };

  function create(size: { width: number; height: number }): void {
    const main = deps.mainWindow();
    const display = main !== undefined && !main.isDestroyed() ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay();
    const bounds = fitPrototypeWindow(size, display.workArea);
    const created = new BrowserWindow({
      show: false,
      ...bounds,
      useContentSize: true,
      // A content-size constraint under useContentSize.
      minWidth: PROTOTYPE_WINDOW_MIN_WIDTH,
      // The main window's shell: the traffic lights centred on the 56px header, over the sidebar glass.
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 21 },
      vibrancy: "sidebar",
      visualEffectState: "followWindow",
      // The page's <title> replaces this once it loads; R names the window after the frame.
      title: "Prototype",
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: prototypeSession(),
        preload: fileURLToPath(new URL("../preload/prototype.cjs", import.meta.url)),
      },
    });
    window = created;
    closing = false;
    created.setContentBounds(bounds);
    injectRuns(created);
    const contents = created.webContents;
    // On top of the app-wide gates (web-contents-created): the run's iframe may only be (re)loaded by the host, and
    // only to the current run's URL; a nested iframe keeps the board's rule.
    contents.on("will-frame-navigate", details => {
      if (!prototypeFrameNavigationAllowed(details, armed?.url ?? null)) details.preventDefault();
    });
    contents.on("did-fail-load", (_event, code, description, url, isMainFrame, processId, routingId) => {
      const run = armed;
      if (isMainFrame || code === ERR_ABORTED || run === null || !sameUrl(url, run.url) || !directChild(processId, routingId)) return;
      controller.readFailed(run.gen, `${description} (${code})`);
    });
    contents.on("did-frame-navigate", (_event, url, code, status, isMainFrame, processId, routingId) => {
      const run = armed;
      if (isMainFrame || code < 400 || run === null || !sameUrl(url, run.url) || !directChild(processId, routingId)) return;
      controller.readFailed(run.gen, status ? `HTTP ${code} ${status}` : `HTTP ${code}`);
    });
    created.on("close", () => {
      if (window !== created) return;
      closing = true;
      controller.windowClosing();
    });
    created.on("closed", () => {
      // A Play between this window's `close` and `closed` already made the next window; that one keeps its run.
      if (window !== created) return;
      // A window that went without `close` (destroyed) still ends its state.
      controller.windowClosing();
      window = undefined;
      closing = false;
      armed = null;
      runs.clear();
      deps.closed();
    });
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && devUrl) void created.loadURL(new URL("prototype.html", devUrl).toString());
    else void created.loadFile(fileURLToPath(new URL("../renderer/prototype.html", import.meta.url)));
    created.show();
    created.focus();
  }

  const host: PrototypeHost = {
    create,
    fit(size) {
      const target = live();
      if (target === undefined) return;
      const area = screen.getDisplayMatching(target.getBounds()).workArea;
      target.setContentBounds(fitPrototypeWindow(size, area, target.getContentBounds()));
    },
    activate() {
      const target = live();
      if (target === undefined) return;
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
    },
    load(run) {
      armed = run;
      runs.set(run.gen, run.url);
      for (const gen of runs.keys()) if (gen <= run.gen - KEPT_RUNS) runs.delete(gen);
    },
    // A hung renderer would be reused by the next iframe, so the run's canvas frame process goes. Never the host
    // page's or the main window's, whatever the frame list says.
    kill(gen) {
      const target = live();
      const url = runs.get(gen);
      if (target === undefined || url === undefined) return;
      const spared = new Set([target.webContents.getOSProcessId()]);
      const main = deps.mainWindow();
      if (main !== undefined && !main.isDestroyed() && !main.webContents.isDestroyed()) spared.add(main.webContents.getOSProcessId());
      for (const frame of target.webContents.mainFrame.frames) {
        try {
          const pid = frame.osProcessId;
          if (pid > 0 && !spared.has(pid) && sameUrl(frame.url, url)) process.kill(pid, "SIGKILL");
        } catch {
          // The frame or its process is already gone.
        }
      }
    },
    destroy() {
      const target = live();
      if (target !== undefined && !closing) target.destroy();
    },
    sendView(view) {
      live()?.webContents.send(PROTOTYPE_CHANNELS.changed, view);
    },
    async capture(markWidth) {
      const target = live();
      if (target === undefined) return null;
      const [width = 0, height = 0] = target.getContentSize();
      const box = prototypeIframeBox(width - 2 * PROTOTYPE_CHROME.side, markWidth);
      const rect = { x: PROTOTYPE_CHROME.side + box.x, y: PROTOTYPE_CHROME.header, width: box.width, height: height - PROTOTYPE_CHROME.header - PROTOTYPE_CHROME.bottom };
      if (rect.width <= 0 || rect.height <= 0) return null;
      const image = await target.webContents.capturePage(rect);
      return image.isEmpty() ? null : new Uint8Array(image.toPNG());
    },
    sendSnapshot(snapshot) {
      live()?.webContents.send(PROTOTYPE_CHANNELS.snapshot, snapshot);
    },
  };

  const controller = createPrototypeController(host, deps.entries);

  return {
    controller,
    owns(event) {
      const target = live();
      return target !== undefined && fromAppFrame(event, target);
    },
    ownsWindow(candidate) {
      return candidate !== undefined && candidate === window;
    },
    close() {
      live()?.close();
    },
    destroyForQuit() {
      live()?.destroy();
    },
  };
}
