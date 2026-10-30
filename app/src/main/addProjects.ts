import { randomUUID } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { classifyPick } from "./addFlow";
import type { LsTarget } from "./cli";
import type { FolderState } from "./folderState";

const MAX_CHILDREN = 200;
const ONLY_FOLDERS = "Only folders can be added.";

interface AddResult {
  added: string[];
  duplicate: string | null;
  messages: string[];
  confirm: { confirmId: string; path: string } | null;
}

type StoreResult = { kind: "added"; added: string[] } | { kind: "unavailable" };
export type LocateJudgement = { root: string } | { refused: string };

export interface AddFlowDeps {
  ls(target: LsTarget): Promise<FolderState>;
  saved(): readonly string[];
  store(paths: readonly string[]): Promise<string[]>;
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

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

// Only the CLI decides what a Doan repo is. Registration rechecks the chosen
// path so a folder changed after inspection cannot become a nested project.
export function createAddFlow(deps: AddFlowDeps) {
  let confirmation: { confirmId: string; path: string } | null = null;
  const store = async (path: string): Promise<StoreResult> => ({ kind: "added", added: await deps.store([path]) });

  const addNow = async (picked: string): Promise<AddResult> => {
    confirmation = null;
    const outcome: AddResult = { added: [], duplicate: null, messages: [], confirm: null };
    const real = await realDirectory(picked);
    if (real === null) return { ...outcome, messages: [ONLY_FOLDERS] };
    const ls = await deps.ls({ cwd: real });
    const asRepo = ls.kind === "error" || ls.kind === "cliError" ? await deps.ls({ repo: real }) : null;
    const hasGit = await hasGitEntry(real);
    const found = ls.kind === "uninitialized" && hasGit === false ? await gitChildren(real) : [];
    // An unreadable folder says nothing about the repositories it may hold.
    if (found === null || (ls.kind === "uninitialized" && hasGit === null)) {
      return { ...outcome, messages: [`Couldn’t read ${basename(real)}.`] };
    }
    const decision = classifyPick({ path: real, isDir: true, ls, asRepo, hasGit: hasGit === true, children: found, saved: deps.saved() });
    switch (decision.kind) {
      case "store":
        outcome.added = await deps.store([decision.path]);
        break;
      case "duplicate":
        outcome.duplicate = decision.path;
        break;
      case "refuse":
        outcome.messages.push(decision.message);
        break;
      case "confirm":
        confirmation = { confirmId: randomUUID(), path: real };
        outcome.confirm = confirmation;
        break;
      case "drop":
        break;
    }
    return outcome;
  };

  // First run and the page may register concurrently; each judges against
  // the roots the previous request stored.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    add(path: string): Promise<AddResult> {
      const next = queue.then(() => addNow(path));
      queue = next.catch(() => undefined);
      return next;
    },

    async confirm(value: unknown): Promise<StoreResult> {
      if (!exactKeys(value, ["confirmId"]) || !confirmation || value.confirmId !== confirmation.confirmId) return { kind: "unavailable" };
      const { path } = confirmation;
      confirmation = null;
      return store(path);
    },

    // Locate takes only what add would store outright: a folder that needs
    // confirmation is not the missing project.
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
          return { refused: `${basename(real)} isn’t the current project folder. Choose the folder where this project is now located.` };
      }
    },
  };
}

export type AddFlow = ReturnType<typeof createAddFlow>;
