import { describe, expect, test } from "vitest";
import type { Anchor } from "../main/conversation/types";
import { LIMITS } from "../main/conversation/messageText";
import { normalize, spliceUnits, textSegments, type FieldSegment } from "./anchorField";
import {
  bubbleBlocks, continueList, fieldListItems, indentItem, listLines, removeMarker, trimBlankLines, type BubbleBlock, type FieldEdit,
} from "./composerLists";
import { draftProblem } from "./homeComposer";
import type { MessagePart } from "./threadItems";

// A field written as a string: ◆ is a chip, | is the caret.
const anchor: Anchor = { frame: { id: "payment", title: "Payment" } };
function field(source: string): { segments: FieldSegment[]; caret: number } {
  const caret = source.indexOf("|");
  const plain = source.replace("|", "");
  const segments: FieldSegment[] = plain.split(/(◆)/).filter(Boolean).map(piece => (piece === "◆" ? { kind: "chip", anchor } : { kind: "text", text: piece }));
  return { segments: normalize(segments), caret };
}
function show(edit: FieldEdit | null): string | null {
  if (!edit) return null;
  const plain = edit.segments.map(segment => (segment.kind === "text" ? segment.text : "◆")).join("");
  return plain.slice(0, edit.caret) + "|" + plain.slice(edit.caret);
}
const run = (fn: (segments: FieldSegment[], caret: number) => FieldEdit | null, source: string) => {
  const { segments, caret } = field(source);
  return show(fn(segments, caret));
};

describe("listLines", () => {
  test("recognises -, * and 1 to 3 digit numbered markers", () => {
    expect(listLines(["- a", "* b", "1. c", "999. d"])).toEqual([
      { list: "ul", marker: "- ", number: null, depth: 0, lead: 0, body: 2, indent: 0, column: 2 },
      { list: "ul", marker: "* ", number: null, depth: 0, lead: 0, body: 2, indent: 0, column: 2 },
      { list: "ol", marker: "1. ", number: 1, depth: 0, lead: 0, body: 3, indent: 0, column: 3 },
      { list: "ol", marker: "999. ", number: 999, depth: 0, lead: 0, body: 5, indent: 0, column: 5 },
    ]);
  });

  test("an item with an empty body is still an item", () => {
    expect(listLines(["- "])[0]).toMatchObject({ list: "ul", body: 2 });
  });

  test.each([
    "2026. 11. 19. 회의", "1000. a", "-a", "*a", "1.a", "1) a", "**bold**", "---", "", "a - b", "x", "￼ - a", "- ".trim(), ". a",
  ])("%j is not a list item", line => {
    expect(listLines([line])).toEqual([null]);
  });

  test("depth follows the leading spaces against the item above's body start", () => {
    expect(listLines(["- a", "  - b", "    - c", "  - d", "- e"]).map(item => item?.depth)).toEqual([0, 1, 2, 1, 0]);
  });

  test("a numbered parent's body starts after its number, so fewer spaces make a sibling", () => {
    expect(listLines(["1. a", "  1. b"]).map(item => item?.depth)).toEqual([0, 0]);
    expect(listLines(["1. a", "   1. b"]).map(item => item?.depth)).toEqual([0, 1]);
    expect(listLines(["10. a", "   - b"]).map(item => item?.depth)).toEqual([0, 0]);
    expect(listLines(["10. a", "    - b"]).map(item => item?.depth)).toEqual([0, 1]);
    expect(listLines(["- a", " - b"]).map(item => item?.depth)).toEqual([0, 0]);
  });

  test("the body starts after 1 to 4 spaces past the marker, and one space past it from 5 spaces or with no body", () => {
    const depths = (lines: string[]) => listLines(lines).map(item => item?.depth);
    expect(listLines(["-  a"])[0]).toMatchObject({ marker: "- ", body: 2, column: 3 });
    expect(listLines(["-    a"])[0]).toMatchObject({ marker: "- ", body: 2, column: 5 });
    expect(listLines(["-     a"])[0]).toMatchObject({ marker: "- ", body: 2, column: 2 });
    expect(listLines(["-   "])[0]).toMatchObject({ marker: "- ", body: 2, column: 2 });
    expect(listLines(["1.  a"])[0]).toMatchObject({ marker: "1. ", body: 3, column: 4 });
    expect(depths(["-   a", "  - b"])).toEqual([0, 0]);
    expect(depths(["-  a", "  - b"])).toEqual([0, 0]);
    expect(depths(["-  a", "   - b"])).toEqual([0, 1]);
    expect(depths(["-    a", "    - b"])).toEqual([0, 0]);
    expect(depths(["-    a", "     - b"])).toEqual([0, 1]);
    expect(depths(["-     a", "  - b"])).toEqual([0, 1]);
    expect(depths(["-   ", "  - b"])).toEqual([0, 1]);
  });

  test("whitespace after the marker counts tabs to the next 4-column stop too", () => {
    const depths = (lines: string[]) => listLines(lines).map(item => item?.depth);
    expect(listLines(["- \ta"])[0]).toMatchObject({ marker: "- ", body: 2, column: 4 });
    expect(depths(["- \ta", "  - b"])).toEqual([0, 0]);
    expect(depths(["- \ta", "    - b"])).toEqual([0, 1]);
    // From column 3 the tab reaches 8: five columns of whitespace, so the body starts one past the marker.
    expect(listLines(["  - \ta"])[0]).toMatchObject({ indent: 2, column: 4 });
  });

  test("more spaces than needed still go one level deeper, never two", () => {
    expect(listLines(["- a", "          - b"]).map(item => item?.depth)).toEqual([0, 1]);
  });

  test("a tab counts to the next 4-column stop", () => {
    expect(listLines(["- a", "\t- b"])[1]).toMatchObject({ depth: 1, lead: 1, indent: 4, body: 3, column: 6 });
    expect(listLines(["1. a", "\t- b"])[1]).toMatchObject({ depth: 1 });
    expect(listLines(["- a", "  - b", "\t- c"]).map(item => item?.depth)).toEqual([0, 1, 2]);
    expect(listLines([" \t- x"])[0]).toMatchObject({ lead: 2, indent: 4, body: 4, column: 6 });
  });

  test("leading spaces without a parent item stay at depth 0", () => {
    expect(listLines(["   - a"])[0]).toEqual({ list: "ul", marker: "- ", number: null, depth: 0, lead: 3, body: 5, indent: 3, column: 5 });
  });

  test("a line that is not an item, blank or indented, ends the list", () => {
    expect(listLines(["- a", "text", "  - b"]).map(item => item?.depth ?? null)).toEqual([0, null, 0]);
    expect(listLines(["- a", "", "  - b"]).map(item => item?.depth ?? null)).toEqual([0, null, 0]);
    expect(listLines(["- a", "  continued", "  - b"]).map(item => item?.depth ?? null)).toEqual([0, null, 0]);
  });
});

describe("fieldListItems", () => {
  test("a line that starts with a chip is not an item, a chip after the marker is the body", () => {
    const { segments } = field("◆ - a\n- ◆");
    expect(fieldListItems(segments)).toEqual([expect.objectContaining({ start: 6, list: "ul", body: 2 })]);
  });

  test("a pasted list split over several text segments reads as one text", () => {
    const segments: FieldSegment[] = [{ kind: "text", text: "intro\n- a\n" }, { kind: "text", text: "- b\n  1. c" }];
    expect(fieldListItems(segments).map(item => [item.start, item.list, item.depth])).toEqual([[6, "ul", 0], [10, "ul", 0], [14, "ol", 1]]);
  });
});

describe("continueList", () => {
  test.each([
    ["- a|", "- a\n- |"],
    ["* a|", "* a\n* |"],
    ["3. a|", "3. a\n4. |"],
    ["998. a|", "998. a\n999. |"],
    ["- ab|cd", "- ab\n- |cd"],
    ["- a\n  - b|", "- a\n  - b\n  - |"],
    ["- a\n\t- b|", "- a\n\t- b\n\t- |"],
    ["- ◆ x|", "- ◆ x\n- |"],
    ["- ◆|", "- ◆\n- |"],
    ["- /deploy|", "- /deploy\n- |"],
    ["-   a|", "-   a\n- |"],
    ["/review\n- a|", "/review\n- a\n- |"],
    ["1. a\n   1. b|", "1. a\n   1. b\n   2. |"],
  ])("%j adds the next marker at the same depth", (before, after) => {
    expect(run(continueList, before)).toBe(after);
  });

  test.each([
    ["999. a|", "the next number would have 4 digits"],
    ["a|", "the line is not an item"],
    ["2026. 11. 19. 회의|", "a year is not a number marker"],
    ["◆ - a|", "a line starting with a chip is not an item"],
    ["|- a", "the caret is before the marker"],
    ["-| a", "the caret is inside the marker"],
    ["  |- a", "the caret is inside the depth spaces"],
  ])("%j is a plain line break: %s", before => {
    expect(run(continueList, before)).toBeNull();
  });

  test.each([
    ["- a\n- |", "- a\n|"],
    ["- |", "|"],
    ["- a\n-   |", "- a\n  |"],
    ["  - |", "  |"],
    ["1. a\n2. |", "1. a\n|"],
    ["12. |", "|"],
  ])("an empty item at depth 0 ends the list, only its marker removed: %j", (before, after) => {
    expect(run(continueList, before)).toBe(after);
  });

  test.each([
    ["- a\n  - |", "- a\n- |"],
    ["1. a\n   1. |", "1. a\n2. |"],
    ["- a\n  - b\n    - |", "- a\n  - b\n  - |"],
    ["999. a\n     1. |", "999. a\n1. |"],
  ])("an empty item deeper than 0 moves out one level: %j", (before, after) => {
    expect(run(continueList, before)).toBe(after);
  });

  test("an added marker can take a draft over the text limit where a plain line break does not, and nothing is cut", () => {
    const segments = textSegments(`- ${"x".repeat(LIMITS.text - 3)}`), end = LIMITS.text - 1;
    const plain = spliceUnits(segments, end, end, textSegments("\n"));
    const listed = continueList(segments, end);
    expect(draftProblem(plain.segments, null, [], [])).toBeNull();
    expect(listed && draftProblem(listed.segments, null, [], [])).toMatchObject({ kind: "overLimit" });
    expect(listed?.caret).toBe(LIMITS.text + 2);
  });
});

describe("indentItem", () => {
  test.each([
    ["- a\n- b|", "- a\n  - b|"],
    ["- a\n- |b", "- a\n  - |b"],
    ["- a\n|- b", "- a\n|  - b"],
    ["- a\n-| b", "- a\n  - |b"],
    ["* a\n* b|", "* a\n  * b|"],
    ["- a\n  - x\n- b|", "- a\n  - x\n  - b|"],
    ["1. a\n- b|", "1. a\n   - b|"],
    ["/review\n- a\n- ◆ b|", "/review\n- a\n  - ◆ b|"],
    ["\t- a\n\t- b|", "\t- a\n      - b|"],
    ["-   a\n- b|", "-   a\n    - b|"],
    ["- a\n-   b|\n    - c", "- a\n  -   b|\n      - c"],
    ["1. a\n   999. x\n2. b|", "1. a\n   999. x\n   2. b|"],
    ["- a\n- \tb|\n    - c", "- a\n  - \tb|\n    - c"],
  ])("Tab makes %j a child of the item above", (before, after) => {
    expect(run((segments, caret) => indentItem(segments, caret, 1), before)).toBe(after);
  });

  test.each([
    ["1. a\n2. b|", "1. a\n   1. b|", "a new numbered sublist starts at 1"],
    ["1. a\n   1. x\n2. b|", "1. a\n   1. x\n   2. b|", "an existing numbered sublist continues"],
    ["1. a\n   - x\n2. b|", "1. a\n   - x\n   1. b|", "after a bulleted sublist the numbers start at 1"],
  ])("%j → %j: %s", (before, after) => {
    expect(run((segments, caret) => indentItem(segments, caret, 1), before)).toBe(after);
  });

  test("the item's own children move with it", () => {
    expect(run((segments, caret) => indentItem(segments, caret, 1), "- a\n- b|\n  - c\n    - d\n- e")).toBe("- a\n  - b|\n    - c\n      - d\n- e");
  });

  test.each([
    ["- a|", "no item above"],
    ["- a\n  - b|", "the first child has no sibling above"],
    ["text\n- a|", "a line above that is not an item"],
    ["- a\n\n- b|", "a blank line ends the list above"],
    ["a|", "not an item"],
    ["◆ - a\n◆ - b|", "lines starting with a chip are not items"],
  ])("Tab is refused for %j: %s", before => {
    expect(run((segments, caret) => indentItem(segments, caret, 1), before)).toBeNull();
  });

  test.each([
    ["- a\n  - b|", "- a\n- b|"],
    ["- a\n  - |b", "- a\n- |b"],
    ["1. a\n   1. b|", "1. a\n2. b|"],
    ["- a\n  1. b|", "- a\n1. b|"],
    ["\t- a\n\t  - b|", "\t- a\n\t- b|"],
    ["- a\n  - b|\n    - c", "- a\n- b|\n  - c"],
    ["1. a\n   1. b|\n      - c", "1. a\n2. b|\n   - c"],
    ["999. a\n     1. |b", "999. a\n1. |b"],
    ["- a\n  - \tb|\n    - c", "- a\n- \tb|\n    - c"],
  ])("Shift+Tab moves %j out one level", (before, after) => {
    expect(run((segments, caret) => indentItem(segments, caret, -1), before)).toBe(after);
  });

  test.each(["- a|", "  - a|", "a|", "1. a|"])("Shift+Tab is refused at depth 0: %j", before => {
    expect(run((segments, caret) => indentItem(segments, caret, -1), before)).toBeNull();
  });
});

describe("removeMarker", () => {
  test.each([
    ["- |Title", "|Title"],
    ["12. |Title", "|Title"],
    ["- |", "|"],
    ["  - |a", "  |a"],
    ["- |◆", "|◆"],
    ["intro\n- |a", "intro\n|a"],
  ])("Backspace at the body start of a depth-0 item removes the marker: %j", (before, after) => {
    expect(run(removeMarker, before)).toBe(after);
  });

  test.each([
    ["- a\n  - |b", "- a\n- |b"],
    ["1. a\n   1. |b", "1. a\n2. |b"],
    ["999. a\n     1. |b", "999. a\n1. |b"],
  ])("Backspace at the body start of a deeper item moves it out: %j", (before, after) => {
    expect(run(removeMarker, before)).toBe(after);
  });

  test.each(["- T|itle", "|- Title", "-| Title", "Title|", "|Title", "◆ - |a"])("Backspace elsewhere is ordinary: %j", before => {
    expect(run(removeMarker, before)).toBeNull();
  });
});

describe("bubbleBlocks", () => {
  function textOf(blocks: readonly BubbleBlock[]): string {
    const partsText = (parts: readonly MessagePart[]) => parts.map(part => ("text" in part ? part.text : `{{${part.anchor}}}`)).join("");
    return blocks.map(block => (block.kind === "text" ? partsText(block.parts)
      : block.items.map(item => item.lead + item.marker + partsText(item.parts) + item.children.map(child => "\n" + textOf([child])).join("")).join("\n"))).join("\n");
  }

  test("a message without list lines is one text block", () => {
    const parts: MessagePart[] = [{ text: "Move " }, { anchor: 1 }, { text: " up\nand **bold**" }];
    expect(bubbleBlocks(parts)).toEqual([{ kind: "text", parts }]);
  });

  test("nested lists keep their markers and numbers as typed", () => {
    expect(bubbleBlocks([{ text: "Intro\n- a\n  1. b\n  1. c\n     - d\n- e\nOutro" }])).toEqual([
      { kind: "text", parts: [{ text: "Intro" }] },
      { kind: "list", list: "ul", items: [
        { lead: "", marker: "- ", parts: [{ text: "a" }], children: [
          { kind: "list", list: "ol", items: [
            { lead: "  ", marker: "1. ", parts: [{ text: "b" }], children: [] },
            { lead: "  ", marker: "1. ", parts: [{ text: "c" }], children: [
              { kind: "list", list: "ul", items: [{ lead: "     ", marker: "- ", parts: [{ text: "d" }], children: [] }] },
            ] },
          ] },
        ] },
        { lead: "", marker: "- ", parts: [{ text: "e" }], children: [] },
      ] },
      { kind: "text", parts: [{ text: "Outro" }] },
    ]);
  });

  test("chips stay where they were typed inside items", () => {
    expect(bubbleBlocks([{ text: "1. Move " }, { anchor: 1 }, { text: " here\n2. " }, { anchor: 2 }])).toEqual([
      { kind: "list", list: "ol", items: [
        { lead: "", marker: "1. ", parts: [{ text: "Move " }, { anchor: 1 }, { text: " here" }], children: [] },
        { lead: "", marker: "2. ", parts: [{ anchor: 2 }], children: [] },
      ] },
    ]);
  });

  test("a line that starts with a chip is not an item", () => {
    expect(bubbleBlocks([{ anchor: 1 }, { text: " - a\n- b" }])).toEqual([
      { kind: "text", parts: [{ anchor: 1 }, { text: " - a" }] },
      { kind: "list", list: "ul", items: [{ lead: "", marker: "- ", parts: [{ text: "b" }], children: [] }] },
    ]);
  });

  test("a blank line separates two lists and an empty line has no parts", () => {
    expect(bubbleBlocks([{ text: "- a\n\n- b" }])).toEqual([
      { kind: "list", list: "ul", items: [{ lead: "", marker: "- ", parts: [{ text: "a" }], children: [] }] },
      { kind: "text", parts: [] },
      { kind: "list", list: "ul", items: [{ lead: "", marker: "- ", parts: [{ text: "b" }], children: [] }] },
    ]);
  });

  test("an indented line that is not an item stays text between two lists", () => {
    expect(bubbleBlocks([{ text: "- a\n  continued\n- b" }]).map(block => block.kind)).toEqual(["list", "text", "list"]);
    expect(bubbleBlocks([{ text: "- a\n  continued\n- b" }])[1]).toEqual({ kind: "text", parts: [{ text: "  continued" }] });
  });

  test("consecutive plain lines join into one block, and a different list kind starts a new list", () => {
    expect(bubbleBlocks([{ text: "one\ntwo\n- a\n1. b" }])).toEqual([
      { kind: "text", parts: [{ text: "one\ntwo" }] },
      { kind: "list", list: "ul", items: [{ lead: "", marker: "- ", parts: [{ text: "a" }], children: [] }] },
      { kind: "list", list: "ol", items: [{ lead: "", marker: "1. ", parts: [{ text: "b" }], children: [] }] },
    ]);
  });

  test("only a line feed separates lines, so a marker after U+2028 stays text", () => {
    expect(bubbleBlocks([{ text: "A\u2028- B" }])).toEqual([{ kind: "text", parts: [{ text: "A\u2028- B" }] }]);
  });

  test("a year at a line start is text", () => {
    expect(bubbleBlocks([{ text: "2026. 11. 19. 회의" }])).toEqual([{ kind: "text", parts: [{ text: "2026. 11. 19. 회의" }] }]);
  });

  test.each([
    "- a\n  - b\n    1. c\n\n- d\n  text\n- e",
    "\n\n- a\n",
    "\t- a\n\t  - b\n   - c",
    "x\n- \n- y",
    "",
  ])("the blocks stand for exactly the sent text %j", text => {
    expect(textOf(bubbleBlocks(text ? [{ text }] : []))).toBe(text);
  });

  test("chips and markers together stand for the sent text", () => {
    const parts: MessagePart[] = [{ anchor: 1 }, { text: "\n- " }, { anchor: 2 }, { text: " a\n  1. b " }, { anchor: 1 }, { text: "\nend" }];
    expect(textOf(bubbleBlocks(parts))).toBe("{{1}}\n- {{2}} a\n  1. b {{1}}\nend");
  });

  test("a long message is not cut", () => {
    const text = "- " + "x".repeat(LIMITS.text);
    expect(textOf(bubbleBlocks([{ text }])).length).toBe(LIMITS.text + 2);
  });
});

describe("trimBlankLines", () => {
  test.each([
    ["\n\n  - a\n- b\n\n", "  - a\n- b"],
    [" \t\n  first\n \n", "  first"],
    ["a\n\n\nb", "a\n\n\nb"],
    ["a  ", "a  "],
    ["  a", "  a"],
    [" \n\ta\n　", "\ta"],
    ["   \n\t\n ", ""],
    ["", ""],
  ])("%j keeps everything but the blank lines around it", (text, trimmed) => {
    expect(trimBlankLines(text)).toBe(trimmed);
  });

  test("a long body is not cut", () => {
    const text = "  - " + "x".repeat(LIMITS.text);
    expect(trimBlankLines(`\n${text}\n`)).toBe(text);
  });
});
