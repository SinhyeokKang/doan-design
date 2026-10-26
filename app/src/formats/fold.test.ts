import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { fold, parseLines } from "./fold";
import { foldText } from "./foldText";
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
      const actual: unknown = JSON.parse(JSON.stringify(foldText(input)));
      expect(actual).toEqual(expected);
    });
  }
});

test("the union-merge input conforms to the event schema", () => {
  const text = readFileSync(new URL("union-merge/events.jsonl", directory), "utf8");
  const lines = text.trimEnd().split("\n");
  expect(lines).toHaveLength(5);
  for (const line of lines) {
    const value: unknown = JSON.parse(line);
    expect(validateCommentEvent(value)).toBe(true);
  }
});

test("identical duplicates retain the smallest source line even when input is reversed", () => {
  const input = readFileSync(new URL("duplicate-agent-edit/events.jsonl", directory), "utf8");
  const parsed = parseLines(input);
  expect(parsed.warnings).toEqual([]);
  expect(fold([...parsed.events].reverse()).warnings).toEqual([
    {
      code: "agent_not_allowed",
      line: 2,
      event: "evt_00000000-0000-4000-8000-000000000002",
      comment: "cmt_00000000-0000-4000-8000-000000000001",
    },
  ]);
});

test("a tied human resolution is retained on reopen before the next resolve clears it", () => {
  const input = readFileSync(new URL("human-unicode-tied-lifecycle/events.jsonl", directory), "utf8");
  const parsed = parseLines(input);
  const reopened = fold(parsed.events.filter(({ event }) =>
    event.id !== "evt_00000000-0000-4000-8000-00000000000e"));
  expect(reopened.warnings).toEqual([]);
  expect(reopened.comments[0]).toMatchObject({
    status: "open",
    lastResolution: {
      by: { kind: "human", name: "Renée" },
      at: "2026-10-23T10:00:00.123Z",
      reopenedBy: { kind: "human", name: "김하나 👩🏽‍💻 é" },
      reopenedAt: "2026-10-23T10:00:00.123Z",
    },
  });
  expect(reopened.comments[0]).not.toHaveProperty("resolvedBy");
  expect(reopened.comments[0]).not.toHaveProperty("resolvedAt");
  expect(foldText(input).comments[0]).not.toHaveProperty("lastResolution");
});
