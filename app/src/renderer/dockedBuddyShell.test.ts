import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
let win: Events, media: Events & { matches: boolean };
const created: FakeNode[] = [];

beforeEach(() => {
  frames = new Map(); nextFrame = 0; clock = 1000; visibility = []; gl.made = []; gl.compileFails = false; gl.none = false; FakeImage.all = []; created.length = 0;
  resizeObservers = []; mutationObservers = []; intersection = () => {};
  const body = new FakeNode("body"); body.root = true;
  page = Object.assign(new FakeNode("document"), { body, hidden: false, focused: true, floating: [] as Rect[] });
  Object.assign(page, {
    createElement: (tag: string) => { const node = new FakeNode(tag); if (tag === "img") Object.assign(node, { complete: true, naturalWidth: 4, naturalHeight: 4 }); created.push(node); return node; },
    hasFocus: () => page.focused,
    querySelectorAll: (selector: string) => { expect(selector).toBe(FLOATING); return page.floating.map(box => ({ getBoundingClientRect: () => box })); },
  });
  win = new Events(); media = Object.assign(new Events(), { matches: false });
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
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// A surface slot attached to the page: 400 wide with its top edge at y 500 (the dock) or a 200-wide toolbar at y 700.
function slot(name: "dock" | "tools", width = name === "dock" ? 400 : 200) {
  const node = new FakeNode("div"); node.className = "docked-buddy-slot";
  node.box = rect(100, name === "dock" ? 500 : 700, width, 0); node.clientWidth = width;
  page.body.append(node);
  return node;
}
function setup(options: { buddy?: "doany" | "puri" } = {}) {
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
  const load = async () => { for (const image of FakeImage.all) image.onload(); await flush(); };
  return { shell, container, dock, tools, detach, start, frame, run, ground, host, canvas, still, load };
}

test("the ground is one node with the floor shadow and the 88px clip window around the host, hidden from assistive technology", () => {
  const env = setup();
  env.start(); env.frame();
  const ground = env.ground();
  expect(ground.attributes.get("aria-hidden")).toBe("true");
  expect(ground.children.map(node => node.className)).toEqual(["docked-buddy-shadow", "docked-buddy-window"]);
  expect(ground.children[1]!.children).toEqual([env.host()]);
  expect(env.host().children.map(node => node.tag)).toEqual(["img", "canvas"]);
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
  expect(page.count() + win.count() + media.count()).toBe(0);
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

  const failed = setup();
  failed.start(); failed.frame();
  for (const image of FakeImage.all.slice(-3)) if (image.src.endsWith("eye.png")) image.onerror(); else image.onload();
  await flush(); failed.frame();
  expect([failed.still().hidden, failed.canvas().hidden, failed.host().dataset.state]).toEqual([false, true, "static"]);
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
  env.dock.attributes.delete("data-queue");
  for (const observer of mutationObservers) observer.callback();
  env.run(80);
  expect(env.host().dataset.presence).toBe("shown");
  expect(frames.size).toBe(1);
});

test("floating elements are read at most once per frame, only while a surface is there, and hide the buddy under them", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  const read = vi.spyOn(page as unknown as { querySelectorAll(s: string): unknown[] }, "querySelectorAll");
  env.run(1);
  expect(read).toHaveBeenCalledTimes(1);
  // A tooltip over the buddy's own box (x 16 on the dock: 116–172, 443–499) sends it down; one far along does not.
  page.floating = [rect(600, 440, 40, 20)];
  env.run(20);
  expect(env.host().dataset.presence).toBe("shown");
  page.floating = [rect(120, 470, 40, 20)];
  env.run(40);
  expect(env.host().dataset.presence).toBe("hidden");
  // Down under an open element nothing can change without an input: the loop parks and reads nothing.
  read.mockClear();
  env.run(3);
  expect(read).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  // The tooltip's wrapper leaves body: 1 s later the buddy rises at the same x.
  page.floating = [];
  for (const observer of mutationObservers.filter(o => o.nodes.includes(page.body))) observer.callback();
  env.run(90);
  expect(env.host().dataset.presence).toBe("shown");
  expect(env.host().style.transform).toBe("translate(16px,0px)");
});

test("a click on the painted body is a poke; the transparent margin and a hidden buddy take none", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  const host = env.host();
  host.box = rect(116, 443, 56, 56);
  // 56px host, 16.5% padding: the 4 × 4 still spans x 125.24–162.76; its right half is opaque.
  page.dispatch("pointermove", { clientX: 155, clientY: 470, target: page.body });
  expect([host.style.pointerEvents, host.style.cursor]).toEqual(["auto", "pointer"]);
  page.dispatch("pointermove", { clientX: 130, clientY: 470, target: page.body });
  expect([host.style.pointerEvents, host.style.cursor]).toEqual(["", ""]);
  host.dispatch("click", { clientX: 130, clientY: 470 });
  env.run(1);
  expect(env.host().dataset.presence).toBe("shown");
  host.dispatch("click", { clientX: 155, clientY: 470 });
  env.run(1);
  expect(env.host().dataset.presence).toBe("hiding");
  page.dispatch("pointermove", { clientX: 155, clientY: 470, target: page.body });
  expect(host.style.pointerEvents).toBe("");
});

test("composer input and focus look down and end a rest; pointer over the thread looks up without ending it", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load(); env.run(2);
  const field = new FakeNode("div"); field.className = "composer-input";
  const card = new FakeNode("div"); card.className = "docked"; card.append(field);
  page.dispatch("input", { target: field });
  env.run(1);
  expect(env.host().dataset.state).toBe("attentive");
  const thread = new FakeNode("div"); thread.className = "thread-scroll";
  clock += 6000;
  page.dispatch("pointermove", { target: thread, clientX: 0, clientY: 0 });
  env.run(1);
  expect(env.host().dataset.state).toBe("attentive");
});

test("an idle trip comes only after a rest: thread scrolling and composer input restart it, and an unfocused window never rests", async () => {
  const env = setup();
  env.start(); env.frame(); await env.load();
  const thread = new FakeNode("div"); thread.className = "thread-scroll";
  const field = new FakeNode("div"); field.className = "composer-input";
  const card = new FakeNode("div"); card.className = "docked"; card.append(field);
  // 200 s with a wheel on the thread or a keystroke every 4 s: never 5 s of rest, so no trip.
  for (let at = 0; at < 200; at += 4) { page.dispatch(at % 8 ? "wheel" : "input", { target: at % 8 ? thread : field }); env.run(Math.round(4000 / 35), 35); }
  expect(env.ground().parentElement).toBe(env.dock);
  // Resting, within 60–120 s (plus the hide and reveal) it moves to the toolbar.
  env.run(Math.round(127000 / 35), 35);
  expect(env.ground().parentElement).toBe(env.tools);

  const away = setup();
  away.start(); away.frame(); await away.load();
  page.focused = false;
  away.run(Math.round(200000 / 35), 35);
  expect(away.ground().parentElement).toBe(away.dock);
});
