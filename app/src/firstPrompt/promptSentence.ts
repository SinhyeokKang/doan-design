// The first prompt sentence. Pure and shared: main builds the preview and the
// clipboard text with this function, and the renderer uses it to know whether
// Copy is available, so both always agree (app-setup design.md 'First prompt').

export const MAX_SUBJECT_LENGTH = 500;

export type SubjectError = "empty" | "control" | "too-long";

// C0, DEL and C1 controls plus the Unicode line and paragraph separators:
// anything that would break the sentence across lines.
const BREAKING = /[\p{Cc}\p{Zl}\p{Zp}]/u;

// `subject` is trimmed first, so surrounding whitespace never counts as a control
// character or toward the limit. Counting is by code point, not UTF-16 unit.
export function promptSentence(repo: string, subject: string): string | { error: SubjectError } {
  const text = subject.trim();
  if (text === "") return { error: "empty" };
  if (BREAKING.test(text)) return { error: "control" };
  if ([...text].length > MAX_SUBJECT_LENGTH) return { error: "too-long" };
  return `Use the doan skill to make a design canvas in ${repo} for ${text}${text.endsWith(".") ? "" : "."}`;
}
