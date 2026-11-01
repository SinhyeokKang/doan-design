import { describe, expect, test } from "vitest";
import { menuState } from "./menuState";

describe("menuState", () => {
  test("home: add project only; no Home, no canvas items", () => {
    expect(menuState("home", false, false)).toEqual({ addProject: true, home: false, canvasView: false, undoRemove: false, quickOpen: true, settings: true, newConversation: false });
  });

  test("workspace without a canvas: Home, but no canvas items", () => {
    expect(menuState("workspace", false, false)).toEqual({ addProject: true, home: true, canvasView: false, undoRemove: false, quickOpen: true, settings: true, newConversation: false });
  });

  test("workspace with a canvas: every canvas item", () => {
    expect(menuState("canvas", false, false)).toEqual({ addProject: true, home: true, canvasView: true, undoRemove: false, quickOpen: true, settings: true, newConversation: false });
  });

  // buzz-project spec decision 2: File > New Conversation (⌘N) works while a project Overview shows.
  test("New Conversation only while the Overview shows, never behind a modal or a lock", () => {
    expect(menuState("workspace", false, false, { wizardOpen: false, overview: true }).newConversation).toBe(true);
    expect(menuState("workspace", false, false, { wizardOpen: false }).newConversation).toBe(false);
    expect(menuState("canvas", false, false, { wizardOpen: false, overview: true }).newConversation).toBe(false);
    expect(menuState("workspace", true, false, { wizardOpen: false, overview: true }).newConversation).toBe(false);
    expect(menuState("workspace", false, false, { wizardOpen: false, overview: true, locked: true }).newConversation).toBe(false);
  });

  test("Undo Remove follows the toast on every screen", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, true).undoRemove).toBe(true);
  });

  // buzz-settings design '메뉴': Settings… is a page move now, so a modal disables it too.
  test("an open modal disables everything, Settings… included", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) {
      expect(menuState(screen, true, true)).toEqual({ addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, settings: false, newConversation: false });
    }
  });
});

test("disables Settings while the wizard is open", () => {
  expect(menuState("canvas", false, true, { wizardOpen: true }).settings).toBe(false);
});

// buzz-add-projects design '메뉴': the page is a screen of its own; `choose` is its choose phase and `locked` its
// selecting and cloning phases, which nothing may leave.
describe("Add Projects page", () => {
  const main = { wizardOpen: false };
  test("Add Project… only in the choose phase, where it opens Choose folder; Home and Quick Open stay; no canvas items", () => {
    expect(menuState("addProjects", false, false, { ...main, choose: true })).toEqual({ addProject: true, home: true, canvasView: false, undoRemove: false, quickOpen: true, settings: true, newConversation: false });
    expect(menuState("addProjects", false, false, { ...main, choose: false })).toEqual({ addProject: false, home: true, canvasView: false, undoRemove: false, quickOpen: true, settings: true, newConversation: false });
    expect(menuState("addProjects", false, false, main).addProject).toBe(false);
    expect(menuState("addProjects", false, true, { ...main, choose: true }).undoRemove).toBe(true);
  });

  test("choose has no effect outside the page", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, false, { ...main, choose: false }).addProject, screen).toBe(true);
  });

  test("locked disables every item that leaves the page, Settings… included", () => {
    const locked = { addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, settings: false, newConversation: false };
    expect(menuState("addProjects", false, true, { ...main, choose: true, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, false, { ...main, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, false, { ...main, choose: true, locked: false }).addProject).toBe(true);
    expect(menuState("addProjects", false, false, { wizardOpen: true, locked: true }).settings).toBe(false);
  });

  test("an open modal disables the page's items as before", () => {
    const off = { addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, settings: true, newConversation: false };
    expect(menuState("addProjects", true, true, { ...main, choose: true })).toEqual({ ...off, settings: false });
  });
});

// buzz-settings design '메뉴' and '잠금': the Settings page is a screen of its own. Settings… there focuses the category
// title again, Add Project… moves to the Add Projects page, and `locked` is the page's write or confirmation.
describe("settings page", () => {
  const main = { wizardOpen: false };
  test("Settings…, Add Project…, Home and Quick Open stay; no canvas items", () => {
    expect(menuState("settings", false, false, main)).toEqual({ settings: true, addProject: true, home: true, canvasView: false, undoRemove: false, quickOpen: true, newConversation: false });
    expect(menuState("settings", false, false, { ...main, choose: true })).toEqual({ settings: true, addProject: true, home: true, canvasView: false, undoRemove: false, quickOpen: true, newConversation: false });
    expect(menuState("settings", false, true, main).undoRemove).toBe(true);
  });

  test("a locked Settings page disables everything that leaves it, Settings… included", () => {
    const off = { settings: false, addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, newConversation: false };
    expect(menuState("settings", false, true, { ...main, locked: true })).toEqual(off);
    expect(menuState("settings", true, false, main)).toEqual(off);
  });

  test("the Add Projects page's lock disables Settings… so the page cannot be left for Settings", () => {
    expect(menuState("addProjects", false, false, { ...main, choose: true, locked: true }).settings).toBe(false);
    expect(menuState("addProjects", false, false, { ...main, choose: true }).settings).toBe(true);
  });

  test("first run still disables Settings… on every screen, the Settings page included", () => {
    for (const screen of ["home", "workspace", "canvas", "addProjects", "settings"] as const) {
      expect(menuState(screen, false, false, { wizardOpen: true }).settings, screen).toBe(false);
    }
  });
});
