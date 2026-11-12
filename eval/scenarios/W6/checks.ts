import type { Check, Checks } from "../../lib/types.ts";

const sprite = ".doan/assets/icons.svg";
const shell = ".doan/assets/components/app-shell.css";
const tokens = ".doan/assets/tokens.css";
// The four navigation icons the prompt asks for, by their id in the seed sprite.
const icons = ["icon-home", "icon-search", "icon-bell", "icon-settings"];

type Doc = {
  path: string;
  hrefs: string[];
  css: string;
  // Symbol id -> drawing signature, for symbols outside <template>.
  symbols: Record<string, string>;
  // <use> references outside <template>: href, else xlink:href, trimmed.
  uses: string[];
};

// Reads every document as stylesheet links, style text, symbols and <use> references outside <template>.
// A symbol's signature is its shapes' tags and geometry without class or style, so a copy that keeps the
// drawing matches even when it was restyled or renamed.
function parse(ctx: Parameters<Checks>[0], documents: { path: string; html: string }[]): Doc[] | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
GEOMETRY = ('d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points')
class Doc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.templates = 0; self.in_style = False; self.hrefs = []; self.css = []; self.symbols = {}; self.uses = []; self.symbol = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'template': self.templates += 1
        if self.templates: return
        if tag == 'style': self.in_style = True
        if tag == 'link' and 'stylesheet' in (a.get('rel') or '').lower().split(): self.hrefs.append(a.get('href') or '')
        if tag == 'symbol': self.symbol = [a.get('id') or '', []]
        elif self.symbol is not None:
            self.symbol[1].append([tag] + [[k, ' '.join((a.get(k) or '').split())] for k in GEOMETRY if k in a])
        if tag == 'use':
            ref = a['href'] if 'href' in a else a.get('xlink:href')
            if ref is not None: self.uses.append(ref.strip())
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag != 'template': self.handle_endtag(tag)
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1); return
        if self.templates: return
        if tag == 'style': self.in_style = False
        if tag == 'symbol' and self.symbol is not None:
            self.symbols[self.symbol[0]] = json.dumps(self.symbol[1]); self.symbol = None
    def handle_data(self, data):
        if self.in_style and not self.templates: self.css.append(data)
out = []
for doc in json.loads(sys.argv[1]):
    p = Doc(); p.feed(doc['html'])
    out.append({'path': doc['path'], 'hrefs': p.hrefs, 'css': '\\n'.join(p.css), 'symbols': p.symbols, 'uses': p.uses})
print(json.dumps(out))
`, JSON.stringify(documents)]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

// Repo paths of the stylesheets a canvas reaches through <link> and @import, local files only.
function reached(ctx: Parameters<Checks>[0], doc: Doc): Set<string> {
  const seen = new Set<string>();
  const imports = (css: string, parent: string) => {
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/gi)) visit(match[1] ?? match[2] ?? match[3], parent);
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
    seen.add(path);
    imports(css, path);
  };
  doc.hrefs.forEach(href => visit(href, doc.path));
  imports(doc.css, doc.path);
  return seen;
}

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const listing = ctx.doan(["ls"]);
  const canvases: { path: string }[] = (listing.json?.result?.canvases ?? []).filter((c: { path: string }) => c.path.startsWith(".doan/canvases/"));
  const findings: { code: string }[] = check.json?.result?.findings ?? [];
  const only = (code: string): Check => {
    const found = findings.filter(f => f.code === code);
    return { id: `no_${code}`, pass: check.json?.ok === true && found.length === 0, detail: JSON.stringify(found) };
  };
  const seedSprite = ctx.seed(sprite);
  const [seedDoc] = seedSprite === null ? [] : parse(ctx, [{ path: sprite, html: seedSprite }]) ?? [];
  const docs = parse(ctx, canvases.map(c => ({ path: c.path, html: ctx.read(c.path) ?? "" })));
  // A canvas draws an icon inline when one of its own symbols has the seed symbol's drawing and a <use> names it as a fragment.
  const drawn = (doc: Doc, icon: string) => {
    const wanted = seedDoc?.symbols[icon];
    return wanted !== undefined && Object.entries(doc.symbols).some(([id, signature]) => id !== "" && signature === wanted && doc.uses.includes(`#${id}`));
  };
  const inline = (docs ?? []).map(doc => ({ path: doc.path, missing: icons.filter(icon => !drawn(doc, icon)), uses: doc.uses }));
  const linked = (docs ?? []).map(doc => ({ path: doc.path, reached: [tokens, shell].filter(p => reached(ctx, doc).has(p)) }));
  return [
    { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_created", pass: listing.code === 0 && canvases.length >= 1, detail: JSON.stringify(canvases.map(c => c.path)) },
    { id: "icons_inline", pass: seedDoc !== undefined && docs !== null && inline.some(c => c.missing.length === 0), detail: docs === null ? "parse failed" : JSON.stringify(inline) },
    only("svg_use_not_inline"),
    only("ambiguous_custom_url"),
    { id: "shell_styles_linked", pass: linked.some(c => c.reached.length === 2), detail: JSON.stringify(linked) },
  ];
};
export default checks;
