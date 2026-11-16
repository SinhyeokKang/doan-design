import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import { createOpaqueFallback, type FallbackWindow } from "./opaqueFallback";

const REDUCE = { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] };

function fakeWindow(options: { attachThrows?: boolean; bg?: string } = {}) {
  let attached = false;
  let destroyed = false;
  const events = new EventEmitter();
  const window = {
    isDestroyed: () => destroyed,
    setVibrancy: vi.fn<(type: null) => void>(),
    setBackgroundColor: vi.fn<(color: string) => void>(),
    webContents: {
      debugger: {
        isAttached: () => attached,
        attach: vi.fn(() => { if (options.attachThrows) throw new Error("Another debugger is already attached"); attached = true; }),
        sendCommand: vi.fn<(method: string, params: object) => Promise<unknown>>(() => Promise.resolve({})),
      },
      executeJavaScript: vi.fn<(code: string) => Promise<unknown>>(() => Promise.resolve(options.bg ?? "#f1f1f2")),
      on: (event: "did-finish-load", listener: () => void) => events.on(event, listener),
    },
  } satisfies FallbackWindow;
  return { window, destroy: () => { destroyed = true; }, load: () => events.emit("did-finish-load"), detach: () => { attached = false; } };
}

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });

test("an adopted window keeps its vibrancy until the fallback triggers", () => {
  const { window } = fakeWindow();
  createOpaqueFallback().adopt(window);
  expect(window.setVibrancy).not.toHaveBeenCalled();
  expect(window.webContents.debugger.attach).not.toHaveBeenCalled();
});

test("the trigger drops vibrancy, emulates reduced transparency and paints the app background natively", async () => {
  const { window } = fakeWindow({ bg: "#f1f1f2" });
  const fallback = createOpaqueFallback();
  fallback.adopt(window);
  fallback.trigger();
  expect(window.setVibrancy).toHaveBeenCalledWith(null);
  expect(window.webContents.debugger.sendCommand).toHaveBeenCalledWith("Emulation.setEmulatedMedia", REDUCE);
  // On the page's own session only: no session id, so no canvas iframe target gets the emulated media.
  expect(window.webContents.debugger.sendCommand.mock.calls.every(call => call.length === 2)).toBe(true);
  await vi.waitFor(() => expect(window.setBackgroundColor).toHaveBeenCalledWith("#f1f1f2"));
});

test("a window adopted after the trigger turns opaque at once", () => {
  const { window } = fakeWindow();
  const fallback = createOpaqueFallback();
  fallback.trigger();
  fallback.adopt(window);
  expect(window.setVibrancy).toHaveBeenCalledWith(null);
  expect(window.webContents.debugger.sendCommand).toHaveBeenCalledWith("Emulation.setEmulatedMedia", REDUCE);
});

test("a second trigger does not apply again", () => {
  const { window } = fakeWindow();
  const fallback = createOpaqueFallback();
  fallback.adopt(window);
  fallback.trigger();
  fallback.trigger();
  expect(window.setVibrancy).toHaveBeenCalledTimes(1);
  expect(window.webContents.debugger.attach).toHaveBeenCalledTimes(1);
});

test("a destroyed window is skipped", () => {
  const { window, destroy } = fakeWindow();
  const fallback = createOpaqueFallback();
  fallback.adopt(window);
  destroy();
  fallback.trigger();
  expect(window.setVibrancy).not.toHaveBeenCalled();
});

test("a debugger that cannot attach still leaves the window without vibrancy, and the others are applied", () => {
  const busy = fakeWindow({ attachThrows: true }).window;
  const other = fakeWindow().window;
  const fallback = createOpaqueFallback();
  fallback.adopt(busy);
  fallback.adopt(other);
  expect(() => fallback.trigger()).not.toThrow();
  expect(busy.setVibrancy).toHaveBeenCalledWith(null);
  expect(other.webContents.debugger.sendCommand).toHaveBeenCalledWith("Emulation.setEmulatedMedia", REDUCE);
});

test("an empty background token leaves the native background as it is", async () => {
  const { window } = fakeWindow({ bg: "" });
  const fallback = createOpaqueFallback();
  fallback.adopt(window);
  fallback.trigger();
  await vi.waitFor(() => expect(window.webContents.executeJavaScript).toHaveBeenCalled());
  await Promise.resolve();
  expect(window.setBackgroundColor).not.toHaveBeenCalled();
});

test("a page loaded again after the fallback, its debugger gone with the old renderer, gets the emulation again", () => {
  const { window, load, detach } = fakeWindow();
  const fallback = createOpaqueFallback();
  fallback.adopt(window);
  fallback.trigger();
  detach();
  load();
  expect(window.webContents.debugger.attach).toHaveBeenCalledTimes(2);
  expect(window.webContents.debugger.sendCommand).toHaveBeenCalledTimes(2);
  expect(window.webContents.debugger.sendCommand).toHaveBeenLastCalledWith("Emulation.setEmulatedMedia", REDUCE);
});
