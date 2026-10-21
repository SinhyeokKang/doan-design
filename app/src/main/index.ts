import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliCommand } from "./cli";
import { startShell, type Shell } from "./shell";

// Must run before `ready`: userData is derived from the name, which makes it
// ~/Library/Application Support/doan/ (beside runtime.json, ARCHITECTURE §4).
// A `--user-data-dir` switch still wins, which is how e2e keeps off the real one.
app.setName("doan");

// The window only ever shows the bundled UI; canvases get their own iframe later
// (feature 5). Anything else a page tries to open or navigate to is refused.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

let win: BrowserWindow | undefined;
let shell: Shell | undefined;

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && event.sender === win.webContents;
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
  window.on("closed", () => {
    if (win === window) win = undefined;
  });
  return window;
}

async function start(): Promise<void> {
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
