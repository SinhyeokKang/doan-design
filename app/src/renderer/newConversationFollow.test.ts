import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { followNewConversation } from "./newConversationFollow";

const billing = { path: ".doan/canvases/billing.html", id: "billing" };
const at = (minute: number) => `2026-11-01T12:${String(minute).padStart(2, "0")}:00.000Z`;
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: billing, title: "Ideas", owner: "doan", provider: "claude", fromHome: false,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: at(0), preview: "", ...patch,
});
const old = summary({ conversationId: "old", phase: "ended", working: false });
const KNOWN = new Set(["old"]);

describe("followNewConversation", () => {
  test("a conversation the person started that the default new state's list did not name is followed", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "new" })], billing)).toBe("new");
  });

  test("only from the default new conversation state: a state the person chose, or a conversation shown, never moves", () => {
    expect(followNewConversation(null, [old, summary({ conversationId: "new" })], billing)).toBeNull();
  });

  test("a conversation a handoff or a promotion started never moves the panel", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "h", startedBy: "handoff" })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "p", startedBy: "promotion" })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "h", startedBy: "handoff", lastActivityAt: at(9) }), summary({ conversationId: "mine", lastActivityAt: at(1) })], billing)).toBe("mine");
  });

  test("two new at once: the most recent", () => {
    const list = [old, summary({ conversationId: "a", lastActivityAt: at(2) }), summary({ conversationId: "b", lastActivityAt: at(5) })];
    expect(followNewConversation(KNOWN, list, billing)).toBe("b");
  });

  test("one already there, on another canvas, a project conversation or being deleted is not followed", () => {
    expect(followNewConversation(KNOWN, [old], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "x", canvas: { path: ".doan/canvases/home.html", id: "home" } })], billing)).toBeNull();
    const { canvas: _c, ...project } = summary({ conversationId: "proj" });
    expect(followNewConversation(KNOWN, [project], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "gone" })], billing, id => id === "gone")).toBeNull();
  });

  test("a conversation whose history could not be read is not followed: who started it is unknown", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "unread", readError: true, phase: "ended", lastActivityAt: "" })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "unread", readError: true, lastActivityAt: "" }), summary({ conversationId: "mine" })], billing)).toBe("mine");
  });
});
