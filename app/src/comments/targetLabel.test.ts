import { describe, expect, it } from "vitest";
import type { SelectionElement } from "../formats/types";
import { targetLabel } from "./targetLabel";

const frames = [{ id: "shipping", title: "Shipping" }, { id: "review" }, { id: "blank", title: "" }];
const element = (overrides: Partial<SelectionElement> = {}): SelectionElement =>
  ({ selector: "[data-doan-frame=\"shipping\"] > label:nth-of-type(1)", html: "<label for=\"a\">Address</label>", ...overrides });

describe("targetLabel", () => {
  it("names a canvas target without a locate hint", () => {
    expect(targetLabel({}, frames)).toEqual({ text: "Canvas", title: "Canvas", locatableHint: false });
  });

  it("names a frame by its title, else its id, including frames missing from the list", () => {
    expect(targetLabel({ frame: "shipping" }, frames)).toEqual({ text: "Frame · Shipping", title: "[data-doan-frame=\"shipping\"]", locatableHint: true });
    expect(targetLabel({ frame: "review" }, frames).text).toBe("Frame · review");
    expect(targetLabel({ frame: "blank" }, frames).text).toBe("Frame · blank");
    expect(targetLabel({ frame: "gone" }, frames).text).toBe("Frame · gone");
    expect(targetLabel({ frame: "shipping" }, []).text).toBe("Frame · shipping");
  });

  it("uses tag, stored text excerpt and frame title for an element without doan-id", () => {
    const label = targetLabel({ frame: "shipping", element: element({ text: "Address" }) }, frames);
    expect(label).toEqual({ text: "Element · label “Address” · in Shipping", title: "[data-doan-frame=\"shipping\"] > label:nth-of-type(1)", locatableHint: true });
  });

  it("prefers the doan-id over the text and treats an empty doan-id as none", () => {
    expect(targetLabel({ frame: "shipping", element: element({ doanId: "ship-next", html: "<button>Next</button>", text: "Next" }) }, frames).text)
      .toBe("Element · button ship-next · in Shipping");
    expect(targetLabel({ frame: "shipping", element: element({ doanId: "", text: "Address" }) }, frames).text)
      .toBe("Element · label “Address” · in Shipping");
  });

  it("falls back to the tag alone, then to Element, when text and id are missing", () => {
    expect(targetLabel({ frame: "review", element: element({ html: "<div class=\"x\"></div>" }) }, frames).text).toBe("Element · div · in review");
    expect(targetLabel({ frame: "review", element: element({ html: "<div></div>", text: " \n\t " }) }, frames).text).toBe("Element · div · in review");
    expect(targetLabel({ frame: "review", element: element({ html: " <div></div>" }) }, frames).text).toBe("Element · in review");
    expect(targetLabel({ element: element({ html: "text only" }) }, frames).text).toBe("Element");
  });

  it("keeps the id or text when the tag regex fails", () => {
    expect(targetLabel({ element: element({ html: "<1abc>", doanId: "hero" }) }, frames).text).toBe("Element · hero");
    expect(targetLabel({ element: element({ html: "", text: "Hello" }) }, frames).text).toBe("Element · “Hello”");
  });

  it("reads the tag only from the anchored start of stored html, including truncated html", () => {
    const html = `<custom-card data-x="${"y".repeat(1990)}`;
    expect(targetLabel({ element: element({ html, truncated: true, doanId: "card" }) }, frames).text).toBe("Element · custom-card card");
    expect(targetLabel({ element: element({ html: "<!-- x --><div></div>", doanId: "c" }) }, frames).text).toBe("Element · c");
    expect(targetLabel({ element: element({ html: `<${"a".repeat(64)}>`, doanId: "c" }) }, frames).text).toBe(`Element · ${"a".repeat(64)} c`);
  });

  it("omits the frame part for an element outside any frame and uses the id of an unlisted frame", () => {
    expect(targetLabel({ element: element({ doanId: "ship-next", html: "<button>" }) }, frames).text).toBe("Element · button ship-next");
    expect(targetLabel({ frame: "gone", element: element({ doanId: "ship-next", html: "<button>" }) }, frames).text).toBe("Element · button ship-next · in gone");
  });

  it("collapses whitespace and cuts the text excerpt at 40 code points", () => {
    const forty = "a".repeat(40);
    expect(targetLabel({ element: element({ text: `  Delivery\n takes\t3–5   days ` }) }, frames).text).toBe("Element · label “Delivery takes 3–5 days”");
    expect(targetLabel({ element: element({ text: forty }) }, frames).text).toBe(`Element · label “${forty}”`);
    expect(targetLabel({ element: element({ text: `${forty}b` }) }, frames).text).toBe(`Element · label “${forty}…”`);
  });

  it("never splits a surrogate pair when cutting", () => {
    const emoji = "😀".repeat(41);
    expect(targetLabel({ element: element({ text: emoji }) }, frames).text).toBe(`Element · label “${"😀".repeat(40)}…”`);
    const id = "𝒳".repeat(81);
    expect(targetLabel({ element: element({ doanId: id, html: "<p>" }) }, frames).text).toBe(`Element · p ${"𝒳".repeat(80)}`);
  });

  it("caps doan-id, frame id and frame title at 80 code points and the selector title at 1,000", () => {
    const long = "x".repeat(100), cut = "x".repeat(80);
    expect(targetLabel({ element: element({ doanId: long, html: "<p>" }) }, frames).text).toBe(`Element · p ${cut}`);
    expect(targetLabel({ frame: long }, frames).text).toBe(`Frame · ${cut}`);
    expect(targetLabel({ frame: "t" }, [{ id: "t", title: long }]).text).toBe(`Frame · ${cut}`);
    expect(targetLabel({ frame: "t", element: element({ doanId: "a", html: "<p>" }) }, [{ id: "t", title: long }]).text).toBe(`Element · p a · in ${cut}`);
    expect(Array.from(targetLabel({ element: element({ selector: "s".repeat(1200) }) }, frames).title)).toHaveLength(1000);
    expect(Array.from(targetLabel({ frame: "z".repeat(1200) }, frames).title)).toHaveLength(1000);
  });

  it("returns stored html, text and body-like values as plain strings without interpreting markup", () => {
    const label = targetLabel({ element: element({ html: "<img src=x onerror=alert(1)>", text: "<b>bold</b>" }) }, frames);
    expect(label.text).toBe("Element · img “<b>bold</b>”");
  });
});
