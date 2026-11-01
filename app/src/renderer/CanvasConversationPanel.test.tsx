import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { CanvasConversation, canvasConversationTitle, canvasScope, linkedAt, queuedText, type CanvasConversationProps } from "./CanvasConversationPanel";
import { CanvasRun } from "./canvasRun";
import { TooltipProvider } from "./components/ui/tooltip";
import { ConversationStore, type ListView } from "./conversationStore";
import { DockedSupport } from "./dockedSupport";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";

function connected(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}

// buzz-canvas-conversation R2 (draft panel-states, panel-resume): what the panel draws for each state of its run.

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const summary = (conversationId: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId, title: "Payment copy", state: "current", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...extra,
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let resume: unknown;
beforeEach(() => {
  resume = { available: false, reason: "no_record" };
  vi.stubGlobal("window", { doan: {
    conversationResumeTarget: vi.fn(async () => resume), readConversation: vi.fn(async () => ({ error: "not_found" })),
    takeConversationDraft: vi.fn(async () => null), attachmentsFromPaths: vi.fn(async () => []),
  } });
});
afterEach(() => vi.unstubAllGlobals());

async function panel(list: ListView, setup: (run: CanvasRun) => void = () => {}, patch: Partial<CanvasConversationProps> = {}) {
  const lists = new Map<string, ListView>([[ROOT, list]]);
  const store = new ConversationStore({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  setup(run);
  await flush();
  const props: CanvasConversationProps = {
    run, support: new DockedSupport(() => {}), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY,
    list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(), onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), ...patch,
  };
  return renderToStaticMarkup(<TooltipProvider>{<CanvasConversation {...props} /> as ReactElement}</TooltipProvider>);
}

test("a list that can't be read says so with Retry, and the composer stays a new conversation", async () => {
  const out = await panel("error");
  expect(out).toContain("<b>Couldn’t read conversations</b><span>Try again. You can still start a new conversation.</span>");
  expect(out).toContain(">Retry</button>");
  expect(out).toContain('aria-placeholder="Ask, / for presets"');
});

test("a canvas with a terminal session offers it first, with the time doan check linked it", async () => {
  resume = { available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00" };
  const out = await panel([]);
  expect(out).toContain('role="radiogroup" aria-label="How to continue"');
  expect(out).toMatch(/<input type="radio" name="canvas-resume" checked=""\/><span class="ob-radio" aria-hidden="true"><\/span><span class="ob-choice-text"><strong>Continue the Codex session from your terminal<\/strong><small>Linked by doan check at 14:02<\/small>/);
  expect(out).toContain("<strong>Start a new conversation</strong><small>Uses Doan’s sign-in and your Settings defaults</small>");
  expect(out).toContain('aria-label="Model: set by the terminal session (Codex)"');
  expect(out).toContain('aria-placeholder="Reply, / for presets"');
});

test("restoring an archived conversation waits while the current one works, with Open", async () => {
  const out = await panel([summary("now", { phase: "running", working: true }), summary("old", { state: "archived" })], run => {
    run.select("old");
    run.store.setDrafts(drafts => new Map(drafts).set("conversation:old", { segments: textSegments("Align the totals too"), preset: null, attachments: [], shape: "capsule" }));
  });
  expect(out).toContain("<span>The current conversation on this canvas is still running.</span>");
  expect(out).toContain('aria-label="Open the running conversation"');
  expect(out).toMatch(/aria-label="Send"[^>]*disabled=""/);
});

test("a canvas outside the list keeps the draft in a field that takes no input, with the reason", async () => {
  const reason = "This canvas isn’t listed in acme-web, so its conversation can’t continue.";
  const out = await panel([summary("now")], () => {}, { blocked: reason });
  expect(out).toContain('aria-readonly="true"');
  expect(out).toContain(`<span>${reason}</span>`);
});

test("the shown time of a terminal link reads as the time of day, with the date when it was not today", () => {
  const now = Date.parse("2026-11-01T15:00:00");
  expect(linkedAt("2026-11-01T14:02:00", now)).toBe("14:02");
  expect(linkedAt("2026-10-30T09:05:00", now)).toBe("Oct 30, 09:05");
  expect(linkedAt(undefined, now)).toBeNull();
  expect(linkedAt("not a time", now)).toBeNull();
});

// Review BR2 R4: before the list answers, the panel does not know the busy line or the terminal session yet.
test("while the list is read, Send waits even with a draft and a signed-in agent", async () => {
  const support = new DockedSupport(() => {});
  support.setAuth({ revision: 1, providers: [connected("claude")] });
  const draft = (run: CanvasRun) => run.store.setDrafts(drafts => new Map(drafts).set(canvasScope({ root: ROOT, canvas: CANVAS }), { segments: textSegments("Fix the totals"), preset: null, attachments: [], shape: "capsule" }));
  // The same draft and agent send once the list and the terminal session answered.
  expect(await panel([], draft, { support })).not.toMatch(/aria-label="Send"[^>]*disabled=""/);
  expect(await panel("loading", draft, { support })).toMatch(/aria-label="Send"[^>]*disabled=""/);
});

// Review BR2 Y1: one-line places name chips; the wire text keeps its markers.
test("a queued message and the title before the list names the conversation show chip names", async () => {
  expect(queuedText({ text: "Change {{1}}", anchors: [{ frame: { id: "cart", title: "Cart" } }], attachments: [] })).toBe("Change Cart");
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  doan.readConversation!.mockResolvedValue({ events: [{ v: 1, conversationId: "s1", seq: 1, turnId: "t", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Make {{1}} quieter", anchors: [{ frame: { id: "cart", title: "Cart" } }] }], lastSeq: 1, turn: "idle" });
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.started({ root: ROOT, canvas: CANVAS }, "s1", "claude", run.revision());
  await flush();
  expect(canvasConversationTitle(run, []).title).toBe("Make Cart quieter");
});

// Re-review BR2 R4: ⌘N while the first list read is still loading, with the terminal session answering first, must
// not open Send before the list says whether the canvas's current conversation runs.
test("New while the list loads holds Send after the session answers, until the list shows the running current", async () => {
  resume = { available: false, reason: "no_record" };
  const lists = new Map<string, ListView>([[ROOT, "loading"]]);
  const store = new ConversationStore({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  const support = new DockedSupport(() => {});
  support.setAuth({ revision: 1, providers: [connected("claude")] });
  run.show({ root: ROOT, canvas: CANVAS });
  store.setDrafts(drafts => new Map(drafts).set(canvasScope({ root: ROOT, canvas: CANVAS }), { segments: textSegments("Fix the totals"), preset: null, attachments: [], shape: "capsule" }));
  run.select(null);
  await flush();
  const draw = () => renderToStaticMarkup(<TooltipProvider>{<CanvasConversation run={run} support={support} target={{ root: ROOT, canvas: CANVAS }} canvasName="checkout" project="acme-web" entry={ENTRY}
    list={lists.get(ROOT)!} seen={new Set()} prefs={null} defaults={null} now={Date.parse("2026-11-01T15:00:00")} blocked={null} frames={[]} locateDisabled={false} arrival={null}
    onArrived={vi.fn()} onLocate={vi.fn()} onSettings={vi.fn()} onNotice={vi.fn()} onOpenProjectConversation={vi.fn()} /> as ReactElement}</TooltipProvider>);
  expect(run.view()).toMatchObject({ kind: "new" });
  expect(draw()).toMatch(/aria-label="Send"[^>]*disabled=""/);
  lists.set(ROOT, [summary("now", { phase: "running", working: true })]);
  run.sync();
  // The canvas's current conversation shows by default; New again keeps the draft and shows its busy line.
  run.select(null);
  const out = draw();
  expect(out).toMatch(/aria-label="Send"[^>]*disabled=""/);
  expect(out).toContain("<span>The current conversation on this canvas is still running.</span>");
});
