import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { AttachmentResult } from "../main/attachments";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { ListView } from "./conversationStore";
import type { AttachmentDraft } from "./homeComposer";

// The canvas conversation panel body, run with hooks as plain state (the App tests' no-DOM style).
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0, dirty: false,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { CanvasConversation } = await import("./CanvasConversationPanel");
const { CanvasRun } = await import("./canvasRun");
const { ConversationStore } = await import("./conversationStore");
const { DockedSupport, modelsKey } = await import("./dockedSupport");
const { draftKey } = await import("./dockedRules");

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

// The prototype window has no `window.doan`: its page hands the panel body, the store, the run and the docked support
// a call object instead (window.doanPrototype's subset). These run the body with every effect and its send without
// the global, and check each call went to the object given.
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("window", {});
});
afterEach(() => vi.unstubAllGlobals());

function render(component: () => ReactNode): ReactNode {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
    const tree = component();
    for (const run of hooks.pending) run();
    if (!hooks.dirty) return tree;
  }
  throw new Error("did not settle");
}
function dockedProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const child of node) { const found = dockedProps(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if (typeof element.type === "function" && element.type.name === "DockedComposer") return element.props;
  return dockedProps(element.props.children);
}

function fakeCalls() {
  return {
    onAgentAuth: vi.fn(() => () => {}),
    onAgentUsage: vi.fn(() => () => {}), onWindowVisible: vi.fn(() => () => {}), readAgentUsage: vi.fn(async () => []),
    conversationResumeTarget: vi.fn(async () => ({ available: false as const, reason: "no_record" as const })),
    listConversationSkills: vi.fn(async () => ({ skills: [] })),
    listConversationModels: vi.fn(async () => ({ models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"] }] })),
    designSkills: { list: vi.fn(async () => ({ v: 1 as const, ok: true as const, result: { version: "1", presets: [] } })), get: vi.fn() },
    startConversation: vi.fn(async (_request: unknown) => ({ conversationId: "c9" })),
    sendConversation: vi.fn(async (_request: unknown) => undefined),
    queueConversation: vi.fn(async (_request: unknown) => ({ itemId: "q1" })),
    readConversation: vi.fn(() => new Promise<never>(() => {})),
    takeConversationDraft: vi.fn(async () => null),
    scheduledMessages: vi.fn(async () => []),
    sendQueuedNow: vi.fn(async () => undefined), removeQueuedMessage: vi.fn(async () => undefined), interruptConversation: vi.fn(async () => undefined),
    answerConversationPermission: vi.fn(async () => undefined), answerConversationQuestion: vi.fn(async () => undefined), setConversationPermissionMode: vi.fn(async () => undefined),
    chooseAttachments: vi.fn(async () => []), addAttachmentFiles: vi.fn(async (_files: readonly File[]): Promise<AttachmentResult[] | null> => []), addPastedImage: vi.fn(async () => null), droppedPath: vi.fn(() => null),
    removeAttachment: vi.fn(async () => true), releaseAttachments: vi.fn(async () => true), recheckAttachments: vi.fn(async () => []), attachmentsFromPaths: vi.fn(async () => []),
    openLink: vi.fn(async () => true),
  };
}

async function headless(calls: ReturnType<typeof fakeCalls>) {
  const { authStatus } = await import("../main/agentAuth/state");
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = new DockedSupport(() => {}, calls);
  support.auth = { revision: 1, providers: [authStatus({ provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" }, { cli: "found", version: "supported", tools: "ready" }, 1)] };
  support.models = { [modelsKey(ROOT, "claude", 1)]: { models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"] }] } };
  // No Pick, no Capture area and no field link: the prototype window has no board.
  const panel = () => CanvasConversation({
    calls, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  });
  return { run, store, support, panel };
}

test("the panel body renders, reads and starts a conversation through the call object, without window.doan", async () => {
  expect((window as { doan?: unknown }).doan).toBeUndefined();
  const calls = fakeCalls();
  const { panel } = await headless(calls);
  const tree = render(panel);
  await flush();
  expect(calls.conversationResumeTarget).toHaveBeenCalledWith({ root: ROOT, canvas: CANVAS });
  expect(calls.onAgentAuth).toHaveBeenCalledOnce();
  expect(calls.listConversationSkills).toHaveBeenCalledWith({ root: ROOT, provider: "claude" });
  const composer = dockedProps(tree)! as { pick?: unknown; link?: unknown; onSend(request: unknown): Promise<unknown>; onAttach(): void };
  expect(composer.pick).toBeUndefined();
  // The reply names the conversation the panel now shows (a command's leftover draft follows it).
  expect(await composer.onSend({ text: "This button does nothing", anchors: [{ frame: { id: "pay", title: "Pay" } }], attachments: [] })).toEqual({ ok: true, conversationId: "c9" });
  expect(calls.startConversation.mock.calls[0]![0]).toMatchObject({ root: ROOT, mode: "new", runtime: "claude", canvas: CANVAS, text: "This button does nothing", anchors: [{ frame: { id: "pay", title: "Pay" } }] });
  composer.onAttach();
  await flush();
  expect(calls.chooseAttachments).toHaveBeenCalledOnce();
});

test("the docked support reads presets, models and a permission mode through the call object", async () => {
  const calls = fakeCalls();
  const support = new DockedSupport(() => {}, calls);
  support.readPresets();
  support.readModels(ROOT, "claude");
  support.pickPermission("conversation:c1", "c1", "plan");
  await flush();
  expect(calls.designSkills.list).toHaveBeenCalledOnce();
  expect(calls.listConversationModels).toHaveBeenCalledWith({ root: ROOT, runtime: "claude" });
  expect(calls.setConversationPermissionMode).toHaveBeenCalledWith({ conversationId: "c1", permissionMode: "plan" });
});

test("the store reads a thread and takes a returned draft through the call object", async () => {
  const calls = fakeCalls();
  const list = [{ conversationId: "c1", returnedDraft: true }] as unknown as ListView;
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  store.track("c1");
  store.takeDraft(ROOT, "c1");
  await flush();
  expect(calls.readConversation).toHaveBeenCalledWith({ conversationId: "c1" });
  expect(calls.takeConversationDraft).toHaveBeenCalledWith({ conversationId: "c1" });
});

// The prototype window routes main-window-only buttons to its host; the promotion notice's Open is one of them.
test("the promotion notice's Open goes to the host's callback when it gives one", async () => {
  const calls = fakeCalls();
  const summary = (canvas?: Canvas) => ({ conversationId: "p1", ...(canvas ? { canvas, startedBy: "promotion" as const } : {}), title: "Ideas", owner: "doan", provider: "claude", fromHome: false,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" }) as const;
  let list: ListView = [summary()];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  // The person's New: a promotion over it is announced rather than shown.
  run.select(null);
  list = [summary(CANVAS)];
  run.sync();
  await flush();
  const onOpenPromoted = vi.fn();
  const tree = render(() => CanvasConversation({
    calls, run, support: new DockedSupport(() => {}, calls), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [], onOpenPromoted,
  }));
  const open = (node: ReactNode): { onClick(): void } | null => {
    if (Array.isArray(node)) { for (const child of node) { const found = open(child); if (found) return found; } return null; }
    if (!node || typeof node !== "object" || !("props" in node)) return null;
    const element = node as { props: { children?: ReactNode; "aria-label"?: string; onClick?(): void } };
    if (element.props["aria-label"] === "Open the moved conversation") return element.props as { onClick(): void };
    return open(element.props.children);
  };
  open(tree)!.onClick();
  expect(onOpenPromoted).toHaveBeenCalledWith("p1");
  // The panel did not switch to it itself.
  expect(run.view()?.kind).toBe("new");
});

// An existing conversation's composer: its send, queue and attachment paths, still without window.doan.
async function existing(calls: ReturnType<typeof fakeCalls>) {
  const list: ListView = [{ conversationId: "c1", canvas: CANVAS, title: "Ideas", owner: "doan", provider: "claude", fromHome: false,
    phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" }];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = new DockedSupport(() => {}, calls);
  const tree = render(() => CanvasConversation({
    calls, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  }));
  expect(run.view()).toMatchObject({ kind: "conversation", conversationId: "c1" });
  const composer = dockedProps(tree)! as {
    onSend(request: unknown): Promise<unknown>; onQueue(request: unknown): Promise<unknown>;
    onFiles(files: File[], pasted: boolean): void; onAttachmentRemoved(attachment: AttachmentDraft): void;
  };
  return { store, composer };
}

test("an existing conversation's send and queue go through the call object", async () => {
  const calls = fakeCalls();
  const { store, composer } = await existing(calls);
  const anchors = [{ frame: { id: "pay", title: "Pay" } }];
  expect(await composer.onSend({ text: "{{1}} Tighten it", anchors, attachments: [] })).toEqual({ ok: true });
  expect(calls.sendConversation.mock.calls[0]![0]).toMatchObject({ conversationId: "c1", text: "{{1}} Tighten it", anchors });
  expect(await composer.onQueue({ text: "{{1}} Then this", anchors, attachments: [] })).toEqual({ ok: true, itemId: "q1" });
  expect(calls.queueConversation).toHaveBeenCalledWith({ conversationId: "c1", text: "{{1}} Then this", anchors });
  expect(store.queue("c1").map(item => item.id)).toEqual(["q1"]);
  expect(calls.startConversation).not.toHaveBeenCalled();
});

test("a file main checks after its chip was removed, and a held chip's removal, give their ids back through the call object", async () => {
  const calls = fakeCalls();
  let answer!: (results: AttachmentResult[]) => void;
  calls.addAttachmentFiles.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
  const { store, composer } = await existing(calls);
  composer.onFiles([new File(["notes"], "notes.md", { type: "text/markdown" })], false);
  expect(calls.addAttachmentFiles).toHaveBeenCalledOnce();
  expect(store.drafts.get("conversation:c1")?.attachments).toHaveLength(1);
  // The chip leaves the draft before main answers: main's late id has no chip to land on.
  store.setDrafts(() => new Map());
  answer([{ ok: true, attachment: { id: "late", name: "notes.md", kind: "file", pasted: false, size: 5, path: "/u/notes.md" } }]);
  await flush();
  expect(calls.removeAttachment).toHaveBeenCalledWith("late");
  // A chip a returned queue held: removed, then released.
  composer.onAttachmentRemoved({ key: "k", id: "held", name: "a.md", kind: "file", pasted: false, status: "ready", held: true });
  await flush();
  expect(calls.removeAttachment).toHaveBeenCalledWith("held");
  expect(calls.releaseAttachments).toHaveBeenCalledWith(["held"]);
});

// The prototype window's composer takes the same lists and rules as the canvas panel's (POSTMORTEM 2026-10 prototype
// composer push order): an ACP conversation's commands come by its id through the window's call object, and a card the
// composer shows lands in the shared store for the thread.
test("an ACP conversation's commands, unconfirmed names and card reach the composer through the call object", async () => {
  const calls = fakeCalls();
  calls.listConversationSkills.mockImplementation(async () => ({ skills: [{ kind: "command", name: "compact", description: "" }], passthrough: ["share"] }) as never);
  const list: ListView = [{ conversationId: "c1", canvas: CANVAS, title: "Ideas", owner: "doan", provider: "copilot", fromHome: false,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" }];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = new DockedSupport(() => {}, calls);
  const panel = () => CanvasConversation({
    calls, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  });
  render(panel);
  await flush();
  expect(calls.listConversationSkills).toHaveBeenCalledWith({ root: ROOT, provider: "copilot", conversationId: "c1" });
  const composer = dockedProps(render(panel))! as { skills: unknown; passthrough: unknown; onCard(card: unknown): void };
  expect(composer.skills).toEqual([{ kind: "command", name: "compact", description: "" }]);
  expect(composer.passthrough).toEqual(["share"]);
  const card = { title: "/model doesn’t run in Doan", body: "Choose the model from the model picker.", action: null };
  composer.onCard(card);
  expect(store.card("conversation:c1")).toBe(card);
});

// A command sent from the new conversation state starts a conversation and leaves the preset and attachments it did not
// take. The start's reply and the list's push of the new conversation come in either order: while the start is out the
// draft never moves (followNewConversation's guard), and once the reply names the conversation the composer settles the
// leftover under it (settleSent).
test.each(["reply first", "push first"] as const)("a command's leftover follows the conversation it started (%s)", async order => {
  const { settleSent } = await import("./dockedRules");
  const calls = fakeCalls();
  let answer!: (reply: { conversationId: string }) => void;
  calls.startConversation.mockImplementation(() => new Promise(resolve => { answer = resolve; }) as never);
  let list: ListView = [];
  const host = { list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() };
  const store = new ConversationStore(host, calls);
  const run = new CanvasRun({ ...host, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = new DockedSupport(() => {}, calls);
  const { authStatus } = await import("../main/agentAuth/state");
  support.auth = { revision: 1, providers: [authStatus({ provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" }, { cli: "found", version: "supported", tools: "ready" }, 1)] };
  const panel = () => CanvasConversation({
    calls, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  });
  const newKey = draftKey({ kind: "new", root: ROOT, canvas: CANVAS });
  const file = { key: "k", id: "f", name: "notes.md", kind: "file" as const, pasted: false, status: "ready" as const, size: 5, path: "/u/notes.md" };
  const sent = { segments: [{ kind: "text" as const, text: "/compact" }], preset: null, attachments: [file], shape: "box" as const };
  store.setDrafts(drafts => new Map(drafts).set(newKey, sent));
  const composer = dockedProps(render(panel))! as { onSend(request: unknown): Promise<{ ok?: true; conversationId?: string }> };
  const sending = composer.onSend({ text: "/compact", anchors: [], attachments: [] });
  const push = () => { list = [{ conversationId: "c9", canvas: CANVAS, title: "", owner: "doan", provider: "claude", fromHome: false, phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" }]; run.sync(); };
  if (order === "push first") {
    push();
    // The start is out: the draft stays where it was sent from.
    expect(store.drafts.get(newKey)).toBe(sent);
    expect(store.drafts.has("conversation:c9")).toBe(false);
  }
  answer({ conversationId: "c9" });
  const outcome = await sending;
  expect(outcome).toEqual({ ok: true, conversationId: "c9" });
  store.setDrafts(drafts => settleSent(drafts, newKey, sent, { ...sent, segments: [], shape: "box" }, `conversation:${outcome.conversationId}`));
  if (order === "reply first") push();
  expect(run.view()).toMatchObject({ kind: "conversation", conversationId: "c9" });
  expect(store.drafts.get("conversation:c9")?.attachments).toEqual([file]);
  expect(store.drafts.get(newKey)?.attachments ?? []).toEqual([]);
});

// A streamed delta leaves the store's host alone (App, the prototype window), so the panel body redraws its thread by
// its own subscription to the conversation it shows.
test("a streamed delta redraws the panel's thread without the host's changed", async () => {
  const calls = fakeCalls();
  const history = [
    { v: 1, conversationId: "c1", seq: 1, turnId: "t1", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Tighten it", anchors: [] },
    { v: 1, conversationId: "c1", seq: 2, turnId: "t1", at: "2026-11-01T00:00:00Z", type: "turn.started" },
  ];
  calls.readConversation.mockImplementation(async () => ({ events: history, lastSeq: 2, turn: "running" }) as never);
  const list: ListView = [{ conversationId: "c1", canvas: CANVAS, title: "Ideas", owner: "doan", provider: "claude", fromHome: false,
    phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" }];
  const changed = vi.fn();
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const panel = () => CanvasConversation({
    calls, run, support: new DockedSupport(() => {}, calls), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  });
  render(panel);
  await flush();
  expect(agentTexts(render(panel))).toEqual([]);
  changed.mockClear();
  hooks.dirty = false;
  store.event({ v: 1, conversationId: "c1", seq: 3, turnId: "t1", at: "2026-11-01T00:00:01Z", type: "message.delta", messageId: "m1", text: "Hel" });
  expect(changed).not.toHaveBeenCalled();
  expect(hooks.dirty).toBe(true);
  expect(agentTexts(render(panel))).toEqual(["Hel"]);
  store.event({ v: 1, conversationId: "c1", seq: 4, turnId: "t1", at: "2026-11-01T00:00:01Z", type: "message.delta", messageId: "m1", text: "lo" });
  expect(agentTexts(render(panel))).toEqual(["Hello"]);
});

// The streamed reply's text in the thread element's items.
function agentTexts(node: ReactNode): string[] | null {
  if (Array.isArray(node)) { for (const child of node) { const found = agentTexts(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const props = (node as { props: { items?: unknown; conversationId?: unknown; children?: ReactNode } }).props;
  if (props.conversationId !== undefined && "items" in props) {
    const items = Array.isArray(props.items) ? props.items as { kind: string; text?: string }[] : [];
    return items.filter(item => item.kind === "agent").map(item => item.text!);
  }
  return agentTexts(props.children);
}
