import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { capsuleAction, openButtonBadge, panelOpenFor } from "./rightPanelOpen";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: { path: ".doan/canvases/billing.html", id: "billing" }, title: "Ideas", state: "current", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});

describe("panelOpenFor", () => {
  test.each([
    [{ kind: "overviewRow" }, "composer"],
    [{ kind: "notification", permission: false }, "composer"],
    [{ kind: "notification", permission: true }, "permission"],
    [{ kind: "promotion" }, "composer"],
    [{ kind: "capsule" }, "permission"],
    [{ kind: "addToConversation" }, "composer"],
    [{ kind: "newConversation" }, "composer"],
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
    expect(openButtonBadge(summary({ unseen: true }), false)).toEqual({ kind: "unseen", label: "Show conversation, new activity" });
  });

  test("no dot while working, once seen, with the panel open, or for an archived conversation alone", () => {
    expect(openButtonBadge(summary({ phase: "running" }), false)).toBeNull();
    expect(openButtonBadge(summary({ unseen: true }), false, new Set(["c1"]))).toBeNull();
    expect(openButtonBadge(summary({ phase: "waiting" }), true)).toBeNull();
    expect(openButtonBadge(summary({ state: "archived", unseen: true }), false)).toBeNull();
    expect(openButtonBadge(undefined, false)).toBeNull();
    expect(openButtonBadge(summary({ readError: true, phase: "waiting" }), false)).toBeNull();
  });
});

test("the capsule stops a working turn and opens a waiting one", () => {
  expect(capsuleAction("running")).toBe("stop");
  expect(capsuleAction("waiting")).toBe("open");
});
