import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RowSlotMark, ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
import type { SidebarSlot } from "./canvasNotice";
import type { CanvasMenu } from "./ShellSidebar";
const NO_CANVAS_MENU: CanvasMenu = { blocked: () => false, exporting: () => false, exportCanvas: () => {}, trash: () => {} };
type Effect = { deps: unknown[] | undefined; cleanup?: () => void };
// `stable`: refs keep their place across renders (a real render's), for the tests that run effects; the others rely on a
// fresh ref per call. `pending`: effects waiting for `commit`.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], states: [] as unknown[], cursor: 0, stable: false, stableRefs: [] as { current: unknown }[], refCursor: 0, effects: [] as (Effect | undefined)[], effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "description",
  useLayoutEffect: () => {},
  useRef: (value: unknown) => {
    if (hooks.stable) { const index = hooks.refCursor++; return hooks.stableRefs[index] ??= { current: value }; }
    const ref = { current: value }; hooks.refs.push(ref); return ref;
  },
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = value;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
  },
  useEffect: (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const effect: Effect = { deps };
    hooks.effects[index] = effect;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") effect.cleanup = cleanup as () => void; });
  },
}));
beforeEach(() => { hooks.refs = []; hooks.states = []; hooks.cursor = 0; hooks.stable = false; hooks.stableRefs = []; hooks.refCursor = 0; hooks.effects = []; hooks.effectCursor = 0; hooks.pending = []; });
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
// The project menu's items, which end with Remove from Doan; the canvas rows' own menus follow in the tree.
function projectItems(rendered: Record<string, unknown>[]) {
  const items = rendered.filter(item => typeof item.onSelect === "function");
  return items.slice(0, items.findIndex(item => [item.children].flat().includes("Remove from Doan")) + 1);
}
function fixture(loaded: string | null = "/a", expanded = true) {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded } }, loaded, canvas: row.path, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), disclose: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(), canvasMenu: NO_CANVAS_MENU };
  const rendered = elements(ShellSidebar(props));
  const project = rendered.find(item => item["data-key"] === "common")!;
  const menuItems = projectItems(rendered);
  return { props, project, menuItems, rendered };
}
function key(props: Record<string, unknown>, value: string, nested = false) {
  const target = {}, event = { key: value, target, currentTarget: nested ? {} : target, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, altKey: false };
  if (typeof props.onKeyDown !== "function") throw new Error("Missing keyboard handler");
  props.onKeyDown(event);
  return event;
}
// project-row-disclosure draft: ←/→ only fold and unfold, the loaded project included; Enter is the row's move.
it("folds the current project on ArrowLeft without moving and ignores keys from its menu trigger", () => {
  const { props, project } = fixture();
  key(project, "ArrowLeft");
  key(project, "Enter", true);
  expect(props.disclose).toHaveBeenCalledWith("common");
  expect(props.toggle).not.toHaveBeenCalled();
});
it("unfolds a folded project on ArrowRight without moving", () => {
  const { props, project } = fixture(null, false);
  key(project, "ArrowRight");
  expect(props.disclose).toHaveBeenCalledWith("common");
  expect(props.toggle).not.toHaveBeenCalled();
});
it("the project row's chevron folds it without the row's move; the row itself moves", () => {
  const { props, project, rendered } = fixture();
  const chevron = rendered.find(item => item.className === "shell-disclosure")!;
  expect(chevron["aria-label"]).toBe("Collapse demo");
  const event = { stopPropagation: vi.fn() };
  if (typeof chevron.onClick !== "function") throw new Error("Missing chevron handler");
  chevron.onClick(event);
  expect(event.stopPropagation).toHaveBeenCalled();
  expect(props.disclose).toHaveBeenCalledWith("common");
  expect(props.toggle).not.toHaveBeenCalled();
  if (typeof project.onClick !== "function") throw new Error("Missing row handler");
  project.onClick({});
  expect(props.toggle).toHaveBeenCalledWith("common");
  expect(fixture(null, false).rendered.find(item => item.className === "shell-disclosure")!["aria-label"]).toBe("Expand demo");
});
it("collapses another project and opens a canvas only on activation, not arrow movement", () => {
  const { props, project, rendered } = fixture(null);
  key(project, "ArrowLeft");
  expect(props.disclose).toHaveBeenCalledWith("common");
  expect(props.toggle).not.toHaveBeenCalled();
  const canvas = rendered.find(item => item["data-key"] === "/a\n.doan/canvases/a.html")!;
  key(canvas, "ArrowDown");
  expect(props.open).not.toHaveBeenCalled();
  key(canvas, "Enter");
  expect(props.open).toHaveBeenCalledWith("/a", expect.objectContaining({ path: ".doan/canvases/a.html" }));
});
it("routes explicit worktree selection and removes every currently registered project root", () => {
  const { props, menuItems } = fixture();
  const worktree = menuItems[1]!, remove = menuItems.at(-1)!;
  if (typeof worktree.onSelect === "function") worktree.onSelect();
  if (typeof remove.onSelect === "function") remove.onSelect();
  expect(props.worktree).toHaveBeenCalledWith("/b");
  expect(props.remove).toHaveBeenCalledWith(["/a", "/b"]);
});
// The menu's Project Settings opens the page for the worktree the menu shows.
it("Project Settings asks App for the page of the worktree the menu shows", () => {
  const { props, menuItems } = fixture();
  const item = menuItems[4]!;
  expect([item.children].flat()).toContain("Project Settings");
  if (typeof item.onSelect === "function") item.onSelect();
  expect(props.projectSettings).toHaveBeenCalledWith("/a");
});
it("rejects menu actions after the project disappears", () => {
  const { props, menuItems } = fixture();
  const live = hooks.refs.find(ref => ref.current === props);
  if (!live) throw new Error("Missing live target owner");
  live.current = { ...props, cards: [] };
  for (const item of menuItems) if (typeof item.onSelect === "function") item.onSelect();
  expect(props.worktree).not.toHaveBeenCalled();
  expect(props.remove).not.toHaveBeenCalled();
  expect(props.overview).not.toHaveBeenCalled();
  expect(props.action).not.toHaveBeenCalled();
});

it.each([
  [{ path: "/b", kind: "notFound" }, ["Locate", "locate"]],
  [{ path: "/b", kind: "error", message: "bad config" }, ["Retry", "retry"], ["Details", "details"]],
  [{ path: "/b", kind: "uninitialized" }, ["Set Up", "setUp"]],
  [{ path: "/b", kind: "cliError", reason: "offline" }, ["Retry", "retry"]],
] as [FolderEntry, ...[string, string][]][]) ("targets repair actions without navigating from the current canvas: %j", (problem, ...actions) => {
  const { props } = fixture();
  props.cards[0]!.rows[1] = problem;
  const render = () => { hooks.cursor = 0; return elements(ShellSidebar(props)); };
  let rendered = render();
  const root = rendered.find(item => typeof item.onOpenChange === "function")!;
  (root.onOpenChange as (open: boolean) => void)(true);
  rendered = render();
  const item = rendered.filter(item => item.className === "doan-menu-item shell-worktree")[1]!;
  expect(item.disabled).not.toBe(true);
  const event = { preventDefault: vi.fn() };
  (item.onSelect as (event: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  rendered = render();
  expect(rendered.find(item => item["data-key"] === "/a\n.doan/canvases/a.html")?.["aria-current"]).toBe("location");
  expect(props.worktree).not.toHaveBeenCalled();
  expect(props.overview).not.toHaveBeenCalled();
  expect(props.open).not.toHaveBeenCalled();
  for (const [label, action] of actions) {
    const repair = rendered.find(item => item.children === label)!;
    expect(repair).toBeDefined();
    (repair.onSelect as () => void)();
    expect(props.action).toHaveBeenLastCalledWith(action, "/b");
  }
  const live = [...hooks.refs].reverse().find(ref => ref.current === props)!;
  live.current = { ...props, cards: [] };
  props.action.mockClear();
  for (const [label] of actions) (rendered.find(item => item.children === label)!.onSelect as () => void)();
  expect(props.action).not.toHaveBeenCalled();
});

function keyboardFixture() {
  const { props } = fixture();
  const cards = ["Alpha", "Alpine", "Beta"].map(name => ({ key: name, name, rows: [{ path: `/${name}`, kind: "list" as const, servedRev: 0, canvases: [] }] }));
  const rendered = elements(ShellSidebar({ ...props, cards, projects: {}, loaded: null }));
  const rows = rendered.filter(item => item.role === "treeitem");
  let active = "Beta";
  const nodes = rows.map(row => ({ dataset: { key: row["data-key"] }, focus: () => { active = row["aria-label"] as string; } }));
  const host = rendered.find(item => item["aria-label"] === "Projects")!.ref as { current: unknown };
  host.current = { querySelectorAll: () => nodes };
  return {
    props,
    active: () => active,
    press(value: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {}) {
      const row = rows.find(item => item["aria-label"] === active)!;
      const target = {}, event = { key: value, target, currentTarget: target, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, altKey: false, ...modifiers };
      (row.onKeyDown as (event: unknown) => void)(event);
      return event;
    },
  };
}

it("cycles repeated letters through project rows using the connected keyboard handler", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const tree = keyboardFixture();
    for (const expected of ["Alpha", "Alpine", "Alpha"]) {
      expect(tree.press("a").preventDefault).toHaveBeenCalledOnce();
      expect(tree.active()).toBe(expected);
    }
    expect(tree.props.toggle).not.toHaveBeenCalled();
    expect(tree.props.open).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});

it("retains the current prefix match and resets the typeahead buffer after 500ms", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const tree = keyboardFixture();
    tree.press("a"); tree.press("l");
    expect(tree.active()).toBe("Alpha");
    now.mockReturnValue(1500);
    tree.press("b");
    expect(tree.active()).toBe("Beta");
  } finally { now.mockRestore(); }
});

it("preserves modifier shortcuts and ordinary navigation around typeahead", () => {
  const tree = keyboardFixture();
  for (const modifier of ["metaKey", "ctrlKey", "altKey"]) {
    expect(tree.press("a", { [modifier]: true }).preventDefault).not.toHaveBeenCalled();
    expect(tree.active()).toBe("Beta");
  }
  tree.press("Home"); expect(tree.active()).toBe("Alpha");
  tree.press("ArrowDown"); expect(tree.active()).toBe("Alpine");
  tree.press("End"); expect(tree.active()).toBe("Beta");
  tree.press("ArrowUp"); expect(tree.active()).toBe("Alpine");
  expect(tree.props.toggle).not.toHaveBeenCalled();
  tree.press("Enter"); expect(tree.props.toggle).toHaveBeenCalledWith("Alpine");
});

it("uses natural filename order as the tie-break for rows without an mtime, for both rows and keyboard navigation", () => {
  const { props } = fixture();
  const names = ["Zeta", "foo-bar", "foo", "page10", "page2"];
  props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: names.map(name => ({ path: `.doan/canvases/${name}.html`, url: name })) };
  hooks.cursor = 0; hooks.refs = [];
  const rendered = elements(ShellSidebar(props));
  const rows = rendered.filter(item => item["aria-level"] === 3);
  expect(rows.map(item => item["aria-label"])).toEqual(["foo", "foo-bar", "page2", "page10", "Zeta"]);
  const targets = rows.map(item => ({ dataset: { key: item["data-key"] }, focus: vi.fn() }));
  const host = hooks.refs.find(ref => ref.current === null)!;
  host.current = { querySelectorAll: () => targets };
  key(rows[0]!, "ArrowDown");
  expect(targets[1]!.focus).toHaveBeenCalledOnce();
  expect((props.cards[0]!.rows[0] as Extract<FolderEntry, { kind: "list" }>).canvases.map(row => row.url)).toEqual(names);
});

it("keeps the focused row on the same canvas when an mtime change reorders the list, and typeahead walks the visible order", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const { props } = fixture();
    const canvases = (mtimes: Record<string, number>) => Object.entries(mtimes).map(([name, mtimeMs]) => ({ path: `.doan/canvases/${name}.html`, url: name, mtimeMs }));
    const render = (mtimes: Record<string, number>) => {
      props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: canvases(mtimes) };
      hooks.cursor = 0;
      const rendered = elements(ShellSidebar(props));
      const rows = rendered.filter(item => item["aria-level"] === 3);
      const host = rendered.find(item => item["aria-label"] === "Projects")!.ref as { current: unknown };
      const nodes = rows.map(item => ({ dataset: { key: item["data-key"] }, focus: vi.fn() }));
      host.current = { querySelectorAll: () => nodes };
      return { rows, nodes };
    };
    let view = render({ alpha: 3, beta: 2, apple: 1 });
    expect(view.rows.map(item => item["aria-label"])).toEqual(["alpha", "beta", "apple"]);
    key(view.rows[1]!, "ArrowUp"); // focus alpha
    key(view.rows[0]!, "ArrowDown"); // focus beta
    view = render({ alpha: 3, beta: 2, apple: 9 });
    expect(view.rows.map(item => item["aria-label"])).toEqual(["apple", "alpha", "beta"]);
    expect(view.rows.map(item => item.tabIndex)).toEqual([-1, -1, 0]);
    key(view.rows[2]!, "a"); // typeahead from beta wraps to the first "a" in visible order
    expect(view.nodes[0]!.focus).toHaveBeenCalledOnce();
    expect(view.nodes[1]!.focus).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});

// While the Add Projects page selects or clones, the moves are shown as unavailable
// (aria-disabled keeps them in the focus order); App ignores their activation. Project Settings opens a page now, so it
// is a move too.
it("marks Search, project and canvas rows, Overview, Project Settings and worktree items aria-disabled while the page is locked", () => {
  const { props } = fixture();
  hooks.cursor = 0;
  const rendered = elements(ShellSidebar({ ...props, locked: true }));
  expect(rendered.find(item => item.className === "shell-search")?.["aria-disabled"]).toBe(true);
  for (const row of rendered.filter(item => item.role === "treeitem")) expect(row["aria-disabled"]).toBe(true);
  const menu = projectItems(rendered);
  expect(menu.filter(item => String(item.className).includes("shell-worktree")).map(item => item["aria-disabled"])).toEqual([true, true]);
  // Overview, then Show in Finder, which stays allowed, and Project Settings.
  expect(menu.slice(2, 5).map(item => item["aria-disabled"])).toEqual([true, undefined, true]);
  // Remove from Doan stays allowed.
  expect(menu.at(-1)?.["aria-disabled"]).toBeUndefined();
  hooks.cursor = 0;
  const open = elements(ShellSidebar(props));
  expect(open.filter(item => item["aria-disabled"] !== undefined && item["aria-disabled"] !== false)).toEqual([]);
});

// The group heads join the one visible row list, and ←/→ follow the APG tree.
function groupsFixture(closed?: { ds?: false; canvases?: false }, canvases = ["ds/button", "ds/color", "canvases/checkout"], extra: Record<string, unknown> = {}) {
  const { props } = fixture();
  props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: canvases.map(name => ({ path: `.doan/${name}.html`, url: name })) };
  props.projects.common = { ...props.projects.common, ...(closed ? { groups: closed } : {}) } as typeof props.projects.common;
  hooks.cursor = 0; hooks.refs = [];
  const all = { ...props, canvas: undefined, ...extra };
  const rendered = elements(ShellSidebar(all));
  const rows = rendered.filter(item => item.role === "treeitem");
  const label = (item: Record<string, unknown>) => item["aria-label"] as string;
  let active = "";
  const targets = rows.map(row => ({ dataset: { key: row["data-key"] }, focus: () => { active = label(row); } }));
  const host = hooks.refs.find(ref => ref.current === null)!;
  host.current = { querySelectorAll: () => targets };
  const row = (name: string) => rows.find(item => label(item) === name)!;
  return {
    props, rows, row, active: () => active,
    press(name: string, value: string, modifiers: Record<string, boolean> = {}) {
      const target = {}, event = { key: value, target, currentTarget: target, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, altKey: false, ...modifiers };
      (row(name).onKeyDown as (event: unknown) => void)(event);
      return event;
    },
  };
}

it("lists the project, then Design system and its rows, then Canvases and its rows, as one keyboard order", () => {
  const tree = groupsFixture();
  expect(tree.rows.map(row => [row["aria-label"], row["aria-level"]])).toEqual([["demo", 1], ["Design system", 2], ["button", 3], ["color", 3], ["Canvases", 2], ["checkout", 3]]);
  const order: string[] = [];
  let at = "demo";
  for (let step = 0; step < 6; step++) { tree.press(at, "ArrowDown"); at = tree.active(); order.push(at); }
  expect(order).toEqual(["Design system", "button", "color", "Canvases", "checkout", "checkout"]);
  tree.press("checkout", "Home"); expect(tree.active()).toBe("demo");
  tree.press("demo", "End"); expect(tree.active()).toBe("checkout");
});

it("moves → from an expanded project to its first group head, and ← from a row to its group head", () => {
  const tree = groupsFixture();
  tree.press("demo", "ArrowRight"); expect(tree.active()).toBe("Design system");
  tree.press("checkout", "ArrowLeft"); expect(tree.active()).toBe("Canvases");
  tree.press("button", "ArrowLeft"); expect(tree.active()).toBe("Design system");
  expect(tree.props.toggleGroup).not.toHaveBeenCalled();
  expect(tree.props.toggle).not.toHaveBeenCalled();
});

it("on an open head, → goes to its first row and ← closes it", () => {
  const tree = groupsFixture();
  tree.press("Design system", "ArrowRight"); expect(tree.active()).toBe("button");
  expect(tree.props.toggleGroup).not.toHaveBeenCalled();
  tree.press("Canvases", "ArrowLeft");
  expect(tree.props.toggleGroup).toHaveBeenCalledWith("common", "canvases");
});

it("on a closed head, → opens it and ← goes to the project row; its rows are not in the order", () => {
  const tree = groupsFixture({ ds: false });
  expect(tree.rows.map(row => row["aria-label"])).toEqual(["demo", "Design system", "Canvases", "checkout"]);
  expect(tree.row("Design system")["aria-expanded"]).toBe(false);
  tree.press("Design system", "ArrowRight");
  expect(tree.props.toggleGroup).toHaveBeenCalledWith("common", "ds");
  tree.press("Design system", "ArrowLeft"); expect(tree.active()).toBe("demo");
  expect(tree.props.toggleGroup).toHaveBeenCalledOnce();
});

it("does nothing on → from an open empty group", () => {
  const tree = groupsFixture(undefined, ["canvases/checkout"]);
  const event = tree.press("Design system", "ArrowRight");
  expect(tree.active()).toBe("");
  expect(tree.props.toggleGroup).not.toHaveBeenCalled();
  expect(event.preventDefault).toHaveBeenCalled();
});

it("opens and closes a head with Enter, Space, a click and an Option-click alike, without navigating", () => {
  const tree = groupsFixture();
  tree.press("Design system", "Enter");
  tree.press("Canvases", " ");
  (tree.row("Design system").onClick as (event: unknown) => void)({ altKey: false });
  (tree.row("Canvases").onClick as (event: unknown) => void)({ altKey: true });
  expect(tree.props.toggleGroup.mock.calls).toEqual([["common", "ds"], ["common", "canvases"], ["common", "ds"], ["common", "canvases"]]);
  expect(tree.props.open).not.toHaveBeenCalled();
  expect(tree.props.toggle).not.toHaveBeenCalled();
});

it("matches group heads by their label in typeahead, through the shared helper", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const tree = groupsFixture();
    tree.press("demo", "c"); expect(tree.active()).toBe("color");
    tree.press("color", "c"); expect(tree.active()).toBe("Canvases");
    tree.press("Canvases", "c"); expect(tree.active()).toBe("checkout");
    now.mockReturnValue(2000);
    tree.press("checkout", "d"); expect(tree.active()).toBe("demo");
    tree.press("demo", "d"); expect(tree.active()).toBe("Design system");
  } finally { now.mockRestore(); }
});

it("still opens and closes groups while the page is locked, showing their heads unavailable", () => {
  const tree = groupsFixture(undefined, undefined, { locked: true });
  const head = tree.row("Design system");
  expect(head["aria-disabled"]).toBe(true);
  (head.onClick as (event: unknown) => void)({});
  tree.press("Canvases", "ArrowLeft");
  expect(tree.props.toggleGroup.mock.calls).toEqual([["common", "ds"], ["common", "canvases"]]);
});
// A project row whose slot is a canvas notice hands that canvas to its activation; any
// other slot leaves the activation as it was.
it("passes the project row's canvas notice to toggle on click and Enter", () => {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const notice = { kind: "canvas" as const, label: "a is new" };
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: false } }, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), disclose: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(), canvasMenu: NO_CANVAS_MENU,
    slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", notice], ["/a\n.doan/canvases/a.html", notice]]) };
  const project = elements(ShellSidebar(props)).find(item => item["data-key"] === "common")!;
  if (typeof project.onClick !== "function") throw new Error("Missing click handler");
  project.onClick();
  expect(props.toggle).toHaveBeenLastCalledWith("common", { root: "/b", path: row.path });
  key(project, "Enter");
  expect(props.toggle).toHaveBeenLastCalledWith("common", { root: "/b", path: row.path });
  const working = { ...props, slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", { kind: "working" as const, label: "w" }], ["/a\n.doan/canvases/a.html", notice]]), toggle: vi.fn() };
  hooks.cursor = 0;
  const other = elements(ShellSidebar(working)).find(item => item["data-key"] === "common")!;
  if (typeof other.onClick !== "function") throw new Error("Missing click handler");
  other.onClick();
  expect(working.toggle).toHaveBeenLastCalledWith("common");
  expect(working.toggle.mock.lastCall).toHaveLength(1);
});
// A terminal session's slot on the project row opens its canvas, as a notice does.
it("passes the project row's terminal slot to toggle as the canvas to open", () => {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const terminal = { kind: "working" as const, label: "Codex is working in a terminal", source: "terminal" as const };
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: false } }, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), disclose: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(), canvasMenu: NO_CANVAS_MENU,
    slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", terminal]]) };
  hooks.cursor = 0;
  const project = elements(ShellSidebar(props)).find(item => item["data-key"] === "common")!;
  if (typeof project.onClick !== "function") throw new Error("Missing click handler");
  project.onClick();
  expect(props.toggle).toHaveBeenLastCalledWith("common", { root: "/b", path: row.path });
});

// Every canvas row gets the project row's menu button and a menu of Export… and
// Move to Trash.
const CANVAS = ".doan/canvases/a.html", CANVAS_KEY = `/a\n${CANVAS}`;
function canvasMenuFixture(menu: Partial<CanvasMenu> = {}, extra: Record<string, unknown> = {}, row: Record<string, unknown> = { path: CANVAS, url: "u" }) {
  const canvasMenu = { blocked: vi.fn(() => false), exporting: vi.fn(() => false), exportCanvas: vi.fn(), trash: vi.fn(), ...menu };
  const { props } = fixture();
  props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: [row as never] };
  const all = { ...props, canvas: undefined, canvasMenu, ...extra };
  let rendered: Record<string, unknown>[] = [];
  const render = () => { hooks.cursor = 0; rendered = elements(ShellSidebar(all)); return rendered; };
  render();
  const canvasRow = () => rendered.find(item => item["data-key"] === CANVAS_KEY)!;
  const button = () => rendered.find(item => item["aria-label"] === "a menu")!;
  const canvasRoot = () => rendered.filter(item => typeof item.onOpenChange === "function")[1]!;
  const items = () => rendered.filter(item => typeof item.onSelect === "function").slice(-2);
  const open = () => { (canvasRoot().onOpenChange as (open: boolean) => void)(true); render(); };
  return { props: all, canvasMenu, render, canvasRow, button, canvasRoot, items, open, rendered: () => rendered };
}
const text = (item: Record<string, unknown>) => elements([item.children as ReactNode]).flatMap(child => [child.children].flat()).concat([item.children].flat()).filter(value => typeof value === "string");

it("a canvas row's button is the project row's: named for the canvas, on the row's tab stop, and it never opens the canvas", () => {
  const tree = canvasMenuFixture();
  expect(tree.button()).toMatchObject({ className: "doan-icon-button shell-more", "aria-label": "a menu", tabIndex: -1 });
  // Tab from the focused row reaches its button: the button shares the row's roving tab stop.
  (tree.canvasRow().onFocus as () => void)(); tree.render();
  expect(tree.canvasRow().tabIndex).toBe(0);
  expect(tree.button().tabIndex).toBe(0);
  const event = { stopPropagation: vi.fn() };
  (tree.button().onClick as (event: unknown) => void)(event);
  (tree.button().onKeyDown as (event: unknown) => void)(event);
  expect(event.stopPropagation).toHaveBeenCalledTimes(2);
  // A key from the button reaches the row's handler from a nested target, which leaves it alone.
  key(tree.canvasRow(), "Enter", true);
  key(tree.canvasRow(), "ArrowDown", true);
  expect(tree.props.open).not.toHaveBeenCalled();
  expect(tree.canvasRoot().open).toBe(false);
});

it("lists Export… then Move to Trash, each acting on the row as the list holds it now", () => {
  const tree = canvasMenuFixture();
  tree.open();
  expect(tree.canvasRoot().open).toBe(true);
  // Only one menu at a time: the project menu stays closed.
  expect(tree.rendered().filter(item => typeof item.onOpenChange === "function")[0]!.open).toBe(false);
  const [exportItem, trashItem] = tree.items();
  expect(text(exportItem!)).toEqual(["Export…"]);
  expect(text(trashItem!)).toEqual(["Move to Trash"]);
  expect(exportItem!["aria-disabled"]).toBeUndefined();
  expect(exportItem!["aria-label"]).toBeUndefined();
  (exportItem!.onSelect as (event: unknown) => void)({ preventDefault: vi.fn() });
  (trashItem!.onSelect as (event: unknown) => void)({ preventDefault: vi.fn() });
  expect(tree.canvasMenu.exportCanvas).toHaveBeenCalledWith("/a", expect.objectContaining({ path: CANVAS }));
  expect(tree.canvasMenu.trash).toHaveBeenCalledWith("/a", expect.objectContaining({ path: CANVAS }), null);
  const live = [...hooks.refs].reverse().find(ref => ref.current === tree.props)!;
  live.current = { ...tree.props, cards: [] };
  (exportItem!.onSelect as (event: unknown) => void)({ preventDefault: vi.fn() });
  (trashItem!.onSelect as (event: unknown) => void)({ preventDefault: vi.fn() });
  expect(tree.canvasMenu.exportCanvas).toHaveBeenCalledOnce();
  expect(tree.canvasMenu.trash).toHaveBeenCalledOnce();
});

it.each([
  ["Move to Trash while an agent works on the canvas", { blocked: vi.fn(() => true) }, {}, 1, "An agent is working on this canvas."],
  ["Export on a row ls could not read", {}, { error: { code: "bad", message: "Unreadable" } }, 0, "Can’t read this canvas."],
  ["Export while that canvas's export runs", { exporting: vi.fn(() => true) }, {}, 0, "Exporting"],
] as const)("an unavailable item stays reachable by arrows and reads its reason: %s", (_name, menu, row, index, reason) => {
  const tree = canvasMenuFixture(menu, {}, { path: CANVAS, url: "u", ...row });
  tree.open();
  const items = tree.items(), item = items[index]!, other = items[1 - index]!;
  // aria-disabled, not Radix `disabled`: a disabled item leaves the arrow order and its reason is never heard.
  expect(item).toMatchObject({ "aria-disabled": true, className: "doan-menu-item shell-menu-reasoned" });
  // Its name is the label alone; the reason is read once, as its description (RC2 ⚪4).
  expect(item["aria-label"]).toBe(index === 0 ? "Export…" : "Move to Trash");
  expect(item.disabled).toBeUndefined();
  const line = tree.rendered().find(element => element.id === item["aria-describedby"])!;
  expect(line).toMatchObject({ className: "shell-menu-reason", children: reason });
  expect(other["aria-disabled"]).toBeUndefined();
  const event = { preventDefault: vi.fn() };
  (item.onSelect as (event: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(tree.canvasMenu.exportCanvas).not.toHaveBeenCalled();
  expect(tree.canvasMenu.trash).not.toHaveBeenCalled();
});

it("keeps a locked row's button in the focus order as aria-disabled, and it opens nothing", () => {
  const tree = canvasMenuFixture({}, { locked: true });
  expect(tree.button()).toMatchObject({ "aria-disabled": true, tabIndex: -1 });
  expect(tree.button().disabled).toBeUndefined();
  tree.open();
  expect(tree.canvasRoot().open).toBe(false);
  // The project row's button stays usable: its menu works while locked.
  expect(tree.rendered().find(item => item["aria-label"] === "demo menu")!["aria-disabled"]).toBeUndefined();
});

it("keeps the status spot and its name in the row while the button shows", () => {
  const slots = new Map<string, SidebarSlot>([[CANVAS_KEY, { kind: "working", label: "Codex is working" }]]);
  const tree = canvasMenuFixture({}, { slots });
  tree.open();
  // The spot is drawn by SlotMark (its name: ShellSidebar.test.tsx); the CSS hides it visually only.
  expect(tree.rendered()).toContainEqual({ slot: { kind: "working", label: "Codex is working" } });
});

it("on close, focus returns to the button unless a dialog the menu opened or another control holds it", () => {
  vi.stubGlobal("HTMLElement", class {});
  try {
    const tree = canvasMenuFixture();
    tree.open();
    (tree.canvasRow().ref as (node: unknown) => void)({ contains: () => false });
    const content = tree.rendered().find(item => typeof item.onCloseAutoFocus === "function" && String(item.className).includes("shell-canvas-menu"))!;
    expect(content.className).toBe("menu doan-floating doan-menu shell-canvas-menu shell-side-menu");
    const inMenu = Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { closest: (selector: string) => selector.includes(".shell-canvas-menu") ? {} : null });
    const close = (dialog: boolean) => {
      vi.stubGlobal("document", { activeElement: inMenu, body: {}, querySelector: () => dialog ? {} : null });
      const event = { preventDefault: vi.fn() };
      (content.onCloseAutoFocus as (event: unknown) => void)(event);
      return event.preventDefault;
    };
    // Escape: Radix's own return to the trigger.
    expect(close(false)).not.toHaveBeenCalled();
    // Move to Trash opened its dialog: App returns focus to the button once it closes.
    expect(close(true)).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});

// PRODUCT §5 item 1: a project row in a problem state has no groups to fold.
const problemRows: [FolderEntry, string][] = [
  [{ path: "/a", kind: "notFound" }, "demo is missing"],
  [{ path: "/a", kind: "uninitialized" }, "demo isn’t set up"],
  [{ path: "/a", kind: "error", message: "bad config" }, "Doan couldn’t read demo’s configuration"],
  [{ path: "/a", kind: "cliError", reason: "offline" }, "Doan couldn’t read demo"],
];
function problemFixture(problem: FolderEntry, extra: Record<string, unknown> = {}) {
  const { props } = fixture();
  props.cards[0]!.rows[0] = problem;
  const all = { ...props, ...extra };
  hooks.cursor = 0;
  const rendered = elements(ShellSidebar(all));
  return { props: all, rendered, project: rendered.find(item => item["data-key"] === "common")! };
}

it.each(problemRows)("a project row in a problem state is not expandable: no chevron, and arrows do not fold it (%j)", problem => {
  const { props, project, rendered } = problemFixture(problem);
  expect(rendered.find(item => item.className === "shell-disclosure")).toBeUndefined();
  expect(project["aria-expanded"]).toBeUndefined();
  key(project, "ArrowRight");
  key(project, "ArrowLeft");
  expect(props.disclose).not.toHaveBeenCalled();
  // The row still moves to the project's workspace.
  (project.onClick as () => void)();
  expect(props.toggle).toHaveBeenCalledWith("common");
});

it.each(problemRows)("describes the row by a sr-only sentence the icon's tooltip repeats, and the open tooltip cannot change it (%j)", (problem, sentence) => {
  const { project, rendered } = problemFixture(problem);
  const described = rendered.find(item => item.className === "sr-only" && item.id === project["aria-describedby"]);
  expect(described?.children).toBe(sentence);
  expect(project["aria-label"]).toBe("demo");
  // The row is not a tooltip trigger, so Radix has no row description to add the open content's id to; only the
  // aria-hidden icon is, and the tooltip repeats the sentence (POSTMORTEM 2026-11-07).
  const mark = rendered.find(item => (item.slot as { kind?: string } | undefined)?.kind === "problem")!;
  expect(mark.slot).toMatchObject({ kind: "problem", label: sentence });
  const parts = elements(RowSlotMark(mark as { slot: never }));
  const trigger = parts.find(item => item.asChild === true)!;
  expect(elements(trigger.children as ReactNode)[0]).toMatchObject({ className: "row-slot problem", "aria-hidden": "true" });
  expect(parts.some(item => item.children === sentence)).toBe(true);
  for (const own of rendered.filter(item => item.asChild === true)) expect(elements(own.children as ReactNode).some(item => item["data-key"] === "common")).toBe(false);
});

it("a canvas notice or terminal session does not redirect the click of a row whose problem icon wins", () => {
  const terminal = { kind: "working" as const, label: "Codex is working in a terminal", source: "terminal" as const };
  const { props, project } = problemFixture({ path: "/a", kind: "notFound" }, { slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", terminal]]) });
  (project.onClick as () => void)();
  expect(props.toggle).toHaveBeenLastCalledWith("common");
  key(project, "Enter");
  expect(props.toggle).toHaveBeenLastCalledWith("common");
});

it("a permission request beats the problem icon, and its click still opens the conversation", () => {
  const permission = { kind: "permission" as const, label: "Codex needs your answer", source: "terminal" as const };
  const { props, project, rendered } = problemFixture({ path: "/a", kind: "notFound" }, { slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", permission]]) });
  expect(rendered).toContainEqual({ slot: permission });
  expect(project["aria-describedby"]).toBeDefined();
  (project.onClick as () => void)();
  expect(props.toggle).toHaveBeenLastCalledWith("common", { root: "/b", path: ".doan/canvases/a.html" });
});

it("the project menu's Overview item is available on a problem root, and opens it", () => {
  const { props, rendered } = problemFixture({ path: "/a", kind: "notFound" });
  const item = rendered.find(entry => [entry.children].flat().includes("Overview"))!;
  expect(item.disabled).toBeUndefined();
  expect(item["aria-disabled"]).toBeUndefined();
  (item.onSelect as () => void)();
  expect(props.overview).toHaveBeenCalledWith("/a");
});

// PRODUCT §5 item 1: the spinner waits for LOADING_DELAY_MS, timed from when the root began to load.
describe("reading spinner", () => {
  const slotOf = (rendered: Record<string, unknown>[]) => rendered.find(item => (item.slot as { kind?: string } | undefined)?.kind === "reading")?.slot;
  function reading() {
    hooks.stable = true;
    const { props } = fixture(null, false);
    const draw = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; const rendered = elements(ShellSidebar(props)); const run = hooks.pending; hooks.pending = []; for (const effect of run) effect(); return rendered; };
    const set = (path: string, kind: "loading" | "list") => { props.cards[0]!.rows = props.cards[0]!.rows.map(row => row.path === path ? kind === "loading" ? { path, kind } : fixtureList(path) : row); };
    return { props, draw, set };
  }
  const fixtureList = (path: string): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [] });
  it("shows only after the delay, with the row described as Reading <name>", () => {
    vi.useFakeTimers();
    try {
      const { draw, set } = reading();
      set("/a", "loading");
      expect(slotOf(draw())).toBeUndefined();
      vi.advanceTimersByTime(299);
      expect(slotOf(draw())).toBeUndefined();
      vi.advanceTimersByTime(1);
      const rendered = draw();
      expect(slotOf(rendered)).toEqual({ kind: "reading", label: "Reading demo" });
      const row = rendered.find(item => item["data-key"] === "common")!;
      expect(rendered.find(item => item.id === row["aria-describedby"])?.children).toBe("Reading demo");
      expect(row["aria-expanded"]).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
  it("is timed per root: another root starting to load does not restart it", () => {
    vi.useFakeTimers();
    try {
      const { draw, set } = reading();
      set("/a", "loading");
      draw();
      vi.advanceTimersByTime(200);
      set("/b", "loading");
      draw();
      vi.advanceTimersByTime(100);
      expect(slotOf(draw())).toBeDefined();
    } finally { vi.useRealTimers(); }
  });
  it("waits again when the root loads again after it was read", () => {
    vi.useFakeTimers();
    try {
      const { draw, set } = reading();
      set("/a", "loading");
      draw();
      vi.advanceTimersByTime(300);
      expect(slotOf(draw())).toBeDefined();
      set("/a", "list");
      expect(slotOf(draw())).toBeUndefined();
      set("/a", "loading");
      draw();
      vi.advanceTimersByTime(299);
      expect(slotOf(draw())).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});
