import { expect, test } from "vitest";
import { parseUiState, UI_STATE_MAX_BYTES } from "./uiState";

const saved = ["/repo/a", "/repo/b"];
const view = { scale: 1, x: 10, y: -20 };

function parse(value: unknown, roots: readonly string[] = saved) {
  return parseUiState(JSON.stringify(value), roots);
}

test("reads a workspace state", () => {
  const state = {
    screen: "workspace",
    root: "/repo/a",
    canvas: "billing.html",
    view,
    expanded: { "/repo/a": ["billing", "billing.html"] },
    lastByRoot: { "/repo/b": { canvas: "x.html", view } },
  };
  expect(parse(state)).toEqual(state);
});

test("reads a home state without root, canvas and view", () => {
  expect(parse({ screen: "home", expanded: {}, lastByRoot: {} })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

test("missing expanded and lastByRoot become empty", () => {
  expect(parse({ screen: "home" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

test.each([
  ["not JSON", "{"],
  ["empty", ""],
  ["null", "null"],
  ["an array", "[]"],
  ["a string", '"home"'],
  ["no screen", "{}"],
  ["unknown screen", '{"screen":"settings"}'],
  ["a non-string screen", '{"screen":1}'],
])("a corrupt file is null: %s", (_name, text) => {
  expect(parseUiState(text, saved)).toBeNull();
});

test("rejects a file over 64 KiB and accepts one at the limit", () => {
  expect(UI_STATE_MAX_BYTES).toBe(64 * 1024);
  const base = JSON.stringify({ screen: "home", pad: "" });
  const fill = (bytes: number) => JSON.stringify({ screen: "home", pad: "x".repeat(bytes - base.length) });
  expect(new TextEncoder().encode(fill(UI_STATE_MAX_BYTES)).length).toBe(UI_STATE_MAX_BYTES);
  expect(parseUiState(fill(UI_STATE_MAX_BYTES), saved)).not.toBeNull();
  expect(parseUiState(fill(UI_STATE_MAX_BYTES + 1), saved)).toBeNull();
});

test("the limit counts bytes, not characters", () => {
  // 3 bytes per character: 30,000 characters is 90,000 bytes.
  expect(parseUiState(JSON.stringify({ screen: "home", pad: "한".repeat(30_000) }), saved)).toBeNull();
});

test("drops roots that are not in the saved list", () => {
  const state = {
    screen: "workspace",
    root: "/repo/gone",
    canvas: "a.html",
    view,
    expanded: { "/repo/a": ["f"], "/repo/gone": ["g"] },
    lastByRoot: { "/repo/a": { canvas: "a.html", view }, "/repo/gone": { canvas: "b.html", view } },
  };
  expect(parse(state)).toEqual({
    screen: "home",
    expanded: { "/repo/a": ["f"] },
    lastByRoot: { "/repo/a": { canvas: "a.html", view } },
  });
});

test("an empty saved list leaves only the screen", () => {
  expect(parse({ screen: "workspace", root: "/repo/a", canvas: "a.html", view, expanded: { "/repo/a": [] } }, [])).toEqual({
    screen: "home",
    expanded: {},
    lastByRoot: {},
  });
});

test("a workspace screen without a root is home", () => {
  expect(parse({ screen: "workspace" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

test("canvas and view without a root are dropped", () => {
  expect(parse({ screen: "home", canvas: "a.html", view })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

test("a malformed view is dropped, the canvas is kept", () => {
  for (const bad of [{ scale: 0, x: 0, y: 0 }, { scale: -1, x: 0, y: 0 }, { scale: 1, x: "1", y: 0 }, { scale: 1, x: 0 }, null, 3]) {
    expect(parse({ screen: "workspace", root: "/repo/a", canvas: "a.html", view: bad })).toEqual({
      screen: "workspace",
      root: "/repo/a",
      canvas: "a.html",
      expanded: {},
      lastByRoot: {},
    });
  }
});

test("a non-finite number never reaches the view", () => {
  // JSON cannot carry NaN or Infinity, but 1e999 parses to Infinity.
  const text = '{"screen":"workspace","root":"/repo/a","canvas":"a.html","view":{"scale":1e999,"x":0,"y":0}}';
  expect(parseUiState(text, saved)).toEqual({ screen: "workspace", root: "/repo/a", canvas: "a.html", expanded: {}, lastByRoot: {} });
});

test("keeps out-of-range scales for the restore plan to clamp", () => {
  expect(parse({ screen: "workspace", root: "/repo/a", canvas: "a.html", view: { scale: 99, x: 0, y: 0 } })?.view?.scale).toBe(99);
});

test("a view without a canvas is dropped", () => {
  expect(parse({ screen: "workspace", root: "/repo/a", view })).toEqual({ screen: "workspace", root: "/repo/a", expanded: {}, lastByRoot: {} });
});

test("malformed expanded and lastByRoot entries are dropped one by one", () => {
  const state = {
    screen: "home",
    expanded: { "/repo/a": ["x", 3, "y"], "/repo/b": "nope" },
    lastByRoot: { "/repo/a": { canvas: 1, view }, "/repo/b": { canvas: "b.html", view: { scale: 0, x: 0, y: 0 } } },
  };
  expect(parse(state)).toEqual({ screen: "home", expanded: { "/repo/a": ["x", "y"] }, lastByRoot: {} });
  expect(parse({ screen: "home", expanded: [], lastByRoot: "x" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

test("a prototype-polluting key is not a saved root", () => {
  const text = '{"screen":"home","expanded":{"__proto__":["x"]},"lastByRoot":{}}';
  const state = parseUiState(text, saved);
  expect(state?.expanded).toEqual({});
  expect(Object.getPrototypeOf(state?.expanded)).toBe(Object.prototype);
});

test("unknown fields are not carried over", () => {
  expect(parse({ screen: "home", selection: { id: "x" }, extra: 1 })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});
