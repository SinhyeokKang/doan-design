import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../../main/conversation/summary";
import type { ConversationEvent } from "../../main/conversation/types";
import type { PrototypeView } from "../../main/prototype/ipc";
import type { FolderEntry } from "../../main/view";
import { PrototypeConversationRun, type PrototypeConversationCalls } from "./conversationRun";

// The prototype window's conversation host without a DOM: which conversation shows, its list reads by the playing
// canvas, the store's subscriptions, drafts, seen marks and what main hears of the panel. Its own store makes its
// drafts and attachment chips its own; the page has no `window.doan`.

const ROOT = "/w/acme", TWIN = "/w/acme-feature";
const CHECKOUT = { path: ".doan/canvases/checkout.html", id: "checkout" };
const PLAIN = { path: ".doan/canvases/plain.html" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, root: ROOT, path: CHECKOUT.path, canvasId: "checkout", frame: "pay", title: "Pay", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://x/a.html", markWidth: 390, markHeight: 844 }, frames: [{ id: "pay", title: "Pay", size: "390x844", number: 1 }],
  gotos: [], canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: true, width: 280 }, canvasRow: "present", ...over,
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

type Listener<T> = (value: T) => void;
let calls: Record<string, ReturnType<typeof vi.fn>>;
let order: string[];
let listChanged: Listener<{ root: string }> | null;
let event: Listener<ConversationEvent> | null;
let lists: Map<string, (reply: ConversationSummary[] | { error: string }) => void>;
let focused: boolean;
let run: PrototypeConversationRun;

beforeEach(() => {
  vi.stubGlobal("window", {});
  order = []; listChanged = null; event = null; lists = new Map(); focused = true;
  const on = (name: string, keep?: (listener: never) => void) => vi.fn((listener: never) => { order.push(`on:${name}`); keep?.(listener); return () => {}; });
  calls = {
    onConversationEvent: on("event", listener => { event = listener; }),
    onConversationStage: on("stage"), onConversationBoundary: on("boundary"),
    onConversationListChanged: on("listChanged", listener => { listChanged = listener; }),
    onWorkChanged: on("work"), onTargetEntry: on("entry"), onComposerSettings: on("settings"), onAgentAuth: on("auth"), onWindowVisible: on("visible"),
    listConversations: vi.fn(({ root }: { root: string }) => { order.push(`list:${root}`); return new Promise(resolve => lists.set(root, resolve)); }),
    getWork: vi.fn(async () => { order.push("getWork"); return []; }),
    readTargetEntry: vi.fn(async () => { order.push("entry"); return null; }),
    readComposerSettings: vi.fn(async () => { order.push("settings"); return { home: null, newConversation: null, buddy: "doany" as const }; }),
    readConversation: vi.fn(async ({ conversationId }: { conversationId: string }) => ({ events: [], lastSeq: 0, conversationId })),
    takeConversationDraft: vi.fn(async () => ({ text: "Returned", anchors: [], attachments: [], ids: [] })),
    markConversationSeen: vi.fn(async () => {}), setShowing: vi.fn(async () => {}), reveal: vi.fn(async () => {}), rememberChoice: vi.fn(async () => {}),
    conversationResumeTarget: vi.fn(async () => ({ available: false as const, reason: "no_record" as const })),
    scheduledMessages: vi.fn(async () => []), sendQueuedNow: vi.fn(), removeAttachment: vi.fn(async () => true), releaseAttachments: vi.fn(async () => true),
    recheckAttachments: vi.fn(), attachmentsFromPaths: vi.fn(),
    // The body's sends: pending until a test answers them.
    startConversation: vi.fn(() => new Promise(() => {})), sendConversation: vi.fn(() => new Promise(() => {})), queueConversation: vi.fn(() => new Promise(() => {})),
    rememberedConversation: vi.fn(async () => null),
  };
  run = new PrototypeConversationRun(calls as unknown as PrototypeConversationCalls, { changed: () => {}, notice: () => {}, focused: () => focused });
});
afterEach(() => vi.unstubAllGlobals());

// One read per call, answered by the root it was asked for.
async function answer(root: string, list: ConversationSummary[] | { error: string }) {
  const resolve = lists.get(root)!;
  lists.delete(root);
  resolve(list);
  await flush();
}
async function playing(over: Partial<PrototypeView> = {}, list: ConversationSummary[] = [summary({})]) {
  run.connect();
  run.setView(view(over));
  await answer(over.root ?? ROOT, list);
}

describe("subscribe first, then read", () => {
  test("events, list changes and terminal work are subscribed before the first list read", () => {
    run.connect();
    run.setView(view());
    const first = order.indexOf(`list:${ROOT}`);
    expect(first).toBeGreaterThan(-1);
    for (const name of ["on:event", "on:stage", "on:listChanged", "on:work", "on:entry", "on:settings"]) expect(order.indexOf(name), name).toBeLessThan(first);
    expect(order.indexOf("on:work")).toBeLessThan(order.indexOf("getWork"));
    expect(order.indexOf("on:entry")).toBeLessThan(order.indexOf("entry"));
  });

  test("a switch to another canvas reads that canvas's list, still under the same subscriptions", async () => {
    await playing();
    const subscriptions = calls.onConversationEvent!.mock.calls.length;
    const { canvasId: _none, ...plain } = view({ path: PLAIN.path, frame: "x", frames: [] });
    run.setView(plain);
    expect(order.at(-1)).toBe(`list:${ROOT}`);
    expect(calls.onConversationEvent!.mock.calls.length).toBe(subscriptions);
    expect(run.list()).toBe("loading");
  });

  test("an event that came before the read is merged by seq", async () => {
    run.connect();
    run.setView(view());
    event!({ conversationId: "c1", seq: 3, type: "user.message", text: "hi", anchors: [], at: "2026-11-01T12:00:00.000Z" } as never);
    await answer(ROOT, [summary({})]);
    expect(run.store.thread("c1")?.events.map(e => e.seq)).toEqual([3]);
  });
});

describe("the conversation the panel shows", () => {
  test("a canvas without conversations is the new conversation state", async () => {
    await playing({}, []);
    expect(run.shown()).toEqual({ kind: "new" });
    expect(run.run.view()?.kind).toBe("new");
  });

  // Spec: the prototype window may show another conversation than the main window, so a conversation started
  // elsewhere on the canvas never moves it, and the draft written here stays with the conversation it was written for.
  test("a conversation started elsewhere never moves this window off the one it shows; its draft stays", async () => {
    await playing({}, [summary({ conversationId: "old" })]);
    const mine = { segments: [{ kind: "text" as const, text: "This button" }], preset: null, attachments: [], shape: "capsule" as const };
    run.store.setDrafts(drafts => new Map(drafts).set("conversation:old", mine));
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "next", lastActivityAt: "2026-11-01T12:05:00.000Z" }), summary({ conversationId: "old" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "old" });
    expect(run.store.drafts.get("conversation:old")).toBe(mine);
    expect(run.store.drafts.get("conversation:next")).toBeUndefined();
  });

  test("the conversation picked in this window stays across list reads, beside others that work", async () => {
    await playing({}, [summary({ conversationId: "next", phase: "running", working: true }), summary({ conversationId: "old" })]);
    run.run.select("old");
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "next", phase: "running", working: true }), summary({ conversationId: "old" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "old" });
    run.run.select(null);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "next", phase: "running", working: true }), summary({ conversationId: "old" }), summary({ conversationId: "third" })]);
    expect(run.shown()).toEqual({ kind: "new" });
  });

  // The draft of the new conversation state may be the message this window is sending: a list naming the conversation
  // its start made can come before the start's reply, and that draft must not move into the conversation.
  test("from the new conversation state nothing else chose, a conversation this window started shows; a draft whose start is in flight stays", async () => {
    await playing({}, []);
    const key = run.run.composerKey()!;
    const sending = { segments: [{ kind: "text" as const, text: "This button does nothing" }], preset: null, attachments: [], shape: "capsule" as const };
    run.store.setDrafts(drafts => new Map(drafts).set(key, sending));
    void run.bodyCalls.startConversation({ root: ROOT, mode: "new", runtime: "claude", canvas: CHECKOUT, text: "This button does nothing" });
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "started" })]);
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "started" });
    expect(run.store.drafts.get(key)).toBe(sending);
    expect(run.store.drafts.get("conversation:started")).toBeUndefined();
  });

  // A conversation the person started in the main window while this window wrote in its own new conversation state
  // takes the draft along (user decision), when it has none of its own.
  test("from the new conversation state with no start in flight, the draft follows the new conversation", async () => {
    await playing({}, []);
    const key = run.run.composerKey()!;
    const writing = { segments: [{ kind: "text" as const, text: "The total is wrong" }], preset: null, attachments: [], shape: "capsule" as const };
    run.store.setDrafts(drafts => new Map(drafts).set(key, writing));
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "from-main" })]);
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "from-main" });
    expect(run.store.drafts.get("conversation:from-main")).toBe(writing);
  });

  // The canvas run's rules, the main window's: a handoff's conversation takes this window's automatic new conversation
  // state only while its draft is empty (PRODUCT §5 item 2 'Handoff').
  test("from its own new conversation state, a handoff's conversation shows unless a draft is there", async () => {
    await playing({}, []);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "by-handoff", startedBy: "handoff" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "by-handoff" });
  });

  test("the first pick: a conversation waiting for an answer, else the most recent", async () => {
    await playing({}, [summary({ conversationId: "recent", lastActivityAt: "2026-11-01T12:09:00.000Z" }), summary({ conversationId: "asks", phase: "waiting", lastActivityAt: "2026-11-01T12:01:00.000Z" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "asks" });
  });

  test("a conversation the main window deleted goes through the store's deleted path, and its draft moves nowhere", async () => {
    await playing({}, [summary({ conversationId: "gone" })]);
    run.store.setDrafts(drafts => new Map(drafts).set("conversation:gone", { segments: [{ kind: "text", text: "lost" }], preset: null, attachments: [], shape: "capsule" }));
    const deleted = vi.spyOn(run.store, "deleted");
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "fresh" })]);
    expect(deleted).toHaveBeenCalledWith("gone");
    expect(run.store.drafts.get("conversation:gone")).toBeUndefined();
    expect(run.store.drafts.get("conversation:fresh")).toBeUndefined();
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "fresh" });
  });

  test("a returned queue comes into this window's draft when this window shows the conversation", async () => {
    await playing({}, [summary({ conversationId: "c1", returnedDraft: true })]);
    await flush();
    expect(calls.takeConversationDraft).toHaveBeenCalledWith({ conversationId: "c1" });
    expect(run.store.drafts.get("conversation:c1")?.segments).toEqual([{ kind: "text", text: "Returned" }]);
  });

  // The prototype window takes a returned queue on its own path (its own store), so the list comes back as sent here too.
  test("a returned list comes into this window's draft with its markers and depth spaces", async () => {
    calls.takeConversationDraft!.mockResolvedValueOnce({ text: "- Hero\n  - shorter\n1. Footer", anchors: [], attachments: [], ids: [] });
    await playing({}, [summary({ conversationId: "c1", returnedDraft: true })]);
    await flush();
    expect(run.store.drafts.get("conversation:c1")?.segments).toEqual([{ kind: "text", text: "- Hero\n  - shorter\n1. Footer" }]);
  });

  // A returned queue goes to the window the person looks at: this one only while its panel is open (user decision);
  // folded, the main window's store takes it.
  test("a returned queue is not taken while the panel is folded; opening the panel takes it", async () => {
    await playing({ panel: { open: false, width: null } }, [summary({ conversationId: "c1", returnedDraft: true })]);
    await flush();
    expect(calls.takeConversationDraft).not.toHaveBeenCalled();
    run.setView(view({ panel: { open: true, width: 280 } }));
    await flush();
    expect(calls.takeConversationDraft).toHaveBeenCalledWith({ conversationId: "c1" });
  });

  test("a canvas row read again while the folder reloads reads the list again once it is back", async () => {
    await playing();
    const before = calls.listConversations!.mock.calls.length;
    run.setView(view({ canvasRow: "loading" }));
    listChanged!({ root: ROOT });
    run.setView(view({ canvasRow: "present" }));
    expect(calls.listConversations!.mock.calls.length).toBe(before + 1);
  });

  test("a failed read is the list error, and Retry reads again", async () => {
    await playing({}, { error: "unknown" } as never);
    expect(run.shown()).toEqual({ kind: "list_error" });
    run.retry();
    expect(order.filter(entry => entry === `list:${ROOT}`)).toHaveLength(2);
  });

  test("a canvas gone or sharing its ID is blocked; a row still read is not read yet", async () => {
    run.connect();
    run.setView(view({ canvasRow: "loading" }));
    expect(calls.listConversations).not.toHaveBeenCalled();
    expect(run.shown()).toEqual({ kind: "list_loading" });
    run.setView(view({ canvasRow: "gone" }));
    expect(run.shown()).toEqual({ kind: "blocked", reason: "gone" });
    run.setView(view({ canvasRow: "duplicate" }));
    expect(run.shown()).toEqual({ kind: "blocked", reason: "duplicate" });
  });

  test("a frame unavailable still shows the canvas's conversation", async () => {
    await playing({ phase: "frame-unavailable" });
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "c1" });
  });
});

// The conversation last seen on the playing canvas on this device: main reads it from ui-state for the canvas this
// window plays (the main window is ui-state's only writer). Until the read settles the first pick waits; a failed read
// counts as none; a read for a canvas left behind never answers for the next one.
describe("the remembered conversation", () => {
  const two = [summary({ conversationId: "recent", lastActivityAt: "2026-11-01T12:09:00.000Z" }), summary({ conversationId: "seen", lastActivityAt: "2026-11-01T12:01:00.000Z" })];
  function pendingReads() {
    const reads: { resolve(id: string | null): void; reject(error: unknown): void }[] = [];
    calls.rememberedConversation = vi.fn(() => new Promise<string | null>((resolve, reject) => reads.push({ resolve, reject })));
    return reads;
  }

  test("the first pick waits for it, then shows it", async () => {
    const reads = pendingReads();
    await playing({}, two);
    expect(calls.rememberedConversation).toHaveBeenCalledOnce();
    expect(run.shown()).toEqual({ kind: "list_loading" });
    reads[0]!.resolve("seen");
    await flush();
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "seen" });
  });

  test("none remembered: the most recent", async () => {
    const reads = pendingReads();
    await playing({}, two);
    reads[0]!.resolve(null);
    await flush();
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "recent" });
  });

  test("a failed read counts as none", async () => {
    const reads = pendingReads();
    await playing({}, two);
    reads[0]!.reject(new Error("gone away"));
    await flush();
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "recent" });
  });

  test("read once per played canvas: another view of the same canvas reads nothing again", async () => {
    await playing({}, two);
    run.setView(view({ gen: 2, frame: "cart" }));
    expect(calls.rememberedConversation).toHaveBeenCalledOnce();
  });

  test("a switch of canvas reads again, and the answer for the canvas left behind is never used", async () => {
    const reads = pendingReads();
    run.connect();
    run.setView(view());
    const { canvasId: _none, ...plain } = view({ path: PLAIN.path, frame: "x", frames: [] });
    run.setView(plain);
    expect(calls.rememberedConversation).toHaveBeenCalledTimes(2);
    const onPlain = [summary({ conversationId: "older", canvas: PLAIN, lastActivityAt: "2026-11-01T12:01:00.000Z" }), summary({ conversationId: "newer", canvas: PLAIN, lastActivityAt: "2026-11-01T12:09:00.000Z" })];
    // The read of the first canvas answers late, naming a conversation the new canvas also lists.
    reads[0]!.resolve("older");
    await answer(ROOT, onPlain);
    expect(run.shown()).toEqual({ kind: "list_loading" });
    reads[1]!.resolve(null);
    await flush();
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "newer" });
  });
});

// Spec: the head menu's Delete in this window. The store marks the conversation as being deleted before main is asked,
// and the mark ends exactly once, as the main window's Delete does.
describe("Delete from this window", () => {
  test("asks main, then the store and the canvas run drop it and the panel picks again", async () => {
    calls.deleteConversation = vi.fn(async () => undefined);
    await playing({}, [summary({ conversationId: "gone" }), summary({ conversationId: "left", lastActivityAt: "2026-11-01T11:00:00.000Z" })]);
    run.run.select("gone");
    const deleted = vi.spyOn(run.store, "deleted");
    const asked = run.deleteConversation("gone");
    expect(run.store.deleting("gone")).toBe(true);
    await expect(asked).resolves.toBeNull();
    expect(calls.deleteConversation).toHaveBeenCalledExactlyOnceWith({ conversationId: "gone" });
    expect(deleted).toHaveBeenCalledWith("gone");
    expect(run.store.deleting("gone")).toBe(false);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "left" });
  });

  test("main's not_found counts as deleted", async () => {
    calls.deleteConversation = vi.fn(async () => ({ error: "not_found" }));
    await playing({}, [summary({ conversationId: "gone" })]);
    await expect(run.deleteConversation("gone")).resolves.toBe("not_found");
    expect(run.store.deleting("gone")).toBe(false);
    expect(run.run.view()).not.toMatchObject({ conversationId: "gone" });
  });

  test.each([
    ["a refusal", async () => ({ error: "busy" }), "busy"],
    ["a failed call", async () => { throw new Error("gone away"); }, "unknown"],
  ])("%s ends the mark and keeps the conversation shown", async (_name, reply, code) => {
    calls.deleteConversation = vi.fn(reply);
    await playing({}, [summary({ conversationId: "kept" })]);
    await expect(run.deleteConversation("kept")).resolves.toBe(code);
    expect(run.store.deleting("kept")).toBe(false);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "kept" });
  });
});

// The panel head's title: the main window's canvasConversationTitle for the conversation shown; the states the panel
// had no head for (the list still read, the canvas gone or its ID shared) keep the shell's "Conversation"; a list never
// read is the new conversation state and reads "New conversation", as in the main window.
describe("the panel head's title", () => {
  test("the list's summary title of the conversation shown", async () => {
    await playing({}, [summary({ title: "Checkout Review details button" })]);
    expect(run.headTitle()).toBe("Checkout Review details button");
  });

  test("before a list names it, the first message's line", async () => {
    run.connect();
    run.setView(view());
    event!({ conversationId: "c1", seq: 1, type: "user.message", text: "Make the pay button larger", anchors: [], at: "2026-11-01T12:00:00.000Z" } as never);
    await answer(ROOT, [summary({ title: "" })]);
    expect(run.headTitle()).toBe("Make the pay button larger");
  });

  test("an empty title with no message read yet is Conversation", async () => {
    await playing({}, [summary({ title: "" })]);
    expect(run.headTitle()).toBe("Conversation");
  });

  test("the new conversation state is New conversation", async () => {
    await playing({}, []);
    expect(run.headTitle()).toBe("New conversation");
  });

  test("before any view and while the list is read, Conversation; after the first read failed, New conversation", async () => {
    expect(run.headTitle()).toBe("Conversation");
    run.connect();
    run.setView(view());
    expect(run.headTitle()).toBe("Conversation");
    await answer(ROOT, { error: "unknown" } as never);
    expect(run.headTitle()).toBe("New conversation");
  });

  test("a canvas gone or sharing its ID while open turns the title to Conversation", async () => {
    await playing({}, [summary({ title: "Ideas" })]);
    expect(run.headTitle()).toBe("Ideas");
    run.setView(view({ canvasRow: "gone" }));
    expect(run.headTitle()).toBe("Conversation");
    run.setView(view({ canvasRow: "duplicate" }));
    expect(run.headTitle()).toBe("Conversation");
  });
});

// POSTMORTEM 2026-11-01: two worktrees share a canvas id and path.
describe("the playing root owns its list", () => {
  test("a late read for the root left behind never applies to the other worktree's canvas", async () => {
    run.connect();
    run.setView(view());
    run.setView(view({ root: TWIN }));
    await answer(ROOT, [summary({ conversationId: "from-acme" })]);
    expect(run.list()).toBe("loading");
    expect(run.shown()).toEqual({ kind: "list_loading" });
    await answer(TWIN, [summary({ conversationId: "from-twin" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "from-twin" });
  });

  test("a list change of the other root does not read this one", async () => {
    await playing();
    const before = calls.listConversations!.mock.calls.length;
    listChanged!({ root: TWIN });
    expect(calls.listConversations!.mock.calls.length).toBe(before);
  });

  test("the root's folder entry is read again when the root changes", async () => {
    await playing();
    const before = calls.readTargetEntry!.mock.calls.length;
    run.setView(view({ frame: "other" }));
    expect(calls.readTargetEntry!.mock.calls.length).toBe(before);
    run.setView(view({ root: TWIN }));
    expect(calls.readTargetEntry!.mock.calls.length).toBe(before + 1);
  });

  test("an entry read for the root left behind is dropped", async () => {
    let first!: (entry: FolderEntry | null) => void;
    calls.readTargetEntry!.mockImplementationOnce(() => new Promise(resolve => { first = resolve; }));
    run.connect();
    run.setView(view());
    run.setView(view({ root: TWIN }));
    await flush();
    first({ path: ROOT, kind: "list", servedRev: 0, canvases: [] });
    await flush();
    expect(run.entry()).toBeNull();
  });
});

describe("the playing frame chip", () => {
  test("names the run's frame and keeps its last title while the frame is lost", async () => {
    await playing();
    expect(run.playing()).toMatchObject({ frame: { id: "pay", title: "Pay" }, name: "Pay" });
    run.setView(view({ phase: "frame-unavailable", frames: [] }));
    expect(run.playing()).toMatchObject({ frame: { id: "pay", title: "Pay" }, name: "Pay" });
  });

  test("forgets the last title when another canvas plays", async () => {
    await playing();
    run.setView(view({ root: TWIN, frames: [] }));
    expect(run.playing()).toMatchObject({ frame: { id: "pay" }, name: "pay" });
  });
});

describe("what main hears", () => {
  test("the open panel's conversation, and null when it folds or shows none", async () => {
    await playing();
    expect(calls.setShowing).toHaveBeenLastCalledWith("c1");
    run.setView(view({ panel: { open: false, width: 280 } }));
    expect(calls.setShowing).toHaveBeenLastCalledWith(null);
    const count = calls.setShowing!.mock.calls.length;
    run.setView(view({ panel: { open: false, width: 300 } }));
    expect(calls.setShowing!.mock.calls.length).toBe(count);
  });

  test("an ended turn is seen only while the panel is open and the window has focus", async () => {
    calls.readConversation!.mockImplementation(async () => ({ events: [{ conversationId: "c1", seq: 4, type: "turn.ended", turnId: "t", reason: "done", at: "2026-11-01T12:00:00.000Z" }], lastSeq: 4 }));
    focused = false;
    await playing({}, [summary({ unseen: true })]);
    expect(calls.markConversationSeen).not.toHaveBeenCalled();
    focused = true;
    run.focusChanged();
    expect(calls.markConversationSeen).toHaveBeenCalledWith({ conversationId: "c1", seq: 4 });
  });

  // The header's button is hidden while the panel is open (Hide conversation is in the panel's head), so it is Show
  // conversation in both states and shows its badge again as soon as the panel closes.
  test("the button's badge: working, and Show conversation whether the panel is open or folded", async () => {
    await playing({ panel: { open: false, width: null } }, [summary({ working: true, phase: "running" })]);
    expect(run.button()).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
    run.setView(view({ panel: { open: true, width: 280 } }));
    expect(run.button()).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
  });

  test("the button names an unread ending until this window marks it seen", async () => {
    await playing({ panel: { open: false, width: null } }, [summary({ unseen: true })]);
    expect(run.button()).toMatchObject({ badge: "unseen", name: "Show conversation, conversation finished unread" });
  });

  test("before any view the button is Show conversation with no badge", () => {
    expect(run.button()).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
  });
});

// The folded panel's button reads every conversation of the playing canvas (the main window's strongest signal), in
// this window's order: an answer needed, then working, then an unread ending. Opening through it shows the conversation
// it stands for; a list read alone never moves the person's pick.
describe("the folded badge across the canvas", () => {
  const waiting = (conversationId: string) => summary({ conversationId, phase: "waiting", working: true, waitingSince: "2026-11-01T12:01:00.000Z" });
  test("another conversation waiting for an answer badges the button while an idle one shows", async () => {
    await playing({ panel: { open: false, width: 280 } }, [summary({ conversationId: "A" })]);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A" }), waiting("B")]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "A" });
    expect(run.button()).toEqual({ label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" });
  });

  test("an answer needed elsewhere outranks the shown conversation's work; another's work outranks nothing", async () => {
    await playing({ panel: { open: false, width: 280 } }, [summary({ conversationId: "A", phase: "running", working: true })]);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A", phase: "running", working: true }), waiting("B")]);
    expect(run.button().badge).toBe("permission");
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A" }), summary({ conversationId: "B", phase: "running", working: true })]);
    expect(run.button()).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A" }), summary({ conversationId: "B", unseen: true })]);
    expect(run.button().badge).toBe("unseen");
  });

  test("opening through the badge shows the conversation it stands for; a later read keeps the person's pick", async () => {
    await playing({ panel: { open: false, width: 280 } }, [summary({ conversationId: "A", lastActivityAt: "2026-11-01T12:05:00.000Z" })]);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A", lastActivityAt: "2026-11-01T12:05:00.000Z" }), waiting("B")]);
    run.unfoldTarget();
    run.setView(view({ panel: { open: true, width: 280 } }));
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "B" });
    run.run.select("A");
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A", lastActivityAt: "2026-11-01T12:05:00.000Z" }), waiting("B")]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "A" });
  });

  test("with no badge opening keeps what the panel showed", async () => {
    await playing({ panel: { open: false, width: 280 } }, [summary({ conversationId: "A" }), summary({ conversationId: "B", lastActivityAt: "2026-11-01T11:00:00.000Z" })]);
    run.unfoldTarget();
    run.setView(view({ panel: { open: true, width: 280 } }));
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "A" });
  });
});

// One session is one conversation: main offers no terminal session a conversation already holds, so the window asks
// again whenever the new conversation state comes back or a list change can move who holds it.
describe("the terminal session after it was resumed", () => {
  test("New after resuming the session into a conversation no longer offers it; deleting that conversation offers it again", async () => {
    calls.conversationResumeTarget!.mockResolvedValueOnce({ available: true, runtime: "claude", session: "S" });
    calls.conversationResumeTarget!.mockResolvedValueOnce({ available: false, reason: "no_record" });
    calls.conversationResumeTarget!.mockResolvedValueOnce({ available: true, runtime: "claude", session: "S" });
    await playing({}, []);
    expect(run.run.view()).toMatchObject({ kind: "new", start: { offer: "claude" } });
    run.run.started({ root: ROOT, canvas: CHECKOUT }, "A", "claude", run.run.revision());
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "A" })]);
    run.run.select(null);
    await flush();
    expect(run.run.view()).toMatchObject({ kind: "new", start: { offer: null, mode: "new" } });
    // The main window deletes A: the list no longer names it, and the session is offered again.
    listChanged!({ root: ROOT });
    await answer(ROOT, []);
    await flush();
    expect(calls.conversationResumeTarget).toHaveBeenCalledTimes(3);
    expect(run.run.view()).toMatchObject({ kind: "new", start: { offer: "claude" } });
  });
});


describe("read persistence across windows", () => {
  const folded = { panel: { open: false, width: 280 } };
  const ending = (conversationId: string, seq: number) => ({ v: 1 as const, conversationId, seq, type: "turn.done" as const, turnId: "t" + seq, at: "2026-11-01T12:00:00.000Z" });
  const unread = summary({ conversationId: "B", unseen: true });
  const other = summary({ conversationId: "A", lastActivityAt: "2026-11-01T12:05:00.000Z" });

  beforeEach(() => {
    calls.readConversation!.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      ({ events: conversationId === "B" ? [ending("B", 4)] : [], lastSeq: conversationId === "B" ? 4 : 0 }));
  });

  test.each(["error reply", "rejection"])("a failed mark (%s) restores its badge and reopening retries that ending", async failure => {
    const mark = calls.markConversationSeen!;
    if (failure === "error reply") mark.mockResolvedValueOnce({ error: "unknown" });
    else mark.mockRejectedValueOnce(new Error("read marker not saved"));
    await playing(folded, [other, unread]);
    run.unfoldTarget();
    run.setView(view());
    await flush();
    expect(mark).toHaveBeenCalledTimes(1);
    run.setView(view(folded));
    run.run.select("A");
    expect(run.button().badge).toBe("unseen");
    run.unfoldTarget();
    run.setView(view());
    await flush();
    expect(run.shown()).toMatchObject({ conversationId: "B" });
    expect(mark.mock.calls).toEqual([[{ conversationId: "B", seq: 4 }], [{ conversationId: "B", seq: 4 }]]);
    expect(run.button().badge).toBeNull();
  });

  test("a mark for an already seen ending cannot hide a newer ending whose last notification preceded its reply", async () => {
    let saved!: () => void;
    calls.markConversationSeen!.mockImplementationOnce(() => new Promise<void>(resolve => { saved = resolve; }));
    await playing({}, [{ ...unread, unseen: false }, other]);
    run.run.select("B");
    await flush();
    expect(calls.markConversationSeen).toHaveBeenCalledWith({ conversationId: "B", seq: 4 });
    run.run.select("A");
    run.setView(view(folded));
    event!(ending("B", 6));
    listChanged!({ root: ROOT });
    const persisted = [other, { ...unread, lastActivityAt: "2026-11-01T12:10:00.000Z" }];
    calls.listConversations!.mockResolvedValueOnce(persisted);
    // Main already persisted 4, so the successful write sends no other list notification.
    saved();
    await flush();
    await answer(ROOT, persisted);
    expect(run.store.thread("B")?.events.at(-1)?.seq).toBe(6);
    expect.soft(run.button().badge).toBe("unseen");
    run.unfoldTarget();
    run.setView(view());
    expect(run.shown()).toMatchObject({ conversationId: "B" });
    expect(calls.markConversationSeen).toHaveBeenLastCalledWith({ conversationId: "B", seq: 6 });
  });

  test("an unread snapshot started before a successful mark leaves the badge suppressed until confirmation", async () => {
    let saved!: () => void;
    calls.markConversationSeen!.mockImplementationOnce(() => new Promise<void>(resolve => { saved = resolve; }));
    await playing({}, [unread]);
    run.setView(view(folded));
    listChanged!({ root: ROOT });
    saved();
    await flush();
    await answer(ROOT, [unread]);
    expect(run.button().badge).toBeNull();
    await answer(ROOT, [{ ...unread, unseen: false }]);
    expect(run.seen().has("B")).toBe(false);
    expect(run.button().badge).toBeNull();
  });

  test("a late refusal of an earlier ending keeps the later successful mark until a fresh snapshot", async () => {
    let fail!: (reply: { error: string }) => void;
    calls.markConversationSeen!.mockImplementationOnce(() => new Promise(resolve => { fail = resolve; }));
    await playing({}, [unread]);
    event!(ending("B", 6));
    await flush();
    expect(calls.markConversationSeen!.mock.calls.map(([request]) => request.seq)).toEqual([4, 6]);
    run.setView(view(folded));
    fail({ error: "unknown" });
    await flush();
    expect(run.button().badge).toBeNull();
    listChanged!({ root: ROOT });
    await answer(ROOT, [unread]);
    expect(run.button().badge).toBe("unseen");
  });

  test("a mark refused after a newer list uses the persisted rows and leaves another conversation's mark alone", async () => {
    let fail!: (reply: { error: string }) => void;
    calls.readConversation!.mockImplementation(async ({ conversationId }: { conversationId: string }) => ({ events: [ending(conversationId, 4)], lastSeq: 4 }));
    calls.markConversationSeen!.mockImplementationOnce(() => new Promise(resolve => { fail = resolve; }));
    await playing({}, [unread]);
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "B" }), { ...other, unseen: true }]);
    run.run.select("A");
    await flush();
    run.setView(view(folded));
    fail({ error: "unknown" });
    await flush();
    expect(run.seen().has("A")).toBe(true);
    expect(run.button().badge).toBeNull();
  });
});
