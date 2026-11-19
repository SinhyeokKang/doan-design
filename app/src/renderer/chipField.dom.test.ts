import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Frame } from "playwright";
import { build, type Rolldown } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";
import type { FieldSegment } from "./anchorField";

// List items in the composer field, driven by real keys in the app's own Chromium: what the caret, deletion and IME
// handling do over the marker and depth spans is decided by the engine's editing code, which no fake DOM reproduces.

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const styles = readFileSync(here("./styles.css"), "utf8");
const tokens = readFileSync(here("./tokens.css"), "utf8");
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? "";
// The field's own rules from styles.css, over the tokens they read.
const css = [
  `:root { ${["--space-1", "--space-1h", "--space-6", "--type-label-size", "--type-label-line-height", "--radius-word"].map(name => `${name}: ${token(name)};`).join(" ")} --text-standard: #1a1a1a; }`,
  "body { margin: 24px; font-family: -apple-system, sans-serif; }",
  ...styles.split("\n").filter(line => /^\.(composer-input|list-mark|list-depth|skill-word|anchor-chip) /.test(line) || /^\.list-mark\[/.test(line)),
  ".composer-input { width: 296px; max-height: none; }",
].join("\n");

let dom: ElectronDom;
let frame: Frame;
let bundle: string;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "doan-chip-field-"));
  try {
    const entry = join(dir, "entry.ts");
    await writeFile(entry, [
      `export { ChipField, moveFocus } from ${JSON.stringify(here("./chipField.ts"))};`,
    ].join("\n"));
    const result = await build({ configFile: false, logLevel: "silent", root: dir, build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "Probe", fileName: "probe" } } });
    bundle = ((Array.isArray(result) ? result[0] : result) as Rolldown.RolldownOutput).output[0].code;
  } finally { await rm(dir, { recursive: true, force: true }); }
  dom = await launchElectronDom();
}, 60_000);
afterAll(async () => { await dom?.close(); }, 30_000);

const PAGE = `
const el = document.getElementById("f");
const field = new Probe.ChipField(el, { onChange() {}, onInput() {}, onAnnounce() {}, scope: () => "canvas", skillNames: () => new Set(["copy-check"]), commandNames: () => new Set() }, []);
let draft = 0;
window.probe = {
  field,
  set(segments) { el.focus(); field.setValue(segments, String(++draft)); },
  text: () => field.segments.map(s => s.kind === "text" ? s.text : "\\ufffc").join(""),
  place(anchor, focus = anchor) { el.focus(); field.placeCaret({ anchor, focus }); },
  sel: () => field.readSelection(),
  consistent: () => JSON.stringify(field.read()) === JSON.stringify(field.segments) && !field.misdrawn(),
  spans: () => Array.from(el.querySelectorAll(".list-mark,.list-depth,.skill-word")).map(n => n.className + (n.dataset.kind ? ":" + n.dataset.kind : "") + (n.dataset.depth ? ":" + n.dataset.depth : "") + " " + JSON.stringify(n.textContent)),
  box(selector, i = 0) { const n = el.querySelectorAll(selector)[i].getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: Math.round(n.left - b.left), y: Math.round(n.top - b.top), w: Math.round(n.width), h: Math.round(n.height) }; },
  caret() { const r = document.getSelection().getRangeAt(0).getClientRects()[0], b = el.getBoundingClientRect(); return r ? { x: Math.round(r.left - b.left), y: Math.round(r.top - b.top) } : null; },
  host: () => document.getSelection().anchorNode?.parentElement?.className ?? "",
  compose(type) { el.dispatchEvent(new CompositionEvent(type, { data: "" })); },
  input(inputType) { const e = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; },
};`;

async function open(segments: FieldSegment[] | string): Promise<void> {
  frame = await dom.load(`<!doctype html><meta charset="utf-8"><style>${css}</style><button id="before">before</button><div id="f" class="composer-input" contenteditable="true" tabindex="0"></div><button id="after">after</button><script>${bundle}</script><script>${PAGE}</script>`);
  await call("set", typeof segments === "string" ? [{ kind: "text", text: segments }] : segments);
}
// The page's probe object, called by name.
async function call<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
  return frame.evaluate(([n, a]) => (window as unknown as { probe: Record<string, (...v: unknown[]) => unknown> }).probe[n as string]!(...(a as unknown[])), [name, args] as const) as Promise<T>;
}
const press = async (key: string) => { await frame.press("#f", key); await dom.flush(frame); };
const text = () => call<string>("text");
const sel = () => call<{ anchor: number; focus: number }>("sel");
const consistent = () => call<boolean>("consistent");

const NESTED = "Intro\n- Title\n  - Run /copy-check on it\n    - Under 40\n* Buttons\n1. Header\n   1. Logo";

test("list lines draw marker and depth spans over the typed text, without a hanging indent", async () => {
  await open(NESTED);
  expect(await call("spans")).toEqual([
    'list-mark:ul "- "', 'list-depth:1 "  "', 'list-mark:ul "- "', 'skill-word "/copy-check"', 'list-depth:2 "    "', 'list-mark:ul "- "',
    'list-mark:ul "* "', 'list-mark:ol "1. "', 'list-depth:1 "   "', 'list-mark:ol "1. "',
  ]);
  expect(await consistent()).toBe(true);
  // One depth step and the marker column are --space-6 (24 px); the bullet's characters are not painted.
  expect(await call("box", ".list-depth", 0)).toMatchObject({ x: 0, w: 24 });
  expect(await call("box", ".list-depth", 1)).toMatchObject({ x: 0, w: 48 });
  expect(await call("box", ".list-mark", 0)).toMatchObject({ x: 0, w: 24 });
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".list-mark")!).color)).toBe("rgba(0, 0, 0, 0)");
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".list-mark")!, "::before").content)).toBe('"•"');
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector('.list-mark[data-kind="ol"]')!).color)).toBe("rgb(26, 26, 26)");
});

test("a depth-0 item's typed leading spaces take no width; a long item wraps to the line start", async () => {
  await open("  - Make the hero headline shorter so it fits on one line at the narrowest window width");
  expect(await call("spans")).toEqual(['list-depth:0 "  "', 'list-mark:ul "- "']);
  expect(await call("box", ".list-mark")).toMatchObject({ x: 0, y: 0 });
  expect(await call("box", ".list-depth")).toMatchObject({ w: 0, h: 24 });
  const rows = await frame.evaluate(() => {
    const field = document.getElementById("f")!, range = document.createRange();
    const body = field.lastChild!;
    range.setStart(body, body.textContent!.length - 1); range.setEnd(body, body.textContent!.length);
    return { x: Math.round(range.getBoundingClientRect().left - field.getBoundingClientRect().left), height: field.getBoundingClientRect().height };
  });
  expect(rows.height).toBeGreaterThan(24);
  // The wrapped row starts at the field's left edge, not under the body: its last character is well left of 24 px + a word.
  const second = await frame.evaluate(() => {
    const field = document.getElementById("f")!, body = field.lastChild as Text, range = document.createRange();
    const rects: { x: number; y: number }[] = [];
    for (let i = 0; i < body.length; i++) { range.setStart(body, i); range.setEnd(body, i + 1); const r = range.getBoundingClientRect(); rects.push({ x: r.left - field.getBoundingClientRect().left, y: r.top - field.getBoundingClientRect().top }); }
    return rects.find(r => r.y >= 24)!;
  });
  expect(Math.round(second.x)).toBe(0);
});

test("← and → skip an item's prefix, stopping only at the line start and the body start", async () => {
  await open(NESTED);
  // "- Title": line start 6, body start 8. "    - Under 40": line start 40, body start 46.
  await call("place", 8); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 6, focus: 6 });
  await press("ArrowRight");
  expect(await sel()).toEqual({ anchor: 8, focus: 8 });
  await call("place", 46); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 40, focus: 40 });
  await press("Shift+ArrowRight");
  expect(await sel()).toEqual({ anchor: 40, focus: 46 });
  await call("place", 46); await press("Shift+ArrowLeft");
  expect(await sel()).toEqual({ anchor: 46, focus: 40 });
  // From the previous line's end the browser reaches the line start, then the body start.
  await call("place", 5); await press("ArrowRight"); await press("ArrowRight");
  expect(await sel()).toEqual({ anchor: 8, focus: 8 });
});

test("a chip that starts an item's body keeps its own arrow steps and a filler after the marker", async () => {
  const chip = { frame: { id: "hero", title: "Hero" } };
  await open([{ kind: "text", text: "a\n- " }, { kind: "chip", anchor: chip as never }, { kind: "text", text: " body" }]);
  expect(await consistent()).toBe(true);
  // Line start 2, body start 4, chip at 4.
  await call("place", 5); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 4, focus: 4 });
  await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  await press("ArrowRight");
  expect(await sel()).toEqual({ anchor: 4, focus: 4 });
  await press("ArrowRight");
  expect(await sel()).toEqual({ anchor: 5, focus: 5 });
});

test("a caret left inside a prefix or at the marker span's end moves to the body's text", async () => {
  await open("- Title\n  - Child");
  // Inside the depth span of "  - Child" (line start 8): the browser's caret after a click or ↑/↓.
  await frame.evaluate(() => { const depth = document.querySelector(".list-depth")!.firstChild!; document.getSelection()!.setBaseAndExtent(depth, 1, depth, 1); });
  await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 12, focus: 12 });
  expect(await call("host")).not.toMatch(/list-/);
  await frame.evaluate(() => { const mark = document.querySelector(".list-mark")!.firstChild!; document.getSelection()!.setBaseAndExtent(mark, 2, mark, 2); });
  await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  expect(await call("host")).not.toMatch(/list-/);
  await frame.press("#f", "Z");
  expect(await text()).toBe("- ZTitle\n  - Child");
  expect(await consistent()).toBe(true);
});

test("an empty item's caret stands after the marker, outside it, and typing fills the body", async () => {
  await open("a\n- ");
  const caret = await call<{ x: number; y: number }>("caret");
  expect(caret.x).toBe(24);
  expect(caret.y).toBeGreaterThanOrEqual(24);
  expect(caret.y).toBeLessThan(48);
  expect(await call("host")).not.toMatch(/list-/);
  await press("x");
  expect(await text()).toBe("a\n- x");
  expect(await consistent()).toBe(true);
});

test("Backspace at a body start removes the marker or outdents, each one undo step", async () => {
  await open("- Title\n  - Child");
  await call("place", 12); await press("Backspace");
  expect(await text()).toBe("- Title\n- Child");
  expect(await sel()).toEqual({ anchor: 10, focus: 10 });
  await press("Backspace");
  expect(await text()).toBe("- Title\nChild");
  expect(await consistent()).toBe(true);
  await press("Meta+z");
  expect(await text()).toBe("- Title\n- Child");
  await press("Meta+z");
  expect(await text()).toBe("- Title\n  - Child");
  expect(await consistent()).toBe(true);
});

test("Shift+Enter continues, outdents and ends a list; each is one undo step apart from the typing", async () => {
  await open("1. Header\n   1. Logo");
  await press("x");
  await press("Shift+Enter");
  expect(await text()).toBe("1. Header\n   1. Logox\n   2. ");
  expect(await consistent()).toBe(true);
  await press("Shift+Enter");
  expect(await text()).toBe("1. Header\n   1. Logox\n2. ");
  await press("Shift+Enter");
  expect(await text()).toBe("1. Header\n   1. Logox\n");
  await press("Meta+z"); await press("Meta+z"); await press("Meta+z");
  expect(await text()).toBe("1. Header\n   1. Logox");
  await press("Meta+z");
  expect(await text()).toBe("1. Header\n   1. Logo");
  // Off a list a Shift+Enter stays a typed line break.
  await open("plain");
  await press("Shift+Enter");
  expect(await text()).toBe("plain\n");
});

test("Tab's indent moves an item under the one above as one undo step, and refuses with no parent", async () => {
  await open("- a\n- b");
  expect(await frame.evaluate(() => (window as unknown as { probe: { field: { indent(dir: number): boolean } } }).probe.field.indent(1))).toBe(true);
  expect(await text()).toBe("- a\n  - b");
  expect(await call("spans")).toEqual(['list-mark:ul "- "', 'list-depth:1 "  "', 'list-mark:ul "- "']);
  expect(await frame.evaluate(() => (window as unknown as { probe: { field: { indent(dir: number): boolean } } }).probe.field.indent(1))).toBe(false);
  await press("Meta+z");
  expect(await text()).toBe("- a\n- b");
});

test("Shift+Enter and Tab during a composition wait for its end, and a key sent again after it acts once", async () => {
  const indent = (dir: number) => frame.evaluate(d => (window as unknown as { probe: { field: { indent(dir: number): boolean } } }).probe.field.indent(d), dir);
  await open("- a\n- b");
  await call("compose", "compositionstart");
  expect(await call("input", "insertLineBreak")).toBe(true);
  expect(await text()).toBe("- a\n- b");
  await call("compose", "compositionend");
  await dom.flush(frame);
  expect(await text()).toBe("- a\n- b\n- ");
  expect(await consistent()).toBe(true);

  await open("- a\n- b");
  await call("compose", "compositionstart");
  expect(await indent(1)).toBe(true);
  expect(await text()).toBe("- a\n- b");
  await call("compose", "compositionend");
  await dom.flush(frame);
  expect(await text()).toBe("- a\n  - b");

  // The input method sends the line break again right after compositionend: one new item, not two.
  await open("- a");
  await call("compose", "compositionstart");
  await call("input", "insertLineBreak");
  await frame.evaluate(() => { const p = (window as unknown as { probe: { compose(t: string): void; input(t: string): boolean } }).probe; p.compose("compositionend"); p.input("insertLineBreak"); });
  await dom.flush(frame);
  expect(await text()).toBe("- a\n- ");
  await press("Meta+z");
  expect(await text()).toBe("- a");
});

test("deletions the browser makes across the spans leave the field drawn as its text", async () => {
  await open("- Title\n  - Run");
  // ⌘⌫ at the end of "  - Run" takes the whole line.
  await call("place", 15); await press("Meta+Backspace");
  expect(await text()).toBe("- Title\n");
  expect(await consistent()).toBe(true);
  await open("- Title");
  await call("place", 1, 4); await press("Backspace");
  expect(await text()).toBe("-tle");
  expect(await consistent()).toBe(true);
});

test("copy keeps the markers and depth spaces as typed", async () => {
  await open(NESTED);
  await frame.evaluate(() => { (window as unknown as { copied: string }).copied = ""; document.addEventListener("copy", e => { (window as unknown as { copied: string }).copied = e.clipboardData!.getData("text/plain"); }); });
  await call("place", 0, NESTED.length);
  await frame.press("#f", "Meta+c");
  expect(await frame.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(NESTED);
});

test("Ctrl+Tab's focus move reaches the next and previous stop around the field", async () => {
  await open("- a\n  - b");
  await call("place", 8);
  await frame.evaluate(() => (window as unknown as { Probe: { moveFocus(from: HTMLElement, back: boolean): void } }).Probe.moveFocus(document.getElementById("f")!, false));
  expect(await frame.evaluate(() => document.activeElement?.id)).toBe("after");
  await frame.focus("#f");
  await frame.evaluate(() => (window as unknown as { Probe: { moveFocus(from: HTMLElement, back: boolean): void } }).Probe.moveFocus(document.getElementById("f")!, true));
  expect(await frame.evaluate(() => document.activeElement?.id)).toBe("before");
});
