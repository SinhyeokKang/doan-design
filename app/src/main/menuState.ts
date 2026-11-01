export type Screen = "home" | "workspace" | "canvas" | "addProjects" | "settings";

export interface MenuEnabled {
  settings: boolean;
  addProject: boolean;
  home: boolean;
  // Zoom In/Out, Actual Size, Fit, Reload Canvas.
  canvasView: boolean;
  undoRemove: boolean;
  // Go > Quick Open… (design-nav): every screen, since it searches all projects.
  quickOpen: boolean;
  // File > New Conversation: a project Overview or canvas.
  newConversation: boolean;
  // Edit > Add Selection to Conversation: requires both a canvas selection and an available picker.
  addSelectionToConversation: boolean;
}

// Design 'Menus and per-screen enablement'. `workspace` is a workspace with no
// canvas open. An open modal disables main-window actions so the window
// cannot act behind it.
// `addProjects` is the Add Projects page: Add Project… opens its Choose folder, so only in its choose phase (`choose`).
// `settings` is the Settings page: Settings… there focuses its category title again, Add Project… moves to Add Projects.
// `locked`: a page phase nothing may leave — Add Projects' selecting and cloning (buzz-add-projects design '잠금'),
// Settings' writes and confirmations (buzz-settings design '잠금'). Settings… is a page move, so a lock or a modal
// disables it too.
// `overview`: the workspace shows a project's Overview, not a problem screen.
// `selection`: the canvas has a selection to add; `pickerAvailable`: the composer takes input and the canvas is loaded
// (design §2), so the menu follows the same availability as the canvas toolbar.
export function menuState(screen: Screen, modalOpen: boolean, toastOpen: boolean, context: { wizardOpen: boolean; choose?: boolean; locked?: boolean; overview?: boolean; selection?: boolean; pickerAvailable?: boolean } = { wizardOpen: false }): MenuEnabled {
  const settings = !context.wizardOpen && !modalOpen && context.locked !== true;
  if (modalOpen || context.locked === true) return { settings, addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, newConversation: false, addSelectionToConversation: false };
  return { settings, addProject: screen !== "addProjects" || context.choose === true, home: screen !== "home", canvasView: screen === "canvas", undoRemove: toastOpen, quickOpen: true,
    newConversation: screen === "canvas" || (screen === "workspace" && context.overview === true),
    addSelectionToConversation: screen === "canvas" && context.selection === true && context.pickerAvailable === true };
}
