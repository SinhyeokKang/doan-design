import { describe, expect, test } from "vitest";
import type { PrototypePhase, PrototypeView } from "../../main/prototype/ipc";
import { covered, drawerLabel, exportAvailability, drawerRows, liveText, LOADING_LABEL, modeTooltip, stateScene, TIMEOUT_DETAIL, windowTitle } from "./view";

const frames = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", size: "390x844", number: 3 }];
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 2, frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "ready", mode: "fit", run: { url: "http://127.0.0.1/a.html", markWidth: 390, markHeight: 844 }, frames, canGoBack: false, canGoForward: false, previousStopped: false, ...over,
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

  test("no row is current once the playing frame left the list", () => {
    expect(drawerRows(view({ frame: "gone" })).some(row => row.current)).toBe(false);
  });

  test("names the list after the canvas", () => {
    expect(drawerLabel(view())).toBe("Prototype frames in Checkout flow");
  });
});

describe("modeTooltip", () => {
  test("Fit names the playing frame's mark and that it fits to the window", () => {
    expect(modeTooltip("fit", { markWidth: 390, markHeight: 844 })).toBe("Fit 390 × 844 to the window");
    expect(modeTooltip("fit", { markWidth: 1440, markHeight: 900 })).toBe("Fit 1440 × 900 to the window");
  });

  test("Fit without a known mark says only that it fits to the window", () => {
    for (const run of [null, undefined, { markWidth: 0, markHeight: 0 }, { markWidth: 390, markHeight: 0 }, { markWidth: 0, markHeight: 844 }]) {
      expect(modeTooltip("fit", run), JSON.stringify(run)).toBe("Fit to the window");
    }
  });

  test("Responsive is its name alone", () => {
    expect(modeTooltip("responsive", { markWidth: 390, markHeight: 844 })).toBe("Responsive");
    expect(modeTooltip("responsive", null)).toBe("Responsive");
  });
});

// The header's Export: available while the frame plays, loads or failed to start; otherwise the canvas toolbar's rule.
describe("exportAvailability", () => {
  test("is available while ready, loading or after a start failure", () => {
    for (const phase of ["ready", "loading", "init-failed"] as const) expect(exportAvailability(view({ phase }), false), phase).toEqual({ available: true });
  });

  test("before the first view it is off with no reason", () => {
    expect(exportAvailability(null, false)).toEqual({ available: false, reason: null });
  });

  test("names the reason it is unavailable", () => {
    expect(exportAvailability(view({ phase: "read-failed" }), false)).toEqual({ available: false, reason: "Can’t read this canvas." });
    for (const phase of ["frame-unavailable", "prototype-unavailable"] as const) {
      expect(exportAvailability(view({ phase }), false), phase).toEqual({ available: false, reason: "Export isn’t available while this prototype can’t play." });
    }
  });

  test("an export under way wins over every phase", () => {
    for (const phase of ["ready", "loading", "init-failed", "read-failed", "frame-unavailable", "prototype-unavailable"] as const) {
      expect(exportAvailability(view({ phase }), true), phase).toEqual({ available: false, reason: "Exporting" });
    }
  });
});
