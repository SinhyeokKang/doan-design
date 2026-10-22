import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasController } from "./CanvasController";
import { SELECTION_LOST } from "./selection";

afterEach(() => vi.unstubAllGlobals());

it("updates the board synchronously without notifying React during pan", () => {
  vi.stubGlobal("window", new EventTarget());
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) });
  const board = { style: { transform: "", visibility: "" }, hidden: false, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn());
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
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn());
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

function loadedController() {
  const host = new EventTarget();
  vi.stubGlobal("window", host);
  const frame = Object.assign(new EventTarget(), { contentWindow: { postMessage: vi.fn() }, style: {}, setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() });
  vi.stubGlobal("document", { createElement: () => frame });
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
  const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn());
  const row = { path: "design/a.html", url: "http://localhost/a.html", width: 600, open: 0, resolved: 0 };
  controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [row] }]);
  controller.openCanvas("/repo", row);
  const layout = { type: "layout", href: row.url, height: 600, viewport: 150, frames: [{ id: "a", title: "A", x: 0, y: 0, width: 100, height: 100 }], truncated: false };
  const receive = (data = layout) => host.dispatchEvent(Object.assign(new Event("message"), { data, origin: "null", source: frame.contentWindow }));
  receive();
  changed.mockClear();
  return { controller, changed, receive, layout, row };
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

it("uses the open canvas's last successful activity for Updated", () => {
  const { controller, changed, row } = loadedController();
  try {
    const { width: _width, ...withoutWidth } = row;
    controller.openCanvas("/repo", { ...withoutWidth, path: "design/b.html" });
    expect(changed.mock.lastCall?.[0].updated).toBeNull();
    controller.openCanvas("/repo", row);
    expect(changed.mock.lastCall?.[0].updated).toBeInstanceOf(Date);
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
  const frames: { contentWindow: { postMessage: ReturnType<typeof vi.fn> } }[] = [];
  const marks: FakeMark[] = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "iframe") {
        const mark: FakeMark = { className: "", hidden: false, textContent: "", style: {}, children: [], append: (...children) => mark.children.push(...children) };
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
  const controller = new CanvasController(viewport, board, overlay, changed, send);
  const row = { path: "design/a.html", id: "a", url: "http://localhost/t/k/f/design/a.html", width: 600, open: 0, resolved: 0 };
  const other = { ...row, path: "design/b.html", id: "b", url: "http://localhost/t/k/f/design/b.html" };
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
  return { controller, changed, send, frames, current, receive, layout, select, key, markOf, state, row, other, target, overlay };
}

describe("selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("redraws the selection mark on a plain wheel pan without notifying React", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      expect(h.markOf("selected")?.style).toMatchObject({ left: "110px", top: "52px", width: "60px", height: "18px" });
      h.changed.mockClear();
      h.controller.wheel({ dx: 10, dy: 20, ctrl: false, meta: false, deltaMode: 0 }, { x: 200, y: 100 });
      expect(h.markOf("selected")?.style).toMatchObject({ left: "100px", top: "32px" });
      expect(h.changed).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });

  it("takes a select from the open canvas into state, main and the size label inside the mark", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const { rect: _rect, ...view } = h.target;
      expect(h.state().selection).toEqual(view);
      expect(h.send).toHaveBeenLastCalledWith({ root: "/repo", canvas: { path: "design/a.html", id: "a" }, frame: { id: "hero" }, element: h.target.element });
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
      expect(h.markOf("selected")?.style).toMatchObject({ top: "35px", width: "5px" });
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

  it("a frame jump asks the canvas to pick that frame by index and id", () => {
    const h = selectionHarness();
    try {
      h.controller.jump(1);
      const posted = h.current().contentWindow.postMessage.mock.calls.map((call) => call[0]);
      expect(posted.slice(-2)).toEqual([{ type: "measure" }, { type: "pick-frame", seq: 1, index: 1, id: "hero" }]);
    } finally { h.controller.dispose(); }
  });

  it("a path step asks the canvas for that anchor", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.selectPath({ label: "form", selector: "body > form:nth-of-type(1)" });
      expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "select-anchor", seq: 2, selector: "body > form:nth-of-type(1)" }, "*");
    } finally { h.controller.dispose(); }
  });

  it("draws the hover mark and hides it on Alt or a wheel", () => {
    const h = selectionHarness();
    try {
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      expect(h.markOf("hover")).toMatchObject({ hidden: false, style: { left: "100px", top: "32px", width: "4px" } });
      h.key("Alt");
      expect(h.markOf("hover")?.hidden).toBe(true);
      h.receive({ type: "hover", seq: 0, rect: { x: 0, y: 0, width: 4, height: 4 } });
      h.controller.wheel({ dx: 0, dy: 5, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
      expect(h.markOf("hover")?.hidden).toBe(true);
    } finally { h.controller.dispose(); }
  });
});
