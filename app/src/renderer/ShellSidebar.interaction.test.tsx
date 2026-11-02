import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
import type { SidebarSlot } from "./canvasNotice";
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], states: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "description",
  useLayoutEffect: () => {},
  useRef: (value: unknown) => { const ref = { current: value }; hooks.refs.push(ref); return ref; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }]; },
}));
beforeEach(() => { hooks.refs = []; hooks.states = []; hooks.cursor = 0; });
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
function fixture(loaded: string | null = "/a") {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: true } }, loaded, canvas: row.path, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn() };
  const rendered = elements(ShellSidebar(props));
  const project = rendered.find(item => item["data-key"] === "common")!;
  const menuItems = rendered.filter(item => typeof item.onSelect === "function");
  return { props, project, menuItems, rendered };
}
function key(props: Record<string, unknown>, value: string, nested = false) {
  const target = {}, event = { key: value, target, currentTarget: nested ? {} : target, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, altKey: false };
  if (typeof props.onKeyDown !== "function") throw new Error("Missing keyboard handler");
  props.onKeyDown(event);
  return event;
}
it("keeps current project expanded on ArrowLeft and ignores keys from its menu trigger", () => {
  const { props, project } = fixture();
  key(project, "ArrowLeft");
  key(project, "Enter", true);
  expect(props.toggle).not.toHaveBeenCalled();
});
it("collapses another project and opens a canvas only on activation, not arrow movement", () => {
  const { props, project, rendered } = fixture(null);
  key(project, "ArrowLeft");
  expect(props.toggle).toHaveBeenCalledWith("common");
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
// project-settings design '들어가기': the menu's Project Settings opens the page for the worktree the menu shows.
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

// buzz-add-projects design '잠금': while the Add Projects page selects or clones, the moves are shown as unavailable
// (aria-disabled keeps them in the focus order); App ignores their activation. Project Settings opens a page now, so it
// is a move too (project-settings design '이동과 잠금').
it("marks Search, project and canvas rows, Overview, Project Settings and worktree items aria-disabled while the page is locked", () => {
  const { props } = fixture();
  hooks.cursor = 0;
  const rendered = elements(ShellSidebar({ ...props, locked: true }));
  expect(rendered.find(item => item.className === "shell-search")?.["aria-disabled"]).toBe(true);
  for (const row of rendered.filter(item => item.role === "treeitem")) expect(row["aria-disabled"]).toBe(true);
  const menu = rendered.filter(item => typeof item.onSelect === "function");
  expect(menu.filter(item => String(item.className).includes("shell-worktree")).map(item => item["aria-disabled"])).toEqual([true, true]);
  // Overview, then Show in Finder, which stays allowed, and Project Settings.
  expect(menu.slice(2, 5).map(item => item["aria-disabled"])).toEqual([true, undefined, true]);
  // Remove from Doan stays allowed (design '잠금').
  expect(menu.at(-1)?.["aria-disabled"]).toBeUndefined();
  hooks.cursor = 0;
  const open = elements(ShellSidebar(props));
  expect(open.filter(item => item["aria-disabled"] !== undefined && item["aria-disabled"] !== false)).toEqual([]);
});

// design-system-canvases design 'sidebar' (Q11): the group heads join the one visible row list, and ←/→ follow the APG tree.
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
// canvas-viewport-units D10: a project row whose slot is a canvas notice hands that canvas to its activation; any
// other slot leaves the activation as it was.
it("passes the project row's canvas notice to toggle on click and Enter", () => {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const notice = { kind: "canvas" as const, label: "a is new" };
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: false } }, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(),
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
// terminal-agent-activity design '표시': a terminal session's slot on the project row opens its canvas, as a notice does.
it("passes the project row's terminal slot to toggle as the canvas to open", () => {
  const row = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const terminal = { kind: "working" as const, label: "Codex is working in a terminal", source: "terminal" as const };
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: false } }, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}), projectSettings: vi.fn(),
    slots: new Map<string, SidebarSlot>([["/b\n.doan/canvases/a.html", terminal]]) };
  hooks.cursor = 0;
  const project = elements(ShellSidebar(props)).find(item => item["data-key"] === "common")!;
  if (typeof project.onClick !== "function") throw new Error("Missing click handler");
  project.onClick();
  expect(props.toggle).toHaveBeenLastCalledWith("common", { root: "/b", path: row.path });
});
