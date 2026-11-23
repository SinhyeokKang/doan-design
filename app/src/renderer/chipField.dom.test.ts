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
  `:root { ${["--space-1", "--space-1h", "--space-3", "--space-5", "--type-label-size", "--type-label-line-height", "--radius-word"].map(name => `${name}: ${token(name)};`).join(" ")} --text-standard: #1a1a1a; }`,
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
      `export { slashKey } from ${JSON.stringify(here("./homeComposer.ts"))};`,
    ].join("\n"));
    const result = await build({ configFile: false, logLevel: "silent", root: dir, build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "Probe", fileName: "probe" } } });
    bundle = ((Array.isArray(result) ? result[0] : result) as Rolldown.RolldownOutput).output[0].code;
  } finally { await rm(dir, { recursive: true, force: true }); }
  dom = await launchElectronDom();
}, 60_000);
afterAll(async () => { await dom?.close(); }, 30_000);

const PAGE = `
const el = document.getElementById("f");
let changes = 0;
const field = new Probe.ChipField(el, { onChange() { changes++; }, onInput() {}, onAnnounce() {}, scope: () => "canvas", skillNames: () => new Set(["copy-check"]), commandNames: () => new Set() }, []);
let draft = 0;
// ComposerField's keydown, registered after the field's own as React's is: the host's onKey first (Home's \`/\` list
// through slashKey, or a host that takes a key as the next-message suggestion does), then Tab's indent, preventing the
// key's focus move only when it answers true.
const host = { slash: false, takes: null };
el.addEventListener("keydown", e => {
  const composing = e.isComposing || e.keyCode === 229;
  if (host.slash) {
    const action = Probe.slashKey(e.key, 0, 1, composing, { query: "", row: { kind: "skill", id: "demo" } });
    if (action?.kind === "pick") { e.preventDefault(); field.insertSkill("demo", true); return; }
    if (action?.kind === "close") { host.slash = false; return; }
  }
  if (host.takes === e.key && !composing) { e.preventDefault(); field.insertText("Next"); return; }
  if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && field.indent(e.shiftKey ? -1 : 1)) e.preventDefault();
});
const probe = window.probe = {
  field,
  set(segments) { el.focus(); field.setValue(segments, String(++draft)); },
  text: () => field.segments.map(s => s.kind === "text" ? s.text : "\\ufffc").join(""),
  place(anchor, focus = anchor) { el.focus(); field.placeCaret({ anchor, focus }); },
  sel: () => field.readSelection(),
  consistent: () => JSON.stringify(field.read()) === JSON.stringify(field.segments) && !field.misdrawn(),
  spans: () => Array.from(el.querySelectorAll(".list-mark,.list-depth,.skill-word")).map(n => n.className + (n.dataset.kind ? ":" + n.dataset.kind : "") + (n.dataset.depth ? ":" + n.dataset.depth : "") + " " + JSON.stringify(n.textContent)),
  box(selector, i = 0) { const n = el.querySelectorAll(selector)[i].getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: Math.round(n.left - b.left), y: Math.round(n.top - b.top), w: Math.round(n.width), h: Math.round(n.height) }; },
  caret() { const r = document.getSelection().getRangeAt(0).getClientRects()[0], b = el.getBoundingClientRect(); return r ? { x: Math.round(r.left - b.left), y: Math.round(r.top - b.top) } : null; },
  // The caret's row inside the field's visible box. A caret on an empty line has no rect of its own: the line break
  // after it, or on the last line the trailing <br> the field draws, stands on its row.
  caretInView() {
    const s = document.getSelection(), b = el.getBoundingClientRect(), node = s.focusNode, at = s.focusOffset, range = document.createRange();
    range.setStart(node, at);
    let r = range.getClientRects()[0];
    if (!r && node.nodeType === 3 && node.data[at] === "\\n") { range.setEnd(node, at + 1); r = range.getClientRects()[0]; }
    if (!r && node.nodeType === 3 && at === node.length && node.nextSibling?.nodeName === "BR" && node.nextSibling === el.lastChild) r = el.lastChild.getBoundingClientRect();
    return r ? { top: Math.round(r.top - b.top), bottom: Math.round(r.bottom - b.top), height: Math.round(b.height), scrolled: el.scrollTop > 0 } : null;
  },
  host: () => document.getSelection().anchorNode?.parentElement?.className ?? "",
  changes: () => changes,
  compose(type) { el.dispatchEvent(new CompositionEvent(type, { data: "" })); },
  // What an input method does while composing: the marked text goes into the DOM at the caret, and input follows.
  composeText(data) {
    const s = document.getSelection(), node = s.focusNode, at = s.focusOffset;
    node.insertData(at, data);
    s.setBaseAndExtent(node, at + data.length, node, at + data.length);
    el.dispatchEvent(new InputEvent("input", { inputType: "insertCompositionText", data, isComposing: true }));
  },
  // A Shift+Enter, Tab or Shift+Tab that ends a composition, in the order the macOS Korean input method sends it in
  // Electron 45 (measured): keydown (229, composing), the syllable's commit and compositionend, an immediate keyup, then
  // with \`resend\` the same key again as an ordinary keydown (and insertLineBreak for Shift+Enter), all in one task;
  // the real keyup comes later. Returns whether the composing keydown and the second keydown were prevented.
  endWith(key, shift, resend) {
    const code = key === "Enter" ? 13 : 9;
    const down = (keyCode, isComposing) => { const e = new KeyboardEvent("keydown", { key, code: key, keyCode, shiftKey: shift, isComposing, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    const first = down(229, true);
    const data = document.getSelection().focusNode.data.slice(-1);
    el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertCompositionText", data, isComposing: true, bubbles: true, cancelable: true }));
    el.dispatchEvent(new CompositionEvent("compositionend", { data }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, keyCode: code, shiftKey: shift, bubbles: true }));
    if (!resend) return [first, null];
    const second = down(code, false);
    // A prevented keydown has no input of its own.
    if (key === "Enter" && !second) probe.input("insertLineBreak");
    return [first, second];
  },
  keydown(key, shift) { const e = new KeyboardEvent("keydown", { key, code: key, shiftKey: shift, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; },
  indent: dir => field.indent(dir),
  setHost(patch) { Object.assign(host, patch); },
  focused: () => document.activeElement?.id,
  lock() { el.contentEditable = "false"; },
  dispose() { field.dispose(); },
  // A copy event with its own DataTransfer: what the field puts on the clipboard, without the system clipboard.
  copy() { const data = new DataTransfer(); el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true })); return data.getData("text/plain"); },
  // Several page steps in one task, so nothing the field schedules runs between them.
  run(steps) { return steps.map(([name, ...args]) => window.probe[name](...args)); },
  input(inputType) { const e = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; },
};`;

async function open(segments: FieldSegment[] | string, around = { before: '<button id="before">before</button>', after: '<button id="after">after</button>' }): Promise<void> {
  frame = await dom.load(`<!doctype html><meta charset="utf-8"><style>${css}</style>${around.before}<div id="f" class="composer-input" contenteditable="true" tabindex="0"></div>${around.after}<script>${bundle}</script><script>${PAGE}</script>`);
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

test("list lines draw marker and depth spans over the typed text, without a hanging indent", { timeout: 60_000 }, async () => {
  await open(NESTED);
  expect(await call("spans")).toEqual([
    'list-mark:ul "- "', 'list-depth:1 "  "', 'list-mark:ul "- "', 'skill-word "/copy-check"', 'list-depth:2 "    "', 'list-mark:ul "- "',
    'list-mark:ul "* "', 'list-mark:ol "1. "', 'list-depth:1 "   "', 'list-mark:ol "1. "',
  ]);
  expect(await consistent()).toBe(true);
  // Every marker stands one --space-5 step (20 px) in and each depth adds a step; the marker column is --space-3
  // (12 px), wider for a number; the bullet's characters are not painted.
  expect(await call("box", ".list-depth", 0)).toMatchObject({ x: 0, w: 20 });
  expect(await call("box", ".list-depth", 1)).toMatchObject({ x: 0, w: 40 });
  expect(await call("box", ".list-mark", 0)).toMatchObject({ x: 20, w: 12 });
  expect(await call("box", ".list-mark", 1)).toMatchObject({ x: 40, w: 12 });
  expect(await call("box", ".list-mark", 2)).toMatchObject({ x: 60, w: 12 });
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".list-mark")!).color)).toBe("rgba(0, 0, 0, 0)");
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".list-mark")!, "::before").content)).toBe('"•"');
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector('.list-mark[data-kind="ol"]')!).color)).toBe("rgb(26, 26, 26)");
});

test("a depth-0 item's typed leading spaces take no width; a long item wraps to the line start", { timeout: 60_000 }, async () => {
  await open("  - Make the hero headline shorter so it fits on one line at the narrowest window width");
  expect(await call("spans")).toEqual(['list-depth:0 "  "', 'list-mark:ul "- "']);
  expect(await call("box", ".list-mark")).toMatchObject({ x: 20, y: 0 });
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

test("← and → skip an item's prefix, stopping only at the line start and the body start", { timeout: 60_000 }, async () => {
  await open(NESTED);
  // "- Title": line start 6, body start 8. "    - Under 40": line start 40, body start 46.
  await call("place", 8); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 6, focus: 6 });
  // A depth-0 line start paints at the marker, not at the line's left edge 20 px before it.
  expect((await call<{ x: number }>("caret")).x).toBe(20);
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

test("a chip that starts an item's body keeps its own arrow steps and a filler after the marker", { timeout: 60_000 }, async () => {
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

test("a caret left inside a prefix or at the marker span's end moves to the body's text", { timeout: 60_000 }, async () => {
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

test("an empty item's caret stands after the marker, outside it, and typing fills the body", { timeout: 60_000 }, async () => {
  await open("a\n- ");
  const caret = await call<{ x: number; y: number }>("caret");
  expect(caret.x).toBe(32);
  expect(caret.y).toBeGreaterThanOrEqual(24);
  expect(caret.y).toBeLessThan(48);
  expect(await call("host")).not.toMatch(/list-/);
  await press("x");
  expect(await text()).toBe("a\n- x");
  expect(await consistent()).toBe(true);
});

test("Backspace at a body start removes the marker or outdents, each one undo step", { timeout: 60_000 }, async () => {
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

test("Shift+Enter continues, outdents and ends a list; each is one undo step apart from the typing", { timeout: 60_000 }, async () => {
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

test("Shift+Enter at the field's maximum height scrolls the new line into view, on a list or off it", { timeout: 60_000 }, async () => {
  for (const start of ["one\ntwo\nthree\nfour", "- one\n- two\n- three\n- four"]) {
    await open(start);
    // Four rows of 24 px, as the composers cap theirs at eight.
    await frame.evaluate(() => { document.getElementById("f")!.style.maxHeight = "96px"; });
    await call("place", start.length);
    for (let line = 0; line < 3; line++) {
      await press("Shift+Enter");
      const caret = await call<{ top: number; bottom: number; height: number; scrolled: boolean } | null>("caretInView");
      expect(caret).not.toBeNull();
      expect(caret!.scrolled).toBe(true);
      expect(caret!.top).toBeGreaterThanOrEqual(0);
      expect(caret!.bottom).toBeLessThanOrEqual(caret!.height);
    }
  }
  // At the end of the last visible row, with lines below: the new line is empty, and it comes into view, not the end.
  for (const start of ["1\n2\n3\n4\n5\n6\n7\n8", "1\n2\n3\n4\n5\n6\n7\n8\n"]) {
    await open(start);
    await frame.evaluate(() => { const el = document.getElementById("f")!; el.style.maxHeight = "96px"; el.scrollTop = 0; });
    await call("place", 7);
    await press("Shift+Enter");
    expect(await text()).toBe(start.replace("4\n", "4\n\n"));
    const caret = await call<{ top: number; bottom: number; height: number; scrolled: boolean } | null>("caretInView");
    expect(caret).not.toBeNull();
    expect(caret!.scrolled).toBe(true);
    expect(caret!.top).toBeGreaterThanOrEqual(0);
    expect(caret!.bottom).toBeLessThanOrEqual(caret!.height);
  }
});

test("Tab's indent moves an item under the one above as one undo step, and refuses with no parent", { timeout: 60_000 }, async () => {
  await open("- a\n- b");
  expect(await frame.evaluate(() => (window as unknown as { probe: { field: { indent(dir: number): boolean } } }).probe.field.indent(1))).toBe(true);
  expect(await text()).toBe("- a\n  - b");
  expect(await call("spans")).toEqual(['list-mark:ul "- "', 'list-depth:1 "  "', 'list-mark:ul "- "']);
  expect(await frame.evaluate(() => (window as unknown as { probe: { field: { indent(dir: number): boolean } } }).probe.field.indent(1))).toBe(false);
  await press("Meta+z");
  expect(await text()).toBe("- a\n- b");
});

// Each composition below leaves a syllable in the DOM, as the Korean input method does, and that syllable must reach
// the text before the key acts on it.
type Step = [string, ...unknown[]];
const run = (...steps: Step[]) => call<unknown[]>("run", steps);
async function composeThenPress(start: string, caret: number, key: "Enter" | "Tab", shift: boolean, resend = true, host?: Record<string, unknown>): Promise<unknown> {
  await open(start);
  await call("place", caret);
  if (host) await call("setHost", host);
  const [, , pressed] = await run(["compose", "compositionstart"], ["composeText", "나"], ["endWith", key, shift, resend]);
  await dom.flush(frame);
  return pressed;
}

test("Shift+Enter ending a composition continues the list once, after the syllable, in the measured macOS order", { timeout: 60_000 }, async () => {
  expect(await composeThenPress("- a", 3, "Enter", true)).toEqual([false, false]);
  expect(await text()).toBe("- a나\n- ");
  expect(await consistent()).toBe(true);
  await press("Meta+z");
  expect(await text()).toBe("- a나");
});

test("Tab and Shift+Tab ending a composition move the item once and keep focus; a line that cannot move lets focus go", { timeout: 60_000 }, async () => {
  expect(await composeThenPress("- a\n- b", 7, "Tab", false)).toEqual([true, true]);
  expect(await text()).toBe("- a\n  - b나");
  await press("Meta+z");
  expect(await text()).toBe("- a\n- b나");
  expect(await composeThenPress("- a\n  - b", 9, "Tab", true)).toEqual([true, true]);
  expect(await text()).toBe("- a\n- b나");
  // The composing keydown is prevented either way (it changes nothing on macOS); the ordinary Tab after it moves focus.
  expect(await composeThenPress("plain", 5, "Tab", false)).toEqual([true, false]);
  expect(await text()).toBe("plain나");
});

test("Shift+Enter ending a composition and then Tab indent the new item, from a first or a second item", { timeout: 60_000 }, async () => {
  for (const [start, caret, expected] of [["- a", 3, "- a나\n  - "], ["- a\n- b", 7, "- a\n- b나\n  - "]] as const) {
    await composeThenPress(start, caret, "Enter", true);
    // The Shift+Enter ended the composition, so this Tab is an ordinary press.
    expect(await call("keydown", "Tab", false)).toBe(true);
    expect(await text()).toBe(expected);
    expect(await consistent()).toBe(true);
  }
});

test("an input method that does not send the key again gets the edit once from compositionend's deferred run", { timeout: 60_000 }, async () => {
  expect(await composeThenPress("- a", 3, "Enter", true, false)).toEqual([false, null]);
  expect(await text()).toBe("- a나\n- ");
  expect(await composeThenPress("- a\n- b", 7, "Tab", false, false)).toEqual([true, null]);
  expect(await text()).toBe("- a\n  - b나");
});

test("a resent key the host takes answers the press: no line break or indent comes after it", { timeout: 60_000 }, async () => {
  // Home's \`/\` list picks the skill on the resent Enter (slashKey ignores Shift) and prevents it.
  expect(await composeThenPress("/", 1, "Enter", true, true, { slash: true })).toEqual([false, true]);
  expect(await text()).toBe("/demo ");
  // The \`/\` list closes on the composing Tab, so no press is kept; the resent Tab is an ordinary one off a list.
  expect(await composeThenPress("/", 1, "Tab", false, true, { slash: true })).toEqual([false, false]);
  expect(await text()).toBe("/나");
  // A host that takes the resent Tab itself, as the next-message suggestion takes Tab on an empty field.
  expect(await composeThenPress("- a\n- b", 7, "Tab", false, true, { takes: "Tab" })).toEqual([true, true]);
  expect(await text()).toBe("- a\n- b나Next");
});

test("without a resent Tab, one that cannot move the item moves focus from the deferred run", { timeout: 60_000 }, async () => {
  await composeThenPress("- a", 3, "Tab", false, false);
  expect(await text()).toBe("- a나");
  expect(await call("focused")).toBe("after");
  await composeThenPress("- a", 3, "Tab", true, false);
  expect(await call("focused")).toBe("before");
  // A Tab that can move the item does not also move focus.
  await composeThenPress("- a\n- b", 7, "Tab", false, false);
  expect(await text()).toBe("- a\n  - b나");
  expect(await call("focused")).toBe("f");
});

test("a pending Shift+Enter or Tab does not edit a field locked or removed before the deferred run", { timeout: 60_000 }, async () => {
  for (const [key, shift] of [["Enter", true], ["Tab", false]] as const) {
    for (const close of ["lock", "dispose"]) {
      await open("- a\n- b");
      await call("place", 7);
      await run(["compose", "compositionstart"], ["composeText", "나"]);
      const changes = await call<number>("changes");
      // In the same task as compositionend, before its deferred run; no second key comes.
      await run(["endWith", key, shift, false], [close]);
      await dom.flush(frame);
      expect(await text()).toBe("- a\n- b나");
      // Only the composed text's own commit reached the host.
      expect(await call("changes")).toBe(changes + 1);
    }
  }
});

test("deletions the browser makes across the spans leave the field drawn as its text", { timeout: 60_000 }, async () => {
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

test("copy keeps the markers and depth spaces as typed", { timeout: 60_000 }, async () => {
  await open(NESTED);
  await call("place", 0, NESTED.length);
  // A real ⌘C would overwrite the person's system clipboard (POSTMORTEM 2026-10-27, runtime clipboard): the field's own copy handler
  // writes to the event's DataTransfer instead.
  expect(await call("copy")).toBe(NESTED);
});

const focused = () => frame.evaluate(() => document.activeElement?.id);
const moveFocus = (backward: boolean) => frame.evaluate(back => (window as unknown as { Probe: { moveFocus(from: HTMLElement, back: boolean): void } }).Probe.moveFocus(document.getElementById("f")!, back), backward);

test("Ctrl+Tab's focus move reaches the same stop as native Tab, passing over a disabled button with a tabindex", { timeout: 60_000 }, async () => {
  await open("- a\n  - b", {
    before: '<button id="before">before</button><button id="off-before" disabled tabindex="0">off</button>',
    after: '<button id="off-after" disabled tabindex="0">off</button><button id="after">after</button>',
  });
  // On the first item neither Tab nor Shift+Tab can move it, so native Tab moves focus there too.
  for (const [backward, key, expected] of [[false, "Tab", "after"], [true, "Shift+Tab", "before"]] as const) {
    await call("place", 3);
    await frame.press("#f", key);
    expect(await focused()).toBe(expected);
    await call("place", 3);
    await moveFocus(backward);
    expect(await focused()).toBe(expected);
  }
});
