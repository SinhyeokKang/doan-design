import { describe, expect, test } from "vitest";
import { escapeStep, OPEN_OVERLAY, overlayOpen, toolShortcut, type ShortcutEvent } from "./canvasTool";
import { drawn, drawnDocument, NOTHING_OPEN, OPEN_SURFACES } from "./drawnTarget.test-support";

const press = (code: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent => ({ type: "keydown", code, key: "", repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...over });
const release = (code: string, over: Partial<ShortcutEvent> = {}) => press(code, { type: "keyup", ...over });
const onPage = { canvasPage: true };
const element = (tagName: string, attributes: Record<string, string> = {}) => ({ tagName, isContentEditable: false, getAttribute: (name: string) => attributes[name] ?? null, hasAttribute: (name: string) => name in attributes });

// PRODUCT §5 item 2 'Canvas header' and 'Following' share overlayOpen: tool keys ask it of the key's target,
// following and the star card of the document.
describe("overlayOpen", () => {
  test.each(OPEN_SURFACES)("is true while %s is open", (_, chain) => {
    expect(overlayOpen(drawnDocument(chain))).toBe(true);
  });

  test.each(NOTHING_OPEN)("is false with %s", (_, nodes) => {
    expect(overlayOpen(drawnDocument(nodes))).toBe(false);
  });

  test("every part of the rule is reached by a surface in the table, so the fake document understands each", () => {
    for (const part of OPEN_OVERLAY.split(",").map(item => item.trim())) {
      expect(OPEN_SURFACES.some(([, chain]) => drawnDocument(chain).querySelector(part) !== null), part).toBe(true);
    }
  });
});

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

  // PRODUCT §5 item 2 'Canvas header': on the canvas page an open menu or list keeps every printable key.
  test.each(OPEN_SURFACES)("ignores V, H and Space down from inside %s", (_, chain) => {
    for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(press(code, { target: drawn(chain) }), onPage), code).toBeNull();
    expect(toolShortcut(release("Space", { target: drawn(chain) }), onPage)).toEqual({ kind: "space", down: false });
  });

  test("a sidebar row that only has focus, with no menu open, keeps V and H", () => {
    const row = drawn([{ className: "shell-tree", role: "tree" }, { role: "treeitem" }]);
    expect(toolShortcut(press("KeyV", { target: row }), onPage)).toEqual({ kind: "tool", tool: "select" });
    expect(toolShortcut(press("KeyH", { target: row }), onPage)).toEqual({ kind: "tool", tool: "hand" });
  });

  test("releases Space on keyup whatever the target, modifiers or page", () => {
    const anywhere: Partial<ShortcutEvent>[] = [{ target: element("INPUT") }, { target: element("BUTTON") }, { metaKey: true }, { isComposing: true }, { defaultPrevented: true }, { repeat: true }];
    for (const over of anywhere) expect(toolShortcut(release("Space", over), onPage)).toEqual({ kind: "space", down: false });
    expect(toolShortcut(release("Space"), { canvasPage: false })).toEqual({ kind: "space", down: false });
  });
});

// PRODUCT §5 item 2 'Toolbar' and 'Zoom controller': ⇧2 zooms to the selection and ⇧Space plays the prototype, with the
// tool keys' rules; ⇧Space never pans.
describe("toolShortcut, Figma view keys", () => {
  test("takes ⇧2 by event.code whatever character the layout makes", () => {
    for (const key of ["@", "\"", "2"]) expect(toolShortcut(press("Digit2", { key, shiftKey: true }), onPage)).toEqual({ kind: "zoomSelection" });
  });

  test("takes ⇧Space as Play, never as a pan", () => {
    expect(toolShortcut(press("Space", { key: " ", shiftKey: true }), onPage)).toEqual({ kind: "play" });
  });

  test("ignores 2 without ⇧, and the numpad's 2", () => {
    expect(toolShortcut(press("Digit2", { key: "2" }), onPage)).toBeNull();
    expect(toolShortcut(press("Numpad2", { key: "2", shiftKey: true }), onPage)).toBeNull();
  });

  test.each([
    ["⌘", { metaKey: true }], ["⌃", { ctrlKey: true }], ["⌥", { altKey: true }],
    ["an IME composition", { isComposing: true }], ["keyCode 229", { keyCode: 229 }],
    ["a repeat", { repeat: true }], ["a handled key", { defaultPrevented: true }],
  ])("ignores ⇧2 and ⇧Space with %s", (_, over) => {
    for (const code of ["Digit2", "Space"]) expect(toolShortcut(press(code, { shiftKey: true, ...over }), onPage), code).toBeNull();
  });

  test("ignores ⇧2 and ⇧Space in an editable target and off the canvas page", () => {
    for (const target of [element("INPUT"), element("TEXTAREA"), element("SELECT"), { ...element("DIV"), isContentEditable: true }]) {
      for (const code of ["Digit2", "Space"]) expect(toolShortcut(press(code, { shiftKey: true, target }), onPage), code).toBeNull();
    }
    for (const code of ["Digit2", "Space"]) expect(toolShortcut(press(code, { shiftKey: true }), { canvasPage: false }), code).toBeNull();
  });

  test.each(OPEN_SURFACES)("ignores ⇧2 and ⇧Space from inside %s", (_, chain) => {
    for (const code of ["Digit2", "Space"]) expect(toolShortcut(press(code, { shiftKey: true, target: drawn(chain) }), onPage), code).toBeNull();
  });

  test("leaves ⇧Space to an interactive control, but not ⇧2", () => {
    for (const target of [element("BUTTON"), element("DIV", { role: "menuitem" })]) {
      expect(toolShortcut(press("Space", { shiftKey: true, target }), onPage)).toBeNull();
      expect(toolShortcut(press("Digit2", { shiftKey: true, target }), onPage)).toEqual({ kind: "zoomSelection" });
    }
  });

  test("a Space released with ⇧ held still ends a pan", () => {
    expect(toolShortcut(release("Space", { shiftKey: true }), onPage)).toEqual({ kind: "space", down: false });
  });
});

describe("escapeStep", () => {
  test("cancels a pick first, then turns Hand back to Select, then steps the selection back", () => {
    expect(escapeStep({ picking: true, capturing: false, hand: true, editable: false, canvasText: false })).toBe("cancelPick");
    expect(escapeStep({ picking: false, capturing: false, hand: true, editable: false, canvasText: false })).toBe("selectTool");
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: false, canvasText: false })).toBe("stepSelection");
  });

  test("in an editable target only cancels a pick", () => {
    expect(escapeStep({ picking: true, capturing: false, hand: true, editable: true, canvasText: false })).toBe("cancelPick");
    expect(escapeStep({ picking: false, capturing: false, hand: true, editable: true, canvasText: false })).toBeNull();
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: true, canvasText: false })).toBeNull();
  });

  // A canvas text range is cleared after Hand turns back to Select and before the selection steps back; a text field
  // keeps its own Esc.
  test("clears the canvas text before stepping the selection back, after a pick, capture mode and Hand", () => {
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: false, canvasText: true })).toBe("clearText");
    expect(escapeStep({ picking: false, capturing: false, hand: true, editable: false, canvasText: true })).toBe("selectTool");
    expect(escapeStep({ picking: true, capturing: false, hand: false, editable: false, canvasText: true })).toBe("cancelPick");
    expect(escapeStep({ picking: false, capturing: true, hand: false, editable: false, canvasText: true })).toBe("cancelCapture");
    expect(escapeStep({ picking: false, capturing: false, hand: false, editable: true, canvasText: true })).toBeNull();
  });

  test("ends capture mode before Hand and the selection, wherever focus is", () => {
    for (const hand of [true, false]) {
      for (const editable of [true, false]) expect(escapeStep({ picking: false, capturing: true, hand, editable, canvasText: false })).toBe("cancelCapture");
    }
  });
});
