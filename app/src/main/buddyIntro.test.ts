import { expect, test } from "vitest";
import { buddyIntroShown, type BuddyIntroInput } from "./buddyIntro";

const finished: BuddyIntroInput = { completed: true, notice: null, buddyKey: false, onboardingOpen: false };

test("someone who finished first run and never saved a buddy sees the buddy screen", () => {
  expect(buddyIntroShown(finished)).toBe(true);
});

test("a saved buddy, an unknown id from a later build, a newer or a broken file keeps it closed", () => {
  expect(buddyIntroShown({ ...finished, buddyKey: true })).toBe(false);
  expect(buddyIntroShown({ ...finished, notice: "newer" })).toBe(false);
  expect(buddyIntroShown({ ...finished, notice: "broken" })).toBe(false);
});

test("first run open, or not finished, never shows it: first run has its own Buddy step", () => {
  expect(buddyIntroShown({ ...finished, completed: false, onboardingOpen: true })).toBe(false);
  expect(buddyIntroShown({ ...finished, onboardingOpen: true })).toBe(false);
  expect(buddyIntroShown({ ...finished, completed: false })).toBe(false);
});

// `doan onboarding` writes only the completion record; the buddy step was never passed.
test("after an agent finished first run with doan onboarding, the next launch shows it", () => {
  const launchDuringRun = { completed: false, notice: null, buddyKey: false, onboardingOpen: true } as const;
  expect(buddyIntroShown(launchDuringRun)).toBe(false);
  const nextLaunch = { ...launchDuringRun, completed: true, onboardingOpen: false };
  expect(buddyIntroShown(nextLaunch)).toBe(true);
});
