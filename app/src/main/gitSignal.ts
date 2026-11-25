import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { gitdirFromLink } from "./onboarding/gitConfig";
import { readRegularFileSync } from "./regularFile";

// Tells a canvas the app watched appear from one that arrived with a git operation. Every git file is opened through
// readRegularFileSync so a FIFO cannot stall main; never runs git (PRODUCT §3).

// How long a new canvas id waits for a git signal change before it counts as new, and how far before its appearance a
// change still explains it: git writes the working tree first and HEAD or a ref afterwards.
export const GRACE_MS = 2000;

// What `.git` is at a repository root, as the caller found it. A directory is the gitdir; a file is a linked worktree's
// link whose text names the gitdir.
export type DotGit = { kind: "directory"; path: string } | { kind: "file"; path: string; text: string } | { kind: "none" };

// null when there is no repository or the link cannot be followed; the signal is then constant.
export function resolveGitDir(dotGit: DotGit): string | null {
  if (dotGit.kind === "directory") return dotGit.path;
  if (dotGit.kind === "file") return gitdirFromLink(dirname(dotGit.path), dotGit.text);
  return null;
}

// A git file's stat and content; null when it is absent or could not be read.
export type GitFileRead = { size: number; mtimeMs: number; text: string };
export type GitFiles = {
  // HEAD's text only: ref files and packed-refs are never read, so a commit on the same branch changes nothing here.
  head: string | null;
  fetchHead: GitFileRead | null;
  origHead: GitFileRead | null;
};

// Same limits as Go cli/internal/repo/git_parse.go gitLine: one line, no control separators, bounded.
const GIT_FILE_LIMIT = 4 * 1024;
function gitLine(text: string): string {
  if (text.length > GIT_FILE_LIMIT) return "";
  const line = text.replace(/\n$/, "").replace(/\r$/, "");
  return /[\r\n\0]/.test(line) ? "" : line;
}

// Go validBranchName.
function validBranchName(name: string): boolean {
  if (name === "" || name.includes("..") || name.includes("@{") || /[ ~^:?*[\\]/.test(name) || name.endsWith(".")) return false;
  if (/[\x00-\x1f\x7f]/.test(name)) return false;
  return name.split("/").every(part => part !== "" && !part.startsWith(".") && !part.endsWith(".lock"));
}

// Go parseHead. A reftable placeholder (`.invalid`) is not a branch.
function headValue(text: string): string {
  const line = gitLine(text);
  if (line.startsWith("ref: refs/heads/")) {
    const name = line.slice("ref: refs/heads/".length);
    return validBranchName(name) ? `branch:${name}` : "";
  }
  return (line.length === 40 || line.length === 64) && /^[0-9a-f]+$/i.test(line) ? `detached:${line}` : "";
}

function fileValue(file: GitFileRead | null): string {
  if (!file) return "";
  return `${file.size}:${file.mtimeMs}:${createHash("sha256").update(file.text).digest("hex")}`;
}

// HEAD's branch or detached commit, and FETCH_HEAD and ORIG_HEAD by size, mtime and hash (pull, merge and rebase write
// them). An absent or unreadable repository gives one constant value, so its canvases settle as new after the grace.
export function parseGitSignal(files: GitFiles): string {
  return JSON.stringify([
    files.head === null ? "" : headValue(files.head),
    fileValue(files.fetchHead),
    fileValue(files.origHead),
  ]);
}

// The value the app saw at `at` (ms). The caller appends one on start and on every change, and keeps the entry that
// precedes the oldest pending id's window as the baseline.
export type GitSignalEntry = { at: number; signal: string };

export type Pending = { appearedAt: number };

// html: a signal change between GRACE_MS before the id appeared and the end of its grace, so git brought it (seen).
// new: the grace ended without one. A change after `now` is not known yet and is ignored.
export function settlePending(pending: Pending, gitSignalHistory: readonly GitSignalEntry[], now: number): "html" | "new" | "pending" {
  const from = pending.appearedAt - GRACE_MS, to = pending.appearedAt + GRACE_MS;
  for (let i = 1; i < gitSignalHistory.length; i++) {
    const entry = gitSignalHistory[i]!;
    if (entry.at < from || entry.at > to || entry.at > now) continue;
    if (entry.signal !== gitSignalHistory[i - 1]!.signal) return "html";
  }
  return now >= to ? "new" : "pending";
}

// The home folder as roots are spelled (real paths).
function realHomeDir(): string {
  const home = process.env.HOME ?? homedir();
  try { return realpathSync.native(home); } catch { return home; }
}

// Go repo ignoreAtOrAboveHome: HOME's own .git, or one above it, is never a folder's repository.
const atOrAboveHome = (dir: string, home: string): boolean => {
  if (!isAbsolute(dir) || !isAbsolute(home)) return false;
  const rel = relative(dir, home);
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
};

// The nearest `.git` at or above the root, as Go repo gitLocation finds it; a link is followed only after it is chosen.
// Anything but a directory or regular file (a FIFO, a socket) is no repository, and the read never blocks.
function dotGitOf(root: string, home: string): DotGit {
  let tree = root;
  for (;;) {
    if (atOrAboveHome(tree, home)) return { kind: "none" };
    try {
      lstatSync(join(tree, ".git"));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { kind: "none" };
    }
    const parent = dirname(tree);
    if (parent === tree) return { kind: "none" };
    tree = parent;
  }
  const path = join(tree, ".git");
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) return { kind: "directory", path };
    if (stat.isFile()) return { kind: "file", path, text: readRegularFileSync(path) };
  } catch { /* absent or unreadable */ }
  return { kind: "none" };
}

// The root's gitdir, where HEAD, FETCH_HEAD and ORIG_HEAD are (a linked worktree's own); null without one.
export const gitDirOf = (root: string, home: string = realHomeDir()): string | null => resolveGitDir(dotGitOf(root, home));

function readText(path: string): string | null {
  try { return readRegularFileSync(path); } catch { return null; }
}

function readFile(path: string): GitFileRead | null {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return null;
    return { size: stat.size, mtimeMs: stat.mtimeMs, text: readRegularFileSync(path) };
  } catch { return null; }
}

// The root's git signal now (parseGitSignal). Synchronous and bounded: a few small files.
export function readGitSignal(root: string): string {
  const gitDir = gitDirOf(root);
  if (gitDir === null) return parseGitSignal({ head: null, fetchHead: null, origHead: null });
  return parseGitSignal({ head: readText(join(gitDir, "HEAD")), fetchHead: readFile(join(gitDir, "FETCH_HEAD")), origHead: readFile(join(gitDir, "ORIG_HEAD")) });
}
