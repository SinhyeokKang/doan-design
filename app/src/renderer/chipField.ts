import { closeHistory, history, redo, undo } from "prosemirror-history";
import type { Node as PMNode } from "prosemirror-model";
import { EditorState, Plugin, TextSelection, type Transaction } from "prosemirror-state";
import { DecorationSet, EditorView } from "prosemirror-view";
import { canvasKind } from "../formats/canvasPath";
import { chipLabel, LIMITS } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";
import {
  chipAt, distinctTargets, hardLine, isLineStart, normalize, plainText, readFieldClipboard, sameSegments, sliceUnits, spliceUnits, unitLength,
  writeFieldClipboard, type FieldSegment,
} from "./anchorField";
import { continueList, fieldListItems, indentItem, removeMarker, type FieldEdit } from "./composerLists";
import { fieldDecorations, type Measure } from "./fieldDecorations";
import { docFromSegments, FILLER, fieldSchema, fixFillers, posFromUnit, segmentsFromDoc, sliceFromSegments, unitFromPos } from "./fieldDoc";
import { fieldRuns, fieldSkillRuns, insertSkillText, replaceSlashSkill, sameSkillNames, skillAnnouncements } from "./skillWords";

// The composer field on ProseMirror (ARCHITECTURE §7 'Chip field'). The caret never rests inside a list item's depth
// spaces or marker; edits the field decides itself are transactions built from the segments (`edit`).

// Chromium keeps custom DataTransfer types in its own pasteboard entry, so they travel between Doan fields (also across
// windows) while every other app sees only text/plain.
export const CLIPBOARD_TYPE = "application/x-doan-field+json";
const TYPING_MERGE_MS = 1000;

export type ChipInsert = "inserted" | "pending" | "limit" | "refused";
export interface ChipFieldHooks {
  // Every change, the live text during a composition included, so the host's shape follows it.
  onChange(segments: FieldSegment[]): void;
  onInput(): void;
  onAnnounce(text: string): void;
  // null takes no chips, so a chip clipboard pastes as the chips' names.
  scope(): string | null;
  skillNames?(): ReadonlySet<string>;
  // Highlighted only as the field's first word.
  commandNames?(): ReadonlySet<string>;
  // The place limit counts them with the field's own.
  reserved?(): readonly FieldSegment[];
  // The chip's attributes are not read back, so a describing id the host puts on it changes no segment.
  onChipClick?(anchor: Anchor, chip: HTMLElement): void;
}

interface Selection { anchor: number; focus: number }
type Press = { kind: "break" } | { kind: "indent"; dir: 1 | -1 };

// lucide Frame, SquareMousePointer and MapPin.
const SVG = "http://www.w3.org/2000/svg";
// canvas and ds are the sidebar rows' icons (lucide panels-top-left, swatch-book).
const ICONS: Record<"frame" | "element" | "point" | "canvas" | "ds", [string, Record<string, string>][]> = {
  frame: [["line", { x1: "22", x2: "2", y1: "6", y2: "6" }], ["line", { x1: "22", x2: "2", y1: "18", y2: "18" }], ["line", { x1: "6", x2: "6", y1: "2", y2: "22" }], ["line", { x1: "18", x2: "18", y1: "2", y2: "22" }]],
  element: [["path", { d: "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" }], ["path", { d: "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" }]],
  point: [["path", { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" }], ["circle", { cx: "12", cy: "10", r: "3" }]],
  canvas: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M3 9h18" }], ["path", { d: "M9 21V9" }]],
  ds: [["path", { d: "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z" }], ["path", { d: "M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7" }], ["path", { d: "M 7 17h.01" }], ["path", { d: "m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8" }]],
};
const KIND_PREFIX = { frame: "Frame", element: "Element", point: "Point", canvas: "Canvas" } as const;

// The field on each element, so focusFieldEnd, whose host holds only the element, goes through it.
const fields = new WeakMap<HTMLElement, ChipField>();

export class ChipField {
  private readonly view: EditorView;
  private names: ReadonlySet<string> = new Set();
  private announced: string[] = [];
  private pending: Anchor[] = [];
  // The Shift+Enter or Tab that ended a composition, until that key comes again as an ordinary key.
  private press: Press | null = null;
  private compositionTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private pointer = false;
  private draft: string | undefined;
  // The caret moved since the last change, or the last one was the field's own edit, which typing must not join.
  private moved = false;
  private composingAtItem = false;
  private closeNext = false;
  private readonly widths = new Map<string, number>();
  private ruler: HTMLElement | null = null;
  private drawn: { doc: PMNode; names: ReadonlySet<string>; widths: number; set: DecorationSet } | null = null;
  private widthsVersion = 0;
  private cache: { doc: PMNode; segments: FieldSegment[] } | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly el: HTMLElement, private readonly hooks: ChipFieldHooks, initial: readonly FieldSegment[], draft?: string) {
    this.draft = draft;
    this.names = this.highlightNames();
    const segments = normalize(initial);
    this.view = new EditorView({ mount: el }, {
      state: this.createState(segments),
      // The host owns contenteditable; the observer below keeps the view in step with it.
      editable: () => el.getAttribute("contenteditable") !== "false",
      nodeViews: { chip: node => ({ dom: chipNode(node.attrs.anchor as Anchor), ignoreMutation: () => true }) },
      decorations: state => this.decorations(state.doc),
      dispatchTransaction: tr => this.dispatch(tr),
      handleKeyDown: (_view, event) => this.onKey(event),
      handleDOMEvents: {
        keydown: (_view, event) => this.onKeyDownFirst(event),
        beforeinput: (_view, event) => this.onBeforeInput(event as InputEvent),
        compositionstart: () => { this.openItemLineStart(); return false; },
        compositionend: () => { this.onCompositionEnd(); return false; },
        copy: (_view, event) => this.onCopy(event, false),
        cut: (_view, event) => this.onCopy(event, true),
        // ComposerField hands paste to the host first and then to paste() below; ProseMirror's own would run before both.
        paste: () => true,
        // Dragging text or a chip out, or dropping into the field, would bypass the segments.
        dragstart: (_view, event) => { event.preventDefault(); return true; },
        drop: (_view, event) => { event.preventDefault(); return true; },
        pointerdown: () => { this.pointer = true; return false; },
        // A keyboard or code focus puts the caret back where it was; a click places its own caret.
        focus: view => { if (!this.pointer) view.focus(); this.pointer = false; return false; },
        blur: () => { this.pointer = false; return false; },
      },
      handleClickOn: (view, _pos, node, nodePos) => this.onChipClick(view, node, nodePos),
      handleTripleClick: (_view, pos) => this.selectLine(pos),
      // Only the field scrolls: the composers cap its height and let it scroll inside its card.
      handleScrollToSelection: () => { this.revealCaret(); return true; },
    });
    fields.set(el, this);
    // main's Edit > Undo and Redo look for this mark on the focused element (app/src/main/index.ts editHistory).
    el.setAttribute("data-chip-field", "");
    const editable = new MutationObserver(() => { if (!this.disposed) this.view.updateState(this.view.state); });
    editable.observe(el, { attributes: true, attributeFilter: ["contenteditable"] });
    this.cleanups.push(() => editable.disconnect());
    const input = () => this.hooks.onInput();
    el.addEventListener("input", input);
    this.cleanups.push(() => el.removeEventListener("input", input));
    // Marker widths are measured in the field's font; a web font that arrives later changes them.
    const fonts = el.ownerDocument.fonts as FontFaceSet | undefined;
    const loaded = () => { this.widths.clear(); this.widthsVersion++; if (!this.disposed) this.view.updateState(this.view.state); };
    fonts?.addEventListener("loadingdone", loaded);
    this.cleanups.push(() => fonts?.removeEventListener("loadingdone", loaded));
    this.markEmpty();
    this.announceSkills(false);
  }

  // The deferred run after compositionend must not reach the host's draft once the field is gone.
  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanups) cleanup();
    this.press = null;
    clearTimeout(this.compositionTimer);
    this.ruler?.remove();
    fields.delete(this.el);
    // destroy() removes the contenteditable ProseMirror wrote: a field created again on the same element (StrictMode)
    // would read a locked field as editable.
    const editable = this.el.getAttribute("contenteditable");
    this.view.destroy();
    if (editable !== null) this.el.setAttribute("contenteditable", editable);
    this.el.removeAttribute("data-chip-field");
  }

  composing(): boolean { return this.view.composing; }

  get segments(): FieldSegment[] {
    const doc = this.view.state.doc;
    if (this.cache?.doc !== doc) this.cache = { doc, segments: segmentsFromDoc(doc) };
    return this.cache.segments;
  }

  // A filler only before a line-start chip, and a caret never before one.
  private readonly fillers = new Plugin({
    appendTransaction: (_trs, _old, state) => {
      if (this.view.composing || this.composingAtItem) return null;
      const tr = state.tr;
      fixFillers(tr);
      const { anchor, head } = tr.selection, past = (pos: number) => posFromUnit(tr.doc, unitFromPos(tr.doc, pos));
      if (past(anchor) !== anchor || past(head) !== head) tr.setSelection(TextSelection.create(tr.doc, past(anchor), past(head)));
      return tr.docChanged || tr.selectionSet ? tr : null;
    },
  });

  private createState(segments: readonly FieldSegment[]): EditorState {
    const doc = docFromSegments(segments);
    const end = TextSelection.create(doc, posFromUnit(doc, unitLength(segments)));
    return EditorState.create({ doc, selection: end, plugins: [history({ newGroupDelay: TYPING_MERGE_MS }), this.fillers] });
  }

  // Another draft ends this one's history, caret and waiting chips even with equal content, so ⌘Z never brings back the
  // previous draft. Within one draft, equal content is the field's own change coming back.
  setValue(value: readonly FieldSegment[], draft?: string): void {
    if (draft !== this.draft) {
      this.draft = draft;
      if (this.view.composing) this.endComposition();
      this.reset(normalize(value));
      return;
    }
    const names = this.highlightNames();
    const changedNames = !sameSkillNames(this.names, names);
    this.names = new Set(names);
    if (changedNames) { this.announceSkills(false); if (!this.disposed) this.view.updateState(this.view.state); }
    if (this.view.composing || sameSegments(value, this.segments)) return;
    this.reset(normalize(value));
  }

  // A blur makes Chromium finish the composition in the old DOM and drop it from the input method, so no late commit
  // lands in the next draft.
  private endComposition(): void {
    if (document.activeElement !== this.el) return;
    this.el.blur();
    this.el.focus({ preventScroll: true });
  }

  private reset(segments: FieldSegment[]): void {
    this.names = this.highlightNames();
    this.pending = [];
    this.press = null;
    this.moved = false;
    this.closeNext = false;
    this.composingAtItem = false;
    this.view.updateState(this.createState(segments));
    this.markEmpty();
    this.announceSkills(false);
  }

  // "limit": more than LIMITS.anchors places; "refused": this field takes no chips.
  insertChip(anchor: Anchor): ChipInsert {
    if (this.hooks.scope() === null) return "refused";
    // Counted on the result of replacing the selection, so a chip may replace chips in a full field; a waiting chip is
    // counted again where it lands (flushPending calls back here).
    const [start, end] = ordered(this.readSelection());
    const waiting = this.pending.map(a => ({ kind: "chip" as const, anchor: a }));
    const { segments: after } = spliceUnits(this.segments, start, end, [...waiting, { kind: "chip", anchor }]);
    if (distinctTargets([...this.reservedChips(), ...after]) > LIMITS.anchors) return "limit";
    if (this.composing()) { this.pending.push(anchor); return "pending"; }
    this.replace(start, end, [{ kind: "chip", anchor }], "own");
    this.hooks.onAnnounce(`Added ${chipLabel(anchor).label}`);
    return "inserted";
  }

  // A command is marked apart, since a skill of its name differs.
  private highlightNames(): Set<string> {
    return new Set([...this.hooks.skillNames?.() ?? [], ...[...this.hooks.commandNames?.() ?? []].map(name => `\0${name}`)]);
  }

  private reservedChips(): readonly FieldSegment[] { return this.hooks.reserved?.() ?? []; }

  // One undo step of its own, the caret after it.
  insertText(text: string): void {
    if (this.composing() || this.readOnly()) return;
    const [start, end] = ordered(this.readSelection());
    this.replace(start, end, normalize([{ kind: "text", text }]), "own");
  }

  insertSkill(name: string, fromSlash = false): void {
    if (this.composing() || this.readOnly()) return;
    if (fromSlash) { this.edit(replaceSlashSkill(name), "own"); return; }
    this.edit(insertSkillText(this.segments, this.readSelection().focus, name), "own");
  }

  private announceSkills(announce = true): void {
    const next = fieldSkillRuns(this.segments, this.hooks.skillNames?.() ?? new Set()).map(run => run.name);
    const messages = skillAnnouncements(this.announced, next);
    this.announced = next;
    if (announce && messages.length) this.hooks.onAnnounce(messages.join(". "));
  }

  // false when the caret is not on an item that can move, so the key moves focus. A Tab that ends a composition only
  // keeps focus: the move comes with the same key sent again (onCompositionEnd).
  indent(dir: 1 | -1): boolean {
    if (this.readOnly()) return false;
    if (this.composing()) { this.press = { kind: "indent", dir }; return true; }
    this.press = null;
    return this.moveItem(dir);
  }

  private moveItem(dir: 1 | -1): boolean {
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus) return false;
    const edit = indentItem(this.segments, focus, dir);
    if (!edit) return false;
    this.edit(edit, "own");
    return true;
  }

  caretAtStart(): boolean {
    const { anchor, focus } = this.readSelection();
    return anchor === 0 && focus === 0;
  }

  // An unfocused field shows its old caret as it takes focus and only then gets the new one, so the reveal comes last.
  focus(caretAtEnd: boolean): void {
    if (caretAtEnd) { const end = unitLength(this.segments); this.placeCaret({ anchor: end, focus: end }); }
    this.pointer = false;
    // ProseMirror's focus() does nothing while the field is read-only, and the host focuses it right after a send.
    if (document.activeElement !== this.el) this.el.focus();
    this.view.focus();
    if (caretAtEnd) this.revealCaret();
  }

  private dispatch(tr: Transaction): void {
    const before = this.view.state;
    // A filler put in for a composition changes no unit: no undo step, no caret move, nothing for the host.
    if (tr.getMeta(FILLER_ONLY)) { this.view.updateState(before.apply(tr)); return; }
    const ours = tr.getMeta(OWN) as string | undefined;
    if (tr.docChanged) {
      // Typing within a second merges into one step, as in a textarea; the field ends a group where the caret moved or
      // after an edit of its own.
      if (ours !== "undo" && (this.moved || this.closeNext || ours === "own")) closeHistory(tr);
      this.moved = false;
      this.closeNext = ours === "own" || ours === "undo";
    } else if (tr.selectionSet && !tr.selection.eq(before.selection)) {
      this.moved = true;
      this.leavePrefix(tr);
    }
    const next = before.apply(tr);
    this.view.updateState(next);
    // The filler fix appended to a transaction can change the document by itself (after a composition).
    if (next.doc === before.doc) return;
    this.markEmpty();
    if (!this.composing()) this.announceSkills();
    this.hooks.onChange(this.segments);
  }

  // A caret inside an item's depth spaces or marker would join the next typed character to the marker.
  private leavePrefix(tr: Transaction): void {
    if (!tr.selection.empty || this.composing()) return;
    const unit = unitFromPos(tr.doc, tr.selection.head);
    const item = fieldListItems(segmentsFromDoc(tr.doc)).find(entry => unit > entry.start && unit < entry.start + entry.body);
    if (item) tr.setSelection(TextSelection.create(tr.doc, posFromUnit(tr.doc, item.start + item.body)));
  }

  // "own" is an undo step of its own; "typing" joins the typing around it, as a browser edit would.
  private edit(edit: FieldEdit, kind: "own" | "typing"): void {
    const state = this.view.state, next = docFromSegments(edit.segments);
    const tr = state.tr;
    const start = state.doc.content.findDiffStart(next.content);
    if (start !== null) {
      const ends = state.doc.content.findDiffEnd(next.content)!;
      let { a: endA, b: endB } = ends;
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) { endA += overlap; endB += overlap; }
      tr.replace(start, endA, next.slice(start, endB));
    }
    const caret = posFromUnit(tr.doc, edit.caret);
    tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
    if (kind === "own") tr.setMeta(OWN, "own");
    if (!tr.docChanged && kind === "own") this.closeNext = true;
    this.view.dispatch(tr);
  }

  // In place, so the change stays where typing was and its undo step can join it.
  private replace(start: number, end: number, inserted: readonly FieldSegment[], kind: "own" | "typing"): void {
    const doc = this.view.state.doc;
    const tr = this.view.state.tr.replace(posFromUnit(doc, start), posFromUnit(doc, end), sliceFromSegments(inserted));
    tr.setSelection(TextSelection.create(tr.doc, posFromUnit(tr.doc, start + unitLength(inserted)))).scrollIntoView();
    if (kind === "own") tr.setMeta(OWN, "own");
    this.view.dispatch(tr);
  }

  private undoRedo(back: boolean): void {
    if (this.composing() || this.readOnly()) return;
    (back ? undo : redo)(this.view.state, tr => this.view.dispatch(tr.setMeta(OWN, "undo")));
  }

  private readOnly(): boolean { return !this.el.isContentEditable; }

  // Keys acting on the text wait for onKey, which runs once ProseMirror has read the DOM.
  private onKeyDownFirst(event: KeyboardEvent): boolean {
    const composing = event.isComposing || event.keyCode === 229 || this.composing();
    if (composing) {
      if (event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) this.press = { kind: "break" };
      return false;
    }
    // Whoever takes the key, the press is answered and the deferred run must not act on it too.
    if (this.press && event.key === (this.press.kind === "break" ? "Enter" : "Tab")) this.press = null;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "z" && this.readOnly()) { event.preventDefault(); return true; }
    // Past ProseMirror, which would prevent them, to the host's onKey; a key the host leaves alone breaks the line in
    // onBeforeInput. readDom first, so a Shift+Enter that ended a composition finds the syllable read.
    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) { this.readDom(); return true; }
    return event.key === "Escape";
  }

  // macOS sends the ending key right after compositionend, before ProseMirror's MutationObserver read. The observer is
  // not public API; the field pins prosemirror-view's exact version.
  private readDom(): void {
    (this.view as unknown as { domObserver: { forceFlush(always: boolean): void } }).domObserver.forceFlush(true);
  }

  private onKey(event: KeyboardEvent): boolean {
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "z") { this.undoRedo(!event.shiftKey); return true; }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && plain) return this.lineStartChip(event.key === "ArrowLeft", event.shiftKey) || this.prefixArrow(event.key === "ArrowLeft", event.shiftKey);
    if (event.key === "ArrowRight" && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) return this.nextLineStop();
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (event.key === "Backspace" || (ctrl && event.key === "h")) return this.deleteKey(true, event.metaKey ? "line" : event.altKey ? "word" : "char");
    if (event.key === "Delete" || (ctrl && event.key === "d")) return this.deleteKey(false, event.metaKey ? "line" : event.altKey ? "word" : "char");
    return false;
  }

  // Chromium's own step would stop before the filler, which is the same place.
  private lineStartChip(backward: boolean, extend: boolean): boolean {
    const { anchor, focus } = this.readSelection();
    if (!backward || (anchor !== focus && !extend) || focus === 0 || !chipAt(this.segments, focus) || !isLineStart(this.segments, focus)) return false;
    this.placeCaret({ anchor: extend ? anchor : focus - 1, focus: focus - 1 });
    return true;
  }

  // Chromium would step through the unpainted prefix characters.
  private prefixArrow(backward: boolean, extend: boolean): boolean {
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus && !extend) return false;
    const item = fieldListItems(this.segments).find(entry => backward
      ? focus > entry.start && focus <= entry.start + entry.body
      : focus >= entry.start && focus < entry.start + entry.body);
    if (!item) return false;
    const next = backward ? item.start : item.start + item.body;
    this.placeCaret({ anchor: extend ? anchor : next, focus: next });
    return true;
  }

  // Chromium would run on to the end of the next line's first word.
  private nextLineStop(): boolean {
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus) return false;
    const [, end] = hardLine(this.segments, focus, focus);
    if (focus !== end || end >= unitLength(this.segments)) return false;
    const item = fieldListItems(this.segments).find(entry => entry.start === end + 1);
    const next = item ? item.start + item.body : end + 1;
    this.placeCaret({ anchor: next, focus: next });
    return true;
  }

  // Only where the browser cannot delete in place (ProseMirror would prevent it or delete a chip on its own); elsewhere
  // the browser deletes, so a surrogate pair or a grapheme is never split.
  private deleteKey(backward: boolean, reach: "char" | "word" | "line"): boolean {
    if (this.readOnly()) return false;
    const [start, end] = ordered(this.readSelection());
    if (start !== end) {
      const chip = this.hasChip(start, end);
      if (!chip && end <= hardLine(this.segments, start, start)[1]) return false;
      this.replace(start, end, [], chip ? "own" : "typing");
      return true;
    }
    if (backward && reach === "char") {
      const edit = removeMarker(this.segments, start);
      if (edit) { this.edit(edit, "own"); return true; }
    }
    const [from, to] = hardLine(this.segments, start, start);
    if (backward ? start === from && start > 0 : start === to && start < unitLength(this.segments)) {
      this.replace(backward ? start - 1 : start, backward ? start : start + 1, [], "typing");
      return true;
    }
    if (reach === "line") {
      const [a, b] = this.lineRange(start, true, backward);
      this.replace(a, b, [], this.hasChip(a, b) ? "own" : "typing");
      return true;
    }
    // A chip is a word of its own: ⌥⌫ next to one takes only the chip, as a plain ⌫ does.
    const unit = backward ? start - 1 : start;
    if (chipAt(this.segments, unit)) { this.replace(unit, unit + 1, [], "own"); return true; }
    return false;
  }

  private hasChip(start: number, end: number): boolean { return sliceUnits(this.segments, start, end).some(segment => segment.kind === "chip"); }

  private onBeforeInput(event: InputEvent): boolean {
    const type = event.inputType;
    // Menu Undo and Redo arrive here rather than as keys (main sends them while the field is focused).
    if (type === "historyUndo" || type === "historyRedo") { event.preventDefault(); this.undoRedo(type === "historyUndo"); return true; }
    const composing = this.composing();
    // No model edit during a composition (macOS sends none here; an input method that did would get it after the end).
    if (type === "insertLineBreak" && composing) { event.preventDefault(); this.press = { kind: "break" }; return true; }
    if (composing || type.startsWith("insertComposition")) return false;
    if (type.startsWith("format")) { event.preventDefault(); return true; }
    if (type === "insertParagraph" || type === "insertLineBreak") { event.preventDefault(); if (type === "insertLineBreak") this.press = null; this.lineBreak(); return true; }
    // Paste and cut go through their clipboard events; a drag would move text past the segments.
    if (type.startsWith("insertFrom") || type === "deleteByDrag" || type === "deleteByCut") { event.preventDefault(); return true; }
    const [start, end] = ordered(this.readSelection());
    // The browser would rebuild the lines' blocks itself.
    if (type === "insertText" || type === "insertReplacementText") {
      const range = type === "insertReplacementText" ? this.targetRange(event) ?? [start, end] : [start, end] as const;
      const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
      if (type === "insertText" && (range[0] === range[1] || (range[1] <= hardLine(this.segments, range[0], range[0])[1] && !this.hasChip(range[0], range[1])))) return false;
      event.preventDefault();
      this.replace(range[0], range[1], normalize([{ kind: "text", text }]), this.hasChip(range[0], range[1]) ? "own" : "typing");
      return true;
    }
    if (!type.startsWith("delete")) return false;
    // A deletion with no key (dictation, assistive technology) arrives only here.
    if (type === "deleteContentBackward" && start === end) {
      const edit = removeMarker(this.segments, start);
      if (edit) { event.preventDefault(); this.edit(edit, "own"); return true; }
    }
    const range = this.deletion(type, event, start, end);
    if (!range) return false;
    event.preventDefault();
    if (range[0] < range[1]) this.replace(range[0], range[1], [], this.hasChip(range[0], range[1]) ? "own" : "typing");
    return true;
  }

  private targetRange(event: InputEvent): [number, number] | null {
    const target = event.getTargetRanges()[0];
    if (!target) return null;
    const doc = this.view.state.doc;
    return ordered({ anchor: unitFromPos(doc, this.view.posAtDOM(target.startContainer, target.startOffset)), focus: unitFromPos(doc, this.view.posAtDOM(target.endContainer, target.endOffset)) });
  }

  // null leaves it to the browser. A chip in the browser's range is deleted whole and a word deletion stops at one.
  private deletion(type: string, event: InputEvent, start: number, end: number): [number, number] | null {
    const line = /^delete(Soft|Hard)Line(Backward|Forward)$/.exec(type);
    if (line) return start !== end ? [start, end] : this.lineRange(start, line[1] === "Soft", line[2] === "Backward");
    const native = this.targetRange(event);
    if (!native) return null;
    // A browser range that crosses a line break is the field's: the line's block would be rebuilt by the browser.
    const [from, to] = type.startsWith("deleteWord") && start === end ? this.stopAtChips(type, native, start) : native;
    const crosses = to > hardLine(this.segments, from, from)[1];
    return this.hasChip(from, to) || crosses || from !== native[0] || to !== native[1] ? [from, to] : null;
  }

  // A soft line is the line as drawn. At the very start (or end) of a line it takes the line break, as macOS does.
  private lineRange(caret: number, soft: boolean, backward: boolean): [number, number] {
    const [from, to] = hardLine(this.segments, caret, caret);
    if (backward) {
      if (caret === from) return [Math.max(0, caret - 1), caret];
      return [soft ? this.rowEdge(caret, from, -1) : from, caret];
    }
    if (caret === to) return [caret, Math.min(unitLength(this.segments), caret + 1)];
    return [caret, soft ? this.rowEdge(caret, to, 1) : to];
  }

  private rowEdge(caret: number, limit: number, step: -1 | 1): number {
    const first = step < 0 ? caret - 1 : caret;
    const row = this.unitRect(first);
    let edge = step < 0 ? first : first + 1;
    for (let unit = first + step; step < 0 ? unit >= limit : unit < limit; unit += step) {
      const rect = this.unitRect(unit);
      if (rect.height > 0 && !sameRow(rect, row)) break;
      edge = step < 0 ? unit : unit + 1;
    }
    return edge;
  }

  private unitRect(unit: number): { top: number; bottom: number; height: number } {
    const doc = this.view.state.doc, pos = posFromUnit(doc, unit);
    const node = doc.nodeAt(pos);
    if (node?.type === fieldSchema.nodes.chip) {
      const rect = (this.view.nodeDOM(pos) as HTMLElement).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    }
    const rect = this.view.coordsAtPos(pos, 1);
    return { top: rect.top, bottom: rect.bottom, height: rect.bottom - rect.top };
  }

  // Chromium's word range runs through a chip glued to a word ("[chip]world" ⌥⌫ takes both).
  private stopAtChips(type: string, [start, end]: [number, number], caret: number): [number, number] {
    const backward = type === "deleteWordBackward";
    if (backward ? chipAt(this.segments, caret - 1) : chipAt(this.segments, caret)) return backward ? [caret - 1, caret] : [caret, caret + 1];
    for (let unit = backward ? caret - 1 : caret; backward ? unit >= start : unit < end; unit += backward ? -1 : 1) {
      if (chipAt(this.segments, unit)) return backward ? [unit + 1, end] : [start, unit];
    }
    return [start, end];
  }

  // Korean input ends one composition and starts the next in the same key event, so a waiting chip goes in after it. A
  // filler keeps text composed at an item's line start out of the marker's span; onCompositionEnd removes it.
  private openItemLineStart(): void {
    if (this.view.composing || this.readOnly()) return;
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus || !fieldListItems(this.segments).some(item => item.start === focus)) return;
    const doc = this.view.state.doc, at = posFromUnit(doc, focus);
    if (doc.resolve(at).parentOffset !== 0) return;
    const tr = this.view.state.tr.insert(at, fieldSchema.text(FILLER, [fieldSchema.marks.filler.create()]));
    tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(FILLER_ONLY, true).setMeta("addToHistory", false);
    this.composingAtItem = true;
    this.view.dispatch(tr);
  }

  private onCompositionEnd(): void {
    clearTimeout(this.compositionTimer);
    this.compositionTimer = setTimeout(() => {
      if (this.disposed) return;
      // A composition at a line-start chip's or item's place leaves a filler to remove.
      this.composingAtItem = false;
      if (!this.composing()) this.view.dispatch(this.view.state.tr);
      this.flushPending(); this.flushPress();
    }, 0);
  }

  // macOS (Electron 45) sends a Shift+Enter or Tab that ends a Korean composition again as an ordinary keydown, which
  // clears `press`; an input method that does not leaves it for this timer to do once.
  private flushPress(): void {
    const press = this.press;
    this.press = null;
    if (!press || this.composing() || this.readOnly()) return;
    if (press.kind === "break") this.lineBreak();
    else if (!this.moveItem(press.dir) && document.activeElement === this.el) moveFocus(this.el, press.dir === -1);
  }

  private flushPending(): void {
    if (this.composing() || this.pending.length === 0) return;
    const waiting = this.pending;
    this.pending = [];
    for (const anchor of waiting) this.insertChip(anchor);
  }

  // The caret cannot enter a chip, so a click puts it right after it. The document never changes here.
  private onChipClick(view: EditorView, node: PMNode, nodePos: number): boolean {
    if (node.type !== fieldSchema.nodes.chip || this.composing()) return false;
    const chip = view.nodeDOM(nodePos) as HTMLElement;
    if (document.activeElement !== this.el) { this.pointer = false; this.el.focus(); }
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nodePos + 1)));
    this.hooks.onChipClick?.(node.attrs.anchor as Anchor, chip);
    return true;
  }

  // With its line break, so typing replaces the whole line.
  private selectLine(pos: number): boolean {
    const doc = this.view.state.doc, unit = unitFromPos(doc, pos);
    const [from, to] = hardLine(this.segments, unit, unit);
    this.placeCaret({ anchor: from, focus: Math.min(unitLength(this.segments), to + 1) });
    return true;
  }

  private onCopy(event: Event, cut: boolean): boolean {
    const data = (event as ClipboardEvent).clipboardData;
    if (this.composing() || !data) return false;
    const [start, end] = ordered(this.readSelection());
    if (start === end) return false;
    event.preventDefault();
    const fragment = sliceUnits(this.segments, start, end);
    data.setData("text/plain", plainText(fragment));
    const scope = this.hooks.scope();
    if (scope !== null && fragment.some(segment => segment.kind === "chip")) data.setData(CLIPBOARD_TYPE, writeFieldClipboard(scope, fragment));
    if (cut && !this.readOnly()) this.replace(start, end, [], "own");
    return true;
  }

  // After the host's paste handler left the event alone. A chip clipboard keeps its chips only in a field of the same
  // canvas and within LIMITS.anchors.
  paste(event: ClipboardEvent): void {
    event.preventDefault();
    if (this.composing() || this.readOnly() || !event.clipboardData) return;
    const data = event.clipboardData;
    const [start, end] = ordered(this.readSelection());
    const custom = data.getData(CLIPBOARD_TYPE), scope = this.hooks.scope();
    let inserted = custom && scope !== null ? readFieldClipboard(custom, scope) : null;
    // Counted on the result of replacing the selection, as for an inserted chip.
    if (inserted && distinctTargets([...this.reservedChips(), ...spliceUnits(this.segments, start, end, inserted).segments]) > LIMITS.anchors) inserted = null;
    inserted ??= normalize([{ kind: "text", text: data.getData("text/plain").replace(/\r\n?/g, "\n") }]);
    this.replace(start, end, inserted, "own");
  }

  private lineBreak(): void {
    if (this.readOnly()) return;
    const [start, end] = ordered(this.readSelection());
    const edit = start === end ? continueList(this.segments, start) : null;
    if (edit) this.edit(edit, "own"); else this.replace(start, end, [{ kind: "text", text: "\n" }], "typing");
  }

  private decorations(doc: PMNode): DecorationSet {
    const drawn = this.drawn;
    if (drawn && drawn.doc === doc && drawn.names === this.names && drawn.widths === this.widthsVersion) return drawn.set;
    const segments = segmentsFromDoc(doc);
    const runs = fieldRuns(segments, this.hooks.skillNames?.() ?? new Set(), this.hooks.commandNames?.() ?? new Set());
    const set = fieldDecorations(doc, segments, runs, this.measure);
    this.drawn = { doc, names: this.names, widths: this.widthsVersion, set };
    return set;
  }

  // Plain figures, as markers draw them.
  private readonly measure: Measure = text => {
    const known = this.widths.get(text);
    if (known !== undefined) return known;
    const doc = this.el.ownerDocument;
    if (!this.ruler) {
      this.ruler = doc.createElement("span");
      this.ruler.setAttribute("aria-hidden", "true");
      Object.assign(this.ruler.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre", left: "-10000px", top: "0" });
    }
    if (!this.ruler.isConnected) doc.body.append(this.ruler);
    const style = getComputedStyle(this.el);
    Object.assign(this.ruler.style, {
      fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle,
      letterSpacing: style.letterSpacing, fontFeatureSettings: style.fontFeatureSettings, fontVariantNumeric: "normal",
    });
    this.ruler.textContent = text;
    const width = this.ruler.getBoundingClientRect().width;
    this.widths.set(text, width);
    return width;
  };

  // The placeholder is drawn from aria-placeholder while the field has no units (styles.css).
  private markEmpty(): void { this.el.toggleAttribute("data-empty", unitLength(this.segments) === 0); }

  // Chromium scrolls the field to the caret only after its own edits; a caret placed by code stays where the field was
  // scrolled.
  private revealCaret(): void {
    if (document.activeElement !== this.el) return;
    const rect = this.view.coordsAtPos(this.view.state.selection.head);
    const box = this.el.getBoundingClientRect();
    if (rect.bottom > box.bottom) this.el.scrollTop += rect.bottom - box.bottom;
    else if (rect.top < box.top) this.el.scrollTop -= box.top - rect.top;
  }

  private readSelection(): Selection {
    const { selection, doc } = this.view.state;
    return { anchor: unitFromPos(doc, selection.anchor), focus: unitFromPos(doc, selection.head) };
  }

  // ProseMirror writes the DOM selection only while the field has focus, so focus stays wherever the person put it.
  private placeCaret(selection: Selection): void {
    const doc = this.view.state.doc;
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(doc, posFromUnit(doc, selection.anchor), posFromUnit(doc, selection.focus))).scrollIntoView());
  }
}

// Marks the field's own transactions: "own" is an undo step of its own, "undo" a history step.
const OWN = "doanFieldEdit";
const FILLER_ONLY = "doanFieldFiller";

// For the Ctrl+Tab that Chromium leaves alone.
const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex], [contenteditable="true"]';
export function moveFocus(from: HTMLElement, backward: boolean): void {
  const document = from.ownerDocument;
  const stops = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE))
    .filter(node => node === from || (node.tabIndex >= 0 && !node.closest("[inert]") && node.checkVisibility({ visibilityProperty: true })));
  const at = stops.indexOf(from);
  if (at < 0) return;
  // A disabled button with a tabindex is passed over, as native Tab passes it.
  for (let step = 1; step < stops.length; step++) {
    stops[(at + (backward ? -step : step) + stops.length * step) % stops.length]!.focus();
    if (document.activeElement !== from) return;
  }
}

// Overview and the canvas panel focus their field by selector.
export function focusFieldEnd(node: HTMLElement | null): void {
  if (!node) return;
  const field = fields.get(node);
  if (field) { field.focus(true); return; }
  node.focus();
}

// A screen reader reads the kind prefix in the sentence's flow; the prefix is never selected (styles.css), so Look
// Up and the selected text name only the label.
function chipNode(anchor: Anchor): HTMLElement {
  const { kind, label, title } = chipLabel(anchor);
  const node = document.createElement("span");
  node.className = "anchor-chip";
  node.contentEditable = "false";
  node.dataset.kind = kind;
  // Shown by the field's shared tooltip (ComposerParts FieldChipTip), never a native title.
  node.dataset.tip = title;
  const hidden = document.createElement("span");
  hidden.className = "sr-only";
  hidden.textContent = `${KIND_PREFIX[kind]} `;
  const icon = document.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(name, value);
  for (const [tag, attributes] of ICONS[anchor.canvas && canvasKind(anchor.canvas.path) === "ds" ? "ds" : kind]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    icon.append(shape);
  }
  const text = document.createElement("span");
  text.textContent = label;
  node.append(hidden, icon, text);
  return node;
}

function ordered({ anchor, focus }: Selection): [number, number] { return anchor <= focus ? [anchor, focus] : [focus, anchor]; }
// Two boxes on one drawn row overlap by more than half the shorter one's height.
function sameRow(a: { top: number; bottom: number; height: number }, b: { top: number; bottom: number; height: number }): boolean {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
}
