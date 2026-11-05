import { parseActivityRoots, readShellActivity } from "./shellActivity";
import { ConversationService, resolveListedCanvas } from "./conversation/service";
import { ConversationStore } from "./conversation/store";
import { connectorFacts, createAccountPrepare, createPrepare, routePrepare } from "./conversation/prepare";
import { listModels, openRunner } from "./conversation/runners";
import { ModelCatalog } from "./conversation/models";
import { AttachmentStore, captureRequest, type AttachmentResult } from "./attachments";
import { conversationHandler, conversationMethods, queueFiles } from "./conversation/ipc";
import { DraftStore } from "./conversation/drafts";
import { folderRefreshes } from "./conversation/refreshes";
import { AuthManager, removeStaleLinkDirs, shellLocator, spawnAuthProcess } from "./agentAuth/manager";
import { AuthStorage } from "./agentAuth/storage";
import { electronCipher } from "./agentAuth/cipher";
import { antigravityServer } from "./agentAuth/antigravity";
import { PROVIDER_AUTH } from "./agentAuth/providers";
import { AUTH_CHANNELS, AuthIpc } from "./agentAuth/ipc";
import { sharedShell, toolFacts } from "./agentAuth/facts";
import { readUsage } from "./agentAuth/usageRead";
import { UsageService, withTurnUsage } from "./agentAuth/usageService";
import { USAGE_CHANNELS, usageRequest } from "./agentAuth/usageIpc";
import { probeShell, runProcess } from "./onboarding/machine";
import { osascriptAdmin, runAgentSetup } from "./agentSetup/runner";
import type { SetupItem } from "./agentSetup/notice";
import { ONBOARDING_CHANNELS, OnboardingService, rendererRequest } from "./onboarding/service";
import { projectLocks, type AdderProjects } from "./onboarding/projectAdder";
import { ADD_PAGE_CHANNELS, AddPageSession } from "./addPage";
import { addPageRequest } from "./addPageRequest";
import { onboardingComplete, readCompletion, writeCompletion } from "./onboarding/completion";
import { cloneEnv, locateGit } from "./onboarding/clone";
import { readGitRemotes } from "./onboarding/gitConfig";
import { canonicalFolder, cloneDestination, cloneProject, confirmProject, inspectPath, leftoverPresent, inspectUrl, selectProject, type ProjectDeps } from "./onboarding/projects";
import { DocumentBindings } from "./comments/document";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, session, shell as electronShell, systemPreferences, webContents, webFrameMain, type BaseWindow, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import { randomUUID } from "node:crypto";
import { accessSync, constants as fsConstants, readlinkSync, realpathSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Selection } from "../formats/types";
import { validateSelection } from "../formats/validate";
import { childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame } from "./canvasFrame";
import { canvasScriptSource } from "./canvasScript";
import { createAddFlow, type AddFlow } from "./addProjects";
import { cliCommand, readFolder, runConfig, runDesignSkill, runExport, runLs } from "./cli";
import { createCanvasExport, EXPORT_REFUSED } from "./canvasExport";
import { createCanvasTrash, TRASH_REFUSED, trashBusy } from "./canvasTrash";
import { createConfigBridge, type ConfigBridge } from "./configBridge";
import { aboutCli, aboutText, aboutTool, type AboutRead } from "./about";
import { PROVIDERS } from "./agentAuth/types";
import { MCP_CHANNELS, McpIpc } from "./mcpConnectors/ipc";
import { MCP_PROVIDERS } from "./mcpConnectors/presets";
import { ptySpawner } from "./mcpConnectors/pty";
import { McpService } from "./mcpConnectors/service";
import { ConnectorStore } from "./mcpConnectors/store";
import type { NotificationTarget } from "./notifications";
import { conversationNames, createNotifyService } from "./notifyService";
import { createPreferencesStore } from "./preferences";
import { createCanvasSeenStore, type CanvasSeenStore } from "./canvasSeen";
import { DESIGN_SKILL_CHANNELS, DESIGN_SKILL_REFUSED, designSkillGetRequest, interpretGet, interpretList } from "./designSkills";
import { folderState } from "./folderState";
import type { InspectResult } from "./inspect";
import { createInspector, parseInspectRequest, type Inspector } from "./inspector";
import { startRuntime, type Runtime } from "./runtime";
import { menuState, type Screen } from "./menuState";
import { senderAllowed, type WindowKind } from "./senderAllowed";
import { INSTALL_URLS, NOTIFICATION_SETTINGS_URL, parseExternalTarget, type SettingsPageTarget } from "./settings";
import { startShell, type Shell, type ProjectInitResult } from "./shell";
import { createThrottle } from "./throttle";
import { createThumbnails, type ThumbnailReply, type Thumbnails } from "./thumbnails";
import { createWindowCapturer } from "./thumbnailWindow";
import { launchedInBackground, revealFor } from "./backgroundReveal";
import { createUiStateStore, type UiStateStore } from "./uiState";
import { linkTarget } from "./openLink";
import { openLinkQueue, openRequests, resolveOpenLink } from "./deepLinks";
import { applyWork, expireWork, nextWorkExpiry, retainWorkRoots, workItems, type WorkState } from "./workState";

// Must run before `ready`: userData is derived from the name, which makes it
// ~/Library/Application Support/doan/ (beside runtime.json, ARCHITECTURE §4).
// A `--user-data-dir` switch still wins, which is how e2e keeps off the real one.
app.setName("doan");

export interface ProjectInitRequest { root: string; choiceId: string | null }
export type TokenCssChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable"; message: string };

export type ViewCommand = "zoomIn" | "zoomOut" | "actualSize" | "fit" | "reload";
// Menu items whose work belongs to the renderer's screen state.
export type MenuCommand = "home" | "quickOpen" | "newConversation" | "pickFromCanvas" | "toggleSidebar";
// What the renderer reports so main can enable menu items (design 'Menus').
// `choose`, `locked`: the Add Projects page shows its choose phase, or a phase nothing may leave (menuState).
// `overview`: a project Overview shows (File > New Conversation).
// `pickerAvailable`: the composer takes input and the canvas is loaded, so the menu follows the canvas toolbar's Picker.
export interface MenuInputs { screen: Screen; modal: boolean; choose?: boolean; locked?: boolean; overview?: boolean; pickerAvailable?: boolean; sidebarHidden?: boolean }
export type RemoveResult = { kind: "removed" } | { kind: "unavailable" };
export type LocateResult = { kind: "located"; root: string } | { kind: "refused"; message: string } | { kind: "cancelled" } | { kind: "unavailable" };
// The onboarding Project step's folder picker: a path only. Inspection, registration and setup go through the
// onboarding session, so picking a folder changes nothing.
export type FolderPurpose = "project" | "destination";

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
let configBridge: ConfigBridge | undefined;
let shell: Shell | undefined;
let runtime: Runtime | undefined;
let workState: WorkState = { roots: [], sessions: [] };
const workChanges = new Map<string, Map<string, number>>();
let workTimer: ReturnType<typeof setTimeout> | undefined;
const workLastChange = (root: string, path: string): number => workChanges.get(root)?.get(path) ?? 0;
function armWorkTimer(): void {
  if (workTimer !== undefined) clearTimeout(workTimer);
  workTimer = undefined;
  const deadline = nextWorkExpiry(workState, workLastChange);
  if (deadline === undefined) return;
  workTimer = setTimeout(() => {
    workTimer = undefined;
    updateWork(expireWork(workState, Date.now(), workLastChange));
    if (workTimer === undefined) armWorkTimer();
  }, Math.max(0, deadline - Date.now()));
  workTimer.unref();
}
function updateWork(next: WorkState): void {
  if (next === workState) return;
  const previous = workItems(workState);
  workState = next;
  const items = workItems(next);
  for (const [root, paths] of workChanges) {
    for (const path of paths.keys()) if (!items.some(item => item.root === root && item.path === path)) paths.delete(path);
    if (paths.size === 0) workChanges.delete(root);
  }
  armWorkTimer();
  if (items.length !== previous.length || items.some((item, i) => item.root !== previous[i]?.root || item.path !== previous[i]?.path || item.session !== previous[i]?.session || item.provider !== previous[i]?.provider)) send("work:changed", items);
}
let linksRendererReady = false;
const openLinks = openLinkQueue(url => {
  if (!win || win.isDestroyed()) return;
  if (appHidden) app.show();
  showWindow(win);
  send("deep-link:open", resolveOpenLink(url, shell?.entries() ?? []));
});
function openLinksReady(): boolean {
  return linksRendererReady && shell !== undefined && shell.entries().every(entry => entry.kind !== "loading");
}
function readyOpenLinks(): void {
  if (openLinksReady()) openLinks.ready();
}
// `doan open` (canvas-open-offer): not queued like a link; each request is answered on its own (deepLinks.ts).
const openCanvasRequests = openRequests({
  ready: openLinksReady,
  entries: () => shell?.entries() ?? [],
  ask(request) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
    win.webContents.send("doan-open:request", request);
    return true;
  },
  opened() {
    if (!win || win.isDestroyed()) return;
    if (appHidden) app.show();
    showWindow(win);
  },
});
// Electron 45 delivers a launch URL before ready; restoring the renderer must finish before it is consumed.
app.on("open-url", (event, url) => { event.preventDefault(); openLinks.receive(url); });
// Every way Doan becomes the frontmost app (Dock, ⌘Tab, Spotlight, Mission Control) ends here; ⌘Tab emits no
// `activate`. Without a window yet, createWindow reads app.isActive() instead.
app.on("did-become-active", () => {
  if (revealPending && win && !win.isDestroyed()) bringForward(win);
});
let conversations: ConversationService | undefined;
let agentAuth: AuthManager | undefined;
let authIpc: AuthIpc | undefined;
let usage: UsageService | undefined;
let mcp: McpService | undefined;
let onboarding: OnboardingService | undefined;
let addPage: AddPageSession | undefined;
// The socket may take a v2 request before start() has the service and the main window that owns CLI sign-ins.
let onboardingReady: (service: OnboardingService) => void = () => {};
const onboardingStarted = new Promise<OnboardingService>(resolve => { onboardingReady = resolve; });
// Each listed folder's canvas rows as last handed to the conversation service (conversation/refreshes.ts).
let conversationLists = new Map<string, readonly { path: string; rev?: number }[]>();
let inspector: Inspector | undefined;
// One selection app-wide (select-inspect R1); the socket answers it only for
// its own project. Memory only, never written to disk.
let selection: Selection | null = null;
const documents = new DocumentBindings();
// First run is open from a launch without a completion record (P's v1 marker; the legacy `{}` is not one) until the
// session reports completion. Settings and the menu wait for it, as they waited for the old wizard.
let onboardingOpen = false;
let quitting = false;
let quitScheduled = false;
let cancelPendingHide = () => {};
// A Close Window waiting for fullscreen to end: the window is about to hide, so onboarding start treats it as hidden.
let hidingAfterFullScreen = false;
let addFlow: AddFlow | undefined;
let uiState: UiStateStore | undefined;
let canvasSeen: CanvasSeenStore | undefined;
let thumbnails: Thumbnails | undefined;
// The app always starts on Home (design 'Memory model').
const HOME: MenuInputs = { screen: "home", modal: false };
let menuInputs: MenuInputs = HOME;
const FULLSCREEN_EXIT_WAIT_MS = 2000;

// Thumbnails are for the window's overview, so nothing is captured while it
// is hidden: closed with the app still running, or with the whole app hidden
// (⌘H, doan › Hide). Tracked here rather than with the window's `hide`/`show`
// events, which macOS did not emit for these calls in the e2e run.
// createWindow makes the window shown, without showWindow, except a hidden background launch.
let windowShown = true;
let appHidden = false;
// onboarding start while another app is in front: the window waits for Doan to become active (backgroundReveal.ts).
let revealPending = false;
let revealBounced = false;
function syncThumbnailPause(): void {
  if (windowShown && !appHidden) thumbnails?.resume();
  else thumbnails?.pause();
}
// The first prompt's arrival shows a toast rather than opening a canvas while
// the window is hidden; document.hidden stayed false after hide() in a real run.
function visibilityChanged(): void {
  syncThumbnailPause();
  usage?.visibilityChanged();
  send("window:visible", { visible: windowShown && !appHidden });
}

function showWindow(window: BrowserWindow): void {
  cancelPendingHide();
  // Any other way of showing the window ends the wait, so a stale one cannot show it again later.
  revealPending = false;
  revealBounced = false;
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

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && !win.isDestroyed() && fromAppFrame(event, win);
}

// A registered window's main frame, or nothing: iframes, the capture window
// and windows that are gone are not senders.
function senderKind(event: IpcMainInvokeEvent): WindowKind | undefined {
  if (fromWindow(event)) return "main";
  return undefined;
}

// Every channel goes through the main-frame allowlist; `refused` is what a
// sender that may not call it gets, the same as a forged request.
function handle(channel: string, refused: unknown, handler: (event: IpcMainInvokeEvent, value: unknown, kind: WindowKind) => unknown): void {
  ipcMain.handle(channel, (event, value: unknown) => {
    const kind = senderKind(event);
    return kind !== undefined && senderAllowed(channel, kind) ? handler(event, value, kind) : refused;
  });
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

// The composer's chip field keeps its own undo history and refuses Chromium's, so Chromium's redo stack stays empty and
// the Redo role never reached the field (nor Undo after only a chip or a paste). Edit > Undo and Redo hand a focused,
// editable chip field (ChipField marks it data-chip-field) the history beforeinput it handles; anything else focused
// gets the WebContents undo or redo the role items ran. The keys never double up: the field takes ⌘Z/⇧⌘Z in keydown,
// and a key the page handles is not a menu key equivalent.
function editHistory(kind: "undo" | "redo"): NonNullable<MenuItemConstructorOptions["click"]> {
  const script = `(() => { const field = document.activeElement; if (!(field instanceof HTMLElement) || !field.hasAttribute("data-chip-field") || !field.isContentEditable) return false;
    field.dispatchEvent(new InputEvent("beforeinput", { inputType: "${kind === "undo" ? "historyUndo" : "historyRedo"}", bubbles: true, cancelable: true })); return true; })()`;
  return (_item, window: BaseWindow | undefined) => {
    const contents = window instanceof BrowserWindow ? window.webContents : webContents.getFocusedWebContents();
    if (!contents || contents.isDestroyed()) return;
    void contents.executeJavaScript(script).catch(() => false).then(handled => { if (handled !== true && !contents.isDestroyed()) contents[kind](); });
  };
}

// Page zoom and reload roles would act on the whole window; the view commands
// go to the renderer, which zooms the board and reloads only the canvas.
// The menu is rebuilt whenever its enablement changes.
function setMenu(): void {
  const view = (command: ViewCommand) => () => send("view-command", command);
  const command = (name: MenuCommand) => () => send("menu-command", name);
  const enabled = menuState(menuInputs.screen, menuInputs.modal, { wizardOpen: onboardingOpen, choose: menuInputs.choose === true, locked: menuInputs.locked === true, overview: menuInputs.overview === true, pickerAvailable: menuInputs.pickerAvailable === true });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // Role labels would read "About doan" from app.name, which stays "doan" for userData.
      { label: "Doan", submenu: [
        { role: "about", label: "About Doan" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", enabled: enabled.settings, click: () => openSettingsPage() },
        { type: "separator" }, { role: "services" }, { type: "separator" },
        { role: "hide", label: "Hide Doan" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" }, { role: "quit", label: "Quit Doan" },
      ] },
      {
        label: "File",
        submenu: [
          { label: "New Conversation", accelerator: "CmdOrCtrl+N", enabled: enabled.newConversation, click: command("newConversation") },
          { label: "Add Project…", accelerator: "CmdOrCtrl+O", enabled: enabled.addProject, click: openAddProjects },
          { type: "separator" },
          { label: "Close Window", accelerator: "CmdOrCtrl+W", click: () => {
            if (win && !win.isDestroyed()) win.close();
          } },
        ],
      },
      // The `editMenu` role's items, spelled out so Undo and Redo reach the composer's chip field.
      {
        label: "Edit",
        submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", click: editHistory("undo") }, { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", click: editHistory("redo") }, { type: "separator" },
          { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" },
          { type: "separator" },
          { label: "Pick from Canvas", accelerator: "CmdOrCtrl+L", enabled: enabled.pickFromCanvas, click: command("pickFromCanvas") },
          { type: "separator" },
          { label: "Speech", submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] },
        ],
      },
      {
        label: "View",
        submenu: [
          // Its name follows the renderer's sidebar state, which is why `sidebarHidden` is a menu input.
          { label: menuInputs.sidebarHidden === true ? "Show Sidebar" : "Hide Sidebar", accelerator: "CmdOrCtrl+B", enabled: enabled.toggleSidebar, click: command("toggleSidebar") },
          { type: "separator" },
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
      ] },
      { role: "windowMenu" },
    ]),
  );
}

// What Home shortens project paths against; Settings rows get the result.
const homeDirectory = (): string => process.env.HOME ?? app.getPath("home");

function setMenuInputs(next: MenuInputs): void {
  if (next.screen === menuInputs.screen && next.modal === menuInputs.modal &&
    next.choose === menuInputs.choose && next.locked === menuInputs.locked && next.overview === menuInputs.overview &&
    next.pickerAvailable === menuInputs.pickerAvailable && next.sidebarHidden === menuInputs.sidebarHidden) return;
  menuInputs = next;
  setMenu();
}

const MENU_FLAGS = ["choose", "locked", "overview", "pickerAvailable", "sidebarHidden"] as const;
function parseMenuInputs(value: unknown): MenuInputs | null {
  if (typeof value !== "object" || value === null || !("screen" in value) || !("modal" in value)) return null;
  const flags = MENU_FLAGS.filter(flag => flag in value);
  if (Object.keys(value).length !== 2 + flags.length || flags.some(flag => { const set: unknown = Reflect.get(value, flag); return set !== undefined && typeof set !== "boolean"; })) return null;
  const { screen, modal } = value;
  if ((screen !== "home" && screen !== "workspace" && screen !== "canvas" && screen !== "addProjects" && screen !== "settings") || typeof modal !== "boolean") return null;
  const inputs: MenuInputs = { screen, modal };
  for (const flag of flags) if (Reflect.get(value, flag) === true) inputs[flag] = true;
  return inputs;
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
  // Launched by `onboarding start` behind the app in use: create hidden and wait, unless Doan became active during
  // startup (a Dock click or ⌘Tab), which shows it as usual.
  const hidden = launchedInBackground(process.argv) && !app.isActive();
  if (hidden) {
    revealPending = true;
    windowShown = false;
    syncThumbnailPause();
  }
  const window = new BrowserWindow({
    show: !hidden,
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
  window.webContents.on("render-process-gone", () => { selection = null; documents.clear(); setMenuInputs(HOME); });
  window.webContents.on("did-navigate", () => { selection = null; documents.clear(); setMenuInputs(HOME); });
  // Only the renderer showed and could cancel the Add Projects page's clone. First run's may belong to the CLI, so
  // it keeps running.
  window.webContents.on("render-process-gone", () => addPage?.rendererGone());
  window.webContents.on("did-navigate", () => addPage?.rendererGone());
  // Read after destroy, webContents throws, so the id is kept now.
  const owner = window.webContents.id;
  // A sign-in belongs to the renderer that started it; a lost renderer cannot cancel it any more.
  window.webContents.on("render-process-gone", () => { configBridge?.clear(); void agentAuth?.ownerClosed(owner); });
  // A reloaded renderer has no Project Settings page left to answer (buzz-settings S4).
  window.webContents.on("did-navigate", () => { configBridge?.clear(); });
  // `.git/HEAD` is not watched, so a branch switched elsewhere shows when the
  // human comes back to the window.
  const reread = createThrottle(60_000);
  window.on("focus", () => {
    if (reread()) shell?.rereadAll();
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    cancelPendingHide();
    if (window.isFullScreen()) {
      // macOS cannot hide until the transition ends; a later open cancels this close.
      const hide = () => { cancelPendingHide(); if (!window.isDestroyed()) hideWindow(window); };
      const timeout = setTimeout(() => cancelPendingHide(), FULLSCREEN_EXIT_WAIT_MS);
      hidingAfterFullScreen = true;
      cancelPendingHide = () => {
        clearTimeout(timeout);
        window.removeListener("leave-full-screen", hide);
        hidingAfterFullScreen = false;
        cancelPendingHide = () => {};
      };
      window.once("leave-full-screen", hide);
      window.setFullScreen(false);
    } else hideWindow(window);
  });
  // The traffic lights are gone in fullscreen, so the header gives back their space (shell-panel-layout §2.5).
  window.on("enter-full-screen", () => send("window:fullscreen", { fullScreen: true }));
  window.on("leave-full-screen", () => send("window:fullscreen", { fullScreen: false }));
  window.on("closed", () => {
    void agentAuth?.ownerClosed(owner);
    cancelPendingHide();
    if (win === window) win = undefined;
  });
  return window;
}

// The open-Settings command (buzz-settings design '들어가는 길'): a hidden window is shown first, then the renderer
// moves to the page. Not while first run is open, like Settings….
export function openSettingsPage(target: SettingsPageTarget = {}): boolean {
  const window = win;
  if (onboardingOpen || !window || window.isDestroyed()) return false;
  showWindow(window);
  send("settings-page:open", target);
  return true;
}

// A notification's click: the window comes forward even from a hidden app or the Dock, then the renderer decides
// where to go (notificationTarget). The test notification only shows the window.
function showFromNotification(target: NotificationTarget | null): void {
  const window = win;
  if (!window || window.isDestroyed()) return;
  if (appHidden) app.show();
  if (window.isMinimized()) window.restore();
  showWindow(window);
  window.focus();
  if (target) send("notifications:click", target);
}

function bringForward(window: BrowserWindow): void {
  if (appHidden) app.show();
  if (window.isMinimized()) window.restore();
  showWindow(window);
}

// Neither app.show() nor window.show() runs while another app is in front: both activate Doan.
function revealForStart(window: BrowserWindow): void {
  const reveal = revealFor({
    appActive: app.isActive(),
    windowVisible: windowShown && !appHidden && !window.isMinimized() && !hidingAfterFullScreen,
    bounced: revealPending && revealBounced,
  });
  if (reveal.show === "now") bringForward(window);
  if (reveal.show === "on-activate") revealPending = true;
  if (reveal.bounce) {
    app.dock?.bounce("informational");
    if (reveal.show === "on-activate") revealBounced = true;
  }
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

async function chooseFolder(purpose: unknown): Promise<string | null> {
  const window = win;
  if (!window || window.isDestroyed() || (purpose !== "project" && purpose !== "destination")) return null;
  showWindow(window);
  const picked = await dialog.showOpenDialog(window, {
    title: purpose === "project" ? "Choose Project Folder" : "Choose Where to Clone",
    properties: purpose === "project" ? ["openDirectory"] : ["openDirectory", "createDirectory"],
  });
  const path = picked.filePaths[0];
  return picked.canceled || path === undefined ? null : path;
}

// File > Add Project…: the Add Projects page, which the renderer opens (its Choose folder, when the page already shows
// its choose phase). A hidden window is shown first, as for every other way of reaching the window.
function openAddProjects(): void {
  const window = win;
  if (!window || window.isDestroyed()) return;
  showWindow(window);
  send(ADD_PAGE_CHANNELS.open);
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
  const choices = new Map<string, { id: string; path: string; epoch: number }>();
  // Only the window's copy of the list carries `unseen`; thumbnails and conversations read the shell's own entries.
  const seenStore = createCanvasSeenStore(join(userData, "canvas-seen.json"));
  canvasSeen = seenStore;
  const ready = await startShell(join(userData, "folders.json"), cliCommand(process.env, app.isPackaged, process.resourcesPath), (entries, focus) => {
    const refreshes = folderRefreshes(conversationLists, entries);
    conversationLists = refreshes.next;
    updateWork(retainWorkRoots(workState, entries.map(entry => entry.path)));
    const activeWork = workItems(workState);
    const changedAt = Date.now();
    for (const { root, changed } of refreshes.calls) {
      for (const path of changed) {
        if (!activeWork.some(item => item.root === root && item.path === path)) continue;
        let paths = workChanges.get(root);
        if (!paths) { paths = new Map(); workChanges.set(root, paths); }
        paths.set(path, changedAt);
      }
    }
    armWorkTimer();
    for (const { root, changed } of refreshes.calls) {
      try { conversations?.refreshed(root, changed); } catch (error) { console.error("doan: conversation promotion check failed", error); }
    }
    for (const root of choices.keys()) {
      if (!entries.some(entry => entry.path === root && entry.kind === "uninitialized")) choices.delete(root);
    }
    thumbnails?.entriesChanged(entries);
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("folders", seenStore.apply(entries), focus);
    readyOpenLinks();
  }, {
    response: record => documents.response(record),
    // A vanished auto-registered worktree is cleaned up like Remove (folders:remove); its work items go with the
    // list's retainWorkRoots above.
    autoRemoved(paths, before) {
      if (selection && paths.includes(selection.root)) selection = null;
      void thumbnails?.removed(paths, before);
    },
  });
  shell = ready;
  updateWork(retainWorkRoots(workState, ready.entries().map(entry => entry.path)));
  handle("work:get", [], (_event, value: unknown) => value === undefined ? workItems(workState) : []);
  handle("deep-link:ready", undefined, (_event, value: unknown) => {
    if (value !== undefined) return;
    linksRendererReady = true;
    readyOpenLinks();
  });
  handle("doan-open:answer", undefined, (_event, value: unknown) => { openCanvasRequests.answer(value); });
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
  // Read-only preset lookups through the bundled CLI: the page names an id, never a command or argument.
  handle(DESIGN_SKILL_CHANNELS.list, DESIGN_SKILL_REFUSED, async (_event, value: unknown) =>
    value === undefined ? interpretList(await runDesignSkill(cli)) : DESIGN_SKILL_REFUSED);
  handle(DESIGN_SKILL_CHANNELS.get, DESIGN_SKILL_REFUSED, async (_event, value: unknown) => {
    const id = designSkillGetRequest(value);
    return id === null ? DESIGN_SKILL_REFUSED : interpretGet(await runDesignSkill(cli, id), id);
  });
  // canvas-row-menu: Move to Trash and Export act only on rows of main's own list. Busy is judged on main's grounds:
  // this root's conversations, its unjudged project turns and terminal work.
  const canvasTrash = createCanvasTrash({
    entries: () => ready.entries(),
    busy: target => trashBusy(target, conversations?.list(target.root) ?? [], conversations?.projectEvidence(target.root) ?? [], workItems(workState)),
    trashItem: path => electronShell.trashItem(path),
  });
  handle("canvas:trashPlan", TRASH_REFUSED, (_event, value: unknown) => canvasTrash.plan(value));
  handle("canvas:trash", TRASH_REFUSED, (_event, value: unknown) => canvasTrash.trash(value));
  const canvasExport = createCanvasExport({
    entries: () => ready.entries(),
    // A name only: the panel opens where macOS last saved, and the app remembers no folder.
    async choose(name) {
      if (!win || win.isDestroyed()) return null;
      const picked = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: "HTML", extensions: ["html"] }] });
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
    running: (root, path) => send("canvas:exportRunning", { root, path }),
    run: (root, path, output) => runExport(cli, root, path, output),
    reveal: path => electronShell.showItemInFolder(path),
  });
  handle("canvas:export", EXPORT_REFUSED, (_event, value: unknown) => canvasExport.export(value));
  handle("canvas:revealExport", undefined, (_event, value: unknown) => { canvasExport.reveal(value); });
  // `doan active` is an extra; the app works without it, and the CLI then
  // reports that the app is not running.
  runtime = await startRuntime(userData, {
    isOpen, selection: () => selection,
    work(request) { updateWork(applyWork(workState, request, Date.now())); },
    roots: () => ready.entries().map(entry => entry.path),
    // Only runLs's default 10 s timeout applies, not the answer deadline: a start past it still registers
    // (runtime.ts AUTO_REGISTER_WAIT_MS).
    readRoot: async root => folderState(await runLs(cli, { repo: root })),
    // The shell publishes the list synchronously, so the work state holds the root before the start's work applies.
    adopt(root, view) { ready.adopt(root, view); },
    open: request => openCanvasRequests.open(request),
    async onboarding(request) {
      const service = await onboardingStarted;
      // start keeps the session and its input (design '설치 직후 진입'); the window comes forward only when Doan is
      // already in front.
      if (request.op === "start" && win && !win.isDestroyed()) revealForStart(win);
      return service.answer(request);
    },
  }).catch((error: unknown) => {
    console.error("doan: cannot start the runtime socket", error);
    return undefined;
  });

  removeStaleLinkDirs();
  const auth = new AuthManager({ storage: new AuthStorage(join(userData, "agent-auth"), electronCipher), spawn: spawnAuthProcess, inherited: process.env, appRuntime: join(userData, "runtime.json"), locate: shellLocator(process.env, PROVIDER_AUTH, { antigravity: signal => antigravityServer(join(userData, "agent-runtimes", "antigravity-acp"), signal ? { signal } : {}) }),
    // The onboarding tap comes after AuthIpc stored the link, so the link it opens is this prompt's.
    onChange: () => authIpc?.changed(), onPrompt: prompt => { authIpc?.prompted(prompt); onboarding?.prompted(prompt); },
    // A sign-out or replacement also stops the provider's usage read, whose lease it waits for like a run's.
    stopRuns: provider => Promise.all([conversations?.stopRuns(provider), usage?.stop(provider)]).then(() => {}),
    // Every sign-in or sign-out write first stops the provider's MCP connector work, lease or not.
    stopMcp: provider => mcp?.stopProvider(provider) ?? Promise.resolve(),
    mcpLogout: (provider, request) => mcp ? mcp.logoutForAuth(provider, request) : Promise.resolve({ failed: [] }) });
  // Unreadable metadata leaves sign-in unavailable rather than letting a later save erase other connections.
  try { await auth.load(); agentAuth = auth; } catch (error) { console.error("doan: agent sign-in storage is unreadable", error); }
  const executable = (path: string) => { try { accessSync(path, fsConstants.X_OK); return statSync(path).isFile(); } catch { return false; } };
  const shellForFacts = sharedShell(() => probeShell(process.env));
  // Agent setup (zero-setup-agents design '언제, 어떤 복사본이 쓰는가'): once per launch, beside the window rather than
  // before it. About waits for this result, which stays pending while the administrator dialog is open; a run that
  // throws becomes a crashed item, so About never shows its failure as "every agent was set up".
  const agentSetup = shellForFacts().then(probe => runAgentSetup({
    home: homeDirectory(), resources: process.resourcesPath, isPackaged: app.isPackaged, loginPath: probe.ok ? probe.path : null,
    shell: process.env.SHELL ?? "", userData, runAdmin: osascriptAdmin,
  })).catch((error: unknown) => {
    console.error("doan: agent setup failed", error);
    const crashed: SetupItem = { target: "setup", providers: [...PROVIDERS], reason: "crashed" };
    return { home: homeDirectory(), items: [crashed] };
  });
  if (agentAuth) {
    authIpc = new AuthIpc({
      backend: agentAuth, openExternal: url => electronShell.openExternal(url),
      probe: provider => toolFacts(provider, { shell: shellForFacts, run: runProcess, executable, inherited: process.env, cli }),
      // MCP Connectors follows every auth change: readiness, a new verified connection (pending logouts, reconcile and
      // status reads) or a lost one.
      publish: snapshot => { send(AUTH_CHANNELS.changed, snapshot); onboarding?.authChanged(snapshot); for (const provider of MCP_PROVIDERS) mcp?.authChanged(provider); usage?.authChanged(); },
      prompt: (owner, event) => { if (win && !win.isDestroyed() && win.webContents.id === owner) send(AUTH_CHANNELS.prompt, event); },
    });
  }
  // Agent usage (ARCHITECTURE §7): read on fixed triggers into main memory only, shown only while the window is.
  if (agentAuth && authIpc) {
    const auth = agentAuth, ipc = authIpc, probeDir = join(userData, "usage-probe");
    usage = new UsageService({
      auth,
      readiness: provider => ipc.latest().providers.find(status => status.provider === provider)?.readiness ?? { ready: false, cause: "not_connected", action: "signIn" },
      read: (provider, lease, signal) => readUsage(provider, lease, { spawn: spawnAuthProcess, probeDir }, signal),
      visible: () => windowShown && !appHidden,
      publish: entries => send(USAGE_CHANNELS.changed, entries),
    });
    // App start: once the tool facts are read, which readiness needs. A failed probe also ends the pre-facts hold, or
    // blocked providers would read "Reading usage…" forever.
    const started = usage;
    void ipc.read().then(() => started.trigger({ kind: "start" }), (error: unknown) => {
      console.error("doan: agent usage could not start", error);
      started.trigger({ kind: "start" });
    });
  }
  handle(USAGE_CHANNELS.read, [], (_event, value) => usage ? usageRequest(usage, value) : []);
  // MCP Connectors (mcp-connectors): provider CLIs register, sign in and keep the tokens in the Doan profiles; Doan
  // keeps the server list. It needs agent sign-in storage: without it every MCP call is refused like a forged one.
  if (agentAuth) {
    const auth = agentAuth;
    mcp = new McpService({
      store: new ConnectorStore(userData), auth,
      readiness: provider => authIpc?.latest().providers.find(status => status.provider === provider)?.readiness ?? { ready: false, cause: "not_connected", action: "signIn" },
      spawn: spawnAuthProcess, spawnPty: ptySpawner({ packaged: app.isPackaged }),
      openExternal: url => electronShell.openExternal(url),
      publish: snapshot => send(MCP_CHANNELS.changed, snapshot),
    });
  }
  const mcpIpc = mcp ? new McpIpc(mcp) : null;
  for (const channel of [MCP_CHANNELS.list, MCP_CHANNELS.add, MCP_CHANNELS.connect, MCP_CHANNELS.disconnect, MCP_CHANNELS.remove, MCP_CHANNELS.cancel, MCP_CHANNELS.openLink]) {
    const refused = channel === MCP_CHANNELS.list ? null : { ok: false, reason: "invalid" };
    handle(channel, refused, (_event, value) => mcpIpc ? mcpIpc.handle(channel, value) : refused);
  }
  for (const provider of MCP_PROVIDERS) mcp?.authChanged(provider);
  // Without readable account storage every auth call is refused like a forged one; reads answer null.
  for (const channel of [AUTH_CHANNELS.read, AUTH_CHANNELS.check, AUTH_CHANNELS.signIn, AUTH_CHANNELS.cancel, AUTH_CHANNELS.submitCode, AUTH_CHANNELS.openLink, AUTH_CHANNELS.signOut]) {
    const refused = channel === AUTH_CHANNELS.read ? null : { ok: false, reason: "invalid" };
    handle(channel, refused, (event, value) => authIpc ? authIpc.handle(channel, value, event.sender.id) : refused);
  }
  // Registration goes through Add Project's judgement; a folder that only a confirmation would store is confirmed
  // here because the request already carried the user's explicit setup intent.
  const projectDeps: ProjectDeps = {
    ls: async target => folderState(await runLs(cli, target)),
    registered: () => ready.entries().map(entry => entry.path),
    async add(path) {
      const flow = addFlow;
      if (!flow) return null;
      const outcome = await flow.add(path);
      // A duplicate may be an auto-registered worktree; choosing it by hand makes it hand-added.
      if (outcome.duplicate) await ready.store([outcome.duplicate]);
      const stored = outcome.added[0] ?? outcome.duplicate;
      if (stored) return stored;
      const confirm = outcome.confirm;
      if (!confirm) return null;
      const confirmed = await flow.confirm({ confirmId: confirm.confirmId });
      return confirmed.kind === "added" && ready.entries().some(entry => entry.path === confirm.path) ? confirm.path : null;
    },
    initialize: root => ready.initialize(root, null),
    remotes: root => readGitRemotes(root, homeDirectory()),
  };
  const realOrNull = (path: string) => { try { return realpathSync(path); } catch { return null; } };
  // The developer directory xcode-select would use, read without running it (see locateGit).
  const developerDir = () => { if (process.env.DEVELOPER_DIR) return process.env.DEVELOPER_DIR; try { return readlinkSync("/var/db/xcode_select_link"); } catch { return null; } };
  // First run and the Add Projects page add projects with the same folder work and locks (design 'main의 project 처리').
  const locks = projectLocks();
  const projectWork: AdderProjects = {
    folder: canonicalFolder, destination: path => cloneDestination(path, projectDeps),
    inspectPath: (real, repo) => inspectPath(real, projectDeps, repo), inspectUrl: repo => inspectUrl(repo, projectDeps),
    select: (path, initialize, repo) => selectProject(path, initialize, repo, projectDeps),
    present: leftoverPresent,
    clone: (url, destination, signal, commit) => cloneProject(url, destination, signal, {
      ...projectDeps,
      async git() {
        const probe = await shellForFacts();
        const path = probe.ok ? probe.path : null;
        const git = locateGit({ path, executable, realpath: realOrNull, developerDir });
        return git !== null && path !== null ? { git, env: cloneEnv(process.env, path) } : null;
      },
    }, commit),
  };
  const onboardingService = new OnboardingService({
    auth: authIpc ?? null,
    mainOwner: () => win && !win.isDestroyed() ? win.webContents.id : null,
    completed: () => onboardingComplete(readCompletion(userData)),
    publish: state => {
      send(ONBOARDING_CHANNELS.changed, state);
      // Completion saved (from the window or the CLI): first run is over for this launch too.
      if (state.completed && onboardingOpen) { onboardingOpen = false; setMenu(); }
    },
    projects: { ...projectWork, confirm: root => confirmProject(root, projectDeps), saveCompletion: root => writeCompletion(userData, root) },
    locks,
  });
  onboarding = onboardingService;
  const sessionRefused = { v: 2, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } };
  const sessionOps = { start: "start", status: "status", check: "check", cancel: "cancel", inspect: "project_inspect", select: "project_select", clone: "project_clone", complete: "complete" } as const;
  for (const [name, op] of Object.entries(sessionOps) as [keyof typeof sessionOps, (typeof sessionOps)[keyof typeof sessionOps]][]) {
    handle(ONBOARDING_CHANNELS[name], sessionRefused, (event, value: unknown) => {
      const request = rendererRequest(op, value);
      return fromWindow(event) && request !== null ? onboardingService.answer(request) : sessionRefused;
    });
  }
  const page = new AddPageSession({ projects: projectWork, locks, publish: state => send(ADD_PAGE_CHANNELS.changed, state) });
  addPage = page;
  for (const op of ["read", "inspect", "select", "clone", "cancel"] as const) {
    handle(ADD_PAGE_CHANNELS[op], sessionRefused, (event, value: unknown) => {
      const request = addPageRequest(op, value);
      return fromWindow(event) && request !== null ? page.answer(request) : sessionRefused;
    });
  }
  // The legacy external prepare gets no records: its runs use the user's own profile and readiness does not cover them.
  // Runs read the MCP connectors' generation and names when they ask (mcp-connectors C1/C2).
  const accountPrepare = createAccountPrepare(auth, cli, provider => void authIpc?.refreshTools(provider), authIpc, connectorFacts(() => mcp));
  // Without readable account storage a doan-account run is refused; it never falls back to the external profile.
  const prepareConversation = routePrepare(createPrepare(userData, join(userData, "runtime.json"), process.env),
    (request, stored, use) => agentAuth ? accountPrepare(request, stored, use).then(prepared => use === "listing" || !usage ? prepared : withTurnUsage(prepared, usage)) : Promise.reject(new Error("not_logged_in")));
  const conversationStore = new ConversationStore(userData);
  // After the store, which made and checked the conversations directory.
  const conversationDrafts = new DraftStore(join(userData, "conversations"));
  const preferences = createPreferencesStore(join(userData, "preferences.json"));
  const notify = createNotifyService({
    preferences: () => preferences.current().notifications,
    visibility: () => ({ focused: win !== undefined && !win.isDestroyed() && win.isFocused(), shown: windowShown, minimized: win !== undefined && !win.isDestroyed() && win.isMinimized(), appHidden }),
    names(conversationId) {
      // An unreadable conversation index fails the conversation calls themselves, which report it; here it only
      // leaves the event without a notification.
      try { return conversationNames(conversationStore.list(), ready.entries(), conversationId); } catch { return null; }
    },
    create(content) {
      const notification = new Notification(content);
      return { show: () => notification.show(), close: () => notification.close(), on: (event, listener) => notification.on(event as "click", listener) };
    },
    clicked: showFromNotification,
    log: (message, detail) => console.error(message, detail),
  });
  const attachments = new AttachmentStore(join(userData, "attachments"), {
    thumbnail: bytes => {
      const image = nativeImage.createFromBuffer(Buffer.from(bytes)); if (image.isEmpty()) return null;
      const { width, height } = image.getSize();
      return new Uint8Array(image.resize(width >= height ? { width: Math.min(width, 160) } : { height: Math.min(height, 160) }).toPNG());
    },
    // Re-encoding keeps only pixels: whatever else the pasted bytes carried is not written to disk.
    reencode: bytes => { const image = nativeImage.createFromBuffer(Buffer.from(bytes)); return image.isEmpty() ? null : new Uint8Array(image.toPNG()); },
  });
  let modelCatalog: ModelCatalog | undefined;
  const conversationService = new ConversationService(conversationStore, prepareConversation, openRunner, event => { send("conversation:event", event); notify.event(event); }, (root, canvas) => {
    const project = ready.entries().find(entry => entry.path === root);
    if (!project) throw new Error("project_not_open");
    if (canvas) {
      if (project.kind !== "list") throw new Error("canvas_not_found");
      return resolveListedCanvas(canvas, project.canvases);
    }
  }, undefined, root => {
    const project = ready.entries().find(entry => entry.path === root);
    return project?.kind === "list" ? project.canvases : [];
  }, root => send("conversation:listChanged", { root }), { drafts: conversationDrafts, files: queueFiles(attachments), defaultEffort: (root, provider, model) => modelCatalog?.defaultEffort(root, provider, model) }, id => notify.close(id));
  conversations = conversationService;
  attachments.cleanup();
  modelCatalog = new ModelCatalog((root, runtime) => conversationService.prepareListing(root, runtime), input => conversationService.listModels(input, listModels));
  const conversationRequest = conversationHandler(conversationService, prepareConversation, () => ready.entries(), { models: modelCatalog, attachments });
  for (const method of conversationMethods) {
    ipcMain.handle(`conversation:${method}`, (event, value: unknown) => conversationRequest(fromWindow(event), method, value));
  }

  // Home attachments: paths the person chose, checked and kept by main; the page never names a path main did not give it.
  handle("attachments:choose", [], async (event): Promise<AttachmentResult[]> => {
    if (!fromWindow(event) || !win) return [];
    const picked = await dialog.showOpenDialog(win, { title: "Attach Files", properties: ["openFile", "multiSelections"] });
    return picked.canceled || picked.filePaths.length === 0 ? [] : attachments.addPaths({ paths: picked.filePaths.slice(0, 64) }) ?? [];
  });
  handle("attachments:add-paths", null, (event, value: unknown) => fromWindow(event) ? attachments.addPaths(value) : null);
  handle("attachments:add-pasted", null, (event, value: unknown) => fromWindow(event) ? attachments.addPasted(value) : null);
  handle("attachments:remove", false, (event, value: unknown) => fromWindow(event) && attachments.remove(value));
  handle("attachments:recheck", null, (event, value: unknown) => fromWindow(event) ? attachments.recheck(value) : null);
  handle("attachments:release", false, (event, value: unknown) => fromWindow(event) && attachments.release(value));
  handle("attachments:fromPaths", null, (event, value: unknown) => fromWindow(event) ? attachments.fromPaths(value) : null);
  // The pixels the person sees in a rect of the window, read by main; the renderer names only the rect. A fresh window
  // is not needed: capturePage reads the compositor, which includes the board's cross-site iframe.
  handle("attachments:capture", null, async (event, value: unknown): Promise<AttachmentResult | null> => {
    if (!fromWindow(event) || !win || win.isDestroyed()) return null;
    const rect = captureRequest(value, win.getContentSize() as [number, number]);
    if (!rect) return null;
    const failed: AttachmentResult = { ok: false, name: "Canvas capture", error: "capture_failed" };
    try {
      const image = await win.webContents.capturePage(rect);
      return image.isEmpty() ? failed : attachments.addCaptured(new Uint8Array(image.toPNG()));
    } catch { return failed; }
  });

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
  handle("window:fullscreen", null, event => fromWindow(event) ? { fullScreen: win!.isFullScreen() } : null);
  handle("folders:get", [], (event) => (fromWindow(event) ? seenStore.apply(ready.entries()) : []));
  handle("canvas:seen", false, (event, value: unknown) => {
    if (!fromWindow(event)) return false;
    const entries = ready.entries();
    if (!seenStore.mark(entries, value)) return false;
    send("folders", seenStore.apply(entries));
    return true;
  });
  const flow = createAddFlow({
    ls: async target => folderState(await runLs(cli, target)),
    saved: () => ready.entries().map((entry) => entry.path),
    store: (paths) => ready.store(paths),
  });
  addFlow = flow;
  // A row or a whole card.
  handle("folders:remove", { kind: "unavailable" }, (event, value: unknown): Promise<RemoveResult> | RemoveResult => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("paths" in value)) return { kind: "unavailable" };
    const paths: unknown = value.paths;
    const stored = ready.entries();
    if (!Array.isArray(paths) || paths.length === 0 || new Set(paths).size !== paths.length ||
      !paths.every((path) => stored.some((entry) => entry.path === path))) return { kind: "unavailable" };
    const roots = paths.map(String);
    const before = ready.entries();
    if (selection && roots.includes(selection.root)) selection = null;
    return new Promise((resolve) => {
      void ready.remove(roots).then((removed) => {
        if (removed.paths.length === 0) { resolve({ kind: "unavailable" }); return; }
        void thumbs.removed(removed.paths, before);
        resolve({ kind: "removed" });
      });
    });
  });
  handle("folders:locate", { kind: "unavailable" }, async (event, value: unknown): Promise<LocateResult> => {
    const from = storedPath(value);
    if (!fromWindow(event) || from === null || !win) return { kind: "unavailable" };
    const picked = await dialog.showOpenDialog(win, { title: "Locate", properties: ["openDirectory"] });
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
  // A canvas click reaches the renderer only as the canvas's own message, and the renderer gets no pointer events over
  // the canvas's out-of-process iframe, so it asks where the OS cursor is before moving focus to the canvas.
  handle("pointer:get", null, (event) => {
    if (!fromWindow(event) || win === undefined) return null;
    const cursor = screen.getCursorScreenPoint(), content = win.getContentBounds(), zoom = event.sender.getZoomFactor();
    return { x: (cursor.x - content.x) / zoom, y: (cursor.y - content.y) / zoom };
  });
  handle("ui-state:get", null, (event) => (fromWindow(event) ? store.read() : null));
  handle("ui-state:save", false, (event, value: unknown) => fromWindow(event) && store.save(value));
  // buzz-settings: the Settings page's preferences, notifications and About. Main fixes the URL, the notification
  // and the clipboard text; the renderer sends a change or nothing.
  handle("preferences:read", null, () => preferences.read());
  handle("preferences:write", null, (_event, value: unknown) => preferences.update(value));
  handle("notifications:test", null, (_event, value: unknown) => value === undefined ? notify.test() : null);
  handle("notifications:open-settings", false, async (_event, value: unknown) => {
    if (value !== undefined) return false;
    try { await electronShell.openExternal(NOTIFICATION_SETTINGS_URL); return true; } catch { return false; }
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
  // First run and Agents' Install/Update open the providers' install pages.
  handle("setup:open-external", false, async (_event, value: unknown) => {
    const target = parseExternalTarget(value);
    if (target === null) return false;
    try { await electronShell.openExternal(INSTALL_URLS[target]); return true; } catch { return false; }
  });
  // Links in agent replies: https only, rebuilt by main from the request.
  handle("shell:openLink", false, async (_event, value: unknown) => {
    const url = linkTarget(value);
    if (url === null) return false;
    try { await electronShell.openExternal(url); return true; } catch { return false; }
  });
  const copy = async (text: string) => {
    try { await clipboard.writeText(text); return { kind: "success" as const }; }
    catch (error) { return { kind: "error" as const, message: error instanceof Error ? error.message : String(error) }; }
  };
  // Tool facts come from AuthIpc's cache (its first read probes once); only the doan version runs the CLI.
  let lastAbout: AboutRead | null = null;
  const readAbout = async (): Promise<AboutRead> => {
    const [run, setup] = await Promise.all([runDesignSkill(command), agentSetup, authIpc?.read()]);
    const ipc = authIpc;
    const tools = ipc ? PROVIDERS.flatMap(provider => { const facts = ipc.toolFacts(provider); return facts ? [aboutTool(provider, facts)] : []; }) : null;
    lastAbout = { version: app.getVersion(), cli: aboutCli(command, run), tools, setup: { home: setup.home, items: setup.items } };
    return lastAbout;
  };
  handle("about:read", null, (_event, value: unknown) => value === undefined ? readAbout() : null);
  // Copies what About last showed, so the text matches the page.
  handle("about:copy", { kind: "stale" }, async (_event, value: unknown) => value === undefined ? copy(aboutText(lastAbout ?? await readAbout())) : { kind: "stale" });
  handle("onboarding:choose-folder", null, (event, value: unknown) => fromWindow(event) ? chooseFolder(value) : null);

  const bridge = createConfigBridge({
    run: (root, args) => runConfig(command, root, args),
    epoch: root => ready.entries().some(entry => entry.path === root && entry.kind === "list") ? ready.epoch(root) : null,
    async pick(root, kind) {
      const window = win;
      if (!window || window.isDestroyed()) return null;
      const picked = await dialog.showOpenDialog(window, kind === "tokenCss"
        ? { title: "Choose Token CSS", properties: ["openFile"], defaultPath: root, filters: [{ name: "CSS", extensions: ["css"] }] }
        : { title: "Add File or Folder", properties: ["openFile", "openDirectory"], defaultPath: root });
      return picked.canceled ? null : picked.filePaths[0] ?? null;
    },
  });
  configBridge = bridge;
  handle("config:read", { kind: "unavailable" }, (_event, value: unknown) => bridge.read(value));
  handle("config:choose", { kind: "unavailable" }, async (event, value: unknown, kind) => {
    const choice = await bridge.choose(value);
    return senderKind(event) === kind ? choice : { kind: "unavailable" };
  });
  handle("config:write", { kind: "unavailable" }, (_event, value: unknown) => bridge.write(value));
  // A Project Settings page mounted or unmounted: a new session, and late replies of the old one answer unavailable.
  handle("config:session-start", undefined, () => { bridge.clear(); });
  handle("config:session-end", undefined, () => { bridge.clear(); });

  onboardingOpen = !onboardingComplete(readCompletion(userData));
  setMenu();
  win = createWindow();
  onboardingReady(onboardingService);
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
  // An inspector quit can interrupt a BrowserWindow constructor before its
  // JS wrapper exists. Electron then crashes trying to emit its close event.
  // Let the native stack unwind before either disposal or app.quit().
  quitScheduled = true;
  // conversation:delete answers busy while quitting as while working; this lets the renderer tell the two apart. Never
  // taken back: after an aborted quit the conversations stay stopped (the service stays quitting) until a restart.
  send("app:quitting", true);
  // Accepted: onboarding saves no completion, and neither it nor the Add Projects page starts project work from here,
  // before any teardown is awaited.
  onboarding?.closeForQuit();
  addPage?.closeForQuit();
  setImmediate(async () => {
    // Stop the queue before Electron closes windows so it cannot reopen
    // the capture window and block will-quit. Persist state before teardown.
    try { await conversations?.quit(); } catch (error) {
      quitScheduled = false;
      onboarding?.reopenAfterAbortedQuit();
      addPage?.reopenAfterAbortedQuit();
      console.error("doan: conversation persistence failed during quit", error);
      return;
    }
    // MCP connector attempts are cancelled and write no result; their leases go before agent sign-in quits.
    await mcp?.quit();
    // Usage reads are stopped and their leases released before agent sign-in quits.
    await usage?.quit();
    // After conversations: their runs hold auth leases whose working credentials are written back here.
    await agentAuth?.quit();
    // Each adder owns only its clones; stopping them removes their temporary directories.
    await Promise.all([onboarding?.quit(), addPage?.quit()]);
    quitting = true; cancelPendingHide(); uiState?.flushSync(); canvasSeen?.flushSync(); thumbnails?.dispose();
    app.quit();
  });
});
app.on("activate", () => {
  if (win && !win.isDestroyed()) showWindow(win);
});

app.on("will-quit", () => {
  if (workTimer !== undefined) clearTimeout(workTimer);
  workTimer = undefined;
  uiState?.flushSync();
  canvasSeen?.flushSync();
  runtime?.disposeSync();
  void shell?.dispose();
});
