import { Fragment, useEffect, useId, useReducer, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ArrowUp, Check, ChevronDown, Compass, FileText, Gauge, GitBranch, Paintbrush, PencilSparkles, Plus, ScanEye, Search, Shapes, TextAlignStart, TriangleAlert, X } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { AttachmentResult } from "../main/attachments";
import type { FolderEntry } from "../main/view";
import type { HomeMemory, ShellProject } from "../restore/uiState";
import { providerShortStatus } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { cardRow, groupProjects } from "./homeCards";
import {
  attachmentChipView, attachmentLimit, chipRemoval, composeRequest, defaultEffort, defaultModel, defaultProject, defaultProvider,
  dropTarget, greetingText, groupIcon, isSubmitKey, lengthCounter, modelOption, modelPickerView, presetListView, presetPlaceholder, providerLogo,
  rootForProject, selectableProvider, sendAvailability, slashQuery, startErrorView, suggestedPresets, suggestedPrompts, TEXT_LIMIT,
  type AttachmentDraft, type ModelsState, type PresetListReply, type PresetRow, type PresetSummary,
} from "./homeComposer";
import type { LastRequest } from "./homeConversations";
import { restoreRequest } from "./homeConversations";
import { displayPath } from "./projectDisplay";
import { projectHue, projectInitial } from "./shellNavigation";

// Everything the composer keeps between Home visits for this run (design §4.1: a draft survives leaving Home, not a
// restart). App owns the object so a visit's unmount does not lose it; reads finishing after an unmount still land.
export interface ComposerMemory {
  text: string; preset: PresetSummary | null; attachments: AttachmentDraft[];
  // Choices the person made; absent ones follow the defaults (design §4.2, §4.3, §4.7).
  root: string | null; provider: Provider | null;
  models: Partial<Record<Provider, string>>; efforts: Record<string, string>;
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
  return { text: "", preset: null, attachments: [], root: null, provider: null, models: {}, efforts: {}, lists: {}, presets: undefined, auth: undefined, thumbnails: {}, lastKeys: {}, lastIds: {}, sending: null, generation: 0, notice: null, greeting: null, seen: { select: 0, restore: 0 } };
}

const mountsByMemory = new WeakMap<object, Set<() => void>>();
function viewers(memory: { current: ComposerMemory }): Set<() => void> {
  let mounts = mountsByMemory.get(memory);
  if (!mounts) { mounts = new Set(); mountsByMemory.set(memory, mounts); }
  return mounts;
}

export interface StartInput { root: string; mode: "newDesign"; runtime: Provider; text: string; model?: string; effort?: string; attachments?: { id: string }[] }
export type StartOutcome = { ok: true } | { error: string; missing?: string[] };

export interface HomeComposerProps {
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
  running: ReadonlyMap<string, string>;
  restore: { request: LastRequest; seq: number } | null;
  greeting: string;
  start(request: StartInput, last: LastRequest): Promise<StartOutcome>;
  openConversation(conversationId: string): void;
  // The project picker's Add Projects… opens the Add Projects page.
  addProjects(): void;
}

const GROUP_ICONS: Record<string, typeof Compass> = { compass: Compass, "scan-eye": ScanEye, paintbrush: Paintbrush, "text-align-start": TextAlignStart, shapes: Shapes, "pencil-sparkles": PencilSparkles };
function GroupIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GROUP_ICONS[name] ?? PencilSparkles;
  return <Icon className={className} aria-hidden="true" />;
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

// Group tabs are one Tab stop; ←/→ move between them (design §4.4).
export function tabKey(keys: readonly string[], current: string, key: string): string | null {
  const at = keys.indexOf(current);
  if (at === -1 || (key !== "ArrowLeft" && key !== "ArrowRight")) return null;
  return keys[(at + (key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length] ?? null;
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

export function HomeComposer(props: HomeComposerProps) {
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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [confirm, setConfirm] = useState<{ request: LastRequest; title: string; body: string; cancel: string; confirm: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const pickedFocus = useRef(false);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const dragDepth = useRef(0);
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
  const provider = m.provider ?? defaultProvider(auth, props.prefs?.lastProvider);
  const lists: Partial<Record<Provider, ModelsState>> = root ? Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, m.lists[listKey(root, status.provider)]])) : {};
  const listState = provider ? lists[provider] : undefined;
  const saved = provider ? props.prefs?.models?.[provider] : undefined;
  const explicitModel = provider ? m.models[provider] : undefined;
  const model = provider ? (modelOption(listState, explicitModel ?? null)?.id ?? defaultModel(listState, saved)) : null;
  const option = modelOption(listState, model);
  const remembered = provider && model ? m.efforts[effortKey(provider, model)] ?? (saved?.model === model ? saved.effort : undefined) : undefined;
  const effort = defaultEffort(option, remembered);
  const picker = modelPickerView(auth, lists, { provider, model, effort });

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
  const prompts = text === "" && !preset && attachments.length === 0 && ready && healthy ? suggestedPrompts(entry, project, presets) : [];
  const edit = (patch: Partial<ComposerMemory>) => update({ ...patch, notice: null });
  useEffect(() => { if (text === "") setDismissed(false); }, [text]);
  useEffect(() => { setHighlight(0); }, [slash]);

  const focusEnd = () => {
    const field = textarea.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };
  const choosePreset = (id: string, fromSlash: boolean) => {
    const chosen = presets.find(p => p.id === id);
    if (!chosen) return;
    edit({ preset: chosen, ...(fromSlash ? { text: "" } : {}) });
    // Either way of picking puts the caret at the end of the field (design §4.9).
    if (fromSlash) queueMicrotask(focusEnd);
    else { pickedFocus.current = true; setPresetsOpen(false); }
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
    const removal = chipRemoval(chips, trigger === "button" ? { kind: "button", index } : { kind: "backspace", text, caret: textarea.current?.selectionStart ?? 0 });
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
      if (removal.focus === "textarea") textarea.current?.focus();
      else removeButtons.current[removal.focus]?.focus();
    });
    return true;
  };

  // Drop over the composer attaches files only; the window's own drop handling never sees it (design §4.8).
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const dragHandlers = {
    onDragEnter: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth.current++; setDropping(true); },
    onDragOver: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = sending ? "none" : "copy"; },
    onDragLeave: (event: DragEvent) => { if (!hasFiles(event)) return; event.stopPropagation(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDropping(false); } },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = 0; setDropping(false);
      if (sending) return;
      const files = Array.from(event.dataTransfer.files);
      // String items (a URL list, say) can sit among the files; only file items line up with `files`.
      const items = Array.from(event.dataTransfer.items ?? []).filter(item => item.kind === "file");
      const target = dropTarget(files.map((_file, i) => ({ isDirectory: !!items[i]?.webkitGetAsEntry?.()?.isDirectory })));
      if (target.notice) setNotice({ text: target.notice, retry: false });
      const chosen = target.files.map(i => files[i]!);
      if (chosen.length) { if (!target.notice) setNotice(null); addFiles(chosen, false); }
    },
  };
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
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
    const request: StartInput = {
      root, mode: "newDesign", runtime: provider, text: composed,
      ...(model ? { model } : {}), ...(model && effort ? { effort } : {}),
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
        return { sending: null, thumbnails, lastKeys, lastIds, root, provider, ...(same ? { text: "", preset: null, attachments: [] } : {}) };
      });
      return;
    }
    if (outcome.error === "attachment_missing") {
      const missing = new Set(outcome.missing ?? []);
      update(current => ({ sending: null, attachments: current.attachments.map(a => a.id && missing.has(a.id) ? { ...a, status: "missing" } : a) }));
    } else update({ sending: null, notice: startErrorView(outcome.error, provider, project) });
    queueMicrotask(() => textarea.current?.focus());
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
    edit({ text: request.text, preset: request.preset, attachments: request.attachments.map(a => a.id ? { ...a, status: "checking" } : a), root: request.root, provider: request.provider,
      models: request.model ? { ...memory.current.models, [request.provider]: request.model } : memory.current.models,
      efforts: request.model && request.effort ? { ...memory.current.efforts, [effortKey(request.provider, request.model)]: request.effort } : memory.current.efforts });
    queueMicrotask(focusEnd);
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (slashOpen) {
      const action = slashKey(event.key, highlight, slashRows.length, composing);
      if (action?.kind === "move") { event.preventDefault(); setHighlight(action.highlight); return; }
      if (action?.kind === "pick") { event.preventDefault(); const row = slashRows[highlight]; if (row) choosePreset(row.id, true); return; }
      if (action?.kind === "close") { if (event.key === "Escape") event.preventDefault(); setDismissed(action.dismiss); return; }
    }
    if (event.key === "Backspace" && removeChip(-1, "backspace")) { event.preventDefault(); return; }
    if (isSubmitKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
      event.preventDefault();
      void send();
    }
  };

  const reason = availability.reason;
  const projectRows = card?.rows ?? [];
  const branchOf = (row: FolderEntry) => cardRow(row, null, null).summary?.branch ?? null;
  const branch = entry ? branchOf(entry) : null;
  const presetView = presetListView(m.presets, { project, suggested, query, tab });
  const presetRows = presetView.kind === "list" ? presetView.sections.flatMap(section => section.rows) : [];
  const focusRow = (index: number) => document.getElementById(`${listId}-p-${index}`)?.focus();
  const rowKey = (event: KeyboardEvent, index: number, row: PresetRow) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); focusRow(Math.max(0, Math.min(presetRows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePreset(row.id, false); }
  };
  const presetOption = (row: PresetRow, index: number, slashMode: boolean) => <div key={row.id} id={`${listId}-${slashMode ? "s" : "p"}-${index}`} className="doan-menu-item preset-item" role="option" aria-selected={slashMode ? index === highlight : false}
    tabIndex={slashMode ? undefined : -1} title={row.tooltip} data-highlighted={slashMode && index === highlight ? "" : undefined}
    onMouseDown={slashMode ? event => event.preventDefault() : undefined} onClick={() => choosePreset(row.id, slashMode)}
    onKeyDown={slashMode ? undefined : event => rowKey(event, index, row)}>
    <span className="preset-title">{row.title}</span><span className="sub">{row.group ?? row.scope}</span>
  </div>;
  const presetBody = (view: typeof presetView, slashMode: boolean): ReactNode => {
    if (view.kind === "loading") return <div className="popover-state" role="status"><span className="doan-spinner" aria-hidden="true" />{view.text}</div>;
    if (view.kind === "empty") return <div className="popover-state" role="status">{view.text}</div>;
    if (view.kind === "olderCli") return <div className="doan-notice" role="status"><AlertIcon /><span className="grow-text">{view.text}</span></div>;
    if (view.kind === "error") return <><div className="doan-notice error" role="alert"><AlertIcon /><span className="grow-text">{view.text}</span></div>{view.retry && <div className="popover-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={readPresets}>Retry</button></div>}</>;
    let index = 0;
    return <>
      {view.tabs.length > 0 && <div className="group-tabs shell-modes" role="tablist" aria-label="Preset groups">{view.tabs.map(item => <button key={item.key} type="button" role="tab" className={item.selected ? "current" : ""} aria-selected={item.selected} tabIndex={item.selected ? 0 : -1}
        onClick={() => setTab(item.key)} onKeyDown={event => {
          const next = tabKey(view.tabs.map(t => t.key), item.key, event.key);
          if (!next) return;
          event.preventDefault(); setTab(next);
          // React clears currentTarget after the handler, so the tab list is taken now and the new tab focused once drawn.
          const list = event.currentTarget.parentElement;
          requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
        }}>
        <GroupIcon name={item.icon} />{item.label}</button>)}</div>}
      <div className="popover-list" role="listbox" id={slashMode ? `${listId}-slash` : undefined} aria-label={view.summary ?? view.sections[0]?.title ?? "Design presets"}>
        {view.sections.map(section => <Fragment key={section.title ?? "results"}>{section.title && !slashMode && <div className="doan-menu-head">{section.title}</div>}{section.rows.map(row => presetOption(row, index++, slashMode))}</Fragment>)}
      </div>
    </>;
  };
  const searchField = (value: string, slashMode: boolean) => <label className="popover-search"><Search aria-hidden="true" /><input className="doan-input" data-ui-size="sm" placeholder="Search presets" aria-label="Search presets" value={value}
    readOnly={slashMode} tabIndex={slashMode ? -1 : undefined} aria-hidden={slashMode || undefined}
    onChange={slashMode ? undefined : event => { setQuery(event.target.value); }}
    onKeyDown={slashMode ? undefined : event => { if (event.key === "ArrowDown") { event.preventDefault(); focusRow(0); } }} /></label>;

  const iconButton = (label: string, node: ReactNode) => <Tooltip><TooltipTrigger asChild>{node}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
  const hasProjects = cards.length > 0;

  return <div className="home-stage">
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
      <div className="composer" {...dragHandlers}>
        {dropping && <div className="drop-target"><span className="sr-only" role="status">Drop to attach</span></div>}
        <div className={`composer-card${sending ? " readonly" : ""}`}>
          {chips.length > 0 && <div className="composer-chips">
            {attachments.map((a, index) => {
              const view = attachmentChipView(a, props.homeDirectory), url = m.thumbnails[a.key];
              const chip = <span className={`attach-chip${view.thumbnail && url ? " image" : ""}${view.problem ? " problem" : ""}`}>
                {view.thumbnail && url ? <span className="thumb" aria-hidden="true"><img src={url} alt="" /></span>
                  : <span className="file-icon" aria-hidden="true">{a.status === "checking" ? <span className="doan-spinner" /> : view.problem ? <TriangleAlert /> : <FileText />}</span>}
                <span className="attach-text"><b>{view.label}</b><small>{view.meta}</small></span>
                <button type="button" ref={node => { removeButtons.current[index] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={view.removeLabel} disabled={sending} onClick={() => removeChip(index, "button")}><X aria-hidden="true" /></button>
              </span>;
              return <Fragment key={a.key}>{view.tooltip ? <Tooltip><TooltipTrigger asChild>{chip}</TooltipTrigger><TooltipContent>{view.tooltip}</TooltipContent></Tooltip> : chip}</Fragment>;
            })}
            {preset && <span className="preset-chip"><GroupIcon name={groupIcon(preset.group)} /><span>{preset.title}</span>
              <button type="button" ref={node => { removeButtons.current[attachments.length] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={`Remove preset ${preset.title}`} disabled={sending} onClick={() => removeChip(attachments.length, "button")}><X aria-hidden="true" /></button></span>}
          </div>}
          <textarea ref={textarea} className="composer-input" aria-label="Message" rows={2} value={text} readOnly={sending} placeholder={presetPlaceholder(preset)}
            role={slashOpen ? "combobox" : undefined} aria-expanded={slashOpen ? true : undefined} aria-controls={slashOpen ? `${listId}-slash` : undefined}
            aria-autocomplete={slashOpen ? "list" : undefined} aria-activedescendant={slashOpen && slashRows[highlight] ? `${listId}-s-${highlight}` : undefined}
            onChange={event => edit({ text: event.target.value })} onKeyDown={keyDown} onPaste={paste} />
          {counter && <div className={`composer-count${composed.length > TEXT_LIMIT ? " over" : ""}`} aria-live="polite">{counter}</div>}
          <div className="composer-tools">
            {iconButton("Attach files", <button type="button" className="doan-icon-button" aria-label="Attach files" disabled={sending} onClick={choose}><Plus aria-hidden="true" /></button>)}
            <Popover.Root open={presetsOpen} onOpenChange={open => { setPresetsOpen(open); if (open) { setQuery(""); if (memory.current.presets && !memory.current.presets.ok) readPresets(); } }}>
              {iconButton("Design presets", <Popover.Trigger asChild><button type="button" className="doan-icon-button composer-presets" aria-label="Design presets" disabled={sending}><PencilSparkles aria-hidden="true" /></button></Popover.Trigger>)}
              <Popover.Portal><Popover.Content className="doan-floating preset-popover" aria-label="Design presets" side="top" align="start" sideOffset={8} collisionPadding={8}
                onCloseAutoFocus={event => { if (pickedFocus.current) { pickedFocus.current = false; event.preventDefault(); focusEnd(); } }}>
                {searchField(query, false)}{presetBody(presetView, false)}
              </Popover.Content></Popover.Portal>
            </Popover.Root>
            {slashOpen && slashView && <div className="doan-floating preset-popover slash-popover" role="presentation">{searchField(slash, true)}{presetBody(slashView, true)}</div>}
            <span className="grow" />
            <DropdownMenu.Root onOpenChange={open => { if (open && root && healthy) for (const group of picker.groups) if (group.read) readModels(root, group.provider); }}>
              <DropdownMenu.Trigger asChild><button type="button" className="composer-agent doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-label={picker.trigger.ariaLabel} disabled={sending}>
                {picker.trigger.provider ? <><img className="logo" src={providerLogo(picker.trigger.provider)} alt="" /><span>{picker.trigger.label}</span></> : <span className="muted">{picker.trigger.label}</span>}<ChevronDown className="chev" aria-hidden="true" />
              </button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu agent-popover" aria-label="Agent and model" side="top" align="end" sideOffset={8} collisionPadding={8}>
                {picker.groups.length === 0 && <p className="menu-note">No agent is ready to run.</p>}
                {picker.groups.map((group, index) => {
                  const status = auth?.providers.find(item => item.provider === group.provider);
                  const short = status ? providerShortStatus(status) : null;
                  const selected = group.rows.find(row => row.selected);
                  return <Fragment key={group.provider}>{index > 0 && <DropdownMenu.Separator className="doan-menu-sep" />}<div className="agent-group">
                    <DropdownMenu.Label className="doan-menu-head agent-head"><img className="logo" src={providerLogo(group.provider)} alt="" /><span>{group.name}</span>
                      {group.note && <span className="agent-note">{group.note === "Loading models" && <span className="doan-spinner" aria-hidden="true" />}{group.note}</span>}</DropdownMenu.Label>
                    {group.selectable ? <DropdownMenu.RadioGroup value={!selected ? "" : selected.kind === "model" ? selected.id : "default"}
                      onValueChange={value => edit({ provider: group.provider, ...(value === "default" ? {} : { models: { ...memory.current.models, [group.provider]: value } }) })}>
                      {group.rows.map(row => <DropdownMenu.RadioItem key={row.kind === "model" ? row.id : "default"} value={row.kind === "model" ? row.id : "default"} className="doan-menu-item model-item">
                        <span className="model-name">{row.label}</span>{row.kind === "model" && row.effort && <span className="sub"><Gauge className="inline" aria-hidden="true" />Effort</span>}
                        <span className="check-slot">{row.selected && <Check className="check" aria-hidden="true" />}</span>
                      </DropdownMenu.RadioItem>)}
                    </DropdownMenu.RadioGroup> : <DropdownMenu.Item className="doan-menu-item" disabled><span className="sub">{short ?? "Not available right now"}</span></DropdownMenu.Item>}
                    {group.selectable && short && <p className="menu-note">{short}</p>}
                  </div></Fragment>;
                })}
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {picker.effort && provider && model && <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button type="button" className="composer-effort doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-label={picker.effort.ariaLabel} disabled={sending}><Gauge aria-hidden="true" /><span>{picker.effort.label}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu effort-popover" data-ui-size="compact" aria-label={picker.effort.menuLabel} side="top" align="end" sideOffset={8} collisionPadding={8}>
                <DropdownMenu.Label className="doan-menu-head">{picker.effort.title}</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={effort ?? ""} onValueChange={value => edit({ efforts: { ...memory.current.efforts, [effortKey(provider, model)]: value } })}>
                  {picker.effort.options.map(item => <DropdownMenu.RadioItem key={item.id} value={item.id} className="doan-menu-item"><span className="model-name">{item.label}</span><span className="check-slot">{item.selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>}
            {iconButton("Send", <button type="button" className={`composer-send doan-icon-button${sending ? " sending" : ""}`} data-ui-variant="accent" aria-label="Send" aria-busy={sending || undefined} disabled={!availability.enabled} onClick={() => void send()}>
              {sending ? <span className="doan-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}</button>)}
          </div>
        </div>
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
      {prompts.length > 0 && <div className="home-suggestions" role="group" aria-label="Suggested prompts">{prompts.map(prompt => {
        const button = <button key={prompt.label} type="button" className="suggestion doan-button" data-ui-size="sm" data-ui-variant="quiet" onClick={() => { edit({ preset: prompt.preset, text: prompt.text }); queueMicrotask(focusEnd); }}>
          <GroupIcon name={groupIcon(prompt.preset.group)} /><span>{prompt.label}</span></button>;
        return <Tooltip key={prompt.label}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>{prompt.label}</TooltipContent></Tooltip>;
      })}</div>}
      {notice && <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{notice.text}</span>{notice.retry && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={() => void send()}>Retry</button>}</div>}
      {!notice && reason && (reason.kind === "attachmentMissing"
        ? <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{reason.text}</span></div>
        : <div className="composer-reason" role="status"><span>{reason.text}</span>{reason.kind === "running" && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={() => props.openConversation(reason.open)}>Open</button>}</div>)}
      <div className="sr-only" role="status">{announcement}</div>
    </div>
    {confirm && <dialog className="doan-dialog" data-ui-size="compact" aria-label={confirm.title} ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); setConfirm(null); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{confirm.title}</h3><p className="doan-dialog-description">{confirm.body}</p></div></div>
      <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={() => { setConfirm(null); queueMicrotask(focusEnd); }}>{confirm.cancel}</button><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={() => apply(confirm.request)}>{confirm.confirm}</button></div>
    </dialog>}
  </div>;
}

