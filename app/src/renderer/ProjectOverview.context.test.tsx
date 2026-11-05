import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { DockedComposerProps } from "./DockedComposer";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// context-window-ring spec 1–4, design §3 on the Overview: the composer gets the shown conversation's last recorded
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
  const run = new OverviewRun(host);
  run.show(ROOT);
  const support = new DockedSupport(() => {});
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  const render = () => { renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>); return composer.props!.context; };
  return { run, render };
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
