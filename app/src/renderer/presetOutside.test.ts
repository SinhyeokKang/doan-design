import { expect, test } from "vitest";
import { outsidePresetList } from "./presetOutside";

// A stand-in for DOM nodes: each knows the nodes inside it.
const node = (...inside: object[]) => { const self = { contains: (other: unknown) => other === self || inside.includes(other as object) }; return self; };

// The field is the `/` list's trigger, so a press there keeps the list; chips, the tray and the rest of the card are
// outside.
test("a press in the / list or its field is inside; chips, tray, card and the rest of the page are outside", () => {
  const row = {}, text = {}, inlineChip = {};
  const list = node(row), field = node(text, inlineChip);
  expect(outsidePresetList(row, list, field)).toBe(false);
  expect(outsidePresetList(list, list, field)).toBe(false);
  expect(outsidePresetList(text, list, field)).toBe(false);
  expect(outsidePresetList(inlineChip, list, field)).toBe(false);
  expect(outsidePresetList(field, list, field)).toBe(false);
  for (const elsewhere of [{ chip: "attachment" }, { tray: true }, { card: true }, { sidebar: true }]) expect(outsidePresetList(elsewhere, list, field)).toBe(true);
});

test("an unmounted list or field does not keep a press inside; no target is not a press outside", () => {
  const text = {};
  expect(outsidePresetList(text, null, node(text))).toBe(false);
  expect(outsidePresetList({}, null, null)).toBe(true);
  expect(outsidePresetList(null, node(), node())).toBe(false);
});
