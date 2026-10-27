import { describe, expect, it } from "vitest";
import { commitVisit, emptyHistory, historyTarget, projectExpanded, projectHue, reconcileProjects, selectProjectRoot } from "./shellNavigation";
import { parseUiState } from "../restore/uiState";

describe("shell navigation", () => {
  it("hashes trimmed Unicode code points deterministically into eight colors", () => {
    expect(projectHue(" doan-design ")).toBe("indigo");
    expect(projectHue("malmoi")).toBe("indigo");
    for (const name of ["", " ", "한글", "😀", "x".repeat(10000)]) expect(projectHue(name)).toBe(projectHue(name.trim()));
    expect(projectHue("")).toBe("sky");
  });
  it("forces only the viewed project open without changing saved intent", () => {
    expect(projectExpanded({ roots: ["a"], expanded: false }, "a")).toBe(true);
    expect(projectExpanded({ roots: ["a"], expanded: false }, "b")).toBe(false);
  });
  it("commits only a final destination and truncates forward history", () => {
    const a = { root: "a", canvas: "design/a.html" }, b = { root: "b" };
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
});

describe("shell project persistence", () => {
  const parse = (shellProjects: unknown) => parseUiState(JSON.stringify({ screen: "home", expanded: { a: ["design"] }, lastByRoot: {}, shellProjects }), ["a", "b"]);
  it("keeps legacy expansion and intersects roots while dropping invalid fields separately", () => {
    expect(parse({ common: { roots: ["a", "gone"], expanded: true, selectedRoot: "gone", selectedAt: 4 } })?.shellProjects).toEqual({ common: { roots: ["a"], expanded: true } });
    expect(parse({ bad: { roots: ["a"], expanded: "true" } })?.shellProjects).toEqual({});
    expect(parse({})?.expanded).toEqual({ a: ["design"] });
  });
  it.each([0, 8.64e15, Date.now() + 100000])("accepts valid epoch %s", selectedAt => {
    expect(parse({ a: { roots: ["a"], selectedRoot: "a", selectedAt, expanded: false } })?.shellProjects?.a?.selectedAt).toBe(selectedAt);
  });
  it.each([-1, 1e300, null])("drops only invalid timestamp %s", selectedAt => {
    expect(parse({ a: { roots: ["a"], selectedRoot: "a", selectedAt, expanded: false } })?.shellProjects?.a).toEqual({ roots: ["a"], selectedRoot: "a", expanded: false });
  });
});
