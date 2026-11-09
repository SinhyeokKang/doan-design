import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { CanvasRun } from "./canvasRun";
import { ConversationStore, type ListView } from "./conversationStore";
import { draftKey, EMPTY_DRAFT } from "./dockedRules";
import { DockedSupport } from "./dockedSupport";

// The composer's "Start a new conversation" is the host's onStartNew. Static markup has no clicks, so the composer is
// replaced by one that records its props for the test to press.
const composers = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./DockedComposer", async original => ({ ...await original<typeof import("./DockedComposer")>(), DockedComposer: (props: Record<string, unknown>) => { composers.push(props); return null; } }));
const { CanvasConversation } = await import("./CanvasConversationPanel");
const { TooltipProvider } = await import("./components/ui/tooltip");
type Props = Parameters<typeof CanvasConversation>[0];

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const summary = (conversationId: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId, title: "Payment copy", state: "current", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...extra,
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  composers.length = 0;
  vi.stubGlobal("window", { doan: {
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })),
    takeConversationDraft: vi.fn(async () => null), attachmentsFromPaths: vi.fn(async () => []), onAgentAuth: vi.fn(() => () => {}),
  } });
});
afterEach(() => vi.unstubAllGlobals());

async function panel(list: ListView, setup: (run: CanvasRun) => void = () => {}) {
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  setup(run);
  await flush();
  const props: Props = {
    run, support: new DockedSupport(() => {}), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY,
    list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  };
  renderToStaticMarkup(<TooltipProvider>{<CanvasConversation {...props} /> as ReactElement}</TooltipProvider>);
  return { run, store, composer: composers.at(-1)! };
}

test("a conversation another sign-in owns starts a new one on the same canvas with the refused draft in its field", async () => {
  const { run, store, composer } = await panel([summary("now")]);
  expect(run.view()).toMatchObject({ kind: "conversation", conversationId: "now" });
  const draft = { ...EMPTY_DRAFT, segments: textSegments("Tighten the payment copy") };
  store.setDrafts(drafts => new Map(drafts).set("conversation:now", draft));
  (composer.onStartNew as () => void)();
  expect(run.view()?.kind).toBe("new");
  expect(store.drafts.get(draftKey({ kind: "new", root: ROOT, canvas: CANVAS }))).toEqual(draft);
  expect(store.drafts.get("conversation:now") ?? EMPTY_DRAFT).toEqual(EMPTY_DRAFT);
});
