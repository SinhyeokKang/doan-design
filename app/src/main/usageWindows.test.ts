import { describe, expect, test, vi } from "vitest";
import { USAGE_CHANNELS } from "./agentAuth/usageIpc";
import type { UsageEntry } from "./agentAuth/usageTypes";
import { usagePublisher, usageVisible } from "./usageWindows";

// prototypeShown is the prototype window's own visible(): shown natively, not minimized and the app not hidden.
describe("usageVisible", () => {
  test.each([
    [{ mainShown: true, appHidden: false, prototypeShown: false }, true],
    [{ mainShown: true, appHidden: false, prototypeShown: true }, true],
    // The main window closed and the prototype window still in use: the drawer and Refresh read.
    [{ mainShown: false, appHidden: false, prototypeShown: true }, true],
    [{ mainShown: false, appHidden: false, prototypeShown: false }, false],
    // The whole app hidden (⌘H): the prototype window reports itself not shown then.
    [{ mainShown: true, appHidden: true, prototypeShown: false }, false],
  ])("%o reads: %s", (state, visible) => {
    expect(usageVisible(state)).toBe(visible);
  });
});

describe("usagePublisher", () => {
  test("sends every change to the main window and the prototype window", () => {
    const main = vi.fn(), prototype = vi.fn();
    const publish = usagePublisher({ main, prototype });
    const entries: UsageEntry[] = [{ provider: "claude", inFlight: true }];
    publish(entries);
    publish([]);
    expect(main.mock.calls).toEqual([[USAGE_CHANNELS.changed, entries], [USAGE_CHANNELS.changed, []]]);
    expect(prototype.mock.calls).toEqual(main.mock.calls);
  });
});
