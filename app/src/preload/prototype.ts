// The prototype window's preload: its host page drives its own run, and its conversation panel calls main the way the
// main window's panel does, on the same channels with the same payloads. Main scopes every conversation request to the
// playing canvas and checks the window role on every channel again; the window has no delete, no capture and no full
// account, settings or terminal work read.
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { AttachmentResult, RecheckResult } from "../main/attachments";
import type { ExportReply } from "../main/canvasExport";
import type { ConversationHandoffNotice } from "../main/conversation/handoff";
import type { ConversationError, ScheduledSend } from "../main/conversation/ipc";
import type { ModelsReply } from "../main/conversation/models";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { QuestionAnswerInput } from "../main/conversation/question";
import type { ConversationService, ScheduledItem, StartRequest, TakenDraft } from "../main/conversation/service";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, Canvas, ConversationEvent, Runtime, SkillSummary, StageSignal, UnavailableReason } from "../main/conversation/types";
import type { DesignSkillList, DesignSkillPreset, DesignSkillReply } from "../main/designSkills";
import type {
  ExportTarget, FramesMessage, PanelRequest, PrototypeComposerSettings, PrototypeMode, PrototypeSnapshot, PrototypeView, PrototypeWindowApi, RevealPayload, RunMessage,
} from "../main/prototype/ipc";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import type { ComposerChoice } from "../renderer/rememberChoice";
import type { DoanApi } from "./index";

// The members the panel's body shares with `window.doan`: same names and signatures, so the renderer passes either
// preload as its calls object. onAgentAuth, getWork and onWorkChanged keep the main preload's shape over narrower data:
// readiness without the account's identity, and only the terminal work of the session the playing canvas would resume.
export type SharedWithMain =
  | "conversationResumeTarget" | "conversationForCanvas" | "startConversation" | "sendConversation" | "scheduledMessages" | "queueConversation"
  | "setConversationPermissionMode" | "removeQueuedMessage" | "sendQueuedNow" | "takeConversationDraft" | "listConversations" | "markConversationSeen"
  | "onConversationListChanged" | "onConversationHandoff" | "openLink" | "interruptConversation" | "answerConversationPermission"
  | "answerConversationQuestion" | "readConversation" | "listConversationModels" | "listConversationSkills"
  | "chooseAttachments" | "addAttachmentFiles" | "addPastedImage" | "removeAttachment" | "recheckAttachments" | "attachmentsFromPaths" | "releaseAttachments"
  | "onConversationEvent" | "onConversationStage" | "onAgentAuth" | "getWork" | "onWorkChanged" | "designSkills" | "onWindowVisible" | "droppedPath";

function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const receive = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, receive);
  return () => ipcRenderer.removeListener(channel, receive);
}

// Channel names stay literal (pinned against PROTOTYPE_CHANNELS and the main preload in the test): a value import
// shared with the main preload would become a chunk, which a sandboxed preload cannot require.
const api = {
  read: (): Promise<PrototypeView | null> => ipcRenderer.invoke("prototype:read"),
  onChanged(listener: (view: PrototypeView | null) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, view: PrototypeView | null) => listener(view);
    ipcRenderer.on("prototype:changed", receive);
    return () => ipcRenderer.removeListener("prototype:changed", receive);
  },
  // Forward only messages from the current iframe's window, origin "null" and the current gen; main checks again.
  reportResult: (message: RunMessage): Promise<void> => ipcRenderer.invoke("prototype:result", message),
  reportFrames: (message: FramesMessage): Promise<void> => ipcRenderer.invoke("prototype:frames", message),
  reload: (gen: number): Promise<void> => ipcRenderer.invoke("prototype:reload", { gen }),
  back: (): Promise<void> => ipcRenderer.invoke("prototype:back"),
  forward: (): Promise<void> => ipcRenderer.invoke("prototype:forward"),
  choose: (frame: string): Promise<void> => ipcRenderer.invoke("prototype:choose", { frame }),
  close: (): Promise<void> => ipcRenderer.invoke("prototype:close"),
  setMode: (mode: PrototypeMode): Promise<void> => ipcRenderer.invoke("prototype:mode", { mode }),
  // The target the window showed at the click; main exports it only if it still plays.
  export: (target: ExportTarget): Promise<ExportReply> => ipcRenderer.invoke("prototype:export", target),
  revealExport: (id: string): Promise<void> => ipcRenderer.invoke("prototype:revealExport", id),
  onExportRunning(listener: (target: ExportTarget) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: ExportTarget) => listener(target);
    ipcRenderer.on("prototype:exportRunning", receive);
    return () => ipcRenderer.removeListener("prototype:exportRunning", receive);
  },
  // Main's first answer unless a push came before it; the toast's clock stops while the window is not visible.
  onWindowVisible(listener: (visible: boolean) => void): () => void {
    let active = true, received = false;
    const receive = (_event: Electron.IpcRendererEvent, value: { visible: boolean }) => { received = true; listener(value.visible); };
    ipcRenderer.on("prototype:visible", receive);
    void ipcRenderer.invoke("prototype:visible").then((value: { visible: boolean } | null) => { if (active && !received && value !== null) listener(value.visible); });
    return () => { active = false; ipcRenderer.removeListener("prototype:visible", receive); };
  },
  // The last look of a ready run that turned failed or unavailable, sent before that view; show it under the overlay
  // as a blob: image at its box, in place of the iframe.
  onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, snapshot: PrototypeSnapshot) => listener(snapshot);
    ipcRenderer.on("prototype:snapshot", receive);
    return () => ipcRenderer.removeListener("prototype:snapshot", receive);
  },

  // The conversation panel. Main sizes the window for an open and answers with the view.
  setPanel: (request: PanelRequest): Promise<void> => ipcRenderer.invoke("prototype:panel", request),
  // The conversation the open panel shows, or null; main leaves its notifications out while this window is in front.
  setShowing: (conversationId: string | null): Promise<void> => ipcRenderer.invoke("prototype:showing", { conversationId }),
  // A thread chip, Sign in or an Open: the main window comes forward and shows the outcome; nothing comes back here.
  reveal: (request: RevealPayload): Promise<void> => ipcRenderer.invoke("prototype:reveal", request),
  // The New conversations default, Last used and buddy, then each change.
  readComposerSettings: (): Promise<PrototypeComposerSettings | null> => ipcRenderer.invoke("prototype:composer"),
  onComposerSettings: (listener: (settings: PrototypeComposerSettings) => void): (() => void) => listen("prototype:composerChanged", listener),
  // A composer pick, remembered as Last used by the main window as its own composer's.
  rememberChoice: (choice: ComposerChoice): Promise<void> => ipcRenderer.invoke("prototype:remember", choice),
  // The playing root's folder entry (null while nothing plays or the root is not registered), then each change. Read
  // it again when the view's root changes.
  readTargetEntry: (): Promise<FolderEntry | null> => ipcRenderer.invoke("prototype:entry"),
  onTargetEntry: (listener: (entry: FolderEntry | null) => void): (() => void) => listen("prototype:entryChanged", listener),

  // Provider readiness: the main preload's snapshot with every account's identity left out. Only snapshots newer than
  // the last delivered, so an initial read that loses a race with a change never replaces the newer state.
  onAgentAuth(listener: (snapshot: AuthSnapshot) => void): () => void {
    let active = true, revision = -1;
    const deliver = (snapshot: AuthSnapshot | null | undefined) => {
      if (!active || !snapshot || snapshot.revision <= revision) return;
      revision = snapshot.revision; listener(snapshot);
    };
    const receive = (_event: Electron.IpcRendererEvent, snapshot: AuthSnapshot) => deliver(snapshot);
    ipcRenderer.on("prototype:authChanged", receive);
    ipcRenderer.invoke("prototype:auth").then(deliver, () => {});
    return () => { active = false; ipcRenderer.removeListener("prototype:authChanged", receive); };
  },
  // Only the terminal work of the session the playing canvas would resume (its last resumeTarget answer), whatever
  // project it works in. Subscribe first, then read.
  getWork: (): Promise<WorkItem[]> => ipcRenderer.invoke("prototype:work"),
  onWorkChanged: (listener: (items: WorkItem[]) => void): (() => void) => listen("prototype:workChanged", listener),

  conversationResumeTarget: (request: { root: string; canvas: Canvas }): Promise<{ available: true; runtime: Runtime; lastCheckAt: string; session?: string } | { available: false; reason: "no_record" | UnavailableReason; runtime?: Runtime; session?: string } | ConversationError> => ipcRenderer.invoke("conversation:resumeTarget", request),
  conversationForCanvas: (request: { root: string; canvas: Canvas }): Promise<ReturnType<ConversationService["forCanvas"]> | ConversationError> => ipcRenderer.invoke("conversation:forCanvas", request),
  // Only `new` and `resume` on the playing canvas; main refuses newDesign here.
  startConversation: (request: Omit<StartRequest, "anchors" | "attachments"> & { anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ conversationId: string } | ConversationError> => ipcRenderer.invoke("conversation:start", request),
  sendConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; attachments?: { id: string }[] }): Promise<void | ScheduledSend | ConversationError> => ipcRenderer.invoke("conversation:send", request),
  scheduledMessages: (request: { conversationId: string }): Promise<ScheduledItem[] | ConversationError> => ipcRenderer.invoke("conversation:scheduled", request),
  queueConversation: (request: { conversationId: string; text: string; anchors?: Anchor[]; attachments?: { id: string }[] }): Promise<{ itemId: string } | ConversationError> => ipcRenderer.invoke("conversation:queue", request),
  setConversationPermissionMode: (request: { conversationId: string; permissionMode: PermissionModeId }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:setPermissionMode", request),
  removeQueuedMessage: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:removeQueued", request),
  sendQueuedNow: (request: { conversationId: string; itemId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:sendQueuedNow", request),
  takeConversationDraft: (request: { conversationId: string }): Promise<TakenDraft | null | ConversationError> => ipcRenderer.invoke("conversation:takeDraft", request),
  // The playing canvas's conversations only.
  listConversations: (request: { root: string }): Promise<ConversationSummary[] | ConversationError> => ipcRenderer.invoke("conversation:list", request),
  markConversationSeen: (request: { conversationId: string; seq: number }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:markSeen", request),
  onConversationListChanged: (listener: (change: { root: string }) => void): (() => void) => listen("conversation:listChanged", listener),
  onConversationHandoff: (listener: (notice: ConversationHandoffNotice) => void): (() => void) => listen("conversation:handoff", listener),
  openLink: (url: string): Promise<boolean> => ipcRenderer.invoke("shell:openLink", { url }),
  interruptConversation: (request: { conversationId: string; turnId?: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:interrupt", request),
  answerConversationPermission: (request: { conversationId: string; requestId: string; optionId: string }): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerPermission", request),
  answerConversationQuestion: (request: { conversationId: string; requestId: string } & QuestionAnswerInput): Promise<void | ConversationError> => ipcRenderer.invoke("conversation:answerQuestion", request),
  readConversation: (request: { conversationId: string }): Promise<ReturnType<ConversationService["read"]> | ConversationError> => ipcRenderer.invoke("conversation:read", request),
  listConversationModels: (request: { root: string; runtime: Provider }): Promise<ModelsReply> => ipcRenderer.invoke("conversation:models", request),
  listConversationSkills: (request: { root: string; provider: Provider }): Promise<{ skills: SkillSummary[] } | ConversationError> => ipcRenderer.invoke("conversation:skills", request),
  // The Attach dialog opens over this window. Main forgets this window's ids when it closes.
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
  removeAttachment: (id: string): Promise<boolean> => ipcRenderer.invoke("attachments:remove", { id }),
  recheckAttachments: (ids: readonly string[]): Promise<RecheckResult[] | null> => ipcRenderer.invoke("attachments:recheck", { ids: [...ids] }),
  attachmentsFromPaths: (paths: readonly string[]): Promise<AttachmentResult[] | null> => ipcRenderer.invoke("attachments:fromPaths", { paths: [...paths] }),
  releaseAttachments: (ids: readonly string[]): Promise<boolean> => ipcRenderer.invoke("attachments:release", { ids: [...ids] }),
  onConversationEvent: (listener: (event: ConversationEvent) => void): (() => void) => listen("conversation:event", listener),
  onConversationStage: (listener: (signal: StageSignal) => void): (() => void) => listen("conversation:stage", listener),
  designSkills: {
    list: (): Promise<DesignSkillReply<DesignSkillList>> => ipcRenderer.invoke("design-skills:list"),
    get: (id: string): Promise<DesignSkillReply<DesignSkillPreset>> => ipcRenderer.invoke("design-skills:get", { id }),
  },
  // A dropped or pasted item's disk path; null for a file the page made itself.
  droppedPath(file: File): string | null {
    const path = webUtils.getPathForFile(file);
    return path === "" ? null : path;
  },
} satisfies PrototypeWindowApi & { onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void } & Pick<DoanApi, SharedWithMain>;

export type DoanPrototypeApi = typeof api;

contextBridge.exposeInMainWorld("doanPrototype", api);
