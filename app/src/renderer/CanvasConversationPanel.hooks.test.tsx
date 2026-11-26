import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";

// Hooks run as plain state: a chosen terminal session choice falls back to a new conversation while that session works
// in a terminal, and stays new once it ends, so the choice never flips back under a draft.
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

const { CanvasConversation, CanvasConversationTitle } = await import("./CanvasConversationPanel");
const { CanvasRun } = await import("./canvasRun");
const { ConversationStore } = await import("./conversationStore");
const { DockedSupport, modelsKey } = await import("./dockedSupport");

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("window", { doan: { listConversationSkills: vi.fn(async () => ({ skills: [] })),
    conversationResumeTarget: vi.fn(async () => ({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" })),
    onAgentAuth: vi.fn(() => () => {}), onAgentUsage: vi.fn(() => () => {}), readAgentUsage: vi.fn(async () => []),
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
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  run.choose("resume");
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work,
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

// The linked Claude session's terminal process holds it (session_in_use), so the choice waits. Nothing tells the run when
// that process exits, so the target is read again when the work list changes and when the window comes back.
test("a Claude session a terminal process holds waits on first entry and returns once it can run", async () => {
  const target = vi.fn(async () => ({ available: false, reason: "session_in_use", runtime: "claude", session: "s1" }) as unknown);
  (window as unknown as { doan: { conversationResumeTarget: unknown } }).doan.conversationResumeTarget = target;
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work,
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

// The work ending with the process gone (the read after the change answers) brings the choice back at once.
test("a held Claude session returns when its work ends and the process is free", async () => {
  const target = vi.fn(async () => ({ available: false, reason: "session_in_use", runtime: "claude", session: "s1" }) as unknown);
  (window as unknown as { doan: { conversationResumeTarget: unknown } }).doan.conversationResumeTarget = target;
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (work: readonly WorkItem[]) => () => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work,
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
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const canvasPress = () => () => {};
  const tree = render(() => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work: [], canvasPress,
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

// The move's arrival comes with the render that still shows the canvas left behind, whose thread has no card; it waits
// for the receiving conversation instead of sending focus to the old composer.
test("a handoff arrival waits for the receiving canvas and conversation, then is applied once", async () => {
  const DRAFTS: Canvas = { path: ".doan/canvases/drafts.html", id: "drafts" };
  const entry: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: DRAFTS.path, id: "drafts", url: "d" }, { path: CANVAS.path, id: "checkout", url: "u" }] };
  const row = (conversationId: string, canvas: Canvas) => ({ conversationId, title: "t", owner: "doan", provider: "claude", fromHome: false, canvas,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" });
  const list = [row("c-src", DRAFTS), row("c-recv", CANVAS)] as never[];
  const card = { v: 1, conversationId: "c-recv", seq: 1, turnId: "r1", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Continue.", anchors: [], origin: { kind: "handoff", conversationId: "c-src", canvas: DRAFTS } };
  (window as unknown as { doan: Record<string, unknown> }).doan.readConversation = vi.fn(async ({ conversationId }: { conversationId: string }) => conversationId === "c-recv" ? { events: [card], lastSeq: 1, turn: "idle" } : { events: [], lastSeq: 0, turn: "idle" });
  vi.stubGlobal("document", { querySelector: () => null, hasFocus: () => true, querySelectorAll: () => [] });
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: DRAFTS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const onArrived = vi.fn();
  const arrival = { focus: "handoff" as const, seq: 7, handoff: { root: ROOT, canvas: CANVAS, conversationId: "c-recv" } };
  const panel = (canvas: Canvas) => () => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas }, canvasName: "x", project: "acme-web", entry, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival, onArrived,
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work: [],
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

// POSTMORTEM 2026-11-02: the panel's own start sends the Fast its switch shows, and its remembered choice carries no Fast.
test("a new conversation started from the panel sends the Fast it shows and remembers none", async () => {
  const { authStatus } = await import("../main/agentAuth/state");
  const start = vi.fn(async (_request: unknown) => ({ conversationId: "c9" }));
  Object.assign((window as unknown as { doan: Record<string, unknown> }).doan, {
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), startConversation: start,
    readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), listConversations: vi.fn(() => new Promise(() => {})),
  });
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  support.auth = { revision: 1, providers: [authStatus({ provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" }, { cli: "found", version: "supported", tools: "ready" }, 1)] };
  support.models = { [modelsKey(ROOT, "claude", 1)]: { models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"], fast: {} }] } };
  const onRemember = vi.fn();
  const panel = () => CanvasConversation({
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list: [], seen: new Set(),
    prefs: { lastProvider: "claude", fast: { claude: true } }, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work: [], onRemember,
  });
  const composer = dockedProps(render(panel))! as { picker: { effort: { ariaLabel: string } | null }; onSend(request: unknown): Promise<unknown> };
  expect(composer.picker.effort?.ariaLabel).toBe("Effort: default, Fast on");
  await composer.onSend({ text: "Go", anchors: [], attachments: [] });
  expect(start.mock.calls[0]![0]).toMatchObject({ mode: "new", runtime: "claude", model: "opus", fast: true });
  expect(onRemember).toHaveBeenCalled();
  for (const [choice] of onRemember.mock.calls) expect(choice).not.toHaveProperty("fast");
});

// The title menu lists every conversation of the canvas by latest activity, the shown one pressed;
// while it is open the order holds and a conversation that appears goes at the end.
test("the title menu keeps the order it opened with while open; a new conversation joins at the end", () => {
  const summary = (conversationId: string, lastActivityAt: string) => ({ conversationId, title: conversationId, owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt, preview: "" }) as const;
  let list: import("./conversationStore").ListView = [summary("a", "2026-11-01T00:01:00.000Z"), summary("b", "2026-11-01T00:02:00.000Z")];
  const calls = { ...window.doan, readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null) } as unknown as typeof window.doan;
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, remembered: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  run.select("a");
  const all = (node: ReactNode): ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
  };
  const draw = () => render(() => CanvasConversationTitle({ run, list, canvasName: "checkout", now: Date.parse("2026-11-01T00:05:00.000Z"), seen: new Set(), title: "a", current: "a", onPicked: vi.fn() }));
  const rows = (tree: ReactNode) => all(tree).filter(element => typeof element.props["className"] === "string" && (element.props["className"] as string).startsWith("doan-menu-item conv-item")).map(element => [element.props["value"], (element.props["className"] as string).endsWith(" current")]);
  const root = (tree: ReactNode) => all(tree).find(element => "onOpenChange" in element.props)!.props as { onOpenChange(open: boolean): void };
  let tree = draw();
  expect(rows(tree)).toEqual([["b", false], ["a", true]]);
  root(tree).onOpenChange(true);
  tree = draw();
  // a gets newer activity and c appears while the menu is open: a keeps its place, c goes last.
  list = [summary("a", "2026-11-01T00:04:00.000Z"), summary("b", "2026-11-01T00:02:00.000Z"), summary("c", "2026-11-01T00:03:00.000Z")];
  run.sync();
  tree = draw();
  expect(rows(tree)).toEqual([["b", false], ["a", true], ["c", false]]);
  // Closed and opened again: by latest activity.
  root(tree).onOpenChange(false);
  tree = draw();
  root(tree).onOpenChange(true);
  tree = draw();
  expect(rows(tree)).toEqual([["a", true], ["c", false], ["b", false]]);
});

// Conversations that appear while the menu is open keep the places they were drawn at: a later, more recent one goes
// after them, and their own activity moves nothing (B and its Delete must not move under the pointer).
test("rows added while the title menu is open keep their places across later list updates", () => {
  const summary = (conversationId: string, lastActivityAt: string) => ({ conversationId, title: conversationId, owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt, preview: "" }) as const;
  let list: import("./conversationStore").ListView = [summary("a", "2026-11-01T00:01:00.000Z")];
  const calls = { ...window.doan, readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null) } as unknown as typeof window.doan;
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, calls);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, remembered: () => null, changed: vi.fn() }, store, calls);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  const all = (node: ReactNode): ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
  };
  const draw = () => render(() => CanvasConversationTitle({ run, list, canvasName: "checkout", now: Date.parse("2026-11-01T00:09:00.000Z"), seen: new Set(), title: "a", current: "a", onPicked: vi.fn() }));
  const rows = (tree: ReactNode) => all(tree).filter(element => typeof element.props["className"] === "string" && (element.props["className"] as string).startsWith("doan-menu-item conv-item")).map(element => element.props["value"]);
  const root = (tree: ReactNode) => all(tree).find(element => "onOpenChange" in element.props)!.props as { onOpenChange(open: boolean): void };
  let tree = draw();
  root(tree).onOpenChange(true);
  tree = draw();
  expect(rows(tree)).toEqual(["a"]);
  list = [summary("a", "2026-11-01T00:01:00.000Z"), summary("b", "2026-11-01T00:02:00.000Z")];
  tree = draw();
  expect(rows(tree)).toEqual(["a", "b"]);
  list = [...list, summary("c", "2026-11-01T00:03:00.000Z")];
  tree = draw();
  expect(rows(tree)).toEqual(["a", "b", "c"]);
  list = [summary("a", "2026-11-01T00:01:00.000Z"), summary("b", "2026-11-01T00:04:00.000Z"), summary("c", "2026-11-01T00:03:00.000Z")];
  tree = draw();
  expect(rows(tree)).toEqual(["a", "b", "c"]);
  // A conversation deleted meanwhile leaves its place; the rest stay.
  list = [summary("a", "2026-11-01T00:01:00.000Z"), summary("c", "2026-11-01T00:03:00.000Z")];
  tree = draw();
  expect(rows(tree)).toEqual(["a", "c"]);
});

// The DockedComposer element the panel renders, found in its element tree (nothing below it renders here).
function composerProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const child of node) { const found = composerProps(child); if (found) return found; } return null; }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (typeof node.type === "function" && node.type.name === "DockedComposer") return node.props as Record<string, unknown>;
  return composerProps(node.props.children);
}

// The context ring's drawer: the panel subscribes to usage through its calls object (the main window's `window.doan`
// or the prototype window's preload) and hides it for a conversation that runs on the person's CLI profile.
test("the panel hands the ring usage from its calls object, hidden for a legacy external conversation", async () => {
  const doan = (window as unknown as { doan: Record<string, unknown> }).doan;
  let deliver: (entries: unknown[]) => void = () => {};
  const unsubscribe = vi.fn();
  doan.onAgentUsage = vi.fn((listener: (entries: unknown[]) => void) => { deliver = listener; return unsubscribe; });
  doan.readAgentUsage = vi.fn(async () => []);
  doan.readConversation = vi.fn(() => new Promise(() => {}));
  const summary = (owner: "doan" | "legacy-external") => ({ conversationId: "c1", root: ROOT, canvas: CANVAS, title: "t", provider: "claude", owner, fromHome: false, phase: "idle", updatedAt: "2026-11-01T14:00:00Z", lastSeq: 1 });
  for (const owner of ["doan", "legacy-external"] as const) {
    hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
    const list = [summary(owner)] as never;
    const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
    const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
    run.show({ root: ROOT, canvas: CANVAS });
    run.sync();
    run.select("c1");
    const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
    const panel = () => CanvasConversation({
      calls: window.doan as never, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
      prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
      onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
      onSettings: vi.fn(), onNotice: vi.fn(), work: [],
    });
    render(panel);
    const entries = [{ provider: "claude", inFlight: false }];
    deliver(entries);
    const usage = composerProps(render(panel))!.usage as { entries: unknown[]; hidden: boolean; read(trigger: string): void };
    expect(usage.entries).toEqual(entries);
    expect(usage.hidden).toBe(owner === "legacy-external");
    usage.read("open");
    expect(doan.readAgentUsage).toHaveBeenLastCalledWith("open");
  }
  expect(doan.onAgentUsage).toHaveBeenCalledTimes(2);
  for (const effect of hooks.effects) effect?.cleanup?.();
  expect(unsubscribe).toHaveBeenCalled();
});

// Before the list holds the shown conversation's summary its owner is unknown, so a legacy conversation's first frame
// would show a Doan connection's row and read on open: until the summary arrives the usage is hidden.
test("the ring's usage stays hidden until the shown conversation's summary arrives", () => {
  const doan = (window as unknown as { doan: Record<string, unknown> }).doan;
  doan.onAgentUsage = vi.fn(() => () => {});
  doan.readAgentUsage = vi.fn(async () => []);
  doan.readConversation = vi.fn(() => new Promise(() => {}));
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  const known = [{ conversationId: "c1", root: ROOT, canvas: CANVAS, title: "t", provider: "claude", owner: "legacy-external", fromHome: false, phase: "idle", updatedAt: "2026-11-01T14:00:00Z", lastSeq: 1 }] as never;
  const store = new ConversationStore({ list: () => known, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => known, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  run.select("c1");
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = (list: never) => () => CanvasConversation({
    calls: window.doan as never, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work: [],
  });
  const usage = (list: never) => (composerProps(render(panel(list)))!.usage as { hidden: boolean }).hidden;
  expect(run.view()).toMatchObject({ kind: "conversation", conversationId: "c1" });
  expect(usage([] as never)).toBe(true);
  expect(usage(known)).toBe(true);
});

// The props the panel hands its ConversationThread, found in its element tree.
function threadProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const child of node) { const found = threadProps(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if ((element.type as { render?: { name?: string } } | null)?.render?.name === "ConversationThread") return element.props;
  return threadProps(element.props.children);
}
const threadRef = (node: ReactNode) => threadProps(node)?.ref as { current: { scrollToItem(key: string): void; focusItem(key: string): boolean } | null } | undefined;

// A badge or sidebar entry (and the prototype window's badge, which has no arrival) asks the panel to show the waiting
// request: it opens the answer popover and focuses what it shows, without scrolling the thread.
test.each(["permission", "question"] as const)("an entry's request on a waiting %s opens the collapsed popover and focuses the earliest request, without a scroll", async kind => {
  const row = { conversationId: "c-wait", title: "t", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
    phase: "waiting", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" };
  const list = [row] as never;
  const at = (seq: number, payload: Record<string, unknown>) => ({ v: 1, conversationId: "c-wait", seq, turnId: "t1", at: "2026-11-01T00:00:00Z", ...payload });
  const ask = kind === "permission"
    ? at(3, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "a", label: "Allow", kind: "allow" }] })
    : at(3, { type: "question.request", requestId: "r1", questions: [{ id: "x", header: "Tone", question: "Which tone?", multiSelect: false, other: true, options: [{ label: "Plain" }] }] });
  const later = at(4, { type: "permission.request", requestId: "r2", tool: "Bash", summary: "pwd", options: [{ id: "a", label: "Allow", kind: "allow" }] });
  const events = [at(1, { type: "user.message", text: "Go", anchors: [] }), at(2, { type: "turn.started" }), ask, later];
  const doan = (window as unknown as { doan: Record<string, unknown> }).doan;
  doan.readConversation = vi.fn(async () => ({ events, lastSeq: 4, turn: "waitingPermission" }));
  vi.stubGlobal("document", { querySelector: () => null, hasFocus: () => true, querySelectorAll: () => [] });
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.request({ root: ROOT, canvas: CANVAS }, "c-wait", null);
  run.sync();
  await flush();
  store.collapsePopover("c-wait", ["r1", "r2"]);
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const panel = () => CanvasConversation({
    calls: window.doan as never, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
    prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), work: [],
  });
  const ref = threadRef(render(panel));
  const handle = { scrollToItem: vi.fn(), focusItem: vi.fn(() => true) };
  ref!.current = handle;
  // The entry, on the conversation already shown.
  run.request({ root: ROOT, canvas: CANVAS }, "c-wait", "permission");
  render(panel);
  await flush();
  render(panel);
  expect(handle.scrollToItem).not.toHaveBeenCalled();
  expect(handle.focusItem).toHaveBeenCalledWith(kind === "permission" ? "pt1:r1" : "Qr1");
  expect(store.popoverCollapsed("c-wait", ["r1", "r2"])).toBe(false);
});

// A handoff moves the screen with no window-focus condition, so a turn that ends while the person is in another app moves
// focus in the background; activation then restores the element focused before (POSTMORTEM 2026-11-17 'Window
// activation put focus on Hide sidebar'). The card, or the composer when no card is drawn, takes focus again on activation,
// only while its conversation shows.
test("a handoff arrival with the window in the background focuses the card or the composer again on activation, only while its conversation shows", async () => {
  const row = (conversationId: string) => ({ conversationId, title: "t", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" });
  const list = [row("c-recv"), row("c-other")] as never[];
  const card = { v: 1, conversationId: "c-recv", seq: 1, turnId: "r1", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Continue.", anchors: [], origin: { kind: "handoff", conversationId: "c-src", canvas: CANVAS } };
  const doan = (window as unknown as { doan: Record<string, unknown> }).doan;
  doan.readConversation = vi.fn(async ({ conversationId }: { conversationId: string }) => conversationId === "c-recv" ? { events: [card], lastSeq: 1, turn: "idle" } : { events: [], lastSeq: 0, turn: "idle" });
  const win = Object.assign(new EventTarget(), { doan });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { querySelector: () => null, hasFocus: () => false, querySelectorAll: () => [] });
  for (const { switched, drawn } of [{ switched: false, drawn: true }, { switched: true, drawn: true }, { switched: false, drawn: false }]) {
    hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
    const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
    const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
    run.show({ root: ROOT, canvas: CANVAS });
    run.request({ root: ROOT, canvas: CANVAS }, "c-recv", null);
    run.sync();
    await flush();
    const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
    let arrival: { focus: "handoff"; seq: number; handoff: { root: string; canvas: Canvas; conversationId: string } } | null = null;
    const panel = () => CanvasConversation({
      calls: window.doan as never, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
      prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival, onArrived: vi.fn(),
      onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
      onSettings: vi.fn(), onNotice: vi.fn(), work: [],
    });
    const tree = render(panel) as ReactElement<{ ref: { current: unknown } }>;
    const field = { focus: vi.fn() };
    tree.props.ref.current = { querySelector: (selector: string) => selector === ".composer-input" ? field : null };
    const ref = threadRef(tree);
    expect(ref).toBeDefined();
    const handle = { scrollToItem: vi.fn(), focusItem: vi.fn((_key: string) => drawn) };
    ref!.current = handle;
    arrival = { focus: "handoff", seq: 7, handoff: { root: ROOT, canvas: CANVAS, conversationId: "c-recv" } };
    render(panel);
    await flush();
    expect(handle.focusItem).toHaveBeenCalledOnce();
    expect(field.focus).toHaveBeenCalledTimes(drawn ? 0 : 1);
    const key = handle.focusItem.mock.calls[0]![0];
    if (switched) { run.select("c-other"); await flush(); }
    win.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(handle.focusItem).toHaveBeenCalledTimes(switched ? 1 : 3);
    expect(field.focus).toHaveBeenCalledTimes(drawn ? 0 : 3);
    for (const call of handle.focusItem.mock.calls) expect(call[0]).toBe(key);
  }
});

test("Edit and resend answered with the window in the background focuses the field again on activation, only while its conversation shows", async () => {
  const row = (conversationId: string) => ({ conversationId, title: "t", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
    phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "" });
  const list = [row("c1"), row("c2")] as never[];
  const at = (seq: number, payload: Record<string, unknown>) => ({ v: 1, conversationId: "c1", seq, turnId: "t1", at: "2026-11-01T00:00:00Z", ...payload });
  const doan = (window as unknown as { doan: Record<string, unknown> }).doan;
  doan.readConversation = vi.fn(async () => ({ events: [at(1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(2, { type: "turn.started" }), at(3, { type: "turn.done" })], lastSeq: 3, turn: "idle" }));
  const win = Object.assign(new EventTarget(), { doan });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { querySelector: () => null, hasFocus: () => false, querySelectorAll: () => [] });
  for (const switched of [false, true]) {
    hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
    const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
    const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
    run.show({ root: ROOT, canvas: CANVAS });
    run.request({ root: ROOT, canvas: CANVAS }, "c1", null);
    run.sync();
    await flush();
    const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
    const panel = () => CanvasConversation({
      calls: window.doan as never, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY, list, seen: new Set(),
      prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
      onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
      onSettings: vi.fn(), onNotice: vi.fn(), work: [],
    });
    const tree = render(panel) as ReactElement<{ ref: { current: unknown } }>;
    const field = { focus: vi.fn() };
    tree.props.ref.current = { querySelector: (selector: string) => selector === ".composer-input" ? field : null };
    (threadProps(tree)!.onEditAndResend as () => void)();
    await flush();
    expect(field.focus).toHaveBeenCalledOnce();
    if (switched) { run.select("c2"); await flush(); }
    win.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(field.focus).toHaveBeenCalledTimes(switched ? 1 : 3);
  }
});
