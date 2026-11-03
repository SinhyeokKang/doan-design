import { describe, expect, test } from "vitest";
import { menuState } from "./menuState";

describe("menuState", () => {
  test("home: add project only; no Home, no canvas items", () => {
    expect(menuState("home", false)).toEqual({ addProject: true, home: false, canvasView: false, quickOpen: true, settings: true, newConversation: false, addSelectionToConversation: false });
  });

  test("workspace without a canvas: Home, but no canvas items", () => {
    expect(menuState("workspace", false)).toEqual({ addProject: true, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, addSelectionToConversation: false });
  });

  test("workspace with a canvas: every canvas item", () => {
    expect(menuState("canvas", false)).toEqual({ addProject: true, home: true, canvasView: true, quickOpen: true, settings: true, newConversation: true, addSelectionToConversation: false });
  });

  // Canvas conversations extend the Overview shortcut to the canvas page.
  test("New Conversation on Overview and canvas, never behind a modal or a lock", () => {
    expect(menuState("workspace", false, { wizardOpen: false, overview: true }).newConversation).toBe(true);
    expect(menuState("workspace", false, { wizardOpen: false }).newConversation).toBe(false);
    expect(menuState("canvas", false).newConversation).toBe(true);
    expect(menuState("canvas", true).newConversation).toBe(false);
    expect(menuState("canvas", false, { wizardOpen: false, locked: true }).newConversation).toBe(false);
    expect(menuState("workspace", true, { wizardOpen: false, overview: true }).newConversation).toBe(false);
    expect(menuState("workspace", false, { wizardOpen: false, overview: true, locked: true }).newConversation).toBe(false);
  });

  // buzz-settings design '메뉴': Settings… is a page move now, so a modal disables it too.
  test("an open modal disables everything, Settings… included", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) {
      expect(menuState(screen, true)).toEqual({ addProject: false, home: false, canvasView: false, quickOpen: false, settings: false, newConversation: false, addSelectionToConversation: false });
    }
  });
});

test("disables Settings while the wizard is open", () => {
  expect(menuState("canvas", false, { wizardOpen: true }).settings).toBe(false);
});

// buzz-add-projects design '메뉴': the page is a screen of its own; `choose` is its choose phase and `locked` its
// selecting and cloning phases, which nothing may leave.
describe("Add Projects page", () => {
  const main = { wizardOpen: false };
  test("Add Project… only in the choose phase, where it opens Choose folder; Home and Quick Open stay; no canvas items", () => {
    expect(menuState("addProjects", false, { ...main, choose: true })).toEqual({ addProject: true, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, addSelectionToConversation: false });
    expect(menuState("addProjects", false, { ...main, choose: false })).toEqual({ addProject: false, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, addSelectionToConversation: false });
    expect(menuState("addProjects", false, main).addProject).toBe(false);
  });

  test("choose has no effect outside the page", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, { ...main, choose: false }).addProject, screen).toBe(true);
  });

  test("locked disables every item that leaves the page, Settings… included", () => {
    const locked = { addProject: false, home: false, canvasView: false, quickOpen: false, settings: false, newConversation: false, addSelectionToConversation: false };
    expect(menuState("addProjects", false, { ...main, choose: true, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, { ...main, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, { ...main, choose: true, locked: false }).addProject).toBe(true);
    expect(menuState("addProjects", false, { wizardOpen: true, locked: true }).settings).toBe(false);
  });

  test("an open modal disables the page's items as before", () => {
    const off = { addProject: false, home: false, canvasView: false, quickOpen: false, settings: true, newConversation: false, addSelectionToConversation: false };
    expect(menuState("addProjects", true, { ...main, choose: true })).toEqual({ ...off, settings: false });
  });
});

// buzz-settings design '메뉴' and '잠금': the Settings page is a screen of its own. Settings… there focuses the category
// title again, Add Project… moves to the Add Projects page, and `locked` is the page's write or confirmation.
describe("settings page", () => {
  const main = { wizardOpen: false };
  test("Settings…, Add Project…, Home and Quick Open stay; no canvas items", () => {
    expect(menuState("settings", false, main)).toEqual({ settings: true, addProject: true, home: true, canvasView: false, quickOpen: true, newConversation: false, addSelectionToConversation: false });
    expect(menuState("settings", false, { ...main, choose: true })).toEqual({ settings: true, addProject: true, home: true, canvasView: false, quickOpen: true, newConversation: false, addSelectionToConversation: false });
  });

  test("a locked Settings page disables everything that leaves it, Settings… included", () => {
    const off = { settings: false, addProject: false, home: false, canvasView: false, quickOpen: false, newConversation: false, addSelectionToConversation: false };
    expect(menuState("settings", false, { ...main, locked: true })).toEqual(off);
    expect(menuState("settings", true, main)).toEqual(off);
  });

  test("the Add Projects page's lock disables Settings… so the page cannot be left for Settings", () => {
    expect(menuState("addProjects", false, { ...main, choose: true, locked: true }).settings).toBe(false);
    expect(menuState("addProjects", false, { ...main, choose: true }).settings).toBe(true);
  });

  test("first run still disables Settings… on every screen, the Settings page included", () => {
    for (const screen of ["home", "workspace", "canvas", "addProjects", "settings"] as const) {
      expect(menuState(screen, false, { wizardOpen: true }).settings, screen).toBe(false);
    }
  });
});


test("Add Selection to Conversation requires a canvas selection and an available picker", () => {
  const ready = { wizardOpen: false, selection: true, pickerAvailable: true };
  expect(menuState("canvas", false, ready).addSelectionToConversation).toBe(true);
  for (const screen of ["home", "workspace", "addProjects", "settings"] as const)
    expect(menuState(screen, false, ready).addSelectionToConversation).toBe(false);
  for (const context of [{ wizardOpen: false }, { ...ready, selection: false }, { ...ready, pickerAvailable: false }, { ...ready, locked: true }])
    expect(menuState("canvas", false, context).addSelectionToConversation).toBe(false);
  expect(menuState("canvas", true, ready).addSelectionToConversation).toBe(false);
});
