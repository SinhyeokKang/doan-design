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

// The dot field: malmoi's DotField (components/signin/dot-field.tsx, lib/signin/dot-field.ts at 6dcdd575)
// with doan's values. The alphas are twice malmoi's base (dogfooding #4): white dots at 0.08 barely showed on the
// light board.
export const DOT_FIELD = { gap: 12, baseRadius: 1.5, maxRadius: 2, baseAlpha: 0.16, maxAlpha: 0.5, radius: 320, speed: 320, rows: 5 } as const;

type DotContext = Pick<CanvasRenderingContext2D, "globalAlpha" | "fillStyle" | "clearRect" | "beginPath" | "moveTo" | "arc" | "fill">;

// Dots outside every spot's radius all share the base size and alpha, so they go into one path and one fill (malmoi R8):
// a full board is thousands of dots each frame. Near dots go one path per alpha step (`alphaSteps`).
export function drawDotField(ctx: DotContext, width: number, height: number, dots: Dot[], spots: readonly Dot[], color: string): void {
  const { baseRadius, maxRadius, baseAlpha, maxAlpha, radius } = DOT_FIELD;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  const { near, far } = partitionDots(dots, spots, radius);
  if (far.length) {
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    for (const dot of far) { ctx.moveTo(dot.x + baseRadius, dot.y); ctx.arc(dot.x, dot.y, baseRadius, 0, Math.PI * 2); }
    ctx.fill();
  }
  for (const step of alphaSteps(near, radius, { base: baseRadius, max: maxRadius }, { base: baseAlpha, max: maxAlpha })) {
    ctx.globalAlpha = step.alpha;
    ctx.beginPath();
    for (const dot of step.dots) { ctx.moveTo(dot.x + dot.r, dot.y); ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2); }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The field's animation frames. `draw` gets the time the cursor has travelled, or null for the still field of reduced
// motion. Paused, it asks for no frame: a hidden workspace or window still runs requestAnimationFrame, so the field
// must stop itself there. Resuming continues the sweep where it paused.
export class DotFieldLoop {
  private frame: number | null = null;
  private running = false;
  private elapsed = 0;
  private start: number | null = null;
  constructor(private readonly host: { draw(elapsed: number | null): void; reducedMotion(): boolean; request(run: (now: number) => void): number; cancel(frame: number): void }) {}

  set({ running }: { running: boolean }): void {
    if (running === this.running) return;
    this.running = running;
    this.stop();
    if (!running) return;
    if (this.host.reducedMotion()) { this.host.draw(null); return; }
    this.frame = this.host.request(this.tick);
  }

  // The canvas was resized and cleared: a running loop paints on its next frame, a paused or still one now.
  resized(): void {
    if (this.frame !== null) return;
    this.host.draw(this.host.reducedMotion() ? null : this.elapsed);
  }

  dispose(): void { this.running = false; this.stop(); }

  private stop(): void {
    if (this.frame !== null) this.host.cancel(this.frame);
    this.frame = null;
    this.start = null;
  }

  private tick = (now: number): void => {
    this.frame = null;
    if (!this.running) return;
    if (this.start === null) this.start = now - this.elapsed;
    this.elapsed = now - this.start;
    this.host.draw(this.elapsed);
    this.frame = this.host.request(this.tick);
  };
}

// The Worker's side of the field. The page transfers the canvas once (`start`) and then sends what only it can read:
// the CSS size and device pixel ratio (after the transfer it cannot set the canvas's width), the colour from its computed
// style, the motion setting, and whether the field runs (workspace, window and document shown). The Worker owns the
// loop and every draw, so the page's main thread draws nothing.
export type DotFieldSize = { width: number; height: number; ratio: number };
export type DotFieldMessage =
  | { kind: "start"; canvas: DotCanvas; size: DotFieldSize; color: string; reducedMotion: boolean }
  | { kind: "size"; size: DotFieldSize }
  | { kind: "color"; color: string }
  | { kind: "motion"; reduced: boolean }
  | { kind: "running"; running: boolean };
export interface DotCanvas { width: number; height: number; getContext(type: "2d"): (DotContext & { setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void }) | null }

export function dotFieldWorker(frames: { request(run: (now: number) => void): number; cancel(frame: number): void }): (message: DotFieldMessage) => void {
  let canvas: DotCanvas | null = null, ctx: ReturnType<DotCanvas["getContext"]> = null;
  let size = { width: 0, height: 0 }, dots: Dot[] = [], color = "", reduced = false, running = false;
  const field = new DotFieldLoop({
    reducedMotion: () => reduced,
    request: frames.request,
    cancel: frames.cancel,
    draw: elapsed => {
      if (!ctx) return;
      const { width, height } = size;
      // No spots in reduced motion: the still field has no bright place, not even a centred one.
      const spot = elapsed === null ? null : autoCursor(elapsed, width, height, DOT_FIELD.speed, DOT_FIELD.rows, DOT_FIELD.radius);
      drawDotField(ctx, width, height, dots, spot ? [spot, opposingCursor(spot, width, height)] : [], color);
    },
  });
  const resize = ({ width, height, ratio }: DotFieldSize) => {
    if (!canvas || !ctx) return;
    size = { width, height };
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    dots = dotGrid(width, height, DOT_FIELD.gap);
    field.resized();
  };
  return message => {
    switch (message.kind) {
      case "start":
        canvas = message.canvas; ctx = canvas.getContext("2d"); color = message.color; reduced = message.reducedMotion;
        resize(message.size);
        return;
      case "size": resize(message.size); return;
      // A paused or still field shows the new colour now; a running one on its next frame.
      case "color": color = message.color; field.resized(); return;
      // A change of the setting restarts the loop in the new mode.
      case "motion": reduced = message.reduced; field.set({ running: false }); field.set({ running }); return;
      case "running": running = message.running; field.set({ running }); return;
    }
  };
}
