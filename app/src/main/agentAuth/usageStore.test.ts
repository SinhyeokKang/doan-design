import { describe, expect, it } from "vitest";
import { UsageStore } from "./usageStore";
import type { UsageReading } from "./usageTypes";

const reading = (usedPercent: number): UsageReading => ({ status: "ok", readAt: 1, windows: [{ id: "five_hour", label: "5-hour", usedPercent }] });

describe("UsageStore", () => {
  it("is empty until a connection is known", () => {
    const store = new UsageStore();
    expect(store.get("claude")).toBeUndefined();
    expect(store.begin("claude", "conn-1")).toBe(false);
  });

  it("keeps a read under the connection it started for", () => {
    const store = new UsageStore();
    store.connect("claude", "conn-1");
    expect(store.get("claude")).toEqual({ inFlight: false });
    expect(store.begin("claude", "conn-1")).toBe(true);
    expect(store.get("claude")).toEqual({ inFlight: true });
    expect(store.settle("claude", "conn-1", reading(42))).toBe(true);
    expect(store.get("claude")).toEqual({ inFlight: false, reading: reading(42) });
  });

  it("keeps the previous reading while reading again", () => {
    const store = new UsageStore();
    store.connect("codex", "conn-1");
    store.begin("codex", "conn-1");
    store.settle("codex", "conn-1", reading(10));
    store.begin("codex", "conn-1");
    expect(store.get("codex")).toEqual({ inFlight: true, reading: reading(10) });
  });

  it("clears a provider when its connectionId changes and keeps it when it does not", () => {
    const store = new UsageStore();
    store.connect("claude", "conn-1");
    store.begin("claude", "conn-1");
    store.settle("claude", "conn-1", reading(42));
    store.connect("claude", "conn-1");
    expect(store.get("claude")?.reading).toEqual(reading(42));
    store.connect("claude", "conn-2");
    expect(store.get("claude")).toEqual({ inFlight: false });
  });

  it("forgets a provider that signs out", () => {
    const store = new UsageStore();
    store.connect("cursor", "conn-1");
    store.begin("cursor", "conn-1");
    store.settle("cursor", "conn-1", reading(5));
    store.connect("cursor", null);
    expect(store.get("cursor")).toBeUndefined();
  });

  it("drops a read that started under an old connectionId", () => {
    const store = new UsageStore();
    store.connect("claude", "conn-1");
    store.begin("claude", "conn-1");
    store.connect("claude", "conn-2");
    expect(store.settle("claude", "conn-1", reading(99))).toBe(false);
    expect(store.get("claude")).toEqual({ inFlight: false });
    expect(store.begin("claude", "conn-1")).toBe(false);
  });

  it("drops a read that ends after sign-out", () => {
    const store = new UsageStore();
    store.connect("copilot", "conn-1");
    store.begin("copilot", "conn-1");
    store.connect("copilot", null);
    expect(store.settle("copilot", "conn-1", reading(1))).toBe(false);
    expect(store.get("copilot")).toBeUndefined();
  });

  it("keeps providers apart", () => {
    const store = new UsageStore();
    store.connect("claude", "conn-1");
    store.connect("codex", "conn-9");
    store.begin("claude", "conn-1");
    store.settle("claude", "conn-1", reading(1));
    store.connect("codex", "conn-10");
    expect(store.get("claude")?.reading).toEqual(reading(1));
  });
});
