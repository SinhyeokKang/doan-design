import { describe, expect, it } from "vitest";
import type { AuthStatusDto, Provider } from "../main/agentAuth/types";
import type { UsageBlock, UsageEntry, UsageReading, UsageWindow } from "../main/agentAuth/usageTypes";
import { providerView } from "./agentAuthView";
import { ringLimited, ringValue, usageDescription, usageText } from "./agentUsage";
import { rowView } from "./agentUsageView";

const NOW = Date.parse("2026-11-05T05:00:00Z");
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const w = (usedPercent: number, more: Partial<UsageWindow> = {}): UsageWindow => ({ id: "w", label: "5-hour", usedPercent, ...more });
const ok = (...windows: UsageWindow[]): UsageReading => ({ status: "ok", windows, readAt: NOW - MIN });
const EXPIRED: UsageBlock = { readiness: { ready: false, cause: "reauth_required", action: "reauth" }, phase: "reauthRequired" };
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
    ["a connection that can't be used", { reading: ok(w(42)), blocked: EXPIRED }],
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
    ["a connection that can't be used", { reading: ok(w(100, { limited: true })), blocked: EXPIRED }],
  ] as [string, Pick<UsageEntry, "reading" | "blocked">][])("is false with %s", (_, entry) => {
    expect(ringLimited(entry, NOW)).toBe(false);
  });
});

// PRODUCT §5 item 0 'Agent usage': the ring follows the provider's weekly window, else its longest one.
describe("ring window", () => {
  const FIVE = { periodMins: 300 }, WEEK = { periodMins: 10080 };
  const claude = (...windows: UsageWindow[]) => ({ reading: ok(...windows) });
  it("is Claude's overall Weekly window, not the 5-hour or a model-scoped weekly one", () => {
    const entry = claude(w(90, { id: "five_hour", ...FIVE }), w(30, { id: "seven_day", label: "Weekly", ...WEEK }), w(95, { id: "seven_day_opus", label: "Weekly · Opus", ...WEEK }));
    expect(ringValue(entry, NOW)).toBe(30);
    expect(ringLimited(entry, NOW)).toBe(false);
  });
  it("is Codex's weekly window, whichever key carries it", () => {
    const entry = claude(w(80, { id: "primary", ...FIVE }), w(12, { id: "secondary", label: "Weekly", ...WEEK }));
    expect(ringValue(entry, NOW)).toBe(12);
  });
  it("ignores a limit reported on another window", () => {
    const entry = claude(w(100, { id: "five_hour", ...FIVE, limited: true, resetsAt: NOW + HOUR }), w(40, { id: "seven_day", label: "Weekly", ...WEEK }));
    expect([ringValue(entry, NOW), ringLimited(entry, NOW)]).toEqual([40, false]);
  });
  it("is limited when the weekly window's limit is reported", () => {
    const entry = claude(w(20, { id: "five_hour", ...FIVE }), w(50, { id: "seven_day", label: "Weekly", ...WEEK, limited: true, resetsAt: NOW + DAY }));
    expect([ringValue(entry, NOW), ringLimited(entry, NOW)]).toEqual([50, true]);
  });
  it("resets with the weekly window instead of falling back to another", () => {
    const entry = claude(w(60, { id: "five_hour", ...FIVE, resetsAt: NOW + HOUR }), w(100, { id: "seven_day", label: "Weekly", ...WEEK, limited: true, resetsAt: NOW - 1 }));
    expect([ringValue(entry, NOW), ringLimited(entry, NOW)]).toEqual([null, false]);
  });
  it("is the longest window without a weekly one", () => {
    const entry = claude(w(70, { id: "primary", label: "5-hour", ...FIVE }), w(25, { id: "secondary", label: "30-day", periodMins: 43200 }));
    expect(ringValue(entry, NOW)).toBe(25);
  });
  it("is the fullest of equally long windows, and a window with a period outranks one without", () => {
    expect(ringValue(claude(w(10, { label: "Weekly · Opus", ...WEEK }), w(35, { label: "Weekly · Sonnet", ...WEEK }), w(90, FIVE)), NOW)).toBe(35);
    expect(ringValue(claude(w(15, { id: "auto", label: "Auto" }), w(64, { id: "api", label: "API" })), NOW)).toBe(64);
    expect(ringValue(claude(w(80, { label: "Primary" }), w(5, { label: "2-hour", periodMins: 120 })), NOW)).toBe(5);
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

// ARCHITECTURE §7 'Agent usage': a connection that can't be used reads as its Settings > Agents connection row does. The popover row
// sits under the provider's name and keeps the sentence; the button's description leads a nameless one with the name.
describe("blocked wording", () => {
  const block = (cause: UsageBlock["readiness"]["cause"], more: Partial<UsageBlock> = {}): UsageBlock => ({ readiness: { ready: false, cause, action: "retry" }, phase: "connected", ...more });
  it.each([
    ["claude", block("reauth_required", { phase: "reauthRequired" }), "Your Claude Code connection expired. Sign in again.", "Your Claude Code connection expired. Sign in again."],
    ["claude", block("reauth_required"), "Sign in to Claude Code again so Doan can confirm your organization.", "Sign in to Claude Code again so Doan can confirm your organization."],
    ["cursor", block("unverified", { error: "check_failed" }), "Couldn’t check your connections.", "Cursor: Couldn’t check your connections."],
    ["copilot", block("unverified", { error: "network" }), "Couldn’t reach GitHub Copilot. Check your connection and try again.", "Couldn’t reach GitHub Copilot. Check your connection and try again."],
    ["cursor", block("unverified", { error: "sign_in_failed" }), "Sign-in didn’t finish. Try again.", "Cursor: Sign-in didn’t finish. Try again."],
    ["cursor", block("version_unknown"), "Couldn’t read the Cursor version.", "Couldn’t read the Cursor version."],
    ["codex", block("version_incompatible"), "Doan can’t run this Codex version.", "Doan can’t run this Codex version."],
    ["codex", block("version_unsupported"), "This version is older than Doan supports.", "Codex: This version is older than Doan supports."],
    ["copilot", block("cli_missing"), "Not installed.", "GitHub Copilot: Not installed."],
    ["codex", block("busy", { phase: "signingOut", attempt: "signOut" }), "Signing out of Codex.", "Signing out of Codex."],
    ["codex", block("busy", { phase: "signingIn", attempt: "signIn" }), "Preparing Codex sign-in.", "Preparing Codex sign-in."],
    ["codex", block("sign_out_failed", { phase: "error", error: "sign_out_failed" }), "Doan couldn’t sign out of Codex. Sign out again before you use it.", "Doan couldn’t sign out of Codex. Sign out again before you use it."],
    ["codex", block("account_mismatch", { error: "account_mismatch" }), "You signed in with a different Codex account. Sign in again with the same account, or sign out first.", "You signed in with a different Codex account. Sign in again with the same account, or sign out first."],
    ["claude", block("tools_missing"), "Doan couldn’t find its command-line tool. Reinstall Doan, then check again.", "Claude Code: Doan couldn’t find its command-line tool. Reinstall Doan, then check again."],
  ] as [Provider, UsageBlock, string, string][])("%s %o", (provider, blocked, row, description) => {
    const entry: UsageEntry = { provider, inFlight: false, blocked };
    expect(rowView(entry, NOW).note).toEqual({ text: row, kind: "warn" });
    expect(usageDescription([entry], NOW)).toBe(description);
    // The same sentence the Settings > Agents row leads with for that connection, its account included.
    const status: AuthStatusDto = {
      provider, revision: 3, generation: 1, phase: blocked.phase, account: { email: "ada@example.com" }, readiness: blocked.readiness, actions: [],
      attempt: blocked.attempt ? { id: "a1", kind: blocked.attempt, cancelling: false } : null, error: blocked.error ? { code: blocked.error, retryable: true } : null,
    };
    const settings = providerView(status, { settings: true });
    expect(row.replace(/\.$/, "")).toBe((settings.notice?.title ?? settings.notice?.body ?? settings.detail)?.replace(/\.$/, ""));
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
      { provider: "claude", reading: ok(w(42)), inFlight: false, blocked: EXPIRED },
      { provider: "codex", reading: ok(w(60, { resetsAt: NOW - MIN })), inFlight: true },
      { provider: "cursor", reading: unavailable("no_plan_limits"), inFlight: false },
    ];
    expect(usageDescription(entries, NOW)).toBe("Your Claude Code connection expired. Sign in again. Codex usage resetting. Cursor usage unavailable. GitHub Copilot unlimited.");
  });
  it("does not report a limit whose reset time has passed", () => {
    const entries: UsageEntry[] = [{ provider: "codex", reading: ok(w(100, { limited: true, resetsAt: NOW - 1 }), w(20, { resetsAt: NOW + HOUR })), inFlight: false }];
    expect(usageDescription(entries, NOW)).toBe("Codex 20% used.");
  });
  it("reads the ring's weekly window, not a fuller or limited 5-hour one", () => {
    const entries: UsageEntry[] = [{ provider: "claude", reading: ok(w(100, { id: "five_hour", periodMins: 300, limited: true }), w(23, { id: "seven_day", label: "Weekly", periodMins: 10080 })), inFlight: false }];
    expect(usageDescription(entries, NOW)).toBe("Claude Code 23% used.");
  });
  it("leaves Antigravity out", () => {
    const entries: UsageEntry[] = [{ provider: "antigravity", inFlight: false }, { provider: "claude", reading: ok(w(5)), inFlight: false }];
    expect(usageDescription(entries, NOW)).toBe("Claude Code 5% used.");
  });
});
