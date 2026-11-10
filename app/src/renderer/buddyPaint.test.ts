import { expect, test } from "vitest";
import { applyBuddy, firstPaintBuddy } from "./buddyPaint";

test("the first paint reads the buddy main put in the window's query; anything else is Doany", () => {
  expect(firstPaintBuddy("?buddy=popo")).toBe("popo");
  expect(firstPaintBuddy("?x=1&buddy=dori")).toBe("dori");
  for (const search of ["", "?", "?buddy=", "?buddy=nemo", "?buddy=Popo", "?other=puri"]) expect(firstPaintBuddy(search), search).toBe("doany");
});

test("a friend sets data-buddy on the root; Doany has no attribute", () => {
  const attributes = new Map<string, string>();
  const root = { setAttribute: (name: string, value: string) => void attributes.set(name, value), removeAttribute: (name: string) => void attributes.delete(name) };
  applyBuddy(root, "puri");
  expect(attributes.get("data-buddy")).toBe("puri");
  applyBuddy(root, "dori");
  expect(attributes.get("data-buddy")).toBe("dori");
  applyBuddy(root, "doany");
  expect(attributes.has("data-buddy")).toBe(false);
});
