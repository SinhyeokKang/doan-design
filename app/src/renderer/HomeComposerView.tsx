import { Fragment, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, GitBranch, Plus } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { AttachmentResult } from "../main/attachments";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { FolderEntry } from "../main/view";
import type { HomeMemory, ShellProject } from "../restore/uiState";
import { AlertIcon } from "./AlertIcon";
import {
  AgentPicker, AttachButton, ComposerCard, ComposerChips, ComposerField, ComposerTools, EffortPicker, GroupIcon, PermissionPicker, PresetsButton, SendButton, SlashPresets, useComposerDrop,
  type ComposerFieldHandle,
} from "./ComposerParts";
import { Doany, type DoanyHandle } from "./Doany";
import { textSegments, typedText } from "./anchorField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { cardRow, groupProjects } from "./homeCards";
import {
  attachmentChipView, attachmentLimit, chipRemoval, composeRequest, defaultEffort, defaultModel, defaultProject, defaultProvider,
  fixedPreference, greetingText, groupIcon, lengthCounter, modelOption, modelPickerView, presetListView, presetPlaceholder,
  rootForProject, selectableProvider, sendAvailability, slashQuery, startErrorView, suggestedPresets, suggestedPrompts, TEXT_LIMIT,
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

// Everything the composer keeps between Home visits for this run (design §4.1: a draft survives leaving Home, not a
// restart). App owns the object so a visit's unmount does not lose it; reads finishing after an unmount still land.
export interface ComposerMemory {
  text: string; preset: PresetSummary | null; attachments: AttachmentDraft[];
  // Choices the person made; absent ones follow the defaults (design §4.2, §4.3, §4.7). The agent, model and effort
  // picks last until the input is sent (buzz-settings design 'New conversations'); the project stays.
  root: string | null; provider: Provider | null;
  models: Partial<Record<Provider, string>>; efforts: Record<string, string>;
  // Permission mode picks by provider (permission-mode), kept the same way as the model picks.
  permissions: Partial<Record<Provider, PermissionModeId>>;
  // The Settings default this input started with: a change in Settings applies from the next new input
  // (buzz-settings design 'New conversations'). undefined: not taken yet.
  defaults?: NewConversationDefault | null;
  // Model lists by root and provider, and the preset list, as read in this run.
  lists: Record<string, ModelsState>; presets: PresetListReply | undefined;
  auth: AuthSnapshot | null | undefined;
  thumbnails: Record<string, string>;
  // Attachment keys and main's ids of each root's last sent request: Edit on Home shows their thumbnails again and
  // main keeps the ids for its recheck until no last request or draft uses them (review BU3 r2 🟡4, 🟡5).
  lastKeys: Record<string, string[]>;
  lastIds: Record<string, string[]>;
  // A start still waiting for main, kept here so a later visit stays locked and its reply clears only the draft it
  // sent (review BU3 🟡2); and the refusal or attachment notice under the composer.
  sending: { generation: number; text: string; preset: string | null; keys: string[] } | null;
  generation: number;
  notice: { text: string; retry: boolean } | null;
  greeting: string | null;
  // The last `select` and `restore` requests already applied, so a later visit does not apply them again.
  seen: { select: number; restore: number };
}
export function emptyComposer(): ComposerMemory {
  return { text: "", preset: null, attachments: [], root: null, provider: null, models: {}, efforts: {}, permissions: {}, lists: {}, presets: undefined, auth: undefined, thumbnails: {}, lastKeys: {}, lastIds: {}, sending: null, generation: 0, notice: null, greeting: null, seen: { select: 0, restore: 0 } };
}

const mountsByMemory = new WeakMap<object, Set<() => void>>();
function viewers(memory: { current: ComposerMemory }): Set<() => void> {
  let mounts = mountsByMemory.get(memory);
  if (!mounts) { mounts = new Set(); mountsByMemory.set(memory, mounts); }
  return mounts;
}

export interface StartInput { root: string; mode: "newDesign"; runtime: Provider; text: string; model?: string; effort?: string; permissionMode?: PermissionModeId; attachments?: { id: string }[] }
// conversationId: the started conversation, for a host that shows it in place (the project Overview).
export type StartOutcome = { ok: true; conversationId?: string } | { error: string; missing?: string[] };

export interface HeroComposerProps {
  entries: readonly FolderEntry[]; homeDirectory: string | null;
  shellProjects: Readonly<Record<string, ShellProject>>;
  loaded: string | null;
  // A project to choose once: first run's handoff, or one the person just added (design §4.2, §6). The person's later
  // choice wins over it.
  select: { root: string; seq: number } | null;
  // ui-state's Home memory; null until the saved state is read.
  prefs: HomeMemory | null;
  memory: { current: ComposerMemory };
  // Running Home conversations by root (one per root, design §4.5).
  running: ReadonlyMap<string, { conversationId: string; waiting: boolean }>;
  restore: { request: LastRequest; seq: number } | null;
  greeting: string;
  start(request: StartInput, last: LastRequest): Promise<StartOutcome>;
  openConversation(conversationId: string): void;
  // The project picker's Add Projects… opens the Add Projects page.
  addProjects(): void;
  // Settings > Agents' New conversations; null is Last used, undefined not read yet.
  defaults?: NewConversationDefault | null | undefined;
  // The agent picker's way into Settings > Agents (buzz-settings design '홈 공급자 선택기').
  openSettings(target: SettingsTarget): void;
  // A model or effort pick is remembered as Last used before any send (dogfooding #6).
  onRemember?(choice: ComposerChoice): void;
}

// The group sits 64px above the panel's centre with at least --space-8 around it (doan-mascot design '배치').
const STAGE_LIFT = 64, STAGE_MIN = 32;
// The group's height in its reference state: an empty two-line field with the suggestions shown (their place is kept
// while hidden). What a draft adds inside the card (chips, extra lines, the counter) and the reason line or notice
// below the suggestions are left out, so they grow downward from a field that stays where it was.
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

const listKey = (root: string, provider: Provider) => `${root}\n${provider}`;
const effortKey = (provider: Provider, model: string) => `${provider}\n${model}`;

// `/` list keys (design §4.9): arrows move, Enter picks unless an IME is composing, Tab closes, Escape closes until
// the field is empty again.
export function slashKey(key: string, highlight: number, count: number, composing: boolean): { kind: "move"; highlight: number } | { kind: "pick" } | { kind: "close"; dismiss: boolean } | null {
  if (key === "ArrowDown" || key === "ArrowUp") return count === 0 ? null : { kind: "move", highlight: (highlight + (key === "ArrowDown" ? 1 : -1) + count) % count };
  if (key === "Enter") return composing || count === 0 ? null : { kind: "pick" };
  if (key === "Tab") return { kind: "close", dismiss: true };
  if (key === "Escape") return { kind: "close", dismiss: true };
  return null;
}

// Cmd+V (design §4.8): text pastes as text; Finder files attach by their local path; an image alone attaches as a
// pasted image. Finder puts the file names on the clipboard as text too, so text that names the copied files is
// not a text paste.
export function pasteAction(text: string, files: readonly { name: string; type: string }[]): "text" | "files" | "none" {
  if (files.length === 0) return text ? "text" : "none";
  if (text.trim() && !files.some(file => text.includes(file.name))) return "text";
  return "files";
}

const ATTACH_ERRORS: Record<string, (name: string) => string> = {
  not_found: name => `${name} wasn’t found, so it wasn’t attached.`,
  not_file: name => `${name} isn’t a file, so it wasn’t attached.`,
  not_image: name => `${name} isn’t a readable image, so it wasn’t attached.`,
  unreadable: name => `${name} couldn’t be read, so it wasn’t attached.`,
  too_large: () => "This image is over 50 MB, so it wasn’t attached.",
};

function chipClass(chip: string | undefined): string {
  return `ob-chip${chip === "Config error" ? " err" : chip === "Missing" || chip === "CLI error" ? " warn" : ""}`;
}

// Home's composer (buzz-conversation design §3.1 'HeroComposer'): the shared primitives with Home's own project picker,
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
  };
  const m = memory.current;
  const sending = m.sending !== null, notice = m.notice;
  const setNotice = (next: ComposerMemory["notice"]) => update({ notice: next });
  const [announcement, setAnnouncement] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [confirm, setConfirm] = useState<{ request: LastRequest; title: string; body: string; cancel: string; confirm: string } | null>(null);
  const field = useRef<ComposerFieldHandle | null>(null);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const doany = useRef<DoanyHandle | null>(null);
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
  // A chosen root that left the list falls back without restoring on Undo (design §4.2).
  useEffect(() => {
    if (!picked.announcement) return;
    update({ root: picked.root });
    setAnnouncement(picked.announcement);
  }, [picked.announcement]);
  useEffect(() => {
    if (props.select && props.select.seq !== memory.current.seen.select) update(current => ({ root: props.select!.root, seen: { ...current.seen, select: props.select!.seq } }));
  }, [props.select?.seq]);

  // Providers: the person's choice stays even when it stops being ready (design §4.3); until then the default.
  const auth = m.auth;
  useEffect(() => window.doan.onAgentAuth(snapshot => update({ auth: snapshot })), []);
  // An empty composer takes the current default; once something is typed, attached or picked as a preset, the input
  // keeps the default it started with until it is sent.
  const started = m.text !== "" || m.preset !== null || m.attachments.length > 0;
  const defaults = started && m.defaults !== undefined ? m.defaults : props.defaults ?? null;
  useEffect(() => { if (!started && props.defaults !== undefined && memory.current.defaults !== props.defaults) update({ defaults: props.defaults }); });
  const provider = m.provider ?? defaultProvider(auth, props.prefs?.lastProvider, defaults);
  const fixed = provider ? fixedPreference(defaults, provider) : null;
  const lists: Partial<Record<Provider, ModelsState>> = root ? Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, m.lists[listKey(root, status.provider)]])) : {};
  const listState = provider ? lists[provider] : undefined;
  const saved = provider ? props.prefs?.models?.[provider] : undefined;
  const explicitModel = provider ? m.models[provider] : undefined;
  const model = provider ? (modelOption(listState, explicitModel ?? null)?.id ?? defaultModel(listState, saved, fixed)) : null;
  const option = modelOption(listState, model);
  const pickedEffort = provider && model ? m.efforts[effortKey(provider, model)] : undefined;
  const effort = pickedEffort !== undefined ? defaultEffort(option, pickedEffort) : defaultEffort(option, saved?.model === model ? saved.effort : undefined, fixed);
  const picker = modelPickerView(auth, lists, { provider, model, effort });
  const pickedPermission = provider ? m.permissions[provider] : undefined;
  const permission = provider ? permissionPickerView(provider, listState, defaultPermission(permissionChoices(provider, listState), pickedPermission, props.prefs?.permissions?.[provider], fixed)) : null;
  const permissionMode = permission?.mode;
  const choiceTouched = m.provider !== undefined || explicitModel !== undefined || pickedEffort !== undefined || pickedPermission !== undefined;
  useEffect(() => { if (choiceTouched && provider) props.onRemember?.({ provider, model, effort, ...(permissionMode ? { permissionMode } : {}) }); }, [choiceTouched, provider, model, effort, permissionMode]);
  // The menu closes on select; the move waits for that, so the menu's own focus return comes first.
  const openSettings = (target: SettingsTarget) => queueMicrotask(() => props.openSettings(target));

  const readModels = (forRoot: string, forProvider: Provider) => {
    const key = listKey(forRoot, forProvider);
    if (memory.current.lists[key] !== undefined) return;
    update(current => ({ lists: { ...current.lists, [key]: "loading" } }));
    void window.doan.listConversationModels({ root: forRoot, runtime: forProvider }).catch(() => ({ error: "unknown" })).then(reply => update(current => ({ lists: { ...current.lists, [key]: reply } })));
  };
  const healthy = entry?.kind === "list";
  const ready = provider !== null && (auth?.providers ?? []).some(status => status.provider === provider && status.account !== null && selectableProvider(status));
  // The chosen provider's list shows its model and effort on the closed picker; the rest are read when it opens.
  useEffect(() => { if (root && healthy && provider && ready) readModels(root, provider); }, [root, healthy, provider, ready]);

  // Presets: read on entering Home and kept for the run; a failure is read again when the popover opens (§4.4).
  const readPresets = () => {
    update({ presets: undefined });
    void window.doan.designSkills.list().catch(() => undefined).then(reply => update({ presets: reply ?? { v: 1, ok: false, error: { code: "cli_error", reason: "failed", message: "" } } as PresetListReply }));
  };
  useEffect(() => { if (!memory.current.presets?.ok) readPresets(); }, []);
  const presets = m.presets?.ok ? m.presets.result.presets : [];
  const suggested = suggestedPresets(entry, presets);

  // The draft
  const { text, preset, attachments } = m;
  const chips = [...attachments.map(a => ({ label: attachmentChipView(a, props.homeDirectory).label })), ...(preset ? [{ label: preset.title, preset: true }] : [])];
  const running = root ? props.running.get(root) ?? null : null;
  const availability = sendAvailability({ projects: cards.length, root: entry, projectName: project, auth, provider, text, preset, attachments, running, sending });
  const composed = composeRequest(text, preset, attachments.length);
  const counter = lengthCounter(composed.length);
  const slash = slashQuery(text, dismissed);
  const slashView = slash !== null ? presetListView(m.presets, { project, suggested, query: slash, tab: null, slash: true }) : null;
  const slashRows = slashView?.kind === "list" ? slashView.sections.flatMap(section => section.rows) : [];
  const slashOpen = slash !== null && !sending;
  const prompts = ready && healthy ? suggestedPrompts(entry, project, presets) : [];
  const edit = (patch: Partial<ComposerMemory>) => update({ ...patch, notice: null });
  useEffect(() => { if (text === "") setDismissed(false); }, [text]);
  useEffect(() => { setHighlight(0); }, [slash]);

  const focusEnd = () => field.current?.focus("end");
  // Either way of picking puts the caret at the end of the field (design §4.9); the popover does it once it closes.
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
          const name = result && !result.ok ? result.name : next[at]!.name;
          next = next.filter(a => a.key !== key);
          if (result && !result.ok && result.error === "limit") notices.push("Only 10 files can be attached.");
          else notices.push((ATTACH_ERRORS[result?.ok === false ? result.error : "unreadable"] ?? ATTACH_ERRORS.unreadable!)(name));
          return;
        }
        const { attachment } = result;
        const url = attachment.kind === "image" ? thumbnailUrl(attachment.thumbnail) : null;
        if (url) thumbnails[key] = url;
        next[at] = { key, id: attachment.id, name: attachment.name, kind: attachment.kind, pasted: attachment.pasted, status: "ready", size: attachment.size, path: attachment.path };
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
      // A copied screenshot has no path on disk; it attaches as a pasted image instead (design §4.8).
      const final = await Promise.all(results.map(async (result, i) => {
        const file = accepted[i]!;
        if (!pastedImages || result.ok || result.error !== "not_found" || !file.type.startsWith("image/")) return result;
        if (file.size > 50 * 1024 * 1024) return { ok: false as const, name: "Pasted image", error: "too_large" as const };
        return window.doan.addPastedImage(await file.arrayBuffer()).catch(() => null);
      }));
      settle(keys, final);
    });
  };
  const choose = () => {
    if (memory.current.sending) return;
    void window.doan.chooseAttachments().catch(() => [] as AttachmentResult[]).then(results => {
      const ok = results.filter((result): result is Extract<AttachmentResult, { ok: true }> => result.ok);
      const limit = attachmentLimit(memory.current.attachments.length, ok.map(() => ({ pasted: false, size: 0 })));
      const keep = new Set<AttachmentResult>(limit.accept.map(i => ok[i]!));
      for (const result of ok) if (!keep.has(result)) void window.doan.removeAttachment(result.attachment.id);
      const chosen = results.filter(result => !result.ok || keep.has(result));
      const keys = chosen.map(() => crypto.randomUUID());
      update(current => ({ attachments: [...current.attachments, ...chosen.map((result, i): AttachmentDraft => ({ key: keys[i]!, name: result.ok ? result.attachment.name : result.name, kind: "file", pasted: false, status: "checking" }))] }));
      settle(keys, chosen);
      if (limit.notices.length) setNotice({ text: limit.notices.join(" "), retry: false });
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
    const files = Array.from(event.clipboardData.files);
    const action = pasteAction(event.clipboardData.getData("text/plain"), files);
    if (action !== "files") return;
    event.preventDefault();
    // The field is read-only while a start is pending, but a paste handler still runs.
    if (memory.current.sending) return;
    addFiles(files, true);
  };

  // Send
  const send = async () => {
    if (!availability.enabled || !root || !provider) return;
    // A send that starts hops; one that cannot start does nothing (doan-mascot spec 'Home 전송').
    doany.current?.hop();
    const request: StartInput = {
      root, mode: "newDesign", runtime: provider, text: composed,
      ...(model ? { model } : {}), ...(model && effort ? { effort } : {}), ...(permissionMode && permissionMode !== "default" ? { permissionMode } : {}),
      ...(attachments.length ? { attachments: attachments.flatMap(a => a.id ? [{ id: a.id }] : []) } : {}),
    };
    const last: LastRequest = { root, text, preset, attachments, provider, model, effort };
    const mine = { generation: memory.current.generation + 1, text, preset: preset?.id ?? null, keys: attachments.map(a => a.key) };
    update({ sending: mine, generation: mine.generation, notice: null });
    const outcome = await props.start(request, last).catch((): StartOutcome => ({ error: "unknown" }));
    // The reply may come after the person left and came back to Home; it settles only its own send.
    if (memory.current.sending?.generation !== mine.generation) return;
    if ("ok" in outcome) {
      const ids = attachments.flatMap(a => a.id ? [a.id] : []);
      update(current => {
        const same = current.text === mine.text && (current.preset?.id ?? null) === mine.preset && current.attachments.map(a => a.key).join("\n") === mine.keys.join("\n");
        const draft = same ? [] : current.attachments;
        const lastKeys = { ...current.lastKeys, [root]: mine.keys }, lastIds = { ...current.lastIds, [root]: ids };
        // This root's previous last request is replaced: what no root's last request and no draft still uses goes.
        const usedKeys = new Set([...Object.values(lastKeys).flat(), ...draft.map(a => a.key)]);
        const usedIds = new Set([...Object.values(lastIds).flat(), ...draft.flatMap(a => a.id ? [a.id] : [])]);
        const thumbnails = { ...current.thumbnails };
        for (const key of current.lastKeys[root] ?? []) if (!usedKeys.has(key) && thumbnails[key]) { URL.revokeObjectURL(thumbnails[key]!); delete thumbnails[key]; }
        const released = (current.lastIds[root] ?? []).filter(id => !usedIds.has(id));
        if (released.length) void window.doan.releaseAttachments(released).catch(console.error);
        // The next input starts from the defaults again: the fixed one, or with Last used the run App just recorded.
        return { sending: null, thumbnails, lastKeys, lastIds, root, provider: null, models: {}, efforts: {}, permissions: {}, ...(same ? { text: "", preset: null, attachments: [] } : {}) };
      });
      return;
    }
    if (outcome.error === "attachment_missing") {
      const missing = new Set(outcome.missing ?? []);
      update(current => ({ sending: null, attachments: current.attachments.map(a => a.id && missing.has(a.id) ? { ...a, status: "missing" } : a) }));
    // A late project_busy is shown by the reason line, which the run's list now carries (design §3.4).
    } else if (outcome.error === "project_busy") update({ sending: null });
    else update({ sending: null, notice: startErrorView(outcome.error, provider, project) });
    queueMicrotask(() => field.current?.focus());
  };

  // Edit on Home: a different draft is never replaced without asking (design §7.4).
  useEffect(() => {
    if (!props.restore || props.restore.seq === memory.current.seen.restore) return;
    const seq = props.restore.seq;
    update(current => ({ seen: { ...current.seen, restore: seq } }));
    const result = restoreRequest({ text, preset, attachments }, props.restore.request, nameOf(props.restore.request.root) ?? project);
    if (result.confirm) setConfirm({ request: result.request, ...result.confirm });
    else apply(result.request);
  }, [props.restore?.seq]);
  const apply = (request: LastRequest) => {
    setConfirm(null);
    // The files are checked again at once (design §7.4, 2026-10-29 user): each chip shows checking, then ready or moved.
    const ids = request.attachments.flatMap(a => a.id ? [a.id] : []);
    if (ids.length) void window.doan.recheckAttachments(ids).catch(() => null).then(results => update(current => ({
      attachments: current.attachments.map(a => {
        if (!a.id || !ids.includes(a.id) || a.status !== "checking") return a;
        const result = results?.find(item => item.id === a.id);
        return result?.ok ? { ...a, status: "ready", size: result.attachment.size, path: result.attachment.path } : { ...a, status: "missing" };
      }),
    })));
    // A request rebuilt from history names its preset by id only; the read list fills in its group and description.
    const preset = request.preset && (memory.current.presets?.ok ? memory.current.presets.result.presets.find(p => p.id === request.preset!.id) : undefined) || request.preset;
    // Its images' thumbnails join the composer's object URLs, released by the same rules as a chosen file's.
    const thumbnails = { ...memory.current.thumbnails };
    for (const [key, bytes] of Object.entries(request.thumbnails ?? {})) if (!thumbnails[key]) { const url = thumbnailUrl(bytes); if (url) thumbnails[key] = url; }
    edit({ text: request.text, preset, thumbnails, attachments: request.attachments.map(a => a.id ? { ...a, status: "checking" } : a), root: request.root, provider: request.provider,
      models: request.model ? { ...memory.current.models, [request.provider]: request.model } : memory.current.models,
      efforts: request.model && request.effort ? { ...memory.current.efforts, [effortKey(request.provider, request.model)]: request.effort } : memory.current.efforts });
    queueMicrotask(focusEnd);
  };

  // Keys the field does not handle itself; true when handled, so Enter reaches send only when nothing took it.
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (slashOpen) {
      const action = slashKey(event.key, highlight, slashRows.length, composing);
      if (action?.kind === "move") { event.preventDefault(); setHighlight(action.highlight); return true; }
      if (action?.kind === "pick") { event.preventDefault(); const row = slashRows[highlight]; if (row) choosePreset(row.id, true); return true; }
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
    <Doany size={114} ref={doany} />
    <h1 className="home-greeting">{greetingText(props.greeting, hasProjects ? project : null)}</h1>
    <div className="home-composer">
      {hasProjects ? <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button type="button" className="home-project doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-label={`Project: ${project}`} disabled={sending}>
          <span className={`shell-thumbnail hue-${projectHue(project)}`} aria-hidden="true">{projectInitial(project)}</span><span>{project}</span><ChevronDown className="chev" aria-hidden="true" />
        </button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu project-popover" aria-label="Projects" side="bottom" align="start" sideOffset={4} collisionPadding={8}>
          <DropdownMenu.RadioGroup value={card?.key ?? ""} onValueChange={key => { const chosen = cards.find(item => item.key === key); if (chosen) edit({ root: rootForProject(chosen.rows, props.shellProjects[chosen.key]?.selectedRoot) }); }}>
            {cards.map(item => {
              // Every root that is not a list, reading included, is disabled with its status chip (design §4.2).
              const down = item.rows.every(row => row.kind !== "list");
              const chip = down ? cardRow(item.rows[0]!, null, null).chip : undefined;
              return <Fragment key={item.key}>
                <DropdownMenu.RadioItem value={item.key} className="doan-menu-item project-item" disabled={down}>
                  <span className={`shell-thumbnail hue-${projectHue(item.name)}`} aria-hidden="true">{projectInitial(item.name)}</span><span className="model-name">{item.name}</span>
                  {chip && <span className={chipClass(chip)}>{chip}</span>}<span className="check-slot">{item.key === card?.key && <Check className="check" aria-hidden="true" />}</span>
                </DropdownMenu.RadioItem>
                {down && <p className="menu-note">{chip === "Missing" ? `${item.name} is missing.` : `${item.name} isn’t available.`} Fix it from its menu in the sidebar.</p>}
              </Fragment>;
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="doan-menu-sep" />
          <DropdownMenu.Item className="doan-menu-item" onSelect={() => props.addProjects()}><Plus aria-hidden="true" /><span className="model-name">Add Projects…</span></DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
        : <button type="button" className="home-project doan-button" data-ui-size="sm" data-ui-variant="trigger" onClick={() => props.addProjects()}><Plus aria-hidden="true" /><span>Add Projects…</span></button>}
      <div className="composer" {...drop.handlers}>
        {drop.cover}
        <ComposerCard readonly={sending}>
          <ComposerChips attachments={attachments} preset={preset} thumbnails={m.thumbnails} homeDirectory={props.homeDirectory} disabled={sending} removeButtons={removeButtons} onRemove={index => removeChip(index, "button")} />
          <ComposerField ref={field} value={textSegments(text)} onChange={value => edit({ text: typedText(value) })} readOnly={sending} placeholder={presetPlaceholder(preset)}
            combobox={slashOpen ? { listId: `${listId}-slash`, activeId: slashRows[highlight] ? `${listId}-s-${highlight}` : undefined } : null}
            onKey={keyDown} onSubmit={() => void send()} onPaste={paste} onInput={() => doany.current?.typing()} />
          {counter && <div className={`composer-count${composed.length > TEXT_LIMIT ? " over" : ""}`} aria-live="polite">{counter}</div>}
          <ComposerTools>
            <AttachButton disabled={sending} onClick={choose} />
            <PresetsButton reply={m.presets} project={project} suggested={suggested} listId={listId} disabled={sending}
              onOpen={() => { if (memory.current.presets && !memory.current.presets.ok) readPresets(); }} onChoose={id => choosePreset(id, false)} onRetry={readPresets} onPicked={focusEnd} />
            {slashOpen && slashView && <SlashPresets view={slashView} query={slash} listId={listId} highlight={highlight} onChoose={id => choosePreset(id, true)} onRetry={readPresets} />}
            <span className="grow" />
            <AgentPicker picker={picker} auth={auth} disabled={sending} onOpen={() => { if (root && healthy) for (const group of picker.groups) if (group.read) readModels(root, group.provider); }}
              onPick={(pickedProvider, value) => edit({ provider: pickedProvider, ...(value === "default" ? {} : { models: { ...memory.current.models, [pickedProvider]: value } }) })} onSettings={openSettings} />
            {picker.effort && provider && model && <EffortPicker view={picker.effort} effort={effort} disabled={sending} onPick={value => edit({ efforts: { ...memory.current.efforts, [effortKey(provider, model)]: value } })} />}
            {permission && provider && <PermissionPicker view={permission} disabled={sending} onPick={mode => edit({ permissions: { ...memory.current.permissions, [provider]: mode } })} />}
            <SendButton enabled={availability.enabled} sending={sending} onSend={() => void send()} />
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
                return <DropdownMenu.Item key={row.path} className="doan-menu-item shell-worktree" aria-current={row.path === root ? "true" : "false"} disabled={off} onSelect={() => edit({ root: row.path })}>
                  <GitBranch aria-hidden="true" /><span><span>{branchOf(row) ?? row.path.split("/").at(-1)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>
                  {off && chip ? <span className={chipClass(chip)}>{chip}</span> : row.path === root && <Check aria-hidden="true" />}
                </DropdownMenu.Item>;
              })}
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root> : branch && <span className="tray-branch"><GitBranch aria-hidden="true" /><span>{branch}</span></span>}
          <span className="tray-path">{displayPath(entry.path, props.homeDirectory)}</span>
        </div>}
      </div>
      {prompts.length > 0 && <div className="home-suggestions" role="group" aria-label="Suggested prompts" inert={started}>{prompts.map(prompt => {
        const button = <button key={prompt.label} type="button" className="suggestion doan-button" data-ui-size="sm" data-ui-variant="quiet" onClick={() => { edit({ preset: prompt.preset, text: prompt.text }); queueMicrotask(focusEnd); }}>
          <GroupIcon name={groupIcon(prompt.preset.group)} /><span>{prompt.label}</span></button>;
        return <Tooltip key={prompt.label}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>{prompt.label}</TooltipContent></Tooltip>;
      })}</div>}
      {notice && <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{notice.text}</span>{notice.retry && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={() => void send()}>Retry</button>}</div>}
      {!notice && reason && (reason.kind === "attachmentMissing"
        ? <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{reason.text}</span></div>
        : <div className="composer-reason" role="status"><span>{reason.text}</span>{reason.kind === "running" && reason.open && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-label="Open the running conversation" onClick={() => props.openConversation(reason.open)}>Open</button>}</div>)}
      <div className="sr-only" role="status">{announcement}</div>
    </div>
    {confirm && <dialog className="doan-dialog" data-ui-size="compact" aria-label={confirm.title} ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); setConfirm(null); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{confirm.title}</h3><p className="doan-dialog-description">{confirm.body}</p></div></div>
      <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={() => { setConfirm(null); queueMicrotask(focusEnd); }}>{confirm.cancel}</button><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={() => apply(confirm.request)}>{confirm.confirm}</button></div>
    </dialog>}
  </HomeStage>;
}

