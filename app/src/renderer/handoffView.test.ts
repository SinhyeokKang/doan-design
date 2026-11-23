import { describe, expect, test } from "vitest";
import type { HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import { BIND_GRACE_MS as MAIN_BIND_GRACE_MS } from "../main/conversation/project";
import { HANDOFF_WAIT_MS, handoffArrival, handoffCardHead, handoffGoneText, handoffMove, handoffMultiStep, handoffToastText, type HandoffScreen } from "./handoffView";

const DRAFTS = { path: ".doan/canvases/drafts.html", id: "drafts" }, CHECKOUT = { path: ".doan/canvases/checkout-flow.html", id: "checkout" };
const notice: HandoffNotice = { root: "/w/a", source: { conversationId: "c1", canvas: DRAFTS }, target: { conversationId: "c2", canvas: CHECKOUT } };
const onSource: HandoffScreen = { canvas: { root: "/w/a", canvas: DRAFTS }, overview: null, locked: false, dialog: false, firstRun: false, typing: false, chose: false };

describe("handoffMove", () => {
  test("moves only from the source conversation's canvas page with nothing in the way", () => {
    expect(handoffMove(onSource, notice)).toBe("move");
    // Found by ID: a rename since the start is still the same canvas.
    expect(handoffMove({ ...onSource, canvas: { root: "/w/a", canvas: { path: ".doan/canvases/renamed.html", id: "drafts" } } }, notice)).toBe("move");
  });
  test.each<[string, Partial<HandoffScreen>]>([
    ["another canvas", { canvas: { root: "/w/a", canvas: { path: ".doan/canvases/other.html", id: "other" } } }],
    ["the same canvas in another root", { canvas: { root: "/w/b", canvas: DRAFTS } }],
    ["Overview, Home, Settings (no canvas page)", { canvas: null }],
    ["the root's Overview showing the source conversation (a canvas source is not an Overview one)", { canvas: null, overview: { root: "/w/a", conversationId: "c1" } }],
    ["a page lock", { locked: true }],
    ["a dialog", { dialog: true }],
    ["first run", { firstRun: true }],
    ["typing in the source composer (a draft or an IME composition)", { typing: true }],
    ["a move or panel choice of the person's since the notice", { chose: true }],
  ])("%s → toast", (_name, patch) => {
    expect(handoffMove({ ...onSource, ...patch }, notice)).toBe("toast");
  });
});

// Several started handoffs never move the screen: the source canvas page shows its lines, anywhere else one summary toast.
describe("handoffMultiStep", () => {
  const multi: HandoffMultiNotice = { root: "/w/a", source: { conversationId: "c1", canvas: DRAFTS }, targets: [
    { conversationId: "c2", canvas: CHECKOUT }, { conversationId: "c3", canvas: { path: ".doan/canvases/payment.html", id: "payment" } }] };
  test("nothing on the source canvas page, whatever else is on screen", () => {
    expect(handoffMultiStep(onSource, multi)).toBe("none");
    expect(handoffMultiStep({ ...onSource, canvas: { root: "/w/a", canvas: { path: ".doan/canvases/renamed.html", id: "drafts" } } }, multi)).toBe("none");
    for (const patch of [{ dialog: true }, { typing: true }, { chose: true }]) expect(handoffMultiStep({ ...onSource, ...patch }, multi)).toBe("none");
  });
  test.each<[string, Partial<HandoffScreen>]>([
    ["a target canvas", { canvas: { root: "/w/a", canvas: CHECKOUT } }],
    ["the same canvas in another root", { canvas: { root: "/w/b", canvas: DRAFTS } }],
    ["Overview, Home, Settings (no canvas page)", { canvas: null }],
  ])("%s → one toast", (_name, patch) => {
    expect(handoffMultiStep({ ...onSource, ...patch }, multi)).toBe("toast");
  });
  test("the summary toast names the source and how many canvases", () => {
    expect(handoffToastText(multi, "acme-web")).toBe("drafts.html handed off to 2 canvases");
    expect(handoffToastText({ ...multi, targets: [...multi.targets, { conversationId: "c4", canvas: { path: ".doan/canvases/receipt.html" } }] }, "acme-web")).toBe("drafts.html handed off to 3 canvases");
  });
});

describe("handoffArrival: the wait for the target's list read", () => {
  test("a listed target moves at once; an unlisted one waits until the limit, then toasts", () => {
    expect(HANDOFF_WAIT_MS).toBe(MAIN_BIND_GRACE_MS);
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

describe("handoff copy", () => {
  test("the card head, the toast and the vanished target's answer", () => {
    expect(handoffCardHead({ canvas: DRAFTS }, "acme-web", true)).toBe("Handed off from drafts.html");
    expect(handoffCardHead({ canvas: DRAFTS }, "acme-web", false)).toBe("Handed off from drafts.html · No longer in acme-web");
    expect(handoffToastText(notice, "acme-web")).toBe("drafts.html handed off to checkout-flow.html");
    expect(handoffGoneText(CHECKOUT.path, "acme-web")).toBe("Couldn’t open checkout-flow.html. The canvas isn’t in acme-web.");
  });
});

// A project conversation's handoff: its source is the root's Overview (no canvas). The source page is that Overview
// showing the source conversation, for one handoff and for several (PRODUCT §5 item 2 'Handoff').
describe("a handoff from the Overview", () => {
  const fromOverview: HandoffNotice = { root: "/w/a", source: { conversationId: "c1" }, target: { conversationId: "c2", canvas: CHECKOUT } };
  const onOverview: HandoffScreen = { ...onSource, canvas: null, overview: { root: "/w/a", conversationId: "c1" } };
  test("moves only from that root's Overview showing the source conversation, nothing in the way", () => {
    expect(handoffMove(onOverview, fromOverview)).toBe("move");
    expect(handoffArrival(onOverview, fromOverview, true, false)).toBe("move");
    expect(handoffArrival(onOverview, fromOverview, false, false)).toBe("wait");
  });
  test.each<[string, Partial<HandoffScreen>]>([
    ["the same root's Overview showing another conversation", { overview: { root: "/w/a", conversationId: "c9" } }],
    ["the same root's Overview on New", { overview: { root: "/w/a", conversationId: null } }],
    ["another worktree's Overview showing the same id", { overview: { root: "/w/b", conversationId: "c1" } }],
    ["the Overview under a problem or reading overlay (no Overview shown)", { overview: null }],
    ["a canvas page", { overview: null, canvas: { root: "/w/a", canvas: DRAFTS } }],
    ["Home or Settings", { overview: null, canvas: null }],
    ["typing: a draft or an IME composition in the Overview composer, or focus in the Conversations list or an open header menu", { typing: true }],
    ["a choice of the person's since the notice (a list or menu pick, New, a send from another conversation)", { chose: true }],
    ["a page lock", { locked: true }],
    ["a dialog", { dialog: true }],
    ["first run", { firstRun: true }],
  ])("%s → toast", (_name, patch) => {
    expect(handoffMove({ ...onOverview, ...patch }, fromOverview)).toBe("toast");
  });
  test("several: nothing on the Overview showing the source conversation, one toast anywhere else", () => {
    const multi: HandoffMultiNotice = { root: "/w/a", source: { conversationId: "c1" }, targets: [
      { conversationId: "c2", canvas: CHECKOUT }, { conversationId: "c3", canvas: { path: ".doan/canvases/payment.html", id: "payment" } }] };
    expect(handoffMultiStep(onOverview, multi)).toBe("none");
    expect(handoffMultiStep({ ...onOverview, typing: true, chose: true }, multi)).toBe("none");
    for (const patch of [{ overview: { root: "/w/a", conversationId: "c9" } }, { overview: { root: "/w/a", conversationId: null } }, { overview: { root: "/w/b", conversationId: "c1" } }, { overview: null }])
      expect(handoffMultiStep({ ...onOverview, ...patch }, multi)).toBe("toast");
    expect(handoffToastText(multi, "acme-web")).toBe("acme-web Overview handed off to 2 canvases");
  });
  test("the toast names the project, since it shows on any screen; the card names the Overview alone", () => {
    expect(handoffToastText(fromOverview, "acme-web")).toBe("acme-web Overview handed off to checkout-flow.html");
    expect(handoffCardHead({}, "acme-web", true)).toBe("Handed off from Overview");
    expect(handoffCardHead({}, "acme-web", false)).toBe("Handed off from Overview · Conversation deleted");
  });
});
