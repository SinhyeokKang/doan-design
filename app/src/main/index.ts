import { createMachine, needsOnboarding, markClosed, PATH_LINE, type MachineState } from "./onboarding/machine";
import { firstSentence } from "./onboarding/states";
import { createCommentsService } from "./comments/service";
import { readCommentBytes, withCommentAppend } from "./comments/files";
import { readAuthor } from "./comments/author";
import { DocumentBindings, stableDiskHash } from "./comments/document";
import { createTransitionGuard } from "./comments/transitions";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell as electronShell, webFrameMain, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Selection } from "../formats/types";
import { validateSelection } from "../formats/validate";
import { childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame } from "./canvasFrame";
import { canvasScriptSource } from "./canvasScript";
import { createAddFlow, droppedPaths, type AddFlow } from "./addProjects";
import { cliCommand, runLs } from "./cli";
import { folderState } from "./folderState";
import type { InspectResult } from "./inspect";
import { createInspector, parseInspectRequest, type Inspector } from "./inspector";
import { startRuntime, type Runtime } from "./runtime";
import { menuState, type Screen } from "./menuState";
import { removalLabel } from "./removal";
import { startShell, type Shell, type ProjectInitResult } from "./shell";
import { createThrottle } from "./throttle";

// Must run before `ready`: userData is derived from the name, which makes it
// ~/Library/Application Support/doan/ (beside runtime.json, ARCHITECTURE §4).
// A `--user-data-dir` switch still wins, which is how e2e keeps off the real one.
app.setName("doan");

export interface ProjectInitRequest { root: string; choiceId: string | null }
export type TokenCssChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable"; message: string };

export type ViewCommand = "zoomIn" | "zoomOut" | "actualSize" | "fit" | "reload";
// Menu items whose work belongs to the renderer's screen state.
export type MenuCommand = "home" | "undoRemove";
// What the renderer reports so main can enable menu items (design 'Menus').
export interface MenuInputs { screen: Screen; modal: boolean; toast: boolean }
export type RemoveResult = { kind: "removed"; removalId: string; label: string } | { kind: "cancelled" } | { kind: "unavailable" };
export type RestoreResult = { kind: "restored"; paths: string[] } | { kind: "unavailable" };
export type LocateResult = { kind: "located"; root: string } | { kind: "refused"; message: string } | { kind: "cancelled" } | { kind: "unavailable" };

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
let runtime: Runtime | undefined;
let inspector: Inspector | undefined;
// One selection app-wide (select-inspect R1); the socket answers it only for
// its own project. Memory only, never written to disk.
let selection: Selection | null = null;
const documents = new DocumentBindings();
const transitionGuard = createTransitionGuard(request => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("comments:transition", request);
});
let wizardSession: string | null = null;
let machine: ReturnType<typeof createMachine> | undefined;
export type OnboardingOpen = { session: string };
export type OnboardingRead = { kind: "state"; session: string; state: MachineState } | { kind: "stale" };
function openWizard(): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  showWindow(win);
  if (wizardSession !== null || machine?.isBusy()) return;
  machine?.cancelConfirmation();
  wizardSession = randomUUID();
  win.webContents.send("onboarding:open", { session: wizardSession });
}
let quitting = false;
let cancelPendingHide = () => {};
let addFlow: AddFlow | undefined;
// The app always starts on Home (design 'Memory model').
const HOME: MenuInputs = { screen: "home", modal: false, toast: false };
let menuInputs: MenuInputs = HOME;
// Only the newest removal can be undone; main keeps what Undo needs.
let removal: { id: string; paths: string[]; indexes: number[] } | null = null;
const FULLSCREEN_EXIT_WAIT_MS = 2000;

function showWindow(window: BrowserWindow): void {
  cancelPendingHide();
  window.show();
}

function isOpen(root: string): boolean {
  return shell?.entries().some((entry) => entry.path === root) ?? false;
}

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args);
}

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && !win.isDestroyed() && fromAppFrame(event, win);
}

const canvasScriptText = canvasScriptSource();

// Canvases get the script on every navigation, reloads included: the render
// frame can be replaced, so the frame is looked up again each time.
function injectCanvasScript(window: BrowserWindow): void {
  window.webContents.on("did-frame-navigate", (_event, _url, _code, _text, isMainFrame, processId, routingId) => {
    const base = shell?.tokenBase;
    if (isMainFrame || base === undefined) return;
    // A frame gone by now throws on access or rejects the script; its next
    // navigation injects again.
    try {
      const frame = webFrameMain.fromId(processId, routingId);
      if (frame === undefined || !isCanvasFrame(frame.url, base, childOfTopFrame(frame))) return;
      frame.executeJavaScript(canvasScriptText).catch(() => undefined);
    } catch {
      return;
    }
  });
}

// Page zoom and reload roles would act on the whole window; the view commands
// go to the renderer, which zooms the board and reloads only the canvas.
// The menu is rebuilt whenever its enablement changes; Undo Remove takes the
// system Undo's place (and ⌘Z) only while the removal toast is up.
function setMenu(): void {
  const view = (command: ViewCommand) => () => send("view-command", command);
  const command = (name: MenuCommand) => () => send("menu-command", name);
  const enabled = menuState(menuInputs.screen, menuInputs.modal, menuInputs.toast);
  const undo: MenuItemConstructorOptions = enabled.undoRemove
    ? { label: "Undo Remove", accelerator: "CmdOrCtrl+Z", click: command("undoRemove") }
    : { role: "undo" };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "doan", submenu: [
        { role: "about" },
        { label: "Set Up doan…", click: openWizard },
        { type: "separator" }, { role: "services" }, { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" }, { role: "quit" },
      ] },
      {
        label: "File",
        submenu: [
          { label: "Add Project…", accelerator: "CmdOrCtrl+O", enabled: enabled.addProject, click: () => { void addFromDialog(); } },
          { type: "separator" },
          { label: "Close Window", accelerator: "CmdOrCtrl+W", click: () => { if (win && !win.isDestroyed()) win.close(); } },
        ],
      },
      // The `editMenu` role's items, spelled out so Undo can be swapped.
      {
        label: "Edit",
        submenu: [
          undo, { role: "redo" }, { type: "separator" },
          { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" },
          { type: "separator" },
          { label: "Speech", submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Zoom In", accelerator: "CmdOrCtrl+=", enabled: enabled.canvasView, click: view("zoomIn") },
          { label: "Zoom Out", accelerator: "CmdOrCtrl+-", enabled: enabled.canvasView, click: view("zoomOut") },
          { label: "Actual Size", accelerator: "CmdOrCtrl+0", enabled: enabled.canvasView, click: view("actualSize") },
          // A bare Shift+1 would also run fit while typing "!" in an input.
          { label: "Fit", accelerator: "CmdOrCtrl+1", enabled: enabled.canvasView, click: view("fit") },
          { type: "separator" },
          { label: "Reload Canvas", accelerator: "CmdOrCtrl+R", enabled: enabled.canvasView, click: view("reload") },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      // Finder's place for Home; Quick Open joins it later (design-nav).
      { label: "Go", submenu: [{ label: "Home", accelerator: "Shift+CmdOrCtrl+H", enabled: enabled.home, click: command("home") }] },
      { role: "windowMenu" },
    ]),
  );
}

function setMenuInputs(next: MenuInputs): void {
  if (next.screen === menuInputs.screen && next.modal === menuInputs.modal && next.toast === menuInputs.toast) return;
  menuInputs = next;
  setMenu();
}

function parseMenuInputs(value: unknown): MenuInputs | null {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 3 ||
    !("screen" in value) || !("modal" in value) || !("toast" in value)) return null;
  const { screen, modal, toast } = value;
  if ((screen !== "home" && screen !== "workspace" && screen !== "canvas") || typeof modal !== "boolean" || typeof toast !== "boolean") return null;
  return { screen, modal, toast };
}

// Without handlers Electron grants permissions to the app's own main frame.
// Canvas iframes are already stopped by Permissions Policy, so this guards the app.
function denyPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setDevicePermissionHandler(() => false);
  // Chromium turns an ⌥-clicked canvas link into a download, and the iframe
  // sandbox without `allow-downloads` does not stop it (select-inspect P6).
  session.defaultSession.on("will-download", (event) => event.preventDefault());
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1238,
    height: 780,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    // Align with the 40px top bar, 12px horizontal padding, and 52px traffic space before the logo.
    trafficLightPosition: { x: 12, y: 14 },
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
  inspector = createInspector(window.webContents.debugger, () => shell?.tokenBase ?? "", documents);
  // A reloaded or crashed renderer has lost the selection it reported; an
  // in-page navigation is not a new document, so it does not count.
  // A new renderer starts on Home again with no toast up.
  window.webContents.on("render-process-gone", () => { selection = null; documents.clear(); transitionGuard.reset(); setMenuInputs(HOME); });
  window.webContents.on("did-navigate", () => { selection = null; documents.clear(); transitionGuard.reset(); setMenuInputs(HOME); });
  // `.git/HEAD` is not watched, so a branch switched elsewhere shows when the
  // human comes back to the window.
  const reread = createThrottle(60_000);
  window.on("focus", () => { if (reread()) shell?.rereadAll(); });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    cancelPendingHide();
    if (window.isFullScreen()) {
      // macOS cannot hide until the transition ends; a later open cancels this close.
      const hide = () => { cancelPendingHide(); if (!window.isDestroyed()) window.hide(); };
      const timeout = setTimeout(() => cancelPendingHide(), FULLSCREEN_EXIT_WAIT_MS);
      cancelPendingHide = () => {
        clearTimeout(timeout);
        window.removeListener("leave-full-screen", hide);
        cancelPendingHide = () => {};
      };
      window.once("leave-full-screen", hide);
      window.setFullScreen(false);
    } else window.hide();
  });
  window.on("closed", () => {
    cancelPendingHide();
    if (win === window) win = undefined;
  });
  return window;
}

// Resolves to the stored root so the setup wizard can show the project it opened.
async function openProject(): Promise<string | null> {
  const window = win;
  const ready = shell;
  if (!window || window.isDestroyed() || !ready) return null;
  showWindow(window);
  const picked = await dialog.showOpenDialog(window, { title: "Open Project…", properties: ["openDirectory"] });
  const path = picked.filePaths[0];
  if (picked.canceled || path === undefined) return null;
  const opened = await ready.open(path);
  if ("root" in opened) return opened.root;
  // Not awaited: the open call has finished; the message box only informs.
  if (!window.isDestroyed()) void dialog.showMessageBox(window, { type: "error", message: "Can’t open project", detail: opened.refused });
  return null;
}

// Add Project…: several folders at once. A hidden window is shown first, as
// for every other way of reaching the window.
async function addFromDialog(): Promise<void> {
  const window = win;
  const flow = addFlow;
  if (!window || window.isDestroyed() || !flow) return;
  showWindow(window);
  const picked = await dialog.showOpenDialog(window, { title: "Add Project…", properties: ["openDirectory", "multiSelections"] });
  if (picked.canceled || picked.filePaths.length === 0) return;
  send("folders:add-outcome", await flow.add(picked.filePaths));
}

function storedPath(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("path" in value) || typeof value.path !== "string") return null;
  const path = value.path;
  return shell?.entries().some((entry) => entry.path === path) ? path : null;
}

async function start(): Promise<void> {
  denyPermissions();
  setMenu();
  const userData = app.getPath("userData");
  // folderStore writes beside folders.json but does not create the directory.
  await mkdir(userData, { recursive: true });
  const invalidate = (root: string) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("comments:invalidated", { root });
  };
  const choices = new Map<string, { id: string; path: string; epoch: number }>();
  const ready = await startShell(join(userData, "folders.json"), cliCommand(process.env, app.isPackaged, process.resourcesPath), (entries, focus) => {
    for (const root of choices.keys()) {
      if (!entries.some(entry => entry.path === root && entry.kind === "uninitialized")) choices.delete(root);
    }
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("folders", entries, focus);
  }, { response: record => documents.response(record), invalidate });
  shell = ready;
  const comments = createCommentsService({
    authorize: identity => ready.authorizeComments(identity),
    epoch: root => ready.epoch(root),
    currentHash: identity => stableDiskHash(identity.root, identity.path),
    author: readAuthor, read: readCommentBytes, append: withCommentAppend,
    async document(identity, scope, url) {
      if (!inspector) throw new Error("Canvas document is unavailable.");
      const target: import("../formats/types").Target = {};
      if (scope === "selection") {
        if (!selection || selection.root !== identity.root || selection.canvas.path !== identity.path || selection.canvas.id !== identity.canvas || (!selection.frame && !selection.element)) throw new Error("No matching selection.");
        if (selection.frame) target.frame = selection.frame.id;
        if (selection.element) target.element = selection.element;
      }
      return inspector.commentDocument(identity, url, target);
    },
    async validateDocument(identity, origin, url) {
      if (!inspector || !await inspector.documentCurrent(identity, url, origin)) return false;
      if (await stableDiskHash(identity.root, identity.path) !== origin.hash) return false;
      return inspector.documentCurrent(identity, url, origin);
    },
    clipboard: value => clipboard.writeText(value), invalidated: invalidate,
  });
  const commentMethods: (keyof typeof comments)[] = ["list", "begin", "mutate", "status", "author", "copy"];
  for (const method of commentMethods) {
    ipcMain.handle(`comments:${method}`, (event, value: unknown) => {
      if (!fromWindow(event)) return { ok: false, identity: null, error: "The request was refused." };
      return comments[method](String(event.sender.id), value);
    });
  }
  ipcMain.handle("comments:guard", (event, value: unknown) => {
    if (fromWindow(event) && typeof value === "boolean") transitionGuard.set(value);
  });
  ipcMain.handle("comments:transition-answer", (event, value: unknown) => {
    if (fromWindow(event)) transitionGuard.answer(value);
  });
  // `doan active` is an extra; the app works without it, and the CLI then
  // reports that the app is not running.
  runtime = await startRuntime(userData, { isOpen, selection: () => selection }).catch((error: unknown) => {
    console.error("doan: cannot start the runtime socket", error);
    return undefined;
  });

  const unavailable = { kind: "unavailable" as const, message: "The project setup request is no longer valid." };
  const canSetUp = (root: string) => ready.entries().some(entry => entry.path === root && entry.kind === "uninitialized");
  ipcMain.handle("project:choose-token-css", async (event, value: unknown): Promise<TokenCssChoice> => {
    if (!fromWindow(event) || !win || typeof value !== "object" || value === null ||
      Object.keys(value).length !== 1 || !("root" in value) || typeof value.root !== "string" || !canSetUp(value.root)) return unavailable;
    const root = value.root;
    const epoch = ready.epoch(root);
    if (epoch === null) return unavailable;
    const picked = await dialog.showOpenDialog(win, { properties: ["openFile"], defaultPath: root, filters: [{ name: "CSS", extensions: ["css"] }] });
    if (!fromWindow(event) || !canSetUp(root) || ready.epoch(root) !== epoch) return unavailable;
    if (picked.canceled || !picked.filePaths[0]) return { kind: "cancelled" };
    const choice = { id: randomUUID(), path: picked.filePaths[0], epoch };
    choices.set(root, choice);
    return { kind: "selected", choiceId: choice.id, path: choice.path };
  });
  ipcMain.handle("project:init", async (event, value: unknown): Promise<ProjectInitResult> => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 2 ||
      !("root" in value) || typeof value.root !== "string" || !("choiceId" in value) ||
      (value.choiceId !== null && typeof value.choiceId !== "string") || !canSetUp(value.root)) return unavailable;
    let tokenCss: string | null = null;
    if (value.choiceId !== null) {
      const choice = choices.get(value.root);
      if (!choice || choice.id !== value.choiceId || choice.epoch !== ready.epoch(value.root)) return unavailable;
      tokenCss = choice.path;
    }
    return ready.initialize(value.root, tokenCss);
  });
  ipcMain.handle("folders:get", (event) => (fromWindow(event) ? ready.entries() : []));
  const cli = cliCommand(process.env, app.isPackaged, process.resourcesPath);
  const flow = createAddFlow({
    ls: async (target, signal) => folderState(await runLs(cli, target, undefined, signal)),
    saved: () => ready.entries().map((entry) => entry.path),
    store: (paths) => ready.store(paths),
    progress: (snapshot) => send("folders:scan-progress", snapshot),
  });
  addFlow = flow;
  ipcMain.handle("folders:add", async (event) => { if (fromWindow(event)) await addFromDialog(); });
  ipcMain.handle("folders:add-paths", async (event, value: unknown) => {
    const paths = droppedPaths(value);
    if (!fromWindow(event) || paths === null) return;
    send("folders:add-outcome", await flow.add(paths));
  });
  const scanId = (value: unknown): string | null => typeof value === "object" && value !== null && Object.keys(value).length === 1 &&
    "scanId" in value && typeof value.scanId === "string" ? value.scanId : null;
  ipcMain.handle("folders:scan", (event, value: unknown) => {
    const id = scanId(value);
    return fromWindow(event) && id !== null ? flow.scan(id) : null;
  });
  ipcMain.handle("folders:scan-cancel", (event, value: unknown) => {
    const id = scanId(value);
    if (fromWindow(event) && id !== null) flow.cancel(id);
  });
  ipcMain.handle("folders:add-candidates", (event, value: unknown) => (fromWindow(event) ? flow.addCandidates(value) : { kind: "unavailable" }));
  ipcMain.handle("folders:confirm-folder", (event, value: unknown) => (fromWindow(event) ? flow.confirm(value) : { kind: "unavailable" }));
  // A row or a whole card. The draft guard asks once when a draft is open; the
  // renderer knows whether the draft belongs to one of these roots.
  ipcMain.handle("folders:remove", (event, value: unknown): Promise<RemoveResult> | RemoveResult => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("paths" in value)) return { kind: "unavailable" };
    const paths: unknown = value.paths;
    const stored = ready.entries();
    if (!Array.isArray(paths) || paths.length === 0 || new Set(paths).size !== paths.length ||
      !paths.every((path) => stored.some((entry) => entry.path === path))) return { kind: "unavailable" };
    const roots = paths.map(String);
    return new Promise((resolve) => {
      transitionGuard.request({ kind: "remove-projects", roots }, () => {
        const entries = ready.entries().filter((entry) => roots.includes(entry.path));
        const label = removalLabel(entries);
        if (selection && roots.includes(selection.root)) selection = null;
        void ready.remove(roots).then((removed) => {
          if (removed.paths.length === 0) { resolve({ kind: "unavailable" }); return; }
          removal = { id: randomUUID(), ...removed };
          resolve({ kind: "removed", removalId: removal.id, label });
        });
      }, () => resolve({ kind: "cancelled" }));
    });
  });
  const removalId = (value: unknown): string | null => typeof value === "object" && value !== null && Object.keys(value).length === 1 &&
    "removalId" in value && typeof value.removalId === "string" ? value.removalId : null;
  ipcMain.handle("folders:restore", async (event, value: unknown): Promise<RestoreResult> => {
    const id = removalId(value);
    if (!fromWindow(event) || id === null || removal?.id !== id) return { kind: "unavailable" };
    const { paths, indexes } = removal;
    removal = null;
    return { kind: "restored", paths: await ready.restore(paths, indexes) };
  });
  // The toast expired: Undo is gone, so is what it needed.
  ipcMain.handle("folders:forget-removal", (event, value: unknown) => {
    if (fromWindow(event) && removal !== null && removalId(value) === removal.id) removal = null;
  });
  ipcMain.handle("folders:locate", async (event, value: unknown): Promise<LocateResult> => {
    const from = storedPath(value);
    if (!fromWindow(event) || from === null || !win) return { kind: "unavailable" };
    const picked = await dialog.showOpenDialog(win, { title: "Locate…", properties: ["openDirectory"] });
    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) return { kind: "cancelled" };
    const judged = await flow.judge(path);
    if ("refused" in judged) return { kind: "refused", message: judged.refused };
    // The row may have been removed while the picker was open.
    if (!fromWindow(event) || storedPath(value) === null) return { kind: "unavailable" };
    await ready.replace(from, judged.root);
    return { kind: "located", root: judged.root };
  });
  // The root only: the config may live elsewhere after a re-root, and TS does
  // not build `.doan/` paths (POSTMORTEM "Guessing the repo root in TS").
  ipcMain.handle("folders:reveal", (event, value: unknown) => {
    const path = storedPath(value);
    if (fromWindow(event) && path !== null) electronShell.showItemInFolder(path);
  });
  ipcMain.handle("menu:state", (event, value: unknown) => {
    const next = parseMenuInputs(value);
    if (fromWindow(event) && next !== null) setMenuInputs(next);
  });
  ipcMain.handle("folders:open", async (event) => (fromWindow(event) ? openProject() : null));
  ipcMain.handle("folders:reopen", async (event, path: unknown) => {
    if (!fromWindow(event) || typeof path !== "string") return;
    await ready.reopen(path);
  });
  ipcMain.handle("folders:close", async (event, path: unknown) => {
    if (!fromWindow(event) || typeof path !== "string") return;
    transitionGuard.request({ kind: "close-project", root: path }, () => {
      if (selection?.root === path) selection = null;
      void ready.close(path);
    });
  });
  // Invalid input or a project that is not open clears rather than keeping an
  // older selection the human no longer sees.
  ipcMain.handle("selection:set", (event, value: unknown) => {
    if (!fromWindow(event)) return;
    selection = validateSelection(value) && isOpen(value.root) ? value : null;
  });
  ipcMain.handle("inspect:get", async (event, request: unknown): Promise<InspectResult> => {
    const selector = parseInspectRequest(request);
    if (!fromWindow(event) || selector === null || inspector === undefined) return { ok: false, reason: "The request was refused." };
    return inspector.inspect(selector);
  });

  machine = createMachine({ command: cliCommand(process.env, app.isPackaged, process.resourcesPath), version: app.getVersion() });
  const setup = machine;
  const validSession = (value: unknown): value is { session: string } => typeof value === "object" && value !== null &&
    "session" in value && typeof value.session === "string" && value.session === wizardSession;
  ipcMain.handle("onboarding:get-open", event => {
    if (!fromWindow(event) || !wizardSession) return null;
    setup.cancelConfirmation();
    return { session: wizardSession };
  });
  let latestRead = "";
  ipcMain.handle("onboarding:read", async (event, value: unknown): Promise<OnboardingRead> => {
    if (!fromWindow(event) || !validSession(value) || Object.keys(value).length !== 2 ||
      !("requestId" in value) || typeof value.requestId !== "string" || !value.requestId || value.requestId.length > 128) return { kind: "stale" };
    const requestId = value.requestId, session = value.session;
    const readToken = randomUUID(); latestRead = readToken;
    const state = await setup.read(requestId);
    return fromWindow(event) && wizardSession === session && latestRead === readToken ? { kind: "state", session, state } : { kind: "stale" };
  });
  ipcMain.handle("onboarding:run", (event, value: unknown) => fromWindow(event) && wizardSession ? setup.run(value) : { kind: "stale" });
  ipcMain.handle("onboarding:answer", (event, value: unknown) => fromWindow(event) && wizardSession ? setup.answer(value) : { kind: "stale" });
  // The sentence names only a stored, set-up project; the renderer never sends text.
  const readyRoot = (value: unknown): string | null => typeof value === "string" &&
    ready.entries().some(entry => entry.path === value && entry.kind === "list") ? value : null;
  ipcMain.handle("onboarding:first-prompt", (event, value: unknown) => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("root" in value)) return null;
    const root = readyRoot(value.root);
    return root === null ? null : firstSentence(root);
  });
  ipcMain.handle("onboarding:copy", async (event, value: unknown) => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || !("kind" in value)) return { kind: "stale" };
    let text: string;
    if (value.kind === "pathLine" && Object.keys(value).length === 1) text = PATH_LINE;
    else if (value.kind === "firstPrompt" && Object.keys(value).length === 2 && "root" in value) {
      const root = readyRoot(value.root);
      if (root === null) return { kind: "stale" };
      text = firstSentence(root);
    } else return { kind: "stale" };
    try { await clipboard.writeText(text); return { kind: "success" }; }
    catch (error) { return { kind: "error", message: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("onboarding:close", async (event, value: unknown) => {
    if (!fromWindow(event) || !validSession(value) || Object.keys(value).length !== 1) return { kind: "stale" };
    if (setup.isBusy()) return { kind: "busy" };
    let warning: string | undefined;
    try { await markClosed(userData); }
    catch (error) {
      warning = error instanceof Error ? error.message : String(error);
      console.warn("Could not save onboarding dismissal:", warning);
    }
    setup.cancelConfirmation(); wizardSession = null;
    return { kind: "success", ...(warning === undefined ? {} : { warning }) };
  });
  if (await needsOnboarding(userData)) wizardSession = randomUUID();
  win = createWindow();
}

// A second launch only brings the first window back, so two apps never
// overwrite each other's runtime.json.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(start).catch((error: unknown) => {
    console.error("doan: failed to start", error);
    app.exit(1);
  });
}

app.on("second-instance", () => {
  if (win && !win.isDestroyed()) showWindow(win);
});

app.on("before-quit", (event) => {
  if (quitting) return;
  let approved = false;
  transitionGuard.request({ kind: "quit" }, () => {
    quitting = true; cancelPendingHide();
    if (approved) app.quit();
  });
  if (!quitting) { event.preventDefault(); approved = true; }
});
app.on("activate", () => {
  if (win && !win.isDestroyed()) showWindow(win);
});

app.on("will-quit", () => {
  runtime?.disposeSync();
  void shell?.dispose();
});
