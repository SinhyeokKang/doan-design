import { readFileSync } from "node:fs";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";
import { rowDisplay } from "../renderer/inspectorRows";
import type { InspectRow } from "./inspect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { specificity } from "./cssomMatched";

declare const inspectCanvas: { inspectElement(el: Element): InspectRow[] };

test("conditional selectors keep the strongest argument while :where contributes zero", () => {
  expect(specificity(":where(#unused) :is(.a, #b):has(> span):nth-child(2 of .c)")).toEqual([1, 2, 1]);
});

describe("CSSOM inspector rows in the browser", { timeout: 60_000 }, () => {
  let dom: ElectronDom;
  const script = readFileSync(new URL("../../../cli/internal/export/viewer/inspect.js", import.meta.url), "utf8");
  const load = (head: string, body: string) => dom.load(`<!doctype html><head>${head}<script>${script}</script></head><body>${body}</body>`);
  beforeAll(async () => { dom = await launchElectronDom(); }, 60_000);
  afterAll(async () => { await dom?.close(); }, 30_000);

  test("scoped declarations supply the copied token and keep scoped-only rows visible within their limits", async () => {
    const frame = await load(`<style>
      :root { --inner: red; --outer: blue; --space: 8px }
      @scope (.panel) to (.stop) {
        :scope > .item { padding: var(--space) }
        .item { color: var(--inner) }
      }
      .item { color: var(--outer) }
    </style>`, '<section class="panel"><p class="item"></p><div class="stop"><p class="item"></p></div></section><p class="item"></p>');
    const selections = await frame.evaluate(() => Array.from(document.querySelectorAll(".item"), el => inspectCanvas.inspectElement(el)));
    const visible = selections.map(rows => rowDisplay(rows).groups.flatMap(group => group.rows)
      .filter(row => row.label === "Text" || row.label === "Padding").map(row => [row.label, row.text, row.copy]));
    expect(visible).toEqual([
      [["Padding", "8px", "--space"], ["Text", "#ff0000", "--inner"]],
      [["Text", "#0000ff", "--outer"]],
      [["Text", "#0000ff", "--outer"]],
    ]);
  });

  test("reading an opaque stylesheet preserves animation time, pause and an ongoing transition", async () => {
    const frame = await load('<style>@keyframes turn{to{transform:rotate(1turn)}}.spin{animation:turn 20s linear infinite}.target{color:green}</style>', '<div class="spin"></div><button style="color:white; transition:color 20s linear">Button</button><p class="target">Inspect</p>');
    const result = await frame.evaluate(async () => {
      const opaque = document.styleSheets[0]!;
      Object.defineProperty(opaque, "cssRules", { get() { throw new DOMException("Opaque sheet", "SecurityError"); } });
      const spin = document.querySelector(".spin")!;
      const button = document.querySelector("button")!;
      const animation = spin.getAnimations()[0]!;
      animation.pause();
      await animation.ready;
      animation.currentTime = 6400;
      void getComputedStyle(button).color;
      button.style.color = "black";
      const transition = button.getAnimations()[0]!;
      await transition.ready;
      transition.currentTime = 5000;
      const start = getComputedStyle(button).color;
      inspectCanvas.inspectElement(document.querySelector(".target")!);
      const after = spin.getAnimations()[0]!;
      return { after: after.currentTime, state: after.playState, transition: button.getAnimations().includes(transition), start, color: getComputedStyle(button).color };
    });
    expect(result).toEqual({ after: 6400, state: "paused", transition: true, start: result.start, color: result.start });
  });

  test("a browser without constructable sheets still shows applied values", async () => {
    const frame = await load('<style>.target{--gap:17px;padding:var(--gap)}</style>', '<p class="target"></p>');
    const rows = await frame.evaluate(() => {
      Object.defineProperty(window, "CSSStyleSheet", { value: undefined });
      Object.defineProperty(document, "adoptedStyleSheets", { value: undefined });
      return inspectCanvas.inspectElement(document.querySelector("p")!);
    });
    expect(rows.find(r => r.label === "Padding")).toMatchObject({ value: "17px", state: "hardcoded" });
    expect(rows.some(r => r.token)).toBe(false);
  });

  test("layer order, data import reparsing, conditional rules and overwritten shorthand use the browser cascade", async () => {
    const sheet = '@layer first, second;@layer first{p{color:var(--top)!important}}@layer second{#target{color:blue!important}}@media (min-width:1px){@supports(display:grid){p{padding:var(--pad);padding-left:4px}}}';
    const frame = await load('<style>@import "data:text/css,p%7Bborder-radius%3Avar(--rad)%7D";:root{--top:red;--rad:8px;--pad:12px}</style><style>'+sheet+'</style>', '<p id="target"></p>');
    const rows = await frame.evaluate(() => {
      const imported = (document.styleSheets[0]!.cssRules[0] as CSSImportRule).styleSheet!;
      Object.defineProperty(imported, "cssRules", { get() { throw new DOMException("Opaque import", "SecurityError"); } });
      return inspectCanvas.inspectElement(document.querySelector("p")!);
    });
    expect(rows.find(r => r.label === "Radius")).toMatchObject({ value: "8px", token: "--rad" });
    expect(rows.find(r => r.label === "Text")).toMatchObject({ value: "#ff0000", token: "--top" });
    expect(rows.find(r => r.label === "Padding")).toMatchObject({ value: "12px 12px 12px 4px", state: "hardcoded" });
  });
});
