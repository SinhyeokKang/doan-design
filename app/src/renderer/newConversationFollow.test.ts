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

  // PRODUCT §5 item 2 'Handoff': only the default new state with an empty draft is taken. The origin, a canvas
  // or the Overview, is only in the handoff conversation's history, so both read the same here.
  test("a conversation a handoff started takes the default new state with an empty draft, from a canvas or the Overview", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "h", startedBy: "handoff" })], billing)).toBe("h");
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "h", startedBy: "handoff" })], billing, { draft: false })).toBe("h");
  });
  test("a draft in the default new state keeps a handoff's conversation out; the person's own new conversation still takes it", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "h", startedBy: "handoff" })], billing, { draft: true })).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "h", startedBy: "handoff", lastActivityAt: at(9) }), summary({ conversationId: "mine", lastActivityAt: at(1) })], billing, { draft: true })).toBe("mine");
  });
  test("the person's New keeps a handoff's conversation out, as it does every other", () => {
    expect(followNewConversation(null, [old, summary({ conversationId: "h", startedBy: "handoff" })], billing)).toBeNull();
  });
  test("a handoff's conversation the default state's list named, on another canvas, being deleted or unreadable is not followed", () => {
    expect(followNewConversation(new Set(["old", "h"]), [old, summary({ conversationId: "h", startedBy: "handoff" })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "h", startedBy: "handoff", canvas: { path: ".doan/canvases/home.html", id: "home" } })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "h", startedBy: "handoff" })], billing, { deleting: id => id === "h" })).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "h", startedBy: "handoff", readError: true, lastActivityAt: "" })], billing)).toBeNull();
  });

  // An earlier build's promoted conversation was already listed when the default state was taken.
  test("an earlier build's promoted conversation the default state's list named is not followed", () => {
    expect(followNewConversation(new Set(["old", "p"]), [old, summary({ conversationId: "p", startedBy: "promotion" })], billing)).toBeNull();
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
    expect(followNewConversation(KNOWN, [summary({ conversationId: "gone" })], billing, { deleting: id => id === "gone" })).toBeNull();
  });

  test("a conversation whose history could not be read is not followed: who started it is unknown", () => {
    expect(followNewConversation(KNOWN, [old, summary({ conversationId: "unread", readError: true, phase: "ended", lastActivityAt: "" })], billing)).toBeNull();
    expect(followNewConversation(KNOWN, [summary({ conversationId: "unread", readError: true, lastActivityAt: "" }), summary({ conversationId: "mine" })], billing)).toBe("mine");
  });
});
