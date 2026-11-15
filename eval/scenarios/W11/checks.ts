import { isDeepStrictEqual } from "node:util";
import type { Check, Checks } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";
import { linkGroups } from "../../lib/prototype-links.ts";

const path = ".doan/canvases/onboarding.html";
type Parsed = {
  nodes: unknown[];
  frames: { id: string; prototype?: string }[];
  gotos: { value: string; frames: string[] }[];
};

// As in W7, compare parsed markup so formatting cannot fail an otherwise unchanged design.
function parse(ctx: Parameters<Checks>[0], documents: [string, string]): [Parsed, Parsed] | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []; self.frames = []; self.gotos = []; self.stack = []
    def handle_starttag(self, tag, attrs):
        a = {}
        for key, value in attrs:
            if key not in a: a[key] = value or ''
        inert = tag == 'template' or any(t == 'template' for t, f in self.stack)
        frame = a.get('data-doan-frame')
        if not inert:
            if frame is not None:
                self.frames.append({'id': frame, 'prototype': a.get('data-doan-prototype')})
            if 'data-doan-goto' in a:
                enclosing = [f for t, f in self.stack if f is not None]
                if frame is not None: enclosing.append(frame)
                self.gotos.append({'value': a['data-doan-goto'], 'frames': enclosing})
        self.nodes.append(['start', tag, sorted([k, v] for k, v in attrs if k != 'data-doan-goto')])
        if tag not in VOID: self.stack.append((tag, frame))
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]; break
        self.nodes.append(['end', tag])
    def handle_data(self, data):
        text = ' '.join(data.split())
        if text: self.nodes.append(['text', text])
    def handle_comment(self, data):
        self.nodes.append(['comment', data])
    def handle_decl(self, data):
        self.nodes.append(['declaration', data])
out = []
for html in sys.argv[1:]:
    d = Document(); d.feed(html)
    out.append({'nodes': d.nodes, 'frames': d.frames, 'gotos': d.gotos})
print(json.dumps(out))
`, ...documents]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

export function groupChecks(ctx: Parameters<Checks>[0]): Check[] {
  const seed = ctx.seed(path), final = ctx.read(path);
  const parsed = seed === null || final === null ? null : parse(ctx, [seed, final]);
  if (parsed === null) return [
    { id: "one_link_group", pass: false, detail: final === null ? "canvas missing" : "parse failed" },
    { id: "canvas_otherwise_unchanged", pass: false, detail: final === null ? "canvas missing" : "parse failed" },
  ];
  const [before, after] = parsed;
  // Keep raw ids: truncating a long id could turn a different frame into a playable target.
  const groups = linkGroups(after.frames, after.gotos);
  return [
    { id: "one_link_group", pass: isDeepStrictEqual(groups, [["welcome", "signup", "done"]]), detail: JSON.stringify(groups) },
    { id: "canvas_otherwise_unchanged", pass: isDeepStrictEqual(before.nodes, after.nodes), detail: "" },
  ];
}

const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  return [
    ...workChecks(ctx),
    noOpen(ctx),
    ...groupChecks(ctx),
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
