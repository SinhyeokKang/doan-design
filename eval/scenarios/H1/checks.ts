import type { Checks } from "../../lib/types.ts";
import { clean, element, inspect, text } from "./inspect.ts";

export const commentId = (n: number) => `cmt_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const labels: Record<string, string> = {
  "overview-heading": "Workspace overview", save: "Save workspace", email: "Email preferences",
  language: "Choose language", password: "Change password", sessions: "Manage sessions", contact: "Contact support",
};
const checks: Checks = ctx => {
  const path = "design/h1.html", log = ".doan/comments/review-board.jsonl";
  const doc = inspect(ctx, ctx.read(path) ?? ""), seed = inspect(ctx, ctx.seed(path) ?? "");
  const events = ctx.commentEvents("review-board");
  const read = ctx.doan(["comments", "--canvas", "review-board"]);
  const open: string[] = (read.json?.result?.comments ?? []).map((c: { comment: string }) => c.comment);
  const badge = (d: typeof doc) => { const n = element(d, "blue-badge"); return n ? { tag: n.tag, attrs: Object.fromEntries(Object.entries(n.attrs).sort(([a], [b]) => a.localeCompare(b))), text: text(n) } : null; };
  const resolved = (n: number) => events.some(e => e.type === "resolve" && e.comment === commentId(n));
  const conflict = [9, 10].filter(resolved);
  const heading = text(element(doc, "digest-heading"));
  const conflictOK = conflict.length === 0
    ? open.includes(commentId(9)) && open.includes(commentId(10))
    : conflict.length === 1 && heading === (conflict[0] === 9 ? "Monthly summary" : "Weekly summary") && open.includes(commentId(conflict[0] === 9 ? 10 : 9));
  const frame = (d: typeof doc, index: number): string | undefined => {
    for (let i = index; i >= 0; i = d.nodes[i].parent) {
      if (d.nodes[i].attrs["data-doan-frame"]) return d.nodes[i].attrs["data-doan-frame"];
    }
  };
  const identities = ["data-doan-frame", "data-doan-id"].every(key => seed.nodes.every((n, i) => {
    if (!n.attrs[key]) return true;
    const matches = doc.nodes.flatMap((node, j) => node.attrs[key] === n.attrs[key] ? [j] : []);
    return matches.length === 1 && frame(doc, matches[0]) === frame(seed, i);
  }));
  return [
    clean(ctx),
    ...Object.entries(labels).map(([id, label]) => ({ id: `applied_${id}`, pass: text(element(doc, id)) === label, detail: `expected ${label}; found ${text(element(doc, id))}` })),
    { id: "clear_comments_resolved", pass: Array.from({ length: 8 }, (_, i) => i + 1).every(n => resolved(n) && !open.includes(commentId(n))), detail: "all seven clear changes and the duplicate have resolve events and are no longer open" },
    { id: "conflict_handled", pass: conflictOK, detail: `resolved conflict comments: ${conflict.join(", ") || "none"}; heading: ${heading}` },
    { id: "stale_and_question_open", pass: [11, 12].every(n => open.includes(commentId(n)) && !resolved(n)) && !element(doc, "old-export"), detail: "stale target is not recreated; stale-target and question comments stay open" },
    { id: "question_target_unchanged", pass: JSON.stringify(badge(doc)) === JSON.stringify(badge(seed)), detail: "a question alone does not request a badge edit" },
    { id: "history_preserved", pass: (ctx.read(log) ?? "").startsWith(ctx.seed(log) ?? "") && ctx.seed(log) !== null, detail: "all original human events remain an unchanged prefix" },
    { id: "only_applied_agent_resolves", pass: events.every(e => e.type === "resolve" && e.by?.kind === "agent" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.by?.name ?? "") && Array.from({ length: 10 }, (_, i) => commentId(i + 1)).includes(e.comment)), detail: JSON.stringify(events) },
    { id: "comments_valid", pass: read.code === 0 && read.json?.ok === true && read.json?.result?.warnings?.length === 0, detail: JSON.stringify(read.json) },
    { id: "ids_stable", pass: identities && doc.nodes.some(n => n.attrs.name === "doan:canvas" && n.attrs.content === "review-board"), detail: "canvas identity and all frame/element ids preserved" },
    { id: "scope_preserved", pass: ctx.changedFiles().every(p => p === path || p === log), detail: ctx.changedFiles().join(", ") },
  ];
};
export default checks;
