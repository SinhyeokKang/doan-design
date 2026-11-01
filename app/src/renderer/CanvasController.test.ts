import { afterEach, describe, expect, it, vi } from "vitest";
import type { InspectResult, InspectRow } from "../main/inspect";
import type { FolderEntry } from "../main/view";
import { CanvasController, initialCanvasState, MEASURE_ANSWER_MS } from "./CanvasController";
import { FIRST_LAYOUT_TIMEOUT_MS, FIT_INSET, fitFrame, fitWidth, locateView, screenToBoard } from "./viewport";
import { unavailableCanvasMessage } from "./quickOpen";
import { SELECTION_LOST } from "./selection";
import { activityFor } from "./activity";

afterEach(() => vi.unstubAllGlobals());

it("updates the board synchronously without notifying React during pan", () => {
  vi.stubGlobal("window", new EventTarget());
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) });
  const board = { style: { transform: "", visibility: "" }, hidden: false, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
  controller.wheel({ dx: 10, dy: 20, ctrl: false, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
  expect(board.style.transform).toBe("translate(-10px, -20px) scale(1)");
  expect(changed).not.toHaveBeenCalled();
  controller.dispose();
});

it("notifies React only when the rounded zoom percentage changes", () => {
  vi.stubGlobal("window", new EventTarget());
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) });
  const board = { style: { transform: "", visibility: "" }, hidden: false, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
  const zoom = (dy: number) => controller.wheel({ dx: 0, dy, ctrl: true, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
  zoom(-0.1);
  expect(changed).not.toHaveBeenCalled();
  zoom(-1);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0]?.[0].zoom).toBe(101);
  zoom(-0.1);
  expect(changed).toHaveBeenCalledTimes(1);
  controller.dispose();
});

// buzz-canvas R2: the zoom menu's 50% and 200%, and the exact scale the zoom controller reads.
describe("zoom to a scale", () => {
  it("lands on the scale and keeps the view center fixed", () => {
    const { controller, changed } = loadedController();
    try {
      const center = { x: 400, y: 300 };
      const before = screenToBoard(controller.currentView(), center);
      controller.zoomTo(0.5);
      expect(controller.currentView().scale).toBe(0.5);
      const after = screenToBoard(controller.currentView(), center);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(changed.mock.lastCall?.[0]).toMatchObject({ zoom: 50, scale: 0.5 });
      controller.zoomTo(2);
      expect(changed.mock.lastCall?.[0]).toMatchObject({ zoom: 200, scale: 2 });
    } finally { controller.dispose(); }
  });

  it("does nothing without a rendered board", () => {
    vi.stubGlobal("window", new EventTarget());
    const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
    const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
    const controller = new CanvasController(viewport, board, { append: vi.fn() }, vi.fn(), vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
    try {
      controller.zoomTo(2);
      expect(controller.currentView().scale).toBe(1);
    } finally { controller.dispose(); }
  });

  it("publishes the exact scale when a step reaches a zoom limit within the same percent", () => {
    const { controller, changed } = loadedController();
    try {
      controller.zoomTo(0.052);
      expect(changed.mock.lastCall?.[0]).toMatchObject({ zoom: 5, scale: 0.052 });
      changed.mockClear();
      controller.command("zoomOut");
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.lastCall?.[0]).toMatchObject({ zoom: 5, scale: 0.05 });
      controller.zoomTo(3.999);
      changed.mockClear();
      controller.command("zoomIn");
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.lastCall?.[0]).toMatchObject({ zoom: 400, scale: 4 });
    } finally { controller.dispose(); }
  });

  it("starts with an exact scale of 1", () => {
    expect(initialCanvasState().scale).toBe(1);
  });
});

function loadedController() {
  const host = new EventTarget();
  vi.stubGlobal("window", host);
  const frame = Object.assign(new EventTarget(), { contentWindow: { postMessage: vi.fn() }, style: {}, setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() });
  vi.stubGlobal("document", { createElement: () => frame });
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
  const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
  const row = { path: ".doan/canvases/a.html", url: "http://localhost/a.html", width: 600 };
  controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }]);
  controller.openCanvas("/repo", row);
  const layout = { type: "layout", href: row.url, height: 600, viewport: 150, frames: [{ id: "a", title: "A", x: 0, y: 0, width: 100, height: 100 }], truncated: false };
  const receive = (data = layout) => host.dispatchEvent(Object.assign(new Event("message"), { data, origin: "null", source: frame.contentWindow }));
  receive();
  changed.mockClear();
  return { controller, changed, receive, layout, row, board };
}

it("does not notify React for repeated layouts or geometry-only changes", () => {
  const { controller, changed, receive, layout } = loadedController();
  try {
    receive();
    receive({ ...layout, height: 900, frames: [{ ...layout.frames[0]!, y: 80 }] });
    expect(changed).not.toHaveBeenCalled();
    receive({ ...layout, frames: [{ ...layout.frames[0]!, title: "Changed" }] });
    expect(changed).toHaveBeenCalledOnce();
    changed.mockClear();
    receive({ ...layout, truncated: true });
    expect(changed).toHaveBeenCalledOnce();
  } finally { controller.dispose(); }
});

interface FakeMark {
  className: string;
  hidden: boolean;
  textContent: string;
  style: Record<string, string>;
  children: FakeMark[];
  append(...children: FakeMark[]): void;
}

// Each load gets its own iframe (and window) so messages can be sent from the
// old or the new document.
function selectionHarness() {
  const host = new EventTarget();
  vi.stubGlobal("window", host);
  const frames: (EventTarget & { contentWindow: { postMessage: ReturnType<typeof vi.fn> }; style: Record<string, string> })[] = [];
  const marks: FakeMark[] = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "iframe") {
        const mark: FakeMark = Object.assign(new EventTarget(), { className: "", hidden: false, textContent: "", style: {}, children: [] as FakeMark[], append: (...children: FakeMark[]) => mark.children.push(...children), setAttribute: vi.fn(), remove: vi.fn() });
        marks.push(mark);
        return mark;
      }
      const frame = Object.assign(new EventTarget(), { contentWindow: { postMessage: vi.fn() }, style: {}, setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() });
      frames.push(frame);
      return frame;
    },
  });
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
  const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
  const overlay = { append: vi.fn() };
  const changed = vi.fn();
  const send = vi.fn();
  // Each inspect call waits until the test resolves it, so answers can arrive late.
  const inspections: { selector: string; resolve: (result: InspectResult) => void; reject: (error: unknown) => void }[] = [];
  const inspect = vi.fn((selector: string) => new Promise<InspectResult>((resolve, reject) => { inspections.push({ selector, resolve, reject }); }));
  const controller = new CanvasController(viewport, board, overlay, changed, send, inspect);
  const row = { path: ".doan/canvases/a.html", id: "a", url: "http://localhost/t/k/f/.doan/canvases/a.html", width: 600 };
  const other = { ...row, path: ".doan/canvases/b.html", id: "b", url: "http://localhost/t/k/f/.doan/canvases/b.html" };
  controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row, other] }]);
  controller.openCanvas("/repo", row);
  const current = () => frames.at(-1)!;
  const receive = (data: Record<string, unknown>, frame = current()) => host.dispatchEvent(Object.assign(new Event("message"), { data: { href: row.url, viewport: 150, ...data }, origin: "null", source: frame.contentWindow }));
  const layout = (over: Record<string, unknown> = {}) => receive({ type: "layout", height: 150, frames: [{ id: "intro", x: 0, y: 0, width: 10, height: 10 }, { id: "hero", x: 0, y: 20, width: 10, height: 10 }], truncated: false, ...over });
  const target = { rect: { x: 10, y: 20, width: 60, height: 18 }, tag: "span", frame: { id: "hero" }, frameIndex: 1, element: { doanId: "cta", selector: '[data-doan-id="cta"]', html: "<span>x</span>" }, path: [{ label: "cta", selector: '[data-doan-id="cta"]', doanId: "cta" }] };
  const select = (seq: number, over: Record<string, unknown> = {}) => receive({ type: "select", seq, target, ...over });
  const key = (name: string) => host.dispatchEvent(Object.assign(new Event("keydown"), { key: name }));
  const markOf = (kind: string) => marks.find((mark) => mark.className.split(" ").includes(kind));
  const state = () => changed.mock.lastCall?.[0];
  layout();
  return { controller, changed, send, frames, current, receive, layout, select, key, markOf, state, row, other, target, overlay, host, viewport, inspect, inspections, board };
}

describe("selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("redraws the selection mark on a plain wheel pan without notifying React", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      expect(h.markOf("selected")?.style).toMatchObject({ left: "110px", top: "76px", width: "60px", height: "18px" });
      h.changed.mockClear();
      h.controller.wheel({ dx: 10, dy: 20, ctrl: false, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
      expect(h.markOf("selected")?.style).toMatchObject({ left: "100px", top: "56px" });
      expect(h.changed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("takes a select from the open canvas into state, main and the size label inside the mark", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const { rect: _rect, ...view } = h.target;
      expect(h.state().selection).toEqual(view);
      expect(h.send).toHaveBeenLastCalledWith({ root: "/repo", canvas: { path: ".doan/canvases/a.html", id: "a" }, frame: { id: "hero" }, element: h.target.element });
      expect(h.markOf("dims")?.textContent).toBe("60 × 18");
      expect(h.markOf("selected")?.children).toEqual([h.markOf("dims")]);
      expect(h.overlay.append).toHaveBeenCalledWith(h.markOf("hover"), h.markOf("selected"));
      expect(h.markOf("selected")?.hidden).toBe(false);
    } finally { h.controller.dispose(); }
  });

  it("tells main once per selection, not on every layout", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.layout({ seq: 1, selected: { x: 0, y: 0, width: 5, height: 5 } });
      h.layout({ seq: 1, selected: { x: 0, y: 3, width: 5, height: 5 } });
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.markOf("selected")?.style).toMatchObject({ top: "59px", width: "5px" });
    } finally { h.controller.dispose(); }
  });

  it("Esc clears, tells the canvas with a new seq, and a select sent before it is dropped", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.key("Escape");
      expect(h.state().selection).toBeNull();
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "clear", seq: 2 }, "*");
      expect(h.send).toHaveBeenLastCalledWith(null);
      h.select(1);
      h.layout({ seq: 1, selected: h.target.rect });
      expect(h.state().selection).toBeNull();
      expect(h.markOf("selected")?.hidden).toBe(true);
    } finally { h.controller.dispose(); }
  });

  it("a key message from the canvas clears like the app's own Esc", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.receive({ type: "key", seq: 0, key: "Escape" });
      expect(h.state().selection).toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("a clear from a click on the empty canvas clears without a notice", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.receive({ type: "clear", seq: 2 });
      expect(h.state()).toMatchObject({ selection: null, notice: "" });
      expect(h.send).toHaveBeenLastCalledWith(null);
    } finally { h.controller.dispose(); }
  });

  it("a null answer or a lost element clears with the notice until the next selection", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.select(1, { target: null });
      expect(h.state()).toMatchObject({ selection: null, notice: SELECTION_LOST });
      h.select(2);
      expect(h.state().notice).toBe("");
      h.layout({ seq: 2, selected: null });
      expect(h.state()).toMatchObject({ selection: null, notice: SELECTION_LOST });
    } finally { h.controller.dispose(); }
  });

  it("a reload keeps the selection, hides the mark and asks the new document for the same anchor", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const old = h.current();
      h.controller.command("reload");
      expect(h.current()).not.toBe(old);
      expect(h.markOf("selected")?.hidden).toBe(true);
      expect(h.state().selection).not.toBeNull();
      h.select(1, {}, );
      expect(h.current().contentWindow.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "select-anchor" }), "*");
      h.layout();
      expect(h.current().contentWindow.postMessage).toHaveBeenCalledWith({ type: "select-anchor", seq: 1, doanId: "cta", selector: '[data-doan-id="cta"]' }, "*");
      h.select(1, { target: { ...h.target, rect: { x: 0, y: 0, width: 1, height: 1 } } });
      expect(h.markOf("selected")).toMatchObject({ hidden: false, style: { width: "1px" } });
      expect(h.send).toHaveBeenCalledTimes(1);
    } finally { h.controller.dispose(); }
  });

  it("opening another canvas clears the selection and tells main", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.openCanvas("/repo", h.other);
      expect(h.state().selection).toBeNull();
      expect(h.send).toHaveBeenLastCalledWith(null);
    } finally { h.controller.dispose(); }
  });

  it("a link to another document clears the selection", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.layout({ href: h.other.url });
      expect(h.state().selection).toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("Select asks the canvas to pick that frame by index and id", () => {
    const h = selectionHarness();
    try {
      h.controller.selectFrame(1, "hero");
      const posted = h.current().contentWindow.postMessage.mock.calls.map((call) => call[0]);
      expect(posted.slice(-2)).toEqual([{ type: "measure" }, { type: "pick-frame", seq: 1, index: 1, id: "hero" }]);
    } finally { h.controller.dispose(); }
  });

  // buzz-canvas R1: the frame drawer's row carries the index and id it was drawn with; the layout may have changed
  // since (POSTMORTEM 2026-10-25 'Navigation feedback read the previous React snapshot').
  describe("a frame picked from the drawer", () => {
    const frame = (id: string, y: number) => ({ id, x: 0, y, width: 10, height: 10 });
    const picks = (h: ReturnType<typeof selectionHarness>) => h.current().contentWindow.postMessage.mock.calls.map(call => call[0]).filter(message => message.type === "pick-frame" || message.type === "measure");

    it("selects the row's frame by id after a reload reordered the frames", () => {
      const h = selectionHarness();
      try {
        h.layout({ frames: [frame("hero", 20), frame("intro", 0)] });
        h.current().contentWindow.postMessage.mockClear();
        h.controller.selectFrame(1, "hero");
        expect(picks(h)).toEqual([{ type: "measure" }, { type: "pick-frame", seq: 1, index: 0, id: "hero" }]);
      } finally { h.controller.dispose(); }
    });

    it("jumps to the frame the id resolved to", () => {
      const h = selectionHarness();
      try {
        h.layout({ frames: [frame("hero", 2000), frame("intro", 0)] });
        h.controller.selectFrame(1, "hero");
        h.layout({ frames: [frame("hero", 2000), frame("intro", 0)] });
        expect(h.state().currentFrame).toBe(0);
      } finally { h.controller.dispose(); }
    });

    it("does nothing when the picked id is gone", () => {
      const h = selectionHarness();
      try {
        h.layout({ frames: [frame("intro", 0)] });
        h.current().contentWindow.postMessage.mockClear();
        h.controller.selectFrame(1, "hero");
        expect(picks(h)).toEqual([]);
      } finally { h.controller.dispose(); }
    });

    it("keeps the row's index when it still holds a repeated id, else takes the id's first frame", () => {
      const h = selectionHarness();
      try {
        h.layout({ frames: [frame("intro", 0), frame("dup", 20), frame("dup", 40)] });
        h.current().contentWindow.postMessage.mockClear();
        h.controller.selectFrame(2, "dup");
        expect(picks(h).at(-1)).toEqual({ type: "pick-frame", seq: 1, index: 2, id: "dup" });
        h.layout({ frames: [frame("dup", 0), frame("intro", 20)] });
        h.controller.selectFrame(2, "dup");
        expect(picks(h).at(-1)).toEqual({ type: "pick-frame", seq: 2, index: 0, id: "dup" });
      } finally { h.controller.dispose(); }
    });

    it("does nothing on an unlisted page", () => {
      const h = selectionHarness();
      try {
        h.layout({ href: "http://localhost/elsewhere.html" });
        h.current().contentWindow.postMessage.mockClear();
        h.controller.selectFrame(1, "hero");
        expect(picks(h)).toEqual([]);
      } finally { h.controller.dispose(); }
    });
  });

  it("a path step asks the canvas for that anchor", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.selectPath({ label: "form", selector: "body > form:nth-of-type(1)" });
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "select-anchor", seq: 2, selector: "body > form:nth-of-type(1)" }, "*");
    } finally { h.controller.dispose(); }
  });

  it("clears hover on app pointer movement outside the iframe without notifying React", () => {
    const h = selectionHarness();
    try {
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      h.changed.mockClear();
      h.host.dispatchEvent(new Event("pointermove"));
      expect(h.markOf("hover")?.hidden).toBe(true);
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "hover-leave", seq: 1 }, "*");
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(true);
      expect(h.changed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("restores the cached hover after Alt keyup without another canvas message", () => {
    const h = selectionHarness();
    try {
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      h.changed.mockClear();
      h.key("Alt");
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.host.dispatchEvent(Object.assign(new Event("keyup"), { key: "Alt" }));
      expect(h.markOf("hover")?.hidden).toBe(false);
      h.key("Alt");
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.host.dispatchEvent(Object.assign(new Event("keyup"), { key: "Alt" }));
      expect(h.markOf("hover")?.hidden).toBe(false);
      expect(h.changed).not.toHaveBeenCalled();
      h.key("Alt");
      h.host.dispatchEvent(new Event("pointermove"));
      h.host.dispatchEvent(Object.assign(new Event("keyup"), { key: "Alt" }));
      expect(h.markOf("hover")?.hidden).toBe(true);
    } finally { h.controller.dispose(); }
  });

  it("takes Alt release from the canvas without reviving stale hover or clearing selection", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      h.changed.mockClear();
      h.key("Alt");
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "hover-alt", alt: true, seq: 1 }, "*");
      h.receive({ type: "key", key: "Alt", alt: false, seq: 0 });
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.receive({ type: "hover", seq: 1, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.receive({ type: "key", key: "Alt", alt: false, seq: 1 });
      h.receive({ type: "hover", seq: 1, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(false);
      h.layout({ seq: 1, selected: { x: 20, y: 30, width: 60, height: 18 } });
      expect(h.markOf("selected")?.style.left).toBe("120px");
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.changed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("clears selection on a board margin click, but not on pan, zoom or modified clicks", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      for (const ctrl of [false, true]) {
        h.controller.wheel({ dx: 0, dy: 5, ctrl, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
        expect(h.state()?.selection).not.toBeNull();
      }
      for (const fields of [{ altKey: true }, { ctrlKey: true }, { button: 2 }]) {
        h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0, ...fields }));
        expect(h.state()?.selection).not.toBeNull();
      }
      const controlClick = Object.assign(new Event("click"), { button: 0 });
      Object.defineProperty(controlClick, "target", { value: new EventTarget() });
      h.viewport.dispatchEvent(controlClick);
      expect(h.state()?.selection).not.toBeNull();
      h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0 }));
      expect(h.state()?.selection).toBeNull();
      expect(h.send).toHaveBeenLastCalledWith(null);
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "clear", seq: 2 }, "*");
      h.select(1);
      expect(h.state()?.selection).toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("draws the hover mark and hides it on Alt or a wheel", () => {
    const h = selectionHarness();
    try {
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")).toMatchObject({ hidden: false, style: { left: "100px", top: "56px", width: "4px" } });
      h.key("Alt");
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      h.controller.wheel({ dx: 0, dy: 5, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
      expect(h.markOf("hover")?.hidden).toBe(true);
    } finally { h.controller.dispose(); }
  });
});

// design.md flow 7: each row is a pure decision (selection.test.ts); these pin
// that the controller actually applies it on the matching code path.
describe("selection wiring (flow 7)", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const cleared = (h: ReturnType<typeof selectionHarness>) => {
    expect(h.state()).toMatchObject({ selection: null, notice: "" });
    expect(h.send).toHaveBeenLastCalledWith(null);
    expect(h.markOf("selected")?.hidden).toBe(true);
  };

  it("a reload that never lays out clears the selection after the 5 s timeout", () => {
    vi.useFakeTimers();
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.command("reload");
      vi.advanceTimersByTime(FIRST_LAYOUT_TIMEOUT_MS - 1);
      expect(h.state().selection).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(h.state().status).toBe("failed");
      cleared(h);
    } finally { h.controller.dispose(); }
  });

  // The previous layout stays shown with a null status, so only `reloading`
  // tells the Comments panel the new document is not known yet (F2).
  it("reports a reload of the open canvas as reloading until its first layout or the timeout", () => {
    vi.useFakeTimers();
    const h = selectionHarness();
    try {
      expect(h.state()).toMatchObject({ status: null, reloading: false });
      h.controller.command("reload");
      expect(h.state()).toMatchObject({ status: null, reloading: true });
      h.layout({ document: "two" });
      expect(h.state()).toMatchObject({ status: null, reloading: false });
      h.controller.command("reload");
      expect(h.state().reloading).toBe(true);
      vi.advanceTimersByTime(FIRST_LAYOUT_TIMEOUT_MS);
      expect(h.state()).toMatchObject({ status: "failed", reloading: false });
      h.controller.command("reload");
      expect(h.state()).toMatchObject({ status: "loading", reloading: false });
    } finally { h.controller.dispose(); }
  });

  it("a document that never answers measure after its load is unlisted and clears the selection", () => {
    vi.useFakeTimers();
    const h = selectionHarness();
    try {
      h.select(1);
      h.current().dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(1000);
      expect(h.state().unlisted).toBe(true);
      cleared(h);
    } finally { h.controller.dispose(); }
  });

  it("a new document resets seq, so its first click is not dropped as stale", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.key("Escape");
      h.controller.selectFrame(1, "hero");
      h.layout({ href: h.other.url });
      h.select(1, { href: h.other.url });
      expect(h.state().selection).toMatchObject({ tag: "span" });
    } finally { h.controller.dispose(); }
  });

  it("a transient folder error keeps the selection and its mark", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.updateEntries([{ path: "/repo", kind: "error", message: "busy" }]);
      expect(h.state()).toMatchObject({ error: "busy", selection: { tag: "span" } });
      expect(h.markOf("selected")?.hidden).toBe(false);
      expect(h.send).toHaveBeenCalledTimes(1);
    } finally { h.controller.dispose(); }
  });

  it.each<[string, FolderEntry]>([
    ["the canvas is gone from the list", { path: "/repo", kind: "list", servedRev: 0, canvases: [] }],
    ["the project is not found", { path: "/repo", kind: "notFound" }],
    ["the project is not initialized", { path: "/repo", kind: "uninitialized" }],
  ])("clears when %s", (_name, entry) => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.updateEntries([entry]);
      cleared(h);
    } finally { h.controller.dispose(); }
  });

  it("points an open canvas of an uninitialized project at Set Up… on Home", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.updateEntries([{ path: "/repo", kind: "uninitialized" }]);
      expect(h.state()).toMatchObject({ status: "missing", message: "The project repo is not set up. Use Set Up… on Home." });
    } finally { h.controller.dispose(); }
  });

  it("points a missing project at Locate…", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.updateEntries([{ path: "/repo", kind: "notFound" }]);
      expect(h.state().message).toBe("The project repo is missing. Use Locate… to find it.");
    } finally { h.controller.dispose(); }
  });

  it("clears when the project is closed", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.updateEntries([]);
      cleared(h);
    } finally { h.controller.dispose(); }
  });

  it("a hover redraws the mark without re-rendering React", () => {
    const h = selectionHarness();
    try {
      h.changed.mockClear();
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")?.hidden).toBe(false);
      expect(h.changed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("a select measured at another iframe height is kept without its rect until the next layout", () => {
    const h = selectionHarness();
    try {
      h.select(1, { viewport: 900 });
      expect(h.state().selection).toMatchObject({ tag: "span" });
      expect(h.markOf("selected")?.hidden ?? true).toBe(true);
      h.layout({ seq: 1, selected: h.target.rect });
      expect(h.markOf("selected")?.hidden).toBe(false);
    } finally { h.controller.dispose(); }
  });

  it("Esc in a text field of the app does not clear", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const event = new Event("keydown");
      Object.defineProperties(event, { key: { value: "Escape" }, target: { value: { tagName: "INPUT", isContentEditable: false } } });
      h.host.dispatchEvent(event);
      expect(h.state().selection).not.toBeNull();
    } finally { h.controller.dispose(); }
  });
});

describe("inspector rows from main", () => {
  afterEach(() => vi.unstubAllGlobals());
  const width: InspectRow = { group: "box", label: "Width", value: "60px", state: "hardcoded" };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("asks main for the selection's rows by its selector and shows them", async () => {
    const h = selectionHarness();
    try {
      h.select(1);
      expect(h.inspect).toHaveBeenCalledWith('[data-doan-id="cta"]');
      expect(h.state().inspector).toEqual({ status: "loading" });
      h.inspections[0]?.resolve({ ok: true, rows: [width] });
      await settle();
      expect(h.state().inspector).toEqual({ status: "ready", rows: [width] });
    } finally { h.controller.dispose(); }
  });

  it("drops an answer for a selection that has changed since", async () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.select(2, { target: { ...h.target, element: { ...h.target.element, selector: "body > p:nth-of-type(1)" } } });
      expect(h.inspections.map((call) => call.selector)).toEqual(['[data-doan-id="cta"]', "body > p:nth-of-type(1)"]);
      h.inspections[1]?.resolve({ ok: true, rows: [width] });
      h.inspections[0]?.resolve({ ok: true, rows: [] });
      await settle();
      expect(h.state().inspector).toEqual({ status: "ready", rows: [width] });
      h.key("Escape");
      expect(h.state().inspector).toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("drops an answer that arrives after the selection was cleared", async () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.key("Escape");
      h.inspections[0]?.resolve({ ok: true, rows: [width] });
      await settle();
      expect(h.state()).toMatchObject({ selection: null, inspector: null });
    } finally { h.controller.dispose(); }
  });

  it("shows main's reason when it cannot inspect, and a generic one when the call fails", async () => {
    const h = selectionHarness();
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      h.select(1);
      h.inspections[0]?.resolve({ ok: false, reason: "No element matches the selector." });
      await settle();
      expect(h.state().inspector).toEqual({ status: "failed", reason: "No element matches the selector." });
      h.select(2);
      h.inspections[1]?.reject(new Error("No handler registered for 'inspect:get'"));
      await settle();
      expect(h.state().inspector).toEqual({ status: "failed", reason: "The canvas could not be inspected." });
    } finally { h.controller.dispose(); vi.restoreAllMocks(); }
  });

  it("asks a frame selection by its own path selector and asks again after a reload finds it", () => {
    const h = selectionHarness();
    try {
      const { element: _element, ...frameTarget } = h.target;
      h.select(1, { target: { ...frameTarget, path: [{ label: "hero", selector: "body > section:nth-of-type(2)" }] } });
      expect(h.inspect).toHaveBeenLastCalledWith("body > section:nth-of-type(2)");
      h.controller.command("reload");
      h.layout();
      h.select(1, { target: { ...frameTarget, path: [{ label: "hero", selector: "body > section:nth-of-type(2)" }] } });
      expect(h.inspect).toHaveBeenCalledTimes(2);
    } finally { h.controller.dispose(); }
  });
});

describe("independent pending selection and hover commands", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["frame", "ancestor", "reload", "click"])("keeps a pending %s selection across Alt and leave", (kind) => {
    const h = selectionHarness();
    try {
      let selectionSeq = 1;
      if (kind === "ancestor" || kind === "reload") h.select(1);
      if (kind === "frame") h.controller.selectFrame(1, "hero");
      if (kind === "ancestor") { h.controller.selectPath(h.target.path[0]!); selectionSeq = 2; }
      if (kind === "reload") { h.controller.command("reload"); h.layout(); }
      h.receive({ type: "hover", seq: 0, rect: h.target.rect });
      h.host.dispatchEvent(new Event("pointermove"));
      h.key("Alt");
      h.host.dispatchEvent(Object.assign(new Event("keyup"), { key: "Alt" }));
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "hover-alt", alt: false, seq: 3 }, "*");
      h.select(selectionSeq, { target: { ...h.target, tag: "button" } });
      h.layout({ seq: selectionSeq, selected: h.target.rect });
      expect(h.state().selection?.tag).toBe("button");
      expect(h.markOf("selected")?.hidden).toBe(false);
      expect(h.inspect).toHaveBeenLastCalledWith(h.target.element.selector);
    } finally { h.controller.dispose(); }
  });

  it.each(["Escape", "new selection"])("still rejects a delayed selection after %s and hover commands", (action) => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.selectPath(h.target.path[0]!);
      if (action === "Escape") h.key("Escape");
      else h.controller.selectFrame(0, "intro");
      h.key("Alt");
      h.host.dispatchEvent(Object.assign(new Event("keyup"), { key: "Alt" }));
      h.select(2, { target: { ...h.target, tag: "stale" } });
      expect(h.state().selection?.tag).not.toBe("stale");
      if (action === "Escape") expect(h.state().selection).toBeNull();
      else {
        h.select(3, { target: { ...h.target, tag: "fresh" } });
        expect(h.state().selection?.tag).toBe("fresh");
      }
    } finally { h.controller.dispose(); }
  });
});

it("resets both channels on reload and rejects old-window, href and viewport hover", () => {
  const h = selectionHarness();
  try {
    h.select(8);
    h.receive({ type: "hover", seq: 9, rect: h.target.rect });
    const old = h.current();
    h.controller.command("reload");
    h.layout();
    expect(h.current()).not.toBe(old);
    expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "select-anchor", seq: 1 }), "*");
    h.key("Alt");
    expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "hover-alt", alt: true, seq: 1 }, "*");
    h.receive({ type: "key", key: "Alt", alt: false, seq: 1 });
    h.receive({ type: "hover", seq: 99, rect: h.target.rect }, old);
    h.receive({ type: "hover", seq: 99, rect: h.target.rect, href: h.other.url });
    h.receive({ type: "hover", seq: 99, rect: h.target.rect, viewport: 999 });
    expect(h.markOf("hover")?.hidden).toBe(true);
    h.select(1);
    h.receive({ type: "hover", seq: 1, rect: h.target.rect });
    expect(h.state().selection?.tag).toBe("span");
    expect(h.markOf("hover")?.hidden).toBe(false);
  } finally { h.controller.dispose(); }
});

// buzz-canvas-conversation keeps the anchors query and reply for chip locate: the controller asks for plain targets,
// takes only the newest reply for its own request in the current document, and jumps to a node it named.
describe("anchors channel", () => {
  const queries = (h: ReturnType<typeof selectionHarness>) => h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query");
  const reply = (q: { generation: number; request: number }, over: Record<string, unknown> = {}) => ({ type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: 1, width: 600, selectionSeq: 0, selected: null,
    results: [{ id: "chip", candidates: { frame: ["n1"] } }], rects: [{ node: "n1", x: 40, y: 3000, width: 200, height: 100 }], ...over });

  it("asks for plain targets, takes the reply and jumps to its node without selecting", () => {
    const h = selectionHarness();
    try {
      expect(h.controller.requestAnchors([{ id: "chip", frame: "hero" }])).toBeNull();
      expect(queries(h)).toEqual([]);
      h.layout({ document: "doc" });
      h.select(1);
      const selected = h.state().selection;
      const generation = h.controller.requestAnchors([{ id: "chip", frame: "hero" }]);
      const q = queries(h).at(-1);
      expect(q).toMatchObject({ document: "doc", generation, targets: [{ id: "chip", frame: "hero" }] });
      expect(h.controller.jumpToNode("n1", generation!)).toBe(false);
      h.receive(reply(q));
      h.send.mockClear(); h.current().contentWindow.postMessage.mockClear();
      const before = h.controller.currentView();
      expect(h.controller.jumpToNode("n1", generation!)).toBe(true);
      expect(h.controller.currentView()).toEqual(locateView({ x: 40, y: 3000, width: 200, height: 100 }, { width: 800, height: 600 }, before));
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
      expect(h.current().contentWindow.postMessage).not.toHaveBeenCalled();
      expect(h.send).not.toHaveBeenCalled();
      expect(h.state().selection).toEqual(selected);
      expect(h.controller.jumpToNode("missing", generation!)).toBe(false);
    } finally { h.controller.dispose(); }
  });

  it("rejects replies for another request, document, page, size or target set, and an older revision", () => {
    const h = selectionHarness();
    try {
      h.layout({ document: "doc" });
      const generation = h.controller.requestAnchors([{ id: "chip", frame: "hero" }])!;
      const q = queries(h).at(-1);
      for (const patch of [{ request: q.request - 1 }, { generation: q.generation - 1 }, { document: "old" }, { href: "http://localhost/other" }, { viewport: 149 }, { width: 599 },
        { results: [{ id: "other", candidates: { frame: ["n1"] } }] }, { results: [] }]) h.receive(reply(q, patch));
      expect(h.controller.jumpToNode("n1", generation)).toBe(false);
      h.receive(reply(q, { revision: 2 }));
      h.receive(reply(q, { revision: 1, rects: [] }));
      expect(h.controller.jumpToNode("n1", generation)).toBe(true);
    } finally { h.controller.dispose(); }
  });

  it("forgets the reply and its node tokens with the document", () => {
    const h = selectionHarness();
    try {
      h.layout({ document: "doc" });
      const generation = h.controller.requestAnchors([{ id: "chip", frame: "hero" }])!;
      const q = queries(h).at(-1);
      h.receive(reply(q));
      const old = h.current();
      h.controller.command("reload");
      h.receive(reply(q, { revision: 2 }), old);
      expect(h.controller.jumpToNode("n1", generation)).toBe(false);
      h.layout({ document: "doc2" });
      const next = h.controller.requestAnchors([{ id: "chip", frame: "hero" }])!;
      expect(next).not.toBe(generation);
      h.receive(reply(queries(h).at(-1), { document: "doc2" }));
      expect(h.controller.jumpToNode("n1", generation)).toBe(false);
      expect(h.controller.jumpToNode("n1", next)).toBe(true);
    } finally { h.controller.dispose(); }
  });
});


it("reports reanchoring while a reloaded canvas looks for the selection", () => {
  const h = selectionHarness();
  try {
    expect(h.state().reanchoring).toBe(false);
    h.select(1);
    h.controller.command("reload");
    expect(h.state().reanchoring).toBe(true);
    h.layout();
    expect(h.state().reanchoring).toBe(true);
    h.select(1);
    expect(h.state().reanchoring).toBe(false);
  } finally { h.controller.dispose(); }
});

// POSTMORTEM 2026-10-23 draft guards: opening stays synchronous, so Loading shows within the call.
it("opens another canvas synchronously", () => {
  const h = selectionHarness();
  try {
    h.controller.openCanvas("/repo", h.other);
    expect(h.state().status).toBe("loading");
    expect(h.state().open.canvas).toBe(h.other.path);
  } finally { h.controller.dispose(); }
});

// buzz-canvas-conversation X1 (POSTMORTEM 2026-10-23 draft guards): with the comment draft guard gone, opening,
// selecting, reloading and following a move still happen within the call, in the order they did without a draft.
describe("canvas open, select, reload and move without a draft guard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes the opened canvas before telling `opened`, then selects and clears within each event", () => {
    const h = selectionHarness();
    try {
      const order: string[] = [];
      h.changed.mockImplementation(state => order.push(`changed:${state.open?.canvas}:${state.status}`));
      h.controller.openCanvas("/repo", h.other, undefined, { opened: () => order.push("opened") });
      expect(order).toEqual([`changed:${h.other.path}:loading`, "opened"]);
      h.layout({ href: h.other.url });
      h.send.mockClear();
      h.select(1, { href: h.other.url });
      expect(h.state().selection?.element).toEqual(h.target.element);
      expect(h.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ canvas: { path: h.other.path, id: "b" } }));
      h.current().contentWindow.postMessage.mockClear();
      h.key("Escape");
      expect(h.state().selection).toBeNull();
      expect(h.current().contentWindow.postMessage).toHaveBeenCalledWith({ type: "clear", seq: 2 }, "*");
      expect(h.send).toHaveBeenLastCalledWith(null);
    } finally { h.controller.dispose(); }
  });

  it("shows a reload as reloading within the Reload command", () => {
    const h = selectionHarness();
    try {
      h.changed.mockClear();
      h.controller.command("reload");
      expect(h.changed).toHaveBeenCalled();
      expect(h.state()).toMatchObject({ status: null, reloading: true });
    } finally { h.controller.dispose(); }
  });

  it("follows a moved canvas within the folder update and asks the new document for the selection", () => {
    const h = selectionHarness();
    try {
      const moved = { ...h.row, path: ".doan/canvases/flows/a.html", url: "http://localhost/t/k/f/.doan/canvases/flows/a.html" };
      // The new path is published (its load) before the move is told.
      const followed = vi.fn(() => expect(h.state().open?.canvas).toBe(moved.path));
      h.controller.canvasMoved = followed;
      h.select(1);
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [moved, h.other] }]);
      expect(followed).toHaveBeenCalledExactlyOnceWith({ folder: "/repo", from: h.row.path, row: moved });
      expect(h.state()).toMatchObject({ open: { canvas: moved.path }, reanchoring: true });
      h.layout({ href: moved.url });
      expect(h.current().contentWindow.postMessage).toHaveBeenCalledWith({ type: "select-anchor", seq: 1, doanId: "cta", selector: '[data-doan-id="cta"]' }, "*");
    } finally { h.controller.dispose(); }
  });
});

it("switches workspaces and restores the previous canvas view", () => {
  const { controller, row, changed, board } = loadedController();
  try {
    const other = { ...row, url: "http://localhost/other.html" };
    controller.updateEntries([
      { path: "/repo", kind: "list", servedRev: 0, canvases: [row] },
      { path: "/other", kind: "list", servedRev: 0, canvases: [other] },
    ]);
    controller.command("actualSize");
    controller.wheel({ dx: 20, dy: 30, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
    const before = board.style.transform;
    const entered = vi.fn();
    controller.openWorkspace("/other", entered);
    expect(entered).toHaveBeenCalledWith("/other");
    expect(changed.mock.lastCall?.[0].open).toBeNull();
    controller.openWorkspace("/repo", entered);
    expect(changed.mock.lastCall?.[0].open?.folder).toBe("/repo");
    expect(board.style.transform).toEqual(before);
  } finally { controller.dispose(); }
});

it("opens a workspace whose project is still being read once the read lists it", () => {
  const { controller, row, changed } = loadedController();
  try {
    const repo: FolderEntry = { path: "/repo", kind: "list", servedRev: 0, canvases: [row] };
    controller.updateEntries([repo, { path: "/added", kind: "loading" }]);
    const entered = vi.fn();
    controller.openWorkspace("/added", entered);
    expect(entered).not.toHaveBeenCalled();
    expect(changed.mock.lastCall?.[0].open?.folder).toBe("/repo");
    controller.updateEntries([repo, { path: "/added", kind: "list", servedRev: 0, canvases: [] }]);
    expect(entered).toHaveBeenCalledExactlyOnceWith("/added");
    expect(changed.mock.lastCall?.[0].open).toBeNull();
    controller.updateEntries([repo, { path: "/added", kind: "list", servedRev: 1, canvases: [] }]);
    expect(entered).toHaveBeenCalledOnce();
  } finally { controller.dispose(); }
});

it("drops a waiting workspace open when a later navigation, a failed read or leaving the workspace supersedes it", () => {
  const { controller, row } = loadedController();
  try {
    const repo: FolderEntry = { path: "/repo", kind: "list", servedRev: 0, canvases: [row] };
    const listed: FolderEntry = { path: "/added", kind: "list", servedRev: 0, canvases: [] };
    const entered = vi.fn();
    const supersede = [
      () => controller.openCanvas("/repo", { ...row, path: ".doan/canvases/b.html", url: "http://localhost/b.html" }),
      () => controller.updateEntries([repo, { path: "/added", kind: "error", message: "bad config" }]),
      () => controller.setWorkspaceActive(false),
    ];
    for (const later of supersede) {
      controller.updateEntries([repo, { path: "/added", kind: "loading" }]);
      controller.openWorkspace("/added", entered);
      later();
      controller.updateEntries([repo, listed]);
      controller.setWorkspaceActive(true);
    }
    expect(entered).not.toHaveBeenCalled();
  } finally { controller.dispose(); }
});


// buzz-canvas R6: Fit and frame jumps keep the board's safe area (top 56, sides 32, bottom 64), not today's even 32.
describe("Fit and frame jumps inside FIT_INSET", () => {
  const size = { width: 800, height: 600 };
  const tall = (height: number) => [{ id: "tall", x: 0, y: 0, width: 10, height }];

  it("fits a freshly opened canvas below the header's height", () => {
    const h = selectionHarness();
    try {
      expect(h.controller.currentView()).toEqual(fitWidth(600, size, FIT_INSET));
      expect(h.controller.currentView().y).toBe(56);
    } finally { h.controller.dispose(); }
  });

  it("the Fit command returns to the same view after a pan", () => {
    const h = selectionHarness();
    try {
      h.controller.wheel({ dx: 40, dy: 90, ctrl: false, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
      h.controller.command("fit");
      expect(h.controller.currentView()).toEqual(fitWidth(600, size, FIT_INSET));
    } finally { h.controller.dispose(); }
  });

  // The band the old even margin got wrong: a frame between the safe height (480) and 536 was centred, so its top
  // sat under the 56px header band and its bottom reached the toolbar. FIT_INSET reads it from the top.
  it("a jump to a frame in the tall band puts its top edge 56px down", () => {
    const h = selectionHarness();
    try {
      h.layout({ frames: tall(500) });
      h.controller.jump(0);
      h.layout({ frames: tall(500) });
      expect(h.controller.currentView()).toEqual(fitFrame({ x: 0, y: 0, width: 10, height: 500 }, size, FIT_INSET, { x: 0, y: 0, scale: 1 }));
      expect(h.controller.currentView().y).toBe(56);
    } finally { h.controller.dispose(); }
  });

  it("a jump to a frame that fits the safe area centres it between the header and the toolbar", () => {
    const h = selectionHarness();
    try {
      h.layout({ frames: tall(100) });
      h.controller.jump(0);
      h.layout({ frames: tall(100) });
      // Safe area y 56..536: its centre is 296, the frame's 50px.
      expect(h.controller.currentView().y).toBe(246);
    } finally { h.controller.dispose(); }
  });

  it("the drawer's selectFrame jump uses the same inset", () => {
    const h = selectionHarness();
    try {
      h.layout({ frames: tall(2000) });
      h.controller.selectFrame(0, "tall");
      h.layout({ frames: tall(2000) });
      expect(h.controller.currentView().y).toBe(56);
    } finally { h.controller.dispose(); }
  });
});

describe("frame navigation", () => {
  it("jumps without a selection command or main selection update", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const selected = h.state().selection;
      h.send.mockClear();
      h.current().contentWindow.postMessage.mockClear();
      h.controller.jump(0);
      expect(h.current().contentWindow.postMessage.mock.calls.map(call => call[0])).toEqual([{ type: "measure" }]);
      h.layout();
      expect(h.state().selection).toEqual(selected);
      expect(h.state().currentFrame).toBe(0);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
    } finally { h.controller.dispose(); }
  });

  it("keeps the same canvas and selection when it is opened again", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.openCanvas("/repo", h.row);
      expect(h.frames).toHaveLength(1);
      expect(h.state().selection?.tag).toBe("span");
    } finally { h.controller.dispose(); }
  });

  it("holds the jump mark for 1.2 seconds and removes it on disposal", () => {
    vi.useFakeTimers();
    const h = selectionHarness();
    try {
      h.controller.jump(0);
      h.layout();
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
      vi.advanceTimersByTime(1199);
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(h.markOf("jump-highlight")?.hidden).toBe(true);
      h.controller.jump(1); h.layout();
      h.controller.dispose();
      expect(h.overlay.append.mock.calls.at(-1)?.[0].hidden).toBe(true);
    } finally { h.controller.dispose(); vi.useRealTimers(); }
  });
});


it("sends Select to the canvas at once and the selection to main only after its acknowledgement", () => {
  const h = selectionHarness();
  try {
    h.current().contentWindow.postMessage.mockClear();
    h.send.mockClear();
    h.controller.selectFrame(0, "intro");
    expect(h.current().contentWindow.postMessage.mock.calls.map(call => call[0])).toContainEqual({ type: "pick-frame", seq: 1, index: 0, id: "intro" });
    expect(h.send).not.toHaveBeenCalled();
    h.select(1, { target: { ...h.target, element: undefined, frame: { id: "intro" }, frameIndex: 0 } });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ frame: { id: "intro" } }));
  } finally { h.controller.dispose(); }
});

it("opens a static frame by its first rendered id match without selecting it", () => {
  const h = selectionHarness();
  try {
    h.controller.openCanvas("/repo", h.other, "dup");
    h.layout({ href: h.other.url, frames: [
      { id: "different", x: 0, y: 0, width: 100, height: 100 },
      { id: "dup", x: 0, y: 1000, width: 100, height: 100 },
      { id: "dup", x: 0, y: 2000, width: 100, height: 100 },
    ] });
    expect(h.state().currentFrame).toBe(1);
    expect(h.state().selection).toBeNull();
    expect(h.current().contentWindow.postMessage.mock.calls.some(([message]) => message.type === "pick-frame")).toBe(false);
  } finally { h.controller.dispose(); }
});


it.each(["dup", ""])("opens the clicked static index when its id is %j", id => {
  const h = selectionHarness();
  try {
    const found = vi.fn();
    h.controller.openCanvas("/repo", h.other, id, { index: 1, found });
    h.layout({ href: h.other.url, frames: [
      { id, x: 0, y: 0, width: 100, height: 100 },
      { id, x: 0, y: 1000, width: 100, height: 100 },
    ] });
    expect(h.state().currentFrame).toBe(1);
    expect(found).toHaveBeenCalledExactlyOnceWith(true);
  } finally { h.controller.dispose(); }
});

it("reports a missing rendered frame and falls back to the first id match after reordering", () => {
  const h = selectionHarness();
  try {
    const found = vi.fn();
    h.controller.openCanvas("/repo", h.other, "hero", { index: 0, found });
    h.layout({ href: h.other.url });
    expect(h.state().currentFrame).toBe(1);
    expect(found).toHaveBeenCalledExactlyOnceWith(true);
    const missing = vi.fn();
    h.controller.openCanvas("/repo", h.other, "absent", { found: missing });
    expect(missing).toHaveBeenCalledExactlyOnceWith(false);
  } finally { h.controller.dispose(); }
});

it("keeps a picked frame through a live reload of the same canvas before its first layout", () => {
  const h = selectionHarness();
  try {
    const found = vi.fn();
    h.controller.openCanvas("/repo", h.other, "hero", { found });
    h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [h.row, h.other] }]);
    expect(found).not.toHaveBeenCalled();
    h.layout({ href: h.other.url });
    expect(h.state().currentFrame).toBe(1);
    expect(found).toHaveBeenCalledExactlyOnceWith(true);
    // A reload that loses the width still answers the pick.
    const missing = vi.fn();
    h.controller.openCanvas("/repo", h.row, "hero", { found: missing });
    const { width: _width, ...noWidth } = h.row;
    h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 2, canvases: [noWidth, h.other] }]);
    expect(missing).toHaveBeenCalledExactlyOnceWith(false);
  } finally { h.controller.dispose(); }
});

it("forgets navigation memory when a project is removed and added again", () => {
  const h = selectionHarness();
  try {
    const original: FolderEntry = { path: "/repo", kind: "list", servedRev: 0, canvases: [h.row, h.other] };
    const other: FolderEntry = { path: "/other", kind: "list", servedRev: 0, canvases: [] };
    h.controller.updateEntries([original, other]);
    h.controller.openWorkspace("/other", () => {});
    h.controller.openWorkspace("/repo", () => {});
    expect(h.state().open.canvas).toBe(h.row.path);
    h.controller.updateEntries([other]);
    h.controller.updateEntries([original, other]);
    h.controller.openWorkspace("/repo", () => {});
    expect(h.state().open).toBeNull();
  } finally { h.controller.dispose(); }
});

it("reports the open canvas leaving its folder's list, but not a closed project", () => {
  const h = selectionHarness();
  try {
    const removed = vi.fn();
    h.controller.canvasRemoved = removed;
    h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [h.other] }]);
    expect(removed).toHaveBeenCalledWith({ folder: "/repo", row: expect.objectContaining({ path: h.row.path }), duplicates: null });
    expect(h.state().open).toBeNull();
    h.controller.openCanvas("/repo", h.other);
    h.controller.updateEntries([]);
    expect(removed).toHaveBeenCalledTimes(1);
  } finally { h.controller.dispose(); }
});

it("persisted per-root memory reopens its canvas with its view, and null forgets it", () => {
  const h = selectionHarness();
  try {
    const other: FolderEntry = { path: "/other", kind: "list", servedRev: 0, canvases: [] };
    h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [h.row, h.other] }, other]);
    h.controller.openWorkspace("/other", () => {});
    expect(h.controller.memory()).toEqual({ "/repo": { canvas: h.row.path, view: expect.objectContaining({ scale: expect.any(Number) }) } });
    const view = { scale: 0.5, x: 12, y: -40 };
    h.controller.remember("/repo", { canvas: h.other.path, view });
    h.controller.openWorkspace("/repo", () => {});
    expect(h.state().open.canvas).toBe(h.other.path);
    expect(h.controller.currentView()).toEqual(view);
    h.controller.remember("/other", null);
    expect(Object.keys(h.controller.memory())).toEqual(["/repo"]);
  } finally { h.controller.dispose(); }
});

it("does not diagnose missing markup when the board width could not be read", () => {
  const h = loadedController();
  try {
    const { width, ...row } = h.row;
    h.controller.updateEntries([{ kind: "list", path: "/repo", servedRev: 1, canvases: [row] }]);
    expect(h.changed.mock.lastCall?.[0].message).toBe("Could not read a valid board width. Run doan check in a terminal to diagnose the canvas.");
  } finally { h.controller.dispose(); }
});

it("reports a non-list Added Open target immediately or after loading", () => {
  const h = loadedController();
  try {
    const repo: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const problem: FolderEntry = { kind: "uninitialized", path: "/added" };
    const entered = vi.fn(), unavailable = vi.fn();
    h.controller.updateEntries([repo, problem]);
    h.controller.openWorkspace("/added", entered, false, unavailable);
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(problem);
    unavailable.mockClear();
    h.controller.updateEntries([repo, { kind: "loading", path: "/added" }]);
    h.controller.openWorkspace("/added", entered, false, unavailable);
    expect(unavailable).not.toHaveBeenCalled();
    h.controller.updateEntries([repo, problem]);
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(problem);
    expect(entered).not.toHaveBeenCalled();
    expect(h.changed.mock.lastCall?.[0].open?.folder).toBe("/repo");
  } finally { h.controller.dispose(); }
});

it("does not apply Added Open recovery after a newer navigation", () => {
  const h = loadedController();
  try {
    const repo: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const unavailable = vi.fn();
    h.controller.updateEntries([repo, { kind: "loading", path: "/added" }]);
    h.controller.openWorkspace("/added", vi.fn(), false, unavailable);
    h.controller.showOverview();
    h.controller.updateEntries([repo, { kind: "uninitialized", path: "/added" }]);
    expect(unavailable).not.toHaveBeenCalled();
  } finally { h.controller.dispose(); }
});

it("reports a canvas that left the list before it opens, and keeps the open one", () => {
  const h = loadedController();
  try {
    const target = { ...h.row, path: ".doan/canvases/next.html", url: "http://localhost/next.html" };
    h.controller.updateEntries([{ kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] }]);
    const unavailable = vi.fn(), opened = vi.fn();
    h.controller.openCanvas("/repo", target, undefined, { unavailable, opened });
    expect(unavailable).toHaveBeenCalledExactlyOnceWith({ kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] });
    expect(opened).not.toHaveBeenCalled();
    expect(h.changed.mock.lastCall?.[0].open?.canvas).toBe(h.row.path);
  } finally { h.controller.dispose(); }
});

it("leaving the workspace supersedes a waiting Added recovery", () => {
  const h = loadedController();
  try {
    const repo: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    h.controller.updateEntries([repo, { path: "/added", kind: "loading" }]);
    const unavailable = vi.fn();
    h.controller.openWorkspace("/added", vi.fn(), false, unavailable);
    h.controller.setWorkspaceActive(false);
    h.controller.updateEntries([repo, { path: "/added", kind: "uninitialized" }]);
    expect(unavailable).not.toHaveBeenCalled();
  } finally { h.controller.dispose(); }
});


it.each(["id", "url"])("reports a %s that changed while its workspace was read, without opening it", field => {
  const h = loadedController();
  try {
    const source: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const row = { ...h.row, id: "original" };
    const target: FolderEntry = { kind: "list", path: "/target", servedRev: 0, canvases: [row] };
    h.controller.updateEntries([source, { kind: "loading", path: "/target" }]);
    const messages: string[] = [];
    const unavailable = (entry: FolderEntry | undefined) => messages.push(unavailableCanvasMessage(entry, row.path));
    h.controller.openWorkspace("/target", root => h.controller.openCanvas(root, row, undefined, { unavailable }), false, unavailable);
    expect(messages).toEqual([]);
    h.controller.updateEntries([source, { ...target, canvases: [{ ...row, [field]: "changed" }] }]);
    expect(messages).toEqual(["Canvas changed while opening. Choose it again from the sidebar or Quick Open."]);
    expect(h.changed.mock.lastCall?.[0].open).toBeNull();
  } finally { h.controller.dispose(); }
});

it.each(["cliError", "missing-path", "removed"])("passes the consumed %s entry to the waiting Open callback before returning", kind => {
  const h = loadedController();
  try {
    const source: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const target: FolderEntry = { kind: "list", path: "/target", servedRev: 0, canvases: [h.row] };
    h.controller.updateEntries([source, { kind: "loading", path: "/target" }]);
    const unavailable = vi.fn();
    h.controller.openWorkspace("/target", root => h.controller.openCanvas(root, h.row, undefined, { unavailable }), false, unavailable);
    expect(unavailable).not.toHaveBeenCalled();
    const latest: FolderEntry | undefined = kind === "removed" ? undefined : kind === "missing-path" ? { ...target, canvases: [] } : { kind: "cliError", path: "/target", reason: "failed" };
    h.controller.updateEntries(latest ? [source, latest] : [source]);
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(latest);
  } finally { h.controller.dispose(); }
});

describe("a canvas moved with the same id", () => {
  afterEach(() => vi.unstubAllGlobals());
  function movedHarness() {
    const h = selectionHarness();
    const moved = { ...h.row, path: ".doan/canvases/flows/a.html", url: "http://localhost/t/k/f/.doan/canvases/flows/a.html" };
    const removed = vi.fn(), followed = vi.fn();
    h.controller.canvasRemoved = removed;
    h.controller.canvasMoved = followed;
    const list = (...canvases: object[]) => [{ path: "/repo", kind: "list" as const, servedRev: 0, canvases }] as FolderEntry[];
    return { ...h, moved, removed, followed, list };
  }

  it("keeps the canvas open at its new path with the view, and finds the selection again there", () => {
    const h = movedHarness();
    try {
      h.select(1);
      h.controller.wheel({ dx: 30, dy: 40, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
      const transform = h.board.style.transform, old = h.current();
      h.controller.updateEntries(h.list(h.moved, h.other));
      expect(h.current()).not.toBe(old);
      expect(h.board.style.transform).toBe(transform);
      expect(h.state()).toMatchObject({ open: { folder: "/repo", canvas: h.moved.path, row: h.moved }, shown: h.moved.path, reanchoring: true, status: null });
      expect(h.removed).not.toHaveBeenCalled();
      expect(h.followed).toHaveBeenCalledExactlyOnceWith({ folder: "/repo", from: h.row.path, row: h.moved });
      // While the new document is asked for the anchor, main already has the new path with the old selectors.
      expect(h.send).toHaveBeenLastCalledWith({ root: "/repo", canvas: { path: h.moved.path, id: "a" }, frame: { id: "hero" }, element: h.target.element });
      h.layout({ href: h.moved.url });
      expect(h.current().contentWindow.postMessage).toHaveBeenCalledWith({ type: "select-anchor", seq: 1, doanId: "cta", selector: '[data-doan-id="cta"]' }, "*");
      h.select(1, { href: h.moved.url });
      expect(h.state()).toMatchObject({ reanchoring: false, notice: "" });
      expect(h.state().selection).toMatchObject({ element: h.target.element });
      expect(h.board.style.transform).toBe(transform);
      const frames = h.frames.length;
      h.controller.openCanvas("/repo", h.moved);
      expect(h.frames).toHaveLength(frames);
    } finally { h.controller.dispose(); }
  });

  it("moves the activity to the new path and adds Moved once", () => {
    const h = movedHarness();
    try {
      h.controller.updateEntries(h.list(h.moved, h.other));
      h.layout({ href: h.moved.url });
      const activity = h.state().activity;
      expect(activityFor(activity, "/repo", h.moved.path, "a").map(event => [event.kind, event.from])).toEqual([["moved", h.row.path], ["opened", undefined]]);
    } finally { h.controller.dispose(); }
  });

  // Activity is keyed by (root, canvas id) (R-B7 3); the path is only where it was.
  it("does not give a new canvas id at a reused path the previous id's history, before or after a move", () => {
    const h = movedHarness();
    try {
      const replacement = { ...h.row, id: "replacement" };
      h.controller.updateEntries(h.list(replacement, h.other));
      h.layout();
      expect(activityFor(h.state().activity, "/repo", h.row.path, "replacement").map(event => event.kind)).toEqual(["reloaded"]);
      const moved = { ...replacement, path: ".doan/canvases/new.html", url: "http://localhost/t/k/f/.doan/canvases/new.html" };
      h.controller.updateEntries(h.list(moved, h.other));
      h.layout({ href: moved.url });
      expect(activityFor(h.state().activity, "/repo", moved.path, "replacement").map(event => event.kind)).toEqual(["moved", "reloaded"]);
      expect(activityFor(h.state().activity, "/repo", h.row.path, "a").map(event => event.kind)).toEqual(["opened"]);
    } finally { h.controller.dispose(); }
  });

  it("keeps the history of a canvas left at the destination path under its own id", () => {
    const h = movedHarness();
    try {
      h.controller.openCanvas("/repo", h.other);
      h.layout({ href: h.other.url });
      h.controller.openCanvas("/repo", h.row);
      h.layout();
      const moved = { ...h.row, path: h.other.path, url: h.other.url };
      h.controller.updateEntries(h.list(moved, { ...h.other, path: ".doan/canvases/c.html", url: "http://localhost/t/k/f/.doan/canvases/c.html" }));
      expect(activityFor(h.state().activity, "/repo", h.other.path, "a").map(event => event.kind)).toEqual(["moved", "opened", "opened"]);
      expect(activityFor(h.state().activity, "/repo", ".doan/canvases/c.html", "b").map(event => event.kind)).toEqual(["opened"]);
    } finally { h.controller.dispose(); }
  });

  it("shows the selection-lost notice when the moved document no longer has the anchor", () => {
    const h = movedHarness();
    try {
      h.select(1);
      h.controller.updateEntries(h.list(h.moved, h.other));
      h.layout({ href: h.moved.url });
      h.select(1, { href: h.moved.url, target: null });
      expect(h.state()).toMatchObject({ selection: null, notice: SELECTION_LOST, reanchoring: false });
    } finally { h.controller.dispose(); }
  });

  it("reloads once when the rename and a content change arrive in one update", () => {
    const h = movedHarness();
    try {
      const frames = h.frames.length;
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 3, canvases: [{ ...h.moved, rev: 4 }, h.other] }]);
      expect(h.frames).toHaveLength(frames + 1);
      expect(h.followed).toHaveBeenCalledOnce();
      expect(h.state().activity.filter((event: { kind: string }) => event.kind === "moved")).toHaveLength(1);
    } finally { h.controller.dispose(); }
  });

  it("closes with the duplicate count when several canvases now use the id", () => {
    const h = movedHarness();
    try {
      h.select(1);
      h.controller.updateEntries(h.list(h.moved, { ...h.moved, path: ".doan/canvases/copy.html", url: "http://localhost/t/k/f/.doan/canvases/copy.html" }, h.other));
      expect(h.removed).toHaveBeenCalledExactlyOnceWith({ folder: "/repo", row: h.row, duplicates: 2 });
      expect(h.followed).not.toHaveBeenCalled();
      expect(h.state()).toMatchObject({ open: null, selection: null, status: "missing" });
    } finally { h.controller.dispose(); }
  });

  it("clears the selection when another canvas id now sits at the same path", () => {
    const h = movedHarness();
    try {
      h.select(1);
      const old = h.current();
      h.controller.updateEntries(h.list({ ...h.row, id: "replaced" }, h.other));
      expect(h.current()).not.toBe(old);
      expect(h.state()).toMatchObject({ selection: null, notice: "", reanchoring: false, open: { canvas: h.row.path, row: { id: "replaced" } } });
      expect(h.send).toHaveBeenLastCalledWith(null);
      expect(h.followed).not.toHaveBeenCalled();
      expect(h.removed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });
});

describe("Activity", () => {
  function activityHarness() {
    const h = selectionHarness();
    const list = (...canvases: object[]) => [{ path: "/repo", kind: "list" as const, servedRev: 0, canvases }] as FolderEntry[];
    return { ...h, list };
  }

  it("records a reload as Changed when the row revision moved, counting a missing one as 0, and as Reloaded otherwise", () => {
    const h = activityHarness();
    const kinds = () => activityFor(h.state().activity, "/repo", h.row.path, "a").map(event => event.kind);
    try {
      // ARCH §13: a row without rev has not changed since the folder was added.
      h.controller.updateEntries(h.list({ ...h.row, rev: 1 }, h.other));
      h.layout();
      expect(kinds()).toEqual(["changed", "opened"]);
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [{ ...h.row, rev: 1 }, h.other] }]);
      h.layout();
      expect(kinds()).toEqual(["reloaded", "changed", "opened"]);
      h.controller.command("reload");
      h.layout();
      expect(kinds()[0]).toBe("reloaded");
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [{ ...h.row, rev: 2 }, h.other] }]);
      h.layout();
      expect(kinds()[0]).toBe("changed");
    } finally { h.controller.dispose(); }
  });

  it("keeps Changed when a plain reload replaces a changed one before it lays out", () => {
    const h = activityHarness();
    try {
      h.controller.updateEntries(h.list({ ...h.row, rev: 1 }, h.other));
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [{ ...h.row, rev: 1 }, h.other] }]);
      h.layout();
      expect(activityFor(h.state().activity, "/repo", h.row.path, "a").map(event => event.kind)).toEqual(["changed", "opened"]);
    } finally { h.controller.dispose(); }
  });


});

describe("Escape and a blank click without a selection (L-17)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const escapeKey = () => Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
  function waiting(h: ReturnType<typeof selectionHarness>) {
    const entered = vi.fn();
    const repo: FolderEntry = { path: "/repo", kind: "list", servedRev: 0, canvases: [h.row, h.other] };
    h.controller.updateEntries([repo, { path: "/added", kind: "loading" }]);
    h.controller.openWorkspace("/added", entered);
    return { entered, listed: () => h.controller.updateEntries([repo, { path: "/added", kind: "list", servedRev: 0, canvases: [] }]) };
  }

  it("does not prevent Escape, and still cancels a waiting Open", () => {
    const h = selectionHarness();
    try {
      const open = waiting(h);
      const event = escapeKey();
      h.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      open.listed();
      expect(open.entered).not.toHaveBeenCalled();
      expect(h.state().open.canvas).toBe(h.row.path);
    } finally { h.controller.dispose(); }
  });

  it("an Escape forwarded from the canvas and a blank margin click cancel a waiting Open too", () => {
    for (const act of [(h: ReturnType<typeof selectionHarness>) => h.receive({ type: "key", seq: 0, key: "Escape" }),
      (h: ReturnType<typeof selectionHarness>) => h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0 }))]) {
      const h = selectionHarness();
      try {
        const open = waiting(h);
        act(h);
        open.listed();
        expect(open.entered).not.toHaveBeenCalled();
      } finally { h.controller.dispose(); }
    }
  });

  it("clears a selection the reloaded canvas looks for at once", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.command("reload");
      expect(h.state().reanchoring).toBe(true);
      const event = escapeKey();
      h.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(h.state().reanchoring).toBe(false);
      expect(h.state().selection).toBeNull();
    } finally { h.controller.dispose(); }
  });
});

describe("layout height without animation frames (150 px reload stall)", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("asks a document whose first layout was measured before it had a viewport to measure again", () => {
    vi.useFakeTimers();
    const h = selectionHarness();
    const measures = () => h.current().contentWindow.postMessage.mock.calls.map(call => call[0]).filter(message => message.type === "measure");
    try {
      h.controller.command("reload");
      h.layout({ document: "two", viewport: 0, height: 0 });
      expect(h.current().style).toMatchObject({ height: "150px" });
      h.current().contentWindow.postMessage.mockClear();
      vi.advanceTimersByTime(50);
      expect(measures()).toEqual([{ type: "measure" }]);
      h.layout({ document: "two", viewport: 150, height: 2600 });
      expect(h.current().style).toMatchObject({ height: "2600px" });
      h.current().contentWindow.postMessage.mockClear();
      vi.advanceTimersByTime(50);
      h.layout({ document: "two", viewport: 2600, height: 2600 });
      vi.advanceTimersByTime(1000);
      expect(measures()).toEqual([{ type: "measure" }]);
    } finally { h.controller.dispose(); }
  });
});

describe("feedback navigation callbacks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells `opened` once the open ran, and at once when the canvas is already shown", () => {
    const h = selectionHarness();
    try {
      const opened = vi.fn(() => expect(h.state().open?.canvas).toBe(".doan/canvases/b.html"));
      h.controller.openCanvas("/repo", h.other, undefined, { opened });
      expect(opened).toHaveBeenCalledTimes(1);
      // Already shown: no transition, told at once.
      h.controller.openCanvas("/repo", h.other, undefined, { opened });
      expect(opened).toHaveBeenCalledTimes(2);
    } finally { h.controller.dispose(); }
  });

  it("tells `shown` once the Overview is shown, at once when it already is", () => {
    const h = selectionHarness();
    try {
      const shown = vi.fn(() => expect(h.state().open).toBeNull());
      h.controller.showOverview(shown);
      expect(shown).toHaveBeenCalledTimes(1);
      h.controller.showOverview(shown);
      expect(shown).toHaveBeenCalledTimes(2);
    } finally { h.controller.dispose(); }
  });
});

it("opens an explicit Overview in one workspace transition", () => {
  const { controller, row, changed } = loadedController();
  try {
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/other", kind: "list", servedRev: 0, canvases: [row] }]);
    controller.remember("/other", { canvas: row.path, view: { x: 1, y: 2, scale: 1 } });
    const entered = vi.fn();
    controller.openWorkspace("/other", entered, false, undefined, true);
    expect(entered).toHaveBeenCalledOnce();
    expect(changed.mock.calls.at(-1)?.[0].open).toBeNull();
  } finally { controller.dispose(); }
});

it("remembers the source view when an explicit canvas opens in another workspace", () => {
  const { controller, row } = loadedController();
  try {
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/other", kind: "list", servedRev: 0, canvases: [row] }]);
    const view = controller.currentView();
    expect(controller.memory()["/repo"]).toBeUndefined();
    controller.openCanvas("/other", row);
    expect(controller.memory()["/repo"]).toEqual({ canvas: row.path, view });
  } finally { controller.dispose(); }
});

it("repicking the current canvas cancels an older waiting worktree selection", () => {
  const { controller, row } = loadedController();
  try {
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/waiting", kind: "loading" }]);
    const entered = vi.fn();
    controller.openWorkspace("/waiting", entered);
    controller.openCanvas("/repo", row);
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/waiting", kind: "list", servedRev: 0, canvases: [] }]);
    expect(entered).not.toHaveBeenCalled();
    expect(controller.destination("/repo")).toEqual({ root: "/repo", canvas: row.path });
  } finally { controller.dispose(); }
});

it("repicking the current Overview cancels an older waiting worktree selection", () => {
  const { controller, row } = loadedController();
  try {
    controller.showOverview();
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/waiting", kind: "loading" }]);
    const entered = vi.fn();
    controller.openWorkspace("/waiting", entered);
    controller.showOverview();
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/waiting", kind: "list", servedRev: 0, canvases: [] }]);
    expect(entered).not.toHaveBeenCalled();
  } finally { controller.dispose(); }
});

it("remembers the same-workspace Overview source and restores it after another workspace", () => {
  const { controller, row } = loadedController();
  try {
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }, { path: "/other", kind: "list", servedRev: 0, canvases: [] }]);
    const previous = { canvas: ".doan/canvases/old.html", view: { x: 9, y: 8, scale: 2 } };
    controller.remember("/repo", previous);
    controller.wheel({ dx: 25, dy: 40, ctrl: false, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
    controller.wheel({ dx: 0, dy: -20, ctrl: true, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
    const view = controller.currentView();
    expect(controller.memory()["/repo"]).toEqual(previous);
    expect(controller.destination("/repo")).toEqual({ root: "/repo", canvas: row.path });
    controller.showOverview();
    expect(controller.memory()["/repo"]).toEqual({ canvas: row.path, view });
    controller.openWorkspace("/other", () => {});
    controller.openWorkspace("/repo", () => {});
    expect(controller.destination("/repo")).toEqual({ root: "/repo", canvas: row.path });
    expect(controller.currentView()).toEqual(view);
  } finally { controller.dispose(); }
});

it("reports a completed listed iframe link once, excluding reloads and unlisted destinations", () => {
  const h = selectionHarness();
  const visited = vi.fn(() => h.controller.destination("/repo"));
  h.controller.linkedCanvas = visited;
  try {
    h.layout();
    expect(visited).not.toHaveBeenCalled();
    h.layout({ href: h.other.url });
    expect(visited).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(visited.mock.results[0]?.value).toEqual({ root: "/repo", canvas: h.other.path });
    h.layout({ href: h.other.url });
    expect(visited).toHaveBeenCalledTimes(1);
    h.layout({ href: h.other.url.replace("b.html", "unlisted.html") });
    expect(visited).toHaveBeenCalledTimes(1);
  } finally { h.controller.dispose(); }
});

it("opens another canvas of the open root at once, and only tells `opened` for the open canvas itself", () => {
  const h = selectionHarness();
  try {
    const opened = vi.fn();
    h.controller.openCanvas("/repo", h.row, undefined, { opened });
    expect(opened).toHaveBeenCalledOnce();
    expect(h.frames).toHaveLength(1);
    h.controller.openCanvas("/repo", h.other, undefined, { opened });
    expect(opened).toHaveBeenCalledTimes(2);
    expect(h.frames).toHaveLength(2);
    expect(h.state().open.canvas).toBe(h.other.path);
  } finally { h.controller.dispose(); vi.unstubAllGlobals(); }
});

// buzz-canvas design §2 '첫 Fit': a canvas opened under the Overview is fitted to the board the canvas page lays out
// (its panel width, or none when folded), not to the Overview's layout; later width changes keep the view's top-left.
describe("first Fit", () => {
  function opened(width: number) {
    const host = new EventTarget();
    vi.stubGlobal("window", host);
    const frame = Object.assign(new EventTarget(), { contentWindow: { postMessage: vi.fn() }, style: {}, setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() });
    vi.stubGlobal("document", { createElement: () => frame });
    const viewport = Object.assign(new EventTarget(), { clientWidth: width, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
    const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
    const controller = new CanvasController(viewport, board, { append: vi.fn() }, vi.fn(), vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
    const row = { path: ".doan/canvases/a.html", url: "http://localhost/a.html", width: 1200 };
    const other = { ...row, path: ".doan/canvases/b.html", url: "http://localhost/b.html" };
    controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row, other] }, { path: "/other", kind: "list", servedRev: 0, canvases: [other] }]);
    controller.openCanvas("/repo", row);
    return { controller, viewport, board, row, other };
  }
  const fittedAt = (width: number) => { const h = opened(width); try { return h.board.style.transform; } finally { h.controller.dispose(); } };

  it("is computed again once the canvas page's column is applied", () => {
    const expected = fittedAt(500);
    const h = opened(800);
    try {
      expect(h.board.style.transform).not.toBe(expected);
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      expect(h.board.style.transform).toBe(expected);
    } finally { h.controller.dispose(); }
  });

  it("settles inside FIT_INSET: the top edge 56px down", () => {
    const h = opened(800);
    try {
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      expect(h.controller.currentView()).toEqual(fitWidth(1200, { width: 500, height: 600 }, FIT_INSET));
    } finally { h.controller.dispose(); }
  });

  it("settles once: a later width change keeps the view's top-left instead of fitting again", () => {
    const h = opened(800);
    try {
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      const settled = h.board.style.transform;
      h.viewport.clientWidth = 900;
      h.controller.settleFit();
      expect(h.board.style.transform).toBe(settled);
    } finally { h.controller.dispose(); }
  });

  it("does not replace a view the person moved before it settled, nor a remembered view", () => {
    const h = opened(800);
    try {
      h.controller.wheel({ dx: 40, dy: 10, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
      const panned = h.board.style.transform;
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      expect(h.board.style.transform).toBe(panned);
      // Away to another project and back: the remembered view comes back as it was.
      h.controller.openWorkspace("/other", vi.fn());
      h.controller.openWorkspace("/repo", vi.fn());
      expect(h.board.style.transform).toBe(panned);
      h.viewport.clientWidth = 700;
      h.controller.settleFit();
      expect(h.board.style.transform).toBe(panned);
    } finally { h.controller.dispose(); }
  });

  it("a newly opened canvas settles its own first Fit", () => {
    const h = opened(800);
    try {
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      h.viewport.clientWidth = 800;
      h.controller.openCanvas("/repo", h.other);
      h.viewport.clientWidth = 500;
      h.controller.settleFit();
      expect(h.board.style.transform).toBe(fittedAt(500));
    } finally { h.controller.dispose(); }
  });
});

// buzz-canvas-conversation R4: the tool state, the pick commands and their replies, and chip locate on the anchors
// channel. Picking and locating never change the selection or what main holds for `doan active`.
describe("picking", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const posted = (h: ReturnType<typeof selectionHarness>, frame = h.current()) => frame.contentWindow.postMessage.mock.calls.map(c => c[0] as Record<string, unknown>);
  const picks = (h: ReturnType<typeof selectionHarness>, frame = h.current()) => posted(h, frame).filter(m => m.type === "pick-start" || m.type === "pick-cancel");
  const picked = (h: ReturnType<typeof selectionHarness>, over: Record<string, unknown>, frame = h.current()) => h.receive({ type: "picked", pick: 1, document: "doc", ...over }, frame);
  const acked = (h: ReturnType<typeof selectionHarness>, over: Record<string, unknown> = {}) => h.receive({ type: "pick-started", pick: 1, document: "doc", ...over });
  // Pick commands name the document they are for, so the harness's canvas starts with a document token.
  const harness = () => { const h = selectionHarness(); h.layout({ document: "doc" }); return h; };
  const escape = (h: ReturnType<typeof selectionHarness>, over: Record<string, unknown> = {}) => {
    const { target, ...rest } = over;
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", ...rest });
    // dispatchEvent sets `target` to the host; an Esc from a field keeps the field.
    if (target !== undefined) Object.defineProperty(event, "target", { get: () => target });
    h.host.dispatchEvent(event);
    return event;
  };
  const started = (h: ReturnType<typeof selectionHarness>) => {
    const results = vi.fn();
    h.controller.onPicked(results);
    expect(h.controller.pick()).toBe(true);
    return results;
  };

  it("starts with the select tool, and pick publishes the pick tool and sends pick-start on its own seq", () => {
    const h = harness();
    try {
      expect(initialCanvasState().tool).toBe("select");
      expect(h.state().tool).toBe("select");
      h.select(1);
      started(h);
      expect(h.state().tool).toBe("pick");
      expect(picks(h)).toEqual([{ type: "pick-start", document: "doc", seq: 1 }]);
      // A second pick while picking changes nothing.
      expect(h.controller.pick()).toBe(true);
      expect(picks(h)).toHaveLength(1);
    } finally { h.controller.dispose(); }
  });

  it("a picked element ends picking and hands its anchor and the frames to the callback, without touching the selection", () => {
    const h = harness();
    try {
      h.select(1);
      const selection = h.state().selection;
      h.send.mockClear();
      const results = started(h);
      results.mockImplementation(() => expect(h.state().tool).toBe("select"));
      picked(h, { target: { ...h.target, tag: "button", element: { doanId: "pay", selector: '[data-doan-id="pay"]', html: "<button>" } } });
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "picked", anchor: { frame: { id: "hero" }, element: { doanId: "pay", selector: '[data-doan-id="pay"]', tag: "button" } },
        frames: [{ id: "intro", x: 0, y: 0, width: 10, height: 10 }, { id: "hero", x: 0, y: 20, width: 10, height: 10 }] });
      expect(picks(h).at(-1)).toEqual({ type: "pick-cancel", document: "doc", seq: 2 });
      expect(h.state()).toMatchObject({ tool: "select", selection });
      expect(h.send).not.toHaveBeenCalled();
      expect(h.inspect).toHaveBeenCalledTimes(1);
      // A second reply for the same pick is dropped.
      picked(h, { target: h.target });
      expect(results).toHaveBeenCalledTimes(1);
    } finally { h.controller.dispose(); }
  });

  it("a picked frame is a frame anchor", () => {
    const h = harness();
    try {
      const results = started(h);
      picked(h, { target: { rect: h.target.rect, tag: "section", frame: { id: "hero", title: "Hero", implements: "x.tsx" }, frameIndex: 1, path: h.target.path } });
      expect(results).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "picked", anchor: { frame: { id: "hero", title: "Hero" } } }));
    } finally { h.controller.dispose(); }
  });

  it("a point in a frame becomes an offset from the innermost frame there; outside every frame picking goes on", () => {
    const h = harness();
    try {
      h.layout({ frames: [{ id: "shipping", title: "Shipping", x: 100, y: 200, width: 400, height: 300 }, { id: "card", x: 150, y: 250, width: 100, height: 100 }] });
      const results = started(h);
      picked(h, { point: { x: 50, y: 50 } });
      expect(results).not.toHaveBeenCalled();
      expect(h.state().tool).toBe("pick");
      picked(h, { point: { x: 160, y: 260 } });
      expect(results).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "picked", anchor: { frame: { id: "card" }, point: { frameId: "card", dx: 10, dy: 10 } } }));
      expect(h.state().tool).toBe("select");
    } finally { h.controller.dispose(); }
  });

  it("drops a reply for another pick, from another document, or one that arrives after the pick was cancelled", () => {
    const h = harness();
    try {
      const results = started(h);
      picked(h, { pick: 0, target: h.target });
      picked(h, { target: h.target, href: "http://localhost/t/k/f/.doan/canvases/b.html" });
      expect(results).not.toHaveBeenCalled();
      h.controller.cancelPick();
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "cancelled" });
      expect(picks(h).at(-1)).toEqual({ type: "pick-cancel", document: "doc", seq: 2 });
      expect(h.state().tool).toBe("select");
      picked(h, { target: h.target });
      expect(results).toHaveBeenCalledTimes(1);
      // A new pick takes a newer seq, and the earlier pick's late reply cannot complete it.
      h.controller.pick();
      expect(picks(h).at(-1)).toEqual({ type: "pick-start", document: "doc", seq: 3 });
      picked(h, { target: h.target });
      expect(results).toHaveBeenCalledTimes(1);
      picked(h, { pick: 3, target: h.target });
      expect(results).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "picked" }));
    } finally { h.controller.dispose(); }
  });

  it("Esc while picking cancels only the pick, also from an editable target, and keeps the selection", () => {
    const h = harness();
    try {
      h.select(1);
      const results = started(h);
      const field = Object.assign(new EventTarget(), { localName: "textarea" });
      const event = escape(h, { target: field });
      expect(event.defaultPrevented).toBe(true);
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "cancelled" });
      expect(h.state()).toMatchObject({ tool: "select", selection: expect.objectContaining({ tag: "span" }) });
      expect(posted(h).some(m => m.type === "clear")).toBe(false);
      // Back on the select tool, Esc clears the selection again.
      escape(h);
      expect(h.state().selection).toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("an Esc another control already handled, or one during IME composition, does not cancel", () => {
    const h = harness();
    try {
      started(h);
      const handled = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
      handled.preventDefault();
      h.host.dispatchEvent(handled);
      escape(h, { isComposing: true });
      escape(h, { keyCode: 229 });
      expect(h.state().tool).toBe("pick");
    } finally { h.controller.dispose(); }
  });

  it("Esc in the canvas cancels the pick, whether the canvas answered cancelled or, before its pick-start arrived, sent an Escape key", () => {
    const h = harness();
    try {
      h.select(1);
      const results = started(h);
      picked(h, { cancelled: true });
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "cancelled" });
      started(h);
      h.receive({ type: "key", seq: 0, key: "Escape" });
      expect(h.state()).toMatchObject({ tool: "select", selection: expect.objectContaining({ tag: "span" }) });
    } finally { h.controller.dispose(); }
  });

  it("a click on the board margin while picking keeps picking and the selection", () => {
    const h = harness();
    try {
      h.select(1);
      started(h);
      h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0, ctrlKey: false, altKey: false }));
      expect(h.state()).toMatchObject({ tool: "pick", selection: expect.objectContaining({ tag: "span" }) });
    } finally { h.controller.dispose(); }
  });

  it("keeps the selection and hover seqs apart from the pick seq", () => {
    const h = harness();
    try {
      h.select(1);
      started(h);
      h.host.dispatchEvent(Object.assign(new Event("keydown"), { key: "Alt" }));
      expect(posted(h).at(-1)).toEqual({ type: "hover-alt", alt: true, seq: 1 });
      picked(h, { target: h.target });
      // The selection channel still expects seq 1, so the reply to an earlier click still applies.
      h.select(1, { target: { ...h.target, tag: "em" } });
      expect(h.state().selection?.tag).toBe("em");
      h.controller.pick();
      escape(h);
      escape(h);
      expect(posted(h).filter(m => m.type === "clear")).toEqual([{ type: "clear", seq: 2 }]);
    } finally { h.controller.dispose(); }
  });

  it("keeps picking across a reload and applies it to the new document after its first layout", () => {
    const h = harness();
    try {
      const results = started(h);
      const old = h.current();
      h.controller.command("reload");
      expect(h.state().tool).toBe("pick");
      expect(picks(h)).toEqual([]);
      picked(h, { target: h.target }, old);
      expect(results).not.toHaveBeenCalled();
      h.layout({ document: "doc2" });
      expect(picks(h)).toEqual([{ type: "pick-start", document: "doc2", seq: 1 }]);
      picked(h, { target: h.target, document: "doc2" });
      expect(results).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "picked" }));
    } finally { h.controller.dispose(); }
  });

  it("keeps picking when the canvas moves with the same id", () => {
    const h = harness();
    try {
      const results = started(h);
      const moved = { ...h.row, path: ".doan/canvases/flows/a.html", url: "http://localhost/t/k/f/.doan/canvases/flows/a.html" };
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [moved, h.other] }]);
      expect(h.state().tool).toBe("pick");
      h.layout({ href: moved.url, document: "doc2" });
      expect(picks(h)).toEqual([{ type: "pick-start", document: "doc2", seq: 1 }]);
      picked(h, { target: h.target, href: moved.url, document: "doc2" });
      expect(results).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "picked" }));
    } finally { h.controller.dispose(); }
  });

  it("cancels when a reload never lays out, or lays out a page the list doesn't have", () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      const results = started(h);
      h.controller.command("reload");
      vi.advanceTimersByTime(FIRST_LAYOUT_TIMEOUT_MS);
      expect(h.state()).toMatchObject({ status: "failed", tool: "select" });
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "cancelled" });
      h.controller.command("reload");
      h.layout({ document: "doc2" });
      expect(h.controller.pick()).toBe(true);
      h.controller.command("reload");
      h.layout({ href: "http://localhost/t/k/f/.doan/canvases/unlisted.html", document: "doc3" });
      expect(h.state()).toMatchObject({ unlisted: true, tool: "select" });
      expect(results).toHaveBeenCalledTimes(2);
    } finally { h.controller.dispose(); }
  });

  it("cancels when another canvas id takes the same path", () => {
    const h = harness();
    try {
      const results = started(h);
      h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [{ ...h.row, id: "z" }, h.other] }]);
      expect(h.state().tool).toBe("select");
      expect(results).toHaveBeenCalledExactlyOnceWith({ kind: "cancelled" });
    } finally { h.controller.dispose(); }
  });

  it("cancels on leaving the canvas: another canvas, an in-canvas link, the Overview or another screen", () => {
    const h = harness();
    try {
      const results = started(h);
      h.controller.openCanvas("/repo", h.other);
      expect(h.state().tool).toBe("select");
      h.layout({ href: h.other.url, document: "b" });
      expect(h.controller.pick()).toBe(true);
      h.current().contentWindow.postMessage.mockClear();
      h.layout({ href: h.row.url, document: "linked" });
      expect(h.state().tool).toBe("select");
      // The linked page's script starts its pick seq again at 0: it gets no cancel, and the next pick starts at 1.
      expect(h.controller.pick()).toBe(true);
      expect(picks(h)).toEqual([{ type: "pick-start", document: "linked", seq: 1 }]);
      h.controller.cancelPick();
      expect(h.controller.pick()).toBe(true);
      h.controller.showOverview();
      expect(h.state().tool).toBe("select");
      h.controller.openCanvas("/repo", h.row);
      h.layout({ document: "again" });
      expect(h.controller.pick()).toBe(true);
      h.controller.setWorkspaceActive(false);
      expect(h.state().tool).toBe("select");
      expect(results).toHaveBeenCalledTimes(5);
      expect(results.mock.calls.every(([result]) => result.kind === "cancelled")).toBe(true);
    } finally { h.controller.dispose(); }
  });

  it("does not start without a shown canvas", () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      h.controller.command("reload");
      vi.advanceTimersByTime(FIRST_LAYOUT_TIMEOUT_MS);
      expect(h.controller.pick()).toBe(false);
      h.controller.showOverview();
      expect(h.controller.pick()).toBe(false);
      expect(h.state().tool).toBe("select");
    } finally { h.controller.dispose(); }
  });

  it("does not call back after disposal or once the callback is removed", () => {
    const h = harness();
    const results = vi.fn();
    const off = h.controller.onPicked(results);
    h.controller.pick();
    off();
    h.controller.cancelPick();
    expect(results).not.toHaveBeenCalled();
    h.controller.onPicked(results);
    h.controller.pick();
    h.controller.dispose();
    expect(results).not.toHaveBeenCalled();
  });
  it("a picked element or frame outside every frame is not a chip, and picking goes on", () => {
    const h = harness();
    try {
      const results = started(h);
      const { frame: _frame, frameIndex: _index, ...loose } = h.target;
      picked(h, { target: loose });
      expect(results).not.toHaveBeenCalled();
      expect(h.state().tool).toBe("pick");
    } finally { h.controller.dispose(); }
  });

  it("keeps clicks off the canvas until it acknowledges the pick-start, so a click in between selects nothing", () => {
    const h = harness();
    try {
      h.select(1);
      const selection = h.state().selection;
      h.send.mockClear();
      started(h);
      expect(h.current().style.pointerEvents).toBe("none");
      // A click in between lands on the board instead of the canvas: picking goes on and nothing is selected.
      h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0, ctrlKey: false, altKey: false }));
      expect(h.state()).toMatchObject({ tool: "pick", selection });
      expect(h.send).not.toHaveBeenCalled();
      expect(posted(h).some(m => m.type === "clear" || m.type === "select-anchor")).toBe(false);
      // An acknowledgement for another pick or document does not open the canvas.
      acked(h, { pick: 0 });
      acked(h, { document: "other" });
      expect(h.current().style.pointerEvents).toBe("none");
      acked(h);
      expect(h.current().style.pointerEvents).toBe("");
      h.controller.cancelPick();
      expect(h.current().style.pointerEvents).toBe("");
    } finally { h.controller.dispose(); }
  });

  it("a cancel before the canvas acknowledged the start opens the canvas to clicks again", () => {
    const h = harness();
    try {
      started(h);
      h.controller.cancelPick();
      expect(h.current().style.pointerEvents).toBe("");
      expect(picks(h).at(-1)).toEqual({ type: "pick-cancel", document: "doc", seq: 2 });
      // The acknowledgement that arrives late keeps nothing open or closed.
      acked(h);
      expect(h.current().style.pointerEvents).toBe("");
      expect(h.state().tool).toBe("select");
    } finally { h.controller.dispose(); }
  });

  it("a reloaded canvas stays closed to clicks until its own document acknowledges the new pick-start", () => {
    const h = harness();
    try {
      started(h);
      acked(h);
      h.controller.command("reload");
      expect(h.current().style.pointerEvents).toBe("none");
      h.layout({ document: "doc2" });
      expect(h.current().style.pointerEvents).toBe("none");
      acked(h, { document: "doc2" });
      expect(h.current().style.pointerEvents).toBe("");
    } finally { h.controller.dispose(); }
  });

  it("re-arms on a new document at the same URL in the same iframe and drops the old document's late replies", () => {
    const h = harness();
    try {
      const results = started(h);
      acked(h);
      const frame = h.current();
      // The canvas's own location.reload(): same iframe, same href, a new document token.
      h.layout({ document: "doc2" });
      expect(h.current()).toBe(frame);
      expect(h.state().tool).toBe("pick");
      expect(picks(h).at(-1)).toEqual({ type: "pick-start", document: "doc2", seq: 1 });
      expect(h.current().style.pointerEvents).toBe("none");
      picked(h, { target: h.target });
      acked(h);
      expect(results).not.toHaveBeenCalled();
      expect(h.current().style.pointerEvents).toBe("none");
      acked(h, { document: "doc2" });
      picked(h, { target: h.target, document: "doc2" });
      expect(results).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "picked" }));
      expect(picks(h).at(-1)).toEqual({ type: "pick-cancel", document: "doc2", seq: 2 });
    } finally { h.controller.dispose(); }
  });
});

describe("chip locate", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const query = (h: ReturnType<typeof selectionHarness>) => h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query").at(-1);
  const answer = (h: ReturnType<typeof selectionHarness>, candidates: Record<string, unknown>, rects: Record<string, unknown>[] = [{ node: "n1", x: 40, y: 3000, width: 200, height: 100 }]) => {
    const q = query(h);
    h.receive({ type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: 1, width: 600, selectionSeq: 0, selected: null,
      results: [{ id: q.targets[0].id, candidates }], rects });
  };
  const loaded = () => {
    const h = selectionHarness();
    h.layout({ document: "doc" });
    h.select(1);
    h.send.mockClear();
    return h;
  };

  it("moves the view to an element and highlights it for 1.2 s, without selecting", () => {
    vi.useFakeTimers();
    const h = loaded();
    try {
      const selection = h.state().selection;
      const settled = vi.fn();
      const before = h.controller.currentView();
      expect(h.controller.locate({ element: { doanId: "pay", selector: "#pay" } }, settled)).toBe(true);
      expect(query(h).targets).toEqual([{ id: expect.any(String), doanId: "pay", selector: "#pay" }]);
      answer(h, { doanId: ["n1"], selector: ["n1"] });
      expect(settled).toHaveBeenCalledExactlyOnceWith("shown");
      expect(h.controller.currentView()).toEqual(locateView({ x: 40, y: 3000, width: 200, height: 100 }, { width: 800, height: 600 }, before));
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
      expect(h.state().selection).toEqual(selection);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.current().contentWindow.postMessage.mock.calls.some(c => c[0].type === "select-anchor" || c[0].type === "clear")).toBe(false);
      vi.advanceTimersByTime(1199);
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(h.markOf("jump-highlight")?.hidden).toBe(true);
      // Later replies for the same query (the canvas re-measures by itself) do not move the view again.
      const after = h.controller.currentView();
      h.controller.wheel({ dx: 10, dy: 0, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
      const q = query(h);
      h.receive({ type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: 2, width: 600, selectionSeq: 0, selected: null,
        results: [{ id: q.targets[0].id, candidates: { doanId: ["n1"], selector: ["n1"] } }], rects: [{ node: "n1", x: 40, y: 3000, width: 200, height: 100 }] });
      expect(h.controller.currentView()).not.toEqual(after);
      expect(settled).toHaveBeenCalledTimes(1);
    } finally { h.controller.dispose(); }
  });

  it("a frame chip finds its frame by id", () => {
    const h = loaded();
    try {
      const settled = vi.fn();
      h.controller.locate({ frame: { id: "hero" } }, settled);
      expect(query(h).targets).toEqual([{ id: expect.any(String), frame: "hero" }]);
      answer(h, { frame: ["n1"] });
      expect(settled).toHaveBeenCalledExactlyOnceWith("shown");
    } finally { h.controller.dispose(); }
  });

  it("a point shows a 12 px ring at its offset in the frame for 1.2 s", () => {
    vi.useFakeTimers();
    const h = loaded();
    try {
      const settled = vi.fn();
      h.controller.locate({ frame: { id: "shipping" }, point: { frameId: "shipping", dx: 20, dy: 30 } }, settled);
      expect(query(h).targets).toEqual([{ id: expect.any(String), frame: "shipping" }]);
      answer(h, { frame: ["n1"] }, [{ node: "n1", x: 100, y: 200, width: 400, height: 300 }]);
      expect(settled).toHaveBeenCalledExactlyOnceWith("shown");
      const view = h.controller.currentView();
      const ring = h.markOf("jump-point");
      expect(ring?.hidden).toBe(false);
      const center = { x: view.x + 120 * view.scale, y: view.y + 230 * view.scale };
      expect(ring?.style).toMatchObject({ left: `${center.x - 6}px`, top: `${center.y - 6}px`, width: "12px", height: "12px" });
      expect(center).toEqual({ x: 400, y: 300 });
      vi.advanceTimersByTime(1199);
      expect(ring?.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(ring?.hidden).toBe(true);
      expect(h.send).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("reports a target that is gone or ambiguous as missing, and no answer as a timeout, and leaves the view", () => {
    vi.useFakeTimers();
    const h = loaded();
    try {
      const before = h.controller.currentView();
      const settled = vi.fn();
      h.controller.locate({ element: { doanId: "pay", selector: "#pay" } }, settled);
      answer(h, { doanId: [], selector: ["n1", "n2"] }, [{ node: "n1", x: 0, y: 0, width: 1, height: 1 }, { node: "n2", x: 0, y: 0, width: 1, height: 1 }]);
      expect(settled).toHaveBeenLastCalledWith("missing");
      h.controller.locate({ frame: { id: "gone" }, point: { frameId: "gone", dx: 1, dy: 1 } }, settled);
      answer(h, { frame: [] }, []);
      expect(settled).toHaveBeenLastCalledWith("missing");
      h.controller.locate({ frame: { id: "hero" } }, settled);
      vi.advanceTimersByTime(MEASURE_ANSWER_MS - 1);
      expect(settled).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(settled).toHaveBeenCalledTimes(3);
      // No answer is not proof the target is gone: it is reported apart from a real empty or duplicate reply.
      expect(settled).toHaveBeenLastCalledWith("timeout");
      expect(h.controller.currentView()).toEqual(before);
      expect(h.markOf("jump-highlight")).toBeUndefined();
    } finally { h.controller.dispose(); }
  });

  it("a newer locate replaces an older one, and a reload drops one in flight", () => {
    vi.useFakeTimers();
    const h = loaded();
    try {
      const first = vi.fn(), second = vi.fn();
      h.controller.locate({ frame: { id: "intro" } }, first);
      h.controller.locate({ frame: { id: "hero" } }, second);
      answer(h, { frame: ["n1"] });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledExactlyOnceWith("shown");
      const third = vi.fn();
      h.controller.locate({ frame: { id: "hero" } }, third);
      h.controller.command("reload");
      vi.advanceTimersByTime(MEASURE_ANSWER_MS);
      expect(third).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("is unavailable while no canvas document is shown", () => {
    const h = selectionHarness();
    try {
      // The harness's first layout carries no document token, so the canvas can't be asked yet.
      expect(h.controller.locate({ frame: { id: "hero" } }, vi.fn())).toBe(false);
      h.layout({ document: "doc" });
      h.controller.command("reload");
      expect(h.controller.locate({ frame: { id: "hero" } }, vi.fn())).toBe(false);
    } finally { h.controller.dispose(); }
  });
});
