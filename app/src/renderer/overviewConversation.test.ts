import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { conversationStatus, overviewAfterListChange, pickOverviewConversation, projectConversationMenu, shortAgo } from "./overviewConversation";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Ideas", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: ago(HOUR), preview: "Last reply", ...patch,
});
const canvas = { path: ".doan/canvases/billing.html", id: "billing" };

describe("shortAgo", () => {
  test.each([
    [0, "now", "Just now"],
    [59.999 * SEC, "now", "Just now"],
    [MIN, "1m", "1 minute ago"],
    [3 * MIN, "3m", "3 minutes ago"],
    [59 * MIN + 59 * SEC, "59m", "59 minutes ago"],
    [HOUR, "1h", "1 hour ago"],
    [23 * HOUR + 59 * MIN, "23h", "23 hours ago"],
    [DAY, "1d", "1 day ago"],
    // design §0 and the draft: "1d" for the first day only, then the date (review DS r1).
    [2 * DAY - MIN, "1d", "1 day ago"],
    [2 * DAY, "Oct 30", "Oct 30"],
    [4 * DAY, "Oct 28", "Oct 28"],
    [7 * DAY, "Oct 25", "Oct 25"],
  ])("%d ms ago reads %s", (ms, text, label) => {
    expect(shortAgo(ago(ms), NOW)).toEqual({ text, label });
  });

  test("another year carries the year", () => {
    expect(shortAgo("2025-10-28T12:00:00.000Z", NOW)).toEqual({ text: "Oct 28, 2025", label: "Oct 28, 2025" });
  });

  test("a time ahead of the clock reads now", () => {
    expect(shortAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toEqual({ text: "now", label: "Just now" });
  });

  test("no time, or an unreadable one, has no label", () => {
    expect(shortAgo("", NOW)).toBeNull();
    expect(shortAgo("yesterday", NOW)).toBeNull();
  });
});

describe("pickOverviewConversation", () => {
  const older = summary({ conversationId: "old", lastActivityAt: ago(DAY) });
  const newer = summary({ conversationId: "new", lastActivityAt: ago(MIN) });
  const list = [older, newer];

  test("nothing is picked before the list is read, whatever was asked or remembered", () => {
    expect(pickOverviewConversation(null, "old", "new")).toEqual({ kind: "wait" });
    expect(pickOverviewConversation(null, undefined, null)).toEqual({ kind: "wait" });
  });

  test("a requested project conversation wins over the remembered one", () => {
    expect(pickOverviewConversation(list, "new", "old")).toEqual({ kind: "conversation", conversationId: "old" });
  });

  test("a request not in the list yet waits for another read instead of falling back", () => {
    expect(pickOverviewConversation(list, "old", "started")).toEqual({ kind: "reread", conversationId: "started" });
  });

  test("a requested canvas conversation opens its canvas", () => {
    const bound = summary({ conversationId: "bound", canvas });
    expect(pickOverviewConversation([...list, bound], undefined, "bound")).toEqual({ kind: "canvas", conversationId: "bound", canvas });
    const archived = summary({ conversationId: "archived", canvas, state: "archived" });
    expect(pickOverviewConversation([archived], undefined, "archived")).toEqual({ kind: "canvas", conversationId: "archived", canvas });
  });

  test("the remembered project conversation comes next", () => {
    expect(pickOverviewConversation(list, "old", null)).toEqual({ kind: "conversation", conversationId: "old" });
  });

  test("a remembered conversation that was promoted gives the new conversation state and forgets it", () => {
    const promoted = summary({ conversationId: "old", canvas });
    expect(pickOverviewConversation([promoted, newer], "old", null)).toEqual({ kind: "new", forget: true });
  });

  test("a remembered conversation that is gone is skipped for the latest one", () => {
    expect(pickOverviewConversation(list, "deleted", null)).toEqual({ kind: "conversation", conversationId: "new" });
  });

  test("a remembered conversation that cannot be read still opens, so its thread can say so", () => {
    const broken = summary({ conversationId: "broken", readError: true, lastActivityAt: "" });
    expect(pickOverviewConversation([broken, newer], "broken", null)).toEqual({ kind: "conversation", conversationId: "broken" });
  });

  test("without memory the latest project conversation is picked; canvas conversations and unreadable ones are not", () => {
    const busyCanvas = summary({ conversationId: "canvas", canvas, lastActivityAt: ago(0) });
    const broken = summary({ conversationId: "broken", readError: true, lastActivityAt: "" });
    expect(pickOverviewConversation([busyCanvas, broken, older, newer], undefined, null)).toEqual({ kind: "conversation", conversationId: "new" });
  });

  test("equal activity times pick by conversation id, whatever the list order", () => {
    const at = ago(MIN);
    const a = summary({ conversationId: "a", lastActivityAt: at }), b = summary({ conversationId: "b", lastActivityAt: at });
    expect(pickOverviewConversation([b, a], undefined, null)).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pickOverviewConversation([a, b], undefined, null)).toEqual({ kind: "conversation", conversationId: "a" });
  });

  test("no project conversation gives the new conversation state", () => {
    expect(pickOverviewConversation([], undefined, null)).toEqual({ kind: "new", forget: false });
    expect(pickOverviewConversation([summary({ canvas })], undefined, null)).toEqual({ kind: "new", forget: false });
  });
});

describe("projectConversationMenu", () => {
  test("project conversations only, the most recent activity first; promoted ones are left out", () => {
    const menu = projectConversationMenu([
      summary({ conversationId: "old", title: "Old", lastActivityAt: ago(2 * DAY) }),
      summary({ conversationId: "promoted", canvas, lastActivityAt: ago(0) }),
      summary({ conversationId: "recent", title: "Recent", lastActivityAt: ago(3 * MIN) }),
    ], NOW);
    expect(menu.map(item => item.conversationId)).toEqual(["recent", "old"]);
  });

  test("an item carries title, provider, short time and preview", () => {
    expect(projectConversationMenu([summary({ conversationId: "c", title: "Pricing ideas", provider: "codex", lastActivityAt: ago(3 * MIN), preview: "Three options" })], NOW)).toEqual([{
      conversationId: "c", title: "Pricing ideas", provider: "codex", status: null,
      time: { text: "3m", label: "3 minutes ago" }, preview: "Three options", readError: false,
    }]);
  });

  test("status comes from the sidebar slot rule: answer, working, unseen ending, and a seen one has none", () => {
    const menu = projectConversationMenu([
      summary({ conversationId: "w", phase: "waiting", lastActivityAt: ago(1 * MIN) }),
      summary({ conversationId: "r", phase: "running", lastActivityAt: ago(2 * MIN) }),
      summary({ conversationId: "u", unseen: true, lastActivityAt: ago(3 * MIN) }),
      summary({ conversationId: "s", unseen: true, lastActivityAt: ago(4 * MIN) }),
      summary({ conversationId: "e", lastActivityAt: ago(5 * MIN) }),
    ], NOW, new Set(["s"]));
    expect(menu.map(item => item.status)).toEqual([
      { kind: "permission", label: "Needs your answer" },
      { kind: "working", label: "Working" },
      { kind: "unseen", label: "Finished, not seen" },
      null, null,
    ]);
  });

  test("an unreadable conversation keeps its title, says so in the preview and sorts last", () => {
    const menu = projectConversationMenu([
      summary({ conversationId: "broken", title: "Lost thread", readError: true, lastActivityAt: "", preview: "" }),
      summary({ conversationId: "ok", lastActivityAt: ago(DAY) }),
    ], NOW);
    expect(menu.map(item => item.conversationId)).toEqual(["ok", "broken"]);
    expect(menu[1]).toMatchObject({ title: "Lost thread", preview: "Can’t read this conversation", time: null, status: null, readError: true });
  });
});

describe("conversationStatus beyond Home", () => {
  test("a conversation not started from Home has the same status as one that was", () => {
    const cases: [Partial<ConversationSummary>, unknown][] = [
      [{ phase: "waiting" }, { kind: "permission", label: "Needs your answer" }],
      [{ phase: "running" }, { kind: "working", label: "Working" }],
      [{ unseen: true }, { kind: "unseen", label: "Finished, not seen" }],
      [{}, null],
    ];
    for (const [patch, status] of cases) expect(conversationStatus(summary({ fromHome: false, ...patch }), new Set())).toEqual(status);
    expect(conversationStatus(summary({ fromHome: false, unseen: true }), new Set(["c1"]))).toBeNull();
  });
});

describe("overviewAfterListChange", () => {
  const root = "/r/doan";
  const current = { root, conversationId: "c1", listed: true };

  test("a promoted conversation resets to a new conversation, moves its draft and leaves a notice", () => {
    const list = [summary({ conversationId: "c1", title: "Billing tweaks", canvas })];
    expect(overviewAfterListChange(current, { root, list })).toEqual({
      kind: "promoted", conversationId: "c1", title: "Billing tweaks", canvas,
      draft: { from: "conversation:c1", to: `root:${root}` },
    });
  });

  test("a promotion carries no seen seq, unseen or not: the host decides from its own thread", () => {
    const list = [summary({ conversationId: "c1", canvas, unseen: true })];
    expect(overviewAfterListChange(current, { root, list })).toEqual(overviewAfterListChange(current, { root, list: [{ ...list[0]!, unseen: false }] }));
  });

  test("a promoted conversation that was archived meanwhile is still a promotion", () => {
    const list = [summary({ conversationId: "c1", canvas, state: "archived" })];
    expect(overviewAfterListChange(current, { root, list })).toMatchObject({ kind: "promoted" });
  });

  test("another root's notice changes nothing", () => {
    const list = [summary({ conversationId: "c1", canvas })];
    expect(overviewAfterListChange(current, { root: "/r/other", list })).toEqual({ kind: "keep" });
  });

  test("an unchanged project conversation, or the new conversation state, is kept", () => {
    expect(overviewAfterListChange(current, { root, list: [summary({ conversationId: "c1" })] })).toEqual({ kind: "keep" });
    expect(overviewAfterListChange({ ...current, conversationId: null }, { root, list: [summary({ canvas })] })).toEqual({ kind: "keep" });
  });

  test("a listed conversation that is gone resets to a new conversation without a notice", () => {
    expect(overviewAfterListChange(current, { root, list: [] })).toEqual({ kind: "gone", draft: { from: "conversation:c1", to: `root:${root}` } });
  });

  test("a project conversation archived without a canvas resets like a gone one", () => {
    expect(overviewAfterListChange(current, { root, list: [summary({ conversationId: "c1", state: "archived" })] })).toMatchObject({ kind: "gone" });
  });

  test("a conversation not listed yet is kept: the start reply may arrive before its list notice", () => {
    expect(overviewAfterListChange({ ...current, listed: false }, { root, list: [] })).toEqual({ kind: "keep" });
  });
});
