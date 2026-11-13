import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { DockedComposerProps } from "./DockedComposer";
import { composerAction } from "./composerRules";
import { deleteAvailability } from "./conversationDelete";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// On the Overview: the composer gets the shown conversation's last recorded
// context value, a live one as it arrives, and none in the new conversation state or before the thread exists.
const composer = vi.hoisted(() => ({ props: null as DockedComposerProps | null }));
vi.mock("./DockedComposer", async original => ({
  ...await original<typeof import("./DockedComposer")>(),
  DockedComposer: (props: DockedComposerProps) => { composer.props = props; return null; },
}));

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary = (conversationId: string): ConversationSummary => ({ conversationId, title: "Checkout copy", state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p" });
const at = (conversationId: string, seq: number, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId, seq, turnId: "t1", at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const history = (conversationId: string, used: number | null) => [at(conversationId, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(conversationId, 2, { type: "turn.started" }),
  ...used === null ? [] : [at(conversationId, 3, { type: "context.usage", used, size: 200_000 })], at(conversationId, 4, { type: "turn.done" })];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let reads: Record<string, ConversationEvent[]>;
beforeEach(() => {
  composer.props = null;
  reads = { [A]: history(A, 84_000), [B]: history(B, null) };
  vi.stubGlobal("window", { doan: {
    readConversation: vi.fn(async ({ conversationId }: { conversationId: string }) => ({ events: reads[conversationId]!, lastSeq: reads[conversationId]!.at(-1)!.seq, turn: "idle" })),
    takeConversationDraft: vi.fn(async () => null),
  } });
});
afterEach(() => vi.unstubAllGlobals());

function setup(list: ListView) {
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host, window.doan);
  run.show(ROOT);
  const support = new DockedSupport(() => {}, window.doan);
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  const html = () => renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  const render = () => { html(); return composer.props!.context; };
  return { run, render, html };
}

test("the shown conversation's last value, a live one, another conversation's own, and none before a thread or for a new one", async () => {
  const { run, render } = setup([summary(A), summary(B)]);
  run.select(ROOT, A);
  // Before the read settles the thread is missing or still empty.
  expect(render()).toBeNull();
  run.store.track(A);
  await flush();
  expect(render()).toEqual({ value: 42, percent: 42, used: 84_000, size: 200_000 });
  run.event(at(A, 5, { type: "turn.started" }));
  run.event(at(A, 6, { type: "context.usage", used: 150_000, size: 200_000 }));
  expect(render()).toMatchObject({ percent: 75 });
  run.select(ROOT, B);
  run.store.track(B);
  await flush();
  expect(render()).toBeNull();
  run.select(ROOT, null);
  expect(render()).toBeNull();
});

// The Overview passes its thread the same turn indicator the canvas panel does (CanvasConversationPanel
// test of the same name): the store's stage for the live turn, the event rule without one, nothing once it ended.
test("the thread shows the live turn's indicator from the store's stage, and none once the turn ended", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const { run, html } = setup([{ ...summary(A), phase: "running", working: true }]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  expect(html()).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
  run.store.stage({ conversationId: A, turnId: "t1", seq: 2, rev: 1, stage: { kind: "thinking" } });
  expect(html()).toContain('<span class="ti-text ti-shimmer">Claude Code is thinking</span>');
  run.event(at(A, 3, { type: "turn.done" }));
  expect(html()).not.toContain("ti-reply");
});

// The Overview follows the canvas panel's rules (CanvasConversationPanel test of the same name): a Stop main took hides
// the indicator at once, and a done turn's background work shows its line until the next message enters.
test("a taken Stop hides the indicator at once; a done turn's background work shows its line until the next message", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const list: ConversationSummary[] = [{ ...summary(A), phase: "running", working: true, stopping: true }];
  const { run, html } = setup(list);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  expect(html()).not.toContain("ti-reply");
  list[0] = { ...summary(A), phase: "running", working: true };
  expect(html()).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
  run.event(at(A, 3, { type: "turn.done" }));
  list[0] = { ...summary(A), background: { turnId: "t1" } };
  expect(html()).toContain("Background work is still running. It stops when you send your next message or press Stop.");
  expect(html()).toContain('aria-label="Stop background work"');
  run.event({ ...at(A, 4, { type: "user.message", text: "Now the cart", anchors: [] }), turnId: "t2" } as ConversationEvent);
  expect(html()).not.toContain("Background work is still running");
});

// R1 defect 2: on an existing conversation's next turn main pushes the person's message and turn.started separately;
// the render that draws the message already has the indicator (spec condition 1).
test("the next turn's indicator is in the render that draws the person's message", async () => {
  const { run, html } = setup([summary(A)]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  expect(html()).not.toContain("ti-reply");
  const next = (seq: number, payload: Record<string, unknown>) => ({ ...at(A, seq, payload), turnId: "t2" } as ConversationEvent);
  run.event(next(5, { type: "user.message", text: "Now the cart", anchors: [] }));
  expect(html()).toContain("Now the cart");
  expect(html()).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
  run.event(next(6, { type: "turn.started" }));
  expect(html()).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
});

// The thread's last activity row follows the indicator: a Claude tool's row spins until the general stage main sends with
// the tool's result (same seq), and is its step count from that render on.
test("a Claude tool's row stops spinning in the render its result's general stage arrives", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const { run, html } = setup([{ ...summary(A), phase: "running", working: true }]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  run.event(at(A, 3, { type: "activity", kind: "command", summary: "Running a command" }));
  expect(html()).toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
  run.store.stage({ conversationId: A, turnId: "t1", seq: 3, rev: 1, stage: { kind: "general" } });
  const out = html();
  expect(out).toContain("<span>1 step</span>");
  expect(out).not.toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
  expect(out).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
});

// Send now's message stays in flight until the agent reads it, which Claude does once its tool ended: meanwhile the row
// and the indicator are judged above that message, so both keep naming the running tool, and the indicator stays below it.
test("a Send now message in flight under a running Claude tool keeps the row spinning and the indicator on the tool", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const { run, html } = setup([{ ...summary(A), phase: "running", working: true }]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  run.event(at(A, 3, { type: "activity", kind: "command", summary: "Running a command" }));
  run.store.queued(ROOT, A, { id: "q1", text: "Now the cart" });
  (window.doan as Record<string, unknown>).sendQueuedNow = vi.fn(() => new Promise(() => {}));
  void run.store.sendQueuedNow(A, "q1");
  const out = html();
  expect(out).toContain("msg-sending");
  expect(out).toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
  expect(out).toContain('<span class="ti-text ti-shimmer">Running a command</span>');
  expect(out.indexOf("msg-sending")).toBeLessThan(out.indexOf('<span class="ti-text ti-shimmer">'));
  run.store.stage({ conversationId: A, turnId: "t1", seq: 3, rev: 1, stage: { kind: "general" } });
  const after = html();
  expect(after).toContain("<span>1 step</span>");
  expect(after).not.toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
  expect(after).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
});

// An ACP activity arrives as conversation:event once its tool completed, and its stage separately as conversation:stage.
test("an ACP activity's row never spins in the render its event arrives alone; a running tool's stage then spins it", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const { run, html } = setup([{ ...summary(A), provider: "copilot", phase: "running", working: true }]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  run.event(at(A, 3, { type: "activity", kind: "read", path: `${ROOT}/a.ts`, summary: "a.ts" }));
  expect(html()).toContain("<span>1 step</span>");
  expect(html()).not.toContain('<span class="doan-spinner" aria-hidden="true"></span><span>');
  run.store.stage({ conversationId: A, turnId: "t1", seq: 3, rev: 1, stage: { kind: "tool", activity: "command", summary: "Running a command" } });
  expect(html()).toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
  run.store.stage({ conversationId: A, turnId: "t1", seq: 3, rev: 2, stage: { kind: "general" } });
  expect(html()).toContain("<span>1 step</span>");
  expect(html()).not.toContain('<span class="doan-spinner" aria-hidden="true"></span><span>');
});

// A project turn's end while main still judges it (the list still says working): the composer holds, so it offers a
// disabled Send rather than Stop from the render the end arrives; text queues, and Delete stays unavailable.
test("a project turn's turn.done while the list still says working holds the composer in that same render", async () => {
  reads[A] = [at(A, 1, { type: "user.message", text: "Draw the checkout", anchors: [] }), at(A, 2, { type: "turn.started" })];
  const working = { ...summary(A), phase: "running" as const, working: true };
  const { run, html } = setup([working]);
  run.select(ROOT, A);
  run.store.track(A);
  await flush();
  html();
  expect(composer.props!.turn).toBe("running");
  run.event(at(A, 3, { type: "turn.done" }));
  html();
  expect(composer.props!.turn).toBe("holding");
  expect(composer.props!.sendNow).toBe(false);
  expect(composerAction(composer.props!.turn, "", composer.props!.queued.length)).toBe("send");
  expect(composerAction(composer.props!.turn, "Now the cart", composer.props!.queued.length)).toBe("queue");
  run.store.queued(ROOT, A, { id: "q1", text: "Now the cart" });
  html();
  expect(composerAction(composer.props!.turn, "", composer.props!.queued.length)).toBe("stop");
  // The list's phase may already say ended; its work flag still keeps Delete unavailable with the same reason.
  expect(deleteAvailability({ ...working, phase: "ended" })).toEqual({ available: false, reason: "The agent is working on this conversation." });
});
