import { describe, expect, it } from "vitest";
import type { UsageEntry, UsageReading, UsageWindow } from "../main/agentAuth/usageTypes";
import { blockedText, ringLimited, ringValue, usageDescription, usageText } from "./agentUsage";

const NOW = Date.parse("2026-11-05T05:00:00Z");
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const w = (usedPercent: number, more: Partial<UsageWindow> = {}): UsageWindow => ({ id: "w", label: "5-hour", usedPercent, ...more });
const ok = (...windows: UsageWindow[]): UsageReading => ({ status: "ok", windows, readAt: NOW - MIN });
const unavailable = (reason: "not_supported" | "no_plan_limits" | "read_failed"): UsageReading => ({ status: "unavailable", reason, readAt: NOW - MIN });

describe("ringValue", () => {
  it("is the highest used share among windows whose reset time has not passed", () => {
    expect(ringValue({ reading: ok(w(42, { resetsAt: NOW + HOUR }), w(18), w(90, { resetsAt: NOW })) }, NOW)).toBe(42);
  });
  it.each([
    ["no reading yet", {}],
    ["no windows", { reading: ok() }],
    ["every window past its reset", { reading: ok(w(80, { resetsAt: NOW - 1 })) }],
    ["unlimited", { reading: { status: "ok", windows: [], unlimited: true, readAt: NOW } as UsageReading }],
    ["unavailable", { reading: unavailable("read_failed") }],
    ["a connection that can't be used", { reading: ok(w(42)), blocked: "reauth_required" }],
  ] as [string, Pick<UsageEntry, "reading" | "blocked">][])("is null with %s", (_, entry) => {
    expect(ringValue(entry, NOW)).toBeNull();
  });
});

describe("ringLimited", () => {
  it("is true when a window that has not reset yet is limited", () => {
    expect(ringLimited({ reading: ok(w(10), w(40, { limited: true, resetsAt: NOW + HOUR })) }, NOW)).toBe(true);
  });
  it.each([
    ["a limited window past its reset", { reading: ok(w(100, { limited: true, resetsAt: NOW - 1 })) }],
    ["no limited window", { reading: ok(w(100)) }],
    ["no windows", { reading: ok() }],
    ["unlimited", { reading: { status: "ok", windows: [], unlimited: true, readAt: NOW } as UsageReading }],
    ["unavailable", { reading: unavailable("read_failed") }],
    ["no reading yet", {}],
    ["a connection that can't be used", { reading: ok(w(100, { limited: true })), blocked: "reauth_required" }],
  ] as [string, Pick<UsageEntry, "reading" | "blocked">][])("is false with %s", (_, entry) => {
    expect(ringLimited(entry, NOW)).toBe(false);
  });
});

describe("usageText", () => {
  it.each([
    [w(42, { resetsAt: NOW + 2 * HOUR + 10 * MIN }), "42% used · resets in 2h 10m"],
    [w(89, { resetsAt: NOW + 45 * MIN + 30_000 }), "89% used · resets in 45m"],
    [w(90, { resetsAt: NOW + 59_000 }), "90% used · resets in less than a minute"],
    [w(18, { resetsAt: NOW + 4 * DAY + 6 * HOUR + 5 * MIN }), "18% used · resets in 4d 6h"],
    [w(38, { resetsAt: NOW + 21 * DAY }), "38% used · resets in 21d"],
    [w(1, { resetsAt: NOW + 3 * HOUR }), "1% used · resets in 3h"],
    [w(0), "0% used"],
    [w(2.5), "3% used"],
    [w(100), "100% used"],
    [w(100, { limited: true, resetsAt: NOW + HOUR }), "Limit reached · resets in 1h"],
    [w(100, { limited: true }), "Limit reached"],
    [w(97, { resetsAt: NOW }), "Reset · updating"],
    [w(100, { limited: true, resetsAt: NOW - DAY }), "Reset · updating"],
  ])("%o reads %s", (window, text) => {
    expect(usageText(window, NOW)).toBe(text);
  });
});

describe("blockedText", () => {
  it.each([
    ["reauth_required", "Claude Code’s sign-in expired"],
    ["version_unsupported", "Claude Code needs an update"],
    ["version_incompatible", "Claude Code needs an update"],
    ["unverified", "Claude Code isn’t available right now"],
  ] as const)("%s", (cause, text) => {
    expect(blockedText("claude", cause)).toBe(text);
  });
});

describe("usageDescription", () => {
  it("names every provider in the fixed order with its state", () => {
    const entries: UsageEntry[] = [
      { provider: "copilot", inFlight: true },
      { provider: "cursor", reading: unavailable("read_failed"), inFlight: false },
      { provider: "codex", reading: ok(w(100, { limited: true, resetsAt: NOW + DAY })), inFlight: false },
      { provider: "claude", reading: ok(w(42.4, { resetsAt: NOW + HOUR }), w(7)), inFlight: false },
    ];
    expect(usageDescription(entries, NOW)).toBe("Claude Code 42% used. Codex limit reached. Cursor usage unavailable. GitHub Copilot reading usage.");
  });
  it("says unlimited, the Settings › Agents cause and a reset in progress", () => {
    const entries: UsageEntry[] = [
      { provider: "copilot", reading: { status: "ok", windows: [], unlimited: true, readAt: NOW }, inFlight: false },
      { provider: "claude", reading: ok(w(42)), inFlight: false, blocked: "reauth_required" },
      { provider: "codex", reading: ok(w(60, { resetsAt: NOW - MIN })), inFlight: true },
      { provider: "cursor", reading: unavailable("no_plan_limits"), inFlight: false },
    ];
    expect(usageDescription(entries, NOW)).toBe("Claude Code’s sign-in expired. Codex usage resetting. Cursor usage unavailable. GitHub Copilot unlimited.");
  });
  it("does not report a limit whose reset time has passed", () => {
    const entries: UsageEntry[] = [{ provider: "codex", reading: ok(w(100, { limited: true, resetsAt: NOW - 1 }), w(20, { resetsAt: NOW + HOUR })), inFlight: false }];
    expect(usageDescription(entries, NOW)).toBe("Codex 20% used.");
  });
  it("leaves Antigravity out", () => {
    const entries: UsageEntry[] = [{ provider: "antigravity", inFlight: false }, { provider: "claude", reading: ok(w(5)), inFlight: false }];
    expect(usageDescription(entries, NOW)).toBe("Claude Code 5% used.");
  });
});
