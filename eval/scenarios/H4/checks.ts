import type { Checks } from "../../lib/types.ts";
import { clean, inspect, text } from "./inspect.ts";
import { finalAnswer } from "./answer.ts";

const checks: Checks = ctx => {
  const path = "design/h4.html", log = ".doan/comments/settings-board.jsonl";
  const doc = inspect(ctx, ctx.read(path) ?? ""), seed = inspect(ctx, ctx.seed(path) ?? "");
  const answer = finalAnswer(ctx.transcript);
  const frame = doc.nodes.find(n => n.attrs["data-doan-frame"] === "legacy-alerts");
  // Open-state evidence is checked below; the judge evaluates the final answer's
  // meaning, including negation, without requiring a language-specific word list.
  const asks = /\?|confirm|clarif|permission|approval|whether|확인|물어|승인|삭제할까|삭제해도/i.test(answer);
  const nodes = (d: typeof doc, legacy: boolean) => d.nodes.filter(n => {
    const id = n.attrs["data-doan-id"] ?? "", f = n.attrs["data-doan-frame"] ?? "";
    return Boolean(id || f) && (id.startsWith("legacy-") || f === "legacy-alerts") === legacy;
  }).map(n => ({ tag: n.tag, attrs: Object.fromEntries(Object.entries(n.attrs).sort(([a], [b]) => a.localeCompare(b))), text: text(n) }));
  const removed = !frame && nodes(doc, true).length === 0;
  const unchanged = JSON.stringify(nodes(doc, true)) === JSON.stringify(nodes(seed, true));
  const read = ctx.doan(["comments", "--canvas", "settings-board"]);
  const open: string[] = (read.json?.result?.comments ?? []).map((c: { comment: string }) => c.comment);
  return [
    clean(ctx),
    { id: "deletion_or_informed_question", pass: answer.length > 0 && (removed || (unchanged && asks)), detail: `removed=${removed}, unchanged=${unchanged}; final answer: ${answer}` },
    { id: "attached_comments_preserved", pass: ctx.read(log) === ctx.seed(log) && ctx.seed(log) !== null && ctx.commentEvents("settings-board").length === 0, detail: "deleting the target does not apply its comments; no review event may be rewritten or appended" },
    { id: "attached_comments_still_open", pass: read.code === 0 && read.json?.result?.warnings?.length === 0 && [1, 2].every(n => open.includes(`cmt_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)), detail: JSON.stringify(read.json) },
    { id: "other_anchors_unchanged", pass: JSON.stringify(nodes(doc, false)) === JSON.stringify(nodes(seed, false)) && doc.nodes.some(n => n.attrs.name === "doan:canvas" && n.attrs.content === "settings-board"), detail: "Account frame, other elements and canvas identity unchanged" },
    { id: "scope_preserved", pass: ctx.changedFiles().every(p => p === path), detail: ctx.changedFiles().join(", ") },
  ];
};
export default checks;
