export type Screen = "home" | "workspace" | "canvas";

export interface MenuEnabled {
  settings: boolean;
  addProject: boolean;
  home: boolean;
  // Zoom In/Out, Actual Size, Fit, Reload Canvas.
  canvasView: boolean;
  undoRemove: boolean;
  // Go > Quick Open… (design-nav): every screen, since it searches all projects.
  quickOpen: boolean;
}

// Design 'Menus and per-screen enablement'. `workspace` is a workspace with no
// canvas open. An open modal disables main-window actions so the window
// cannot act behind it.
export function menuState(screen: Screen, modalOpen: boolean, toastOpen: boolean, context: { wizardOpen: boolean; focusedWindow: "main" | "settings" } = { wizardOpen: false, focusedWindow: "main" }): MenuEnabled {
  const settings = !context.wizardOpen;
  if (modalOpen || context.focusedWindow === "settings") return { settings, addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false };
  return { settings, addProject: true, home: screen !== "home", canvasView: screen === "canvas", undoRemove: toastOpen, quickOpen: true };
}
