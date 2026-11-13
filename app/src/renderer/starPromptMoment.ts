// Whether the GitHub star card shows now, after main's moment. Any reason against it puts the card off to main's next
// moment, at the next successful turn's end; nothing is remembered here.

export const STAR_IDLE_MS = 1200;

// Surfaces the card must not appear beside: modal dialogs, Radix popovers (role="dialog" content), menus and the
// frame list. A card that comes up while one is open would sit under the person's attention or take part of it.
export const STAR_OVERLAY_QUERY = 'dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog), [role="menu"], [role="listbox"]';

export interface StarMomentInput {
  // Since the last key or pointer input.
  idleMs: number;
  // Shown and in front of other apps.
  windowActive: boolean;
  // First run: onboarding or the buddy introduction.
  onboarding: boolean;
  overlayOpen: boolean;
  // Another conversation running, or waiting for a permission or question answer.
  otherTurnBusy: boolean;
  // A canvas pick or Capture area.
  pickOrCapture: boolean;
  cardVisible: boolean;
}

export function starPromptMoment(input: StarMomentInput): boolean {
  return input.idleMs >= STAR_IDLE_MS && input.windowActive && !input.onboarding && !input.overlayOpen && !input.otherTurnBusy && !input.pickOrCapture && !input.cardVisible;
}
