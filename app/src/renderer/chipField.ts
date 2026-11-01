import { chipLabel, LIMITS } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";
import {
  chipAt, distinctTargets, FILLER, hardLine, isLineStart, normalize, plainText, readFieldClipboard, sameSegments, sliceUnits, spliceUnits,
  unitLength, writeFieldClipboard, type FieldSegment,
} from "./anchorField";

// The composer field's DOM, selection, clipboard, undo and IME handling over a contenteditable element
// (buzz-canvas-conversation design §2 'Chip field', §5 P1). ComposerField (ComposerParts.tsx) owns one per element.
//
// The browser edits plain text natively (typing, IME composition, deletions that touch no chip) and the field reads
// the DOM back into segments after each `input`. Everything that involves a chip — insertion, any deletion whose range
// covers one, paste, cut, undo and redo — is done on the segments and drawn again into the same element. Nothing is
// drawn while a composition is open: replacing the text under the IME's marked text cancels or corrupts it.

// Chromium keeps custom DataTransfer types in its own pasteboard entry, so they travel between Doan fields (also across
// windows) while every other app sees only text/plain.
const CLIPBOARD_TYPE = "application/x-doan-field+json";
const TYPING_MERGE_MS = 1000;

export type ChipInsert = "inserted" | "pending" | "limit" | "refused";
export interface ChipFieldHooks {
  // Every change: committed edits, and the live text during a composition so the host's shape follows it.
  onChange(segments: FieldSegment[]): void;
  onInput(): void;
  onAnnounce(text: string): void;
  // The canvas this field's chips belong to; null takes no chips, so a chip clipboard pastes as the chips' names.
  scope(): string | null;
  // A click on a chip, after the caret moved right after it: its host locates the chip on the canvas and may place a
  // note by the chip's node (its attributes are not read back, so a describing id on it changes no segment).
  onChipClick?(anchor: Anchor, chip: HTMLElement): void;
}

interface Selection { anchor: number; focus: number }
interface Step { segments: FieldSegment[]; before: Selection; after: Selection; kind: string; at: number }
// A <br> is never a unit: line breaks live in text as "\n". The field draws one only to show a trailing empty line, and
// Chromium adds its own when an edit leaves a line holding nothing but a chip; neither is read.
interface Unit { node: Node; kind: "text" | "chip" | "filler"; at: number; length: number }

// Icons of the chips: lucide Frame, SquareMousePointer and MapPin (design §2 'Chip field').
const SVG = "http://www.w3.org/2000/svg";
const ICONS: Record<"frame" | "element" | "point", [string, Record<string, string>][]> = {
  frame: [["line", { x1: "22", x2: "2", y1: "6", y2: "6" }], ["line", { x1: "22", x2: "2", y1: "18", y2: "18" }], ["line", { x1: "6", x2: "6", y1: "2", y2: "22" }], ["line", { x1: "18", x2: "18", y1: "2", y2: "22" }]],
  element: [["path", { d: "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" }], ["path", { d: "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" }]],
  point: [["path", { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" }], ["circle", { cx: "12", cy: "10", r: "3" }]],
};
const KIND_PREFIX = { frame: "Frame", element: "Element", point: "Point" } as const;

export class ChipField {
  private readonly chips = new WeakMap<Node, Anchor>(); // chip node → anchor; the DOM never holds anchors as attributes
  // Text nodes drawn as a line-start chip's filler; only their first character, while it is still the filler, is skipped.
  private readonly fillers = new WeakSet<Node>();
  private readonly breaks = new WeakSet<Node>(); // the trailing <br> the field drew
  // Set while a draft switch ends the previous draft's composition: its last events belong to that draft, not this one.
  private discarding = false;
  private segments: FieldSegment[] = [];
  private composingNow = false;
  private pending: Anchor[] = [];
  private selection: Selection = { anchor: 0, focus: 0 };
  private history: Step[] = [{ segments: [], before: { anchor: 0, focus: 0 }, after: { anchor: 0, focus: 0 }, kind: "init", at: 0 }];
  private index = 0;
  private mergeable = false;
  private groupBefore: Selection | null = null;
  private pointer = false;
  private draft: string | undefined;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly el: HTMLElement, private readonly hooks: ChipFieldHooks, initial: readonly FieldSegment[], draft?: string) {
    this.draft = draft;
    const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, listener);
      this.cleanups.push(() => el.removeEventListener(type, listener));
    };
    // main's Edit > Undo and Redo look for this mark on the focused element (app/src/main/index.ts editHistory).
    el.setAttribute("data-chip-field", "");
    on("keydown", event => this.onKeyDown(event));
    on("beforeinput", event => this.onBeforeInput(event));
    on("input", () => this.onInput());
    on("compositionstart", () => this.onCompositionStart());
    on("compositionend", () => this.onCompositionEnd());
    on("copy", event => this.onCopy(event, false));
    on("cut", event => this.onCopy(event, true));
    // Dragging text or a chip out would bypass the segments.
    on("dragstart", event => event.preventDefault());
    on("pointerdown", () => { this.pointer = true; });
    on("click", event => this.onChipClick(event));
    // A focus from the keyboard or from code (App and Overview call focus() on the element) puts the caret back where
    // it was; a click places its own caret.
    on("focus", () => { if (!this.pointer) this.placeCaret(this.selection); this.pointer = false; });
    on("blur", () => { this.pointer = false; });
    const selectionChange = () => this.onSelectionChange();
    document.addEventListener("selectionchange", selectionChange);
    this.cleanups.push(() => document.removeEventListener("selectionchange", selectionChange));
    this.reset(normalize(initial));
  }

  dispose(): void { for (const cleanup of this.cleanups) cleanup(); this.el.removeAttribute("data-chip-field"); }

  composing(): boolean { return this.composingNow; }

  // A chip is one unit the caret cannot enter, so a click on it puts the caret right after it (design §2 'Chip
  // locate'), focus included, and tells the host which chip it was. The DOM never changes here.
  private onChipClick(event: MouseEvent): void {
    let chip: Node | null = event.target instanceof Node ? event.target : null;
    while (chip && chip !== this.el && !this.chips.has(chip)) chip = chip.parentNode;
    const anchor = chip && chip !== this.el ? this.chips.get(chip) : undefined;
    const unit = anchor && this.units().find(entry => entry.node === chip);
    if (!anchor || !unit || this.composingNow) return;
    event.preventDefault();
    const after = { anchor: unit.at + 1, focus: unit.at + 1 };
    this.selection = after;
    if (document.activeElement !== this.el) { this.pointer = false; this.el.focus(); }
    this.placeCaret(after);
    this.hooks.onChipClick?.(anchor, chip as HTMLElement);
  }

  // The host's value and the draft it belongs to. Another draft ends this one's history, caret and waiting chips even
  // when the two hold the same content, so ⌘Z never brings back the previous draft's text or chips. Within one draft,
  // equal content is the field's own last change coming back; anything else is the host replacing the value (a send,
  // a returned draft), which also starts a new history with the caret at the end, but never inside a composition.
  setValue(value: readonly FieldSegment[], draft?: string): void {
    if (draft !== this.draft) {
      this.draft = draft;
      if (this.composingNow) this.endComposition();
      this.reset(normalize(value));
      return;
    }
    if (this.composingNow || sameSegments(value, this.segments)) return;
    this.reset(normalize(value));
  }

  // A blur makes Chromium finish the composition in the old DOM and tells the input method to drop it, so no late commit
  // lands in the next draft. Its compositionend and input still fire; `discarding` keeps them out of this draft's value
  // and history (the host already holds the previous draft's text from the live updates).
  private endComposition(): void {
    this.discarding = true;
    this.composingNow = false;
    if (document.activeElement === this.el) {
      this.el.blur();
      this.el.focus({ preventScroll: true });
    }
  }

  private reset(segments: FieldSegment[]): void {
    this.pending = [];
    this.groupBefore = null;
    this.render(segments);
    const end = { anchor: unitLength(segments), focus: unitLength(segments) };
    this.history = [{ segments, before: end, after: end, kind: "init", at: 0 }];
    this.index = 0;
    this.mergeable = false;
    this.placeCaret(end);
  }

  // "pending" waits for the composition to end; "limit" would point at more than LIMITS.anchors places; "refused": this
  // field takes no chips.
  insertChip(anchor: Anchor): ChipInsert {
    if (this.hooks.scope() === null) return "refused";
    // Counted on the result of replacing the selection, so a chip may replace chips in a full field. A waiting chip is
    // counted again where it lands once the composition ends (flushPending calls back here).
    const [start, end] = ordered(this.readSelection());
    const waiting = this.pending.map(a => ({ kind: "chip" as const, anchor: a }));
    const { segments: after } = spliceUnits(this.segments, start, end, [...waiting, { kind: "chip", anchor }]);
    if (distinctTargets(after) > LIMITS.anchors) return "limit";
    if (this.composingNow) { this.pending.push(anchor); return "pending"; }
    this.replace(start, end, [{ kind: "chip", anchor }], "chip");
    this.hooks.onAnnounce(`Added ${chipLabel(anchor).label}`);
    return "inserted";
  }

  caretAtStart(): boolean {
    const { anchor, focus } = this.readSelection();
    return anchor === 0 && focus === 0;
  }

  focus(caretAtEnd: boolean): void {
    if (caretAtEnd) { const end = unitLength(this.segments); this.selection = { anchor: end, focus: end }; }
    this.pointer = false;
    if (document.activeElement === this.el) this.placeCaret(this.selection);
    else this.el.focus();
  }

  // ── history ──────────────────────────────────────────────────────────────────────────────────────────────────

  private undo(): void {
    if (this.composingNow || this.index === 0) return;
    const undone = this.history[this.index--]!;
    this.restore(this.history[this.index]!.segments, undone.before);
  }

  private redo(): void {
    if (this.composingNow || this.index === this.history.length - 1) return;
    const step = this.history[++this.index]!;
    this.restore(step.segments, step.after);
  }

  private restore(segments: FieldSegment[], selection: Selection): void {
    this.render(segments);
    this.placeCaret(selection);
    this.mergeable = false;
    this.hooks.onChange(this.segments);
  }

  // Typing within a second merges into one step, as in a textarea; a chip, paste, cut or deletion through a chip is
  // always its own step.
  private commit(kind: string, before: Selection): void {
    const after = this.readSelection(), now = performance.now();
    const top = this.history[this.index]!;
    if (kind === "typing" && top.kind === "typing" && this.mergeable && now - top.at < TYPING_MERGE_MS) {
      Object.assign(top, { segments: this.segments, after, at: now });
    } else {
      this.history.splice(this.index + 1);
      this.history.push({ segments: this.segments, before, after, kind, at: now });
      this.index++;
    }
    this.mergeable = kind === "typing";
    this.groupBefore = null;
    // selectionchange arrives as a later task; a chip inserted right after typing must see the caret now.
    this.selection = after;
    this.hooks.onChange(this.segments);
  }

  // ── events ───────────────────────────────────────────────────────────────────────────────────────────────────

  private readOnly(): boolean { return !this.el.isContentEditable; }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.discarding && event.keyCode !== 229) this.discarding = false;
    // keyCode 229 is the IME's own key; the composition owns it.
    if (event.isComposing || event.keyCode === 229 || this.composingNow) return;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (this.readOnly()) return;
      if (event.shiftKey) this.redo(); else this.undo();
      return;
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.metaKey && !event.ctrlKey && !event.altKey) this.arrow(event);
  }

  // ← and → next to a chip or onto a line-start chip's place move one unit themselves. Chromium's own step from after a
  // line-start chip jumps to the line above, and a step onto the filler moves the DOM caret without moving a unit.
  // Elsewhere the browser keeps the step, so a surrogate pair or a grapheme is never split.
  private arrow(event: KeyboardEvent): void {
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus && !event.shiftKey) return;
    const backward = event.key === "ArrowLeft";
    const next = focus + (backward ? -1 : 1);
    if (next < 0 || next > unitLength(this.segments)) return;
    const lineStartChip = (unit: number) => chipAt(this.segments, unit) !== null && isLineStart(this.segments, unit);
    const ours = backward ? chipAt(this.segments, next) !== null || lineStartChip(focus) : chipAt(this.segments, focus) !== null || lineStartChip(next);
    if (!ours) return;
    event.preventDefault();
    this.placeCaret({ anchor: event.shiftKey ? anchor : next, focus: next });
  }

  private onBeforeInput(event: InputEvent): void {
    const type = event.inputType;
    // Edit > Undo and Redo from the menu arrive here rather than as keys (main sends them while the field is focused).
    if (type === "historyUndo" || type === "historyRedo") {
      event.preventDefault();
      if (this.readOnly()) return;
      if (type === "historyUndo") this.undo(); else this.redo();
      return;
    }
    if (this.discarding && !type.startsWith("insertComposition")) this.discarding = false;
    if (this.composingNow || type.startsWith("insertComposition")) return;
    if (type.startsWith("format")) { event.preventDefault(); return; }
    if (type === "insertParagraph" || type === "insertLineBreak") { event.preventDefault(); this.insertTyped("\n"); return; }
    // Paste and cut go through their clipboard events; a drag would move text past the segments.
    if (type.startsWith("insertFrom") || type === "deleteByDrag" || type === "deleteByCut") { event.preventDefault(); return; }
    if (type.startsWith("delete")) {
      const range = this.deletion(type, event);
      if (range) {
        event.preventDefault();
        if (range[0] < range[1]) this.replace(range[0], range[1], [], "delete");
        return;
      }
    }
    this.groupBefore ??= this.readSelection();
  }

  // The range a deletion takes when the field decides it, or null to leave it to the browser. A chip in the browser's
  // range is deleted whole, so it is never split or left half-selected.
  private deletion(type: string, event: InputEvent): [number, number] | null {
    const selection = ordered(this.readSelection());
    // ⌘⌫ and ⌘⌦ (and the paragraph forms): Chromium's range right after or before a chip covers only the chip, while
    // macOS deletes to the line's start or end. The field measures the line itself.
    const line = /^delete(Soft|Hard)Line(Backward|Forward)$/.exec(type);
    if (line) return selection[0] !== selection[1] ? selection : this.lineRange(selection[0], line[1] === "Soft", line[2] === "Backward");
    const target = event.getTargetRanges()[0];
    if (!target) return null;
    const native = ordered({ anchor: this.offsetOf(target.startContainer, target.startOffset), focus: this.offsetOf(target.endContainer, target.endOffset) });
    // A range that holds only the filler is no unit: the step the person asked for takes the unit beside the caret.
    if (native[0] === native[1] && selection[0] === selection[1]) {
      const backward = type.endsWith("Backward");
      return backward ? [Math.max(0, selection[0] - 1), selection[0]] : [selection[0], Math.min(unitLength(this.segments), selection[0] + 1)];
    }
    const [start, end] = type.startsWith("deleteWord") ? this.stopAtChips(type, native) : native;
    const chips = sliceUnits(this.segments, start, end).some(segment => segment.kind === "chip");
    return chips || start !== native[0] || end !== native[1] ? [start, end] : null;
  }

  // From the caret to the start (or end) of its line, chips and text alike. A soft line is the line as drawn, so a
  // wrapped paragraph loses only the part on the caret's row. At the very start (or end) of a line it takes the line
  // break, as macOS does.
  private lineRange(caret: number, soft: boolean, backward: boolean): [number, number] {
    const [from, to] = hardLine(this.segments, caret, caret);
    if (backward) {
      if (caret === from) return [Math.max(0, caret - 1), caret];
      return [soft ? this.rowEdge(caret, from, -1) : from, caret];
    }
    if (caret === to) return [caret, Math.min(unitLength(this.segments), caret + 1)];
    return [caret, soft ? this.rowEdge(caret, to, 1) : to];
  }

  // Walks from the unit next to the caret toward `limit` while units stay on the caret's drawn row.
  private rowEdge(caret: number, limit: number, step: -1 | 1): number {
    const first = step < 0 ? caret - 1 : caret;
    const row = this.unitRect(first);
    if (!row) return limit;
    let edge = step < 0 ? first : first + 1;
    for (let unit = first + step; step < 0 ? unit >= limit : unit < limit; unit += step) {
      const rect = this.unitRect(unit);
      if (rect && rect.height > 0 && !sameRow(rect, row)) break;
      edge = step < 0 ? unit : unit + 1;
    }
    return edge;
  }

  private unitRect(unit: number): DOMRect | null {
    for (const entry of this.units()) {
      if (unit < entry.at || unit >= entry.at + entry.length) continue;
      if (entry.kind === "chip") return (entry.node as Element).getBoundingClientRect();
      if (entry.kind !== "text") return null;
      const from = this.domOffset(entry.node, unit - entry.at);
      const range = document.createRange();
      range.setStart(entry.node, from);
      range.setEnd(entry.node, from + 1);
      return range.getBoundingClientRect();
    }
    return null;
  }

  // Chromium's word range runs through a chip glued to a word ("[chip]world" ⌥⌫ takes both). A chip is a word of its
  // own: ⌥⌫/⌥⌦ next to a chip deletes only the chip, and a word deletion never reaches past one.
  private stopAtChips(type: string, [start, end]: [number, number]): [number, number] {
    const { anchor, focus } = this.readSelection();
    if (anchor !== focus) return [start, end];
    const backward = type === "deleteWordBackward";
    if (backward ? chipAt(this.segments, focus - 1) : chipAt(this.segments, focus)) return backward ? [focus - 1, focus] : [focus, focus + 1];
    for (let unit = backward ? focus - 1 : focus; backward ? unit >= start : unit < end; unit += backward ? -1 : 1) {
      if (chipAt(this.segments, unit)) return backward ? [unit + 1, end] : [start, unit];
    }
    return [start, end];
  }

  private onInput(): void {
    if (this.discarding) return;
    this.hooks.onInput();
    this.markEmpty();
    if (this.composingNow) { this.hooks.onChange(this.read()); return; }
    this.sync();
    this.repair();
  }

  private onCompositionStart(): void {
    if (this.discarding) return;
    this.composingNow = true;
    this.groupBefore ??= this.readSelection();
  }

  // Chromium fires the last `input` of a composition before `compositionend`, so the DOM holds the final text. Korean
  // input ends one syllable's composition and starts the next in the same key event, so a waiting chip goes in only
  // after the event has run and only if no new composition started meanwhile.
  private onCompositionEnd(): void {
    if (this.discarding) {
      // The previous draft's composition, finished by endComposition: draw this draft again over whatever it left.
      this.discarding = false;
      if (!sameSegments(this.read(), this.segments)) { const selection = this.readSelection(); this.render(this.segments); this.placeCaret(selection); }
      return;
    }
    this.composingNow = false;
    this.sync();
    setTimeout(() => { this.repair(); this.flushPending(); }, 0);
  }

  // Browser edits keep the DOM drawn as render() would draw it: a chip that an edit leaves at a line's start gets its
  // filler, a filler or <br> Chromium left behind goes, and nothing nests. Drawn again with the same selection, never
  // during a composition (that would cancel it).
  private repair(): void {
    if (this.composingNow || !this.misdrawn()) return;
    const selection = this.readSelection();
    this.render(this.segments);
    this.placeCaret(selection);
  }

  private misdrawn(): boolean {
    const nodes = Array.from(this.el.childNodes);
    let at = 0;
    for (const [index, node] of nodes.entries()) {
      if (node.nodeType === Node.TEXT_NODE) { at += this.textOf(node).length; continue; }
      if (this.chips.has(node)) {
        const previous = nodes[index - 1];
        const filled = previous !== undefined && this.fillers.has(previous) && this.textOf(previous) === "" && (previous as Text).data === FILLER;
        if (filled !== isLineStart(this.segments, at)) return true;
        at += 1;
        continue;
      }
      if (node.nodeName === "BR" && this.breaks.has(node) && index === nodes.length - 1) continue;
      return true;
    }
    // A filler is only ever directly before a chip; one that took typed text keeps it as text until the next draw.
    const last = this.segments[this.segments.length - 1];
    const trailing = nodes[nodes.length - 1];
    return last?.kind === "text" && last.text.endsWith("\n") && !(trailing && this.breaks.has(trailing));
  }

  private flushPending(): void {
    if (this.composingNow || this.pending.length === 0) return;
    const waiting = this.pending;
    this.pending = [];
    for (const anchor of waiting) this.insertChip(anchor);
  }

  private onSelectionChange(): void {
    const selection = document.getSelection();
    if (!selection?.anchorNode || !this.el.contains(selection.anchorNode)) return;
    const next = this.readSelection();
    const top = this.history[this.index]!;
    if (next.anchor !== top.after.anchor || next.focus !== top.after.focus) this.mergeable = false;
    this.selection = next;
  }

  private onCopy(event: ClipboardEvent, cut: boolean): void {
    if (this.composingNow || !event.clipboardData) return;
    const [start, end] = ordered(this.readSelection());
    if (start === end) return;
    event.preventDefault();
    const fragment = sliceUnits(this.segments, start, end);
    event.clipboardData.setData("text/plain", plainText(fragment));
    const scope = this.hooks.scope();
    if (scope !== null && fragment.some(segment => segment.kind === "chip")) event.clipboardData.setData(CLIPBOARD_TYPE, writeFieldClipboard(scope, fragment));
    if (cut && !this.readOnly()) this.replace(start, end, [], "cut");
  }

  // Called by ComposerField after the host's paste handler left the event alone (files are the host's). Text comes in
  // plain; a chip clipboard keeps its chips only in a field of the same canvas and within LIMITS.anchors.
  paste(event: ClipboardEvent): void {
    event.preventDefault();
    if (this.composingNow || this.readOnly() || !event.clipboardData) return;
    const data = event.clipboardData;
    const [start, end] = ordered(this.readSelection());
    const custom = data.getData(CLIPBOARD_TYPE), scope = this.hooks.scope();
    let inserted = custom && scope !== null ? readFieldClipboard(custom, scope) : null;
    // Counted on the result of replacing the selection, as for an inserted chip.
    if (inserted && distinctTargets(spliceUnits(this.segments, start, end, inserted).segments) > LIMITS.anchors) inserted = null;
    inserted ??= normalize([{ kind: "text", text: data.getData("text/plain").replace(/\r\n?/g, "\n") }]);
    this.replace(start, end, inserted, "paste");
  }

  // ── segments ↔ DOM ───────────────────────────────────────────────────────────────────────────────────────────

  private insertTyped(value: string): void {
    const [start, end] = ordered(this.readSelection());
    this.replace(start, end, [{ kind: "text", text: value }], "typing");
  }

  private replace(start: number, end: number, inserted: readonly FieldSegment[], kind: string): void {
    const before = this.readSelection();
    const { segments, caret } = spliceUnits(this.segments, start, end, inserted);
    this.render(segments);
    this.placeCaret({ anchor: caret, focus: caret });
    this.commit(kind, before);
  }

  private sync(): void {
    const segments = this.read();
    if (sameSegments(segments, this.segments)) { this.groupBefore = null; return; }
    const before = this.groupBefore ?? this.selection;
    this.segments = segments;
    this.commit("typing", before);
  }

  // Always the same element: only its children change, so focus, the accessibility node and the IME client survive.
  private render(segments: FieldSegment[]): void {
    const nodes: Node[] = [];
    let at = 0;
    for (const segment of segments) {
      if (segment.kind === "text") { nodes.push(document.createTextNode(segment.text)); at += segment.text.length; continue; }
      if (isLineStart(segments, at)) { const filler = document.createTextNode(FILLER); this.fillers.add(filler); nodes.push(filler); }
      nodes.push(this.chipNode(segment.anchor));
      at += 1;
    }
    const last = segments[segments.length - 1];
    // A trailing line break needs a filler <br> to show its empty line; units() never counts it.
    if (last?.kind === "text" && last.text.endsWith("\n")) { const filler = document.createElement("br"); this.breaks.add(filler); nodes.push(filler); }
    this.el.replaceChildren(...nodes);
    this.segments = segments;
    this.markEmpty();
  }

  // The placeholder is drawn from aria-placeholder while the field has no units (styles.css).
  private markEmpty(): void { this.el.toggleAttribute("data-empty", this.units().total === 0); }

  private chipNode(anchor: Anchor): HTMLElement {
    const { kind, label, title } = chipLabel(anchor);
    const node = document.createElement("span");
    node.className = "anchor-chip";
    node.contentEditable = "false";
    node.dataset.kind = kind;
    node.title = title;
    // The kind prefix is text, so a screen reader reads the chip in the sentence's flow ("Frame Payment").
    const hidden = document.createElement("span");
    hidden.className = "sr-only";
    hidden.textContent = `${KIND_PREFIX[kind]} `;
    const icon = document.createElementNS(SVG, "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(name, value);
    for (const [tag, attributes] of ICONS[kind]) {
      const shape = document.createElementNS(SVG, tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      icon.append(shape);
    }
    const text = document.createElement("span");
    text.textContent = label;
    node.append(hidden, icon, text);
    this.chips.set(node, anchor);
    return node;
  }

  private units(): Unit[] & { total: number } {
    const entries: Unit[] = [];
    let at = 0;
    const visit = (parent: Node) => {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) { const length = this.textOf(node).length; entries.push({ node, kind: "text", at, length }); at += length; }
        else if (this.chips.has(node)) { entries.push({ node, kind: "chip", at, length: 1 }); at += 1; }
        else if (node.nodeName === "BR") entries.push({ node, kind: "filler", at, length: 0 });
        else if (node.nodeType === Node.ELEMENT_NODE) visit(node);
      }
    };
    visit(this.el);
    return Object.assign(entries, { total: at });
  }

  private read(): FieldSegment[] {
    return normalize(this.units().flatMap((entry): FieldSegment[] =>
      entry.kind === "text" ? [{ kind: "text", text: this.textOf(entry.node) }]
        : entry.kind === "chip" ? [{ kind: "chip", anchor: this.chips.get(entry.node)! }] : []));
  }

  // A DOM point → unit offset. A point inside a chip snaps to the chip's nearer edge.
  private offsetOf(container: Node, offset: number): number {
    const entries = this.units();
    for (const entry of entries) {
      if (entry.kind === "text" && entry.node === container) { const at = this.skip(entry.node); return entry.at + (at >= 0 && at < offset ? offset - 1 : offset); }
      if (entry.kind === "chip" && entry.node.contains(container)) {
        const range = document.createRange();
        range.setStart(entry.node, 0);
        range.setEnd(container, offset);
        return entry.at + (range.toString() === "" ? 0 : 1);
      }
    }
    const point = document.createRange();
    point.setStart(container, offset);
    for (const entry of entries) {
      if (entry.kind === "filler") continue;
      if (point.comparePoint(entry.node, 0) >= 0) return entry.at;
    }
    return entries.total;
  }

  // A unit offset → DOM point, preferring a text node so typing continues in it.
  private pointAt(offset: number): [Node, number] {
    const entries = this.units();
    // The last text node that reaches the offset: at a line-start chip that is the filler, after its zero-width
    // space, so the caret stands on the chip's line rather than at the end of the line above.
    const text = [...entries].reverse().find(entry => entry.kind === "text" && offset >= entry.at && offset <= entry.at + entry.length);
    if (text) return [text.node, this.domOffset(text.node, offset - text.at)];
    for (const entry of entries) {
      if (entry.kind === "chip" && offset === entry.at) return [entry.node.parentNode!, indexIn(entry.node)];
    }
    const last = [...entries].reverse().find(entry => entry.kind !== "filler");
    if (last && last.kind !== "text") return [last.node.parentNode!, indexIn(last.node) + 1];
    return [this.el, 0];
  }

  // A drawn filler node skips one character, its filler: at the start once text is typed after it, at the end once text
  // is typed before it (Chromium may put the caret either side). -1: nothing to skip.
  private skip(node: Node): number {
    if (!this.fillers.has(node)) return -1;
    const data = (node as Text).data;
    return data.startsWith(FILLER) ? 0 : data.endsWith(FILLER) ? data.length - 1 : -1;
  }
  private textOf(node: Node): string {
    const data = (node as Text).data, at = this.skip(node);
    return at < 0 ? data : data.slice(0, at) + data.slice(at + 1);
  }
  // The DOM offset in a text node after `units` units; past a leading filler, so the caret stands on the chip's line.
  private domOffset(node: Node, units: number): number {
    const at = this.skip(node);
    return at < 0 || units < at ? units : units + 1;
  }

  private readSelection(): Selection {
    const selection = document.getSelection();
    if (!selection?.anchorNode || !selection.focusNode || !this.el.contains(selection.anchorNode)) return this.selection;
    return { anchor: this.offsetOf(selection.anchorNode, selection.anchorOffset), focus: this.offsetOf(selection.focusNode, selection.focusOffset) };
  }

  // Placing a DOM selection inside a contenteditable focuses it in Chromium, so an unfocused field only remembers the
  // caret; focus stays wherever the person put it (POSTMORTEM 2026-10-23 R-L).
  private placeCaret(selection: Selection): void {
    this.selection = selection;
    if (document.activeElement !== this.el) return;
    const [anchorNode, anchorOffset] = this.pointAt(selection.anchor);
    const [focusNode, focusOffset] = this.pointAt(selection.focus);
    document.getSelection()?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  }
}

// Puts the caret at the end of a composer field found in the DOM (Overview focuses its field by selector).
export function focusFieldEnd(node: HTMLElement | null): void {
  if (!node) return;
  node.focus();
  const selection = document.getSelection();
  if (!selection) return;
  selection.selectAllChildren(node);
  selection.collapseToEnd();
}

function ordered({ anchor, focus }: Selection): [number, number] { return anchor <= focus ? [anchor, focus] : [focus, anchor]; }
function indexIn(node: Node): number { return Array.prototype.indexOf.call(node.parentNode!.childNodes, node); }
// Two boxes on one drawn row overlap by more than half the shorter one's height.
function sameRow(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
}
