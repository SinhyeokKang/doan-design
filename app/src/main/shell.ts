import { authorizeCanvas } from "./comments/identity";
import type { CommentIdentity } from "./comments/service";
import type { ResponseRecord } from "./comments/document";
import { realpath, stat } from "node:fs/promises";
import { readFolder, runLs, runInit } from "./cli";
import { openFolderStore } from "./folderStore";
import { folderState, initOutcome, reconcileFolders, type InitOutcome } from "./folderState";
import { startServer, type LocalServer } from "./serve/server";
import { folderEntry, openDecision, type FolderEntry } from "./view";
import { watchFolder, type Change, type FolderWatch } from "./watch";

export interface FolderFocus { from: string; root: string }
export type ProjectInitResult = InitOutcome | { kind: "rerooted"; root: string; message: string } | { kind: "unavailable"; message: string };

export interface Shell {
  // `http://127.0.0.1:<port>/t/<token>/`: every canvas URL lives under it.
  readonly tokenBase: string;
  entries(): FolderEntry[];
  epoch(root: string): number | null;
  authorizeComments(identity: CommentIdentity): Promise<{ width: number | null; url: string }>;
  // Resolves to a message for the human when the folder is not opened.
  open(picked: string): Promise<string | null>;
  initialize(path: string, tokenCss: string | null): Promise<ProjectInitResult>;
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
export async function startShell(foldersFile: string, cli: string, onChange: (entries: FolderEntry[], focus?: FolderFocus) => void, comments?: { response(record: ResponseRecord): void; invalidate(root: string): void }): Promise<Shell> {
  const store = await openFolderStore(foldersFile);
  const server: LocalServer = await startServer(comments?.response);
  // Insertion order is folders.json order, which is the order the human opened them.
  let nextEpoch = 0;
  const folders = new Map<string, Folder>();

  const initializing = new Map<Folder, Promise<ProjectInitResult>>();
  const entries = () => [...folders.values()].map((folder) => folder.entry);
  const baseUrl = (key: string) => `http://${server.host}:${server.port}/t/${server.token}/${key}/`;
  const logWrite = (error: Error | null) => {
    if (error) console.error("doan: cannot save folders.json", error);
  };

  const refresh = async (folder: Folder, change: Change): Promise<string | null | false> => {
    if (change.served) folder.servedRev++;
    if (!change.reread) {
      // A `tokenCss`/`serve` change leaves the list as it is, so it goes out
      // without waiting for `doan ls`.
      if (folder.entry.kind !== "list") return false;
      folder.entry = { ...folder.entry, servedRev: folder.servedRev };
      onChange(entries());
      return null;
    }
    comments?.invalidate(folder.path);
    const read = ++folder.reads;
    let view = await readFolder(cli, folder.path);
    if (folders.get(folder.path) !== folder || read !== folder.reads) return false;
    if (view.kind === "uninitialized") {
      view = folderState(await runLs(cli, { cwd: folder.path }));
      if (folders.get(folder.path) !== folder || read !== folder.reads) return false;
      if (view.kind === "list" && view.root !== folder.path) {
        const next = reconcileFolders(store.list(), folder.path, view);
        detach(folder);
        if (!folders.has(view.root)) add(view.root);
        // Keep the surviving root's watcher and server key when merging rows.
        const ordered = next.folders.map(path => folders.get(path));
        folders.clear();
        for (const item of ordered) if (item) folders.set(item.path, item);
        const write = store.replace(next.folders);
        onChange(entries(), { from: folder.path, root: view.root });
        logWrite(await write);
        return view.root;
      }
    }
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
    return null;
  };

  const attach = (folder: Folder) => {
    folder.watch?.close();
    folder.watch = watchFolder(folder.path, async (change) => { await refresh(folder, change); });
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

  const detach = (folder: Folder) => {
    folders.delete(folder.path);
    comments?.invalidate(folder.path);
    folder.watch?.close();
    server.removeFolder(folder.key);
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
    initialize(path, tokenCss) {
      const folder = folders.get(path);
      const unavailable: ProjectInitResult = { kind: "unavailable", message: "This project is no longer available for setup." };
      if (!folder) return Promise.resolve(unavailable);
      const pending = initializing.get(folder);
      if (pending) return pending;
      if (folder.entry.kind !== "uninitialized") return Promise.resolve(unavailable);
      const epoch = folder.epoch;
      const task = (async (): Promise<ProjectInitResult> => {
        const root = await refresh(folder, { reread: true, served: false });
        if (typeof root === "string") return { kind: "rerooted", root, message: `This folder is inside ${root}, which is already set up.` };
        if (root === false || folders.get(path) !== folder || folder.epoch !== epoch || folder.entry.kind !== "uninitialized") return unavailable;
        const outcome = initOutcome(await runInit(cli, path, tokenCss));
        if (folders.get(path) !== folder || folder.epoch !== epoch) return unavailable;
        if (outcome.kind === "success") await refresh(folder, { reread: true, served: false });
        return outcome;
      })().finally(() => initializing.delete(folder));
      initializing.set(folder, task);
      return task;
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
      detach(folder);
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
