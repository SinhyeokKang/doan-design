import { describe, expect, test } from "vitest";
import { escapeStep, toolShortcut, type ShortcutEvent } from "./canvasTool";

// canvas-hand-tool design '키': V, H and Space by key position, filtered before the canvas takes them.
const press = (code: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent => ({ type: "keydown", code, key: "", repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
const release = (code: string, over: Partial<ShortcutEvent> = {}) => press(code, { type: "keyup", ...over });
const onPage = { canvasPage: true };
const element = (tagName: string, attributes: Record<string, string> = {}) => ({ tagName, isContentEditable: false, getAttribute: (name: string) => attributes[name] ?? null, hasAttribute: (name: string) => name in attributes });

describe("toolShortcut", () => {
  test("takes V, H and Space by event.code, also when a Korean layout reports ㅍ and ㅗ", () => {
    expect(toolShortcut(press("KeyV", { key: "v" }), onPage)).toEqual({ kind: "tool", tool: "select" });
    expect(toolShortcut(press("KeyH", { key: "h" }), onPage)).toEqual({ kind: "tool", tool: "hand" });
    expect(toolShortcut(press("KeyV", { key: "ㅍ" }), onPage)).toEqual({ kind: "tool", tool: "select" });
    expect(toolShortcut(press("KeyH", { key: "ㅗ" }), onPage)).toEqual({ kind: "tool", tool: "hand" });
    expect(toolShortcut(press("Space", { key: " " }), onPage)).toEqual({ kind: "space", down: true });
    expect(toolShortcut(release("Space", { key: " " }), onPage)).toEqual({ kind: "space", down: false });
    // Shift alone changes nothing: a capital V is still the select tool.
    expect(toolShortcut(press("KeyV", { key: "V", shiftKey: true }), onPage)).toEqual({ kind: "tool", tool: "select" });
  });

  test("ignores other keys and a key that only reports the letter", () => {
    expect(toolShortcut(press("KeyB", { key: "v" }), onPage)).toBeNull();
    expect(toolShortcut(press("KeyX"), onPage)).toBeNull();
    expect(toolShortcut(press("Enter"), onPage)).toBeNull();
    expect(toolShortcut(release("KeyV"), onPage)).toBeNull();
    expect(toolShortcut(release("KeyH"), onPage)).toBeNull();
  });

  test.each([
    ["⌘", { metaKey: true }], ["⌃", { ctrlKey: true }], ["⌥", { altKey: true }],
    ["an IME composition", { isComposing: true }], ["keyCode 229", { keyCode: 229 }],
    ["a repeat", { repeat: true }], ["a handled key", { defaultPrevented: true }],
  ])("ignores V, H and Space down with %s", (_, over) => {
    for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(press(code, over), onPage)).toBeNull();
  });

  test("ignores V, H and Space down in an editable target", () => {
    for (const target of [element("INPUT"), element("TEXTAREA"), element("SELECT"), { ...element("DIV"), isContentEditable: true }]) {
      for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(press(code, { target }), onPage)).toBeNull();
    }
  });

  test("ignores V, H and Space down off the canvas page", () => {
    for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(press(code), { canvasPage: false })).toBeNull();
  });

  test("leaves Space to an interactive control, but not V and H", () => {
    const controls = [element("BUTTON"), element("A", { href: "#" }), ...["button", "menuitem", "treeitem", "option", "tab", "switch", "checkbox", "radio", "combobox"].map(role => element("DIV", { role }))];
    for (const target of controls) {
      expect(toolShortcut(press("Space", { target }), onPage)).toBeNull();
      expect(toolShortcut(press("KeyH", { target }), onPage)).toEqual({ kind: "tool", tool: "hand" });
    }
  });

  test("takes Space on the canvas area, the body and an anchor without href", () => {
    for (const target of [element("SECTION", { role: "region" }), element("BODY"), element("A"), null]) {
      expect(toolShortcut(press("Space", { target }), onPage)).toEqual({ kind: "space", down: true });
    }
  });

  test("releases Space on keyup whatever the target, modifiers or page", () => {
    const anywhere: Partial<ShortcutEvent>[] = [{ target: element("INPUT") }, { target: element("BUTTON") }, { metaKey: true }, { isComposing: true }, { defaultPrevented: true }, { repeat: true }];
    for (const over of anywhere) expect(toolShortcut(release("Space", over), onPage)).toEqual({ kind: "space", down: false });
    expect(toolShortcut(release("Space"), { canvasPage: false })).toEqual({ kind: "space", down: false });
  });
});

describe("escapeStep", () => {
  test("cancels a pick first, then turns Hand back to Select, then clears the selection", () => {
    expect(escapeStep({ picking: true, capturing: false, hand: true, editable: false })).toBe("cancelPick");
    expect(escapeStep({ picking: false, capturing: false, hand: true, editable: false })).toBe("selectTool");
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: false })).toBe("clearSelection");
  });

  test("in an editable target only cancels a pick", () => {
    expect(escapeStep({ picking: true, capturing: false, hand: true, editable: true })).toBe("cancelPick");
    expect(escapeStep({ picking: false, capturing: false, hand: true, editable: true })).toBeNull();
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: true })).toBeNull();
  });

  // canvas-capture design '순수 함수' 3: capture mode ends at the pick's step, ahead of Hand and the selection.
  test("ends capture mode before Hand and the selection, wherever focus is", () => {
    for (const hand of [true, false]) {
      for (const editable of [true, false]) expect(escapeStep({ picking: false, capturing: true, hand, editable })).toBe("cancelCapture");
    }
  });
});
