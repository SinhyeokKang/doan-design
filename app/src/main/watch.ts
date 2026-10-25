import { lstatSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";

const DEBOUNCE_MS = 200;

export interface Change {
  // `design/` or `.doan/` changed, so `doan ls` has to run again.
  reread: boolean;
  // A served file outside `design/` changed (`tokenCss`, `serve`), or `design/`
  // itself came or went, so an open canvas reloads. A change inside `design/`
  // leaves this false and carries `names`; the shell decides from them.
  served: boolean;
  // Names under `design/`, relative to it, for the shell to decide whether only
  // canvas rows changed; `null` when an event had no name. Absent when no
  // `design/` event is in the change.
  names?: readonly string[] | null;
}

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

// Debounces triggers into one run; a trigger during a run queues exactly one
// more run after it, so `doan ls` never runs twice at once for a folder and
// the last change is never missed. Flags pile up until a run takes them, so a
// change that lands during a run reaches the run queued after it. Names are a
// union, and one unknown name makes the whole set unknown until a run takes it;
// a trigger without names (not a `design/` event) leaves them as they are.
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
    pending = { reread: pending.reread || change.reread, served: pending.served || change.served };
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
}

// Watches what `doan ls` reads: the root (non-recursive, to see `design` and
// `.doan` come and go), `design/` (recursive), `.doan/` (config.json and the
// `comments` directory) and `.doan/comments/`; plus the served paths outside
// `design/` from the latest scope. A watcher on a deleted directory stays on
// the old inode, so the sub-watchers are re-armed whenever their parent changes.
export function watchFolder(root: string, refresh: (change: Change) => Promise<void>): FolderWatch {
  const refresher = createRefresher(refresh);
  const armed = new Map<string, Armed>();
  const design: Target = { path: join(root, "design"), recursive: true, change: REREAD };
  const fixed: Target[] = [
    design,
    { path: join(root, ".doan"), recursive: false, change: REREAD },
    { path: join(root, ".doan", "comments"), recursive: false, change: REREAD },
  ];
  let served: Target[] = [];
  // Served files directly in the root go through the root watcher.
  let rootNames = new Set<string>();
  let closed = false;

  const targets = () => [...fixed, ...served];

  const classify = (path: string, filename: string | null): Change | undefined => {
    if (path === root) {
      if (filename === null || filename === "design") return BOTH;
      // Any other root event still re-reads: deleting the root itself arrives
      // only as an event named after the root.
      return rootNames.has(filename) ? SERVED : REREAD;
    }
    const target = targets().find((candidate) => candidate.path === path);
    if (target === undefined) return undefined;
    if (target.names && filename !== null && !target.names.has(filename)) return undefined;
    // Names are judged only here, never on the root watcher: the root's own
    // deletion arrives there under the root's name (POSTMORTEM 2026-10-22).
    if (target === design) return { ...REREAD, names: filename === null ? null : [filename] };
    return target.change;
  };

  const onEvent = (path: string, filename: string | null) => {
    if (closed) return;
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
    const wanted = targets();
    for (const target of wanted) {
      const { path, recursive } = target;
      let ino: number | undefined;
      // lstat: `doan ls` does not follow a symlinked `design/` or comments
      // directory, and a recursive watch through `design -> .` would cover the
      // whole repo.
      try {
        const stat = lstatSync(path);
        if (stat.isDirectory()) ino = stat.ino;
      } catch {
        ino = undefined;
      }
      const current = armed.get(path);
      if (current && current.ino === ino && current.recursive === recursive) continue;
      // A served path replaced or removed changed what is served, even when the
      // event that got here was a root event classified as a re-read only.
      if (current && current.ino !== ino && served.includes(target)) refresher.trigger(SERVED);
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

// Scope entries are real repo-relative paths, so a symlinked `design` shows up
// by its real path and is watched here. `.doan/` never counts as served, or
// every comment written would reload the canvas; `design/` already has its own
// recursive watcher. A served file is watched through its directory because an
// atomic save replaces the file and ends a watcher on the file itself.
function servedTargets(root: string, scope: readonly string[]): { targets: Target[]; rootNames: Set<string> } {
  const dirs: string[] = [];
  const files: string[] = [];
  for (const rel of scope) {
    if (inside(rel, "design") || inside(rel, ".doan")) continue;
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
  // A served directory's parent is watched too: once the directory is deleted
  // its own watcher is gone, and the parent is what sees it come back. The
  // root watcher already does this for directories at the root.
  for (const dir of top) if (dirname(dir) !== ".") watchParent(dir);
  for (const file of files) {
    if (covered(file)) continue;
    if (dirname(file) === ".") rootNames.add(file);
    else watchParent(file);
  }
  for (const [parent, names] of parents) targets.push({ path: join(root, parent), recursive: false, change: SERVED, names });
  return { targets, rootNames };
}
