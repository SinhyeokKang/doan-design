import { contextBridge, ipcRenderer } from "electron";
import type { ConfigChoice, ConfigKind, ConfigReply } from "../main/configBridge";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type { ExternalTarget, ForwardedAction, ProjectRow, SettingsTab, SettingsTarget } from "../main/settings";
import type { SetupRead, SetupStatus } from "../main/setupBroker";
import type { AuthCheckReply, AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";

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

// The Settings window's calls. Main checks each against this window's
// allowlist (senderAllowed); what is not here, the window cannot reach.
export type ConfigWrite =
  | { root: string; op: "setTokenCss" | "addServe"; choiceId: string }
  | { root: string; op: "clearTokenCss" }
  | { root: string; op: "removeServe"; path: string };

const api = {
  // Connections. A read older than this window's newest one answers stale.
  readSetup: (requestId: string): Promise<SetupRead> => ipcRenderer.invoke("setup:read", { requestId }),
  runSetupStep: (request: StepRequest): Promise<StepResult> => ipcRenderer.invoke("setup:run", request),
  answerSetupConfirm: (answer: { id: string; allow: boolean }): Promise<StepResult> => ipcRenderer.invoke("setup:answer", answer),
  checkSetupAgain: (): Promise<SetupStatus | null> => ipcRenderer.invoke("setup:check-again"),
  onSetupStatus: (listener: (status: SetupStatus) => void): (() => void) => subscribe("setup:status", "setup:status", listener),
  openInstallPage: (target: ExternalTarget): Promise<boolean> => ipcRenderer.invoke("setup:open-external", { target }),
  // Resolves after the clipboard write settled.
  copyPathLine: (): Promise<StepResult> => ipcRenderer.invoke("setup:copy-path-line"),
  // The last tab (ui-state.json); saving it also sets the window title.
  getTab: (): Promise<SettingsTab | null> => ipcRenderer.invoke("settings:tab-get"),
  saveTab: (tab: SettingsTab): Promise<boolean> => ipcRenderer.invoke("settings:tab-save", { tab }),
  // Where the window was opened to go (a chip, Fix…, Project Settings…), once;
  // later requests while it is open arrive on onTarget.
  takeTarget: (): Promise<SettingsTarget | null> => ipcRenderer.invoke("settings:take-target"),
  onTarget(listener: (target: SettingsTarget) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, target: SettingsTarget) => listener(target);
    ipcRenderer.on("settings:target", receive);
    return () => ipcRenderer.removeListener("settings:target", receive);
  },
  // Projects: a read-only projection of the saved projects.
  onProjects: (listener: (rows: ProjectRow[]) => void): (() => void) => subscribe("projects", "projects:get", listener),
  revealProject: (path: string): Promise<void> => ipcRenderer.invoke("projects:reveal", { path }),
  // Brings the main window forward and runs the row action there.
  forwardProjectAction: (path: string, action: ForwardedAction): Promise<boolean> => ipcRenderer.invoke("projects:forward-action", { path, action }),
  readConfig: (root: string): Promise<ConfigReply> => ipcRenderer.invoke("config:read", { root }),
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
  // A sheet on this window; only the choice id goes back in writeConfig.
  chooseConfigPath: (root: string, kind: ConfigKind): Promise<ConfigChoice> => ipcRenderer.invoke("config:choose", { root, kind }),
  writeConfig: (request: ConfigWrite): Promise<ConfigReply> => ipcRenderer.invoke("config:write", request),
};

export type DoanSettingsApi = typeof api;

contextBridge.exposeInMainWorld("doanSettings", api);
