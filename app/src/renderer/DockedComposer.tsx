import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Clock, X } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor } from "../main/conversation/types";
import { AlertIcon } from "./AlertIcon";
import { plainText, sameSegments, typedText } from "./anchorField";
import {
  AgentPicker, AttachButton, ComposerCard, ComposerChips, ComposerField, ComposerTools, EffortPicker, PresetsButton,
  SendButton, SlashPresets, useComposerDrop, type ComposerFieldHandle,
} from "./ComposerParts";
import { composerAction, composerShape, focusAfter, type FocusAction } from "./composerRules";
import {
  canvasGoneText, dockedAvailability, dockedMessage, dockedPicker, dockedRefusal, draftKey, EMPTY_DRAFT,
  type DockedBusy, type DockedDraft, type DockedMode, type DockedRefusal,
} from "./dockedRules";
import { slashKey, pasteAction } from "./HomeComposerView";
import {
  attachmentChipView, chipRemoval, presetListView, slashQuery, type AttachmentDraft, type ModelPickerView,
  type PresetListReply, type PresetSummary,
} from "./homeComposer";
import type { SettingsTarget } from "./settingsSections";

// The composer under a conversation (buzz-conversation design §3.1, draft frame `docked-composer`). It has no screen
// in this feature: its host (buzz-project's Overview, later the canvas panel) owns the conversation, the drafts map,
// the model and preset lists and every call to main, and passes them in. This component decides shape, the Send slot,
// the reason line and focus.

export interface DockedRequest { text: string; anchors: readonly Anchor[]; attachments: { id: string }[] }
export type DockedOutcome = { ok: true } | { error: string; missing?: string[] };

export interface DockedComposerProps {
  mode: DockedMode;
  project: string; homeDirectory: string | null;
  // The host's placeholder: a reply, a new conversation in the project, or restoring an archived conversation.
  placeholder: string;
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
  queued: readonly { id: string; text: string }[];
  // Send in an existing conversation, a restore in an archived one, a start in new-conversation mode.
  onSend(request: DockedRequest): Promise<DockedOutcome>;
  onQueue(request: DockedRequest): Promise<DockedOutcome>;
  onStop(): void;
  onRemoveQueued(id: string): void;
  onOpen(conversationId: string): void;
}

const sameDraft = (a: DockedDraft, b: DockedDraft) => sameSegments(a.segments, b.segments) && (a.preset?.id ?? null) === (b.preset?.id ?? null)
  && a.attachments.map(item => item.key).join("\n") === b.attachments.map(item => item.key).join("\n");

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
  const generation = useRef(0);
  // The key on screen when a reply lands, which may differ from the one the send left from.
  const shown = useRef(key); shown.current = key;
  const field = useRef<ComposerFieldHandle | null>(null);
  const removeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const hostSawBusy = useRef(new Set<string>());
  const listId = useId(), reasonId = `${listId}-reason`;

  const isSending = sending.has(key);
  const held = refusals.get(key);
  const refusal = held && (!held.draft || sameDraft(held.draft, draft)) ? held.refusal : null;
  const dismissed = dismissedKey === key;
  const highlight = highlightAt.key === key ? highlightAt.index : 0;
  const setHighlight = (index: number) => setHighlightAt({ key, index });
  // Chips the host added (Attach, paste, drop) make a box as typing does (design §3.2); the drawn shape follows the
  // rule at once and the stored one catches up below.
  const text = plainText(draft.segments);
  const shape = composerShape(draft.shape, { empty: text === "", chips: draft.attachments.length + (draft.preset ? 1 : 0), overflows: text.includes("\n") });
  // A busy refusal stands in for the host's busy until the host has reported the busy conversation itself; once the
  // host's busy has shown and cleared again, the refusal no longer holds Send.
  if (props.busy && refusal?.kind === "busy") hostSawBusy.current.add(key);
  const busy = props.busy ?? (refusal?.kind === "busy" && !hostSawBusy.current.has(key) ? refusal.busy : null);
  const availability = dockedAvailability({ mode, project: props.project, auth: props.auth, provider: props.provider, draft, turn: props.turn, busy, sending: isSending, unavailable: props.unavailable ?? null });
  const message = dockedMessage(draft);
  const action = composerAction(props.turn !== "idle", message.text);
  const picker = dockedPicker(props.picker, mode);
  const presets = props.presets?.ok ? props.presets.result.presets : [];
  // The `/` list reads a field of typed text only; a chip anywhere means the field holds a message, not a search.
  const slash = slashQuery(text === typedText(draft.segments) ? text : "", dismissed);
  const slashView = slash !== null ? presetListView(props.presets, { project: props.project, suggested: props.suggested, query: slash, tab: null, slash: true }) : null;
  const slashRows = slashView?.kind === "list" ? slashView.sections.flatMap(section => section.rows) : [];
  const slashOpen = slash !== null && !isSending;
  const chips = [...draft.attachments.map(a => ({ label: attachmentChipView(a, props.homeDirectory).label })), ...(draft.preset ? [{ label: draft.preset.title, preset: true }] : [])];

  // Every edit takes the shape rule with the overflow known without measuring (a typed line break); the wrap at the
  // capsule's width is measured after the draw below. An edit also drops a refusal the person is answering.
  const edit = (patch: Partial<Omit<DockedDraft, "shape">>, at = key, wrapped = false) => {
    props.onDrafts(drafts => {
      const current = drafts.get(at) ?? EMPTY_DRAFT, next = { ...current, ...patch };
      const nextText = plainText(next.segments);
      const shape = composerShape(current.shape, { empty: nextText === "", chips: next.attachments.length + (next.preset ? 1 : 0), overflows: wrapped || nextText.includes("\n") });
      return new Map(drafts).set(at, { ...next, shape });
    });
    clearRefusal(at);
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
    if (isSending) return false;
    const removal = chipRemoval(chips, trigger === "button" ? { kind: "button", index } : { kind: "backspace", text, caret: field.current?.caretAtStart() === false ? 1 : 0 });
    if (!removal) return false;
    const removed = draft.attachments[removal.remove];
    if (removal.remove >= draft.attachments.length) edit({ preset: null });
    else if (removed) { props.onAttachmentRemoved(removed); edit({ attachments: draft.attachments.filter(a => a.key !== removed.key) }); }
    setAnnouncement(removal.announcement);
    queueMicrotask(() => { if (removal.focus === "textarea") field.current?.focus(); else removeButtons.current[removal.focus]?.focus(); });
    return true;
  };
  const drop = useComposerDrop({ blocked: () => isSending, onFiles: files => props.onFiles(files, false), onNotice: text => setRefusals(previous => {
    const next = new Map(previous);
    if (text === null) next.delete(key); else next.set(key, { refusal: { kind: "notice", text } });
    return next;
  }) });
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (pasteAction(event.clipboardData.getData("text/plain"), files) !== "files") return;
    event.preventDefault();
    if (!isSending) props.onFiles(files, true);
  };

  const stop = () => { props.onStop(); focus({ kind: "stopped" }); };
  const send = async () => {
    if (action === "stop" || !availability.enabled) return;
    const at = key, sent = draft, mine = ++generation.current;
    const request: DockedRequest = { text: message.text, anchors: message.anchors, attachments: draft.attachments.flatMap(a => a.id ? [{ id: a.id }] : []) };
    setSending(current => new Map(current).set(at, mine));
    const outcome = await (action === "queue" ? props.onQueue(request) : props.onSend(request)).catch((): DockedOutcome => ({ error: "unknown" }));
    setSending(current => { if (current.get(at) !== mine) return current; const next = new Map(current); next.delete(at); return next; });
    if ("ok" in outcome) {
      clearRefusal(at);
      // The field empties and returns to a capsule only when the person did not change the draft while it was sent.
      props.onDrafts(drafts => sameDraft(drafts.get(at) ?? EMPTY_DRAFT, sent) ? new Map(drafts).set(at, EMPTY_DRAFT) : drafts);
      if (at === shown.current) focus({ kind: "sent" });
      return;
    }
    if (outcome.error === "attachment_missing") {
      const missing = new Set(outcome.missing ?? []);
      props.onDrafts(drafts => {
        const current = drafts.get(at);
        return current ? new Map(drafts).set(at, { ...current, attachments: current.attachments.map(a => a.id && missing.has(a.id) ? { ...a, status: "missing" as const } : a) }) : drafts;
      });
    } else {
      const provider = mode.kind === "new" ? props.provider : mode.provider;
      if (provider) setRefusals(previous => new Map(previous).set(at, { refusal: dockedRefusal(outcome.error, mode, provider, props.project), draft: sent }));
    }
    if (at === shown.current) focus({ kind: "sent" });
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
    if (event.key === "Backspace" && removeChip(-1, "backspace")) { event.preventDefault(); return true; }
    return false;
  };

  if (props.canvasGone || refusal?.kind === "gone") return <div className="canvas-gone" role="status"><AlertIcon /><span>{canvasGoneText(props.project)}</span></div>;
  const reason = availability.reason;
  const notice = refusal?.kind === "notice" ? refusal.text : null;
  // Only an id drawn below; the live reason shows with an older notice rather than behind it.
  const describedBy = reason ? reasonId : undefined;
  return <div className="docked" data-shape={shape} {...drop.handlers}>
    {props.queued.length > 0 && <div className="queue" role="list" aria-label="Queued messages">{props.queued.map(item =>
      <div key={item.id} className="queue-item" role="listitem"><Clock aria-hidden="true" /><span className="queue-text">{item.text}</span>
        <button type="button" className="chip-remove doan-icon-button" data-ui-size="xs" aria-label="Remove queued message" onClick={() => props.onRemoveQueued(item.id)}><X aria-hidden="true" /></button></div>)}</div>}
    <ComposerCard readonly={isSending}>
      <ComposerChips attachments={draft.attachments} preset={draft.preset} thumbnails={props.thumbnails} homeDirectory={props.homeDirectory} disabled={isSending} removeButtons={removeButtons} onRemove={index => removeChip(index, "button")} />
      {/* One field element in both shapes, at the same place and key: remounting it would drop focus and IME composition. */}
      <ComposerField key="field" ref={field} value={draft.segments} onChange={segments => edit({ segments })} readOnly={isSending}
        placeholder={props.placeholder} describedBy={describedBy} chipScope={props.chipScope ?? null} onAnnounce={setAnnouncement}
        combobox={slashOpen ? { listId: `${listId}-slash`, activeId: slashRows[highlight] ? `${listId}-s-${highlight}` : undefined } : null}
        onKey={keyDown} onSubmit={() => void send()} onPaste={paste} />
      <ComposerTools>
        <AttachButton disabled={isSending} onClick={props.onAttach} />
        <PresetsButton reply={props.presets} project={props.project} suggested={props.suggested} listId={listId} disabled={isSending}
          onOpen={props.onPresetsOpen} onChoose={id => choosePreset(id, false)} onRetry={props.onPresetsRetry} onPicked={() => focus({ kind: "restored" })} />
        {slashOpen && slashView && <SlashPresets view={slashView} query={slash} listId={listId} highlight={highlight} onChoose={id => choosePreset(id, true)} onRetry={props.onPresetsRetry} />}
        <span className="grow" />
        <SendButton action={action} enabled={action === "stop" ? !isSending : availability.enabled} sending={isSending} onSend={() => { if (action === "stop") stop(); else void send(); }} />
      </ComposerTools>
      {drop.cover}
    </ComposerCard>
    <div className="composer-tray">
      <AgentPicker size="xs" picker={picker} auth={props.auth} disabled={isSending} onOpen={props.onPickerOpen} onPick={props.onPickModel} onSettings={target => queueMicrotask(() => props.onSettings(target))} />
      {picker.effort && <EffortPicker size="xs" view={picker.effort} effort={props.effort} disabled={isSending} onPick={props.onPickEffort} />}
    </div>
    {notice && <div className="doan-notice error doan-panel composer-notice" role="alert"><AlertIcon /><span className="grow-text">{notice}</span></div>}
    {reason && (reason.alert
      ? <div className="doan-notice error doan-panel composer-notice" role="alert" id={reasonId}><AlertIcon /><span className="grow-text">{reason.text}</span></div>
      : <div className="composer-reason docked-reason" role="status" id={reasonId}><span>{reason.text}</span>
        {reason.open && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-label="Open the running conversation" onClick={() => props.onOpen(reason.open!)}>Open</button>}
        {reason.action && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => props.onSettings(reason.action!.target)}>{reason.action.label}</button>}</div>)}
    <div className="sr-only" role="status">{announcement}</div>
  </div>;
}
