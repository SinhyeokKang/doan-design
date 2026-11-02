import { expect, test } from "vitest";
import { parseUiState, UI_STATE_MAX_BYTES, withoutRoots } from "./uiState";

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

test("reads the open canvas id beside its path", () => {
  const state = { screen: "workspace", root: "/repo/a", canvas: "billing.html", canvasId: "billing-v2", view, expanded: {}, lastByRoot: {} };
  expect(parse(state)).toEqual(state);
});

test("a file without a canvas id has none", () => {
  expect(parse({ screen: "workspace", root: "/repo/a", canvas: "billing.html", expanded: {}, lastByRoot: {} })).not.toHaveProperty("canvasId");
});

test.each([["upper case", "Billing"], ["a space", "bill ing"], ["a leading dash", "-billing"], ["a double dash", "bill--ing"], ["empty", ""], ["a number", 7], ["null", null]])(
  "drops a canvas id with %s and keeps the rest",
  (_name, canvasId) => {
    expect(parse({ screen: "workspace", root: "/repo/a", canvas: "billing.html", canvasId, view, expanded: {}, lastByRoot: {} }))
      .toEqual({ screen: "workspace", root: "/repo/a", canvas: "billing.html", view, expanded: {}, lastByRoot: {} });
  },
);

test("drops a canvas id that comes without a canvas", () => {
  expect(parse({ screen: "workspace", root: "/repo/a", canvasId: "billing", expanded: {}, lastByRoot: {} }))
    .toEqual({ screen: "workspace", root: "/repo/a", expanded: {}, lastByRoot: {} });
  // A canvas outside the saved roots is dropped, and its id with it.
  expect(parse({ screen: "workspace", root: "/elsewhere", canvas: "billing.html", canvasId: "billing", expanded: {}, lastByRoot: {} }))
    .toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
});

const home = {
  lastRoot: "/repo/b",
  lastProvider: "codex",
  models: { claude: { model: "opus", effort: "high" }, codex: { model: "gpt-5" } },
};

test("round-trips the home composer's last root, provider and models", () => {
  const state = { screen: "home", expanded: {}, lastByRoot: {}, home };
  expect(parse(state)).toEqual(state);
});

test("a file without home memory has none", () => {
  expect(parse({ screen: "home" })).not.toHaveProperty("home");
});

test("an older file's fields read the same beside home memory", () => {
  // The same file without `home` must parse to the same rest, so an app that
  // predates home memory reads a newer file and only loses that key.
  const rest = { screen: "workspace", root: "/repo/a", canvas: "a.html", view, expanded: { "/repo/a": ["a"] }, lastByRoot: {} };
  const { home: _home, ...read } = parse({ ...rest, home }) ?? {};
  expect(read).toEqual(rest);
  expect(parse(rest)).toEqual(rest);
});

test("drops home fields one by one and keeps the rest", () => {
  const state = {
    screen: "home",
    home: {
      lastRoot: "/repo/gone",
      lastProvider: "gemini",
      models: {
        claude: { model: "opus", effort: 3 },
        codex: { model: "" },
        cursor: "auto",
        unknown: { model: "x" },
        copilot: { model: 1 },
        antigravity: { model: "flash", effort: "low", extra: true },
      },
      extra: 1,
    },
  };
  expect(parse(state)).toEqual({
    screen: "home",
    expanded: {},
    lastByRoot: {},
    home: { models: { claude: { model: "opus" }, antigravity: { model: "flash", effort: "low" } } },
  });
  for (const bad of [null, [], "home", 1]) expect(parse({ screen: "home", home: bad })).not.toHaveProperty("home");
  expect(parse({ screen: "home", home: { lastRoot: 1, lastProvider: null, models: [] } })).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
});

// permission-mode T2 (design '잘못된 값 읽기'): each provider's last mode; an id this build does not know reads as Default
// for that entry only, and Default is the same as no entry.
test("keeps each provider's last permission mode and reads an unknown one as Default", () => {
  const state = { screen: "home", expanded: {}, lastByRoot: {}, home: { ...home, permissions: { claude: "bypass", codex: "plan", cursor: "acceptEdits" } } };
  expect(parse(state)).toEqual(state);
  const read = parse({ screen: "home", home: { ...home, permissions: { claude: "auto", codex: "default", cursor: 3, copilot: "plan", nobody: "plan" } } });
  expect(read?.home).toEqual({ ...home, permissions: { copilot: "plan" } });
  for (const bad of [null, [], "plan", 1]) expect(parse({ screen: "home", home: { ...home, permissions: bad } })?.home).toEqual(home);
});

test("home memory never keeps a removed root", () => {
  expect(parse({ screen: "home", home: { lastRoot: "/repo/a" } }, ["/repo/b"])).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, home: {} });
});

test("a prototype-polluting provider key is not a provider", () => {
  const state = parseUiState('{"screen":"home","home":{"models":{"__proto__":{"model":"x"}}}}', saved);
  expect(state?.home?.models).toEqual({});
  expect(Object.getPrototypeOf(state?.home?.models)).toBe(Object.prototype);
});

// buzz-settings design '포맷 변경': the Settings category is a plain renderer field; the old main-composed tab is read once.
test("keeps a saved Settings section", () => {
  for (const settingsSection of ["agents", "notifications", "about"])
    expect(parse({ screen: "home", settingsSection })).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, settingsSection });
});

// Settings > Connections was removed; a stored one opens About.
test("a saved Connections section restores as About", () => {
  expect(parse({ screen: "home", settingsSection: "connections" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, settingsSection: "about" });
  expect(parse({ screen: "home", settingsSection: "connections", settingsTab: "projects" })?.settingsSection).toBe("about");
});

test("an old settingsTab becomes the Settings section: connections becomes About, projects becomes Agents", () => {
  expect(parse({ screen: "home", settingsTab: "connections" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, settingsSection: "about" });
  expect(parse({ screen: "home", settingsTab: "projects" })).toEqual({ screen: "home", expanded: {}, lastByRoot: {}, settingsSection: "agents" });
});

test("a saved Settings section wins over the old settingsTab, and an unknown one is dropped on its own", () => {
  expect(parse({ screen: "home", settingsSection: "notifications", settingsTab: "connections" })?.settingsSection).toBe("notifications");
  expect(parse({ screen: "home", settingsSection: "projects-old", settingsTab: "connections" })?.settingsSection).toBe("about");
  expect(parse({ screen: "home", settingsSection: 3 })).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
  // The old name is only read: the section is the one field written back.
  expect(parse({ screen: "home", settingsTab: "connections" })).not.toHaveProperty("settingsTab");
});

test("keeps a sidebar project's closed groups under their fixed ids", () => {
  const shellProjects = { common: { roots: ["/repo/a"], expanded: true, groups: { ds: false, canvases: false } } };
  expect(parse({ screen: "home", shellProjects })?.shellProjects).toEqual(shellProjects);
  expect(parse({ screen: "home", shellProjects: { common: { roots: ["/repo/a"], expanded: false, groups: { canvases: false } } } })?.shellProjects?.common?.groups).toEqual({ canvases: false });
});

test.each([
  ["an open flag", { ds: true }],
  ["an unknown group", { assets: false, Canvases: false }],
  ["a label instead of an id", { "Design system": false }],
  ["a string", { ds: "false" }],
  ["an empty record", {}],
  ["an array", [false]],
  ["null", null],
])("drops sidebar groups that close nothing (%s), keeping the project", (_, groups) => {
  expect(parse({ screen: "home", shellProjects: { common: { roots: ["/repo/a"], expanded: true, groups } } })?.shellProjects).toEqual({ common: { roots: ["/repo/a"], expanded: true } });
});

test("keeps a known closed group beside an unknown one", () => {
  expect(parse({ screen: "home", shellProjects: { common: { roots: ["/repo/a"], expanded: true, groups: { ds: false, ds2: false, canvases: 0 } } } })?.shellProjects?.common?.groups).toEqual({ ds: false });
});

const ID_A = "0d6f2c1e-5b7a-4c3d-9e8f-1a2b3c4d5e6f";
const ID_B = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

test("keeps the last project conversation per saved root", () => {
  expect(parse({ screen: "home", conversationByRoot: { "/repo/a": ID_A, "/repo/b": ID_B } })?.conversationByRoot).toEqual({ "/repo/a": ID_A, "/repo/b": ID_B });
});

test("a file without conversationByRoot has none", () => {
  expect(parse({ screen: "home" })).not.toHaveProperty("conversationByRoot");
});

test("drops invalid conversation ids one by one and keeps the rest", () => {
  const state = parse({ screen: "home", conversationByRoot: { "/repo/a": "not-an-id", "/repo/b": ID_B } });
  expect(state?.conversationByRoot).toEqual({ "/repo/b": ID_B });
  for (const bad of [42, null, "", ID_A.toUpperCase(), `${ID_A} `, ["x"], { id: ID_A }]) {
    expect(parse({ screen: "home", conversationByRoot: { "/repo/a": bad } })?.conversationByRoot).toEqual({});
  }
});

test("a malformed conversationByRoot is dropped without costing the rest", () => {
  const state = parse({ screen: "workspace", root: "/repo/a", expanded: {}, lastByRoot: {}, conversationByRoot: [ID_A] });
  expect(state).not.toHaveProperty("conversationByRoot");
  expect(state?.root).toBe("/repo/a");
});

test("conversationByRoot never keeps a root outside the saved list", () => {
  expect(parse({ screen: "home", conversationByRoot: { "/repo/a": ID_A, "/repo/gone": ID_B } }, ["/repo/a"])?.conversationByRoot).toEqual({ "/repo/a": ID_A });
});

test("removing roots forgets their entries and leaves the others", () => {
  const memory = { "/repo/a": ID_A, "/repo/b": ID_B };
  expect(withoutRoots(memory, ["/repo/a", "/repo/unknown"])).toEqual({ "/repo/b": ID_B });
  expect(withoutRoots(memory, [])).toEqual(memory);
  expect(memory).toEqual({ "/repo/a": ID_A, "/repo/b": ID_B });
});

test("reads the right panel's open flag and width", () => {
  expect(parse({ screen: "home", rightPanel: { open: false, width: 400 } })?.rightPanel).toEqual({ open: false, width: 400 });
  expect(parse({ screen: "home", rightPanel: { open: true, width: 347.5 } })?.rightPanel).toEqual({ open: true, width: 347.5 });
});

test("reads the sidebar's width; a malformed one is dropped", () => {
  expect(parse({ screen: "home", sidebar: { width: 260 } })?.sidebar).toEqual({ width: 260 });
  for (const sidebar of [null, {}, { width: "260" }, { width: -1 }, { width: Number.POSITIVE_INFINITY }, [260]]) {
    const state = parse({ screen: "workspace", root: "/repo/a", expanded: {}, lastByRoot: {}, sidebar });
    expect(state).not.toHaveProperty("sidebar");
    expect(state?.root).toBe("/repo/a");
  }
});

test("a file without rightPanel has none", () => {
  expect(parse({ screen: "home" })).not.toHaveProperty("rightPanel");
});

test.each([
  ["null", null],
  ["an array", [{ open: false, width: 400 }]],
  ["a string", "open"],
  ["an empty object", {}],
  ["wrong types", { open: "no", width: "400" }],
])("a malformed rightPanel is dropped without costing the rest: %s", (_name, rightPanel) => {
  const state = parse({ screen: "workspace", root: "/repo/a", expanded: {}, lastByRoot: {}, rightPanel });
  expect(state).not.toHaveProperty("rightPanel");
  expect(state?.root).toBe("/repo/a");
});

test("a wrong-typed field falls back on its own and keeps the other", () => {
  expect(parse({ screen: "home", rightPanel: { open: "no", width: 400 } })?.rightPanel).toEqual({ open: true, width: 400 });
  expect(parse({ screen: "home", rightPanel: { open: false, width: "400" } })?.rightPanel).toEqual({ open: false });
  expect(parse({ screen: "home", rightPanel: { open: false } })?.rightPanel).toEqual({ open: false });
  expect(parse({ screen: "home", rightPanel: { width: 400 } })?.rightPanel).toEqual({ open: true, width: 400 });
});

// Written as JSON text: 1e999 reads as Infinity, which JSON.stringify could not produce.
test.each(["0", "-1", "1e999", "-1e999", "10001", "1e9"])("an out-of-range width reads as the default: %s", (width) => {
  expect(parseUiState(`{"screen":"home","rightPanel":{"open":false,"width":${width}}}`, saved)?.rightPanel).toEqual({ open: false });
});

test("the widest and the narrowest accepted widths round trip", () => {
  for (const width of [1, 10_000]) expect(parse({ screen: "home", rightPanel: { open: true, width } })?.rightPanel).toEqual({ open: true, width });
});

test("a parsed rightPanel survives a second parse unchanged", () => {
  const first = parse({ screen: "workspace", root: "/repo/a", canvas: "a.html", view, expanded: {}, lastByRoot: {}, rightPanel: { open: false, width: 420, extra: 1 } });
  expect(first?.rightPanel).toEqual({ open: false, width: 420 });
  expect(parse(first)).toEqual(first);
});
