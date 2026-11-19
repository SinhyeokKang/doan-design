import { expect, test } from "vitest";
import { specificity } from "./cssomMatched";

test("conditional selectors keep the strongest argument while :where contributes zero", () => {
  expect(specificity(":where(#unused) :is(.a, #b):has(> span):nth-child(2 of .c)")).toEqual([1, 2, 1]);
});
