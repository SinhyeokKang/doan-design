import { authorizeCanvas } from "./comments/identity";
import type { CommentIdentity } from "./comments/service";
import type { ResponseRecord } from "./comments/document";
import { realpath, stat } from "node:fs/promises";
import { readFolder, runLs } from "./cli";
import { openFolderStore } from "./folderStore";
import { folderState } from "./folderState";
import { startServer, type LocalServer } from "./serve/server";
import { folderEntry, openDecision, type FolderEntry } from "./view";
import { watchFolder, type Change, type FolderWatch } from "./watch";

export interface Shell {
  // `http://127.0.0.1:<port>/t/<token>/`: every canvas URL lives under it.
  readonly tokenBase: string;
  entries(): FolderEntry[];
  epoch(root: string): number | null;
  authorizeComments(identity: CommentIdentity): Promise<{ width: number | null; url: string }>;
  // Resolves to a message for the human when the folder is not opened.
  open(picked: string): Promise<string | null>;
  reopen(path: string): Promise<void>;
  close(path: string): Promise<void>;
  dispose(): Promise<void>;
}

interface Folder {
  path: string;
  epoch: number;
  key: string;
  entry: FolderEntry;
  watch: FolderWatch | undefined;
  // Reads from the watcher and from a re-open can overlap; only the latest
  // started read may publish, so an older `doan ls` never overwrites a newer one.
  reads: number;
  // Lives here rather than in a read, so a discarded stale read keeps its bump.
  servedRev: number;
  // The scope last given to the server.
  scope: string[];
}

function sameScope(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

// Electron-free on purpose: the window, dialog and IPC live in index.ts.
export async function startShell(foldersFile: string, cli: string, onChange: (entries: FolderEntry[]) => void, comments?: { response(record: ResponseRecord): void; invalidate(root: string): void }): Promise<Shell> {
  const store = await openFolderStore(foldersFile);
  const server: LocalServer = await startServer(comments?.response);
  // Insertion order is folders.json order, which is the order the human opened them.
  let nextEpoch = 0;
  const folders = new Map<string, Folder>();

  const entries = () => [...folders.values()].map((folder) => folder.entry);
  const baseUrl = (key: string) => `http://${server.host}:${server.port}/t/${server.token}/${key}/`;
  const logWrite = (error: Error | null) => {
    if (error) console.error("doan: cannot save folders.json", error);
  };

  const refresh = async (folder: Folder, change: Change) => {
    if (change.served) folder.servedRev++;
    if (!change.reread) {
      // A `tokenCss`/`serve` change leaves the list as it is, so it goes out
      // without waiting for `doan ls`.
      if (folder.entry.kind !== "list") return;
      folder.entry = { ...folder.entry, servedRev: folder.servedRev };
      onChange(entries());
      return;
    }
    comments?.invalidate(folder.path);
    const read = ++folder.reads;
    const view = await readFolder(cli, folder.path);
    if (folders.get(folder.path) !== folder || read !== folder.reads) return;
    // Only a listed folder serves anything; scope follows every re-read.
    const scope = view.kind === "list" ? view.scope : [];
    server.updateFolder(folder.key, { root: folder.path, scope });
    // After the server update, so the reload this triggers is served from the new scope.
    if (!sameScope(scope, folder.scope)) {
      folder.scope = scope;
      folder.servedRev++;
    }
    folder.watch?.setScope(scope);
    folder.entry = folderEntry(folder.path, view, baseUrl(folder.key), folder.servedRev);
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
    folder.watch = watchFolder(folder.path, (change) => refresh(folder, change));
    void refresh(folder, { reread: true, served: false });
  };

  const add = (path: string): Folder => {
    const folder: Folder = {
      path,
      epoch: ++nextEpoch,
      key: server.addFolder({ root: path, scope: [] }),
      entry: { path, kind: "loading" },
      watch: undefined,
      reads: 0,
      servedRev: 0,
      scope: [],
    };
    folders.set(path, folder);
    attach(folder);
    return folder;
  };

  for (const path of store.list()) add(path);

  return {
    tokenBase: `http://${server.host}:${server.port}/t/${server.token}/`,
    entries,
    epoch(root) { return folders.get(root)?.epoch ?? null; },
    async authorizeComments(identity) {
      const folder = folders.get(identity.root);
      if (!folder) throw new Error("Project is closed.");
      const listing = await readFolder(cli, folder.path);
      if (folders.get(identity.root) !== folder) throw new Error("Project is closed.");
      const eligibility = authorizeCanvas(identity, listing);
      return { ...eligibility, url: baseUrl(folder.key) + identity.path.split("/").map(encodeURIComponent).join("/") };
    },
    async open(picked) {
      let real: string;
      try {
        // A folder removed after it was picked would make the cwd-based run
        // fail as `spawn doan ENOENT`, which reads like a missing CLI.
        real = await realpath(picked);
        if (!(await stat(real)).isDirectory()) return `Project not found: ${picked}`;
      } catch {
        return `Project not found: ${picked}`;
      }
      const state = folderState(await runLs(cli, { cwd: real }));
      const failed = state.kind === "error" || state.kind === "cliError";
      const asRepo = failed ? folderState(await runLs(cli, { repo: real })) : null;
      const decision = openDecision(state, real, asRepo);
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
    async reopen(path) {
      const folder = folders.get(path);
      if (!folder) return;
      folder.epoch = ++nextEpoch;
      folder.entry = { path, kind: "loading" };
      onChange(entries());
      attach(folder);
    },
    async close(path) {
      const folder = folders.get(path);
      if (!folder) return;
      folders.delete(path);
      comments?.invalidate(path);
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
