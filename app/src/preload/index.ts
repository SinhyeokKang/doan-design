import type { OnboardingOpen, OnboardingRead } from "../main/index";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type { Author } from "../formats/types";
import type { BeginRequest, BeginResult, CommentList, CommentReply, CommentRequest, CopyRequest, MutationRequest, SavedStatus } from "../main/comments/service";
import type { TransitionRequest } from "../main/comments/transitions";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AddOutcome, ScanSnapshot, StoreResult } from "../main/addProjects";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { LocateResult, MenuCommand, MenuInputs, OpenProjectResult, ProjectInitRequest, RemoveResult, RestoreResult, TokenCssChoice, ViewCommand } from "../main/index";
import type { ExternalTarget, ForwardedAction, SettingsTarget } from "../main/settings";
import type { SetupStatus } from "../main/setupBroker";
import type { InspectResult } from "../main/inspect";
import type { FolderEntry } from "../main/view";
import type { ThumbnailReply, ThumbnailTarget } from "../main/thumbnails";
import type { UiState } from "../restore/uiState";

// Events with a current value: the value is asked for too, because the first
// event can come before the listener. An event that arrives first wins.
// Each preload keeps its own copy: a sandboxed preload cannot require a
// chunk the two entries would otherwise share.
function subscribe<T>(event: string, initial: string, listener: (value: T) => void): () => void {
  let active = true, received = false;
  const receive = (_event: Electron.IpcRendererEvent, value: T) => { received = true; listener(value); };
  ipcRenderer.on(event, receive);
  void ipcRenderer.invoke(initial).then((value: T | null) => { if (active && !received && value !== null) listener(value); });
  return () => { active = false; ipcRenderer.removeListener(event, receive); };
}

// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  homeDirectory: (): Promise<string | null> => ipcRenderer.invoke("app:home"),
  readOnboarding: (request: { session: string; requestId: string }): Promise<OnboardingRead> => ipcRenderer.invoke("onboarding:read", request),
  runOnboardingStep: (request: StepRequest): Promise<StepResult> => ipcRenderer.invoke("onboarding:run", request),
  answerOnboardingReplace: (answer: { id: string; allow: boolean }): Promise<StepResult> => ipcRenderer.invoke("onboarding:answer", answer),
  closeOnboarding: (request: OnboardingOpen): Promise<StepResult> => ipcRenderer.invoke("onboarding:close", request),
  copyPathLine: (): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "pathLine" }),
  // Main builds the sentence from a stored, set-up project and the subject
  // (promptSentence); null when either is refused.
  firstPrompt: (root: string, subject: string): Promise<string | null> => ipcRenderer.invoke("onboarding:first-prompt", { root, subject }),
  // Resolves after the clipboard write settled.
  copyFirstPrompt: (root: string, subject: string): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "firstPrompt", root, subject }),
  // The wizard's Open Project…: one folder, judged as Add Project… judges it.
  openProject: (): Promise<OpenProjectResult> => ipcRenderer.invoke("onboarding:open-project"),
  // Home chips, banner and Finish card; null only if main refused.
  setupStatus: (): Promise<SetupStatus | null> => ipcRenderer.invoke("setup:status"),
  checkSetupAgain: (): Promise<SetupStatus | null> => ipcRenderer.invoke("setup:check-again"),
  onSetupStatus: (listener: (status: SetupStatus) => void): (() => void) => subscribe("setup:status", "setup:status", listener),
  openInstallPage: (target: ExternalTarget): Promise<boolean> => ipcRenderer.invoke("setup:open-external", { target }),
  // Opens Settings, or brings it forward, at a tab and optionally one row.
  openSettings: (target: SettingsTarget): Promise<boolean> => ipcRenderer.invoke("settings:open", target),
  // A Settings problem row asked the home to run one of its actions.
  onProjectAction(listener: (request: { path: string; action: ForwardedAction }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, request: { path: string; action: ForwardedAction }) => listener(request);
    ipcRenderer.on("projects:action", receive);
    return () => ipcRenderer.removeListener("projects:action", receive);
  },
  onOnboardingOpen(listener: (opened: OnboardingOpen) => void): () => void {
    let active = true, received = false;
    const receive = (_event: Electron.IpcRendererEvent, opened: OnboardingOpen) => { received = true; listener(opened); };
    ipcRenderer.on("onboarding:open", receive);
    void ipcRenderer.invoke("onboarding:get-open").then((opened: OnboardingOpen | null) => { if (active && !received && opened) listener(opened); });
    return () => { active = false; ipcRenderer.removeListener("onboarding:open", receive); };
  },
  commentsList: (request: CommentRequest): Promise<CommentReply<CommentList>> => ipcRenderer.invoke("comments:list", request),
  commentsBegin: (request: BeginRequest): Promise<CommentReply<BeginResult>> => ipcRenderer.invoke("comments:begin", request),
  commentsMutate: (request: MutationRequest): Promise<CommentReply<SavedStatus>> => ipcRenderer.invoke("comments:mutate", request),
  commentsStatus: (request: CommentRequest): Promise<CommentReply<SavedStatus>> => ipcRenderer.invoke("comments:status", request),
  commentsAuthor: (request: CommentRequest): Promise<CommentReply<Author>> => ipcRenderer.invoke("comments:author", request),
  commentsCopy: (request: CopyRequest): Promise<CommentReply<{ copied: true }>> => ipcRenderer.invoke("comments:copy", request),
  setCommentDraftGuard: (active: boolean): Promise<void> => ipcRenderer.invoke("comments:guard", active),
  answerCommentTransition: (answer: { id: string; allow: boolean }): Promise<void> => ipcRenderer.invoke("comments:transition-answer", answer),
  onCommentTransition(listener: (request: TransitionRequest) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, request: TransitionRequest) => listener(request);
    ipcRenderer.on("comments:transition", receive);
    return () => ipcRenderer.removeListener("comments:transition", receive);
  },
  onCommentsInvalidated(listener: (change: { root: string }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, change: { root: string }) => listener(change);
    ipcRenderer.on("comments:invalidated", receive);
    return () => ipcRenderer.removeListener("comments:invalidated", receive);
  },
  chooseTokenCss: (root: string): Promise<TokenCssChoice> => ipcRenderer.invoke("project:choose-token-css", { root }),
  initializeProject: (request: ProjectInitRequest): Promise<ProjectInitResult> => ipcRenderer.invoke("project:init", request),
  // The stored root, or null when the sheet was cancelled or the folder refused.
  openFolder: (): Promise<string | null> => ipcRenderer.invoke("folders:open"),
  reopenFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:reopen", path),
  // Main validates it again and keeps one selection for `doan active`.
  setSelection: (selection: Selection | null): Promise<void> => ipcRenderer.invoke("selection:set", selection),
  // Main reads the canvas with CDP; values and token names are canvas text.
  inspect: (selector: string): Promise<InspectResult> => ipcRenderer.invoke("inspect:get", { selector }),
  onFolders(listener: (entries: FolderEntry[], focus?: FolderFocus) => void): () => void {
    let active = true;
    const receive = (_event: Electron.IpcRendererEvent, entries: FolderEntry[], focus?: FolderFocus) => listener(entries, focus);
    ipcRenderer.on("folders", receive);
    // An initial read can finish after an effect has already cleaned up.
    void ipcRenderer.invoke("folders:get").then((entries: FolderEntry[]) => {
      if (active) listener(entries);
    });
    return () => {
      active = false;
      ipcRenderer.removeListener("folders", receive);
    };
  },
  onViewCommand(listener: (command: ViewCommand) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, command: ViewCommand) => listener(command);
    ipcRenderer.on("view-command", receive);
    return () => ipcRenderer.removeListener("view-command", receive);
  },
  // Add Project… and the home + button; the outcome arrives on onAddOutcome,
  // as it does for the menu and for drops.
  addProjects: (): Promise<void> => ipcRenderer.invoke("folders:add"),
  // Paths are read here, so the page hands over File objects, not text. A
  // file the page made itself has no path and is left out.
  addDroppedFiles(files: readonly File[]): Promise<void> {
    const paths = files.map((file) => webUtils.getPathForFile(file)).filter((path) => path !== "");
    return paths.length === 0 ? Promise.resolve() : ipcRenderer.invoke("folders:add-paths", { paths });
  },
  onAddOutcome(listener: (outcome: AddOutcome) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, outcome: AddOutcome) => listener(outcome);
    ipcRenderer.on("folders:add-outcome", receive);
    return () => ipcRenderer.removeListener("folders:add-outcome", receive);
  },
  // Snapshots are whole; the current one is asked for too, because progress
  // can be sent before the renderer learns the scan id. The newest `seq` wins.
  watchScan(scanId: string, listener: (snapshot: ScanSnapshot) => void): () => void {
    let active = true;
    let seq = -1;
    const deliver = (snapshot: ScanSnapshot | null) => {
      if (!active || snapshot?.scanId !== scanId || snapshot.seq <= seq) return;
      seq = snapshot.seq;
      listener(snapshot);
    };
    const receive = (_event: Electron.IpcRendererEvent, snapshot: ScanSnapshot) => deliver(snapshot);
    ipcRenderer.on("folders:scan-progress", receive);
    void ipcRenderer.invoke("folders:scan", { scanId }).then(deliver);
    return () => {
      active = false;
      ipcRenderer.removeListener("folders:scan-progress", receive);
    };
  },
  cancelScan: (scanId: string): Promise<void> => ipcRenderer.invoke("folders:scan-cancel", { scanId }),
  addCandidates: (scanId: string, ids: string[]): Promise<StoreResult> => ipcRenderer.invoke("folders:add-candidates", { scanId, ids }),
  confirmFolder: (confirmId: string): Promise<StoreResult> => ipcRenderer.invoke("folders:confirm-folder", { confirmId }),
  removeProjects: (paths: string[]): Promise<RemoveResult> => ipcRenderer.invoke("folders:remove", { paths }),
  restoreProjects: (removalId: string): Promise<RestoreResult> => ipcRenderer.invoke("folders:restore", { removalId }),
  // The removal toast expired without Undo.
  forgetRemoval: (removalId: string): Promise<void> => ipcRenderer.invoke("folders:forget-removal", { removalId }),
  locateProject: (path: string): Promise<LocateResult> => ipcRenderer.invoke("folders:locate", { path }),
  revealProject: (path: string): Promise<void> => ipcRenderer.invoke("folders:reveal", { path }),
  setMenuState: (inputs: MenuInputs): Promise<void> => ipcRenderer.invoke("menu:state", inputs),
  // `pending` is followed by onThumbnailChanged for the same canvas; ask again then.
  // `visible` puts the canvas ahead of cards off screen.
  getThumbnail: (root: string, path: string, visible: boolean): Promise<ThumbnailReply> => ipcRenderer.invoke("thumbnails:get", { root, path, visible }),
  setThumbnailVisibility: (root: string, path: string, visible: boolean): Promise<void> => ipcRenderer.invoke("thumbnails:visible", { root, path, visible }),
  // A capture finished or failed, or the cached image went stale.
  onThumbnailChanged(listener: (target: ThumbnailTarget) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: ThumbnailTarget) => listener(target);
    ipcRenderer.on("thumbnails:changed", receive);
    return () => ipcRenderer.removeListener("thumbnails:changed", receive);
  },
  // `ui-state.json` as main validated it against the saved roots; null starts at home.
  readUiState: (): Promise<UiState | null> => ipcRenderer.invoke("ui-state:get"),
  // Main validates again and writes the last value after 500 ms; false when refused.
  saveUiState: (state: UiState): Promise<boolean> => ipcRenderer.invoke("ui-state:save", state),
  onMenuCommand(listener: (command: MenuCommand) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("menu-command", receive);
    return () => ipcRenderer.removeListener("menu-command", receive);
  },
};

export type DoanApi = typeof api;

contextBridge.exposeInMainWorld("doan", api);
