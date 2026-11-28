import type { CheckContext } from "../../lib/types.ts";

// What reacts to a click on the board, read statically: a canvas parsed into elements (inert <template> subtrees
// left out), CSS click states matched against the elements they apply to, and script click registrations judged by
// the elements their receiver looks up. Receivers that only run time can tell are left to the judge.

export type Node = { tag: string; attrs: Record<string, string>; parent: number; marked: boolean };
export type Parsed = {
  nodes: Node[];
  frames: { id: string; prototype: string | null; source: string }[];
  triggers: { kind: string; node: number }[];
  scripts: { text: string; src: string | null; node: number }[];
  styles: string[];
  sheets: string[];
};

// Elements in document order with their parent and whether they sit in an element carrying data-doan-prototype;
// frames carry their own source text so seed and final compare text to text.
export function parseCanvas(ctx: CheckContext, html: string): Parsed | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
HANDLERS = {'onclick','onpointerdown','onmousedown','onpointerup','onmouseup'}
html = sys.argv[1]
lines = [0] + [i + 1 for i, ch in enumerate(html) if ch == '\\n']
class Doc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []; self.stack = []; self.templates = 0; self.frames = []; self.triggers = []
        self.scripts = []; self.styles = []; self.sheets = []; self.text = None
    def at(self):
        line, col = self.getpos(); return lines[line - 1] + col
    def handle_starttag(self, tag, attrs):
        if tag == 'template': self.templates += 1; return
        if self.templates: return
        a = {}
        for key, value in attrs:
            if key not in a: a[key] = value or ''
        parent = self.stack[-1]['index'] if self.stack else -1
        marked = (parent >= 0 and self.nodes[parent]['marked']) or 'data-doan-prototype' in a
        index = len(self.nodes)
        self.nodes.append({'tag': tag, 'attrs': a, 'parent': parent, 'marked': marked})
        for key in a:
            if key in HANDLERS or key == 'popovertarget': self.triggers.append({'kind': key, 'node': index})
        if tag == 'details': self.triggers.append({'kind': 'details', 'node': index})
        if tag == 'link' and 'stylesheet' in a.get('rel', '').lower().split(): self.sheets.append(a.get('href', ''))
        if tag == 'script': self.text = {'kind': 'script', 'parts': [], 'src': a.get('src'), 'node': index}
        if tag == 'style': self.text = {'kind': 'style', 'parts': []}
        if tag not in VOID: self.stack.append({'index': index, 'tag': tag, 'start': self.at()})
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag == 'template': self.templates -= 1; return
        if self.templates: return
        if tag not in VOID: self.stack.pop()
        self.text = None
    def handle_endtag(self, tag):
        if tag == 'template':
            if self.templates: self.templates -= 1
            return
        if self.templates: return
        if self.text is not None and tag in ('script', 'style'):
            t = self.text; self.text = None
            if t['kind'] == 'script': self.scripts.append({'text': ''.join(t['parts']), 'src': t['src'], 'node': t['node']})
            else: self.styles.append(''.join(t['parts']))
        if not any(n['tag'] == tag for n in self.stack): return
        end = html.index('>', self.at()) + 1
        while self.stack:
            n = self.stack.pop(); a = self.nodes[n['index']]['attrs']
            if 'data-doan-frame' in a:
                self.frames.append({'id': a['data-doan-frame'], 'prototype': a.get('data-doan-prototype'), 'source': html[n['start']:end]})
            if n['tag'] == tag: break
    def handle_data(self, data):
        if self.text is not None and not self.templates: self.text['parts'].append(data)
d = Doc(); d.feed(html); d.close()
print(json.dumps({'nodes': d.nodes, 'frames': d.frames, 'triggers': d.triggers, 'scripts': d.scripts, 'styles': d.styles, 'sheets': d.sheets}))
`, html]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

// A repository path for `href` relative to the file at `from`; null for remote, absolute or escaping links.
export function resolve(from: string, href: string): string | null {
  if (/^(?:[a-z]+:|\/|#)/i.test(href)) return null;
  const parts = from.split("/").slice(0, -1);
  let decoded: string;
  try { decoded = decodeURIComponent(href.split(/[?#]/)[0]!); } catch { return null; }
  for (const part of decoded.split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

export const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// The canvas's style text: <style> blocks, linked local stylesheets and the local @import chains of both.
export function styleTexts(ctx: CheckContext, canvas: string, parsed: Parsed): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const imports = (css: string, from: string) => {
    for (const m of uncomment(css).matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)"']+))/gi)) visit(m[1] ?? m[2] ?? m[3]!, from);
  };
  const visit = (href: string, from: string) => {
    const path = resolve(from, href);
    if (path === null || seen.has(path)) return;
    seen.add(path);
    const css = ctx.read(path);
    if (css === null) return;
    out.push(css);
    imports(css, path);
  };
  for (const css of parsed.styles) { out.push(css); imports(css, canvas); }
  for (const href of parsed.sheets) visit(href, canvas);
  return out;
}

// ---- Selectors: enough of CSS selectors to find the elements a rule's state applies to.

type Attr = { name: string; op: string | null; value: string; insensitive: boolean };
type Compound = { tag: string | null; ids: string[]; classes: string[]; attrs: Attr[]; pseudos: { name: string; arg: string | null }[] };
type Complex = { compounds: Compound[]; combinators: string[] };

const CLICK_STATE = /^(?:focus-within|focus|active|checked|target-within|target)$/;
const CLICK_STATE_TEXT = /:(?:focus-within|focus|active|checked|target-within|target)(?![\w-])/i;
// Pseudo-classes that depend on the element's state; inside :not() they cannot exclude anything statically.
const STATE = /^(?:focus-within|focus-visible|focus|active|hover|checked|target-within|target|visited|link|any-link|enabled|disabled|read-only|read-write|placeholder-shown|default|indeterminate|valid|invalid|user-valid|user-invalid|required|optional|in-range|out-of-range|open|closed|popover-open|modal|playing|paused|fullscreen)$/;
const LEGACY_ELEMENTS = /^(?:before|after|first-line|first-letter)$/;

// The index after the group that opens at `start` ("(" or "["), skipping quoted strings; -1 when unclosed.
function closeOf(text: string, start: number): number {
  const close = text[start] === "(" ? ")" : "]";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const end = text.indexOf(ch, i + 1); if (end < 0) return -1; i = end; continue; }
    if (ch === text[start]) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return -1;
}

export function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") { const end = closeOf(text, i); if (end < 0) break; i = end - 1; }
    else if (ch === '"' || ch === "'") { const end = text.indexOf(ch, i + 1); if (end < 0) break; i = end; }
    else if (ch === ",") { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

function parseList(text: string): Complex[] | null {
  const list = splitTopLevel(text).map(parseComplex);
  return list.length && list.every(Boolean) ? (list as Complex[]) : null;
}

function parseComplex(text: string): Complex | null {
  const compounds: Compound[] = [], combinators: string[] = [];
  // Held in an object so the closures below can update it.
  const st: { current: Compound | null; pending: string | null } = { current: null, pending: null };
  let i = 0;
  const ident = () => { const m = /^[\w\u00a0-\uffff-]+/.exec(text.slice(i)); if (!m) return null; i += m[0].length; return m[0]; };
  const compound = (): Compound => {
    if (st.current && st.pending) { compounds.push(st.current); combinators.push(st.pending); st.current = null; }
    st.pending = null;
    st.current ??= { tag: null, ids: [], classes: [], attrs: [], pseudos: [] };
    return st.current;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) { if (st.current) st.pending ??= " "; i++; continue; }
    if (ch === ">" || ch === "+" || ch === "~") { if (!st.current) return null; st.pending = ch; i++; continue; }
    const c = compound();
    if (ch === "*") { i++; continue; }
    if (ch === "#" || ch === ".") { i++; const name = ident(); if (!name) return null; (ch === "#" ? c.ids : c.classes).push(name); continue; }
    if (ch === "[") {
      const end = closeOf(text, i);
      if (end < 0) return null;
      const m = /^\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?\s*([iIsS])?\s*$/.exec(text.slice(i + 1, end - 1));
      if (!m) return null;
      c.attrs.push({ name: m[1]!.toLowerCase(), op: m[2] ?? null, value: m[3] ?? m[4] ?? m[5] ?? "", insensitive: /i/i.test(m[6] ?? "") });
      i = end;
      continue;
    }
    if (ch === ":") {
      const element = text[i + 1] === ":";
      i += element ? 2 : 1;
      const name = ident()?.toLowerCase();
      if (!name) return null;
      let arg: string | null = null;
      if (text[i] === "(") { const end = closeOf(text, i); if (end < 0) return null; arg = text.slice(i + 1, end - 1); i = end; }
      if (!element && !LEGACY_ELEMENTS.test(name)) c.pseudos.push({ name, arg });
      continue;
    }
    if (/[\w\u00a0-\uffff-]/.test(ch) && c.tag === null && !c.ids.length && !c.classes.length && !c.attrs.length && !c.pseudos.length) { c.tag = ident()!.toLowerCase(); continue; }
    return null;
  }
  if (!st.current || (st.pending && st.pending !== " ")) return null;
  compounds.push(st.current);
  return { compounds, combinators };
}

export class Dom {
  readonly nodes: Node[];
  private readonly children: number[][];
  private readonly roots: number[] = [];
  constructor(nodes: Node[]) {
    this.nodes = nodes;
    this.children = nodes.map(() => []);
    nodes.forEach((node, i) => (node.parent >= 0 ? this.children[node.parent]! : this.roots).push(i));
  }
  private siblingsBefore(i: number): number[] {
    const list = this.nodes[i]!.parent >= 0 ? this.children[this.nodes[i]!.parent]! : this.roots;
    return list.slice(0, list.indexOf(i)).reverse();
  }
  isAncestor(a: number, b: number): boolean {
    for (let p = this.nodes[b]!.parent; p >= 0; p = this.nodes[p]!.parent) if (p === a) return true;
    return false;
  }
  descendants(i: number): number[] { return this.nodes.map((_, j) => j).filter(j => this.isAncestor(i, j)); }
  childrenOf(i: number): number[] { return this.children[i]!; }
  next(i: number): number | null { const list = this.nodes[i]!.parent >= 0 ? this.children[this.nodes[i]!.parent]! : this.roots; return list[list.indexOf(i) + 1] ?? null; }
  previous(i: number): number | null { return this.siblingsBefore(i)[0] ?? null; }

  private compound(i: number, c: Compound, inNot: boolean): boolean {
    const node = this.nodes[i]!;
    if (c.tag !== null && node.tag !== c.tag) return false;
    if (c.ids.some(id => node.attrs.id !== id)) return false;
    const classes = (node.attrs.class ?? "").split(/\s+/);
    if (c.classes.some(name => !classes.includes(name))) return false;
    for (const a of c.attrs) {
      const raw = node.attrs[a.name];
      if (raw === undefined) return false;
      if (a.op === null) continue;
      const [v, want] = a.insensitive ? [raw.toLowerCase(), a.value.toLowerCase()] : [raw, a.value];
      const ok = a.op === "=" ? v === want
        : a.op === "~=" ? v.split(/\s+/).includes(want)
        : a.op === "|=" ? v === want || v.startsWith(`${want}-`)
        : want !== "" && (a.op === "^=" ? v.startsWith(want) : a.op === "$=" ? v.endsWith(want) : v.includes(want));
      if (!ok) return false;
    }
    for (const p of c.pseudos) {
      if (STATE.test(p.name)) { if (inNot) return false; continue; }
      if (p.name === "root") { if (node.tag !== "html") return false; continue; }
      if (p.name === "not") {
        const list = p.arg === null ? null : parseList(p.arg);
        if (list && list.some(s => this.complex(i, s, s.compounds.length - 1, true))) return false;
        continue;
      }
      if (["is", "where", "matches", "-webkit-any", "-moz-any"].includes(p.name)) {
        const list = p.arg === null ? null : parseList(p.arg);
        if (list && !list.some(s => this.complex(i, s, s.compounds.length - 1, inNot))) return false;
        continue;
      }
      // :has(), structural and unknown pseudo-classes: assume they can match.
    }
    return true;
  }

  // Whether node i matches the selector's compounds up to `last`, with their combinators.
  private complex(i: number, s: Complex, last: number, inNot: boolean): boolean {
    if (!this.compound(i, s.compounds[last]!, inNot)) return false;
    if (last === 0) return true;
    const comb = s.combinators[last - 1];
    const node = this.nodes[i]!;
    if (comb === ">") return node.parent >= 0 && this.complex(node.parent, s, last - 1, inNot);
    if (comb === "+") { const prev = this.siblingsBefore(i)[0]; return prev !== undefined && this.complex(prev, s, last - 1, inNot); }
    if (comb === "~") return this.siblingsBefore(i).some(j => this.complex(j, s, last - 1, inNot));
    for (let p = node.parent; p >= 0; p = this.nodes[p]!.parent) if (this.complex(p, s, last - 1, inNot)) return true;
    return false;
  }

  // Elements matching a selector list, among `among` (every element when omitted); null when it does not parse.
  select(selector: string, among?: number[]): number[] | null {
    const list = parseList(selector);
    if (list === null) return null;
    return (among ?? this.nodes.map((_, i) => i)).filter(i => list.some(s => this.complex(i, s, s.compounds.length - 1, false)));
  }

  // For each click state in a selector list, the elements it applies to: the compound carrying the state, matched
  // with what precedes it. null when the selector does not parse.
  clickStateTargets(selector: string): number[][] | null {
    const list = parseList(selector);
    if (list === null) return null;
    const out: number[][] = [];
    for (const s of list)
      s.compounds.forEach((c, index) => {
        if (c.pseudos.some(p => CLICK_STATE.test(p.name) || (p.arg !== null && CLICK_STATE_TEXT.test(p.arg))))
          out.push(this.nodes.map((_, i) => i).filter(i => this.complex(i, s, index, false)));
      });
    return out;
  }
}

export function cssClickStates(dom: Dom, css: string[]): { interaction: boolean; board: string[] } {
  let interaction = false;
  const board: string[] = [];
  for (const text of css)
    for (const rule of uncomment(text).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      // Statements such as @import end in ";" before the rule's own prelude.
      const prelude = rule[1]!.slice(rule[1]!.lastIndexOf(";") + 1).trim();
      if (prelude.startsWith("@") || !CLICK_STATE_TEXT.test(prelude)) continue;
      interaction = true;
      for (const selector of splitTopLevel(prelude)) {
        const targets = dom.clickStateTargets(selector);
        // An unparsed selector is left to the judge.
        if (targets?.some(nodes => nodes.some(i => !dom.nodes[i]!.marked))) board.push(`css ${selector}`);
      }
    }
  return { interaction, board };
}

// ---- Scripts: each click registration's receiver, resolved to elements where a static reading can.

type Value = { kind: "page" } | { kind: "nodes"; nodes: number[] } | { kind: "unknown" };
const UNKNOWN: Value = { kind: "unknown" };
const EVENTS = "click|pointerdown|mousedown|pointerup|mouseup";
const LISTEN = new RegExp(`addEventListener\\s*\\(\\s*(["'\`])(?:${EVENTS})\\1`, "g");
const PROPERTY = new RegExp(`(?:\\??\\.\\s*on(?:${EVENTS})|\\[\\s*(["'\`])on(?:${EVENTS})\\1\\s*\\])\\s*=(?![=>])`, "g");
const BARE_PROPERTY = new RegExp(`(?<![\\w$.'"\`\\]])on(?:${EVENTS})\\s*=(?![=>])`, "g");
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The start of the member/call chain that ends at `end`, read backwards.
function chainStart(text: string, end: number): number {
  let i = end;
  while (i > 0 && /\s/.test(text[i - 1]!)) i--;
  for (;;) {
    const ch = text[i - 1];
    if (ch === ")" || ch === "]") {
      const open = ch === ")" ? "(" : "[";
      let depth = 0, j = i - 1;
      for (; j >= 0; j--) { if (text[j] === ch) depth++; else if (text[j] === open && --depth === 0) break; }
      if (j < 0) return i;
      i = j;
      continue;
    }
    if (ch !== undefined && /[\w$]/.test(ch)) {
      while (i > 0 && /[\w$]/.test(text[i - 1]!)) i--;
      let j = i;
      while (j > 0 && /\s/.test(text[j - 1]!)) j--;
      if (text[j - 1] !== ".") return i;
      i = j - 1;
      if (text[i - 1] === "?") i--;
      while (i > 0 && /\s/.test(text[i - 1]!)) i--;
      continue;
    }
    return i;
  }
}

// The member/call chain starting at `start`, read forwards.
function chainAt(text: string, start: number): string {
  let i = start;
  const m = /^\s*(?:await\s+)?[\w$]+/.exec(text.slice(i));
  if (!m) return "";
  i += m[0].length;
  for (;;) {
    const rest = text.slice(i);
    const member = /^\s*\??\.\s*[\w$]+/.exec(rest);
    if (member) { i += member[0].length; continue; }
    const group = /^\s*[([]/.exec(rest);
    if (group) { const end = closeOf(text, i + group[0].length - 1); if (end < 0) break; i = end; continue; }
    break;
  }
  return text.slice(start, i);
}

const literal = (arg: string): string | null => {
  const m = /^\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\$]*)`)\s*$/.exec(arg);
  return m ? (m[1] ?? m[2] ?? m[3]!) : null;
};

export class ScriptReader {
  private readonly dom: Dom;
  private readonly text: string;
  private readonly scriptNode: number;
  constructor(dom: Dom, text: string, scriptNode: number) {
    this.dom = dom;
    this.text = text;
    this.scriptNode = scriptNode;
  }

  // Every click registration in the script: "page" (the whole page listens), the elements that listen, or unknown.
  registrations(): { site: string; value: Value }[] {
    const out: { site: string; value: Value }[] = [];
    for (const m of this.text.matchAll(LISTEN)) {
      let j = m.index!;
      while (j > 0 && /\s/.test(this.text[j - 1]!)) j--;
      const dotted = this.text[j - 1] === ".";
      const end = dotted ? j - 1 - (this.text[j - 2] === "?" ? 1 : 0) : j;
      out.push({ site: m[0], value: dotted ? this.evaluate(this.text.slice(chainStart(this.text, end), end), 0) : { kind: "page" } });
    }
    for (const m of this.text.matchAll(PROPERTY)) out.push({ site: m[0], value: this.evaluate(this.text.slice(chainStart(this.text, m.index!), m.index!), 0) });
    for (const m of this.text.matchAll(BARE_PROPERTY)) out.push({ site: m[0], value: { kind: "page" } });
    return out;
  }

  private evaluate(expr: string, depth: number): Value {
    const base = /^\s*(?:await\s+)?([\w$]+)/.exec(expr);
    if (!base || depth > 6) return UNKNOWN;
    let i = base[0].length;
    const name = base[1]!;
    let value: Value | "document" | "Array" =
      name === "document" ? "document" : ["window", "globalThis", "self"].includes(name) ? { kind: "page" } : name === "Array" ? "Array" : this.variable(name, depth + 1);
    for (;;) {
      const rest = expr.slice(i);
      const member = /^\s*\??\.\s*([\w$]+)/.exec(rest);
      const index = member ? null : /^\s*\[/.exec(rest);
      if (!member && !index) break;
      if (index) {
        const end = closeOf(expr, i + index[0].length - 1);
        if (end < 0) return UNKNOWN;
        const n = Number(expr.slice(i + index[0].length, end - 1).trim());
        value = typeof value === "object" && value.kind === "nodes" && Number.isInteger(n) ? { kind: "nodes", nodes: value.nodes.slice(n, n + 1) } : UNKNOWN;
        i = end;
        continue;
      }
      i += member![0].length;
      let arg: string | null = null;
      const call = /^\s*\(/.exec(expr.slice(i));
      if (call) {
        const end = closeOf(expr, i + call[0].length - 1);
        if (end < 0) return UNKNOWN;
        arg = expr.slice(i + call[0].length, end - 1);
        i = end;
      }
      value = this.step(value, member![1]!, arg, depth);
      if (typeof value === "object" && value.kind !== "nodes") return value;
    }
    return typeof value === "string" ? (value === "document" ? { kind: "page" } : UNKNOWN) : value;
  }

  private step(value: Value | "document" | "Array", member: string, arg: string | null, depth: number): Value | "document" {
    const dom = this.dom;
    if (value === "Array") return member === "from" && arg !== null ? this.evaluate(arg, depth + 1) : UNKNOWN;
    const text = arg === null ? null : literal(arg);
    if (value === "document") {
      if (arg === null) return member === "currentScript" ? { kind: "nodes", nodes: [this.scriptNode] } : ["body", "documentElement"].includes(member) ? { kind: "page" } : UNKNOWN;
      if (text === null) return UNKNOWN;
      return this.lookup(member, text, undefined);
    }
    if (typeof value !== "object" || value.kind !== "nodes") return UNKNOWN;
    const nodes = value.nodes;
    const many = (list: number[]) => ({ kind: "nodes" as const, nodes: [...new Set(list)].sort((a, b) => a - b) });
    if (arg === null) {
      switch (member) {
        case "parentElement": case "parentNode": return many(nodes.map(i => dom.nodes[i]!.parent).filter(i => i >= 0));
        case "children": return many(nodes.flatMap(i => dom.childrenOf(i)));
        case "firstElementChild": return many(nodes.flatMap(i => dom.childrenOf(i).slice(0, 1)));
        case "lastElementChild": return many(nodes.flatMap(i => dom.childrenOf(i).slice(-1)));
        case "nextElementSibling": return many(nodes.map(i => dom.next(i)).filter((i): i is number => i !== null));
        case "previousElementSibling": return many(nodes.map(i => dom.previous(i)).filter((i): i is number => i !== null));
        default: return UNKNOWN;
      }
    }
    if (member === "item") { const n = Number(arg.trim()); return Number.isInteger(n) ? many(nodes.slice(n, n + 1)) : UNKNOWN; }
    if (text === null) return UNKNOWN;
    if (member === "closest") {
      const out: number[] = [];
      for (const i of nodes) {
        for (let p = i; p >= 0; p = dom.nodes[p]!.parent) {
          const hit = dom.select(text, [p]);
          if (hit === null) return UNKNOWN;
          if (hit.length) { out.push(p); break; }
        }
      }
      return many(out);
    }
    const found: number[] = [];
    for (const i of nodes) {
      const result = this.lookup(member, text, dom.descendants(i));
      if (result.kind !== "nodes") return result;
      found.push(...result.nodes);
    }
    return many(found);
  }

  private lookup(member: string, text: string, among: number[] | undefined): Value {
    const dom = this.dom;
    const selector = member === "getElementById" ? null
      : member === "getElementsByClassName" ? text.trim().split(/\s+/).map(c => `.${c}`).join("")
      : member === "getElementsByTagName" ? text
      : ["querySelector", "querySelectorAll"].includes(member) ? text : undefined;
    if (selector === undefined) return UNKNOWN;
    if (selector === null) {
      const hit = (among ?? dom.nodes.map((_, i) => i)).filter(i => dom.nodes[i]!.attrs.id === text);
      return { kind: "nodes", nodes: hit.slice(0, 1) };
    }
    const hit = dom.select(selector, among);
    if (hit === null) return UNKNOWN;
    return { kind: "nodes", nodes: member === "querySelector" ? hit.slice(0, 1) : hit };
  }

  // A variable's value from its assignments, a for…of loop or a forEach callback; unknown when none is readable.
  private variable(name: string, depth: number): Value {
    const id = escapeRegex(name);
    const values: Value[] = [];
    // A right side that is no chain (a string, a number, `name=` inside a selector string) defines no element.
    for (const m of this.text.matchAll(new RegExp(`(?<![\\w$.])${id}\\s*=(?![=>])`, "g"))) {
      const chain = chainAt(this.text, m.index! + m[0].length);
      if (chain) values.push(this.evaluate(chain, depth));
    }
    for (const m of this.text.matchAll(new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+${id}\\s+of\\s+`, "g"))) values.push(this.evaluate(chainAt(this.text, m.index! + m[0].length), depth));
    for (const m of this.text.matchAll(new RegExp(`\\.\\s*forEach\\s*\\(\\s*(?:async\\s+)?(?:function\\s*[\\w$]*\\s*)?\\(?\\s*${id}(?![\\w$])`, "g")))
      values.push(this.evaluate(this.text.slice(chainStart(this.text, m.index!), m.index!), depth));
    if (!values.length || values.some(v => v.kind === "unknown")) return UNKNOWN;
    if (values.some(v => v.kind === "page")) return { kind: "page" };
    return { kind: "nodes", nodes: [...new Set(values.flatMap(v => (v.kind === "nodes" ? v.nodes : [])))].sort((a, b) => a - b) };
  }
}
