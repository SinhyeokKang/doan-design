// The working notice's erase-and-type change (draft frame notice-typing).

// Tunable (tasks E2): per erased and per typed character, and the most one change may take.
export const ERASE_MS = 20;
export const TYPE_MS = 35;
export const TYPING_CAP_MS = 1000;

export interface TypingStep {
  text: string;
  // ms from the change.
  at: number;
  // The line's width floor in px while the change runs; null on the last step, which clears it.
  minWidth: number | null;
}

// Graphemes, so a Hangul syllable or an emoji never shows half drawn.
function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(part => part.segment);
}

// The common start stays; the rest of `from` is erased one character at a time, then the rest of `to` typed. A change
// longer than `capMs` has both intervals scaled by the same ratio, so a long note never runs into the next update.
// The floor is the shorter text's width: the card never shrinks below it while the text changes.
export function typingSteps(from: string, to: string, options: { eraseMs?: number; typeMs?: number; capMs?: number; fromWidth: number; toWidth: number }): TypingStep[] {
  if (from === to) return [];
  const { eraseMs = ERASE_MS, typeMs = TYPE_MS, capMs = TYPING_CAP_MS, fromWidth, toWidth } = options;
  const before = graphemes(from), after = graphemes(to);
  let common = 0;
  while (common < before.length && common < after.length && before[common] === after[common]) common++;
  const erased = before.length - common, typed = after.length - common;
  const total = erased * eraseMs + typed * typeMs;
  const ratio = total > capMs ? capMs / total : 1;
  const floor = Math.min(fromWidth, toWidth);
  const steps: TypingStep[] = [];
  for (let i = 1; i <= erased; i++) steps.push({ text: before.slice(0, before.length - i).join(""), at: i * eraseMs * ratio, minWidth: floor });
  for (let i = 1; i <= typed; i++) steps.push({ text: after.slice(0, common + i).join(""), at: (erased * eraseMs + i * typeMs) * ratio, minWidth: floor });
  steps[steps.length - 1]!.minWidth = null;
  return steps;
}

// One moment of the notice: which canvas, whether it is in view, which update its words come from.
export interface NoticeMoment { canvas: string | null; visible: boolean; content: string | null; waiting: boolean }

// Only a new update (or work starting) while the canvas stays in view erases and types. Opening the canvas or coming
// back to it mid-turn, a layout turning a frame id into its title, and waiting (the person has to act) change at once.
export function typesOn(previous: NoticeMoment | null, next: NoticeMoment): boolean {
  return previous !== null && previous.visible && next.visible && next.canvas !== null && previous.canvas === next.canvas
    && !next.waiting && previous.content !== next.content;
}

// Another canvas, or the canvas going out of or into view: a change still running belongs to what was there before.
export function crossesBoundary(previous: NoticeMoment | null, next: NoticeMoment): boolean {
  return previous !== null && (previous.canvas !== next.canvas || previous.visible !== next.visible);
}

export interface TypedText { text: string; minWidth: number | null; typing: boolean }

// Runs the steps on timers. `measure` reads the two texts' widths once per change (never per step); a change while one
// runs restarts from the text on screen toward the newest text.
export class NoticeTyping {
  private shown = "";
  private target: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(private readonly host: { show(state: TypedText): void; measure(from: string, to: string): { from: number; to: number }; reducedMotion(): boolean }) {}

  set(text: string, animate: boolean): void {
    if (text === this.target) return;
    this.target = text;
    this.stop();
    if (!animate || this.host.reducedMotion() || this.shown === text) {
      this.shown = text;
      this.host.show({ text, minWidth: null, typing: false });
      return;
    }
    const widths = this.host.measure(this.shown, text);
    const steps = typingSteps(this.shown, text, { fromWidth: widths.from, toWidth: widths.to });
    this.host.show({ text: this.shown, minWidth: Math.min(widths.from, widths.to), typing: true });
    for (const step of steps) {
      this.timers.push(setTimeout(() => {
        this.shown = step.text;
        this.host.show({ text: step.text, minWidth: step.minWidth, typing: step.minWidth !== null });
      }, step.at));
    }
  }

  // Ends any running change on `text` at once, even when it is the change's own target (set would keep it running).
  settle(text: string): void {
    this.target = text;
    this.stop();
    this.shown = text;
    this.host.show({ text, minWidth: null, typing: false });
  }

  dispose(): void { this.stop(); }

  private stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
