import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../../main/conversation/summary";
import type { Anchor } from "../../main/conversation/types";
import type { PrototypeView } from "../../main/prototype/ipc";
import type { FieldSegment } from "../anchorField";
import { conversationButton, playingFrameChip, prototypeHeadTitle, prototypeShown, withPlayingFrame } from "./conversation";

const ROOT = "/w/acme";
const CHECKOUT = { path: ".doan/canvases/checkout.html", id: "checkout" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});

// The main window's pick rule, in the prototype window's own instance.
describe("prototypeShown", () => {
  const target = { root: ROOT, canvas: CHECKOUT };
  const start = { mode: "new" as const, offer: null, pending: false };
  const fresh = (listError: boolean) => ({ kind: "new" as const, listError, notice: null, start, resume: undefined, mode: { kind: "new" as const, root: ROOT, canvas: CHECKOUT } });

  test("the conversation the window's canvas run shows", () => {
    expect(prototypeShown({ kind: "conversation", conversationId: "c2", notice: null } as never, target)).toEqual({ kind: "conversation", conversationId: "c2" });
  });

  test("the new conversation state, and a failed first read as the list error", () => {
    expect(prototypeShown(fresh(false), target)).toEqual({ kind: "new" });
    expect(prototypeShown(fresh(true), target)).toEqual({ kind: "list_error" });
  });

  test("nothing picked yet, before any view and while the canvas row is read, is the list still read", () => {
    expect(prototypeShown({ kind: "wait" }, target)).toEqual({ kind: "list_loading" });
    expect(prototypeShown(null, target)).toEqual({ kind: "list_loading" });
    expect(prototypeShown({ kind: "conversation", conversationId: "c2", notice: null } as never, target, true)).toEqual({ kind: "list_loading" });
  });

  test("is blocked while the canvas is gone or its ID is shared, whatever the run shows", () => {
    for (const reason of ["gone", "duplicate"] as const) {
      expect(prototypeShown({ kind: "conversation", conversationId: "c2", notice: null } as never, { ...target, lost: reason })).toEqual({ kind: "blocked", reason });
      expect(prototypeShown(fresh(true), { ...target, lost: reason })).toEqual({ kind: "blocked", reason });
      expect(prototypeShown({ kind: "wait" }, { ...target, lost: reason }, true)).toEqual({ kind: "blocked", reason });
    }
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

const frames = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", size: "390x844", number: 3 }];
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 2, root: ROOT, path: CHECKOUT.path, frame: "checkout", title: "Checkout", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://127.0.0.1/a.html", markWidth: 390, markHeight: 844 }, frames, gotos: [], canGoBack: false, canGoForward: false, previousStopped: false,
  panel: { open: false, width: null }, canvasRow: "present", ...over,
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
    // The title comes from the list the window still has.
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

  // The run still lists the frame, now without a title: its row decides, and the old title must not linger on the
  // chip or the next anchor. The last title stands in only for a frame the run no longer lists.
  test("a frame whose title was removed is named by its id, though the last chip had a title", () => {
    const last = playingFrameChip(view(), null);
    const untitled = [{ id: "checkout", size: "390x844", number: 1 }];
    expect(playingFrameChip(view({ frames: untitled }), last)).toEqual({ frame: { id: "checkout" }, name: "checkout", description: "Frame checkout is sent with each message." });
  });

  test("nothing before the first view", () => {
    expect(playingFrameChip(null, null)).toBeNull();
  });
});

// Hide conversation is in the panel's head, so this button is always Show conversation.
describe("conversationButton", () => {
  test("takes no open state: Show conversation with its badge whatever the panel does", () => {
    expect(conversationButton(summary({ phase: "waiting", working: true, unseen: true }))).toEqual({ label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" });
  });

  test("closed with nothing to say: Show conversation", () => {
    expect(conversationButton(undefined)).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
    expect(conversationButton(summary({}))).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
  });

  test("closed: each badge with its accessible name", () => {
    expect(conversationButton(summary({ phase: "waiting" }))).toEqual({ label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" });
    expect(conversationButton(summary({ phase: "running", working: true }))).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
    expect(conversationButton(summary({ unseen: true }))).toEqual({ label: "Show conversation", badge: "unseen", name: "Show conversation, conversation finished unread" });
  });

  test("one badge at a time: waiting before working before unread", () => {
    expect(conversationButton(summary({ phase: "waiting", working: true, unseen: true }))?.badge).toBe("permission");
    expect(conversationButton(summary({ phase: "running", working: true, unseen: true }))?.badge).toBe("working");
    // Background work after the turn ended still works.
    expect(conversationButton(summary({ phase: "ended", working: true, unseen: true }))?.badge).toBe("working");
  });

  test("an ending already seen in this run has no badge", () => {
    expect(conversationButton(summary({ unseen: true }), new Set(["c1"])).badge).toBeNull();
  });

  test("a conversation whose history main could not read shows no working badge", () => {
    expect(conversationButton(summary({ phase: "running", working: true, readError: true })).badge).toBeNull();
  });
});

describe("prototypeHeadTitle", () => {
  test("the states the panel had no head for read Conversation, not a new conversation", () => {
    expect(prototypeHeadTitle({ kind: "list_loading" }, "New conversation")).toBe("Conversation");
    expect(prototypeHeadTitle({ kind: "blocked", reason: "gone" }, "Ideas")).toBe("Conversation");
    expect(prototypeHeadTitle({ kind: "blocked", reason: "duplicate" }, "Ideas")).toBe("Conversation");
  });

  // A list never read is the new conversation state, named as the main window names it.
  test("a failed first list read reads New conversation, as the main window", () => {
    expect(prototypeHeadTitle({ kind: "list_error" }, "New conversation")).toBe("New conversation");
  });

  test("an empty title reads Conversation", () => {
    expect(prototypeHeadTitle({ kind: "conversation", conversationId: "c1" }, "")).toBe("Conversation");
  });

  test("otherwise the title given, New conversation included", () => {
    expect(prototypeHeadTitle({ kind: "conversation", conversationId: "c1" }, "Checkout Review details button")).toBe("Checkout Review details button");
    expect(prototypeHeadTitle({ kind: "new" }, "New conversation")).toBe("New conversation");
  });
});
