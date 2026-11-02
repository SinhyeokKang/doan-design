import type { Checks } from "../../lib/types.ts";
import { finalAnswer } from "../../lib/answer.ts";
import { clean, element, inspect, reviewState, text } from "../R1/inspect.ts";

export const UPGRADE = "cmt_3f6b1c2e-8a4d-4c71-9e2f-0b5d7a9c1e01";
export const RENEWAL = "cmt_7a2d9e40-1c5b-4f83-a6d2-4e8b0c3f5a02";
export const QUESTION = "cmt_b8e41f73-2d6c-4a95-8b17-9c3e5f0d2b03";
export const HEADING = "cmt_d1c5a8b6-4e2f-4b0a-9c73-6f1e8d2a4c04";
export const LISTED = [UPGRADE, RENEWAL, QUESTION];

const checks: Checks = ctx => {
  const path = ".doan/canvases/billing.html";
  const doc = inspect(ctx, ctx.read(path) ?? "");
  const seed = inspect(ctx, ctx.seed(path) ?? "");
  // Applied is read from the canvas, so a resolve without the edit never counts as applied.
  const applied = [
    ...(text(element(doc, "upgrade")) === "Upgrade plan" ? [UPGRADE] : []),
    ...(text(element(doc, "renewal")) === "Renews on the 1st of each month" ? [RENEWAL] : []),
  ];
  const resolved = [...new Set(ctx.commentEvents("billing").filter(e => e.type === "resolve").map(e => e.comment))].sort();
  const open: string[] = (ctx.doan(["comments", "--canvas", "billing"]).json?.result?.comments ?? []).map((c: { comment: string }) => c.comment);
  const unchanged = (id: string) => text(element(doc, id)) === text(element(seed, id)) && !!element(doc, id);
  const answer = finalAnswer(ctx.transcript);
  const changed = ctx.changedFiles();
  return [
    clean(ctx),
    { id: "listed_changes_applied", pass: applied.length === 2, detail: `upgrade: ${text(element(doc, "upgrade"))}; renewal: ${text(element(doc, "renewal"))}` },
    { id: "resolved_equals_applied", pass: JSON.stringify(resolved) === JSON.stringify([...applied].sort()), detail: `resolved ${resolved.join(", ") || "(none)"}; applied ${applied.join(", ") || "(none)"}` },
    { id: "question_left_open", pass: unchanged("cancel-plan") && open.includes(QUESTION), detail: `cancel-plan: ${text(element(doc, "cancel-plan"))}; open: ${open.includes(QUESTION)}` },
    { id: "unlisted_comment_untouched", pass: unchanged("heading") && open.includes(HEADING), detail: `heading: ${text(element(doc, "heading"))}; open: ${open.includes(HEADING)}` },
    ...reviewState(ctx, "billing", [UPGRADE, RENEWAL]),
    { id: "final_answer_reports_listed", pass: LISTED.every(id => answer.includes(id)), detail: `missing ids: ${LISTED.filter(id => !answer.includes(id)).join(", ") || "(none)"}; final answer: ${answer}` },
    { id: "scope_preserved", pass: changed.every(p => p === path || p === ".doan/comments/billing.jsonl"), detail: `changed: ${changed.join(", ")}` },
  ];
};
export default checks;
