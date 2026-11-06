import { expect, test } from "vitest";
import { fieldSkillRuns, insertSkillText, replaceSlashSkill, skillAnnouncements, skillWords } from "./skillWords";
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
