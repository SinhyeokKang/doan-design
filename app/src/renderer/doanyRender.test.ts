import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { advance, hop, initialState, pointer, pose, typing, type Pose } from "./doanyMotion";

// Checks the shipped artwork (public/doany/) against the shader that draws it. The shader is read from
// doany.golden.json, which Doany.test.tsx pins to Doany.tsx call for call; its anchors are parsed out of
// the GLSL rather than restated here, so a moved anchor or a new artwork export is checked for real.
const golden = JSON.parse(readFileSync(new URL("./doany.golden.json", import.meta.url), "utf8")) as { scenarios: { name: string; trace?: unknown[][] }[] };
const [vertex, fragment] = golden.scenarios.find(item => item.name === "idle")!.trace!.filter(call => call[0] === "shaderSource").map(call => call[2] as string);
const number = "(-?\\d*\\.?\\d+)";
function read(source: string, pattern: string): number[] {
  const match = new RegExp(pattern.replaceAll("N", number)).exec(source);
  expect(match, `shader has ${pattern}`).not.toBeNull();
  return match!.slice(1).map(Number);
}
const hatPivot = read(vertex!, "vec2 h = p - vec2\\(N,N\\)");
const bodyPivot = read(vertex!, "vec2 q = p - vec2\\(N,N\\)");
const [rise] = read(vertex!, "q \\+= vec2\\(0\\.,N-lift\\)");
const [scale] = read(vertex!, "gl_Position = vec4\\(q\\.x\\*N,-q\\.y\\*N");
const eyes = [...fragment!.matchAll(new RegExp(`eye\\(vec2\\(${number},${number}\\)\\)`, "g"))].map(m => [Number(m[1]), Number(m[2])]);
const eyeRadius = read(fragment!, "/vec2\\(N,N\\*max");

// The vertex shader's mapping from a texture coordinate to clip space, for one layer (0 body, 1 beret).
function place([u, v]: number[], p: Pose, layer: number): [number, number] {
  let x = u!, y = v!;
  if (layer === 1) {
    const hx = x - hatPivot[0]!, hy = y - hatPivot[1]!, c = Math.cos(p.hatTilt), s = Math.sin(p.hatTilt);
    x = c * hx - s * hy + hatPivot[0]!; y = s * hx + c * hy + hatPivot[1]!;
  }
  let qx = x - bodyPivot[0]!, qy = y - bodyPivot[1]!;
  if (layer === 0) qx += p.look[0] * .018 * (1 - Math.abs(qy));
  qx *= 1 + p.squash; qy *= 1 - p.squash; qy += p.squash * .36;
  const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
  [qx, qy] = [c * qx - s * qy, s * qx + c * qy];
  qy += rise! - p.lift;
  return [qx * scale!, -qy * scale!];
}

// An 8-bit RGB or RGBA, non-interlaced PNG, enough for the artwork exports.
function png(name: string) {
  const file = readFileSync(new URL(`./public/doany/${name}`, import.meta.url));
  let offset = 8, width = 0, height = 0, channels = 0;
  const data: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset), type = file.toString("latin1", offset + 4, offset + 8), body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      expect([body[8], body[12]], `${name}: 8-bit, not interlaced`).toEqual([8, 0]);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      expect(channels, `${name}: RGB or RGBA`).toBeGreaterThan(0);
    }
    if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data)), stride = width * channels, pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, row = y * stride, source = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[row + i - channels]! : 0, b = y ? pixels[row - stride + i]! : 0, c = y && i >= channels ? pixels[row - stride + i - channels]! : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      pixels[row + i] = (raw[source + i]! + predictor) & 255;
    }
  }
  return { width, height, at: (x: number, y: number, k: number) => pixels[(y * width + x) * channels + k]! };
}

test("the still image's padding is where the shader draws both textures at rest, so loading does not jump", () => {
  const css = readFileSync(new URL("./doany.css", import.meta.url), "utf8");
  const inset = Number(/\.doany img \{ padding: ([\d.]+)%; \}/.exec(css)![1]) / 100;
  const rest: Pose = { time: 0, squash: 0, lift: 0, tilt: 0, hatTilt: 0, energy: 0, eyeOpen: 1, look: [0, 0], mode: "reduced-motion" };
  // Clip space −1…1 is the canvas; the still is the same square artwork, contained inside the padding.
  for (const layer of [0, 1]) for (const corner of [[0, 0], [1, 1]]) {
    const [x, y] = place(corner, rest, layer);
    expect([(1 + x) / 2, (1 - y) / 2].map(f => f.toFixed(9))).toEqual(corner.map(c => (c ? 1 - inset : inset).toFixed(9)));
  }
  const still = png("doany.png"), body = png("body.png"), hat = png("hat.png");
  expect([still.width, still.height]).toEqual([body.width, body.height]);
  expect([hat.width, hat.height]).toEqual([body.width, body.height]);
});

test("the shader's eyes sit on the still image's eyes, and the body texture has no eyes of its own", () => {
  const still = png("doany.png"), body = png("body.png");
  const blobs = [[0, 0, 0, Infinity, -Infinity, Infinity, -Infinity], [0, 0, 0, Infinity, -Infinity, Infinity, -Infinity]];
  // The eyes are the dark pixels on the face; the beret's dark brim reaches no lower than the eyes' top.
  for (let y = Math.round(.45 * still.height); y < .66 * still.height; y++) for (let x = Math.round(.3 * still.width); x < .72 * still.width; x++) {
    if (still.at(x, y, 3) < 128 || Math.max(still.at(x, y, 0), still.at(x, y, 1), still.at(x, y, 2)) >= 60) continue;
    const blob = blobs[x < .52 * still.width ? 0 : 1]!;
    blob[0]! += x; blob[1]! += y; blob[2]!++;
    blob[3] = Math.min(blob[3]!, x); blob[4] = Math.max(blob[4]!, x); blob[5] = Math.min(blob[5]!, y); blob[6] = Math.max(blob[6]!, y);
  }
  expect(eyes).toHaveLength(2);
  for (const [i, [sx, sy, n, left, right, top, bottom]] of blobs.entries()) {
    expect(n, `eye ${i} found`).toBeGreaterThan(1000);
    // Within 4 of 1254 texels: about a third of a device pixel in Welcome's 286px canvas.
    expect(Math.abs(sx! / n! / still.width - eyes[i]![0]!)).toBeLessThan(.003);
    expect(Math.abs(sy! / n! / still.height - eyes[i]![1]!)).toBeLessThan(.003);
    expect(Math.abs((right! - left! + 1) / 2 / still.width - eyeRadius[0]!)).toBeLessThan(.003);
    expect(Math.abs((bottom! - top! + 1) / 2 / still.height - eyeRadius[1]!)).toBeLessThan(.003);
  }
  // Inside the eyes the shader paints over, the body texture is fur: drawn eyes on top of eyes left in
  // the texture would show four.
  for (const [cx, cy] of eyes) for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) {
    if (((x / body.width - cx!) / eyeRadius[0]!) ** 2 + ((y / body.height - cy!) / eyeRadius[1]!) ** 2 > 1) continue;
    expect(Math.max(body.at(x, y, 0), body.at(x, y, 1), body.at(x, y, 2)), `body texel ${x},${y}`).toBeGreaterThan(150);
  }
});

test("the vertex shader has no radial edge waves: the Pebble outline only squashes, stretches and tilts", () => {
  expect(vertex).not.toMatch(/atan|angle|energy\*|time\*/);
});

test("through hops, repeated hops, typing and the pointer at either side, no visible texel leaves the canvas", () => {
  // The visible outline's convex hull. The map is affine except the body's gaze shift (under .002 here),
  // and the body stays well inside the canvas; the hull gave the same worst value as every outline texel.
  const outline = (name: string) => {
    const image = png(name), points: number[][] = [], seen = (x: number, y: number) => image.at(x, y, 3) > 0;
    for (let y = 0; y < image.height; y++) {
      let first = -1, last = -1;
      for (let x = 0; x < image.width; x++) if (seen(x, y)) { if (first < 0) first = x; last = x; }
      if (first >= 0) points.push([(first + .5) / image.width, (y + .5) / image.height], [(last + .5) / image.width, (y + .5) / image.height]);
    }
    for (let x = 0; x < image.width; x++) {
      let first = -1, last = -1;
      for (let y = 0; y < image.height; y++) if (seen(x, y)) { if (first < 0) first = y; last = y; }
      if (first >= 0) points.push([(x + .5) / image.width, (first + .5) / image.height], [(x + .5) / image.width, (last + .5) / image.height]);
    }
    points.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
    const half = (list: number[][]) => list.reduce<number[][]>((hull, point) => {
      while (hull.length >= 2 && cross(hull.at(-2)!, hull.at(-1)!, point) <= 0) hull.pop();
      hull.push(point);
      return hull;
    }, []).slice(0, -1);
    return [...half(points), ...half([...points].reverse())];
  };
  const layers = [outline("body.png"), outline("hat.png")];
  let worst = 0, poses = 0;
  // The beret's top comes within about a thousandth of the edge (a re-hop while settling, pointer at the
  // left), so the sweep covers 60 and 120 Hz displays: the spring's state depends on the frame step.
  for (const hz of [60, 120]) for (const side of [-1, 0, 1]) for (const start of [1, 2.6, 4.3]) for (const again of [0, .2, .45, .8]) for (const typed of [false, true]) {
    const state = initialState();
    let now = 1000;
    const frame = () => { now += 1000 / hz; advance(state, now, true, () => .5); };
    while (state.time < start) { if (side) pointer(state, side * 1e4, 57, { x: 0, y: 0, width: 114, height: 114 }); frame(); }
    if (typed) typing(state);
    hop(state, false);
    const end = state.time + 1.6;
    let repeated = !again;
    while (state.time < end) {
      if (!repeated && state.time - state.jumpAt >= again) { hop(state, false); repeated = true; }
      frame();
      const p = pose(state, false);
      poses++;
      for (const [layer, points] of layers.entries()) for (const point of points) for (const value of place(point, p, layer)) worst = Math.max(worst, Math.abs(value));
    }
  }
  expect(poses).toBeGreaterThan(15000);
  expect(worst).toBeLessThanOrEqual(1);
});
