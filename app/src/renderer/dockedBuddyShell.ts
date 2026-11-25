// SPDX-License-Identifier: MIT
// One imperative node moves between the surface slots with append, so the canvas keeps its WebGL context. It runs on
// its own requestAnimationFrame, never renders React, and parks whenever another step could change nothing.
import type { VisibleCalls } from "./visibleClock";
import { EYE_TEXTURE, buddy as registry, type BuddyId } from "./buddies";
import { canvasSize } from "./doanyMotion";
import { onDevicePixelRatio } from "./devicePixels";
// After a lost context a rebuild waits for the GPU to come back, on Home's schedule (the reason is in Doany.tsx).
import { RETRIES, RETRY_MS } from "./Doany";
import {
  advanceDocked, createDockedState, dockedGeometry, dockedNeedsTime, setDockedBuddy, REST_SECONDS, SIZE, xOn,
  type DockedEvent, type DockedFrame, type DockedInputs, type DockedState, type SurfaceName,
} from "./dockedBuddyCore";
import { buddyBox, overlaps, silhouettePath, type Box, type SilhouetteMask } from "./dockedBuddyHit";
import { dockedShaders } from "./dockedBuddyShader";

// Measured by geometry: the menus and tooltips do not expose being open.
export const FLOATING = "[data-radix-popper-content-wrapper], .slash-popover, .doan-picking";
// popover only wakes the parked loop and refreshes the floating list: the slash popover opens inside the card where no
// other observer sees it.
export const SLOT_ATTRIBUTES = ["data-accepts", "data-queue", "data-waiting", "data-notice", "data-popover"];
// So following new agent output (the thread sets its own scrollTop) does not end the rest.
const PERSON_SCROLL_MS = 1000;
// One 60 Hz interval less a margin no vsync jitter reaches, so 60 Hz drops nothing and 120 Hz advances every other
// callback. The core still gets each real timestamp; an input change applies on the very next callback.
const FRAME_MS = 1000 / 60 - 4;

// overview: the Overview covers the canvas page, whose toolbar stays laid out under it, so the toolbar is no surface.
// hint only wakes the loop; the hint itself is measured as a floating element.
export interface WorkspaceInputs { overview: boolean; folded: boolean; folding: boolean; covered: boolean; hint: boolean }
const NO_WORKSPACE: WorkspaceInputs = { overview: false, folded: false, folding: false, covered: false, hint: false };

const UNIFORMS = ["time", "squash", "lift", "tilt", "hatTilt", "layer", "energy", "look", "eyeOpen", "skin", "eyeTex"] as const;

interface Target { draw(frame: DockedFrame): void; resize(size: number): void; lost(): boolean; release(): void; textures: Promise<unknown> }

// Null without WebGL; throws when a shader does not compile or link, after releasing the context. Settings match
// Doany.tsx's.
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

// A buddy change replaces only this. failed: WebGL is gone for this rig; it shows the still image until rebuilt.
interface Rig { id: BuddyId; still: HTMLImageElement; canvas: HTMLCanvasElement; hit: HTMLElement; shaped: boolean; target: Target | null; ready: boolean; failed: boolean; drawn: string; dispose(): void }

interface Live {
  state: DockedState; ground: HTMLElement; shadow: HTMLElement; host: HTMLElement; rig: Rig;
  container: HTMLElement; personMovedAt: () => number; calls: VisibleCalls;
  raf: number; out: DockedFrame | null; intersecting: boolean; events: DockedEvent[]; activityAt: number; personAt: number;
  // nativeVisible: document.hidden stays false while the window is closed with the app running or the app is hidden.
  // written: the last style strings, so an unchanged frame writes nothing.
  nativeVisible: boolean; urgent: boolean; advancedAt: number; written: { host: string; shadow: string; opacity: string };
  // At most once per stretch the workspace is seen, so a GPU process reset does not leave the still image until restart.
  // A context lost after the rig was ready allows more rebuilds, each once the GPU is back; nothing retries every frame.
  rebuilt: boolean; retries: number; retry: ReturnType<typeof setTimeout> | 0;
  // null: find them again.
  floating: Element[] | null;
  slotSizes: ResizeObserver; slotAttributes: MutationObserver; portals: MutationObserver; hostSize: ResizeObserver; view: IntersectionObserver;
  reduced: MediaQueryList; off(): void;
}

export class DockedBuddyShell {
  private slots: Partial<Record<SurfaceName, HTMLElement>> = {};
  private workspace: WorkspaceInputs = NO_WORKSPACE;
  private id: BuddyId = "doany";
  private live: Live | null = null;

  // React 19 calls the cleanup instead of the callback with null, and StrictMode attaches twice; a cleanup clears only
  // the node it attached.
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

  // The surface, each surface's x and the hide state carry on.
  setBuddy(id: BuddyId) {
    if (id === this.id) return;
    this.id = id;
    const live = this.live;
    if (!live) return;
    setDockedBuddy(live.state, id);
    this.cancelRetry(live);
    this.rebuild(live);
    this.wake();
  }
  private rebuild(live: Live) {
    live.rig.dispose();
    live.rig = this.rig(live, this.id);
  }

  // container: a stable element whose visibility gates time (not a slot, which folds and leaves).
  start(container: HTMLElement, personMovedAt: () => number, calls: VisibleCalls) {
    if (this.live) return;
    const ground = element("span", "docked-buddy"), shadow = element("span", "docked-buddy-shadow"), clip = element("span", "docked-buddy-window"), host = element("span", "docked-buddy-host");
    ground.setAttribute("aria-hidden", "true");
    clip.append(host); ground.append(shadow, clip);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const wake = () => this.wake();
    // A portalled popper comes or goes as a child of body; the slash popover by the slot's popover attribute.
    const refloat = () => { live.floating = null; this.wake(); };
    const live: Live = {
      state: createDockedState(this.id, Math.random), ground, shadow, host, rig: null as unknown as Rig, container, personMovedAt, calls,
      raf: 0, out: null, intersecting: true, events: [], activityAt: 0, personAt: 0, floating: null,
      nativeVisible: true, urgent: true, advancedAt: -Infinity, written: { host: "", shadow: "", opacity: "" }, rebuilt: true, retries: 0, retry: 0,
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

  stop() {
    const live = this.live;
    if (!live) return;
    this.live = null;
    cancelAnimationFrame(live.raf);
    this.cancelRetry(live);
    live.off();
    live.slotSizes.disconnect(); live.slotAttributes.disconnect(); live.portals.disconnect(); live.hostSize.disconnect(); live.view.disconnect();
    live.rig.dispose();
    live.ground.remove();
  }

  // A pending frame is requested again, so a callback that never arrives (requested while the window could not paint)
  // cannot hold the id and park the loop for good.
  private wake() {
    const live = this.live;
    if (!live) return;
    live.urgent = true;
    if (live.raf) { cancelAnimationFrame(live.raf); live.raf = 0; }
    this.next(live);
  }
  private next(live: Live) { if (!live.raf) live.raf = requestAnimationFrame(this.tick); }

  // The next frame the buddy is seen rebuilds the rig.
  private allowRebuild(live: Live) {
    if (this.live !== live) return;
    if (live.retry) { clearTimeout(live.retry); live.retry = 0; }
    live.rebuilt = false;
    this.wake();
  }
  // Only while a lost ready rig left retries.
  private retryLater(live: Live) {
    if (live.retry || live.retries <= 0) return;
    const wait = RETRY_MS * 2 ** (RETRIES - live.retries);
    live.retries -= 1;
    live.retry = setTimeout(() => { live.retry = 0; this.allowRebuild(live); }, wait);
  }
  private cancelRetry(live: Live) {
    if (live.retry) clearTimeout(live.retry);
    live.retry = 0; live.retries = 0;
  }

  private listen(live: Live) {
    const wake = () => this.wake();
    // It never wakes the loop: a parked one would change nothing visible, so the event waits in the queue, once.
    const move = (event: PointerEvent) => { if (closest(event.target, ".thread-scroll") && live.events.at(-1) !== "thread") live.events.push("thread"); };
    // Focus alone does not end a rest: the app hands focus back to the field.
    const typed = (event: Event) => { if (closest(event.target, ".docked .composer-input")) { live.activityAt = Date.now(); live.events.push("input"); this.wake(); } };
    const person = () => { live.personAt = Date.now(); };
    // Read inside a frame, so no wake.
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
    const native = live.calls.onWindowVisible(visible => { live.nativeVisible = visible; this.wake(); });
    const ratio = onDevicePixelRatio(() => { this.resize(); this.wake(); });
    return () => {
      native(); ratio();
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
    // From the buddy's foot contact, so no buddy needs its own CSS.
    host.style.top = `calc(100% + ${g.hostTop}px)`;
    host.style.transformOrigin = `50% ${g.originY * 100}%`;
    const still = document.createElement("img"), canvas = document.createElement("canvas"), hit = element("span", "docked-buddy-hit");
    still.alt = ""; still.src = b.assets.still; canvas.hidden = true; hit.hidden = true;
    // Painted before the WebGL canvas's layer, the hit target needs no compositing or clip-path mask layer of its own; it
    // draws nothing, so the order changes no pixel.
    host.append(hit, still, canvas);
    const rig: Rig = { id, still, canvas, hit, shaped: false, target: null, ready: false, failed: false, drawn: "", dispose: () => {} };
    let disposed = false;
    // The browser's hit test, not one on pointermove, so it works over the board, whose OOPIF keeps its pointer events
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
    const goStill = () => { rig.ready = false; rig.failed = true; still.hidden = false; canvas.hidden = true; this.retryLater(live); this.wake(); };
    // preventDefault lets Chromium restore the context, which tells when the GPU is back. A ready rig's loss also marks
    // the stretch rebuilt, so the next seen frame does not rebuild at once while the GPU may still be restarting.
    const lost = (event: Event) => { event.preventDefault(); if (rig.ready) { live.retries = RETRIES; live.rebuilt = true; } goStill(); };
    const restored = () => { if (!disposed) this.allowRebuild(live); };
    try {
      rig.target = glTarget(canvas, id);
    } catch (error) { console.error(error); }
    if (!rig.target) { rig.failed = true; this.retryLater(live); }
    if (rig.target) {
      canvas.addEventListener("webglcontextlost", lost); canvas.addEventListener("webglcontextrestored", restored);
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
      canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored);
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
    if (!live.urgent && now - live.advancedAt < FRAME_MS) { this.next(live); return; }
    live.urgent = false; live.advancedAt = now;
    const seen = this.seen(live);
    if (!seen) live.rebuilt = false;
    else if (live.rig.failed && !live.rebuilt) { live.rebuilt = true; this.rebuild(live); }
    const inputs = this.inputs(live, seen);
    const out = advanceDocked(live.state, inputs, now, Math.random);
    live.out = out;
    this.apply(live, out, inputs.visible);
    if (inputs.visible && !inputs.reduced && dockedNeedsTime(live.state)) this.next(live);
  };

  private seen(live: Live) {
    return !document.hidden && live.nativeVisible && !this.workspace.covered && live.intersecting && live.container.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  }

  private inputs(live: Live, shown: boolean): DockedInputs {
    const ws = this.workspace, events = live.events;
    live.events = [];
    let rects: Box[] | null = null;
    // A cached node that left the page means the set changed without an observer firing (a pick notice replaced by a
    // capture one).
    const floating = () => rects ??= (live.floating = live.floating?.every(node => node.isConnected) ? live.floating : Array.from(document.querySelectorAll(FLOATING))).map(node => node.getBoundingClientRect());
    const surface = (name: SurfaceName) => {
      const el = this.slots[name];
      if (!el || !el.isConnected) return null;
      // The toolbar has a 1px transparent border.
      const r = el.getBoundingClientRect(), width = el.clientWidth;
      const present = width > 0 && el.checkVisibility({ visibilityProperty: true });
      return { present, width, floating: present && overlaps(buddyBox({ left: r.left, right: r.left + width, top: r.top }, xOn(live.state, name, width)), floating()) };
    };
    const dockSlot = this.slots.dock;
    const dock = surface("dock");
    const has = (name: string) => !!dockSlot?.hasAttribute(name);
    return {
      surfaces: { dock: dock && { ...dock, accepts: dockSlot!.getAttribute("data-accepts") !== "false" }, tools: ws.overview ? null : surface("tools") },
      // The suggested prompts themselves are no reason.
      reasons: { queue: has("data-queue"), prompts: has("data-notice"), waiting: has("data-waiting") },
      panel: { folded: ws.folded, folding: ws.folding },
      resting: Date.now() - Math.max(live.personMovedAt(), live.activityAt) >= REST_SECONDS * 1000 && document.hasFocus(),
      // The still image never animates.
      visible: shown && live.rig.ready,
      reduced: live.reduced.matches,
      events,
    };
  }

  private apply(live: Live, out: DockedFrame, visible: boolean) {
    const { ground, host, shadow, rig, written } = live;
    const target = out.surface ? this.slots[out.surface] : undefined;
    if (target && ground.parentElement !== target) target.append(ground);
    // Only what changed is written: a still pose or a resting shadow costs no style invalidation.
    const hostTransform = `translate(${out.host.x}px,${out.host.y}px)`;
    const shadowTransform = `translateX(${out.shadow.x}px) scale(${out.shadow.scaleX},${out.shadow.scaleY})`, opacity = String(out.shadow.opacity);
    if (written.host !== hostTransform) host.style.transform = written.host = hostTransform;
    if (written.shadow !== shadowTransform) shadow.style.transform = written.shadow = shadowTransform;
    if (written.opacity !== opacity) shadow.style.opacity = written.opacity = opacity;
    const data = { surface: out.surface ?? "", presence: out.presence, state: rig.ready ? out.mode : "static" };
    for (const key of ["surface", "presence", "state"] as const) if (host.dataset[key] !== data[key]) host.dataset[key] = data[key];
    const hide = out.presence !== "shown" || !rig.shaped;
    if (rig.hit.hidden !== hide) rig.hit.hidden = hide;
    // Nothing is drawn while not seen; a still pose (reduced motion) draws once per change.
    const key = `${out.mode}|${out.pose.time}|${out.surface}|${out.conceal}`;
    if (visible && rig.ready && rig.target && !rig.target.lost() && out.conceal < 1 && key !== rig.drawn) { rig.drawn = key; rig.target.draw(out); }
  }
}

function element(tag: string, className: string) { const node = document.createElement(tag); node.className = className; return node; }
function closest(target: EventTarget | null, selector: string) { return typeof (target as Element | null)?.closest === "function" && (target as Element).closest(selector) !== null; }

// null until it loads or when its pixels cannot be read.
function silhouette(still: HTMLImageElement): SilhouetteMask | null {
  const width = still.naturalWidth, height = still.naturalHeight;
  if (!width) return null;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try { context.drawImage(still, 0, 0); return { data: context.getImageData(0, 0, width, height).data, width, height }; } catch (error) { console.error("docked buddy: cannot read the still's pixels", error); return null; }
}

export const dockedBuddy = new DockedBuddyShell();
