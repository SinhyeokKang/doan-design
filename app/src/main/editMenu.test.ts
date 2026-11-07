import { describe, expect, test } from "vitest";
import { editMenuItems, lookUpLabel, type EditMenuInput, type EditMenuItem } from "./editMenu";

const ALL = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

function input(overrides: Partial<EditMenuInput> = {}): EditMenuInput {
  return { mainFrame: true, editable: true, password: false, selection: "", flags: ALL, misspelled: "", suggestions: [], ...overrides };
}

// A compact shape for order assertions: suggestions by word, roles by name, Look Up by label, separators as "-".
function shape(items: readonly EditMenuItem[]): string[] {
  return items.map(item => item.kind === "suggestion" ? `suggest:${item.word}` : item.kind === "role" ? item.role : item.kind === "lookUp" ? item.label : "-");
}

describe("editMenuItems", () => {
  test("an editable field with no selection: Cut, Copy, Paste, then Select All", () => {
    expect(shape(editMenuItems(input()))).toEqual(["cut", "copy", "paste", "-", "selectAll"]);
  });

  // macOS order, read from NSTextView.menu(for:) on macOS 26.6.2: spelling, Look Up, then Cut/Copy/Paste.
  test("an editable field with a selected misspelled word: suggestions, Look Up, then the edit items", () => {
    const items = editMenuItems(input({ selection: "wrold", misspelled: "wrold", suggestions: ["world", "would"] }));
    expect(shape(items)).toEqual(["suggest:world", "suggest:would", "-", "Look Up “wrold”", "-", "cut", "copy", "paste", "-", "selectAll"]);
  });

  test("an editable field with a selection: Look Up first", () => {
    expect(shape(editMenuItems(input({ selection: "hello" })))).toEqual(["Look Up “hello”", "-", "cut", "copy", "paste", "-", "selectAll"]);
  });

  test("each role carries its flag", () => {
    for (const flag of ["canCut", "canCopy", "canPaste", "canSelectAll"] as const) {
      const items = editMenuItems(input({ flags: { ...ALL, [flag]: false } }));
      const roles = Object.fromEntries(items.flatMap(item => item.kind === "role" ? [[item.role, item.enabled]] : []));
      const role = { canCut: "cut", canCopy: "copy", canPaste: "paste", canSelectAll: "selectAll" }[flag];
      expect(roles, flag).toEqual({ cut: true, copy: true, paste: true, selectAll: true, [role]: false });
    }
  });

  test("a non-editable selection: Look Up and Copy only", () => {
    const items = editMenuItems(input({ editable: false, selection: "some thread text" }));
    expect(shape(items)).toEqual(["Look Up “some thread text”", "-", "copy"]);
    expect(items.at(-1)).toEqual({ kind: "role", role: "copy", enabled: true });
    expect(editMenuItems(input({ editable: false, selection: "x", flags: { ...ALL, canCopy: false } })).at(-1)).toEqual({ kind: "role", role: "copy", enabled: false });
  });

  test("non-editable text with no selection opens no menu", () => {
    expect(editMenuItems(input({ editable: false }))).toEqual([]);
  });

  test("a misspelled word in non-editable text gets no suggestions", () => {
    expect(shape(editMenuItems(input({ editable: false, selection: "wrold", misspelled: "wrold", suggestions: ["world"] })))).toEqual(["Look Up “wrold”", "-", "copy"]);
  });

  test("a password field: no suggestions and no Look Up; Cut and Copy follow the flags", () => {
    const items = editMenuItems(input({ password: true, selection: "secret", misspelled: "secret", suggestions: ["secrets"], flags: { ...ALL, canCut: false, canCopy: false } }));
    expect(shape(items)).toEqual(["cut", "copy", "paste", "-", "selectAll"]);
    expect(items.slice(0, 2)).toEqual([{ kind: "role", role: "cut", enabled: false }, { kind: "role", role: "copy", enabled: false }]);
    expect(editMenuItems(input({ password: true, selection: "secret" })).slice(0, 2)).toEqual([{ kind: "role", role: "cut", enabled: true }, { kind: "role", role: "copy", enabled: true }]);
  });

  test("a misspelled word with no suggestions adds no spelling section", () => {
    expect(shape(editMenuItems(input({ misspelled: "qzxv", suggestions: [] })))).toEqual(["cut", "copy", "paste", "-", "selectAll"]);
  });

  test("one suggestion, in Electron's order", () => {
    expect(shape(editMenuItems(input({ misspelled: "teh", suggestions: ["the"] })))).toEqual(["suggest:the", "-", "cut", "copy", "paste", "-", "selectAll"]);
    expect(shape(editMenuItems(input({ misspelled: "teh", suggestions: ["ten", "the", "tech"] }))).slice(0, 3)).toEqual(["suggest:ten", "suggest:the", "suggest:tech"]);
  });

  test("suggestions without a misspelled word are ignored", () => {
    expect(shape(editMenuItems(input({ suggestions: ["the"] })))[0]).toBe("cut");
  });

  test("a whitespace-only selection gets no Look Up", () => {
    expect(shape(editMenuItems(input({ selection: " \n\t " })))).toEqual(["cut", "copy", "paste", "-", "selectAll"]);
    expect(shape(editMenuItems(input({ editable: false, selection: "  " })))).toEqual(["copy"]);
  });

  test("separators never lead, trail or repeat", () => {
    const cases: Partial<EditMenuInput>[] = [
      {}, { selection: "a" }, { misspelled: "teh", suggestions: ["the"] }, { selection: "teh", misspelled: "teh", suggestions: ["the"] },
      { password: true, selection: "a", misspelled: "a", suggestions: ["b"] }, { editable: false, selection: "a" }, { editable: false, selection: " " },
    ];
    for (const overrides of cases) {
      const kinds = editMenuItems(input(overrides)).map(item => item.kind);
      expect(kinds[0], JSON.stringify(overrides)).not.toBe("separator");
      expect(kinds.at(-1), JSON.stringify(overrides)).not.toBe("separator");
      expect(kinds.some((kind, index) => kind === "separator" && kinds[index + 1] === "separator"), JSON.stringify(overrides)).toBe(false);
    }
  });

  test("a subframe (the canvas iframe) opens no menu", () => {
    expect(editMenuItems(input({ mainFrame: false, selection: "a", misspelled: "teh", suggestions: ["the"] }))).toEqual([]);
    expect(editMenuItems(input({ mainFrame: false, editable: false, selection: "a" }))).toEqual([]);
  });
});

describe("lookUpLabel", () => {
  test("quotes the selection", () => {
    expect(lookUpLabel("hello")).toBe("Look Up “hello”");
  });

  test("folds line breaks and runs of spaces, and trims", () => {
    expect(lookUpLabel("  one\n\ntwo \t three  ")).toBe("Look Up “one two three”");
  });

  test("cuts past 30 code points with an ellipsis", () => {
    expect(lookUpLabel("a".repeat(30))).toBe(`Look Up “${"a".repeat(30)}”`);
    expect(lookUpLabel("a".repeat(31))).toBe(`Look Up “${"a".repeat(30)}…”`);
  });

  test("counts and cuts by code point, never splitting a surrogate pair", () => {
    const emoji = "😀";
    expect(lookUpLabel(emoji.repeat(30))).toBe(`Look Up “${emoji.repeat(30)}”`);
    expect(lookUpLabel(`${"a".repeat(29)}${emoji}${emoji}`)).toBe(`Look Up “${"a".repeat(29)}${emoji}…”`);
  });

  test("folds before cutting", () => {
    expect(lookUpLabel(`${"a ".repeat(15)}\n\n\nb`)).toBe(`Look Up “${"a ".repeat(15)}…”`);
  });
});
