import { describe, expect, it } from "vitest";
import { commitVisit, emptyHistory, historyTarget, loadedProjectRow, projectsTab, projectExpanded, projectHue, projectInitial, reconcileProjects, selectProjectRoot } from "./shellNavigation";
import { parseUiState } from "../restore/uiState";

describe("shell navigation", () => {
  it("hashes trimmed Unicode code points deterministically into eight colors", () => {
    expect(projectHue(" doan-design ")).toBe("indigo");
    expect(projectHue("malmoi")).toBe("indigo");
    for (const name of ["", " ", "한글", "😀", "x".repeat(10000)]) expect(projectHue(name)).toBe(projectHue(name.trim()));
    expect(projectHue("")).toBe("sky");
  });
  it("labels a thumbnail with the first code point of the trimmed name, upper-cased", () => {
    expect(projectInitial(" doan-design ")).toBe("D");
    expect(projectInitial("😀 smile")).toBe("😀");
    expect(projectInitial("ärger")).toBe("Ä");
    expect(projectInitial("한글")).toBe("한");
    expect(projectInitial("  ")).toBe("?");
  });
  it("forces only the viewed project open without changing saved intent", () => {
    expect(projectExpanded({ roots: ["a"], expanded: false }, "a")).toBe(true);
    expect(projectExpanded({ roots: ["a"], expanded: false }, "b")).toBe(false);
  });
  // project-row-disclosure: the loaded project folds by its chevron; the fold lives in memory only.
  it("keeps a hand-folded loaded project folded", () => {
    expect(projectExpanded({ roots: ["a"], expanded: false, collapsed: true }, "a")).toBe(false);
    expect(projectExpanded({ roots: ["a"], expanded: true, collapsed: true }, "b")).toBe(true);
    // A folder update reconciles the projects; it must not unfold the hand-folded one.
    expect(reconcileProjects({ p: { roots: ["a"], expanded: false, collapsed: true } }, [{ key: "p", roots: ["a", "b"] }]).p?.collapsed).toBe(true);
  });
  it("commits only a final destination and truncates forward history", () => {
    const a = { root: "a", canvas: ".doan/canvases/a.html" }, b = { root: "b" };
    const first = commitVisit(emptyHistory(), a);
    expect(commitVisit(first, a)).toBe(first);
    const second = commitVisit(first, b);
    expect(historyTarget(second, -1, () => true)).toBe(0);
    expect(historyTarget(second, 1, () => true)).toBeNull();
    expect(commitVisit({ ...second, cursor: 0 }, { root: "c" }).visits).toEqual([a, { root: "c" }]);
    expect(emptyHistory().visits).toEqual([]);
  });
  it("skips vanished destinations without treating transient errors as deletion", () => {
    let history = emptyHistory();
    for (const root of ["a", "gone", "c"]) history = commitVisit(history, { root });
    expect(historyTarget(history, -1, v => v.root !== "gone")).toBe(0);
    expect(historyTarget(history, -1, () => false)).toBeNull();
  });
  it("selects newest observed activity with user selection winning ties", () => {
    const memory = { roots: ["a", "b"], selectedRoot: "a", selectedAt: 10, expanded: false };
    expect(selectProjectRoot(memory, [{ root: "b", at: 11, incomplete: true }], null)).toBe("b");
    expect(selectProjectRoot(memory, [{ root: "b", at: 10, incomplete: false }], null)).toBe("a");
    expect(selectProjectRoot({ roots: ["a", "b"], expanded: false }, [], "b")).toBe("b");
    expect(selectProjectRoot({ roots: ["a", "b"], expanded: false }, [], null)).toBe("a");
  });
  it("rejoins path groups by membership and keeps the newest selection", () => {
    const saved = { a: { roots: ["a"], expanded: true, selectedRoot: "a", selectedAt: 2 }, b: { roots: ["b"], expanded: false, selectedRoot: "b", selectedAt: 3 } };
    expect(reconcileProjects(saved, [{ key: "common", roots: ["a", "b"] }])).toEqual({ common: { roots: ["a", "b"], expanded: true, selectedRoot: "b", selectedAt: 3 } });
    expect(reconcileProjects(saved, [])).toEqual({});
  });
  it("keeps a closed sidebar group closed across a folder update", () => {
    const saved = { common: { roots: ["a"], expanded: true, selectedRoot: "a", groups: { ds: false as const } } };
    expect(reconcileProjects(saved, [{ key: "common", roots: ["a", "b"] }]).common?.groups).toEqual({ ds: false });
    expect(reconcileProjects({ common: { roots: ["a"], expanded: true } }, [{ key: "common", roots: ["a"] }]).common).not.toHaveProperty("groups");
    // Rejoined projects keep a group closed only where every one of them had closed it; open is the default.
    const split = { a: { roots: ["a"], expanded: true, groups: { ds: false as const, canvases: false as const } }, b: { roots: ["b"], expanded: false, groups: { ds: false as const } } };
    expect(reconcileProjects(split, [{ key: "common", roots: ["a", "b"] }]).common?.groups).toEqual({ ds: false });
    expect(reconcileProjects({ ...split, b: { roots: ["b"], expanded: false } }, [{ key: "common", roots: ["a", "b"] }]).common).not.toHaveProperty("groups");
  });
});

describe("shell project persistence", () => {
  const parse = (shellProjects: unknown) => parseUiState(JSON.stringify({ screen: "home", expanded: { a: ["doan"] }, lastByRoot: {}, shellProjects }), ["a", "b"]);
  it("keeps legacy expansion and intersects roots while dropping invalid fields separately", () => {
    expect(parse({ common: { roots: ["a", "gone"], expanded: true, selectedRoot: "gone", selectedAt: 4 } })?.shellProjects).toEqual({ common: { roots: ["a"], expanded: true } });
    expect(parse({ bad: { roots: ["a"], expanded: "true" } })?.shellProjects).toEqual({});
    expect(parse({})?.expanded).toEqual({ a: ["doan"] });
  });
  it.each([0, 8.64e15, Date.now() + 100000])("accepts valid epoch %s", selectedAt => {
    expect(parse({ a: { roots: ["a"], selectedRoot: "a", selectedAt, expanded: false } })?.shellProjects?.a?.selectedAt).toBe(selectedAt);
  });
  it.each([-1, 1e300, null])("drops only invalid timestamp %s", selectedAt => {
    expect(parse({ a: { roots: ["a"], selectedRoot: "a", selectedAt, expanded: false } })?.shellProjects?.a).toEqual({ roots: ["a"], selectedRoot: "a", expanded: false });
  });
});

// Dogfooding #2: there was no visible way back to Home or to the Overview from a canvas.
describe("ways back", () => {
  it("the loaded project's row opens its Overview from a canvas and from Home, keeps the slot rule on the Overview, and re-enters from a page", () => {
    expect(loadedProjectRow({ screen: "workspace", overviewShown: false })).toBe("overview");
    expect(loadedProjectRow({ screen: "workspace", overviewShown: true })).toBe("slot");
    expect(loadedProjectRow({ screen: "home", overviewShown: false })).toBe("overview");
    expect(loadedProjectRow({ screen: "addProjects", overviewShown: false })).toBe("enter");
    expect(loadedProjectRow({ screen: "settings", overviewShown: true })).toBe("enter");
  });
  // project-settings design '화면' 사이드바: the Project Settings page has no current row, and the loaded project's row
  // opens its Overview there as it does from Home (POSTMORTEM 2026-11-02: every screen the branch runs on is pinned).
  it("the loaded project's row opens its Overview from the Project Settings page", () => {
    expect(loadedProjectRow({ screen: "projectSettings", overviewShown: false })).toBe("overview");
  });
  it("the Projects tab leaves a page as before and goes Home from a workspace", () => {
    expect(projectsTab("addProjects")).toBe("leavePage");
    expect(projectsTab("settings")).toBe("leavePage");
    expect(projectsTab("projectSettings")).toBe("leavePage");
    expect(projectsTab("workspace")).toBe("home");
    expect(projectsTab("home")).toBe("stay");
  });
});
