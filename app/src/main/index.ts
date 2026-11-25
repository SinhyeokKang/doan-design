import { groupRoots as removalGroup } from "../renderer/homeCards";
import { parseActivityRoots, readShellActivity } from "./shellActivity";
import { ConversationService, resolveListedCanvas } from "./conversation/service";
import { ConversationStore } from "./conversation/store";
import { connectorFacts, createAccountPrepare, createPrepare, routePrepare, wireAccountPrepare } from "./conversation/prepare";
import { listModels, listSkills, openRunner } from "./conversation/runners";
import { ModelCatalog } from "./conversation/models";
import { SkillCatalog } from "./conversation/skills";
import { AttachmentStore, captureRequest, type AttachmentResult } from "./attachments";
import { createAttachmentHandlers, type AttachmentOwner } from "./attachmentHandlers";
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
import { readCursorSummary, readUsage } from "./agentAuth/usageRead";
import { UsageService, withTurnUsage } from "./agentAuth/usageService";
import { clockArgument, clockHour12 } from "./clockHourCycle";
import { USAGE_CHANNELS, usageRequest } from "./agentAuth/usageIpc";
import { probeShell, runProcess } from "./onboarding/machine";
import { osascriptAdmin, runAgentSetup, setupEligibility } from "./agentSetup/runner";
import type { SetupItem } from "./agentSetup/notice";
import { ONBOARDING_CHANNELS, OnboardingService, rendererRequest } from "./onboarding/service";
import { projectLocks, type AdderProjects } from "./onboarding/projectAdder";
import { ADD_PAGE_CHANNELS, AddPageSession } from "./addPage";
import { addPageRequest } from "./addPageRequest";
import { onboardingComplete, readCompletion, writeCompletion } from "./onboarding/completion";
import { cloneEnv, locateGit } from "./onboarding/clone";
import { readGitRemotes } from "./onboarding/gitConfig";
import { canonicalFolder, cloneDestination, cloneProject, confirmProject, inspectPath, leftoverPresent, inspectUrl, newFolderTarget, selectProject, type NewFolderTarget, type ProjectDeps } from "./onboarding/projects";
import { groupRoots, projectKeepsLocal } from "./storage";
import { DocumentBindings } from "./document/bindings";
import { restoreLaunchdCaCerts, trustExtraCaCerts } from "./launchEnv";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, powerMonitor, screen, session, shell as electronShell, systemPreferences, webContents, webFrameMain, type BaseWindow, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type Session } from "electron";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants as fsConstants, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrototypeRequest, PrototypeResponse, Selection } from "../formats/types";
import { validateSelection } from "../formats/validate";
import { childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame } from "./canvasFrame";
import { editMenuInput, editMenuTemplate } from "./editMenu";
import { canvasScriptSource } from "./canvasScript";
import { createAddFlow, type AddFlow } from "./addProjects";
import { cliCommand, cliEnv, runConfig, runDesignSkill, runExport, runLs, type CliEnv } from "./cli";
import { createCanvasExport, createPrototypeExport, EXPORT_REFUSED } from "./canvasExport";
import { createCanvasTrash, TRASH_REFUSED, trashBusy } from "./canvasTrash";
import { createConfigBridge, storageWrite, type ConfigBridge } from "./configBridge";
import { aboutCli, aboutText, aboutTool, type AboutRead } from "./about";
import { PROVIDERS } from "./agentAuth/types";
import { MCP_CHANNELS, McpIpc } from "./mcpConnectors/ipc";
import { MCP_PROVIDERS } from "./mcpConnectors/presets";
import { ptySpawner } from "./mcpConnectors/pty";
import { McpService } from "./mcpConnectors/service";
import { ConnectorStore } from "./mcpConnectors/store";
import type { NotificationTarget } from "./notifications";
import { conversationNames, createNotifyService } from "./notifyService";
import { createPreferencesStore, windowBuddy } from "./preferences";
import { buddyIntroShown } from "./buddyIntro";
import { answerCliRemove } from "./cliRemove";
import type { BuddyId } from "../renderer/buddies";
import { createLocalSeen, type LocalSeen } from "./canvasSeen";
import { compositingEnabled, createGpuLog } from "./gpuLog";
import { createOpaqueFallback } from "./opaqueFallback";
import { createReadState, type ReadState } from "./readState";
import { createFingerprints } from "./seenFingerprint";
import { shownDocument } from "./seenProof";
import { readSeen } from "./seenRecords";
import { readGitSignal } from "./gitSignal";
import { DESIGN_SKILL_CHANNELS, DESIGN_SKILL_REFUSED, designSkillGetRequest, interpretGet, interpretList } from "./designSkills";
import { folderState, realHome } from "./folderState";
import { revealTarget, type FolderEntry } from "./view";
import { createWindowDebugger, type WindowDebugger } from "./windowDebugger";
import { createInspector, parseInspectRequest, type InspectRefused, type InspectReply, type Inspector } from "./inspector";
import { CONVERSATION_RUNTIME, startRuntime, type Runtime } from "./runtime";
import { menuState, SCREENS, updateMenu, type Screen } from "./menuState";
import { electronUpdater, hasFeedConfig, releaseNotesUrl, UpdateService } from "./update/service";
import { updateEligibility } from "./update/eligibility";
import { installGate } from "./update/gate";
import { REPOSITORY_URL } from "./repository";
import { createStarPrompt, type StarPromptStore } from "./starPromptStore";
import { updateView, type UpdateMenuView } from "./update/view";
import { senderAllowed, type WindowKind } from "./senderAllowed";
import { usagePublisher, usageVisible } from "./usageWindows";
import { INSTALL_URLS, NOTIFICATION_SETTINGS_URL, parseExternalTarget, type SettingsPageTarget } from "./settings";
import { createInstallOpener } from "./installCommand";
import { startShell, type Shell, type ProjectInitResult } from "./shell";
import { guardLoopback } from "./serve/loopback";
import { refusesRemoteDebugging } from "./remoteDebugging";
import { createThrottle } from "./throttle";
import { createThumbnails, type ThumbnailReply, type Thumbnails } from "./thumbnails";
import { createWindowCapturer } from "./thumbnailWindow";
import { launchedInBackground, revealFor } from "./backgroundReveal";
import { createUiStateStore, moveUiStateRoots, type UiStateStore } from "./uiState";
import { linkTarget } from "./openLink";
import { openLinkQueue, openRequests, resolveOpenLink } from "./deepLinks";
import { applyWork, expireWork, nextWorkExpiry, retainWorkRoots, workItems, workItemsChanged, type WorkState } from "./workState";
import { applyConversationWork, endConversationWork, type ConversationWork } from "./conversationWork";
import { othersOnCanvas } from "./workOthers";
import { PROTOTYPE_CHANNELS, PROTOTYPE_WINDOW_REQUESTS } from "./prototype/ipc";
import {
  prototypeAuthSnapshot, prototypeConversationListed, prototypeConversationScope, prototypeEntry, prototypeListElsewhere, prototypeListRows, prototypeReceives, prototypeRememberedConversation, prototypeRevealRequest, prototypeWorkItems,
  type ConversationBroadcast, type ResumeSession, type ScopedConversation,
} from "./prototype/conversationScope";
import { canvasKeyString } from "./prototype/targets";
import { prototypeThumbnailRoot } from "./prototype/thumbnailScope";
import { parseComposerChoice, parseRevealRequest } from "./prototype/requests";
import { createPrototypeShowing } from "./prototype/showing";
import { createTargetRelay } from "./prototype/targetRelay";
import { parseUiState } from "../restore/uiState";
import { createComposerSettings } from "./prototype/composerSettings";
import { createPrototypeWindow } from "./prototypeWindow";
import { answerCliPlay } from "./prototype/cliPlay";

// Exits synchronously: `app.exit` would let the rest of this module run first.
if (refusesRemoteDebugging(app.commandLine, app.isPackaged)) {
  process.stderr.write("Doan does not start with Chromium remote-debugging switches.\n");
  process.exit(1);
}

// Before `ready`: userData (~/Library/Application Support/doan/, ARCHITECTURE §4) is derived from the name. A
// `--user-data-dir` switch still wins, which keeps e2e off the real one.
app.setName("doan");

// storage "local" keeps the Doan files out of Git; null follows the root's current mode. gitInit: the Set Up form
// showed the .git/ its Keep out of Git setup creates.
export interface ProjectInitRequest { root: string; choiceId: string | null; storage: "local" | null; gitInit?: true }
export type TokenCssChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable"; message: string };

export type ViewCommand = "zoomIn" | "zoomOut" | "actualSize" | "fit" | "reload";
// Menu items whose work belongs to the renderer's screen state.
export type MenuCommand = "home" | "quickOpen" | "newConversation" | "pickFromCanvas" | "toggleSidebar";
// What the renderer reports so main can enable menu items. `projectSettings`: the "settings" screen is Project
// Settings, which enables the menu as Settings does; only `doan remove`'s busy sentence tells them apart.
export interface MenuInputs { screen: Screen; modal: boolean; choose?: boolean; locked?: boolean; overview?: boolean; pickerAvailable?: boolean; sidebarHidden?: boolean; projectSettings?: boolean }
export type RemoveResult = { kind: "removed" } | { kind: "unavailable" } | { kind: "busy" } | { kind: "loading" } | { kind: "groupChanged"; paths: string[] };
export type LocateResult = { kind: "located"; root: string } | { kind: "refused"; message: string } | { kind: "cancelled" } | { kind: "unavailable" };
// The onboarding Project step's folder picker: a path only. Inspection, registration and setup go through the
// onboarding session, so picking a folder changes nothing.
export type FolderPurpose = "project" | "destination";
// New folder's answer: newFolderTarget's judgment of the panel's path, or cancelled when the panel was, or the step or
// window that asked went first.
export type NewFolderResult = NewFolderTarget;
// New folder requests in flight, by the Project step's token, with the sending webContents id (only its top frame
// may). The step cancels its own when it goes while the window stays, so a Create that returns later makes nothing.
const folderRequests = new Map<string, number>();
function dropFolderRequests(contentsId: number): void {
  for (const [token, owner] of folderRequests) if (owner === contentsId) folderRequests.delete(token);
}

// The window only ever shows the bundled UI; canvases live in a sandboxed iframe whose navigation stays on the local
// server. Anything else a page tries to open or navigate to is refused.
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
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- updateWork can re-arm the timer
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
  if (workItemsChanged(previous, items)) send("work:changed", items);
  sendPrototypeWork();
}
// App conversations' work updates, kept apart from terminal work so they never count as a terminal.
let conversationWork: readonly ConversationWork[] = [];
function updateConversationWork(next: readonly ConversationWork[]): void {
  if (next === conversationWork) return;
  conversationWork = next;
  send("conversation-work:changed", next);
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
// `doan open`: not queued like a link; each request is answered on its own (deepLinks.ts).
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
let updates: UpdateService | undefined;
let starPrompt: StarPromptStore | undefined;
// The menu item's view as last built, so a snapshot that leaves it alone does not rebuild the menu.
let updateMenuKey = "";
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
let windowDebugger: WindowDebugger | undefined;
let inspector: Inspector | undefined;
// One selection app-wide; the socket answers it only for
// its own project. Memory only, never written to disk.
let selection: Selection | null = null;
const documents = new DocumentBindings();
// First run is open from a launch without a v1 completion record (the legacy `{}` is not one) until the session
// reports completion. Settings and the menu wait for it.
let onboardingOpen = false;
// The existing-user buddy screen, decided once at launch (buddyIntro.ts). It holds first run's lock until the renderer
// reports it closed; a reloaded renderer reads it again and shows it again while it is still open.
let buddyIntroOpen = false;
let quitting = false;
let quitScheduled = false;
let cancelPendingHide = () => {};
// A Close Window waiting for fullscreen to end: the window is about to hide, so onboarding start treats it as hidden.
let hidingAfterFullScreen = false;
let addFlow: AddFlow | undefined;
let uiState: UiStateStore | undefined;
let canvasSeen: LocalSeen | undefined;
let readState: ReadState | undefined;
let thumbnails: Thumbnails | undefined;
// The app always starts on Home.
const HOME: MenuInputs = { screen: "home", modal: false };
let menuInputs: MenuInputs = HOME;
// The prototype window has focus: the main window's own menu items go off (menuState `prototypeFocused`).
let prototypeFocused = false;
// The terminal session the playing canvas would resume, from main's last resumeTarget answer to the prototype window,
// with the canvas it was for: its composer sees only that session's terminal work.
let prototypeResume: { canvas: string; held: ResumeSession } | null = null;
let prototypeWorkSent = "[]";
let prototypeEntrySent: string | null = null;
// Set once the draft store exists. A removal or a Move to Trash can reach main before then (the runtime socket and the
// IPC handlers start earlier in `start`), so they reach the store through this rather than its later const.
let conversationDraftStore: DraftStore | undefined;
// Set once the attachment store exists: forget the draft attachments the closed prototype window still holds.
let prototypeAttachmentsClosed: (owner: AttachmentOwner) => void = () => {};
const FULLSCREEN_EXIT_WAIT_MS = 2000;

// Nothing is captured while the window is hidden (closed, or the app hidden with ⌘H). Tracked here because macOS
// emits no window `hide`/`show` for these; createWindow starts shown, except a hidden background launch.
let windowShown = true;
let appHidden = false;
// onboarding start while another app is in front: the window waits for Doan to become active (backgroundReveal.ts).
let revealPending = false;
let revealBounced = false;
function syncThumbnailPause(): void {
  if (windowShown && !appHidden) thumbnails?.resume();
  else thumbnails?.pause();
}
// The first prompt's arrival shows a toast rather than opening a canvas while the window is hidden;
// document.hidden stays false after hide().
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

// `doan open --prototype` (app-socket v6): the same readiness as `doan open`, but only first run and the buddy screen
// block it, since the prototype window plays apart from the main window's pages and dialogs.
function playPrototype(request: PrototypeRequest): PrototypeResponse {
  return answerCliPlay(request, {
    ready: openLinksReady,
    firstRun: () => onboardingOpen || buddyIntroOpen,
    entries: () => shell?.entries() ?? [],
    play: target => prototype.controller.playFromCli(target),
  });
}

// The single-frame prototype window: made on the first Play, apart from `win`'s lifecycle and sender guard.
const opaqueFallback = createOpaqueFallback();
const prototype = createPrototypeWindow({
  entries: () => shell?.entries() ?? [],
  vibrancyWindow: window => opaqueFallback.adopt(window),
  mainWindow: () => win,
  closed: (contents, replaced) => {
    prototypeAttachmentsClosed(`prototype:${contents}`);
    thumbnails?.viewerClosed("prototype");
    if (replaced) return;
    prototypeShowing.closed();
    prototypeResume = null;
    prototypeWorkSent = "[]";
    prototypeEntrySent = null;
    send(PROTOTYPE_CHANNELS.closed);
    prototypeRelay.changed();
  },
  buddy: () => prototypeBuddy(),
  clockHour12: systemClockHour12,
  viewSent: () => prototypeRelay.changed(),
  canvasChanged: () => prototypeRelay.changed(),
  denyPermissions,
  reread: root => shell?.reread([root]),
  appHidden: () => appHidden,
  // A skipped usage trigger is made up when a window shows again, and a closed prototype window stops counting as one.
  shownChanged: () => usage?.visibilityChanged(),
  focusChanged(focused) {
    if (focused === prototypeFocused) return;
    prototypeFocused = focused;
    setMenu();
  },
});

// The conversation index for the prototype window's scope, once the conversation store exists.
let indexedConversations: () => ScopedConversation[] = () => [];
// The conversation the prototype window's open panel shows, for notifications (showing.ts).
const prototypeShowing = createPrototypeShowing({ playing: () => prototype.controller.playing(), generation: () => prototype.controller.canvasGeneration(), conversations: () => indexedConversations(), entries: () => shell?.entries() ?? [] });

// The playing-frame push to the main window (targetRelay.ts).
const prototypeRelay = createTargetRelay({
  playing: () => prototype.controller.playing(), frame: () => prototype.controller.playingFrame(),
  sendPlaying: playing => send(PROTOTYPE_CHANNELS.playing, playing),
});

// The buddy a new prototype window's page starts with; the saved one once preferences are read.
let prototypeBuddy: () => BuddyId = () => "doany";

// The playing canvas's resume session, while it is still the canvas playing.
function prototypeHeldSession(): ResumeSession | null {
  const playing = prototype.controller.playing();
  return playing !== null && prototypeResume !== null && prototypeResume.canvas === canvasKeyString(playing) ? prototypeResume.held : null;
}

function sendPrototypeWork(): void {
  if (prototype.window() === undefined) return;
  const items = prototypeWorkItems(workItems(workState), prototypeHeldSession());
  const text = JSON.stringify(items);
  if (text === prototypeWorkSent) return;
  prototypeWorkSent = text;
  prototype.send(PROTOTYPE_CHANNELS.workChanged, items);
}

function sendPrototypeEntry(): void {
  if (prototype.window() === undefined) return;
  const entry = prototypeEntry(shell?.entries() ?? [], prototype.controller.playing());
  const text = JSON.stringify(entry);
  if (text === prototypeEntrySent) return;
  prototypeEntrySent = text;
  prototype.send(PROTOTYPE_CHANNELS.entryChanged, entry);
}

// The URL a listed canvas's iframe shows, which the inspector's shown-document check needs; null for a canvas that is
// not listed.
function listedCanvasUrl(canvas: { root: string; path: string }): string | null {
  const entry = shell?.entries().find((item) => item.path === canvas.root);
  return entry?.kind === "list" ? entry.canvases.find((row) => row.path === canvas.path)?.url ?? null : null;
}

// A registered window's main frame, or nothing: iframes, the capture window
// and windows that are gone are not senders.
function senderKind(event: IpcMainInvokeEvent): WindowKind | undefined {
  if (fromWindow(event)) return "main";
  if (prototype.owns(event)) return "prototype";
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

// The chip field keeps its own undo history and refuses Chromium's, so the Redo role never reached it. A focused chip
// field gets the history beforeinput, anything else WebContents undo/redo; a key the page handles is no menu key.
function editHistory(kind: "undo" | "redo"): NonNullable<MenuItemConstructorOptions["click"]> {
  const script = `(() => { const field = document.activeElement; if (!(field instanceof HTMLElement) || !field.hasAttribute("data-chip-field") || !field.isContentEditable) return false;
    field.dispatchEvent(new InputEvent("beforeinput", { inputType: "${kind === "undo" ? "historyUndo" : "historyRedo"}", bubbles: true, cancelable: true })); return true; })()`;
  return (_item, window: BaseWindow | undefined) => {
    const contents = window instanceof BrowserWindow ? window.webContents : webContents.getFocusedWebContents();
    if (!contents || contents.isDestroyed()) return;
    void contents.executeJavaScript(script).catch(() => false).then(handled => { if (handled !== true && !contents.isDestroyed()) contents[kind](); });
  };
}

// Page zoom and reload roles would act on the whole window; the view commands go to the renderer, which zooms the
// board and reloads only the canvas. The menu is rebuilt whenever its enablement changes.
function menuEnabledNow() {
  return menuState(menuInputs.screen, menuInputs.modal, { wizardOpen: onboardingOpen || buddyIntroOpen, choose: menuInputs.choose === true, locked: menuInputs.locked === true, overview: menuInputs.overview === true, pickerAvailable: menuInputs.pickerAvailable === true, prototypeFocused });
}

function setMenu(): void {
  const view = (command: ViewCommand) => () => send("view-command", command);
  const command = (name: MenuCommand) => () => send("menu-command", name);
  const enabled = menuEnabledNow();
  // Before the service exists the item can only open About.
  const updateItem = updateMenu(updates ? updateView(updates.snapshot(), Date.now()).menu : { label: "Check for Updates…", action: "openAbout", enabled: true }, enabled);
  updateMenuKey = JSON.stringify(updateItem);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // Role labels would read "About doan" from app.name, which stays "doan" for userData.
      { label: "Doan", submenu: [
        { role: "about", label: "About Doan" },
        { label: updateItem.label, enabled: updateItem.enabled, click: () => updateMenuClick(updateItem.action) },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", enabled: enabled.settings, click: () => openSettingsPage() },
        { type: "separator" }, { role: "services" }, { type: "separator" },
        { role: "hide", label: "Hide Doan" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" }, { role: "quit", label: "Quit Doan" },
      ] },
      {
        label: "File",
        submenu: [
          { label: "New Conversation", accelerator: "CmdOrCtrl+N", enabled: enabled.newConversation, click: command("newConversation") },
          { label: "Add Projects…", accelerator: "CmdOrCtrl+O", enabled: enabled.addProject, click: openAddProjects },
          { type: "separator" },
          // The focused window: from the prototype window it closes only that window.
          { label: "Close Window", accelerator: "CmdOrCtrl+W", click: (_item, focused) => {
            if (prototype.ownsWindow(focused)) prototype.close();
            else if (win && !win.isDestroyed()) win.close();
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
      // Finder's place for Home. Quick Open is a menu item so ⌘K is never only a hidden key.
      { label: "Go", submenu: [
        { label: "Home", accelerator: "Shift+CmdOrCtrl+H", enabled: enabled.home, click: command("home") },
        { label: "Quick Open…", accelerator: "CmdOrCtrl+K", enabled: enabled.quickOpen, click: command("quickOpen") },
      ] },
      { role: "windowMenu" },
    ]),
  );
}

// Check for Updates… opens About (and checks, where the copy updates). A blocked Restart to Update does not quit: the
// window comes forward and the renderer opens the header button's popover with the reason.
function updateMenuClick(action: UpdateMenuView["action"]): void {
  if (action !== "restart") {
    openSettingsPage({ section: "about" });
    if (action === "check") updates?.check();
    return;
  }
  if (updates?.install()?.kind !== "blocked" || !win || win.isDestroyed()) return;
  bringForward(win);
  send("update:popover");
}

// What Home shortens project paths against; Settings rows get the result.
const homeDirectory = (): string => process.env.HOME ?? app.getPath("home");
// The home folder read through any symlink: saved roots are real paths, so where Doan creates no repository (at HOME or
// above it) and how project paths shorten are judged against this spelling.
const realHomeDirectory = (): string => realHome(homeDirectory());

function setMenuInputs(next: MenuInputs): void {
  if (next.screen === menuInputs.screen && next.modal === menuInputs.modal &&
    next.choose === menuInputs.choose && next.locked === menuInputs.locked && next.overview === menuInputs.overview &&
    next.pickerAvailable === menuInputs.pickerAvailable && next.sidebarHidden === menuInputs.sidebarHidden && next.projectSettings === menuInputs.projectSettings) return;
  menuInputs = next;
  setMenu();
}

const MENU_FLAGS = ["choose", "locked", "overview", "pickerAvailable", "sidebarHidden", "projectSettings"] as const;
function parseMenuInputs(value: unknown): MenuInputs | null {
  if (typeof value !== "object" || value === null || !("screen" in value) || !("modal" in value)) return null;
  const flags = MENU_FLAGS.filter(flag => flag in value);
  if (Object.keys(value).length !== 2 + flags.length || flags.some(flag => { const set: unknown = Reflect.get(value, flag); return set !== undefined && typeof set !== "boolean"; })) return null;
  const { screen, modal } = value;
  const known = SCREENS.find(item => item === screen);
  if (known === undefined || typeof modal !== "boolean") return null;
  const inputs: MenuInputs = { screen: known, modal };
  for (const flag of flags) if (Reflect.get(value, flag) === true) inputs[flag] = true;
  return inputs;
}

// Without handlers Electron grants permissions to the app's own main frame; canvas iframes are already stopped by
// Permissions Policy. The prototype window's session gets the same.
function denyPermissions(target: Session = session.defaultSession): void {
  guardLoopback(target, loopbackHosts);
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
  target.setDevicePermissionHandler(() => false);
  // Chromium turns an ⌥-clicked canvas link into a download, and the iframe
  // sandbox without `allow-downloads` does not stop it.
  target.on("will-download", (event) => event.preventDefault());
}

// The loopback origins the app's sessions may reach: the canvas server and, in a dev run, the renderer's dev server.
function loopbackHosts(): string[] {
  const hosts = shell ? [new URL(shell.tokenBase).host] : [];
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl && URL.canParse(devUrl)) hosts.push(new URL(devUrl).host);
  return hosts;
}

function systemClockHour12(): boolean {
  return clockHour12({
    force24: systemPreferences.getUserDefault("AppleICUForce24HourTime", "boolean") === true,
    force12: systemPreferences.getUserDefault("AppleICUForce12HourTime", "boolean") === true,
  }, app.getSystemLocale());
}

// buddy: the saved buddy, passed in the renderer's query for the first paint.
function createWindow(buddy: BuddyId): BrowserWindow {
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
      additionalArguments: [clockArgument(systemClockHour12())],
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("buddy", buddy);
    void window.loadURL(url.toString());
  } else void window.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)), { query: { buddy } });
  injectCanvasScript(window);
  // Main window only: the thumbnail capture window shows no text a person can reach. Nothing in the app handles DOM
  // `contextmenu`; a preventDefault there would stop Chromium from asking for this menu.
  window.webContents.on("context-menu", (_event, params) => {
    const template = editMenuTemplate(editMenuInput(params), window.webContents);
    // No `frame`: Electron uses it to add OS items such as Writing Tools, and the menu holds only Doan's items.
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window });
  });
  const debuggerOf = createWindowDebugger(window.webContents.debugger, documents);
  windowDebugger = debuggerOf;
  inspector = createInspector({ debugger: window.webContents.debugger, window: debuggerOf, documents, canvasUrl: listedCanvasUrl });
  // A reloaded or crashed renderer has lost the selection it reported, and starts on Home with no toast up; an in-page
  // navigation is not a new document.
  window.webContents.on("render-process-gone", () => { selection = null; readState?.showing(null); documents.clear(); setMenuInputs(HOME); });
  window.webContents.on("did-navigate", () => { selection = null; readState?.showing(null); documents.clear(); setMenuInputs(HOME); });
  // Only the renderer showed and could cancel the Add Projects page's clone. First run's may belong to the CLI, so
  // it keeps running.
  window.webContents.on("render-process-gone", () => addPage?.rendererGone());
  window.webContents.on("did-navigate", () => addPage?.rendererGone());
  // A reloaded or crashed renderer never disposes its Project step, so it cannot cancel a New folder request whose
  // save panel is still open; its requests go with it, and a Create that returns later makes nothing.
  const contentsId = window.webContents.id;
  window.webContents.on("render-process-gone", () => dropFolderRequests(contentsId));
  window.webContents.on("did-navigate", () => dropFolderRequests(contentsId));
  // Read after destroy, webContents throws, so the id is kept now.
  const owner = window.webContents.id;
  // A sign-in belongs to the renderer that started it; a lost renderer cannot cancel it any more.
  window.webContents.on("render-process-gone", () => { configBridge?.clear(); void agentAuth?.ownerClosed(owner); });
  // A reloaded renderer has no Project Settings page left to answer.
  window.webContents.on("did-navigate", () => { configBridge?.clear(); });
  // The watcher's git signal does not re-run `doan ls`, so a branch switched
  // elsewhere shows when the human comes back to the window.
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
  // The traffic lights are gone in fullscreen, so the header gives back their space.
  window.on("enter-full-screen", () => send("window:fullscreen", { fullScreen: true }));
  window.on("leave-full-screen", () => send("window:fullscreen", { fullScreen: false }));
  window.on("closed", () => {
    void agentAuth?.ownerClosed(owner);
    cancelPendingHide();
    if (win === window) win = undefined;
    folderRequests.clear();
  });
  opaqueFallback.adopt(window);
  return window;
}

// The open-Settings command: a hidden window is shown first, then the renderer
// moves to the page. Not while first run or the buddy screen is open, like Settings….
export function openSettingsPage(target: SettingsPageTarget = {}): boolean {
  const window = win;
  if (onboardingOpen || buddyIntroOpen || !window || window.isDestroyed()) return false;
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

// Resolves to the stored root, or null when the dialog was cancelled or the folder refused.
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
    properties: ["openDirectory", "createDirectory"],
  });
  const path = picked.filePaths[0];
  return picked.canceled || path === undefined ? null : path;
}

// File > Add Projects…: the Add Projects page, which the renderer opens (its Choose folder, when the page already shows
// its choose phase). A hidden window is shown first, as for every other way of reaching the window.
function openAddProjects(): void {
  const window = win;
  if (!window || window.isDestroyed()) return;
  showWindow(window);
  send(ADD_PAGE_CHANNELS.open);
}

// Whether anything is at the path, a link included; nothing is read.
function exists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

// A folder, or a link to one, is at the path.
function isFolder(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
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
  const gpuLog = createGpuLog(join(userData, "gpu.log"));
  app.on("child-process-gone", (_event, details) => gpuLog.processGone(details));
  app.on("gpu-info-update", () => {
    const status = app.getGPUFeatureStatus().gpu_compositing;
    gpuLog.compositing(status);
    if (!compositingEnabled(status)) opaqueFallback.trigger();
  });
  const choices = new Map<string, { id: string; path: string; epoch: number }>();
  // Only the window's copy of the list carries `unseen`; thumbnails and conversations read the shell's own entries.
  const seenStore = createLocalSeen(join(userData, "canvas-seen.json"));
  canvasSeen = seenStore;
  const fingerprints = createFingerprints();
  let shellEntries: () => FolderEntry[] = () => [];
  const seen = createReadState({
    local: seenStore,
    fingerprint: (root, path) => fingerprints.of(root, path),
    read: readSeen,
    gitSignal: readGitSignal,
    entries: () => shellEntries(),
    // Only the main window's own canvas iframe proves a canvas shown (seenProof.ts).
    async shown(root, row) {
      const main = await windowDebugger?.mainFrame();
      if (!main) return null;
      return shownDocument(documents.frames(), (frame, url) => documents.current(frame, url), main, { url: row.url, root, path: row.path })?.hash ?? null;
    },
    changed: () => send("folders", seen.decorate(shellEntries())),
    problem: (root, problem) => send("read-state:problem", { root, problem }),
  });
  readState = seen;
  documents.onChange(() => seen.documentsChanged());
  // One login-shell probe at a time, shared by agent facts, clone and the CLI's git (read only when first needed).
  const shellForFacts = sharedShell(() => probeShell(process.env));
  // Before startShell: its first folder reads can find a vanished auto-registered worktree and call rootsLeft, which
  // must reach the drafts' starts.
  const conversationStore = new ConversationStore(userData);
  // After the store, which made and checked the conversations directory.
  const conversationDrafts = new DraftStore(join(userData, "conversations"));
  conversationDraftStore = conversationDrafts;
  // What main keeps for roots that left the list, by Remove, Locate, a vanished auto-registered worktree or an upward
  // re-root (shell.ts `left`): one place, so a store keyed by root is wired into all of them at once. `before`: the list before.
  function rootsLeft(paths: string[], before: FolderEntry[]): void {
    if (selection && paths.includes(selection.root)) selection = null;
    // Background work a done turn left in a removed project stops without asking, as on sign-out.
    conversations?.stopBackground(paths);
    prototype.controller.rootsRemoved(paths);
    conversationDraftStore?.discardRootStarts(paths);
    void thumbnails?.removed(paths, before);
  }
  // The CLI's git for Keep out of Git outside Git is found as clone finds its git (cli.ts CliEnv).
  const gitEnv = async (): Promise<CliEnv> => { const probe = await shellForFacts(); return cliEnv(probe.ok ? probe.path : null, process.env); };
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
    for (const { root } of refreshes.calls) {
      try { conversations?.refreshed(root); } catch (error) { console.error("doan: conversation handoff check failed", error); }
    }
    for (const root of choices.keys()) {
      if (!entries.some(entry => entry.path === root && entry.kind === "uninitialized")) choices.delete(root);
    }
    thumbnails?.entriesChanged(entries);
    // A source change reloads the prototype, a gone canvas or root shows it unavailable, and it comes back on restore.
    prototype.controller.listChanged();
    sendPrototypeEntry();
    seen.listed(entries);
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("folders", seen.decorate(entries), focus);
    readyOpenLinks();
  }, {
    response: record => documents.response(record),
    git: root => seen.gitChanged(root),
    saveFailed: () => send("folders:save-failed"),
    // A vanished auto-registered worktree or a re-rooted stored root is cleaned up as Remove's roots are; work items go
    // with the list's retainWorkRoots above.
    left: rootsLeft,
    // A root saved through a symlink is read as its real path once its seen canvases and UI memory have moved to it,
    // in this order and before the renderer reads ui-state.json (folderStore RootMigration).
    migrate: async aliases => seenStore.copyRoots(aliases) && await moveUiStateRoots(join(userData, "ui-state.json"), aliases),
    home: realHomeDirectory(),
    cliEnv: gitEnv,
  });
  shell = ready;
  shellEntries = () => ready.entries();
  updateWork(retainWorkRoots(workState, ready.entries().map(entry => entry.path)));
  handle("work:get", [], (_event, value: unknown) => value === undefined ? workItems(workState) : []);
  handle("conversation-work:get", [], (_event, value: unknown) => value === undefined ? conversationWork : []);
  handle("deep-link:ready", undefined, (_event, value: unknown) => {
    if (value !== undefined) return;
    linksRendererReady = true;
    readyOpenLinks();
  });
  handle("doan-open:answer", undefined, (_event, value: unknown) => { openCanvasRequests.answer(value); });
  // The main window names a frame of a listed canvas; main builds the URL itself. Each window request is checked again
  // for the prototype role inside the controller.
  handle(PROTOTYPE_CHANNELS.play, undefined, (_event, value: unknown, kind) => { prototype.controller.play(kind, value); });
  // Export and visibility are the window host's, not the run controller's (handled with the CLI below), and so are the
  // conversation panel's requests other than its open state, which reach the main window, settings and work state.
  const hostRequests: ReadonlySet<string> = new Set([
    PROTOTYPE_CHANNELS.export, PROTOTYPE_CHANNELS.revealExport, PROTOTYPE_CHANNELS.visible, PROTOTYPE_CHANNELS.showing, PROTOTYPE_CHANNELS.reveal,
    PROTOTYPE_CHANNELS.auth, PROTOTYPE_CHANNELS.work, PROTOTYPE_CHANNELS.composer, PROTOTYPE_CHANNELS.remember, PROTOTYPE_CHANNELS.entry,
    PROTOTYPE_CHANNELS.rememberedConversation, PROTOTYPE_CHANNELS.conversationListed,
  ]);
  handle(PROTOTYPE_CHANNELS.visible, null, (_event, value: unknown) => value === undefined ? { visible: prototype.visible() } : null);
  for (const channel of PROTOTYPE_WINDOW_REQUESTS) {
    if (hostRequests.has(channel)) continue;
    const refused = channel === PROTOTYPE_CHANNELS.read ? null : undefined;
    handle(channel, refused, (_event, value: unknown, kind) => prototype.controller.request(channel, kind, value));
  }
  // The capture window is made on the first capture and stays out of the
  // app window's lifecycle: `win` alone is shown, closed and trusted for IPC.
  const thumbs = createThumbnails({
    dir: join(userData, "thumbnails"), appVersion: app.getVersion(),
    entries: () => ready.entries(), scope: (root) => ready.scope(root),
    capturer: createWindowCapturer(), changed: (target) => {
      send("thumbnails:changed", target);
      if (prototypeThumbnailRoot(target.root, prototype.controller.playing())) prototype.send("thumbnails:changed", target);
    },
  });
  thumbnails = thumbs;
  // Electron has no app hide event. AppKit posts these at the end of
  // NSApplication's hide:/unhide:, which the `hide` role item (⌘H) sends.
  systemPreferences.subscribeLocalNotification("NSApplicationDidHideNotification", () => { appHidden = true; visibilityChanged(); prototype.visibilityChanged(); });
  systemPreferences.subscribeLocalNotification("NSApplicationDidUnhideNotification", () => { appHidden = false; visibilityChanged(); prototype.visibilityChanged(); });
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
  // Move to Trash and Export act only on rows of main's own list. Busy is judged on main's grounds:
  // this root's conversations, its starts not accepted yet and terminal work.
  const canvasTrash = createCanvasTrash({
    entries: () => ready.entries(),
    busy: target => trashBusy(target, conversations?.list(target.root) ?? [], workItems(workState), conversations?.startingCanvases(target.root) ?? []),
    trashItem: path => electronShell.trashItem(path),
    trashed: (root, canvas) => conversationDraftStore?.discardCanvasStarts(root, canvas),
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
  // The prototype window's Export: its own lock (one export per window) and Show in Finder ids, and its own save panel.
  const prototypeExport = createPrototypeExport({
    target: (kind, value) => prototype.controller.exportTarget(kind, value),
    async choose(name) {
      const parent = prototype.window();
      if (parent === undefined) return null;
      const picked = await dialog.showSaveDialog(parent, { defaultPath: name, filters: [{ name: "HTML", extensions: ["html"] }] });
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
    running: target => prototype.send(PROTOTYPE_CHANNELS.exportRunning, target),
    run: (target, output) => runExport(cli, target.root, target.path, output, { frame: target.frame }),
    reveal: path => electronShell.showItemInFolder(path),
  });
  handle(PROTOTYPE_CHANNELS.export, EXPORT_REFUSED, (_event, value: unknown, kind) => prototypeExport.export(kind, value));
  handle(PROTOTYPE_CHANNELS.revealExport, undefined, (_event, value: unknown) => { prototypeExport.reveal(value); });
  // `doan active` is an extra; the app works without it, and the CLI then
  // reports that the app is not running.
  runtime = await startRuntime(userData, {
    isOpen, selection: () => selection,
    work(request) { updateWork(applyWork(workState, request, Date.now())); },
    // Before the conversation service exists no turn runs, so every update is dropped.
    conversationWork(request) { updateConversationWork(applyConversationWork(conversationWork, request, conversations?.liveTurns() ?? new Map(), Date.now())); },
    workOthers: request => request.action === "done" ? []
      : othersOnCanvas({ request, now: Date.now(), work: workItems(workState), conversationWork, liveTurns: conversations?.liveTurns() ?? new Map() }),
    roots: () => ready.entries().map(entry => entry.path),
    // Only runLs's default 10 s timeout applies, not the answer deadline: a start past it still registers
    // (runtime.ts AUTO_REGISTER_WAIT_MS).
    readRoot: async root => folderState(await runLs(cli, { repo: root })),
    // The shell publishes the list synchronously, so the work state holds the root before the start's work applies.
    adopt(root, view) { ready.adopt(root, view); },
    open: request => openCanvasRequests.open(request),
    // Before the conversation service exists no conversation holds a key.
    handoff: request => conversations ? conversations.requestHandoff(request) : "not_app_conversation",
    playPrototype,
    // Main judges and removes without asking the renderer; the window learns which roots went afterwards and tidies its
    // own state for them. The window does not come forward.
    remove: request => answerCliRemove(request, {
      ready: openLinksReady,
      firstRun: () => onboardingOpen || buddyIntroOpen,
      entries: () => ready.entries(),
      menu: () => menuInputs,
      liveTurns: () => conversations?.liveTurns() ?? new Map(),
      pendingRoots: () => conversations?.pendingRoots() ?? new Set(),
      async removeRoots(roots) {
        const removed = await removeRoots(roots);
        if (removed.kind === "removed") send("folders:removed", { paths: removed.paths });
        return removed;
      },
    }),
    async onboarding(request) {
      const service = await onboardingStarted;
      // start keeps the session and its input; the window comes forward only when Doan is
      // already in front.
      if (request.op === "start" && win && !win.isDestroyed()) revealForStart(win);
      return service.answer(request);
    },
  }).catch((error: unknown) => {
    console.error("doan: cannot start the runtime socket", error);
    return undefined;
  });

  removeStaleLinkDirs();
  const auth = new AuthManager({ storage: new AuthStorage(join(userData, "agent-auth"), electronCipher), spawn: spawnAuthProcess, inherited: process.env, appRuntime: join(userData, CONVERSATION_RUNTIME), fence: { userData }, locate: shellLocator(process.env, PROVIDER_AUTH, { antigravity: signal => antigravityServer(join(userData, "agent-runtimes", "antigravity-acp"), signal ? { signal } : {}) }),
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
  // Agent setup (ARCHITECTURE §7 'Agent setup') runs once per launch, beside the window. About waits for its result; a
  // run that throws becomes a crashed item, so About never shows it as "every agent was set up".
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
      // status reads) or a lost one. Claude's prompt suggestions go with a signed-out or replaced Claude connection.
      publish: snapshot => { send(AUTH_CHANNELS.changed, snapshot); prototype.send(PROTOTYPE_CHANNELS.authChanged, prototypeAuthSnapshot(snapshot)); onboarding?.authChanged(snapshot); for (const provider of MCP_PROVIDERS) mcp?.authChanged(provider); usage?.authChanged(); for (const provider of ["claude", "codex"] as const) conversations?.connectionChanged(provider, agentAuth?.state(provider).connection?.connectionId); },
      prompt: (owner, event) => { if (win && !win.isDestroyed() && win.webContents.id === owner) send(AUTH_CHANNELS.prompt, event); },
    });
  }
  // Agent usage (ARCHITECTURE §7): read on fixed triggers into main memory only, shown only while a window is.
  if (agentAuth && authIpc) {
    const auth = agentAuth, ipc = authIpc;
    usage = new UsageService({
      auth,
      readiness: provider => ipc.latest().providers.find(status => status.provider === provider)?.readiness ?? { ready: false, cause: "not_connected", action: "signIn" },
      read: (provider, lease, signal) => readUsage(provider, lease, { spawn: spawnAuthProcess, fence: { userData } }, signal),
      visible: () => usageVisible({ mainShown: windowShown, appHidden, prototypeShown: prototype.visible() }),
      publish: usagePublisher({ main: send, prototype: (channel, value) => prototype.send(channel, value) }),
    });
    // App start: once the tool facts are read, which readiness needs. A failed probe also ends the pre-facts hold, or
    // blocked providers would read "Reading usage" forever.
    const started = usage;
    void ipc.read().then(() => started.trigger({ kind: "start" }), (error: unknown) => {
      console.error("doan: agent usage could not start", error);
      started.trigger({ kind: "start" });
    });
  }
  handle(USAGE_CHANNELS.read, [], (_event, value) => usage ? usageRequest(usage, value) : []);
  // MCP Connectors: provider CLIs register, sign in and keep the tokens in the Doan profiles; Doan
  // keeps the server list. It needs agent sign-in storage: without it every MCP call is refused like a forged one.
  if (agentAuth) {
    const auth = agentAuth;
    mcp = new McpService({
      store: new ConnectorStore(userData), auth,
      readiness: provider => authIpc?.latest().providers.find(status => status.provider === provider)?.readiness ?? { ready: false, cause: "not_connected", action: "signIn" },
      spawn: spawnAuthProcess, spawnPty: ptySpawner({ packaged: app.isPackaged }),
      openExternal: url => electronShell.openExternal(url),
      publish: snapshot => send(MCP_CHANNELS.changed, snapshot), fence: { userData },
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
  // A write of the shared exclude file changes the mode of every worktree of the project, so all of them are read
  // again, as after a Project Settings write.
  const rereadGroup = (root: string) => ready.reread(groupRoots(ready.entries(), root));
  const initializeProject = async (root: string, tokenCss: string | null, storage: "local" | null, gitInit = false): Promise<ProjectInitResult> => {
    const outcome = await ready.initialize(root, tokenCss, storage, gitInit);
    if (outcome.kind === "success" && storage === "local") rereadGroup(root);
    return outcome;
  };
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
    initialize: (root, storage, gitInit) => initializeProject(root, null, storage, gitInit),
    home: realHomeDirectory,
    remotes: root => readGitRemotes(root, homeDirectory()),
    keepsLocal: path => projectKeepsLocal(ready.entries(), path),
    async keepLocal(root) {
      const result = storageWrite(await runConfig(cli, root, ["--storage", "local"]));
      if (result.ok) rereadGroup(root);
      return result;
    },
  };
  const realOrNull = (path: string) => { try { return realpathSync.native(path); } catch { return null; } };
  // The developer directory xcode-select would use, read without running it (see locateGit).
  const developerDir = () => { if (process.env.DEVELOPER_DIR) return process.env.DEVELOPER_DIR; try { return readlinkSync("/var/db/xcode_select_link"); } catch { return null; } };
  // First run and the Add Projects page add projects with the same folder work and locks.
  const locks = projectLocks();
  const projectWork: AdderProjects = {
    folder: canonicalFolder, destination: path => cloneDestination(path, projectDeps),
    inspectPath: (real, repo, storage) => inspectPath(real, projectDeps, repo, storage), inspectUrl: (repo, storage) => inspectUrl(repo, projectDeps, storage),
    select: (path, initialize, repo, storage, gitInit) => selectProject(path, initialize, repo, projectDeps, storage, gitInit),
    present: leftoverPresent,
    clone: (url, destination, signal, commit, storage) => cloneProject(url, destination, signal, {
      ...projectDeps,
      async git() {
        const probe = await shellForFacts();
        const path = probe.ok ? probe.path : null;
        const git = locateGit({ path, executable, realpath: realOrNull, developerDir });
        return git !== null && path !== null ? { git, env: cloneEnv(process.env, path) } : null;
      },
    }, commit, storage),
  };
  // New folder: the path comes from the save panel and main makes it, so no path the renderer sends is created; it
  // registers nothing. No createDirectory: a New Folder made in this panel would move it inside and nest the project.
  const cancelled: NewFolderResult = { kind: "cancelled" };
  handle("onboarding:new-folder", cancelled, async (event, value: unknown): Promise<NewFolderResult> => {
    const window = win;
    if (!fromWindow(event) || !window || typeof value !== "object" || value === null || Object.keys(value).length !== 2 || !("parent" in value) || typeof value.parent !== "string"
      || !("token" in value) || typeof value.token !== "string" || value.token === "" || value.token.length > 200 || folderRequests.has(value.token)) return cancelled;
    const token = value.token;
    folderRequests.set(token, event.sender.id);
    try {
      const at = isAbsolute(value.parent) && isFolder(value.parent) ? value.parent : realHomeDirectory();
      showWindow(window);
      const picked = await dialog.showSaveDialog(window, { message: "Name your new project folder and choose where to create it.", buttonLabel: "Create", nameFieldLabel: "Name:", defaultPath: at, showsTagField: false });
      // The step that asked, or the window, may have gone while the panel was open or while the location is checked.
      const wanted = () => folderRequests.has(token) && fromWindow(event);
      if (picked.canceled || !picked.filePath || !wanted()) return cancelled;
      return await newFolderTarget(picked.filePath, projectDeps, wanted);
    } finally { folderRequests.delete(token); }
  });
  // true: that request was still open and now makes nothing. Only the frame that sent it may cancel it.
  handle("onboarding:new-folder-cancel", false, (event, value: unknown) => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("token" in value) || typeof value.token !== "string") return false;
    return folderRequests.get(value.token) === event.sender.id && folderRequests.delete(value.token);
  });
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
      return fromWindow(event) && request !== null ? onboardingService.answerWindow(request) : sessionRefused;
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
  // Runs read the MCP connectors' generation and names when they ask.
  const accountPrepare = createAccountPrepare(auth, cli, provider => void authIpc?.refreshTools(provider), authIpc, connectorFacts(() => mcp), { userData, socket: () => runtime?.socket });
  // Without readable account storage a doan-account run is refused; it never falls back to the external profile.
  const prepareConversation = routePrepare(createPrepare(userData, join(userData, CONVERSATION_RUNTIME), process.env),
    wireAccountPrepare(accountPrepare, () => !!agentAuth, prepared => usage ? withTurnUsage(prepared, usage, profileDir => readCursorSummary(profileDir)) : prepared));
  const preferences = createPreferencesStore(join(userData, "preferences.json"));
  const notify = createNotifyService({
    preferences: () => preferences.current().notifications,
    visibility: () => ({
      focused: win !== undefined && !win.isDestroyed() && win.isFocused(), shown: windowShown, minimized: win !== undefined && !win.isDestroyed() && win.isMinimized(), appHidden,
      // The person sees that conversation in the prototype window's open panel while the window is in front.
      prototypeShows: prototypeFocused && prototype.visible() && prototype.controller.panelOpen() ? prototypeShowing.shown() : null,
    }),
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
  // Every conversation event and end of a turn's work may start or end a turn or question, which Restart to Update waits
  // for. Events stream many times a second, so the prototype scope keeps the index in memory until a list or binding change.
  const indexed = (): ScopedConversation[] => { try { return conversationStore.list(); } catch { return []; } };
  indexedConversations = indexed;
  let known: ScopedConversation[] | null = null;
  const knownFor = (id: string): ScopedConversation[] => {
    known ??= indexed();
    if (!known.some(conversation => conversation.conversationId === id)) known = indexed();
    return known;
  };
  // Every conversation broadcast goes to the main window, and to the prototype window when it is about the canvas that
  // plays there (prototypeReceives).
  const broadcast = (message: ConversationBroadcast): void => {
    send(message.channel, message.value);
    if (message.channel === "conversation:listChanged") known = null;
    if (prototype.window() === undefined) return;
    const list = message.channel === "conversation:event" || message.channel === "conversation:stage" || message.channel === "conversation:boundary" ? knownFor(message.value.conversationId) : known ?? [];
    if (prototypeReceives(message, prototype.controller.playing(), list)) prototype.send(message.channel, message.value);
  };
  const conversationService = new ConversationService(conversationStore, prepareConversation, openRunner, (event, deferNotice) => { broadcast({ channel: "conversation:event", value: event }); if (!deferNotice) notify.event(event); updates?.conversationsChanged(); starPrompt?.event(event); }, (root, canvas) => {
    const project = ready.entries().find(entry => entry.path === root);
    if (!project) throw new Error("project_not_open");
    if (canvas) {
      if (project.kind !== "list") throw new Error("canvas_not_found");
      return resolveListedCanvas(canvas, project.canvases);
    }
  }, undefined, root => {
    const project = ready.entries().find(entry => entry.path === root);
    return project?.kind === "list" ? project.canvases : [];
  // A send or start before acceptance holds Restart to Update without an event, so the gate is asked on list changes too.
  }, root => { broadcast({ channel: "conversation:listChanged", value: { root } }); updates?.conversationsChanged(); }, { drafts: conversationDrafts, files: queueFiles(attachments), defaultEffort: (root, provider, model) => modelCatalog?.defaultEffort(root, provider, model), fast: (root, provider, model) => modelCatalog?.fast(root, provider, model) === true,
    limitWindows: (provider, connectionId) => usage ? usage.limitWindows(provider, connectionId) : Promise.resolve([]), resumed: listener => { powerMonitor.on("resume", listener); }, notice: event => notify.event(event) }, id => notify.close(id),
  // A stage is a live signal beside the events, never one of them: its own channel, sent to the same windows as events.
  id => { updateConversationWork(endConversationWork(conversationWork, id)); updates?.conversationsChanged(); }, notice => broadcast({ channel: "conversation:handoff", value: notice }), signal => broadcast({ channel: "conversation:stage", value: signal }),
  // A command turn's boundary, as a stage: its own channel to the same windows as events, never written to the history.
  signal => broadcast({ channel: "conversation:boundary", value: signal }));
  conversations = conversationService;
  attachments.cleanup();
  modelCatalog = new ModelCatalog((root, runtime) => conversationService.prepareListing(root, runtime), input => conversationService.readListing(input, listModels));
  const skillCatalog = new SkillCatalog((root, provider) => conversationService.prepareListing(root, provider), input => conversationService.readListing(input, listSkills));
  const conversationRequest = conversationHandler(conversationService, prepareConversation, () => ready.entries(), { models: modelCatalog, skills: skillCatalog, attachments });
  // A start, send or queue carries the sender's draft attachments, which main checks are that window's own and, once
  // accepted, takes from its draft (attachmentHandlers.ts).
  const carriesAttachments = (method: string): boolean => method === "start" || method === "send" || method === "queue";
  // A returned queue's attachment ids belong to the window that took the draft (attachmentHandlers.ts).
  const draftTaken = (taker: AttachmentOwner, reply: unknown): void => {
    const ids = typeof reply === "object" && reply !== null && "ids" in reply && Array.isArray(reply.ids) ? reply.ids.filter((id: unknown): id is string => typeof id === "string") : [];
    if (ids.length) attachmentHandlers.taken(taker, ids);
  };
  // The prototype window's main frame is a second sender, kept to the playing canvas: the scope is judged against the
  // target and the index as they are when the request arrives, and its list keeps that canvas's conversations only.
  for (const method of conversationMethods) {
    ipcMain.handle(`conversation:${method}`, async (event, value: unknown) => {
      const kind = senderKind(event);
      if (kind !== "prototype") {
        const reply = carriesAttachments(method) && kind === "main"
          ? await attachmentHandlers.conversation("main", value, () => conversationRequest(true, method, value))
          : await conversationRequest(kind === "main", method, value);
        if (kind === "main" && method === "takeDraft") draftTaken("main", reply);
        return reply;
      }
      const playing = prototype.controller.playing();
      const entries = ready.entries();
      const allowed = prototypeConversationScope(method, value, playing, indexed(), entries);
      const run = () => !allowed && method === "list" && prototypeListElsewhere(value, playing)
        ? Promise.resolve({ error: "not_playing" })
        : conversationRequest(allowed, method, value, all => prototypeListRows(all, playing, entries));
      const reply = allowed && carriesAttachments(method) ? await attachmentHandlers.conversation(`prototype:${event.sender.id}`, value, run) : await run();
      if (allowed && method === "takeDraft") draftTaken(`prototype:${event.sender.id}`, reply);
      if (allowed && method === "resumeTarget" && playing !== null) {
        const held = typeof reply === "object" && reply !== null && "session" in reply && typeof reply.session === "string" && "runtime" in reply && typeof reply.runtime === "string"
          ? { session: reply.session, runtime: reply.runtime } : null;
        prototypeResume = held === null ? null : { canvas: canvasKeyString(playing), held };
        sendPrototypeWork();
      }
      return reply;
    });
  }

  // Composer attachments from both windows (senderAllowed): main checks and keeps the paths the person chose; the page
  // never names a path main did not give it. Each draft attachment belongs to the window that holds it.
  const attachmentHandlers = createAttachmentHandlers(attachments, {
    async pick(owner) {
      // The dialog opens over the window that asked.
      const parent = owner === "main" ? win : prototype.window();
      if (!parent || parent.isDestroyed()) return [];
      const picked = await dialog.showOpenDialog(parent, { title: "Attach Files or Folders", properties: ["openFile", "openDirectory", "multiSelections"] });
      return picked.canceled ? [] : picked.filePaths;
    },
    alive: owner => owner === "main" || owner === `prototype:${prototype.window()?.webContents.id ?? -1}`,
  });
  prototypeAttachmentsClosed = owner => attachmentHandlers.closed(owner);
  const owner = (event: IpcMainInvokeEvent, kind: WindowKind): AttachmentOwner => kind === "main" ? "main" : `prototype:${event.sender.id}`;
  handle("attachments:choose", [], (event, _value, kind) => attachmentHandlers.choose(owner(event, kind)));
  handle("attachments:add-paths", null, (event, value: unknown, kind) => attachmentHandlers.addPaths(owner(event, kind), value));
  handle("attachments:add-pasted", null, (event, value: unknown, kind) => attachmentHandlers.addPasted(owner(event, kind), value));
  handle("attachments:add-pasted-text", null, (event, value: unknown, kind) => attachmentHandlers.addPastedText(owner(event, kind), value));
  handle("attachments:remove", false, (event, value: unknown, kind) => attachmentHandlers.remove(owner(event, kind), value));
  handle("attachments:recheck", null, (event, value: unknown, kind) => attachmentHandlers.recheck(owner(event, kind), value));
  handle("attachments:release", false, (event, value: unknown, kind) => attachmentHandlers.release(owner(event, kind), value));
  handle("attachments:fromPaths", null, (event, value: unknown, kind) => attachmentHandlers.fromPaths(owner(event, kind), value));
  // The pixels the person sees in a rect of the window, read by main; the renderer names only the rect and never sends
  // image bytes.
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
  // gitInit: the form showed the .git/ this setup creates; only ever true, only with Keep out of Git, and only for a
  // folder main itself published as outside Git (notGit), which is when the form shows that line.
  handle("project:init", unavailable, async (event, value: unknown): Promise<ProjectInitResult> => {
    const gitInit = typeof value === "object" && value !== null && "gitInit" in value;
    if (!fromWindow(event) || typeof value !== "object" || value === null || Object.keys(value).length !== (gitInit ? 4 : 3) ||
      !("root" in value) || typeof value.root !== "string" || !("choiceId" in value) ||
      (value.choiceId !== null && typeof value.choiceId !== "string") || !("storage" in value) ||
      (value.storage !== null && value.storage !== "local") || (gitInit && (value.storage !== "local" || value.gitInit !== true)) || !canSetUp(value.root)) return unavailable;
    const root = value.root;
    if (gitInit && !ready.entries().some(entry => entry.path === root && entry.kind === "uninitialized" && entry.notGit === true)) return unavailable;
    let tokenCss: string | null = null;
    if (value.choiceId !== null) {
      const choice = choices.get(value.root);
      if (!choice || choice.id !== value.choiceId || choice.epoch !== ready.epoch(value.root)) return unavailable;
      tokenCss = choice.path;
    }
    return initializeProject(value.root, tokenCss, value.storage, gitInit);
  });
  handle("app:home", null, event => fromWindow(event) ? realHomeDirectory() : null);
  handle("window:visible", null, event => fromWindow(event) ? { visible: windowShown && !appHidden } : null);
  handle("window:fullscreen", null, event => fromWindow(event) ? { fullScreen: win!.isFullScreen() } : null);
  handle("folders:get", [], (event) => (fromWindow(event) ? seen.decorate(ready.entries()) : []));
  handle("folders:save-again", false, (event) => (fromWindow(event) ? ready.saveAgain() : false));
  handle("read-state:showing", false, (event, value: unknown) => fromWindow(event) ? seen.showing(value) : false);
  handle("read-state:retry", false, (event, value: unknown) => fromWindow(event) ? seen.retry(value) : false);
  const flow = createAddFlow({
    ls: async target => folderState(await runLs(cli, target)),
    saved: () => ready.entries().map((entry) => entry.path),
    store: (paths) => ready.store(paths),
  });
  addFlow = flow;
  // Every path that takes stored roots out by request (Remove from Doan, `doan remove`) comes here, so state keyed by
  // those roots is cleared in one place. The store reads its list before the first await.
  async function removeRoots(roots: readonly string[]): Promise<{ kind: "removed"; paths: string[] } | { kind: "unavailable" }> {
    const before = ready.entries();
    if (selection && roots.includes(selection.root)) selection = null;
    const removed = await ready.remove(roots);
    if (removed.paths.length === 0) return { kind: "unavailable" };
    rootsLeft(removed.paths, before);
    return { kind: "removed", paths: removed.paths };
  }
  // A row or a whole card.
  handle("folders:remove", { kind: "unavailable" }, (event, value: unknown): Promise<RemoveResult> | RemoveResult => {
    if (!fromWindow(event) || typeof value !== "object" || value === null || !("paths" in value) || Object.keys(value).some(key => key !== "paths" && key !== "group") || ("group" in value && value.group !== true)) return { kind: "unavailable" };
    const paths: unknown = value.paths;
    const stored = ready.entries();
    if (!Array.isArray(paths) || paths.length === 0 || new Set(paths).size !== paths.length ||
      !paths.every(path => typeof path === "string")) return { kind: "unavailable" };
    if ("group" in value) {
      const anchor = paths.find(path => stored.some(entry => entry.path === path));
      if (!anchor) return { kind: "unavailable" };
      const current = removalGroup(stored, [anchor]);
      if (!current) return { kind: "loading" };
      if (current.length !== paths.length || current.some(root => !paths.includes(root))) return { kind: "groupChanged", paths: current };
    }
    if (!paths.every(path => stored.some(entry => entry.path === path))) return { kind: "unavailable" };
    if (conversationService.projectRemovalBusy(paths)) return { kind: "busy" };
    return removeRoots(paths.map(String)).then((removed): RemoveResult => removed.kind === "removed" ? { kind: "removed" } : removed);
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
    const before = ready.entries();
    if (selection?.root === from) selection = null;
    await ready.replace(from, judged.root);
    if (judged.root !== from) rootsLeft([from], before);
    return { kind: "located", root: judged.root };
  });
  // The renderer names the root only; the file a Config error selects is the one the CLI named (revealTarget), never a
  // path TS builds.
  handle("folders:reveal", undefined, (event, value: unknown) => {
    const path = storedPath(value);
    if (!fromWindow(event) || path === null) return;
    const entry = shell?.entries().find(item => item.path === path);
    electronShell.showItemInFolder(entry ? revealTarget(entry, exists) : path);
  });
  // Validated against the saved roots in main; the renderer's copy is not trusted.
  const store = createUiStateStore(join(userData, "ui-state.json"), () => ready.entries().map((entry) => entry.path), undefined, undefined, () => ready.spellings());
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
  // The prototype window's composer reads Last used from the main window's saves (composerSettings.ts).
  const composerSettings = createComposerSettings({
    read: () => store.read(), preferences: () => preferences.current(), open: () => prototype.window() !== undefined,
    send: settings => prototype.send(PROTOTYPE_CHANNELS.composerChanged, settings),
  });
  // The main window's last accepted save, as it sent it: its write to disk may still wait for the debounce, and main's
  // own parse would drop a field it does not know yet.
  let lastUiSave: unknown;
  handle("ui-state:save", false, (event, value: unknown) => {
    if (!fromWindow(event) || !store.save(value)) return false;
    lastUiSave = value;
    // No root spellings: the composer settings leave out Home's last project, the one field they would change.
    void composerSettings.saved(parseUiState(JSON.stringify(value), ready.entries().map(entry => entry.path)));
    return true;
  });
  // The Settings page's preferences, notifications and About. Main fixes the URL, the notification
  // and the clipboard text; the renderer sends a change or nothing.
  handle("preferences:read", null, () => preferences.read());
  handle("buddy-intro:read", false, () => buddyIntroOpen);
  handle("buddy-intro:close", undefined, (_event, value: unknown) => {
    if (value !== undefined || !buddyIntroOpen) return;
    buddyIntroOpen = false;
    setMenu();
  });
  handle("preferences:write", null, async (_event, value: unknown) => {
    const reply = await preferences.update(value);
    // The choice in effect, which a refused or failed write leaves as it was.
    updates?.setAutoCheck(reply.snapshot.preferences.updates.autoCheck);
    void composerSettings.changed();
    return reply;
  });
  prototypeBuddy = () => windowBuddy(preferences.read());
  // The prototype window's conversation panel (hostRequests above). Each request was allowed for the prototype role
  // only; the parsers check the role again.
  handle(PROTOTYPE_CHANNELS.showing, undefined, (_event, value: unknown, kind) => { prototypeShowing.set(kind, value); });
  // The playing frame: the main window's read (mainOnly).
  handle(PROTOTYPE_CHANNELS.playing, null, (_event, value: unknown) => value === undefined ? prototypeRelay.playingTarget() : null);
  // A chip or a main-window-only button: the main window comes forward as for a notification's click, then decides
  // what it can show (a dialog, a page lock or first run keeps everything as it is).
  handle(PROTOTYPE_CHANNELS.reveal, undefined, (_event, value: unknown, kind) => {
    const payload = parseRevealRequest(kind, value);
    const request = payload === null ? null : prototypeRevealRequest(payload, prototype.controller.playing(), indexed(), ready.entries());
    const window = win;
    if (request === null || !window || window.isDestroyed()) return;
    bringForward(window);
    window.focus();
    send(PROTOTYPE_CHANNELS.revealRequest, request);
  });
  // An index that cannot be read answers nothing rather than "not listed", which the card would draw as deleted.
  handle(PROTOTYPE_CHANNELS.conversationListed, null, (_event, value: unknown) => {
    let conversations: ScopedConversation[] | null;
    try { conversations = conversationStore.list(); } catch { conversations = null; }
    return prototypeConversationListed(value, prototype.controller.playing(), conversations);
  });
  handle(PROTOTYPE_CHANNELS.auth, null, async (_event, value: unknown) => value === undefined && authIpc ? prototypeAuthSnapshot(await authIpc.read()) : null);
  handle(PROTOTYPE_CHANNELS.entry, null, (_event, value: unknown) => {
    if (value !== undefined) return null;
    const entry = prototypeEntry(ready.entries(), prototype.controller.playing());
    prototypeEntrySent = JSON.stringify(entry);
    return entry;
  });
  handle(PROTOTYPE_CHANNELS.work, [], (_event, value: unknown) => value === undefined ? prototypeWorkItems(workItems(workState), prototypeHeldSession()) : []);
  handle(PROTOTYPE_CHANNELS.composer, null, (_event, value: unknown) => value === undefined ? composerSettings.read() : null);
  // The main window's remembered conversation of the playing canvas: its last save in this run, else ui-state.json as
  // the previous run left it. Only that one id leaves ui-state (conversationScope.ts prototypeRememberedConversation).
  handle(PROTOTYPE_CHANNELS.rememberedConversation, null, async (_event, value: unknown) => {
    if (value !== undefined) return null;
    const saved = lastUiSave !== undefined ? lastUiSave : await readFile(join(userData, "ui-state.json"), "utf8").then(text => JSON.parse(text) as unknown, () => null);
    return prototypeRememberedConversation(saved, prototype.controller.playing(), ready.entries());
  });
  // Last used is the main window's ui-state: it remembers the pick as its own composer's, so its next whole-file save
  // keeps it.
  handle(PROTOTYPE_CHANNELS.remember, undefined, (_event, value: unknown, kind) => {
    const choice = parseComposerChoice(kind, value);
    if (choice !== null) send(PROTOTYPE_CHANNELS.lastUsed, choice);
  });
  handle("notifications:test", null, (_event, value: unknown) => value === undefined ? notify.test() : null);
  handle("notifications:open-settings", false, async (_event, value: unknown) => {
    if (value !== undefined) return false;
    try { await electronShell.openExternal(NOTIFICATION_SETTINGS_URL); return true; } catch { return false; }
  });
  // A saved root and a listed canvas only; main reads the bytes from its cache. The prototype window asks for its
  // playing root only.
  handle("thumbnails:get", { kind: "unavailable" }, (_event, value: unknown, kind): Promise<ThumbnailReply> | ThumbnailReply => {
    if (typeof value !== "object" || value === null || Object.keys(value).length !== 3 ||
      !("root" in value) || typeof value.root !== "string" || !("path" in value) || typeof value.path !== "string" ||
      !("visible" in value) || typeof value.visible !== "boolean") return { kind: "unavailable" };
    if (kind === "prototype" && !prototypeThumbnailRoot(value.root, prototype.controller.playing())) return { kind: "unavailable" };
    return thumbs.get(value.root, value.path, value.visible, kind);
  });
  // A prototype window that left a root still withdraws its own marks there: that changes only its share of the
  // visibility and answers nothing.
  handle("thumbnails:visible", undefined, (_event, value: unknown, kind) => {
    if (typeof value !== "object" || value === null || Object.keys(value).length !== 3 ||
      !("root" in value) || typeof value.root !== "string" || !("path" in value) || typeof value.path !== "string" ||
      !("visible" in value) || typeof value.visible !== "boolean") return;
    if (kind === "prototype" && value.visible && !prototypeThumbnailRoot(value.root, prototype.controller.playing())) return;
    thumbs.visible(value.root, value.path, value.visible, kind);
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
  // Main reads the shown canvas with CDP; values and token names are canvas text. A request refused for its sender or
  // shape has nothing to echo and gets a bare unavailable.
  handle("inspect:get", { ok: false, reason: "unavailable" }, async (event, value: unknown): Promise<InspectReply | InspectRefused> => {
    const request = parseInspectRequest(value);
    if (!fromWindow(event) || request === null) return { ok: false, reason: "unavailable" };
    const result = inspector ? await inspector.inspect(request) : { ok: false as const, reason: "unavailable" as const };
    return { ...request, ...result };
  });

  const command = cliCommand(process.env, app.isPackaged, process.resourcesPath);
  // First run and Agents' Open install page: the provider's fixed install page.
  handle("setup:open-external", false, async (_event, value: unknown) => {
    const target = parseExternalTarget(value);
    if (target === null) return false;
    try { await electronShell.openExternal(INSTALL_URLS[target]); return true; } catch { return false; }
  });
  // First run and Agents' Install/Update: main picks a command, or the page, from its own tool facts.
  const openInstall = createInstallOpener({ dir: join(userData, "terminal"), openPath: path => electronShell.openPath(path), openExternal: url => electronShell.openExternal(url) });
  handle("setup:open-install", "failed", async (_event, value: unknown) => {
    const target = parseExternalTarget(value);
    return target === null ? "failed" : openInstall(target, authIpc?.toolFacts(target) ?? null);
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
  // App updates (ARCHITECTURE §7). Eligibility is agent setup's for this bundle, asked without waiting for setup's
  // login-shell probe, plus the release feed file; a copy that doesn't update never makes an updater.
  const releaseEligibility = updateEligibility({
    isPackaged: app.isPackaged, hasFeedConfig: hasFeedConfig(process.resourcesPath),
    install: setupEligibility({ home: homeDirectory(), resources: process.resourcesPath, isPackaged: app.isPackaged }),
  });
  const updateService = new UpdateService({
    version: app.getVersion(),
    eligibility: releaseEligibility,
    autoCheck: preferences.current().updates.autoCheck,
    ...electronUpdater(),
    gate: () => installGate(conversationService.restartHolds()),
    publish: snapshot => {
      send("update:state", snapshot);
      if (JSON.stringify(updateMenu(updateView(snapshot, Date.now()).menu, menuEnabledNow())) !== updateMenuKey) setMenu();
    },
    quit: () => app.quit(),
    relaunch: () => app.relaunch(),
    log: (message, detail) => { if (detail === undefined) console.log(message); else console.error(message, detail); },
    now: () => Date.now(),
  });
  updates = updateService;
  handle("update:get", null, (_event, value: unknown) => value === undefined ? updateService.snapshot() : null);
  handle("update:check", undefined, (_event, value: unknown) => { if (value === undefined) updateService.check(); });
  handle("update:install", null, (_event, value: unknown) => value === undefined ? updateService.install() : null);
  // Main builds the URL from the version it holds; the renderer names nothing.
  handle("update:openNotes", false, async (_event, value: unknown) => {
    const url = value === undefined ? releaseNotesUrl(updateService.snapshot()) : null;
    if (url === null) return false;
    try { await electronShell.openExternal(url); return true; } catch { return false; }
  });
  // The GitHub star card counts and asks only in a copy that updates, the release builds people install. The renderer
  // names nothing: main opens its own fixed URL, and a dismissal or the busy read carry no data.
  starPrompt = createStarPrompt({ file: join(userData, "star-prompt.json"), enabled: releaseEligibility.kind === "enabled", now: () => Date.now(), moment: moment => send("star:moment", moment) });
  const stars = starPrompt;
  handle("star:open", false, async (_event, value: unknown) => {
    if (value !== undefined) return false;
    try { await electronShell.openExternal(REPOSITORY_URL); } catch { return false; }
    stars.opened();
    return true;
  });
  // Home's credit line: the same fixed URL, without touching the star card's state.
  handle("repository:open", false, async (_event, value: unknown) => {
    if (value !== undefined) return false;
    try { await electronShell.openExternal(REPOSITORY_URL); return true; } catch { return false; }
  });
  handle("star:dismiss", undefined, (_event, value: unknown) => { if (value === undefined) stars.dismissed(); });
  // A conversation running or waiting for an answer puts the card off.
  handle("star:busy", true, (_event, value: unknown) => {
    if (value !== undefined) return true;
    const holds = conversationService.restartHolds();
    return holds.liveTurns > 0 || holds.pendingAnswers > 0;
  });
  // Copies what About last showed, so the text matches the page.
  handle("about:copy", { kind: "stale" }, async (_event, value: unknown) => value === undefined ? copy(aboutText(lastAbout ?? await readAbout(), updateService.snapshot())) : { kind: "stale" });
  handle("onboarding:choose-folder", null, (event, value: unknown) => fromWindow(event) ? chooseFolder(value) : null);

  const bridge = createConfigBridge({
    run: (root, args, env) => env === undefined ? runConfig(command, root, args) : runConfig(command, root, args, env),
    gitEnv,
    // Every worktree of the project shows the mode, and an unset-up one's Not set up notice depends on it.
    storageWritten: root => ready.reread(groupRoots(ready.entries(), root)),
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
  // Opening the page reads the project group again: a mode changed outside Doan shows without waiting for focus.
  handle("config:session-start", undefined, (_event, value: unknown) => {
    bridge.clear();
    if (typeof value === "object" && value !== null && "root" in value && typeof value.root === "string" && ready.entries().some(entry => entry.path === value.root)) ready.reread(groupRoots(ready.entries(), value.root));
  });
  handle("config:session-end", undefined, () => { bridge.clear(); });

  const completed = onboardingComplete(readCompletion(userData));
  onboardingOpen = !completed;
  const launchPreferences = preferences.read();
  buddyIntroOpen = buddyIntroShown({ completed, notice: launchPreferences.notice, buddyKey: preferences.buddyKey(), onboardingOpen });
  setMenu();
  win = createWindow(windowBuddy(launchPreferences));
  onboardingReady(onboardingService);
  updateService.start();
}

// A second launch only brings the first window back, so two apps never
// overwrite each other's runtime.json.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  restoreLaunchdCaCerts(process.env, name => execFileSync("/bin/launchctl", ["getenv", name], { encoding: "utf8", timeout: 2000, maxBuffer: 64 * 1024 }));
  trustExtraCaCerts(process.env.NODE_EXTRA_CA_CERTS, path => readFileSync(path, "utf8"));
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
  // An inspector quit can interrupt a BrowserWindow constructor before its JS wrapper exists, and Electron then crashes
  // emitting its close event, so the native stack unwinds before disposal or app.quit().
  quitScheduled = true;
  // conversation:delete answers busy while quitting as while working; this lets the renderer tell the two apart. Never
  // taken back: after an aborted quit the conversations stay stopped (the service stays quitting) until a restart.
  send("app:quitting", true);
  // Accepted: onboarding saves no completion, and neither it nor the Add Projects page starts project work from here,
  // before any teardown is awaited.
  onboarding?.closeForQuit();
  addPage?.closeForQuit();
  async function quitInOrder(): Promise<void> {
    // Stop the queue before Electron closes windows so it cannot reopen
    // the capture window and block will-quit. Persist state before teardown.
    try { await conversations?.quit(); } catch (error) {
      quitScheduled = false;
      updates?.quitCancelled();
      onboarding?.reopenAfterAbortedQuit();
      addPage?.reopenAfterAbortedQuit();
      console.error("doan: conversation persistence failed during quit", error);
      return;
    }
    // MCP connector attempts are cancelled and write no result; their leases go before agent sign-in quits.
    try { await mcp?.quit(); } catch (error) {
      console.error("doan: MCP cleanup failed during quit", error);
    }
    // Usage reads are stopped and their leases released before agent sign-in quits.
    try { await usage?.quit(); } catch (error) {
      console.error("doan: usage cleanup failed during quit", error);
    }
    // After conversations: their runs hold auth leases whose working credentials are written back here.
    try { await agentAuth?.quit(); } catch (error) {
      console.error("doan: agent sign-in cleanup failed during quit", error);
    }
    // Each adder owns only its clones; stopping them removes their temporary directories.
    const projects = await Promise.allSettled([onboarding, addPage].map(async adder => { await adder?.quit(); }));
    for (const result of projects) {
      if (result.status === "rejected") console.error("doan: project cleanup failed during quit", result.reason);
    }
    quitting = true;
    // Accepted state goes to disk before any native teardown: a teardown that throws or crashes must not lose it.
    try { uiState?.flushSync(); canvasSeen?.flushSync(); } catch (error) {
      console.error("doan: final cleanup failed during quit", error);
    }
    try { prototype.destroyForQuit(); cancelPendingHide(); thumbnails?.dispose(); } catch (error) {
      console.error("doan: final cleanup failed during quit", error);
    }
    // Restart to Update installs only here, after the save and the flush; quitting is set, so the windows the install
    // closes are not turned into hides.
    if (updates?.installPending) updates.quitAndInstall();
    else app.quit();
  }
  setImmediate(() => { void quitInOrder(); });
});
// `open -g` to a running app arrives as a reopen, which Electron emits as `activate` without activating Doan; showing
// then would activate it over the app in use. A Dock click has already made Doan active by now.
app.on("activate", () => {
  if (app.isActive() && win && !win.isDestroyed()) showWindow(win);
});

app.on("will-quit", () => {
  if (workTimer !== undefined) clearTimeout(workTimer);
  workTimer = undefined;
  uiState?.flushSync();
  canvasSeen?.flushSync();
  runtime?.disposeSync();
  void shell?.dispose();
});
