// Any reason against it puts the card off to main's next moment; nothing is remembered here.

export const STAR_IDLE_MS = 1200;

export interface StarMomentInput {
  idleMs: number;
  windowActive: boolean;
  onboarding: boolean;
  // A card that comes up while one is open would sit under the person's attention or take part of it.
  overlayOpen: boolean;
  otherTurnBusy: boolean;
  pickOrCapture: boolean;
  cardVisible: boolean;
}

export function starPromptMoment(input: StarMomentInput): boolean {
  return input.idleMs >= STAR_IDLE_MS && input.windowActive && !input.onboarding && !input.overlayOpen && !input.otherTurnBusy && !input.pickOrCapture && !input.cardVisible;
}
