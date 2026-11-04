import { forwardRef, Fragment, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ArrowUp, Check, ChevronDown, Compass, Eye, FilePenLine, FileText, Gauge, Paintbrush, PencilSparkles, Plus, ScanEye, Search, Settings, Shapes, Shield, ShieldAlert, Square, TextAlignStart, TriangleAlert, X } from "lucide-react";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { Anchor } from "../main/conversation/types";
import { pickerAction, pickerFooter, providerShortStatus } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import type { FieldSegment } from "./anchorField";
import { ChipField, type ChipInsert } from "./chipField";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { ComposerAction } from "./composerRules";
import { outsidePresetList } from "./presetOutside";
import type { SettingsTarget } from "./settingsSections";
import {
  attachmentChipView, dropTarget, groupIcon, isSubmitKey, modelPickerView, presetListView, providerLogo,
  type AttachmentDraft, type PresetListReply, type PresetRow, type PresetSummary,
} from "./homeComposer";
import type { PermissionIcon, PermissionPickerView } from "./permissionPicker";

// The composer's shared primitives (buzz-conversation design §3.1): Home's HeroComposer assembles them today and the
// docked composer will. Each draws the markup Home drew before the split, so Home's computed styles and DOM order stay.

const GROUP_ICONS: Record<string, typeof Compass> = { compass: Compass, "scan-eye": ScanEye, paintbrush: Paintbrush, "text-align-start": TextAlignStart, shapes: Shapes, "pencil-sparkles": PencilSparkles };
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

// Files dragged over the composer attach; the window's own drop handling never sees them (buzz-home design §4.8).
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
      // String items (a URL list, say) can sit among the files; only file items line up with `files`.
      const items = Array.from(event.dataTransfer.items ?? []).filter(item => item.kind === "file");
      const target = dropTarget(files.map((_file, i) => ({ isDirectory: !!items[i]?.webkitGetAsEntry?.()?.isDirectory })));
      if (target.notice) options.onNotice(target.notice);
      const chosen = target.files.map(i => files[i]!);
      if (chosen.length) { if (!target.notice) options.onNotice(null); options.onFiles(chosen); }
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
          : <span className="file-icon" aria-hidden="true">{a.status === "checking" ? <span className="doan-spinner" /> : view.problem ? <TriangleAlert /> : <FileText />}</span>}
        <span className="attach-text"><b>{view.label}</b><small>{view.meta}</small></span>
        <button type="button" ref={node => { props.removeButtons.current[index] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={view.removeLabel} disabled={props.disabled} onClick={() => props.onRemove(index)}><X aria-hidden="true" /></button>
      </span>;
      return <Fragment key={a.key}>{view.tooltip ? <Tooltip><TooltipTrigger asChild>{chip}</TooltipTrigger><TooltipContent>{view.tooltip}</TooltipContent></Tooltip> : chip}</Fragment>;
    })}
    {preset && <span className="preset-chip"><GroupIcon name={groupIcon(preset.group)} /><span>{preset.title}</span>
      <button type="button" ref={node => { props.removeButtons.current[attachments.length] = node; }} className="chip-remove doan-icon-button" data-ui-size="xs" aria-label={`Remove preset ${preset.title}`} disabled={props.disabled} onClick={() => props.onRemove(attachments.length)}><X aria-hidden="true" /></button></span>}
  </div>;
}

// The text field: typed text and inline anchor chips (buzz-canvas-conversation design §2 'Chip field'), drawn by
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
  composing(): boolean;
  element(): HTMLElement | null;
}
export const ComposerField = forwardRef<ComposerFieldHandle, {
  value: readonly FieldSegment[]; onChange(value: FieldSegment[]): void; readOnly: boolean; placeholder: string;
  // The draft the value belongs to (draftKey(mode) in the docked composer). A change ends the field's undo history,
  // caret and waiting chips even when the values are equal; the element itself stays, so focus and shape do too.
  draftKey?: string;
  // The canvas the field's chips belong to (its canvas panel sets it); null, the default, takes no chips.
  chipScope?: string | null;
  // The `/` preset list while it is open: the field is its combobox.
  combobox: ComboboxProps | null;
  onKey(event: KeyboardEvent<HTMLDivElement>): boolean; onSubmit(): void;
  // Files are the host's; text the host leaves alone is pasted by the field.
  onPaste(event: ClipboardEvent<HTMLDivElement>): void; onInput?(): void; onAnnounce?(text: string): void;
  // A click on a chip in the field (the caret is already right after it).
  onChipClick?: ((anchor: Anchor, chip: HTMLElement) => void) | undefined;
  // The reason line under the docked card also describes the field (design §3.1).
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
      onChipClick: (anchor, chip) => latest.current.onChipClick?.(anchor, chip),
    }, latest.current.value, latest.current.draftKey);
    field.current = created;
    return () => { created.dispose(); field.current = null; };
  }, []);
  useLayoutEffect(() => { field.current?.setValue(props.value, props.draftKey); }, [props.value, props.draftKey]);
  useImperativeHandle(ref, () => ({
    focus: caret => field.current?.focus(caret === "end"),
    caretAtStart: () => field.current?.caretAtStart() ?? true,
    insertChip: anchor => field.current?.insertChip(anchor) ?? "refused",
    composing: () => field.current?.composing() ?? false,
    element: () => node.current,
  }), []);
  return <div ref={node} className="composer-input" aria-label="Message" tabIndex={0} contentEditable={!props.readOnly} suppressContentEditableWarning
    aria-readonly={props.readOnly || undefined} aria-placeholder={props.placeholder} aria-describedby={props.describedBy}
    role={combobox ? "combobox" : "textbox"} aria-multiline={combobox ? undefined : true} aria-expanded={combobox ? true : undefined} aria-controls={combobox ? combobox.listId : undefined}
    aria-autocomplete={combobox ? "list" : undefined} aria-activedescendant={combobox?.activeId}
    onKeyDown={event => {
      if (props.onKey(event)) return;
      if (isSubmitKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) { event.preventDefault(); props.onSubmit(); }
    }}
    onPaste={event => { props.onPaste(event); if (!event.defaultPrevented) field.current?.paste(event.nativeEvent); }} />;
});

export function ComposerTools({ children }: { children: ReactNode }) {
  return <div className="composer-tools">{children}</div>;
}

// `tray`: the docked composer's Attach, outside the card and first in the tray, at the tray's xs size.
export function AttachButton({ disabled, onClick, tray = false }: { disabled: boolean; onClick(): void; tray?: boolean }) {
  return <IconTip label="Attach files"><button type="button" className={tray ? "doan-icon-button composer-attach" : "doan-icon-button"} data-ui-size={tray ? "xs" : undefined} aria-label="Attach files" disabled={disabled} onClick={onClick}><Plus aria-hidden="true" /></button></IconTip>;
}

// Group tabs are one Tab stop; ←/→ move between them (buzz-home design §4.4).
export function tabKey(keys: readonly string[], current: string, key: string): string | null {
  const at = keys.indexOf(current);
  if (at === -1 || (key !== "ArrowLeft" && key !== "ArrowRight")) return null;
  return keys[(at + (key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length] ?? null;
}

type PresetView = ReturnType<typeof presetListView>;
interface PresetBodyOptions { listId: string; highlight: number; onHighlight?(index: number): void; onChoose(id: string): void; onRetry(): void; onTab?(key: string): void }
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
    onMouseDown={slash ? event => event.preventDefault() : undefined} onPointerMove={slash ? () => options.onHighlight?.(index) : pointerFocus} onClick={() => options.onChoose(row.id)}
    onKeyDown={slash ? undefined : event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); focusRow(Math.max(0, Math.min(options.rows - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.onChoose(row.id); }
    }}>
    {/* A card: the preset's name over its one-line description (dogfooding); the full text stays in the tooltip. */}
    <span className="preset-text"><span className="preset-title">{row.title}</span>{row.description && <span className="preset-desc">{row.description}</span>}</span>
  </div>;
}
export function presetBody(view: PresetView, slash: boolean, options: PresetBodyOptions): ReactNode {
  if (view.kind === "loading") return <div className="popover-state" role="status"><span className="doan-spinner" aria-hidden="true" />{view.text}</div>;
  if (view.kind === "empty") return <div className="popover-state" role="status">{view.text}</div>;
  // The popover is 90% glass over Home's gradient, not plain opaque white, so its notices take the panel surface.
  if (view.kind === "olderCli") return <div className="doan-notice doan-panel" role="status"><AlertIcon /><span className="grow-text">{view.text}</span></div>;
  if (view.kind === "error") return <><div className="doan-notice error doan-panel" role="alert"><AlertIcon /><span className="grow-text">{view.text}</span></div>{view.retry && <div className="popover-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" onClick={options.onRetry}>Retry</button></div>}</>;
  const rows = view.sections.reduce((n, section) => n + section.rows.length, 0);
  let index = 0;
  return <>
    {view.tabs.length > 0 && <div className="group-tabs shell-modes" role="tablist" aria-label="Preset groups">{view.tabs.map(item => <button key={item.key} type="button" role="tab" className={item.selected ? "current" : ""} aria-selected={item.selected} tabIndex={item.selected ? 0 : -1}
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
      {view.sections.map(section => <Fragment key={section.title ?? "results"}>{section.title && !slash && <div className="doan-menu-head">{section.title}</div>}{section.rows.map(row => <PresetOption key={row.id} row={row} index={index++} slash={slash} options={{ ...options, rows }} />)}</Fragment>)}
    </div>
  </>;
}
function SearchField({ value, slash, listId, onChange }: { value: string; slash: boolean; listId: string; onChange?(value: string): void }) {
  return <label className="popover-search"><Search aria-hidden="true" /><input className="doan-input" data-ui-size="sm" placeholder="Search presets" aria-label="Search presets" value={value}
    readOnly={slash} tabIndex={slash ? -1 : undefined} aria-hidden={slash || undefined}
    onChange={slash ? undefined : event => onChange?.(event.target.value)}
    onKeyDown={slash ? undefined : event => { if (event.key === "ArrowDown") { event.preventDefault(); document.getElementById(`${listId}-p-0`)?.focus(); } }} /></label>;
}

// A press in the canvas iframe never reaches the app's document (an out-of-process frame); the canvas posts a press
// message instead, and the canvas page hands it to the preset lists: subscribe with a listener, get the unsubscribe.
export type CanvasPress = (listener: () => void) => () => void;

// The Presets button and its popover (buzz-home design §4.4). Picking a preset closes the popover and hands focus to
// the field through `onPicked`; a list that failed is read again when the popover opens. A press outside it in the
// app's document closes it by Radix's own rule; a press in the canvas closes it through `canvasPress`.
export function PresetsButton(props: {
  reply: PresetListReply | undefined; project: string; suggested: readonly PresetSummary[]; listId: string; disabled: boolean;
  onOpen(): void; onChoose(id: string): void; onRetry(): void; onPicked(): void; canvasPress?: CanvasPress | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string | null>(null);
  const picked = useRef(false);
  // Radix returns focus to the trigger after a close it did not see as an outside press; a canvas press put focus in
  // the canvas, so it stays there.
  const pressed = useRef(false);
  const { canvasPress } = props;
  useEffect(() => {
    if (!open || !canvasPress) return;
    return canvasPress(() => { pressed.current = true; setOpen(false); });
  }, [open, canvasPress]);
  const view = presetListView(props.reply, { project: props.project, suggested: props.suggested, query, tab });
  const choose = (id: string) => { picked.current = true; setOpen(false); props.onChoose(id); };
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) { pressed.current = false; setQuery(""); props.onOpen(); } }}>
    <IconTip label="Design presets"><Popover.Trigger asChild><button type="button" className="doan-icon-button composer-presets" aria-label="Design presets" disabled={props.disabled}><PencilSparkles aria-hidden="true" /></button></Popover.Trigger></IconTip>
    <Popover.Portal><Popover.Content className="doan-floating preset-popover" aria-label="Design presets" side="top" align="start" sideOffset={8} collisionPadding={8}
      onCloseAutoFocus={event => {
        if (picked.current) { picked.current = false; event.preventDefault(); props.onPicked(); }
        else if (pressed.current) { pressed.current = false; event.preventDefault(); }
      }}>
      <SearchField value={query} slash={false} listId={props.listId} onChange={setQuery} />
      {presetBody(view, false, { listId: props.listId, highlight: 0, onChoose: choose, onRetry: props.onRetry, onTab: setTab })}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

// The `/` list keeps focus in the field, so it is drawn in place rather than as a focus-taking popover.
// The pointer moves the one highlight the arrow keys move, as in a Radix menu.
export function SlashPresets(props: { view: PresetView; query: string; listId: string; highlight: number; listRef?: RefObject<HTMLDivElement | null>; onHighlight(index: number): void; onChoose(id: string): void; onRetry(): void }) {
  return <div className="doan-floating preset-popover slash-popover" role="presentation" ref={props.listRef}>
    <SearchField value={props.query} slash listId={props.listId} />
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
// The agent and model picker (buzz-settings design '홈 공급자 선택기'): a group per provider, its fix in Settings when it
// cannot run. `onPick` gets the provider and a model id or "default".
// `size`: Home's tools row uses sm; the docked row under the card steps down to xs (design §0).
export function AgentPicker(props: {
  picker: Picker; auth: AuthSnapshot | null | undefined; disabled: boolean; size?: "sm" | "xs";
  onOpen(): void; onPick(provider: Provider, value: string): void; onSettings(target: SettingsTarget): void;
}) {
  const { picker, auth } = props;
  const footer = pickerFooter(picker.groups.some(group => group.selectable));
  return <DropdownMenu.Root onOpenChange={open => { if (open) props.onOpen(); }}>
    <DropdownMenu.Trigger asChild><button type="button" className="composer-agent doan-button" data-ui-size={props.size ?? "sm"} data-ui-variant="trigger" aria-label={picker.trigger.ariaLabel} disabled={props.disabled}>
      {picker.trigger.provider ? <><img className="logo" src={providerLogo(picker.trigger.provider)} alt="" /><span className="label">{picker.trigger.label}</span></> : <span className="muted">{picker.trigger.label}</span>}<ChevronDown className="chev" aria-hidden="true" />
    </button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu agent-popover" aria-label="Agent and model" side="top" align="end" sideOffset={8} collisionPadding={8}>
      {picker.groups.map((group, index) => {
        const status = auth?.providers.find(item => item.provider === group.provider);
        const short = status ? providerShortStatus(status) : null;
        const fix = !group.selectable && status ? pickerAction(status) : null;
        const selected = group.rows.find(row => row.selected);
        // A group that cannot run says why in its head and offers its fix in Settings below it.
        const note = group.note ?? (group.selectable ? null : short);
        return <Fragment key={group.provider}>{index > 0 && <DropdownMenu.Separator className="doan-menu-sep" />}<div className="agent-group">
          <DropdownMenu.Label className="doan-menu-head agent-head"><img className="logo" src={providerLogo(group.provider)} alt="" /><span>{group.name}</span>
            {note && <span className="agent-note">{note === "Loading models" && <span className="doan-spinner" aria-hidden="true" />}{note}</span>}</DropdownMenu.Label>
          {group.selectable ? <DropdownMenu.RadioGroup value={!selected ? "" : selected.kind === "model" ? selected.id : "default"} onValueChange={value => props.onPick(group.provider, value)}>
            {group.rows.map(row => <DropdownMenu.RadioItem key={row.kind === "model" ? row.id : "default"} value={row.kind === "model" ? row.id : "default"} className="doan-menu-item model-item">
              <span className="model-name">{row.label}</span>{row.kind === "model" && row.effort && <span className="sub"><Gauge className="inline" aria-hidden="true" />Effort</span>}
              <span className="check-slot">{row.selected && <Check className="check" aria-hidden="true" />}</span>
            </DropdownMenu.RadioItem>)}
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
// its name in a tooltip there.
export function EffortPicker({ view, effort, disabled, onPick, size = "sm" }: { view: NonNullable<Picker["effort"]>; effort: string | null; disabled: boolean; onPick(value: string): void; size?: "sm" | "xs" }) {
  const trigger = <DropdownMenu.Trigger asChild><button type="button" className="composer-effort doan-button" data-ui-size={size} data-ui-variant="trigger" aria-label={view.ariaLabel} disabled={disabled}><Gauge aria-hidden="true" /><span className="label">{view.label}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>;
  return <DropdownMenu.Root>
    {size === "xs" ? <IconTip label={view.ariaLabel}>{trigger}</IconTip> : trigger}
    <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu effort-popover" data-ui-size="compact" aria-label={view.menuLabel} side="top" align="end" sideOffset={8} collisionPadding={8}>
      <DropdownMenu.Label className="doan-menu-head">{view.title}</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={effort ?? ""} onValueChange={onPick}>
        {view.options.map(item => <DropdownMenu.RadioItem key={item.id} value={item.id} className="doan-menu-item"><span className="model-name">{item.label}</span><span className="check-slot">{item.selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
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

// The permission mode picker (permission-mode spec decisions 1, 2, 5), after Effort. Full access keeps its name, its
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
export function SendButton({ enabled, sending, onSend, action = "send", hint }: { enabled: boolean; sending: boolean; onSend(): void; action?: ComposerAction; hint?: string | undefined }) {
  const label = SLOT_LABELS[action];
  const hintId = useId();
  return <IconTip label={label}><button type="button" className={`composer-send doan-icon-button${action === "stop" ? " composer-stop" : ""}${sending ? " sending" : ""}`} data-ui-variant="accent" aria-label={label} aria-busy={sending || undefined} disabled={!enabled} title={hint} aria-describedby={hint ? hintId : undefined} onClick={onSend}>
    {sending ? <span className="doan-spinner" aria-hidden="true" /> : action === "stop" ? <Square fill="currentColor" stroke="none" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
    {hint && <span id={hintId} className="sr-only">{hint}</span>}</button></IconTip>;
}
