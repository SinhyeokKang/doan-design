import { describe, expect, test } from "vitest";
import { sizeBubblePlace } from "./sizeBubble";

const bubble = { height: 24, gap: 5 };
// A 668px canvas area whose floating tools start at 600.
const room = { top: 0, bottom: 592 };

describe("sizeBubblePlace", () => {
  test("hangs below the selection whenever it fits above the tools", () => {
    expect(sizeBubblePlace({ y: 100, height: 200 }, bubble, room)).toEqual({ kind: "below" });
    expect(sizeBubblePlace({ y: 100, height: 463 }, bubble, room)).toEqual({ kind: "below" });
  });

  test("flips above when the bubble below would sit under the tools or past the area", () => {
    // A 568px frame moved to from the drawer and read from its top at y 80: its bubble would be at 653.
    expect(sizeBubblePlace({ y: 80, height: 568 }, bubble, room)).toEqual({ kind: "above" });
    expect(sizeBubblePlace({ y: 100, height: 464 }, bubble, room)).toEqual({ kind: "above" });
  });

  test("with no room above either, holds it just above the tools over the selection", () => {
    expect(sizeBubblePlace({ y: 10, height: 900 }, bubble, room)).toEqual({ kind: "inside", top: 568 });
    expect(sizeBubblePlace({ y: -300, height: 880 }, bubble, room)).toEqual({ kind: "inside", top: 568 });
    // A selection scrolled up whose bottom is in view still hangs below it.
    expect(sizeBubblePlace({ y: -300, height: 800 }, bubble, room)).toEqual({ kind: "below" });
  });

  test("a selection off screen keeps the bubble below it", () => {
    expect(sizeBubblePlace({ y: 700, height: 100 }, bubble, room)).toEqual({ kind: "below" });
    expect(sizeBubblePlace({ y: -400, height: 100 }, bubble, room)).toEqual({ kind: "below" });
  });

  test("an area too short for the bubble keeps it below", () => {
    expect(sizeBubblePlace({ y: 0, height: 100 }, bubble, { top: 0, bottom: 20 })).toEqual({ kind: "below" });
  });
});
