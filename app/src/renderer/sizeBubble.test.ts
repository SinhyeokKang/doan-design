import { describe, expect, test } from "vitest";
import { canvasBubbleRoom, SIZE_BUBBLE, sizeBubblePlace } from "./sizeBubble";

// The selection line lies 1.5px outside the selection's rect, and the bubble hangs 5px from that line's outer edge.
const LINE = 1.5;
const bubble = SIZE_BUBBLE;
// A 668px canvas area whose floating tools start at 600.
const room = { top: 0, bottom: 592 };

describe("sizeBubblePlace", () => {
  test("the gap is the 1.5px line plus 5px from its outer edge, under a 24px bubble", () => {
    expect(SIZE_BUBBLE).toEqual({ height: 24, gap: LINE + 5 });
  });

  test("hangs below the selection whenever it fits above the tools", () => {
    expect(sizeBubblePlace({ y: 100, height: 200 }, bubble, room)).toEqual({ kind: "below" });
    // The line's outer edge at 563, the bubble 5px under it from 568 to the band's 592.
    expect(sizeBubblePlace({ y: 100, height: 461.5 }, bubble, room)).toEqual({ kind: "below" });
  });

  test("flips above when the bubble below would sit under the tools or past the area", () => {
    // A 568px frame moved to from the drawer and read from its top at y 80: its bubble would be at 654.5.
    expect(sizeBubblePlace({ y: 80, height: 568 }, bubble, room)).toEqual({ kind: "above" });
    // Half a pixel more and the bubble below would end at 592.5.
    expect(sizeBubblePlace({ y: 100, height: 462 }, bubble, room)).toEqual({ kind: "above" });
  });

  test("above, the bubble ends 5px over the line's outer edge", () => {
    // The line's outer edge at 29, the bubble from 0 to 24.
    expect(sizeBubblePlace({ y: 30.5, height: 600 }, bubble, room)).toEqual({ kind: "above" });
    expect(sizeBubblePlace({ y: 30, height: 600 }, bubble, room)).toEqual({ kind: "inside", top: 568 });
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

// The agent notice column at the area's top covers a bubble flipped above a selection, and its Play cannot be clicked
// there: the room starts 8px under the column while it shows any notice, as it ends 8px over the floating tools.
describe("canvasBubbleRoom", () => {
  test("the room runs from the notice column's bottom to the floating tools' top, each 8px clear", () => {
    expect(canvasBubbleRoom({ height: 800 }, { bottom: 68 }, { top: 740 })).toEqual({ top: 76, bottom: 732 });
  });
  test("without notices or tools the room is the whole area", () => {
    expect(canvasBubbleRoom({ height: 800 }, null, null)).toEqual({ top: 0, bottom: 800 });
  });
  test("a selection whose bubble would flip under the notice column keeps it clear of the column", () => {
    const room = canvasBubbleRoom({ height: 800 }, { bottom: 68 }, { top: 740 });
    // Selection from y 90 to 760: no room below it, and above it the bubble would end at 83.5, under the column.
    const place = sizeBubblePlace({ y: 90, height: 670 }, SIZE_BUBBLE, room);
    expect(place.kind).toBe("inside");
  });
});
