import { randomUUID } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { classifyPick, scanCandidates, type CandidateStatus, type ScanResult } from "./addFlow";
import type { LsTarget } from "./cli";
import type { FolderState } from "./folderState";

const MAX_DROPPED = 32;
const MAX_PATH_LENGTH = 4096;
const MAX_CHILDREN = 200;
const SCAN_CONCURRENCY = 4;
const ONLY_FOLDERS = "Only folders can be added.";

// What the checklist shows. Ids are main's; the renderer sends back only ids
// (ARCHITECTURE §7: opaque IDs), never the paths shown next to them.
export interface ScanItem {
  id: string;
  path: string;
  name: string;
  status: CandidateStatus | "checking";
  checked: boolean;
  disabled: boolean;
  // Set only on a ready repo, from the `ls` the scan already ran.
  canvasCount: number | null;
  // Never checked by default (R6).
  worktrees: { id: string; path: string; name: string; checked: false }[];
}

export interface ScanSnapshot {
  scanId: string;
  // Grows with every snapshot sent, so the newest one wins whatever the order.
  seq: number;
  finished: number;
  total: number;
  done: boolean;
  // The picked folders whose child repos are listed, in pick order. A repo
  // stored outright (step 4) is its own "added" row, not a source.
  sources: { name: string; path: string }[];
  items: ScanItem[];
}

export interface AddOutcome {
  // Stored by this request, in pick order.
  added: string[];
  // An already stored root to scroll to and highlight.
  duplicate: string | null;
  messages: string[];
  // The checklist to open, if any: child repos to pick from, or worktrees of a
  // repo just added (design 'Add flow' step 4).
  scanId: string | null;
  // Folders that are neither a repo nor hold one, each asked about (step 3③).
  confirms: { confirmId: string; path: string; name: string }[];
}

export type StoreResult = { kind: "added"; added: string[] } | { kind: "unavailable" };
export type LocateJudgement = { root: string } | { refused: string };

export interface AddFlowDeps {
  ls(target: LsTarget, signal?: AbortSignal): Promise<FolderState>;
  saved(): readonly string[];
  store(paths: readonly string[]): Promise<string[]>;
  progress(snapshot: ScanSnapshot): void;
}

// A drop is the one place the renderer names paths (design 'decision impact'),
// so it gets the same limits a dialog result has: absolute strings only.
export function droppedPaths(value: unknown): string[] | null {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("paths" in value)) return null;
  const paths: unknown = value.paths;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_DROPPED) return null;
  const valid = paths.every((path) => typeof path === "string" && path.length <= MAX_PATH_LENGTH && isAbsolute(path));
  return valid ? paths.map(String) : null;
}

// lstat: a `.git` file (linked worktree, submodule) counts as much as a directory.
// null when the entry could not be checked (EACCES, EIO, ...): that says
// nothing about whether it is there.
export async function hasGitEntry(dir: string): Promise<boolean | null> {
  try {
    await lstat(join(dir, ".git"));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? false : null;
  }
}

// Immediate child directories only, hidden ones and symlinks left out (a link
// could point anywhere, including back up), first 200 by name. null when the
// folder could not be listed, or nothing was found and some child could not be
// checked: either way "no repos here" would be a guess.
export async function gitChildren(dir: string): Promise<string[] | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const names = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort().slice(0, MAX_CHILDREN);
  const flags = await Promise.all(names.map((name) => hasGitEntry(join(dir, name))));
  const found = names.filter((_, i) => flags[i] === true).map((name) => join(dir, name));
  return found.length === 0 && flags.includes(null) ? null : found;
}

async function realDirectory(path: string): Promise<string | null> {
  try {
    const real = await realpath(path);
    return (await stat(real)).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

interface Scan {
  id: string;
  seq: number;
  sources: string[];
  children: string[];
  ids: string[];
  results: Map<string, ScanResult>;
  // Repos this request stored, offered with their worktrees only.
  added: { id: string; path: string; worktrees: string[] }[];
  treeIds: Map<string, string>;
  controller: AbortController;
  done: boolean;
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

// Design 'Add flow: 판정'. Only the CLI decides what is a doan repo; this side
// looks no further than whether a folder or its child has a `.git` entry.
export function createAddFlow(deps: AddFlowDeps) {
  let current: Scan | null = null;
  const confirms = new Map<string, string>();

  const treeId = (scan: Scan, path: string) => {
    let id = scan.treeIds.get(path);
    if (id === undefined) {
      id = randomUUID();
      scan.treeIds.set(path, id);
    }
    return id;
  };

  const snapshot = (scan: Scan): ScanSnapshot => {
    const saved = deps.saved();
    const trees = (paths: readonly string[]) => paths.map((path) => ({ id: treeId(scan, path), path, name: basename(path), checked: false as const }));
    const added: ScanItem[] = scan.added.map((repo) => ({
      id: repo.id, path: repo.path, name: basename(repo.path), status: "added", checked: false, disabled: true, canvasCount: null,
      worktrees: trees(repo.worktrees.filter((tree) => !saved.includes(tree))),
    }));
    const scanned = scanCandidates(scan.children, scan.results, saved).map((candidate, i): ScanItem => {
      const id = scan.ids[i] ?? "";
      const result = scan.results.get(scan.children[i] ?? "");
      if (result === undefined) {
        return { id, path: candidate.path, name: candidate.name, status: "checking", checked: false, disabled: true, canvasCount: null, worktrees: [] };
      }
      const canvasCount = candidate.status === "ready" && result.kind === "list" ? result.canvases.length : null;
      return { ...candidate, id, canvasCount, worktrees: trees(candidate.worktrees.map((tree) => tree.path)) };
    });
    const sources = scan.sources.map((path) => ({ name: basename(path), path }));
    return { scanId: scan.id, seq: scan.seq, finished: scan.results.size, total: scan.children.length, done: scan.done, sources, items: [...added, ...scanned] };
  };

  const publish = (scan: Scan) => {
    if (current !== scan) return;
    scan.seq++;
    deps.progress(snapshot(scan));
  };

  const run = async (scan: Scan) => {
    const { signal } = scan.controller;
    let next = 0;
    const worker = async () => {
      while (!signal.aborted && next < scan.children.length) {
        const child = scan.children[next++] ?? "";
        let result: FolderState;
        try {
          result = await deps.ls({ repo: child }, signal);
        } catch (error) {
          result = { kind: "cliError", reason: error instanceof Error ? error.message : String(error) };
        }
        if (signal.aborted) return;
        scan.results.set(child, result);
        publish(scan);
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, scan.children.length) }, worker));
    if (signal.aborted) return;
    scan.done = true;
    publish(scan);
  };

  const cancelCurrent = () => {
    current?.controller.abort();
    current = null;
  };

  const store = async (paths: readonly string[]): Promise<StoreResult> => ({ kind: "added", added: await deps.store(paths) });

  const addNow = async (paths: readonly string[]): Promise<AddOutcome> => {
    // A new request replaces the last one's checklist and confirmations.
    cancelCurrent();
    confirms.clear();
    const outcome: AddOutcome = { added: [], duplicate: null, messages: [], scanId: null, confirms: [] };
    const sources: string[] = [];
    const children: string[] = [];
    const added: Scan["added"] = [];
    let folders = 0;
    for (const picked of paths) {
      const real = await realDirectory(picked);
      if (real === null) continue;
      folders++;
      const ls = await deps.ls({ cwd: real });
      const asRepo = ls.kind === "error" || ls.kind === "cliError" ? await deps.ls({ repo: real }) : null;
      const hasGit = await hasGitEntry(real);
      const found = ls.kind === "uninitialized" && hasGit === false ? await gitChildren(real) : [];
      // Not knowing must not read as "holds no repos": that would offer to set
      // up the parent (P4).
      if (found === null || (ls.kind === "uninitialized" && hasGit === null)) {
        outcome.messages.push(`Couldn’t read ${basename(real)}.`);
        continue;
      }
      const decision = classifyPick({ path: real, isDir: true, ls, asRepo, hasGit: hasGit === true, children: found, saved: deps.saved() });
      switch (decision.kind) {
        case "store": {
          outcome.added.push(...await deps.store([decision.path]));
          const saved = deps.saved();
          const trees = ls.kind === "list" ? (ls.git?.worktrees ?? []).filter((tree) => tree !== decision.path && !saved.includes(tree)) : [];
          if (trees.length > 0) added.push({ id: randomUUID(), path: decision.path, worktrees: trees });
          break;
        }
        case "duplicate":
          outcome.duplicate ??= decision.path;
          break;
        case "refuse":
          outcome.messages.push(decision.message);
          break;
        case "scan":
          if (!sources.includes(real)) sources.push(real);
          for (const child of found) if (!children.includes(child)) children.push(child);
          break;
        case "confirm": {
          const confirmId = randomUUID();
          confirms.set(confirmId, real);
          outcome.confirms.push({ confirmId, path: real, name: basename(real) });
          break;
        }
        case "drop":
          break;
      }
    }
    if (folders === 0) outcome.messages.push(ONLY_FOLDERS);
    if (children.length > 0 || added.length > 0) {
      const scan: Scan = {
        id: randomUUID(), seq: 0, sources, children, ids: children.map(() => randomUUID()), results: new Map(),
        added, treeIds: new Map(), controller: new AbortController(), done: children.length === 0,
      };
      current = scan;
      outcome.scanId = scan.id;
      publish(scan);
      if (!scan.done) void run(scan);
    }
    return outcome;
  };

  // One request at a time (a drop while a dialog's picks are still being
  // read): each judges against the folders the one before it stored.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    add(paths: readonly string[]): Promise<AddOutcome> {
      const next = queue.then(() => addNow(paths));
      queue = next.catch(() => undefined);
      return next;
    },

    scan(scanId: unknown): ScanSnapshot | null {
      return current !== null && current.id === scanId ? snapshot(current) : null;
    },

    cancel(scanId: unknown): void {
      if (current !== null && current.id === scanId) cancelCurrent();
    },

    // Every id must be one this scan issued for a row the human can check;
    // one bad id refuses the whole request.
    async addCandidates(value: unknown): Promise<StoreResult> {
      const scan = current;
      if (scan === null || !scan.done || !exactKeys(value, ["scanId", "ids"]) || value.scanId !== scan.id || !Array.isArray(value.ids)) return { kind: "unavailable" };
      const selectable = new Map<string, string>();
      for (const item of snapshot(scan).items) {
        if (!item.disabled) selectable.set(item.id, item.path);
        for (const tree of item.worktrees) selectable.set(tree.id, tree.path);
      }
      const ids: unknown[] = value.ids;
      const paths: string[] = [];
      for (const id of ids) {
        const path = typeof id === "string" ? selectable.get(id) : undefined;
        if (path === undefined) return { kind: "unavailable" };
        paths.push(path);
      }
      current = null;
      return store(paths);
    },

    async confirm(value: unknown): Promise<StoreResult> {
      if (!exactKeys(value, ["confirmId"]) || typeof value.confirmId !== "string") return { kind: "unavailable" };
      const path = confirms.get(value.confirmId);
      if (path === undefined) return { kind: "unavailable" };
      confirms.delete(value.confirmId);
      return store([path]);
    },

    // Locate takes only what add would store outright (steps 1 to 3①): a
    // folder that needs a scan or a confirmation is not the missing project.
    async judge(picked: string): Promise<LocateJudgement> {
      const real = await realDirectory(picked);
      if (real === null) return { refused: ONLY_FOLDERS };
      const ls = await deps.ls({ cwd: real });
      const asRepo = ls.kind === "error" || ls.kind === "cliError" ? await deps.ls({ repo: real }) : null;
      const hasGit = (await hasGitEntry(real)) === true;
      const decision = classifyPick({ path: real, isDir: true, ls, asRepo, hasGit, children: [], saved: [] });
      switch (decision.kind) {
        case "store":
        case "duplicate":
          return { root: decision.path };
        case "refuse":
          return { refused: decision.message };
        default:
          return { refused: `${basename(real)} isn’t a doan project or a git repository.` };
      }
    },
  };
}

export type AddFlow = ReturnType<typeof createAddFlow>;
