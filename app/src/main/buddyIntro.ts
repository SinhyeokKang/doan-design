import type { PreferencesNotice } from "./preferences";

// The buddy screen for someone who finished first run without ever saving a buddy (an earlier build, or an agent
// running `doan onboarding`, which never passes the Buddy step). Main decides it once at launch.
// buddyKey: the preferences file has a buddy key, an unknown id from a later build included; a newer or broken file
// shows nothing, as Settings does not save over them unasked.
export interface BuddyIntroInput { completed: boolean; notice: PreferencesNotice; buddyKey: boolean; onboardingOpen: boolean }

export function buddyIntroShown(input: BuddyIntroInput): boolean {
  return input.completed && !input.onboardingOpen && input.notice === null && !input.buddyKey;
}
