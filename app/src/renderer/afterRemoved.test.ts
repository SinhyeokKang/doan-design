import { expect, test } from "vitest";
import type { ShellProject } from "../restore/uiState";
import { afterRemoved, type RemovedState } from "./afterRemoved";

// What the window forgets about roots that left the list, whether its own Remove from Doan took them out or
// `doan remove` did (folders:removed): one transformation, so both leave the same state.

const app: ShellProject = { roots: ["/w/app", "/w/app-fix"], expanded: true, selectedRoot: "/w/app-fix", selectedAt: 5, groups: { ds: false } };
const other: ShellProject = { roots: ["/w/other"], expanded: false, collapsed: true };
const state = (): RemovedState => ({
  shellProjects: { app, other },
  expanded: { "/w/app": [".doan/canvases"], "/w/app-fix": [], "/w/other": [".doan/ds"] },
  history: { visits: [{ root: "/w/other" }, { root: "/w/app", canvas: ".doan/canvases/a.html" }, { root: "/w/app-fix" }, { root: "/w/other", canvas: ".doan/ds/c.html" }], cursor: 2 },
});

test("a removed group leaves the sidebar projects, the expanded folders and the history", () => {
  const before = state();
  const next = afterRemoved(before, ["/w/app", "/w/app-fix"]);
  expect(next.shellProjects).toEqual({ other });
  expect(next.shellProjects.other).toBe(other);
  expect(next.expanded).toEqual({ "/w/other": [".doan/ds"] });
  // The cursor stays on the last visit at or before it that is left.
  expect(next.history).toEqual({ visits: [{ root: "/w/other" }, { root: "/w/other", canvas: ".doan/ds/c.html" }], cursor: 0 });
});

test("a project losing some roots keeps its other roots, and its selection only while that root is left", () => {
  const next = afterRemoved(state(), ["/w/app-fix"]);
  expect(next.shellProjects.app).toEqual({ roots: ["/w/app"], expanded: true, groups: { ds: false } });
  const kept = afterRemoved(state(), ["/w/app"]);
  expect(kept.shellProjects.app).toEqual({ roots: ["/w/app-fix"], expanded: true, selectedRoot: "/w/app-fix", selectedAt: 5, groups: { ds: false } });
});

test("roots the state no longer holds change nothing: every part keeps its identity", () => {
  const once = afterRemoved(state(), ["/w/app", "/w/app-fix"]);
  const twice = afterRemoved(once, ["/w/app", "/w/app-fix"]);
  expect(twice).toBe(once);
  const before = state();
  expect(afterRemoved(before, ["/w/nowhere"])).toBe(before);
  expect(afterRemoved(before, [])).toBe(before);
});

test("an empty history stays empty", () => {
  const empty: RemovedState = { shellProjects: {}, expanded: {}, history: { visits: [], cursor: -1 } };
  expect(afterRemoved(empty, ["/w/app"])).toBe(empty);
});
