import { describe, expect, test } from "vitest";
import { chipLabel, LIMITS, messageLine, splitMarkers } from "./messageText";
import { LIMITS as PROMPT_LIMITS } from "./prompt";
import type { Anchor } from "./types";

const payment: Anchor = { frame: { id: "payment", title: "Payment" } };
const button: Anchor = { frame: { id: "payment", title: "Payment" }, element: { selector: "#pay", tag: "BUTTON", text: "Pay $42.00" } };
const point: Anchor = { frame: { id: "shipping" }, point: { frameId: "shipping", dx: 120, dy: 64 } };

test("main reads the same limits the renderer does", () => {
  expect(PROMPT_LIMITS).toBe(LIMITS);
  expect(LIMITS.anchors).toBe(32);
});

test("splitMarkers keeps only markers that name an anchor", () => {
  expect(splitMarkers("a {{1}} b {{3}} {{0}} {{2}}", 2)).toEqual([{ text: "a " }, { n: 1 }, { text: " b {{3}} {{0}} " }, { n: 2 }]);
  expect(splitMarkers("{{{1}}}", 1)).toEqual([{ text: "{" }, { n: 1 }, { text: "}" }]);
  expect(splitMarkers("", 0)).toEqual([]);
});

describe("chipLabel", () => {
  test("a frame reads as its name, from the open canvas's list first, then the anchor's title, then its id", () => {
    expect(chipLabel(payment)).toEqual({ kind: "frame", label: "Payment", title: "Frame · payment" });
    expect(chipLabel(payment, [{ id: "payment", title: "Checkout" }])).toMatchObject({ label: "Checkout" });
    expect(chipLabel({ frame: { id: "hero" } })).toMatchObject({ label: "hero", title: "Frame · hero" });
  });

  test.each([
    ["h1", "heading"], ["h2", "heading"], ["h6", "heading"], ["a", "link"], ["img", "image"],
    ["input", "field"], ["textarea", "field"], ["select", "field"], ["button", "button"], ["span", "span"], ["section", "section"],
  ])("an element tagged %s is named %s", (tag, name) => {
    expect(chipLabel({ element: { selector: "x", tag, text: "Beta" } }).label).toBe(`${name} “Beta”`);
  });

  test("an element reads as its name with its doan-id, else its text, each cut to 40 characters", () => {
    expect(chipLabel(button)).toEqual({ kind: "element", label: "button “Pay $42.00”", title: "Element · button “Pay $42.00” · in payment" });
    expect(chipLabel({ element: { selector: "x", tag: "h2", doanId: "pay-title", text: "Payment" } })).toMatchObject({ label: "heading pay-title", title: "Element · h2 pay-title" });
    const long = "a".repeat(50);
    expect(chipLabel({ element: { selector: "x", tag: "p", text: long } })).toMatchObject({ label: `p “${"a".repeat(39)}…”`, title: `Element · p “${long}”` });
    expect(chipLabel({ element: { selector: "x", tag: "p", doanId: long } }).label).toBe(`p ${"a".repeat(39)}…`);
    expect(chipLabel({ element: { selector: "x", tag: "p", text: "  two\n lines " } }).label).toBe("p “two lines”");
    expect(chipLabel({ element: { selector: "x" } }).label).toBe("element");
  });

  test("a point reads as the frame it is in", () => {
    expect(chipLabel(point, [{ id: "shipping", title: "Shipping" }])).toEqual({ kind: "point", label: "Point in Shipping", title: "Point · shipping (120, 64)" });
    expect(chipLabel(point).label).toBe("Point in shipping");
  });
});

describe("messageLine", () => {
  test("a message without chips stays as written", () => {
    expect(messageLine("Make it lighter", [])).toBe("Make it lighter");
  });

  test("each marker reads as its chip's name, a repeated number each time", () => {
    expect(messageLine("Move {{2}} into {{1}}, keep {{2}}", [payment, button])).toBe("Move button “Pay $42.00” into Payment, keep button “Pay $42.00”");
  });

  test("a marker without an anchor stays as typed", () => {
    expect(messageLine("Look at {{1}} and {{2}}", [payment])).toBe("Look at Payment and {{2}}");
  });

  test("line breaks and runs of spaces read as one space, in the text and in a frame's name", () => {
    expect(messageLine("First\nSecond {{1}}", [{ frame: { id: "f", title: "Frame" } }])).toBe("First Second Frame");
    expect(messageLine("  Fix\n\n{{1}}  now ", [{ frame: { id: "f", title: "Check\nout" } }])).toBe("Fix Check out now");
    expect(messageLine("Fix {{1}}", [{ frame: { id: "f" } }], [{ id: "f", title: "Pay\n  page" }])).toBe("Fix Pay page");
    expect(messageLine("Fix {{1}}", [{ frame: { id: "f", title: " \n " } }])).toBe("Fix f");
  });

  test("cut to the label limit", () => {
    expect(messageLine(`${"x".repeat(600)}{{1}}`, [payment])).toHaveLength(LIMITS.label);
    expect(messageLine(`${"a\n".repeat(300)}`, [])).toHaveLength(LIMITS.label);
  });
});
