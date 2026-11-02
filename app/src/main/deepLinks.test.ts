import { expect, test, vi } from "vitest";
import cases from "../../../schema/fixtures/open-link/cases.json";
import { parseOpenLink, openLinkQueue, resolveOpenLink, resolveOpenTarget } from "./deepLinks";

for (const item of cases.build) test(`reads shared link: ${item.name}`, () => {
  expect(parseOpenLink(item.expected)).toEqual({ root: item.root, canvas: item.path, ...("frame" in item ? { frame: item.frame } : {}) });
});
for (const item of cases.refuse) test(`refuses shared link: ${item.name}`, () => {
  expect(parseOpenLink(item.url)).toBeNull();
});
test("waits for readiness, keeping only the latest startup URL and consuming it once", () => {
  const deliver = vi.fn(), queue = openLinkQueue(deliver);
  queue.receive("first"); queue.receive("last");
  expect(deliver).not.toHaveBeenCalled();
  queue.ready(); queue.ready();
  expect(deliver.mock.calls).toEqual([["last"]]);
  queue.receive("next");
  expect(deliver.mock.calls).toEqual([["last"], ["next"]]);
});
test("navigation requires an exact registered root and listed canvas", () => {
  const url = cases.build[0]!.expected, root = cases.build[0]!.root, canvas = cases.build[0]!.path;
  expect(resolveOpenLink("bad", [])).toEqual({ kind: "malformed" });
  expect(resolveOpenLink(url, [{ path: `${root}/`, kind: "list", canvases: [{ path: canvas }] }])).toEqual({ kind: "unregistered-root" });
  expect(resolveOpenLink(url, [{ path: root, kind: "list", canvases: [] }])).toEqual({ kind: "canvas-not-listed", project: "repo" });
  expect(resolveOpenLink(url, [{ path: root, kind: "list", canvases: [{ path: canvas }] }])).toEqual({ kind: "navigate", root, canvas });
});
// The shared rules `doan open` uses too: the same root and list checks, but a root still being read is its own answer.
test("an open target needs an exact registered root and a listed canvas, and a loading root is not a list refusal", () => {
  const root = "/w/repo", canvas = ".doan/canvases/a.html", link = { root, canvas, frame: "hero" };
  expect(resolveOpenTarget(link, [])).toEqual({ kind: "unregistered-root" });
  expect(resolveOpenTarget(link, [{ path: `${root}/`, kind: "list", canvases: [{ path: canvas }] }])).toEqual({ kind: "unregistered-root" });
  expect(resolveOpenTarget(link, [{ path: root, kind: "list", canvases: [{ path: canvas }] }])).toEqual({ kind: "listed", root, canvas, frame: "hero" });
  expect(resolveOpenTarget({ root, canvas }, [{ path: root, kind: "list", canvases: [{ path: canvas }] }])).toEqual({ kind: "listed", root, canvas });
  expect(resolveOpenTarget(link, [{ path: root, kind: "list", canvases: [{ path: ".doan/canvases/b.html" }] }])).toEqual({ kind: "canvas-not-listed", project: "repo" });
  expect(resolveOpenTarget(link, [{ path: root, kind: "loading" }])).toEqual({ kind: "loading", project: "repo" });
  for (const kind of ["uninitialized", "error", "cliError", "notFound"]) expect(resolveOpenTarget(link, [{ path: root, kind }])).toEqual({ kind: "canvas-not-listed", project: "repo" });
});
test("an open target names a worktree's project by its main checkout, as the sidebar card does", () => {
  const link = { root: "/w/repo-wt", canvas: ".doan/canvases/a.html" };
  const git = { common: "/w/repo/.git", main: "/w/repo" };
  expect(resolveOpenTarget(link, [{ path: "/w/repo-wt", kind: "list", canvases: [], git }])).toEqual({ kind: "canvas-not-listed", project: "repo" });
  expect(resolveOpenTarget(link, [{ path: "/w/repo-wt", kind: "loading", lastCommon: "/w/repo/.git" }, { path: "/w/repo", kind: "list", canvases: [], git }])).toEqual({ kind: "loading", project: "repo" });
});
test("a link to a root being read again is still refused as unlisted, as before the split", () => {
  const url = cases.build[0]!.expected, root = cases.build[0]!.root;
  expect(resolveOpenLink(url, [{ path: root, kind: "loading" }])).toEqual({ kind: "canvas-not-listed", project: "repo" });
});
