import type { Question, QuestionAnswerInput } from "../main/conversation/question";
import { questionAnswer } from "../main/conversation/questionAnswer";

// Kept by request so it outlives the thread's redraw for another conversation; Send's rule is main's own check
// (questionAnswer).

// text is kept while another option is chosen, so choosing Other again brings it back. A question without options is
// always answered by its text.
export interface QuestionChoice { selected: number[]; other: boolean; text: string }
// step: the question in view. sending locks the card until it folds or main refuses.
export interface QuestionDraft { choices: Readonly<Record<string, QuestionChoice>>; step: number; sending: "answer" | "skip" | null; failed: "answer" | "skip" | null }
export const EMPTY_QUESTION_DRAFT: QuestionDraft = { choices: {}, step: 0, sending: null, failed: null };

export type QuestionDraftAction =
  // A radio question takes this option alone; a several-choice question toggles it.
  | { type: "choose"; question: Question; option: number }
  // A radio question takes Other in place of an option; a several-choice question toggles it.
  | { type: "other"; question: Question }
  | { type: "text"; questionId: string; text: string }
  // Only once the question in view has an answer, and never past the last.
  | { type: "next"; questions: readonly Question[] }
  | { type: "back" }
  | { type: "sending"; how: "answer" | "skip" }
  // Unlocked, the choices kept.
  | { type: "failed" };

const EMPTY_CHOICE: QuestionChoice = { selected: [], other: false, text: "" };

export function questionDraft(draft: QuestionDraft, action: QuestionDraftAction): QuestionDraft {
  if (action.type === "sending") return { ...draft, sending: action.how, failed: null };
  if (action.type === "failed") return { ...draft, sending: null, failed: draft.sending ?? "answer" };
  if (draft.sending) return draft;
  if (action.type === "back") return draft.step > 0 ? { ...draft, step: draft.step - 1 } : draft;
  if (action.type === "next") {
    const question = action.questions[draft.step];
    return !lastStep(action.questions, draft) && question && questionAnswered(question, draft) ? { ...draft, step: draft.step + 1 } : draft;
  }
  const id = action.type === "text" ? action.questionId : action.question.id;
  const choice = draft.choices[id] ?? EMPTY_CHOICE;
  let next: QuestionChoice;
  if (action.type === "text") next = { ...choice, text: action.text };
  else if (action.type === "other") next = action.question.multiSelect ? { ...choice, other: !choice.other } : { ...choice, selected: [], other: true };
  else if (!action.question.multiSelect) next = { ...choice, selected: [action.option], other: false };
  else next = { ...choice, selected: choice.selected.includes(action.option) ? choice.selected.filter(n => n !== action.option) : [...choice.selected, action.option].sort((a, b) => a - b) };
  // The failure line names the send that was refused, so a changed answer retires it.
  return { ...draft, choices: { ...draft.choices, [id]: next }, failed: null };
}

// Empty text goes too, so questionAnswer reads an Other left blank as no answer.
export function questionInput(questions: readonly Question[], draft: QuestionDraft): QuestionAnswerInput {
  const answers: Record<string, { selected: number[]; other?: string }> = {};
  for (const question of questions) {
    const choice = draft.choices[question.id] ?? EMPTY_CHOICE;
    const typed = question.options.length === 0 || choice.other;
    answers[question.id] = { selected: choice.selected, ...(typed ? { other: choice.text } : {}) };
  }
  return { outcome: "answered", answers };
}

export function canSend(questions: readonly Question[], draft: QuestionDraft): boolean {
  return draft.sending === null && questionAnswer(questions, questionInput(questions, draft)) !== null;
}

export function questionAnswered(question: Question, draft: QuestionDraft): boolean {
  return questionAnswer([question], questionInput([question], draft)) !== null;
}

export function lastStep(questions: readonly Question[], draft: QuestionDraft): boolean {
  return draft.step >= questions.length - 1;
}

// Next and Send are one button, so focus stays on it when the last step turns it into Send.
export function stepButton(questions: readonly Question[], draft: QuestionDraft): { kind: "next" | "send"; enabled: boolean } {
  if (lastStep(questions, draft)) return { kind: "send", enabled: canSend(questions, draft) };
  const question = questions[draft.step];
  return { kind: "next", enabled: draft.sending === null && question !== undefined && questionAnswered(question, draft) };
}

// Return in Other's field presses the step button while it is on; IME composition is the caller's to skip.
export function otherReturn(questions: readonly Question[], draft: QuestionDraft): "next" | "send" | null {
  const button = stepButton(questions, draft);
  return button.enabled ? button.kind : null;
}
