import type { Question, QuestionAnswerInput } from "../main/conversation/question";
import { questionAnswer } from "../main/conversation/questionAnswer";

// The answer a person is choosing on a question card (agent-questions design §7). The store keeps it by request so it
// outlives the thread's redraw for another conversation; Send's rule is main's own check (questionAnswer).

// selected: option indexes. other: Other is chosen (a question without options is always answered by its text).
// text: Other's text, kept while another option is chosen so choosing Other again brings it back.
export interface QuestionChoice { selected: number[]; other: boolean; text: string }
// sending: an answer or a skip is on its way to main; the card is locked until it folds or main refuses.
export interface QuestionDraft { choices: Readonly<Record<string, QuestionChoice>>; sending: "answer" | "skip" | null; failed: boolean }
export const EMPTY_QUESTION_DRAFT: QuestionDraft = { choices: {}, sending: null, failed: false };

export type QuestionDraftAction =
  // A radio question takes this option alone; a several-choice question toggles it.
  | { type: "choose"; question: Question; option: number }
  // A radio question takes Other in place of an option; a several-choice question toggles it.
  | { type: "other"; question: Question }
  | { type: "text"; questionId: string; text: string }
  | { type: "sending"; how: "answer" | "skip" }
  // main refused for a reason other than stale: unlocked, the choices kept.
  | { type: "failed" };

const EMPTY_CHOICE: QuestionChoice = { selected: [], other: false, text: "" };

export function questionDraft(draft: QuestionDraft, action: QuestionDraftAction): QuestionDraft {
  if (action.type === "sending") return { ...draft, sending: action.how, failed: false };
  if (action.type === "failed") return { ...draft, sending: null, failed: true };
  if (draft.sending) return draft;
  const id = action.type === "text" ? action.questionId : action.question.id;
  const choice = draft.choices[id] ?? EMPTY_CHOICE;
  let next: QuestionChoice;
  if (action.type === "text") next = { ...choice, text: action.text };
  else if (action.type === "other") next = action.question.multiSelect ? { ...choice, other: !choice.other } : { ...choice, selected: [], other: true };
  else if (!action.question.multiSelect) next = { ...choice, selected: [action.option], other: false };
  else next = { ...choice, selected: choice.selected.includes(action.option) ? choice.selected.filter(n => n !== action.option) : [...choice.selected, action.option].sort((a, b) => a - b) };
  return { ...draft, choices: { ...draft.choices, [id]: next } };
}

// Other's text goes only while Other is chosen, or always for a question answered by text alone.
export function questionInput(questions: readonly Question[], draft: QuestionDraft): QuestionAnswerInput {
  const answers: Record<string, { selected: number[]; other?: string }> = {};
  for (const question of questions) {
    const choice = draft.choices[question.id] ?? EMPTY_CHOICE;
    const typed = question.options.length === 0 || choice.other;
    answers[question.id] = { selected: choice.selected, ...(typed && choice.text ? { other: choice.text } : {}) };
  }
  return { outcome: "answered", answers };
}

export function canSend(questions: readonly Question[], draft: QuestionDraft): boolean {
  return draft.sending === null && questionAnswer(questions, questionInput(questions, draft)) !== null;
}

// "each" reads oddly for a single question.
export function sendBlockedText(questions: readonly Question[]): string {
  return questions.length === 1 ? "Choose or type an answer first." : "Answer each question first.";
}
