import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hand, MousePointer2 } from "lucide-react";
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
  "toolShortcut", "editableTarget", "panScroll", "layerShown", "escapeSelects", "toolbarMove", "TIP_DELAY_MS", "TIP_SKIP_MS", "tipWait",
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

// ── Tools: Select and Hand ─────────────────────────────

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

// design-sync: the draft's header was measured against this page in Chromium, and three rules were missing or lost
// a cascade tie. The values are the app's.
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

// ── The content panel and the toolbar ───────────────

const appCss = (path: string): string => readFileSync(new URL(`../renderer/${path}`, import.meta.url), "utf8");
const tokensCss = appCss("tokens.css");
const stylesCss = appCss("styles.css");
const controlsCss = appCss("ds/controls.css");
const surfacesCss = appCss("ds/surfaces.css");

// A rule's declarations as written, one rule per selector (the first one in the file).
const declarations = (css: string, selector: string): string[] => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`no rule ${selector}`);
  return body.split(";").map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
};

describe("tokens are the app's", () => {
  const roots = (css: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(d[1]!, d[2]!.trim());
    return map;
  };
  const resolve = (map: Map<string, string>, value: string): string => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const next = map.get(name);
    if (next === undefined) throw new Error(`${name} is not defined`);
    return resolve(map, next);
  }).replace(/\s+/g, " ");
  const app = roots(tokensCss);
  const viewer = roots(shellCss);

  test("every token the viewer copies resolves to the app's value", () => {
    expect(viewer.size).toBeGreaterThan(50);
    for (const [name, value] of viewer) {
      expect(app.has(name), name).toBe(true);
      expect(resolve(viewer, value), name).toBe(resolve(app, app.get(name)!));
    }
  });

  test("the panel and the toolbar take the window grey, the panel's corner and the toolbar's sizes", () => {
    expect(resolve(viewer, "var(--bg-app)")).toBe("#f1f1f2");
    expect(resolve(viewer, "var(--radius-container)")).toBe("24px");
    expect(resolve(viewer, "var(--space-2)")).toBe("8px");
    expect(resolve(viewer, "var(--space-5)")).toBe("20px");
    expect(resolve(viewer, "var(--size-control)")).toBe("40px");
  });
});

describe("the content panel", () => {
  test("the window is the app's grey and the panel sits 8 from every edge, white, clipped, with 24 on all four corners drawn over it", () => {
    expect(declarations(shellCss, "body")).toContain("background: var(--bg-app)");
    const panel = declarations(shellCss, ".doan-canvas-panel");
    for (const declaration of ["position: relative", "margin: var(--space-2)", "background: var(--surface-panel)", "overflow: clip", "isolation: isolate"]) {
      expect(panel, declaration).toContain(declaration);
    }
    // The corners: the window's grey outside a 24 curve, over the header (5) and everything else, never taking the pointer.
    expect(declarations(shellCss, ".doan-canvas-panel::after")).toEqual(["content: \"\"", "position: absolute", "inset: 0", "z-index: 6", "border-radius: var(--radius-container)", "box-shadow: 0 0 0 var(--radius-container) var(--bg-app)", "pointer-events: none"]);
    // The app's panel and its board box: the same white and isolation, the area's clip (styles.css).
    expect(stylesCss).toMatch(/\.workspace > \.doan-canvas-panel \{[^}]*isolation: isolate/);
    expect(declarations(stylesCss, ".doan-canvas-panel > .area")).toContain("overflow: clip");
    expect(stylesCss).toMatch(/\.workspace > \.doan-canvas-panel \{[^}]*background: var\(--surface-panel\)/);
    expect(stylesCss).toMatch(/\.workspace\[data-panel="collapsed"\] > \.doan-canvas-panel \{[^}]*var\(--radius-container\)/);
  });

  test("the header, the board and the toolbar are the panel's children; the toolbar is not inside the scrolling board", () => {
    const panel = /<div class="doan-canvas-panel">([\s\S]*)<\/div>\s*<script type="application\/json"/.exec(shellHtml)?.[1] ?? "";
    expect(panel).toMatch(/^\s*<header class="ov-head doan-canvas-head">/);
    const board = /<main class="board" id="board"[\s\S]*?<\/main>/.exec(panel)?.[0] ?? "";
    expect(board).not.toBe("");
    expect(board).not.toContain("doan-canvas-bottom");
    expect(panel.indexOf('class="doan-canvas-bottom"')).toBeGreaterThan(panel.indexOf("</main>"));
  });

  test("the header keeps the chrome height and stays over the toolbar and its tooltip, so its menus open over both", () => {
    expect(declarations(shellCss, ".ov-head")).toContain("min-height: var(--size-chrome)");
    expect(declarations(shellCss, ".doan-canvas-panel > .doan-canvas-head")).toEqual(["position: relative", "z-index: 5"]);
    expect(declarations(shellCss, ".doan-canvas-bottom")).toContain("z-index: 3");
  });
});

// Chromium draws a cross-origin (out-of-process) iframe only within 16384 device px of its
// compositing origin when an ancestor clips with the same radius on all four corners: at DPR 2 a
// board wider or taller than 8192 CSS px was cut off for good. Measured in Electron 45 and Chrome
// 157; a rectangular clip, a clip with unequal radii and an unclipped radius drew it whole.
describe("the board iframe's ancestors never clip with four equal radii", () => {
  const split = (text: string, at: RegExp): string[] => {
    const parts: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && at.test(c)) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    return [...parts, text.slice(start)].map(part => part.trim()).filter(Boolean);
  };
  // Each rule's subjects (the compound a selector styles, `:is()` lists expanded) with its
  // declarations; rules nested in at-rules count too. Pseudo-elements are not ancestors.
  const subjects = (css: string): { subject: string; declarations: string[] }[] =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) => {
      const declarations = body!.split(";").map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
      return split(selectors!, /,/).flatMap(selector => {
        const subject = split(selector, /[\s>+~]/).at(-1) ?? "";
        const list = /^:(?:is|where)\((.*)\)$/.exec(subject)?.[1];
        return (list === undefined ? [subject] : split(list, /,/).map(inner => split(inner, /[\s>+~]/).at(-1) ?? ""))
          .filter(s => !s.includes("::")).map(s => ({ subject: s, declarations }));
      });
    });
  // An element on the way up from the iframe: its tag, id, every class it can carry and, when
  // known, every attribute. A subject matches it unless its tag, an id, a class or an attribute
  // name says otherwise; pseudo-classes are ignored, so a rule that only might apply still counts.
  type Element = { tag: string; id?: string | undefined; classes: string[]; attributes?: string[] };
  const matches = (subject: string, element: Element): boolean => {
    const attributes = [...subject.matchAll(/\[\s*([\w-]+)/g)].map(([, name]) => name!);
    if (element.attributes && !attributes.every(name => element.attributes!.includes(name))) return false;
    const bare = subject.replace(/\[[^\]]*\]/g, "").replace(/:root(?![\w-])/g, "html").replace(/:[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, "");
    const tag = /^(?:[a-z][\w-]*|\*)/i.exec(bare)?.[0];
    return (tag === undefined || tag === "*" || tag.toLowerCase() === element.tag)
      && [...bare.matchAll(/#([\w-]+)/g)].every(([, id]) => id === element.id)
      && [...bare.matchAll(/\.([\w-]+)/g)].every(([, name]) => element.classes.includes(name!));
  };
  const declared = (css: string, element: Element, property: RegExp): string[] =>
    subjects(css).filter(({ subject }) => matches(subject, element)).flatMap(({ subject, declarations }) =>
      declarations.filter(d => property.test(d.split(":")[0]!.trim())).map(d => `${subject} { ${d} }`));
  const clipping = /^(overflow(-x|-y)?|contain|clip-path)$/;
  const radius = /^border(-(top|bottom)-(left|right)|-(start|end)-(start|end))?-radius$/;
  // The corners a top-to-bottom, left-to-right box draws at its top, physical or logical.
  const topRadius = /^border(-top-(left|right)|-start-(start|end))?-radius$/;
  const page: Element[] = [{ tag: "body", classes: [] }, { tag: "html", classes: [] }];

  // The app's chain is React's (CanvasPane and the workspace shell in App.tsx, #root in index.html).
  test("app: the panel paints its corners without clipping, the area rounds only its bottom corners, nothing else from the iframe up is rounded", () => {
    expect(declared(stylesCss, { tag: "div", classes: ["doan-canvas-panel"], attributes: ["class", "inert"] }, clipping)).toEqual([]);
    expect(declared(stylesCss, { tag: "section", classes: ["area"], attributes: ["class", "role", "aria-label", "tabindex", "data-picking"] }, topRadius)).toEqual([]);
    for (const element of [{ tag: "iframe", classes: [], attributes: ["sandbox", "tabindex", "title", "src", "style"] }, { tag: "div", classes: ["board"], attributes: ["class", "hidden", "style"] },
      { tag: "main", classes: ["app-shell", "workspace", "overlaid", "with-strip"] }, { tag: "div", id: "root", classes: [] }, ...page]) {
      expect(declared(stylesCss, element, radius), JSON.stringify(element)).toEqual([]);
    }
  });

  // The prototype window's chain is React's (ContentPanel and WindowShell in prototype/PrototypeWindow.tsx). Its run
  // iframe can be far larger than 8192 px in Fit (the marked viewport, scaled down), and it reaches every corner of the
  // panel in Responsive, so the content clips the top corners and the stage inside it only the bottom ones.
  const bottomRadius = /^border(-bottom-(left|right)|-end-(start|end))?-radius$/;
  test("prototype window: the panel paints its corners without clipping, the content rounds only its top corners and the stage only its bottom ones", () => {
    expect(declared(stylesCss, { tag: "div", classes: ["pw-panel"], attributes: ["class"] }, clipping)).toEqual([]);
    expect(declared(stylesCss, { tag: "div", classes: ["pw-content"], attributes: ["class", "inert", "data-mode"] }, bottomRadius)).toEqual([]);
    expect(declared(stylesCss, { tag: "div", classes: ["pw-content"], attributes: ["class", "inert", "data-mode"] }, clipping)).not.toEqual([]);
    expect(declared(stylesCss, { tag: "div", classes: ["pw-stage"], attributes: ["class"] }, topRadius)).toEqual([]);
    expect(declared(stylesCss, { tag: "div", classes: ["pw-stage"], attributes: ["class"] }, clipping)).not.toEqual([]);
    for (const element of [{ tag: "iframe", classes: ["pw-frame"], attributes: ["class", "sandbox", "title", "src", "style"] }, { tag: "div", classes: ["pw-box"], attributes: ["class", "style"] },
      { tag: "div", classes: ["pw", "name-row"], attributes: ["class", "data-panel", "style"] }, { tag: "div", id: "root", classes: [] }, ...page]) {
      expect(declared(stylesCss, element, radius), JSON.stringify(element)).toEqual([]);
    }
  });

  // With the conversation panel open the content panel stands alone again, beside an independent panel: no rule of the
  // open layout reshapes its corners or clips, so the content still rounds only its top corners and the stage only its
  // bottom ones, and the open shell itself clips nothing.
  test("prototype window with the conversation panel open: the content panel keeps the shipped split clip", () => {
    // Every rule whose selector reaches the content panel, its content or its stage through the open layout.
    const openRules = [...stylesCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors!.includes('[data-panel="open"]'));
    expect(openRules.length).toBeGreaterThan(0);
    for (const [, selectors, body] of openRules) {
      if (/\.pw-(panel|content|stage)\b/.test(selectors!)) expect(body, selectors!.trim()).not.toMatch(/radius|overflow|clip|contain/);
      if (/\.pw\[data-panel="open"\]\s*$/.test(selectors!.trim())) expect(body, selectors!.trim()).not.toMatch(/overflow|clip|contain|radius/);
    }
    expect(declarations(stylesCss, ".pw-panel")).toContain("border-radius: var(--radius-container)");
    expect(declarations(stylesCss, ".pw-content")).toEqual(expect.arrayContaining(["border-top-left-radius: inherit", "border-top-right-radius: inherit"]));
    expect(declarations(stylesCss, ".pw-stage")).toEqual(expect.arrayContaining(["border-bottom-left-radius: var(--radius-container)", "border-bottom-right-radius: var(--radius-container)"]));
  });

  // The export's chain is read from shell.html, so a wrapper added around the iframe is checked too.
  const exportChain = (): Element[] => {
    const html = shellHtml.replace(/<!--[\s\S]*?-->/g, "");
    const open: Element[] = [];
    for (const [tagText, close, name, attributes] of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)) {
      const tag = name!.toLowerCase();
      if (close) { open.splice(open.map(e => e.tag).lastIndexOf(tag)); continue; }
      const element = { tag, id: /\sid="([^"]*)"/.exec(attributes!)?.[1], classes: /\sclass="([^"]*)"/.exec(attributes!)?.[1]?.split(/\s+/) ?? [] };
      if (tag === "iframe") return [element, ...open.reverse()];
      if (!tagText.endsWith("/>") && !/^(meta|link|br|img|input|hr|source|wbr)$/.test(tag)) open.push(element);
    }
    return [];
  };

  test("export: nothing from the iframe up to the page is rounded; the panel's corners are a cover over it", () => {
    const chain = exportChain();
    expect(chain.map(e => e.tag + (e.id ? `#${e.id}` : "") + e.classes.map(c => `.${c}`).join(""))).toEqual(
      ["iframe#canvas.canvas", "div#stage.stage", "div#spacer.spacer", "main#board.board", "div.doan-canvas-panel", "body", "html"]);
    for (const element of chain) {
      expect(declared(shellCss, element, radius), JSON.stringify(element)).toEqual([]);
    }
  });
});

describe("the toolbar", () => {
  // The app's tooltips wait 700ms and skip the wait within 300ms of the last one (components/ui/tooltip.tsx).
  test("a pointer tooltip waits as the app's, and opens at once right after another one closed", () => {
    expect([v.TIP_DELAY_MS, v.TIP_SKIP_MS]).toEqual([700, 300]);
    expect(v.tipWait(10_000, null)).toBe(700);
    expect(v.tipWait(10_000, 9_800)).toBe(0);
    expect(v.tipWait(10_000, 9_700)).toBe(700);
    expect(v.tipWait(10_000, 9_701)).toBe(0);
  });

  test("shell.js waits tipWait on pointer entry, cancels a pending open on leave, press and blur, and opens at once on keyboard focus", () => {
    expect(shellJs).toMatch(/pointerenter", \(event\) => \{\s*if \(event\.pointerType !== "touch"\) scheduleTip\(button\);/);
    expect(shellJs).toMatch(/function hideTip\(\) \{\s*clearTimeout\(tipTimer\);/);
    expect(shellJs).toMatch(/if \(button\.matches\(":focus-visible"\)\) showTip\(button\);/);
  });

  test("its rules are the app's", () => {
    for (const selector of [".doan-canvas-bottom", ".doan-canvas-bottom > *", ".doan-canvas-tools", ".doan-canvas-tools .doan-icon-button", '.doan-canvas-tools > .doan-icon-button.doan-canvas-tool[aria-pressed="true"]:not(:disabled)']) {
      expect(declarations(shellCss, selector), selector).toEqual(declarations(stylesCss, selector));
    }
    expect(declarations(shellCss, '.doan-icon-button[data-ui-size="md"]')).toEqual(declarations(controlsCss, '.doan-icon-button[data-ui-size="md"]'));
  });

  test("the tooltip and its key are the app's, less Radix's transform origin", () => {
    expect(declarations(shellCss, ".doan-tooltip")).toEqual(declarations(surfacesCss, ".doan-tooltip").filter(d => !d.startsWith("transform-origin")));
    for (const selector of [".doan-tooltip.has-key", ".doan-kbd", '.doan-kbd[data-ui-variant="on-prominent"]', '.doan-kbd[data-ui-size="sm"]']) {
      expect(declarations(shellCss, selector), selector).toEqual(declarations(controlsCss, selector));
    }
  });

  test("it hides without JavaScript, as the header's tools do", () => {
    expect(shellCss).toMatch(/^html:not\(\.js\) \.doan-canvas-bottom \{ display: none; \}$/m);
  });

  test("the drag surface takes the app's grab cursors and the canvas takes no pointer", () => {
    expect(declarations(stylesCss, ".drag-layer")).toContain("cursor: grab");
    expect(declarations(stylesCss, ".drag-layer[data-grabbing]")).toEqual(["cursor: grabbing"]);
    expect(declarations(shellCss, ".board[data-pan]")).toEqual(["cursor: grab"]);
    expect(declarations(shellCss, ".board[data-pan][data-grabbing]")).toEqual(["cursor: grabbing"]);
    expect(declarations(shellCss, ".board[data-pan] .canvas")).toEqual(["pointer-events: none"]);
    expect(shellCss).not.toMatch(/cursor:\s*url/);
  });

  // CanvasTools.tsx: only Select and Hand and the toolbar's name are held; the app's row has more tools.
  const appTools = [...readFileSync(new URL("../renderer/CanvasTools.tsx", import.meta.url), "utf8").matchAll(/\{ tool: "(\w+)", label: "(\w+)", key: "(\w)", Icon: (\w+) \}/g)].map(m => ({ tool: m[1], label: m[2], key: m[3], icon: m[4] }));
  const toolbar = /<div class="doan-floating doan-canvas-tools"[^>]*>([\s\S]*?)<\/div>/.exec(shellHtml);
  const buttons = [...(toolbar?.[1] ?? "").matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)].map(m => ({ attrs: m[1]!, svg: m[2]! }));
  const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

  test("it is the Canvas tools toolbar with the app's Select (V) and Hand (H), in that order", () => {
    expect(appTools).toEqual([{ tool: "select", label: "Select", key: "V", icon: "MousePointer2" }, { tool: "hand", label: "Hand", key: "H", icon: "Hand" }]);
    expect(toolbar?.[0]).toMatch(/role="toolbar"/);
    expect(toolbar?.[0]).toMatch(/aria-label="Canvas tools"/);
    expect(readFileSync(new URL("../renderer/CanvasTools.tsx", import.meta.url), "utf8")).toContain('role="toolbar" aria-label="Canvas tools"');
    expect(buttons.map(b => [attr(b.attrs, "aria-label"), attr(b.attrs, "aria-keyshortcuts"), attr(b.attrs, "data-tool")])).toEqual(appTools.map(t => [t.label, t.key, t.tool]));
    for (const { attrs } of buttons) {
      expect(attrs).toMatch(/^type="button" class="doan-icon-button doan-canvas-tool" data-ui-size="md"/);
      // A title would draw the browser's tooltip next to ours.
      expect(attr(attrs, "title")).toBeNull();
    }
    // Select is the first tool: pressed, and the toolbar's one Tab stop.
    expect(buttons.map(b => [attr(b.attrs, "aria-pressed"), attr(b.attrs, "tabindex")])).toEqual([["true", "0"], ["false", "-1"]]);
  });

  test("the icons are lucide's MousePointer2 and Hand, inline and without a namespace URL", () => {
    const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
    expect(paths(buttons[0]!.svg)).toEqual(paths(renderToStaticMarkup(createElement(MousePointer2))));
    expect(paths(buttons[1]!.svg)).toEqual(paths(renderToStaticMarkup(createElement(Hand))));
    for (const { svg } of buttons) {
      expect(svg).toMatch(/^<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">/);
      expect(svg).not.toContain("xmlns");
    }
  });

  test("the tooltip is one hidden element in the panel, filled by shell.js", () => {
    expect(shellHtml).toContain('<div class="doan-tooltip has-key vw-tool-tip" id="tool-tip" role="tooltip" hidden></div>');
    expect(declarations(shellCss, ".vw-tool-tip[hidden]")).toEqual(["display: none"]);
  });

  test("the tooltip stacks over the toolbar it overlaps by 1px, by z-index rather than source order", () => {
    const z = (selector: string) => Number(/^z-index: (\d+)$/.exec(declarations(shellCss, selector).find(d => d.startsWith("z-index")) ?? "")?.[1]);
    expect(z(".vw-tool-tip")).toBe(4);
    expect(z(".vw-tool-tip")).toBeGreaterThan(z(".doan-canvas-bottom"));
    // An open Frames list or zoom menu reaches down to the tools in a short window.
    expect(z(".doan-canvas-panel > .doan-canvas-head")).toBeGreaterThan(z(".vw-tool-tip"));
  });
});

// ── Tool wiring in the page and in the canvas ───────

describe("tool wiring", () => {
  const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  test("the page and the canvas decide tool keys with toolShortcut on the canvas page", () => {
    for (const [name, source] of [["shell.js", shellJs], ["measure.js", measure]] as const) {
      expect(source, name).toMatch(/addEventListener\("keydown", \(event\) => \{\s*const shortcut = toolShortcut\(event, \{ canvasPage: true \}\);/);
      expect(source, name).toMatch(/addEventListener\("keyup", \(event\) => \{\s*(const shortcut = |if \()?toolShortcut\(event, \{ canvasPage: true \}\)/);
    }
    // The canvas reports only what lib.js lets through; it reads no key on its own.
    expect(code(measure)).not.toMatch(/event\.code === "Key[VH]"/);
  });

  test("the canvas iframe's pointer-events follow layerShown alone", () => {
    expect(code(shellJs)).not.toMatch(/pointerEvents|pointer-events/);
    const writes = code(shellJs).match(/toggleAttribute\("data-pan"[^;]*;/g) ?? [];
    expect(writes).toEqual(['toggleAttribute("data-pan", layerShown(tool, spaceHeld, drag !== null, boardDrawn()));']);
    expect(code(shellJs).match(/data-pan/g)).toHaveLength(1);
  });

  test("a drag ends on pointerup, pointercancel and lost capture, and needs the primary button", () => {
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) expect(shellJs, type).toContain(`board.addEventListener("${type}", endDrag);`);
    expect(shellJs).toMatch(/board\.addEventListener\("pointerdown", \(event\) => \{\s*if \(!layerShown\(tool, spaceHeld, false, boardDrawn\(\)\) \|\| event\.button !== 0 \|\| drag !== null\) return;/);
    expect(shellJs).toContain("board.setPointerCapture(event.pointerId);");
    expect(shellJs).toMatch(/panScroll\(/);
  });

  test("Space is let go when the window loses focus to another window, and when the canvas loads another document", () => {
    expect(shellJs).toMatch(/window\.addEventListener\("blur", \(\) => \{\s*if \(!document\.hasFocus\(\)\) releaseInput\(\);\s*\}\);/);
    expect(shellJs).toContain('canvas.addEventListener("load", releaseInput);');
    // The popups' own blur handler stays as it was.
    expect(shellJs.match(/window\.addEventListener\("blur"/g)).toHaveLength(2);
  });

  // A pointer resting over the canvas keeps the cursor the canvas document last set until it moves (measured in
  // Chromium with a real pointer), so while the board pans the canvas shows the hand itself.
  test("the page tells the canvas when the board pans, once per change and again for a newly loaded document", () => {
    const sync = /function syncSurface\(\) \{[\s\S]*?\n\}/.exec(code(shellJs))?.[0] ?? "";
    expect(sync).toMatch(/const pan = board\.toggleAttribute\("data-pan", layerShown\(tool, spaceHeld, drag !== null, boardDrawn\(\)\)\);/);
    expect(sync).toMatch(/if \(pan !== panTold && canvas\.contentWindow\) \{\s*panTold = pan;\s*canvas\.contentWindow\.postMessage\(\{ type: "pan", pan \}, "\*"\);/);
    // The reset runs before releaseInput's own load listener redraws the surface.
    const reset = code(shellJs).indexOf('canvas.addEventListener("load", () => {\n  panTold = false;\n});');
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(code(shellJs).indexOf('canvas.addEventListener("load", releaseInput);'));
  });

  test("the canvas adopts a grab sheet while the board pans and removes only its own", () => {
    class FakeSheet { text = ""; replaceSync(text: string) { this.text = text; } }
    const listeners = new Map<string, (event: unknown) => void>();
    const parent = {};
    const own = new FakeSheet();
    const document = {
      readyState: "loading", adoptedStyleSheets: [own] as FakeSheet[],
      addEventListener() {}, fonts: { addEventListener() {} },
    };
    const context = {
      document, parent, CSSStyleSheet: FakeSheet,
      addEventListener: (type: string, listener: (event: unknown) => void) => { if (!listeners.has(type)) listeners.set(type, listener); },
    };
    runInNewContext(`(function () {\n${lib}\n${measure}\n})();`, context);
    const message = (data: unknown, source: unknown = parent) => listeners.get("message")!({ source, data });
    const ours = () => document.adoptedStyleSheets.filter(sheet => sheet !== own).map(sheet => sheet.text);
    message({ type: "pan", pan: true });
    expect(document.adoptedStyleSheets[0]).toBe(own);
    expect(ours()).toEqual(["*{cursor:grab!important}"]);
    message({ type: "pan", pan: true });
    expect(ours()).toHaveLength(1);
    message({ type: "pan", pan: false });
    expect(document.adoptedStyleSheets).toEqual([own]);
    // Only the page's own boolean message counts.
    message({ type: "pan", pan: true }, {});
    message({ type: "pan", pan: "true" });
    expect(ours()).toEqual([]);
    // The canvas replacing its own list meanwhile keeps whatever it set.
    message({ type: "pan", pan: true });
    const later = new FakeSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, later];
    message({ type: "pan", pan: false });
    expect(document.adoptedStyleSheets).toEqual([own, later]);
  });

  // After the pointer moved over the panning board the page holds the cursor; once the pan ends Chromium recomputes
  // it over the iframe only when the iframe's own cursor value changes.
  test("each end of a pan changes the canvas iframe's cursor value, so the hand does not stay", () => {
    const sync = /function syncSurface\(\) \{[\s\S]*?\n\}/.exec(code(shellJs))?.[0] ?? "";
    expect(sync).toMatch(/if \(!pan\) requestAnimationFrame\(\(\) => requestAnimationFrame\(flipCursor\)\);/);
    expect(code(shellJs)).toMatch(/const flipCursor = \(\) => \{\s*canvas\.style\.cursor = canvas\.style\.cursor === "default" \? "auto" : "default";\s*\};/);
    expect(shellCss).not.toMatch(/\.canvas[^{]*\{[^}]*\bcursor:/);
  });

  test("a Space down from the canvas counts only while the canvas has focus; its release always counts", () => {
    expect(shellJs).toMatch(/if \(!message\.down \|\| document\.activeElement === canvas\) spaceKey\(message\.down\);/);
  });

  test("an Esc from the canvas skips the tooltip and goes straight to Hand → Select, as the app's escape(false)", () => {
    // The app's tooltip hears Esc only on the app document (Radix, capture phase); a forwarded Esc never reaches it.
    expect(code(shellJs)).toMatch(/else if \(message\.key === "Escape"\) escapeTool\(false, false\);/);
    const escapeTool = /function escapeTool\(editable, handled\) \{[\s\S]*?\n\}/.exec(code(shellJs))?.[0] ?? "";
    expect(escapeTool).toContain('chooseTool("select");');
    expect(escapeTool).not.toMatch(/tip|hideTip/);
    // The page's Esc still closes an open tooltip first.
    expect(code(shellJs)).toMatch(/function escapeKey\(editable, handled\) \{\s*if \(!handled && !tip\.hidden\) \{\s*hideTip\(\);\s*return true;\s*\}\s*return escapeTool\(editable, handled\);\s*\}/);
  });

  test("the canvas lets Space go on blur and pagehide, and sends every Space release", () => {
    expect(measure).toContain('addEventListener("blur", releaseSpace);');
    expect(measure).toContain('addEventListener("pagehide", releaseSpace);');
    expect(measure).toMatch(/addEventListener\("keyup", \(event\) => \{\s*if \(toolShortcut\(event, \{ canvasPage: true \}\) === null\) return;[\s\S]*?post\(\{ type: "key", key: "Space", down: false \}\);\s*\}\);/);
    // Bubble phase: a key the canvas's own scripts handled stays theirs.
    expect(measure).not.toMatch(/addEventListener\("key(down|up)",[\s\S]*?\{ capture: true \}\s*\);/);
  });

  test("no comment still says the viewer has no tools or key forwarding", () => {
    for (const [name, source] of [["lib.js", lib], ["shell.js", shellJs], ["measure.js", measure]] as const) {
      expect(source, name).not.toMatch(/leaves out: tools|key forwarding|key channels do not exist/);
    }
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

// ── The exported prototype page (prototype.html, prototype.css, prototype.js, isolate.js) ─────

// Read without throwing, so a missing file fails these tests and not the whole module.
const readViewer = (name: string): string => {
  try {
    return read(name);
  } catch {
    return "";
  }
};
const protoHtml = readViewer("prototype.html");
const protoCss = readViewer("prototype.css");
const protoJs = readViewer("prototype.js");
const isolateJs = readViewer("isolate.js");
const appPrototypeScript = readFileSync(new URL("./prototypeScript.ts", import.meta.url), "utf8");

// The isolation sheet's text and the KEEP list, as written in a source.
const isolationSheet = (source: string): string => {
  const m = /sheet\.replaceSync\(`([\s\S]*?)`\);/.exec(source);
  if (m === null) throw new Error("no isolation sheet");
  return m[1]!.replace(/\s+/g, " ").trim();
};
const keepList = (source: string): string => {
  const m = /const KEEP = new Set\(\[([^\]]*)\]\);/.exec(source);
  if (m === null) throw new Error("no KEEP list");
  return m[1]!.replace(/\s+/g, " ").trim();
};

// A function of a viewer file, loaded alone in a context with no globals.
const loadFunctions = (source: string, names: string[]): Lib =>
  runInNewContext(`${names.map(name => extractFunction(source, name)).join("\n")}\n({ ${names.join(", ")} })`, {}) as Lib;

describe("isolate.js is the prototype window's isolation", () => {
  test("its isolation sheet is prototypeScript.ts's, as text", () => {
    expect(isolationSheet(appPrototypeScript).length).toBeGreaterThan(200);
    expect(isolationSheet(isolateJs)).toBe(isolationSheet(appPrototypeScript));
  });

  test("its KEEP list is prototypeScript.ts's", () => {
    expect(keepList(isolateJs)).toBe(keepList(appPrototypeScript));
  });

  test("the comparison fails when a copy drifts", () => {
    const drifted = appPrototypeScript.replace("min-height: 100vh !important", "min-height: 50vh !important");
    expect(isolationSheet(drifted)).not.toBe(isolationSheet(isolateJs));
    expect(keepList(appPrototypeScript.replace('"NOSCRIPT"', '"NOSCRIPT", "SVG"'))).not.toBe(keepList(isolateJs));
  });

  test("only an href written with a leading # stays in the document", () => {
    const { sameDocument } = loadFunctions(isolateJs, ["sameDocument"]);
    for (const href of ["#", "#pl-target", "#a b"]) expect(sameDocument(href), href).toBe(true);
    for (const href of ["", " #a", "/#a", "?q#a", "other.html", "other.html#a", "https://x/#a", "javascript:void(0)"]) expect(sameDocument(href), href).toBe(false);
  });
});

// isolate.js and prototype.js run against these stand-ins for the few browser objects they touch.
class FakeElement {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  constructor(public tagName: string, attrs: Record<string, string> = {}) {
    for (const [k, value] of Object.entries(attrs)) this.attributes.set(k, value);
  }
  get localName() { return this.tagName.toLowerCase(); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...els: FakeElement[]) { for (const el of els) { el.parentElement = this; this.children.push(el); } return this; }
}

type Listener = { type: string; fn: (event: unknown) => void; once: boolean; capture: boolean };
type ListenerOptions = boolean | { once?: boolean; capture?: boolean } | undefined;
// The third argument as addEventListener reads it: a boolean is the capture flag.
const listener = (type: string, fn: (event: unknown) => void, opts: ListenerOptions): Listener =>
  ({ type, fn, once: typeof opts === "object" && !!opts.once, capture: typeof opts === "boolean" ? opts : !!opts?.capture });

// A History whose methods live on the prototype, as the browser's do, and refuse a URL the way a srcdoc
// document does (SecurityError). A state carrying `clone` fails as an uncloneable one would.
const named = (name: string) => Object.assign(new Error(name), { name });
class FakeHistory {
  calls: { name: string; self: unknown; args: unknown[] }[] = [];
  urlError: string | null = "SecurityError";
  retryError: string | null = null;
  state: unknown = null;
  pushState(...args: unknown[]) { this.native("pushState", args); }
  replaceState(...args: unknown[]) { this.native("replaceState", args); }
  private native(name: string, args: unknown[]) {
    this.calls.push({ name, self: this, args });
    const state = args[0];
    if (state !== null && typeof state === "object" && "clone" in state) throw named("DataCloneError");
    const url = args[2];
    if (url !== undefined && url !== null && this.urlError !== null) throw named(this.urlError);
    if (args.length < 3 && this.retryError !== null) throw named(this.retryError);
    this.state = state;
  }
}

function runIsolate(frames: () => FakeElement[], readyState = "loading", frameId = "checkout") {
  const posts: unknown[] = [];
  const windowListeners: Listener[] = [];
  const docListeners: Listener[] = [];
  const timers: (() => void)[] = [];
  const location = { hash: "" };
  const document = {
    readyState,
    adoptedStyleSheets: [] as unknown[],
    addEventListener: (type: string, fn: (e: unknown) => void, opts?: ListenerOptions) => docListeners.push(listener(type, fn, opts)),
    querySelectorAll: (selector: string) => {
      if (selector !== "[data-doan-frame]") throw new Error(`unexpected selector ${selector}`);
      return frames();
    },
  };
  const window = {
    parent: { postMessage: (message: unknown, target: string) => posts.push({ message, target }) },
    addEventListener: (type: string, fn: (e: unknown) => void, opts?: ListenerOptions) => windowListeners.push(listener(type, fn, opts)),
  };
  const history = new FakeHistory();
  class CSSStyleSheet { text = ""; replaceSync(text: string) { this.text = text; } }
  runInNewContext(`(function () {\nconst FRAME = ${JSON.stringify(frameId)};\n${isolateJs}\n})();`, {
    window, document, location, history, CSSStyleSheet, Element: FakeElement, Array, Set,
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
  });
  const fire = (list: Listener[], type: string, event: unknown = {}) => {
    for (const l of list.filter(l => l.type === type)) l.fn(event);
  };
  return {
    posts, location, document, timers, windowListeners, history,
    contentLoaded: () => fire(docListeners, "DOMContentLoaded"),
    load: () => { fire(windowListeners, "load"); while (timers.length > 0) timers.shift()!(); },
    dispatch: (type: string, event: unknown) => fire(windowListeners, type, event),
  };
}
const navEvent = (path: FakeElement[], defaultPrevented = false) => {
  const event = { defaultPrevented, prevented: 0, composedPath: () => path, preventDefault() { this.prevented++; this.defaultPrevented = true; } };
  return event;
};

describe("isolate.js reports once and keeps the canvas in its document", () => {
  const board = () => {
    const body = new FakeElement("BODY");
    const frame = new FakeElement("DIV", { "data-doan-frame": "checkout" });
    const other = new FakeElement("DIV", { "data-doan-frame": "cart" });
    const note = new FakeElement("P");
    const style = new FakeElement("STYLE");
    body.append(new FakeElement("SECTION").append(frame), new FakeElement("SECTION").append(other), note, style);
    return { body, frame, other, note, style };
  };

  test("a frame there at DOMContentLoaded is isolated in place and reported ready, once", () => {
    const b = board();
    const run = runIsolate(() => [b.frame, b.other]);
    expect(run.posts).toEqual([]);
    run.contentLoaded();
    expect(run.posts).toEqual([{ message: { type: "doan-prototype", state: "ready" }, target: "*" }]);
    expect(b.frame.getAttribute("data-doan-proto-frame")).toBe("");
    expect(b.note.getAttribute("data-doan-proto-hidden")).toBe("");
    expect(b.other.parentElement!.getAttribute("data-doan-proto-hidden")).toBe("");
    expect(b.style.getAttribute("data-doan-proto-hidden")).toBeNull();
    expect(b.body.getAttribute("data-doan-proto-path")).toBe("");
    expect(run.document.adoptedStyleSheets).toHaveLength(1);
    run.load();
    expect(run.posts).toHaveLength(1);
  });

  test("a frame made in a load handler is found after the load handlers", () => {
    const b = board();
    let made = false;
    const run = runIsolate(() => (made ? [b.frame] : []));
    run.contentLoaded();
    expect(run.posts).toEqual([]);
    made = true;
    run.load();
    expect(run.posts).toEqual([{ message: { type: "doan-prototype", state: "ready" }, target: "*" }]);
  });

  test("no frame after the load handlers, or two with the id, is missing and nothing is hidden", () => {
    for (const frames of [[], [board().frame, board().frame]]) {
      const run = runIsolate(() => frames);
      run.contentLoaded();
      run.load();
      expect(run.posts).toEqual([{ message: { type: "doan-prototype", state: "missing" }, target: "*" }]);
      expect(run.document.adoptedStyleSheets).toHaveLength(0);
    }
  });

  test("only the frame with the exact id counts", () => {
    const b = board();
    const run = runIsolate(() => [b.frame, b.other], "loading", "Checkout");
    run.contentLoaded();
    run.load();
    expect(run.posts).toEqual([{ message: { type: "doan-prototype", state: "missing" }, target: "*" }]);
  });

  test("a document already parsed is read at once, and a finished one after a turn", () => {
    const b = board();
    expect(runIsolate(() => [b.frame], "interactive").posts).toHaveLength(1);
    const complete = runIsolate(() => [b.frame], "complete");
    expect(complete.posts).toHaveLength(0);
    complete.timers.shift()!();
    expect(complete.posts).toHaveLength(1);
  });

  test("every submit's default is stopped, after the canvas's handlers (bubble phase on window)", () => {
    const run = runIsolate(() => []);
    const submit = run.windowListeners.filter(l => l.type === "submit");
    expect(submit.map(l => l.capture)).toEqual([false]);
    const event = navEvent([]);
    run.dispatch("submit", event);
    expect(event.prevented).toBe(1);
  });

  test("a link to another document does nothing; a # link moves within the document", () => {
    const run = runIsolate(() => []);
    // Bubble phase: a capture listener would cancel the click before a router's handler sees it.
    expect(run.windowListeners.filter(l => l.type === "click").map(l => l.capture)).toEqual([false]);
    const span = new FakeElement("SPAN");
    for (const href of ["other.html", "https://example.com/", "", "?q"]) {
      const event = navEvent([span, new FakeElement("A", { href }), new FakeElement("BODY")]);
      run.dispatch("click", event);
      expect(event.prevented, href).toBe(1);
      expect(run.location.hash).toBe("");
    }
    const svgLink = navEvent([new FakeElement("a", { "xlink:href": "next.html" })]);
    run.dispatch("click", svgLink);
    expect(svgLink.prevented).toBe(1);
    const area = navEvent([new FakeElement("AREA", { href: "next.html" })]);
    run.dispatch("click", area);
    expect(area.prevented).toBe(1);
    const hash = navEvent([span, new FakeElement("A", { href: "#pl-target" })]);
    run.dispatch("click", hash);
    expect(hash.prevented).toBe(1);
    expect(run.location.hash).toBe("#pl-target");
  });

  test("a click the canvas already handled, or one on no link, is left alone", () => {
    const run = runIsolate(() => []);
    expect(run.windowListeners.filter(l => l.type === "click")).toHaveLength(1);
    const handled = navEvent([new FakeElement("A", { href: "#x" })], true);
    run.dispatch("click", handled);
    expect(handled.prevented).toBe(0);
    expect(run.location.hash).toBe("");
    const plain = navEvent([new FakeElement("BUTTON"), new FakeElement("BODY")]);
    run.dispatch("click", plain);
    expect(plain.prevented).toBe(0);
    const noHref = navEvent([new FakeElement("A")]);
    run.dispatch("click", noHref);
    expect(noHref.prevented).toBe(0);
  });
});

// A srcdoc document's URL is about:srcdoc while its base is the page's file URL, so the browser refuses
// every History URL with SecurityError (Chromium and WebKit). isolate.js keeps the state and the script.
describe("isolate.js keeps History calls with a URL from stopping the canvas", () => {
  const methods = ["pushState", "replaceState"] as const;
  type Call = (this: unknown, ...args: unknown[]) => void;
  const call = (h: FakeHistory, name: (typeof methods)[number], ...args: unknown[]) => (h[name] as Call).apply(h, args);

  test.each(methods)("%s with a URL the browser refuses records the state without the URL, on the same receiver", (name) => {
    const { history } = runIsolate(() => []);
    expect(() => call(history, name, { step: 2 }, "", "/step-2")).not.toThrow();
    expect(history.calls.map(c => [c.name, c.args, c.self === history])).toEqual([
      [name, [{ step: 2 }, "", "/step-2"], true],
      [name, [{ step: 2 }, ""], true],
    ]);
    expect(history.state).toEqual({ step: 2 });
  });

  test.each(methods)("%s without a URL, or with one the browser takes, is one native call", (name) => {
    const { history } = runIsolate(() => []);
    for (const args of [[{ a: 1 }, ""], [{ a: 2 }, "", undefined], [{ a: 3 }, "", null]]) {
      history.calls = [];
      call(history, name, ...args);
      expect(history.calls.map(c => c.args)).toEqual([args]);
    }
    history.urlError = null;
    history.calls = [];
    call(history, name, { a: 4 }, "", "/x");
    expect(history.calls.map(c => c.args)).toEqual([[{ a: 4 }, "", "/x"]]);
  });

  test.each(methods)("%s lets any other error, and a retry that fails, through", (name) => {
    const { history } = runIsolate(() => []);
    expect(() => call(history, name, { clone: () => 1 }, "", "/x")).toThrow(expect.objectContaining({ name: "DataCloneError" }));
    expect(history.calls).toHaveLength(1);
    history.calls = [];
    history.urlError = "TypeError";
    expect(() => call(history, name, {}, "", "/x")).toThrow(expect.objectContaining({ name: "TypeError" }));
    expect(history.calls).toHaveLength(1);
    history.calls = [];
    history.urlError = "SecurityError";
    history.retryError = "InvalidStateError";
    expect(() => call(history, name, {}, "", "/x")).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(history.calls).toHaveLength(2);
  });
});

describe("prototype.js shows the frame only once it is isolated", () => {
  const fns = () => loadFunctions(protoJs, ["nextPhase", "phaseView", "acceptState"]);

  test("waiting hides both; ready shows the frame; missing and the timeout show the line with the frame hidden", () => {
    const { nextPhase, phaseView } = fns();
    expect(phaseView("waiting")).toEqual({ frameShown: false, lineShown: false });
    expect(phaseView(nextPhase("waiting", "ready"))).toEqual({ frameShown: true, lineShown: false });
    expect(phaseView(nextPhase("waiting", "missing"))).toEqual({ frameShown: false, lineShown: true });
    expect(phaseView(nextPhase("waiting", "timeout"))).toEqual({ frameShown: false, lineShown: true });
  });

  test("a ready after the timeout clears the line and shows the frame", () => {
    const { nextPhase, phaseView } = fns();
    expect(phaseView(nextPhase(nextPhase("waiting", "timeout"), "ready"))).toEqual({ frameShown: true, lineShown: false });
  });

  test("ready and missing are final: nothing after them changes the page", () => {
    const { nextPhase } = fns();
    for (const input of ["ready", "missing", "timeout"]) {
      expect(nextPhase("ready", input)).toBe("ready");
      expect(nextPhase("missing", input)).toBe("missing");
    }
    expect(nextPhase(nextPhase("waiting", "timeout"), "timeout")).toBe("late");
  });

  test("only the iframe's own window with the opaque origin, and only the two states, count", () => {
    const { acceptState } = fns();
    const win = {};
    const ok = (data: unknown, source: unknown = win, origin = "null") => acceptState({ source, origin, data }, win);
    expect(ok({ type: "doan-prototype", state: "ready" })).toBe("ready");
    expect(ok({ type: "doan-prototype", state: "missing" })).toBe("missing");
    expect(ok({ type: "doan-prototype", state: "ready" }, {})).toBeNull();
    expect(ok({ type: "doan-prototype", state: "ready" }, win, "file://")).toBeNull();
    for (const data of [null, "ready", { state: "ready" }, { type: "layout", state: "ready" }, { type: "doan-prototype", state: "timeout" }, { type: "doan-prototype" }]) {
      expect(ok(data), JSON.stringify(data)).toBeNull();
    }
  });

  // The page as prototype.js drives it: the iframe's class and the line's hidden flag.
  function runPage() {
    const frameWindow = {};
    const classes = new Set<string>();
    const frame = { contentWindow: frameWindow, classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) } };
    const line = { hidden: true };
    let onMessage: ((event: unknown) => void) | null = null;
    const timers: { fn: () => void; ms: number }[] = [];
    runInNewContext(`(function () {\n${protoJs}\n})();`, {
      document: { getElementById: (id: string) => (id === "prototype" ? frame : id === "line" ? line : null) },
      window: { addEventListener: (type: string, fn: (e: unknown) => void) => { if (type === "message") onMessage = fn; } },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; },
    });
    return {
      timers,
      shown: () => classes.has("shown"),
      line: () => !line.hidden,
      send: (state: string, source: unknown = frameWindow) => onMessage!({ source, origin: "null", data: { type: "doan-prototype", state } }),
      timeout: () => timers.shift()!.fn(),
    };
  }

  test("the page starts hidden and waits LOAD_TIMEOUT_MS (10 s) once", () => {
    const page = runPage();
    expect(page.shown()).toBe(false);
    expect(page.line()).toBe(false);
    expect(page.timers.map(t => t.ms)).toEqual([10000]);
  });

  test("ready shows the frame; the timeout after it changes nothing", () => {
    const page = runPage();
    page.send("ready");
    expect([page.shown(), page.line()]).toEqual([true, false]);
    page.timeout();
    expect([page.shown(), page.line()]).toEqual([true, false]);
  });

  test("missing keeps the frame hidden and shows the line at once", () => {
    const page = runPage();
    page.send("missing");
    expect([page.shown(), page.line()]).toEqual([false, true]);
  });

  test("a document that never answers: the line at the timeout, the frame still hidden", () => {
    const page = runPage();
    page.send("ready", {});
    expect([page.shown(), page.line()]).toEqual([false, false]);
    page.timeout();
    expect([page.shown(), page.line()]).toEqual([false, true]);
  });

  test("a ready after the timeout clears the line and shows the frame", () => {
    const page = runPage();
    page.timeout();
    page.send("ready");
    expect([page.shown(), page.line()]).toEqual([true, false]);
  });
});

describe("prototype viewer files", () => {
  const files: Record<string, string> = { "prototype.html": protoHtml, "prototype.css": protoCss, "prototype.js": protoJs, "isolate.js": isolateJs };

  test("the scripts compile in one function each and inline safely into <script>", () => {
    expect(() => new Script(`(function () {\n${protoJs}\n})();`)).not.toThrow();
    expect(() => new Script(`(function () {\nconst FRAME = "x";\n${isolateJs}\n})();`)).not.toThrow();
    for (const [name, source] of Object.entries({ "prototype.js": protoJs, "isolate.js": isolateJs })) {
      expect(source.length, name).toBeGreaterThan(100);
      expect(source, name).not.toMatch(/<\/script/i);
      expect(source, name).not.toContain("<!--");
      expect(source, name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function/);
    }
  });

  test("no file makes a request or carries a URL", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source.length, name).toBeGreaterThan(100);
      expect(source, name).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(/);
      expect(source.replace(/<!--[\s\S]*?-->/, ""), name).not.toMatch(/https?:|@import|url\(/i);
    }
  });

  test("prototype.html has no CSP, one iframe with allow-scripts allow-forms, and exactly the documented placeholders", () => {
    expect(protoHtml).not.toMatch(/Content-Security-Policy/i);
    expect([...protoHtml.matchAll(/\bsandbox="([^"]*)"/g)].map(m => m[1])).toEqual(["allow-scripts allow-forms"]);
    expect(protoHtml).not.toMatch(/allow-(same-origin|top-navigation|popups|modals)/);
    const body = protoHtml.replace(/<!--[\s\S]*?-->/, "");
    const counts = new Map<string, number>();
    for (const m of body.matchAll(/\{\{([A-Za-z_]+)\}\}/g)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({ NAME: 2, STYLE: 1, SCRIPT: 1, SRCDOC: 1 });
    expect(protoHtml.match(/<!--[\s\S]*?-->/)?.[0]).not.toContain("{{");
    for (const name of ["prototype.css", "prototype.js", "isolate.js"]) expect(files[name], name).not.toContain("{{");
  });

  test("the placeholders sit where their escaping rule applies", () => {
    expect(protoHtml).toContain("<title>{{NAME}} — Prototype</title>");
    expect(protoHtml).toMatch(/<iframe class="proto-frame" id="prototype" title="\{\{NAME\}\}" sandbox="allow-scripts allow-forms" srcdoc="\{\{SRCDOC\}\}"><\/iframe>/);
  });

  test("the page script is in the head, so its listener is there before the iframe can answer", () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(protoHtml)?.[1] ?? "";
    expect(head).toContain("<script>\n{{SCRIPT}}\n</script>");
    expect(protoHtml.indexOf('id="line"')).toBeLessThan(protoHtml.indexOf('id="prototype"'));
  });

  test("the iframe fills the viewport and starts hidden; only .shown shows it", () => {
    expect(declarations(protoCss, ".proto-frame")).toEqual(["position: fixed", "inset: 0", "width: 100%", "height: 100%", "border: 0", "visibility: hidden"]);
    expect(declarations(protoCss, ".proto-frame.shown")).toEqual(["visibility: visible"]);
    expect(declarations(protoCss, "body")).toContain("overflow: hidden");
    expect(protoJs).toMatch(/classList\.toggle\("shown", view\.frameShown\)/);
  });

  test("the didn't-load line starts hidden, stays hidden while [hidden], and says to ask the sender", () => {
    const line = /<p class="doan-notice doan-panel proto-line" id="line"[^>]*>([\s\S]*?)<\/p>/.exec(protoHtml);
    expect(line?.[0]).toMatch(/ hidden>/);
    expect(line?.[1]!.replace(/<[^>]*>/g, "")).toBe("This prototype’s frame didn’t load. Ask the sender to fix the canvas, then export it again.");
    expect(declarations(protoCss, ".proto-line[hidden]")).toEqual(["display: none"]);
  });
});

describe("the exported prototype without JavaScript", () => {
  test("a <noscript> style in the head hides the iframe", () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(protoHtml)?.[1] ?? "";
    expect(head).toContain("<noscript><style>.proto-frame { display: none; }</style></noscript>");
  });

  test("the body's <noscript> carries only the line that says to open the file in a browser", () => {
    const body = /<body>([\s\S]*?)<\/body>/.exec(protoHtml)?.[1] ?? "";
    const noscripts = [...body.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(m => m[1]!.replace(/<[^>]*>/g, ""));
    expect(noscripts).toEqual(["Open this file in a web browser to play this prototype."]);
  });
});

describe("the prototype page's look is the app's", () => {
  const roots = (css: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(d[1]!, d[2]!.trim());
    return map;
  };
  const resolve = (map: Map<string, string>, value: string): string => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const next = map.get(name);
    if (next === undefined) throw new Error(`${name} is not defined`);
    return resolve(map, next);
  }).replace(/\s+/g, " ");

  test("every token the page copies resolves to the app's value", () => {
    const app = roots(tokensCss);
    const page = roots(protoCss);
    expect(page.size).toBeGreaterThan(10);
    for (const [name, value] of page) expect(resolve(page, value), name).toBe(resolve(app, app.get(name) ?? `var(${name})`));
  });

  test("the notice and the panel are ds/surfaces.css's", () => {
    for (const selector of [".doan-panel", ".doan-notice", ".doan-alert-icon", ".doan-notice.doan-panel"]) {
      expect(declarations(protoCss, selector), selector).toEqual(declarations(surfacesCss, selector));
    }
  });

  test("the line sits where the export viewer's no-JavaScript line does, on the inset grey", () => {
    expect(declarations(protoCss, ".proto-line")).toEqual(declarations(shellCss, ".vw-noscript"));
    expect(declarations(protoCss, "body")).toContain("background: var(--surface-inset)");
  });
});
