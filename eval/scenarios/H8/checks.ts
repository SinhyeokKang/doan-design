import type { Checks } from "../../lib/types.ts";
import { finalAnswer } from "../../lib/answer.ts";

const checks: Checks = ctx => {
  const path = ".doan/comments/billing.jsonl";
  const seed = ctx.seed(path), current = ctx.read(path);
  const answer = finalAnswer(ctx.transcript);
  const changed = ctx.changedFiles();
  // The seed is ASCII, so exact text equality also requires identical bytes.
  // Whether the answer reports the unattached comments belongs to the judge.
  return [
    { id: "orphan_file_unchanged", pass: seed !== null && current === seed, detail: `${path}: ${seed !== null && current === seed ? "unchanged" : "missing or changed"}` },
    { id: "repo_unchanged", pass: changed.length === 0, detail: `changed in the repo: ${changed.join(", ") || "(none)"}` },
    { id: "final_answer", pass: answer.trim() !== "", detail: `final answer: ${answer || "(none)"}` },
  ];
};
export default checks;
