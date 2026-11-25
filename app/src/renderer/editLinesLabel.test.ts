import { describe, expect, it } from "vitest";
import { editHeadName, editLinesLabel } from "./editLinesLabel";

// The visible numbers use U+2212 for the minus, so a screen reader would read them as symbols: the name says it in words.
describe("editLinesLabel", () => {
  it("shows added and removed lines with a real minus sign and names them in words", () => {
    expect(editLinesLabel({ added: 12, removed: 3 })).toEqual({ text: "+12 −3", name: "12 lines added, 3 removed" });
  });
  it("keeps a side that is zero", () => {
    expect(editLinesLabel({ added: 12, removed: 0 })).toEqual({ text: "+12 −0", name: "12 lines added, 0 removed" });
    expect(editLinesLabel({ added: 0, removed: 0 })).toEqual({ text: "+0 −0", name: "0 lines added, 0 removed" });
  });
  it("groups thousands with commas", () => {
    expect(editLinesLabel({ added: 12_345, removed: 2_048 })).toEqual({ text: "+12,345 −2,048", name: "12,345 lines added, 2,048 removed" });
  });
  it("names a single line in the singular", () => {
    expect(editLinesLabel({ added: 1, removed: 1 })).toEqual({ text: "+1 −1", name: "1 line added, 1 removed" });
  });
});

describe("editHeadName", () => {
  it("names the steps and the row's line totals", () => {
    expect(editHeadName(6, { added: 42, removed: 10 })).toBe("6 steps, 42 lines added, 10 removed");
  });
  it("names the steps alone when the row has no line counts", () => {
    expect(editHeadName(6, undefined)).toBe("6 steps");
  });
  it("uses the singular for one step and one line", () => {
    expect(editHeadName(1, { added: 1, removed: 0 })).toBe("1 step, 1 line added, 0 removed");
    expect(editHeadName(2, { added: 12_345, removed: 1 })).toBe("2 steps, 12,345 lines added, 1 removed");
  });
});
