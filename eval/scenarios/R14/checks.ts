import { acceptedRequests, requestSummary } from "../../lib/handoff.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const SOURCE = ".doan/canvases/account.html";
const TARGET = ".doan/canvases/invoices.html";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const html = ctx.read(SOURCE) ?? "";
  // Only the requests the app accepted count. Which command asked is the count check's alone: a `doan send` in place of
  // the handoff leaves no accepted handoff and nothing else fails; the target and message checks judge every accepted
  // request of either command, so one wrong request is one failed check.
  const accepted = acceptedRequests(ctx);
  const handoffs = ctx.handoff().filter(e => e.response.ok);
  const blank = accepted.filter(e => e.request.text.trim().length === 0);
  const text = (blank[0] ?? handoffs[0])?.request.text ?? "";
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    // The `invoices` work is for the next conversation: this turn edits the source canvas and nothing else.
    { id: "only_source_edited", pass: changed.length === 1 && changed[0] === SOURCE, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "save_button_renamed", pass: /<button\b[^>]*data-doan-id="save-profile"[^>]*>\s*Save changes\s*<\/button>/.test(html), detail: `the Save button in ${SOURCE}` },
    { id: "handoff_requested_once", pass: handoffs.length === 1, detail: `${handoffs.length} accepted doan handoff request(s); requests the app received: ${requestSummary(ctx)}` },
    { id: "request_target_is_invoices", pass: accepted.every(e => e.request.path === TARGET), detail: `accepted ${JSON.stringify(accepted.map(e => e.request.path))}; expected only ${TARGET}` },
    { id: "handoff_message_not_empty", pass: blank.length === 0, detail: `message of ${[...text].length} characters: ${JSON.stringify([...text].slice(0, 300).join(""))}` },
    { id: "handoff_message_names_the_wording", pass: handoffs.every(e => e.request.text.trim().length === 0 || e.request.text.includes("Save changes")), detail: `the new Save label “Save changes” in each accepted, non-empty handoff message` },
    noOpen(ctx),
  ];
};
export default checks;
