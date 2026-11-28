import { describe, expect, test } from "vitest";
import type { HandoffMessageNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import { BIND_GRACE_MS as MAIN_BIND_GRACE_MS } from "../main/conversation/project";
import { HANDOFF_WAIT_MS, handoffArrival, handoffGoneText, handoffMetaView, handoffNameTip, handoffMove, handoffMultiStep, handoffToastText, type HandoffScreen } from "./handoffView";

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

describe("a received send's meta", () => {
  test("from the Overview with a known title, Open names it in the Overview", () => {
    const view = handoffMetaView({ via: "send" }, "acme-web", true, new Date(0).toISOString(), 60_000, { listed: true, title: "Plan the checkout" });
    expect(view.open).toBe("Open “Plan the checkout” in the Overview");
    expect(view.label).toBe("Message from Overview");
  });
});

describe("the toast of a turn that sent or ran at step 1 or later", () => {
  const message = (targets: HandoffMessageNotice["targets"], source: HandoffMessageNotice["source"] = { conversationId: "c1", canvas: DRAFTS }): HandoffMessageNotice => ({ kind: "message", root: "/w/a", source, targets });
  const PAYMENT = { path: ".doan/canvases/payment.html", id: "payment" };
  test("one send names both files; from the Overview the project is named", () => {
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "send" }]), "acme-web")).toBe("drafts.html sent a message to checkout-flow.html");
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "send" }], { conversationId: "c1" }), "acme-web")).toBe("acme-web Overview sent a message to checkout-flow.html");
  });
  test("one handoff keeps the shipped words", () => {
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "handoff" }]), "acme-web")).toBe("drafts.html handed off to checkout-flow.html");
  });
  test("several: mixed, all sends, all handoffs", () => {
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "send" }, { conversationId: "c3", canvas: PAYMENT, via: "handoff" }]), "acme-web")).toBe("drafts.html handed off or sent to 2 canvases");
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "send" }, { conversationId: "c3", canvas: PAYMENT, via: "send" }]), "acme-web")).toBe("drafts.html sent messages to 2 canvases");
    expect(handoffToastText(message([{ conversationId: "c2", canvas: CHECKOUT, via: "handoff" }, { conversationId: "c3", canvas: PAYMENT, via: "handoff" }]), "acme-web")).toBe("drafts.html handed off to 2 canvases");
  });
  test("several show nothing on the source page, as a summary does", () => {
    const several = message([{ conversationId: "c2", canvas: CHECKOUT, via: "send" }, { conversationId: "c3", canvas: PAYMENT, via: "send" }]);
    expect(handoffMultiStep(onSource, several)).toBe("none");
    expect(handoffMultiStep({ ...onSource, canvas: null }, several)).toBe("toast");
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
  test("the toast and the vanished target's answer", () => {
    expect(handoffToastText(notice, "acme-web")).toBe("drafts.html handed off to checkout-flow.html");
    expect(handoffGoneText(CHECKOUT.path, "acme-web")).toBe("Couldn’t open checkout-flow.html. The canvas isn’t in acme-web.");
  });
});

// The received handoff bubble's meta line: the source's kind and name, the handoff's time in the Overview's short words,
// and Open; a gone source shows its reason instead of the time and Open. The group's name never carries the time, which
// is its description.
describe("handoffMetaView", () => {
  const NOW = new Date(2026, 10, 25, 14, 4).getTime(), AT = new Date(2026, 10, 25, 13, 59);
  const TIME = { text: "5m ago", words: "5 minutes ago", dateTime: AT.toISOString(), title: "2026-11-25 13:59" };
  const view = (source: { canvas?: { path: string; id?: string } }, listed: boolean | null, at = AT.toISOString()) => handoffMetaView(source, "acme-web", listed, at, NOW);
  test.each<[string, { canvas?: typeof DRAFTS }, boolean | null, ReturnType<typeof handoffMetaView>]>([
    ["a canvas source", { canvas: DRAFTS }, true,
      { kind: "canvas", name: "drafts.html", time: TIME, reason: null, open: "Open drafts.html", label: "Handoff from drafts.html" }],
    ["an Overview source", {}, true,
      { kind: "overview", name: "Overview", time: TIME, reason: null, open: "Open the source conversation in the Overview", label: "Handoff from Overview" }],
    ["a canvas no longer listed", { canvas: DRAFTS }, false,
      { kind: "canvas", name: "drafts.html", time: null, reason: "No longer in acme-web", open: null, label: "Handoff from drafts.html · No longer in acme-web" }],
    ["a deleted source conversation", {}, false,
      { kind: "overview", name: "Overview", time: null, reason: "Conversation deleted", open: null, label: "Handoff from Overview · Conversation deleted" }],
    // The prototype window's unknown answer reads as there.
    ["an Overview source main has not answered for (null)", {}, null,
      { kind: "overview", name: "Overview", time: TIME, reason: null, open: "Open the source conversation in the Overview", label: "Handoff from Overview" }],
  ])("%s", (_name, source, listed, expected) => {
    expect(view(source, listed)).toEqual(expected);
  });
  test("a long source name stays whole: the line cuts it, the names hold it", () => {
    const name = "onboarding-permissions-for-returning-workspace-admins.html";
    expect(view({ canvas: { path: `.doan/canvases/${name}` } }, true)).toMatchObject({ name, open: `Open ${name}`, label: `Handoff from ${name}` });
  });
  test("the time moves with the minute in the short words, and an unreadable time shows none", () => {
    expect(view({ canvas: DRAFTS }, true, new Date(NOW - 20_000).toISOString()).time).toMatchObject({ text: "just now", words: "Just now" });
    expect(view({ canvas: DRAFTS }, true, new Date(NOW - 60_000).toISOString()).time).toMatchObject({ text: "1m ago", words: "1 minute ago" });
    expect(view({ canvas: DRAFTS }, true, new Date(NOW - 3 * 3_600_000).toISOString()).time).toMatchObject({ text: "3h ago", words: "3 hours ago" });
    expect(view({ canvas: DRAFTS }, true, "").time).toBeNull();
  });
});

// The name's tooltip, read as it would open: while the narrow thread hides the time it always opens with the name and the
// absolute time, cut or not; otherwise only a cut name opens it, with the name alone.
describe("handoffNameTip", () => {
  test.each<[string, string | null, { cut: boolean; timeHidden: boolean }, string | null]>([
    ["a whole name with its time shown", "2026-11-25 13:59", { cut: false, timeHidden: false }, null],
    ["a cut name with its time shown", "2026-11-25 13:59", { cut: true, timeHidden: false }, "drafts.html"],
    ["a whole name with its time hidden", "2026-11-25 13:59", { cut: false, timeHidden: true }, "drafts.html · 2026-11-25 13:59"],
    ["a cut name with its time hidden", "2026-11-25 13:59", { cut: true, timeHidden: true }, "drafts.html · 2026-11-25 13:59"],
    ["a gone source (no time), whole", null, { cut: false, timeHidden: true }, null],
    ["a gone source (no time), cut", null, { cut: true, timeHidden: true }, "drafts.html"],
  ])("%s", (_name, when, state, expected) => {
    expect(handoffNameTip("drafts.html", when, state)).toBe(expected);
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
  test("the toast names the project, since it shows on any screen", () => {
    expect(handoffToastText(fromOverview, "acme-web")).toBe("acme-web Overview handed off to checkout-flow.html");
  });
});
