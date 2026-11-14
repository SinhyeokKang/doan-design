import { beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../../main/conversation/summary";
import type { Canvas } from "../../main/conversation/types";
import { prototypeConversationScope, prototypeListElsewhere, prototypeListRows, type PlayingCanvas, type ScopedConversation } from "../../main/prototype/conversationScope";
import type { PrototypeView } from "../../main/prototype/ipc";
import { createPrototypeShowing } from "../../main/prototype/showing";
import type { FolderEntry } from "../../main/view";
import { PrototypeConversationRun, type PrototypeConversationCalls } from "./conversationRun";

// The prototype window's host against main's own list scope and showing record, put together the way main's
// conversation handler does. Main's playing canvas moves at once on a play, while the window's view of it can wait
// behind the still capture and arrive coalesced (A, B, A shows as one A), so the two disagree for a while.

const ROOT = "/w/acme";
const A: Canvas = { id: "a", path: ".doan/canvases/a.html" }, B: Canvas = { id: "b", path: ".doan/canvases/b.html" };
const ENTRIES: FolderEntry[] = [{ kind: "list", path: ROOT, servedRev: 0, canvases: [{ ...A, url: "http://x/a" }, { ...B, url: "http://x/b" }] as never }];
const playingOf = (canvas: Canvas): PlayingCanvas => ({ root: ROOT, canvas: { id: canvas.id! }, path: canvas.path });
const summary = (conversationId: string, canvas: Canvas, state: "current" | "archived" = "current"): ConversationSummary => ({
  conversationId, canvas, title: conversationId, state, owner: "doan", provider: "claude", fromHome: false, phase: "ended",
  unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "",
});
const view = (canvas: Canvas, gen: number): PrototypeView => ({
  gen, root: ROOT, path: canvas.path, canvasId: canvas.id!, frame: "f", title: "F", canvas: canvas.id!, phase: "ready", mode: "fit",
  run: { url: `http://x/${canvas.id}`, markWidth: 390, markHeight: 844 }, frames: [{ id: "f", title: "F", size: "390x844", number: 1 }],
  canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: true, width: 280 }, canvasRow: "present",
});
const draft = (text: string) => ({ segments: [{ kind: "text" as const, text }], preset: null, attachments: [], shape: "capsule" as const });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Main's state: what plays, how many times the playing canvas changed, and the root's conversations.
let playing: PlayingCanvas;
let generation: number;
let all: ConversationSummary[];
// Main answers a list from the target and the index as they are when the request arrives; delivery waits for a test.
let replies: { payload: unknown; deliver: () => void }[];
let listChanged: (change: { root: string }) => void;
let showing: ReturnType<typeof createPrototypeShowing>;
let run: PrototypeConversationRun;

function play(canvas: Canvas) { playing = playingOf(canvas); generation++; }
function list(payload: unknown): unknown {
  const indexed: ScopedConversation[] = all.map(c => ({ conversationId: c.conversationId, root: ROOT, ...(c.canvas ? { canvas: c.canvas } : {}) }));
  if (!prototypeConversationScope("list", payload, playing, indexed, ENTRIES)) return { error: prototypeListElsewhere(payload, playing) ? "not_playing" : "bad_request" };
  return prototypeListRows(all, playing, ENTRIES);
}

beforeEach(() => {
  vi.stubGlobal("window", {});
  playing = playingOf(A); generation = 1; all = []; replies = [];
  const on = () => () => {};
  showing = createPrototypeShowing({
    playing: () => playing, generation: () => generation, entries: () => ENTRIES,
    conversations: () => all.map(c => ({ conversationId: c.conversationId, root: ROOT, ...(c.canvas ? { canvas: c.canvas } : {}) })),
  });
  const calls = {
    onConversationEvent: on, onConversationStage: on, onWorkChanged: on, onTargetEntry: on, onComposerSettings: on, onDrawing: on, onPromoted: on,
    onConversationListChanged: (listener: typeof listChanged) => { listChanged = listener; return () => {}; },
    listConversations: (payload: unknown) => {
      const reply = list(payload);
      return new Promise(resolve => replies.push({ payload, deliver: () => resolve(reply) }));
    },
    setShowing: async (conversationId: string | null) => showing.set("prototype", { conversationId }),
    getWork: async () => [], readTargetEntry: async () => null, readComposerSettings: async () => null, readDrawing: async () => null, readPromoted: async () => null,
    readConversation: async ({ conversationId }: { conversationId: string }) => ({ events: [], lastSeq: 0, conversationId }),
    takeConversationDraft: async () => null, markConversationSeen: async () => {},
    conversationResumeTarget: async () => ({ available: false as const, reason: "no_record" as const }), scheduledMessages: async () => [],
    removeAttachment: async () => true, releaseAttachments: async () => true,
  };
  run = new PrototypeConversationRun(calls as unknown as PrototypeConversationCalls, { changed: () => {}, notice: () => {}, focused: () => true });
  run.connect();
});

async function deliver(index: number) { replies[index]!.deliver(); await flush(); }

test("a list read while main already plays another canvas keeps the conversation the window shows and its draft", async () => {
  all = [summary("ca", A), summary("cb", B)];
  run.setView(view(A, 1));
  await deliver(0);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "ca" });
  run.store.setDrafts(drafts => new Map(drafts).set("conversation:ca", draft("keep me")));

  play(B);
  listChanged({ root: ROOT });
  await deliver(1);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "ca" });
  expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "ca" });
  expect(run.store.drafts.get("conversation:ca")).toEqual(draft("keep me"));
  expect(replies[1]!.payload).toEqual({ root: ROOT, canvas: A });

  // The view of what plays now reads that canvas.
  run.setView(view(B, 2));
  expect(replies[2]!.payload).toEqual({ root: ROOT, canvas: B });
  await deliver(2);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "cb" });
  expect(run.store.drafts.get("conversation:ca")).toEqual(draft("keep me"));
});

// While main played B, list changes on A were answered "not_playing": the view of A again reads them, in either order
// of that answer and the view.
test.each(["before", "after"] as const)("list changes answered while main played another canvas are read again with the next view (answer %s the view)", async order => {
  all = [summary("old", A)];
  run.setView(view(A, 1));
  await deliver(0);
  play(B);
  listChanged({ root: ROOT });
  if (order === "before") await deliver(1);
  play(A);
  all = [summary("old", A, "archived"), summary("new", A)];
  run.setView(view(A, 3));
  if (order === "after") await deliver(1);
  expect(replies).toHaveLength(3);
  expect(replies[2]!.payload).toEqual({ root: ROOT, canvas: A });
  await deliver(2);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "new" });
});

test("a read of the canvas from before A, B, A that answers last does not replace the newer list or drop its draft", async () => {
  all = [summary("old", A)];
  run.setView(view(A, 1));
  play(B);
  run.setView(view(B, 2));
  play(A);
  all = [summary("old", A, "archived"), summary("new", A)];
  run.setView(view(A, 3));
  expect(replies).toHaveLength(3);
  await deliver(2);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "new" });
  run.store.setDrafts(drafts => new Map(drafts).set("conversation:new", draft("unsent")));

  await deliver(1);
  await deliver(0);
  expect(run.shown()).toEqual({ kind: "conversation", conversationId: "new" });
  expect(run.store.drafts.get("conversation:new")).toEqual(draft("unsent"));
});

test("the open panel's conversation stays reported to main after A, B, A reached the window as one view of A", async () => {
  all = [summary("ca", A)];
  run.setView(view(A, 1));
  await deliver(0);
  expect(showing.shown()).toBe("ca");

  // Main counted two changes of the playing canvas; the window saw only the last view, of A again.
  play(B);
  play(A);
  run.setView(view(A, 3));
  await flush();
  expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "ca" });
  expect(showing.shown()).toBe("ca");
});
