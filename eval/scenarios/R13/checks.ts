import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandWords } from "../../lib/transcript.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const turn = JSON.parse(readFileSync(join(import.meta.dirname, "turn.json"), "utf8"));
// The canvas the person anchored; the text never names it, so only the anchor's path leads to it.
const REFERENCE: string = turn.anchors[0].canvas.path;
const NAME = REFERENCE.slice(REFERENCE.lastIndexOf("/") + 1);
const CANVAS = /^\.doan\/canvases\/[^/]+\.html$/;
// Copy only the anchored canvas has; the other seed canvas carries a different brand, price and address.
const CARRIED = ["Northwind Cloud", "$24", "support@northwind.example"];
const DECOY = ["Northwind Classic", "$19", "help@classic.example"];

// A Claude Read of the file, or a non-doan shell command whose words contain its name (a path inside a `python -c`
// script counts). A heredoc body is not a word, so an interpreter fed one counts when the command text names the file.
// A `doan` call that names the path (check, handoff) does not show its content to the agent.
const INTERPRETER = /(?:^|\/)(?:python[\d.]*|node|ruby|perl)$/;
function readsReference(ctx: Parameters<Checks>[0]): string[] {
  const hits: string[] = [];
  for (const line of ctx.transcript.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== "assistant") continue;
    for (const block of event.message?.content ?? []) {
      const path = block?.type === "tool_use" && block.name === "Read" ? block.input?.file_path : undefined;
      if (typeof path === "string" && (path === REFERENCE || path.endsWith(`/${REFERENCE}`))) hits.push(`Read ${path}`);
    }
  }
  for (const command of ctx.calls.commands) {
    const runs = commandWords(command).filter(words => !/(?:^|\/)doan$/.test(words[0] ?? ""));
    const named = runs.some(words => words.slice(1).some(w => w.includes(NAME))) ||
      (runs.some(words => INTERPRETER.test(words[0] ?? "")) && command.includes(NAME));
    if (!named) continue;
    const at = command.indexOf(NAME);
    hits.push(at === -1 ? command.slice(0, 160) : command.slice(Math.max(0, at - 80), at + NAME.length + 80));
  }
  return hits;
}

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const made = changed.filter(path => CANVAS.test(path) && ctx.seed(path) === null);
  const target = made.length === 1 && changed.length === 1 ? made[0]! : null;
  const html = target === null ? "" : ctx.read(target) ?? "";
  const missing = CARRIED.filter(copy => !html.includes(copy));
  const decoy = DECOY.filter(copy => html.includes(copy));
  const reads = readsReference(ctx);
  const reference = ctx.read(REFERENCE);
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "anchor_path_read", pass: reads.length > 0, detail: reads.length ? `reads of ${REFERENCE}: ${JSON.stringify(reads.slice(0, 3))}` : `no Read or shell command named ${REFERENCE}` },
    { id: "reference_unchanged", pass: reference !== null && reference === ctx.seed(REFERENCE), detail: reference === null ? `${REFERENCE} is gone` : reference === ctx.seed(REFERENCE) ? "byte-identical to the seed" : `${REFERENCE} changed` },
    { id: "only_new_canvas_added", pass: target !== null, detail: `changed: ${changed.join(", ") || "(none)"}` },
    // The anchored canvas's brand, Team price and support address on the new canvas, and none of the other canvas's.
    { id: "new_canvas_from_reference", pass: target !== null && missing.length === 0 && decoy.length === 0, detail: target === null ? "no new canvas" : `missing ${JSON.stringify(missing)}; from the other canvas ${JSON.stringify(decoy)}` },
    noOpen(ctx),
  ];
};
export default checks;
