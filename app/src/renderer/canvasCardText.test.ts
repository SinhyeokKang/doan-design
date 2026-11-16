import { describe, expect, test } from "vitest";
import type { Canvas } from "../main/conversation/types";
import { canvasCardText, middleCut, newCanvasesText } from "./canvasCardText";
import { startErrorView } from "./homeComposer";
import type { ThreadItem } from "./threadItems";

// The card's copy is the confirmed draft's (.doan/canvases/canvas-drawing-cards.html): the head names the file, the status
// never repeats it.
type Card = Extract<ThreadItem, { kind: "canvasCard" }>;
const CHECKOUT = { path: ".doan/canvases/checkout-flow.html", id: "checkout" }, HOME = { path: ".doan/canvases/home.html", id: "home" };
const card = (patch: Partial<Card> = {}): Card => ({ kind: "canvasCard", key: `ct1:${CHECKOUT.path}`, canvas: CHECKOUT, drawing: false, drawn: true, ...patch });
const ctx = { project: "acme-web", provider: "claude" as const, listed: (_canvas: Canvas) => true };
const view = (item: Card, over: Partial<typeof ctx> = {}) => canvasCardText(item, { ...ctx, ...over });
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

  test("a canvas gone since: any status gains “No longer in <project>” and Open goes", () => {
    const asked: unknown[] = [];
    const gone = { listed: (canvas: Canvas) => { asked.push(canvas); return false; } };
    expect(view(card(), gone)).toEqual({ icon: "check", name: "checkout-flow.html", status: "Drawn · No longer in acme-web", label: "checkout-flow.html, Drawn · No longer in acme-web", open: null });
    expect(view(card({ drawing: true }), gone)).toMatchObject({ status: "Drawing · No longer in acme-web", open: null });
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

  test("a pending request for a path not listed hides Open without a tail: it may not exist yet", () => {
    expect(view(card({ drawing: true, drawn: false, canvas: { path: CHECKOUT.path }, handoff: { outcome: "pending" } }), { listed: () => false }))
      .toMatchObject({ status: "Hands off when this turn ends", open: null });
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

// The thread's status line adds this after the last turn's end title once the turn ended.
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
