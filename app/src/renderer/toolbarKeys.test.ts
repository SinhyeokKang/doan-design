import { expect, it, vi } from "vitest";
import { moveBetweenTools } from "./toolbarKeys";

function press(key: string, buttons: string[], active: number | object) {
  const focused: string[] = [];
  const nodes = buttons.map(name => ({ name, focus: () => focused.push(name) }));
  const preventDefault = vi.fn();
  const selectors: string[] = [];
  const currentTarget = { querySelectorAll: (selector: string) => { selectors.push(selector); return nodes; } };
  vi.stubGlobal("document", { activeElement: typeof active === "number" ? nodes[active] : active });
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

// React carries a portal's keys to the toolbar too: an arrow in the Play drawer's list (rendered in a portal under the
// toolbar's Play) must stay the list's, not move focus to a tool.
it("leaves an arrow from outside its own buttons alone", () => {
  for (const key of ["ArrowRight", "ArrowLeft"]) {
    const fromRow = press(key, ["a", "b", "c"], { name: "drawer row" });
    expect(fromRow.focused, key).toEqual([]);
    expect(fromRow.preventDefault, key).not.toHaveBeenCalled();
  }
});
