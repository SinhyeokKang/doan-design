import { expect, it } from "vitest";
import type { CanvasRow } from "../main/view";
import { sortedCanvases } from "./canvasOrder";
import { sidebarGroups } from "./sidebarGroups";

const row = (path: string, mtimeMs?: number): CanvasRow => ({ path, url: path, ...(mtimeMs === undefined ? {} : { mtimeMs }) });
const paths = (rows: CanvasRow[]) => rows.map(item => item.path.split("/").at(-1));

it("lists the newest modified canvas first", () => {
  expect(paths(sortedCanvases([row(".doan/canvases/a.html", 1), row(".doan/canvases/b.html", 3), row(".doan/canvases/c.html", 2)]))).toEqual(["b.html", "c.html", "a.html"]);
});
it("puts canvases without an mtime after those with one", () => {
  expect(paths(sortedCanvases([row(".doan/canvases/a.html"), row(".doan/canvases/b.html", 0), row(".doan/canvases/c.html", 5)]))).toEqual(["c.html", "b.html", "a.html"]);
});
it("breaks ties by natural file stem, then path, and does not mutate the input", () => {
  const input = [row(".doan/canvases/page10.html", 1), row(".doan/canvases/page2.html", 1), row(".doan/canvases/x/page2.html", 1), row(".doan/canvases/m.html")];
  const before = [...input];
  expect(sortedCanvases(input).map(item => item.path)).toEqual([".doan/canvases/page2.html", ".doan/canvases/x/page2.html", ".doan/canvases/page10.html", ".doan/canvases/m.html"]);
  expect(input).toEqual(before);
});
it("orders both groups the same way", () => {
  const groups = sidebarGroups(sortedCanvases([row(".doan/ds/a.html", 1), row(".doan/ds/b.html", 2), row(".doan/canvases/c.html", 1), row(".doan/canvases/d.html", 2)]));
  expect(groups.map(group => paths(group.rows as CanvasRow[]))).toEqual([["b.html", "a.html"], ["d.html", "c.html"]]);
});
