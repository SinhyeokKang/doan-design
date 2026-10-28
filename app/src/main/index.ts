import { parseActivityRoots, readShellActivity } from "./shellActivity";
import { ConversationService, resolveListedCanvas } from "./conversation/service";
import { ConversationStore } from "./conversation/store";
import { createPrepare } from "./conversation/prepare";
import { openRunner } from "./conversation/runners";
import { conversationHandler, conversationMethods } from "./conversation/ipc";
import { AuthManager, shellLocator, spawnAuthProcess } from "./agentAuth/manager";
import { AuthStorage } from "./agentAuth/storage";
import { electronCipher } from "./agentAuth/cipher";
import { createMachine, needsOnboarding, markClosed, PATH_LINE, type MachineState } from "./onboarding/machine";
import { isTranslocated } from "./onboarding/states";
import { createCommentsService } from "./comments/service";
import { readCommentBytes, withCommentAppend } from "./comments/files";
import { readAuthor } from "./comments/author";
import { DocumentBindings, stableDiskHash } from "./comments/document";
import { createTransitionGuard } from "./comments/transitions";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, session, shell as electronShell, systemPreferences, webFrameMain, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Selection } from "../formats/types";
import { validateSelection } from "../formats/validate";
import { childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame } from "./canvasFrame";
import { canvasScriptSource } from "./canvasScript";
import { createAddFlow, droppedPaths, type AddFlow } from "./addProjects";
import { cliCommand, readFolder, runConfig, runLs } from "./cli";
import { createConfigBridge, type ConfigBridge } from "./configBridge";
import { folderState } from "./folderState";
import type { InspectResult } from "./inspect";
import { createInspector, parseInspectRequest, type Inspector } from "./inspector";
import { startRuntime, type Runtime } from "./runtime";
import { menuState, type Screen } from "./menuState";
import { parseProjectCommentsRequest, readProjectComments, type ProjectComments } from "./projectComments";
import { removalLabel } from "./removal";
import { createReviewStore, parseReviewRaise, parseReviewRead } from "./reviewState";
import { readFoldersFileForPruning } from "./folderStore";
import type { ReviewMarker } from "../comments/review";
import { senderAllowed, type WindowKind } from "./senderAllowed";
import { INSTALL_URLS, parseExternalTarget, parseForwardedAction, parseSettingsTab, parseSettingsTarget, projectRows, SETTINGS_TITLES, SETTINGS_WINDOW, type SettingsTab, type SettingsTarget } from "./settings";
import { createSetupBroker, type SetupBroker } from "./setupBroker";
import { promptSentence } from "../firstPrompt/promptSentence";
import { startShell, type Shell, type ProjectInitResult } from "./shell";
import { createThrottle } from "./throttle";
import { createThumbnails, type ThumbnailReply, type Thumbnails } from "./thumbnails";
import { createWindowCapturer } from "./thumbnailWindow";
import { createUiStateStore, type UiStateStore } from "./uiState";

// Must run before `ready`: userData is derived from the name, which makes it
// ~/Library/Application Support/doan/ (beside runtime.json, ARCHITECTURE §4).
// A `--user-data-dir` switch still wins, which is how e2e keeps off the real one.
app.setName("doan");

export interface ProjectInitRequest { root: string; choiceId: string | null }
export type TokenCssChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable"; message: string };

export type ViewCommand = "zoomIn" | "zoomOut" | "actualSize" | "fit" | "reload";
// Menu items whose work belongs to the renderer's screen state.
export type MenuCommand = "home" | "undoRemove" | "quickOpen" | "nextResolved" | "previousResolved";
// What the renderer reports so main can enable menu items (design 'Menus').
// `reviewing`: a Review runs on the open canvas (revision-recheck); absent is false.
export interface MenuInputs { screen: Screen; modal: boolean; toast: boolean; reviewing?: boolean }
export type RemoveResult = { kind: "removed"; removalId: string; label: string } | { kind: "cancelled" } | { kind: "unavailable" };
export type RestoreResult = { kind: "restored"; paths: string[] } | { kind: "unavailable" };
export type LocateResult = { kind: "located"; root: string } | { kind: "refused"; message: string } | { kind: "cancelled" } | { kind: "unavailable" };
// The wizard's Open Project…: one folder, judged as Add Project… judges it. A
// checklist or a confirmation finishes through `folders:add-candidates` (one
// id) or `folders:confirm-folder`, whose `added` holds the one root.
export type OpenProjectResult = { kind: "stored"; root: string } | { kind: "choose"; scanId: string } |
  { kind: "confirm"; confirmId: string; path: string; name: string } | { kind: "refused"; message: string } | { kind: "cancelled" } | { kind: "unavailable" };

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

// --bg-app in renderer/tokens.css: windows paint it before the renderer's first frame.
const SHELL_BACKGROUND = "#f1f1f2";
let win: BrowserWindow | undefined;
// Settings is its own window, made on demand and destroyed on close. Its
// webContents is the only other one IPC accepts; the capture window never is.
let settingsWin: BrowserWindow | undefined;
let focusedWindow: WindowKind = "main";
// Where the next Settings window, or the open one, should go; taken once.
let settingsTarget: SettingsTarget | null = null;
let broker: SetupBroker | undefined;
let configBridge: ConfigBridge | undefined;
let shell: Shell | undefined;
let runtime: Runtime | undefined;
let conversations: ConversationService | undefined;
let agentAuth: AuthManager | undefined;
let conversationCanvases = new Set<string>();
let inspector: Inspector | undefined;
// One selection app-wide (select-inspect R1); the socket answers it only for
// its own project. Memory only, never written to disk.
let selection: Selection | null = null;
const documents = new DocumentBindings();
const transitionGuard = createTransitionGuard(request => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    if (request.kind === "quit") {
      if (appHidden) app.show();
      showWindow(win);
      win.focus();
    }
    win.webContents.send("comments:transition", request);
  }
});
let wizardSession: string | null = null;
let machine: ReturnType<typeof createMachine> | undefined;
export type OnboardingOpen = { session: string };
export type OnboardingRead = { kind: "state"; session: string; state: MachineState } | { kind: "stale" };
let quitting = false;
let quitScheduled = false;
let cancelPendingHide = () => {};
let addFlow: AddFlow | undefined;
let uiState: UiStateStore | undefined;
let thumbnails: Thumbnails | undefined;
// The app always starts on Home (design 'Memory model').
const HOME: MenuInputs = { screen: "home", modal: false, toast: false };
let menuInputs: MenuInputs = HOME;
// Only the newest removal can be undone; main keeps what Undo needs.
let removal: { id: string; paths: string[]; indexes: number[] } | null = null;
// Counts removals started, so one saved late cannot take Undo from a newer one.
let removals = 0;
const FULLSCREEN_EXIT_WAIT_MS = 2000;

// Thumbnails are for the window's overview, so nothing is captured while it
// is hidden: closed with the app still running, or with the whole app hidden
// (⌘H, doan › Hide). Tracked here rather than with the window's `hide`/`show`
// events, which macOS did not emit for these calls in the e2e run.
// createWindow makes the window shown, without showWindow.
let windowShown = true;
let appHidden = false;
function syncThumbnailPause(): void {
  if (windowShown && !appHidden) thumbnails?.resume();
  else thumbnails?.pause();
}
// The first prompt's arrival shows a toast rather than opening a canvas while
// the window is hidden; document.hidden stayed false after hide() in a real run.
function visibilityChanged(): void {
  syncThumbnailPause();
  send("window:visible", { visible: windowShown && !appHidden });
}

function showWindow(window: BrowserWindow): void {
  cancelPendingHide();
  window.show();
  windowShown = true;
  visibilityChanged();
}

function hideWindow(window: BrowserWindow): void {
  window.hide();
  windowShown = false;
  visibilityChanged();
}

function isOpen(root: string): boolean {
  return shell?.entries().some((entry) => entry.path === root) ?? false;
}

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args);
}

function sendSettings(channel: string, ...args: unknown[]): void {
  if (settingsWin && !settingsWin.isDestroyed() && !settingsWin.webContents.isDestroyed()) settingsWin.webContents.send(channel, ...args);
}

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && !win.isDestroyed() && fromAppFrame(event, win);
}

// A registered window's main frame, or nothing: iframes, the capture window
// and windows that are gone are not senders.
function senderKind(event: IpcMainInvokeEvent): WindowKind | undefined {
  if (fromWindow(event)) return "main";
  if (settingsWin !== undefined && !settingsWin.isDestroyed() && fromAppFrame(event, settingsWin)) return "settings";
  return undefined;
}

// Every channel goes through the per-window allowlist; `refused` is what a
// sender that may not call it gets, the same as a forged request.
function handle(channel: string, refused: unknown, handler: (event: IpcMainInvokeEvent, value: unknown, kind: WindowKind) => unknown): void {
  ipcMain.handle(channel, (event, value: unknown) => {
    const kind = senderKind(event);
    return kind !== undefined && senderAllowed(channel, kind) ? handler(event, value, kind) : refused;
  });
}

function setFocusedWindow(kind: WindowKind): void {
  if (focusedWindow === kind) return;
  focusedWindow = kind;
  setMenu();
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
  const enabled = menuState(menuInputs.screen, menuInputs.modal, menuInputs.toast, { wizardOpen: wizardSession !== null, focusedWindow, reviewing: menuInputs.reviewing === true });
  const undo: MenuItemConstructorOptions = enabled.undoRemove
    ? { label: "Undo Remove", accelerator: "CmdOrCtrl+Z", click: command("undoRemove") }
    : { role: "undo" };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "doan", submenu: [
        { role: "about" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", enabled: enabled.settings, click: () => openSettings(null) },
        { type: "separator" }, { role: "services" }, { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" }, { role: "quit" },
      ] },
      {
        label: "File",
        submenu: [
          { label: "Add Project…", accelerator: "CmdOrCtrl+O", enabled: enabled.addProject, click: () => { void addFromDialog(); } },
          { type: "separator" },
          // Closes Settings when it has focus (destroyed), else hides the main window.
          // Electron names the focused window; an inactive app may name none.
          { label: "Close Window", accelerator: "CmdOrCtrl+W", click: (_item, focused) => {
            const settings = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
            const target = focused !== undefined && (focused === win || focused === settings) ? focused
              : focusedWindow === "settings" && settings ? settings : win;
            if (target && !target.isDestroyed()) target.close();
          } },
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
      // Finder's place for Home. Quick Open is a menu item so ⌘K is never only
      // a hidden key (design-nav draft, after Sorcerer's "Go to…").
      { label: "Go", submenu: [
        { label: "Home", accelerator: "Shift+CmdOrCtrl+H", enabled: enabled.home, click: command("home") },
        { label: "Quick Open…", accelerator: "CmdOrCtrl+K", enabled: enabled.quickOpen, click: command("quickOpen") },
        { type: "separator" },
        // ⌘] and ⌘[ are not text-editing keys, so they can stay bound while a
        // field has focus; they are enabled only during a Review.
        { label: "Next Resolved Comment", accelerator: "CmdOrCtrl+]", enabled: enabled.resolvedNav, click: command("nextResolved") },
        { label: "Previous Resolved Comment", accelerator: "CmdOrCtrl+[", enabled: enabled.resolvedNav, click: command("previousResolved") },
      ] },
      { role: "windowMenu" },
    ]),
  );
}

// What Home shortens project paths against; Settings rows get the result.
const homeDirectory = (): string => process.env.HOME ?? app.getPath("home");

function setMenuInputs(next: MenuInputs): void {
  if (next.screen === menuInputs.screen && next.modal === menuInputs.modal && next.toast === menuInputs.toast && next.reviewing === menuInputs.reviewing) return;
  menuInputs = next;
  setMenu();
}

function parseMenuInputs(value: unknown): MenuInputs | null {
  if (typeof value !== "object" || value === null || !("screen" in value) || !("modal" in value) || !("toast" in value)) return null;
  const reviewing: unknown = Reflect.get(value, "reviewing");
  if (Object.keys(value).length !== ("reviewing" in value ? 4 : 3) || (reviewing !== undefined && typeof reviewing !== "boolean")) return null;
  const { screen, modal, toast } = value;
  if ((screen !== "home" && screen !== "workspace" && screen !== "canvas") || typeof modal !== "boolean" || typeof toast !== "boolean") return null;
  return reviewing === true ? { screen, modal, toast, reviewing } : { screen, modal, toast };
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
    // Center the native controls on the 56px shell header.
    trafficLightPosition: { x: 16, y: 21 },
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    title: "Doan Design",
    backgroundColor: "#00000000",
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
  // A lost or closed renderer takes its setup confirmation with it; hiding the
  // window does not. Read after destroy, webContents throws, so the id is kept now.
  const owner = window.webContents.id;
  window.webContents.on("render-process-gone", () => broker?.drop(owner));
  // `.git/HEAD` is not watched, so a branch switched elsewhere shows when the
  // human comes back to the window.
  // The connection summary shares that throttle (app-setup design 'Connections').
  const reread = createThrottle(60_000);
  window.on("focus", () => {
    setFocusedWindow("main");
    if (reread()) { shell?.rereadAll(); void broker?.refresh(); }
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    cancelPendingHide();
    if (window.isFullScreen()) {
      // macOS cannot hide until the transition ends; a later open cancels this close.
      const hide = () => { cancelPendingHide(); if (!window.isDestroyed()) hideWindow(window); };
      const timeout = setTimeout(() => cancelPendingHide(), FULLSCREEN_EXIT_WAIT_MS);
      cancelPendingHide = () => {
        clearTimeout(timeout);
        window.removeListener("leave-full-screen", hide);
        cancelPendingHide = () => {};
      };
      window.once("leave-full-screen", hide);
      window.setFullScreen(false);
    } else hideWindow(window);
  });
  window.on("closed", () => {
    broker?.drop(owner);
    cancelPendingHide();
    if (win === window) win = undefined;
  });
  return window;
}

function createSettingsWindow(tab: SettingsTab): BrowserWindow {
  const window = new BrowserWindow({
    ...SETTINGS_WINDOW,
    title: SETTINGS_TITLES[tab],
    backgroundColor: SHELL_BACKGROUND,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: fileURLToPath(new URL("../preload/settings.cjs", import.meta.url)),
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void window.loadURL(`${devUrl.replace(/\/+$/, "")}/settings.html`);
  else void window.loadFile(fileURLToPath(new URL("../renderer/settings.html", import.meta.url)));
  // The title names the current tab, which main sets; the page's <title> must not replace it.
  window.on("page-title-updated", (event) => event.preventDefault());
  window.on("focus", () => setFocusedWindow("settings"));
  // Read after destroy, webContents throws, so the owner id is kept now.
  const owner = window.webContents.id;
  // The wizard's Close refuses while busy; Settings holds its close the same
  // way, for the red button, ⌘W and Close Window alike. Quit closes it anyway.
  window.on("close", (event) => { if (!quitting && broker?.isWriting(owner)) event.preventDefault(); });
  const forget = () => { broker?.drop(owner); configBridge?.clear(); };
  window.webContents.on("render-process-gone", forget);
  window.on("closed", () => {
    forget();
    if (settingsWin === window) { settingsWin = undefined; settingsTarget = null; }
    setFocusedWindow("main");
  });
  return window;
}

// Settings…, a home chip, the banner's Fix… or a row's Project Settings….
// Not while the wizard is open (the menu item is disabled then too), and not
// before setup can answer it.
function openSettings(target: SettingsTarget | null): boolean {
  if (wizardSession !== null || broker === undefined || uiState === undefined) return false;
  settingsTarget = target;
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (target) {
      settingsWin.setTitle(SETTINGS_TITLES[target.tab]);
      sendSettings("settings:target", target);
    }
    settingsWin.show();
    settingsWin.focus();
  } else settingsWin = createSettingsWindow(target?.tab ?? uiState.readSettingsTab() ?? "connections");
  // Its focus event does not come while the app is inactive.
  setFocusedWindow("settings");
  void broker.refresh();
  return true;
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

async function openOneProject(): Promise<OpenProjectResult> {
  const window = win;
  const flow = addFlow;
  if (!window || window.isDestroyed() || !flow) return { kind: "unavailable" };
  showWindow(window);
  const picked = await dialog.showOpenDialog(window, { title: "Open Project…", properties: ["openDirectory"] });
  const path = picked.filePaths[0];
  if (picked.canceled || path === undefined) return { kind: "cancelled" };
  const outcome = await flow.add([path]);
  const stored = outcome.added[0] ?? outcome.duplicate;
  if (stored !== undefined && stored !== null) {
    // The wizard takes the one project; the worktree checklist Add Project… offers is not shown.
    if (outcome.scanId !== null) flow.cancel(outcome.scanId);
    return { kind: "stored", root: stored };
  }
  if (outcome.scanId !== null) return { kind: "choose", scanId: outcome.scanId };
  const confirm = outcome.confirms[0];
  if (confirm) return { kind: "confirm", ...confirm };
  return { kind: "refused", message: outcome.messages.join(" ") };
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
  // The UI has one light theme. Native controls, scrollbars and the canvas iframe's
  // prefers-color-scheme follow this instead of the macOS appearance.
  nativeTheme.themeSource = "light";
  denyPermissions();
  setMenu();
  const userData = app.getPath("userData");
  // folderStore writes beside folders.json but does not create the directory.
  await mkdir(userData, { recursive: true });
  const invalidate = (root: string) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("comments:invalidated", { root });
  };
  const choices = new Map<string, { id: string; path: string; epoch: number }>();
  const savedRoots = await readFoldersFileForPruning(join(userData, "folders.json"));
  const ready = await startShell(join(userData, "folders.json"), cliCommand(process.env, app.isPackaged, process.resourcesPath), (entries, focus) => {
    const nextCanvases = new Set<string>();
    for (const entry of entries) if (entry.kind === "list") for (const canvas of entry.canvases) {
      const key = JSON.stringify([entry.path, canvas.id ?? canvas.path]); nextCanvases.add(key);
      if (!conversationCanvases.has(key)) {
        try { conversations?.bind(entry.path, canvas); } catch (error) { console.error("doan: cannot persist first conversation canvas", error); }
      }
    }
    conversationCanvases = nextCanvases;
    for (const root of choices.keys()) {
      if (!entries.some(entry => entry.path === root && entry.kind === "uninitialized")) choices.delete(root);
    }
    thumbnails?.entriesChanged(entries);
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("folders", entries, focus);
    sendSettings("projects", projectRows(entries, homeDirectory()));
  }, { response: record => documents.response(record), invalidate });
  shell = ready;
  // The capture window is made on the first capture and stays out of the
  // app window's lifecycle: `win` alone is shown, closed and trusted for IPC.
  const thumbs = createThumbnails({
    dir: join(userData, "thumbnails"), appVersion: app.getVersion(),
    entries: () => ready.entries(), scope: (root) => ready.scope(root),
    capturer: createWindowCapturer(), changed: (target) => send("thumbnails:changed", target),
  });
  thumbnails = thumbs;
  // Electron has no app hide event. AppKit posts these at the end of
  // NSApplication's hide:/unhide:, which the `hide` role item (⌘H) sends.
  systemPreferences.subscribeLocalNotification("NSApplicationDidHideNotification", () => { appHidden = true; visibilityChanged(); });
  systemPreferences.subscribeLocalNotification("NSApplicationDidUnhideNotification", () => { appHidden = false; visibilityChanged(); });
  // Starts the once-per-launch cache cleanup even when no folder update follows.
  thumbs.entriesChanged(ready.entries());
  const cli = cliCommand(process.env, app.isPackaged, process.resourcesPath);
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
    listing: root => readFolder(cli, root),
  });
  const commentMethods = { list: "list", begin: "begin", mutate: "mutate", status: "status", author: "author", copy: "copy", orphanMutate: "orphan-mutate", orphanStatus: "orphan-status" } as const;
  for (const [method, channel] of Object.entries(commentMethods) as [keyof typeof commentMethods, string][]) {
    handle(`comments:${channel}`, { ok: false, identity: null, error: "The request was refused." }, (event, value: unknown) => {
      if (!fromWindow(event)) return { ok: false, identity: null, error: "The request was refused." };
      return comments[method](String(event.sender.id), value);
    });
  }
  handle("comments:guard", undefined, (event, value: unknown) => {
    if (fromWindow(event) && typeof value === "boolean") transitionGuard.set(value);
  });
  handle("comments:transition-answer", undefined, (event, value: unknown) => {
    if (fromWindow(event)) transitionGuard.answer(value);
  });
  // `doan active` is an extra; the app works without it, and the CLI then
  // reports that the app is not running.
  runtime = await startRuntime(userData, { isOpen, selection: () => selection }).catch((error: unknown) => {
    console.error("doan: cannot start the runtime socket", error);
    return undefined;
  });

  const prepareConversation = createPrepare(userData, join(userData, "runtime.json"), process.env);
  const conversationStore = new ConversationStore(userData);
  const conversationService = new ConversationService(conversationStore, prepareConversation, openRunner, event => send("conversation:event", event), (root, canvas) => {
    const project = ready.entries().find(entry => entry.path === root);
    if (!project) throw new Error("project_not_open");
    if (canvas) {
      if (project.kind !== "list") throw new Error("canvas_not_found");
      return resolveListedCanvas(canvas, project.canvases);
    }
  });
  conversations = conversationService;
  const auth = new AuthManager({ storage: new AuthStorage(join(userData, "agent-auth"), electronCipher), spawn: spawnAuthProcess, inherited: process.env, appRuntime: join(userData, "runtime.json"), locate: shellLocator(process.env) });
  // Unreadable metadata leaves sign-in unavailable rather than letting a later save erase other connections.
  try { await auth.load(); agentAuth = auth; } catch (error) { console.error("doan: agent sign-in storage is unreadable", error); }
  const conversationRequest = conversationHandler(conversationService, prepareConversation, () => ready.entries());
  for (const method of conversationMethods) {
    ipcMain.handle(`conversation:${method}`, (event, value: unknown) => conversationRequest(fromWindow(event), method, value));
  }

  const unavailable = { kind: "unavailable" as const, message: "The project setup request is no longer valid." };
  const canSetUp = (root: string) => ready.entries().some(entry => entry.path === root && entry.kind === "uninitialized");
  handle("project:choose-token-css", unavailable, async (event, value: unknown): Promise<TokenCssChoice> => {
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
  handle("project:init", unavailable, async (event, value: unknown): Promise<ProjectInitResult> => {
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
  handle("app:home", null, event => fromWindow(event) ? homeDirectory() : null);
  handle("window:visible", null, event => fromWindow(event) ? { visible: windowShown && !appHidden } : null);
  handle("folders:get", [], (event) => (fromWindow(event) ? ready.entries() : []));
  const storedRoot = (root: string) => ready.entries().some(entry => entry.path === root);
  const reviews = createReviewStore(join(userData, "review-state.json"), () => savedRoots);
  const flow = createAddFlow({
    ls: async (target, signal) => folderState(await runLs(cli, target, undefined, signal)),
    saved: () => ready.entries().map((entry) => entry.path),
    store: (paths) => ready.store(paths),
    progress: (snapshot) => send("folders:scan-progress", snapshot),
  });
  addFlow = flow;
  handle("folders:add", undefined, async (event) => { if (fromWindow(event)) await addFromDialog(); });
  handle("folders:add-paths", undefined, async (event, value: unknown) => {
    const paths = droppedPaths(value);
    if (!fromWindow(event) || paths === null) return;
    send("folders:add-outcome", await flow.add(paths));
  });
  const scanId = (value: unknown): string | null => typeof value === "object" && value !== null && Object.keys(value).length === 1 &&
    "scanId" in value && typeof value.scanId === "string" ? value.scanId : null;
  handle("folders:scan", null, (event, value: unknown) => {
    const id = scanId(value);
    return fromWindow(event) && id !== null ? flow.scan(id) : null;
  });
  handle("folders:scan-cancel", undefined, (event, value: unknown) => {
    const id = scanId(value);
    if (fromWindow(event) && id !== null) flow.cancel(id);
  });
  handle("folders:add-candidates", { kind: "unavailable" }, (event, value: unknown) => (fromWindow(event) ? flow.addCandidates(value) : { kind: "unavailable" }));
  handle("folders:confirm-folder", { kind: "unavailable" }, (event, value: unknown) => (fromWindow(event) ? flow.confirm(value) : { kind: "unavailable" }));
  // Review markers outlive a removal while Undo can bring the project back;
  // a root stored again meanwhile keeps them.
  const removedForGood = (paths: readonly string[]) => {
    const gone = paths.filter(path => !ready.entries().some(entry => entry.path === path));
    if (gone.length > 0) reviews.forget(gone);
  };
  // A row or a whole card. The draft guard asks once when a draft is open; the
  // renderer knows whether the draft belongs to one of these roots.
  handle("folders:remove", { kind: "unavailable" }, (event, value: unknown): Promise<RemoveResult> | RemoveResult => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("paths" in value)) return { kind: "unavailable" };
    const paths: unknown = value.paths;
    const stored = ready.entries();
    if (!Array.isArray(paths) || paths.length === 0 || new Set(paths).size !== paths.length ||
      !paths.every((path) => stored.some((entry) => entry.path === path))) return { kind: "unavailable" };
    const roots = paths.map(String);
    return new Promise((resolve) => {
      transitionGuard.request({ kind: "remove-projects", roots }, () => {
        const before = ready.entries();
        const entries = before.filter((entry) => roots.includes(entry.path));
        const label = removalLabel(entries);
        if (selection && roots.includes(selection.root)) selection = null;
        // The list changes before folders.json is written: the old Undo goes
        // now, not when the write ends.
        const generation = ++removals;
        if (removal !== null) removedForGood(removal.paths);
        removal = null;
        void ready.remove(roots).then((removed) => {
          if (removed.paths.length === 0) { resolve({ kind: "unavailable" }); return; }
          void thumbs.removed(removed.paths, before);
          const id = randomUUID();
          if (generation === removals) removal = { id, ...removed };
          else removedForGood(removed.paths);
          resolve({ kind: "removed", removalId: id, label });
        });
      }, () => resolve({ kind: "cancelled" }));
    });
  });
  const removalId = (value: unknown): string | null => typeof value === "object" && value !== null && Object.keys(value).length === 1 &&
    "removalId" in value && typeof value.removalId === "string" ? value.removalId : null;
  handle("folders:restore", { kind: "unavailable" }, async (event, value: unknown): Promise<RestoreResult> => {
    const id = removalId(value);
    if (!fromWindow(event) || id === null || removal?.id !== id) return { kind: "unavailable" };
    const { paths, indexes } = removal;
    removal = null;
    return { kind: "restored", paths: await ready.restore(paths, indexes) };
  });
  // The toast expired: Undo is gone, so is what it needed.
  handle("folders:forget-removal", undefined, (event, value: unknown) => {
    if (fromWindow(event) && removal !== null && removalId(value) === removal.id) { removedForGood(removal.paths); removal = null; }
  });
  handle("folders:locate", { kind: "unavailable" }, async (event, value: unknown): Promise<LocateResult> => {
    const from = storedPath(value);
    if (!fromWindow(event) || from === null || !win) return { kind: "unavailable" };
    const picked = await dialog.showOpenDialog(win, { title: "Locate…", properties: ["openDirectory"] });
    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) return { kind: "cancelled" };
    const judged = await flow.judge(path);
    if ("refused" in judged) return { kind: "refused", message: judged.refused };
    // The row may have been removed while the picker was open.
    if (!fromWindow(event) || storedPath(value) === null) return { kind: "unavailable" };
    // The old row leaves the list, as on Remove.
    if (selection?.root === from) selection = null;
    await ready.replace(from, judged.root);
    return { kind: "located", root: judged.root };
  });
  // The root only: the config may live elsewhere after a re-root, and TS does
  // not build `.doan/` paths (POSTMORTEM "Guessing the repo root in TS").
  handle("folders:reveal", undefined, (event, value: unknown) => {
    const path = storedPath(value);
    if (fromWindow(event) && path !== null) electronShell.showItemInFolder(path);
  });
  // Validated against the saved roots in main; the renderer's copy is not trusted.
  const store = createUiStateStore(join(userData, "ui-state.json"), () => ready.entries().map((entry) => entry.path));
  uiState = store;
  handle("shell:activity", null, (event, value: unknown) => {
    if (!fromWindow(event)) return null;
    const roots = parseActivityRoots(value, ready.entries().map(entry => entry.path));
    return roots === null ? null : readShellActivity(userData, conversationStore, roots);
  });
  handle("ui-state:get", null, (event) => (fromWindow(event) ? store.read() : null));
  handle("ui-state:save", false, (event, value: unknown) => fromWindow(event) && store.save(value));
  // revision-recheck: the renderer reads markers and may only ask for raises.
  handle("review-state:get", null, (event, value: unknown): ReviewMarker | null => {
    const request = parseReviewRead(value);
    return fromWindow(event) && request !== null && storedRoot(request.root) ? reviews.marker(request.root, request.canvas) : null;
  });
  handle("review-state:raise", null, (event, value: unknown): ReviewMarker | null => {
    const request = parseReviewRaise(value);
    return fromWindow(event) && request !== null && storedRoot(request.root) ? reviews.raise(request.root, request.canvas, request.at) : null;
  });
  handle("comments:project", null, (event, value: unknown): Promise<ProjectComments> | null => {
    const request = parseProjectCommentsRequest(value);
    if (!fromWindow(event) || request === null || !storedRoot(request.root)) return null;
    return readProjectComments({
      list: root => readFolder(cli, root), read: readCommentBytes, author: readAuthor,
      marker: (root, canvas) => reviews.marker(root, canvas), epoch: root => ready.epoch(root),
    }, request);
  });
  // A saved root and a listed canvas only; main reads the bytes from its cache.
  handle("thumbnails:get", { kind: "unavailable" }, (event, value: unknown): Promise<ThumbnailReply> | ThumbnailReply => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 3 ||
      !("root" in value) || typeof value.root !== "string" || !("path" in value) || typeof value.path !== "string" ||
      !("visible" in value) || typeof value.visible !== "boolean") return { kind: "unavailable" };
    return thumbs.get(value.root, value.path, value.visible);
  });
  handle("thumbnails:visible", undefined, (event, value: unknown) => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 3 ||
      !("root" in value) || typeof value.root !== "string" || !("path" in value) || typeof value.path !== "string" ||
      !("visible" in value) || typeof value.visible !== "boolean") return;
    thumbs.visible(value.root, value.path, value.visible);
  });
  handle("menu:state", undefined, (event, value: unknown) => {
    const next = parseMenuInputs(value);
    if (fromWindow(event) && next !== null) setMenuInputs(next);
  });
  handle("folders:open", null, async (event) => (fromWindow(event) ? openProject() : null));
  handle("folders:reopen", undefined, async (event, path: unknown) => {
    if (!fromWindow(event) || typeof path !== "string") return;
    await ready.reopen(path);
  });
  // Invalid input or a project that is not open clears rather than keeping an
  // older selection the human no longer sees.
  handle("selection:set", undefined, (event, value: unknown) => {
    if (!fromWindow(event)) return;
    selection = validateSelection(value) && isOpen(value.root) ? value : null;
  });
  handle("inspect:get", { ok: false, reason: "The request was refused." }, async (event, request: unknown): Promise<InspectResult> => {
    const selector = parseInspectRequest(request);
    if (!fromWindow(event) || selector === null || inspector === undefined) return { ok: false, reason: "The request was refused." };
    return inspector.inspect(selector);
  });

  const command = cliCommand(process.env, app.isPackaged, process.resourcesPath);
  machine = createMachine({ command, version: app.getVersion() });
  const setup = machine;
  const setupBroker = createSetupBroker({
    machine: setup, translocated: isTranslocated(command),
    onboardingClosed: async () => !await needsOnboarding(userData),
    publish: (status) => { send("setup:status", status); sendSettings("setup:status", status); },
  });
  broker = setupBroker;
  const validSession = (value: unknown): value is { session: string } => typeof value === "object" && value !== null &&
    "session" in value && typeof value.session === "string" && value.session === wizardSession;
  const requestId = (value: unknown, keys: number): string | null => typeof value === "object" && value !== null && Object.keys(value).length === keys &&
    "requestId" in value && typeof value.requestId === "string" && value.requestId !== "" && value.requestId.length <= 128 ? value.requestId : null;
  // A renderer that mounts again has lost the confirmation it showed.
  handle("onboarding:get-open", null, event => {
    if (!wizardSession) return null;
    setupBroker.cancelConfirmation(event.sender.id);
    return { session: wizardSession };
  });
  handle("onboarding:read", { kind: "stale" }, async (event, value: unknown): Promise<OnboardingRead> => {
    const id = requestId(value, 2);
    if (!validSession(value) || id === null) return { kind: "stale" };
    const session = value.session;
    const read = await setupBroker.read(event.sender.id, id);
    return read.kind === "state" && fromWindow(event) && wizardSession === session ? { kind: "state", session, state: read.state } : { kind: "stale" };
  });
  handle("onboarding:run", { kind: "stale" }, (event, value: unknown) => wizardSession ? setupBroker.run(event.sender.id, value) : { kind: "stale" });
  handle("onboarding:answer", { kind: "stale" }, (event, value: unknown) => wizardSession ? setupBroker.answer(event.sender.id, value) : { kind: "stale" });
  // Settings and the home use these; the read token and the lock owner are the sending window.
  handle("setup:status", null, () => setupBroker.status());
  handle("setup:read", { kind: "stale" }, async (event, value: unknown, kind) => {
    const id = requestId(value, 1);
    if (id === null) return { kind: "stale" };
    const read = await setupBroker.read(event.sender.id, id);
    return senderKind(event) === kind ? read : { kind: "stale" };
  });
  handle("setup:run", { kind: "stale" }, (event, value: unknown) => setupBroker.run(event.sender.id, value));
  handle("setup:answer", { kind: "stale" }, (event, value: unknown) => setupBroker.answer(event.sender.id, value));
  handle("setup:check-again", null, () => setupBroker.refresh());
  handle("setup:open-external", false, async (_event, value: unknown) => {
    const target = parseExternalTarget(value);
    if (target === null) return false;
    try { await electronShell.openExternal(INSTALL_URLS[target]); return true; } catch { return false; }
  });
  const copy = async (text: string) => {
    try { await clipboard.writeText(text); return { kind: "success" as const }; }
    catch (error) { return { kind: "error" as const, message: error instanceof Error ? error.message : String(error) }; }
  };
  handle("setup:copy-path-line", { kind: "stale" }, (_event, value: unknown) => value === undefined ? copy(PATH_LINE) : { kind: "stale" });
  // The sentence names only a stored, set-up project. `subject` is the one
  // free text the renderer sends; promptSentence checks it.
  const readyRoot = (value: unknown): string | null => typeof value === "string" &&
    ready.entries().some(entry => entry.path === value && entry.kind === "list") ? value : null;
  const promptText = (value: Record<string, unknown>, fixed: number): string | null => {
    const root = readyRoot(value.root);
    if (root === null || Object.keys(value).length - fixed !== 2 || !("subject" in value)) return null;
    const text = typeof value.subject === "string" ? promptSentence(root, value.subject) : null;
    return typeof text === "string" ? text : null;
  };
  handle("onboarding:first-prompt", null, (_event, value: unknown) =>
    typeof value === "object" && value !== null && "root" in value ? promptText(value as Record<string, unknown>, 0) : null);
  handle("onboarding:copy", { kind: "stale" }, async (_event, value: unknown) => {
    if (typeof value !== "object" || value === null || !("kind" in value)) return { kind: "stale" };
    let text: string | null = null;
    if (value.kind === "pathLine" && Object.keys(value).length === 1) text = PATH_LINE;
    else if (value.kind === "firstPrompt" && "root" in value) text = promptText(value as Record<string, unknown>, 1);
    return text === null ? { kind: "stale" } : copy(text);
  });
  handle("onboarding:open-project", { kind: "unavailable" }, () => openOneProject());
  handle("onboarding:close", { kind: "stale" }, async (event, value: unknown) => {
    if (!validSession(value) || Object.keys(value).length !== 1) return { kind: "stale" };
    if (setupBroker.isBusy()) return { kind: "busy" };
    let warning: string | undefined;
    try { await markClosed(userData); }
    catch (error) {
      warning = error instanceof Error ? error.message : String(error);
      console.warn("Could not save onboarding dismissal:", warning);
    }
    setupBroker.cancelConfirmation(event.sender.id); wizardSession = null;
    setupBroker.setOnboardingClosed(warning === undefined);
    setMenu();
    return { kind: "success", ...(warning === undefined ? {} : { warning }) };
  });

  handle("settings:open", false, (_event, value: unknown) => {
    const target = parseSettingsTarget(value, storedRoot);
    return target !== null && openSettings(target);
  });
  handle("settings:take-target", null, () => { const target = settingsTarget; settingsTarget = null; return target; });
  handle("settings:tab-get", null, () => store.readSettingsTab() ?? "connections");
  handle("settings:tab-save", false, (_event, value: unknown) => {
    const tab = typeof value === "object" && value !== null && Object.keys(value).length === 1 && "tab" in value ? parseSettingsTab(value.tab) : null;
    if (tab === null || !store.saveSettingsTab(tab)) return false;
    settingsWin?.setTitle(SETTINGS_TITLES[tab]);
    return true;
  });
  handle("projects:get", [], () => projectRows(ready.entries(), homeDirectory()));
  handle("projects:reveal", undefined, (_event, value: unknown) => {
    const path = storedPath(value);
    if (path !== null) electronShell.showItemInFolder(path);
  });
  // A problem row's action runs where the home is: the main window comes forward and does it.
  handle("projects:forward-action", false, (_event, value: unknown) => {
    const request = parseForwardedAction(value, storedRoot);
    if (request === null || !win || win.isDestroyed() || menuInputs.modal) return false;
    showWindow(win);
    win.focus();
    send("projects:action", request);
    return true;
  });
  const bridge = createConfigBridge({
    run: (root, args) => runConfig(command, root, args),
    epoch: root => ready.entries().some(entry => entry.path === root && entry.kind === "list") ? ready.epoch(root) : null,
    async pick(root, kind) {
      const window = settingsWin;
      if (!window || window.isDestroyed()) return null;
      const picked = await dialog.showOpenDialog(window, kind === "tokenCss"
        ? { title: "Choose Token CSS", properties: ["openFile"], defaultPath: root, filters: [{ name: "CSS", extensions: ["css"] }] }
        : { title: "Add to Serve", properties: ["openFile", "openDirectory"], defaultPath: root });
      return picked.canceled ? null : picked.filePaths[0] ?? null;
    },
  });
  configBridge = bridge;
  handle("config:read", { kind: "unavailable" }, (_event, value: unknown) => bridge.read(value));
  handle("config:choose", { kind: "unavailable" }, async (event, value: unknown) => {
    const choice = await bridge.choose(value);
    return senderKind(event) === "settings" ? choice : { kind: "unavailable" };
  });
  handle("config:write", { kind: "unavailable" }, (_event, value: unknown) => bridge.write(value));

  if (await needsOnboarding(userData)) wizardSession = randomUUID();
  setMenu();
  void setupBroker.refresh();
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
  event.preventDefault();
  if (quitScheduled) return;
  transitionGuard.request({ kind: "quit" }, () => {
    // An inspector quit can interrupt a BrowserWindow constructor before its
    // JS wrapper exists. Electron then crashes trying to emit its close event.
    // Let the native stack unwind before either disposal or app.quit().
    quitScheduled = true;
    setImmediate(async () => {
      // Stop the queue before Electron closes windows so it cannot reopen
      // the capture window and block will-quit. Persist state before teardown.
      try { await conversations?.quit(); } catch (error) {
        quitScheduled = false;
        console.error("doan: conversation persistence failed during quit", error);
        return;
      }
      // After conversations: their runs hold auth leases whose working credentials are written back here.
      await agentAuth?.quit();
      quitting = true; cancelPendingHide(); uiState?.flushSync(); thumbnails?.dispose();
      app.quit();
    });
  });
});
app.on("activate", () => {
  if (win && !win.isDestroyed()) showWindow(win);
});

app.on("will-quit", () => {
  uiState?.flushSync();
  runtime?.disposeSync();
  void shell?.dispose();
});
