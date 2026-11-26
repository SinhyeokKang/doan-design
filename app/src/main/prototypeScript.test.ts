import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";
import { MAX_REPORT_FRAMES, MAX_REPORT_GOTOS, MAX_REPORT_STRING, parseRunReport, parseFramesReport } from "./prototype/requests";
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
type MutationRecordLike = { type: "childList" } | { type: "attributes"; attributeName: string };
type ObserveOptions = { childList?: boolean; subtree?: boolean; attributes?: boolean; attributeFilter?: string[] };

// The late-frame wait after the `load` handlers (2 s).
const LATE_FRAME_WAIT = 2000;

function fakeDocument(options: { url?: string; nested?: boolean; top?: boolean; readyState?: string } = {}) {
  const posted: unknown[] = [];
  // Timers keep their delay on a fake clock: `timers()` runs what is due now, `advance()` moves the clock.
  let now = 0;
  let lastTimer = 0;
  const timers: { id: number; at: number; callback: () => void }[] = [];
  // Observers queue the records a `mutate()` makes and get them at `deliver()`, as a microtask checkpoint would.
  const observers: { callback: (records: MutationRecordLike[]) => void; options: ObserveOptions; records: MutationRecordLike[] }[] = [];
  const documentListeners = new Map<string, Listener[]>();
  const windowListeners = new Map<string, Listener[]>();
  const add = (map: Map<string, Listener[]>) => (type: string, listener: Listener) => map.set(type, [...(map.get(type) ?? []), listener]);
  const head = element("head", [], [element("style")]);
  const body = element("body");
  const html = element("html", [], [head, body]);
  const sheets: { text: string }[] = [];
  // The computed background colour the script reads for an element: transparent unless a case sets one.
  const backgrounds = new Map<FakeElement, string>();
  const computed: FakeElement[] = [];
  const document = {
    readyState: options.readyState ?? "loading",
    documentElement: html,
    body,
    adoptedStyleSheets: [] as unknown[],
    addEventListener: add(documentListeners),
    querySelectorAll: (selector: string) => {
      const attr = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
      if (attr === undefined) throw new SyntaxError(`unsupported selector ${selector}`);
      return [html, ...descendants(html)].filter(el => el.hasAttribute(attr));
    },
  };
  class MutationObserver {
    private entry: (typeof observers)[number] | null = null;
    constructor(private callback: (records: MutationRecordLike[]) => void) {}
    observe(target: unknown, observed: ObserveOptions) {
      if (target !== document && target !== html) throw new Error("observes something other than the document");
      this.entry = { callback: this.callback, options: observed, records: [] };
      observers.push(this.entry);
    }
    disconnect() {
      if (this.entry !== null) observers.splice(observers.indexOf(this.entry), 1);
      this.entry = null;
    }
  }
  const deliver = () => {
    for (const observer of [...observers]) {
      if (!observers.includes(observer) || observer.records.length === 0) continue;
      observer.callback(observer.records.splice(0));
    }
  };
  const runTimer = () => {
    const due = timers.filter(timer => timer.at <= now).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (due === undefined) return false;
    timers.splice(timers.indexOf(due), 1);
    due.callback();
    deliver();
    return true;
  };
  const top = { postMessage: (message: unknown) => posted.push(message) };
  const context: Record<string, unknown> = {
    location: { href: options.url ?? URL_A },
    document,
    URL,
    setTimeout: (callback: () => void, delay = 0) => {
      timers.push({ id: ++lastTimer, at: now + Number(delay), callback });
      return lastTimer;
    },
    clearTimeout: (id: number) => {
      const index = timers.findIndex(timer => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    MutationObserver,
    getComputedStyle: (el: FakeElement) => { computed.push(el); return { backgroundColor: backgrounds.get(el) ?? "rgba(0, 0, 0, 0)" }; },
    addEventListener: add(windowListeners),
    CSSStyleSheet: class { text = ""; replaceSync(text: string) { this.text = text; sheets.push(this); } },
  };
  context.window = context;
  context.top = options.top ? context : top;
  context.parent = options.nested ? { postMessage: (message: unknown) => posted.push(message) } : top;
  const fire = (map: Map<string, Listener[]>, type: string) => { for (const listener of map.get(type) ?? []) listener(); };
  return {
    posted, body, html, document, sheets, backgrounds, computed,
    run: (target: string, gen = 7, url = URL_A) => runInNewContext(prototypeScriptSource(target, gen, url), context),
    contentLoaded: () => { document.readyState = "interactive"; fire(documentListeners, "DOMContentLoaded"); },
    loaded: () => { document.readyState = "complete"; fire(windowListeners, "load"); },
    timers: () => { while (runTimer()); },
    advance: (ms: number) => {
      const end = now + ms;
      for (;;) {
        const next = timers.filter(timer => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (next === undefined) break;
        now = next.at;
        runTimer();
      }
      now = end;
    },
    // A change to the document: `change` edits the fake tree and `record` is what an observer of it is told.
    mutate: (change: () => void, attributeName?: string) => {
      change();
      const record: MutationRecordLike = attributeName === undefined ? { type: "childList" } : { type: "attributes", attributeName };
      for (const observer of observers) {
        const { childList, attributes, attributeFilter } = observer.options;
        if (observer.options.subtree !== true) continue;
        if (record.type === "childList" ? childList === true
          : (attributes === true || attributeFilter !== undefined) && (attributeFilter === undefined || attributeFilter.includes(record.attributeName))) observer.records.push(record);
      }
    },
    deliver,
    // What is still watching the document: observers connected and timers pending.
    watching: () => ({ observers: observers.length, timers: timers.length }),
    // DOMContentLoaded, then the `load` handlers, then the timers queued from them, then the late-frame wait.
    finish() { this.contentLoaded(); this.loaded(); this.timers(); this.advance(LATE_FRAME_WAIT); },
  };
}

function remove(child: FakeElement): void {
  const parent = child.parentElement!;
  parent.children.splice(parent.children.indexOf(child), 1);
  child.parentElement = null;
}

function frameEl(id: string, mark?: string, title?: string): FakeElement {
  return element("div", [["data-doan-frame", id], ...(mark === undefined ? [] : [["data-doan-prototype", mark] as [string, string]]), ...(title === undefined ? [] : [["data-doan-title", title] as [string, string]])]);
}

// The injected script cannot import, so it repeats the caps requests.ts refuses a report over; a lower cap on the
// app's side would refuse every report the script clipped to its own.
describe("report caps", () => {
  test("the script leaves out what the app's parser would refuse, by the same caps", () => {
    const source = prototypeScriptSource("t", 1, "about:srcdoc");
    const value = (name: string) => Number(new RegExp(`const ${name} = ([0-9_.e]+);`).exec(source)?.[1]?.replaceAll("_", ""));
    expect({ MAX_STRING: value("MAX_STRING"), MAX_FRAMES: value("MAX_FRAMES"), MAX_GOTOS: value("MAX_GOTOS") })
      .toEqual({ MAX_STRING: MAX_REPORT_STRING, MAX_FRAMES: MAX_REPORT_FRAMES, MAX_GOTOS: MAX_REPORT_GOTOS });
  });
});

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
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "390x844", frames: [{ id: "phone", title: "Phone", size: "390x844", number: 1 }], gotos: [] }]);
    expect(phone.hasAttribute("data-doan-proto-frame")).toBe(true);
    expect(wrap.hasAttribute("data-doan-proto-path")).toBe(true);
    expect(page.body.hasAttribute("data-doan-proto-path")).toBe(true);
    expect(wrap.children[0]!.hasAttribute("data-doan-proto-hidden")).toBe(true);
    expect(sibling.hasAttribute("data-doan-proto-hidden")).toBe(true);
    expect(page.body.children[2]!.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.html.children[0]!.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.document.adoptedStyleSheets).toHaveLength(1);
    expect(page.sheets[0]!.text).toContain("min-height: 100vh !important");
    // The viewport variable is declared at :root with a dvh upgrade; the frame's own rules stay as they were.
    expect(page.sheets[0]!.text).toContain(":root { --doan-viewport-height: 100vh !important; }");
    expect(page.sheets[0]!.text).toContain("@supports (height: 100dvh) { :root { --doan-viewport-height: 100dvh !important; } }");
    expect(page.sheets[0]!.text).toMatch(/\[data-doan-proto-frame\] \{[^}]*width: 100% !important;[^}]*min-height: 100vh !important; box-sizing: border-box !important; \}/);
    expect(page.sheets[0]!.text).not.toMatch(/\[data-doan-proto-frame\] \{[^}]*(?<!min-)height: (?!auto)/);
    // Ancestor paint goes only once the document is marked, and never on the frame, which gets no path attribute.
    expect(page.sheets[0]!.text.replace(/\s+/g, " ")).toContain("[data-doan-proto-clear][data-doan-proto-path], [data-doan-proto-clear] [data-doan-proto-path] { background: none !important; box-shadow: none !important; outline: none !important; }");
    expect(page.html.hasAttribute("data-doan-proto-clear")).toBe(false);
    // A modal appended after isolation is not hidden.
    const modal = element("div");
    append(page.body, modal);
    append(page.body, frameEl("tablet", "820x1180"));
    page.loaded();
    page.timers();
    expect(modal.hasAttribute("data-doan-proto-hidden")).toBe(false);
    expect(page.posted[1]).toEqual({ gen: 7, frames: [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", size: "820x1180", number: 2 }], gotos: [] });
    expect(parseFramesReport("prototype", page.posted[1])).not.toBeNull();
    expect(page.posted).toHaveLength(2);
  });

  test("a frame with an opaque background colour marks the document to clear ancestor paint when it is isolated", () => {
    const page = fakeDocument();
    const phone = frameEl("phone", "390x844");
    append(page.body, element("main", [], [phone]));
    page.backgrounds.set(phone, "rgb(255, 255, 255)");
    page.run("phone");
    page.contentLoaded();
    expect(page.html.getAttribute("data-doan-proto-clear")).toBe("");
    expect(page.body.hasAttribute("data-doan-proto-clear")).toBe(false);
    expect(phone.hasAttribute("data-doan-proto-clear")).toBe(false);
  });

  test("a frame with no opaque background colour leaves ancestor paint, after the load handlers too", () => {
    for (const color of ["rgba(0, 0, 0, 0)", "rgba(255, 255, 255, 0.5)"]) {
      const page = fakeDocument();
      const phone = frameEl("phone", "390x844");
      append(page.body, phone);
      page.backgrounds.set(phone, color);
      page.run("phone");
      page.finish();
      expect(page.posted[0], color).toMatchObject({ state: "ready" });
      expect(page.html.hasAttribute("data-doan-proto-clear"), color).toBe(false);
    }
  });

  test("a background that arrives by the end of the load handlers is judged again then, and a clear is never taken back", () => {
    const late = fakeDocument();
    const phone = frameEl("phone", "390x844");
    append(late.body, phone);
    late.run("phone");
    late.contentLoaded();
    expect(late.html.hasAttribute("data-doan-proto-clear")).toBe(false);
    late.backgrounds.set(phone, "rgb(17, 24, 39)");
    late.loaded();
    expect(late.html.hasAttribute("data-doan-proto-clear")).toBe(false);
    late.timers();
    expect(late.html.getAttribute("data-doan-proto-clear")).toBe("");

    const gone = fakeDocument();
    const tablet = frameEl("tablet", "820x1180");
    append(gone.body, tablet);
    gone.backgrounds.set(tablet, "rgb(255, 255, 255)");
    gone.run("tablet");
    gone.contentLoaded();
    gone.backgrounds.set(tablet, "rgba(0, 0, 0, 0)");
    gone.finish();
    expect(gone.html.getAttribute("data-doan-proto-clear")).toBe("");
  });

  test("a frame isolated after the load handlers is judged once", () => {
    const page = fakeDocument();
    page.run("late");
    page.contentLoaded();
    const late = frameEl("late", "320x568");
    append(page.body, late);
    page.backgrounds.set(late, "rgb(255, 255, 255)");
    page.loaded();
    page.timers();
    page.advance(LATE_FRAME_WAIT);
    expect(page.posted).toHaveLength(1);
    expect(page.html.getAttribute("data-doan-proto-clear")).toBe("");
    expect(page.computed.filter(el => el === late)).toHaveLength(1);
  });

  test("a frame that is the body or the root is never judged", () => {
    for (const which of ["body", "html"] as const) {
      const page = fakeDocument();
      const frame = which === "body" ? page.body : page.html;
      frame.setAttribute("data-doan-frame", "page");
      frame.setAttribute("data-doan-prototype", "390x844");
      page.backgrounds.set(frame, "rgb(255, 255, 255)");
      page.run("page");
      page.finish();
      expect(page.posted[0], which).toMatchObject({ state: "ready" });
      expect(page.html.hasAttribute("data-doan-proto-clear"), which).toBe(false);
      expect(page.computed, which).toEqual([]);
    }
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
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "320x568", frames: [{ id: "late", size: "320x568", number: 1 }], gotos: [] }]);
  });

  test("a frame that never appears is missing at the end of the wait after the load handlers", () => {
    const page = fakeDocument();
    append(page.body, frameEl("other", "1x1"));
    page.run("phone");
    page.finish();
    expect(page.posted).toEqual([{ gen: 7, state: "missing", frames: [{ id: "other", size: "1x1", number: 1 }], gotos: [] }]);
  });

  test("a duplicated or unmarked frame is reported at DOMContentLoaded and nothing is isolated", () => {
    for (const [els, state] of [[[frameEl("phone", "1x1"), frameEl("phone", "1x1")], "duplicate"], [[frameEl("phone")], "unmarked"]] as const) {
      const page = fakeDocument();
      for (const el of els) append(page.body, el);
      page.run("phone");
      page.contentLoaded();
      expect(page.posted).toEqual([{ gen: 7, state, frames: [], gotos: [] }]);
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
    // The first 1,000 frames of the document, as the board lists them: `plain`, the long ID, `long` and f0–f996.
    expect(message.frames).toHaveLength(998);
    expect(message.frames[0]).toEqual({ id: "long", title: "t".repeat(199), size: "1x1", number: 3 });
    expect(message.frames[1]!.number).toBe(4);
    expect(message.frames.at(-1)).toEqual({ id: "f996", size: "1x1", number: 1000 });
    expect(parseRunReport("prototype", message)).not.toBeNull();
  });

  test("a frame past the 1,000th of the document is neither listed nor an enclosing frame of a link, whatever is marked", () => {
    const page = fakeDocument();
    const first = frameEl("f0", "1x1");
    append(first, element("a", [["data-doan-goto", "f1000"]]));
    append(page.body, first);
    for (let i = 1; i < 1000; i += 1) append(page.body, frameEl(`f${i}`));
    const last = frameEl("f1000", "1x1");
    append(last, element("a", [["data-doan-goto", "f0"]]));
    append(page.body, last);
    page.run("f0");
    page.finish();
    const message = page.posted[0] as { frames: { id: string; number: number }[]; gotos: { value: string; frames: string[] }[] };
    expect(message.frames).toEqual([{ id: "f0", size: "1x1", number: 1 }]);
    expect(message.gotos).toEqual([{ value: "f1000", frames: ["f0"] }, { value: "f0", frames: [] }]);
  });

  test("a frame past the 1,000th still counts toward a shared ID", () => {
    const page = fakeDocument();
    append(page.body, frameEl("dup", "1x1"));
    for (let i = 1; i < 1000; i += 1) append(page.body, frameEl(`f${i}`));
    append(page.body, frameEl("dup", "1x1"));
    page.run("f1");
    page.finish();
    expect((page.posted[0] as { frames: unknown[] }).frames).toEqual([]);
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
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "1x1", frames, gotos: [] }, { gen: 7, frames, gotos: [] }]);
  });
});

describe("a target frame that becomes playable after the load handlers", () => {
  // Up to the `load` handlers and the timer queued from them, with no playable target frame by then.
  const afterLoad = (target = "late", setup: (page: ReturnType<typeof fakeDocument>) => void = () => {}) => {
    const page = fakeDocument();
    page.run(target);
    page.contentLoaded();
    setup(page);
    page.loaded();
    page.timers();
    expect(page.posted).toEqual([]);
    return page;
  };

  test("a marked frame made within the wait plays at once, in one message, and the watch stops", () => {
    const page = afterLoad();
    expect(page.watching()).toEqual({ observers: 1, timers: 1 });
    page.advance(500);
    const late = frameEl("late", "320x568");
    page.mutate(() => append(page.body, late));
    page.deliver();
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "320x568", frames: [{ id: "late", size: "320x568", number: 1 }], gotos: [] }]);
    expect(late.hasAttribute("data-doan-proto-frame")).toBe(true);
    expect(page.document.adoptedStyleSheets).toHaveLength(1);
    expect(page.watching()).toEqual({ observers: 0, timers: 0 });
    page.advance(LATE_FRAME_WAIT);
    expect(page.posted).toHaveLength(1);
  });

  test("a frame that gets its mark, or its ID, within the wait plays", () => {
    const marked = afterLoad();
    const unmarked = frameEl("late");
    marked.mutate(() => append(marked.body, unmarked));
    marked.deliver();
    expect(marked.posted).toEqual([]);
    marked.mutate(() => unmarked.setAttribute("data-doan-prototype", "320x568"), "data-doan-prototype");
    marked.deliver();
    expect(marked.posted).toEqual([{ gen: 7, state: "ready", size: "320x568", frames: [{ id: "late", size: "320x568", number: 1 }], gotos: [] }]);

    const named = afterLoad();
    const other = frameEl("draft", "1x1");
    named.mutate(() => append(named.body, other));
    named.deliver();
    expect(named.posted).toEqual([]);
    named.mutate(() => other.setAttribute("data-doan-frame", "late"), "data-doan-frame");
    named.deliver();
    expect(named.posted).toEqual([{ gen: 7, state: "ready", size: "1x1", frames: [{ id: "late", size: "1x1", number: 1 }], gotos: [] }]);
  });

  test("a shared ID made in the load handlers and made unique within the wait plays", () => {
    const first = frameEl("late", "1x1");
    const second = frameEl("late", "1x1");
    const page = afterLoad("late", p => { append(p.body, first); append(p.body, second); });
    page.mutate(() => remove(second));
    page.deliver();
    expect(page.posted).toEqual([{ gen: 7, state: "ready", size: "1x1", frames: [{ id: "late", size: "1x1", number: 1 }], gotos: [] }]);
  });

  test.each([
    ["nothing", [], "missing"],
    ["only other frames", [["other", "1x1"]], "missing"],
    ["an unmarked frame", [["late", undefined]], "unmarked"],
    ["a frame with an invalid mark", [["late", "0x1"]], "invalid"],
    ["two frames with the ID", [["late", "1x1"], ["late", "1x1"]], "duplicate"],
  ] as [string, [string, string | undefined][], string][])("with %s at the end of the wait, that state is reported once", (_name, made, state) => {
    const page = afterLoad();
    page.advance(100);
    page.mutate(() => { for (const [id, mark] of made) append(page.body, frameEl(id, mark)); });
    page.deliver();
    page.advance(LATE_FRAME_WAIT - 101);
    expect(page.posted).toEqual([]);
    page.advance(1);
    expect(page.posted).toHaveLength(1);
    expect(page.posted[0]).toMatchObject({ gen: 7, state });
    expect(page.document.adoptedStyleSheets).toHaveLength(0);
    expect(page.watching()).toEqual({ observers: 0, timers: 0 });
  });

  test("a frame made after the report gets nothing", () => {
    const page = afterLoad();
    page.advance(LATE_FRAME_WAIT);
    expect(page.posted).toEqual([{ gen: 7, state: "missing", frames: [], gotos: [] }]);
    page.mutate(() => append(page.body, frameEl("late", "1x1")));
    page.deliver();
    page.advance(LATE_FRAME_WAIT);
    expect(page.posted).toHaveLength(1);
    expect(page.document.adoptedStyleSheets).toHaveLength(0);
  });

  test("a script injected after the document's load gets the same wait", () => {
    const ready = fakeDocument({ readyState: "complete" });
    ready.run("late");
    ready.timers();
    expect(ready.posted).toEqual([]);
    ready.advance(1500);
    ready.mutate(() => append(ready.body, frameEl("late", "1x1")));
    ready.deliver();
    expect(ready.posted).toEqual([{ gen: 7, state: "ready", size: "1x1", frames: [{ id: "late", size: "1x1", number: 1 }], gotos: [] }]);

    const missing = fakeDocument({ readyState: "complete" });
    missing.run("late");
    missing.timers();
    missing.advance(LATE_FRAME_WAIT - 1);
    expect(missing.posted).toEqual([]);
    missing.advance(1);
    expect(missing.posted).toEqual([{ gen: 7, state: "missing", frames: [], gotos: [] }]);
  });

  test("a frame found at DOMContentLoaded or right after the load handlers starts no watch", () => {
    const early = fakeDocument();
    append(early.body, frameEl("phone", "1x1"));
    early.run("phone");
    early.contentLoaded();
    early.loaded();
    early.timers();
    expect(early.posted).toHaveLength(2);
    expect(early.watching()).toEqual({ observers: 0, timers: 0 });
    const unmarked = fakeDocument();
    append(unmarked.body, frameEl("phone"));
    unmarked.run("phone");
    unmarked.contentLoaded();
    expect(unmarked.posted).toEqual([{ gen: 7, state: "unmarked", frames: [], gotos: [] }]);
    unmarked.loaded();
    unmarked.timers();
    expect(unmarked.watching()).toEqual({ observers: 0, timers: 0 });
    const inLoad = afterLoadReady();
    expect(inLoad.watching()).toEqual({ observers: 0, timers: 0 });
  });

  function afterLoadReady() {
    const page = fakeDocument();
    page.run("late");
    page.contentLoaded();
    append(page.body, frameEl("late", "1x1"));
    page.loaded();
    page.timers();
    expect(page.posted).toHaveLength(1);
    return page;
  }
});

interface LinkPlacement {
  name: string;
  html: string;
  frames: { id: string; prototype: string | null }[];
  gotos: { value: string; frames: string[] }[];
}

interface ClickCase {
  name: string;
  html: string;
  playing: string;
  click: string;
  shadowHost?: string;
  iframe?: string;
  posts: { goto: string | null } | null;
}

const links = JSON.parse(readFileSync(new URL("../../../schema/fixtures/prototype-links/cases.json", import.meta.url), "utf8")) as { placements: LinkPlacement[] };
const clicks = JSON.parse(readFileSync(new URL("../../../schema/fixtures/prototype-links/clicks.json", import.meta.url), "utf8")) as { cases: ClickCase[] };

// The injected script runs first in the document, as the prototype window's CDP injection puts it.
const canvasDocument = (target: string, body: string, gen = 7, source = prototypeScriptSource(target, gen, "about:srcdoc")) =>
  `<!doctype html><html><head><script>${source}</script></head><body>${body}</body></html>`;
// No fixture frame has this ID, so the run reports `missing` once, after the load handlers and the late-frame wait,
// with the whole document. The wait is cut to 0 in this copy of the script so each case does not sit out 2 s.
const NO_FRAME = "\u0000";
const noWaitSource = (target: string, gen: number) => {
  const source = prototypeScriptSource(target, gen, "about:srcdoc");
  // The transform may write the literal as 2e3, as the caps above allow for.
  const literal = /const LATE_FRAME_MS = ([0-9_.e]+);/.exec(source);
  if (literal === null || Number(literal[1]!.replaceAll("_", "")) !== LATE_FRAME_WAIT) throw new Error("no 2 s LATE_FRAME_MS literal in the script");
  return source.replace(literal[0], "const LATE_FRAME_MS = 0;");
};

type Report = { gen: number; state?: string; frames: unknown[]; gotos: { value: string; frames: string[] }[]; goto?: string | null };

// Each helper step is bounded at 15 s, so a step that hangs fails by its own name before the 60 s test limit.
describe("in a real DOM", { timeout: 60_000 }, () => {
  let dom: ElectronDom;
  beforeAll(async () => { dom = await launchElectronDom(); }, 60_000);
  afterAll(async () => { await dom?.close(); }, 30_000);

  const report = async (body: string): Promise<Report> => {
    const posted = await dom.flush(await dom.load(canvasDocument(NO_FRAME, body, 7, noWaitSource(NO_FRAME, 7))));
    expect(posted).toHaveLength(1);
    return posted[0] as Report;
  };

  describe("link placements of the shared fixture", () => {
    test.each(links.placements)("$name", async ({ html, frames, gotos }) => {
      const counts = new Map<string, number>();
      for (const frame of frames) counts.set(frame.id, (counts.get(frame.id) ?? 0) + 1);
      const drawer = frames.flatMap((frame, index) => frame.id !== "" && frame.id.length <= 200 && counts.get(frame.id) === 1 && parsePrototypeMark(frame.prototype) !== null
        ? [{ id: frame.id, size: frame.prototype, number: index + 1 }] : []);
      // Over the report's 200 units, a value is left out and so is an enclosing frame's id; neither is cut.
      const reported = gotos.filter(goto => goto.value.length <= 200).map(goto => ({ value: goto.value, frames: goto.frames.filter(id => id.length <= 200) }));
      const message = await report(html);
      expect(message.state).toBe("missing");
      expect(message.frames).toEqual(drawer);
      expect(message.gotos).toEqual(reported);
      // What main accepts from the host, unchanged.
      expect(parseRunReport("prototype", message)).toEqual(message);
    });
  });

  describe("link report limits", () => {
    const frame = (inner: string) => `<div data-doan-frame="a" data-doan-prototype="1x1">${inner}</div>`;

    test("links stop at 1,000, counting only the ones reported", async () => {
      const many = Array.from({ length: 1001 }, (_, i) => `<a data-doan-goto="v${i}"></a>`).join("");
      const message = await report(frame(`<a data-doan-goto="${"x".repeat(201)}"></a>${many}`));
      expect(message.gotos).toHaveLength(1000);
      expect(message.gotos[0]).toEqual({ value: "v0", frames: ["a"] });
      expect(message.gotos[999]).toEqual({ value: "v999", frames: ["a"] });
      expect(parseRunReport("prototype", message)).not.toBeNull();
    });

    test("a link's enclosing frames stop at the document's first 1,000 frames", async () => {
      const nest = `<script>{
        let el = document.body;
        for (let i = 0; i < 1001; i++) { const next = document.createElement("div"); next.setAttribute("data-doan-frame", "f" + i); el.append(next); el = next; }
        const link = document.createElement("a"); link.setAttribute("data-doan-goto", "deep"); el.append(link);
      }</script>`;
      const message = await report(nest);
      expect(message.gotos).toEqual([{ value: "deep", frames: Array.from({ length: 1000 }, (_, i) => `f${i}`) }]);
      expect(parseRunReport("prototype", message)).not.toBeNull();
    });

    test("frames past the 1,000th are not listed, and links past 1,000 are not reported", async () => {
      const body = Array.from({ length: 1001 }, (_, i) => `<div data-doan-frame="f${i}" data-doan-prototype="1x1"><a data-doan-goto="f0"></a></div>`).join("");
      const message = await report(body);
      expect(message.frames).toHaveLength(1000);
      expect(message.gotos).toHaveLength(1000);
      expect(message.gotos.at(-1)).toEqual({ value: "f0", frames: ["f999"] });
    });
  });

  describe("ancestor paint around the playing frame", () => {
    // Every ancestor paints something the frame's rounded corners would show: the root and the body differently, so a
    // rule reaching only one of them fails.
    const ANCESTOR_PAINT = `<style>
      html { background: rgb(1, 2, 3); }
      body { margin: 0; background: linear-gradient(rgb(31, 41, 55), rgb(17, 24, 39)); }
      #wrap { padding: 8px; box-shadow: 0 0 8px rgb(0, 0, 0); outline: 2px solid rgb(255, 0, 0); border: 4px solid; border-image: linear-gradient(red, blue) 1; }
      [data-doan-frame] { border-radius: 24px; box-shadow: 0 4px 12px rgb(0, 0, 0); }
    </style>`;
    const playing = (style: string) => `<div data-doan-frame="a" data-doan-prototype="390x844" style="${style}">A</div>`;
    const painted = (body: string, { head = "", bodyAttrs = "" } = {}) =>
      `<!doctype html><html><head><script>${prototypeScriptSource("a", 7, "about:srcdoc")}</script>${ANCESTOR_PAINT}${head}</head><body${bodyAttrs}>${body}</body></html>`;
    const paint = async (body: string, options: { head?: string; bodyAttrs?: string } = {}) => {
      const frame = await dom.load(painted(body, options));
      const posted = await dom.flush(frame) as Report[];
      expect(posted[0]).toMatchObject({ state: "ready" });
      return frame.evaluate(() => {
        const read = (el: Element | null) => {
          if (el === null) return null;
          const style = getComputedStyle(el);
          return { image: style.backgroundImage, color: style.backgroundColor, shadow: style.boxShadow, outline: style.outlineStyle, borderImage: style.borderImageSource };
        };
        const frameEl = document.querySelector("[data-doan-proto-frame]")!;
        return {
          clear: document.documentElement.hasAttribute("data-doan-proto-clear"),
          html: read(document.documentElement), body: read(document.body), wrap: read(document.getElementById("wrap")), outer: read(document.getElementById("outer")),
          frame: { color: getComputedStyle(frameEl).backgroundColor, radius: getComputedStyle(frameEl).borderTopLeftRadius, shadow: getComputedStyle(frameEl).boxShadow },
          before: getComputedStyle(document.body, "::before").backgroundColor,
        };
      });
    };
    const CLEARED = { image: "none", color: "rgba(0, 0, 0, 0)", shadow: "none", outline: "none", borderImage: "none" };
    const WHITE_FRAME = { color: "rgb(255, 255, 255)", radius: "24px", shadow: "rgb(0, 0, 0) 0px 4px 12px 0px" };

    test("an opaque frame clears the root's, the body's and every wrapper's paint, and keeps its own", async () => {
      const seen = await paint(`<div id="wrap">${playing("background: rgb(255, 255, 255)")}</div>`);
      expect(seen.clear).toBe(true);
      expect(seen.html).toEqual(CLEARED);
      expect(seen.body).toEqual(CLEARED);
      expect(seen.wrap).toEqual(CLEARED);
      expect(seen.frame).toEqual(WHITE_FRAME);
    });

    test.each([
      ["transparent", "background: transparent"],
      ["half-transparent colour", "background: rgba(255, 255, 255, 0.5)"],
      ["gradient alone", "background: linear-gradient(rgb(255, 255, 255), rgb(240, 240, 240))"],
      ["half-transparent texture alone", "background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.2) 0 4px, transparent 4px 8px)"],
    ])("a frame with no opaque background colour (%s) keeps ancestor paint", async (_name, style) => {
      const seen = await paint(`<div id="wrap">${playing(style)}</div>`);
      expect(seen.clear).toBe(false);
      expect(seen.html!.color).toBe("rgb(1, 2, 3)");
      expect(seen.body!.image).toMatch(/^linear-gradient\(/);
      expect(seen.wrap).toMatchObject({ shadow: "rgb(0, 0, 0) 0px 0px 8px 0px", outline: "solid" });
    });

    test("a frame that is the body's own child clears the body and the root", async () => {
      const seen = await paint(playing("background: rgb(255, 255, 255)"));
      expect(seen.clear).toBe(true);
      expect(seen.html).toEqual(CLEARED);
      expect(seen.body).toEqual(CLEARED);
    });

    test("a frame that is the body is not judged, and the root keeps its paint", async () => {
      const seen = await paint("A", { bodyAttrs: ' data-doan-frame="a" data-doan-prototype="390x844" style="background: rgb(255, 255, 255)"' });
      expect(seen.clear).toBe(false);
      expect(seen.html!.color).toBe("rgb(1, 2, 3)");
    });

    test("an enclosing frame is an ancestor like any other: its paint goes and the playing frame's stays", async () => {
      const seen = await paint(`<div id="wrap"><div id="outer" data-doan-frame="outer" style="background: rgb(200, 200, 200)">${playing("background: rgb(255, 255, 255)")}</div></div>`);
      expect(seen.clear).toBe(true);
      expect(seen.outer).toEqual(CLEARED);
      expect(seen.frame).toEqual(WHITE_FRAME);
    });

    test("an ancestor's ::before keeps its paint", async () => {
      const seen = await paint(`<div id="wrap">${playing("background: rgb(255, 255, 255)")}</div>`, { head: '<style>body::before { content: "x"; display: block; background: rgb(0, 128, 0); }</style>' });
      expect(seen.clear).toBe(true);
      expect(seen.before).toBe("rgb(0, 128, 0)");
    });

    test("a background from a stylesheet DOMContentLoaded did not wait for is judged after the load handlers", async () => {
      const late = '<link rel="stylesheet" href="data:text/css,%5Bdata-doan-frame%5D%7Bbackground%3Argb(255%2C255%2C255)%7D">';
      const seen = await paint(`<div id="wrap">${playing("")}</div>`, { head: late });
      expect(seen.frame.color).toBe("rgb(255, 255, 255)");
      expect(seen.clear).toBe(true);
      expect(seen.html).toEqual(CLEARED);
    });
  });

  describe("click decisions of the shared table", () => {
    test.each(clicks.cases)("$name", async ({ html, playing, click, shadowHost, iframe, posts }) => {
      const frame = await dom.load(canvasDocument(playing, html, 9));
      const before = await dom.flush(frame) as Report[];
      expect(before[0]).toMatchObject({ gen: 9, state: "ready" });
      const target = iframe === undefined ? frame : await (await frame.$(iframe))?.contentFrame();
      if (!target) throw new Error(`no iframe ${iframe}`);
      await target.evaluate(({ selector, host }) => {
        const root = host === null ? document : document.querySelector(host)!.shadowRoot!;
        (root.querySelector(selector) as HTMLElement).click();
      }, { selector: click, host: shadowHost ?? null });
      const after = (await dom.flush(target)).slice(before.length);
      expect(after).toEqual(posts === null ? [] : [{ gen: 9, ...posts }]);
    });

    test("a frame a script makes after the load handlers plays within the wait, and its links are followed", async () => {
      const html = `<script>addEventListener("load", () => setTimeout(() => {
        document.body.insertAdjacentHTML("beforeend", '<div data-doan-frame="a" data-doan-prototype="390x844"><a id="x" data-doan-goto="b"></a></div><div data-doan-frame="b" data-doan-prototype="390x844"></div>');
      }, 300));</script>`;
      const frame = await dom.load(canvasDocument("a", html, 9));
      expect(await dom.flush(frame)).toEqual([]);
      await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 600)));
      const before = await dom.flush(frame) as Report[];
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({ gen: 9, state: "ready", size: "390x844" });
      await frame.evaluate(() => (document.getElementById("x") as HTMLElement).click());
      expect((await dom.flush(frame)).slice(before.length)).toEqual([{ gen: 9, goto: "b" }]);
    });

    test("nothing is followed while no frame plays", async () => {
      const html = `<div data-doan-frame="a"><a id="x" data-doan-goto="b"></a></div><div data-doan-frame="b" data-doan-prototype="1x1"></div>`;
      const frame = await dom.load(canvasDocument("a", html, 9));
      const before = await dom.flush(frame) as Report[];
      expect(before[0]).toMatchObject({ gen: 9, state: "unmarked" });
      await frame.evaluate(() => (document.getElementById("x") as HTMLElement).click());
      expect((await dom.flush(frame)).slice(before.length)).toEqual([]);
    });
  });

  // PRODUCT §5 item 2 'Prototype window' 'Header': a plain Z the frame did not take for typing switches the viewport mode.
  describe("the viewport key", () => {
    const PLAYING = `<div data-doan-frame="a" data-doan-prototype="390x844"><button id="b">B</button><input id="text"><textarea id="area"></textarea>
      <select id="pick"><option>1</option></select><div id="edit" contenteditable="true">E</div></div>`;
    type Init = Record<string, string | boolean>;
    const press = async (frame: Awaited<ReturnType<ElectronDom["load"]>>, target: string | null, init: Init = {}) => {
      await frame.evaluate(({ selector, options }) => {
        const el = selector === null ? document.body : document.querySelector(selector)!;
        el.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ code: "KeyZ", key: "z", bubbles: true, cancelable: true }, options)));
      }, { selector: target, options: init });
    };
    const after = async (frame: Awaited<ReturnType<ElectronDom["load"]>>, target: string | null, init: Init = {}) => {
      const before = await dom.flush(frame) as Report[];
      expect(before[0]).toMatchObject({ gen: 9, state: "ready" });
      await press(frame, target, init);
      return (await dom.flush(frame)).slice(before.length);
    };

    test("posts {gen, key} for a plain Z on the page or a button, also when a Korean layout reports ㅋ", async () => {
      const frame = await dom.load(canvasDocument("a", PLAYING, 9));
      expect(await after(frame, null)).toEqual([{ gen: 9, key: "z" }]);
      expect(await after(frame, "#b")).toEqual([{ gen: 9, key: "z" }]);
      expect(await after(frame, "#b", { key: "ㅋ" })).toEqual([{ gen: 9, key: "z" }]);
    });

    test("leaves Z to a text field, a select and an editable element", async () => {
      const frame = await dom.load(canvasDocument("a", PLAYING, 9));
      for (const target of ["#text", "#area", "#pick", "#edit"]) expect(await after(frame, target), target).toEqual([]);
    });

    test("ignores Z with a modifier, a repeat or an IME composition, and another key", async () => {
      const frame = await dom.load(canvasDocument("a", PLAYING, 9));
      for (const init of [{ shiftKey: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { code: "KeyX" }] as Init[]) {
        expect(await after(frame, null, init), JSON.stringify(init)).toEqual([]);
      }
    });

    test("leaves Z to the canvas when its own handler cancels it, in any phase", async () => {
      for (const listener of [`addEventListener("keydown", e => e.preventDefault())`, `addEventListener("keydown", e => e.preventDefault(), true)`, `document.addEventListener("keydown", e => e.preventDefault())`]) {
        const frame = await dom.load(canvasDocument("a", `${PLAYING}<script>${listener}</script>`, 9));
        expect(await after(frame, "#b"), listener).toEqual([]);
      }
    });

    test("posts nothing while no frame plays", async () => {
      const frame = await dom.load(canvasDocument("a", `<div data-doan-frame="a"></div>`, 9));
      const before = await dom.flush(frame) as Report[];
      expect(before[0]).toMatchObject({ gen: 9, state: "unmarked" });
      await press(frame, null);
      expect((await dom.flush(frame)).slice(before.length)).toEqual([]);
    });
  });
});
