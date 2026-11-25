import { lstatSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";
import { CANVAS_DIRS } from "../formats/canvasPath";
import { gitDirOf } from "./gitSignal";

const DEBOUNCE_MS = 200;

export interface Change {
  // A canvas directory (`.doan/canvases/`, `.doan/ds/`) or `.doan/` changed, so `doan ls` has to run again.
  reread: boolean;
  // A served file outside the canvas directories changed, or a canvas directory itself came or went, so an open canvas
  // reloads. A change inside a canvas directory leaves this false and carries `names` for the shell to decide.
  served: boolean;
  // Repo-relative paths under the canvas directories, so a merged set keeps `.doan/canvases/a.html` and `.doan/ds/a.html`
  // apart; `null` when an event had no name, absent when no canvas directory event is in the change.
  names?: readonly string[] | null;
  // HEAD, FETCH_HEAD or ORIG_HEAD in the root's gitdir changed: only the read state's git signal is read again
  // (gitSignal.ts). No `doan ls`, no served bump, no canvas reload.
  git?: boolean;
}

const GIT: Change = { reread: false, served: false, git: true };
// The gitdir files whose change is a git signal; other gitdir entries (index, refs, logs) are ignored.
const GIT_NAMES = new Set(["HEAD", "FETCH_HEAD", "ORIG_HEAD"]);
const REREAD: Change = { reread: true, served: false };
const SERVED: Change = { reread: false, served: true };
const BOTH: Change = { reread: true, served: true };

export interface Refresher {
  trigger(change: Change): void;
  close(): void;
}

export interface FolderWatch {
  // The serving scope from the latest `doan ls`; called on every re-read.
  setScope(scope: readonly string[]): void;
  close(): void;
}

// Debounces triggers into one run; a trigger during a run queues exactly one more, so `doan ls` never runs twice at once
// and the last change is never missed. Names are a union; one unknown name makes the set unknown until a run takes it.
export function createRefresher(run: (change: Change) => Promise<void>, delayMs = DEBOUNCE_MS): Refresher {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let again = false;
  let closed = false;
  let pending: Change = { reread: false, served: false };
  let names: Set<string> | null | undefined;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void start(), delayMs);
  };
  const start = async () => {
    timer = undefined;
    running = true;
    const change: Change = names === undefined ? pending : { ...pending, names: names === null ? null : [...names] };
    pending = { reread: false, served: false };
    names = undefined;
    try {
      await run(change);
    } catch (error) {
      console.error("doan: folder refresh failed", error);
    }
    running = false;
    if (again && !closed) {
      again = false;
      schedule();
    }
  };
  const trigger = (change: Change) => {
    if (closed) return;
    pending = { reread: pending.reread || change.reread, served: pending.served || change.served, ...(pending.git || change.git ? { git: true } : {}) };
    if (change.names === null) names = null;
    else if (change.names !== undefined && names !== null) names = new Set([...(names ?? []), ...change.names]);
    if (running) {
      again = true;
      return;
    }
    schedule();
  };
  return {
    trigger,
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

interface Armed {
  watcher: FSWatcher;
  ino: number;
  recursive: boolean;
}

interface Target {
  path: string;
  recursive: boolean;
  change: Change;
  // For served paths watched through their parent: only these names count.
  names?: Set<string>;
  // For a canvas directory: its repo-relative path, which prefixes the names it reports.
  canvasDir?: string;
}

// Watches what `doan ls` reads, the served paths and the gitdir. Git replaces HEAD by rename, ending a watcher on the
// file, so directories are watched; a watcher on a deleted directory keeps the old inode, so sub-watchers re-arm.
export function watchFolder(root: string, refresh: (change: Change) => Promise<void>): FolderWatch {
  const refresher = createRefresher(refresh);
  const armed = new Map<string, Armed>();
  const canvasDirs: Target[] = Object.values(CANVAS_DIRS).map((dir) => ({ path: join(root, dir), recursive: true, change: REREAD, canvasDir: dir }));
  // `.doan` events under these names mean a canvas or asset directory itself came or went.
  const doanDirs = new Set(["assets", ...Object.values(CANVAS_DIRS).map((dir) => basename(dir))]);
  const assetsDir: Target = { path: join(root, ".doan/assets"), recursive: true, change: SERVED };
  const fixed: Target[] = [
    ...canvasDirs,
    assetsDir,
    { path: join(root, ".doan"), recursive: false, change: REREAD },
  ];
  // Resolved again on every re-arm: a linked worktree's `.git` file can be rewritten to name another gitdir, and a
  // root event (`.git` coming or going) re-arms.
  let gitTarget: Target | undefined;
  let served: Target[] = [];
  // Served files directly in the root go through the root watcher.
  let rootNames = new Set<string>();
  let closed = false;

  const targets = () => [...fixed, ...served, ...(gitTarget ? [gitTarget] : [])];

  const classify = (path: string, filename: string | null): Change | undefined => {
    if (path === root) {
      if (filename === null || filename === ".doan") return BOTH;
      // Any other root event still re-reads: deleting the root itself arrives
      // only as an event named after the root.
      return rootNames.has(filename) ? SERVED : REREAD;
    }
    if (path === join(root, ".doan") && (filename === null || doanDirs.has(filename))) return BOTH;
    const target = targets().find((candidate) => candidate.path === path);
    if (target === undefined) return undefined;
    if (target.names && filename !== null && !target.names.has(filename)) return undefined;
    // Names are judged only here, never on the root watcher: the root's own deletion arrives there under the root's name.
    if (target.canvasDir !== undefined) return { ...REREAD, names: filename === null ? null : [`${target.canvasDir}/${filename}`] };
    return target.change;
  };

  const onEvent = (path: string, filename: string | null) => {
    if (closed) return;
    // Git touches its index and lock files on every `git status`; those neither re-arm nor reach the refresher. The
    // gitdir's own name stays: deleting a watched directory arrives named after it.
    if (path === gitTarget?.path && filename !== null && !GIT_NAMES.has(filename) && filename !== basename(path)) return;
    rearm();
    const change = classify(path, filename);
    if (change) refresher.trigger(change);
  };

  const listen = (path: string, recursive: boolean): FSWatcher | undefined => {
    try {
      const watcher = watch(path, { recursive }, (_event, filename) => onEvent(path, filename));
      // Removing the watched directory can surface as an error. A watcher that
      // errored is dead, so drop it and let the re-arm open a fresh one.
      watcher.on("error", () => {
        watcher.close();
        if (armed.get(path)?.watcher === watcher) armed.delete(path);
        onEvent(path, null);
      });
      return watcher;
    } catch (error) {
      // The target vanishing between lstat and watch is expected; the next
      // re-arm sees it gone. Anything else (EMFILE, ...) leaves a gap worth a trace.
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") console.error("doan: cannot watch", path, error);
      return undefined;
    }
  };

  const rearm = () => {
    const gitDir = gitDirOf(root);
    if (gitDir !== gitTarget?.path) gitTarget = gitDir === null ? undefined : { path: gitDir, recursive: false, change: GIT, names: GIT_NAMES };
    const wanted = targets();
    for (const target of wanted) {
      const { path, recursive } = target;
      let ino: number | undefined;
      // lstat: `doan ls` does not follow a symlinked canvas directory, and a
      // recursive watch through `doan -> .` would cover the whole repo.
      try {
        // The gitdir is git's, reached as git reaches it: through a link too. It lies outside `.doan`.
        const stat = target === gitTarget ? statSync(path)
          : path.startsWith(join(root, ".doan") + "/") && !lstatSync(join(root, ".doan")).isDirectory() ? undefined : lstatSync(path);
        if (stat?.isDirectory()) ino = stat.ino;
      } catch {
        ino = undefined;
      }
      const current = armed.get(path);
      if (current && current.ino === ino && current.recursive === recursive) continue;
      // A served path replaced or removed changed what is served, even when the
      // event that got here was a root event classified as a re-read only.
      if (current && current.ino !== ino && served.includes(target)) refresher.trigger(SERVED);
      // A canvas or asset directory replaced or removed came and went. `.doan`'s own event for it can be lost: libuv
      // recreates its shared FSEvents stream from "now" whenever this re-arm opens or closes a watcher.
      if (current && current.ino !== ino && (target === assetsDir || canvasDirs.includes(target))) refresher.trigger(BOTH);
      current?.watcher.close();
      armed.delete(path);
      if (ino === undefined) continue;
      const watcher = listen(path, recursive);
      if (watcher) armed.set(path, { watcher, ino, recursive });
    }
    for (const [path, { watcher }] of armed) {
      if (wanted.some((target) => target.path === path)) continue;
      watcher.close();
      armed.delete(path);
    }
  };

  const rootWatcher = listen(root, false);
  rearm();

  return {
    setScope(scope) {
      if (closed) return;
      ({ targets: served, rootNames } = servedTargets(root, scope));
      rearm();
    },
    close() {
      closed = true;
      refresher.close();
      rootWatcher?.close();
      for (const { watcher } of armed.values()) watcher.close();
      armed.clear();
    },
  };
}

function inside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + "/");
}

// Scope entries are real repo-relative paths. Only canvas and asset events may reload, never settings. A served file
// is watched through its directory, since an atomic save replaces the file and ends a watcher on it.
function servedTargets(root: string, scope: readonly string[]): { targets: Target[]; rootNames: Set<string> } {
  const dirs: string[] = [];
  const files: string[] = [];
  for (const rel of scope) {
    if (inside(rel, ".doan")) continue;
    try {
      const stat = lstatSync(join(root, rel));
      if (stat.isDirectory()) dirs.push(rel);
      else if (stat.isFile()) files.push(rel);
    } catch {
      // Gone since `doan ls`; the next read drops it from the scope.
    }
  }
  const covered = (rel: string) => dirs.some((dir) => dir !== rel && inside(rel, dir));
  const top = dirs.filter((dir) => !covered(dir));
  const targets: Target[] = top.map((dir) => ({ path: join(root, dir), recursive: true, change: SERVED }));
  const rootNames = new Set<string>();
  const parents = new Map<string, Set<string>>();
  const watchParent = (rel: string) => {
    const parent = dirname(rel);
    const names = parents.get(parent) ?? new Set<string>();
    names.add(basename(rel));
    parents.set(parent, names);
  };
  // A served directory's parent is watched too: once the directory is deleted its own watcher is gone, and the parent
  // sees it come back. The root watcher already does this for directories at the root.
  for (const dir of top) if (dirname(dir) !== ".") watchParent(dir);
  for (const file of files) {
    if (covered(file)) continue;
    if (dirname(file) === ".") rootNames.add(file);
    else watchParent(file);
  }
  for (const [parent, names] of parents) targets.push({ path: join(root, parent), recursive: false, change: SERVED, names });
  return { targets, rootNames };
}
