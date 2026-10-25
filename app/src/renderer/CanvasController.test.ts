import { afterEach, describe, expect, it, vi } from "vitest";
import type { InspectResult, InspectRow } from "../main/inspect";
import type { FolderEntry } from "../main/view";
import { projectList } from "../comments/projection";
import { CanvasController } from "./CanvasController";
import { FIRST_LAYOUT_TIMEOUT_MS } from "./viewport";
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

function loadedController() {
  const host = new EventTarget();
  vi.stubGlobal("window", host);
  const frame = Object.assign(new EventTarget(), { contentWindow: { postMessage: vi.fn() }, style: {}, setAttribute: vi.fn(), remove: vi.fn(), replaceWith: vi.fn() });
  vi.stubGlobal("document", { createElement: () => frame });
  const viewport = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => new DOMRect() });
  const board = { style: { transform: "", visibility: "" }, hidden: true, prepend: vi.fn() };
  const changed = vi.fn();
  const controller = new CanvasController(viewport, board, { append: vi.fn() }, changed, vi.fn(), vi.fn(async () => ({ ok: true as const, rows: [] })));
  const row = { path: "design/a.html", url: "http://localhost/a.html", width: 600, open: 0, resolved: 0 };
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
  const frames: (EventTarget & { contentWindow: { postMessage: ReturnType<typeof vi.fn> } })[] = [];
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
  return { controller, changed, send, frames, current, receive, layout, select, key, markOf, state, row, other, target, overlay, host, viewport, inspect, inspections, board };
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

  it("Select asks the canvas to pick that frame by index and id", () => {
    const h = selectionHarness();
    try {
      h.controller.selectFrame(1);
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
      expect(h.markOf("hover")).toMatchObject({ hidden: false, style: { left: "100px", top: "32px", width: "4px" } });
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
      h.controller.selectFrame(1);
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
      if (kind === "frame") h.controller.selectFrame(1);
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
      else h.controller.selectFrame(0);
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

describe("comment anchor channel", () => {
  it("rejects stale request/document/viewport replies without consuming held selection or hover", () => {
    const h = selectionHarness();
    const changed = vi.fn();
    try {
      h.layout({ document: "doc" });
      h.controller.setComments({ root: "/repo", canvas: "a", comments: [] }, { changed, guard: async () => true, open: vi.fn(), focusFallback: vi.fn() });
      const request = () => h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query").at(-1);
      const q = request();
      expect(q).toMatchObject({ document: "doc", targets: [] });
      const reply = { type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: 1, width: 600, selectionSeq: 0, selected: null, results: [], rects: [] };
      h.receive(reply);
      const accepted = changed.mock.calls.length;
      for (const patch of [{ request: q.request - 1 }, { generation: q.generation - 1 }, { document: "old" }, { href: "http://localhost/other" }, { viewport: 149 }, { width: 599 }]) h.receive({ ...reply, revision: 2, ...patch });
      expect(changed).toHaveBeenCalledTimes(accepted);
      h.select(1);
      expect(h.state().selection.element.doanId).toBe("cta");
      h.receive({ type: "hover", seq: 1, rect: { x: 20, y: 20, width: 10, height: 10 } });
      expect(h.markOf("hover")?.hidden).toBe(false);
      const old = h.current();
      h.controller.command("reload");
      h.receive({ ...reply, revision: 10 }, old);
      expect(changed.mock.lastCall?.[0].lookup.nodes.size).toBe(0);
    } finally { h.controller.dispose(); }
  });
});


it("guards pin selection before applying it and cancels a deferred decision after reload", async () => {
  const h = selectionHarness();
  try {
    h.layout({ document: "doc" });
    let answer: (value: boolean) => void = () => {};
    const guard = vi.fn(() => new Promise<boolean>(resolve => { answer = resolve; }));
    const open = vi.fn();
    const comment = { comment: "f", target: { frame: "hero" }, status: "open" as const, body: "x", canvasHash: "h", createdAt: "t", updatedAt: "t", createdBy: { kind: "human" as const, name: "A" } };
    h.controller.setComments({ root: "/repo", canvas: "a", comments: [comment] }, { guard, open, changed: vi.fn(), focusFallback: vi.fn() });
    const q = h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query").at(-1);
    h.receive({ type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: 1, width: 600, selectionSeq: 0, selected: null,
      results: [{ id: "f", candidates: { frame: ["node"] } }], rects: [{ node: "node", x: 10, y: 10, width: 10, height: 10 }] });
    const pending = h.controller.activatePin("node");
    expect(guard).toHaveBeenCalledWith({ node: "node", comments: ["f"], originalTarget: { frame: "hero" } });
    expect(h.state()?.selection ?? null).toBeNull();
    expect(h.current().contentWindow.postMessage.mock.calls.some(c => c[0].type === "select-comment")).toBe(false);
    const old = h.current();
    h.controller.command("reload");
    answer(true); await pending;
    expect(old.contentWindow.postMessage.mock.calls.some(c => c[0].type === "select-comment")).toBe(false);
    expect(open).not.toHaveBeenCalled();
  } finally { h.controller.dispose(); }
});

function pinHarness() {
  const h = selectionHarness(), changed = vi.fn(), open = vi.fn();
  const comments = ["a", "b"].map(id => ({ comment: id, target: { frame: id }, status: "open" as const, body: "x", canvasHash: "h", createdAt: "t", updatedAt: "t", createdBy: { kind: "human" as const, name: "A" } }));
  const hooks = { changed, open, guard: vi.fn(async () => true), focusFallback: vi.fn() };
  const bind = (items = comments) => h.controller.setComments({ root: "/repo", canvas: "a", comments: items }, hooks);
  let revision = 0;
  const reply = (selectionSeq = 0, selected: string | null = null) => {
    const q = h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query").at(-1);
    h.receive({ type: "anchors", document: "doc", generation: q.generation, request: q.request, revision: ++revision, width: 600, selectionSeq, selected,
      results: q.targets.map((t: { id: string }) => ({ id: t.id, candidates: { frame: [t.id] } })),
      rects: comments.map(c => ({ node: c.comment, x: 10, y: 10, width: 10, height: 10 })) });
  };
  h.layout({ document: "doc" }); bind(); reply();
  return { ...h, comments, hooks, bind, reply, changed, open };
}

it("Y1 does not project B before its sent selection command is acknowledged", () => {
  const h = pinHarness();
  try {
    h.select(1); h.reply(1, "a");
    expect(h.changed.mock.lastCall?.[0].selected).toBe("a");
    h.controller.selectPath(h.target.path[0]!);
    h.reply(2, "b");
    const snapshot = h.changed.mock.lastCall![0];
    expect(h.state().selection.element.doanId).toBe("cta");
    expect(projectList(h.comments, snapshot.lookup, snapshot.lookup, { scope: "selection", status: "open", node: snapshot.selected }).map(c => c.comment)).not.toContain("b");
    expect(snapshot.selected).toBeNull();
    h.select(2); h.reply(2, "b");
    expect(h.changed.mock.lastCall?.[0].selected).toBe("b");
  } finally { h.controller.dispose(); }
});

it.each(["new guard", "binding change"])("Y3 cancels old pin panel effects after %s but accepts actual selection", async kind => {
  const h = pinHarness();
  try {
    await h.controller.activatePin("a");
    let answer: (allowed: boolean) => void = () => {};
    let pending: Promise<void> | undefined;
    if (kind === "new guard") {
      h.hooks.guard.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
      pending = h.controller.activatePin("b");
    } else { h.bind([h.comments[1]!]); h.reply(); }
    h.select(1);
    expect(h.state().selection.element.doanId).toBe("cta");
    expect(h.open).not.toHaveBeenCalled();
    if (pending) {
      h.reply(1, "a");
      answer(true); await pending;
      expect(h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "select-comment").at(-1)).toMatchObject({ node: "b", seq: 2 });
      h.select(2);
      expect(h.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ node: "b", originalTarget: { frame: "b" } }));
    }
  } finally { h.controller.dispose(); }
});

it("holds manual reload before replacing a document and rejects superseded approval", async () => {
  const h = selectionHarness();
  try {
    h.changed.mockClear();
    const releases: ((allow: boolean) => void)[] = [];
    h.controller.setTransitionGuard(() => new Promise(resolve => releases.push(resolve)));
    h.controller.command("reload");
    expect(h.changed).not.toHaveBeenCalled();
    h.controller.openCanvas("/repo", h.other);
    releases[0]?.(true); await Promise.resolve();
    expect(h.changed).not.toHaveBeenCalled();
    releases[1]?.(false); await Promise.resolve();
    expect(h.changed).not.toHaveBeenCalled();
  } finally { h.controller.dispose(); }
});

it("independently rejects replayed canvas intents and approval after same-URL document replacement", async () => {
  const h = selectionHarness();
  try {
    h.layout({ document: "one" });
    const allow: ((value: boolean) => void)[] = [];
    const guard = vi.fn(() => new Promise<boolean>(resolve => allow.push(resolve)));
    h.controller.setTransitionGuard(guard);
    h.receive({ type: "transition-intent", document: "one", intent: 2, kind: "selection" });
    h.receive({ type: "transition-intent", document: "one", intent: 1, kind: "selection" });
    h.receive({ type: "transition-intent", document: "one", intent: 2, kind: "selection" });
    expect(guard).toHaveBeenCalledTimes(1);
    h.layout({ document: "two" });
    allow[0]?.(true); await Promise.resolve();
    expect(h.current().contentWindow.postMessage.mock.calls.some(([message]) => message.type === "transition-answer")).toBe(false);
    h.receive({ type: "transition-intent", document: "two", intent: 1, kind: "selection" });
    expect(guard).toHaveBeenCalledTimes(2);
    allow[1]?.(true); await Promise.resolve();
    expect(h.current().contentWindow.postMessage).toHaveBeenLastCalledWith({ type: "transition-answer", document: "two", intent: 1 }, "*");
  } finally { h.controller.dispose(); }
});

it("prevents the triggering Escape from cancelling its newly opened draft dialog", () => {
  const h = selectionHarness();
  try {
    h.select(1); h.controller.setDraftGuard(true);
    h.controller.setTransitionGuard(async () => false);
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
    h.host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(h.state().selection).not.toBeNull();
  } finally { h.controller.dispose(); }
});

describe("a draft blocked as reloaded", () => {
  afterEach(() => vi.unstubAllGlobals());
  // The session answers same-canvas selection changes at once and asks about everything else.
  function blockedHarness() {
    const h = selectionHarness();
    h.layout({ document: "one" });
    const asked: string[] = [];
    const guard = vi.fn((destination: "selection" | "navigation") => destination === "selection" ? true : new Promise<boolean>(() => { asked.push(destination); }));
    h.controller.setTransitionGuard(guard);
    h.controller.setDraftGuard(true, false);
    const posted = () => h.current().contentWindow.postMessage.mock.calls.map(([message]) => message);
    return { ...h, guard, asked, posted };
  }

  it("changes the selection on a canvas click, Select, ancestor path, blank margin and Escape without asking", () => {
    const h = blockedHarness();
    try {
      h.receive({ type: "transition-intent", document: "one", intent: 1, kind: "selection" });
      expect(h.posted().at(-1)).toEqual({ type: "transition-answer", document: "one", intent: 1 });
      h.controller.selectFrame(0);
      expect(h.posted().at(-1)).toMatchObject({ type: "pick-frame", index: 0, id: "intro" });
      h.select(2);
      h.controller.selectPath({ label: "cta", selector: '[data-doan-id="cta"]', doanId: "cta" });
      expect(h.posted().at(-1)).toMatchObject({ type: "select-anchor", doanId: "cta" });
      h.select(3);
      h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0 }));
      expect(h.state().selection).toBeNull();
      h.select(4);
      const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
      h.host.dispatchEvent(escape);
      expect(h.state().selection).toBeNull();
      expect(escape.defaultPrevented).toBe(false);
      expect(h.guard.mock.calls.every(([destination]) => destination === "selection")).toBe(true);
      expect(h.asked).toEqual([]);
    } finally { h.controller.dispose(); }
  });

  it("still asks before another canvas, an in-canvas link, Reload or Overview", () => {
    const h = blockedHarness();
    try {
      h.receive({ type: "transition-intent", document: "one", intent: 1, kind: "navigation" });
      h.controller.openCanvas("/repo", h.other);
      h.controller.command("reload");
      h.controller.showOverview();
      h.controller.openWorkspace("/repo", () => {});
      expect(h.asked).toEqual(["navigation", "navigation", "navigation", "navigation", "navigation"]);
      expect(h.posted().some(message => message.type === "transition-answer")).toBe(false);
      expect(h.state().open.canvas).toBe(h.row.path);
    } finally { h.controller.dispose(); }
  });

  it("drops a transition intent without a known kind", () => {
    const h = blockedHarness();
    try {
      h.receive({ type: "transition-intent", document: "one", intent: 1 });
      expect(h.guard).not.toHaveBeenCalled();
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

it("keeps synchronous canvas opening when the draft guard immediately allows it", () => {
  const h = selectionHarness();
  try {
    h.controller.setTransitionGuard(() => true);
    h.controller.openCanvas("/repo", h.other);
    expect(h.state().status).toBe("loading");
    expect(h.state().open.canvas).toBe(h.other.path);
  } finally { h.controller.dispose(); }
});

it("uses freshly revalidated destination metadata after a draft decision", async () => {
  const h = selectionHarness();
  try {
    let allow: ((value: boolean) => void) | undefined;
    h.controller.setTransitionGuard(() => new Promise(resolve => { allow = resolve; }));
    h.controller.openCanvas("/repo", h.other);
    const { width: _width, ...invalidWidth } = h.other;
    h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 0, canvases: [h.row, invalidWidth] }]);
    allow?.(true); await Promise.resolve();
    expect(h.state().open.row.width).toBeUndefined();
    expect(h.state().status).toBe("noWidth");
  } finally { h.controller.dispose(); }
});

it("switches workspaces through the draft guard and restores the previous canvas view", async () => {
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
    controller.setTransitionGuard(() => false);
    controller.openWorkspace("/other", entered);
    expect(entered).not.toHaveBeenCalled();
    controller.setTransitionGuard(() => true);
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
      () => controller.openCanvas("/repo", { ...row, path: "design/b.html", url: "http://localhost/b.html" }),
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

it("asks the draft guard again before entering a waited-for workspace", async () => {
  const { controller, row, changed } = loadedController();
  try {
    const repo: FolderEntry = { path: "/repo", kind: "list", servedRev: 0, canvases: [row] };
    const answers: ((allow: boolean) => void)[] = [];
    let hasDraft = false;
    const guard = vi.fn(() => hasDraft ? new Promise<boolean>(resolve => answers.push(resolve)) : true);
    controller.setTransitionGuard(guard);
    const entered = vi.fn();
    // The click passes the guard with no draft; a draft is started while the read is pending.
    const waitWithDraft = (path: string) => {
      hasDraft = false;
      controller.updateEntries([repo, { path, kind: "loading" }]);
      controller.openWorkspace(path, entered);
      hasDraft = true;
      controller.updateEntries([repo, { path, kind: "list", servedRev: 0, canvases: [] }]);
    };

    waitWithDraft("/kept");
    expect(guard).toHaveBeenCalledTimes(2);
    answers[0]?.(false); await Promise.resolve();
    expect(entered).not.toHaveBeenCalled();
    expect(changed.mock.lastCall?.[0].open?.folder).toBe("/repo");

    waitWithDraft("/superseded");
    controller.showOverview();
    answers[1]?.(true); await Promise.resolve();
    expect(entered).not.toHaveBeenCalled();
    answers[2]?.(false); await Promise.resolve();

    waitWithDraft("/discarded");
    expect(entered).not.toHaveBeenCalled();
    answers[3]?.(true); await Promise.resolve();
    expect(entered).toHaveBeenCalledExactlyOnceWith("/discarded");
    expect(changed.mock.lastCall?.[0].open).toBeNull();

    hasDraft = false;
    entered.mockClear();
    controller.updateEntries([repo, { path: "/ready", kind: "loading" }]);
    controller.openWorkspace("/ready", entered);
    controller.updateEntries([repo, { path: "/ready", kind: "list", servedRev: 0, canvases: [] }]);
    expect(entered).toHaveBeenCalledExactlyOnceWith("/ready");
  } finally { controller.dispose(); }
});


describe("frame navigation", () => {
  it("jumps without a guard, selection command or main selection update", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const selected = h.state().selection;
      const guard = vi.fn(() => false);
      h.controller.setTransitionGuard(guard);
      h.send.mockClear();
      h.current().contentWindow.postMessage.mockClear();
      h.controller.jump(0);
      expect(guard).not.toHaveBeenCalled();
      expect(h.current().contentWindow.postMessage.mock.calls.map(call => call[0])).toEqual([{ type: "measure" }]);
      h.layout();
      expect(h.state().selection).toEqual(selected);
      expect(h.state().currentFrame).toBe(0);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.markOf("jump-highlight")?.hidden).toBe(false);
    } finally { h.controller.dispose(); }
  });

  it("keeps the same canvas and selection without consulting the draft guard", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      const guard = vi.fn(() => false);
      h.controller.setTransitionGuard(guard);
      h.controller.openCanvas("/repo", h.row);
      expect(guard).not.toHaveBeenCalled();
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


it("guards Select and only sends the selection to main after its acknowledgement", () => {
  const h = selectionHarness();
  try {
    const guard = vi.fn(() => false);
    h.controller.setTransitionGuard(guard);
    h.current().contentWindow.postMessage.mockClear();
    h.controller.selectFrame(0);
    expect(guard).toHaveBeenCalledOnce();
    expect(h.current().contentWindow.postMessage).not.toHaveBeenCalled();
    guard.mockReturnValue(true);
    h.send.mockClear();
    h.controller.selectFrame(0);
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

it("reports a non-list Added Open target immediately or after loading, through the draft guard", async () => {
  const h = loadedController();
  try {
    const repo: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const problem: FolderEntry = { kind: "uninitialized", path: "/added" };
    const entered = vi.fn(), unavailable = vi.fn();
    h.controller.setTransitionGuard(() => true);
    h.controller.updateEntries([repo, problem]);
    h.controller.openWorkspace("/added", entered, false, unavailable);
    expect(unavailable).toHaveBeenCalledOnce();
    unavailable.mockClear();
    h.controller.updateEntries([repo, { kind: "loading", path: "/added" }]);
    h.controller.openWorkspace("/added", entered, false, unavailable);
    const answers: ((allow: boolean) => void)[] = [];
    h.controller.setTransitionGuard(() => new Promise<boolean>(resolve => answers.push(resolve)));
    h.controller.updateEntries([repo, problem]);
    expect(unavailable).not.toHaveBeenCalled();
    answers[0]?.(false); await Promise.resolve();
    expect(unavailable).not.toHaveBeenCalled();
    h.controller.setTransitionGuard(() => true);
    h.controller.updateEntries([repo, { kind: "loading", path: "/added" }]);
    h.controller.openWorkspace("/added", entered, false, unavailable);
    h.controller.updateEntries([repo, problem]);
    expect(unavailable).toHaveBeenCalledOnce();
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

it("reports a canvas that becomes unavailable while the user approves its draft guard", async () => {
  const h = loadedController();
  try {
    const target = { ...h.row, path: "design/next.html", url: "http://localhost/next.html" };
    h.controller.updateEntries([{ kind: "list", path: "/repo", servedRev: 0, canvases: [h.row, target] }]);
    let approve: (allow: boolean) => void = () => {};
    h.controller.setTransitionGuard(() => new Promise<boolean>(resolve => { approve = resolve; }));
    const unavailable = vi.fn();
    h.controller.openCanvas("/repo", target, undefined, { unavailable });
    h.controller.updateEntries([{ kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] }]);
    approve(true); await Promise.resolve();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(h.changed.mock.lastCall?.[0].open?.canvas).toBe(h.row.path);
  } finally { h.controller.dispose(); }
});

it("leaving the workspace supersedes a pending Added recovery approval", async () => {
  const h = loadedController();
  try {
    const repo: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    h.controller.updateEntries([repo, { path: "/added", kind: "loading" }]);
    const unavailable = vi.fn();
    h.controller.openWorkspace("/added", vi.fn(), false, unavailable);
    let approve: (allow: boolean) => void = () => {};
    h.controller.setTransitionGuard(() => new Promise<boolean>(resolve => { approve = resolve; }));
    h.controller.updateEntries([repo, { path: "/added", kind: "uninitialized" }]);
    h.controller.setWorkspaceActive(false);
    approve(true); await Promise.resolve();
    expect(unavailable).not.toHaveBeenCalled();
  } finally { h.controller.dispose(); }
});


it.each(["id", "url"])("reports a changed %s after guarded cross-root navigation without opening it", async field => {
  const h = loadedController();
  try {
    const source: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const row = { ...h.row, id: "original" };
    const target: FolderEntry = { kind: "list", path: "/target", servedRev: 0, canvases: [row] };
    h.controller.updateEntries([source, target]);
    let approve = (_allowed: boolean) => {};
    let draft = true;
    h.controller.setTransitionGuard(() => draft ? new Promise<boolean>(resolve => { approve = resolve; }) : true);
    const messages: string[] = [];
    const unavailable = (entry: FolderEntry | undefined) => messages.push(unavailableCanvasMessage(entry, row.path));
    h.controller.openWorkspace("/target", root => h.controller.openCanvas(root, row, undefined, { unavailable }), false, unavailable);
    const changed = { ...target, canvases: [{ ...row, [field]: "changed" }] };
    h.controller.updateEntries([source, changed]);
    expect(messages).toEqual([]);
    draft = false; approve(true); await Promise.resolve();
    expect(messages).toEqual(["Canvas changed while opening. Choose it again from the Sidebar or Quick Open."]);
    expect(h.changed.mock.lastCall?.[0].open).toBeNull();
  } finally { h.controller.dispose(); }
});

it.each(["cliError", "missing-path", "removed"])("passes the consumed %s entry to the waiting Open callback before returning", async kind => {
  const h = loadedController();
  try {
    const source: FolderEntry = { kind: "list", path: "/repo", servedRev: 0, canvases: [h.row] };
    const target: FolderEntry = { kind: "list", path: "/target", servedRev: 0, canvases: [h.row] };
    h.controller.updateEntries([source, target]);
    let approve = (_allowed: boolean) => {};
    let draft = true;
    h.controller.setTransitionGuard(() => draft ? new Promise<boolean>(resolve => { approve = resolve; }) : true);
    const unavailable = vi.fn();
    h.controller.openWorkspace("/target", root => h.controller.openCanvas(root, h.row, undefined, { unavailable }), false, unavailable);
    h.controller.updateEntries([source, { kind: "loading", path: "/target" }]);
    draft = false; approve(true); await Promise.resolve();
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
    const moved = { ...h.row, path: "design/flows/a.html", url: "http://localhost/t/k/f/design/flows/a.html" };
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
      expect(activityFor(activity, "/repo", h.moved.path).map(event => [event.kind, event.from])).toEqual([["moved", h.row.path], ["opened", undefined]]);
      expect(activityFor(activity, "/repo", h.row.path)).toEqual([]);
      expect(h.state().updated).toEqual(activity[0]?.at);
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

  it("treats the move as a removal while the comments session cannot follow", () => {
    const h = movedHarness();
    try {
      h.select(1);
      h.controller.setFollowGuard(() => false);
      h.controller.updateEntries(h.list(h.moved, h.other));
      expect(h.removed).toHaveBeenCalledExactlyOnceWith({ folder: "/repo", row: h.row, duplicates: null });
      expect(h.followed).not.toHaveBeenCalled();
      expect(h.state()).toMatchObject({ open: null, selection: null, status: "missing", message: "design/a.html is no longer in the list. It was deleted or moved." });
      expect(h.send).toHaveBeenLastCalledWith(null);
    } finally { h.controller.dispose(); }
  });

  it("closes with the duplicate count when several canvases now use the id", () => {
    const h = movedHarness();
    try {
      h.select(1);
      h.controller.updateEntries(h.list(h.moved, { ...h.moved, path: "design/copy.html", url: "http://localhost/t/k/f/design/copy.html" }, h.other));
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

describe("Escape and a blank click without a selection (L-17)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const escapeKey = () => Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });

  it("neither asks about a draft nor prevents Escape, and still cancels a pending Open", async () => {
    const h = selectionHarness();
    try {
      const allow: ((value: boolean) => void)[] = [];
      const guard = vi.fn(() => new Promise<boolean>(resolve => allow.push(resolve)));
      h.controller.setDraftGuard(true);
      h.controller.setTransitionGuard(guard);
      h.controller.openCanvas("/repo", h.other);
      expect(guard).toHaveBeenCalledOnce();
      const event = escapeKey();
      h.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(guard).toHaveBeenCalledOnce();
      allow[0]?.(true); await Promise.resolve();
      expect(h.state().open.canvas).toBe(h.row.path);
    } finally { h.controller.dispose(); }
  });

  it("skips the guard for an Escape forwarded from the canvas and a blank margin click", () => {
    const h = selectionHarness();
    try {
      const guard = vi.fn(() => false);
      h.controller.setDraftGuard(true);
      h.controller.setTransitionGuard(guard);
      h.receive({ type: "key", seq: 0, key: "Escape" });
      h.viewport.dispatchEvent(Object.assign(new Event("click"), { button: 0 }));
      expect(guard).not.toHaveBeenCalled();
      h.select(1);
      h.receive({ type: "key", seq: 1, key: "Escape" });
      expect(guard).toHaveBeenLastCalledWith("selection");
      expect(h.state().selection).not.toBeNull();
    } finally { h.controller.dispose(); }
  });

  it("still guards Escape while the reloaded canvas looks for the selection", () => {
    const h = selectionHarness();
    try {
      h.select(1);
      h.controller.command("reload");
      expect(h.state().reanchoring).toBe(true);
      const guard = vi.fn(() => false);
      h.controller.setDraftGuard(true);
      h.controller.setTransitionGuard(guard);
      const event = escapeKey();
      h.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(guard).toHaveBeenCalledExactlyOnceWith("selection");
      expect(h.state().reanchoring).toBe(true);
    } finally { h.controller.dispose(); }
  });
});

describe("comment anchors through a reload (T-11, W-9)", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const status = (h: ReturnType<typeof pinHarness>) => h.changed.mock.lastCall?.[0].status;

  it("is pending while the same canvas reloads and answered once the new document replies", () => {
    const h = pinHarness();
    try {
      expect(status(h)).toBe("answered");
      h.controller.command("reload");
      expect(status(h)).toBe("pending");
      h.layout({ document: "doc2" });
      expect(status(h)).toBe("pending");
      // A late answer from the old document does not end the wait.
      h.reply();
      expect(status(h)).toBe("pending");
      const q = h.current().contentWindow.postMessage.mock.calls.map(c => c[0]).filter(c => c.type === "anchors-query").at(-1);
      h.receive({ type: "anchors", document: "doc2", generation: q.generation, request: q.request, revision: 1, width: 600, selectionSeq: 0, selected: null,
        results: q.targets.map((t: { id: string }) => ({ id: t.id, candidates: { frame: [t.id] } })), rects: q.targets.map((t: { id: string }) => ({ node: t.id, x: 10, y: 10, width: 10, height: 10 })) });
      expect(status(h)).toBe("answered");
    } finally { h.controller.dispose(); }
  });

  it("ends the wait when the reload fails, the page is unlisted, the width is gone or the id changes", () => {
    vi.useFakeTimers();
    const cases: [string, (h: ReturnType<typeof pinHarness>) => void][] = [
      ["failed", h => { h.controller.command("reload"); vi.advanceTimersByTime(FIRST_LAYOUT_TIMEOUT_MS); }],
      ["unlisted", h => { h.current().dispatchEvent(new Event("load")); expect(status(h)).toBe("pending"); vi.advanceTimersByTime(1000); }],
      ["no width", h => { const { width: _width, ...row } = h.row; h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [row, h.other] }]); }],
      ["another id", h => { h.controller.updateEntries([{ path: "/repo", kind: "list", servedRev: 1, canvases: [{ ...h.row, id: "replaced" }, h.other] }]); }],
    ];
    for (const [name, end] of cases) {
      const h = pinHarness();
      try {
        end(h);
        expect([name, status(h)]).toEqual([name, "none"]);
      } finally { h.controller.dispose(); }
    }
  });
});
