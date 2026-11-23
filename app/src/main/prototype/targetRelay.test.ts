import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { createPrototypeController, type PrototypeHost } from "./controller";
import type { Rect } from "./fit";
import { PROTOTYPE_CHANNELS } from "./ipc";
import { createTargetRelay } from "./targetRelay";
import type { PrototypePlaying } from "./ipc";

// The frame the prototype window plays, as main tells the main window. Wired as index.ts wires it: the real controller,
// its host's view and canvas-change calls and this relay.
const base = "http://127.0.0.1:5123/t/tok/";
const proto: CanvasRow = { path: ".doan/canvases/proto.html", url: `${base}k1/.doan/canvases/proto.html`, id: "proto" };
const other: CanvasRow = { path: ".doan/canvases/other.html", url: `${base}k1/.doan/canvases/other.html`, id: "other" };
const entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto, other], servedRev: 0 }];
const playA = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };
const frames = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }];
const BOX: Rect = { x: 0, y: 0, width: 390, height: 844 };

function wired() {
  const playings: (PrototypePlaying | null)[] = [];
  let relay: ReturnType<typeof createTargetRelay> | null = null;
  const host: PrototypeHost = {
    create: () => null, fit: () => null, openPanel: () => 280, closePanel: () => {}, contentWidth: () => 1000,
    activate: () => {}, load: () => {}, kill: () => {}, destroy: () => {}, reread: () => {},
    sendView: () => { relay?.changed(); },
    canvasChanged: () => { relay?.changed(); },
    capture: () => Promise.resolve({ png: new Uint8Array([1]), box: BOX }),
    sendSnapshot: () => {},
  };
  const controller = createPrototypeController(host, () => entries);
  relay = createTargetRelay({
    playing: () => controller.playing(), frame: () => controller.playingFrame(),
    sendPlaying: playing => playings.push(playing),
  });
  return { controller, relay: relay!, playings };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("the target relay", () => {
  // The toolbar's drawer marks the frame the prototype window plays: main tells the main window of every change of the
  // frame, also between frames of one canvas.
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
