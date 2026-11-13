import type { Rect } from "../../main/prototype/fit";
import type { FramesMessage, PrototypePhase, RunMessage } from "../../main/prototype/ipc";

// The prototype window's content layers: one iframe per run (a new element for every `gen` that starts a load) and the
// still image main captures whenever a run leaves a ready phase. Pure, so the window's order of events is tested
// without one.

// Each iframe keeps its own run's mark, so a run still on screen is not resized to the next run's mark while that one
// loads.
export interface RunFrame { gen: number; url: string; markWidth: number; markHeight: number }
export interface HostLayers {
  // Mounted iframes, oldest first. While a run loads, the previous run stays visible and live above it.
  frames: RunFrame[];
  // The run on screen; null when nothing ran yet or a failed or lost state removed the runs.
  visible: number | null;
  // Main's latest still image at the box main took it from. It shows only while no run is on screen, and goes when a
  // run is ready.
  snapshot: Snapshot | null;
}

export interface Snapshot { gen: number; url: string; box: Rect }

export const NO_LAYERS: HostLayers = { frames: [], visible: null, snapshot: null };

// `previousStopped`: main killed a loading run, and iframes in the prototype partition share a renderer process, so the
// previous run on screen may have died with it.
export interface LayerView { gen: number; phase: PrototypePhase; run: { url: string; markWidth: number; markHeight: number } | null; previousStopped: boolean }

// The view's run carries its mark, which its ready size may replace; only that gen's iframe takes it.
function withMark(frames: RunFrame[], view: LayerView): RunFrame[] {
  const run = view.run;
  if (run === null || !frames.some(frame => frame.gen === view.gen && (frame.markWidth !== run.markWidth || frame.markHeight !== run.markHeight))) return frames;
  return frames.map(frame => (frame.gen === view.gen ? { ...frame, markWidth: run.markWidth, markHeight: run.markHeight } : frame));
}

// A run starts only with a `loading` view of a gen no iframe has; a failed read keeps the last run's url without one.
// While it loads, the previous run stays on screen and live, unless main stopped it.
// A ready run takes the screen, and older iframes and the still image go. A failed or lost state removes every iframe,
// which stops the runs, and leaves the still image in their place (an empty panel when there is none, as after a first
// load in a new window).
export function layersForView(previous: HostLayers, view: LayerView | null): HostLayers {
  if (view === null) return NO_LAYERS;
  const frames = withMark(previous.frames, view);
  const layers = frames === previous.frames ? previous : { ...previous, frames };
  const mounted = layers.frames.some(frame => frame.gen === view.gen);
  if (view.phase === "loading") {
    const started = mounted || view.run === null ? layers : { ...layers, frames: [...layers.frames, { gen: view.gen, url: view.run.url, markWidth: view.run.markWidth, markHeight: view.run.markHeight }] };
    // The older runs go and main's latest still image (re-sent under this gen) takes their place while this run loads.
    if (!view.previousStopped || !started.frames.some(frame => frame.gen < view.gen)) return started;
    return { ...started, frames: started.frames.filter(frame => frame.gen >= view.gen), visible: null };
  }
  if (view.phase === "ready") {
    if (!mounted) return layers;
    if (layers.visible === view.gen && layers.frames.length === 1 && layers.snapshot === null) return layers;
    return { frames: layers.frames.filter(frame => frame.gen === view.gen), visible: view.gen, snapshot: null };
  }
  if (layers.frames.length === 0 && layers.visible === null) return layers;
  return { frames: [], visible: null, snapshot: layers.snapshot };
}

// Main sends the image before the view it belongs to, so its gen is the view's current one or the next; an older one
// arrived late and is dropped.
export function layersForSnapshot(layers: HostLayers, snapshot: Snapshot, currentGen: number | null): HostLayers {
  if (currentGen !== null && snapshot.gen < currentGen) return layers;
  return { ...layers, snapshot };
}

// The run whose messages the host forwards and whose timer runs: the newest iframe, while it is the view's gen.
export function currentRun(layers: HostLayers, gen: number | null): RunFrame | null {
  const newest = layers.frames.at(-1);
  return newest !== undefined && newest.gen === gen ? newest : null;
}

export type Forward = { kind: "result"; message: RunMessage } | { kind: "frames"; message: FramesMessage };

// A message from the run's document. Only the current iframe's own window, at the opaque origin a sandboxed canvas
// has, for the current gen, gets through; main validates every field again. A result carries `state`; the drawer list
// a run sends after its `load` handlers does not.
export function forwardedMessage(event: { source: unknown; origin: string; data: unknown }, run: { gen: number; window: unknown } | null): Forward | null {
  if (run === null || event.source === null || event.source !== run.window || event.origin !== "null") return null;
  const data = event.data;
  if (typeof data !== "object" || data === null || Array.isArray(data) || (data as { gen?: unknown }).gen !== run.gen) return null;
  return "state" in data ? { kind: "result", message: data as RunMessage } : { kind: "frames", message: data as FramesMessage };
}
