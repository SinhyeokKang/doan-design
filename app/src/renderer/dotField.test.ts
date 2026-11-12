import { describe, expect, test, vi } from "vitest";
import { autoCursor, DOT_FIELD, dotFieldWorker, DotFieldLoop, dotGrid, dotScale, drawDotField, opposingCursor, partitionDots, type DotCanvas } from "./dotField";

describe("dotGrid", () => {
  test("lays out a 12px grid in row order, including the right and bottom edges", () => {
    expect(dotGrid(24, 12, 12)).toEqual([
      { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 24, y: 0 },
      { x: 0, y: 12 }, { x: 12, y: 12 }, { x: 24, y: 12 },
    ]);
  });

  test("does not extend past dimensions that are not multiples of the gap", () => {
    const dots = dotGrid(31, 19, 12);
    expect([...new Set(dots.map(dot => dot.x))]).toEqual([0, 12, 24]);
    expect([...new Set(dots.map(dot => dot.y))]).toEqual([0, 12]);
  });

  test.each([0, -12])("returns an empty grid for gap %s", gap => {
    expect(dotGrid(24, 12, gap)).toEqual([]);
  });

  test("keeps the origin for a zero-sized area", () => {
    expect(dotGrid(0, 0, 12)).toEqual([{ x: 0, y: 0 }]);
  });

  test("returns no points for negative dimensions", () => {
    expect(dotGrid(-1, 12, 12)).toEqual([]);
    expect(dotGrid(24, -1, 12)).toEqual([]);
  });

  test("is deterministic", () => {
    expect(dotGrid(640, 320, 12)).toEqual(dotGrid(640, 320, 12));
  });
});

describe("dotScale", () => {
  test.each([[1.5, 2], [0.08, 0.3]])("interpolates from %s to %s within 320px", (base, max) => {
    expect(dotScale(0, 320, base, max)).toBe(max);
    expect(dotScale(160, 320, base, max)).toBeCloseTo((base + max) / 2);
    expect(dotScale(320, 320, base, max)).toBe(base);
    expect(dotScale(640, 320, base, max)).toBe(base);
  });

  test("decreases monotonically with distance", () => {
    let previous = 2;
    for (let distance = 0; distance <= 640; distance += 16) {
      const scale = dotScale(distance, 320, 1.5, 2);
      expect(scale).toBeLessThanOrEqual(previous);
      expect(scale).toBeGreaterThanOrEqual(1.5);
      previous = scale;
    }
  });

  test.each([0, -320])("uses the base radius and alpha for radius %s", radius => {
    for (const distance of [0, 160, 640]) {
      expect(dotScale(distance, radius, 1.5, 2)).toBe(1.5);
      expect(dotScale(distance, radius, 0.08, 0.3)).toBe(0.08);
    }
  });
});

describe("partitionDots", () => {
  const dots = dotGrid(640, 320, 12);
  const spot = { x: 320, y: 160 };

  test("partitions every dot once without changing input order or points", () => {
    const original = [...dots];
    const { near, far } = partitionDots(dots, [spot], 320);
    const nearDots = near.map(entry => entry.dot);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(near.length + far.length).toBe(dots.length);
    expect(new Set([...nearDots, ...far])).toEqual(new Set(dots));
    expect(nearDots.filter(dot => far.includes(dot))).toEqual([]);
    expect(nearDots).toEqual(dots.filter(dot => nearDots.includes(dot)));
    expect(far).toEqual(dots.filter(dot => far.includes(dot)));
    expect(dots).toEqual(original);
  });

  test("agrees with dotScale for both radius and alpha", () => {
    const { near, far } = partitionDots(dots, [spot], 320);
    for (const { dot, distance } of near) {
      expect(distance).toBe(Math.hypot(dot.x - spot.x, dot.y - spot.y));
      expect(dotScale(distance, 320, 1.5, 2)).toBeGreaterThan(1.5);
      expect(dotScale(distance, 320, 0.08, 0.3)).toBeGreaterThan(0.08);
    }
    for (const dot of far) {
      const distance = Math.hypot(dot.x - spot.x, dot.y - spot.y);
      expect(dotScale(distance, 320, 1.5, 2)).toBe(1.5);
      expect(dotScale(distance, 320, 0.08, 0.3)).toBe(0.08);
    }
  });

  test("puts the exact radius boundary outside, including a diagonal distance", () => {
    const boundary = [{ x: 320, y: 0 }, { x: 0, y: -320 }, { x: 192, y: 256 }];
    expect(partitionDots(boundary, [{ x: 0, y: 0 }], 320)).toEqual({ near: [], far: boundary });
    expect(partitionDots([{ x: 319, y: 0 }], [{ x: 0, y: 0 }], 320).near).toHaveLength(1);
  });

  test("puts all points outside when there are no spots (reduced motion)", () => {
    expect(partitionDots(dots, [], 320)).toEqual({ near: [], far: dots });
  });

  test.each([0, -320])("puts all points outside for radius %s", radius => {
    expect(partitionDots(dots, [spot], radius)).toEqual({ near: [], far: dots });
  });

  test("accepts an empty grid", () => {
    expect(partitionDots([], [spot], 320)).toEqual({ near: [], far: [] });
  });

  test("a dot near any spot is near, at the distance to its nearest spot", () => {
    const left = { x: 0, y: 0 }, right = { x: 1000, y: 0 };
    const { near, far } = partitionDots([{ x: 10, y: 0 }, { x: 500, y: 0 }, { x: 960, y: 0 }, { x: 990, y: 0 }], [left, right], 320);
    expect(near).toEqual([
      { dot: { x: 10, y: 0 }, distance: 10 },
      { dot: { x: 960, y: 0 }, distance: 40 },
      { dot: { x: 990, y: 0 }, distance: 10 },
    ]);
    expect(far).toEqual([{ x: 500, y: 0 }]);
  });

  test("two coincident spots give the same result as one", () => {
    expect(partitionDots(dots, [spot, { ...spot }], 320)).toEqual(partitionDots(dots, [spot], 320));
  });
});

describe("opposingCursor", () => {
  const { speed, rows, radius } = DOT_FIELD;
  const width = 640, height = 715;
  const across = ((width + 2 * radius) / speed) * 1000;
  const down = ((height / (rows - 1)) / speed) * 1000;
  const cycle = rows * across + (rows - 1) * down;
  const first = (t: number) => autoCursor(t, width, height, speed, rows, radius);

  test("mirrors a spot through the centre of the area", () => {
    expect(opposingCursor({ x: 100, y: 50 }, 640, 320)).toEqual({ x: 540, y: 270 });
    expect(opposingCursor({ x: -320, y: 0 }, 640, 320)).toEqual({ x: 960, y: 320 });
  });

  test("DOT_FIELD.rows is odd, so a middle row exists where the two spots meet", () => {
    expect(rows % 2).toBe(1);
  });

  test("meets the first spot at the centre once per cycle, on the middle row", () => {
    const middle = (rows - 1) / 2;
    const centreTime = middle * (across + down) + across / 2;
    const a = first(centreTime);
    expect(a).toEqual({ x: width / 2, y: height / 2 });
    expect(opposingCursor(a, width, height)).toEqual(a);
  });

  test("passes the first spot on the middle row moving the opposite way", () => {
    const middle = (rows - 1) / 2;
    const centreTime = middle * (across + down) + across / 2;
    const dt = 100;
    const [a0, a1] = [first(centreTime - dt), first(centreTime + dt)];
    const [b0, b1] = [opposingCursor(a0, width, height), opposingCursor(a1, width, height)];
    expect(a1.x - a0.x).toBeGreaterThan(0);
    expect(b1.x - b0.x).toBeLessThan(0);
    expect(a0.y).toBe(a1.y);
    expect(b0.y).toBe(b1.y);
  });

  // t = 0 is left out: autoCursor wraps there from the last row's end back to the first row's start, off the board.
  test("walks the first spot's path backwards: equals autoCursor(cycle − t)", () => {
    for (let t = 137; t < cycle; t += 137) {
      const mirrored = opposingCursor(first(t), width, height);
      const reversed = first(cycle - t);
      expect(mirrored.x).toBeCloseTo(reversed.x, 6);
      expect(mirrored.y).toBeCloseTo(reversed.y, 6);
    }
  });

  test("does not overlap the first spot at other sampled times", () => {
    const middle = (rows - 1) / 2;
    const centreTime = middle * (across + down) + across / 2;
    for (let t = 0; t < cycle; t += 50) {
      if (Math.abs(t - centreTime) < 50) continue;
      const a = first(t);
      const b = opposingCursor(a, width, height);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
    }
  });
});

describe("autoCursor", () => {
  const width = 640;
  const height = 320;
  const speed = 320;
  const rows = 5;
  const step = 80;
  const across = 2000;
  const down = 250;
  const cycle = 11000;

  test("moves right on the first row and left on the second at 320px/s", () => {
    expect(autoCursor(0, width, height, speed, rows)).toEqual({ x: 0, y: 0 });
    expect(autoCursor(1000, width, height, speed, rows)).toEqual({ x: 320, y: 0 });
    expect(autoCursor(across + down + 1000, width, height, speed, rows)).toEqual({ x: 320, y: step });
  });

  test("joins every pair of rows with a vertical leg at the same speed", () => {
    for (let row = 0; row < rows - 1; row++) {
      const corner = row * (across + down) + across;
      const x = row % 2 === 0 ? width : 0;
      expect(autoCursor(corner, width, height, speed, rows)).toEqual({ x, y: row * step });
      expect(autoCursor(corner + down / 2, width, height, speed, rows)).toEqual({ x, y: row * step + step / 2 });
      expect(autoCursor(corner + down, width, height, speed, rows)).toEqual({ x, y: (row + 1) * step });
    }
  });

  test("stays continuous through all horizontal and vertical corners within a cycle", () => {
    let previous = autoCursor(0, width, height, speed, rows);
    for (let elapsed = 16; elapsed < cycle; elapsed += 16) {
      const current = autoCursor(elapsed, width, height, speed, rows);
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThanOrEqual(5.120001);
      previous = current;
    }
  });

  test("restarts after five rows without an extra vertical leg", () => {
    expect(autoCursor(cycle - 1, width, height, speed, rows).y).toBe(height);
    expect(autoCursor(cycle, width, height, speed, rows)).toEqual(autoCursor(0, width, height, speed, rows));
    expect(autoCursor(cycle + 1000, width, height, speed, rows)).toEqual(autoCursor(1000, width, height, speed, rows));
  });

  test("normalizes negative elapsed time into the same cycle", () => {
    expect(autoCursor(-1, width, height, speed, rows)).toEqual(autoCursor(cycle - 1, width, height, speed, rows));
  });

  test.each([
    [0, height, speed, rows], [-1, height, speed, rows],
    [width, 0, speed, rows], [width, -1, speed, rows],
    [width, height, 0, rows], [width, height, -1, rows],
    [width, height, speed, 0], [width, height, speed, -1],
  ])("returns the origin for degenerate dimensions or motion (%s, %s, %s, %s)", (w, h, s, r) => {
    expect(autoCursor(1000, w, h, s, r)).toEqual({ x: 0, y: 0 });
  });

  test("places a single row at the vertical center", () => {
    expect(autoCursor(0, width, height, speed, 1)).toEqual({ x: 0, y: height / 2 });
    expect(autoCursor(1000, width, height, speed, 1)).toEqual({ x: 320, y: height / 2 });
  });

  test("keeps an omitted overshoot identical to zero, including positive zero at left turns", () => {
    for (let elapsed = 0; elapsed <= cycle; elapsed += 7) {
      expect(autoCursor(elapsed, width, height, speed, rows, 0)).toEqual(autoCursor(elapsed, width, height, speed, rows));
    }
    expect(Object.is(autoCursor(2 * across + down * 1.5, width, height, speed, rows, 0).x, 0)).toBe(true);
  });

  test("sweeps one radius outside both edges and wraps after the expanded cycle", () => {
    const overshoot = 320;
    const expandedAcross = 4000;
    const expandedCycle = 21000;
    expect(autoCursor(0, width, height, speed, rows, overshoot)).toEqual({ x: -320, y: 0 });
    expect(autoCursor(expandedAcross / 2, width, height, speed, rows, overshoot)).toEqual({ x: 320, y: 0 });
    expect(autoCursor(expandedAcross, width, height, speed, rows, overshoot)).toEqual({ x: 960, y: 0 });
    expect(autoCursor(2 * expandedAcross + down, width, height, speed, rows, overshoot)).toEqual({ x: -320, y: step });
    expect(autoCursor(expandedCycle - 1, width, height, speed, rows, overshoot).y).toBe(height);
    expect(autoCursor(expandedCycle, width, height, speed, rows, overshoot)).toEqual({ x: -320, y: 0 });
  });

  test("turns outside the area with no dots inside the cursor radius", () => {
    const dots = dotGrid(width, height, 12);
    const expandedAcross = 4000;
    for (let row = 0; row < rows - 1; row++) {
      const corner = row * (expandedAcross + down) + expandedAcross;
      for (let elapsed = corner; elapsed <= corner + down; elapsed += 10) {
        const spot = autoCursor(elapsed, width, height, speed, rows, 320);
        expect(spot.x < 0 || spot.x > width).toBe(true);
        expect(partitionDots(dots, [spot], 320).near).toEqual([]);
      }
    }
    expect(partitionDots(dots, [autoCursor(expandedAcross / 2, width, height, speed, rows, 320)], 320).near.length).toBeGreaterThan(0);
  });

  test("keeps all overshoot row transitions continuous", () => {
    let previous = autoCursor(0, width, height, speed, rows, 320);
    for (let elapsed = 16; elapsed < 21000; elapsed += 16) {
      const current = autoCursor(elapsed, width, height, speed, rows, 320);
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThanOrEqual(5.120001);
      previous = current;
    }
  });
});

// A recorder for the 2D calls the field makes.
function recorder() {
  const calls: string[] = [];
  let alpha = 1;
  const ctx = {
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    fillStyle: "",
    clearRect: () => calls.push("clear"), beginPath: () => calls.push("begin"), moveTo: () => {}, arc: () => calls.push("arc"),
    fill: () => calls.push(`fill@${alpha.toFixed(2)}`),
  };
  return { ctx, calls };
}

describe("drawDotField", () => {
  // Dogfooding #4: at 0.08→0.3 the white dots barely showed on the light board.
  test("uses the doan values: 12px grid, radius 1.5→2, alpha 0.16→0.5, a 320px cursor sweeping 5 rows at 320px/s", () => {
    expect(DOT_FIELD).toEqual({ gap: 12, baseRadius: 1.5, maxRadius: 2, baseAlpha: 0.16, maxAlpha: 0.5, radius: 320, speed: 320, rows: 5 });
  });
  test("paints every dot outside the cursor's radius as one path, in one fill", () => {
    const { ctx, calls } = recorder();
    const dots = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 1000, y: 0 }, { x: 1012, y: 0 }];
    drawDotField(ctx, 1100, 20, dots, [{ x: 0, y: 0 }], "white");
    const fills = calls.filter(call => call.startsWith("fill"));
    // Two near dots, each with its own alpha, and one fill for both far dots at the base alpha.
    expect(fills).toHaveLength(3);
    expect(fills).toContain("fill@0.16");
    expect(calls.filter(call => call === "arc")).toHaveLength(4);
    expect(calls[0]).toBe("clear");
    expect(ctx.fillStyle).toBe("white");
  });
  test("without spots (reduced motion) every dot is far: one fill, once", () => {
    const { ctx, calls } = recorder();
    drawDotField(ctx, 100, 100, [{ x: 0, y: 0 }, { x: 12, y: 0 }], [], "white");
    expect(calls.filter(call => call.startsWith("fill"))).toEqual(["fill@0.16"]);
    expect(calls.filter(call => call === "arc")).toHaveLength(2);
  });
  // Records the radius and alpha of each arc (the alpha at the time of the call) to see how near dots are drawn.
  function arcs() {
    const drawn: { x: number; y: number; r: number; alpha: number }[] = [];
    let alpha = 1;
    const ctx = {
      get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
      fillStyle: "", clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, fill: () => {},
      arc: (x: number, y: number, r: number) => { drawn.push({ x, y, r, alpha }); },
    };
    return { ctx, drawn };
  }
  test("a dot near two overlapping spots is drawn once, at most 2px and 0.5 alpha", () => {
    const { ctx, drawn } = arcs();
    const spot = { x: 100, y: 100 };
    drawDotField(ctx, 200, 200, [{ x: 100, y: 100 }], [spot, { ...spot }], "white");
    expect(drawn).toEqual([{ x: 100, y: 100, r: 2, alpha: 0.5 }]);
  });
  test("a near dot's size and alpha follow its nearest spot", () => {
    const { ctx, drawn } = arcs();
    // 100px from the first spot, 20px from the second.
    drawDotField(ctx, 1000, 100, [{ x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 120, y: 0 }], "white");
    const { baseRadius, maxRadius, baseAlpha, maxAlpha, radius } = DOT_FIELD;
    const t = 1 - 20 / radius;
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.r).toBeCloseTo(baseRadius + (maxRadius - baseRadius) * t);
    expect(drawn[0]!.alpha).toBeCloseTo(baseAlpha + (maxAlpha - baseAlpha) * t);
  });
  test("dots near the second spot only are drawn near, the rest far", () => {
    const { ctx, calls } = recorder();
    drawDotField(ctx, 2000, 20, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1990, y: 0 }], [{ x: 0, y: 0 }, { x: 2000, y: 0 }], "white");
    // Two near dots with their own alpha, one far dot at the base alpha.
    expect(calls.filter(call => call.startsWith("fill")).sort()).toEqual(["fill@0.16", "fill@0.49", "fill@0.50"]);
  });
});

describe("DotFieldLoop", () => {
  function loop(reduced = false) {
    const frames: ((now: number) => void)[] = [];
    const cancel = vi.fn();
    const draw = vi.fn();
    const field = new DotFieldLoop({ draw, reducedMotion: () => reduced, request: run => { frames.push(run); return frames.length; }, cancel });
    return { field, frames, cancel, draw };
  }
  test("runs one frame after another while running", () => {
    const { field, frames, draw } = loop();
    field.set({ running: true });
    expect(frames).toHaveLength(1);
    frames[0]!(100); frames[1]!(116);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(3);
  });
  test("draws a cursor that moves with time", () => {
    const { field, frames, draw } = loop();
    field.set({ running: true });
    frames[0]!(1000); frames[1]!(2000);
    const [first, second] = draw.mock.calls.map(call => call[0]);
    expect(first).not.toEqual(second);
  });
  test("stops its frames when paused (hidden workspace, Overview cover, hidden window) and resumes", () => {
    const { field, frames, cancel } = loop();
    field.set({ running: true });
    field.set({ running: false });
    expect(cancel).toHaveBeenCalledWith(1);
    field.set({ running: true });
    expect(frames).toHaveLength(2);
  });
  test("reduced motion draws once without a cursor and asks for no frame", () => {
    const { field, frames, draw } = loop(true);
    field.set({ running: true });
    expect(frames).toHaveLength(0);
    expect(draw).toHaveBeenCalledWith(null);
  });
  test("a resize redraws the still frame while paused, and dispose cancels the frame", () => {
    const { field, frames, cancel, draw } = loop();
    field.set({ running: false });
    field.resized();
    expect(draw).toHaveBeenCalledTimes(1);
    field.set({ running: true });
    field.dispose();
    expect(cancel).toHaveBeenCalledWith(frames.length);
  });
});

// The Worker's side of the field: the page sends the canvas once, then sizes, colours, motion and running; the Worker
// owns the loop and every draw. Frames are injected, as the Worker's own requestAnimationFrame.
describe("dotFieldWorker", () => {
  function worker() {
    const frames = new Map<number, (now: number) => void>();
    let next = 1;
    const calls: string[] = [];
    let alpha = 1;
    const ctx = {
      get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
      fillStyle: "", transform: [] as number[],
      setTransform(...values: number[]) { ctx.transform = values; },
      clearRect: () => calls.push("clear"), beginPath: () => {}, moveTo: () => {}, arc: (_x: number, _y: number, r: number) => calls.push(r > DOT_FIELD.baseRadius ? "near" : "far"),
      fill: () => calls.push(`fill:${ctx.fillStyle}`),
    };
    const canvas: DotCanvas = { width: 0, height: 0, getContext: () => ctx };
    const receive = dotFieldWorker({ request: run => { const id = next++; frames.set(id, run); return id; }, cancel: id => { frames.delete(id); } });
    const tick = (now: number) => { const [id, run] = [...frames][0]!; frames.delete(id); run(now); };
    return { receive, frames, calls, ctx, canvas, tick };
  }
  const size = { width: 600, height: 300, ratio: 2 };

  test("start sizes the canvas in device pixels, scales the context and draws the field at once, with no frame yet", () => {
    const { receive, frames, calls, ctx, canvas } = worker();
    receive({ kind: "start", canvas, size, color: "rgb(255, 255, 255)", reducedMotion: false });
    expect([canvas.width, canvas.height]).toEqual([1200, 600]);
    expect(ctx.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(calls[0]).toBe("clear");
    expect(calls).toContain("fill:rgb(255, 255, 255)");
    expect(frames.size).toBe(0);
  });

  test("runs frame after frame while running, near dots around the spot, and asks for none when paused", () => {
    const { receive, frames, calls, canvas, tick } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: false });
    receive({ kind: "running", running: true });
    expect(frames.size).toBe(1);
    calls.length = 0;
    tick(1000); tick(1500);
    expect(calls.filter(call => call === "clear")).toHaveLength(2);
    expect(calls).toContain("near");
    expect(frames.size).toBe(1);
    receive({ kind: "running", running: false });
    expect(frames.size).toBe(0);
  });

  test("a new size while paused resizes the canvas and redraws at once, at the elapsed it carried", () => {
    const { receive, frames, calls, canvas, tick } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: false });
    receive({ kind: "running", running: true });
    tick(1000); tick(1500);
    receive({ kind: "running", running: false });
    calls.length = 0;
    receive({ kind: "size", size: { width: 400, height: 200, ratio: 1 } });
    expect([canvas.width, canvas.height]).toEqual([400, 200]);
    // Paused at 500ms in: the spot is still on the board, so some dots are near.
    expect(calls[0]).toBe("clear");
    expect(calls).toContain("near");
    expect(frames.size).toBe(0);
  });

  test("a new size while running waits for the next frame", () => {
    const { receive, frames, calls, canvas } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: false });
    receive({ kind: "running", running: true });
    calls.length = 0;
    receive({ kind: "size", size: { width: 400, height: 200, ratio: 1 } });
    expect(calls).toEqual([]);
    expect(frames.size).toBe(1);
  });

  test("reduced motion restarts the loop as the still field: no spot, no frame; motion again asks for a frame", () => {
    const { receive, frames, calls, canvas } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: false });
    receive({ kind: "running", running: true });
    calls.length = 0;
    receive({ kind: "motion", reduced: true });
    expect(frames.size).toBe(0);
    expect(calls[0]).toBe("clear");
    expect(calls).not.toContain("near");
    receive({ kind: "motion", reduced: false });
    expect(frames.size).toBe(1);
  });

  test("a change of setting while paused stays paused", () => {
    const { receive, frames, canvas } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: false });
    receive({ kind: "motion", reduced: true });
    receive({ kind: "motion", reduced: false });
    expect(frames.size).toBe(0);
  });

  test("a new colour repaints a paused or still field in it; a running one takes it on its next frame", () => {
    const { receive, frames, calls, canvas, tick } = worker();
    receive({ kind: "start", canvas, size, color: "white", reducedMotion: true });
    calls.length = 0;
    receive({ kind: "color", color: "black" });
    expect(calls).toContain("fill:black");
    receive({ kind: "motion", reduced: false });
    receive({ kind: "running", running: true });
    calls.length = 0;
    receive({ kind: "color", color: "red" });
    expect(calls).toEqual([]);
    tick(100);
    expect(calls).toContain("fill:red");
    expect(frames.size).toBe(1);
  });
});
