import { describe, expect, test } from "vitest";
import type { PrototypeReveal } from "../main/prototype/ipc";
import type { CanvasRow, FolderEntry } from "../main/view";
import { REVEAL_DIALOG, revealDecision, revealName, type RevealState } from "./revealDecision";

// What the main window does with a prototype window's chip, Sign in or Open (main already checked its scope and
// brought this window forward). Nothing the main window holds is cancelled: a dialog, a page lock or first run turns
// it into one toast.

const ROOT = "/w/a", OTHER = "/w/b";
const checkout: CanvasRow = { path: ".doan/canvases/checkout.html", id: "checkout", url: "u-c", frames: [{ id: "payment", title: "Payment" }] };
const drafts: CanvasRow = { path: ".doan/canvases/drafts.html", id: "drafts", url: "u-d" };
const plain: CanvasRow = { path: ".doan/canvases/plain.html", url: "u-p" };
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases });
const state = (over: Partial<RevealState> = {}): RevealState => ({
  locked: null, firstRun: false, dialog: false, onScreen: { root: ROOT, canvas: { path: drafts.path, id: "drafts" } },
  entries: [list(ROOT, [checkout, drafts, plain]), list(OTHER, [{ ...checkout, url: "u-c2" }])], ...over,
});
const chip = (canvas: { path: string; id?: string }, anchor: PrototypeReveal & { kind: "chip" } extends { anchor: infer A } ? A : never = { frame: { id: "payment", title: "Payment" } }, root = ROOT): PrototypeReveal =>
  ({ kind: "chip", root, canvas, conversationId: "c1", anchor });

describe("a person's chip", () => {
  test("locates on the canvas on screen, as a sent chip does", () => {
    const anchor = { element: { doanId: "save", selector: "#save", text: "Save" } };
    expect(revealDecision(chip({ path: drafts.path, id: "drafts" }, anchor), state())).toEqual({ kind: "locate", anchor });
  });

  test("opens another canvas of the root by its id, then locates the anchor there", () => {
    expect(revealDecision(chip({ path: checkout.path, id: "checkout" }), state())).toEqual({ kind: "open", root: ROOT, row: checkout, anchor: { frame: { id: "payment", title: "Payment" } } });
  });

  test("an ID-less canvas is matched by its path", () => {
    const anchor = { point: { frameId: "f", dx: 1, dy: 2 } };
    expect(revealDecision(chip({ path: plain.path }, anchor), state())).toEqual({ kind: "open", root: ROOT, row: plain, anchor });
    expect(revealDecision(chip({ path: plain.path }, anchor), state({ onScreen: { root: ROOT, canvas: { path: plain.path } } }))).toEqual({ kind: "locate", anchor });
  });

  // POSTMORTEM 2026-11-01: two worktrees share canvas ids and paths, so the root decides first.
  test("the same canvas id on screen in another worktree is not this chip's canvas", () => {
    const onScreen = { root: OTHER, canvas: { path: checkout.path, id: "checkout" } };
    expect(revealDecision(chip({ path: checkout.path, id: "checkout" }), state({ onScreen }))).toMatchObject({ kind: "open", root: ROOT, row: checkout });
    expect(revealDecision(chip({ path: checkout.path, id: "checkout" }, undefined, OTHER), state({ onScreen }))).toMatchObject({ kind: "locate" });
  });

  test("an Overview over the canvas is not the canvas on screen: the chip opens it", () => {
    expect(revealDecision(chip({ path: drafts.path, id: "drafts" }), state({ onScreen: null }))).toMatchObject({ kind: "open", row: drafts });
  });

  test("a canvas the list does not name, or names twice, ends in the canvas-not-found toast", () => {
    const gone = revealDecision(chip({ path: ".doan/canvases/gone.html", id: "gone" }), state());
    expect(gone).toEqual({ kind: "canvas_not_found", root: ROOT, path: ".doan/canvases/gone.html", entry: state().entries[0] });
    const twins = state({ entries: [list(ROOT, [checkout, { ...checkout, path: ".doan/canvases/copy.html", url: "u-x" }])] });
    expect(revealDecision(chip({ path: checkout.path, id: "checkout" }), twins)).toMatchObject({ kind: "canvas_not_found" });
    const loading: FolderEntry = { path: ROOT, kind: "loading" } as FolderEntry;
    expect(revealDecision(chip({ path: checkout.path, id: "checkout" }), state({ entries: [loading] }))).toEqual({ kind: "canvas_not_found", root: ROOT, path: checkout.path, entry: loading });
  });
});

describe("the main window cannot act now", () => {
  const request = chip({ path: checkout.path, id: "checkout" });
  test("a dialog stays open and the toast names the chip", () => {
    expect(revealDecision(request, state({ dialog: true }))).toEqual({ kind: "blocked", text: `Couldn’t show Payment. ${REVEAL_DIALOG}` });
    expect(REVEAL_DIALOG).toBe("A dialog is open. Finish or cancel it, then try again.");
  });

  test("a locked page and first run give the deep link's sentence without “Couldn’t open the link.”", () => {
    expect(revealDecision(request, state({ locked: "settings", dialog: true }))).toEqual({ kind: "blocked", text: "Couldn’t show Payment. Settings is in the middle of a change. Finish or cancel it, then try again." });
    expect(revealDecision(request, state({ locked: "add_projects" }))).toEqual({ kind: "blocked", text: "Couldn’t show Payment. The Add Projects page is in the middle of a task. Finish or cancel it, then try again." });
    expect(revealDecision(request, state({ firstRun: true, dialog: true }))).toEqual({ kind: "blocked", text: "Couldn’t show Payment. Finish Doan’s first run, then try again." });
  });

  test("every kind is held the same way, Sign in included", () => {
    const settings: PrototypeReveal = { kind: "settings", provider: "codex" };
    expect(revealDecision(settings, state({ locked: "settings" }))).toEqual({ kind: "blocked", text: "Couldn’t show Settings. Settings is in the middle of a change. Finish or cancel it, then try again." });
    expect(revealDecision({ kind: "conversation", root: ROOT, conversationId: "c2" }, state({ dialog: true }))).toMatchObject({ kind: "blocked" });
    expect(revealDecision({ kind: "reply", root: ROOT, conversationId: "c1", link: { canvas: "checkout", kind: "frame", id: "payment" } }, state({ firstRun: true }))).toMatchObject({ kind: "blocked" });
    expect(revealDecision({ kind: "handoff", root: ROOT, canvas: { path: checkout.path, id: "checkout" } }, state({ dialog: true }))).toMatchObject({ kind: "blocked" });
  });
});

describe("the other kinds go to the main window's own handlers", () => {
  test("an answer's chip takes the reply chip path", () => {
    const link = { canvas: "checkout", kind: "element" as const, id: "pay" };
    expect(revealDecision({ kind: "reply", root: ROOT, conversationId: "c1", link }, state())).toEqual({ kind: "reply", root: ROOT, link });
  });

  test("Sign in, a conversation's Open and a handoff's Open pass through", () => {
    expect(revealDecision({ kind: "settings", provider: "claude" }, state())).toEqual({ kind: "settings", provider: "claude" });
    expect(revealDecision({ kind: "conversation", root: ROOT, conversationId: "p1" }, state())).toEqual({ kind: "conversation", root: ROOT, conversationId: "p1" });
    const canvas = { path: checkout.path, id: "checkout" };
    expect(revealDecision({ kind: "conversation", root: ROOT, conversationId: "c3", canvas }, state())).toEqual({ kind: "conversation", root: ROOT, conversationId: "c3", canvas });
    expect(revealDecision({ kind: "handoff", root: ROOT, canvas, conversationId: "c4" }, state())).toEqual({ kind: "handoff", root: ROOT, canvas, conversationId: "c4" });
  });
});

describe("the name a held request's toast gives", () => {
  test("a chip by its label, an answer's chip by its frame's title when the list has it, else by its id", () => {
    const entries = state().entries;
    expect(revealName(chip({ path: checkout.path }, { frame: { id: "payment", title: "Payment" } }), entries)).toBe("Payment");
    expect(revealName(chip({ path: checkout.path }, { frame: { id: "payment" } }), entries)).toBe("payment");
    expect(revealName({ kind: "reply", root: ROOT, conversationId: "c", link: { canvas: "checkout", kind: "frame", id: "payment" } }, entries)).toBe("Payment");
    expect(revealName({ kind: "reply", root: ROOT, conversationId: "c", link: { canvas: "checkout", kind: "element", id: "pay-button" } }, entries)).toBe("pay-button");
  });

  test("Settings, a conversation and a canvas by the words the main window uses", () => {
    expect(revealName({ kind: "settings", provider: "codex" }, [])).toBe("Settings");
    expect(revealName({ kind: "conversation", root: ROOT, conversationId: "c" }, [])).toBe("the conversation");
    expect(revealName({ kind: "handoff", root: ROOT, canvas: { path: ".doan/canvases/checkout.html" } }, [])).toBe("checkout");
  });
});
