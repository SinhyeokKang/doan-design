// The one prototype window's state as main holds it: requests, list refreshes and run results go through the pure
// transitions, their effects go to the window host in order, and the window gets the view whenever it changes.
// Electron-free; prototypeWindow.ts is the host.
import type { FolderEntry } from "../view";
import type { WindowKind } from "../senderAllowed";
import { PROTOTYPE_CHANNELS, type PrototypePhase, type PrototypeSnapshot, type PrototypeView } from "./ipc";
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
  sendView(view: PrototypeView): void;
  // The window's iframe area as PNG bytes, or null when it cannot be read.
  capture(markWidth: number): Promise<Uint8Array | null>;
  sendSnapshot(snapshot: PrototypeSnapshot): void;
}

const FAILED: ReadonlySet<PrototypePhase> = new Set(["read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"]);

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

  const publish = (previous: PrototypeState) => {
    const ready = previous.open && previous.phase === "ready" ? previous.run : null;
    if (ready !== null && state.open && FAILED.has(state.phase)) {
      const gen = state.gen;
      later(async () => {
        const png = await host.capture(ready.markWidth).catch(() => null);
        if (png !== null && state.open && state.gen === gen) host.sendSnapshot({ gen, png });
      });
    }
    if (queue === null) sendView();
    else later(sendView);
  };

  const apply = (step: Step | null) => {
    if (step === null) return;
    const previous = state;
    state = step.state;
    for (const effect of step.effects) {
      switch (effect.kind) {
        case "create": host.create(effect.size); break;
        case "fit": host.fit(effect.size); break;
        case "activate": host.activate(); break;
        case "load": host.load({ gen: effect.gen, url: effect.url, frame: effect.frame }); break;
        case "kill": host.kill(effect.gen); break;
        case "destroy": host.destroy(); break;
      }
    }
    publish(previous);
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
