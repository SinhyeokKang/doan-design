import { describe, expect, test } from "vitest";
import { PLAY_REASONS } from "../main/prototype/playability";
import { canvasPlayability, closedFocusTarget, playRequest, playSelection, type PlayState } from "./prototypePlay";
import type { CanvasState } from "./CanvasController";
import type { SelectionView } from "./selection";

const frame = (id: string, prototype?: string) => ({ id, x: 0, y: 0, width: 100, height: 100, ...(prototype === undefined ? {} : { prototype }) });
const frameSelection = (id: string): SelectionView => ({ tag: "section", frame: { id }, path: [] });
const elementSelection = (id: string): SelectionView => ({ tag: "button", frame: { id }, element: { selector: "button", html: "<button>" }, path: [] });
const layout = (frames: ReturnType<typeof frame>[]): CanvasState["layout"] => ({ type: "layout", href: "http://127.0.0.1/a.html", height: 100, viewport: 100, frames, truncated: false });
const open = { folder: "/repo", canvas: ".doan/canvases/a.html", row: { path: ".doan/canvases/a.html", id: "a", url: "http://127.0.0.1/a.html" } } as CanvasState["open"];
const state = (over: Partial<PlayState & Pick<CanvasState, "open">> = {}) => ({
  tool: "select" as const, picking: false, capturing: false, selection: frameSelection("checkout"), layout: layout([frame("checkout", "390x844"), frame("cart")]), open, ...over,
});

describe("playSelection", () => {
  test("a selection without an element is the frame itself; an element is never the frame", () => {
    expect(playSelection(null)).toEqual({ kind: "none" });
    expect(playSelection(frameSelection("checkout"))).toEqual({ kind: "frame", id: "checkout" });
    expect(playSelection(elementSelection("checkout"))).toEqual({ kind: "element" });
    expect(playSelection({ tag: "div", path: [] })).toEqual({ kind: "none" });
  });
});

describe("canvasPlayability", () => {
  test("enables a marked frame selected as itself in Select", () => {
    expect(canvasPlayability(state())).toEqual({ enabled: true });
  });

  test("gives the reason that names what to do", () => {
    expect(canvasPlayability(state({ selection: elementSelection("checkout") }))).toEqual({ enabled: false, reason: PLAY_REASONS.element });
    expect(canvasPlayability(state({ selection: frameSelection("cart") }))).toEqual({ enabled: false, reason: PLAY_REASONS.unmarked });
    expect(canvasPlayability(state({ selection: null }))).toEqual({ enabled: false, reason: PLAY_REASONS.none });
    for (const over of [{ tool: "hand" as const }, { picking: true }, { capturing: true }]) {
      expect(canvasPlayability(state(over))).toEqual({ enabled: false, reason: PLAY_REASONS.tool });
    }
  });

  test("a canvas with no layout yet has no frame to play", () => {
    expect(canvasPlayability(state({ layout: null }))).toEqual({ enabled: false, reason: PLAY_REASONS.none });
  });
});

describe("playRequest", () => {
  test("names the root, the canvas path, the frame and its raw mark", () => {
    expect(playRequest(state())).toEqual({ root: "/repo", path: ".doan/canvases/a.html", frame: "checkout", mark: "390x844" });
  });

  test("is null whenever Play is unavailable or no canvas is open", () => {
    expect(playRequest(state({ selection: frameSelection("cart") }))).toBeNull();
    expect(playRequest(state({ selection: elementSelection("checkout") }))).toBeNull();
    expect(playRequest(state({ tool: "hand" }))).toBeNull();
    expect(playRequest(state({ open: null }))).toBeNull();
    expect(playRequest(state({ layout: layout([frame("checkout", "390x844"), frame("checkout", "390x844")]) }))).toBeNull();
  });
});

describe("closedFocusTarget", () => {
  const node = (name: string, connected = true, inert = false) => ({ name, isConnected: connected, closest: (selector: string) => (selector === "[inert]" && inert ? {} : null) });

  test("prefers the bubble's Play on screen, then the toolbar's", () => {
    expect(closedFocusTarget(node("bubble"), node("toolbar"))?.name).toBe("bubble");
    expect(closedFocusTarget(null, node("toolbar"))?.name).toBe("toolbar");
    expect(closedFocusTarget(node("bubble", false), node("toolbar"))?.name).toBe("toolbar");
  });

  test("takes nothing under an inert cover or off the page, so the main window's screen stays as it is", () => {
    expect(closedFocusTarget(null, node("toolbar", true, true))).toBeNull();
    expect(closedFocusTarget(node("bubble", true, true), node("toolbar", false))).toBeNull();
    expect(closedFocusTarget(null, null)).toBeNull();
  });
});
