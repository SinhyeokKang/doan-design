import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const canvas = ctx.read("design/hello.html") ?? "";
  const changed = ctx.changedFiles();
  const events = ctx.commentEvents("hello");
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "heading_retitled", pass: canvas.includes('<h1 data-doan-id="title">Hello, doan</h1>'), detail: "the selected h1 reads \"Hello, doan\"" },
    { id: "lede_unchanged", pass: canvas.includes('<p data-doan-id="lede">A canvas for the runner self-test.</p>'), detail: "the unselected paragraph is untouched" },
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === "design/hello.html", detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "asked_doan_active", pass: ctx.transcript.includes("doan active"), detail: "the transcript shows `doan active`" },
    { id: "no_comment_events", pass: events.length === 0, detail: `${events.length} new comment events` },
  ];
};
export default checks;
