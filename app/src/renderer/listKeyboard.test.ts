import { describe, expect, test } from "vitest";
import { focusAfterLeave, listKeyTarget } from "./listKeyboard";

// Non-openable rows are ordinary keys here: they take focus so their reason can be read.
const keys = ["a", "gone", "c"];

describe("listKeyTarget", () => {
  test("arrows move one row and stop at the ends", () => {
    expect(listKeyTarget(keys, "a", "ArrowDown")).toBe("gone");
    expect(listKeyTarget(keys, "gone", "ArrowDown")).toBe("c");
    expect(listKeyTarget(keys, "c", "ArrowDown")).toBe("c");
    expect(listKeyTarget(keys, "gone", "ArrowUp")).toBe("a");
    expect(listKeyTarget(keys, "a", "ArrowUp")).toBe("a");
  });

  test("Home and End go to the first and last rows", () => {
    expect(listKeyTarget(keys, "gone", "Home")).toBe("a");
    expect(listKeyTarget(keys, "gone", "End")).toBe("c");
  });

  test("a focused key no longer listed starts from the first row", () => {
    expect(listKeyTarget(keys, "missing", "ArrowDown")).toBe("a");
    expect(listKeyTarget(keys, null, "End")).toBe("c");
  });

  test("other keys and an empty list move nothing", () => {
    expect(listKeyTarget(keys, "a", "Enter")).toBeNull();
    expect(listKeyTarget([], null, "ArrowDown")).toBeNull();
  });
});

describe("focusAfterLeave", () => {
  test("the focused row still listed keeps focus", () => {
    expect(focusAfterLeave(keys, ["c", "a", "gone"], "a")).toEqual({ kind: "row", key: "a" });
  });

  test("a focused row that left moves focus to the next row of the previous order still listed", () => {
    expect(focusAfterLeave(keys, ["a", "c"], "gone")).toEqual({ kind: "row", key: "c" });
  });

  test("without a next row, the previous one", () => {
    expect(focusAfterLeave(keys, ["a", "gone"], "c")).toEqual({ kind: "row", key: "gone" });
  });

  test("an emptied list sends focus to the panel title", () => {
    expect(focusAfterLeave(keys, [], "a")).toEqual({ kind: "title" });
  });
});
