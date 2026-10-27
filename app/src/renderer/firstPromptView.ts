import type { FirstPromptEvent, FirstPromptState } from "../firstPrompt/firstPrompt";
import { MAX_SUBJECT_LENGTH, promptSentence } from "../firstPrompt/promptSentence";
import type { FolderEntry } from "../main/view";
import type { CopyState } from "./onboardingView";

// Copy from the confirmed draft (.doan/canvases/app-setup.html, frame first-prompt).
export const SUBJECT_LABEL = "What do you want to design?";
export const SUBJECT_PLACEHOLDER = "a sign-in screen with SSO";
export const INVALID_SUBJECT = `Use one line of plain text, up to ${MAX_SUBJECT_LENGTH} characters.`;
export const HELPER_LINES = ["Paste it into a new Claude Code or Codex session.", "Your input stays in doan until you copy it."] as const;
export const WAITING_TEXT = "Waiting for a canvas in .doan/canvases/…";
export const newCanvasText = (project: string) => `New canvas in ${project}`;

export interface SubjectView { copyable: boolean; error?: string; count?: string }
// Validity comes from the same function main builds the sentence with, so Copy
// is enabled exactly when main would copy. The repo does not affect validity.
export function subjectView(subject: string): SubjectView {
  const sentence = promptSentence("/", subject);
  if (typeof sentence === "string") return { copyable: true };
  switch (sentence.error) {
    case "empty": return { copyable: false };
    case "control": return { copyable: false, error: INVALID_SUBJECT };
    case "too-long": return { copyable: false, error: INVALID_SUBJECT, count: `${[...subject.trim()].length} / ${MAX_SUBJECT_LENGTH}` };
  }
}

export interface SentenceParts { before: string; mark: string; after: string; slot: boolean }
const PROBE = "x";
// The text before the subject, taken from promptSentence itself so the preview
// never restates the sentence.
const prefixFor = (root: string) => (promptSentence(root, PROBE) as string).slice(0, -(PROBE.length + 1));
// `sentence` is main's reply for the current subject; null shows the empty slot.
export function sentenceParts(root: string, sentence: string | null): SentenceParts {
  const before = prefixFor(root);
  if (sentence === null) return { before, mark: "…", after: ".", slot: true };
  if (sentence.startsWith(before) && sentence.endsWith(".")) return { before, mark: sentence.slice(before.length, -1), after: ".", slot: false };
  return { before: sentence, mark: "", after: "", slot: false };
}

// `edited`: the subject changed since the last successful copy, so the
// clipboard holds an older sentence (the wait itself goes on).
export function promptCopyLabel(copy: CopyState, edited: boolean): string {
  switch (copy) {
    case "idle": return "Copy";
    case "copying": return "Copying…";
    case "copied": return edited ? "Copy again" : "Copied";
    case "failed": return "Retry copy";
  }
}

export type ArrivalAction = "wizard" | "toast" | "open";
// Where a new canvas shows (spec 'First prompt'). `workspaceRoot` is the root
// of the workspace on screen, null on Home.
export function arrivalAction(at: { wizardOpen: boolean; hidden: boolean; workspaceRoot: string | null }, root: string): ArrivalAction {
  if (at.wizardOpen) return "wizard";
  if (at.hidden) return "toast";
  return at.workspaceRoot === root ? "open" : "toast";
}

// The reducer event a folder update means for the wait. A root that is reading
// or failing keeps its wait; only one that is no longer stored cancels it, an
// arrival waiting in the wizard included.
export function waitEvent(state: FirstPromptState, entries: readonly FolderEntry[]): FirstPromptEvent | null {
  if (state.kind === "idle") return null;
  const entry = entries.find(candidate => candidate.path === state.root);
  if (!entry) return { type: "removed", root: state.root };
  return state.kind === "waiting" && entry.kind === "list" ? { type: "listed", root: state.root, rows: entry.canvases } : null;
}
