import type { PreferencesNotice } from "./preferences";

// For someone who finished first run without saving a buddy (an agent's `doan onboarding` never passes that step).
// buddyKey: the file has a buddy key; a newer or broken file shows nothing, as Settings does not save over it unasked.
export interface BuddyIntroInput { completed: boolean; notice: PreferencesNotice; buddyKey: boolean; onboardingOpen: boolean }

export function buddyIntroShown(input: BuddyIntroInput): boolean {
  return input.completed && !input.onboardingOpen && input.notice === null && !input.buddyKey;
}
