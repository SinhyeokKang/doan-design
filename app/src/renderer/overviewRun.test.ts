import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, ConversationEvent, EventPayload } from "../main/conversation/types";
import { plainText, textSegments } from "./anchorField";
import { EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import { OverviewRun, scrollTarget, type ListView, type OverviewRunHost } from "./overviewRun";

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
const draft = (text: string): DockedDraft => ({ ...EMPTY_DRAFT, segments: textSegments(text) });
const textOf = (value: DockedDraft | undefined) => plainText(value?.segments ?? []);
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
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, CANVAS, B, "permission");
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
});

// Review RM r1 🟡6: reopening an Overview applies spec decision 5 again; only the drafts by root stay.
test("reopening an Overview picks again by decision 5, and each root keeps its new-conversation draft", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  h.run.select(ROOT, null);
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("Ask about checkout")));
  h.run.show(OTHER);
  h.answer(OTHER, []);
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${OTHER}`, draft("Other root")));
  // New cleared the memory, so the latest project conversation shows again.
  h.run.show(ROOT);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("Ask about checkout");
  h.run.select(ROOT, null);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("Ask about checkout");
  // A root that was new on its first visit opens the conversation that appeared since.
  h.answer(OTHER, [summary(C)]);
  h.run.show(OTHER);
  expect(h.run.view(OTHER)).toEqual({ kind: "conversation", conversationId: C });
  expect(textOf(h.run.drafts.get(`root:${OTHER}`))).toBe("Other root");
  // A plain list refresh on the same screen does not pick again.
  h.run.select(OTHER, null);
  h.answer(OTHER, [summary(C, { lastActivityAt: "2026-11-01T00:00:00.000Z" })]);
  expect(h.run.view(OTHER)).toEqual({ kind: "new", moved: null });
});

test("an entry request made while the root was hidden is what its reopened Overview shows", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-11-01T00:00:00.000Z" }), summary(B)]);
  h.run.show(null);
  h.run.request(ROOT, B, null);
  h.run.show(ROOT);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
});

// Review RM r1 🟡1: a start or send reply that lands after the person chose something else changes neither.
test("a late start reply does not replace a newer pick, whichever of the list and the reply comes first", () => {
  for (const listFirst of [true, false]) {
    const h = harness();
    h.run.show(ROOT);
    h.answer(ROOT, [summary(B)]);
    h.run.select(ROOT, null);
    const revision = h.run.revision(ROOT);
    h.run.select(ROOT, B);
    if (listFirst) h.answer(ROOT, [summary(A), summary(B)]);
    h.run.started(ROOT, A, "claude", revision);
    if (!listFirst) h.answer(ROOT, [summary(A), summary(B)]);
    expect(h.run.view(ROOT), `list first: ${listFirst}`).toEqual({ kind: "conversation", conversationId: B });
    expect(h.state.remembered, `list first: ${listFirst}`).toEqual({ [ROOT]: B });
    expect(h.run.providerOf(A)).toBe("claude");
  }
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, []);
  h.run.started(ROOT, A, "claude", h.run.revision(ROOT));
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
});

test("a late send reply does not bring back a conversation the person left for New or another", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A), summary(B)]);
  h.run.select(ROOT, A);
  const revision = h.run.revision(ROOT);
  h.run.select(ROOT, null);
  h.run.sent(ROOT, A, revision);
  expect(h.state.remembered).toEqual({});
  h.run.select(ROOT, B);
  h.run.sent(ROOT, A, revision);
  expect(h.state.remembered).toEqual({ [ROOT]: B });
});

// Review RM r1 🟡2: queued messages main handed back come into the open conversation's draft without a switch.
test("a returned queue is taken into the open conversation's draft once, after what the person typed", async () => {
  const h = harness();
  histories.set(A, ended(A));
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  await flush();
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("typed meanwhile")));
  doan.takeConversationDraft!.mockResolvedValueOnce({ text: "also this", anchors: [], attachments: [], reason: "stopped" });
  h.answer(ROOT, [summary(A, { returnedDraft: true })]);
  h.run.sync();
  await flush(); await flush();
  expect(doan.takeConversationDraft).toHaveBeenCalledTimes(1);
  expect(textOf(h.run.drafts.get(`conversation:${A}`))).toBe("typed meanwhile\n\nalso this");
  // The list still says so until a read that started after the take: no second take.
  h.run.sync();
  await flush();
  expect(doan.takeConversationDraft).toHaveBeenCalledTimes(1);
});

// Review RM r1 🟡3: attachment results follow their chip, wherever the draft went.
test("an attachment checked during a promotion lands in the moved draft, and a removed chip's file is released", async () => {
  const h = harness();
  doan.removeAttachment = vi.fn(async () => true);
  histories.set(A, ended(A));
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  await flush();
  const chip = (key: string) => ({ key, name: `${key}.png`, kind: "image" as const, pasted: false, status: "checking" as const, size: 1 });
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, { ...draft("see"), attachments: [chip("k1"), chip("k2")] }));
  h.answer(ROOT, [summary(A, { canvas: CANVAS })]);
  h.run.setDrafts(drafts => {
    const moved = drafts.get(`root:${ROOT}`)!;
    return new Map(drafts).set(`root:${ROOT}`, { ...moved, attachments: moved.attachments.filter(a => a.key !== "k2") });
  });
  const ok = (id: string) => ({ ok: true as const, attachment: { id, name: `${id}.png`, kind: "image" as const, pasted: false, size: 1, path: `/tmp/${id}.png` } });
  const settled = h.run.settleAttachments(["k1", "k2"], [ok("id1"), ok("id2")]);
  expect(h.run.drafts.get(`root:${ROOT}`)?.attachments).toEqual([{ key: "k1", id: "id1", name: "id1.png", kind: "image", pasted: false, status: "ready", size: 1, path: "/tmp/id1.png" }]);
  expect(doan.removeAttachment).toHaveBeenCalledWith("id2");
  expect(settled.notices).toEqual([]);
  // A refused file leaves the draft with a notice.
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, { ...drafts.get(`root:${ROOT}`)!, attachments: [...drafts.get(`root:${ROOT}`)!.attachments, chip("k3")] }));
  expect(h.run.settleAttachments(["k3"], [{ ok: false, name: "big.png", error: "too_large" }]).notices).toEqual(["This image is over 50 MB, so it wasn’t attached."]);
  expect(h.run.drafts.get(`root:${ROOT}`)?.attachments.map(a => a.key)).toEqual(["k1"]);
});

// Review RM r1 🟡4: Edit and resend restores the last request only into an unchanged draft, and focuses only there.
test("Edit and resend restores the request unless the draft changed or the person moved on meanwhile", async () => {
  const h = harness();
  const message = event(A, { type: "user.message", text: "Draw it", anchors: [], attachments: [{ name: "a.png", size: 1, kind: "image", path: "/tmp/a.png" }] });
  histories.set(A, [message, event(A, { type: "turn.started" }), event(A, { type: "turn.failed", code: "unknown" })]);
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A), summary(B)]);
  await flush();
  const issued = deferred<unknown[]>();
  doan.attachmentsFromPaths!.mockImplementation(() => issued.promise);
  // Unchanged: restored and focused.
  let pending = h.run.editAndResend(ROOT, A);
  issued.resolve([{ ok: true, attachment: { id: "x", name: "a.png", kind: "image", pasted: false, size: 1, path: "/tmp/a.png" } }]);
  expect(await pending).toBe(true);
  expect(textOf(h.run.drafts.get(`conversation:${A}`))).toBe("Draw it");
  // Typing while it is restored: the typing stays.
  const later = deferred<unknown[]>();
  doan.attachmentsFromPaths!.mockImplementation(() => later.promise);
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("")));
  pending = h.run.editAndResend(ROOT, A);
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("new words")));
  later.resolve([]);
  expect(await pending).toBe(false);
  expect(textOf(h.run.drafts.get(`conversation:${A}`))).toBe("new words");
  // Another conversation chosen meanwhile: restored into A's draft, but no focus to take elsewhere.
  const third = deferred<unknown[]>();
  doan.attachmentsFromPaths!.mockImplementation(() => third.promise);
  pending = h.run.editAndResend(ROOT, A);
  h.run.select(ROOT, B);
  third.resolve([]);
  expect(await pending).toBe(false);
  expect(textOf(h.run.drafts.get(`conversation:${A}`))).toBe("Draw it");
});

// Review RM r1 🟡8: an entry for the conversation already open scrolls again; the request waits for its item.
test("each entry request scrolls anew, and the scroll waits until the permission item is drawn", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "waiting" })]);
  h.run.request(ROOT, A, "permission");
  const first = h.run.scrollRequest(A);
  expect(first?.to).toBe("permission");
  h.run.request(ROOT, A, "permission");
  expect(h.run.scrollRequest(A)!.seq).toBeGreaterThan(first!.seq);
  const ask = { kind: "permission" as const, key: "p1", seq: 5, requestId: "r", summary: "s", options: [], status: "pending" as const, answer: null };
  expect(scrollTarget([], true)).toEqual({ kind: "wait" });
  expect(scrollTarget([ask], true)).toEqual({ kind: "item", key: "p1" });
  expect(scrollTarget([{ ...ask, status: "answered" }], false)).toEqual({ kind: "drop" });
  h.run.takeScroll(A);
  expect(h.run.scrollRequest(A)).toBeNull();
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
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("한글 조합");
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

test("a returned draft's chips join the current draft's as chips, so neither side's markers are renumbered", async () => {
  const h = harness();
  histories.set(A, ended(A));
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  await flush();
  const mine = { frame: { id: "payment" } }, theirs = { frame: { id: "shipping" } };
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, { ...EMPTY_DRAFT, segments: [{ kind: "text", text: "Fix " }, { kind: "chip", anchor: mine }] }));
  doan.takeConversationDraft!.mockResolvedValueOnce({ text: "and {{1}}", anchors: [theirs], attachments: [], reason: "stopped" });
  h.answer(ROOT, [summary(A, { returnedDraft: true })]);
  h.run.sync();
  await flush(); await flush();
  expect(h.run.drafts.get(`conversation:${A}`)?.segments).toEqual([{ kind: "text", text: "Fix " }, { kind: "chip", anchor: mine }, { kind: "text", text: "\n\nand " }, { kind: "chip", anchor: theirs }]);
});

test("a shown conversation archived without a canvas, or gone, resets without a notice", async () => {
  const h = promotedSetup(true);
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("kept")));
  h.answer(ROOT, []);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("kept");
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
  expect(h.run.scrollRequest(B)?.to).toBe("permission");
  h.run.takeScroll(B);
  expect(h.run.scrollRequest(B)).toBeNull();
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

// queue-send-now: the row reads Sending… on either screen until main answers; read, it leaves; refused, it stays.
test("Send now marks the queued message sending until main answers, then drops it or puts it back", async () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  h.run.queued(ROOT, A, { id: "q1", text: "first" });
  h.run.queued(ROOT, A, { id: "q2", text: "second" });
  const read = deferred<void>();
  doan.sendQueuedNow = vi.fn(() => read.promise);
  const sent = h.run.store.sendQueuedNow(A, "q2");
  expect(doan.sendQueuedNow).toHaveBeenCalledWith({ conversationId: A, itemId: "q2" });
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "first" }, { id: "q2", text: "second", sending: true }]);
  // A second press while it is in flight does not ask main again.
  expect(await h.run.store.sendQueuedNow(A, "q2")).toEqual({ error: "stale" });
  expect(doan.sendQueuedNow).toHaveBeenCalledTimes(1);
  read.resolve();
  expect(await sent).toBeUndefined();
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "first" }]);

  doan.sendQueuedNow = vi.fn(async () => ({ error: "not_running" }));
  expect(await h.run.store.sendQueuedNow(A, "q1")).toEqual({ error: "not_running" });
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "first" }]);
  // A call that throws reads as a refusal: the row stays queued.
  doan.sendQueuedNow = vi.fn(async () => { throw new Error("gone"); });
  expect(await h.run.store.sendQueuedNow(A, "q1")).toEqual({ error: "unknown" });
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "first" }]);
});

// Main's list count leaves out the message Send now put in flight, so a read saying none are queued keeps it; only
// main's answer to Send now settles it.
test("a list read with nothing queued keeps the row Send now is sending and drops the rest", async () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { phase: "running", working: true })]);
  h.run.queued(ROOT, A, { id: "q1", text: "first" });
  const read = deferred<void>();
  doan.sendQueuedNow = vi.fn(() => read.promise);
  const sent = h.run.store.sendQueuedNow(A, "q1");
  h.answer(ROOT, [summary(A, { phase: "running", working: true, queued: 0 })]);
  expect(h.run.queue(A)).toEqual([{ id: "q1", text: "first", sending: true }]);
  read.resolve();
  await sent;
  expect(h.run.queue(A)).toEqual([]);

  h.run.queued(ROOT, A, { id: "q2", text: "second" });
  h.run.queued(ROOT, A, { id: "q3", text: "third" });
  const refused = deferred<{ error: string }>();
  doan.sendQueuedNow = vi.fn(() => refused.promise);
  const again = h.run.store.sendQueuedNow(A, "q2");
  h.answer(ROOT, [summary(A, { phase: "running", working: true, queued: 0 })]);
  expect(h.run.queue(A)).toEqual([{ id: "q2", text: "second", sending: true }]);
  // Refused, it is queued again in main; the row says so until a read reports otherwise.
  refused.resolve({ error: "not_running" });
  expect(await again).toEqual({ error: "not_running" });
  expect(h.run.queue(A)).toEqual([{ id: "q2", text: "second" }]);
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

// Review RM r2 🟡1: an entry request still waiting for the list is a newer choice than a start or send sent before it.
test("a late start or send reply does not cancel an entry request still waiting for the list, in either order", () => {
  for (const replyFirst of [true, false]) {
    const h = harness();
    h.run.show(ROOT);
    h.answer(ROOT, []);
    const revision = h.run.revision(ROOT);
    h.run.request(ROOT, C, null);
    if (replyFirst) { h.run.started(ROOT, B, "claude", revision); h.answer(ROOT, [summary(B), summary(C)]); }
    else { h.answer(ROOT, [summary(B), summary(C)]); h.run.started(ROOT, B, "claude", revision); }
    expect(h.run.view(ROOT), `reply first: ${replyFirst}`).toEqual({ kind: "conversation", conversationId: C });
    expect(h.state.remembered, `reply first: ${replyFirst}`).toEqual({ [ROOT]: C });
  }
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  const revision = h.run.revision(ROOT);
  h.run.request(ROOT, C, null);
  h.run.sent(ROOT, A, revision);
  h.answer(ROOT, [summary(A), summary(C)]);
  expect(h.state.remembered).toEqual({ [ROOT]: C });
});

// Review RM r2 🟡3: what the list did while the Overview was away is no choice; reopening picks by decision 5.
test("reopening after the shown conversation left the list while away picks the latest project conversation", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-11-01T00:00:00.000Z" }), summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("kept")));
  h.run.show(null);
  h.answer(ROOT, [summary(B)]);
  h.run.show(ROOT);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("kept");
});

// Review RM r2 ⚪1: a discarded Edit and resend restore gives back the files it was issued.
test("an Edit and resend restore dropped for newer typing releases its issued attachments", async () => {
  const h = harness();
  doan.removeAttachment = vi.fn(async () => true);
  const message = event(A, { type: "user.message", text: "Draw it", anchors: [], attachments: [{ name: "a.png", size: 1, kind: "image", path: "/tmp/a.png" }] });
  histories.set(A, [message, event(A, { type: "turn.started" }), event(A, { type: "turn.failed", code: "unknown" })]);
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  await flush();
  const issued = deferred<unknown[]>();
  doan.attachmentsFromPaths!.mockImplementation(() => issued.promise);
  const pending = h.run.editAndResend(ROOT, A);
  h.run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft("newer")));
  issued.resolve([{ ok: true, attachment: { id: "issued-1", name: "a.png", kind: "image", pasted: false, size: 1, path: "/tmp/a.png" } }]);
  expect(await pending).toBe(false);
  expect(doan.removeAttachment).toHaveBeenCalledWith("issued-1");
  expect(textOf(h.run.drafts.get(`conversation:${A}`))).toBe("newer");
});

// conversation-delete tasks T3, design §3.2: the state after a conversation is deleted. App marks the conversation
// deleting before conversation:delete, then on success calls each run's deleted and the store's.
function deleteShown() {
  const h = harness();
  histories.set(A, ended(A));
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-10-31T00:00:00.000Z" }), summary(B)]);
  return h;
}
const confirmDelete = (h: ReturnType<typeof harness>, id: string) => { h.run.deleted(id); h.run.store.deleted(id); };

test("deleting the shown conversation shows the new conversation state, keeps the new conversation's draft and forgets the memory", async () => {
  const h = deleteShown();
  await flush();
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  expect(h.state.remembered).toEqual({ [ROOT]: A });
  h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("separate new words")).set(`conversation:${A}`, draft("unsent")));
  const revision = h.run.revision(ROOT);
  h.run.store.startDelete(A);
  confirmDelete(h, A);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(h.run.revision(ROOT)).toBeGreaterThan(revision);
  expect(h.state.remembered).toEqual({});
  // Spec decision 5: the deleted conversation's draft goes; the new conversation's stays as it was.
  expect(h.run.drafts.has(`conversation:${A}`)).toBe(false);
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("separate new words");
  expect(h.run.thread(A)).toBeNull();
  expect(h.run.store.deleting(A)).toBe(false);
  // The list without it changes nothing more.
  h.answer(ROOT, [summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  expect(textOf(h.run.drafts.get(`root:${ROOT}`))).toBe("separate new words");
});

test("a list that drops the conversation before the delete reply moves no draft, in either order", () => {
  for (const listFirst of [true, false]) {
    const h = deleteShown();
    h.run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, draft("separate new words")).set(`conversation:${A}`, draft("unsent")));
    h.run.store.startDelete(A);
    if (listFirst) {
      h.answer(ROOT, [summary(B)]);
      // Held while the delete is pending: it is not read as gone.
      expect(h.run.view(ROOT), `list first: ${listFirst}`).toEqual({ kind: "conversation", conversationId: A });
    }
    confirmDelete(h, A);
    if (!listFirst) h.answer(ROOT, [summary(B)]);
    expect(h.run.view(ROOT), `list first: ${listFirst}`).toEqual({ kind: "new", moved: null });
    expect(textOf(h.run.drafts.get(`root:${ROOT}`)), `list first: ${listFirst}`).toBe("separate new words");
    expect(h.run.drafts.has(`conversation:${A}`), `list first: ${listFirst}`).toBe(false);
  }
});

test("a refused delete releases the mark and leaves what shows", () => {
  const h = deleteShown();
  h.run.store.startDelete(A);
  expect(h.run.store.deleting(A)).toBe(true);
  h.run.store.cancelDelete(A);
  expect(h.run.store.deleting(A)).toBe(false);
  h.answer(ROOT, [summary(A, { lastActivityAt: "2026-10-31T00:00:00.000Z" }), summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
});

test("a start or send reply sent before the delete does not replace the new conversation state", () => {
  const h = deleteShown();
  const revision = h.run.revision(ROOT);
  confirmDelete(h, A);
  h.run.sent(ROOT, A, revision);
  expect(h.state.remembered).toEqual({});
  h.run.started(ROOT, C, "claude", revision);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
});

test("a deleted conversation an entry asked for is dropped, so the list is not read again for it", () => {
  const h = harness();
  h.run.show(ROOT);
  // Asked for while the first read is in flight: the request waits for the list.
  h.host.reread(ROOT);
  h.run.request(ROOT, A, null);
  confirmDelete(h, A);
  // That read, started before the request, answers without it.
  h.lists.set(ROOT, [summary(B)]);
  vi.spyOn(h.host, "readsApplied").mockReturnValue(h.host.readsStarted(ROOT));
  h.run.sync();
  expect(h.host.reread).toHaveBeenCalledTimes(1);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
});

test("the memory of a root not on screen is forgotten too, and other roots keep what they show", () => {
  const h = harness();
  h.run.show(OTHER);
  h.answer(OTHER, [summary(C)]);
  h.state.remembered = { [ROOT]: A, [OTHER]: C };
  const revision = h.run.revision(OTHER);
  confirmDelete(h, A);
  expect(h.state.remembered).toEqual({ [OTHER]: C });
  expect(h.run.view(OTHER)).toEqual({ kind: "conversation", conversationId: C });
  expect(h.run.revision(OTHER)).toBe(revision);
  // The root picks without it later.
  h.run.show(ROOT);
  h.answer(ROOT, [summary(B)]);
  expect(h.run.view(ROOT)).toEqual({ kind: "conversation", conversationId: B });
});

test("the moved line of a deleted promoted conversation goes", async () => {
  const h = promotedSetup(true);
  await flush();
  h.answer(ROOT, [summary(A, { canvas: CANVAS, title: "Checkout copy" })]);
  expect(h.run.view(ROOT)).toMatchObject({ kind: "new", moved: { conversationId: A } });
  confirmDelete(h, A);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
  h.answer(ROOT, []);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
});

test("deleting the last conversation leaves the new conversation state", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A)]);
  confirmDelete(h, A);
  h.answer(ROOT, []);
  expect(h.run.view(ROOT)).toEqual({ kind: "new", moved: null });
});

test("the store drops the deleted conversation's thread, queue and late events, and ignores its events afterwards", async () => {
  const h = deleteShown();
  await flush();
  h.run.queued(ROOT, A, { id: "q1", text: "next" });
  confirmDelete(h, A);
  expect(h.run.queue(A)).toEqual([]);
  expect(h.run.thread(A)).toBeNull();
  h.run.event(event(A, { type: "turn.done" }));
  expect(h.run.thread(A)).toBeNull();
});

test("events buffered for a deleted conversation nothing tracked are dropped, and later ones are not buffered", () => {
  const h = harness();
  h.run.show(ROOT);
  h.answer(ROOT, [summary(B)]);
  // An event for a conversation nothing tracks waits for a read; the deleted one's must not.
  h.run.event(event(C, { type: "turn.started" }));
  h.run.event(event(A, { type: "turn.started" }));
  confirmDelete(h, A);
  h.run.event(event(A, { type: "turn.done" }));
  // Whatever reads it again finds none of its events buffered.
  h.run.store.track(A);
  expect(h.run.thread(A)?.events).toEqual([]);
  h.run.store.track(C);
  expect(h.run.thread(C)?.events.map(e => e.type)).toEqual(["turn.started"]);
});

test("a returned draft whose take was in flight is not put back after the delete", async () => {
  const h = harness();
  const take = deferred<unknown>();
  doan.takeConversationDraft!.mockImplementationOnce(() => take.promise);
  histories.set(A, ended(A));
  h.run.show(ROOT);
  h.answer(ROOT, [summary(A, { returnedDraft: true })]);
  await flush();
  expect(doan.takeConversationDraft).toHaveBeenCalledWith({ conversationId: A });
  confirmDelete(h, A);
  take.resolve({ text: "queued words", anchors: [], attachments: [], reason: "stopped" });
  await flush(); await flush();
  expect(h.run.drafts.has(`conversation:${A}`)).toBe(false);
});
