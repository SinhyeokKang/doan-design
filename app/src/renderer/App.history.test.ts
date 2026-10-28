import { expect, it } from "vitest";
import { validHistoryVisit } from "./App";
import { historyTarget } from "./shellNavigation";
import type { FolderEntry } from "../main/view";

it("skips a deleted worktree in App history and disables navigation without a surviving target", () => {
  const entries: FolderEntry[] = [{ path: "/a", kind: "list", servedRev: 0, canvases: [] }, { path: "/b", kind: "notFound" }, { path: "/c", kind: "list", servedRev: 0, canvases: [] }];
  const history = { visits: [{ root: "/a" }, { root: "/b" }, { root: "/c" }], cursor: 2 };
  expect(historyTarget(history, -1, visit => validHistoryVisit(entries, visit))).toBe(0);
  expect(historyTarget(history, -1, visit => validHistoryVisit(entries.slice(1), visit))).toBeNull();
  expect(historyTarget({ ...history, cursor: 0 }, 1, visit => validHistoryVisit(entries, visit))).toBe(2);
});
it("retains transient unavailable roots instead of treating them as deleted", () => {
  for (const entry of [{ path: "/b", kind: "loading" }, { path: "/b", kind: "error", message: "bad config" }, { path: "/b", kind: "cliError", reason: "offline" }] as FolderEntry[]) {
    expect(validHistoryVisit([entry], { root: "/b", canvas: ".doan/canvases/a.html" })).toBe(true);
  }
});
