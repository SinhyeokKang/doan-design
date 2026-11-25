import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";

// Hooks as plain state: a name's tooltip opens only while the name is cut short, checked each time it would open, and inside a
// modal dialog it is portalled into that dialog.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    // No TooltipEscape host around these calls.
    useContext: () => null,
  };
});
const { NameTip, isCut } = await import("./NameTip");
const { Tooltip, TooltipContent, TooltipTrigger } = await import("./components/ui/tooltip");

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}

// A measured box: its own widths, its descendants, and the dialog it sits in.
const box = (scrollWidth: number, clientWidth: number, inner: object[] = [], dialog: object | null = null) =>
  ({ scrollWidth, clientWidth, querySelectorAll: () => inner, closest: (selector: string) => selector === "dialog" ? dialog : null });

test("a name is cut when it or a box inside it is wider than it shows", () => {
  expect(isCut(null)).toBe(false);
  expect(isCut(box(100, 100) as unknown as Element)).toBe(false);
  expect(isCut(box(140, 100) as unknown as Element)).toBe(true);
  expect(isCut(box(100, 100, [box(60, 60), box(180, 120)]) as unknown as Element)).toBe(true);
  // An SVG icon has no widths of its own.
  expect(isCut(box(100, 100, [{}]) as unknown as Element)).toBe(false);
});

function render(text = "onboarding-welcome-variants-with-motion") {
  hooks.cursor = 0; hooks.refCursor = 0;
  const tree = all(NameTip({ text, children: <span className="name">{text}</span> }) as El);
  return { root: tree.find(element => element.type === Tooltip)!, trigger: tree.find(element => element.type === TooltipTrigger)!, content: tree.find(element => element.type === TooltipContent)! };
}
const setNode = (node: object) => { (render().trigger.props.ref as { current: unknown }).current = node; };

test("the tooltip opens only while the name is cut, and shows the full name", () => {
  hooks.states = []; hooks.refs = [];
  expect(render().root.props.open).toBe(false);
  expect(render().trigger.props.asChild).toBe(true);
  setNode(box(100, 100));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  expect(render().root.props.open).toBe(false);
  setNode(box(300, 100));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  const open = render();
  expect(open.root.props.open).toBe(true);
  expect(open.content.props.children).toBe("onboarding-welcome-variants-with-motion");
  (open.root.props.onOpenChange as (open: boolean) => void)(false);
  expect(render().root.props.open).toBe(false);
});

// The window resized between hovers: a name that fits again opens nothing, though it was cut the last time.
test("a name that fits again does not reopen the tooltip", () => {
  hooks.states = []; hooks.refs = [];
  render();
  setNode(box(300, 100));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  (render().root.props.onOpenChange as (open: boolean) => void)(false);
  setNode(box(100, 100));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  expect(render().root.props.open).toBe(false);
});

// A modal dialog is in the top layer: a capsule portalled to the body would be drawn under it.
test("inside a modal dialog the capsule is portalled into that dialog", () => {
  hooks.states = []; hooks.refs = [];
  render();
  const dialog = { tagName: "DIALOG" };
  setNode(box(300, 100, [], dialog));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  expect(render().content.props.container).toBe(dialog);
  hooks.states = []; hooks.refs = [];
  render();
  setNode(box(300, 100));
  (render().root.props.onOpenChange as (open: boolean) => void)(true);
  expect(render().content.props.container).toBeUndefined();
});

test("the shared tooltip content passes its container to the portal", async () => {
  const { Tooltip: Primitive } = await import("radix-ui");
  const dialog = {} as Element;
  const portal = TooltipContent({ container: dialog, children: "x" }) as El;
  expect(portal.type).toBe(Primitive.Portal);
  expect(portal.props.container).toBe(dialog);
});
