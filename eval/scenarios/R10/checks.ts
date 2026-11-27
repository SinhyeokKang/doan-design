import { contentHash } from "../../lib/work.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const CANVAS = /^\.doan\/canvases\/[^/]+\.html$/;
const BOARD = /<meta\s+name="doan:width"\s+content="(\d+)"/;
// The screen is the frame and doan:width is the board (convention 3), so a board with padding around a frame declared
// 390 px wide is as right as a 390 px board whose frames fill it.
const FRAME_390 = /(?<![-\w])width\s*:\s*390px/;
// One distinctive line from each screen of the seed canvas (account.html).
const COPY = ["Sign-in email: ada@example.com", "Invoices are sent on the first of each month."];

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  // The canvas the turn made: a changed canvas file the seed did not have. The task asks for exactly one, and the
  // source canvas must stay as it was, so the only change is that one file.
  const made = changed.filter(path => CANVAS.test(path) && ctx.seed(path) === null);
  const target = made.length === 1 && changed.length === 1 ? made[0]! : null;
  // This task asks for one new canvas, so what counts is one accepted request: an agent
  // that is refused once and then asks correctly still handed off once. The refused ones stay in the detail.
  const requests = ctx.handoff();
  const accepted = requests.filter(e => e.response.ok);
  const once = accepted.length === 1;
  const forTarget = target === null ? [] : accepted.filter(e => e.request.path === target);
  // Per-request checks pass when no accepted request applies. The count check reports a missing handoff.
  const blank = accepted.filter(e => e.request.text.trim().length === 0);
  const text = (blank[0] ?? accepted[0])?.request.text ?? "";
  const html = target === null ? "" : ctx.read(target) ?? "";
  // The task's content, as the seed's own copy: both screens' text must be on the new canvas, in whatever frames.
  const missing = COPY.filter(copy => !html.includes(copy));
  const board = Number(BOARD.exec(html)?.[1] ?? NaN);
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_new_canvas_added", pass: target !== null, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "new_canvas_390_wide", pass: board === 390 || (board > 390 && FRAME_390.test(html)), detail: target === null ? "no new canvas" : `doan:width: ${/<meta\s+name="doan:width"\s+content="([^"]*)"/.exec(html)?.[1] ?? "(none)"}; a width: 390px declaration: ${FRAME_390.test(html)}` },
    { id: "new_canvas_has_both_screens", pass: target !== null && missing.length === 0, detail: target === null ? "no new canvas" : missing.length ? `missing from the new canvas: ${JSON.stringify(missing)}` : "the Profile and Billing copy of the seed are both there" },
    { id: "handoff_requested_once", pass: once, detail: `${accepted.length} accepted; v5 requests the app received: ${JSON.stringify(requests.map(e => ({ path: e.request.path, ok: e.response.ok, error: e.response.ok ? undefined : e.response.error.code })))}` },
    { id: "handoff_path_is_new_canvas", pass: accepted.every(e => e.request.path === target), detail: `requested ${JSON.stringify(accepted.map(e => e.request.path))}; new canvas ${JSON.stringify(target)}` },
    // The app judges a handoff when the turn ends, so the canvas has to be complete by the time it is asked for.
    // Judged over every accepted request for the new canvas.
    { id: "canvas_written_before_request", pass: forTarget.every(e => e.hashes[e.request.path] === contentHash(ctx.read(e.request.path))), detail: `hashes at the requests ${JSON.stringify(accepted.map(e => e.hashes))}` },
    // The start of the message (a blank one first) is in the detail so the judge sees what was delivered even when its
    // transcript cuts the command.
    { id: "handoff_message_not_empty", pass: blank.length === 0, detail: `message of ${[...text].length} characters: ${JSON.stringify([...text].slice(0, 300).join(""))}` },
    // The turn prompt tells the agent this conversation is inside Doan, so it neither offers nor runs `doan open`.
    noOpen(ctx),
  ];
};
export default checks;
