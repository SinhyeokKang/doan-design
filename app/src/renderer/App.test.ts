import { expect, it, test, vi } from "vitest";
import { App, menuCommand } from "./App";

const harness = vi.hoisted(() => ({ effects: [] as (() => (() => void) | undefined)[], dispose: vi.fn(), command: vi.fn(), updateEntries: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => (() => void) | undefined) => { harness.effects.push(effect); },
  useLayoutEffect: () => {},
  useRef: () => ({ current: {} }),
  useCallback: <T,>(callback: T) => callback,
  useMemo: <T,>(factory: () => T) => factory(),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
}));
vi.mock("./Toast", () => ({ useToast: () => ({ toast: null, element: null, show: vi.fn(), action: vi.fn() }) }));
vi.mock("./CanvasController", async importOriginal => ({
  ...await importOriginal<typeof import("./CanvasController")>(),
  CanvasController: class {
    dispose = harness.dispose;
    command = harness.command;
    updateEntries = harness.updateEntries;
    onPicked = vi.fn();
    onCapture = vi.fn();
  },
}));

it("unsubscribes both preload bridges across StrictMode effect setup, cleanup and setup", () => {
  const folders = new Set<(value: []) => void>();
  const commands = new Set<(value: "fit") => void>();
  const folderOff = vi.fn();
  const commandOff = vi.fn();
  vi.stubGlobal("window", { doan: {
    onFolders: (listener: (value: []) => void) => { folders.add(listener); return () => { folders.delete(listener); folderOff(); }; },
    onViewCommand: (listener: (value: "fit") => void) => { commands.add(listener); return () => { commands.delete(listener); commandOff(); }; },
  } });
  try {
    App();
    const setup = harness.effects[0];
    expect(setup).toBeTypeOf("function");
    const firstCleanup = setup?.();
    firstCleanup?.();
    const finalCleanup = setup?.();
    expect(folders.size).toBe(1);
    expect(commands.size).toBe(1);
    folders.forEach(listener => listener([]));
    commands.forEach(listener => listener("fit"));
    expect(harness.updateEntries).toHaveBeenCalledTimes(1);
    expect(harness.command).not.toHaveBeenCalled();
    finalCleanup?.();
    expect(folderOff).toHaveBeenCalledTimes(2);
    expect(commandOff).toHaveBeenCalledTimes(2);
    expect(harness.dispose).toHaveBeenCalledTimes(2);
    expect(folders.size).toBe(0);
    expect(commands.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});

// R-M ⚪5: a command App does not name runs no handler.
it("routes each menu command to its own handler, and an unknown or removed command reaches none", () => {
  const to = { home: vi.fn(), quickOpen: vi.fn(), newConversation: vi.fn(), pickFromCanvas: vi.fn(), toggleSidebar: vi.fn() };
  for (const name of ["nextResolved", "previousResolved", "future"]) menuCommand(name as never, to);
  for (const handler of Object.values(to)) expect(handler).not.toHaveBeenCalled();
  menuCommand("home", to); menuCommand("quickOpen", to);
  expect(to.home).toHaveBeenCalledOnce();
  expect(to.quickOpen).toHaveBeenCalledOnce();
  // buzz-project: File > New Conversation (⌘N).
  menuCommand("newConversation", to);
  expect(to.newConversation).toHaveBeenCalledOnce();
  // canvas-composer-polish spec 3: Edit > Pick from Canvas (⌘L); the removed Add Selection command reaches nothing.
  menuCommand("addSelectionToConversation" as never, to);
  expect(to.pickFromCanvas).not.toHaveBeenCalled();
  menuCommand("pickFromCanvas", to);
  expect(to.pickFromCanvas).toHaveBeenCalledOnce();
  // shell-panel-layout: View > Hide/Show Sidebar (⌘B).
  menuCommand("toggleSidebar", to);
  expect(to.toggleSidebar).toHaveBeenCalledOnce();
});
