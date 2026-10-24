import type { CheckContext } from "../../lib/types.ts";

interface Element { tag: string; attrs: Record<string, string>; text: string; parent: number; }
export interface Document { nodes: Element[]; css: string; }

// The fixtures are static HTML. HTMLParser handles entities, quote styles and nested labels.
export function inspect(ctx: CheckContext, html: string): Document {
  const result = ctx.run("python3.12", ["-c", String.raw`
import json, sys
from html.parser import HTMLParser
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes=[]; self.stack=[]; self.css=[]
    def handle_starttag(self, tag, attrs):
        self.nodes.append(dict(tag=tag, attrs=dict(attrs), text='', parent=self.stack[-1] if self.stack else -1))
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):
            self.stack.append(len(self.nodes)-1)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.nodes[self.stack[i]]['tag']==tag:
                self.stack=self.stack[:i]; break
    def handle_data(self, data):
        if self.stack and self.nodes[self.stack[-1]]['tag']=='style': self.css.append(data)
        for i in self.stack: self.nodes[i]['text']+=data
p=Parser(); p.feed(sys.argv[1]); print(json.dumps(dict(nodes=p.nodes,css='\n'.join(p.css))))
`, html]);
  if (result.code !== 0) throw new Error(`HTML inspection failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
export const element = (doc: Document, id: string) => doc.nodes.find(n => n.attrs["data-doan-id"] === id);
export const text = (node: Element | undefined) => (node?.text ?? "").replace(/\s+/g, " ").trim();

export function reviewState(ctx: CheckContext, canvas: string, ids: string[]) {
  const path = `.doan/comments/${canvas}.jsonl`;
  const original = ctx.seed(path) ?? "";
  const current = ctx.read(path) ?? "";
  const events = ctx.commentEvents(canvas);
  const read = ctx.doan(["comments", "--canvas", canvas]);
  return [
    { id: `${canvas}_history_preserved`, pass: current.startsWith(original), detail: "the original comment history remains an unchanged prefix" },
    { id: `${canvas}_agent_resolves_only`, pass: events.length <= ids.length && ids.every(id => events.filter(e => e.comment === id).length <= 1) && events.every(e => e.type === "resolve" && ids.includes(e.comment) && e.by?.kind === "agent" && typeof e.by?.name === "string" && /^[a-z0-9-]+$/.test(e.by.name)), detail: `expected agent resolve for ${ids.join(", ")}; new events: ${JSON.stringify(events)}` },
    { id: `${canvas}_comments_valid`, pass: read.code === 0 && read.json?.ok === true && read.json?.result?.warnings?.length === 0 && Array.isArray(read.json?.result?.comments) && !read.json.result.comments.some((c: { comment: string }) => events.some(e => e.comment === c.comment)), detail: JSON.stringify(read.json) },
  ];
}
export function clean(ctx: CheckContext) {
  const result = ctx.doan(["check"]);
  return { id: "doan_check_clean", pass: result.code === 0 && result.json?.result?.summary?.errors === 0, detail: `exit ${result.code}; ${JSON.stringify(result.json?.result?.summary)}` };
}
