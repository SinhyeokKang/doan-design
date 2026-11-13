import { isDeepStrictEqual } from "node:util";
import type { Check, Checks } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";

const path = ".doan/canvases/onboarding.html";
// The frame's id; the prompt names its title ("Sign up (phone)"), and a desktop sign-up frame sits next to it.
const frame = "signup-phone";

// The prototype mark grammar shared with the CLI and the app (schema/fixtures/prototype-mark/cases.json).
export const validSize = (value: string) => /^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$/.test(value);

type Mark = { frame: string | null; value: string };
type Parsed = { nodes: unknown[]; marks: Mark[] };

// Each document as tag, attribute and whitespace-collapsed text nodes with every data-doan-prototype attribute
// dropped, and the marks those attributes carried outside <template>, each with the element's own frame id
// (null when the element is not a frame).
function parse(ctx: Parameters<Checks>[0], documents: string[]): Parsed[] | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.nodes = []; self.marks = []; self.templates = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'template': self.templates += 1
        if 'data-doan-prototype' in a and not self.templates:
            self.marks.append({'frame': a.get('data-doan-frame'), 'value': a['data-doan-prototype'] or ''})
        self.nodes.append(['start', tag, sorted([k, v] for k, v in attrs if k != 'data-doan-prototype')])
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1)
        self.nodes.append(['end', tag])
    def handle_data(self, data):
        text = ' '.join(data.split())
        if text: self.nodes.append(['text', text])
out = []
for html in sys.argv[1:]:
    d = Document(); d.feed(html); out.append({'nodes': d.nodes, 'marks': d.marks})
print(json.dumps(out))
`, ...documents]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

export function markChecks(ctx: Parameters<Checks>[0]): Check[] {
  const seed = ctx.seed(path), final = ctx.read(path);
  const parsed = seed === null || final === null ? null : parse(ctx, [seed, final]);
  if (parsed === null) return [
    { id: "prototype_on_frame", pass: false, detail: final === null ? "canvas missing" : "parse failed" },
    { id: "canvas_otherwise_unchanged", pass: false, detail: final === null ? "canvas missing" : "parse failed" },
  ];
  const [before, after] = parsed as [Parsed, Parsed];
  const marks = after.marks;
  return [
    {
      id: "prototype_on_frame",
      pass: marks.length === 1 && marks[0]!.frame === frame && validSize(marks[0]!.value),
      detail: JSON.stringify(marks.map(mark => ({ ...mark, valid: validSize(mark.value) }))),
    },
    { id: "canvas_otherwise_unchanged", pass: isDeepStrictEqual(before.nodes, after.nodes), detail: "" },
  ];
}

const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  return [
    ...workChecks(ctx),
    noOpen(ctx),
    ...markChecks(ctx),
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
