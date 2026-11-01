// Ported from malmoi lib/signin/dot-field.ts at 6dcdd575 to preserve its
// continuous row turns and matching scale/partition boundary for canvas drawing.
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

export function partitionDots(dots: Dot[], spot: Dot | null, radius: number): { near: Dot[]; far: Dot[] } {
  if (spot === null || radius <= 0) return { near: [], far: dots };
  const near: Dot[] = [];
  const far: Dot[] = [];
  for (const dot of dots) {
    (Math.hypot(dot.x - spot.x, dot.y - spot.y) < radius ? near : far).push(dot);
  }
  return { near, far };
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
