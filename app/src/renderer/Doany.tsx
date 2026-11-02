// SPDX-License-Identifier: MIT
// Doany, Doan's mascot: the WebGL shell of the V2 draft prototype .doan/assets/doany/v2/mascot.js
// (MIT, Doan contributors). Context options, shaders, mesh, blend and texture parameters are the
// draft's, unchanged (Doany.test.tsx compares the WebGL calls with the draft's, and doanyRender.test.ts
// checks the shader's anchors against the shipped artwork); only the drawn pose is bounded (drawnPose).
// Motion lives in doanyMotion.ts and the frame loop in doanyRig.ts.
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Pose } from "./doanyMotion";
import { createDoanyRig, type DoanyRig, type DoanyTarget } from "./doanyRig";

export interface DoanyHandle { hop(): void; typing(): void }

const vertex = `
    precision mediump float;
    attribute vec2 aUV;
    varying vec2 vUV;
    uniform float time, squash, lift, tilt, hatTilt, layer, energy;
    uniform vec2 look;
    void main() {
      vUV = aUV;
      vec2 p = aUV;
      if (layer > .5) {
        vec2 h = p - vec2(.67,.30);
        float c = cos(hatTilt), s = sin(hatTilt);
        p = vec2(c*h.x-s*h.y,s*h.x+c*h.y) + vec2(.67,.30);
      }
      vec2 q = p - vec2(.5,.60);
      if (layer < .5) {
        q.x += look.x * .018 * (1.-abs(q.y));
      }
      q.x *= 1.+squash;
      q.y *= 1.-squash;
      q.y += squash*.36;
      float c = cos(tilt), s = sin(tilt);
      q = vec2(c*q.x-s*q.y,s*q.x+c*q.y);
      q += vec2(0.,.10-lift);
      gl_Position = vec4(q.x*1.34,-q.y*1.34,0.,1.);
    }`;
const fragment = `
    precision mediump float;
    varying vec2 vUV;
    uniform sampler2D skin;
    uniform float layer, eyeOpen;
    uniform vec2 look;
    float eye(vec2 center) {
      vec2 d = (vUV-center-look*vec2(.018,.014))/vec2(.035,.056*max(.065,eyeOpen));
      return 1.-smoothstep(.94,1.03,length(d));
    }
    void main() {
      vec4 col = texture2D(skin,vUV);
      if (layer < .5) {
        float mask = max(eye(vec2(.421,.550)), eye(vec2(.619,.550)));
        float shine = exp(-pow((vUV.y-.523-look.y*.014)*42.,2.));
        col.rgb = mix(col.rgb,vec3(.025)+vec3(.085)*shine,mask);
      }
      gl_FragColor = col;
    }`;
// The V2 draft leaves the beret no headroom: at the hop's apex with the pointer far left its top already
// reaches the canvas edge, and quick presses swing it further out. So, unlike the draft, the app draws
// the hop 10% lower and holds the beret's tilt to [-.30, +.15], which a single hop with the pointer
// anywhere stays inside (about -.19 to +.13), so only a burst of presses meets it. Together they keep
// at least 1.4 device px (Home's 228 px canvas; 1.75 in Welcome's 286) between the drawing and the
// canvas edge for any press sequence, enough to survive antialiasing (doanyRender.test.ts). Bounding the
// tilt alone could not: even level, the beret's top comes within 1 device px at the apex. The rest
// frame has no lift or tilt, so it stays the draft's byte for byte; the motion state is untouched.
export const BERET_TILT = [-.3, .15] as const;
const LIFT_SCALE = .9;
export function drawnPose(pose: Pose): Pose {
  return { ...pose, lift: pose.lift * LIFT_SCALE, hatTilt: Math.min(BERET_TILT[1], Math.max(BERET_TILT[0], pose.hatTilt)) };
}

const UNIFORMS = ["time", "squash", "lift", "tilt", "hatTilt", "layer", "energy", "look", "eyeOpen", "skin"] as const;

// Null without WebGL; throws when a shader does not compile or link, after releasing the context.
function surface(canvas: HTMLCanvasElement): { target: DoanyTarget; textures: Promise<unknown> } | null {
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
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
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
    const texture = (name: string) =>
      new Promise<WebGLTexture>((resolve, reject) => {
        const img = new Image();
        // Kept from the draft: textures load with and without it from file:// and asar paths (doan-mascot P0).
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
        // Relative, so the packaged app's file URL resolves it next to index.html.
        img.onerror = () => reject(Error("Could not load " + name)); img.src = `doany/${name}`;
      });
    const target: DoanyTarget = {
      draw(pose) {
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
        const { time, squash, lift, tilt, hatTilt, energy, eyeOpen } = drawnPose(pose);
        for (const [key, value] of Object.entries({ time, squash, lift, tilt, hatTilt, energy, eyeOpen })) gl.uniform1f(locations[key as keyof typeof locations], value);
        gl.uniform2f(locations.look, pose.look[0], pose.look[1]);
        gl.uniform1i(locations.skin, 0);
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
    return { target, textures: Promise.all([texture("body.png"), texture("hat.png")]).then(ts => { textures.push(...ts); }) };
  } catch (error) {
    // Home mounts Doany on every visit; a context left behind on each failure would reach Chromium's limit.
    release();
    throw error;
  }
}

// Everything the draft did on load, undone by dispose. React StrictMode runs effects twice in
// development and a canvas keeps its released (lost) context for life, so each mount draws on a fresh
// copy of React's canvas and puts React's back when it is disposed.
export function mountDoany(host: HTMLButtonElement, still: HTMLImageElement, placeholder: HTMLCanvasElement): { rig: DoanyRig | null; dispose(): void } {
  const canvas = placeholder.cloneNode(false) as HTMLCanvasElement;
  placeholder.replaceWith(canvas);
  const restore = () => canvas.replaceWith(placeholder);
  // data-state is written on the element directly: as React state it would re-render on every frame.
  const setState = (state: string) => { host.dataset.state = state; };
  let parts: ReturnType<typeof surface>;
  try {
    parts = surface(canvas);
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

// `size` is the drawing slot in CSS px (Home 114, Welcome 142.5); it includes the hop headroom.
export function Doany({ size, ref }: { size: number; ref?: Ref<DoanyHandle> }) {
  const host = useRef<HTMLButtonElement>(null), still = useRef<HTMLImageElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<DoanyRig | null>(null);
  useImperativeHandle(ref, () => ({ hop: () => rig.current?.hop(), typing: () => rig.current?.typing() }), []);
  useEffect(() => {
    const mounted = mountDoany(host.current!, still.current!, canvas.current!);
    rig.current = mounted.rig;
    return () => { rig.current = null; mounted.dispose(); };
  }, []);
  return (
    <button ref={host} type="button" className="doany" aria-label="Make Doany hop" style={{ width: size, height: size }}>
      <img ref={still} src="doany/doany.png" alt="" />
      <canvas ref={canvas} hidden aria-hidden="true" />
    </button>
  );
}
