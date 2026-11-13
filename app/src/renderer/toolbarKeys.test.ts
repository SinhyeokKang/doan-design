import { expect, it, vi } from "vitest";
import { moveBetweenTools } from "./toolbarKeys";

// ←/→ move focus along enabled buttons only: no wrap at either end, and any other key is left alone.
function press(key: string, buttons: string[], active: number) {
  const focused: string[] = [];
  const nodes = buttons.map(name => ({ name, focus: () => focused.push(name) }));
  const preventDefault = vi.fn();
  const selectors: string[] = [];
  const currentTarget = { querySelectorAll: (selector: string) => { selectors.push(selector); return nodes; } };
  vi.stubGlobal("document", { activeElement: nodes[active] });
  try { moveBetweenTools({ key, currentTarget, preventDefault } as never); } finally { vi.unstubAllGlobals(); }
  return { focused, preventDefault, selectors };
}

it("moves to the neighbouring enabled button and stops the key", () => {
  const right = press("ArrowRight", ["a", "b", "c"], 0);
  expect(right.focused).toEqual(["b"]);
  expect(right.preventDefault).toHaveBeenCalledOnce();
  expect(right.selectors).toEqual(["button:not(:disabled)"]);
  expect(press("ArrowLeft", ["a", "b", "c"], 2).focused).toEqual(["b"]);
});

it("does not wrap at either end", () => {
  const last = press("ArrowRight", ["a", "b"], 1);
  expect(last.focused).toEqual([]);
  expect(last.preventDefault).not.toHaveBeenCalled();
  expect(press("ArrowLeft", ["a", "b"], 0).focused).toEqual([]);
});

it("ignores other keys", () => {
  const other = press("Enter", ["a", "b"], 0);
  expect(other.focused).toEqual([]);
  expect(other.preventDefault).not.toHaveBeenCalled();
});
