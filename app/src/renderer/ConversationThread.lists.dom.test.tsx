import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Frame } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";
import { ConversationThread, type ConversationThreadProps } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";

// A sent list in the bubble, laid out by the app's own Chromium: which layout keeps the copied text equal to the sent
// text, and where markers and bodies sit, are decided by the engine, which no fake DOM reproduces. Selection.toString()
// follows the same line-break rules as a copy (a grid item's edge becomes a break in both), without the system clipboard.

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// styles.css as written: its @import and @theme rules are left to fail, so the tokens come in on their own. Geist comes
// in as data, because the numbered column is counted in `ch`, whose width is the font's.
const geist = readFileSync(here("./public/fonts/geist/Geist.woff2")).toString("base64");
const css = [
  readFileSync(here("./fonts.css"), "utf8").replace("/fonts/geist/Geist.woff2", `data:font/woff2;base64,${geist}`),
  readFileSync(here("./tokens.css"), "utf8"), readFileSync(here("./styles.css"), "utf8"),
].join("\n");

let dom: ElectronDom;
let frame: Frame;
beforeAll(async () => { dom = await launchElectronDom(); }, 60_000);
afterAll(async () => { await dom?.close(); }, 30_000);

const noop = () => {};
const sent = (text: string) => renderToStaticMarkup(<TooltipProvider><ConversationThread {...{
  items: [{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, attachments: [], parts: [{ text }] }] as unknown as ConversationThreadProps["items"],
  conversationId: "c1", provider: "claude", project: "p", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
  onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenHandoff: noop, onOpenLink: noop, onCopy: async () => true,
}} /></TooltipProvider>);

// The canvas conversation panel at its 320 px minimum.
async function open(text: string): Promise<void> {
  frame = await dom.load(`<!doctype html><meta charset="utf-8"><style>${css}</style><aside class="doan-conv-panel" style="width:320px">${sent(text)}</aside>`);
  // fonts.check() is true when no face has the name at all, so look for the loaded face itself.
  const loaded = await frame.evaluate(async () => { await document.fonts.load("14px Geist"); return [...document.fonts].some(face => face.family.replace(/"/g, "") === "Geist" && face.status === "loaded"); });
  if (!loaded) throw new Error("Geist did not load");
}
const selected = () => frame.evaluate(() => {
  const range = document.createRange(); range.selectNodeContents(document.querySelector(".bubble")!);
  getSelection()!.removeAllRanges(); getSelection()!.addRange(range); return getSelection()!.toString();
});
// Per item, relative to its own list's left edge: marker and body boxes and the body's height in lines.
const items = () => frame.evaluate(() => [...document.querySelectorAll(".bubble-item")].map(item => {
  const left = item.parentElement!.getBoundingClientRect().left;
  const mark = item.querySelector(":scope > .list-mark")!.getBoundingClientRect(), body = item.querySelector(":scope > .bubble-item-body")!;
  const b = body.getBoundingClientRect(), line = parseFloat(getComputedStyle(body).lineHeight);
  return { body: body.textContent!.split(" ")[0], mark: Math.round(mark.left - left), markTop: Math.round(mark.top), at: Math.round((b.left - left) * 100) / 100, top: Math.round(b.top), lines: Math.round(b.height / line), display: getComputedStyle(item).display };
}));

test("a sent list selects as the text sent, markers and depth spaces included", { timeout: 60_000 }, async () => {
  for (const text of ["Before:\n- a\n  - b\n    - c\n- d\nAfter", "Steps\n9. a\n10. b\n100. c", " - one space\n- none", "1. a\n   - b\n     1. c\n2. d"]) {
    await open(text);
    expect(await selected()).toBe(text);
  }
  // Not a grid: a grid item's edge is selected (and copied) as a line break between the marker and the body.
  expect(new Set((await items()).map(item => item.display))).toEqual(new Set(["block"]));
});

test("markers step in by depth up to four steps, and a wrapped body hangs under its own start", { timeout: 60_000 }, async () => {
  await open("- d0\n  - d1\n    - d2\n      - d3\n        - d4\n          - d5 a body long enough to wrap in the bubble at the panel width\n            - d6");
  const rows = await items();
  // Every marker stands one --space-5 step (20 px) in and each depth adds a step; a bullet's column is --space-3
  // (12 px); a nested list starts at its parent item's left.
  expect(rows.map(row => [row.body, row.mark, row.at])).toEqual([
    ["d0", 20, 32], ["d1", 40, 52], ["d2", 60, 72], ["d3", 80, 92], ["d4", 100, 112], ["d5", 100, 112], ["d6", 100, 112],
  ]);
  for (const row of rows) expect(row.top).toBe(row.markTop);
  expect(rows.find(row => row.body === "d5")!.lines).toBeGreaterThan(1);
});

test("the bodies of one numbered list line up, past its widest marker", { timeout: 60_000 }, async () => {
  await open("Steps\n9. Hero spacing\n10. Pricing cards\n100. Footer links");
  const rows = await items();
  expect(new Set(rows.map(row => row.at)).size).toBe(1);
  const widest = await frame.evaluate(() => {
    // The marker as drawn (its figures), without its column minimum and step.
    const probe = document.createElement("span"); probe.className = "list-mark"; probe.textContent = "100. "; probe.style.cssText = "min-width: 0; margin: 0";
    document.querySelector(".bubble-item")!.append(probe); const width = probe.getBoundingClientRect().width; probe.remove(); return width;
  });
  expect(rows[0]!.at - 20).toBeGreaterThanOrEqual(widest);
  // A number's text follows its typed space: the column runs past the widest marker by under a pixel.
  expect(rows[0]!.at - 20 - widest).toBeLessThan(1);
  // "2." is the wider of the two markers in Geist.
  await open("1. a\n2. b");
  const one = await items();
  const marker = await frame.evaluate(() => {
    // The marker as drawn (its figures), without its column minimum and step.
    const probe = document.createElement("span"); probe.className = "list-mark"; probe.textContent = "2. "; probe.style.cssText = "min-width: 0; margin: 0";
    document.querySelector(".bubble-item")!.append(probe); const width = probe.getBoundingClientRect().width; probe.remove(); return width;
  });
  for (const row of one) { expect(row.at - 20).toBeGreaterThanOrEqual(marker); expect(row.at - 20 - marker).toBeLessThan(1); }
});

// Each "N."'s "." ends at the same x, so its text follows after the same gap: the typed space.
const dots = () => frame.evaluate(() => [...document.querySelectorAll('.bubble-item > .list-mark[data-kind="ol"]')].map(mark => {
  const text = mark.firstChild as Text, dot = document.createRange(), body = document.createRange();
  dot.setStart(text, text.data.indexOf(".")); dot.setEnd(text, text.data.indexOf(".") + 1); body.selectNodeContents(mark.nextElementSibling!);
  const end = dot.getBoundingClientRect().right;
  return { end: Math.round(end * 100) / 100, gap: Math.round((body.getClientRects()[0]!.left - end) * 100) / 100 };
}));

test("numbers stand right-aligned in the column, each followed by the same gap", { timeout: 60_000 }, async () => {
  for (const text of ["1. a\n2. b", "9. a\n10. b\n11. c", "8. a\n88. b\n100. c"]) {
    await open(text);
    const rows = await dots();
    const ends = rows.map(row => row.end);
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(0.1);
    // One typed space in Geist at 14 px, whatever the marker's width.
    for (const row of rows) expect(row.gap).toBeCloseTo(3.47, 1);
    expect(await selected()).toBe(text);
  }
});

test("a depth-0 item's typed leading spaces take no width", { timeout: 60_000 }, async () => {
  await open(" - one space\n- none");
  expect((await items()).map(row => [row.mark, row.at])).toEqual([[20, 32], [20, 32]]);
});
