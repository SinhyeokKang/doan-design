import { expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import type { AddPageOrigin } from "./addProjectsNav";
import { followProjectSettings, projectSettingsFocusAfter, projectSettingsLocked, projectSettingsPageView, projectSettingsView, sharedPathLabel, writeErrorMessage, type ProjectSettingsPageView, type ReadState } from "./projectSettingsRules";

const list = (path: string): FolderEntry => ({ path, kind: "list", canvases: [], servedRev: 1 });
const entry = (path: string, kind: "loading" | "uninitialized" | "notFound"): FolderEntry => ({ path, kind });
const settings = { root: "/w/a", view: "settings" } as const;

test("a healthy worktree shows its settings, a problem one its problem, and a loading one keeps what is shown", () => {
  expect(projectSettingsView(list("/w/a"))).toBe("settings");
  expect(projectSettingsView(entry("/w/a", "notFound"))).toBe("problem");
  expect(projectSettingsView(entry("/w/a", "uninitialized"))).toBe("problem");
  expect(projectSettingsView({ path: "/w/a", kind: "error", message: "bad config" })).toBe("problem");
  expect(projectSettingsView({ path: "/w/a", kind: "cliError", reason: "timeout" })).toBe("problem");
  expect(projectSettingsView(entry("/w/a", "loading"))).toBeNull();
});

// ── The page (project-settings design '순수 함수로 뺄 부분' 3–7) ────────────────────────────────────────────────────

const home: AddPageOrigin = { screen: "home" };
const wsA: AddPageOrigin = { screen: "workspace", root: "/w/a" };

test("page follow: a worktree that leaves the list leaves the page", () => {
  expect(followProjectSettings(settings, [list("/w/b")], home)).toEqual({ kind: "leave" });
  expect(followProjectSettings({ root: "/w/a", view: "problem" }, [], wsA)).toEqual({ kind: "leave" });
  // A reroot whose new root is not listed leaves too.
  expect(followProjectSettings(settings, [list("/w/b")], home, { from: "/w/a", root: "/w/moved" })).toEqual({ kind: "leave" });
});

test("page follow: a healthy worktree that turns into a problem switches the view and cancels an open confirmation", () => {
  expect(followProjectSettings(settings, [entry("/w/a", "notFound")], home)).toEqual({ kind: "show", root: "/w/a", view: "problem", reread: false, cancelConfirm: true, origin: home });
  expect(followProjectSettings(settings, [{ path: "/w/a", kind: "error", message: "bad" }], home)).toMatchObject({ view: "problem", cancelConfirm: true });
});

test("page follow: back to healthy reads again and has no confirmation to cancel", () => {
  expect(followProjectSettings({ root: "/w/a", view: "problem" }, [list("/w/a")], home)).toEqual({ kind: "show", root: "/w/a", view: "settings", reread: true, cancelConfirm: false, origin: home });
});

test("page follow: an unchanged state and a loading one stay", () => {
  expect(followProjectSettings(settings, [list("/w/a")], home)).toEqual({ kind: "stay" });
  expect(followProjectSettings(settings, [entry("/w/a", "loading")], home)).toEqual({ kind: "stay" });
  expect(followProjectSettings({ root: "/w/a", view: "problem" }, [entry("/w/a", "loading")], home)).toEqual({ kind: "stay" });
});

test("page follow: Locate or Set Up reroots the page, reads the new root and cancels an open confirmation", () => {
  const problem = { root: "/w/a", view: "problem" } as const;
  expect(followProjectSettings(problem, [list("/w/moved")], home, { from: "/w/a", root: "/w/moved" })).toEqual({ kind: "show", root: "/w/moved", view: "settings", reread: true, cancelConfirm: true, origin: home });
  // A new root still loading keeps the shown view and reads once it is a list (the next follow).
  expect(followProjectSettings(problem, [entry("/w/moved", "loading")], home, { from: "/w/a", root: "/w/moved" })).toEqual({ kind: "show", root: "/w/moved", view: "problem", reread: false, cancelConfirm: true, origin: home });
  // Another root's reroot is not this page's: its worktree is still listed.
  expect(followProjectSettings(settings, [list("/w/a"), list("/w/c")], home, { from: "/w/b", root: "/w/c" })).toEqual({ kind: "stay" });
});

test("page follow: a reroot moves an origin workspace on the old root to the new root, and only that origin", () => {
  const problem = { root: "/w/a", view: "problem" } as const;
  const focus = { from: "/w/a", root: "/w/moved" };
  expect(followProjectSettings(problem, [list("/w/moved")], wsA, focus)).toMatchObject({ origin: { screen: "workspace", root: "/w/moved" } });
  expect(followProjectSettings(problem, [list("/w/moved")], { screen: "workspace", root: "/w/other" }, focus)).toMatchObject({ origin: { screen: "workspace", root: "/w/other" } });
  expect(followProjectSettings(problem, [list("/w/moved")], home, focus)).toMatchObject({ origin: home });
});

test("page lock: a picker, a confirmation or a write holds the page", () => {
  expect(projectSettingsLocked({ picking: false, confirming: false, writing: false })).toBe(false);
  expect(projectSettingsLocked({ picking: true, confirming: false, writing: false })).toBe(true);
  expect(projectSettingsLocked({ picking: false, confirming: true, writing: false })).toBe(true);
  expect(projectSettingsLocked({ picking: false, confirming: false, writing: true })).toBe(true);
});

// One row per state tile of the draft ('alt-2-page', 'alt-2-states', 'alt-2-page-problem', 'alt-2-states-problem').
const ready: ReadState = { kind: "ready" };
const NOT_FOUND = "Doan can’t find this folder, so its settings can’t be read or changed.";
const NOT_SET_UP = "This folder isn’t set up for Doan yet, so it has no settings to change.";
const CONFIG_ERROR = "Doan couldn’t read this folder’s configuration, so its settings can’t be changed.";
const CLI_ERROR = "Doan couldn’t read this folder, so its settings can’t be read or changed.";
const PAGE_VIEW: [string, FolderEntry, ReadState, ProjectSettingsPageView][] = [
  ["healthy", list("/w/a"), ready, { storedNote: true, showInFinder: true, body: "sections", notice: null, removeSection: true }],
  ["reading", list("/w/a"), { kind: "reading" }, { storedNote: false, showInFinder: true, body: "reading", notice: null, removeSection: false }],
  ["read failed", list("/w/a"), { kind: "failed", message: "permission denied" }, { storedNote: false, showInFinder: true, body: "notice", removeSection: true,
    notice: { tone: "error", text: "Couldn’t read this worktree’s settings.", reason: "permission denied", actions: ["retry"] } }],
  ["missing", entry("/w/a", "notFound"), ready, { storedNote: false, showInFinder: false, body: "notice", removeSection: true,
    notice: { tone: "warning", text: NOT_FOUND, actions: ["locate"] } }],
  ["not set up", entry("/w/a", "uninitialized"), ready, { storedNote: false, showInFinder: true, body: "notice", removeSection: true,
    notice: { tone: "warning", text: NOT_SET_UP, actions: ["setUp"] } }],
  ["config error", { path: "/w/a", kind: "error", message: "unexpected token }" }, ready, { storedNote: false, showInFinder: true, body: "notice", removeSection: true,
    notice: { tone: "error", text: CONFIG_ERROR, detail: "unexpected token }", actions: ["retry", "details"] } }],
  ["CLI error", { path: "/w/a", kind: "cliError", reason: "timeout" }, ready, { storedNote: false, showInFinder: true, body: "notice", removeSection: true,
    notice: { tone: "error", text: CLI_ERROR, actions: ["retry"] } }],
  ["still reading", entry("/w/a", "loading"), ready, { storedNote: false, showInFinder: false, body: "reading", notice: null, removeSection: false }],
];
test.each(PAGE_VIEW)("page view: %s", (_name, item, read, expected) => {
  expect(projectSettingsPageView(item, read)).toEqual(expected);
});

test("page view: a problem entry ignores the read state, since its settings are never read", () => {
  expect(projectSettingsPageView(entry("/w/a", "notFound"), { kind: "reading" })).toEqual(projectSettingsPageView(entry("/w/a", "notFound"), ready));
  expect(projectSettingsPageView(entry("/w/a", "uninitialized"), { kind: "failed", message: "x" })).toEqual(projectSettingsPageView(entry("/w/a", "uninitialized"), ready));
});

test("page view: the read-failed reason shows inline and the config error's detail waits behind Details", () => {
  expect(projectSettingsPageView(list("/w/a"), { kind: "failed", message: "m" }).notice).toMatchObject({ reason: "m" });
  expect(projectSettingsPageView(list("/w/a"), { kind: "failed", message: "m" }).notice).not.toHaveProperty("detail");
  expect(projectSettingsPageView({ path: "/w/a", kind: "error", message: "m" }, ready).notice).toMatchObject({ detail: "m" });
  expect(projectSettingsPageView({ path: "/w/a", kind: "error", message: "m" }, ready).notice).not.toHaveProperty("reason");
});

test("write errors: a path outside the worktree is told where to choose, per section", () => {
  expect(writeErrorMessage("tokenCss", { kind: "error", message: "src/vendor/theme.css is outside this worktree" }, "acme-web"))
    .toBe("src/vendor/theme.css is outside this worktree. Choose a CSS file inside acme-web.");
  expect(writeErrorMessage("serve", { kind: "error", message: "../design-kit is outside this worktree." }, "acme-web"))
    .toBe("../design-kit is outside this worktree. Choose a file or folder inside acme-web.");
  for (const message of ["not a CSS file", "path not found", "x does not exist"])
    expect(writeErrorMessage("tokenCss", { kind: "error", message }, "w")).toMatch(/ Choose a CSS file inside w\.$/);
});

test("write errors: any other message is shown as main sent it", () => {
  expect(writeErrorMessage("serve", { kind: "error", message: "doan config timed out after 10 s." }, "acme-web")).toBe("doan config timed out after 10 s.");
});

test("write errors: an unavailable reply (session or epoch changed) asks to choose again, and never points at Home", () => {
  for (const section of ["tokenCss", "serve"] as const) {
    expect(writeErrorMessage(section, { kind: "unavailable" }, "acme-web")).toBe("This worktree changed. Choose again.");
    expect(writeErrorMessage(section, { kind: "unavailable" }, "acme-web")).not.toMatch(/Home/);
  }
});

test("focus after a write: the pressed button while it lives, else its section's main button", () => {
  expect(projectSettingsFocusAfter({ section: "tokenCss", pressedAlive: true })).toEqual({ kind: "pressed" });
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: true })).toEqual({ kind: "pressed" });
  // Clear removes itself and Change becomes Choose: the token section's main button.
  expect(projectSettingsFocusAfter({ section: "tokenCss", pressedAlive: false })).toEqual({ kind: "tokenPrimary" });
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false })).toEqual({ kind: "sharedAdd" });
});

test("focus after removing a shared path: the next path's Remove, else Add File or Folder", () => {
  const before = ["a", "b", "c"];
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false, removed: { path: "a", before, after: ["b", "c"] } })).toEqual({ kind: "sharedRemove", path: "b" });
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false, removed: { path: "b", before, after: ["a", "c"] } })).toEqual({ kind: "sharedRemove", path: "c" });
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false, removed: { path: "c", before, after: ["a", "b"] } })).toEqual({ kind: "sharedAdd" });
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false, removed: { path: "a", before: ["a"], after: [] } })).toEqual({ kind: "sharedAdd" });
  // The write may have dropped the next path too: skip to one that remains.
  expect(projectSettingsFocusAfter({ section: "serve", pressedAlive: false, removed: { path: "a", before, after: ["c"] } })).toEqual({ kind: "sharedRemove", path: "c" });
});

// main's picker returns an absolute path, while the config stores a path inside the worktree repo-relative; the
// confirmation names the path the way it will be stored. A path outside stays absolute: the config refuses it.
test("the Share confirmation names a path inside the worktree repo-relative and one outside as picked", () => {
  expect(sharedPathLabel("/w/a", "/w/a/design/brand")).toBe("design/brand");
  expect(sharedPathLabel("/w/a", "/w/a/file.css")).toBe("file.css");
  expect(sharedPathLabel("/w/a", "/w/ab/design")).toBe("/w/ab/design");
  expect(sharedPathLabel("/w/a", "/w/design-kit")).toBe("/w/design-kit");
  expect(sharedPathLabel("/w/a", "/w/a")).toBe("/w/a");
  expect(sharedPathLabel("/w/a", "design/brand")).toBe("design/brand");
});
