import type { AuthCheckReply, AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { ShellActivity } from "../main/shellActivity";
import type { ConversationService, StartRequest } from "../main/conversation/service";
import type { ConversationError } from "../main/conversation/ipc";
import type { Anchor, Canvas, ConversationEvent, Runtime, UnavailableReason } from "../main/conversation/types";
import type { OnboardingOpen, OnboardingRead } from "../main/index";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type {
  Author, OnboardingCancelRequest, OnboardingCheckRequest, OnboardingCompleteRequest, OnboardingProjectCloneRequest,
  OnboardingProjectInspectRequest, OnboardingResponse, OnboardingState, OnboardingStatusRequest,
} from "../formats/types";
import type { BeginRequest, BeginResult, CommentList, CommentReply, CommentRequest, CopyRequest, MutationRequest, OrphanMutationRequest, OrphanRequest, SavedStatus } from "../main/comments/service";
import type { TransitionRequest } from "../main/comments/transitions";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AddOutcome, ScanSnapshot, StoreResult } from "../main/addProjects";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { LocateResult, MenuCommand, MenuInputs, OpenProjectResult, ProjectInitRequest, RemoveResult, RestoreResult, TokenCssChoice, ViewCommand } from "../main/index";
import type { ExternalTarget, ForwardedAction, SettingsTarget } from "../main/settings";
import type { SetupStatus } from "../main/setupBroker";
import type { InspectResult } from "../main/inspect";
import type { ProjectComments } from "../main/projectComments";
import type { ReviewMarker } from "../comments/review";
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

// The onboarding socket DTO as the window sends it: main adds the version and needs no token from its own window.
type SessionRequest<T> = T extends unknown ? Omit<T, "v" | "token" | "op"> : never;

// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  conversationResumeTarget: (request: { root: string; canvas: Canvas }): Promise<{ available: true; runtime: Runtime; lastCheckAt: string } | { available: false; reason: "no_record" | UnavailableReason } | ConversationError> => ipcRenderer.invoke("conversation:resumeTarget", request),
  conversationForCanvas: (request: { root: string; canvas: Canvas }): Promise<ReturnType<ConversationService["forCanvas"]> | ConversationError> => ipcRenderer.invoke("conversation:forCanvas", request),
  startConversation: (request: Omit<StartRequest, "anchors"> & { anchors?: Anchor[] }): Promise<{ conversationId: string } | ConversationError> => ipcRenderer.invoke("conversation:start", request),
  sendConversation: (request: { conversationId: string; text: string; anchors?: Anchor[] }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:send", request),
  interruptConversation: (request: { conversationId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", request),
  answerConversationPermission: (request: { conversationId: string; requestId: string; optionId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerPermission", request),
  readConversation: (request: { conversationId: string }): Promise<ReturnType<ConversationService["read"]> | ConversationError> => ipcRenderer.invoke("conversation:read", request),
  onConversationEvent(listener: (event: ConversationEvent) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, event: ConversationEvent) => listener(event);
    ipcRenderer.on("conversation:event", receive);
    return () => ipcRenderer.removeListener("conversation:event", receive);
  },
  // Agent accounts. Main checks provider and attempt IDs and binds sign-in, cancel, pasted addresses and link
  // opening to this window. Snapshots carry one revision; onAgentAuth delivers only ones newer than the last it
  // delivered, so an initial read that loses a race with a change never replaces the newer state. A conversation's
  // not_logged_in is coarse: take recovery from the provider's readiness.action (a Codex re-sign-in mints a new
  // connection that its earlier conversations cannot resume). readAgentAuth is null when account storage is unreadable.
  readAgentAuth: (): Promise<AuthSnapshot | null> => ipcRenderer.invoke("agent-auth:read"),
  onAgentAuth(listener: (snapshot: AuthSnapshot) => void): () => void {
    let active = true, revision = -1;
    const deliver = (snapshot: AuthSnapshot | null) => {
      if (!active || !snapshot || snapshot.revision <= revision) return;
      revision = snapshot.revision; listener(snapshot);
    };
    const receive = (_event: Electron.IpcRendererEvent, snapshot: AuthSnapshot) => deliver(snapshot);
    ipcRenderer.on("agent-auth:changed", receive);
    // A refused read leaves the listener on change events; it never becomes an unhandled rejection in the page.
    ipcRenderer.invoke("agent-auth:read").then(deliver, () => {});
    return () => { active = false; ipcRenderer.removeListener("agent-auth:changed", receive); };
  },
  checkAgentAuth: (provider: Provider): Promise<AuthCheckReply> => ipcRenderer.invoke("agent-auth:check", { provider }),
  // Without stop, a provider with running conversations answers stop_required; with it (the user chose to stop them)
  // main ends that provider's doan-account runs and waits for their processes before changing the account.
  signInAgent: (provider: Provider, options: { stop?: boolean } = {}): Promise<AuthStartReply> => ipcRenderer.invoke("agent-auth:sign-in", { provider, ...(options.stop ? { stop: true } : {}) }),
  signOutAgent: (provider: Provider, options: { stop?: boolean } = {}): Promise<AuthStartReply> => ipcRenderer.invoke("agent-auth:sign-out", { provider, ...(options.stop ? { stop: true } : {}) }),
  cancelAgentSignIn: (provider: Provider, attemptId: string): Promise<AuthReply> => ipcRenderer.invoke("agent-auth:cancel", { provider, attemptId }),
  // The address the browser ended on when it could not reach the sign-in's local listener (Antigravity).
  submitAgentSignInCode: (provider: Provider, attemptId: string, code: string): Promise<AuthReply> => ipcRenderer.invoke("agent-auth:submit-code", { provider, attemptId, code }),
  // Opens this window's sign-in link in the system browser; the page cannot name a URL.
  openAgentSignInLink: (provider: Provider, attemptId: string): Promise<AuthReply> => ipcRenderer.invoke("agent-auth:open-link", { provider, attemptId }),
  // Links of this window's own sign-ins only.
  onAgentSignInPrompt(listener: (prompt: AuthPromptEvent) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, prompt: AuthPromptEvent) => listener(prompt);
    ipcRenderer.on("agent-auth:prompt", receive);
    return () => ipcRenderer.removeListener("agent-auth:prompt", receive);
  },
  // The first-run session the CLI and MCP share: same state, revision and operations as app-socket v2 (the reply DTO is
  // the socket's). Sign-in itself stays on the agent-auth calls above; a CLI or MCP sign-in is owned by this window too.
  startOnboardingSession: (): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:start", {}),
  readOnboardingSession: (request: SessionRequest<OnboardingStatusRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:status", request),
  // A Copilot check spends one model request, so it needs spendCopilotRequest: true.
  checkOnboardingAgent: (request: SessionRequest<OnboardingCheckRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:check", request),
  cancelOnboardingOperation: (request: SessionRequest<OnboardingCancelRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:cancel", request),
  inspectOnboardingProject: (request: SessionRequest<OnboardingProjectInspectRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:inspect", request),
  cloneOnboardingProject: (request: SessionRequest<OnboardingProjectCloneRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:clone", request),
  completeOnboarding: (request: SessionRequest<OnboardingCompleteRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:complete", request),
  // Every session change, from this window or a CLI/MCP client. Drop states of another sessionId.
  onOnboardingSession(listener: (state: OnboardingState) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, state: OnboardingState) => listener(state);
    ipcRenderer.on("onboarding:changed", receive);
    return () => ipcRenderer.removeListener("onboarding:changed", receive);
  },
  homeDirectory: (): Promise<string | null> => ipcRenderer.invoke("app:home"),
  readOnboarding: (request: { session: string; requestId: string }): Promise<OnboardingRead> => ipcRenderer.invoke("onboarding:read", request),
  runOnboardingStep: (request: StepRequest): Promise<StepResult> => ipcRenderer.invoke("onboarding:run", request),
  answerOnboardingReplace: (answer: { id: string; allow: boolean }): Promise<StepResult> => ipcRenderer.invoke("onboarding:answer", answer),
  closeOnboarding: (request: OnboardingOpen): Promise<StepResult> => ipcRenderer.invoke("onboarding:close", request),
  copyPathLine: (): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "pathLine" }),
  // Hidden: closed with the app running, or the whole app hidden (⌘H).
  onWindowVisible: (listener: (visible: boolean) => void): (() => void) =>
    subscribe<{ visible: boolean }>("window:visible", "window:visible", value => listener(value.visible)),
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
  // project-feedback: resolve, reopen and delete on a comment file no canvas uses.
  orphanCommentsMutate: (request: OrphanMutationRequest): Promise<CommentReply<SavedStatus, OrphanRequest>> => ipcRenderer.invoke("comments:orphan-mutate", request),
  orphanCommentsStatus: (request: OrphanRequest): Promise<CommentReply<SavedStatus, OrphanRequest>> => ipcRenderer.invoke("comments:orphan-status", request),
  setCommentDraftGuard: (active: boolean): Promise<void> => ipcRenderer.invoke("comments:guard", active),
  answerCommentTransition: (answer: { id: string; allow: boolean }): Promise<void> => ipcRenderer.invoke("comments:transition-answer", answer),
  onCommentTransition(listener: (request: TransitionRequest) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, request: TransitionRequest) => listener(request);
    ipcRenderer.on("comments:transition", receive);
    return () => ipcRenderer.removeListener("comments:transition", receive);
  },
  // Per canvas id from one fresh `doan ls`; null when main refused. `revision`
  // comes back unchanged so a reply older than the last invalidation can be dropped.
  projectComments: (root: string, revision: number): Promise<ProjectComments | null> => ipcRenderer.invoke("comments:project", { root, revision }),
  // The device-local last review time of one canvas; main only ever raises it.
  reviewMarker: (root: string, canvas: string): Promise<ReviewMarker | null> => ipcRenderer.invoke("review-state:get", { root, canvas }),
  raiseReviewMarker: (root: string, canvas: string, at: string): Promise<ReviewMarker | null> => ipcRenderer.invoke("review-state:raise", { root, canvas, at }),
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
  readShellActivity: (request: { roots: string[] }): Promise<ShellActivity[] | null> => ipcRenderer.invoke("shell:activity", request),
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
