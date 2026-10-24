// Capture queue for the hidden thumbnail window (design-nav 'Thumbnail'). One
// job runs at a time; a new job starts when `active` goes from null to a key.
// The caller reports each capture with `done` or `fail`.

export interface ThumbnailJob {
  key: string;
  visible: boolean;
}

export interface ThumbnailQueue {
  // In request order; the next job is the first visible one, else the first.
  pending: ThumbnailJob[];
  active: string | null;
  // Not retried until `forget`, so a canvas that cannot be captured costs one
  // attempt, not one per visit. The card shows "Preview unavailable".
  failed: string[];
  paused: boolean;
  // The running capture was `forget`-ed: its result describes an older version
  // of the canvas, so it is neither a failure nor a reason to skip a re-request.
  activeStale: boolean;
}

export type ThumbnailQueueEvent =
  | { type: "request"; key: string; visible: boolean }
  | { type: "visible"; key: string; visible: boolean }
  | { type: "done"; key: string }
  | { type: "fail"; key: string }
  // The canvas changed or was removed: drop a pending job or a failure. A
  // running capture cannot be aborted; it still reports, and that result is
  // ignored. A `request` after `forget` queues a fresh capture behind it.
  | { type: "forget"; key: string }
  | { type: "pause" }
  | { type: "resume" };

export const initialThumbnailQueue: ThumbnailQueue = { pending: [], active: null, failed: [], paused: false, activeStale: false };

export function thumbnailQueue(state: ThumbnailQueue, event: ThumbnailQueueEvent): ThumbnailQueue {
  switch (event.type) {
    case "request": {
      if ((state.active === event.key && !state.activeStale) || state.failed.includes(event.key)) return state;
      const queued = state.pending.find((job) => job.key === event.key);
      if (queued !== undefined) return event.visible && !queued.visible ? start(setVisible(state, event.key, true)) : state;
      return start({ ...state, pending: [...state.pending, { key: event.key, visible: event.visible }] });
    }
    case "visible":
      return setVisible(state, event.key, event.visible);
    case "done":
      return event.key === state.active ? start({ ...state, active: null, activeStale: false }) : state;
    case "fail":
      if (event.key !== state.active) return state;
      return start({ ...state, active: null, activeStale: false, failed: state.activeStale ? state.failed : [...state.failed, event.key] });
    case "forget":
      return { ...state, activeStale: state.activeStale || state.active === event.key, pending: state.pending.filter((job) => job.key !== event.key), failed: state.failed.filter((key) => key !== event.key) };
    case "pause":
      return state.paused ? state : { ...state, paused: true };
    case "resume":
      return state.paused ? start({ ...state, paused: false }) : state;
  }
}

function setVisible(state: ThumbnailQueue, key: string, visible: boolean): ThumbnailQueue {
  const job = state.pending.find((candidate) => candidate.key === key);
  if (job === undefined || job.visible === visible) return state;
  return { ...state, pending: state.pending.map((candidate) => (candidate === job ? { ...candidate, visible } : candidate)) };
}

// Picks the next job when nothing runs and the queue is not paused. Visibility
// is read at pick time, so a card that scrolled out falls back to its place in
// request order.
function start(state: ThumbnailQueue): ThumbnailQueue {
  if (state.active !== null || state.paused) return state;
  const next = state.pending.find((job) => job.visible) ?? state.pending[0];
  if (next === undefined) return state;
  return { ...state, pending: state.pending.filter((job) => job !== next), active: next.key };
}
