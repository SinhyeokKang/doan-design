import { describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { createPrototypeController, type PrototypeHost } from "./controller";
import type { Rect } from "./fit";
import { PROTOTYPE_CHANNELS, type PrototypeMode, type PrototypeView } from "./ipc";
import type { PrototypeSize } from "./mark";

const base = "http://127.0.0.1:5123/t/tok/";
const proto: CanvasRow = { path: ".doan/canvases/proto.html", url: `${base}k1/.doan/canvases/proto.html`, id: "proto" };
const play = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };
const phone = { width: 390, height: 844 };
const BOX: Rect = { x: 0, y: 28, width: 344, height: 744 };
const frames = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", size: "820x1180", number: 2 }];

function setup() {
  let entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto], servedRev: 0 }];
  const calls: unknown[] = [];
  const views: PrototypeView[] = [];
  type Still = { png: Uint8Array; box: Rect } | null;
  let capture: (mark: PrototypeSize, mode: PrototypeMode) => Promise<Still> = async () => ({ png: new Uint8Array([1, 2]), box: BOX });
  const host: PrototypeHost = {
    create: size => calls.push(["create", size]),
    fit: size => calls.push(["fit", size]),
    activate: () => calls.push(["activate"]),
    load: run => calls.push(["load", run]),
    kill: gen => calls.push(["kill", gen]),
    destroy: () => calls.push(["destroy"]),
    reread: root => calls.push(["reread", root]),
    sendView: view => { calls.push(["view", view.gen, view.phase]); views.push(view); },
    capture: (mark, mode) => { calls.push(["capture", mark, mode]); return capture(mark, mode); },
    sendSnapshot: snapshot => calls.push(["snapshot", snapshot.gen, Array.from(snapshot.png), snapshot.box]),
  };
  const controller = createPrototypeController(host, () => entries);
  return {
    controller, calls, views,
    setEntries: (next: FolderEntry[]) => { entries = next; },
    setCapture: (next: typeof capture) => { capture = next; },
  };
}

function opened() {
  const t = setup();
  t.controller.play("main", play);
  t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames });
  t.calls.length = 0;
  return t;
}

describe("prototype controller", () => {
  test("a play from the main window creates the window, arms the run and sends its view", () => {
    const t = setup();
    t.controller.play("main", play);
    expect(t.calls).toEqual([["create", { width: 390, height: 844 }], ["load", { gen: 1, url: proto.url, frame: "phone" }], ["view", 1, "loading"]]);
    expect(t.views[0]).toMatchObject({ frame: "phone", canvas: "proto", run: { url: proto.url, markWidth: 390 } });
  });

  test("a play from any other sender or with a forged payload does nothing", () => {
    const t = setup();
    t.controller.play("prototype", play);
    t.controller.play("main", { ...play, root: "/elsewhere" });
    t.controller.play("main", { ...play, url: "http://evil/" });
    expect(t.calls).toEqual([]);
  });

  test("window requests need the prototype role; read answers the view", () => {
    const t = opened();
    expect(t.controller.request(PROTOTYPE_CHANNELS.read, "main", undefined)).toBeNull();
    expect(t.controller.request(PROTOTYPE_CHANNELS.read, "prototype", { x: 1 })).toBeNull();
    expect(t.controller.request(PROTOTYPE_CHANNELS.read, "prototype", undefined)).toMatchObject({ phase: "ready", frames });
    t.controller.request(PROTOTYPE_CHANNELS.close, "main", undefined);
    t.controller.request(PROTOTYPE_CHANNELS.choose, "main", { frame: "tablet" });
    expect(t.calls).toEqual([]);
  });

  test("an unchanged view is not sent again", () => {
    const t = opened();
    t.controller.listChanged();
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames });
    expect(t.calls).toEqual([]);
  });

  test("choosing another frame stills the ready screen before the refit, then fits, activates and loads a new run", async () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    const effects = [["capture", phone, "fit"], ["fit", { width: 820, height: 1180 }], ["activate"], ["load", { gen: 2, url: proto.url, frame: "tablet" }]];
    expect(t.calls).toEqual(effects);
    await vi.waitFor(() => expect(t.calls).toEqual([...effects, ["snapshot", 2, [1, 2], BOX], ["view", 2, "loading"]]));
  });

  test("a reload, Retry or source change of a ready run stills it under the new run's gen", async () => {
    for (const leave of [
      (t: ReturnType<typeof opened>) => t.controller.request(PROTOTYPE_CHANNELS.reload, "prototype", { gen: 1 }),
      (t: ReturnType<typeof opened>) => { t.setEntries([{ path: "/r", kind: "list", canvases: [{ ...proto, rev: 2 }], servedRev: 0 }]); t.controller.listChanged(); },
    ]) {
      const t = opened();
      leave(t);
      expect(t.calls).toEqual([["capture", phone, "fit"], ["load", { gen: 2, url: proto.url, frame: "phone" }]]);
      await vi.waitFor(() => expect(t.calls.slice(2)).toEqual([["snapshot", 2, [1, 2], BOX], ["view", 2, "loading"]]));
    }
  });

  test("staying ready or closing takes no still", async () => {
    const t = opened();
    t.controller.play("main", play);
    t.controller.request(PROTOTYPE_CHANNELS.frames, "prototype", { gen: 1, frames: frames.slice(0, 1) });
    t.controller.listChanged();
    t.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    await Promise.resolve();
    expect(t.calls.some(call => Array.isArray(call) && call[0] === "capture")).toBe(false);
  });

  test("a timeout kills the run's renderer", () => {
    const t = setup();
    t.controller.play("main", play);
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "timeout" });
    expect(t.calls).toEqual([["kill", 1], ["view", 1, "init-failed"]]);
  });

  test("a read failure applies only to the loading run's gen", () => {
    const t = setup();
    t.controller.play("main", play);
    t.calls.length = 0;
    t.controller.readFailed(2, "HTTP 404");
    expect(t.calls).toEqual([]);
    t.controller.readFailed(1, "HTTP 404");
    expect(t.views.at(-1)).toMatchObject({ phase: "read-failed", detail: "HTTP 404" });
  });

  test("a ready run that turns unavailable sends its snapshot before the view", async () => {
    const t = opened();
    t.setEntries([{ path: "/r", kind: "list", canvases: [], servedRev: 0 }]);
    t.controller.listChanged();
    expect(t.calls).toEqual([["capture", phone, "fit"]]);
    await vi.waitFor(() => expect(t.calls).toEqual([["capture", phone, "fit"], ["snapshot", 1, [1, 2], BOX], ["view", 1, "frame-unavailable"]]));
  });

  test("a later view waits behind a capture, and a failed capture still sends the view", async () => {
    const t = opened();
    let release: (still: { png: Uint8Array; box: Rect } | null) => void = () => {};
    t.setCapture(() => new Promise(done => { release = done; }));
    t.setEntries([{ path: "/r", kind: "list", canvases: [], servedRev: 0 }]);
    t.controller.listChanged();
    t.setEntries([{ path: "/r", kind: "list", canvases: [{ ...proto, rev: 2 }], servedRev: 0 }]);
    t.controller.listChanged();
    // Leaving frame-unavailable is not leaving a ready run, so the restore takes no second still.
    expect(t.calls).toEqual([["capture", phone, "fit"], ["load", { gen: 2, url: proto.url, frame: "phone" }]]);
    release(null);
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 2, "loading"]));
    expect(t.calls.some(call => Array.isArray(call) && call[0] === "snapshot")).toBe(false);
  });

  test("a run that was loading gets no snapshot", async () => {
    const t = setup();
    t.controller.play("main", play);
    t.setEntries([]);
    t.controller.listChanged();
    await Promise.resolve();
    expect(t.calls.some(call => Array.isArray(call) && call[0] === "capture")).toBe(false);
  });

  test("closing destroys the window once; a reopened window gets its view again", () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    t.controller.windowClosing();
    expect(t.calls).toEqual([["destroy"]]);
    t.calls.length = 0;
    t.controller.play("main", play);
    expect(t.calls).toEqual([["create", { width: 390, height: 844 }], ["load", { gen: 2, url: proto.url, frame: "phone" }], ["view", 2, "loading"]]);
  });

  test("a native close of a loading run kills it before the window goes", () => {
    const t = setup();
    t.controller.play("main", play);
    t.calls.length = 0;
    t.controller.windowClosing();
    expect(t.calls).toEqual([["kill", 1], ["destroy"]]);
  });

  test("a kill re-sends the latest still under the new view's gen, before that view", async () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 2, "loading"]));
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.back, "prototype", undefined);
    const effects = [["fit", { width: 390, height: 844 }], ["activate"], ["kill", 2], ["load", { gen: 3, url: proto.url, frame: "phone" }]];
    expect(t.calls).toEqual([...effects, ["snapshot", 3, [1, 2], BOX], ["view", 3, "loading"]]);
    expect(t.views.at(-1)?.previousStopped).toBe(true);
  });

  test("a kill with no still yet, or after the window closed, sends no snapshot", async () => {
    const t = setup();
    t.controller.play("main", play);
    t.controller.request(PROTOTYPE_CHANNELS.reload, "prototype", { gen: 1 });
    const u = opened();
    u.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    await vi.waitFor(() => expect(u.calls.at(-1)).toEqual(["view", 2, "loading"]));
    u.controller.request(PROTOTYPE_CHANNELS.close, "prototype", undefined);
    u.controller.play("main", play);
    u.controller.request(PROTOTYPE_CHANNELS.reload, "prototype", { gen: 3 });
    await vi.waitFor(() => expect(u.calls.at(-1)).toEqual(["view", 4, "loading"]));
    expect(t.calls.filter(call => Array.isArray(call) && call[0] === "snapshot")).toEqual([]);
    expect(u.calls.filter(call => Array.isArray(call) && call[0] === "snapshot")).toEqual([["snapshot", 2, [1, 2], BOX]]);
  });

  test("Retry of a row doan ls could not read asks the host to read the root again", () => {
    const t = setup();
    t.setEntries([{ path: "/r", kind: "list", canvases: [{ ...proto, error: { code: "read_failed", message: "boom" } }], servedRev: 0 }]);
    t.controller.play("main", play);
    expect(t.views.at(-1)?.phase).toBe("read-failed");
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.reload, "prototype", { gen: 1 });
    expect(t.calls).toEqual([["reread", "/r"]]);
  });

  test("a still that finishes after a kill stands for the stopped screen, under the kill's gen", async () => {
    const t = opened();
    let release: (still: { png: Uint8Array; box: Rect } | null) => void = () => {};
    t.setCapture(() => new Promise(done => { release = done; }));
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    // Back kills the tablet load before Phone's still came back.
    t.controller.request(PROTOTYPE_CHANNELS.back, "prototype", undefined);
    release({ png: new Uint8Array([7]), box: { x: 1, y: 2, width: 3, height: 4 } });
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 3, "loading"]));
    expect(t.calls.filter(call => Array.isArray(call) && call[0] === "snapshot")).toEqual([["snapshot", 3, [7], { x: 1, y: 2, width: 3, height: 4 }]]);
  });

  test("a still that could not be read clears the last one, so a kill never re-sends another frame's screen", async () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 2, "loading"]));
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 2, state: "ready", size: "820x1180", frames });
    t.setCapture(async () => null);
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "phone" });
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 3, "loading"]));
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.back, "prototype", undefined);
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 4, "loading"]));
    expect(t.calls.filter(call => Array.isArray(call) && call[0] === "snapshot")).toEqual([]);
  });
  test("a viewport switch sends only the new view; the mode in use, another role or a bad payload does nothing", () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "responsive" });
    expect(t.calls).toEqual([["view", 1, "ready"]]);
    expect(t.views.at(-1)).toMatchObject({ gen: 1, phase: "ready", mode: "responsive" });
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "responsive" });
    t.controller.request(PROTOTYPE_CHANNELS.mode, "main", { mode: "fit" });
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "zoom" });
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", undefined);
    expect(t.calls).toEqual([]);
    expect(t.controller.request(PROTOTYPE_CHANNELS.read, "prototype", undefined)).toMatchObject({ mode: "responsive" });
  });

  test("a switch while loading keeps the run: no load, kill or new gen, and its result still lands", () => {
    const t = setup();
    t.controller.play("main", play);
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "responsive" });
    expect(t.calls).toEqual([["view", 1, "loading"]]);
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "390x844", frames });
    expect(t.calls.at(-1)).toEqual(["view", 1, "ready"]);
    expect(t.views.at(-1)?.mode).toBe("responsive");
  });

  test("the still is taken with the leaving run's mark and the mode it was shown in", async () => {
    const t = setup();
    t.controller.play("main", play);
    t.controller.request(PROTOTYPE_CHANNELS.result, "prototype", { gen: 1, state: "ready", size: "400x700", frames });
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "responsive" });
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.reload, "prototype", { gen: 1 });
    expect(t.calls[0]).toEqual(["capture", { width: 400, height: 700 }, "responsive"]);
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 2, "loading"]));
  });

  test("a re-sent still keeps the box it was taken with, after a mode switch too", async () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 2, "loading"]));
    t.setCapture(async () => ({ png: new Uint8Array([9]), box: { x: 0, y: 0, width: 1, height: 1 } }));
    t.controller.request(PROTOTYPE_CHANNELS.mode, "prototype", { mode: "responsive" });
    t.calls.length = 0;
    t.controller.request(PROTOTYPE_CHANNELS.back, "prototype", undefined);
    await vi.waitFor(() => expect(t.calls.at(-1)).toEqual(["view", 3, "loading"]));
    expect(t.calls.filter(call => Array.isArray(call) && call[0] === "snapshot")).toEqual([["snapshot", 3, [1, 2], BOX]]);
  });
});

