// The one prototype window's state as main holds it: requests, list refreshes and run results go through the pure
// transitions, their effects go to the window host in order, and the window gets the view whenever it changes.
// Electron-free; prototypeWindow.ts is the host.
import type { ExportReply } from "../canvasExport";
import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import { prototypePanelWidth, type Rect } from "./fit";
import { PROTOTYPE_CHANNELS, type ExportTarget, type PrototypeMode, type PrototypeSnapshot, type PrototypeView } from "./ipc";
import type { PrototypeSize } from "./mark";
import type { PlayingCanvas } from "./conversationScope";
import { exportTargetMatches, parseChooseRequest, parseExportRequest, parseFramesReport, parseModeRequest, parsePanelRequest, parseReloadRequest, parseRunReport, validatePlay, windowRequest } from "./requests";
import { resolveTarget, type PrototypeTarget } from "./targets";
import * as transitions from "./windowState";
import { CLOSED, type PrototypeState, type Resolve, type Step } from "./windowState";

export interface PrototypeHost {
  // `panel`: the conversation panel's width while it is open, else null. With the panel open the window fits the shown
  // size plus the panel (prototypePanelFit) and answers the panel width it gave; null otherwise.
  create(size: PrototypeSize, panel: number | null): number | null;
  fit(size: PrototypeSize, panel: number | null): number | null;
  // Open the conversation panel: widen a narrow window (openPanelResize) and keep it at least 640; answers the width.
  openPanel(remembered: number | null): number;
  // The panel closed: the window keeps its size and may be 360 again.
  closePanel(): void;
  // The window's content width now, which bounds an open panel's width.
  contentWidth(): number;
  activate(): void;
  // Arm the injection for this run before its iframe exists.
  load(run: { gen: number; url: string; frame: string }): void;
  kill(gen: number): void;
  destroy(): void;
  // Read the root's canvas list again; the refresh comes back through listChanged.
  reread(root: string): void;
  sendView(view: PrototypeView): void;
  // The run's visible area as PNG bytes with where it sat in the content panel, or null when it cannot be read.
  // `sideColumn` is the conversation column's width (its handle included), which the still must leave out.
  capture(mark: PrototypeSize, mode: PrototypeMode, sideColumn: number): Promise<Still | null>;
  sendSnapshot(snapshot: PrototypeSnapshot): void;
}

export interface Still {
  png: Uint8Array;
  box: Rect;
}

// `played`: the window opened or moved to the frame; `activated`: it was playing already and only came forward;
// `refused`: the canvas is no longer a target (its row went, or its ID is now shared).
export type CliPlayResult = "played" | "activated" | "refused";

export interface PrototypeController {
  play(kind: WindowKind, value: unknown): void;
  // `doan open --prototype`, already judged against main's list (cliPlay.ts).
  playFromCli(request: { target: PrototypeTarget; size: PrototypeSize }): CliPlayResult;
  // `prototype:export`: the clicked target when it is still the one playing, else main's refusal.
  exportTarget(kind: WindowKind, value: unknown): ExportTarget | Extract<ExportReply, { kind: "refused" }>;
  // Every `prototype:*` request of the prototype window; `read`'s reply is the view, every other reply is undefined.
  request(channel: string, kind: WindowKind, value: unknown): PrototypeView | null | undefined;
  listChanged(): void;
  // The run's document could not be read (the iframe's failed load or HTTP error), for run `gen`.
  readFailed(gen: number, detail: string): void;
  // ⌘W, the native close and the window going away by any other path.
  windowClosing(): void;
  // The canvas the window plays now, for the conversation scope; null while closed.
  playing(): PlayingCanvas | null;
  // The conversation panel is open now.
  panelOpen(): boolean;
}

export function createPrototypeController(host: PrototypeHost, entries: () => readonly FolderEntry[]): PrototypeController {
  let state: PrototypeState = CLOSED;
  let sent: string | null = null;
  // Snapshot captures are async; views queue behind them so the image always arrives before its view.
  let queue: Promise<void> | null = null;
  // The last still taken in this window, re-sent when a kill stops the screen it stood for.
  let latest: Still | null = null;
  // The gen of a kill's view: the latest still goes out again just before that view, whenever the view is sent, so a
  // still that finishes after the kill is still the one re-sent.
  let resendFor: number | null = null;
  const resolve: Resolve = (ref, lastPath) => resolveTarget(ref, entries(), lastPath);

  const sendView = () => {
    const view = transitions.prototypeView(state, resolve);
    if (view === null) { sent = null; return; }
    const text = JSON.stringify(view);
    if (text === sent) return;
    sent = text;
    if (resendFor === view.gen) {
      resendFor = null;
      if (latest !== null) host.sendSnapshot({ gen: view.gen, ...latest });
    }
    host.sendView(view);
  };

  const later = (work: () => Promise<void> | void) => {
    const next: Promise<void> = (queue ?? Promise.resolve()).then(work).catch((error: unknown) => console.error("doan: prototype view failed", error))
      .finally(() => { if (queue === next) queue = null; });
    queue = next;
  };

  // Leaving a ready run by any path (a reload, a source change, a restore, Retry, another target, a failure or a lost
  // frame) takes a still of its screen. A reload keeps the old iframe showing until the new run is ready; if that run
  // then fails, the renderer stops the old one behind this still, and a capture taken then would hold the loading
  // overlay. Started before the step's effects, so a refit for another target cannot reach the image.
  const leavingReady = (previous: PrototypeState): Promise<Still | null> | null => {
    if (!previous.open || previous.phase !== "ready" || previous.run === null || !state.open) return null;
    if (state.gen === previous.gen && state.phase === "ready") return null;
    // The window may have shrunk since the width was stored: the column on screen is the width cut to it.
    const column = previous.panel.open && previous.panel.width !== null ? prototypePanelWidth(previous.panel.width, host.contentWidth()) : 0;
    return host.capture({ width: previous.run.markWidth, height: previous.run.markHeight }, previous.mode, column).catch(() => null);
  };

  // The still goes out before the view of the state that followed, tagged with that view's gen. A kill also stops the
  // earlier iframes still on screen (one renderer process), so the latest still goes out again under the new gen.
  const publish = (still: Promise<Still | null> | null, killed: boolean) => {
    if (killed && still === null && state.open) resendFor = state.gen;
    if (still !== null) {
      const gen = state.gen;
      later(async () => {
        const taken = await still;
        if (!state.open) return;
        // Kept even when a later step moved the gen on: a kill right after leaving ready re-sends this still, with the
        // box it was taken at. A still that could not be read clears the last one, so another frame's screen is never
        // re-sent in its place.
        latest = taken;
        if (taken !== null && state.gen === gen) host.sendSnapshot({ gen, ...taken });
      });
    }
    if (queue === null) sendView();
    else later(sendView);
  };

  const apply = (step: Step | null) => {
    if (step === null) return;
    const previous = state;
    state = step.state;
    if (!state.open) { latest = null; resendFor = null; }
    const still = leavingReady(previous);
    // A fit with the panel open may narrow the panel to fit the work area (prototypePanelFit); the view says so.
    const fitted = (given: number | null) => {
      if (given !== null && state.open && state.panel.open && given !== state.panel.width) state = { ...state, panel: { open: true, width: given } };
    };
    const panel = () => (state.open && state.panel.open ? state.panel.width : null);
    for (const effect of step.effects) {
      switch (effect.kind) {
        case "create": fitted(host.create(effect.size, panel())); break;
        case "fit": fitted(host.fit(effect.size, panel())); break;
        case "activate": host.activate(); break;
        case "load": host.load({ gen: effect.gen, url: effect.url, frame: effect.frame }); break;
        case "kill": host.kill(effect.gen); break;
        case "destroy": host.destroy(); break;
        case "reread": host.reread(effect.root); break;
      }
    }
    publish(still, step.effects.some(effect => effect.kind === "kill"));
  };

  return {
    play(kind, value) {
      const request = validatePlay(kind, value, entries());
      if (request !== null) apply(transitions.play(state, request, resolve));
    },
    playFromCli(request) {
      const step = transitions.play(state, request, resolve);
      if (step === null) return "refused";
      const activated = step.state === state;
      apply(step);
      return activated ? "activated" : "played";
    },
    exportTarget(kind, value) {
      const clicked = parseExportRequest(kind, value);
      if (clicked === null || !state.open) return { kind: "refused", reason: "notListed" };
      // A canvas ID two rows now share resolves to nothing, as it does for a run.
      const resolved = resolve(state.target, state.path);
      const current = resolved.kind === "present" ? { root: state.target.root, path: resolved.path, frame: state.target.frame } : null;
      if (exportTargetMatches(clicked, current)) return clicked;
      return { kind: "refused", reason: current === null ? "notListed" : "changed" };
    },
    request(channel, kind, value) {
      switch (channel) {
        case PROTOTYPE_CHANNELS.read:
          return windowRequest(kind) && value === undefined ? transitions.prototypeView(state, resolve) : null;
        case PROTOTYPE_CHANNELS.result: {
          const report = parseRunReport(kind, value);
          if (report !== null) apply(transitions.report(state, report));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.frames: {
          const message = parseFramesReport(kind, value);
          if (message !== null) apply(transitions.framesReported(state, message.gen, message.frames));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.reload: {
          const gen = parseReloadRequest(kind, value);
          if (gen !== null) apply(transitions.reload(state, gen));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.mode: {
          const mode = parseModeRequest(kind, value);
          if (mode !== null) apply(transitions.setMode(state, mode));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.panel: {
          const request = parsePanelRequest(kind, value);
          if (request === null || !state.open) return undefined;
          if (request.open && !state.panel.open) {
            apply(transitions.setPanel(state, { open: true, width: host.openPanel(request.width ?? state.panel.width) }));
            return undefined;
          }
          if (!request.open && state.panel.open) host.closePanel();
          // A width the renderer sent is cut to the window as it is now; it may have been sent before the window shrank.
          apply(transitions.setPanel(state, request.width === undefined ? request : { ...request, width: prototypePanelWidth(request.width, host.contentWidth()) }));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.choose: {
          const frame = parseChooseRequest(kind, value);
          if (frame !== null) apply(transitions.choose(state, frame, resolve));
          return undefined;
        }
        case PROTOTYPE_CHANNELS.back:
        case PROTOTYPE_CHANNELS.forward:
        case PROTOTYPE_CHANNELS.close:
          if (!windowRequest(kind) || value !== undefined) return undefined;
          if (channel === PROTOTYPE_CHANNELS.back) apply(transitions.back(state, resolve));
          else if (channel === PROTOTYPE_CHANNELS.forward) apply(transitions.forward(state, resolve));
          else apply(transitions.close(state));
          return undefined;
        default:
          return undefined;
      }
    },
    // The view also follows the list when the state does not change: Back/Forward and titles read it.
    listChanged() { apply(transitions.listChanged(state, resolve)); },
    readFailed(gen, detail) { apply(transitions.readFailed(state, gen, detail)); },
    windowClosing() { apply(transitions.close(state)); },
    playing() {
      return state.open ? { root: state.target.root, canvas: state.target.canvas, path: state.path } : null;
    },
    panelOpen() { return state.open && state.panel.open; },
  };
}
