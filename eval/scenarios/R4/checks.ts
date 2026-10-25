import type { Checks } from "../../lib/types.ts";

function styles(source: string, path: string): string {
  if (/\.css$/i.test(path)) return source.replace(/\/\*[\s\S]*?\*\//g, "");
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m => m[1]).join("\n") + "\n" +
    [...html.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)].map(m => `{${m[2]}}`).join("\n");
}

function colors(css: string): string[] {
  return [...css.matchAll(/(?:^|[;{])\s*[-\w]+\s*:\s*([^;{}]+)/g)]
    .flatMap(m => m[1].match(/#[\da-f]{3,8}\b|\brgba?\s*\(/gi) ?? []).map(s => s.toLowerCase());
}

const checks: Checks = ctx => {
  const target = "web/login.html";
  const page = ctx.read(target) ?? "";
  const changed = ctx.changedFiles();
  const protectedChanges = changed.filter(p => p.startsWith("design/") || p.startsWith(".doan/"));
  const parsed = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text=[]; self.skip=0; self.links=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag in ('script','style','template'): self.skip+=1
        if tag=='link' and 'stylesheet' in a.get('rel','').split(): self.links.append(a.get('href',''))
    def handle_endtag(self, tag):
        if tag in ('script','style','template'): self.skip=max(0,self.skip-1)
    def handle_data(self, data):
        if not self.skip: self.text.append(data)
p=Page(); p.feed(sys.argv[1]); print(json.dumps({'text':' '.join(' '.join(p.text).split()),'links':p.links}))
`, page]);
  let text = "", links: string[] = [];
  if (parsed.code === 0) ({ text, links } = JSON.parse(parsed.stdout));
  const copy = ["Welcome back", "Sign in to your Fieldnotes workspace.", "Email address", "Password", "Remember me", "Forgot password?", "Sign in"];
  const missing = copy.filter(s => !text.includes(s));
  const directColors: string[] = [];
  for (const path of changed.filter(p => /\.(css|html)$/i.test(p))) {
    const old = colors(styles(ctx.seed(path) ?? "", path));
    for (const value of colors(styles(ctx.read(path) ?? "", path))) {
      const index = old.indexOf(value);
      if (index >= 0) old.splice(index, 1);
      else directColors.push(`${path}: ${value}`);
    }
  }
  // Follow local stylesheets and CSS imports so shared styles count as token use.
  const seen = new Set<string>();
  const sheets: string[] = [];
  const imports = (css: string, parent: string) => {
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/gi)) visit(match[1] ?? match[2] ?? match[3], parent);
  };
  const visit = (href: string, parent: string) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(href)) return;
    const parts = parent.split("/").slice(0, -1);
    for (const part of href.split(/[?#]/)[0].split("/")) {
      if (part === "..") { if (!parts.length) return; parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    const path = parts.join("/");
    if (!path || seen.has(path)) return;
    seen.add(path);
    const css = ctx.read(path);
    if (css === null) return;
    sheets.push(css);
    imports(css, path);
  };
  links.forEach(href => visit(href, target));
  imports(styles(page, target), target);
  const reachable = styles(page, target) + sheets.join("\n");
  const check = ctx.doan(["check"]);
  return [
    { id: "login_implemented", pass: ctx.exists(target) && page !== ctx.seed(target) && /<form\b/i.test(page) && /<input\b/i.test(page), detail: "web/login.html replaces the placeholder with a login form" },
    { id: "canvas_copy", pass: parsed.code === 0 && missing.length === 0, detail: parsed.code !== 0 ? parsed.stderr : `missing visible copy: ${missing.join(", ") || "none"}` },
    { id: "uses_shared_tokens", pass: seen.has("web/tokens.css") && /var\(\s*--color-/.test(reachable), detail: `reachable stylesheets: ${[...seen].join(", ") || "none"}; shared color token use required` },
    { id: "no_new_direct_colors", pass: directColors.length === 0, detail: `new hex/rgb color values: ${directColors.join(", ") || "none"}` },
    { id: "design_and_review_unchanged", pass: protectedChanges.length === 0, detail: `changed design/.doan paths: ${protectedChanges.join(", ") || "none"}` },
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
  ];
};
export default checks;
