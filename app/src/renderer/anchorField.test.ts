import { describe, expect, test } from "vitest";
import { combineQueued } from "../main/conversation/queue";
import type { Anchor } from "../main/conversation/types";
import { distinctTargets, fromMessage, sameTarget, toMessage, type FieldSegment } from "./anchorField";

const frame: Anchor = { frame: { id: "payment", title: "Payment" } };
const button: Anchor = { frame: { id: "payment" }, element: { selector: "#pay", tag: "button", text: "Pay" } };
const point: Anchor = { frame: { id: "shipping" }, point: { frameId: "shipping", dx: 120, dy: 64 } };
const text = (t: string): FieldSegment => ({ kind: "text", text: t });
const chip = (anchor: Anchor): FieldSegment => ({ kind: "chip", anchor });

describe("toMessage", () => {
  test("numbers chips from 1 in order of appearance", () => {
    expect(toMessage([text("Move "), chip(button), text(" into "), chip(frame), text(" near "), chip(point)]))
      .toEqual({ text: "Move {{1}} into {{2}} near {{3}}", anchors: [button, frame, point] });
  });

  test("the same place again reuses its number, even under another name", () => {
    const renamed: Anchor = { frame: { id: "payment", title: "Checkout" } };
    expect(toMessage([chip(frame), text(" and "), chip(button), text(" again "), chip(renamed)]))
      .toEqual({ text: "{{1}} and {{2}} again {{1}}", anchors: [frame, button] });
    expect(sameTarget(frame, renamed)).toBe(true);
    expect(sameTarget(frame, button)).toBe(false);
    expect(sameTarget(point, { ...point, point: { ...point.point!, dx: 121 } })).toBe(false);
  });

  test("no chips is plain text, and typed braces stay for draftProblem to stop", () => {
    expect(toMessage([text("Hello")])).toEqual({ text: "Hello", anchors: [] });
    expect(toMessage([])).toEqual({ text: "", anchors: [] });
    expect(toMessage([text("use {{ here")])).toEqual({ text: "use {{ here", anchors: [] });
  });

  test("up to 32 different places; one more is refused, a repeat is not", () => {
    const places = Array.from({ length: 32 }, (_, i): Anchor => ({ frame: { id: `f${i}` } }));
    const full = places.map(chip);
    expect(toMessage(full)?.anchors).toHaveLength(32);
    expect(distinctTargets(full)).toBe(32);
    expect(toMessage([...full, chip(places[0]!)])?.text.endsWith("{{1}}")).toBe(true);
    expect(toMessage([...full, chip({ frame: { id: "f32" } })])).toBeNull();
  });
});

describe("fromMessage", () => {
  test("round-trips a message and drops anchors no marker names", () => {
    const segments = [text("Move "), chip(button), text(" into "), chip(frame)];
    const message = toMessage(segments)!;
    expect(fromMessage(message.text, message.anchors)).toEqual(segments);
    expect(fromMessage("only text", [frame])).toEqual([text("only text")]);
  });

  test("a marker past the anchors stays text", () => {
    expect(fromMessage("{{1}} and {{2}}", [frame])).toEqual([chip(frame), text(" and {{2}}")]);
  });

  test("redraws combineQueued's renumbered result, and a repeated place merges back into one number", () => {
    const combined = combineQueued([
      { text: "Fix {{1}}", anchors: [button], attachments: [] },
      { text: "and {{1}} with {{2}}", anchors: [frame, button], attachments: [] },
    ]);
    if (!combined.ok) throw new Error("combined");
    expect(combined.text).toBe("Fix {{1}}\n\nand {{2}} with {{3}}");
    const segments = fromMessage(combined.text, combined.anchors);
    expect(segments).toEqual([text("Fix "), chip(button), text("\n\nand "), chip(frame), text(" with "), chip(button)]);
    expect(toMessage(segments)).toEqual({ text: "Fix {{1}}\n\nand {{2}} with {{1}}", anchors: [button, frame] });
  });

  test("a returned draft comes back as the same chips", () => {
    const returned = { text: "{{1}} is too tight near {{2}}", anchors: [frame, point] };
    expect(toMessage(fromMessage(returned.text, returned.anchors))).toEqual(returned);
  });
});
