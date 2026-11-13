// The one prototype window's state as main holds it: requests, list refreshes and run results go through the pure
// transitions, their effects go to the window host in order, and the window gets the view whenever it changes.
// Electron-free; prototypeWindow.ts is the host.
import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import { PROTOTYPE_CHANNELS, type PrototypeSnapshot, type PrototypeView } from "./ipc";
import type { PrototypeSize } from "./mark";
import { parseChooseRequest, parseFramesReport, parseReloadRequest, parseRunReport, validatePlay, windowRequest } from "./requests";
import { resolveTarget } from "./targets";
import * as transitions from "./windowState";
import { CLOSED, type PrototypeState, type Resolve, type Step } from "./windowState";

export interface PrototypeHost {
  create(size: PrototypeSize): void;
  fit(size: PrototypeSize): void;
  activate(): void;
  // Arm the injection for this run before its iframe exists.
  load(run: { gen: number; url: string; frame: string }): void;
  kill(gen: number): void;
  destroy(): void;
  // Read the root's canvas list again; the refresh comes back through listChanged.
  reread(root: string): void;
  sendView(view: PrototypeView): void;
  // The window's iframe area as PNG bytes, or null when it cannot be read.
  capture(markWidth: number): Promise<Uint8Array | null>;
  sendSnapshot(snapshot: PrototypeSnapshot): void;
}

export interface PrototypeController {
  play(kind: WindowKind, value: unknown): void;
  // Every `prototype:*` request of the prototype window; `read`'s reply is the view, every other reply is undefined.
  request(channel: string, kind: WindowKind, value: unknown): PrototypeView | null | undefined;
  listChanged(): void;
  // The run's document could not be read (the iframe's failed load or HTTP error), for run `gen`.
  readFailed(gen: number, detail: string): void;
  // ⌘W, the native close and the window going away by any other path.
  windowClosing(): void;
}

export function createPrototypeController(host: PrototypeHost, entries: () => readonly FolderEntry[]): PrototypeController {
  let state: PrototypeState = CLOSED;
  let sent: string | null = null;
  // Snapshot captures are async; views queue behind them so the image always arrives before its view.
  let queue: Promise<void> | null = null;
  // The last still sent to this window, re-sent when a kill stops the screen it stood for.
  let latest: Uint8Array | null = null;
  const resolve: Resolve = ref => resolveTarget(ref, entries());

  const sendView = () => {
    const view = transitions.prototypeView(state, resolve);
    if (view === null) { sent = null; return; }
    const text = JSON.stringify(view);
    if (text === sent) return;
    sent = text;
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
  const leavingReady = (previous: PrototypeState): Promise<Uint8Array | null> | null => {
    if (!previous.open || previous.phase !== "ready" || previous.run === null || !state.open) return null;
    if (state.gen === previous.gen && state.phase === "ready") return null;
    return host.capture(previous.run.markWidth).catch(() => null);
  };

  // The still goes out before the view of the state that followed, tagged with that view's gen. A kill also stops the
  // earlier iframes still on screen (one renderer process), so the latest still goes out again under the new gen.
  const publish = (still: Promise<Uint8Array | null> | null, killed: boolean) => {
    // Only when there is (or may soon be) a still: otherwise the view goes out at once.
    if (killed && still === null && state.open && (latest !== null || queue !== null)) {
      const gen = state.gen;
      later(() => { if (latest !== null && state.open && state.gen === gen) host.sendSnapshot({ gen, png: latest }); });
    }
    if (still !== null) {
      const gen = state.gen;
      later(async () => {
        const png = await still;
        if (png !== null && state.open && state.gen === gen) { latest = png; host.sendSnapshot({ gen, png }); }
      });
    }
    if (queue === null) sendView();
    else later(sendView);
  };

  const apply = (step: Step | null) => {
    if (step === null) return;
    const previous = state;
    state = step.state;
    if (!state.open) latest = null;
    const still = leavingReady(previous);
    for (const effect of step.effects) {
      switch (effect.kind) {
        case "create": host.create(effect.size); break;
        case "fit": host.fit(effect.size); break;
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
  };
}
