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
  let expanded: Record<string, string[]> = {};
  let moved: CanvasMove | null = null;
  let open: CanvasRow | null = null;
  const render = () => {
    harness.effects = []; harness.refIndex = 0; harness.stateIndex = 0;
    const state = { ...initialCanvasState(), ...(open ? { open: { folder: "/repo", canvas: open.path, row: open }, shown: open.path } : {}) };
    Sidebar({ entries: [{ path: "/repo", kind: "list", servedRev: 0, canvases }], state, open: () => {}, jump: () => {}, select: () => {}, overview: () => {},
      expanded, moved, onExpandedChange: (root, paths) => { expanded = { ...expanded, [root]: paths }; } });
    harness.effects.forEach(effect => effect());
  };
  return {
    expanded: () => expanded["/repo"] ?? [],
    openCanvas(next: CanvasRow) { open = next; render(); },
    collapse(path: string) { expanded = { ...expanded, "/repo": this.expanded().filter(key => key !== path) }; render(); },
    // canvasMoved in App: the expanded paths move and the sidebar learns the move, in one render.
    move(from: string, to: CanvasRow) {
      canvases = canvases.map(canvas => canvas.path === from ? to : canvas);
      expanded = { ...expanded, "/repo": moveExpanded(this.expanded(), from, to.path) };
      moved = { root: "/repo", from, to: to.path };
      open = to;
      render();
    },
  };
}

test("a normal Open expands the canvas row and its folders", () => {
  const h = app([row("design/a.html", "a")]);
  h.openCanvas(row("design/a.html", "a"));
  expect(h.expanded()).toEqual(expect.arrayContaining(["design", "design/a.html"]));
});

test("the moved open canvas keeps its collapsed row; only the folders it moved into open (R-B7 2)", () => {
  const h = app([row("design/a.html", "a")]);
  h.openCanvas(row("design/a.html", "a"));
  h.collapse("design/a.html");
  h.move("design/a.html", row("design/nested/a.html", "a"));
  expect(h.expanded()).toContain("design/nested");
  expect(h.expanded()).not.toContain("design/nested/a.html");
  // A rename inside the same folder keeps it collapsed too.
  h.move("design/nested/a.html", row("design/nested/b.html", "a"));
  expect(h.expanded()).not.toContain("design/nested/b.html");
});

test("the moved open canvas keeps its expanded row", () => {
  const h = app([row("design/a.html", "a")]);
  h.openCanvas(row("design/a.html", "a"));
  h.move("design/a.html", row("design/nested/a.html", "a"));
  expect(h.expanded()).toEqual(expect.arrayContaining(["design/nested", "design/nested/a.html"]));
});

test("opening the moved canvas again later is a normal Open", () => {
  const h = app([row("design/a.html", "a"), row("design/c.html", "c")]);
  h.openCanvas(row("design/a.html", "a"));
  h.collapse("design/a.html");
  h.move("design/a.html", row("design/b.html", "a"));
  h.openCanvas(row("design/c.html", "c"));
  h.openCanvas(row("design/b.html", "a"));
  expect(h.expanded()).toContain("design/b.html");
});
