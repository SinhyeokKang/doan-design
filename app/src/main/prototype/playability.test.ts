import { describe, expect, test } from "vitest";
import { PLAY_REASONS, markedForPrototype, playability, type PlayFrame, type PlayInput, type PlaySelection } from "./playability";

const long = "x".repeat(200);
// Indexes as the board lists them: parents always come earlier.
const frames: PlayFrame[] = [
  { id: "checkout", prototype: "390x844" }, // 0
  { id: "form", parent: 0 }, // 1: unmarked, inside checkout
  { id: "card", prototype: "390x844", parent: 1 }, // 2: playable, inside form
  { id: "plain" }, // 3: unmarked, no playable frame around it
  { id: "gift", prototype: "390" }, // 4: invalid mark
  { id: "dup", prototype: "390x844" }, // 5: shared id
  { id: "dup", prototype: "390x844" }, // 6
  { id: long, cut: true }, // 7: id cut at 200, so the board sent no mark
  { id: "badinside", prototype: "nope", parent: 0 }, // 8: invalid mark inside checkout
  { id: "", prototype: "390x844" }, // 9: empty id
  { id: long, prototype: "390x844" }, // 10: a genuine 200-unit id; the cut one at 7 does not share it
  { id: "cutmarked", prototype: "390x844", cut: true }, // 11: a cut frame that still carries a mark
];

const frame = (index: number): PlaySelection => ({ kind: "frame", id: frames[index]!.id, index });
const element = (index: number): PlaySelection => ({ kind: "element", id: frames[index]!.id, index });

function input(patch: Partial<PlayInput>): PlayInput {
  return { shown: true, picking: false, capturing: false, selection: frame(0), frames, ...patch };
}

describe("reason copy", () => {
  test("matches the confirmed draft", () => {
    expect(PLAY_REASONS).toEqual({
      unavailable: "Play isn’t available while the canvas can’t be shown.",
      picking: "Finish picking from the canvas first.",
      capturing: "Finish the capture first.",
      none: "No frames in this canvas are marked for prototyping.",
    });
  });
});

describe("playability, judged from the top row down", () => {
  test("a canvas that is not shown or still reading comes first", () => {
    for (const patch of [{}, { picking: true }, { capturing: true }, { frames: [] }]) {
      expect(playability(input({ ...patch, shown: false }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.unavailable });
    }
  });

  test("a pick, then capture, come before the canvas's frames", () => {
    expect(playability(input({ picking: true, frames: [] }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.picking });
    expect(playability(input({ capturing: true, frames: [] }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.capturing });
    for (const selection of [frame(0), element(0), { kind: "none" as const }]) {
      expect(playability(input({ picking: true, selection }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.picking });
      expect(playability(input({ capturing: true, selection }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.capturing });
    }
  });

  test("a canvas with no playable frame says so, whatever is selected", () => {
    const unplayable = [frames[3]!, frames[4]!, frames[5]!, frames[6]!, frames[7]!, frames[9]!, frames[11]!];
    for (const selection of [{ kind: "frame" as const, id: "gift", index: 1 }, { kind: "none" as const }]) {
      expect(playability(input({ frames: unplayable, selection }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.none });
    }
    expect(playability(input({ frames: [], selection: { kind: "none" } }))).toEqual({ kind: "disabled", reason: PLAY_REASONS.none });
  });

  test("a playable frame selected as itself plays", () => {
    expect(playability(input({ selection: frame(0) }))).toEqual({ kind: "play", frame: 0 });
    expect(playability(input({ selection: frame(2) }))).toEqual({ kind: "play", frame: 2 });
    expect(playability(input({ selection: frame(10) }))).toEqual({ kind: "play", frame: 10 });
  });

  test("an element plays the innermost playable frame around it, its own frame first", () => {
    expect(playability(input({ selection: element(0) }))).toEqual({ kind: "play", frame: 0 });
    expect(playability(input({ selection: element(2) }))).toEqual({ kind: "play", frame: 2 });
    expect(playability(input({ selection: element(1) }))).toEqual({ kind: "play", frame: 0 });
  });

  test("an element whose own frame cannot play skips it for the playable frame around it", () => {
    expect(playability(input({ selection: element(8) }))).toEqual({ kind: "play", frame: 0 });
  });

  test("an unmarked frame plays the innermost playable frame around it", () => {
    expect(playability(input({ selection: frame(1) }))).toEqual({ kind: "play", frame: 0 });
  });

  test("nothing selected, or nothing playable around the selection, opens the drawer", () => {
    expect(playability(input({ selection: { kind: "none" } }))).toEqual({ kind: "drawer" });
    expect(playability(input({ selection: frame(3) }))).toEqual({ kind: "drawer" });
    expect(playability(input({ selection: element(3) }))).toEqual({ kind: "drawer" });
  });

  test("a selected frame with a mark that cannot play opens the drawer naming it", () => {
    // An invalid mark, a shared id, and a cut id that still came with a mark.
    for (const index of [4, 5, 6, 11]) expect(playability(input({ selection: frame(index) }))).toEqual({ kind: "drawer", broken: index });
  });

  test("a broken frame inside a playable one still opens the drawer: only an unmarked frame plays around itself", () => {
    expect(playability(input({ selection: frame(8) }))).toEqual({ kind: "drawer", broken: 8 });
  });

  test("a frame without a mark is never named broken", () => {
    for (const index of [3, 7]) expect(playability(input({ selection: frame(index) }))).toEqual({ kind: "drawer" });
  });

  test("a frame with an empty id cannot play and is not named broken", () => {
    expect(playability(input({ selection: frame(9) }))).toEqual({ kind: "drawer" });
  });

  test("a cut id never shares the genuine 200-unit id, so that frame plays", () => {
    expect(playability(input({ selection: element(10) }))).toEqual({ kind: "play", frame: 10 });
  });

  test("a frame past the 1,000th has no index and opens the drawer", () => {
    expect(playability(input({ selection: { kind: "frame", id: "late" } }))).toEqual({ kind: "drawer" });
    expect(playability(input({ selection: { kind: "element", id: "late" } }))).toEqual({ kind: "drawer" });
  });

  test("an index the live layout no longer holds for that frame opens the drawer", () => {
    expect(playability(input({ selection: { kind: "frame", id: "checkout", index: 3 } }))).toEqual({ kind: "drawer" });
    expect(playability(input({ selection: { kind: "element", id: "checkout", index: 99 } }))).toEqual({ kind: "drawer" });
  });

  test("a parent that does not come earlier is not followed", () => {
    const looped: PlayFrame[] = [{ id: "a", prototype: "390x844" }, { id: "b", parent: 2 }, { id: "c", parent: 1 }];
    expect(playability(input({ frames: looped, selection: { kind: "element", id: "b", index: 1 } }))).toEqual({ kind: "drawer" });
  });
});

describe("markedForPrototype (the frame drawer's Prototype meta)", () => {
  test("only a unique, non-empty id with a valid mark", () => {
    const meta = [{ id: "phone", prototype: "390x844" }, { id: "plain" }, { id: "bad", prototype: "390" }, { id: "dup", prototype: "390x844" }, { id: "dup", prototype: "390x844" }, { id: "", prototype: "390x844" }];
    expect(markedForPrototype("phone", meta)).toBe(true);
    for (const id of ["plain", "bad", "dup", "", "ghost"]) expect(markedForPrototype(id, meta)).toBe(false);
  });
});
