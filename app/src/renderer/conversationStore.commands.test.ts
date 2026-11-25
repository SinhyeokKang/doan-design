import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import { commandCard, STALE_MODE_CARD } from "./commandView";
import { ConversationStore, type ListView } from "./conversationStore";

// Boundaries come from the read (main rebuilds them from Doan's command turns) and from conversation:boundary;
// both may name one turn. Cards live by draft key for this run only.

const ROOT = "/code/doan", A = "aaaaaaaa-0000-4000-8000-000000000001";
let seq = 0;
const event = (turnId: string, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId, at: "2026-11-17T00:00:00Z", ...payload } as ConversationEvent);
const summary = (extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "T", owner: "doan", provider: "codex", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-17T00:00:00.000Z", preview: "p", ...extra,
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let doan: Record<string, ReturnType<typeof vi.fn>>;
let history: ConversationEvent[];
beforeEach(() => {
  seq = 0;
  history = [event("t1", { type: "user.message", text: "/compact", anchors: [] }), event("t1", { type: "turn.started" }), event("t1", { type: "turn.done" })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "ended", commands: { turns: { t1: "compact" }, boundaries: [{ turnId: "t1", kind: "compacted" }], usageStale: false } })),
    takeConversationDraft: vi.fn(async () => null),
    attachmentsFromPaths: vi.fn(async () => []), recheckAttachments: vi.fn(async () => []), removeAttachment: vi.fn(async () => true),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("crypto", { randomUUID: () => "k" });
});
afterEach(() => vi.unstubAllGlobals());

function harness(list: ListView = [summary()]) {
  const host = { list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() };
  return { store: new ConversationStore(host, window.doan), host };
}

test("a read's boundaries are kept for the thread, restored after a restart", async () => {
  const { store } = harness();
  expect(store.boundaries(A)).toEqual(new Map());
  store.track(A);
  await flush();
  expect(store.boundaries(A)).toEqual(new Map([["t1", "compacted"]]));
});

test("a boundary pushed in this run joins the read's, before or after the read, and redraws", async () => {
  const { store, host } = harness();
  store.boundary({ conversationId: A, turnId: "t0", kind: "cleared" });
  store.track(A);
  await flush();
  host.changed.mockClear();
  store.boundary({ conversationId: A, turnId: "t2", kind: "compacted" });
  expect(store.boundaries(A)).toEqual(new Map([["t0", "cleared"], ["t1", "compacted"], ["t2", "compacted"]]));
  expect(host.changed).toHaveBeenCalled();
  // The same boundary again changes nothing.
  host.changed.mockClear();
  store.boundary({ conversationId: A, turnId: "t2", kind: "compacted" });
  expect(host.changed).not.toHaveBeenCalled();
});

test("a card belongs to its draft key until dismissed or replaced, and redraws", () => {
  const { store, host } = harness();
  const key = `conversation:${A}`;
  expect(store.card(key)).toBeNull();
  const card = commandCard("claude", "model");
  store.showCard(key, card);
  expect(store.card(key)).toBe(card);
  expect(store.card("root:/other")).toBeNull();
  expect(host.changed).toHaveBeenCalled();
  store.showCard(key, STALE_MODE_CARD);
  expect(store.card(key)).toBe(STALE_MODE_CARD);
  store.showCard(key, null);
  expect(store.card(key)).toBeNull();
});

test("a queued /review main returned for the permission mode comes back as the draft with the stale-mode card", async () => {
  doan.takeConversationDraft = vi.fn(async () => ({ text: "/review", anchors: [], attachments: [], reason: "command_mode_stale" }));
  const { store, host } = harness([summary({ returnedDraft: true })]);
  store.takeDraft(ROOT, A);
  await flush();
  const key = `conversation:${A}`;
  expect(store.drafts.get(key)?.segments).toEqual([{ kind: "text", text: "/review" }]);
  // A copy, so the composer says each card that comes back once (DockedComposer's card status).
  expect(store.card(key)).toEqual(STALE_MODE_CARD);
  expect(store.card(key)).not.toBe(STALE_MODE_CARD);
  expect(host.notice).not.toHaveBeenCalled();
});
