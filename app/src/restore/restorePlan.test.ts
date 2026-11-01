import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { MAX_SCALE } from "../renderer/viewport";
import { RESTORE_LOADING_WAIT_MS, restorePlan } from "./restorePlan";
import type { UiState } from "./uiState";

const view = { scale: 1.5, x: 10, y: 20 };

function row(path: string): CanvasRow {
  return { path, url: `http://127.0.0.1:1/${path}` };
}

function list(path: string, ...canvases: string[]): FolderEntry {
  return { path, kind: "list", canvases: canvases.map(row), servedRev: 0 };
}

function state(overrides: Partial<UiState> = {}): UiState {
  return { screen: "workspace", root: "/repo/a", canvas: "a.html", view, expanded: {}, lastByRoot: {}, ...overrides };
}

test("no saved state starts at home", () => {
  expect(restorePlan(null, [list("/repo/a", "a.html")], 0)).toEqual({ kind: "home" });
});

test("a home screen restores home even when the hidden workspace could load", () => {
  expect(restorePlan(state({ screen: "home" }), [list("/repo/a", "a.html")], 0)).toEqual({ kind: "home" });
});

test("opens the saved canvas and carries its view", () => {
  expect(restorePlan(state(), [list("/repo/a", "a.html", "b.html")], 0)).toEqual({
    kind: "workspace",
    root: "/repo/a",
    canvas: { path: "a.html", view },
  });
});

test("clamps the scale to 0.05–4 and keeps the position", () => {
  const plan = (scale: number) => restorePlan(state({ view: { scale, x: 7, y: 8 } }), [list("/repo/a", "a.html")], 0);
  expect(plan(100)).toMatchObject({ canvas: { view: { scale: 4, x: 7, y: 8 } } });
  expect(plan(0.001)).toMatchObject({ canvas: { view: { scale: 0.05, x: 7, y: 8 } } });
  expect(plan(0.05)).toMatchObject({ canvas: { view: { scale: 0.05 } } });
  expect(plan(4)).toMatchObject({ canvas: { view: { scale: 4 } } });
});

test("a saved canvas without a view opens without one", () => {
  const { view: _view, ...withoutView } = state();
  expect(restorePlan(withoutView, [list("/repo/a", "a.html")], 0)).toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "a.html" } });
});

test("a canvas gone from the list opens the overview and names it for the toast", () => {
  expect(restorePlan(state(), [list("/repo/a", "b.html")], 0)).toEqual({
    kind: "workspace",
    root: "/repo/a",
    canvas: null,
    missingCanvas: "a.html",
  });
});

test("no saved canvas opens the overview without a toast", () => {
  const { canvas: _canvas, view: _view, ...overview } = state();
  expect(restorePlan(overview, [list("/repo/a", "a.html")], 0)).toEqual({ kind: "workspace", root: "/repo/a", canvas: null });
});

test("an empty canvas list is the same as a missing canvas", () => {
  expect(restorePlan(state(), [list("/repo/a")], 0)).toMatchObject({ kind: "workspace", canvas: null, missingCanvas: "a.html" });
});

test("a root that is not in the saved list goes home", () => {
  expect(restorePlan(state(), [list("/repo/b", "a.html")], 0)).toEqual({ kind: "home" });
  expect(restorePlan(state(), [], 0)).toEqual({ kind: "home" });
});

test("a workspace screen without a root goes home", () => {
  const { root: _root, ...noRoot } = state();
  expect(restorePlan(noRoot, [list("/repo/a", "a.html")], 0)).toEqual({ kind: "home" });
});

test("waits while the root is loading, up to 10 s, then goes home", () => {
  const entries: FolderEntry[] = [{ path: "/repo/a", kind: "loading" }];
  expect(RESTORE_LOADING_WAIT_MS).toBe(10_000);
  expect(restorePlan(state(), entries, 0)).toEqual({ kind: "wait" });
  expect(restorePlan(state(), entries, 9_999)).toEqual({ kind: "wait" });
  expect(restorePlan(state(), entries, 10_000)).toEqual({ kind: "home" });
  expect(restorePlan(state(), entries, 60_000)).toEqual({ kind: "home" });
});

test("another root loading does not hold the restore", () => {
  const entries: FolderEntry[] = [{ path: "/repo/b", kind: "loading" }, list("/repo/a", "a.html")];
  expect(restorePlan(state(), entries, 0)).toMatchObject({ kind: "workspace", root: "/repo/a" });
});

test("a loaded root past the wait still opens", () => {
  expect(restorePlan(state(), [list("/repo/a", "a.html")], 50_000)).toMatchObject({ kind: "workspace" });
});

test.each<FolderEntry>([
  { path: "/repo/a", kind: "uninitialized" },
  { path: "/repo/a", kind: "error", message: "bad config" },
  { path: "/repo/a", kind: "cliError", reason: "timed out" },
  { path: "/repo/a", kind: "notFound" },
])("a problem state goes home: problem rows never enter a workspace: $kind", (entry) => {
  expect(restorePlan(state(), [entry], 0)).toEqual({ kind: "home" });
  expect(restorePlan(state(), [entry], 60_000)).toEqual({ kind: "home" });
});

describe("restoring by the saved canvas id", () => {
  const idRow = (path: string, id?: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ ...row(path), ...(id === undefined ? {} : { id }), width: 1200, ...extra });
  const rows = (...canvases: CanvasRow[]): FolderEntry[] => [{ path: "/repo/a", kind: "list", canvases, servedRev: 0 }];

  test("opens the one row with the id at its saved path", () => {
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("a.html", "home"), idRow("b.html", "other")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "a.html", view } });
  });

  test("follows the id to a new path", () => {
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("b.html", "other"), idRow("sub/a.html", "home")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "sub/a.html", view } });
  });

  test("prefers the id over another canvas now at the saved path", () => {
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("a.html", "other"), idRow("moved.html", "home")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "moved.html", view } });
  });

  test("opens the overview with the duplicate id when two or more rows use it", () => {
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("a.html", "home"), idRow("b.html", "home")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: null, duplicateId: { id: "home", count: 2 } });
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("x.html", "home"), idRow("y.html", "home"), idRow("z.html", "home")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: null, duplicateId: { id: "home", count: 3 } });
  });

  test("falls back to the saved path when no row has the id", () => {
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("a.html", "renamed")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "a.html", view } });
    expect(restorePlan(state({ canvasId: "home" }), rows(idRow("b.html", "other")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: null, missingCanvas: "a.html" });
  });

  test("restores by path from a file saved before canvas ids", () => {
    expect(restorePlan(state(), rows(idRow("a.html", "other"), idRow("b.html", "home")), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "a.html", view } });
  });

  test("restores a row without a width; the canvas shows its own no-width state", () => {
    const noWidth: CanvasRow = { ...row("moved.html"), id: "home" };
    expect(restorePlan(state({ canvasId: "home" }), rows(noWidth), 0))
      .toEqual({ kind: "workspace", root: "/repo/a", canvas: { path: "moved.html", view } });
  });

  test("clamps the view of a canvas found by id", () => {
    expect(restorePlan(state({ canvasId: "home", view: { scale: 99, x: 0, y: 0 } }), rows(idRow("b.html", "home")), 0))
      .toMatchObject({ canvas: { path: "b.html", view: { scale: MAX_SCALE } } });
  });
});
