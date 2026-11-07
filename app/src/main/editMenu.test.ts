import { describe, expect, test, vi } from "vitest";
import { editMenuInput, editMenuItems, editMenuTemplate, fieldCheckScript, lookUpLabel, type ContextMenuParamsLike, type EditMenuInput, type EditMenuItem } from "./editMenu";

const ALL = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

function input(overrides: Partial<EditMenuInput> = {}): EditMenuInput {
  return { mainFrame: true, editable: true, password: false, selection: "", flags: ALL, misspelled: "", suggestions: [], point: { x: 40, y: 60 }, ...overrides };
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

describe("editMenuInput", () => {
  function params(overrides: Partial<ContextMenuParamsLike> = {}): ContextMenuParamsLike {
    return { frame: { parent: null }, isEditable: true, formControlType: "input-text", selectionText: "teh", editFlags: ALL, misspelledWord: "teh", dictionarySuggestions: ["the"], x: 40, y: 60, ...overrides };
  }

  test("copies Chromium's report into the rule input", () => {
    expect(editMenuInput(params())).toEqual({ mainFrame: true, editable: true, password: false, selection: "teh", flags: ALL, misspelled: "teh", suggestions: ["the"], point: { x: 40, y: 60 } });
  });

  test("only a password input counts as a password", () => {
    expect(editMenuInput(params({ formControlType: "input-password" })).password).toBe(true);
    for (const type of ["none", "text-area", "input-text", "input-url"]) expect(editMenuInput(params({ formControlType: type })).password, type).toBe(false);
  });

  // The canvas is a cross-site iframe: its frame has a parent.
  test("the main frame is the parentless frame; a subframe or a gone frame is not", () => {
    expect(editMenuInput(params({ frame: { parent: {} } })).mainFrame).toBe(false);
    expect(editMenuInput(params({ frame: null })).mainFrame).toBe(false);
    const disposed = { get parent(): unknown { throw new Error("Render frame was disposed before WebFrameMain could be accessed"); } };
    expect(editMenuInput(params({ frame: disposed })).mainFrame).toBe(false);
  });

  test("keeps only the four edit flags", () => {
    const flags = { ...ALL, canCut: false, canUndo: true, canRedo: true, canDelete: true, canEditRichly: true } as ContextMenuParamsLike["editFlags"];
    expect(editMenuInput(params({ editFlags: flags })).flags).toEqual({ ...ALL, canCut: false });
  });
});

describe("fieldCheckScript", () => {
  test("puts the two numbers into a fixed script", () => {
    const script = fieldCheckScript({ x: 12.5, y: 300 });
    expect(script).toContain("document.elementFromPoint(12.5, 300)");
    expect(script).toBe(fieldCheckScript({ x: 1, y: 2 })?.replace("elementFromPoint(1, 2)", "elementFromPoint(12.5, 300)"));
  });

  test("refuses non-finite coordinates", () => {
    for (const point of [{ x: Number.NaN, y: 1 }, { x: 1, y: Number.POSITIVE_INFINITY }, { x: "1); alert(1" as unknown as number, y: 1 }]) expect(fieldCheckScript(point), JSON.stringify(point)).toBeNull();
  });

  // The script itself, run against a minimal document: same element, a child of it, another field, and body.
  test("answers true only when focus is on or around the element at the point", () => {
    const run = (at: unknown, active: unknown) => {
      const body = { contains: () => true };
      const document = { body, documentElement: {}, activeElement: active, elementFromPoint: () => at };
      return new Function("document", `return ${fieldCheckScript({ x: 1, y: 2 })}`)(document) as boolean;
    };
    const field = { contains: (node: unknown) => node === chip }, chip = {}, other = { contains: () => false };
    expect(run(field, field)).toBe(true);
    expect(run(chip, field)).toBe(true);
    expect(run(field, other)).toBe(false);
    expect(run(null, field)).toBe(false);
    expect(run(field, null)).toBe(false);
  });
});

describe("editMenuTemplate", () => {
  function contents(answer: () => Promise<unknown> = async () => true) {
    const target = { destroyed: false, cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), replaceMisspelling: vi.fn(), showDefinitionForSelection: vi.fn(),
      isDestroyed: () => target.destroyed, executeJavaScript: vi.fn((_code: string) => answer()) };
    return target;
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  async function choose(template: ReturnType<typeof editMenuTemplate>, label: string) {
    const item = template.find(entry => "label" in entry && entry.label === label);
    if (!item || !("click" in item)) throw new Error(`no ${label}`);
    item.click();
    await flush();
  }
  const SPELLING = input({ selection: "teh", misspelled: "teh", suggestions: ["the"] });
  const ACTIONS = { Cut: "cut", Copy: "copy", Paste: "paste", "Select All": "selectAll" } as const;

  test("edit items are click items with macOS labels and Chromium's enablement", () => {
    const template = editMenuTemplate(input({ flags: { ...ALL, canCut: false, canCopy: false } }), contents());
    expect(template.map(entry => "label" in entry ? [entry.label, entry.enabled] : "-")).toEqual([["Cut", false], ["Copy", false], ["Paste", true], "-", ["Select All", true]]);
    expect(template.some(entry => "role" in entry)).toBe(false);
  });

  test("with focus still on the field, each item runs its command after the check at the menu's point", async () => {
    for (const [label, method] of Object.entries(ACTIONS)) {
      const target = contents();
      await choose(editMenuTemplate(input(), target), label);
      expect(target.executeJavaScript).toHaveBeenCalledExactlyOnceWith(fieldCheckScript({ x: 40, y: 60 }));
      expect(target[method], label).toHaveBeenCalledOnce();
    }
    const target = contents();
    await choose(editMenuTemplate(SPELLING, target), "the");
    expect(target.replaceMisspelling).toHaveBeenCalledExactlyOnceWith("the");
  });

  test("a false or failed check, or a page gone meanwhile, does nothing", async () => {
    const cases: [string, ReturnType<typeof contents>][] = [
      ["false", contents(async () => false)], ["not exactly true", contents(async () => "true")], ["rejected", contents(async () => { throw new Error("navigated"); })],
    ];
    for (const [name, target] of cases) {
      const template = editMenuTemplate(SPELLING, target);
      for (const label of ["the", ...Object.keys(ACTIONS)]) await choose(template, label);
      for (const method of ["replaceMisspelling", "cut", "copy", "paste", "selectAll"] as const) expect(target[method], `${name} ${method}`).not.toHaveBeenCalled();
    }
    // Destroyed after the check started: the answer comes back to a page that is no longer there.
    let answer: (value: unknown) => void = () => {};
    const late = contents(() => new Promise(resolve => { answer = resolve; }));
    const template = editMenuTemplate(SPELLING, late);
    const item = template.find(entry => "label" in entry && entry.label === "the");
    if (item && "click" in item) item.click();
    late.destroyed = true;
    answer(true);
    await flush();
    expect(late.replaceMisspelling).not.toHaveBeenCalled();
  });

  // Built while the page is alive, chosen after it is gone: the check belongs to the click, not to the build.
  test("a click after the page is gone does nothing and asks nothing", async () => {
    const target = contents();
    const template = editMenuTemplate(SPELLING, target);
    target.destroyed = true;
    for (const label of ["the", "Look Up “teh”", ...Object.keys(ACTIONS)]) await choose(template, label);
    expect(target.executeJavaScript).not.toHaveBeenCalled();
    for (const method of ["replaceMisspelling", "showDefinitionForSelection", "cut", "copy", "paste", "selectAll"] as const) expect(target[method], method).not.toHaveBeenCalled();
  });

  test("non-finite coordinates leave an editable menu's items inert", async () => {
    const target = contents();
    const template = editMenuTemplate({ ...SPELLING, point: { x: Number.NaN, y: 0 } }, target);
    for (const label of ["the", ...Object.keys(ACTIONS)]) await choose(template, label);
    expect(target.executeJavaScript).not.toHaveBeenCalled();
    expect(target.replaceMisspelling).not.toHaveBeenCalled();
    expect(target.paste).not.toHaveBeenCalled();
  });

  test("Look Up and a non-editable menu's Copy run without a check", async () => {
    const target = contents(async () => false);
    await choose(editMenuTemplate(SPELLING, target), "Look Up “teh”");
    await choose(editMenuTemplate(input({ editable: false, selection: "thread text" }), target), "Copy");
    expect(target.showDefinitionForSelection).toHaveBeenCalledOnce();
    expect(target.copy).toHaveBeenCalledOnce();
    expect(target.executeJavaScript).not.toHaveBeenCalled();
  });
});
