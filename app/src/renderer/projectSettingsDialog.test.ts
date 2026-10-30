import { expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { canCloseProjectSettings, closedFocus, followProjectSettings, problemActionCloses, projectSettingsView } from "./projectSettingsDialog";

const list = (path: string): FolderEntry => ({ path, kind: "list", canvases: [], servedRev: 1 });
const entry = (path: string, kind: "loading" | "uninitialized" | "notFound"): FolderEntry => ({ path, kind });
const settings = { root: "/w/a", view: "settings" } as const;

test("Escape and Done close the dialog only while nothing is being picked, confirmed or written", () => {
  expect(canCloseProjectSettings({ picking: false, confirming: false, writing: false })).toBe(true);
  expect(canCloseProjectSettings({ picking: true, confirming: false, writing: false })).toBe(false);
  expect(canCloseProjectSettings({ picking: false, confirming: true, writing: false })).toBe(false);
  expect(canCloseProjectSettings({ picking: false, confirming: false, writing: true })).toBe(false);
});

test("a healthy worktree shows its settings, a problem one its problem, and a loading one keeps what is shown", () => {
  expect(projectSettingsView(list("/w/a"))).toBe("settings");
  expect(projectSettingsView(entry("/w/a", "notFound"))).toBe("problem");
  expect(projectSettingsView(entry("/w/a", "uninitialized"))).toBe("problem");
  expect(projectSettingsView({ path: "/w/a", kind: "error", message: "bad config" })).toBe("problem");
  expect(projectSettingsView({ path: "/w/a", kind: "cliError", reason: "timeout" })).toBe("problem");
  expect(projectSettingsView(entry("/w/a", "loading"))).toBeNull();
});

test("rule 1: a worktree that leaves the list closes the dialog", () => {
  expect(followProjectSettings(settings, [list("/w/b")])).toEqual({ kind: "close" });
  expect(followProjectSettings({ root: "/w/a", view: "problem" }, [])).toEqual({ kind: "close" });
});

test("rule 1: focus goes back to the project menu button, else its row, else Search", () => {
  expect(closedFocus({ menuButton: true, row: true })).toBe("menuButton");
  expect(closedFocus({ menuButton: false, row: true })).toBe("row");
  expect(closedFocus({ menuButton: false, row: false })).toBe("search");
});

test("rule 2: a healthy worktree that turns into a problem switches the same dialog to the problem view", () => {
  expect(followProjectSettings(settings, [entry("/w/a", "notFound")])).toEqual({ kind: "show", root: "/w/a", view: "problem", reread: false });
  // Back to healthy (Retry) reads the settings again.
  expect(followProjectSettings({ root: "/w/a", view: "problem" }, [list("/w/a")])).toEqual({ kind: "show", root: "/w/a", view: "settings", reread: true });
  expect(followProjectSettings(settings, [list("/w/a")])).toEqual({ kind: "stay" });
  expect(followProjectSettings(settings, [entry("/w/a", "loading")])).toEqual({ kind: "stay" });
});

test("rule 3: Locate… follows the reroot to the new root and reads it", () => {
  const problem = { root: "/w/a", view: "problem" } as const;
  expect(followProjectSettings(problem, [list("/w/moved")], { from: "/w/a", root: "/w/moved" })).toEqual({ kind: "show", root: "/w/moved", view: "settings", reread: true });
  expect(followProjectSettings(problem, [entry("/w/moved", "loading")], { from: "/w/a", root: "/w/moved" })).toEqual({ kind: "show", root: "/w/moved", view: "problem", reread: true });
  // Another root's reroot is not this dialog's.
  expect(followProjectSettings(problem, [list("/w/c")], { from: "/w/b", root: "/w/c" })).toEqual({ kind: "close" });
});

test("rule 4: only Set Up… closes the dialog among the problem actions, so its own dialog never stacks on this one", () => {
  expect(problemActionCloses("setUp")).toBe(true);
  for (const action of ["locate", "remove", "reveal", "retry", "details"] as const) expect(problemActionCloses(action)).toBe(false);
});
