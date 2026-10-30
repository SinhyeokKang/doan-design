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
  // Go > Next/Previous Resolved Comment (revision-recheck): only during a Review.
  resolvedNav: boolean;
}

// Design 'Menus and per-screen enablement'. `workspace` is a workspace with no
// canvas open. An open modal disables main-window actions so the window
// cannot act behind it.
// `addProjects` is the Add Projects page: Add Project… opens its Choose folder, so only in its choose phase (`choose`).
// `settings` is the Settings page: Settings… there focuses its category title again, Add Project… moves to Add Projects.
// `locked`: a page phase nothing may leave — Add Projects' selecting and cloning (buzz-add-projects design '잠금'),
// Settings' writes and confirmations (buzz-settings design '잠금'). Settings… is a page move, so a lock or a modal
// disables it too.
export function menuState(screen: Screen, modalOpen: boolean, toastOpen: boolean, context: { wizardOpen: boolean; reviewing?: boolean; choose?: boolean; locked?: boolean } = { wizardOpen: false }): MenuEnabled {
  const settings = !context.wizardOpen && !modalOpen && context.locked !== true;
  if (modalOpen || context.locked === true) return { settings, addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, resolvedNav: false };
  return { settings, addProject: screen !== "addProjects" || context.choose === true, home: screen !== "home", canvasView: screen === "canvas", undoRemove: toastOpen, quickOpen: true, resolvedNav: screen === "canvas" && context.reviewing === true };
}
