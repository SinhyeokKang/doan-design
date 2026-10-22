import { app, BrowserWindow, dialog, ipcMain, Menu, session, webFrameMain, type IpcMainInvokeEvent } from "electron";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame } from "./canvasFrame";
import { canvasScriptSource } from "./canvasScript";
import { cliCommand } from "./cli";
import { startShell, type Shell } from "./shell";

// Must run before `ready`: userData is derived from the name, which makes it
// ~/Library/Application Support/doan/ (beside runtime.json, ARCHITECTURE §4).
// A `--user-data-dir` switch still wins, which is how e2e keeps off the real one.
app.setName("doan");

export type ViewCommand = "zoomIn" | "zoomOut" | "actualSize" | "fit" | "reload";

// The window only ever shows the bundled UI; canvases live in a sandboxed
// iframe whose navigation stays on the local server. Anything else a page tries
// to open or navigate to is refused.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => event.preventDefault());
  // Before the shell is up there is no token base, and every checked frame is refused.
  contents.on("will-frame-navigate", (details) => {
    if (!frameNavigationAllowed(details, shell?.tokenBase ?? "")) details.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

let win: BrowserWindow | undefined;
let shell: Shell | undefined;

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && event.sender === win.webContents && fromAppFrame(event, win);
}

const canvasScriptText = canvasScriptSource();

// Canvases get the script on every navigation, reloads included: the render
// frame can be replaced, so the frame is looked up again each time.
function injectCanvasScript(window: BrowserWindow): void {
  window.webContents.on("did-frame-navigate", (_event, _url, _code, _text, isMainFrame, processId, routingId) => {
    const base = shell?.tokenBase;
    if (isMainFrame || base === undefined) return;
    const frame = webFrameMain.fromId(processId, routingId);
    if (frame === undefined || !isCanvasFrame(frame.url, base, childOfTopFrame(frame))) return;
    // A frame gone by now either throws or rejects; its next navigation injects again.
    try {
      frame.executeJavaScript(canvasScriptText).catch(() => undefined);
    } catch {
      // Same as the rejection above.
    }
  });
}

// Page zoom and reload roles would act on the whole window; the view commands
// go to the renderer, which zooms the board and reloads only the canvas.
function setMenu(): void {
  const send = (command: ViewCommand) => () => win?.webContents.send("view-command", command);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "보기",
        submenu: [
          { label: "확대", accelerator: "CmdOrCtrl+=", click: send("zoomIn") },
          { label: "축소", accelerator: "CmdOrCtrl+-", click: send("zoomOut") },
          { label: "실제 크기", accelerator: "CmdOrCtrl+0", click: send("actualSize") },
          { label: "맞춤", accelerator: "Shift+1", click: send("fit") },
          { type: "separator" },
          { label: "캔버스 다시 읽기", accelerator: "CmdOrCtrl+R", click: send("reload") },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
}

// Without handlers Electron grants permissions to the app's own main frame.
// Canvas iframes are already stopped by Permissions Policy, so this guards the app.
function denyPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setDevicePermissionHandler(() => false);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Doan Design",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // CJS: a sandboxed preload cannot load ESM, and package.json is "type": "module".
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void window.loadURL(devUrl);
  else void window.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)));
  injectCanvasScript(window);
  window.on("closed", () => {
    if (win === window) win = undefined;
  });
  return window;
}

async function start(): Promise<void> {
  denyPermissions();
  setMenu();
  const userData = app.getPath("userData");
  // folderStore writes beside folders.json but does not create the directory.
  await mkdir(userData, { recursive: true });
  const ready = await startShell(join(userData, "folders.json"), cliCommand(), (entries) => {
    win?.webContents.send("folders", entries);
  });
  shell = ready;

  ipcMain.handle("folders:get", (event) => (fromWindow(event) ? ready.entries() : []));
  ipcMain.handle("folders:open", async (event) => {
    const window = win;
    if (!window || !fromWindow(event)) return;
    const picked = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) return;
    const refused = await ready.open(path);
    // Not awaited: the open call has finished; the message box only informs.
    if (refused !== null && !window.isDestroyed()) void dialog.showMessageBox(window, { type: "error", message: "폴더를 열 수 없음", detail: refused });
  });
  ipcMain.handle("folders:close", async (event, path: unknown) => {
    if (!fromWindow(event) || typeof path !== "string") return;
    await ready.close(path);
  });

  win = createWindow();
}

app.whenReady().then(start).catch((error: unknown) => {
  console.error("doan: failed to start", error);
  app.exit(1);
});

// One window, no dock-only state to keep: closing it ends the app and its watchers.
app.on("window-all-closed", () => app.quit());

app.on("will-quit", () => {
  void shell?.dispose();
});
