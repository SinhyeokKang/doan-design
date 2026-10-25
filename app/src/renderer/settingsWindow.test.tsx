import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { SettingsWindow } from "./settingsWindow";

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
}));
afterEach(() => { harness.effects = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

test("Settings focus checks connections at most once per 60 seconds and removes its listener", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const events = new EventTarget();
  const readSetup = vi.fn(async () => ({ kind: "stale" }));
  vi.stubGlobal("window", {
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    doanSettings: { readSetup, onSetupStatus: () => () => {}, onTarget: () => () => {}, getTab: async () => "connections", takeTarget: async () => null },
  });
  renderToStaticMarkup(<SettingsWindow />);
  const cleanup = harness.effects.map(effect => effect());
  await Promise.resolve();
  expect(readSetup).toHaveBeenCalledTimes(1);
  events.dispatchEvent(new Event("focus"));
  vi.advanceTimersByTime(59_999); events.dispatchEvent(new Event("focus"));
  expect(readSetup).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); events.dispatchEvent(new Event("focus"));
  expect(readSetup).toHaveBeenCalledTimes(2);
  events.dispatchEvent(new Event("focus"));
  expect(readSetup).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(60_000); events.dispatchEvent(new Event("focus"));
  expect(readSetup).toHaveBeenCalledTimes(3);
  cleanup.forEach(dispose => dispose?.());
  vi.advanceTimersByTime(60_000); events.dispatchEvent(new Event("focus"));
  expect(readSetup).toHaveBeenCalledTimes(3);
});
