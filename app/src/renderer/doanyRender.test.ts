import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { BUDDY_IDS, buddy, type BuddyId } from "./buddies";
import { drawnPose, fragmentFor, vertexFor } from "./Doany";
import { advance, hop, initialState, pointer, pose, typing, type Pose } from "./doanyMotion";

// Checks each buddy's artwork against the shader that draws it. Doany's shader is read from doany.golden.json,
// which Doany.test.tsx pins to Doany.tsx call for call; the friends' come from the exported templates, which
// Doany.test.tsx checks the same way. Anchors are parsed out of the GLSL rather than restated here, so a moved
// anchor or a new artwork export is checked for real.
const golden = JSON.parse(readFileSync(new URL("./doany.golden.json", import.meta.url), "utf8")) as { scenarios: { name: string; trace?: unknown[][] }[] };
const [doanyVertex, doanyFragment] = golden.scenarios.find(item => item.name === "idle")!.trace!.filter(call => call[0] === "shaderSource").map(call => call[2] as string);
const number = "(-?\\d*\\.?\\d+)";
function read(source: string, pattern: string): number[] {
  const match = new RegExp(pattern.replaceAll("N", number)).exec(source);
  expect(match, `shader has ${pattern}`).not.toBeNull();
  return match!.slice(1).map(Number);
}
interface Anchors { hatPivot: number[]; bodyPivot: number[]; rise: number; scale: number; eyes: number[][]; eyeRadius: number[] }
function anchors(id: BuddyId): Anchors & { vertex: string; fragment: string } {
  const vertex = id === "doany" ? doanyVertex! : vertexFor(buddy(id).rig), fragment = id === "doany" ? doanyFragment! : fragmentFor(buddy(id).rig);
  return {
    vertex, fragment,
    hatPivot: read(vertex, "vec2 h = p - vec2\\(N,N\\)"),
    bodyPivot: read(vertex, "vec2 q = p - vec2\\(N,N\\)"),
    rise: read(vertex, "q \\+= vec2\\(0\\.,N-lift\\)")[0]!,
    scale: read(vertex, "gl_Position = vec4\\(q\\.x\\*N,-q\\.y\\*N")[0]!,
    eyes: [...fragment.matchAll(new RegExp(`spriteEye\\(vec2\\(${number},${number}\\)\\)`, "g"))].map(m => [Number(m[1]), Number(m[2])]),
    eyeRadius: read(fragment, "/vec2\\(N,N\\);"),
  };
}

// The vertex shader's mapping from a texture coordinate to clip space, for one layer (0 body, 1 accessory), with the
// pose's rotations worked out once for every point. It returns the same pair each call, so the canvas bound's
// hundreds of millions of points allocate nothing.
function mapping(p: Pose, layer: number, { hatPivot, bodyPivot, rise, scale }: Anchors): (u: number, v: number) => readonly [number, number] {
  const hc = Math.cos(p.hatTilt), hs = Math.sin(p.hatTilt), c = Math.cos(p.tilt), s = Math.sin(p.tilt);
  const [hu, hv] = hatPivot as [number, number], [bu, bv] = bodyPivot as [number, number];
  const look = p.look[0], squash = p.squash, risen = rise - p.lift, out: [number, number] = [0, 0];
  return (u, v) => {
    let x = u, y = v;
    if (layer === 1) {
      const hx = x - hu, hy = y - hv;
      x = hc * hx - hs * hy + hu; y = hs * hx + hc * hy + hv;
    }
    let qx = x - bu, qy = y - bv;
    if (layer === 0) qx += look * .018 * (1 - Math.abs(qy));
    qx *= 1 + squash; qy *= 1 - squash; qy += squash * .36;
    const rx = c * qx - s * qy;
    qy = s * qx + c * qy + risen;
    out[0] = rx * scale; out[1] = -qy * scale;
    return out;
  };
}
const place = ([u, v]: number[], p: Pose, layer: number, shader: Anchors) => mapping(p, layer, shader)(u!, v!);

// Doany's 1254² textures ship in public/doany/. The friends' app copies are 512², where Dori's eyes fall under the
// blob size below, so the friends are checked on their 1254² originals; the rig's UV numbers hold for both.
function layer(id: BuddyId, name: "still" | "body" | "accessory") {
  if (id === "doany") return png(new URL(`./public/doany/${{ still: "doany", body: "body", accessory: "hat" }[name]}.png`, import.meta.url));
  return png(new URL(`../../../.doan/assets/buddies/${id}/${name}.png`, import.meta.url));
}
// The dark-eye threshold (maximum RGB channel) each buddy's eyes were measured with: Doany's below 60, the friends'
// below 85 (.doan/assets/buddies/README.md).
const DARK: Record<BuddyId, number> = { doany: 60, puri: 85, dungdung: 85, popo: 85, dori: 85 };

// An 8-bit RGB or RGBA, non-interlaced PNG, enough for the artwork exports.
function png(url: URL) {
  const file = readFileSync(url), name = url.pathname.split("/").slice(-2).join("/");
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

test("each still image's padding is where the shader draws both textures at rest, so loading does not jump", () => {
  const css = readFileSync(new URL("./doany.css", import.meta.url), "utf8");
  const inset = Number(/\.doany img \{ padding: ([\d.]+)%; \}/.exec(css)![1]) / 100;
  const rest: Pose = { time: 0, squash: 0, lift: 0, tilt: 0, hatTilt: 0, energy: 0, eyeOpen: 1, look: [0, 0], mode: "reduced-motion" };
  for (const id of BUDDY_IDS) {
    const shader = anchors(id);
    expect(buddy(id).rig.padding, id).toBe(`${inset * 100}%`);
    // Clip space −1…1 is the canvas; the still is the same square artwork, contained inside the padding.
    for (const l of [0, 1]) for (const corner of [[0, 0], [1, 1]]) {
      const [x, y] = place(corner, rest, l, shader);
      expect([(1 + x) / 2, (1 - y) / 2].map(f => f.toFixed(9)), id).toEqual(corner.map(c => (c ? 1 - inset : inset).toFixed(9)));
    }
    const still = layer(id, "still"), body = layer(id, "body"), hat = layer(id, "accessory");
    expect([still.width, still.height], id).toEqual([body.width, body.height]);
    expect([hat.width, hat.height], id).toEqual([body.width, body.height]);
  }
});

test("each shader's eyes sit on its still image's eyes, and its body texture has no eyes of its own", () => {
  for (const id of BUDDY_IDS) {
    const { eyes, eyeRadius } = anchors(id), still = layer(id, "still"), body = layer(id, "body"), dark = DARK[id];
    expect(eyes, id).toHaveLength(2);
    expect(eyes, id).toEqual(buddy(id).rig.eyes.map(pair => pair.split(",").map(Number)));
    for (const [i, [cx, cy]] of eyes.entries()) {
      // The eye is the dark, opaque blob at the registry's centre, searched within what eye.png covers (±1.35 radii):
      // Popo's glasses frame is as dark and reaches into that box, but does not touch the eye.
      const x0 = Math.floor((cx! - 1.35 * eyeRadius[0]!) * still.width), x1 = Math.ceil((cx! + 1.35 * eyeRadius[0]!) * still.width);
      const y0 = Math.floor((cy! - 1.35 * eyeRadius[1]!) * still.height), y1 = Math.ceil((cy! + 1.35 * eyeRadius[1]!) * still.height);
      const isDark = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && still.at(x, y, 3) >= 128 && Math.max(still.at(x, y, 0), still.at(x, y, 1), still.at(x, y, 2)) < dark;
      const seen = new Set<number>(), queue = [[Math.round(cx! * still.width), Math.round(cy! * still.height)]];
      expect(isDark(queue[0]![0]!, queue[0]![1]!), `${id} eye ${i} centre is dark`).toBe(true);
      let n = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      while (queue.length) {
        const [x, y] = queue.pop()!;
        if (seen.has(y! * still.width + x!) || !isDark(x!, y!)) continue;
        seen.add(y! * still.width + x!);
        n++; left = Math.min(left, x!); right = Math.max(right, x!); top = Math.min(top, y!); bottom = Math.max(bottom, y!);
        queue.push([x! + 1, y!], [x! - 1, y!], [x!, y! + 1], [x!, y! - 1]);
      }
      expect(n, `${id} eye ${i} found`).toBeGreaterThan(1000);
      // Within 4 of 1254 texels: about a third of a device pixel in a 286px canvas.
      expect(Math.abs((left + right + 1) / 2 / still.width - cx!), `${id} eye ${i} x`).toBeLessThan(.003);
      expect(Math.abs((top + bottom + 1) / 2 / still.height - cy!), `${id} eye ${i} y`).toBeLessThan(.003);
      expect(Math.abs((right - left + 1) / 2 / still.width - eyeRadius[0]!), `${id} eye ${i} x radius`).toBeLessThan(.003);
      expect(Math.abs((bottom - top + 1) / 2 / still.height - eyeRadius[1]!), `${id} eye ${i} y radius`).toBeLessThan(.003);
    }
    // Inside the eyes the shader paints over, the body texture is plush: drawn eyes on top of eyes left in the
    // texture would show four.
    for (const [cx, cy] of eyes) for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) {
      if (((x / body.width - cx!) / eyeRadius[0]!) ** 2 + ((y / body.height - cy!) / eyeRadius[1]!) ** 2 > 1) continue;
      expect(Math.max(body.at(x, y, 0), body.at(x, y, 1), body.at(x, y, 2)), `${id} body texel ${x},${y}`).toBeGreaterThanOrEqual(dark);
    }
  }
});

test("no vertex shader has radial edge waves: each outline only squashes, stretches and tilts", () => {
  for (const id of BUDDY_IDS) expect(anchors(id).vertex, id).not.toMatch(/atan|angle|energy\*|time\*/);
});

// The visible outline's convex hull. The map is affine except the body's gaze shift (under .002 here),
// and the body stays well inside the canvas; the hull gave the same worst value as every outline texel.
function outline(image: ReturnType<typeof png>): number[][] {
  const points: number[][] = [], seen = (x: number, y: number) => image.at(x, y, 3) > 0;
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
}

// Presses only restart the body's hop curve, so its poses are those of single hops started at every
// phase of the breath and the gaze; what presses pile up is the accessory spring. Each drawn pose is
// therefore also checked with the accessory at both ends of its bound, which covers any press sequence,
// and the sequences below (re-hops while settling, presses every 80 or 33 ms) check the spring itself.
// The motion model is the same for every buddy, so the poses are made once. Over half the frames repeat
// a pose exactly in every field the mapping and drawnPose read (the settled tails, the same start under
// both rates), and those are kept once: bounding a pose twice finds nothing new.
let made: { frames: number; poses: Pose[] } | null = null;
function motionPoses(): { frames: number; poses: Pose[] } {
  if (made) return made;
  const sequences = [[0], [0, .1], [0, .2], [0, .3], [0, .45], [0, .8], Array.from({ length: 10 }, (_, i) => i * .08), Array.from({ length: 30 }, (_, i) => i * .033)];
  const rect = { x: 0, y: 0, width: 114, height: 114 };
  const poses: Pose[] = [], seen = new Set<string>();
  let frames = 0;
  for (const [n, presses] of sequences.entries()) for (const hz of [60, 120]) for (const side of [-1, -.5, 0, .5, 1]) for (const typed of [false, true]) {
    // Every start at .1 s steps for the single hop (several accessory spring periods and a whole breath);
    // the slower press sequences sample every .3 s.
    for (let start = .5; start < 6.5; start += n ? .3 : .1) {
      const state = initialState();
      let now = 1000;
      const frame = () => { if (side) pointer(state, side * 1e4, 57, rect); now += 1000 / hz; advance(state, now, true, () => .5); };
      while (state.time < start) frame();
      if (typed) typing(state);
      const first = state.time;
      let next = 0;
      while (state.time < first + presses.at(-1)! + 1.6) {
        while (next < presses.length && state.time - first >= presses[next]!) { hop(state, false); next++; }
        frame();
        const p = pose(state, false), key = `${p.squash},${p.lift},${p.tilt},${p.hatTilt},${p.look[0]}`;
        frames++;
        if (!seen.has(key)) { seen.add(key); poses.push(p); }
      }
    }
  }
  made = { frames, poses };
  return made;
}

test.each(BUDDY_IDS)("whatever the presses, %s's drawn body and accessory keep at least 1.4 device px inside the canvas", id => {
  const { frames, poses } = motionPoses();
  expect(frames).toBeGreaterThan(100000);
  const { rig } = buddy(id), shader = anchors(id);
  const [body, hat] = [outline(layer(id, "body")), outline(layer(id, "accessory"))];
  // The rest frame is the draft's: nothing to bound without lift or tilt.
  const rest: Pose = { time: 0, squash: 0, lift: 0, tilt: 0, hatTilt: 0, energy: 0, eyeOpen: 1, look: [0, 0], mode: "idle" };
  expect(drawnPose(rest, rig), id).toEqual(rest);
  let worst = 0;
  const check = (p: Pose, l: number, points: number[][]) => {
    const map = mapping(p, l, shader);
    for (const point of points) { const [x, y] = map(point[0]!, point[1]!); worst = Math.max(worst, Math.abs(x), Math.abs(y)); }
  };
  for (const motion of poses) {
    const p = drawnPose(motion, rig);
    check(p, 0, body);
    const [low, high] = rig.accessoryTilt;
    check(p, 1, hat);
    if (low !== p.hatTilt) check({ ...p, hatTilt: low }, 1, hat);
    if (high !== p.hatTilt && high !== low) check({ ...p, hatTilt: high }, 1, hat);
  }
  // Clip space is ±1 over Home's 228 device px canvas (114 per half).
  expect((1 - worst) * 114, id).toBeGreaterThanOrEqual(1.4);
});
