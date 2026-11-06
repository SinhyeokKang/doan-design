import { describe, expect, test } from "vitest";
import type { HandoffNotice } from "../main/conversation/handoff";
import { HANDOFF_WAIT_MS, handoffArrival, handoffCardHead, handoffGoneText, handoffLineText, handoffMove, handoffToastText, type HandoffScreen } from "./handoffView";
import { startErrorView } from "./homeComposer";

const DRAFTS = { path: ".doan/canvases/drafts.html", id: "drafts" }, CHECKOUT = { path: ".doan/canvases/checkout-flow.html", id: "checkout" };
const notice: HandoffNotice = { root: "/w/a", source: { conversationId: "c1", canvas: DRAFTS }, target: { conversationId: "c2", canvas: CHECKOUT } };
const onSource: HandoffScreen = { canvas: { root: "/w/a", canvas: DRAFTS }, locked: false, dialog: false, firstRun: false, typing: false };

describe("handoffMove (design §6 'Move', decision 5)", () => {
  test("moves only from the source conversation's canvas page with nothing in the way", () => {
    expect(handoffMove(onSource, notice)).toBe("move");
    // Found by ID: a rename since the start is still the same canvas.
    expect(handoffMove({ ...onSource, canvas: { root: "/w/a", canvas: { path: ".doan/canvases/renamed.html", id: "drafts" } } }, notice)).toBe("move");
  });
  test.each<[string, Partial<HandoffScreen>]>([
    ["another canvas", { canvas: { root: "/w/a", canvas: { path: ".doan/canvases/other.html", id: "other" } } }],
    ["the same canvas in another root", { canvas: { root: "/w/b", canvas: DRAFTS } }],
    ["Overview, Home, Settings (no canvas page)", { canvas: null }],
    ["a page lock", { locked: true }],
    ["a dialog", { dialog: true }],
    ["first run", { firstRun: true }],
    ["typing in the source composer (a draft or an IME composition)", { typing: true }],
  ])("%s → toast", (_name, patch) => {
    expect(handoffMove({ ...onSource, ...patch }, notice)).toBe("toast");
  });
});

describe("handoffArrival: the wait for the target's list read", () => {
  test("a listed target moves at once; an unlisted one waits until the limit, then toasts", () => {
    expect(HANDOFF_WAIT_MS).toBe(10_000);
    expect(handoffArrival(onSource, notice, true, false)).toBe("move");
    expect(handoffArrival(onSource, notice, false, false)).toBe("wait");
    expect(handoffArrival(onSource, notice, false, true)).toBe("toast");
  });
  test("leaving the source canvas or starting to type while waiting switches to the toast", () => {
    expect(handoffArrival({ ...onSource, canvas: null }, notice, false, false)).toBe("toast");
    expect(handoffArrival({ ...onSource, typing: true }, notice, true, false)).toBe("toast");
    expect(handoffArrival({ ...onSource, dialog: true }, notice, true, false)).toBe("toast");
  });
});

describe("handoff copy (design §6 '확정 문구')", () => {
  const ctx = { project: "acme-web", provider: "claude" as const, listed: () => true };
  const line = (item: Parameters<typeof handoffLineText>[0], over: Partial<typeof ctx> = {}) => handoffLineText(item, { ...ctx, ...over });
  const base = { kind: "handoff" as const, key: "ht1", canvas: { path: CHECKOUT.path } };
  test("pending, handed off and cancelled lines name the file", () => {
    expect(line({ ...base, outcome: "pending" })).toEqual({ icon: "forward", text: "Hands off to checkout-flow.html when this turn ends", open: null });
    const target = { conversationId: "c2", canvas: CHECKOUT };
    expect(line({ ...base, outcome: "started", target })).toEqual({ icon: "forward", text: "Handed off to checkout-flow.html", open: target });
    expect(line({ ...base, outcome: "cancelled" })).toEqual({ icon: "ban", text: "Didn’t hand off to checkout-flow.html. The turn didn’t finish.", open: null });
  });
  test("a handed-off target that is gone hides Open and says so", () => {
    expect(line({ ...base, outcome: "started", target: { conversationId: "c2", canvas: CHECKOUT } }, { listed: () => false }))
      .toEqual({ icon: "forward", text: "Handed off to checkout-flow.html · No longer in acme-web", open: null });
  });
  test.each([
    ["not_listed", "Didn’t hand off to checkout-flow.html. It isn’t a single canvas in acme-web."],
    ["not_new", "Didn’t hand off to checkout-flow.html. It existed before this turn started."],
    ["has_conversation", "Didn’t hand off to checkout-flow.html. It already has a conversation."],
    // A refused start's own code: a canvas gone at the start reads as not listed.
    ["canvas_not_found", "Didn’t hand off to checkout-flow.html. It isn’t a single canvas in acme-web."],
  ])("refused %s", (reason, text) => {
    expect(line({ ...base, outcome: "refused", reason })).toEqual({ icon: "ban", text, open: null });
  });
  test("same_canvas names the conversation's own canvas", () => {
    expect(line({ kind: "handoff", key: "ht1", canvas: { path: DRAFTS.path }, outcome: "refused", reason: "same_canvas" }))
      .toEqual({ icon: "ban", text: "Didn’t hand off. drafts.html is this conversation’s own canvas.", open: null });
  });
  test("any other refused start reads as the shipped start refusal after the line's lead", () => {
    for (const code of ["not_logged_in", "busy", "session_in_use", "project_not_open", "bad_request"]) {
      expect(line({ ...base, outcome: "refused", reason: code }).text).toBe(`Didn’t hand off to checkout-flow.html. ${startErrorView(code, "claude", "acme-web").text}`);
    }
  });
  test("the card head, the toast and the vanished target's answer", () => {
    expect(handoffCardHead(DRAFTS, "acme-web", true)).toBe("Handed off from drafts.html");
    expect(handoffCardHead(DRAFTS, "acme-web", false)).toBe("Handed off from drafts.html · No longer in acme-web");
    expect(handoffToastText(notice)).toBe("drafts.html handed off to checkout-flow.html");
    expect(handoffGoneText(CHECKOUT.path, "acme-web")).toBe("Couldn’t open checkout-flow.html. The canvas isn’t in acme-web.");
  });
});
