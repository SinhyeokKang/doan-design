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
import { suggestedPrompts, type SuggestedPrompt } from "./homeComposer";
import { SuggestionButton } from "./ComposerParts";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";

function connected(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const summary = (conversationId: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId, title: "Payment copy", owner: "doan", provider: "claude", fromHome: false, canvas: CANVAS,
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
  const store = new ConversationStore({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  setup(run);
  await flush();
  const props: CanvasConversationProps = {
    calls: window.doan, run, support: new DockedSupport(() => {}, window.doan), target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme-web", entry: ENTRY,
    list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
    onLocate: vi.fn(async () => "shown" as const), pick: PICK, composerLink: { current: null }, onSettings: vi.fn(), onNotice: vi.fn(), work: [], ...patch,
  };
  return renderToStaticMarkup(<TooltipProvider>{<CanvasConversation {...props} /> as ReactElement}</TooltipProvider>);
}

test("a pending first list read mounts an empty loading status", async () => {
  expect(await panel("loading")).toContain('<div class="thread-loading" role="status"></div>');
});

test("a list that can't be read says so with Retry, and the composer stays a new conversation", async () => {
  const out = await panel("error");
  expect(out).toContain("<span class=\"strip-text selectable\"><b>Couldn’t read conversations</b><span>Try again. You can still start a new conversation.</span>");
  expect(out).toContain(">Retry</button>");
  expect(out).toContain('aria-placeholder="Ask, / for presets"');
});

// The thread notice's Retry is busy while the run reads the list again; a repeated failure is read out again.
test("the thread notice's Retry runs while the list is read again, and a repeated failure changes its line", async () => {
  const running = await panel("error", run => { run.listRetry = () => ({ running: true, failures: 0 }); });
  expect(running).toMatch(/<span class="strip-actions"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-disabled="true" aria-busy="true"><span class="doan-spinner" aria-hidden="true"><\/span>Retry<\/button><\/span>/);
  const again = await panel("error", run => { run.listRetry = () => ({ running: false, failures: 1 }); });
  expect(again).toContain("<span>Try again. You can still start a new conversation.\u00a0</span>");
});

// No drawing preview: a project conversation's turn drawing this canvas leaves the new conversation state as it is,
// as a canvas conversation's handoff target does (PRODUCT §5 item 2 'Handoff').
test("a project conversation drawing this canvas leaves the new conversation state open for input", async () => {
  const { canvas: _canvas, ...project } = summary("proj", { phase: "running", working: true });
  const out = await panel([project]);
  expect(out).not.toContain("A project conversation is drawing this canvas");
  expect(out).not.toMatch(/class="cp-foot"[^>]*(inert|disabled)/);
  expect(out).toContain('contentEditable="true"');
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

// While the linked session works in a terminal, its choice is disabled with the reason as its described line, and a new
// conversation is the mode, even over a resume chosen before.
test("a terminal session still working holds its choice with the reason; the composer starts a new conversation", async () => {
  resume = { available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00", session: "s1" };
  const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "codex" as const, root: "/w/other", path: ".doan/canvases/x.html" }];
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

// A Claude session that a live terminal process holds cannot run now (session_in_use), yet main still names it,
// so while it works its choice shows waiting with the reason. Not working, it is not offered.
test("a Claude session a terminal process holds shows its choice waiting while it works", async () => {
  resume = { available: false, reason: "session_in_use", runtime: "claude", session: "s1" };
  const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "claude" as const, root: ROOT, path: CANVAS.path }];
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
  const work = [{ touched: 0, turn: "none:t", session: "s2", provider: "codex" as const, root: ROOT, path: CANVAS.path }, { touched: 0, turn: "none:t", session: null, provider: null, root: ROOT, path: CANVAS.path }];
  const out = await panel([], () => {}, { work });
  expect(out).not.toContain("data-disabled");
  expect(out).toContain("<small>Linked by doan check at 14:02</small>");
  expect(out).toContain('aria-label="Model: set by the terminal session (Codex)"');
});

// The new conversation's suggestion rows highlight the canvas name inside the same sentence.
test("a new conversation's suggestion rows highlight the canvas name and show the sentence in the shared tooltip", async () => {
  const presets = (["critique", "polish"] as const).map(id => ({ id, title: id, description: `About ${id}.`, scope: `${id} scope`, group: "review" }));
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { auth: { revision: 1, providers: [connected("claude")] }, presets: { v: 1 as const, ok: true as const, result: { version: "1", presets } } });
  const out = await panel([], () => {}, { support });
  expect(out).not.toContain('title="Review the checkout canvas"');
  expect(out).toMatch(/<button type="button" class="suggestion" data-state="closed" data-slot="tooltip-trigger"><span class="suggestion-icon">/);
  expect(out).toContain('<span class="suggestion-label">Review the <span class="suggestion-value">checkout</span> canvas</span>');
  expect(out).toContain('<span class="suggestion-label">Polish the <span class="suggestion-value">checkout</span> canvas</span>');
});

// The rows are the shared SuggestionButton, so the three surfaces cannot drift apart again.
const suggestionButtons = (html: string) => html.match(/<button type="button" class="suggestion".*?<\/button>/g) ?? [];
const sharedSuggestions = (prompts: readonly SuggestedPrompt[]) => prompts.flatMap(prompt => suggestionButtons(renderToStaticMarkup(<TooltipProvider><SuggestionButton prompt={prompt} onPick={() => {}} /></TooltipProvider>)));
test("the panel's suggested prompts are the shared suggestion button", async () => {
  const presets = (["critique", "polish"] as const).map(id => ({ id, title: id, description: `About ${id}.`, scope: `${id} scope`, group: "review" }));
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { auth: { revision: 1, providers: [connected("claude")] }, presets: { v: 1 as const, ok: true as const, result: { version: "1", presets } } });
  const prompts = suggestedPrompts(ENTRY, "acme-web", presets);
  expect(prompts.length).toBeGreaterThan(0);
  expect(suggestionButtons(await panel([], () => {}, { support }))).toEqual(sharedSuggestions(prompts));
});

// A terminal session's mode is its own; the tray shows the fixed trigger, never the picker.
test("a terminal session shows the fixed Permission trigger and no picker", async () => {
  resume = { available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00" };
  const support = () => Object.assign(new DockedSupport(() => {}, window.doan), { auth: { revision: 1, providers: [connected("claude")] } });
  const out = await panel([], () => {}, { support: support(), prefs: { permissions: { claude: "bypass" } } });
  expect(out).toContain('aria-label="Permission: set by the terminal session"');
  expect(out).not.toContain("data-mode=");
  resume = { available: false, reason: "no_record" };
  expect(await panel([], () => {}, { support: support(), prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="bypass"');
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

// Before the list answers, the panel does not know the busy line or the terminal session yet.
test("while the list is read, Send waits even with a draft and a signed-in agent", async () => {
  const support = new DockedSupport(() => {}, window.doan);
  support.setAuth({ revision: 1, providers: [connected("claude")] });
  const draft = (run: CanvasRun) => run.store.setDrafts(drafts => new Map(drafts).set(canvasScope({ root: ROOT, canvas: CANVAS }), { segments: textSegments("Fix the totals"), preset: null, attachments: [], shape: "capsule" }));
  // The same draft and agent send once the list and the terminal session answered.
  expect(await panel([], draft, { support })).not.toMatch(/aria-label="Send"[^>]*disabled=""/);
  expect(await panel("loading", draft, { support })).toMatch(/aria-label="Send"[^>]*disabled=""/);
});

// One-line places name chips; the wire text keeps its markers.
test("a queued message and the title before the list names the conversation show chip names", async () => {
  expect(queuedText({ text: "Change {{1}}", anchors: [{ frame: { id: "cart", title: "Cart" } }], attachments: [] })).toBe("Change Cart");
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  doan.readConversation!.mockResolvedValue({ events: [{ v: 1, conversationId: "s1", seq: 1, turnId: "t", at: "2026-11-01T00:00:00Z", type: "user.message", text: "Make {{1}} quieter", anchors: [{ frame: { id: "cart", title: "Cart" } }] }], lastSeq: 1, turn: "idle" });
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.started({ root: ROOT, canvas: CANVAS }, "s1", "claude", run.revision());
  await flush();
  expect(canvasConversationTitle(run, []).title).toBe("Make Cart quieter");
});

// A conversation a provider command started has no title until a message: "Conversation" stands in, but only once its
// history shows that; while it is still read the title stays empty.
test("the title before the list names it: empty while the history is read, Conversation for a command alone", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  let answer!: (reply: unknown) => void;
  doan.readConversation!.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
  const store = new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, store, window.doan);
  run.show({ root: ROOT, canvas: CANVAS });
  run.started({ root: ROOT, canvas: CANVAS }, "s2", "claude", run.revision());
  await flush();
  expect(canvasConversationTitle(run, []).title).toBe("");
  answer({ events: [{ v: 1, conversationId: "s2", seq: 1, turnId: "t", at: "2026-11-01T00:00:00Z", type: "user.message", text: "/compact", anchors: [] }], lastSeq: 1, turn: "idle" });
  await flush();
  expect(canvasConversationTitle(run, []).title).toBe("Conversation");
});

// The queue row shows the line; Send now shows the request itself, chips and files, in the thread.
test("a queued message keeps its request for the thread", () => {
  const anchors = [{ frame: { id: "cart", title: "Cart" } }];
  expect(queuedMessage("q1", { text: "Change {{1}}", anchors, attachments: [{ id: "f1" }], files: [{ name: "notes.pdf", size: 10, kind: "file", path: "/Users/ada/notes.pdf" }] }))
    .toEqual({ id: "q1", text: "Change Cart", message: { text: "Change {{1}}", anchors, attachments: [{ name: "notes.pdf", size: 10, kind: "file", path: "/Users/ada/notes.pdf" }] } });
  expect(queuedMessage("q2", { text: "Again", anchors: [], attachments: [] })).toEqual({ id: "q2", text: "Again", message: { text: "Again", anchors: [], attachments: [] } });
});

// A new conversation runs beside the others, so ⌘N while the first list read is still loading sends once the terminal
// session answered; nothing waits for the list.
test("New while the list loads sends once the session answers, and again beside a running conversation", async () => {
  resume = { available: false, reason: "no_record" };
  const lists = new Map<string, ListView>([[ROOT, "loading"]]);
  const store = new ConversationStore({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  const run = new CanvasRun({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, remembered: () => null, changed: vi.fn() }, store, window.doan);
  const support = new DockedSupport(() => {}, window.doan);
  support.setAuth({ revision: 1, providers: [connected("claude")] });
  run.show({ root: ROOT, canvas: CANVAS });
  store.setDrafts(drafts => new Map(drafts).set(canvasScope({ root: ROOT, canvas: CANVAS }), { segments: textSegments("Fix the totals"), preset: null, attachments: [], shape: "capsule" }));
  run.select(null);
  await flush();
  const draw = () => renderToStaticMarkup(<TooltipProvider>{<CanvasConversation calls={window.doan} run={run} support={support} target={{ root: ROOT, canvas: CANVAS }} canvasName="checkout" project="acme-web" entry={ENTRY}
    list={lists.get(ROOT)!} seen={new Set()} prefs={null} defaults={null} now={Date.parse("2026-11-01T15:00:00")} blocked={null} frames={[]} locateDisabled={false} arrival={null}
    onArrived={vi.fn()} onLocate={vi.fn(async () => "shown" as const)} pick={PICK} composerLink={{ current: null }} onSettings={vi.fn()} onNotice={vi.fn()} work={[]} /> as ReactElement}</TooltipProvider>);
  expect(run.view()).toMatchObject({ kind: "new" });
  expect(draw()).not.toMatch(/aria-label="Send"[^>]*disabled=""/);
  lists.set(ROOT, [summary("now", { phase: "running", working: true })]);
  run.sync();
  // The person's New stays; the draft sends beside the running conversation.
  const out = draw();
  expect(run.view()).toMatchObject({ kind: "new" });
  expect(out).not.toMatch(/aria-label="Send"[^>]*disabled=""/);
  expect(out).not.toContain("The current conversation on this canvas is still running.");
  expect(out).not.toContain("You can send once Doan reads the conversations.");
});

// New conversation sits in the panel header after the title menu (so left of Hide conversation).
test("the panel header offers New conversation next to the title menu", () => {
  const run = new CanvasRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, changed: vi.fn() }, new ConversationStore({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan), window.doan);
  const html = renderToStaticMarkup(<TooltipProvider><CanvasConversationTitle run={run} list={[]} canvasName="checkout" now={0} seen={new Set()} title="Payment copy" current="c1" onPicked={() => {}} /></TooltipProvider>);
  const title = html.indexOf("doan-conv-title"), button = html.indexOf('aria-label="New conversation"');
  expect(title).toBeGreaterThanOrEqual(0);
  expect(button).toBeGreaterThan(title);
  expect(html).toMatch(/<button type="button" class="doan-icon-button doan-conv-new" aria-label="New conversation"[^>]*><svg[^>]*lucide-square-pen/);
});

// On the new conversation state it does nothing.
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

// Send now shows only while a turn runs or waits for a permission answer.
test("steerPhaseOf reads the merged events first and the list after, as the composer's turn does", () => {
  // Real events carry a seq: the fold, as main's, counts events by it.
  let seq = 0;
  const at = (type: string, extra: Record<string, unknown> = {}) => ({ type, turnId: "t1", conversationId: "c", seq: ++seq, ...extra }) as unknown as ConversationEvent;
  const started = at("turn.started"), working = at("activity", { summary: "Editing" });
  const asking = at("permission.request", { requestId: "r", summary: "Edit x", options: [] });
  const list = (patch: Partial<ConversationSummary>) => ({ phase: "ended", working: false, ...patch }) as ConversationSummary;
  expect(steerPhaseOf([started, working], undefined, true)).toBe("running");
  expect(steerPhaseOf([started, asking], undefined, true)).toBe("waiting");
  // A question waits for the person like a permission request: Send now stays.
  const question = at("question.request", { requestId: "q", questions: [{ id: "0", header: "H", question: "Which?", options: [], multiSelect: false, other: true }] });
  expect(steerPhaseOf([started, question], undefined, true)).toBe("waiting");
  expect(steerPhaseOf([started, question, at("question.resolved", { requestId: "q", outcome: "skipped" })], undefined, true)).toBe("running");
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


// The shown conversation's suggestion from the panel's list reaches its composer.
test("the shown conversation's suggestion stands in for the reply placeholder, with the Tab or Right Arrow hint", async () => {
  const out = await panel([summary("now", { suggestion: "Tighten the payment copy" })]);
  expect(out).toContain('aria-placeholder="Tighten the payment copy"');
  expect(out).toContain("Press Tab or Right Arrow to use the suggestion.");
  const plain = await panel([summary("now")]);
  expect(plain).toContain('aria-placeholder="Reply, / for presets"');
  expect(plain).not.toContain("to use the suggestion");
});

// The panel reads the shown conversation's last context.usage from its thread.
test("the shown conversation's last recorded context value reaches the composer's ring, whichever conversation shows", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  const at = (conversationId: string, seq: number, payload: Record<string, unknown>) => ({ v: 1, conversationId, seq, turnId: "t", at: "2026-11-01T00:00:00Z", ...payload }) as ConversationEvent;
  const history = (conversationId: string, used: number) => [at(conversationId, 1, { type: "user.message", text: "hi", anchors: [] }), at(conversationId, 2, { type: "turn.started" }),
    at(conversationId, 3, { type: "context.usage", used, size: 200_000 }), at(conversationId, 4, { type: "turn.done" })];
  doan.readConversation!.mockImplementation(async ({ conversationId }: { conversationId: string }) => {
    const events = conversationId === "now" ? history("now", 84_000) : conversationId === "old" ? history("old", 150_000) : [at(conversationId, 1, { type: "user.message", text: "hi", anchors: [] })];
    return { events, lastSeq: events.at(-1)!.seq, turn: "idle" };
  });
  const ring = (out: string) => /<button type="button" class="context-ring" aria-label="([^"]+)"/.exec(out)?.[1] ?? null;
  // panel() flushes after setup, so the read has settled before the draw.
  const shown = (list: ListView, id: string, setup: (run: CanvasRun) => void = () => {}) => panel(list, run => { setup(run); run.store.track(id); });
  expect(ring(await shown([summary("now")], "now"))).toBe("Context window 42% used · last turn");
  expect(ring(await shown([summary("now"), summary("old")], "old", run => run.select("old")))).toBe("Context window 75% used · last turn");
  expect(ring(await shown([summary("bare")], "bare"))).toBeNull();
  // A live event moves the ring. (The panel reads the thread itself, so its missing-thread case is the Overview test's.)
  expect(ring(await shown([summary("now")], "now", run => run.store.event(at("now", 9, { type: "context.usage", used: 160_000, size: 200_000 }))))).toBe("Context window 80% used · last turn");
  // A new conversation state has no ring.
  expect(await panel([])).not.toContain("context-ring");
});

// The panel passes its thread the same turn indicator the Overview does.
test("the thread shows the live turn's indicator from the store's stage, and none once the turn ended", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  const at = (seq: number, payload: Record<string, unknown>) => ({ v: 1, conversationId: "now", seq, turnId: "t1", at: "2026-11-01T00:00:00Z", ...payload }) as ConversationEvent;
  doan.readConversation!.mockResolvedValue({ events: [at(1, { type: "user.message", text: "hi", anchors: [] }), at(2, { type: "turn.started" })], lastSeq: 2, turn: "running" });
  const list = [summary("now", { phase: "running", working: true })];
  const shown = (setup: (run: CanvasRun) => void = () => {}) => panel(list, run => { run.store.track("now"); setup(run); });
  expect(await shown()).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
  const thinking = (run: CanvasRun) => run.store.stage({ conversationId: "now", turnId: "t1", seq: 2, rev: 1, stage: { kind: "thinking" } });
  // The stage comes once the read settled, as conversation:stage does.
  const out = await panel(list, run => { run.store.track("now"); void flush().then(() => thinking(run)); });
  expect(out).toContain('<span class="ti-text ti-shimmer">Claude Code is thinking</span>');
  expect(await shown(run => void flush().then(() => run.store.event(at(3, { type: "turn.done" }))))).not.toContain("ti-reply");
});

test("queued text strips fixed request paragraphs wherever they occur", () => {
  expect(queuedText({ text: "Use the project skill `deploy`.\n\n/deploy {{1}}\n\nUse the Doan design preset `polish` (Polish).", anchors: [{ frame: { id: "cart", title: "Cart" } }], attachments: [] })).toBe("/deploy Cart");
});

// A turn that asked for a handoff ended, and main holds the conversation until the handoff is resolved: the composer
// holds as the Overview's does, beside the source thread's card that "Hands off when this turn ends".
test("in a handoff's judging window the composer offers a disabled Send, not Stop, and Stop only while queue rows wait", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  const at = (seq: number, payload: Record<string, unknown>) => ({ v: 1, conversationId: "now", seq, turnId: "t1", at: "2026-11-01T00:00:00Z", ...payload }) as ConversationEvent;
  const events = [at(1, { type: "user.message", text: "hi", anchors: [] }), at(2, { type: "turn.started" }),
    at(3, { type: "handoff.requested", canvas: { path: ".doan/canvases/billing.html" }, text: "Carry on in billing" }), at(4, { type: "turn.done" })];
  doan.readConversation!.mockResolvedValue({ events, lastSeq: 4, turn: "idle" });
  const list = [summary("now", { working: true })];
  const auth = { revision: 1, providers: [connected("claude")] };
  const slot = (out: string) => /<button type="button" class="composer-send[^"]*"[^>]*aria-label="(Send|Stop|Queue)"[^>]*>/.exec(out)?.[0] ?? "";
  const shown = (setup: (run: CanvasRun) => void = () => {}) => panel(list, run => { run.store.track("now"); setup(run); }, {
    support: Object.assign(new DockedSupport(() => {}, window.doan), { auth }) });
  const out = await shown();
  expect(out).toMatch(/aria-label="billing.html, Hands off when this turn ends"/);
  expect(out).not.toContain("ti-reply");
  expect(slot(out)).toContain('aria-label="Send"');
  expect(slot(out)).toContain("disabled");
  const queued = await shown(run => run.store.queued(ROOT, "now", { id: "q1", text: "And the footer" }));
  expect(slot(queued)).toContain('aria-label="Stop"');
  expect(slot(queued)).not.toContain("disabled");
});

// The docked buddy steps aside for a waiting request and leaves a card that takes no input; suggestions leave room for it.
test("the panel's composer tells the docked buddy about a waiting request and a card that takes no input, not about suggestions", async () => {
  const slot = (html: string) => /<div class="docked-buddy-slot"[^>]*>/.exec(html)![0];
  const presets = (["critique", "polish"] as const).map(id => ({ id, title: id, description: `About ${id}.`, scope: `${id} scope`, group: "review" }));
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { auth: { revision: 1, providers: [connected("claude")] }, presets: { v: 1 as const, ok: true as const, result: { version: "1", presets } } });
  const fresh = await panel([], () => {}, { support });
  expect(fresh).toContain('aria-label="Suggested prompts"');
  expect(slot(fresh)).toBe('<div class="docked-buddy-slot" aria-hidden="true">');
  expect(slot(await panel([summary("now")], () => {}))).toBe('<div class="docked-buddy-slot" aria-hidden="true">');
  expect(slot(await panel([summary("now", { phase: "waiting" })], () => {}))).toBe('<div class="docked-buddy-slot" aria-hidden="true" data-waiting="">');
  expect(slot(await panel([summary("now")], () => {}, { blocked: "This canvas isn’t listed in acme-web, so its conversation can’t continue." }))).toBe('<div class="docked-buddy-slot" aria-hidden="true" data-accepts="false">');
  // The terminal-session choice sits where the suggestions do and replaces them: a reason of its own.
  resume = { available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00" };
  const choice = await panel([], () => {}, { support });
  expect(choice).toContain('aria-label="How to continue"');
  expect(slot(choice)).toBe('<div class="docked-buddy-slot" aria-hidden="true" data-notice="">');
});

// The canvas panel follows the Overview's rules (ProjectOverview.context test of the same name).
test("a taken Stop hides the indicator at once; a done turn's background work shows its line until the next message", async () => {
  const doan = (window as unknown as { doan: Record<string, ReturnType<typeof vi.fn>> }).doan;
  const at = (seq: number, payload: Record<string, unknown>, turnId = "t1") => ({ v: 1, conversationId: "now", seq, turnId, at: "2026-11-01T00:00:00Z", ...payload }) as ConversationEvent;
  doan.readConversation!.mockResolvedValue({ events: [at(1, { type: "user.message", text: "hi", anchors: [] }), at(2, { type: "turn.started" })], lastSeq: 2, turn: "running" });
  const shown = (list: ListView, setup: (run: CanvasRun) => void = () => {}) => panel(list, run => { run.store.track("now"); setup(run); });
  expect(await shown([summary("now", { phase: "running", working: true, stopping: true })])).not.toContain("ti-reply");
  const ended = (run: CanvasRun) => void flush().then(() => run.store.event(at(3, { type: "turn.done" })));
  const out = await shown([summary("now", { background: { turnId: "t1" } })], ended);
  expect(out).toContain("Background work is still running. It stops when you send your next message or press Stop.");
  expect(out).toContain('aria-label="Stop background work"');
  const next = (run: CanvasRun) => void flush().then(() => { run.store.event(at(3, { type: "turn.done" })); run.store.event(at(4, { type: "user.message", text: "Next", anchors: [] }, "t2")); });
  expect(await shown([summary("now", { background: { turnId: "t1" } })], next)).not.toContain("Background work is still running");
});

// The title menu's New conversation row takes the header button's SquarePen, in the canvas panel, the Overview and the
// prototype window alike.
test("the New conversation menu row uses the header's SquarePen", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["./CanvasConversationPanel.tsx", "./ProjectOverview.tsx", "./prototype/PrototypeConversation.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source, file).toContain('textValue="New conversation"><SquarePen aria-hidden="true" /><span>New conversation</span>');
    expect(source, file).not.toContain('<Plus aria-hidden="true" /><span>New conversation</span>');
  }
});
