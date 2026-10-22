import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { canScrollAxis, canvasScriptSource, clipText, nextHeight } from "./canvasScript";

describe("nextHeight", () => {
  test("sends the first measurement as is", () => {
    expect(nextHeight(null, 900, 150)).toEqual({ sent: 900, inner: 150, frozen: false });
  });

  test("follows a canvas that grows or shrinks without tracking the viewport", () => {
    const first = nextHeight(null, 900, 150);
    expect(nextHeight(first, 1200, 900)).toEqual({ sent: 1200, inner: 900, frozen: false });
    expect(nextHeight(first, 400, 150)).toEqual({ sent: 400, inner: 150, frozen: false });
  });

  test("freezes when the document still outgrows the viewport right after our own resize", () => {
    const first = nextHeight(null, 580, 150);
    // The iframe became 580 tall and the document grew with it (min-height: 100vh + padding).
    expect(nextHeight(first, 660, 580)).toEqual({ sent: 580, inner: 150, frozen: true });
  });

  test("treats a resize within 1px of the sent height as our own", () => {
    const first = nextHeight(null, 580, 150);
    expect(nextHeight(first, 700, 581).frozen).toBe(true);
    expect(nextHeight(first, 700, 579).frozen).toBe(true);
    expect(nextHeight(first, 700, 582).frozen).toBe(false);
  });

  test("does not freeze when the viewport did not change", () => {
    const first = nextHeight(null, 580, 580);
    expect(nextHeight(first, 900, 580)).toEqual({ sent: 900, inner: 580, frozen: false });
  });

  test("does not freeze when the document fits the resized viewport", () => {
    const first = nextHeight(null, 580, 150);
    expect(nextHeight(first, 581, 580).frozen).toBe(false);
    expect(nextHeight(first, 580, 580)).toEqual({ sent: 580, inner: 580, frozen: false });
  });

  test("stays frozen for the rest of the document", () => {
    const frozen = nextHeight(nextHeight(null, 580, 150), 660, 580);
    expect(nextHeight(frozen, 300, 580)).toEqual(frozen);
    expect(nextHeight(frozen, 5000, 900)).toEqual(frozen);
  });
});

describe("canScrollAxis", () => {
  test("scrolls an overflowing auto, scroll or overlay box in the wheel's direction", () => {
    for (const overflow of ["auto", "scroll", "overlay"]) {
      expect(canScrollAxis(overflow, 0, 100, 300, 10)).toBe(true);
    }
  });

  test("does not scroll a visible or hidden box", () => {
    expect(canScrollAxis("visible", 0, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("hidden", 0, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("clip", 0, 100, 300, 10)).toBe(false);
  });

  test("stops at either end", () => {
    expect(canScrollAxis("auto", 200, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("auto", 199.7, 100, 300, 10)).toBe(false);
    expect(canScrollAxis("auto", 150, 100, 300, 10)).toBe(true);
    expect(canScrollAxis("auto", 0, 100, 300, -10)).toBe(false);
    expect(canScrollAxis("auto", 1, 100, 300, -10)).toBe(true);
  });

  test("ignores an axis without movement or without overflow", () => {
    expect(canScrollAxis("auto", 50, 100, 300, 0)).toBe(false);
    expect(canScrollAxis("auto", 0, 100, 100, 10)).toBe(false);
  });
});

describe("clipText", () => {
  test("keeps short text and cuts long text at the limit", () => {
    expect(clipText("abc", 200)).toBe("abc");
    expect(clipText("a".repeat(201), 200)).toBe("a".repeat(200));
  });

  test("does not leave half of a surrogate pair", () => {
    expect(clipText(`${"a".repeat(199)}😀`, 200)).toBe("a".repeat(199));
  });
});

// A stand-in for the canvas window: just enough DOM for the script to run in a
// fresh VM context, which also proves the source has no outer references.
interface FakeElement {
  attrs?: Record<string, string>;
  rect?: { left: number; top: number; width: number; height: number };
  style?: { overflowX: string; overflowY: string };
  scrollTop?: number;
  scrollLeft?: number;
  clientHeight?: number;
  clientWidth?: number;
  scrollHeight?: number;
  scrollWidth?: number;
  parentElement?: FakeElement | null;
}

type Listener = (event: unknown) => void;

function fakeCanvas(options: { readyState?: string; height?: number; frames?: FakeElement[] } = {}) {
  const posted: unknown[] = [];
  const windowListeners = new Map<string, Listener[]>();
  const documentListeners = new Map<string, Listener[]>();
  const frames: unknown[] = [];
  const add = (map: Map<string, Listener[]>) => (type: string, listener: Listener) => {
    map.set(type, [...(map.get(type) ?? []), listener]);
  };
  const state = { height: options.height ?? 900 };
  const html: FakeElement & { getBoundingClientRect(): { height: number } } = {
    getBoundingClientRect: () => ({ height: state.height }),
  };
  const body = {};
  const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const element = (el: FakeElement) => ({
    ...el,
    getAttribute: (name: string) => el.attrs?.[name] ?? null,
    getBoundingClientRect: () => el.rect ?? { left: 0, top: 0, width: 0, height: 0 },
  });
  for (const frame of options.frames ?? []) frames.push(element(frame));
  const context: Record<string, unknown> = {
    parent,
    location: { href: "http://127.0.0.1:4000/t/tok/key/design/a.html" },
    innerHeight: 150,
    scrollX: 0,
    scrollY: 40,
    addEventListener: add(windowListeners),
    requestAnimationFrame: () => 0,
    getComputedStyle: (el: FakeElement) => el.style ?? { overflowX: "visible", overflowY: "visible" },
    ResizeObserver: class {
      observe() {}
    },
    MutationObserver: class {
      observe() {}
    },
    document: {
      readyState: options.readyState ?? "loading",
      addEventListener: add(documentListeners),
      documentElement: html,
      body,
      querySelectorAll: () => frames,
      fonts: { ready: new Promise(() => {}) },
    },
  };
  context.window = context;
  runInNewContext(canvasScriptSource(), context);
  const fire = (map: Map<string, Listener[]>, type: string, event: unknown) => {
    for (const listener of map.get(type) ?? []) listener(event);
  };
  return {
    posted,
    state,
    html,
    body,
    parent,
    context,
    ready: () => fire(documentListeners, "DOMContentLoaded", {}),
    fireWindow: (type: string, event: unknown) => fire(windowListeners, type, event),
    windowListeners,
  };
}

function wheelEvent(fields: Record<string, unknown>) {
  const event = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, clientX: 10, clientY: 20, prevented: false, ...fields };
  return Object.assign(event, {
    preventDefault() {
      event.prevented = true;
    },
  });
}

describe("canvasScriptSource", () => {
  test("posts nothing before DOMContentLoaded and the first layout synchronously after it", () => {
    const canvas = fakeCanvas({ height: 899.2 });
    expect(canvas.posted).toEqual([]);
    canvas.ready();
    expect(canvas.posted).toEqual([
      {
        message: { type: "layout", href: "http://127.0.0.1:4000/t/tok/key/design/a.html", height: 900, frames: [], truncated: false },
        origin: "*",
      },
    ]);
  });

  test("starts at once when injected after the document is parsed", () => {
    const canvas = fakeCanvas({ readyState: "interactive" });
    expect(canvas.posted).toHaveLength(1);
  });

  test("lists [data-doan-frame] elements in document order with board coordinates", () => {
    const canvas = fakeCanvas({
      frames: [
        { attrs: { "data-doan-frame": "b", "data-doan-title": "Second" }, rect: { left: 5, top: 10, width: 300, height: 200 } },
        { attrs: { "data-doan-frame": "" }, rect: { left: 0, top: -40, width: 0, height: 0 } },
        { attrs: { "data-doan-frame": "b" }, rect: { left: 1, top: 2, width: 3, height: 4 } },
      ],
    });
    canvas.ready();
    expect(canvas.posted[0]).toMatchObject({
      message: {
        frames: [
          { id: "b", title: "Second", x: 5, y: 50, width: 300, height: 200 },
          { id: "", x: 0, y: 0, width: 0, height: 0 },
          { id: "b", x: 1, y: 42, width: 3, height: 4 },
        ],
        truncated: false,
      },
    });
    const second = (canvas.posted[0] as { message: { frames: object[] } }).message.frames[1];
    expect(second).not.toHaveProperty("title");
  });

  test("cuts the list at 1,000 frames and strings at 200 characters", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ attrs: { "data-doan-frame": `f${i}` } }));
    const canvas = fakeCanvas({ frames: many });
    canvas.ready();
    const message = (canvas.posted[0] as { message: { frames: object[]; truncated: boolean } }).message;
    expect(message.frames).toHaveLength(1000);
    expect(message.truncated).toBe(true);

    const long = fakeCanvas({ frames: [{ attrs: { "data-doan-frame": "x", "data-doan-title": "t".repeat(201) } }] });
    long.ready();
    expect(long.posted[0]).toMatchObject({ message: { frames: [{ id: "x", title: "t".repeat(200) }], truncated: true } });
  });

  test("answers measure from the parent synchronously and ignores other senders", () => {
    const canvas = fakeCanvas();
    canvas.ready();
    canvas.state.height = 1234;
    canvas.fireWindow("message", { source: {}, data: { type: "measure" } });
    expect(canvas.posted).toHaveLength(1);
    canvas.fireWindow("message", { source: canvas.parent, data: { type: "other" } });
    canvas.fireWindow("message", { source: canvas.parent, data: null });
    expect(canvas.posted).toHaveLength(1);
    canvas.fireWindow("message", { source: canvas.parent, data: { type: "measure" } });
    expect(canvas.posted).toHaveLength(2);
    expect(canvas.posted[1]).toMatchObject({ message: { type: "layout", height: 1234 } });
  });

  test("installs once per document", () => {
    const canvas = fakeCanvas({ readyState: "complete" });
    runInNewContext(canvasScriptSource(), canvas.context);
    expect(canvas.posted).toHaveLength(1);
    expect(canvas.windowListeners.get("wheel")).toHaveLength(1);
  });

  test("forwards a Ctrl or Cmd wheel as zoom even over a scrollable box", () => {
    const canvas = fakeCanvas();
    const box: FakeElement = { style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 0, clientHeight: 100, scrollHeight: 300, parentElement: null };
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = wheelEvent({ target: box, deltaY: 10, ...modifier });
      canvas.fireWindow("wheel", event);
      expect(event.prevented).toBe(true);
    }
    expect(canvas.posted.map((p) => (p as { message: { ctrl: boolean; meta: boolean } }).message)).toEqual([
      { type: "wheel", dx: 0, dy: 10, ctrl: true, meta: false, deltaMode: 0, x: 10, y: 60 },
      { type: "wheel", dx: 0, dy: 10, ctrl: false, meta: true, deltaMode: 0, x: 10, y: 60 },
    ]);
  });

  test("leaves a plain wheel to an ancestor that can still scroll that way", () => {
    const canvas = fakeCanvas();
    const box: FakeElement = { style: { overflowX: "visible", overflowY: "auto" }, scrollTop: 0, clientHeight: 100, scrollHeight: 300, parentElement: null };
    const inner: FakeElement = { parentElement: box };
    const event = wheelEvent({ target: inner, deltaY: 10 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(false);
    expect(canvas.posted).toEqual([]);
  });

  test("pans with a plain wheel when no ancestor can scroll further", () => {
    const canvas = fakeCanvas();
    const atEnd: FakeElement = { style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 200, clientHeight: 100, scrollHeight: 300, parentElement: canvas.body as FakeElement };
    const event = wheelEvent({ target: atEnd, deltaY: 10, deltaX: -3, deltaMode: 1 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(true);
    expect(canvas.posted).toEqual([{ message: { type: "wheel", dx: -3, dy: 10, ctrl: false, meta: false, deltaMode: 1, x: 10, y: 60 }, origin: "*" }]);
  });

  test("does not treat the document's own scrolling as an inner scroller", () => {
    const canvas = fakeCanvas();
    Object.assign(canvas.html, { style: { overflowX: "auto", overflowY: "auto" }, scrollTop: 0, clientHeight: 150, scrollHeight: 900, parentElement: null });
    const event = wheelEvent({ target: canvas.html, deltaY: 10 });
    canvas.fireWindow("wheel", event);
    expect(event.prevented).toBe(true);
  });
});
