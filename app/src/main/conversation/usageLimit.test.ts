import { describe, expect, it } from "vitest";
import transcripts from "./fixtures/claude-rate-limit-transcripts.json";
import codexSession from "./fixtures/codex-rate-limits-session.json";
import claudeUsageFixture from "../agentAuth/fixtures/claude-usage.json";
import codexUsageFixture from "../agentAuth/fixtures/codex-usage.json";
import { claudeUsage, codexUsage } from "../agentAuth/usageParse";
import type { UsageWindow } from "../agentAuth/usageTypes";
import { initialTransport, normalizeClaude } from "./transport";
import type { EventPayload, TransportState } from "./types";
import { autoSchedule, claudeResetFromDetail, limitResetFromUsage, limitState, sendAt, sendDecision, SEND_DELAY_MS, turnHadActivity } from "./usageLimit";

const NOW = Date.parse("2026-11-13T07:00:00.000Z");
const MIN = 60_000, HOUR = 60 * MIN;

describe("limitResetFromUsage", () => {
  const w = (resetsAt: number | undefined, limited?: true): UsageWindow => ({ id: "x", label: "x", usedPercent: 100, ...(resetsAt === undefined ? {} : { resetsAt }), ...(limited ? { limited } : {}) });
  it("is null without a limited window that has a reset time", () => {
    expect(limitResetFromUsage([], NOW)).toBeNull();
    expect(limitResetFromUsage([w(NOW + HOUR)], NOW)).toBeNull();
    expect(limitResetFromUsage([w(undefined, true)], NOW)).toBeNull();
  });
  it("takes the latest reset among the limited windows, and only one still ahead", () => {
    expect(limitResetFromUsage([w(NOW + HOUR, true), w(NOW + 5 * HOUR), w(NOW + 2 * HOUR, true)], NOW)).toBe(NOW + 2 * HOUR);
    expect(limitResetFromUsage([w(NOW - MIN, true)], NOW)).toBeNull();
    // Exactly now: the window has already reset.
    expect(limitResetFromUsage([w(NOW, true)], NOW)).toBeNull();
  });
  // A send at the reset that the limit stopped again may still read the window it went out for.
  it("keeps a passed reset only when it is the one the scheduled send went out for", () => {
    expect(limitResetFromUsage([w(NOW - MIN, true)], NOW, NOW - MIN)).toBe(NOW - MIN);
    expect(limitResetFromUsage([w(NOW - MIN, true)], NOW, NOW - 2 * MIN)).toBeNull();
  });
  it("reads a Claude Code usage read whose window is locked", () => {
    const limits = { ...claudeUsageFixture.rate_limits, seven_day: { ...claudeUsageFixture.rate_limits.seven_day, utilization: 100, locked_reason: "seven_day" } };
    const reading = claudeUsage({ ...claudeUsageFixture, rate_limits: limits }, NOW);
    if (reading.status !== "ok") throw new Error("fixture unread");
    expect(limitResetFromUsage(reading.windows, Date.parse("2026-11-06T00:00:00Z"))).toBe(Date.parse("2026-11-07T04:00:00.453Z"));
    const plain = claudeUsage(claudeUsageFixture, NOW);
    expect(plain.status === "ok" && limitResetFromUsage(plain.windows, Date.parse("2026-11-05T00:00:00Z"))).toBeNull();
  });
  // The session record's rate_limits, in the camelCase account/rateLimits/read answers.
  function codexRead(reached: string | null) {
    const limits = codexSession.payload.rate_limits, primary = limits.primary;
    return { rateLimits: { ...codexUsageFixture.rateLimits, primary: { usedPercent: primary.used_percent, windowDurationMins: primary.window_minutes, resetsAt: primary.resets_at }, secondary: null, rateLimitReachedType: reached } };
  }
  it("reads a Codex usage read only when Codex says the limit is reached", () => {
    const at = Date.parse(codexSession.timestamp);
    const full = codexUsage(codexRead(null), at), reached = codexUsage(codexRead("primary"), at);
    if (full.status !== "ok" || reached.status !== "ok") throw new Error("fixture unread");
    // 100% used with rate_limit_reached_type null, as the session recorded it: not a reached limit.
    expect(limitResetFromUsage(full.windows, at)).toBeNull();
    expect(limitResetFromUsage(reached.windows, at)).toBe(codexSession.payload.rate_limits.primary.resets_at * 1000);
  });
});

describe("limitState", () => {
  it("sets a connection's reset and drops the passed ones", () => {
    const one = limitState(new Map(), "c1", { provider: "claude", resetsAt: NOW + HOUR }, NOW);
    const two = limitState(one, "c2", { provider: "codex", resetsAt: NOW + 3 * HOUR }, NOW);
    expect([...two]).toEqual([["c1", { provider: "claude", resetsAt: NOW + HOUR }], ["c2", { provider: "codex", resetsAt: NOW + 3 * HOUR }]]);
    expect([...limitState(two, "c2", { provider: "codex", resetsAt: NOW + 4 * HOUR }, NOW + HOUR)]).toEqual([["c2", { provider: "codex", resetsAt: NOW + 4 * HOUR }]]);
    expect(one).toEqual(new Map([["c1", { provider: "claude", resetsAt: NOW + HOUR }]]));
  });
  it("clears a connection that changed, and never stores a passed reset", () => {
    const one = limitState(new Map(), "c1", { provider: "claude", resetsAt: NOW + HOUR }, NOW);
    expect(limitState(one, "c1", null, NOW).size).toBe(0);
    expect(limitState(new Map(), "c1", { provider: "claude", resetsAt: NOW }, NOW).size).toBe(0);
  });
});

describe("sendDecision", () => {
  const base = { provider: "claude" as const, owner: "doan" as const, start: false, limit: null, working: false, scheduled: false, now: NOW };
  it("sends without a limit, and queues while working as before", () => {
    expect(sendDecision(base)).toBe("send");
    expect(sendDecision({ ...base, working: true })).toBe("queue");
    expect(sendDecision({ ...base, working: true, limit: NOW + HOUR })).toBe("queue");
  });
  it("schedules a Doan Claude Code or Codex conversation's send while its limit holds or it is scheduled", () => {
    expect(sendDecision({ ...base, limit: NOW + HOUR })).toBe("schedule");
    expect(sendDecision({ ...base, provider: "codex", limit: NOW + HOUR })).toBe("schedule");
    // The reset passed but the scheduled messages have not gone out yet: a new one follows them.
    expect(sendDecision({ ...base, scheduled: true, limit: NOW - MIN })).toBe("schedule");
    expect(sendDecision({ ...base, limit: NOW })).toBe("send");
  });
  it("refuses an ACP provider's, a legacy external conversation's and a new conversation's send while the limit holds", () => {
    for (const provider of ["cursor", "antigravity", "copilot"] as const) expect(sendDecision({ ...base, provider, limit: NOW + HOUR })).toBe("refuse");
    expect(sendDecision({ ...base, owner: "legacy-external", limit: NOW + HOUR })).toBe("refuse");
    expect(sendDecision({ ...base, start: true, limit: NOW + HOUR })).toBe("refuse");
    expect(sendDecision({ ...base, start: true })).toBe("send");
  });
});

describe("turnHadActivity", () => {
  const failed: EventPayload = { type: "turn.failed", code: "rate_limited", detail: "You've hit your 5-hour limit · resets 10:10pm (Asia/Seoul)" };
  it("finds the agent's reply text or a tool step", () => {
    expect(turnHadActivity([{ type: "user.message", text: "x", anchors: [] }, { type: "turn.started" }, failed])).toBe(false);
    expect(turnHadActivity([{ type: "message.delta", messageId: "m", text: "On it" }, failed])).toBe(true);
    expect(turnHadActivity([{ type: "message.done", messageId: "m", text: "Done" }, failed])).toBe(true);
    expect(turnHadActivity([{ type: "activity", kind: "read", summary: "Reading files" }, failed])).toBe(true);
    expect(turnHadActivity([{ type: "permission.request", requestId: "r", tool: "Bash", summary: "x", options: [] }, failed])).toBe(true);
    expect(turnHadActivity([{ type: "question.request", requestId: "q", questions: [] }, failed])).toBe(true);
    expect(turnHadActivity([{ type: "message.delta", messageId: "m", text: "  \n" }, { type: "context.usage", used: 1, size: 2 }, { type: "fast.unused" }, failed])).toBe(false);
  });
  // Claude Code writes the limit as an assistant message of its own (model <synthetic>, no model call), which the
  // transport reads as a message: it is not the agent's.
  it.each(transcripts.map(c => [c.version, c] as const))("reads Claude Code %s's limit refusal as no activity", (_version, recorded) => {
    let state: TransportState = initialTransport();
    const text = recorded.assistant.message.content[0]!.text;
    // The transcript keeps no result frame; this one ends the turn as an error result does.
    const frames = [recorded.assistant, { type: "result", subtype: "success", is_error: true, result: text }];
    const events = frames.flatMap(frame => { const result = normalizeClaude(state, frame, "/repo"); state = result.state; return result.events; });
    expect(events).toContainEqual({ type: "turn.failed", code: "rate_limited", detail: text });
    expect(events.some(e => e.type === "message.done")).toBe(true);
    expect(turnHadActivity(events)).toBe(false);
    expect(turnHadActivity([{ type: "activity", kind: "edit", summary: "Editing files" }, ...events])).toBe(true);
  });
});

describe("claudeResetFromDetail", () => {
  it.each(transcripts.map(c => [c.assistant.message.content[0]!.text, c] as const))("reads %s as its recorded reset", (text, recorded) => {
    expect(claudeResetFromDetail(text, Date.parse(recorded.assistant.timestamp))).toBe(recorded.assistant.apiErrorParams!.rate_limit_info.resetsAt * 1000);
  });
  it("takes the next such time without a date, unless that time passed within the hour", () => {
    const at = (iso: string) => Date.parse(iso);
    // 23:30 in Seoul: 10:10pm tomorrow is next, the one today passed 80 minutes ago.
    expect(claudeResetFromDetail("You've hit your 5-hour limit · resets 10:10pm (Asia/Seoul)", at("2026-11-13T14:30:00Z"))).toBe(at("2026-11-14T13:10:00Z"));
    // 22:20: a send right after the reset was stopped again, still naming 10:10pm.
    expect(claudeResetFromDetail("You've hit your 5-hour limit · resets 10:10pm (Asia/Seoul)", at("2026-11-13T13:20:00Z"))).toBe(at("2026-11-13T13:10:00Z"));
    expect(claudeResetFromDetail("You've hit your 5-hour limit · resets 1am (Asia/Seoul)", at("2026-11-13T14:30:00Z"))).toBe(at("2026-11-13T16:00:00Z"));
    expect(claudeResetFromDetail("You've hit your 5-hour limit · resets 22:10 (Europe/London)", at("2026-11-13T20:00:00Z"))).toBe(at("2026-11-13T22:10:00Z"));
  });
  it("crosses the year for a date that already passed long ago", () => {
    expect(claudeResetFromDetail("You've hit your weekly limit · resets Jan 2 at 9am (America/New_York)", Date.parse("2026-12-30T12:00:00Z"))).toBe(Date.parse("2027-01-02T14:00:00Z"));
  });
  it("follows the zone's daylight saving offset", () => {
    // New York is UTC-4 on Oct 31 and UTC-5 on Nov 2 (2026 ends DST on Nov 1).
    expect(claudeResetFromDetail("You've hit your weekly limit · resets Oct 31 at 1pm (America/New_York)", Date.parse("2026-10-30T00:00:00Z"))).toBe(Date.parse("2026-10-31T17:00:00Z"));
    expect(claudeResetFromDetail("You've hit your weekly limit · resets Nov 2 at 1pm (America/New_York)", Date.parse("2026-10-30T00:00:00Z"))).toBe(Date.parse("2026-11-02T18:00:00Z"));
  });
  it("is null for anything it cannot read", () => {
    for (const text of ["", "Rate limit exceeded", "You've hit your 5-hour limit · resets soon", "You've hit your 5-hour limit · resets 10:10pm", "resets 10:10pm (Not/AZone)",
      "resets 13pm (Asia/Seoul)", "resets 24:00 (Asia/Seoul)", "resets 10:61pm (Asia/Seoul)", "resets Feb 30 at 1pm (Asia/Seoul)", "resets Foo 3 at 1pm (Asia/Seoul)"])
      expect(claudeResetFromDetail(text, NOW)).toBeNull();
  });
});

describe("autoSchedule", () => {
  const base = { code: "rate_limited" as const, hadActivity: false, reset: NOW + HOUR, retriedSame: false, now: NOW };
  it("schedules a first refusal without activity whose reset is known", () => {
    expect(autoSchedule(base)).toBe("schedule");
    expect(autoSchedule({ ...base, hadActivity: true })).toBe("none");
    expect(autoSchedule({ ...base, reset: null })).toBe("none");
    expect(autoSchedule({ ...base, reset: NOW })).toBe("none");
    expect(autoSchedule({ ...base, code: "unknown" })).toBe("none");
  });
  it("reschedules a scheduled send stopped again for a later reset only", () => {
    expect(autoSchedule({ ...base, previousReset: NOW - MIN })).toBe("schedule");
    expect(autoSchedule({ ...base, reset: NOW - 2 * MIN, previousReset: NOW - MIN })).toBe("none");
  });
  it("sends once more a minute later when the same reset stopped it, and not twice", () => {
    expect(autoSchedule({ ...base, reset: NOW - MIN, previousReset: NOW - MIN })).toBe("retry");
    expect(autoSchedule({ ...base, reset: NOW - MIN, previousReset: NOW - MIN, retriedSame: true })).toBe("none");
    expect(autoSchedule({ ...base, reset: NOW - MIN, previousReset: NOW - MIN, hadActivity: true })).toBe("none");
  });
});

it("sends a minute after the reset", () => {
  expect(SEND_DELAY_MS).toBe(60_000);
  expect(sendAt(NOW)).toBe(NOW + 60_000);
});
