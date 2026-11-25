import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MutableRefObject, type ReactElement } from "react";
import { Clock, Crosshair, FileText, Folder, Frame, Gauge, Info, MessageSquareDashed, Plus, Shield, X } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { ClaudeRunMode, PermissionModeId } from "../main/conversation/permissionMode";
import type { Anchor, SkillSummary } from "../main/conversation/types";
import { fieldSkillRuns } from "./skillWords";
import { classifyFirstWord, commandCard, commandLists, planSend, PRESET_NOTICE, queuedCommand, STALE_MODE_CARD, type CommandCard, type CommandLists } from "./commandView";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { retryButton, useRetry } from "./ListRetryButton";
import { ContextRing, type RingUsage } from "./ContextRing";
import type { ContextUsage } from "./contextWindow";
import { distinctTargets, plainText, typedText } from "./anchorField";
import { LIMITS } from "../main/conversation/messageText";
import {
  AgentPicker, AttachButton, ComposerCard, ComposerChips, ComposerField, ComposerTools, EffortPicker, PermissionPicker, PresetsButton,
  SendButton, SlashPresets, TriggerLabel, useComposerDrop, usePresetListOutside, type CanvasPress, type ComposerFieldHandle,
} from "./ComposerParts";
import { composerAction, composerShape, focusAfter, steerAllPlan, type ComposerAction, type ComposerTurn, type FocusAction } from "./composerRules";
import {
  canvasGoneText, composerPlaceholder, dockedAvailability, dockedMessage, dockedPicker, dockedRefusal, draftKey, EMPTY_DRAFT, sameDraft, settleSent,
  type DockedDraft, type DockedMode, type DockedRefusal,
} from "./dockedRules";
import { slashKey, pasteAction } from "./HomeComposerView";
import { CLIPBOARD_TYPE, type ChipInsert } from "./chipField";
import type { SentFile } from "./threadItems";
import { ANCHOR_LIMIT_TEXT } from "./canvasPicker";
import { LOCATE_MISSING_TEXT, useLocateNote, type LocateOutcome } from "./ConversationThread";
import {
  pasteAsAttachment, pastedTextMeta, pastedTextLabel, MAX_ATTACHMENTS, MAX_PASTED_BYTES, attachRefusal, composeRequest, followDrawerHighlight, type PresetRow, attachmentChipView, chipRemoval, markRefused, presetListView, queueAttachmentSummary, providerLogo, slashQuery, takesSuggestion, type AttachmentDraft, type ModelPickerView,
  type PresetListReply, type PresetSummary,
} from "./homeComposer";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { queueFocusAfter, type QueueFocus } from "./queueFocus";
import { dockedBuddy } from "./dockedBuddyShell";
import { localClock, queueButtonHint, queueStatusLine, resetTimeText } from "./limitReset";
import { runModeAnnouncement, type PermissionPickerView } from "./permissionPicker";
import type { SettingsTarget } from "./settingsSections";
import { withPlayingFrame, type PlayingFrame, type PlayingFrameChip } from "./prototype/conversation";
import { useActivationFocus } from "./activationFocus";
import { CAPTURE_TERMINAL } from "./canvasCapture";

// The docked composer's host (Overview, canvas panel) owns the conversation, the drafts map, the lists and every call to main; this component
// decides shape, the Send slot, the reason line and focus.

// files: the attachments' names, sizes and kinds, for the thread to draw a queued message Send now moves there; main
// takes only the ids.
// command: the request is a provider command, which goes out alone.
export interface DockedRequest { text: string; anchors: readonly Anchor[]; attachments: { id: string }[]; files?: SentFile[]; command?: true }

// The canvas page's way into the shown composer's field. `insert` puts a chip at the field's
// caret and shows the 32-place line itself when the chip would pass the limit.
export interface DockedFieldLink {
  insert(anchor: Anchor): ChipInsert;
  focus(): void;
  composing(): boolean;
  element(): HTMLElement | null;
}
// The composer's Pick from canvas button: pressed while the canvas picks; `reason` is the tooltip while unavailable.
export interface DockedPicker { pressed: boolean; enabled: boolean; reason: string | null; onToggle(): void }
// resetsAt: a usage-limit refusal's reset time (ISO), when main knew it. conversationId: the conversation a start began,
// which the composer now shows.
export type DockedOutcome = { ok: true; itemId?: string; conversationId?: string } | { error: string; missing?: string[]; replaced?: string[]; resetsAt?: string };

export interface DockedComposerProps {
  mode: DockedMode;
  project: string; homeDirectory: string | null;
  // The host's placeholder: a reply or a new conversation in the project. A
  // preset's line and the suggestion stand in for it by composerPlaceholder.
  placeholder: string;
  // null: the list has none; undefined: the host has not read the list yet, so a suggestion that then appears is not announced
  // as new.
  suggestion?: string | null | undefined;
  // The canvas whose chips the field takes (the canvas panel's); none in Overview, where a pasted chip reads as text.
  chipScope?: string | null;
  // Drafts by draftKey(mode), kept by the host so a switch between conversations, or leaving the screen, keeps each.
  drafts: ReadonlyMap<string, DockedDraft>;
  onDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void;
  auth: AuthSnapshot | null | undefined;
  // The host's modelPickerView for this conversation's provider, or for a new conversation the picker Home shows.
  picker: ModelPickerView;
  provider: Provider | null; effort: string | null;
  onPickerOpen(): void; onPickModel(provider: Provider, value: string | null): void; onPickEffort(value: string): void; onPickFast(on: boolean): void;
  // The permission mode picker after Effort; null or absent: the provider offers no
  // choice. A terminal session (`fixed`) shows its fixed trigger instead.
  permission?: PermissionPickerView | null; onPickPermission?(mode: PermissionModeId): void;
  // The conversation's claudeRunMode from the host's latest list read, for the status line; null: none (or a new
  // conversation); undefined: the host has not read the list yet, so a value that then appears is not announced.
  runMode?: ClaudeRunMode | null | undefined;
  onSettings(target: SettingsTarget): void;
  skills: readonly SkillSummary[]; onSkillsWanted(): void;
  // The ACP conversation's commands sent as written but listed nowhere (useProjectSkills passthrough).
  passthrough?: readonly string[];
  // `card`: the one the host shows for this draft key, from here or a queue main returned; null once a send went out. The
  // composer says each card once through its status region (the card is no live region of its own).
  onCard?(card: CommandCard | null): void;
  card?: CommandCard | null;
  presets: PresetListReply | undefined; suggested: readonly PresetSummary[];
  onPresetsOpen(): void; onPresetsRetry(): Promise<boolean>;
  thumbnails: Readonly<Record<string, string>>;
  // A removed chip's id is handed back so the host can tell main. `report` shows a refusal as this composer's notice on the
  // draft the files were added to, which may no longer be the one shown when an answer lands.
  onAttach(report: (text: string) => void): void; onFiles(files: File[], pasted: boolean, report: (text: string) => void): void; onAttachmentRemoved(attachment: AttachmentDraft): void;
  // Resolves true only while the saved chip still belongs to a draft, so only that success is announced.
  onPastedText(text: string, meta: { lines: number; excerpt: string }, report: (text: string) => void): Promise<boolean>;
  // This conversation's turn.
  turn: ComposerTurn;
  // A conversation whose canvas left the project cannot continue.
  canvasGone: boolean;
  // Why Send waits for the host's project (it turned into a problem while open); the thread stays readable.
  unavailable?: string | null;
  // With `unavailable`, the field keeps the draft but takes no input (a canvas outside the list or sharing its ID).
  locked?: boolean;
  // Send waits without a reason line (a canvas's terminal session not answered yet).
  held?: boolean;
  // The provider, model and effort are the terminal session's own (a resume, or a legacy external conversation):
  // the triggers keep their place but cannot be chosen, and nothing can be attached.
  fixed?: boolean;
  // The host's reading of a refused send (the canvas panel's canvasConversationError); dockedRefusal otherwise.
  // resets: a usage-limit refusal's reset time as limitReset.ts words it.
  refuse?(code: string, provider: Provider, resets: string | null): DockedRefusal;
  // The conversation's Doan connection is at its usage limit until this reset (ISO): Send is Queue, and a message waits
  // for the reset in main.
  limitResetsAt?: string | null;
  // The reset (ISO) the queued rows wait for: no Send now, and the status line under them names it.
  scheduledFor?: string | null;
  // A refused terminal session's "Start a new conversation".
  onStartNew?(): void;
  // A message Send now has in flight is not among them: it shows in the thread. message: the request, whose attachments
  // a row with a folder names.
  queued: readonly QueuedRow[];
  // The rows offer Send now: the conversation's stored provider takes a message into a running turn and the turn runs
  // or waits for a permission answer (steerSupport sendNowShown, decided as if no row were sending).
  sendNow?: boolean;
  // Main's answer once the agent read the message, or an error when it stays queued. The host takes the row out of the
  // queue at the call and puts it back on an error; turnRuns: the turn still ran or waited when the error came.
  onSendQueuedNow?(id: string): Promise<void | { error: string; turnRuns?: boolean }>;
  // Send in an existing conversation, a start in new-conversation mode.
  onSend(request: DockedRequest): Promise<DockedOutcome>;
  onQueue(request: DockedRequest): Promise<DockedOutcome>;
  onStop(): void;
  // Whether main removed it (a row whose Send now is in flight is not).
  onRemoveQueued(id: string): Promise<boolean>;
  // The canvas panel's: Pick from canvas, the field link, and chip locate for a chip clicked in the field.
  pick?: DockedPicker;
  link?: MutableRefObject<DockedFieldLink | null>;
  // The canvas page's press signal: a press in the canvas closes the preset lists, as one outside them in the app does.
  canvasPress?: CanvasPress | undefined;
  onLocate?(anchor: Anchor): Promise<LocateOutcome>;
  // The shown conversation's last recorded context value (contextRing); null or absent: no ring, and the tray is as
  // without it.
  context?: ContextUsage | null;
  // The conversation provider's usage for the ring's drawer, from the host's subscription; absent: the drawer shows the
  // Context window line only.
  usage?: RingUsage;
  // What the docked buddy steps aside for: a permission or question card waiting at the thread's end, or a new conversation's
  // notice or choice with a button. Suggested prompts leave room above the card, so they are no reason.
  stepAside?: { waiting: boolean; notice: boolean };
  // The prototype window's playing frame: pinned first in the card's chip row, outside the field (nothing removes or
  // undoes it), and put first in every message sent or queued, counted against the place limit.
  playing?: PlayingFrameChip | null;
}

// The message with the playing frame's chip first (once, if the field already starts with it); null past the place
// limit, which Send then states.
export function playingMessage(draft: DockedDraft, skills: readonly string[], frame: PlayingFrame): { text: string; anchors: Anchor[] } | null {
  const message = withPlayingFrame(draft.segments, frame);
  return message && { text: composeRequest(message.text, draft.preset, skills, draft.attachments.length), anchors: message.anchors };
}

const NO_NAMES: ReadonlySet<string> = new Set();
// Cards already said, by object: a card shows in every composer of its draft key and stays until dismissed, so it is said
// once, where it first shows.
const SAID = new WeakSet<CommandCard>();
// The draft is a command the person sends alone: typed text only (a chip makes it a message), whose first word is a
// command, an unconfirmed ACP command or a built-in Doan answers with a card.
function isCommand(draft: DockedDraft, lists: CommandLists | null): boolean {
  if (!lists || draft.segments.some(segment => segment.kind !== "text")) return false;
  const kind = classifyFirstWord(plainText(draft.segments), lists).kind;
  return kind !== "text" && kind !== "skill";
}


// Anchor chips count like attachment and preset chips: a message with a chip becomes a box whose text and chips wrap
// above the tools, instead of a one-line capsule that clips them in the narrow panel.
const chipCount = (draft: DockedDraft, pinned: number) => pinned + draft.attachments.length + (draft.preset ? 1 : 0) + distinctTargets(draft.segments);

export function DockedComposer(props: DockedComposerProps) {
  const { mode } = props;
  const key = draftKey(mode);
  // Read by key in the render itself: after a switch, nothing from the previous conversation shows for a frame
  // (POSTMORTEM 2026-10-25).
  const draft = props.drafts.get(key) ?? EMPTY_DRAFT;
  // Pending sends by draft key: a send in one conversation does not unlock or lock another (each reply settles only
  // its own key and generation).
  const [sending, setSending] = useState<ReadonlyMap<string, number>>(new Map());
  // A refusal holds while its draft is the one refused; any change to that draft drops it. A drop notice has no draft and lasts
  // until the person edits. code: main's refusal code, which the usage limit's state reads.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, { refusal: DockedRefusal; draft?: DockedDraft; code?: string }>>(new Map());
  // The / list's Escape and highlight belong to the draft they were made on, so a switch reads them per key.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [highlightAt, setHighlightAt] = useState<{ key: string; index: number }>({ key, index: 0 });
  const [announcement, setAnnouncement] = useState("");
  // The 32-place line, for the draft it was refused on; the next edit drops it.
  const [limitAt, setLimitAt] = useState<string | null>(null);
  const [missing, showMissing] = useLocateNote(() => field.current?.element() ?? null);
  // "No longer in the canvas" by the composer chip that was not found: an overlay placed
  // under the chip, outside the field's DOM, and the chip described by it like a thread chip.
  const [missingAt, setMissingAt] = useState<{ chip: HTMLElement; left: number; top: number } | null>(null);
  // Draws again when a reset passes, so the status line and the Queue tooltip follow the clock.
  const [resetTick, setResetPassed] = useState(0);
  // A draft already pointing at the limit's number of places takes no more from the canvas, so the canvas panel's
  // composer says why under the card; removing one takes the line away.
  const full = !!props.pick && distinctTargets(draft.segments) >= LIMITS.anchors;
  const generation = useRef(0);
  // The key on screen when a reply lands, which may differ from the one the send left from.
  const shown = useRef(key); shown.current = key;
  const field = useRef<ComposerFieldHandle | null>(null);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  // The composer's own box, which places the chip note.
  const root = useRef<HTMLDivElement | null>(null);
  const slashList = useRef<HTMLDivElement | null>(null);
  const queueRows = useRef<QueueRowsHandle | null>(null);
  const listId = useId(), reasonId = `${listId}-reason`, noteId = `${listId}-missing`, hintId = `${listId}-suggestion`, playingId = `${listId}-playing`;
  const playing = props.playing ?? null, pinned = playing ? 1 : 0;
  const reserved = playing ? [{ kind: "chip" as const, anchor: { frame: playing.frame } }] : undefined;

  const isSending = sending.has(key);
  const held = refusals.get(key);
  const refusal = held && (!held.draft || sameDraft(held.draft, draft)) ? held.refusal : null;
  const dismissed = dismissedKey === key;
  const highlight = highlightAt.key === key ? highlightAt.index : 0;
  const setHighlight = (index: number) => setHighlightAt(at => at.key === key && at.index === index ? at : { key, index });
  // Chips the host added (Attach, paste, drop) make a box as typing does; the drawn shape follows the
  // rule at once and the stored one catches up below.
  const text = plainText(draft.segments);
  const shape = composerShape(draft.shape, { empty: text === "", chips: chipCount(draft, pinned), overflows: text.includes("\n") });
  const locked = !!props.locked && !!props.unavailable;
  // A blocked refusal holds Send with its reason until the person changes the draft.
  const blocked = refusal?.kind === "blocked" ? refusal : null;
  const skillNames = new Set(props.skills.filter(skill => skill.kind !== "command").map(skill => skill.name));
  const matched = fieldSkillRuns(draft.segments, skillNames).map(run => run.name);
  const commandProvider = mode.kind === "new" ? props.provider : mode.provider;
  const lists = commandProvider ? commandLists(commandProvider, props.skills, props.passthrough ?? []) : null;
  const commandNames = lists ? new Set([...lists.commands, ...lists.aliases.keys(), ...lists.unsupported]) : NO_NAMES;
  const commandFirst = isCommand(draft, lists);
  // The preset stays in the draft but goes with no command: its chip leaves the row for the notice until the word goes.
  const presetHeld = commandFirst && draft.preset !== null;
  const limitResetsAt = props.limitResetsAt ?? null, scheduledFor = props.scheduledFor ?? null;
  const limited = limitResetsAt !== null || scheduledFor !== null;
  const now = Date.now(), clock = localClock();
  const lead = playing ? playingMessage(draft, matched, playing.frame) : undefined;
  // A command goes out alone, so neither the playing frame's place limit nor the attachments' state holds it.
  const checked = lead === null && !commandFirst && !isSending && !props.unavailable ? { enabled: false, reason: { text: ANCHOR_LIMIT_TEXT } }
    : dockedAvailability({ mode, project: props.project, auth: props.auth, provider: props.provider, draft: commandFirst ? { ...draft, preset: null, attachments: [] } : draft, skills: commandFirst ? [] : matched, turn: props.turn, sending: isSending, unavailable: props.unavailable ?? null, external: !!props.fixed });
  const availability = blocked && !isSending && !props.unavailable ? { enabled: false, reason: { text: blocked.text, ...(blocked.action ? { action: blocked.action } : {}) } }
    : props.held && checked.enabled ? { enabled: false, reason: checked.reason } : checked;
  // The person's own message decides Stop, Queue and Send: the pinned frame goes with every request but is not
  // something typed, so an empty field while a turn runs still offers Stop.
  const own = dockedMessage(draft, matched);
  const message = lead ?? own;
  const placeholder = composerPlaceholder({ readOnly: isSending || locked, preset: draft.preset, empty: draft.segments.length === 0, mode: mode.kind, text: props.placeholder, suggestion: props.suggestion });
  const action = composerAction(props.turn, own.text, props.queued.length, limited);
  const queueHint = action === "queue" ? queueButtonHint(limitResetsAt, now, clock) : null;
  const scheduleLine = scheduledFor !== null ? queueStatusLine(scheduledFor, now, clock) : null;
  useEffect(() => {
    const waits = [limitResetsAt, scheduledFor].map(at => at === null ? NaN : Date.parse(at) - Date.now()).filter(ms => ms > 0);
    if (waits.length === 0) return;
    // A timer's delay is a 32-bit count of milliseconds; a reset further off re-arms when that one fires.
    const timer = setTimeout(() => setResetPassed(n => n + 1), Math.min(Math.min(...waits) + 1, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [limitResetsAt, scheduledFor, resetTick]);
  const canSendNow = !!props.sendNow && !!props.onSendQueuedNow;
  const picker = dockedPicker(props.picker, mode);
  // The terminal's provider, drawn on the fixed trigger.
  const fixedProvider = mode.kind === "new" ? props.provider : mode.provider;
  const presets = props.presets?.ok ? props.presets.result.presets : [];
  const presetsRetry = useRetry();
  // The `/` list reads a field of typed text only; a chip anywhere means the field holds a message, not a search.
  const slash = slashQuery(text === typedText(draft.segments) ? text : "", dismissed, new Set([...skillNames, ...commandNames]));
  const slashView = slash !== null ? presetListView(props.presets, { project: props.project, suggested: props.suggested, query: slash, tab: null, slash: true, skills: props.skills }) : null;
  const slashRows = slashView?.kind === "list" ? slashView.sections.flatMap(section => section.rows) : [];
  const slashOpen = slash !== null && !isSending;
  // A press outside closes the list as Escape does, for the draft on screen, until its field is empty again.
  usePresetListOutside(slashOpen, slashList, () => field.current?.element() ?? null, () => setDismissedKey(key), props.canvasPress);
  const chips = [...draft.attachments.map(a => ({ label: attachmentChipView(a, props.homeDirectory).label })), ...(draft.preset ? [{ label: draft.preset.title, preset: true }] : [])];

  // An edit drops a refusal the person is answering; `shapeOnly` (the shape catching up with host chips) keeps one the host just
  // reported with those chips, and a send refusal keeps its own draft comparison. The capsule's wrap is measured after the draw.
  const edit = (patch: Partial<Omit<DockedDraft, "shape">>, at = key, wrapped = false, shapeOnly = false) => {
    props.onDrafts(drafts => {
      const current = drafts.get(at) ?? EMPTY_DRAFT, next = { ...current, ...patch };
      const nextText = plainText(next.segments);
      const shape = composerShape(current.shape, { empty: nextText === "", chips: chipCount(next, pinned), overflows: wrapped || nextText.includes("\n") });
      return new Map(drafts).set(at, { ...next, shape });
    });
    // Said once as the notice takes the chip's place.
    if (patch.segments && at === key && !presetHeld && draft.preset && isCommand({ ...draft, ...patch }, lists)) setAnnouncement(PRESET_NOTICE);
    if (!shapeOnly) clearRefusal(at);
    setLimitAt(current => current === at ? null : current);
  };
  function clearRefusal(at: string) {
    if (refusals.has(at)) setRefusals(previous => { const next = new Map(previous); next.delete(at); return next; });
  }
  // A capsule becomes a box once its text wraps at the capsule's own width. A box is never measured: it
  // returns to a capsule only when emptied, so the narrower capsule's wrap cannot flip it back and forth.
  useLayoutEffect(() => {
    if (shape !== draft.shape) { edit({}, key, false, true); return; }
    const node = field.current?.element();
    if (shape !== "capsule" || !node || text === "") return;
    const line = parseFloat(getComputedStyle(node).lineHeight);
    if (line > 0 && node.scrollHeight > line * 1.5) edit({}, key, true);
  }, [key, text, draft.shape, shape]);
  useEffect(() => { if (text === "") setDismissedKey(current => current === key ? null : current); }, [text]);
  const previousRows = useRef<{ query: string | null; rows: PresetRow[] }>({ query: null, rows: [] });
  const rowKeys = slashRows.map(row => row.key).join("\n");
  useEffect(() => {
    const before = previousRows.current;
    setHighlight(before.query === slash ? followDrawerHighlight(before.rows, slashRows, highlight) : 0);
    previousRows.current = { query: slash, rows: slashRows };
  }, [slash, rowKeys]);
  useEffect(() => { if (slashOpen) props.onSkillsWanted(); }, [slashOpen]);

  const focus = (after: FocusAction) => queueMicrotask(() => {
    const target = focusAfter(after, { pending: [] });
    if (target.kind === "field") field.current?.focus(target.caretAtEnd ? "end" : undefined);
  });
  const pickedSkill = useRef(false);
  const chooseRow = (id: string, kind: PresetRow["kind"], fromSlash: boolean) => {
    if (kind === "preset") { choosePreset(id, fromSlash); return; }
    pickedSkill.current = !fromSlash;
    field.current?.insertSkill(id, fromSlash);
    if (fromSlash) focus({ kind: "restored" });
  };
  const choosePreset = (id: string, fromSlash: boolean) => {
    const chosen = presets.find(p => p.id === id);
    if (!chosen) return;
    edit({ preset: chosen, ...(fromSlash ? { segments: [] } : {}) });
    if (fromSlash) focus({ kind: "restored" });
  };
  const removeChip = (index: number, trigger: "button" | "backspace") => {
    if (isSending || locked) return false;
    const removal = chipRemoval(chips, trigger === "button" ? { kind: "button", index } : { kind: "backspace", text, caret: field.current?.caretAtStart() === false ? 1 : 0 });
    if (!removal) return false;
    const removed = draft.attachments[removal.remove];
    if (removal.remove >= draft.attachments.length) edit({ preset: null });
    else if (removed) { props.onAttachmentRemoved(removed); edit({ attachments: draft.attachments.filter(a => a.key !== removed.key) }); }
    setAnnouncement(removal.announcement);
    queueMicrotask(() => { if (removal.focus === "textarea") field.current?.focus(); else removeButtons.current[removal.focus]?.focus(); });
    return true;
  };
  // A locked composer keeps its draft but takes no input of any kind: no preset, dropped or pasted file either.
  // A refusal of files added to a draft: a notice with no draft, so the chips the host adds or settles keep it.
  const reportFor = (at: string) => (text: string) => setRefusals(previous => new Map(previous).set(at, { refusal: { kind: "notice", text } }));
  const drop = useComposerDrop({ blocked: () => isSending || locked, onFiles: files => props.onFiles(files, false, reportFor(key)), onNotice: text => setRefusals(previous => {
    const next = new Map(previous);
    if (text === null) next.delete(key); else next.set(key, { refusal: { kind: "notice", text } });
    return next;
  }) });
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (isSending || locked || field.current?.composing() || field.current?.element()?.isContentEditable === false) return;
    const files = Array.from(event.clipboardData.files);
    const text = event.clipboardData.getData("text/plain"), action = pasteAction(text, files);
    if (action === "files") { event.preventDefault(); props.onFiles(files, true, reportFor(key)); return; }
    if (action !== "text" || event.clipboardData.types.includes(CLIPBOARD_TYPE)) return;
    const decision = pasteAsAttachment(text, { acceptsAttachments: !props.fixed, commandFirst, attached: draft.attachments.length, limit: MAX_ATTACHMENTS });
    if (decision === "field") return;
    event.preventDefault();
    if (decision === "limit") { reportFor(key)(attachRefusal("limit", "Pasted text", "pastedText")); return; }
    const normalized = text.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(normalized).byteLength > MAX_PASTED_BYTES) { reportFor(key)(attachRefusal("too_large", "Pasted text", "pastedText")); return; }
    const meta = pastedTextMeta(normalized);
    void props.onPastedText(normalized, meta, reportFor(key)).then(ready => {
      if (ready && shownKey.current === key) {
        const text = `Pasted text attached, ${pastedTextLabel(meta.lines)}`;
        setAnnouncement(current => current === text ? `${text}\u00a0` : text);
      }
    });
  };

  const stop = () => { props.onStop(); focus({ kind: "stopped" }); };
  // Read through a ref so the link the host holds always reaches this render's key.
  const shownKey = useRef(key); shownKey.current = key;
  useLayoutEffect(() => {
    const link = props.link;
    if (!link) return;
    const mine: DockedFieldLink = {
      insert: anchor => {
        const result = field.current?.insertChip(anchor) ?? "refused";
        if (result === "limit") setLimitAt(shownKey.current);
        return result;
      },
      // No caret call while an IME composes: the composition owns the selection.
      focus: () => { if (!field.current?.composing()) field.current?.focus(); },
      composing: () => field.current?.composing() ?? false,
      element: () => field.current?.element() ?? null,
    };
    link.current = mine;
    return () => { if (link.current === mine) link.current = null; };
  }, [props.link]);
  const locate = (anchor: Anchor, chip: HTMLElement) => {
    void props.onLocate?.(anchor).then(outcome => {
      const box = root.current?.getBoundingClientRect();
      if (outcome !== "missing" || !box || !chip.isConnected) return;
      const at = chip.getBoundingClientRect();
      setMissingAt({ chip, left: at.left - box.left, top: at.bottom - box.top });
      showMissing();
    });
  };
  const noteShown = missing && missingAt !== null && missingAt.chip.isConnected;
  useEffect(() => {
    if (!noteShown) return;
    const { chip } = missingAt;
    chip.setAttribute("aria-describedby", noteId);
    return () => { if (chip.getAttribute("aria-describedby") === noteId) chip.removeAttribute("aria-describedby"); };
  }, [noteShown, missingAt]);
  const send = async (): Promise<DockedOutcome | undefined> => {
    if (action === "stop" || !availability.enabled) return;
    const plan = commandFirst && lists ? planSend(text, draft.preset, matched, draft.attachments.length, lists) : null;
    // Nothing goes to the provider: the card says where Doan has it, and the text stays for the person to change.
    if (plan?.kind === "unsupported" && commandProvider) { showCard(commandCard(commandProvider, plan.name)); return; }
    const command = plan !== null && plan.kind !== "message";
    const at = key, sent = draft, mine = ++generation.current;
    const files = draft.attachments.flatMap((a): SentFile[] => !a.id || a.path === undefined ? []
      : a.kind === "directory" ? [{ name: a.name, kind: a.kind, path: a.path }] : [{ name: a.name, size: a.size ?? 0, kind: a.kind, path: a.path, ...(a.lines === undefined ? {} : { lines: a.lines }), ...(a.excerpt === undefined ? {} : { excerpt: a.excerpt }) }]);
    // A command goes out alone: no preset or skill line, chip or playing frame, and no attachments, which stay here.
    const request: DockedRequest = plan && plan.kind !== "message" && plan.kind !== "unsupported" ? { text: plan.text, anchors: [], attachments: [], command: true }
      : { text: message.text, anchors: message.anchors, attachments: draft.attachments.flatMap(a => a.id ? [{ id: a.id }] : []), ...(files.length ? { files } : {}) };
    setSending(current => new Map(current).set(at, mine));
    // Queue with no turn running is the usage limit's: main's send queues the message for the reset.
    const queues = action === "queue" && props.turn !== "idle";
    let outcome = await (queues ? props.onQueue(request) : props.onSend(request)).catch((): DockedOutcome => ({ error: "unknown" }));
    // The turn ended before the queue took the message: nothing works to queue behind, so it goes out as a send.
    if (queues && "error" in outcome && outcome.error === "not_running") outcome = await props.onSend(request).catch((): DockedOutcome => ({ error: "unknown" }));
    setSending(current => { if (current.get(at) !== mine) return current; const next = new Map(current); next.delete(at); return next; });
    if ("ok" in outcome) {
      clearRefusal(at);
      props.onCard?.(null);
      // The field empties and returns to a capsule only when the person did not change the draft while it was sent. A
      // command leaves the preset and attachments it did not take.
      const left = command ? { ...EMPTY_DRAFT, preset: sent.preset, attachments: sent.attachments } : EMPTY_DRAFT;
      const settled = { ...left, shape: composerShape("capsule", { empty: true, chips: chipCount(left, pinned), overflows: false }) };
      props.onDrafts(drafts => settleSent(drafts, at, sent, settled, outcome.conversationId ? `conversation:${outcome.conversationId}` : undefined));
      if (at === shown.current) focus({ kind: "sent" });
      return outcome;
    }
    if (outcome.error === "attachment_missing") {
      const { missing = [], replaced } = outcome;
      props.onDrafts(drafts => {
        const current = drafts.get(at);
        return current ? new Map(drafts).set(at, { ...current, attachments: markRefused(current.attachments, missing, replaced) }) : drafts;
      });
    } else if (outcome.error === "command_mode_stale") {
      showCard({ ...STALE_MODE_CARD });
    } else {
      const provider = mode.kind === "new" ? props.provider : mode.provider;
      const resets = outcome.resetsAt ? resetTimeText(outcome.resetsAt, Date.now(), localClock()) : null;
      const refused = provider ? (props.refuse ? props.refuse(outcome.error, provider, resets) : dockedRefusal(outcome.error, mode, provider, props.project, resets)) : null;
      const code = outcome.error;
      if (refused) setRefusals(previous => new Map(previous).set(at, { refusal: refused, draft: sent, code }));
    }
    if (at === shown.current) focus({ kind: "sent" });
    return outcome;
  };
  // Each card is a new object (commandCard, a copy of STALE_MODE_CARD), so the same refusal again is said again.
  const showCard = (card: CommandCard) => { props.onCard?.(card); };
  const steerAll = async () => {
    const plan = steerAllPlan({ sendNow: canSendNow, rows: props.queued.length, draft: own.text.trim() !== "" });
    if (plan === "enter") { await send(); return; }
    if (plan === "none") return;
    if (plan.rows) queueRows.current?.sendAll();
    if (plan.draft) {
      // A command is never steered into a turn (main refuses it): it only queues.
      const steers = !commandFirst;
      const outcome = await send();
      // A queue reply belongs to the conversation it left from, not a newly mounted rows handle.
      if (steers && outcome && "ok" in outcome && outcome.itemId && key === shown.current) void queueRows.current?.sendNow(outcome.itemId);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (slashOpen) {
      const step = slashKey(event.key, highlight, slashRows.length, composing, { query: slash, row: slashRows[highlight] });
      if (step?.kind === "move") { event.preventDefault(); setHighlight(step.highlight); return true; }
      if (step?.kind === "pick") { event.preventDefault(); const row = slashRows[highlight]; if (row) chooseRow(row.id, row.kind, true); return true; }
      // Escape closes the list only; there is no shortcut that stops the turn.
      if (step?.kind === "close") { if (event.key === "Escape") event.preventDefault(); setDismissedKey(step.dismiss ? key : null); return true; }
    }
    // → or Tab puts the shown suggestion in the field as one undo step; it never sends.
    // The field's composing state is read last (a getter), so other keys never reach into the field.
    const shown = placeholder.suggestion;
    if (shown !== null && takesSuggestion({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode },
      { suggestion: shown, empty: draft.segments.length === 0, get composing() { return field.current?.composing() ?? false; } })) {
      // The suggestion is text to send, not a / search: the preset list stays closed as after Escape, until the field
      // is emptied again.
      event.preventDefault(); setDismissedKey(key); field.current?.insertText(shown); return true;
    }
    if (event.key === "Backspace" && removeChip(-1, "backspace")) { event.preventDefault(); return true; }
    return false;
  };
  // A new suggestion for the conversation on screen is read once while its empty field has focus; a
  // first list read, a switch or the same text shown again after emptying is left to the placeholder and the hint.
  const lastSuggestion = useRef({ key, suggestion: props.suggestion });
  useEffect(() => {
    const last = lastSuggestion.current;
    lastSuggestion.current = { key, suggestion: props.suggestion };
    if (last.key !== key || last.suggestion === undefined || placeholder.suggestion === null || placeholder.suggestion === last.suggestion) return;
    const node = field.current?.element();
    if (node && node.ownerDocument.activeElement === node) setAnnouncement(`Suggestion: ${placeholder.suggestion}`);
  }, [key, props.suggestion]);
  // `previous` is the value this composer last saw for that same conversation: a first read, a switch or a cleared value is left
  // to the trigger. The status line is shared, so the same text said for another one is changed to be read again.
  const lastRunMode = useRef({ key, runMode: props.runMode });
  useEffect(() => {
    const last = lastRunMode.current;
    lastRunMode.current = { key, runMode: props.runMode };
    if (last.key !== key || last.runMode === undefined || props.runMode === undefined) return;
    const text = runModeAnnouncement(last.runMode ?? undefined, props.runMode ?? undefined);
    if (text) setAnnouncement(current => current === text ? `${text}\u00a0` : text);
  }, [key, props.runMode]);

  // A disabled button holds no focus, so focus on Stop goes to the field when Stop turns into a disabled Send (POSTMORTEM
  // 2026-10-24). Read as this render begins, before the commit disables it; focus moved elsewhere stays.
  const slotAction = useRef<ComposerAction>(action);
  const slotNode = slotAction.current === "stop" && action === "send" && !availability.enabled ? root.current?.querySelector(".composer-send") ?? null : null;
  const stopLeft = slotNode !== null && typeof document !== "undefined" && document.activeElement === slotNode;
  // A turn can end with the window in the background, so the field takes focus again on activation (POSTMORTEM
  // 2026-11-17).
  const handFocus = useActivationFocus();
  useLayoutEffect(() => {
    slotAction.current = action;
    if (stopLeft) handFocus(() => field.current?.focus());
  });
  useEffect(() => {
    const card = props.card;
    if (!card || SAID.has(card)) return;
    SAID.add(card);
    setAnnouncement(`${card.title}. ${card.body}`);
  }, [props.card]);

  if (props.canvasGone || refusal?.kind === "gone") return <div className="doan-notice" role="status"><AlertIcon /><span className="grow-text selectable">{canvasGoneText(props.project)}</span></div>;
  const reason = availability.reason;
  // Once the usage limit's state shows, the Queue tooltip says what an earlier usage-limit refusal said.
  const notice = refusal?.kind === "notice" && !(limited && held?.code === "rate_limited") ? refusal : null;
  // Only an id drawn below; the live reason shows with an older notice rather than behind it.
  // A locked field takes no message, so the frame it would send no longer describes it.
  const playingShown = playing !== null && !locked;
  const describedBy = [reason && !reason.noAgent ? reasonId : null, placeholder.suggestion !== null ? hintId : null, playingShown ? playingId : null].filter(Boolean).join(" ") || undefined;
  return <div className="docked" data-shape={shape} ref={root} {...drop.handlers}>
    <QueueRows key={key} handle={queueRows} items={commandProvider ? props.queued.map(item => queuedCommand(commandProvider, queuedRequest(item), props.passthrough ?? []) ? { ...item, command: true } : item) : props.queued} homeDirectory={props.homeDirectory} sendNow={canSendNow} onSendNow={id => props.onSendQueuedNow?.(id) ?? Promise.resolve({ error: "not_running" })}
      onRemove={props.onRemoveQueued} focusInput={() => field.current?.focus()}
      // The same refusal again changes the region's text by a no-break space, so it is read again.
      announce={text => setAnnouncement(current => current === text ? `${text}\u00a0` : text)} />
    {/* Always drawn, empty when nothing waits for a reset, so the live region is registered before it speaks. */}
    <div className="queue-schedule" role="status">{scheduleLine && <>{scheduleLine.kind === "sending" ? <span className="doan-spinner" aria-hidden="true" /> : <Clock aria-hidden="true" />}<span>{scheduleLine.text}</span></>}</div>
    <ComposerCard readonly={isSending}>
      {/* The docked buddy's floor on the card's top edge; the buddy reads its reasons from these attributes. */}
      <div className="docked-buddy-slot" ref={dockedBuddy.dockSlot} aria-hidden="true" data-accepts={locked ? "false" : undefined}
        data-queue={props.queued.length > 0 ? "" : undefined}
        data-waiting={props.stepAside?.waiting ? "" : undefined} data-notice={props.stepAside?.notice ? "" : undefined} data-popover={slashOpen ? "" : undefined} />
      {presetHeld && <div className="composer-chips command-notice"><Info aria-hidden="true" /><span>{PRESET_NOTICE}</span></div>}
      <ComposerChips lead={playing && <Tooltip><TooltipTrigger asChild><span className="anchor-chip pw-playing" data-kind="frame"><span className="sr-only">Frame </span><Frame aria-hidden="true" /><span>{playing.name}</span></span></TooltipTrigger>
        <TooltipContent>{PLAYING_TITLE}</TooltipContent></Tooltip>}
        attachments={draft.attachments} preset={presetHeld ? null : draft.preset} thumbnails={props.thumbnails} homeDirectory={props.homeDirectory} disabled={isSending || locked} removeButtons={removeButtons} onRemove={index => removeChip(index, "button")} />
      {/* One field element in both shapes, at the same place and key: remounting it would drop focus and IME composition. */}
      <ComposerField skillNames={skillNames} commandNames={commandNames} key="field" ref={field} draftKey={key} value={draft.segments} onChange={segments => edit({ segments })} readOnly={isSending || locked}
        placeholder={placeholder.text} describedBy={describedBy} chipScope={props.chipScope ?? null} {...(reserved ? { reserved } : {})} onAnnounce={setAnnouncement} onChipClick={props.onLocate ? locate : undefined}
        combobox={slashOpen ? { listId: `${listId}-slash`, activeId: slashRows[highlight] ? `${listId}-s-${highlight}` : undefined } : null}
        onKey={keyDown} onSteerKey={() => void steerAll()} sendNow={canSendNow} onSubmit={() => void send()} onPaste={paste} />
      <ComposerTools>
        <PresetsButton skills={props.skills} reply={props.presets} project={props.project} suggested={props.suggested} listId={listId} disabled={isSending || locked}
          onOpen={() => { props.onSkillsWanted(); props.onPresetsOpen(); }} onChoose={(id, kind) => chooseRow(id, kind, false)} retry={presetsRetry} onRetry={props.onPresetsRetry} onPicked={() => { if (pickedSkill.current) { pickedSkill.current = false; field.current?.focus(); } else focus({ kind: "restored" }); }} canvasPress={props.canvasPress} />
        {slashOpen && slashView && <SlashPresets skills={props.skills} view={slashView} query={slash} listId={listId} highlight={highlight} listRef={slashList} onHighlight={setHighlight} onChoose={(id, kind) => chooseRow(id, kind, true)} retry={presetsRetry} onRetry={props.onPresetsRetry} />}
        <span className="grow" />
        <SendButton action={action} enabled={action === "stop" ? !isSending : availability.enabled} sending={isSending} onSend={() => { if (action === "stop") stop(); else void send(); }} hint={reason?.noAgent ? reason.text : undefined}
          tip={queueHint?.tip} description={queueHint?.description} />
      </ComposerTools>
      {drop.cover}
    </ComposerCard>
    <div className="composer-tray">
      {props.fixed ? <FixedTip label={CAPTURE_TERMINAL}><button type="button" className="doan-icon-button composer-attach" data-ui-size="xs" aria-label="Attach files or folders" aria-disabled="true"><Plus aria-hidden="true" /></button></FixedTip>
        : <AttachButton tray disabled={isSending || locked} onClick={() => props.onAttach(reportFor(key))} />}
      {props.pick && <PickButton pick={props.pick} />}
      {props.fixed && fixedProvider ? <>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-agent doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label={`Model: set by the terminal session (${PROVIDER_NAMES[fixedProvider]})`}><img className="logo" src={providerLogo(fixedProvider)} alt="" /><span className="label">Terminal session</span></button></FixedTip>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-effort doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label="Effort: set by the terminal session"><Gauge aria-hidden="true" /><TriggerLabel text="Effort" placeholder /></button></FixedTip>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-permission doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label="Permission: set by the terminal session"><Shield aria-hidden="true" /><TriggerLabel text="Permission" placeholder /></button></FixedTip>
      </> : <>
        <AgentPicker size="xs" picker={picker} auth={props.auth} disabled={isSending} onOpen={props.onPickerOpen} onPick={props.onPickModel} onSettings={target => queueMicrotask(() => props.onSettings(target))} />
        {picker.effort && <EffortPicker size="xs" view={picker.effort} effort={props.effort} disabled={isSending} onPick={props.onPickEffort} onPickFast={props.onPickFast} />}
        {props.permission && <PermissionPicker size="xs" view={props.permission} disabled={isSending} onPick={mode => props.onPickPermission?.(mode)} />}
      </>}
      {/* Keyed by conversation: another conversation's ring is a new one, so an open drawer closes (ContextRing). */}
      {props.context && <ContextRing key={mode.kind === "existing" ? mode.conversationId : ""} context={props.context} provider={mode.kind === "existing" ? mode.provider : null}
        usage={props.usage} canvasPress={props.canvasPress} onLost={() => field.current?.focus()} />}
    </div>
    {notice && (notice.startNew
      ? <div className="composer-reason docked-reason reason-stack" role="status"><span>{notice.text}</span>
        <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={() => { clearRefusal(key); props.onStartNew?.(); focus({ kind: "restored" }); }}>Start a new conversation</button></div>
      : <div className="doan-notice error composer-notice" role="alert"><AlertIcon /><span className="grow-text selectable" id={`${listId}-notice`}>{notice.text}</span>
        {/* The notice stays while the send its Retry started is out; Retry shows that send (DESIGN 'Busy action'). */}
        {notice.retry && retryButton({ running: isSending, variant: "panel", describedBy: `${listId}-notice`, onRetry: () => void send() })}</div>)}
    {reason && !reason.noAgent && (reason.alert
      ? <div className="doan-notice error composer-notice" role="alert" id={reasonId}><AlertIcon /><span className="grow-text selectable">{reason.text}</span></div>
      : <div className="composer-reason docked-reason" role="status" id={reasonId}><span>{reason.text}</span>
        {reason.action && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={() => props.onSettings(reason.action!.target)}>{reason.action.label}</button>}</div>)}
    {(limitAt === key || full) && <div className="composer-reason docked-reason" role="status"><span>{ANCHOR_LIMIT_TEXT}</span></div>}
    {noteShown && <span className="chip-missing chip-note" id={noteId} role="status" style={{ left: missingAt.left, top: missingAt.top }}>{LOCATE_MISSING_TEXT}</span>}
    {placeholder.suggestion !== null && <span className="sr-only" id={hintId}>{SUGGESTION_HINT}</span>}
    {playingShown && <span className="sr-only" id={playingId}>{playing.description}</span>}
    <div className="sr-only" role="status">{announcement}</div>
  </div>;
}

const SUGGESTION_HINT = "Press Tab or Right Arrow to use the suggestion.";
// The pinned chip takes no focus, so its hint is the native title alone, as the field's chips have theirs.
const PLAYING_TITLE = "Sent with each message";

export const SEND_NOW_TIP = "Add to the current turn without stopping it";
export const SEND_NOW_REFUSED_TEXT = "Couldn’t send now. It stays queued.";
const SEND_NOW_REFUSED_MS = 4000;
type QueueButton = "sendNow" | "remove";

export interface QueueRowsHandle {
  sendAll(): void;
  sendNow(id: string): Promise<void>;
}

// command: main sends it alone and takes no Send now for it (a provider command is never steered into a turn).
export interface QueuedRow { id: string; text: string; message?: { text?: string; attachments: readonly SentFile[] }; command?: boolean }
// A row's text drops list markers and request lines, so it could read as a command it is not; main decides from the request
// as sent (service flush), so the row does too.
function queuedRequest(item: QueuedRow): string {
  return item.message?.text ?? item.text;
}
export interface QueueRowsProps {
  handle?: MutableRefObject<QueueRowsHandle | null>;
  items: readonly QueuedRow[];
  // Shortens the attachment paths a row lists to ~.
  homeDirectory?: string | null;
  sendNow: boolean;
  onSendNow(id: string): Promise<void | { error: string; turnRuns?: boolean }>;
  onRemove(id: string): Promise<boolean>;
  focusInput(): void;
  // The composer's lasting live region: a row drawn again with its refusal may not be read.
  announce(text: string): void;
}

// The queued messages above the card: Send now between the text and Remove, both described
// by the row's text so each row's buttons are told apart. Keyed by conversation, so a switch drops its notes and focus.
export function QueueRows(props: QueueRowsProps) {
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set());
  // The rows as last drawn, read when an answer lands after the render it was asked from.
  const latest = useRef(props); latest.current = props;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes once the row that left is no longer drawn.
  const pending = useRef<{ leaving: string; target: QueueFocus } | null>(null);
  // A focused queue button that is no longer drawn (a phase change took Send now away, main sent the queue).
  const lost = useRef(false);
  const idBase = useId();
  // Rows whose Send now waits for main's answer.
  const flying = useRef(new Set<string>());
  useEffect(() => {
    if (refused.size === 0) return;
    const timer = setTimeout(() => setRefused(new Set()), SEND_NOW_REFUSED_MS);
    return () => clearTimeout(timer);
  }, [refused]);
  // Main can send the queue with the window in the background, so these hand-offs are made again on activation.
  const handFocus = useActivationFocus();
  useLayoutEffect(() => {
    const wanted = pending.current;
    if (wanted && !props.items.some(item => item.id === wanted.leaving)) {
      pending.current = null; lost.current = false;
      const { target } = wanted;
      const button = () => target.kind === "input" ? undefined : buttons.current.get(`${target.kind}:${target.itemId}`) ?? buttons.current.get(`remove:${target.itemId}`);
      handFocus(() => { const next = button(); if (next) next.focus(); else props.focusInput(); });
      return;
    }
    if (lost.current && !wanted) { lost.current = false; handFocus(() => props.focusInput()); }
  });

  // Place focus only while it is still on the leaving row (or was dropped with it): an agent may read the message long after
  // the press, and focus the person moved meanwhile stays.
  const focusAfter = (id: string, asked: QueueRowsProps["items"]) => {
    const active = document.activeElement;
    if (active && active !== document.body && ![`sendNow:${id}`, `remove:${id}`].some(name => buttons.current.get(name) === active)) return;
    const now = latest.current;
    const list = now.items.some(item => item.id === id) ? now.items : asked;
    const rows = list.map(item => ({ itemId: item.id, sendNow: now.sendNow && !item.command }));
    pending.current = { leaving: id, target: queueFocusAfter(rows, list.findIndex(item => item.id === id)) };
  };
  // The row leaves at the press (the message moves into the thread), so focus is placed for it now.
  const sendNow = async (id: string) => {
    // A second press before the row was drawn out of the queue.
    if (flying.current.has(id)) return;
    flying.current.add(id);
    setRefused(current => { if (!current.has(id)) return current; const next = new Set(current); next.delete(id); return next; });
    focusAfter(id, props.items);
    const reply = await props.onSendNow(id).catch((): { error: string; turnRuns?: boolean } => ({ error: "unknown" }));
    flying.current.delete(id);
    if (!reply || !("error" in reply)) return;
    // Back in the queue: focus stays where it went, and a row that never left takes none later.
    if (pending.current?.leaving === id) pending.current = null;
    // Only a turn that still runs says so; one that ended sends or returns the queue by its own rule. The answer's reading of the
    // turn decides: the last draw may not show an end that already came.
    if (!reply.turnRuns) return;
    setRefused(current => new Set(current).add(id));
    props.announce(SEND_NOW_REFUSED_TEXT);
  };
  useImperativeHandle(props.handle, () => ({
    // A command row has no Send now; it waits for the turn to end.
    sendAll: () => { for (const item of props.items) if (!item.command) void sendNow(item.id); },
    sendNow,
  }));
  const remove = async (id: string) => {
    const asked = props.items;
    if (await props.onRemove(id).catch(() => false)) focusAfter(id, asked);
  };
  const keep = (kind: QueueButton, id: string) => (node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(`${kind}:${id}`, node); else buttons.current.delete(`${kind}:${id}`);
  };

  if (props.items.length === 0) return null;
  return <div className="queue" role="list" aria-label="Queued messages">{props.items.map((item, index) => {
    const textId = `${idBase}-${index}`, summaryId = `${textId}-attachments`;
    const summary = queueAttachmentSummary(item.message?.attachments ?? [], props.homeDirectory ?? null);
    // Both buttons are told apart by the row's attachments and text, so the full list reaches them too.
    const describedBy = summary ? `${summaryId} ${textId}` : textId;
    // The status line sits in the row's listitem (a list owns only listitems) and is drawn from the start, empty, so the
    // live region is registered before a refusal puts text in it.
    return <div key={item.id} className="queue-entry" role="listitem">
      <div className="queue-item"><MessageSquareDashed aria-hidden="true" />
        {summary && <Tooltip><TooltipTrigger asChild>
          <span className="queue-attachment" role="group" id={summaryId} aria-label={summary.label}>{summary.pastedText ? <FileText aria-hidden="true" /> : <Folder aria-hidden="true" />}<span className="name">{summary.name}</span>{summary.more && <span className="count">{summary.more}</span>}</span>
        </TooltipTrigger><TooltipContent className="queue-full-list">{summary.items.map((entry, i) => <span key={i} className="queue-tip-item"><b>{entry.name}</b><span>{entry.path}</span></span>)}</TooltipContent></Tooltip>}
        <span className="queue-text" id={textId}>{item.text}</span>
        {props.sendNow && !item.command && <QueueButtonLife onLost={() => { lost.current = true; }}>{life =>
          <Tooltip><TooltipTrigger asChild>
            <button type="button" ref={node => { life(node); keep("sendNow", item.id)(node); }} className="doan-button queue-send" data-ui-size="xs" data-ui-variant="subtle"
              aria-describedby={describedBy} onClick={() => void sendNow(item.id)}>Send now</button>
          </TooltipTrigger><TooltipContent>{SEND_NOW_TIP}</TooltipContent></Tooltip>}</QueueButtonLife>}
        <QueueButtonLife onLost={() => { lost.current = true; }}>{life =>
          <Tooltip><TooltipTrigger asChild><button type="button" ref={node => { life(node); keep("remove", item.id)(node); }} className="chip-remove doan-icon-button" data-ui-size="xs"
            aria-label="Remove queued message" aria-describedby={describedBy} onClick={() => void remove(item.id)}><X aria-hidden="true" /></button></TooltipTrigger>
          <TooltipContent>Remove queued message</TooltipContent></Tooltip>}</QueueButtonLife>
      </div>
      <div className="queue-status" role="status">{refused.has(item.id) && <><AlertIcon /><span>{SEND_NOW_REFUSED_TEXT}</span></>}</div>
    </div>;
  })}</div>;
}

// Tells its row when the button it draws leaves while focused: its layout cleanup runs before React removes the node,
// so focus can still be read there (after removal the page body holds it and no blur says so).
function QueueButtonLife({ onLost, children }: { onLost(): void; children(life: (node: HTMLButtonElement | null) => void): ReactElement }) {
  const node = useRef<HTMLButtonElement | null>(null);
  const lost = useRef(onLost); lost.current = onLost;
  useLayoutEffect(() => () => { if (node.current && node.current === document.activeElement) lost.current(); }, []);
  return children(current => { if (current) node.current = current; });
}

// Pick from canvas, after Attach at the left end of the model row. aria-disabled, not disabled, so its reason
// shows as a tooltip on hover and focus. It starts the same pick as the toolbar Picker and ⌘L, so it names the key too.
function PickButton({ pick }: { pick: DockedPicker }) {
  const unavailable = !pick.enabled && !pick.pressed;
  return <Tooltip><TooltipTrigger asChild>
    <button type="button" className="doan-icon-button composer-pick" data-ui-size="xs" aria-label="Pick from canvas" aria-pressed={pick.pressed}
      aria-disabled={unavailable || undefined} onClick={() => { if (!unavailable) pick.onToggle(); }}><Crosshair aria-hidden="true" /></button>
  </TooltipTrigger>{unavailable && pick.reason ? <TooltipContent>{pick.reason}</TooltipContent>
    : <TooltipContent className="has-key">Pick from canvas<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘L</span></TooltipContent>}</Tooltip>;
}

// A control that keeps its place but cannot be used: aria-disabled, so its tooltip still shows on hover and focus.
function FixedTip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
