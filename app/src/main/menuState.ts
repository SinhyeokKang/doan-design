export type Screen = "home" | "workspace" | "canvas";

export interface MenuEnabled {
  addProject: boolean;
  home: boolean;
  // Zoom In/Out, Actual Size, Fit, Reload Canvas.
  canvasView: boolean;
  undoRemove: boolean;
}

// Design 'Menus and per-screen enablement'. `workspace` is a workspace with no
// canvas open. An open modal disables every item: the window must not act
// behind it.
export function menuState(screen: Screen, modalOpen: boolean, toastOpen: boolean): MenuEnabled {
  if (modalOpen) return { addProject: false, home: false, canvasView: false, undoRemove: false };
  return { addProject: true, home: screen !== "home", canvasView: screen === "canvas", undoRemove: toastOpen };
}
