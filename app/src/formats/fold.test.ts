import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { fold, parseLines } from "./fold";
import { validateCommentEvent } from "./validate";

const directory = new URL("../../../schema/fixtures/fold/", import.meta.url);
const cases = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("shared fold fixtures", () => {
  test("fixtures exist", () => expect(cases.length).toBeGreaterThan(0));
  for (const name of cases) {
    test(name, () => {
      const input = readFileSync(new URL(`${name}/events.jsonl`, directory), "utf8");
      const expected: unknown = JSON.parse(readFileSync(new URL(`${name}/expected.json`, directory), "utf8"));
      const parsed = parseLines(input);
      const folded = fold(parsed.events);
      const warnings = [...parsed.warnings, ...folded.warnings].sort((a, b) =>
        a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      const actual: unknown = JSON.parse(JSON.stringify({ comments: folded.comments, warnings }));
      expect(actual).toEqual(expected);
    });
  }
});

test("the unchanged union-merge input conforms to the event schema", () => {
  const text = readFileSync(new URL("union-merge/events.jsonl", directory), "utf8");
  const lines = text.trimEnd().split("\n");
  expect(lines).toHaveLength(5);
  for (const line of lines) {
    const value: unknown = JSON.parse(line);
    expect(validateCommentEvent(value)).toBe(true);
  }
});
