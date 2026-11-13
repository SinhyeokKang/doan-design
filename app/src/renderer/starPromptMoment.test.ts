import { expect, test } from "vitest";
import { STAR_IDLE_MS, starPromptMoment, type StarMomentInput } from "./starPromptMoment";

const READY: StarMomentInput = { idleMs: 1200, windowActive: true, onboarding: false, overlayOpen: false, otherTurnBusy: false, pickOrCapture: false, cardVisible: false };

test("the card shows after 1.2 s without key or pointer input, in a window in front with nothing else going on", () => {
  expect(STAR_IDLE_MS).toBe(1200);
  expect(starPromptMoment(READY)).toBe(true);
  expect(starPromptMoment({ ...READY, idleMs: 5000 })).toBe(true);
});

test.each<[string, Partial<StarMomentInput>]>([
  ["input less than 1.2 s ago", { idleMs: 1199 }],
  ["a window that is hidden or behind another app", { windowActive: false }],
  ["first run (onboarding or the buddy introduction)", { onboarding: true }],
  ["an open modal, Radix popover or menu", { overlayOpen: true }],
  ["another conversation running or waiting for an answer", { otherTurnBusy: true }],
  ["a canvas pick or Capture area", { pickOrCapture: true }],
  ["a card already shown", { cardVisible: true }],
])("%s puts the card off to the next turn's end", (_name, change) => {
  expect(starPromptMoment({ ...READY, ...change })).toBe(false);
});
