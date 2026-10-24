import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const lines = (ctx.read("answers.md") ?? "").trim().split(/\r?\n/);
  const changed = ctx.changedFiles();
  const expected = [
    ["billing_frame_count", "Billing frames: 11"],
    ["overdue_balance_token", "Overdue balance token: --color-warning"],
    ["receipt_implementation", "Receipt detail implementation: web/billing/receipt-detail.html"],
  ];
  return [
    ...expected.map(([id, answer], index) => ({ id, pass: lines[index] === answer, detail: `expected ${JSON.stringify(answer)}; received ${JSON.stringify(lines[index] ?? null)}` })),
    { id: "answer_format", pass: lines.length === 3, detail: `${lines.length} lines; expected exactly three` },
    { id: "only_answers_changed", pass: changed.length === 1 && changed[0] === "answers.md", detail: `changed: ${changed.join(", ") || "(none)"}` },
  ];
};
export default checks;
