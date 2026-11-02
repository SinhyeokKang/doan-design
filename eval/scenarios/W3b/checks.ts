import type { Check, Checks } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";

const path = ".doan/canvases/profile.html";

// The seed with "Save" renamed to "Save profile" equals the final canvas, tag for tag and attribute for attribute.
export function buttonLabelUpdated(ctx: Parameters<Checks>[0], path: string): Check {
  const seed = ctx.seed(path);
  const final = ctx.read(path);
  const label = ctx.run("python3.12", ["-I", "-c", `
import json, sys
from html.parser import HTMLParser
class Document(HTMLParser):
    def __init__(self, update=False):
        super().__init__(convert_charrefs=True); self.nodes = []; self.update = update
    def handle_starttag(self, tag, attrs):
        self.nodes.append(['start', tag, sorted(attrs)])
    def handle_endtag(self, tag):
        self.nodes.append(['end', tag])
    def handle_data(self, data):
        text = ' '.join(data.split())
        if text: self.nodes.append(['text', 'Save profile' if self.update and text == 'Save' else text])
before = Document(True); before.feed(sys.argv[1])
after = Document(); after.feed(sys.argv[2])
print(json.dumps(before.nodes == after.nodes))
`, seed ?? "", final ?? ""]);
  return { id: "button_label_updated", pass: seed !== null && final !== null && final !== seed && label.code === 0 && label.stdout.trim() === "true", detail: label.code === 0 ? label.stdout.trim() : label.stderr };
}

const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  return [
    ...workChecks(ctx),
    noOpen(ctx),
    buttonLabelUpdated(ctx, path),
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
