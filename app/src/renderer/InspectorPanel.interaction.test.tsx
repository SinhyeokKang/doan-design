import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ElementTreeNode } from "./canvasMessage";
import type { SelectionView } from "./selection";

// The element menu and the row list with hooks as plain state: no DOM, so rows are found in the returned element tree, their
// handlers called, and the component run again.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps?: unknown[] | undefined; cleanup?: () => void } | undefined)[], pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps?: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useEffect: effect, useLayoutEffect: effect,
    useId: () => ":hint:",
    useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useState: (value: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (previous: unknown) => unknown)(hooks.states[index]) : next; }];
    },
  };
});
const { ElementMenu, RowList, InspectorPanel, COPY_FAILED } = await import("./InspectorPanel");
const { TooltipContent } = await import("./components/ui/tooltip");
const { rowDisplay } = await import("./inspectorRows");
const { Popover } = await import("radix-ui");
const { toolShortcut } = await import("./canvasTool");
const { drawn, keydownOn } = await import("./drawnTarget.test-support");
const { Columns3, Frame, RectangleHorizontal, Type } = await import("lucide-react");

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
// The component leaves the page: React runs every effect's cleanup.
const unmount = () => { for (const slot of hooks.effects) slot?.cleanup?.(); hooks.effects = []; };
const reset = () => { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; };
function run<P>(component: (props: P) => ReactNode, props: P, attach?: (tree: El[]) => void): El[] {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
  const tree = all(component(props));
  attach?.(tree);
  for (const pending of hooks.pending.splice(0)) pending();
  return tree;
}
// A fake node per element the component hands its ref callbacks.
function mount(tree: El[]): Map<El, { focus: ReturnType<typeof vi.fn> }> {
  const nodes = new Map<El, { focus: ReturnType<typeof vi.fn> }>();
  for (const element of tree) if (typeof element.props.ref === "function") { const node = { focus: vi.fn() }; nodes.set(element, node); (element.props.ref as (node: unknown) => void)(node); }
  return nodes;
}
const noop = () => {};
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
    const props = { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop };
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

  // PRODUCT §5 item 2 'Canvas header': an open menu keeps every printable key, so V, H and Space from a row never
  // reach the canvas tools.
  test("V, H and Space pressed on an open menu's row never switch the canvas tool", () => {
    const rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree: source() });
    const row = drawn([rendered.find(element => element.type === Popover.Content)!, rendered.find(element => element.props.role === "tree")!, items(rendered)[1]!].map(element => element.props));
    for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(keydownOn(code, row), { canvasPage: true }), code).toBeNull();
  });

  test("rows: depth, guides, kind icons, names, the selection pressed and the one Tab stop", () => {
    const rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree: source() });
    const rows = items(rendered);
    expect(rows.map(row => row.props["aria-level"])).toEqual([1, 2, 3, 2]);
    expect(rows.map(row => row.props["aria-selected"])).toEqual([false, false, false, true]);
    expect(rows.map(row => row.props.tabIndex)).toEqual([-1, -1, -1, 0]);
    expect(rows.map(row => (row.props.style as Record<string, number>)["--tree-depth"])).toEqual([0, 1, 2, 1]);
    const inner = (row: El) => all(row.props.children as ReactNode);
    expect(rows.map(row => inner(row).filter(element => element.props.className === "guide").length)).toEqual([0, 1, 2, 1]);
    expect(inner(rows[2]!).filter(element => element.props.className === "guide").map(element => (element.props.style as Record<string, number>)["--tree-level"])).toEqual([0, 1]);
    expect(rows.map(row => inner(row).find(element => typeof element.type === "object")?.type)).toEqual([Frame, Columns3, Type, RectangleHorizontal]);
    expect(rows.map(row => inner(row).find(element => element.props.className === "name")?.props.children)).toEqual(["Payment", "order-total", "span “Order total”", "pay-button"]);
  });

  test("opening reveals the selected name, and Home and End follow the focused row horizontally", () => {
    const props = { view: VIEW, nodes: NODES.map(node => node.selected ? { ...node, depth: 12 } : node), tree: source(), shown: true, onEscape: noop };
    const rendered = run(ElementMenu, props);
    const menu = { clientWidth: 260, scrollLeft: 0 };
    const content = rendered.find(element => element.type === Popover.Content)!;
    (content.props.ref as { current: unknown }).current = menu;
    for (const row of items(rendered)) {
      (row.props.ref as (node: unknown) => void)({ focus: vi.fn(), querySelector: () => ({ offsetWidth: 80 }) });
    }
    (content.props.onOpenAutoFocus as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(menu.scrollLeft).toBeGreaterThan(0);
    const keydown = rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void;
    keydown(key("Home"));
    expect(menu.scrollLeft).toBe(0);
    keydown(key("End"));
    expect(menu.scrollLeft).toBeGreaterThan(0);
  });

  test("ArrowDown reveals the next row's name after a one-level increase in depth", () => {
    const nodes: ElementTreeNode[] = Array.from({ length: 7 }, (_, depth) => ({
      ...NODES[depth ? 1 : 0]!, depth, anchor: { selector: `#level-${depth}` }, ...(depth === 5 && { selected: true }),
    }));
    const rendered = run(ElementMenu, { view: VIEW, nodes, tree: source(), shown: true, onEscape: noop });
    const menu = { clientWidth: 224, scrollLeft: 0 };
    const content = rendered.find(element => element.type === Popover.Content)!;
    (content.props.ref as { current: unknown }).current = menu;
    for (const row of items(rendered)) (row.props.ref as (node: unknown) => void)({
      focus: vi.fn(), querySelector: () => ({ offsetWidth: 64 }),
    });
    (content.props.onOpenAutoFocus as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(menu.scrollLeft).toBe(0);
    const keydown = rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void;
    keydown(key("ArrowDown"));
    expect(menu.scrollLeft).toBe(40);
  });

  test("an initial tree reply replaces the focused fallback with the selected deep row", () => {
    const props = { view: VIEW, tree: source(), shown: true, onEscape: noop };
    const menu = { clientWidth: 260, scrollLeft: 0 };
    const focus = vi.fn();
    const attach = (tree: El[]) => {
      const content = tree.find(element => element.type === Popover.Content)!;
      (content.props.ref as { current: unknown }).current = menu;
      for (const row of items(tree)) (row.props.ref as (node: unknown) => void)({
        focus: row.props["aria-selected"] ? focus : vi.fn(), querySelector: () => ({ offsetWidth: 80 }),
      });
    };
    open(run(ElementMenu, { ...props, nodes: null }));
    const fallback = run(ElementMenu, { ...props, nodes: null }, attach);
    (fallback.find(element => element.type === Popover.Content)!.props.onOpenAutoFocus as (event: unknown) => void)({ preventDefault: vi.fn() });
    focus.mockClear();
    const body = {};
    Object.assign(document, { body, activeElement: body });
    run(ElementMenu, { ...props, nodes: NODES.map(node => node.selected ? { ...node, depth: 12 } : node) }, attach);
    expect(focus).toHaveBeenCalledOnce();
    expect(menu.scrollLeft).toBeGreaterThan(0);
  });

  test("arrows, Home and End move focus; focus marks that node on the board, the selection's own row marks none", () => {
    const tree = source();
    const props = { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop };
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
    const props = { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop };
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
    const rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree });
    const escape = key("Escape");
    (rendered.find(element => element.props.role === "tree")!.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(escape.stopPropagation).not.toHaveBeenCalled();
    expect(tree.select).not.toHaveBeenCalled();
  });

  test("before the canvas answers, the selection is the one row, named from the selection", () => {
    const rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: null, tree: source() });
    expect(items(rendered).map(row => row.props["aria-selected"])).toEqual([true]);
    expect(rendered.find(element => element.type === "button")!.props["aria-label"]).toBe("pay-button, element. Elements in this frame");
  });

  test("another selection closes an open menu", () => {
    const tree = source();
    let rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree });
    open(rendered);
    rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree });
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(true);
    run(ElementMenu, { shown: true, onEscape: noop, view: { ...VIEW }, nodes: NODES, tree });
    rendered = run(ElementMenu, { shown: true, onEscape: noop, view: VIEW, nodes: NODES, tree });
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
    const props = { view: VIEW, busy: false, onNotice: vi.fn(), onEscape: noop };
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
    const rendered = run(RowList, { view: VIEW, busy: false, onEscape: noop, onNotice });
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
    const rendered = run(RowList, { view: VIEW, busy: false, onEscape: noop, onNotice });
    (buttons(rendered)[1]!.props.onClick as () => void)();
    expect(onNotice).toHaveBeenCalledWith(COPY_FAILED);
  });

  test("Esc is not the list's: it reaches the canvas page, which steps the selection back", () => {
    const rendered = run(RowList, { view: VIEW, busy: false, onEscape: noop, onNotice: vi.fn() });
    const escape = key("Escape");
    (buttons(rendered)[0]!.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });
});

// Function components the trees above leave unexpanded (the row tooltips, the cut-name tooltip, the head's icon
// tooltip), run once to read the tooltip content they draw.
function expanded(tree: El[], name: string): El[] {
  return tree.filter(element => typeof element.type === "function" && (element.type as { name: string }).name === name)
    .flatMap(element => all((element.type as (props: unknown) => ReactNode)(element.props)));
}

// POSTMORTEM 2026-11-07: an open tooltip's Radix layer takes the Escape first and prevents it, so every tooltip in the inspector
// hands it to the canvas page (CanvasController.toolbarEscape).
describe("Esc over an open tooltip in the inspector", () => {
  const VIEW: SelectionView = { tag: "button", frame: { id: "pay", title: "Payment" }, element: { selector: "#pay", doanId: "pay-button", html: "<button>" }, path: [] };
  const tree = () => ({ request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() });

  test("a row's tooltip hands its Escape to the canvas page", () => {
    const onEscape = vi.fn();
    const rows = rowDisplay([{ group: "box", label: "Padding", value: "24px", state: "token", token: "--space-6", sides: ["top", "right", "bottom", "left"].map(side => ({ side, value: "24px", token: "--space-6" })) }]);
    const contents = expanded(run(RowList, { view: rows, busy: false, onNotice: vi.fn(), onEscape }), "RowTip").filter(element => element.type === TooltipContent);
    expect(contents).toHaveLength(1);
    expect(contents[0]!.props.onEscapeKeyDown).toBe(onEscape);
  });

  test("the head's cut-name and Hide inspector tooltips hand theirs on too", () => {
    const onEscape = vi.fn();
    const menu = expanded(run(ElementMenu, { view: VIEW, nodes: null, tree: tree(), shown: true, onEscape }), "NameTip").filter(element => element.type === TooltipContent);
    expect(menu.map(element => element.props.onEscapeKeyDown)).toEqual([onEscape]);
    reset();
    const panel = run(InspectorPanel, { shown: true, onHide: vi.fn(), selection: null, document: null, inspect: vi.fn(), tree: tree(), onNotice: vi.fn(), onEscape });
    const hide = expanded(panel, "IconTip").filter(element => element.type === TooltipContent);
    expect(hide.map(element => element.props.onEscapeKeyDown)).toEqual([onEscape]);
  });
});

// With the element menu open, Esc closes only the menu; a cut name's tooltip opened over the trigger is the top layer, so it
// must not hand the Escape to the canvas page then.
test("the cut name's tooltip keeps its Escape to itself while the menu is open", () => {
  const onEscape = vi.fn();
  const VIEW: SelectionView = { tag: "button", element: { selector: "#pay", html: "<button>" }, path: [] };
  const tree = { request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() };
  const props = { view: VIEW, nodes: null, tree, shown: true, onEscape };
  let rendered = run(ElementMenu, props);
  (rendered.find(element => element.type === Popover.Root)!.props.onOpenChange as (open: boolean) => void)(true);
  rendered = run(ElementMenu, props);
  const tips = expanded(rendered, "NameTip").filter(element => element.type === TooltipContent);
  expect(tips).toHaveLength(1);
  // Its Escape closes the menu, as the menu's own would, and is not handed to the canvas page.
  (tips[0]!.props.onEscapeKeyDown as (event: unknown) => void)({ key: "Escape" });
  expect(onEscape).not.toHaveBeenCalled();
  rendered = run(ElementMenu, props);
  expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(false);
});

// The menu spans the panel less 8px on each side (263 in a 280 column with its 1px start edge), not its content's width.
test("the element menu is as wide as the panel's inside less 8px a side", async () => {
  const VIEW: SelectionView = { tag: "button", element: { selector: "#pay", html: "<button>" }, path: [] };
  const tree = { request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() };
  const props = { view: VIEW, nodes: null, tree, shown: true, onEscape: noop };
  let rendered = run(ElementMenu, props);
  const trigger = rendered.find(element => element.type === "button")!;
  (trigger.props.ref as { current: unknown }).current = { closest: (selector: string) => selector === ".doan-insp-panel" ? { clientWidth: 279 } : null };
  (rendered.find(element => element.type === Popover.Root)!.props.onOpenChange as (open: boolean) => void)(true);
  rendered = run(ElementMenu, props);
  expect((rendered.find(element => element.type === Popover.Content)!.props.style as Record<string, unknown>)["--doan-insp-panel-width"]).toBe("279px");
  const css = (await import("node:fs")).readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".doan-floating.doan-insp-menu { width: calc(var(--doan-insp-panel-width) - 2 * var(--space-2)); max-width: none; }");
});

describe("the element menu leaves no trace", () => {
  const VIEW: SelectionView = { tag: "button", element: { selector: "#pay", html: "<button>" }, path: [] };
  const NODES: ElementTreeNode[] = [
    { depth: 0, name: "Payment", kind: "frame", anchor: { selector: "section", frame: "pay" }, rect: { x: 0, y: 0, width: 10, height: 10 } },
    { depth: 1, name: "pay", kind: "button", anchor: { selector: "#pay" }, rect: { x: 0, y: 20, width: 10, height: 10 }, selected: true },
  ];

  // The menu goes with its trigger when the selection clears under it (a press on the board's margin, which the app's document
  // never sees, so Radix does not close it first).
  test("unmounting while a row is marked takes the mark off the board", () => {
    const tree = { request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() };
    const props = { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop };
    let rendered = run(ElementMenu, props);
    (rendered.find(element => element.type === Popover.Root)!.props.onOpenChange as (open: boolean) => void)(true);
    rendered = run(ElementMenu, props);
    (rendered.filter(element => element.props.role === "treeitem")[0]!.props.onFocus as () => void)();
    expect(tree.preview).toHaveBeenLastCalledWith(NODES[0]!.rect);
    unmount();
    expect(tree.preview).toHaveBeenLastCalledWith(null);
  });

  test("an inspector that stops showing (folded, or a window too narrow) closes its menu", () => {
    const tree = { request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() };
    let rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop });
    (rendered.find(element => element.type === Popover.Root)!.props.onOpenChange as (open: boolean) => void)(true);
    rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree, shown: false, onEscape: noop });
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(false);
    rendered = run(ElementMenu, { view: VIEW, nodes: NODES, tree, shown: true, onEscape: noop });
    expect(rendered.find(element => element.type === Popover.Root)!.props.open).toBe(false);
  });
});

// POSTMORTEM 2026-11-17 and 2026-11-13: focus in the inspector never falls to the page. A succeeded Retry hands it to the rows'
// Tab stop; a row or Retry that goes hands it to the head's trigger, else the board area.
describe("focus that was in the inspector", () => {
  const SELECTION = { canvas: { root: "/repo", path: "a.html" }, view: { tag: "button", element: { selector: "#pay", html: "<button>" }, path: [] } as SelectionView };
  const tree = () => ({ request: vi.fn(() => true), subscribe: vi.fn(() => () => {}), preview: vi.fn(), select: vi.fn() });
  const fake = (inside: string | null = null) => ({ isConnected: true, focus: vi.fn(), closest: (selector: string) => inside !== null && selector.includes(inside) ? {} : null });
  function setup(nodes: { row?: unknown; trigger?: unknown; area?: unknown }) {
    const body = {};
    const doc = { activeElement: null as unknown, body, querySelector: (selector: string) => selector.includes(".area") ? nodes.area ?? null : null, querySelectorAll: () => [], hasFocus: () => true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("document", doc);
    const aside = { querySelector: (selector: string) => selector.includes("doan-insp-row") ? nodes.row ?? null : selector.includes("ov-title") ? nodes.trigger ?? null : null };
    return { doc, body, aside };
  }
  const render = (aside: unknown, props: Partial<Parameters<typeof InspectorPanel>[0]> = {}) => {
    const tree_ = run(InspectorPanel, { shown: true, onHide: vi.fn(), selection: SELECTION, document: "d", inspect: () => new Promise(() => {}), tree: tree(), onNotice: vi.fn(), onEscape: noop, ...props });
    const panel = tree_.find(element => element.type === "aside")!;
    (panel.props.ref as { current: unknown }).current = aside;
    return panel;
  };
  const lose = (panel: El, target: { isConnected: boolean }, doc: { activeElement: unknown; body: unknown }) => {
    (panel.props.onFocus as (event: unknown) => void)({ target });
    target.isConnected = false;
    doc.activeElement = doc.body;
  };

  test("a Retry that succeeds hands focus to the rows' Tab stop", () => {
    const row = fake(), trigger = fake();
    const { doc, aside } = setup({ row, trigger });
    const panel = render(aside);
    lose(panel, fake(".doan-insp-failed"), doc);
    render(aside);
    expect(row.focus).toHaveBeenCalled();
    expect(trigger.focus).not.toHaveBeenCalled();
  });

  test("a focused row that goes while a selection stays hands focus to the head's trigger", () => {
    const row = fake(), trigger = fake();
    const { doc, aside } = setup({ row, trigger });
    const panel = render(aside);
    lose(panel, fake(".doan-insp-row"), doc);
    render(aside);
    expect(trigger.focus).toHaveBeenCalled();
    expect(row.focus).not.toHaveBeenCalled();
  });

  test("with no selection left it goes to the board area", () => {
    const area = fake();
    const { doc, aside } = setup({ area });
    const panel = render(aside);
    lose(panel, fake(".doan-insp-row"), doc);
    render(aside, { selection: null });
    expect(area.focus).toHaveBeenCalled();
  });

  test("a recovery made with the window in the background is made again when the window activates", () => {
    // POSTMORTEM 2026-11-17: activation restores focus to the row that went, and with it gone to Hide sidebar.
    const area = fake();
    const { doc, aside } = setup({ area });
    doc.hasFocus = () => false;
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.useFakeTimers();
    try {
      const panel = render(aside);
      lose(panel, fake(".doan-insp-row"), doc);
      render(aside, { selection: null });
      expect(area.focus).toHaveBeenCalledTimes(1);
      win.dispatchEvent(new Event("focus"));
      vi.runAllTimers();
      expect(area.focus).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  test("focus that moved on to another control is left where it is", () => {
    const row = fake(), trigger = fake(), area = fake();
    const { doc, aside } = setup({ row, trigger, area });
    const panel = render(aside);
    const target = fake(".doan-insp-row");
    (panel.props.onFocus as (event: unknown) => void)({ target });
    (panel.props.onBlur as (event: unknown) => void)({ relatedTarget: fake() });
    target.isConnected = false;
    doc.activeElement = doc.body;
    render(aside);
    for (const node of [row, trigger, area]) expect(node.focus).not.toHaveBeenCalled();
  });
});
