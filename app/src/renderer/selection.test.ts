import { describe, expect, test } from "vitest";
import type { HoverMessage, LayoutMessage, SelectMessage, SelectTarget } from "./canvasMessage";
import { acceptSelectionMessage, anchorRequest, editableTarget, mainSelection, SELECTION_LOST, selectedFromLayout, selectionAfter, sizeLabel, type SelectionView } from "./selection";

const HREF = "http://127.0.0.1:4000/t/tok/key/design/a.html";
const rect = { x: 1, y: 2, width: 3, height: 4 };
const expected = { href: HREF, height: 150, seq: 5 };
const hover = (over: Partial<HoverMessage> = {}): HoverMessage => ({ type: "hover", href: HREF, seq: 5, viewport: 150, rect, ...over });
const view: SelectionView = {
  tag: "span",
  frame: { id: "hero", title: "Hero", implements: "app/src/renderer/App.tsx" },
  frameIndex: 1,
  element: { doanId: "cta", selector: '[data-doan-id="cta"]', html: "<span>x</span>", text: "x" },
  path: [{ label: "hero", selector: '[data-doan-frame="hero"]' }, { label: "cta", selector: '[data-doan-id="cta"]', doanId: "cta" }],
  interactive: "control",
};
const select = (over: Partial<SelectMessage> = {}): SelectMessage => ({ type: "select", href: HREF, seq: 5, viewport: 150, target: { rect, ...view } satisfies SelectTarget, ...over });
const layout = (over: Partial<LayoutMessage> = {}): LayoutMessage => ({ type: "layout", href: HREF, height: 900, viewport: 150, frames: [], truncated: false, seq: 5, selected: rect, ...over });

describe("acceptSelectionMessage", () => {
  test("drops anything from another document or before the first layout", () => {
    expect(acceptSelectionMessage(expected, hover({ href: "http://127.0.0.1:4000/t/tok/key/design/b.html" }))).toBe("drop");
    expect(acceptSelectionMessage({ ...expected, href: null }, select())).toBe("drop");
    expect(acceptSelectionMessage(expected, { type: "key", href: "http://127.0.0.1:4000/t/tok/key/design/b.html", seq: 5, viewport: 150, key: "Escape" })).toBe("drop");
  });

  test("treats a fragment change as the same document", () => {
    expect(acceptSelectionMessage(expected, hover({ href: `${HREF}#x` }))).toBe("apply");
  });

  test("drops a message older than the renderer's last command (a select after Esc)", () => {
    expect(acceptSelectionMessage(expected, select({ seq: 4 }))).toBe("drop");
    expect(acceptSelectionMessage(expected, hover({ seq: 4 }))).toBe("drop");
    expect(acceptSelectionMessage(expected, { type: "clear", href: HREF, seq: 4, viewport: 150 })).toBe("drop");
  });

  test("takes the current seq and a newer one from a human click", () => {
    expect(acceptSelectionMessage(expected, select())).toBe("apply");
    expect(acceptSelectionMessage(expected, select({ seq: 6 }))).toBe("apply");
  });

  test("drops a hover but keeps a select without its rect when measured at another viewport", () => {
    expect(acceptSelectionMessage(expected, hover({ viewport: 152 }))).toBe("drop");
    expect(acceptSelectionMessage(expected, hover({ viewport: 151 }))).toBe("apply");
    expect(acceptSelectionMessage(expected, select({ viewport: 900 }))).toBe("applyWithoutRect");
    expect(acceptSelectionMessage(expected, select({ viewport: 900, target: null }))).toBe("apply");
  });

  test("never drops a clear for its viewport or a key for its seq or viewport", () => {
    expect(acceptSelectionMessage(expected, { type: "clear", href: HREF, seq: 6, viewport: 900 })).toBe("apply");
    expect(acceptSelectionMessage(expected, { type: "key", href: HREF, seq: 0, viewport: 900, key: "Escape" })).toBe("apply");
  });
});

describe("selectedFromLayout", () => {
  test("ignores a layout without a selection", () => {
    const { seq: _seq, selected: _selected, ...plain } = layout();
    expect(selectedFromLayout(expected, plain)).toBeUndefined();
  });

  test("ignores a selected rect sent before the renderer's last command (Esc then a late layout)", () => {
    expect(selectedFromLayout(expected, layout({ seq: 4 }))).toBeUndefined();
    expect(selectedFromLayout(expected, layout({ seq: 4, selected: null }))).toBeUndefined();
  });

  test("reports a lost element as null whatever the viewport", () => {
    expect(selectedFromLayout(expected, layout({ selected: null, viewport: 900 }))).toBeNull();
  });

  test("returns the rect only when measured at the current iframe height", () => {
    expect(selectedFromLayout(expected, layout())).toEqual(rect);
    expect(selectedFromLayout(expected, layout({ viewport: 152 }))).toBeUndefined();
  });
});

// design.md flow 7. Window hiding never reaches the renderer (the selection
// simply stays), and a renderer reload or crash is main's to clear.
describe("selectionAfter", () => {
  test("a reload keeps the selection and hides the mark until the anchor answer", () => {
    expect(selectionAfter({ kind: "reload" })).toEqual({ keep: true, mark: false, notice: false });
  });

  test("a lost anchor clears with the notice", () => {
    expect(selectionAfter({ kind: "anchorLost" })).toEqual({ keep: false, mark: false, notice: true });
  });

  test("a failed load, an unlisted document, another canvas or a closed canvas clears", () => {
    for (const kind of ["loadFailed", "unlisted", "otherCanvas"] as const) expect(selectionAfter({ kind })).toEqual({ keep: false, mark: false, notice: false });
    expect(selectionAfter({ kind: "clear", reason: "missing" })).toEqual({ keep: false, mark: false, notice: false });
  });

  test("a closed, missing or uninitialized project clears", () => {
    for (const reason of ["closed", "notFound", "uninitialized"] as const) expect(selectionAfter({ kind: "clear", reason })).toEqual({ keep: false, mark: false, notice: false });
  });

  test("a transient error line, a resize or nothing keeps everything", () => {
    expect(selectionAfter({ kind: "errorLine" })).toEqual({ keep: true, mark: true, notice: false });
    expect(selectionAfter({ kind: "none" })).toEqual({ keep: true, mark: true, notice: false });
    expect(selectionAfter({ kind: "resize" })).toEqual({ keep: true, mark: true, notice: false });
  });

  test("the notice text is the design's", () => {
    expect(SELECTION_LOST).toBe("The selection is no longer in the canvas.");
  });
});

describe("mainSelection", () => {
  const open = { folder: "/repo", canvas: "design/a.html", row: { id: "a" } };

  test("takes root and canvas from renderer state and only schema fields from the canvas", () => {
    expect(mainSelection(open, view)).toEqual({
      root: "/repo",
      canvas: { path: "design/a.html", id: "a" },
      frame: { id: "hero", title: "Hero" },
      element: { doanId: "cta", selector: '[data-doan-id="cta"]', html: "<span>x</span>", text: "x" },
    });
  });

  test("leaves out a missing canvas id, frame or element", () => {
    const { element: _element, ...frameOnly } = view;
    expect(mainSelection({ ...open, row: {} }, frameOnly)).toEqual({ root: "/repo", canvas: { path: "design/a.html" }, frame: { id: "hero", title: "Hero" } });
    const { frame: _frame, frameIndex: _index, ...elementOnly } = view;
    expect(mainSelection({ ...open, row: { id: "" } }, elementOnly)).toEqual({ root: "/repo", canvas: { path: "design/a.html" }, element: view.element });
  });
});

describe("anchorRequest", () => {
  test("names an element by its doanId and selector", () => {
    expect(anchorRequest(view)).toEqual({ doanId: "cta", selector: '[data-doan-id="cta"]' });
  });

  test("names a frame by its id and its own path selector", () => {
    const { element: _element, ...frameOnly } = view;
    expect(anchorRequest({ ...frameOnly, path: [{ label: "hero", selector: "body > section:nth-of-type(2)" }] })).toEqual({ frame: "hero", selector: "body > section:nth-of-type(2)" });
  });
});

describe("sizeLabel", () => {
  test("shows canvas px, rounded to two decimals", () => {
    expect(sizeLabel({ x: 0, y: 0, width: 252, height: 32 })).toBe("252 × 32");
    expect(sizeLabel({ x: 0, y: 0, width: 60.5, height: 18.333333 })).toBe("60.5 × 18.33");
  });
});

describe("editableTarget", () => {
  test("is true for text inputs and contenteditable only", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(editableTarget({ tagName, isContentEditable: false })).toBe(true);
    expect(editableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(editableTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(editableTarget(null)).toBe(false);
    expect(editableTarget({})).toBe(false);
  });
});
