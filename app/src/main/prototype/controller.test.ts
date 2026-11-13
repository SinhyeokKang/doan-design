import { describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { createPrototypeController, type PrototypeHost } from "./controller";
import { PROTOTYPE_CHANNELS, type PrototypeView } from "./ipc";

const base = "http://127.0.0.1:5123/t/tok/";
const proto: CanvasRow = { path: ".doan/canvases/proto.html", url: `${base}k1/.doan/canvases/proto.html`, id: "proto" };
const play = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };
const frames = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", size: "820x1180", number: 2 }];

function setup() {
  let entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto], servedRev: 0 }];
  const calls: unknown[] = [];
  const views: PrototypeView[] = [];
  let capture: (markWidth: number) => Promise<Uint8Array | null> = async () => new Uint8Array([1, 2]);
  const host: PrototypeHost = {
    create: size => calls.push(["create", size]),
    fit: size => calls.push(["fit", size]),
    activate: () => calls.push(["activate"]),
    load: run => calls.push(["load", run]),
    kill: gen => calls.push(["kill", gen]),
    destroy: () => calls.push(["destroy"]),
    sendView: view => { calls.push(["view", view.gen, view.phase]); views.push(view); },
    capture: markWidth => { calls.push(["capture", markWidth]); return capture(markWidth); },
    sendSnapshot: snapshot => calls.push(["snapshot", snapshot.gen, Array.from(snapshot.png)]),
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

  test("choosing another frame fits, activates and loads a new run", () => {
    const t = opened();
    t.controller.request(PROTOTYPE_CHANNELS.choose, "prototype", { frame: "tablet" });
    expect(t.calls).toEqual([["fit", { width: 820, height: 1180 }], ["activate"], ["load", { gen: 2, url: proto.url, frame: "tablet" }], ["view", 2, "loading"]]);
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
    expect(t.calls).toEqual([]);
    await vi.waitFor(() => expect(t.calls).toEqual([["capture", 390], ["snapshot", 1, [1, 2]], ["view", 1, "frame-unavailable"]]));
  });

  test("a later view waits behind a capture, and a failed capture still sends the view", async () => {
    const t = opened();
    let release: (png: Uint8Array | null) => void = () => {};
    t.setCapture(() => new Promise(done => { release = done; }));
    t.setEntries([{ path: "/r", kind: "list", canvases: [], servedRev: 0 }]);
    t.controller.listChanged();
    t.setEntries([{ path: "/r", kind: "list", canvases: [{ ...proto, rev: 2 }], servedRev: 0 }]);
    t.controller.listChanged();
    await vi.waitFor(() => expect(t.calls).toEqual([["load", { gen: 2, url: proto.url, frame: "phone" }], ["capture", 390]]));
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
});
