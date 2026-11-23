import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { createPrototypeController, type PrototypeHost } from "./controller";
import type { Rect } from "./fit";
import { PROTOTYPE_CHANNELS } from "./ipc";
import { createTargetRelay, type PrototypeTargetRef } from "./targetRelay";
import type { PrototypePlaying } from "./ipc";

// Every change of the playing canvas, also back to the same canvas and also while a view waits behind a still capture,
// reaches the main window as a target it has not seen. Wired as index.ts wires it: the real controller, its host's view
// and canvas-change calls and this relay.
const base = "http://127.0.0.1:5123/t/tok/";
const proto: CanvasRow = { path: ".doan/canvases/proto.html", url: `${base}k1/.doan/canvases/proto.html`, id: "proto" };
const other: CanvasRow = { path: ".doan/canvases/other.html", url: `${base}k1/.doan/canvases/other.html`, id: "other" };
const entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto, other], servedRev: 0 }];
const playA = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };
const playB = { root: "/r", path: other.path, frame: "card", mark: "300x200" };
const frames = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }];
const BOX: Rect = { x: 0, y: 0, width: 390, height: 844 };

function wired() {
  const targets: (PrototypeTargetRef | null)[] = [];
  const playings: (PrototypePlaying | null)[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  let relay: ReturnType<typeof createTargetRelay> | null = null;
  const host: PrototypeHost = {
    create: () => null, fit: () => null, openPanel: () => 280, closePanel: () => {}, contentWidth: () => 1000,
    activate: () => {}, load: () => {}, kill: () => {}, destroy: () => {}, reread: () => {},
    sendView: () => { relay?.changed(); },
    canvasChanged: () => { relay?.changed(); },
    capture: () => hold ? new Promise(resolve => { release = () => resolve({ png: new Uint8Array([1]), box: BOX }); }) : Promise.resolve({ png: new Uint8Array([1]), box: BOX }),
    sendSnapshot: () => {},
  };
  const controller = createPrototypeController(host, () => entries);
  relay = createTargetRelay({
    playing: () => controller.playing(), frame: () => controller.playingFrame(), generation: () => controller.canvasGeneration(),
    sendTarget: target => targets.push(target), sendPlaying: playing => playings.push(playing),
  });
  return { controller, relay: relay!, targets, playings, hold: () => { hold = true; }, release: () => release?.() };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("the target relay", () => {
  test("A → B → A while a still capture holds the views still tells the main window of the new A", async () => {
    const t = wired();
    t.controller.play("main", playA);
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames, gotos: [] });
    await flush();
    const first = t.targets.at(-1);
    const told = t.targets.length;
    t.hold();
    t.controller.play("main", playB);
    t.controller.play("main", playA);
    t.release();
    await flush(); await flush();
    expect(t.targets.length).toBeGreaterThan(told);
    expect(t.targets.at(-1)).toMatchObject({ root: "/r", canvas: { id: "proto", path: proto.path } });
    expect(t.targets.at(-1)!.generation).not.toBe(first!.generation);
    expect(t.relay.target()).toEqual(t.targets.at(-1));
  });

  test("the window's close tells the main window there is no target", async () => {
    const t = wired();
    t.controller.play("main", playA);
    await flush();
    t.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    await flush();
    expect(t.targets.at(-1)).toBeNull();
  });

  // The toolbar's drawer marks the frame the prototype window plays: main tells the main window of every change of the
  // frame, also between frames of one canvas, which the target above does not name.
  test("tells the main window of the playing frame on start, a link move, Back and close, once per change", async () => {
    const t = wired();
    const tablet = { id: "tablet", size: "820x1180", number: 2 };
    const two = [...frames, tablet];
    t.controller.play("main", playA);
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames: two, gotos: [] });
    await flush();
    const at = (frame: string) => ({ root: "/r", canvas: { id: "proto", path: proto.path }, frame });
    expect(t.playings).toEqual([at("phone")]);
    expect(t.relay.playingTarget()).toEqual(at("phone"));
    t.controller.request(PROTOTYPE_CHANNELS.goto, "prototype", { gen: 1, goto: "tablet" });
    await flush();
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 2, state: "ready", size: "820x1180", frames: two, gotos: [] });
    await flush();
    t.controller.request(PROTOTYPE_CHANNELS.back, "prototype", undefined);
    await flush();
    t.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    await flush();
    expect(t.playings).toEqual([at("phone"), at("tablet"), at("phone"), null]);
    expect(t.relay.playingTarget()).toBeNull();
  });
});
