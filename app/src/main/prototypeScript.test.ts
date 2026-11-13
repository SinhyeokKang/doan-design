import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { parseRunReport, parseFramesReport } from "./prototype/requests";
import { parsePrototypeMark } from "./prototype/mark";
import { prototypeScriptSource } from "./prototypeScript";

const fixture = JSON.parse(readFileSync(new URL("../../../schema/fixtures/prototype-mark/cases.json", import.meta.url), "utf8")) as {
  values: { name: string; value: string; valid: boolean; width?: number; height?: number }[];
  placements: { name: string; html: string; frames: { id: string; prototype: string | null }[] }[];
};

const URL_A = "http://127.0.0.1:4000/t/tok/key/.doan/canvases/proto.html";

interface FakeElement {
  tagName: string;
  attrs: Map<string, string>;
  children: FakeElement[];
  parentElement: FakeElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
}

function element(tag: string, attrs: [string, string][] = [], children: FakeElement[] = []): FakeElement {
  const map = new Map<string, string>();
  // The HTML parser lowercases attribute names and keeps the first of a repeated one.
  for (const [name, value] of attrs) if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), value);
  const self: FakeElement = {
    tagName: tag.toUpperCase(), attrs: map, children, parentElement: null,
    getAttribute: name => self.attrs.get(name) ?? null,
    hasAttribute: name => self.attrs.has(name),
    setAttribute: (name, value) => { self.attrs.set(name, value); },
  };
  for (const child of children) child.parentElement = self;
  return self;
}

function append(parent: FakeElement, child: FakeElement): void {
  parent.children.push(child);
  child.parentElement = parent;
}

// Enough of the HTML parser for the fixture fragments: start and end tags with quoted or bare attributes. A
// <template>'s content is not part of the document tree, as in a browser, so nothing inside one is appended.
function parseFragment(html: string, body: FakeElement): void {
  const stack: FakeElement[] = [body];
  let template = 0;
  for (const match of html.matchAll(/<(\/?)([A-Za-z][\w-]*)([^>]*)>/g)) {
    const [, close, tag, rest] = match;
    if (tag!.toLowerCase() === "template") { template += close ? -1 : 1; continue; }
    if (template > 0) continue;
    if (close) { stack.pop(); continue; }
    const attrs = Array.from(rest!.matchAll(/([^\s=/]+)(?:\s*=\s*"([^"]*)")?/g), ([, name, value]) => [name!, value ?? ""] as [string, string]);
    const el = element(tag!, attrs);
    append(stack[stack.length - 1]!, el);
    stack.push(el);
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return root.children.flatMap(child => [child, ...descendants(child)]);
}

type Listener = () => void;

function fakeDocument(options: { url?: string; nested?: boolean; top?: boolean; readyState?: string } = {}) {
  const posted: unknown[] = [];
  const timers: (() => void)[] = [];
  const documentListeners = new Map<string, Listener[]>();
  const windowListeners = new Map<string, Listener[]>();
  const add = (map: Map<string, Listener[]>) => (type: string, listener: Listener) => map.set(type, [...(map.get(type) ?? []), listener]);
  const head = element("head", [], [element("style")]);
  const body = element("body");
  const html = element("html", [], [head, body]);
  const sheets: { text: string }[] = [];
  const document = {
    readyState: options.readyState ?? "loading",
    documentElement: html,
    body,
    adoptedStyleSheets: [] as unknown[],
    addEventListener: add(documentListeners),
    querySelectorAll: (selector: string) => {
      const attr = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
      if (attr === undefined) throw new SyntaxError(`unsupported selector ${selector}`);
      return descendants(html).filter(el => el.hasAttribute(attr));
    },
  };
  const top = { postMessage: (message: unknown) => posted.push(message) };
  const context: Record<string, unknown> = {
    location: { href: options.url ?? URL_A },
    document,
    URL,
    setTimeout: (callback: () => void) => timers.push(callback),
    addEventListener: add(windowListeners),
    CSSStyleSheet: class { text = ""; replaceSync(text: string) { this.text = text; sheets.push(this); } },
  };
  context.window = context;
  context.top = options.top ? context : top;
  context.parent = options.nested ? { postMessage: (message: unknown) => posted.push(message) } : top;
  const fire = (map: Map<string, Listener[]>, type: string) => { for (const listener of map.get(type) ?? []) listener(); };
  return {
    posted, body, html, document, sheets,
    run: (target: string, gen = 7, url = URL_A) => runInNewContext(prototypeScriptSource(target, gen, url), context),
    contentLoaded: () => { document.readyState = "interactive"; fire(documentListeners, "DOMContentLoaded"); },
    loaded: () => { document.readyState = "complete"; fire(windowListeners, "load"); },
    timers: () => { for (const callback of timers.splice(0)) callback(); },
    // DOMContentLoaded, then the `load` handlers, then the timers queued from them.
    finish() { this.contentLoaded(); this.loaded(); this.timers(); },
  };
}

function frameEl(id: string, mark?: string, title?: string): FakeElement {
  return element("div", [["data-doan-frame", id], ...(mark === undefined ? [] : [["data-doan-prototype", mark] as [string, string]]), ...(title === undefined ? [] : [["data-doan-title", title] as [string, string]])]);
}

describe("the mark grammar", () => {
  test("the injected script uses mark.ts's regex literal", () => {
    const literal = /const MARK = (\/.+\/);/;
    const ownSource = readFileSync(new URL("./prototypeScript.ts", import.meta.url), "utf8");
    const markSource = readFileSync(new URL("./prototype/mark.ts", import.meta.url), "utf8");
    expect(literal.exec(ownSource)?.[1]).toBe(literal.exec(markSource)?.[1]);
  });

  test.each(fixture.values)("$name: the shared fixture's verdict, in mark.ts and in the live document", ({ value, valid, width, height }) => {
    expect(parsePrototypeMark(value)).toEqual(valid ? { width, height } : null);
    const page = fakeDocument();
    append(page.body, frameEl("phone", value));
    page.run("phone");
    page.finish();
    const report = page.posted[0] as { state: string; size?: string };
    expect(report.state).toBe(valid ? "ready" : "invalid");
    if (valid) expect(report.size).toBe(value);
  });
});

describe("placements in the live document", () => {
  test.each(fixture.placements)("$name", ({ html, frames }) => {
    const counts = new Map<string, number>();
    for (const frame of frames) counts.set(frame.id, (counts.get(frame.id) ?? 0) + 1);
    const drawer = frames.flatMap((frame, index) => frame.id !== "" && counts.get(frame.id) === 1 && parsePrototypeMark(frame.prototype) !== null
      ? [{ id: frame.id, size: frame.prototype, number: index + 1 }] : []);
    const expected = (id: string): string => {
      const own = frames.filter(frame => frame.id === id);
      if (own.length === 0) return "missing";
      if (own.length > 1) return "duplicate";
      if (own[0]!.prototype === null) return "unmarked";
      return parsePrototypeMark(own[0]!.prototype) === null ? "invalid" : "ready";
    };
    // Every frame the fixture lists, plus a frame only a <template> or a non-frame element names.
    for (const id of new Set([...frames.map(frame => frame.id).filter(id => id !== ""), "home", "absent"])) {
      const page = fakeDocument();
      parseFragment(html, page.body);
      page.run(id);
      page.finish();
      const message = page.posted[0] as { state: string; frames: unknown[] };
      expect(message.state, id).toBe(expected(id));
      expect(message.frames, id).toEqual(drawer);
      // What main accepts from the host, unchanged.
      expect(parseRunReport("prototype", message), id).not.toBeNull();
    }
  });
});

describe("resolving and isolating the frame", () => {
  test("a frame present at DOMContentLoaded is isolated then, and the drawer list follows the load handlers", () => {
    const page = fakeDocument();
    const phone = frameEl("phone", "390x844", "Phone");
    const sibling = element("section");
    const wrap = element("main", [], [element("h1"), phone]);
    append(page.body, wrap);
    append(page.body, sibling);
    append(page.body, element("script"));
    page.run("phone");
    expect(page.posted).toEqual([]);
    page.contentLoaded();
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "390x844", frames: [{ id: "phone", title: "Phone", size: "390x844", number: 1 }] }]);
    expect(phone.hasAttribute("data-doan-proto-frame")).toBe(true);
    expect(wrap.hasAttribute("data-doan-proto-path")).toBe(true);
    expect(page.body.hasAttribute("data-doan-proto-path")).toBe(true);
    expect(wrap.children[0]!.hasAttribute("data-doan-proto-hidden")).toBe(true);
    expect(sibling.hasAttribute("data-doan-proto-hidden")).toBe(true);
    expect(page.body.children[2]!.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.html.children[0]!.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.document.adoptedStyleSheets).toHaveLength(1);
    expect(page.sheets[0]!.text).toContain("min-height: 100vh !important");
    // A modal appended after isolation is not hidden.
    const modal = element("div");
    append(page.body, modal);
    append(page.body, frameEl("tablet", "820x1180"));
    page.loaded();
    page.timers();
    expect(modal.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.posted[1]).toEqual({ gen: 7, frames: [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", size: "820x1180", number: 2 }] });
    expect(parseFramesReport("prototype", page.posted[1])).not.toBeNull();
    expect(page.posted).toHaveLength(2);
  });

  test("a frame made in a load handler is found after them, in one message", () => {
    const page = fakeDocument();
    page.run("late");
    page.contentLoaded();
    expect(page.posted).toEqual([]);
    append(page.body, frameEl("late", "320x568"));
    page.loaded();
    expect(page.posted).toEqual([]);
    page.timers();
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "320x568", frames: [{ id: "late", size: "320x568", number: 1 }] }]);
  });

  test("a frame that never appears is missing after the load handlers", () => {
    const page = fakeDocument();
    append(page.body, frameEl("other", "1x1"));
    page.run("phone");
    page.finish();
    expect(page.posted).toEqual([{ gen: 7, state: "missing", frames: [{ id: "other", size: "1x1", number: 1 }] }]);
  });

  test("a duplicated or unmarked frame is reported at DOMContentLoaded and nothing is isolated", () => {
    for (const [els, state] of [[[frameEl("phone", "1x1"), frameEl("phone", "1x1")], "duplicate"], [[frameEl("phone")], "unmarked"]] as const) {
      const page = fakeDocument();
      for (const el of els) append(page.body, el);
      page.run("phone");
      page.contentLoaded();
      expect(page.posted).toEqual([{ gen: 7, state, frames: [] }]);
      expect(page.document.adoptedStyleSheets).toHaveLength(0);
    }
  });

  test("numbers count every frame, and the list leaves out what the report caps refuse", () => {
    const page = fakeDocument();
    append(page.body, frameEl("plain"));
    append(page.body, frameEl("x".repeat(201), "1x1"));
    append(page.body, frameEl("long", "1x1", `${"t".repeat(199)}\u{1F600}`));
    for (let i = 0; i < 1001; i += 1) append(page.body, frameEl(`f${i}`, "1x1"));
    page.run("long");
    page.finish();
    const message = page.posted[0] as { frames: { id: string; title?: string; number: number }[] };
    expect(message.frames).toHaveLength(1000);
    expect(message.frames[0]).toEqual({ id: "long", title: "t".repeat(199), size: "1x1", number: 3 });
    expect(message.frames[1]!.number).toBe(4);
    expect(parseRunReport("prototype", message)).not.toBeNull();
  });

  test("runs only in the window's direct child at the run's URL, and once", () => {
    for (const options of [{ top: true }, { nested: true }, { url: `${URL_A}?other` }]) {
      const page = fakeDocument(options);
      append(page.body, frameEl("phone", "1x1"));
      page.run("phone");
      page.finish();
      expect(page.posted, JSON.stringify(options)).toEqual([]);
    }
    const page = fakeDocument();
    append(page.body, frameEl("phone", "1x1"));
    page.run("phone");
    page.run("phone", 8);
    page.finish();
    const frames = [{ id: "phone", size: "1x1", number: 1 }];
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "1x1", frames }, { gen: 7, frames }]);
  });
});
