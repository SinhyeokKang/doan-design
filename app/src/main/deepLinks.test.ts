import { expect, test, vi } from "vitest";
import cases from "../../../schema/fixtures/open-link/cases.json";
import { parseOpenLink, openLinkQueue, resolveOpenLink } from "./deepLinks";

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
