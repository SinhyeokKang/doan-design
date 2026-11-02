import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { Doany, mountDoany } from "./Doany";

// The WebGL calls of the V2 draft .doan/assets/doany/v2/mascot.js up to its first frame, from
// .scratch/doany-v2/golden-trace.mjs (objects are creation ids, typed arrays are length and checksum).
const golden = JSON.parse(readFileSync(new URL("./doany.golden.json", import.meta.url), "utf8")) as { scenarios: { name: string; trace?: unknown[] }[] };
const trace = golden.scenarios.find(item => item.name === "idle")!.trace!;
const flush = () => new Promise(resolve => setImmediate(resolve));

type Listener = (event: { key?: string; repeat?: boolean; clientX?: number; clientY?: number; preventDefault(): void }) => void;
function events(log: string[], name: string) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: Listener) { if (listeners.get(type)?.delete(listener)) log.push(`${name} off ${type}`); },
    dispatch(type: string, event: { key?: string; repeat?: boolean; clientX?: number; clientY?: number } = {}) {
      let prevented = false;
      for (const listener of [...listeners.get(type) ?? []]) listener({ ...event, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

// A recording WebGL context with the same constants and encoding as golden.mjs.
function context(log: string[], record: unknown[], options: { compileFails?: boolean }, canvas: { listeners: ReturnType<typeof events> }, count: { draws: number; look: unknown[] }) {
  const constants = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, FLOAT: 8,
    BLEND: 9, SRC_ALPHA: 10, ONE_MINUS_SRC_ALPHA: 11, TEXTURE_2D: 12, TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14, CLAMP_TO_EDGE: 15, TEXTURE_MIN_FILTER: 16,
    TEXTURE_MAG_FILTER: 17, LINEAR: 18, RGBA: 19, UNSIGNED_BYTE: 20, COLOR_BUFFER_BIT: 21, TRIANGLES: 22, UNSIGNED_SHORT: 23,
  };
  let lost = false, drawn = 0;
  const ids = new Map<object, string>();
  const object = () => ({});
  const methods: Record<string, (...args: never[]) => unknown> = {
    createShader: object, createProgram: object, createBuffer: object, createTexture: object,
    getShaderParameter: () => !options.compileFails, getShaderInfoLog: () => "compile failed", getProgramParameter: () => true, getProgramInfoLog: () => "",
    getUniformLocation: object, getAttribLocation: () => 0, isContextLost: () => lost,
    getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext() { log.push("loseContext"); lost = true; canvas.listeners.dispatch("webglcontextlost"); } } : null),
  };
  const encode = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (ids.has(value)) return ids.get(value);
    if (value instanceof FakeImage) return `image:${value.src.split("/").pop()}:${value.crossOrigin}`;
    if (ArrayBuffer.isView(value)) { const array = value as unknown as Float32Array; return { [array.constructor.name]: array.length, sum: array.reduce((sum, v, i) => sum + v * (i + 1), 0) }; }
    return value;
  };
  return new Proxy(constants, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        const entry = drawn < 2 ? [key, ...args.map(encode)] : null;
        const result = (methods[key] ?? (() => undefined))(...args as never[]);
        if (result !== null && typeof result === "object" && !ids.has(result) && key !== "getExtension") ids.set(result, key === "getUniformLocation" ? `@${String(args[1])}` : `#${ids.size}`);
        if (entry && key !== "getExtension") { if (result !== undefined) entry.push({ result: encode(result) }); record.push(entry); }
        if (key === "drawElements") { drawn++; count.draws++; }
        if (key === "uniform2f") count.look = args.slice(1);
        return result;
      };
    },
  });
}

class FakeImage { static all: FakeImage[] = []; crossOrigin = ""; src = ""; onload = () => {}; onerror = () => {}; constructor() { FakeImage.all.push(this); } }

function environment(options: { noContext?: boolean; compileFails?: boolean } = {}) {
  const log: string[] = [], record: unknown[] = [], count = { draws: 0, look: [] as unknown[] }, canvases: FakeCanvas[] = [];
  const frames = new Map<number, (now: number) => void>();
  let next = 0, intersect: (entries: { isIntersecting: boolean }[]) => void = () => {}, resize: () => void = () => {};
  const media = { matches: false, ...events(log, "media") };
  const page = { hidden: false, ...events(log, "document") };
  FakeImage.all = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", page);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("matchMedia", (query: string) => { expect(query).toBe("(prefers-reduced-motion: reduce)"); return media; });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => { frames.set(++next, callback); return next; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { if (frames.delete(id)) log.push("cancel frame"); });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() { log.push("resize disconnect"); } });
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} disconnect() { log.push("intersect disconnect"); } });
  const makeCanvas = (name: string): FakeCanvas => {
    const listeners = events(log, `canvas`);
    const canvas: FakeCanvas = {
      name, hidden: true, width: 300, height: 150, listeners, ...listeners,
      getContext(type: string, attributes: unknown) { record.push(["getContext", type, attributes]); return options.noContext ? null : context(log, record, options, canvas, count); },
      cloneNode: () => makeCanvas("clone"),
      replaceWith(other: FakeCanvas) { log.push(`replace ${name} with ${other.name}`); },
    };
    canvases.push(canvas);
    return canvas;
  };
  const host = { clientWidth: 114, dataset: {} as Record<string, string>, shown: true, getBoundingClientRect: () => ({ x: 0, y: 0, width: 114, height: 114 }), checkVisibility: (o: unknown) => { expect(o).toEqual({ visibilityProperty: true }); return host.shown; }, ...events(log, "host") };
  const still = { hidden: false };
  const canvas = makeCanvas("canvas");
  return {
    log, record, count, media, page, host, still, canvas, live: () => canvases.at(-1)!,
    mount: () => mountDoany(host as unknown as HTMLButtonElement, still as unknown as HTMLImageElement, canvas as unknown as HTMLCanvasElement),
    frame(now: number) { const [id, callback] = [...frames][0]!; frames.delete(id); callback(now); },
    async load() { for (const image of FakeImage.all) image.onload(); await flush(); },
    intersect: (isIntersecting: boolean) => intersect([{ isIntersecting }]),
    resize: () => resize(),
  };
}
interface FakeCanvas extends ReturnType<typeof events> { name: string; hidden: boolean; width: number; height: number; listeners: ReturnType<typeof events>; getContext(type: string, attributes: unknown): unknown; cloneNode(): FakeCanvas; replaceWith(other: FakeCanvas): void }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("markup is a labelled button with the still image and a hidden canvas, and no state yet", () => {
  const html = renderToStaticMarkup(<Doany size={114} />);
  // Server rendering also emits an image preload hint before the button; the client render does not.
  expect(html).toContain('<button type="button" class="doany" aria-label="Make Doany hop" style="width:114px;height:114px"><img src="doany/doany.png" alt=""/><canvas hidden="" aria-hidden="true"></canvas></button>');
  expect(html).not.toContain("data-state");
  expect(renderToStaticMarkup(<Doany size={142.5} />)).toContain('style="width:142.5px;height:142.5px"');
});

test("the WebGL setup and first frame match the original call for call", async () => {
  const env = environment();
  env.mount();
  env.frame(1000); env.frame(1016);
  await env.load();
  expect(env.record).toEqual(trace);
  expect(env.host.dataset.state).toBe("idle");
  expect(env.still.hidden).toBe(true);
});

test("each mount draws on a fresh copy of React's canvas and puts React's back on dispose", () => {
  const env = environment();
  env.mount().dispose();
  env.mount().dispose();
  expect(env.log.filter(line => line.startsWith("replace"))).toEqual(["replace canvas with clone", "replace clone with canvas", "replace canvas with clone", "replace clone with canvas"]);
});

test("no WebGL context leaves the still image as static", () => {
  const env = environment({ noContext: true });
  const mounted = env.mount();
  expect(env.host.dataset.state).toBe("static");
  expect(env.still.hidden).toBe(false);
  mounted.dispose();
});

test("a shader that does not compile leaves the still image as static and releases the context", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const env = environment({ compileFails: true });
  env.mount();
  expect(env.host.dataset.state).toBe("static");
  expect(env.log).toContain("loseContext");
  expect(error).toHaveBeenCalled();
});

test("dispose removes the lost listener, the frame and every listener before releasing the context", async () => {
  const env = environment();
  const mounted = env.mount();
  await env.load(); env.frame(1000);
  env.log.length = 0;
  mounted.dispose();
  expect(env.log[0]).toBe("canvas off webglcontextlost");
  expect(env.log[1]).toBe("cancel frame");
  expect(env.log.slice(2, -2).sort()).toEqual(["document off pointermove", "host off click", "host off keydown", "intersect disconnect", "media off change", "resize disconnect"]);
  expect(env.log.slice(-2)).toEqual(["loseContext", "replace clone with canvas"]);
  expect(env.host.dataset.state).toBe("idle");
});

test("click, Enter and Space hop; Space and Enter prevent the default and other keys do not", async () => {
  const env = environment();
  env.mount();
  await env.load(); env.frame(1000);
  env.host.dispatch("click"); env.frame(1020);
  expect(env.host.dataset.state).toBe("jump");
  expect([env.host.dispatch("keydown", { key: "Enter" }), env.host.dispatch("keydown", { key: " " }), env.host.dispatch("keydown", { key: "a" })]).toEqual([true, true, false]);
});

test("holding Enter or Space hops once: the key's repeats only prevent the default", async () => {
  const env = environment();
  env.mount();
  await env.load(); env.frame(1000);
  expect([env.host.dispatch("keydown", { key: "Enter", repeat: true }), env.host.dispatch("keydown", { key: " ", repeat: true })]).toEqual([true, true]);
  env.frame(1020);
  expect(env.host.dataset.state).toBe("idle");
});

test("a reduced-motion change draws the still pose; hidden or off-screen Doany stops drawing", async () => {
  const env = environment();
  env.mount();
  await env.load(); env.frame(1000);
  env.media.matches = true; env.media.dispatch("change");
  expect(env.host.dataset.state).toBe("reduced-motion");
  env.media.matches = false; env.media.dispatch("change");
  expect(env.host.dataset.state).toBe("idle");
  const before = env.count.draws;
  env.host.shown = false; env.frame(1020); env.frame(1040);
  env.host.shown = true; env.intersect(false); env.frame(1060);
  env.page.hidden = true; env.intersect(true); env.frame(1080);
  expect(env.count.draws).toBe(before);
  env.page.hidden = false; env.frame(1100);
  expect(env.count.draws).toBe(before + 2); // two layers
});

test("the pointer anywhere in the window turns the gaze", async () => {
  const env = environment();
  env.mount();
  await env.load(); env.frame(1000);
  env.page.dispatch("pointermove", { clientX: 900, clientY: 57 });
  for (let now = 1020; now <= 1400; now += 20) env.frame(now);
  // Far right of the 114px host clamps the target to 1; the wandering gaze alone stays near 0.1 this early.
  expect(env.count.look[0]).toBeGreaterThan(0.5);
});

test("a lost context prevents the default and shows the still image as static", async () => {
  const env = environment();
  env.mount();
  await env.load();
  expect(env.live().hidden).toBe(false);
  expect(env.live().listeners.dispatch("webglcontextlost")).toBe(true);
  expect([env.host.dataset.state, env.still.hidden, env.live().hidden]).toEqual(["static", false, true]);
});

test("the stylesheet is linked and keeps the draft's host rules with the shared focus ring", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  expect(html).toContain('<link rel="stylesheet" href="./doany.css" />');
  const css = readFileSync(new URL("./doany.css", import.meta.url), "utf8");
  expect(css).toContain(".doany img { padding: 16.5%; }");
  expect(css).toContain(".doany [hidden] { display: none; }");
  expect(css).toMatch(/\.doany:focus-visible \{ outline: 2px solid var\(--border-focus\); outline-offset: 2px; border-radius: var\(--radius-container\); \}/);
});
