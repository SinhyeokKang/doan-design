import { acceptedRequests, requestSummary } from "../../lib/handoff.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const SOURCE = ".doan/canvases/account.html";
const TARGET = ".doan/canvases/invoices.html";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const html = ctx.read(SOURCE) ?? "";
  // As in R14, the count names the command and the other checks judge every accepted request of either.
  const accepted = acceptedRequests(ctx);
  const sends = ctx.send().filter(e => e.response.ok);
  const blank = accepted.filter(e => e.request.text.trim().length === 0);
  const text = (blank[0] ?? sends[0])?.request.text ?? "";
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    // The `invoices` copy is the receiving conversation's to update: this turn edits the source canvas and nothing else.
    { id: "only_source_edited", pass: changed.length === 1 && changed[0] === SOURCE, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "billing_note_updated", pass: /data-doan-id="billing-note"[^>]*>[^<]*5th[^<]*</.test(html), detail: `the Billing note in ${SOURCE}` },
    { id: "send_requested_once", pass: sends.length === 1, detail: `${sends.length} accepted doan send request(s); requests the app received: ${requestSummary(ctx)}` },
    { id: "request_target_is_invoices", pass: accepted.every(e => e.request.path === TARGET), detail: `accepted ${JSON.stringify(accepted.map(e => e.request.path))}; expected only ${TARGET}` },
    { id: "send_message_not_empty", pass: blank.length === 0, detail: `message of ${[...text].length} characters: ${JSON.stringify([...text].slice(0, 300).join(""))}` },
    { id: "send_message_names_the_change", pass: sends.every(e => e.request.text.includes("5th")), detail: `the new date (the 5th) in each accepted send message` },
    noOpen(ctx),
  ];
};
export default checks;
