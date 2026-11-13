import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { ListView } from "./conversationStore";

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
    chooseAttachments: vi.fn(async () => []), addAttachmentFiles: vi.fn(async () => []), addPastedImage: vi.fn(async () => null), droppedPath: vi.fn(() => null),
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
  expect(await composer.onSend({ text: "This button does nothing", anchors: [{ frame: { id: "pay", title: "Pay" } }], attachments: [] })).toEqual({ ok: true });
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
