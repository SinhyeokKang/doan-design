import { describe, expect, test } from "vitest";
import { autoAfterAdd, autoRegisterRoot, pruneAuto, storedAuto } from "./autoFolders";
import type { FolderState } from "./folderState";

const MAIN = "/code/app";
const W = "/orca/workspaces/app/w1";
const git = (worktrees: string[]) => ({ common: "/code/app/.git", main: MAIN, branch: "w1", worktrees });
const listed = (root: string, worktrees?: string[]): FolderState =>
  ({ kind: "list", root, scope: [], canvases: [], ...(worktrees ? { git: git(worktrees) } : {}) });

describe("autoRegisterRoot", () => {
  test("a worktree of a registered root's repository is registered", () => {
    expect(autoRegisterRoot(listed(W, [MAIN, W]), { root: W }, [MAIN])).toBe(true);
  });

  test("any registered root among the worktrees is enough", () => {
    expect(autoRegisterRoot(listed(W, [MAIN, "/orca/workspaces/app/w0", W]), { root: W }, ["/other", "/orca/workspaces/app/w0"])).toBe(true);
  });

  // Same checkout, another doan root (a monorepo package): its worktrees list holds no registered root.
  test("another doan root of the same checkout is refused", () => {
    const pkg = `${MAIN}/packages/web`;
    expect(autoRegisterRoot(listed(pkg, [pkg, `${W}/packages/web`]), { root: pkg }, [MAIN])).toBe(false);
  });

  test("another repository is refused", () => {
    expect(autoRegisterRoot(listed("/code/other", ["/code/other"]), { root: "/code/other" }, [MAIN])).toBe(false);
  });

  test("a root without git metadata is refused", () => {
    expect(autoRegisterRoot(listed(W), { root: W }, [MAIN])).toBe(false);
  });

  test.each<FolderState>([
    { kind: "uninitialized" },
    { kind: "error", message: "Cannot read config" },
    { kind: "cliError", reason: "timed out after 10 s" },
  ])("a root that is not a list is refused: $kind", (view) => {
    expect(autoRegisterRoot(view, { root: W }, [MAIN])).toBe(false);
  });

  // The app never re-derives a root (POSTMORTEM 2026-10-22): a symlink alias or a subfolder is not stored.
  test.each([`${W}/.doan`, "/tmp/alias-of-w1"])("a request root the listing does not report as its root is refused: %s", (root) => {
    expect(autoRegisterRoot(listed(W, [MAIN, W]), { root }, [MAIN])).toBe(false);
  });

  test("an already registered root is not registered again", () => {
    expect(autoRegisterRoot(listed(W, [MAIN, W]), { root: W }, [MAIN, W])).toBe(false);
  });

  test("nothing registered refuses", () => {
    expect(autoRegisterRoot(listed(W, [MAIN, W]), { root: W }, [])).toBe(false);
  });
});

describe("pruneAuto", () => {
  test("only a vanished auto-registered root leaves the list", () => {
    const missing = new Map([[W, "ENOENT"], [MAIN, "ENOENT"]]);
    expect(pruneAuto([MAIN, W], [W], missing)).toEqual([MAIN]);
  });

  test("a hand-added root stays even when it vanished", () => {
    expect(pruneAuto([MAIN, W], [], new Map([[MAIN, "ENOENT"]]))).toEqual([MAIN, W]);
  });

  test("ENOTDIR counts as vanished", () => {
    expect(pruneAuto([MAIN, W], [W], new Map([[W, "ENOTDIR"]]))).toEqual([MAIN]);
  });

  // The folder may still be there: an unreadable root is hidden, never removed (spec decision 2).
  test.each(["EACCES", "EIO", undefined])("a root that could not be checked stays: %s", (code) => {
    expect(pruneAuto([MAIN, W], [W], new Map([[W, code]]))).toEqual([MAIN, W]);
  });

  test("the list order is kept", () => {
    const w2 = "/orca/workspaces/app/w2";
    expect(pruneAuto([W, MAIN, w2], [W, w2], new Map([[W, "ENOENT"]]))).toEqual([MAIN, w2]);
  });
});

describe("autoAfterAdd", () => {
  test("adding a root by hand clears its mark", () => {
    expect(autoAfterAdd([W, "/w2"], W)).toEqual(["/w2"]);
  });

  // `duplicate` and `existing` reach here too: the root is already stored and becomes hand-added.
  test("a root without a mark leaves the marks as they are", () => {
    expect(autoAfterAdd([W], MAIN)).toEqual([W]);
  });
});

describe("storedAuto", () => {
  test("marks of roots not in folders.json are dropped", () => {
    expect(storedAuto([W, "/gone"], [MAIN, W])).toEqual([W]);
  });

  // POSTMORTEM 2026-10-26: an unreadable folders.json is no ground for deleting anything.
  test("an unreadable folders.json keeps every mark", () => {
    expect(storedAuto([W, "/gone"], null)).toEqual([W, "/gone"]);
  });
});
