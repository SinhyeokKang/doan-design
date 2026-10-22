import { contextBridge, ipcRenderer } from "electron";
import type { Selection } from "../formats/types";
import type { ViewCommand } from "../main/index";
import type { FolderEntry } from "../main/view";

// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  openFolder: (): Promise<void> => ipcRenderer.invoke("folders:open"),
  reopenFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:reopen", path),
  closeFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:close", path),
  // Main validates it again and keeps one selection for `doan active`.
  setSelection: (selection: Selection | null): Promise<void> => ipcRenderer.invoke("selection:set", selection),
  onFolders(listener: (entries: FolderEntry[]) => void): () => void {
    let active = true;
    const receive = (_event: Electron.IpcRendererEvent, entries: FolderEntry[]) => listener(entries);
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
