import { contextBridge, ipcRenderer } from "electron";
import type { ConfigChoice, ConfigKind, ConfigReply } from "../main/configBridge";
import type { StepRequest, StepResult } from "../main/onboarding/machine";
import type { ExternalTarget, ForwardedAction, ProjectRow, SettingsTab, SettingsTarget } from "../main/settings";
import type { SetupRead, SetupStatus } from "../main/setupBroker";

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
  // A sheet on this window; only the choice id goes back in writeConfig.
  chooseConfigPath: (root: string, kind: ConfigKind): Promise<ConfigChoice> => ipcRenderer.invoke("config:choose", { root, kind }),
  writeConfig: (request: ConfigWrite): Promise<ConfigReply> => ipcRenderer.invoke("config:write", request),
};

export type DoanSettingsApi = typeof api;

contextBridge.exposeInMainWorld("doanSettings", api);
