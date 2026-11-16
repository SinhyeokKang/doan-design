import type { Check, Checks } from "../../lib/types.ts";

type Doc = {
  path: string;
  hrefs: string[];
  // <style> text and style attribute values outside <template>.
  css: string[];
  frames: { id: string; prototype: string | null }[];
};

const variable = "--doan-viewport-height";

// Reads every canvas as stylesheet links, style text, style attributes and frames outside <template>.
function parse(ctx: Parameters<Checks>[0], documents: { path: string; html: string }[]): Doc[] | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Doc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.templates = 0; self.in_style = False; self.hrefs = []; self.css = []; self.frames = []
    def handle_starttag(self, tag, attrs):
        a = {}
        for key, value in attrs:
            if key not in a: a[key] = value or ''
        if tag == 'template': self.templates += 1
        if self.templates: return
        if tag == 'style': self.in_style = True
        if tag == 'link' and 'stylesheet' in a.get('rel', '').lower().split(): self.hrefs.append(a.get('href', ''))
        if 'style' in a: self.css.append(a['style'])
        if 'data-doan-frame' in a: self.frames.append({'id': a['data-doan-frame'], 'prototype': a.get('data-doan-prototype')})
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag == 'template': self.handle_endtag(tag)
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1); return
        if tag == 'style': self.in_style = False
    def handle_data(self, data):
        if self.in_style and not self.templates: self.css.append(data)
out = []
for doc in json.loads(sys.argv[1]):
    p = Doc(); p.feed(doc['html'])
    out.append({'path': doc['path'], 'hrefs': p.hrefs, 'css': p.css, 'frames': p.frames})
print(json.dumps(out))
`, JSON.stringify(documents)]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

// Text of the local stylesheets a canvas reaches through <link> and @import, as in W6.
function reached(ctx: Parameters<Checks>[0], doc: Doc): string[] {
  const seen = new Map<string, string>();
  const imports = (css: string, parent: string) => {
    for (const match of uncomment(css).matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/gi)) visit(match[1] ?? match[2] ?? match[3], parent);
  };
  const visit = (href: string, parent: string) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(href)) return;
    const parts = parent.split("/").slice(0, -1);
    for (const part of decodeURIComponent(href.split(/[?#]/)[0]).split("/")) {
      if (part === "..") { if (!parts.length) return; parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    const path = parts.join("/");
    if (!path || seen.has(path)) return;
    const css = ctx.read(path);
    if (css === null) return;
    seen.set(path, css);
    imports(css, path);
  };
  doc.hrefs.forEach(href => visit(href, doc.path));
  doc.css.forEach(css => imports(css, doc.path));
  return [...seen.values()];
}

const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// A desktop viewport, not a content height: landscape and within common desktop screen sizes.
function desktopHeight(prototype: string | null): number | null {
  const match = /^(\d+)x(\d+)$/.exec(prototype ?? "");
  if (!match) return null;
  const [w, h] = [Number(match[1]), Number(match[2])];
  return w >= 1024 && w <= 2560 && h >= 600 && h <= 1600 && w > h ? h : null;
}

// Fallbacks of the variable inside `height` declarations (not min-/max-height), in px.
function heightFallbacks(css: string): number[] {
  const out: number[] = [];
  for (const declaration of uncomment(css).matchAll(/(?:^|[{;\s])height\s*:([^;{}]*)/gi))
    for (const use of declaration[1].matchAll(/var\(\s*--doan-viewport-height\s*,\s*(\d+(?:\.\d+)?)px\s*\)/gi)) out.push(Number(use[1]));
  return out;
}

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const listing = ctx.doan(["ls"]);
  const canvases: { path: string }[] = (listing.json?.result?.canvases ?? []).filter((c: { path: string }) => c.path.startsWith(".doan/canvases/"));
  const findings: { code: string }[] = check.json?.result?.findings ?? [];
  const only = (code: string, extra: string[] = []): Check => {
    const found = findings.filter(f => f.code === code);
    return { id: `no_${code}`, pass: check.json?.ok === true && found.length === 0 && extra.length === 0, detail: JSON.stringify({ findings: found, stylesheets: extra }) };
  };
  const html = canvases.map(c => ({ path: c.path, html: ctx.read(c.path) ?? "" }));
  const docs = parse(ctx, html) ?? [];
  const sheets = docs.map(doc => ({ doc, css: [...doc.css, ...reached(ctx, doc)] }));
  const heights = docs.flatMap(doc => doc.frames.map(f => desktopHeight(f.prototype))).filter((h): h is number => h !== null);
  const fallbacks = sheets.flatMap(({ css }) => css.flatMap(heightFallbacks));
  // doan check covers the canvas's own CSS; the scenario also reads the stylesheets the canvas reaches.
  const units = sheets.flatMap(({ css }) => css.flatMap(text => [...uncomment(text).matchAll(/\d(?:[dsl]?v[hb])(?![\w-])/gi)].map(m => m[0])));
  const definitions = [
    ...sheets.flatMap(({ css }) => css.filter(text => new RegExp(`${variable}\\s*:`).test(uncomment(text)))),
    ...html.filter(d => new RegExp(`setProperty\\(\\s*["'\`]${variable}["'\`]`).test(d.html)).map(d => d.path),
  ];
  return [
    { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_created", pass: listing.code === 0 && canvases.length >= 1, detail: JSON.stringify(canvases.map(c => c.path)) },
    { id: "desktop_prototype", pass: heights.length > 0, detail: JSON.stringify(docs.map(doc => ({ path: doc.path, frames: doc.frames }))) },
    { id: "viewport_height_fallback", pass: fallbacks.some(h => heights.includes(h)), detail: JSON.stringify({ fallbacks, heights }) },
    only("viewport_height_unit", units),
    only("viewport_height_no_fallback"),
    { id: "variable_not_defined", pass: definitions.length === 0, detail: JSON.stringify(definitions) },
  ];
};
export default checks;
