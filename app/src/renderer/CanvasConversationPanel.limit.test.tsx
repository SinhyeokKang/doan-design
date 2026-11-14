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

// The canvas panel at the usage limit: the composer gets the limit and the schedule, a scheduled send becomes a row, and
// the scheduled rows main holds are read in. Static markup has no clicks, so the composer records its props.
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
const AT = new Date(Date.now() + 3_600_000).toISOString();
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  composers.length = 0;
  vi.stubGlobal("window", { doan: {
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), readConversation: vi.fn(async () => ({ error: "not_found" })),
    takeConversationDraft: vi.fn(async () => null), scheduledMessages: vi.fn(async () => [{ itemId: "s0", text: "Earlier", anchors: [], attachments: [] }]), sendConversation: vi.fn(async () => ({ scheduled: { itemId: "s1", at: AT } })), attachmentsFromPaths: vi.fn(async () => []), onAgentAuth: vi.fn(() => () => {}),
  } });
});
afterEach(() => vi.unstubAllGlobals());

async function panel(list: ListView, setup: (run: CanvasRun) => void = () => {}, picks: (support: DockedSupport) => void = () => {}) {
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  setup(run);
  await flush();
  const support = new DockedSupport(() => {}, window.doan);
  picks(support);
  const props: Props = {
    calls: window.doan, run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY,
    list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
    onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  };
  renderToStaticMarkup(<TooltipProvider>{<CanvasConversation {...props} /> as ReactElement}</TooltipProvider>);
  return { run, store, composer: composers.at(-1)! };
}

test("the composer gets the limit and the schedule, with no Send now", async () => {
  const { composer } = await panel([summary("now", { queued: 1, limitResetsAt: AT, scheduledAt: AT })]);
  expect(composer).toMatchObject({ limitResetsAt: AT, scheduledFor: AT, sendNow: false });
});

test("a send main scheduled becomes a row and carries no picker change; main's scheduled rows are read in", async () => {
  const list = [summary("now", { queued: 1, limitResetsAt: AT, scheduledAt: AT, permissionMode: "acceptEdits" })];
  const { store, composer } = await panel(list);
  expect(store.queue("now").map(row => row.id)).toEqual(["s0"]);
  const outcome = await (composer.onSend as (request: unknown) => Promise<unknown>)({ text: "Tighten it", anchors: [], attachments: [] });
  expect(outcome).toEqual({ ok: true, itemId: "s1" });
  const sent = (window as unknown as { doan: { sendConversation: ReturnType<typeof vi.fn> } }).doan.sendConversation.mock.calls[0]![0];
  expect(sent).toEqual({ conversationId: "now", text: "Tighten it", anchors: [] });
  expect(store.queue("now").map(row => row.id)).toEqual(["s0", "s1"]);
});

// Fix round 1: leaving the canvas while its schedule goes out and comes back at the same time and count still reads
// main's rows again on return; the list reads in between run while the canvas is not shown.
test("a schedule that went out and came back while the canvas was away is read again on return", async () => {
  const OTHER: Canvas = { path: ".doan/canvases/cart.html", id: "cart" };
  let list: ListView = [summary("now", { queued: 1, limitResetsAt: AT, scheduledAt: AT })];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store, window.doan);
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  expect(doan.scheduledMessages).toHaveBeenCalledTimes(1);
  run.show({ root: ROOT, canvas: OTHER });
  list = [summary("now", { phase: "running", working: true, queued: 0 })];
  run.sync();
  list = [summary("now", { queued: 1, limitResetsAt: AT, scheduledAt: AT })];
  run.sync();
  doan.scheduledMessages = vi.fn(async () => [{ itemId: "s9", text: "Again", anchors: [], attachments: [] }]);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  expect(doan.scheduledMessages).toHaveBeenCalledTimes(1);
  expect(store.queue("now").map(row => row.id)).toEqual(["s9"]);
});

test("the panel's waiting send carries no pick, and the next ordinary send still does", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  const choose = (support: DockedSupport) => support.pick("conversation:now", { effort: "high", fast: false, permissionMode: "acceptEdits" });
  const limited = await panel([summary("now", { model: "opus", fast: true, limitResetsAt: AT })], () => {}, choose);
  await (limited.composer.onSend as (request: unknown) => Promise<unknown>)({ text: "Tighten it", anchors: [], attachments: [] });
  expect(doan.sendConversation!.mock.calls.at(-1)![0]).toEqual({ conversationId: "now", text: "Tighten it", anchors: [] });
  doan.sendConversation = vi.fn(async () => undefined);
  const ordinary = await panel([summary("now", { model: "opus", fast: true })], () => {}, choose);
  await (ordinary.composer.onSend as (request: unknown) => Promise<unknown>)({ text: "Tighten it", anchors: [], attachments: [] });
  expect(doan.sendConversation.mock.calls.at(-1)![0]).toMatchObject({ conversationId: "now", fast: false, permissionMode: "acceptEdits" });
});

