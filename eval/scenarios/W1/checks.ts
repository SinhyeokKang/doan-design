import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const listing = ctx.doan(["ls"]);
  const canvases = listing.json?.result?.canvases ?? [];
  const findings = check.json?.result?.findings ?? [];
  const documents = canvases.map((canvas: any) => ({ path: canvas.path, html: ctx.read(canvas.path) ?? "" }));
  const links = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs = []; self.templates = 0; self.in_style = False; self.css = []
    def handle_starttag(self, tag, attrs):
        if tag == 'template': self.templates += 1
        if not self.templates and tag == 'style': self.in_style = True
        a = dict(attrs)
        if not self.templates and tag == 'link' and 'stylesheet' in a.get('rel', '').lower().split():
            self.hrefs.append(a.get('href', ''))
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1)
        if tag == 'style': self.in_style = False
    def handle_data(self, data):
        if self.in_style: self.css.append(data)
result = []
for doc in json.loads(sys.argv[1]):
    parser = Links(); parser.feed(doc['html'])
    result.append({'path': doc['path'], 'hrefs': parser.hrefs, 'css': '\\n'.join(parser.css)})
print(json.dumps(result))
`, JSON.stringify(documents)]);
  const linked = links.code === 0 ? JSON.parse(links.stdout).map((doc: { path: string; hrefs: string[]; css: string }) => {
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
    return { path: doc.path, linked: seen.has("styles/tokens.css") };
  }) : [];
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_created", pass: listing.code === 0 && canvases.length >= 1, detail: `${canvases.length} canvases` },
    { id: "board_width_declared", pass: canvases.length > 0 && canvases.every((c: any) => Number.isInteger(c.width) && c.width > 0), detail: JSON.stringify(canvases.map((c: any) => ({ path: c.path, width: c.width }))) },
    { id: "state_frames_created", pass: canvases.some((c: any) => c.frames?.length >= 2), detail: JSON.stringify(canvases.map((c: any) => ({ path: c.path, frames: c.frames?.length ?? 0 }))) },
    { id: "project_tokens_linked", pass: links.code === 0 && linked.length > 0 && linked.every((c: any) => c.linked), detail: links.code === 0 ? JSON.stringify(linked) : links.stderr },
    { id: "no_hardcoded_colors", pass: check.json?.ok === true && !findings.some((f: any) => f.code === "hardcoded_color"), detail: JSON.stringify(findings.filter((f: any) => f.code === "hardcoded_color")) },
    { id: "no_external_resources", pass: check.json?.ok === true && !findings.some((f: any) => f.code === "external_url"), detail: JSON.stringify(findings.filter((f: any) => f.code === "external_url")) },
  ];
};
export default checks;
