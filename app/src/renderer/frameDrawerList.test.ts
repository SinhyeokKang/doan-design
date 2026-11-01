import { describe, expect, it } from "vitest";
import { drawerKeyTarget, drawerTypeahead, focusedRowAfter } from "./frameDrawerList";

// buzz-canvas design §2 '프레임 서랍': the open list keeps its focused row by frame id across a reload.
const row = (key: string, name = key, current = false) => ({ key, name, current });

describe("focusedRowAfter", () => {
  it("keeps the focused row when a reload reorders the rows", () => {
    expect(focusedRowAfter([row("b"), row("a", "a", true)], "b")).toBe("b");
  });

  it("does not follow the viewed frame while the focused row is still listed", () => {
    expect(focusedRowAfter([row("a"), row("b", "b", true)], "a")).toBe("a");
  });

  it("falls back to the viewed row when the focused row is gone", () => {
    expect(focusedRowAfter([row("a"), row("c", "c", true)], "b")).toBe("c");
  });

  it("falls back to the first row when the focused row is gone and nothing is viewed", () => {
    expect(focusedRowAfter([row("a"), row("c")], "b")).toBe("a");
  });

  it("starts on the viewed row when nothing was focused yet", () => {
    expect(focusedRowAfter([row("a"), row("b", "b", true)], null)).toBe("b");
  });

  it("closes the list (null) when no row is left", () => {
    expect(focusedRowAfter([], "a")).toBeNull();
  });

  it("tells repeated ids apart by their row key", () => {
    expect(focusedRowAfter([row("dup"), row("dup#2")], "dup#2")).toBe("dup#2");
  });
});

describe("drawerKeyTarget", () => {
  const rows = [row("a"), row("b"), row("c")];
  it.each([
    ["ArrowDown", "b", "c"], ["ArrowDown", "c", "c"], ["ArrowUp", "b", "a"], ["ArrowUp", "a", "a"],
    ["Home", "c", "a"], ["End", "a", "c"],
  ])("%s from %s moves to %s", (key, from, to) => {
    expect(drawerKeyTarget(rows, from, key)).toBe(to);
  });

  it("ignores other keys", () => {
    expect(drawerKeyTarget(rows, "a", "x")).toBeNull();
    expect(drawerKeyTarget(rows, "a", "Enter")).toBeNull();
  });

  it("starts from the first row when the focused key is unknown", () => {
    expect(drawerKeyTarget(rows, "gone", "ArrowDown")).toBe("b");
  });

  it("has nothing to move to in an empty list", () => {
    expect(drawerKeyTarget([], null, "ArrowDown")).toBeNull();
  });
});

describe("drawerTypeahead", () => {
  const rows = [row("1", "Cart"), row("2", "Shipping"), row("3", "Payment"), row("4", "Payment error")];
  it("finds the next row whose name starts with the typed text", () => {
    expect(drawerTypeahead(rows, "1", "p")).toBe("3");
  });

  it("cycles through rows of a repeated letter", () => {
    expect(drawerTypeahead(rows, "3", "pp")).toBe("4");
  });

  it("refines the current match as more is typed", () => {
    expect(drawerTypeahead(rows, "3", "pay")).toBe("3");
  });

  it("is null when no name matches", () => {
    expect(drawerTypeahead(rows, "1", "z")).toBeNull();
  });
});
