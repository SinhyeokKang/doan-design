// SPDX-License-Identifier: MIT
// The buddy on Home (Doany by default): the WebGL shell of the buddy draft .doan/assets/buddies/motion-preview.js
// (MIT, Doan contributors), run with the chosen buddy's registry entry. Context options, shaders, mesh, blend,
// texture parameters and texture units are the draft's, unchanged (Doany.test.tsx compares the WebGL calls with
// the golden that app/scripts/doanyGolden.mjs records from the draft, and doanyRender.test.ts checks each buddy's
// shader anchors against its artwork); the drawn pose is bounded per buddy (drawnPose). Motion lives in
// doanyMotion.ts and the frame loop in doanyRig.ts.
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EYE_TEXTURE, buddy as registry, type Buddy, type BuddyId, type BuddyRig } from "./buddies";
import type { Pose } from "./doanyMotion";
import { createDoanyRig, type DoanyRig, type DoanyTarget } from "./doanyRig";

export interface BuddyHandle { hop(): void; typing(): void }

// The draft's per-buddy shader templates, with the registry's numbers in the draft's own notation, so each buddy's
// source is the draft's byte for byte (Doany.test.tsx compares Doany's call for call with the golden).
export const vertexFor = (c: BuddyRig) => `
    precision mediump float;
    attribute vec2 aUV;
    varying vec2 vUV;
    uniform float time, squash, lift, tilt, hatTilt, layer, energy;
    uniform vec2 look;
    void main() {
      vUV = aUV;
      vec2 p = aUV;
      if (layer > .5) {
        vec2 h = p - vec2(${c.accessoryPivot});
        float c = cos(hatTilt), s = sin(hatTilt);
        p = vec2(c*h.x-s*h.y,s*h.x+c*h.y) + vec2(${c.accessoryPivot});
      }
      vec2 q = p - vec2(${c.bodyPivot});
      if (layer < .5) {
        q.x += look.x * ${c.skew} * (1.-abs(q.y));
      }
      q.x *= 1.+squash;
      q.y *= 1.-squash;
      q.y += squash*.36;
      float c = cos(tilt), s = sin(tilt);
      q = vec2(c*q.x-s*q.y,s*q.x+c*q.y);
      q += vec2(0.,${c.neutral}-lift);
      gl_Position = vec4(q.x*${c.scale},-q.y*${c.scale},0.,1.);
    }`;
// eye.png covers ±1.35 eye radii around the centre.
const EYE_SPAN = 1.35;
export const fragmentFor = (c: BuddyRig) => `
    precision mediump float;
    varying vec2 vUV;
    uniform sampler2D skin, eyeTex;
    uniform float layer, eyeOpen;
    uniform vec2 look;
    // The bead keeps its shape; a plush lid (the body texture already under it) covers it from the top,
    // its edge following the bead's arch at first and curving into a closed-eye smile at the bottom.
    vec4 spriteEye(vec2 center) {
      vec2 d = (vUV-center-look*vec2(${c.gaze}))/vec2(${c.radius[0]},${c.radius[1]});
      vec2 s = d/${EYE_SPAN.toFixed(2)}*.5+.5;
      if (s.x<0.||s.x>1.||s.y<0.||s.y>1.) return vec4(0.);
      vec4 e = texture2D(eyeTex,s);
      float lid = -1.35 + (1.-eyeOpen)*2.25 + mix(-.2,.22,1.-eyeOpen)*(1.-d.x*d.x);
      e.a *= smoothstep(lid-.06, lid+.06, d.y);
      return e;
    }
    void main() {
      vec4 col = texture2D(skin,vUV);
      if (layer < .5) {
        vec4 a = spriteEye(vec2(${c.eyes[0]})), b = spriteEye(vec2(${c.eyes[1]}));
        col.rgb = mix(col.rgb,a.rgb,a.a); col.rgb = mix(col.rgb,b.rgb,b.a);
      }
      gl_FragColor = col;
    }`;
// The draft bounds the drawn pose per buddy while it writes the uniforms; the motion model stays unbounded
// (doanyMotion.ts, pinned by the golden logs). The hop is drawn lower (Doany .9: the V2 beret had no headroom at the
// apex with the pointer far left) and the accessory's tilt is held to its range: a scarf or headphones wrap the body,
// glasses would leave the eyes. A single hop with the pointer anywhere stays inside Doany's range (about -.19 to +.13),
// so only a burst of presses meets it. Together they keep at least 1.4 device px between the drawing and Home's 228 px
// canvas edge for any press sequence (doanyRender.test.ts). The rest frame has no lift or tilt.
export function drawnPose(pose: Pose, rig: BuddyRig): Pose {
  return { ...pose, lift: pose.lift * rig.liftScale, hatTilt: Math.max(rig.accessoryTilt[0], Math.min(rig.accessoryTilt[1], pose.hatTilt)) };
}

const UNIFORMS = ["time", "squash", "lift", "tilt", "hatTilt", "layer", "energy", "look", "eyeOpen", "skin", "eyeTex"] as const;

// Null without WebGL; throws when a shader does not compile or link, after releasing the context.
function surface(canvas: HTMLCanvasElement, buddy: Buddy): { target: DoanyTarget; textures: Promise<unknown> } | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;
  const release = () => { gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) ?? "");
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexFor(buddy.rig)));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentFor(buddy.rig)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? "");
    gl.useProgram(program);
    const locations = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
    for (const key of UNIFORMS) locations[key] = gl.getUniformLocation(program, key);
    const points: number[] = [], indices: number[] = [], n = 64;
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) points.push(x / n, y / n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * (n + 1) + x; indices.push(i, i + 1, i + n + 1, i + 1, i + n + 2, i + n + 1); }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, "aUV"); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const textures: WebGLTexture[] = [];
    let eye: WebGLTexture | null = null;
    // path: relative to the renderer's public folder, so the packaged app's file URL resolves it next to index.html.
    const texture = (path: string) =>
      new Promise<WebGLTexture>((resolve, reject) => {
        const img = new Image();
        // Kept from the draft: textures load with and without it from file:// and asar paths.
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
    const target: DoanyTarget = {
      draw(pose) {
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
        const { time, squash, lift, tilt, hatTilt, energy, eyeOpen } = drawnPose(pose, buddy.rig);
        for (const [key, value] of Object.entries({ time, squash, lift, tilt, hatTilt, energy, eyeOpen })) gl.uniform1f(locations[key as keyof typeof locations], value);
        gl.uniform2f(locations.look, pose.look[0], pose.look[1]);
        gl.uniform1i(locations.skin, 0);
        // The eye sits on unit 1 for both layers; the layers' own textures bind to unit 0.
        if (eye) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, eye); gl.uniform1i(locations.eyeTex, 1); gl.activeTexture(gl.TEXTURE0); }
        for (let layer = 0; layer < 2; layer++) { gl.uniform1f(locations.layer, layer); gl.bindTexture(gl.TEXTURE_2D, textures[layer]!); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0); }
      },
      resize(size) { canvas.width = size; canvas.height = size; },
      isContextLost: () => gl.isContextLost(),
      onLost(listener) {
        const lost = (event: Event) => { event.preventDefault(); listener(); };
        canvas.addEventListener("webglcontextlost", lost);
        return () => canvas.removeEventListener("webglcontextlost", lost);
      },
      release,
    };
    // Any of the three failing leaves the still image, as the draft does.
    return { target, textures: Promise.all([texture(buddy.assets.body), texture(buddy.assets.accessory), texture(EYE_TEXTURE)]).then(([body, accessory, eyeTexture]) => { textures.push(body, accessory); eye = eyeTexture; }) };
  } catch (error) {
    // Home mounts Doany on every visit; a context left behind on each failure would reach Chromium's limit.
    release();
    throw error;
  }
}

// Everything the draft did on load, undone by dispose. React StrictMode runs effects twice in
// development and a canvas keeps its released (lost) context for life, so each mount draws on a fresh
// copy of React's canvas and puts React's back when it is disposed.
export function mountBuddy(buddy: Buddy, host: HTMLButtonElement, still: HTMLImageElement, placeholder: HTMLCanvasElement): { rig: DoanyRig | null; dispose(): void } {
  const canvas = placeholder.cloneNode(false) as HTMLCanvasElement;
  placeholder.replaceWith(canvas);
  // Without the still and without WebGL the slot is empty, and a shadow alone would float under nothing (doany.css).
  // The still may have failed before this effect ran, so its state is read as well as listened to.
  const stillMissing = () => { host.dataset.still = "missing"; };
  if (still.complete && still.naturalWidth === 0) stillMissing();
  still.addEventListener("error", stillMissing);
  const restore = () => { still.removeEventListener("error", stillMissing); canvas.replaceWith(placeholder); };
  // data-state and --hop-lift are written on the element directly: as React state they would re-render every frame.
  const setState = (state: string) => { host.dataset.state = state; };
  let parts: ReturnType<typeof surface>;
  try {
    parts = surface(canvas, buddy);
  } catch (error) {
    setState("static");
    console.error(error);
    return { rig: null, dispose: restore };
  }
  if (!parts) { setState("static"); return { rig: null, dispose: restore }; }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const rig = createDoanyRig({
    target: parts.target,
    textures: parts.textures,
    view: {
      width: () => host.clientWidth,
      rect: () => host.getBoundingClientRect(),
      dpr: () => devicePixelRatio,
      // Home behind the first-run overlay is visibility: hidden but still intersects the viewport.
      shown: () => host.checkVisibility({ visibilityProperty: true }),
      documentHidden: () => document.hidden,
      setState,
      setLift: lift => { host.style.setProperty("--hop-lift", String(lift)); },
      showCanvas: () => { still.hidden = true; canvas.hidden = false; },
      showStatic: () => { still.hidden = false; canvas.hidden = true; },
    },
    frames: { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) },
    reduced: () => reduced.matches,
    random: Math.random,
    connect(rig) {
      const resize = new ResizeObserver(() => rig.resize()); resize.observe(host);
      const visible = new IntersectionObserver(entries => rig.intersect(entries[0]!.isIntersecting)); visible.observe(host);
      const click = () => rig.hop();
      const keydown = (event: KeyboardEvent) => { if (rig.key(event.key, event.repeat)) event.preventDefault(); };
      // The draft frame is the whole window, so the gaze follows the pointer anywhere in it.
      const move = (event: PointerEvent) => rig.pointer(event.clientX, event.clientY);
      const change = () => rig.reducedChange();
      host.addEventListener("click", click); host.addEventListener("keydown", keydown);
      document.addEventListener("pointermove", move); reduced.addEventListener("change", change);
      return () => {
        resize.disconnect(); visible.disconnect();
        host.removeEventListener("click", click); host.removeEventListener("keydown", keydown);
        document.removeEventListener("pointermove", move); reduced.removeEventListener("change", change);
      };
    },
  });
  return { rig, dispose() { rig.dispose(); restore(); } };
}

// `size` is the drawing slot in CSS px (Home 114, Welcome 142.5); it includes the hop headroom. A new buddy is a new
// mount (a context of its own, released on unmount), so the slot is keyed by the buddy.
export function Buddy({ buddy, size, ref }: { buddy: BuddyId; size: number; ref?: Ref<BuddyHandle> }) {
  return <BuddySlot key={buddy} buddy={registry(buddy)} size={size} ref={ref} />;
}

function BuddySlot({ buddy, size, ref }: { buddy: Buddy; size: number; ref?: Ref<BuddyHandle> | undefined }) {
  const host = useRef<HTMLButtonElement>(null), still = useRef<HTMLImageElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<DoanyRig | null>(null);
  useImperativeHandle(ref, () => ({ hop: () => rig.current?.hop(), typing: () => rig.current?.typing() }), []);
  useEffect(() => {
    const mounted = mountBuddy(buddy, host.current!, still.current!, canvas.current!);
    rig.current = mounted.rig;
    return () => { rig.current = null; mounted.dispose(); };
  }, [buddy]);
  const [x, y] = buddy.rig.contact;
  return (
    <button ref={host} type="button" className="doany" aria-label={`Make ${buddy.name} hop`} style={{ width: size, height: size }}>
      <img ref={still} src={buddy.assets.still} alt="" />
      {/* The shadow stays on the floor while the buddy hops: it shrinks about the ground contact as --hop-lift rises. */}
      <img className="buddy-shadow" src={buddy.assets.shadow} alt="" aria-hidden="true" style={{ transformOrigin: `calc(16.5% + 67% * ${x}) calc(16.5% + 67% * ${y})` }} />
      <canvas ref={canvas} hidden aria-hidden="true" />
    </button>
  );
}
