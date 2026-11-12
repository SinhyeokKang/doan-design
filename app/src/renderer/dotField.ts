// Ported from malmoi lib/signin/dot-field.ts at 6dcdd575 to preserve its
// continuous row turns and matching scale/partition boundary for canvas drawing.
// Several spots at once and the opposing spot (`opposingCursor`) are Doan's additions at the user's request;
// malmoi draws one spot and there is no outside source for them.
export type Dot = { x: number; y: number };

export function dotGrid(width: number, height: number, gap: number): Dot[] {
  if (gap <= 0 || width < 0 || height < 0) return [];
  const dots: Dot[] = [];
  for (let y = 0; y <= height; y += gap) {
    for (let x = 0; x <= width; x += gap) dots.push({ x, y });
  }
  return dots;
}

export function dotScale(distance: number, radius: number, base: number, max: number): number {
  if (radius <= 0 || distance >= radius) return base;
  return base + (max - base) * (1 - distance / radius);
}

// A dot is near when any spot is within the radius, and `distance` is the one to its nearest spot, so overlapping
// spots never add up: size and alpha stay within the single-spot maximum. No spots (reduced motion) leaves all far.
export function partitionDots(dots: Dot[], spots: readonly Dot[], radius: number): { near: { dot: Dot; distance: number }[]; far: Dot[] } {
  if (spots.length === 0 || radius <= 0) return { near: [], far: dots };
  const near: { dot: Dot; distance: number }[] = [];
  const far: Dot[] = [];
  for (const dot of dots) {
    let nearest = Infinity;
    for (const spot of spots) nearest = Math.min(nearest, Math.hypot(dot.x - spot.x, dot.y - spot.y));
    if (nearest < radius) near.push({ dot, distance: nearest });
    else far.push(dot);
  }
  return { near, far };
}

// Near dots grouped by their alpha rounded to an 8-bit step, each keeping its own radius, so a frame draws one path
// and one fill per step instead of one fill per dot (thousands per frame). The canvas stores 8-bit channels, so a step
// is within half a level of each dot's own alpha. Groups come in order of first appearance, dots in input order.
export interface AlphaStep { alpha: number; dots: { x: number; y: number; r: number }[] }
export function alphaSteps(near: readonly { dot: Dot; distance: number }[], radius: number, size: { base: number; max: number }, alpha: { base: number; max: number }): AlphaStep[] {
  const steps = new Map<number, AlphaStep>();
  for (const { dot, distance } of near) {
    const level = Math.round(dotScale(distance, radius, alpha.base, alpha.max) * 255);
    let step = steps.get(level);
    if (!step) { step = { alpha: level / 255, dots: [] }; steps.set(level, step); }
    step.dots.push({ x: dot.x, y: dot.y, r: dotScale(distance, radius, size.base, size.max) });
  }
  return [...steps.values()];
}

// The spot's point reflection through the area's centre. With an odd row count, `autoCursor`'s zig-zag reflected this
// way is the same path walked backwards at the same speed, and the two spots cross at the centre on the middle row.
export function opposingCursor(spot: Dot, width: number, height: number): Dot {
  return { x: width - spot.x, y: height - spot.y };
}

export function autoCursor(
  elapsed: number,
  width: number,
  height: number,
  speed: number,
  rows: number,
  overshoot = 0,
): Dot {
  if (width <= 0 || height <= 0 || speed <= 0 || rows <= 0) return { x: 0, y: 0 };
  if (rows === 1) return { x: legWithin(elapsed, width, speed, 0, overshoot), y: height / 2 };

  const step = height / (rows - 1);
  const acrossMs = ((width + 2 * overshoot) / speed) * 1000;
  const downMs = (step / speed) * 1000;
  const cycle = rows * acrossMs + (rows - 1) * downMs;
  let remaining = ((elapsed % cycle) + cycle) % cycle;

  for (let row = 0; row < rows; row++) {
    if (remaining < acrossMs) {
      return { x: legWithin(remaining, width, speed, row, overshoot), y: row * step };
    }
    remaining -= acrossMs;
    if (row === rows - 1) break;
    if (remaining < downMs) {
      // Keeping x at the row endpoint avoids teleporting between rows.
      return { x: row % 2 === 0 ? width + overshoot : 0 - overshoot, y: row * step + (remaining / downMs) * step };
    }
    remaining -= downMs;
  }
  return { x: (rows - 1) % 2 === 0 ? width + overshoot : 0 - overshoot, y: height };
}

function legWithin(elapsed: number, width: number, speed: number, row: number, overshoot: number): number {
  const span = width + 2 * overshoot;
  const progress = Math.min(1, (elapsed / 1000) * speed / span);
  return row % 2 === 0 ? progress * span - overshoot : span - progress * span - overshoot;
}
