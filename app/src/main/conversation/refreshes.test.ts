import { describe, expect, it } from "vitest";
import { folderRefreshes } from "./refreshes";

// buzz-conversation fix round 1 (RA2 ⚪1): which folder listings main hands to ConversationService.refreshed.
describe("folderRefreshes", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" };
  it("hands a first-seen folder over with no changed rows and skips other kinds", () => {
    const { calls, next } = folderRefreshes(new Map(), [{ path: "/repo", kind: "list", canvases: [{ ...a, rev: 2 }] }, { path: "/other", kind: "loading" }]);
    expect(calls).toEqual([{ root: "/repo", changed: [] }]);
    expect([...next.keys()]).toEqual(["/repo"]);
  });
  it("names the rows whose rev moved in a re-read listing", () => {
    const before = [{ ...a, rev: 1 }, b];
    const { next } = folderRefreshes(new Map(), [{ path: "/repo", kind: "list", canvases: before }]);
    const { calls } = folderRefreshes(next, [{ path: "/repo", kind: "list", canvases: [{ ...a, rev: 2 }, { ...b, rev: 1 }] }]);
    expect(calls).toEqual([{ root: "/repo", changed: [a.path, b.path] }]);
  });
  it("skips a served-only refresh, which keeps the same rows", () => {
    const rows = [{ ...a, rev: 1 }];
    const { next } = folderRefreshes(new Map(), [{ path: "/repo", kind: "list", canvases: rows }]);
    expect(folderRefreshes(next, [{ path: "/repo", kind: "list", canvases: rows }]).calls).toEqual([]);
  });
  it("names a canvas moved under its ID by its new path", () => {
    const { next } = folderRefreshes(new Map(), [{ path: "/repo", kind: "list", canvases: [{ ...a, rev: 1 }] }]);
    const moved = { path: ".doan/canvases/renamed.html", id: "a", rev: 1 };
    expect(folderRefreshes(next, [{ path: "/repo", kind: "list", canvases: [moved] }]).calls).toEqual([{ root: "/repo", changed: [moved.path] }]);
  });
});
