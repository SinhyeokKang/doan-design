import { Fragment, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, GitBranch, Info, Plus } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { AttachmentResult } from "../main/attachments";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { FolderEntry } from "../main/view";
import type { HomeMemory, ShellProject } from "../restore/uiState";
import { localClock, resetTimeText } from "./limitReset";
import { useProjectSkills, type SkillsCalls } from "./useProjectSkills";
import { fieldSkillRuns } from "./skillWords";
import { classifyFirstWord, commandCard, commandLists, planSend, PRESET_NOTICE, STALE_MODE_CARD, type CommandCard } from "./commandView";
import { AlertIcon } from "./AlertIcon";
import { retryButton, useRetry } from "./ListRetryButton";
import {
  AgentPicker, AttachButton, CommandCardNotice, ComposerCard, ComposerChips, focusPicker, ComposerField, ComposerTools, EffortPicker, PermissionPicker, PresetsButton, SendButton, SlashPresets, SuggestionButton, useComposerDrop, usePresetListOutside,
  type ComposerFieldHandle,
} from "./ComposerParts";
import type { BuddyId } from "./buddies";
import { Buddy, type BuddyHandle } from "./Doany";
import { CLIPBOARD_TYPE } from "./chipField";
import { plainText, textSegments, typedText } from "./anchorField";
import { dropAttachment, restoreStartDraft } from "./conversationStore";
import { cardRow, chipClass, groupProjects } from "./homeCards";
import { generationOf, modelsKey } from "./dockedSupport";
import {
  pasteAsAttachment, pastedTextMeta, pastedTextLabel, MAX_ATTACHMENTS, followDrawerHighlight, type PresetRow, attachmentChipView, attachmentLimit, MAX_PASTED_BYTES, attachRefusal, chosenAttachments, chipRemoval, composeRequest, defaultEffort, defaultFast, defaultModel, defaultProject, defaultProvider,
  fixedPreference, greetingText, lengthCounter, markRefused, modelOption, modelPickerView, presetListView, presetPlaceholder, readyAttachment,
  rootForProject, selectableProvider, sendAvailability, slashKey, slashQuery, startErrorView, suggestedPresets, suggestedPrompts, TEXT_LIMIT,
  type AttachmentDraft, type ModelsState, type NewConversationDefault, type PresetListReply, type PresetSummary,
} from "./homeComposer";
import type { LastRequest } from "./homeConversations";
import { restoreRequest } from "./homeConversations";
import { displayPath } from "./projectDisplay";
import { projectHue, projectInitial } from "./shellNavigation";
import type { SettingsTarget } from "./settingsSections";
import type { ComposerChoice } from "./rememberChoice";
import { defaultPermission, permissionChoices, permissionPickerView } from "./permissionPicker";
import { stageInsets } from "./stageInsets";
import { HomeCredit } from "./HomeCredit";
import { NameTip } from "./NameTip";
import { TooltipEscape } from "./components/ui/tooltip";

// Everything the composer keeps between Home visits for this run (a draft survives leaving Home, not a
// restart). App owns the object so a visit's unmount does not lose it; reads finishing after an unmount still land.
export interface ComposerMemory {
  text: string; preset: PresetSummary | null; attachments: AttachmentDraft[];
  // Choices the person made; absent ones follow the defaults. The agent, model and effort
  // picks last until the input is sent; the project stays.
  root: string | null; provider: Provider | null;
  models: Partial<Record<Provider, string>>; efforts: Record<string, string>;
  // Models that Edit on Home brought back into `models`: shown as chosen, but not picked here, so a fixed Settings
  // default does not take them on (rememberChoice preferenceAfterPick). A pick of the model clears its entry.
  restoredModels?: Partial<Record<Provider, string>>;
  // Levels Edit on Home brought back into `efforts`, by the same key; a pick of a level clears its entry.
  restoredEfforts?: Partial<Record<string, string>>;
  // Permission mode picks by provider, kept the same way as the model picks.
  permissions: Partial<Record<Provider, PermissionModeId>>;
  // Fast switched by provider; absent follows the provider's Last used.
  fast: Partial<Record<Provider, boolean>>;
  // The Settings default this input started with: a change in Settings applies from the next new input.
  // undefined: not taken yet.
  defaults?: NewConversationDefault | null;
  // Model lists by root and provider, and the preset list, as read in this run.
  lists: Record<string, ModelsState>; presets: PresetListReply | undefined;
  auth: AuthSnapshot | null | undefined;
  thumbnails: Record<string, string>;
  // Attachment keys and main's ids of each root's last sent request: Edit on Home shows their thumbnails again and
  // main keeps the ids for its recheck until no last request or draft uses them.
  lastKeys: Record<string, string[]>;
  lastIds: Record<string, string[]>;
  // A start still waiting for main, kept here so a later visit stays locked and its reply clears only the draft it
  // sent; and the refusal or attachment notice under the composer. command: the start was a provider command, which
  // took neither the preset nor the attachments (`keys` are the draft's, kept).
  sending: { generation: number; text: string; preset: string | null; keys: string[]; command?: true } | null;
  generation: number;
  notice: { text: string; retry: boolean } | null;
  // The card of a built-in Doan does not run, under the composer until Dismiss or a start (this run only).
  card?: CommandCard | null;
  greeting: string | null;
  // The last `select` and `restore` requests already applied, so a later visit does not apply them again.
  seen: { select: number; restore: number };
  // Roots whose start message a quit stopped main was asked for (main hands one over once, so once a run is enough).
  startsAsked: Map<string, symbol>;
  // A recovered start waits for an in-flight send before it can enter the field.
  waitingStarts: Map<string, { land(): void; discard(): void }>;
}
export function emptyComposer(): ComposerMemory {
  return { text: "", preset: null, attachments: [], root: null, provider: null, models: {}, efforts: {}, permissions: {}, fast: {}, lists: {}, presets: undefined, auth: undefined, thumbnails: {}, lastKeys: {}, lastIds: {}, sending: null, generation: 0, notice: null, greeting: null, seen: { select: 0, restore: 0 }, startsAsked: new Map(), waitingStarts: new Map() };
}

const mountsByMemory = new WeakMap<object, Set<() => void>>();
export function forgetHomeStarts(memory: { current: ComposerMemory }, roots: readonly string[]): void {
  for (const root of roots) {
    memory.current.startsAsked.delete(root);
    memory.current.waitingStarts.get(root)?.discard();
    memory.current.waitingStarts.delete(root);
  }
}
function viewers(memory: { current: ComposerMemory }): Set<() => void> {
  let mounts = mountsByMemory.get(memory);
  if (!mounts) { mounts = new Set(); mountsByMemory.set(memory, mounts); }
  return mounts;
}

export interface StartInput { root: string; mode: "newDesign"; runtime: Provider; text: string; model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; attachments?: { id: string }[] }
// conversationId: the started conversation, for a host that shows it in place (the project Overview). resetsAt: a
// usage-limit refusal's reset time (ISO), when main knew it.
export type StartOutcome = { ok: true; conversationId?: string } | { error: string; missing?: string[]; replaced?: string[]; resetsAt?: string };

export interface HeroComposerProps {
  entries: readonly FolderEntry[]; homeDirectory: string | null;
  shellProjects: Readonly<Record<string, ShellProject>>;
  loaded: string | null;
  // A project to choose once: first run's handoff, or one the person just added. The person's later
  // choice wins over it.
  select: { root: string; seq: number } | null;
  // ui-state's Home memory; null until the saved state is read.
  prefs: HomeMemory | null;
  memory: { current: ComposerMemory };
  // Roots with a project conversation working: the skills list is read again once that work ends, since a turn can
  // add a skill.
  working: ReadonlySet<string>;
  restore: { request: LastRequest; seq: number } | null;
  greeting: string;
  start(request: StartInput, last: LastRequest): Promise<StartOutcome>;
  // The project picker's Add Projects… opens the Add Projects page.
  addProjects(): void;
  // Settings > Agents' New conversations; null is Last used, undefined not read yet.
  defaults?: NewConversationDefault | null | undefined;
  // The agent picker's way into Settings > Agents.
  openSettings(target: SettingsTarget): void;
  // The buddy above the greeting: the latest pick, else the saved one (App); Doany when not given.
  buddy?: BuddyId;
  // A model or effort pick is remembered as Last used before any send (dogfooding #6).
  onRemember?(choice: ComposerChoice): void;
}

// The group sits 64px above the panel's centre with at least --space-8 around it.
const STAGE_LIFT = 64, STAGE_MIN = 32;
// The group's height in its reference state: an empty two-line field with the suggestions shown (their place is kept
// while hidden). What a draft adds inside the card (chips, extra lines, the counter) and the reason line or notice
// below the suggestions are left out, so they grow downward from a field that stays where it was.
// A project none of whose roots is a list (missing, reading, unhealthy) can't take a request.
function projectDown(card: { rows: readonly FolderEntry[] }): boolean { return card.rows.every(row => row.kind !== "list"); }

function referenceHeight(stage: HTMLElement): number {
  const box = (node: Element) => node.getBoundingClientRect();
  const card = stage.querySelector(".composer-card"), field = stage.querySelector(".composer-input");
  const end = stage.querySelector(".home-suggestions") ?? stage.querySelector(".composer");
  if (!stage.firstElementChild || !card || !field || !end) return 0;
  const gap = parseFloat(getComputedStyle(card).rowGap) || 0;
  const added = [card.querySelector(".composer-chips"), card.querySelector(".composer-count")].reduce((sum, node) => sum + (node ? box(node).height + gap : 0), 0);
  const grown = box(field).height - parseFloat(getComputedStyle(field).minHeight);
  return box(end).bottom - box(stage.firstElementChild).top - added - grown;
}

// Measured before paint and again whenever the panel or the group resizes. Typing changes only what the reference
// leaves out, so the top inset stays where it was.
function HomeStage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = stage.current, panel = node?.parentElement;
    if (!node || !panel) return;
    const place = () => setTop(stageInsets({ available: panel.clientHeight, group: referenceHeight(node), offset: STAGE_LIFT, min: STAGE_MIN }).top);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return <div className="home-stage" ref={stage} style={top === null ? undefined : { paddingTop: top }}>{children}</div>;
}

const effortKey = (provider: Provider, model: string) => `${provider}\n${model}`;
// Home is only in the main window. Read on call, not on render: Home renders where `window.doan` is not set (its tests).
const MAIN_SKILLS: SkillsCalls = { listConversationSkills: request => window.doan.listConversationSkills(request) };

export { slashKey } from "./homeComposer";

// Cmd+V: text pastes as text; Finder files attach by their local path; an image alone attaches as a
// pasted image. Finder puts the file names on the clipboard as text too, so text that names the copied files is
// not a text paste.
export function pasteAction(text: string, files: readonly { name: string; type: string }[]): "text" | "files" | "none" {
  if (files.length === 0) return text ? "text" : "none";
  if (text.trim() && !files.some(file => text.includes(file.name))) return "text";
  return "files";
}

// Home's composer: the shared primitives with Home's own project picker,
// worktree tray, suggestions and stage. Always a box.
export function HeroComposer(props: HeroComposerProps) {
  const { memory } = props;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // A reply that lands after this mount left (and another took its place) redraws whichever mount is on screen.
  useEffect(() => {
    const mounts = viewers(memory);
    mounts.add(redraw);
    return () => { mounts.delete(redraw); };
  }, [memory]);
  const update = (patch: Partial<ComposerMemory> | ((current: ComposerMemory) => Partial<ComposerMemory>)) => {
    const current = memory.current;
    memory.current = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    for (const draw of viewers(memory)) draw();
    if (current.sending && !memory.current.sending) {
      const waiting = [...current.waitingStarts.values()];
      current.waitingStarts.clear();
      for (const start of waiting) start.land();
    }
  };
  const m = memory.current;
  const sending = m.sending !== null, notice = m.notice;
  const setNotice = (next: ComposerMemory["notice"]) => update({ notice: next });
  const [announcement, setAnnouncement] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Controlled so an Esc on a project name's tooltip closes the menu too (TooltipEscape).
  const [projectMenu, setProjectMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ request: LastRequest; title: string; body: string; cancel: string; confirm: string } | null>(null);
  const field = useRef<ComposerFieldHandle | null>(null);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const doany = useRef<BuddyHandle | null>(null);
  const slashList = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const lastCommon = new Map(props.entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon] as const] : []));
  const cards = groupProjects(props.entries, lastCommon);
  const nameOf = (root: string | null) => cards.find(card => card.rows.some(row => row.path === root))?.name ?? null;
  const picked = defaultProject(props.entries, lastCommon, {
    current: m.root ? { root: m.root, name: nameOf(m.root) ?? m.root.split("/").at(-1) ?? m.root } : null,
    loaded: props.loaded, lastRoot: props.prefs?.lastRoot ?? null,
  });
  const root = picked.root;
  const entry = props.entries.find(item => item.path === root) ?? null;
  const card = cards.find(item => item.rows.some(row => row.path === root)) ?? null;
  const project = card?.name ?? "";
  // A chosen root that left the list falls back, and is not chosen again when it comes back.
  useEffect(() => {
    if (!picked.announcement) return;
    update({ root: picked.root });
    setAnnouncement(picked.announcement);
  }, [picked.announcement]);
  useEffect(() => {
    if (props.select && props.select.seq !== memory.current.seen.select) update(current => ({ root: props.select!.root, seen: { ...current.seen, select: props.select!.seq } }));
  }, [props.select?.seq]);

  // Providers: the person's choice stays even when it stops being ready; until then the default.
  const auth = m.auth;
  useEffect(() => window.doan.onAgentAuth(snapshot => update({ auth: snapshot })), []);
  // An empty composer takes the current default; once something is typed, attached or picked as a preset, the input
  // keeps the default it started with until it is sent.
  const started = m.text !== "" || m.preset !== null || m.attachments.length > 0;
  const defaults = started && m.defaults !== undefined ? m.defaults : props.defaults ?? null;
  useEffect(() => { if (!started && props.defaults !== undefined && memory.current.defaults !== props.defaults) update({ defaults: props.defaults }); });
  const provider = m.provider ?? defaultProvider(auth, props.prefs?.lastProvider, defaults);
  const fixed = provider ? fixedPreference(defaults, provider) : null;
  const lists: Partial<Record<Provider, ModelsState>> = root ? Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, m.lists[modelsKey(root, status.provider, status.generation)]])) : {};
  const listState = provider ? lists[provider] : undefined;
  const saved = provider ? props.prefs?.models?.[provider] : undefined;
  const explicitModel = provider ? m.models[provider] : undefined;
  const model = provider ? (modelOption(listState, explicitModel ?? null)?.id ?? defaultModel(listState, saved, fixed)) : null;
  const option = modelOption(listState, model);
  const pickedEffort = provider && model ? m.efforts[effortKey(provider, model)] : undefined;
  const effort = pickedEffort !== undefined ? defaultEffort(option, pickedEffort) : defaultEffort(option, saved?.model === model ? saved.effort : undefined, fixed);
  const pickedFast = provider ? m.fast[provider] : undefined;
  const picker = modelPickerView(auth, lists, { provider, model, effort, fast: pickedFast ?? defaultFast(props.prefs, provider) });
  const pickedPermission = provider ? m.permissions[provider] : undefined;
  const permission = provider ? permissionPickerView(provider, listState, defaultPermission(permissionChoices(provider, listState), pickedPermission, props.prefs?.permissions?.[provider], fixed)) : null;
  const permissionMode = permission?.mode;
  // memory's provider is null until the person picks one (emptyComposer), never undefined.
  const choiceTouched = m.provider !== null || explicitModel !== undefined || pickedEffort !== undefined || pickedPermission !== undefined || pickedFast !== undefined;
  // Fast is not in this effect: it goes to Last used only from the toggle itself (onPickFast), never from a switch
  // held since then when the composer mounts again or another pick changes.
  const isModelPicked = explicitModel !== undefined && explicitModel === model && m.restoredModels?.[provider!] !== explicitModel;
  const isEffortPicked = pickedEffort !== undefined && m.restoredEfforts?.[effortKey(provider!, model!)] !== pickedEffort;
  const modelPicked = { ...(isModelPicked ? { modelPicked: true as const } : {}), ...(isEffortPicked ? { effortPicked: true as const } : {}) };
  // The marks are dependencies: re-picking the row Edit on Home restored changes only whether it was picked.
  useEffect(() => { if (choiceTouched && provider) props.onRemember?.({ provider, model, effort, ...modelPicked, ...(permissionMode ? { permissionMode } : {}) }); }, [choiceTouched, provider, model, effort, permissionMode, isModelPicked, isEffortPicked]);
  // The menu closes on select; the move waits for that, so the menu's own focus return comes first.
  const openSettings = (target: SettingsTarget) => queueMicrotask(() => props.openSettings(target));

  const readModels = (forRoot: string, forProvider: Provider) => {
    const key = modelsKey(forRoot, forProvider, generationOf(memory.current.auth, forProvider));
    const known = memory.current.lists[key];
    // A failed read is not kept for the run: the picker asks again when it opens.
    if (known !== undefined && !(typeof known === "object" && "error" in known)) return;
    update(current => ({ lists: { ...current.lists, [key]: "loading" } }));
    void window.doan.listConversationModels({ root: forRoot, runtime: forProvider }).catch(() => ({ error: "unknown" })).then(reply => update(current => ({ lists: { ...current.lists, [key]: reply } })));
  };
  const healthy = entry?.kind === "list";
  const ready = provider !== null && (auth?.providers ?? []).some(status => status.provider === provider && status.account !== null && selectableProvider(status));
  // The chosen provider's list shows its model and effort on the closed picker; the rest are read when it opens.
  // A new connection of the provider has a list of its own to read; Home's memory outlives the screen.
  const generation = provider ? generationOf(auth, provider) : 0;
  useEffect(() => { if (root && healthy && provider && ready) readModels(root, provider); }, [root, healthy, provider, ready, generation]);

  // Presets: read on entering Home and kept for the run; a failure is read again when the popover opens (§4.4), from
  // the loading state. Retry keeps the failed reply, its line and itself, until the answer; it resolves whether it read.
  const loadPresets = () => window.doan.designSkills.list().catch(() => undefined).then(reply => {
    update({ presets: reply ?? { v: 1, ok: false, error: { code: "cli_error", reason: "failed", message: "" } } as PresetListReply });
    return reply?.ok === true;
  });
  const readPresets = () => { update({ presets: undefined }); void loadPresets(); };
  const presetsRetry = useRetry();
  useEffect(() => { if (!memory.current.presets?.ok) readPresets(); }, []);
  const presets = m.presets?.ok ? m.presets.result.presets : [];
  const suggested = suggestedPresets(entry, presets);

  // The draft
  const { text, preset, attachments } = m;
  const projectSkills = useProjectSkills(MAIN_SKILLS, root, provider, root && props.working.has(root) ? "running" : "idle", generation);
  const skills = projectSkills.skills;
  const skillNames = new Set(skills.filter(skill => skill.kind !== "command").map(skill => skill.name));
  const matched = fieldSkillRuns(textSegments(text), skillNames).map(run => run.name);
  // Home starts conversations, so an ACP agent's commands (its conversation's) are not known here; Claude Code's and
  // Codex's fixed lists are, and every provider's card names.
  const commands = provider ? commandLists(provider, skills) : null;
  const commandNames = new Set(commands ? [...commands.commands, ...commands.aliases.keys(), ...commands.unsupported] : []);
  const first = commands ? classifyFirstWord(text, commands).kind : "text";
  // The preset stays chosen but goes with no command: its chip leaves the row for the notice until the word goes.
  const isCommand = first !== "text" && first !== "skill";
  const presetHeld = isCommand && preset !== null;
  const chips = [...attachments.map(a => ({ label: attachmentChipView(a, props.homeDirectory).label })), ...(preset ? [{ label: preset.title, preset: true }] : [])];
  // A command goes out alone, so the attachments it leaves here do not hold it.
  const availability = sendAvailability({ projects: cards.length, root: entry, projectName: project, auth, provider, text, preset: isCommand ? null : preset, skills: isCommand ? [] : matched, attachments: isCommand ? [] : attachments, sending });
  const composed = composeRequest(text, preset, matched, attachments.length);
  const counter = lengthCounter(composed.length);
  const slash = slashQuery(text, dismissed, new Set([...skillNames, ...commandNames]));
  const slashView = slash !== null ? presetListView(m.presets, { project, suggested, query: slash, tab: null, slash: true, skills }) : null;
  const slashRows = slashView?.kind === "list" ? slashView.sections.flatMap(section => section.rows) : [];
  const slashOpen = slash !== null && !sending;
  // A press outside closes the list as Escape does: it stays closed until the field is empty again.
  usePresetListOutside(slashOpen, slashList, () => field.current?.element() ?? null, () => setDismissed(true));
  const prompts = ready && healthy ? suggestedPrompts(entry, project, presets) : [];
  const edit = (patch: Partial<ComposerMemory>) => {
    // Said once as the notice takes the chip's place.
    if (patch.text !== undefined && commands && preset && !presetHeld && !["text", "skill"].includes(classifyFirstWord(patch.text, commands).kind)) setAnnouncement(PRESET_NOTICE);
    update({ ...patch, notice: null });
  };
  useEffect(() => { if (text === "") setDismissed(false); }, [text]);
  const previousRows = useRef<{ query: string | null; rows: PresetRow[] }>({ query: null, rows: [] });
  const rowKeys = slashRows.map(row => row.key).join("\n");
  useEffect(() => {
    const before = previousRows.current;
    setHighlight(current => before.query === slash ? followDrawerHighlight(before.rows, slashRows, current) : 0);
    previousRows.current = { query: slash, rows: slashRows };
  }, [slash, rowKeys]);
  useEffect(() => { if (slashOpen) projectSkills.read(); }, [slashOpen]);

  const pickedSkill = useRef(false);
  const focusEnd = () => { field.current?.focus(pickedSkill.current ? undefined : "end"); pickedSkill.current = false; };
  const chooseRow = (id: string, kind: PresetRow["kind"], fromSlash: boolean) => {
    if (kind === "preset") { choosePreset(id, fromSlash); return; }
    pickedSkill.current = !fromSlash;
    field.current?.insertSkill(id, fromSlash);
    if (fromSlash) queueMicrotask(focusEnd);
  };
  // Either way of picking puts the caret at the end of the field; the popover does it once it closes.
  const choosePreset = (id: string, fromSlash: boolean) => {
    const chosen = presets.find(p => p.id === id);
    if (!chosen) return;
    edit({ preset: chosen, ...(fromSlash ? { text: "" } : {}) });
    if (fromSlash) queueMicrotask(focusEnd);
  };

  // Attachments
  const thumbnailUrl = (bytes: Uint8Array | undefined): string | null => {
    if (!bytes || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  };
  const settle = (keys: string[], results: readonly (AttachmentResult | null)[]) => {
    const notices: string[] = [];
    update(current => {
      let next = [...current.attachments];
      const thumbnails = { ...current.thumbnails };
      keys.forEach((key, i) => {
        const result = results[i];
        const at = next.findIndex(a => a.key === key);
        if (at === -1) { if (result?.ok) void window.doan.removeAttachment(result.attachment.id); return; }
        if (!result || !result.ok) {
          const name = result ? result.name : next[at]!.name;
          next = next.filter(a => a.key !== key);
          notices.push(attachRefusal(result?.ok === false ? result.error : "unreadable", name));
          return;
        }
        const { attachment } = result;
        const url = attachment.kind === "image" ? thumbnailUrl(attachment.thumbnail) : null;
        if (url) thumbnails[key] = url;
        next[at] = readyAttachment(key, attachment);
      });
      return { attachments: next, thumbnails };
    });
    if (notices.length) setNotice({ text: notices.join(" "), retry: false });
  };
  const addFiles = (files: readonly File[], pastedImages: boolean) => {
    if (memory.current.sending) return;
    const limit = attachmentLimit(memory.current.attachments.length, files.map(file => ({ pasted: false, size: file.size })));
    if (limit.notices.length) setNotice({ text: limit.notices.join(" "), retry: false });
    const accepted = limit.accept.map(i => files[i]!);
    if (accepted.length === 0) return;
    const keys = accepted.map(() => crypto.randomUUID());
    update(current => ({ attachments: [...current.attachments, ...accepted.map((file, i): AttachmentDraft => ({ key: keys[i]!, name: file.name, kind: file.type.startsWith("image/") ? "image" : "file", pasted: false, status: "checking", size: file.size }))] }));
    void window.doan.addAttachmentFiles(accepted).catch(() => null).then(async results => {
      if (!results) { settle(keys, keys.map(() => null)); return; }
      // A copied screenshot has no path on disk; it attaches as a pasted image instead. A Finder item main no longer
      // finds keeps main's answer: a folder named x.png has File.type image/png too.
      const final = await Promise.all(results.map(async (result, i) => {
        const file = accepted[i]!;
        if (!pastedImages || result.ok || result.error !== "not_found" || !file.type.startsWith("image/") || window.doan.droppedPath(file) !== null) return result;
        if (file.size > MAX_PASTED_BYTES) return { ok: false as const, name: "Pasted image", error: "too_large" as const };
        // A page-made image whose bytes can't be read settles with the rest of its batch.
        const bytes = await file.arrayBuffer().catch(() => null);
        if (!bytes) return result;
        return window.doan.addPastedImage(bytes).catch(() => null);
      }));
      settle(keys, final);
    });
  };
  const choose = () => {
    if (memory.current.sending) return;
    void window.doan.chooseAttachments().catch(() => [] as AttachmentResult[]).then(results => {
      const { chosen, release, notices } = chosenAttachments(memory.current.attachments.length, results);
      for (const id of release) void window.doan.removeAttachment(id);
      const keys = chosen.map(() => crypto.randomUUID());
      update(current => ({ attachments: [...current.attachments, ...chosen.map((result, i): AttachmentDraft => ({ key: keys[i]!, name: result.ok ? result.attachment.name : result.name, kind: "file", pasted: false, status: "checking" }))] }));
      settle(keys, chosen);
      if (notices.length) setNotice({ text: notices.join(" "), retry: false });
    });
  };
  const removeChip = (index: number, trigger: "button" | "backspace") => {
    if (memory.current.sending) return false;
    const removal = chipRemoval(chips, trigger === "button" ? { kind: "button", index } : { kind: "backspace", text, caret: field.current?.caretAtStart() === false ? 1 : 0 });
    if (!removal) return false;
    const removed = attachments[removal.remove];
    if (removal.remove >= attachments.length) edit({ preset: null });
    else if (removed) {
      if (removed.id) {
        const id = removed.id;
        // A restored sent file goes back to main's sent set; with no last request using it, main can forget it.
        void window.doan.removeAttachment(id).then(() => {
          if (!Object.values(memory.current.lastIds).some(ids => ids.includes(id))) return window.doan.releaseAttachments([id]);
        }).catch(console.error);
      }
      const url = memory.current.thumbnails[removed.key];
      if (url && !Object.values(memory.current.lastKeys).some(keys => keys.includes(removed.key))) URL.revokeObjectURL(url);
      edit({ attachments: attachments.filter(a => a.key !== removed.key) });
    }
    setAnnouncement(removal.announcement);
    queueMicrotask(() => {
      if (removal.focus === "textarea") field.current?.focus();
      else removeButtons.current[removal.focus]?.focus();
    });
    return true;
  };

  const drop = useComposerDrop({ blocked: () => sending, onFiles: files => addFiles(files, false), onNotice: text => setNotice(text === null ? null : { text, retry: false }) });
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (memory.current.sending || field.current?.composing() || field.current?.element()?.isContentEditable === false) return;
    const files = Array.from(event.clipboardData.files);
    const text = event.clipboardData.getData("text/plain");
    const action = pasteAction(text, files);
    if (action === "files") { event.preventDefault(); addFiles(files, true); return; }
    if (action !== "text" || event.clipboardData.types.includes(CLIPBOARD_TYPE)) return;
    const decision = pasteAsAttachment(text, { acceptsAttachments: true, commandFirst: isCommand, attached: memory.current.attachments.length, limit: MAX_ATTACHMENTS });
    if (decision === "field") return;
    event.preventDefault();
    if (decision === "limit") { setNotice({ text: attachRefusal("limit", "Pasted text"), retry: false }); return; }
    const normalized = text.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(normalized).byteLength > MAX_PASTED_BYTES) { setNotice({ text: attachRefusal("too_large", "Pasted text"), retry: false }); return; }
    const key = crypto.randomUUID(), meta = pastedTextMeta(normalized);
    update(current => ({ attachments: [...current.attachments, { key, name: "Pasted text", kind: "file", pasted: true, status: "checking", ...meta }] }));
    void window.doan.addPastedText(normalized, meta).catch(() => null).then(result => {
      settle([key], [result]);
      if (result?.ok && memory.current.attachments.some(a => a.key === key)) {
        const text = `Pasted text attached, ${pastedTextLabel(meta.lines)}`;
        setAnnouncement(current => current === text ? `${text}\u00a0` : text);
      }
    });
  };

  // Send. The notice's Retry keeps its notice while the send it started is out (DESIGN 'Busy action'); the reply
  // decides what stays.
  const send = async (retry = false) => {
    if (!availability.enabled || !root || !provider) return;
    const plan = commands ? planSend(text, preset, matched, attachments.length, commands) : null;
    // Nothing starts: the card says where Doan has it, and the text stays for the person to change.
    if (plan?.kind === "unsupported") {
      const card = commandCard(provider, plan.name);
      update({ card });
      setAnnouncement(`${card.title}. ${card.body}`);
      return;
    }
    // A command starts the conversation alone: no preset or skill line and no attachments, which stay here.
    const command = plan !== null && plan.kind !== "message";
    // A send that starts hops; one that cannot start does nothing.
    doany.current?.hop();
    const request: StartInput = {
      root, mode: "newDesign", runtime: provider, text: command ? plan.text : composed,
      ...(model ? { model } : {}), ...(model && effort ? { effort } : {}), ...(picker.effort?.fast?.on ? { fast: true } : {}), ...(permissionMode && permissionMode !== "default" ? { permissionMode } : {}),
      ...(attachments.length && !command ? { attachments: attachments.flatMap(a => a.id ? [{ id: a.id }] : []) } : {}),
    };
    const last: LastRequest = command ? { root, text: plan.text, preset: null, attachments: [], provider, model, effort } : { root, text, preset, attachments, provider, model, effort };
    const mine = { generation: memory.current.generation + 1, text, preset: preset?.id ?? null, keys: attachments.map(a => a.key), ...(command ? { command: true as const } : {}) };
    update({ sending: mine, generation: mine.generation, notice: retry ? memory.current.notice : null, card: null });
    const outcome = await props.start(request, last).catch((): StartOutcome => ({ error: "unknown" }));
    // The reply may come after the person left and came back to Home; it settles only its own send.
    if (memory.current.sending?.generation !== mine.generation) return;
    if ("ok" in outcome) {
      const ids = mine.command ? [] : attachments.flatMap(a => a.id ? [a.id] : []);
      update(current => {
        const same = current.text === mine.text && (current.preset?.id ?? null) === mine.preset && current.attachments.map(a => a.key).join("\n") === mine.keys.join("\n");
        const draft = same && !mine.command ? [] : current.attachments;
        const lastKeys = { ...current.lastKeys, [root]: mine.command ? [] : mine.keys }, lastIds = { ...current.lastIds, [root]: ids };
        // This root's previous last request is replaced: what no root's last request and no draft still uses goes.
        const usedKeys = new Set([...Object.values(lastKeys).flat(), ...draft.map(a => a.key)]);
        const usedIds = new Set([...Object.values(lastIds).flat(), ...draft.flatMap(a => a.id ? [a.id] : [])]);
        const thumbnails = { ...current.thumbnails };
        for (const key of current.lastKeys[root] ?? []) if (!usedKeys.has(key) && thumbnails[key]) { URL.revokeObjectURL(thumbnails[key]!); delete thumbnails[key]; }
        const released = (current.lastIds[root] ?? []).filter(id => !usedIds.has(id));
        if (released.length) void window.doan.releaseAttachments(released).catch(console.error);
        // The next input starts from the defaults again: the fixed one, or with Last used the run App just recorded.
        return { sending: null, notice: null, thumbnails, lastKeys, lastIds, root, provider: null, models: {}, restoredModels: {}, efforts: {}, restoredEfforts: {}, permissions: {}, fast: {}, ...(same ? mine.command ? { text: "" } : { text: "", preset: null, attachments: [] } : {}) };
      });
      return;
    }
    if (outcome.error === "attachment_missing") {
      const { missing = [], replaced } = outcome;
      update(current => ({ sending: null, notice: null, attachments: markRefused(current.attachments, missing, replaced) }));
    }
    // Codex's /review before any message told the thread a permission mode: the card says to send one first; the text stays.
    else if (outcome.error === "command_mode_stale") {
      update({ sending: null, notice: null, card: { ...STALE_MODE_CARD } });
      setAnnouncement(`${STALE_MODE_CARD.title}. ${STALE_MODE_CARD.body}`);
    }
    else update({ sending: null, notice: startErrorView(outcome.error, provider, project, outcome.resetsAt ? resetTimeText(outcome.resetsAt, Date.now(), localClock()) : null) });
    queueMicrotask(() => field.current?.focus());
  };

  // A first message a quit stopped before main accepted it, in an earlier run, comes back once after what is typed here,
  // when its project is the picked one; the project's Overview may take it first. Home starts carry no anchors. main
  // hands it over only once, so a reply that comes after another pick picks its project again rather than send it there.
  // One that comes while a start is out waits for it to settle: that start's success clears only the draft it sent.
  // A take main answered with an error kept the draft there (preload takeStartDraft): the next pick asks again.
  useEffect(() => {
    if (!root) return;
    restoreStartDraft(window.doan, memory.current.startsAsked, root, { root }, returned => {
      const body = plainText(returned.segments);
      const land = () => update(current => ({ root, text: current.text && body ? `${current.text}\n\n${body}` : current.text || body, preset: current.preset ?? returned.preset, attachments: [...current.attachments, ...returned.attachments] }));
      if (memory.current.sending) memory.current.waitingStarts.set(root, { land, discard: () => {
        for (const attachment of returned.attachments) dropAttachment(window.doan, attachment);
      } });
      else land();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a newly picked root asks; the take survives a change of mount in composer memory.
  }, [root]);
  // Edit on Home: a different draft is never replaced without asking.
  useEffect(() => {
    if (!props.restore || props.restore.seq === memory.current.seen.restore) return;
    const seq = props.restore.seq;
    update(current => ({ seen: { ...current.seen, restore: seq } }));
    const result = restoreRequest({ text, preset, attachments }, props.restore.request, nameOf(props.restore.request.root) ?? project);
    if (result.confirm) setConfirm({ request: result.request, ...result.confirm });
    else apply(result.request);
  }, [props.restore?.seq]);
  const keepDraft = () => { setConfirm(null); queueMicrotask(focusEnd); };
  const apply = (request: LastRequest) => {
    setConfirm(null);
    // The replaced draft's chips the request does not use go as a chip removed by hand does (removeChip).
    const kept = new Set(request.attachments.flatMap(a => a.id ? [a.id] : [])), keptKeys = new Set(request.attachments.map(a => a.key));
    for (const replaced of memory.current.attachments) {
      const id = replaced.id;
      if (id && !kept.has(id)) void window.doan.removeAttachment(id).then(() => {
        if (!Object.values(memory.current.lastIds).some(ids => ids.includes(id))) return window.doan.releaseAttachments([id]);
      }).catch(console.error);
      const url = memory.current.thumbnails[replaced.key];
      if (url && !keptKeys.has(replaced.key) && !Object.values(memory.current.lastKeys).some(keys => keys.includes(replaced.key))) URL.revokeObjectURL(url);
    }
    // The files are checked again at once (2026-10-29 user): each chip shows checking, then ready or moved.
    const ids = request.attachments.flatMap(a => a.id ? [a.id] : []);
    if (ids.length) void window.doan.recheckAttachments(ids).catch(() => null).then(results => update(current => ({
      attachments: current.attachments.map(a => {
        if (!a.id || !ids.includes(a.id) || a.status !== "checking") return a;
        const result = results?.find(item => item.id === a.id);
        if (result?.ok) return readyAttachment(a.key, result.attachment);
        return { ...a, status: result?.error === "replaced" ? "replaced" : "missing" };
      }),
    })));
    // A request rebuilt from history names its preset by id only; the read list fills in its group and description.
    const preset = request.preset && (memory.current.presets?.ok ? memory.current.presets.result.presets.find(p => p.id === request.preset!.id) : undefined) || request.preset;
    // Its images' thumbnails join the composer's object URLs, released by the same rules as a chosen file's.
    const thumbnails = { ...memory.current.thumbnails };
    for (const [key, bytes] of Object.entries(request.thumbnails ?? {})) if (!thumbnails[key]) { const url = thumbnailUrl(bytes); if (url) thumbnails[key] = url; }
    edit({ text: request.text, preset, thumbnails, attachments: request.attachments.map(a => a.id ? { ...a, status: "checking" } : a), root: request.root, provider: request.provider,
      models: request.model ? { ...memory.current.models, [request.provider]: request.model } : memory.current.models,
      restoredModels: request.model ? { [request.provider]: request.model } : {},
      restoredEfforts: request.model && request.effort ? { [effortKey(request.provider, request.model)]: request.effort } : {},
      efforts: request.model && request.effort ? { ...memory.current.efforts, [effortKey(request.provider, request.model)]: request.effort } : memory.current.efforts });
    queueMicrotask(focusEnd);
  };

  // Keys the field does not handle itself; true when handled, so Enter reaches send only when nothing took it.
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (slashOpen) {
      const action = slashKey(event.key, highlight, slashRows.length, composing, { query: slash, row: slashRows[highlight] });
      if (action?.kind === "move") { event.preventDefault(); setHighlight(action.highlight); return true; }
      if (action?.kind === "pick") { event.preventDefault(); const row = slashRows[highlight]; if (row) chooseRow(row.id, row.kind, true); return true; }
      if (action?.kind === "close") { if (event.key === "Escape") event.preventDefault(); setDismissed(action.dismiss); return true; }
    }
    if (event.key === "Backspace" && removeChip(-1, "backspace")) { event.preventDefault(); return true; }
    return false;
  };

  const reason = availability.reason;
  const projectRows = card?.rows ?? [];
  const branchOf = (row: FolderEntry) => cardRow(row, null, null).summary?.branch ?? null;
  const branch = entry ? branchOf(entry) : null;
  const hasProjects = cards.length > 0;

  return <HomeStage>
    <Buddy buddy={props.buddy ?? "doany"} size={114} ref={doany} />
    <h1 className="home-greeting">{greetingText(props.greeting, hasProjects ? project : null)}</h1>
    <div className="home-composer">
      {hasProjects ? <DropdownMenu.Root open={projectMenu} onOpenChange={setProjectMenu}>
        <NameTip text={project}><DropdownMenu.Trigger asChild><button type="button" className="home-project doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-label={`Project: ${project}`} disabled={sending}>
          <span className={`shell-thumbnail hue-${projectHue(project)}`} aria-hidden="true">{projectInitial(project)}</span><span className="home-project-name">{project}</span><ChevronDown className="chev" aria-hidden="true" />
        </button></DropdownMenu.Trigger></NameTip>
        <TooltipEscape value={() => setProjectMenu(false)}><DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu project-popover" aria-label="Projects" side="bottom" align="start" sideOffset={4} collisionPadding={8}>
          {/* Radix calls onValueChange even for a radio item whose onSelect was prevented, so a down project is ignored here too. */}
          <DropdownMenu.RadioGroup value={card?.key ?? ""} onValueChange={key => { const chosen = cards.find(item => item.key === key); if (chosen && !projectDown(chosen)) edit({ root: rootForProject(chosen.rows, props.shellProjects[chosen.key]?.selectedRoot) }); }}>
            {cards.map((item, index) => {
              // Every root that is not a list, reading included, is unavailable with its status chip. It stays reachable by
              // the arrow keys (aria-disabled, as the canvas row menu's items) and is read by its name, then its note.
              const down = projectDown(item);
              const chip = down ? cardRow(item.rows[0]!, null, null).chip : undefined;
              const noteId = `${listId}-project-note-${index}`;
              return <Fragment key={item.key}>
                <DropdownMenu.RadioItem value={item.key} className="doan-menu-item project-item" {...(down ? { "aria-disabled": true, "aria-label": item.name, "aria-describedby": noteId } : {})}
                  onSelect={event => { if (down) event.preventDefault(); }}>
                  <span className={`shell-thumbnail hue-${projectHue(item.name)}`} aria-hidden="true">{projectInitial(item.name)}</span><NameTip text={item.name}><span className="model-name">{item.name}</span></NameTip>
                  {chip && <span className={chipClass(chip)}>{chip}</span>}<span className="check-slot">{item.key === card?.key && <Check className="check" aria-hidden="true" />}</span>
                </DropdownMenu.RadioItem>
                {down && <p className="menu-note" id={noteId}>{chip === "Reading" ? `${item.name} is still being read.` : `${chip === "Missing" ? `${item.name} is missing.` : `${item.name} isn’t available.`} Fix it from its menu in the sidebar.`}</p>}
              </Fragment>;
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="doan-menu-sep" />
          <DropdownMenu.Item className="doan-menu-item" onSelect={() => props.addProjects()}><Plus aria-hidden="true" /><span className="model-name">Add Projects…</span></DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal></TooltipEscape>
      </DropdownMenu.Root>
        : <button type="button" className="home-project doan-button" data-ui-size="sm" data-ui-variant="trigger" onClick={() => props.addProjects()}><Plus aria-hidden="true" /><span>Add Projects…</span></button>}
      <div className="composer" {...drop.handlers}>
        {drop.cover}
        <ComposerCard readonly={sending}>
          {presetHeld && <div className="composer-chips command-notice"><Info aria-hidden="true" /><span>{PRESET_NOTICE}</span></div>}
          <ComposerChips attachments={attachments} preset={presetHeld ? null : preset} thumbnails={m.thumbnails} homeDirectory={props.homeDirectory} disabled={sending} removeButtons={removeButtons} onRemove={index => removeChip(index, "button")} />
          <ComposerField ref={field} skillNames={skillNames} commandNames={commandNames} onAnnounce={setAnnouncement} value={textSegments(text)} onChange={value => edit({ text: typedText(value) })} readOnly={sending} placeholder={presetPlaceholder(preset)}
            combobox={slashOpen ? { listId: `${listId}-slash`, activeId: slashRows[highlight] ? `${listId}-s-${highlight}` : undefined } : null}
            onKey={keyDown} onSubmit={() => void send()} onPaste={paste} onInput={() => doany.current?.typing()} />
          {counter && <div className={`composer-count${composed.length > TEXT_LIMIT ? " over" : ""}`} aria-live="polite">{counter}</div>}
          <ComposerTools>
            <AttachButton disabled={sending} onClick={choose} />
            <PresetsButton skills={skills} reply={m.presets} project={project} suggested={suggested} listId={listId} disabled={sending}
              onOpen={() => { projectSkills.read(); if (memory.current.presets && !memory.current.presets.ok) readPresets(); }} onChoose={(id, kind) => chooseRow(id, kind, false)} retry={presetsRetry} onRetry={loadPresets} onPicked={focusEnd} />
            {slashOpen && slashView && <SlashPresets skills={skills} view={slashView} query={slash} listId={listId} highlight={highlight} listRef={slashList} onHighlight={setHighlight} onChoose={(id, kind) => chooseRow(id, kind, true)} retry={presetsRetry} onRetry={loadPresets} />}
            <span className="grow" />
            <AgentPicker picker={picker} auth={auth} disabled={sending} onOpen={() => { if (root && healthy) for (const group of picker.groups) if (group.read) readModels(root, group.provider); }}
              onPick={(pickedProvider, value) => edit({ provider: pickedProvider, ...(value === null ? {} : { models: { ...memory.current.models, [pickedProvider]: value }, restoredModels: { ...memory.current.restoredModels, [pickedProvider]: undefined } }) })} onSettings={openSettings} />
            {picker.effort && provider && model && <EffortPicker view={picker.effort} effort={effort} disabled={sending} onPick={value => edit({ efforts: { ...memory.current.efforts, [effortKey(provider, model)]: value }, restoredEfforts: { ...memory.current.restoredEfforts, [effortKey(provider, model)]: undefined } })} onPickFast={on => { edit({ fast: { ...memory.current.fast, [provider]: on } }); props.onRemember?.({ provider, model, effort, ...modelPicked, fast: on }); }} />}
            {permission && provider && <PermissionPicker view={permission} disabled={sending} onPick={mode => edit({ permissions: { ...memory.current.permissions, [provider]: mode } })} />}
            <SendButton enabled={availability.enabled} sending={sending} onSend={() => void send()} hint={reason?.text} />
          </ComposerTools>
        </ComposerCard>
        {hasProjects && entry && <div className="composer-tray">
          {projectRows.length > 1 ? <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-label={`Worktree: ${branch ?? displayPath(entry.path, props.homeDirectory)}`} disabled={sending}>
              <GitBranch aria-hidden="true" /><span>{branch ?? entry.path.split("/").at(-1)}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu shell-project-menu worktree-popover" aria-label="Worktrees" side="bottom" align="start" sideOffset={4} collisionPadding={8}>
              <DropdownMenu.Label className="doan-menu-head">Worktrees</DropdownMenu.Label>
              {projectRows.map(row => {
                const chip = cardRow(row, null, null).chip;
                const off = row.kind !== "list";
                // Reachable by the arrow keys while unavailable; its name already holds the status chip.
                return <DropdownMenu.Item key={row.path} className="doan-menu-item shell-worktree" aria-current={row.path === root ? "true" : "false"} aria-disabled={off || undefined}
                  onSelect={event => { if (off) { event.preventDefault(); return; } edit({ root: row.path }); }}>
                  <GitBranch aria-hidden="true" /><span><span>{branchOf(row) ?? row.path.split("/").at(-1)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>
                  {off && chip ? <span className={chipClass(chip)}>{chip}</span> : row.path === root && <Check aria-hidden="true" />}
                </DropdownMenu.Item>;
              })}
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root> : branch && <span className="tray-branch"><GitBranch aria-hidden="true" /><span className="selectable">{branch}</span></span>}
          <span className="tray-path selectable">{displayPath(entry.path, props.homeDirectory)}</span>
        </div>}
      </div>
      {prompts.length > 0 && <div className="home-suggestions" role="group" aria-label="Suggested prompts" inert={started}>{prompts.map(prompt =>
        <SuggestionButton key={prompt.label} prompt={prompt} onPick={() => { edit({ preset: prompt.preset, text: prompt.text }); queueMicrotask(focusEnd); }} />)}</div>}
      {m.card && <CommandCardNotice card={m.card} onDismiss={() => { update({ card: null }); queueMicrotask(focusEnd); }}
        onAction={target => { if (target === "agentsSettings") props.openSettings({ section: "agents", ...(provider ? { provider } : {}) }); else focusPicker(field.current?.element()?.closest(".home-composer"), target); }} />}
      {notice && <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text selectable" id={`${listId}-notice`}>{notice.text}</span>{notice.retry && retryButton({ running: sending, variant: "subtle", describedBy: `${listId}-notice`, onRetry: () => void send(true) })}</div>}
      {!notice && reason && reason.kind !== "noAgent" && (reason.kind === "attachmentMissing"
        ? <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text selectable">{reason.text}</span></div>
        : <div className="composer-reason" role="status"><span>{reason.text}</span></div>)}
      <div className="sr-only" role="status">{announcement}</div>
    </div>
    {/* Escape is Keep draft, so both put focus back in the field. An alertdialog, as every confirmation. */}
    {confirm && <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="home-replace-draft-title" aria-describedby="home-replace-draft-body" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); keepDraft(); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="home-replace-draft-title">{confirm.title}</h3><p className="doan-dialog-description" id="home-replace-draft-body">{confirm.body}</p></div></div>
      <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" autoFocus onClick={keepDraft}>{confirm.cancel}</button><button type="button" className="doan-button" data-ui-variant="prominent" onClick={() => apply(confirm.request)}>{confirm.confirm}</button></div>
    </dialog>}
    <HomeCredit />
  </HomeStage>;
}

