import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { canvasStrongestSignal, openButtonBadge, panelOpenFor } from "./rightPanelOpen";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: { path: ".doan/canvases/billing.html", id: "billing" }, title: "Ideas", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});

describe("panelOpenFor", () => {
  test.each([
    [{ kind: "overviewRow" }, "composer"],
    [{ kind: "notification", permission: false }, "composer"],
    [{ kind: "notification", permission: true }, "permission"],
    [{ kind: "card" }, "composer"],
    [{ kind: "capsule" }, "permission"],
    [{ kind: "picker" }, "composer"],
    [{ kind: "newConversation" }, "composer"],
    // After a move, focus sits on the receiving thread's handoff card.
    [{ kind: "handoff" }, "handoff"],
  ] as const)("%o opens the panel and focuses the %s", (trigger, focus) => {
    expect(panelOpenFor(trigger, null)).toEqual({ open: true, focus });
  });

  test("the agent's own events never open it", () => {
    expect(panelOpenFor({ kind: "agent" }, "permission")).toEqual({ open: "keep" });
  });

  test("a sidebar row opens it only for an answer or an unseen ending", () => {
    expect(panelOpenFor({ kind: "sidebarRow" }, "permission")).toEqual({ open: true, focus: "permission" });
    expect(panelOpenFor({ kind: "sidebarRow" }, "unseen")).toEqual({ open: true, focus: "composer" });
    expect(panelOpenFor({ kind: "sidebarRow" }, "working")).toEqual({ open: "keep" });
    expect(panelOpenFor({ kind: "sidebarRow" }, null)).toEqual({ open: "keep" });
  });
});

describe("openButtonBadge", () => {
  test("a waiting request and an unseen ending put a dot on a folded panel's button", () => {
    expect(openButtonBadge(summary({ phase: "waiting" }), false)).toEqual({ kind: "permission", label: "Show conversation, needs your answer" });
    expect(openButtonBadge(summary({ unseen: true }), false)).toEqual({ kind: "unseen", label: "Show conversation, conversation finished unread" });
  });

  test("no dot while working, once seen, with the panel open, or without a readable conversation", () => {
    expect(openButtonBadge(summary({ phase: "running" }), false)).toBeNull();
    expect(openButtonBadge(summary({ unseen: true }), false, new Set(["c1"]))).toBeNull();
    expect(openButtonBadge(summary({ phase: "waiting" }), true)).toBeNull();
    expect(openButtonBadge(undefined, false)).toBeNull();
    expect(openButtonBadge(summary({ readError: true, phase: "waiting" }), false)).toBeNull();
  });
});

describe("canvasStrongestSignal", () => {
  const billing = { path: ".doan/canvases/billing.html", id: "billing" };
  const at = (minute: number) => `2026-11-01T12:${String(minute).padStart(2, "0")}:00.000Z`;
  const PERMISSION = "Show conversation, needs your answer", WORKING = "Show conversation, agent is working", UNSEEN = "Show conversation, conversation finished unread";

  test("across every conversation of the canvas: an answer needed, then working, then an unseen ending", () => {
    const u = summary({ conversationId: "u", unseen: true }), r = summary({ conversationId: "r", phase: "running" }), w = summary({ conversationId: "w", phase: "waiting" });
    expect(canvasStrongestSignal([u, r, w], billing)).toEqual({ kind: "permission", label: PERMISSION, conversationId: "w" });
    expect(canvasStrongestSignal([u, r], billing)).toEqual({ kind: "working", label: WORKING, conversationId: "r" });
    expect(canvasStrongestSignal([u], billing)).toEqual({ kind: "unseen", label: UNSEEN, conversationId: "u" });
  });

  test("main's working flag counts as working; a schedule for the usage limit does not count", () => {
    expect(canvasStrongestSignal([summary({ working: true })], billing)?.kind).toBe("working");
    expect(canvasStrongestSignal([summary({ queued: 1, scheduledAt: at(30) })], billing)).toBeNull();
  });

  test("names the conversation it stands for: the first to wait, else the latest activity", () => {
    const w1 = summary({ conversationId: "w1", phase: "waiting", waitingSince: at(5), lastActivityAt: at(5) }), w2 = summary({ conversationId: "w2", phase: "waiting", waitingSince: at(2), lastActivityAt: at(2) });
    expect(canvasStrongestSignal([w1, w2], billing)?.conversationId).toBe("w2");
    // Output that came while w1 kept waiting moves its activity, not its place.
    const s1 = summary({ conversationId: "s1", phase: "waiting", waitingSince: at(1), lastActivityAt: at(9) }), s2 = summary({ conversationId: "s2", phase: "waiting", waitingSince: at(3), lastActivityAt: at(3) });
    expect(canvasStrongestSignal([s2, s1], billing)?.conversationId).toBe("s1");
    const r1 = summary({ conversationId: "r1", phase: "running", lastActivityAt: at(2) }), r2 = summary({ conversationId: "r2", phase: "running", lastActivityAt: at(5) });
    expect(canvasStrongestSignal([r1, r2], billing)?.conversationId).toBe("r2");
    const u1 = summary({ conversationId: "u1", unseen: true, lastActivityAt: at(2) }), u2 = summary({ conversationId: "u2", unseen: true, lastActivityAt: at(5) });
    expect(canvasStrongestSignal([u1, u2], billing)?.conversationId).toBe("u2");
  });

  test("a seen ending, an unreadable history, another canvas and a project conversation give nothing", () => {
    expect(canvasStrongestSignal([summary({ unseen: true })], billing, new Set(["c1"]))).toBeNull();
    expect(canvasStrongestSignal([summary({ readError: true, working: true })], billing)).toBeNull();
    expect(canvasStrongestSignal([summary({ phase: "running", canvas: { path: ".doan/canvases/home.html", id: "home" } })], billing)).toBeNull();
    const { canvas: _c, ...project } = summary({ phase: "waiting" });
    expect(canvasStrongestSignal([project], billing)).toBeNull();
    expect(canvasStrongestSignal([], billing)).toBeNull();
  });
});
