import { describe, expect, test } from "vitest";
import type { Anchor } from "../main/conversation/types";
import { fieldHighlightRuns, fieldRuns, fieldSkillRuns, insertSkillText, replaceSlashSkill, skillAnnouncements, skillWords, skillTextParts, sameSkillRanges, sameSkillNames } from "./skillWords";
import { textSegments, type FieldSegment } from "./anchorField";

const names = new Set(["deploy", "db-migrate"]);
test.each([
  ["/deploy", "deploy"], ["/deploy.", "deploy"], ["(/deploy)", null], ["/deploy-x", null],
  ["/deplo", null], ["/Deploy", null], ["/deploy/x", null], ["/Users/me/deploy", null],
  ["/deploy로 배포해", "deploy"], ["/deploy에서도", "deploy"], ["/deploy로.", "deploy"],
  ["/deploy.로", null], ["/db-migrate를", "db-migrate"], ["/deploy-x로", null],
  ["/", null], ["//deploy", null], ["/deploy/", null], ["/deploy。」", "deploy"],
  ["`/deploy`", null], ["a/deploy", null], ["https://x/deploy", null],
])("matches only the specified word in %s", (text, name) => {
  expect(skillWords(text, names)).toEqual(name ? [{ start: 0, end: name.length + 1, name }] : []);
});
test.each([" ", "\n", "\t", "\u00a0", "\u0085"])("accepts Unicode whitespace %j", space => {
  expect(skillWords(`x${space}/deploy y${space}/db-migrate`, names)).toEqual([
    { start: 2, end: 9, name: "deploy" }, { start: 12, end: 23, name: "db-migrate" },
  ]);
});
test.each([0xac00, 0xd7a3, 0x1100, 0x11ff, 0x3130, 0x318f])("accepts Hangul boundary U+%s", code => {
  expect(skillWords(`/deploy${String.fromCharCode(code)}`, names)).toEqual([{ start: 0, end: 7, name: "deploy" }]);
});
test.each([0xabff, 0xd7a4, 0x10ff, 0x1200, 0x312f, 0x3190, 0xa960, 0xfeff])("rejects non-boundary U+%s", code => {
  expect(skillWords(`/deploy${String.fromCharCode(code)}`, names)).toEqual([]);
});
test("uses the longest candidate, never splits Hangul from Hangul, and preserves exact names", () => {
  const known = new Set(["배포", "deploy", "deploy배포", "deploy배포-x", "deploy."]);
  expect(skillWords("/배포 /배포로 /deploy배포 /deploy배포로 /deploy배포-x를 /deploy.", known).map(r => r.name))
    .toEqual(["배포", "deploy배포", "deploy", "deploy배포-x", "deploy."]);
  expect(skillWords("/deploy", new Set())).toEqual([]);
});
test("joins adjacent text but treats each chip as a non-whitespace boundary and one unit", () => {
  const segments: FieldSegment[] = [{ kind: "text", text: "/dep" }, { kind: "text", text: "loy " },
    { kind: "chip", anchor: { frame: { id: "a" } } }, { kind: "text", text: "/deploy /db-migrate" }];
  expect(fieldSkillRuns(segments, names)).toEqual([{ start: 0, end: 7, name: "deploy" }, { start: 17, end: 28, name: "db-migrate" }]);
  expect(fieldSkillRuns([{ kind: "text", text: "/deploy" }, { kind: "chip", anchor: { frame: { id: "a" } } }], names))
    .toEqual([{ start: 0, end: 7, name: "deploy" }]);
});
test.each([
  ["", null, "/deploy ", 8], ["abc", null, "abc /deploy ", 12],
  ["a b", 2, "a /deploy b", 10], ["ab", 1, "a /deploy b", 10], ["\t", 1, "\t/deploy ", 9],
] as const)("inserts at the caret in %j", (text, caret, result, after) => {
  expect(insertSkillText(textSegments(text), caret, "deploy")).toEqual({ segments: textSegments(result), caret: after });
});
test("inserts whitespace after a chip and replaces an entire slash query", () => {
  const chip: FieldSegment = { kind: "chip", anchor: { frame: { id: "a" } } };
  expect(insertSkillText([chip], 1, "deploy")).toEqual({ segments: [chip, { kind: "text", text: " /deploy " }], caret: 10 });
  expect(replaceSlashSkill("deploy")).toEqual({ segments: textSegments("/deploy "), caret: 8 });
});
test("announces each newly matched name once and says nothing for removals", () => {
  expect(skillAnnouncements(["deploy"], ["deploy", "db-migrate", "db-migrate"])).toEqual(["Project skill db-migrate"]);
  expect(skillAnnouncements(["deploy"], [])).toEqual([]);
});

test.each([...".,;:!?)\]}\"'’”…。、，．！？：；）」』"])("strips terminal punctuation %s", punctuation => {
  expect(skillWords(`/deploy${punctuation}`, names)).toEqual([{ start: 0, end: 7, name: "deploy" }]);
});
test("a path can match only its complete listed name", () => {
  expect(skillWords("/Users/me/deploy", new Set(["Users/me/deploy"])))
    .toEqual([{ start: 0, end: 16, name: "Users/me/deploy" }]);
});

test("drawing splits only text and compares exact span ranges", () => {
  const runs = [{ start: 2, end: 9, name: "deploy" }];
  expect(skillTextParts("x /deploy로", 0, runs)).toEqual([{ text: "x " }, { text: "/deploy", skill: true }, { text: "로" }]);
  expect(sameSkillRanges(runs, [{ start: 2, end: 9 }])).toBe(true);
  expect(sameSkillRanges(runs, [{ start: 2, end: 10 }])).toBe(false);
  expect(sameSkillRanges(runs, [])).toBe(false);
});

test("name equality ignores Set identity and order but detects additions and removals", () => {
  expect(sameSkillNames(names, new Set(["db-migrate", "deploy"]))).toBe(true);
  expect(sameSkillNames(names, new Set(["deploy"]))).toBe(false);
  expect(sameSkillNames(names, new Set(["deploy", "review"]))).toBe(false);
});

describe("fieldRuns", () => {
  const anchor: Anchor = { frame: { id: "payment" } };
  const commands = new Set(["review"]);

  test("adds the list marker and depth-space runs to the skill runs, in field order", () => {
    expect(fieldRuns(textSegments("- a\n  - /deploy b\n12. c"), names, commands)).toEqual([
      { kind: "mark", start: 0, end: 2, list: "ul", depth: 0 },
      { kind: "depth", start: 4, end: 6, depth: 1 },
      { kind: "mark", start: 6, end: 8, list: "ul", depth: 1 },
      { kind: "skill", start: 8, end: 15, name: "deploy" },
      { kind: "mark", start: 18, end: 22, list: "ol", depth: 0 },
    ]);
  });

  test("a leading command stays the field's first word ahead of a list", () => {
    expect(fieldRuns(textSegments("/review\n- /deploy"), names, commands)).toEqual([
      { kind: "skill", start: 0, end: 7, name: "review" },
      { kind: "mark", start: 8, end: 10, list: "ul", depth: 0 },
      { kind: "skill", start: 10, end: 17, name: "deploy" },
    ]);
    // A marker before it makes the command no longer the first word, as fieldHighlightRuns already decides.
    expect(fieldRuns(textSegments("- /review"), names, commands)).toEqual([{ kind: "mark", start: 0, end: 2, list: "ul", depth: 0 }]);
  });

  test("leading spaces of a depth-0 item are a depth run of depth 0", () => {
    expect(fieldRuns(textSegments("  - a"), names, commands)).toEqual([
      { kind: "depth", start: 0, end: 2, depth: 0 },
      { kind: "mark", start: 2, end: 4, list: "ul", depth: 0 },
    ]);
  });

  test("chips count one unit, and a line that starts with a chip has no marker", () => {
    const segments: FieldSegment[] = [{ kind: "chip", anchor }, { kind: "text", text: " - a\n- " }, { kind: "chip", anchor }, { kind: "text", text: " /deploy" }];
    expect(fieldRuns(segments, names, commands)).toEqual([
      { kind: "mark", start: 6, end: 8, list: "ul", depth: 0 },
      { kind: "skill", start: 10, end: 17, name: "deploy" },
    ]);
  });

  test("a year and other plain lines get no runs", () => {
    expect(fieldRuns(textSegments("2026. 11. 19. 회의\n-a\n**b**"), names, commands)).toEqual([]);
  });

  test("a pasted list in several segments is marked like a typed one", () => {
    expect(fieldRuns([{ kind: "text", text: "intro\n- a\n" }, { kind: "text", text: "- b" }], names, commands).map(run => [run.kind, run.start])).toEqual([["mark", 6], ["mark", 10]]);
  });

  test("fieldHighlightRuns still returns only the highlighted words", () => {
    expect(fieldHighlightRuns(textSegments("/review\n- /deploy"), names, commands)).toEqual([
      { start: 0, end: 7, name: "review" }, { start: 10, end: 17, name: "deploy" },
    ]);
  });
});
