import { expect, test } from "vitest";
import { stripRequestLines, splitRequestLines, requestTitleText } from "./requestLines";

test.each([
  ["Use the project skill `deploy`.\n\n/deploy staging", "/deploy staging"],
  ["Use the Doan design preset `audit` (Audit).\nUse the project skill `deploy`.\nUse the project skill `db-migrate`.\n\nrun", "run"],
  ["Use the Doan design preset `audit` (Audit).\n\nrun", "run"],
  ["Use the project skill `deploy`.", ""],
  ["hello\nUse the project skill `deploy`.", "hello\nUse the project skill `deploy`."],
  ["Use the project skill `deploy`.\nordinary line", "Use the project skill `deploy`.\nordinary line"],
  ["Use the project skill `deploy`.\n\n\n spaced ", "\n spaced "],
  ["", ""],
])("strips only a complete leading fixed-line block: %s", (text, body) => {
  expect(stripRequestLines(text)).toBe(body);
});

test("strips every combined paragraph block and unions skills in first-seen order", () => {
  const text = "Use the Doan design preset `polish` (Polish).\nUse the project skill `deploy`.\n\n/deploy a\n\nUse the Doan design preset `audit` (Audit).\nUse the project skill `audit`.\nUse the project skill `deploy`.\n\n/audit b";
  expect(splitRequestLines(text)).toEqual({ preset: { id: "polish", title: "Polish" }, skills: ["deploy", "audit"], body: "/deploy a\n\n/audit b" });
  expect(stripRequestLines(text)).toBe("/deploy a\n\n/audit b");
});
test("does not promote a later preset into a skill-only first block", () => {
  const text = "Use the project skill `deploy`.\n\nUse the Doan design preset `polish` (Polish).";
  expect(splitRequestLines(text)).toEqual({ preset: null, skills: ["deploy"], body: "" });
  expect(requestTitleText(text)).toBe("Polish");
});
test("retains ordinary paragraphs and only strips complete fixed-line blocks", () => {
  const text = "first\n\nUse the project skill `deploy`.\n\nsecond\nUse the project skill `audit`.\n\nlast";
  expect(splitRequestLines(text)).toEqual({ preset: null, skills: ["deploy"], body: "first\n\nsecond\nUse the project skill `audit`.\n\nlast" });
  expect(stripRequestLines("a\n\n\n\nb")).toBe("a\n\n\n\nb");
});
test.each([
  ["Use the Doan design preset `polish` (Polish).", "Polish"],
  ["Use the Doan design preset `polish` (Polish).\n\nUse the Doan design preset `audit` (Audit).", "Polish"],
  ["Use the Doan design preset `polish` (Polish).\n\nactual text", "actual text"],
  ["Use the project skill `deploy`.", ""],
  ["plain text", "plain text"],
  ["", ""],
])("uses body or first preset title for %s", (text, expected) => {
  expect(requestTitleText(text)).toBe(expected);
});
