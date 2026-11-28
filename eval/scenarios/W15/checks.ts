import type { Check, Checks, CheckContext } from "../../lib/types.ts";

const canvas = ".doan/canvases/projects.html";
// The frame the prompt names ("Project list"); the click and the motion belong in it.
const target = "project-list";

type Frame = { id: string; prototype: string | null; start: number; end: number };
type Doc = {
  frames: Frame[];
  // id, data-doan-id, data-doan-frame and class values, split by whether the element sits in a marked element.
  inside: string[];
  outside: string[];
  // Click triggers found on elements: an on* handler attribute, popovertarget or <details>.
  elementTriggers: { kind: string; marked: boolean }[];
  scripts: { text: string; src: string | null; marked: boolean }[];
  styles: string[];
  stylesheets: string[];
};

// Reads the canvas with the frames' source spans and whether each element is inside an element carrying
// data-doan-prototype (the board is everything that is not).
function parse(ctx: CheckContext, html: string): Doc | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
HANDLERS = {'onclick','onpointerdown','onmousedown','onpointerup','onmouseup'}
html = sys.argv[1]
lines = [0]
for i, ch in enumerate(html):
    if ch == '\\n': lines.append(i + 1)
class Doc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []; self.frames = []; self.inside = set(); self.outside = set()
        self.triggers = []; self.scripts = []; self.styles = []; self.sheets = []; self.text = None
    def at(self):
        line, col = self.getpos(); return lines[line - 1] + col
    def handle_starttag(self, tag, attrs):
        a = {}
        for key, value in attrs:
            if key not in a: a[key] = value or ''
        marked = bool(self.stack and self.stack[-1]['marked']) or 'data-doan-prototype' in a
        names = [a[k] for k in ('id', 'data-doan-id', 'data-doan-frame') if a.get(k)] + a.get('class', '').split()
        (self.inside if marked else self.outside).update(names)
        for key in a:
            if key in HANDLERS or key == 'popovertarget': self.triggers.append({'kind': key, 'marked': marked})
        if tag == 'details': self.triggers.append({'kind': 'details', 'marked': marked})
        if tag == 'link' and 'stylesheet' in a.get('rel', '').lower().split(): self.sheets.append(a.get('href', ''))
        node = {'tag': tag, 'marked': marked, 'start': self.at(), 'frame': a.get('data-doan-frame'), 'prototype': a.get('data-doan-prototype')}
        if tag == 'script': self.text = {'kind': 'script', 'parts': [], 'src': a.get('src'), 'marked': marked}
        if tag == 'style': self.text = {'kind': 'style', 'parts': []}
        if tag not in VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID: self.stack.pop()
        self.text = None
    def handle_endtag(self, tag):
        if self.text is not None and tag in ('script', 'style'):
            t = self.text; self.text = None
            if t['kind'] == 'script': self.scripts.append({'text': ''.join(t['parts']), 'src': t['src'], 'marked': t['marked']})
            else: self.styles.append(''.join(t['parts']))
        if not any(n['tag'] == tag for n in self.stack): return
        end = html.index('>', self.at()) + 1
        while self.stack:
            node = self.stack.pop()
            if node['frame'] is not None:
                self.frames.append({'id': node['frame'], 'prototype': node['prototype'], 'start': node['start'], 'end': end})
            if node['tag'] == tag: break
    def handle_data(self, data):
        if self.text is not None: self.text['parts'].append(data)
d = Doc(); d.feed(html); d.close()
print(json.dumps({'frames': d.frames, 'inside': sorted(d.inside), 'outside': sorted(d.outside), 'elementTriggers': d.triggers, 'scripts': d.scripts, 'styles': d.styles, 'stylesheets': d.sheets}))
`, html]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

// A local file a canvas links to, relative to the canvas; null for remote, absolute or missing files.
function linked(ctx: CheckContext, href: string): string | null {
  if (/^(?:[a-z]+:|\/|#)/i.test(href)) return null;
  const parts = canvas.split("/").slice(0, -1);
  for (const part of decodeURIComponent(href.split(/[?#]/)[0]!).split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return ctx.read(parts.join("/"));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const JS_CLICK = /addEventListener\s*\(\s*(["'`])(?:click|pointerdown|mousedown|pointerup|mouseup)\1|\.on(?:click|pointerdown|mousedown|pointerup|mouseup)\s*=(?!=)/;
// States that only a press or a click brings about on the board; :focus-visible (keyboard) and :hover are allowed.
const CSS_CLICK = /:(?:focus-within|focus|active|checked|target-within|target)(?![\w-])/;

// Selectors split at top-level commas.
function selectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) { out.push(prelude.slice(start, i)); start = i + 1; }
  }
  out.push(prelude.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

// The four checks below, plus the final canvas's style and script texts (inline and linked) for scenarios that share
// this canvas (W16).
export function boardChecks(ctx: CheckContext): { checks: Check[]; css: string[]; scripts: string[] } {
  const check = ctx.doan(["check"]);
  const clean = { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` };
  const seedHtml = ctx.seed(canvas), finalHtml = ctx.read(canvas);
  const seed = seedHtml === null ? null : parse(ctx, seedHtml);
  const final = finalHtml === null ? null : parse(ctx, finalHtml);
  if (seed === null || final === null || seedHtml === null || finalHtml === null) {
    const detail = finalHtml === null ? "canvas missing" : "parse failed";
    return { checks: [clean, ...["no_board_click_trigger", "prototype_marked", "other_frames_unchanged"].map(id => ({ id, pass: false, detail }))], css: [], scripts: [] };
  }

  // A script or a selector outside the marked elements belongs to them when it names only their elements: it names
  // data-doan-prototype or a name used only inside them, and no name used only on the board.
  const outside = new Set(final.outside);
  const insideOnly = final.inside.filter(name => !outside.has(name));
  const boardOnly = final.outside.filter(name => !final.inside.includes(name));
  const names = (text: string, list: string[]) => list.filter(name => new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`).test(text));
  const belongsToPrototype = (text: string) => text.includes("data-doan-prototype") || (names(text, insideOnly).length > 0 && names(text, boardOnly).length === 0);

  const board: string[] = [];
  for (const t of final.elementTriggers) if (!t.marked) board.push(t.kind);
  const scripts: string[] = [];
  for (const script of final.scripts) {
    const text = script.src === null ? script.text : linked(ctx, script.src) ?? "";
    scripts.push(text);
    const match = JS_CLICK.exec(text);
    if (match && !script.marked && !belongsToPrototype(text)) board.push(`script ${script.src ?? "inline"}: ${match[0]}`);
  }
  const css = [...final.styles, ...final.stylesheets.map(href => linked(ctx, href) ?? "")];
  for (const text of css)
    for (const rule of uncomment(text).matchAll(/([^{}]+)\{[^{}]*\}/g))
      for (const selector of selectors(rule[1]!))
        if (CSS_CLICK.test(selector) && !belongsToPrototype(selector)) board.push(`css ${selector}`);

  const seedIds = new Set(seed.frames.map(f => f.id));
  const marked = final.frames.filter(f => f.prototype !== null && (f.id === target || !seedIds.has(f.id)));
  const changed = seed.frames.filter(f => f.id !== target).filter(f => {
    const now = final.frames.filter(g => g.id === f.id);
    return now.length !== 1 || finalHtml.slice(now[0]!.start, now[0]!.end) !== seedHtml.slice(f.start, f.end);
  }).map(f => f.id);

  return { css, scripts, checks: [
    clean,
    { id: "no_board_click_trigger", pass: board.length === 0, detail: JSON.stringify(board) },
    { id: "prototype_marked", pass: marked.length > 0, detail: JSON.stringify(final.frames.map(f => ({ id: f.id, prototype: f.prototype }))) },
    { id: "other_frames_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ] };
}

const checks: Checks = ctx => boardChecks(ctx).checks;
export default checks;
