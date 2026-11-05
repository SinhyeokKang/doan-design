import { QUESTION_LIMITS, type Question, type QuestionAnswer, type QuestionAnswerInput } from "./question";

// Whether an answer fits the pending questions, and its checked form; null when it does not. main checks a sent answer
// with it and the renderer's Send button uses the same rule, so it imports only question.ts, which imports nothing
// (rendererImports.test.ts).
export function questionAnswer(questions: readonly Question[], input: QuestionAnswerInput): QuestionAnswer | null {
  if (input.outcome === "skipped") return input.answers === undefined ? { outcome: "skipped" } : null;
  if (input.outcome !== "answered" || !record(input.answers)) return null;
  const given = input.answers;
  if (Object.keys(given).length !== questions.length) return null;
  const answers: Record<string, { selected: number[]; other?: string }> = {};
  for (const question of questions) {
    if (!Object.hasOwn(given, question.id)) return null;
    const answer = one(question, given[question.id]);
    if (!answer) return null;
    answers[question.id] = answer;
  }
  return { outcome: "answered", answers };
}

function one(question: Question, value: unknown): { selected: number[]; other?: string } | null {
  if (!record(value) || !Array.isArray(value.selected)) return null;
  const selected: unknown[] = value.selected;
  if (!selected.every(n => Number.isInteger(n) && (n as number) >= 0 && (n as number) < question.options.length) || new Set(selected).size !== selected.length) return null;
  if (value.other !== undefined && (typeof value.other !== "string" || value.other.length > QUESTION_LIMITS.text)) return null;
  // Other picked with no text left is no answer, and text of only spaces says nothing beside a choice.
  const other = typeof value.other === "string" ? value.other.trim() : "";
  if (other && !question.other) return null;
  // A single-choice question takes one choice or Other: the card shows Other as one more radio.
  if (!question.multiSelect && selected.length + (other ? 1 : 0) > 1) return null;
  if (!selected.length && !other) return null;
  return { selected: selected as number[], ...(other ? { other } : {}) };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
