import type { Warning } from "../formats/types";

export type IdentityCause = "missing" | "invalid" | "duplicate" | null;

export const WARNINGS_TITLE = "Some comment changes were ignored";
export const READ_FAILED_EDITOR = "Comments couldn’t be read. Choose Retry, then save.";

const WARNING_TEXT: Record<Warning["code"], string> = {
  invalid_event: "A line could not be read and was skipped.",
  unknown_version: "This record was written by a newer version of Doan.",
  conflicting_duplicate: "Two versions of the same change disagree, so both were ignored.",
  agent_not_allowed: "An agent tried to add or edit a comment. Agents can only resolve, so it was ignored.",
  duplicate_create: "A comment was created twice; the later copy was ignored.",
  orphan_event: "A change refers to a comment that doesn't exist; it was ignored.",
};

export function warningText(code: Warning["code"]): string {
  return WARNING_TEXT[code];
}

export interface WarningGroup { code: Warning["code"]; lines: number[]; label: string }

export function warningGroups(warnings: readonly Warning[]): WarningGroup[] {
  const groups = new Map<Warning["code"], Set<number>>();
  for (const warning of warnings) {
    const lines = groups.get(warning.code) ?? new Set<number>();
    lines.add(warning.line);
    groups.set(warning.code, lines);
  }
  return [...groups].map(([code, set]) => {
    const lines = [...set].sort((a, b) => a - b);
    return { code, lines, label: `${lines.length === 1 ? "Line" : "Lines"} ${lines.join(", ")}` };
  });
}

export function warningFileText(canvasId: string): string {
  return `In .doan/comments/${canvasId}.jsonl. Ask your agent to run doan comments and fix the file.`;
}

export function pluralComments(n: number): string {
  return `${n} open comment${n === 1 ? "" : "s"}`;
}

export function emptyListText(scope: "selection" | "canvas", status: "open" | "resolved", elsewhere: number): { title: string; body: string } {
  if (status === "resolved") return scope === "selection"
    ? { title: "No resolved comments on this selection", body: "Resolved comments appear here." }
    : { title: "No resolved comments", body: "Comments you or your agent resolve appear here." };
  if (scope === "canvas") return { title: "No open comments", body: "Choose Comment on canvas, or select an element or frame." };
  return {
    title: "No open comments on this selection",
    body: elsewhere > 0
      ? `There ${elsewhere === 1 ? "is" : "are"} ${pluralComments(elsewhere)} elsewhere on this canvas; Copy all open includes ${elsewhere === 1 ? "it" : "them"}.`
      : "Comment on selection to add one.",
  };
}

export type CommentsPanelState =
  | { kind: "identity"; cause: NonNullable<IdentityCause> }
  | { kind: "panel"; read: "loading" | "failed" | "ready"; authorBlock: boolean };

// An identity problem makes loading, Git name, filters and tools meaningless, so it replaces them.
// Read failure and Git name are independent recoveries with their own Retry, so both can show.
export function commentsPanelState(identityCause: IdentityCause, read: { status: "loading" | "failed" | "ready" },
  author: { status: "ready" | "loading" | "missing" | "failed" }): CommentsPanelState {
  if (identityCause !== null) return { kind: "identity", cause: identityCause };
  return { kind: "panel", read: read.status, authorBlock: author.status !== "ready" };
}

export function identityText(cause: NonNullable<IdentityCause>, canvasId: string): { title: string; body: string } {
  if (cause === "duplicate") return { title: `Another canvas uses the ID ${canvasId}`, body: "Ask your agent to give one of them a different ID. Run doan check in a terminal to see details." };
  return { title: cause === "missing" ? "This canvas has no ID" : "This canvas ID isn't valid", body: "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details." };
}
