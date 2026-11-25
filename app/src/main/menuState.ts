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

// An open modal disables main-window actions so the window cannot act behind it; a `locked` page phase nothing may
// leave disables Settings… too. `prototypeFocused`: only app-level items stay, so nothing changes the main window behind it.
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
