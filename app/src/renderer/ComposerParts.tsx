import { forwardRef, Fragment, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { DropdownMenu, Popover } from "radix-ui";
import { ArrowUp, Check, ChevronDown, Compass, Eye, FilePenLine, FileText, Folder, Gauge, Paintbrush, PencilSparkles, Plus, ScanEye, Search, Settings, Shapes, Shield, ShieldAlert, SquareSlash, Square, TextAlignStart, TriangleAlert, X, Zap } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { Anchor, SkillSummary } from "../main/conversation/types";
import { pickerAction, pickerFooter, providerShortStatus } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import type { FieldSegment } from "./anchorField";
import { ChipField, type ChipInsert } from "./chipField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { ComposerAction } from "./composerRules";
import { outsidePresetList } from "./presetOutside";
import type { SettingsTarget } from "./settingsSections";
import {
  attachmentChipView, foldRows, groupIcon, heldScrollTop, lockedOlderSide, isSubmitKey, steerKey, modelPickerView, NO_OLDER, olderLabel, olderOpened, olderOrder, olderToggled,
  drawerSearchLabel, presetListView, providerLogo, type AttachmentDraft, type PresetListReply, type PresetRow, type PresetSummary, type SuggestionPart,
} from "./homeComposer";
import type { PermissionIcon, PermissionPickerView } from "./permissionPicker";

// The composer's shared primitives: Home's HeroComposer assembles them today and the
// docked composer will. Each draws the markup Home drew before the split, so Home's computed styles and DOM order stay.

const GROUP_ICONS: Record<string, typeof Compass> = { "square-slash": SquareSlash, compass: Compass, "scan-eye": ScanEye, paintbrush: Paintbrush, "text-align-start": TextAlignStart, shapes: Shapes, "pencil-sparkles": PencilSparkles };
// A suggested prompt's sentence with its project and canvas names highlighted; the text itself is unchanged, so the
// button's accessible name stays the whole sentence.
export function SuggestionLabel({ parts }: { parts: readonly SuggestionPart[] }) {
  return <span className="suggestion-label">{parts.map((part, i) => part.value ? <span key={i} className="suggestion-value">{part.text}</span> : <Fragment key={i}>{part.text}</Fragment>)}</span>;
}

export function GroupIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GROUP_ICONS[name] ?? PencilSparkles;
  return <Icon className={className} aria-hidden="true" />;
}

export function IconTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

// The card: the white surface that holds chips, field and tools. readonly while a send is pending.
export function ComposerCard({ readonly, children }: { readonly: boolean; children: ReactNode }) {
  return <div className={`composer-card${readonly ? " readonly" : ""}`}>{children}</div>;
}

// Files and folders dragged over the composer attach; the window's own drop handling never sees them. Main says which
// dropped items are neither, one by one.
export function useComposerDrop(options: { blocked: () => boolean; onFiles(files: File[]): void; onNotice(text: string | null): void }) {
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const handlers = {
    onDragEnter: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); depth.current++; setDropping(true); },
    onDragOver: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = options.blocked() ? "none" : "copy"; },
    onDragLeave: (event: DragEvent) => { if (!hasFiles(event)) return; event.stopPropagation(); if (--depth.current <= 0) { depth.current = 0; setDropping(false); } },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      depth.current = 0; setDropping(false);
      if (options.blocked()) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length) { options.onNotice(null); options.onFiles(files); }
    },
  };
  const cover = dropping ? <div className="drop-target"><span className="sr-only" role="status">Drop to attach</span></div> : null;
  return { handlers, cover };
}

// Attachment and preset chips. `removeButtons` holds each ×, in chip order, for the focus move after a removal.
export function ComposerChips(props: {
  attachments: readonly AttachmentDraft[]; preset: PresetSummary | null; thumbnails: Readonly<Record<string, string>>; homeDirectory: string | null;
  disabled: boolean; removeButtons: MutableRefObject<(HTMLButtonElement | null)[]>; onRemove(index: number): void;
}) {
  const { attachments, preset } = props;
  if (attachments.length === 0 && !preset) return null;
  return <div className="composer-chips">
    {attachments.map((a, index) => {
      const view = attachmentChipView(a, props.homeDirectory), url = props.thumbnails[a.key];
      const chip = <span className={`attach-chip${view.thumbnail && url ? " image" : ""}${view.problem ? " problem" : ""}`}>
        {view.thumbnail && url ? <span className="thumb" aria-hidden="true"><img src={url} alt="" /></span>
          : <span className="file-icon" aria-hidden="true">{a.status === "checking" ? <span className="doan-spinner" /> : view.problem ? <TriangleAlert /> : view.folder ? <Folder /> : <FileText />}</span>}
        <span className="attach-text"><b>{view.label}</b><small>{view.meta}</small></span>
        <button type="button" ref={node => { props.removeButtons.current[index] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={view.removeLabel} disabled={props.disabled} onClick={() => props.onRemove(index)}><X aria-hidden="true" /></button>
      </span>;
      return <Fragment key={a.key}>{view.tooltip ? <Tooltip><TooltipTrigger asChild>{chip}</TooltipTrigger><TooltipContent>{view.tooltip}</TooltipContent></Tooltip> : chip}</Fragment>;
    })}
    {preset && <span className="preset-chip"><GroupIcon name={groupIcon(preset.group)} /><span>{preset.title}</span>
      <button type="button" ref={node => { props.removeButtons.current[attachments.length] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={`Remove preset ${preset.title}`} disabled={props.disabled} onClick={() => props.onRemove(attachments.length)}><X aria-hidden="true" /></button></span>}
  </div>;
}

// The text field: typed text and inline anchor chips, drawn by
// ChipField into one contenteditable element that both shapes keep (remounting would drop focus and IME composition).
// The value is segments: {text, anchors} cannot tell a typed {{1}} from a chip's marker, so hosts convert at send time
// (anchorField.ts toMessage). Enter sends unless an IME is composing; `onKey` sees every key first and returns true when
// it handled one.
export interface ComboboxProps { listId: string; activeId: string | undefined }
export interface ComposerFieldHandle {
  focus(caret?: "end"): void;
  // The caret stands at the very start with nothing selected (chipRemoval's Backspace).
  caretAtStart(): boolean;
  insertChip(anchor: Anchor): ChipInsert;
  insertText(text: string): void;
  insertSkill(name: string, fromSlash?: boolean): void;
  composing(): boolean;
  element(): HTMLElement | null;
}
export const ComposerField = forwardRef<ComposerFieldHandle, {
  value: readonly FieldSegment[]; onChange(value: FieldSegment[]): void; readOnly: boolean; placeholder: string;
  // The draft the value belongs to (draftKey(mode) in the docked composer). A change ends the field's undo history,
  // caret and waiting chips even when the values are equal; the element itself stays, so focus and shape do too.
  draftKey?: string;
  skillNames?: ReadonlySet<string>;
  // The canvas the field's chips belong to (its canvas panel sets it); null, the default, takes no chips.
  chipScope?: string | null;
  // The `/` preset list while it is open: the field is its combobox.
  combobox: ComboboxProps | null;
  onKey(event: KeyboardEvent<HTMLDivElement>): boolean; onSubmit(): void; onSteerKey?(): void;
  sendNow?: boolean;
  // Files are the host's; text the host leaves alone is pasted by the field.
  onPaste(event: ClipboardEvent<HTMLDivElement>): void; onInput?(): void; onAnnounce?(text: string): void;
  // A click on a chip in the field (the caret is already right after it).
  onChipClick?: ((anchor: Anchor, chip: HTMLElement) => void) | undefined;
  // The reason line under the docked card also describes the field.
  describedBy?: string | undefined;
}>(function ComposerField(props, ref) {
  const { combobox } = props;
  const node = useRef<HTMLDivElement | null>(null);
  const field = useRef<ChipField | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // Created before the first paint and kept for the element's life; the hooks read the latest props.
  useLayoutEffect(() => {
    if (!node.current) return;
    const created = new ChipField(node.current, {
      onChange: value => latest.current.onChange(value),
      onInput: () => latest.current.onInput?.(),
      onAnnounce: text => latest.current.onAnnounce?.(text),
      scope: () => latest.current.chipScope ?? null,
      skillNames: () => latest.current.skillNames ?? new Set(),
      onChipClick: (anchor, chip) => latest.current.onChipClick?.(anchor, chip),
    }, latest.current.value, latest.current.draftKey);
    field.current = created;
    return () => { created.dispose(); field.current = null; };
  }, []);
  useLayoutEffect(() => { field.current?.setValue(props.value, props.draftKey); }, [props.value, props.draftKey, props.skillNames]);
  useImperativeHandle(ref, () => ({
    focus: caret => field.current?.focus(caret === "end"),
    caretAtStart: () => field.current?.caretAtStart() ?? true,
    insertChip: anchor => field.current?.insertChip(anchor) ?? "refused",
    insertText: text => field.current?.insertText(text),
    insertSkill: (name, fromSlash) => field.current?.insertSkill(name, fromSlash),
    composing: () => field.current?.composing() ?? false,
    element: () => node.current,
  }), []);
  return <div ref={node} className="composer-input" aria-label="Message" tabIndex={0} contentEditable={!props.readOnly} suppressContentEditableWarning
    aria-keyshortcuts={props.sendNow ? "Control+Enter" : undefined} aria-readonly={props.readOnly || undefined} aria-placeholder={props.placeholder} aria-describedby={props.describedBy}
    role={combobox ? "combobox" : "textbox"} aria-multiline={combobox ? undefined : true} aria-expanded={combobox ? true : undefined} aria-controls={combobox ? combobox.listId : undefined}
    aria-autocomplete={combobox ? "list" : undefined} aria-activedescendant={combobox?.activeId}
    onKeyDown={event => {
      if (props.onKey(event)) return;
      if (props.onSteerKey && steerKey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
        event.preventDefault(); props.onSteerKey(); return;
      }
      if (isSubmitKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) { event.preventDefault(); props.onSubmit(); }
    }}
    onPaste={event => { props.onPaste(event); if (!event.defaultPrevented) field.current?.paste(event.nativeEvent); }} />;
});

export function ComposerTools({ children }: { children: ReactNode }) {
  return <div className="composer-tools">{children}</div>;
}

// `tray`: the docked composer's Attach, outside the card and first in the tray, at the tray's xs size.
export function AttachButton({ disabled, onClick, tray = false }: { disabled: boolean; onClick(): void; tray?: boolean }) {
  return <IconTip label="Attach files or folders"><button type="button" className={tray ? "doan-icon-button composer-attach" : "doan-icon-button"} data-ui-size={tray ? "xs" : undefined} aria-label="Attach files or folders" disabled={disabled} onClick={onClick}><Plus aria-hidden="true" /></button></IconTip>;
}

// Group tabs are one Tab stop; ←/→ move between them.
export function tabKey(keys: readonly string[], current: string, key: string): string | null {
  const at = keys.indexOf(current);
  if (at === -1 || (key !== "ArrowLeft" && key !== "ArrowRight")) return null;
  return keys[(at + (key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length] ?? null;
}

type PresetView = ReturnType<typeof presetListView>;
interface PresetBodyOptions { listId: string; highlight: number; onHighlight?(index: number): void; onChoose(id: string, kind: PresetRow["kind"]): void; onRetry(): void; onTab?(key: string): void }
// Once focus is on a row of the list (arrow keys), the pointer carries it along as in the frame list. With focus elsewhere
// (the popover opens in the search box) a row only fills on hover (ds/surfaces.css), so typing and Space keep their target.
// focusVisible: false keeps a pointer-moved focus from drawing the keyboard ring.
function pointerFocus(event: PointerEvent<HTMLElement>) {
  const row = event.currentTarget;
  const active = row.ownerDocument.activeElement;
  if (active !== row && row.closest('[role="listbox"]')?.contains(active)) row.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
function PresetOption({ row, index, slash, options }: { row: PresetRow; index: number; slash: boolean; options: PresetBodyOptions & { rows: number } }) {
  const focusRow = (at: number) => document.getElementById(`${options.listId}-p-${at}`)?.focus();
  return <div id={`${options.listId}-${slash ? "s" : "p"}-${index}`} className="doan-menu-item preset-item" role="option" aria-selected={slash ? index === options.highlight : false}
    tabIndex={slash ? undefined : -1} title={row.tooltip} data-highlighted={slash && index === options.highlight ? "" : undefined}
    onMouseDown={slash ? event => event.preventDefault() : undefined} onPointerMove={slash ? () => options.onHighlight?.(index) : pointerFocus} onClick={() => options.onChoose(row.id, row.kind)}
    onKeyDown={slash ? undefined : event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); focusRow(Math.max(0, Math.min(options.rows - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.onChoose(row.id, row.kind); }
    }}>
    {/* A card: the preset's name over its one-line description (dogfooding); the full text stays in the tooltip. */}
    <span className={`suggestion-icon${row.kind === "skill" ? " project-skill-icon" : ""}`}><GroupIcon name={row.icon} /></span>
    <span className="preset-text"><span className="preset-title">{row.title}</span>{row.description && <span className="preset-desc">{row.description}</span>}</span>
  </div>;
}
export function presetBody(view: PresetView, slash: boolean, options: PresetBodyOptions): ReactNode {
  if (view.kind === "loading") return <div className="popover-state" role="status"><span className="doan-spinner" aria-hidden="true" />{view.text}</div>;
  if (view.kind === "empty") return <div className="popover-state" role="status">{view.text}</div>;
  // The popover is 90% glass over Home's gradient, not plain opaque white, so its notices take the panel surface.
  if (view.kind === "olderCli") return <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text selectable">{view.text}</span></div>;
  if (view.kind === "error") return <><div className="doan-notice error doan-panel" role="alert"><AlertIcon /><span className="grow-text selectable">{view.text}</span></div>{view.retry && <div className="popover-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={options.onRetry}>Retry</button></div>}</>;
  const rows = view.sections.reduce((n, section) => n + section.rows.length, 0);
  let index = 0;
  return <>
    {view.notice && presetBody(view.notice, slash, options)}
    {view.emptyText && <div className="popover-state" role="status">{view.emptyText}</div>}
    {view.tabs.length > 0 && <div className="group-tabs shell-modes" role="tablist" aria-label="Preset groups">{view.tabs.map(item => <button key={item.key} type="button" role="tab" data-group={item.key} className={item.selected ? "current" : ""} aria-selected={item.selected} tabIndex={item.selected ? 0 : -1}
      onClick={() => options.onTab?.(item.key)} onKeyDown={event => {
        const next = tabKey(view.tabs.map(t => t.key), item.key, event.key);
        if (!next) return;
        event.preventDefault(); options.onTab?.(next);
        // React clears currentTarget after the handler, so the tab list is taken now and the new tab focused once drawn.
        const list = event.currentTarget.parentElement;
        requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
      }}>
      <GroupIcon name={item.icon} />{item.label}</button>)}</div>}
    <div className="popover-list doan-scroll" role="listbox" id={slash ? `${options.listId}-slash` : undefined} aria-label={view.summary ?? view.sections[0]?.title ?? "Design presets"}>
      {view.sections.map(section => <Fragment key={section.title ?? "results"}>{section.title && !slash && <div className="doan-menu-head">{section.title}</div>}{section.rows.map(row => <PresetOption key={row.key} row={row} index={index++} slash={slash} options={{ ...options, rows }} />)}</Fragment>)}
    </div>
  </>;
}
function SearchField({ value, slash, listId, onChange, label = "Search presets" }: { label?: string; value: string; slash: boolean; listId: string; onChange?(value: string): void }) {
  return <label className="popover-search"><Search aria-hidden="true" /><input className="doan-input" data-ui-size="sm" placeholder={label} aria-label={label} value={value}
    readOnly={slash} tabIndex={slash ? -1 : undefined} aria-hidden={slash || undefined}
    onChange={slash ? undefined : event => onChange?.(event.target.value)}
    onKeyDown={slash ? undefined : event => { if (event.key === "ArrowDown") { event.preventDefault(); document.getElementById(`${listId}-p-0`)?.focus(); } }} /></label>;
}

// A press in the canvas iframe never reaches the app's document (an out-of-process frame); the canvas posts a press
// message instead, and the canvas page hands it to the preset lists: subscribe with a listener, get the unsubscribe.
export type CanvasPress = (listener: () => void) => () => void;

// The Presets button and its popover. Picking a preset closes the popover and hands focus to
// the field through `onPicked`; a list that failed is read again when the popover opens. A press outside it in the
// app's document closes it by Radix's own rule; a press in the canvas closes it through `canvasPress`.
export function PresetsButton(props: {
  skills?: readonly SkillSummary[];
  reply: PresetListReply | undefined; project: string; suggested: readonly PresetSummary[]; listId: string; disabled: boolean;
  onOpen(): void; onChoose(id: string, kind: PresetRow["kind"]): void; onRetry(): void; onPicked(): void; canvasPress?: CanvasPress | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string | null>(null);
  const picked = useRef(false);
  const content = useRef<HTMLDivElement | null>(null);
  // Radix returns focus to the trigger after a close it did not see as an outside press; a canvas press put focus in
  // the canvas, so it stays there.
  const pressed = useRef(false);
  const lastFocused = useRef<HTMLElement | null>(null);
  const { canvasPress } = props;
  useEffect(() => {
    if (!open || !canvasPress) return;
    // Closed at once, so the canvas page sees where focus fell when the search box went with the popover.
    return canvasPress(() => { pressed.current = true; flushSync(() => setOpen(false)); });
  }, [open, canvasPress]);
  const view = presetListView(props.reply, { project: props.project, suggested: props.suggested, query, tab, skills: props.skills ?? [] });
  const selected = view.kind === "list" ? view.tabs.find(item => item.selected)?.key : undefined;
  useLayoutEffect(() => {
    if (open && tab !== null && query === "" && selected && selected !== tab) {
      setTab(selected);
      const active = document.activeElement;
      const lost = lastFocused.current;
      const restore = lost && !lost.isConnected && active === document.body;
      const inList = active instanceof HTMLElement && content.current?.contains(active) && !!active.closest('[role="listbox"]');
      if (restore || inList) content.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    }
  }, [open, tab, query, selected]);
  const choose = (id: string, kind: PresetRow["kind"]) => { picked.current = true; setOpen(false); props.onChoose(id, kind); };
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) { pressed.current = false; setQuery(""); props.onOpen(); } }}>
    <IconTip label="Design presets"><Popover.Trigger asChild><button type="button" className="doan-icon-button composer-presets" aria-label="Design presets" disabled={props.disabled}><PencilSparkles aria-hidden="true" /></button></Popover.Trigger></IconTip>
    <Popover.Portal><Popover.Content ref={content} onFocusCapture={event => { const target = event.target as HTMLElement; lastFocused.current = target.closest('[role="tab"], [role="listbox"]') ? target : null; }} className={`doan-floating preset-popover${props.skills?.length ? " has-skills" : ""}`} aria-label="Design presets" side="top" align="start" sideOffset={8} collisionPadding={8}
      onCloseAutoFocus={event => {
        if (picked.current) { picked.current = false; event.preventDefault(); props.onPicked(); }
        else if (pressed.current) { pressed.current = false; event.preventDefault(); }
      }}>
      <SearchField label={drawerSearchLabel(props.skills ?? [])} value={query} slash={false} listId={props.listId} onChange={setQuery} />
      {presetBody(view, false, { listId: props.listId, highlight: 0, onChoose: choose, onRetry: props.onRetry, onTab: setTab })}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

// The `/` list keeps focus in the field, so it is drawn in place rather than as a focus-taking popover.
// The pointer moves the one highlight the arrow keys move, as in a Radix menu.
export function SlashPresets(props: { skills?: readonly SkillSummary[]; view: PresetView; query: string; listId: string; highlight: number; listRef?: RefObject<HTMLDivElement | null>; onHighlight(index: number): void; onChoose(id: string, kind: PresetRow["kind"]): void; onRetry(): void }) {
  return <div className="doan-floating preset-popover slash-popover" role="presentation" ref={props.listRef}>
    <SearchField label={drawerSearchLabel(props.skills ?? [])} value={props.query} slash listId={props.listId} />
    {presetBody(props.view, true, { listId: props.listId, highlight: props.highlight, onHighlight: props.onHighlight, onChoose: props.onChoose, onRetry: props.onRetry })}
  </div>;
}

// While the `/` list is open, a press outside it and its field, in the app's document or in the canvas, calls
// `onOutside`, as Escape would close it. The press keeps its own effect and focus, so nothing is prevented.
export function usePresetListOutside(open: boolean, list: RefObject<HTMLElement | null>, field: () => HTMLElement | null, onOutside: () => void, canvasPress?: CanvasPress): void {
  const latest = useRef({ field, onOutside });
  latest.current = { field, onOutside };
  useEffect(() => {
    if (!open) return;
    const down = (event: { target: EventTarget | null }) => { if (outsidePresetList(event.target, list.current, latest.current.field())) latest.current.onOutside(); };
    document.addEventListener("pointerdown", down, true);
    const unsubscribe = canvasPress?.(() => latest.current.onOutside());
    return () => { document.removeEventListener("pointerdown", down, true); unsubscribe?.(); };
  }, [open, canvasPress]);
}

type Picker = ReturnType<typeof modelPickerView>;

// The Older models fold of a model menu, shared by the agent picker and Settings' Model
// menu. Opening or closing the menu (onOpenChange) drops it, so a menu always opens folded but for a checked older model.
export interface OlderFold {
  onOpenChange(open: boolean): void;
  contentRef(node: HTMLDivElement | null): void;
  isOpen(provider: string): boolean;
  placement: { side: "top" | "bottom"; avoidCollisions: boolean };
  line(provider: string, name: string, count: number): ReactNode;
  // An older row's ←: focus goes to its group's line, which folds.
  olderKeyDown(provider: string): (event: KeyboardEvent<HTMLElement>) => void;
}
export function useOlderFold(groups: readonly { provider: string; rows: readonly { older?: true; selected: boolean }[] }[], preferredSide: "top" | "bottom" = "bottom"): OlderFold {
  const [open, setOpen] = useState(false);
  const [fold, setFold] = useState(NO_OLDER);
  const [locked, setLocked] = useState<"top" | "bottom" | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const lines = useRef(new Map<string, HTMLElement>());
  // The line's viewport top just before a toggle, so the toggle's layout can put it back.
  const held = useRef<{ provider: string; top: number } | null>(null);
  const reveal = useRef(false);
  // Radix does not scroll an opening menu to its checked row; this does, once the content is laid out.
  const showChecked = () => requestAnimationFrame(() => {
    content.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
  });
  // On opening and when a list arrives, groups the person has not toggled unfold around a checked older model.
  useLayoutEffect(() => {
    if (!open) return;
    const next = olderOpened(fold, groups);
    if (next !== fold) {
      const node = content.current;
      if (!node) return;
      // Floating UI resolves placement asynchronously. Expand in its settled order, then reveal after that render.
      const frame = requestAnimationFrame(() => {
        if (content.current !== node) return;
        setLocked(current => lockedOlderSide(current, node.dataset.side));
        reveal.current = true;
        setFold(current => olderOpened(current, groups));
      });
      return () => cancelAnimationFrame(frame);
    }
    if (reveal.current && content.current) { reveal.current = false; showChecked(); }
    const h = held.current, line = h && lines.current.get(h.provider), box = content.current;
    if (!h || !line || !box) return;
    held.current = null;
    // Again a frame later: an up-opening menu that grew is moved by Radix's positioning after this layout.
    const hold = () => { box.scrollTop = heldScrollTop({ scrollTop: box.scrollTop, maxScrollTop: box.scrollHeight - box.clientHeight, lineBefore: h.top, lineAfter: line.getBoundingClientRect().top }); };
    hold();
    requestAnimationFrame(hold);
  });
  const toggle = (provider: string, next: boolean) => {
    const line = lines.current.get(provider);
    if (line) held.current = { provider, top: line.getBoundingClientRect().top };
    const side = lockedOlderSide(locked, content.current?.dataset.side);
    setLocked(side);
    setFold(current => olderToggled(current, provider, next));
  };
  const isOpen = (provider: string) => fold.open.includes(provider);
  return {
    onOpenChange: next => { setOpen(next); setFold(NO_OLDER); setLocked(null); reveal.current = next; held.current = null; },
    contentRef: node => {
      content.current = node;
      if (node && reveal.current && olderOpened(fold, groups) === fold) { reveal.current = false; showChecked(); }
    },
    isOpen,
    placement: { side: locked ?? preferredSide, avoidCollisions: locked === null },
    // Not a radio item and carries no value, so it can never be taken for a model; its key stays the same folded or
    // not, or focus would fall to the menu.
    line: (provider, name, count) => <DropdownMenu.Item key={`older:${provider}`} ref={node => { if (node) lines.current.set(provider, node); else lines.current.delete(provider); }}
      className="doan-menu-item older-row" textValue="Older models" aria-expanded={isOpen(provider)} aria-label={olderLabel(name, count)}
      onSelect={event => { event.preventDefault(); toggle(provider, !isOpen(provider)); }}
      onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        if ((event.key === "ArrowRight") !== isOpen(provider)) toggle(provider, event.key === "ArrowRight");
      }}>
      <span className="model-name">Older models</span><span className="count">{count}</span><span className="check-slot"><ChevronDown aria-hidden="true" /></span>
    </DropdownMenu.Item>,
    olderKeyDown: provider => event => {
      if (event.key !== "ArrowLeft") return;
      event.preventDefault();
      lines.current.get(provider)?.focus();
      toggle(provider, false);
    },
  };
}
// A trigger with no value shows its drawer's name in the metadata ink, so it reads as a heading, not a choice.
export function TriggerLabel({ text, placeholder }: { text: string; placeholder: boolean }) {
  return <span className={placeholder ? "label placeholder" : "label"}>{text}</span>;
}
// The agent and model picker: a group per provider, its fix in Settings when it
// cannot run. `onPick` gets the provider and a model id, or null for the Default row shown before the list is read:
// Claude Code's own default model has the id "default", so that word cannot stand for the row.
// `size`: Home's tools row uses sm; the docked row under the card steps down to xs.
export function AgentPicker(props: {
  picker: Picker; auth: AuthSnapshot | null | undefined; disabled: boolean; size?: "sm" | "xs";
  onOpen(): void; onPick(provider: Provider, value: string | null): void; onSettings(target: SettingsTarget): void;
}) {
  const { picker, auth } = props;
  const footer = pickerFooter(picker.groups.some(group => group.selectable));
  const fold = useOlderFold(picker.groups.filter(group => group.selectable), "top");
  return <DropdownMenu.Root onOpenChange={open => { fold.onOpenChange(open); if (open) props.onOpen(); }}>
    <DropdownMenu.Trigger asChild><button type="button" className="composer-agent doan-button" data-ui-size={props.size ?? "sm"} data-ui-variant="trigger" aria-label={picker.trigger.ariaLabel} disabled={props.disabled}>
      {picker.trigger.provider ? <><img className="logo" src={providerLogo(picker.trigger.provider)} alt="" /><TriggerLabel text={picker.trigger.label} placeholder={picker.trigger.placeholder} /></> : <span className="muted">{picker.trigger.label}</span>}<ChevronDown className="chev" aria-hidden="true" />
    </button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content ref={fold.contentRef} className="doan-floating doan-menu agent-popover" aria-label="Agent and model" {...fold.placement} align="end" sideOffset={8} collisionPadding={8}>
      {picker.groups.map((group, index) => {
        const status = auth?.providers.find(item => item.provider === group.provider);
        const short = status ? providerShortStatus(status) : null;
        const fix = !group.selectable && status ? pickerAction(status) : null;
        const selected = group.rows.find(row => row.selected);
        // A group that cannot run says why in its head and offers its fix in Settings below it.
        const note = group.note ?? (group.selectable ? null : short);
        const { current, older } = foldRows(group.rows);
        const item = (row: Picker["groups"][number]["rows"][number]) => <DropdownMenu.RadioItem key={row.kind === "model" ? row.id : "default"} value={row.kind === "model" ? row.id : "default"} className="doan-menu-item model-item"
          {...(row.kind === "model" && row.older ? { onKeyDown: fold.olderKeyDown(group.provider) } : {})}>
          <span className="model-name">{row.label}{row.kind === "model" && row.isDefault && <span className="model-default">Default</span>}</span>{row.kind === "model" && row.effort && <span className="sub"><Gauge className="inline" aria-hidden="true" />Effort</span>}
          <span className="check-slot">{row.selected && <Check className="check" aria-hidden="true" />}</span>
        </DropdownMenu.RadioItem>;
        return <Fragment key={group.provider}>{index > 0 && <DropdownMenu.Separator className="doan-menu-sep" />}<div className="agent-group">
          <DropdownMenu.Label className="doan-menu-head agent-head"><img className="logo" src={providerLogo(group.provider)} alt="" /><span>{group.name}</span>
            {note && <span className="agent-note">{note === "Loading models" && <span className="doan-spinner" aria-hidden="true" />}{note}</span>}</DropdownMenu.Label>
          {group.selectable ? <DropdownMenu.RadioGroup value={!selected ? "" : selected.kind === "model" ? selected.id : "default"} onValueChange={value => props.onPick(group.provider, group.rows.some(row => row.kind === "model" && row.id === value) ? value : null)}>
            {current.map(item)}
            {older.length > 0 && olderOrder<ReactNode>(fold.line(group.provider, group.name, older.length), fold.isOpen(group.provider) ? older.map(item) : [], fold.placement.side)}
          </DropdownMenu.RadioGroup> : fix ? <DropdownMenu.Item className="doan-menu-item" onSelect={() => props.onSettings(fix.target)}>{fix.label}</DropdownMenu.Item>
            : <DropdownMenu.Item className="doan-menu-item" disabled><span className="sub">{short ?? "Not available right now"}</span></DropdownMenu.Item>}
          {group.selectable && short && <p className="menu-note">{short}</p>}
        </div></Fragment>;
      })}
      {picker.groups.length > 0 && <DropdownMenu.Separator className="doan-menu-sep" />}
      {footer.note && <p className="menu-note">{footer.note}</p>}
      <DropdownMenu.Item className="doan-menu-item settings-menu-link" onSelect={() => props.onSettings(footer.action.target)}><Settings aria-hidden="true" />{footer.action.label}</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

// The effort picker, shown only when the chosen model has effort steps.
// In the docked tray (xs) the label can hide at a narrow width (styles.css container steps), so the trigger keeps
// its name in a tooltip there. With a Fast row the tooltip shows at both sizes: the trigger's
// Fast icon is its only mark, and the name says whether Fast is on.
export function EffortPicker({ view, effort, disabled, onPick, onPickFast, size = "sm" }: { view: NonNullable<Picker["effort"]>; effort: string | null; disabled: boolean; onPick(value: string): void; onPickFast?(on: boolean): void; size?: "sm" | "xs" }) {
  const { fast } = view;
  // The row's name is its Fast span alone, so the description is read once, as a description.
  const rowId = useId(), nameId = `${rowId}-name`, describedBy = `${rowId}-description`;
  const trigger = <DropdownMenu.Trigger asChild><button type="button" className="composer-effort doan-button" data-ui-size={size} data-ui-variant="trigger" aria-label={view.ariaLabel} disabled={disabled}><Gauge aria-hidden="true" /><TriggerLabel text={view.label} placeholder={view.placeholder} />{fast?.on && <Zap className="fast-icon" aria-hidden="true" />}<ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>;
  return <DropdownMenu.Root>
    {size === "xs" || fast ? <IconTip label={view.ariaLabel}>{trigger}</IconTip> : trigger}
    <DropdownMenu.Portal><DropdownMenu.Content className={`doan-floating doan-menu effort-popover${fast ? " has-fast" : ""}`} data-ui-size="compact" aria-label={view.menuLabel} side="top" align="end" sideOffset={8} collisionPadding={8}>
      <DropdownMenu.Label className="doan-menu-head">{view.title}</DropdownMenu.Label>
      {/* The Default row's value is "", the no-level state, so it is checked while nothing is chosen; picking it passes
          "" on, which the composers store and defaultEffort reads as no level. */}
      <DropdownMenu.RadioGroup value={effort ?? ""} onValueChange={onPick}>
        <DropdownMenu.RadioItem value="" className="doan-menu-item unset-item"><span className="unset-copy"><span className="model-name">{view.unset.label}</span><span className="sub">{view.unset.description}</span></span>
          <span className="check-slot">{view.unset.selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>
        <DropdownMenu.Separator className="doan-menu-sep" />
        {view.options.map(item => <DropdownMenu.RadioItem key={item.id} value={item.id} className="doan-menu-item"><span className="model-name">{item.label}</span><span className="check-slot">{item.selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
      {/* A menuitemcheckbox, not .doan-switch: that is a button[role="switch"], which cannot sit in a menu item. The switch
          look is drawn, with no check mark, so it never reads as a level. Toggling keeps the menu open (onSelect). */}
      {fast && <>
        <DropdownMenu.Separator className="doan-menu-sep" />
        <DropdownMenu.CheckboxItem className="doan-menu-item fast-item" checked={fast.on} disabled={fast.unavailable !== undefined} aria-labelledby={nameId} aria-describedby={fast.description ? describedBy : undefined}
          onCheckedChange={on => onPickFast?.(on)} onSelect={event => event.preventDefault()}>
          <span className="fast-slot" aria-hidden="true"><Zap /></span>
          <span className="fast-copy"><span className="model-name" id={nameId}>Fast</span>{fast.description && <span className="sub" id={describedBy}>{fast.description}</span>}</span>
          <span className="fast-switch" aria-hidden="true" />
        </DropdownMenu.CheckboxItem>
      </>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

const PERMISSION_ICONS: Record<PermissionIcon, typeof Shield> = { shield: Shield, "file-pen-line": FilePenLine, eye: Eye, "shield-alert": ShieldAlert };
export function PermissionIconView({ name, className }: { name: PermissionIcon; className?: string }) {
  const Icon = PERMISSION_ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}

// The permission mode menu's rows (draft frame picker-menu): the mode's icon, its name over a one-line description,
// and the check. Shared by the composer picker and Settings' Permission row.
export function PermissionMenuItems({ view, onPick }: { view: PermissionPickerView; onPick(mode: PermissionModeId): void }) {
  return <>
    <DropdownMenu.Label className="doan-menu-head">{view.title}</DropdownMenu.Label>
    <DropdownMenu.RadioGroup value={view.mode} onValueChange={value => onPick(value as PermissionModeId)}>
      {view.options.map(item => <DropdownMenu.RadioItem key={item.id} value={item.id} className="doan-menu-item perm-item" data-mode={item.id}>
        <PermissionIconView name={item.icon} /><span className="perm-copy"><span className="model-name">{item.label}</span><span className="sub">{item.description}</span></span>
        <span className="check-slot">{item.selected && <Check className="check" aria-hidden="true" />}</span>
      </DropdownMenu.RadioItem>)}
    </DropdownMenu.RadioGroup>
  </>;
}

// The permission mode picker, after Effort. Full access keeps its name, its
// warning icon and the danger ink (data-mode); in the docked tray its label may hide, so the tooltip and
// aria-label keep the name.
export function PermissionPicker({ view, disabled, onPick, size = "sm" }: { view: PermissionPickerView; disabled: boolean; onPick(mode: PermissionModeId): void; size?: "sm" | "xs" }) {
  const trigger = <DropdownMenu.Trigger asChild><button type="button" className="composer-permission doan-button" data-ui-size={size} data-ui-variant="trigger" data-mode={view.mode} aria-label={view.trigger.ariaLabel} disabled={disabled}>
    <PermissionIconView name={view.trigger.icon} /><span className="label">{view.trigger.label}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>;
  return <DropdownMenu.Root>
    {size === "xs" ? <IconTip label={view.trigger.ariaLabel}>{trigger}</IconTip> : trigger}
    <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu permission-popover" data-ui-size="compact" aria-label={view.menuLabel} side="top" align="end" sideOffset={8} collisionPadding={8}>
      <PermissionMenuItems view={view} onPick={onPick} />
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

// The Send slot. While a start is pending it keeps its place with a spinner. While a turn runs the docked composer puts
// Stop or Queue in the same place (composerAction), so the slot never moves.
const SLOT_LABELS: Record<ComposerAction, string> = { send: "Send", stop: "Stop", queue: "Queue" };
// `hint` is why Send is off when no line says so (no ready agent): a native title, since a disabled button gets no
// Radix tooltip, and a description for assistive tech.
// tip and description: the usage limit's reset, in the tooltip and as the button's sr-only description; the name stays
// the slot's label, and no native title shows beside the tooltip.
export function SendButton({ enabled, sending, onSend, action = "send", hint, tip, description }: { enabled: boolean; sending: boolean; onSend(): void; action?: ComposerAction; hint?: string | undefined; tip?: string | undefined; description?: string | undefined }) {
  const label = SLOT_LABELS[action];
  const hintId = useId();
  const described = hint ?? description;
  return <IconTip label={tip ?? label}><button type="button" className={`composer-send doan-icon-button${action === "stop" ? " composer-stop" : ""}${sending ? " sending" : ""}`} data-ui-variant="accent" aria-label={label} aria-busy={sending || undefined} disabled={!enabled} title={hint} aria-describedby={described ? hintId : undefined}
    data-own-description={description && !hint ? "" : undefined} onClick={onSend}>
    {sending ? <span className="doan-spinner" aria-hidden="true" /> : action === "stop" ? <Square fill="currentColor" stroke="none" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
    {described && <span id={hintId} className="sr-only">{described}</span>}</button></IconTip>;
}
