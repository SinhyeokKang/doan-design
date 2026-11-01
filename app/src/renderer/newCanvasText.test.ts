import { expect, test } from "vitest";
import { newCanvasText } from "./newCanvasText";

test("names the project where a canvas arrived", () => {
  expect(newCanvasText("Acme")).toBe("New canvas in Acme");
});
