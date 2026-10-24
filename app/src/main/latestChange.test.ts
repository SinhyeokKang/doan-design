import { describe, expect, test } from "vitest";
import { latestChange } from "./latestChange";

describe("latestChange", () => {
  test("is the largest mtime", () => {
    expect(latestChange([10, 30, 20])).toBe(30);
  });

  test("skips canvases whose file vanished", () => {
    expect(latestChange([undefined, 5, undefined])).toBe(5);
  });

  test("is undefined with no values", () => {
    expect(latestChange([])).toBeUndefined();
    expect(latestChange([undefined])).toBeUndefined();
  });

  test("ignores values that are not finite", () => {
    expect(latestChange([Number.NaN, Infinity, 7])).toBe(7);
  });
});
