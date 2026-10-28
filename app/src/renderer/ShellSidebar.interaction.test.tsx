import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
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
  const row = { path: ".doan/canvases/a.html", url: "u", open: 0, resolved: 0 };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: true } }, loaded, canvas: row.path, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}) };
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
  [{ path: "/b", kind: "notFound" }, ["Locate…", "locate"]],
  [{ path: "/b", kind: "error", message: "bad config" }, ["Retry", "retry"], ["Details", "details"]],
  [{ path: "/b", kind: "uninitialized" }, ["Set Up…", "setUp"]],
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

it("uses natural filename order for both visible rows and keyboard navigation", () => {
  const { props } = fixture();
  const names = ["Zeta", "foo-bar", "foo", "page10", "page2"];
  props.cards[0]!.rows[0] = { path: "/a", kind: "list", servedRev: 0, canvases: names.map(name => ({ path: `.doan/canvases/${name}.html`, url: name, open: 0, resolved: 0 })) };
  hooks.cursor = 0; hooks.refs = [];
  const rendered = elements(ShellSidebar(props));
  const rows = rendered.filter(item => item["aria-level"] === 2);
  expect(rows.map(item => item["aria-label"])).toEqual(["foo", "foo-bar", "page2", "page10", "Zeta"]);
  const targets = rows.map(item => ({ dataset: { key: item["data-key"] }, focus: vi.fn() }));
  const host = hooks.refs.find(ref => ref.current === null)!;
  host.current = { querySelectorAll: () => targets };
  key(rows[0]!, "ArrowDown");
  expect(targets[1]!.focus).toHaveBeenCalledOnce();
  expect((props.cards[0]!.rows[0] as Extract<FolderEntry, { kind: "list" }>).canvases.map(row => row.url)).toEqual(names);
});
