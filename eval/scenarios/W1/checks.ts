import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const listing = ctx.doan(["ls"]);
  const canvases = listing.json?.result?.canvases ?? [];
  const findings = check.json?.result?.findings ?? [];
  const documents = canvases.map((canvas: any) => ({ path: canvas.path, html: ctx.read(canvas.path) ?? "" }));
  const links = ctx.run("python3.12", ["-c", `
import json, posixpath, sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs = []; self.templates = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'template': self.templates += 1
        a = dict(attrs)
        if not self.templates and tag == 'link' and 'stylesheet' in a.get('rel', '').lower().split():
            self.hrefs.append(a.get('href', ''))
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1)
result = []
for doc in json.loads(sys.argv[1]):
    parser = Links(); parser.feed(doc['html'])
    linked = False
    for href in parser.hrefs:
        url = urlsplit(href.strip())
        path = posixpath.normpath(posixpath.join(posixpath.dirname(doc['path']), unquote(url.path)))
        if not url.scheme and not url.netloc and path == 'styles/tokens.css': linked = True
    result.append({'path': doc['path'], 'linked': linked})
print(json.dumps(result))
`, JSON.stringify(documents)]);
  const linked = links.code === 0 ? JSON.parse(links.stdout) : [];
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
