import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { readFolder, runLs } from "./cli";
import { openFolderStore } from "./folderStore";
import { folderState } from "./folderState";
import { startServer, type LocalServer } from "./serve/server";
import { folderEntry, openDecision, type FolderEntry } from "./view";
import { watchFolder, type FolderWatch } from "./watch";

export interface Shell {
  entries(): FolderEntry[];
  // Resolves to a message for the human when the folder is not opened.
  open(picked: string): Promise<string | null>;
  close(path: string): Promise<void>;
  dispose(): Promise<void>;
}

interface Folder {
  path: string;
  key: string;
  entry: FolderEntry;
  watch: FolderWatch | undefined;
  // Reads from the watcher and from a re-open can overlap; only the latest
  // started read may publish, so an older `doan ls` never overwrites a newer one.
  reads: number;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Electron-free on purpose: the window, dialog and IPC live in index.ts.
export async function startShell(foldersFile: string, cli: string, onChange: (entries: FolderEntry[]) => void): Promise<Shell> {
  const store = await openFolderStore(foldersFile);
  const server: LocalServer = await startServer();
  // Insertion order is folders.json order, which is the order the human opened them.
  const folders = new Map<string, Folder>();

  const entries = () => [...folders.values()].map((folder) => folder.entry);
  const baseUrl = (key: string) => `http://${server.host}:${server.port}/t/${server.token}/${key}/`;
  const logWrite = (error: Error | null) => {
    if (error) console.error("doan: cannot save folders.json", error);
  };

  const refresh = async (folder: Folder) => {
    const read = ++folder.reads;
    const view = await readFolder(cli, folder.path);
    if (folders.get(folder.path) !== folder || read !== folder.reads) return;
    // Only a listed folder serves anything; scope follows every re-read.
    server.updateFolder(folder.key, { root: folder.path, scope: view.kind === "list" ? view.scope : [] });
    folder.entry = folderEntry(folder.path, view, baseUrl(folder.key));
    if (view.kind === "notFound") {
      // A watcher on a deleted root is dead and is never re-armed (watch.ts);
      // opening the folder again attaches a fresh one.
      folder.watch?.close();
      folder.watch = undefined;
    }
    onChange(entries());
  };

  const attach = (folder: Folder) => {
    folder.watch?.close();
    folder.watch = watchFolder(folder.path, () => refresh(folder));
    void refresh(folder);
  };

  const add = (path: string): Folder => {
    const folder: Folder = {
      path,
      key: server.addFolder({ root: path, scope: [] }),
      entry: { path, kind: "loading" },
      watch: undefined,
      reads: 0,
    };
    folders.set(path, folder);
    attach(folder);
    return folder;
  };

  for (const path of store.list()) add(path);

  return {
    entries,
    async open(picked) {
      let real: string;
      try {
        // A folder removed after it was picked would make the cwd-based run
        // fail as `spawn doan ENOENT`, which reads like a missing CLI.
        real = await realpath(picked);
        if (!(await stat(real)).isDirectory()) return null;
      } catch (error) {
        console.error("doan: picked folder is gone", picked, error);
        return null;
      }
      const state = folderState(await runLs(cli, { cwd: real }));
      const decision = openDecision(state, real, await isDirectory(join(real, ".doan")));
      if ("refuse" in decision) return decision.refuse;
      const path = decision.store;
      const existing = folders.get(path);
      if (existing) {
        attach(existing);
        return null;
      }
      const write = store.add(path);
      add(path);
      onChange(entries());
      logWrite(await write);
      return null;
    },
    async close(path) {
      const folder = folders.get(path);
      if (!folder) return;
      folders.delete(path);
      folder.watch?.close();
      server.removeFolder(folder.key);
      const write = store.remove(path);
      onChange(entries());
      logWrite(await write);
    },
    async dispose() {
      for (const folder of folders.values()) folder.watch?.close();
      folders.clear();
      await server.close();
    },
  };
}
