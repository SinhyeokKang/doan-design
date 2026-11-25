import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { GRACE_MS, gitDirOf, parseGitSignal, resolveGitDir, settlePending, type GitFileRead, type GitSignalEntry } from "./gitSignal";

const SHA1 = "a".repeat(40);
const SHA256 = "b".repeat(64);
const file = (text: string, size = text.length, mtimeMs = 1000): GitFileRead => ({ text, size, mtimeMs });
const signal = (files: { head?: string | null; fetchHead?: GitFileRead | null; origHead?: GitFileRead | null }) =>
  parseGitSignal({ head: files.head ?? null, fetchHead: files.fetchHead ?? null, origHead: files.origHead ?? null });

test("a .git directory is the gitdir", () => {
  expect(resolveGitDir({ kind: "directory", path: "/repo/.git" })).toBe("/repo/.git");
});

test("a worktree .git file names its gitdir, absolute or relative to the file's directory", () => {
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "gitdir: /repo/.git/worktrees/wt\n" })).toBe("/repo/.git/worktrees/wt");
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "gitdir: ../repo/.git/worktrees/wt" })).toBe("/repo/.git/worktrees/wt");
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "gitdir: /repo/.git/worktrees/wt\r\n" })).toBe("/repo/.git/worktrees/wt");
});

test("a .git file that is not a gitdir link, or no .git at all, has no gitdir", () => {
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "not a link\n" })).toBeNull();
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "" })).toBeNull();
  expect(resolveGitDir({ kind: "file", path: "/wt/.git", text: "gitdir:\n" })).toBeNull();
  expect(resolveGitDir({ kind: "none" })).toBeNull();
});

// gitDirOf: the nearest .git at or above the root, below HOME (Go gitLocation).

test("the nearest .git at or above the root names the gitdir, and nothing at or above HOME counts", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "doan-gitdir-")));
  const home = join(base, "home"), repo = join(home, "repo"), sub = join(repo, "packages/web");
  mkdirSync(sub, { recursive: true });
  expect(gitDirOf(sub, home)).toBeNull();
  mkdirSync(join(repo, ".git"));
  expect(gitDirOf(sub, home)).toBe(join(repo, ".git"));
  expect(gitDirOf(repo, home)).toBe(join(repo, ".git"));
  // A nearer linked worktree wins.
  writeFileSync(join(sub, ".git"), `gitdir: ${join(repo, ".git/worktrees/web")}\n`);
  expect(gitDirOf(sub, home)).toBe(join(repo, ".git/worktrees/web"));
  // A .git in HOME or above it is never the repository of a folder under HOME, nor of HOME itself.
  const plain = join(home, "plain");
  mkdirSync(plain);
  mkdirSync(join(home, ".git"));
  mkdirSync(join(base, ".git"));
  expect(gitDirOf(plain, home)).toBeNull();
  expect(gitDirOf(home, home)).toBeNull();
  // Outside HOME the walk goes up as well, but never into a folder above HOME.
  mkdirSync(join(base, "other/.git"), { recursive: true });
  expect(gitDirOf(join(base, "other/sub"), home)).toBe(join(base, "other/.git"));
  expect(gitDirOf(join(base, "elsewhere"), home)).toBeNull();
});

test("a normal checkout's signal follows the branch name", () => {
  const main = signal({ head: "ref: refs/heads/main\n" });
  expect(signal({ head: "ref: refs/heads/main\n" })).toBe(main);
  expect(signal({ head: "ref: refs/heads/main\r\n" })).toBe(main);
  expect(signal({ head: "ref: refs/heads/feature/x\n" })).not.toBe(main);
});

test("a detached HEAD's signal follows its commit, for sha1 and sha256", () => {
  expect(signal({ head: `${SHA1}\n` })).toBe(signal({ head: SHA1 }));
  expect(signal({ head: `${SHA1}\n` })).not.toBe(signal({ head: `${"c".repeat(40)}\n` }));
  expect(signal({ head: `${SHA256}\n` })).not.toBe(signal({ head: `${SHA1}\n` }));
  expect(signal({ head: `${SHA1}\n` })).not.toBe(signal({ head: "ref: refs/heads/main\n" }));
});

test("a branch named like a commit is still a branch, and detached differs from branch", () => {
  expect(signal({ head: `ref: refs/heads/${SHA1}\n` })).not.toBe(signal({ head: `${SHA1}\n` }));
});

test("not a repository, unreadable files and unparseable HEAD all give one constant signal", () => {
  const none = signal({});
  expect(signal({ head: "" })).toBe(none);
  expect(signal({ head: "garbage\n" })).toBe(none);
  expect(signal({ head: "ref: refs/heads/a b\n" })).toBe(none);
  expect(signal({ head: "ref: refs/heads/.invalid\n" })).toBe(none);
  expect(signal({ head: "ref: refs/heads/main\nextra\n" })).toBe(none);
  expect(signal({ head: `${"a".repeat(39)}\n` })).toBe(none);
  expect(signal({ head: `${"g".repeat(40)}\n` })).toBe(none);
  expect(signal({ head: `ref: refs/heads/${"x".repeat(5000)}\n` })).toBe(none);
});

test("FETCH_HEAD and ORIG_HEAD appearing or changing size, mtime or content change the signal", () => {
  const head = "ref: refs/heads/main\n";
  const base = signal({ head });
  const fetched = signal({ head, fetchHead: file("abc\n", 4, 10) });
  expect(fetched).not.toBe(base);
  expect(signal({ head, fetchHead: file("abc\n", 4, 10) })).toBe(fetched);
  expect(signal({ head, fetchHead: file("abc\n", 4, 11) })).not.toBe(fetched);
  expect(signal({ head, fetchHead: file("abd\n", 4, 10) })).not.toBe(fetched);
  expect(signal({ head, fetchHead: file("abc\n", 5, 10) })).not.toBe(fetched);
  const orig = signal({ head, origHead: file("abc\n", 4, 10) });
  expect(orig).not.toBe(base);
  expect(orig).not.toBe(fetched);
});

test("the same file content in FETCH_HEAD and in ORIG_HEAD is not mixed up", () => {
  const f = file("abc\n", 4, 10);
  expect(signal({ fetchHead: f })).not.toBe(signal({ origHead: f }));
});

test("a commit on the same branch leaves the signal unchanged", () => {
  // A commit moves refs/heads/<branch>, which the signal does not read; HEAD still names the branch.
  const before = signal({ head: "ref: refs/heads/main\n", origHead: file("old\n", 4, 5) });
  const after = signal({ head: "ref: refs/heads/main\n", origHead: file("old\n", 4, 5) });
  expect(after).toBe(before);
});

test("a branch switch or a checkout of a commit changes the signal", () => {
  const main = signal({ head: "ref: refs/heads/main\n" });
  expect(signal({ head: "ref: refs/heads/other\n" })).not.toBe(main);
  expect(signal({ head: `${SHA1}\n` })).not.toBe(main);
});

const T = 100_000;
const entry = (at: number, value: string): GitSignalEntry => ({ at, signal: value });
// The first entry is the signal the app saw when it started watching; it is not itself a change.
const quiet = [entry(0, "s1")];

test("GRACE_MS is two seconds", () => {
  expect(GRACE_MS).toBe(2000);
});

test("no signal change: pending during the grace, a new canvas once it ends", () => {
  expect(settlePending({ appearedAt: T }, quiet, T)).toBe("pending");
  expect(settlePending({ appearedAt: T }, quiet, T + GRACE_MS - 1)).toBe("pending");
  expect(settlePending({ appearedAt: T }, quiet, T + GRACE_MS)).toBe("new");
  expect(settlePending({ appearedAt: T }, quiet, T + 60_000)).toBe("new");
});

test("an empty history is a quiet signal", () => {
  expect(settlePending({ appearedAt: T }, [], T + GRACE_MS)).toBe("new");
});

test("a change within two seconds before the canvas appeared settles as html at once", () => {
  const history = [entry(0, "s1"), entry(T - 1500, "s2")];
  expect(settlePending({ appearedAt: T }, history, T)).toBe("html");
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("html");
});

test("a change during the grace settles as html", () => {
  const history = [entry(0, "s1"), entry(T + 500, "s2")];
  expect(settlePending({ appearedAt: T }, history, T + 500)).toBe("html");
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS + 10_000)).toBe("html");
});

test("a change observed before the window opened does not count", () => {
  const history = [entry(0, "s1"), entry(T - GRACE_MS - 1, "s2")];
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("new");
});

test("a change after the grace ended does not count", () => {
  const history = [entry(0, "s1"), entry(T + GRACE_MS + 1, "s2")];
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("new");
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS + 5000)).toBe("new");
});

test("the window edges count: two seconds before and the end of the grace", () => {
  expect(settlePending({ appearedAt: T }, [entry(0, "s1"), entry(T - GRACE_MS, "s2")], T + GRACE_MS)).toBe("html");
  expect(settlePending({ appearedAt: T }, [entry(0, "s1"), entry(T + GRACE_MS, "s2")], T + GRACE_MS)).toBe("html");
});

test("a change that has not happened yet at now is ignored", () => {
  const history = [entry(0, "s1"), entry(T + 1500, "s2")];
  expect(settlePending({ appearedAt: T }, history, T + 1000)).toBe("pending");
});

test("an observation that repeats the previous signal is not a change", () => {
  const history = [entry(0, "s1"), entry(T - 500, "s1"), entry(T + 500, "s1")];
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("new");
});

test("a change back to an earlier signal is still a change", () => {
  const history = [entry(0, "s1"), entry(T - 3000, "s2"), entry(T - 500, "s1")];
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("html");
});

test("the entry that opens the history inside the window is a baseline, not a change", () => {
  const history = [entry(T - 500, "s1")];
  expect(settlePending({ appearedAt: T }, history, T + GRACE_MS)).toBe("new");
});
