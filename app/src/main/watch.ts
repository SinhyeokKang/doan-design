import { lstatSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

const DEBOUNCE_MS = 200;

export interface Refresher {
  trigger(): void;
  close(): void;
}

export interface FolderWatch {
  close(): void;
}

// Debounces triggers into one run; a trigger during a run queues exactly one
// more run after it, so `doan ls` never runs twice at once for a folder and
// the last change is never missed.
export function createRefresher(run: () => Promise<void>, delayMs = DEBOUNCE_MS): Refresher {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let again = false;
  let closed = false;

  const start = async () => {
    timer = undefined;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error("doan: folder refresh failed", error);
    }
    running = false;
    if (again && !closed) {
      again = false;
      trigger();
    }
  };
  const trigger = () => {
    if (closed) return;
    if (running) {
      again = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void start(), delayMs);
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
}

// Watches only what `doan ls` reads: the root (non-recursive, to see `design`
// and `.doan` come and go), `design/` (recursive), `.doan/` (config.json and
// the `comments` directory) and `.doan/comments/`. A watcher on a deleted
// directory stays on the old inode, so the sub-watchers are re-armed whenever
// their parent changes.
export function watchFolder(root: string, refresh: () => Promise<void>): FolderWatch {
  const refresher = createRefresher(refresh);
  const armed = new Map<string, Armed>();
  const targets = [
    { path: join(root, "design"), recursive: true },
    { path: join(root, ".doan"), recursive: false },
    { path: join(root, ".doan", "comments"), recursive: false },
  ];
  let closed = false;

  const onEvent = () => {
    if (closed) return;
    rearm();
    refresher.trigger();
  };

  const listen = (path: string, recursive: boolean): FSWatcher | undefined => {
    try {
      const watcher = watch(path, { recursive }, onEvent);
      // Removing the watched directory can surface as an error. A watcher that
      // errored is dead, so drop it and let the re-arm open a fresh one.
      watcher.on("error", () => {
        watcher.close();
        if (armed.get(path)?.watcher === watcher) armed.delete(path);
        onEvent();
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
    for (const { path, recursive } of targets) {
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
      if (current && current.ino === ino) continue;
      current?.watcher.close();
      armed.delete(path);
      if (ino === undefined) continue;
      const watcher = listen(path, recursive);
      if (watcher) armed.set(path, { watcher, ino });
    }
  };

  const rootWatcher = listen(root, false);
  rearm();

  return {
    close() {
      closed = true;
      refresher.close();
      rootWatcher?.close();
      for (const { watcher } of armed.values()) watcher.close();
      armed.clear();
    },
  };
}
