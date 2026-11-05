import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MutableRefObject, type ReactElement } from "react";
import { Clock, Crosshair, Gauge, Plus, Shield, X } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { Anchor } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { distinctTargets, plainText, sameSegments, typedText } from "./anchorField";
import { LIMITS } from "../main/conversation/messageText";
import {
  AgentPicker, AttachButton, ComposerCard, ComposerChips, ComposerField, ComposerTools, EffortPicker, PermissionPicker, PresetsButton,
  SendButton, SlashPresets, useComposerDrop, usePresetListOutside, type CanvasPress, type ComposerFieldHandle,
} from "./ComposerParts";
import { composerAction, composerShape, focusAfter, steerAllPlan, type FocusAction } from "./composerRules";
import {
  canvasGoneText, composerPlaceholder, dockedAvailability, dockedMessage, dockedPicker, dockedRefusal, draftKey, EMPTY_DRAFT,
  type DockedBusy, type DockedDraft, type DockedMode, type DockedRefusal,
} from "./dockedRules";
import { slashKey, pasteAction } from "./HomeComposerView";
import type { ChipInsert } from "./chipField";
import type { SentFile } from "./threadItems";
import { ANCHOR_LIMIT_TEXT } from "./canvasPicker";
import { LOCATE_MISSING_TEXT, useLocateNote, type LocateOutcome } from "./ConversationThread";
import {
  attachmentChipView, chipRemoval, presetListView, providerLogo, slashQuery, takesSuggestion, type AttachmentDraft, type ModelPickerView,
  type PresetListReply, type PresetSummary,
} from "./homeComposer";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { queueFocusAfter, type QueueFocus } from "./queueFocus";
import type { PermissionPickerView } from "./permissionPicker";
import type { SettingsTarget } from "./settingsSections";

// The composer under a conversation (buzz-conversation design §3.1, draft frame `docked-composer`). It has no screen
// in this feature: its host (buzz-project's Overview, later the canvas panel) owns the conversation, the drafts map,
// the model and preset lists and every call to main, and passes them in. This component decides shape, the Send slot,
// the reason line and focus.

// files: the attachments' names, sizes and kinds, for the thread to draw a queued message Send now moves there; main
// takes only the ids.
export interface DockedRequest { text: string; anchors: readonly Anchor[]; attachments: { id: string }[]; files?: SentFile[] }

// The canvas page's way into the shown composer's field (design §2 'Picker'). `insert` puts a chip at the field's
// caret and shows the 32-place line itself when the chip would pass the limit.
export interface DockedFieldLink {
  insert(anchor: Anchor): ChipInsert;
  focus(): void;
  composing(): boolean;
  element(): HTMLElement | null;
}
// The composer's Pick from canvas button: pressed while the canvas picks; `reason` is the tooltip while unavailable.
export interface DockedPicker { pressed: boolean; enabled: boolean; reason: string | null; onToggle(): void }
export type DockedOutcome = { ok: true; itemId?: string } | { error: string; missing?: string[] };

export interface DockedComposerProps {
  mode: DockedMode;
  project: string; homeDirectory: string | null;
  // The host's placeholder: a reply, a new conversation in the project, or restoring an archived conversation. A
  // preset's line and the suggestion stand in for it by composerPlaceholder.
  placeholder: string;
  // The conversation's next-input suggestion from the host's latest list read (prompt-suggestion design 'renderer' 1);
  // null: the list has none; undefined: the host has not read the list yet, so a suggestion that then appears is not
  // announced as new.
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
  onPickerOpen(): void; onPickModel(provider: Provider, value: string): void; onPickEffort(value: string): void;
  // The permission mode picker after Effort (permission-mode spec decision 1); null or absent: the provider offers no
  // choice. A terminal session (`fixed`) shows its fixed trigger instead.
  permission?: PermissionPickerView | null; onPickPermission?(mode: PermissionModeId): void;
  onSettings(target: SettingsTarget): void;
  presets: PresetListReply | undefined; suggested: readonly PresetSummary[];
  onPresetsOpen(): void; onPresetsRetry(): void;
  thumbnails: Readonly<Record<string, string>>;
  // Attachments are main's: the host chooses or adds them and writes the chips into the draft; a removed chip's id is
  // handed back so the host can tell main.
  onAttach(): void; onFiles(files: File[], pasted: boolean): void; onAttachmentRemoved(attachment: AttachmentDraft): void;
  // This conversation's turn. `busy`: another conversation holds the root or this canvas (from the host's list).
  turn: "idle" | "running" | "waiting";
  busy: DockedBusy | null;
  // An archived conversation whose canvas left the project cannot continue.
  canvasGone: boolean;
  // Why Send waits for the host's project (it turned into a problem while open); the thread stays readable.
  unavailable?: string | null;
  // With `unavailable`, the field keeps the draft but takes no input (a canvas outside the list or sharing its ID).
  locked?: boolean;
  // Send waits without a reason line (a canvas's terminal session not answered yet, design §2).
  held?: boolean;
  // The provider, model and effort are the terminal session's own (a resume, or a legacy external conversation):
  // the triggers keep their place but cannot be chosen, and nothing can be attached (design §0 'Model and effort').
  fixed?: boolean;
  // The host's reading of a refused send (the canvas panel's canvasConversationError); dockedRefusal otherwise.
  refuse?(code: string, provider: Provider): DockedRefusal;
  // A refused terminal session's "Start a new conversation".
  onStartNew?(): void;
  // A message Send now has in flight is not among them: it shows in the thread.
  queued: readonly { id: string; text: string }[];
  // The rows offer Send now: the conversation's stored provider takes a message into a running turn and the turn runs
  // or waits for a permission answer (steerSupport sendNowShown, decided as if no row were sending).
  sendNow?: boolean;
  // Main's answer once the agent read the message, or an error when it stays queued. The host takes the row out of the
  // queue at the call and puts it back on an error; turnRuns: the turn still ran or waited when the error came.
  onSendQueuedNow?(id: string): Promise<void | { error: string; turnRuns?: boolean }>;
  // Send in an existing conversation, a restore in an archived one, a start in new-conversation mode.
  onSend(request: DockedRequest): Promise<DockedOutcome>;
  onQueue(request: DockedRequest): Promise<DockedOutcome>;
  onStop(): void;
  // Whether main removed it (a row whose Send now is in flight is not).
  onRemoveQueued(id: string): Promise<boolean>;
  onOpen(conversationId: string): void;
  // The canvas panel's: Pick from canvas, the field link, and chip locate for a chip clicked in the field.
  pick?: DockedPicker;
  link?: MutableRefObject<DockedFieldLink | null>;
  // The canvas page's press signal: a press in the canvas closes the preset lists, as one outside them in the app does.
  canvasPress?: CanvasPress | undefined;
  onLocate?(anchor: Anchor): Promise<LocateOutcome>;
}

const sameDraft = (a: DockedDraft, b: DockedDraft) => sameSegments(a.segments, b.segments) && (a.preset?.id ?? null) === (b.preset?.id ?? null)
  && a.attachments.map(item => item.key).join("\n") === b.attachments.map(item => item.key).join("\n");

// Anchor chips count like attachment and preset chips: a message with a chip becomes a box whose text and chips wrap
// above the tools, instead of a one-line capsule that clips them in the narrow panel.
const chipCount = (draft: DockedDraft) => draft.attachments.length + (draft.preset ? 1 : 0) + distinctTargets(draft.segments);

export function DockedComposer(props: DockedComposerProps) {
  const { mode } = props;
  const key = draftKey(mode);
  // Read by key in the render itself: after a switch, nothing from the previous conversation shows for a frame
  // (POSTMORTEM 2026-10-25).
  const draft = props.drafts.get(key) ?? EMPTY_DRAFT;
  // Pending sends by draft key: a send in one conversation does not unlock or lock another (each reply settles only
  // its own key and generation).
  const [sending, setSending] = useState<ReadonlyMap<string, number>>(new Map());
  // A refusal holds while its draft is the one that was refused; a change to that draft, by the person or the host
  // (chips it added), drops it. A drop notice has no draft and lasts until the person edits.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, { refusal: DockedRefusal; draft?: DockedDraft }>>(new Map());
  // The / list's Escape and highlight belong to the draft they were made on, so a switch reads them per key.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [highlightAt, setHighlightAt] = useState<{ key: string; index: number }>({ key, index: 0 });
  const [announcement, setAnnouncement] = useState("");
  // The 32-place line, for the draft it was refused on; the next edit drops it.
  const [limitAt, setLimitAt] = useState<string | null>(null);
  const [missing, showMissing] = useLocateNote(() => field.current?.element() ?? null);
  // "No longer in the canvas" by the composer chip that was not found (design §2 'Chip locate'): an overlay placed
  // under the chip, outside the field's DOM, and the chip described by it like a thread chip.
  const [missingAt, setMissingAt] = useState<{ chip: HTMLElement; left: number; top: number } | null>(null);
  // A draft already pointing at the limit's number of places takes no more from the canvas, so the canvas panel's
  // composer says why under the card (design §2 'Chip field'); removing one takes the line away.
  const full = !!props.pick && distinctTargets(draft.segments) >= LIMITS.anchors;
  const generation = useRef(0);
  // The key on screen when a reply lands, which may differ from the one the send left from.
  const shown = useRef(key); shown.current = key;
  const field = useRef<ComposerFieldHandle | null>(null);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const hostSawBusy = useRef(new Set<string>());
  // The composer's own box, which places the chip note.
  const root = useRef<HTMLDivElement | null>(null);
  const slashList = useRef<HTMLDivElement | null>(null);
  const queueRows = useRef<QueueRowsHandle | null>(null);
  const listId = useId(), reasonId = `${listId}-reason`, noteId = `${listId}-missing`, hintId = `${listId}-suggestion`;

  const isSending = sending.has(key);
  const held = refusals.get(key);
  const refusal = held && (!held.draft || sameDraft(held.draft, draft)) ? held.refusal : null;
  const dismissed = dismissedKey === key;
  const highlight = highlightAt.key === key ? highlightAt.index : 0;
  const setHighlight = (index: number) => setHighlightAt(at => at.key === key && at.index === index ? at : { key, index });
  // Chips the host added (Attach, paste, drop) make a box as typing does (design §3.2); the drawn shape follows the
  // rule at once and the stored one catches up below.
  const text = plainText(draft.segments);
  const shape = composerShape(draft.shape, { empty: text === "", chips: chipCount(draft), overflows: text.includes("\n") });
  // A busy refusal stands in for the host's busy until the host has reported the busy conversation itself; once the
  // host's busy has shown and cleared again, the refusal no longer holds Send.
  if (props.busy && refusal?.kind === "busy") hostSawBusy.current.add(key);
  const busy = props.busy ?? (refusal?.kind === "busy" && !hostSawBusy.current.has(key) ? refusal.busy : null);
  const locked = !!props.locked && !!props.unavailable;
  // A blocked refusal holds Send with its reason until the person changes the draft (design §2 'Errors').
  const blocked = refusal?.kind === "blocked" ? refusal : null;
  const checked = dockedAvailability({ mode, project: props.project, auth: props.auth, provider: props.provider, draft, turn: props.turn, busy, sending: isSending, unavailable: props.unavailable ?? null, external: !!props.fixed });
  const availability = blocked && !isSending && !props.unavailable ? { enabled: false, reason: { text: blocked.text, ...(blocked.action ? { action: blocked.action } : {}) } }
    : props.held && checked.enabled ? { enabled: false, reason: checked.reason } : checked;
  const message = dockedMessage(draft);
  const placeholder = composerPlaceholder({ readOnly: isSending || locked, preset: draft.preset, empty: draft.segments.length === 0, mode: mode.kind, text: props.placeholder, suggestion: props.suggestion });
  const action = composerAction(props.turn !== "idle", message.text);
  const canSendNow = !!props.sendNow && !!props.onSendQueuedNow;
  const picker = dockedPicker(props.picker, mode);
  // The terminal's provider, drawn on the fixed trigger.
  const fixedProvider = mode.kind === "new" ? props.provider : mode.provider;
  const presets = props.presets?.ok ? props.presets.result.presets : [];
  // The `/` list reads a field of typed text only; a chip anywhere means the field holds a message, not a search.
  const slash = slashQuery(text === typedText(draft.segments) ? text : "", dismissed);
  const slashView = slash !== null ? presetListView(props.presets, { project: props.project, suggested: props.suggested, query: slash, tab: null, slash: true }) : null;
  const slashRows = slashView?.kind === "list" ? slashView.sections.flatMap(section => section.rows) : [];
  const slashOpen = slash !== null && !isSending;
  // A press outside closes the list as Escape does, for the draft on screen, until its field is empty again.
  usePresetListOutside(slashOpen, slashList, () => field.current?.element() ?? null, () => setDismissedKey(key), props.canvasPress);
  const chips = [...draft.attachments.map(a => ({ label: attachmentChipView(a, props.homeDirectory).label })), ...(draft.preset ? [{ label: draft.preset.title, preset: true }] : [])];

  // Every edit takes the shape rule with the overflow known without measuring (a typed line break); the wrap at the
  // capsule's width is measured after the draw below. An edit also drops a refusal the person is answering.
  const edit = (patch: Partial<Omit<DockedDraft, "shape">>, at = key, wrapped = false) => {
    props.onDrafts(drafts => {
      const current = drafts.get(at) ?? EMPTY_DRAFT, next = { ...current, ...patch };
      const nextText = plainText(next.segments);
      const shape = composerShape(current.shape, { empty: nextText === "", chips: chipCount(next), overflows: wrapped || nextText.includes("\n") });
      return new Map(drafts).set(at, { ...next, shape });
    });
    clearRefusal(at);
    setLimitAt(current => current === at ? null : current);
  };
  function clearRefusal(at: string) {
    hostSawBusy.current.delete(at);
    if (refusals.has(at)) setRefusals(previous => { const next = new Map(previous); next.delete(at); return next; });
  }
  // A capsule becomes a box once its text wraps at the capsule's own width (design §3.2). A box is never measured: it
  // returns to a capsule only when emptied, so the narrower capsule's wrap cannot flip it back and forth.
  useLayoutEffect(() => {
    if (shape !== draft.shape) { edit({}, key); return; }
    const node = field.current?.element();
    if (shape !== "capsule" || !node || text === "") return;
    const line = parseFloat(getComputedStyle(node).lineHeight);
    if (line > 0 && node.scrollHeight > line * 1.5) edit({}, key, true);
  }, [key, text, draft.shape, shape]);
  useEffect(() => { if (text === "") setDismissedKey(current => current === key ? null : current); }, [text]);
  useEffect(() => { setHighlight(0); }, [slash]);

  const focus = (after: FocusAction) => queueMicrotask(() => {
    const target = focusAfter(after, { pending: [] });
    if (target.kind === "field") field.current?.focus(target.caretAtEnd ? "end" : undefined);
  });
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
  const drop = useComposerDrop({ blocked: () => isSending || locked, onFiles: files => props.onFiles(files, false), onNotice: text => setRefusals(previous => {
    const next = new Map(previous);
    if (text === null) next.delete(key); else next.set(key, { refusal: { kind: "notice", text } });
    return next;
  }) });
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (pasteAction(event.clipboardData.getData("text/plain"), files) !== "files") return;
    event.preventDefault();
    if (!isSending && !locked) props.onFiles(files, true);
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
    if (!noteShown || !missingAt) return;
    const { chip } = missingAt;
    chip.setAttribute("aria-describedby", noteId);
    return () => { if (chip.getAttribute("aria-describedby") === noteId) chip.removeAttribute("aria-describedby"); };
  }, [noteShown, missingAt]);
  const send = async (): Promise<DockedOutcome | undefined> => {
    if (action === "stop" || !availability.enabled) return;
    const at = key, sent = draft, mine = ++generation.current;
    const files = draft.attachments.flatMap((a): SentFile[] => a.id ? [{ name: a.name, size: a.size ?? 0, kind: a.kind }] : []);
    const request: DockedRequest = { text: message.text, anchors: message.anchors, attachments: draft.attachments.flatMap(a => a.id ? [{ id: a.id }] : []), ...(files.length ? { files } : {}) };
    setSending(current => new Map(current).set(at, mine));
    let outcome = await (action === "queue" ? props.onQueue(request) : props.onSend(request)).catch((): DockedOutcome => ({ error: "unknown" }));
    // The turn ended before the queue took the message: nothing works to queue behind, so it goes out as a send.
    if (action === "queue" && "error" in outcome && outcome.error === "not_running") outcome = await props.onSend(request).catch((): DockedOutcome => ({ error: "unknown" }));
    setSending(current => { if (current.get(at) !== mine) return current; const next = new Map(current); next.delete(at); return next; });
    if ("ok" in outcome) {
      clearRefusal(at);
      // The field empties and returns to a capsule only when the person did not change the draft while it was sent.
      props.onDrafts(drafts => sameDraft(drafts.get(at) ?? EMPTY_DRAFT, sent) ? new Map(drafts).set(at, EMPTY_DRAFT) : drafts);
      if (at === shown.current) focus({ kind: "sent" });
      return outcome;
    }
    if (outcome.error === "attachment_missing") {
      const missing = new Set(outcome.missing ?? []);
      props.onDrafts(drafts => {
        const current = drafts.get(at);
        return current ? new Map(drafts).set(at, { ...current, attachments: current.attachments.map(a => a.id && missing.has(a.id) ? { ...a, status: "missing" as const } : a) }) : drafts;
      });
    } else {
      const provider = mode.kind === "new" ? props.provider : mode.provider;
      const refused = provider ? (props.refuse ? props.refuse(outcome.error, provider) : dockedRefusal(outcome.error, mode, provider, props.project)) : null;
      if (refused) setRefusals(previous => new Map(previous).set(at, { refusal: refused, draft: sent }));
    }
    if (at === shown.current) focus({ kind: "sent" });
    return outcome;
  };
  const steerAll = async () => {
    const plan = steerAllPlan({ sendNow: canSendNow, rows: props.queued.length, draft: message.text.trim() !== "" });
    if (plan === "enter") { await send(); return; }
    if (plan === "none") return;
    if (plan.rows) queueRows.current?.sendAll();
    if (plan.draft) {
      const outcome = await send();
      // A queue reply belongs to the conversation it left from, not a newly mounted rows handle.
      if (outcome && "ok" in outcome && outcome.itemId && key === shown.current) void queueRows.current?.sendNow(outcome.itemId);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (slashOpen) {
      const step = slashKey(event.key, highlight, slashRows.length, composing);
      if (step?.kind === "move") { event.preventDefault(); setHighlight(step.highlight); return true; }
      if (step?.kind === "pick") { event.preventDefault(); const row = slashRows[highlight]; if (row) choosePreset(row.id, true); return true; }
      // Escape closes the list only; there is no shortcut that stops the turn (spec decision 9).
      if (step?.kind === "close") { if (event.key === "Escape") event.preventDefault(); setDismissedKey(step.dismiss ? key : null); return true; }
    }
    // → puts the shown suggestion in the field as one undo step; it never sends (decision 8).
    // The field's composing state is read last (a getter), so other keys never reach into the field.
    const shown = placeholder.suggestion;
    if (shown !== null && takesSuggestion({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode },
      { suggestion: shown, empty: draft.segments.length === 0, get composing() { return field.current?.composing() ?? false; } })) {
      event.preventDefault(); field.current?.insertText(shown); return true;
    }
    if (event.key === "Backspace" && removeChip(-1, "backspace")) { event.preventDefault(); return true; }
    return false;
  };
  // A new suggestion for the conversation on screen is read once while its empty field has focus (decision 7); a
  // first list read, a switch or the same text shown again after emptying is left to the placeholder and the hint.
  const lastSuggestion = useRef({ key, suggestion: props.suggestion });
  useEffect(() => {
    const last = lastSuggestion.current;
    lastSuggestion.current = { key, suggestion: props.suggestion };
    if (last.key !== key || last.suggestion === undefined || placeholder.suggestion === null || placeholder.suggestion === last.suggestion) return;
    const node = field.current?.element();
    if (node && node.ownerDocument.activeElement === node) setAnnouncement(`Suggestion: ${placeholder.suggestion}`);
  }, [key, props.suggestion]);

  if (props.canvasGone || refusal?.kind === "gone") return <div className="canvas-gone" role="status"><AlertIcon /><span>{canvasGoneText(props.project)}</span></div>;
  const reason = availability.reason;
  const notice = refusal?.kind === "notice" ? refusal : null;
  // Only an id drawn below; the live reason shows with an older notice rather than behind it.
  const describedBy = [reason && !reason.noAgent ? reasonId : null, placeholder.suggestion !== null ? hintId : null].filter(Boolean).join(" ") || undefined;
  return <div className="docked" data-shape={shape} ref={root} {...drop.handlers}>
    <QueueRows key={key} handle={queueRows} items={props.queued} sendNow={canSendNow} onSendNow={id => props.onSendQueuedNow?.(id) ?? Promise.resolve({ error: "not_running" })}
      onRemove={props.onRemoveQueued} focusInput={() => field.current?.focus()}
      // The same refusal again changes the region's text by a no-break space, so it is read again.
      announce={text => setAnnouncement(current => current === text ? `${text}\u00a0` : text)} />
    {canSendNow && props.queued.length > 0 && <div className="queue-key">Press Ctrl + Enter to send all now.</div>}
    <ComposerCard readonly={isSending}>
      <ComposerChips attachments={draft.attachments} preset={draft.preset} thumbnails={props.thumbnails} homeDirectory={props.homeDirectory} disabled={isSending || locked} removeButtons={removeButtons} onRemove={index => removeChip(index, "button")} />
      {/* One field element in both shapes, at the same place and key: remounting it would drop focus and IME composition. */}
      <ComposerField key="field" ref={field} draftKey={key} value={draft.segments} onChange={segments => edit({ segments })} readOnly={isSending || locked}
        placeholder={placeholder.text} describedBy={describedBy} chipScope={props.chipScope ?? null} onAnnounce={setAnnouncement} onChipClick={props.onLocate ? locate : undefined}
        combobox={slashOpen ? { listId: `${listId}-slash`, activeId: slashRows[highlight] ? `${listId}-s-${highlight}` : undefined } : null}
        onKey={keyDown} onSteerKey={() => void steerAll()} sendNow={canSendNow} onSubmit={() => void send()} onPaste={paste} />
      <ComposerTools>
        <PresetsButton reply={props.presets} project={props.project} suggested={props.suggested} listId={listId} disabled={isSending || locked}
          onOpen={props.onPresetsOpen} onChoose={id => choosePreset(id, false)} onRetry={props.onPresetsRetry} onPicked={() => focus({ kind: "restored" })} canvasPress={props.canvasPress} />
        {slashOpen && slashView && <SlashPresets view={slashView} query={slash} listId={listId} highlight={highlight} listRef={slashList} onHighlight={setHighlight} onChoose={id => choosePreset(id, true)} onRetry={props.onPresetsRetry} />}
        <span className="grow" />
        <SendButton action={action} enabled={action === "stop" ? !isSending : availability.enabled} sending={isSending} onSend={() => { if (action === "stop") stop(); else void send(); }} hint={reason?.noAgent ? reason.text : undefined} />
      </ComposerTools>
      {drop.cover}
    </ComposerCard>
    <div className="composer-tray">
      {props.fixed ? <FixedTip label="Files can’t be attached to a terminal session"><button type="button" className="doan-icon-button composer-attach" data-ui-size="xs" aria-label="Attach files" aria-disabled="true"><Plus aria-hidden="true" /></button></FixedTip>
        : <AttachButton tray disabled={isSending || locked} onClick={props.onAttach} />}
      {props.pick && <PickButton pick={props.pick} />}
      {props.fixed && fixedProvider ? <>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-agent doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label={`Model: set by the terminal session (${PROVIDER_NAMES[fixedProvider]})`}><img className="logo" src={providerLogo(fixedProvider)} alt="" /><span className="label">Terminal session</span></button></FixedTip>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-effort doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label="Effort: set by the terminal session"><Gauge aria-hidden="true" /><span className="label">Default</span></button></FixedTip>
        <FixedTip label="Set in your terminal"><button type="button" className="composer-permission doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true"
          aria-label="Permission: set by the terminal session"><Shield aria-hidden="true" /><span className="label">Default</span></button></FixedTip>
      </> : <>
        <AgentPicker size="xs" picker={picker} auth={props.auth} disabled={isSending} onOpen={props.onPickerOpen} onPick={props.onPickModel} onSettings={target => queueMicrotask(() => props.onSettings(target))} />
        {picker.effort && <EffortPicker size="xs" view={picker.effort} effort={props.effort} disabled={isSending} onPick={props.onPickEffort} />}
        {props.permission && <PermissionPicker size="xs" view={props.permission} disabled={isSending} onPick={mode => props.onPickPermission?.(mode)} />}
      </>}
    </div>
    {notice && (notice.startNew
      ? <div className="composer-reason docked-reason reason-stack" role="status"><span>{notice.text}</span>
        <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => { clearRefusal(key); props.onStartNew?.(); focus({ kind: "restored" }); }}>Start a new conversation</button></div>
      : <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{notice.text}</span>
        {notice.retry && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => void send()}>Retry</button>}</div>)}
    {reason && !reason.noAgent && (reason.alert
      ? <div className="doan-notice error doan-panel composer-notice" role="alert" id={reasonId}><AlertIcon /><span className="grow-text">{reason.text}</span></div>
      : <div className="composer-reason docked-reason" role="status" id={reasonId}><span>{reason.text}</span>
        {reason.open && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-label="Open the running conversation" onClick={() => props.onOpen(reason.open!)}>Open</button>}
        {reason.action && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => props.onSettings(reason.action!.target)}>{reason.action.label}</button>}</div>)}
    {(limitAt === key || full) && <div className="composer-reason docked-reason" role="status"><span>{ANCHOR_LIMIT_TEXT}</span></div>}
    {noteShown && <span className="chip-missing chip-note" id={noteId} role="status" style={{ left: missingAt.left, top: missingAt.top }}>{LOCATE_MISSING_TEXT}</span>}
    {placeholder.suggestion !== null && <span className="sr-only" id={hintId}>{SUGGESTION_HINT}</span>}
    <div className="sr-only" role="status">{announcement}</div>
  </div>;
}

const SUGGESTION_HINT = "Press Right Arrow to use the suggestion.";

export const SEND_NOW_TIP = "Add to the current turn without stopping it";
export const SEND_NOW_REFUSED_TEXT = "Couldn’t send now. It stays queued.";
const SEND_NOW_REFUSED_MS = 4000;
type QueueButton = "sendNow" | "remove";

export interface QueueRowsHandle {
  sendAll(): void;
  sendNow(id: string): Promise<void>;
}

export interface QueueRowsProps {
  handle?: MutableRefObject<QueueRowsHandle | null>;
  items: readonly { id: string; text: string }[];
  sendNow: boolean;
  onSendNow(id: string): Promise<void | { error: string; turnRuns?: boolean }>;
  onRemove(id: string): Promise<boolean>;
  focusInput(): void;
  // The composer's lasting live region: a row drawn again with its refusal may not be read (canvas-composer-polish
  // design §2).
  announce(text: string): void;
}

// The queued messages above the card (queue-send-now design §8): Send now between the text and Remove, both described
// by the row's text so each row's buttons are told apart. Keyed by conversation, so a switch drops its notes and focus.
export function QueueRows(props: QueueRowsProps) {
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set());
  // The rows as last drawn, read when an answer lands after the render it was asked from.
  const latest = useRef(props); latest.current = props;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes once the row that left is no longer drawn (spec completion condition 11).
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
  useLayoutEffect(() => {
    const wanted = pending.current;
    if (wanted && !props.items.some(item => item.id === wanted.leaving)) {
      pending.current = null; lost.current = false;
      const { target } = wanted;
      const button = target.kind === "input" ? undefined : buttons.current.get(`${target.kind}:${target.itemId}`) ?? buttons.current.get(`remove:${target.itemId}`);
      if (button) button.focus(); else props.focusInput();
      return;
    }
    if (lost.current && !wanted) { lost.current = false; props.focusInput(); }
  });

  // The next row's buttons as they are drawn now; the row that leaves may already be gone from the latest list. Only
  // while focus is still on that row (or was dropped with it): an agent may read the message long after the press,
  // and focus the person moved meanwhile stays where they put it.
  const focusAfter = (id: string, asked: QueueRowsProps["items"]) => {
    const active = document.activeElement;
    if (active && active !== document.body && ![`sendNow:${id}`, `remove:${id}`].some(name => buttons.current.get(name) === active)) return;
    const now = latest.current;
    const list = now.items.some(item => item.id === id) ? now.items : asked;
    const rows = list.map(item => ({ itemId: item.id, sendNow: now.sendNow }));
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
    // Only a turn that still runs says so; one that ended sends or returns the queue by its own rule (condition 10).
    // The answer's reading of the turn decides: the last draw may not show an end that already came.
    if (!reply.turnRuns) return;
    setRefused(current => new Set(current).add(id));
    props.announce(SEND_NOW_REFUSED_TEXT);
  };
  useImperativeHandle(props.handle, () => ({
    sendAll: () => { for (const item of props.items) void sendNow(item.id); },
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
    const textId = `${idBase}-${index}`;
    // The status line sits in the row's listitem (a list owns only listitems) and is drawn from the start, empty, so the
    // live region is registered before a refusal puts text in it.
    return <div key={item.id} className="queue-entry" role="listitem">
      <div className="queue-item"><Clock aria-hidden="true" /><span className="queue-text" id={textId}>{item.text}</span>
        {props.sendNow && <QueueButtonLife onLost={() => { lost.current = true; }}>{life =>
          <Tooltip><TooltipTrigger asChild>
            <button type="button" ref={node => { life(node); keep("sendNow", item.id)(node); }} className="doan-button queue-send" data-ui-size="xs" data-ui-variant="subtle"
              aria-label="Send queued message now" aria-describedby={textId} onClick={() => void sendNow(item.id)}>Send now</button>
          </TooltipTrigger><TooltipContent>{SEND_NOW_TIP}</TooltipContent></Tooltip>}</QueueButtonLife>}
        <QueueButtonLife onLost={() => { lost.current = true; }}>{life =>
          <button type="button" ref={node => { life(node); keep("remove", item.id)(node); }} className="chip-remove doan-icon-button" data-ui-size="xs"
            aria-label="Remove queued message" aria-describedby={textId} onClick={() => void remove(item.id)}><X aria-hidden="true" /></button>}</QueueButtonLife>
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

// Pick from canvas, after Attach at the left end of the model row (design §2 'Picker'). aria-disabled, not disabled, so its reason
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
