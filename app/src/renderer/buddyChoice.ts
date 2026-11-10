import type { PreferencesSnapshot } from "../main/preferences";
import { buddy } from "./buddies";
import type { BuddyFailure } from "./buddySelection";
import type { SceneEvent } from "./onboardingScene";

// The Buddy step, the existing-user buddy screen and Settings > General say a failed save the same way.
export function buddyFailureText(failure: BuddyFailure): string {
  return `Couldn’t switch to ${buddy(failure.picked).name}. ${buddy(failure.kept).name} is still your buddy.`;
}

// Before the snapshot arrives nothing is known to keep, and a newer Doan's file is never written, so neither can be
// picked from; a broken file can, since saving moves it aside.
export function buddyChoiceOff(preferences: PreferencesSnapshot | null): boolean {
  return preferences === null || preferences.notice === "newer";
}

// Leaving the Buddy step forward (Continue and the stepper's forward pills alike) waits for the latest pick's save: a
// pick must not revert unseen after the step is gone. A failure keeps the step with its notice; a move whose scene
// changed meanwhile is dropped. Back leaves at once.
// Only one forward waits at a time: presses during a save all resume before React renders the new scene, so the
// generation check alone would let a second Continue apply to the Agent step and skip it. The gate must therefore
// outlive renders (Wizard keeps one).
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
