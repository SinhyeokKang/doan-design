import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PresetsButton } from "./ComposerParts";
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, layouts: [] as (() => void)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useLayoutEffect: (effect: () => void) => hooks.layouts.push(effect),
  useRef: (value: unknown) => { const i = hooks.refCursor++; return hooks.refs[i] ??= { current: value }; },
  useState: (value: unknown) => { const i = hooks.cursor++; if (!(i in hooks.states)) hooks.states[i] = value; return [hooks.states[i], (next: unknown) => { hooks.states[i] = next; }]; },
}));
beforeEach(() => { hooks.states = []; hooks.refs = []; vi.stubGlobal("HTMLElement", class {}); vi.stubGlobal("document", { activeElement: null, body: null }); });
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
test.each([true, false])("a vanished tab persists its fallback and moves focus only from its removed content (%s)", inTab => {
  const props = { reply: { v: 1 as const, ok: true as const, result: { version: "1", presets: [{ id: "polish", title: "Polish", group: "refine", description: "Polish", scope: "canvas" }] } }, skills: [{ name: "deploy", description: "Deploy" }], project: "Project", suggested: [], listId: "skills", disabled: false, onOpen: vi.fn(), onChoose: vi.fn(), onRetry: vi.fn(), onPicked: vi.fn() };
  const render = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.layouts = []; return elements(PresetsButton(props)); };
  let tree = render();
  (tree.find(p => "onOpenChange" in p)!.onOpenChange as (open: boolean) => void)(true);
  tree = render();
  (tree.find(p => p["data-group"] === "project")!.onClick as () => void)();
  const focus = vi.fn();
  hooks.refs[1]!.current = { querySelector: () => ({ focus }) };
  const focused = { isConnected: false, closest: () => inTab ? {} : null };
  (tree.find(p => p.className === "doan-floating preset-popover has-skills")!.onFocusCapture as (e: unknown) => void)({ target: focused });
  if (!inTab) vi.stubGlobal("document", { activeElement: {}, body: null });
  props.skills = [];
  render(); hooks.layouts.forEach(effect => effect());
  expect(focus).toHaveBeenCalledTimes(inTab ? 1 : 0);
  props.skills = [{ name: "deploy", description: "Deploy" }];
  tree = render();
  expect(tree.find(p => p["data-group"] === "project")!["aria-selected"]).toBe(false);
  expect(tree.find(p => p["data-group"] === "refine")!["aria-selected"]).toBe(true);
});
