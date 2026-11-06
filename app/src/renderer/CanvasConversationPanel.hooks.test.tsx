import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";

// terminal-agent-activity design '표시' (canvas conversation panel), run with hooks as plain state (the App tests' no-DOM
// style): a terminal session choice that was chosen falls back to a new conversation while that session works in a
// terminal, and stays a new conversation once the session ends, so the choice never flips back under a draft.
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

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("window", { doan: {
    conversationResumeTarget: vi.fn(async () => ({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" })),
    onAgentAuth: vi.fn(() => () => {}),
  } });
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

test("a chosen terminal session becomes a new conversation while it works, and stays one after", async () => {
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  run.choose("resume");
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work,
  });
  const mode = () => { const view = run.view(); return view?.kind === "new" ? view.start.mode : null; };
  render(panel([]));
  expect(mode()).toBe("resume");
  render(panel([{ touched: 0, turn: "none:t", session: "s1", provider: "codex", root: "/w/other", path: ".doan/canvases/x.html" }]));
  expect(mode()).toBe("new");
  render(panel([]));
  expect(mode()).toBe("new");
  // The person can pick it again once the session is done.
  run.choose("resume");
  render(panel([]));
  expect(mode()).toBe("resume");
});

// The ResumeChoice element the panel renders, found in its element tree (nothing below it renders here).
function resumeChoice(node: ReactNode): { offer: string; held: boolean } | null {
  if (Array.isArray(node)) { for (const child of node) { const found = resumeChoice(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: { children?: ReactNode; offer?: string; held?: boolean } };
  if (typeof element.type === "function" && element.type.name === "ResumeChoice") return { offer: element.props.offer!, held: element.props.held! };
  return resumeChoice(element.props.children);
}

// RD1: on the first entry the linked Claude session works in a terminal, so its process holds it (session_in_use) and
// the choice waits. The target is read again when the work list changes and when the window comes back, since nothing
// tells the run when that process exits; the choice returns once the session can run.
test("a Claude session a terminal process holds waits on first entry and returns once it can run", async () => {
  const target = vi.fn(async () => ({ available: false, reason: "session_in_use", runtime: "claude", session: "s1" }) as unknown);
  (window as unknown as { doan: { conversationResumeTarget: unknown } }).doan.conversationResumeTarget = target;
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work,
  });
  const working: readonly WorkItem[] = [{ touched: 0, turn: "none:t", session: "s1", provider: "claude", root: ROOT, path: CANVAS.path }], none: readonly WorkItem[] = [];
  expect(resumeChoice(render(panel(working)))).toEqual({ offer: "claude", held: true });
  await flush();
  // The turn ends but the terminal's claude still runs: the session is still held, and not offered.
  let asked = target.mock.calls.length;
  render(panel(none));
  await flush();
  expect(target).toHaveBeenCalledTimes(asked + 1);
  expect(resumeChoice(render(panel(none)))).toBeNull();
  // The person quits claude and comes back to the window.
  target.mockResolvedValue({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  asked = target.mock.calls.length;
  run.focusChanged();
  await flush();
  expect(target).toHaveBeenCalledTimes(asked + 1);
  expect(resumeChoice(render(panel(none)))).toEqual({ offer: "claude", held: false });
  // A runnable target is not asked again on later changes.
  asked = target.mock.calls.length;
  run.focusChanged(); render(panel(working)); render(panel(none));
  await flush();
  expect(target).toHaveBeenCalledTimes(asked);
});

// RD1: the work ending with the process gone (the read after the change answers) brings the choice back at once.
test("a held Claude session returns when its work ends and the process is free", async () => {
  const target = vi.fn(async () => ({ available: false, reason: "session_in_use", runtime: "claude", session: "s1" }) as unknown);
  (window as unknown as { doan: { conversationResumeTarget: unknown } }).doan.conversationResumeTarget = target;
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work,
  });
  expect(resumeChoice(render(panel([{ touched: 0, turn: "none:t", session: "s1", provider: "claude", root: "/w/other", path: ".doan/canvases/x.html" }])))).toEqual({ offer: "claude", held: true });
  target.mockResolvedValue({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  render(panel([]));
  await flush();
  expect(resumeChoice(render(panel([])))).toEqual({ offer: "claude", held: false });
  // The new conversation the hold set stays the mode until the person picks the session.
  const view = run.view();
  expect(view?.kind === "new" ? view.start.mode : null).toBe("new");
});

// The page's canvas press signal reaches the panel's composer unchanged, so its preset lists close on a canvas press.
test("the panel hands the page's canvas press signal to its composer", async () => {
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  const canvasPress = () => () => {};
  const tree = render(() => CanvasConversation({
    run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [], canvasPress,
  }));
  const composer = (node: ReactNode): Record<string, unknown> | null => {
    if (Array.isArray(node)) { for (const child of node) { const found = composer(child); if (found) return found; } return null; }
    if (!node || typeof node !== "object" || !("props" in node)) return null;
    const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
    if (typeof element.type === "function" && element.type.name === "DockedComposer") return element.props;
    return composer(element.props.children);
  };
  expect(composer(tree)?.canvasPress).toBe(canvasPress);
});

// canvas-handoff design §6 (runtime finding in /design-sync): the move's arrival comes with the render that still
// shows the canvas left behind, whose thread has no card. It waits for the receiving conversation and focuses its
// card there instead of sending focus to the old composer.
test("a handoff arrival waits for the receiving canvas and conversation, then is applied once", async () => {
  const DRAFTS: Canvas = { path: ".doan/canvases/drafts.html", id: "drafts" };
  const entry: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: DRAFTS.path, id: "drafts", url: "d" }, { path: CANVAS.path, id: "checkout", url: "u" }] };
  const row = (conversationId: string, canvas: Canvas) => ({ conversationId, title: "t", state: "current", owner: "doan", provider: "claude", fromHome: false, canvas,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" });
  const list = [row("c-src", DRAFTS), row("c-recv", CANVAS)] as never[];
  const card = { v: 1, conversationId: "c-recv", seq: 1, turnId: "r1", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Continue.", anchors: [], origin: { kind: "handoff", conversationId: "c-src", canvas: DRAFTS } };
  (window as unknown as { doan: Record<string, unknown> }).doan.readConversation = vi.fn(async ({ conversationId }: { conversationId: string }) => conversationId === "c-recv" ? { events: [card], lastSeq: 1, turn: "idle" } : { events: [], lastSeq: 0, turn: "idle" });
  vi.stubGlobal("document", { querySelector: () => null });
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: DRAFTS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  const onArrived = vi.fn();
  const arrival = { focus: "handoff" as const, seq: 7, handoff: { root: ROOT, canvas: CANVAS, conversationId: "c-recv" } };
  const panel = (canvas: Canvas) => () => CanvasConversation({
    run, support, target: { root: ROOT, canvas }, canvasName: "x", project: "acme-web", entry, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival, onArrived,
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  });
  // The render that brings the arrival still draws the old canvas's conversation; the page's layout effect then shows
  // the new canvas before the panel's effect runs.
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
  panel(CANVAS)();
  run.request({ root: ROOT, canvas: CANVAS }, "c-recv", null);
  run.show({ root: ROOT, canvas: CANVAS });
  for (const effect of hooks.pending) effect();
  await flush();
  expect(onArrived).not.toHaveBeenCalled();
  render(panel(CANVAS));
  await flush();
  render(panel(CANVAS));
  expect(onArrived).toHaveBeenCalledExactlyOnceWith(7);
});

// The DockedComposer element the panel renders, found in its element tree.
function dockedProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const child of node) { const found = dockedProps(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if (typeof element.type === "function" && element.type.name === "DockedComposer") return element.props;
  return dockedProps(element.props.children);
}

// fast-mode B2 (POSTMORTEM 2026-11-02): the panel's own start sends the Fast its switch shows, and its remembered
// choice carries no Fast, which only a switch records.
test("a new conversation started from the panel sends the Fast it shows and remembers none", async () => {
  const { authStatus } = await import("../main/agentAuth/state");
  const start = vi.fn(async (_request: unknown) => ({ conversationId: "c9" }));
  Object.assign((window as unknown as { doan: Record<string, unknown> }).doan, {
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), startConversation: start,
    readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), listConversations: vi.fn(() => new Promise(() => {})),
  });
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}), { readPresets: vi.fn(), readModels: vi.fn() });
  support.auth = { revision: 1, providers: [authStatus({ provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" }, { cli: "found", version: "supported", tools: "ready" }, 1)] };
  support.models = { [modelsKey(ROOT, "claude", 1)]: { models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"], fast: {} }] } };
  const onRemember = vi.fn();
  const panel = () => CanvasConversation({
    run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: { lastProvider: "claude", fast: { claude: true } }, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [], onRemember,
  });
  const composer = dockedProps(render(panel))! as { picker: { effort: { ariaLabel: string } | null }; onSend(request: unknown): Promise<unknown> };
  expect(composer.picker.effort?.ariaLabel).toBe("Effort: default, Fast on");
  await composer.onSend({ text: "Go", anchors: [], attachments: [] });
  expect(start.mock.calls[0]![0]).toMatchObject({ mode: "new", runtime: "claude", model: "opus", fast: true });
  expect(onRemember).toHaveBeenCalled();
  for (const [choice] of onRemember.mock.calls) expect(choice).not.toHaveProperty("fast");
});
