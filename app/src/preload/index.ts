import type { WorkItem } from "../main/workState";
import type { ConversationWork } from "../main/conversationWork";
import type { OpenAnswer, OpenAsk, OpenLinkResult } from "../main/deepLinks";
import type { AuthCheckReply, AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { UsageEntry } from "../main/agentAuth/usageTypes";
import type { McpAddReply, McpReply, McpSnapshot } from "../main/mcpConnectors/ipc";
import type { McpProvider } from "../main/mcpConnectors/presets";
import type { ShellActivity } from "../main/shellActivity";
import type { ConversationService, ScheduledItem, StartRequest, TakenDraft } from "../main/conversation/service";
import type { ConversationError, ScheduledSend } from "../main/conversation/ipc";
import type { ModelsReply } from "../main/conversation/models";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { QuestionAnswerInput } from "../main/conversation/question";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationHandoffNotice } from "../main/conversation/handoff";
import type { AttachmentMeta, PastedTextMeta, AttachmentResult, RecheckResult } from "../main/attachments";
import type { DesignSkillList, DesignSkillPreset, DesignSkillReply } from "../main/designSkills";
import type { Anchor, BoundarySignal, Canvas, ConversationEvent, Runtime, SkillSummary, StageSignal, UnavailableReason } from "../main/conversation/types";
import type {
  OnboardingCancelRequest, OnboardingCheckRequest, OnboardingCompleteRequest, OnboardingProjectCloneRequest,
  OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingResponse, OnboardingState, OnboardingStatusRequest,
} from "../formats/types";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderPurpose, LocateResult, NewFolderResult, MenuCommand, MenuInputs, ProjectInitRequest, RemoveResult, TokenCssChoice, ViewCommand } from "../main/index";
import type { ExternalTarget, SettingsPageTarget, SettingsSection } from "../main/settings";
import type { InstallResult } from "../main/installCommand";
import type { ConfigChoice, ConfigKind, ConfigReply } from "../main/configBridge";
import type { Preferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { NotificationTarget } from "../main/notifications";
import type { TestNotificationReply } from "../main/notifyService";
import type { AboutRead } from "../main/about";
import type { StarMoment } from "../main/starPrompt";
import type { InstallGate, UpdateSnapshot } from "../main/update/types";
import type { InspectRefused, InspectReply, InspectRequest } from "../main/inspector";
import type { FolderEntry, ReadStateProblem } from "../main/view";
import type { TrashPlanReply, TrashReply } from "../main/canvasTrash";
import type { ExportReply } from "../main/canvasExport";
import type { ThumbnailReply, ThumbnailTarget } from "../main/thumbnails";
import type { UiState } from "../restore/uiState";
import type { AddPageResponse, AddPageState } from "../main/addPage";
import type { PlayRequest, PrototypePlaying, PrototypeReveal } from "../main/prototype/ipc";
import type { ComposerChoice } from "../renderer/rememberChoice";

export type { AddPageResponse, AddPageState, WorkItem, OpenLinkResult, TrashPlanReply, TrashReply, ExportReply };
export type { McpAddReply, McpReply, McpSnapshot };
export type { InstallGate, UpdateSnapshot };
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
  | { root: string; op: "removeServe"; path: string }
  | { root: string; op: "setStorage"; storage: "repo" | "local" }
  // gitInit: the person confirmed creating the Git repository Keep out of Git needs outside Git.
  | { root: string; op: "setStorage"; storage: "local"; gitInit: true };

// Subscribes, and asks for the current value since the first event can precede the listener (an earlier event wins). Each
// preload keeps its own copy: a sandboxed preload cannot require a shared chunk.
function subscribe<T>(event: string, initial: string, listener: (value: T) => void): () => void {
  let active = true, received = false;
  const receive = (_event: Electron.IpcRendererEvent, value: T) => { received = true; listener(value); };
  ipcRenderer.on(event, receive);
  void ipcRenderer.invoke(initial).then((value: T | null) => { if (active && !received && value !== null) listener(value); });
  return () => { active = false; ipcRenderer.removeListener(event, receive); };
}

// The onboarding socket DTO as the window sends it: main adds the version and needs no token from its own window.
type SessionRequest<T> = T extends unknown ? Omit<T, "v" | "token" | "op"> : never;

// main/clockHourCycle.ts's argument: whether times read in 12-hour form, as macOS is set when the window opened.
function clockHour12(argv: readonly string[]): boolean {
  const value = argv.find(arg => arg.startsWith("--doan-clock-hour12="))?.slice("--doan-clock-hour12=".length);
  return value !== "0";
}
// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  // Whether the clock reads in 12-hour form (macOS's setting when this window opened; a change applies after a restart).
  clockHour12: clockHour12(process.argv),
  // Subscribe before getWork so a signal received during the read is not lost.
  getWork: (): Promise<WorkItem[]> => ipcRenderer.invoke("work:get"),
  onWorkChanged(listener: (items: WorkItem[]) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, items: WorkItem[]) => listener(items);
    ipcRenderer.on("work:changed", receive);
    return () => ipcRenderer.removeListener("work:changed", receive);
  },
  // An app conversation's last work update, while its turn runs. Subscribe first, as
  // for getWork.
  getConversationWork: (): Promise<ConversationWork[]> => ipcRenderer.invoke("conversation-work:get"),
  onConversationWorkChanged(listener: (items: ConversationWork[]) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, items: ConversationWork[]) => listener(items);
    ipcRenderer.on("conversation-work:changed", receive);
    return () => ipcRenderer.removeListener("conversation-work:changed", receive);
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
  // newDesign takes `text`. model and effort only from this run's listConversationModels for that root and runtime; resume
  // takes no model, effort, fast, mode or attachments. A moved or deleted attachment: attachment_missing, ids in `missing`.
  startConversation: (request: Omit<StartRequest, "anchors" | "attachments"> & { anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ conversationId: string } | ConversationError> => ipcRenderer.invoke("conversation:start", request),
  // model/effort/fast only when changed; no provider. canvas_not_found: canvas gone or ID listed twice. rate_limited may
  // carry resetsAt. A limit or schedule queues it, refusing picker fields (ARCHITECTURE §7 'Usage-limit schedule').
  sendConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; attachments?: { id: string }[] }): Promise<void | ScheduledSend | ConversationError> => ipcRenderer.invoke("conversation:send", request),
  // A scheduled conversation's waiting messages in order, auto-scheduled ones included; empty when not scheduled.
  scheduledMessages: (request: { conversationId: string }): Promise<ScheduledItem[] | ConversationError> => ipcRenderer.invoke("conversation:scheduled", request),
  // While working (else not_running) main holds it (no model, effort, fast or mode); a failed or stopped turn, a refused queued send
  // or a restart returns the queue as a draft (row returnedDraft, taken once by takeConversationDraft; ARCHITECTURE §7 'Queue').
  queueConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ itemId: string } | ConversationError> => ipcRenderer.invoke("conversation:queue", request),
  // Stores and announces a picker change made without a send ("default" as none); a running turn keeps its mode, a queue
  // flushes in the stored one. bad_request: unknown id or legacy external conversation.
  setConversationPermissionMode: (request: { conversationId: string; permissionMode: PermissionModeId }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:setPermissionMode", request),
  // stale: the item already went out, came back or was removed. A removal or draft take that cannot be saved answers an
  // error and keeps what it would have taken.
  removeQueuedMessage: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:removeQueued", request),
  // Answers once the agent read it, now in the turn and out of the queue. stale: item gone or already going out;
  // not_running or attachment_missing leave it queued (ARCHITECTURE §7 'Queue').
  sendQueuedNow: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:sendQueuedNow", request),
  takeConversationDraft: (request: { conversationId: string }): Promise<TakenDraft | null | ConversationError> => ipcRenderer.invoke("conversation:takeDraft", request),
  // The first message of a new conversation in root (on canvas, or on none) that a quit stopped before main accepted it,
  // in an earlier run, handed over once (attachments as recorded paths); null when there is none.
  takeStartDraft: (request: { root: string; canvas?: Canvas }): Promise<TakenDraft | null | ConversationError> => ipcRenderer.invoke("conversation:takeStartDraft", request),
  // Deletes only Doan's record on this device, not the agent's session files. busy while working or quitting;
  // not_found when already gone; unknown, deleting nothing, when the index cannot be read.
  deleteConversation: (request: { conversationId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:delete", request),
  // Re-read on onConversationListChanged, in any arrival order; an unreadable row carries readError. `working` (main
  // still busy with it) is wider than the history's `phase` (ARCHITECTURE §7 'List and seen').
  listConversations: (request: { root: string }): Promise<ConversationSummary[] | ConversationError> => ipcRenderer.invoke("conversation:list", request),
  // The person has seen this conversation up to seq; main cuts it to the last seq and never moves it back.
  markConversationSeen: (request: { conversationId: string; seq: number }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:markSeen", request),
  onConversationListChanged(listener: (change: { root: string }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, change: { root: string }) => listener(change);
    ipcRenderer.on("conversation:listChanged", receive);
    return () => ipcRenderer.removeListener("conversation:listChanged", receive);
  },
  // `doan remove` took these roots out of the list; the folder list itself arrives on `folders` as for any change.
  onFoldersRemoved(listener: (paths: string[]) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, value: { paths: string[] }) => listener(value.paths);
    ipcRenderer.on("folders:removed", receive);
    return () => ipcRenderer.removeListener("folders:removed", receive);
  },
  // A handoff started a conversation on another canvas: its root, the earlier conversation
  // and its canvas, and the new one and its canvas. The renderer decides whether to move there or show a toast.
  onConversationHandoff(listener: (notice: ConversationHandoffNotice) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, notice: ConversationHandoffNotice) => listener(notice);
    ipcRenderer.on("conversation:handoff", receive);
    return () => ipcRenderer.removeListener("conversation:handoff", receive);
  },
  // An https link from an agent reply, opened in the system browser; false when main refused it.
  openLink: (url: string): Promise<boolean> => ipcRenderer.invoke("shell:openLink", { url }),
  // The OS cursor in the window's content coordinates (CSS px), null when main cannot tell.
  pointer: (): Promise<{ x: number; y: number } | null> => ipcRenderer.invoke("pointer:get"),
  interruptProjectTurn: (request: { conversationId: string; turnId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", { ...request, forRemoval: true }),
  interruptConversation: (request: { conversationId: string; turnId?: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", request),
  answerConversationPermission: (request: { conversationId: string; requestId: string; optionId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerPermission", request),
  answerConversationQuestion: (request: { conversationId: string; requestId: string } & QuestionAnswerInput): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerQuestion", request),
  readConversation: (request: { conversationId: string }): Promise<ReturnType<ConversationService["read"]> | ConversationError> => ipcRenderer.invoke("conversation:read", request),
  // Read without a model request, cached until the connection or installed version changes; errors are start codes.
  // modes: an ACP server's mode list from the same read, for permissionOptions (none for Claude and Codex).
  listConversationModels: (request: { root: string; runtime: Provider }): Promise<ModelsReply> => ipcRenderer.invoke("conversation:models", request),
  // Claude/Codex project skills (cached 30 s), then built-in command rows; ACP rows are the conversation's last
  // pushed list, none before its first session. Errors are start codes.
  listConversationSkills: (request: { root: string; provider: Provider; conversationId?: string }): Promise<{ skills: SkillSummary[]; passthrough?: string[] } | ConversationError> => ipcRenderer.invoke("conversation:skills", request),
  // Main checks each item and answers in order; only a pasted image is copied (re-encoded PNG under userData) and a
  // folder is never read. Thumbnails are PNG bytes.
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
  addPastedText: (text: string, meta: PastedTextMeta): Promise<AttachmentResult | null> => ipcRenderer.invoke("attachments:add-pasted-text", { text, ...meta }),
  // Main captures rect (window content CSS px, whole window only) as a paste; capture_failed for an empty image or
  // failed save, null when main refused.
  captureCanvas: (rect: { x: number; y: number; width: number; height: number }): Promise<AttachmentResult | null> => ipcRenderer.invoke("attachments:capture", { rect }),
  // A pasted image removed before it was sent is deleted; a local file is only forgotten.
  removeAttachment: (id: string): Promise<boolean> => ipcRenderer.invoke("attachments:remove", { id }),
  // Edit on Home: the acceptance checks again for these ids, in order; null when main refused the request.
  recheckAttachments: (ids: readonly string[]): Promise<RecheckResult[] | null> => ipcRenderer.invoke("attachments:recheck", { ids: [...ids] }),
  // Edit on Home after a reload or restart: the paths a conversation recorded, checked as new files and answered in
  // order (a moved or deleted file as not_found); null for more than ten paths or a malformed request.
  attachmentsFromPaths: (paths: readonly string[], metadata?: readonly AttachmentMeta[]): Promise<AttachmentResult[] | null> => ipcRenderer.invoke("attachments:fromPaths", { paths: [...paths], ...(metadata ? { metadata: [...metadata] } : {}) }),
  // Sent ids no last request uses any more; main forgets them and leaves their files alone.
  releaseAttachments: (ids: readonly string[]): Promise<boolean> => ipcRenderer.invoke("attachments:release", { ids: [...ids] }),
  onConversationEvent(listener: (event: ConversationEvent) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, event: ConversationEvent) => listener(event);
    ipcRenderer.on("conversation:event", receive);
    return () => ipcRenderer.removeListener("conversation:event", receive);
  },
  // Never stored. Keep the highest rev per turnId: this event and a readConversation reply's stage are unordered.
  // seq is the conversation's last event seq when sent.
  onConversationStage(listener: (signal: StageSignal) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, signal: StageSignal) => listener(signal);
    ipcRenderer.on("conversation:stage", receive);
    return () => ipcRenderer.removeListener("conversation:stage", receive);
  },
  // A command turn's boundary as its provider reported it in this run, never stored. readConversation's commands carry
  // the same boundaries once read (rebuilt from the record after a restart), so a boundary may arrive by both.
  onConversationBoundary(listener: (signal: BoundarySignal) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, signal: BoundarySignal) => listener(signal);
    ipcRenderer.on("conversation:boundary", receive);
    return () => ipcRenderer.removeListener("conversation:boundary", receive);
  },
  // Main binds attempts and links to this window; onAgentAuth delivers only newer revisions. null: storage unreadable.
  // Recover a not_logged_in from readiness.action: a Codex re-sign-in's new connection cannot resume old conversations.
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
  // Without a trigger main only answers what it holds; "open" and "refresh" (ignores the interval) may start reads.
  // Entries carry no revision, so the first read is delivered only if no change event came first.
  readAgentUsage: (trigger?: "open" | "refresh"): Promise<UsageEntry[]> => ipcRenderer.invoke("agent-usage:read", trigger ? { trigger } : {}),
  onAgentUsage(listener: (entries: UsageEntry[]) => void): () => void {
    let active = true, changed = false;
    const receive = (_event: Electron.IpcRendererEvent, entries: UsageEntry[]) => { if (!active) return; changed = true; listener(entries); };
    ipcRenderer.on("agent-usage:changed", receive);
    // A refused read leaves the listener on change events; it never becomes an unhandled rejection in the page.
    ipcRenderer.invoke("agent-usage:read", {}).then((entries: UsageEntry[]) => { if (active && !changed) listener(entries); }, () => {});
    return () => { active = false; ipcRenderer.removeListener("agent-usage:changed", receive); };
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
  // Newest revision only, as onAgentAuth; statuses are never polled (refresh re-reads them). Sign-in links stay in
  // main: Claude's opens by itself and openMcpLink reopens it.
  readMcpConnectors: (options: { refresh?: boolean } = {}): Promise<McpSnapshot> => ipcRenderer.invoke("mcp-connectors:list", options.refresh ? { refresh: true } : undefined),
  onMcpConnectors(listener: (snapshot: McpSnapshot) => void): () => void {
    let active = true, revision = -1;
    const deliver = (snapshot: McpSnapshot | null) => {
      if (!active || !snapshot || snapshot.revision <= revision) return;
      revision = snapshot.revision; listener(snapshot);
    };
    const receive = (_event: Electron.IpcRendererEvent, snapshot: McpSnapshot) => deliver(snapshot);
    ipcRenderer.on("mcp-connectors:changed", receive);
    ipcRenderer.invoke("mcp-connectors:list", undefined).then(deliver, () => {});
    return () => { active = false; ipcRenderer.removeListener("mcp-connectors:changed", receive); };
  },
  addMcpServer: (url: string): Promise<McpAddReply> => ipcRenderer.invoke("mcp-connectors:add", { url }),
  connectMcpServer: (provider: McpProvider, name: string): Promise<McpReply> => ipcRenderer.invoke("mcp-connectors:connect", { provider, name }),
  disconnectMcpServer: (provider: McpProvider, name: string): Promise<McpReply> => ipcRenderer.invoke("mcp-connectors:disconnect", { provider, name }),
  cancelMcpConnect: (provider: McpProvider, name: string): Promise<McpReply> => ipcRenderer.invoke("mcp-connectors:cancel", { provider, name }),
  openMcpLink: (provider: McpProvider, name: string): Promise<McpReply> => ipcRenderer.invoke("mcp-connectors:open-link", { provider, name }),
  removeMcpServer: (name: string): Promise<McpReply> => ipcRenderer.invoke("mcp-connectors:remove", { name }),
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
  // Replies are the CLI's v1 envelope, CLI failures unchanged; app failures: request_refused, or cli_error with reason.
  // A list usage_error means no preset support; a get usage_error after a good list is an unknown id.
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
  // parent only places the save panel; main makes the folder at the panel's path. token names the request, which a
  // step that goes away cancels, so nothing is made then.
  newOnboardingFolder: (parent: string, token: string): Promise<NewFolderResult> => ipcRenderer.invoke("onboarding:new-folder", { parent, token }),
  cancelOnboardingFolder: (token: string): Promise<boolean> => ipcRenderer.invoke("onboarding:new-folder-cancel", { token }),
  // The Add Projects page's own session: onboarding's project calls on separate channels, no agents, completion or
  // CLI. No request reads current state and sessionId; with one it is status (session_stale for another).
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
  // File > Add Projects… (⌘O): open the page, or its Choose folder when the page shows its choose phase. Main has
  // already shown a hidden window.
  onOpenAddProjects(listener: () => void): () => void {
    const receive = () => listener();
    ipcRenderer.on("add-projects:open", receive);
    return () => ipcRenderer.removeListener("add-projects:open", receive);
  },
  // A dropped or pasted item's disk path; null for a file the page made itself.
  droppedPath(file: File): string | null {
    const path = webUtils.getPathForFile(file);
    return path === "" ? null : path;
  },
  // Open install page; Install and Update go through openInstall.
  openInstallPage: (target: ExternalTarget): Promise<boolean> => ipcRenderer.invoke("setup:open-external", { target }),
  // Only the provider: main picks install or update, the command and the script path.
  openInstall: (target: ExternalTarget): Promise<InstallResult> => ipcRenderer.invoke("setup:open-install", { target }),
  chooseTokenCss: (root: string): Promise<TokenCssChoice> => ipcRenderer.invoke("project:choose-token-css", { root }),
  initializeProject: (request: ProjectInitRequest): Promise<ProjectInitResult> => ipcRenderer.invoke("project:init", request),
  // The stored root, or null when the sheet was cancelled or the folder refused.
  openFolder: (): Promise<string | null> => ipcRenderer.invoke("folders:open"),
  reopenFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:reopen", path),
  // Main validates it again and keeps one selection for `doan active`.
  setSelection: (selection: Selection | null): Promise<void> => ipcRenderer.invoke("selection:set", selection),
  // Main reads the shown canvas with CDP; values and token names are canvas text.
  inspect: (request: InspectRequest): Promise<InspectReply | InspectRefused> => ipcRenderer.invoke("inspect:get", request),
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
  removeProjects: (paths: string[], group?: true): Promise<RemoveResult> => ipcRenderer.invoke("folders:remove", group ? { paths, group } : { paths }),
  locateProject: (path: string): Promise<LocateResult> => ipcRenderer.invoke("folders:locate", { path }),
  revealProject: (path: string): Promise<void> => ipcRenderer.invoke("folders:reveal", { path }),
  setMenuState: (inputs: MenuInputs): Promise<void> => ipcRenderer.invoke("menu:state", inputs),
  // Move to Trash names a listed canvas row by root and path; main checks it against its list and the disk and judges
  // busy again. Ask the plan when the dialog opens, then move on confirm.
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
  readShellActivity: (request: { roots: string[] }): Promise<ShellActivity[] | null> => ipcRenderer.invoke("shell:activity", request),
  // The canvas the canvas page is meant to show, null when it shows none. Main records the read state once its own
  // document bindings prove the canvas shown, and sends the list again.
  showCanvas: (request: { root: string; path: string } | null): Promise<boolean> => ipcRenderer.invoke("read-state:showing", request),
  // Retry, or re-entering a project: what still fails after the read state was saved and read again, or null.
  retryReadState: (request: { root: string; path?: string }): Promise<ReadStateProblem | null | false> => ipcRenderer.invoke("read-state:retry", request),
  // The project list (folders.json) could not be saved; saveFoldersAgain writes the list main holds now, true once saved.
  onFoldersSaveFailed(listener: () => void): () => void {
    const receive = () => listener();
    ipcRenderer.on("folders:save-failed", receive);
    return () => ipcRenderer.removeListener("folders:save-failed", receive);
  },
  saveFoldersAgain: (): Promise<boolean> => ipcRenderer.invoke("folders:save-again"),
  // A read-state failure found while the person did not ask, for a toast on that project.
  onReadStateProblem(listener: (notice: { root: string; problem: ReadStateProblem }) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, notice: { root: string; problem: ReadStateProblem }) => listener(notice);
    ipcRenderer.on("read-state:problem", receive);
    return () => ipcRenderer.removeListener("read-state:problem", receive);
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
  // The existing-user buddy screen main decided at launch (true while it is open), and its close, which releases
  // first run's lock in the menu and the open-Settings command.
  readBuddyIntro: (): Promise<boolean> => ipcRenderer.invoke("buddy-intro:read"),
  closeBuddyIntro: (): Promise<void> => ipcRenderer.invoke("buddy-intro:close"),
  // Settings page. Preferences: main validates the change, merges it and writes it; a refused or
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
  // App updates: Settings > About's update row, the header button and the Doan menu item. Requests carry no data; main
  // decides from its own state. null: main refused the caller.
  readUpdate: (): Promise<UpdateSnapshot | null> => ipcRenderer.invoke("update:get"),
  // Snapshots carry no revision, so the first read is delivered only if no change event came before it.
  onUpdate(listener: (snapshot: UpdateSnapshot) => void): () => void {
    let active = true, changed = false;
    const receive = (_event: Electron.IpcRendererEvent, snapshot: UpdateSnapshot) => { if (!active) return; changed = true; listener(snapshot); };
    ipcRenderer.on("update:state", receive);
    // A refused read leaves the listener on change events; it never becomes an unhandled rejection in the page.
    ipcRenderer.invoke("update:get").then((snapshot: UpdateSnapshot | null) => { if (active && !changed && snapshot !== null) listener(snapshot); }, () => {});
    return () => { active = false; ipcRenderer.removeListener("update:state", receive); };
  },
  // A manual check (Check for Updates, Retry); the result arrives as a snapshot.
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("update:check"),
  // Restart to Update. allowed: the restart has started; blocked: a conversation holds it back, read the reason; null:
  // nothing to install.
  installUpdate: (): Promise<InstallGate | null> => ipcRenderer.invoke("update:install"),
  // The ready version's GitHub release page in the browser; false when there is none or it could not open.
  openReleaseNotes: (): Promise<boolean> => ipcRenderer.invoke("update:openNotes"),
  // The GitHub star card. Main says when a card is due; the renderer still waits for a quiet moment. Requests carry no
  // data: main opens its own repository URL (true when the browser opened) and keeps the card's state.
  onStarMoment(listener: (moment: StarMoment) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, moment: StarMoment) => listener(moment);
    ipcRenderer.on("star:moment", receive);
    return () => ipcRenderer.removeListener("star:moment", receive);
  },
  openStarRepository: (): Promise<boolean> => ipcRenderer.invoke("star:open"),
  dismissStarPrompt: (): Promise<void> => ipcRenderer.invoke("star:dismiss"),
  // Home's credit line; main holds the URL.
  openRepository: (): Promise<boolean> => ipcRenderer.invoke("repository:open"),
  // A conversation running or waiting for an answer, which puts the card off.
  starPromptBusy: (): Promise<boolean> => ipcRenderer.invoke("star:busy"),
  // The menu's Restart to Update was blocked: main has shown the window; open the header button's popover.
  onUpdatePopover(listener: () => void): () => void {
    const receive = () => listener();
    ipcRenderer.on("update:popover", receive);
    return () => ipcRenderer.removeListener("update:popover", receive);
  },
  // Start on mount, end on unmount; calls of an ended session answer unavailable. root: the opened worktree,
  // whose project group main reads again.
  startConfigSession: (root: string): Promise<void> => ipcRenderer.invoke("config:session-start", { root }),
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
  // true once a quit is under way and conversations stop (conversation:delete then answers busy as it does while one
  // works). Main sends no false today: an aborted quit leaves the conversations stopped until a restart.
  onQuitting(listener: (quitting: boolean) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, quitting: boolean) => listener(quitting);
    ipcRenderer.on("app:quitting", receive);
    return () => ipcRenderer.removeListener("app:quitting", receive);
  },
  // Main builds the URL from its own list and ignores an unmatched request. Channel names stay literal: a shared
  // import would become a chunk, which a sandboxed preload cannot require.
  playPrototype(request: PlayRequest): void { void ipcRenderer.invoke("prototype:play", request); },
  // The prototype window closed, by any path; focus may go back to a live Play control.
  onPrototypeClosed(listener: () => void): () => void {
    const receive = () => listener();
    ipcRenderer.on("prototype:closed", receive);
    return () => ipcRenderer.removeListener("prototype:closed", receive);
  },
  // A thread chip or a main-window-only button pressed in the prototype window, checked by main against the playing
  // canvas. Main has already shown and focused this window; it decides whether it can show the target now.
  onPrototypeReveal(listener: (request: PrototypeReveal) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, request: PrototypeReveal) => listener(request);
    ipcRenderer.on("prototype:revealRequest", receive);
    return () => ipcRenderer.removeListener("prototype:revealRequest", receive);
  },
  // The frame the prototype window plays (null while it is closed), then each change, for the toolbar's frame drawer.
  // Subscribe first, then read.
  onPrototypePlaying(listener: (playing: PrototypePlaying | null) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, playing: PrototypePlaying | null) => listener(playing);
    ipcRenderer.on("prototype:playing", receive);
    return () => ipcRenderer.removeListener("prototype:playing", receive);
  },
  readPrototypePlaying: (): Promise<PrototypePlaying | null> => ipcRenderer.invoke("prototype:playing"),
  // A pick in the prototype window's composer, to remember as Last used exactly as this window's own composer picks.
  onPrototypeLastUsed(listener: (choice: ComposerChoice) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, choice: ComposerChoice) => listener(choice);
    ipcRenderer.on("prototype:lastUsed", receive);
    return () => ipcRenderer.removeListener("prototype:lastUsed", receive);
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
