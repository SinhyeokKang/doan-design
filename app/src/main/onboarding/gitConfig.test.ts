import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Reading remotes must never start git: a repository's config can run fsmonitor, hooks and filters
// (POSTMORTEM 2026-10-25 'Eval inspection executed repository-configured helpers').
const spawned = vi.hoisted(() => [] as string[]);
vi.mock("node:child_process", async original => {
  const actual = await original<typeof import("node:child_process")>();
  const record = (name: string) => (...args: unknown[]) => { spawned.push(`${name} ${String(args[0])}`); throw new Error("git must not run"); };
  return { ...actual, spawn: record("spawn"), spawnSync: record("spawnSync"), exec: record("exec"), execSync: record("execSync"), execFile: record("execFile"), execFileSync: record("execFileSync"), fork: record("fork") };
});
const { parseGitConfig, readGitRemotes } = await import("./gitConfig");
const { PROMPT_MS, withFifo } = await import("../fifo.fixture");

let temp: string, home: string;
beforeEach(() => { temp = realpathSync(mkdtempSync(join(tmpdir(), "doan-gitconfig-"))); home = join(temp, "home"); mkdirSync(home); spawned.length = 0; });
afterEach(() => { expect(spawned).toEqual([]); rmSync(temp, { recursive: true, force: true }); });
function file(path: string, text: string) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); }
function repo(name: string, config: string): string { const root = join(temp, name); file(join(root, ".git", "config"), config); return root; }

test("remote URLs are read per remote, in file order, including repeated url keys", () => {
  const parsed = parseGitConfig([
    "[core]", "\trepositoryformatversion = 0", "\tbare = false",
    "[remote \"origin\"]", "\turl = git@github.com:acme/studio.git", "\tfetch = +refs/heads/*:refs/remotes/origin/*",
    "[remote \"upstream\"]", "\turl = https://github.com/acme/upstream", "\turl = https://github.com/acme/mirror",
    "[branch \"main\"]", "\tremote = origin",
  ].join("\n"));
  expect(parsed?.remotes).toEqual([
    { name: "origin", url: "git@github.com:acme/studio.git" },
    { name: "upstream", url: "https://github.com/acme/upstream" },
    { name: "upstream", url: "https://github.com/acme/mirror" },
  ]);
  expect(parsed?.includes).toEqual([]);
});

test("section and key names are case-insensitive, quoted subsections keep case and escapes", () => {
  const parsed = parseGitConfig([
    "[Remote \"Origin \\\"main\\\"\"]", "  URL = https://github.com/acme/studio",
    "[remote.legacy]", "url=https://github.com/acme/legacy",
    "[remote \"inline\"] url = https://github.com/acme/inline",
  ].join("\n"));
  expect(parsed?.remotes).toEqual([
    { name: "Origin \"main\"", url: "https://github.com/acme/studio" },
    { name: "legacy", url: "https://github.com/acme/legacy" },
    { name: "inline", url: "https://github.com/acme/inline" },
  ]);
});

test("comments, quotes, escapes and continuation lines follow git's value syntax", () => {
  const parsed = parseGitConfig([
    "# leading comment", "; another", "[remote \"a\"]",
    "  url = https://github.com/acme/a.git # trailing comment",
    "[remote \"b\"]", "  url = \"https://github.com/acme/b#not-a-comment\" ; comment",
    "[remote \"c\"]", "  url = https://github.com/\\", "acme/c",
    "[remote \"d\"]", "  url = \"https://github.com/acme/\\\"d\\\"\"",
    "[remote \"e\"]", "  url", "[remote \"f\"]", "  url =", "",
  ].join("\n"));
  expect(parsed?.remotes).toEqual([
    { name: "a", url: "https://github.com/acme/a.git" },
    { name: "b", url: "https://github.com/acme/b#not-a-comment" },
    { name: "c", url: "https://github.com/acme/c" },
    { name: "d", url: "https://github.com/acme/\"d\"" },
    // A key without = is boolean true; an empty value is empty. Neither names a repository.
    { name: "e", url: "true" },
    { name: "f", url: "" },
  ]);
});

test("include and includeIf are listed where they appear", () => {
  const parsed = parseGitConfig([
    "[include]", "  path = shared.inc", "[includeIf \"gitdir:~/work/\"]", "  path = ~/work.inc", "[remote \"origin\"]", "  url = https://github.com/acme/studio",
  ].join("\n"));
  expect(parsed?.includes).toEqual([{ path: "shared.inc", conditional: false }, { path: "~/work.inc", conditional: true }]);
});

test("malformed config is unreadable rather than an empty remote list", () => {
  for (const text of ["[remote \"origin\"", "[remote \"o\"]\n  = value", "[remote \"o\"]\n  url = \"unterminated", "[re mote]\nurl = x", "url = before any section"]) expect(parseGitConfig(text), JSON.stringify(text)).toBeNull();
});

test("a plain repository reads .git/config", () => {
  const root = repo("plain", "[remote \"origin\"]\n\turl = https://github.com/acme/studio.git\n");
  expect(readGitRemotes(root, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio.git"], uncertain: false });
});

test("a linked worktree reads the shared config through gitdir and commondir", () => {
  const main = repo("main", "[remote \"origin\"]\n\turl = git@github.com:acme/studio.git\n");
  const gitdir = join(main, ".git", "worktrees", "auth");
  file(join(gitdir, "commondir"), "../..\n");
  file(join(gitdir, "HEAD"), "ref: refs/heads/auth\n");
  const absolute = join(temp, "wt-absolute"); file(join(absolute, ".git"), `gitdir: ${gitdir}\n`);
  expect(readGitRemotes(absolute, home)).toEqual({ ok: true, urls: ["git@github.com:acme/studio.git"], uncertain: false });
  // A relative gitdir resolves from the worktree root.
  const relative = join(temp, "wt-relative"); file(join(relative, ".git"), "gitdir: ../main/.git/worktrees/auth");
  expect(readGitRemotes(relative, home)).toEqual({ ok: true, urls: ["git@github.com:acme/studio.git"], uncertain: false });
});

test("a submodule-style gitdir without commondir reads its own config", () => {
  const modules = join(temp, "super", ".git", "modules", "lib");
  file(join(modules, "config"), "[remote \"origin\"]\n\turl = https://github.com/acme/lib\n");
  const root = join(temp, "super", "lib"); file(join(root, ".git"), "gitdir: ../.git/modules/lib\n");
  expect(readGitRemotes(root, home)).toEqual({ ok: true, urls: ["https://github.com/acme/lib"], uncertain: false });
});

test("includes resolve relative to the including file and from ~, nested, with cycles stopped", () => {
  const root = repo("inc", "[include]\n\tpath = ../extra/remotes.inc\n[include]\n\tpath = ~/.gitconfig-remotes\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  file(join(root, ".git", "..", "extra", "remotes.inc"), "[remote \"fork\"]\n\turl = git@github.com:someone/studio.git\n[include]\n\tpath = nested.inc\n");
  file(join(root, "extra", "nested.inc"), "[remote \"nested\"]\n\turl = https://github.com/acme/nested\n[include]\n\tpath = remotes.inc\n");
  file(join(home, ".gitconfig-remotes"), "[remote \"home\"]\n\turl = https://github.com/acme/home\n");
  const read = readGitRemotes(root, home);
  expect(read).toEqual({ ok: true, urls: ["git@github.com:someone/studio.git", "https://github.com/acme/nested", "https://github.com/acme/home", "https://github.com/acme/studio"], uncertain: true });
});

// The cycle check sees only the current chain, so a file included from several places is read each time. A file
// included twice is ordinary; ten includes per file, levels deep, would be read 10^depth times on main.
test("a file included from two places is read from both", () => {
  const root = repo("dag-small", "[include]\n\tpath = a.inc\n[include]\n\tpath = b.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  file(join(root, ".git", "a.inc"), "[include]\n\tpath = shared.inc\n");
  file(join(root, ".git", "b.inc"), "[include]\n\tpath = shared.inc\n");
  file(join(root, ".git", "shared.inc"), "[remote \"shared\"]\n\turl = https://github.com/acme/shared\n");
  expect(readGitRemotes(root, home)).toEqual({ ok: true, urls: ["https://github.com/acme/shared", "https://github.com/acme/shared", "https://github.com/acme/studio"], uncertain: false });
});

test("a wide include graph stops at its read budget and is uncertain", () => {
  const ten = (path: string) => "[include]\n\tpath = " + path + "\n";
  const root = repo("dag-wide", ten("l1.inc").repeat(10) + "[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  for (let level = 1; level < 4; level++) file(join(root, ".git", `l${level}.inc`), ten(`l${level + 1}.inc`).repeat(10));
  file(join(root, ".git", "l4.inc"), "[remote \"deep\"]\n\turl = https://github.com/acme/deep\n");
  const started = performance.now();
  const read = readGitRemotes(root, home);
  expect(performance.now() - started).toBeLessThan(PROMPT_MS);
  expect(read).toMatchObject({ ok: true, uncertain: true });
  expect(read.ok && read.urls.at(-1)).toBe("https://github.com/acme/studio");
});

test("a missing include is skipped like git does; an unreadable or malformed one makes the read uncertain", () => {
  const missing = repo("missing-inc", "[include]\n\tpath = nowhere.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  expect(readGitRemotes(missing, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: false });
  const bad = repo("bad-inc", "[include]\n\tpath = bad.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  file(join(bad, ".git", "bad.inc"), "[remote \"x\"\n");
  expect(readGitRemotes(bad, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
  const dir = repo("dir-inc", "[include]\n\tpath = folder.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  mkdirSync(join(dir, ".git", "folder.inc"));
  expect(readGitRemotes(dir, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
});

test("conditional includes are not evaluated, so the read is marked uncertain", () => {
  const root = repo("cond", "[includeIf \"gitdir:~/work/\"]\n\tpath = work.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  file(join(root, ".git", "work.inc"), "[remote \"work\"]\n\turl = https://github.com/acme/work\n");
  expect(readGitRemotes(root, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
});

test("a folder without .git is not a repository; broken metadata is unreadable", () => {
  const plain = join(temp, "plain-folder"); mkdirSync(plain);
  expect(readGitRemotes(plain, home)).toEqual({ ok: false, reason: "not_repository" });
  expect(readGitRemotes(join(temp, "gone"), home)).toEqual({ ok: false, reason: "unreadable" });
  const garbage = join(temp, "garbage"); file(join(garbage, ".git"), "not a gitdir line\n");
  expect(readGitRemotes(garbage, home)).toEqual({ ok: false, reason: "unreadable" });
  const dangling = join(temp, "dangling"); file(join(dangling, ".git"), "gitdir: ../nowhere/.git\n");
  expect(readGitRemotes(dangling, home)).toEqual({ ok: false, reason: "unreadable" });
  const noConfig = join(temp, "no-config"); mkdirSync(join(noConfig, ".git"), { recursive: true });
  expect(readGitRemotes(noConfig, home)).toEqual({ ok: false, reason: "unreadable" });
  const malformed = repo("malformed", "[remote \"origin\"\n");
  expect(readGitRemotes(malformed, home)).toEqual({ ok: false, reason: "unreadable" });
});

test("a .git entry that exists but cannot be followed is unreadable, never a missing repository", () => {
  const dangling = join(temp, "dangling-link"); mkdirSync(dangling);
  symlinkSync(join(temp, "vanished", ".git"), join(dangling, ".git"));
  expect(readGitRemotes(dangling, home)).toEqual({ ok: false, reason: "unreadable" });
  const linked = join(temp, "linked"); mkdirSync(linked);
  const target = repo("target", "[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  symlinkSync(join(target, ".git"), join(linked, ".git"));
  expect(readGitRemotes(linked, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: false });
});

test("config features doan does not resolve make the read uncertain instead of complete", () => {
  // extensions.worktreeConfig lets config.worktree hold remotes that are not read.
  const worktreeConfig = repo("wtconfig", "[extensions]\n\tworktreeConfig = true\n");
  file(join(worktreeConfig, ".git", "config.worktree"), "[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  expect(readGitRemotes(worktreeConfig, home)).toEqual({ ok: true, urls: [], uncertain: true });
  expect(readGitRemotes(repo("wtconfig-bare", "[extensions]\n\tworktreeConfig\n"), home)).toMatchObject({ uncertain: true });
  expect(readGitRemotes(repo("wtconfig-off", "[extensions]\n\tworktreeConfig = false\n"), home)).toEqual({ ok: true, urls: [], uncertain: false });
  // URL rewrites change what a remote points at.
  for (const key of ["insteadOf", "pushInsteadOf"]) {
    const rewrite = repo(`rewrite-${key}`, `[url "git@github.com:"]\n\t${key} = gh:\n[remote "origin"]\n\turl = gh:acme/studio\n`);
    expect(readGitRemotes(rewrite, home), key).toEqual({ ok: true, urls: ["gh:acme/studio"], uncertain: true });
  }
  const included = repo("rewrite-included", "[include]\n\tpath = rewrite.inc\n");
  file(join(included, ".git", "rewrite.inc"), "[url \"https://github.com/\"]\n\tinsteadOf = gh:\n");
  expect(readGitRemotes(included, home)).toMatchObject({ uncertain: true });
});

test("a repository with no remotes reads as an empty list", () => {
  expect(readGitRemotes(repo("empty", "[core]\n\tbare = false\n"), home)).toEqual({ ok: true, urls: [], uncertain: false });
});

// A FIFO or device in repository metadata must not stall or flood main: it reads as unreadable (or makes an include
// uncertain) at once.
test("a FIFO .git file, commondir or config is unreadable without blocking", async () => {
  const dotGit = join(temp, "fifo-dotgit"); mkdirSync(dotGit);
  const asDotGit = await withFifo(join(dotGit, ".git"), () => readGitRemotes(dotGit, home));
  expect(asDotGit.value).toEqual({ ok: false, reason: "unreadable" });
  expect(asDotGit.ms).toBeLessThan(PROMPT_MS);

  const main = repo("fifo-main", "[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  const gitdir = join(main, ".git", "worktrees", "wt"); mkdirSync(gitdir, { recursive: true });
  const worktree = join(temp, "fifo-wt"); file(join(worktree, ".git"), `gitdir: ${gitdir}\n`);
  const asCommondir = await withFifo(join(gitdir, "commondir"), () => readGitRemotes(worktree, home));
  expect(asCommondir.value).toEqual({ ok: false, reason: "unreadable" });
  expect(asCommondir.ms).toBeLessThan(PROMPT_MS);

  const config = join(temp, "fifo-config"); mkdirSync(join(config, ".git"), { recursive: true });
  const asConfig = await withFifo(join(config, ".git", "config"), () => readGitRemotes(config, home));
  expect(asConfig.value).toEqual({ ok: false, reason: "unreadable" });
  expect(asConfig.ms).toBeLessThan(PROMPT_MS);
});

test("a FIFO, device or oversized include makes the read uncertain without blocking", async () => {
  const fifo = repo("fifo-inc", "[include]\n\tpath = pipe.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  const read = await withFifo(join(fifo, ".git", "pipe.inc"), () => readGitRemotes(fifo, home));
  expect(read.value).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
  expect(read.ms).toBeLessThan(PROMPT_MS);
  const device = repo("dev-inc", "[include]\n\tpath = /dev/null\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  expect(readGitRemotes(device, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
  const big = repo("big-inc", "[include]\n\tpath = big.inc\n[remote \"origin\"]\n\turl = https://github.com/acme/studio\n");
  file(join(big, ".git", "big.inc"), `[remote "big"]\n\turl = https://github.com/acme/big\n${"#".repeat(16 * 1024 * 1024)}\n`);
  expect(readGitRemotes(big, home)).toEqual({ ok: true, urls: ["https://github.com/acme/studio"], uncertain: true });
});

// Dotfile setups link their git config; following the link keeps such a regular file readable.
test("an include reached through a link is still read", () => {
  const root = repo("linked-inc", "[include]\n\tpath = ~/.gitconfig-linked\n");
  file(join(home, "dotfiles", "gitconfig"), "[remote \"linked\"]\n\turl = https://github.com/acme/linked\n");
  symlinkSync(join(home, "dotfiles", "gitconfig"), join(home, ".gitconfig-linked"));
  expect(readGitRemotes(root, home)).toEqual({ ok: true, urls: ["https://github.com/acme/linked"], uncertain: false });
});
