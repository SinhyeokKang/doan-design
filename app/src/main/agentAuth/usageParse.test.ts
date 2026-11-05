import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claudeUsage, codexUsage, copilotUsage, cursorUsage, usageNotSupported } from "./usageParse";

const fixture = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}-usage.json`, import.meta.url), "utf8"));
const AT = Date.parse("2026-11-05T05:00:00Z");
const failed = { status: "unavailable", reason: "read_failed", readAt: AT };

describe("claudeUsage", () => {
  it("reads the PoC response's windows and ignores keys it does not know", () => {
    expect(claudeUsage(fixture("claude"), AT)).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "five_hour", label: "5-hour", usedPercent: 3, resetsAt: Date.parse("2026-11-05T07:50:00.453Z") },
      { id: "seven_day", label: "Weekly", usedPercent: 99, resetsAt: Date.parse("2026-11-07T04:00:00.453Z") },
      { id: "model_scoped:Fable", label: "Weekly · Fable", usedPercent: 0, resetsAt: Date.parse("2026-11-07T04:00:00Z") },
    ] });
  });
  it("names the Opus and Sonnet windows and skips null windows and null utilization", () => {
    const response = { rate_limits_available: true, rate_limits: {
      five_hour: null, seven_day: { utilization: null, resets_at: null },
      seven_day_opus: { utilization: 10, resets_at: null }, seven_day_sonnet: { utilization: 20 },
    } };
    expect(claudeUsage(response, AT)).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "seven_day_opus", label: "Weekly · Opus", usedPercent: 10 },
      { id: "seven_day_sonnet", label: "Weekly · Sonnet", usedPercent: 20 },
    ] });
  });
  it("reads no plan limits when the account has none", () => {
    expect(claudeUsage({ rate_limits_available: false, rate_limits: null }, AT)).toEqual({ status: "unavailable", reason: "no_plan_limits", readAt: AT });
  });
  it("clamps utilization to 0–100", () => {
    const reading = claudeUsage({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 130, resets_at: null }, seven_day: { utilization: -5, resets_at: null } } }, AT);
    expect(reading.status === "ok" && reading.windows.map(w => w.usedPercent)).toEqual([100, 0]);
  });
  it("marks a window limited only when the provider gives a locked reason", () => {
    const reading = claudeUsage({ rate_limits_available: true, rate_limits: {
      five_hour: { utilization: 100, resets_at: null, locked_reason: null }, seven_day: { utilization: 40, resets_at: null, locked_reason: "weekly_limit" },
    } }, AT);
    expect(reading.status === "ok" && reading.windows.map(w => [w.id, w.limited])).toEqual([["five_hour", undefined], ["seven_day", true]]);
  });
  it.each([
    ["not an object", "usage"],
    ["no rate_limits_available", { rate_limits: {} }],
    ["no rate_limits while available", { rate_limits_available: true, rate_limits: null }],
    ["a window that is not an object", { rate_limits_available: true, rate_limits: { five_hour: 3 } }],
    ["utilization that is not a number", { rate_limits_available: true, rate_limits: { five_hour: { utilization: "3", resets_at: null } } }],
    ["a reset time that is not a date", { rate_limits_available: true, rate_limits: { five_hour: { utilization: 3, resets_at: "soon" } } }],
    ["model_scoped that is not a list", { rate_limits_available: true, rate_limits: { model_scoped: {} } }],
    ["a model_scoped entry without a name", { rate_limits_available: true, rate_limits: { model_scoped: [{ utilization: 3 }] } }],
  ])("reads a response with %s as read_failed", (_, response) => {
    expect(claudeUsage(response, AT)).toEqual(failed);
  });
});

describe("codexUsage", () => {
  it("reads the PoC response's one 30-day window, reset seconds into ms", () => {
    expect(codexUsage(fixture("codex"), AT)).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "primary", label: "30-day", usedPercent: 38, resetsAt: 1795411967000 },
    ] });
  });
  it.each([[300, "5-hour"], [10080, "Weekly"], [120, "2-hour"], [2880, "2-day"], [90, "90-minute"], [null, "Primary"]])("names a %s-minute window %s", (mins, label) => {
    const reading = codexUsage({ rateLimits: { primary: { usedPercent: 1, windowDurationMins: mins } } }, AT);
    expect(reading.status === "ok" && reading.windows[0]!.label).toBe(label);
  });
  it("reads primary and secondary and clamps", () => {
    const reading = codexUsage({ rateLimits: { primary: { usedPercent: 140, windowDurationMins: 300, resetsAt: null }, secondary: { usedPercent: 5, windowDurationMins: 10080 } } }, AT);
    expect(reading).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "primary", label: "5-hour", usedPercent: 100 }, { id: "secondary", label: "Weekly", usedPercent: 5 },
    ] });
  });
  it("marks the fullest window limited when the provider reports a reached limit", () => {
    const reading = codexUsage({ rateLimits: { rateLimitReachedType: "rate_limit_reached",
      primary: { usedPercent: 40, windowDurationMins: 300 }, secondary: { usedPercent: 100, windowDurationMins: 10080 } } }, AT);
    expect(reading.status === "ok" && reading.windows.map(w => [w.id, w.limited])).toEqual([["primary", undefined], ["secondary", true]]);
  });
  it.each([
    ["no rateLimits", { ordinaryUsageAllowed: true }],
    ["a window without usedPercent", { rateLimits: { primary: { windowDurationMins: 300 } } }],
    ["a reset time that is not a number", { rateLimits: { primary: { usedPercent: 3, resetsAt: "1795411967" } } }],
  ])("reads a response with %s as read_failed", (_, response) => {
    expect(codexUsage(response, AT)).toEqual(failed);
  });
});

describe("copilotUsage", () => {
  it("reads the PoC response and leaves out a kind without quota", () => {
    const reset = Date.parse("2026-11-05T04:43:41.706Z");
    expect(copilotUsage(fixture("copilot"), AT)).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "chat", label: "Chat", usedPercent: 2.5, resetsAt: reset },
      { id: "completions", label: "Completions", usedPercent: 0, resetsAt: reset },
    ] });
  });
  it("reads every kind unlimited as unlimited with no windows", () => {
    const snapshot = { isUnlimitedEntitlement: true, entitlementRequests: 0, usedRequests: 0, remainingPercentage: 100, usageAllowedWithExhaustedQuota: true };
    expect(copilotUsage({ quotaSnapshots: { chat: snapshot, completions: snapshot } }, AT)).toEqual({ status: "ok", windows: [], unlimited: true, readAt: AT });
  });
  it("leaves unlimited kinds out of the windows when another kind has a limit", () => {
    const reading = copilotUsage({ quotaSnapshots: {
      chat: { isUnlimitedEntitlement: true, entitlementRequests: 0, remainingPercentage: 100 },
      premium_interactions: { isUnlimitedEntitlement: false, entitlementRequests: 300, remainingPercentage: 60 },
    } }, AT);
    expect(reading).toEqual({ status: "ok", readAt: AT, windows: [{ id: "premium_interactions", label: "Premium requests", usedPercent: 40 }] });
  });
  it("reads no plan limits when no kind has a quota", () => {
    expect(copilotUsage({ quotaSnapshots: { premium_interactions: { isUnlimitedEntitlement: false, entitlementRequests: 0, remainingPercentage: 0, hasQuota: false } } }, AT))
      .toEqual({ status: "unavailable", reason: "no_plan_limits", readAt: AT });
  });
  it("marks a kind limited only when nothing remains and exhausted use is not allowed", () => {
    const kind = (usageAllowedWithExhaustedQuota: boolean, remainingPercentage: number) => ({ isUnlimitedEntitlement: false, entitlementRequests: 50, remainingPercentage, usageAllowedWithExhaustedQuota });
    const reading = copilotUsage({ quotaSnapshots: { chat: kind(false, 0), completions: kind(true, 0), other_kind: kind(false, 10) } }, AT);
    expect(reading.status === "ok" && reading.windows.map(w => [w.label, w.usedPercent, w.limited])).toEqual([["Chat", 100, true], ["Completions", 100, undefined], ["Other kind", 90, undefined]]);
  });
  it.each([
    ["no quotaSnapshots", {}],
    ["a kind without remainingPercentage", { quotaSnapshots: { chat: { isUnlimitedEntitlement: false, entitlementRequests: 5 } } }],
    ["a reset date that is not a date", { quotaSnapshots: { chat: { isUnlimitedEntitlement: false, entitlementRequests: 5, remainingPercentage: 5, resetDate: "later" } } }],
  ])("reads a response with %s as read_failed", (_, response) => {
    expect(copilotUsage(response, AT)).toEqual(failed);
  });
});

describe("cursorUsage", () => {
  it("reads the PoC response's Auto and API shares of the billing cycle", () => {
    const end = Date.parse("2026-11-13T14:35:33.128Z");
    expect(cursorUsage(fixture("cursor"), AT)).toEqual({ status: "ok", readAt: AT, windows: [
      { id: "auto", label: "Auto", usedPercent: 100, resetsAt: end }, { id: "api", label: "API", usedPercent: 0, resetsAt: end },
    ] });
  });
  it("reads an unlimited account as unlimited with no windows", () => {
    expect(cursorUsage({ ...fixture("cursor"), isUnlimited: true }, AT)).toEqual({ status: "ok", windows: [], unlimited: true, readAt: AT });
  });
  it.each([
    ["an error body", { error: "not_authenticated", description: "The user does not have an active session or is not authenticated" }],
    ["no plan", { isUnlimited: false, billingCycleEnd: "2026-11-13T14:35:33.128Z", individualUsage: {} }],
    ["a share that is not a number", { isUnlimited: false, individualUsage: { plan: { autoPercentUsed: "100", apiPercentUsed: 0 } } }],
  ])("reads %s as read_failed", (_, response) => {
    expect(cursorUsage(response, AT)).toEqual(failed);
  });
});

describe("usageNotSupported", () => {
  it.each([
    ["a JSON-RPC Method not found error", { code: -32601, message: "\"Method not found\": account.getQuota", data: { method: "account.getQuota" } }, true],
    ["an Error quoting Method not found", new Error("Method not found: account/rateLimits/read"), true],
    ["Claude's unknown control request", new Error("Unsupported control request subtype: get_usage"), true],
    ["a timeout", new Error("timed out"), false],
    ["another JSON-RPC error", { code: -32603, message: "Internal error" }, false],
    ["nothing", undefined, false],
  ])("%s", (_, error, expected) => {
    expect(usageNotSupported(error)).toBe(expected);
  });
});
