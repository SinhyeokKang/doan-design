import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { CanvasConversation, CanvasConversationTitle, canvasConversationTitle, canvasScope, linkedAt, queuedMessage, queuedText, startNewConversation, steerPhaseOf, type CanvasConversationProps } from "./CanvasConversationPanel";
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
const PICK = { pressed: false, enabled: true, reason: null, onToggle: () => {} };

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
    onLocate: vi.fn(async () => "shown" as const), pick: PICK, composerLink: { current: null }, onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [], ...patch,
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

// terminal-agent-activity (draft resume-disabled): while the linked session works in a terminal, its choice is disabled
// with the reason as its described line, and a new conversation is the mode, even over a resume chosen before.
test("a terminal session still working holds its choice with the reason; the composer starts a new conversation", async () => {
  resume = { available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" };
  const work = [{ session: "s1", provider: "codex" as const, root: "/w/other", path: ".doan/canvases/x.html" }];
  const out = await panel([], run => run.choose("resume"), { work });
  const card = out.match(/<label class="doan-panel ob-choice"[^>]*data-disabled=""[^>]*>.*?<\/label>/)?.[0] ?? "";
  expect(card).toContain("<strong>Continue the Codex session from your terminal</strong>");
  const id = card.match(/<small id="([^"]+)">Still working in your terminal\. You can continue it when it finishes\.<\/small>/)?.[1];
  expect(id).toBeTruthy();
  const radio = card.match(/<input [^>]*>/)?.[0] ?? "";
  expect(radio).toContain('name="canvas-resume"');
  expect(radio).toContain('disabled=""');
  expect(radio).toContain(`aria-describedby="${id}"`);
  expect(radio).not.toContain("checked");
  expect(card).not.toContain("Linked by doan check");
  expect(out).toMatch(/<input type="radio" name="canvas-resume" checked=""\/><span class="ob-radio" aria-hidden="true"><\/span><span class="ob-choice-text"><strong>Start a new conversation<\/strong>/);
  expect(out).not.toContain("set by the terminal session");
  expect(out).toContain('aria-placeholder="Ask, / for presets"');
});

// RD1: a Claude session that a live terminal process holds cannot run now (session_in_use), yet main still names it,
// so while it works its choice shows waiting with the reason. Not working, it is not offered.
test("a Claude session a terminal process holds shows its choice waiting while it works", async () => {
  resume = { available: false, reason: "session_in_use", runtime: "claude", session: "s1" };
  const work = [{ session: "s1", provider: "claude" as const, root: ROOT, path: CANVAS.path }];
  const out = await panel([], () => {}, { work });
  const card = out.match(/<label class="doan-panel ob-choice"[^>]*data-disabled=""[^>]*>.*?<\/label>/)?.[0] ?? "";
  expect(card).toContain("<strong>Continue the Claude Code session from your terminal</strong>");
  expect(card).toMatch(/<small id="[^"]+">Still working in your terminal\. You can continue it when it finishes\.<\/small>/);
  expect(card.match(/<input [^>]*>/)?.[0]).toContain('disabled=""');
  expect(out).toMatch(/<input type="radio" name="canvas-resume" checked=""\/><span class="ob-radio" aria-hidden="true"><\/span><span class="ob-choice-text"><strong>Start a new conversation<\/strong>/);
  expect(out).toContain('aria-placeholder="Ask, / for presets"');
  const idle = await panel([], () => {}, { work: [] });
  expect(idle).not.toContain('aria-label="How to continue"');
});

test("another session, or an anonymous one, working in a terminal leaves the choice as it is", async () => {
  resume = { available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" };
  const work = [{ session: "s2", provider: "codex" as const, root: ROOT, path: CANVAS.path }, { session: null, provider: null, root: ROOT, path: CANVAS.path }];
  const out = await panel([], () => {}, { work });
  expect(out).not.toContain("data-disabled");
  expect(out).toContain("<small>Linked by doan check at 14:02</small>");
  expect(out).toContain('aria-label="Model: set by the terminal session (Codex)"');
});

// permission-mode U1, RV-B ⚪6: a terminal session's mode is its own; the tray shows the fixed trigger, never the picker.
test("a terminal session shows the fixed Permission trigger and no picker", async () => {
  resume = { available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00" };
  const support = () => Object.assign(new DockedSupport(() => {}), { auth: { revision: 1, providers: [connected("claude")] } });
  const out = await panel([], () => {}, { support: support(), prefs: { permissions: { claude: "bypass" } } });
  expect(out).toContain('aria-label="Permission: set by the terminal session"');
  expect(out).not.toContain("data-mode=");
  resume = { available: false, reason: "no_record" };
  expect(await panel([], () => {}, { support: support(), prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="bypass"');
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

// canvas-composer-polish A2: the queue row shows the line; Send now shows the request itself, chips and files, in the thread.
test("a queued message keeps its request for the thread", () => {
  const anchors = [{ frame: { id: "cart", title: "Cart" } }];
  expect(queuedMessage("q1", { text: "Change {{1}}", anchors, attachments: [{ id: "f1" }], files: [{ name: "notes.pdf", size: 10, kind: "file" }] }))
    .toEqual({ id: "q1", text: "Change Cart", message: { text: "Change {{1}}", anchors, attachments: [{ name: "notes.pdf", size: 10, kind: "file" }] } });
  expect(queuedMessage("q2", { text: "Again", anchors: [], attachments: [] })).toEqual({ id: "q2", text: "Again", message: { text: "Again", anchors: [], attachments: [] } });
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
    onArrived={vi.fn()} onLocate={vi.fn(async () => "shown" as const)} pick={PICK} composerLink={{ current: null }} onSettings={vi.fn()} onNotice={vi.fn()} onOpenProjectConversation={vi.fn()} work={[]} /> as ReactElement}</TooltipProvider>);
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

// BV2 6p: main reads the list again right after a bind; the notice and what shows stay.
test("a promotion while the panel is open keeps New conversation with the notice and Open over later reads", async () => {
  const project = (extra: Partial<ConversationSummary> = {}) => { const { canvas: _canvas, ...rest } = summary("proj", extra); return rest as ConversationSummary; };
  let list: ListView = [project()];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  list = [summary("proj")];
  run.sync();
  list = [summary("proj", { lastActivityAt: "2026-11-01T00:01:00.000Z" })];
  run.sync();
  await flush();
  const props: CanvasConversationProps = {
    run, support: new DockedSupport(() => {}), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY,
    list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: PICK, composerLink: { current: null }, onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), work: [],
  };
  const out = renderToStaticMarkup(<TooltipProvider><CanvasConversation {...props} /></TooltipProvider>);
  expect(canvasConversationTitle(run, list).title).toBe("New conversation");
  expect(out).toContain("<span>A project conversation is now current on this canvas.</span>");
  expect(out).toContain('aria-label="Open the current conversation"');
});

// Dogfooding: New conversation as an icon button in the panel header, after the title menu (so left of Hide conversation).
test("the panel header offers New conversation next to the title menu", () => {
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }));
  const html = renderToStaticMarkup(<TooltipProvider><CanvasConversationTitle run={run} list={[]} canvasName="checkout" now={0} seen={new Set()} title="Payment copy" current="c1" onPicked={() => {}} /></TooltipProvider>);
  const title = html.indexOf("doan-conv-title"), button = html.indexOf('aria-label="New conversation"');
  expect(title).toBeGreaterThanOrEqual(0);
  expect(button).toBeGreaterThan(title);
  expect(html).toMatch(/<button type="button" class="doan-icon-button doan-conv-new" aria-label="New conversation"[^>]*><svg[^>]*lucide-square-pen/);
});

// N1 (conversation-delete orch decisions 1–2): on the new conversation state it does nothing.
test("New conversation selects a new conversation and focuses the composer, does nothing when already new, and only focuses while nothing shows", () => {
  const select = vi.fn(), focus = vi.fn();
  startNewConversation("c1", false, select, focus);
  expect(select).toHaveBeenCalledWith(null);
  expect(focus).toHaveBeenCalledTimes(1);
  select.mockClear(); focus.mockClear();
  startNewConversation(null, true, select, focus);
  expect(select).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
  startNewConversation(null, false, select, focus);
  expect(select).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);
});

// queue-send-now design §2.1: Send now shows only while a turn runs or waits for a permission answer.
test("steerPhaseOf reads the merged events first and the list after, as the composer's turn does", () => {
  const at = (type: string, extra: Record<string, unknown> = {}) => ({ type, turnId: "t1", ...extra }) as unknown as ConversationEvent;
  const started = at("turn.started"), working = at("activity", { summary: "Editing" });
  const asking = at("permission.request", { requestId: "r", summary: "Edit x", options: [] });
  const list = (patch: Partial<ConversationSummary>) => ({ phase: "ended", working: false, ...patch }) as ConversationSummary;
  expect(steerPhaseOf([started, working], undefined, true)).toBe("running");
  expect(steerPhaseOf([started, asking], undefined, true)).toBe("waiting");
  // Not held by this run: the list decides.
  expect(steerPhaseOf([started, working], list({ phase: "ended", working: false }), false)).toBe("ended");
  expect(steerPhaseOf(null, list({ phase: "running", working: true }), false)).toBe("running");
  expect(steerPhaseOf(null, list({ phase: "waiting" }), false)).toBe("waiting");
  // A judged turn with work left (a queue about to go out) has no turn to take the message.
  expect(steerPhaseOf(null, list({ phase: "ended", working: true }), false)).toBe("holding");
  // The events' end wins over a list that still says running.
  expect(steerPhaseOf([started, at("turn.done")], list({ phase: "running", working: true }), true)).toBe("holding");
  expect(steerPhaseOf([started, at("turn.done")], list({ phase: "running", working: false }), true)).toBe("ended");
});

