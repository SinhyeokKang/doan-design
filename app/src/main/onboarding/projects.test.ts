import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import type { LsTarget } from "../cli";
import type { FolderState } from "../folderState";
import type { ProjectInitResult } from "../shell";
import { readGitRemotes } from "./gitConfig";
import { canonicalFolder, cloneDestination, leftoverPresent, cloneProject, confirmProject, destinationState, inspectPath, inspectUrl, plannedChanges, registerClone, selectProject, type ProjectDeps } from "./projects";

// Remote checks read .git/config; a git process here would run the repository's fsmonitor, hooks and filters.
vi.mock("node:child_process", () => ({ spawn: () => { throw new Error("git must not run"); }, execFile: () => { throw new Error("git must not run"); } }));

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) { try { chmodSync(dir, 0o755); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); } });
function temp(): string { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-projects-test-"))); dirs.push(dir); return dir; }
const root = process.getuid?.() === 0;
function repo(dir: string, options: { remote?: string; config?: string; canvases?: boolean; attributes?: string } = {}): string {
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git/config"), options.remote ? `[remote "origin"]\n\turl = ${options.remote}\n` : "[core]\n");
  if (options.config !== undefined) { mkdirSync(join(dir, ".doan"), { recursive: true }); writeFileSync(join(dir, ".doan/config.json"), options.config); }
  if (options.canvases) mkdirSync(join(dir, ".doan/canvases"), { recursive: true });
  if (options.attributes !== undefined) writeFileSync(join(dir, ".gitattributes"), options.attributes);
  return dir;
}

// The CLI's answers, read from the disk the way `doan ls` reads it: a valid config lists, a broken one errors,
// `{cwd}` walks up to a set-up repo.
function cliLs(target: LsTarget): FolderState {
  const read = (dir: string): FolderState | null => {
    if (!existsSync(join(dir, ".doan/config.json"))) return null;
    try { JSON.parse(readFileSync(join(dir, ".doan/config.json"), "utf8")); return { kind: "list", root: dir, scope: [], canvases: [] }; }
    catch { return { kind: "error", message: "Cannot read config" }; }
  };
  if ("repo" in target) return existsSync(target.repo) ? read(target.repo) ?? { kind: "uninitialized" } : { kind: "cliError", reason: "missing" };
  for (let dir = target.cwd; ; dir = dirname(dir)) { const found = read(dir); if (found) return found; if (dir === "/") return { kind: "uninitialized" }; }
}
function deps(registered: string[] = [], init: (root: string) => ProjectInitResult = r => { mkdirSync(join(r, ".doan/canvases"), { recursive: true }); writeFileSync(join(r, ".doan/config.json"), "{\"v\":1}\n"); return { kind: "success" }; }) {
  const d = {
    ls: vi.fn(async (target: LsTarget) => cliLs(target)),
    registered: () => registered,
    add: vi.fn(async (path: string): Promise<string | null> => { if (!registered.includes(path)) registered.push(path); return path; }),
    initialize: vi.fn(async (r: string) => init(r)),
    remotes: vi.fn((r: string) => readGitRemotes(r, temp())),
  } satisfies ProjectDeps;
  return { deps: d, registered };
}

describe("planned changes", () => {
  it("name what doan init would create and nothing it would leave alone", async () => {
    const bare = temp();
    expect(await plannedChanges(bare, { kind: "uninitialized" })).toEqual([".doan/canvases/", ".doan/config.json", ".gitattributes"]);
    const partly = repo(temp(), { canvases: true, attributes: "*.png binary\r\n.doan/comments/*.jsonl merge=union\r\n.doan/** linguist-documentation\r\n" });
    expect(await plannedChanges(partly, { kind: "uninitialized" })).toEqual([".doan/config.json"]);
    expect(await plannedChanges(partly, { kind: "list", root: partly, scope: [], canvases: [] })).toEqual([]);
  });

  it("list .gitattributes until both attribute lines are there; a folder with a config gets nothing", async () => {
    const mergeOnly = repo(temp(), { canvases: true, attributes: "*.png binary\r\n.doan/comments/*.jsonl merge=union\r\n" });
    expect(await plannedChanges(mergeOnly, { kind: "uninitialized" })).toEqual([".doan/config.json", ".gitattributes"]);
    const both = repo(temp(), { canvases: true, attributes: ".doan/comments/*.jsonl merge=union\r\n.doan/** linguist-documentation\r\n" });
    expect(await plannedChanges(both, { kind: "uninitialized" })).toEqual([".doan/config.json"]);
    const setUp = repo(temp(), { canvases: true, config: "{\"v\":1}", attributes: ".doan/comments/*.jsonl merge=union\n" });
    expect(await plannedChanges(setUp, { kind: "list", root: setUp, scope: [], canvases: [] })).toEqual([]);
  });
});

describe("inspectPath", () => {
  it("answers the repo of a picked folder, set up or not", async () => {
    const ready = repo(temp(), { config: "{\"v\":1}" });
    mkdirSync(join(ready, "src"));
    expect(await inspectPath(join(ready, "src"), deps().deps)).toEqual({ ok: true, candidates: [{ path: ready, changes: [] }] });
    const fresh = repo(temp());
    expect(await inspectPath(fresh, deps().deps)).toEqual({ ok: true, candidates: [{ path: fresh, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }] });
  });

  it("offers the repos inside a parent folder and never the parent itself", async () => {
    const parent = temp();
    const a = repo(join(parent, "a"), { config: "{}" }), b = repo(join(parent, "b"));
    mkdirSync(join(parent, "notes"));
    const result = await inspectPath(parent, deps().deps);
    expect(result).toEqual({ ok: true, candidates: [{ path: a, changes: [] }, { path: b, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }] });
  });

  it("offers a plain folder itself, to be set up only on request", async () => {
    const plain = temp();
    expect(await inspectPath(plain, deps().deps)).toEqual({ ok: true, candidates: [{ path: plain, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }] });
  });

  it("keeps a broken config as a candidate with nothing planned over it", async () => {
    const broken = repo(temp(), { config: "{broken" });
    expect(await inspectPath(broken, deps().deps)).toEqual({ ok: true, candidates: [{ path: broken, changes: [] }] });
  });

  test.skipIf(root)("does not guess about a folder it cannot read", async () => {
    const parent = temp();
    chmodSync(parent, 0o000);
    expect(await inspectPath(parent, deps().deps)).toEqual({ ok: false, code: "project_unavailable" });
  });
});

describe("inspectPath for a GitHub URL", () => {
  const studio = { owner: "acme", repository: "studio" };

  it("offers a folder whose configured remote names the repository", async () => {
    const match = repo(temp(), { remote: "git@github.com:Acme/studio.git", config: "{}" });
    expect(await inspectPath(match, deps().deps, studio)).toEqual({ ok: true, candidates: [{ path: match, changes: [] }] });
  });

  it("refuses a folder of another repository or with no repository at all", async () => {
    const other = repo(temp(), { remote: "https://github.com/acme/other" });
    expect(await inspectPath(other, deps().deps, studio)).toEqual({ ok: false, code: "remote_mismatch" });
    expect(await inspectPath(temp(), deps().deps, studio)).toEqual({ ok: false, code: "remote_mismatch" });
  });

  it("keeps only the repos inside a parent folder that may be this one", async () => {
    const parent = temp();
    const match = repo(join(parent, "a"), { remote: "https://github.com/acme/studio.git" });
    repo(join(parent, "b"), { remote: "https://github.com/acme/other.git" });
    expect(await inspectPath(parent, deps().deps, studio)).toEqual({ ok: true, candidates: [{ path: match, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }] });
  });

  test.skipIf(root)("does not call a config it cannot read a mismatch", async () => {
    const locked = repo(temp(), { remote: "https://github.com/acme/other.git", config: "{}" });
    chmodSync(join(locked, ".git/config"), 0o000);
    try {
      expect(await inspectPath(locked, deps().deps, studio)).toEqual({ ok: true, candidates: [{ path: locked, changes: [] }] });
    } finally { chmodSync(join(locked, ".git/config"), 0o644); }
  });
});

describe("inspectUrl", () => {
  it("finds registered checkouts by their configured remotes, without running git", async () => {
    const https = repo(temp(), { remote: "https://x-token@github.com/Acme/Studio.git", config: "{}" });
    const ssh = repo(temp(), { remote: "git@github.com:acme/studio" });
    const other = repo(temp(), { remote: "git@github.com:acme/other.git" });
    const gone = join(temp(), "gone");
    const d = deps([https, ssh, other, gone]);
    expect(await inspectUrl({ owner: "acme", repository: "studio" }, d.deps)).toEqual([
      { path: https, changes: [] }, { path: ssh, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] },
    ]);
  });
});

describe("selectProject", () => {
  it("registers at selection and initializes only on request", async () => {
    const fresh = repo(temp());
    const d = deps();
    expect(await selectProject(fresh, true, null, d.deps)).toEqual({ ok: true, root: fresh });
    expect(d.deps.add).toHaveBeenCalledWith(fresh);
    expect(d.deps.initialize).toHaveBeenCalledWith(fresh);
    expect(d.registered).toEqual([fresh]);
    const other = repo(temp());
    const without = deps();
    expect(await selectProject(other, false, null, without.deps)).toEqual({ ok: false, code: "project_unavailable" });
    expect(without.deps.initialize).not.toHaveBeenCalled();
  });

  it("does not register a set-up project twice", async () => {
    const ready = repo(temp(), { config: "{}" });
    const d = deps([ready]);
    expect(await selectProject(ready, false, null, d.deps)).toEqual({ ok: true, root: ready });
    expect(d.registered).toEqual([ready]);
  });

  it("never writes over a broken config", async () => {
    const broken = repo(temp(), { config: "{broken" });
    const d = deps();
    expect(await selectProject(broken, true, null, d.deps)).toEqual({ ok: false, code: "config_invalid" });
    expect(d.deps.initialize).not.toHaveBeenCalled();
    expect(readFileSync(join(broken, ".doan/config.json"), "utf8")).toBe("{broken");
  });

  it("refuses a folder that disappeared or now belongs to another repository", async () => {
    const gone = repo(temp());
    rmSync(gone, { recursive: true });
    expect(await selectProject(gone, true, null, deps().deps)).toEqual({ ok: false, code: "project_unavailable" });
    const moved = repo(temp(), { remote: "git@github.com:acme/other.git" });
    const d = deps();
    expect(await selectProject(moved, true, { owner: "acme", repository: "studio" }, d.deps)).toEqual({ ok: false, code: "remote_mismatch" });
    expect(d.deps.add).not.toHaveBeenCalled();
  });

  it("reports a failed setup and a store that took nothing", async () => {
    const fresh = repo(temp());
    expect(await selectProject(fresh, true, null, deps([], () => ({ kind: "error", message: "m", guidance: "g" })).deps)).toEqual({ ok: false, code: "init_failed" });
    const d = deps();
    d.deps.add.mockResolvedValueOnce(null);
    expect(await selectProject(repo(temp()), true, null, d.deps)).toEqual({ ok: false, code: "project_unavailable" });
  });

  it("sets up a new clone the same way", async () => {
    const cloned = repo(temp());
    const d = deps();
    expect(await registerClone(cloned, d.deps)).toEqual({ ok: true, root: cloned });
    expect(d.deps.initialize).toHaveBeenCalledWith(cloned);
  });
});

describe("confirmProject", () => {
  it("only reads: a set-up, registered root at its canonical path", async () => {
    const ready = repo(temp(), { config: "{}" });
    const d = deps([ready]);
    expect(await confirmProject(ready, d.deps)).toEqual({ ok: true, root: ready });
    expect(await confirmProject(ready, deps([]).deps)).toEqual({ ok: false, code: "project_unavailable" });
    expect(d.deps.add).not.toHaveBeenCalled();
    expect(d.deps.initialize).not.toHaveBeenCalled();
  });
});

describe("paths", () => {
  it("canonicalize folders and judge a clone destination", async () => {
    const dir = temp();
    expect(await canonicalFolder(join(dir, ".", "")) ).toBe(dir);
    expect(await canonicalFolder(join(dir, "missing"))).toBeNull();
    expect(await destinationState(join(dir, "new"))).toBe("absent");
    expect(await destinationState(dir)).toBe("exists");
    expect(await destinationState(join(dir, "missing", "new"))).toBe("no_parent");
  });
});

describe("cloneProject", () => {
  const ok = { git: "/usr/bin/git", env: { PATH: "/usr/bin" } };
  it("reports missing git without trying to clone", async () => {
    const run = vi.fn();
    expect(await cloneProject("https://github.com/acme/studio", "/tmp/x", new AbortController().signal, { ...deps().deps, git: async () => null, run })).toEqual({ ok: false, code: "git_missing" });
    expect(run).not.toHaveBeenCalled();
  });
  it("registers and sets up a finished clone, and passes failures and cancels through", async () => {
    const destination = repo(temp());
    const d = deps();
    expect(await cloneProject("u", destination, new AbortController().signal, { ...d.deps, git: async () => ok, run: async () => ({ kind: "cloned", destination }) })).toEqual({ ok: true, root: destination });
    expect(d.registered).toEqual([destination]);
    expect(d.deps.initialize).toHaveBeenCalledWith(destination);
    expect(await cloneProject("u", "/tmp/y", new AbortController().signal, { ...deps().deps, git: async () => ok, run: async () => ({ kind: "failed", code: "repository_unreachable" }) })).toEqual({ ok: false, code: "repository_unreachable" });
    expect(await cloneProject("u", "/tmp/y", new AbortController().signal, { ...deps().deps, git: async () => ok, run: async () => ({ kind: "cancelled" }) })).toEqual({ ok: false, cancelled: true });
    expect(await cloneProject("u", "/tmp/y", new AbortController().signal, { ...deps().deps, git: async () => ok, run: async () => ({ kind: "failed", code: "cleanup_failed", leftovers: ["/tmp/.y.doan-clone-1"] }) })).toEqual({ ok: false, code: "cleanup_failed", leftovers: ["/tmp/.y.doan-clone-1"] });
  });

  it("hands the commit to the clone and registers only what it published", async () => {
    const destination = repo(temp());
    const d = deps();
    const commit = vi.fn(() => true);
    const run = vi.fn(async (request: { commit?: () => boolean }) => { expect(request.commit).toBe(commit); return { kind: "cloned" as const, destination }; });
    expect(await cloneProject("u", destination, new AbortController().signal, { ...d.deps, git: async () => ok, run }, commit)).toEqual({ ok: true, root: destination });
  });
});

describe("cloneDestination", () => {
  it("refuses a destination that would land inside a set-up project", async () => {
    const ready = repo(temp(), { config: "{}" });
    expect(await cloneDestination(join(ready, "vendor"), deps().deps)).toEqual({ state: "inside_project" });
    const parent = temp();
    expect(await cloneDestination(join(parent, "studio"), deps().deps)).toEqual({ state: "absent", path: join(parent, "studio") });
    expect(await cloneDestination(ready, deps().deps)).toEqual({ state: "exists" });
  });

  it("names the destination by its canonical parent, so a symlinked parent registers the clone it made", async () => {
    const real = temp(), alias = join(temp(), "alias");
    symlinkSync(real, alias);
    expect(await cloneDestination(join(alias, "studio"), deps().deps)).toEqual({ state: "absent", path: join(real, "studio") });
    const cloned = repo(join(real, "studio"));
    const d = deps();
    expect(await registerClone(join(real, "studio"), d.deps)).toEqual({ ok: true, root: cloned });
  });

  it("still refuses a clone that registration read as another project", async () => {
    const parent = repo(temp(), { config: "{}" });
    const cloned = repo(join(parent, "inner"));
    const d = deps();
    d.deps.add.mockResolvedValueOnce(parent);
    expect(await registerClone(cloned, d.deps)).toEqual({ ok: false, code: "project_unavailable" });
  });
});

describe("leftoverPresent", () => {
  it("counts a leftover gone only when it is confirmed absent", async () => {
    const parent = temp(), left = join(parent, ".studio.doan-clone-x");
    expect(await leftoverPresent(left)).toBe(false);
    mkdirSync(left);
    expect(await leftoverPresent(left)).toBe(true);
  });
  test.skipIf(root)("keeps a leftover it cannot look at", async () => {
    const parent = temp(), left = join(parent, ".studio.doan-clone-x");
    mkdirSync(left);
    chmodSync(parent, 0o000);
    expect(await leftoverPresent(left)).toBe(true);
  });
});
