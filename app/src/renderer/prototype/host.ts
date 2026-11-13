import type { FramesMessage, PrototypePhase, RunMessage } from "../../main/prototype/ipc";

// The prototype window's content layers: one iframe per run (a new element for every `gen` that starts a load) and the
// still image main captures when a ready run fails or loses its frame. Pure, so the window's order of events is
// tested without one.

export interface RunFrame { gen: number; url: string }
export interface HostLayers {
  // Mounted iframes, oldest first. While a run loads, the previous screen stays visible above it.
  frames: RunFrame[];
  // The run on screen; null when nothing ran yet or a still image replaced it.
  visible: number | null;
  snapshot: { gen: number; url: string } | null;
}

export const NO_LAYERS: HostLayers = { frames: [], visible: null, snapshot: null };

export interface LayerView { gen: number; phase: PrototypePhase; run: { url: string } | null }

// A run starts only with a `loading` view of a gen no iframe has; a failed read keeps the last run's url without one.
// A ready run takes the screen, and older iframes and any still image go. A run that ends failed or lost before it was
// ready is removed, which stops it; what was on screen stays under the overlay.
export function layersForView(layers: HostLayers, view: LayerView | null): HostLayers {
  if (view === null) return NO_LAYERS;
  const mounted = layers.frames.some(frame => frame.gen === view.gen);
  if (view.phase === "loading") {
    if (mounted || view.run === null) return layers;
    return { ...layers, frames: [...layers.frames, { gen: view.gen, url: view.run.url }] };
  }
  if (!mounted) return layers;
  if (view.phase === "ready") {
    if (layers.visible === view.gen && layers.frames.length === 1 && layers.snapshot === null) return layers;
    return { frames: layers.frames.filter(frame => frame.gen === view.gen), visible: view.gen, snapshot: null };
  }
  if (layers.visible === view.gen) return layers;
  return { ...layers, frames: layers.frames.filter(frame => frame.gen !== view.gen) };
}

// Main's still image of the run's last moment, sent before the failed or lost view: it replaces every iframe, which
// stops the run. One for an older run than the window shows is stale.
export function layersForSnapshot(layers: HostLayers, snapshot: { gen: number; url: string }, currentGen: number | null): HostLayers {
  if (currentGen === null || snapshot.gen !== currentGen) return layers;
  return { frames: [], visible: null, snapshot };
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
