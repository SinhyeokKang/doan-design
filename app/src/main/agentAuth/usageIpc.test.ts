import { describe, expect, it, vi } from "vitest";
import { usageRequest } from "./usageIpc";
import type { UsageEntry } from "./usageTypes";

const ENTRIES: UsageEntry[] = [{ provider: "claude", inFlight: false }];
function service() { return { entries: vi.fn(() => ENTRIES), trigger: vi.fn() }; }

describe("agent-usage:read", () => {
  it.each([[undefined], [{}], [{ trigger: undefined }]])("answers the current entries without reading for %j", value => {
    const s = service();
    expect(usageRequest(s, value)).toBe(ENTRIES);
    expect(s.trigger).not.toHaveBeenCalled();
  });
  it.each(["open", "refresh"] as const)("starts the %s trigger, then answers the entries", trigger => {
    const s = service();
    expect(usageRequest(s, { trigger })).toBe(ENTRIES);
    expect(s.trigger).toHaveBeenCalledExactlyOnceWith({ kind: trigger });
  });
  it.each([[null], [[]], ["open"], [{ trigger: "start" }], [{ trigger: "signIn" }], [{ trigger: "turnEnd" }], [{ trigger: "open", provider: "claude" }], [{ trigger: 1 }]])("refuses %j with an empty list and reads nothing", value => {
    const s = service();
    expect(usageRequest(s, value)).toEqual([]);
    expect(s.trigger).not.toHaveBeenCalled();
    expect(s.entries).not.toHaveBeenCalled();
  });
});
