// Share validation so main preview/clipboard text and renderer Copy availability
// agree (ARCHITECTURE §7, Onboarding and project preload contract).

export const MAX_SUBJECT_LENGTH = 500;

export type SubjectError = "empty" | "control" | "too-long";

// C0, DEL and C1 controls plus the Unicode line and paragraph separators:
// anything that would break the sentence across lines.
const BREAKING = /[\p{Cc}\p{Zl}\p{Zp}]/u;

// A trailing run of periods collapses to one (ellipses are not preserved).
// `subject` is trimmed first, so surrounding whitespace never counts as a control
// character or toward the limit. Counting is by code point, not UTF-16 unit.
export function promptSentence(repo: string, subject: string): string | { error: SubjectError } {
  const text = subject.trim();
  if (text === "") return { error: "empty" };
  if (BREAKING.test(text)) return { error: "control" };
  if ([...text].length > MAX_SUBJECT_LENGTH) return { error: "too-long" };
  return `Use the doan skill to make a design canvas in ${repo} for ${text.replace(/\.+$/, "")}.`;
}
