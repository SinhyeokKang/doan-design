import { describe, expect, it } from "vitest";
import { drawerKey, drawerKeyTarget, drawerOrder, drawerTypeahead, focusedRowAfter, groupDrawer, UNLINKED_GROUP, type DrawerFrame } from "./frameDrawerList";

// The open list keeps its focused row by frame id across a reload.
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

// Linked groups come first, by their first frame's document order, then unlinked frames in document order.
describe("groupDrawer", () => {
  const f = (id: string, number: number, name = id, current = false): DrawerFrame => ({ key: id, id, number, name, current, mark: "390x844" });
  const frames = [f("home", 1, "Home"), f("cart", 2, "Cart"), f("checkout", 3, "Checkout", true), f("account", 4, "Account"), f("done", 5, "Order confirmation"), f("welcome", 7, "Welcome"), f("signup", 8, "Sign up"), f("settings", 9, "Settings")];
  const gotos = [
    { value: "signup", frames: ["welcome"] },
    { value: "checkout", frames: ["cart"] },
    { value: "done", frames: ["checkout"] },
    { value: "ghost", frames: ["home"] },
  ];

  it("puts linked groups first by their first frame, then the frames without links in one group", () => {
    const groups = groupDrawer(frames, gotos);
    expect(groups.map(group => [group.label, group.rows.map(row => row.id)])).toEqual([
      ["Cart and 2 more", ["cart", "checkout", "done"]],
      ["Welcome and 1 more", ["welcome", "signup"]],
      [UNLINKED_GROUP, ["home", "account", "settings"]],
    ]);
    expect(UNLINKED_GROUP).toBe("Frames without links");
  });

  it("keeps each row's canvas number, name and current mark, and numbers the groups in visual order", () => {
    const rows = drawerOrder(groupDrawer(frames, gotos));
    expect(rows.map(row => [row.key, row.number, row.name, row.current, row.group])).toEqual([
      ["cart", 2, "Cart", false, 0], ["checkout", 3, "Checkout", true, 0], ["done", 5, "Order confirmation", false, 0],
      ["welcome", 7, "Welcome", false, 1], ["signup", 8, "Sign up", false, 1],
      ["home", 1, "Home", false, 2], ["account", 4, "Account", false, 2], ["settings", 9, "Settings", false, 2],
    ]);
  });

  it("gives one group when every frame is linked, or none is", () => {
    expect(groupDrawer([f("welcome", 1, "Welcome"), f("signup", 2, "Sign up")], [{ value: "signup", frames: ["welcome"] }]).map(group => group.label)).toEqual(["Welcome and 1 more"]);
    expect(groupDrawer([f("a", 1), f("b", 2)], []).map(group => group.label)).toEqual([UNLINKED_GROUP]);
    expect(groupDrawer([], [])).toEqual([]);
  });

  it("follows links in either direction", () => {
    const groups = groupDrawer([f("a", 1, "A"), f("b", 2, "B"), f("c", 3, "C")], [{ value: "a", frames: ["c"] }, { value: "b", frames: ["c"] }]);
    expect(groups.map(group => [group.label, group.rows.map(row => row.id)])).toEqual([["A and 2 more", ["a", "b", "c"]]]);
  });

  it("arrows, Home and End move across groups in visual order", () => {
    const rows = drawerOrder(groupDrawer(frames, gotos));
    expect(drawerKeyTarget(rows, "done", "ArrowDown")).toBe("welcome");
    expect(drawerKeyTarget(rows, "home", "ArrowUp")).toBe("signup");
    expect(drawerKeyTarget(rows, "checkout", "End")).toBe("settings");
    expect(drawerKeyTarget(rows, "settings", "Home")).toBe("cart");
    expect(drawerTypeahead(rows, "cart", "h")).toBe("home");
  });
});

describe("drawerKey", () => {
  const rows = [row("cart", "Cart"), row("checkout", "Checkout", true), row("home", "Home")];
  const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}, typed = { text: "", at: 0 }, now = 1000) =>
    drawerKey(rows, "checkout", { key, metaKey: false, ctrlKey: false, altKey: false, ...mods }, typed, now);

  it("picks the focused row on Enter and Space", () => {
    expect(press("Enter")).toMatchObject({ prevent: true, pick: "checkout" });
    expect(press(" ")).toMatchObject({ prevent: true, pick: "checkout" });
  });

  it("keeps Tab in the list and moves with the arrows", () => {
    expect(press("Tab")).toMatchObject({ prevent: true });
    expect(press("Tab").move).toBeUndefined();
    expect(press("ArrowDown")).toMatchObject({ prevent: true, move: "home" });
  });

  // V and H switch canvas tools from the window's keydown, which skips prevented keys.
  it("swallows every unmodified printable key, with or without a typeahead match", () => {
    expect(press("h")).toMatchObject({ prevent: true, move: "home", typed: { text: "h", at: 1000 } });
    for (const key of ["v", "V", "z", "1", "/"]) {
      expect(press(key).prevent, key).toBe(true);
      expect(press(key).move, key).toBeUndefined();
    }
  });

  it("extends the typeahead within 500 ms and starts over after", () => {
    expect(press("h", {}, { text: "c", at: 700 }, 1000).typed).toEqual({ text: "ch", at: 1000 });
    expect(press("h", {}, { text: "c", at: 400 }, 1000).typed).toEqual({ text: "h", at: 1000 });
  });

  it("leaves modified keys and Escape to others", () => {
    for (const mods of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) expect(press("v", mods).prevent).toBe(false);
    expect(press("Escape").prevent).toBe(false);
    expect(press("F5").prevent).toBe(false);
  });
});
