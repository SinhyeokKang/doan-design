import { describe, expect, test } from "vitest";
import { combineQueued } from "../main/conversation/queue";
import type { Anchor } from "../main/conversation/types";
import {
  chipAt, distinctTargets, FILLER, fromMessage, hardLine, hasContent, isLineStart, normalize, plainText, readFieldClipboard, sameSegments, sameTarget,
  sliceUnits, spliceUnits, textSegments, toMessage, typedText, unitLength, writeFieldClipboard, type FieldSegment,
} from "./anchorField";
import { draftProblem } from "./homeComposer";

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

describe("field units", () => {
  const field = [text("ab"), chip(frame), text("c\nde"), chip(point)];
  test("normalize joins neighbouring text and drops empty text", () => {
    expect(normalize([text("a"), text(""), text("b"), chip(frame), text("")])).toEqual([text("ab"), chip(frame)]);
    expect(textSegments("")).toEqual([]);
    expect(textSegments("hi")).toEqual([text("hi")]);
  });
  test("a chip counts as one unit; slice and splice never split one", () => {
    expect(unitLength(field)).toBe(8);
    expect(sliceUnits(field, 1, 4)).toEqual([text("b"), chip(frame), text("c")]);
    expect(spliceUnits(field, 2, 3, [])).toEqual({ segments: [text("abc\nde"), chip(point)], caret: 2 });
    expect(spliceUnits(field, 0, 0, [chip(button)])).toEqual({ segments: [chip(button), ...field], caret: 1 });
    expect(chipAt(field, 2)).toBe(frame);
    expect(chipAt(field, 3)).toBeNull();
    expect(chipAt(field, 7)).toBe(point);
    expect(chipAt(field, 8)).toBeNull();
  });
  test("hardLine spans from after the line break before the range to the one after it", () => {
    expect(hardLine(field, 3, 3)).toEqual([0, 4]);
    expect(hardLine(field, 6, 6)).toEqual([5, 8]);
    expect(hardLine([text("one")], 1, 2)).toEqual([0, 3]);
  });
  test("plain text names chips; typed text leaves them out; content needs a chip or non-blank text", () => {
    expect(plainText(field)).toBe("abPaymentc\ndePoint in shipping");
    expect(typedText(field)).toBe("abc\nde");
    expect(hasContent([text("  \n")])).toBe(false);
    expect(hasContent([text(" "), chip(frame)])).toBe(true);
    expect(hasContent([])).toBe(false);
  });
  test("sameSegments compares labels too, so a renamed frame draws again", () => {
    expect(sameSegments(field, [text("ab"), chip({ frame: { id: "payment", title: "Payment" } }), text("c\nde"), chip(point)])).toBe(true);
    expect(sameSegments([chip(frame)], [chip({ frame: { id: "payment", title: "Checkout" } })])).toBe(false);
    expect(sameSegments([text("a")], [text("a"), chip(frame)])).toBe(false);
  });
});

describe("line-start chips and the chip clipboard", () => {
  test("isLineStart: the field's start and the place after a line break", () => {
    const field = [chip(frame), text("a\n"), chip(point)];
    expect([0, 1, 2, 3, 4].map(unit => isLineStart(field, unit))).toEqual([true, false, false, true, false]);
  });
  test("a U+200B in the person's text is text: it survives the clipboard and the message", () => {
    const fragment = [text(`a${FILLER}b `), chip(frame)];
    expect(readFieldClipboard(writeFieldClipboard("canvas:a", fragment), "canvas:a")).toEqual(fragment);
    expect(toMessage(fragment)).toEqual({ text: `a${FILLER}b {{1}}`, anchors: [frame] });
  });
  test("a copied fragment keeps a typed {{1}} as typed text, so draftProblem still refuses it after the paste", () => {
    const fragment = [text("{{1}} "), chip(frame)];
    const pasted = readFieldClipboard(writeFieldClipboard("canvas:a", fragment), "canvas:a");
    expect(pasted).toEqual(fragment);
    expect(draftProblem(pasted!, null, [], [])?.kind).toBe("anchorMarkers");
  });
  test("a chip clipboard of another canvas, another shape or broken JSON is not read as chips", () => {
    const raw = writeFieldClipboard("canvas:a", [chip(frame)]);
    expect(readFieldClipboard(raw, "canvas:b")).toBeNull();
    expect(readFieldClipboard("{", "canvas:a")).toBeNull();
    expect(readFieldClipboard(JSON.stringify({ v: 1, scope: "canvas:a", text: "{{1}}", anchors: [frame] }), "canvas:a")).toBeNull();
    expect(readFieldClipboard(JSON.stringify({ v: 1, scope: "canvas:a", segments: [{ kind: "chip", anchor: "x" }] }), "canvas:a")).toBeNull();
    expect(readFieldClipboard(JSON.stringify({ v: 2, scope: "canvas:a", segments: [] }), "canvas:a")).toBeNull();
  });
  test("an anchor field of the wrong type makes the whole payload not-chips (title: 123), so the paste falls back to text", () => {
    const read = (anchor: unknown) => readFieldClipboard(JSON.stringify({ v: 1, scope: "canvas:a", segments: [{ kind: "chip", anchor }] }), "canvas:a");
    expect(read({ frame: { id: "x", title: 123 } })).toBeNull();
    expect(read({ frame: { id: 7 } })).toBeNull();
    expect(read({ element: { selector: "#a", tag: 1 } })).toBeNull();
    expect(read({ element: { doanId: "a" } })).toBeNull();
    expect(read({ point: { frameId: "f", dx: "1", dy: 2 } })).toBeNull();
    expect(read({ point: { dx: 1, dy: Number.NaN } })).toBeNull();
    expect(read({})).toBeNull();
    expect(read([frame])).toBeNull();
    expect(read(button)).toEqual([chip(button)]);
    expect(read(point)).toEqual([chip(point)]);
  });
});

describe("canvas chips", () => {
  const checkout: Anchor = { canvas: { path: ".doan/canvases/checkout-flow.html", id: "checkout-flow" } };
  const buttons: Anchor = { canvas: { path: ".doan/ds/buttons.html", id: "buttons" } };

  test("two canvases are two places; the same canvas id again is one, even at a moved path", () => {
    const moved: Anchor = { canvas: { path: ".doan/canvases/archive/checkout-flow.html", id: "checkout-flow" } };
    expect(sameTarget(checkout, buttons)).toBe(false);
    expect(sameTarget(checkout, moved)).toBe(true);
    expect(sameTarget(checkout, frame)).toBe(false);
    expect(toMessage([chip(checkout), text(" with "), chip(buttons), text(" and "), chip(moved)]))
      .toEqual({ text: "{{1}} with {{2}} and {{1}}", anchors: [checkout, buttons] });
  });

  test("canvas chips count toward the 32 places with frame chips", () => {
    const canvases = Array.from({ length: 31 }, (_, i): Anchor => ({ canvas: { path: `.doan/canvases/c${i}.html`, id: `c${i}` } }));
    const full = [...canvases, frame].map(chip);
    expect(distinctTargets(full)).toBe(32);
    expect(toMessage(full)?.anchors).toHaveLength(32);
    expect(toMessage([...full, chip({ canvas: { path: ".doan/canvases/c31.html", id: "c31" } })])).toBeNull();
  });

  test("combineQueued renumbers canvas anchors and the field redraws them as the same chips", () => {
    const combined = combineQueued([
      { text: "Use {{1}}", anchors: [checkout], attachments: [] },
      { text: "with {{1}} and {{2}}", anchors: [buttons, checkout], attachments: [] },
    ]);
    if (!combined.ok) throw new Error("combined");
    expect(combined.text).toBe("Use {{1}}\n\nwith {{2}} and {{3}}");
    const segments = fromMessage(combined.text, combined.anchors);
    expect(segments).toEqual([text("Use "), chip(checkout), text("\n\nwith "), chip(buttons), text(" and "), chip(checkout)]);
    expect(toMessage(segments)).toEqual({ text: "Use {{1}}\n\nwith {{2}} and {{1}}", anchors: [checkout, buttons] });
  });

  test("the clipboard keeps a canvas chip and refuses a malformed or mixed one", () => {
    const read = (anchor: unknown) => readFieldClipboard(JSON.stringify({ v: 1, scope: "canvas:a", segments: [{ kind: "chip", anchor }] }), "canvas:a");
    expect(read(checkout)).toEqual([chip(checkout)]);
    expect(read({ canvas: { path: ".doan/canvases/a.html" } })).toBeNull();
    expect(read({ canvas: { path: 7, id: "a" } })).toBeNull();
    expect(read({ canvas: { path: ".doan/canvases/a.html", id: 7 } })).toBeNull();
    expect(read({ canvas: ".doan/canvases/a.html" })).toBeNull();
    expect(read({ ...checkout, frame: { id: "hero" } })).toBeNull();
  });
});
