import type { AuthCheckReply, AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { ShellActivity } from "../main/shellActivity";
import type { ConversationService, StartRequest } from "../main/conversation/service";
import type { ConversationError } from "../main/conversation/ipc";
import type { ModelsReply } from "../main/conversation/models";
import type { AttachmentResult, RecheckResult } from "../main/attachments";
import type { DesignSkillList, DesignSkillPreset, DesignSkillReply } from "../main/designSkills";
import type { Anchor, Canvas, ConversationEvent, Runtime, UnavailableReason } from "../main/conversation/types";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type {
  Author, OnboardingCancelRequest, OnboardingCheckRequest, OnboardingCompleteRequest, OnboardingProjectCloneRequest,
  OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingResponse, OnboardingState, OnboardingStatusRequest,
} from "../formats/types";
import type { BeginRequest, BeginResult, CommentList, CommentReply, CommentRequest, CopyRequest, MutationRequest, OrphanMutationRequest, OrphanRequest, SavedStatus } from "../main/comments/service";
import type { TransitionRequest } from "../main/comments/transitions";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderPurpose, LocateResult, MenuCommand, MenuInputs, ProjectInitRequest, RemoveResult, RestoreResult, TokenCssChoice, ViewCommand } from "../main/index";
import type { ExternalTarget, SettingsPageTarget, SettingsSection } from "../main/settings";
import type { SetupRead, SetupStatus } from "../main/setupBroker";
import type { ConfigChoice, ConfigKind, ConfigReply } from "../main/configBridge";
import type { Preferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { NotificationTarget } from "../main/notifications";
import type { TestNotificationReply } from "../main/notifyService";
import type { AboutRead } from "../main/about";
import type { InspectResult } from "../main/inspect";
import type { ProjectComments } from "../main/projectComments";
import type { ReviewMarker } from "../comments/review";
import type { FolderEntry } from "../main/view";
import type { ThumbnailReply, ThumbnailTarget } from "../main/thumbnails";
import type { UiState } from "../restore/uiState";
import type { AddPageResponse, AddPageState } from "../main/addPage";

export type { AddPageResponse, AddPageState };
export type {
  AboutRead, ConfigChoice, ConfigKind, ConfigReply, NotificationTarget, Preferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply,
  SettingsPageTarget, SettingsSection, SetupRead, TestNotificationReply,
};
// The Project Settings dialog's config writes; a chosen path goes back only as the choice id main gave.
export type ConfigWrite =
  | { root: string; op: "setTokenCss" | "addServe"; choiceId: string }
  | { root: string; op: "clearTokenCss" }
  | { root: string; op: "removeServe"; path: string };

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
  // newDesign: `subject` (FirstPrompt) or Home's own `text`. model and effort only from the list listConversationModels
  // returned in this run for that root and runtime; attachments by the ids the attachment calls returned. A moved or
  // deleted attachment refuses the start with attachment_missing and its ids in `missing`.
  startConversation: (request: Omit<StartRequest, "anchors" | "attachments"> & { anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ conversationId: string } | ConversationError> => ipcRenderer.invoke("conversation:start", request),
  sendConversation: (request: { conversationId: string; text: string; anchors?: Anchor[] }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:send", request),
  interruptConversation: (request: { conversationId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", request),
  answerConversationPermission: (request: { conversationId: string; requestId: string; optionId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerPermission", request),
  readConversation: (request: { conversationId: string }): Promise<ReturnType<ConversationService["read"]> | ConversationError> => ipcRenderer.invoke("conversation:read", request),
  // The models a provider offers in this folder, read without a model request and kept by main until the connection
  // or installed version changes. An error carries a conversation start code.
  listConversationModels: (request: { root: string; runtime: Provider }): Promise<ModelsReply> => ipcRenderer.invoke("conversation:models", request),
  // Home attachments. Main checks each file (real path, regular file, image signature) and answers per item in order;
  // nothing is copied except a pasted image, which main re-encodes to PNG under userData. A thumbnail is PNG bytes.
  chooseAttachments: (): Promise<AttachmentResult[]> => ipcRenderer.invoke("attachments:choose"),
  // Dropped or pasted Finder files. A file the page made itself has no path and is refused here as not_found.
  async addAttachmentFiles(files: readonly File[]): Promise<AttachmentResult[] | null> {
    const paths = files.map(file => webUtils.getPathForFile(file));
    const found = paths.filter(path => path !== "");
    const checked: AttachmentResult[] | null = found.length === 0 ? [] : await ipcRenderer.invoke("attachments:add-paths", { paths: found });
    if (checked === null) return null;
    let next = 0;
    return paths.map((path, i): AttachmentResult => path === "" ? { ok: false, name: files[i]!.name, error: "not_found" } : checked[next++]!);
  },
  addPastedImage: (bytes: ArrayBuffer | Uint8Array): Promise<AttachmentResult | null> => ipcRenderer.invoke("attachments:add-pasted", { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) }),
  // A pasted image removed before it was sent is deleted; a local file is only forgotten.
  removeAttachment: (id: string): Promise<boolean> => ipcRenderer.invoke("attachments:remove", { id }),
  // Edit on Home: the acceptance checks again for these ids, in order; null when main refused the request.
  recheckAttachments: (ids: readonly string[]): Promise<RecheckResult[] | null> => ipcRenderer.invoke("attachments:recheck", { ids: [...ids] }),
  // Sent ids no last request uses any more; main forgets them and leaves their files alone.
  releaseAttachments: (ids: readonly string[]): Promise<boolean> => ipcRenderer.invoke("attachments:release", { ids: [...ids] }),
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
  // initialize: true is the user's consent to the inspection's planned changes.
  selectOnboardingProject: (request: SessionRequest<OnboardingProjectSelectRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:select", request),
  cloneOnboardingProject: (request: SessionRequest<OnboardingProjectCloneRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:clone", request),
  completeOnboarding: (request: SessionRequest<OnboardingCompleteRequest>): Promise<OnboardingResponse> => ipcRenderer.invoke("onboarding:complete", request),
  // Every session change, from this window or a CLI/MCP client. Drop states of another sessionId.
  onOnboardingSession(listener: (state: OnboardingState) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, state: OnboardingState) => listener(state);
    ipcRenderer.on("onboarding:changed", receive);
    return () => ipcRenderer.removeListener("onboarding:changed", receive);
  },
  // Doan design presets from the bundled CLI, main window only. A reply is the CLI's v1 envelope: a CLI failure
  // (usage_error included) comes back unchanged; an app failure has code request_refused, or cli_error with a reason.
  // A list usage_error means this CLI has no presets; a get usage_error after a successful list is an unknown id.
  designSkills: {
    list: (): Promise<DesignSkillReply<DesignSkillList>> => ipcRenderer.invoke("design-skills:list"),
    get: (id: string): Promise<DesignSkillReply<DesignSkillPreset>> => ipcRenderer.invoke("design-skills:get", { id }),
  },
  homeDirectory: (): Promise<string | null> => ipcRenderer.invoke("app:home"),
  copyPathLine: (): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "pathLine" }),
  // Hidden: closed with the app running, or the whole app hidden (⌘H).
  onWindowVisible: (listener: (visible: boolean) => void): (() => void) =>
    subscribe<{ visible: boolean }>("window:visible", "window:visible", value => listener(value.visible)),
  // Main builds the sentence from a stored, set-up project and the subject
  // (promptSentence); null when either is refused.
  firstPrompt: (root: string, subject: string): Promise<string | null> => ipcRenderer.invoke("onboarding:first-prompt", { root, subject }),
  // Resolves after the clipboard write settled.
  copyFirstPrompt: (root: string, subject: string): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "firstPrompt", root, subject }),
  // The Project step's folder picker: a path only, null when cancelled. The session inspects and registers it.
  // The Add Projects page uses it too; it belongs to no session.
  chooseOnboardingFolder: (purpose: FolderPurpose): Promise<string | null> => ipcRenderer.invoke("onboarding:choose-folder", purpose),
  // The Add Projects page's project session: the onboarding session's project calls and DTOs on channels of its own,
  // with no agents, completion, CLI or MCP. Without a request the read answers the current state and its sessionId;
  // with one it is the session's status (session_stale for another session).
  readAddPage: (request?: { sessionId: string; operationId?: string }): Promise<AddPageResponse> => ipcRenderer.invoke("add-projects:read", request ?? {}),
  inspectAddPageProject: (request: SessionRequest<OnboardingProjectInspectRequest>): Promise<AddPageResponse> => ipcRenderer.invoke("add-projects:inspect", request),
  // initialize: true is the user's consent to the inspection's planned changes.
  selectAddPageProject: (request: SessionRequest<OnboardingProjectSelectRequest>): Promise<AddPageResponse> => ipcRenderer.invoke("add-projects:select", request),
  cloneAddPageProject: (request: SessionRequest<OnboardingProjectCloneRequest>): Promise<AddPageResponse> => ipcRenderer.invoke("add-projects:clone", request),
  cancelAddPageOperation: (request: SessionRequest<OnboardingCancelRequest>): Promise<AddPageResponse> => ipcRenderer.invoke("add-projects:cancel", request),
  onAddPageSession(listener: (state: AddPageState) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, state: AddPageState) => listener(state);
    ipcRenderer.on("add-projects:changed", receive);
    return () => ipcRenderer.removeListener("add-projects:changed", receive);
  },
  // File > Add Project… (⌘O): open the page, or its Choose folder when the page shows its choose phase. Main has
  // already shown a hidden window.
  onOpenAddProjects(listener: () => void): () => void {
    const receive = () => listener();
    ipcRenderer.on("add-projects:open", receive);
    return () => ipcRenderer.removeListener("add-projects:open", receive);
  },
  // A dropped item's disk path, for the page's inspect; null for a file the page made itself.
  droppedPath(file: File): string | null {
    const path = webUtils.getPathForFile(file);
    return path === "" ? null : path;
  },
  // Home chips, banner and Finish card; null only if main refused.
  setupStatus: (): Promise<SetupStatus | null> => ipcRenderer.invoke("setup:status"),
  checkSetupAgain: (): Promise<SetupStatus | null> => ipcRenderer.invoke("setup:check-again"),
  onSetupStatus: (listener: (status: SetupStatus) => void): (() => void) => subscribe("setup:status", "setup:status", listener),
  openInstallPage: (target: ExternalTarget): Promise<boolean> => ipcRenderer.invoke("setup:open-external", { target }),
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
  // Settings page (buzz-settings). Preferences: main validates the change, merges it and writes it; a refused or
  // failed write answers the choices still in effect. null only when main refused the caller.
  readPreferences: (): Promise<PreferencesSnapshot | null> => ipcRenderer.invoke("preferences:read"),
  savePreferences: (patch: PreferencesPatch): Promise<PreferencesWriteReply | null> => ipcRenderer.invoke("preferences:write", patch),
  // Shows one notification whatever the switches say; failed means macOS did not allow it.
  sendTestNotification: (): Promise<TestNotificationReply | null> => ipcRenderer.invoke("notifications:test"),
  // macOS's Notifications pane; the URL is main's.
  openNotificationSettings: (): Promise<boolean> => ipcRenderer.invoke("notifications:open-settings"),
  // Runs the bundled doan for its version; agent tool facts come from main's cache.
  readAbout: (): Promise<AboutRead | null> => ipcRenderer.invoke("about:read"),
  // Main writes what About last read; resolves after the clipboard write settled.
  copyAbout: (): Promise<StepResult> => ipcRenderer.invoke("about:copy"),
  // Project Settings dialog: start a session when it opens and end it when it closes; replies to calls of an ended
  // session answer unavailable.
  startConfigSession: (): Promise<void> => ipcRenderer.invoke("config:session-start"),
  endConfigSession: (): Promise<void> => ipcRenderer.invoke("config:session-end"),
  readConfig: (root: string): Promise<ConfigReply> => ipcRenderer.invoke("config:read", { root }),
  // A sheet on this window; only the choice id goes back in writeConfig.
  chooseConfigPath: (root: string, kind: ConfigKind): Promise<ConfigChoice> => ipcRenderer.invoke("config:choose", { root, kind }),
  writeConfig: (request: ConfigWrite): Promise<ConfigReply> => ipcRenderer.invoke("config:write", request),
  // Connections. A read older than this window's newest one answers stale.
  readSetup: (requestId: string): Promise<SetupRead> => ipcRenderer.invoke("setup:read", { requestId }),
  runSetupStep: (request: StepRequest): Promise<StepResult> => ipcRenderer.invoke("setup:run", request),
  answerSetupConfirm: (answer: { id: string; allow: boolean }): Promise<StepResult> => ipcRenderer.invoke("setup:answer", answer),
  // A notification was clicked; main has already shown and focused the window. Interpret with notificationTarget.
  onNotificationClick(listener: (target: NotificationTarget) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: NotificationTarget) => listener(target);
    ipcRenderer.on("notifications:click", receive);
    return () => ipcRenderer.removeListener("notifications:click", receive);
  },
  // Main asks for the Settings page, at a category and optionally a provider row; a hidden window is already shown.
  onOpenSettingsPage(listener: (target: SettingsPageTarget) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: SettingsPageTarget) => listener(target);
    ipcRenderer.on("settings-page:open", receive);
    return () => ipcRenderer.removeListener("settings-page:open", receive);
  },
};

export type DoanApi = typeof api;

contextBridge.exposeInMainWorld("doan", api);
