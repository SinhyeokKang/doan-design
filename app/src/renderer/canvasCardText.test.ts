import { describe, expect, test } from "vitest";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { canvasCardMeta, canvasCardText, listedTitle, middleCut, newCanvasesText } from "./canvasCardText";
import { startErrorView } from "./homeComposer";
import type { ThreadItem } from "./threadItems";

type Card = Extract<ThreadItem, { kind: "canvasCard" }>;
const CHECKOUT = { path: ".doan/canvases/checkout-flow.html", id: "checkout" }, HOME = { path: ".doan/canvases/home.html", id: "home" };
const card = (patch: Partial<Card> = {}): Card => ({ kind: "canvasCard", key: `ct1:${CHECKOUT.path}`, canvas: CHECKOUT, drawing: false, drawn: true, ...patch });
const ctx = { project: "acme-web", provider: "claude" as const, listed: (_canvas: Canvas) => true };
const view = (item: Card, over: Partial<Parameters<typeof canvasCardText>[1]> = {}) => canvasCardText(item, { ...ctx, ...over });
const OPEN = { canvas: CHECKOUT, label: "Open checkout-flow.html" };

describe("canvasCardText", () => {
  test("Drawing: the spinner while the turn runs, Open on that canvas", () => {
    expect(view(card({ drawing: true }))).toEqual({ icon: "spinner", name: "checkout-flow.html", status: "Drawing", label: "checkout-flow.html, Drawing", open: OPEN });
  });

  test("Drawing with a handoff asked: the spinner stays, the status says when it hands off", () => {
    expect(view(card({ drawing: true, handoff: { outcome: "pending" } })))
      .toEqual({ icon: "spinner", name: "checkout-flow.html", status: "Hands off when this turn ends", label: "checkout-flow.html, Hands off when this turn ends", open: OPEN });
    // A request alone (an existing canvas, or one a shell made) was never drawn this turn: no spinner while the turn runs.
    expect(view(card({ drawing: true, drawn: false, canvas: { path: CHECKOUT.path }, handoff: { outcome: "pending" } })))
      .toMatchObject({ icon: "forward", status: "Hands off when this turn ends", open: { canvas: { path: CHECKOUT.path }, label: "Open checkout-flow.html" } });
    // After the turn's end and before main judged it: no spinner.
    expect(view(card({ handoff: { outcome: "pending" } }))).toMatchObject({ icon: "forward", status: "Hands off when this turn ends", open: OPEN });
  });

  test("Drawn: the check, Open on that canvas", () => {
    expect(view(card())).toEqual({ icon: "check", name: "checkout-flow.html", status: "Drawn", label: "checkout-flow.html, Drawn", open: OPEN });
  });

  test("Handed off: Open goes to the new conversation and says so", () => {
    const target = { conversationId: "c2", canvas: CHECKOUT };
    expect(view(card({ handoff: { outcome: "started", target } }))).toEqual({ icon: "forward", name: "checkout-flow.html", status: "Handed off", label: "checkout-flow.html, Handed off",
      open: { canvas: CHECKOUT, conversationId: "c2", label: "Open the new conversation on checkout-flow.html" } });
  });

  test.each([
    ["not_new", "Didn’t hand off. It existed before this turn started."],
    ["has_conversation", "Didn’t hand off. It already has a conversation."],
  ])("refused %s: the ban with the shipped reason, Open on that canvas", (reason, status) => {
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason } }))).toEqual({ icon: "ban", name: "checkout-flow.html", status, label: `checkout-flow.html, ${status}`, open: OPEN });
  });

  test("refused for a canvas that isn't a single canvas: the reason says it, so no tail and no Open", () => {
    for (const reason of ["not_listed", "canvas_not_found"]) {
      expect(view(card({ drawn: false, handoff: { outcome: "refused", reason } }), { listed: () => false }))
        .toMatchObject({ icon: "ban", status: "Didn’t hand off. It isn’t a single canvas in acme-web.", open: null });
    }
  });

  test("refused as the conversation's own canvas: no Open", () => {
    expect(view(card({ canvas: HOME, key: `ct1:${HOME.path}`, drawn: false, handoff: { outcome: "refused", reason: "same_canvas" } })))
      .toEqual({ icon: "ban", name: "home.html", status: "Didn’t hand off. It’s this conversation’s own canvas.", label: "home.html, Didn’t hand off. It’s this conversation’s own canvas.", open: null });
  });

  test("any other refused start reads as the shipped start refusal after the lead", () => {
    for (const code of ["not_logged_in", "busy", "session_in_use", "project_not_open", "bad_request"]) {
      expect(view(card({ handoff: { outcome: "refused", reason: code } })).status).toBe(`Didn’t hand off. ${startErrorView(code, "claude", "acme-web").text}`);
    }
  });

  test("cancelled and missed: the ban, Open on that canvas", () => {
    expect(view(card({ handoff: { outcome: "cancelled" } }))).toEqual({ icon: "ban", name: "checkout-flow.html", status: "Didn’t hand off. The turn didn’t finish.", label: "checkout-flow.html, Didn’t hand off. The turn didn’t finish.", open: OPEN });
    expect(view(card({ handoff: { outcome: "missed" } }))).toEqual({ icon: "ban", name: "checkout-flow.html", status: "Didn’t hand off. The agent didn’t ask to.", label: "checkout-flow.html, Didn’t hand off. The agent didn’t ask to.", open: OPEN });
  });

  test("a card still drawing never reads as gone: Open waits until the canvas is listed", () => {
    const unlisted = { listed: () => false };
    expect(view(card({ drawing: true }), unlisted)).toEqual({ icon: "spinner", name: "checkout-flow.html", status: "Drawing", label: "checkout-flow.html, Drawing", open: null });
    expect(view(card({ drawing: true }), { listed: () => true })).toMatchObject({ status: "Drawing", open: OPEN });
  });

  test("a canvas gone since: any status gains “No longer in <project>” and Open goes", () => {
    const asked: unknown[] = [];
    const gone = { listed: (canvas: Canvas) => { asked.push(canvas); return false; } };
    expect(view(card(), gone)).toEqual({ icon: "check", name: "checkout-flow.html", status: "Drawn · No longer in acme-web", label: "checkout-flow.html, Drawn · No longer in acme-web", open: null });
    expect(view(card({ handoff: { outcome: "missed" } }), gone)).toMatchObject({ status: "Didn’t hand off. The agent didn’t ask to. · No longer in acme-web", open: null });
    expect(view(card({ handoff: { outcome: "cancelled" } }), gone)).toMatchObject({ status: "Didn’t hand off. The turn didn’t finish. · No longer in acme-web", open: null });
    // Found by ID, as the promotion marker's canvas is.
    expect(asked).toContainEqual(CHECKOUT);
  });

  test("a handed-off card is judged by its target", () => {
    const target = { conversationId: "c2", canvas: { path: ".doan/canvases/renamed.html", id: "checkout" } };
    const asked: unknown[] = [];
    expect(view(card({ handoff: { outcome: "started", target } }), { listed: canvas => { asked.push(canvas); return false; } }))
      .toEqual({ icon: "forward", name: "checkout-flow.html", status: "Handed off · No longer in acme-web", label: "checkout-flow.html, Handed off · No longer in acme-web", open: null });
    expect(asked).toEqual([target.canvas]);
  });

  test("an earlier build's handoff_turn refusal keeps the shipped start refusal wording", () => {
    expect(view(card({ handoff: { outcome: "refused", reason: "handoff_turn" } })).status).toBe(`Didn’t hand off. ${startErrorView("handoff_turn", "claude", "acme-web").text}`);
  });

  test.each([
    ["chain_return", "That conversation is earlier in this chain."],
    ["chain_one", "A turn started by a message can send only once."],
    ["chain_limit", "This chain reached 5 steps."],
  ])("chain refusal %s: the handoff's ban and the send's icon, each with its lead, Open on that canvas", (reason, sentence) => {
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason } }))).toEqual({ icon: "ban", name: "checkout-flow.html", status: `Didn’t hand off. ${sentence}`, label: `checkout-flow.html, Didn’t hand off. ${sentence}`, open: OPEN });
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason, via: "send" } }))).toEqual({ icon: "send", name: "checkout-flow.html", status: `Didn’t send. ${sentence}`, label: `checkout-flow.html, Didn’t send. ${sentence}`, open: OPEN });
  });

  test("a pending request for a path not listed hides Open without a tail: it may not exist yet", () => {
    expect(view(card({ drawing: true, drawn: false, canvas: { path: CHECKOUT.path }, handoff: { outcome: "pending" } }), { listed: () => false }))
      .toMatchObject({ status: "Hands off when this turn ends", open: null });
  });
});

describe("canvasCardText for a send", () => {
  const target = { conversationId: "c9", canvas: CHECKOUT };
  const titles = (id: string) => id === "c9" ? "Payment states" : null;
  const sent = (queued: boolean): Card => card({ drawn: false, handoff: { outcome: "sent", target, queued, via: "send" } });

  test("waits: the send icon and when it sends, Open on that canvas, even on a canvas this turn drew", () => {
    expect(view(card({ drawn: false, handoff: { outcome: "pending", via: "send" } }))).toEqual({ icon: "send", name: "checkout-flow.html", status: "Sends when this turn ends", label: "checkout-flow.html, Sends when this turn ends", open: OPEN });
    expect(view(card({ drawing: true, handoff: { outcome: "pending", via: "send" } }))).toMatchObject({ icon: "send", status: "Sends when this turn ends" });
  });

  test("sent or queued: names the receiving conversation, Open goes to it", () => {
    expect(view(sent(false), { conversationTitle: titles })).toEqual({ icon: "send", name: "checkout-flow.html", status: "Sent to “Payment states”", label: "checkout-flow.html, Sent to “Payment states”",
      open: { canvas: CHECKOUT, conversationId: "c9", label: "Open “Payment states” on checkout-flow.html" } });
    expect(view(sent(true), { conversationTitle: titles })).toMatchObject({ icon: "send", status: "Queued in “Payment states”", open: { conversationId: "c9", label: "Open “Payment states” on checkout-flow.html" } });
  });

  test("a receiving conversation whose title is not known yet reads as a conversation", () => {
    expect(view(sent(false))).toMatchObject({ status: "Sent to a conversation", open: { conversationId: "c9", label: "Open the conversation on checkout-flow.html" } });
    expect(view(sent(true), { conversationTitle: () => null })).toMatchObject({ status: "Queued in a conversation" });
  });

  test("the receiving conversation deleted since: no Open, the status says so", () => {
    expect(view(sent(false), { conversationListed: () => false })).toEqual({ icon: "send", name: "checkout-flow.html", status: "Sent to a conversation · Conversation deleted", label: "checkout-flow.html, Sent to a conversation · Conversation deleted", open: null });
  });

  test("the receiving canvas gone since: the shipped tail, no Open", () => {
    expect(view(sent(true), { conversationTitle: titles, listed: () => false })).toMatchObject({ icon: "send", status: "Queued in “Payment states” · No longer in acme-web", open: null });
  });

  test("refused, cancelled and any other start refusal lead with Didn’t send", () => {
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason: "not_listed", via: "send" } }), { listed: () => false }))
      .toMatchObject({ icon: "send", status: "Didn’t send. It isn’t a single canvas in acme-web.", open: null });
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason: "same_canvas", via: "send" } }))).toMatchObject({ icon: "send", status: "Didn’t send. It’s this conversation’s own canvas.", open: null });
    expect(view(card({ drawn: false, handoff: { outcome: "cancelled", via: "send" } }))).toMatchObject({ icon: "send", status: "Didn’t send. The turn didn’t finish.", open: OPEN });
    expect(view(card({ drawn: false, handoff: { outcome: "refused", reason: "busy", via: "send" } })).status).toBe(`Didn’t send. ${startErrorView("busy", "claude", "acme-web").text}`);
  });
});

describe("canvasCardMeta", () => {
  const ROOT = "/w/acme-web";
  // Local times, as the tooltip reads them.
  const NOW = new Date(2026, 10, 25, 14, 4).getTime();
  const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
  const row = (patch: Partial<CanvasRow> = {}): CanvasRow => ({ path: CHECKOUT.path, id: "checkout", width: 390, mtimeMs: new Date(2026, 10, 25, 14, 2).getTime(),
    frames: [{ id: "a" }, { id: "b" }, { id: "c" }], url: "doan://x", ...patch });
  const ready = { kind: "ready" as const, url: "blob:1" };
  const meta = (patch: Partial<CanvasRow> = {}, over: Parameters<typeof canvasCardMeta>[4] = {}) => canvasCardMeta(row(patch), ready, NOW, ROOT, over);

  test("a listed canvas: its thumbnail, frame count and modified time with the absolute time", () => {
    expect(canvasCardMeta(row(), ready, NOW, ROOT)).toEqual({ thumb: ready, frames: "3 frames", folder: null, handedOff: null,
      edited: { lead: "Edited", text: "2m ago", dateTime: new Date(2026, 10, 25, 14, 2).toISOString(), title: "2026-11-25 14:02" } });
  });

  test("a canvas gone since shows nothing, a cached thumbnail included", () => {
    expect(canvasCardMeta(undefined, ready, NOW, ROOT)).toEqual({ thumb: { kind: "none" }, frames: null, edited: null, folder: null, handedOff: null });
  });

  test.each([
    ["not captured yet", {}, undefined, { kind: "pending" }],
    ["pending", {}, { kind: "pending" as const }, { kind: "pending" }],
    ["failed", {}, { kind: "failed" as const }, { kind: "failed" }],
    ["ready", {}, ready, ready],
    ["an unreadable canvas with an old image", { error: { code: "unreadable_canvas", message: "x" } }, ready, { kind: "unreadable" }],
  ])("thumbnail: %s", (_name, patch, state, thumb) => {
    expect(canvasCardMeta(row(patch), state, NOW, ROOT).thumb).toEqual(thumb);
  });

  test("thumbnail: a canvas without a width has none to capture", () => {
    const { width: _width, ...bare } = row();
    expect(canvasCardMeta(bare, undefined, NOW, ROOT).thumb).toEqual({ kind: "noWidth" });
  });

  test("Drawing shows no thumbnail and no frame count; the time and the folder stay", () => {
    expect(meta({ path: ".doan/ds/button.html" }, { drawing: true })).toMatchObject({ thumb: { kind: "none" }, frames: null, folder: ".doan/ds", edited: { text: "2m ago" } });
  });

  test.each<[string, Partial<CanvasRow>, string]>([
    ["none listed", { frames: [] }, "No frames"],
    ["one", { frames: [{ id: "a" }] }, "1 frame"],
    ["several", { frames: [{ id: "a" }, { id: "b" }] }, "2 frames"],
    ["exactly the listed limit", { frames: Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}` })) }, "1,000 frames"],
    ["over the limit", { frames: Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}` })), framesTruncated: true }, "1,000+ frames"],
  ])("frames: %s", (_name, patch, frames) => {
    expect(meta(patch).frames).toBe(frames);
  });

  // `doan ls` sends an empty list beside the error.
  test("an unreadable canvas has no known frame count", () => {
    expect(meta({ error: { code: "unreadable_canvas", message: "x" }, frames: [] }).frames).toBeNull();
  });

  test("no modified time: no time", () => {
    const { mtimeMs: _mtime, ...bare } = row();
    expect(canvasCardMeta(bare, ready, NOW, ROOT).edited).toBeNull();
  });

  test.each([
    [-MINUTE, "just now"], [0, "just now"], [MINUTE - 1, "just now"], [MINUTE, "1m ago"], [HOUR - 1, "59m ago"], [HOUR, "1h ago"],
    [DAY - 1, "23h ago"], [DAY, "1d ago"], [2 * DAY - 1, "1d ago"], [2 * DAY, "Nov 23"], [400 * DAY, "Oct 21, 2025"],
  ])("a canvas %i ms old reads %s", (age, text) => {
    expect(meta({ mtimeMs: NOW - age }).edited?.text).toBe(text);
  });

  test.each<[string, string | null]>([
    [".doan/canvases/checkout-flow.html", null],
    [".doan/canvases/checkout/flow.html", null],
    ["/w/acme-web/.doan/canvases/flow.html", null],
    [".doan/ds/button.html", ".doan/ds"],
    [".doan/ds/forms/field.html", ".doan/ds/forms"],
    ["design/checkout/flow.html", "design/checkout"],
    [".doan/canvases-old/flow.html", ".doan/canvases-old"],
  ])("folder of %s is %s", (path, folder) => {
    expect(meta({ path }).folder).toBe(folder);
  });

  test("a handoff card shows when it handed off in place of the modified time", () => {
    const at = new Date(NOW - 5 * MINUTE);
    expect(meta({}, { handedOffAt: at.toISOString() })).toMatchObject({ frames: "3 frames", edited: null,
      handedOff: { lead: "Handed off", text: "5m ago", dateTime: at.toISOString(), title: "2026-11-25 13:59" } });
  });

  test("the handoff time stays once the source is gone or is the Overview", () => {
    expect(canvasCardMeta(undefined, undefined, NOW, ROOT, { handedOffAt: new Date(NOW).toISOString() }))
      .toMatchObject({ thumb: { kind: "none" }, frames: null, edited: null, folder: null, handedOff: { text: "just now" } });
  });

  test("an unreadable handoff time is left out", () => {
    expect(meta({}, { handedOffAt: "" })).toMatchObject({ edited: null, handedOff: null });
  });
});

// A long name keeps its start and its extension around a middle ellipsis; the full name is the tooltip.
describe("middleCut", () => {
  test("a name that fits stays whole", () => {
    expect(middleCut("checkout-flow.html", 18)).toBe("checkout-flow.html");
    expect(middleCut("checkout-flow.html", 40)).toBe("checkout-flow.html");
  });
  test("a longer one keeps its start and its end with the extension, as the draft cuts it", () => {
    expect(middleCut("onboarding-permissions-for-returning-workspace-admins.html", 24)).toBe("onboarding-per…dmins.html");
    expect(middleCut("abcdefghijklmnop", 10)).toBe("abcdef…mnop");
  });
  test("the extension is never cut, and at least one leading character stays", () => {
    expect(middleCut("abcdefghij.html", 6)).toBe("a….html");
    expect(middleCut("abcdefghij.html", 1)).toBe("a….html");
  });
});

describe("newCanvasesText", () => {
  const drawn = (path: string, patch: Partial<Card> = {}): ThreadItem => card({ key: `ct1:${path}`, canvas: { path }, ...patch });
  const end: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "interrupted", reason: "user" } };
  test("counts the new canvases among the thread's trailing cards", () => {
    expect(newCanvasesText([end, drawn("a.html"), drawn("b.html")])).toBe("2 new canvases");
    expect(newCanvasesText([end, drawn("a.html")])).toBe("1 new canvas");
    // A missed or started handoff was a new canvas too; a refused, cancelled or pending one says nothing about it.
    expect(newCanvasesText([drawn("a.html", { drawn: false, handoff: { outcome: "missed" } }), drawn("b.html", { drawn: false, handoff: { outcome: "started", target: { conversationId: "c2", canvas: { path: "b.html" } } } }),
      drawn("c.html", { drawn: false, handoff: { outcome: "refused", reason: "not_new" } })])).toBe("2 new canvases");
  });
  test("nothing without trailing new cards, or while a card still draws", () => {
    expect(newCanvasesText([])).toBe("");
    expect(newCanvasesText([drawn("a.html"), end])).toBe("");
    expect(newCanvasesText([end, drawn("a.html", { drawn: false, handoff: { outcome: "refused", reason: "not_new" } })])).toBe("");
    expect(newCanvasesText([end, drawn("a.html", { drawing: true })])).toBe("");
  });
  test("a moved-to marker after the cards still lets them count", () => {
    const bound: ThreadItem = { kind: "marker", key: "k9", seq: 9, marker: "bound", canvas: { path: "a.html", id: "a" } };
    expect(newCanvasesText([end, drawn("a.html"), bound])).toBe("1 new canvas");
    expect(newCanvasesText([end, bound])).toBe("");
  });
});

describe("listedTitle", () => {
  test("the listed title on one line; nothing while the list is not read, for an unlisted or an untitled conversation", () => {
    const list = [{ conversationId: "c1", title: "Payment\n states " }, { conversationId: "c2", title: "  " }];
    expect(listedTitle(list, "c1")).toBe("Payment states");
    expect(listedTitle(list, "c2")).toBeNull();
    expect(listedTitle(list, "c3")).toBeNull();
    expect(listedTitle("loading", "c1")).toBeNull();
    expect(listedTitle("error", "c1")).toBeNull();
  });
});
