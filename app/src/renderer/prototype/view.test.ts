import { describe, expect, test } from "vitest";
import { PROTOTYPE_LOAD_TIMEOUT_MS, type PrototypePhase, type PrototypeView } from "../../main/prototype/ipc";
import { covered, drawerGroups, drawerLabel, exportAvailability, linkMove, linkToast, liveText, LOADING_LABEL, modeTooltip, otherMode, stateScene, TIMEOUT_DETAIL, viewportKey, windowTitle } from "./view";

const frames = [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }, { id: "account", size: "390x844", number: 3 }];
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 2, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "ready", mode: "fit", run: { url: "http://127.0.0.1/a.html", markWidth: 390, markHeight: 844 }, frames, gotos: [], canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: false, width: null }, canvasRow: "present", ...over,
});

describe("windowTitle", () => {
  test("is the frame name and Prototype, so the window list tells it from the main window", () => {
    expect(windowTitle(view())).toBe("Checkout — Prototype");
    expect(windowTitle(null)).toBe("Prototype");
  });
});

describe("stateScene", () => {
  test("the timeout detail states the host's own limit", () => {
    expect(TIMEOUT_DETAIL).toBe(`The frame didn’t finish loading within ${PROTOTYPE_LOAD_TIMEOUT_MS / 1000} seconds.`);
    expect(TIMEOUT_DETAIL).toBe("The frame didn’t finish loading within 10 seconds.");
  });

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

  // A link move announces the frame it moved to once, when that run is ready; a scene or a load says its own line.
  test("names the frame a link moved to once its run is ready", () => {
    expect(liveText(view(), false, true)).toBe("Checkout");
    expect(liveText(view({ phase: "loading" }), false, true)).toBe("");
    expect(liveText(view({ phase: "init-failed" }), false, true)).toBe(liveText(view({ phase: "init-failed" }), false));
  });
});

describe("covered", () => {
  test("only a ready run takes input", () => {
    const phases: PrototypePhase[] = ["loading", "ready", "read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"];
    expect(phases.filter(covered)).toEqual(["loading", "read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"]);
  });
});

describe("drawerGroups", () => {
  test("lists the run's frames in its order with their canvas numbers, the playing one current", () => {
    expect(drawerGroups(view())).toEqual([{ label: "Frames without links", rows: [
      { key: "checkout", id: "checkout", number: 1, name: "Checkout", current: true, group: 0 },
      { key: "account", id: "account", number: 3, name: "account", current: false, group: 0 },
    ] }]);
  });

  test("groups the run's frames by its links, linked groups first", () => {
    const frames = [{ id: "home", size: "390x844", number: 1 }, { id: "checkout", title: "Checkout", size: "390x844", number: 2 }, { id: "done", title: "Done", size: "390x844", number: 4 }];
    const groups = drawerGroups(view({ frames, gotos: [{ value: "done", frames: ["checkout"] }] }));
    expect(groups.map(group => [group.label, group.rows.map(row => row.id)])).toEqual([["Checkout and 1 more", ["checkout", "done"]], ["Frames without links", ["home"]]]);
  });

  test("an empty or blank title names the row by its id, a padded one trimmed", () => {
    const frames = [{ id: "a", title: "", size: "390x844", number: 1 }, { id: "b", title: "  ", size: "390x844", number: 2 }, { id: "c", title: " C ", size: "390x844", number: 3 }];
    expect(drawerGroups(view({ frames })).flatMap(group => group.rows).map(row => row.name)).toEqual(["a", "b", "C"]);
  });

  test("no row is current once the playing frame left the list", () => {
    expect(drawerGroups(view({ frame: "gone" })).flatMap(group => group.rows).some(row => row.current)).toBe(false);
  });

  test("an empty list has no group", () => {
    expect(drawerGroups(view({ frames: [] }))).toEqual([]);
  });

  test("names the list after the canvas", () => {
    expect(drawerLabel(view())).toBe("Prototype frames in Checkout flow");
  });
});

// The renderer's half of a link click, judged by its own view before main judges again.
describe("linkMove", () => {
  test("moves to a frame the run lists", () => {
    expect(linkMove(view(), { gen: 2, goto: "account" }, false)).toEqual({ kind: "move", frame: "account" });
    expect(linkMove(view(), { gen: 2, goto: "checkout" }, false)).toEqual({ kind: "move", frame: "checkout" });
  });

  test("a frame the run does not list, or a value too long to be one, gets the toast", () => {
    expect(linkMove(view(), { gen: 2, goto: "receipt" }, false)).toEqual({ kind: "toast", text: "Can’t go to “receipt”. Ask your agent to fix this link." });
    expect(linkMove(view(), { gen: 2, goto: "" }, false)).toEqual({ kind: "toast", text: "Can’t go to “”. Ask your agent to fix this link." });
    expect(linkMove(view(), { gen: 2, goto: null }, false)).toEqual({ kind: "toast", text: "Can’t go to this link’s frame. Ask your agent to fix this link." });
  });

  test("an export's toast on screen keeps the link's toast away, but not the move", () => {
    expect(linkMove(view(), { gen: 2, goto: "receipt" }, true)).toEqual({ kind: "drop" });
    expect(linkMove(view(), { gen: 2, goto: "account" }, true)).toEqual({ kind: "move", frame: "account" });
  });

  test("does nothing while the run loads, failed or was lost, for another gen, or before the first view", () => {
    for (const phase of ["loading", "read-failed", "init-failed", "frame-unavailable", "prototype-unavailable"] as const) {
      expect(linkMove(view({ phase }), { gen: 2, goto: "account" }, false), phase).toEqual({ kind: "drop" });
      expect(linkMove(view({ phase }), { gen: 2, goto: "receipt" }, false), phase).toEqual({ kind: "drop" });
    }
    expect(linkMove(view(), { gen: 1, goto: "account" }, false)).toEqual({ kind: "drop" });
    expect(linkMove(null, { gen: 2, goto: "account" }, false)).toEqual({ kind: "drop" });
  });

  test("the toast quotes the id as written", () => {
    expect(linkToast("order-confirmation-step-three")).toBe("Can’t go to “order-confirmation-step-three”. Ask your agent to fix this link.");
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

// Unavailable states follow the canvas toolbar's rule.
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

// PRODUCT §5 item 2 'Prototype window' 'Header': Z switches Fit and Responsive as the header toggle does.
describe("viewportKey", () => {
  const key = (over: Record<string, unknown> = {}) => ({ type: "keydown", code: "KeyZ", key: "z", repeat: false, isComposing: false, keyCode: 90, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
  const element = (tagName: string, over: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, getAttribute: () => null, hasAttribute: () => false, closest: () => null, ...over });

  test("takes a plain Z by event.code, also when a Korean layout reports ㅋ", () => {
    expect(viewportKey(key())).toBe(true);
    expect(viewportKey(key({ key: "ㅋ" }))).toBe(true);
    expect(viewportKey(key({ target: element("BUTTON") }))).toBe(true);
    expect(viewportKey(key({ target: element("BODY") }))).toBe(true);
  });

  test.each([
    ["⇧", { shiftKey: true }], ["⌘", { metaKey: true }], ["⌃", { ctrlKey: true }], ["⌥", { altKey: true }],
    ["an IME composition", { isComposing: true }], ["keyCode 229", { keyCode: 229 }],
    ["a repeat", { repeat: true }], ["a handled key", { defaultPrevented: true }], ["a keyup", { type: "keyup" }],
    ["another key", { code: "KeyX", key: "z" }],
  ])("ignores Z with %s", (_, over) => {
    expect(viewportKey(key(over))).toBe(false);
  });

  test("ignores Z in a text field", () => {
    for (const target of [element("INPUT"), element("TEXTAREA"), element("SELECT"), element("DIV", { isContentEditable: true })]) expect(viewportKey(key({ target }))).toBe(false);
  });

  test("ignores Z inside an open menu, list or dialog, such as the frame drawer", () => {
    expect(viewportKey(key({ target: element("DIV", { closest: () => ({}) }) }))).toBe(false);
  });
});

describe("otherMode", () => {
  test("switches Fit and Responsive", () => {
    expect(otherMode("fit")).toBe("responsive");
    expect(otherMode("responsive")).toBe("fit");
  });
});
