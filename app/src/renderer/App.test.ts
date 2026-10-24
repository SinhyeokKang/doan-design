import { expect, it, vi } from "vitest";
import { App } from "./App";

const harness = vi.hoisted(() => ({ effects: [] as (() => (() => void) | undefined)[], dispose: vi.fn(), command: vi.fn(), updateEntries: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => (() => void) | undefined) => { harness.effects.push(effect); },
  useRef: () => ({ current: {} }),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
}));
vi.mock("./CanvasController", async importOriginal => ({
  ...await importOriginal<typeof import("./CanvasController")>(),
  CanvasController: class {
    dispose = harness.dispose;
    command = harness.command;
    updateEntries = harness.updateEntries;
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
