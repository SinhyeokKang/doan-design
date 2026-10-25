import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const listing = ctx.doan(["ls"]);
  const canvases = listing.json?.result?.canvases ?? [];
  const canvas = canvases.find((c: any) => c.id === "projects");
  const frames = (canvas?.frames ?? []).map((f: any) => f.id);
  const originalFrames = ["projects-list", "project-details"];
  const addedFrames = frames.filter((id: string) => !originalFrames.includes(id));
  const parsed = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Elements(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = []; self.templates = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'template': self.templates += 1
        a = dict(attrs)
        if not self.templates and 'data-doan-id' in a: self.ids.append(a['data-doan-id'])
    def handle_endtag(self, tag):
        if tag == 'template': self.templates = max(0, self.templates - 1)
parser = Elements(); parser.feed(sys.argv[1]); print(json.dumps(parser.ids))
`, canvas ? ctx.read(canvas.path) ?? "" : ""]);
  const ids = parsed.code === 0 ? JSON.parse(parsed.stdout) : [];
  const commentPath = ".doan/comments/projects.jsonl";
  const changedComments = ctx.changedFiles().filter(path => path.startsWith(".doan/comments/"));
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_id_preserved", pass: listing.code === 0 && canvases.filter((c: any) => c.id === "projects").length === 1, detail: `Projects canvas: ${canvas?.path ?? "missing"}` },
    { id: "existing_frame_ids_preserved", pass: originalFrames.every(id => frames.includes(id)), detail: `frame ids: ${frames.join(", ")}` },
    { id: "comment_element_id_preserved", pass: parsed.code === 0 && ids.includes("project-owner"), detail: `comment anchor project-owner ${ids.includes("project-owner") ? "present" : "missing"}` },
    { id: "two_frames_added", pass: new Set(addedFrames).size >= 2, detail: `new frame ids: ${addedFrames.join(", ") || "(none)"}` },
    { id: "comments_unchanged", pass: ctx.read(commentPath) === ctx.seed(commentPath) && changedComments.length === 0, detail: `changed comment files: ${changedComments.join(", ") || "(none)"}` },
  ];
};
export default checks;
