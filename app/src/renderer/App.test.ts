import { expect, it, test, vi } from "vitest";
import { App, menuCommand, pickFocusReturns } from "./App";

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

// R-M ⚪5: a command App does not name must not run the Undo toast's action.
it("routes each menu command to its own handler, and the removed Resolved Comment commands never reach Undo", () => {
  const to = { home: vi.fn(), quickOpen: vi.fn(), undo: vi.fn(), newConversation: vi.fn(), addSelection: vi.fn() };
  menuCommand("nextResolved" as never, to);
  menuCommand("previousResolved" as never, to);
  expect(to.undo).not.toHaveBeenCalled();
  menuCommand("undoRemove", to);
  expect(to.undo).toHaveBeenCalledOnce();
  menuCommand("future" as never, to);
  menuCommand("home", to); menuCommand("quickOpen", to);
  expect(to.undo).toHaveBeenCalledOnce();
  expect(to.home).toHaveBeenCalledOnce();
  expect(to.quickOpen).toHaveBeenCalledOnce();
  // buzz-project: File > New Conversation (⌘N).
  menuCommand("newConversation", to);
  expect(to.newConversation).toHaveBeenCalledOnce();
  expect(to.undo).toHaveBeenCalledOnce();
  // buzz-canvas-conversation: Edit > Add Selection to Conversation (⌘L).
  menuCommand("addSelectionToConversation", to);
  expect(to.addSelection).toHaveBeenCalledOnce();
  expect(to.undo).toHaveBeenCalledOnce();
});

// design §2 'Focus return' and POSTMORTEM 2026-10-23 R-L: focus goes back to the composer only while it is still
// where the pick left it, and never into an IME composition.
test.each([
  ["start", false, true], ["page", false, true], ["canvas", false, true], ["field", false, true],
  ["elsewhere", false, false], ["start", true, false], ["field", true, false],
] as const)("a pick that ended with focus on %s (composing: %s) returns focus: %s", (where, composing, returns) => {
  expect(pickFocusReturns(where, composing)).toBe(returns);
});
