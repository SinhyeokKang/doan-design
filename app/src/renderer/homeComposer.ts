import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { PROVIDERS, type AuthStatusDto, type Provider, type ReadinessCause } from "../main/agentAuth/types";
import type { AcpModes, PermissionModeId } from "../main/conversation/permissionMode";
import type { FastUnusedReason } from "../main/conversation/types";
import type { DesignPresetSummary, DesignSkillReply } from "../main/designSkills";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { HomeMemory } from "../restore/uiState";
import { canvasKind } from "../formats/canvasPath";
import { PROVIDER_NAMES } from "./agentAuthView";
import { toMessage, type FieldSegment } from "./anchorField";
import { canvasLabel } from "./canvasTree";
import { groupProjects } from "./homeCards";
import { anotherConversation } from "./homeConversations";
import { displayPath } from "./projectDisplay";

// Pure parts of the Home composer (buzz-home design §4, §11). Copy follows the confirmed draft
// `.doan/canvases/buzz-home.html` and design §4.5's tables.

// `group` is optional: an older CLI on PATH lists presets without it (design §4.4a).
export type PresetSummary = DesignPresetSummary & { group?: string };
export type PresetListReply = DesignSkillReply<{ version: string; presets: PresetSummary[] }>;
export interface PresetRef { id: string; title: string }

// The conversation IPC's text limit, in UTF-16 code units.
export const TEXT_LIMIT = 32768;
export const MAX_ATTACHMENTS = 10;
export const MAX_PASTED_BYTES = 50 * 1024 * 1024;
const PLACEHOLDER = "Describe what to design, / for presets";
const PRESET_PLACEHOLDER = "Which canvas or screen? Add details…";
const ATTACHMENTS_ONLY = "Look at the attached files.";
const FOLDER_DROP = "Folders can’t be attached. Add a project from Add Projects.";

// The attachment list and main's Home paragraph travel outside this text, so neither counts toward the limit.
export function composeRequest(text: string, preset: PresetRef | null, attachments: number): string {
  const body = text.trim();
  if (preset) {
    const header = `Use the Doan design preset \`${preset.id}\` (${preset.title}).`;
    return body ? `${header}\n\n${body}` : header;
  }
  return body || (attachments > 0 ? ATTACHMENTS_ONLY : "");
}

// composeRequest read back from a sent user.message: the preset line and the person's own text. The text that stands in
// for an attachment-only request was not written by the person, so it reads as no text.
const PRESET_HEADER = /^Use the Doan design preset `([^`\n]+)` \(([^\n]*)\)\.(?:\n\n|$)/;
export function splitRequest(text: string, attachments: number): { preset: PresetRef | null; body: string } {
  const match = PRESET_HEADER.exec(text);
  const preset = match ? { id: match[1]!, title: match[2]! } : null;
  const body = match ? text.slice(match[0].length) : text;
  return { preset, body: !preset && attachments > 0 && body === ATTACHMENTS_ONLY ? "" : body };
}

// Many presets work on a named design and Home has no canvas selection, so a chosen preset asks for the target.
export function presetPlaceholder(preset: PresetRef | null): string {
  return preset ? PRESET_PLACEHOLDER : PLACEHOLDER;
}

export function lengthCounter(length: number): string | null {
  if (length < TEXT_LIMIT * 0.9) return null;
  const n = Math.abs(TEXT_LIMIT - length), count = `${n.toLocaleString("en-US")} ${n === 1 ? "character" : "characters"}`;
  return length > TEXT_LIMIT ? `${count} over the limit` : `${count} left`;
}

export interface AttachmentDraft {
  // The renderer's own key; `id` is main's opaque id once the file is checked.
  key: string; id?: string;
  name: string; kind: "image" | "file"; pasted: boolean;
  status: "checking" | "ready" | "missing";
  size?: number; path?: string;
}

export interface SendInput {
  projects: number;
  root: FolderEntry | null; projectName: string;
  auth: AuthSnapshot | null | undefined; provider: Provider | null;
  text: string; preset: PresetRef | null; attachments: readonly AttachmentDraft[];
  // A project conversation still running in this root (HomeRun.running).
  running: { conversationId: string } | null;
  sending: boolean;
}
export type SendReason = { kind: "noProject" | "projectUnavailable" | "noAgent" | "agentUnavailable" | "overLimit" | "anchorMarkers" | "checking" | "attachmentMissing"; text: string } | { kind: "running"; text: string; open: string };

// An empty composer and a send in flight disable Send without a reason line (spec 9).
export function sendAvailability(input: SendInput): { enabled: boolean; reason: SendReason | null } {
  const off = (reason: SendReason | null) => ({ enabled: false, reason });
  if (input.sending) return off(null);
  if (input.projects === 0 || !input.root) return off({ kind: "noProject", text: "Add a project to send." });
  if (input.root.kind !== "list") return off({ kind: "projectUnavailable", text: unavailableProject(input.projectName) });
  const agent = agentProblem(input.auth, input.provider);
  if (agent) return off(agent);
  // An empty composer shows no line, running or not: Home keeps its suggestions until something is typed.
  if (!input.text.trim() && !input.preset && input.attachments.length === 0) return off(null);
  if (input.running) return off({ kind: "running", text: anotherConversation(input.projectName), open: input.running.conversationId });
  const draft = draftProblem(input.text, input.preset, input.attachments);
  return draft ? off(draft) : { enabled: true, reason: null };
}

// The picked agent cannot run. Shared with the docked composer's new-conversation mode.
export function agentProblem(auth: AuthSnapshot | null | undefined, provider: Provider | null): SendReason | null {
  if (!provider) return { kind: "noAgent", text: "No agent is ready to run." };
  // A chosen agent that expires or signs out stays chosen and names itself, even when it was the only one.
  if (!connectedProviders(auth).filter(selectableProvider).some(s => s.provider === provider)) return { kind: "agentUnavailable", text: `${PROVIDER_NAMES[provider]} can’t run right now. Choose another agent.` };
  return null;
}

// What in a non-empty draft stops the send. Shared with the docked composer. A plain string is typed text only; the
// chip field passes its segments, because {text, anchors} cannot tell a typed {{1}} from a chip's marker.
export function draftProblem(draft: string | readonly FieldSegment[], preset: PresetRef | null, attachments: readonly AttachmentDraft[]): SendReason | null {
  const typed = typedPieces(draft);
  const text = typeof draft === "string" ? draft : toMessage(draft)?.text ?? typed.join("");
  const request = composeRequest(text, preset, attachments.length);
  if (request.length > TEXT_LIMIT) return { kind: "overLimit", text: "Shorten the message to send it." };
  // The conversation IPC reads {{ and }} as anchor markers and refuses stray ones. Only what the person typed is
  // checked, piece by piece between chips: braces typed on both sides of a chip are not one marker.
  if (preset) typed.push(composeRequest("", preset, 0));
  if (typed.some(piece => piece.includes("{{") || piece.includes("}}"))) return { kind: "anchorMarkers", text: "Remove {{ and }} from the message to send it." };
  if (attachments.some(a => a.status === "checking")) return { kind: "checking", text: "Checking attachments" };
  const moved = attachments.find(a => a.status === "missing");
  return moved ? { kind: "attachmentMissing", text: movedNotice(moved) } : null;
}

// Neighbouring text segments join first, so {{ split across two of them is still caught.
function typedPieces(draft: string | readonly FieldSegment[]): string[] {
  if (typeof draft === "string") return [draft];
  const pieces: string[] = [];
  let run: string | null = null;
  for (const segment of draft) {
    if (segment.kind === "text") { run = (run ?? "") + segment.text; continue; }
    if (run !== null) pieces.push(run);
    run = null;
  }
  if (run !== null) pieces.push(run);
  return pieces;
}

function unavailableProject(project: string): string { return `${project} isn’t available. Fix it from its menu in the sidebar.`; }

const START_ERRORS: Record<string, { text: (p: string, project: string) => string; retry: boolean }> = {
  not_logged_in: { text: p => `Couldn’t start with ${p}: its sign-in has expired. Choose another agent.`, retry: false },
  cli_missing: { text: p => `Couldn’t start with ${p}: it isn’t installed on this Mac. Choose another agent.`, retry: false },
  runtime_unsupported: { text: p => `Couldn’t start with ${p}: Doan doesn’t support this version. Update it, then try again.`, retry: true },
  busy: { text: p => `${p} is finishing a previous run. Try again in a moment.`, retry: true },
  credential_override: { text: p => `${p} refused to run: this project’s Claude settings supply their own API key. Remove it, or choose another agent.`, retry: false },
  cli_install_failed: { text: () => "Couldn’t download the Antigravity server. Check your connection, then try again.", retry: true },
  rate_limited: { text: p => `${p} is rate limited. Try again later.`, retry: false },
  process_exited: { text: p => `${p} stopped before it could start. Try again.`, retry: true },
  session_unavailable: { text: p => `Couldn’t start with ${p} right now. Try again, or choose another agent.`, retry: true },
  session_in_use: { text: p => `${p} is busy with another session. Try again in a moment.`, retry: true },
  project_not_open: { text: (_p, project) => unavailableProject(project), retry: false },
  no_agent: { text: () => "No agent is ready to run.", retry: false },
};

// Home has no sign-in, so provider codes only explain; bad_request, unknown and codes this table does not know retry.
export function startErrorView(code: string, provider: Provider, project: string): { text: string; retry: boolean } {
  const row = Object.hasOwn(START_ERRORS, code) ? START_ERRORS[code]! : { text: () => "Couldn’t start the conversation. Try again.", retry: true };
  return { text: row.text(PROVIDER_NAMES[provider], project), retry: row.retry };
}

// Projects

// Order (design §4.2): the first-run handoff, the loaded workspace, the last Home send, then the sidebar's first
// healthy root. A chosen root that is still listed stays chosen even when unhealthy, so Send explains it; a removed
// one falls back to the sidebar order only, and adding it again does not choose it again.
export function defaultProject(entries: readonly FolderEntry[], lastCommon: ReadonlyMap<string, string>, prefs: {
  handoff?: string | null; current?: { root: string; name: string } | null; loaded?: string | null; lastRoot?: string | null;
}): { root: string | null; announcement: string | null } {
  const ordered = groupProjects(entries, lastCommon).flatMap(card => card.rows);
  const healthy = (root: string | null | undefined) => ordered.some(e => e.path === root && e.kind === "list");
  const fallback = ordered.find(e => e.kind === "list")?.path ?? ordered[0]?.path ?? null;
  if (healthy(prefs.handoff)) return { root: prefs.handoff!, announcement: null };
  if (prefs.current) {
    if (ordered.some(e => e.path === prefs.current!.root)) return { root: prefs.current.root, announcement: null };
    return { root: fallback, announcement: `${prefs.current.name} was removed. Choose another project.` };
  }
  for (const root of [prefs.loaded, prefs.lastRoot]) if (healthy(root)) return { root: root!, announcement: null };
  return { root: fallback, announcement: null };
}

// A project switch picks the worktree the sidebar remembers for it (`selectedRoot`), else its first healthy root.
export function rootForProject(rows: readonly FolderEntry[], remembered: string | undefined): string | null {
  if (rows.some(r => r.path === remembered)) return remembered!;
  return rows.find(r => r.kind === "list")?.path ?? rows[0]?.path ?? null;
}

// Providers

// The marks onboarding shows (public/provider-logos/README.md); relative, so the packaged app's file URL resolves them.
const LOGOS: Record<Provider, string> = { claude: "claude.png", codex: "codex.png", cursor: "cursor.svg", antigravity: "antigravity.svg", copilot: "copilot.svg" };
export function providerLogo(provider: Provider): string { return `provider-logos/${LOGOS[provider]}`; }

// Only providers with a saved connection are listed (design §4.3), in agent-auth's order.
function connectedProviders(auth: AuthSnapshot | null | undefined): AuthStatusDto[] {
  return (auth?.providers ?? []).filter(p => p.account !== null).sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider));
}

// Every connection reads unverified after a restart; main checks it before the run, so it can be chosen.
export function selectableProvider(status: AuthStatusDto): boolean {
  return status.readiness.ready || status.readiness.cause === "unverified";
}

// The agent, model and effort fixed in Settings > Agents > New conversations; null is Last used (buzz-settings
// design 'New conversations'). Home starts each new input from it; the person's picks override it until they send.
export interface NewConversationDefault { provider: Provider; model?: string; effort?: string; permissionMode?: Exclude<PermissionModeId, "default"> }

// The fixed preference speaks only for its own agent: a fallback agent keeps its own remembered model and effort.
export function fixedPreference(preference: NewConversationDefault | null, provider: Provider): NewConversationDefault | null {
  return preference?.provider === provider ? preference : null;
}

// A fixed agent that is not signed in or cannot run falls back to the last-used rule.
export function defaultProvider(auth: AuthSnapshot | null | undefined, last: Provider | undefined, fixed: NewConversationDefault | null = null): Provider | null {
  const choosable = connectedProviders(auth).filter(selectableProvider);
  if (fixed && choosable.some(s => s.provider === fixed.provider)) return fixed.provider;
  if (choosable.some(s => s.provider === last)) return last!;
  return (choosable.find(s => s.readiness.ready) ?? choosable[0])?.provider ?? null;
}

// Models and effort

// fast: the model offers Fast (fast-mode design §1); description is Codex's tier text, unavailable an account-level
// reason Claude Code's list read gave (decision 12). defaultEffort: Codex's level for this model when none is sent.
// older: an earlier generation the menus fold (main models.ts olderIds).
export interface ModelOption { id: string; label: string; default: boolean; older?: true; efforts?: string[]; defaultEffort?: string; fast?: { description?: string; unavailable?: FastUnusedReason } }
// undefined: not read in this run. Lists are never hard-coded, so only a received list offers models.
// modes: what an ACP server listed with its models (permission-mode); absent for Claude and Codex.
export type ModelsState = undefined | "loading" | { models: ModelOption[]; modes?: AcpModes } | { error: string };

function receivedModels(state: ModelsState): ModelOption[] | null {
  return state !== undefined && state !== "loading" && "models" in state && state.models.length > 0 ? state.models : null;
}

// ui-state's remembered model is only a preference: main accepts a model only from a list received in this run.
// fixed (this agent's fixed preference) replaces the remembered model; one this project does not list, or none, is
// the provider's default.
export function defaultModel(state: ModelsState, saved: { model: string; effort?: string } | undefined, fixed: NewConversationDefault | null = null): string | null {
  const models = receivedModels(state);
  if (!models) return null;
  const wanted = fixed ? fixed.model : saved?.model;
  return models.find(m => m.id === wanted)?.id ?? models.find(m => m.default)?.id ?? null;
}

// No level means the provider's default, which sends no effort. fixed replaces the remembered level the same way.
export function defaultEffort(model: ModelOption | null, remembered: string | undefined, fixed: NewConversationDefault | null = null): string | null {
  const wanted = fixed ? fixed.effort : remembered;
  return wanted !== undefined && model?.efforts?.includes(wanted) ? wanted : null;
}

// Why Claude Code did not or cannot run Fast (fast-mode design §6): the thread's line and a disabled switch row's
// description.
const FAST_REASONS: Record<FastUnusedReason, string> = {
  plan: "Your plan doesn’t include it.", extra_usage: "Extra usage is turned off for this account.", model: "It isn’t available for this model.",
  policy: "Your organization turned it off.", cooldown: "It’s paused after a rate limit.",
};
export function fastReason(reason: FastUnusedReason): string { return FAST_REASONS[reason]; }

const EFFORT_LABELS: Record<string, string> = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
function effortLabel(id: string): string { return EFFORT_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1); }

// isDefault: the provider's own default row (Claude Code's default, Codex's isDefault, an ACP agent's current model),
// marked "Default" in the menu.
export type ModelRow =
  | { kind: "model"; id: string; label: string; effort: boolean; selected: boolean; isDefault: boolean; older?: true }
  | { kind: "default"; label: "Default"; selected: boolean };
export interface ProviderGroup {
  provider: Provider; name: string; selectable: boolean;
  // For the shared short status copy (agentAuthView); null when ready.
  cause: ReadinessCause | null;
  // The draft (frame 05) shows reading as a note in the group head over the Default row.
  note: "Models unavailable" | "Loading models" | null;
  // Read the list when this group opens.
  read: boolean;
  rows: ModelRow[];
}
// fast: the conversation's or the new input's Fast, kept even for a model without it (decision 5); absent where the
// composer offers no Fast (Settings > Agents 'New conversations').
export interface ModelChoice { provider: Provider | null; model: string | null; effort: string | null; fast?: boolean }
export interface FastView { on: boolean; description?: string; unavailable?: FastUnusedReason }
// placeholder: the label is the drawer's name, not a value (picker-default-labels decision 9: drawn in the metadata ink).
// isDefault: the shown model is the provider's default row.
export interface ModelTrigger { provider: Provider | null; label: string; ariaLabel: string; placeholder: boolean; isDefault: boolean }
// unset: the menu's first row, which goes back to sending no level. It stays out of options, so Settings, which draws
// its own Default row, never shows two.
export interface EffortView {
  label: string; ariaLabel: string; placeholder: boolean; menuLabel: string; title: string;
  unset: { label: "Default"; description: string; selected: boolean };
  options: { id: string; label: string; selected: boolean }[]; fast: FastView | null;
}
export interface ModelPickerView { trigger: ModelTrigger; groups: ProviderGroup[]; effort: EffortView | null }

export function modelOption(state: ModelsState, id: string | null): ModelOption | null {
  return id === null ? null : receivedModels(state)?.find(m => m.id === id) ?? null;
}

export function modelPickerView(auth: AuthSnapshot | null | undefined, models: Partial<Record<Provider, ModelsState>>, choice: ModelChoice): ModelPickerView {
  const chosen = choice.provider ? receivedModels(models[choice.provider])?.find(m => m.id === choice.model) ?? null : null;
  const groups = connectedProviders(auth).map((status): ProviderGroup => {
    const { provider } = status, selectable = selectableProvider(status);
    const group: ProviderGroup = { provider, name: PROVIDER_NAMES[provider], selectable, cause: status.readiness.ready ? null : status.readiness.cause, note: null, read: false, rows: [] };
    if (!selectable) return group;
    const state = models[provider], list = receivedModels(state), mine = choice.provider === provider;
    if (list) return { ...group, rows: list.map(m => ({ kind: "model", id: m.id, label: m.label, effort: (m.efforts?.length ?? 0) > 0, selected: mine && m.id === chosen?.id, isDefault: m.default, ...(m.older ? { older: true as const } : {}) })) };
    const rows: ModelRow[] = [{ kind: "default", label: "Default", selected: mine }];
    if (state === "loading") return { ...group, note: "Loading models", rows };
    if (state !== undefined) return { ...group, note: "Models unavailable", rows };
    // Every provider, Copilot included, lists its models without a model request (PoC P1), so all are read.
    return { ...group, read: true, rows };
  });
  const trigger: ModelTrigger = !choice.provider ? { provider: null, label: "No agent ready", ariaLabel: "Agent: none ready", placeholder: false, isDefault: false }
    : !chosen ? { provider: choice.provider, label: "Model", ariaLabel: `Agent: ${PROVIDER_NAMES[choice.provider]}, model not chosen`, placeholder: true, isDefault: false }
    : { provider: choice.provider, label: chosen.label, ariaLabel: `Agent: ${PROVIDER_NAMES[choice.provider]}, model ${chosen.label}${chosen.default ? ", default" : ""}`, placeholder: false, isDefault: chosen.default };
  const effort = chosen && choice.provider && (chosen.efforts?.length ?? 0) > 0 ? effortView(choice.provider, chosen, choice) : null;
  return { trigger, groups, effort };
}

// Older models (model-drawer-older): a group's rows keep every model, and the menu folds the older ones under one line
// only when drawing. Picking and finding the checked row read the full rows, so an older pick never falls back to Default.
type FoldRow = { older?: true; selected: boolean };
export function olderCount(rows: readonly FoldRow[]): number { return rows.filter(row => row.older).length; }
export function shownRows<T extends FoldRow>(rows: readonly T[], open: boolean): readonly T[] { return open ? rows : rows.filter(row => !row.older); }
// The line's name leads with its visible label (WCAG 2.5.3), the provider as in the docked names.
export function olderLabel(provider: string, count: number): string { return `Older models (${provider}), ${count}`; }
// Which groups are unfolded, and which the person toggled. It lives with an open menu and is dropped when it closes.
export interface OlderGroups { open: readonly string[]; touched: readonly string[] }
export const NO_OLDER: OlderGroups = { open: [], touched: [] };
// On opening and when a list arrives, a group the person has not toggled unfolds when its checked row is older.
// Returns the same state when nothing changes.
export function olderOpened(state: OlderGroups, groups: readonly { provider: string; rows: readonly FoldRow[] }[]): OlderGroups {
  const add = groups.filter(g => !state.open.includes(g.provider) && !state.touched.includes(g.provider) && g.rows.some(row => row.older && row.selected)).map(g => g.provider);
  return add.length ? { ...state, open: [...state.open, ...add] } : state;
}
export function olderToggled(state: OlderGroups, provider: string, open: boolean): OlderGroups {
  return {
    open: open ? [...state.open.filter(p => p !== provider), provider] : state.open.filter(p => p !== provider),
    touched: state.touched.includes(provider) ? state.touched : [...state.touched, provider],
  };
}
// The menu's scrollTop after a toggle: moved by as much as the line moved, so the line stays under the pointer
// (an up-opening menu grows upward). Clamped to the scroll range; with no range the line moves.
export function heldScrollTop(m: { scrollTop: number; maxScrollTop: number; lineBefore: number; lineAfter: number }): number {
  return Math.min(Math.max(m.scrollTop + m.lineAfter - m.lineBefore, 0), Math.max(m.maxScrollTop, 0));
}

// With no level chosen the trigger shows the level the provider will run when Doan knows it (Codex's defaultEffort),
// else the drawer's name (picker-default-labels spec 'Effort').
function effortView(provider: Provider, model: ModelOption, choice: ModelChoice): EffortView {
  const levels = model.efforts ?? [];
  const picked = choice.effort !== null && levels.includes(choice.effort) ? choice.effort : null;
  const known = model.defaultEffort !== undefined && levels.includes(model.defaultEffort) ? model.defaultEffort : null;
  const label = picked ? effortLabel(picked) : known ? effortLabel(known) : "Effort";
  const named = picked ? label : known ? `${label}, default` : "default";
  const fast = choice.fast !== undefined ? fastView(provider, model, choice.fast) : null;
  // label stays the level alone: Settings shows it as its row's text (fast-mode design §1).
  return {
    label, ariaLabel: fast && !fast.unavailable ? `Effort: ${named}, Fast ${fast.on ? "on" : "off"}` : `Effort: ${named}`, placeholder: !picked && !known,
    menuLabel: `Effort for ${model.label}`, title: `Effort · ${model.label}`,
    unset: { label: "Default", description: known ? `${effortLabel(known)} for this model` : `Set by ${PROVIDER_NAMES[provider]}`, selected: !picked },
    options: levels.map(id => ({ id, label: effortLabel(id), selected: id === picked })), fast,
  };
}

// Only Claude Code and Codex list Fast per model; the others offer Fast as a model of its own (fast-mode decision 1).
const FAST_PROVIDERS: readonly Provider[] = ["claude", "codex"];
// Claude Code's own words (2.1.318: "same model, faster output", "Fast mode requires usage credits"); check them again
// when the CLI's copy changes. Codex's description is its tier's, as listed.
const CLAUDE_FAST = "Same model, faster output. Requires usage credits.";
function fastView(provider: Provider, model: ModelOption, on: boolean): FastView | null {
  if (!FAST_PROVIDERS.includes(provider) || !model.fast) return null;
  const { description, unavailable } = model.fast;
  if (unavailable) return { on: false, description: fastReason(unavailable), unavailable };
  const text = provider === "claude" ? CLAUDE_FAST : description;
  return { on, ...(text ? { description: text } : {}) };
}

// What an existing conversation's send says of Fast: nothing until the person switched it. An off is stored whatever
// the model; an on only while the shown model's row can be used, since main refuses Fast for a model without it.
// provider: null for a conversation that takes no Fast (a terminal session).
export function fastToSend(picked: boolean | undefined, provider: Provider | null, view: FastView | null): { fast?: boolean } {
  if (picked === undefined || provider === null || !FAST_PROVIDERS.includes(provider)) return {};
  if (!picked) return { fast: false };
  return view && !view.unavailable ? { fast: true } : {};
}

// A new input's Fast is its provider's Last used; a fixed Settings default never sets it (decision 3). The switch shows
// it on only for a model that offers Fast (fastView).
export function defaultFast(memory: HomeMemory | null | undefined, provider: Provider | null): boolean {
  return provider !== null && memory?.fast?.[provider] === true;
}

// Presets

const GROUPS: Record<string, { label: string; icon: string }> = {
  start: { label: "Start", icon: "compass" }, review: { label: "Review", icon: "scan-eye" }, refine: { label: "Refine", icon: "paintbrush" },
  content: { label: "Content", icon: "text-align-start" }, explore: { label: "Explore", icon: "shapes" },
};
const PRESET_ICON = "pencil-sparkles";
// Membership lives in the CLI catalog only; the renderer maps a key to its name and icon.
export function groupLabel(key: string | undefined): string | null {
  return key === undefined ? null : Object.hasOwn(GROUPS, key) ? GROUPS[key]!.label : key;
}
export function groupIcon(key: string | undefined): string {
  return key !== undefined && Object.hasOwn(GROUPS, key) ? GROUPS[key]!.icon : PRESET_ICON;
}

// Screens are the `.doan/canvases/` canvases; a design system is any canvas in `.doan/ds/`.
// A legacy `.doan/canvases/design-system.html` counts as a screen (design-system-canvases Q9).
function split(canvases: readonly CanvasRow[]): { screens: CanvasRow[]; designSystem: boolean } {
  return { screens: canvases.filter(row => canvasKind(row.path) !== "ds"), designSystem: canvases.some(row => canvasKind(row.path) === "ds") };
}

// Fixed rules on what Doan knows about the project (design §4.4); ids the CLI did not list are skipped.
export function suggestedPresets(entry: FolderEntry | null, presets: readonly PresetSummary[]): PresetSummary[] {
  if (entry?.kind !== "list") return [];
  const { screens, designSystem } = split(entry.canvases);
  const document = designSystem ? [] : ["document"];
  const ids = screens.length === 0 ? ["context", "shape", ...document] : [...document, "critique", "polish"];
  return ids.flatMap(id => presets.filter(p => p.id === id)).slice(0, 3);
}

// `parts` splits `label` for display only: `value` marks the project and canvas names the screens highlight.
export interface SuggestionPart { text: string; value: boolean }
export interface SuggestedPrompt { label: string; parts: readonly SuggestionPart[]; preset: PresetSummary; text: string }

// The same rules as suggestedPresets. Labels are short imperatives in the words a person would type; the composer
// text adds the target canvas's path so the agent does not ask which design is meant.
export function suggestedPrompts(entry: FolderEntry | null, project: string, presets: readonly PresetSummary[]): SuggestedPrompt[] {
  if (entry?.kind !== "list") return [];
  const plain = (label: string) => ({ label, parts: [{ text: label, value: false }], text: `${label}.` });
  type Wanted = [string, { label: string; parts: SuggestionPart[]; text: string }];
  let wanted: Wanted[];
  const { screens, designSystem } = split(entry.canvases);
  if (screens.length === 0) {
    wanted = [["context", plain("Get to know this project")], ["shape", plain("Plan the first screen")], ...(designSystem ? [] : [["document", plain("Document the design system")] as Wanted])];
  } else {
    const recent = screens.map((row, i) => ({ row, i })).sort((a, b) => (b.row.mtimeMs ?? -Infinity) - (a.row.mtimeMs ?? -Infinity) || a.i - b.i).map(x => x.row);
    const first = recent[0]!, second = recent[1] ?? first;
    const named = (verb: string, row: CanvasRow) => {
      const name = canvasLabel(row), label = `${verb} the ${name} canvas`;
      return { label, parts: [{ text: `${verb} the `, value: false }, { text: name, value: true }, { text: " canvas", value: false }], text: `${label} (${row.path}).` };
    };
    const documentLead = "Document the design system of ";
    wanted = [
      ...(designSystem ? [] : [["document", { label: documentLead + project, parts: [{ text: documentLead, value: false }, { text: project, value: true }], text: `${documentLead}${project}.` }] as Wanted]),
      ["critique", named("Review", first)],
      ["polish", named("Polish", second)],
    ];
  }
  return wanted.flatMap(([id, prompt]) => {
    const preset = presets.find(p => p.id === id);
    return preset ? [{ label: prompt.label, parts: prompt.parts, preset, text: prompt.text }] : [];
  });
}

function searchText(text: string): string { return text.toLowerCase().normalize("NFC"); }

// Quick Open's scoring (quickOpen.ts tokenScore): prefix 3, word start 2, substring 1.
function tokenScore(fields: readonly string[], token: string): number {
  let score = 0;
  for (const field of fields) {
    if (field.startsWith(token)) return 3;
    for (let at = field.indexOf(token); at !== -1; at = field.indexOf(token, at + 1)) {
      score = Math.max(score, at > 0 && !/[\p{L}\p{N}]/u.test(field.charAt(at - 1)) ? 2 : 1);
      if (score === 2) break;
    }
  }
  return score;
}

// Every token must match; equal scores keep catalog order.
export function searchPresets(presets: readonly PresetSummary[], query: string): PresetSummary[] {
  const tokens = searchText(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...presets];
  const scored = presets.flatMap((preset, i) => {
    const fields = [preset.title, preset.id, preset.scope, preset.description].map(searchText);
    let score = 0;
    for (const token of tokens) {
      const part = tokenScore(fields, token);
      if (part === 0) return [];
      score += part;
    }
    return [{ preset, score, i }];
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(s => s.preset);
}

export interface PresetRow { id: string; title: string; description: string; scope: string; tooltip: string; group: string | null }
export interface PresetTab { key: string; label: string; icon: string; selected: boolean }
export type PresetListView =
  | { kind: "loading"; text: string }
  | { kind: "error"; text: string; retry: boolean }
  | { kind: "olderCli"; text: string }
  | { kind: "empty"; text: string }
  | { kind: "list"; tabs: PresetTab[]; sections: { title: string | null; rows: PresetRow[] }[]; summary: string | null };

const CLI_REASONS: Record<string, string> = {
  unavailable: "the doan CLI couldn’t start", timeout: "the doan CLI didn’t answer in time",
  invalid_response: "Doan couldn’t read the CLI’s answer", failed: "the doan CLI stopped without a result",
};

// A failure is never an empty list, and every state still lets the person send without a preset (draft board 24).
export function presetListView(reply: PresetListReply | undefined, opts: { project: string; suggested: readonly PresetSummary[]; query: string; tab: string | null; slash?: boolean }): PresetListView {
  if (!reply) return { kind: "loading", text: "Loading presets" };
  if (!reply.ok) {
    const { error } = reply;
    if (error.code === "request_refused") return { kind: "error", text: "Doan refused this preset request. You can still send without a preset.", retry: false };
    // An older CLI has no design-skill command and answers the list with usage_error (design §4.4).
    if (error.code === "usage_error") return { kind: "olderCli", text: "This doan CLI has no design presets. Update Doan to use them." };
    const reason = "reason" in error ? CLI_REASONS[error.reason] : undefined;
    return { kind: "error", text: reason ? `Doan couldn’t read the design presets: ${reason}. You can still send without one.` : "Doan couldn’t read the design presets. You can still send without one.", retry: true };
  }
  const presets = reply.result.presets, query = opts.query.trim();
  const row = (p: PresetSummary, withGroup: boolean): PresetRow => ({ id: p.id, title: p.title, description: p.description, scope: p.scope, tooltip: `${p.description} (/${p.id})`, group: withGroup ? groupLabel(p.group) : null });
  if (query) {
    const found = searchPresets(presets, query);
    if (found.length === 0) return { kind: "empty", text: `No presets match “${query}”.` };
    return { kind: "list", tabs: [], sections: [{ title: null, rows: found.map(p => row(p, true)) }], summary: `${found.length} ${found.length === 1 ? "preset matches" : "presets match"} ${query}` };
  }
  if (opts.slash) return { kind: "list", tabs: [], sections: [{ title: null, rows: presets.map(p => row(p, true)) }], summary: null };
  const suggested = opts.suggested.length > 0 ? [{ title: `Suggested for ${opts.project}`, rows: opts.suggested.map(p => row(p, false)) }] : [];
  if (!presets.every(p => p.group !== undefined)) return { kind: "list", tabs: [], sections: [...suggested, { title: "All presets", rows: presets.map(p => row(p, false)) }], summary: null };
  const keys = [...new Set(presets.map(p => p.group!))];
  const available = [...(suggested.length > 0 ? ["suggested"] : []), ...keys];
  const selected = opts.tab !== null && available.includes(opts.tab) ? opts.tab : available[0]!;
  const tabs = available.map(key => key === "suggested"
    ? { key, label: "Suggested", icon: PRESET_ICON, selected: key === selected }
    : { key, label: groupLabel(key)!, icon: groupIcon(key), selected: key === selected });
  const sections = selected === "suggested" ? suggested : [{ title: groupLabel(selected), rows: presets.filter(p => p.group === selected).map(p => row(p, false)) }];
  return { kind: "list", tabs, sections, summary: null };
}

// Greeting

export const GREETINGS = ["What should we design today?", "What are we making next?", "What would you like to change?", "What’s next for <project>?", "Where should we start?"] as const;

// Picked once per visit; never the previous one, so a return to Home reads as new without animating.
export function pickGreeting(previous: string | null, random: () => number, hasProject: boolean): string {
  const pool = GREETINGS.filter(g => g !== previous && (hasProject || !g.includes("<project>")));
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

export function greetingText(template: string, project: string | null): string {
  if (!template.includes("<project>")) return template;
  return project ? template.replace("<project>", project) : GREETINGS[0];
}

// Keys

export function isSubmitKey(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean {
  // keyCode 229 is the IME's own Enter in browsers that do not set isComposing on it.
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

export function steerKey(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean {
  return isSubmitKey(event) && event.ctrlKey && !event.metaKey && !event.altKey;
}

// A plain → on an empty field takes the suggestion its placeholder shows (prompt-suggestion design 'Pure functions' 4).
// Any modifier keeps the key's own selection or word and line move; keyCode 229 is the IME's own key.
export function takesSuggestion(
  event: { key: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean; isComposing: boolean; keyCode: number },
  state: { suggestion: string | null; empty: boolean; composing: boolean },
): boolean {
  return event.key === "ArrowRight" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && !event.isComposing && event.keyCode !== 229
    && state.suggestion !== null && state.empty && !state.composing;
}

// `dismissed`: Escape closed the list, which stays closed until the field is empty again.
export function slashQuery(text: string, dismissed: boolean): string | null {
  return !dismissed && text.startsWith("/") && !text.includes("\n") ? text.slice(1) : null;
}

// Attachments

// Main enforces the same limits; this keeps the refusal beside the chips without a round trip.
export function attachmentLimit(existing: number, items: readonly { pasted: boolean; size: number }[]): { accept: number[]; notices: string[] } {
  const accept: number[] = [];
  let oversized = false, leftOut = 0;
  items.forEach((item, i) => {
    if (item.pasted && item.size > MAX_PASTED_BYTES) oversized = true;
    else if (existing + accept.length < MAX_ATTACHMENTS) accept.push(i);
    else leftOut++;
  });
  const notices = [
    ...(oversized ? ["This image is over 50 MB, so it wasn’t attached."] : []),
    ...(leftOut > 0 ? [`Only ${MAX_ATTACHMENTS} files can be attached. ${leftOut} ${leftOut === 1 ? "was" : "were"} left out.`] : []),
  ];
  return { accept, notices };
}

// main writes a canvas capture as a paste named canvas-capture-<time>.png (attachments.ts capturedName); AttachmentInfo has no
// field for it, so a draft chip is known by this name. A path attachment with the same name has pasted false.
function isCanvasCapture(a: AttachmentDraft): boolean { return a.pasted && a.name.startsWith("canvas-capture-"); }
function pastedLabel(a: AttachmentDraft): string { return isCanvasCapture(a) ? "Canvas capture" : "Pasted image"; }

function movedNotice(a: AttachmentDraft): string { return `${a.pasted ? pastedLabel(a) : a.name} was moved or deleted. Remove it, or attach it again.`; }

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentChipView { label: string; meta: string; tooltip: string | null; removeLabel: string; thumbnail: boolean; notice: string | null; problem: boolean }

export function attachmentChipView(a: AttachmentDraft, home: string | null): AttachmentChipView {
  const label = a.pasted ? pastedLabel(a) : a.name;
  const dot = a.name.lastIndexOf(".");
  // Pasted images are always re-encoded to PNG by main.
  const type = a.pasted ? "PNG" : dot > 0 ? a.name.slice(dot + 1).toUpperCase() : null;
  const meta = a.status === "checking" ? "Checking" : a.status === "missing" ? "Moved or deleted" : [type, a.size === undefined ? null : formatSize(a.size)].filter(Boolean).join(" · ");
  return {
    label, meta, tooltip: a.path === undefined ? null : displayPath(a.path, home),
    removeLabel: a.pasted ? `Remove ${pastedLabel(a).toLowerCase()}` : `Remove ${a.name}`,
    thumbnail: a.kind === "image" && a.status === "ready",
    notice: a.status === "missing" ? movedNotice(a) : null, problem: a.status === "missing",
  };
}

// Over the composer only files attach; a folder is refused and pointed to Add Projects.
export function dropTarget(entries: readonly { isDirectory: boolean }[]): { files: number[]; notice: string | null } {
  const files = entries.flatMap((e, i) => (e.isDirectory ? [] : [i]));
  return { files, notice: files.length < entries.length ? FOLDER_DROP : null };
}

// Chips in DOM order (attachments, then the preset). Backspace takes the preset first, then the last attachment;
// × hands focus to the chip that moves into its place, else the field (design §4.9).
export function chipRemoval(chips: readonly { label: string; preset?: boolean }[], trigger: { kind: "backspace"; text: string; caret: number } | { kind: "button"; index: number }): { remove: number; announcement: string; focus: number | "textarea" } | null {
  if (trigger.kind === "backspace") {
    if (trigger.text !== "" || trigger.caret !== 0 || chips.length === 0) return null;
    const preset = chips.findIndex(c => c.preset);
    const remove = preset === -1 ? chips.length - 1 : preset;
    return { remove, announcement: `Removed ${chips[remove]!.label}`, focus: "textarea" };
  }
  const chip = chips[trigger.index];
  if (!chip) return null;
  return { remove: trigger.index, announcement: `Removed ${chip.label}`, focus: trigger.index < chips.length - 1 ? trigger.index : "textarea" };
}
