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
const { DockedSupport } = await import("./dockedSupport");

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
  render(panel([{ session: "s1", provider: "codex", root: "/w/other", path: ".doan/canvases/x.html" }]));
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
  const working: readonly WorkItem[] = [{ session: "s1", provider: "claude", root: ROOT, path: CANVAS.path }], none: readonly WorkItem[] = [];
  expect(resumeChoice(render(panel(working)))).toEqual({ offer: "claude", held: true });
  // The turn ends but the terminal's claude still runs: the session is still held, and not offered.
  render(panel(none));
  await flush();
  expect(target).toHaveBeenCalledTimes(2);
  expect(resumeChoice(render(panel(none)))).toBeNull();
  // The person quits claude and comes back to the window.
  target.mockResolvedValue({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  run.focusChanged();
  await flush();
  expect(target).toHaveBeenCalledTimes(3);
  expect(resumeChoice(render(panel(none)))).toEqual({ offer: "claude", held: false });
  // A runnable target is not asked again on later changes.
  run.focusChanged(); render(panel(working)); render(panel(none));
  await flush();
  expect(target).toHaveBeenCalledTimes(3);
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
  expect(resumeChoice(render(panel([{ session: "s1", provider: "claude", root: "/w/other", path: ".doan/canvases/x.html" }])))).toEqual({ offer: "claude", held: true });
  target.mockResolvedValue({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00", session: "s1" });
  render(panel([]));
  await flush();
  expect(resumeChoice(render(panel([])))).toEqual({ offer: "claude", held: false });
  // The new conversation the hold set stays the mode until the person picks the session.
  const view = run.view();
  expect(view?.kind === "new" ? view.start.mode : null).toBe("new");
});
