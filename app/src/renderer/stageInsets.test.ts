import { describe, expect, test } from "vitest";
import { stageInsets } from "./stageInsets";

const HOME = { offset: 64, min: 32 }, WELCOME = { offset: 72, min: 32 };
// The group's centre relative to the reference area's centre; negative is above.
const centre = (available: number, group: number, top: number) => top + group / 2 - available / 2;

describe("stageInsets (design '배치')", () => {
  test("where the offset fits, the group's centre sits 64px (Home) or 72px (Welcome) above the area's centre", () => {
    for (const available of [780, 900]) {
      expect(centre(available, 420, stageInsets({ available, group: 420, ...HOME }).top)).toBe(-64);
      expect(centre(available, 420, stageInsets({ available, group: 420, ...WELCOME }).top)).toBe(-72);
    }
    expect(stageInsets({ available: 780, group: 420, ...HOME })).toEqual({ top: 116, bottom: 244 });
  });

  test("a tall viewport keeps the same offset: no upper limit pins the group to the top", () => {
    for (const available of [1200, 1600, 4000]) {
      expect(centre(available, 420, stageInsets({ available, group: 420, ...HOME }).top)).toBe(-64);
      expect(centre(available, 360.5, stageInsets({ available, group: 360.5, ...WELCOME }).top)).toBe(-72);
    }
  });

  test("when the slack is less than twice the offset, the offset shrinks first and the group keeps the 32px top", () => {
    // slack = 560 - 420 - 64 = 76: half of it (38) is less than 64.
    expect(stageInsets({ available: 560, group: 420, ...HOME })).toEqual({ top: 32, bottom: 108 });
    expect(centre(560, 420, 32)).toBe(-38);
    // Exactly twice the offset is the last height with the full offset.
    expect(stageInsets({ available: 420 + 64 + 128, group: 420, ...HOME })).toEqual({ top: 32, bottom: 160 });
  });

  test("with no slack the insets are 32px each and only the overflow scrolls", () => {
    expect(stageInsets({ available: 420, group: 420, ...HOME })).toEqual({ top: 32, bottom: 32 });
    expect(stageInsets({ available: 484, group: 420, ...WELCOME })).toEqual({ top: 32, bottom: 32 });
    expect(stageInsets({ available: 300, group: 420, ...WELCOME })).toEqual({ top: 32, bottom: 32 });
  });

  test("at any height, including the 600px minimum window, the stage is never taller than its content needs", () => {
    for (const group of [360.5, 452, 540]) for (let available = 300; available <= 1400; available += 7) {
      const { top, bottom } = stageInsets({ available, group, ...HOME });
      expect(top).toBeGreaterThanOrEqual(32);
      expect(bottom).toBeGreaterThanOrEqual(32);
      // Fills the area exactly while it fits; past that, it is the content and its 32px insets: no empty scroll.
      expect(top + group + bottom).toBeCloseTo(Math.max(available, group + 64), 9);
    }
  });
});
