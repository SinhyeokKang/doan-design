import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, ConversationEvent, EventPayload } from "../main/conversation/types";
import { CanvasRun, canvasKey, type CanvasRunHost } from "./canvasRun";
import { ConversationStore, type ListView } from "./conversationStore";

// Driven without a DOM: the host stands in for App and HomeRun,
// or for the prototype window's host, which only reads the conversation memory.

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "aaaaaaaa-0000-4000-8000-000000000002", P = "aaaaaaaa-0000-4000-8000-000000000003", D = "aaaaaaaa-0000-4000-8000-000000000004";
const at = (minute: number) => `2026-10-30T00:${String(minute).padStart(2, "0")}:00.000Z`;
const CHECKOUT: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const CART: Canvas = { path: ".doan/canvases/cart.html", id: "cart" };
// canvas: null is a project conversation (no canvas); checkout's by default.
const summary = (conversationId: string, { canvas = CHECKOUT, ...extra }: Partial<Omit<ConversationSummary, "canvas">> & { canvas?: Canvas | null } = {}): ConversationSummary => ({
  conversationId, title: `Title ${conversationId.slice(-1)}`, owner: "doan", provider: "claude", fromHome: false, ...(canvas ? { canvas } : {}),
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

function harness({ prototype = false }: { prototype?: boolean } = {}) {
  const lists = new Map<string, ListView>();
  const started = new Map<string, number>(), applied = new Map<string, number>();
  // remembered: ui-state's conversation for checkout (undefined until ui-state was read).
  const state = { focused: true, remembered: null as string | null | undefined };
  const remember = vi.fn<(root: string, canvas: Canvas, conversationId: string) => void>();
  const host: CanvasRunHost = {
    list: root => lists.get(root) ?? "loading",
    readsStarted: root => started.get(root) ?? 0,
    readsApplied: root => applied.get(root) ?? 0,
    reread: vi.fn(root => { started.set(root, (started.get(root) ?? 0) + 1); }),
    markSeen: vi.fn(),
    focused: () => state.focused,
    remembered: (_root, canvas) => canvas.id === CHECKOUT.id ? state.remembered : state.remembered === undefined ? undefined : null,
    ...(prototype ? {} : { remember }),
    changed: vi.fn(),
  };
  const store = new ConversationStore({ list: host.list, readsStarted: host.readsStarted, readsApplied: host.readsApplied, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun(host, store, window.doan);
  const answer = (list: ListView) => {
    const n = (started.get(ROOT) ?? 0) + 1;
    started.set(ROOT, n);
    if (Array.isArray(list)) applied.set(ROOT, n);
    lists.set(ROOT, list);
    run.sync();
  };
  return { run, host, state, store, answer, remember };
}
const checkout = { root: ROOT, canvas: CHECKOUT }, cart = { root: ROOT, canvas: CART };
const writing = (text: string) => ({ segments: [{ kind: "text" as const, text }], preset: null, attachments: [], shape: "capsule" as const });

test("the canvas's most recent conversation shows; another canvas's or a project conversation never does", () => {
  const h = harness();
  h.run.show(checkout);
  expect(h.run.view()).toEqual({ kind: "wait" });
  h.answer([summary(P, { canvas: null, lastActivityAt: at(9) }), summary(B, { canvas: CART }), summary(D, { lastActivityAt: at(1) }), summary(A, { lastActivityAt: at(2) })]);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: A });
  h.run.show(cart);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B });
});

test("a canvas without conversations shows the new conversation state, and its draft is the canvas's", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(B, { canvas: CART })]);
  expect(h.run.view()).toMatchObject({ kind: "new", listError: false, mode: { kind: "new", root: ROOT, canvas: CHECKOUT } });
  expect(h.run.composerKey()).toBe(canvasKey(checkout));
  expect(canvasKey(checkout)).not.toBe(canvasKey(cart));
});

test("the person's choice shows any of the canvas's conversations, and the view carries no archived flag", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(2) }), summary(B, { lastActivityAt: at(1) })]);
  h.run.select(B);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B });
  expect(h.run.composerKey()).toBe(`conversation:${B}`);
});

test("with nothing shown yet: a conversation waiting for an answer, else the one last seen here, else the most recent", () => {
  const waits = harness();
  waits.state.remembered = A;
  waits.run.show(checkout);
  waits.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { phase: "waiting", lastActivityAt: at(3), waitingSince: at(3) }), summary(D, { phase: "waiting", lastActivityAt: at(2), waitingSince: at(2) })]);
  expect(waits.run.view()).toMatchObject({ kind: "conversation", conversationId: D });

  const seen = harness();
  seen.state.remembered = B;
  seen.run.show(checkout);
  seen.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(seen.run.view()).toMatchObject({ kind: "conversation", conversationId: B });

  const stale = harness();
  stale.state.remembered = P;
  stale.run.show(checkout);
  stale.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) }), summary(P, { canvas: CART })]);
  expect(stale.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

// POSTMORTEM 2026-11-01 ui-state: nothing is decided from the memory before the startup read settled.
test("the first pick waits for ui-state's read; a canvas that already shows something keeps it meanwhile", () => {
  const h = harness();
  h.state.remembered = undefined;
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(h.run.view()).toEqual({ kind: "wait" });
  h.state.remembered = B;
  h.run.sync();
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  // A request does not wait for the memory.
  const asked = harness();
  asked.state.remembered = undefined;
  asked.run.request(checkout, A, null);
  asked.run.show(checkout);
  asked.answer([summary(A), summary(B)]);
  expect(asked.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

// Re-picking on every read would let each newly waiting conversation pull the panel away.
test("what shows stays across list reads, also when another conversation starts waiting or working", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { phase: "waiting", lastActivityAt: at(6) }), summary(D, { phase: "running", working: true, lastActivityAt: at(7) })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // A read in flight or a failed read keeps it too.
  h.answer("error");
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("a requested conversation shows when the canvas opens; one not listed yet is read again first", () => {
  const h = harness();
  h.answer([summary(A)]);
  h.run.request(checkout, B, "permission");
  h.run.show(checkout);
  expect(h.host.reread).toHaveBeenCalledTimes(1);
  h.answer([summary(A), summary(B, { phase: "waiting" })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.run.scrollRequest(B)?.to).toBe("permission");
  h.run.takeScroll(B);
  expect(h.run.scrollRequest(B)).toBeNull();
});

test("a request that arrives while the list is read waits for it rather than being dropped", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  h.answer("loading");
  h.run.request(checkout, B, null);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
});

test("a request for another canvas's conversation falls back to this canvas's default", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { canvas: CART })]);
  h.run.request(checkout, B, null);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("a failed list read shows the new conversation state with Retry; the next read picks a conversation", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer("error");
  expect(h.run.view()).toMatchObject({ kind: "new", listError: true });
  h.run.retryList();
  expect(h.host.reread).toHaveBeenCalledWith(ROOT);
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("the shown canvas's list Retry is the host's for its root; a host without one never runs it", () => {
  const h = harness();
  expect(h.run.listRetry()).toEqual({ running: false, failures: 0 });
  h.run.show(checkout);
  expect(h.run.listRetry()).toEqual({ running: false, failures: 0 });
  const listRetry = vi.fn((root: string) => ({ running: root === ROOT, failures: 2 }));
  const withRetry = new CanvasRun({ ...h.host, listRetry }, h.store, window.doan);
  withRetry.show(checkout);
  expect(withRetry.listRetry()).toEqual({ running: true, failures: 2 });
  expect(listRetry).toHaveBeenCalledWith(ROOT);
});

// POSTMORTEM 2026-10-26 late replies: a start's reply carries the panel's revision from when it was sent.
test("a start reply that lands after the person chose another conversation, or another canvas opened, leaves that choice", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A)]);
  const revision = h.run.revision();
  h.run.select(A);
  h.run.started(checkout, B, "codex", revision);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
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
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) }), summary(P, { canvas: CART })]);
  h.run.select(B);
  h.run.show(cart);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: P });
  h.run.show(checkout);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B });
});

test("a canvas moved under the same ID keeps what it showed", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  h.run.select(B);
  h.run.show({ root: ROOT, canvas: { path: ".doan/canvases/pay/checkout.html", id: "checkout" } });
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
});

// A handoff's conversation takes the panel only from the default new state with an empty draft (PRODUCT §5 item 2
// 'Handoff'): from a canvas conversation or the Overview alike, since its origin is only in its history.
test("a handoff's conversation takes the default new state when its draft is empty", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { canvas: CART })]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.answer([summary(A, { canvas: CART }), summary(D, { startedBy: "handoff", phase: "running", working: true })]);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: D });
});

test("a draft in the default new state, or the person's New, keeps a handoff's conversation out", () => {
  const drafted = harness();
  drafted.run.show(checkout);
  drafted.answer([]);
  drafted.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), writing("Make the header")));
  drafted.answer([summary(D, { startedBy: "handoff", phase: "running", working: true })]);
  expect(drafted.run.view()).toMatchObject({ kind: "new" });
  expect(drafted.store.drafts.get(canvasKey(checkout))).toEqual(writing("Make the header"));
  const chose = harness();
  chose.run.show(checkout);
  chose.answer([summary(A)]);
  chose.run.select(null);
  chose.answer([summary(A), summary(D, { startedBy: "handoff", phase: "running", working: true })]);
  expect(chose.run.view()).toMatchObject({ kind: "new" });
});

// POSTMORTEM 2026-11-14 draft carry: the person's own start comes first. A list naming a handoff's conversation can
// land before this panel's start reply, even after the person emptied the field; the start's reply still shows theirs.
test("a handoff's conversation listed before this panel's start reply does not take the panel", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  const revision = h.run.revision();
  const done = h.run.startSending(checkout);
  h.answer([summary(D, { startedBy: "handoff", phase: "running", working: true })]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.run.started(checkout, A, "claude", revision);
  done();
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: A });
});

// Nothing shows a project conversation drawing a canvas: the panel leaves the default new state alone, as for a canvas
// conversation's handoff target (PRODUCT §5 item 2 'Handoff').
test("a project conversation drawing this canvas shows no preview over the default new state", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(P, { canvas: null, phase: "running", working: true })]);
  expect(h.run.view()).toMatchObject({ kind: "new", listError: false });
  expect(h.run.composerKey()).toBe(canvasKey(checkout));
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

// A session Doan could not check stays unchecked for the visit: a list change does not ask the same link again.
test("a terminal session Doan could not check shows its reason and is not asked again in that visit", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  resume[0]!.resolve({ available: false, reason: "session_unverified", runtime: "claude" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, offer: null, mode: "new", reason: expect.stringContaining("Claude Code") } });
  h.answer([summary(B, { canvas: CART })]);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(1);
  // The next visit asks again (cart shows its conversation B, so only checkout asks).
  h.run.show(cart);
  h.run.show(checkout);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(2);
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

// One session is one conversation (main answers no_record for a session a conversation holds): the target is asked
// again when the new conversation state comes back and when a list change adds or drops a conversation, in both windows.
for (const prototype of [false, true]) {
  test(`after a resume, New asks again and offers no held session; the holder's deletion offers it back (${prototype ? "prototype" : "main"} window)`, async () => {
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([]);
    resume[0]!.resolve({ available: true, runtime: "claude", lastCheckAt: "x", session: "S" });
    await flush();
    expect(h.run.view()).toMatchObject({ kind: "new", start: { mode: "resume", offer: "claude" } });
    h.run.started(checkout, A, "claude", h.run.revision());
    h.answer([summary(A)]);
    h.run.select(null);
    expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(2);
    expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: true } });
    resume[1]!.resolve({ available: false, reason: "no_record" });
    await flush();
    expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, offer: null, mode: "new" } });
    h.answer([summary(A)]);
    expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(2);
    h.answer([]);
    expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(3);
    resume[2]!.resolve({ available: true, runtime: "claude", lastCheckAt: "x", session: "S" });
    await flush();
    expect(h.run.view()).toMatchObject({ kind: "new", start: { mode: "resume", offer: "claude" } });
  });
}

test("a list change while this panel's start is in flight asks nothing, so the sent mode stays", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  resume[0]!.resolve({ available: true, runtime: "claude", lastCheckAt: "x", session: "S" });
  await flush();
  const done = h.run.startSending(checkout);
  h.answer([summary(B, { canvas: CART })]);
  expect(doan.conversationResumeTarget).toHaveBeenCalledTimes(1);
  expect(h.run.view()).toMatchObject({ kind: "new", start: { mode: "resume", offer: "claude" } });
  done();
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

// A turn another conversation's message started (a send mid-conversation) leaves no unseen mark on the conversation the
// person is looking at, as a turn the person started does (POSTMORTEM 2026-11-18).
test("a received send's turn that ends while the conversation shows is seen at its end", async () => {
  const h = harness();
  const origin = { kind: "handoff" as const, conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" }, via: "send" as const, chain: ["c0"], provider: "codex" as const };
  const received = [...ended(A), event(A, { type: "user.message", text: "/compact the layout", anchors: [], origin }, "t2"), event(A, { type: "turn.started" }, "t2"), event(A, { type: "turn.done" }, "t2")];
  histories.set(A, received);
  h.run.show(checkout);
  h.run.panel(true);
  h.answer([summary(A, { unseen: true })]);
  await flush();
  expect(h.host.markSeen).toHaveBeenCalledExactlyOnceWith(A, received.at(-1)!.seq);
});

// The memory is written only under PRODUCT's Seen condition, never for what a folded panel or an unfocused window holds.
test("the conversation last seen on the canvas is remembered only while it is seen", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(h.remember).not.toHaveBeenCalled();
  h.state.focused = false;
  h.run.panel(true);
  expect(h.remember).not.toHaveBeenCalled();
  h.state.focused = true;
  h.run.focusChanged();
  expect(h.remember).toHaveBeenLastCalledWith(ROOT, CHECKOUT, A);
  h.run.select(B);
  expect(h.remember).toHaveBeenLastCalledWith(ROOT, CHECKOUT, B);
  const calls = h.remember.mock.calls.length;
  h.run.select(null);
  h.run.started(checkout, D, "claude", h.run.revision());
  expect(h.remember).toHaveBeenCalledTimes(calls);
  h.run.panel(false);
  h.run.select(A);
  expect(h.remember).toHaveBeenCalledTimes(calls);
});

// Choosing New again while a start is in flight is a newer choice than that start.
test("choosing New again while the first send starts keeps the new conversation state when the late reply lands", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  const revision = h.run.revision();
  h.run.select(null);
  h.run.started(checkout, A, "codex", revision);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

// A start shows before any list names it; a list read that does not name it yet keeps it.
test("a started conversation stays shown through list reads that do not name it yet, then the list confirms it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  h.run.started(checkout, A, "codex", h.run.revision());
  h.run.sync();
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // An older read with another conversation on the canvas does not take it over either.
  h.answer([summary(B)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  h.answer([summary(B), summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  h.run.select(null);
  h.answer([summary(B), summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("a list naming the started conversation before its reply keeps it once the reply shows it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  const revision = h.run.revision();
  h.answer([summary(A)]);
  h.run.started(checkout, A, "codex", revision);
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

// A late Edit and resend focuses only while the same canvas still shows the same conversation.
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

// A new conversation runs beside the others, so it does not wait for the list; a terminal session's wait stays.
test("New chosen while the list loads sends once the terminal session answers, without waiting for the list", async () => {
  const h = harness();
  h.run.show(checkout);
  h.run.select(null);
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: true } });
  resume[0]!.resolve({ available: false, reason: "no_record" });
  await flush();
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false, offer: null } });
  h.answer([summary(A, { phase: "running", working: true })]);
  expect(h.run.view()).toMatchObject({ kind: "new", start: { pending: false } });
});

// App marks the conversation deleting before conversation:delete, then on success calls each run's and the store's deleted.
const confirmDelete = (h: ReturnType<typeof harness>, id: string) => { h.run.deleted(id); h.store.deleted(id); };

test("deleting the shown conversation shows the next one by the shared rule; with none left, the new conversation state", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) }), summary(P, { canvas: CART, lastActivityAt: at(9) })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  const revision = h.run.revision();
  h.store.startDelete(A);
  confirmDelete(h, A);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.run.revision()).toBeGreaterThan(revision);
  expect(h.run.composerKey()).toBe(`conversation:${B}`);
  h.store.startDelete(B);
  confirmDelete(h, B);
  expect(h.run.view()).toMatchObject({ kind: "new", listError: false });
  expect(h.run.composerKey()).toBe(canvasKey(checkout));
  // Until the next read, the lists already read still name both: neither comes back.
  h.run.sync();
  h.run.show(cart);
  h.run.show(checkout);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("after deleting the shown conversation, one waiting for an answer comes before the one last seen", () => {
  const h = harness();
  h.state.remembered = A;
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) }), summary(D, { phase: "waiting", lastActivityAt: at(2) })]);
  h.run.select(B);
  confirmDelete(h, B);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: D });
});

test("a list that drops the shown conversation before the delete reply holds it until the delete is confirmed", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  h.run.select(B);
  h.store.startDelete(B);
  h.answer([summary(A)]);
  // Held while the delete is pending, rather than falling back to another conversation.
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  confirmDelete(h, B);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("a refused delete releases the hold, so the next list read picks as before", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  h.run.select(B);
  h.store.startDelete(B);
  h.store.cancelDelete(B);
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  // A list held while the delete was pending applies at the sync after the refusal.
  const held = harness();
  held.run.show(checkout);
  held.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  held.run.select(B);
  held.store.startDelete(B);
  held.answer([summary(A)]);
  held.store.cancelDelete(B);
  held.run.sync();
  expect(held.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("a start or send reply sent before the delete does not replace what shows after it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A)]);
  const revision = h.run.revision();
  confirmDelete(h, A);
  h.run.started(checkout, B, "claude", revision);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("every canvas state holding the deleted conversation is cleared: a duplicated ID and a request still waiting", () => {
  const h = harness();
  const copy = { root: ROOT, canvas: { path: ".doan/canvases/checkout-copy.html", id: "checkout" } };
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { canvas: CART, lastActivityAt: at(5) }), summary(D, { canvas: CART, lastActivityAt: at(1) })]);
  // An entry asked cart for D before cart opened; it waits in cart's state.
  h.run.request(cart, D, null);
  h.store.startDelete(A);
  confirmDelete(h, A);
  h.store.startDelete(D);
  confirmDelete(h, D);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.run.show(copy);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  // cart never showed D: it picks its own default, and the list is not read again for D.
  h.run.show(cart);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.host.reread).not.toHaveBeenCalled();
});

test("a conversation started here but not listed yet is cleared when deleted", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  h.run.started(checkout, A, "claude", h.run.revision());
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  confirmDelete(h, A);
  h.answer([]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
});

test("other canvases and conversations keep what they show", () => {
  const h = harness();
  h.run.show(cart);
  h.answer([summary(A), summary(B, { canvas: CART })]);
  const revision = h.run.revision();
  confirmDelete(h, A);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B });
  expect(h.run.revision()).toBe(revision);
});

// A pick from the list read before the delete must not choose it.
test("a canvas that opens before the next list read does not pick the deleted conversation", async () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A), summary(B, { canvas: CART })]);
  h.run.request(cart, B, null);
  confirmDelete(h, B);
  h.run.show(cart);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  await flush();
  expect(doan.readConversation).not.toHaveBeenCalledWith({ conversationId: B });
});

// POSTMORTEM 2026-11-14 'The main window's panel never showed…': the default new state gives way to a conversation
// the person starts, and to a handoff's while its draft is empty; a draft never moves to a handoff's.
for (const prototype of [false, true]) {
  const where = prototype ? "the prototype window" : "the main window";

  test(`${where}: the default new conversation state moves to a conversation the person started elsewhere, with its draft`, () => {
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([]);
    expect(h.run.view()).toMatchObject({ kind: "new" });
    const draft = writing("the total");
    h.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), draft));
    h.answer([summary(A)]);
    expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
    expect(h.store.drafts.get(`conversation:${A}`)).toBe(draft);
  });

  test(`${where}: of two conversations started at once the most recent shows`, () => {
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([]);
    h.answer([summary(A, { lastActivityAt: at(1) }), summary(B, { lastActivityAt: at(3) })]);
    expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  });

  test(`${where}: a handoff's new conversation takes the default state without a draft; with one it moves nothing and takes no draft`, () => {
    const empty = harness({ prototype });
    empty.run.show(checkout);
    empty.answer([]);
    empty.answer([summary(A, { startedBy: "handoff" })]);
    expect(empty.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([]);
    const draft = writing("keep me");
    h.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), draft));
    h.answer([summary(A, { startedBy: "handoff" })]);
    expect(h.run.view()).toMatchObject({ kind: "new" });
    expect(h.store.drafts.get(canvasKey(checkout))).toBe(draft);
    expect(h.store.drafts.has(`conversation:${A}`)).toBe(false);
    h.answer([summary(A, { startedBy: "handoff", lastActivityAt: at(1) }), summary(B, { lastActivityAt: at(2) })]);
    expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  });

  // POSTMORTEM 2026-11-14 'A list read moved the prototype window's first message…': never a draft whose send can be in flight.
  test(`${where}: its draft stays while this panel's own start is in flight`, () => {
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([]);
    const sending = writing("make it blue");
    h.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), sending));
    const done = h.run.startSending(checkout);
    h.answer([summary(A)]);
    expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
    expect(h.store.drafts.get(canvasKey(checkout))).toBe(sending);
    expect(h.store.drafts.get(`conversation:${A}`)).toBeUndefined();
    done();
  });

  test(`${where}: New chosen over an existing conversation stays the new conversation state when another starts`, () => {
    const h = harness({ prototype });
    h.run.show(checkout);
    h.answer([summary(A)]);
    h.run.select(null);
    // An unchanged read between the choice and the change (POSTMORTEM 2026-11-14 recurrence).
    h.answer([summary(A)]);
    const draft = writing("a new idea");
    h.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), draft));
    h.answer([summary(A), summary(B, { lastActivityAt: at(9) })]);
    expect(h.run.view()).toMatchObject({ kind: "new" });
    expect(h.store.drafts.get(canvasKey(checkout))).toBe(draft);
    expect(h.store.drafts.get(`conversation:${B}`)).toBeUndefined();
  });
}

test("the prototype window's host never writes the memory, and reads it like the main window", () => {
  const h = harness({ prototype: true });
  h.state.remembered = B;
  h.run.show(checkout);
  h.run.panel(true);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: B });
  expect(h.host.remember).toBeUndefined();
});

test("an empty new state draft is not carried to a conversation started elsewhere", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([]);
  h.store.setDrafts(drafts => new Map(drafts).set(canvasKey(checkout), { segments: [], preset: null, attachments: [], shape: "box" }));
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
  expect(h.store.drafts.has(`conversation:${A}`)).toBe(false);
});

// In the app the root's list is read before the canvas opens, so the canvas's state has none of its own yet.
test("a canvas opened after its list was read still moves to a conversation started elsewhere", () => {
  const h = harness();
  h.answer([]);
  h.run.show(checkout);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.answer([summary(A)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: A });
});

test("the new state a delete leaves follows only a conversation that appears after it", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { canvas: CART }), summary(B)]);
  confirmDelete(h, B);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.answer([summary(A, { canvas: CART })]);
  expect(h.run.view()).toMatchObject({ kind: "new" });
  h.answer([summary(A, { canvas: CART }), summary(D)]);
  expect(h.run.view()).toMatchObject({ kind: "conversation", conversationId: D });
});

// POSTMORTEM 2026-11-17 'Removing a project or trashing a canvas left state keyed by it behind'.
test("a removed root's canvases keep nothing: added again, a canvas shows its default rather than the earlier choice", () => {
  const h = harness();
  h.run.show(checkout);
  h.answer([summary(A, { lastActivityAt: at(5) }), summary(B, { lastActivityAt: at(1) })]);
  h.run.select(B);
  h.run.show(null);
  h.run.forgetRoots(["/code/other"]);
  h.run.show(checkout);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: B });
  h.run.show(null);
  h.run.forgetRoots([ROOT]);
  h.run.show(checkout);
  expect(h.run.view()).toEqual({ kind: "conversation", conversationId: A });
});

// Move to Trash (canvasRowMenu trashBlock) reads this: main lists a canvas's first conversation only once it accepts it.
test("a start from the panel is in flight for its canvas only, until main answers", () => {
  const h = harness();
  expect(h.run.startingOn(checkout)).toBe(false);
  const first = h.run.startSending(checkout), second = h.run.startSending(checkout);
  expect(h.run.startingOn(checkout)).toBe(true);
  expect(h.run.startingOn({ root: ROOT, canvas: { path: ".doan/canvases/moved.html", id: "checkout" } })).toBe(true);
  expect(h.run.startingOn(cart)).toBe(false);
  expect(h.run.startingOn({ root: "/code/other", canvas: CHECKOUT })).toBe(false);
  first();
  expect(h.run.startingOn(checkout)).toBe(true);
  second();
  expect(h.run.startingOn(checkout)).toBe(false);
});
