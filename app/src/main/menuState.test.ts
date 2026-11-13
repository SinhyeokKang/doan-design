import { describe, expect, test } from "vitest";
import { menuState, updateMenu } from "./menuState";

describe("menuState", () => {
  test("home: add project only; no Home, no canvas items", () => {
    expect(menuState("home", false)).toEqual({ addProject: true, home: false, canvasView: false, quickOpen: true, settings: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
  });

  test("workspace without a canvas: Home, but no canvas items", () => {
    expect(menuState("workspace", false)).toEqual({ addProject: true, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
  });

  test("workspace with a canvas: every canvas item", () => {
    expect(menuState("canvas", false)).toEqual({ addProject: true, home: true, canvasView: true, quickOpen: true, settings: true, newConversation: true, pickFromCanvas: false, toggleSidebar: true });
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

  // Settings… is a page move now, so a modal disables it too.
  test("an open modal disables everything, Settings… included", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) {
      expect(menuState(screen, true)).toEqual({ addProject: false, home: false, canvasView: false, quickOpen: false, settings: false, newConversation: false, pickFromCanvas: false, toggleSidebar: false });
    }
  });
});

test("disables Settings while the wizard is open", () => {
  expect(menuState("canvas", false, { wizardOpen: true }).settings).toBe(false);
});

// The Add Projects page is a screen of its own; `choose` is its choose phase and `locked` its
// selecting and cloning phases, which nothing may leave.
describe("Add Projects page", () => {
  const main = { wizardOpen: false };
  test("Add Project… only in the choose phase, where it opens Choose folder; Home and Quick Open stay; no canvas items", () => {
    expect(menuState("addProjects", false, { ...main, choose: true })).toEqual({ addProject: true, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
    expect(menuState("addProjects", false, { ...main, choose: false })).toEqual({ addProject: false, home: true, canvasView: false, quickOpen: true, settings: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
    expect(menuState("addProjects", false, main).addProject).toBe(false);
  });

  test("choose has no effect outside the page", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, { ...main, choose: false }).addProject, screen).toBe(true);
  });

  test("locked disables every item that leaves the page, Settings… included", () => {
    const locked = { addProject: false, home: false, canvasView: false, quickOpen: false, settings: false, newConversation: false, pickFromCanvas: false, toggleSidebar: true };
    expect(menuState("addProjects", false, { ...main, choose: true, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, { ...main, locked: true })).toEqual(locked);
    expect(menuState("addProjects", false, { ...main, choose: true, locked: false }).addProject).toBe(true);
    expect(menuState("addProjects", false, { wizardOpen: true, locked: true }).settings).toBe(false);
  });

  test("an open modal disables the page's items as before", () => {
    const off = { addProject: false, home: false, canvasView: false, quickOpen: false, settings: true, newConversation: false, pickFromCanvas: false, toggleSidebar: false };
    expect(menuState("addProjects", true, { ...main, choose: true })).toEqual({ ...off, settings: false });
  });
});

// The Settings page is a screen of its own. Settings… there focuses the category
// title again, Add Project… moves to the Add Projects page, and `locked` is the page's write or confirmation.
describe("settings page", () => {
  const main = { wizardOpen: false };
  test("Settings…, Add Project…, Home and Quick Open stay; no canvas items", () => {
    expect(menuState("settings", false, main)).toEqual({ settings: true, addProject: true, home: true, canvasView: false, quickOpen: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
    expect(menuState("settings", false, { ...main, choose: true })).toEqual({ settings: true, addProject: true, home: true, canvasView: false, quickOpen: true, newConversation: false, pickFromCanvas: false, toggleSidebar: true });
  });

  test("a locked Settings page disables everything that leaves it, Settings… included", () => {
    const off = { settings: false, addProject: false, home: false, canvasView: false, quickOpen: false, newConversation: false, pickFromCanvas: false, toggleSidebar: true };
    expect(menuState("settings", false, { ...main, locked: true })).toEqual(off);
    expect(menuState("settings", true, main)).toEqual({ ...off, toggleSidebar: false });
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


// Pick from Canvas (⌘L) starts a pick, so it needs no selection, only the canvas page
// and an available picker.
test("Pick from Canvas is enabled on the canvas page with an available picker, without a selection", () => {
  const ready = { wizardOpen: false, pickerAvailable: true };
  expect(menuState("canvas", false, ready).pickFromCanvas).toBe(true);
  for (const screen of ["home", "workspace", "addProjects", "settings"] as const)
    expect(menuState(screen, false, ready).pickFromCanvas).toBe(false);
  for (const context of [{ wizardOpen: false }, { ...ready, pickerAvailable: false }, { ...ready, locked: true }])
    expect(menuState("canvas", false, context).pickFromCanvas).toBe(false);
  expect(menuState("canvas", true, ready).pickFromCanvas).toBe(false);
});

// Hide/Show Sidebar never leaves the screen, so a page lock keeps it; a modal or first
// run turns it off like every other main-window item.
test("Hide/Show Sidebar is off behind a modal and in first run, and on under a page lock", () => {
  for (const screen of ["home", "workspace", "canvas", "addProjects", "settings"] as const) {
    expect(menuState(screen, false).toggleSidebar, screen).toBe(true);
    expect(menuState(screen, false, { wizardOpen: false, locked: true }).toggleSidebar, screen).toBe(true);
    expect(menuState(screen, true).toggleSidebar, screen).toBe(false);
    expect(menuState(screen, false, { wizardOpen: true }).toggleSidebar, screen).toBe(false);
    expect(menuState(screen, true, { wizardOpen: false, locked: true }).toggleSidebar, screen).toBe(false);
  }
});

// Doan > Check for Updates… / Restart to Update: its label and action come from the update view, and it is enabled
// like Settings…, since both open a page of the main window.
describe("the update item", () => {
  const CHECK = { label: "Check for Updates…", action: "check", enabled: true } as const;
  const RESTARTING = { label: "Restart to Update", action: "restart", enabled: false } as const;
  test("follows the update view where Settings… is enabled", () => {
    expect(updateMenu(CHECK, menuState("home", false))).toEqual(CHECK);
    expect(updateMenu({ ...CHECK, action: "openAbout" }, menuState("canvas", false))).toEqual({ ...CHECK, action: "openAbout" });
    expect(updateMenu(RESTARTING, menuState("home", false))).toEqual(RESTARTING);
  });
  test("is disabled during first run, behind a modal and on a locked page", () => {
    for (const enabled of [menuState("home", false, { wizardOpen: true }), menuState("home", true), menuState("settings", false, { wizardOpen: false, locked: true })]) {
      expect(updateMenu(CHECK, enabled)).toEqual({ ...CHECK, enabled: false });
    }
  });

  // The prototype window takes these keys only while it is focused; the main window's canvas, conversation, view and
  // navigation must not change behind it.
  test("with the prototype window focused, only app-level items stay on", () => {
    for (const screen of ["home", "workspace", "canvas", "addProjects", "settings"] as const) {
      expect(menuState(screen, false, { wizardOpen: false, overview: true, pickerAvailable: true, choose: true, prototypeFocused: true }), screen).toEqual({
        settings: true, addProject: false, home: false, canvasView: false, quickOpen: false, newConversation: false, pickFromCanvas: false, toggleSidebar: false,
      });
    }
  });
});

