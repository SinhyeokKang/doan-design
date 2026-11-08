import { expect, test } from "vitest";
import { displayPath } from "./projectDisplay";

test("home abbreviation respects path boundaries and leaves external paths alone", () => {
  expect(displayPath("/Users/alex/code/app", "/Users/alex")).toBe("~/code/app");
  expect(displayPath("/Users/alex", "/Users/alex")).toBe("~");
  expect(displayPath("/Users/alex-other/app", "/Users/alex")).toBe("/Users/alex-other/app");
  expect(displayPath("/Users/alex/app", null)).toBe("/Users/alex/app");
});
