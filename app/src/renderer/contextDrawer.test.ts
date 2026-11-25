import { describe, expect, it } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import type { ConversationEvent } from "../main/conversation/types";
import { rowView } from "./agentUsageView";
import {
  contextDrawerView, drawerCloseFocus, refreshGoneFocus, ringButton, RING_TIP, ringTip, ringTipOpen, type RingTip, type RingTipEvent,
} from "./contextDrawer";
import { contextRing } from "./contextWindow";

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const MIN = 60_000, HOUR = 60 * MIN;
const CONTEXT = { value: 42, percent: 42, used: 84_000, size: 200_000 };
const win = (over: Partial<UsageWindow> = {}): UsageWindow => ({ id: "five_hour", label: "5-hour", usedPercent: 38, resetsAt: NOW + 2 * HOUR + 10 * MIN, ...over });
const ok = (provider: UsageEntry["provider"], windows: UsageWindow[], over: Partial<UsageEntry> = {}): UsageEntry =>
  ({ provider, reading: { status: "ok", windows, readAt: NOW - 3 * MIN }, inFlight: false, ...over });
const claude = ok("claude", [win(), win({ id: "seven_day", label: "Weekly", usedPercent: 61, resetsAt: NOW + 76 * HOUR })]);
const codex = ok("codex", [win({ usedPercent: 12 }), win({ id: "seven_day", label: "Weekly", usedPercent: 22, resetsAt: NOW + 18 * 24 * HOUR })]);
const copilot = ok("copilot", [win({ id: "premium", label: "Premium requests", usedPercent: 74 })]);
const ENTRIES = [claude, codex, copilot];
const view = (over: Partial<Parameters<typeof contextDrawerView>[0]> = {}) =>
  contextDrawerView({ context: CONTEXT, provider: "claude", usageHidden: false, entries: ENTRIES, now: NOW, ...over });

describe("contextDrawerView", () => {
  it("draws the Context window line as a window line in the ring's band", () => {
    expect(view().context).toEqual({ label: "Context window", text: "42% used · 84K of 200K", bar: 42, full: false });
    // The real ratio past 100%, the bar full, danger from 70% on the unrounded ratio as the ring.
    expect(view({ context: { value: 100, percent: 104, used: 208_000, size: 200_000 } }).context).toEqual({ label: "Context window", text: "104% used · 208K of 200K", bar: 100, full: true });
    expect(view({ context: { value: 69.9, percent: 69.9, used: 699_000, size: 1_000_000 } }).context).toMatchObject({ text: "69% used · 699K of 1M", full: false });
    expect(view({ context: { value: 70, percent: 70, used: 700_000, size: 1_000_000 } }).context.full).toBe(true);
  });

  it("follows a new Context value while it is open", () => {
    const before = view(), after = view({ context: { value: 78, percent: 78, used: 156_000, size: 200_000 } });
    expect(before.context.text).toBe("42% used · 84K of 200K");
    expect(after.context).toEqual({ label: "Context window", text: "78% used · 156K of 200K", bar: 78, full: true });
    expect(after.usage).toEqual(before.usage);
  });

  it.each([["claude", claude], ["codex", codex], ["copilot", copilot]] as const)("shows the %s row in the header row's words", (provider, entry) => {
    const drawn = view({ provider });
    expect(drawn.usage).toEqual(rowView(entry, NOW));
    expect(drawn.busy).toBe(false);
  });

  it("shows Claude Code's 5-hour and Weekly windows", () => {
    expect(view().usage?.windows.map(window => [window.label, window.text])).toEqual([["5-hour", "38% used · resets in 2h 10m"], ["Weekly", "61% used · resets in 3d 4h"]]);
    expect(view().usage).toMatchObject({ name: "Claude Code", read: "Updated 3m ago", note: null });
  });

  it.each<[string, Partial<Parameters<typeof contextDrawerView>[0]>]>([
    ["Antigravity", { provider: "antigravity", entries: [...ENTRIES, { provider: "antigravity", inFlight: false }] }],
    ["a legacy external conversation", { usageHidden: true }],
    ["a terminal session's composer", { provider: "codex", usageHidden: true }],
    ["a provider with no Doan connection", { provider: "copilot", entries: [claude, codex] }],
    ["no entries at all", { entries: [] }],
    ["a composer with no conversation provider", { provider: null }],
  ])("has no usage row and no Refresh for %s", (_name, over) => {
    const drawn = view({ ...over, entries: over.entries ?? ENTRIES.map(entry => ({ ...entry, inFlight: true })) });
    expect(drawn.usage).toBeNull();
    expect(drawn.busy).toBe(false);
    expect(drawn.context.label).toBe("Context window");
  });

  it("shows the reading, failed and limit-reached states as the header does", () => {
    const reading: UsageEntry = { provider: "claude", inFlight: true };
    expect(view({ entries: [reading] }).usage).toMatchObject({ read: null, windows: [], note: { text: "Reading usage" } });
    const failed: UsageEntry = { provider: "claude", reading: { status: "unavailable", reason: "read_failed", readAt: NOW }, inFlight: false };
    expect(view({ entries: [failed] }).usage).toMatchObject({ read: null, note: { text: "Couldn’t read usage. Doan tries again when you open this.", kind: "error" } });
    const limited = ok("claude", [win({ usedPercent: 100, limited: true, resetsAt: NOW + 50 * MIN })]);
    const row = view({ entries: [limited] }).usage!;
    expect(row).toEqual(rowView(limited, NOW));
    expect(row.windows[0]).toMatchObject({ limited: true, full: true });
  });

  it("redraws a window whose reset passes while it is open", () => {
    const entry = ok("claude", [win({ usedPercent: 100, limited: true, resetsAt: NOW + MIN })]);
    const before = view({ entries: [entry] }).usage!.windows[0]!, after = view({ entries: [entry], now: NOW + 2 * MIN }).usage!.windows[0]!;
    expect(before).toMatchObject({ limited: true, bar: 100 });
    expect(after).toMatchObject({ limited: false, bar: null });
    expect(after.text).not.toBe(before.text);
    expect(after).toEqual(rowView(entry, NOW + 2 * MIN).windows[0]);
  });

  it("is busy while any read runs, its own or another provider's that Refresh joined", () => {
    expect(view({ entries: [{ ...claude, inFlight: true }, codex] }).busy).toBe(true);
    expect(view({ entries: [{ ...claude, inFlight: true }, codex] }).usage?.read).toBe("Updating");
    const joined = view({ entries: [claude, { ...codex, inFlight: true }] });
    expect(joined.busy).toBe(true);
    expect(joined.usage?.read).toBe("Updated 3m ago");
    // Antigravity has no usage read and never counts, as in the header.
    expect(view({ entries: [claude, { provider: "antigravity", inFlight: true }] }).busy).toBe(false);
  });

  it("drops only the row after a sign-out or the last connection going", () => {
    const open = view();
    expect(open.usage).not.toBeNull();
    for (const entries of [[codex, copilot], []]) {
      const after = view({ entries });
      expect(after.usage).toBeNull();
      expect(after.context).toEqual(open.context);
    }
  });

  // Entries carry no connection ID, so a replacement reads as the header shows it: main drops the old account's value
  // and reads the new one, and the row (with Refresh) stays through "Reading usage" to the new values.
  it("re-reads a replaced account as the header does, keeping the row", () => {
    const reading = view({ entries: [{ provider: "claude", inFlight: true }] });
    expect(reading.usage).toMatchObject({ read: null, note: { text: "Reading usage" } });
    expect(reading.busy).toBe(true);
    expect(view({ entries: [ok("claude", [win({ usedPercent: 12 })])] }).usage?.windows[0]).toMatchObject({ text: "12% used · resets in 2h 10m" });
  });
});

describe("ringButton", () => {
  it("keeps the ring's name and description and says it opens a dialog", () => {
    expect(ringButton(CONTEXT, { statusLine: false, open: false })).toEqual({
      "aria-label": "Context window 42% used · last turn", "aria-description": "84K of 200K tokens", "aria-haspopup": "dialog", "aria-expanded": false,
    });
    expect(ringButton(CONTEXT, { statusLine: false, open: true })?.["aria-expanded"]).toBe(true);
  });

  it("is absent with no recorded value (Cursor, a new conversation) and on a status line", () => {
    const cursor: ConversationEvent[] = [];
    expect(ringButton(contextRing(cursor), { statusLine: false, open: false })).toBeNull();
    expect(ringButton(null, { statusLine: false, open: true })).toBeNull();
    expect(ringButton(CONTEXT, { statusLine: true, open: false })).toBeNull();
  });
});

describe("ringTip", () => {
  const run = (...events: RingTipEvent[]): RingTip => events.reduce(ringTip, RING_TIP);

  it("opens on hover and on keyboard focus, and closes on dismiss", () => {
    expect(ringTipOpen(RING_TIP)).toBe(false);
    expect(ringTipOpen(run({ type: "hover" }))).toBe(true);
    expect(ringTipOpen(run({ type: "focus", keyboard: true }))).toBe(true);
    expect(ringTipOpen(run({ type: "hover" }, { type: "dismiss" }))).toBe(false);
    // A pointer press's focus is not a request: the press opens the drawer.
    expect(ringTipOpen(run({ type: "focus", keyboard: false }))).toBe(false);
  });

  it("hides while the drawer is open, whatever asks for it", () => {
    expect(ringTipOpen(run({ type: "hover" }, { type: "drawer", open: true }))).toBe(false);
    expect(ringTipOpen(run({ type: "drawer", open: true }, { type: "hover" }))).toBe(false);
    expect(ringTipOpen(run({ type: "drawer", open: true }, { type: "focus", keyboard: true }))).toBe(false);
  });

  it("stays closed for the focus the drawer's close hands back, then opens on the next hover", () => {
    const closed = run({ type: "drawer", open: true }, { type: "drawer", open: false, focusReturns: true }, { type: "focus", keyboard: true });
    expect(ringTipOpen(closed)).toBe(false);
    expect(ringTipOpen(ringTip(closed, { type: "hover" }))).toBe(true);
  });

  it("opens on the next keyboard focus after the returned one", () => {
    const closed = run({ type: "drawer", open: true }, { type: "drawer", open: false, focusReturns: true }, { type: "focus", keyboard: true });
    const again: RingTipEvent[] = [{ type: "dismiss" }, { type: "focus", keyboard: true }];
    expect(ringTipOpen(again.reduce(ringTip, closed))).toBe(true);
  });

  it("does not hold back a hover when the returned focus never arrived (the ring kept focus)", () => {
    const closed = run({ type: "drawer", open: true }, { type: "drawer", open: false, focusReturns: true });
    expect(ringTipOpen(ringTip(closed, { type: "hover" }))).toBe(true);
    // Focus leaving clears it too, so a later Tab back opens it.
    const later: RingTipEvent[] = [{ type: "dismiss" }, { type: "focus", keyboard: true }];
    expect(ringTipOpen(later.reduce(ringTip, closed))).toBe(true);
  });

  it("does not swallow a later keyboard focus when the close put focus elsewhere", () => {
    const closed = run({ type: "drawer", open: true }, { type: "drawer", open: false, focusReturns: false });
    expect(ringTipOpen(ringTip(closed, { type: "focus", keyboard: true }))).toBe(true);
  });

  // POSTMORTEM 2026-10-23 'Re-hovering a dismissed tooltip did not reopen it'.
  it("reopens on a hover after a dismiss", () => {
    expect(ringTipOpen(run({ type: "hover" }, { type: "dismiss" }, { type: "hover" }))).toBe(true);
  });
});

describe("drawerCloseFocus", () => {
  it("returns focus to the ring on Escape", () => {
    expect(drawerCloseFocus({ kind: "escape" })).toBe("ring");
  });

  it("returns focus to the ring on an outside press, unless the press focused another control", () => {
    expect(drawerCloseFocus({ kind: "outside", focusedControl: false })).toBe("ring");
    expect(drawerCloseFocus({ kind: "outside", focusedControl: true })).toBe("stay");
  });

  it("sends focus to the composer input when the ring or conversation went with focus inside, and leaves it otherwise", () => {
    expect(drawerCloseFocus({ kind: "lost", focusInside: true })).toBe("composer");
    expect(drawerCloseFocus({ kind: "lost", focusInside: false })).toBe("stay");
  });
});

describe("refreshGoneFocus", () => {
  it("keeps the drawer and moves focus from a vanished Refresh to the drawer body", () => {
    expect(refreshGoneFocus({ row: false, refreshFocused: true })).toBe("body");
    expect(refreshGoneFocus({ row: false, refreshFocused: false })).toBe("stay");
    expect(refreshGoneFocus({ row: true, refreshFocused: true })).toBe("stay");
  });
});
