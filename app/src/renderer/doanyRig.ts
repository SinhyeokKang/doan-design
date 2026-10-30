// SPDX-License-Identifier: MIT
// Doany's controller: the draft's shell flow from .doan/assets/doany/motion/mascot.js (MIT, Doan
// contributors) with every DOM and WebGL dependency injected, so node tests can drive it with fakes.
// Doany.tsx supplies the real WebGL target, observers and listeners.
import { advance, canvasSize, hop, initialState, pointer, pose, reducedChanged, typing, type Pose, type Rect } from "./doanyMotion";

export interface DoanyTarget {
  draw(pose: Pose): void;
  resize(size: number): void;
  isContextLost(): boolean;
  onLost(listener: () => void): () => void;
  release(): void;
}

export interface DoanyView {
  width(): number;
  rect(): Rect;
  dpr(): number;
  // Not hidden by CSS visibility: Home behind the first-run overlay still intersects the viewport.
  shown(): boolean;
  documentHidden(): boolean;
  setState(state: string): void;
  showCanvas(): void;
  showStatic(): void;
}

export interface DoanyRig {
  resize(): void;
  intersect(isIntersecting: boolean): void;
  pointer(clientX: number, clientY: number): void;
  hop(): void;
  // Returns whether the key hopped, so the caller prevents its default.
  key(key: string): boolean;
  typing(): void;
  reducedChange(): void;
  dispose(): void;
}

export function createDoanyRig(deps: {
  target: DoanyTarget;
  textures: Promise<unknown>;
  view: DoanyView;
  frames: { request(callback: (now: number) => void): number; cancel(id: number): void };
  reduced: () => boolean;
  random: () => number;
  // Wires observers and listeners to the rig; the returned function removes them.
  connect: (rig: DoanyRig) => () => void;
}): DoanyRig {
  const { target, view, frames } = deps;
  const state = initialState();
  let ready = false, visible = true, disposed = false;
  function render() {
    if (!ready || target.isContextLost()) return;
    const drawn = pose(state, deps.reduced());
    state.mode = drawn.mode;
    view.setState(drawn.mode);
    target.draw(drawn);
  }
  function resize() {
    target.resize(canvasSize(view.width(), view.dpr()));
    render();
  }
  function tick(now: number) {
    if (ready && deps.reduced() && state.mode !== "reduced-motion") render();
    if (advance(state, now, ready && visible && view.shown() && !view.documentHidden() && !deps.reduced(), deps.random)) render();
    frame = frames.request(tick);
  }
  const rig: DoanyRig = {
    resize,
    intersect(isIntersecting) { visible = isIntersecting; },
    pointer(clientX, clientY) { pointer(state, clientX, clientY, view.rect()); },
    hop() { hop(state, deps.reduced()); },
    key(key) {
      if (key !== "Enter" && key !== " ") return false;
      hop(state, deps.reduced());
      return true;
    },
    typing() { typing(state); },
    reducedChange() { reducedChanged(state); render(); },
    // The lost listener goes first: releasing the context reports a loss, which must not record static
    // while Doany unmounts. The context is released last so each Home visit returns its own context
    // instead of piling up to Chromium's limit.
    dispose() {
      disposed = true;
      offLost();
      frames.cancel(frame);
      disconnect();
      target.release();
    },
  };
  const offLost = target.onLost(() => { view.showStatic(); view.setState("static"); });
  const disconnect = deps.connect(rig);
  deps.textures.then(() => {
    if (disposed) return;
    ready = true;
    view.showCanvas();
    resize();
  }).catch((error: unknown) => {
    if (disposed) return;
    view.setState("static");
    console.error(error);
  });
  let frame = frames.request(tick);
  return rig;
}
