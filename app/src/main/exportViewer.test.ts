import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import { describe, expect, test } from "vitest";
import { MAX_FRAMES, MAX_HREF, MAX_STRING, parseCanvasMessage } from "../renderer/canvasMessage";
import { INITIAL_HEIGHT, layoutHeight as appLayoutHeight, MAX_HEIGHT } from "../renderer/canvasView";
import { frameLabel } from "../renderer/canvasTree";
import { currentFrame as appCurrentFrame } from "../renderer/currentFrame";
import {
  FIRST_LAYOUT_TIMEOUT_MS, FIT_INSET, FIT_SCALE_MAX, fitFrame as appFitFrame, fitWidth as appFitWidth, LINE_PX, MAX_SCALE, MIN_SCALE, PAGE_PX,
  WHEEL_ZOOM_MAX, WHEEL_ZOOM_SENSITIVITY, wheelAction as appWheelAction, ZOOM_LIMITS, ZOOM_STEP, zoomAt as appZoomAt,
} from "../renderer/viewport";
import { canScrollAxis, clipText, documentHeight, frameBottom, nextHeight } from "./canvasScript";
import { toolShortcut as appToolShortcut, type ShortcutEvent } from "../renderer/canvasTool";
import { editableTarget as appEditableTarget } from "../renderer/selection";
import { panBy as appPanBy } from "../renderer/viewport";

// The viewer files `doan export` embeds (cli/internal/export/viewer/). They are plain browser
// scripts, not app code, so this file is where they are held to the app's behaviour.
const read = (name: string): string => readFileSync(new URL(`../../../cli/internal/export/viewer/${name}`, import.meta.url), "utf8");
const lib = read("lib.js");
const measure = read("measure.js");
const shellJs = read("shell.js");
const shellCss = read("shell.css");
const shellHtml = read("shell.html");

// Every lib.js function and constant the tests reach, loaded in a context with no globals: a
// reference to `document` or `window` at load time, or a missing name, fails here.
const NAMES = [
  "MIN_SCALE", "MAX_SCALE", "ZOOM_STEP", "WHEEL_ZOOM_MAX", "WHEEL_ZOOM_SENSITIVITY", "LINE_PX", "PAGE_PX", "FIT_INSET", "FIT_SCALE_MAX",
  "FIRST_LAYOUT_TIMEOUT_MS", "INITIAL_HEIGHT", "MAX_HEIGHT", "REMEASURE_MS", "MAX_FRAMES", "MAX_STRING", "MAX_HREF",
  "nextHeight", "documentHeight", "frameBottom", "canScrollAxis", "clipText", "parseLayout", "parseWheel", "parseMessage", "acceptMessage",
  "fitScale", "fitWidth", "fitFrame", "zoomAt", "wheelAction", "geometry", "scrollFor", "viewFrom", "currentFrame", "layoutHeight",
  "initialViewer", "viewerLayout", "viewerTimeout", "frameName", "drawerView", "ZOOM_ITEMS", "zoomView", "shortcutCommand", "popupOpen", "popupKey", "popupBlur",
  "toolShortcut", "editableTarget", "panScroll", "layerShown", "escapeSelects", "toolbarMove",
];
type Lib = Record<string, any>;
const load = (source: string): Lib => runInNewContext(`${source}\n({ ${NAMES.join(", ")} })`, {}) as Lib;
const v = load(lib);

// ── Golden: the height rules are the app's, as text ───────────────────────────

// Vitest hands over the transformed function (types and comments gone, tabs, `.5`, hex literals in
// decimal, a `;` after a loop's brace), so both sides are reduced to tokens before they are compared.
function normalize(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ?([{}()[\];,:?<>=!+\-*/|&]) ?/g, "$1")
    .replace(/\};/g, "}")
    .replace(/;\}/g, "}")
    .replace(/(^|[^\w.])\.(\d)/g, "$10.$2")
    .replace(/\b0x[0-9a-f]+\b/gi, hex => String(parseInt(hex, 16)))
    .trim();
}

// The text of `function name(...) {...}` in a source, found by matching braces outside comments,
// strings and regular expressions' escapes.
function extractFunction(source: string, name: string): string {
  const start = source.search(new RegExp(`^function ${name}\\(`, "m"));
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  let seen = false;
  for (let i = source.indexOf("{", source.indexOf(")", start)); i < source.length; i++) {
    const rest = source.slice(i);
    if (rest.startsWith("//")) { i = source.indexOf("\n", i); continue; }
    if (rest.startsWith("/*")) { i = source.indexOf("*/", i) + 1; continue; }
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; source[i] !== ch; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (ch === "{") { depth++; seen = true; }
    if (ch === "}") depth--;
    if (seen && depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`function ${name} is not closed`);
}

describe("lib.js height and scroll rules", () => {
  const golden = { nextHeight, documentHeight, frameBottom, canScrollAxis, clipText };
  test.each(Object.entries(golden))("%s is the same function as in canvasScript.ts", (name, fn) => {
    const app = normalize(fn.toString());
    expect(app.length).toBeGreaterThan(40);
    expect(normalize(extractFunction(lib, name))).toBe(app);
  });

  test("the comparison fails when a copy drifts", () => {
    const drifted = lib.replace("Math.abs(inner - prev.sent) <= 1", "Math.abs(inner - prev.sent) <= 2");
    expect(drifted).not.toBe(lib);
    expect(normalize(extractFunction(drifted, "nextHeight"))).not.toBe(normalize(nextHeight.toString()));
    const dropped = lib.replace('link.position === "fixed"', 'link.position === "sticky"');
    expect(normalize(extractFunction(dropped, "frameBottom"))).not.toBe(normalize(frameBottom.toString()));
  });

  // The POSTMORTEM 2026-11-01 canvas: absolutely positioned frames and a document that is no
  // taller than the iframe once it fits. The viewer's functions must settle, not alternate.
  test("a canvas of absolutely positioned frames settles on its extent", () => {
    const inner = 150;
    let state = v.nextHeight(null, v.documentHeight(0, 405, inner, 405), inner, 0);
    expect(state.sent).toBe(405);
    const fitted = v.nextHeight(state, v.documentHeight(0, 405, 405, 405), 405, 0);
    expect(fitted.sent).toBe(405);
    state = fitted;
    expect(v.nextHeight(state, v.documentHeight(0, 405, 405, 405), 405, 0).sent).toBe(405);
  });
});

// ── Constants and the zoom model ──────────────────────────────────────────────

const appRemeasure = Number(/const REMEASURE_MS = (\d+);/.exec(readFileSync(new URL("../renderer/CanvasController.ts", import.meta.url), "utf8"))?.[1]);

describe("lib.js constants", () => {
  test("zoom and Fit constants are the app's", () => {
    expect({ MIN_SCALE: v.MIN_SCALE, MAX_SCALE: v.MAX_SCALE, ZOOM_STEP: v.ZOOM_STEP, WHEEL_ZOOM_MAX: v.WHEEL_ZOOM_MAX, WHEEL_ZOOM_SENSITIVITY: v.WHEEL_ZOOM_SENSITIVITY, LINE_PX: v.LINE_PX, PAGE_PX: v.PAGE_PX, FIT_SCALE_MAX: v.FIT_SCALE_MAX })
      .toEqual({ MIN_SCALE, MAX_SCALE, ZOOM_STEP, WHEEL_ZOOM_MAX, WHEEL_ZOOM_SENSITIVITY, LINE_PX, PAGE_PX, FIT_SCALE_MAX });
    expect(v.FIT_INSET).toEqual(FIT_INSET);
  });

  test("timing, height and message limits are the app's", () => {
    expect(v.FIRST_LAYOUT_TIMEOUT_MS).toBe(FIRST_LAYOUT_TIMEOUT_MS);
    expect(v.FIRST_LAYOUT_TIMEOUT_MS).toBe(5000);
    expect(v.INITIAL_HEIGHT).toBe(INITIAL_HEIGHT);
    expect(v.MAX_HEIGHT).toBe(MAX_HEIGHT);
    expect(appRemeasure).toBeGreaterThan(0);
    expect(v.REMEASURE_MS).toBe(appRemeasure);
    expect(v.MAX_FRAMES).toBe(MAX_FRAMES);
    expect(v.MAX_STRING).toBe(MAX_STRING);
    expect(v.MAX_HREF).toBe(MAX_HREF);
  });
});

const viewports = [{ width: 960, height: 544 }, { width: 1440, height: 900 }, { width: 100, height: 100 }, { width: 64, height: 160 }, { width: 0, height: 0 }];

describe("lib.js zoom math", () => {
  test("fitScale equals the app's Fit scale", () => {
    for (const viewport of viewports) {
      for (const width of [0, 1, 320, 960, 1440, 2000, 100000]) {
        expect(v.fitScale(width, viewport, FIT_INSET)).toBe(appFitWidth(width, viewport, FIT_INSET).scale);
      }
    }
  });

  test("fitWidth, fitFrame, zoomAt and currentFrame equal the app's", () => {
    const current = { x: 10, y: -20, scale: 0.7 };
    const rects = [{ x: 0, y: 0, width: 360, height: 500 }, { x: 40, y: 1160, width: 1200, height: 3000 }, { x: 5, y: 5, width: 0, height: 10 }, { x: -20, y: 30, width: 50, height: 0 }];
    for (const viewport of viewports) {
      expect(v.fitWidth(1440, viewport)).toEqual(appFitWidth(1440, viewport, FIT_INSET));
      for (const rect of rects) expect(v.fitFrame(rect, viewport, current)).toEqual(appFitFrame(rect, viewport, FIT_INSET, current));
      const frames = [rects[0]!, { x: 0, y: 0, width: 2000, height: 2000 }, { x: 100, y: 100, width: 100, height: 100 }];
      for (const view of [current, { x: 0, y: 0, scale: 1 }, { x: -500, y: -300, scale: 2 }, { x: 300, y: 700, scale: 0.2 }]) {
        expect(v.currentFrame(frames, view, viewport)).toBe(appCurrentFrame(frames, view, viewport));
        expect(v.currentFrame([], view, viewport)).toBe(appCurrentFrame([], view, viewport));
      }
    }
    for (const factor of [1.25, 0.8, 100, 0.001, 0, -1, NaN, Infinity]) {
      expect(v.zoomAt(current, factor, { x: 400, y: 300 })).toEqual(appZoomAt(current, factor, { x: 400, y: 300 }, ZOOM_LIMITS));
    }
  });

  test("wheelAction equals the app's for each delta mode", () => {
    const inputs = [
      { dx: 0, dy: 100, ctrl: true, meta: false, deltaMode: 0 },
      { dx: 0, dy: -3, ctrl: false, meta: true, deltaMode: 1 },
      { dx: 0, dy: 2, ctrl: true, meta: false, deltaMode: 2 },
      { dx: 0, dy: NaN, ctrl: true, meta: false, deltaMode: 0 },
      { dx: 0, dy: Infinity, ctrl: true, meta: false, deltaMode: 0 },
      { dx: 12, dy: -30, ctrl: false, meta: false, deltaMode: 0 },
      { dx: 1, dy: 2, ctrl: false, meta: false, deltaMode: 1 },
      { dx: NaN, dy: Infinity, ctrl: false, meta: false, deltaMode: 2 },
    ];
    for (const input of inputs) expect(v.wheelAction(input)).toEqual(appWheelAction(input));
  });

  test("layoutHeight equals the app's within one document", () => {
    for (const current of [150, 580, 0]) {
      for (const layout of [{ height: 900, viewport: current }, { height: 900, viewport: current + 1 }, { height: 900, viewport: current + 2 }, { height: 999999, viewport: current }, { height: 0, viewport: current }]) {
        expect(v.layoutHeight(current, layout)).toBe(appLayoutHeight("https://x/a.html", current, { ...layout, href: "https://x/a.html" }));
      }
    }
  });

  test("a view survives the trip through scroll offsets", () => {
    const viewport = { width: 960, height: 544 };
    for (const scale of [0.05, 0.62, 1, 2.5, 4]) {
      const geom = v.geometry(scale, 1440, 1662, viewport);
      for (const view of [{ x: geom.left - 100, y: geom.top - 250, scale }, { x: geom.left, y: geom.top, scale }]) {
        expect(v.viewFrom(v.scrollFor(view, geom), scale, geom)).toEqual(view);
      }
    }
  });

  test("the board is centred when it is narrower than the window and keeps the inset when it is wider", () => {
    const viewport = { width: 1000, height: 600 };
    expect(v.geometry(0.5, 800, 1000, viewport)).toEqual({ left: 300, top: 80, minWidth: 464, height: 660 });
    expect(v.geometry(1, 1440, 1000, viewport)).toEqual({ left: 32, top: 80, minWidth: 1504, height: 1160 });
    // Fit puts the board at the top inset with scroll 0.
    const fit = v.fitWidth(1440, viewport);
    expect(v.scrollFor(fit, v.geometry(fit.scale, 1440, 1000, viewport)).top).toBe(0);
  });
});

// ── Messages from the canvas ──────────────────────────────────────────────────

const frame = (extra: Record<string, unknown> = {}) => ({ id: "a", x: 0, y: 0, width: 10, height: 10, ...extra });
const layout = (extra: Record<string, unknown> = {}) => ({ type: "layout", href: "about:srcdoc", height: 500, viewport: 150, frames: [frame()], ...extra });

describe("message validation", () => {
  const rejected: [string, unknown][] = [
    ["a string", "layout"],
    ["null", null],
    ["an array", [layout()]],
    ["an unknown type", { type: "select", href: "x" }],
    ["a layout without href", layout({ href: undefined })],
    ["a layout with a numeric href", layout({ href: 1 })],
    ["a layout with an href over the limit", layout({ href: "x".repeat(MAX_HREF + 1) })],
    ["a negative height", layout({ height: -1 })],
    ["a non-finite height", layout({ height: Infinity })],
    ["a string height", layout({ height: "500" })],
    ["a negative viewport", layout({ viewport: -1 })],
    ["frames that are not an array", layout({ frames: {} })],
    ["a wheel without ctrl", { type: "wheel", dx: 0, dy: 1, meta: false, deltaMode: 0, x: 0, y: 0 }],
    ["a wheel with delta mode 3", { type: "wheel", dx: 0, dy: 1, ctrl: false, meta: false, deltaMode: 3, x: 0, y: 0 }],
    ["a wheel with a NaN position", { type: "wheel", dx: 0, dy: 1, ctrl: false, meta: false, deltaMode: 0, x: NaN, y: 0 }],
    ["a wheel with an infinite delta", { type: "wheel", dx: Infinity, dy: 1, ctrl: false, meta: false, deltaMode: 0, x: 0, y: 0 }],
  ];
  test.each(rejected)("drops %s", (_label, data) => {
    expect(v.parseMessage(data)).toBeNull();
  });

  test("keeps a valid layout as a fresh object with only the fields the page reads", () => {
    const input = layout({ document: "tok", seq: 3, frames: [frame({ title: "Cart", implements: "x" })], extra: { a: 1 } });
    const parsed = v.parseMessage(input);
    expect(parsed).toEqual({ type: "layout", height: 500, viewport: 150, frames: [{ id: "a", title: "Cart", x: 0, y: 0, width: 10, height: 10 }], total: 1 });
    expect(parsed.frames[0]).not.toBe(input.frames[0]);
  });

  test("agrees with the app on which layouts are valid and which frames they list", () => {
    const cases = [
      layout(), layout({ frames: [] }), layout({ frames: [frame({ title: 5 })] }), layout({ frames: [frame({ width: -1 }), frame({ id: "b" })] }),
      layout({ frames: [frame({ id: "q".repeat(300), title: "t".repeat(300) })] }), layout({ frames: [frame({ id: "\u{1f600}".repeat(150) })] }),
      layout({ frames: [null, 3, frame({ id: "ok" })] }), layout({ height: 0 }), layout({ viewport: 0 }),
      layout({ frames: Array.from({ length: MAX_FRAMES + 5 }, (_, i) => frame({ id: `f${i}` })) }),
    ];
    for (const input of cases) {
      const mine = v.parseMessage(input);
      const app = parseCanvasMessage(input);
      expect(mine === null).toBe(app === null);
      if (mine !== null && app !== null && app.type === "layout") {
        expect(mine.frames).toEqual(app.frames);
        expect(mine.height).toBe(app.height);
        expect(mine.viewport).toBe(app.viewport);
      }
    }
  });

  test("clips an id at 200 code units without splitting a surrogate pair", () => {
    const parsed = v.parseMessage(layout({ frames: [frame({ id: "a".repeat(199) + "\u{1f600}", title: "b".repeat(250) })] }));
    expect(parsed.frames[0].id).toBe("a".repeat(199));
    expect(parsed.frames[0].title).toHaveLength(MAX_STRING);
  });

  test("lists at most 1,000 frames and reports how many the canvas has", () => {
    const many = Array.from({ length: MAX_FRAMES + 240 }, (_, i) => frame({ id: `f${i}` }));
    const parsed = v.parseMessage(layout({ frames: many.slice(0, MAX_FRAMES), total: MAX_FRAMES + 240 }));
    expect(parsed.frames).toHaveLength(MAX_FRAMES);
    expect(parsed.total).toBe(MAX_FRAMES + 240);
    // A page that sent the whole list is still capped, and a total smaller than the list is not believed.
    expect(v.parseMessage(layout({ frames: many })).frames).toHaveLength(MAX_FRAMES);
    expect(v.parseMessage(layout({ frames: many })).total).toBe(many.length);
    expect(v.parseMessage(layout({ frames: many, total: 3 })).total).toBe(many.length);
    expect(v.parseMessage(layout({ total: "9" })).total).toBe(1);
    expect(v.parseMessage(layout({ frames: [], total: 1.5 })).total).toBe(0);
  });

  test("keeps a valid wheel", () => {
    const input = { type: "wheel", dx: 1, dy: -2, ctrl: true, meta: false, deltaMode: 1, x: 5, y: 6, extra: 1 };
    expect(v.parseMessage(input)).toEqual({ type: "wheel", dx: 1, dy: -2, ctrl: true, meta: false, deltaMode: 1, x: 5, y: 6 });
    expect(parseCanvasMessage(input)).toMatchObject({ type: "wheel", dx: 1, dy: -2, deltaMode: 1 });
  });

  test("accepts only the iframe's own window and the opaque origin", () => {
    const win = {};
    const data = layout();
    expect(v.acceptMessage({ source: win, origin: "null", data }, win)).not.toBeNull();
    expect(v.acceptMessage({ source: {}, origin: "null", data }, win)).toBeNull();
    expect(v.acceptMessage({ source: win, origin: "https://evil.example", data }, win)).toBeNull();
    expect(v.acceptMessage({ source: win, origin: "file://", data }, win)).toBeNull();
    // A detached iframe has a null contentWindow; a message from a closed window has a null source.
    expect(v.acceptMessage({ source: null, origin: "null", data }, null)).toBeNull();
    expect(v.acceptMessage({ source: undefined, origin: "null", data }, undefined)).toBeNull();
    expect(v.acceptMessage({ source: win, origin: "null", data: "nope" }, win)).toBeNull();
  });
});

// ── Viewer state ──────────────────────────────────────────────────────────────

describe("first layout and its timeout", () => {
  test("the board is hidden until the first layout, which shows it at the height the canvas reported", () => {
    const start = v.initialViewer();
    expect(start).toEqual({ phase: "loading", height: INITIAL_HEIGHT, frames: null, total: 0 });
    const first = v.viewerLayout(start, v.parseMessage(layout({ height: 900, viewport: INITIAL_HEIGHT })));
    expect(first.ready).toBe(true);
    expect(first.state.phase).toBe("ready");
    expect(first.state.height).toBe(900);
    expect(first.remeasure).toBe(true);
    // The canvas then reports from inside the resized iframe: confirmed, nothing more to ask.
    const confirmed = v.viewerLayout(first.state, v.parseMessage(layout({ height: 900, viewport: 900 })));
    expect(confirmed).toMatchObject({ ready: false, remeasure: false, state: { height: 900 } });
  });

  test("a layout measured before our resize reached the canvas keeps the current height and asks again", () => {
    const first = v.viewerLayout(v.initialViewer(), v.parseMessage(layout({ height: 900, viewport: INITIAL_HEIGHT })));
    const stale = v.viewerLayout(first.state, v.parseMessage(layout({ height: 1200, viewport: INITIAL_HEIGHT })));
    expect(stale.state.height).toBe(900);
    expect(stale.remeasure).toBe(true);
  });

  test("a height over the cap is capped, and the cap is not asked about forever", () => {
    const first = v.viewerLayout(v.initialViewer(), v.parseMessage(layout({ height: MAX_HEIGHT * 2, viewport: INITIAL_HEIGHT })));
    expect(first.state.height).toBe(MAX_HEIGHT);
    const settled = v.viewerLayout(first.state, v.parseMessage(layout({ height: MAX_HEIGHT * 2, viewport: MAX_HEIGHT })));
    expect(settled.state.height).toBe(MAX_HEIGHT);
    expect(settled.remeasure).toBe(false);
  });

  test("without any layout the wait ends at the timeout: the board shows at the last height, once", () => {
    const start = v.initialViewer();
    const timed = v.viewerTimeout(start);
    expect(timed.ready).toBe(true);
    expect(timed.state).toEqual({ phase: "ready", height: INITIAL_HEIGHT, frames: null, total: 0 });
    expect(timed.remeasure).toBe(false);
    expect(v.viewerTimeout(timed.state).ready).toBe(false);
  });

  test("the timeout does nothing once a layout came, and a late layout still counts", () => {
    const ready = v.viewerLayout(v.initialViewer(), v.parseMessage(layout({ height: 700, viewport: INITIAL_HEIGHT }))).state;
    expect(v.viewerTimeout(ready)).toEqual({ state: ready, ready: false, remeasure: false });
    const late = v.viewerLayout(v.viewerTimeout(v.initialViewer()).state, v.parseMessage(layout({ height: 700, viewport: INITIAL_HEIGHT })));
    expect(late.ready).toBe(false);
    expect(late.state.height).toBe(700);
  });

  test("shell.js waits FIRST_LAYOUT_TIMEOUT_MS and only acts on a timeout that is the first ready", () => {
    expect(shellJs).toMatch(/setTimeout\(\(\) => \{\s*const result = viewerTimeout\(viewer\);\s*if \(result\.ready\) step\(result\);\s*\}, FIRST_LAYOUT_TIMEOUT_MS\);/);
  });
});

describe("frame drawer view", () => {
  const frames = [{ id: "cart", title: "Cart — default" }, { id: "empty" }, { id: "", title: "  " }, { id: "pay", title: " Payment " }].map((f, i) => ({ ...f, x: 0, y: i * 600, width: 360, height: 500 }));

  test("no layout yet: Frames, off", () => {
    expect(v.drawerView(null, 0, null)).toEqual({ enabled: false, buttonLabel: "Frames", ariaLabel: "Frames", rows: [], note: null });
  });

  test("a canvas with no frames says No frames and is off", () => {
    expect(v.drawerView([], 0, null)).toEqual({ enabled: false, buttonLabel: "No frames", ariaLabel: "No frames", rows: [], note: null });
    const viewer = v.viewerLayout(v.initialViewer(), v.parseMessage(layout({ frames: [] }))).state;
    expect(v.drawerView(viewer.frames, viewer.total, null).buttonLabel).toBe("No frames");
  });

  test("rows are numbered in document order with a title, else the id, else (no id)", () => {
    const shown = v.drawerView(frames, frames.length, 3);
    expect(shown.rows.map((row: { number: number; name: string }) => [row.number, row.name])).toEqual([[1, "Cart — default"], [2, "empty"], [3, "(no id)"], [4, "Payment"]]);
    expect(shown.rows.map((row: { current: boolean }) => row.current)).toEqual([false, false, false, true]);
    expect(shown).toMatchObject({ enabled: true, buttonLabel: "4. Payment", ariaLabel: "Frame 4: Payment", note: null });
    // The same names the app's drawer shows.
    for (const [index, row] of shown.rows.entries()) expect(row.name).toBe(frameLabel(frames[index]!, index).name);
  });

  test("with no frame in view the button says Frames", () => {
    expect(v.drawerView(frames, frames.length, null)).toMatchObject({ enabled: true, buttonLabel: "Frames", ariaLabel: "Frames" });
  });

  test("after 1,000 frames the note says how many are left out", () => {
    const listed = Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, x: 0, y: 0, width: 1, height: 1 }));
    expect(v.drawerView(listed, 1240, 0).note).toBe("Showing the first 1,000 frames. 240 more aren’t listed.");
    expect(v.drawerView(listed, 1000, 0).note).toBeNull();
    expect(v.drawerView(listed, 1001, 0).note).toBe("Showing the first 1,000 frames. 1 more aren’t listed.");
    expect(v.drawerView(listed, 1234567, 0).note).toBe("Showing the first 1,000 frames. 1,233,567 more aren’t listed.");
  });
});

describe("zoom view and shortcuts", () => {
  test("the value and labels follow the scale, and are off until the board is ready", () => {
    expect(v.zoomView(0.622222, true)).toEqual({ enabled: true, value: "62%", triggerLabel: "Zoom 62%, zoom options", zoomOutDisabled: false, zoomInDisabled: false });
    expect(v.zoomView(1, false)).toEqual({ enabled: false, value: "—", triggerLabel: "Zoom options", zoomOutDisabled: true, zoomInDisabled: true });
    expect(v.zoomView(MIN_SCALE, true)).toMatchObject({ zoomOutDisabled: true, zoomInDisabled: false });
    expect(v.zoomView(MAX_SCALE, true)).toMatchObject({ zoomOutDisabled: false, zoomInDisabled: true });
    // 0.052 shows 5% and can still zoom out.
    expect(v.zoomView(0.052, true)).toMatchObject({ value: "5%", zoomOutDisabled: false });
  });

  test("the menu is Fit ⇧1, 100% ⇧0, then 50% and 200%", () => {
    expect(v.ZOOM_ITEMS.map((item: { label: string; shortcut?: string; scale?: number }) => [item.label, item.shortcut ?? null, item.scale ?? null])).toEqual([
      ["Fit", "⇧1", null], ["100%", "⇧0", null], ["50%", null, 0.5], ["200%", null, 2],
    ]);
  });

  test("⇧1 is Fit and ⇧0 is 100%, by physical key, and nothing else is", () => {
    const key = (code: string, extra: Record<string, boolean> = {}) => ({ code, shiftKey: true, ctrlKey: false, metaKey: false, altKey: false, ...extra });
    expect(v.shortcutCommand(key("Digit1"))).toBe("fit");
    expect(v.shortcutCommand(key("Digit0"))).toBe("actual");
    expect(v.shortcutCommand(key("Digit2"))).toBeNull();
    expect(v.shortcutCommand(key("Digit1", { shiftKey: false }))).toBeNull();
    // ⌘1 and ⌘0 belong to the browser.
    expect(v.shortcutCommand(key("Digit1", { metaKey: true }))).toBeNull();
    expect(v.shortcutCommand(key("Digit0", { ctrlKey: true }))).toBeNull();
    expect(v.shortcutCommand(key("Digit0", { altKey: true }))).toBeNull();
  });

  test("shell.js runs the shortcut only once the board is ready", () => {
    expect(shellJs).toMatch(/shortcutCommand\(event\);\s*if \(command === null \|\| viewer\.phase !== "ready"\) return;/);
  });
});

describe("popup lists", () => {
  test("opening starts on the current row, or the first, and an empty list does not open", () => {
    expect(v.popupOpen(5, 3)).toMatchObject({ open: true, active: 3, focus: "list" });
    expect(v.popupOpen(5, 9)).toMatchObject({ active: 4 });
    expect(v.popupOpen(5, -1)).toMatchObject({ active: 0 });
    expect(v.popupOpen(0, 0)).toMatchObject({ open: false, active: -1 });
  });

  test("Escape closes and returns focus to the trigger without picking", () => {
    const open = v.popupOpen(5, 2);
    expect(v.popupKey(open, "Escape", 5)).toEqual({ open: false, active: -1, focus: "trigger", pick: -1, prevent: true });
  });

  test("Enter and Space pick the active row, close and return focus to the trigger", () => {
    const open = { ...v.popupOpen(5, 2), active: 3 };
    for (const key of ["Enter", " "]) expect(v.popupKey(open, key, 5)).toEqual({ open: false, active: -1, focus: "trigger", pick: 3, prevent: true });
    expect(v.popupKey({ ...open, active: -1 }, "Enter", 5).pick).toBe(-1);
  });

  test("arrow keys stop at the ends; Home and End jump", () => {
    let popup = v.popupOpen(3, 0);
    popup = v.popupKey(popup, "ArrowUp", 3);
    expect(popup.active).toBe(0);
    popup = v.popupKey(popup, "ArrowDown", 3);
    popup = v.popupKey(popup, "ArrowDown", 3);
    popup = v.popupKey(popup, "ArrowDown", 3);
    expect(popup).toMatchObject({ open: true, active: 2, focus: "list", prevent: true });
    expect(v.popupKey(popup, "Home", 3).active).toBe(0);
    expect(v.popupKey(popup, "End", 3).active).toBe(2);
  });

  test("focus moving into the canvas closes an open popup and leaves focus there", () => {
    const open = v.popupOpen(3, 1);
    expect(v.popupBlur(open, true)).toEqual({ open: false, active: -1, focus: "none", pick: -1, prevent: false });
    // Not to the trigger: that would pull focus back out of the canvas.
    expect(v.popupBlur(open, true).focus).not.toBe("trigger");
    // Focus leaving the window for somewhere else, or a popup that is already closed, changes nothing.
    expect(v.popupBlur(open, false)).toBe(open);
    const closed = v.popupKey(open, "Escape", 3);
    expect(v.popupBlur(closed, true)).toBe(closed);
  });

  test("shell.js closes its popups on window blur through popupBlur, with focus left alone", () => {
    expect(shellJs).toMatch(/window\.addEventListener\("blur", \(\) => \{\s*if \(popupBlur\(popup, document\.activeElement === canvas\)\.open !== popup\.open\) hide\("none"\);\s*\}\);/);
  });

  test("Tab does not leave the open list; other keys are left alone", () => {
    const open = v.popupOpen(3, 1);
    expect(v.popupKey(open, "Tab", 3)).toMatchObject({ open: true, active: 1, prevent: true, focus: "none" });
    expect(v.popupKey(open, "a", 3)).toMatchObject({ open: true, active: 1, prevent: false, focus: "none" });
    expect(v.popupKey(open, "ArrowDown", 0)).toMatchObject({ prevent: false });
  });
});

// ── Tools: Select and Hand (export-viewer-chrome) ─────────────────────────────

describe("tool keys are the app's", () => {
  const press = (over: Partial<ShortcutEvent> = {}): ShortcutEvent => ({ type: "keydown", code: "KeyV", key: "v", repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
  const element = (tagName: string, attributes: Record<string, string> = {}, editable = false) => ({ tagName, isContentEditable: editable, getAttribute: (name: string) => attributes[name] ?? null, hasAttribute: (name: string) => name in attributes });
  const targets: [string, unknown][] = [
    ["no target", null], ["a string", "BUTTON"], ["an object without tagName", {}], ["a div", element("DIV")], ["the board", element("MAIN", { tabindex: "0" })],
    ["an input", element("INPUT")], ["a textarea", element("TEXTAREA")], ["a select", element("SELECT")], ["a contenteditable div", element("DIV", {}, true)],
    ["a button", element("BUTTON")], ["a link", element("A", { href: "#x" })], ["an anchor without href", element("A")],
    ...["button", "menuitem", "treeitem", "option", "tab", "switch", "checkbox", "radio", "combobox", "listbox", "dialog"].map((role): [string, unknown] => [`role=${role}`, element("DIV", { role })]),
  ];
  const keys: [string, string][] = [["KeyV", "v"], ["KeyH", "h"], ["KeyV", "ㅍ"], ["KeyH", "ㅗ"], ["KeyV", "V"], ["Space", " "], ["KeyB", "v"], ["KeyA", "a"], ["Escape", "Escape"], ["Digit1", "!"]];
  const flags: [string, Partial<ShortcutEvent>][] = [
    ["plain", {}], ["a repeat", { repeat: true }], ["an IME composition", { isComposing: true }], ["keyCode 229", { keyCode: 229 }],
    ["⌘", { metaKey: true }], ["⌃", { ctrlKey: true }], ["⌥", { altKey: true }], ["⇧", { shiftKey: true }], ["a handled key", { defaultPrevented: true }],
  ];
  const events: [string, ShortcutEvent][] = [];
  for (const type of ["keydown", "keyup", "keypress"]) {
    for (const [code, key] of keys) {
      for (const [flag, over] of flags) {
        for (const [where, target] of targets) events.push([`${type} ${code} (${key}) ${flag} on ${where}`, press({ type, code, key, ...over, target })]);
      }
    }
  }

  test("toolShortcut gives the app's answer for every row of the event table", () => {
    expect(events.length).toBeGreaterThan(3000);
    for (const context of [{ canvasPage: true }, { canvasPage: false }]) {
      for (const [label, event] of events) expect(v.toolShortcut(event, context), label).toEqual(appToolShortcut(event, context));
    }
    // The table reaches every answer, a held Space's release on any target included.
    const answers = new Set(events.map(([, event]) => JSON.stringify(v.toolShortcut(event, { canvasPage: true }))));
    expect([...answers].sort()).toEqual([JSON.stringify({ kind: "space", down: false }), JSON.stringify({ kind: "space", down: true }), JSON.stringify({ kind: "tool", tool: "hand" }), JSON.stringify({ kind: "tool", tool: "select" }), "null"].sort());
    for (const [where, target] of targets) expect(v.toolShortcut(press({ type: "keyup", code: "Space", key: " ", metaKey: true, isComposing: true, repeat: true, target }), { canvasPage: true }), where).toEqual({ kind: "space", down: false });
  });

  test("editableTarget gives the app's answer for every target", () => {
    for (const [label, target] of targets) expect(v.editableTarget(target), label).toBe(appEditableTarget(target));
    expect(targets.filter(([, target]) => v.editableTarget(target)).map(([label]) => label)).toEqual(["an input", "a textarea", "a select", "a contenteditable div"]);
  });

  test("the comparison fails when a copy drifts", () => {
    const drifted = load(lib.replace('"combobox"', '"listbox"'));
    const row = press({ code: "Space", key: " ", target: element("DIV", { role: "combobox" }) });
    expect(drifted.toolShortcut(row, { canvasPage: true })).not.toEqual(appToolShortcut(row, { canvasPage: true }));
  });
});

describe("dragging the view", () => {
  const viewport = { width: 960, height: 544 };

  test("inside the scroll range a drag moves the view as the app's panBy does", () => {
    for (const scale of [1, 1.5, 2]) {
      const geom = v.geometry(scale, 1440, 2000, viewport);
      const max = { left: geom.minWidth - viewport.width, top: geom.height - viewport.height };
      expect(max.left).toBeGreaterThan(200);
      for (const scroll of [{ left: 100, top: 100 }, { left: max.left / 2, top: 140.5 }]) {
        for (const [dx, dy] of [[10, -20], [-60, 35], [0, 0], [0.4, -0.6], [-100, -100]] as const) {
          const mine = v.viewFrom(v.panScroll(scroll, max, dx, dy), scale, geom);
          const app = appPanBy(v.viewFrom(scroll, scale, geom), dx, dy);
          // Through scroll offsets the sums round differently in the last bits.
          expect(mine.scale).toBe(app.scale);
          expect(mine.x).toBeCloseTo(app.x, 9);
          expect(mine.y).toBeCloseTo(app.y, 9);
        }
      }
    }
  });

  test("past the range it stops at 0 and at the most the board scrolls", () => {
    const max = { left: 400, top: 900 };
    expect(v.panScroll({ left: 10, top: 10 }, max, 50, -5000)).toEqual({ left: 0, top: 900 });
    expect(v.panScroll({ left: 390, top: 890 }, max, -50, 50)).toEqual({ left: 400, top: 840 });
    expect(v.panScroll({ left: 0, top: 0 }, max, 1, 1)).toEqual({ left: 0, top: 0 });
  });

  test("a canvas narrower than the board does not move that way", () => {
    // Fit: the board is centred, so there is nothing to scroll sideways.
    const fit = v.fitWidth(1440, viewport);
    const geom = v.geometry(fit.scale, 1440, 2000, viewport);
    const max = { left: Math.max(0, geom.minWidth - viewport.width), top: geom.height - viewport.height };
    expect(max.left).toBe(0);
    for (const dx of [-300, -1, 1, 300]) expect(v.panScroll({ left: 0, top: 50 }, max, dx, 0)).toEqual({ left: 0, top: 50 });
  });
});

describe("the drag surface, Esc and the toolbar", () => {
  test("the surface shows in Hand, while Space is held and through a drag, and never before the canvas is drawn", () => {
    for (const tool of ["select", "hand"]) {
      for (const space of [false, true]) {
        for (const dragging of [false, true]) {
          expect(v.layerShown(tool, space, dragging, false)).toBe(false);
          expect(v.layerShown(tool, space, dragging, true)).toBe(tool === "hand" || space || dragging);
        }
      }
    }
  });

  test("Esc turns Hand back to Select only when nothing handled it and it is not typing", () => {
    expect(v.escapeSelects({ hand: true, editable: false, defaultPrevented: false })).toBe(true);
    expect(v.escapeSelects({ hand: false, editable: false, defaultPrevented: false })).toBe(false);
    expect(v.escapeSelects({ hand: true, editable: true, defaultPrevented: false })).toBe(false);
    expect(v.escapeSelects({ hand: true, editable: false, defaultPrevented: true })).toBe(false);
  });

  test("←/→ move between the two tools and stop at the ends; other keys do nothing", () => {
    expect(v.toolbarMove(0, 2, "ArrowRight")).toBe(1);
    expect(v.toolbarMove(1, 2, "ArrowLeft")).toBe(0);
    expect(v.toolbarMove(1, 2, "ArrowRight")).toBeNull();
    expect(v.toolbarMove(0, 2, "ArrowLeft")).toBeNull();
    for (const key of ["Home", "End", "ArrowUp", "ArrowDown", "Tab", " "]) expect(v.toolbarMove(0, 2, key), key).toBeNull();
    // Focus outside the tools (index -1) is not walked into.
    expect(v.toolbarMove(-1, 2, "ArrowRight")).toBeNull();
  });

  test("an open menu keeps V and H, by physical key, so the tool does not change under it", () => {
    const open = v.popupOpen(4, 1);
    for (const [key, code] of [["v", "KeyV"], ["h", "KeyH"], ["ㅍ", "KeyV"], ["ㅗ", "KeyH"]]) {
      expect(v.popupKey(open, key, 4, code), key).toEqual({ ...open, focus: "none", prevent: true });
    }
    // Other letters stay the page's, as before.
    expect(v.popupKey(open, "b", 4, "KeyB")).toMatchObject({ open: true, prevent: false });
    expect(v.popupKey(open, "Escape", 4, "Escape")).toMatchObject({ open: false, focus: "trigger", prevent: true });
  });
});

describe("key messages from the canvas", () => {
  test("keeps Space down and up, V, H and Escape as fresh objects", () => {
    expect(v.parseMessage({ type: "key", key: "Space", down: true, extra: 1 })).toEqual({ type: "key", key: "Space", down: true });
    expect(v.parseMessage({ type: "key", key: "Space", down: false })).toEqual({ type: "key", key: "Space", down: false });
    for (const key of ["V", "H", "Escape"]) expect(v.parseMessage({ type: "key", key, down: true })).toEqual({ type: "key", key });
  });

  test.each([
    ["Alt", { type: "key", key: "Alt", alt: true }], ["a letter", { type: "key", key: "a" }], ["a lower-case v", { type: "key", key: "v" }],
    ["Space without down", { type: "key", key: "Space" }], ["Space with a string down", { type: "key", key: "Space", down: "true" }],
    ["no key", { type: "key" }], ["a numeric key", { type: "key", key: 32 }], ["a code instead of a key", { type: "key", code: "KeyV" }],
  ])("drops %s", (_label, data) => {
    expect(v.parseMessage(data)).toBeNull();
  });
});

// ── The files themselves ──────────────────────────────────────────────────────

describe("viewer files", () => {
  const files: Record<string, string> = { "lib.js": lib, "measure.js": measure, "shell.js": shellJs, "shell.css": shellCss, "shell.html": shellHtml };

  test("lib.js is DOM-free: it loads and runs with no globals", () => {
    expect(() => runInNewContext(lib, {})).not.toThrow();
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\b(document|window|location|setTimeout|requestAnimationFrame)\b/);
    expect(lib).not.toMatch(/^\s*(export|import)\b/m);
  });

  test("lib.js followed by measure.js or shell.js compiles in one function (no clashing names)", () => {
    for (const script of [measure, shellJs]) expect(() => new Script(`(function () {\n${lib}\n${script}\n})();`)).not.toThrow();
  });

  test("the scripts inline safely into <script>", () => {
    for (const [name, source] of Object.entries({ "lib.js": lib, "measure.js": measure, "shell.js": shellJs })) {
      expect(source, name).not.toMatch(/<\/script/i);
      expect(source, name).not.toContain("<!--");
    }
  });

  test("no file makes a request or carries a URL", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(/);
      expect(source.replace(/<!--[\s\S]*?-->/, ""), name).not.toMatch(/https?:|@import|url\(/i);
    }
  });

  test("shell.js takes canvas messages only through acceptMessage with the iframe's window", () => {
    expect(shellJs).toMatch(/window\.addEventListener\("message", \(event\) => \{\s*const message = acceptMessage\(event, canvas\.contentWindow\);\s*if \(message === null\) return;/);
    // No second path that parses event data without the source and origin check.
    expect(shellJs).not.toMatch(/\b(parseMessage|parseLayout|parseWheel)\(/);
    expect(shellJs.match(/addEventListener\("message"/g)).toHaveLength(1);
  });

  test("page code writes text only with textContent: nothing from the canvas is parsed as HTML", () => {
    expect(shellJs).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function/);
    expect(measure).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function/);
  });

  test("shell.html has no CSP, a sandbox of allow-scripts alone, and exactly the documented placeholders", () => {
    expect(shellHtml).not.toMatch(/Content-Security-Policy/i);
    const sandbox = [...shellHtml.matchAll(/\bsandbox="([^"]*)"/g)].map(m => m[1]);
    expect(sandbox).toEqual(["allow-scripts"]);
    const body = shellHtml.replace(/<!--[\s\S]*?-->/, "");
    const counts = new Map<string, number>();
    for (const m of body.matchAll(/\{\{([A-Za-z_]+)\}\}/g)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({ NAME: 2, WIDTH: 1, META: 1, STYLE: 1, SCRIPT: 1, SRCDOC: 1 });
    // The comment documents the placeholders by name: a brace form in it would be replaced too.
    expect(shellHtml.match(/<!--[\s\S]*?-->/)?.[0]).not.toContain("{{");
    for (const name of ["lib.js", "measure.js", "shell.js", "shell.css"]) expect(files[name], name).not.toContain("{{");
  });

  test("the placeholders sit where their escaping rule applies", () => {
    expect(shellHtml).toContain("<title>{{NAME}}</title>");
    expect(shellHtml).toContain("<span>{{NAME}}</span></span>");
    expect(shellHtml).toContain('style="width:{{WIDTH}}px" srcdoc="{{SRCDOC}}"');
    expect(shellHtml).toContain('<script type="application/json" id="doan-meta">{{META}}</script>');
  });

  test("the iframe is the canvas's only way out: it is sized by the page, not navigable to the top", () => {
    expect(shellHtml).not.toMatch(/allow-(same-origin|top-navigation|popups|forms|modals)/);
  });
});

// design-sync (canvas-row-menu): the draft's header was measured against this page in Chromium, and three rules were missing or lost
// a cascade tie. The values are the app's; the computed-style probe is `.scratch/design-sync/canvas-row-menu/viewer.mjs`.
describe("header rules the draft's measurement pinned", () => {
  const rule = (selector: string): string => new RegExp(`^${selector.replace(/[.[\]()]/g, "\\$&")} \\{([^}]*)\\}$`, "m").exec(shellCss)?.[1] ?? "";

  test("the body keeps the app's tabular digits, so the zoom percentage and frame numbers do not jitter", () => {
    expect(/^body \{([^}]*)\}$/m.exec(shellCss)?.[1]).toMatch(/font-variant-numeric: tabular-nums;/);
  });

  test("the zoom value rule has two classes: `.doan-button` below it sets min-width 0 and an 8px gap, and one class would lose by source order", () => {
    expect(shellCss).not.toMatch(/^\.doan-zoom-value \{/m);
    const zoom = rule(".doan-canvas-zoom .doan-zoom-value");
    expect(zoom).toContain("min-width: 72px;");
    expect(zoom).toContain("gap: var(--space-1);");
  });

  test("buttons carry no border style, as the app's reset leaves them", () => {
    expect(shellCss).toMatch(/^button \{ font: inherit; border-style: none; \}$/m);
  });
});

describe("without JavaScript", () => {
  test("<noscript> carries the line that says to open the file in a browser", () => {
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(shellHtml)?.[1] ?? "";
    expect(noscript.replace(/<[^>]*>/g, "")).toBe("This preview shows the top of the canvas. Open the file in a web browser to see all of it and its frames.");
  });

  test("the header shows the canvas name alone until shell.js marks the page as scripted", () => {
    // Hidden by default, shown only under `.js`.
    expect(shellCss).toMatch(/^\.ov-sep, \.ov-title-wrap, \.doan-canvas-head-tools \{ display: none; \}$/m);
    expect(shellCss).toMatch(/^\.js \.ov-sep, \.js \.ov-title-wrap, \.js \.doan-canvas-head-tools \{ display: flex; \}$/m);
    expect(shellJs).toMatch(/^document\.documentElement\.classList\.add\("js"\);$/m);
    expect(shellJs.split("\n").filter(line => !line.startsWith("//") && line.trim() !== "")[0]).toBe('document.documentElement.classList.add("js");');
    // The drawer, zoom controls and the separator are all inside the hidden parts.
    const header = /<header[\s\S]*?<\/header>/.exec(shellHtml)?.[0] ?? "";
    expect(header.indexOf('class="ov-sep"')).toBeGreaterThan(header.indexOf('id="name"'));
    expect(header.indexOf('class="ov-title-wrap"')).toBeGreaterThan(header.indexOf('class="ov-sep"'));
    expect(header.indexOf('class="doan-canvas-head-tools"')).toBeGreaterThan(header.indexOf('class="ov-title-wrap"'));
  });

  test("the CSS alone sizes the iframe doan:width wide and one screen high, and the stage only scales under .js", () => {
    expect(shellHtml).toMatch(/<iframe class="canvas"[^>]*style="width:\{\{WIDTH\}\}px"/);
    expect(shellCss).toMatch(/^\.canvas \{ height: 100vh; \}$/m);
    expect(shellCss).toMatch(/^\.js \.stage \{[^}]*visibility: hidden;/m);
    expect(shellCss).toMatch(/^\.js\.ready \.stage \{ visibility: visible; \}$/m);
  });
});

// ── The Go MIME table is the app server's ─────────────────────────────────────

describe("MIME table", () => {
  // Both tables are read as text: server.ts does not export TYPES, and the Go literal is the
  // contract (cli/internal/export/mime.go asks for one entry per line).
  const entries = (source: string, open: string, pattern: RegExp): Map<string, string> => {
    const start = source.indexOf(open);
    expect(start, `${open} not found`).toBeGreaterThanOrEqual(0);
    const body = source.slice(start + open.length, source.indexOf("\n}", start));
    const table = new Map<string, string>();
    for (const line of body.split("\n")) {
      const m = pattern.exec(line);
      if (m) table.set(m[1]!, m[2]!);
      else expect(line.trim(), `unparsed line: ${line}`).toBe("");
    }
    return table;
  };
  const server = entries(readFileSync(new URL("./serve/server.ts", import.meta.url), "utf8"), "const TYPES: Record<string, string> = {", /^\s*"(\.[a-z0-9]+)":\s+"([^"]+)",$/);
  const go = entries(readFileSync(new URL("../../../cli/internal/export/mime.go", import.meta.url), "utf8"), "var mimeTypes = map[string]string{", /^\t"(\.[a-z0-9]+)":\s+"([^"]+)",$/);

  test("the Go table has the same extensions and types as server.ts TYPES", () => {
    expect(server.size).toBeGreaterThan(10);
    expect(Object.fromEntries(go)).toEqual(Object.fromEntries(server));
  });
});
