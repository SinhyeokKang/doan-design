import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { doanInvocations } from "../../lib/call-log.ts";
import { doanCommand, doanPositionals } from "../../lib/transcript.ts";
import type { Checks } from "../../lib/types.ts";

const target = ".doan/canvases/pricing.html";
const shared = ".doan/assets/cards.css";
const unrelated = ".doan/canvases/archive.html";
const editedPaths = [target, shared];

function pathKey(repo: string, path: string): string {
  const absolute = resolve(repo, path);
  try { return resolve(realpathSync(dirname(absolute)), basename(absolute)); }
  catch { return absolute; } // A parent removed after the invocation has only its recorded spelling left.
}

function buttonCopy(ctx: Parameters<Checks>[0]): string | null {
  const html = ctx.read(target);
  if (html === null) return null;
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Button(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack = []; self.text = []
    def handle_starttag(self, tag, attrs):
        self.stack.append((tag, tag in ('a', 'button') and dict(attrs).get('data-doan-id') == 'plan-cta'))
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs); self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]; break
    def handle_data(self, text):
        if any(tag in ('script', 'style', 'template') for tag, _ in self.stack): return
        if any(button for _, button in self.stack): self.text.append(text)
p = Button(); p.feed(sys.argv[1]); print(json.dumps(' '.join(''.join(p.text).split())))
`, html]);
  if (result.code !== 0) return null;
  const text: unknown = JSON.parse(result.stdout);
  return typeof text === "string" ? text : null;
}

function cardPadding(css: string): string | undefined {
  const values = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors = "", body = ""]) =>
    selectors.split(",").some(selector => selector.trim() === ".card")
      ? [...body.matchAll(/(?:^|;)\s*padding\s*:\s*([^;]+)/gi)].map(([, value = ""]) => value.replace(/\s+/g, ""))
      : []);
  return values.at(-1);
}

const checks: Checks = ctx => {
  const changed = ctx.changedFiles();
  const check = ctx.doan(["check", ...editedPaths]);
  const invocations = ctx.calls.doan === undefined ? [] : doanInvocations(ctx.calls, true).words.filter(words => doanCommand(words) === "check");
  const paths = new Set(invocations.flatMap(words => doanPositionals(words)?.slice(1).map(path => pathKey(ctx.repo, path)) ?? []));
  const invoked = editedPaths.every(path => paths.has(pathKey(ctx.repo, path)));
  const seed = ctx.seed(unrelated);
  const copy = buttonCopy(ctx);
  const padding = cardPadding(ctx.read(shared) ?? "");
  return [
    { id: "unrelated_canvas_unchanged", pass: seed !== null && ctx.read(unrelated) === seed, detail: unrelated },
    { id: "edited_canvas_and_css", pass: editedPaths.every(path => changed.includes(path)), detail: JSON.stringify(changed) },
    { id: "pricing_button_copy", pass: copy === "Start free trial", detail: JSON.stringify(copy) },
    { id: "card_padding_token", pass: padding === "var(--space-6)" || padding === "var(--space-6)!important", detail: padding ?? "no .card padding" },
    { id: "scoped_check_invoked", pass: invoked, detail: JSON.stringify(invocations) },
    { id: "scoped_check_clean", pass: check.code === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
  ];
};
export default checks;
