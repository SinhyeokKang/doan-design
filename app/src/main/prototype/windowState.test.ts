import { describe, expect, test } from "vitest";
import type { PrototypeFrame } from "./ipc";
import type { CanvasRow } from "../view";
import { canvasKeyString, resolveTarget, type PrototypeTarget, type Resolution } from "./targets";
import {
  CLOSED, back, choose, close, forward, framesReported, listChanged, play, prototypeView, readFailed, reload, report, setMode, setPanel, type PrototypeState, type Resolve, type Step,
} from "./windowState";

const A: PrototypeTarget = { root: "/r", canvas: { id: "proto" }, frame: "phone" };
const B: PrototypeTarget = { root: "/r", canvas: { id: "proto" }, frame: "tablet" };
const C: PrototypeTarget = { root: "/r", canvas: { id: "other" }, frame: "card" };
const A_WT: PrototypeTarget = { root: "/r-wt", canvas: { id: "proto" }, frame: "phone" };
const phone = { width: 390, height: 844 };
const tablet = { width: 820, height: 1180 };
const card = { width: 300, height: 200 };
const listed: PrototypeFrame[] = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", title: "Tablet", size: "820x1180", number: 2 }];

function world() {
  const rows = new Map<string, Resolution>();
  const set = (t: Pick<PrototypeTarget, "root" | "canvas">, r: Resolution) => rows.set(canvasKeyString(t), r);
  const present = (url: string, source = "s1", frames: { id: string; title?: string }[] = []): Resolution => ({ kind: "present", url, source, error: false, frames, label: url.slice(url.lastIndexOf("/") + 1, -".html".length), path: url.slice(url.lastIndexOf("/") + 1) });
  set(A, present("http://h/t/tok/k1/proto.html", "s1", [{ id: "phone", title: "Phone" }]));
  set(C, present("http://h/t/tok/k1/other.html"));
  set(A_WT, present("http://h/t/tok/k2/proto.html"));
  const resolve = (t: Pick<PrototypeTarget, "root" | "canvas">): Resolution => rows.get(canvasKeyString(t)) ?? { kind: "absent" };
  return { set, present, resolve };
}

function ok(step: Step | null): Step {
  expect(step).not.toBeNull();
  return step!;
}

function ready(state: PrototypeState, size = "390x844", frames = listed): Step {
  return report(state, { gen: state.gen, state: "ready", size: parse(size), frames });
}
function parse(size: string) {
  const [w, h] = size.split("x").map(Number);
  return { width: w!, height: h! };
}

describe("first play", () => {
  test("creates the window at the mark, loads a new run and records history", () => {
    const w = world();
    const step = ok(play(CLOSED, { target: A, size: phone }, w.resolve));
    expect(step.effects).toEqual([{ kind: "create", size: phone }, { kind: "load", gen: 1, url: "http://h/t/tok/k1/proto.html", frame: "phone" }]);
    expect(step.state.gen).toBe(1);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({
      gen: 1, frame: "phone", title: "Phone", phase: "loading", run: { url: "http://h/t/tok/k1/proto.html", markWidth: 390 }, frames: [], canGoBack: false, canGoForward: false,
    });
  });

  test("is refused when the canvas cannot be resolved", () => {
    const w = world();
    expect(play(CLOSED, { target: { ...A, canvas: { id: "gone" } }, size: phone }, w.resolve)).toBeNull();
  });

  test("a run's ready result shows it; a different document size refits once", () => {
    const w = world();
    const s1 = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    const same = ready(s1);
    expect(same.effects).toEqual([]);
    expect(prototypeView(same.state, w.resolve)).toMatchObject({ phase: "ready", frames: listed });
    const differs = ready(s1, "400x700");
    expect(differs.effects).toEqual([{ kind: "fit", size: { width: 400, height: 700 } }]);
    expect(prototypeView(differs.state, w.resolve)?.run?.markWidth).toBe(400);
  });
});

describe("plays on an open window", () => {
  function opened() {
    const w = world();
    const state = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    return { w, state };
  }

  test("the same target only activates and keeps state and size", () => {
    const { w, state } = opened();
    const step = ok(play(state, { target: A, size: tablet }, w.resolve));
    expect(step.effects).toEqual([{ kind: "activate" }]);
    expect(step.state).toBe(state);
  });

  test("another target fits to its mark, starts a new run, activates and is recorded", () => {
    const { w, state } = opened();
    const step = ok(play(state, { target: C, size: card }, w.resolve));
    expect(step.effects).toEqual([{ kind: "fit", size: card }, { kind: "activate" }, { kind: "load", gen: 2, url: "http://h/t/tok/k1/other.html", frame: "card" }]);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ gen: 2, phase: "loading", frame: "card", frames: [], canGoBack: true, canGoForward: false });
  });

  test("the same canvas and frame in another worktree is another target", () => {
    const { w, state } = opened();
    const step = ok(play(state, { target: A_WT, size: phone }, w.resolve));
    expect(step.effects.map(e => e.kind)).toEqual(["fit", "activate", "load"]);
  });

  test("leaving a run that never answered kills its renderer", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(ok(play(loading, { target: C, size: card }, w.resolve)).effects).toContainEqual({ kind: "kill", gen: 1 });
  });

  test("the drawer plays a listed frame of the same canvas at its listed size", () => {
    const { w, state } = opened();
    const step = ok(choose(state, "tablet", w.resolve));
    expect(step.effects).toEqual([{ kind: "fit", size: tablet }, { kind: "activate" }, { kind: "load", gen: 2, url: "http://h/t/tok/k1/proto.html", frame: "tablet" }]);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ frame: "tablet", title: "Tablet", frames: listed, canGoBack: true });
  });

  test("the drawer refuses a frame it does not list, and the current one only activates", () => {
    const { w, state } = opened();
    expect(choose(state, "ghost", w.resolve)).toBeNull();
    expect(ok(choose(state, "phone", w.resolve)).effects).toEqual([{ kind: "activate" }]);
  });
});

describe("source changes and loss", () => {
  function opened() {
    const w = world();
    const state = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    return { w, state };
  }

  test("a source change reloads without activating or resizing and keeps history", () => {
    const { w, state } = opened();
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s2"));
    const step = listChanged(state, w.resolve);
    expect(step.effects).toEqual([{ kind: "load", gen: 2, url: "http://h/t/tok/k1/proto.html", frame: "phone" }]);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ phase: "loading", gen: 2, frames: listed });
    expect(step.state.history).toBe(state.history);
  });

  test("an unchanged list does nothing", () => {
    const { w, state } = opened();
    expect(listChanged(state, w.resolve)).toEqual({ state, effects: [] });
  });

  test("a root still loading does nothing", () => {
    const { w, state } = opened();
    w.set(A, { kind: "unknown" });
    expect(listChanged(state, w.resolve)).toEqual({ state, effects: [] });
  });

  test("a gone canvas shows Frame unavailable without a run and with nothing to choose", () => {
    const { w, state } = opened();
    w.set(A, { kind: "absent" });
    const step = listChanged(state, w.resolve);
    expect(step.effects).toEqual([]);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ phase: "frame-unavailable", frames: [] });
  });

  test("the view names the canvas by its label, and keeps the last one while the canvas is gone", () => {
    const { w, state } = opened();
    expect(prototypeView(state, w.resolve)?.canvas).toBe("proto");
    w.set(A, w.present("http://h/t/tok/k1/renamed.html", "s2"));
    const moved = listChanged(state, w.resolve).state;
    expect(prototypeView(moved, w.resolve)?.canvas).toBe("renamed");
    w.set(A, { kind: "absent" });
    expect(prototypeView(listChanged(moved, w.resolve).state, w.resolve)?.canvas).toBe("renamed");
  });

  test("the same target coming back reloads without activating", () => {
    const { w, state } = opened();
    w.set(A, { kind: "absent" });
    const lost = listChanged(state, w.resolve).state;
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s1"));
    const back = listChanged(lost, w.resolve);
    expect(back.effects).toEqual([{ kind: "load", gen: 2, url: "http://h/t/tok/k1/proto.html", frame: "phone" }]);
  });

  test("losing a canvas mid-run kills the run that never answered", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    w.set(A, { kind: "absent" });
    expect(listChanged(loading, w.resolve).effects).toEqual([{ kind: "kill", gen: 1 }]);
  });

  test("a row doan ls cannot read is a read failure, not a run", () => {
    const { w, state } = opened();
    w.set(A, { kind: "present", url: "http://h/t/tok/k1/proto.html", source: "s9", error: true, frames: [], label: "proto", path: ".doan/canvases/proto.html" });
    const step = listChanged(state, w.resolve);
    expect(step.effects).toEqual([]);
    expect(prototypeView(step.state, w.resolve)?.phase).toBe("read-failed");
  });

  test("a missing or duplicated frame is Frame unavailable; a missing or invalid mark is Prototype unavailable", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    const cases = [["missing", "frame-unavailable"], ["duplicate", "frame-unavailable"], ["unmarked", "prototype-unavailable"], ["invalid", "prototype-unavailable"]] as const;
    for (const [state, phase] of cases) {
      const step = report(loading, { gen: 1, state, frames: listed.slice(1) });
      expect(step.effects).toEqual([]);
      expect(prototypeView(step.state, w.resolve)).toMatchObject({ phase, frames: listed.slice(1) });
    }
  });
});

describe("review round 1", () => {
  test("a kill marks the previous screen stopped until a new run is ready", () => {
    const w = world();
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    expect(prototypeView(shown, w.resolve)?.previousStopped).toBe(false);
    // A ready run left for another target is not killed; its iframe stays live under the new load.
    const loadingB = ok(choose(shown, "tablet", w.resolve)).state;
    expect(prototypeView(loadingB, w.resolve)?.previousStopped).toBe(false);
    // Leaving the loading run kills its renderer, which the ready screen beneath it shares.
    const toA = ok(back(loadingB, w.resolve));
    expect(toA.effects).toContainEqual({ kind: "kill", gen: 2 });
    expect(prototypeView(toA.state, w.resolve)?.previousStopped).toBe(true);
    const failed = report(toA.state, { gen: toA.state.gen, state: "timeout" }).state;
    expect(prototypeView(failed, w.resolve)?.previousStopped).toBe(true);
    const retried = reload(failed, failed.gen).state;
    expect(prototypeView(retried, w.resolve)?.previousStopped).toBe(true);
    expect(prototypeView(ready(retried).state, w.resolve)?.previousStopped).toBe(false);
  });

  test("a timeout and a lost canvas while loading stop the previous screen too; a new window starts unstopped", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(loading, w.resolve)?.previousStopped).toBe(false);
    expect(prototypeView(report(loading, { gen: 1, state: "timeout" }).state, w.resolve)?.previousStopped).toBe(true);
    w.set(A, { kind: "absent" });
    const lost = listChanged(loading, w.resolve).state;
    expect(prototypeView(lost, w.resolve)?.previousStopped).toBe(true);
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s1", [{ id: "phone", title: "Phone" }]));
    const closed = close(lost).state;
    expect(prototypeView(ok(play(closed, { target: A, size: phone }, w.resolve)).state, w.resolve)?.previousStopped).toBe(false);
  });

  test("Retry of a row doan ls could not read asks for that root's list again", () => {
    const w = world();
    w.set(A, { kind: "present", url: "http://h/t/tok/k1/proto.html", source: "s9", error: true, frames: [], label: "proto", path: ".doan/canvases/proto.html" });
    const failed = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(failed, w.resolve)?.phase).toBe("read-failed");
    expect(reload(failed, failed.gen)).toEqual({ state: failed, effects: [{ kind: "reread", root: "/r" }] });
    expect(reload(failed, failed.gen + 1)).toEqual({ state: failed, effects: [] });
    // Read again and readable: the list refresh starts the run.
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s9"));
    expect(listChanged(failed, w.resolve).effects).toContainEqual({ kind: "load", gen: failed.gen + 1, url: "http://h/t/tok/k1/proto.html", frame: "phone" });
  });

  test("a lost frame keeps the last title it was shown with", () => {
    const w = world();
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    // The frame's ID changes in the file: doan ls and the next run no longer list it.
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s2", [{ id: "phone-gone", title: "Phone" }]));
    const reloading = listChanged(shown, w.resolve).state;
    const missing = report(reloading, { gen: reloading.gen, state: "missing", frames: [] }).state;
    expect(prototypeView(missing, w.resolve)).toMatchObject({ phase: "frame-unavailable", title: "Phone" });
    w.set(A, { kind: "absent" });
    expect(prototypeView(listChanged(shown, w.resolve).state, w.resolve)).toMatchObject({ phase: "frame-unavailable", title: "Phone" });
    // A frame never shown with a title still falls back to its ID.
    const loadingTablet = ok(play(CLOSED, { target: { ...A, frame: "card" }, size: card }, world().resolve)).state;
    expect(prototypeView(loadingTablet, world().resolve)?.title).toBe("card");
  });
});

describe("an unreadable canvas with an ID", () => {
  test("is a read failure with Retry, not Frame unavailable, and plays again once readable", () => {
    const base = "http://h/t/tok/k1/";
    const readable: CanvasRow = { path: ".doan/canvases/proto.html", url: `${base}.doan/canvases/proto.html`, id: "proto", frames: [{ id: "phone", title: "Phone" }] };
    let rows: CanvasRow[] = [readable];
    const resolve: Resolve = (ref, lastPath) => resolveTarget(ref, [{ path: "/r", kind: "list", canvases: rows, servedRev: 0 }], lastPath);
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, resolve)).state).state;
    rows = [{ path: readable.path, url: readable.url, error: { code: "unreadable_canvas", message: "permission denied" } }];
    const failed = listChanged(shown, resolve).state;
    expect(prototypeView(failed, resolve)).toMatchObject({ phase: "read-failed", title: "Phone", canvas: "proto" });
    expect(reload(failed, failed.gen).effects).toEqual([{ kind: "reread", root: "/r" }]);
    rows = [readable];
    const again = listChanged(failed, resolve);
    expect(again.effects).toContainEqual({ kind: "load", gen: failed.gen + 1, url: readable.url, frame: "phone" });
  });
});

describe("the frame's title", () => {
  test("a frame still listed without a title shows its ID; the last title is kept only while it is not listed", () => {
    const w = world();
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    expect(prototypeView(shown, w.resolve)?.title).toBe("Phone");
    // The agent removed the title: the run's list and doan ls list the frame without one.
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s2", [{ id: "phone" }]));
    const reloading = listChanged(shown, w.resolve).state;
    expect(prototypeView(reloading, w.resolve)?.title).toBe("phone");
    const untitled = [{ id: "phone", size: "390x844", number: 1 }];
    const plain = report(reloading, { gen: reloading.gen, state: "ready", size: phone, frames: untitled }).state;
    expect(prototypeView(plain, w.resolve)?.title).toBe("phone");
    // Then the frame goes: no older title comes back.
    w.set(A, { kind: "absent" });
    expect(prototypeView(listChanged(plain, w.resolve).state, w.resolve)?.title).toBe("phone");
  });

  test("a later frame list without the title drops it too", () => {
    const w = world();
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s1", [{ id: "phone" }]));
    const step = framesReported(shown, shown.gen, [{ id: "phone", size: "390x844", number: 1 }]);
    expect(prototypeView(step.state, w.resolve)?.title).toBe("phone");
  });
});

describe("failures, retry and stale results", () => {
  function loading() {
    const w = world();
    return { w, state: ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state };
  }

  test("a timeout is an init failure that kills the run's renderer", () => {
    const { w, state } = loading();
    const step = report(state, { gen: 1, state: "timeout" });
    expect(step.effects).toEqual([{ kind: "kill", gen: 1 }]);
    expect(prototypeView(step.state, w.resolve)?.phase).toBe("init-failed");
  });

  test("a document the server could not give is a read failure with its detail", () => {
    const { w, state } = loading();
    const step = readFailed(state, 1, "404");
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ phase: "read-failed", detail: "404" });
  });

  test("Reload and Retry start a new run at the same size, without history", () => {
    const { w, state } = loading();
    const failed = report(state, { gen: 1, state: "timeout" }).state;
    const step = reload(failed, 1);
    expect(step.effects).toEqual([{ kind: "load", gen: 2, url: "http://h/t/tok/k1/proto.html", frame: "phone" }]);
    expect(step.state.history).toBe(failed.history);
  });

  test("Reload while loading starts over and kills the run it leaves", () => {
    const { state } = loading();
    expect(reload(state, 1).effects).toEqual([{ kind: "kill", gen: 1 }, { kind: "load", gen: 2, url: "http://h/t/tok/k1/proto.html", frame: "phone" }]);
  });

  test("Reload of an older run, or with the canvas gone, does nothing", () => {
    const { w, state } = loading();
    const second = reload(state, 1).state;
    expect(reload(second, 1)).toEqual({ state: second, effects: [] });
    w.set(A, { kind: "absent" });
    const lost = listChanged(second, w.resolve).state;
    expect(reload(lost, lost.gen)).toEqual({ state: lost, effects: [] });
  });

  test("late results of an older run are dropped", () => {
    const { state } = loading();
    const second = reload(state, 1).state;
    for (const late of [
      report(second, { gen: 1, state: "ready", size: phone, frames: listed }),
      report(second, { gen: 1, state: "timeout" }),
      readFailed(second, 1, "x"),
      framesReported(second, 1, listed),
    ]) expect(late).toEqual({ state: second, effects: [] });
  });

  test("a second result for the same run is dropped", () => {
    const { state } = loading();
    const shown = ready(state).state;
    expect(report(shown, { gen: 1, state: "timeout" })).toEqual({ state: shown, effects: [] });
    expect(readFailed(shown, 1, "x")).toEqual({ state: shown, effects: [] });
  });

  test("the list sent after load updates the drawer of the current run", () => {
    const { w, state } = loading();
    const shown = ready(state, "390x844", []).state;
    const step = framesReported(shown, 1, listed);
    expect(prototypeView(step.state, w.resolve)?.frames).toEqual(listed);
  });
});

describe("Back and Forward", () => {
  function three() {
    const w = world();
    let s = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    s = ready(ok(choose(s, "tablet", w.resolve)).state, "820x1180").state;
    s = ready(ok(play(s, { target: C, size: card }, w.resolve)).state, "300x200", [{ id: "card", size: "300x200", number: 1 }]).state;
    return { w, state: s };
  }

  test("Back plays the previous entry at its remembered size without recording", () => {
    const { w, state } = three();
    const step = ok(back(state, w.resolve));
    expect(step.effects).toEqual([{ kind: "fit", size: tablet }, { kind: "activate" }, { kind: "load", gen: 4, url: "http://h/t/tok/k1/proto.html", frame: "tablet" }]);
    expect(step.state.history.entries).toHaveLength(3);
    expect(prototypeView(step.state, w.resolve)).toMatchObject({ frame: "tablet", canGoBack: true, canGoForward: true });
  });

  test("Forward returns, and the end of the history disables it", () => {
    const { w, state } = three();
    const there = ok(back(state, w.resolve)).state;
    const again = ok(forward(there, w.resolve));
    expect(prototypeView(again.state, w.resolve)).toMatchObject({ frame: "card", canGoForward: false });
    expect(forward(again.state, w.resolve)).toBeNull();
  });

  test("skips an entry whose canvas is gone", () => {
    const { w, state } = three();
    const atA = ok(back(ok(back(state, w.resolve)).state, w.resolve)).state;
    w.set(C, { kind: "absent" });
    const view = prototypeView(atA, w.resolve);
    expect(view?.canGoForward).toBe(true);
    const step = ok(forward(atA, w.resolve));
    expect(prototypeView(step.state, w.resolve)?.frame).toBe("tablet");
    expect(prototypeView(step.state, w.resolve)?.canGoForward).toBe(false);
  });

  test("skips an entry the last report of its canvas no longer lists", () => {
    const { w, state } = three();
    const atTablet = ok(back(state, w.resolve));
    const shown = ready(atTablet.state, "820x1180", [listed[1]!]).state;
    expect(prototypeView(shown, w.resolve)?.canGoBack).toBe(false);
    expect(back(shown, w.resolve)).toBeNull();
  });

  test("an entry of a canvas with no report is played and judged by its run", () => {
    const w = world();
    const s = ok(play(CLOSED, { target: C, size: card }, w.resolve)).state;
    const timedOut = report(s, { gen: 1, state: "timeout" }).state;
    const atA = ready(ok(play(timedOut, { target: A, size: phone }, w.resolve)).state).state;
    expect(prototypeView(atA, w.resolve)?.canGoBack).toBe(true);
  });

  test("refused plays are not recorded", () => {
    const { w, state } = three();
    expect(choose(state, "ghost", w.resolve)).toBeNull();
    expect(play(state, { target: { ...A, canvas: { id: "gone" } }, size: phone }, w.resolve)).toBeNull();
    expect(state.history.entries).toHaveLength(3);
  });
});

describe("close", () => {
  test("discards everything; the next play creates a fresh window with a newer run", () => {
    const w = world();
    const s = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    const closed = close(s);
    expect(closed.effects).toEqual([{ kind: "destroy" }]);
    expect(prototypeView(closed.state, w.resolve)).toBeNull();
    expect(closed.state.history.entries).toEqual([]);
    const reopened = ok(play(closed.state, { target: A, size: phone }, w.resolve));
    expect(reopened.effects[0]).toEqual({ kind: "create", size: phone });
    expect(reopened.state.gen).toBe(2);
    expect(report(reopened.state, { gen: 1, state: "timeout" })).toEqual({ state: reopened.state, effects: [] });
  });

  test("closing while loading kills the run", () => {
    const w = world();
    const s = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(close(s).effects).toEqual([{ kind: "kill", gen: 1 }, { kind: "destroy" }]);
  });

  test("events on a closed window do nothing", () => {
    const w = world();
    for (const step of [listChanged(CLOSED, w.resolve), reload(CLOSED, 0), close(CLOSED), report(CLOSED, { gen: 0, state: "timeout" })]) {
      expect(step).toEqual({ state: CLOSED, effects: [] });
    }
    expect(back(CLOSED, w.resolve)).toBeNull();
    expect(choose(CLOSED, "phone", w.resolve)).toBeNull();
  });
});

describe("viewport mode", () => {
  function opened() {
    const w = world();
    const state = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    return { w, state };
  }

  test("starts at Fit, closed or open", () => {
    const w = world();
    expect(CLOSED.mode).toBe("fit");
    expect(prototypeView(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state, w.resolve)?.mode).toBe("fit");
  });

  test("a switch changes only the mode, with no effect", () => {
    const { w, state } = opened();
    const step = setMode(state, "responsive");
    expect(step.effects).toEqual([]);
    expect(step.state).toEqual({ ...state, mode: "responsive" });
    expect(prototypeView(step.state, w.resolve)).toEqual({ ...prototypeView(state, w.resolve), mode: "responsive" });
  });

  test("the mode already in use changes nothing, so no view goes out", () => {
    const { state } = opened();
    const step = setMode(state, "fit");
    expect(step.state).toBe(state);
    expect(step.effects).toEqual([]);
    const responsive = setMode(state, "responsive").state;
    expect(setMode(responsive, "responsive").state).toBe(responsive);
  });

  test("a switch while loading keeps the run's gen and kills nothing", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    const step = setMode(loading, "responsive");
    expect(step.effects).toEqual([]);
    expect(step.state.gen).toBe(loading.gen);
    expect(step.state.open && step.state.phase).toBe("loading");
    // The run's own result still lands on it.
    expect(prototypeView(ready(step.state).state, w.resolve)).toMatchObject({ gen: 1, phase: "ready", mode: "responsive" });
  });

  test("Reload, Retry, plays, the drawer, Back and Forward keep the mode", () => {
    const { w, state } = opened();
    const responsive = setMode(state, "responsive").state;
    const reloaded = reload(responsive, responsive.gen).state;
    expect(reloaded.mode).toBe("responsive");
    const failed = report(reloaded, { gen: reloaded.gen, state: "timeout" }).state;
    expect(reload(failed, failed.gen).state.mode).toBe("responsive");
    const chosen = ready(ok(choose(responsive, "tablet", w.resolve)).state, "820x1180").state;
    expect(chosen.mode).toBe("responsive");
    const backed = ok(back(chosen, w.resolve)).state;
    expect(backed.mode).toBe("responsive");
    expect(ok(forward(ready(backed).state, w.resolve)).state.mode).toBe("responsive");
    expect(ok(play(responsive, { target: C, size: card }, w.resolve)).state.mode).toBe("responsive");
  });

  test("a source change, a lost canvas, a read failure and a restore keep the mode", () => {
    const { w, state } = opened();
    const responsive = setMode(state, "responsive").state;
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s2"));
    const changed = listChanged(responsive, w.resolve).state;
    expect(changed.mode).toBe("responsive");
    expect(readFailed(changed, changed.gen, "HTTP 500").state.mode).toBe("responsive");
    w.set(A, { kind: "absent" });
    const lost = listChanged(changed, w.resolve).state;
    expect(lost.mode).toBe("responsive");
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s3"));
    expect(listChanged(lost, w.resolve).state.mode).toBe("responsive");
  });

  test("closing keeps the mode, and the next window opens in it", () => {
    const { w, state } = opened();
    const closed = close(setMode(state, "responsive").state).state;
    expect(closed).toEqual({ open: false, gen: state.gen, history: { entries: [], index: -1 }, mode: "responsive", panel: { open: false, width: null } });
    const reopened = ok(play(closed, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(reopened, w.resolve)?.mode).toBe("responsive");
  });
});

describe("the run's mark height", () => {
  test("a play carries the mark's width and height, and the ready size replaces both", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(loading, w.resolve)?.run).toEqual({ url: "http://h/t/tok/k1/proto.html", markWidth: 390, markHeight: 844 });
    expect(prototypeView(ready(loading, "400x700").state, w.resolve)?.run).toEqual({ url: "http://h/t/tok/k1/proto.html", markWidth: 400, markHeight: 700 });
  });

  test("a reload keeps the last ready size; the drawer uses the chosen frame's mark", () => {
    const w = world();
    const shown = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state, "400x700").state;
    expect(prototypeView(reload(shown, shown.gen).state, w.resolve)?.run).toMatchObject({ markWidth: 400, markHeight: 700 });
    expect(prototypeView(ok(choose(shown, "tablet", w.resolve)).state, w.resolve)?.run).toMatchObject({ markWidth: 820, markHeight: 1180 });
  });

  test("a run started with no known size has a zero mark until it is ready", () => {
    const w = world();
    w.set(A, { kind: "present", url: "http://h/t/tok/k1/proto.html", source: "s9", error: true, frames: [], label: "proto", path: ".doan/canvases/proto.html" });
    const failed = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(failed, w.resolve)?.run).toBeNull();
    w.set(A, w.present("http://h/t/tok/k1/proto.html", "s9"));
    const restored = listChanged(failed, w.resolve).state;
    expect(prototypeView(restored, w.resolve)?.run).toEqual({ url: "http://h/t/tok/k1/proto.html", markWidth: 0, markHeight: 0 });
    expect(prototypeView(ready(restored).state, w.resolve)?.run).toMatchObject({ markWidth: 390, markHeight: 844 });
  });
});

// The conversation panel's open state and width live in main memory for as long as the app runs, never on disk.
describe("the conversation panel", () => {
  function opened() {
    const w = world();
    const state = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    return { w, state };
  }

  test("starts closed with no width, and the view says so with the target canvas's ID", () => {
    const { w, state } = opened();
    expect(CLOSED.panel).toEqual({ open: false, width: null });
    expect(prototypeView(state, w.resolve)).toMatchObject({ canvasId: "proto", panel: { open: false, width: null } });
  });

  test("an ID-less canvas has no canvas ID in the view", () => {
    const w = world();
    const loose: PrototypeTarget = { root: "/r", canvas: { path: "loose.html" }, frame: "phone" };
    w.set(loose, w.present("http://h/t/tok/k1/loose.html"));
    const view = prototypeView(ok(play(CLOSED, { target: loose, size: phone }, w.resolve)).state, w.resolve);
    expect(view).not.toHaveProperty("canvasId");
    expect(view).toMatchObject({ root: "/r", path: "loose.html" });
  });

  test("opening, resizing and closing change only the panel state, with no window effect", () => {
    const { w, state } = opened();
    const open = setPanel(state, { open: true, width: 280 });
    expect(open.effects).toEqual([]);
    expect(open.state).toEqual({ ...state, panel: { open: true, width: 280 } });
    const wider = setPanel(open.state, { open: true, width: 360 });
    expect(wider.effects).toEqual([]);
    const shut = setPanel(wider.state, { open: false });
    expect(shut.effects).toEqual([]);
    expect(shut.state.panel).toEqual({ open: false, width: 360 });
    expect(prototypeView(shut.state, w.resolve)?.panel).toEqual({ open: false, width: 360 });
    // The run is untouched: same gen, phase and frame.
    expect(shut.state).toEqual({ ...state, panel: { open: false, width: 360 } });
  });

  test("a request that changes nothing leaves the state as it is, so no view goes out", () => {
    const { state } = opened();
    const open = setPanel(state, { open: true, width: 300 }).state;
    expect(setPanel(open, { open: true, width: 300 }).state).toBe(open);
    expect(setPanel(open, { open: true }).state).toBe(open);
  });

  test("closing the window keeps the panel state, and the next window opens with it", () => {
    const { w, state } = opened();
    const open = setPanel(state, { open: true, width: 320 }).state;
    const closed = close(open);
    expect(closed.effects).toEqual([{ kind: "destroy" }]);
    expect(closed.state.panel).toEqual({ open: true, width: 320 });
    const reopened = ok(play(closed.state, { target: A, size: phone }, w.resolve)).state;
    expect(prototypeView(reopened, w.resolve)?.panel).toEqual({ open: true, width: 320 });
  });

  test("plays, the drawer, Back and Forward, reloads and a lost canvas keep the panel", () => {
    const { w, state } = opened();
    const open = setPanel(state, { open: true, width: 300 }).state;
    const chosen = ready(ok(choose(open, "tablet", w.resolve)).state, "820x1180").state;
    expect(chosen.panel).toEqual({ open: true, width: 300 });
    expect(ok(back(chosen, w.resolve)).state.panel).toEqual({ open: true, width: 300 });
    expect(reload(open, open.gen).state.panel).toEqual({ open: true, width: 300 });
    expect(ok(play(open, { target: C, size: card }, w.resolve)).state.panel).toEqual({ open: true, width: 300 });
    w.set(A, { kind: "absent" });
    expect(listChanged(open, w.resolve).state.panel).toEqual({ open: true, width: 300 });
  });

  test("the panel works before the first view too, and on a closed window it does nothing", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    expect(setPanel(loading, { open: true, width: 280 }).state.panel).toEqual({ open: true, width: 280 });
    expect(setPanel(CLOSED, { open: true, width: 280 })).toEqual({ state: CLOSED, effects: [] });
  });
});

// The conversation panel blocks its composer while the canvas row is gone or shared, and says which; a lost frame or a
// failed load keeps it usable, so the person can tell the agent the prototype does not open.
describe("the target canvas row in the view", () => {
  test("present, being read, gone or shared by two rows", () => {
    const w = world();
    const state = ready(ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state).state;
    expect(prototypeView(state, w.resolve)?.canvasRow).toBe("present");
    w.set(A, { kind: "unknown" });
    expect(prototypeView(state, w.resolve)?.canvasRow).toBe("loading");
    w.set(A, { kind: "absent" });
    expect(prototypeView(state, w.resolve)?.canvasRow).toBe("gone");
    w.set(A, { kind: "absent", duplicate: true });
    expect(prototypeView(state, w.resolve)?.canvasRow).toBe("duplicate");
  });

  test("a frame the run lost leaves the row present", () => {
    const w = world();
    const loading = ok(play(CLOSED, { target: A, size: phone }, w.resolve)).state;
    const lost = report(loading, { gen: loading.gen, state: "missing", frames: [] }).state;
    expect(prototypeView(lost, w.resolve)).toMatchObject({ phase: "frame-unavailable", canvasRow: "present" });
  });
});
