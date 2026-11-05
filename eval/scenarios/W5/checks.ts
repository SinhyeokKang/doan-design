import { isDeepStrictEqual } from "node:util";
import type { Check, Checks } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";

const path = ".doan/canvases/pricing.html";
const labels: Record<string, [string, string]> = {
  "plan-free": ["Get started", "Start for free"],
  "plan-pro": ["Upgrade", "Start Pro trial"],
  "plan-team": ["Contact sales", "Talk to sales"],
};

type Parsed = { nodes: unknown[]; frames: Record<string, unknown[]> };

// Each document as tag, attribute and whitespace-collapsed text nodes, whole and per frame;
// with `rename`, button texts are replaced as the request asks.
function parse(ctx: Parameters<Checks>[0], documents: string[], rename = false): Parsed[] | null {
  const result = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
rename = json.loads(sys.argv[1])
class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.nodes = []; self.frames = {}; self.open = None
    def add(self, node):
        self.nodes.append(node)
        if self.open: self.frames[self.open[0]].append(node)
    def handle_starttag(self, tag, attrs):
        frame = dict(attrs).get('data-doan-frame')
        if self.open and tag == self.open[1]: self.open[2] += 1
        elif frame is not None and not self.open: self.frames[frame] = []; self.open = [frame, tag, 0]
        self.add(['start', tag, sorted(attrs)])
    def handle_endtag(self, tag):
        self.add(['end', tag])
        if self.open and tag == self.open[1]:
            if self.open[2] == 0: self.open = None
            else: self.open[2] -= 1
    def handle_data(self, data):
        text = ' '.join(data.split())
        if text: self.add(['text', rename.get(text, text)])
out = []
for html in sys.argv[2:]:
    d = Document(); d.feed(html); out.append({'nodes': d.nodes, 'frames': d.frames})
print(json.dumps(out))
`, JSON.stringify(rename ? Object.fromEntries(Object.values(labels)) : {}), ...documents]);
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout);
}

export function labelsUpdated(ctx: Parameters<Checks>[0]): Check {
  const seed = ctx.seed(path), final = ctx.read(path);
  if (seed === null || final === null) return { id: "labels_updated", pass: false, detail: "canvas missing" };
  const [expected] = parse(ctx, [seed], true) ?? [];
  const [actual] = parse(ctx, [final]) ?? [];
  return { id: "labels_updated", pass: expected !== undefined && isDeepStrictEqual(expected.nodes, actual?.nodes), detail: expected === undefined || actual === undefined ? "parse failed" : "" };
}

// For each requested frame, an accepted update naming it that arrived while the frame still had its seed content.
export function updateBeforeEachFrameEdit(ctx: Parameters<Checks>[0]): Check {
  const updates = ctx.work().filter(entry => entry.response.ok && entry.request.action === "update" && entry.request.path === path);
  const seed = ctx.seed(path);
  const parsed = seed === null ? null : parse(ctx, [seed, ...updates.map(entry => entry.canvas ?? "")]);
  const frames = Object.fromEntries(Object.keys(labels).map(frame => [frame, parsed !== null && updates.some((entry, i) =>
    entry.request.frame === frame && typeof entry.canvas === "string" && frame in parsed[0].frames && isDeepStrictEqual(parsed[i + 1].frames[frame], parsed[0].frames[frame]))]));
  const times = updates.map(entry => Date.parse(entry.at));
  const intervalsSec = times.slice(1).map((time, i) => (time - times[i]) / 1000);
  return {
    id: "update_before_each_frame_edit",
    pass: Object.values(frames).every(Boolean),
    detail: JSON.stringify({ frames, intervalsSec, updates: updates.map(entry => ({ frame: entry.request.frame ?? null, note: entry.request.note ?? null, at: entry.at })) }),
  };
}

const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  return [
    ...workChecks(ctx),
    updateBeforeEachFrameEdit(ctx),
    noOpen(ctx),
    labelsUpdated(ctx),
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
