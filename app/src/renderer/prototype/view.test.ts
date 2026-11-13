import { describe, expect, test } from "vitest";
import type { PrototypePhase } from "../../main/prototype/ipc";
import { covered, drawerLabel, drawerRows, liveText, LOADING_LABEL, stateScene, TIMEOUT_DETAIL, windowTitle, type ShownView } from "./view";

const frames = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", size: "390x844", number: 3 }];
const view = (over: Partial<ShownView> = {}): ShownView => ({
  gen: 2, frame: "checkout", title: "Checkout", phase: "ready", run: { url: "http://127.0.0.1/a.html", markWidth: 390 }, frames, canGoBack: false, canGoForward: false, ...over,
});

describe("windowTitle", () => {
  test("is the frame name and Prototype, so the window list tells it from the main window", () => {
    expect(windowTitle(view())).toBe("Checkout — Prototype");
    expect(windowTitle(null)).toBe("Prototype");
  });
});

describe("stateScene", () => {
  test("names each cause with its own title; failures retry, lost targets only close", () => {
    expect(stateScene(view({ phase: "read-failed", detail: "EACCES" }))).toEqual({ icon: "read", heading: "Couldn’t open this prototype", body: "Doan couldn’t read the canvas file for this frame.", failure: true, detail: "EACCES" });
    expect(stateScene(view({ phase: "init-failed" }))).toEqual({ icon: "init", heading: "Couldn’t start this prototype", body: "The frame was read, but Doan couldn’t set it up in this window.", failure: true, detail: TIMEOUT_DETAIL });
    expect(stateScene(view({ phase: "frame-unavailable" }))).toEqual({ icon: "frame", heading: "Frame unavailable", body: "This frame is no longer available. It reappears here when the frame is restored; to play another, choose one from the frame menu above.", failure: false });
    expect(stateScene(view({ phase: "prototype-unavailable" }))).toEqual({ icon: "support", heading: "Prototype unavailable", body: "This frame is no longer marked for prototyping. It reappears here when the mark is restored; to play another, choose one from the frame menu above.", failure: false });
  });

  test("drops the frame menu clause when there is no frame to choose", () => {
    expect(stateScene(view({ phase: "frame-unavailable", frames: [] }))?.body).toBe("This frame is no longer available. It reappears here when the frame is restored.");
    expect(stateScene(view({ phase: "prototype-unavailable", frames: [] }))?.body).toBe("This frame is no longer marked for prototyping. It reappears here when the mark is restored.");
  });

  test("a read failure without main's detail has no Details to open", () => {
    expect(stateScene(view({ phase: "read-failed" }))).not.toHaveProperty("detail");
    expect(stateScene(view({ phase: "init-failed", detail: "renderer gone" }))?.detail).toBe("renderer gone");
  });

  test("has no scene while loading or ready", () => {
    expect(stateScene(view({ phase: "loading" }))).toBeNull();
    expect(stateScene(view())).toBeNull();
  });
});

describe("liveText", () => {
  test("reads the loading line once it shows, a scene's title and body, and nothing for a running prototype", () => {
    expect(liveText(view({ phase: "loading" }), false)).toBe("");
    expect(liveText(view({ phase: "loading" }), true)).toBe(LOADING_LABEL);
    expect(liveText(view({ phase: "frame-unavailable", frames: [] }), true)).toBe("Frame unavailable. This frame is no longer available. It reappears here when the frame is restored.");
    expect(liveText(view(), true)).toBe("");
    expect(liveText(null, false)).toBe("");
  });
});

describe("covered", () => {
  test("only a ready run takes input", () => {
    const phases: PrototypePhase[] = ["loading", "ready", "read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"];
    expect(phases.filter(covered)).toEqual(["loading", "read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"]);
  });
});

describe("drawerRows", () => {
  test("lists the run's frames in its order with their canvas numbers, the playing one current", () => {
    expect(drawerRows(view())).toEqual([
      { key: "checkout", id: "checkout", number: 1, name: "Checkout", current: true },
      { key: "account", id: "account", number: 3, name: "account", current: false },
    ]);
  });

  test("no row is current once the playing frame left the list; no number until the view carries one", () => {
    expect(drawerRows(view({ frame: "gone" })).some(row => row.current)).toBe(false);
    expect(drawerRows(view({ frames: [{ id: "a", size: "1x1" }] }))[0]?.number).toBeNull();
  });

  test("names the list after the canvas when the view carries it", () => {
    expect(drawerLabel(view({ canvas: "Checkout flow" }))).toBe("Prototype frames in Checkout flow");
    expect(drawerLabel(view())).toBe("Prototype frames");
  });
});
