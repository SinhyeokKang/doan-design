import { describe, expect, test } from "vitest";
import type { CanvasRect } from "./canvasMessage";
import { measureLines, type MeasureLine } from "./measure";

// The shapes of the Figma observation file (canvas coordinates), measured at 100 % in its web editor.
const rect = (x: number, y: number, width: number, height: number): CanvasRect => ({ x, y, width, height });
const Parent = rect(100, 100, 700, 560);
const A = rect(200, 200, 120, 80);
const B = rect(400, 220, 100, 60);
const C = rect(560, 400, 80, 60);
const D = rect(270, 240, 100, 90);
const E = rect(220, 360, 90, 50);
const Box = rect(400, 440, 220, 180);
const F = rect(440.5, 490, 80, 60);

// `H a→b @y` and `V a→b @x` of the observation table; the d variants are its dashed extensions.
const h = (from: number, to: number, at: number): MeasureLine => ({ axis: "x", from, to, at, dashed: false });
const v = (from: number, to: number, at: number): MeasureLine => ({ axis: "y", from, to, at, dashed: false });
const hd = (from: number, to: number, at: number): MeasureLine => ({ ...h(from, to, at), dashed: true });
const vd = (from: number, to: number, at: number): MeasureLine => ({ ...v(from, to, at), dashed: true });

// Figma draws its lines in no order that matters; the set of lines is what is pinned.
const key = (line: MeasureLine) => `${line.axis} ${line.at} ${line.from} ${line.to} ${line.dashed}`;
const sorted = (lines: MeasureLine[]) => [...lines].sort((a, b) => key(a).localeCompare(key(b)));
const expectLines = (selected: CanvasRect, target: CanvasRect, lines: MeasureLine[]) => expect(sorted(measureLines(selected, target))).toEqual(sorted(lines));

describe("measureLines: apart on one axis", () => {
  test("01: the gap on the selection's centre line, without the top edge difference A's top edge outside B's range would give", () => {
    expectLines(A, B, [h(320, 400, 240)]);
  });

  test("17: the gap and the top edge difference whose selection edge lies inside the target's range, extended along the target's edge", () => {
    expectLines(B, A, [h(320, 400, 250), v(200, 220, 450), hd(320, 500, 200)]);
  });

  test("04: both side differences when the target's range lies inside the selection's", () => {
    expectLines(A, E, [v(280, 360, 260), h(200, 220, 240), vd(200, 360, 220), h(310, 320, 240), vd(200, 360, 310)]);
  });

  test("16: a gap whose centre line misses the target gets a dashed tick to it; only the right edge difference shows", () => {
    expectLines(E, D, [v(330, 360, 265), hd(265, 270, 330), h(310, 370, 385), vd(330, 410, 370)]);
  });

  test("25: a gap narrower than its label is still one line", () => {
    expectLines(rect(0, 0, 60, 40), rect(64, 0, 60, 40), [h(60, 64, 20)]);
  });
});

describe("measureLines: apart on both axes", () => {
  test("02: both gaps from the selection's centre lines, each extended to the target's edge", () => {
    expectLines(A, C, [h(320, 560, 240), vd(240, 400, 560), v(280, 400, 260), hd(260, 560, 400)]);
  });

  test("13: fractional edges stay as they are", () => {
    expectLines(E, F, [h(310, 440.5, 385), vd(385, 490, 440.5), v(410, 490, 265), hd(265, 440.5, 490)]);
  });

  test("14: to a frame below and to the right", () => {
    expectLines(E, Box, [h(310, 400, 385), vd(385, 440, 400), v(410, 440, 265), hd(265, 400, 440)]);
  });
});

describe("measureLines: overlapping or containing", () => {
  test("03: same-side edge differences on the centre lines of the overlap", () => {
    expectLines(A, D, [h(200, 270, 260), h(320, 370, 260), v(200, 240, 295), v(280, 330, 295)]);
  });

  test("15: crossing a frame's edge", () => {
    expectLines(C, Box, [h(400, 560, 450), h(620, 640, 450), v(400, 440, 590), v(460, 620, 590)]);
  });

  test("05: inside the parent frame, the four insets", () => {
    expectLines(A, Parent, [v(100, 200, 260), h(100, 200, 240), h(320, 800, 240), v(280, 660, 260)]);
  });

  test("11 and 12: a frame and an element inside it measure the same both ways", () => {
    const lines = [v(440, 490, 480.5), h(400, 440.5, 520), h(520.5, 620, 520), v(550, 620, 480.5)];
    expectLines(Box, F, lines);
    expectLines(F, Box, lines);
  });

  test("leaves out an edge difference of zero, and draws nothing for the same rect", () => {
    expectLines(rect(0, 0, 100, 100), rect(0, 0, 50, 100), [h(50, 100, 50)]);
    expectLines(A, A, []);
  });
});

// The Rules frame: the selection S is 120×60 at y 320–380, the target T is 40 high at y 200–240, 80 above. Only T's
// horizontal range changes (x0 = 100). Each case runs both ways: S selected and ⌥ over T, then T selected and ⌥ over S.
describe("measureLines: edge differences when only one axis overlaps (cases 19–24)", () => {
  const S = rect(100, 320, 120, 60);
  const T = (left: number, right: number) => rect(left, 200, right - left, 40);

  test("19 (T1): S→T shows the gap only; T→S shows the left 20", () => {
    const t = T(120, 220);
    expectLines(S, t, [v(240, 320, 160)]);
    expectLines(t, S, [v(240, 320, 170), h(100, 120, 220), vd(200, 320, 100)]);
  });

  test("20 (T2): both sides 20, both ways", () => {
    const t = T(80, 240);
    expectLines(S, t, [v(240, 320, 160), h(80, 100, 350), vd(240, 380, 80), h(220, 240, 350), vd(240, 380, 240)]);
    expectLines(t, S, [v(240, 320, 160), h(80, 100, 220), vd(200, 320, 100), h(220, 240, 220), vd(200, 320, 220)]);
  });

  test("21 (T3): S→T shows the left 50; T→S shows the right 70", () => {
    const t = T(50, 150);
    expectLines(S, t, [v(240, 320, 160), hd(150, 160, 240), h(50, 100, 350), vd(240, 380, 50)]);
    expectLines(t, S, [v(240, 320, 100), h(150, 220, 220), vd(200, 320, 220)]);
  });

  test("22 (T4): both sides 20, both ways", () => {
    const t = T(120, 200);
    expectLines(S, t, [v(240, 320, 160), h(100, 120, 350), vd(240, 380, 120), h(200, 220, 350), vd(240, 380, 200)]);
    expectLines(t, S, [v(240, 320, 160), h(100, 120, 220), vd(200, 320, 100), h(200, 220, 220), vd(200, 320, 220)]);
  });

  test("23 (T5): S→T shows the gap only; T→S shows the right 20", () => {
    const t = T(100, 200);
    expectLines(S, t, [v(240, 320, 160)]);
    expectLines(t, S, [v(240, 320, 150), h(200, 220, 220), vd(200, 320, 220)]);
  });

  test("24 (T6): S→T shows the left 50; T→S shows the gap only", () => {
    const t = T(50, 220);
    expectLines(S, t, [v(240, 320, 160), h(50, 100, 350), vd(240, 380, 50)]);
    expectLines(t, S, [v(240, 320, 135)]);
  });
});
