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

// The composer field in the app's own Chromium, driven by real keys: what the caret, deletion, wrapping and IME
// handling do over list lines, chips and ProseMirror's paragraphs is decided by the engine's editing and layout code,
// which no fake DOM reproduces.

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const styles = readFileSync(here("./styles.css"), "utf8");
const tokens = readFileSync(here("./tokens.css"), "utf8");
const geist = readFileSync(here("./public/fonts/geist/Geist.woff2")).toString("base64");
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? "";
// The field's own rules from styles.css, over the tokens they read, in the app's font.
const css = [
  `@font-face { font-family: "Geist"; src: url(data:font/woff2;base64,${geist}) format("woff2"); font-weight: 100 900; }`,
  `:root { ${["--space-half", "--space-1", "--space-1h", "--space-3", "--space-5", "--type-label-size", "--type-label-line-height", "--type-label-letter-spacing", "--radius-word", "--size-icon-sm"].map(name => `${name}: ${token(name)};`).join(" ")} --type-family: "Geist", sans-serif; --text-standard: #1a1a1a; }`,
  "body { margin: 24px; font-family: sans-serif; }",
  ...styles.split("\n").filter(line => /^\.(composer-input|field-mark|field-depth|skill-word|anchor-chip)[ .[>:]/.test(line)),
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
      `export { ChipField, moveFocus, focusFieldEnd } from ${JSON.stringify(here("./chipField.ts"))};`,
      `export { slashKey } from ${JSON.stringify(here("./homeComposer.ts"))};`,
      `export { posFromUnit as posOf } from ${JSON.stringify(here("./fieldDoc.ts"))};`,
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
const announced = [];
const clicked = [];
const field = new Probe.ChipField(el, { onChange() { changes++; }, onInput() {}, onAnnounce(text) { announced.push(text); }, scope: () => "canvas",
  skillNames: () => new Set(["copy-check"]), commandNames: () => new Set(), onChipClick(anchor, chip) { clicked.push([anchor, chip.className]); } }, []);
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
// ComposerField's paste: the host leaves text alone, so the field pastes it.
el.addEventListener("paste", e => field.paste(e));
const rel = r => { const b = el.getBoundingClientRect(); return { x: Math.round((r.left - b.left) * 10) / 10, y: Math.round(r.top - b.top), top: Math.round(r.top - b.top), bottom: Math.round(r.bottom - b.top) }; };
// The text as drawn: each line block's text and chips, the drawn trailing break and separator left out, and a line's
// filler only where it stands before a line-start chip.
const drawnText = () => Array.from(el.children).map(line => {
  let out = "";
  const walk = node => { for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.data;
    else if (child.classList?.contains("anchor-chip")) out += "\\ufffc";
    else if (child.classList?.contains("field-filler") && child.textContent === "\\u200b" && !child.previousSibling && child.nextSibling?.classList?.contains("anchor-chip")) continue;
    else if (child.nodeName !== "BR" && child.nodeName !== "IMG") walk(child);
  } };
  walk(line);
  return out;
}).join("\\n");
const probe = window.probe = {
  field,
  set(segments) { el.focus(); field.setValue(segments, String(++draft)); },
  text: () => field.segments.map(s => s.kind === "text" ? s.text : "\\ufffc").join(""),
  segments: () => field.segments,
  place(anchor, focus = anchor) { el.focus(); field.placeCaret({ anchor, focus }); },
  sel: () => field.readSelection(),
  consistent: () => drawnText() === probe.text(),
  spans: () => Array.from(el.querySelectorAll(".field-mark,.field-depth,.skill-word")).map(n => n.className + (n.dataset.kind ? ":" + n.dataset.kind : "") + " " + JSON.stringify(n.textContent)),
  items: () => Array.from(el.children).map(n => n.classList.contains("field-item") ? getComputedStyle(n).paddingInlineStart + " " + getComputedStyle(n).textIndent : "-"),
  box(selector, i = 0) { const n = el.querySelectorAll(selector)[i].getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: Math.round((n.left - b.left) * 10) / 10, y: Math.round(n.top - b.top), w: Math.round(n.width * 10) / 10, h: Math.round(n.height) }; },
  // The DOM selection's focus as drawn, or the editor's own measure where a collapsed range has no rect (an empty line).
  caret() {
    const s = document.getSelection(), range = document.createRange();
    range.setStart(s.focusNode, s.focusOffset);
    const r = range.getClientRects()[0];
    return rel(r ?? field.view.coordsAtPos(field.view.state.selection.head));
  },
  // Every unit's box in line \`line\` (0-based), relative to the field: [x, y] of each character or chip.
  rects(line) {
    const div = el.children[line], out = [];
    const walk = node => { for (const child of node.childNodes) {
      if (child.nodeType === 3) for (let i = 0; i < child.length; i++) { const range = document.createRange(); range.setStart(child, i); range.setEnd(child, i + 1); const r = rel(range.getBoundingClientRect()); out.push([r.x, r.y]); }
      else if (child.classList?.contains("anchor-chip")) { const r = rel(child.getBoundingClientRect()); out.push([r.x, r.y]); }
      else if (child.nodeName !== "BR" && child.nodeName !== "IMG") walk(child);
    } };
    walk(div);
    return out;
  },
  caretInView() {
    const r = field.view.coordsAtPos(field.view.state.selection.head), b = el.getBoundingClientRect();
    return { top: Math.round(r.top - b.top), bottom: Math.round(r.bottom - b.top), height: Math.round(b.height), scrolled: el.scrollTop > 0 };
  },
  changes: () => changes,
  announced: () => announced,
  clicked: () => clicked.map(([a, c]) => [a, c]),
  compose(type) { el.dispatchEvent(new CompositionEvent(type, { data: "" })); },
  // What an input method does while composing: the marked text goes into the DOM at the caret, and input follows.
  composeText(data) {
    const s = document.getSelection();
    let node = s.focusNode, at = s.focusOffset;
    if (node.nodeType !== 3) { const text = document.createTextNode(""); node.insertBefore(text, node.childNodes[at] ?? null); node = text; at = 0; }
    node.insertData(at, data);
    s.setBaseAndExtent(node, at + data.length, node, at + data.length);
    el.dispatchEvent(new InputEvent("input", { inputType: "insertCompositionText", data, isComposing: true }));
  },
  // A Shift+Enter, Tab or Shift+Tab that ends a composition, in the order the macOS Korean input method sends it in
  // Electron 45 (measured): keydown (229, composing), the syllable's commit and compositionend, an immediate keyup, then
  // with \`resend\` the same key again as an ordinary keydown (and insertLineBreak for an unprevented Shift+Enter), all
  // in one task; the real keyup comes later. Returns whether the composing keydown and the second keydown were prevented.
  endWith(key, shift, resend) {
    const code = key === "Enter" ? 13 : 9;
    const down = (keyCode, isComposing) => { const e = new KeyboardEvent("keydown", { key, code: key, keyCode, shiftKey: shift, isComposing, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    const first = down(229, true);
    const data = document.getSelection().focusNode.data?.slice(-1) ?? "";
    el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertCompositionText", data, isComposing: true, bubbles: true, cancelable: true }));
    el.dispatchEvent(new CompositionEvent("compositionend", { data, bubbles: true }));
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
  unlock() { el.contentEditable = "true"; },
  dispose() { field.dispose(); },
  // React keeps the element when it creates the field again (StrictMode runs the layout effect twice).
  recreate() { field.dispose(); probe.field = new Probe.ChipField(el, { onChange() {}, onInput() {}, onAnnounce() {}, scope: () => "canvas" }, [{ kind: "text", text: "- a" }], "again"); return el.getAttribute("contenteditable"); },
  blur() { document.getElementById("before").focus(); },
  // A copy or cut event with its own DataTransfer: what the field puts on the clipboard, without the system clipboard.
  copy(type = "copy") { const data = new DataTransfer(); el.dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true })); return [data.getData("text/plain"), data.getData("application/x-doan-field+json")]; },
  paste(text, json) { const data = new DataTransfer(); data.setData("text/plain", text); if (json) data.setData("application/x-doan-field+json", json); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); },
  // Several page steps in one task, so nothing the field schedules runs between them.
  run(steps) { return steps.map(([name, ...args]) => window.probe[name](...args)); },
  input(inputType, data) { const e = new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; },
  // A spelling suggestion: the browser names the word's range and the replacement.
  replaceWord(unit, length, data) {
    const v = field.view, doc = v.state.doc;
    const start = v.domAtPos(Probe.posOf(doc, unit)), end = v.domAtPos(Probe.posOf(doc, unit + length));
    const range = new StaticRange({ startContainer: start.node, startOffset: start.offset, endContainer: end.node, endOffset: end.offset });
    const e = new InputEvent("beforeinput", { inputType: "insertReplacementText", data, targetRanges: [range], bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  },
  menu(inputType) { return probe.input(inputType); },
  insertChip: anchor => field.insertChip(anchor),
  focusEnd() { Probe.focusFieldEnd(el); },
  fieldFocusEnd() { field.focus(true); },
  scrollTop: () => el.scrollTop,
  setMax(px) { el.style.maxHeight = px + "px"; },
  setWidth(px) { el.style.width = px + "px"; },
};`;

async function open(segments: FieldSegment[] | string, around = { before: '<button id="before">before</button>', after: '<button id="after">after</button>' }): Promise<void> {
  frame = await dom.load(`<!doctype html><meta charset="utf-8"><style>${css}</style>${around.before}<div id="f" class="composer-input" contenteditable="true" tabindex="0" role="textbox" aria-multiline="true" aria-label="Message" aria-placeholder="Message"></div>${around.after}<script>${bundle}</script><script>${PAGE}</script>`);
  await frame.evaluate(() => document.fonts.load('16px "Geist"').then(() => undefined));
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
const caret = () => call<{ x: number; y: number }>("caret");
const rects = (line: number) => call<[number, number][]>("rects", line);

const NESTED = "Intro\n- Title\n  - Run /copy-check on it\n    - Under 40\n* Buttons\n1. Header\n   1. Logo";
const LONG = "Make the hero headline shorter so it fits on one line at the narrowest window width";

const CHIP = { frame: { id: "hero", title: "Hero" } };
const chip = (anchor: unknown = CHIP): FieldSegment => ({ kind: "chip", anchor: anchor as never });
const plain = (value: string): FieldSegment => ({ kind: "text", text: value });
// The drawn rows of a line's boxes, by 24 px row (a chip's box starts a little above the text's).
const row = (y: number) => Math.floor((y + 6) / 24);
const rows = (boxes: [number, number][]) => [...new Set(boxes.map(([, y]) => row(y)))];
// The x of the first unit on each drawn row after the first.
const wrappedStarts = (boxes: [number, number][]) => rows(boxes).slice(1).map(r => boxes.find(box => row(box[1]) === r)![0]);
async function cdp() {
  const page = frame.page();
  const session = await page.context().newCDPSession(page);
  return { send: (method: string, params?: Record<string, unknown>) => session.send(method as never, params as never) as Promise<Record<string, unknown>> };
}
// The accessibility value of the field's textbox, as a screen reader receives it.
async function textboxValue(): Promise<string> {
  const session = await cdp();
  const tree = await session.send("Page.getFrameTree") as { frameTree: { childFrames: { frame: { id: string } }[] } };
  const { nodes } = await session.send("Accessibility.getFullAXTree", { frameId: tree.frameTree.childFrames[0]!.frame.id }) as { nodes: { role?: { value: string }; value?: { value: string } }[] };
  return nodes.find(node => node.role?.value === "textbox")?.value?.value ?? "";
}

test("a list item wraps under its own body, at every depth and marker width", { timeout: 60_000 }, async () => {
  await open(NESTED);
  expect(await call("spans")).toEqual([
    'field-mark:ul "-"', 'field-depth "  "', 'field-mark:ul "-"', 'skill-word "/copy-check"', 'field-depth "    "', 'field-mark:ul "-"',
    'field-mark:ul "*"', 'field-mark:ol "1."', 'field-depth "   "', 'field-mark:ol "1."',
  ]);
  expect(await consistent()).toBe(true);
  // A marker stands one --space-5 step in and each depth adds a step; the bullet's characters are not painted.
  expect(await call("box", ".field-mark", 0)).toMatchObject({ x: 20 });
  expect(await call("box", ".field-mark", 1)).toMatchObject({ x: 40 });
  expect(await call("box", ".field-mark", 2)).toMatchObject({ x: 60 });
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".field-mark")!).color)).toBe("rgba(0, 0, 0, 0)");
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector(".field-mark")!, "::before").content)).toBe('"•"');
  expect(await frame.evaluate(() => getComputedStyle(document.querySelector('.field-mark[data-kind="ol"]')!).color)).toBe("rgb(26, 26, 26)");
  // Each item's wrapped rows start at its own body start, within half a pixel: 32 px at depth 0, a step more per
  // depth, and a number wider than the column moves only its own item's body.
  const lines = ["- ", "  - ", "    - ", "9. ", "10. ", "100. ", "   1. "].map(marker => marker + LONG);
  await open(["Intro", ...lines].join("\n"));
  for (const [i, line] of lines.entries()) {
    const boxes = await rects(i + 1), body = boxes[line.indexOf(LONG)]![0];
    expect(rows(boxes).length).toBeGreaterThan(1);
    for (const start of wrappedStarts(boxes)) expect(Math.abs(start - body)).toBeLessThanOrEqual(0.5);
    if (i < 3) expect(body).toBe(32 + 20 * i);
  }
  const [nine, ten, hundred] = await Promise.all([4, 5, 6].map(async line => (await rects(line))[lines[line - 1]!.indexOf(LONG)]![0]));
  expect(ten).toBeGreaterThan(nine!);
  expect(hundred).toBeGreaterThan(ten!);
});

test("depth spaces take no width, and lines off a list wrap to the line start", { timeout: 60_000 }, async () => {
  // A depth-0 item's typed leading spaces, and two or four typed spaces for the same depth, draw at the same place.
  await open("- a\n  - b\n- c\n    - d\n  - e");
  expect(await call("box", ".field-depth", 0)).toMatchObject({ w: 0 });
  const marks = await Promise.all([0, 1, 2, 3].map(i => call<{ x: number }>("box", ".field-mark", i)));
  expect(marks.map(mark => mark.x)).toEqual([20, 40, 20, 40]);
  await open("  - a\n- b");
  expect(await call("box", ".field-depth", 0)).toMatchObject({ w: 0 });
  expect(await call("box", ".field-mark", 0)).toMatchObject({ x: 20 });
  // A plain line, an indented plain line and a line that starts with a chip wrap at the field's left edge.
  await open([plain(`${LONG}\n   ${LONG}\n`), chip(), plain(` ${LONG}`)]);
  for (const line of [0, 1, 2]) expect(wrappedStarts(await rects(line))).toEqual(expect.arrayContaining([0]));
  // An item whose wrapped rows start with chips puts each such chip at the body start (its 2 px margin in).
  await open([plain("- "), ...Array.from({ length: 6 }, () => [chip(), plain(" ")]).flat()]);
  const boxes = await rects(0);
  expect(rows(boxes).length).toBeGreaterThan(1);
  for (const start of wrappedStarts(boxes)) { expect(start).toBeGreaterThanOrEqual(32); expect(start).toBeLessThanOrEqual(34); }
  // A long word breaks anywhere, its rows at the body start; a narrower field wraps at the body start too.
  await open(`- ${"Supercalifragilistic".repeat(4)}`);
  expect(wrappedStarts(await rects(0)).every(x => x === 32)).toBe(true);
  await call("setWidth", 180);
  await open(`- ${LONG}`);
  await call("setWidth", 180);
  expect(rows(await rects(0)).length).toBeGreaterThan(3);
  expect(wrappedStarts(await rects(0)).every(x => Math.abs(x - 32) <= 0.5)).toBe(true);
});

test("the line-start caret stands before the marker at every depth, the body-start caret at the body", { timeout: 60_000 }, async () => {
  await open(NESTED);
  // "- Title" starts at 6 (body 8), "  - Run" at 14 (body 18), "    - Under 40" at 40 (body 46).
  for (const [unit, x] of [[6, 20], [8, 32], [14, 40], [18, 52], [40, 60], [46, 72]] as const) {
    await call("place", unit);
    expect((await caret()).x).toBe(x);
  }
  // An empty item's caret stands at the body start and typing fills the body, outside the marker.
  await open("a\n- ");
  expect(await caret()).toMatchObject({ x: 32, y: 26 });
  await press("x");
  expect(await text()).toBe("a\n- x");
  expect(await frame.evaluate(() => document.getSelection()!.focusNode!.parentElement!.className)).not.toMatch(/field-(mark|depth)/);
  expect(await consistent()).toBe(true);
  // Typing at the line start, before the marker, makes the line plain text.
  await call("place", 2);
  await press("z");
  expect(await text()).toBe("a\nz- x");
  expect(await call("spans")).toEqual([]);
});

test("← and → skip an item's prefix, stopping only at the line start and the body start", { timeout: 60_000 }, async () => {
  await open(NESTED);
  await call("place", 8); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 6, focus: 6 });
  expect((await caret()).x).toBe(20);
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
  // ⌥← and ⌥→ move by words; ⌥→ at a line's end stops at the next line's first stop.
  await open("first line\n- next item\nplain words here");
  await call("place", 10);
  for (const unit of [13, 17, 22]) { await press("Alt+ArrowRight"); expect(await sel()).toEqual({ anchor: unit, focus: unit }); }
  await open("first line\nsecond word");
  await call("place", 10);
  for (const unit of [11, 17]) { await press("Alt+ArrowRight"); expect(await sel()).toEqual({ anchor: unit, focus: unit }); }
  await call("place", 13); await press("Alt+ArrowLeft");
  expect(await sel()).toEqual({ anchor: 11, focus: 11 });
});

test("a chip keeps its own arrow steps after a marker and at a line start, where the caret has a place", { timeout: 60_000 }, async () => {
  await open([plain("a\n- "), chip(), plain(" body")]);
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
  // A line that starts with a chip: the caret before it is on its row, one ← reaches the line above, and typing there
  // goes before the chip.
  await open([plain("a\n"), chip(), plain(" body")]);
  await call("place", 3); await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  expect(await caret()).toMatchObject({ x: 0, y: 26 });
  await press("ArrowLeft");
  expect(await sel()).toEqual({ anchor: 1, focus: 1 });
  await press("ArrowRight");
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  await press("x");
  expect(await text()).toBe("a\nx￼ body");
  expect(await consistent()).toBe(true);
  await open([plain("a\n"), chip(), plain(" body")]);
  await call("place", 2); await press("Backspace");
  expect(await text()).toBe("a￼ body");
  expect(await consistent()).toBe(true);
});

test("a caret left inside a prefix moves to the body start", { timeout: 60_000 }, async () => {
  await open("- Title\n  - Child");
  // Inside the depth spaces of "  - Child" (line start 8): the browser's caret after a click or ↑/↓.
  await frame.evaluate(() => { const depth = document.querySelector(".field-depth")!.firstChild!; document.getSelection()!.setBaseAndExtent(depth, 1, depth, 1); });
  await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 12, focus: 12 });
  // Between the marker and its space.
  await frame.evaluate(() => { const mark = document.querySelector(".field-mark")!.firstChild!; document.getSelection()!.setBaseAndExtent(mark, 1, mark, 1); });
  await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  await press("Z");
  expect(await text()).toBe("- ZTitle\n  - Child");
  expect(await consistent()).toBe(true);
});

test("↑ and ↓ pass the wrapped rows one by one and come back to the same place", { timeout: 60_000 }, async () => {
  const start = `Intro text here\n- ${LONG}\nplain line`;
  await open(start);
  // Body start 18; the item's rows start at 55 and 89 (measured), all at the body's x.
  await call("place", 18);
  const visited: number[] = [];
  for (let i = 0; i < 3; i++) { await press("ArrowDown"); visited.push((await sel()).focus); }
  expect(visited.slice(0, 2)).toEqual([55, 89]);
  expect(visited[2]).toBeGreaterThan(start.indexOf("plain"));
  for (let i = 0; i < 3; i++) await press("ArrowUp");
  expect(await sel()).toEqual({ anchor: 18, focus: 18 });
  expect((await caret()).x).toBe(32);
  // Into an item from a plain line and back: the same unit and x within a pixel.
  await open("plain line here\n- item one\nplain");
  await call("place", 3);
  const before = await caret();
  await press("ArrowDown"); await press("ArrowUp");
  expect(await sel()).toEqual({ anchor: 3, focus: 3 });
  expect(Math.abs((await caret()).x - before.x)).toBeLessThanOrEqual(1);
  // From an item's body start down onto a plain line and back up: the body start again.
  await open("- item one\nplain line here");
  await call("place", 2); await press("ArrowDown"); await press("ArrowUp");
  expect(await sel()).toEqual({ anchor: 2, focus: 2 });
  // ↓ on the last item's last row goes to the end.
  await open(`- a\n- ${LONG}`);
  await call("place", 70); await press("ArrowDown");
  expect(await sel()).toEqual({ anchor: 4 + 2 + LONG.length, focus: 4 + 2 + LONG.length });
});

test("⌘← and ⌘→ stop at a wrapped row's start (the body start) and end, with or without Shift", { timeout: 60_000 }, async () => {
  await open(`Intro text here\n- ${LONG}\nplain line`);
  await call("place", 60); await press("Meta+ArrowLeft");
  expect(await sel()).toEqual({ anchor: 55, focus: 55 });
  await press("Meta+ArrowRight");
  expect(await sel()).toEqual({ anchor: 89, focus: 89 });
  await call("place", 30); await press("Meta+ArrowLeft");
  expect(await sel()).toEqual({ anchor: 16, focus: 16 });
  await call("place", 60); await press("Shift+Meta+ArrowLeft");
  expect(await sel()).toEqual({ anchor: 60, focus: 55 });
  await call("place", 60); await press("Shift+Meta+ArrowRight");
  expect(await sel()).toEqual({ anchor: 60, focus: 89 });
});

test("Shift+↓, a drag, three clicks and two clicks select as on plain lines", { timeout: 60_000 }, async () => {
  await open("one two\nthree four\nfive");
  await call("place", 2); await press("Shift+ArrowDown");
  expect(await sel()).toEqual({ anchor: 2, focus: 10 });
  // Three clicks take the line with its line break, so typing replaces the whole line; two clicks take the word only.
  await frame.locator("#f").click({ position: { x: 30, y: 30 }, clickCount: 3 }); await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 8, focus: 19 });
  await press("X");
  expect(await text()).toBe("one two\nXfive");
  await open("- one two\n- three four");
  await frame.locator("#f").click({ position: { x: 60, y: 30 }, clickCount: 3 }); await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 10, focus: 22 });
  await open("one two\nthree four");
  await frame.locator("#f").click({ position: { x: 20, y: 30 }, clickCount: 2 }); await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 8, focus: 13 });
  expect(await frame.evaluate(() => document.getSelection()!.toString())).toBe("three");
  // A drag from the first line into the second item's body.
  await open("- one two\n- three four");
  const box = (await frame.locator("#f").boundingBox())!;
  await frame.page().mouse.move(box.x + 40, box.y + 12);
  await frame.page().mouse.down();
  await frame.page().mouse.move(box.x + 60, box.y + 36, { steps: 4 });
  await frame.page().mouse.up();
  await dom.flush(frame);
  const dragged = await sel();
  expect(dragged.anchor).toBeLessThan(5);
  expect(dragged.focus).toBeGreaterThan(12);
});

test("deletions across a line boundary take exactly one line break; ⌘⌫ and ⌘⌦ take the drawn row", { timeout: 60_000 }, async () => {
  for (const [key, caretAt, expected] of [
    ["Backspace", 3, "abcd"], ["Delete", 2, "abcd"], ["Alt+Backspace", 3, "abcd"], ["Alt+Delete", 2, "abcd"], ["Control+h", 3, "abcd"],
    ["Control+d", 2, "abcd"], ["Control+k", 2, "abcd"], ["Meta+Backspace", 3, "abcd"],
  ] as const) {
    await open("ab\ncd");
    await call("place", caretAt); await press(key);
    expect([key, await text()]).toEqual([key, expected]);
    expect(await consistent()).toBe(true);
  }
  await open("- ab\n- cd");
  await call("place", 5); await press("Backspace");
  expect(await text()).toBe("- ab- cd");
  // ⌘⌫ on a wrapped item's second row takes that row's part only; on the first row the line's start.
  await open(`- ${LONG}`);
  await call("place", 70); await press("Meta+Backspace");
  expect(await text()).toBe("- Make the hero headline shorter so it st window width");
  await open(`x\n- ${LONG}`);
  await call("place", 12); await press("Meta+Backspace");
  expect(await text()).toBe(`x\n${LONG.slice(8)}`);
  await open(`- ${LONG}`);
  await call("place", 10); await press("Meta+Delete");
  expect(await text()).toBe("- Make thefits on one line at the narrowest window width");
  // ⌃T at a line start swaps nothing across the line; inside a line it swaps two characters.
  await open("ab\ncd");
  await call("place", 3); await press("Control+t");
  expect(await text()).toBe("ab\ncd");
  await open("abc");
  await call("place", 1); await press("Control+t");
  expect(await text()).toBe("bac");
});

test("emoji, surrogate pairs and ZWJ sequences at a line boundary delete whole", { timeout: 60_000 }, async () => {
  await open("a😀\nb👨‍👩‍👧");
  await call("place", 4); await press("Backspace");
  expect(await text()).toBe("a😀b👨‍👩‍👧");
  await press("Backspace");
  expect(await text()).toBe("ab👨‍👩‍👧");
  await press("Meta+ArrowRight"); await press("Backspace");
  expect(await text()).toBe("ab");
  await open("a\n😀b🇰🇷");
  await call("place", 1); await press("Delete");
  expect(await text()).toBe("a😀b🇰🇷");
  await press("Delete");
  expect(await text()).toBe("ab🇰🇷");
  await press("Meta+ArrowRight"); await press("Backspace");
  expect(await text()).toBe("ab");
  expect(await consistent()).toBe(true);
});

test("typing, paste, cut and ⌘A over a selection across lines leave the right text", { timeout: 60_000 }, async () => {
  await open("- ab\n- cd");
  await call("place", 3, 8); await press("X");
  expect(await text()).toBe("- aXd");
  expect(await sel()).toEqual({ anchor: 4, focus: 4 });
  await open("- ab\n- cd");
  await call("place", 3, 8); await call("paste", "1\n- 2\n3");
  expect(await text()).toBe("- a1\n- 2\n3d");
  expect(await sel()).toEqual({ anchor: 10, focus: 10 });
  expect(await consistent()).toBe(true);
  await open("- ab\n- cd");
  await call("place", 3, 8);
  expect(await call("copy", "cut")).toEqual(["b\n- c", ""]);
  expect(await text()).toBe("- ad");
  await open("- a\n- b\nc");
  await press("Meta+a");
  expect(await sel()).toEqual({ anchor: 0, focus: 9 });
  await press("Z");
  expect(await text()).toBe("Z");
  await open("- a\n- b\nc");
  await press("Meta+a"); await press("Backspace");
  expect(await text()).toBe("");
  expect(await frame.evaluate(() => document.getElementById("f")!.hasAttribute("data-empty"))).toBe(true);
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
  await press("Meta+Shift+z");
  expect(await text()).toBe("1. Header\n   1. Logox");
  // Off a list a Shift+Enter is a typed line break, one step with the typing around it.
  await open("");
  for (const key of ["a", "b", "Shift+Enter", "c"]) await press(key);
  expect(await text()).toBe("ab\nc");
  await press("Meta+z");
  expect(await text()).toBe("");
});

test("undo steps: a line-boundary deletion joins the typing, a caret move starts a new step, a list made by typing undoes", { timeout: 60_000 }, async () => {
  await open("ab\ncd");
  await call("place", 3); await press("Backspace"); await press("y");
  expect(await text()).toBe("abycd");
  await press("Meta+z");
  expect(await text()).toBe("ab\ncd");
  await open("ab");
  await call("place", 2); await press("x");
  await call("place", 0); await press("y");
  await press("Meta+z");
  expect(await text()).toBe("abx");
  await press("Meta+z");
  expect(await text()).toBe("ab");
  // Typing "1. " turns the line into an item, drawn at once; undo brings the plain line back.
  await open("a\n");
  for (const key of ["1", ".", " ", "b"]) await press(key);
  expect(await call("spans")).toEqual(['field-mark:ol "1."']);
  await press("Meta+z");
  expect(await text()).toBe("a\n");
  expect(await call("spans")).toEqual([]);
  // A deletion through a chip is a step of its own.
  await open([plain("ab "), chip()]);
  await call("place", 4); await press("x"); await press("ArrowLeft"); await press("Backspace");
  expect(await text()).toBe("ab x");
  await press("y"); await press("Meta+z");
  expect(await text()).toBe("ab x");
  await press("Meta+z");
  expect(await text()).toBe("ab ￼x");
});

test("Tab's indent moves an item under the one above as one undo step, and refuses with no parent", { timeout: 60_000 }, async () => {
  await open("- a\n- b");
  expect(await call("indent", 1)).toBe(true);
  expect(await text()).toBe("- a\n  - b");
  expect(await call("spans")).toEqual(['field-mark:ul "-"', 'field-depth "  "', 'field-mark:ul "-"']);
  expect(await call("indent", 1)).toBe(false);
  await press("Meta+z");
  expect(await text()).toBe("- a\n- b");
});

test("chips and skill words keep their behaviour in items and on wrapped rows", { timeout: 60_000 }, async () => {
  // A skill word on a wrapped item row is highlighted in place, and a chip word deletion stops at the chip.
  await open(`- ${LONG} /copy-check now`);
  expect(await call("spans")).toEqual(['field-mark:ul "-"', 'skill-word "/copy-check"']);
  const skill = await call<{ x: number; y: number }>("box", ".skill-word");
  expect(skill.y).toBeGreaterThan(24);
  await open([plain("- a "), chip(), plain("world")]);
  await call("place", 10); await press("Alt+Backspace");
  expect(await text()).toBe("- a ￼");
  await press("Alt+Backspace");
  expect(await text()).toBe("- a ");
  // A click on a chip puts the caret after it and tells the host.
  await open([plain("- a "), chip(), plain(" b")]);
  await frame.click(".anchor-chip"); await dom.flush(frame);
  expect(await sel()).toEqual({ anchor: 5, focus: 5 });
  expect(await call("clicked")).toEqual([[CHIP, "anchor-chip"]]);
  // Shift+Enter after a chip continues the list; a chip inserted by the host is one undo step.
  await call("place", 7); await press("Shift+Enter");
  expect(await text()).toBe("- a ￼ b\n- ");
  await open("- a");
  expect(await call("insertChip", CHIP)).toBe("inserted");
  expect(await text()).toBe("- a￼");
  await press("Meta+z");
  expect(await text()).toBe("- a");
});

test("a skill word announces once when typed, and not when the host sets the value", { timeout: 60_000 }, async () => {
  await open("- run /copy-check");
  expect(await call("announced")).toEqual([]);
  await call("place", 0);
  for (const key of ["/", "c", "o", "p", "y", "-", "c", "h", "e", "c", "k", " "]) await press(key);
  expect(await call("announced")).toEqual([]);
  await open("- run ");
  for (const key of ["/", "c", "o", "p", "y", "-", "c", "h", "e", "c", "k"]) await press(key);
  expect(await call("announced")).toEqual(["Project skill copy-check"]);
});

test("a spelling suggestion replaces its word inside an item without breaking the line", { timeout: 60_000 }, async () => {
  await open("- teh word\n- next");
  expect(await call("replaceWord", 2, 3, "the")).toBe(true);
  expect(await text()).toBe("- the word\n- next");
  expect(await call("spans")).toEqual(['field-mark:ul "-"', 'field-mark:ul "-"']);
  expect(await consistent()).toBe(true);
});

test("copy, the selected text and the accessibility value keep the typed text", { timeout: 60_000 }, async () => {
  await open(NESTED);
  await call("place", 0, NESTED.length);
  // A real ⌘C would overwrite the person's system clipboard (POSTMORTEM 2026-10-27, runtime clipboard): the field's own
  // copy handler writes to the event's DataTransfer instead.
  expect((await call<string[]>("copy"))[0]).toBe(NESTED);
  // Lines are blocks, but the selected text adds no line break of its own and has no bullet.
  expect(await frame.evaluate(() => document.getSelection()!.toString())).toBe(NESTED);
  expect(await textboxValue()).toBe(NESTED);
  // A blank line adds one line break to the accessibility value (accepted: send and copy are exact).
  await open("- a\n\n- b");
  expect(await textboxValue()).toBe("- a\n\n\n- b");
  // A chip's screen-reader prefix stays out of the selected text (Look Up's name) and of copy.
  await open([plain("- see "), chip(), plain(" now\n- x")]);
  await call("place", 0, 15);
  expect(await frame.evaluate(() => document.getSelection()!.toString())).not.toContain("Frame");
  expect((await call<string[]>("copy"))[0]).toBe("- see Hero now\n- x");
});

test("a trailing line break, an empty last line and a read-only field", { timeout: 60_000 }, async () => {
  await open("- a\n");
  expect(await caret()).toMatchObject({ x: 0, y: 26 });
  await press("x");
  expect(await text()).toBe("- a\nx");
  // The placeholder shows only while the field is completely empty.
  await open("\n");
  expect(await frame.evaluate(() => document.getElementById("f")!.hasAttribute("data-empty"))).toBe(false);
  await press("Backspace");
  expect(await frame.evaluate(() => document.getElementById("f")!.hasAttribute("data-empty"))).toBe(true);
  // Read-only: no edit, but selection and copy work, and ⌘Z changes nothing.
  await open("- a\n- b");
  await call("lock"); await dom.flush(frame);
  await call("place", 0, 7);
  expect((await call<string[]>("copy"))[0]).toBe("- a\n- b");
  await press("Meta+z"); await press("x");
  expect(await text()).toBe("- a\n- b");
  await call("unlock"); await dom.flush(frame);
  await call("place", 7); await press("x");
  expect(await text()).toBe("- a\n- bx");
});

test("Shift+Enter at the field's maximum height scrolls the new line into view, on a list or off it", { timeout: 60_000 }, async () => {
  for (const start of ["one\ntwo\nthree\nfour", "- one\n- two\n- three\n- four", `- one\n- two\n- ${LONG}`]) {
    await open(start);
    // Four rows of 24 px, as the composers cap theirs at eight.
    await call("setMax", 96);
    await call("place", start.length);
    for (let line = 0; line < 3; line++) {
      await press("Shift+Enter");
      const view = await call<{ top: number; bottom: number; height: number; scrolled: boolean }>("caretInView");
      expect(view.scrolled).toBe(true);
      expect(view.top).toBeGreaterThanOrEqual(0);
      expect(view.bottom).toBeLessThanOrEqual(view.height);
    }
  }
  // At the end of the last visible row, with lines below: the new line is empty, and it comes into view, not the end.
  for (const start of ["1\n2\n3\n4\n5\n6\n7\n8", "1\n2\n3\n4\n5\n6\n7\n8\n"]) {
    await open(start);
    await call("setMax", 96);
    await frame.evaluate(() => { document.getElementById("f")!.scrollTop = 0; });
    await call("place", 7);
    await press("Shift+Enter");
    expect(await text()).toBe(start.replace("4\n", "4\n\n"));
    const view = await call<{ top: number; bottom: number; height: number; scrolled: boolean }>("caretInView");
    expect(view.scrolled).toBe(true);
    expect(view.top).toBeGreaterThanOrEqual(0);
    expect(view.bottom).toBeLessThanOrEqual(view.height);
  }
});

test("a long draft focused at its end by code shows its caret at the field's maximum height", { timeout: 60_000 }, async () => {
  const draft = Array.from({ length: 14 }, (_, i) => `- line ${i + 1}`).join("\n");
  for (const how of ["focusEnd", "fieldFocusEnd"]) {
    await open(draft);
    await call("setMax", 192);
    await call("blur");
    await frame.evaluate(() => { document.getElementById("f")!.scrollTop = 0; });
    await call(how);
    expect(await call("focused")).toBe("f");
    expect(await sel()).toEqual({ anchor: draft.length, focus: draft.length });
    const view = await call<{ top: number; bottom: number; height: number; scrolled: boolean }>("caretInView");
    expect(view.scrolled).toBe(true);
    expect(view.top).toBeGreaterThanOrEqual(0);
    expect(view.bottom).toBeLessThanOrEqual(view.height);
  }
});

test("a read-only field still takes focus from code, and keeps its read-only state when the field is created again", { timeout: 60_000 }, async () => {
  // While a message is sending the composer is read-only, and the host focuses it again right after the send.
  for (const how of ["focusEnd", "fieldFocusEnd"]) {
    await open("- a");
    await call("lock"); await dom.flush(frame);
    await call("blur");
    await call(how);
    expect([how, await call("focused")]).toEqual([how, "f"]);
  }
  await open("- a");
  await call("lock"); await dom.flush(frame);
  expect(await call("recreate")).toBe("false");
  await dom.flush(frame);
  expect(await frame.evaluate(() => document.getElementById("f")!.isContentEditable)).toBe(false);
});

test("Edit > Undo and Redo from the menu step the field's history", { timeout: 60_000 }, async () => {
  await open("- a");
  await press("b"); await press("Shift+Enter");
  expect(await call("menu", "historyUndo")).toBe(true);
  expect(await text()).toBe("- ab");
  expect(await call("menu", "historyRedo")).toBe(true);
  expect(await text()).toBe("- ab\n- ");
});

test("composing at an empty item's body and over a selection across items", { timeout: 60_000 }, async () => {
  const session = await cdp();
  // The composed text is never inside the unpainted marker.
  await open("- ");
  await session.send("Input.imeSetComposition", { text: "하", selectionStart: 1, selectionEnd: 1 });
  expect(await frame.evaluate(() => document.getSelection()!.focusNode!.parentElement!.className)).not.toMatch(/field-mark/);
  await session.send("Input.insertText", { text: "한" });
  await dom.flush(frame);
  expect(await text()).toBe("- 한");
  // "b\n- c" selected in "- ab\n- cd": only the selection goes, and one undo brings it back.
  await open("- ab\n- cd");
  await call("place", 3, 8);
  await session.send("Input.imeSetComposition", { text: "하", selectionStart: 1, selectionEnd: 1 });
  await session.send("Input.insertText", { text: "한" });
  await dom.flush(frame);
  expect(await text()).toBe("- a한d");
  expect(await consistent()).toBe(true);
  await press("Meta+z");
  expect(await text()).toBe("- ab\n- cd");
  // A line-start chip's place takes composed text before the chip.
  await open([plain("a\n"), chip()]);
  await call("place", 2);
  await session.send("Input.imeSetComposition", { text: "하", selectionStart: 1, selectionEnd: 1 });
  await session.send("Input.insertText", { text: "한" });
  await dom.flush(frame);
  expect(await text()).toBe("a\n한￼");
  expect(await consistent()).toBe(true);
});

// Each composition below leaves a syllable in the DOM, as the Korean input method does, and that syllable must reach
// the text before the key acts on it.
type Step = [string, ...unknown[]];
const run = (...steps: Step[]) => call<unknown[]>("run", steps);
async function composeThenPress(start: string, caretAt: number, key: "Enter" | "Tab", shift: boolean, resend = true, host?: Record<string, unknown>): Promise<unknown> {
  await open(start);
  await call("place", caretAt);
  if (host) await call("setHost", host);
  const [, , pressed] = await run(["compose", "compositionstart"], ["composeText", "나"], ["endWith", key, shift, resend]);
  await dom.flush(frame);
  return pressed;
}

test("Shift+Enter ending a composition continues the list once, after the syllable, in the measured macOS order", { timeout: 60_000 }, async () => {
  // The field takes the resent Shift+Enter at its keydown, so no insertLineBreak follows it.
  expect(await composeThenPress("- a", 3, "Enter", true)).toEqual([false, true]);
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
  for (const [start, caretAt, expected] of [["- a", 3, "- a나\n  - "], ["- a\n- b", 7, "- a\n- b나\n  - "]] as const) {
    await composeThenPress(start, caretAt, "Enter", true);
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
      await dom.flush(frame);
      const changes = await call<number>("changes");
      // In the same task as compositionend, before its deferred run; no second key comes.
      await run(["endWith", key, shift, false], [close]);
      await dom.flush(frame);
      expect(await text()).toBe("- a\n- b나");
      expect(await call("changes")).toBe(changes);
    }
  }
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
