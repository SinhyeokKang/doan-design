import type { ResponseRecord } from "./comments/document";
import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { readFolder, runLs, runInit } from "./cli";
import { replaceAt } from "./folders";
import { openFolderStore } from "./folderStore";
import { classifyDesignChange } from "./designChange";
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
  // The serving scope of the last `doan ls` (repo-relative); empty unless listed.
  scope(root: string): string[];
  // The stored root (the picked folder or the repo above it), or a message for
  // the human when the folder is not opened.
  open(picked: string): Promise<{ root: string } | { refused: string }>;
  initialize(path: string, tokenCss: string | null): Promise<ProjectInitResult>;
  reopen(path: string): Promise<void>;
  // Stores roots main already judged, after the stored ones; resolves to the
  // paths that were not stored yet.
  store(paths: readonly string[]): Promise<string[]>;
  // Resolves to the stored paths it removed, in stored order.
  remove(paths: readonly string[]): Promise<{ paths: string[] }>;
  // Locate: `to` takes `from`'s place, or only `from` goes when `to` is stored.
  replace(from: string, to: string): Promise<void>;
  // Re-reads every root without a loading state (the branch may have changed:
  // the watcher does not see `.git/HEAD`).
  rereadAll(): void;
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
  // Per canvas path (CanvasRow.rev), kept here for the same reason. Never
  // pruned: a canvas that comes back must not reuse a revision already seen.
  canvasRevs: Map<string, number>;
  // The scope last given to the server.
  scope: string[];
  // The last `git.common` seen; memory only (design 'app side').
  common: string | undefined;
}

// A canvas removed after `doan ls` has no entry; the row then shows no time.
export async function canvasMtimes(root: string, paths: readonly string[]): Promise<Map<string, number>> {
  const mtimes = new Map<string, number>();
  await Promise.all(paths.map(async (path) => {
    try {
      mtimes.set(path, (await stat(join(root, path))).mtimeMs);
    } catch {
      return;
    }
  }));
  return mtimes;
}

function sameScope(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

// Electron-free on purpose: the window, dialog and IPC live in index.ts.
export async function startShell(foldersFile: string, cli: string, onChange: (entries: FolderEntry[], focus?: FolderFocus) => void, documents?: { response(record: ResponseRecord): void }): Promise<Shell> {
  const store = await openFolderStore(foldersFile);
  const server: LocalServer = await startServer(documents?.response);
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
    // Decided before the read: names say what changed, the listing does not.
    const design = change.names === undefined ? undefined : classifyDesignChange(change.names);
    if (change.served || design?.bumpServed) folder.servedRev++;
    for (const path of design?.revPaths ?? []) folder.canvasRevs.set(path, (folder.canvasRevs.get(path) ?? 0) + 1);
    if (!change.reread) {
      // A `tokenCss`/`serve` change leaves the list as it is, so it goes out
      // without waiting for `doan ls`.
      if (folder.entry.kind !== "list") return false;
      folder.entry = { ...folder.entry, servedRev: folder.servedRev };
      onChange(entries());
      return null;
    }
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
    let mtimes: Map<string, number> | undefined;
    if (view.kind === "list") {
      mtimes = await canvasMtimes(view.root, view.canvases.flatMap((canvas) => {
        const path: unknown = typeof canvas === "object" && canvas !== null ? Reflect.get(canvas, "path") : undefined;
        return typeof path === "string" ? [path] : [];
      }));
      if (folders.get(folder.path) !== folder || read !== folder.reads) return false;
      if (view.git) folder.common = view.git.common;
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
    folder.entry = withCommon(folder, withRevs(folder, folderEntry(folder.path, view, baseUrl(folder.key), folder.servedRev, mtimes)));
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
      canvasRevs: new Map(),
      scope: [],
      common: undefined,
    };
    folders.set(path, folder);
    attach(folder);
    return folder;
  };

  const withCommon = (folder: Folder, entry: FolderEntry): FolderEntry =>
    folder.common === undefined ? entry : { ...entry, lastCommon: folder.common };

  // A row whose file never changed while the folder was open has no `rev`.
  const withRevs = (folder: Folder, entry: FolderEntry): FolderEntry => {
    if (entry.kind !== "list") return entry;
    const canvases = entry.canvases.map((row) => {
      const rev = folder.canvasRevs.get(row.path);
      return rev === undefined ? row : { ...row, rev };
    });
    return { ...entry, canvases };
  };

  // Keeps each surviving folder (its watcher and server key) in `paths` order.
  const reorder = (paths: readonly string[]) => {
    const ordered = paths.map((path) => folders.get(path));
    folders.clear();
    for (const item of ordered) if (item) folders.set(item.path, item);
  };

  const detach = (folder: Folder) => {
    folders.delete(folder.path);
    folder.watch?.close();
    server.removeFolder(folder.key);
  };

  for (const path of store.list()) add(path);

  return {
    tokenBase: `http://${server.host}:${server.port}/t/${server.token}/`,
    entries,
    epoch(root) { return folders.get(root)?.epoch ?? null; },
    scope(root) { return [...(folders.get(root)?.scope ?? [])]; },
    async open(picked) {
      let real: string;
      try {
        // A folder removed after it was picked would make the cwd-based run
        // fail as `spawn doan ENOENT`, which reads like a missing CLI.
        real = await realpath(picked);
        if (!(await stat(real)).isDirectory()) return { refused: `Project not found: ${picked}` };
      } catch {
        return { refused: `Project not found: ${picked}` };
      }
      const state = folderState(await runLs(cli, { cwd: real }));
      const failed = state.kind === "error" || state.kind === "cliError";
      const asRepo = failed ? folderState(await runLs(cli, { repo: real })) : null;
      const decision = openDecision(state, real, asRepo);
      if ("refuse" in decision) return { refused: decision.refuse };
      const path = decision.store;
      const existing = folders.get(path);
      if (existing) {
        attach(existing);
        return { root: path };
      }
      const write = store.add(path);
      add(path);
      onChange(entries());
      logWrite(await write);
      return { root: path };
    },
    initialize(path, tokenCss) {
      const folder = folders.get(path);
      const unavailable: ProjectInitResult = { kind: "unavailable", message: "This project is no longer available for setup." };
      if (!folder) return Promise.resolve(unavailable);
      const pending = initializing.get(folder);
      if (pending) return pending;
      // Loading: onboarding sets up a folder it registered a moment ago; the re-read below decides.
      if (folder.entry.kind !== "uninitialized" && folder.entry.kind !== "loading") return Promise.resolve(unavailable);
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
      folder.entry = withCommon(folder, { path, kind: "loading" });
      onChange(entries());
      attach(folder);
    },
    async store(paths) {
      const added = [...new Set(paths)].filter((path) => !folders.has(path));
      if (added.length === 0) return [];
      for (const path of added) add(path);
      const write = store.replace([...store.list(), ...added]);
      onChange(entries());
      logWrite(await write);
      return added;
    },
    async remove(paths) {
      const list = store.list();
      const removed = list.filter((path) => paths.includes(path) && folders.has(path));
      if (removed.length === 0) return { paths: [] };
      for (const path of removed) {
        const folder = folders.get(path);
        if (folder) detach(folder);
      }
      const write = store.replace(list.filter((path) => !removed.includes(path)));
      onChange(entries());
      logWrite(await write);
      return { paths: removed };
    },
    async replace(from, to) {
      const folder = folders.get(from);
      if (!folder) return;
      if (from === to) {
        attach(folder);
        return;
      }
      const next = replaceAt(store.list(), from, to);
      detach(folder);
      if (!folders.has(to)) add(to);
      reorder(next);
      const write = store.replace(next);
      // The focus is how the renderer tells a moved root from a removed one: the Project Settings page and a loaded
      // workspace follow it, where a bare list would show the old root vanishing.
      onChange(entries(), { from, root: to });
      logWrite(await write);
    },
    rereadAll() {
      for (const folder of folders.values()) {
        // A missing root lost its watcher (see refresh); attach arms a new one.
        if (folder.watch) void refresh(folder, { reread: true, served: false });
        else attach(folder);
      }
    },
    async dispose() {
      for (const folder of folders.values()) folder.watch?.close();
      folders.clear();
      await server.close();
    },
  };
}
