import { describe, expect, test } from "vitest";
import { ERASE_MS, TYPE_MS, TYPING_CAP_MS, typingSteps } from "./noticeTyping";

// work-update A5b (design decisions 19–20): the notice's erase-and-type steps, by grapheme, keeping the common start.
const widths = { fromWidth: 200, toWidth: 120 };
const texts = (steps: ReturnType<typeof typingSteps>) => steps.map(step => step.text);

describe("typingSteps", () => {
  test("the shipped speeds: 20 ms per erased and 35 ms per typed character, within 1,000 ms", () => {
    expect([ERASE_MS, TYPE_MS, TYPING_CAP_MS]).toEqual([20, 35, 1000]);
  });

  test("keeps the common start: only 'Plans' is erased and only 'Checkout' typed", () => {
    const steps = typingSteps("Working on Plans", "Working on Checkout", widths);
    expect(texts(steps)).toEqual([
      "Working on Plan", "Working on Pla", "Working on Pl", "Working on P", "Working on ",
      "Working on C", "Working on Ch", "Working on Che", "Working on Chec", "Working on Check", "Working on Checko", "Working on Checkou", "Working on Checkout",
    ]);
  });

  test("a short change keeps 20 and 35 ms per character", () => {
    const steps = typingSteps("Working on Plans", "Working on Checkout", widths);
    expect(steps.map(step => step.at)).toEqual([20, 40, 60, 80, 100, 135, 170, 205, 240, 275, 310, 345, 380]);
  });

  test("starting from no text types the whole new text", () => {
    const steps = typingSteps("", "Agent is working", widths);
    expect(steps).toHaveLength(16);
    expect(steps[0]).toEqual({ text: "A", at: 35, minWidth: 120 });
    expect(steps.at(-1)).toEqual({ text: "Agent is working", at: 560, minWidth: null });
  });

  test("a long change is scaled down to finish within 1,000 ms, both intervals by the same ratio", () => {
    const from = "a".repeat(30), to = "b".repeat(30);
    const steps = typingSteps(from, to, widths);
    expect(steps).toHaveLength(60);
    expect(steps.at(-1)!.at).toBeCloseTo(1000);
    const ratio = 1000 / (30 * 20 + 30 * 35);
    expect(steps[0]!.at).toBeCloseTo(20 * ratio);
    expect(steps[30]!.at - steps[29]!.at).toBeCloseTo(35 * ratio);
  });

  test("Hangul syllables and emoji are whole characters", () => {
    expect(texts(typingSteps("요금제 빈 상태", "요금제 결제", widths))).toEqual(["요금제 빈 상", "요금제 빈 ", "요금제 빈", "요금제 ", "요금제 결", "요금제 결제"]);
    // Two family emoji share their first code points but are different characters: no common start inside them.
    expect(texts(typingSteps("Plans 👩‍👩‍👧", "Plans 👩‍👩‍👦", widths))).toEqual(["Plans ", "Plans 👩‍👩‍👦"]);
  });

  test("the width floor is the shorter text's width on every step but the last", () => {
    const shorter = typingSteps("Working on Plans", "Working on Checkout", { fromWidth: 140, toWidth: 180 });
    expect(shorter.slice(0, -1).every(step => step.minWidth === 140)).toBe(true);
    const longer = typingSteps("Working on Checkout", "Working on Plans", { fromWidth: 180, toWidth: 140 });
    expect(longer.slice(0, -1).every(step => step.minWidth === 140)).toBe(true);
    expect(shorter.at(-1)!.minWidth).toBeNull();
    expect(longer.at(-1)!.minWidth).toBeNull();
  });

  test("a replacement midway starts from the text on screen: the caller passes it as `from`", () => {
    const first = typingSteps("Working on Plans", "Working on Checkout", widths);
    const onScreen = first[6]!.text;
    expect(onScreen).toBe("Working on Ch");
    expect(texts(typingSteps(onScreen, "Working on Cart", widths))).toEqual(["Working on C", "Working on Ca", "Working on Car", "Working on Cart"]);
  });

  test("the same text has no steps", () => {
    expect(typingSteps("Agent is working", "Agent is working", widths)).toEqual([]);
  });
});
