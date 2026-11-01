import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, ConversationEvent, EventPayload } from "../main/conversation/types";
import { CanvasRun, canvasKey, type CanvasRunHost } from "./canvasRun";
import { DRAWING_TEXT, PROMOTED_TEXT } from "./canvasConversation";
import { ConversationStore, type ListView } from "./conversationStore";

// buzz-canvas-conversation tasks R2: the canvas panel's conversation, driven without a DOM. The host stands in for App
// and HomeRun (list reads and their counts, seen marks, focus and the drawing project conversation).

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "aaaaaaaa-0000-4000-8000-000000000002", P = "aaaaaaaa-0000-4000-8000-000000000003";
const CHECKOUT: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const CART: Canvas = { path: ".doan/canvases/cart.html", id: "cart" };
// canvas: null is a project conversation (no canvas); checkout's by default.
const summary = (conversationId: string, { canvas = CHECKOUT, ...extra }: Partial<Omit<ConversationSummary, "canvas">> & { canvas?: Canvas | null } = {}): ConversationSummary => ({
  conversationId, title: `Title ${conversationId.slice(-1)}`, state: "current", owner: "doan", provider: "claude", fromHome: false, ...(canvas ? { canvas } : {}),
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...extra,
});
let seq = 0;
const event = (conversationId: string, payload: EventPayload, turnId = "t1"): ConversationEvent => ({ v: 1, conversationId, seq: ++seq, turnId, at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const ended = (conversationId: string) => [event(conversationId, { type: "user.message", text: "hi", anchors: [] }), event(conversationId, { type: "turn.started" }), event(conversationId, { type: "turn.done" })];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

let doan: Record<string, ReturnType<typeof vi.fn>>;
let histories: Map<string, ConversationEvent[]>;
let resume: ReturnType<typeof deferred<unknown>>[];
beforeEach(() => {
  seq = 0; histories = new Map(); resume = [];
  doan = {
    readConversation: vi.fn(async ({ conversationId }: { conversationId: string }) => {
      const events = histories.get(conversationId);
      return events ? { events, lastSeq: events.at(-1)?.seq ?? 0, turn: "idle" } : { error: "not_found" };
    }),
    takeConversationDraft: vi.fn(async () => null),
    attachmentsFromPaths: vi.fn(async () => []),
    conversationResumeTarget: vi.fn(() => { const answer = deferred<unknown>(); resume.push(answer); return answer.promise; }),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const lists = new Map<string, ListView>();
  const started = new Map<string, number>(), applied = new Map<string, number>();
  const state = { focused: true, drawing: null as string | null };
  const host: CanvasRunHost = {
    list: root => lists.get(root) ?? "loading",
    readsStarted: root => started.get(root) ?? 0,
    readsApplied: root => applied.get(root) ?? 0,
    reread: vi.fn(root => { started.set(root, (started.get(root) ?? 0) + 1); }),
    markSeen: vi.fn(),
    focused: () => state.focused,
    drawing: () => state.drawing,
    changed: vi.fn(),
  };
  const store = new ConversationStore({ list: host.list, readsStarted: host.readsStarted, readsApplied: host.readsApplied, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun(host, store);
  const answer = (list: ListView) => {
    const n = (started.get(ROOT) ?? 0) + 1;
    started.set(ROOT, n);
    if (Array.isArray(list)) applied.set(ROOT, n);
    lists.set(ROOT, list);
    run.sync();
  };
  return { run, host, state, store, answer };
}
const checkout = { root: ROOT, canvas: CHECKOUT }, cart = { root: ROOT, canvas: CART };

test("the canvas's current conversation shows; another canvas's or a project conversation never does", () => {
  const h = harness();
  h.run.show(checkout);
  expect(h.run.view()).toEqual({ kind: "wait" });
  h.answer([summary(P, { canvas: null }), summary(B, { canvas: CART }), summary(A)]);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: A, archived: false, notice: null });
  h.run.show(cart);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B, archived: false, notice: null });
});

test("without a current conversation the canvas shows the new conversation state, and its draft is the canvas's", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { state: "archived" })]);
  expect(h.run.view()).toMatchObject({ kind: "new", listError: false, mode: { kind: "new", root: ROOT, canvas: CHECKOUT } });
  expect(h.run.composerKey()).toBe(canvasKey(checkout));
  expect(canvasKey(checkout)).not.toBe(canvasKey(cart));
});

test("an archived conversation shows only when chosen, and reads as archived", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { state: "archived" })]);
  h.run.select(B);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B, archived: true, notice: null });
  expect(h.run.composerKey()).toBe(`conversation:${B}`);
});

test("a requested conversation shows when the canvas opens; one not listed yet is read again first", () => {
  const h = harness();
  h.answer([summary(A)]);
  h.run.request(checkout, B, "permission");
  h.run.show(checkout);
  expect(h.host.reread).toHaveBeenCalledTimes(1);
  h.answer([summary(A, { state: "archived" }), summary(B, { phase: "waiting" })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.run.scrollRequest(B)?.to).toBe("permission");
  h.run.takeScroll(B);
  expect(h.run.scrollRequest(B)).toBeNull();
});

test("a request for another canvas's conversation falls back to this canvas's default", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { canvas: CART })]);
  h.run.request(checkout, B, null);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("a failed list read shows the new conversation state with Retry; the next read picks the current conversation", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer("error");
  expect(h.run.view()).toMatchObject({ kind: "new", listError: true });
  h.run.retryList();
  expect(h.host.reread).toHaveBeenCalledWith(ROOT);
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

// POSTMORTEM 2026-10-26 late replies: a start's reply carries the panel's revision from when it was sent.
test("a start reply that lands after the person chose another conversation, or another canvas opened, leaves that choice", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { state: "archived" })]);
  const revision = h.run.revision();
  h.run.select(A);
  h.run.started(checkout, B, "codex", revision);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // The same start shows when nothing changed meanwhile.
  h.run.select(null);
  const again = h.run.revision();
  h.run.started(checkout, B, "codex", again);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.store.providerOf(B)).toBe("codex");
  // A reply for checkout that lands while cart shows changes neither.
  h.run.select(null);
  const late = h.run.revision();
  h.run.show(cart);
  h.run.started(checkout, A, "claude", late + 1);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.run.show(checkout);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("canvas A, then B, then A keeps what A showed", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { state: "archived" }), summary(P, { canvas: CART })]);
  h.run.select(B);
  h.run.show(cart);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: P });
  h.run.show(checkout);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B, archived: true });
});

test("a canvas moved under the same ID keeps what it showed", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { state: "archived" })]);
  h.run.select(B);
  h.run.show({ root: ROOT, canvas: { path: ".doan/canvases/pay/checkout.html", id: "checkout" } });
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
});

test("opened right after a promotion the promoted conversation shows; promoted while the panel is open it is announced", () => {
  const opened = harness();
  opened.answer([summary(P, { canvas: null })]);
  opened.answer([summary(P)]);
  opened.run.show(checkout);
  expect(opened.run.view()).toEqual({ kind: "conversation", conversationId: P, archived: false, notice: null });

  const open = harness();
  open.run.show(checkout);
  open.answer([summary(P, { canvas: null })]);
  expect(open.run.view()).toMatchObject({ kind: "new", notice: null });
  open.answer([summary(P)]);
  expect(open.run.view()).toMatchObject({ kind: "new", notice: { kind: "promoted", text: PROMOTED_TEXT, open: P } });
});

test("a project conversation drawing this canvas is announced in the new conversation state, without holding Send", () => {
  const h = harness();
  h.state.drawing = P;
  h.run.show(checkout);
  h.answer([summary(P, { canvas: null, working: true, phase: "running" })]);
  expect(h.run.view()).toMatchObject({ kind: "new", notice: { kind: "drawing", text: DRAWING_TEXT, open: P }, start: { busy: null } });
});

test("while the canvas's current conversation works, the new conversation state holds Send with the busy line", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { phase: "running", working: true })]);
  h.run.select(null);
  expect(h.run.view()).toMatchObject({ kind: "new", start: { busy: { kind: "restore", open: A } } });
});

test("the terminal session is asked once per visit, holds Send until it answers, and a late answer is dropped", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(1);
  expect(doan.conversationResumeTarget).toHaveBeenCalledWith({ root: ROOT, canvas: CHECKOUT });
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: true, mode: "new" } });
  h.run.sync();
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(1);
  resume[0]!.resolve({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00.000Z" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, mode: "resume", offer: "codex" }, mode: { kind: "resume", provider: "codex", canvas: CHECKOUT } });
  expect(h.run.composerKey()).toBe(canvasKey(checkout));
  h.run.choose("new");
  expect(h.run.view()).toMatchObject({ kind: "new", start: { mode: "new" }, mode: { kind: "new" } });
  // Leaving the canvas drops the answer; the next visit asks again.
  h.run.show(cart);
  h.run.show(checkout);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(3);
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: true } });
  resume[2]!.resolve({ available: false, reason: "no_record" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, offer: null, mode: "new" } });
});

test("a terminal session answer that lands after the person left the canvas is dropped", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  h.run.show(cart);
  h.run.show(checkout);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(3);
  resume[0]!.resolve({ available: true, runtime: "claude", lastCheckAt: "x" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: true, offer: null } });
});

test("a failed resume target read starts a new conversation rather than holding Send", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  resume[0]!.resolve({ error: "unknown" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, offer: null, mode: "new" } });
});

test("seen only while the panel is open with the window focused and the conversation shows", async () => {
  const h = harness();
  histories.set(A, ended(A));
  h.run.show(checkout);
  h.answer([summary(A, { unseen: true })]);
  await flush();
  expect(h.host.markSeen).not.toHaveBeenCalled();
  h.state.focused = false;
  h.run.panel(true);
  expect(h.host.markSeen).not.toHaveBeenCalled();
  h.state.focused = true;
  h.run.focusChanged();
  expect(h.host.markSeen).toHaveBeenCalledWith(A, 3);
  h.run.focusChanged();
  expect(h.host.markSeen).toHaveBeenCalledTimes(1);
});

test("an archived conversation shown in the panel is never marked seen", async () => {
  const h = harness();
  histories.set(B, ended(B));
  h.run.panel(true);
  h.run.show(checkout);
  h.answer([summary(B, { state: "archived" })]);
  h.run.select(B);
  await flush();
  expect(h.host.markSeen).not.toHaveBeenCalled();
});

// Review BR2 R2: choosing New again while a start is in flight is a newer choice than that start.
test("choosing New again while the first send starts keeps the new conversation state when the late reply lands", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  const revision = h.run.revision();
  h.run.select(null);
  h.run.started(checkout, A, "codex", revision);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

// Review BR2 R3: a start shows before any list names it; a list read that does not name it yet keeps it.
test("a started conversation stays shown through list reads that do not name it yet, then the list confirms it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  h.run.started(checkout, A, "codex", h.run.revision());
  h.run.sync();
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // An older read with another current conversation on the canvas does not take it over either.
  h.answer([summary(B)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  h.answer([summary(B, { state: "archived" }), summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // Confirmed: from now on the list's own rules apply again.
  h.run.select(null);
  h.answer([summary(B, { state: "archived" }), summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("a list naming the started conversation before its reply keeps it once the reply shows it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  const revision = h.run.revision();
  h.answer([summary(A)]);
  // The list already picked A as the canvas's current; the start reply for it changes nothing.
  h.run.started(checkout, A, "codex", revision);
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

// Review BR2 Y2: a late Edit and resend focuses only while the same canvas still shows the same conversation.
test("what shows is identified by canvas, conversation and revision", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(P, { canvas: CART })]);
  const shown = h.run.showing();
  expect(shown).toMatchObject({ conversationId: A });
  expect(h.run.stillShowing(shown!)).toBe(true);
  h.run.show(cart);
  expect(h.run.stillShowing(shown!)).toBe(false);
  h.run.show(checkout);
  h.run.select(null); h.run.select(A);
  expect(h.run.stillShowing(shown!)).toBe(false);
});
