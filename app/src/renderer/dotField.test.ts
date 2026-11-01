import { describe, expect, test } from "vitest";
import { autoCursor, dotGrid, dotScale, partitionDots } from "./dotField";

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
    const { near, far } = partitionDots(dots, spot, 320);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(near.length + far.length).toBe(dots.length);
    expect(new Set([...near, ...far])).toEqual(new Set(dots));
    expect(near.filter(dot => far.includes(dot))).toEqual([]);
    expect(near).toEqual(dots.filter(dot => near.includes(dot)));
    expect(far).toEqual(dots.filter(dot => far.includes(dot)));
    expect(dots).toEqual(original);
  });

  test("agrees with dotScale for both radius and alpha", () => {
    const { near, far } = partitionDots(dots, spot, 320);
    for (const dot of near) {
      const distance = Math.hypot(dot.x - spot.x, dot.y - spot.y);
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
    expect(partitionDots(boundary, { x: 0, y: 0 }, 320)).toEqual({ near: [], far: boundary });
    expect(partitionDots([{ x: 319, y: 0 }], { x: 0, y: 0 }, 320).near).toHaveLength(1);
  });

  test("puts all points outside when there is no cursor", () => {
    expect(partitionDots(dots, null, 320)).toEqual({ near: [], far: dots });
  });

  test.each([0, -320])("puts all points outside for radius %s", radius => {
    expect(partitionDots(dots, spot, radius)).toEqual({ near: [], far: dots });
  });

  test("accepts an empty grid", () => {
    expect(partitionDots([], spot, 320)).toEqual({ near: [], far: [] });
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
        expect(partitionDots(dots, spot, 320).near).toEqual([]);
      }
    }
    expect(partitionDots(dots, autoCursor(expandedAcross / 2, width, height, speed, rows, 320), 320).near.length).toBeGreaterThan(0);
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
