import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";

// The Overview's main conversation, run with hooks as plain state (the App tests' no-DOM style). A streamed delta leaves
// the store's host (App) alone, so the Overview redraws its thread by its own subscription to the conversation it shows.
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

const ROOT = "/code/doan", A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary: ConversationSummary = { conversationId: A, title: "Checkout copy", owner: "doan", provider: "claude",
  fromHome: true, phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p" };
let seq = 0;
const event = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId: "t1", at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  seq = 0;
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  const history = [event({ type: "user.message", text: "Draw the checkout", anchors: [] }), event({ type: "turn.started" })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" })),
    takeConversationDraft: vi.fn(async () => null),
    onAgentUsage: vi.fn(() => () => {}), readAgentUsage: vi.fn(async () => []), onAgentAuth: vi.fn(() => () => {}), onWindowVisible: vi.fn(() => () => {}),
    listConversationSkills: vi.fn(async () => ({ skills: [] })), listConversationModels: vi.fn(async () => ({ models: [] })),
  };
  vi.stubGlobal("window", { doan: { ...doan, designSkills: { list: vi.fn(async () => ({ v: 1, ok: true, result: { version: "1", presets: [] } })), get: vi.fn() } } });
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

test("a streamed delta redraws the Overview's thread without the host's changed", async () => {
  const list = [summary];
  const changed = vi.fn();
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed,
  }, window.doan);
  run.show(ROOT);
  run.select(ROOT, A);
  const support = new DockedSupport(() => {}, window.doan);
  const panel = () => ProjectOverview({
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  });
  render(panel);
  await flush();
  expect(agentTexts(render(panel))).toEqual([]);
  changed.mockClear();
  hooks.dirty = false;
  run.event(event({ type: "message.delta", messageId: "m1", text: "Hel" }));
  expect(changed).not.toHaveBeenCalled();
  expect(hooks.dirty).toBe(true);
  expect(agentTexts(render(panel))).toEqual(["Hel"]);
  run.event(event({ type: "message.delta", messageId: "m1", text: "lo" }));
  expect(agentTexts(render(panel))).toEqual(["Hello"]);
});
