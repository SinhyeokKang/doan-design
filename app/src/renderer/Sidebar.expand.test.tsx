import { afterEach, expect, test, vi } from "vitest";
import { initialCanvasState } from "./CanvasController";
import { moveExpanded, Sidebar, type CanvasMove } from "./Sidebar";
import type { CanvasRow } from "../main/view";

// Sidebar's effects run here as React would run them across renders: refs and
// state persist, and an effect runs only when its dependencies changed.
const harness = vi.hoisted(() => ({ effects: [] as (() => void)[], deps: [] as (readonly unknown[] | undefined)[], refs: [] as { current: unknown }[], states: [] as unknown[], refIndex: 0, stateIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void, deps?: readonly unknown[]) => {
    const i = harness.effects.length, previous = harness.deps[i];
    const changed = !deps || !previous || deps.some((value, j) => !Object.is(value, previous[j]));
    harness.deps[i] = deps;
    harness.effects.push(changed ? effect : () => {});
  },
  useLayoutEffect: () => {},
  useId: () => "id",
  useRef: (initial: unknown = null) => harness.refs[harness.refIndex++] ??= { current: initial },
  useState: (initial: unknown) => {
    const i = harness.stateIndex++;
    if (!(i in harness.states)) harness.states[i] = initial;
    return [harness.states[i], (update: unknown) => { harness.states[i] = typeof update === "function" ? (update as (value: unknown) => unknown)(harness.states[i]) : update; }];
  },
}));
afterEach(() => { harness.effects = []; harness.deps = []; harness.refs = []; harness.states = []; });

const row = (path: string, id: string): CanvasRow => ({ path, id, url: "u", width: 600, open: 0, resolved: 0 });

// Holds the expanded paths and the last move as App does, and renders the sidebar
// once per change with its effects.
function app(canvases: CanvasRow[]) {
  let root = "/repo";
  let expanded: Record<string, string[]> = {};
  let moved: CanvasMove | null = null;
  let open: CanvasRow | null = null;
  const render = () => {
    harness.effects = []; harness.refIndex = 0; harness.stateIndex = 0;
    const state = { ...initialCanvasState(), ...(open ? { open: { folder: root, canvas: open.path, row: open }, shown: open.path } : {}) };
    Sidebar({ entries: [{ path: root, kind: "list", servedRev: 0, canvases }], state, open: () => {}, jump: () => {}, select: () => {}, overview: () => {},
      expanded, moved, onExpandedChange: (root, paths) => { expanded = { ...expanded, [root]: paths }; } });
    harness.effects.forEach(effect => effect());
  };
  return {
    switchRoot(next: string, canvas: CanvasRow) { root = next; canvases = [canvas]; open = canvas; render(); },
    overview() { open = null; render(); },
    flush() { render(); },
    expanded: () => expanded[root] ?? [],
    openCanvas(next: CanvasRow) { open = next; render(); },
    collapse(path: string) { expanded = { ...expanded, [root]: this.expanded().filter(key => key !== path) }; render(); },
    // canvasMoved in App: the expanded paths move and the sidebar learns the move, in one render.
    move(from: string, to: CanvasRow, flush = true) {
      canvases = canvases.map(canvas => canvas.path === from ? to : canvas);
      expanded = { ...expanded, [root]: moveExpanded(this.expanded(), from, to.path) };
      moved = { root, from, to: to.path };
      open = to;
      if (flush) render();
    },
  };
}

test("a normal Open expands the canvas row and its folders", () => {
  const h = app([row(".doan/canvases/a.html", "a")]);
  h.openCanvas(row(".doan/canvases/a.html", "a"));
  expect(h.expanded()).toEqual(expect.arrayContaining([".doan/canvases", ".doan/canvases/a.html"]));
});

test("the moved open canvas keeps its collapsed row; only the folders it moved into open (R-B7 2)", () => {
  const h = app([row(".doan/canvases/a.html", "a")]);
  h.openCanvas(row(".doan/canvases/a.html", "a"));
  h.collapse(".doan/canvases/a.html");
  h.move(".doan/canvases/a.html", row(".doan/canvases/nested/a.html", "a"));
  expect(h.expanded()).toContain(".doan/canvases/nested");
  expect(h.expanded()).not.toContain(".doan/canvases/nested/a.html");
  // A rename inside the same folder keeps it collapsed too.
  h.move(".doan/canvases/nested/a.html", row(".doan/canvases/nested/b.html", "a"));
  expect(h.expanded()).not.toContain(".doan/canvases/nested/b.html");
});

test("the moved open canvas keeps its expanded row", () => {
  const h = app([row(".doan/canvases/a.html", "a")]);
  h.openCanvas(row(".doan/canvases/a.html", "a"));
  h.move(".doan/canvases/a.html", row(".doan/canvases/nested/a.html", "a"));
  expect(h.expanded()).toEqual(expect.arrayContaining([".doan/canvases/nested", ".doan/canvases/nested/a.html"]));
});

test("opening the moved canvas again later is a normal Open", () => {
  const h = app([row(".doan/canvases/a.html", "a"), row(".doan/canvases/c.html", "c")]);
  h.openCanvas(row(".doan/canvases/a.html", "a"));
  h.collapse(".doan/canvases/a.html");
  h.move(".doan/canvases/a.html", row(".doan/canvases/b.html", "a"));
  h.openCanvas(row(".doan/canvases/c.html", "c"));
  h.openCanvas(row(".doan/canvases/b.html", "a"));
  expect(h.expanded()).toContain(".doan/canvases/b.html");
});

test("root switch is a normal Open even when the previous root path equals the stale move source", () => {
  const a = row(".doan/canvases/a.html", "a"), b = row(".doan/canvases/b.html", "a");
  const h = app([a]);
  h.openCanvas(a); h.collapse(a.path); h.move(a.path, b);
  h.switchRoot("/other", a);
  h.switchRoot("/repo", b);
  expect(h.expanded()).toContain(b.path);
});

test("Overview and back expands normally after a move", () => {
  const a = row(".doan/canvases/a.html", "a"), b = row(".doan/canvases/b.html", "a");
  const h = app([a]); h.openCanvas(a); h.collapse(a.path); h.move(a.path, b);
  h.overview(); h.openCanvas(b); expect(h.expanded()).toContain(b.path);
});

test("two moves before a commit keep a collapsed row", () => {
  const a = row(".doan/canvases/a.html", "a"), b = row(".doan/canvases/b.html", "a"), c = row(".doan/canvases/c.html", "a");
  const h = app([a]); h.openCanvas(a); h.collapse(a.path);
  h.move(a.path, b, false); h.move(b.path, c);
  expect(h.expanded()).not.toContain(c.path);
});

test("a move followed by a different normal Open in one commit expands that row, and the move is spent", () => {
  const a = row(".doan/canvases/a.html", "a"), b = row(".doan/canvases/b.html", "a"), c = row(".doan/canvases/c.html", "c");
  const h = app([a, c]); h.openCanvas(a); h.collapse(a.path);
  h.move(a.path, b, false); h.openCanvas(c);
  expect(h.expanded()).toContain(c.path);
  h.collapse(b.path); h.openCanvas(b);
  expect(h.expanded()).toContain(b.path);
});

test("Home and back keeps the loaded collapsed row because Sidebar stays mounted", () => {
  const a = row(".doan/canvases/a.html", "a"), b = row(".doan/canvases/b.html", "a");
  const h = app([a]); h.openCanvas(a); h.collapse(a.path); h.move(a.path, b);
  h.flush(); h.flush();
  expect(h.expanded()).not.toContain(b.path);
});
