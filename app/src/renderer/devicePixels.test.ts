import { afterEach, expect, test, vi } from "vitest";
import { onDevicePixelRatio } from "./devicePixels";

afterEach(() => { vi.unstubAllGlobals(); });

// One media query list per query, as Chromium keeps them.
function queries() {
  const lists = new Map<string, { listeners: Set<() => void> }>();
  vi.stubGlobal("matchMedia", (query: string) => {
    if (!lists.has(query)) lists.set(query, { listeners: new Set() });
    const list = lists.get(query)!;
    return { addEventListener: (_: string, listener: () => void) => list.listeners.add(listener), removeEventListener: (_: string, listener: () => void) => list.listeners.delete(listener) };
  });
  return { change(query: string) { for (const listener of [...lists.get(query)?.listeners ?? []]) listener(); }, count: () => [...lists.values()].reduce((sum, list) => sum + list.listeners.size, 0) };
}

test("a change of devicePixelRatio calls back, and the next change is heard on the new ratio's query", () => {
  const media = queries(), changed = vi.fn();
  vi.stubGlobal("devicePixelRatio", 1);
  const stop = onDevicePixelRatio(changed);
  vi.stubGlobal("devicePixelRatio", 2);
  media.change("(resolution: 1dppx)");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(media.count()).toBe(1);
  vi.stubGlobal("devicePixelRatio", 1);
  media.change("(resolution: 2dppx)");
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  expect(media.count()).toBe(0);
});
