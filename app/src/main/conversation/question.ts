// Agent questions (AskUserQuestion and kin) as main, the history and the renderer read them. Shared with the renderer:
// this module must import nothing (rendererImports.test.ts, POSTMORTEM 2026-10-30).

// UTF-16 code units. A question past a limit is refused, never cut: Claude keys its answers by the question's own text.
// label and text match messageText.ts LIMITS.label and LIMITS.path.
export const QUESTION_LIMITS = { questions: 4, options: 8, label: 512, text: 4_096 };

export interface QuestionOption { label: string; description?: string }
// id: the provider's question id (Codex) or doan's ordinal "0"…"3" (Claude, whose answers are keyed by text).
// header may be empty (Antigravity has none). other: the person may type their own answer. secret: the answer is passed
// on but never written to doan's history.
export interface Question { id: string; header: string; question: string; options: QuestionOption[]; multiSelect: boolean; other: boolean; secret?: true }
export type QuestionOutcome = "answered" | "skipped" | "expired";
// As stored: the chosen labels and the typed text apart, so a folded line can tell them apart.
export interface StoredAnswer { selected: string[]; other?: string }

// The person's answer as the renderer sends it (conversation:answerQuestion), choices by their index in the question's
// options. A runner checks it against its pending question with questionAnswer.
export interface QuestionAnswerInput { outcome: "answered" | "skipped"; answers?: Record<string, { selected: number[]; other?: string }> }
// The checked answer: every question answered, Other text trimmed, ready for a provider's wire shape.
export type QuestionAnswer = { outcome: "skipped" } | { outcome: "answered"; answers: Record<string, { selected: number[]; other?: string }> };
