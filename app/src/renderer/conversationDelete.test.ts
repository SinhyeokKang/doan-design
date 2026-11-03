import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { DELETE_TOOLTIP, deleteAvailability, deleteDialogView, deleteRefusalText } from "./conversationDelete";

// conversation-delete tasks T3, design §3.1: whether a conversation can be deleted, the confirm alert's words and the
// refusal toast.

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Ideas", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch,
});
const WAITING = "The agent is waiting for your answer.";
const WORKING = "The agent is working on this conversation.";

describe("deleteAvailability", () => {
  test.each<[string, Partial<ConversationSummary>, ReturnType<typeof deleteAvailability>]>([
    ["waiting for an answer", { phase: "waiting", working: true }, { available: false, reason: WAITING }],
    // The list's working can lag an answered request; waiting still names the answer.
    ["waiting, not counted as working", { phase: "waiting" }, { available: false, reason: WAITING }],
    ["running", { phase: "running", working: true }, { available: false, reason: WORKING }],
    ["running before main counts it", { phase: "running" }, { available: false, reason: WORKING }],
    // A project turn waiting for its judgement, a queue about to go out, a send waiting for the previous process.
    ["working after its turn ended", { phase: "ended", working: true }, { available: false, reason: WORKING }],
    ["ended", {}, { available: true }],
    ["archived", { state: "archived" }, { available: true }],
    // An unreadable conversation can still go, so deleting is a way out of it.
    ["unreadable", { readError: true, lastActivityAt: "" }, { available: true }],
    ["with a returned draft", { returnedDraft: true }, { available: true }],
    ["with an unseen ending", { unseen: true }, { available: true }],
  ])("%s", (_name, patch, expected) => {
    expect(deleteAvailability(summary(patch))).toEqual(expected);
  });

  test("the row button's tooltip when it can be used", () => {
    expect(DELETE_TOOLTIP).toBe("Delete conversation");
  });
});

describe("deleteDialogView", () => {
  const BODY = "Doan deletes this conversation from this device. Claude Code’s own session files stay. You can’t undo this.";

  test("the title names the conversation and the body names the provider", () => {
    expect(deleteDialogView("Tighten the checkout summary spacing", "claude", false)).toEqual({
      title: "Delete “Tighten the checkout summary spacing”?",
      body: BODY,
    });
    expect(deleteDialogView("Ideas", "codex", false).body).toBe("Doan deletes this conversation from this device. Codex’s own session files stay. You can’t undo this.");
    expect(deleteDialogView("Ideas", "copilot", false).body).toBe("Doan deletes this conversation from this device. GitHub Copilot’s own session files stay. You can’t undo this.");
  });

  test("an unsent draft or returned queue adds one line", () => {
    expect(deleteDialogView("Ideas", "claude", true).body).toBe(`${BODY} Its unsent message is discarded too.`);
  });

  test("a title over 60 code points is cut there with an ellipsis; one of exactly 60 is not", () => {
    const sixty = "Rework the checkout summary so saved cards, promo codes, gif";
    expect([...sixty]).toHaveLength(60);
    expect(deleteDialogView(sixty, "claude", false).title).toBe(`Delete “${sixty}”?`);
    expect(deleteDialogView(`${sixty}t cards and wallets read in order`, "claude", false).title).toBe(`Delete “${sixty}…”?`);
  });

  test("the cut counts code points, so a surrogate pair is never split", () => {
    const emoji = "😀".repeat(61);
    const title = deleteDialogView(emoji, "claude", false).title;
    expect(title).toBe(`Delete “${"😀".repeat(60)}…”?`);
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  test("line breaks read as one space, and the ends are trimmed before the cut", () => {
    expect(deleteDialogView("  Draw the\n\npricing page\r\nnow  ", "claude", false).title).toBe("Delete “Draw the pricing page now”?");
    const padded = `${" ".repeat(10)}${"a".repeat(60)}${" ".repeat(10)}`;
    expect(deleteDialogView(padded, "claude", false).title).toBe(`Delete “${"a".repeat(60)}”?`);
  });

  test("an empty or blank title asks about this conversation", () => {
    expect(deleteDialogView("", "claude", false).title).toBe("Delete this conversation?");
    expect(deleteDialogView(" \n ", "claude", false).title).toBe("Delete this conversation?");
  });
});

describe("deleteRefusalText", () => {
  test("busy, not found and any other failure, in the canvas Move to Trash form", () => {
    expect(deleteRefusalText("busy", "Draft the onboarding welcome screen")).toBe("Couldn’t delete “Draft the onboarding welcome screen”. The agent started working on it.");
    expect(deleteRefusalText("not_found", "Draft the onboarding welcome screen")).toBe("“Draft the onboarding welcome screen” was already deleted.");
    expect(deleteRefusalText("unknown", "Draft the onboarding welcome screen")).toBe("Couldn’t delete “Draft the onboarding welcome screen”. Try again.");
    expect(deleteRefusalText("invalid", "Ideas")).toBe("Couldn’t delete “Ideas”. Try again.");
  });

  test("the title is shortened as the alert's is", () => {
    const sixty = "a".repeat(60);
    expect(deleteRefusalText("unknown", `${sixty}bc`)).toBe(`Couldn’t delete “${sixty}…”. Try again.`);
    expect(deleteRefusalText("busy", "Draw\nit")).toBe("Couldn’t delete “Draw it”. The agent started working on it.");
  });

  test("an empty title reads as this conversation", () => {
    expect(deleteRefusalText("busy", "")).toBe("Couldn’t delete this conversation. The agent started working on it.");
    expect(deleteRefusalText("not_found", "")).toBe("This conversation was already deleted.");
    expect(deleteRefusalText("unknown", " ")).toBe("Couldn’t delete this conversation. Try again.");
  });
});
