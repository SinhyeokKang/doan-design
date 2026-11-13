import type { UpdateMenuView } from "./update/view";

export type Screen = "home" | "workspace" | "canvas" | "addProjects" | "settings";

export interface MenuEnabled {
  settings: boolean;
  addProject: boolean;
  home: boolean;
  // Zoom In/Out, Actual Size, Fit, Reload Canvas.
  canvasView: boolean;
  // Go > Quick Open…: every screen, since it searches all projects.
  quickOpen: boolean;
  // File > New Conversation: a project Overview or canvas.
  newConversation: boolean;
  // Edit > Pick from Canvas: the canvas page with an available picker.
  pickFromCanvas: boolean;
  // View > Hide/Show Sidebar: it never leaves the screen, so a page lock keeps it.
  toggleSidebar: boolean;
}

// Design 'Menus and per-screen enablement'. `workspace` is a workspace with no
// canvas open. An open modal disables main-window actions so the window
// cannot act behind it.
// `addProjects` is the Add Projects page: Add Project… opens its Choose folder, so only in its choose phase (`choose`).
// `settings` is the Settings page: Settings… there focuses its category title again, Add Project… moves to Add Projects.
// `locked`: a page phase nothing may leave — Add Projects' selecting and cloning,
// Settings' writes and confirmations. Settings… is a page move, so a lock or a modal
// disables it too.
// `overview`: the workspace shows a project's Overview, not a problem screen.
// `pickerAvailable`: the composer takes input and the canvas is loaded, so the menu follows the same availability as
// the canvas toolbar's Picker.
// `prototypeFocused`: the prototype window has focus. Every item that acts on the main window's canvas, conversation,
// view or navigation goes off, so it cannot change the main window behind it; the app-level items stay.
export function menuState(screen: Screen, modalOpen: boolean, context: { wizardOpen: boolean; choose?: boolean; locked?: boolean; overview?: boolean; pickerAvailable?: boolean; prototypeFocused?: boolean } = { wizardOpen: false }): MenuEnabled {
  const settings = !context.wizardOpen && !modalOpen && context.locked !== true;
  if (context.prototypeFocused === true) return { settings, addProject: false, home: false, canvasView: false, quickOpen: false, newConversation: false, pickFromCanvas: false, toggleSidebar: false };
  const toggleSidebar = !context.wizardOpen && !modalOpen;
  if (modalOpen || context.locked === true) return { settings, addProject: false, home: false, canvasView: false, quickOpen: false, newConversation: false, pickFromCanvas: false, toggleSidebar };
  return { settings, toggleSidebar, addProject: screen !== "addProjects" || context.choose === true, home: screen !== "home", canvasView: screen === "canvas", quickOpen: true,
    newConversation: screen === "canvas" || (screen === "workspace" && context.overview === true),
    pickFromCanvas: screen === "canvas" && context.pickerAvailable === true };
}

// Doan > Check for Updates… / Restart to Update. Its label and action are the update view's; like Settings… it opens
// a page of the main window (About, or the header popover), so it is off wherever Settings… is.
export function updateMenu(view: UpdateMenuView, enabled: MenuEnabled): UpdateMenuView {
  return { ...view, enabled: view.enabled && enabled.settings };
}
