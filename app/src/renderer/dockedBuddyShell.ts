// SPDX-License-Identifier: MIT
// The docked buddy's DOM and WebGL shell: the preview shell of the docked draft .doan/assets/buddies/docked-poc.js
// (MIT, Doan contributors) for the app. One buddy for the workspace: its ground (clip window, host, still image,
// canvas, floor shadow) is one imperative node that moves between the surface slots with append, so the canvas keeps
// its WebGL context. React draws only the empty slots (DockedComposer's card, CanvasTools) and registers them with
// ref callbacks; App starts and stops the shell with the workspace screen and pushes what only it knows.
// The buddy runs on its own requestAnimationFrame and never asks React to render. The frame loop parks whenever
// another step could change nothing (time stopped, or dockedNeedsTime false) and wakes on an input change: a slot
// attribute, a portalled popper, a resize, visibility, focus, reduced motion, a push from App or an event.
import { EYE_TEXTURE, buddy as registry, type BuddyId } from "./buddies";
import { canvasSize } from "./doanyMotion";
import {
  advanceDocked, createDockedState, dockedGeometry, dockedNeedsTime, setDockedBuddy, REST_SECONDS, SIZE, xOn,
  type DockedEvent, type DockedFrame, type DockedInputs, type DockedState, type SurfaceName,
} from "./dockedBuddyCore";
import { buddyBox, overlaps, silhouettePath, type Box, type SilhouetteMask } from "./dockedBuddyHit";
import { dockedShaders } from "./dockedBuddyShader";

// Floating elements the buddy hides under: Radix poppers (tooltips, menus, popovers) portalled to body, the slash
// popover and the picking or capture hint. Measured by geometry: the menus and tooltips do not expose being open.
export const FLOATING = "[data-radix-popper-content-wrapper], .slash-popover, .doan-picking";
// The dock slot's attributes, written by DockedComposer: the card takes no input, and the step-aside reasons. popover
// only wakes the parked loop and refreshes the floating list, since the slash popover opens inside the card where no
// other observer sees it.
export const SLOT_ATTRIBUTES = ["data-accepts", "data-queue", "data-prompts", "data-waiting", "data-notice", "data-popover"];
// A thread scroll ends the rest only this soon after the person's own wheel, press or key, so following new agent
// output (the thread sets its own scrollTop) does not.
const PERSON_SCROLL_MS = 1000;

// What only App knows. overview: the Overview covers the canvas page, whose toolbar stays laid out under it, so the
// toolbar is no surface. covered: the problem overlay or first run is over the workspace. hint: a picking or capture
// hint is shown, only to wake the loop (the hint is measured as a floating element).
export interface WorkspaceInputs { overview: boolean; folded: boolean; folding: boolean; covered: boolean; hint: boolean }
const NO_WORKSPACE: WorkspaceInputs = { overview: false, folded: false, folding: false, covered: false, hint: false };

const UNIFORMS = ["time", "squash", "lift", "tilt", "hatTilt", "layer", "energy", "look", "eyeOpen", "skin", "eyeTex"] as const;

interface Target { draw(frame: DockedFrame): void; resize(size: number): void; lost(): boolean; release(): void; textures: Promise<unknown> }

// Null without WebGL; throws when a shader does not compile or link, after releasing the context. Context options,
// mesh, blend, texture parameters and units are the draft's, as Doany.tsx's are.
function glTarget(canvas: HTMLCanvasElement, id: BuddyId): Target | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;
  const release = () => { gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  try {
    const { vertex, fragment } = dockedShaders(registry(id).rig);
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) ?? "");
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? "");
    gl.useProgram(program);
    const at = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
    for (const key of UNIFORMS) at[key] = gl.getUniformLocation(program, key);
    const points: number[] = [], indices: number[] = [], n = 64;
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) points.push(x / n, y / n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * (n + 1) + x; indices.push(i, i + 1, i + n + 1, i + 1, i + n + 2, i + n + 1); }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, "aUV"); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const layers: WebGLTexture[] = [];
    let eye: WebGLTexture | null = null;
    // Relative to the renderer's public folder, so the packaged app's file URL resolves it next to index.html.
    const texture = (path: string) => new Promise<WebGLTexture>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          resolve(t);
        } catch (error) { reject(error); }
      };
      img.onerror = () => reject(Error("Could not load " + path)); img.src = path;
    });
    const { assets } = registry(id);
    return {
      draw(frame) {
        const p = frame.pose;
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
        for (const key of ["time", "squash", "lift", "tilt", "hatTilt", "energy", "eyeOpen"] as const) gl.uniform1f(at[key], p[key]);
        gl.uniform2f(at.look, p.lookX, p.lookY);
        gl.uniform1i(at.skin, 0);
        if (eye) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, eye); gl.uniform1i(at.eyeTex, 1); gl.activeTexture(gl.TEXTURE0); }
        for (let layer = 0; layer < 2; layer++) { gl.uniform1f(at.layer, layer); gl.bindTexture(gl.TEXTURE_2D, layers[layer]!); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0); }
      },
      resize(size) { canvas.width = size; canvas.height = size; },
      lost: () => gl.isContextLost(),
      release,
      textures: Promise.all([texture(assets.body), texture(assets.accessory), texture(EYE_TEXTURE)]).then(([body, accessory, eyeTexture]) => { layers.push(body, accessory); eye = eyeTexture; }),
    };
  } catch (error) {
    // A context left behind on each failure would reach Chromium's limit over repeated workspace visits.
    release();
    throw error;
  }
}

// One buddy's drawing in the host: still image, canvas and WebGL, and the hit target shaped by the still image's
// silhouette (shown only once that shape is read). A buddy change replaces only this.
interface Rig { id: BuddyId; still: HTMLImageElement; canvas: HTMLCanvasElement; hit: HTMLElement; shaped: boolean; target: Target | null; ready: boolean; drawn: string; dispose(): void }

interface Live {
  state: DockedState; ground: HTMLElement; shadow: HTMLElement; host: HTMLElement; rig: Rig;
  container: HTMLElement; personMovedAt: () => number;
  raf: number; out: DockedFrame | null; intersecting: boolean; events: DockedEvent[]; activityAt: number; personAt: number;
  // The floating elements in the page, found again only when one can have come or gone (null: find them again).
  floating: Element[] | null;
  slotSizes: ResizeObserver; slotAttributes: MutationObserver; portals: MutationObserver; hostSize: ResizeObserver; view: IntersectionObserver;
  reduced: MediaQueryList; off(): void;
}

export class DockedBuddyShell {
  private slots: Partial<Record<SurfaceName, HTMLElement>> = {};
  private workspace: WorkspaceInputs = NO_WORKSPACE;
  private id: BuddyId = "doany";
  private live: Live | null = null;

  // Stable ref callbacks for React's slots. React 19 calls the cleanup instead of the callback with null, and
  // StrictMode attaches twice; a cleanup clears only the node it attached.
  readonly dockSlot = (node: HTMLElement | null) => this.attach("dock", node);
  readonly toolsSlot = (node: HTMLElement | null) => this.attach("tools", node);

  private attach(name: SurfaceName, node: HTMLElement | null) {
    if (!node) return;
    this.slots[name] = node;
    this.observeSlot(node);
    this.wake();
    return () => {
      if (this.slots[name] !== node) return;
      delete this.slots[name];
      this.live?.slotSizes.unobserve(node);
      this.wake();
    };
  }
  private observeSlot(node: HTMLElement) {
    if (!this.live) return;
    this.live.slotSizes.observe(node);
    this.live.slotAttributes.observe(node, { attributes: true, attributeFilter: SLOT_ATTRIBUTES });
  }

  update(next: WorkspaceInputs) {
    const now = this.workspace;
    if (now.overview === next.overview && now.folded === next.folded && now.folding === next.folding && now.covered === next.covered && now.hint === next.hint) return;
    if (this.live && now.hint !== next.hint) this.live.floating = null;
    this.workspace = next;
    this.wake();
  }

  // A buddy change rebuilds only the rig: the surface, each surface's x and the hide state carry on.
  setBuddy(id: BuddyId) {
    if (id === this.id) return;
    this.id = id;
    const live = this.live;
    if (!live) return;
    live.rig.dispose();
    setDockedBuddy(live.state, id);
    live.rig = this.rig(live, id);
    this.wake();
  }

  // container: a stable element whose visibility gates time (not a slot, which folds and leaves). personMovedAt: the
  // last view move or selection change, in Date.now() ms (the canvas page's following rest).
  start(container: HTMLElement, personMovedAt: () => number) {
    if (this.live) return;
    const ground = element("span", "docked-buddy"), shadow = element("span", "docked-buddy-shadow"), clip = element("span", "docked-buddy-window"), host = element("span", "docked-buddy-host");
    ground.setAttribute("aria-hidden", "true");
    clip.append(host); ground.append(shadow, clip);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const wake = () => this.wake();
    // A portalled popper comes or goes as a child of body; the slash popover by the slot's popover attribute.
    const refloat = () => { live.floating = null; this.wake(); };
    const live: Live = {
      state: createDockedState(this.id, Math.random), ground, shadow, host, rig: null as unknown as Rig, container, personMovedAt,
      raf: 0, out: null, intersecting: true, events: [], activityAt: 0, personAt: 0, floating: null,
      slotSizes: new ResizeObserver(wake), slotAttributes: new MutationObserver(refloat), portals: new MutationObserver(refloat),
      hostSize: new ResizeObserver(() => { this.resize(); this.wake(); }),
      view: new IntersectionObserver(entries => { live.intersecting = entries.at(-1)!.isIntersecting; this.wake(); }),
      reduced, off: () => {},
    };
    this.live = live;
    live.rig = this.rig(live, this.id);
    for (const node of Object.values(this.slots)) this.observeSlot(node);
    live.portals.observe(document.body, { childList: true });
    live.hostSize.observe(host);
    live.view.observe(container);
    live.off = this.listen(live);
    this.wake();
  }

  // Leaving the workspace: the context goes back and nothing is left in the slots.
  stop() {
    const live = this.live;
    if (!live) return;
    this.live = null;
    cancelAnimationFrame(live.raf);
    live.off();
    live.slotSizes.disconnect(); live.slotAttributes.disconnect(); live.portals.disconnect(); live.hostSize.disconnect(); live.view.disconnect();
    live.rig.dispose();
    live.ground.remove();
  }

  private wake() {
    const live = this.live;
    if (live && !live.raf) live.raf = requestAnimationFrame(this.tick);
  }

  private listen(live: Live) {
    const wake = () => this.wake();
    // The pointer over the thread looks up. It never wakes the loop: a running loop takes it on its next frame, and a
    // parked one (hidden, unseen or reduced motion) would change nothing visible, so it waits in the queue, once.
    const move = (event: PointerEvent) => { if (closest(event.target, ".thread-scroll") && live.events.at(-1) !== "thread") live.events.push("thread"); };
    // Typing in the composer looks down and ends a rest (focus alone does not: the app hands focus back to the field).
    const typed = (event: Event) => { if (closest(event.target, ".docked .composer-input")) { live.activityAt = Date.now(); live.events.push("input"); this.wake(); } };
    const person = () => { live.personAt = Date.now(); };
    // Any thread scroll the person caused (wheel, scrollbar, keys) ends a rest; read inside a frame, so no wake.
    const scrolled = (event: Event) => {
      const now = Date.now();
      if (closest(event.target, ".thread-scroll") && now - live.personAt <= PERSON_SCROLL_MS) live.activityAt = now;
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("input", typed, true); document.addEventListener("keydown", typed, true);
    document.addEventListener("wheel", person, { capture: true, passive: true }); document.addEventListener("pointerdown", person, true); document.addEventListener("keydown", person, true);
    document.addEventListener("scroll", scrolled, { capture: true, passive: true });
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake); window.addEventListener("blur", wake);
    live.reduced.addEventListener("change", wake);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("input", typed, true); document.removeEventListener("keydown", typed, true);
      document.removeEventListener("wheel", person, true); document.removeEventListener("pointerdown", person, true); document.removeEventListener("keydown", person, true);
      document.removeEventListener("scroll", scrolled, true);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake); window.removeEventListener("blur", wake);
      live.reduced.removeEventListener("change", wake);
    };
  }

  private rig(live: Live, id: BuddyId): Rig {
    const { host } = live, b = registry(id), g = dockedGeometry(id);
    // The host's offset and pivot come from the buddy's foot contact, so no buddy needs its own CSS.
    host.style.top = `calc(100% + ${g.hostTop}px)`;
    host.style.transformOrigin = `50% ${g.originY * 100}%`;
    const still = document.createElement("img"), canvas = document.createElement("canvas"), hit = element("span", "docked-buddy-hit");
    still.alt = ""; still.src = b.assets.still; canvas.hidden = true; hit.hidden = true;
    host.append(still, canvas, hit);
    const rig: Rig = { id, still, canvas, hit, shaped: false, target: null, ready: false, drawn: "", dispose: () => {} };
    let disposed = false;
    // The host itself takes no pointer; the hit target over it, clipped to the painted body, does. It is the browser's
    // hit test, not one on the app's pointermove, so it works over the board, whose OOPIF keeps its pointer events
    // from the app's document. The hop's lift (about 7px at most) is not followed.
    const readMask = () => {
      const mask = silhouette(still), path = mask && silhouettePath(mask, SIZE);
      rig.shaped = !!path;
      hit.style.clipPath = path ?? "";
      this.wake();
    };
    const poke = () => { if (live.out?.presence === "shown") { live.events.push("poke"); this.wake(); } };
    // A press on the body keeps the composer's focus and caret.
    const press = (event: Event) => event.preventDefault();
    hit.addEventListener("click", poke); hit.addEventListener("mousedown", press);
    if (still.complete && still.naturalWidth > 0) readMask(); else still.addEventListener("load", readMask, { once: true });
    const goStill = () => { rig.ready = false; still.hidden = false; canvas.hidden = true; this.wake(); };
    const lost = (event: Event) => { event.preventDefault(); goStill(); };
    try {
      rig.target = glTarget(canvas, id);
    } catch (error) { console.error(error); }
    if (rig.target) {
      canvas.addEventListener("webglcontextlost", lost);
      rig.target.textures.then(() => {
        if (disposed) return;
        // A context lost while the textures loaded stays on the still image.
        if (rig.target!.lost()) { goStill(); return; }
        rig.ready = true; still.hidden = true; canvas.hidden = false; rig.drawn = "";
        this.resize(); this.wake();
      }, (error: unknown) => { if (!disposed) { console.error(error); goStill(); } });
    }
    rig.dispose = () => {
      disposed = true;
      still.removeEventListener("load", readMask);
      canvas.removeEventListener("webglcontextlost", lost);
      hit.removeEventListener("click", poke); hit.removeEventListener("mousedown", press);
      rig.target?.release();
      still.remove(); canvas.remove(); hit.remove();
    };
    return rig;
  }

  // A detached slot reports a 0-wide host: that resize is skipped and the canvas keeps its size.
  private resize() {
    const live = this.live, rig = live?.rig;
    if (!live || !rig?.target || !rig.ready) return;
    const size = canvasSize(live.host.clientWidth, devicePixelRatio);
    if (size === 0) return;
    rig.target.resize(size); rig.drawn = "";
  }

  private tick = (now: number) => {
    const live = this.live;
    if (!live) return;
    live.raf = 0;
    const inputs = this.inputs(live);
    const out = advanceDocked(live.state, inputs, now, Math.random);
    live.out = out;
    this.apply(live, out, inputs.visible);
    if (inputs.visible && !inputs.reduced && dockedNeedsTime(live.state)) this.wake();
  };

  private inputs(live: Live): DockedInputs {
    const ws = this.workspace, events = live.events;
    live.events = [];
    let rects: Box[] | null = null;
    // The page is searched only after a floating element can have come or gone; their rects are read at most once per
    // frame, and not at all when there are none or no surface is there.
    const floating = () => rects ??= (live.floating ??= Array.from(document.querySelectorAll(FLOATING))).map(node => node.getBoundingClientRect());
    const surface = (name: SurfaceName) => {
      const el = this.slots[name];
      if (!el || !el.isConnected) return null;
      // The slot spans the surface's padding box along its top edge (the toolbar has a 1px transparent border).
      const r = el.getBoundingClientRect(), width = el.clientWidth;
      const present = width > 0 && el.checkVisibility({ visibilityProperty: true });
      return { present, width, floating: present && overlaps(buddyBox({ left: r.left, right: r.left + width, top: r.top }, xOn(live.state, name, width)), floating()) };
    };
    const dockSlot = this.slots.dock;
    const dock = surface("dock");
    const has = (name: string) => !!dockSlot?.hasAttribute(name);
    const shown = !document.hidden && !ws.covered && live.intersecting && live.container.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    return {
      surfaces: { dock: dock && { ...dock, accepts: dockSlot!.getAttribute("data-accepts") !== "false" }, tools: ws.overview ? null : surface("tools") },
      // A new conversation's notice or choice stands where the suggested prompts do, and is stepped aside for alike.
      reasons: { queue: has("data-queue"), prompts: has("data-prompts") || has("data-notice"), waiting: has("data-waiting") },
      panel: { folded: ws.folded, folding: ws.folding },
      resting: Date.now() - Math.max(live.personMovedAt(), live.activityAt) >= REST_SECONDS * 1000 && document.hasFocus(),
      // Time runs only while the workspace is seen and WebGL is ready; the still image never animates.
      visible: shown && live.rig.ready,
      reduced: live.reduced.matches,
      events,
    };
  }

  private apply(live: Live, out: DockedFrame, visible: boolean) {
    const { ground, host, shadow, rig } = live;
    const target = out.surface ? this.slots[out.surface] : undefined;
    if (target && ground.parentElement !== target) target.append(ground);
    host.style.transform = `translate(${out.host.x}px,${out.host.y}px)`;
    shadow.style.transform = `translateX(${out.shadow.x}px) scale(${out.shadow.scaleX},${out.shadow.scaleY})`;
    shadow.style.opacity = String(out.shadow.opacity);
    host.dataset.surface = out.surface ?? "";
    host.dataset.presence = out.presence;
    host.dataset.state = rig.ready ? out.mode : "static";
    rig.hit.hidden = out.presence !== "shown" || !rig.shaped;
    // Nothing is drawn while not seen; a still pose (reduced motion) draws once per change.
    const key = `${out.mode}|${out.pose.time}|${out.surface}|${out.conceal}`;
    if (visible && rig.ready && rig.target && !rig.target.lost() && out.conceal < 1 && key !== rig.drawn) { rig.drawn = key; rig.target.draw(out); }
  }
}

function element(tag: string, className: string) { const node = document.createElement(tag); node.className = className; return node; }
function closest(target: EventTarget | null, selector: string) { return typeof (target as Element | null)?.closest === "function" && (target as Element).closest(selector) !== null; }

// The still image's alpha, for the silhouette hit test; null until it loads or when its pixels cannot be read.
function silhouette(still: HTMLImageElement): SilhouetteMask | null {
  const width = still.naturalWidth, height = still.naturalHeight;
  if (!width) return null;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try { context.drawImage(still, 0, 0); return { data: context.getImageData(0, 0, width, height).data, width, height }; } catch { return null; }
}

// The workspace's one buddy. App starts and stops it; DockedComposer and CanvasTools hand it their slots.
export const dockedBuddy = new DockedBuddyShell();
