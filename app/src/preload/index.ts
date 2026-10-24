import type { OnboardingOpen, OnboardingRead } from "../main/index";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type { Author } from "../formats/types";
import type { BeginRequest, BeginResult, CommentList, CommentReply, CommentRequest, CopyRequest, MutationRequest, SavedStatus } from "../main/comments/service";
import type { TransitionRequest } from "../main/comments/transitions";
import { contextBridge, ipcRenderer } from "electron";
import type { Selection } from "../formats/types";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { ViewCommand, ProjectInitRequest, TokenCssChoice } from "../main/index";
import type { InspectResult } from "../main/inspect";
import type { FolderEntry } from "../main/view";

// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  readOnboarding: (request: { session: string; requestId: string }): Promise<OnboardingRead> => ipcRenderer.invoke("onboarding:read", request),
  runOnboardingStep: (request: StepRequest): Promise<StepResult> => ipcRenderer.invoke("onboarding:run", request),
  answerOnboardingReplace: (answer: { id: string; allow: boolean }): Promise<StepResult> => ipcRenderer.invoke("onboarding:answer", answer),
  closeOnboarding: (request: OnboardingOpen): Promise<StepResult> => ipcRenderer.invoke("onboarding:close", request),
  copyPathLine: (): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "pathLine" }),
  // Main builds the sentence from a stored, set-up project; null otherwise.
  firstPrompt: (root: string): Promise<string | null> => ipcRenderer.invoke("onboarding:first-prompt", { root }),
  copyFirstPrompt: (root: string): Promise<StepResult> => ipcRenderer.invoke("onboarding:copy", { kind: "firstPrompt", root }),
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
  closeFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:close", path),
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
};

export type DoanApi = typeof api;

contextBridge.exposeInMainWorld("doan", api);
