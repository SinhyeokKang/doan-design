import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { draftKey, EMPTY_DRAFT } from "./dockedRules";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";

// The composer's "Start a new conversation" is the host's onStartNew. Static markup has no clicks, so the composer is
// replaced by one that records its props for the test to press.
const composers = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./DockedComposer", async original => ({ ...await original<typeof import("./DockedComposer")>(), DockedComposer: (props: Record<string, unknown>) => { composers.push(props); return null; } }));
const { ProjectOverview } = await import("./ProjectOverview");
const { TooltipProvider } = await import("./components/ui/tooltip");
type Props = Parameters<typeof ProjectOverview>[0];

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary: ConversationSummary = { conversationId: A, title: "Checkout copy", state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p" };

beforeEach(() => {
  composers.length = 0;
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null) } });
});
afterEach(() => vi.unstubAllGlobals());

function setup(list: ListView) {
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host);
  run.show(ROOT);
  run.select(ROOT, A);
  const props: Props = {
    run, support: new DockedSupport(() => {}), root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  return { run, composer: composers.at(-1)! };
}

test("a conversation another sign-in owns starts a new one on the same Overview with the refused draft in its field", () => {
  const { run, composer } = setup([summary]);
  expect(run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  const draft = { ...EMPTY_DRAFT, segments: textSegments("Fix the totals") };
  run.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, draft));
  (composer.onStartNew as () => void)();
  expect(run.view(ROOT).kind).toBe("new");
  expect(run.drafts.get(draftKey({ kind: "new", root: ROOT }))).toEqual(draft);
  expect(run.drafts.get(`conversation:${A}`) ?? EMPTY_DRAFT).toEqual(EMPTY_DRAFT);
});
