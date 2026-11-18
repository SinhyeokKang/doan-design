import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ElementTreeNode } from "./canvasMessage";
import type { SelectionView } from "./selection";

// The element menu and the row list with their hooks as plain state (AddProjectsPage.interaction.test.tsx style): no
// DOM, so rows are found in the returned element tree, their handlers called, and the component run again.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps?: unknown[] | undefined } | undefined)[], pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    hooks.effects[index] = { deps };
    hooks.pending.push(() => { run(); });
  };
  return {
    ...actual,
    useEffect: effect, useLayoutEffect: effect,
    useId: () => ":hint:",
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useState: (value: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (previous: unknown) => unknown)(hooks.states[index]) : next; }];
    },
  };
});
const { ElementMenu, RowList, COPY_FAILED } = await import("./InspectorPanel");
const { rowDisplay } = await import("./inspectorRows");
const { Popover } = await import("radix-ui");
const { Columns3, Frame, RectangleHorizontal, Type } = await import("lucide-react");

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const reset = () => { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; };
function run<P>(component: (props: P) => ReactNode, props: P): El[] {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
  const tree = all(component(props));
  for (const pending of hooks.pending.splice(0)) pending();
  return tree;
}
// A fake node per element the component hands its ref callbacks.
function mount(tree: El[]): Map<El, { focus: ReturnType<typeof vi.fn> }> {
  const nodes = new Map<El, { focus: ReturnType<typeof vi.fn> }>();
  for (const element of tree) if (typeof element.props.ref === "function") { const node = { focus: vi.fn() }; nodes.set(element, node); (element.props.ref as (node: unknown) => void)(node); }
  return nodes;
}
const key = (key: string, over: Partial<{ metaKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...over, preventDefault: vi.fn(), stopPropagation: vi.fn() });

beforeEach(() => {
  reset();
  vi.stubGlobal("document", { activeElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), execCommand: vi.fn(() => false) });
});
afterEach(() => vi.unstubAllGlobals());

describe("the element menu", () => {
  const VIEW: SelectionView = { tag: "button", frame: { id: "pay", title: "Payment" }, element: { selector: "#pay", doanId: "pay-button", html: "<button>" }, path: [] };
  const rect = (y: number) => ({ x: 0, y, width: 100, height: 20 });
  const NODES: ElementTreeNode[] = [
    { depth: 0, name: "Payment", kind: "frame", anchor: { selector: "section", frame: "pay" }, rect: rect(0) },
    { depth: 1, name: "order-total", kind: "flex-row", anchor: { selector: "#total", doanId: "order-total" }, rect: rect(40) },
    { depth: 2, name: "span “Order total”", kind: "text", anchor: { selector: "#total > span" }, rect: rect(44) },
    { depth: 1, name: "pay-button", kind: "button", anchor: { selector: "#pay", doanId: "pay-button" }, rect: rect(600), selected: true },
  ];
  const source = () => ({ request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() });
  const items = (tree: El[]) => tree.filter(element => element.props.role === "treeitem");
  const open = (tree: El[]) => (tree.find(element => element.type === Popover.Root)!.props.onOpenChange as (open: boolean) => void)(true);

  test("the trigger names the selection by the tree's name and opens the innermost frame's tree, asking for it again", () => {
    const tree = source();
    const props = { view: VIEW, nodes: NODES, tree };
    let rendered = run(ElementMenu, props);
    const trigger = rendered.find(element => element.type === "button")!;
    expect(trigger.props["aria-haspopup"]).toBe("tree");
    expect(trigger.props["aria-label"]).toBe("pay-button, element. Elements in this frame");
    tree.request.mockClear();
    open(rendered);
    rendered = run(ElementMenu, props);
    expect(tree.request).toHaveBeenCalledTimes(1);
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(true);
    const list = rendered.find(element => element.props.role === "tree")!;
    expect(list.props["aria-label"]).toBe("Elements in Payment");
    const content = rendered.find(element => element.type === Popover.Content)!;
    expect(content.props).toMatchObject({ side: "bottom", align: "start", sideOffset: 4, "data-ui-variant": "tree" });
    // Radix's own Esc closes it, preventing the default so the selection is not stepped back.
    expect(content.props.onEscapeKeyDown).toBeUndefined();
  });

  test("rows: depth, guides, kind icons, names, the selection pressed and the one Tab stop", () => {
    const rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree: source() });
    const rows = items(rendered);
    expect(rows.map(row => row.props["aria-level"])).toEqual([1, 2, 3, 2]);
    expect(rows.map(row => row.props["aria-selected"])).toEqual([false, false, false, true]);
    expect(rows.map(row => row.props.tabIndex)).toEqual([-1, -1, -1, 0]);
    expect(rows.map(row => (row.props.style as Record<string, number>)["--depth"])).toEqual([0, 1, 2, 1]);
    const inner = (row: El) => all(row.props.children as ReactNode);
    expect(rows.map(row => inner(row).filter(element => element.props.className === "guide").length)).toEqual([0, 1, 2, 1]);
    expect(inner(rows[2]!).filter(element => element.props.className === "guide").map(element => (element.props.style as Record<string, number>)["--level"])).toEqual([0, 1]);
    expect(rows.map(row => inner(row).find(element => typeof element.type === "object")?.type)).toEqual([Frame, Columns3, Type, RectangleHorizontal]);
    expect(rows.map(row => inner(row).find(element => element.props.className === "name")?.props.children)).toEqual(["Payment", "order-total", "span “Order total”", "pay-button"]);
  });

  test("arrows, Home and End move focus; focus marks that node on the board, the selection's own row marks none", () => {
    const tree = source();
    const props = { view: VIEW, nodes: NODES, tree };
    let rendered = run(ElementMenu, props);
    const nodes = mount(rendered);
    const list = rendered.find(element => element.props.role === "tree")!;
    const down = key("ArrowDown");
    (list.props.onKeyDown as (event: unknown) => void)(key("Home"));
    expect(nodes.get(items(rendered)[0]!)!.focus).toHaveBeenCalled();
    rendered = run(ElementMenu, props);
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(down);
    expect(down.preventDefault).toHaveBeenCalled();
    rendered = run(ElementMenu, props);
    expect(items(rendered).map(row => row.props.tabIndex)).toEqual([-1, 0, -1, -1]);
    (items(rendered)[1]!.props.onFocus as () => void)();
    expect(tree.preview).toHaveBeenLastCalledWith(rect(40));
    (items(rendered)[3]!.props.onFocus as () => void)();
    expect(tree.preview).toHaveBeenLastCalledWith(null);
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(key("End"));
    rendered = run(ElementMenu, props);
    expect(items(rendered).map(row => row.props.tabIndex)).toEqual([-1, -1, -1, 0]);
    const tab = key("Tab");
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
  });

  test("Enter, Space or a press selects that node as a ⌘-click would and closes the menu; the selection's own row only closes", () => {
    const tree = source();
    const props = { view: VIEW, nodes: NODES, tree };
    let rendered = run(ElementMenu, props);
    open(rendered);
    rendered = run(ElementMenu, props);
    (items(rendered)[1]!.props.onFocus as () => void)();
    rendered = run(ElementMenu, props);
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(key("Enter"));
    expect(tree.select).toHaveBeenCalledWith({ selector: "#total", doanId: "order-total" });
    rendered = run(ElementMenu, props);
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(false);
    hooks.pending.splice(0).forEach(pending => pending());
    expect(tree.preview).toHaveBeenLastCalledWith(null);
    open(rendered);
    rendered = run(ElementMenu, props);
    (items(rendered)[0]!.props.onClick as () => void)();
    expect(tree.select).toHaveBeenLastCalledWith({ selector: "section", frame: "pay" });
    tree.select.mockClear();
    rendered = run(ElementMenu, props);
    (items(rendered)[3]!.props.onClick as () => void)();
    expect(tree.select).not.toHaveBeenCalled();
  });

  test("Esc is left to Radix: the list's own keys take nothing from it", () => {
    const tree = source();
    const rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree });
    const escape = key("Escape");
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(escape.stopPropagation).not.toHaveBeenCalled();
    expect(tree.select).not.toHaveBeenCalled();
  });

  test("before the canvas answers, the selection is the one row, named from the selection", () => {
    const rendered = run(ElementMenu, { view: VIEW, nodes: null, tree: source() });
    expect(items(rendered).map(row => row.props["aria-selected"])).toEqual([true]);
    expect(rendered.find(element => element.type === "button")!.props["aria-label"]).toBe("pay-button, element. Elements in this frame");
  });

  test("another selection closes an open menu", () => {
    const tree = source();
    let rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree });
    open(rendered);
    rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree });
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(true);
    run(ElementMenu, { view: { ...VIEW }, nodes: NODES, tree });
    rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree });
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(false);
  });
});

describe("the row list", () => {
  const VIEW = rowDisplay([
    { group: "box", label: "Padding", value: "24px", state: "token", token: "--space-6", sides: ["top", "right", "bottom", "left"].map(side => ({ side, value: "24px", token: "--space-6" })) },
    { group: "box", label: "Height", value: "52px", state: "hardcoded" },
    { group: "typography", label: "Size", value: "16px", state: "token", token: "--text-label" },
  ]);
  const buttons = (tree: El[]) => tree.filter(element => element.type === "button");

  test("↑/↓, Home and End move the one Tab stop; focus follows", () => {
    const props = { view: VIEW, busy: false, onNotice: vi.fn() };
    let rendered = run(RowList, props);
    const nodes = mount(rendered);
    expect(buttons(rendered).map(button => button.props.tabIndex)).toEqual([0, -1, -1]);
    const down = key("ArrowDown");
    (buttons(rendered)[0]!.props.onKeyDown as (event: unknown) => void)(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(nodes.get(buttons(rendered)[1]!)!.focus).toHaveBeenCalled();
    rendered = run(RowList, props);
    expect(buttons(rendered).map(button => button.props.tabIndex)).toEqual([-1, 0, -1]);
    (buttons(rendered)[1]!.props.onKeyDown as (event: unknown) => void)(key("End"));
    rendered = run(RowList, props);
    expect(buttons(rendered).map(button => button.props.tabIndex)).toEqual([-1, -1, 0]);
    (buttons(rendered)[2]!.props.onKeyDown as (event: unknown) => void)(key("Home"));
    rendered = run(RowList, props);
    expect(buttons(rendered).map(button => button.props.tabIndex)).toEqual([0, -1, -1]);
  });

  test("Enter, Space, ⌘C and a press copy what the row shows, and the shared toast says so", () => {
    const onNotice = vi.fn();
    const copied: string[] = [];
    vi.stubGlobal("document", {
      activeElement: null,
      addEventListener: (_type: string, listener: (event: unknown) => void) => { (globalThis as unknown as { copyListener: typeof listener }).copyListener = listener; },
      removeEventListener: vi.fn(),
      execCommand: vi.fn(() => { (globalThis as unknown as { copyListener: (event: unknown) => void }).copyListener({ clipboardData: { setData: (_type: string, text: string) => copied.push(text) }, preventDefault: vi.fn() }); return true; }),
    });
    const rendered = run(RowList, { view: VIEW, busy: false, onNotice });
    const [padding, height] = buttons(rendered);
    for (const pressed of [key("Enter"), key(" "), key("c", { metaKey: true })]) {
      (padding!.props.onKeyDown as (event: unknown) => void)(pressed);
      expect(pressed.preventDefault).toHaveBeenCalled();
    }
    (height!.props.onClick as () => void)();
    expect(copied).toEqual(["--space-6", "--space-6", "--space-6", "52px"]);
    expect(onNotice.mock.calls.map(call => call[0])).toEqual(["Copied --space-6", "Copied --space-6", "Copied --space-6", "Copied 52px"]);
    // A plain c is a key like any other.
    const plain = key("c");
    (padding!.props.onKeyDown as (event: unknown) => void)(plain);
    expect(plain.preventDefault).not.toHaveBeenCalled();
  });

  test("a copy that fails says so", () => {
    const onNotice = vi.fn();
    const rendered = run(RowList, { view: VIEW, busy: false, onNotice });
    (buttons(rendered)[1]!.props.onClick as () => void)();
    expect(onNotice).toHaveBeenCalledWith(COPY_FAILED);
  });

  test("Esc is not the list's: it reaches the canvas page, which steps the selection back", () => {
    const rendered = run(RowList, { view: VIEW, busy: false, onNotice: vi.fn() });
    const escape = key("Escape");
    (buttons(rendered)[0]!.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });
});
