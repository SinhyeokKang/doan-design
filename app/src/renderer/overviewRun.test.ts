import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, ConversationEvent, EventPayload } from "../main/conversation/types";
import { EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";

// buzz-project tasks R1, R3, R4: the Overview's main conversation, driven without a DOM. The host stands in for App
// and HomeRun (list reads and their counts, ui-state memory, seen marks, focus, navigation, toasts).

const ROOT = "/code/doan", OTHER = "/code/doan-wt";
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "aaaaaaaa-0000-4000-8000-000000000002", C = "aaaaaaaa-0000-4000-8000-000000000003";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const summary = (conversationId: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId, title: `Title ${conversationId.slice(-1)}`, state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...extra,
});
let seq = 0;
const event = (conversationId: string, payload: EventPayload, turnId = "t1"): ConversationEvent => ({ v: 1, conversationId, seq: ++seq, turnId, at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const ended = (conversationId: string) => [event(conversationId, { type: "user.message", text: "hi", anchors: [] }), event(conversationId, { type: "turn.started" }), event(conversationId, { type: "message.done", messageId: "m", text: "hello" }), event(conversationId, { type: "turn.done" })];
const draft = (text: string): DockedDraft => ({ ...EMPTY_DRAFT, text });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

let doan: Record<string, ReturnType<typeof vi.fn>>;
let histories: Map<string, ConversationEvent[]>;
beforeEach(() => {
  seq = 0; histories = new Map();
  doan = {
    readConversation: vi.fn(async ({ conversationId }: { conversationId: string }) => {
      const events = histories.get(conversationId);
      return events ? { events, lastSeq: events.at(-1)?.seq ?? 0, turn: "idle" } : { error: "not_found" };
    }),
    takeConversationDraft: vi.fn(async () => null),
    attachmentsFromPaths: vi.fn(async () => []),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const lists = new Map<string, ListView>();
  const started = new Map<string, number>(), applied = new Map<string, number>();
  const state = { remembered: {} as Record<string, string> | null, focused: true };
  const host: OverviewRunHost = {
    list: root => lists.get(root) ?? "loading",
    readsStarted: root => started.get(root) ?? 0,
    readsApplied: root => applied.get(root) ?? 0,
    reread: vi.fn(root => { started.set(root, (started.get(root) ?? 0) + 1); }),
    remembered: () => state.remembered,
    remember: vi.fn((root: string, id: string | null) => {
      if (!state.remembered) return;
      const next = { ...state.remembered };
      if (id === null) delete next[root]; else next[root] = id;
      state.remembered = next;
    }),
    markSeen: vi.fn(),
    focused: () => state.focused,
    openCanvas: vi.fn(),
    toast: vi.fn(),
    label: root => root.split("/").at(-1)!,
    changed: vi.fn(),
  };
  const run = new OverviewRun(host);
  // A list read main answered: it started after every earlier one.
  const answer = (root: string, list: ConversationSummary[]) => {
    const n = (started.get(root) ?? 0) + 1;
    started.set(root, n); applied.set(root, n); lists.set(root, list);
    run.sync();
  };
  return { run, host, state, lists, answer };
}

test("nothing is picked until both the list and ui-state are read; then the remembered conversation shows", async () => {
  const h = harness();
  h.state.remembered = null;
  h.run.show(ROOT);
  expect(h.run.view(ROOT)).toEqual({ kind: "wait" });
  histories.set(B, ended(B));
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-10-31T00:00:00.000Z" }), summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "wait" });
  h.state.remembered = { [ROOT]: B };
  h.run.sync();
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  await flush();
  expect(h.run.thread(B)?.read).toBe("ready");
});

test("without a memory the latest project conversation shows; with none at all, a new conversation", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A), summary(B, { lastActivityAt: "2026-10-31T00:00:00.000Z" }), summary(C, { canvas: CANVAS, lastActivityAt: "2026-11-01T00:00:00.000Z" })]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  h.run.show(OTHER);
  h.answer(OTHER, [summary(C, { canvas: CANVAS })]);
  expect(h.run.view(OTHER)).toEqual({ kind: "new", moved: null });
});

test("a remembered conversation that was promoted meanwhile opens a new conversation and is forgotten", () => {
  const h = harness();
  h.state.remembered = { [ROOT]: A };
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { canvas: CANVAS })]);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(h.state.remembered).toEqual({});
});

test("a list read that lands after the person picked never replaces the pick (POSTMORTEM 2026-10-25)", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A), summary(B)]);
  h.run.select(ROOT, B);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-11-01T00:00:00.000Z" }), summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  expect(h.state.remembered).toEqual({ [ROOT]: B });
  // New while the list is still read is the person's choice too.
  h.run.show(OTHER);
  h.run.select(OTHER, null);
  h.answer(OTHER, [summary(C)]);
  expect(h.run.view(OTHER)).toEqual({ kind: "new", moved: null });
});

test("a requested conversation not listed yet is held while the list is read again, then shown", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  h.run.request(ROOT, B, null);
  expect(h.host.reread).toHaveBeenCalledTimes(1);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  h.run.sync();
  expect(h.host.reread).toHaveBeenCalledTimes(1);
  h.answer(ROOT, [summary(A), summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  expect(h.state.remembered).toEqual({ [ROOT]: B });
});

test("a request for a conversation no later read lists falls back to the default (an unknown notification click)", () => {
  const h = harness();
  h.run.show(ROOT);
  h.run.request(ROOT, C, null);
  expect(h.run.view(ROOT)).toEqual({ kind: "wait" });
  h.answer(ROOT, [summary(A)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
});

test("a requested canvas conversation opens its canvas instead of the main thread", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A), summary(B, { canvas: CANVAS })]);
  h.run.request(ROOT, B, "permission");
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, CANVAS);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
});

test("each root keeps its own conversation and new-conversation draft across worktree switches", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  h.run.select(ROOT, null);
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("Ask about checkout")));
  h.run.show(OTHER);
  h.answer(OTHER, [summary(B)]);
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${OTHER}`, draft("Other root")));
  h.run.show(ROOT);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(h.run.drafts.get(`root:${ROOT}`)?.text).toBe("Ask about checkout");
  expect(h.run.view(OTHER)).toEqual({ kind: "conversation", conversationId: B });
  // New again keeps the draft.
  h.run.select(ROOT, null);
  expect(h.run.drafts.get(`root:${ROOT}`)?.text).toBe("Ask about checkout");
});

test("the thread is read after subscribing: an event that arrives before the reply is kept", async () => {
  const h = harness();
  const read = deferred<{ events: ConversationEvent[]; lastSeq: number; turn: string }>();
  doan.readConversation!.mockImplementationOnce(() => read.promise);
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  expect(h.run.thread(A)?.read).toBe("loading");
  const history = [event(A, { type: "user.message", text: "hi", anchors: [] }), event(A, { type: "turn.started" })];
  const live = event(A, { type: "message.delta", messageId: "m", text: "he" });
  h.run.event(live);
  read.resolve({ events: history, lastSeq: 2, turn: "streaming" });
  await flush();
  expect(h.run.thread(A)?.events.map(e => e.seq)).toEqual([1, 2, 3]);
  expect(h.run.thread(A)?.liveAfter).toBe(2);
});

test("an unreadable thread shows its failure and reads again on Retry", async () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  await flush();
  expect(h.run.thread(A)?.read).toBe("error");
  histories.set(A, ended(A));
  h.run.retryThread(A);
  expect(h.run.thread(A)?.read).toBe("loading");
  await flush();
  expect(h.run.thread(A)?.read).toBe("ready");
});

test("the main conversation is seen only while it shows with the window focused, once per turn end", async () => {
  const h = harness();
  histories.set(A, ended(A));
  h.state.focused = false;
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { unseen: true })]);
  await flush();
  // Opening the Overview alone does not mark it (spec decision 11).
  expect(h.host.markSeen).not.toHaveBeenCalled();
  h.state.focused = true;
  h.run.focusChanged();
  expect(h.host.markSeen).toHaveBeenCalledWith(A, 4);
  h.run.focusChanged();
  h.run.sync();
  expect(h.host.markSeen).toHaveBeenCalledTimes(1);
  // A new turn that ends while it shows is marked too, scrolled up or not.
  h.run.event(event(A, { type: "user.message", text: "again", anchors: [] }, "t2"));
  h.run.event(event(A, { type: "turn.started" }, "t2"));
  expect(h.host.markSeen).toHaveBeenCalledTimes(1);
  h.run.event(event(A, { type: "turn.done" }, "t2"));
  expect(h.host.markSeen).toHaveBeenLastCalledWith(A, 7);
  // Hidden: nothing is marked.
  h.run.show(null);
  h.run.event(event(A, { type: "turn.started" }, "t3"));
  h.run.event(event(A, { type: "turn.done" }, "t3"));
  expect(h.host.markSeen).toHaveBeenCalledTimes(2);
});

// spec decision 6, design §2.5: promotion resets the main column and the host owns the seen rule.
function promotedSetup(focused: boolean) {
  const h = harness();
  histories.set(A, ended(A));
  h.state.focused = focused;
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  return h;
}

test("a promotion moves the draft into the new conversation, shows the notice and forgets the memory", async () => {
  const h = promotedSetup(true);
  await flush();
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("한글 조합")));
  h.answer(ROOT, [summary(A, { canvas: CANVAS, title: "Checkout copy" })]);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: { conversationId: A, title: "Checkout copy", canvas: CANVAS } });
  expect(h.run.drafts.get(`root:${ROOT}`)?.text).toBe("한글 조합");
  expect(h.run.drafts.has(`conversation:${A}`)).toBe(false);
  expect(h.state.remembered).toEqual({});
  // Choosing anything clears the notice.
  h.run.select(ROOT, null);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
});

test("a seen turn end is marked through the promotion marker when the list notice comes first", async () => {
  const h = promotedSetup(true);
  await flush();
  expect(h.host.markSeen).toHaveBeenCalledWith(A, 4);
  h.answer(ROOT, [summary(A, { canvas: CANVAS })]);
  expect(h.host.markSeen).toHaveBeenCalledTimes(1);
  const bound = event(A, { type: "conversation.bound", canvas: CANVAS });
  h.run.event(bound);
  expect(h.host.markSeen).toHaveBeenLastCalledWith(A, bound.seq);
});

test("a seen turn end is marked through the promotion marker when the marker event comes first", async () => {
  const h = promotedSetup(true);
  await flush();
  const bound = event(A, { type: "conversation.bound", canvas: CANVAS });
  h.run.event(bound);
  expect(h.host.markSeen).toHaveBeenCalledTimes(1);
  h.answer(ROOT, [summary(A, { canvas: CANVAS })]);
  expect(h.host.markSeen).toHaveBeenLastCalledWith(A, bound.seq);
});

test("an unseen turn end (window unfocused) is not marked at promotion", async () => {
  const h = promotedSetup(false);
  await flush();
  h.run.event(event(A, { type: "conversation.bound", canvas: CANVAS }));
  h.answer(ROOT, [summary(A, { canvas: CANVAS, unseen: true })]);
  expect(h.host.markSeen).not.toHaveBeenCalled();
});

test("a promoted conversation that is already archived still resets and notifies", async () => {
  const h = promotedSetup(true);
  await flush();
  h.answer(ROOT, [summary(A, { canvas: CANVAS, state: "archived" })]);
  expect(h.run.view(ROOT)).toMatchObject({ kind: "new", moved: { conversationId: A } });
});

test("a shown conversation archived without a canvas, or gone, resets without a notice", async () => {
  const h = promotedSetup(true);
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("kept")));
  h.answer(ROOT, []);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(h.run.drafts.get(`root:${ROOT}`)?.text).toBe("kept");
});

test("a just-started conversation the list does not have yet stays shown", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, []);
  h.run.started(ROOT, B);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  h.answer(ROOT, []);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  expect(h.state.remembered).toEqual({ [ROOT]: B });
});

test("another project conversation of the shown root that waits for an answer is toasted once, and Open shows it", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-11-01T00:00:00.000Z" }), summary(B, { phase: "waiting", preview: "Needs your answer: Edit x", provider: "codex" })]);
  expect(h.host.toast).toHaveBeenCalledTimes(1);
  expect(h.host.toast).toHaveBeenCalledWith("Codex needs your answer in doan.", "Open", expect.any(Function));
  h.run.sync();
  expect(h.host.toast).toHaveBeenCalledTimes(1);
  const open = vi.mocked(h.host.toast).mock.calls[0]![2]!;
  open();
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  expect(h.run.takeScroll(B)).toBe("permission");
  expect(h.run.takeScroll(B)).toBeNull();
  // The shown conversation's own request is in its thread, not a toast; nor is a hidden root's.
  h.answer(ROOT, [summary(B, { phase: "waiting", preview: "Needs your answer: Edit y" })]);
  expect(h.host.toast).toHaveBeenCalledTimes(1);
});

test("queued messages stay until a list read started after the queue says none are left", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  h.run.queued(ROOT, A, { id: "q1", text: "also this" });
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "also this" }]);
  h.run.sync();
  expect(h.run.queue(A)).toHaveLength(1);
  h.answer(ROOT, [summary(A, { queued: 0 })]);
  expect(h.run.queue(A)).toEqual([]);
});

test("a removed root takes its state and drafts with it", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("x")));
  h.run.forgetRoots([ROOT]);
  expect(h.run.view(ROOT)).toEqual({ kind: "wait" });
  expect(h.run.drafts.has(`root:${ROOT}`)).toBe(false);
});
