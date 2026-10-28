import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import type { LsTarget } from "../cli";
import type { FolderState } from "../folderState";
import type { ProjectInitResult } from "../shell";
import { readGitRemotes } from "./gitConfig";
import { canonicalFolder, confirmProject, destinationState, inspectPath, inspectUrl, plannedChanges, registerClone, selectProject, type ProjectDeps } from "./projects";

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
    add: vi.fn(async (path: string) => { if (!registered.includes(path)) registered.push(path); return path; }),
    initialize: vi.fn(async (r: string) => init(r)),
    remotes: vi.fn((r: string) => readGitRemotes(r, temp())),
  } satisfies ProjectDeps;
  return { deps: d, registered };
}

describe("planned changes", () => {
  it("name what doan init would create and nothing it would leave alone", async () => {
    const bare = temp();
    expect(await plannedChanges(bare, { kind: "uninitialized" })).toEqual([".doan/canvases/", ".doan/config.json", ".gitattributes"]);
    const partly = repo(temp(), { canvases: true, attributes: "*.png binary\r\n.doan/comments/*.jsonl merge=union\r\n" });
    expect(await plannedChanges(partly, { kind: "uninitialized" })).toEqual([".doan/config.json"]);
    expect(await plannedChanges(partly, { kind: "list", root: partly, scope: [], canvases: [] })).toEqual([]);
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
