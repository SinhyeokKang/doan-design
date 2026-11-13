import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../../main/conversation/summary";
import type { Anchor } from "../../main/conversation/types";
import type { PrototypeView } from "../../main/prototype/ipc";
import type { FieldSegment } from "../anchorField";
import { EMPTY_DRAFT, type DockedDraft } from "../dockedRules";
import { carryPrototypeDraft, conversationButton, playingFrameChip, playingFrameCount, prototypeShownConversation, withPlayingFrame } from "./conversation";

const ROOT = "/w/acme";
const CHECKOUT = { path: ".doan/canvases/checkout.html", id: "checkout" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", state: "current", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});

describe("prototypeShownConversation", () => {
  const target = { root: ROOT, canvas: CHECKOUT };

  test("shows the playing canvas's current conversation", () => {
    const list = [summary({ conversationId: "old", state: "archived" }), summary({ conversationId: "now" }), summary({ conversationId: "other", canvas: { path: ".doan/canvases/b.html", id: "b" } })];
    expect(prototypeShownConversation(list, target)).toEqual({ kind: "conversation", conversationId: "now" });
  });

  test("is the new conversation state without a current conversation, also when only archived ones exist", () => {
    expect(prototypeShownConversation([], target)).toEqual({ kind: "new" });
    expect(prototypeShownConversation([summary({ conversationId: "old", state: "archived" })], target)).toEqual({ kind: "new" });
    // A project conversation has no canvas and is never the canvas's.
    expect(prototypeShownConversation([summary({ conversationId: "p", canvas: undefined })], target)).toEqual({ kind: "new" });
  });

  test("tells a list still read from one that failed", () => {
    expect(prototypeShownConversation("loading", target)).toEqual({ kind: "list_loading" });
    expect(prototypeShownConversation("error", target)).toEqual({ kind: "list_error" });
  });

  test("is blocked while the canvas is gone or its ID is shared, whatever the list says", () => {
    for (const reason of ["gone", "duplicate"] as const) {
      expect(prototypeShownConversation([summary({ conversationId: "now" })], { ...target, lost: reason })).toEqual({ kind: "blocked", reason });
      expect(prototypeShownConversation("error", { ...target, lost: reason })).toEqual({ kind: "blocked", reason });
      expect(prototypeShownConversation("loading", { ...target, lost: reason })).toEqual({ kind: "blocked", reason });
    }
  });

  // POSTMORTEM 2026-11-01: canvases match as main matches them (sameCanvas), so an ID on either side matches by ID only.
  test("matches an ID-less canvas by path, and never an ID canvas by path alone", () => {
    const idless = { root: ROOT, canvas: { path: ".doan/canvases/sketch.html" } };
    expect(prototypeShownConversation([summary({ conversationId: "s", canvas: { path: ".doan/canvases/sketch.html" } })], idless)).toEqual({ kind: "conversation", conversationId: "s" });
    // Same path, but the conversation's canvas has an ID: another canvas.
    expect(prototypeShownConversation([summary({ conversationId: "x", canvas: { path: ".doan/canvases/sketch.html", id: "sketch" } })], idless)).toEqual({ kind: "new" });
    // A moved canvas keeps its conversation by ID.
    expect(prototypeShownConversation([summary({ conversationId: "m", canvas: { path: ".doan/canvases/moved.html", id: "checkout" } })], target)).toEqual({ kind: "conversation", conversationId: "m" });
  });

  test("a conversation whose history main could not read still shows", () => {
    expect(prototypeShownConversation([summary({ conversationId: "r", readError: true })], target)).toEqual({ kind: "conversation", conversationId: "r" });
  });
});

const frameChip = (id: string, title?: string): FieldSegment => ({ kind: "chip", anchor: { frame: { id, ...(title !== undefined ? { title } : {}) } } });
const text = (value: string): FieldSegment => ({ kind: "text", text: value });
const elementChip = (n: number): FieldSegment => ({ kind: "chip", anchor: { element: { selector: `#e${n}` } } });

describe("withPlayingFrame", () => {
  const playing = { id: "checkout", title: "Checkout" };

  test("puts the playing frame's chip first", () => {
    expect(withPlayingFrame([text("This button does nothing")], playing)).toEqual({ text: "{{1}} This button does nothing", anchors: [{ frame: { id: "checkout", title: "Checkout" } }] });
    // Text that already starts with a space or a line takes none more.
    expect(withPlayingFrame([text("\nsecond line")], playing)?.text).toBe("{{1}}\nsecond line");
  });

  test("a frame without a title anchors by its id alone", () => {
    const anchors = withPlayingFrame([text("hi")], { id: "account" })?.anchors;
    expect(anchors).toEqual([{ frame: { id: "account" } }]);
    expect(Object.keys(anchors![0]!.frame!)).toEqual(["id"]);
  });

  test("the same frame chip in the field reuses the first chip's number: one anchor", () => {
    expect(withPlayingFrame([text("see "), frameChip("checkout", "Checkout"), text(" here")], playing)).toEqual({ text: "{{1}} see {{1}} here", anchors: [{ frame: { id: "checkout", title: "Checkout" } }] });
  });

  test("a field that already starts with the playing frame's chip gets no second one", () => {
    expect(withPlayingFrame([frameChip("checkout", "Checkout"), text(" again")], playing)).toEqual({ text: "{{1}} again", anchors: [{ frame: { id: "checkout", title: "Checkout" } }] });
    // A renamed frame is still the same place.
    expect(withPlayingFrame([frameChip("checkout", "Old name"), text(" again")], playing)).toEqual({ text: "{{1}} again", anchors: [{ frame: { id: "checkout", title: "Old name" } }] });
  });

  test("a field that starts with another chip still gets the playing frame first", () => {
    const anchors: Anchor[] = [{ frame: { id: "checkout", title: "Checkout" } }, { element: { selector: "#e1" } }];
    expect(withPlayingFrame([elementChip(1), text(" is off")], playing)).toEqual({ text: "{{1}} {{2}} is off", anchors });
  });

  test("refuses past the 32-place limit, the playing frame counted", () => {
    const thirtyOne = Array.from({ length: 31 }, (_, i) => elementChip(i));
    expect(withPlayingFrame(thirtyOne, playing)?.anchors).toHaveLength(32);
    expect(withPlayingFrame([...thirtyOne, elementChip(31)], playing)).toBeNull();
    // The playing frame already among 32 places is not a 33rd.
    expect(withPlayingFrame([frameChip("checkout"), ...thirtyOne], playing)?.anchors).toHaveLength(32);
  });
});

describe("playingFrameCount", () => {
  test("counts the playing frame as one of the field's places, once", () => {
    expect(playingFrameCount([text("hi")], { id: "checkout" })).toBe(1);
    expect(playingFrameCount([elementChip(1), elementChip(2)], { id: "checkout" })).toBe(3);
    expect(playingFrameCount([frameChip("checkout"), elementChip(1)], { id: "checkout" })).toBe(2);
    expect(playingFrameCount([elementChip(1)], null)).toBe(1);
  });
});

const frames = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", size: "390x844", number: 3 }];
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 2, root: ROOT, path: CHECKOUT.path, frame: "checkout", title: "Checkout", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://127.0.0.1/a.html", markWidth: 390, markHeight: 844 }, frames, canGoBack: false, canGoForward: false, previousStopped: false, ...over,
});

describe("playingFrameChip", () => {
  test("names the frame by its original title and says it goes with each message", () => {
    expect(playingFrameChip(view(), null)).toEqual({ frame: { id: "checkout", title: "Checkout" }, name: "Checkout", description: "Frame Checkout is sent with each message." });
  });

  test("a frame without a title is named and anchored by its id; the view's title is not the anchor's", () => {
    const chip = playingFrameChip(view({ frame: "account", title: "account" }), null);
    expect(chip).toEqual({ frame: { id: "account" }, name: "account", description: "Frame account is sent with each message." });
    // view.title stands in for a missing title, so it never names the anchor.
    expect(playingFrameChip(view({ frame: "gone", title: "Fallback", frames: [] }), null)?.frame).toEqual({ id: "gone" });
  });

  test("while the next frame loads, the chip is already that frame", () => {
    expect(playingFrameChip(view({ phase: "loading", frame: "account", title: "account" }), playingFrameChip(view(), null))?.frame).toEqual({ id: "account" });
    // Its title known from the list the window still has.
    expect(playingFrameChip(view({ phase: "loading", frame: "checkout", frames }), null)?.name).toBe("Checkout");
  });

  test("a lost frame keeps its last id and title", () => {
    const last = playingFrameChip(view(), null);
    for (const phase of ["frame-unavailable", "prototype-unavailable", "init-failed", "read-failed"] as const) {
      expect(playingFrameChip(view({ phase, frames: [] }), last), phase).toEqual(last);
    }
    // The last chip was another frame's: only the id is known.
    expect(playingFrameChip(view({ phase: "frame-unavailable", frame: "pay", title: "pay", frames: [] }), last)?.frame).toEqual({ id: "pay" });
  });

  test("nothing before the first view", () => {
    expect(playingFrameChip(null, null)).toBeNull();
  });
});

describe("conversationButton", () => {
  test("open: Hide conversation, with no badge", () => {
    expect(conversationButton(true, summary({ phase: "waiting", working: true, unseen: true }))).toEqual({ label: "Hide conversation", badge: null, name: "Hide conversation" });
  });

  test("closed with nothing to say: Show conversation", () => {
    expect(conversationButton(false, undefined)).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
    expect(conversationButton(false, summary({}))).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
  });

  test("closed: each badge with its accessible name", () => {
    expect(conversationButton(false, summary({ phase: "waiting" }))).toEqual({ label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" });
    expect(conversationButton(false, summary({ phase: "running", working: true }))).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
    expect(conversationButton(false, summary({ unseen: true }))).toEqual({ label: "Show conversation", badge: "unseen", name: "Show conversation, conversation finished unread" });
  });

  test("one badge at a time: waiting before working before unread", () => {
    expect(conversationButton(false, summary({ phase: "waiting", working: true, unseen: true }))?.badge).toBe("permission");
    expect(conversationButton(false, summary({ phase: "running", working: true, unseen: true }))?.badge).toBe("working");
    // Background work after the turn ended still works.
    expect(conversationButton(false, summary({ phase: "ended", working: true, unseen: true }))?.badge).toBe("working");
  });

  test("an ending already seen in this run, or an archived conversation, has no badge", () => {
    expect(conversationButton(false, summary({ unseen: true }), new Set(["c1"])).badge).toBeNull();
    expect(conversationButton(false, summary({ state: "archived", phase: "waiting" })).badge).toBeNull();
  });
});

describe("carryPrototypeDraft", () => {
  const draft: DockedDraft = { ...EMPTY_DRAFT, segments: [text("half written")] };
  const FROM = "conversation:old", TO = "conversation:new";

  test("moves the draft to the new current conversation's key when that key has none", () => {
    const moved = carryPrototypeDraft(new Map([[FROM, draft]]), FROM, TO);
    expect(moved.get(TO)).toBe(draft);
    expect(moved.get(FROM) ?? EMPTY_DRAFT).toEqual(EMPTY_DRAFT);
    // An empty draft there counts as none.
    expect(carryPrototypeDraft(new Map([[FROM, draft], [TO, EMPTY_DRAFT]]), FROM, TO).get(TO)).toBe(draft);
  });

  test("leaves both alone when the new key already has a draft", () => {
    const waiting: DockedDraft = { ...EMPTY_DRAFT, segments: [text("mine")] };
    const drafts = new Map([[FROM, draft], [TO, waiting]]);
    expect(carryPrototypeDraft(drafts, FROM, TO)).toBe(drafts);
  });

  test("nothing to move: the same map", () => {
    const drafts = new Map([[TO, EMPTY_DRAFT]]);
    expect(carryPrototypeDraft(drafts, FROM, TO)).toBe(drafts);
    expect(carryPrototypeDraft(new Map([[FROM, EMPTY_DRAFT]]), FROM, TO).get(TO)).toBeUndefined();
    const same = new Map([[FROM, draft]]);
    expect(carryPrototypeDraft(same, FROM, FROM)).toBe(same);
  });
});
