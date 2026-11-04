import { describe, expect, it } from "vitest";
import { queueFocusAfter } from "./queueFocus";

const rows = [{ itemId: "a", sendNow: true }, { itemId: "b", sendNow: true }, { itemId: "c", sendNow: false }];

describe("queueFocusAfter", () => {
  it("goes to the next row's Send now", () => { expect(queueFocusAfter(rows, 0)).toEqual({ kind: "sendNow", itemId: "b" }); });
  it("goes to the next row's Remove when that row has no Send now", () => { expect(queueFocusAfter(rows, 1)).toEqual({ kind: "remove", itemId: "c" }); });
  it("goes to a sending row's Send now (rendered as Sending), not its Remove", () => {
    const withSending = [{ itemId: "a", sendNow: true }, { itemId: "s", sendNow: true /* sendNowShown({ ..., sending: false }) */ }];
    expect(queueFocusAfter(withSending, 0)).toEqual({ kind: "sendNow", itemId: "s" });
  });
  it("goes to the input after the last row", () => { expect(queueFocusAfter(rows, 2)).toEqual({ kind: "input" }); });
  it("goes to the input when the row is not in the list", () => {
    expect(queueFocusAfter(rows, -1)).toEqual({ kind: "input" });
    expect(queueFocusAfter([], 0)).toEqual({ kind: "input" });
  });
});
