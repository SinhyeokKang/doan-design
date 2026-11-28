import { noHandoff } from "../../lib/handoff.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const WORKED_ON = ".doan/canvases/invoices.html";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const html = ctx.read(WORKED_ON) ?? "";
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_invoices_edited", pass: changed.length === 1 && changed[0] === WORKED_ON, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "invoices_note_updated", pass: /data-doan-id="invoices-note"[^>]*>[^<]*5th[^<]*</.test(html), detail: `the note in ${WORKED_ON}` },
    // The message asks for no forwarding, and a turn it started never sends back to the conversation it came from, so
    // any handoff or send is the failure; the fake app would accept a send to the account canvas, since only the app's
    // judgement at the turn's end can tell it is a return.
    noHandoff(ctx),
    noOpen(ctx),
  ];
};
export default checks;
