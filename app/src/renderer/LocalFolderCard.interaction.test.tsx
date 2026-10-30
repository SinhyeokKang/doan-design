import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LocalFolderCard, type ProjectDrop } from "./Onboarding";

// Hooks run as plain state so the card's own drag handlers can be called (HomeComposerView.interaction.test.tsx).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[index]) : next; }]; },
}));
const windowListeners = new Map<string, () => void>();
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  windowListeners.clear();
  vi.stubGlobal("window", { doan: { droppedPath: (file: { name: string }) => file.name === "made" ? null : `/drop/${file.name}` }, addEventListener: (name: string, listener: () => void) => windowListeners.set(name, listener), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

function render(props: { busy?: boolean; drop: ProjectDrop }) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  const tree = LocalFolderCard({ busy: props.busy ?? false, choose: () => {}, drop: props.drop });
  for (const effect of hooks.effects) effect();
  return tree;
}
const html = (tree: ReactNode) => renderToStaticMarkup(<>{tree}</>);
function card(tree: ReactNode): Record<string, (event: unknown) => void> {
  const found = Children.toArray(tree).find(child => isValidElement(child));
  if (!isValidElement<Record<string, (event: unknown) => void>>(found)) throw new Error("no card");
  return found.props;
}
function drag(items: { name: string; directory: boolean }[] = [{ name: "app", directory: true }], types = ["Files"]) {
  return {
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    dataTransfer: { types, dropEffect: "copy", files: items.map(item => ({ name: item.name })), items: items.map(item => ({ kind: "file", webkitGetAsEntry: () => ({ isDirectory: item.directory }) })) },
  };
}
const drop = (over: Partial<ProjectDrop> = {}): ProjectDrop => ({ notice: null, allowed: () => true, started: vi.fn(), dropped: vi.fn(), ...over });

test("dragging files over the card draws the drop target with its status, and a new drag clears the last notice", () => {
  const props = drop();
  const handlers = card(render({ drop: props }));
  const enter = drag();
  handlers.onDragEnter!(enter);
  expect(enter.preventDefault).toHaveBeenCalled();
  expect(props.started).toHaveBeenCalledOnce();
  const shown = render({ drop: props });
  expect(html(shown)).toContain('<div class="drop-target"><span class="sr-only" role="status">Drop to add this folder</span></div>');
  const over = drag();
  card(shown).onDragOver!(over);
  expect(over.preventDefault).toHaveBeenCalled();
  expect(over.dataTransfer.dropEffect).toBe("copy");
  card(shown).onDragLeave!(drag());
  expect(html(render({ drop: props }))).not.toContain("drop-target");
});

test("while the step is busy a drag shows no target and the cursor says no drop", () => {
  const props = drop({ allowed: () => false });
  const handlers = card(render({ busy: true, drop: props }));
  handlers.onDragEnter!(drag());
  const over = drag();
  handlers.onDragOver!(over);
  expect(over.dataTransfer.dropEffect).toBe("none");
  expect(html(render({ busy: true, drop: props }))).not.toContain("drop-target");
  const dropped = drag();
  handlers.onDrop!(dropped);
  expect(dropped.preventDefault).toHaveBeenCalled();
  expect(props.dropped).not.toHaveBeenCalled();
});

test("a drop hands each item's folder flag and preload path on; a path-less item is ''", () => {
  const props = drop();
  const handlers = card(render({ drop: props }));
  handlers.onDragEnter!(drag());
  card(render({ drop: props })).onDrop!(drag([{ name: "app", directory: true }, { name: "made", directory: false }]));
  expect(props.dropped).toHaveBeenCalledWith([{ isDirectory: true, path: "/drop/app" }, { isDirectory: false, path: "" }]);
  expect(html(render({ drop: props }))).not.toContain("drop-target");
});

test("the target goes when the window loses focus, and a drag without files is not the card's", () => {
  const props = drop();
  const handlers = card(render({ drop: props }));
  handlers.onDragEnter!(drag());
  render({ drop: props });
  windowListeners.get("blur")?.();
  expect(html(render({ drop: props }))).not.toContain("drop-target");
  const text = drag([], ["text/plain"]);
  card(render({ drop: props })).onDragEnter!(text);
  expect(text.preventDefault).not.toHaveBeenCalled();
});
