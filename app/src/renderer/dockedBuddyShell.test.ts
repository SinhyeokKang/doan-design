import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BuddyId } from "./buddies";
import { dockedGeometry } from "./dockedBuddyCore";
import { DockedBuddyShell, FLOATING } from "./dockedBuddyShell";

// The shell against a small fake DOM, fake WebGL and fake observers: no browser, so real Chromium behaviour (context
// limits, layout, Radix positions) is left to the real-app probes.
const flush = () => new Promise(resolve => setImmediate(resolve));
type Listener = (event: Record<string, unknown>) => void;
class Events {
  listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string, event: Record<string, unknown> = {}) { for (const listener of [...this.listeners.get(type) ?? []]) listener({ preventDefault() {}, ...event }); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
interface Rect { left: number; right: number; top: number; bottom: number; width: number; height: number }
const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, right: left + width, bottom: top + height, width, height });

class FakeNode extends Events {
  children: FakeNode[] = []; parentElement: FakeNode | null = null; className = ""; hidden = false; root = false;
  style: Record<string, string> & { setProperty?(name: string, value: string): void } = {};
  dataset: Record<string, string> = {}; attributes = new Map<string, string>();
  box = rect(0, 0, 0, 0); clientWidth = 0; shown = true; alt = ""; src = "";
  complete = false; naturalWidth = 0; naturalHeight = 0; width = 300; height = 150;
  constructor(public tag: string) { super(); }
  append(...nodes: FakeNode[]) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { const parent = this.parentElement; if (parent) parent.children = parent.children.filter(child => child !== this); this.parentElement = null; }
  get isConnected(): boolean { return this.root || (this.parentElement?.isConnected ?? false); }
  getBoundingClientRect() { return this.box; }
  checkVisibility(options: unknown) { visibility.push(options); return this.shown; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  closest(selector: string): FakeNode | null { return selector.split(/[ ,]+/).some(part => part.startsWith(".") && this.className.split(" ").includes(part.slice(1))) ? this : this.parentElement?.closest(selector) ?? null; }
  getContext(type: string) { return type === "webgl" ? gl.create(this) : { drawImage() {}, getImageData: () => ({ data: mask }) }; }
}
let visibility: unknown[] = [];
// A 4 × 4 still whose right half is opaque.
const mask = Uint8ClampedArray.from({ length: 64 }, (_, i) => (i % 4 === 3 && (i >> 2) % 4 >= 2 ? 255 : 0));

// Every context made, its draws and whether it was released (lost).
const gl = {
  made: [] as { canvas: FakeNode; lost: boolean; draws: number; compileFails: boolean }[], compileFails: false, none: false,
  live() { return gl.made.filter(c => !c.lost).length; },
  create(canvas: FakeNode) {
    if (gl.none) return null;
    const entry = { canvas, lost: false, draws: 0, compileFails: gl.compileFails };
    gl.made.push(entry);
    const object = () => ({});
    const methods: Record<string, (...args: never[]) => unknown> = {
      createShader: object, createProgram: object, createBuffer: object, createTexture: object, getUniformLocation: object,
      getShaderParameter: () => !entry.compileFails, getShaderInfoLog: () => "compile failed", getProgramParameter: () => true, getAttribLocation: () => 0,
      isContextLost: () => entry.lost,
      getExtension: (name: string) => name === "WEBGL_lose_context" ? { loseContext() { entry.lost = true; } } : null,
      clear: () => { entry.draws += 1; },
    };
    return new Proxy({}, { get: (_, key: string) => methods[key] ?? (/^[A-Z_0-9]+$/.test(key) ? 1 : () => undefined) });
  },
};
class FakeImage { static all: FakeImage[] = []; crossOrigin = ""; src = ""; onload = () => {}; onerror = () => {}; constructor() { FakeImage.all.push(this); } }

let frames: Map<number, (now: number) => void>, nextFrame = 0, clock = 0;
let resizeObservers: { callback: () => void; nodes: Set<unknown> }[], mutationObservers: { callback: () => void; nodes: unknown[] }[], intersection: (entries: { isIntersecting: boolean }[]) => void;
let page: FakeNode & { body: FakeNode; hidden: boolean; focused: boolean; floating: Rect[] };
let win: Events & { doan: { onWindowVisible(listener: (visible: boolean) => void): () => void } }, media: Events & { matches: boolean };
// The native window visibility listeners (closed with the app running, or the app hidden).
let nativeVisible: Set<(visible: boolean) => void>;
const created: FakeNode[] = [];

beforeEach(() => {
  frames = new Map(); nextFrame = 0; clock = 1000; visibility = []; gl.made = []; gl.compileFails = false; gl.none = false; FakeImage.all = []; created.length = 0;
  resizeObservers = []; mutationObservers = []; intersection = () => {};
  const body = new FakeNode("body"); body.root = true;
  page = Object.assign(new FakeNode("document"), { body, hidden: false, focused: true, floating: [] as Rect[] });
  Object.assign(page, {
    createElement: (tag: string) => { const node = new FakeNode(tag); if (tag === "img") Object.assign(node, { complete: true, naturalWidth: 4, naturalHeight: 4 }); created.push(node); return node; },
    hasFocus: () => page.focused,
    querySelectorAll: (selector: string) => { expect(selector).toBe(FLOATING); return page.floating.map(box => ({ isConnected: true, getBoundingClientRect: () => box })); },
  });
  nativeVisible = new Set();
  win = Object.assign(new Events(), { doan: { onWindowVisible: (listener: (visible: boolean) => void) => { nativeVisible.add(listener); return () => { nativeVisible.delete(listener); }; } } });
  media = Object.assign(new Events(), { matches: false });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", win);
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.stubGlobal("ResizeObserver", class { nodes = new Set<unknown>(); constructor(public callback: () => void) { resizeObservers.push(this); } observe(node: unknown) { this.nodes.add(node); } unobserve(node: unknown) { this.nodes.delete(node); } disconnect() { this.nodes.clear(); } });
  vi.stubGlobal("MutationObserver", class { nodes: unknown[] = []; constructor(public callback: () => void) { mutationObservers.push(this); } observe(node: unknown) { this.nodes.push(node); } disconnect() { this.nodes = []; } });
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof intersection) { intersection = callback; } observe() {} disconnect() {} });
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Only the retry timers; Date.now is the clock above and setImmediate flushes the texture promises.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// A surface slot attached to the page: 400 wide with its top edge at y 500 (the dock) or a 200-wide toolbar at y 700.
function slot(name: "dock" | "tools", width = name === "dock" ? 400 : 200) {
  const node = new FakeNode("div"); node.className = "docked-buddy-slot";
  node.box = rect(100, name === "dock" ? 500 : 700, width, 0); node.clientWidth = width;
  page.body.append(node);
  return node;
}
function setup(options: { buddy?: BuddyId } = {}) {
  const shell = new DockedBuddyShell(), container = new FakeNode("main");
  if (options.buddy) shell.setBuddy(options.buddy);
  const dock = slot("dock"), tools = slot("tools");
  const detach = { dock: shell.dockSlot(dock as unknown as HTMLElement), tools: shell.toolsSlot(tools as unknown as HTMLElement) };
  const start = () => shell.start(container as unknown as HTMLElement, () => 0);
  // Runs the pending frame, if any, at now ms.
  const frame = (now = clock) => { const first = [...frames][0]; if (!first) return false; frames.delete(first[0]); first[1](now); return true; };
  const run = (count: number, step = 16) => { for (let i = 0; i < count; i++) { clock += step; frame(clock); } };
  // This setup's own nodes: a test may start a second shell.
  const from = created.length;
  const ground = () => created.slice(from).find(node => node.className === "docked-buddy")!;
  const host = () => created.slice(from).find(node => node.className === "docked-buddy-host")!;
  const canvas = () => host().children.find(node => node.tag === "canvas")!;
  const still = () => host().children.find(node => node.tag === "img")!;
  const hit = () => host().children.find(node => node.className === "docked-buddy-hit")!;
  const load = async () => { for (const image of FakeImage.all) image.onload(); await flush(); };
  return { shell, container, dock, tools, detach, start, frame, run, ground, host, canvas, still, hit, load };
}

test("the ground is one node with the floor shadow and the 88px clip window around the host, hidden from assistive technology", () => {
  const env = setup();
  env.start(); env.frame();
  const ground = env.ground();
  expect(ground.attributes.get("aria-hidden")).toBe("true");
  expect(ground.children.map(node => node.className)).toEqual(["docked-buddy-shadow", "docked-buddy-window"]);
  expect(ground.children[1]!.children).toEqual([env.host()]);
  // The hit target comes first: it paints under the canvas (both take no pointer above it), so it needs no
  // compositing layer of its own and no clip-path mask layer.
  expect(env.host().children.map(node => node.tag)).toEqual(["span", "img", "canvas"]);
  expect(env.hit().className).toBe("docked-buddy-hit");
  // The first step stands it at rest on the dock, at x 16.
  expect(ground.parentElement).toBe(env.dock);
  expect(env.host().style.transform).toBe("translate(16px,0px)");
  expect(env.host().dataset.presence).toBe("shown");
  const g = dockedGeometry("doany");
  expect(env.host().style.top).toBe(`calc(100% + ${g.hostTop}px)`);
  expect(env.host().style.transformOrigin).toBe(`50% ${g.originY * 100}%`);
});

test("moving between slots keeps one canvas and one context", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  const canvas = env.canvas();
  // The dock takes no input: the quick hide, then the toolbar.
  env.dock.setAttribute("data-accepts", "false");
  env.run(120);
  expect(env.ground().parentElement).toBe(env.tools);
  expect(env.canvas()).toBe(canvas);
  expect(gl.made.length).toBe(1);
  expect(gl.live()).toBe(1);
});

test("a slot detached and attached again takes the same ground back without a new context", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  (env.detach.dock as () => void)();
  env.dock.remove();
  env.run(3);
  // A new composer mounts its own slot; the buddy moves there.
  const next = slot("dock");
  env.shell.dockSlot(next as unknown as HTMLElement);
  env.run(80);
  expect(env.ground().parentElement).toBe(next);
  expect(gl.made.length).toBe(1);
});

test("StrictMode's double effect and double ref callback leave one context", async () => {
  const env = setup();
  // Ref callbacks twice (attach, cleanup, attach), then the effect twice (start, stop, start).
  const again = env.shell.dockSlot(env.dock as unknown as HTMLElement);
  (again as () => void)();
  env.shell.dockSlot(env.dock as unknown as HTMLElement);
  env.start(); env.shell.stop(); env.start();
  env.frame(); await env.load();
  expect(gl.live()).toBe(1);
  expect(gl.made.length).toBe(2);
  // Only the second start's ground is in the page.
  expect(created.filter(node => node.className === "docked-buddy" && node.isConnected).length).toBe(1);
});

test("a 0-wide host (a detached slot) does not resize the canvas", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  const host = env.host(), canvas = env.canvas(), observer = resizeObservers.find(o => o.nodes.has(host))!;
  host.clientWidth = 56; observer.callback();
  expect([canvas.width, canvas.height]).toEqual([112, 112]);
  host.clientWidth = 0; observer.callback();
  expect([canvas.width, canvas.height]).toEqual([112, 112]);
});

test("stop releases the context, cancels the frame and takes every listener and the ground away", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  expect(frames.size).toBe(1);
  env.shell.stop();
  expect(gl.live()).toBe(0);
  expect(frames.size).toBe(0);
  expect(env.ground().isConnected).toBe(false);
  expect(page.count() + win.count() + media.count() + nativeVisible.size).toBe(0);
  for (const observer of resizeObservers) expect(observer.nodes.size).toBe(0);
});

test("the still image shows until the textures load, and again when they fail or the context is lost", async () => {
  const env = setup();
  env.start(); env.frame();
  expect([env.still().hidden, env.canvas().hidden, env.host().dataset.state]).toEqual([false, true, "static"]);
  await env.load(); env.frame();
  expect([env.still().hidden, env.canvas().hidden]).toEqual([true, false]);
  expect(env.host().dataset.state).not.toBe("static");
  env.canvas().dispatch("webglcontextlost");
  env.frame();
  expect([env.still().hidden, env.canvas().hidden, env.host().dataset.state]).toEqual([false, true, "static"]);
  // Its rebuilt rig would take the next setups' frames and textures.
  env.shell.stop();

  // A context lost while the textures still load: their late success must not uncover the dead canvas.
  const early = setup();
  early.start(); early.frame();
  gl.made.at(-1)!.lost = true; early.canvas().dispatch("webglcontextlost");
  await early.load(); early.frame();
  expect([early.still().hidden, early.canvas().hidden, early.host().dataset.state]).toEqual([false, true, "static"]);
  early.shell.stop();

  const failed = setup();
  failed.start(); failed.frame();
  for (const image of FakeImage.all.slice(-3)) if (image.src.endsWith("eye.png")) image.onerror(); else image.onload();
  await flush(); failed.frame();
  expect([failed.still().hidden, failed.canvas().hidden, failed.host().dataset.state]).toEqual([false, true, "static"]);
});

// A GPU process reset (seen after a minimize and after an update's relaunch) loses the context; the buddy must not
// stay on the still image for good. Right after the reset the GPU process is still coming back, so the rebuild waits
// for it: the context restored, or a short delay when no restore comes.
test("a context lost after it was ready rebuilds the rig once the context is restored, and the buddy moves again", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  expect(gl.made.length).toBe(1);
  const lost = env.canvas();
  lost.dispatch("webglcontextlost");
  env.run(3);
  // Not at once: a context made while the GPU process restarts can fail or be lost again.
  expect(gl.made.length).toBe(1);
  expect(env.host().dataset.state).toBe("static");
  lost.dispatch("webglcontextrestored");
  env.frame();
  expect(gl.made.length).toBe(2);
  expect(gl.made[0]!.lost).toBe(true);
  await env.load(); env.frame();
  expect([env.still().hidden, env.canvas().hidden]).toEqual([true, false]);
  expect(env.host().dataset.state).not.toBe("static");
  const draws = gl.made[1]!.draws;
  env.run(3);
  expect(gl.made[1]!.draws).toBeGreaterThan(draws);
  expect(frames.size).toBe(1);
  // The pending fallback went with the restore.
  expect(vi.getTimerCount()).toBe(0);
});

test("a context lost after it was ready with no restore event is rebuilt after a short delay", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  env.canvas().dispatch("webglcontextlost");
  env.run(3);
  vi.advanceTimersByTime(999); env.run(1);
  expect(gl.made.length).toBe(1);
  vi.advanceTimersByTime(1); env.frame();
  expect(gl.made.length).toBe(2);
  await env.load(); env.frame();
  expect(env.host().dataset.state).not.toBe("static");
  expect(vi.getTimerCount()).toBe(0);
});

test("a rebuild that fails while the GPU process restarts is tried again later while the buddy stays seen", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  const lost = env.canvas();
  lost.dispatch("webglcontextlost");
  // The restore comes, but the new context cannot be made yet.
  gl.none = true;
  lost.dispatch("webglcontextrestored");
  env.frame();
  expect(env.host().dataset.state).toBe("static");
  // No retry every frame.
  env.run(30);
  gl.none = false;
  env.run(3);
  expect(gl.made.length).toBe(1);
  vi.advanceTimersByTime(1000); env.frame();
  expect(gl.made.length).toBe(2);
  await env.load(); env.frame();
  expect([env.still().hidden, env.canvas().hidden]).toEqual([true, false]);
  expect(env.host().dataset.state).not.toBe("static");
  expect(vi.getTimerCount()).toBe(0);
});

test("a rebuilt rig lost again while its textures load is tried again later", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  env.canvas().dispatch("webglcontextlost");
  vi.advanceTimersByTime(1000); env.frame();
  expect(gl.made.length).toBe(2);
  gl.made[1]!.lost = true; env.canvas().dispatch("webglcontextlost");
  await env.load(); env.frame();
  expect(env.host().dataset.state).toBe("static");
  vi.advanceTimersByTime(1000); env.frame();
  expect(gl.made.length).toBe(3);
  await env.load(); env.frame();
  expect(env.host().dataset.state).not.toBe("static");
});

test("when the GPU never comes back the retries stop after a few attempts and leave no timer", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  env.canvas().dispatch("webglcontextlost");
  gl.none = true;
  let attempts = 0;
  for (let i = 0; i < 10; i++) { if (vi.getTimerCount()) attempts += 1; vi.advanceTimersByTime(1000); env.run(2); }
  expect(attempts).toBe(3);
  expect(vi.getTimerCount()).toBe(0);
  expect(env.host().dataset.state).toBe("static");
  // The next seen stretch still gets its one rebuild.
  gl.none = false;
  page.hidden = true; page.dispatch("visibilitychange"); env.run(1);
  page.hidden = false; page.dispatch("visibilitychange"); env.frame();
  await env.load(); env.frame();
  expect(env.host().dataset.state).not.toBe("static");
});

test("stop and a buddy change clear a pending retry, and a late restore event does nothing", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(3);
  const lost = env.canvas();
  lost.dispatch("webglcontextlost");
  expect(vi.getTimerCount()).toBe(1);
  env.shell.stop();
  expect(vi.getTimerCount()).toBe(0);
  lost.dispatch("webglcontextrestored");
  expect(frames.size).toBe(0);
  expect(lost.count()).toBe(0);

  const changed = setup();
  changed.start(); changed.frame(); await changed.load(); changed.run(3);
  changed.canvas().dispatch("webglcontextlost");
  expect(vi.getTimerCount()).toBe(1);
  changed.shell.setBuddy("puri");
  expect(vi.getTimerCount()).toBe(0);
  changed.shell.stop();
});

test("a context lost while unseen is rebuilt only once the buddy is seen again", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  page.hidden = true; page.dispatch("visibilitychange"); env.run(1);
  env.canvas().dispatch("webglcontextlost");
  env.run(1);
  expect(gl.made.length).toBe(1);
  page.hidden = false; page.dispatch("visibilitychange");
  env.frame();
  expect(gl.made.length).toBe(2);
  await env.load(); env.frame();
  expect(env.host().dataset.state).not.toBe("static");
});

test("a rig that fails to build is tried again once per time the buddy is seen again, not every frame", async () => {
  const env = setup();
  env.start(); env.frame();
  for (const image of FakeImage.all) if (image.src.endsWith("eye.png")) image.onerror(); else image.onload();
  await flush(); env.run(3);
  expect(gl.made.length).toBe(1);
  expect(env.host().dataset.state).toBe("static");
  for (const listener of nativeVisible) listener(false);
  env.run(1);
  for (const listener of nativeVisible) listener(true);
  env.run(3);
  expect(gl.made.length).toBe(2);
  await env.load(); env.frame();
  expect(env.host().dataset.state).not.toBe("static");
});

test("a frame requested but never delivered does not park the loop for good: the next wake requests a fresh one", async () => {
  for (const wake of [() => page.dispatch("visibilitychange"), () => win.dispatch("focus"), () => { for (const listener of nativeVisible) listener(true); }]) {
    const env = setup();
    env.start(); env.frame(); await env.load(); env.run(2);
    expect(frames.size).toBe(1);
    // Chromium drops the callback (requested while the window was minimized) but the shell still holds its id.
    frames.clear();
    wake();
    expect(frames.size).toBe(1);
    const draws = gl.made.at(-1)!.draws;
    env.run(3);
    expect(gl.made.at(-1)!.draws).toBeGreaterThan(draws);
    env.shell.stop();
  }
});

test("without WebGL or with a shader that does not compile the still image stands on the floor and no context is left", () => {
  gl.none = true;
  const env = setup();
  env.start(); env.frame();
  expect([env.still().hidden, env.host().dataset.state, env.ground().parentElement]).toEqual([false, "static", env.dock]);
  gl.none = false; gl.compileFails = true;
  const failing = setup();
  failing.start(); failing.frame();
  expect(gl.made.length).toBe(1);
  expect(gl.live()).toBe(0);
  expect(failing.host().dataset.state).toBe("static");
});

test("time stops while the container is not visible (opacity counted); surface changes apply at once and nothing is drawn", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  env.run(5);
  const draws = gl.made[0]!.draws;
  expect(draws).toBeGreaterThan(0);
  env.container.shown = false;
  env.run(1);
  expect(visibility).toContainEqual({ visibilityProperty: true, opacityProperty: true });
  // Parked: no frame is pending until an input changes.
  expect(frames.size).toBe(0);
  env.dock.setAttribute("data-queue", "");
  for (const observer of mutationObservers) observer.callback();
  env.frame();
  expect(env.ground().parentElement).toBe(env.tools);
  expect(env.host().dataset.presence).toBe("shown");
  expect(gl.made[0]!.draws).toBe(draws);
  expect(frames.size).toBe(0);
  // Seen again: no catch-up animation, the first step is at most 35 ms.
  env.container.shown = true;
  intersection([{ isIntersecting: true }]);
  const before = env.host().style.transform;
  env.frame(clock + 5000);
  expect(env.host().style.transform).toBe(before);
  expect(gl.made[0]!.draws).toBe(draws + 1);
});

test("a hidden document, the problem overlay and a container out of view stop time as well", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  page.hidden = true; env.run(1);
  expect(frames.size).toBe(0);
  page.hidden = false; page.dispatch("visibilitychange");
  expect(frames.size).toBe(1);
  env.shell.update({ overview: false, folded: false, folding: false, covered: true, hint: false });
  env.run(1);
  expect(frames.size).toBe(0);
  env.shell.update({ overview: false, folded: false, folding: false, covered: false, hint: false });
  env.run(1);
  intersection([{ isIntersecting: false }]);
  env.run(1);
  expect(frames.size).toBe(0);
});

test("a window that is not natively visible (closed with the app running, or the app hidden) stops time like a hidden document; showing it again replays nothing", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(5);
  const draws = gl.made[0]!.draws;
  expect(nativeVisible.size).toBe(1);
  // document.hidden stays false: Chromium does not report a closed window as a hidden document.
  for (const listener of nativeVisible) listener(false);
  env.run(1);
  expect(frames.size).toBe(0);
  // Parked, a surface change still applies at once and draws nothing.
  env.dock.setAttribute("data-queue", "");
  for (const observer of mutationObservers) observer.callback();
  env.frame();
  expect(env.ground().parentElement).toBe(env.tools);
  expect(gl.made[0]!.draws).toBe(draws);
  expect(frames.size).toBe(0);
  // Shown again: the loop wakes, and the first step is at most 35 ms whatever time passed.
  const before = env.host().style.transform;
  for (const listener of nativeVisible) listener(true);
  expect(frames.size).toBe(1);
  env.frame(clock + 60000);
  expect(env.host().style.transform).toBe(before);
  expect(gl.made[0]!.draws).toBe(draws + 1);
});

// The time model is the core's and gets every real timestamp it is given; the shell only skips frames.
test("on a display faster than 60 Hz the running loop advances and draws at most about 60 frames a second; at 60 Hz it drops none", async () => {
  const at = (hz: number, jitter: (i: number) => number = () => 0) => {
    const env = setup();
    env.start(); env.frame(); return env.load().then(() => {
      env.frame();
      const draws = gl.made.at(-1)!.draws;
      let ticks = 0;
      for (let i = 0; i < hz; i++) { clock += 1000 / hz + jitter(i); if (env.frame(clock)) ticks++; }
      const drawn = gl.made.at(-1)!.draws - draws;
      env.shell.stop();
      return { ticks, drawn };
    });
  };
  // One second at 120 Hz: every callback runs (and asks for the next), but only every other one advances and draws.
  const fast = await at(120);
  expect(fast.ticks).toBe(120);
  expect(fast.drawn).toBeGreaterThanOrEqual(59);
  expect(fast.drawn).toBeLessThanOrEqual(61);
  // 60 Hz with vsync jitter of up to ±1.5 ms: every frame draws.
  const sixty = await at(60, i => (i % 2 ? 1.5 : -1.5));
  expect(sixty.drawn).toBe(60);
  // An input change between two capped frames applies on the very next callback.
  const env = setup();
  env.start(); env.frame(); await env.load(); env.frame();
  clock += 1000 / 120; env.frame(clock);
  env.dock.setAttribute("data-queue", "");
  for (const observer of mutationObservers) observer.callback();
  clock += 1000 / 120; env.frame(clock);
  expect(env.host().dataset.presence).toBe("hiding");
});

test("a frame writes no style, attribute or draw that did not change", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  const writes: string[] = [];
  const count = (node: FakeNode, name: string) => {
    const target = node.style;
    node.style = new Proxy(target, { set: (object, key, value) => { writes.push(`${name}.${String(key)}`); (object as Record<string, unknown>)[key as string] = value; return true; } });
    const data = node.dataset;
    node.dataset = new Proxy(data, { set: (object, key, value) => { writes.push(`${name}.data-${String(key)}`); object[key as string] = value; return true; } });
  };
  count(env.host(), "host"); count(env.ground().children[0]!, "shadow");
  // Reduced motion: one still frame, then frames with nothing new (here woken by a resize) write nothing.
  media.matches = true; for (const listener of [...media.listeners.get("change") ?? []]) listener({});
  env.frame();
  writes.length = 0;
  const draws = gl.made[0]!.draws;
  for (let i = 0; i < 3; i++) { for (const observer of resizeObservers) observer.callback(); env.frame(); }
  expect(writes).toEqual([]);
  expect(gl.made[0]!.draws).toBe(draws);
});

test("a buddy change rebuilds only the rig: surface, each surface's x and the hide state carry on", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  env.dock.setAttribute("data-queue", "");
  env.run(160);
  expect(env.ground().parentElement).toBe(env.tools);
  const transform = env.host().style.transform, before = gl.made.length;
  env.shell.setBuddy("puri");
  expect(gl.live()).toBe(1);
  expect(gl.made.length).toBe(before + 1);
  env.frame();
  expect(env.ground().parentElement).toBe(env.tools);
  expect(env.host().style.transform).toBe(transform);
  expect(env.still().src).toBe("buddies/puri/still.png");
  expect(env.host().style.top).toBe(`calc(100% + ${dockedGeometry("puri").hostTop}px)`);
  // Back to the dock at its remembered x once the queue ends.
  env.dock.attributes.delete("data-queue");
  await env.load(); env.run(160);
  expect(env.ground().parentElement).toBe(env.dock);
  expect(env.host().style.transform).toMatch(/^translate\(\d/);
});

test("each step-aside reason on the dock slot sends the buddy to the toolbar, the new conversation's notice included", async () => {
  for (const reason of ["data-queue", "data-waiting", "data-notice"]) {
    const env = setup();
    env.start(); env.frame(); await env.load();
    env.dock.setAttribute(reason, "");
    for (const observer of mutationObservers) observer.callback();
    env.run(160);
    expect(env.ground().parentElement, reason).toBe(env.tools);
    env.shell.stop();
  }
});

test("reduced motion draws one still frame per change, parks, and applies surface changes at once", async () => {
  media.matches = true;
  const env = setup();
  env.start(); env.frame(); await env.load();
  env.frame();
  const draws = gl.made[0]!.draws;
  expect(draws).toBe(1);
  expect(env.host().dataset.state).toBe("reduced-motion");
  expect(frames.size).toBe(0);
  env.dock.setAttribute("data-queue", "");
  for (const observer of mutationObservers) observer.callback();
  env.frame();
  expect(env.ground().parentElement).toBe(env.tools);
  expect(gl.made[0]!.draws).toBe(draws + 1);
  expect(frames.size).toBe(0);
});

test("a buddy resting hidden on the Overview parks its frame loop until an input changes", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  env.shell.update({ overview: true, folded: false, folding: false, covered: false, hint: false });
  env.dock.setAttribute("data-queue", "");
  env.run(80);
  expect(env.host().dataset.presence).toBe("hidden");
  expect(frames.size).toBe(0);
  // The pointer over the thread wakes no frame while parked; it waits in the queue, once.
  const thread = new FakeNode("div"); thread.className = "thread-scroll";
  for (let i = 0; i < 5; i++) page.dispatch("pointermove", { target: thread, clientX: 0, clientY: 0 });
  expect(frames.size).toBe(0);
  env.dock.attributes.delete("data-queue");
  for (const observer of mutationObservers) observer.callback();
  env.run(80);
  expect(env.host().dataset.presence).toBe("shown");
  expect(frames.size).toBe(1);
});

test("floating elements are searched for only when one can have come or gone, their rects read at most once per frame, and hide the buddy under them", async () => {
  const env = setup();
  const find = vi.spyOn(page as unknown as { querySelectorAll(s: string): unknown[] }, "querySelectorAll");
  const portals = () => { for (const observer of mutationObservers.filter(o => o.nodes.includes(page.body))) observer.callback(); };
  env.start(); env.frame(); await env.load();
  env.run(20);
  // Searched once, at the first frame with a surface; every later frame reuses the list.
  expect(find).toHaveBeenCalledTimes(1);
  // A tooltip opens far along (its wrapper joins body): found again, and the buddy stays.
  const tip = rect(600, 440, 40, 20);
  page.floating = [tip]; portals();
  env.run(20);
  expect(find).toHaveBeenCalledTimes(2);
  expect(env.host().dataset.presence).toBe("shown");
  // The same tooltip moves over the buddy's own box (x 16 on the dock: 116–172, 443–499): its rect is read each frame.
  Object.assign(tip, rect(120, 470, 40, 20));
  env.run(40);
  expect(env.host().dataset.presence).toBe("hidden");
  expect(find).toHaveBeenCalledTimes(2);
  // Down under an open element nothing can change without an input: the loop parks.
  env.run(3);
  expect(frames.size).toBe(0);
  // The tooltip's wrapper leaves body: 1 s later the buddy rises at the same x.
  page.floating = []; portals();
  env.run(90);
  expect(find).toHaveBeenCalledTimes(3);
  expect(env.host().dataset.presence).toBe("shown");
  expect(env.host().style.transform).toBe("translate(16px,0px)");
  // The slash popover (the slot's popover attribute) and a picking or capture hint (App's push) search again too.
  env.dock.setAttribute("data-popover", "");
  for (const observer of mutationObservers.filter(o => o.nodes.includes(env.dock))) observer.callback();
  env.run(1);
  expect(find).toHaveBeenCalledTimes(4);
  env.shell.update({ overview: false, folded: false, folding: false, covered: false, hint: true });
  env.run(1);
  expect(find).toHaveBeenCalledTimes(5);
});

test("a pick to capture switch, where the hint stays true, finds the floating hint again because the cached node left the page", async () => {
  const env = setup();
  const find = vi.spyOn(page as unknown as { querySelectorAll(s: string): unknown[] }, "querySelectorAll");
  env.start(); env.frame(); await env.load();
  env.shell.update({ overview: false, folded: false, folding: false, covered: false, hint: true });
  const pickHint = new FakeNode("div"); pickHint.root = true;
  find.mockImplementation(() => [pickHint]);
  env.run(2);
  const searched = find.mock.calls.length;
  // Same hint value, but the picking notice was replaced by the capture notice.
  pickHint.root = false;
  env.shell.update({ overview: false, folded: false, folding: false, covered: true, hint: true });
  env.run(2);
  expect(find.mock.calls.length).toBeGreaterThan(searched);
});

test("only the painted body takes the pointer, through a hit target clipped to the still's silhouette, and a click on it is a poke", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  const hit = env.hit();
  // 56px host, 16.5% padding: the 4 × 4 still spans 9.24–46.76; its right half (x 28–46.76) is opaque, so the pixel
  // centres x 28.5…46.5 and y 9.5…46.5 are in. The browser hit-tests the clip-path, over the board's iframe as well.
  expect(hit.style.clipPath).toBe('path("M28 9h19v38h-19Z")');
  expect(hit.hidden).toBe(false);
  // Out of the tab order and under the ground's aria-hidden.
  expect(hit.hasAttribute("tabindex")).toBe(false);
  // A press keeps the composer's focus.
  const press = vi.fn();
  hit.dispatch("mousedown", { preventDefault: press });
  expect(press).toHaveBeenCalled();
  hit.dispatch("click");
  env.run(1);
  expect(env.host().dataset.presence).toBe("hiding");
  // Not fully shown: no hit target, so the pointer passes to whatever is under the buddy.
  expect(hit.hidden).toBe(true);
});

test("before the silhouette is read the buddy takes no pointer", () => {
  const env = setup();
  const realCreate = (page as unknown as { createElement(tag: string): FakeNode }).createElement;
  Object.assign(page, { createElement: (tag: string) => { const node = realCreate(tag); if (tag === "img") Object.assign(node, { complete: false, naturalWidth: 0 }); return node; } });
  env.start(); env.frame();
  expect([env.hit().hidden, env.host().dataset.presence]).toEqual([true, "shown"]);
  Object.assign(env.still(), { complete: true, naturalWidth: 4, naturalHeight: 4 });
  env.still().dispatch("load");
  env.frame();
  expect(env.hit().hidden).toBe(false);
});

test("typing in the composer looks down and ends a rest, focus alone does not; pointer over the thread looks up without ending it", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  const field = new FakeNode("div"); field.className = "composer-input";
  const card = new FakeNode("div"); card.className = "docked"; card.append(field);
  page.dispatch("focusin", { target: field });
  env.run(1);
  expect(env.host().dataset.state).not.toBe("attentive");
  page.dispatch("keydown", { target: field });
  env.run(1);
  expect(env.host().dataset.state).toBe("attentive");
  clock += 3000; env.run(1);
  page.dispatch("input", { target: field });
  env.run(1);
  expect(env.host().dataset.state).toBe("attentive");
  const thread = new FakeNode("div"); thread.className = "thread-scroll";
  clock += 6000;
  page.dispatch("pointermove", { target: thread, clientX: 0, clientY: 0 });
  env.run(1);
  expect(env.host().dataset.state).toBe("attentive");
});

test("an idle trip comes only after a rest: the person's thread scrolling and composer input restart it, and an unfocused window never rests", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  const thread = new FakeNode("div"); thread.className = "thread-scroll";
  const field = new FakeNode("div"); field.className = "composer-input";
  const card = new FakeNode("div"); card.className = "docked"; card.append(field);
  // 200 s with a keyboard scroll of the thread or a keystroke in the composer every 4 s: never 5 s of rest, so no trip.
  for (let at = 0; at < 200; at += 4) {
    if (at % 8) { page.dispatch("keydown", { target: page.body }); page.dispatch("scroll", { target: thread }); } else page.dispatch("input", { target: field });
    env.run(Math.round(4000 / 35), 35);
  }
  expect(env.ground().parentElement).toBe(env.dock);
  // Resting, within 60–120 s (plus the hide and reveal) it moves to the toolbar.
  env.run(Math.round(127000 / 35), 35);
  expect(env.ground().parentElement).toBe(env.tools);

  env.shell.stop();
  // The thread following new agent output scrolls with no input from the person: the rest goes on.
  const follow = setup();
  follow.start(); follow.frame(); await follow.load();
  for (let at = 0; at < 200 && follow.ground().parentElement === follow.dock; at += 4) { page.dispatch("scroll", { target: thread }); follow.run(Math.round(4000 / 35), 35); }
  expect(follow.ground().parentElement).toBe(follow.tools);
  follow.shell.stop();

  const away = setup();
  away.start(); away.frame(); await away.load();
  page.focused = false;
  away.run(Math.round(200000 / 35), 35);
  expect(away.ground().parentElement).toBe(away.dock);
});

// Measured against the draft in the real app (docs/DESIGN.md 'Docked buddy'): each buddy's feet meet the floor and the
// shadow's centre sits under them, from the registry's foot contact alone.
test("each buddy's host offset, pivot and shadow centre are the measured rest values", async () => {
  const measured = { doany: [-44.54632, 26.42], puri: [-41.01944, 27.92], dungdung: [-41.5072, 27.77], popo: [-41.43216, 27.77], dori: [-42.55776, 28.15] } as const;
  for (const [id, [top, shadow]] of Object.entries(measured) as [keyof typeof measured, readonly [number, number]][]) {
    const env = setup({ buddy: id });
    env.start(); env.frame();
    expect(Number(/calc\(100% \+ (-?[\d.]+)px\)/.exec(env.host().style.top!)![1])).toBeCloseTo(top, 4);
    // The pivot is the feet: the host's offset above the floor.
    expect(Number(/^50% (-?[\d.]+)%$/.exec(env.host().style.transformOrigin!)![1]) / 100 * 56).toBeCloseTo(-top, 4);
    const shadowX = Number(/translateX\((-?[\d.]+)px\)/.exec(env.ground().children[0]!.style.transform!)![1]);
    expect(shadowX - 16).toBeCloseTo(shadow, 2);
    env.shell.stop();
  }
});
