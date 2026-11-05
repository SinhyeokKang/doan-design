import { describe, expect, it } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { foldedRing, readText, ringViews, rowView, shownUsage, usageBusy, usageFolds, USAGE_FOLD } from "./agentUsageView";

// The confirmed draft .doan/canvases/provider-usage.html (frames 02–04).
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const MIN = 60_000, HOUR = 60 * MIN;
// resetsAt: undefined drops the reset time.
const win = (over: Omit<Partial<UsageWindow>, "resetsAt"> & { resetsAt?: number | undefined } = {}): UsageWindow => {
  const { resetsAt, ...rest } = { id: "five_hour", label: "5-hour", usedPercent: 42, resetsAt: NOW + 2 * HOUR + 10 * MIN, ...over };
  return { ...rest, ...(resetsAt === undefined ? {} : { resetsAt }) };
};
const ok = (provider: UsageEntry["provider"], windows: UsageWindow[], over: Partial<UsageEntry> = {}): UsageEntry =>
  ({ provider, reading: { status: "ok", windows, readAt: NOW - 3 * MIN }, inFlight: false, ...over });

describe("shownUsage", () => {
  it("keeps the fixed provider order and never shows Antigravity", () => {
    const entries: UsageEntry[] = ["copilot", "antigravity", "cursor", "codex", "claude"].map(provider => ({ provider, inFlight: false }) as UsageEntry);
    expect(shownUsage(entries).map(entry => entry.provider)).toEqual(["claude", "codex", "cursor", "copilot"]);
    expect(shownUsage([{ provider: "antigravity", inFlight: false }])).toEqual([]);
  });
});

describe("ringViews", () => {
  it("shows the fullest window that has not reset, and an empty track otherwise", () => {
    const rings = ringViews([
      ok("claude", [win({ usedPercent: 42 }), win({ id: "seven_day", usedPercent: 18 }), win({ id: "old", usedPercent: 95, resetsAt: NOW - MIN })]),
      { provider: "codex", inFlight: true },
      { provider: "cursor", reading: { status: "unavailable", reason: "read_failed", readAt: NOW }, inFlight: false },
      { provider: "copilot", reading: { status: "ok", windows: [], unlimited: true, readAt: NOW }, inFlight: false },
    ], NOW);
    expect(rings.map(ring => [ring.provider, ring.value, ring.full])).toEqual([["claude", 42, false], ["codex", null, false], ["cursor", null, false], ["copilot", null, false]]);
  });

  it("leaves a connection that can't be used empty", () => {
    expect(ringViews([ok("claude", [win({ usedPercent: 80 })], { blocked: { readiness: { ready: false, cause: "reauth_required", action: "reauth" }, phase: "reauthRequired" } })], NOW)[0]).toMatchObject({ value: null, full: false });
  });

  it("turns danger at 70% or at a reported limit, with no warning step", () => {
    const [low, edge, limited] = ringViews([ok("claude", [win({ usedPercent: 69.9 })]), ok("codex", [win({ usedPercent: 70 })]), ok("cursor", [win({ usedPercent: 20, limited: true })])], NOW);
    expect([low!.full, edge!.full, limited!.full]).toEqual([false, true, true]);
  });

  it("puts the logo in the ring only with two or more providers", () => {
    expect(ringViews([ok("claude", [win()])], NOW)[0]!.logo).toBeNull();
    expect(ringViews([ok("claude", [win()]), { provider: "antigravity", inFlight: false }], NOW)).toHaveLength(1);
    expect(ringViews([ok("claude", [win()]), { provider: "antigravity", inFlight: false }], NOW)[0]!.logo).toBeNull();
    expect(ringViews([ok("claude", [win()]), ok("codex", [win()])], NOW).map(ring => ring.logo)).toEqual(["provider-logos/claude.png", "provider-logos/codex.png"]);
  });
});

describe("folding", () => {
  it("folds when the rings do not fit the free end of the header", () => {
    // 4 rings: 4 × 24 + 3 × 4 gaps + 2 × 4 inset = 116, after the minimum gap to the tabs.
    expect(usageFolds(116 + USAGE_FOLD.gap, 4)).toBe(false);
    expect(usageFolds(115 + USAGE_FOLD.gap, 4)).toBe(true);
    expect(usageFolds(0, 1)).toBe(false);
    expect(usageFolds(Number.NaN, 3)).toBe(false);
  });

  it("keeps the highest value, a reported limit first, and counts the rest", () => {
    const rings = ringViews([ok("claude", [win({ usedPercent: 42 })]), ok("codex", [win({ usedPercent: 30, limited: true })]), ok("cursor", [win({ usedPercent: 81 })]), { provider: "copilot", inFlight: true }], NOW);
    expect(foldedRing(rings)).toEqual({ ring: rings[1], more: 3 });
    const plain = ringViews([ok("claude", [win({ usedPercent: 42 })]), ok("cursor", [win({ usedPercent: 81 })])], NOW);
    expect(foldedRing(plain)).toEqual({ ring: plain[1], more: 1 });
    const empty = ringViews([{ provider: "claude", inFlight: true }, { provider: "codex", inFlight: true }], NOW);
    expect(foldedRing(empty)).toEqual({ ring: empty[0], more: 1 });
  });
});

describe("readText", () => {
  it("says just now within a minute, then minutes, hours and days", () => {
    expect(readText(NOW - 59_000, NOW)).toBe("Updated just now");
    expect(readText(NOW + 5_000, NOW)).toBe("Updated just now");
    expect(readText(NOW - 3 * MIN, NOW)).toBe("Updated 3m ago");
    expect(readText(NOW - 59 * MIN, NOW)).toBe("Updated 59m ago");
    expect(readText(NOW - 2 * HOUR, NOW)).toBe("Updated 2h ago");
    expect(readText(NOW - 26 * HOUR, NOW)).toBe("Updated 1d ago");
  });
});

describe("rowView", () => {
  it("draws each window's line and bar under the last read time", () => {
    const row = rowView(ok("claude", [win(), win({ id: "seven_day", label: "Weekly", usedPercent: 78, resetsAt: NOW + 4 * 24 * HOUR + 6 * HOUR }), win({ id: "x", label: "Weekly · Fable", usedPercent: 0, resetsAt: undefined })]), NOW);
    expect(row).toMatchObject({ provider: "claude", name: "Claude Code", logo: "provider-logos/claude.png", read: "Updated 3m ago", note: null });
    expect(row.windows).toEqual([
      { id: "five_hour", label: "5-hour", text: "42% used · resets in 2h 10m", bar: 42, full: false, limited: false },
      { id: "seven_day", label: "Weekly", text: "78% used · resets in 4d 6h", bar: 78, full: true, limited: false },
      { id: "x", label: "Weekly · Fable", text: "0% used", bar: 0, full: false, limited: false },
    ]);
  });

  it("says Limit reached only when reported, and a plain 100% otherwise", () => {
    const [limited, full] = rowView(ok("codex", [win({ usedPercent: 100, limited: true }), win({ id: "b", usedPercent: 100, resetsAt: undefined })]), NOW).windows;
    expect(limited).toMatchObject({ text: "Limit reached · resets in 2h 10m", full: true, limited: true });
    expect(full).toMatchObject({ text: "100% used", full: true, limited: false });
  });

  it("empties the bar of a window whose reset passed", () => {
    expect(rowView(ok("copilot", [win({ label: "Chat", usedPercent: 90, resetsAt: NOW - MIN, limited: true })]), NOW).windows[0]).toEqual({ id: "five_hour", label: "Chat", text: "Reset · updating", bar: null, full: false, limited: false });
  });

  it("keeps the previous values while reading again and says Updating…", () => {
    const row = rowView(ok("codex", [win({ usedPercent: 38 })], { inFlight: true }), NOW);
    expect(row.read).toBe("Updating…");
    expect(row.windows[0]!.text).toBe("38% used · resets in 2h 10m");
  });

  it("gives one line for each reason instead of windows", () => {
    const note = (entry: UsageEntry) => { const row = rowView(entry, NOW); return [row.note, row.read, row.windows.length]; };
    const reading = (reason: "not_supported" | "no_plan_limits" | "read_failed") => ({ status: "unavailable" as const, reason, readAt: NOW });
    expect(note({ provider: "copilot", inFlight: true })).toEqual([{ text: "Reading usage…" }, null, 0]);
    expect(note({ provider: "copilot", reading: { status: "ok", windows: [], unlimited: true, readAt: NOW }, inFlight: false })).toEqual([{ text: "Unlimited" }, "Updated just now", 0]);
    expect(note({ provider: "codex", reading: reading("not_supported"), inFlight: false })).toEqual([{ text: "Usage isn’t available for Codex." }, null, 0]);
    expect(note({ provider: "claude", reading: reading("no_plan_limits"), inFlight: false })).toEqual([{ text: "Claude Code isn’t on a plan with usage limits." }, null, 0]);
    expect(note({ provider: "cursor", reading: reading("read_failed"), inFlight: false })).toEqual([{ text: "Couldn’t read usage. Doan tries again when you open this.", kind: "error" }, null, 0]);
    expect(note({ provider: "claude", reading: reading("read_failed"), inFlight: false, blocked: { readiness: { ready: false, cause: "reauth_required", action: "reauth" }, phase: "reauthRequired" } })).toEqual([{ text: "Your Claude Code connection expired. Sign in again.", kind: "warn" }, null, 0]);
    expect(note({ provider: "codex", inFlight: false, blocked: { readiness: { ready: false, cause: "version_unsupported", action: "update" }, phase: "connected" } })).toEqual([{ text: "This version is older than Doan supports.", kind: "warn" }, null, 0]);
    expect(note({ provider: "cursor", inFlight: false, blocked: { readiness: { ready: false, cause: "unverified", action: "retry" }, phase: "connected", error: "check_failed" } })).toEqual([{ text: "Couldn’t check your connections.", kind: "warn" }, null, 0]);
  });
});

describe("usageBusy", () => {
  it("is busy while any shown provider reads", () => {
    expect(usageBusy([{ provider: "claude", inFlight: false }, { provider: "codex", inFlight: true }])).toBe(true);
    expect(usageBusy([{ provider: "claude", inFlight: false }, { provider: "antigravity", inFlight: true }])).toBe(false);
  });
});
