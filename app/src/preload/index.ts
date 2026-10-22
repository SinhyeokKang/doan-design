import { contextBridge, ipcRenderer } from "electron";
import type { ViewCommand } from "../main/index";
import type { FolderEntry } from "../main/view";

// The renderer gets these calls and nothing else: no ipcRenderer, no
// channel names, no paths it did not receive from main.
const api = {
  openFolder: (): Promise<void> => ipcRenderer.invoke("folders:open"),
  closeFolder: (path: string): Promise<void> => ipcRenderer.invoke("folders:close", path),
  onFolders(listener: (entries: FolderEntry[]) => void): void {
    ipcRenderer.on("folders", (_event, entries: FolderEntry[]) => listener(entries));
    void ipcRenderer.invoke("folders:get").then(listener);
  },
  onViewCommand(listener: (command: ViewCommand) => void): void {
    ipcRenderer.on("view-command", (_event, command: ViewCommand) => listener(command));
  },
};

export type DoanApi = typeof api;

contextBridge.exposeInMainWorld("doan", api);
