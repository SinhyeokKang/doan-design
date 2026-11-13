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
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", state: "current", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, root: ROOT, path: CHECKOUT.path, canvasId: "checkout", frame: "pay", title: "Pay", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://x/a.html", markWidth: 390, markHeight: 844 }, frames: [{ id: "pay", title: "Pay", size: "390x844", number: 1 }],
  canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: true, width: 280 }, canvasRow: "present", ...over,
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
    onConversationStage: on("stage"),
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
  test("the canvas's current conversation, never an archived one", async () => {
    await playing({}, [summary({ conversationId: "old", state: "archived" }), summary({ conversationId: "now" })]);
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "now" });
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "now" });
  });

  test("no current conversation is the new conversation state", async () => {
    await playing({}, [summary({ conversationId: "old", state: "archived" })]);
    expect(run.shown()).toEqual({ kind: "new" });
    expect(run.run.view()?.kind).toBe("new");
  });

  test("a new current conversation started in the main window takes over, and the draft follows when it has none", async () => {
    await playing({}, [summary({ conversationId: "old" })]);
    run.store.setDrafts(drafts => new Map(drafts).set("conversation:old", { segments: [{ kind: "text", text: "This button" }], preset: null, attachments: [], shape: "capsule" }));
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "old", state: "archived" }), summary({ conversationId: "next" })]);
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "next" });
    expect(run.store.drafts.get("conversation:next")?.segments).toEqual([{ kind: "text", text: "This button" }]);
  });

  test("the draft stays when the new current conversation already has one", async () => {
    await playing({}, [summary({ conversationId: "old" })]);
    const mine = { segments: [{ kind: "text" as const, text: "mine" }], preset: null, attachments: [], shape: "capsule" as const };
    const theirs = { segments: [{ kind: "text" as const, text: "theirs" }], preset: null, attachments: [], shape: "capsule" as const };
    run.store.setDrafts(drafts => new Map(drafts).set("conversation:old", mine).set("conversation:next", theirs));
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "old", state: "archived" }), summary({ conversationId: "next" })]);
    expect(run.store.drafts.get("conversation:next")).toBe(theirs);
    expect(run.store.drafts.get("conversation:old")).toBe(mine);
  });

  // The draft of the new conversation state may be the message this window is sending: a list naming the conversation
  // its start made can come before the start's reply, and that draft must not move into the conversation.
  test("from the new conversation state the canvas's new current conversation shows, and the new state's draft stays", async () => {
    await playing({}, []);
    const key = run.run.composerKey()!;
    const sending = { segments: [{ kind: "text" as const, text: "This button does nothing" }], preset: null, attachments: [], shape: "capsule" as const };
    run.store.setDrafts(drafts => new Map(drafts).set(key, sending));
    listChanged!({ root: ROOT });
    await answer(ROOT, [summary({ conversationId: "started" })]);
    expect(run.run.view()).toMatchObject({ kind: "conversation", conversationId: "started" });
    expect(run.store.drafts.get(key)).toBe(sending);
    expect(run.store.drafts.get("conversation:started")).toBeUndefined();
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

  test("the button's badge: working while the panel is folded", async () => {
    await playing({ panel: { open: false, width: null } }, [summary({ working: true, phase: "running" })]);
    expect(run.button()).toEqual({ label: "Show conversation", badge: "working", name: "Show conversation, agent is working" });
    run.setView(view({ panel: { open: true, width: 280 } }));
    expect(run.button()).toEqual({ label: "Hide conversation", badge: null, name: "Hide conversation" });
  });

  test("the button names an unread ending until this window marks it seen", async () => {
    await playing({ panel: { open: false, width: null } }, [summary({ unseen: true })]);
    expect(run.button()).toMatchObject({ badge: "unseen", name: "Show conversation, conversation finished unread" });
  });

  test("before any view the button is Show conversation with no badge", () => {
    expect(run.button()).toEqual({ label: "Show conversation", badge: null, name: "Show conversation" });
  });
});
