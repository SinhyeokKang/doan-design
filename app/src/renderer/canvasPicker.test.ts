import { describe, expect, test } from "vitest";
import type { Anchor } from "../main/conversation/types";
import { ANCHOR_LIMIT_TEXT, PICKER_UNAVAILABLE, pickerAvailability, pointAnchor, resolveChipTarget, targetAnchor, type ChipReply } from "./canvasPicker";

describe("pickerAvailability", () => {
  test("on while the composer takes input and the canvas is loaded", () => {
    expect(pickerAvailability(null, "loaded", 0)).toEqual({ enabled: true, reason: null });
    expect(pickerAvailability(null, "loaded", 31)).toEqual({ enabled: true, reason: null });
  });

  test.each(["loading", "failed", "noWidth", "unlisted"] as const)("a canvas that can't be shown (%s) gives the canvas reason", load => {
    expect(pickerAvailability(null, load, 0)).toEqual({ enabled: false, reason: PICKER_UNAVAILABLE });
    expect(pickerAvailability("acme-web isn’t available. Fix it from its menu in the sidebar.", load, 0).reason).toBe(PICKER_UNAVAILABLE);
  });

  test("a composer that takes no input gives its own reason line", () => {
    const reason = "This canvas isn’t listed in acme-web, so its conversation can’t continue.";
    expect(pickerAvailability(reason, "loaded", 0)).toEqual({ enabled: false, reason });
  });

  test("32 places give the limit reason", () => {
    expect(pickerAvailability(null, "loaded", 32)).toEqual({ enabled: false, reason: ANCHOR_LIMIT_TEXT });
    expect(ANCHOR_LIMIT_TEXT).toBe("A message can point at up to 32 places. Remove one to add another.");
  });
});

describe("pointAnchor", () => {
  const shipping = { id: "shipping", title: "Shipping", x: 100, y: 200, width: 400, height: 300 };
  const card = { id: "card", x: 150, y: 250, width: 100, height: 100 };

  test("a click in a frame is a point at its offset in that frame", () => {
    expect(pointAnchor({ x: 220, y: 264 }, [shipping])).toEqual({ frame: { id: "shipping", title: "Shipping" }, point: { frameId: "shipping", dx: 120, dy: 64 } });
    expect(pointAnchor({ x: 100.4, y: 200.6 }, [shipping])?.point).toEqual({ frameId: "shipping", dx: 0, dy: 1 });
  });

  test("overlapping frames: the innermost", () => {
    expect(pointAnchor({ x: 160, y: 260 }, [shipping, card])).toEqual({ frame: { id: "card" }, point: { frameId: "card", dx: 10, dy: 10 } });
    expect(pointAnchor({ x: 160, y: 260 }, [card, shipping])?.frame?.id).toBe("card");
  });

  test("outside every frame there is no anchor", () => {
    expect(pointAnchor({ x: 50, y: 50 }, [shipping, card])).toBeNull();
    expect(pointAnchor({ x: 50, y: 50 }, [])).toBeNull();
  });

  test("values that aren't finite give no anchor", () => {
    expect(pointAnchor({ x: Number.NaN, y: 260 }, [shipping])).toBeNull();
    expect(pointAnchor({ x: 220, y: Infinity }, [shipping])).toBeNull();
    expect(pointAnchor({ x: 220, y: 264 }, [{ ...shipping, width: Number.NaN }])).toBeNull();
  });
});

describe("resolveChipTarget", () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };
  const reply = (candidates: ChipReply["candidates"], nodes = ["n1", "n2", "f1"]): ChipReply => ({ candidates, rects: new Map(nodes.map(n => [n, rect])) });
  const element: Anchor = { element: { doanId: "pay", selector: "#pay" } };

  test("an element: its unique doan-id, else its unique selector", () => {
    expect(resolveChipTarget(element, reply({ doanId: ["n1"], selector: ["n2"] }))).toEqual({ kind: "node", node: "n1", rect });
    expect(resolveChipTarget(element, reply({ doanId: ["n1", "n2"], selector: ["n2"] }))).toEqual({ kind: "node", node: "n2", rect });
    expect(resolveChipTarget({ element: { selector: "#pay" } }, reply({ doanId: ["n1"], selector: ["n2"] }))).toEqual({ kind: "node", node: "n2", rect });
    expect(resolveChipTarget(element, reply({ doanId: [], selector: null }))).toEqual({ kind: "missing" });
    expect(resolveChipTarget(element, reply({ selector: ["n1", "n2"] }))).toEqual({ kind: "missing" });
  });

  test("a frame by its id", () => {
    expect(resolveChipTarget({ frame: { id: "payment" } }, reply({ frame: ["f1"] }))).toEqual({ kind: "node", node: "f1", rect });
    expect(resolveChipTarget({ frame: { id: "payment" } }, reply({ frame: [] }))).toEqual({ kind: "missing" });
  });

  test("a point at its frame's offset, missing once the frame is gone", () => {
    const point: Anchor = { frame: { id: "shipping" }, point: { frameId: "shipping", dx: 5, dy: 6 } };
    expect(resolveChipTarget(point, reply({ frame: ["f1"] }))).toEqual({ kind: "point", node: "f1", x: 15, y: 26 });
    expect(resolveChipTarget(point, reply({}))).toEqual({ kind: "missing" });
  });

  test("a candidate without a rect is not found", () => {
    expect(resolveChipTarget({ frame: { id: "payment" } }, reply({ frame: ["f1"] }, []))).toEqual({ kind: "missing" });
  });

  test("an unloaded canvas disables locate", () => {
    expect(resolveChipTarget(element, null)).toEqual({ kind: "unavailable" });
  });
});

// A picked or selected frame or element as the anchor a chip carries: what the agent can find in the HTML, nothing
// the app only uses itself (the rect, the path, the outer HTML, the implements paths).
describe("targetAnchor", () => {
  const frame = { id: "shipping", title: "Shipping", implements: "app/src/Shipping.tsx" };
  const path = [{ label: "shipping", selector: '[data-doan-frame="shipping"]' }];

  test("an element keeps its doan-id, selector, text and tag, with the frame it sits in", () => {
    const element = { doanId: "pay", selector: '[data-doan-id="pay"]', html: "<button>Pay</button>", text: "Pay", truncated: true };
    expect(targetAnchor({ tag: "button", frame, frameIndex: 0, element, path, interactive: "control" })).toEqual({
      frame: { id: "shipping", title: "Shipping" },
      element: { doanId: "pay", selector: '[data-doan-id="pay"]', text: "Pay", tag: "button" },
    });
  });

  test("an element outside every frame, without doan-id or text", () => {
    expect(targetAnchor({ tag: "p", element: { selector: "body > p:nth-of-type(1)", html: "<p></p>" }, path: [] })).toEqual({
      element: { selector: "body > p:nth-of-type(1)", tag: "p" },
    });
  });

  test("a frame is its id and title", () => {
    expect(targetAnchor({ tag: "section", frame, path })).toEqual({ frame: { id: "shipping", title: "Shipping" } });
    expect(targetAnchor({ tag: "section", frame: { id: "card" }, path })).toEqual({ frame: { id: "card" } });
  });

  test("a target that is neither gives no anchor", () => {
    expect(targetAnchor({ tag: "div", path: [] })).toBeNull();
  });
});
