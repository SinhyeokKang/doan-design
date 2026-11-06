import { describe, expect, test } from "vitest";
import { groupRoots, projectKeepsLocal, storageFacts } from "./storage";
import type { FolderEntry } from "./view";

const list = (path: string, git: { common: string; worktrees: string[] } | null, storage?: "repo" | "local" | "unknown"): FolderEntry =>
  ({ path, kind: "list", canvases: [], servedRev: 0, ...(git ? { git } : {}), ...(storage ? { storage } : {}) });

describe("storage facts", () => {
  test("keep the CLI's mode and reason, and drop what an older or foreign CLI sent", () => {
    expect(storageFacts({ storage: "local" })).toEqual({ storage: "local" });
    expect(storageFacts({ storage: "repo", storageReason: "not_git" })).toEqual({ storage: "repo", storageReason: "not_git" });
    expect(storageFacts({ storage: "unknown", storageReason: "git_unreadable" })).toEqual({ storage: "unknown", storageReason: "git_unreadable" });
    expect(storageFacts({})).toEqual({});
    expect(storageFacts({ storage: "elsewhere", storageReason: "not_git" })).toEqual({});
    expect(storageFacts({ storage: "repo", storageReason: "nope" })).toEqual({ storage: "repo" });
  });
});

describe("a folder not set up takes its project's mode", () => {
  const git = { common: "/code/studio/.git", worktrees: ["/code/studio", "/code/studio-x"] };
  test("from a listed worktree of the same Doan root that keeps its files out of Git", () => {
    const entries = [list("/code/studio", git, "local"), { path: "/code/studio-x", kind: "uninitialized" } as FolderEntry];
    expect(projectKeepsLocal(entries, "/code/studio-x")).toBe(true);
    expect(projectKeepsLocal(entries, "/code/other")).toBe(false);
  });
  test("never from a repo, unknown or unlisted root, nor from itself", () => {
    expect(projectKeepsLocal([list("/code/studio", git, "repo")], "/code/studio-x")).toBe(false);
    expect(projectKeepsLocal([list("/code/studio", git, "unknown")], "/code/studio-x")).toBe(false);
    expect(projectKeepsLocal([list("/code/studio", null, "local")], "/code/studio-x")).toBe(false);
    expect(projectKeepsLocal([{ path: "/code/studio", kind: "loading", lastCommon: git.common }], "/code/studio-x")).toBe(false);
    expect(projectKeepsLocal([list("/code/studio", git, "local")], "/code/studio")).toBe(false);
  });
});

describe("group roots", () => {
  const git = { common: "/code/studio/.git", worktrees: ["/code/studio", "/code/studio-x", "/code/studio-y"] };
  const entries: FolderEntry[] = [
    list("/code/studio", git, "local"),
    list("/code/studio-x", git, "local"),
    // Not set up: not a list, so no git of its own; another root names it.
    { path: "/code/studio-y", kind: "uninitialized" },
    // Seen before as part of the group, now failing.
    { path: "/code/studio-z", kind: "error", message: "m", lastCommon: git.common },
    list("/code/other", { common: "/code/other/.git", worktrees: ["/code/other"] }, "repo"),
    list("/notes", null, "repo"),
  ];
  test("are every stored worktree of the root's project", () => {
    expect(groupRoots(entries, "/code/studio-x")).toEqual(["/code/studio", "/code/studio-x", "/code/studio-y", "/code/studio-z"]);
    expect(groupRoots(entries, "/code/studio-y")).toEqual(["/code/studio", "/code/studio-x", "/code/studio-y"]);
  });
  test("are only the root itself outside Git or when it is not stored", () => {
    expect(groupRoots(entries, "/notes")).toEqual(["/notes"]);
    expect(groupRoots(entries, "/gone")).toEqual([]);
  });
});
