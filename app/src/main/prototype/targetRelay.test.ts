import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { createPrototypeController, type PrototypeHost } from "./controller";
import { createPrototypeDrawing, type PrototypeTargetRef } from "./drawing";
import type { Rect } from "./fit";
import { PROTOTYPE_CHANNELS } from "./ipc";
import { createTargetRelay } from "./targetRelay";

// The main window re-reports the drawing project conversation only when main tells it of a target, and main forgets the
// report on every change of the playing canvas. So every such change, also back to the same canvas and also while a
// view waits behind a still capture, reaches the main window as a target it has not seen. Wired as index.ts wires it:
// the real controller, its host's view and canvas-change calls, the drawing record and this relay.
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
  const drawings: (string | null)[] = [];
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
  const drawing = createPrototypeDrawing({ playing: () => controller.playing(), generation: () => controller.canvasGeneration(), conversations: () => [{ conversationId: "p", root: "/r" }] });
  relay = createTargetRelay({
    playing: () => controller.playing(), generation: () => controller.canvasGeneration(), open: () => controller.playing() !== null,
    drawing: () => drawing.current(), promoted: () => null,
    sendTarget: target => targets.push(target), sendDrawing: id => drawings.push(id), sendPromoted: () => {},
  });
  // The main window: a report for the last target it was told of, as App does.
  const report = () => {
    const target = targets.at(-1);
    if (target && drawing.set("main", { ...target, conversationId: "p" })) relay?.drawing();
  };
  return { controller, drawing, targets, drawings, report, hold: () => { hold = true; }, release: () => release?.() };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("the target relay", () => {
  test("A → B → A while a still capture holds the views still tells the main window of the new A", async () => {
    const t = wired();
    t.controller.play("main", playA);
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames });
    await flush();
    t.report();
    expect(t.drawing.current()).toBe("p");
    const told = t.targets.length;
    t.hold();
    t.controller.play("main", playB);
    t.controller.play("main", playA);
    t.release();
    await flush(); await flush();
    // The drawing record was forgotten for the new play of A, and the main window was told of a target to report on.
    expect(t.drawings.at(-1)).toBeNull();
    expect(t.targets.length).toBeGreaterThan(told);
    expect(t.targets.at(-1)).toMatchObject({ root: "/r", canvas: { id: "proto", path: proto.path } });
    t.report();
    expect(t.drawing.current()).toBe("p");
    expect(t.drawings.at(-1)).toBe("p");
  });

  test("a report made for an earlier play of the same canvas is refused", async () => {
    const t = wired();
    t.controller.play("main", playA);
    await flush();
    const earlier = t.targets.at(-1);
    t.controller.play("main", playB);
    t.controller.play("main", playA);
    await flush();
    expect(earlier).not.toBeNull();
    expect(t.drawing.set("main", { ...earlier!, conversationId: "p" })).toBe(false);
    t.report();
    expect(t.drawing.current()).toBe("p");
  });

  test("the window's close tells the main window there is no target", async () => {
    const t = wired();
    t.controller.play("main", playA);
    await flush();
    t.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    await flush();
    expect(t.targets.at(-1)).toBeNull();
  });
});
