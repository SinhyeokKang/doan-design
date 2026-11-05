// The working notice's erase-and-type change (work-update design decisions 19–20, draft frame notice-typing).

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
// The floor is the shorter text's width: the card never shrinks below it while the text changes (decision 20).
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
