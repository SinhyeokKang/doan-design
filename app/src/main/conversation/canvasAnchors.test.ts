import { describe, expect, it } from "vitest";
import { canvasById, refreshCanvasAnchor, sendCanvasAnchors } from "./canvasAnchors";
import { anchorTokens } from "./prompt";
import type { Anchor, Canvas } from "./types";

const frame: Anchor = { frame: { id: "hero", title: "Hero" } };
const canvas = (path: string, id: string): Anchor => ({ canvas: { path, id } });
const listed: Canvas[] = [
  { path: ".doan/canvases/flows/checkout-flow.html", id: "checkout" },
  { path: ".doan/ds/buttons.html", id: "buttons" },
  { path: ".doan/canvases/twin-a.html", id: "twin" },
  { path: ".doan/canvases/twin-b.html", id: "twin" },
  { path: ".doan/canvases/no-id.html" },
];

describe("canvasById", () => {
  it("finds the one listed canvas with the id", () => {
    expect(canvasById(listed, "checkout")).toEqual({ path: ".doan/canvases/flows/checkout-flow.html" });
    expect(canvasById(listed, "buttons")).toEqual({ path: ".doan/ds/buttons.html" });
  });
  it("is missing when no canvas has the id, comparing the whole id only", () => {
    expect(canvasById(listed, "gone")).toBe("missing");
    expect(canvasById(listed, "check")).toBe("missing");
    expect(canvasById(listed, "Checkout")).toBe("missing");
    expect(canvasById([], "checkout")).toBe("missing");
  });
  it("is duplicate when two canvases share the id, and an id-less canvas matches nothing", () => {
    expect(canvasById(listed, "twin")).toBe("duplicate");
    expect(canvasById([{ path: "a.html", id: "" }, { path: "b.html", id: "" }], "x")).toBe("missing");
  });
});

// The send-time check: a canvas chip goes out only with the path main lists for its id now.
describe("sendCanvasAnchors", () => {
  const valid = (out: { text: string; anchors: Anchor[] }) => expect(anchorTokens(out.text, out.anchors)).not.toBeNull();

  it("leaves a message without canvas anchors as it is", () => {
    const out = sendCanvasAnchors("Move {{1}}", [frame], listed);
    expect(out).toEqual({ text: "Move {{1}}", anchors: [frame] });
  });

  it("replaces a moved canvas's path with the path listed for its id", () => {
    const out = sendCanvasAnchors("Follow {{1}}", [canvas(".doan/canvases/checkout-flow.html", "checkout")], listed);
    expect(out).toEqual({ text: "Follow {{1}}", anchors: [canvas(".doan/canvases/flows/checkout-flow.html", "checkout")] });
    valid(out);
  });

  it("never trusts the incoming path: two chips with one id and old and new paths both go out with the listed path", () => {
    const old = canvas(".doan/canvases/checkout-flow.html", "checkout");
    const forged = canvas(".doan/canvases/elsewhere.html", "checkout");
    const out = sendCanvasAnchors("{{1}} vs {{2}}", [old, forged], listed);
    expect(out.anchors).toEqual([canvas(".doan/canvases/flows/checkout-flow.html", "checkout"), canvas(".doan/canvases/flows/checkout-flow.html", "checkout")]);
    expect(out.text).toBe("{{1}} vs {{2}}");
    valid(out);
  });

  it("keeps a design-system canvas", () => {
    expect(sendCanvasAnchors("{{1}}", [canvas(".doan/ds/buttons.html", "buttons")], listed).anchors).toEqual([canvas(".doan/ds/buttons.html", "buttons")]);
  });

  it("turns a deleted canvas into its name, drops its anchor and numbers the rest again", () => {
    const out = sendCanvasAnchors("See {{1}} and {{2}}, then {{3}}", [frame, canvas(".doan/canvases/pricing.html", "gone"), canvas(".doan/ds/buttons.html", "buttons")], listed);
    expect(out).toEqual({ text: "See {{1}} and pricing, then {{2}}", anchors: [frame, canvas(".doan/ds/buttons.html", "buttons")] });
    valid(out);
  });

  it("names every place a dropped anchor was used", () => {
    const out = sendCanvasAnchors("{{1}} next to {{2}}, again {{1}}", [canvas(".doan/canvases/pricing.html", "gone"), frame], listed);
    expect(out).toEqual({ text: "pricing next to {{1}}, again pricing", anchors: [frame] });
    valid(out);
  });

  it("turns a canvas whose id another canvas shares into its name", () => {
    const out = sendCanvasAnchors("Like {{1}}", [canvas(".doan/canvases/twin-a.html", "twin")], listed);
    expect(out).toEqual({ text: "Like twin-a", anchors: [] });
    valid(out);
  });

  it("drops every anchor when none is listed, leaving no marker", () => {
    const out = sendCanvasAnchors("{{1}}{{2}}", [canvas(".doan/canvases/a.html", "a"), canvas(".doan/canvases/sub/b.html", "b")], []);
    expect(out).toEqual({ text: "ab", anchors: [] });
    valid(out);
  });

  it("keeps a name that holds braces from reading as a marker", () => {
    const out = sendCanvasAnchors("Use {{1}} and {{2}}", [canvas(".doan/canvases/{{1}}.html", "gone"), frame], listed);
    expect(out.anchors).toEqual([frame]);
    expect(out.text).not.toContain("{{1}} and");
    expect(out.text).toMatch(/^Use \{ \{1\} \} and \{\{1\}\}$/);
    valid(out);
  });

  it("does not change the anchors it was given", () => {
    const anchors = [canvas(".doan/canvases/checkout-flow.html", "checkout")];
    sendCanvasAnchors("{{1}}", anchors, listed);
    expect(anchors).toEqual([canvas(".doan/canvases/checkout-flow.html", "checkout")]);
  });
});

// A chip's name follows its canvas's current name before send too; a missing or shared id is left for send and press.
describe("refreshCanvasAnchor", () => {
  it("takes the path listed for the canvas's id", () => {
    expect(refreshCanvasAnchor(canvas(".doan/canvases/checkout-flow.html", "checkout"), listed)).toEqual(canvas(".doan/canvases/flows/checkout-flow.html", "checkout"));
  });
  it("returns the same anchor when nothing changed, the id is missing or shared, or it is not a canvas chip", () => {
    for (const anchor of [canvas(".doan/ds/buttons.html", "buttons"), canvas(".doan/canvases/x.html", "gone"), canvas(".doan/canvases/x.html", "twin"), frame])
      expect(refreshCanvasAnchor(anchor, listed)).toBe(anchor);
  });
});
