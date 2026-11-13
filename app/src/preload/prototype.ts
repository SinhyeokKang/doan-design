// The prototype window's preload: its host page drives its own run and nothing else. No main-window call is here,
// and main checks the window role on every channel again.
import { contextBridge, ipcRenderer } from "electron";
import type { FramesMessage, PrototypeMode, PrototypeSnapshot, PrototypeView, PrototypeWindowApi, RunMessage } from "../main/prototype/ipc";

// Channel names stay literal (pinned against PROTOTYPE_CHANNELS in the test): a value import shared with the main
// preload would become a chunk, which a sandboxed preload cannot require.
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
  // The last look of a ready run that turned failed or unavailable, sent before that view; show it under the overlay
  // as a blob: image at its box, in place of the iframe.
  onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, snapshot: PrototypeSnapshot) => listener(snapshot);
    ipcRenderer.on("prototype:snapshot", receive);
    return () => ipcRenderer.removeListener("prototype:snapshot", receive);
  },
} satisfies PrototypeWindowApi & { onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void };

export type DoanPrototypeApi = typeof api;

contextBridge.exposeInMainWorld("doanPrototype", api);
