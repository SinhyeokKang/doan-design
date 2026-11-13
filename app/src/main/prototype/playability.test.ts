import { describe, expect, test } from "vitest";
import { PLAY_REASONS, markedForPrototype, playability, type PlayInput } from "./playability";

const frames = [
  { id: "phone", prototype: "390x844" },
  { id: "plain" },
  { id: "bad", prototype: "390" },
  { id: "dup", prototype: "390x844" },
  { id: "dup", prototype: "390x844" },
  { id: "", prototype: "390x844" },
];

function input(patch: Partial<PlayInput>): PlayInput {
  return { tool: "select", picking: false, capturing: false, selection: { kind: "frame", id: "phone" }, frames, ...patch };
}

describe("reason copy", () => {
  test("matches the confirmed draft", () => {
    expect(PLAY_REASONS).toEqual({
      element: "Select the frame itself to play its prototype.",
      unmarked: "This frame is not marked for prototyping.",
      none: "Select a supported frame to play its prototype.",
      tool: "Switch to Select and choose a supported frame.",
    });
  });
});

describe("playability", () => {
  test("a supported frame itself selected in Select plays", () => {
    expect(playability(input({}))).toEqual({ enabled: true });
  });

  test("an element never plays, even inside a supported frame", () => {
    expect(playability(input({ selection: { kind: "element" } }))).toEqual({ enabled: false, reason: PLAY_REASONS.element });
  });

  test("no selection names what to select", () => {
    expect(playability(input({ selection: { kind: "none" } }))).toEqual({ enabled: false, reason: PLAY_REASONS.none });
  });

  test("a frame without a mark or with an invalid one is not marked", () => {
    for (const id of ["plain", "bad"]) expect(playability(input({ selection: { kind: "frame", id } }))).toEqual({ enabled: false, reason: PLAY_REASONS.unmarked });
  });

  test("a frame whose id is duplicated, empty or not in the live layout cannot play", () => {
    for (const id of ["dup", "", "ghost"]) expect(playability(input({ selection: { kind: "frame", id } }))).toEqual({ enabled: false, reason: PLAY_REASONS.none });
  });

  test("Hand, a pick and capture mode refuse first, whatever is selected", () => {
    for (const patch of [{ tool: "hand" as const }, { picking: true }, { capturing: true }]) {
      for (const selection of [{ kind: "frame" as const, id: "phone" }, { kind: "element" as const }, { kind: "none" as const }]) {
        expect(playability(input({ ...patch, selection }))).toEqual({ enabled: false, reason: PLAY_REASONS.tool });
      }
    }
  });

  test("an empty layout plays nothing", () => {
    expect(playability(input({ frames: [] }))).toEqual({ enabled: false, reason: PLAY_REASONS.none });
  });
});

describe("markedForPrototype (the frame drawer's Prototype meta)", () => {
  test("only a unique, non-empty id with a valid mark", () => {
    expect(markedForPrototype("phone", frames)).toBe(true);
    for (const id of ["plain", "bad", "dup", "", "ghost"]) expect(markedForPrototype(id, frames)).toBe(false);
  });
});
