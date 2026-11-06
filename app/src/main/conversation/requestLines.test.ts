import { expect, test } from "vitest";
import { stripRequestLines } from "./requestLines";

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
