// First prompt wait state (app-setup design.md 'First prompt'). Renderer memory
// only: a restart forgets it. Pure so the wizard and the empty workspace share it.

export interface ArrivalRow { path: string; mtimeMs?: number }

export type FirstPromptState =
  | { kind: "idle" }
  // `knownPaths` is the canvas set at the moment the clipboard write finished.
  | { kind: "waiting"; root: string; knownPaths: readonly string[] }
  | { kind: "arrived"; root: string; path: string };

export type FirstPromptEvent =
  | { type: "copied"; root: string; knownPaths: readonly string[] }
  // The canvas rows of a `list` folder entry after a refresh.
  | { type: "listed"; root: string; rows: readonly ArrivalRow[] }
  | { type: "removed"; root: string }
  // Typing in the input is deliberately a no-op: it must not cancel a wait.
  | { type: "edited" }
  | { type: "dismissed" };

// The newest canvas that was not there at Copy time. A path that existed and was
// rewritten is not an arrival. A missing mtime (the file vanished after `doan ls`)
// ranks below any known one; ties keep the listed order.
export function arrival(knownPaths: readonly string[], rows: readonly ArrivalRow[]): string | null {
  const known = new Set(knownPaths);
  let best: ArrivalRow | null = null;
  for (const row of rows) {
    if (known.has(row.path)) continue;
    if (best === null || (row.mtimeMs ?? -Infinity) > (best.mtimeMs ?? -Infinity)) best = row;
  }
  return best === null ? null : best.path;
}

export function firstPromptReducer(state: FirstPromptState, event: FirstPromptEvent): FirstPromptState {
  switch (event.type) {
    case "copied": return { kind: "waiting", root: event.root, knownPaths: event.knownPaths };
    case "listed": {
      if (state.kind !== "waiting" || state.root !== event.root) return state;
      const path = arrival(state.knownPaths, event.rows);
      return path === null ? state : { kind: "arrived", root: state.root, path };
    }
    case "removed": return state.kind !== "idle" && state.root === event.root ? { kind: "idle" } : state;
    case "edited": return state;
    case "dismissed": return { kind: "idle" };
  }
}
