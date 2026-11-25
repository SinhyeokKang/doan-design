import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";

// The code block reads its copy callback from context; a plain stub lets its handlers run without a DOM.
const actions = vi.hoisted(() => ({ copy: vi.fn(), openLink: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useContext: () => actions }));
const { CodeBlock } = await import("./ConversationThread");

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...[node.props.children].flat().flatMap(child => all(child as ReactNode))];
}

// A real mouse press on Copy code took focus off the composer through the button's mousedown, ending its selection and
// IME composition; a DOM click() does not.
test("Copy code keeps focus where it is on a pointer press and still copies on click", () => {
  const node = { type: "element", children: [{ type: "text", value: "$ doan check\n" }] };
  const button = all(CodeBlock({ node, children: null })).find(element => element.type === "button")!;
  expect(button.props["aria-label"]).toBe("Copy code");
  const press = { preventDefault: vi.fn() };
  (button.props.onMouseDown as (event: typeof press) => void)(press);
  expect(press.preventDefault).toHaveBeenCalledOnce();
  (button.props.onClick as () => void)();
  // The second argument is the reply the block sits in, where a failed copy says so.
  expect(actions.copy.mock.calls[0]?.[0]).toBe("$ doan check");
});
