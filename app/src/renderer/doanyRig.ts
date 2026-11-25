// SPDX-License-Identifier: MIT
// The shell flow of .doan/assets/buddies/motion-preview.js (MIT, Doan contributors) with every DOM and WebGL dependency
// injected, so node tests can drive it with fakes.
import { advance, canvasSize, hop, hopLift, initialState, pointer, pose, reducedChanged, typing, type Pose, type Rect } from "./doanyMotion";

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
  // Not CSS visibility: Home behind the first-run overlay still intersects the viewport.
  shown(): boolean;
  documentHidden(): boolean;
  setState(state: string): void;
  // The floor shadow outside WebGL follows it. The rig never touches the DOM.
  setLift(lift: number): void;
  showCanvas(): void;
  showStatic(): void;
}

export interface DoanyRig {
  resize(): void;
  intersect(isIntersecting: boolean): void;
  pointer(clientX: number, clientY: number): void;
  hop(): void;
  // Returns whether the key is a hop key, so the caller prevents its default (repeats included).
  key(key: string, repeat?: boolean): boolean;
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
  // The returned function removes them.
  connect: (rig: DoanyRig) => () => void;
  // ready: after it had drawn.
  failed: (ready: boolean) => void;
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
    view.setLift(hopLift(drawn));
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
    key(key, repeat = false) {
      if (key !== "Enter" && key !== " ") return false;
      // A held key repeats keydown, and each hop kicks the beret spring until it spins out of the canvas. A repeat still
      // prevents the default, or Enter would click the button and hop anyway.
      if (!repeat) hop(state, deps.reduced());
      return true;
    },
    typing() { typing(state); },
    reducedChange() { reducedChanged(state); render(); },
    // Releasing the context reports a loss, so the lost listener goes first. Releasing last returns each Home visit's own
    // context instead of piling up to Chromium's limit.
    dispose() {
      disposed = true;
      offLost();
      frames.cancel(frame);
      disconnect();
      target.release();
    },
  };
  // The still image stands on the floor, so its shadow is at rest.
  const offLost = target.onLost(() => { view.showStatic(); view.setState("static"); view.setLift(0); deps.failed(ready); });
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
    deps.failed(false);
  });
  let frame = frames.request(tick);
  return rig;
}
