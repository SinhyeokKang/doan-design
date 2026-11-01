import { describe, expect, test } from "vitest";
import { frameDrawerView, renderedBoard, TRUNCATED_NOTE, type BoardState } from "./frameDrawer";

const frame = (id: string, title?: string) => ({ id, ...(title === undefined ? {} : { title }), x: 0, y: 0, width: 100, height: 100 });

const board = (patch: Partial<BoardState> = {}): BoardState => ({
  layout: { frames: [frame("a", "Home"), frame("b", "Payment"), frame("c")], truncated: false },
  currentFrame: 1,
  status: null,
  unlisted: false,
  ...patch,
});

describe("renderedBoard", () => {
  test("is true only for a laid-out, listed canvas with no status", () => {
    expect(renderedBoard(board())).toBe(true);
    expect(renderedBoard(board({ layout: { frames: [], truncated: false } }))).toBe(true);
  });

  test("is false while loading, failed, without width, missing, empty, unlisted or not yet laid out", () => {
    for (const status of ["loading", "failed", "noWidth", "missing", "empty"] as const) {
      expect(renderedBoard(board({ status }))).toBe(false);
    }
    expect(renderedBoard(board({ unlisted: true }))).toBe(false);
    expect(renderedBoard(board({ layout: null }))).toBe(false);
  });
});

describe("frameDrawerView", () => {
  test("shows the frame being viewed as 'number. name' and lists every frame in document order", () => {
    const view = frameDrawerView(board());
    expect(view.enabled).toBe(true);
    expect(view.buttonLabel).toBe("2. Payment");
    expect(view.ariaLabel).toBe("Frame 2: Payment");
    expect(view.rows.map(row => [row.index, row.number, row.name, row.current])).toEqual([
      [0, 1, "Home", false],
      [1, 2, "Payment", true],
      [2, 3, "c", false],
    ]);
    expect(view.truncatedNote).toBeNull();
  });

  test("one frame", () => {
    const view = frameDrawerView(board({ layout: { frames: [frame("only", "Landing")], truncated: false }, currentFrame: 0 }));
    expect(view.buttonLabel).toBe("1. Landing");
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.current).toBe(true);
  });

  test("a canvas with no frames disables the drawer as 'No frames'", () => {
    const view = frameDrawerView(board({ layout: { frames: [], truncated: false }, currentFrame: null }));
    expect(view).toMatchObject({ enabled: false, buttonLabel: "No frames", ariaLabel: "No frames", rows: [], truncatedNote: null });
  });

  test("with frames but none being viewed the drawer stays enabled as 'Frames' and no row is current", () => {
    const view = frameDrawerView(board({ currentFrame: null }));
    expect(view).toMatchObject({ enabled: true, buttonLabel: "Frames", ariaLabel: "Frames" });
    expect(view.rows.some(row => row.current)).toBe(false);
  });

  test("a current index outside the list (a stale index after a reload) is no current frame", () => {
    for (const currentFrame of [3, 99, -1]) {
      const view = frameDrawerView(board({ currentFrame }));
      expect(view.buttonLabel).toBe("Frames");
      expect(view.rows.some(row => row.current)).toBe(false);
    }
  });

  test("a frame without a title is named by its id, an empty id by '(no id)'", () => {
    const view = frameDrawerView(board({ layout: { frames: [frame("hero"), frame(""), frame("x", "")], truncated: false }, currentFrame: 1 }));
    expect(view.rows.map(row => row.name)).toEqual(["hero", "(no id)", "x"]);
    expect(view.buttonLabel).toBe("2. (no id)");
    expect(view.ariaLabel).toBe("Frame 2: (no id)");
  });

  test("a row keeps its frame id so a pick can be resolved by id after a reload", () => {
    const view = frameDrawerView(board({ layout: { frames: [frame("a", "Home"), frame("", "Blank")], truncated: false } }));
    expect(view.rows.map(row => row.id)).toEqual(["a", ""]);
  });

  test("duplicate ids get distinct row keys, stable for the same layout and equal to the id when unique", () => {
    const frames = [frame("dup", "One"), frame("solo", "Two"), frame("dup", "Three"), frame("dup", "Four"), frame("dup#2", "Five")];
    const keys = frameDrawerView(board({ layout: { frames, truncated: false } })).rows.map(row => row.key);
    expect(new Set(keys).size).toBe(frames.length);
    expect(keys[0]).toBe("dup");
    expect(keys[1]).toBe("solo");
    expect(frameDrawerView(board({ layout: { frames, truncated: false } })).rows.map(row => row.key)).toEqual(keys);
  });

  const keysOf = (ids: string[]) => frameDrawerView(board({ layout: { frames: ids.map(id => frame(id)), truncated: false } })).rows.map(row => row.key);

  test("a generated duplicate key never takes a real id's key: removing a duplicate keeps the unique frame's key", () => {
    const before = keysOf(["a", "a", "a#2"]);
    const after = keysOf(["a", "a#2"]);
    expect(new Set(before).size).toBe(3);
    expect(before[2]).toBe(after[1]);
    // The unique frame's key is its own id, so no duplicate's key can be mistaken for it.
    expect(after).toEqual(["a", "a#2"]);
    expect(before[1]).not.toBe("a#2");
  });

  test("a unique frame keeps its key when frames around it are reordered, duplicated or removed", () => {
    const layouts = [["a", "a", "a#2", "a#2"], ["a#2", "a", "a"], ["a#2"], ["a", "a#2", "a", "a#3", "a#2"]];
    const uniqueKeys = layouts.map(ids => keysOf(ids)[ids.indexOf("a#2")]);
    expect(new Set(uniqueKeys)).toEqual(new Set(["a#2"]));
  });

  test("a generated key never equals any raw id in the layout, wherever that id sits", () => {
    const ids = ["x", "x", "x#2", "x#2_", "x"];
    const keys = keysOf(ids);
    expect(new Set(keys).size).toBe(ids.length);
    const rawKeys = new Set(ids);
    for (const [i, key] of keys.entries()) if (ids.indexOf(ids[i]!) !== i) expect(rawKeys.has(key)).toBe(false);
  });

  test("a unique id keeps its key when frames before it are added or removed", () => {
    const a = frameDrawerView(board({ layout: { frames: [frame("x"), frame("target")], truncated: false } })).rows[1];
    const b = frameDrawerView(board({ layout: { frames: [frame("target")], truncated: false } })).rows[0];
    expect(a?.key).toBe(b?.key);
  });

  test("a canvas past the 1,000-frame cap shows the nearest listed frame and the end-of-list note", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => frame(`f${i}`, `Frame ${i}`));
    const view = frameDrawerView(board({ layout: { frames, truncated: true }, currentFrame: 999 }));
    expect(view.buttonLabel).toBe("1000. Frame 999");
    expect(view.rows).toHaveLength(1000);
    expect(view.truncatedNote).toBe("Showing the first 1,000 frames. Search all with Quick Open (⌘K).");
    expect(TRUNCATED_NOTE).toBe(view.truncatedNote);
  });

  test("a note appears only when the list is truncated", () => {
    expect(frameDrawerView(board()).truncatedNote).toBeNull();
    expect(frameDrawerView(board({ layout: { frames: [frame("a")], truncated: true } })).truncatedNote).toBe(TRUNCATED_NOTE);
  });

  test("the five states with no rendered board disable the drawer as 'Frames' and list nothing", () => {
    const states: Partial<BoardState>[] = [
      { status: "loading" },
      { status: "failed" },
      { status: "noWidth" },
      { unlisted: true },
      // A project problem or an unlisted page has no layout at all.
      { layout: null, status: "empty" },
    ];
    for (const patch of states) {
      expect(frameDrawerView(board(patch))).toEqual({ enabled: false, buttonLabel: "Frames", ariaLabel: "Frames", rows: [], truncatedNote: null });
    }
  });

  test("no rendered board never reads a stale layout, even a truncated one", () => {
    const view = frameDrawerView(board({ status: "failed", layout: { frames: [frame("a")], truncated: true } }));
    expect(view.rows).toEqual([]);
    expect(view.truncatedNote).toBeNull();
  });

  test("a reload keeps the previous layout open (status stays null)", () => {
    const view = frameDrawerView(board({ status: null }));
    expect(view.enabled).toBe(true);
    expect(view.rows).toHaveLength(3);
  });
});
