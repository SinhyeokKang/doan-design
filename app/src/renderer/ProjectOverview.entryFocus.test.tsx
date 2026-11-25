import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { ConversationThreadHandle } from "./ConversationThread";

// The Overview's entry on a waiting conversation, hooks as plain state: it scrolls to the newest unanswered request and focuses
// its first choice (PRODUCT §5 item 3 'Project Overview', 'Questions').
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

const { ProjectOverview } = await import("./ProjectOverview");
const { OverviewRun } = await import("./overviewRun");
const { DockedSupport } = await import("./dockedSupport");

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const waiting: ConversationSummary = { conversationId: A, title: "Checkout copy", owner: "doan", provider: "claude",
  fromHome: true, phase: "waiting", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-23T00:00:00.000Z", preview: "p" };
const at = (seq: number, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq, turnId: "t1", at: "2026-11-23T00:00:00Z", ...payload } as ConversationEvent);
const asks = {
  permission: at(3, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run ls", options: [{ id: "a", label: "Allow", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }] }),
  question: at(3, { type: "question.request", requestId: "q1", questions: [{ id: "x", header: "Tone", question: "Which tone?", multiSelect: false, options: [{ label: "Plain" }, { label: "Warm" }] }] }),
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); };

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("document", { querySelector: () => null });
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

// The ref the Overview hands its ConversationThread, found in its element tree.
function threadRef(node: ReactNode): { current: ConversationThreadHandle | null } | null {
  if (Array.isArray(node)) { for (const child of node) { const found = threadRef(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if ((element.type as { render?: { name?: string } } | null)?.render?.name === "ConversationThread")
    return element.props.ref as { current: ConversationThreadHandle | null };
  return threadRef(element.props.children);
}

test.each(["permission", "question"] as const)("a waiting %s entry scrolls to the request and focuses its first choice", async kind => {
  const events = [at(1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(2, { type: "turn.started" }), asks[kind]];
  vi.stubGlobal("window", { doan: {
    readConversation: vi.fn(async () => ({ events, lastSeq: 3, turn: "waitingPermission" })),
    takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), onAgentUsage: vi.fn(() => () => {}),
    readAgentUsage: vi.fn(async () => []), listConversationSkills: vi.fn(async () => ({ skills: [] })),
  } });
  const list = [waiting];
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  }, window.doan);
  run.show(ROOT);
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const overview = () => ProjectOverview({
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-11-23T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  });
  // The row's (or toast's) entry: the conversation shows and its request is to be scrolled to once its history draws.
  run.request(ROOT, A, "permission");
  run.store.track(A);
  const ref = threadRef(render(overview));
  expect(ref).not.toBeNull();
  const handle = { scrollToItem: vi.fn(), focusItem: vi.fn(() => true) };
  ref!.current = handle;
  await flush();
  render(overview);
  expect(handle.scrollToItem).toHaveBeenCalledOnce();
  expect(handle.focusItem).toHaveBeenCalledExactlyOnceWith(handle.scrollToItem.mock.calls[0]![0]);
});

// The props the Overview hands its ConversationThread.
function threadProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) { for (const child of node) { const found = threadProps(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if ((element.type as { render?: { name?: string } } | null)?.render?.name === "ConversationThread") return element.props;
  return threadProps(element.props.children);
}

// A notification's or the strip's entry lands in the renderer before main raises the window, and a reply can come back
// after the person switched away; activation then restores the element focused before (POSTMORTEM 2026-11-17 'Window
// activation put focus on Hide sidebar'). Each focus is made again on activation, only while the same conversation shows.
function backgroundOverview(events: ConversationEvent[], list: ConversationSummary[]) {
  const win = Object.assign(new EventTarget(), { doan: {
    readConversation: vi.fn(async () => ({ events, lastSeq: events.length, turn: "idle" })),
    takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), onAgentUsage: vi.fn(() => () => {}),
    readAgentUsage: vi.fn(async () => []), listConversationSkills: vi.fn(async () => ({ skills: [] })),
  } });
  vi.stubGlobal("window", win);
  const field = { focus: vi.fn() };
  vi.stubGlobal("document", { querySelector: (selector: string) => selector === ".ov-main .composer-input" ? field : null, hasFocus: () => false, querySelectorAll: () => [] });
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  }, window.doan);
  run.show(ROOT);
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const overview = () => ProjectOverview({
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-11-23T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  });
  const activate = async () => { win.dispatchEvent(new Event("focus")); await flush(); };
  return { run, overview, field, activate };
}

test("a waiting entry with the window in the background focuses the request again on activation, only while it shows", async () => {
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  for (const switched of [false, true]) {
    hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
    const events = [at(1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(2, { type: "turn.started" }), asks.permission];
    const { run, overview, activate } = backgroundOverview(events, [waiting, { ...waiting, conversationId: B, phase: "ended" }]);
    run.request(ROOT, A, "permission");
    run.store.track(A);
    const ref = threadRef(render(overview));
    const handle = { scrollToItem: vi.fn(), focusItem: vi.fn(() => true) };
    ref!.current = handle;
    await flush();
    render(overview);
    expect(handle.focusItem).toHaveBeenCalledOnce();
    if (switched) { run.select(ROOT, B); render(overview); }
    await activate();
    expect(handle.focusItem).toHaveBeenCalledTimes(switched ? 1 : 3);
  }
});

test("Edit and resend answered with the window in the background focuses the field again on activation", async () => {
  const events = [at(1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(2, { type: "turn.started" }), at(3, { type: "turn.done" })];
  const { run, overview, field, activate } = backgroundOverview(events, [{ ...waiting, phase: "ended" }]);
  run.request(ROOT, A, null);
  run.store.track(A);
  render(overview);
  await flush();
  (threadProps(render(overview))!.onEditAndResend as () => void)();
  await flush();
  expect(field.focus).toHaveBeenCalledOnce();
  await activate();
  expect(field.focus).toHaveBeenCalledTimes(3);
});
