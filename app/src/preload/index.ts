import type { WorkItem } from "../main/workState";
import type { OpenAnswer, OpenAsk, OpenLinkResult } from "../main/deepLinks";
import type { AuthCheckReply, AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { ShellActivity } from "../main/shellActivity";
import type { ConversationService, StartRequest } from "../main/conversation/service";
import type { ConversationError } from "../main/conversation/ipc";
import type { ModelsReply } from "../main/conversation/models";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ReturnedDraft } from "../main/conversation/drafts";
import type { AttachmentResult, RecheckResult } from "../main/attachments";
import type { DesignSkillList, DesignSkillPreset, DesignSkillReply } from "../main/designSkills";
import type { Anchor, Canvas, ConversationEvent, Runtime, UnavailableReason } from "../main/conversation/types";
import type {
  Author, OnboardingCancelRequest, OnboardingCheckRequest, OnboardingCompleteRequest, OnboardingProjectCloneRequest,
  OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingResponse, OnboardingState, OnboardingStatusRequest,
} from "../formats/types";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderPurpose, LocateResult, MenuCommand, MenuInputs, ProjectInitRequest, RemoveResult, TokenCssChoice, ViewCommand } from "../main/index";
import type { ExternalTarget, SettingsPageTarget, SettingsSection } from "../main/settings";
import type { ConfigChoice, ConfigKind, ConfigReply } from "../main/configBridge";
import type { Preferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { NotificationTarget } from "../main/notifications";
import type { TestNotificationReply } from "../main/notifyService";
import type { AboutRead } from "../main/about";
import type { InspectResult } from "../main/inspect";
import type { FolderEntry } from "../main/view";
import type { TrashPlanReply, TrashReply } from "../main/canvasTrash";
import type { ExportReply } from "../main/canvasExport";
import type { ThumbnailReply, ThumbnailTarget } from "../main/thumbnails";
import type { UiState } from "../restore/uiState";
import type { AddPageResponse, AddPageState } from "../main/addPage";

export type { AddPageResponse, AddPageState, WorkItem, OpenLinkResult, TrashPlanReply, TrashReply, ExportReply };
export type {
  AboutRead, ConfigChoice, ConfigKind, ConfigReply, NotificationTarget, Preferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply,
  SettingsPageTarget, SettingsSection, TestNotificationReply,
};
// A clipboard write main made; stale when main refused the request.
type CopyResult = { kind: "success" } | { kind: "error"; message: string } | { kind: "stale" };
// The Project Settings page's config writes; a chosen path goes back only as the choice id main gave.
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
  // Subscribe before getWork so a signal received during the read is not lost.
  getWork: (): Promise<WorkItem[]> => ipcRenderer.invoke("work:get"),
  onWorkChanged(listener: (items: WorkItem[]) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, items: WorkItem[]) => listener(items);
    ipcRenderer.on("work:changed", receive);
    return () => ipcRenderer.removeListener("work:changed", receive);
  },
  onOpenLink(listener: (result: OpenLinkResult) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, result: OpenLinkResult) => listener(result);
    ipcRenderer.on("deep-link:open", receive);
    return () => ipcRenderer.removeListener("deep-link:open", receive);
  },
  // Call only after subscribing, the launch restore is done, and the first folders snapshot arrived.
  openLinksReady: (): Promise<void> => ipcRenderer.invoke("deep-link:ready"),
  // `doan open` requests, which main sends only once links are ready; answer each by its id with answerOpenRequest.
  onOpenRequest(listener: (request: OpenAsk) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, request: OpenAsk) => listener(request);
    ipcRenderer.on("doan-open:request", receive);
    return () => ipcRenderer.removeListener("doan-open:request", receive);
  },
  answerOpenRequest: (answer: OpenAnswer): Promise<void> => ipcRenderer.invoke("doan-open:answer", answer),
  conversationResumeTarget: (request: { root: string; canvas: Canvas }): Promise<{ available: true; runtime: Runtime; lastCheckAt: string; session?: string } | { available: false; reason: "no_record" | UnavailableReason; runtime?: Runtime; session?: string } | ConversationError> => ipcRenderer.invoke("conversation:resumeTarget", request),
  conversationForCanvas: (request: { root: string; canvas: Canvas }): Promise<ReturnType<ConversationService["forCanvas"]> | ConversationError> => ipcRenderer.invoke("conversation:forCanvas", request),
  // newDesign takes `text`. model and effort only from the list listConversationModels
  // returned in this run for that root and runtime; permissionMode one of the common ids (resume takes none); attachments by the ids the attachment calls returned. A moved or
  // deleted attachment refuses the start with attachment_missing and its ids in `missing`.
  startConversation: (request: Omit<StartRequest, "anchors" | "attachments"> & { anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ conversationId: string } | ConversationError> => ipcRenderer.invoke("conversation:start", request),
  // model (with an optional effort of it) only when the person changed it, from listConversationModels of this run for
  // the conversation's provider; permissionMode, one of the common ids, whenever the picker names one, judged apart from
  // the model ("default" clears the stored mode); attachments by ids as for a start. A legacy external conversation
  // takes none of them,
  // and no request names a provider. project_busy: another conversation of this project without a canvas is working.
  // A send to an archived conversation restores it: busy while the canvas's current conversation works,
  // canvas_not_found when its canvas is gone or its ID is listed twice.
  sendConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; model?: string; effort?: string; permissionMode?: PermissionModeId; attachments?: { id: string }[] }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:send", request),
  // While the conversation works (not_running otherwise), a message waits in main and goes out with the others as one
  // message after turn.done; text, anchors and attachments only (model, effort and permissionMode are bad_request; the
  // queue goes out in the mode stored when it is flushed, setConversationPermissionMode). queue_limit: the
  // queue and the conversation's returned draft together would pass one message (32,768 characters, 32 anchors, 10
  // attachments) or the drafts file's size. Removing an item or taking a draft that cannot be saved answers an error
  // and keeps it. main holds the
  // attachments from here on. A failed or stopped turn, a refused queued send or a restart hands the queue back as a
  // draft: the list row then has returnedDraft, and takeConversationDraft hands it over once (attachments as recorded
  // paths, for attachmentsFromPaths). Each change is announced with onConversationListChanged.
  queueConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ itemId: string } | ConversationError> => ipcRenderer.invoke("conversation:queue", request),
  // The picker changed on an existing conversation without a send: main stores it ("default" as none) and announces
  // onConversationListChanged. A running turn keeps its mode; a queue goes out in the mode stored when it is flushed.
  // bad_request for an unknown id or a legacy external conversation.
  setConversationPermissionMode: (request: { conversationId: string; permissionMode: PermissionModeId }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:setPermissionMode", request),
  // stale: the item already went out, came back or was removed.
  removeQueuedMessage: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:removeQueued", request),
  // Send now: the queued message goes into the running turn without stopping it. It answers once the agent read it,
  // when the message is in the turn's history and out of the queue. not_running: nothing runs that can take it, the
  // provider refused it, or the turn ended first (the message stays queued and follows the queue's rules); stale: the
  // item is gone or already on its way out; attachment_missing: one of its files went away (it stays queued).
  sendQueuedNow: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:sendQueuedNow", request),
  takeConversationDraft: (request: { conversationId: string }): Promise<ReturnedDraft | null | ConversationError> => ipcRenderer.invoke("conversation:takeDraft", request),
  // One summary per conversation main keeps for this project, current and archived; a row whose history cannot be
  // read carries readError. Read it again on onConversationListChanged, in whatever order the reply and change arrive.
  // working: main still works on it (preparing, running, waiting for an answer, judging its turn, about to send its
  // queue, waiting for its previous process); a project conversation that works holds its root. phase is the history's.
  listConversations: (request: { root: string }): Promise<ConversationSummary[] | ConversationError> => ipcRenderer.invoke("conversation:list", request),
  // The person has seen this conversation up to seq; main cuts it to the last seq and never moves it back.
  markConversationSeen: (request: { conversationId: string; seq: number }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:markSeen", request),
  onConversationListChanged(listener: (change: { root: string }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, change: { root: string }) => listener(change);
    ipcRenderer.on("conversation:listChanged", receive);
    return () => ipcRenderer.removeListener("conversation:listChanged", receive);
  },
  // An https link from an agent reply, opened in the system browser; false when main refused it.
  openLink: (url: string): Promise<boolean> => ipcRenderer.invoke("shell:openLink", { url }),
  // The OS cursor in the window's content coordinates (CSS px), null when main cannot tell.
  pointer: (): Promise<{ x: number; y: number } | null> => ipcRenderer.invoke("pointer:get"),
  interruptConversation: (request: { conversationId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", request),
  answerConversationPermission: (request: { conversationId: string; requestId: string; optionId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerPermission", request),
  readConversation: (request: { conversationId: string }): Promise<ReturnType<ConversationService["read"]> | ConversationError> => ipcRenderer.invoke("conversation:read", request),
  // The models a provider offers in this folder, read without a model request and kept by main until the connection
  // or installed version changes. An error carries a conversation start code. modes: an ACP server's mode list from the
  // same read, for permissionOptions (permissionMode.ts); none for Claude and Codex.
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
  // Edit on Home after a reload or restart: the paths a conversation recorded, checked as new files and answered in
  // order (a moved or deleted file as not_found); null for more than ten paths or a malformed request.
  attachmentsFromPaths: (paths: readonly string[]): Promise<AttachmentResult[] | null> => ipcRenderer.invoke("attachments:fromPaths", { paths: [...paths] }),
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
  // The first-run session the CLI shares: same state, revision and operations as app-socket v2 (the reply DTO is
  // the socket's). Sign-in itself stays on the agent-auth calls above; a CLI sign-in is owned by this window too.
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
  // Every session change, from this window or the CLI. Drop states of another sessionId.
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
  // Hidden: closed with the app running, or the whole app hidden (⌘H).
  onWindowVisible: (listener: (visible: boolean) => void): (() => void) =>
    subscribe<{ visible: boolean }>("window:visible", "window:visible", value => listener(value.visible)),
  // macOS fullscreen, where the window has no traffic lights.
  onFullScreen: (listener: (fullScreen: boolean) => void): (() => void) =>
    subscribe<{ fullScreen: boolean }>("window:fullscreen", "window:fullscreen", value => listener(value.fullScreen)),
  // The Project step's folder picker: a path only, null when cancelled. The session inspects and registers it.
  // The Add Projects page uses it too; it belongs to no session.
  chooseOnboardingFolder: (purpose: FolderPurpose): Promise<string | null> => ipcRenderer.invoke("onboarding:choose-folder", purpose),
  // The Add Projects page's project session: the onboarding session's project calls and DTOs on channels of its own,
  // with no agents, completion or CLI. Without a request the read answers the current state and its sessionId;
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
  openInstallPage: (target: ExternalTarget): Promise<boolean> => ipcRenderer.invoke("setup:open-external", { target }),
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
  locateProject: (path: string): Promise<LocateResult> => ipcRenderer.invoke("folders:locate", { path }),
  revealProject: (path: string): Promise<void> => ipcRenderer.invoke("folders:reveal", { path }),
  setMenuState: (inputs: MenuInputs): Promise<void> => ipcRenderer.invoke("menu:state", inputs),
  // canvas-row-menu: a listed canvas row by root and path; main checks it against its own list and the disk, and judges
  // busy again. Ask the plan when the Move to Trash dialog opens (does a comment file go too?), then move on confirm.
  planCanvasTrash: (root: string, path: string): Promise<TrashPlanReply> => ipcRenderer.invoke("canvas:trashPlan", { root, path }),
  trashCanvas: (root: string, path: string): Promise<TrashReply> => ipcRenderer.invoke("canvas:trash", { root, path }),
  // Opens the save panel and runs `doan export`; resolves once the file is written or the export failed or was cancelled.
  exportCanvas: (root: string, path: string): Promise<ExportReply> => ipcRenderer.invoke("canvas:export", { root, path }),
  // An export of this listed row passed the save panel and its CLI run starts now; the reply follows when it ends.
  onExportRunning(listener: (target: { root: string; path: string }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: { root: string; path: string }) => listener(target);
    ipcRenderer.on("canvas:exportRunning", receive);
    return () => ipcRenderer.removeListener("canvas:exportRunning", receive);
  },
  // Show in Finder for an `exported` reply's `reveal` id.
  revealExport: (reveal: string): Promise<void> => ipcRenderer.invoke("canvas:revealExport", reveal),
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
  // The canvas page shows an unseen canvas (canvas-viewport-units D9); main records its mtime and sends the list again.
  markCanvasSeen: (request: { root: string; path: string; mtimeMs: number }): Promise<boolean> => ipcRenderer.invoke("canvas:seen", request),
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
  copyAbout: (): Promise<CopyResult> => ipcRenderer.invoke("about:copy"),
  // Project Settings page: start a session when it mounts and end it when it unmounts; replies to calls of an ended
  // session answer unavailable.
  startConfigSession: (): Promise<void> => ipcRenderer.invoke("config:session-start"),
  endConfigSession: (): Promise<void> => ipcRenderer.invoke("config:session-end"),
  readConfig: (root: string): Promise<ConfigReply> => ipcRenderer.invoke("config:read", { root }),
  // A sheet on this window; only the choice id goes back in writeConfig.
  chooseConfigPath: (root: string, kind: ConfigKind): Promise<ConfigChoice> => ipcRenderer.invoke("config:choose", { root, kind }),
  writeConfig: (request: ConfigWrite): Promise<ConfigReply> => ipcRenderer.invoke("config:write", request),
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
