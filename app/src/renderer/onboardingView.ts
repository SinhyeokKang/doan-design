import type { ProjectInitResult } from "../main/shell";

export type CopyState = "idle" | "copying" | "copied" | "failed";
export const COPY_FAILED = "Couldn’t copy. Your clipboard could not be updated. Try again.";

export function tilde(path: string, home: string): string {
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

// Tab is left to the browser except where it would leave the wizard. `before` counts the controls that precede a
// focused element that is not one of them (a tabindex=-1 heading), so it moves in DOM order from there; null means
// focus is outside the wizard (on <body> after a control disabled itself) and enters at either end.
export function nextFocusIndex(count: number, index: number, shift: boolean, before: number | null): number | null {
  if (count === 0) return null;
  if (index >= 0) {
    if (!shift && index === count - 1) return 0;
    if (shift && index === 0) return count - 1;
    return null;
  }
  if (before === null) return shift ? count - 1 : 0;
  if (!shift && before === count) return 0;
  if (shift && before === 0) return count - 1;
  return null;
}

// `refused`: main's message when Open Project… could not use the picked folder.
export interface ProjectForm { running: boolean; token: string | null; error: string | null; rerooted: string | null; refused?: string | null }
export interface FormView { token: string | null; helper?: string; choose: { disabled: boolean }; setUp: { label: string; disabled: boolean }; error?: string }
export const NO_TOKEN_HELPER = "Without token CSS, doan check won’t flag hardcoded colors.";
export function formView(form: ProjectForm): FormView {
  return {
    token: form.token, ...(form.token === null ? { helper: NO_TOKEN_HELPER } : {}),
    choose: { disabled: form.running }, setUp: { label: form.running ? "Setting Up…" : "Set Up Project", disabled: form.running },
    ...(form.error ? { error: form.error } : {}),
  };
}

export function initMessage(result: ProjectInitResult): string | null {
  switch (result.kind) {
    case "success": return null;
    case "error": return [result.message, result.guidance].filter(Boolean).join(" ");
    case "cliError": return `doan CLI error: ${result.reason}`;
    case "rerooted": case "unavailable": return result.message;
  }
}
