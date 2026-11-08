import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import {
  attachmentChipView, attachmentLimit, chipRemoval, composeRequest, defaultEffort, defaultFast, defaultModel, fastToSend, defaultProject, defaultProvider, dropTarget, fixedPreference,
  GREETINGS, greetingText, foldRows, olderOrder, lockedOlderSide, heldScrollTop, NO_OLDER, olderLabel, olderOpened, olderToggled, groupIcon, groupLabel, isSubmitKey, steerKey, takesSuggestion, lengthCounter, MAX_ATTACHMENTS, MAX_PASTED_BYTES, modelPickerView, pickGreeting, presetListView,
  draftProblem, presetPlaceholder, rootForProject, searchPresets, selectableProvider, sendAvailability, slashQuery, startErrorView, suggestedPresets,
  suggestedPrompts, TEXT_LIMIT,
  type AttachmentDraft, type ModelsState, type PresetListReply, type PresetSummary, type SendInput,
} from "./homeComposer";

// The catalog's order and groups; titles and scopes are the CLI's, abbreviated here.
const CATALOG: [string, string, string][] = [
  ["context", "Gather design context", "start"], ["shape", "Shape a first screen", "start"], ["document", "Document the design system", "start"], ["extract", "Extract components", "start"],
  ["critique", "Critique the design", "review"], ["audit", "Audit quality", "review"],
  ["polish", "Polish the details", "refine"], ["bolder", "Make it bolder", "refine"], ["quieter", "Make it quieter", "refine"], ["layout", "Fix the layout", "refine"], ["typeset", "Set the type", "refine"], ["colorize", "Add color", "refine"],
  ["distill", "Distill the screen", "content"], ["clarify", "Clarify the copy", "content"], ["harden", "Harden for real conditions", "content"], ["onboard", "Design onboarding", "content"],
  ["adapt", "Adapt to devices", "explore"], ["animate", "Animate it", "explore"], ["delight", "Add delight", "explore"], ["generate", "Generate options", "explore"],
];
const PRESETS: PresetSummary[] = CATALOG.map(([id, title, group]) => ({ id, title, description: `About ${id}.`, scope: `${id} scope`, group }));
const UNGROUPED: PresetSummary[] = PRESETS.map(({ group: _group, ...rest }) => rest);
const preset = (id: string) => PRESETS.find(p => p.id === id)!;
const listed = (presets = PRESETS): PresetListReply => ({ v: 1, ok: true, result: { version: "0.9.0", presets } });

function canvas(path: string, extra: Partial<CanvasRow> = {}): CanvasRow { return { path, url: `doan://x/${path}`, ...extra }; }
function list(path: string, canvases: CanvasRow[] = [], git?: { common: string; main?: string; branch?: string }): FolderEntry {
  return { path, kind: "list", canvases, servedRev: 1, ...(git ? { git: { worktrees: [], ...git } } : {}) };
}
const missing = (path: string): FolderEntry => ({ path, kind: "notFound" });

const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
// Claude needs an organization to be ready (agentAuth unpinned).
const ACCOUNT: AccountIdentity = { id: "acct", workspace: "org", email: "ada@example.com" };
function dto(provider: Provider, f: { connected?: boolean; verified?: boolean; expired?: boolean; facts?: Partial<ToolFacts> } = {}): AuthStatusDto {
  const connected = f.connected ?? true;
  const state: AuthState = {
    provider, generation: 1, verified: f.verified ?? true, expired: f.expired ?? false,
    connection: connected ? { provider, connectionId: "c", profile: provider, account: ACCOUNT } : null,
    attempt: null, error: null, phase: connected ? (f.expired ? "reauthRequired" : "connected") : "disconnected",
  };
  return authStatus(state, { ...FACTS, ...f.facts }, 1);
}
const snapshot = (...providers: AuthStatusDto[]): AuthSnapshot => ({ revision: 1, providers });

function attachment(name: string, extra: Partial<AttachmentDraft> = {}): AttachmentDraft {
  return { key: name, name, kind: "file", pasted: false, status: "ready", size: 1000, path: `/Users/ada/Desktop/${name}`, ...extra };
}
const base = (over: Partial<SendInput> = {}): SendInput => ({
  skills: [], projects: 1, root: list("/r/doan-design"), projectName: "doan-design", auth: snapshot(dto("claude")), provider: "claude",
  text: "Draw a pricing page.", preset: null, attachments: [], running: null, sending: false, ...over,
});

// composeRequest

test("a request without a preset is the user's text, trimmed", () => {
  expect(composeRequest("  Draw a pricing page.\n\n", null, [], 0)).toBe("Draw a pricing page.");
});

test("a preset adds its one-line header, a blank line, then the user's text", () => {
  expect(composeRequest("Turn the onboarding screens into a design system.", preset("document"), [], 0))
    .toBe("Use the Doan design preset `document` (Document the design system).\n\nTurn the onboarding screens into a design system.");
});

test("a preset alone sends only its header line, even with attachments", () => {
  expect(composeRequest("   ", preset("critique"), [], 0)).toBe("Use the Doan design preset `critique` (Critique the design).");
  expect(composeRequest("", preset("critique"), [], 2)).toBe("Use the Doan design preset `critique` (Critique the design).");
});

test("attachments alone send the fixed sentence; nothing at all sends nothing", () => {
  expect(composeRequest(" \n ", null, [], 1)).toBe("Look at the attached files.");
  expect(composeRequest("", null, [], 0)).toBe("");
});

test("the placeholder asks for a target once a preset is chosen", () => {
  expect(presetPlaceholder(null)).toBe("Describe what to design, / for presets");
  expect(presetPlaceholder(preset("polish"))).toBe("Which canvas or screen? Add details…");
});

// sendAvailability and the length limit

test("the limit counts the user's text plus the preset header: 32,768 sends, 32,769 does not", () => {
  const header = composeRequest("", preset("polish"), [], 0).length + 2;
  const at = "a".repeat(TEXT_LIMIT - header), over = at + "a";
  expect(composeRequest(at, preset("polish"), [], 0)).toHaveLength(TEXT_LIMIT);
  expect(sendAvailability(base({ text: at, preset: preset("polish") }))).toEqual({ enabled: true, reason: null });
  expect(sendAvailability(base({ text: over, preset: preset("polish") }))).toEqual({ enabled: false, reason: { kind: "overLimit", text: "Shorten the message to send it." } });
  expect(sendAvailability(base({ text: "a".repeat(TEXT_LIMIT) })).enabled).toBe(true);
  expect(sendAvailability(base({ text: "a".repeat(TEXT_LIMIT + 1) })).enabled).toBe(false);
});

test("the counter appears from 90% of the limit and says how far over", () => {
  expect(lengthCounter(Math.ceil(TEXT_LIMIT * 0.9) - 1)).toBeNull();
  expect(lengthCounter(TEXT_LIMIT - 2412)).toBe("2,412 characters left");
  expect(lengthCounter(TEXT_LIMIT - 1)).toBe("1 character left");
  expect(lengthCounter(TEXT_LIMIT)).toBe("0 characters left");
  expect(lengthCounter(TEXT_LIMIT + 1318)).toBe("1,318 characters over the limit");
  expect(lengthCounter(TEXT_LIMIT + 1)).toBe("1 character over the limit");
});

test("{{ or }} in the text blocks Send with the draft's reason", () => {
  for (const text of ["Use {{ here", "and }} there"]) {
    expect(sendAvailability(base({ text }))).toEqual({ enabled: false, reason: { kind: "anchorMarkers", text: "Remove {{ and }} from the message to send it." } });
  }
  expect(sendAvailability(base({ text: "single { and } are fine" })).enabled).toBe(true);
});

test("draftProblem checks only what was typed: a chip passes, typed braces do not, even as a valid marker", () => {
  const frame = { frame: { id: "payment" } };
  const text = (t: string) => ({ kind: "text" as const, text: t }), chip = { kind: "chip" as const, anchor: frame };
  const markers = { kind: "anchorMarkers", text: "Remove {{ and }} from the message to send it." };
  expect(draftProblem([chip], null, [], [])).toBeNull();
  expect(draftProblem([text("Move "), chip, text(" left of "), chip], null, [], [])).toBeNull();
  // Braces typed on both sides of a chip are separate pieces.
  expect(draftProblem([text("{"), chip, text("}")], null, [], [])).toBeNull();
  // A typed {{1}} is refused even though a chip has that number.
  expect(draftProblem([text("Literal {{1}} then "), chip], null, [], [])).toEqual(markers);
  expect(draftProblem([chip, text(" then }}")], null, [], [])).toEqual(markers);
  // Text segments next to each other read as one piece.
  expect(draftProblem([text("Use {"), text("{ here"), chip], null, [], [])).toEqual(markers);
  expect(draftProblem([chip], { id: "clarify", title: "Clarify" }, [], [])).toBeNull();
  // A plain string is typed text, so any marker in it was typed.
  expect(draftProblem("Move {{1}}", null, [], [])).toEqual(markers);
  expect(draftProblem([text("x".repeat(32_767)), chip], null, [], [])).toEqual({ kind: "overLimit", text: "Shorten the message to send it." });
});

test("an empty composer disables Send without a reason line; a preset or an attachment alone can be sent", () => {
  expect(sendAvailability(base({ text: "  \n" }))).toEqual({ enabled: false, reason: null });
  expect(sendAvailability(base({ text: "", preset: preset("shape") }))).toEqual({ enabled: true, reason: null });
  expect(sendAvailability(base({ text: "", attachments: [attachment("brief.pdf")] }))).toEqual({ enabled: true, reason: null });
});

test("no project, an unhealthy project, and no chosen agent each give their reason", () => {
  expect(sendAvailability(base({ projects: 0, root: null, projectName: "" }))).toEqual({ enabled: false, reason: { kind: "noProject", text: "Add a project to send." } });
  expect(sendAvailability(base({ root: missing("/r/old-site"), projectName: "old-site" })))
    .toEqual({ enabled: false, reason: { kind: "projectUnavailable", text: "old-site isn’t available. Fix it from its menu in the sidebar." } });
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { expired: true })), provider: null })))
    .toEqual({ enabled: false, reason: { kind: "noAgent", text: "No agent is ready to run." } });
  expect(sendAvailability(base({ auth: snapshot(), provider: null }))).toEqual({ enabled: false, reason: { kind: "noAgent", text: "No agent is ready to run." } });
  expect(sendAvailability(base({ auth: undefined, provider: null })).enabled).toBe(false);
});

test("a chosen agent that is no longer ready keeps the choice and blocks Send while another can run", () => {
  const auth = snapshot(dto("claude", { expired: true }), dto("codex"));
  expect(sendAvailability(base({ auth, provider: "claude" })))
    .toEqual({ enabled: false, reason: { kind: "agentUnavailable", text: "Claude Code can’t run right now. Choose another agent." } });
  expect(sendAvailability(base({ auth: snapshot(dto("claude"), dto("codex", { connected: false })), provider: "codex" })).reason?.kind).toBe("agentUnavailable");
});

test("the only agent, once chosen, keeps its own reason when its sign-in expires or it is signed out", () => {
  const unavailable = { enabled: false, reason: { kind: "agentUnavailable", text: "Claude Code can’t run right now. Choose another agent." } };
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { expired: true })), provider: "claude" }))).toEqual(unavailable);
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { connected: false })), provider: "claude" }))).toEqual(unavailable);
});

test("an unverified agent after a restart can be sent with", () => {
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { verified: false })) }))).toEqual({ enabled: true, reason: null });
});

test("attachments being checked, and one that moved, block Send", () => {
  expect(sendAvailability(base({ attachments: [attachment("notes.md", { status: "checking" })] })))
    .toEqual({ enabled: false, reason: { kind: "checking", text: "Checking attachments" } });
  expect(sendAvailability(base({ attachments: [attachment("brand-guidelines.pdf", { status: "missing" })] })))
    .toEqual({ enabled: false, reason: { kind: "attachmentMissing", text: "brand-guidelines.pdf was moved or deleted. Remove it, or attach it again." } });
});

test("a second Home send to a root with a running Home conversation says so and offers Open", () => {
  expect(sendAvailability(base({ running: { conversationId: "conv-1" } })))
    .toEqual({ enabled: false, reason: { kind: "running", text: "Another conversation is still running in doan-design.", open: "conv-1" } });
});

// The draft's home-toast and home-remove-running frames show an empty composer, with suggestions and
// no reason line, while a Home conversation runs in the chosen project; the line appears once something is typed.
test("an empty composer has no reason line even while a Home conversation runs in its project", () => {
  expect(sendAvailability(base({ text: "", running: { conversationId: "conv-1" } }))).toEqual({ enabled: false, reason: null });
  expect(sendAvailability(base({ text: "", preset: PRESETS[0]!, running: { conversationId: "conv-1" } })).reason?.kind).toBe("running");
});

test("while sending, Send is disabled without a reason line", () => {
  expect(sendAvailability(base({ sending: true }))).toEqual({ enabled: false, reason: null });
});

// startErrorView

test("every start refusal has the draft's wording and Retry only where retrying can help", () => {
  const view = (code: string) => startErrorView(code, "claude", "doan-design");
  expect(view("not_logged_in")).toEqual({ text: "Couldn’t start with Claude Code: its sign-in has expired. Choose another agent.", retry: false });
  expect(view("cli_missing")).toEqual({ text: "Couldn’t start with Claude Code: it isn’t installed on this Mac. Choose another agent.", retry: false });
  expect(view("runtime_unsupported")).toEqual({ text: "Couldn’t start with Claude Code: Doan doesn’t support this version. Update it, then try again.", retry: true });
  expect(view("busy")).toEqual({ text: "Claude Code is finishing a previous run. Try again in a moment.", retry: true });
  expect(view("credential_override")).toEqual({ text: "Claude Code refused to run: this project’s Claude settings supply their own API key. Remove it, or choose another agent.", retry: false });
  expect(view("cli_install_failed")).toEqual({ text: "Couldn’t download the Antigravity server. Check your connection, then try again.", retry: true });
  expect(view("rate_limited")).toEqual({ text: "Claude Code is rate limited. Try again later.", retry: false });
  expect(view("process_exited")).toEqual({ text: "Claude Code stopped before it could start. Try again.", retry: true });
  expect(view("session_unavailable")).toEqual({ text: "Couldn’t start with Claude Code right now. Try again, or choose another agent.", retry: true });
  expect(view("session_in_use")).toEqual({ text: "Claude Code is busy with another session. Try again in a moment.", retry: true });
  expect(view("project_not_open")).toEqual({ text: "doan-design isn’t available. Fix it from its menu in the sidebar.", retry: false });
  expect(view("no_agent")).toEqual({ text: "No agent is ready to run.", retry: false });
  for (const code of ["bad_request", "unknown", "something_new"]) expect(view(code)).toEqual({ text: "Couldn’t start the conversation. Try again.", retry: true });
});

// defaultProject and rootForProject

const DOAN = list("/r/doan-design", [], { common: "/r/doan-design/.git", main: "/r/doan-design", branch: "main" });
const DOAN_WT = list("/r/wt/doan-home", [], { common: "/r/doan-design/.git", main: "/r/doan-design", branch: "feat-doan-home" });
const MALMOI = list("/r/malmoi");
const OLD = missing("/r/old-site");

test("the first-run handoff root wins, then the loaded workspace, then the last Home send, then the first healthy root", () => {
  const entries = [OLD, MALMOI, DOAN, DOAN_WT];
  const none = new Map<string, string>();
  expect(defaultProject(entries, none, { handoff: "/r/wt/doan-home", loaded: "/r/malmoi", lastRoot: "/r/doan-design" }).root).toBe("/r/wt/doan-home");
  expect(defaultProject(entries, none, { loaded: "/r/malmoi", lastRoot: "/r/doan-design" }).root).toBe("/r/malmoi");
  expect(defaultProject(entries, none, { lastRoot: "/r/doan-design" }).root).toBe("/r/doan-design");
  expect(defaultProject(entries, none, {}).root).toBe("/r/malmoi");
});

test("a handoff root that is missing or unhealthy falls through to the next choice", () => {
  const none = new Map<string, string>();
  expect(defaultProject([OLD, MALMOI, DOAN], none, { handoff: "/r/gone", loaded: "/r/doan-design" }).root).toBe("/r/doan-design");
  expect(defaultProject([OLD, MALMOI, DOAN], none, { handoff: "/r/old-site", lastRoot: "/r/gone" }).root).toBe("/r/malmoi");
});

test("a chosen root that became unhealthy stays chosen; Send then refuses", () => {
  const result = defaultProject([missing("/r/doan-design"), MALMOI], new Map(), { current: { root: "/r/doan-design", name: "doan-design" }, loaded: "/r/malmoi" });
  expect(result).toEqual({ root: "/r/doan-design", announcement: null });
  expect(sendAvailability(base({ root: missing("/r/doan-design") })).reason?.kind).toBe("projectUnavailable");
});

test("a chosen root that was removed falls back to the first healthy root and says so", () => {
  expect(defaultProject([OLD, MALMOI], new Map(), { current: { root: "/r/doan-design", name: "doan-design" }, loaded: "/r/old-site", lastRoot: "/r/doan-design" }))
    .toEqual({ root: "/r/malmoi", announcement: "doan-design was removed. Choose another project." });
});

test("with every root unhealthy the first root is chosen so its reason shows; with no projects nothing is", () => {
  expect(defaultProject([OLD, missing("/r/b")], new Map(), {}).root).toBe("/r/old-site");
  expect(defaultProject([], new Map(), { lastRoot: "/r/doan-design" })).toEqual({ root: null, announcement: null });
});

test("switching project picks the sidebar's remembered worktree, else the first healthy root", () => {
  const rows = [missing("/r/doan-design"), DOAN_WT, list("/r/wt/review")];
  expect(rootForProject(rows, "/r/wt/review")).toBe("/r/wt/review");
  expect(rootForProject(rows, "/r/elsewhere")).toBe("/r/wt/doan-home");
  expect(rootForProject(rows, undefined)).toBe("/r/wt/doan-home");
  expect(rootForProject([missing("/r/a"), missing("/r/b")], undefined)).toBe("/r/a");
});

// Providers

test("connected providers that are ready or unverified can be chosen; others cannot", () => {
  expect(selectableProvider(dto("claude"))).toBe(true);
  expect(selectableProvider(dto("claude", { verified: false }))).toBe(true);
  expect(selectableProvider(dto("claude", { expired: true }))).toBe(false);
  expect(selectableProvider(dto("cursor", { facts: { version: "unsupported" } }))).toBe(false);
  expect(selectableProvider(dto("codex", { connected: false }))).toBe(false);
});

test("the default agent is the last one sent from Home while it can run, else the first ready one in order", () => {
  const auth = snapshot(dto("claude"), dto("codex"), dto("copilot", { verified: false }));
  expect(defaultProvider(auth, "codex")).toBe("codex");
  expect(defaultProvider(auth, "copilot")).toBe("copilot");
  expect(defaultProvider(snapshot(dto("claude", { expired: true }), dto("codex")), "claude")).toBe("codex");
  expect(defaultProvider(auth, undefined)).toBe("claude");
  // After a restart every connection is unverified.
  expect(defaultProvider(snapshot(dto("claude", { verified: false }), dto("codex", { verified: false })), undefined)).toBe("claude");
  expect(defaultProvider(snapshot(dto("claude", { connected: false }), dto("codex", { expired: true })), "claude")).toBeNull();
  expect(defaultProvider(null, "claude")).toBeNull();
  expect(defaultProvider(undefined, "claude")).toBeNull();
});

// Models and effort

const OPUS = { id: "opus", label: "Opus 5.5", default: true, efforts: ["low", "medium", "high", "max"] };
const SONNET = { id: "sonnet", label: "Sonnet 5.5", default: false, efforts: ["low", "high"] };
const HAIKU = { id: "haiku", label: "Haiku 5.5", default: false };
const CLAUDE_MODELS: ModelsState = { models: [OPUS, SONNET, HAIKU] };

test("no model is chosen before this run has received the provider's list, whatever ui-state remembers", () => {
  expect(defaultModel(undefined, { model: "sonnet" })).toBeNull();
  expect(defaultModel("loading", { model: "sonnet" })).toBeNull();
  expect(defaultModel({ error: "unavailable" }, { model: "sonnet" })).toBeNull();
});

test("a received list uses the remembered model when listed, else the provider's default", () => {
  expect(defaultModel(CLAUDE_MODELS, { model: "sonnet" })).toBe("sonnet");
  expect(defaultModel(CLAUDE_MODELS, { model: "retired" })).toBe("opus");
  expect(defaultModel(CLAUDE_MODELS, undefined)).toBe("opus");
  expect(defaultModel({ models: [HAIKU] }, undefined)).toBeNull();
});

test("effort returns to the level last chosen for that model only when the model offers it", () => {
  expect(defaultEffort(OPUS, "high")).toBe("high");
  expect(defaultEffort(SONNET, "medium")).toBeNull();
  expect(defaultEffort(HAIKU, "high")).toBeNull();
  expect(defaultEffort(null, "high")).toBeNull();
  expect(defaultEffort(OPUS, undefined)).toBeNull();
});

test("the picker lists connected providers only, in order, with model rows and the Effort hint", () => {
  const auth = snapshot(dto("claude"), dto("codex"), dto("cursor", { connected: false }), dto("copilot", { expired: true }));
  const view = modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "opus", effort: "high" });
  expect(view.groups.map(g => g.provider)).toEqual(["claude", "codex", "copilot"]);
  expect(view.groups[0]).toMatchObject({ name: "Claude Code", selectable: true, cause: null, note: null, read: false });
  expect(view.groups[0]!.rows).toEqual([
    { kind: "model", id: "opus", label: "Opus 5.5", effort: true, selected: true, isDefault: true },
    { kind: "model", id: "sonnet", label: "Sonnet 5.5", effort: true, selected: false, isDefault: false },
    { kind: "model", id: "haiku", label: "Haiku 5.5", effort: false, selected: false, isDefault: false },
  ]);
  expect(view.trigger).toEqual({ provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5, default", placeholder: false, isDefault: true });
  expect(view.effort).toEqual({
    label: "High", ariaLabel: "Effort: High", placeholder: false, menuLabel: "Effort for Opus 5.5", title: "Effort · Opus 5.5",
    unset: { label: "Default", description: "Set by Claude Code", selected: false },
    options: [{ id: "low", label: "Low", selected: false }, { id: "medium", label: "Medium", selected: false }, { id: "high", label: "High", selected: true }, { id: "max", label: "Max", selected: false }],
    fast: null,
  });
});

test("a provider that cannot run is a disabled group with its readiness cause for the shared short status", () => {
  const view = modelPickerView(snapshot(dto("claude"), dto("copilot", { expired: true }), dto("cursor", { facts: { version: "unsupported" } })), {}, { provider: "claude", model: null, effort: null });
  expect(view.groups.find(g => g.provider === "copilot")).toMatchObject({ selectable: false, cause: "reauth_required", rows: [] });
  expect(view.groups.find(g => g.provider === "cursor")).toMatchObject({ selectable: false, cause: "version_unsupported", rows: [] });
});

test("an unverified provider stays selectable and carries its cause", () => {
  const view = modelPickerView(snapshot(dto("antigravity", { verified: false })), {}, { provider: "antigravity", model: null, effort: null });
  expect(view.groups[0]).toMatchObject({ selectable: true, cause: "unverified" });
});

test("a provider without a list yet has a Default row and asks to be read when its group opens; loading and failure keep it", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const choice = { provider: "codex" as const, model: null, effort: null };
  const unread = modelPickerView(auth, {}, choice).groups[1]!;
  expect(unread).toMatchObject({ read: true, note: null, rows: [{ kind: "default", label: "Default", selected: true }] });
  // The draft (frame 05) puts the reading note in the group head beside a spinner, over the Default row.
  const loading = modelPickerView(auth, { codex: "loading" }, choice).groups[1]!;
  expect(loading).toMatchObject({ read: false, note: "Loading models", rows: [{ kind: "default", label: "Default", selected: true }] });
  for (const state of [{ error: "unavailable" }, { models: [] }] as ModelsState[]) {
    expect(modelPickerView(auth, { codex: state }, choice).groups[1]).toMatchObject({ read: false, note: "Models unavailable", rows: [{ kind: "default", label: "Default", selected: true }] });
  }
  // With no model chosen the trigger names its drawer; the group head names the provider.
  for (const state of [undefined, "loading", { error: "unavailable" }] as ModelsState[]) {
    expect(modelPickerView(auth, { codex: state }, choice).trigger).toEqual({ provider: "codex", label: "Model", ariaLabel: "Agent: Codex, model not chosen", placeholder: true, isDefault: false });
  }
  expect(modelPickerView(auth, {}, choice).effort).toBeNull();
});

// Copilot lists its models without a request (2026-10-29 user), so it is read like the others.
test("Copilot's list is read automatically like every other provider's, with no lazy-read row", () => {
  const group = modelPickerView(snapshot(dto("copilot")), {}, { provider: "copilot", model: null, effort: null }).groups[0]!;
  expect(group).toMatchObject({ read: true, rows: [{ kind: "default", label: "Default", selected: true }] });
  expect(JSON.stringify(group)).not.toContain("Load models");
});

test("the effort capsule shows only for a model with levels; an unchosen level names the drawer when the default is unknown", () => {
  const auth = snapshot(dto("claude"));
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "haiku", effort: null }).effort).toBeNull();
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "sonnet", effort: null }).effort).toMatchObject({ label: "Effort", ariaLabel: "Effort: default", placeholder: true });
  expect(modelPickerView(auth, { claude: { models: [{ ...OPUS, efforts: ["xhigh"] }] } }, { provider: "claude", model: "opus", effort: "xhigh" }).effort?.label).toBe("Extra high");
  // A chosen model that is no longer listed reads as no model.
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "retired", effort: "high" })).toMatchObject({ trigger: { label: "Model", placeholder: true }, effort: null });
});

const LUNA = { id: "gpt-6-luna", label: "GPT-6-Luna", default: true, efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "medium" };
const TERRA = { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false, efforts: ["low", "medium", "high"] };
const CODEX_MODELS: ModelsState = { models: [LUNA, TERRA] };
// The 2026-11-06 shape after main's pairing: Claude Code's default row carries its model's name, the opus row is gone.
const CLAUDE_DEFAULT = { id: "default", label: "Opus 5.5", default: true, efforts: ["low", "medium", "high", "max"] };
const PAIRED: ModelsState = { models: [CLAUDE_DEFAULT, SONNET, HAIKU] };

test("the model menu marks every provider's default row, whichever provider is chosen", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const view = modelPickerView(auth, { claude: PAIRED, codex: CODEX_MODELS }, { provider: "codex", model: "gpt-5.6-terra", effort: null });
  expect(view.groups[0]!.rows.map(row => row.kind === "model" && [row.id, row.isDefault, row.selected])).toEqual([["default", true, false], ["sonnet", false, false], ["haiku", false, false]]);
  expect(view.groups[1]!.rows.map(row => row.kind === "model" && [row.id, row.isDefault, row.selected])).toEqual([["gpt-6-luna", true, false], ["gpt-5.6-terra", false, true]]);
  expect(view.trigger).toEqual({ provider: "codex", label: "GPT-5.6-Terra", ariaLabel: "Agent: Codex, model GPT-5.6-Terra", placeholder: false, isDefault: false });
});

test("after switching provider, the trigger names its drawer until the new provider's list is read", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  // The composer resolves the model from the new provider's list, which is not read yet, so no model is chosen.
  const view = modelPickerView(auth, { claude: PAIRED, codex: "loading" }, { provider: "codex", model: defaultModel("loading", undefined), effort: null });
  expect(view.trigger).toMatchObject({ provider: "codex", label: "Model", placeholder: true });
  // The other group keeps its default mark, unselected.
  expect(view.groups[0]!.rows[0]).toMatchObject({ id: "default", isDefault: true, selected: false });
});

test("the trigger follows defaultModel: a fixed Settings default beats Last used (POSTMORTEM 2026-11-02)", () => {
  const auth = snapshot(dto("claude"));
  const trigger = (model: string | null) => modelPickerView(auth, { claude: PAIRED }, { provider: "claude", model, effort: null }).trigger;
  expect(trigger(defaultModel(PAIRED, { model: "sonnet" }, { provider: "claude", model: "haiku" }))).toMatchObject({ label: "Haiku 5.5", isDefault: false });
  // A fixed agent without a model is the provider's default, not the model remembered.
  expect(trigger(defaultModel(PAIRED, { model: "sonnet" }, { provider: "claude" }))).toMatchObject({ label: "Opus 5.5", isDefault: true, ariaLabel: "Agent: Claude Code, model Opus 5.5, default" });
  expect(trigger(defaultModel(PAIRED, { model: "sonnet" }, null))).toMatchObject({ label: "Sonnet 5.5", isDefault: false });
});

test("an existing conversation's stored model: listed, no longer listed (an older \"opus\"), or never stored", () => {
  const auth = snapshot(dto("claude"));
  const trigger = (stored: string | undefined) => modelPickerView(auth, { claude: PAIRED }, { provider: "claude", model: defaultModel(PAIRED, stored ? { model: stored } : undefined), effort: null }).trigger;
  expect(trigger("sonnet")).toMatchObject({ label: "Sonnet 5.5", isDefault: false, ariaLabel: "Agent: Claude Code, model Sonnet 5.5" });
  expect(trigger("opus")).toMatchObject({ label: "Opus 5.5", isDefault: true, ariaLabel: "Agent: Claude Code, model Opus 5.5, default" });
  expect(trigger(undefined)).toMatchObject({ label: "Opus 5.5", isDefault: true });
});

test("effort with nothing chosen shows Codex's default level, else the drawer's name; the Default row stays out of the options", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const effort = (provider: Provider, models: ModelsState, model: string, level: string | null, fast?: boolean) =>
    modelPickerView(auth, { [provider]: models }, { provider, model, effort: level, ...(fast === undefined ? {} : { fast }) }).effort!;
  const luna = effort("codex", CODEX_MODELS, "gpt-6-luna", null);
  expect(luna).toMatchObject({ label: "Medium", ariaLabel: "Effort: Medium, default", placeholder: false, unset: { label: "Default", description: "Medium for this model", selected: true } });
  expect(luna.options.map(item => item.id)).toEqual(["low", "medium", "high", "xhigh"]);
  expect(luna.options.some(item => item.selected)).toBe(false);
  // A Codex model without a default level, and Claude Code, which never gives one.
  expect(effort("codex", CODEX_MODELS, "gpt-5.6-terra", null)).toMatchObject({ label: "Effort", ariaLabel: "Effort: default", placeholder: true, unset: { description: "Set by Codex", selected: true } });
  expect(effort("claude", PAIRED, "default", null)).toMatchObject({ label: "Effort", ariaLabel: "Effort: default", placeholder: true, unset: { description: "Set by Claude Code", selected: true } });
  // A chosen level, even the default's own, is a choice: no default tail, the Default row unchecked.
  expect(effort("codex", CODEX_MODELS, "gpt-6-luna", "medium")).toMatchObject({ label: "Medium", ariaLabel: "Effort: Medium", placeholder: false, unset: { selected: false } });
  expect(effort("codex", CODEX_MODELS, "gpt-6-luna", "xhigh")).toMatchObject({ label: "Extra high", ariaLabel: "Effort: Extra high" });
  // Fast keeps its tail after the default one.
  expect(effort("claude", { models: [{ ...CLAUDE_DEFAULT, fast: {} }] }, "default", null, true).ariaLabel).toBe("Effort: default, Fast on");
  expect(effort("codex", { models: [{ ...LUNA, fast: {} }] }, "gpt-6-luna", null, false).ariaLabel).toBe("Effort: Medium, default, Fast off");
});

test("ACP: the default mark sits on the current model's row only, and nowhere when it is not listed", () => {
  const auth = snapshot(dto("copilot"), dto("antigravity"));
  const marks = (provider: Provider, models: ModelsState) => {
    const view = modelPickerView(auth, { [provider]: models }, { provider, model: defaultModel(models, undefined), effort: null });
    return { trigger: view.trigger, rows: view.groups.find(group => group.provider === provider)!.rows };
  };
  // Copilot's second `auto` is dropped in main (parseAcpModels), so one row is left to carry the mark.
  const copilot = marks("copilot", { models: [{ id: "auto", label: "Auto", default: true }, { id: "gpt-5.6", label: "GPT-5.6", default: false }] });
  expect(copilot.rows.filter(row => row.kind === "model" && row.isDefault).map(row => row.kind === "model" && row.id)).toEqual(["auto"]);
  expect(copilot.trigger).toMatchObject({ label: "Auto", isDefault: true, ariaLabel: "Agent: GitHub Copilot, model Auto, default" });
  // Antigravity puts the effort in the model id: only the current one of the three is the default.
  const ids = ["gemini-3-pro-low", "gemini-3-pro-medium", "gemini-3-pro-high"];
  const antigravity = marks("antigravity", { models: ids.map(id => ({ id, label: id, default: id === "gemini-3-pro-medium" })) });
  expect(antigravity.rows.map(row => row.kind === "model" && row.isDefault)).toEqual([false, true, false]);
  const none = marks("antigravity", { models: ids.map(id => ({ id, label: id, default: false })) });
  expect(none.rows.some(row => row.kind === "model" && row.isDefault)).toBe(false);
  expect(none.trigger).toMatchObject({ label: "Model", placeholder: true });
});

test("with no agent that can run the trigger says so", () => {
  const view = modelPickerView(snapshot(dto("claude", { expired: true })), {}, { provider: null, model: null, effort: null });
  expect(view.trigger).toEqual({ provider: null, label: "No agent ready", ariaLabel: "Agent: none ready", placeholder: false, isDefault: false });
  expect(modelPickerView(undefined, {}, { provider: null, model: null, effort: null }).groups).toEqual([]);
});

// Presets: suggestions, search, list view

test("suggested presets follow the project's canvases, skipping ids the CLI did not list", () => {
  expect(suggestedPresets(list("/r/p"), PRESETS).map(p => p.id)).toEqual(["context", "shape", "document"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/home.html")]), PRESETS).map(p => p.id)).toEqual(["document", "critique", "polish"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/ds/button.html"), canvas(".doan/canvases/home.html")]), PRESETS).map(p => p.id)).toEqual(["critique", "polish"]);
  expect(suggestedPresets(list("/r/p"), PRESETS.filter(p => p.id !== "shape")).map(p => p.id)).toEqual(["context", "document"]);
  expect(suggestedPresets(missing("/r/p"), PRESETS)).toEqual([]);
  expect(suggestedPresets(null, PRESETS)).toEqual([]);
});

// Only .doan/canvases/ counts as screens, and only .doan/ds/ as a design system.
test("design-system canvases alone leave the project without canvases, minus document", () => {
  expect(suggestedPresets(list("/r/p", [canvas(".doan/ds/color.html"), canvas(".doan/ds/button.html")]), PRESETS).map(p => p.id)).toEqual(["context", "shape"]);
  expect(suggestedPrompts(list("/r/p", [canvas(".doan/ds/color.html")]), "p", PRESETS).map(p => p.label)).toEqual(["Get to know this project", "Plan the first screen"]);
});

test("a legacy .doan/canvases/design-system.html counts as a screen", () => {
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/design-system.html"), canvas(".doan/canvases/home.html")]), PRESETS).map(p => p.id)).toEqual(["document", "critique", "polish"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/tokens.html", { id: "design-system" })]), PRESETS).map(p => p.id)).toEqual(["document", "critique", "polish"]);
  const legacy = list("/r/p", [canvas(".doan/canvases/design-system.html", { mtimeMs: 2 })]);
  expect(suggestedPrompts(legacy, "p", PRESETS).map(p => p.label)).toEqual(["Document the design system of p", "Review the design-system canvas", "Polish the design-system canvas"]);
});

test("suggested prompts name the target canvas by recency and fill a sentence with its path", () => {
  const entry = list("/r/doan-design", [
    canvas(".doan/canvases/app-shell.html", { mtimeMs: 10 }),
    canvas(".doan/canvases/doan-onboarding.html", { mtimeMs: 30 }),
    canvas(".doan/canvases/projects-home.html", { mtimeMs: 20 }),
  ]);
  expect(suggestedPrompts(entry, "doan-design", PRESETS)).toEqual([
    { label: "Document the design system of doan-design", parts: [{ text: "Document the design system of ", value: false }, { text: "doan-design", value: true }], preset: preset("document"), text: "Document the design system of doan-design." },
    { label: "Review the doan-onboarding canvas", parts: [{ text: "Review the ", value: false }, { text: "doan-onboarding", value: true }, { text: " canvas", value: false }], preset: preset("critique"), text: "Review the doan-onboarding canvas (.doan/canvases/doan-onboarding.html)." },
    { label: "Polish the projects-home canvas", parts: [{ text: "Polish the ", value: false }, { text: "projects-home", value: true }, { text: " canvas", value: false }], preset: preset("polish"), text: "Polish the projects-home canvas (.doan/canvases/projects-home.html)." },
  ]);
});

test("one canvas is both critiqued and polished; a design-system canvas drops the document prompt and is never a target; file stems name canvases", () => {
  const one = list("/r/p", [canvas(".doan/canvases/home.html", {})]);
  expect(suggestedPrompts(one, "p", PRESETS).map(p => p.label)).toEqual(["Document the design system of p", "Review the home canvas", "Polish the home canvas"]);
  const ds = list("/r/p", [canvas(".doan/ds/button.html", { mtimeMs: 3 }), canvas(".doan/canvases/home.html", { mtimeMs: 2 }), canvas(".doan/canvases/list.html", { mtimeMs: 1 })]);
  expect(suggestedPrompts(ds, "p", PRESETS).map(p => p.label)).toEqual(["Review the home canvas", "Polish the list canvas"]);
});

test("a project without canvases gets the three starting prompts; missing presets are skipped", () => {
  expect(suggestedPrompts(list("/r/p"), "p", PRESETS)).toEqual([
    { label: "Get to know this project", parts: [{ text: "Get to know this project", value: false }], preset: preset("context"), text: "Get to know this project." },
    { label: "Plan the first screen", parts: [{ text: "Plan the first screen", value: false }], preset: preset("shape"), text: "Plan the first screen." },
    { label: "Document the design system", parts: [{ text: "Document the design system", value: false }], preset: preset("document"), text: "Document the design system." },
  ]);
  expect(suggestedPrompts(list("/r/p"), "p", PRESETS.filter(p => p.id !== "context")).map(p => p.preset.id)).toEqual(["shape", "document"]);
  expect(suggestedPrompts(missing("/r/p"), "p", PRESETS)).toEqual([]);
});

test("suggested prompt parts join back to the label and mark only the project and canvas names as values", () => {
  const entry = list("/r/p", [canvas(".doan/canvases/context-window_ring.html", { mtimeMs: 2 }), canvas(".doan/canvases/home.html", { mtimeMs: 1 })]);
  const prompts = suggestedPrompts(entry, "my-project", PRESETS);
  expect(prompts.map(p => p.parts.map(part => part.text).join(""))).toEqual(prompts.map(p => p.label));
  expect(prompts.map(p => p.parts.filter(part => part.value).map(part => part.text))).toEqual([["my-project"], ["context-window_ring"], ["home"]]);
  expect(prompts[1]!.text).toBe("Review the context-window_ring canvas (.doan/canvases/context-window_ring.html).");
  const starting = suggestedPrompts(list("/r/p"), "p", PRESETS);
  expect(starting.every(p => p.parts.length === 1 && !p.parts[0]!.value)).toBe(true);
});

test("search matches every token over title, id, scope and description, NFC and case-insensitive, prefix first", () => {
  expect(searchPresets(PRESETS, "cri").map(p => p.id)).toEqual(["critique"]);
  // Equal scores keep catalog order; "the" inside "Gather" is only a substring.
  expect(searchPresets(PRESETS, "THE DESIGN").map(p => p.id)).toEqual(["document", "critique", "context"]);
  expect(searchPresets(PRESETS, "  ").map(p => p.id)).toEqual(PRESETS.map(p => p.id));
  expect(searchPresets(PRESETS, "edge-case").map(p => p.id)).toEqual([]);
  expect(searchPresets([{ id: "cafe", title: "Café", description: "", scope: "" }], "café".normalize("NFD")).map(p => p.id)).toEqual(["cafe"]);
  // Word start ranks above a substring.
  const rows: PresetSummary[] = [{ id: "a", title: "Overlay", description: "", scope: "" }, { id: "b", title: "Fix the layout", description: "", scope: "" }];
  expect(searchPresets(rows, "lay").map(p => p.id)).toEqual(["b", "a"]);
});

test("the list view is loading until the first reply", () => {
  expect(presetListView(undefined, { project: "doan-design", suggested: [], query: "", tab: null })).toEqual({ kind: "loading", text: "Loading presets" });
});

test("a CLI failure explains why with Retry; a refusal has no Retry; an older CLI asks for an update", () => {
  const failed = (reason: "unavailable" | "timeout" | "invalid_response" | "failed"): PresetListReply => ({ v: 1, ok: false, error: { code: "cli_error", reason, message: "x", nextSteps: [] } });
  const opts = { project: "p", suggested: [], query: "", tab: null };
  expect(presetListView(failed("timeout"), opts)).toEqual({ kind: "error", text: "Doan couldn’t read the design presets: the doan CLI didn’t answer in time. You can still send without one.", retry: true });
  expect(presetListView(failed("unavailable"), opts)).toEqual({ kind: "error", text: "Doan couldn’t read the design presets: the doan CLI couldn’t start. You can still send without one.", retry: true });
  expect(presetListView(failed("invalid_response"), opts)).toEqual({ kind: "error", text: "Doan couldn’t read the design presets: Doan couldn’t read the CLI’s answer. You can still send without one.", retry: true });
  expect(presetListView(failed("failed"), opts)).toEqual({ kind: "error", text: "Doan couldn’t read the design presets: the doan CLI stopped without a result. You can still send without one.", retry: true });
  expect(presetListView({ v: 1, ok: false, error: { code: "request_refused", message: "x", nextSteps: [] } }, opts))
    .toEqual({ kind: "error", text: "Doan refused this preset request. You can still send without a preset.", retry: false });
  expect(presetListView({ v: 1, ok: false, error: { code: "usage_error", message: "x", nextSteps: [] } }, opts))
    .toEqual({ kind: "olderCli", text: "This doan CLI has no design presets. Update Doan to use them." });
  expect(presetListView({ v: 1, ok: false, error: { code: "internal_error", message: "x", nextSteps: [] } }, opts))
    .toEqual({ kind: "error", text: "Doan couldn’t read the design presets. You can still send without one.", retry: true });
});

test("grouped presets show Suggested and the five tabs; a tab shows its group in catalog order", () => {
  const suggested = [preset("document"), preset("critique"), preset("polish")];
  const view = presetListView(listed(), { project: "doan-design", suggested, query: "", tab: null });
  expect(view.kind).toBe("list");
  if (view.kind !== "list") return;
  expect(view.tabs).toEqual([
    { key: "suggested", label: "Suggested", icon: "pencil-sparkles", selected: true },
    { key: "start", label: "Start", icon: "compass", selected: false },
    { key: "review", label: "Review", icon: "scan-eye", selected: false },
    { key: "refine", label: "Refine", icon: "paintbrush", selected: false },
    { key: "content", label: "Content", icon: "text-align-start", selected: false },
    { key: "explore", label: "Explore", icon: "shapes", selected: false },
  ]);
  expect(view.sections).toEqual([{ title: "Suggested for doan-design", rows: suggested.map(p => ({ kind: "preset", key: `preset:${p.id}`, icon: groupIcon(p.group), id: p.id, title: p.title, description: p.description, scope: p.scope, tooltip: `${p.description} (/${p.id})`, group: null })) }]);
  const refine = presetListView(listed(), { project: "doan-design", suggested, query: "", tab: "refine" });
  if (refine.kind !== "list") throw new Error("list");
  expect(refine.sections).toHaveLength(1);
  expect(refine.sections[0]!.title).toBe("Refine");
  expect(refine.sections[0]!.rows.map(r => r.id)).toEqual(["polish", "bolder", "quieter", "layout", "typeset", "colorize"]);
});

test("no suggestions hides the Suggested tab and opens Start; an unknown group keeps its key and the default icon", () => {
  const view = presetListView(listed([...PRESETS, { id: "x", title: "X", description: "d", scope: "s", group: "lab" }]), { project: "p", suggested: [], query: "", tab: null });
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs.map(t => [t.key, t.selected])).toEqual([["start", true], ["review", false], ["refine", false], ["content", false], ["explore", false], ["lab", false]]);
  expect(view.tabs.at(-1)).toEqual({ key: "lab", label: "lab", icon: "pencil-sparkles", selected: false });
});

test("a query searches every group, drops the tabs and names each row's group", () => {
  const view = presetListView(listed(), { project: "p", suggested: [preset("critique")], query: "cri", tab: "refine" });
  expect(view).toEqual({ kind: "list", tabs: [], sections: [{ title: null, rows: [{ kind: "preset", key: "preset:critique", icon: "scan-eye", id: "critique", title: "Critique the design", description: "About critique.", scope: "critique scope", tooltip: "About critique. (/critique)", group: "Review" }] }], summary: "1 preset matches cri" });
  const two = presetListView(listed(), { project: "p", suggested: [], query: "the", tab: null });
  if (two.kind !== "list") throw new Error("list");
  expect(two.summary).toBe(`${two.sections[0]!.rows.length} presets match the`);
});

test("no match says so with the query", () => {
  expect(presetListView(listed(), { project: "p", suggested: [], query: "wireframe", tab: null })).toEqual({ kind: "empty", text: "No presets match “wireframe”." });
});

test("an older CLI without groups shows Suggested and All presets without tabs", () => {
  const view = presetListView(listed(UNGROUPED), { project: "p", suggested: [UNGROUPED[0]!], query: "", tab: null });
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs).toEqual([]);
  expect(view.sections.map(s => [s.title, s.rows.length])).toEqual([["Suggested for p", 1], ["All presets", 20]]);
  const plain = presetListView(listed(UNGROUPED), { project: "p", suggested: [], query: "", tab: null });
  if (plain.kind !== "list") throw new Error("list");
  expect(plain.sections.map(s => s.title)).toEqual(["All presets"]);
});

test("the / list has no tabs: an empty query lists every preset in catalog order with its group", () => {
  const view = presetListView(listed(), { project: "p", suggested: [preset("critique")], query: "", tab: null, slash: true });
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs).toEqual([]);
  expect(view.sections[0]!.rows.map(r => r.id)).toEqual(PRESETS.map(p => p.id));
  expect(view.sections[0]!.rows[0]!.group).toBe("Start");
});

// Greeting

test("the greeting never repeats the previous one and drops the project question without a project", () => {
  expect(GREETINGS).toEqual(["What should we design today?", "What are we making next?", "What would you like to change?", "What’s next for <project>?", "Where should we start?"]);
  for (let i = 0; i < 10; i++) {
    const r = i / 10;
    expect(pickGreeting(GREETINGS[0]!, () => r, true)).not.toBe(GREETINGS[0]);
    expect(pickGreeting(null, () => r, false)).not.toContain("<project>");
  }
  expect(pickGreeting(null, () => 0, true)).toBe(GREETINGS[0]);
  expect(pickGreeting(null, () => 0.999, true)).toBe(GREETINGS[4]);
  expect(pickGreeting(GREETINGS[4]!, () => 0.999, true)).toBe(GREETINGS[3]);
});

test("the greeting keeps its sentence and follows only the chosen project's name", () => {
  const picked = pickGreeting(null, () => 0.7, true);
  expect(picked).toBe("What’s next for <project>?");
  expect(greetingText(picked, "doan-design")).toBe("What’s next for doan-design?");
  expect(greetingText(picked, "malmoi")).toBe("What’s next for malmoi?");
  expect(greetingText(picked, null)).toBe("What should we design today?");
  expect(greetingText("Where should we start?", "malmoi")).toBe("Where should we start?");
});

// Keys and the / shortcut

test("Enter sends, Shift+Enter and Enter during IME composition do not", () => {
  const key = (over: Partial<Parameters<typeof isSubmitKey>[0]>) => isSubmitKey({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...over });
  expect(key({})).toBe(true);
  expect(key({ shiftKey: true })).toBe(false);
  expect(key({ isComposing: true })).toBe(false);
  expect(key({ keyCode: 229 })).toBe(false);
  expect(key({ key: "a", keyCode: 65 })).toBe(false);
});

test("/ at the very start of the field opens the preset query until dismissed", () => {
  expect(slashQuery("/", false)).toBe("");
  expect(slashQuery("/cri", false)).toBe("cri");
  expect(slashQuery("/cri tic", false)).toBe("cri tic");
  expect(slashQuery("/cri", true)).toBeNull();
  expect(slashQuery(" /cri", false)).toBeNull();
  expect(slashQuery("Draw /cri", false)).toBeNull();
  expect(slashQuery("/cri\nmore", false)).toBeNull();
  expect(slashQuery("", false)).toBeNull();
});

// Attachments

test("ten attachments fit; the eleventh is left out with a count", () => {
  expect(MAX_ATTACHMENTS).toBe(10);
  expect(attachmentLimit(9, [{ pasted: false, size: 1 }])).toEqual({ accept: [0], notices: [] });
  expect(attachmentLimit(9, [{ pasted: false, size: 1 }, { pasted: false, size: 1 }])).toEqual({ accept: [0], notices: ["Only 10 files can be attached. 1 was left out."] });
  expect(attachmentLimit(8, Array.from({ length: 4 }, () => ({ pasted: false, size: 1 })))).toEqual({ accept: [0, 1], notices: ["Only 10 files can be attached. 2 were left out."] });
  expect(attachmentLimit(10, [{ pasted: true, size: 1 }]).accept).toEqual([]);
});

test("a pasted image may be 50 MB, not a byte more; local files have no size limit", () => {
  expect(MAX_PASTED_BYTES).toBe(50 * 1024 * 1024);
  expect(attachmentLimit(0, [{ pasted: true, size: MAX_PASTED_BYTES }])).toEqual({ accept: [0], notices: [] });
  expect(attachmentLimit(0, [{ pasted: true, size: MAX_PASTED_BYTES + 1 }])).toEqual({ accept: [], notices: ["This image is over 50 MB, so it wasn’t attached."] });
  expect(attachmentLimit(0, [{ pasted: false, size: MAX_PASTED_BYTES * 4 }])).toEqual({ accept: [0], notices: [] });
  // An oversized paste does not take one of the ten places.
  expect(attachmentLimit(9, [{ pasted: true, size: MAX_PASTED_BYTES + 1 }, { pasted: false, size: 1 }])).toEqual({ accept: [1], notices: ["This image is over 50 MB, so it wasn’t attached."] });
});

test("chips show type and size, a checking state, a pasted image and a moved file", () => {
  const home = "/Users/ada";
  expect(attachmentChipView(attachment("onboarding.png", { kind: "image", size: 412 * 1024 }), home))
    .toEqual({ label: "onboarding.png", meta: "PNG · 412 KB", tooltip: "~/Desktop/onboarding.png", removeLabel: "Remove onboarding.png", thumbnail: true, notice: null, problem: false });
  expect(attachmentChipView(attachment("brand-guidelines.pdf", { size: 1.2 * 1024 * 1024 }), home).meta).toBe("PDF · 1.2 MB");
  expect(attachmentChipView(attachment("tiny.txt", { size: 900 }), home).meta).toBe("TXT · 900 B");
  expect(attachmentChipView(attachment("Makefile", { size: 2048 }), home).meta).toBe("2 KB");
  expect(attachmentChipView((({ size: _size, ...rest }) => rest)(attachment("research-notes.md", { status: "checking" })), home)).toMatchObject({ meta: "Checking", thumbnail: false, problem: false });
  expect(attachmentChipView(attachment("ignored.png", { kind: "image", pasted: true, size: 2.4 * 1024 * 1024, path: "/Users/ada/Library/doan/attachments/a1/pasted-1.png" }), home))
    .toMatchObject({ label: "Pasted image", meta: "PNG · 2.4 MB", removeLabel: "Remove pasted image", thumbnail: true });
  expect(attachmentChipView(attachment("brand-guidelines.pdf", { status: "missing" }), home))
    .toMatchObject({ meta: "Moved or deleted", problem: true, notice: "brand-guidelines.pdf was moved or deleted. Remove it, or attach it again." });
});

test("a canvas capture chip is named Canvas capture, also while checking and when moved; only a pasted capture-named file is one", () => {
  const home = "/Users/ada";
  const name = "canvas-capture-2026-11-05T01-02-03-456Z.png";
  expect(attachmentChipView(attachment(name, { kind: "image", pasted: true, size: 2.4 * 1024 * 1024, path: `/Users/ada/Library/doan/attachments/a1/${name}` }), home))
    .toMatchObject({ label: "Canvas capture", meta: "PNG · 2.4 MB", removeLabel: "Remove canvas capture", thumbnail: true, notice: null, problem: false });
  expect(attachmentChipView((({ size: _size, ...rest }) => rest)(attachment(name, { kind: "image", pasted: true, status: "checking" })), home))
    .toMatchObject({ label: "Canvas capture", meta: "Checking", removeLabel: "Remove canvas capture" });
  expect(attachmentChipView(attachment(name, { kind: "image", pasted: true, status: "missing" }), home))
    .toMatchObject({ label: "Canvas capture", notice: "Canvas capture was moved or deleted. Remove it, or attach it again.", problem: true });
  // A path attachment that happens to share the name keeps its file name, and another paste stays a pasted image.
  expect(attachmentChipView(attachment(name, { kind: "image", pasted: false, size: 1024 }), home))
    .toMatchObject({ label: name, meta: "PNG · 1 KB", removeLabel: `Remove ${name}` });
  expect(attachmentChipView(attachment(name, { kind: "image", pasted: false, status: "missing" }), home).notice)
    .toBe(`${name} was moved or deleted. Remove it, or attach it again.`);
  expect(attachmentChipView(attachment("pasted-2026-11-05T01-02-03-456Z.png", { kind: "image", pasted: true, size: 1024 }), home))
    .toMatchObject({ label: "Pasted image", removeLabel: "Remove pasted image" });
});

test("a drop on the composer attaches files and refuses folders, pointing to Add Projects", () => {
  expect(dropTarget([{ isDirectory: false }, { isDirectory: false }])).toEqual({ files: [0, 1], notice: null });
  expect(dropTarget([{ isDirectory: true }])).toEqual({ files: [], notice: "Folders can’t be attached. Add a project from Add Projects." });
  expect(dropTarget([{ isDirectory: true }, { isDirectory: false }])).toEqual({ files: [1], notice: "Folders can’t be attached. Add a project from Add Projects." });
});

test("Backspace at the start of an empty field removes the preset chip first, then the last attachment", () => {
  const chips = [{ label: "a.png" }, { label: "b.pdf" }, { label: "Document the design system", preset: true }];
  const empty = { text: "", caret: 0 };
  expect(chipRemoval(chips, { kind: "backspace", ...empty })).toEqual({ remove: 2, announcement: "Removed Document the design system", focus: "textarea" });
  expect(chipRemoval(chips.slice(0, 2), { kind: "backspace", ...empty })).toEqual({ remove: 1, announcement: "Removed b.pdf", focus: "textarea" });
  expect(chipRemoval(chips, { kind: "backspace", text: "x", caret: 0 })).toBeNull();
  expect(chipRemoval(chips, { kind: "backspace", text: "", caret: 1 })).toBeNull();
  expect(chipRemoval([], { kind: "backspace", ...empty })).toBeNull();
});

test("removing a chip with × moves focus to the next chip's ×, else the field", () => {
  const chips = [{ label: "a.png" }, { label: "b.pdf" }, { label: "Critique the design", preset: true }];
  expect(chipRemoval(chips, { kind: "button", index: 0 })).toEqual({ remove: 0, announcement: "Removed a.png", focus: 0 });
  expect(chipRemoval(chips, { kind: "button", index: 1 })).toEqual({ remove: 1, announcement: "Removed b.pdf", focus: 1 });
  expect(chipRemoval(chips, { kind: "button", index: 2 })).toEqual({ remove: 2, announcement: "Removed Critique the design", focus: "textarea" });
  expect(chipRemoval(chips, { kind: "button", index: 5 })).toBeNull();
});

test("group keys map to their names and icons; an unknown key keeps its name and the default icon", () => {
  expect(["start", "review", "refine", "content", "explore", "lab", undefined].map(k => [groupLabel(k), groupIcon(k)])).toEqual([
    ["Start", "compass"], ["Review", "scan-eye"], ["Refine", "paintbrush"], ["Content", "text-align-start"], ["Explore", "shapes"], ["lab", "pencil-sparkles"], [null, "pencil-sparkles"],
  ]);
});

// The fixed preference from Settings comes first, then today's rules.
test("new conversation default: the fixed agent wins over the last one sent while it can run", () => {
  const auth = snapshot(dto("claude"), dto("codex"), dto("copilot", { verified: false }));
  expect(defaultProvider(auth, "claude", { provider: "codex" })).toBe("codex");
  // After a restart connections read unverified; main checks them on send, so the fixed one still applies.
  expect(defaultProvider(auth, "claude", { provider: "copilot" })).toBe("copilot");
  expect(defaultProvider(auth, "codex", null)).toBe("codex");
});

test("new conversation default: a fixed agent that is not signed in or cannot run falls back to the last one sent, then the first ready", () => {
  const auth = snapshot(dto("claude"), dto("codex", { expired: true }), dto("cursor", { connected: false }));
  expect(defaultProvider(auth, "claude", { provider: "codex" })).toBe("claude");
  expect(defaultProvider(auth, undefined, { provider: "cursor" })).toBe("claude");
  expect(defaultProvider(snapshot(dto("codex", { expired: true })), "claude", { provider: "codex" })).toBeNull();
});

test("new conversation default: the fixed preference applies only to its own agent", () => {
  expect(fixedPreference({ provider: "claude", model: "sonnet" }, "claude")).toEqual({ provider: "claude", model: "sonnet" });
  expect(fixedPreference({ provider: "claude", model: "sonnet" }, "codex")).toBeNull();
  expect(fixedPreference(null, "claude")).toBeNull();
});

test("new conversation default: the fixed model when this project lists it, else the provider's default, never the remembered one", () => {
  expect(defaultModel(CLAUDE_MODELS, { model: "sonnet" }, { provider: "claude", model: "haiku" })).toBe("haiku");
  expect(defaultModel(CLAUDE_MODELS, { model: "sonnet" }, { provider: "claude", model: "retired" })).toBe("opus");
  // Model Default in Settings is the provider's default, not the model sent last.
  expect(defaultModel(CLAUDE_MODELS, { model: "sonnet" }, { provider: "claude" })).toBe("opus");
  expect(defaultModel("loading", { model: "sonnet" }, { provider: "claude", model: "haiku" })).toBeNull();
  expect(defaultModel(CLAUDE_MODELS, { model: "sonnet" }, null)).toBe("sonnet");
});

test("new conversation default: the fixed effort when the model offers it, else the provider's default, never the remembered one", () => {
  expect(defaultEffort(OPUS, "low", { provider: "claude", model: "opus", effort: "high" })).toBe("high");
  expect(defaultEffort(SONNET, "low", { provider: "claude", model: "opus", effort: "max" })).toBeNull();
  expect(defaultEffort(OPUS, "low", { provider: "claude", model: "opus" })).toBeNull();
  expect(defaultEffort(OPUS, "low", null)).toBe("low");
});


test("steerKey accepts only Control+Enter outside IME composition", () => {
  const event = { key: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 13 };
  expect(steerKey(event)).toBe(true);
  for (const change of [{ key: "a" }, { ctrlKey: false }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    expect(steerKey({ ...event, ...change })).toBe(false);
  }
});

// Only a plain → on an empty field outside IME composition takes the
// suggestion shown; every modifier keeps its own meaning (selection, word and line moves).
test("takesSuggestion accepts only a plain Right Arrow on an empty field while a suggestion shows", () => {
  const event = { key: "ArrowRight", shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 39 };
  const state = { suggestion: "Make the header lighter", empty: true, composing: false };
  expect(takesSuggestion(event, state)).toBe(true);
  for (const change of [{ key: "ArrowLeft", keyCode: 37 }, { key: "Tab", keyCode: 9 }, { key: "Enter", keyCode: 13 }, { shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    expect(takesSuggestion({ ...event, ...change }, state)).toBe(false);
  }
  for (const change of [{ suggestion: null }, { empty: false }, { composing: true }]) {
    expect(takesSuggestion(event, { ...state, ...change })).toBe(false);
  }
});

// The Fast switch row under the Effort levels, and its trigger name.
const FAST_OPUS = { ...OPUS, fast: {} };
const SOL = { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", default: true, efforts: ["low", "high"], fast: { description: "2x speed, increased usage" } };
test("the switch row shows only for a Claude or Codex model with Fast and effort levels, and never in Settings", () => {
  const auth = snapshot(dto("claude"), dto("codex"), dto("cursor"));
  const claude: ModelsState = { models: [FAST_OPUS, SONNET, { ...HAIKU, fast: {} }] };
  // choice null: the composer offers no Fast (Settings), so the choice has no fast field.
  const fast = (provider: Provider, models: ModelsState, model: string | null, choice: boolean | null = true) =>
    modelPickerView(auth, { [provider]: models }, { provider, model, effort: "high", ...(choice === null ? {} : { fast: choice }) }).effort?.fast;
  expect(fast("claude", claude, "opus")).toEqual({ on: true, description: "Same model, faster output. Requires usage credits." });
  expect(fast("codex", { models: [SOL] }, "gpt-6.1-sol", false)).toEqual({ on: false, description: "2x speed, increased usage" });
  // A Codex tier without a description has none.
  expect(fast("codex", { models: [{ ...SOL, fast: {} }] }, "gpt-6.1-sol")).toEqual({ on: true });
  // No Fast: a model without it, no model (the list not read or failed), a model without levels, an ACP provider, Settings.
  expect(fast("claude", claude, "sonnet")).toBeNull();
  expect(modelPickerView(auth, { claude: "loading" }, { provider: "claude", model: null, effort: null, fast: true }).effort).toBeNull();
  expect(fast("claude", claude, "haiku")).toBeUndefined();
  expect(fast("cursor", { models: [{ id: "auto", label: "Auto", default: true, efforts: ["high"], fast: {} }] }, "auto")).toBeNull();
  expect(fast("claude", claude, "opus", null)).toBeNull();
});

test("Fast on or off changes the trigger's name, never its label; an unavailable row is off with its reason", () => {
  const auth = snapshot(dto("claude"));
  const view = (fast: boolean, models: ModelsState = { models: [FAST_OPUS] }) => modelPickerView(auth, { claude: models }, { provider: "claude", model: "opus", effort: "high", fast }).effort!;
  expect(view(true)).toMatchObject({ label: "High", ariaLabel: "Effort: High, Fast on" });
  expect(view(false)).toMatchObject({ label: "High", ariaLabel: "Effort: High, Fast off" });
  const unavailable = view(true, { models: [{ ...OPUS, fast: { unavailable: "extra_usage" } }] });
  expect(unavailable).toMatchObject({ label: "High", ariaLabel: "Effort: High" });
  expect(unavailable.fast).toEqual({ on: false, description: "Extra usage is turned off for this account.", unavailable: "extra_usage" });
  // Without Fast the name reads as before.
  expect(modelPickerView(auth, { claude: { models: [OPUS] } }, { provider: "claude", model: "opus", effort: "high", fast: true }).effort).toMatchObject({ ariaLabel: "Effort: High", fast: null });
});

test("a new conversation starts from its provider's Last used Fast, whatever the model or a fixed default", () => {
  const memory = { fast: { codex: true as const } };
  expect(defaultFast(memory, "codex")).toBe(true);
  expect(defaultFast(memory, "claude")).toBe(false);
  expect(defaultFast(null, "codex")).toBe(false);
  expect(defaultFast(memory, null)).toBe(false);
});

// An existing conversation's send stores an off whatever the model; an on only for a usable row; a terminal
// session (provider null) and an ACP provider send neither.
test("an existing conversation's send names an off always and an on only while it can be used", () => {
  expect(fastToSend(undefined, "claude", { on: true })).toEqual({});
  expect(fastToSend(false, "claude", null)).toEqual({ fast: false });
  expect(fastToSend(true, "codex", { on: true })).toEqual({ fast: true });
  expect(fastToSend(true, "claude", null)).toEqual({});
  expect(fastToSend(true, "claude", { on: false, unavailable: "plan" })).toEqual({});
  expect(fastToSend(false, null, null)).toEqual({});
  expect(fastToSend(false, "cursor", null)).toEqual({});
});

// The menu folds a group's older models under one line; rows still hold every model.
const F_C55 = { id: "claude-opus-5-5", label: "Opus 5.5", default: true };
const F_C48 = { id: "claude-opus-4-8", label: "Opus 4.8", default: false, older: true as const };
const F_SOL = { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", default: true };
const F_OLD_SOL = { id: "gpt-6-sol", label: "GPT-6-Sol", default: false, older: true as const };
const F_OLD_TERRA = { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false, older: true as const };
const FOLDING: Partial<Record<Provider, ModelsState>> = { claude: { models: [F_C55, F_C48] }, codex: { models: [F_SOL, F_OLD_SOL, F_OLD_TERRA] } };

test("rows keep older models marked, so picking one checks it and names it on the trigger instead of returning to Default", () => {
  const view = modelPickerView(snapshot(dto("claude"), dto("codex")), FOLDING, { provider: "codex", model: "gpt-6-sol", effort: null });
  expect(view.groups[1]!.rows).toEqual([
    { kind: "model", id: "gpt-6.1-sol", label: "GPT-6.1-Sol", effort: false, selected: false, isDefault: true },
    { kind: "model", id: "gpt-6-sol", label: "GPT-6-Sol", effort: false, selected: true, isDefault: false, older: true },
    { kind: "model", id: "gpt-5.6-terra", label: "GPT-5.6-Terra", effort: false, selected: false, isDefault: false, older: true },
  ]);
  expect(view.trigger).toMatchObject({ label: "GPT-6-Sol", placeholder: false });
  const { current, older } = foldRows(view.groups[1]!.rows);
  expect(current.map(r => r.kind === "model" && r.id)).toEqual(["gpt-6.1-sol"]);
  expect(older.map(r => r.kind === "model" && r.id)).toEqual(["gpt-6-sol", "gpt-5.6-terra"]);
});

test("no line before a list is read, after it failed, for an empty list or a list without older models", () => {
  const auth = snapshot(dto("codex"));
  const choice = { provider: "codex" as const, model: null, effort: null };
  for (const state of [undefined, "loading", { error: "unavailable" }, { models: [] }, { models: [F_SOL] }] as ModelsState[]) {
    expect(foldRows(modelPickerView(auth, { codex: state }, choice).groups[0]!.rows).older.length).toBe(0);
  }
});

test("the line's accessible name starts with its visible label, then the provider and the count", () => {
  expect(olderLabel("Cursor", 22)).toBe("Older models (Cursor), 22");
});

test("opening, or a list arriving, unfolds only the groups whose checked row is older", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const groups = (model: string | null, models = FOLDING) => modelPickerView(auth, models, { provider: "codex", model, effort: null }).groups;
  expect(olderOpened(NO_OLDER, groups("gpt-6-sol"))).toEqual({ open: ["codex"], touched: [] });
  expect(olderOpened(NO_OLDER, groups("gpt-6.1-sol"))).toBe(NO_OLDER);
  // A chosen model the list does not name checks nothing, so nothing unfolds.
  expect(olderOpened(NO_OLDER, groups("retired"))).toBe(NO_OLDER);
  // Before the list: nothing to unfold; once it arrives with the chosen older model, its group unfolds.
  expect(olderOpened(NO_OLDER, groups("gpt-6-sol", { claude: FOLDING.claude, codex: "loading" }))).toBe(NO_OLDER);
  const opened = olderOpened(NO_OLDER, groups("gpt-6-sol"));
  expect(olderOpened(opened, groups("gpt-6-sol"))).toBe(opened);
});

test("a group the person toggled stays as they left it when a list arrives", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const closed = olderToggled(olderToggled(NO_OLDER, "codex", true), "codex", false);
  expect(closed).toEqual({ open: [], touched: ["codex"] });
  expect(olderOpened(closed, modelPickerView(auth, FOLDING, { provider: "codex", model: "gpt-6-sol", effort: null }).groups)).toBe(closed);
  // Groups fold and unfold apart.
  expect(olderToggled(olderToggled(NO_OLDER, "codex", true), "claude", true)).toEqual({ open: ["codex", "claude"], touched: ["codex", "claude"] });
});

// main classifies each list it reads (models.ts olderIds); the view keeps no fold state of its own, so a replacement
// list read after an account change is shown with its own older marks.
test("a replacement list read after an account change carries its own older marks into the view", () => {
  const auth = snapshot(dto("codex"));
  const choice = { provider: "codex" as const, model: "gpt-6-sol", effort: null };
  expect(foldRows(modelPickerView(auth, { codex: FOLDING.codex }, choice).groups[0]!.rows).older.length).toBe(2);
  const next = modelPickerView(auth, { codex: { models: [F_SOL, { id: F_OLD_SOL.id, label: F_OLD_SOL.label, default: false }] } }, choice).groups[0]!;
  expect(foldRows(next.rows).older.length).toBe(0);
  expect(olderOpened(NO_OLDER, [next])).toBe(NO_OLDER);
});

test("a toggle scrolls the menu by the line's move so the line keeps its place, within the menu's scroll range", () => {
  expect(heldScrollTop({ scrollTop: 100, maxScrollTop: 600, lineBefore: 300, lineAfter: 180 })).toBe(0);
  expect(heldScrollTop({ scrollTop: 100, maxScrollTop: 600, lineBefore: 300, lineAfter: 420 })).toBe(220);
  expect(heldScrollTop({ scrollTop: 100, maxScrollTop: 600, lineBefore: 300, lineAfter: 250 })).toBe(50);
  // No scroll range: the line cannot be held and moves.
  expect(heldScrollTop({ scrollTop: 0, maxScrollTop: 0, lineBefore: 300, lineAfter: 180 })).toBe(0);
  expect(heldScrollTop({ scrollTop: 500, maxScrollTop: 560, lineBefore: 300, lineAfter: 420 })).toBe(560);
});


test("older rows follow the painted side, keep provider order and leave the line last above", () => {
  const rows = ["GPT-6-Sol", "GPT-5.6-Sol", "GPT-5.6-Terra", "GPT-5.6-Luna"];
  expect(olderOrder("Older models", rows, "top")).toEqual([...rows, "Older models"]);
  expect(olderOrder("Older models", rows, "bottom")).toEqual(["Older models", ...rows]);
  expect(olderOrder("Older models", [], "top")).toEqual(["Older models"]);
});

test("above-line expansion uses the residual growth as scroll without moving the line", () => {
  // Codex + Copilot: 128px inserted above, 60px of menu growth, 68px of new scroll range.
  expect(heldScrollTop({ scrollTop: 0, maxScrollTop: 68, lineBefore: 343.5, lineAfter: 411.5 })).toBe(68);
  // Already capped: all inserted rows become scroll, and folding reverses it.
  expect(heldScrollTop({ scrollTop: 23, maxScrollTop: 1073, lineBefore: 465.5, lineAfter: 593.5 })).toBe(151);
  expect(heldScrollTop({ scrollTop: 151, maxScrollTop: 945, lineBefore: 465.5, lineAfter: 337.5 })).toBe(23);
  // A short upward menu grows by exactly the inserted height; the line does not move.
  expect(heldScrollTop({ scrollTop: 0, maxScrollTop: 0, lineBefore: 420.5, lineAfter: 420.5 })).toBe(0);
});


test("an open model menu keeps its first painted side until close releases the lock", () => {
  expect(lockedOlderSide(null, undefined)).toBeNull();
  const bottom = lockedOlderSide(null, "bottom");
  expect(bottom).toBe("bottom");
  expect(lockedOlderSide(bottom, "top")).toBe("bottom");
  const top = lockedOlderSide(null, "top");
  expect(top).toBe("top");
  expect(lockedOlderSide(top, "bottom")).toBe("top");
  expect(lockedOlderSide(null, "left")).toBeNull();
});
