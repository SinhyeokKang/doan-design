import { describe, expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider, ToolFacts } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { textSegments } from "./anchorField";
import { composerAction } from "./composerRules";
import {
  canvasGoneText, composerPlaceholder, composerTurn, dockedAvailability, dockedMessage, dockedPicker, dockedRefusal, draftKey, EMPTY_DRAFT, type DockedDraft, type DockedInput,
  type PlaceholderInput,
} from "./dockedRules";
import { presetPlaceholder, type AttachmentDraft, type ModelPickerView, type PresetSummary } from "./homeComposer";

const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
function status(provider: Provider, patch: Partial<AuthState> = {}, facts: ToolFacts = FACTS) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected", ...patch };
  return authStatus(state, facts, 1);
}
const auth = (...providers: ReturnType<typeof status>[]): AuthSnapshot => ({ revision: 1, providers });
const READY = auth(status("claude"), status("codex"));
const EXISTING = { kind: "existing", conversationId: "c1", provider: "claude" } as const;
// `text` is typed text only; chips go in `segments`.
const draft = ({ text, ...patch }: Partial<DockedDraft> & { text?: string }): DockedDraft => ({ ...EMPTY_DRAFT, ...(text === undefined ? {} : { segments: textSegments(text) }), ...patch });
const payment: Anchor = { frame: { id: "payment", title: "Payment" } };
const file = (patch: Partial<AttachmentDraft>): AttachmentDraft => ({ key: "k", id: "id", name: "notes.md", kind: "file", pasted: false, status: "ready", ...patch });
const input = (patch: Partial<DockedInput>): DockedInput => ({ skills: [], mode: EXISTING, project: "doan-design", auth: READY, provider: "claude", draft: draft({ text: "Make it lighter" }), turn: "idle", busy: null, sending: false, ...patch });

describe("draftKey", () => {
  test("keeps drafts per conversation, and a new conversation's draft per root", () => {
    expect(draftKey(EXISTING)).toBe("conversation:c1");
    expect(draftKey({ kind: "archived", conversationId: "c1", provider: "claude" })).toBe("conversation:c1");
    expect(draftKey({ kind: "new", root: "/code/doan" })).toBe("root:/code/doan");
    expect(draftKey({ kind: "new", root: "/code/doan" })).not.toBe(draftKey({ kind: "new", root: "/code/acme" }));
  });
  test("a canvas panel's new conversation keeps its draft per canvas of a root, shared with the terminal session", () => {
    const billing = { path: ".doan/canvases/billing.html", id: "billing" };
    const canvasNew = draftKey({ kind: "new", root: "/code/doan", canvas: billing });
    expect(canvasNew).not.toBe(draftKey({ kind: "new", root: "/code/doan" }));
    expect(canvasNew).not.toBe(draftKey({ kind: "new", root: "/code/acme", canvas: billing }));
    expect(canvasNew).not.toBe(draftKey({ kind: "new", root: "/code/doan", canvas: { path: ".doan/canvases/home.html", id: "home" } }));
    // A moved canvas keeps its id and its draft.
    expect(draftKey({ kind: "new", root: "/code/doan", canvas: { ...billing, path: ".doan/canvases/pay/billing.html" } })).toBe(canvasNew);
    expect(draftKey({ kind: "resume", root: "/code/doan", canvas: billing, provider: "codex" })).toBe(canvasNew);
    // Without an id, the path; an id and a path that read alike stay apart.
    expect(draftKey({ kind: "new", root: "/code/doan", canvas: { path: "billing" } })).not.toBe(draftKey({ kind: "new", root: "/code/doan", canvas: { path: "x", id: "billing" } }));
  });
});

describe("dockedAvailability", () => {
  test("a terminal session, and a conversation continued from one, do not need a Doan account for the provider", () => {
    const resume = { kind: "resume", root: "/r", canvas: { path: ".doan/canvases/billing.html" }, provider: "codex" } as const;
    expect(dockedAvailability(input({ mode: resume, auth: auth() }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ mode: { kind: "existing", conversationId: "c", provider: "codex" }, auth: auth() })).enabled).toBe(false);
    expect(dockedAvailability(input({ mode: { kind: "existing", conversationId: "c", provider: "codex" }, auth: auth(), external: true })).enabled).toBe(true);
  });
  // an open Overview whose project turned into a problem keeps its thread readable,
  // and Send says why it is held, as Home does.
  test("an unavailable project holds Send with its reason before anything else", () => {
    const text = "doan-design isn’t available. Fix it from its menu in the sidebar.";
    expect(dockedAvailability(input({ unavailable: text }))).toEqual({ enabled: false, reason: { text } });
    expect(dockedAvailability(input({ unavailable: text, draft: EMPTY_DRAFT, auth: auth() }))).toEqual({ enabled: false, reason: { text } });
  });
  test("a ready draft sends with no line", () => {
    expect(dockedAvailability(input({}))).toEqual({ enabled: true, reason: null });
  });
  test("an empty field shows no line and does not send", () => {
    expect(dockedAvailability(input({ draft: EMPTY_DRAFT }))).toEqual({ enabled: false, reason: null });
  });
  test("while a send is pending there is no line", () => {
    expect(dockedAvailability(input({ sending: true }))).toEqual({ enabled: false, reason: null });
  });
  test("Home's draft reasons: length, anchor markers, checking and a moved file (as an alert)", () => {
    expect(dockedAvailability(input({ draft: draft({ text: "x".repeat(32769) }) })).reason).toEqual({ text: "Shorten the message to send it." });
    expect(dockedAvailability(input({ draft: draft({ text: "Use {{1}} here" }) })).reason).toEqual({ text: "Remove {{ and }} from the message to send it." });
    expect(dockedAvailability(input({ draft: draft({ attachments: [file({ status: "checking" })] }) })).reason).toEqual({ text: "Checking attachments" });
    expect(dockedAvailability(input({ draft: draft({ attachments: [file({ status: "missing" })] }) })).reason).toEqual({ text: "notes.md was moved or deleted. Remove it, or attach it again.", alert: true });
  });
  test("a typed {{1}} is refused even with a chip in the draft; the chip's own marker is not (BT handoff)", () => {
    const chip = { kind: "chip" as const, anchor: payment };
    expect(dockedAvailability(input({ draft: draft({ segments: [{ kind: "text", text: "Use {{1}} near " }, chip] }) })).reason).toEqual({ text: "Remove {{ and }} from the message to send it." });
    expect(dockedAvailability(input({ draft: draft({ segments: [{ kind: "text", text: "Move " }, chip] }) }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ draft: draft({ segments: [chip] }) }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ draft: draft({ text: "   " }) }))).toEqual({ enabled: false, reason: null });
  });
  test("another project conversation running blocks with Home's sentence and Open", () => {
    expect(dockedAvailability(input({ mode: { kind: "new", root: "/r" }, busy: { kind: "project", open: "c9" } })))
      .toEqual({ enabled: false, reason: { text: "Another conversation is still running in doan-design.", open: "c9" } });
    // A late refusal names no conversation until the list arrives: the line has no Open.
    expect(dockedAvailability(input({ busy: { kind: "project", open: null } })).reason).toEqual({ text: "Another conversation is still running in doan-design." });
  });
  test("restoring while the canvas's current conversation runs is refused with Open", () => {
    expect(dockedAvailability(input({ mode: { kind: "archived", conversationId: "c1", provider: "claude" }, busy: { kind: "restore", open: "c2" } })).reason)
      .toEqual({ text: "The current conversation on this canvas is still running.", open: "c2" });
  });
  test("an empty field shows the busy line only once something is typed, as on Home", () => {
    expect(dockedAvailability(input({ draft: EMPTY_DRAFT, busy: { kind: "project", open: "c9" } })).reason).toBeNull();
  });
  test("while this conversation runs, text queues and the permission wait explains the line without blocking", () => {
    expect(dockedAvailability(input({ turn: "running" }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ turn: "waiting" }))).toEqual({ enabled: true, reason: { text: "Answer or stop the request above." } });
    expect(dockedAvailability(input({ turn: "waiting", draft: EMPTY_DRAFT }))).toEqual({ enabled: false, reason: { text: "Answer or stop the request above." } });
  });
  // Its turn ended and main still works on it (holding): a message goes to the queue, so neither limit on starting a turn
  // applies yet, and an empty field is a disabled Send with no line.
  test("while this conversation holds after its turn, text queues past the project and restore limits", () => {
    expect(dockedAvailability(input({ turn: "holding" }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ turn: "holding", busy: { kind: "project", open: "c9" } }))).toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ turn: "holding", mode: { kind: "archived", conversationId: "c1", provider: "claude" }, busy: { kind: "restore", open: "c2" } })))
      .toEqual({ enabled: true, reason: null });
    expect(dockedAvailability(input({ turn: "holding", draft: EMPTY_DRAFT }))).toEqual({ enabled: false, reason: null });
  });
  test("a fixed provider that cannot run offers its fix in Settings, not another agent", () => {
    expect(dockedAvailability(input({ auth: auth(status("claude", { expired: true, phase: "reauthRequired" })) })).reason)
      .toEqual({ text: "Claude Code’s sign-in expired.", action: { label: "Sign in again…", target: { section: "agents", provider: "claude" } } });
    expect(dockedAvailability(input({ auth: auth(status("claude", {}, { ...FACTS, version: "unsupported" })) })).reason)
      .toEqual({ text: "Claude Code needs an update.", action: { label: "Update…", target: { section: "agents", provider: "claude" } } });
    expect(dockedAvailability(input({ auth: auth(status("codex")) })).reason)
      .toEqual({ text: "Claude Code isn’t connected.", action: { label: "Open Agents settings…", target: { section: "agents", provider: "claude" } } });
  });
  test("new-conversation mode uses Home's agent reasons", () => {
    const fresh = { kind: "new", root: "/r" } as const;
    expect(dockedAvailability(input({ mode: fresh, provider: null })).reason).toEqual({ text: "No agent is ready to run.", noAgent: true });
    expect(dockedAvailability(input({ mode: fresh, auth: auth(status("claude", { expired: true, phase: "reauthRequired" })) })).reason)
      .toEqual({ text: "Claude Code can’t run right now. Choose another agent." });
  });
});

describe("dockedMessage", () => {
  test("chips become numbered markers after the preset line; anchors go beside the text", () => {
    const preset = { id: "critique", title: "Critique the design", description: "", scope: "" };
    const segments = [{ kind: "text" as const, text: "Look at " }, { kind: "chip" as const, anchor: payment }];
    expect(dockedMessage(draft({ segments }))).toEqual({ text: "Look at {{1}}", anchors: [payment] });
    expect(dockedMessage(draft({ segments, preset }))).toEqual({ text: "Use the Doan design preset `critique` (Critique the design).\n\nLook at {{1}}", anchors: [payment] });
    expect(dockedMessage(EMPTY_DRAFT)).toEqual({ text: "", anchors: [] });
  });
});

describe("dockedRefusal", () => {
  test("project_busy and a restore's busy become the busy line until the list names the conversation", () => {
    expect(dockedRefusal("project_busy", EXISTING, "claude", "doan-design")).toEqual({ kind: "busy", busy: { kind: "project", open: null } });
    expect(dockedRefusal("busy", { kind: "archived", conversationId: "c1", provider: "claude" }, "claude", "doan-design")).toEqual({ kind: "busy", busy: { kind: "restore", open: null } });
  });
  test("canvas_not_found replaces the composer with the canvas-gone line", () => {
    expect(dockedRefusal("canvas_not_found", { kind: "archived", conversationId: "c1", provider: "claude" }, "claude", "doan-design")).toEqual({ kind: "gone" });
    expect(canvasGoneText("doan-design")).toBe("This conversation’s canvas is no longer in doan-design, so it can’t continue.");
  });
  test("a start uses Home's start copy; a send has its own", () => {
    expect(dockedRefusal("rate_limited", { kind: "new", root: "/r" }, "codex", "doan-design")).toEqual({ kind: "notice", text: "Codex is rate limited. Try again later." });
    expect(dockedRefusal("busy", EXISTING, "claude", "doan-design")).toEqual({ kind: "notice", text: "Claude Code is finishing a previous run. Try again in a moment." });
    expect(dockedRefusal("bad_request", EXISTING, "claude", "doan-design")).toEqual({ kind: "notice", text: "Couldn’t send your message. Try again." });
    expect(dockedRefusal("session_in_use", EXISTING, "claude", "doan-design")).toEqual({ kind: "notice", text: "Claude Code is using this session in another terminal. Try again when it finishes there." });
    // the code alone does not tell an expired sign-in from none.
    expect(dockedRefusal("not_logged_in", EXISTING, "claude", "doan-design")).toEqual({ kind: "notice", text: "Sign in to Claude Code in Settings > Agents, then send again." });
  });
  test("a terminal session's refusal names the session, not another agent", () => {
    const resume = { kind: "resume", root: "/r", canvas: { path: ".doan/canvases/billing.html" }, provider: "codex" } as const;
    expect(dockedRefusal("session_in_use", resume, "codex", "doan-design")).toEqual({ kind: "notice", text: "Couldn’t continue the terminal session: it’s in use in another terminal." });
  });
});

describe("dockedPicker", () => {
  const view: ModelPickerView = {
    trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5", placeholder: false, isDefault: false },
    groups: [
      { provider: "claude", name: "Claude Code", selectable: true, cause: null, note: null, read: false, rows: [] },
      { provider: "codex", name: "Codex", selectable: true, cause: null, note: null, read: false, rows: [] },
    ],
    effort: null,
  };
  test("an existing conversation lists only its provider and names the model with the provider", () => {
    const picked = dockedPicker(view, EXISTING);
    expect(picked.trigger).toEqual({ provider: "claude", label: "Opus 5.5", ariaLabel: "Model: Opus 5.5 (Claude Code)", placeholder: false, isDefault: false });
    expect(picked.groups.map(group => group.provider)).toEqual(["claude"]);
  });
  // the default row says so; no model names the drawer.
  test("the default row's name ends with default; with no model the trigger names its drawer", () => {
    const shown = dockedPicker({ ...view, trigger: { ...view.trigger, ariaLabel: "Agent: Claude Code, model Opus 5.5, default", isDefault: true } }, EXISTING);
    expect(shown.trigger).toEqual({ provider: "claude", label: "Opus 5.5", ariaLabel: "Model: Opus 5.5, default (Claude Code)", placeholder: false, isDefault: true });
    const none = dockedPicker({ ...view, trigger: { provider: "claude", label: "Model", ariaLabel: "Agent: Claude Code, model not chosen", placeholder: true, isDefault: false } }, EXISTING);
    expect(none.trigger).toEqual({ provider: "claude", label: "Model", ariaLabel: "Model: not chosen (Claude Code)", placeholder: true, isDefault: false });
    // Another provider's trigger never shows on a conversation that keeps its own.
    const other = dockedPicker({ ...view, trigger: { provider: "codex", label: "GPT-6-Luna", ariaLabel: "Agent: Codex, model GPT-6-Luna, default", placeholder: false, isDefault: true } }, EXISTING);
    expect(other.trigger).toEqual({ provider: "claude", label: "Model", ariaLabel: "Model: not chosen (Claude Code)", placeholder: true, isDefault: false });
  });
  test("new-conversation mode keeps Home's picker", () => {
    expect(dockedPicker(view, { kind: "new", root: "/r" })).toBe(view);
  });
});

// one rule for both hosts decides the drawn text and whether
// the suggestion is shown, so the →-key check can never disagree with what the field shows.
describe("composerPlaceholder", () => {
  const preset: PresetSummary = { id: "polish", title: "Polish", description: "Final pass", scope: "canvas" };
  const SUGGESTION = "Make the header lighter";
  const placeholder = (patch: Partial<PlaceholderInput>) => composerPlaceholder({ readOnly: false, preset: null, empty: true, mode: "existing", text: "Reply, / for presets", suggestion: SUGGESTION, ...patch });
  test("an empty field of an existing conversation shows the suggestion in the placeholder's place", () => {
    expect(placeholder({})).toEqual({ text: SUGGESTION, suggestion: SUGGESTION });
  });
  test("read-only, then a preset, win over the suggestion, which wins over the host's own text", () => {
    expect(placeholder({ readOnly: true })).toEqual({ text: "Reply, / for presets", suggestion: null });
    expect(placeholder({ readOnly: true, preset })).toEqual({ text: presetPlaceholder(preset), suggestion: null });
    expect(placeholder({ preset })).toEqual({ text: presetPlaceholder(preset), suggestion: null });
    expect(placeholder({ suggestion: null })).toEqual({ text: "Reply, / for presets", suggestion: null });
    expect(placeholder({ suggestion: undefined })).toEqual({ text: "Reply, / for presets", suggestion: null });
  });
  test("a field holding text or a chip shows no suggestion; attachments alone keep it (the field is still empty)", () => {
    expect(placeholder({ empty: false })).toEqual({ text: "Reply, / for presets", suggestion: null });
    // A preset only stands in for the text while the field is empty, as the hosts decided before.
    expect(placeholder({ empty: false, preset })).toEqual({ text: "Reply, / for presets", suggestion: null });
  });
  test("only an existing conversation shows one; the hosts' own texts pass through unchanged", () => {
    expect(placeholder({ mode: "new", text: "Ask or describe what to design, / for presets" })).toEqual({ text: "Ask or describe what to design, / for presets", suggestion: null });
    expect(placeholder({ mode: "new", text: "Ask, / for presets" })).toEqual({ text: "Ask, / for presets", suggestion: null });
    expect(placeholder({ mode: "resume", text: "Reply, / for presets" })).toEqual({ text: "Reply, / for presets", suggestion: null });
    expect(placeholder({ mode: "archived", text: "Reply, / for presets" })).toEqual({ text: "Reply, / for presets", suggestion: null });
    expect(placeholder({ suggestion: "" })).toEqual({ text: "Reply, / for presets", suggestion: null });
  });
});

describe("composerTurn", () => {
  let seq = 0;
  const ev = (payload: Record<string, unknown>, turnId = "t1"): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-09T00:00:00Z", ...payload } as ConversationEvent);
  const opened = () => { seq = 0; return [ev({ type: "user.message", text: "Draw it", anchors: [] }), ev({ type: "turn.started" })]; };
  const summary = (patch: Partial<ConversationSummary>) => ({ phase: "ended", working: false, ...patch } as ConversationSummary);
  const ends = [{ type: "turn.done" }, { type: "turn.failed", code: "unknown" }, { type: "interrupted", reason: "user" }];

  test("a terminal while main still works on the conversation holds; once it does not, idle", () => {
    for (const end of ends) {
      const events = [...opened(), ev(end)];
      expect(composerTurn(events, summary({ working: true }), true)).toBe("holding");
      expect(composerTurn(events, summary({ working: false }), true)).toBe("idle");
      expect(composerTurn(events, summary({ working: true }), false)).toBe("holding");
    }
  });
  test("the events' end wins over a list that still says the turn runs or waits", () => {
    const events = [...opened(), ev({ type: "turn.done" })];
    expect(composerTurn(events, summary({ phase: "running", working: true }), true)).toBe("holding");
    expect(composerTurn(events, summary({ phase: "waiting", working: true }), true)).toBe("holding");
    expect(composerTurn(events, summary({ phase: "running", working: false }), true)).toBe("idle");
  });
  test("a permission or question waits; a started or working turn that main holds runs", () => {
    const options = [{ id: "a", label: "Allow once", kind: "allow" }];
    expect(composerTurn([...opened(), ev({ type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run", options })], summary({ working: true }), true)).toBe("waiting");
    expect(composerTurn([...opened(), ev({ type: "question.request", requestId: "q1", questions: [{ id: "0", header: "", question: "Which?", options: [{ label: "A" }], multiSelect: false, other: false }] })], summary({ working: true }), true)).toBe("waiting");
    expect(composerTurn(opened(), summary({ working: true }), true)).toBe("running");
    expect(composerTurn([...opened(), ev({ type: "activity", kind: "read", path: "a.ts", summary: "a.ts" })], summary({}), true)).toBe("running");
  });
  test("with composerAction: a held turn is a disabled Send, Queue with text, Stop while queue rows wait or go out", () => {
    const events = [...opened(), ev({ type: "turn.done" })];
    const held = composerTurn(events, summary({ working: true, queued: 1 }), true);
    expect(composerAction(held, "", 0)).toBe("send");
    expect(dockedAvailability(input({ turn: held, draft: EMPTY_DRAFT })).enabled).toBe(false);
    expect(composerAction(held, "Also the caption", 0)).toBe("queue");
    expect(composerAction(held, "", 1)).toBe("stop");
    // Main sends the queue (its list counts no row once all are sending); the rows stay drawn until a read shows them sent.
    expect(composerAction(composerTurn(events, summary({ working: true, queued: 0 }), true), "", 1)).toBe("stop");
    expect(composerAction(composerTurn(opened(), summary({ working: true }), true), "", 0)).toBe("stop");
  });
  test("without events, or with a turn main does not hold: the list's phase and work flag, as before", () => {
    expect(composerTurn(null, summary({ phase: "waiting", working: true }), false)).toBe("waiting");
    expect(composerTurn([], summary({ phase: "running", working: true }), false)).toBe("running");
    expect(composerTurn(null, summary({ working: true }), false)).toBe("running");
    expect(composerTurn(null, summary({}), false)).toBe("idle");
    expect(composerTurn(null, undefined, false)).toBe("idle");
    expect(composerTurn(opened(), summary({ working: true }), false)).toBe("running");
    expect(composerTurn(opened(), summary({}), false)).toBe("idle");
  });
});
