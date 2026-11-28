import { Children, isValidElement, type ReactNode } from "react";
import { AlertIcon } from "./AlertIcon";
import { Info, RotateCw } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_DRAG_TYPE, canvasDragging, canvasDragOf, endCanvasDrag } from "./canvasChipDrag";
import { RowSlotMark, ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
import type { SidebarSlot } from "./canvasNotice";
import type { CanvasMenu } from "./ShellSidebar";
import { toolShortcut } from "./canvasTool";
import { drawn, keydownOn } from "./drawnTarget.test-support";
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
// ←/→ only fold and unfold, the loaded project included; Enter is the row's move.
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
  [{ path: "/b", kind: "error", message: "bad config", config: "/b/.doan/config.json" }, ["Retry", "retry"], ["Details", "details"]],
  [{ path: "/b", kind: "uninitialized" }, ["Set up", "setUp"]],
  [{ path: "/b", kind: "cliError", reason: "offline" }, ["Retry", "retry"], ["Details", "details"]],
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
    const repair = rendered.find(item => typeof item.onSelect === "function" && [item.children].flat().includes(label))!;
    expect(repair).toBeDefined();
    // Retry and Details carry icons like the menu's other items.
    const icon = { Retry: RotateCw, Details: Info }[label];
    if (icon) expect([repair.children].flat().some(child => isValidElement(child) && child.type === icon), label).toBe(true);
    (repair.onSelect as () => void)();
    expect(props.action).toHaveBeenLastCalledWith(action, "/b");
  }
  const live = [...hooks.refs].reverse().find(ref => ref.current === props)!;
  live.current = { ...props, cards: [] };
  props.action.mockClear();
  for (const [label] of actions) (rendered.find(item => typeof item.onSelect === "function" && [item.children].flat().includes(label))!.onSelect as () => void)();
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

// While the Add Projects page selects or clones, the moves are aria-disabled (kept in the focus order) and App ignores their
// activation. Project Settings opens a page, so it is a move too.
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

// PRODUCT §5 item 1: a closed head's slot only marks; a press anywhere on the head, the slot included, toggles the group.
it("a closed head's slot has no action of its own: pressing the head opens the group and opens no canvas", () => {
  const slots = new Map<string, SidebarSlot>([["/a\n.doan/ds/button.html", { kind: "permission", label: "Codex needs your answer" }]]);
  const tree = groupsFixture({ ds: false }, undefined, { slots });
  const head = tree.row("Design system");
  const parts = elements(head.children as ReactNode);
  // The mark is the canvas rows' own SlotMark (its markup: ShellSidebar.test.tsx), handed the slot and no handler.
  const mark = parts.find(item => "slot" in item)!;
  expect(mark).toEqual({ slot: { kind: "permission", label: "Codex needs your answer" } });
  (head.onClick as () => void)();
  expect(tree.props.toggleGroup).toHaveBeenCalledWith("common", "ds");
  expect(tree.props.open).not.toHaveBeenCalled();
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

// A bare `.html` keeps its full file name as its label (canvasLabel); typeahead matches the label the row shows.
it("names canvas rows and matches typeahead by the sidebar's label", () => {
  const tree = groupsFixture(undefined, ["canvases/checkout", "canvases/"]);
  expect(tree.rows.map(row => row["aria-label"])).toEqual(["demo", "Design system", "Canvases", ".html", "checkout"]);
  tree.press("demo", ".");
  expect(tree.active()).toBe(".html");
});

it("still opens and closes groups while the page is locked, showing their heads unavailable", () => {
  const tree = groupsFixture(undefined, undefined, { locked: true });
  const head = tree.row("Design system");
  expect(head["aria-disabled"]).toBe(true);
  (head.onClick as (event: unknown) => void)({});
  tree.press("Canvases", "ArrowLeft");
  expect(tree.props.toggleGroup.mock.calls).toEqual([["common", "ds"], ["common", "canvases"]]);
});
// A project row's canvas notice and terminal spinner only mark: the row's click and Enter keep the row's own move and
// hand it no canvas (PRODUCT §5 item 1).
it("a project row's canvas notice or terminal spinner does not change its click or Enter", () => {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const notice = { kind: "canvas" as const, label: "a is new" };
  const terminal = { kind: "working" as const, label: "Codex is working in a terminal", source: "terminal" as const };
  for (const slot of [notice, terminal]) {
    const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: false } }, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), disclose: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(), canvasMenu: NO_CANVAS_MENU,
      slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", slot]]) };
    hooks.cursor = 0;
    const rendered = elements(ShellSidebar(props));
    expect(rendered).toContainEqual({ slot });
    const project = rendered.find(item => item["data-key"] === "common")!;
    if (typeof project.onClick !== "function") throw new Error("Missing click handler");
    project.onClick();
    key(project, "Enter");
    expect(props.toggle.mock.calls).toEqual([["common"], ["common"]]);
  }
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
  // Its name is the label alone; the reason is read once, as its description.
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

// ErrorDetails is a component the shallow tree never expands, so its render prop is called with the open state by hand.
it("an unreadable canvas's open Details block is selectable, its Details button is not", () => {
  const tree = canvasMenuFixture({}, {}, { path: CANVAS, url: "u", error: { code: "bad", message: "Unreadable" } });
  const details = tree.rendered().find(item => typeof item.children === "function" && item.detail === "bad: Unreadable")!;
  const open = (details.children as (button: ReactNode, detail: string | null) => ReactNode)(null, "bad: Unreadable");
  const block = elements(open).find(item => item.children === "bad: Unreadable")!;
  expect(block.className).toBe("selectable");
  // No `btn` class: no rule reads it, the button is a plain doan-button.
  expect(details.className).toBeUndefined();
  // DESIGN 'No coloured edge stripes': the unreadable line leads with the alert icon.
  const line = tree.rendered().find(item => item.className === "shell-canvas-error")!;
  expect(Children.toArray(line.children as ReactNode).some(child => isValidElement(child) && child.type === AlertIcon)).toBe(true);
});

it("keeps a locked row's button in the focus order as aria-disabled, and it opens nothing", () => {
  const tree = canvasMenuFixture({}, { locked: true });
  // The unavailable state sits on Radix's trigger, which its Slot merges onto the button.
  const trigger = tree.rendered().find(item => item.asChild === true && (item.children as { props?: Record<string, unknown> } | undefined)?.props?.["aria-label"] === "a menu")!;
  expect({ ...trigger, ...tree.button() }).toMatchObject({ "aria-disabled": true, tabIndex: -1 });
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

// PRODUCT §5 item 2 'Canvas header': on the canvas page an open row menu keeps every printable key, while a row that
// only has focus leaves V and H to the canvas tools.
it("V, H and Space pressed in an open row menu never switch the canvas tool; a focused row with no menu open keeps them", () => {
  const tree = canvasMenuFixture();
  const press = (chain: Record<string, unknown>[], code: string) => toolShortcut(keydownOn(code, drawn(chain)), { canvasPage: true });
  const treeRoot = tree.rendered().find(item => item.role === "tree")!;
  expect(press([treeRoot, tree.canvasRow()], "KeyV")).toEqual({ kind: "tool", tool: "select" });
  expect(press([treeRoot, tree.canvasRow()], "KeyH")).toEqual({ kind: "tool", tool: "hand" });
  tree.open();
  const canvasMenu = tree.rendered().find(item => String(item.className).includes("shell-canvas-menu"))!;
  (tree.rendered().filter(item => typeof item.onOpenChange === "function")[0]!.onOpenChange as (open: boolean) => void)(true);
  tree.render();
  const projectMenu = tree.rendered().find(item => String(item.className).includes("shell-project-menu"))!;
  // Radix draws role="menu" on the content and menuitem on each item.
  for (const content of [canvasMenu, projectMenu]) {
    for (const code of ["KeyV", "KeyH", "Space"]) expect(press([{ ...content, role: "menu" }, { role: "menuitem" }], code), `${String(content.className)} ${code}`).toBeNull();
  }
});

// PRODUCT §5 item 1: a project row in a problem state has no groups to fold.
const problemRows: [FolderEntry, string][] = [
  [{ path: "/a", kind: "notFound" }, "demo is missing"],
  [{ path: "/a", kind: "uninitialized" }, "demo isn’t set up"],
  [{ path: "/a", kind: "error", message: "bad config", config: "/a/.doan/config.json" }, "Doan couldn’t read demo’s configuration"],
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
  expect(props.toggle.mock.lastCall).toEqual(["common"]);
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

// The viewed canvas's conversation rows in the tree's keyboard order and their actions.
describe("the viewed canvas's conversation list", () => {
  const CHECKOUT = ".doan/canvases/checkout.html", PRICING = ".doan/canvases/pricing.html";
  const conversation = (conversationId: string, minutes: number, patch: Record<string, unknown> = {}) => ({ conversationId, canvas: { path: CHECKOUT }, title: `Title ${conversationId}`, owner: "doan", provider: "claude",
    fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: new Date(Date.parse("2026-11-14T12:00:00.000Z") - minutes * 60_000).toISOString(), preview: "", ...patch });
  function conversations(patch: Record<string, unknown> = {}) {
    let list: unknown = [conversation("c1", 1), conversation("c2", 5), conversation("c3", 9)];
    return { setList(next: unknown) { list = next; }, list: () => list as never, shown: "c1", seen: new Set<string>(), now: Date.parse("2026-11-14T12:00:00.000Z"), folded: false, bare: new Map(), fold: vi.fn(), open: vi.fn(), remove: vi.fn(), ...patch };
  }
  const tree = (props: ReturnType<typeof conversations>, canvas = CHECKOUT) => groupsFixture(undefined, ["canvases/checkout", "canvases/pricing"], { canvas, conversations: props });

  it("puts the conversation rows after their canvas row in the keyboard order", () => {
    const t = tree(conversations());
    expect(t.rows.map(row => [row["aria-label"], row["aria-level"]])).toEqual([["demo", 1], ["Design system", 2], ["Canvases", 2], ["checkout", 3], ["Title c1", 4], ["Title c2", 4], ["Title c3", 4], ["pricing", 3]]);
    t.press("checkout", "ArrowDown"); expect(t.active()).toBe("Title c1");
    t.press("Title c3", "ArrowDown"); expect(t.active()).toBe("pricing");
  });

  it("on the canvas row → goes to the first conversation and ← folds; folded, → unfolds and ← goes to the group head", () => {
    const open = conversations();
    const t = tree(open);
    t.press("checkout", "ArrowRight"); expect(t.active()).toBe("Title c1");
    t.press("checkout", "ArrowLeft"); expect(open.fold).toHaveBeenCalledWith(true);
    const folded = conversations({ folded: true });
    const f = tree(folded);
    expect(f.rows.map(row => row["aria-label"])).not.toContain("Title c1");
    f.press("checkout", "ArrowRight"); expect(folded.fold).toHaveBeenCalledWith(false);
    f.press("checkout", "ArrowLeft"); expect(f.active()).toBe("Canvases");
    expect(folded.fold).toHaveBeenCalledOnce();
  });

  it("on a conversation row ← goes to its canvas row and → does nothing", () => {
    const props = conversations();
    const t = tree(props);
    t.press("Title c2", "ArrowLeft"); expect(t.active()).toBe("checkout");
    const event = t.press("Title c2", "ArrowRight");
    expect(t.active()).toBe("checkout");
    expect(props.fold).not.toHaveBeenCalled();
    expect(props.open).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("a conversation row's press and Enter ask App for that conversation on its canvas, never the canvas row's move", () => {
    const props = conversations();
    const t = tree(props);
    (t.row("Title c2").onClick as () => void)();
    t.press("Title c3", "Enter");
    expect(props.open.mock.calls.map(call => [call[0], (call[1] as { path: string }).path, call[2]])).toEqual([["/a", CHECKOUT, "c2"], ["/a", CHECKOUT, "c3"]]);
    expect(t.props.open).not.toHaveBeenCalled();
  });

  it("Delete is on the row's tab stop only, never in the arrow order, and hands App the next row for focus", () => {
    const props = conversations();
    const t = tree(props);
    const trash = (name: string) => elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never)).find(item => item["aria-label"] === `Delete “${name}”`)!;
    expect(t.rows.map(row => row["aria-label"])).not.toContain("Delete “Title c2”");
    expect(trash("Title c2").tabIndex).toBe(-1);
    const node = {};
    const click = { stopPropagation: vi.fn(), currentTarget: node };
    (trash("Title c2").onClick as (event: unknown) => void)(click);
    expect(click.stopPropagation).toHaveBeenCalled();
    expect(props.remove).toHaveBeenCalledWith({ conversationId: "c2", root: "/a", title: "Title c2", provider: "claude", from: "sidebar", after: `/a\n${CHECKOUT}\nc3`, canvasRow: `/a\n${CHECKOUT}` }, node);
    (trash("Title c3").onClick as (event: unknown) => void)(click);
    expect(props.remove).toHaveBeenLastCalledWith(expect.objectContaining({ conversationId: "c3", after: `/a\n${CHECKOUT}\nc2` }), node);
    expect(t.props.open).not.toHaveBeenCalled();
  });

  it("an unavailable Delete asks App for nothing", () => {
    const props = conversations();
    props.setList([conversation("c1", 1), conversation("c2", 5, { phase: "waiting", working: true })]);
    const t = tree(props);
    const trash = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never)).find(item => item["aria-label"] === "Delete “Title c2”")!;
    (trash.onClick as (event: unknown) => void)({ stopPropagation: vi.fn(), currentTarget: {} });
    expect(props.remove).not.toHaveBeenCalled();
  });

  it("the canvas row's chevron folds the list without the row's move, and never takes focus from a press", () => {
    const props = conversations();
    const t = tree(props);
    const rendered = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never));
    const chevron = rendered.find(item => item["aria-label"] === "Collapse checkout")!;
    const down = { preventDefault: vi.fn() };
    (chevron.onMouseDown as (event: unknown) => void)(down);
    expect(down.preventDefault).toHaveBeenCalled();
    const click = { stopPropagation: vi.fn() };
    (chevron.onClick as (event: unknown) => void)(click);
    expect(click.stopPropagation).toHaveBeenCalled();
    expect(props.fold).toHaveBeenCalledWith(true);
    expect(t.props.open).not.toHaveBeenCalled();
  });

  // The chevron sits inside its canvas row, which stays, so row recovery never sees it go; its unmount with focus must hand focus to
  // the canvas row, not the page body (POSTMORTEM 2026-11-03).
  it("a chevron that unmounts while it holds focus hands focus to its canvas row", async () => {
    const props = conversations();
    const t = tree(props);
    const rendered = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never));
    const chevron = rendered.find(item => item["aria-label"] === "Collapse checkout")!;
    const canvasRow = rendered.find(item => item.role === "treeitem" && item["aria-label"] === "checkout")!;
    const body = {}, chevronNode = { isConnected: true }, rowNode = { focus: vi.fn(), contains: () => false, isConnected: true };
    vi.stubGlobal("document", { activeElement: chevronNode, body });
    try {
      (canvasRow.ref as (node: unknown) => void)(rowNode);
      expect(typeof chevron.ref).toBe("function");
      (chevron.ref as (node: unknown) => void)(chevronNode);
      (chevron.ref as (node: unknown) => void)(null);
      (document as unknown as { activeElement: unknown }).activeElement = body;
      await Promise.resolve();
      expect(rowNode.focus).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  // A re-render hands the chevron a new ref callback (the old one gets null first); a chevron still focused and on the
  // page keeps its focus.
  it("a re-render while the chevron holds focus leaves focus on it", async () => {
    const props = conversations();
    const t = tree(props);
    const rendered = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never));
    const chevron = rendered.find(item => item["aria-label"] === "Collapse checkout")!;
    const canvasRow = rendered.find(item => item.role === "treeitem" && item["aria-label"] === "checkout")!;
    const chevronNode = { isConnected: true }, rowNode = { focus: vi.fn(), contains: () => false, isConnected: true };
    vi.stubGlobal("document", { activeElement: chevronNode, body: {} });
    try {
      (canvasRow.ref as (node: unknown) => void)(rowNode);
      (chevron.ref as (node: unknown) => void)(chevronNode);
      (chevron.ref as (node: unknown) => void)(null);
      (chevron.ref as (node: unknown) => void)(chevronNode);
      await Promise.resolve();
      expect(rowNode.focus).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("a chevron that unmounts without focus moves nothing", async () => {
    const props = conversations();
    const t = tree(props);
    const rendered = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props } as never));
    const chevron = rendered.find(item => item["aria-label"] === "Collapse checkout")!;
    const canvasRow = rendered.find(item => item.role === "treeitem" && item["aria-label"] === "checkout")!;
    const elsewhere = { isConnected: true }, chevronNode = { isConnected: true }, rowNode = { focus: vi.fn(), contains: () => false, isConnected: true };
    vi.stubGlobal("document", { activeElement: elsewhere, body: {} });
    try {
      (canvasRow.ref as (node: unknown) => void)(rowNode);
      (chevron.ref as (node: unknown) => void)(chevronNode);
      (chevron.ref as (node: unknown) => void)(null);
      await Promise.resolve();
      expect(rowNode.focus).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("a locked page leaves the conversation rows and their Delete doing nothing", () => {
    const props = conversations();
    const t = groupsFixture(undefined, ["canvases/checkout", "canvases/pricing"], { canvas: CHECKOUT, conversations: props, locked: true });
    (t.row("Title c2").onClick as () => void)();
    t.press("Title c2", "Enter");
    const trash = elements(ShellSidebar({ ...t.props, canvas: CHECKOUT, conversations: props, locked: true } as never)).find(item => item["aria-label"] === "Delete “Title c1”")!;
    (trash.onClick as (event: unknown) => void)({ stopPropagation: vi.fn(), currentTarget: {} });
    expect(props.open).not.toHaveBeenCalled();
    expect(props.remove).not.toHaveBeenCalled();
  });

  describe("held order and place", () => {
    const openSpy = vi.fn();
    beforeEach(() => openSpy.mockClear());
    const render = (props: ReturnType<typeof conversations>, canvas = CHECKOUT) => {
      hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
      const { props: base } = fixture();
      base.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: [{ path: CHECKOUT, url: "c" }, { path: PRICING, url: "p" }] };
      return elements(ShellSidebar({ ...base, open: openSpy, canvas, conversations: props } as never));
    };
    const titles = (rendered: Record<string, unknown>[]) => rendered.filter(item => item.className === "shell-conv-row row").map(item => item["aria-label"]);
    const group = (rendered: Record<string, unknown>[]) => rendered.find(item => item.className === "shell-conv-list")!;
    const aside = (rendered: Record<string, unknown>[]) => rendered.find(item => item["aria-label"] === "Projects" && item.className === "side shell-side")!;

    it("while the pointer is over the list its rows keep their order and a new conversation goes last; leaving sorts again", () => {
      hooks.stable = true;
      const props = conversations();
      let rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2", "Title c3"]);
      (group(rendered).onPointerEnter as () => void)();
      props.setList([conversation("c1", 1), conversation("c2", 5), conversation("c3", 0), conversation("c4", 0)]);
      rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2", "Title c3", "Title c4"]);
      (group(rendered).onPointerLeave as () => void)();
      rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c3", "Title c4", "Title c1", "Title c2"]);
    });

    it("while keyboard focus is in the list its rows keep their order", () => {
      hooks.stable = true;
      const props = conversations();
      let rendered = render(props);
      (group(rendered).onFocus as () => void)();
      props.setList([conversation("c1", 1), conversation("c2", 5), conversation("c3", 0)]);
      rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2", "Title c3"]);
      (group(rendered).onBlur as (event: unknown) => void)({ currentTarget: { contains: () => false }, relatedTarget: null });
      rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c3", "Title c1", "Title c2"]);
    });

    const canvasRowOf = (rendered: Record<string, unknown>[], name: string) => rendered.find(item => item.role === "treeitem" && item["aria-label"] === name)!;
    const press = (rendered: Record<string, unknown>[], name: string) => (canvasRowOf(rendered, name).onClick as () => void)();
    const treeLabels = (rendered: Record<string, unknown>[]) => rendered.filter(item => item.role === "treeitem").map(item => item["aria-label"]);
    const both = (props: ReturnType<typeof conversations>, checkout: number) => props.setList([
      ...[conversation("c1", 1), conversation("c2", 5)].slice(0, checkout),
      conversation("b1", 1, { canvas: { path: PRICING } }), conversation("b2", 2, { canvas: { path: PRICING } })]);

    it("after a press on a canvas row below, the list stays under the previous canvas until the pointer leaves the sidebar", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      const keys = treeLabels(rendered);
      expect(keys.indexOf("Title c1")).toBe(keys.indexOf("checkout") + 1);
      (aside(rendered).onPointerLeave as () => void)();
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
      const moved = treeLabels(rendered);
      expect(moved.indexOf("Title b1")).toBe(moved.indexOf("pricing") + 1);
    });

    // App decides a canvas row press from what that row shows, so the sidebar says whether its list shows there.
    it("a canvas row press tells App whether that row's list shows: the held row yes, the viewed row below it no", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      press(rendered, "checkout");
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      press(rendered, "pricing");
      press(rendered, "checkout");
      const target = {};
      (canvasRowOf(rendered, "checkout").onKeyDown as (event: unknown) => void)({ key: "Enter", target, currentTarget: target, preventDefault: () => {}, metaKey: false, ctrlKey: false, altKey: false });
      const calls = openSpy.mock.calls.map(call => [(call[1] as { path: string }).path, call[2]]);
      expect(calls).toEqual([[CHECKOUT, true], [PRICING, undefined], [PRICING, undefined], [CHECKOUT, true], [CHECKOUT, true]]);
    });

    // A list replaced by another canvas's sends no blur or pointerleave, so its hold must not pass to the new one.
    it.each([["focus", "onFocus"], ["pointer", "onPointerEnter"]])("a hold by %s in one canvas's list does not freeze the next canvas's list", (_name, handler) => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      (group(rendered)[handler] as () => void)();
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
      props.setList([conversation("c1", 1), conversation("c2", 5), conversation("b1", 3, { canvas: { path: PRICING } }), conversation("b2", 0, { canvas: { path: PRICING } })]);
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b2", "Title b1"]);
    });

    it("a hold entered in the new list freezes it", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props, PRICING);
      (group(rendered).onFocus as () => void)();
      rendered = render(props, PRICING);
      props.setList([conversation("c1", 1), conversation("c2", 5), conversation("b1", 3, { canvas: { path: PRICING } }), conversation("b2", 0, { canvas: { path: PRICING } })]);
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
    });

    // A held press belongs to the one move it caused; a later keyboard move or Back/Forward to the same canvas must not reuse it.
    it("after a held press, keyboard moves back and to the pressed canvas again end with the list under it", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      const enter = (name: string) => { const target = {}; (canvasRowOf(rendered, name).onKeyDown as (event: unknown) => void)({ key: "Enter", target, currentTarget: target, preventDefault: () => {}, metaKey: false, ctrlKey: false, altKey: false }); };
      enter("checkout");
      rendered = render(props, CHECKOUT);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      enter("pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
    });

    it("after a held press, Back then Forward to the pressed canvas end with the list under it", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title c1", "Title c2"]);
      rendered = render(props, CHECKOUT);
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
    });

    it("a press below from a canvas with one conversation shows the new list at once", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 1);
      let rendered = render(props);
      expect(titles(rendered)).toEqual([]);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
      expect(canvasRowOf(rendered, "pricing")["aria-expanded"]).toBe(true);
    });

    it("a press below while the list is folded moves the chevron to the new canvas at once", () => {
      hooks.stable = true;
      const props = conversations({ folded: true });
      both(props, 2);
      let rendered = render(props);
      expect(canvasRowOf(rendered, "checkout")["aria-expanded"]).toBe(false);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      press(rendered, "pricing");
      rendered = render(props, PRICING);
      expect(canvasRowOf(rendered, "pricing")["aria-expanded"]).toBe(false);
      expect(canvasRowOf(rendered, "checkout")["aria-expanded"]).toBeUndefined();
    });

    it("a keyboard move to a canvas below follows at once, even with the pointer resting in the sidebar", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props);
      const target = {};
      (canvasRowOf(rendered, "pricing").onKeyDown as (event: unknown) => void)({ key: "Enter", target, currentTarget: target, preventDefault: () => {}, metaKey: false, ctrlKey: false, altKey: false });
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
    });

    it("a viewed canvas that changes with no press (Back, a link) follows at once while the pointer rests in the sidebar", () => {
      hooks.stable = true;
      const props = conversations();
      both(props, 2);
      let rendered = render(props);
      (aside(rendered).onPointerEnter as () => void)();
      rendered = render(props, PRICING);
      expect(titles(rendered)).toEqual(["Title b1", "Title b2"]);
    });
  });
});

// A canvas row drags as a canvas chip (PRODUCT §5 item 6 after canvas-chip): only where the row menu could add it, with
// only Doan's marker on the transfer; the tree's click, arrows and typeahead stay as they are.
describe("dragging a canvas row", () => {
  const ROW = { path: ".doan/canvases/checkout.html", url: "checkout", id: "checkout" };
  function dragFixture(reason: string | null = null, extra: Record<string, unknown> = {}) {
    const { props } = fixture();
    props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: [ROW, { path: ".doan/canvases/pricing.html", url: "pricing", id: "pricing" }] };
    const chipDrag = { reason: vi.fn(() => reason), judge: vi.fn(() => "judged") };
    hooks.cursor = 0; hooks.refs = [];
    const all = { ...props, canvas: undefined, chipDrag, ...extra };
    const rendered = elements(ShellSidebar(all as never));
    const rows = rendered.filter(item => item["aria-level"] === 3);
    const row = (name: string) => rows.find(item => item["aria-label"] === name)!;
    return { props: all, rendered, rows, row, chipDrag };
  }
  const transfer = () => ({ types: [] as string[], setData(type: string) { this.types.push(type); }, setDragImage: vi.fn(), effectAllowed: "uninitialized" });
  // No document here: the drag image, drawn in the row's own document, is the Chromium probe's to see.
  const dragStart = (row: Record<string, unknown>) => {
    const event = { dataTransfer: transfer(), preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: {}, target: {} };
    (row.onDragStart as (event: unknown) => void)(event);
    return event;
  };
  afterEach(() => endCanvasDrag());

  it("drags a row the menu could add, and no row while the page is locked or the menu gives a reason", () => {
    expect(dragFixture().row("checkout").draggable).toBe(true);
    expect(dragFixture("Only canvases in demo can go in this message.").row("checkout").draggable).toBe(false);
    expect(dragFixture(null, { locked: true }).row("checkout").draggable).toBe(false);
    expect(dragFixture().rendered.find(item => item["data-key"] === "common")!.draggable).toBeUndefined();
  });

  it("asks the row's own root and row for the reason", () => {
    const { chipDrag } = dragFixture();
    expect(chipDrag.reason).toHaveBeenCalledWith("/a", ROW);
  });

  it("never drags the menu trigger or the conversation chevron", () => {
    const listed = { conversationId: "c1", canvas: { path: ROW.path, id: ROW.id }, title: "Title c1", owner: "doan", provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-14T12:00:00.000Z", preview: "" };
    // The list shows under its canvas row from two conversations on.
    const conversations = { list: () => [listed, { ...listed, conversationId: "c2", title: "Title c2" }], shown: "c1", seen: new Set<string>(), now: 0, folded: false, bare: new Map(), fold: vi.fn(), open: vi.fn(), remove: vi.fn() };
    const { rendered } = dragFixture(null, { canvas: ROW.path, conversations });
    const triggers = rendered.filter(item => item.className === "doan-icon-button shell-more" && ["checkout menu", "pricing menu"].includes(item["aria-label"] as string));
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) expect(trigger.draggable).toBe(false);
    const chevron = rendered.find(item => item["aria-label"] === "Collapse checkout")!;
    expect(chevron.draggable).toBe(false);
  });

  it("keeps the drag in memory with the row's root, path and id, judged by App, and does not open the row", () => {
    const { props, row, chipDrag } = dragFixture();
    const event = dragStart(row("checkout"));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.types).toEqual([CANVAS_DRAG_TYPE]);
    expect(event.dataTransfer.effectAllowed).toBe("copy");
    const drag = canvasDragOf({ types: [CANVAS_DRAG_TYPE] } as unknown as DataTransfer);
    expect(drag).toMatchObject({ root: "/a", path: ROW.path, id: "checkout" });
    const composer = { root: "/a", canTake: () => null };
    expect(drag !== null && drag !== "foreign" && drag.judge(composer)).toBe("judged");
    expect(chipDrag.judge).toHaveBeenCalledWith("/a", ROW, composer);
    expect(props.open).not.toHaveBeenCalled();
    (row("checkout").onDragEnd as () => void)();
    expect(canvasDragging()).toBe(false);
  });

  it("cancels a drag start the menu now refuses, or one on a locked page", () => {
    const cases: [string | null, Record<string, unknown>][] = [["Finish typing first.", {}], [null, { locked: true }]];
    for (const [reason, extra] of cases) {
      const { row } = dragFixture(reason, extra);
      const event = dragStart(row("checkout"));
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.dataTransfer.types).toEqual([]);
      expect(canvasDragging()).toBe(false);
    }
  });

  it("leaves the row's click, arrows and typeahead as they were after a drag", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const { props, rows, row } = dragFixture();
      const nodes = rows.map(item => ({ dataset: { key: item["data-key"] }, focus: vi.fn() }));
      const host = hooks.refs.find(ref => ref.current === null)!;
      host.current = { querySelectorAll: () => nodes };
      dragStart(row("checkout"));
      (row("checkout").onDragEnd as () => void)();
      key(row("checkout"), "ArrowDown");
      expect(nodes[1]!.focus).toHaveBeenCalledOnce();
      // "c" alone matches the Canvases head first.
      key(row("pricing"), "c"); key(row("pricing"), "h");
      expect(nodes[0]!.focus).toHaveBeenCalledOnce();
      expect(props.open).not.toHaveBeenCalled();
      (row("pricing").onClick as () => void)();
      expect(props.open).toHaveBeenCalledWith("/a", expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
    } finally { now.mockRestore(); }
  });
});
