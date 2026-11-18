import { describe, expect, test } from "vitest";
import type { CanvasRect } from "./canvasMessage";
import { measureLines, type MeasureLine } from "./measure";

// Every expected line below was observed in Figma's web editor at 100 %, with the same shapes at the same canvas
// coordinates, and read off its captures in canvas px. The rules they pin are in PRODUCT §5 item 4.
const rect = (x: number, y: number, width: number, height: number): CanvasRect => ({ x, y, width, height });
const Parent = rect(100, 100, 700, 560);
const A = rect(200, 200, 120, 80);
const B = rect(400, 220, 100, 60);
const C = rect(560, 400, 80, 60);
const D = rect(270, 240, 100, 90);
const E = rect(220, 360, 90, 50);
const Box = rect(400, 440, 220, 180);
const F = rect(440.5, 490, 80, 60);

// h(a, b, y): a solid line from x = a to x = b at y; v(a, b, x): from y = a to y = b at x. hd and vd are dashed
// extensions.
const h = (from: number, to: number, at: number): MeasureLine => ({ axis: "x", from, to, at, dashed: false });
const v = (from: number, to: number, at: number): MeasureLine => ({ axis: "y", from, to, at, dashed: false });
const hd = (from: number, to: number, at: number): MeasureLine => ({ ...h(from, to, at), dashed: true });
const vd = (from: number, to: number, at: number): MeasureLine => ({ ...v(from, to, at), dashed: true });

// Figma draws its lines in no order that matters; the set of lines is what is pinned.
const key = (line: MeasureLine) => `${line.axis} ${line.at} ${line.from} ${line.to} ${line.dashed}`;
const sorted = (lines: MeasureLine[]) => [...lines].sort((a, b) => key(a).localeCompare(key(b)));
const expectLines = (selected: CanvasRect, target: CanvasRect, lines: MeasureLine[]) => expect(sorted(measureLines(selected, target))).toEqual(sorted(lines));

describe("measureLines: apart on one axis", () => {
  test("apart horizontally: one gap line on the selection's centre row; a selection edge outside the target's rows adds no edge difference", () => {
    expectLines(A, B, [h(320, 400, 240)]);
  });

  test("apart horizontally: a selection edge inside the target's rows adds that edge difference, dashed along the target's edge to the selection's far side", () => {
    expectLines(B, A, [h(320, 400, 250), v(200, 220, 450), hd(320, 500, 200)]);
  });

  test("apart vertically: a target whose columns lie inside the selection's adds both side differences", () => {
    expectLines(A, E, [v(280, 360, 260), h(200, 220, 240), vd(200, 360, 220), h(310, 320, 240), vd(200, 360, 310)]);
  });

  test("apart vertically: a gap line whose centre column misses the target gets a dashed tick to it; only the side whose selection edge lies inside the target shows", () => {
    expectLines(E, D, [v(330, 360, 265), hd(265, 270, 330), h(310, 370, 385), vd(330, 410, 370)]);
  });

  test("a gap narrower than its label is still one line", () => {
    expectLines(rect(0, 0, 60, 40), rect(64, 0, 60, 40), [h(60, 64, 20)]);
  });
});

describe("measureLines: apart on both axes", () => {
  test("both gaps from the selection's centre lines, each dashed on to the target's edge", () => {
    expectLines(A, C, [h(320, 560, 240), vd(240, 400, 560), v(280, 400, 260), hd(260, 560, 400)]);
  });

  test("fractional edges stay as they are", () => {
    expectLines(E, F, [h(310, 440.5, 385), vd(385, 490, 440.5), v(410, 490, 265), hd(265, 440.5, 490)]);
  });

  test("to a frame below and to the right", () => {
    expectLines(E, Box, [h(310, 400, 385), vd(385, 440, 400), v(410, 440, 265), hd(265, 400, 440)]);
  });
});

describe("measureLines: overlapping or containing", () => {
  test("crossing: same-side edge differences on the centre lines of the overlap", () => {
    expectLines(A, D, [h(200, 270, 260), h(320, 370, 260), v(200, 240, 295), v(280, 330, 295)]);
  });

  test("crossing a frame's edge", () => {
    expectLines(C, Box, [h(400, 560, 450), h(620, 640, 450), v(400, 440, 590), v(460, 620, 590)]);
  });

  test("inside the parent frame: the four insets", () => {
    expectLines(A, Parent, [v(100, 200, 260), h(100, 200, 240), h(320, 800, 240), v(280, 660, 260)]);
  });

  test("a frame and an element inside it measure the same both ways", () => {
    const lines = [v(440, 490, 480.5), h(400, 440.5, 520), h(520.5, 620, 520), v(550, 620, 480.5)];
    expectLines(Box, F, lines);
    expectLines(F, Box, lines);
  });

  test("leaves out an edge difference of zero, and draws nothing for the same rect", () => {
    expectLines(rect(0, 0, 100, 100), rect(0, 0, 50, 100), [h(50, 100, 50)]);
    expectLines(A, A, []);
  });
});

// The selection S is 120×60 at y 320–380, the target T is 40 high at y 200–240, 80 above. Only T's columns change.
// Each case runs both ways: S selected and Option over T, then T selected and Option over S. A side's edge difference
// shows when it is not zero and either the selection's edge lies strictly inside the target's columns or the target's
// columns lie strictly inside the selection's.
describe("measureLines: edge differences when only one axis overlaps", () => {
  const S = rect(100, 320, 120, 60);
  const T = (left: number, right: number) => rect(left, 200, right - left, 40);

  test("a target sharing the right edge and starting inside: the gap only one way, the left difference the other", () => {
    const t = T(120, 220);
    expectLines(S, t, [v(240, 320, 160)]);
    expectLines(t, S, [v(240, 320, 170), h(100, 120, 220), vd(200, 320, 100)]);
  });

  test("a target wider on both sides: both side differences, both ways", () => {
    const t = T(80, 240);
    expectLines(S, t, [v(240, 320, 160), h(80, 100, 350), vd(240, 380, 80), h(220, 240, 350), vd(240, 380, 240)]);
    expectLines(t, S, [v(240, 320, 160), h(80, 100, 220), vd(200, 320, 100), h(220, 240, 220), vd(200, 320, 220)]);
  });

  test("a target overlapping the left part: the left difference one way, the right difference the other", () => {
    const t = T(50, 150);
    expectLines(S, t, [v(240, 320, 160), hd(150, 160, 240), h(50, 100, 350), vd(240, 380, 50)]);
    expectLines(t, S, [v(240, 320, 100), h(150, 220, 220), vd(200, 320, 220)]);
  });

  test("a target narrower on both sides: both side differences, both ways", () => {
    const t = T(120, 200);
    expectLines(S, t, [v(240, 320, 160), h(100, 120, 350), vd(240, 380, 120), h(200, 220, 350), vd(240, 380, 200)]);
    expectLines(t, S, [v(240, 320, 160), h(100, 120, 220), vd(200, 320, 100), h(200, 220, 220), vd(200, 320, 220)]);
  });

  test("a target sharing the left edge and ending inside: the gap only one way, the right difference the other", () => {
    const t = T(100, 200);
    expectLines(S, t, [v(240, 320, 160)]);
    expectLines(t, S, [v(240, 320, 150), h(200, 220, 220), vd(200, 320, 220)]);
  });

  test("a target sharing the right edge and starting outside: the left difference one way, the gap only the other", () => {
    const t = T(50, 220);
    expectLines(S, t, [v(240, 320, 160), h(50, 100, 350), vd(240, 380, 50)]);
    expectLines(t, S, [v(240, 320, 135)]);
  });
});
