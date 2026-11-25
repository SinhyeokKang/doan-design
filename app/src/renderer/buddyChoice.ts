import type { PreferencesSnapshot } from "../main/preferences";
import { buddy } from "./buddies";
import type { BuddyFailure } from "./buddySelection";
import type { SceneEvent } from "./onboardingScene";

// The Buddy step, the existing-user buddy screen and Settings > General say a failed save the same way.
export function buddyFailureText(failure: BuddyFailure): string {
  return `Couldn’t switch to ${buddy(failure.picked).name}. ${buddy(failure.kept).name} is still your buddy.`;
}

// Before the snapshot nothing is known to keep, and a newer Doan's file is never written; a broken file can be picked
// from, since saving moves it aside.
export function buddyChoiceOff(preferences: PreferencesSnapshot | null): boolean {
  return preferences === null || preferences.notice === "newer";
}

// A pick must not revert unseen after the step is gone. Presses during a save resume before React renders the new
// scene, so the gate outlives renders, or a second Continue would skip the Agent step.
export function buddyGate({ settled, dismiss, move, generation }: {
  settled(): Promise<boolean>; dismiss(): void; move(event: SceneEvent): void; generation(): number;
}) {
  let waiting = false;
  return {
    async forward(event: SceneEvent): Promise<void> {
      if (waiting) return;
      waiting = true;
      const at = generation();
      try {
        if (!await settled() || generation() !== at) return;
      } finally { waiting = false; }
      dismiss();
      move(event);
    },
    back(): void { dismiss(); move({ type: "back" }); },
  };
}
