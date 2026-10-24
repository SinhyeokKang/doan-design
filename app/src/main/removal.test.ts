import { expect, test } from "vitest";
import { removalLabel } from "./removal";
import type { FolderEntry, GitInfo } from "./view";

function row(path: string, git?: GitInfo): FolderEntry {
  return { path, kind: "list", canvases: [], servedRev: 0, ...(git ? { git } : {}) };
}

const common = "/code/app/.git";

test("a row is named by its repo and branch", () => {
  expect(removalLabel([row("/code/app", { common, main: "/code/app", branch: "main", worktrees: [] })])).toBe("app (main)");
  expect(removalLabel([row("/code/app-wt", { common, main: "/code/app", branch: "fix", worktrees: [] })])).toBe("app (fix)");
  expect(removalLabel([row("/code/app-wt", { common, main: "/code/app", detached: "0123456789abcdef0123456789abcdef01234567", worktrees: [] })])).toBe("app (detached 0123456)");
});

test("a row without git is named by its folder", () => {
  expect(removalLabel([row("/code/plain")])).toBe("plain");
  expect(removalLabel([{ path: "/code/gone", kind: "notFound" }])).toBe("gone");
  // No main worktree (bare, submodule): the row's own folder names it.
  expect(removalLabel([row("/code/sub", { common: "/x/modules/sub", branch: "main", worktrees: [] })])).toBe("sub (main)");
});

test("a card is named by its repo and the number of other worktrees", () => {
  const main = row("/code/app", { common, main: "/code/app", branch: "main", worktrees: [] });
  const wt = row("/code/app-fix", { common, main: "/code/app", branch: "fix", worktrees: [] });
  const gone: FolderEntry = { path: "/code/app-old", kind: "notFound" };
  expect(removalLabel([wt, main, gone])).toBe("app and 2 worktrees");
  expect(removalLabel([gone, wt])).toBe("app and 1 worktree");
  expect(removalLabel([gone, { path: "/code/app-x", kind: "error", message: "bad" }])).toBe("app-old and 1 worktree");
});
