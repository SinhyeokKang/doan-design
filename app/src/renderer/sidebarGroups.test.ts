import { expect, it } from "vitest";
import type { CanvasRow } from "../main/view";
import { countDescription, groupToOpen, headArrow, openGroup, sidebarGroups, toggleGroup, visibleItems } from "./sidebarGroups";

const row = (path: string): CanvasRow => ({ path, url: path });
const rows = [row(".doan/canvases/b.html"), row(".doan/ds/color.html"), row(".doan/canvases/a.html"), row(".doan/ds/button.html")];

it("splits rows into Design system first, then Canvases, keeping each group's given order and count", () => {
  const groups = sidebarGroups(rows);
  expect(groups.map(group => [group.id, group.label, group.open, group.rows.map(item => item.path)])).toEqual([
    ["ds", "Design system", true, [".doan/ds/color.html", ".doan/ds/button.html"]],
    ["canvases", "Canvases", true, [".doan/canvases/b.html", ".doan/canvases/a.html"]],
  ]);
});

it("keeps both groups when one or both are empty, each with its own empty line", () => {
  expect(sidebarGroups([row(".doan/canvases/a.html")]).map(group => [group.id, group.rows.length, group.empty])).toEqual([["ds", 0, "No design system yet"], ["canvases", 1, "No canvases yet"]]);
  expect(sidebarGroups([row(".doan/ds/a.html")]).map(group => [group.id, group.rows.length])).toEqual([["ds", 1], ["canvases", 0]]);
  expect(sidebarGroups([]).map(group => [group.id, group.rows.length])).toEqual([["ds", 0], ["canvases", 0]]);
});

it("judges the group by directory, not by a look-alike name", () => {
  const groups = sidebarGroups([row(".doan/canvases/ds/a.html"), row(".doan/ds/sub/a.html")]);
  expect(groups[0]!.rows.map(item => item.path)).toEqual([".doan/ds/sub/a.html"]);
  expect(groups[1]!.rows.map(item => item.path)).toEqual([".doan/canvases/ds/a.html"]);
});

it("reads only stored closed flags; a missing entry is open", () => {
  expect(sidebarGroups(rows, { ds: false }).map(group => group.open)).toEqual([false, true]);
  expect(sidebarGroups(rows, { canvases: false }).map(group => group.open)).toEqual([true, false]);
  expect(sidebarGroups(rows, {}).map(group => group.open)).toEqual([true, true]);
});

it("lists visible rows as heads plus the rows of open groups, the list keyboard moves and slots share", () => {
  const items = (closed?: { ds?: false; canvases?: false }) => visibleItems(sidebarGroups(rows, closed)).map(item => item.kind === "head" ? `head:${item.group.id}` : item.row.path);
  expect(items()).toEqual(["head:ds", ".doan/ds/color.html", ".doan/ds/button.html", "head:canvases", ".doan/canvases/b.html", ".doan/canvases/a.html"]);
  expect(items({ ds: false })).toEqual(["head:ds", "head:canvases", ".doan/canvases/b.html", ".doan/canvases/a.html"]);
  expect(items({ ds: false, canvases: false })).toEqual(["head:ds", "head:canvases"]);
  expect(visibleItems(sidebarGroups([])).map(item => item.kind)).toEqual(["head", "head"]);
});

it("follows the APG tree keys on a group head", () => {
  const [ds, canvases] = sidebarGroups(rows, { ds: false });
  // → opens a closed group, then moves to its first row; ← closes an open group, then moves to the project row.
  expect(headArrow(ds!, "ArrowRight")).toBe("toggle");
  expect(headArrow(canvases!, "ArrowRight")).toBe("firstRow");
  expect(headArrow(canvases!, "ArrowLeft")).toBe("toggle");
  expect(headArrow(ds!, "ArrowLeft")).toBe("project");
  // An open empty group has nowhere to go on →.
  const [empty] = sidebarGroups([]);
  expect(headArrow(empty!, "ArrowRight")).toBeNull();
  expect(headArrow(empty!, "ArrowLeft")).toBe("toggle");
});

it("opens the group of a newly shown canvas, and nothing while the same canvas stays shown", () => {
  expect(groupToOpen(null, { root: "/a", path: ".doan/ds/color.html" })).toBe("ds");
  expect(groupToOpen({ root: "/a", path: ".doan/ds/color.html" }, { root: "/a", path: ".doan/ds/color.html" })).toBeNull();
  // Moved between directories under the same id: a new path, so its new group opens.
  expect(groupToOpen({ root: "/a", path: ".doan/canvases/color.html" }, { root: "/a", path: ".doan/ds/color.html" })).toBe("ds");
  expect(groupToOpen({ root: "/a", path: ".doan/ds/color.html" }, { root: "/b", path: ".doan/ds/color.html" })).toBe("ds");
  expect(groupToOpen({ root: "/a", path: ".doan/ds/color.html" }, { root: "/a", path: ".doan/canvases/x.html" })).toBe("canvases");
  expect(groupToOpen({ root: "/a", path: ".doan/ds/color.html" }, null)).toBeNull();
});

it("stores only closed groups under fixed ids and drops the field when every group is open", () => {
  expect(toggleGroup(undefined, "ds")).toEqual({ ds: false });
  expect(toggleGroup({ ds: false }, "canvases")).toEqual({ ds: false, canvases: false });
  expect(toggleGroup({ ds: false }, "ds")).toBeUndefined();
  expect(toggleGroup({ ds: false, canvases: false }, "ds")).toEqual({ canvases: false });
  expect(openGroup({ ds: false, canvases: false }, "canvases")).toEqual({ ds: false });
  expect(openGroup({ ds: false }, "ds")).toBeUndefined();
  expect(openGroup(undefined, "ds")).toBeUndefined();
});

it("describes a head's count as canvases, singular for one", () => {
  expect(countDescription(0)).toBe("0 canvases");
  expect(countDescription(1)).toBe("1 canvas");
  expect(countDescription(5)).toBe("5 canvases");
});
