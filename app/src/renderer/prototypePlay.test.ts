import { describe, expect, test } from "vitest";
import { PLAY_REASONS } from "../main/prototype/playability";
import { canvasPlayability, closedFocusTarget, drawerPlayRequest, playDrawer, playRequest, playSelection, playTooltip, sizeBubblePlay, type PlayState } from "./prototypePlay";
import type { CanvasFrameRect } from "./canvasMessage";
import type { CanvasState } from "./CanvasController";
import type { SelectionView } from "./selection";

const frame = (id: string, extra: Partial<CanvasFrameRect> = {}): CanvasFrameRect => ({ id, x: 0, y: 0, width: 100, height: 100, ...extra });
// 0 checkout (playable, titled), 1 form (unmarked, inside checkout), 2 cart (unmarked), 3 gift (invalid mark), 4 phone (playable, untitled)
const frames = [frame("checkout", { title: "Checkout", prototype: "390x844" }), frame("form", { parent: 0 }), frame("cart"), frame("gift", { title: "Gift card", prototype: "390" }), frame("phone", { prototype: "320x640" })];
const frameSelection = (index: number): SelectionView => ({ tag: "section", frame: { id: frames[index]!.id }, frameIndex: index, path: [] });
const elementSelection = (index: number): SelectionView => ({ tag: "button", frame: { id: frames[index]!.id }, frameIndex: index, element: { selector: "button", html: "<button>" }, path: [] });
const layout = (list: CanvasFrameRect[]): CanvasState["layout"] => ({ type: "layout", href: "http://127.0.0.1/a.html", height: 100, viewport: 100, frames: list, truncated: false, gotos: [] });
const open = { folder: "/repo", canvas: ".doan/canvases/a.html", row: { path: ".doan/canvases/a.html", id: "a", url: "http://127.0.0.1/a.html" } } as CanvasState["open"];
const state = (over: Partial<PlayState> = {}): PlayState => ({
  open, status: null, picking: false, capturing: false, selection: frameSelection(0), layout: layout(frames), ...over,
});

describe("playSelection", () => {
  test("names the selection's nearest frame by its id and layout index; an element is never the frame itself", () => {
    expect(playSelection(null)).toEqual({ kind: "none" });
    expect(playSelection(frameSelection(0))).toEqual({ kind: "frame", id: "checkout", index: 0 });
    expect(playSelection(elementSelection(1))).toEqual({ kind: "element", id: "form", index: 1 });
    expect(playSelection({ tag: "section", frame: { id: "late" }, path: [] })).toEqual({ kind: "frame", id: "late" });
  });

  test("an element outside every frame is no selection to play from", () => {
    expect(playSelection({ tag: "div", path: [] })).toEqual({ kind: "none" });
    expect(playSelection({ tag: "div", element: { selector: "div", html: "<div>" }, path: [] })).toEqual({ kind: "none" });
  });
});

describe("canvasPlayability", () => {
  test("plays a playable frame itself, or the innermost one around an element or an unmarked frame", () => {
    expect(canvasPlayability(state())).toEqual({ kind: "play", frame: 0 });
    expect(canvasPlayability(state({ selection: elementSelection(0) }))).toEqual({ kind: "play", frame: 0 });
    expect(canvasPlayability(state({ selection: frameSelection(1) }))).toEqual({ kind: "play", frame: 0 });
  });

  test("opens the drawer otherwise, naming a selected frame whose mark cannot play", () => {
    expect(canvasPlayability(state({ selection: null }))).toEqual({ kind: "drawer" });
    expect(canvasPlayability(state({ selection: frameSelection(2) }))).toEqual({ kind: "drawer" });
    expect(canvasPlayability(state({ selection: frameSelection(3) }))).toEqual({ kind: "drawer", broken: 3 });
  });

  test("is unavailable while the canvas is not shown or has not laid out yet", () => {
    for (const over of [{ open: null }, { layout: null }, ...(["empty", "loading", "noWidth", "failed", "missing"] as const).map(status => ({ status }))]) {
      expect(canvasPlayability(state(over))).toEqual({ kind: "disabled", reason: PLAY_REASONS.unavailable });
    }
  });

  test("names a pick, capture and a canvas without playable frames", () => {
    expect(canvasPlayability(state({ picking: true }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.picking });
    expect(canvasPlayability(state({ capturing: true }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.capturing });
    expect(canvasPlayability(state({ layout: layout([frame("cart"), frame("gift", { prototype: "390" })]) }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.none });
  });

  test("leaves out frames whose id was cut", () => {
    const cut = layout([frame("x".repeat(200), { cut: true, prototype: "390x844" })]);
    expect(canvasPlayability(state({ layout: cut, selection: null }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.none });
  });
});

describe("playTooltip (the toolbar button's tooltip and accessible description)", () => {
  test("names the frame that plays by its title, else its id", () => {
    expect(playTooltip(state())).toBe("Play “Checkout”");
    expect(playTooltip(state({ selection: frameSelection(4) }))).toBe("Play “phone”");
  });

  test("asks to choose in the drawer, naming a selected frame that can't play", () => {
    expect(playTooltip(state({ selection: null }))).toBe("Choose a prototype to play");
    expect(playTooltip(state({ selection: frameSelection(2) }))).toBe("Choose a prototype to play");
    expect(playTooltip(state({ selection: frameSelection(3) }))).toBe("“Gift card” can’t play. Choose a prototype to play.");
  });

  test("gives the reason while unavailable", () => {
    expect(playTooltip(state({ picking: true }))).toBe(PLAY_REASONS.picking);
    expect(playTooltip(state({ layout: null }))).toBe(PLAY_REASONS.unavailable);
  });
});

describe("sizeBubblePlay", () => {
  test("shows only while the selection is the playable frame itself", () => {
    expect(sizeBubblePlay(state())).toBe(true);
    expect(sizeBubblePlay(state({ selection: frameSelection(4) }))).toBe(true);
  });

  test("never for an element or an unmarked frame, even when Play plays the frame around it", () => {
    expect(sizeBubblePlay(state({ selection: elementSelection(0) }))).toBe(false);
    expect(sizeBubblePlay(state({ selection: frameSelection(1) }))).toBe(false);
  });

  test("not in the drawer or unavailable states, so not during a pick or capture", () => {
    for (const over of [{ selection: frameSelection(3) }, { selection: null }, { picking: true }, { capturing: true }, { layout: null }]) expect(sizeBubblePlay(state(over))).toBe(false);
  });
});

describe("playRequest", () => {
  test("names the root, the canvas path, the frame that plays and its raw mark", () => {
    expect(playRequest(state())).toEqual({ root: "/repo", path: ".doan/canvases/a.html", frame: "checkout", mark: "390x844" });
    expect(playRequest(state({ selection: elementSelection(1) }))).toEqual({ root: "/repo", path: ".doan/canvases/a.html", frame: "checkout", mark: "390x844" });
  });

  test("is null whenever Play does not play a frame", () => {
    expect(playRequest(state({ selection: frameSelection(2) }))).toBeNull();
    expect(playRequest(state({ selection: frameSelection(3) }))).toBeNull();
    expect(playRequest(state({ picking: true }))).toBeNull();
    expect(playRequest(state({ open: null }))).toBeNull();
    expect(playRequest(state({ layout: layout([frame("checkout", { prototype: "390x844" }), frame("checkout", { prototype: "390x844" })]) }))).toBeNull();
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

describe("playDrawer", () => {
  const long = "x".repeat(200);
  const linked = [
    frame("home", { title: "Home", prototype: "390x844" }), // 0
    frame("cart", { title: "Cart", prototype: "390x844" }), // 1
    frame("cta", { parent: 1 }), // 2: unmarked, inside cart
    frame("checkout", { title: "Checkout", prototype: "390x844" }), // 3
    frame("plain"), // 4: unmarked
    frame(long, { prototype: "390x844", cut: true }), // 5: cut, carries its raw mark
    frame("inside-cut", { parent: 5 }), // 6: unmarked, inside the cut frame
    frame(long, { prototype: "390x844" }), // 7: a genuine 200-unit id the cut one must not share
  ];
  const gotos = [{ value: "checkout", frame: 2 }, { value: "home", frame: 6 }, { value: long, frame: 0 }];
  const withLinks = (list: CanvasFrameRect[], links: { value: string; frame?: number }[]) => state({ layout: { ...layout(list)!, gotos: links }, selection: null });
  const rows = (groups: ReturnType<typeof playDrawer>["groups"]) => groups.map(group => [group.label, group.rows.map(row => [row.id === long ? "long" : row.id, row.number, row.current])]);

  test("lists only playable frames, grouped by the links' enclosing frames, cut frames left out of both", () => {
    const drawer = playDrawer(withLinks(linked, gotos), null);
    expect(drawer.label).toBe("Prototype frames in a");
    // cta's link names its enclosing cart; the link inside the cut frame has no playable frame around it (the walk
    // skips the cut id and finds nothing above it), and home's link to the genuine long id joins them.
    expect(rows(drawer.groups)).toEqual([
      ["Home and 1 more", [["home", 1, false], ["long", 8, false]]],
      ["Cart and 1 more", [["cart", 2, false], ["checkout", 4, false]]],
    ]);
  });

  test("marks the row the prototype window plays when it plays this canvas, by id or by path for an id-less canvas", () => {
    const current = (drawer: ReturnType<typeof playDrawer>) => drawer.groups.flatMap(group => group.rows).filter(row => row.current).map(row => row.id);
    const s = withLinks(linked, gotos);
    expect(current(playDrawer(s, { root: "/repo", canvas: { id: "a", path: ".doan/canvases/moved.html" }, frame: "checkout" }))).toEqual(["checkout"]);
    expect(current(playDrawer(s, { root: "/repo", canvas: { id: "b", path: ".doan/canvases/a.html" }, frame: "checkout" }))).toEqual([]);
    expect(current(playDrawer(s, { root: "/other", canvas: { id: "a", path: ".doan/canvases/a.html" }, frame: "checkout" }))).toEqual([]);
    expect(current(playDrawer(s, { root: "/repo", canvas: { id: "a", path: ".doan/canvases/a.html" }, frame: "plain" }))).toEqual([]);
    const loose = { ...s, open: { ...open!, row: { path: ".doan/canvases/a.html", url: "http://127.0.0.1/a.html" } } };
    expect(current(playDrawer(loose, { root: "/repo", canvas: { path: ".doan/canvases/a.html" }, frame: "home" }))).toEqual(["home"]);
    expect(current(playDrawer(loose, { root: "/repo", canvas: { id: "a", path: ".doan/canvases/a.html" }, frame: "home" }))).toEqual([]);
  });

  test("a frame without links goes to the last group", () => {
    const drawer = playDrawer(withLinks(frames, []), null);
    expect(rows(drawer.groups)).toEqual([["Frames without links", [["checkout", 1, false], ["phone", 5, false]]]]);
  });

  test("a pick plays the chosen row's frame with its own mark, whatever is selected", () => {
    expect(drawerPlayRequest(state({ selection: frameSelection(3) }), "phone")).toEqual({ root: "/repo", path: ".doan/canvases/a.html", frame: "phone", mark: "320x640" });
    expect(drawerPlayRequest(state(), "gift")).toBeNull();
    expect(drawerPlayRequest(state(), "ghost")).toBeNull();
    expect(drawerPlayRequest(state({ open: null }), "phone")).toBeNull();
  });
});
