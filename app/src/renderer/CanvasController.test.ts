import { afterEach, expect, it, vi } from "vitest";
import { CanvasController } from "./CanvasController";

afterEach(() => vi.unstubAllGlobals());

it("updates the board synchronously without notifying React during pan", () => {
  vi.stubGlobal("window", new EventTarget());
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) });
  const board = { style: { transform: "", visibility: "" }, hidden: false, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, changed);
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
  const controller = new CanvasController(viewport, board, changed);
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
  const controller = new CanvasController(viewport, board, changed);
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
