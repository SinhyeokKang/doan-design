import { contentHash } from "../../lib/work.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const CANVAS = /^\.doan\/canvases\/[^/]+\.html$/;
const WIDTH = /<meta\s+name="doan:width"\s+content="390"/;
// One distinctive line from each screen of the seed canvas (account.html).
const COPY = ["Sign-in email: ada@example.com", "Invoices are sent on the first of each month."];

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  // The canvas the turn made: a changed canvas file the seed did not have. The task asks for exactly one, and the
  // source canvas must stay as it was, so the only change is that one file.
  const made = changed.filter(path => CANVAS.test(path) && ctx.seed(path) === null);
  const target = made.length === 1 && changed.length === 1 ? made[0]! : null;
  // The app takes one handoff per turn and a refusal does not spend it, so what counts is the accepted request: an agent
  // that is refused once and then asks correctly still handed off once. The refused ones stay in the detail.
  const requests = ctx.handoff();
  const accepted = requests.filter(e => e.response.ok);
  const asked = accepted[0];
  const once = accepted.length === 1;
  const text = asked?.request.text ?? "";
  const html = target === null ? "" : ctx.read(target) ?? "";
  // The task's content, as the seed's own copy: both screens' text must be on the new canvas, in whatever frames.
  const missing = COPY.filter(copy => !html.includes(copy));
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_new_canvas_added", pass: target !== null, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "new_canvas_390_wide", pass: WIDTH.test(html), detail: target === null ? "no new canvas" : `doan:width: ${/<meta\s+name="doan:width"\s+content="([^"]*)"/.exec(html)?.[1] ?? "(none)"}` },
    { id: "new_canvas_has_both_screens", pass: target !== null && missing.length === 0, detail: target === null ? "no new canvas" : missing.length ? `missing from the new canvas: ${JSON.stringify(missing)}` : "the Profile and Billing copy of the seed are both there" },
    { id: "handoff_requested_once", pass: once, detail: `${accepted.length} accepted; v5 requests the app received: ${JSON.stringify(requests.map(e => ({ path: e.request.path, ok: e.response.ok, error: e.response.ok ? undefined : e.response.error.code })))}` },
    { id: "handoff_path_is_new_canvas", pass: target !== null && asked?.request.path === target, detail: `requested ${JSON.stringify(asked?.request.path ?? null)}; new canvas ${JSON.stringify(target)}` },
    // The app judges a handoff when the turn ends, so the canvas has to be complete by the time it is asked for.
    { id: "canvas_written_before_request", pass: target !== null && once && asked!.hashes[target] === contentHash(ctx.read(target)), detail: `hash at the request ${JSON.stringify(asked?.hashes ?? null)}` },
    // The start of the message is in the detail so the judge sees what was delivered even when its transcript cuts the command.
    { id: "handoff_message_not_empty", pass: text.trim().length > 0, detail: `message of ${[...text].length} characters: ${JSON.stringify([...text].slice(0, 300).join(""))}` },
    // The turn prompt tells the agent this conversation is inside Doan, so it neither offers nor runs `doan open`.
    noOpen(ctx),
  ];
};
export default checks;
