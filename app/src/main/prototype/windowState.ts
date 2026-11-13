// The single prototype window's lifecycle as pure transitions. Main owns one state, feeds it requests, list refreshes
// and run results, runs the returned effects in order and sends `prototypeView` to the window whenever the state
// object changes. Main-window navigation and hiding are not events here, so they cannot change the run.
import { EMPTY_HISTORY, canStep, recordEntry, stepHistory, type Direction, type History } from "./history";
import type { PrototypeFrame, PrototypeMode, PrototypePhase, PrototypeView, RunReport } from "./ipc";
import { parsePrototypeMark, type PrototypeSize } from "./mark";
import { canvasKeyString, sameCanvas, sameTarget, type CanvasRef, type PrototypeTarget, type Resolution } from "./targets";

export interface HistoryEntry {
  target: PrototypeTarget;
  // The size the entry was last shown at, so Back/Forward can fit before the run answers.
  size: PrototypeSize;
}

// `create` opens, shows and focuses the window at the fitted size; `fit` refits an open one (fitPrototypeWindow);
// `load` starts run `gen` (inject for it, then the host makes a new iframe); `kill` ends the canvas renderer process
// of a run that may be hung, since the next iframe would reuse it; `destroy` closes the window; `reread` asks for the
// root's canvas list again (Retry of a row `doan ls` could not read).
export type Effect =
  | { kind: "create"; size: PrototypeSize }
  | { kind: "fit"; size: PrototypeSize }
  | { kind: "activate" }
  | { kind: "load"; gen: number; url: string; frame: string }
  | { kind: "kill"; gen: number }
  | { kind: "destroy" }
  | { kind: "reread"; root: string };

// How the target's canvas row last looked in the list: `ok` can run, `error` is a row `doan ls` could not read,
// `absent` is gone (or ambiguous, or its root failed).
type Listed = "ok" | "error" | "absent";

export interface ClosedState {
  readonly open: false;
  // Generations keep counting across close, so a late result from a closed window can never match a new run.
  readonly gen: number;
  readonly history: History<HistoryEntry>;
  // The viewport mode outlives the window: closing and opening it again keeps it, quitting the app does not.
  readonly mode: PrototypeMode;
}

export interface OpenState {
  readonly open: true;
  readonly gen: number;
  readonly history: History<HistoryEntry>;
  readonly mode: PrototypeMode;
  readonly target: PrototypeTarget;
  readonly phase: PrototypePhase;
  readonly detail?: string;
  readonly run: { url: string; markWidth: number; markHeight: number } | null;
  readonly listed: Listed;
  readonly url: string | null;
  readonly source: string | null;
  // The canvas label from the last list that had the canvas, so a lost canvas keeps its name in the view.
  readonly label: string;
  // The canvas row's path from that list, so an unreadable file (listed without its ID) is still this canvas.
  readonly path: string;
  // The frame's title as last listed (by `doan ls` or a run), so a lost frame keeps its name; null before any.
  readonly title: string | null;
  // A kill since the last ready run: the canvases of this window share one renderer process, so the killed run took
  // every earlier iframe still on screen with it, and only the still image can stand for the previous screen.
  readonly previousStopped: boolean;
  // The drawer list of the target's canvas, from the current run.
  readonly frames: readonly PrototypeFrame[];
  // The last listed frame IDs per canvas seen in this window: `doan ls` has no marks, so Back/Forward know a canvas's
  // marked frames only from its runs. A canvas never reported is played and judged by its run.
  readonly reports: Readonly<Record<string, readonly string[]>>;
  // Set by a play that fits before its run answers; the run's ready size refits once if it differs.
  readonly fitHint: PrototypeSize | null;
}

export type PrototypeState = ClosedState | OpenState;

export interface Step {
  state: PrototypeState;
  effects: Effect[];
}

// `lastPath`: the target's row path as last listed, for a canvas whose ID can no longer be read (resolveTarget).
export type Resolve = (ref: CanvasRef, lastPath?: string) => Resolution;

export const CLOSED: ClosedState = { open: false, gen: 0, history: EMPTY_HISTORY, mode: "fit" };

const same = (a: HistoryEntry, b: HistoryEntry): boolean => sameTarget(a.target, b.target);

function none(state: PrototypeState): Step {
  return { state, effects: [] };
}

function leaving(state: PrototypeState): Effect[] {
  return state.open && state.phase === "loading" ? [{ kind: "kill", gen: state.gen }] : [];
}

type Present = Extract<Resolution, { kind: "present" }>;

// A list that has the frame names it, by its title or by none (null); undefined only when the frame is not listed, the
// one case where an earlier title still stands.
function titleIn(frames: readonly { id: string; title?: string }[], frame: string): string | null | undefined {
  const listed = frames.find(candidate => candidate.id === frame);
  return listed === undefined ? undefined : listed.title ?? null;
}

// A run's list names the target if it lists it; otherwise the last title stands.
function latestTitle(frames: readonly { id: string; title?: string }[], state: OpenState): string | null {
  const listed = titleIn(frames, state.target.frame);
  return listed === undefined ? state.title : listed;
}

// A new run of `target`. `fit` is set for a play that changes the target (or opens the window); a reload, Retry or
// restore keeps the window's size and does not activate it.
function start(state: PrototypeState, target: PrototypeTarget, resolved: Present, fit: { size: PrototypeSize; create: boolean } | null, history: History<HistoryEntry>): Step {
  const effects: Effect[] = [];
  if (fit !== null) effects.push(fit.create ? { kind: "create", size: fit.size } : { kind: "fit", size: fit.size }, ...(fit.create ? [] : [{ kind: "activate" } as const]));
  const killed = leaving(state);
  effects.push(...killed);
  const gen = state.gen + 1;
  const sameFrame = state.open && sameTarget(state.target, target);
  const keepFrames = state.open && sameCanvas(state.target, target) && state.listed === "ok";
  const mark = fit?.size ?? (state.open && state.run !== null ? { width: state.run.markWidth, height: state.run.markHeight } : { width: 0, height: 0 });
  // doan ls first (newest), then the frame list kept from this canvas's last run; the target's own last title stands
  // only when neither lists the frame.
  const listedTitle = [titleIn(resolved.frames, target.frame), keepFrames && state.open ? titleIn(state.frames, target.frame) : undefined]
    .find(listed => listed !== undefined);
  const base = {
    open: true as const, gen, history, mode: state.mode, target, source: resolved.source, url: resolved.url, label: resolved.label, path: resolved.path,
    title: listedTitle !== undefined ? listedTitle : sameFrame && state.open ? state.title : null,
    previousStopped: killed.length > 0 || (state.open && state.previousStopped),
    frames: keepFrames && state.open ? state.frames : [], reports: state.open ? state.reports : {}, fitHint: fit?.size ?? null,
  };
  if (resolved.error) {
    return { state: { ...base, phase: "read-failed", listed: "error", run: state.open ? state.run : null }, effects };
  }
  effects.push({ kind: "load", gen, url: resolved.url, frame: target.frame });
  return { state: { ...base, phase: "loading", listed: "ok", run: { url: resolved.url, markWidth: mark.width, markHeight: mark.height } }, effects };
}

function usable(state: OpenState, resolve: Resolve) {
  return (entry: HistoryEntry): boolean => {
    if (sameTarget(entry.target, state.target)) return false;
    const resolved = resolve(entry.target);
    if (resolved.kind !== "present" || resolved.error) return false;
    const reported = state.reports[canvasKeyString(entry.target)];
    return reported === undefined || reported.includes(entry.target.frame);
  };
}

function playTarget(state: PrototypeState, target: PrototypeTarget, size: PrototypeSize, resolve: Resolve): Step | null {
  const resolved = resolve(target);
  if (resolved.kind !== "present") return null;
  if (!state.open) return start(state, target, resolved, { size, create: true }, recordEntry(EMPTY_HISTORY, { target, size }, same));
  if (sameTarget(state.target, target)) return { state, effects: [{ kind: "activate" }] };
  return start(state, target, resolved, { size, create: false }, recordEntry(state.history, { target, size }, same));
}

// The main window's Play prototype. `size` is the parsed mark hint from its request.
export function play(state: PrototypeState, request: { target: PrototypeTarget; size: PrototypeSize }, resolve: Resolve): Step | null {
  return playTarget(state, request.target, request.size, resolve);
}

// A row of the window's frame drawer: only a frame the current run listed.
export function choose(state: PrototypeState, frame: string, resolve: Resolve): Step | null {
  if (!state.open) return null;
  const listed = state.frames.find(candidate => candidate.id === frame);
  const size = listed === undefined ? null : parsePrototypeMark(listed.size);
  if (size === null) return null;
  return playTarget(state, { ...state.target, frame }, size, resolve);
}

function go(state: PrototypeState, direction: Direction, resolve: Resolve): Step | null {
  if (!state.open) return null;
  const history = stepHistory(state.history, direction, usable(state, resolve));
  if (history === null) return null;
  const entry = history.entries[history.index]!;
  const resolved = resolve(entry.target);
  if (resolved.kind !== "present") return null;
  return start(state, entry.target, resolved, { size: entry.size, create: false }, history);
}

export function back(state: PrototypeState, resolve: Resolve): Step | null {
  return go(state, "back", resolve);
}

export function forward(state: PrototypeState, resolve: Resolve): Step | null {
  return go(state, "forward", resolve);
}

// After every list refresh: a changed source reloads, a gone canvas is lost, and the same canvas coming back reloads.
export function listChanged(state: PrototypeState, resolve: Resolve): Step {
  if (!state.open) return none(state);
  const resolved = resolve(state.target, state.path);
  if (resolved.kind === "unknown") return none(state);
  if (resolved.kind === "absent") {
    if (state.listed === "absent") return none(state);
    const { detail: _detail, ...rest } = state;
    const killed = leaving(state);
    return { state: { ...rest, phase: "frame-unavailable", listed: "absent", frames: [], fitHint: null, previousStopped: killed.length > 0 || state.previousStopped }, effects: killed };
  }
  if (state.listed !== "absent" && resolved.source === state.source && resolved.error === (state.listed === "error")) return none(state);
  return start(state, state.target, resolved, null, state.history);
}

// Header Reload and the failure screens' Retry, for the run the window shows. A row `doan ls` could not read has no
// run to start: Retry reads the root's list again, and that refresh judges the row anew (listChanged).
export function reload(state: PrototypeState, gen: number): Step {
  if (!state.open || gen !== state.gen) return none(state);
  if (state.listed === "error") return { state, effects: [{ kind: "reread", root: state.target.root }] };
  if (state.listed !== "ok" || state.url === null || state.source === null) return none(state);
  return start(state, state.target, { kind: "present", url: state.url, source: state.source, error: false, frames: [], label: state.label, path: state.path }, null, state.history);
}

function current(state: OpenState, gen: number): boolean {
  return gen === state.gen && state.phase === "loading";
}

export function report(state: PrototypeState, result: RunReport): Step {
  if (!state.open || !current(state, result.gen)) return none(state);
  if (result.state === "timeout") return { state: { ...state, phase: "init-failed", fitHint: null, previousStopped: true }, effects: [{ kind: "kill", gen: result.gen }] };
  const reports = { ...state.reports, [canvasKeyString(state.target)]: result.frames.map(frame => frame.id) };
  const title = latestTitle(result.frames, state);
  if (result.state !== "ready") {
    const phase = result.state === "missing" || result.state === "duplicate" ? "frame-unavailable" : "prototype-unavailable";
    return { state: { ...state, phase, frames: result.frames, reports, title, fitHint: null }, effects: [] };
  }
  const { size } = result;
  const hint = state.fitHint;
  const effects: Effect[] = hint !== null && (hint.width !== size.width || hint.height !== size.height) ? [{ kind: "fit", size }] : [];
  const entries = state.history.entries.map(entry => (sameTarget(entry.target, state.target) ? { ...entry, size } : entry));
  const run = state.run === null ? null : { ...state.run, markWidth: size.width, markHeight: size.height };
  return { state: { ...state, phase: "ready", run, frames: result.frames, reports, title, previousStopped: false, fitHint: null, history: { entries, index: state.history.index } }, effects };
}

export function framesReported(state: PrototypeState, gen: number, frames: PrototypeFrame[]): Step {
  if (!state.open || gen !== state.gen || state.listed !== "ok") return none(state);
  return { state: { ...state, frames, title: latestTitle(frames, state), reports: { ...state.reports, [canvasKeyString(state.target)]: frames.map(frame => frame.id) } }, effects: [] };
}

// The server could not give the run's document (main sees the iframe's failed load).
export function readFailed(state: PrototypeState, gen: number, detail: string): Step {
  if (!state.open || !current(state, gen)) return none(state);
  return { state: { ...state, phase: "read-failed", detail, fitHint: null }, effects: [] };
}

export function close(state: PrototypeState): Step {
  if (!state.open) return none(state);
  return { state: { open: false, gen: state.gen, history: EMPTY_HISTORY, mode: state.mode }, effects: [...leaving(state), { kind: "destroy" }] };
}

// The header's Fit/Responsive toggle. Only the iframe's box changes: no new run, refit or kill, and a loading run
// keeps its gen and its timer.
export function setMode(state: PrototypeState, mode: PrototypeMode): Step {
  return state.mode === mode ? none(state) : none({ ...state, mode });
}

export function prototypeView(state: PrototypeState, resolve: Resolve): PrototypeView | null {
  if (!state.open) return null;
  const { frame } = state.target;
  const resolved = resolve(state.target, state.path);
  const title = state.title ?? frame;
  const ok = usable(state, resolve);
  return {
    gen: state.gen, frame, title, canvas: resolved.kind === "present" ? resolved.label : state.label, phase: state.phase, ...(state.detail === undefined ? {} : { detail: state.detail }),
    run: state.run, mode: state.mode, previousStopped: state.previousStopped, frames: [...state.frames], canGoBack: canStep(state.history, "back", ok), canGoForward: canStep(state.history, "forward", ok),
  };
}
