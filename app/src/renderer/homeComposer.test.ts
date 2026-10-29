import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import {
  attachmentChipView, attachmentLimit, chipRemoval, composeRequest, defaultEffort, defaultModel, defaultProject, defaultProvider, dropTarget,
  GREETINGS, greetingText, groupIcon, groupLabel, isSubmitKey, lengthCounter, MAX_ATTACHMENTS, MAX_PASTED_BYTES, modelPickerView, pickGreeting, presetListView,
  presetPlaceholder, rootForProject, searchPresets, selectableProvider, sendAvailability, slashQuery, startErrorView, suggestedPresets,
  suggestedPrompts, TEXT_LIMIT,
  type AttachmentDraft, type ModelsState, type PresetListReply, type PresetSummary, type SendInput,
} from "./homeComposer";

// The catalog's order and groups (design §4.4a); titles and scopes are the CLI's, abbreviated here.
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

function canvas(path: string, extra: Partial<CanvasRow> = {}): CanvasRow { return { path, open: 0, resolved: 0, url: `doan://x/${path}`, ...extra }; }
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
  projects: 1, root: list("/r/doan-design"), projectName: "doan-design", auth: snapshot(dto("claude")), provider: "claude",
  text: "Draw a pricing page.", preset: null, attachments: [], running: null, sending: false, ...over,
});

// composeRequest

test("a request without a preset is the user's text, trimmed", () => {
  expect(composeRequest("  Draw a pricing page.\n\n", null, 0)).toBe("Draw a pricing page.");
});

test("a preset adds its one-line header, a blank line, then the user's text", () => {
  expect(composeRequest("Turn the onboarding screens into a design system.", preset("document"), 0))
    .toBe("Use the doan design preset `document` (Document the design system).\n\nTurn the onboarding screens into a design system.");
});

test("a preset alone sends only its header line, even with attachments", () => {
  expect(composeRequest("   ", preset("critique"), 0)).toBe("Use the doan design preset `critique` (Critique the design).");
  expect(composeRequest("", preset("critique"), 2)).toBe("Use the doan design preset `critique` (Critique the design).");
});

test("attachments alone send the fixed sentence; nothing at all sends nothing", () => {
  expect(composeRequest(" \n ", null, 1)).toBe("Look at the attached files.");
  expect(composeRequest("", null, 0)).toBe("");
});

test("the placeholder asks for a target once a preset is chosen", () => {
  expect(presetPlaceholder(null)).toBe("Describe what to design, / for presets");
  expect(presetPlaceholder(preset("polish"))).toBe("Which canvas or screen? Add details…");
});

// sendAvailability and the length limit

test("the limit counts the user's text plus the preset header: 32,768 sends, 32,769 does not", () => {
  const header = composeRequest("", preset("polish"), 0).length + 2;
  const at = "a".repeat(TEXT_LIMIT - header), over = at + "a";
  expect(composeRequest(at, preset("polish"), 0)).toHaveLength(TEXT_LIMIT);
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

test("an empty composer disables Send without a reason line; a preset or an attachment alone can be sent", () => {
  expect(sendAvailability(base({ text: "  \n" }))).toEqual({ enabled: false, reason: null });
  expect(sendAvailability(base({ text: "", preset: preset("shape") }))).toEqual({ enabled: true, reason: null });
  expect(sendAvailability(base({ text: "", attachments: [attachment("brief.pdf")] }))).toEqual({ enabled: true, reason: null });
});

test("no project, an unhealthy project, and no ready agent each give their reason", () => {
  expect(sendAvailability(base({ projects: 0, root: null, projectName: "" }))).toEqual({ enabled: false, reason: { kind: "noProject", text: "Add a project to send." } });
  expect(sendAvailability(base({ root: missing("/r/old-site"), projectName: "old-site" })))
    .toEqual({ enabled: false, reason: { kind: "projectUnavailable", text: "old-site isn’t available. Fix it from its menu in the sidebar." } });
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { expired: true })), provider: "claude" })))
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

test("an unverified agent after a restart can be sent with", () => {
  expect(sendAvailability(base({ auth: snapshot(dto("claude", { verified: false })) }))).toEqual({ enabled: true, reason: null });
});

test("attachments being checked, and one that moved, block Send", () => {
  expect(sendAvailability(base({ attachments: [attachment("notes.md", { status: "checking" })] })))
    .toEqual({ enabled: false, reason: { kind: "checking", text: "Checking attachments…" } });
  expect(sendAvailability(base({ attachments: [attachment("brand-guidelines.pdf", { status: "missing" })] })))
    .toEqual({ enabled: false, reason: { kind: "attachmentMissing", text: "brand-guidelines.pdf was moved or deleted. Remove it, or attach it again." } });
});

test("a second Home send to a root with a running Home conversation says so and offers Open", () => {
  expect(sendAvailability(base({ running: "conv-1" })))
    .toEqual({ enabled: false, reason: { kind: "running", text: "A conversation from Home is still running in doan-design.", open: "conv-1" } });
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
const DOAN_WT = list("/r/wt/buzz-home", [], { common: "/r/doan-design/.git", main: "/r/doan-design", branch: "feat-buzz-home" });
const MALMOI = list("/r/malmoi");
const OLD = missing("/r/old-site");

test("the first-run handoff root wins, then the loaded workspace, then the last Home send, then the first healthy root", () => {
  const entries = [OLD, MALMOI, DOAN, DOAN_WT];
  const none = new Map<string, string>();
  expect(defaultProject(entries, none, { handoff: "/r/wt/buzz-home", loaded: "/r/malmoi", lastRoot: "/r/doan-design" }).root).toBe("/r/wt/buzz-home");
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
  expect(rootForProject(rows, "/r/elsewhere")).toBe("/r/wt/buzz-home");
  expect(rootForProject(rows, undefined)).toBe("/r/wt/buzz-home");
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
    { kind: "model", id: "opus", label: "Opus 5.5", effort: true, selected: true },
    { kind: "model", id: "sonnet", label: "Sonnet 5.5", effort: true, selected: false },
    { kind: "model", id: "haiku", label: "Haiku 5.5", effort: false, selected: false },
  ]);
  expect(view.trigger).toEqual({ provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5" });
  expect(view.effort).toEqual({
    label: "High", ariaLabel: "Effort: High", menuLabel: "Effort for Opus 5.5", title: "Effort · Opus 5.5",
    options: [{ id: "low", label: "Low", selected: false }, { id: "medium", label: "Medium", selected: false }, { id: "high", label: "High", selected: true }, { id: "max", label: "Max", selected: false }],
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

test("a provider without a list yet shows Default and asks to be read when its group opens; loading and failure stay on Default", () => {
  const auth = snapshot(dto("claude"), dto("codex"));
  const choice = { provider: "codex" as const, model: null, effort: null };
  const unread = modelPickerView(auth, {}, choice).groups[1]!;
  expect(unread).toMatchObject({ read: true, note: null, rows: [{ kind: "default", label: "Default", selected: true }] });
  const loading = modelPickerView(auth, { codex: "loading" }, choice).groups[1]!;
  expect(loading).toMatchObject({ read: false, note: null, rows: [{ kind: "default", label: "Default", selected: true }, { kind: "loading", label: "Loading models" }] });
  for (const state of [{ error: "unavailable" }, { models: [] }] as ModelsState[]) {
    expect(modelPickerView(auth, { codex: state }, choice).groups[1]).toMatchObject({ read: false, note: "Models unavailable", rows: [{ kind: "default", label: "Default", selected: true }] });
  }
  expect(modelPickerView(auth, {}, choice).trigger).toEqual({ provider: "codex", label: "Default", ariaLabel: "Agent: Codex, model Default" });
  expect(modelPickerView(auth, {}, choice).effort).toBeNull();
});

test("Copilot is read only when the person asks, because reading spends one Copilot request", () => {
  const group = modelPickerView(snapshot(dto("copilot")), {}, { provider: "copilot", model: null, effort: null }).groups[0]!;
  expect(group).toMatchObject({ read: false, rows: [{ kind: "default", label: "Default", selected: true }, { kind: "load", label: "Load models (uses one Copilot request)" }] });
  expect(modelPickerView(snapshot(dto("copilot")), { copilot: "loading" }, { provider: "copilot", model: null, effort: null }).groups[0]!.rows.at(-1)).toEqual({ kind: "loading", label: "Loading models" });
});

test("the effort capsule shows only for a model with levels; an unchosen level reads Default", () => {
  const auth = snapshot(dto("claude"));
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "haiku", effort: null }).effort).toBeNull();
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "sonnet", effort: null }).effort).toMatchObject({ label: "Default", ariaLabel: "Effort: Default" });
  expect(modelPickerView(auth, { claude: { models: [{ ...OPUS, efforts: ["xhigh"] }] } }, { provider: "claude", model: "opus", effort: "xhigh" }).effort?.label).toBe("Extra high");
  // A chosen model that is no longer listed reads as Default.
  expect(modelPickerView(auth, { claude: CLAUDE_MODELS }, { provider: "claude", model: "retired", effort: "high" })).toMatchObject({ trigger: { label: "Default" }, effort: null });
});

test("with no agent that can run the trigger says so", () => {
  const view = modelPickerView(snapshot(dto("claude", { expired: true })), {}, { provider: null, model: null, effort: null });
  expect(view.trigger).toEqual({ provider: null, label: "No agent ready", ariaLabel: "Agent: none ready" });
  expect(modelPickerView(undefined, {}, { provider: null, model: null, effort: null }).groups).toEqual([]);
});

// Presets: suggestions, search, list view

test("suggested presets follow the project's canvases, skipping ids the CLI did not list", () => {
  expect(suggestedPresets(list("/r/p"), PRESETS).map(p => p.id)).toEqual(["context", "shape", "document"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/home.html")]), PRESETS).map(p => p.id)).toEqual(["document", "critique", "polish"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/design-system.html"), canvas(".doan/canvases/home.html")]), PRESETS).map(p => p.id)).toEqual(["critique", "polish"]);
  expect(suggestedPresets(list("/r/p", [canvas(".doan/canvases/tokens.html", { id: "design-system" })]), PRESETS).map(p => p.id)).toEqual(["critique", "polish"]);
  expect(suggestedPresets(list("/r/p"), PRESETS.filter(p => p.id !== "shape")).map(p => p.id)).toEqual(["context", "document"]);
  expect(suggestedPresets(missing("/r/p"), PRESETS)).toEqual([]);
  expect(suggestedPresets(null, PRESETS)).toEqual([]);
});

test("suggested prompts name the target canvas by recency and fill a sentence with its path", () => {
  const entry = list("/r/doan-design", [
    canvas(".doan/canvases/app-shell.html", { mtimeMs: 10 }),
    canvas(".doan/canvases/buzz-onboarding.html", { mtimeMs: 30 }),
    canvas(".doan/canvases/projects-home.html", { mtimeMs: 20 }),
  ]);
  expect(suggestedPrompts(entry, "doan-design", PRESETS)).toEqual([
    { label: "Document the design system of doan-design", preset: preset("document"), text: "Document the design system of doan-design." },
    { label: "Critique the buzz-onboarding canvas", preset: preset("critique"), text: "Critique the buzz-onboarding canvas (.doan/canvases/buzz-onboarding.html)." },
    { label: "Polish the details of projects-home", preset: preset("polish"), text: "Polish the details of projects-home (.doan/canvases/projects-home.html)." },
  ]);
});

test("one canvas is both critiqued and polished; a design-system canvas drops the document prompt; titles name canvases", () => {
  const one = list("/r/p", [canvas(".doan/canvases/home.html", { title: "Home screen" })]);
  expect(suggestedPrompts(one, "p", PRESETS).map(p => p.label)).toEqual(["Document the design system of p", "Critique the Home screen canvas", "Polish the details of Home screen"]);
  const ds = list("/r/p", [canvas(".doan/canvases/design-system.html", { mtimeMs: 1 }), canvas(".doan/canvases/home.html", { mtimeMs: 2 })]);
  expect(suggestedPrompts(ds, "p", PRESETS).map(p => p.label)).toEqual(["Critique the home canvas", "Polish the details of design-system"]);
});

test("a project without canvases gets the three starting prompts; missing presets are skipped", () => {
  expect(suggestedPrompts(list("/r/p"), "p", PRESETS)).toEqual([
    { label: "Gather design context", preset: preset("context"), text: "Gather design context." },
    { label: "Shape a first screen", preset: preset("shape"), text: "Shape a first screen." },
    { label: "Document the design system", preset: preset("document"), text: "Document the design system." },
  ]);
  expect(suggestedPrompts(list("/r/p"), "p", PRESETS.filter(p => p.id !== "context")).map(p => p.preset.id)).toEqual(["shape", "document"]);
  expect(suggestedPrompts(missing("/r/p"), "p", PRESETS)).toEqual([]);
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
  expect(view.sections).toEqual([{ title: "Suggested for doan-design", rows: suggested.map(p => ({ id: p.id, title: p.title, scope: p.scope, tooltip: `${p.description} (/${p.id})`, group: null })) }]);
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
  expect(view).toEqual({ kind: "list", tabs: [], sections: [{ title: null, rows: [{ id: "critique", title: "Critique the design", scope: "critique scope", tooltip: "About critique. (/critique)", group: "Review" }] }], summary: "1 preset matches cri" });
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
  expect(attachmentChipView((({ size: _size, ...rest }) => rest)(attachment("research-notes.md", { status: "checking" })), home)).toMatchObject({ meta: "Checking…", thumbnail: false, problem: false });
  expect(attachmentChipView(attachment("ignored.png", { kind: "image", pasted: true, size: 2.4 * 1024 * 1024, path: "/Users/ada/Library/doan/attachments/a1/pasted-1.png" }), home))
    .toMatchObject({ label: "Pasted image", meta: "PNG · 2.4 MB", removeLabel: "Remove pasted image", thumbnail: true });
  expect(attachmentChipView(attachment("brand-guidelines.pdf", { status: "missing" }), home))
    .toMatchObject({ meta: "Moved or deleted", problem: true, notice: "brand-guidelines.pdf was moved or deleted. Remove it, or attach it again." });
});

test("a drop on the composer attaches files and refuses folders; elsewhere it adds projects", () => {
  expect(dropTarget(false, [{ isDirectory: true }])).toEqual({ kind: "project" });
  expect(dropTarget(true, [{ isDirectory: false }, { isDirectory: false }])).toEqual({ kind: "attach", files: [0, 1], notice: null });
  expect(dropTarget(true, [{ isDirectory: true }])).toEqual({ kind: "attach", files: [], notice: "Folders can’t be attached. Drop a folder outside the message to add a project." });
  expect(dropTarget(true, [{ isDirectory: true }, { isDirectory: false }])).toEqual({ kind: "attach", files: [1], notice: "Folders can’t be attached. Drop a folder outside the message to add a project." });
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
